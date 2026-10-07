/**
 * Server journal model: a port of the RTX5 web terminal Journal
 * (`JournalTab.tsx`, `journalApi.normalizeJournalResponse`,
 * `orderLatencyTelemetry.ts`). Pure functions only, so every rule below is
 * covered by unit tests against the web terminal's vectors.
 */
import type {
  OrderLatencySample,
  OrderTerminalStatus,
} from '../../../../state/orderLatencyTelemetry';

// ---------------------------------------------------------------------------
// Data model
// ---------------------------------------------------------------------------

export type JournalLogEntry = {
  id?: string | number;
  /** Order latency in ms. Absent means unknown; never substitute 0. */
  latency_ms?: number;
  client_order_id?: string | number;
  request_id?: string | number;
  order_ticket?: string | number;
  position_ticket?: string | number;
  /** 0 = OK; any other value is an error. */
  code: number;
  code_text: string;
  type: number;
  type_text: string;
  /** Unix time in SECONDS. */
  datetime: number;
  source: string;
  message: string;
};

export type JournalResponse = { count: number; logs: JournalLogEntry[] };

export const JOURNAL_TYPES = [
  { value: 0, label: 'All' },
  { value: 1, label: 'Config' },
  { value: 2, label: 'System' },
  { value: 3, label: 'Network' },
  { value: 4, label: 'History' },
  { value: 5, label: 'User' },
  { value: 6, label: 'Trade' },
  { value: 7, label: 'API' },
  { value: 8, label: 'Notify' },
] as const;

/** Dropdown order: Full (default), Standard, Errors. */
export const JOURNAL_MODES = [
  { value: 2, label: 'Full' },
  { value: 0, label: 'Standard' },
  { value: 1, label: 'Errors' },
] as const;

/** Rolling windows back from now; 0 = no time filter. "Today" is rolling 24 h. */
export const JOURNAL_TIME_RANGES = [
  { label: '1h', hours: 1 },
  { label: '2h', hours: 2 },
  { label: '3h', hours: 3 },
  { label: '6h', hours: 6 },
  { label: '12h', hours: 12 },
  { label: 'Today', hours: 24 },
  { label: 'Week', hours: 168 },
  { label: 'Month', hours: 720 },
  { label: 'All', hours: 0 },
] as const;

export const JOURNAL_DEFAULT_MODE = 2;
export const JOURNAL_DEFAULT_TYPE = 0;
export const JOURNAL_TRADE_TYPE = 6;
export const JOURNAL_ERRORS_MODE = 1;
export const TERMINAL_SAMPLE_LIMIT = 200;

// ---------------------------------------------------------------------------
// Normalization (§3.4, §3.5)
// ---------------------------------------------------------------------------

type PlainObject = Record<string, unknown>;

const isPlainObject = (value: unknown): value is PlainObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const num = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const text = (value: unknown): string => (value === null || value === undefined ? '' : String(value));

