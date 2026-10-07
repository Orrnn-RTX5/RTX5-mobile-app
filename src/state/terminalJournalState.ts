import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createDeferredJsonStorage } from './deferredJsonStorage';

import { resolveTradingLogin } from './tradingLogin';
import { sanitizeTerminalJournalMessage } from './terminalJournalSecurity';
import { getApiLatencyNow } from '../utils/apiLatency';

export type TerminalJournalSource = 'Trades' | 'Accounts' | 'Actions' | 'Terminal' | 'Network' | 'Notes';
export type TerminalJournalLevel = 'info' | 'success' | 'error';
/**
 * Which side reported a trade row: `Gateway` rows come from the phone's own
 * request/response with the trading gateway; `Terminal` rows come from the
 * backend's realtime execution event for that same command.
 */
export type TerminalJournalOrigin = 'Gateway' | 'Terminal';

export type TerminalJournalEntry = {
  id: string;
  createdAt: string;
  source: TerminalJournalSource;
  level: TerminalJournalLevel;
  message: string;
  accountLogin?: string;
  /** Request-to-result time of the trade command this entry reports (0.1 ms). */
  latencyMs?: number;
  origin?: TerminalJournalOrigin;
};

type TerminalJournalEntryInput = Omit<TerminalJournalEntry, 'id' | 'createdAt'> & {
  id?: string;
  createdAt?: string;
};

type MarketOrderJournalPayload = {
  account_login?: string | number;
  symbol?: string;
  side?: string;
  volume?: number;
  price_sl?: number | null;
  price_tp?: number | null;
  /** Date.now() when the order request started; drives the entry latency. */
  started_at_ms?: number;
};

type MarketOrderJournalResponse = {
  account_login?: string | number;
  symbol?: string;
  side?: string;
  volume?: number;
  price?: number;
  price_open?: number;
  price_current?: number;
  ticket?: string | number;
  order_ticket?: string | number;
  position_ticket?: string | number;
  message?: string;
  status?: string;
};

type PositionModifyJournalPayload = {
  price_sl?: number | null;
  price_tp?: number | null;
  trailing_stop?: number | null;
  trailing_step?: number | null;
};

type PositionJournalResponse = {
  account_login?: string | number;
  symbol?: string;
  side?: string;
  volume?: number;
  volume_closed?: number;
  volume_total?: number;
  price?: number;
  price_open?: number;
  price_close?: number;
  price_current?: number;
  price_sl?: number | null;
  price_tp?: number | null;
  ticket?: string | number;
  order_ticket?: string | number;
  position_ticket?: string | number;
  message?: string;
  status?: string;
};

export type ProtectionTriggeredJournalPayload = {
  ticket?: string | number;
  position_ticket?: string | number;
  account_login?: string | number;
  symbol?: string;
  price_close?: number | string;
  price?: number | string;
  reason?: string;
  type?: string;
  event?: string;
};

type TerminalJournalState = {
  entries: TerminalJournalEntry[];
  addEntry: (entry: TerminalJournalEntryInput) => void;
  clearEntries: () => void;
  setEntryLatency: (id: string, latencyMs: number) => void;
  pruneExpiredEntries: (nowMs?: number) => void;
};

const TERMINAL_JOURNAL_MAX_ENTRIES = 500;
const TERMINAL_JOURNAL_RETENTION_DAYS = 90;
let journalEntrySequence = 0;
// Request rows waiting for their result, keyed per command. The result's
// latency is also written back onto the request row, like the web terminal.
const pendingRequests = new Map<string, {
  startedAtMs: number;
  entryId: string;
  /** Measured gateway round trip (send -> HTTP response), when reported. */
  gatewayLatencyMs?: number;
}>();
const PENDING_REQUEST_MAX = 50;

/** Latency is kept to 0.1 ms, the precision the web terminal shows. */
function roundLatencyMs(latencyMs: number): number {
  return Math.max(0, Math.round(latencyMs * 10) / 10);
}

function measureLatencyMs(startedAtMs: number | undefined): number | undefined {
  if (typeof startedAtMs !== 'number' || !Number.isFinite(startedAtMs)) {
    return undefined;
  }
  return Math.max(0, Math.round(Date.now() - startedAtMs));
}

