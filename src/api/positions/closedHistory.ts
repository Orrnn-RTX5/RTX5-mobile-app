/**
 * Closed-position history loader.
 *
 * The v3 gateway ignores limit/offset on `/positions/{login}/history` and caps
 * each response at 500 rows, so history is paged by from/to time windows.
 * Field shapes vary across broker integrations, so each row is normalised and
 * deduplicated across windows.
 */
import { apiClient } from '../apiClient';
import { createTradingApiError } from '../tradingErrors';
import {
  assignNumberAlias,
  assignTimestampAlias,
  isJsonRecord,
  pickArrayPayload,
  pickString,
} from './payloadHelpers';
import type { ClosedPosition, JsonRecord } from './types';

function normalizeClosedHistoryRecord(record: unknown): ClosedPosition | null {
  if (!isJsonRecord(record)) {
    return null;
  }

  const normalized: JsonRecord = { ...record };
  const symbol = pickString(record, ['symbol', 'Symbol', 'instrument', 'name']);
  const side = pickString(record, ['side', 'type', 'order_type', 'action', 'cmd']);
  const comment = pickString(record, ['comment', 'reason', 'description']);

  if (symbol) {
    normalized.symbol = symbol;
  }
  if (side) {
    const sideLower = side.toLowerCase();
    if (sideLower.includes('sell')) {
      normalized.side = 'sell';
    } else if (sideLower.includes('buy')) {
      normalized.side = 'buy';
    }
  }
  if (comment) {
    normalized.comment = comment;
  }

  assignNumberAlias(normalized, record, 'ticket', ['ticket', 'position_ticket', 'positionTicket', 'order_ticket', 'orderTicket', 'deal_ticket', 'dealTicket', 'id']);
  assignNumberAlias(normalized, record, 'account_login', ['account_login', 'accountLogin', 'login', 'account']);
  assignNumberAlias(normalized, record, 'volume', ['volume', 'lots', 'lot', 'volume_closed', 'volumeClosed']);
  assignNumberAlias(normalized, record, 'price_open', ['price_open', 'priceOpen', 'open_price', 'openPrice', 'open']);
  assignNumberAlias(normalized, record, 'price_close', ['price_close', 'priceClose', 'close_price', 'closePrice', 'close']);
  assignNumberAlias(normalized, record, 'price_current', ['price_current', 'priceCurrent', 'current_price', 'currentPrice', 'price']);
  assignNumberAlias(normalized, record, 'profit', ['profit', 'pnl', 'pl', 'close_profit', 'closed_profit']);
  assignNumberAlias(normalized, record, 'swap', ['swap', 'swaps']);
  assignNumberAlias(normalized, record, 'commission', ['commission', 'commissions']);
  assignNumberAlias(normalized, record, 'fee', ['fee', 'fees']);
  assignTimestampAlias(normalized, record, 'time_create', ['time_create', 'timeCreate', 'open_time', 'openTime', 'time_open', 'timeOpen', 'created_at']);
  assignTimestampAlias(normalized, record, 'time_update', ['time_update', 'timeUpdate', 'updated_at']);
  assignTimestampAlias(normalized, record, 'time_close', ['time_close', 'timeClose', 'close_time', 'closeTime', 'time_done', 'timeDone', 'closed_at', 'time']);

  return normalized as unknown as ClosedPosition;
}

function buildClosedHistoryRecordKey(record: ClosedPosition, fallbackIndex: number): string {
  const source = record as unknown as JsonRecord;
  const parts = [
    source.ticket,
    source.position_ticket,
    source.order_ticket,
    source.deal_ticket,
    source.id,
    source.symbol,
    source.side,
    source.time_close,
    source.time_done,
    source.closed_at,
    source.time_update,
    source.time_create,
    source.volume,
    source.price_open,
    source.price_close,
    source.profit,
  ]
    .map((value) => (value === undefined || value === null ? '' : String(value).trim()))
    .filter(Boolean);

  return parts.length > 0 ? parts.join('|') : `closed-history-${fallbackIndex}`;
}

export const POSITION_HISTORY_ROW_CAP = 500;
export const POSITION_HISTORY_WINDOW_SECONDS = 90 * 24 * 60 * 60;
/** Unbounded walks stop after ~2 years of 90-day windows. */
export const POSITION_HISTORY_MAX_WINDOWS = 8;
/** Unbounded walks stop after this many consecutive empty windows. */
export const POSITION_HISTORY_EMPTY_WINDOW_STOP = 2;
const MIN_SPLIT_WINDOW_SECONDS = 60;
const MAX_SPLIT_DEPTH = 8;

export type PositionHistoryOptions = Readonly<{
  /** Range start, unix seconds. Omitted = walk back until empty windows. */
  from?: number;
  /** Range end, unix seconds. Omitted = now. */
  to?: number;
  maxWindows?: number;
  windowSeconds?: number;
  nowSeconds?: number;
  /** Test seam; defaults to the authenticated gateway request. */
  fetchWindow?: (login: number, from: number, to: number) => Promise<ClosedPosition[]>;
}>;

