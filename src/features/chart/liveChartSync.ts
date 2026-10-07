import {
  getBucketGapCount,
  getBucketStart,
  getExpectedNextCandleTime,
  getTimeframeSeconds,
  normalizeTimeframe,
} from '../../domain/candles/core/timeframeUtils';

export type RenderableChartCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type ChartSeriesSnapshot = {
  length: number;
  firstTime: number | null;
  lastTime: number | null;
  lastSignature: string;
  previousLastSignature: string;
  tailWithoutLastSignature: string;
};

export type ChartSeriesUpdateMode = 'noop' | 'incremental' | 'full_reload';

export type ChartCandleGap = {
  fromTime: number;
  expectedTime: number;
  toTime: number;
  missingSeconds: number;
  /** Whole-bar count of the gap for the active timeframe (>= 1 when the gap is at least one bar). */
  missingBars: number;
  label: string;
};

export const EMPTY_CHART_SERIES_SNAPSHOT: ChartSeriesSnapshot = {
  length: 0,
  firstTime: null,
  lastTime: null,
  lastSignature: '',
  previousLastSignature: '',
  tailWithoutLastSignature: '',
};

export const shouldResetViewportForClosedMarketClamp = (
  previous: ChartSeriesSnapshot,
  next: ChartSeriesSnapshot,
  isMarketClosed: boolean,
): boolean =>
  isMarketClosed &&
  previous.lastTime !== null &&
  next.lastTime !== null &&
  next.lastTime < previous.lastTime;

export const shouldResetViewportForHistorylessBootstrap = (
  pendingContextKey: string,
  currentContextKey: string,
  historylessBootstrapSnapshot: ChartSeriesSnapshot,
  next: ChartSeriesSnapshot,
  nextHasHistoryCandles: boolean,
): boolean =>
  pendingContextKey.length > 0 &&
  pendingContextKey === currentContextKey &&
  historylessBootstrapSnapshot.length > 0 &&
  next.length > 0 &&
  nextHasHistoryCandles;

const buildCandleSignature = (candle: RenderableChartCandle | undefined): string => {
  if (!candle) {
    return '';
  }

  return `${candle.time}:${candle.open}:${candle.high}:${candle.low}:${candle.close}:${candle.volume ?? 0}`;
};

// Source of truth for timeframe maths (bucket starts, expected next bar,
// gap counting) lives in `domain/candles/core/timeframeUtils`. The chart's
// gap logic delegates to it so we can never drift from the canonical
// behaviour — D1/W1 align to UTC day/week, MN respects calendar months
// with variable bucket length, etc.
const isCandleAlignedToTimeframe = (
  time: number,
  timeframe: string,
): boolean => {
  if (!Number.isFinite(time) || time < 0) {
    return false;
  }
  const normalized = normalizeTimeframe(timeframe);
  // Calendar-aligned timeframes need real-date arithmetic via getBucketStart.
  // (We can't use it for non-calendar timeframes because `normalizeTimestampToSeconds`
  // inside it rejects time === 0 — and that's fine for a phone-clock chart but
  // breaks the modulo-style alignment check when called with a unix epoch.)
  if (normalized === 'D1' || normalized === 'W1' || normalized === 'MN') {
    if (time === 0) {
      return true;
    }
    return getBucketStart(time, timeframe) === time;
  }
  const intervalSeconds = getTimeframeSeconds(normalized);
  return intervalSeconds > 0 && time % intervalSeconds === 0;
};

/**
 * Format a gap in terms of the active timeframe. The bar count comes from
 * the canonical `getBucketGapCount` helper (handles calendar-month MN bars
 * properly) so the same gap reported on M5 vs H1 gives different bar
 * totals — exactly what the user expects when switching timeframes.
 *
 * Examples:
 *   M1 gap = 5min  →  `5 bars`
 *   M5 gap = 5min  →  `1 bar`
 *   M5 gap = 17min →  `3 bars (17m 0s)` (sub-bar leftover shown)
 *   M5 gap = 30s   →  `30s` (sub-bar — bar count would be misleading)
 */
export const formatCandleGapForTimeframe = (
  fromTime: number,
  toTime: number,
  timeframe: string,
): { label: string; missingBars: number; missingSeconds: number } => {
  const safeFrom = Math.max(0, Math.floor(Number.isFinite(fromTime) ? fromTime : 0));
  const safeTo = Math.max(safeFrom, Math.floor(Number.isFinite(toTime) ? toTime : 0));
  const missingSeconds = Math.max(0, safeTo - safeFrom);
  if (missingSeconds === 0) {
    return { label: '0s', missingBars: 0, missingSeconds };
  }
  const missingBars = getBucketGapCount(safeFrom, safeTo, timeframe);
  if (missingBars === 0) {
    return {
      label: formatCandleGapDuration(missingSeconds),
      missingBars: 0,
      missingSeconds,
    };
  }
  const barsLabel = missingBars === 1 ? '1 bar' : `${missingBars} bars`;
  // For non-MN timeframes the bar boundary is exact, so check whether the
  // gap is a clean multiple. (For MN we always append the duration since
  // calendar months vary and a numeric multiple wouldn't be reliable.)
  const tfSeconds = getTimeframeSeconds(timeframe);
  const isCleanMultiple = normalizeTimeframe(timeframe) !== 'MN' && missingSeconds === missingBars * tfSeconds;
  if (isCleanMultiple) {
    return { label: barsLabel, missingBars, missingSeconds };
  }
  return {
    label: `${barsLabel} (${formatCandleGapDuration(missingSeconds)})`,
    missingBars,
    missingSeconds,
  };
};

