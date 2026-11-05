import type { Candle } from '../core/candleTypes';
import { getTimeframeSeconds } from '../core/timeframeUtils';

const CROSS_SOURCE_RANGE_MULTIPLE = 10;
const CROSS_SOURCE_RELATIVE_PRICE_TOLERANCE = 0.02;
const INTERNAL_OUTLIER_RANGE_MULTIPLE = 10;
const INTERNAL_OUTLIER_RELATIVE_PRICE_TOLERANCE = 0.2;
const SERIES_REGIME_RANGE_MULTIPLE = 10;
const SERIES_REGIME_RELATIVE_PRICE_TOLERANCE = 0.2;
const CONTIGUOUS_TIME_TOLERANCE_MULTIPLE = 1.5;
const MAX_ISOLATED_OUTLIER_RUN = 5;

const getBounds = (candle: Pick<Candle, 'open' | 'high' | 'low' | 'close'>) => ({
  high: Math.max(candle.open, candle.high, candle.low, candle.close),
  low: Math.min(candle.open, candle.high, candle.low, candle.close),
});

const getReferencePrice = (candle: Pick<Candle, 'open' | 'high' | 'low' | 'close'>): number =>
  Math.max(Math.abs(candle.close), Math.abs(candle.open), 1);

const isPriceCoherentWithCandleTolerance = (
  candle: Pick<Candle, 'open' | 'high' | 'low' | 'close'>,
  price: number,
  rangeMultiple: number,
  relativePriceTolerance: number,
): boolean => {
  if (!Number.isFinite(price)) {
    return false;
  }

  const bounds = getBounds(candle);
  if (price >= bounds.low && price <= bounds.high) {
    return true;
  }

  const range = Math.max(0, bounds.high - bounds.low);
  const distance = price < bounds.low ? bounds.low - price : price - bounds.high;
  const toleratedDistance = Math.max(
    range * rangeMultiple,
    getReferencePrice(candle) * relativePriceTolerance,
  );

  return distance <= toleratedDistance;
};

export const isPriceCoherentWithCandle = (
  candle: Pick<Candle, 'open' | 'high' | 'low' | 'close'>,
  price: number,
): boolean => {
  return isPriceCoherentWithCandleTolerance(
    candle,
    price,
    CROSS_SOURCE_RANGE_MULTIPLE,
    CROSS_SOURCE_RELATIVE_PRICE_TOLERANCE,
  );
};

export const areCandlePricesCoherent = (
  left: Pick<Candle, 'open' | 'high' | 'low' | 'close'>,
  right: Pick<Candle, 'open' | 'high' | 'low' | 'close'>,
): boolean => {
  const leftBounds = getBounds(left);
  const rightBounds = getBounds(right);

  if (leftBounds.low <= rightBounds.high && rightBounds.low <= leftBounds.high) {
    return true;
  }

  return (
    isPriceCoherentWithCandle(left, right.open) ||
    isPriceCoherentWithCandle(left, right.close) ||
    isPriceCoherentWithCandle(right, left.open) ||
    isPriceCoherentWithCandle(right, left.close)
  );
};

export const areCandlePriceRegimesCoherent = (
  left: Pick<Candle, 'open' | 'high' | 'low' | 'close'>,
  right: Pick<Candle, 'open' | 'high' | 'low' | 'close'>,
): boolean => {
  const leftBounds = getBounds(left);
  const rightBounds = getBounds(right);

  if (leftBounds.low <= rightBounds.high && rightBounds.low <= leftBounds.high) {
    return true;
  }

  return (
    isPriceCoherentWithCandleTolerance(
      left,
      right.open,
      SERIES_REGIME_RANGE_MULTIPLE,
      SERIES_REGIME_RELATIVE_PRICE_TOLERANCE,
    ) ||
    isPriceCoherentWithCandleTolerance(
      left,
      right.close,
      SERIES_REGIME_RANGE_MULTIPLE,
      SERIES_REGIME_RELATIVE_PRICE_TOLERANCE,
    ) ||
    isPriceCoherentWithCandleTolerance(
      right,
      left.open,
      SERIES_REGIME_RANGE_MULTIPLE,
      SERIES_REGIME_RELATIVE_PRICE_TOLERANCE,
    ) ||
    isPriceCoherentWithCandleTolerance(
      right,
      left.close,
      SERIES_REGIME_RANGE_MULTIPLE,
      SERIES_REGIME_RELATIVE_PRICE_TOLERANCE,
    )
  );
};

