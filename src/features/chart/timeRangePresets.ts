type CandleLike = {
  time: number;
};

type ChartTimeRangeBounds = {
  from: number;
  to: number;
};

export type ChartTimeRange =
  | 'auto'
  | '1d'
  | '5d'
  | '1m'
  | '3m'
  | '6m'
  | 'ytd'
  | '1y'
  | 'all'
  | 'custom';

const RANGE_LABELS: Record<Exclude<ChartTimeRange, 'custom'>, string> = {
  auto: 'Time Range',
  '1d': '1 Day',
  '5d': '5 Days',
  '1m': '1 Month',
  '3m': '3 Months',
  '6m': '6 Months',
  ytd: 'Year To Date',
  '1y': '1 Year',
  all: 'All Data',
};

const RANGE_TIMEFRAMES: Partial<Record<ChartTimeRange, string>> = {
  '1d': 'M5',
  '5d': 'H1',
  '1m': 'H4',
  '3m': 'D1',
  '6m': 'D1',
  ytd: 'D1',
  '1y': 'W1',
};

const DAY_SECONDS = 24 * 60 * 60;

export function getChartTimeRangeLabel(range: ChartTimeRange) {
  if (range === 'custom') {
    return 'Custom';
  }
  return RANGE_LABELS[range];
}

export function getChartTimeframeForRange(range: ChartTimeRange) {
  return RANGE_TIMEFRAMES[range];
}

function normalizeCandles<T extends CandleLike>(candles: readonly T[]) {
  const normalized: T[] = [];
  let sorted = true;
  let previousTime = -Infinity;

  for (const candle of candles) {
    if (!Number.isFinite(candle.time)) {
      continue;
    }
    if (candle.time < previousTime) {
      sorted = false;
    }
    previousTime = candle.time;
    normalized.push(candle);
  }

  return sorted ? normalized : normalized.sort((left, right) => left.time - right.time);
}

function getRangeStartTimestamp(range: Exclude<ChartTimeRange, 'auto' | 'all' | 'custom'>, latestTime: number) {
  if (range === 'ytd') {
    const latestDate = new Date(latestTime * 1000);
    return Date.UTC(latestDate.getUTCFullYear(), 0, 1) / 1000;
  }

  const durationDays: Record<Exclude<ChartTimeRange, 'auto' | 'all' | 'custom' | 'ytd'>, number> = {
    '1d': 1,
    '5d': 5,
    '1m': 30,
    '3m': 90,
    '6m': 182,
    '1y': 365,
  };

  return latestTime - durationDays[range] * DAY_SECONDS;
}

function resolveChartTimeRangeBounds<T extends CandleLike>(
  range: ChartTimeRange,
  candles: readonly T[],
  customDateValue?: Date | null,
): ChartTimeRangeBounds | null {
  const normalizedCandles = normalizeCandles(candles);
  if (normalizedCandles.length === 0) {
    return null;
  }

  const firstTime = normalizedCandles[0]?.time ?? 0;
  const lastTime = normalizedCandles[normalizedCandles.length - 1]?.time ?? firstTime;

  if (range === 'auto' || range === 'all') {
    return {
      from: firstTime,
      to: lastTime,
    };
  }

  if (range === 'custom') {
    if (!customDateValue) {
      return null;
    }

    const requestedFrom = Math.floor(customDateValue.getTime() / 1000);
    return {
      from: Math.max(firstTime, requestedFrom),
      to: Math.min(lastTime, requestedFrom + DAY_SECONDS * 7),
    };
  }

  return {
    from: Math.max(firstTime, getRangeStartTimestamp(range, lastTime)),
    to: lastTime,
  };
}

export function filterCandlesForChartTimeRange<T extends CandleLike>(
  range: ChartTimeRange,
  candles: readonly T[],
  customDateValue?: Date | null,
) {
  const normalizedCandles = normalizeCandles(candles);
  if (normalizedCandles.length === 0 || range === 'auto' || range === 'all') {
    return normalizedCandles;
  }

  const bounds = resolveChartTimeRangeBounds(range, normalizedCandles, customDateValue);
  if (!bounds) {
    return normalizedCandles;
  }

  const filteredCandles = normalizedCandles.filter((candle) => candle.time >= bounds.from && candle.time <= bounds.to);
  if (filteredCandles.length > 0) {
    return filteredCandles;
  }

  if (range === 'custom' && customDateValue) {
    const firstTime = normalizedCandles[0]?.time ?? 0;
    const lastTime = normalizedCandles[normalizedCandles.length - 1]?.time ?? firstTime;
    const requestedFrom = Math.floor(customDateValue.getTime() / 1000);

    if (requestedFrom < firstTime) {
      const fallbackTo = Math.min(firstTime + DAY_SECONDS * 7, lastTime);
      return normalizedCandles.filter((candle) => candle.time >= firstTime && candle.time <= fallbackTo);
    }

    const fallbackFrom = Math.max(firstTime, lastTime - DAY_SECONDS * 7);
    return normalizedCandles.filter((candle) => candle.time >= fallbackFrom && candle.time <= lastTime);
  }

  return normalizedCandles;
}

export function resolveChartVisibleRange<T extends CandleLike>(
  range: ChartTimeRange,
  candles: readonly T[],
  customDateValue?: Date | null,
) {
  const normalizedCandles = normalizeCandles(candles);
  if (normalizedCandles.length === 0) {
    return null;
  }

  const firstTime = normalizedCandles[0]?.time ?? 0;
  const lastTime = normalizedCandles[normalizedCandles.length - 1]?.time ?? firstTime;
  const averageStep =
    normalizedCandles.length > 1
      ? Math.max((lastTime - firstTime) / (normalizedCandles.length - 1), 60)
      : 60;
  const rightPadding = Math.max(averageStep * 2, 60);

  if (range === 'all') {
    return {
      from: firstTime,
      to: lastTime + rightPadding,
    };
  }

  if (range === 'custom') {
    if (!customDateValue) {
      return null;
    }

    const from = Math.floor(customDateValue.getTime() / 1000);
    return {
      from: Math.max(firstTime, from),
      to: Math.min(Math.max(from + DAY_SECONDS * 7, from + rightPadding), lastTime + rightPadding),
    };
  }

  if (range === 'auto') {
    return null;
  }

  const bounds = resolveChartTimeRangeBounds(range, normalizedCandles, customDateValue);
  const start = bounds?.from ?? firstTime;

  return {
    from: Math.max(firstTime, start),
    to: lastTime + rightPadding,
  };
}
