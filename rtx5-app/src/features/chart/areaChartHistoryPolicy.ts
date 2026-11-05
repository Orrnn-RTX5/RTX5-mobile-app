import { normalizeTimeframeStrict } from '../../domain/candles/core/timeframeUtils';
import {
  INITIAL_HISTORY_LIMIT,
  PAGINATED_HISTORY_LIMIT,
} from '../../domain/candles/stream/liveCandleStream/types';

/**
 * Area is an overview of the selected candle timeframe, not a second date-range
 * selector. These bounded targets ask for genuine closes at that timeframe so
 * the line can be compressed without interpolating or inventing price points.
 */
const AREA_HISTORY_TARGET_BY_TIMEFRAME = Object.freeze({
  M1: PAGINATED_HISTORY_LIMIT,
  M5: 420,
  M15: 360,
  M30: 320,
  H1: 280,
  H4: 240,
  D1: 220,
  W1: 180,
  MN: 144,
} as const);

export const resolveAreaChartHistoryTarget = (timeframe: string): number => {
  const normalizedTimeframe = normalizeTimeframeStrict(timeframe);
  if (!normalizedTimeframe) {
    return INITIAL_HISTORY_LIMIT;
  }

  return AREA_HISTORY_TARGET_BY_TIMEFRAME[normalizedTimeframe];
};

export const resolveAreaChartVisibleBarTarget = (
  timeframe: string,
  renderLimit?: number | null,
): number => {
  const historyTarget = resolveAreaChartHistoryTarget(timeframe);
  if (typeof renderLimit !== 'number' || !Number.isFinite(renderLimit)) {
    return historyTarget;
  }

  return Math.max(1, Math.min(historyTarget, Math.floor(renderLimit)));
};

export const resolveChartHistoryTarget = (
  chartType: string,
  timeframe: string,
): number => chartType === 'area'
  ? resolveAreaChartHistoryTarget(timeframe)
  : INITIAL_HISTORY_LIMIT;

export const AREA_CHART_HISTORY_TARGETS = AREA_HISTORY_TARGET_BY_TIMEFRAME;

