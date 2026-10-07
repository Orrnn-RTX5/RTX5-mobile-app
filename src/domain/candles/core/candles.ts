import {
  normalizeHistoryCandle,
  normalizeHistoryCandles,
  normalizeLiveCandle,
} from '../normalization/candleNormalizer';
import {
  createCandleMap,
  materializeCandleMap,
  mergeCandleByTimestamp,
  mergeCandleIntoMap,
  mergeHistoryAndLiveMaps,
  sortAndDedupeCandles as canonicalSortAndDedupeCandles,
} from '../series/candleSeriesMerger';
import {
  type CandleValidationContext,
  logCandleSeriesDiagnosticsInDevelopment,
  validateCandle,
  validateCandles,
} from './candleValidator';
import {
  CANDLE_HISTORY_TIMEFRAMES,
  BRIDGE_CANDLE_TIMEFRAMES,
  type BridgeCandleTimeframe,
  createCandleStreamKey,
  getBucketGapCount,
  getBucketStart,
  getExpectedNextCandleTime,
  getTimeframeSeconds,
  isCandleHistoryTimeframe,
  isSupportedTimeframe,
  normalizeCandleHistoryTimeframe,
  normalizeCandleHistoryTimeframeStrict,
  normalizeSymbol,
  normalizeTimeframe,
  normalizeTimeframeStrict,
  normalizeTimestampToSeconds,
  toBridgeCandleTf,
  toRestCandleTf,
  SUPPORTED_TIMEFRAMES,
} from './timeframeUtils';
import type { Candle } from './candleTypes';

export type { Candle } from './candleTypes';
export type { CandleValidationContext } from './candleValidator';
export {
  CANDLE_HISTORY_TIMEFRAMES,
  BRIDGE_CANDLE_TIMEFRAMES,
  type BridgeCandleTimeframe,
  createCandleStreamKey,
  getBucketGapCount,
  getExpectedNextCandleTime,
  getTimeframeSeconds,
  isCandleHistoryTimeframe,
  isSupportedTimeframe,
  normalizeCandleHistoryTimeframe,
  normalizeCandleHistoryTimeframeStrict,
  normalizeSymbol,
  normalizeTimeframe,
  normalizeTimeframeStrict,
  normalizeTimestampToSeconds,
  toBridgeCandleTf,
  toRestCandleTf,
  logCandleSeriesDiagnosticsInDevelopment,
  SUPPORTED_TIMEFRAMES,
  validateCandles,
};

export const MAX_CANDLE_SERIES_LENGTH = 2_500;
export const DEFAULT_CANDLE_HISTORY_LIMIT = MAX_CANDLE_SERIES_LENGTH;
export const MIN_TRUSTED_BOOTSTRAP_CANDLE_COUNT = 8;
// Keep enough chart contexts in the authenticated runtime cache for a normal
// multi-symbol browsing session. The smaller persisted cap below remains
// intentionally separate so this does not increase AsyncStorage usage.
export const MAX_CANDLE_CACHE_ENTRIES = 24;
export const MAX_PERSISTED_CANDLE_CACHE_ENTRIES = 8;
export const CANDLE_HISTORY_QUERY_GC_MS = 60_000;
export const LATEST_DAILY_CANDLE_HISTORY_LIMIT = 2;

/**
 * Represents the different types of WebSocket events that can arrive for a candle stream.
 * - 'full_sync': Replaces the entire series (e.g., initial load, timeframe change).
 * - 'replace_last': Overwrites the current active candle (standard live update).
 * - 'append': Adds a new closed candle and starts the next one.
 * - 'resync_required': Instructs the frontend to drop state and re-fetch from REST.
 */
export type CandleStreamEvent =
  | { type: 'full_sync'; symbol: string; tf: string; candles: Candle[]; reason: 'subscription_change' | 'history_seed' | 'resync' | 'historical_patch' }
  | { type: 'replace_last'; symbol: string; tf: string; candle: Candle }
  | { type: 'append'; symbol: string; tf: string; candle: Candle }
  | { type: 'resync_required'; symbol: string; tf: string; reason: string };

/**
 * A wrapper for a raw live candle payload that also tracks whether the backend
 * explicitly provided high/low boundaries, which affects how we merge it.
 */
export type NormalizedIncomingCandle = {
  candle: Candle;
  hasExplicitHighLow: boolean;
};

/** Snaps a raw Unix seconds timestamp to the start of its respective candle bucket. */
export const alignTimeToBucket = (timeInSeconds: number, timeframe: string): number =>
  getBucketStart(timeInSeconds, timeframe) ?? Math.floor(timeInSeconds);

/** Alias for alignTimeToBucket. The reference bucket argument is accepted by the public candle API. */
export const alignTimeToBucketWithReference = (
  timeInSeconds: number,
  timeframe: string,
  _referenceBucketTime?: number | null,
): number => alignTimeToBucket(timeInSeconds, timeframe);

