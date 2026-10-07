import { validateCandle } from './core/candleValidator';

/**
 * Converts chronological OHLC candles into price-driven Renko bricks.
 * `time` is made strictly increasing for Lightweight Charts, while
 * `sourceTime` preserves the candle timestamp that produced each brick.
 */
export const DEFAULT_RENKO_ATR_PERIOD = 14;
export const MAX_RENKO_BRICKS = 10_000;

const DEFAULT_RENKO_PRICE_FRACTION = 0.001;
const MIN_SYNTHETIC_TIME_STEP = 0.000001;
const PRICE_PRECISION_DIGITS = 15;

export type RenkoSourceCandle = Readonly<{
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}>;

export type RenkoBrick = {
  /** A Lightweight Charts-compatible, strictly increasing Unix-seconds key. */
  time: number;
  /** Timestamp of the source candle whose close produced this brick. */
  sourceTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Kept for the shared OHLC data shape; Renko does not render a volume pane. */
  volume: number;
  /** True only for the final forming brick that follows the newest live close. */
  isProjection: boolean;
};

export type ResolveRenkoBrickSizeOptions = Readonly<{
  atrPeriod?: number;
  minimumPriceIncrement?: number;
}>;

export type RenkoBrickSizeResolution = Readonly<{
  brickSize: number;
  source: 'atr' | 'minimum_increment' | 'price_fraction' | 'unavailable';
}>;

export type BuildRenkoBricksOptions = ResolveRenkoBrickSizeOptions & Readonly<{
  brickSize?: number;
  includeProjection?: boolean;
}>;

type NormalizedRenkoSourceCandle = Required<RenkoSourceCandle>;
type DraftRenkoBrick = Omit<RenkoBrick, 'time'>;
type RenkoDirection = -1 | 0 | 1;
type CompletedRenkoRun = Readonly<{
  source: NormalizedRenkoSourceCandle;
  firstOpen: number;
  firstClose: number;
  direction: Exclude<RenkoDirection, 0>;
  count: number;
  finalClose: number;
}>;

const isPositiveFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const normalizePrice = (value: number): number =>
  Number.parseFloat(value.toPrecision(PRICE_PRECISION_DIGITS));

const normalizeAtrPeriod = (value: number | undefined): number => {
  if (!isPositiveFiniteNumber(value)) {
    return DEFAULT_RENKO_ATR_PERIOD;
  }
  return Math.max(1, Math.min(MAX_RENKO_BRICKS, Math.floor(value)));
};

const normalizeMinimumPriceIncrement = (value: number | undefined): number | null =>
  isPositiveFiniteNumber(value) ? normalizePrice(value) : null;

export const resolveRenkoMinimumPriceIncrement = (
  candidates: readonly unknown[],
  fallback: number,
): number => {
  // Broker payloads expose the same price grid under several field names.
  // Use the first valid value, then fall back to the displayed decimal step.
  for (const candidate of candidates) {
    if (
      (typeof candidate !== 'number' && typeof candidate !== 'string')
      || String(candidate).trim().length === 0
    ) {
      continue;
    }
    const numeric = Number(candidate);
    if (isPositiveFiniteNumber(numeric)) {
      return normalizePrice(numeric);
    }
  }
  return isPositiveFiniteNumber(fallback) ? normalizePrice(fallback) : 0;
};

// Snap an ATR/manual box size to the broker's tradable price grid and never
// let a valid result become smaller than one price increment.
const roundBrickSizeToIncrement = (
  value: number,
  minimumPriceIncrement: number | null,
): number => {
  if (!isPositiveFiniteNumber(value)) {
    return minimumPriceIncrement ?? 0;
  }
  if (minimumPriceIncrement === null) {
    return normalizePrice(value);
  }

  const incrementCount = Math.max(1, Math.round(value / minimumPriceIncrement));
  return normalizePrice(incrementCount * minimumPriceIncrement);
};

const normalizeSourceCandles = (
  candles: readonly RenkoSourceCandle[],
): NormalizedRenkoSourceCandle[] => {
  if (!Array.isArray(candles) || candles.length === 0) {
    return [];
  }

  // Drop malformed OHLC rows and keep only the newest row for each timestamp;
  // the brick builder must always receive one ordered canonical price path.
  const byTime = new Map<number, NormalizedRenkoSourceCandle>();
  for (const candle of candles) {
    if (!validateCandle(candle)) {
      continue;
    }
    byTime.set(candle.time, {
      time: candle.time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume:
        typeof candle.volume === 'number' && Number.isFinite(candle.volume) && candle.volume >= 0
          ? candle.volume
          : 0,
    });
  }

  return Array.from(byTime.values()).sort((left, right) => left.time - right.time);
};