function markRequestStarted(key: string, entryId: string, startedAtMs = Date.now()): void {
  pendingRequests.delete(key);
  pendingRequests.set(key, { startedAtMs, entryId });
  if (pendingRequests.size > PENDING_REQUEST_MAX) {
    const oldestKey = pendingRequests.keys().next().value;
    if (oldestKey !== undefined) pendingRequests.delete(oldestKey);
  }
}

function takeRequestLatencyMs(key: string): number | undefined {
  const pending = pendingRequests.get(key);
  if (!pending) {
    return undefined;
  }
  pendingRequests.delete(key);
  // Prefer the gateway round trip, which is what the web terminal reports.
  // The whole-flow time also counts symbol retries and async fill polling.
  const latencyMs = pending.gatewayLatencyMs ?? measureLatencyMs(pending.startedAtMs);
  if (latencyMs !== undefined) {
    useTerminalJournalState.getState().setEntryLatency(pending.entryId, latencyMs);
  }
  return latencyMs;
}

function noteGatewayLatencyMs(key: string, durationMs: number): void {
  const pending = pendingRequests.get(key);
  if (pending && Number.isFinite(durationMs) && durationMs >= 0) {
    // Last response wins: after a symbol retry, the accepted attempt is last.
    pending.gatewayLatencyMs = Math.round(durationMs);
  }
}

/** Reports the POST /orders round trip for the journal's LATENCY column. */
export function recordMarketOrderGatewayLatency(
  payload: Pick<MarketOrderJournalPayload, 'started_at_ms'>,
  durationMs: number,
): void {
  noteGatewayLatencyMs(`order:${payload.started_at_ms}`, durationMs);
}

/** Reports the close-position request round trip for the LATENCY column. */
export function recordClosePositionGatewayLatency(ticketId: string | number, durationMs: number): void {
  noteGatewayLatencyMs(`close:${ticketId}`, durationMs);
}

/** Reports the modify-position request round trip for the LATENCY column. */
export function recordModifyPositionGatewayLatency(ticketId: string | number, durationMs: number): void {
  noteGatewayLatencyMs(`modify:${ticketId}`, durationMs);
}

// Account flows log "<flow> requested ..." then "<flow> succeeded/failed ...".
// Longest prefixes first so "broker detail login" is not read as "login".
const ACCOUNT_FLOW_PREFIXES = ['broker detail login', 'demo account', 'account switch', 'login'];

function getAccountFlowKey(message: string): string | undefined {
  const lower = message.toLowerCase();
  const prefix = ACCOUNT_FLOW_PREFIXES.find((candidate) => lower.startsWith(candidate));
  return prefix ? `account:${prefix}` : undefined;
}

function createEntryId(source: TerminalJournalSource): string {
  journalEntrySequence = (journalEntrySequence + 1) % 100000;
  return `terminal-${source.toLowerCase()}-${Date.now()}-${journalEntrySequence}`;
}

function parseEntryTimeMs(entry: Pick<TerminalJournalEntry, 'createdAt'>): number {
  const time = Date.parse(entry.createdAt);
  return Number.isFinite(time) ? time : 0;
}

