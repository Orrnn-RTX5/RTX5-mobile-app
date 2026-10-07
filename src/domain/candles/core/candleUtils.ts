import type { Candle, MutableCandle, Timeframe } from './candleTypes';
import { validateCandle } from './candleValidator';
import {
  getBucketStart,
  normalizeSymbol,
  normalizeTimeframeStrict,
  normalizeTimestampToSeconds,
} from './timeframeUtils';

export type ObjectRecord = Record<string, unknown>;

export const CANDLE_TIME_KEYS = [
  'time',
  't',
  'date',
  'datetime',
] as const;

export const TICK_TIME_KEYS = [
  'time',
  'timestamp',
  'timestamp_ms',
  'timestampMs',
  'time_ms',
  'timeMs',
  'ts',
  't',
] as const;

export const CANDLE_OPEN_KEYS = ['open', 'Open', 'OPEN', 'o', 'O'] as const;
export const CANDLE_HIGH_KEYS = ['high', 'High', 'HIGH', 'h', 'H'] as const;
export const CANDLE_LOW_KEYS = ['low', 'Low', 'LOW', 'l', 'L'] as const;
export const CANDLE_CLOSE_KEYS = ['close', 'Close', 'CLOSE', 'c', 'C'] as const;
export const CANDLE_VOLUME_KEYS = [
  'volume',
  'Volume',
  'VOLUME',
  'vol',
  'tickVolume',
  'tick_volume',
  'v',
  'V',
] as const;
export const CANDLE_SYMBOL_KEYS = [
  'symbol',
  'Symbol',
  'SYMBOL',
  's',
  'S',
  'instrument',
  'instrumentSymbol',
] as const;
export const CANDLE_TIMEFRAME_KEYS = [
  'timeframe',
  'Timeframe',
  'TIMEFRAME',
  'tf',
  'TF',
  'period',
  'interval',
] as const;
export const CANDLE_CLOSED_KEYS = [
  'closed',
  'isClosed',
  'complete',
  'completed',
  'final',
  'isFinal',
  'Closed',
  'CLOSED',
  'is_closed',
  'is_complete',
] as const;

export const asRecord = (value: unknown): ObjectRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as ObjectRecord)
    : null;

export const getNestedRecord = (
  value: unknown,
  keys: readonly string[],
): ObjectRecord | null => {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  for (const key of keys) {
    const nested = asRecord(record[key]);
    if (nested) {
      return nested;
    }
  }

  return record;
};

export const pickFirst = (
  record: ObjectRecord | null | undefined,
  keys: readonly string[],
): unknown => {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return undefined;
};

export const pickString = (
  record: ObjectRecord | null | undefined,
  keys: readonly string[],
): string | null => {
  const value = pickFirst(record, keys);
  return typeof value === 'string' && value.trim() ? value : null;
};

export const toFiniteNumber = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const toPositiveFiniteNumber = (value: unknown): number | null => {
  const parsed = toFiniteNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
};

export const toNonNegativeFiniteNumber = (value: unknown): number | null => {
  const parsed = toFiniteNumber(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
};

export const coerceClosedFlag = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'closed', 'complete', 'completed', 'final'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'open', 'forming', 'current', 'partial', 'incomplete'].includes(normalized)) {
      return false;
    }
  }

  return null;
};

export const pickClosedFlag = (
  record: ObjectRecord | null | undefined,
  keys: readonly string[] = CANDLE_CLOSED_KEYS,
): boolean | null => {
  if (!record) {
    return null;
  }

  for (const key of keys) {
    const closed = coerceClosedFlag(record[key]);
    if (closed !== null) {
      return closed;
    }
  }
  return null;
};

export const pickNormalizedSymbol = (
  record: ObjectRecord | null | undefined,
): string | null => {
  const symbol = pickString(record, CANDLE_SYMBOL_KEYS);
  return symbol ? normalizeSymbol(symbol) : null;
};

export const pickNormalizedTimeframe = (
  record: ObjectRecord | null | undefined,
): Timeframe | null => normalizeTimeframeStrict(pickFirst(record, CANDLE_TIMEFRAME_KEYS));

export const extractCandlePrimitiveFields = (record: ObjectRecord) => {
  const time = normalizeTimestampToSeconds(pickFirst(record, CANDLE_TIME_KEYS));
  const open = toFiniteNumber(pickFirst(record, CANDLE_OPEN_KEYS));
  const high = toFiniteNumber(pickFirst(record, CANDLE_HIGH_KEYS));
  const low = toFiniteNumber(pickFirst(record, CANDLE_LOW_KEYS));
  const close = toFiniteNumber(pickFirst(record, CANDLE_CLOSE_KEYS));
  const volume = toNonNegativeFiniteNumber(pickFirst(record, CANDLE_VOLUME_KEYS)) ?? 0;

  return { time, open, high, low, close, volume };
};

export const createSanitizedCandle = (
  fields: {
    time: number | null;
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
    volume?: number | null;
  },
): Candle | null => {
  const { time, open, high, low, close } = fields;
  if (time === null || open === null || high === null || low === null || close === null) {
    return null;
  }
  if (
    high < open ||
    high < close ||
    high < low ||
    low > open ||
    low > close ||
    low > high
  ) {
    return null;
  }

  const candle: Candle = {
    time,
    open,
    high,
    low,
    close,
    volume: fields.volume !== null && fields.volume !== undefined && Number.isFinite(fields.volume)
      ? fields.volume
      : 0,
  };

  return validateCandle(candle) ? candle : null;
};

export const bucketCandle = (
  candle: Candle,
  timeframe?: string,
): Candle | null => {
  if (!validateCandle(candle)) {
    return null;
  }

  const bucketStart = timeframe ? getBucketStart(candle.time, timeframe) : candle.time;
  if (bucketStart === null) {
    return null;
  }

  return createSanitizedCandle({
    time: bucketStart,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: Number.isFinite(candle.volume) ? candle.volume : 0,
  });
};

export const toPublicCandle = (candle: Pick<MutableCandle, 'time' | 'open' | 'high' | 'low' | 'close' | 'volume'>): Candle => ({
  time: candle.time,
  open: candle.open,
  high: candle.high,
  low: candle.low,
  close: candle.close,
  volume: Number.isFinite(candle.volume) ? candle.volume : 0,
});

export const areCandleValuesEqual = (
  left: Pick<Candle, 'time' | 'open' | 'high' | 'low' | 'close' | 'volume'>,
  right: Pick<Candle, 'time' | 'open' | 'high' | 'low' | 'close' | 'volume'>,
): boolean =>
  left.time === right.time &&
  left.open === right.open &&
  left.high === right.high &&
  left.low === right.low &&
  left.close === right.close &&
  (left.volume ?? 0) === (right.volume ?? 0);

export const cloneCandle = <TCandle extends Candle>(candle: TCandle): TCandle => ({ ...candle });
