import type { Candle, MutableCandle, Timeframe } from '../core/candleTypes';
import { validateCandle } from '../core/candleValidator';
import {
  areCandleValuesEqual,
  CANDLE_SYMBOL_KEYS,
  CANDLE_TIMEFRAME_KEYS,
  CANDLE_VOLUME_KEYS,
  TICK_TIME_KEYS,
  getNestedRecord,
  pickFirst,
  toFiniteNumber,
  toPositiveFiniteNumber,
  toPublicCandle,
} from '../core/candleUtils';
import {
  getBucketStart,
  normalizeSymbol,
  normalizeTimeframeStrict,
  normalizeTimestampToSeconds,
} from '../core/timeframeUtils';

/**
 * Valid fields for extracting price from a raw tick record.
 */
export type LiveTickPriceField = 'price' | 'bid' | 'ask' | 'mid' | 'last';

/**
 * Represents a parsed and normalized live tick containing
 * the necessary fields to aggregate it into a candle.
 */
export type NormalizedLiveTick = {
  symbol?: string;
  timeframe?: Timeframe;
  time: number;
  bucketTime: number;
  price: number;
  field: LiveTickPriceField;
  volume: number;
};

/**
 * Options to restrict tick normalization to a specific symbol or timeframe.
 */
export type NormalizeLiveTickOptions = {
  expectedSymbol?: string;
  expectedTimeframe?: string;
};

/**
 * Options used when applying a normalized tick to a candle map.
 */
export type ApplyTickOptions = NormalizeLiveTickOptions & {
  /**
   * Ticks with a bucket time older than this cutoff will be ignored.
   */
  historyCutoffTime?: number | null;
};

/**
 * The outcome of attempting to apply a tick to a candle map.
 */
export type ApplyTickResult = {
  /** The resulting public candle, if successfully applied. */
  candle: Candle | null;
  /** True if the candle map was updated (new candle or changed OHLCV). */
  changed: boolean;
  /** True if the tick was rejected. */
  ignored: boolean;
  /** Reason for rejection if ignored is true. */
  reason?: string;
};

/** Order of precedence for extracting the price from a tick. */
const PRICE_KEYS: readonly LiveTickPriceField[] = ['price', 'bid', 'ask', 'mid', 'last'];

/**
 * Traverses common nested payload structures (e.g., { tick: { ... } } or { data: { ... } })
 * to find the actual record containing tick data.
 */
const getNestedTickRecord = (raw: unknown): Record<string, unknown> | null => {
  return getNestedRecord(raw, ['tick', 'quote', 'data']);
};

/**
 * Extracts the best available price from a record based on the PRICE_KEYS precedence.
 * Ensures the price is a strictly positive finite number.
 */
const pickPrice = (record: Record<string, unknown>): { price: number; field: LiveTickPriceField } | null => {
  for (const key of PRICE_KEYS) {
    const price = toPositiveFiniteNumber(record[key]);
    if (price !== null) {
      return { price, field: key };
    }
  }
  return null;
};

/**
 * Finds the most recent bucket time (the "tail") in the current candle map.
 * Used to prevent applying dangerously late ticks that belong to completely missing buckets.
 */
const getCurrentTail = (candleMap: Map<number, MutableCandle>): number | null => {
  let tail: number | null = null;
  for (const time of candleMap.keys()) {
    if (tail === null || time > tail) {
      tail = time;
    }
  }
  return tail;
};

// --- Validation Helpers ---

/**
 * Validates if the extracted symbol matches the expected symbol (case/format-insensitive).
 * Passes if expectedSymbol is not strictly enforced.
 */
const expectedSymbolMatches = (tickSymbol: string | undefined, expectedSymbol: string | undefined): boolean => {
  if (!expectedSymbol || !tickSymbol) {
    return true;
  }
  return normalizeSymbol(tickSymbol) === normalizeSymbol(expectedSymbol);
};

/**
 * Validates if the extracted timeframe matches the expected timeframe.
 * Passes if expectedTimeframe is not strictly enforced.
 */
const expectedTimeframeMatches = (
  tickTimeframe: Timeframe | undefined,
  expectedTimeframe: string | undefined,
): boolean => {
  if (!expectedTimeframe || !tickTimeframe) {
    return true;
  }
  return tickTimeframe === normalizeTimeframeStrict(expectedTimeframe);
};

/**
 * Parses and normalizes an unknown raw tick object into a structured NormalizedLiveTick.
 * Extracts time, price, volume, symbol, and timeframe from various possible keys.
 * Returns null if the tick is invalid or does not match the provided options.
 *
 * @param raw - The raw tick data object.
 * @param timeframe - The target timeframe for the bucket calculation.
 * @param options - Additional validation rules (e.g. expected symbol).
 * @returns A NormalizedLiveTick or null if parsing fails/validation fails.
 */
