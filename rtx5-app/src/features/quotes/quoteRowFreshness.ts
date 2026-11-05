import {
  resolveQuoteActionAvailability,
  type ExecutableQuoteInput,
} from '../../market/quoteIntegrity';
import { MARKET_QUOTE_STALE_AFTER_MS } from '../../market/quotePolicy';
import type { FeedHealthReasonCategory } from '../../market/feedHealthState';

export type QuoteRowFreshnessStatus = 'live' | 'stale' | 'delayed';

export type QuoteRowFreshnessModel = Readonly<{
  status: QuoteRowFreshnessStatus;
  label: 'STALE' | 'DELAYED' | null;
  executable: boolean;
}>;

export type QuoteRowFeedHealth = Readonly<{
  actionsAllowed: boolean;
  reasonCategory?: FeedHealthReasonCategory;
}>;

const STALE_FEED_REASONS = new Set<FeedHealthReasonCategory>([
  'local_tick_stale',
  'server_status_stale',
]);

const positiveFiniteNumber = (value: unknown): number | null => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

const quoteHasExpiredTimestamp = (
  quote: ExecutableQuoteInput | null | undefined,
  now: number,
): boolean => {
  if (!quote) return false;
  const receivedAt = positiveFiniteNumber(quote.lastReceivedAt ?? quote.lastTickAt);
  const feedTickAt = positiveFiniteNumber(quote.feedTickAt);
  const reportedAgeMs = positiveFiniteNumber(quote.ageMs) ?? 0;
  const reportedAgeSec = positiveFiniteNumber(quote.ageSec) ?? 0;

  return Boolean(
    quote.stale === true ||
    (receivedAt && (now < receivedAt || now - receivedAt > MARKET_QUOTE_STALE_AFTER_MS)) ||
    (feedTickAt && (now < feedTickAt || now - feedTickAt > MARKET_QUOTE_STALE_AFTER_MS)) ||
    reportedAgeMs > MARKET_QUOTE_STALE_AFTER_MS ||
    reportedAgeSec * 1_000 > MARKET_QUOTE_STALE_AFTER_MS
  );
};

export const resolveQuoteRowFreshness = (
  quote: ExecutableQuoteInput | null | undefined,
  feedHealth: QuoteRowFeedHealth,
  now = Date.now(),
): QuoteRowFreshnessModel => {
  const availability = resolveQuoteActionAvailability(quote, now);
  const feedExplicitlyStale = Boolean(
    feedHealth.reasonCategory && STALE_FEED_REASONS.has(feedHealth.reasonCategory),
  );
  const executable = availability.allowed && feedHealth.actionsAllowed && !feedExplicitlyStale;
  if (executable) {
    return Object.freeze({ status: 'live', label: null, executable: true });
  }

  const stale = quoteHasExpiredTimestamp(quote, now) ||
    (!availability.allowed && availability.reason === 'stale_quote') ||
    feedExplicitlyStale;

  return Object.freeze({
    status: stale ? 'stale' : 'delayed',
    label: stale ? 'STALE' : 'DELAYED',
    executable: false,
  });
};

/** Returns the one-shot delay needed to repaint a currently fresh row as stale. */
export const getQuoteRowFreshnessRefreshDelayMs = (
  quote: ExecutableQuoteInput | null | undefined,
  now = Date.now(),
): number | null => {
  if (!quote || quote.stale === true) return null;
  const receivedAt = positiveFiniteNumber(quote.lastReceivedAt ?? quote.lastTickAt);
  if (!receivedAt || now < receivedAt) return null;

  const feedTickAt = positiveFiniteNumber(quote.feedTickAt);
  if (quote.transport === 'websocket' && (!feedTickAt || now < feedTickAt)) {
    return null;
  }

  const elapsedSinceReceipt = now - receivedAt;
  const reportedAgeMs = positiveFiniteNumber(quote.ageMs) ?? 0;
  const reportedAgeSecMs = (positiveFiniteNumber(quote.ageSec) ?? 0) * 1_000;
  const effectiveAgeMs = Math.max(
    elapsedSinceReceipt,
    feedTickAt ? now - feedTickAt : 0,
    reportedAgeMs + elapsedSinceReceipt,
    reportedAgeSecMs + elapsedSinceReceipt,
  );
  if (!Number.isFinite(effectiveAgeMs) || effectiveAgeMs > MARKET_QUOTE_STALE_AFTER_MS) {
    return null;
  }

  return Math.max(1, MARKET_QUOTE_STALE_AFTER_MS - effectiveAgeMs + 1);
};
