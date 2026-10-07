import { normalizeSymbol, normalizeTimeframeStrict } from '../core/candles';
import { normalizeBrokerWssUrl } from '../../../api/brokerRouting';
import {
  asRecord,
  CANDLE_CLOSE_KEYS,
  CANDLE_HIGH_KEYS,
  CANDLE_LOW_KEYS,
  CANDLE_OPEN_KEYS,
  CANDLE_SYMBOL_KEYS,
  CANDLE_TIMEFRAME_KEYS,
  pickFirst,
  pickString,
} from '../core/candleUtils';

/**
 * Accepts only the exact trading WebSocket endpoint supplied by the validated
 * active broker record. It never derives a host/path or falls back globally.
 */
export const resolveCandlesWsUrl = (
  exactTradeWsBase?: string | null,
): string => normalizeBrokerWssUrl(exactTradeWsBase);

const CANDLE_WS_TIMEFRAME_BY_CANONICAL = {
  M1: '1m',
  M5: '5m',
  M15: '15m',
  M30: '30m',
  H1: '1h',
  H4: '4h',
  D1: '1d',
  W1: '1w',
  MN: '1M',
} as const;

export const resolveCandleWsTimeframe = (tf: string): string | null => {
  const normalizedTimeframe = normalizeTimeframeStrict(tf);
  return normalizedTimeframe ? CANDLE_WS_TIMEFRAME_BY_CANONICAL[normalizedTimeframe] : null;
};

/**
 * Constructs the standardized dot-delimited channel string used to subscribe
 * to a specific market symbol and timeframe (e.g. `candles.EURUSD.1m`).
 */
export const createCandleChannel = (symbol: string, tf: string): string | null => {
  const normalizedSymbol = normalizeSymbol(symbol);
  const wsTimeframe = resolveCandleWsTimeframe(tf);
  return normalizedSymbol && wsTimeframe
    ? `candles.${normalizedSymbol}.${wsTimeframe}`
    : null;
};

const pickTimeframeValue = (record: Record<string, unknown> | null, keys: readonly string[]): unknown => {
  const value = pickFirst(record, keys);
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

const getNestedRecord = (record: Record<string, unknown> | null): Record<string, unknown> | null =>
  asRecord(record?.candle) ??
  asRecord(record?.bar) ??
  asRecord(record?.data) ??
  asRecord(record?.payload) ??
  null;

const hasAnyKey = (record: Record<string, unknown> | null, keys: readonly string[]): boolean =>
  Boolean(record && keys.some((key) => record[key] !== undefined && record[key] !== null && record[key] !== ''));

/**
 * Type guard / shape validator for incoming WebSocket messages.
 * Verifies that the payload contains at least the 4 mandatory OHLC properties,
 * accommodating various capitalizations used by different backend environments.
 */
export const hasBackendCandleShape = (payload: unknown): boolean => {
  const record = asRecord(payload);
  const nested = getNestedRecord(record);
  const candidate = nested ?? record;
  return (
    hasAnyKey(candidate, CANDLE_OPEN_KEYS) &&
    hasAnyKey(candidate, CANDLE_HIGH_KEYS) &&
    hasAnyKey(candidate, CANDLE_LOW_KEYS) &&
    hasAnyKey(candidate, CANDLE_CLOSE_KEYS)
  );
};

const extractChannelContext = (channel: unknown): { symbol: string | null; tf: string | null } => {
  if (typeof channel !== 'string') {
    return { symbol: null, tf: null };
  }

  const parts = channel.split('.');
  if (parts.length < 3 || parts[0] !== 'candles') {
    return { symbol: null, tf: null };
  }

  const tf = normalizeTimeframeStrict(parts[parts.length - 1]);
  const symbol = normalizeSymbol(parts.slice(1, -1).join('.'));
  return {
    symbol: symbol || null,
    tf,
  };
};

/**
 * Extracts the symbol and timeframe metadata from an incoming WebSocket message.
 * Searches through standard payload structures, nested data objects, and the routing
 * channel string itself to resolve the exact context of the update.
 */
export const extractCandlePayloadContext = (payload: unknown): { symbol: string | null; tf: string | null } => {
  const record = asRecord(payload);
  const nested = getNestedRecord(record);
  const channelContext = extractChannelContext(record?.channel);
  const symbol =
    channelContext.symbol ??
    pickString(record, CANDLE_SYMBOL_KEYS) ??
    pickString(nested, CANDLE_SYMBOL_KEYS);
  const timeframe =
    channelContext.tf ??
    pickTimeframeValue(record, CANDLE_TIMEFRAME_KEYS) ??
    pickTimeframeValue(nested, CANDLE_TIMEFRAME_KEYS);

  return {
    symbol: symbol ? normalizeSymbol(symbol) : null,
    tf: normalizeTimeframeStrict(timeframe),
  };
};

/**
 * Flattens various possible JSON envelope formats into a consistent array of candle objects.
 * Handles nested `{ data: [...] }`, `{ items: [...] }`, `{ result: [...] }`, 
 * and single-object updates.
 */
export const getCandlePayloadItems = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  const record = asRecord(payload);
  if (!record) {
    return [];
  }

  if (Array.isArray(record.data)) return record.data;
  if (Array.isArray(record.candles)) return record.candles;
  if (Array.isArray(record.items)) return record.items;
  if (Array.isArray(record.bars)) return record.bars;

  const nestedData = asRecord(record.data);
  const nestedPayload = asRecord(record.payload);
  const nestedResult = asRecord(record.result);
  const nestedCandidates = [nestedData, nestedPayload, nestedResult].filter(
    (entry): entry is Record<string, unknown> => entry !== null,
  );

  for (const nested of nestedCandidates) {
    if (Array.isArray(nested.candles)) return nested.candles;
    if (Array.isArray(nested.items)) return nested.items;
    if (Array.isArray(nested.bars)) return nested.bars;
    if (Array.isArray(nested.data)) return nested.data;
  }

  if (record.candle) return [record.candle];
  if (record.bar) return [record.bar];
  for (const nested of nestedCandidates) {
    if (nested.candle) return [nested.candle];
    if (nested.bar) return [nested.bar];
    if (hasBackendCandleShape(nested)) return [nested];
  }
  if (record.data && typeof record.data === 'object') return [record.data];
  return [record];
};