async function fetchClosedHistoryWindow(
  login: number,
  from: number,
  to: number,
): Promise<ClosedPosition[]> {
  const params = new URLSearchParams({ from: String(from), to: String(to) });
  const response = await apiClient(`/positions/${login}/history?${params.toString()}`);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const headers: Record<string, string> = {};
    if (response.status === 429) headers['retry-after'] = response.headers.get('retry-after') || '';
    throw createTradingApiError(response.status, errorData, headers);
  }

  const json = await response.json();
  const rows = pickArrayPayload(json);
  if (!rows) return [];
  return rows
    .map(normalizeClosedHistoryRecord)
    .filter((record): record is ClosedPosition => record !== null);
}

const pageSignature = (rows: ClosedPosition[]): string =>
  rows.map((record, index) => buildClosedHistoryRecordKey(record, index)).join('\n');

/**
 * Closed-position history (backend contract v3, 6.4).
 *
 * `GET /positions/{login}/history?from&to` ignores limit/offset and returns at
 * most 500 rows, so offset paging cannot work. The loader instead walks
 * BACKWARDS in from/to time windows:
 * - bounded range (`from` given): windows cover [from, to] exactly;
 * - unbounded: 90-day windows until 2 consecutive empty windows or 8 windows;
 * - a window that hits the 500-row cap is split in half (recursively) so a
 *   busy period is not silently truncated;
 * - if the server ignores from/to (identical rows for different windows) the
 *   walk stops instead of looping.
 * Rows are deduplicated across windows. Positions closed by the new close
 * path may be missing here (BACKEND PENDING); the History screen fills them
 * from `entry_out` deals (derivedClosedPositions.ts).
 */
export async function getPositionHistory(
  login: number,
  options: PositionHistoryOptions = {},
): Promise<ClosedPosition[]> {
  const fetchWindow = options.fetchWindow ?? fetchClosedHistoryWindow;
  const nowSeconds = Math.floor(options.nowSeconds ?? Date.now() / 1000);
  const windowSeconds = Math.max(
    MIN_SPLIT_WINDOW_SECONDS,
    Math.floor(options.windowSeconds ?? POSITION_HISTORY_WINDOW_SECONDS),
  );
  const lowerBound = Number.isFinite(options.from) ? Math.floor(options.from as number) : null;
  const maxWindows = Math.max(
    1,
    Math.floor(
      Number.isFinite(options.maxWindows)
        ? (options.maxWindows as number)
        : lowerBound !== null
          ? Number.MAX_SAFE_INTEGER
          : POSITION_HISTORY_MAX_WINDOWS,
    ),
  );
  let end = Number.isFinite(options.to) ? Math.floor(options.to as number) : nowSeconds;

  const records: ClosedPosition[] = [];
  const seenKeys = new Set<string>();
  const seenSignatures = new Set<string>();
  let serverIgnoresRange = false;

  const collect = async (from: number, to: number, depth: number): Promise<ClosedPosition[]> => {
    const rows = await fetchWindow(login, from, to);
    if (
      rows.length < POSITION_HISTORY_ROW_CAP ||
      to - from <= MIN_SPLIT_WINDOW_SECONDS ||
      depth >= MAX_SPLIT_DEPTH
    ) {
      return rows;
    }
    const mid = from + Math.floor((to - from) / 2);
    const newer = await collect(mid + 1, to, depth + 1);
    if (serverIgnoresRange) return rows;
    const older = await collect(from, mid, depth + 1);
    const parentSignature = pageSignature(rows);
    if (
      pageSignature(newer) === parentSignature &&
      pageSignature(older) === parentSignature
    ) {
      // Both disjoint halves returned the parent's capped rows: the server is
      // ignoring from/to, so splitting further cannot help.
      serverIgnoresRange = true;
      return rows;
    }
    return [...newer, ...older];
  };

  let emptyStreak = 0;
  for (let windowIndex = 0; windowIndex < maxWindows; windowIndex += 1) {
    if (lowerBound !== null && end < lowerBound) break;
    const start = lowerBound !== null
      ? Math.max(lowerBound, end - windowSeconds)
      : end - windowSeconds;
    const rows = await collect(start, end, 0);

    if (rows.length > 0) {
      const signature = pageSignature(rows);
      if (seenSignatures.has(signature)) {
        serverIgnoresRange = true;
      }
      seenSignatures.add(signature);
    }

    rows.forEach((record, index) => {
      const key = buildClosedHistoryRecordKey(record, index);
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        records.push(record);
      }
    });

    if (serverIgnoresRange) break;
    emptyStreak = rows.length === 0 ? emptyStreak + 1 : 0;
    if (lowerBound === null && emptyStreak >= POSITION_HISTORY_EMPTY_WINDOW_STOP) break;
    // Windows are inclusive on both ends; step past `start` so a close at the
    // boundary is fetched once.
    end = start - 1;
  }

  return records;
}