export const formatCandleGapDuration = (seconds: number): string => {
  const totalSeconds = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0 || parts.length > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0 || parts.length > 0) {
    parts.push(`${minutes}m`);
  }
  parts.push(`${remainingSeconds}s`);

  return parts.join(' ');
};

export const resolveLatestCandleGap = (
  candles: RenderableChartCandle[],
  timeframe: string,
  options: { nowSeconds?: number } = {},
): ChartCandleGap | null => {
  const sortedCandles: RenderableChartCandle[] = [];
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
    sortedCandles.push(candle);
  }
  if (!sorted) {
    sortedCandles.sort((left, right) => left.time - right.time);
  }

  if (sortedCandles.length === 0) {
    return null;
  }

  // Bucket-alignment guard: when the user changes timeframe the chart goes
  // through a transient where the candles array is still the *old*
  // timeframe's data while `chartTimeframe` already updated to the new
  // value. Computing a gap during that window produces nonsense numbers
  // (e.g. M1 candles read against an M5 expected interval claim ~4-bar
  // gaps everywhere). If the most recent candles aren't bucket-aligned to
  // the requested timeframe, suppress the gap until the candle stream
  // catches up.
  const lastCandle = sortedCandles[sortedCandles.length - 1];
  if (!isCandleAlignedToTimeframe(lastCandle.time, timeframe)) {
    return null;
  }
  if (sortedCandles.length >= 2) {
    const previousCandle = sortedCandles[sortedCandles.length - 2];
    if (!isCandleAlignedToTimeframe(previousCandle.time, timeframe)) {
      return null;
    }
  }

  if (sortedCandles.length < 2) {
    return null;
  }

  const nowSeconds = Math.floor(Number.isFinite(options.nowSeconds) ? Number(options.nowSeconds) : 0);
  if (nowSeconds > 0) {
    const expectedTime = getExpectedNextCandleTime(lastCandle.time, timeframe);
    if (nowSeconds > expectedTime) {
      const gap = formatCandleGapForTimeframe(expectedTime, nowSeconds, timeframe);
      if (gap.missingBars >= 1) {
        return {
          fromTime: lastCandle.time,
          expectedTime,
          toTime: nowSeconds,
          missingSeconds: gap.missingSeconds,
          missingBars: gap.missingBars,
          label: gap.label,
        };
      }
    }
  }

  // Walk pairs from latest backward — return the most recent in-between gap.
  for (let index = sortedCandles.length - 2; index >= 0; index -= 1) {
    const current = sortedCandles[index];
    const next = sortedCandles[index + 1];
    const expectedTime = getExpectedNextCandleTime(current.time, timeframe);
    if (next.time <= expectedTime) {
      continue;
    }
    const gap = formatCandleGapForTimeframe(expectedTime, next.time, timeframe);
    if (gap.missingBars >= 1) {
      return {
        fromTime: current.time,
        expectedTime,
        toTime: next.time,
        missingSeconds: gap.missingSeconds,
        missingBars: gap.missingBars,
        label: gap.label,
      };
    }
  }

  return null;
};

export const buildChartSeriesSnapshot = (
  candles: RenderableChartCandle[],
  tailSize: number = 12,
): ChartSeriesSnapshot => {
  if (candles.length === 0) {
    return EMPTY_CHART_SERIES_SNAPSHOT;
  }

  const first = candles[0];
  const last = candles[candles.length - 1];
  const previousLast = candles[candles.length - 2];
  const tailWithoutLast = candles.slice(Math.max(0, candles.length - tailSize), candles.length - 1);

  return {
    length: candles.length,
    firstTime: first?.time ?? null,
    lastTime: last?.time ?? null,
    lastSignature: buildCandleSignature(last),
    previousLastSignature: buildCandleSignature(previousLast),
    tailWithoutLastSignature: tailWithoutLast.map(buildCandleSignature).join('|'),
  };
};

export const getChartSeriesUpdateMode = (
  previous: ChartSeriesSnapshot,
  next: ChartSeriesSnapshot,
): ChartSeriesUpdateMode => {
  if (next.length === 0) {
    return 'noop';
  }

  if (previous.length === 0) {
    return 'full_reload';
  }

  if (next.firstTime !== previous.firstTime) {
    return 'full_reload';
  }

  if (next.length < previous.length || next.length > previous.length + 1) {
    return 'full_reload';
  }

  if (next.length === previous.length + 1) {
    return next.previousLastSignature === previous.lastSignature ? 'incremental' : 'full_reload';
  }

  if (
    next.lastSignature === previous.lastSignature &&
    next.tailWithoutLastSignature === previous.tailWithoutLastSignature
  ) {
    return 'noop';
  }

  if (
    next.lastTime === previous.lastTime &&
    next.tailWithoutLastSignature === previous.tailWithoutLastSignature
  ) {
    return 'incremental';
  }

  return 'full_reload';
};
