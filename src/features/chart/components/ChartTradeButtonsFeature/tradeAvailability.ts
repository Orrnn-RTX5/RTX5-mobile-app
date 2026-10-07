import {
  resolveQuoteActionAvailability,
  resolveSessionQuoteActionAvailability,
  type ExecutableQuoteInput,
  type QuoteActionAvailability,
} from '../../../../market/quoteIntegrity';
import { MARKET_QUOTE_STALE_AFTER_MS } from '../../../../market/quotePolicy';

export type ChartTradeActionAvailabilityInput = Readonly<{
  isCurrentChartSymbol: boolean;
  oneClickAccepted: boolean;
  quoteActionAllowed: boolean;
}>;

export type ChartTradeQuoteAvailabilityInput = Readonly<{
  quote: ExecutableQuoteInput | null | undefined;
  isPublicDemoTradePrompt: boolean;
  now?: number;
}>;

const toReportedAgeMs = (quote: ExecutableQuoteInput): number => {
  const ageMs = Number(quote.ageMs);
  const ageSec = Number(quote.ageSec);
  return Math.max(
    Number.isFinite(ageMs) && ageMs > 0 ? ageMs : 0,
    Number.isFinite(ageSec) && ageSec > 0 ? ageSec * 1_000 : 0,
  );
};

/**
 * Chart Buy/Sell uses a deliberately strict per-symbol policy. Some feeds
 * repeat an old quote payload over a live socket, which refreshes the local
 * receipt timestamp even though the payload itself says stale/degraded or
 * carries an expired age. Those repeats must never keep a chart trade enabled.
 *
 * Public demo controls use quote-local evidence so a fresh quote can still
 * open the sign-in prompt. Authenticated controls additionally require the
 * active broker-session health checks.
 */
export function resolveChartTradeQuoteAvailability({
  quote,
  isPublicDemoTradePrompt,
  now = Date.now(),
}: ChartTradeQuoteAvailabilityInput): QuoteActionAvailability {
  const availability = isPublicDemoTradePrompt
    ? resolveQuoteActionAvailability(quote, now)
    : resolveSessionQuoteActionAvailability(quote, now);
  if (!availability.allowed || !quote) {
    return availability;
  }

  if (quote.stale === true || toReportedAgeMs(quote) > MARKET_QUOTE_STALE_AFTER_MS) {
    return { allowed: false, reason: 'stale_quote' };
  }
  if (quote.degraded === true) {
    return { allowed: false, reason: 'degraded_quote' };
  }

  return availability;
}

/**
 * Controls whether Buy/Sell are hard-disabled (no press, dimmed chrome).
 *
 * Even though opening New Order is navigation, the chart tile follows the
 * requested symbol-freshness gate. Both routing modes fail closed when the
 * selected symbol has no executable
 * quote. This keeps the visible control state aligned with the same policy the
 * one-click handler rechecks immediately before submission.
 */
export function resolveChartTradeActionDisabled({
  isCurrentChartSymbol,
  // Retained because routing mode remains part of the public availability
  // input even though stale data blocks both direct trade and Order Ticket entry.
  oneClickAccepted: _oneClickAccepted,
  quoteActionAllowed,
}: ChartTradeActionAvailabilityInput): boolean {
  return !isCurrentChartSymbol || !quoteActionAllowed;
}
