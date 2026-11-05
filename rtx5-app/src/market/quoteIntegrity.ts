import { normalizeQuoteTickTimestampToMs } from '../api/ws/quoteTimestamp';
import { MARKET_QUOTE_STALE_AFTER_MS } from './quotePolicy';
import {
  captureActiveBrokerSession,
  getActiveBrokerSessionIdentity,
} from '../state/activeBrokerSession';
import { getFeedHealthSnapshot } from './feedHealthRuntime';
import {
  feedHealthAllowsFreshQuoteFallback,
  feedHealthStateMatchesIdentity,
} from './feedHealthState';
import { recordMarketDataEvent } from './marketDataTelemetry';

export type QuoteTransport = 'websocket' | 'rest_snapshot';

export type ExecutableQuoteInput = {
  bid?: unknown;
  ask?: unknown;
  lastReceivedAt?: unknown;
  lastTickAt?: unknown;
  feedTickAt?: unknown;
  ageMs?: unknown;
  ageSec?: unknown;
  transport?: QuoteTransport;
  stale?: boolean;
  tradable?: boolean;
  degraded?: boolean;
  marketState?: string;
};

export type QuoteActionAvailability =
  | { allowed: true; bid: number; ask: number }
  | {
      allowed: false;
      reason:
        | 'missing_quote'
        | 'snapshot_only'
        | 'invalid_price'
        | 'stale_quote'
        | 'degraded_quote'
        | 'not_tradable'
        | 'feed_unavailable';
    };

const toFinitePositiveNumber = (value: unknown): number | undefined => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

/** Normalize seconds/ms/us timestamps so freshness compares against Date.now(). */
const toFreshnessMs = (value: unknown): number | undefined => {
  const ms = normalizeQuoteTickTimestampToMs(value);
  return ms != null && ms > 0 ? ms : undefined;
};

const isFreshTimestampMs = (timestampMs: number | undefined, now: number): boolean => {
  if (timestampMs === undefined) return false;
  const ageMs = now - timestampMs;
  // Allow a small future skew from broker clocks; reject ancient or absurd values.
  return ageMs >= -5_000 && ageMs <= MARKET_QUOTE_STALE_AFTER_MS;
};

/** Live bid/ask freshness never overrides explicit stale, degraded or non-tradable flags. */
export const resolveQuoteActionAvailability = (
  quote: ExecutableQuoteInput | null | undefined,
  now = Date.now(),
): QuoteActionAvailability => {
  if (!quote) {
    return { allowed: false, reason: 'missing_quote' };
  }
  if (quote.stale === true) return { allowed: false, reason: 'stale_quote' };
  if (quote.degraded === true) return { allowed: false, reason: 'degraded_quote' };
  if (quote.tradable === false || quote.marketState && !['open', 'live', 'quoting', 'active'].includes(quote.marketState.toLowerCase())) return { allowed: false, reason: 'not_tradable' };

  if (quote.transport !== 'websocket') {
    return { allowed: false, reason: 'snapshot_only' };
  }

  const bid = toFinitePositiveNumber(quote.bid);
  const ask = toFinitePositiveNumber(quote.ask);
  if (bid === undefined || ask === undefined || ask < bid) {
    return { allowed: false, reason: 'invalid_price' };
  }

  const receivedAt = toFreshnessMs(quote.lastReceivedAt ?? quote.lastTickAt);
  const feedTickAt = toFreshnessMs(quote.feedTickAt);
  const receiptFresh = isFreshTimestampMs(receivedAt, now);
  const sourceFresh = isFreshTimestampMs(feedTickAt, now);

  // Fresh WS receipt or fresh source clock is enough. Do not fail closed solely
  // because feedTickAt is missing, ancient, or wrong, and do not let ageMs /
  // ageSec override a live receipt — those fields are often wrong on real
  // brokers while bid/ask keep updating (SL/TP modify, close, order ticket).
  if (!receiptFresh && !sourceFresh) {
    // Broker `stale` without any fresh anchor is also non-executable.
    return { allowed: false, reason: 'stale_quote' };
  }

  return { allowed: true, bid, ask };
};

/** Active-session guard layered over the quote-local freshness checks. */
export const resolveSessionQuoteActionAvailability = (
  quote: ExecutableQuoteInput | null | undefined,
  now = Date.now(),
): QuoteActionAvailability => {
  const availability = resolveQuoteActionAvailability(quote, now);
  if (!availability.allowed) return availability;

  const capture = captureActiveBrokerSession();
  if (!capture) return { allowed: false, reason: 'feed_unavailable' };
  const identity = getActiveBrokerSessionIdentity(capture.session);
  const health = getFeedHealthSnapshot();
  const healthAllowsActions = feedHealthAllowsFreshQuoteFallback(health, identity, now);
  if (
    !feedHealthStateMatchesIdentity(health, identity) ||
    !healthAllowsActions
  ) {
    // A live, quote-local-fresh websocket tick already proved bid/ask. Do not
    // block SL/TP/close/order solely because the optional health_policy / tick
    // bookkeeping is lagging — that resurfaced as "stale" UX on Modify Position.
    const receivedAt = toFreshnessMs(quote?.lastReceivedAt ?? quote?.lastTickAt);
    const feedTickAt = toFreshnessMs(quote?.feedTickAt);
    if (
      quote?.transport === 'websocket'
      && (isFreshTimestampMs(receivedAt, now) || isFreshTimestampMs(feedTickAt, now))
    ) {
      return availability;
    }
    return { allowed: false, reason: 'feed_unavailable' };
  }
  return availability;
};

export const quoteActionBlockMessage = (availability: QuoteActionAvailability): string => {
  if (availability.allowed) {
    return '';
  }

  switch (availability.reason) {
    case 'snapshot_only':
      return 'A delayed market snapshot is available, but a live tradable quote is required.';
    case 'stale_quote':
      return 'The live quote is stale. Wait for the market feed to recover and try again.';
    case 'degraded_quote':
      return 'The market feed is degraded. Wait for a complete live quote and try again.';
    case 'not_tradable':
      return 'This instrument is currently marked non-tradable by the market feed.';
    case 'invalid_price':
      return 'The live bid/ask is invalid. Wait for the next quote and try again.';
    case 'feed_unavailable':
      return 'Market data is unavailable or delayed. Wait for broker feed health to recover.';
    default:
      return 'A live tradable quote is required before placing this order.';
  }
};

/** Records only the action category and fail-closed reason, never prices or symbols. */
export const recordBlockedPriceAction = (
  action: string,
  availability: QuoteActionAvailability,
): void => {
  if (availability.allowed) return;
  const capture = captureActiveBrokerSession();
  recordMarketDataEvent('trade_blocked', {
    action,
    reason: availability.reason,
    brokerId: capture?.session.brokerId,
    sessionEpoch: capture?.session.sessionEpoch,
  });
};