export const normalizeLiveTick = (
  raw: unknown,
  timeframe: string,
  options: NormalizeLiveTickOptions = {},
): NormalizedLiveTick | null => {
  // Step 1: Unwrap payload safely
  const record = getNestedTickRecord(raw);
  const normalizedTimeframe = normalizeTimeframeStrict(timeframe);
  if (!record || !normalizedTimeframe) {
    return null;
  }

  // Step 2: Extract mandatory time and price
  const time = normalizeTimestampToSeconds(pickFirst(record, TICK_TIME_KEYS));
  const price = pickPrice(record);
  if (time === null || price === null) {
    return null;
  }

  // Step 3: Compute the bucket window for the tick
  const bucketTime = getBucketStart(time, normalizedTimeframe);
  if (bucketTime === null) {
    return null;
  }

  // Step 4: Validate Symbol if an expectation is set
  const symbolValue = pickFirst(record, CANDLE_SYMBOL_KEYS);
  const tickSymbol = typeof symbolValue === 'string' ? normalizeSymbol(symbolValue) : undefined;
  if (!expectedSymbolMatches(tickSymbol, options.expectedSymbol)) {
    return null;
  }

  // Step 5: Validate Timeframe if an expectation is set
  const timeframeValue = pickFirst(record, CANDLE_TIMEFRAME_KEYS);
  const tickTimeframe = normalizeTimeframeStrict(timeframeValue);
  if (!expectedTimeframeMatches(tickTimeframe ?? undefined, options.expectedTimeframe ?? timeframe)) {
    return null;
  }

  // Step 6: Extract volume, defaulting to 0 if absent
  const rawVolume = toFiniteNumber(pickFirst(record, CANDLE_VOLUME_KEYS));
  const volume = rawVolume !== null && rawVolume > 0 ? rawVolume : 0;

  // Step 7: Construct finalized payload
  return {
    ...(tickSymbol ? { symbol: tickSymbol } : {}),
    ...(tickTimeframe ? { timeframe: tickTimeframe } : {}),
    time,
    bucketTime,
    price: price.price,
    field: price.field,
    volume,
  };
};

/**
 * Applies a normalized live tick to a map of mutable candles.
 * Creates a new candle if one doesn't exist for the tick's bucket time,
 * or updates the existing candle's High, Low, Close, and Volume.
 *
 * @param candleMap - The current map of mutable candles keyed by bucket time.
 * @param tick - The normalized tick to apply.
 * @param options - Validation and filtering options (e.g. history cutoff).
 * @returns The result of the operation, indicating if the map changed.
 */
export const aggregateTickToCandleMap = (
  candleMap: Map<number, MutableCandle>,
  tick: NormalizedLiveTick,
  options: ApplyTickOptions = {},
): ApplyTickResult => {
  // Step 1: Strict stream matching validation
  if (!expectedSymbolMatches(tick.symbol, options.expectedSymbol)) {
    return { candle: null, changed: false, ignored: true, reason: 'symbol_mismatch' };
  }
  if (!expectedTimeframeMatches(tick.timeframe, options.expectedTimeframe)) {
    return { candle: null, changed: false, ignored: true, reason: 'timeframe_mismatch' };
  }

  // Step 2: History boundary check (prevent applying ticks to regions handled by history queries)
  const historyCutoff = options.historyCutoffTime;
  if (typeof historyCutoff === 'number' && tick.bucketTime <= historyCutoff) {
    return { candle: null, changed: false, ignored: true, reason: 'older_than_history_cutoff' };
  }

  // Step 3: Out-of-order tick validation for existing buckets
  const existing = candleMap.get(tick.bucketTime);
  if (
    existing?.source === 'live_candle' &&
    typeof existing.lastUpdateTime === 'number' &&
    tick.time < existing.lastUpdateTime
  ) {
    return { candle: null, changed: false, ignored: true, reason: 'stale_tick' };
  }

  // Step 4: Missing bucket threshold check (prevent jumping too far back into empty space)
  if (!existing) {
    const currentTail = getCurrentTail(candleMap);
    if (currentTail !== null && tick.bucketTime < currentTail) {
      return { candle: null, changed: false, ignored: true, reason: 'late_missing_bucket' };
    }
  }

  // Step 5: Mutate or initialize candle OHLCV state
  const next: MutableCandle = existing
    ? {
        ...existing,
        high: Math.max(existing.high, tick.price),
        low: Math.min(existing.low, tick.price),
        close: tick.price,
        volume: (existing.volume ?? 0) + tick.volume,
        source: 'live_candle',
        closed: false,
        firstUpdateTime:
          existing.firstUpdateTime === undefined
            ? tick.time
            : Math.min(existing.firstUpdateTime, tick.time),
        lastUpdateTime: tick.time,
      }
    : {
        time: tick.bucketTime,
        open: tick.price,
        high: tick.price,
        low: tick.price,
        close: tick.price,
        volume: tick.volume,
        source: 'live_candle',
        closed: false,
        firstUpdateTime: tick.time,
        lastUpdateTime: tick.time,
      };

  // Step 6: Sanity check geometric validity (prevent flattened/inverted candles)
  if (!validateCandle(next)) {
    return { candle: null, changed: false, ignored: true, reason: 'invalid_ohlc_after_tick' };
  }

  // Step 7: Apply to map and determine if the UI needs to redraw
  const publicCandle = toPublicCandle(next);
  const changed = !existing || !areCandleValuesEqual(toPublicCandle(existing), publicCandle);
  candleMap.set(tick.bucketTime, next);
  return { candle: publicCandle, changed, ignored: false };
};

