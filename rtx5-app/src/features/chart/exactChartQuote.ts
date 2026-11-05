import { normalizeQuoteTickTimestampToMs } from '../../api/ws/quoteTimestamp';

export type ExactChartQuoteSnapshot = Readonly<{
  scopeKey: string;
  bid: number;
  ask: number;
  feedTickAt?: number;
  receivedAt?: number;
  receiptMonotonicAt?: number;
  transport?: string;
  source?: string;
  authority?: string;
}>;

export type ExactChartQuoteInput = {
  bid?: unknown;
  ask?: unknown;
  feedTickAt?: unknown;
  timestamp?: unknown;
  lastTickAt?: unknown;
  receivedAt?: unknown;
  lastReceivedAt?: unknown;
  receiptMonotonicAt?: unknown;
  transport?: unknown;
  source?: unknown;
  authority?: unknown;
};

const positiveFinite = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;

const cleanString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

/**
 * Capture an exact backend Bid/Ask pair for display. No side is calculated from
 * candle close, spread, symbol precision, or another broker's cached value.
 */
export const captureExactChartQuote = (
  scopeKey: string,
  quote: ExactChartQuoteInput | null | undefined,
): ExactChartQuoteSnapshot | null => {
  if (!scopeKey || !quote) return null;
  const bid = positiveFinite(quote.bid);
  const ask = positiveFinite(quote.ask);
  if (bid === undefined || ask === undefined || ask < bid) return null;

  const feedTickAt =
    positiveFinite(quote.feedTickAt) ??
    positiveFinite(quote.timestamp) ??
    positiveFinite(quote.lastTickAt);
  const receivedAt =
    positiveFinite(quote.receivedAt) ?? positiveFinite(quote.lastReceivedAt);
  const receiptMonotonicAt = positiveFinite(quote.receiptMonotonicAt);

  return {
    scopeKey,
    bid,
    ask,
    ...(feedTickAt === undefined ? {} : { feedTickAt }),
    ...(receivedAt === undefined ? {} : { receivedAt }),
    ...(receiptMonotonicAt === undefined ? {} : { receiptMonotonicAt }),
    ...(cleanString(quote.transport) === undefined ? {} : { transport: cleanString(quote.transport) }),
    ...(cleanString(quote.source) === undefined ? {} : { source: cleanString(quote.source) }),
    ...(cleanString(quote.authority) === undefined ? {} : { authority: cleanString(quote.authority) }),
  };
};

export const readExactChartQuoteForScope = (
  scopeKey: string,
  retained: ExactChartQuoteSnapshot | null | undefined,
): ExactChartQuoteSnapshot | null =>
  retained?.scopeKey === scopeKey ? retained : null;

export const isSameExactChartQuote = (
  left: ExactChartQuoteSnapshot | null | undefined,
  right: ExactChartQuoteSnapshot | null | undefined,
): boolean =>
  left?.scopeKey === right?.scopeKey &&
  left?.bid === right?.bid &&
  left?.ask === right?.ask &&
  left?.feedTickAt === right?.feedTickAt &&
  left?.receivedAt === right?.receivedAt &&
  left?.receiptMonotonicAt === right?.receiptMonotonicAt;

const compareOptionalOrder = (left: number | null, right: number | null): number => {
  if (left === null && right === null) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  return left === right ? 0 : left > right ? 1 : -1;
};

/**
 * Retain only a strictly newer quote snapshot. A delayed React/store observer
 * often replays the exact direct websocket tick hundreds of milliseconds
 * later; ties deliberately keep the current direct snapshot so that replay can
 * never rewind a newer Chart paint merely because its Bid/Ask differs.
 */
export const selectNewestExactChartQuote = (
  current: ExactChartQuoteSnapshot | null | undefined,
  candidate: ExactChartQuoteSnapshot | null | undefined,
): ExactChartQuoteSnapshot | null => {
  if (!candidate) return current ?? null;
  if (!current || current.scopeKey !== candidate.scopeKey) return candidate;

  const monotonicComparison = compareOptionalOrder(
    positiveFinite(candidate.receiptMonotonicAt) ?? null,
    positiveFinite(current.receiptMonotonicAt) ?? null,
  );
  if (
    candidate.receiptMonotonicAt !== undefined &&
    current.receiptMonotonicAt !== undefined &&
    monotonicComparison !== 0
  ) {
    return monotonicComparison > 0 ? candidate : current;
  }

  const receivedComparison = compareOptionalOrder(
    normalizeQuoteTickTimestampToMs(candidate.receivedAt),
    normalizeQuoteTickTimestampToMs(current.receivedAt),
  );
  if (receivedComparison !== 0) {
    return receivedComparison > 0 ? candidate : current;
  }

  const feedComparison = compareOptionalOrder(
    normalizeQuoteTickTimestampToMs(candidate.feedTickAt),
    normalizeQuoteTickTimestampToMs(current.feedTickAt),
  );
  return feedComparison > 0 ? candidate : current;
};