// True range includes overnight/session gaps from the prior close as well as
// the candle's own high-low span, which keeps ATR sizing market-correct.
const calculateTrueRanges = (candles: readonly NormalizedRenkoSourceCandle[]): number[] => {
  const ranges: number[] = [];
  let previousClose: number | null = null;

  for (const candle of candles) {
    const candleRange = candle.high - candle.low;
    const trueRange = previousClose === null
      ? candleRange
      : Math.max(
          candleRange,
          Math.abs(candle.high - previousClose),
          Math.abs(candle.low - previousClose),
        );
    if (Number.isFinite(trueRange) && trueRange >= 0) {
      ranges.push(trueRange);
    }
    previousClose = candle.close;
  }

  return ranges;
};

// Seed ATR with the initial simple average, then apply Wilder's smoothing to
// each remaining range so recent volatility changes the grid gradually.
const calculateWilderAtr = (trueRanges: readonly number[], period: number): number => {
  if (trueRanges.length === 0) {
    return 0;
  }
  const initialCount = Math.min(period, trueRanges.length);
  let atr = trueRanges
    .slice(0, initialCount)
    .reduce((sum, range) => sum + range, 0) / initialCount;
  for (let index = initialCount; index < trueRanges.length; index += 1) {
    atr = (atr * (period - 1) + trueRanges[index]) / period;
  }
  return atr;
};

const resolveRenkoBrickSizeFromNormalized = (
  candles: readonly NormalizedRenkoSourceCandle[],
  options: ResolveRenkoBrickSizeOptions,
): RenkoBrickSizeResolution => {
  if (candles.length === 0) {
    return { brickSize: 0, source: 'unavailable' };
  }

  const minimumPriceIncrement = normalizeMinimumPriceIncrement(options.minimumPriceIncrement);
  const period = normalizeAtrPeriod(options.atrPeriod);

  // The final source candle is the live/forming candle in the chart pipeline.
  // Excluding it keeps the automatic box size stable while its close changes.
  const completedCandles = candles.length > 1 ? candles.slice(0, -1) : candles;
  const trueRanges = calculateTrueRanges(completedCandles);
  const averageTrueRange = calculateWilderAtr(trueRanges, period);

  if (isPositiveFiniteNumber(averageTrueRange)) {
    return {
      brickSize: roundBrickSizeToIncrement(averageTrueRange, minimumPriceIncrement),
      source: 'atr',
    };
  }

  // Flat or very short histories still need a usable automatic Renko scale.
  // Prefer the broker's minimum increment; otherwise use a deterministic
  // 0.1% price fallback rather than returning a zero-sized box.
  if (minimumPriceIncrement !== null) {
    return { brickSize: minimumPriceIncrement, source: 'minimum_increment' };
  }
  const latestPrice = Math.abs(candles[candles.length - 1].close);
  return isPositiveFiniteNumber(latestPrice)
    ? {
        brickSize: normalizePrice(latestPrice * DEFAULT_RENKO_PRICE_FRACTION),
        source: 'price_fraction',
      }
    : { brickSize: 0, source: 'unavailable' };
};

/**
 * Resolves one stable automatic box size from recent completed source candles.
 * ATR uses Wilder smoothing across completed true ranges (14 by default) and
 * rounds to the broker's minimum price increment when one is supplied.
 */
export const resolveRenkoBrickSize = (
  candles: readonly RenkoSourceCandle[],
  options: ResolveRenkoBrickSizeOptions = {},
): number => resolveRenkoBrickSizeDetails(candles, options).brickSize;

export const resolveRenkoBrickSizeDetails = (
  candles: readonly RenkoSourceCandle[],
  options: ResolveRenkoBrickSizeOptions = {},
): RenkoBrickSizeResolution =>
  resolveRenkoBrickSizeFromNormalized(normalizeSourceCandles(candles), options);

// Normalize the box and derive high/low from its body edges. Source candle wicks
// are deliberately excluded because a Renko brick represents only price steps.
const makeDraftBrick = (
  source: NormalizedRenkoSourceCandle,
  open: number,
  close: number,
  isProjection: boolean,
): DraftRenkoBrick => {
  const normalizedOpen = normalizePrice(open);
  const normalizedClose = normalizePrice(close);
  return {
    sourceTime: source.time,
    open: normalizedOpen,
    high: Math.max(normalizedOpen, normalizedClose),
    low: Math.min(normalizedOpen, normalizedClose),
    close: normalizedClose,
    volume: source.volume,
    isProjection,
  };
};

