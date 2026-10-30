import {
  normalizeQuoteTickPayload,
  type QuoteTickEvent,
} from '../api/ws/quoteTickNormalizer';
import { normalizeQuoteTickTimestampToMs } from '../api/ws/quoteTimestamp';

export const buildRestQuoteTickEvent = (
  requestedSymbol: string,
  snapshot: unknown,
  receivedAt = Date.now(),
): QuoteTickEvent | null => {
  const record = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
    ? (snapshot as Record<string, unknown>)
    : {};
  const normalized = normalizeQuoteTickPayload({ symbol: requestedSymbol, ...record }, receivedAt);
  if (!normalized.ok) {
    return null;
  }

  const { update } = normalized;
  const rawTimestamp = update.timestamp ?? receivedAt;
  const feedTickAt = normalizeQuoteTickTimestampToMs(rawTimestamp) ?? receivedAt;
  const timestamp = feedTickAt;

  return {
    symbol: update.symbol,
    rawSymbol: update.rawSymbol,
    bid: update.bid,
    ask: update.ask,
    last: update.last,
    high: update.high,
    low: update.low,
    open: update.open,
    dailyOpen: update.dailyOpen,
    previousClose: update.previousClose,
    changePct: update.changePct,
    spread: update.spread,
    volume: update.volume,
    digits: update.digits,
    point: update.point,
    tickSize: update.tickSize,
    transport: 'rest_snapshot',
    tradable: false,
    degraded: true,
    feedTickAt,
    receivedAt,
    timestamp,
  };
};
