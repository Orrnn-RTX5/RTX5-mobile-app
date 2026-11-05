import type { Candle } from './candleTypes';

export type CandleValidationSummary = {
  total: number;
  invalidOhlc: number;
  duplicateTimes: number;
  unsorted: number;
  invalidNumbers: number;
  suspiciousGaps: number;
  firstTime: number | null;
  lastTime: number | null;
};

export type CandleValidationContext = {
  symbol?: string;
  timeframe?: string;
  source?: string;
  requestId?: number | string;
  subscriptionId?: number | string;
  chartId?: number | string;
  componentName?: string;
  timeframeMs?: number | null;
  timeframeSeconds?: number | null;
};

type ResolvedValidationContext = {
  context: CandleValidationContext;
  expectedGapSeconds: number | null;
};

/**
 * Type guard to check if a value is a valid, finite number.
 */
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * Strictly validates a candle object to ensure its geometric and numeric integrity.
 * 
 * Rules:
 * - Time, Open, High, Low, Close must all be finite numbers.
 * - Time must be positive.
 * - High must be >= Open, Close, and Low.
 * - Low must be <= Open, Close, and High.
 * 
 * @param candle The raw or partial candle object to validate.
 * @returns True if the candle is geometrically valid.
 */
export const validateCandle = (
  candle: Pick<Candle, 'time' | 'open' | 'high' | 'low' | 'close'> | null | undefined,
): candle is Candle => {
  if (!candle) {
    return false;
  }

  return (
    isFiniteNumber(candle.time) &&
    candle.time > 0 &&
    isFiniteNumber(candle.open) &&
    isFiniteNumber(candle.high) &&
    isFiniteNumber(candle.low) &&
    isFiniteNumber(candle.close) &&
    candle.high >= candle.open &&
    candle.high >= candle.close &&
    candle.high >= candle.low &&
    candle.low <= candle.open &&
    candle.low <= candle.close &&
    candle.low <= candle.high
  );
};

const hasInvalidRequiredNumber = (
  candle: Partial<Pick<Candle, 'time' | 'open' | 'high' | 'low' | 'close' | 'volume'>> | null | undefined,
): boolean => {
  if (!candle) {
    return true;
  }

  return (
    !isFiniteNumber(candle.time) ||
    !isFiniteNumber(candle.open) ||
    !isFiniteNumber(candle.high) ||
    !isFiniteNumber(candle.low) ||
    !isFiniteNumber(candle.close) ||
    (candle.volume !== undefined && !isFiniteNumber(candle.volume))
  );
};

const hasInvalidOhlcRange = (
  candle: Pick<Candle, 'time' | 'open' | 'high' | 'low' | 'close'>,
): boolean => (
  candle.time <= 0 ||
  candle.high < candle.open ||
  candle.high < candle.close ||
  candle.high < candle.low ||
  candle.low > candle.open ||
  candle.low > candle.close ||
  candle.low > candle.high
);

const normalizeExpectedGapSeconds = (timeframeMsOrSeconds?: number | null): number | null => {
  if (!isFiniteNumber(timeframeMsOrSeconds) || timeframeMsOrSeconds <= 0) {
    return null;
  }

  return timeframeMsOrSeconds >= 1000
    ? timeframeMsOrSeconds / 1000
    : timeframeMsOrSeconds;
};

const resolveValidationContext = (
  timeframeOrContext?: number | CandleValidationContext | null,
  symbol?: string,
  timeframe?: string,
): ResolvedValidationContext => {
  if (typeof timeframeOrContext === 'object' && timeframeOrContext !== null) {
    const timeframeSeconds =
      normalizeExpectedGapSeconds(timeframeOrContext.timeframeSeconds) ??
      normalizeExpectedGapSeconds(timeframeOrContext.timeframeMs ?? null);
    return {
      context: {
        ...timeframeOrContext,
        ...(symbol ? { symbol } : {}),
        ...(timeframe ? { timeframe } : {}),
      },
      expectedGapSeconds: timeframeSeconds,
    };
  }

  return {
    context: {
      ...(symbol ? { symbol } : {}),
      ...(timeframe ? { timeframe } : {}),
    },
    expectedGapSeconds: normalizeExpectedGapSeconds(timeframeOrContext),
  };
};

type CandleValidationIssue = {
  issue: string;
  index: number;
  timestamp: unknown;
  candle: Partial<Candle> | null | undefined;
  previous?: Partial<Candle> | null | undefined;
  next?: Partial<Candle> | null | undefined;
};

