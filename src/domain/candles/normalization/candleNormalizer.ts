import type { Candle, LiveCandle, RawCandle } from '../core/candleTypes';
import { logInvalidCandleInDevelopment, validateCandle } from '../core/candleValidator';
import {
  asRecord,
  createSanitizedCandle,
  extractCandlePrimitiveFields,
  getNestedRecord,
  pickFirst,
  pickClosedFlag,
  pickNormalizedSymbol,
  pickNormalizedTimeframe,
} from '../core/candleUtils';
import { normalizeTimestampToSeconds } from '../core/timeframeUtils';

const CANDLE_BACKEND_UPDATE_TIME_KEYS = [
  'server_time',
  'serverTime',
  'server_timestamp',
  'serverTimestamp',
  'updated_at',
  'updatedAt',
  'received_at',
  'receivedAt',
] as const;

/**
 * Traverses common nested payload structures (e.g., { candle: { ... } } or { data: { ... } })
 * to find the actual record containing candle data.
 */
const getNestedCandleRecord = (raw: unknown): Record<string, unknown> | null => {
  return getNestedRecord(raw, ['candle', 'bar', 'data']);
};

const pickBackendUpdateTime = (record: Record<string, unknown>): number | null =>
  normalizeTimestampToSeconds(pickFirst(record, CANDLE_BACKEND_UPDATE_TIME_KEYS));

const hasOhlcRangeViolation = (fields: {
  time: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
}): boolean => {
  const { time, open, high, low, close } = fields;
  if (
    time === null ||
    open === null ||
    high === null ||
    low === null ||
    close === null
  ) {
    return false;
  }

  return (
    high < open ||
    high < close ||
    high < low ||
    low > open ||
    low > close ||
    low > high
  );
};

/**
 * Core normalization logic. Extracts OHLCV values from an unknown JSON object,
 * ensures strict numeric constraints, and sanitizes minor float math errors in geometry.
 *
 * @param raw The raw JSON object from the backend.
 * @param label A label used for debugging if the candle is invalid.
 * @returns A strictly validated Candle, or null if the payload is corrupted.
 */
const normalizeBackendCandle = (raw: unknown, label: string): Candle | null => {
  const record = getNestedCandleRecord(raw);
  if (!record) {
    logInvalidCandleInDevelopment(`${label}:missing_record`, raw);
    return null;
  }

  const fields = extractCandlePrimitiveFields(record);
  const closed = pickClosedFlag(record);

  if (hasOhlcRangeViolation(fields)) {
    logInvalidCandleInDevelopment(`${label}:invalid_ohlc_range`, {
      symbol: pickNormalizedSymbol(record),
      timeframe: pickNormalizedTimeframe(record),
      timestamp: fields.time,
      raw,
    });
    return null;
  }

  const candle = createSanitizedCandle(fields);
  if (!candle) {
    logInvalidCandleInDevelopment(`${label}:missing_ohlc`, raw);
    return null;
  }

  if (!validateCandle(candle)) {
    logInvalidCandleInDevelopment(`${label}:invalid_ohlc`, raw);
    return null;
  }
  return closed === null ? candle : ({ ...candle, closed } as Candle);
};

/**
 * Parses an unknown payload specifically expecting a historical candle (REST response).
 * Strips out symbol/timeframe metadata since history is usually fetched per-symbol/timeframe.
 */
export const normalizeHistoryCandle = (raw: unknown): Candle | null =>
  normalizeBackendCandle(raw, 'history');

/**
 * Parses an unknown payload specifically expecting a live candle (WebSocket response).
 * Optionally preserves inline symbol and timeframe tags which are common in multiplexed streams.
 */
export const normalizeLiveCandle = (raw: unknown): LiveCandle | null => {
  const record = getNestedCandleRecord(raw);
  const candle = normalizeBackendCandle(record ?? raw, 'live_candle');
  if (!record || !candle) {
    return null;
  }

  const normalizedSymbol = pickNormalizedSymbol(record);
  const normalizedTimeframe = pickNormalizedTimeframe(record);
  const updateTime = pickBackendUpdateTime(record);
  return {
    ...candle,
    ...(normalizedSymbol ? { symbol: normalizedSymbol } : {}),
    ...(normalizedTimeframe ? { timeframe: normalizedTimeframe } : {}),
    ...(updateTime !== null ? { updateTime } : {}),
  };
};

/** Bulk parses an array of raw historical candles, filtering out any invalid entries. */
export const normalizeHistoryCandles = (rawCandles: unknown[]): Candle[] =>
  rawCandles
    .map(normalizeHistoryCandle)
    .filter((candle): candle is Candle => candle !== null);

/** Extracts the raw underlying object record from a JSON payload if possible. */
export const normalizeRawCandleRecord = (raw: unknown): RawCandle | null => asRecord(raw);
