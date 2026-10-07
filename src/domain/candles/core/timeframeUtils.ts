import { normalizeSymbol as normalizeMarketSymbol } from '../../symbols';
import type { CandleStreamKey, Timeframe } from './candleTypes';

/**
 * A standard list of all timeframe identifiers supported by the frontend logic.
 * These map to recognizable minute, hour, day, week, and month buckets.
 */
export const SUPPORTED_TIMEFRAMES: readonly Timeframe[] = [
  'M1',
  'M5',
  'M15',
  'M30',
  'H1',
  'H4',
  'D1',
  'W1',
  'MN',
];

/**
 * Timeframes currently supported by the backend candle-history REST contract.
 */
export const CANDLE_HISTORY_TIMEFRAMES: readonly Timeframe[] = [
  'M1',
  'M5',
  'M15',
  'M30',
  'H1',
  'H4',
  'D1',
  'W1',
  'MN',
];

export const BRIDGE_CANDLE_TIMEFRAMES = [
  '1m',
  '5m',
  '15m',
  '30m',
  '1h',
  '4h',
  '1d',
] as const;

export type BridgeCandleTimeframe = typeof BRIDGE_CANDLE_TIMEFRAMES[number];

const BRIDGE_CANDLE_TF_BY_CANONICAL: Partial<Record<Timeframe, BridgeCandleTimeframe>> = {
  M1: '1m',
  M5: '5m',
  M15: '15m',
  M30: '30m',
  H1: '1h',
  H4: '4h',
  D1: '1d',
};

const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  M1: 60,
  M5: 5 * 60,
  M15: 15 * 60,
  M30: 30 * 60,
  H1: 60 * 60,
  H4: 4 * 60 * 60,
  D1: 24 * 60 * 60,
  W1: 7 * 24 * 60 * 60,
  MN: 30 * 24 * 60 * 60,
};

const CASE_SENSITIVE_ALIASES: Record<string, Timeframe> = {
  '1m': 'M1',
  '5m': 'M5',
  '15m': 'M15',
  '30m': 'M30',
  '1h': 'H1',
  '4h': 'H4',
  '1d': 'D1',
  '1w': 'W1',
  '1M': 'MN',
};

const NORMALIZED_ALIASES: Record<string, Timeframe> = {
  '1': 'M1',
  '5': 'M5',
  '15': 'M15',
  '30': 'M30',
  '60': 'H1',
  '240': 'H4',
  M1: 'M1',
  M5: 'M5',
  M15: 'M15',
  M30: 'M30',
  H1: 'H1',
  H4: 'H4',
  D1: 'D1',
  W1: 'W1',
  MN: 'MN',
  MN1: 'MN',
  MONTH: 'MN',
  MONTHLY: 'MN',
  '1MIN': 'M1',
  '5MIN': 'M5',
  '15MIN': 'M15',
  '30MIN': 'M30',
  '1H': 'H1',
  '4H': 'H4',
  '1D': 'D1',
  '1W': 'W1',
  '1MO': 'MN',
};

const DAY_SECONDS = 24 * 60 * 60;

/**
 * Normalizes a market symbol to a standard uppercase format for cache keys and matching.
 */
export const normalizeSymbol = (symbol: string): string => normalizeMarketSymbol(symbol);

/**
 * Strictly parses an unknown timeframe value against known aliases and normalizes it.
 * Returns null if the timeframe is unrecognized.
 * @param timeframe The raw timeframe string (e.g., '1m', '1H', '60', 'MONTHLY').
 */
export const normalizeTimeframeStrict = (timeframe: unknown): Timeframe | null => {
  const raw = String(timeframe ?? '').trim();
  if (!raw) {
    return null;
  }

  const caseSensitive = CASE_SENSITIVE_ALIASES[raw];
  if (caseSensitive) {
    return caseSensitive;
  }

  const normalized = raw.toUpperCase();
  return NORMALIZED_ALIASES[normalized] ?? null;
};

