/**
 * Public entry for chart overlay payload assembly. Split for the 500-line
 * ceiling into:
 *   - `types.ts`              — shared types & constants
 *   - `symbolUtils.ts`        — broker-symbol normalization + precision helpers
 *   - `orderHelpers.ts`       — order/status normalize + label formatters
 *   - `markerCollections.ts`  — pattern / signal / HMR / closed-position markers
 *   - `tradeHistory.ts`       — exact entry/exit arrows + connecting segments
 *   - `lineBuilders.ts`       — pending-order / alert / stop-out lines
 *   - `buildPayload.ts`       — top-level `buildChartOverlayPayload`
 */
export {
  CHART_LINE_STYLE,
  type ChartOverlayPriceLine,
  type ChartOverlayMarkerPosition,
  type ChartOverlayMarkerShape,
  type ChartOverlayMarker,
  type ChartOverlayTradeHistorySegment,
  type ChartOverlayPayload,
  type ChartOverlayCandle,
  EMPTY_OVERLAY_TRADE_HISTORY_SEGMENTS,
} from './types';
export { normalizeChartOverlaySymbol } from './symbolUtils';
export { LIVE_CHART_PNL_COLORS, resolveLiveChartPnlColor } from './livePnlColors';
export {
  calculatePositionTargetPnl,
  formatTpSlOverlayLabel,
  formatTpSlOverlayValueLabel,
} from './orderHelpers';
export {
  applyChartOpenPositionLabelPatches,
  buildChartOpenPositionLabelPatches,
  buildChartOverlayMarkers,
  buildChartOverlayPayload,
  type ChartOpenPositionLabelPatch,
} from './buildPayload';
export {
  buildChartPositionStopDragKey,
  parseChartPositionStopDragKey,
  type ChartPositionStopDragTarget,
  type ChartPositionStopKind,
} from './positionStopDragKeys';
export {
  buildChartTradeHistoryOverlay,
  type BuildChartTradeHistoryOverlayInput,
  type ChartTradeHistoryOpenPosition,
  type ChartTradeHistoryOverlay,
} from './tradeHistory';
