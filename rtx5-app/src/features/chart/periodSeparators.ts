import {
  getExpectedNextCandleTime,
  getTimeframeSeconds,
  normalizeTimeframe,
} from '../../domain/candles/core/timeframeUtils';

export type PeriodSeparatorType = 'day' | 'week' | 'month' | 'gap' | 'year' | 'market_close';

export type PeriodSeparatorCandle = {
  time: number;
};

export type PeriodSeparator = {
  time: number;
  index: number;
  type: PeriodSeparatorType;
};

export type PeriodSeparatorOptions = {
  periodSeparators?: boolean;
  showDaily?: boolean;
  showWeekly?: boolean;
  showMonthly?: boolean;
  showYearly?: boolean;
  showGapSeparators?: boolean;
  gapMultiplier?: number;
};

export const DEFAULT_PERIOD_SEPARATOR_OPTIONS = {
  periodSeparators: true,
  showDaily: true,
  showWeekly: true,
  showMonthly: true,
  showYearly: true,
  showGapSeparators: true,
  gapMultiplier: 3,
} satisfies Required<PeriodSeparatorOptions>;

const DAILY_SEPARATOR_TIMEFRAMES = new Set(['M1', 'M5', 'M15', 'M30', 'H1', 'H4']);

const toUtcParts = (timeSeconds: number) => {
  const date = new Date(timeSeconds * 1000);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
    weekStart: getUtcWeekStartSeconds(date),
  };
};

const getUtcWeekStartSeconds = (date: Date): number => {
  const dayStartSeconds = Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1000,
  );
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return dayStartSeconds - daysSinceMonday * 24 * 60 * 60;
};

const isFinitePositiveTime = (time: unknown): time is number =>
  typeof time === 'number' && Number.isFinite(time) && time > 0;

const resolveBoundaryType = (
  previousTime: number,
  currentTime: number,
  timeframe: string,
  options: Required<PeriodSeparatorOptions>,
): PeriodSeparatorType | null => {
  const previous = toUtcParts(previousTime);
  const current = toUtcParts(currentTime);
  const normalizedTimeframe = normalizeTimeframe(timeframe);
  const yearChanged = current.year !== previous.year;
  const monthChanged = yearChanged || current.month !== previous.month;
  const weekChanged = current.weekStart !== previous.weekStart;
  const dayChanged = monthChanged || current.day !== previous.day;

  if (options.showYearly && yearChanged && (normalizedTimeframe === 'W1' || normalizedTimeframe === 'MN')) {
    return 'year';
  }

  if (options.showMonthly && monthChanged && normalizedTimeframe !== 'MN') {
    return 'month';
  }

  if (options.showWeekly && weekChanged && normalizedTimeframe !== 'W1' && normalizedTimeframe !== 'MN') {
    return 'week';
  }

  if (options.showDaily && dayChanged && DAILY_SEPARATOR_TIMEFRAMES.has(normalizedTimeframe)) {
    return 'day';
  }

  return null;
};

const hasLargeGap = (
  previousTime: number,
  currentTime: number,
  timeframe: string,
  gapMultiplier: number,
): boolean => {
  const expectedSeconds = getTimeframeSeconds(timeframe);
  if (!Number.isFinite(expectedSeconds) || expectedSeconds <= 0) {
    return false;
  }
  const expectedNextTime = getExpectedNextCandleTime(previousTime, timeframe);
  const gapThreshold = expectedSeconds * Math.max(1, gapMultiplier);
  return currentTime > previousTime && currentTime - previousTime > gapThreshold && currentTime > expectedNextTime;
};

export const getPeriodSeparators = (
  candles: readonly PeriodSeparatorCandle[],
  timeframe: string,
  rawOptions: PeriodSeparatorOptions = {},
): PeriodSeparator[] => {
  const options: Required<PeriodSeparatorOptions> = {
    ...DEFAULT_PERIOD_SEPARATOR_OPTIONS,
    ...rawOptions,
  };

  if (!options.periodSeparators || candles.length < 2) {
    return [];
  }

  const separators: PeriodSeparator[] = [];
  const seenTimes = new Set<number>();

  for (let index = 1; index < candles.length; index += 1) {
    const previousTime = candles[index - 1]?.time;
    const currentTime = candles[index]?.time;
    if (!isFinitePositiveTime(previousTime) || !isFinitePositiveTime(currentTime)) {
      continue;
    }

    const boundaryType = resolveBoundaryType(previousTime, currentTime, timeframe, options);
    const separatorType =
      boundaryType ??
      (options.showGapSeparators && hasLargeGap(previousTime, currentTime, timeframe, options.gapMultiplier)
        ? 'gap'
        : null);

    if (!separatorType || seenTimes.has(currentTime)) {
      continue;
    }

    separators.push({
      time: currentTime,
      index,
      type: separatorType,
    });
    seenTimes.add(currentTime);
  }

  return separators;
};

export const getMarketCloseSeparator = (
  candles: readonly PeriodSeparatorCandle[],
  _timeframe: string,
  sessionClose: unknown,
): PeriodSeparator | null => {
  if (candles.length === 0) {
    return null;
  }

  const parsedClose = typeof sessionClose === 'number'
    ? sessionClose
    : typeof sessionClose === 'string' && sessionClose.trim()
      ? Number(sessionClose)
      : Number.NaN;
  const closeSeconds = parsedClose > 10_000_000_000 ? parsedClose / 1000 : parsedClose;
  if (!Number.isFinite(closeSeconds) || closeSeconds <= 0) {
    return null;
  }

  let boundaryIndex = -1;

  for (let index = 0; index < candles.length; index += 1) {
    const candleTime = candles[index]?.time;
    if (!isFinitePositiveTime(candleTime)) {
      continue;
    }
    // The backend close is exclusive. Direct comparison respects broker-local
    // D1/W1/MN rollovers instead of forcing those candles onto UTC buckets.
    if (candleTime < closeSeconds) {
      boundaryIndex = index;
      continue;
    }
    break;
  }

  if (boundaryIndex < 0) {
    return null;
  }

  return {
    time: candles[boundaryIndex].time,
    index: boundaryIndex,
    type: 'market_close',
  };
};
