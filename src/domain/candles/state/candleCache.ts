/**
 * Shared chart candle cache.
 *
 * The cache is keyed strictly by normalized symbol + timeframe and stores only
 * sanitized backend/live candles. It never fills missing buckets and never
 * mixes data across chart contexts.
 */
import { sanitizeCandlesForChart } from '../normalization/chartAdapter';
import {
  MAX_CANDLE_SERIES_LENGTH,
  normalizeSymbol,
  normalizeTimeframeStrict,
} from '../core/candles';
import type { Candle } from '../../../state/tradingState';
import { useTradingState } from '../../../state/tradingState';
import { persistCanonicalCandleCache } from './persistedCandleCache';
import {
  getConfiguredCandlePriceBasis,
  isTrustedHistoryCandle,
  splitRestHistoryCandles,
} from '../core/candleProvenance';
import {
  captureActiveBrokerSessionProvenance,
  isActiveBrokerSessionProvenanceCurrent,
  type ActiveBrokerSessionProvenance,
} from '../../../state/activeBrokerSession';

/**
 * Strict equality check for two candle objects, comparing all core OHLCV values.
 * Used to avoid redundant state updates.
 */
const areCandlesEqual = (left: Candle, right: Candle): boolean =>
  left.time === right.time &&
  left.open === right.open &&
  left.high === right.high &&
  left.low === right.low &&
  left.close === right.close &&
  (left.volume ?? 0) === (right.volume ?? 0);

/**
 * Checks if two entire candle series are identical.
 * Short-circuits on length mismatches before checking individual candles.
 */
const areSeriesEqual = (left: Candle[], right: Candle[]): boolean => {
  if (left === right || left.length !== right.length) {
    return left === right;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (!areCandlesEqual(left[index], right[index])) {
      return false;
    }
  }
  return true;
};

const normalizeCandleKey = (symbol: string, timeframe: string) => {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedTimeframe = normalizeTimeframeStrict(timeframe);

  if (!normalizedSymbol || !normalizedTimeframe) {
    return null;
  }

  return {
    key: `${normalizedSymbol}.${normalizedTimeframe}`,
    symbol: normalizedSymbol,
    timeframe: normalizedTimeframe,
  };
};

type SyncMergedCandleCacheOptions = {
  canonical?: boolean;
  provenance?: ActiveBrokerSessionProvenance;
};

const resolveCurrentCandleCacheProvenance = (
  provided?: ActiveBrokerSessionProvenance,
): ActiveBrokerSessionProvenance | null => {
  const provenance = provided ?? captureActiveBrokerSessionProvenance();
  return provenance && isActiveBrokerSessionProvenanceCurrent(provenance)
    ? provenance
    : null;
};

/**
 * Extracts and sanitizes ONLY the fully closed, trusted historical candles from a raw array.
 * We never cache active/live candles to prevent persisting temporary, incomplete states.
 */
const buildClosedHistoryCacheSeries = (candles: Candle[], timeframe: string): Candle[] => {
  const trustedHistory = candles.filter(isTrustedHistoryCandle);
  if (trustedHistory.length > 0) {
    return sanitizeCandlesForChart(trustedHistory, { timeframe }).slice(-MAX_CANDLE_SERIES_LENGTH);
  }

  const { closedHistory } = splitRestHistoryCandles(
    sanitizeCandlesForChart(candles, { timeframe }),
    timeframe,
    getConfiguredCandlePriceBasis(),
  );
  return closedHistory.slice(-MAX_CANDLE_SERIES_LENGTH);
};

/**
 * Synchronizes an array of candles into the global in-memory Zustand store and 
 * the persistent local storage cache. 
 * Only updates if the new series differs from the current cached series.
 * 
 * @returns True if the cache was updated, false if skipped (identical data or errors).
 */
export const syncMergedCandleCache = (
  symbol: string,
  timeframe: string,
  candles: Candle[],
  options?: SyncMergedCandleCacheOptions,
): boolean => {
  const provenance = resolveCurrentCandleCacheProvenance(options?.provenance);
  if (!provenance) return false;
  const normalized = normalizeCandleKey(symbol, timeframe);
  if (!normalized) {
    return false;
  }

  const nextCandles = buildClosedHistoryCacheSeries(candles, normalized.timeframe);
  if (nextCandles.length === 0) {
    return false;
  }

  const currentCandles = useTradingState.getState().candles[normalized.key] ?? [];
  if (areSeriesEqual(currentCandles, nextCandles)) {
    return false;
  }

  if (!isActiveBrokerSessionProvenanceCurrent(provenance)) return false;
  useTradingState.getState().setCandleHistory(normalized.symbol, normalized.timeframe, nextCandles);
  persistCanonicalCandleCache(normalized.symbol, normalized.timeframe, nextCandles, provenance);
  return true;
};

/**
 * Similar to `syncMergedCandleCache`, but explicitly returns the newly built 
 * cache array for immediate use by the caller.
 */
export const mergeHistoryIntoCandleCache = (
  symbol: string,
  timeframe: string,
  historyCandles: Candle[],
  options?: SyncMergedCandleCacheOptions,
): Candle[] => {
  const provenance = resolveCurrentCandleCacheProvenance(options?.provenance);
  if (!provenance) return [];
  const normalized = normalizeCandleKey(symbol, timeframe);
  if (!normalized) {
    return [];
  }

  const nextCandles = buildClosedHistoryCacheSeries(historyCandles, normalized.timeframe);
  const currentCandles = useTradingState.getState().candles[normalized.key] ?? [];
  if (!areSeriesEqual(currentCandles, nextCandles)) {
    if (!isActiveBrokerSessionProvenanceCurrent(provenance)) return [];
    useTradingState.getState().setCandleHistory(normalized.symbol, normalized.timeframe, nextCandles);
    persistCanonicalCandleCache(normalized.symbol, normalized.timeframe, nextCandles, provenance);
  }

  return nextCandles;
};