function getLocalDayStartMs(nowMs: number): number {
  const date = new Date(nowMs);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function getRetentionStartMs(nowMs: number): number {
  const date = new Date(getLocalDayStartMs(nowMs));
  date.setDate(date.getDate() - (TERMINAL_JOURNAL_RETENTION_DAYS - 1));
  return date.getTime();
}

function retainRecentEntries(entries: TerminalJournalEntry[], nowMs = Date.now()) {
  const retentionStartMs = getRetentionStartMs(nowMs);
  return entries
    .filter((entry) => parseEntryTimeMs(entry) >= retentionStartMs)
    .slice(0, TERMINAL_JOURNAL_MAX_ENTRIES);
}

function normalizeAccountLogin(value?: string | number): string | undefined {
  const explicit = value === undefined ? undefined : String(value).trim();
  if (explicit) {
    return explicit;
  }

  const resolved = resolveTradingLogin();
  return resolved === undefined ? undefined : String(resolved);
}

function normalizeSymbol(value: unknown): string | undefined {
  const symbol = typeof value === 'string' ? value.trim() : '';
  return symbol || undefined;
}

function normalizeSide(value: unknown): 'buy' | 'sell' {
  return String(value ?? '').toLowerCase() === 'sell' ? 'sell' : 'buy';
}

function formatLoginPrefix(login?: string): string {
  return login ? `'${login}': ` : '';
}

function formatVolume(value: unknown): string | null {
  const volume = typeof value === 'number' && Number.isFinite(value) ? value : Number(value);
  if (!Number.isFinite(volume) || volume <= 0) {
    return null;
  }

  return Number(volume.toFixed(2)).toFixed(2);
}

function formatRequiredVolume(value: unknown): string {
  return formatVolume(value) ?? 'unknown volume';
}

function formatPrice(value: unknown, symbol?: string): string | null {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  const upper = symbol?.toUpperCase() ?? '';
  const decimals = upper.includes('JPY') ? 3 : upper.includes('XAU') || Math.abs(numeric) >= 100 ? 2 : 5;
  return numeric.toFixed(decimals);
}

function formatStops(payload: MarketOrderJournalPayload): string {
  const symbol = normalizeSymbol(payload.symbol);
  const parts: string[] = [];
  const sl = formatPrice(payload.price_sl, symbol);
  const tp = formatPrice(payload.price_tp, symbol);
  if (sl) parts.push(`sl: ${sl}`);
  if (tp) parts.push(`tp: ${tp}`);
  return parts.length > 0 ? `, ${parts.join(', ')}` : '';
}

function buildMarketOrderText(payload: MarketOrderJournalPayload): string {
  const side = normalizeSide(payload.side).toUpperCase();
  const symbol = normalizeSymbol(payload.symbol);
  const symbolText = symbol ? ` ${symbol}` : '';
  return `market ${side} ${formatRequiredVolume(payload.volume)}${symbolText}${formatStops(payload)}`;
}

function getOrderTicket(response?: MarketOrderJournalResponse | PositionJournalResponse): string | undefined {
  const ticket = response?.order_ticket ?? response?.ticket ?? response?.position_ticket;
  return ticket === undefined || ticket === null ? undefined : String(ticket);
}

function getErrorMessage(error: unknown): string {
  const source = error as {
    message?: unknown;
    response?: { data?: { message?: unknown; error?: unknown } };
    data?: { message?: unknown; error?: unknown };
  };
  const message =
    source?.response?.data?.message ??
    source?.response?.data?.error ??
    source?.data?.message ??
    source?.data?.error ??
    source?.message;
  return typeof message === 'string' && message.trim() ? message.trim() : 'request failed';
}

const terminalJournalPersistence = createDeferredJsonStorage<Pick<TerminalJournalState, 'entries'>>(
  AsyncStorage,
  error => console.error('[Journal] Terminal journal storage failed', error),
);
export const flushTerminalJournalStorage = terminalJournalPersistence.flush;

export const useTerminalJournalState = create<TerminalJournalState>()(
  persist(
    (set) => ({
      entries: [],
      addEntry: (entry) =>
        set((state) => {
          const createdAt = entry.createdAt ?? new Date().toISOString();
          const next: TerminalJournalEntry = {
            id: entry.id ?? createEntryId(entry.source),
            createdAt,
            source: entry.source,
            level: entry.level,
            // The terminal journal is persisted in AsyncStorage. Treat every
            // caller message as untrusted backend text and strip credentials
            // and URL query values before it can reach disk/support exports.
            message: sanitizeTerminalJournalMessage(entry.message),
            accountLogin: entry.accountLogin,
            ...(typeof entry.latencyMs === 'number' && Number.isFinite(entry.latencyMs)
              ? { latencyMs: roundLatencyMs(entry.latencyMs) }
              : {}),
            ...(entry.origin ? { origin: entry.origin } : {}),
          };
          return {
            entries: retainRecentEntries([next, ...state.entries]),
          };
        }),
      clearEntries: () => set({ entries: [] }),
      setEntryLatency: (id, latencyMs) =>
        set((state) => {
          const index = state.entries.findIndex((entry) => entry.id === id);
          if (index < 0 || !Number.isFinite(latencyMs)) {
            return state;
          }
          const entries = state.entries.slice();
          entries[index] = { ...entries[index], latencyMs: roundLatencyMs(latencyMs) };
          return { entries };
        }),
      pruneExpiredEntries: (nowMs = Date.now()) =>
        set((state) => ({ entries: retainRecentEntries(state.entries, nowMs) })),
    }),
    {
      name: 'terminalJournalEntries',
      storage: terminalJournalPersistence.storage,
      partialize: (state) => ({ entries: state.entries }),
    },
  ),
);

export function addTerminalJournalEntry(entry: TerminalJournalEntryInput): void {
  useTerminalJournalState.getState().addEntry(entry);
}

export function recordAppActionJournalEvent({
  message,
  source = 'Actions',
  level = 'info',
  accountLogin,
}: {
  message: string;
  source?: TerminalJournalSource;
  level?: TerminalJournalLevel;
  accountLogin?: string | number;
}): void {
  const trimmedMessage = message.trim();
  if (!trimmedMessage) {
    return;
  }

  const login = normalizeAccountLogin(accountLogin);
  const id = createEntryId(source);
  const flowKey = source === 'Accounts' ? getAccountFlowKey(trimmedMessage) : undefined;
  let latencyMs: number | undefined;
  if (flowKey && /\brequested\b/i.test(trimmedMessage)) {
    markRequestStarted(flowKey, id);
  } else if (flowKey) {
    latencyMs = takeRequestLatencyMs(flowKey);
  }
  addTerminalJournalEntry({
    id,
    source,
    level,
    accountLogin: login,
    latencyMs,
    message: `${formatLoginPrefix(login)}${trimmedMessage}`,
  });
}

export function recordAccountJournalEvent(
  message: string,
  options?: {
    level?: TerminalJournalLevel;
    accountLogin?: string | number;
  },
): void {
  recordAppActionJournalEvent({
    source: 'Accounts',
    level: options?.level ?? 'info',
    accountLogin: options?.accountLogin,
    message,
  });
}

function takeOrderLatencyMs(payload: MarketOrderJournalPayload): number | undefined {
  return takeRequestLatencyMs(`order:${payload.started_at_ms}`) ?? measureLatencyMs(payload.started_at_ms);
}

export function recordMarketOrderJournalRequest(payload: MarketOrderJournalPayload): void {
  const login = normalizeAccountLogin(payload.account_login);
  const id = createEntryId('Trades');
  if (payload.started_at_ms !== undefined) {
    markRequestStarted(`order:${payload.started_at_ms}`, id, payload.started_at_ms);
  }
  addTerminalJournalEntry({
    id,
    source: 'Trades',
    level: 'info',
    accountLogin: login,
    message: `${formatLoginPrefix(login)}Trade started: ${buildMarketOrderText(payload)}`,
  });
}

export function recordMarketOrderJournalSuccess(
  payload: MarketOrderJournalPayload,
  response?: MarketOrderJournalResponse,
): void {
  const login = normalizeAccountLogin(response?.account_login ?? payload.account_login);
  const symbol = normalizeSymbol(response?.symbol ?? payload.symbol);
  const side = normalizeSide(response?.side ?? payload.side);
  const responseVolume = response?.volume ?? payload.volume;
  // Web-terminal Gateway pair, both stamped with the gateway round trip:
  //   "Timing buy XAUUSD 0.01"          request timing of this trade
  //   "Order buy XAUUSD 0.01 filled"    the gateway's fill response
  // The Terminal "Order executed" row is written separately when the
  // backend's realtime execution event arrives (recordTerminalExecutionEvent).
  const latencyMs = takeOrderLatencyMs(payload);
  const tradeText = formatTradeText(side, symbol, responseVolume);
  addTerminalJournalEntry({
    source: 'Trades',
    level: 'success',
    accountLogin: login,
    latencyMs,
    origin: 'Gateway',
    message: `${formatLoginPrefix(login)}Timing ${tradeText}`,
  });

  const ticket = getOrderTicket(response);
  const price = formatPrice(response?.price ?? response?.price_open ?? response?.price_current, symbol);
  const priceText = price ? ` at ${price}` : '';
  const ticketText = ticket ? ` #${ticket}` : '';
  addTerminalJournalEntry({
    source: 'Trades',
    level: 'success',
    accountLogin: login,
    latencyMs,
    origin: 'Gateway',
    message: `${formatLoginPrefix(login)}Order ${tradeText} filled${priceText}${ticketText}`,
  });
}

function formatTradeText(side: string, symbol: string | undefined, volume: unknown): string {
  return `${side} ${symbol ?? ''} ${formatRequiredVolume(volume)}`.replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------------------
// Terminal execution rows
//
// Each trade command carries a client_order_id that the backend echoes on the
// realtime position event it publishes once the terminal has executed it
// (contract v3: position_opened / _increased / _decreased / _reversed for an
// order, position_closed / _partial_close for a close). Matching that id gives
// the "Order executed" row: its latency is send -> that event on this phone,
// and its price/ticket are the backend's executed values from the event.
// ---------------------------------------------------------------------------

type ExecutionWatch = {
  kind: 'order' | 'close';
  sentAtMs: number;
  expiresAtMs: number;
  accountLogin?: string;
  side?: string;
  symbol?: string;
  volume?: number;
  ticket?: string;
};

const executionWatches = new Map<string, ExecutionWatch>();
// The backend confirms asynchronously within ~30 s; anything later is stale.
const EXECUTION_WATCH_TTL_MS = 60_000;
const EXECUTION_WATCH_MAX = 50;

function pruneExecutionWatches(nowMs: number): void {
  for (const [id, watch] of executionWatches) {
    if (watch.expiresAtMs <= nowMs) executionWatches.delete(id);
  }
  while (executionWatches.size > EXECUTION_WATCH_MAX) {
    const oldest = executionWatches.keys().next().value;
    if (oldest === undefined) break;
    executionWatches.delete(oldest);
  }
}

function addExecutionWatch(clientOrderId: string, watch: Omit<ExecutionWatch, 'expiresAtMs'>): void {
  const id = clientOrderId.trim();
  if (!id || !Number.isFinite(watch.sentAtMs)) return;
  pruneExecutionWatches(watch.sentAtMs);
  executionWatches.set(id, { ...watch, expiresAtMs: watch.sentAtMs + EXECUTION_WATCH_TTL_MS });
}

/** Call right before POST /orders with the attempt's client_order_id. */
export function watchMarketOrderExecution(
  clientOrderId: string,
  payload: MarketOrderJournalPayload,
  sentAtMs: number = getApiLatencyNow(),
): void {
  addExecutionWatch(clientOrderId, {
    kind: 'order',
    sentAtMs,
    accountLogin: normalizeAccountLogin(payload.account_login),
    side: normalizeSide(payload.side),
    symbol: normalizeSymbol(payload.symbol),
    volume: payload.volume,
  });
}

/** Call right before the close-position request with its client_order_id. */
export function watchClosePositionExecution(
  clientOrderId: string,
  ticketId: string | number,
  sentAtMs: number = getApiLatencyNow(),
): void {
  addExecutionWatch(clientOrderId, {
    kind: 'close',
    sentAtMs,
    accountLogin: normalizeAccountLogin(),
    ticket: String(ticketId),
  });
}

const ORDER_EXECUTION_EVENT = /(opened|increased|decreased|reversed)$/;
const CLOSE_EXECUTION_EVENT = /(closed|partial\.close)$/;

/**
 * Writes the Terminal "executed" row when a realtime position event echoes a
 * watched client_order_id. Returns true when a row was written.
 */
export function recordTerminalExecutionEvent(
  clientOrderId: string | undefined,
  eventName: string,
  eventData: unknown,
): boolean {
  const id = clientOrderId?.trim();
  if (!id) return false;
  const nowMs = getApiLatencyNow();
  pruneExecutionWatches(nowMs);
  const watch = executionWatches.get(id);
  if (!watch) return false;
  const name = eventName.toLowerCase();
  const matches = watch.kind === 'order'
    ? ORDER_EXECUTION_EVENT.test(name)
    : CLOSE_EXECUTION_EVENT.test(name);
  if (!matches) return false;
  executionWatches.delete(id);

  const row = (eventData && typeof eventData === 'object' && !Array.isArray(eventData)
    ? eventData
    : {}) as Record<string, unknown>;
  const symbol = normalizeSymbol(row.symbol) ?? watch.symbol;
  const ticketValue = row.ticket ?? row.position_ticket ?? watch.ticket;
  const ticketText = ticketValue === undefined || ticketValue === null || ticketValue === ''
    ? ''
    : ` #${String(ticketValue)}`;
  const login = normalizeAccountLogin(
    (row.account_login as string | number | undefined) ?? watch.accountLogin,
  );
  const latencyMs = nowMs - watch.sentAtMs;

  let message: string;
  if (watch.kind === 'order') {
    const side = row.side === undefined ? (watch.side ?? 'buy') : normalizeSide(row.side);
    const price = formatPrice(row.price_open ?? row.price, symbol);
    message = `Order executed ${formatTradeText(side, symbol, row.volume ?? watch.volume)}`
      + `${price ? ` at ${price}` : ''}${ticketText}`;
  } else {
    const price = formatPrice(row.price_close ?? row.price, symbol);
    message = `Close executed${ticketText}${symbol ? ` ${symbol}` : ''}${price ? ` at ${price}` : ''}`;
  }

  addTerminalJournalEntry({
    source: 'Trades',
    level: 'success',
    accountLogin: login,
    latencyMs,
    origin: 'Terminal',
    message: `${formatLoginPrefix(login)}${message}`,
  });
  return true;
}

export function recordMarketOrderJournalFailure(
  payload: MarketOrderJournalPayload,
  error: unknown,
): void {
  const login = normalizeAccountLogin(payload.account_login);
  addTerminalJournalEntry({
    source: 'Trades',
    level: 'error',
    accountLogin: login,
    latencyMs: takeOrderLatencyMs(payload),
    message: `${formatLoginPrefix(login)}${buildMarketOrderText(payload)} failed: ${getErrorMessage(error)}`,
  });
}

export function recordClosePositionJournalRequest(
  ticketId: string | number,
  options?: { ticketBy?: string | number; volume?: number },
): void {
  const login = normalizeAccountLogin();
  const extra = options?.ticketBy
    ? ` by #${options.ticketBy}`
    : options?.volume
      ? ` volume ${formatRequiredVolume(options.volume)}`
      : '';
  const id = createEntryId('Trades');
  markRequestStarted(`close:${ticketId}`, id);
  addTerminalJournalEntry({
    id,
    source: 'Trades',
    level: 'info',
    accountLogin: login,
    message: `${formatLoginPrefix(login)}close position #${ticketId}${extra}`,
  });
}

export function recordClosePositionJournalSuccess(
  ticketId: string | number,
  response?: PositionJournalResponse,
): void {
  const login = normalizeAccountLogin(response?.account_login);
  const symbol = normalizeSymbol(response?.symbol);
  const ticket = getOrderTicket(response) ?? String(ticketId);
  const closePrice = formatPrice(response?.price_close ?? response?.price ?? response?.price_current, symbol);
  const volume = response?.volume_closed ?? response?.volume ?? response?.volume_total;
  const formattedVolume = formatVolume(volume);
  const volumeText = formattedVolume ? ` ${formattedVolume}` : '';
  const symbolText = symbol ? ` ${symbol}` : '';
  const priceText = closePrice ? ` at ${closePrice}` : '';
  addTerminalJournalEntry({
    source: 'Trades',
    level: 'success',
    accountLogin: login,
    latencyMs: takeRequestLatencyMs(`close:${ticketId}`),
    message: `${formatLoginPrefix(login)}position #${ticket}${volumeText}${symbolText} closed${priceText}`,
  });
}

export function recordClosePositionJournalFailure(
  ticketId: string | number,
  error: unknown,
): void {
  const login = normalizeAccountLogin();
  addTerminalJournalEntry({
    source: 'Trades',
    level: 'error',
    accountLogin: login,
    latencyMs: takeRequestLatencyMs(`close:${ticketId}`),
    message: `${formatLoginPrefix(login)}close position #${ticketId} failed: ${getErrorMessage(error)}`,
  });
}

/**
 * Records the broker's actual protection-close reason and fill price. This is
 * deliberately fed only by an owner-checked realtime terminal event; it never
 * predicts a close or derives a price from the requested SL/TP.
 */
export function recordProtectionTriggeredJournalEvent(
  payload: ProtectionTriggeredJournalPayload,
  accountLogin?: string | number,
): void {
  const ticketValue = payload.ticket ?? payload.position_ticket;
  const ticket = ticketValue === undefined || ticketValue === null
    ? ''
    : String(ticketValue).trim();
  if (!ticket) {
    return;
  }

  const login = normalizeAccountLogin(accountLogin ?? payload.account_login);
  const symbol = normalizeSymbol(payload.symbol);
  const normalizedEvent = String(payload.event ?? payload.type ?? '')
    .trim()
    .toLowerCase()
    .replace(/[.\s-]+/g, '_');
  const triggerLabel = normalizedEvent.includes('tp') ? 'TP' : 'SL';
  const backendReason = typeof payload.reason === 'string'
    ? payload.reason.trim().slice(0, 160)
    : '';
  const closePrice = formatPrice(payload.price_close ?? payload.price, symbol);
  const symbolText = symbol ? ` ${symbol}` : '';
  const reasonText = backendReason ? ` (${backendReason})` : '';
  const priceText = closePrice ? ` at ${closePrice}` : '';

  addTerminalJournalEntry({
    source: 'Trades',
    level: 'success',
    accountLogin: login,
    message: `${formatLoginPrefix(login)}position #${ticket}${symbolText} ${triggerLabel} triggered${reasonText}${priceText}`,
  });
}

export function recordModifyPositionJournalRequest(
  ticketId: string | number,
  payload: PositionModifyJournalPayload,
): void {
  const login = normalizeAccountLogin();
  const parts: string[] = [];
  const sl = formatPrice(payload.price_sl);
  const tp = formatPrice(payload.price_tp);
  if (sl) parts.push(`sl: ${sl}`);
  if (tp) parts.push(`tp: ${tp}`);
  if (typeof payload.trailing_stop === 'number' && payload.trailing_stop > 0) {
    parts.push(`trailing stop: ${payload.trailing_stop}`);
  }
  const details = parts.length > 0 ? parts.join(', ') : 'remove sl/tp';
  const id = createEntryId('Trades');
  markRequestStarted(`modify:${ticketId}`, id);
  addTerminalJournalEntry({
    id,
    source: 'Trades',
    level: 'info',
    accountLogin: login,
    message: `${formatLoginPrefix(login)}modify position #${ticketId}, ${details}`,
  });
}

export function recordModifyPositionJournalSuccess(
  ticketId: string | number,
  payload: PositionModifyJournalPayload,
  response?: PositionJournalResponse,
): void {
  const login = normalizeAccountLogin(response?.account_login);
  const symbol = normalizeSymbol(response?.symbol);
  const ticket = getOrderTicket(response) ?? String(ticketId);
  const sl = formatPrice(response?.price_sl ?? payload.price_sl, symbol);
  const tp = formatPrice(response?.price_tp ?? payload.price_tp, symbol);
  const symbolText = symbol ? ` ${symbol}` : '';
  const parts: string[] = [];
  if (sl) parts.push(`sl: ${sl}`);
  if (tp) parts.push(`tp: ${tp}`);
  addTerminalJournalEntry({
    source: 'Trades',
    level: 'success',
    accountLogin: login,
    latencyMs: takeRequestLatencyMs(`modify:${ticketId}`),
    message: `${formatLoginPrefix(login)}position #${ticket}${symbolText} modified${parts.length ? `, ${parts.join(', ')}` : ''}`,
  });
}

export function recordModifyPositionJournalFailure(
  ticketId: string | number,
  payload: PositionModifyJournalPayload,
  error: unknown,
): void {
  const login = normalizeAccountLogin();
  const request = payload.price_sl || payload.price_tp ? 'modify' : 'remove sl/tp from';
  addTerminalJournalEntry({
    source: 'Trades',
    level: 'error',
    accountLogin: login,
    latencyMs: takeRequestLatencyMs(`modify:${ticketId}`),
    message: `${formatLoginPrefix(login)}${request} position #${ticketId} failed: ${getErrorMessage(error)}`,
  });
}