const collectValidationIssues = (
  candles: readonly Partial<Candle>[],
  expectedGapSeconds: number | null,
): CandleValidationIssue[] => {
  const issues: CandleValidationIssue[] = [];
  const seenTimes = new Map<number, number>();
  let previousTime: number | null = null;

  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    const previous = index > 0 ? candles[index - 1] : undefined;
    const next = index + 1 < candles.length ? candles[index + 1] : undefined;

    if (hasInvalidRequiredNumber(candle)) {
      issues.push({
        issue: 'invalid_numbers',
        index,
        timestamp: candle?.time,
        candle,
        previous,
        next,
      });
      continue;
    }

    const typed = candle as Candle;
    if (hasInvalidOhlcRange(typed)) {
      issues.push({
        issue: 'invalid_ohlc',
        index,
        timestamp: typed.time,
        candle,
        previous,
        next,
      });
    }

    const firstSeenIndex = seenTimes.get(typed.time);
    if (firstSeenIndex !== undefined) {
      issues.push({
        issue: 'duplicate_time',
        index,
        timestamp: typed.time,
        candle,
        previous: candles[firstSeenIndex],
        next,
      });
    }
    seenTimes.set(typed.time, index);

    if (previousTime !== null) {
      if (typed.time < previousTime) {
        issues.push({
          issue: 'unsorted',
          index,
          timestamp: typed.time,
          candle,
          previous,
          next,
        });
      } else if (
        expectedGapSeconds !== null &&
        typed.time > previousTime + expectedGapSeconds * 1.5
      ) {
        issues.push({
          issue: 'suspicious_gap',
          index,
          timestamp: typed.time,
          candle,
          previous,
          next,
        });
      }
    }

    previousTime = typed.time;
  }

  return issues;
};

/**
 * Validates a whole candle series without mutating it.
 *
 * The app's canonical candle timestamp unit is Unix seconds. The second
 * argument accepts either timeframe milliseconds (the debug prompt contract)
 * or seconds (convenient for existing domain helpers).
 */
export const validateCandles = (
  candles: readonly Partial<Candle>[] | null | undefined,
  timeframeOrContext?: number | CandleValidationContext | null,
  symbol?: string,
  timeframe?: string,
): CandleValidationSummary => {
  const input = Array.isArray(candles) ? candles : [];
  const seenTimes = new Set<number>();
  const { expectedGapSeconds } = resolveValidationContext(timeframeOrContext, symbol, timeframe);

  let invalidNumbers = 0;
  let invalidOhlc = 0;
  let duplicateTimes = 0;
  let unsorted = 0;
  let suspiciousGaps = 0;
  let previousTime: number | null = null;
  let firstTime: number | null = null;
  let lastTime: number | null = null;

  for (const candle of input) {
    if (hasInvalidRequiredNumber(candle)) {
      invalidNumbers += 1;
      continue;
    }

    const typed = candle as Candle;
    if (hasInvalidOhlcRange(typed)) {
      invalidOhlc += 1;
    }

    if (seenTimes.has(typed.time)) {
      duplicateTimes += 1;
    }
    seenTimes.add(typed.time);

    if (previousTime !== null) {
      if (typed.time < previousTime) {
        unsorted += 1;
      } else if (
        expectedGapSeconds !== null &&
        typed.time > previousTime + expectedGapSeconds * 1.5
      ) {
        suspiciousGaps += 1;
      }
    }
    previousTime = typed.time;

    firstTime = firstTime === null ? typed.time : Math.min(firstTime, typed.time);
    lastTime = lastTime === null ? typed.time : Math.max(lastTime, typed.time);
  }

  return {
    total: input.length,
    invalidOhlc,
    duplicateTimes,
    unsorted,
    invalidNumbers,
    suspiciousGaps,
    firstTime,
    lastTime,
  };
};

export const hasCandleValidationProblems = (summary: CandleValidationSummary): boolean =>
  summary.invalidOhlc > 0 ||
  summary.duplicateTimes > 0 ||
  summary.unsorted > 0 ||
  summary.invalidNumbers > 0;

const shouldLogCandleSeriesDebug = (): boolean =>
  typeof __DEV__ !== 'undefined' &&
  __DEV__ &&
  typeof process !== 'undefined' &&
  process.env.EXPO_PUBLIC_DEBUG_CANDLE_STREAM === 'true';

const shouldPrintCandleSeriesTable = (): boolean =>
  shouldLogCandleSeriesDebug() &&
  typeof process !== 'undefined' &&
  process.env.EXPO_PUBLIC_DEBUG_CANDLE_TABLE === 'true';

export const logCandleSeriesDiagnosticsInDevelopment = (
  label: string,
  candles: readonly Partial<Candle>[],
  timeframeOrContext: number | CandleValidationContext | null | undefined,
  symbol?: string,
  timeframe?: string,
): CandleValidationSummary => {
  const { context, expectedGapSeconds } = resolveValidationContext(timeframeOrContext, symbol, timeframe);
  const summary = validateCandles(candles, context);
  if (!shouldLogCandleSeriesDebug()) {
    return summary;
  }

  if (hasCandleValidationProblems(summary) || summary.suspiciousGaps > 0) {
    console.log('[candles] series validation', {
      label,
      ...context,
      ...summary,
    });
    console.log('[candles] series validation issues', {
      label,
      ...context,
      issues: collectValidationIssues(candles, expectedGapSeconds).slice(0, 20),
    });
  }

  if (shouldPrintCandleSeriesTable() && candles.length > 0) {
    console.table(
      candles.slice(-20).map((candle) => ({
        time: candle.time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        source: (candle as Partial<Candle> & { source?: string }).source,
      })),
    );
  }

  return summary;
};

/**
 * Logs a rejected (already filtered-out) candle in development builds only.
 * Uses console.log: the rejection is handled, so it must not raise a LogBox toast.
 */
export const logInvalidCandleInDevelopment = (label: string, raw: unknown): void => {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(`[candles] rejected invalid candle: ${label}`, raw);
  }
};
