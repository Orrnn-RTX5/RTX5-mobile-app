import type { ChartColorsConfig } from '../../state/userPreferences';
import { CHART_DEFAULT_VISIBLE_BAR_MAX } from './ChartScreen.constants';
import {
  filterCandlesForChartTimeRange,
  type ChartTimeRange,
} from './timeRangePresets';

export type AreaChartDirection = 'up' | 'down' | 'unknown';

export type AreaChartDirectionPoint = Readonly<{
  time: number;
  value?: number | null;
  close?: number | null;
}>;

type NormalizedAreaChartPoint = Readonly<{
  time: number;
  value: number;
}>;

const resolvePointValue = (point: AreaChartDirectionPoint): number | null => {
  if (typeof point.value === 'number' && Number.isFinite(point.value)) {
    return point.value;
  }
  if (typeof point.close === 'number' && Number.isFinite(point.close)) {
    return point.close;
  }
  return null;
};

/**
 * Resolves the Area color from the same period that is being rendered.
 *
 * The first usable point is a fixed period baseline and the latest usable
 * point is the terminal value. Sorting and last-write-wins timestamp handling
 * keep this stable even when a backend snapshot arrives out of order.
 */
export const resolveAreaChartDirection = (
  points: readonly AreaChartDirectionPoint[],
): AreaChartDirection => {
  const pointsByTime = new Map<number, NormalizedAreaChartPoint>();

  for (const point of points) {
    if (!Number.isFinite(point.time)) {
      continue;
    }
    const value = resolvePointValue(point);
    if (value === null) {
      continue;
    }
    pointsByTime.set(point.time, { time: point.time, value });
  }

  const normalizedPoints = Array.from(pointsByTime.values()).sort(
    (left, right) => left.time - right.time,
  );
  if (normalizedPoints.length < 2) {
    return 'unknown';
  }

  const baseline = normalizedPoints[0].value;
  const terminal = normalizedPoints[normalizedPoints.length - 1].value;
  return terminal >= baseline ? 'up' : 'down';
};

type AreaChartRangeDirectionOptions = Readonly<{
  range: ChartTimeRange;
  points: readonly AreaChartDirectionPoint[];
  customDateValue?: Date | null;
  dailyChangePct?: number | null;
  autoVisiblePointCount?: number;
}>;

/**
 * Resolves the performance direction represented by the selected range.
 *
 * Auto and 1 Day mirror the daily move shown on Quotes whenever that feed
 * value exists. Every other preset compares the first and last usable close
 * in the exact candle range selected by the shared time-range helper.
 */
export const resolveAreaChartDirectionForRange = ({
  range,
  points,
  customDateValue,
  dailyChangePct,
  autoVisiblePointCount = CHART_DEFAULT_VISIBLE_BAR_MAX,
}: AreaChartRangeDirectionOptions): AreaChartDirection => {
  if (
    (range === 'auto' || range === '1d')
    && typeof dailyChangePct === 'number'
    && Number.isFinite(dailyChangePct)
  ) {
    return dailyChangePct >= 0 ? 'up' : 'down';
  }

  const rangePoints = filterCandlesForChartTimeRange(
    range,
    points,
    customDateValue,
  );
  if (range !== 'auto') {
    return resolveAreaChartDirection(rangePoints);
  }

  const requestedVisibleCount = Number.isFinite(autoVisiblePointCount)
    ? Math.max(2, Math.floor(autoVisiblePointCount))
    : CHART_DEFAULT_VISIBLE_BAR_MAX;
  return resolveAreaChartDirection(rangePoints.slice(-requestedVisibleCount));
};

export const resolveAreaChartColor = (
  direction: AreaChartDirection,
  colors: Pick<
    ChartColorsConfig,
    'candlesUptrend' | 'candlesDowntrend' | 'lineBody'
  >,
): string => {
  if (direction === 'up') {
    return colors.candlesUptrend;
  }
  if (direction === 'down') {
    return colors.candlesDowntrend;
  }
  return colors.lineBody;
};
