import { resolveLiveChartPnlColor } from './livePnlColors';
/**
 * Marker collection helpers and per-feature builders (patterns, signals, HMR,
 * closed positions). Each builder is a pure function so they can be composed
 * inside `buildChartOverlayPayload` without touching React state.
 */
import type { ClosedPosition } from '../../../api/positions';
import type { ChartColorsConfig } from '../../../state/userPreferences';
import { normalizeChartOverlaySymbol } from './symbolUtils';
import { toUpper } from './orderHelpers';
import {
  MAX_CLOSED_POSITION_MARKERS,
  MAX_HMR_MARKERS,
  type ChartOverlayCandle,
  type ChartOverlayMarker,
  type ChartOverlayPriceLine,
} from './types';

const clampMarkerSize = (value: number | undefined): number => {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(value ?? 1, 1.8));
};

export const sanitizeCandles = (candles: ChartOverlayCandle[]): ChartOverlayCandle[] =>
  candles
    .filter(
      (candle) =>
        Number.isFinite(candle?.time) &&
        Number.isFinite(candle?.open) &&
        Number.isFinite(candle?.high) &&
        Number.isFinite(candle?.low) &&
        Number.isFinite(candle?.close),
    )
    .sort((left, right) => left.time - right.time);

export const addUniquePriceLine = (
  target: Map<string, ChartOverlayPriceLine>,
  line: ChartOverlayPriceLine,
) => {
  const parsedPrice = Number(line.price);
  if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) return;
  target.set(line.id, { ...line, price: parsedPrice });
};

export const addUniqueMarker = (target: Map<string, ChartOverlayMarker>, marker: ChartOverlayMarker) => {
  const parsedTime = Number(marker.time);
  if (!Number.isFinite(parsedTime)) return;

  let parsedPrice = marker.price;
  if (parsedPrice !== undefined) {
    parsedPrice = Number(parsedPrice);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) return;
  }

  target.set(marker.id, {
    ...marker,
    time: parsedTime,
    price: parsedPrice,
    size: clampMarkerSize(marker.size),
  });
};

const findNearestCandleTime = (candles: ChartOverlayCandle[], rawTime: number): number | null => {
  if (!Number.isFinite(rawTime) || candles.length === 0) return null;

  let low = 0;
  let high = candles.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = candles[mid].time;
    if (candidate === rawTime) return candidate;
    if (candidate < rawTime) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const previous = candles[Math.max(0, high)];
  const next = candles[Math.min(candles.length - 1, low)];
  if (!previous) return next?.time ?? null;
  if (!next) return previous.time;
  return Math.abs(previous.time - rawTime) <= Math.abs(next.time - rawTime)
    ? previous.time
    : next.time;
};

export const buildPatternMarkers = (
  candles: ChartOverlayCandle[],
  activeTool: string | undefined,
): ChartOverlayMarker[] => {
  if (activeTool !== 'patterns' || candles.length === 0) return [];

  const markers: ChartOverlayMarker[] = [];
  candles.forEach((candle) => {
    const isGreen = candle.close > candle.open;
    const isRed = candle.open > candle.close;
    const body = Math.abs(candle.close - candle.open);
    const upperShadow = candle.high - Math.max(candle.open, candle.close);
    const lowerShadow = Math.min(candle.open, candle.close) - candle.low;

    if (isGreen && lowerShadow > body * 1.5 && upperShadow < body * 0.5) {
      markers.push({
        id: `pattern-lower-${candle.time}`,
        time: candle.time,
        position: 'belowBar',
        color: '#089981',
        shape: 'arrowUp',
        text: 'Pattern',
        size: 1,
      });
    } else if (isRed && upperShadow > body * 1.5 && lowerShadow < body * 0.5) {
      markers.push({
        id: `pattern-upper-${candle.time}`,
        time: candle.time,
        position: 'aboveBar',
        color: '#F23645',
        shape: 'arrowDown',
        text: 'Pattern',
        size: 1,
      });
    }
  });

  return markers;
};

