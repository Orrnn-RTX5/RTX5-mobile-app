export const CHART_LINE_STYLE = {
  Solid: 0,
  Dotted: 1,
  Dashed: 2,
  LargeDashed: 3,
  SparseDotted: 4,
} as const;

export const STOP_OUT_MARGIN_LEVEL_FRACTION = 0.5;
export const MAX_CLOSED_POSITION_MARKERS = 8;
export const MAX_HMR_MARKERS = 3;
export const TERMINAL_ORDER_STATUSES = new Set([
  'FILLED',
  'CLOSED',
  'CANCELED',
  'CANCELLED',
  'REJECTED',
  'EXPIRED',
  'DONE',
]);

export type ChartOverlayPriceLine = {
  id: string;
  price: number;
  color: string;
  lineWidth: number;
  lineStyle: number;
  axisLabelVisible: boolean;
  title: string;
  labelSideText?: string;
  labelValueText?: string;
  labelSideColor?: string;
  labelValueColor?: string;
  labelPlacement?: 'floating' | 'line';
  labelMinTop?: number;
  dragKey?: string;
};

export type ChartOverlayMarkerPosition =
  | 'aboveBar'
  | 'belowBar'
  | 'atPriceTop'
  | 'atPriceBottom'
  | 'atPriceMiddle';

export type ChartOverlayMarkerShape = 'arrowUp' | 'arrowDown' | 'circle' | 'square';

export type ChartOverlayMarker = {
  id: string;
  time: number;
  position: ChartOverlayMarkerPosition;
  color: string;
  shape: ChartOverlayMarkerShape;
  text?: string;
  size?: number;
  price?: number;
};

/**
 * A completed trade's entry-to-exit path. Times are candle-open Unix seconds,
 * while prices remain the exact execution prices returned by trade history.
 */
export type ChartOverlayTradeHistorySegment = {
  id: string;
  fromTime: number;
  fromPrice: number;
  toTime: number;
  toPrice: number;
  color: string;
  lineWidth: number;
};

export type ChartOverlayPayload = {
  priceLines: ChartOverlayPriceLine[];
  markers: ChartOverlayMarker[];
  tradeHistorySegments: ChartOverlayTradeHistorySegment[];
};

export type ChartOverlayCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type ChartOverlayLiveAccount = {
  equity: number;
  margin: number;
  marginLevel?: number;
};

export const EMPTY_OVERLAY_PRICE_LINES: ChartOverlayPriceLine[] = [];
export const EMPTY_OVERLAY_MARKERS: ChartOverlayMarker[] = [];
export const EMPTY_OVERLAY_TRADE_HISTORY_SEGMENTS: ChartOverlayTradeHistorySegment[] = [];
export const EMPTY_OVERLAY_CANDLES: ChartOverlayCandle[] = [];
export const EMPTY_CHART_OVERLAY_PAYLOAD: ChartOverlayPayload = {
  priceLines: EMPTY_OVERLAY_PRICE_LINES,
  markers: EMPTY_OVERLAY_MARKERS,
  tradeHistorySegments: EMPTY_OVERLAY_TRADE_HISTORY_SEGMENTS,
};
