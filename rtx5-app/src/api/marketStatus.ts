/**
 * Market Status API (V2)
 *
 * Market state is symbol-specific and backend-owned. Different broker adapters
 * do not always return session boundaries, so every optional field is parsed
 * defensively instead of inventing a schedule in the mobile app.
 */

import { apiClient } from './apiClient';

export type MarketStatusPhase =
  | 'open'
  | 'closed'
  | 'pre_market'
  | 'after_hours'
  | 'unknown';

export interface MarketStatusDTO {
  symbol: string;
  status: MarketStatusPhase;
  /** Unix timestamp (seconds) for the active/next session, when supplied. */
  session_open?: number;
  /** Unix timestamp (seconds) for the active/previous session, when supplied. */
  session_close?: number;
  /** Whether this symbol's backend quote stream is currently price-forming. */
  quote_open?: boolean;
  /** Whether this symbol currently accepts trades. Kept separate from quotes. */
  trade_open?: boolean;
  /** Backend clock in Unix seconds, when supplied. */
  server_time?: number;
  message?: string;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const unwrapMarketStatusRecord = (payload: unknown): Record<string, unknown> => {
  const record = asRecord(payload) ?? {};
  for (const key of ['data', 'result', 'market', 'session'] as const) {
    const nested = asRecord(record[key]);
    if (nested) return nested;
  }
  return record;
};

const pick = (record: Record<string, unknown>, keys: readonly string[]): unknown => {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
};

const toOptionalBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'open'].includes(normalized)) return true;
    if (['false', '0', 'no', 'closed'].includes(normalized)) return false;
  }
  return undefined;
};

const toUnixSeconds = (value: unknown): number | undefined => {
  let numeric: number | undefined;
  if (typeof value === 'number' && Number.isFinite(value)) {
    numeric = value;
  } else if (typeof value === 'string' && value.trim()) {
    const parsedNumber = Number(value);
    if (Number.isFinite(parsedNumber)) {
      numeric = parsedNumber;
    } else {
      const parsedDate = Date.parse(value);
      if (Number.isFinite(parsedDate)) numeric = parsedDate / 1000;
    }
  }

  if (numeric === undefined || numeric <= 0) return undefined;
  // Broker adapters may expose JavaScript milliseconds or Unix seconds.
  return Math.floor(numeric > 10_000_000_000 ? numeric / 1000 : numeric);
};

const normalizePhase = (value: unknown): MarketStatusPhase => {
  if (typeof value !== 'string') return 'unknown';
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'open' || normalized === 'opened' || normalized === 'trading') return 'open';
  if (normalized === 'closed' || normalized === 'close' || normalized === 'market_closed') return 'closed';
  if (normalized === 'pre_market' || normalized === 'premarket') return 'pre_market';
  if (normalized === 'after_hours' || normalized === 'afterhours') return 'after_hours';
  return 'unknown';
};

/** Normalize broker-specific aliases without manufacturing missing values. */
export const normalizeMarketStatusPayload = (
  payload: unknown,
  fallbackSymbol = '',
): MarketStatusDTO => {
  const record = unwrapMarketStatusRecord(payload);
  const symbolValue = pick(record, ['symbol', 'Symbol', 'instrument', 'code']);
  const messageValue = pick(record, ['message', 'reason', 'status_message', 'statusMessage']);

  const tradeOpen = toOptionalBoolean(
    pick(record, ['trade_open', 'tradeOpen', 'trading_open', 'tradingOpen', 'tradable']),
  );
  // Contract v3 sends {symbol, quote_open, trade_open, message, server_time}
  // with no status key. trade_open is authoritative: open when true, closed
  // when false. A legacy status string is used only when trade_open is absent.
  const status: MarketStatusPhase = tradeOpen === true
    ? 'open'
    : tradeOpen === false
      ? 'closed'
      : normalizePhase(pick(record, ['status', 'market_status', 'marketStatus', 'phase']));

  return {
    symbol:
      typeof symbolValue === 'string' && symbolValue.trim()
        ? symbolValue.trim()
        : fallbackSymbol,
    status,
    session_open: toUnixSeconds(
      pick(record, ['session_open', 'sessionOpen', 'open_time', 'openTime', 'next_open', 'nextOpen']),
    ),
    session_close: toUnixSeconds(
      pick(record, ['session_close', 'sessionClose', 'close_time', 'closeTime', 'last_close', 'lastClose']),
    ),
    quote_open: toOptionalBoolean(
      pick(record, ['quote_open', 'quoteOpen', 'quotes_open', 'quotesOpen', 'price_open', 'priceOpen']),
    ),
    trade_open: tradeOpen,
    server_time: toUnixSeconds(
      pick(record, ['server_time', 'serverTime', 'timestamp', 'time']),
    ),
    message:
      typeof messageValue === 'string' && messageValue.trim()
        ? messageValue.trim()
        : undefined,
  };
};

/**
 * GET /market/status returns a bare array of per-symbol rows. Envelopes
 * ({data:[...]}) are tolerated; rows without a symbol are dropped.
 */
export const normalizeMarketStatusListPayload = (payload: unknown): MarketStatusDTO[] => {
  const record = asRecord(payload);
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(record?.data)
      ? record?.data as unknown[]
      : Array.isArray(record?.items)
        ? record?.items as unknown[]
        : [];
  return rows
    .map((row) => normalizeMarketStatusPayload(row))
    .filter((row) => Boolean(row.symbol));
};

/**
 * Text to show beside a closed market (for example "schedule unavailable").
 * Open markets return null because the server's message is just "open".
 */
export const resolveMarketStatusClosedMessage = (
  status: Pick<MarketStatusDTO, 'status' | 'message'> | null | undefined,
): string | null => {
  if (!status || status.status !== 'closed') return null;
  const message = typeof status.message === 'string' ? status.message.trim() : '';
  return message && message.toLowerCase() !== 'closed' ? message : null;
};

export async function fetchAllMarketStatuses(): Promise<MarketStatusDTO[]> {
  const res = await apiClient('/market/status');
  if (!res.ok) {
    throw new Error('Failed to fetch market status');
  }
  return normalizeMarketStatusListPayload(await res.json());
}

export async function fetchMarketStatus(symbol: string): Promise<MarketStatusDTO> {
  const res = await apiClient(`/market/status/${encodeURIComponent(symbol)}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch market status for ${symbol}`);
  }
  return normalizeMarketStatusPayload(await res.json(), symbol);
}