const resolveProjectionOpen = (
  lastClose: number,
  direction: RenkoDirection,
  latestPrice: number,
  brickSize: number,
): number => {
  // The live projection follows the current price inside the active box. On a
  // possible reversal it starts one box away, but does not complete until the
  // traditional two-box reversal distance is reached.
  if (direction === 1 && latestPrice < lastClose) {
    const reversalOpen = normalizePrice(lastClose - brickSize);
    return latestPrice < reversalOpen ? reversalOpen : latestPrice;
  }
  if (direction === -1 && latestPrice > lastClose) {
    const reversalOpen = normalizePrice(lastClose + brickSize);
    return latestPrice > reversalOpen ? reversalOpen : latestPrice;
  }
  return lastClose;
};

const getStrictTimeStep = (time: number): number =>
  Math.max(MIN_SYNTHETIC_TIME_STEP, Math.abs(time) * Number.EPSILON * 4);

const assignSyntheticTimes = (drafts: readonly DraftRenkoBrick[]): RenkoBrick[] => {
  if (drafts.length === 0) {
    return [];
  }

  const result: RenkoBrick[] = [];
  let previousTime = Number.NEGATIVE_INFINITY;
  let groupStart = 0;

  while (groupStart < drafts.length) {
    const sourceTime = drafts[groupStart].sourceTime;
    let groupEnd = groupStart + 1;
    while (groupEnd < drafts.length && drafts[groupEnd].sourceTime === sourceTime) {
      groupEnd += 1;
    }

    const count = groupEnd - groupStart;
    // Lightweight Charts requires every brick to have a unique increasing
    // time. Keep the first brick on the real candle timestamp so time-axis
    // labels remain meaningful, then give same-candle bricks tiny fixed
    // offsets so their identities do not shift when another box completes.
    const fixedStep = getStrictTimeStep(sourceTime);

    for (let index = 0; index < count; index += 1) {
      const proposedTime = sourceTime + fixedStep * index;
      const strictStep = getStrictTimeStep(previousTime);
      const time = Number.isFinite(previousTime)
        ? Math.max(proposedTime, previousTime + strictStep)
        : proposedTime;
      result.push({ ...drafts[groupStart + index], time });
      previousTime = time;
    }

    groupStart = groupEnd;
  }

  return result;
};

/**
 * Builds close-based traditional Renko bricks with a two-box reversal rule.
 * Completed bricks are exactly one box tall. A final projection brick is kept
 * by default so its close—and therefore the chart's live price—always equals
 * the newest source close.
 */