export const buildTradingSignalMarkers = (
  candles: ChartOverlayCandle[],
  colors: ChartColorsConfig,
): ChartOverlayMarker[] => {
  if (candles.length < 20) return [];

  const closes = candles.map((candle) => candle.close);
  const latest = candles[candles.length - 1];

  const average = (window: number, offset: number = 0) => {
    const end = closes.length - offset;
    const start = Math.max(0, end - window);
    const values = closes.slice(start, end);
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };

  const fastNow = average(5);
  const slowNow = average(20);
  const fastPrev = average(5, 1);
  const slowPrev = average(20, 1);

  const isBullish = fastNow >= slowNow;
  const label = (fastNow - slowNow) * (fastPrev - slowPrev) <= 0 ? 'Signal' : 'Trend';

  return [
    {
      id: `signal-${latest.time}`,
      time: latest.time,
      position: isBullish ? 'belowBar' : 'aboveBar',
      color: isBullish ? colors.tradeTpSl || resolveLiveChartPnlColor(1, colors.background, '#4597FF') : colors.tradeStopOut || '#EF4444',
      shape: isBullish ? 'arrowUp' : 'arrowDown',
      text: label,
      size: 1.1,
    },
  ];
};

export const buildHmrMarkers = (candles: ChartOverlayCandle[]): ChartOverlayMarker[] => {
  if (candles.length < 12) return [];

  const ranges = candles
    .map((candle) => candle.high - candle.low)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);

  if (ranges.length === 0) return [];

  const percentileIndex = Math.max(0, Math.floor((ranges.length - 1) * 0.85));
  const threshold = ranges[percentileIndex];
  const minGap = Math.max(4, Math.floor(candles.length * 0.08));

  const selected: ChartOverlayMarker[] = [];
  let lastAcceptedIndex = -minGap;

  candles.forEach((candle, index) => {
    const candleRange = candle.high - candle.low;
    if (candleRange < threshold) return;
    if (index - lastAcceptedIndex < minGap) return;
    lastAcceptedIndex = index;
    selected.push({
      id: `hmr-${candle.time}`,
      time: candle.time,
      position: 'aboveBar',
      color: '#F59E0B',
      shape: 'square',
      text: 'HMR',
      size: 1,
    });
  });

  return selected.slice(-MAX_HMR_MARKERS);
};

/** Normalize close times to candle time units (unix seconds on the chart). */
const toChartCandleTimeSeconds = (raw: unknown): number | null => {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  // ms timestamps are ~1e12+; candle series times are unix seconds.
  if (value > 1e12) return Math.floor(value / 1000);
  if (value > 1e10) return Math.floor(value / 1000);
  return Math.floor(value);
};

export const buildClosedPositionMarkers = (
  candles: ChartOverlayCandle[],
  closedPositions: ClosedPosition[],
  chartSymbol: string,
): ChartOverlayMarker[] => {
  if (candles.length === 0 || closedPositions.length === 0) return [];

  const normalizedChartSymbol = normalizeChartOverlaySymbol(chartSymbol);
  const fromTime = candles[0].time;
  const toTime = candles[candles.length - 1].time;

  return closedPositions
    .filter((position) => normalizeChartOverlaySymbol(position.symbol) === normalizedChartSymbol)
    .map((position) => ({
      position,
      closeTime: toChartCandleTimeSeconds(position.time_close),
      closePrice: Number(position.price_close ?? position.price_current),
    }))
    .filter(
      (entry): entry is { position: ClosedPosition; closeTime: number; closePrice: number } =>
        entry.closeTime != null
        && Number.isFinite(entry.closePrice)
        && entry.closePrice > 0
        && entry.closeTime >= fromTime
        && entry.closeTime <= toTime,
    )
    .sort((left, right) => left.closeTime - right.closeTime)
    .slice(-MAX_CLOSED_POSITION_MARKERS)
    .reduce<ChartOverlayMarker[]>((accumulator, entry) => {
      const alignedTime = findNearestCandleTime(candles, entry.closeTime);
      if (!alignedTime) return accumulator;

      const isBuy = toUpper(entry.position.side) === 'BUY';
      const ticket = entry.position.ticket;
      accumulator.push({
        id: `closed-${ticket}`,
        time: alignedTime,
        position: 'atPriceMiddle',
        price: entry.closePrice,
        color: '#64748B',
        shape: isBuy ? 'circle' : 'square',
        // The marker itself records the historical exit without covering live
        // candles with a persistent "Closed" word.
        text: undefined,
        size: 1,
      });
      return accumulator;
    }, []);
};
