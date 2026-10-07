import { TradeVolumeBounds, resolveTradeVolumeBounds } from '../../utils/tradeVolume';
import { normalizeSymbol } from '../../domain/symbols';
import { CANDLE_HISTORY_TIMEFRAMES } from '../../domain/candles/core/timeframeUtils';

// Basic constants
export const CHART_TRADE_SLIDER_THUMB_SIZE = 20;
export const CHART_META_FALLBACK_WIDTH = 196;
export const CHART_META_FALLBACK_HEIGHT = 34;
export const CHART_META_DEFAULT_LEFT = 12;
export const CHART_META_DEFAULT_TOP = 10;
export const CHART_TRADE_MINI_PREVIEW_AXIS_WIDTH = 72;
export const CHART_TRADE_MINI_PREVIEW_LEFT_PAD = 0;
export const CHART_TRADE_MINI_PREVIEW_HEIGHT = 316;
export const CHART_TRADE_MINI_PREVIEW_TOP_PAD = 14;
export const CHART_TRADE_MINI_PREVIEW_BOTTOM_PAD = 16;
export const CHART_TRADE_MINI_PREVIEW_TAG_WIDTH = 68;
export const CHART_TRADE_MINI_PREVIEW_TAG_HEIGHT = 22;
export const CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH = 62;
export const CHART_DRAWING_MAGNET_THRESHOLD_PX = 18;
export const CHART_DEFAULT_VISIBLE_BAR_MAX = 88;
export const CHART_DEFAULT_VISIBLE_BAR_TARGET_PX = 8;
export const CHART_DEFAULT_VISIBLE_BAR_MIN = 42;
// Area charts stay faithful to every candle close, but compress a bounded
// history page much more tightly than candle-based charts. Subpixel logical
// spacing is intentional: Lightweight Charts still draws the genuine ordered
// closes as one crisp line without smoothing or inventing intermediate prices.
export const CHART_AREA_VISIBLE_BAR_MAX = 500;
export const CHART_AREA_VISIBLE_BAR_TARGET_PX = 0.65;
export const CHART_AREA_VISIBLE_BAR_MIN = 120;
export const CHART_AREA_TIME_SCALE_MIN_BAR_SPACING = 0.5;
export const CHART_AREA_LINE_WIDTH = 1;
export const CHART_DEFAULT_TIME_SCALE_BAR_SPACING = 9;
export const CHART_DEFAULT_RESET_BAR_SPACING_MAX = 11;
export const CHART_DEFAULT_RESET_BAR_SPACING_MIN = 5;
// Reserved empty bars on the right of the time-scale.
//
// Why this is non-zero: with rightOffset=0 the *last* candle in the data is
// flush against the right edge. When the next bucket starts forming, its
// candle is rendered one bar-spacing further right — i.e. *off-screen* —
// because there's no breathing room. The bid/ask price-line still paints
// over the visible area so users see prices moving but no candle. Every
// pro terminal (MT5, TradingView, cTrader) reserves a few bars of right
// padding so the live forming candle has a place to live in the visible
// range. 7 bars gives the MT5-style professional gap between the live candle
// and the right price scale without wasting too much chart width.
export const CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET = 7;
export const CHART_DEFAULT_TIME_SCALE_MIN_BAR_SPACING = 3;
export const CHART_TIME_SCALE_FIX_LEFT_EDGE = false;
// Keep the library clamp disabled: LightweightCharts clamps positive
// rightOffset back to the last bar when fixRightEdge is true. The native
// WebView enforces the live-edge bound itself at latest + rightOffset so the
// live candle gets the MT-style gap without allowing unlimited future scroll.
export const CHART_TIME_SCALE_FIX_RIGHT_EDGE = false;
// LightweightCharts v5 LineStyle enum:
//   0 = Solid     []
//   1 = Dotted    [1, 1]
//   2 = Dashed    [2, 2]
//   3 = LargeDashed [6, 6]
//   4 = SparseDotted [1, 4]
// Older docs (and v4 typings in some bundles) listed the enum in a
// different order, which is why this used to read "= 3 // Dotted". v5's
// canonical enum has Dotted = 1; see lightweight-charts.standalone.production.js.
// The custom native WebView grid is drawn as faint MT5-mobile guides behind
// candles, matching the measured 720x1640 reference recording.
export const CHART_GRID_LINE_STYLE = 4;
export const CHART_GRID_HORIZONTAL_LINE_COUNT = 13;
export const CHART_GRID_FIRST_INTERIOR_HORIZONTAL_OFFSET = 118;
export const CHART_GRID_HORIZONTAL_SPACING = 75;
// WebView vertical guides keep this measured visual spacing while anchoring
// their phase to LightweightCharts logical coordinates, so they pan with candles.
export const CHART_GRID_VERTICAL_SPACING = 56;
export const CHART_GRID_DASH_PATTERN = '7 5';
// SVG uses CSS pixels inside the Android WebView. A full 1px stroke reads
// heavier than the MT5 mobile capture after compositing behind the candle
// canvas, so use a fractional stroke while preserving the measured cadence.
export const CHART_GRID_STROKE_WIDTH = 0.5;
export const CHART_AXIS_DIVIDER_STROKE_WIDTH = 1;
export const CHART_AXIS_DIVIDER_DARK_COLOR = 'rgba(148,163,184,0.38)';
export const CHART_AXIS_DIVIDER_LIGHT_COLOR = '#CBD5E1';
// Main-chart candles stay readable while yielding visual priority to live
// trade P/L labels drawn over the same price area. Stored/custom hues remain
// untouched; this alpha is applied only inside the candle renderer.
export const CHART_CANDLE_RENDER_OPACITY = 0.72;
export const CHART_BEARISH_CANDLE_RENDER_OPACITY = 0.74;
export const CHART_TAP_MENU_PADDING = 10;
export const CHART_TAP_MENU_LOT_INPUT_SUPPRESSION_MS = 450;
export const CHART_TRADE_INLINE_FOOTER_FALLBACK_HEIGHT = 72;
// The compact sheet expands exactly to the divider below the chart toolbar so
// the toolbar stays fully visible without leaving an artificial chart strip.
export const CHART_TRADE_COMPACT_SHEET_TOP_GAP = 0;
export const CHART_TRADE_SHEET_TOP_GAP = 10;
export const FOOTER_LOT_PICKER_VALUE_ITEM_HEIGHT = 44;
export const FOOTER_LOT_PICKER_VALUE_ITEM_WIDTH = 56;
export const CHART_VIEWPORT_TOUCH_FAILSAFE_MS = 8000;
export const CHART_SYMBOL_PICKER_PREFETCH_LIMIT = 8;
export const CHART_SYMBOL_PICKER_PREFETCH_DELAY_MS = 32;

