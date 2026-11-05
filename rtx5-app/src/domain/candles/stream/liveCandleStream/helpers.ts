import type { Candle } from '../../core/candleTypes';
import { MAX_CANDLE_SERIES_LENGTH } from '../../core/candles';
import {
  getExpectedNextCandleTime,
  normalizeSymbol,
  normalizeTimeframeStrict,
} from '../../core/timeframeUtils';
import { sanitizeCandlesForChart } from '../../normalization/chartAdapter';
import { useTradingState } from '../../../../state/tradingState';
import {
  buildRestHistorySeedCandles,
  splitRestHistoryCandles,
  getConfiguredCandlePriceBasis,
} from '../../core/candleProvenance';
import type {
  BufferedLiveEvent,
  CandleHistorySnapshot,
  CandleParams,
  HistorySeedSnapshot,
} from './types';

export const shouldLog = (): boolean =>
  typeof __DEV__ !== 'undefined' &&
  __DEV__ &&
  process.env.EXPO_PUBLIC_DEBUG_CANDLE_STREAM === 'true';

export const logDebug = (event: string, details?: Record<string, unknown>): void => {
  if (shouldLog()) {
    console.log(`[CANDLE-STREAM] ${event}`, details ?? {});
  }
};

export const toCandleParams = (candles: Candle[]): CandleParams[] => candles as CandleParams[];

/**
 * Converts a raw REST history response into a sanitized, chart-ready HistorySeedSnapshot.
 * Truncates arrays to the maximum safe series length to prevent OOM errors.
 */
export const getHistorySeedSnapshot = (history: CandleHistorySnapshot): HistorySeedSnapshot => {
  const seed = buildRestHistorySeedCandles(history.closedCandles, history.currentCandle);
  return {
    candles: sanitizeCandlesForChart(seed.candles, { timeframe: history.timeframe }).slice(-MAX_CANDLE_SERIES_LENGTH),
    closedHistoryLastTime: seed.closedHistoryLastTime,
    currentCandleTime: seed.currentCandleTime,
  };
};

/**
 * Attempts to synchronously recover the last known good candle series from the 
 * global Zustand trading state (if available) before network requests finish.
 */
export const getStoreCache = (symbol: string, timeframe: string): Candle[] => {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedTimeframe = normalizeTimeframeStrict(timeframe);
  if (!normalizedSymbol || !normalizedTimeframe) {
    return [];
  }
  const cached = useTradingState.getState().candles[`${normalizedSymbol}.${normalizedTimeframe}`] ?? [];
  return sanitizeCandlesForChart(cached, { timeframe: normalizedTimeframe }).slice(-MAX_CANDLE_SERIES_LENGTH);
};

export const getEventTime = (event: BufferedLiveEvent): number =>
  event.type === 'live_candle' ? event.candle.time : event.time;

const getSeriesMetadata = (candle: Candle): Partial<CandleParams> => candle as Partial<CandleParams>;

const isSameCandleMetadata = (left: Candle, right: Candle): boolean => {
  const a = getSeriesMetadata(left);
  const b = getSeriesMetadata(right);
  return (
    a.source === b.source &&
    a.closed === b.closed &&
    a.firstUpdateTime === b.firstUpdateTime &&
    a.lastUpdateTime === b.lastUpdateTime &&
    a.lastBackendUpdateTime === b.lastBackendUpdateTime &&
    a.lastQuoteTime === b.lastQuoteTime
  );
};

/**
 * Highly optimized deep equality check for two arrays of candles.
 * Used to skip unnecessary React state updates and re-renders if a tick didn't
 * actually change any visible OHLCV data.
 */
export const isSameSeries = (left: readonly Candle[], right: readonly Candle[]): boolean => {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (
      a.time !== b.time ||
      a.open !== b.open ||
      a.high !== b.high ||
      a.low !== b.low ||
      a.close !== b.close ||
      (a.volume ?? 0) !== (b.volume ?? 0) ||
      !isSameCandleMetadata(a, b)
    ) {
      return false;
    }
  }
  return true;
};

/**
 * Computes the `closedHistoryLastTime` from a cached candle array by
 * splitting it through the same provenance logic that `runLoadHistory` uses.
 *
 * The naïve approach of using `candles[candles.length - 1]?.time` is wrong
 * because the last element is usually the currently forming candle. If we set
 * `historyLastTime` to that value, live candle updates and quote-tick
 * extensions for the active bucket are rejected by the
 * `historyCutoffTime` guard — preventing the live candle from ever generating.
 *
 * Falling back to the naïve approach only when the cache is empty or the split
 * yields no closed candles (single-candle edge case).
 */
/**
 * Detects an empty span between the freshest closed history bar and the start
 * of the live overlay — the "live-edge gap".
 *
 * This is the gap users see even when the backend has full data: the chart
 * seeds REST history (often from a stale background prefetch, so its newest bar
 * is a few minutes old) while live quote ticks open the *current* bucket. The
 * intermediate buckets are never backfilled by the quote-tick path, leaving a
 * hole between history and the live candle.
 *
 * Returns true only when the first live bucket is more than one timeframe step
 * after `historyLastTime` — i.e. at least one whole bucket is missing. A live
 * candle that sits in the bucket immediately after history is contiguous and
 * returns false.
 */
export const hasLiveEdgeHistoryGap = (
  historyLastTime: number | null,
  firstLiveBucketTime: number | null | undefined,
  timeframe: string,
): boolean => {
  if (
    historyLastTime === null ||
    typeof firstLiveBucketTime !== 'number' ||
    !Number.isFinite(firstLiveBucketTime)
  ) {
    return false;
  }
  if (firstLiveBucketTime <= historyLastTime) {
    return false;
  }
  return firstLiveBucketTime > getExpectedNextCandleTime(historyLastTime, timeframe);
};

export const computeClosedHistoryLastTime = (
  candles: readonly Candle[],
  timeframe: string,
): number | null => {
  if (candles.length === 0) {
    return null;
  }

  const { closedHistory } = splitRestHistoryCandles(
    candles as Candle[],
    timeframe,
    getConfiguredCandlePriceBasis(),
  );

  if (closedHistory.length > 0) {
    return closedHistory[closedHistory.length - 1].time;
  }

  // Edge case: single-candle cache (no closed candles). Allow live data
  // for any bucket by returning null (no cutoff).
  return null;
};