/** Parses an unknown timestamp and snaps it directly to a bucket start time in seconds. */
export const normalizeTimestampToBucket = (
  value: unknown,
  timeframe: string,
  _referenceBucketTime?: number | null,
): number | null => {
  const timestamp = normalizeTimestampToSeconds(value);
  return timestamp === null ? null : alignTimeToBucket(timestamp, timeframe);
};

/** Validates if an object loosely matches the required OHLC properties of a Candle. */
export const isStructurallyValidCandle = (
  candle: Pick<Candle, 'time' | 'open' | 'high' | 'low' | 'close'> | null | undefined,
): candle is Pick<Candle, 'time' | 'open' | 'high' | 'low' | 'close'> => validateCandle(candle);

/** Checks if a candle's timestamp perfectly aligns with the start of a bucket for the given timeframe. */
export const isBucketAlignedCandle = (candle: Pick<Candle, 'time'>, timeframe: string): boolean => {
  if (!Number.isFinite(candle.time)) {
    return false;
  }

  const normalizedTimeframe = normalizeTimeframe(timeframe);
  if (normalizedTimeframe === 'D1' || normalizedTimeframe === 'W1' || normalizedTimeframe === 'MN') {
    return true;
  }

  return alignTimeToBucket(candle.time, normalizedTimeframe) === candle.time;
};

/**
 * Normalizes an unknown WebSocket payload into a structured NormalizedIncomingCandle.
 * Attempts to parse nested payload structures (e.g., { candle: { ... } }).
 */
export const parseIncomingCandlePayload = (
  input: unknown,
  _timeframe: string,
): NormalizedIncomingCandle | null => {
  const candle = normalizeLiveCandle(input);
  if (!candle) {
    return null;
  }

  const record = input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
  const nested = record.candle && typeof record.candle === 'object' && !Array.isArray(record.candle)
    ? (record.candle as Record<string, unknown>)
    : record;
  const hasExplicitHighLow =
    ['high', 'h', 'High', 'H'].some((key) => Number.isFinite(Number(nested[key]))) &&
    ['low', 'l', 'Low', 'L'].some((key) => Number.isFinite(Number(nested[key])));

  return { candle, hasExplicitHighLow };
};

/** Removes duplicate candles belonging to the same bucket from an array of incoming payloads. */
export const dedupeIncomingCandlePayloads = (
  entries: NormalizedIncomingCandle[],
): NormalizedIncomingCandle[] => {
  const byTime = new Map<number, NormalizedIncomingCandle>();
  for (const entry of entries) {
    if (validateCandle(entry.candle)) {
      byTime.set(entry.candle.time, {
        candle: { ...entry.candle },
        hasExplicitHighLow: entry.hasExplicitHighLow,
      });
    }
  }
  return Array.from(byTime.values()).sort((left, right) => left.candle.time - right.candle.time);
};

