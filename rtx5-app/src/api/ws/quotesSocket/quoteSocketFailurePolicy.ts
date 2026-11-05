/**
 * Close/silence policy for the `/ws/feed` quote socket (Backend Contract v3).
 *
 * The feed needs no token, so there is no authentication failure to latch:
 * every close (including 1008/4001/4401/4403, a pre-open 401 and an HTTP 503
 * while the server restarts) is a transport failure retried with backoff.
 *
 * The server sends no heartbeat data frames and quiet symbols can be silent
 * for long stretches (market closed, weekends). Silence therefore only marks
 * prices stale; a reconnect needs 60 s of silence while the market is open.
 */
import type { MarketStatusDTO } from '../../marketStatus';
import { normalizeQuoteSymbolKey, normalizeSymbol } from '../../../domain/symbols';

export type QuoteSocketFailureCategory = 'transport';

export type QuoteSocketCloseDetails = Readonly<{
  code?: number;
  reason?: string | null;
  didOpen: boolean;
}>;

/** After this much silence prices are shown stale; the socket stays open. */
export const QUOTE_WS_SILENT_STALE_MS = 8_000;
/** Silence needed (with the market open) before a silence reconnect. */
export const QUOTE_WS_SILENT_RECONNECT_MS = 60_000;

/** Every quote-socket close is retried with the normal transport backoff. */
export const classifyQuoteSocketClose = (
  _details: QuoteSocketCloseDetails,
): QuoteSocketFailureCategory => 'transport';

export type QuoteSocketSilenceAction = 'none' | 'mark_stale' | 'check_market_then_reconnect';

export const decideQuoteSocketSilenceAction = (silentForMs: number): QuoteSocketSilenceAction => {
  if (!Number.isFinite(silentForMs) || silentForMs <= QUOTE_WS_SILENT_STALE_MS) {
    return 'none';
  }
  return silentForMs >= QUOTE_WS_SILENT_RECONNECT_MS ? 'check_market_then_reconnect' : 'mark_stale';
};

const symbolKeys = (symbol: string): string[] =>
  Array.from(new Set([normalizeQuoteSymbolKey(symbol), normalizeSymbol(symbol)].filter(Boolean)));

/**
 * True when `/market/status` shows any of the subscribed symbols open, or when
 * the status is unknown (request failed, no matching rows, no open/closed
 * evidence). Only explicit "closed" evidence for every matched symbol blocks a
 * silence reconnect.
 */
export const isMarketOpenForSymbols = (
  statuses: readonly Pick<MarketStatusDTO, 'symbol' | 'status' | 'quote_open' | 'trade_open'>[] | null | undefined,
  symbols: Iterable<string>,
): boolean => {
  if (!statuses || statuses.length === 0) return true;
  const wanted = new Set(Array.from(symbols).flatMap(symbolKeys));
  const matched = statuses.filter((row) => symbolKeys(row.symbol).some((key) => wanted.has(key)));
  if (matched.length === 0) return true;

  let sawClosed = false;
  for (const row of matched) {
    if (row.quote_open === true || row.trade_open === true || row.status === 'open') return true;
    if (row.quote_open === false || row.trade_open === false || row.status === 'closed') {
      sawClosed = true;
    } else {
      // No evidence for this symbol: unknown is treated as open.
      return true;
    }
  }
  return !sawClosed;
};