export const timeframes = [...CANDLE_HISTORY_TIMEFRAMES];

export type ChartTapMenuViewport = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ChartTradeTypeTabLayout = { x: number; width: number };
export type ChartTradePreviewDragKey = 'entry' | 'stopLimit' | 'sl' | 'tp';
export type TextInputCommitEvent = { nativeEvent: { text: string } };

// Functions
export function clampValue(value: number, min: number, max: number) {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

export function clampOverlayOffset(value: number, containerSize: number, overlaySize: number) {
  'worklet';
  return clampValue(
    value,
    CHART_TAP_MENU_PADDING,
    Math.max(CHART_TAP_MENU_PADDING, containerSize - overlaySize - CHART_TAP_MENU_PADDING),
  );
}

export const formatLooseTradeVolumeLabel = (value: number, bounds?: TradeVolumeBounds) => {
  const { decimals } = resolveTradeVolumeBounds(bounds);
  return Number(value.toFixed(decimals)).toString();
};

export function resolveMaxTradeVolumeForMargin(freeMargin: number, marginPerLot: number, bounds: TradeVolumeBounds) {
  const resolved = resolveTradeVolumeBounds(bounds);
  if (!Number.isFinite(freeMargin) || freeMargin <= 0 || !Number.isFinite(marginPerLot) || marginPerLot <= 0) {
    return 0;
  }

  const rawMaxVolume = Math.min(resolved.maxVolume, freeMargin / marginPerLot);
  if (rawMaxVolume < resolved.minVolume) {
    return 0;
  }

  const steppedMaxVolume =
    resolved.minVolume +
    Math.floor((rawMaxVolume - resolved.minVolume) / resolved.stepVolume + 1e-9) * resolved.stepVolume;

  return Math.max(
    0,
    Math.min(
      resolved.maxVolume,
      Number(steppedMaxVolume.toFixed(resolved.decimals)),
    ),
  );
}

export const getChartTradeContractSize = (symbol: string) => {
  const normalized = normalizeSymbol(symbol);
  if (normalized.includes('XAU') || normalized.includes('XAG')) return 100;
  if (normalized.includes('BTC') || normalized.includes('ETH')) return 1;
  if (normalized.includes('US30') || normalized.includes('SPX') || normalized.includes('NAS') || normalized.includes('GER') || normalized.includes('UK')) return 10;
  return 100000;
};

export const resolveTradeStopPreviewPrice = (
  kind: 'sl' | 'tp',
  entryPrice: number,
  side: 'buy' | 'sell',
  offset: number,
  roundPrice: (value: number) => number,
) => {
  const direction = side === 'buy' ? 1 : -1;
  const signedOffset = kind === 'tp' ? offset * direction : -offset * direction;
  return roundPrice(entryPrice + signedOffset);
};

export type ChartVisiblePriceRange = Readonly<{
  from: number;
  to: number;
}>;

export const resolveVisibleTradeStopPreviewPrice = (
  kind: 'sl' | 'tp',
  entryPrice: number,
  side: 'buy' | 'sell',
  offset: number,
  minimumPriceStep: number,
  visibleRange: ChartVisiblePriceRange | null | undefined,
  roundPrice: (value: number) => number,
) => {
  const fallbackPrice = resolveTradeStopPreviewPrice(kind, entryPrice, side, offset, roundPrice);
  const rangeFrom = Number(visibleRange?.from);
  const rangeTo = Number(visibleRange?.to);
  if (
    !Number.isFinite(entryPrice)
    || entryPrice <= 0
    || !Number.isFinite(rangeFrom)
    || !Number.isFinite(rangeTo)
    || rangeFrom === rangeTo
  ) {
    return fallbackPrice;
  }

  const lowerBound = Math.min(rangeFrom, rangeTo);
  const upperBound = Math.max(rangeFrom, rangeTo);
  const rangeSpan = upperBound - lowerBound;
  const direction = (side === 'buy' ? 1 : -1) * (kind === 'tp' ? 1 : -1);
  const minimumOffset = Number.isFinite(minimumPriceStep) && minimumPriceStep > 0
    ? minimumPriceStep
    : Number.EPSILON;
  // The chart symbol/OHLC header is painted over the upper portion of the
  // price area. Keep newly-created guides out of both edge bands so their
  // labels remain readable instead of landing under that header or the sheet.
  const edgePadding = rangeSpan * 0.15;
  const paddedDirectionalRoom = direction > 0
    ? upperBound - edgePadding - entryPrice
    : entryPrice - (lowerBound + edgePadding);
  const fullDirectionalRoom = direction > 0
    ? upperBound - entryPrice
    : entryPrice - lowerBound;

  if (!(fullDirectionalRoom >= minimumOffset)) {
    return fallbackPrice;
  }

  const availableOffset = paddedDirectionalRoom >= minimumOffset
    ? paddedDirectionalRoom
    : fullDirectionalRoom * 0.25;
  const requestedOffset = Number.isFinite(offset) && offset > 0 ? offset : minimumOffset;
  const preferredVisibleOffset = Math.max(minimumOffset, rangeSpan * 0.18);
  const visibleOffset = Math.min(requestedOffset, preferredVisibleOffset, availableOffset);
  if (!(visibleOffset > 0)) {
    return fallbackPrice;
  }

  return roundPrice(entryPrice + direction * visibleOffset);
};