/** Strictly normalizes a timeframe against the backend candle-history REST contract. */
export const normalizeCandleHistoryTimeframeStrict = (timeframe: unknown): Timeframe | null => {
  const normalizedTimeframe = normalizeTimeframeStrict(timeframe);
  return normalizedTimeframe && CANDLE_HISTORY_TIMEFRAMES.includes(normalizedTimeframe)
    ? normalizedTimeframe
    : null;
};

/** Maps app/chart timeframe keys to broker websocket candle keys. */
export const toBridgeCandleTf = (timeframe: unknown): BridgeCandleTimeframe | null => {
  const normalizedTimeframe = normalizeTimeframeStrict(timeframe);
  return normalizedTimeframe ? BRIDGE_CANDLE_TF_BY_CANONICAL[normalizedTimeframe] ?? null : null;
};

/** Maps app/chart timeframe keys to REST candle query keys. */
export const toRestCandleTf = (timeframe: unknown): Timeframe | null =>
  normalizeCandleHistoryTimeframeStrict(timeframe);

/** Returns true if the provided timeframe can be requested from REST candle history. */
export const isCandleHistoryTimeframe = (timeframe: unknown): boolean =>
  normalizeCandleHistoryTimeframeStrict(timeframe) !== null;

/** Returns a REST-history-safe timeframe, defaulting to M1 when invalid or unsupported. */
export const normalizeCandleHistoryTimeframe = (
  timeframe: unknown,
  fallback: Timeframe = 'M1',
): Timeframe => normalizeCandleHistoryTimeframeStrict(timeframe) ?? fallback;

/** Returns true if the provided timeframe resolves to a recognized bucket size. */
export const isSupportedTimeframe = (timeframe: unknown): boolean =>
  normalizeTimeframeStrict(timeframe) !== null;

/** Returns the normalized timeframe, defaulting to 'M1' (1 minute) if invalid. */
export const normalizeTimeframe = (timeframe: string | number | null | undefined): Timeframe =>
  normalizeTimeframeStrict(timeframe) ?? 'M1';

/** Returns the exact duration of a timeframe in seconds (Note: 'MN' is treated as a flat 30 days here). */
export const getTimeframeSeconds = (timeframe: string): number =>
  TIMEFRAME_SECONDS[normalizeTimeframe(timeframe)];

/** Returns the exact duration of a timeframe in milliseconds. */
export const getTimeframeMs = (timeframe: string): number =>
  getTimeframeSeconds(timeframe) * 1000;

/**
 * Highly permissive timestamp normalizer.
 * Takes a Unix timestamp (seconds or ms), a date string, or a Date object,
 * and standardizes it to a strictly positive integer in Unix SECONDS.
 */
export const normalizeTimestampToSeconds = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  let numeric: number | null = null;

  if (typeof value === 'number') {
    numeric = value;
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parsedNumber = Number(trimmed);
    if (Number.isFinite(parsedNumber)) {
      numeric = parsedNumber;
    } else {
      const parsedDate = Date.parse(trimmed);
      if (Number.isFinite(parsedDate)) {
        numeric = parsedDate;
      }
    }
  } else if (value instanceof Date) {
    numeric = value.getTime();
  }

  if (numeric === null || !Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  if (numeric > 4.2e16) return Math.floor(numeric / 1_000_000_000);
  if (numeric > 4.2e13) return Math.floor(numeric / 1_000_000);
  if (numeric > 4.2e10) return Math.floor(numeric / 1_000);
  return Math.floor(numeric);
};

/** Same as normalizeTimestampToSeconds, but returns Unix MILLISECONDS. */
export const normalizeTimestampToMs = (value: unknown): number | null => {
  const seconds = normalizeTimestampToSeconds(value);
  return seconds === null ? null : seconds * 1000;
};

const getUtcDayStart = (timestampSeconds: number): number => {
  const date = new Date(timestampSeconds * 1000);
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1000);
};

const getUtcWeekStart = (timestampSeconds: number): number => {
  const dayStart = getUtcDayStart(timestampSeconds);
  const date = new Date(dayStart * 1000);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return dayStart - daysSinceMonday * DAY_SECONDS;
};

