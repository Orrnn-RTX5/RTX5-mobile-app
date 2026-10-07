import type { MarketStatusDTO } from '../api/marketStatus';
import {
  CLOSED_MARKET_HISTORY_WARM_LIMIT,
  INITIAL_HISTORY_LIMIT,
} from '../domain/candles/stream/liveCandleStream/types';

/**
 * Choose the first history window for an explicitly selected chart context.
 *
 * Only the backend's per-symbol quote flag can request the deeper closed-
 * market window. Symbol names, asset classes, broker names, weekends, and a
 * generic `status: "closed"` are deliberately ignored here. This keeps every
 * broker on one rule and leaves continuously streaming or unknown markets on
 * the normal lightweight path.
 */
export const resolveChartSelectionHistoryWarmLimit = (
  status: Pick<MarketStatusDTO, 'quote_open'> | null | undefined,
): number =>
  status?.quote_open === false
    ? CLOSED_MARKET_HISTORY_WARM_LIMIT
    : INITIAL_HISTORY_LIMIT;