export const buildRenkoBricks = (
  candles: readonly RenkoSourceCandle[],
  options: BuildRenkoBricksOptions = {},
): RenkoBrick[] => {
  const sourceCandles = normalizeSourceCandles(candles);
  if (sourceCandles.length === 0) {
    return [];
  }

  const minimumPriceIncrement = normalizeMinimumPriceIncrement(options.minimumPriceIncrement);
  const requestedBrickSize = isPositiveFiniteNumber(options.brickSize)
    ? options.brickSize
    : resolveRenkoBrickSizeFromNormalized(sourceCandles, options).brickSize;
  const brickSize = roundBrickSizeToIncrement(requestedBrickSize, minimumPriceIncrement);
  if (!isPositiveFiniteNumber(brickSize)) {
    return [];
  }

  const includeProjection = options.includeProjection !== false;
  const completedBrickLimit = Math.max(0, MAX_RENKO_BRICKS - (includeProjection ? 1 : 0));
  const completedRuns: CompletedRenkoRun[] = [];
  let lastClose = normalizePrice(sourceCandles[0].close);
  let direction: RenkoDirection = 0;
  // Floating-point prices can land microscopically below an exact box edge.
  // This tolerance accepts the intended threshold without inventing a box.
  const priceTolerance = Math.max(
    brickSize * 1e-10,
    Math.abs(lastClose) * Number.EPSILON * 8,
    Number.EPSILON,
  );
  const resolveCompletedBoxCount = (distance: number): number => {
    if (!(distance + priceTolerance >= brickSize)) {
      return 0;
    }
    const rawCount = Math.floor((distance + priceTolerance) / brickSize);
    if (!Number.isFinite(rawCount)) {
      return Number.MAX_SAFE_INTEGER;
    }
    return Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, rawCount));
  };

  const appendCompletedRun = (
    source: NormalizedRenkoSourceCandle,
    firstOpen: number,
    firstClose: number,
    nextDirection: Exclude<RenkoDirection, 0>,
    count: number,
    terminalPrice: number,
  ): void => {
    if (count <= 0) {
      return;
    }

    // Store long same-direction moves as compact runs first. Materializing
    // individual boxes later lets us enforce the global output limit safely.
    const rawFinalClose = firstClose + nextDirection * brickSize * (count - 1);
    const finalClose = normalizePrice(
      Number.isFinite(rawFinalClose) ? rawFinalClose : terminalPrice,
    );
    completedRuns.push({
      source,
      firstOpen: normalizePrice(firstOpen),
      firstClose: normalizePrice(firstClose),
      direction: nextDirection,
      count,
      finalClose,
    });

    lastClose = finalClose;
    direction = nextDirection;
  };

  // Renko reacts only to source closes: continuations need one box of movement;
  // direction changes need two boxes so the prior body is not overlapped.
  for (let candleIndex = 1; candleIndex < sourceCandles.length; candleIndex += 1) {
    const source = sourceCandles[candleIndex];
    const price = source.close;

    if (direction === 0) {
      const upwardCount = resolveCompletedBoxCount(price - lastClose);
      if (upwardCount > 0) {
        appendCompletedRun(source, lastClose, lastClose + brickSize, 1, upwardCount, price);
        continue;
      }
      const downwardCount = resolveCompletedBoxCount(lastClose - price);
      if (downwardCount > 0) {
        appendCompletedRun(source, lastClose, lastClose - brickSize, -1, downwardCount, price);
      }
      continue;
    }

    if (direction === 1) {
      const continuationCount = resolveCompletedBoxCount(price - lastClose);
      if (continuationCount > 0) {
        appendCompletedRun(source, lastClose, lastClose + brickSize, 1, continuationCount, price);
        continue;
      }
      const reversalCount = resolveCompletedBoxCount(lastClose - price) - 1;
      if (reversalCount > 0) {
        // A traditional reversal skips the previous brick's body. The first
        // opposite brick is still exactly one box tall, but it opens one box
        // away from the last close and requires a full two-box move to close.
        appendCompletedRun(
          source,
          lastClose - brickSize,
          lastClose - 2 * brickSize,
          -1,
          reversalCount,
          price,
        );
      }
      continue;
    }

    const continuationCount = resolveCompletedBoxCount(lastClose - price);
    if (continuationCount > 0) {
      appendCompletedRun(source, lastClose, lastClose - brickSize, -1, continuationCount, price);
      continue;
    }
    const reversalCount = resolveCompletedBoxCount(price - lastClose) - 1;
    if (reversalCount > 0) {
      appendCompletedRun(
        source,
        lastClose + brickSize,
        lastClose + 2 * brickSize,
        1,
        reversalCount,
        price,
      );
    }
  }

  // Retain the newest completed boxes when an extreme history exceeds the
  // safety cap, while reserving one slot for the live projection below.
  const drafts: DraftRenkoBrick[] = [];
  const retainedRuns: Array<Readonly<{ run: CompletedRenkoRun; startIndex: number }>> = [];
  let remainingCompletedCapacity = completedBrickLimit;
  for (let runIndex = completedRuns.length - 1; runIndex >= 0 && remainingCompletedCapacity > 0; runIndex -= 1) {
    const run = completedRuns[runIndex];
    const retainedCount = Math.min(run.count, remainingCompletedCapacity);
    retainedRuns.push({ run, startIndex: run.count - retainedCount });
    remainingCompletedCapacity -= retainedCount;
  }
  retainedRuns.reverse();

  for (const { run, startIndex } of retainedRuns) {
    for (let index = startIndex; index < run.count; index += 1) {
      const stepsFromEnd = run.count - 1 - index;
      const close = normalizePrice(
        run.finalClose - run.direction * brickSize * stepsFromEnd,
      );
      const open = index === 0
        ? run.firstOpen
        : normalizePrice(close - run.direction * brickSize);
      drafts.push(makeDraftBrick(run.source, open, close, false));
    }
  }

  if (includeProjection) {
    // Keep one forming box whose close equals the newest market price. This is
    // what keeps the Renko chart and its live price line visually synchronized.
    const latestSource = sourceCandles[sourceCandles.length - 1];
    drafts.push(makeDraftBrick(
      latestSource,
      resolveProjectionOpen(lastClose, direction, latestSource.close, brickSize),
      latestSource.close,
      true,
    ));
  }

  return assignSyntheticTimes(drafts);
};