const optLatency = (value: unknown): number | undefined => {
  let parsed: number;
  if (typeof value === 'number') {
    parsed = value;
  } else if (typeof value === 'string' && value.trim() !== '') {
    parsed = Number(value);
  } else {
    return undefined;
  }
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

const optId = <K extends string>(key: K, value: unknown): Partial<Record<K, string | number>> => {
  if (typeof value === 'string') return { [key]: value } as Record<K, string>;
  if (typeof value === 'number' && Number.isFinite(value)) return { [key]: value } as Record<K, number>;
  return {};
};

const GATEWAY_RESULT = /^(Order\s+(?:buy|sell)\s+\S+\s+\S+\s+filled|Close\s+(?:buy|sell)\s+\S+\s+ticket\s+\S+\s+profit\s+\S+|Modify\s+\S+\s+ticket\s+\S+)\s+in\s+(\d+(?:\.\d+)?)ms$/i;
const GATEWAY_TIMING = /^(Timing\s+(?:buy|sell)\s+\S+\s+\S+):\s+.*\btotal\s+(\d+(?:\.\d+)?)ms$/i;

/**
 * Moves a Gateway trade duration from the message into latency. Only the two
 * anchored shapes qualify, so a duration inside a rejection (quote age) is
 * never shown as order latency.
 */
export function gatewayTiming(
  typeText: string,
  source: string,
  message: string,
): { message: string; latencyMs: number } | undefined {
  if (typeText.trim().toLowerCase() !== 'trade' || source.trim().toLowerCase() !== 'gateway') {
    return undefined;
  }
  const match = GATEWAY_RESULT.exec(message) ?? GATEWAY_TIMING.exec(message);
  return match ? { message: match[1], latencyMs: Number(match[2]) } : undefined;
}

export function normalizeJournalResponse(raw: unknown): JournalResponse {
  const payload = isPlainObject(raw) && !Array.isArray(raw.logs) && isPlainObject(raw.data)
    ? raw.data
    : raw;
  if (!isPlainObject(payload) || !Array.isArray(payload.logs)) {
    throw new Error('Invalid Journal API response');
  }

  const logs = payload.logs.filter(isPlainObject).map((log): JournalLogEntry => {
    const typeText = text(log.type_text);
    const source = text(log.source);
    const message = text(log.message);
    const gateway = gatewayTiming(typeText, source, message);
    // The canonical field wins over a parsed suffix.
    const latency = optLatency(log.latency_ms) ?? gateway?.latencyMs;
    return {
      ...optId('id', log.id),
      ...(latency !== undefined ? { latency_ms: latency } : {}),
      ...optId('client_order_id', log.client_order_id),
      ...optId('request_id', log.request_id),
      ...optId('order_ticket', log.order_ticket),
      ...optId('position_ticket', log.position_ticket),
      code: num(log.code),
      code_text: text(log.code_text),
      type: num(log.type),
      type_text: typeText,
      datetime: num(log.datetime),
      source,
      // The suffix is removed even when the canonical latency won.
      message: gateway?.message ?? message,
    };
  });
  const count = Number(payload.count);
  return { count: Number.isFinite(count) ? count : logs.length, logs };
}

// ---------------------------------------------------------------------------
// Formatting (§9.3, §9.6)
// ---------------------------------------------------------------------------

const pad2 = (value: number) => String(value).padStart(2, '0');

/** Device-local "MM/DD/YY HH:mm:ss"; `datetime` is in seconds. */
export function formatJournalDateTime(datetime: number): string {
  if (!datetime) return '—';
  const date = new Date(datetime * 1000);
  if (Number.isNaN(date.getTime())) return '—';
  return `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}/${pad2(date.getFullYear() % 100)} `
    + `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

/** Two decimals max, trailing zeros dropped, JS toFixed rounding; unknown → "—". */
export function formatLatency(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '—';
  const rounded = Number(value.toFixed(2));
  return `${Object.is(rounded, -0) ? 0 : rounded} ms`;
}

export function formatVolume(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(Number(value.toFixed(8))) : '';
}

export const formatJournalCode = (log: JournalLogEntry): string =>
  log.code_text || (log.code === 0 ? 'OK' : String(log.code));

export const formatJournalType = (log: JournalLogEntry): string => log.type_text || 'All';

export type JournalTypeTone = 'strong' | 'muted' | 'faint';

/** System / User / Trade are strong; All is faint; everything else muted. */
export function journalTypeTone(log: JournalLogEntry): JournalTypeTone {
  const label = formatJournalType(log).trim().toLowerCase();
  if (label === 'system' || label === 'user' || label === 'trade') return 'strong';
  if (label === 'all') return 'faint';
  return 'muted';
}

const sanitizeCell = (value: string) => value.replace(/[\t\r\n]+/g, ' ').trim();

export const JOURNAL_TSV_HEADER = 'Time\tCode\tType\tSource\tLatency\tMessage';

export function buildJournalTsv(rows: readonly JournalLogEntry[]): string {
  const lines = rows.map((log) => [
    formatJournalDateTime(log.datetime),
    formatJournalCode(log),
    formatJournalType(log),
    log.source,
    formatLatency(log.latency_ms),
    log.message,
  ].map((cell) => sanitizeCell(cell)).join('\t'));
  return [JOURNAL_TSV_HEADER, ...lines].join('\n');
}

/** Stable, unique row keys; message text is never used (identical fills can share a second). */
export function journalRowKeys(rows: readonly JournalLogEntry[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((log, index) => {
    const base = String(
      log.id ?? log.client_order_id ?? log.request_id ?? log.position_ticket ?? log.order_ticket
        ?? `${log.datetime}-${log.code}-${log.type}-${index}`,
    );
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}#${count}`;
  });
}