const getUtcMonthStart = (timestampSeconds: number): number => {
  const date = new Date(timestampSeconds * 1000);
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000);
};

/**
 * Calculates the exact start time of the bucket (candle) that a given timestamp belongs to.
 * Uses strict UTC calendar logic for Daily (D1), Weekly (W1 - starting Monday), and Monthly (MN) boundaries.
 * 
 * @param timestamp The raw timestamp to snap to a grid.
 * @param timeframe The resolution of the grid.
 * @returns The Unix SECONDS of the bucket's start, or null if invalid.
 */
export const getBucketStart = (timestamp: unknown, timeframe: string): number | null => {
  const timestampSeconds = normalizeTimestampToSeconds(timestamp);
  if (timestampSeconds === null) {
    return null;
  }

  const normalizedTimeframe = normalizeTimeframe(timeframe);
  if (normalizedTimeframe === 'D1') {
    return getUtcDayStart(timestampSeconds);
  }
  if (normalizedTimeframe === 'W1') {
    return getUtcWeekStart(timestampSeconds);
  }
  if (normalizedTimeframe === 'MN') {
    return getUtcMonthStart(timestampSeconds);
  }

  const intervalSeconds = getTimeframeSeconds(normalizedTimeframe);
  return Math.floor(timestampSeconds / intervalSeconds) * intervalSeconds;
};

/**
 * Resolves the final candle bucket that belongs to a completed market session.
 * Session close is exclusive, so an exact-boundary close belongs to the prior
 * bucket rather than permitting a synthetic candle at the close timestamp.
 */
export const getLastClosedSessionBucketStart = (
  sessionClose: unknown,
  timeframe: string,
): number | null => {
  const closeTimeSeconds = normalizeTimestampToSeconds(sessionClose);
  if (closeTimeSeconds === null || closeTimeSeconds <= 0) {
    return null;
  }
  return getBucketStart(closeTimeSeconds - 1, timeframe);
};

/** Alias for getBucketStart that returns Unix MILLISECONDS. */
export const getBucketStartMs = (timestamp: unknown, timeframe: string): number | null => {
  const bucketStart = getBucketStart(timestamp, timeframe);
  return bucketStart === null ? null : bucketStart * 1000;
};

const addUtcMonths = (timestampSeconds: number, monthOffset: number): number => {
  const date = new Date(timestampSeconds * 1000);
  return Math.floor(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + monthOffset,
      1,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
    ) / 1000,
  );
};

/**
 * Given a bucket's start time, calculates exactly when the next bucket should start.
 * Safely handles variable month lengths for the 'MN' timeframe via UTC dates.
 */
export const getExpectedNextCandleTime = (lastTime: number, timeframe: string): number => {
  const normalizedTimeframe = normalizeTimeframe(timeframe);
  if (normalizedTimeframe === 'MN') {
    return addUtcMonths(getUtcMonthStart(lastTime), 1);
  }

  return lastTime + getTimeframeSeconds(normalizedTimeframe);
};

/**
 * Calculates how many theoretical candles exist between two timestamps.
 * Used primarily for detecting missing data or calculating pagination limits.
 */
export const getBucketGapCount = (fromTime: number, toTime: number, timeframe: string): number => {
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime) || toTime <= fromTime) {
    return 0;
  }

  const normalizedTimeframe = normalizeTimeframe(timeframe);
  if (normalizedTimeframe !== 'MN') {
    return Math.floor((toTime - fromTime) / getTimeframeSeconds(normalizedTimeframe));
  }

  let cursor = getUtcMonthStart(fromTime);
  let count = 0;
  while (cursor < toTime && count < 600) {
    cursor = getExpectedNextCandleTime(cursor, normalizedTimeframe);
    count += 1;
  }
  return count;
};

/** Generates a deterministic string key representing a specific chart configuration. */
export const createCandleStreamKey = (symbol: string, timeframe: string): CandleStreamKey => {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedTimeframe = normalizeTimeframe(timeframe);
  return `${normalizedSymbol}:${normalizedTimeframe}`;
};