/** Extracts a normalized array of incoming candles from heavily nested or varying REST/WS JSON structures. */
export const extractIncomingCandlePayloads = (
  payload: unknown,
  timeframe: string,
): NormalizedIncomingCandle[] => {
  const parsed: NormalizedIncomingCandle[] = [];
  const push = (value: unknown) => {
    const entry = parseIncomingCandlePayload(value, timeframe);
    if (entry) parsed.push(entry);
  };

  if (Array.isArray(payload)) {
    payload.forEach(push);
    return dedupeIncomingCandlePayloads(parsed);
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const nested = Array.isArray(record.data)
    ? record.data
    : Array.isArray(record.candles)
      ? record.candles
      : Array.isArray(record.items)
        ? record.items
        : null;

  if (nested) {
    nested.forEach(push);
  } else {
    push(record.candle ?? record);
  }

  return dedupeIncomingCandlePayloads(parsed);
};

/** Converts an array of raw unknown data objects into a strictly validated and sorted array of Candles. */
export const normalizeCandleSeries = (candles: unknown[], _timeframe: string): Candle[] =>
  canonicalSortAndDedupeCandles(normalizeHistoryCandles(candles));

/** Deduplicates and sorts an array of Candles by time. */
export const sortAndDedupeCandles = (candles: Candle[]): Candle[] =>
  canonicalSortAndDedupeCandles(candles);

/** Attempts to merge a live candle over an existing candle. Returns null if either is geometrically invalid. */
export const mergeCandleUpdate = (existing: Candle, incoming: Candle): Candle | null =>
  validateCandle(existing) && validateCandle(incoming)
    ? mergeCandleByTimestamp(existing, incoming, { volumeStrategy: 'sum' })
    : null;

/** Gets the exact Unix SECONDS of the bucket that encompasses the current system time. */
export const getCurrentBucketTime = (
  timeframe: string,
  nowInSeconds: number = Math.floor(Date.now() / 1000),
): number => alignTimeToBucket(nowInSeconds, timeframe);

/** Checks if a candle's time belongs to the active, unclosed bucket currently forming right now. */
export const isWithinLiveBucketHorizon = (
  candleTime: number,
  timeframe: string,
  nowInSeconds: number = Math.floor(Date.now() / 1000),
): boolean => candleTime <= getExpectedNextCandleTime(getCurrentBucketTime(timeframe, nowInSeconds), timeframe);

/**
 * Detects if the candle series ends with a very short sequence of candles (a "tail")
 * that is separated from the main historical block by a massive time gap.
 * Useful for catching bad historical pagination jumps.
 */
export const hasDetachedShortCandleTail = (
  candles: Candle[],
  timeframe: string,
  maxDetachedTailCandles: number = 3,
): boolean => {
  const normalized = sortAndDedupeCandles(candles);
  if (normalized.length <= 1) {
    return false;
  }

  for (let index = normalized.length - 2; index >= 0; index -= 1) {
    if (getBucketGapCount(normalized[index].time, normalized[index + 1].time, timeframe) <= 1) {
      continue;
    }
    return normalized.length - (index + 1) <= maxDetachedTailCandles;
  }
  return false;
};

/** Checks if we have enough continuous historical candles to render a chart properly. */
export const isTrustworthyCandleBootstrapSeed = (
  candles: Candle[],
  _timeframe: string,
  minCandles: number = MIN_TRUSTED_BOOTSTRAP_CANDLE_COUNT,
): boolean => {
  const normalized = sortAndDedupeCandles(candles);
  return normalized.length >= minCandles;
};

/** Checks if the most recent candle in a series is sufficiently close to current time (not hopelessly stale). */
export const isRecentCandleBootstrapSeed = (
  candles: Candle[],
  timeframe: string,
  maxStalenessBuckets: number = 2,
  nowInSeconds: number = Math.floor(Date.now() / 1000),
): boolean => {
  const normalized = sortAndDedupeCandles(candles);
  const last = normalized[normalized.length - 1];
  if (!last) {
    return false;
  }

  let allowed = last.time;
  for (let index = 0; index < maxStalenessBuckets; index += 1) {
    allowed = getExpectedNextCandleTime(allowed, timeframe);
  }
  return nowInSeconds <= allowed;
};

/** Combines trustworthiness (length) and recency checks to determine if a chart can safely render. */
export const isRenderableCandleBootstrapSeed = (
  candles: Candle[],
  timeframe: string,
  minCandles: number = MIN_TRUSTED_BOOTSTRAP_CANDLE_COUNT,
  maxStalenessBuckets: number = 2,
  nowInSeconds: number = Math.floor(Date.now() / 1000),
): boolean =>
  isTrustworthyCandleBootstrapSeed(candles, timeframe, minCandles) &&
  isRecentCandleBootstrapSeed(candles, timeframe, maxStalenessBuckets, nowInSeconds);

/**
 * Checks if an incoming real-time price tick is dangerously far into the future compared to the last known candle.
 * This indicates a disconnect/sleep event where the user lost network for a long time.
 */
export const hasExcessiveLivePriceGap = (
  candles: Candle[],
  price: number,
  timestamp: unknown,
  timeframe: string,
  maxGapCandles: number = 5,
): boolean => {
  const normalized = sortAndDedupeCandles(candles);
  const last = normalized[normalized.length - 1];
  const incomingTime = normalizeTimestampToBucket(timestamp, timeframe);
  return Boolean(
    last &&
      incomingTime !== null &&
      Number.isFinite(price) &&
      incomingTime > last.time &&
      getBucketGapCount(last.time, incomingTime, timeframe) > maxGapCandles,
  );
};

/** Discards live real-time candles that fall in a time range now covered by authoritative REST history. */
export const pruneLiveCandlesCoveredByHistory = (
  historyCandles: Candle[],
  liveCandles: Candle[],
): Candle[] => {
  const history = sortAndDedupeCandles(historyCandles);
  const live = sortAndDedupeCandles(liveCandles);
  const historyLast = history[history.length - 1]?.time;
  return historyLast === undefined ? live : live.filter((candle) => candle.time > historyLast);
};

/** Merges REST history and active WebSocket candles into a single unified array. */
export const materializeHistoryAndLiveCandles = (
  historyCandles: Candle[],
  liveCandles: Candle[],
  timeframe: string,
): Candle[] => mergeHistoryAndLiveMaps(historyCandles, liveCandles, timeframe, MAX_CANDLE_SERIES_LENGTH);

export const materializeCanonicalHistoryAndLiveCandles = materializeHistoryAndLiveCandles;

/** Merges REST history and active WebSocket candles into a single unified array (alias). */
export const overlayLiveCandlesOnHistory = (
  historyCandles: Candle[],
  liveCandles: Candle[],
  timeframe: string = 'M1', // Default or require passing it if used
): Candle[] => mergeHistoryAndLiveMaps(historyCandles, liveCandles, timeframe, MAX_CANDLE_SERIES_LENGTH);

/** Safely splices a newly fetched chunk of REST history into the existing full series map. */
export const mergeRecentHistoryIntoCandles = (
  candles: Candle[],
  recentHistory: Candle[],
  _timeframe: string,
): Candle[] => {
  const map = createCandleMap(candles);
  for (const candle of sortAndDedupeCandles(recentHistory)) {
    mergeCandleIntoMap(map, candle, { source: 'history', closed: true, volumeStrategy: 'sum' });
  }
  return materializeCandleMap(map, MAX_CANDLE_SERIES_LENGTH);
};