// ---------------------------------------------------------------------------
// Local "Terminal" rows and merge (§6)
// ---------------------------------------------------------------------------

const TERMINAL_STATUSES: readonly OrderTerminalStatus[] = ['filled', 'rejected', 'expired', 'failed'];

export function scopedPlacementTerminalSamples(
  samples: readonly OrderLatencySample[],
  scope: string,
): OrderLatencySample[] {
  const seen = new Set<string>();
  return samples
    .filter((sample) => sample.phase === 'placement_terminal'
      && sample.sessionScope === scope
      && sample.terminalStatus !== undefined
      && TERMINAL_STATUSES.includes(sample.terminalStatus)
      && typeof sample.totalMs === 'number'
      && Number.isFinite(sample.totalMs)
      && sample.totalMs >= 0)
    .sort((a, b) => b.sequence - a.sequence)
    .filter((sample) => {
      // Latest sample per order attempt only.
      const key = sample.clientOrderId
        ? `${sample.sessionScope}:${sample.clientOrderId}`
        : `sequence:${sample.sequence}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

const STATUS_PREFIX: Record<OrderTerminalStatus, string> = {
  filled: 'Order executed',
  rejected: 'Order rejected',
  expired: 'Order expired',
  failed: 'Order failed',
};

export function localJournalRow(sample: OrderLatencySample): JournalLogEntry {
  const status = sample.terminalStatus ?? 'failed';
  const subject = [sample.side, sample.symbol, formatVolume(sample.volume)].filter(Boolean).join(' ');
  const details = [sample.errorCode, sample.errorMessage]
    .filter((value, index, all): value is string =>
      typeof value === 'string' && value.trim() !== '' && all.indexOf(value) === index)
    .join(': ');
  const filled = status === 'filled';
  return {
    id: `local-order-${sample.clientOrderId || sample.traceId}-${sample.sequence}`,
    ...(sample.clientOrderId ? { client_order_id: sample.clientOrderId } : {}),
    latency_ms: sample.totalMs,
    code: filled ? 0 : 1,
    code_text: filled ? 'OK' : (sample.errorCode || status.toUpperCase()),
    type: JOURNAL_TRADE_TYPE,
    type_text: 'Trade',
    datetime: Math.floor(sample.recordedAtEpochMs / 1000),
    source: 'Terminal',
    message: `${STATUS_PREFIX[status]}${subject ? ` ${subject}` : ''}${details ? `: ${details}` : ''}`,
  };
}

export function serverTerminalStatus(log: JournalLogEntry): OrderTerminalStatus | null {
  if (log.type !== JOURNAL_TRADE_TYPE && log.type_text.trim().toLowerCase() !== 'trade') return null;
  const haystack = `${log.code_text} ${log.message}`.toLowerCase();
  if (/\b(filled|executed|completed)\b/.test(haystack)) return 'filled';
  if (/\b(rejected|denied)\b/.test(haystack)) return 'rejected';
  if (/\b(expired|timed out|timeout)\b/.test(haystack)) return 'expired';
  if (/\b(failed|error)\b/.test(haystack)) return 'failed';
  return null;
}

/**
 * Server rows are authoritative. A local sample only claims a server row by
 * EXACT client_order_id; it enriches a missing latency when both sides agree
 * on the outcome, and is otherwise dropped in favour of the server row.
 */
export function mergeJournalRows(
  serverLogs: readonly JournalLogEntry[],
  samples: readonly OrderLatencySample[],
): JournalLogEntry[] {
  const merged = serverLogs.map((log) => ({ ...log }));
  const claimed = new Set<number>();
  const local: JournalLogEntry[] = [];
  for (const sample of samples) {
    const index = merged.findIndex((log, idx) => !claimed.has(idx)
      && Boolean(sample.clientOrderId)
      && log.client_order_id !== undefined
      && String(log.client_order_id).trim() === sample.clientOrderId
      && serverTerminalStatus(log) !== null);
    if (index < 0) {
      local.push(localJournalRow(sample));
      continue;
    }
    claimed.add(index);
    if (merged[index].latency_ms === undefined && serverTerminalStatus(merged[index]) === sample.terminalStatus) {
      merged[index] = { ...merged[index], latency_ms: sample.totalMs };
    }
  }
  // Array.prototype.sort is stable: on a same-second tie local rows stay first.
  return [...local, ...merged].sort((a, b) => b.datetime - a.datetime);
}

// ---------------------------------------------------------------------------
// Client-side filters (§7)
// ---------------------------------------------------------------------------

export type JournalFilterInput = {
  timeRangeHours: number;
  type: number;
  mode: number;
  search: string;
  /** Only once the response for the current Type/Mode is in. */
  responseMatchesRequest: boolean;
  nowMs: number;
};

export function filterJournalRows(
  rows: readonly JournalLogEntry[],
  input: JournalFilterInput,
): JournalLogEntry[] {
  let result = rows as JournalLogEntry[];
  if (input.timeRangeHours > 0) {
    const cutoff = Math.floor(input.nowMs / 1000) - input.timeRangeHours * 3600;
    result = result.filter((log) => log.datetime >= cutoff);
  }
  if (input.responseMatchesRequest && input.type !== JOURNAL_DEFAULT_TYPE) {
    result = result.filter((log) => log.type === input.type);
  }
  if (input.responseMatchesRequest && input.mode === JOURNAL_ERRORS_MODE) {
    result = result.filter((log) => log.code !== 0);
  }
  if (input.search.trim() !== '') {
    const query = input.search.toLowerCase();
    result = result.filter((log) => log.message.toLowerCase().includes(query)
      || log.source.toLowerCase().includes(query));
  }
  return result;
}

// ---------------------------------------------------------------------------
// "Last trade latency" readout (§5.4)
// ---------------------------------------------------------------------------

export function selectLastTradeLatencyMs(
  samples: readonly OrderLatencySample[],
  scope: string,
): number | undefined {
  let best: { sequence: number; latency: number } | undefined;
  for (const sample of samples) {
    if (sample.sessionScope !== scope) continue;
    const isPlacement = sample.phase === 'placement_terminal';
    const isWsTerminal = sample.transport === 'websocket'
      && (sample.phase === 'order_filled' || sample.phase === 'order_rejected');
    const isRestTerminal = sample.transport === 'rest'
      && (sample.phase === 'rest_completed' || sample.phase === 'rest_failed');
    if (!isPlacement && !isWsTerminal && !isRestTerminal) continue;
    let latency: number | undefined = typeof sample.totalMs === 'number' && Number.isFinite(sample.totalMs)
      ? sample.totalMs
      : undefined;
    if (latency === undefined && !isPlacement) {
      latency = isWsTerminal ? sample.terminalRttMs : sample.restRttMs;
    }
    if (typeof latency !== 'number' || !Number.isFinite(latency) || latency < 0) continue;
    if (!best || sample.sequence > best.sequence) best = { sequence: sample.sequence, latency };
  }
  return best?.latency;
}
