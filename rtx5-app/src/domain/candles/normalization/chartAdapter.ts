import type { Candle } from '../core/candleTypes';
import { validateCandle } from '../core/candleValidator';
import { sortAndDedupeCandles } from '../series/candleSeriesMerger';

type CandleWithLiveMetadata = Candle & {
  source?: 'history' | 'live_candle';
  closed?: boolean;
};

export type ChartCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type ChartLinePoint = {
  time: number;
  value: number;
};

export type SanitizeCandlesForChartOptions = {
  timeframe?: string;
  pruneSyntheticFlatLiveTail?: boolean;
  closedMarketSessionClose?: number | null;
};

const arePricesEqual = (left: number, right: number): boolean => {
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= Number.EPSILON * scale * 16;
};

const isFlatCandle = (candle: Candle): boolean =>
  arePricesEqual(candle.open, candle.high) &&
  arePricesEqual(candle.high, candle.low) &&
  arePricesEqual(candle.low, candle.close);

const isSyntheticFlatLiveTailCandle = (
  candle: CandleWithLiveMetadata,
  previous: Candle | undefined,
): boolean => {
  if (!previous || candle.source !== 'live_candle' || candle.closed === true) {
    return false;
  }

  const volume = Number.isFinite(candle.volume) ? candle.volume : 0;
  return (
    volume <= 1 &&
    isFlatCandle(candle) &&
    arePricesEqual(previous.close, candle.close)
  );
};

const getRepeatedFlatTailStartIndex = <TCandle extends Candle>(candles: readonly TCandle[]): number => {
  const terminalCandle = candles[candles.length - 1];
  if (!terminalCandle || !isFlatCandle(terminalCandle)) {
    return candles.length;
  }

  let repeatedFlatTailStart = candles.length - 1;
  for (let index = candles.length - 2; index >= 0; index -= 1) {
    const candidate = candles[index];
    if (
      !isFlatCandle(candidate) ||
      !arePricesEqual(candidate.open, terminalCandle.open) ||
      !arePricesEqual(candidate.high, terminalCandle.high) ||
      !arePricesEqual(candidate.low, terminalCandle.low) ||
      !arePricesEqual(candidate.close, terminalCandle.close)
    ) {
      break;
    }
    repeatedFlatTailStart = index;
  }

  return repeatedFlatTailStart;
};

export const hasOnlyRepeatedFlatCandles = (candles: readonly Candle[]): boolean => {
  const normalized = sortAndDedupeCandles(candles).filter(validateCandle);
  return normalized.length >= 3 && getRepeatedFlatTailStartIndex(normalized) === 0;
};

const pruneSyntheticFlatLiveTail = <TCandle extends Candle>(
  candles: TCandle[],
  allowRepeatedHistoryFallback: boolean,
): TCandle[] => {
  // Some closed-market REST feeds keep publishing frozen-price history rows
  // with non-zero synthetic volume. Once at least three identical flat bars
  // form the terminal suffix, the suffix is not price-forming market history.
  // Keep shorter flat endings because they can be legitimate illiquid bars.
  const repeatedFlatTailStart = allowRepeatedHistoryFallback
    ? getRepeatedFlatTailStartIndex(candles)
    : candles.length;

  const repeatedFlatTailLength = candles.length - repeatedFlatTailStart;
  const withoutRepeatedFlatTail =
    allowRepeatedHistoryFallback && repeatedFlatTailStart > 0 && repeatedFlatTailLength >= 3
      ? candles.slice(0, repeatedFlatTailStart)
      : candles;

  let firstSyntheticTailIndex = withoutRepeatedFlatTail.length;

  for (let index = withoutRepeatedFlatTail.length - 1; index > 0; index -= 1) {
    const candle = withoutRepeatedFlatTail[index] as CandleWithLiveMetadata;
    const previous = withoutRepeatedFlatTail[index - 1];
    if (!isSyntheticFlatLiveTailCandle(candle, previous)) {
      break;
    }
    firstSyntheticTailIndex = index;
  }

  return firstSyntheticTailIndex === withoutRepeatedFlatTail.length
    ? withoutRepeatedFlatTail
    : withoutRepeatedFlatTail.slice(0, firstSyntheticTailIndex);
};

const clampCandlesToClosedMarketSession = <TCandle extends Candle>(
  candles: TCandle[],
  _timeframe: string | undefined,
  sessionClose: number | null | undefined,
): { candles: TCandle[]; usedAuthoritativeBoundary: boolean } => {
  if (typeof sessionClose !== 'number' || !Number.isFinite(sessionClose) || sessionClose <= 0) {
    return { candles, usedAuthoritativeBoundary: false };
  }

  // Session close is an exclusive backend timestamp. Comparing candle starts
  // directly avoids assuming UTC-midnight D1/W1/MN alignment for every broker.
  const firstPostCloseIndex = candles.findIndex((candle) => candle.time >= sessionClose);
  // A close timestamp older than the whole visible series is stale for this
  // payload. Fail open instead of blanking the chart on a bad status response.
  if (firstPostCloseIndex === 0) {
    return { candles, usedAuthoritativeBoundary: false };
  }
  return {
    candles: firstPostCloseIndex < 0 ? candles : candles.slice(0, firstPostCloseIndex),
    usedAuthoritativeBoundary: candles.length > 0,
  };
};

export const sanitizeCandlesForChart = (
  candles: readonly Candle[],
  options: SanitizeCandlesForChartOptions = {},
): Candle[] => {
  const normalized = sortAndDedupeCandles(candles).filter(validateCandle);
  const sessionClamp = clampCandlesToClosedMarketSession(
    normalized,
    options.timeframe,
    options.closedMarketSessionClose,
  );
  return options.pruneSyntheticFlatLiveTail
    ? pruneSyntheticFlatLiveTail(
        sessionClamp.candles,
        // Repeated flat history is only a conservative missing-boundary repair.
        // A real session boundary is stronger evidence and must preserve valid
        // in-session flat bars (common on illiquid stocks/commodities).
        !sessionClamp.usedAuthoritativeBoundary,
      )
    : sessionClamp.candles;
};

export const convertCandlesForChart = (candles: readonly Candle[]): ChartCandle[] =>
  sanitizeCandlesForChart(candles).map((candle) => ({
    time: candle.time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume ?? 0,
  }));

export const convertCandlesToLinePoints = (candles: readonly Candle[]): ChartLinePoint[] =>
  sanitizeCandlesForChart(candles).map((candle) => ({
    time: candle.time,
    value: candle.close,
  }));
