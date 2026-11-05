export type TickPoint = {
  time: number;
  bid: number;
  ask: number;
};

export type OrderTickExecutionGraphProps = {
  ticks: TickPoint[];
  height?: number;
  bidColor?: string;
  askColor?: string;
  priceDecimals?: number;
  isDark?: boolean;
  backgroundColor?: string;
};

export type LiveOrderTickExecutionGraphProps = {
  symbol: string;
  bid?: number | null;
  ask?: number | null;
  timestamp?: number | null;
  enabled?: boolean;
  height?: number;
  bidColor?: string;
  askColor?: string;
  maxTicks?: number;
  priceDecimals?: number;
  isDark?: boolean;
  backgroundColor?: string;
};

export const DEFAULT_GRAPH_HEIGHT = 296;
export const DEFAULT_MAX_TICKS = 100;
export const GRAPH_LEFT_PADDING = 10;
export const GRAPH_TOP_PADDING = 16;
export const GRAPH_BOTTOM_PADDING = 16;
export const GRAPH_LABEL_COUNT = 7;
export const GRAPH_AXIS_LABEL_RIGHT_PADDING = 4;
export const GRAPH_BADGE_WIDTH = 62;
export const GRAPH_BADGE_HEIGHT = 20;
export const GRAPH_BADGE_GAP = 2;
export const GRAPH_RIGHT_AXIS_WIDTH = GRAPH_BADGE_WIDTH + GRAPH_BADGE_GAP;
export const GRAPH_AXIS_LABEL_OFFSET = 48;
export const GRAPH_MIN_LINE_GAP = GRAPH_BADGE_HEIGHT + 3;
export const GRAPH_TRACE_SOFT_STROKE_WIDTH = 2.2;
export const GRAPH_TRACE_MAIN_STROKE_WIDTH = 1.05;
export const GRAPH_TRACE_SOFT_OPACITY = 0.18;
