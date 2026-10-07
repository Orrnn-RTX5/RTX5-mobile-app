import {
  isBucketAlignedCandle,
  isStructurallyValidCandle,
  normalizeTimeframe,
  sortAndDedupeCandles,
} from './candles';
import { coerceClosedFlag, toPublicCandle } from './candleUtils';
import type { Candle } from '../../../state/tradingState';

/** Represents the exact price line used to build a candle (e.g. tracking the bid vs ask price). */
export type CandlePriceBasis = 'bid' | 'ask' | 'mid' | 'last';

/** 
 * A specialized type representing a candle that has been fully closed and retrieved 
 * from the authoritative REST backend. We trust this candle entirely and do not 
 * modify it with live data.
 */
export type TrustedHistoryCandle = Candle & {
  source: 'rest';
  closed: true;
  priceBasis: CandlePriceBasis;
  serverTimeframe: string;
  receivedAtMs?: number;
};

export const CANDLE_PRICE_BASIS_VALUES: readonly CandlePriceBasis[] = ['bid', 'ask', 'mid', 'last'];

/** Validates and standardizes a raw price basis string. */
export const normalizeCandlePriceBasis = (value: unknown): CandlePriceBasis | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return CANDLE_PRICE_BASIS_VALUES.includes(normalized as CandlePriceBasis)
    ? (normalized as CandlePriceBasis)
    : null;
};

export const getConfiguredCandlePriceBasis = (): CandlePriceBasis =>
  normalizeCandlePriceBasis(process.env.EXPO_PUBLIC_CANDLE_PRICE_BASIS) ?? 'bid';

/** 
 * Safely extracts a boolean "closed" flag from various possible backend/JSON representations
 * (e.g., '1', 'true', 'closed', etc.).
 */
export const getExplicitClosedFlag = (input: unknown): boolean | null => {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const record = input as Record<string, unknown>;
  return (
    coerceClosedFlag(record.closed) ??
    coerceClosedFlag(record.isClosed) ??
    coerceClosedFlag(record.complete) ??
    coerceClosedFlag(record.completed) ??
    coerceClosedFlag(record.final) ??
    coerceClosedFlag(record.isFinal) ??
    null
  );
};

/** Type guard to check if a generic Candle has the exact footprint of a TrustedHistoryCandle. */
export const isTrustedHistoryCandle = (candle: Candle): candle is TrustedHistoryCandle => {
  const record = candle as Record<string, unknown>;
  return record.source === 'rest' && record.closed === true && isStructurallyValidCandle(candle);
};

/**
 * Validates a candle and strictly annotates it as a TrustedHistoryCandle.
 * If the candle is invalid or not aligned to the timeframe bucket, returns null.
 */
export const markTrustedHistoryCandle = (
  candle: Candle,
  timeframe: string,
  priceBasis: CandlePriceBasis,
): TrustedHistoryCandle | null => {
  const normalizedTimeframe = normalizeTimeframe(timeframe);
  if (!isStructurallyValidCandle(candle) || !isBucketAlignedCandle(candle, normalizedTimeframe)) {
    return null;
  }

  return {
    ...candle,
    source: 'rest',
    closed: true,
    priceBasis,
    serverTimeframe: normalizedTimeframe,
  };
};

/** 
 * Applies `markTrustedHistoryCandle` across a whole array of candles,
 * filtering out any live or unclosed candles.
 */
export const markTrustedHistorySeries = (
  candles: Candle[],
  timeframe: string,
  priceBasis: CandlePriceBasis,
): TrustedHistoryCandle[] =>
  sortAndDedupeCandles(
    candles.filter((candle) => {
      const record = candle as Record<string, unknown>;
      return record.source !== 'live' && record.source !== 'live_candle' && record.closed !== false;
    }),
  )
    .map((candle) => markTrustedHistoryCandle(candle, timeframe, priceBasis))
    .filter((candle): candle is TrustedHistoryCandle => candle !== null);

/** Removes all internal tracking metadata from a candle, leaving only pure OHLCV data. */
export const stripCandleProvenance = (candle: Candle): Candle => toPublicCandle(candle);

/** Represents the initial batch of historical data used to boot up a chart. */
export type RestHistorySeedCandles = {
  /** The full combined array of history candles. */
  candles: Candle[];
  /** The timestamp of the most recent FULLY CLOSED candle in history. */
  closedHistoryLastTime: number | null;
  /** The timestamp of the currently active, still-forming candle (if provided by REST). */
  currentCandleTime: number | null;
};

/**
 * Assembles a structured `RestHistorySeedCandles` object from arrays of closed and forming candles.
 * Deduplicates and strips provenance metadata.
 */
export const buildRestHistorySeedCandles = (
  closedHistory: readonly Candle[],
  currentCandle: Candle | null | undefined,
): RestHistorySeedCandles => {
  const safeClosedHistory = sortAndDedupeCandles(
    closedHistory
      .filter(isStructurallyValidCandle)
      .map(stripCandleProvenance),
  );
  const safeCurrentCandle = currentCandle && isStructurallyValidCandle(currentCandle)
    ? stripCandleProvenance(currentCandle)
    : null;
  const candles = sortAndDedupeCandles([
    ...safeClosedHistory,
    ...(safeCurrentCandle ? [safeCurrentCandle] : []),
  ]);

  return {
    candles,
    closedHistoryLastTime: safeClosedHistory[safeClosedHistory.length - 1]?.time ?? null,
    currentCandleTime: safeCurrentCandle?.time ?? null,
  };
};

/**
 * Separates a raw array of fetched REST candles into two distinct groups:
 * 1. Fully closed historical candles (trusted).
 * 2. The single active, still-forming candle at the tip of the series (if present).
 */
export const splitRestHistoryCandles = (
  candles: Candle[],
  timeframe: string,
  priceBasis: CandlePriceBasis,
): { closedHistory: TrustedHistoryCandle[]; currentCandle: Candle | null } => {
  const normalizedCandles = candles
    .filter(isStructurallyValidCandle)
    .sort((left, right) => left.time - right.time);
  const closedHistory: TrustedHistoryCandle[] = [];
  let currentCandle: Candle | null = null;

  for (let index = 0; index < normalizedCandles.length; index += 1) {
    const candle = normalizedCandles[index];
    const record = candle as Record<string, unknown>;
    const explicitClosed = getExplicitClosedFlag(candle);
    const isLast = index === normalizedCandles.length - 1;
    const isLiveSource = record.source === 'live' || record.source === 'live_candle';
    const shouldTreatAsClosed =
      !isLiveSource &&
      (explicitClosed === true || (explicitClosed === null && !isLast));

    if (!shouldTreatAsClosed) {
      currentCandle = candle;
      continue;
    }

    const trusted = markTrustedHistoryCandle(candle, timeframe, priceBasis);
    if (trusted) {
      closedHistory.push(trusted);
    }
  }

  return {
    closedHistory: markTrustedHistorySeries(closedHistory, timeframe, priceBasis),
    currentCandle,
  };
};
