import type { MarketStatusDTO, MarketStatusPhase } from '../api/marketStatus';

export type ChartQuoteSessionPhase = 'open' | 'closed' | 'unknown';

export type ChartMarketSessionPolicy = Readonly<{
  quotePhase: ChartQuoteSessionPhase;
  tradeOpen: boolean | null;
  sessionOpen: number | null;
  sessionClose: number | null;
  serverTime: number | null;
  reason:
    | 'quote_open'
    | 'quote_closed'
    | 'status_open'
    | 'status_closed'
    | 'insufficient_backend_evidence';
}>;

const finiteTimestampOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

/**
 * Resolve chart activity from the per-symbol backend contract.
 *
 * `quote_open` wins because quote sessions and trade sessions are not the same
 * thing (for example, an after-hours symbol may still publish prices). Asset
 * names and broker names are intentionally absent: BTC normally remains open
 * because its own status says so, while an explicit maintenance closure is
 * still respected. Missing/ambiguous evidence fails open and never truncates
 * candle history.
 */
export const resolveChartMarketSessionPolicy = (
  status: Partial<MarketStatusDTO> | null | undefined,
): ChartMarketSessionPolicy => {
  let quotePhase: ChartQuoteSessionPhase = 'unknown';
  let reason: ChartMarketSessionPolicy['reason'] = 'insufficient_backend_evidence';

  if (status?.quote_open === true) {
    quotePhase = 'open';
    reason = 'quote_open';
  } else if (status?.quote_open === false) {
    quotePhase = 'closed';
    reason = 'quote_closed';
  } else if (status?.status === 'open') {
    quotePhase = 'open';
    reason = 'status_open';
  } else if (status?.status === 'closed') {
    quotePhase = 'closed';
    reason = 'status_closed';
  }

  return {
    quotePhase,
    tradeOpen:
      typeof status?.trade_open === 'boolean' ? status.trade_open : null,
    sessionOpen: finiteTimestampOrNull(status?.session_open),
    sessionClose: finiteTimestampOrNull(status?.session_close),
    serverTime: finiteTimestampOrNull(status?.server_time),
    reason,
  };
};

/** A history baseline is reconciled once when a confirmed closed feed reopens. */
export const shouldRefreshChartHistoryOnSessionTransition = (
  previous: ChartQuoteSessionPhase,
  next: ChartQuoteSessionPhase,
): boolean => previous === 'closed' && next === 'open';

export const isConfirmedChartQuoteSessionClosed = (
  policy: ChartMarketSessionPolicy,
): boolean => policy.quotePhase === 'closed';

export const isConfirmedChartQuoteSessionOpen = (
  policy: ChartMarketSessionPolicy,
): boolean => policy.quotePhase === 'open';

export type { MarketStatusPhase };