export const isCandleInternallyCoherent = (
  candle: Pick<Candle, 'open' | 'high' | 'low' | 'close'>,
): boolean => {
  const values = [candle.open, candle.high, candle.low, candle.close];
  if (!values.every(Number.isFinite)) {
    return false;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const reference = Math.max(Math.abs(candle.close), Math.abs(candle.open), 1);

  const lowClusterRange = Math.max(0, sorted[2] - sorted[0]);
  const highOutlierDistance = Math.max(0, sorted[3] - sorted[2]);
  const highOutlierTolerance = Math.max(
    lowClusterRange * INTERNAL_OUTLIER_RANGE_MULTIPLE,
    reference * INTERNAL_OUTLIER_RELATIVE_PRICE_TOLERANCE,
  );
  if (highOutlierDistance > highOutlierTolerance) {
    return false;
  }

  const highClusterRange = Math.max(0, sorted[3] - sorted[1]);
  const lowOutlierDistance = Math.max(0, sorted[1] - sorted[0]);
  const lowOutlierTolerance = Math.max(
    highClusterRange * INTERNAL_OUTLIER_RANGE_MULTIPLE,
    reference * INTERNAL_OUTLIER_RELATIVE_PRICE_TOLERANCE,
  );

  return lowOutlierDistance <= lowOutlierTolerance;
};

const inferExpectedCandleSeconds = (candles: readonly Pick<Candle, 'time'>[]): number | null => {
  const diffs: number[] = [];
  for (let index = 1; index < candles.length; index += 1) {
    const diff = candles[index].time - candles[index - 1].time;
    if (Number.isFinite(diff) && diff > 0) {
      diffs.push(diff);
    }
  }

  if (diffs.length < 2) {
    return null;
  }

  diffs.sort((left, right) => left - right);
  return diffs[Math.floor(diffs.length / 2)];
};

const isContiguousCandlePair = (
  left: Pick<Candle, 'time'>,
  right: Pick<Candle, 'time'>,
  expectedSeconds: number | null,
): boolean => {
  const delta = right.time - left.time;
  if (!Number.isFinite(delta) || delta <= 0) {
    return false;
  }
  if (expectedSeconds === null || expectedSeconds <= 0) {
    return false;
  }
  return delta <= expectedSeconds * CONTIGUOUS_TIME_TOLERANCE_MULTIPLE;
};

export type PriceContinuityOptions = {
  timeframe?: string;
};

export const filterCandlesByPriceContinuity = <TCandle extends Candle>(
  candles: readonly TCandle[],
  options: PriceContinuityOptions = {},
): TCandle[] => {
  if (candles.length <= 1) {
    return [...candles];
  }

  const expectedSeconds = options.timeframe
    ? getTimeframeSeconds(options.timeframe)
    : inferExpectedCandleSeconds(candles);
  const segments: TCandle[][] = [];
  let currentSegment: TCandle[] = [];

  for (const candle of candles) {
    const previous = currentSegment[currentSegment.length - 1];
    if (
      previous &&
      isContiguousCandlePair(previous, candle, expectedSeconds) &&
      !areCandlePriceRegimesCoherent(previous, candle)
    ) {
      segments.push(currentSegment);
      currentSegment = [candle];
      continue;
    }

    currentSegment.push(candle);
  }

  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }
  if (segments.length <= 1) {
    return [...candles];
  }

  const keptSegments: TCandle[][] = [segments[segments.length - 1]];
  for (let index = segments.length - 2; index >= 0; index -= 1) {
    const candidate = segments[index];
    const candidateTail = candidate[candidate.length - 1];
    const keptHead = keptSegments[0][0];
    if (candidateTail && keptHead && areCandlePriceRegimesCoherent(candidateTail, keptHead)) {
      keptSegments.unshift(candidate);
    }
  }

  return keptSegments.flat();
};

export const filterIsolatedPriceOutliers = <TCandle extends Candle>(
  candles: readonly TCandle[],
  options: PriceContinuityOptions = {},
): TCandle[] => {
  if (candles.length <= 2) {
    return [...candles];
  }

  const expectedSeconds = options.timeframe
    ? getTimeframeSeconds(options.timeframe)
    : inferExpectedCandleSeconds(candles);
  if (expectedSeconds === null || expectedSeconds <= 0) {
    return [...candles];
  }

  const filtered: TCandle[] = [candles[0]];
  let index = 1;

  while (index < candles.length) {
    const previousKept = filtered[filtered.length - 1];
    const current = candles[index];

    if (
      previousKept &&
      isContiguousCandlePair(previousKept, current, expectedSeconds) &&
      !areCandlePriceRegimesCoherent(previousKept, current)
    ) {
      const maxAnchorIndex = Math.min(candles.length - 1, index + MAX_ISOLATED_OUTLIER_RUN);
      let contiguousRun = true;
      let foundAnchor = false;

      for (let anchorIndex = index + 1; anchorIndex <= maxAnchorIndex; anchorIndex += 1) {
        const prior = candles[anchorIndex - 1];
        const candidateAnchor = candles[anchorIndex];
        contiguousRun =
          contiguousRun &&
          isContiguousCandlePair(prior, candidateAnchor, expectedSeconds);

        if (!contiguousRun) {
          break;
        }

        if (areCandlePriceRegimesCoherent(previousKept, candidateAnchor)) {
          filtered.push(candidateAnchor);
          index = anchorIndex + 1;
          foundAnchor = true;
          break;
        }
      }

      if (foundAnchor) {
        continue;
      }
    }

    filtered.push(current);
    index += 1;
  }

  return filtered;
};
