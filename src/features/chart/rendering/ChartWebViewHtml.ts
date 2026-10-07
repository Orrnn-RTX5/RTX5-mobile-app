import { LIGHTWEIGHT_CHARTS_JS } from "./lightweightChartsBundle";
import { RTX5_CUSTOM_CANDLESTICK_SERIES_WEBVIEW_JS } from "../../../domain/candles/rendering/customCandlestickSeriesWebView";
import { ENHANCED_DRAWING_TOOLS_JS } from "../plugins/enhancedDrawingToolsString";
import { CHART_AREA_LINE_WIDTH, CHART_AREA_TIME_SCALE_MIN_BAR_SPACING, CHART_AREA_VISIBLE_BAR_MAX, CHART_AREA_VISIBLE_BAR_MIN, CHART_AREA_VISIBLE_BAR_TARGET_PX, CHART_AXIS_DIVIDER_STROKE_WIDTH, CHART_BEARISH_CANDLE_RENDER_OPACITY, CHART_CANDLE_RENDER_OPACITY, CHART_DEFAULT_VISIBLE_BAR_MAX, CHART_DEFAULT_VISIBLE_BAR_TARGET_PX, CHART_DEFAULT_VISIBLE_BAR_MIN, CHART_DEFAULT_TIME_SCALE_BAR_SPACING, CHART_DEFAULT_RESET_BAR_SPACING_MAX, CHART_DEFAULT_RESET_BAR_SPACING_MIN, CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET, CHART_DEFAULT_TIME_SCALE_MIN_BAR_SPACING, CHART_DRAWING_MAGNET_THRESHOLD_PX, CHART_GRID_DASH_PATTERN, CHART_GRID_FIRST_INTERIOR_HORIZONTAL_OFFSET, CHART_GRID_HORIZONTAL_LINE_COUNT, CHART_GRID_HORIZONTAL_SPACING, CHART_GRID_STROKE_WIDTH, CHART_GRID_VERTICAL_SPACING, CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH, CHART_TIME_SCALE_FIX_LEFT_EDGE, CHART_TIME_SCALE_FIX_RIGHT_EDGE } from "../ChartScreen.constants";
import { CHART_CANDLE_COUNTDOWN_FIXED_SECONDS } from "../chartCandleCountdown";
import {
  MT5_PRICE_SCALE_BOUND_OCTAVES,
  MT5_PRICE_SCALE_MAX_DRAG_OCTAVES,
  MT5_PRICE_SCALE_MIN_VISIBLE_TICK_INTERVALS,
  MT5_PRICE_SCALE_OCTAVES_PER_PLOT,
  MT5_PRICE_SCALE_GESTURE_WEBVIEW_JS,
} from "../mt5PriceScaleGesture";
import {
  CHART_PRICE_SCALE_LABEL_FONT_SIZE,
  CHART_PRICE_SCALE_LABEL_FONT_WEIGHT,
  CHART_PRICE_SCALE_LABEL_HEIGHT,
} from "../chartPriceScaleTypography";

export const CH_HTML = `
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
    <meta name="color-scheme" content="light dark">
    <script>${LIGHTWEIGHT_CHARTS_JS}</script>
    <script>${RTX5_CUSTOM_CANDLESTICK_SERIES_WEBVIEW_JS}</script>

    <script>${ENHANCED_DRAWING_TOOLS_JS}</script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; position: relative; }
      #chart { width: 100%; height: 100%; position: relative; z-index: 1; background: transparent; }
      .rtx5-chart-pane-background {
        position: absolute;
        pointer-events: none;
        z-index: 0;
      }
      .rtx5-right-price-scale-fallback {
        position: absolute;
        inset: 0;
        pointer-events: none;
        overflow: hidden;
        z-index: 30;
      }
      .rtx5-right-price-scale-fallback-axis {
        position: absolute;
        /* This is the visible price-axis surface, so let it own input before
           Lightweight Charts or Android's parent scroller can cancel it. */
        pointer-events: auto;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
        z-index: 0;
      }
      .rtx5-right-price-scale-fallback-label {
        position: absolute;
        box-sizing: border-box;
        height: ${CHART_PRICE_SCALE_LABEL_HEIGHT}px;
        line-height: ${CHART_PRICE_SCALE_LABEL_HEIGHT}px;
        font-size: ${CHART_PRICE_SCALE_LABEL_FONT_SIZE}px;
        font-weight: ${CHART_PRICE_SCALE_LABEL_FONT_WEIGHT};
        white-space: nowrap;
        overflow: hidden;
        text-overflow: clip;
        padding: 0 6px 0 2px;
        text-align: right;
        font-variant-numeric: tabular-nums;
        font-feature-settings: 'tnum' 1, 'lnum' 1;
        z-index: 2;
      }
      #rtx5-moving-vertical-grid {
        position: absolute;
        left: 0;
        top: 0;
        width: 0;
        height: 0;
        pointer-events: none;
        overflow: visible;
        z-index: 0;
      }
      #rtx5-period-separators {
        position: absolute;
        left: 0;
        top: 0;
        width: 0;
        height: 0;
        pointer-events: none;
        overflow: hidden;
        z-index: 0;
        shape-rendering: crispEdges;
      }
      #rtx5-axis-dividers {
        position: absolute;
        left: 0;
        top: 0;
        width: 0;
        height: 0;
        pointer-events: none;
        overflow: visible;
        z-index: 2;
        shape-rendering: crispEdges;
      }
    </style>
</head>
<body>
    <div id="chart"></div>
    <svg id="rtx5-moving-vertical-grid" aria-hidden="true"></svg>
    <svg id="rtx5-period-separators" aria-hidden="true"></svg>
    <svg id="rtx5-axis-dividers" aria-hidden="true"></svg>
    <script>
      // ─────────────────────────────────────────────────────────────────
      //   Minimal, fresh candle pipeline
      //
      //   Contract with the React Native host:
      //     • host calls initChart(opts, chartType, candles, displayDecimals)
      //         once per (symbol, timeframe, type) change
      //     • host calls updateChartData(candles) whenever the canonical
      //         history+live candle array changes
      //     • host may still call updateTick(candle) for narrow live patches,
      //         but the chart no longer depends on a second websocket delta
      //         bridge to stay in sync
      //     • host calls setLivePriceLine(price) for the single live Bid line
      //
      //   Native candlesticks use the RTX5 custom series so wick/body
      //   geometry stays centered and stable on mobile WebView pixel grids.
      //   Line and OHLC bars still use the standard lightweight-charts
      //   series implementations. Pre-existing gaps in the data stay visible.
      // ─────────────────────────────────────────────────────────────────
      // Diagnostic: verify library loaded
      if (typeof LightweightCharts === 'undefined') {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'ERROR',
            message: 'FATAL: LightweightCharts library did not load. typeof=' + typeof LightweightCharts
          }));
        } catch(_) {}
      }

      var chart = null;
      var series = null;
      var bidPriceLine = null;
      var askPriceLine = null;
      var marketPriceLineRefs = [];
      var marketPriceLinesVisible = false;
      var marketLiveColor = '#2962FF';
      // Dedicated horizontal line at the live close. We own this instance
      // so we can retint it blue (up candle) / red (down candle) and shift
      // its price on every tick WITHOUT calling applyOptions on the main
      // candle series (which internally forces a full data redraw and was
      // causing history to blank on bucket updates).
      var directionPriceLine = null;
      var directionPriceLineVisible = true;
      // Same idea on the move-bars pane — horizontal line at the live bar's
      // move magnitude, tinted blue / red in lockstep with the candle.
      var moveDirectionPriceLine = null;
      var lastBarTime = 0;
      var seriesType = 'candles';
      var pendingTick = null;
      var tickFlushHandle = 0;
      var tickFlushFallbackHandle = 0;
      var LIVE_TICK_FLUSH_FALLBACK_MS = 64;
      var LIVE_TICK_LINE_RETRY_LIMIT = 3;
      var lastAppliedLiveTickRevision = 0;
      var lastAppliedChartDataPaintRevision = 0;
      var lastAppliedChartDataPaintToken = '';
      // Keep the last 16 successfully painted symbol/timeframe datasets in this
      // WebView. Revisiting one can display it immediately while fresh history
      // loads in the background. Remounting the WebView starts with an empty cache.
      var CHART_CONTEXT_SNAPSHOT_CACHE_CAPACITY = 16;
      var cachedChartContextSnapshots = Object.create(null);
      var cachedChartContextLru = [];
      // Full-series replacements can arrive while a visual-shell rebuild has
      // temporarily removed the Lightweight Charts series. Keep only the
      // newest replacement and replay it after the current init completes.
      var pendingChartDataReplacement = null;
      var chartInitRequestGeneration = 0;
      var currentSeriesLength = 0;
      var areaRecentVisibleBarTarget = ${CHART_AREA_VISIBLE_BAR_MAX};
      var lastDisplayDecimals = 2;
      var lastRawSeriesData = [];
      var shouldShowLowerPane = true;
      var lastInitHostOptions = null;
      var lastInitChartType = 'candles';
      var lastInitShowLowerPane = true;
      var lastInitSignature = '';
      var lastInitConfigSig = '';
      var lastInitDataContextSig = '';
      // Unlike lastInitDataContextSig (the latest requested bridge identity),
      // this advances only after a chart instance has actually been rebuilt.
      // Comparing against the applied identity keeps an old symbol's numeric
      // price window from leaking into a newer init request.
      var appliedChartDataContextSig = '';
      var lastRequestedDisplayDecimals = 2;
      var lastLivePrice = null;
      var lastBidPrice = null;
      var lastAskPrice = null;
      var candleCountdownTimeframe = null;
      var candleCountdownRequestedContextSig = '';
      var candleCountdownSeriesContextSig = '';
      var candleCountdownActive = false;
      var candleCountdownTimer = null;
      var CANDLE_COUNTDOWN_FIXED_SECONDS = ${JSON.stringify(CHART_CANDLE_COUNTDOWN_FIXED_SECONDS)};
      // Price-movement histogram shown below the candles. Bar height equals
      // |close − open| for that bar (the magnitude of the candle's move),
      // coloured green when the candle closed up, red when it closed down.
      // It IS NOT traded volume — it's a direct visual echo of the candle's
      // own size, so the bar grows and shrinks in sync with the candle.
      var moveBarsSeries = null;
      var moveUpColor = 'rgba(38,166,154,0.85)';
      var moveDownColor = 'rgba(239,83,80,0.85)';
      // Captured from the active candle series so the bid line + last-price
      // line can tint themselves to match the live candle's direction.
      var barUpColor = '#2962FF';
      var barDownColor = '#ef5350';
      // Area colour represents the performance of the selected chart period,
      // not the direction of only the forming candle. Native owns the selected
      // range (including the Quotes daily move for Auto/1 Day) and sends only a
      // direction override, so recolouring never rebuilds the retained chart.
      var areaNeutralColor = '#10B981';
      var areaDirectionBaselinePrice = null;
      var areaDirectionDataContextSig = '';
      var areaDirectionOverride = null;
      var areaDirectionOverrideRangeKey = 'auto';
      var areaDirectionOverrideDataContextSig = '';
      var lastAreaDirection = 'unknown';
      var detachChartTapListeners = null;
      var lastPostedChartTap = { x: NaN, y: NaN, at: 0 };
      var chartWindowSplitMode = false;
      var chartWindowSplitModeRevision = 0;
      var pendingPointerTap = null;
      var suppressChartTapUntil = 0;
      var lastPriceLineDirection = null; // 'up' | 'down' — last colour applied
      var overlayRefreshRaf = 0;
      var marketPriceScaleDomRefreshRaf = 0;
      var marketPriceScaleDomRefreshFallbackHandle = 0;
      var marketPriceScaleDomPending = false;
      var MARKET_PRICE_SCALE_DOM_FALLBACK_MS = 64;
      var overlayPriceScaleLockRaf = 0;
      var overlayPriceScaleLockForceAutoScale = false;
      var pendingHorizontalOverlayApply = false;
      var pendingVerticalOverlayApply = false;
      var verticalGestureDomWorkPending = false;
      var priceScaleHealthRaf = 0;
      var rightPriceScaleLayoutRecoveryRaf = 0;
      var chartPaneBackgroundLayer = null;
      var rightPriceScaleFallbackLayer = null;
      var rightPriceScaleFallbackBackgroundNode = null;
      var rightPriceScaleFallbackLabelNodes = [];
      var syntheticRightPriceScaleFallbackRange = null;
      var rightPriceScaleFallbackRaf = 0;
      var gestureRightPriceScaleFallbackTimer = null;
      var gestureRightPriceScaleFallbackFrame = 0;
      var lastGestureRightPriceScaleFallbackAt = 0;
      var chartReadyPostGeneration = 0;
      var lastChartBackgroundColor = '#FFFFFF';
      var lastChartAxisBackgroundColor = '#FFFFFF';
      var lastChartTextColor = '#131722';
      var activeScrollPriceScaleRaf = 0;
      var lastActiveScrollPriceScaleCheckAt = 0;
      var activeHorizontalScrollGesture = false;
      var horizontalScrollMotionActive = false;
      var activeHorizontalScrollGestureUntil = 0;
      var visibleRangeIdleTimer = null;
      var visibleRangeIdlePendingAfterGesture = false;
      // Trade-marker position-only refresh (style.top writes on existing DOM
      // nodes). Runs on every visible-range change, including active gesture
      // frames, so open-trade markers never drift off their real price.
      var tradeOverlayRepositionRaf = 0;
      // Last time any gesture-deferral bookkeeping ran. The overlay resync
      // watchdog uses this to detect stranded gesture flags (missed
      // pointerup/pointercancel) that would otherwise freeze overlay DOM
      // work forever.
      var lastOverlayGestureDeferralActivityAt = 0;
      var OVERLAY_GESTURE_DEFERRAL_STALL_MS = 3000;
      var liveRightEdgeClampActive = false;
      var lastHistoryPaginationPostAt = 0;
      var movingVerticalGridRaf = 0;
      var movingVerticalGridTransformOnlyPending = false;
      var movingVerticalGridColor = 'transparent';
      var movingVerticalGridVisible = false;
      var movingGridVerticalLines = [];
      var movingGridHorizontalLines = [];
      var movingGridVerticalGroup = null;
      var movingGridHorizontalGroup = null;
      var movingGridLayerSignature = '';
      var movingGridVerticalSignature = '';
      var movingGridHorizontalSignature = '';
      var periodSeparatorsRaf = 0;
      var periodSeparatorsVisible = true;
      var periodSeparatorColor = 'rgba(120, 120, 120, 0.45)';
      var periodSeparatorWidth = 1;
      var periodSeparatorDashPattern = '1 5';
      var periodSeparatorData = [];
      var periodSeparatorLines = [];
      var periodSeparatorGroup = null;
      var periodSeparatorMotionAnchorCoordinate = null;
      var periodSeparatorsTransformOnlyPending = false;
      var periodSeparatorSignature = '';
      var chartAxisDividerRaf = 0;
      var chartAxisDividerColor = 'transparent';
      var chartAxisDividerVisible = false;
      var chartAxisDividerSignature = '';
      var MOVING_GRID_HORIZONTAL_LINE_COUNT = ${CHART_GRID_HORIZONTAL_LINE_COUNT};
      var MOVING_GRID_FIRST_INTERIOR_HORIZONTAL_OFFSET = ${CHART_GRID_FIRST_INTERIOR_HORIZONTAL_OFFSET};
      var MOVING_GRID_HORIZONTAL_SPACING = ${CHART_GRID_HORIZONTAL_SPACING};
      var MOVING_GRID_STROKE_WIDTH = ${CHART_GRID_STROKE_WIDTH};
      var MOVING_VERTICAL_GRID_SPACING = ${CHART_GRID_VERTICAL_SPACING};
      var MOVING_VERTICAL_GRID_DASH_PATTERN = '${CHART_GRID_DASH_PATTERN}';
      var AXIS_DIVIDER_STROKE_WIDTH = ${CHART_AXIS_DIVIDER_STROKE_WIDTH};
      var manualPriceScaleRangeActive = false;
      var verticalPricePanGestureActive = false;
      // Set by the gesture layer; lets module-level resets (auto-scale toggle,
      // series replacement, manual-range clears) stop an in-flight kinetic
      // vertical glide.
      var stopVerticalPanGlideHook = null;
      var chartScaleGestureActive = false;
      var verticalScrollingLocked = false;
      var chartAutoScaleEnabled = false;
      var manualVerticalPanRangeActive = false;
      var manualVerticalPanLockedRange = null;
      var manualPriceScaleReferenceSpan = null;
      var manualVerticalPanPreserveUntil = 0;
      var freshSeriesVerticalCenterRaf = 0;
      var freshSeriesVerticalCenterActive = false;
      var freshSeriesCenteredPriceRange = null;
      var overlayVisibleCandleScaleRecoveryRaf = 0;
      var MANUAL_VERTICAL_PAN_PRESERVE_MS = 900;
      var chartTouchInteractionSuspendDepth = 0;
      var lastPostedChartTouchActive = false;
      var OVERLAY_LABEL_LINE_HEIGHT = 12;
      var OVERLAY_LABEL_HEIGHT = 18;
      var OVERLAY_LABEL_GAP = 4;
      var OVERLAY_LABEL_LINE_GAP = 0;
      var OVERLAY_POSITION_BOX_HEIGHT = 18;
      var OVERLAY_ANCHORED_LABEL_LEFT = 8;
      var OVERLAY_ANCHORED_LABEL_LANE_WIDTH = 164;
      var OVERLAY_ANCHORED_LABEL_RIGHT_PADDING = 16;
      var OVERLAY_OPEN_POSITION_LABEL_MAX_LEFT = 56;
      var OVERLAY_OPEN_POSITION_LABEL_LEFT_RATIO = 0.12;
      var MARKET_PRICE_SCALE_EXTENSION_HEIGHT = 1;
      var MARKET_PRICE_SCALE_BADGE_HEIGHT = 22;
      var MARKET_LIVE_PRICE_BADGE_PRICE_ROW_HEIGHT = 18;
      var MARKET_LIVE_PRICE_BADGE_COUNTDOWN_ROW_HEIGHT = 14;
      var MARKET_LIVE_PRICE_BADGE_HEIGHT =
        MARKET_LIVE_PRICE_BADGE_PRICE_ROW_HEIGHT + MARKET_LIVE_PRICE_BADGE_COUNTDOWN_ROW_HEIGHT;
      var MARKET_PRICE_SCALE_BADGE_MIN_WIDTH = 56;
      var MARKET_PRICE_SCALE_BADGE_PADDING_X = 4;
      var MARKET_PRICE_SCALE_BADGE_GAP = 1;
      var MARKET_PRICE_BADGE_RECOVERY_BUFFER_RATIO = 0.035;
      var RIGHT_PRICE_SCALE_FALLBACK_LABEL_HEIGHT = ${CHART_PRICE_SCALE_LABEL_HEIGHT};
      var RIGHT_PRICE_SCALE_FALLBACK_LABEL_FONT_SIZE = ${CHART_PRICE_SCALE_LABEL_FONT_SIZE};
      var RIGHT_PRICE_SCALE_FALLBACK_LABEL_FONT_WEIGHT = '${CHART_PRICE_SCALE_LABEL_FONT_WEIGHT}';
      var RIGHT_PRICE_SCALE_FALLBACK_LABEL_OPACITY = '1';
      var RIGHT_PRICE_SCALE_FALLBACK_DARK_LABEL_COLOR = '#E2E8F0';
      var RIGHT_PRICE_SCALE_FALLBACK_LIGHT_LABEL_COLOR = '#0F172A';
      var RIGHT_PRICE_SCALE_FALLBACK_MIN_LABELS = 7;
      var RIGHT_PRICE_SCALE_FALLBACK_MAX_LABELS = 30;
      var GESTURE_RIGHT_PRICE_SCALE_REFRESH_INTERVAL_MS = 16;
      var MT5_PRICE_SCALE_OCTAVES_PER_PLOT = ${MT5_PRICE_SCALE_OCTAVES_PER_PLOT};
      var MT5_PRICE_SCALE_BOUND_OCTAVES = ${MT5_PRICE_SCALE_BOUND_OCTAVES};
      var MT5_PRICE_SCALE_MAX_DRAG_OCTAVES = ${MT5_PRICE_SCALE_MAX_DRAG_OCTAVES};
      var MT5_PRICE_SCALE_MIN_VISIBLE_TICK_INTERVALS = ${MT5_PRICE_SCALE_MIN_VISIBLE_TICK_INTERVALS};
      ${MT5_PRICE_SCALE_GESTURE_WEBVIEW_JS}
      // Keep the normal price scale at the requested dense 30px cadence.
      // Dragging the right axis still zooms down to one configured symbol
      // precision unit between adjacent rows (for example 4000.01, 4000.02).
      var RIGHT_PRICE_SCALE_FALLBACK_TARGET_LABEL_GAP_PX = 30;
      var RIGHT_PRICE_SCALE_FALLBACK_NICE_FRACTIONS = [1, 2, 2.5, 5, 10];
      var RIGHT_PRICE_SCALE_CANVAS_LABEL_MIN_CLUSTERS = 2;
      var RIGHT_PRICE_SCALE_CANVAS_LABEL_MIN_FOREGROUND_PIXELS = 24;
      var CHART_DEBUG_LOGS = false;
      var PRICE_SCALE_HEALTH_SPAN_MULTIPLE = 30;
      var PRICE_SCALE_CANDLE_COMPRESSION_SPAN_MULTIPLE = 6;
      var PRICE_SCALE_HEALTH_MIN_DATA_OVERLAP_RATIO = 0.2;
      var PRICE_SCALE_HEALTH_MIN_VISIBLE_PIXEL_SPAN = 28;
      var PRICE_SCALE_HEALTH_MIN_VISIBLE_PIXEL_RATIO = 0.16;
      var PRICE_SCALE_ROBUST_CLUSTER_MIN_BARS = 4;
      var PRICE_SCALE_ROBUST_CLUSTER_KEEP_RATIO = 0.55;
      var PRICE_SCALE_ROBUST_CLUSTER_RELATIVE_TOLERANCE = 0.006;
      var PRICE_SCALE_ROBUST_CLUSTER_SPAN_MULTIPLE = 5;
      var PRICE_SCALE_ROBUST_MARKET_CLUSTER_MIN_BARS = 1;
      var PRICE_SCALE_ROBUST_MARKET_CLUSTER_RELATIVE_TOLERANCE = 0.006;
      var PRICE_SCALE_ROBUST_MARKET_CLUSTER_SPAN_MULTIPLE = 3;
      var PRICE_SCALE_ROBUST_TRIM_MIN_VALUES = 12;
      var PRICE_SCALE_ROBUST_TRIM_RATIO = 0.08;
      var PRICE_SCALE_ROBUST_TRIM_SPAN_MULTIPLE = 5;
      var FRESH_SERIES_VERTICAL_CENTER_PADDING_RATIO = 0.12;
      var FRESH_SERIES_ANCHOR_EDGE_MARGIN_RATIO = 0.12;
      var RIGHT_PRICE_SCALE_LAYOUT_RECOVERY_MAX_ATTEMPTS = 6;
      var ACTIVE_SCROLL_PRICE_SCALE_CHECK_INTERVAL_MS = 48;
      var ACTIVE_SCROLL_PRICE_SCALE_SPAN_MULTIPLE = 8;
      var ACTIVE_SCROLL_PRICE_SCALE_GESTURE_GRACE_MS = 160;
      var HISTORY_PAGINATION_MIN_LEFT_BARS = 50;
      var HISTORY_PAGINATION_MAX_LEFT_BARS = 500;
      var HISTORY_PAGINATION_VIEWPORT_MULTIPLIER = 3;
      var HISTORY_PAGINATION_DEBOUNCE_MS = 800;

      function chartDebugLog() {
        if (!CHART_DEBUG_LOGS || typeof console === 'undefined' || typeof console.log !== 'function') {
          return;
        }
        try {
          console.log.apply(console, arguments);
        } catch (_e) {}
      }

      function getRightPriceScaleApi() {
        return chart && typeof chart.priceScale === 'function'
          ? chart.priceScale('right')
          : null;
      }

      function resolvePrimaryPaneMetrics() {
        var chartElement = document.getElementById('chart');
        var paneSize = chart && typeof chart.paneSize === 'function' ? chart.paneSize(0) : null;
        var timeScaleApi =
          chart && typeof chart.timeScale === 'function'
            ? chart.timeScale()
            : null;
        var rightPriceScaleApi = getRightPriceScaleApi();
        var leftPriceScaleApi =
          chart && typeof chart.priceScale === 'function'
            ? chart.priceScale('left')
            : null;
        var rightAxisWidth =
          rightPriceScaleApi && typeof rightPriceScaleApi.width === 'function'
            ? rightPriceScaleApi.width()
            : 0;
        var leftAxisWidth =
          leftPriceScaleApi && typeof leftPriceScaleApi.width === 'function'
            ? leftPriceScaleApi.width()
            : 0;
        var timeScaleHeight =
          timeScaleApi && typeof timeScaleApi.height === 'function'
            ? timeScaleApi.height()
            : 0;
        var paneWidth =
          paneSize && typeof paneSize.width === 'number' && isFinite(paneSize.width) && paneSize.width > 0
            ? paneSize.width
            : Math.max(
                0,
                (chartElement && chartElement.clientWidth ? chartElement.clientWidth : 0) - leftAxisWidth - rightAxisWidth
              );
        var paneHeight =
          paneSize && typeof paneSize.height === 'number' && isFinite(paneSize.height) && paneSize.height > 0
            ? paneSize.height
            : Math.max(
                0,
                (chartElement && chartElement.clientHeight ? chartElement.clientHeight : 0) - timeScaleHeight
              );
        var priceScaleOptions =
          rightPriceScaleApi && typeof rightPriceScaleApi.options === 'function'
            ? rightPriceScaleApi.options()
            : null;
        var scaleMargins = priceScaleOptions && priceScaleOptions.scaleMargins
          ? priceScaleOptions.scaleMargins
          : null;
        var topMargin = scaleMargins && typeof scaleMargins.top === 'number' && isFinite(scaleMargins.top)
          ? Math.max(0, Math.min(0.95, scaleMargins.top))
          : 0;
        var bottomMargin = scaleMargins && typeof scaleMargins.bottom === 'number' && isFinite(scaleMargins.bottom)
          ? Math.max(0, Math.min(0.95, scaleMargins.bottom))
          : 0;
        var plotTop = Math.max(0, Math.round(paneHeight * topMargin));
        var plotBottom = Math.max(plotTop + 1, Math.round(paneHeight * (1 - bottomMargin)));

        return {
          chartWidth: chartElement && chartElement.clientWidth ? chartElement.clientWidth : leftAxisWidth + paneWidth + rightAxisWidth,
          chartHeight: chartElement && chartElement.clientHeight ? chartElement.clientHeight : paneHeight + timeScaleHeight,
          leftAxisWidth: leftAxisWidth,
          rightAxisWidth: rightAxisWidth,
          paneWidth: paneWidth,
          paneHeight: paneHeight,
          plotTop: plotTop,
          plotHeight: Math.max(0, plotBottom - plotTop),
        };
      }

      // The right price-scale labels fill the FULL pane height (candles plus
      // the move/volume overlay region at the bottom), not just the candle
      // plot area (top ~66%). The primary metrics reserve the bottom 0.34 as
      // scaleMargin for the move bars, which would stop the symbol price labels
      // partway down and let the native scale leak a second, mismatched column.
      // Overriding plotTop/plotHeight to the whole pane makes the fallback emit
      // one continuous symbol price scale top-to-bottom.
      function resolveFallbackPlotMetrics() {
        var metrics = resolvePrimaryPaneMetrics();
        var fullHeight = Math.max(0, Math.round(metrics.paneHeight || metrics.plotHeight || 0));
        return Object.assign({}, metrics, {
          plotTop: 0,
          plotHeight: fullHeight,
        });
      }

      function resolveChartElementSize() {
        var chartElement = document.getElementById('chart');
        if (!chartElement) {
          return { width: 0, height: 0 };
        }
        var rect = null;
        try {
          rect = typeof chartElement.getBoundingClientRect === 'function'
            ? chartElement.getBoundingClientRect()
            : null;
        } catch (_e) {}
        var width = Math.round(
          chartElement.clientWidth ||
          (rect && typeof rect.width === 'number' ? rect.width : 0)
        );
        var height = Math.round(
          chartElement.clientHeight ||
          (rect && typeof rect.height === 'number' ? rect.height : 0)
        );
        return {
          width: isFinite(width) && width > 0 ? width : 0,
          height: isFinite(height) && height > 0 ? height : 0,
        };
      }

      function resolveChartAxisBackgroundColor(opts, fallbackColor) {
        try {
          var customColors = opts && opts.customColors ? opts.customColors : null;
          if (customColors && typeof customColors.axisBackground === 'string' && customColors.axisBackground.length > 0) {
            return customColors.axisBackground;
          }
        } catch (_e) {}
        return fallbackColor || '#FFFFFF';
      }

      function clearChartPaneBackgroundLayer() {
        if (chartPaneBackgroundLayer && chartPaneBackgroundLayer.parentNode) {
          try { chartPaneBackgroundLayer.parentNode.removeChild(chartPaneBackgroundLayer); } catch (_removeErr) {}
        }
        chartPaneBackgroundLayer = null;
      }

      function promoteChartDomAbovePaneBackground(chartElement) {
        try {
          if (!chartElement || !chartElement.children) {
            return;
          }
          for (var i = 0; i < chartElement.children.length; i += 1) {
            var child = chartElement.children[i];
            if (!child || child === chartPaneBackgroundLayer || child === rightPriceScaleFallbackLayer) {
              continue;
            }
            if (child.style) {
              if (!child.style.position || child.style.position === 'static') {
                child.style.position = 'relative';
              }
              child.style.zIndex = '1';
            }
          }
        } catch (_e) {}
      }

      function ensureChartPaneBackgroundLayer() {
        var chartElement = document.getElementById('chart');
        if (!chartElement) {
          return null;
        }
        if (chartPaneBackgroundLayer && chartPaneBackgroundLayer.parentNode === chartElement) {
          promoteChartDomAbovePaneBackground(chartElement);
          return chartPaneBackgroundLayer;
        }
        chartPaneBackgroundLayer = document.createElement('div');
        chartPaneBackgroundLayer.className = 'rtx5-chart-pane-background';
        chartPaneBackgroundLayer.setAttribute('aria-hidden', 'true');
        chartElement.style.position = 'relative';
        chartElement.insertBefore(chartPaneBackgroundLayer, chartElement.firstChild);
        promoteChartDomAbovePaneBackground(chartElement);
        return chartPaneBackgroundLayer;
      }

      function updateChartPaneBackgroundLayer() {
        try {
          // GitHub's chart layering keeps #chart transparent so the moving
          // grid SVG behind it can show through the Lightweight Charts canvas.
          // Clearing this older pane layer prevents it from covering the grid
          // and the right-axis trade price boxes.
          clearChartPaneBackgroundLayer();
          return false;
        } catch (_e) {
          return false;
        }
      }

      function applyRightPriceScaleLayoutOptions() {
        var layoutOptions = {
          visible: true,
          entireTextOnly: false,
          minimumWidth: ${CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH},
          scaleMargins: resolvePrimaryPriceScaleMargins(shouldUseMoveBarsPane()),
        };
        var priceScaleApi = getRightPriceScaleApi();
        try {
          if (chart && typeof chart.applyOptions === 'function') {
            chart.applyOptions({ rightPriceScale: layoutOptions });
          }
        } catch (_chartOptionsErr) {}
        try {
          if (priceScaleApi && typeof priceScaleApi.applyOptions === 'function') {
            priceScaleApi.applyOptions(layoutOptions);
          }
        } catch (_scaleOptionsErr) {}
        updateChartPaneBackgroundLayer();
      }

      function isCustomRightPriceScaleOverlayNode(node) {
        try {
          if (!node) {
            return false;
          }
          if (
            (_overlayLabelLayer && typeof _overlayLabelLayer.contains === 'function' && _overlayLabelLayer.contains(node)) ||
            (rightPriceScaleFallbackLayer && typeof rightPriceScaleFallbackLayer.contains === 'function' && rightPriceScaleFallbackLayer.contains(node))
          ) {
            return true;
          }
          if (typeof node.closest !== 'function') {
            return false;
          }
          return Boolean(
            node.closest('.rtx5-overlay-label-layer') ||
            node.closest('.rtx5-position-price-scale-box') ||
            node.closest('.rtx5-market-price-scale-extension') ||
            node.closest('.rtx5-market-price-scale-badge') ||
            node.closest('.rtx5-right-price-scale-fallback')
          );
        } catch (_e) {
          return false;
        }
      }

      function getRightPriceScaleNativeDomLabelStatus(metrics) {
        var emptyStatus = {
          labelCount: 0,
          collapsedCount: 0,
          healthyCount: 0,
        };
        try {
          var chartElement = document.getElementById('chart');
          if (!chartElement || typeof chartElement.querySelectorAll !== 'function') {
            return emptyStatus;
          }
          var chartRect = typeof chartElement.getBoundingClientRect === 'function'
            ? chartElement.getBoundingClientRect()
            : null;
          if (!chartRect || !(chartRect.width > 0) || !(chartRect.height > 0)) {
            return emptyStatus;
          }
          var axisLeft = chartRect.left + Math.round((metrics.leftAxisWidth || 0) + (metrics.paneWidth || 0));
          var axisRight = Math.min(
            chartRect.right,
            axisLeft + Math.max(0, Math.round(metrics.rightAxisWidth || 0))
          );
          var plotTop = chartRect.top + Math.max(0, Math.round(metrics.plotTop || 0));
          var plotBottom = plotTop + Math.max(0, Math.round(metrics.plotHeight || metrics.paneHeight || 0));
          var nodes = chartElement.querySelectorAll('span, div');
          var labelCount = 0;
          var collapsedCount = 0;
          var healthyCount = 0;
          for (var i = 0; i < nodes.length; i += 1) {
            var node = nodes[i];
            if (node === chartElement || isCustomRightPriceScaleOverlayNode(node)) {
              continue;
            }
            var text = node && typeof node.textContent === 'string' ? node.textContent.trim() : '';
            if (!/^[\\u2212-]?\\d+(?:\\.\\d+)?$/.test(text) && !/^[\\u2212-]?\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?$/.test(text)) {
              continue;
            }
            var rect = typeof node.getBoundingClientRect === 'function'
              ? node.getBoundingClientRect()
              : null;
            if (!rect || rect.right < axisLeft - 3 || rect.left > axisRight + 3) {
              continue;
            }
            labelCount += 1;
            if (
              rect.width < 1 ||
              rect.height < 1 ||
              rect.bottom <= plotTop + 2 ||
              rect.top >= plotBottom - 2 ||
              rect.bottom <= chartRect.top + 2 ||
              rect.top <= chartRect.top + 2
            ) {
              collapsedCount += 1;
            } else {
              healthyCount += 1;
            }
          }
          return {
            labelCount: labelCount,
            collapsedCount: collapsedCount,
            healthyCount: healthyCount,
          };
        } catch (_e) {
          return emptyStatus;
        }
      }

      function hasCollapsedRightPriceScaleDomLabels(metrics) {
        var nativeLabelStatus = getRightPriceScaleNativeDomLabelStatus(metrics);
        return nativeLabelStatus.labelCount >= 2 &&
          nativeLabelStatus.healthyCount === 0 &&
          nativeLabelStatus.collapsedCount >= nativeLabelStatus.labelCount;
      }

      function isRightPriceScaleNativeDomLabelStatusHealthy(nativeLabelStatus) {
        return Boolean(
          nativeLabelStatus &&
          nativeLabelStatus.healthyCount >= 2 &&
          nativeLabelStatus.healthyCount >= Math.min(nativeLabelStatus.labelCount, 2)
        );
      }

      function parseCanvasRgbColor(color) {
        if (typeof color !== 'string' || color.length === 0) {
          return null;
        }
        var normalized = color.toLowerCase().split(' ').join('');
        try {
          if (normalized.charAt(0) === '#') {
            var hex = normalized.slice(1);
            if (hex.length === 3) {
              hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2);
            }
            if (hex.length !== 6) {
              return null;
            }
            var r = parseInt(hex.slice(0, 2), 16);
            var g = parseInt(hex.slice(2, 4), 16);
            var b = parseInt(hex.slice(4, 6), 16);
            return isFinite(r) && isFinite(g) && isFinite(b) ? { r: r, g: g, b: b } : null;
          }
          var rgbMatch = normalized.match(/^rgba?\\((\\d+),(\\d+),(\\d+)(?:,[^)]+)?\\)$/);
          if (rgbMatch) {
            return {
              r: Math.max(0, Math.min(255, Number(rgbMatch[1]))),
              g: Math.max(0, Math.min(255, Number(rgbMatch[2]))),
              b: Math.max(0, Math.min(255, Number(rgbMatch[3]))),
            };
          }
        } catch (_e) {}
        return null;
      }

      function getCanvasPerceivedBrightness(rgb) {
        if (!rgb) {
          return null;
        }
        return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
      }

      function resolveReadableRightPriceScaleFallbackTextColor(textColor) {
        var axisBrightness = getCanvasPerceivedBrightness(
          parseCanvasRgbColor(lastChartAxisBackgroundColor || lastChartBackgroundColor || '#FFFFFF')
        );
        var textBrightness = getCanvasPerceivedBrightness(parseCanvasRgbColor(textColor));
        if (
          axisBrightness !== null &&
          axisBrightness < 80 &&
          (textBrightness === null || textBrightness < 190)
        ) {
          return RIGHT_PRICE_SCALE_FALLBACK_DARK_LABEL_COLOR;
        }
        if (
          axisBrightness !== null &&
          axisBrightness > 175 &&
          (textBrightness === null || textBrightness > 110)
        ) {
          return RIGHT_PRICE_SCALE_FALLBACK_LIGHT_LABEL_COLOR;
        }
        return textColor;
      }

      function getCanvasColorDistance(left, right) {
        if (!left || !right) {
          return Number.POSITIVE_INFINITY;
        }
        var dr = left.r - right.r;
        var dg = left.g - right.g;
        var db = left.b - right.b;
        return Math.sqrt(dr * dr + dg * dg + db * db);
      }

      function getCanvasColorLuma(color) {
        if (!color) {
          return 0;
        }
        return color.r * 0.299 + color.g * 0.587 + color.b * 0.114;
      }

      function isRightPriceScaleCanvasPixelForegroundLike(r, g, b, a, textRgb, backgroundRgb) {
        if (!(a > 20)) {
          return false;
        }
        var pixelRgb = { r: r, g: g, b: b };
        if (backgroundRgb && getCanvasColorDistance(pixelRgb, backgroundRgb) < 30) {
          return false;
        }
        if (textRgb && getCanvasColorDistance(pixelRgb, textRgb) < 145) {
          return true;
        }
        var pixelLuma = getCanvasColorLuma(pixelRgb);
        if (backgroundRgb) {
          return Math.abs(pixelLuma - getCanvasColorLuma(backgroundRgb)) > 45;
        }
        return pixelLuma < 115 || pixelLuma > 170;
      }

      function getRightPriceScaleNativeCanvasLabelStatus(metrics) {
        var emptyStatus = {
          sampled: false,
          canvasCount: 0,
          foregroundPixelCount: 0,
          clusterCount: 0,
          healthy: false,
        };
        try {
          var resolvedMetrics = metrics || resolvePrimaryPaneMetrics();
          var chartElement = document.getElementById('chart');
          if (!chartElement || typeof chartElement.querySelectorAll !== 'function' || !resolvedMetrics) {
            return emptyStatus;
          }
          var chartRect = typeof chartElement.getBoundingClientRect === 'function'
            ? chartElement.getBoundingClientRect()
            : null;
          if (!chartRect || !(chartRect.width > 0) || !(chartRect.height > 0)) {
            return emptyStatus;
          }
          var axisWidth = Math.max(0, Math.round(resolvedMetrics.rightAxisWidth || 0));
          var axisLeft = chartRect.left + Math.round((resolvedMetrics.leftAxisWidth || 0) + (resolvedMetrics.paneWidth || 0));
          var axisRight = Math.min(chartRect.right, axisLeft + axisWidth);
          var plotTop = chartRect.top + Math.max(0, Math.round(resolvedMetrics.plotTop || 0));
          var plotBottom = Math.min(
            chartRect.bottom,
            plotTop + Math.max(0, Math.round(resolvedMetrics.plotHeight || resolvedMetrics.paneHeight || 0))
          );
          if (!(axisWidth > 0) || !(axisRight - axisLeft > 8) || !(plotBottom - plotTop > 16)) {
            return emptyStatus;
          }

          var canvases = chartElement.querySelectorAll('canvas');
          var textRgb = parseCanvasRgbColor(resolveRightPriceScaleFallbackTextColor());
          var backgroundRgb = parseCanvasRgbColor(lastChartAxisBackgroundColor || lastChartBackgroundColor || '#FFFFFF');
          var sampled = false;
          var canvasCount = 0;
          var totalForegroundPixelCount = 0;
          var bestClusterCount = 0;

          for (var canvasIndex = 0; canvasIndex < canvases.length; canvasIndex += 1) {
            var canvas = canvases[canvasIndex];
            if (!canvas || isCustomRightPriceScaleOverlayNode(canvas)) {
              continue;
            }
            var canvasRect = typeof canvas.getBoundingClientRect === 'function'
              ? canvas.getBoundingClientRect()
              : null;
            if (!canvasRect || !(canvasRect.width > 0) || !(canvasRect.height > 0)) {
              continue;
            }
            var cssLeft = Math.max(axisLeft, canvasRect.left);
            var cssRight = Math.min(axisRight, canvasRect.right);
            var cssTop = Math.max(plotTop, canvasRect.top);
            var cssBottom = Math.min(plotBottom, canvasRect.bottom);
            if (!(cssRight - cssLeft > 8) || !(cssBottom - cssTop > 16)) {
              continue;
            }
            var scaleX = canvas.width / canvasRect.width;
            var scaleY = canvas.height / canvasRect.height;
            if (!(scaleX > 0) || !(scaleY > 0)) {
              continue;
            }
            var sampleX = Math.max(0, Math.floor((cssLeft - canvasRect.left) * scaleX));
            var sampleY = Math.max(0, Math.floor((cssTop - canvasRect.top) * scaleY));
            var sampleW = Math.min(canvas.width - sampleX, Math.ceil((cssRight - cssLeft) * scaleX));
            var sampleH = Math.min(canvas.height - sampleY, Math.ceil((cssBottom - cssTop) * scaleY));
            if (!(sampleW > 8) || !(sampleH > 16)) {
              continue;
            }
            var context = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
            if (!context || typeof context.getImageData !== 'function') {
              continue;
            }
            var imageData = null;
            try {
              imageData = context.getImageData(sampleX, sampleY, sampleW, sampleH);
            } catch (_imageErr) {
              continue;
            }
            if (!imageData || !imageData.data) {
              continue;
            }

            sampled = true;
            canvasCount += 1;
            var data = imageData.data;
            var step = Math.max(1, Math.floor(Math.max(sampleW, sampleH) / 700));
            var minRowForegroundPixels = Math.max(2, Math.floor(sampleW / (step * 22)));
            var minClusterRows = 2;
            var minClusterWidth = Math.max(5, Math.floor(sampleW * 0.08));
            var maxClusterWidth = Math.max(minClusterWidth + 1, Math.floor(sampleW * 0.94));
            var foregroundPixelCount = 0;
            var clusterCount = 0;
            var clusterRows = 0;
            var clusterMinCol = sampleW;
            var clusterMaxCol = 0;
            var clusterMaxRowCount = 0;
            var finishCluster = function() {
              if (clusterRows > 0) {
                var clusterWidth = clusterMaxCol - clusterMinCol + 1;
                if (
                  clusterRows >= minClusterRows &&
                  clusterWidth >= minClusterWidth &&
                  clusterWidth <= maxClusterWidth &&
                  clusterMaxRowCount >= minRowForegroundPixels
                ) {
                  clusterCount += 1;
                }
              }
              clusterRows = 0;
              clusterMinCol = sampleW;
              clusterMaxCol = 0;
              clusterMaxRowCount = 0;
            };

            for (var y = 0; y < sampleH; y += step) {
              var rowForegroundCount = 0;
              var rowMinCol = sampleW;
              var rowMaxCol = 0;
              for (var x = 0; x < sampleW; x += step) {
                var pixelIndex = ((y * sampleW) + x) * 4;
                if (
                  isRightPriceScaleCanvasPixelForegroundLike(
                    data[pixelIndex],
                    data[pixelIndex + 1],
                    data[pixelIndex + 2],
                    data[pixelIndex + 3],
                    textRgb,
                    backgroundRgb
                  )
                ) {
                  rowForegroundCount += 1;
                  foregroundPixelCount += 1;
                  if (x < rowMinCol) rowMinCol = x;
                  if (x > rowMaxCol) rowMaxCol = x;
                }
              }
              if (rowForegroundCount >= minRowForegroundPixels) {
                clusterRows += 1;
                clusterMinCol = Math.min(clusterMinCol, rowMinCol);
                clusterMaxCol = Math.max(clusterMaxCol, rowMaxCol);
                clusterMaxRowCount = Math.max(clusterMaxRowCount, rowForegroundCount);
              } else {
                finishCluster();
              }
            }
            finishCluster();

            totalForegroundPixelCount += foregroundPixelCount;
            bestClusterCount = Math.max(bestClusterCount, clusterCount);
            if (
              clusterCount >= RIGHT_PRICE_SCALE_CANVAS_LABEL_MIN_CLUSTERS &&
              foregroundPixelCount >= RIGHT_PRICE_SCALE_CANVAS_LABEL_MIN_FOREGROUND_PIXELS
            ) {
              return {
                sampled: true,
                canvasCount: canvasCount,
                foregroundPixelCount: totalForegroundPixelCount,
                clusterCount: clusterCount,
                healthy: true,
              };
            }
          }

          return {
            sampled: sampled,
            canvasCount: canvasCount,
            foregroundPixelCount: totalForegroundPixelCount,
            clusterCount: bestClusterCount,
            healthy: false,
          };
        } catch (_e) {
          return emptyStatus;
        }
      }

      function isRightPriceScaleNativeCanvasLabelStatusHealthy(nativeCanvasStatus) {
        return Boolean(
          nativeCanvasStatus &&
          nativeCanvasStatus.sampled === true &&
          nativeCanvasStatus.healthy === true &&
          nativeCanvasStatus.clusterCount >= RIGHT_PRICE_SCALE_CANVAS_LABEL_MIN_CLUSTERS &&
          nativeCanvasStatus.foregroundPixelCount >= RIGHT_PRICE_SCALE_CANVAS_LABEL_MIN_FOREGROUND_PIXELS
        );
      }

      function hasHealthyRightPriceScaleNativeCanvasLabels(metrics) {
        var nativeCanvasStatus = getRightPriceScaleNativeCanvasLabelStatus(metrics || resolvePrimaryPaneMetrics());
        return isRightPriceScaleNativeCanvasLabelStatusHealthy(nativeCanvasStatus);
      }

      function getRightPriceScaleNativeLabelHealth(metrics) {
        var resolvedMetrics = metrics || resolvePrimaryPaneMetrics();
        var nativeLabelStatus = getRightPriceScaleNativeDomLabelStatus(resolvedMetrics);
        if (isRightPriceScaleNativeDomLabelStatusHealthy(nativeLabelStatus)) {
          return {
            healthy: true,
            source: 'dom',
            domStatus: nativeLabelStatus,
            canvasStatus: null,
          };
        }
        var nativeCanvasStatus = getRightPriceScaleNativeCanvasLabelStatus(resolvedMetrics);
        if (isRightPriceScaleNativeCanvasLabelStatusHealthy(nativeCanvasStatus)) {
          return {
            healthy: true,
            source: 'canvas',
            domStatus: nativeLabelStatus,
            canvasStatus: nativeCanvasStatus,
          };
        }
        return {
          healthy: false,
          source: 'missing',
          domStatus: nativeLabelStatus,
          canvasStatus: nativeCanvasStatus,
        };
      }

      function hasHealthyRightPriceScaleNativeDomLabels(metrics) {
        var nativeLabelStatus = getRightPriceScaleNativeDomLabelStatus(metrics || resolvePrimaryPaneMetrics());
        return isRightPriceScaleNativeDomLabelStatusHealthy(nativeLabelStatus);
      }

      function hasHealthyRightPriceScaleNativeLabels(metrics) {
        return getRightPriceScaleNativeLabelHealth(metrics || resolvePrimaryPaneMetrics()).healthy === true;
      }

      function isRightPriceScaleLayoutHealthy() {
        if (!chart) {
          return false;
        }
        var metrics = resolvePrimaryPaneMetrics();
        if (
          !metrics ||
          !(metrics.chartWidth > 0) ||
          !(metrics.chartHeight > 0) ||
          !(metrics.paneWidth > 0) ||
          !(metrics.paneHeight > 0) ||
          metrics.rightAxisWidth < ${CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH} - 2
        ) {
          return false;
        }
        if (metrics.leftAxisWidth + metrics.paneWidth + metrics.rightAxisWidth > metrics.chartWidth + 2) {
          return false;
        }
        var priceScaleApi = getRightPriceScaleApi();
        var priceScaleOptions =
          priceScaleApi && typeof priceScaleApi.options === 'function'
            ? priceScaleApi.options()
            : null;
        if (priceScaleOptions && priceScaleOptions.visible === false) {
          return false;
        }
        if (priceScaleOptions && priceScaleOptions.entireTextOnly === true) {
          return false;
        }
        return true;
      }

      function clearRightPriceScaleFallbackLabels() {
        if (!rightPriceScaleFallbackLayer) {
          return;
        }
        try { rightPriceScaleFallbackLayer.style.display = 'none'; } catch (_styleErr) {}
        while (rightPriceScaleFallbackLayer.firstChild) {
          rightPriceScaleFallbackLayer.removeChild(rightPriceScaleFallbackLayer.firstChild);
        }
        rightPriceScaleFallbackBackgroundNode = null;
        rightPriceScaleFallbackLabelNodes = [];
      }

      function clearRightPriceScaleFallbackLayer() {
        if (rightPriceScaleFallbackRaf) {
          try { cancelAnimationFrame(rightPriceScaleFallbackRaf); } catch (_e) {}
          rightPriceScaleFallbackRaf = 0;
        }
        if (rightPriceScaleFallbackLayer && rightPriceScaleFallbackLayer.parentNode) {
          try { rightPriceScaleFallbackLayer.parentNode.removeChild(rightPriceScaleFallbackLayer); } catch (_removeErr) {}
        }
        rightPriceScaleFallbackLayer = null;
        rightPriceScaleFallbackBackgroundNode = null;
        rightPriceScaleFallbackLabelNodes = [];
        syntheticRightPriceScaleFallbackRange = null;
      }

      function ensureRightPriceScaleFallbackLayer() {
        var chartElement = document.getElementById('chart');
        if (!chartElement) {
          return null;
        }
        if (rightPriceScaleFallbackLayer && rightPriceScaleFallbackLayer.parentNode === chartElement) {
          return rightPriceScaleFallbackLayer;
        }
        rightPriceScaleFallbackLayer = document.createElement('div');
        rightPriceScaleFallbackLayer.className = 'rtx5-right-price-scale-fallback';
        rightPriceScaleFallbackLayer.setAttribute('aria-hidden', 'true');
        chartElement.style.position = 'relative';
        chartElement.appendChild(rightPriceScaleFallbackLayer);
        return rightPriceScaleFallbackLayer;
      }

      function resolveChartTextColor(opts) {
        try {
          var textColor = opts && opts.layout ? opts.layout.textColor : null;
          if (typeof textColor === 'string' && textColor.length > 0) {
            return textColor;
          }
        } catch (_e) {}
        return '#131722';
      }

      function resolveRightPriceScaleFallbackTextColor() {
        try {
          var options = chart && typeof chart.options === 'function' ? chart.options() : null;
          var textColor = options && options.layout ? options.layout.textColor : null;
          if (typeof textColor === 'string' && textColor.length > 0) {
            return resolveReadableRightPriceScaleFallbackTextColor(textColor);
          }
        } catch (_e) {}
        return resolveReadableRightPriceScaleFallbackTextColor(lastChartTextColor || '#131722');
      }

      function resolveRightPriceScaleFallbackFontFamily() {
        try {
          var options = chart && typeof chart.options === 'function' ? chart.options() : null;
          var fontFamily = options && options.layout ? options.layout.fontFamily : null;
          if (typeof fontFamily === 'string' && fontFamily.length > 0) {
            return fontFamily;
          }
        } catch (_e) {}
        return "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif";
      }

      function resolveRightPriceScaleCoordinateRange() {
        try {
          if (!series || typeof series.coordinateToPrice !== 'function') {
            return null;
          }
          var metrics = resolveFallbackPlotMetrics();
          if (!metrics || !(metrics.plotHeight > 0)) {
            return null;
          }
          var plotTop = Math.max(0, Math.round(metrics.plotTop || 0));
          var plotBottom = plotTop + Math.max(0, Math.round(metrics.plotHeight || 0));
          var topPrice = series.coordinateToPrice(plotTop + RIGHT_PRICE_SCALE_FALLBACK_LABEL_HEIGHT / 2);
          var bottomPrice = series.coordinateToPrice(plotBottom - RIGHT_PRICE_SCALE_FALLBACK_LABEL_HEIGHT / 2);
          if (typeof topPrice !== 'number' || !isFinite(topPrice) || typeof bottomPrice !== 'number' || !isFinite(bottomPrice)) {
            return null;
          }
          return normalizePriceRange({
            from: Math.min(topPrice, bottomPrice),
            to: Math.max(topPrice, bottomPrice),
          });
        } catch (_coordinateRangeErr) {}
        return null;
      }

      function resolveRightPriceScaleVisibleRange() {
        try {
          var priceScaleApi = getRightPriceScaleApi();
          var visibleRange =
            priceScaleApi && typeof priceScaleApi.getVisibleRange === 'function'
              ? priceScaleApi.getVisibleRange()
              : null;
          if (isValidPriceRange(visibleRange)) {
            return normalizePriceRange(visibleRange);
          }
        } catch (_visibleRangeErr) {}
        return null;
      }

      function resolveRightPriceScaleFallbackRange() {
        if (isValidPriceRange(syntheticRightPriceScaleFallbackRange)) {
          return normalizePriceRange(syntheticRightPriceScaleFallbackRange);
        }
        // Prefer the COORDINATE range — it is the exact inverse of the
        // series.priceToCoordinate() mapping used to POSITION the labels, so the
        // generated label range always matches where labels actually land and
        // the axis fills top-to-bottom. getVisibleRange() is the scale's logical
        // range, which can report a NARROWER band than the rendered plot when a
        // wide bid/ask price line or autoscale margin stretches the view (e.g. a
        // stale 2+ point spread right after a symbol switch). Using it as the
        // primary source clustered the labels and left the reported blank band,
        // so it is now only a fallback when the coordinate range is unavailable.
        var coordinateRange = resolveRightPriceScaleCoordinateRange();
        if (isValidPriceRange(coordinateRange)) {
          return normalizePriceRange(coordinateRange);
        }
        var visibleScaleRange = resolveRightPriceScaleVisibleRange();
        if (isValidPriceRange(visibleScaleRange)) {
          return normalizePriceRange(visibleScaleRange);
        }
        var visibleDataRange = resolvePriceRangeFromVisibleData(true);
        if (isValidPriceRange(visibleDataRange)) {
          return normalizePriceRange(visibleDataRange);
        }
        return null;
      }

      function countRightPriceScaleFallbackDecimalPlaces(value) {
        if (typeof value !== 'number' || !isFinite(value)) {
          return 0;
        }
        var text = String(value).toLowerCase();
        var exponentIndex = text.indexOf('e');
        if (exponentIndex >= 0) {
          var mantissa = text.slice(0, exponentIndex);
          var exponent = Number(text.slice(exponentIndex + 1));
          var mantissaDecimalIndex = mantissa.indexOf('.');
          var mantissaDecimals = mantissaDecimalIndex >= 0 ? mantissa.length - mantissaDecimalIndex - 1 : 0;
          return Math.max(0, mantissaDecimals - (isFinite(exponent) ? exponent : 0));
        }
        var decimalIndex = text.indexOf('.');
        return decimalIndex >= 0 ? Math.max(0, text.length - decimalIndex - 1) : 0;
      }

      var rightPriceScaleFallbackDataDecimalsCache = { signature: '', value: 0 };
      function resolveRightPriceScaleFallbackDataDecimals() {
        if (!lastRawSeriesData || lastRawSeriesData.length === 0) {
          return 0;
        }
        // Memoize per data-state: this scan runs once per label otherwise, and
        // the price scale re-renders every frame. The signature changes whenever
        // the series grows or the latest bar updates, so it rescans exactly once
        // per real data change instead of ~30x per render.
        var lastBar = lastRawSeriesData[lastRawSeriesData.length - 1];
        var signature = lastRawSeriesData.length + '|' + (lastBar
          ? (lastBar.close + ',' + lastBar.high + ',' + lastBar.low + ',' + lastBar.open + ',' + lastBar.value)
          : 'none');
        if (rightPriceScaleFallbackDataDecimalsCache.signature === signature) {
          return rightPriceScaleFallbackDataDecimalsCache.value;
        }
        var maxDecimals = 0;
        var startIndex = Math.max(0, lastRawSeriesData.length - 260);
        for (var i = startIndex; i < lastRawSeriesData.length; i += 1) {
          var bar = lastRawSeriesData[i];
          if (!bar) {
            continue;
          }
          var candidates = [bar.open, bar.high, bar.low, bar.close, bar.value];
          for (var p = 0; p < candidates.length; p += 1) {
            maxDecimals = Math.max(maxDecimals, countRightPriceScaleFallbackDecimalPlaces(candidates[p]));
            if (maxDecimals >= 8) {
              rightPriceScaleFallbackDataDecimalsCache = { signature: signature, value: 8 };
              return 8;
            }
          }
        }
        var resolvedDataDecimals = Math.max(0, Math.min(8, maxDecimals));
        rightPriceScaleFallbackDataDecimalsCache = { signature: signature, value: resolvedDataDecimals };
        return resolvedDataDecimals;
      }

      function resolveRightPriceScaleFallbackConfiguredDecimals() {
        return typeof lastDisplayDecimals === 'number' && isFinite(lastDisplayDecimals) && lastDisplayDecimals >= 0
          ? Math.max(0, Math.min(8, Math.round(lastDisplayDecimals)))
          : null;
      }

      function resolveRightPriceScaleFallbackDecimals(minimumDecimals) {
        var configuredDecimals = resolveRightPriceScaleFallbackConfiguredDecimals();
        if (configuredDecimals !== null) {
          return configuredDecimals;
        }
        var safeMinimum =
          typeof minimumDecimals === 'number' && isFinite(minimumDecimals)
            ? Math.max(0, Math.min(8, Math.round(minimumDecimals)))
            : 0;
        // With no configured display metadata, preserve real backend precision.
        return Math.max(
          2,
          resolveRightPriceScaleFallbackDataDecimals(),
          safeMinimum
        );
      }

      function roundRightPriceScaleFallbackPrice(price, decimals) {
        if (typeof price !== 'number' || !isFinite(price)) {
          return NaN;
        }
        var safeDecimals =
          typeof decimals === 'number' && isFinite(decimals)
            ? Math.max(0, Math.min(8, Math.round(decimals)))
            : resolveRightPriceScaleFallbackDecimals();
        var factor = Math.pow(10, safeDecimals);
        return Math.round(price * factor) / factor;
      }

      function formatRightPriceScaleFallbackLabel(price, decimals) {
        var resolvedDecimals = resolveRightPriceScaleFallbackDecimals(decimals);
        return Number(price).toFixed(resolvedDecimals);
      }

      function resolveRightPriceScaleFallbackStepDecimals(step) {
        var configuredDecimals = resolveRightPriceScaleFallbackConfiguredDecimals();
        if (configuredDecimals !== null) {
          return configuredDecimals;
        }
        // Honor the backend data precision as a floor here too, so the per-tick
        // step rounding/formatting never drops decimals the backend provided.
        return Math.max(
          resolveRightPriceScaleFallbackDataDecimals(),
          countRightPriceScaleFallbackDecimalPlaces(step)
        );
      }

      function resolveRightPriceScaleFallbackLabelCount(metrics) {
        var plotHeight = metrics && typeof metrics.plotHeight === 'number' ? metrics.plotHeight : 0;
        var targetGap =
          RIGHT_PRICE_SCALE_FALLBACK_TARGET_LABEL_GAP_PX > 0
            ? RIGHT_PRICE_SCALE_FALLBACK_TARGET_LABEL_GAP_PX
            : 56;
        var estimated = Math.floor(plotHeight / targetGap) + 1;
        return Math.max(
          RIGHT_PRICE_SCALE_FALLBACK_MIN_LABELS,
          Math.min(RIGHT_PRICE_SCALE_FALLBACK_MAX_LABELS, estimated)
        );
      }

      function resolveRightPriceScaleFallbackAxisMetrics(metrics) {
        var chartWidth = Math.max(0, Math.round(metrics.chartWidth || 0));
        var reportedAxisWidth = Math.max(0, Math.round(metrics.rightAxisWidth || 0));
        var axisWidth = Math.max(reportedAxisWidth, ${CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH});
        axisWidth = Math.min(axisWidth, chartWidth);
        var axisLeft = reportedAxisWidth > 0
          ? Math.round((metrics.leftAxisWidth || 0) + (metrics.paneWidth || 0))
          : Math.max(0, chartWidth - axisWidth);
        if (chartWidth > 0 && axisLeft + axisWidth > chartWidth) {
          axisWidth = Math.max(0, chartWidth - axisLeft);
        }
        return {
          axisLeft: axisLeft,
          axisWidth: axisWidth,
          chartWidth: chartWidth,
        };
      }

      function resolveRightPriceScaleFallbackTargetLabelGap() {
        return RIGHT_PRICE_SCALE_FALLBACK_TARGET_LABEL_GAP_PX > 0
          ? RIGHT_PRICE_SCALE_FALLBACK_TARGET_LABEL_GAP_PX
            : 56;
      }

      function resolveRightPriceScaleFallbackNiceStepFromRaw(rawStep, preferDense) {
        if (!(rawStep > 0)) {
          return 0;
        }
        var exponent = Math.floor(Math.log(rawStep) / Math.LN10);
        var magnitude = Math.pow(10, exponent);
        var fraction = rawStep / magnitude;
        var niceFraction = preferDense
          ? RIGHT_PRICE_SCALE_FALLBACK_NICE_FRACTIONS[0]
          : RIGHT_PRICE_SCALE_FALLBACK_NICE_FRACTIONS[RIGHT_PRICE_SCALE_FALLBACK_NICE_FRACTIONS.length - 1];
        for (var i = 0; i < RIGHT_PRICE_SCALE_FALLBACK_NICE_FRACTIONS.length; i += 1) {
          var candidate = RIGHT_PRICE_SCALE_FALLBACK_NICE_FRACTIONS[i];
          if (preferDense) {
            if (fraction >= candidate) {
              niceFraction = candidate;
            } else {
              break;
            }
          } else if (fraction <= candidate) {
            niceFraction = candidate;
            break;
          }
        }
        var step = niceFraction * magnitude;
        var decimals = resolveRightPriceScaleFallbackStepDecimals(step);
        var minimumStep = decimals > 0 ? Math.pow(10, -decimals) : 1;
        return Math.max(step, minimumStep);
      }

      function resolveRightPriceScaleFallbackNiceStep(span, targetIntervals, preferDense) {
        if (!(span > 0)) {
          return 0;
        }
        var intervals =
          typeof targetIntervals === 'number' && isFinite(targetIntervals)
            ? Math.max(1, Math.round(targetIntervals))
            : RIGHT_PRICE_SCALE_FALLBACK_MIN_LABELS;
        var rawStep = span / intervals;
        return resolveRightPriceScaleFallbackNiceStepFromRaw(rawStep, preferDense === true);
      }

      // Snap an exact "ideal" step to the NEAREST nice step (1/2/2.5/5/10 ×10ⁿ),
      // measuring distance in log space. The nice fractions jump by up to ×2, so
      // "pick the coarsest step ≥ ideal" (the old approach) lands the label gap
      // anywhere from ~0.6× to ~2× the target depending on where a symbol's price
      // span happens to fall between two steps — cramped for some symbols, sparse
      // for others. Nearest-in-log instead keeps the rendered gap within ~×1.41
      // of the target for EVERY symbol and zoom, so the scale is uniformly
      // professional (never too close, never too wide) without per-symbol tuning.
      function resolveRightPriceScaleFallbackNearestNiceStep(idealStep) {
        if (!(idealStep > 0)) {
          return 0;
        }
        var exponent = Math.floor(Math.log(idealStep) / Math.LN10);
        var targetLog = Math.log(idealStep);
        var best = 0;
        var bestDist = Infinity;
        for (var e = exponent - 1; e <= exponent + 1; e += 1) {
          var magnitude = Math.pow(10, e);
          for (var i = 0; i < RIGHT_PRICE_SCALE_FALLBACK_NICE_FRACTIONS.length; i += 1) {
            var candidate = RIGHT_PRICE_SCALE_FALLBACK_NICE_FRACTIONS[i] * magnitude;
            if (!(candidate > 0)) {
              continue;
            }
            var dist = Math.abs(Math.log(candidate) - targetLog);
            if (dist < bestDist) {
              bestDist = dist;
              best = candidate;
            }
          }
        }
        if (!(best > 0)) {
          return 0;
        }
        var decimals = resolveRightPriceScaleFallbackStepDecimals(best);
        var minimumStep = decimals > 0 ? Math.pow(10, -decimals) : 1;
        return Math.max(best, minimumStep);
      }

      function resolveRightPriceScaleFallbackTicks() {
        if (!series || !lastRawSeriesData || lastRawSeriesData.length === 0) {
          return [];
        }
        var metrics = resolveFallbackPlotMetrics();
        if (
          !metrics ||
          !(metrics.chartWidth > 0) ||
          !(metrics.paneWidth > 0) ||
          !(metrics.plotHeight > 0)
        ) {
          return [];
        }
        var range = resolveRightPriceScaleFallbackRange();
        if (!isValidPriceRange(range)) {
          return [];
        }
        range = normalizePriceRange(range);
        var span = getPriceRangeSpan(range);
        if (!(span > 0)) {
          return [];
        }
        var labelCount = resolveRightPriceScaleFallbackLabelCount(metrics);
        var priceScaleApi = getRightPriceScaleApi();
        var priceScaleOptions =
          priceScaleApi && typeof priceScaleApi.options === 'function'
            ? priceScaleApi.options()
            : null;
        var invertScale = priceScaleOptions && priceScaleOptions.invertScale === true;
        var plotTop = Math.max(0, Math.round(metrics.plotTop || 0));
        var plotBottom = plotTop + Math.max(0, Math.round(metrics.plotHeight || 0));
        var labelTop = plotTop + RIGHT_PRICE_SCALE_FALLBACK_LABEL_HEIGHT / 2;
        var labelBottom = plotBottom - RIGHT_PRICE_SCALE_FALLBACK_LABEL_HEIGHT / 2;
        if (!(labelBottom > labelTop)) {
          return [];
        }
        var ticks = [];
        var seenLabels = Object.create(null);
        var decimals = resolveRightPriceScaleFallbackDecimals();
        var intervals = Math.max(1, labelCount - 1);
        var topPrice = invertScale ? range.from : range.to;
        var bottomPrice = invertScale ? range.to : range.from;
        var appendInterpolatedTick = function(price, y) {
          if (typeof price !== 'number' || !isFinite(price) || typeof y !== 'number' || !isFinite(y)) {
            return false;
          }
          var text = formatRightPriceScaleFallbackLabel(price, decimals);
          if (seenLabels[text]) {
            return false;
          }
          seenLabels[text] = true;
          ticks.push({
            price: price,
            text: text,
            y: y,
          });
          return true;
        };
        // MT5 parity: the price-scale strip stays fixed, while the whole
        // visible range is interpolated through it. Avoid fixed round-number
        // ticks here; otherwise only the top/bottom endpoint labels change
        // during vertical movement and the middle of the scale looks frozen.
        for (var scaleIndex = 0; scaleIndex <= intervals && ticks.length < RIGHT_PRICE_SCALE_FALLBACK_MAX_LABELS; scaleIndex += 1) {
          var ratio = scaleIndex / intervals;
          var price = topPrice + (bottomPrice - topPrice) * ratio;
          var y = labelTop + (labelBottom - labelTop) * ratio;
          appendInterpolatedTick(roundRightPriceScaleFallbackPrice(price, decimals), y);
        }
        ticks.sort(function(left, right) { return left.y - right.y; });
        return ticks;
        var plotHeightPx = Math.max(1, metrics.plotHeight || 1);
        var targetLabelGap = resolveRightPriceScaleFallbackTargetLabelGap();
        // Dynamic, symbol-agnostic step: derive the exact step that would place
        // labels exactly targetLabelGap px apart for THIS symbol's price span and
        // pane height, then snap it to the nearest nice step. This bounds the
        // rendered gap to ~×1.41 of the target for every symbol — no per-symbol
        // tuning, never cramped, never sparse.
        var idealStep = (span * targetLabelGap) / plotHeightPx;
        var step = resolveRightPriceScaleFallbackNearestNiceStep(idealStep);
        if (!(step > 0)) {
          step = resolveRightPriceScaleFallbackNiceStep(span, Math.max(1, labelCount - 1));
        }
        if (!(step > 0)) {
          return [];
        }
        // Guarantee the step is coarse enough that EVERY label across the full
        // range fits under the hard cap. Otherwise the generation loop fills the
        // cap from the top and stops, leaving the bottom of the axis blank (the
        // reported gap). Coarsen until the whole range is covered top-to-bottom.
        var projectedLabelCount = Math.floor(span / step) + 1;
        if (projectedLabelCount > RIGHT_PRICE_SCALE_FALLBACK_MAX_LABELS) {
          var fittedStep = resolveRightPriceScaleFallbackNiceStep(
            span,
            Math.max(1, RIGHT_PRICE_SCALE_FALLBACK_MAX_LABELS - 1)
          );
          if (fittedStep > step) {
            step = fittedStep;
          }
        }
        var priceScaleApi = getRightPriceScaleApi();
        var priceScaleOptions =
          priceScaleApi && typeof priceScaleApi.options === 'function'
            ? priceScaleApi.options()
            : null;
        var invertScale = priceScaleOptions && priceScaleOptions.invertScale === true;
        var plotTop = Math.max(0, Math.round(metrics.plotTop || 0));
        var plotBottom = plotTop + Math.max(0, Math.round(metrics.plotHeight || 0));
        var ticks = [];
        var seenLabels = Object.create(null);
        var decimals = resolveRightPriceScaleFallbackStepDecimals(step);
        var minTickGap = RIGHT_PRICE_SCALE_FALLBACK_LABEL_HEIGHT + 4;
        var appendTick = function(price, forcedY, forceEdge) {
          if (typeof price !== 'number' || !isFinite(price)) {
            return false;
          }
          var y = typeof forcedY === 'number' && isFinite(forcedY) ? forcedY : null;
          if (y === null) {
            try {
              y = typeof series.priceToCoordinate === 'function' ? series.priceToCoordinate(price) : null;
            } catch (_coordErr) {
              y = null;
            }
          }
          if (typeof y !== 'number' || !isFinite(y)) {
            var ratio = span > 0
              ? (invertScale ? (price - range.from) / span : (range.to - price) / span)
              : 0.5;
            y = plotTop + ratio * Math.max(1, metrics.plotHeight || 1);
          }
          y = Math.max(
            plotTop + RIGHT_PRICE_SCALE_FALLBACK_LABEL_HEIGHT / 2,
            Math.min(plotBottom - RIGHT_PRICE_SCALE_FALLBACK_LABEL_HEIGHT / 2, y)
          );
          var text = formatRightPriceScaleFallbackLabel(price, decimals);
          if (seenLabels[text]) {
            return false;
          }
          if (forceEdge === true) {
            for (var edgeIndex = ticks.length - 1; edgeIndex >= 0; edgeIndex -= 1) {
              if (Math.abs(ticks[edgeIndex].y - y) < minTickGap) {
                seenLabels[ticks[edgeIndex].text] = false;
                ticks.splice(edgeIndex, 1);
              }
            }
          } else {
            for (var existingIndex = 0; existingIndex < ticks.length; existingIndex += 1) {
              if (Math.abs(ticks[existingIndex].y - y) < minTickGap) {
                return false;
              }
            }
          }
          seenLabels[text] = true;
          ticks.push({
            price: price,
            text: text,
            y: y,
          });
          return true;
        };
        appendTick(
          invertScale ? range.from : range.to,
          plotTop + RIGHT_PRICE_SCALE_FALLBACK_LABEL_HEIGHT / 2,
          true
        );
        var startPrice = Math.ceil(range.from / step) * step;
        var endPrice = Math.floor(range.to / step) * step;
        var epsilon = Math.max(step * 0.000001, Math.pow(10, -Math.max(decimals, 1)) * 0.000001);
        if (endPrice < startPrice) {
          startPrice = range.from;
          endPrice = range.to;
        }
        var prices = [];
        for (var priceTick = endPrice; priceTick >= startPrice - epsilon; priceTick -= step) {
          prices.push(roundRightPriceScaleFallbackPrice(priceTick, decimals));
          if (prices.length > RIGHT_PRICE_SCALE_FALLBACK_MAX_LABELS * 3) {
            break;
          }
        }
        if (prices.length === 0) {
          prices = [
            roundRightPriceScaleFallbackPrice(range.to, decimals),
            roundRightPriceScaleFallbackPrice(range.from + span / 2, decimals),
            roundRightPriceScaleFallbackPrice(range.from, decimals),
          ];
        }
        if (invertScale) {
          prices.reverse();
        }
        for (var i = 0; i < prices.length && ticks.length < RIGHT_PRICE_SCALE_FALLBACK_MAX_LABELS; i += 1) {
          appendTick(prices[i], null, false);
        }
        // Bottom boundary label must YIELD to round-number labels, not cull them.
        // forceEdge=true here used to delete the nearest round label within
        // minTickGap to seat the exact range.from value — but that boundary label
        // sits behind the live-price tag and is invisible, so as the live range
        // drifted it intermittently erased a real round label (e.g. 0.70755) and
        // left a visible gap. forceEdge=false keeps the round label and only adds
        // the boundary label when there is genuinely room for it.
        appendTick(
          invertScale ? range.to : range.from,
          plotBottom - RIGHT_PRICE_SCALE_FALLBACK_LABEL_HEIGHT / 2,
          false
        );
        ticks.sort(function(left, right) { return left.y - right.y; });
        return ticks;
      }

      function renderFallbackRightPriceScaleLabels() {
        try {
          if (!series || !lastRawSeriesData || lastRawSeriesData.length === 0) {
            clearRightPriceScaleFallbackLabels();
            return false;
          }
          var metrics = resolveFallbackPlotMetrics();
          var layer = ensureRightPriceScaleFallbackLayer();
          if (!layer) {
            return false;
          }
          var axisMetrics = resolveRightPriceScaleFallbackAxisMetrics(metrics);
          if (!(axisMetrics.chartWidth > 0) || !(axisMetrics.axisWidth > 0)) {
            return false;
          }
          var ticks = resolveRightPriceScaleFallbackTicks();
          if (ticks.length === 0) {
            return false;
          }
          var textColor = resolveRightPriceScaleFallbackTextColor();
          var fontFamily = resolveRightPriceScaleFallbackFontFamily();
          var labelLeft = Math.max(0, Math.round(axisMetrics.axisLeft + 3));
          var labelWidth = Math.max(0, Math.round(Math.min(axisMetrics.axisWidth - 4, axisMetrics.chartWidth - labelLeft - 1)));
          layer.style.display = 'block';
          layer.style.position = 'absolute';
          layer.style.left = '0px';
          layer.style.top = '0px';
          layer.style.right = '0px';
          layer.style.bottom = '0px';
          layer.style.pointerEvents = 'none';
          layer.style.overflow = 'hidden';
          layer.style.zIndex = '30';
          // metrics here comes from resolveFallbackPlotMetrics(), whose
          // plotTop/plotHeight already span the FULL pane height (candles plus
          // the move/volume region), so this background masks the native scale's
          // tick labels across the whole axis and the fallback paints one
          // continuous symbol price scale top-to-bottom.
          var axisBackground = rightPriceScaleFallbackBackgroundNode;
          if (!axisBackground || axisBackground.parentNode !== layer) {
            axisBackground = document.createElement('div');
            axisBackground.className = 'rtx5-right-price-scale-fallback-axis';
            rightPriceScaleFallbackBackgroundNode = axisBackground;
            layer.insertBefore(axisBackground, layer.firstChild);
          }
          axisBackground.style.left = Math.max(0, Math.round(axisMetrics.axisLeft)) + 'px';
          axisBackground.style.top = Math.max(0, Math.round(metrics.plotTop || 0)) + 'px';
          axisBackground.style.width = Math.max(0, Math.round(axisMetrics.axisWidth)) + 'px';
          axisBackground.style.height = Math.max(0, Math.round(metrics.plotHeight || metrics.paneHeight || 0)) + 'px';
          axisBackground.style.background = lastChartAxisBackgroundColor || lastChartBackgroundColor || '#FFFFFF';
          axisBackground.style.display = 'block';
          for (var i = 0; i < ticks.length; i += 1) {
            var tick = ticks[i];
            var label = rightPriceScaleFallbackLabelNodes[i];
            if (!label || label.parentNode !== layer) {
              label = document.createElement('div');
              label.className = 'rtx5-right-price-scale-fallback-label';
              label.setAttribute('data-rtx5-role', 'right-price-scale-fallback-label');
              rightPriceScaleFallbackLabelNodes[i] = label;
              layer.appendChild(label);
            }
            label.textContent = tick.text;
            label.style.left = labelLeft + 'px';
            label.style.top = Math.round(tick.y - RIGHT_PRICE_SCALE_FALLBACK_LABEL_HEIGHT / 2) + 'px';
            label.style.width = labelWidth + 'px';
            label.style.color = textColor;
            label.style.fontFamily = fontFamily;
            label.style.fontSize = RIGHT_PRICE_SCALE_FALLBACK_LABEL_FONT_SIZE + 'px';
            label.style.lineHeight = RIGHT_PRICE_SCALE_FALLBACK_LABEL_HEIGHT + 'px';
            label.style.textAlign = 'right';
            label.style.fontWeight = RIGHT_PRICE_SCALE_FALLBACK_LABEL_FONT_WEIGHT;
            label.style.letterSpacing = '0px';
            label.style.fontVariantNumeric = 'tabular-nums';
            label.style.fontFeatureSettings = '"tnum" 1, "lnum" 1';
            label.style.opacity = RIGHT_PRICE_SCALE_FALLBACK_LABEL_OPACITY;
            label.style.textShadow = 'none';
            label.style.display = 'block';
          }
          for (var unusedIndex = ticks.length; unusedIndex < rightPriceScaleFallbackLabelNodes.length; unusedIndex += 1) {
            if (rightPriceScaleFallbackLabelNodes[unusedIndex]) {
              rightPriceScaleFallbackLabelNodes[unusedIndex].style.display = 'none';
            }
          }
          return true;
        } catch (fallbackErr) {
          postError('renderFallbackRightPriceScaleLabels', fallbackErr);
          return false;
        }
      }

      function scheduleRightPriceScaleFallbackRefresh() {
        if (rightPriceScaleFallbackRaf) {
          return;
        }
        rightPriceScaleFallbackRaf = requestAnimationFrame(function() {
          rightPriceScaleFallbackRaf = 0;
          renderFallbackRightPriceScaleLabels();
        });
      }

      function flushGestureRightPriceScaleFallbackRefresh() {
        gestureRightPriceScaleFallbackTimer = null;
        gestureRightPriceScaleFallbackFrame = 0;
        lastGestureRightPriceScaleFallbackAt = Date.now();
        renderFallbackRightPriceScaleLabels();
        refreshMarketPriceScaleDom();
      }

      function cancelGestureRightPriceScaleFallbackRefresh() {
        if (gestureRightPriceScaleFallbackTimer !== null) {
          try { clearTimeout(gestureRightPriceScaleFallbackTimer); } catch (_e) {}
          gestureRightPriceScaleFallbackTimer = null;
        }
        if (gestureRightPriceScaleFallbackFrame) {
          try { cancelAnimationFrame(gestureRightPriceScaleFallbackFrame); } catch (_frameErr) {}
          gestureRightPriceScaleFallbackFrame = 0;
        }
        if (rightPriceScaleFallbackRaf) {
          try { cancelAnimationFrame(rightPriceScaleFallbackRaf); } catch (_rafErr) {}
          rightPriceScaleFallbackRaf = 0;
        }
      }

      function scheduleGestureRightPriceScaleFallbackRefresh() {
        if (
          rightPriceScaleFallbackRaf ||
          gestureRightPriceScaleFallbackTimer !== null ||
          gestureRightPriceScaleFallbackFrame
        ) {
          return;
        }
        var now = Date.now();
        var delay = Math.max(
          0,
          GESTURE_RIGHT_PRICE_SCALE_REFRESH_INTERVAL_MS - (now - lastGestureRightPriceScaleFallbackAt)
        );
        var scheduleFrame = function() {
          gestureRightPriceScaleFallbackTimer = null;
          gestureRightPriceScaleFallbackFrame = requestAnimationFrame(flushGestureRightPriceScaleFallbackRefresh);
        };
        if (delay > 0) {
          gestureRightPriceScaleFallbackTimer = setTimeout(scheduleFrame, delay);
          return;
        }
        scheduleFrame();
      }

      function recoverRightPriceScaleLayout(reason) {
        try {
          if (!chart) {
            return;
          }
          applyRightPriceScaleLayoutOptions();
          var size = resolveChartElementSize();
          if (
            size.width > 0 &&
            size.height > 0 &&
            typeof chart.resize === 'function'
          ) {
            chart.resize(size.width, size.height);
          }
          scheduleOverlayDomRefresh();
          scheduleRightPriceScaleFallbackRefresh();
          postChartGeometry();
          chartDebugLog('[WEBVIEW-CANDLE] recover_right_price_scale_layout', {
            reason: reason || 'unknown',
            width: size.width,
            height: size.height,
          });
        } catch (_e) {}
      }

      function scheduleRightPriceScaleLayoutRecovery(reason, attempts) {
        if (rightPriceScaleLayoutRecoveryRaf) {
          cancelAnimationFrame(rightPriceScaleLayoutRecoveryRaf);
        }
        var remainingAttempts =
          typeof attempts === 'number' && isFinite(attempts)
            ? Math.max(1, Math.round(attempts))
            : RIGHT_PRICE_SCALE_LAYOUT_RECOVERY_MAX_ATTEMPTS;
        rightPriceScaleLayoutRecoveryRaf = requestAnimationFrame(function() {
          rightPriceScaleLayoutRecoveryRaf = 0;
          if (isRightPriceScaleLayoutHealthy()) {
            renderFallbackRightPriceScaleLabels();
            postChartGeometry();
            return;
          }
          recoverRightPriceScaleLayout(reason);
          if (remainingAttempts > 1 && !isRightPriceScaleLayoutHealthy()) {
            scheduleRightPriceScaleLayoutRecovery(reason, remainingAttempts - 1);
          }
        });
      }

      function postChartReadyWhenPriceScaleHealthy(
        reason,
        attempt,
        generation,
        initSignature,
        configSig,
        dataContextSig
      ) {
        if (typeof generation === 'number' && generation !== chartReadyPostGeneration) {
          return;
        }
        var currentAttempt =
          typeof attempt === 'number' && isFinite(attempt)
            ? Math.max(0, Math.round(attempt))
            : 0;
        if (isRightPriceScaleLayoutHealthy()) {
          if (!lastRawSeriesData || lastRawSeriesData.length === 0 || renderFallbackRightPriceScaleLabels()) {
            postChartGeometry();
            postChartReady(initSignature, configSig, dataContextSig);
            return;
          }
        }
        recoverRightPriceScaleLayout(reason || 'chart_ready');
        if (!lastRawSeriesData || lastRawSeriesData.length === 0 || renderFallbackRightPriceScaleLabels()) {
          postChartGeometry();
          postChartReady(initSignature, configSig, dataContextSig);
          return;
        }
        if (currentAttempt >= RIGHT_PRICE_SCALE_LAYOUT_RECOVERY_MAX_ATTEMPTS) {
          scheduleRightPriceScaleFallbackRefresh();
          scheduleRightPriceScaleLayoutRecovery(reason || 'chart_ready', 2);
          postChartGeometry();
          postChartReady(initSignature, configSig, dataContextSig);
          return;
        }
        requestAnimationFrame(function() {
          postChartReadyWhenPriceScaleHealthy(
            reason,
            currentAttempt + 1,
            generation,
            initSignature,
            configSig,
            dataContextSig
          );
        });
      }

      function isTransparentChartColor(color) {
        if (typeof color !== 'string' || color.length === 0) {
          return true;
        }
        var normalized = color.toLowerCase().split(' ').join('');
        if (normalized === 'transparent') {
          return true;
        }
        if (normalized.indexOf('rgba(') === 0 && normalized.lastIndexOf(')') === normalized.length - 1) {
          var parts = normalized.slice(5, -1).split(',');
          if (parts.length >= 4) {
            var alpha = Number(parts[3]);
            return isFinite(alpha) && alpha <= 0;
          }
        }
        return false;
      }

      function getMovingVerticalGridLayer() {
        return document.getElementById('rtx5-moving-vertical-grid');
      }

      function clearMovingVerticalGrid() {
        if (movingVerticalGridRaf) {
          try { cancelAnimationFrame(movingVerticalGridRaf); } catch (_e) {}
          movingVerticalGridRaf = 0;
        }
        movingVerticalGridTransformOnlyPending = false;
        var layer = getMovingVerticalGridLayer();
        if (!layer) {
          return;
        }
        layer.textContent = '';
        layer.style.display = 'none';
        movingGridVerticalLines = [];
        movingGridHorizontalLines = [];
        movingGridVerticalGroup = null;
        movingGridHorizontalGroup = null;
        movingGridLayerSignature = '';
        movingGridVerticalSignature = '';
        movingGridHorizontalSignature = '';
      }

      function getChartAxisDividerLayer() {
        return document.getElementById('rtx5-axis-dividers');
      }

      function clearChartAxisDividers() {
        if (chartAxisDividerRaf) {
          try { cancelAnimationFrame(chartAxisDividerRaf); } catch (_e) {}
          chartAxisDividerRaf = 0;
        }
        var layer = getChartAxisDividerLayer();
        if (!layer) {
          return;
        }
        layer.textContent = '';
        layer.style.display = 'none';
        chartAxisDividerSignature = '';
      }

      function applyChartAxisDividerColor(color) {
        chartAxisDividerColor = typeof color === 'string' ? color : 'transparent';
        chartAxisDividerVisible = !isTransparentChartColor(chartAxisDividerColor);
        if (!chartAxisDividerVisible) {
          clearChartAxisDividers();
          return;
        }
        scheduleChartAxisDividersUpdate();
      }

      function scheduleChartAxisDividersUpdate() {
        if (chartAxisDividerRaf) {
          return;
        }
        chartAxisDividerRaf = requestAnimationFrame(function() {
          chartAxisDividerRaf = 0;
          updateChartAxisDividers();
        });
      }

      function createAxisDividerLine(layer, namespace, id) {
        var line = document.getElementById(id);
        if (!line || line.parentNode !== layer) {
          line = document.createElementNS(namespace, 'line');
          line.setAttribute('id', id);
          layer.appendChild(line);
        }
        line.setAttribute('stroke', chartAxisDividerColor);
        line.setAttribute('stroke-width', String(AXIS_DIVIDER_STROKE_WIDTH));
        line.setAttribute('stroke-linecap', 'square');
        line.setAttribute('vector-effect', 'non-scaling-stroke');
        line.style.display = 'block';
        return line;
      }

      function updateChartAxisDividers() {
        var layer = getChartAxisDividerLayer();
        if (!layer || !chart || !chartAxisDividerVisible) {
          clearChartAxisDividers();
          return;
        }

        try {
          var metrics = resolvePrimaryPaneMetrics();
          if (!(metrics.chartWidth > 0) || !(metrics.chartHeight > 0) || !(metrics.paneWidth > 0) || !(metrics.paneHeight > 0)) {
            clearChartAxisDividers();
            return;
          }

          var left = Math.round(metrics.leftAxisWidth);
          var paneRight = Math.round(metrics.leftAxisWidth + metrics.paneWidth);
          var paneBottom = Math.round(metrics.paneHeight);
          var dividerInset = Math.max(1, AXIS_DIVIDER_STROKE_WIDTH);
          var topDividerY = dividerInset;
          var bottomDividerY = Math.max(topDividerY, paneBottom - dividerInset);
          var layerSignature = [
            metrics.chartWidth,
            metrics.chartHeight,
            left,
            paneRight,
            paneBottom,
            topDividerY,
            bottomDividerY,
            AXIS_DIVIDER_STROKE_WIDTH,
            chartAxisDividerColor
          ].join('|');
          if (layerSignature === chartAxisDividerSignature) {
            return;
          }

          layer.style.display = 'block';
          layer.style.left = '0px';
          layer.style.top = '0px';
          layer.style.width = metrics.chartWidth + 'px';
          layer.style.height = metrics.chartHeight + 'px';
          layer.setAttribute('width', String(metrics.chartWidth));
          layer.setAttribute('height', String(metrics.chartHeight));
          layer.setAttribute('viewBox', '0 0 ' + metrics.chartWidth + ' ' + metrics.chartHeight);

          var namespace = 'http://www.w3.org/2000/svg';
          var verticalLine = createAxisDividerLine(layer, namespace, 'rtx5-axis-divider-right');
          verticalLine.setAttribute('x1', String(paneRight));
          verticalLine.setAttribute('y1', String(topDividerY));
          verticalLine.setAttribute('x2', String(paneRight));
          verticalLine.setAttribute('y2', String(bottomDividerY));

          var topLine = createAxisDividerLine(layer, namespace, 'rtx5-axis-divider-top');
          topLine.setAttribute('x1', String(left));
          topLine.setAttribute('y1', String(topDividerY));
          topLine.setAttribute('x2', String(paneRight));
          topLine.setAttribute('y2', String(topDividerY));

          var bottomLine = createAxisDividerLine(layer, namespace, 'rtx5-axis-divider-bottom');
          bottomLine.setAttribute('x1', String(left));
          bottomLine.setAttribute('y1', String(bottomDividerY));
          bottomLine.setAttribute('x2', String(paneRight));
          bottomLine.setAttribute('y2', String(bottomDividerY));

          chartAxisDividerSignature = layerSignature;
        } catch (_e) {
          clearChartAxisDividers();
        }
      }

      function applyMovingVerticalGridColor(color) {
        movingVerticalGridColor = typeof color === 'string' ? color : 'transparent';
        movingVerticalGridVisible = !isTransparentChartColor(movingVerticalGridColor);
        if (!movingVerticalGridVisible) {
          clearMovingVerticalGrid();
          return;
        }
        scheduleMovingVerticalGridUpdate();
      }

      function updateMovingVerticalGridTransformOnly() {
        try {
          if (!movingVerticalGridVisible || !chart || !movingGridVerticalGroup) {
            return false;
          }
          var layer = getMovingVerticalGridLayer();
          if (!layer || movingGridVerticalGroup.parentNode !== layer) {
            return false;
          }
          var timeScaleApi = chart && typeof chart.timeScale === 'function' ? chart.timeScale() : null;
          if (!timeScaleApi) {
            return false;
          }
          var visualSpacing = Math.max(12, MOVING_VERTICAL_GRID_SPACING);
          var range =
            typeof timeScaleApi.getVisibleLogicalRange === 'function'
              ? timeScaleApi.getVisibleLogicalRange()
              : null;
          var options =
            typeof timeScaleApi.options === 'function'
              ? timeScaleApi.options()
              : null;
          var barSpacing =
            options && typeof options.barSpacing === 'number' && isFinite(options.barSpacing) && options.barSpacing > 0
              ? options.barSpacing
              : ${CHART_DEFAULT_TIME_SCALE_BAR_SPACING};
          if (
            !range ||
            typeof range.from !== 'number' ||
            !isFinite(range.from)
          ) {
            return false;
          }
          var anchorCoordinate =
            typeof timeScaleApi.logicalToCoordinate === 'function'
              ? timeScaleApi.logicalToCoordinate(0)
              : null;
          if (typeof anchorCoordinate !== 'number' || !isFinite(anchorCoordinate)) {
            anchorCoordinate = -(range.from * barSpacing);
          }
          var firstCoordinate = anchorCoordinate % visualSpacing;
          while (firstCoordinate > 0) {
            firstCoordinate -= visualSpacing;
          }
          while (firstCoordinate < -visualSpacing) {
            firstCoordinate += visualSpacing;
          }
          setMovingGridGroupTransform(movingGridVerticalGroup, firstCoordinate);
          return true;
        } catch (_e) {
          return false;
        }
      }

      function scheduleMovingVerticalGridUpdate(preferTransformOnly) {
        var transformOnly =
          preferTransformOnly === true ||
          (preferTransformOnly !== false && isHorizontalScrollMotionActive());
        if (!movingVerticalGridRaf) {
          movingVerticalGridTransformOnlyPending = transformOnly;
        } else if (!transformOnly) {
          movingVerticalGridTransformOnlyPending = false;
        }
        if (movingVerticalGridRaf) {
          return;
        }
        movingVerticalGridRaf = requestAnimationFrame(function() {
          movingVerticalGridRaf = 0;
          var shouldTransformOnly = movingVerticalGridTransformOnlyPending;
          movingVerticalGridTransformOnlyPending = false;
          // During a live horizontal pan, the SVG grid already exists. Only
          // move that group instead of recalculating every grid line.
          if (shouldTransformOnly) {
            updateMovingVerticalGridTransformOnly();
            return;
          }
          updateMovingVerticalGrid();
        });
      }

      function applyMovingGridLineStyle(line) {
        var styleSignature = [
          movingVerticalGridColor,
          MOVING_GRID_STROKE_WIDTH,
          MOVING_VERTICAL_GRID_DASH_PATTERN
        ].join('|');
        if (line.__rtx5GridStyleSignature !== styleSignature) {
          line.setAttribute('stroke', movingVerticalGridColor);
          line.setAttribute('stroke-width', String(MOVING_GRID_STROKE_WIDTH));
          line.setAttribute('stroke-linecap', 'round');
          if (MOVING_VERTICAL_GRID_DASH_PATTERN) {
            line.setAttribute('stroke-dasharray', MOVING_VERTICAL_GRID_DASH_PATTERN);
          } else {
            line.removeAttribute('stroke-dasharray');
          }
          line.setAttribute('vector-effect', 'non-scaling-stroke');
          line.__rtx5GridStyleSignature = styleSignature;
        }
        if (line.style.display !== 'block') {
          line.style.display = 'block';
        }
      }

      function setMovingGridAttribute(line, name, value) {
        var nextValue = String(value);
        if (line.getAttribute(name) !== nextValue) {
          line.setAttribute(name, nextValue);
        }
      }

      function resolveMovingGridGroup(layer, namespace, id) {
        var group = id === 'vertical' ? movingGridVerticalGroup : movingGridHorizontalGroup;
        if (!group || group.parentNode !== layer) {
          group = document.createElementNS(namespace, 'g');
          layer.appendChild(group);
          if (id === 'vertical') {
            movingGridVerticalGroup = group;
          } else {
            movingGridHorizontalGroup = group;
          }
        }
        return group;
      }

      function setMovingGridGroupTransform(group, x) {
        var nextTransform = 'translate(' + Math.round(x) + ',0)';
        if (group.getAttribute('transform') !== nextTransform) {
          group.setAttribute('transform', nextTransform);
        }
      }

      function resolveMovingGridLine(pool, layer, namespace, index) {
        var line = pool[index];
        if (!line || line.parentNode !== layer) {
          line = document.createElementNS(namespace, 'line');
          layer.appendChild(line);
          pool[index] = line;
        }
        applyMovingGridLineStyle(line);
        return line;
      }

      function hideUnusedMovingGridLines(pool, startIndex) {
        for (var index = startIndex; index < pool.length; index += 1) {
          if (pool[index]) {
            pool[index].style.display = 'none';
          }
        }
      }

      function resolveMovingVerticalGridXPositions(metrics) {
        var positions = [];
        var timeScaleApi = chart && typeof chart.timeScale === 'function' ? chart.timeScale() : null;
        if (!timeScaleApi) {
          return positions;
        }

        var range =
          typeof timeScaleApi.getVisibleLogicalRange === 'function'
            ? timeScaleApi.getVisibleLogicalRange()
            : null;
        var options =
          typeof timeScaleApi.options === 'function'
            ? timeScaleApi.options()
            : null;
        var barSpacing =
          options && typeof options.barSpacing === 'number' && isFinite(options.barSpacing) && options.barSpacing > 0
            ? options.barSpacing
            : ${CHART_DEFAULT_TIME_SCALE_BAR_SPACING};
        var visualSpacing = Math.max(12, MOVING_VERTICAL_GRID_SPACING);

        if (
          range &&
          typeof range.from === 'number' &&
          typeof range.to === 'number' &&
          isFinite(range.from) &&
          isFinite(range.to) &&
          typeof timeScaleApi.logicalToCoordinate === 'function'
        ) {
          var anchorCoordinate = timeScaleApi.logicalToCoordinate(0);
          if (typeof anchorCoordinate !== 'number' || !isFinite(anchorCoordinate)) {
            anchorCoordinate = -(range.from * barSpacing);
          }
          var firstCoordinate = anchorCoordinate % visualSpacing;
          while (firstCoordinate > 0) {
            firstCoordinate -= visualSpacing;
          }
          while (firstCoordinate < -visualSpacing) {
            firstCoordinate += visualSpacing;
          }
          for (var x = firstCoordinate; x <= metrics.paneWidth + 1; x += visualSpacing) {
            if (x >= -1) {
              positions.push(Math.round(x));
            }
          }
          if (positions.length > 0) {
            return positions;
          }
        }

        var fallbackX = 0;
        if (range && typeof range.from === 'number' && isFinite(range.from)) {
          fallbackX = -((range.from * barSpacing) % visualSpacing);
          while (fallbackX > 0) {
            fallbackX -= visualSpacing;
          }
          while (fallbackX < -visualSpacing) {
            fallbackX += visualSpacing;
          }
        }
        for (; fallbackX <= metrics.paneWidth + 1; fallbackX += visualSpacing) {
          if (fallbackX >= -1) {
            positions.push(Math.round(fallbackX));
          }
        }
        return positions;
      }

      function resolveMovingGridYPositions(metrics) {
        var positions = [];
        var lineCount = Math.max(1, Math.round(MOVING_GRID_HORIZONTAL_LINE_COUNT));
        var spacing = Math.max(24, MOVING_GRID_HORIZONTAL_SPACING);
        var firstInteriorLine = MOVING_GRID_FIRST_INTERIOR_HORIZONTAL_OFFSET;
        for (var index = 0; index < lineCount; index++) {
          var y = firstInteriorLine + index * spacing;
          if (y > 0 && y < metrics.paneHeight - 1) {
            positions.push(Math.round(y));
          }
        }
        return positions;
      }

      function updateMovingVerticalGrid() {
        var layer = getMovingVerticalGridLayer();
        if (!layer || !chart || !movingVerticalGridVisible) {
          clearMovingVerticalGrid();
          return;
        }
        try {
          var metrics = resolvePrimaryPaneMetrics();
          if (!(metrics.paneWidth > 0) || !(metrics.paneHeight > 0)) {
            clearMovingVerticalGrid();
            return;
          }

          var xPositions = resolveMovingVerticalGridXPositions(metrics);
          var yPositions = resolveMovingGridYPositions(metrics);
          if (!xPositions.length && !yPositions.length) {
            clearMovingVerticalGrid();
            return;
          }

          layer.style.display = 'block';
          var layerSignature = [
            metrics.leftAxisWidth,
            metrics.paneWidth,
            metrics.paneHeight
          ].join('|');
          if (layerSignature !== movingGridLayerSignature) {
            layer.style.left = metrics.leftAxisWidth + 'px';
            layer.style.top = '0px';
            layer.style.width = metrics.paneWidth + 'px';
            layer.style.height = metrics.paneHeight + 'px';
            layer.setAttribute('width', String(metrics.paneWidth));
            layer.setAttribute('height', String(metrics.paneHeight));
            layer.setAttribute('viewBox', '0 0 ' + metrics.paneWidth + ' ' + metrics.paneHeight);
            movingGridLayerSignature = layerSignature;
            movingGridHorizontalSignature = '';
          }
          var namespace = 'http://www.w3.org/2000/svg';
          var verticalGroup = resolveMovingGridGroup(layer, namespace, 'vertical');
          var horizontalGroup = resolveMovingGridGroup(layer, namespace, 'horizontal');
          var visualSpacing = Math.max(12, MOVING_VERTICAL_GRID_SPACING);
          var verticalOffset = xPositions.length ? xPositions[0] : 0;
          var verticalSignature = [
            xPositions.length,
            metrics.paneHeight,
            movingVerticalGridColor,
            MOVING_GRID_STROKE_WIDTH,
            MOVING_VERTICAL_GRID_DASH_PATTERN,
            visualSpacing
          ].join('|');
          if (verticalSignature !== movingGridVerticalSignature) {
          for (var index = 0; index < xPositions.length; index++) {
            var x = index * visualSpacing;
            var line = resolveMovingGridLine(movingGridVerticalLines, verticalGroup, namespace, index);
            setMovingGridAttribute(line, 'x1', x);
            setMovingGridAttribute(line, 'y1', 0);
            setMovingGridAttribute(line, 'x2', x);
            setMovingGridAttribute(line, 'y2', metrics.paneHeight);
          }
          hideUnusedMovingGridLines(movingGridVerticalLines, xPositions.length);
            movingGridVerticalSignature = verticalSignature;
          }
          setMovingGridGroupTransform(verticalGroup, verticalOffset);
          var horizontalSignature = [
            metrics.paneWidth,
            metrics.paneHeight,
            movingVerticalGridColor,
            MOVING_GRID_STROKE_WIDTH,
            MOVING_VERTICAL_GRID_DASH_PATTERN,
            yPositions.join(',')
          ].join('|');
          if (horizontalSignature !== movingGridHorizontalSignature) {
            for (var yIndex = 0; yIndex < yPositions.length; yIndex++) {
              var y = yPositions[yIndex];
              var horizontalLine = resolveMovingGridLine(movingGridHorizontalLines, horizontalGroup, namespace, yIndex);
              setMovingGridAttribute(horizontalLine, 'x1', 0);
              setMovingGridAttribute(horizontalLine, 'y1', y);
              setMovingGridAttribute(horizontalLine, 'x2', metrics.paneWidth);
              setMovingGridAttribute(horizontalLine, 'y2', y);
            }
            hideUnusedMovingGridLines(movingGridHorizontalLines, yPositions.length);
            movingGridHorizontalSignature = horizontalSignature;
          }
        } catch (_e) {
          clearMovingVerticalGrid();
        }
      }

      function getPeriodSeparatorLayer() {
        return document.getElementById('rtx5-period-separators');
      }

      function clearPeriodSeparatorLayer() {
        if (periodSeparatorsRaf) {
          try { cancelAnimationFrame(periodSeparatorsRaf); } catch (_e) {}
          periodSeparatorsRaf = 0;
        }
        periodSeparatorsTransformOnlyPending = false;
        var layer = getPeriodSeparatorLayer();
        periodSeparatorLines = [];
        periodSeparatorGroup = null;
        periodSeparatorMotionAnchorCoordinate = null;
        periodSeparatorSignature = '';
        if (!layer) {
          return;
        }
        layer.textContent = '';
        layer.style.display = 'none';
      }

      function sanitizePeriodSeparatorData(separators) {
        if (!Array.isArray(separators) || separators.length === 0) {
          return [];
        }
        var sanitized = [];
        var seen = {};
        for (var index = 0; index < separators.length; index += 1) {
          var item = separators[index];
          if (!item || typeof item.time !== 'number' || !isFinite(item.time) || item.time <= 0) {
            continue;
          }
          var separatorIndex =
            typeof item.index === 'number' && isFinite(item.index) && item.index >= 0
              ? Math.floor(item.index)
              : -1;
          var key = separatorIndex >= 0 ? 'i:' + separatorIndex : 't:' + item.time;
          if (seen[key]) {
            continue;
          }
          seen[key] = true;
          sanitized.push({
            time: item.time,
            index: separatorIndex,
            type: typeof item.type === 'string' ? item.type : 'day',
          });
        }
        return sanitized;
      }

      function applyPeriodSeparatorOptions(options) {
        var nextOptions = options && typeof options === 'object' ? options : {};
        periodSeparatorsVisible = nextOptions.enabled !== false;
        periodSeparatorColor =
          typeof nextOptions.color === 'string' && nextOptions.color.length > 0
            ? nextOptions.color
            : 'rgba(120, 120, 120, 0.45)';
        periodSeparatorWidth =
          typeof nextOptions.width === 'number' && isFinite(nextOptions.width) && nextOptions.width > 0
            ? Math.max(0.5, Math.min(2, nextOptions.width))
            : 1;
        periodSeparatorDashPattern =
          typeof nextOptions.dashPattern === 'string' && nextOptions.dashPattern.length > 0
            ? nextOptions.dashPattern
            : '1 5';
        if (!periodSeparatorsVisible) {
          clearPeriodSeparatorLayer();
        }
      }

      function setPeriodSeparators(separators, options) {
        // Native sends Renko an empty, disabled payload: these lines mark
        // calendar/session time, while Renko positions are price-driven.
        periodSeparatorData = sanitizePeriodSeparatorData(separators);
        applyPeriodSeparatorOptions(options);
        schedulePeriodSeparatorsUpdate();
      }

      function schedulePeriodSeparatorsUpdate(preferTransformOnly) {
        var transformOnly =
          preferTransformOnly === true ||
          (preferTransformOnly !== false && isHorizontalScrollMotionActive());
        if (!periodSeparatorsRaf) {
          periodSeparatorsTransformOnlyPending = transformOnly;
        } else if (!transformOnly) {
          // A settle/full request must upgrade an already queued motion frame.
          periodSeparatorsTransformOnlyPending = false;
        }
        if (periodSeparatorsRaf) {
          return;
        }
        periodSeparatorsRaf = requestAnimationFrame(function() {
          periodSeparatorsRaf = 0;
          var shouldTransformOnly = periodSeparatorsTransformOnlyPending;
          periodSeparatorsTransformOnlyPending = false;
          if (shouldTransformOnly) {
            updatePeriodSeparatorsTransformOnly();
            return;
          }
          updatePeriodSeparators();
        });
      }

      function resolvePeriodSeparatorGroup(layer, namespace) {
        if (!periodSeparatorGroup || periodSeparatorGroup.parentNode !== layer) {
          periodSeparatorGroup = document.createElementNS(namespace, 'g');
          layer.appendChild(periodSeparatorGroup);
        }
        return periodSeparatorGroup;
      }

      function setPeriodSeparatorGroupTransform(group, x) {
        if (!group) return;
        var nextTransform = 'translate(' + Math.round(x) + ',0)';
        if (group.getAttribute('transform') !== nextTransform) {
          group.setAttribute('transform', nextTransform);
        }
      }

      function resolvePeriodSeparatorX(separator, timeScaleApi) {
        var coordinate = null;
        if (
          separator &&
          typeof separator.index === 'number' &&
          separator.index >= 0 &&
          typeof timeScaleApi.logicalToCoordinate === 'function'
        ) {
          coordinate = timeScaleApi.logicalToCoordinate(separator.index);
        }
        if (
          (typeof coordinate !== 'number' || !isFinite(coordinate)) &&
          separator &&
          typeof timeScaleApi.timeToCoordinate === 'function'
        ) {
          coordinate = timeScaleApi.timeToCoordinate(separator.time);
        }
        return typeof coordinate === 'number' && isFinite(coordinate) ? coordinate : null;
      }

      function updatePeriodSeparatorsTransformOnly() {
        try {
          if (
            !periodSeparatorsVisible ||
            !chart ||
            !periodSeparatorGroup ||
            typeof periodSeparatorMotionAnchorCoordinate !== 'number' ||
            !isFinite(periodSeparatorMotionAnchorCoordinate)
          ) {
            return false;
          }
          var timeScaleApi = chart && typeof chart.timeScale === 'function' ? chart.timeScale() : null;
          if (!timeScaleApi || typeof timeScaleApi.logicalToCoordinate !== 'function') {
            return false;
          }
          var nextAnchorCoordinate = timeScaleApi.logicalToCoordinate(0);
          if (typeof nextAnchorCoordinate !== 'number' || !isFinite(nextAnchorCoordinate)) {
            return false;
          }
          setPeriodSeparatorGroupTransform(
            periodSeparatorGroup,
            nextAnchorCoordinate - periodSeparatorMotionAnchorCoordinate
          );
          return true;
        } catch (_e) {
          return false;
        }
      }

      function applyPeriodSeparatorLineStyle(line) {
        var styleSignature = [
          periodSeparatorColor,
          periodSeparatorWidth,
          periodSeparatorDashPattern
        ].join('|');
        if (line.__rtx5PeriodSeparatorStyleSignature !== styleSignature) {
          line.setAttribute('stroke', periodSeparatorColor);
          line.setAttribute('stroke-width', String(periodSeparatorWidth));
          line.setAttribute('stroke-linecap', 'round');
          if (periodSeparatorDashPattern) {
            line.setAttribute('stroke-dasharray', periodSeparatorDashPattern);
          } else {
            line.removeAttribute('stroke-dasharray');
          }
          line.setAttribute('vector-effect', 'non-scaling-stroke');
          line.__rtx5PeriodSeparatorStyleSignature = styleSignature;
        }
        line.style.pointerEvents = 'none';
        line.style.display = 'block';
      }

      function resolvePeriodSeparatorLine(layer, namespace, index) {
        var line = periodSeparatorLines[index];
        if (!line || line.parentNode !== layer) {
          line = document.createElementNS(namespace, 'line');
          layer.appendChild(line);
          periodSeparatorLines[index] = line;
        }
        applyPeriodSeparatorLineStyle(line);
        return line;
      }

      function hideUnusedPeriodSeparatorLines(startIndex) {
        for (var index = startIndex; index < periodSeparatorLines.length; index += 1) {
          if (periodSeparatorLines[index]) {
            periodSeparatorLines[index].style.display = 'none';
          }
        }
      }

      function updatePeriodSeparators() {
        var layer = getPeriodSeparatorLayer();
        if (!layer || !chart || !periodSeparatorsVisible || !periodSeparatorData.length) {
          clearPeriodSeparatorLayer();
          return;
        }
        try {
          var metrics = resolvePrimaryPaneMetrics();
          var timeScaleApi = chart && typeof chart.timeScale === 'function' ? chart.timeScale() : null;
          if (!timeScaleApi || !(metrics.paneWidth > 0) || !(metrics.paneHeight > 0)) {
            clearPeriodSeparatorLayer();
            return;
          }
          var namespace = 'http://www.w3.org/2000/svg';
          var separatorGroup = resolvePeriodSeparatorGroup(layer, namespace);
          setPeriodSeparatorGroupTransform(separatorGroup, 0);
          var nextMotionAnchorCoordinate =
            typeof timeScaleApi.logicalToCoordinate === 'function'
              ? timeScaleApi.logicalToCoordinate(0)
              : null;
          periodSeparatorMotionAnchorCoordinate =
            typeof nextMotionAnchorCoordinate === 'number' && isFinite(nextMotionAnchorCoordinate)
              ? nextMotionAnchorCoordinate
              : null;

          var visible = [];
          // Cache one extra pane on each side so a fast fling can translate
          // separators into view without rebuilding the SVG group mid-motion.
          var horizontalMotionBuffer = metrics.paneWidth;
          for (var index = 0; index < periodSeparatorData.length; index += 1) {
            var separator = periodSeparatorData[index];
            var coordinate = resolvePeriodSeparatorX(separator, timeScaleApi);
            if (typeof coordinate !== 'number' || !isFinite(coordinate)) {
              continue;
            }
            var x = Math.round(coordinate);
            if (
              x >= -horizontalMotionBuffer - 1 &&
              x <= metrics.paneWidth + horizontalMotionBuffer + 1
            ) {
              visible.push({ x: x, type: separator.type });
            }
          }

          if (!visible.length) {
            hideUnusedPeriodSeparatorLines(0);
            periodSeparatorSignature = '';
            layer.style.display = 'none';
            return;
          }

          layer.style.display = 'block';
          layer.style.left = metrics.leftAxisWidth + 'px';
          layer.style.top = '0px';
          layer.style.width = metrics.paneWidth + 'px';
          layer.style.height = metrics.paneHeight + 'px';
          layer.setAttribute('width', String(metrics.paneWidth));
          layer.setAttribute('height', String(metrics.paneHeight));
          layer.setAttribute('viewBox', '0 0 ' + metrics.paneWidth + ' ' + metrics.paneHeight);

          var signature = [
            metrics.leftAxisWidth,
            metrics.paneWidth,
            metrics.paneHeight,
            periodSeparatorColor,
            periodSeparatorWidth,
            periodSeparatorDashPattern,
            visible.map(function(item) { return item.x + ':' + item.type; }).join(',')
          ].join('|');
          if (signature === periodSeparatorSignature) {
            return;
          }

          for (var lineIndex = 0; lineIndex < visible.length; lineIndex += 1) {
            var line = resolvePeriodSeparatorLine(separatorGroup, namespace, lineIndex);
            var xPosition = visible[lineIndex].x;
            setMovingGridAttribute(line, 'x1', xPosition);
            setMovingGridAttribute(line, 'y1', 0);
            setMovingGridAttribute(line, 'x2', xPosition);
            setMovingGridAttribute(line, 'y2', metrics.paneHeight);
            line.setAttribute('data-separator-type', visible[lineIndex].type);
          }
          hideUnusedPeriodSeparatorLines(visible.length);
          periodSeparatorSignature = signature;
        } catch (_e) {
          clearPeriodSeparatorLayer();
        }
      }

      function isValidPriceRange(range) {
        return Boolean(
          range &&
          typeof range.from === 'number' &&
          typeof range.to === 'number' &&
          isFinite(range.from) &&
          isFinite(range.to) &&
          range.from !== range.to
        );
      }

      function normalizePriceRange(range) {
        if (!isValidPriceRange(range)) {
          return null;
        }
        return {
          from: Math.min(range.from, range.to),
          to: Math.max(range.from, range.to),
        };
      }

      function getPriceRangeSpan(range) {
        var normalized = normalizePriceRange(range);
        return normalized ? normalized.to - normalized.from : 0;
      }

      function getPriceRangeOverlapRatio(currentRange, dataRange) {
        var current = normalizePriceRange(currentRange);
        var data = normalizePriceRange(dataRange);
        if (!current || !data) {
          return 0;
        }
        var dataSpan = getPriceRangeSpan(data);
        if (!(dataSpan > 0)) {
          return 0;
        }
        var overlapFrom = Math.max(current.from, data.from);
        var overlapTo = Math.min(current.to, data.to);
        var overlapSpan = Math.max(0, overlapTo - overlapFrom);
        return overlapSpan / dataSpan;
      }

      function resolvePriceRangePixelCompression(range) {
        var normalized = normalizePriceRange(range);
        if (!normalized || !series || typeof series.priceToCoordinate !== 'function') {
          return null;
        }
        var fromCoordinate = series.priceToCoordinate(normalized.from);
        var toCoordinate = series.priceToCoordinate(normalized.to);
        if (
          typeof fromCoordinate !== 'number' ||
          typeof toCoordinate !== 'number' ||
          !isFinite(fromCoordinate) ||
          !isFinite(toCoordinate)
        ) {
          return null;
        }
        var metrics = resolvePrimaryPaneMetrics();
        var plotHeight =
          metrics && typeof metrics.plotHeight === 'number' && isFinite(metrics.plotHeight) && metrics.plotHeight > 0
            ? metrics.plotHeight
            : 0;
        if (!(plotHeight > 0)) {
          return null;
        }
        var pixelSpan = Math.abs(toCoordinate - fromCoordinate);
        var minPixelSpan = Math.max(
          PRICE_SCALE_HEALTH_MIN_VISIBLE_PIXEL_SPAN,
          plotHeight * PRICE_SCALE_HEALTH_MIN_VISIBLE_PIXEL_RATIO
        );
        return {
          pixelSpan: pixelSpan,
          minPixelSpan: minPixelSpan,
          collapsed: pixelSpan < minPixelSpan,
        };
      }

      function getBarPriceCenter(bar) {
        if (!bar) return NaN;
        if (typeof bar.close === 'number' && isFinite(bar.close)) return bar.close;
        if (typeof bar.value === 'number' && isFinite(bar.value)) return bar.value;
        if (typeof bar.open === 'number' && isFinite(bar.open)) return bar.open;
        return NaN;
      }

      function makePaddedPriceRange(minPrice, maxPrice) {
        if (!isFinite(minPrice) || !isFinite(maxPrice)) {
          return null;
        }
        var span = maxPrice - minPrice;
        // MT5-parity tight fit. The old 8% pad left a wide empty band above/
        // below the candles, so an old trade entry sitting just outside the
        // candle lows stayed inside the pane and looked glued to the bottom
        // edge. MT5 auto-scales tight to the candles, which pushes such
        // markers fully off-pane (hidden) until the user scrolls to them.
        var padding = Math.max(span * 0.02, Math.abs(maxPrice || 1) * 0.0002);
        if (!(padding > 0)) padding = 1;
        return {
          from: minPrice - padding,
          to: maxPrice + padding,
        };
      }

      function resolveTradeOverlayPaddingRatio(overlayCount) {
        var count = Math.max(1, Math.min(8, Math.floor(overlayCount || 1)));
        return Math.min(0.32, 0.12 + count * 0.025);
      }

      function makeTradeOverlayPaddedPriceRange(minPrice, maxPrice, overlayCount) {
        if (!isFinite(minPrice) || !isFinite(maxPrice)) {
          return null;
        }
        var span = maxPrice - minPrice;
        if (!(span > 0)) {
          span = Math.max(Math.abs(maxPrice || minPrice || 1) * 0.0002, 1);
        }
        var padding = Math.max(
          span * resolveTradeOverlayPaddingRatio(overlayCount),
          Math.abs(maxPrice || minPrice || 1) * 0.0002
        );
        if (!(padding > 0)) padding = 1;
        return normalizePriceRange({
          from: minPrice - padding,
          to: maxPrice + padding,
        });
      }

      function collectFiniteBarPrices(bars) {
        var prices = [];
        if (!bars || bars.length === 0) {
          return prices;
        }
        for (var i = 0; i < bars.length; i += 1) {
          var bar = bars[i];
          if (!bar) continue;
          var candidates = [
            bar.open,
            bar.high,
            bar.low,
            bar.close,
            bar.value,
          ];
          for (var p = 0; p < candidates.length; p += 1) {
            var price = candidates[p];
            if (typeof price === 'number' && isFinite(price)) {
              prices.push(price);
            }
          }
        }
        return prices;
      }

      function resolveTrimmedPriceRangeFromBars(bars) {
        var prices = collectFiniteBarPrices(bars);
        if (prices.length < PRICE_SCALE_ROBUST_TRIM_MIN_VALUES) {
          return null;
        }
        prices.sort(function(left, right) { return left - right; });
        var trimCount = Math.max(1, Math.floor(prices.length * PRICE_SCALE_ROBUST_TRIM_RATIO));
        if (prices.length - trimCount * 2 < Math.floor(PRICE_SCALE_ROBUST_TRIM_MIN_VALUES / 2)) {
          return null;
        }
        var minPrice = prices[trimCount];
        var maxPrice = prices[prices.length - 1 - trimCount];
        if (!(maxPrice > minPrice)) {
          return null;
        }
        return makePaddedPriceRange(minPrice, maxPrice);
      }

      function resolvePriceRangeFromBars(bars) {
        if (!bars || bars.length === 0) {
          return null;
        }

        var minPrice = Infinity;
        var maxPrice = -Infinity;
        for (var i = 0; i < bars.length; i += 1) {
          var bar = bars[i];
          if (!bar) continue;
          var high = typeof bar.high === 'number' ? bar.high : (typeof bar.value === 'number' ? bar.value : NaN);
          var low = typeof bar.low === 'number' ? bar.low : (typeof bar.value === 'number' ? bar.value : NaN);
          var open = typeof bar.open === 'number' ? bar.open : high;
          var close = typeof bar.close === 'number' ? bar.close : high;
          if (isFinite(high)) maxPrice = Math.max(maxPrice, high);
          if (isFinite(low)) minPrice = Math.min(minPrice, low);
          if (isFinite(open)) {
            minPrice = Math.min(minPrice, open);
            maxPrice = Math.max(maxPrice, open);
          }
          if (isFinite(close)) {
            minPrice = Math.min(minPrice, close);
            maxPrice = Math.max(maxPrice, close);
          }
        }

        if (!isFinite(minPrice) || !isFinite(maxPrice)) {
          return null;
        }

        return makePaddedPriceRange(minPrice, maxPrice);
      }

      function getMarketPriceBadgeValues() {
        var prices = [];
        if (typeof lastLivePrice === 'number' && isFinite(lastLivePrice) && lastLivePrice > 0) {
          prices.push(lastLivePrice);
        }
        return prices;
      }

      function isMarketPriceNearRange(price, range) {
        var normalized = normalizePriceRange(range);
        if (!normalized || typeof price !== 'number' || !isFinite(price) || price <= 0) {
          return false;
        }
        if (price >= normalized.from && price <= normalized.to) {
          return true;
        }
        var span = getPriceRangeSpan(normalized);
        if (!(span > 0)) {
          return false;
        }
        var distance = price < normalized.from
          ? normalized.from - price
          : price - normalized.to;
        return distance <= span * 4;
      }

      function isTradeOverlayScaleLine(line) {
        if (!line || typeof line.id !== 'string') {
          return false;
        }
        return /^(open-|order-entry-|order-stop-limit-|order-sl-|order-tp-|sl-|tp-|chart-trade-)/.test(line.id);
      }

      function shouldRenderRightAxisTradePriceBox(line) {
        if (!line || typeof line.id !== 'string') {
          return false;
        }
        if (/^(open-|order-entry-|order-stop-limit-|order-sl-|order-tp-|sl-|tp-)/.test(line.id)) {
          return true;
        }
        // Only direct Market Execution protection drafts receive an MT5-style
        // right-scale marker. Pending entry/stop-limit previews stay untouched.
        return line.id === 'chart-trade-sl-preview' || line.id === 'chart-trade-tp-preview';
      }

      function isTradeOverlayNearScaleRange(price, range) {
        var normalized = normalizePriceRange(range);
        if (!normalized || typeof price !== 'number' || !isFinite(price) || price <= 0) {
          return false;
        }
        if (price >= normalized.from && price <= normalized.to) {
          return true;
        }
        var span = getPriceRangeSpan(normalized);
        if (!(span > 0)) {
          return false;
        }
        var referencePrice = Math.max(
          Math.abs(price),
          Math.abs(normalized.from),
          Math.abs(normalized.to),
          1
        );
        var distance = price < normalized.from
          ? normalized.from - price
          : price - normalized.to;
        var maxDistance = Math.max(span * 4, referencePrice * 0.005);
        return distance <= maxDistance;
      }

      function getTradeOverlayPriceValues() {
        var overlayLines = Array.isArray(_overlayPayload && _overlayPayload.priceLines)
          ? _overlayPayload.priceLines
          : [];
        var prices = [];
        for (var i = 0; i < overlayLines.length; i += 1) {
          var line = overlayLines[i];
          if (!isTradeOverlayScaleLine(line)) continue;
          var price = Number(line.price);
          if (isFinite(price) && price > 0) {
            prices.push(price);
          }
        }
        return prices;
      }

      function getTradeOverlayPriceValuesForScale(range) {
        var overlayPrices = getTradeOverlayPriceValues();
        var normalized = normalizePriceRange(range);
        if (!normalized) {
          return overlayPrices;
        }
        var prices = [];
        for (var i = 0; i < overlayPrices.length; i += 1) {
          if (isTradeOverlayNearScaleRange(overlayPrices[i], normalized)) {
            prices.push(overlayPrices[i]);
          }
        }
        return prices;
      }

      function shouldCreateOverlayNativePriceLine(line) {
        if (!line || typeof line.price !== 'number' || !isFinite(line.price) || line.price <= 0 || !line.id) {
          return false;
        }
        // Trade entries are drawn by the custom DOM overlay so their labels and
        // dotted lines stay attached to the chart without stretching candle
        // autoscale when an entry sits far away from the active price.
        if (
          isTradeOverlayScaleLine(line) ||
          line.labelPlacement === 'line' ||
          (typeof line.dragKey === 'string' && line.dragKey)
        ) {
          return false;
        }
        return true;
      }

      function countOverlayNativePriceLines(lines) {
        var overlayLines = Array.isArray(lines) ? lines : [];
        var count = 0;
        for (var i = 0; i < overlayLines.length; i += 1) {
          if (shouldCreateOverlayNativePriceLine(overlayLines[i])) {
            count += 1;
          }
        }
        return count;
      }

      function isTradeOverlayNearRangeEdge(price, minPrice, maxPrice) {
        if (typeof price !== 'number' || !isFinite(price)) {
          return false;
        }
        var span = maxPrice - minPrice;
        if (!(span > 0)) {
          return true;
        }
        var edgeDistance = Math.max(span * 0.12, Math.abs(maxPrice || minPrice || 1) * 0.0002);
        return price - minPrice <= edgeDistance || maxPrice - price <= edgeDistance;
      }

      function expandPriceRangeForTradeOverlays(range) {
        var normalized = normalizePriceRange(range);
        var overlayPrices = getTradeOverlayPriceValuesForScale(normalized);
        if (overlayPrices.length === 0) {
          return normalized || range;
        }
        var minPrice = normalized ? normalized.from : overlayPrices[0];
        var maxPrice = normalized ? normalized.to : overlayPrices[0];
        var expanded = !normalized;
        for (var i = 0; i < overlayPrices.length; i += 1) {
          var price = overlayPrices[i];
          if (price < minPrice) {
            minPrice = price;
            expanded = true;
          } else if (price > maxPrice) {
            maxPrice = price;
            expanded = true;
          }
        }
        var overlayNearEdge = false;
        for (var edgeIndex = 0; edgeIndex < overlayPrices.length; edgeIndex += 1) {
          if (isTradeOverlayNearRangeEdge(overlayPrices[edgeIndex], minPrice, maxPrice)) {
            overlayNearEdge = true;
            break;
          }
        }
        return expanded || overlayNearEdge || overlayPrices.length > 1
          ? makeTradeOverlayPaddedPriceRange(minPrice, maxPrice, overlayPrices.length)
          : normalized;
      }

      function rangeContainsTradeOverlays(range) {
        var normalized = normalizePriceRange(range);
        if (!normalized) {
          return true;
        }
        var overlayPrices = getTradeOverlayPriceValues();
        if (overlayPrices.length === 0) {
          return true;
        }
        var buffer = resolveMarketPriceBadgeRecoveryBuffer(normalized);
        for (var i = 0; i < overlayPrices.length; i += 1) {
          var price = overlayPrices[i];
          if (!isTradeOverlayNearScaleRange(price, normalized)) {
            continue;
          }
          if (price < normalized.from - buffer || price > normalized.to + buffer) {
            return false;
          }
        }
        return true;
      }

      function buildOverlayAwareAutoscaleInfo(baseImplementation) {
        var baseInfo = null;
        try {
          baseInfo = typeof baseImplementation === 'function' ? baseImplementation() : null;
        } catch (_baseScaleErr) {
          baseInfo = null;
        }
        var implementationRange = baseInfo && baseInfo.priceRange
          ? { from: baseInfo.priceRange.minValue, to: baseInfo.priceRange.maxValue }
          : null;
        var visibleCandleRange = resolveVisibleCandleDataPriceRange();
        var baseRange = isValidPriceRange(visibleCandleRange)
          ? visibleCandleRange
          : implementationRange;
        var expandedRange = expandPriceRangeForMarketPriceBadges(baseRange);
        if (!isValidPriceRange(expandedRange)) {
          return baseInfo;
        }
        var nextInfo = baseInfo && typeof baseInfo === 'object' ? Object.assign({}, baseInfo) : {};
        nextInfo.priceRange = {
          minValue: expandedRange.from,
          maxValue: expandedRange.to,
        };
        return nextInfo;
      }
      function expandPriceRangeForMarketPriceBadges(range) {
        var normalized = normalizePriceRange(range);
        if (!normalized) {
          return range;
        }
        var marketPrices = getMarketPriceBadgeValues();
        if (marketPrices.length === 0) {
          return normalized;
        }
        var minPrice = normalized.from;
        var maxPrice = normalized.to;
        var span = getPriceRangeSpan(normalized);
        var maxQuoteDistance = span * 4;
        var expanded = false;
        for (var i = 0; i < marketPrices.length; i += 1) {
          var price = marketPrices[i];
          if (price < minPrice && minPrice - price <= maxQuoteDistance) {
            minPrice = price;
            expanded = true;
          } else if (price > maxPrice && price - maxPrice <= maxQuoteDistance) {
            maxPrice = price;
            expanded = true;
          }
        }
        return expanded ? makePaddedPriceRange(minPrice, maxPrice) : normalized;
      }

      function resolveMarketPriceBadgeRecoveryBuffer(range) {
        var normalized = normalizePriceRange(range);
        if (!normalized) {
          return 0;
        }
        var span = getPriceRangeSpan(normalized);
        if (!(span > 0)) {
          return 0;
        }
        var configuredDecimals = resolveRightPriceScaleFallbackConfiguredDecimals();
        var minimumStep =
          typeof configuredDecimals === 'number' && isFinite(configuredDecimals)
            ? (configuredDecimals > 0 ? Math.pow(10, -configuredDecimals) : 1)
            : 0;
        return Math.max(minimumStep * 2, span * MARKET_PRICE_BADGE_RECOVERY_BUFFER_RATIO);
      }

      function rangeContainsMarketPriceBadges(range, referenceRange) {
        var normalized = normalizePriceRange(range);
        if (!normalized) {
          return true;
        }
        var reference = normalizePriceRange(referenceRange);
        var marketPrices = getMarketPriceBadgeValues();
        var recoveryBuffer = resolveMarketPriceBadgeRecoveryBuffer(reference || normalized);
        for (var i = 0; i < marketPrices.length; i += 1) {
          var price = marketPrices[i];
          if (reference && !isMarketPriceNearRange(price, reference)) {
            continue;
          }
          if (price < normalized.from - recoveryBuffer || price > normalized.to + recoveryBuffer) {
            return false;
          }
        }
        return true;
      }

      function resolveMarketAnchoredVisiblePriceRange(visibleBars, rawRange) {
        if (!visibleBars || visibleBars.length === 0 || !isValidPriceRange(rawRange)) {
          return null;
        }
        var rawSpan = getPriceRangeSpan(rawRange);
        if (!(rawSpan > 0)) {
          return null;
        }
        var marketPrices = getMarketPriceBadgeValues();
        if (marketPrices.length === 0) {
          return null;
        }

        var bestBars = [];
        for (var marketIndex = 0; marketIndex < marketPrices.length; marketIndex += 1) {
          var marketPrice = marketPrices[marketIndex];
          var tolerance = Math.max(
            Math.abs(marketPrice) * PRICE_SCALE_ROBUST_MARKET_CLUSTER_RELATIVE_TOLERANCE,
            1e-9
          );
          var candidateBars = [];
          for (var barIndex = 0; barIndex < visibleBars.length; barIndex += 1) {
            var bar = visibleBars[barIndex];
            var center = getBarPriceCenter(bar);
            if (isFinite(center) && Math.abs(center - marketPrice) <= tolerance) {
              candidateBars.push(bar);
            }
          }
          if (candidateBars.length > bestBars.length) {
            bestBars = candidateBars;
          }
        }

        if (bestBars.length < PRICE_SCALE_ROBUST_MARKET_CLUSTER_MIN_BARS) {
          return null;
        }

        var marketRange = resolvePriceRangeFromBars(bestBars);
        if (!isValidPriceRange(marketRange)) {
          return null;
        }
        var marketSpan = getPriceRangeSpan(marketRange);
        return rawSpan > marketSpan * PRICE_SCALE_ROBUST_MARKET_CLUSTER_SPAN_MULTIPLE
          ? marketRange
          : null;
      }

      function resolveRobustVisiblePriceRange(visibleBars, rawRange) {
        if (!visibleBars || visibleBars.length === 0 || !isValidPriceRange(rawRange)) {
          return rawRange;
        }
        var rawSpan = getPriceRangeSpan(rawRange);

        var marketAnchoredRange = resolveMarketAnchoredVisiblePriceRange(visibleBars, rawRange);
        if (marketAnchoredRange) {
          return marketAnchoredRange;
        }

        var trimmedRange = resolveTrimmedPriceRangeFromBars(visibleBars);
        var trimmedSpan = getPriceRangeSpan(trimmedRange);
        if (trimmedRange && trimmedSpan > 0 && rawSpan > trimmedSpan * PRICE_SCALE_ROBUST_TRIM_SPAN_MULTIPLE) {
          return trimmedRange;
        }

        if (visibleBars.length < PRICE_SCALE_ROBUST_CLUSTER_MIN_BARS) {
          return rawRange;
        }

        var centers = [];
        for (var i = 0; i < visibleBars.length; i += 1) {
          var center = getBarPriceCenter(visibleBars[i]);
          if (isFinite(center) && center > 0) {
            centers.push(center);
          }
        }
        if (centers.length < PRICE_SCALE_ROBUST_CLUSTER_MIN_BARS) {
          return rawRange;
        }

        centers.sort(function(left, right) { return left - right; });
        var bestStart = 0;
        var bestEnd = 0;
        var start = 0;
        for (var end = 0; end < centers.length; end += 1) {
          while (
            start < end &&
            centers[end] - centers[start] >
              Math.max(Math.abs(centers[start]) * PRICE_SCALE_ROBUST_CLUSTER_RELATIVE_TOLERANCE, 1e-9)
          ) {
            start += 1;
          }
          if (end - start > bestEnd - bestStart) {
            bestStart = start;
            bestEnd = end;
          }
        }

        var keepCount = bestEnd - bestStart + 1;
        if (keepCount < PRICE_SCALE_ROBUST_CLUSTER_MIN_BARS) {
          return rawRange;
        }
        if (keepCount / centers.length < PRICE_SCALE_ROBUST_CLUSTER_KEEP_RATIO) {
          return rawRange;
        }

        var clusterMin = centers[bestStart];
        var clusterMax = centers[bestEnd];
        var clusterBars = [];
        for (var barIndex = 0; barIndex < visibleBars.length; barIndex += 1) {
          var barCenter = getBarPriceCenter(visibleBars[barIndex]);
          if (isFinite(barCenter) && barCenter >= clusterMin && barCenter <= clusterMax) {
            clusterBars.push(visibleBars[barIndex]);
          }
        }

        var clusterRange = resolvePriceRangeFromBars(clusterBars);
        if (!isValidPriceRange(clusterRange)) {
          return rawRange;
        }

        var clusterTrimmedRange = resolveTrimmedPriceRangeFromBars(clusterBars);
        var clusterTrimmedSpan = getPriceRangeSpan(clusterTrimmedRange);
        if (
          clusterTrimmedRange &&
          clusterTrimmedSpan > 0 &&
          rawSpan > clusterTrimmedSpan * PRICE_SCALE_ROBUST_TRIM_SPAN_MULTIPLE
        ) {
          return clusterTrimmedRange;
        }

        var clusterSpan = getPriceRangeSpan(clusterRange);
        return rawSpan > clusterSpan * PRICE_SCALE_ROBUST_CLUSTER_SPAN_MULTIPLE
          ? clusterRange
          : rawRange;
      }

      function getVisibleBackendCandleBars() {
        if (!lastRawSeriesData || lastRawSeriesData.length === 0) {
          return [];
        }

        var fromIndex = 0;
        var toIndex = lastRawSeriesData.length - 1;
        try {
          var logicalRange =
            chart && typeof chart.timeScale === 'function' &&
            chart.timeScale() &&
            typeof chart.timeScale().getVisibleLogicalRange === 'function'
              ? chart.timeScale().getVisibleLogicalRange()
              : null;
          if (
            logicalRange &&
            typeof logicalRange.from === 'number' &&
            typeof logicalRange.to === 'number' &&
            isFinite(logicalRange.from) &&
            isFinite(logicalRange.to)
          ) {
            fromIndex = Math.max(0, Math.floor(logicalRange.from));
            toIndex = Math.min(lastRawSeriesData.length - 1, Math.ceil(logicalRange.to));
          }
        } catch (_e) {}

        if (toIndex < fromIndex) {
          fromIndex = 0;
          toIndex = lastRawSeriesData.length - 1;
        }

        var visibleBars = [];
        for (var i = fromIndex; i <= toIndex; i += 1) {
          var bar = lastRawSeriesData[i];
          if (bar) {
            visibleBars.push(bar);
          }
        }
        return visibleBars;
      }

      function resolveVisibleCandleDataPriceRange() {
        var visibleBars = getVisibleBackendCandleBars();
        if (!visibleBars || visibleBars.length === 0) {
          return null;
        }
        var rawRange = resolvePriceRangeFromBars(visibleBars);
        return resolveRobustVisiblePriceRange(visibleBars, rawRange);
      }

      function resolvePriceRangeFromVisibleData(includeMarketPriceBadges) {
        var robustRange = resolveVisibleCandleDataPriceRange();
        return includeMarketPriceBadges === false
          ? robustRange
          : expandPriceRangeForMarketPriceBadges(robustRange);
      }

      function resolveVerticalPanStartPriceRange() {
        var priceScaleApi = getRightPriceScaleApi();
        var currentRange =
          priceScaleApi && typeof priceScaleApi.getVisibleRange === 'function'
            ? priceScaleApi.getVisibleRange()
            : null;
        if (isValidPriceRange(currentRange)) {
          return currentRange;
        }
        return resolvePriceRangeFromVisibleData(false);
      }

      function enableRightPriceAutoScale() {
        clearManualPriceScaleState();
        var priceScaleApi = getRightPriceScaleApi();
        if (!priceScaleApi) {
          return;
        }
        applyRightPriceScaleLayoutOptions();
        try {
          if (typeof priceScaleApi.applyOptions === 'function') {
            priceScaleApi.applyOptions({ autoScale: true });
          }
        } catch (_e1) {}
        try {
          if (typeof priceScaleApi.setAutoScale === 'function') {
            priceScaleApi.setAutoScale(true);
          }
        } catch (_e2) {}
      }

      function setRecoveredRightPriceRange(range) {
        var recoveredRange = normalizePriceRange(range);
        if (!recoveredRange) {
          return;
        }
        var priceScaleApi = getRightPriceScaleApi();
        if (!priceScaleApi) {
          return;
        }
        manualPriceScaleRangeActive = false;
        clearManualVerticalPanRange();
        try {
          if (typeof priceScaleApi.setVisibleRange === 'function') {
            priceScaleApi.setVisibleRange({ from: recoveredRange.from, to: recoveredRange.to });
          }
        } catch (_e) {}
      }

      function clearFreshSeriesVerticalCenterState() {
        if (freshSeriesVerticalCenterRaf) {
          try { cancelAnimationFrame(freshSeriesVerticalCenterRaf); } catch (_e) {}
          freshSeriesVerticalCenterRaf = 0;
        }
        freshSeriesVerticalCenterActive = false;
        freshSeriesCenteredPriceRange = null;
      }

      function beginFreshSeriesVerticalCenter() {
        clearFreshSeriesVerticalCenterState();
        freshSeriesVerticalCenterActive = true;
        freshSeriesCenteredPriceRange = null;
      }

      function cancelFreshSeriesVerticalCenter() {
        var hadFreshCenter =
          freshSeriesVerticalCenterActive ||
          isValidPriceRange(freshSeriesCenteredPriceRange);
        clearFreshSeriesVerticalCenterState();
        if (!hadFreshCenter) {
          return;
        }
        syntheticRightPriceScaleFallbackRange = null;
        enableRightPriceAutoScale();
        scheduleOverlayDomRefresh();
      }

      function shouldAllowFreshSeriesVerticalCenter() {
        return Boolean(
          freshSeriesVerticalCenterActive &&
          series &&
          lastRawSeriesData &&
          lastRawSeriesData.length > 0 &&
          !verticalPricePanGestureActive &&
          !manualPriceScaleRangeActive &&
          !activeTradeLineDrag &&
          !isHorizontalScrollMotionActive() &&
          Date.now() > activeHorizontalScrollGestureUntil
        );
      }

      function makeFreshSeriesCenteredPriceRange(dataRange, anchorPrice) {
        var normalizedRange = normalizePriceRange(dataRange);
        if (!normalizedRange || typeof anchorPrice !== 'number' || !isFinite(anchorPrice)) {
          return null;
        }
        // Show the visible DATA range with normal padding and only extend it
        // when the live price would hug an edge. The old behavior mirrored the
        // anchor's distance to the FAR data edge on both sides, which after any
        // trend (live price near one extreme) nearly doubled the span and
        // squashed all candles into half the pane on every fresh-series reload
        // (the "chart shrinks when returning to the chart" bug).
        var dataSpan = getPriceRangeSpan(normalizedRange);
        if (!(dataSpan > 0)) {
          dataSpan = Math.max(Math.abs(anchorPrice || 1) * 0.0008, 1);
        }
        var padding = Math.max(
          dataSpan * FRESH_SERIES_VERTICAL_CENTER_PADDING_RATIO,
          Math.abs(anchorPrice || 1) * 0.0002
        );
        var from = normalizedRange.from - padding;
        var to = normalizedRange.to + padding;
        var edgeMargin = (to - from) * FRESH_SERIES_ANCHOR_EDGE_MARGIN_RATIO;
        if (anchorPrice > to - edgeMargin) {
          to = anchorPrice + edgeMargin;
        }
        if (anchorPrice < from + edgeMargin) {
          from = anchorPrice - edgeMargin;
        }
        if (!(to > from)) {
          return null;
        }
        return normalizePriceRange({
          from: from,
          to: to,
        });
      }

      function centerVisiblePriceScaleForFreshSeries(reason, forceRecompute) {
        try {
          if (!shouldAllowFreshSeriesVerticalCenter()) {
            return false;
          }
          var priceScaleApi = getRightPriceScaleApi();
          if (!priceScaleApi || typeof priceScaleApi.setVisibleRange !== 'function') {
            return false;
          }
          var centeredRange =
            forceRecompute !== true && isValidPriceRange(freshSeriesCenteredPriceRange)
              ? normalizePriceRange(freshSeriesCenteredPriceRange)
              : null;
          if (!centeredRange) {
            var visibleDataRange = resolvePriceRangeFromVisibleData(true);
            var anchorPrice = getBarPriceCenter(lastRawSeriesData[lastRawSeriesData.length - 1]);
            centeredRange = makeFreshSeriesCenteredPriceRange(visibleDataRange, anchorPrice);
          }
          if (!isValidPriceRange(centeredRange)) {
            return false;
          }
          centeredRange = normalizePriceRange(centeredRange);
          try {
            if (typeof priceScaleApi.setAutoScale === 'function') {
              priceScaleApi.setAutoScale(false);
            }
          } catch (_autoScaleErr) {}
          priceScaleApi.setVisibleRange({ from: centeredRange.from, to: centeredRange.to });
          freshSeriesCenteredPriceRange = centeredRange;
          syntheticRightPriceScaleFallbackRange = centeredRange;
          chartDebugLog('[WEBVIEW-CANDLE] center_fresh_series_price_scale', {
            reason: reason || 'fresh_series_center',
            from: centeredRange.from,
            to: centeredRange.to,
          });
          scheduleGestureRightPriceScaleFallbackRefresh();
          scheduleOverlayDomRefresh();
          postChartGeometry();
          return true;
        } catch (_e) {
          return false;
        }
      }

      function scheduleFreshSeriesVerticalCenter(reason, forceRecompute) {
        if (!freshSeriesVerticalCenterActive) {
          return;
        }
        if (freshSeriesVerticalCenterRaf) {
          try { cancelAnimationFrame(freshSeriesVerticalCenterRaf); } catch (_e) {}
          freshSeriesVerticalCenterRaf = 0;
        }
        freshSeriesVerticalCenterRaf = requestAnimationFrame(function() {
          freshSeriesVerticalCenterRaf = 0;
          centerVisiblePriceScaleForFreshSeries(reason || 'fresh_series_center', forceRecompute === true);
        });
      }

      function healCollapsedPriceScaleRange(reason, allowManualReset) {
        try {
          void allowManualReset;
          if (activeTradeLineDrag) {
            return;
          }
          if (!isRightPriceScaleLayoutHealthy()) {
            recoverRightPriceScaleLayout(reason || 'price_scale_health');
          }
          // Automatic health checks may repair an unowned/collapsed axis, but
          // they must never pull an MT5-style user-owned window back to live
          // candles. Only an explicit reset or Auto-scale preference can clear it.
          if (
            verticalPricePanGestureActive ||
            isManualVerticalPanRangePreserved() ||
            isManualVerticalPanRangeLocked() ||
            manualPriceScaleRangeActive
          ) {
            return;
          }
          var priceScaleApi = getRightPriceScaleApi();
          var currentRange =
            priceScaleApi && typeof priceScaleApi.getVisibleRange === 'function'
              ? priceScaleApi.getVisibleRange()
              : null;
          if (!isValidPriceRange(currentRange)) {
            enableRightPriceAutoScale();
            return;
          }
          currentRange = normalizePriceRange(currentRange);

          var candleDataRange = resolvePriceRangeFromVisibleData(false);
          var dataRange = expandPriceRangeForMarketPriceBadges(candleDataRange);
          if (!isValidPriceRange(dataRange)) {
            return;
          }
          dataRange = normalizePriceRange(dataRange);
          candleDataRange = normalizePriceRange(candleDataRange);

          var scaleSpan = getPriceRangeSpan(currentRange);
          var dataSpan = getPriceRangeSpan(dataRange);
          var candleSpan = getPriceRangeSpan(candleDataRange);
          if (!(scaleSpan > 0) || !(dataSpan > 0) || !(candleSpan > 0)) {
            return;
          }
          var dataOverlapRatio = getPriceRangeOverlapRatio(currentRange, dataRange);
          var pixelCompression = resolvePriceRangePixelCompression(dataRange);
          var candlePixelCompression = resolvePriceRangePixelCompression(candleDataRange);
          var dataVisuallyCollapsed = Boolean(pixelCompression && pixelCompression.collapsed);
          var candleDataVisuallyCollapsed = Boolean(candlePixelCompression && candlePixelCompression.collapsed);
          var candleScaleTooWide =
            scaleSpan > candleSpan * PRICE_SCALE_CANDLE_COMPRESSION_SPAN_MULTIPLE;
          var marketPriceBadgesOutOfRange = !rangeContainsMarketPriceBadges(currentRange, candleDataRange);

          // A stale manual price range can be many times wider than the
          // visible OHLC range, or shifted away from it after horizontal
          // navigation. A smaller stale span can still flatten candles on
          // mobile, so also heal when the visible candle range occupies only
          // a tiny vertical pixel band.
          // Heal only the axis; never rewrite candle data.
          if (
            scaleSpan > dataSpan * PRICE_SCALE_HEALTH_SPAN_MULTIPLE ||
            dataSpan > scaleSpan * PRICE_SCALE_HEALTH_SPAN_MULTIPLE ||
            dataOverlapRatio < PRICE_SCALE_HEALTH_MIN_DATA_OVERLAP_RATIO ||
            marketPriceBadgesOutOfRange ||
            dataVisuallyCollapsed ||
            candleDataVisuallyCollapsed ||
            candleScaleTooWide
          ) {
            chartDebugLog('[WEBVIEW-CANDLE] heal_price_scale', {
              reason: reason || 'unknown',
              scaleSpan: scaleSpan,
              dataSpan: dataSpan,
              candleSpan: candleSpan,
              dataOverlapRatio: dataOverlapRatio,
              dataPixelSpan: pixelCompression ? pixelCompression.pixelSpan : null,
              candlePixelSpan: candlePixelCompression ? candlePixelCompression.pixelSpan : null,
              minDataPixelSpan: pixelCompression ? pixelCompression.minPixelSpan : null,
              minCandlePixelSpan: candlePixelCompression ? candlePixelCompression.minPixelSpan : null,
            });
            enableRightPriceAutoScale();
            setRecoveredRightPriceRange(dataRange);
            scheduleOverlayDomRefresh();
            postChartGeometry();
          }
        } catch (_e) {}
      }

      function schedulePriceScaleHealthCheck(reason, allowManualReset, attempts) {
        if (priceScaleHealthRaf) {
          cancelAnimationFrame(priceScaleHealthRaf);
        }
        var remainingAttempts =
          typeof attempts === 'number' && isFinite(attempts)
            ? Math.max(1, Math.round(attempts))
            : 1;
        priceScaleHealthRaf = requestAnimationFrame(function() {
          priceScaleHealthRaf = 0;
          healCollapsedPriceScaleRange(reason, allowManualReset);
          if (remainingAttempts > 1) {
            schedulePriceScaleHealthCheck(reason, allowManualReset, remainingAttempts - 1);
          }
        });
      }

      function recoverOverlayVisibleCandleScale(reason) {
        if (
          activeTradeLineDrag ||
          verticalPricePanGestureActive ||
          isHorizontalScrollMotionActive() ||
          isManualVerticalPanRangePreserved() ||
          isManualVerticalPanRangeLocked() ||
          manualPriceScaleRangeActive
        ) {
          return;
        }
        var candleRange = resolveVisibleCandleDataPriceRange();
        if (!isValidPriceRange(candleRange)) {
          return;
        }
        var visibleRange = expandPriceRangeForMarketPriceBadges(candleRange);
        if (!isValidPriceRange(visibleRange)) {
          return;
        }
        visibleRange = normalizePriceRange(visibleRange);
        setRecoveredRightPriceRange(visibleRange);
        syntheticRightPriceScaleFallbackRange = visibleRange;
        chartDebugLog('[WEBVIEW-CANDLE] recover_overlay_visible_candle_scale', {
          reason: reason || 'overlay',
          from: visibleRange.from,
          to: visibleRange.to,
        });
        scheduleGestureRightPriceScaleFallbackRefresh();
        scheduleOverlayDomRefresh();
        postChartGeometry();
      }

      function scheduleOverlayVisibleCandleScaleRecovery(reason) {
        if (overlayVisibleCandleScaleRecoveryRaf) {
          cancelAnimationFrame(overlayVisibleCandleScaleRecoveryRaf);
        }
        overlayVisibleCandleScaleRecoveryRaf = requestAnimationFrame(function() {
          overlayVisibleCandleScaleRecoveryRaf = 0;
          recoverOverlayVisibleCandleScale(reason || 'overlay_update');
        });
      }

      function isChartScaleGestureSuppressed() {
        return Date.now() <= suppressChartTapUntil;
      }

      function preserveManualVerticalPanRange() {
        manualVerticalPanPreserveUntil = Date.now() + MANUAL_VERTICAL_PAN_PRESERVE_MS;
      }

      function isManualVerticalPanRangePreserved() {
        return Date.now() <= manualVerticalPanPreserveUntil;
      }

      function clearManualVerticalPanRange() {
        if (stopVerticalPanGlideHook) {
          try { stopVerticalPanGlideHook(); } catch (_glideStopErr) {}
        }
        manualVerticalPanRangeActive = false;
        manualVerticalPanLockedRange = null;
        manualPriceScaleReferenceSpan = null;
        manualVerticalPanPreserveUntil = 0;
        syntheticRightPriceScaleFallbackRange = null;
      }

      function clearManualPriceScaleState() {
        manualPriceScaleRangeActive = false;
        verticalPricePanGestureActive = false;
        clearManualVerticalPanRange();
        syntheticRightPriceScaleFallbackRange = null;
      }

      function resetVisiblePriceScaleForFreshSeries(reason) {
        // A fresh series renders exactly where autoscale fits the recent bars
        // (the last candle — and therefore the live price — is always in
        // view). The old beginFreshSeriesVerticalCenter() re-applied an
        // explicit padded range one frame AFTER the correct autoscale paint,
        // which visibly squashed and shifted the chart on every return to the
        // Chart tab before a later refresh restored autoscale. Keeping the
        // mode inactive turns every scheduled recenter into a safe no-op.
        clearFreshSeriesVerticalCenterState();
        clearManualPriceScaleState();
        enableRightPriceAutoScale();
        scheduleOverlayPriceScaleLock(true);
        schedulePriceScaleHealthCheck(reason || 'fresh_series', true, 5);
      }

      function resetVisiblePriceScaleForStableReplacement(reason) {
        void reason;
        clearFreshSeriesVerticalCenterState();
        clearManualPriceScaleState();
        enableRightPriceAutoScale();
      }

      function isCrosshairInteractionActive() {
        var manager = window._drawingManager;
        return !!manager && typeof manager.getActiveTool === 'function' && manager.getActiveTool() === 'crosshair';
      }

      function isDrawingToolInteractionActive() {
        // While a drawing tool is armed (or an existing drawing is being
        // drag-edited), the finger owns the drawing point — the chart body
        // must not vertically pan underneath it, otherwise the price under
        // the finger never changes and every dragged line comes out flat.
        try {
          var manager = window._drawingManager;
          if (!manager) return false;
          if (isCrosshairInteractionActive()) return true;
          if (manager._lineEditState) return true;
          return (
            typeof manager._isDrawingToolActive === 'function' &&
            manager._isDrawingToolActive()
          );
        } catch (_e) {
          return false;
        }
      }

      function isVerticalChartMovementBlocked() {
        return verticalScrollingLocked || chartAutoScaleEnabled || isDrawingToolInteractionActive();
      }

      function resetChartVerticalScale() {
        clearManualPriceScaleState();
        enableRightPriceAutoScale();
        scheduleOverlayPriceScaleLock(true);
        schedulePriceScaleHealthCheck('manual_vertical_scale_reset', true, 3);
        scheduleOverlayDomRefresh();
        postChartGeometry();
      }

      function setChartAutoScaleEnabled(enabled) {
        chartAutoScaleEnabled = enabled === true;
        if (chartAutoScaleEnabled) {
          resetChartVerticalScale();
        }
      }

      function rememberManualVerticalPanRange(range) {
        var normalizedRange = normalizePriceRange(range);
        if (!normalizedRange) {
          return false;
        }
        manualPriceScaleRangeActive = true;
        manualVerticalPanRangeActive = true;
        manualVerticalPanLockedRange = {
          from: normalizedRange.from,
          to: normalizedRange.to,
        };
        preserveManualVerticalPanRange();
        return true;
      }

      function isManualVerticalPanRangeLocked() {
        return manualVerticalPanRangeActive && isValidPriceRange(manualVerticalPanLockedRange);
      }

      function applyManualVerticalPanLockedRange() {
        var lockedRange = normalizePriceRange(manualVerticalPanLockedRange);
        if (!lockedRange) {
          clearManualVerticalPanRange();
          return false;
        }
        var priceScaleApi = getRightPriceScaleApi();
        if (!priceScaleApi || typeof priceScaleApi.setVisibleRange !== 'function') {
          return false;
        }
        manualPriceScaleRangeActive = true;
        // The logical range excludes Lightweight Charts' configured scale
        // margins. Let coordinateToPrice() derive the full rendered axis range
        // instead of publishing the narrower logical range as fallback labels.
        syntheticRightPriceScaleFallbackRange = null;
        try {
          if (typeof priceScaleApi.setAutoScale === 'function') {
            priceScaleApi.setAutoScale(false);
          }
        } catch (_autoScaleErr) {}
        try {
          priceScaleApi.setVisibleRange({ from: lockedRange.from, to: lockedRange.to });
        } catch (_rangeErr) {
          return false;
        }
        scheduleGestureRightPriceScaleFallbackRefresh();
        scheduleOverlayDomRefresh();
        return true;
      }

      function restoreManualPriceScale(snapshot) {
        var restoredRange = normalizePriceRange(snapshot);
        if (!restoredRange) {
          return false;
        }
        var restoredReferenceSpan =
          snapshot &&
          typeof snapshot.referenceSpan === 'number' &&
          isFinite(snapshot.referenceSpan) &&
          snapshot.referenceSpan > 0
            ? snapshot.referenceSpan
            : restoredRange.to - restoredRange.from;
        clearFreshSeriesVerticalCenterState();
        manualPriceScaleReferenceSpan = restoredReferenceSpan;
        rememberManualVerticalPanRange(restoredRange);
        syntheticRightPriceScaleFallbackRange = null;
        if (chart) {
          applyManualVerticalPanLockedRange();
          postChartGeometry();
        }
        return true;
      }

      function isHorizontalScrollMotionActive() {
        return activeHorizontalScrollGesture || horizontalScrollMotionActive;
      }

      function markHorizontalScrollGestureActive() {
        if (activeHorizontalScrollGesture) {
          return;
        }
        cancelFreshSeriesVerticalCenter();
        deferHorizontalGestureDomWork();
        activeHorizontalScrollGesture = true;
        horizontalScrollMotionActive = true;
        activeHorizontalScrollGestureUntil = Date.now() + ACTIVE_SCROLL_PRICE_SCALE_GESTURE_GRACE_MS;
      }

      function finishHorizontalScrollGesture() {
        var shouldSettleHorizontalGesture =
          horizontalScrollMotionActive ||
          visibleRangeIdlePendingAfterGesture ||
          pendingHorizontalOverlayApply;
        activeHorizontalScrollGesture = false;
        activeHorizontalScrollGestureUntil = Date.now() + ACTIVE_SCROLL_PRICE_SCALE_GESTURE_GRACE_MS;
        if (shouldSettleHorizontalGesture) {
          // Lightweight Charts continues with kinetic touch scrolling after
          // pointer-up. Wait for the logical range to become idle before full
          // SVG/DOM, price-scale, overlay, or history work is allowed again.
          visibleRangeIdlePendingAfterGesture = true;
          scheduleVisibleRangeIdleWork();
        }
      }

      function isHorizontalScrollGesturePriceScaleRecoveryEligible() {
        return activeHorizontalScrollGesture || Date.now() <= activeHorizontalScrollGestureUntil;
      }

      function clearActiveScrollPriceScaleRecovery() {
        if (activeScrollPriceScaleRaf) {
          try { cancelAnimationFrame(activeScrollPriceScaleRaf); } catch (_) {}
          activeScrollPriceScaleRaf = 0;
        }
        lastActiveScrollPriceScaleCheckAt = 0;
        activeHorizontalScrollGesture = false;
        horizontalScrollMotionActive = false;
        chartScaleGestureActive = false;
        activeHorizontalScrollGestureUntil = 0;
        visibleRangeIdlePendingAfterGesture = false;
      }

      function preserveManualPriceScaleForHorizontalPan() {
        if (isManualVerticalPanRangeLocked()) {
          applyManualVerticalPanLockedRange();
        }
      }

      function healVisiblePriceScaleDuringActiveScroll(reason) {
        try {
          if (
            verticalPricePanGestureActive ||
            isManualVerticalPanRangePreserved() ||
            activeTradeLineDrag ||
            manualPriceScaleRangeActive ||
            isChartScaleGestureSuppressed() ||
            !isHorizontalScrollGesturePriceScaleRecoveryEligible()
          ) {
            return;
          }
          var priceScaleApi = getRightPriceScaleApi();
          var currentRange =
            priceScaleApi && typeof priceScaleApi.getVisibleRange === 'function'
              ? priceScaleApi.getVisibleRange()
              : null;
          if (!isValidPriceRange(currentRange)) {
            return;
          }
          currentRange = normalizePriceRange(currentRange);

          var candleDataRange = normalizePriceRange(resolvePriceRangeFromVisibleData(false));
          if (!isValidPriceRange(candleDataRange)) {
            return;
          }
          var scaleSpan = getPriceRangeSpan(currentRange);
          var dataSpan = getPriceRangeSpan(candleDataRange);
          if (!(scaleSpan > 0) || !(dataSpan > 0)) {
            return;
          }

          var dataOverlapRatio = getPriceRangeOverlapRatio(currentRange, candleDataRange);
          var pixelCompression = resolvePriceRangePixelCompression(candleDataRange);
          var shouldRecover =
            scaleSpan > dataSpan * ACTIVE_SCROLL_PRICE_SCALE_SPAN_MULTIPLE ||
            dataSpan > scaleSpan * ACTIVE_SCROLL_PRICE_SCALE_SPAN_MULTIPLE ||
            dataOverlapRatio < PRICE_SCALE_HEALTH_MIN_DATA_OVERLAP_RATIO ||
            Boolean(pixelCompression && pixelCompression.collapsed);

          if (!shouldRecover) {
            return;
          }

          chartDebugLog('[WEBVIEW-CANDLE] heal_price_scale_active_scroll', {
            reason: reason || 'visible_range_active',
            scaleSpan: scaleSpan,
            dataSpan: dataSpan,
            dataOverlapRatio: dataOverlapRatio,
            dataPixelSpan: pixelCompression ? pixelCompression.pixelSpan : null,
            minDataPixelSpan: pixelCompression ? pixelCompression.minPixelSpan : null,
          });
          enableRightPriceAutoScale();
          setRecoveredRightPriceRange(candleDataRange);
          scheduleOverlayDomRefresh();
          postChartGeometry();
        } catch (_e) {}
      }

      function scheduleActiveScrollPriceScaleRecovery(reason) {
        if (activeScrollPriceScaleRaf) {
          return;
        }
        if (isHorizontalScrollMotionActive()) {
          // Let Lightweight Charts own active horizontal motion. Price-scale
          // healing can run after touch momentum reaches the idle window.
          return;
        }
        if (isChartScaleGestureSuppressed() || !isHorizontalScrollGesturePriceScaleRecoveryEligible()) {
          return;
        }
        var now = Date.now();
        if (now - lastActiveScrollPriceScaleCheckAt < ACTIVE_SCROLL_PRICE_SCALE_CHECK_INTERVAL_MS) {
          return;
        }
        activeScrollPriceScaleRaf = requestAnimationFrame(function() {
          activeScrollPriceScaleRaf = 0;
          lastActiveScrollPriceScaleCheckAt = Date.now();
          if (!isChartScaleGestureSuppressed()) {
            healVisiblePriceScaleDuringActiveScroll(reason || 'visible_range_active');
          }
        });
      }

      function ensureMarketPriceBadgesVisible() {
        try {
          if (verticalPricePanGestureActive || activeTradeLineDrag || manualPriceScaleRangeActive) {
            return;
          }
          var currentRange = null;
          var priceScaleApi = getRightPriceScaleApi();
          if (priceScaleApi && typeof priceScaleApi.getVisibleRange === 'function') {
            currentRange = priceScaleApi.getVisibleRange();
          }
          if (!isValidPriceRange(currentRange)) {
            return;
          }
          var candleRange = resolvePriceRangeFromVisibleData(false);
          if (rangeContainsMarketPriceBadges(currentRange, candleRange)) {
            return;
          }
          var expandedRange = expandPriceRangeForMarketPriceBadges(candleRange);
          if (!isValidPriceRange(expandedRange)) {
            return;
          }
          enableRightPriceAutoScale();
          setRecoveredRightPriceRange(expandedRange);
          scheduleOverlayDomRefresh();
          postChartGeometry();
        } catch (_e) {}
      }

      function lockVisiblePriceScaleRange(forceAutoScale, attempt) {
        // Previously this function snapshot the current visible price range
        // and called setAutoScale(false) + setVisibleRange(snapshot) — i.e.
        // it FROZE the price axis. That was fine for the initial bootstrap
        // but became a real bug for horizontal panning: scrolling left
        // exposes older bars at different prices, but the frozen range
        // can't accommodate them, so they appear squashed at the edge of
        // the viewport (the "thin line floating in a 50,000-point empty
        // range" symptom the user reported on left-scroll).
        //
        // Normal horizontal pans / zooms keep autoScale enabled so
        // lightweight-charts fits the visible bars. A user-driven vertical
        // candle drag is the exception: it temporarily owns the price range.
        void attempt;
        try {
          if (isManualVerticalPanRangeLocked() && forceAutoScale !== true) {
            applyManualVerticalPanLockedRange();
            postChartGeometry();
            return;
          }
          if (verticalPricePanGestureActive || (manualPriceScaleRangeActive && forceAutoScale !== true)) {
            scheduleOverlayDomRefresh();
            postChartGeometry();
            return;
          }
          if (forceAutoScale !== true && centerVisiblePriceScaleForFreshSeries('overlay_lock', false)) {
            return;
          }
          if (forceAutoScale === true) {
            enableRightPriceAutoScale();
          } else {
            enableRightPriceAutoScale();
          }
          scheduleOverlayDomRefresh();
          postChartGeometry();
        } catch (_e) {}
      }

      function scheduleOverlayPriceScaleLock(forceAutoScale) {
        if (forceAutoScale === true) {
          overlayPriceScaleLockForceAutoScale = true;
        }
        if (overlayPriceScaleLockRaf) {
          return;
        }
        overlayPriceScaleLockRaf = requestAnimationFrame(function() {
          overlayPriceScaleLockRaf = 0;
          var shouldForceAutoScale = overlayPriceScaleLockForceAutoScale;
          overlayPriceScaleLockForceAutoScale = false;
          lockVisiblePriceScaleRange(shouldForceAutoScale, 0);
        });
      }

      function postReady() {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'READY' }));
        } catch (_e) {}
      }

      function postChartReady(initSignature, configSig, dataContextSig) {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'CHART_READY',
            initSignature: initSignature || '',
            configSig: configSig || '',
            dataContextSig: dataContextSig || '',
          }));
        } catch (_e) {}
      }

      function postChartDataPainted(dataContextSig, paintToken) {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'CHART_DATA_PAINTED',
            dataContextSig: dataContextSig || '',
            paintToken: paintToken || '',
          }));
        } catch (_e) {}
      }

      function postChartContextActivated(requestId, dataContextSig, paintToken, hit) {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'CHART_CONTEXT_ACTIVATED',
            requestId:
              typeof requestId === 'string' || typeof requestId === 'number'
                ? requestId
                : null,
            dataContextSig: dataContextSig || '',
            paintToken: paintToken || '',
            hit: hit === true,
          }));
        } catch (_e) {}
      }

      function retryChartDataPaintAcknowledgement(dataContextSig, paintToken) {
        var requestedDataContextSig =
          typeof dataContextSig === 'string' ? dataContextSig : '';
        var requestedPaintToken = typeof paintToken === 'string' ? paintToken : '';
        if (
          !series ||
          currentSeriesLength <= 0 ||
          !requestedDataContextSig ||
          requestedDataContextSig !== lastInitDataContextSig ||
          !requestedPaintToken ||
          requestedPaintToken !== lastAppliedChartDataPaintToken
        ) {
          return false;
        }
        postChartDataPainted(requestedDataContextSig, requestedPaintToken);
        return true;
      }

      function postChartGeometry() {
        if (!chart) {
          return;
        }
        try {
          var metrics = resolvePrimaryPaneMetrics();
          var visiblePriceRange = resolveRightPriceScaleFallbackRange();
          var manualPriceRange = isManualVerticalPanRangeLocked()
            ? normalizePriceRange(manualVerticalPanLockedRange)
            : null;
          var manualReferenceSpan =
            typeof manualPriceScaleReferenceSpan === 'number' &&
            isFinite(manualPriceScaleReferenceSpan) &&
            manualPriceScaleReferenceSpan > 0
              ? manualPriceScaleReferenceSpan
              : (isValidPriceRange(manualPriceRange)
                ? manualPriceRange.to - manualPriceRange.from
                : null);
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'CHART_GEOMETRY',
            dataContextSig: lastInitDataContextSig || '',
            plotArea: {
              left: metrics.leftAxisWidth,
              top: metrics.plotTop,
              width: metrics.paneWidth,
              height: metrics.plotHeight,
            },
            priceRange: isValidPriceRange(visiblePriceRange)
              ? { from: visiblePriceRange.from, to: visiblePriceRange.to }
              : null,
            manualPriceScale: isValidPriceRange(manualPriceRange)
              ? {
                from: manualPriceRange.from,
                to: manualPriceRange.to,
                referenceSpan: manualReferenceSpan,
              }
              : null,
          }));
          scheduleMovingVerticalGridUpdate();
          scheduleChartAxisDividersUpdate();
        } catch (_e) {}
      }

      function postChartTap(x, y, price) {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'CHART_TAP',
            dataContextSig: lastInitDataContextSig || '',
            x: x,
            y: y,
            price: typeof price === 'number' && isFinite(price) ? price : null,
          }));
        } catch (_e) {}
      }

      function postChartDoubleTap(x, y, price) {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'CHART_DOUBLE_TAP',
            dataContextSig: lastInitDataContextSig || '',
            x: x,
            y: y,
            price: typeof price === 'number' && isFinite(price) ? price : null,
          }));
        } catch (_e) {}
      }

      function setChartWindowSplitMode(enabled) {
        var nextEnabled = enabled === true;
        if (chartWindowSplitMode !== nextEnabled) {
          chartWindowSplitMode = nextEnabled;
          chartWindowSplitModeRevision += 1;
        }
      }

      function postChartTouchState(active) {
        var nextActive = !!active;
        if (lastPostedChartTouchActive === nextActive) {
          return;
        }
        lastPostedChartTouchActive = nextActive;
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'CHART_TOUCH_STATE',
            active: nextActive,
          }));
        } catch (_e) {}
      }

      function resolveChartTouchInteractionOptions(enabled) {
        var handleScroll = cloneSerializableValue(
          (lastInitHostOptions && lastInitHostOptions.handleScroll) || {},
          {}
        );
        var handleScale = cloneSerializableValue(
          (lastInitHostOptions && lastInitHostOptions.handleScale) || {},
          {}
        );

        if (!enabled || isDrawingToolInteractionActive()) {
          handleScroll.mouseWheel = false;
          handleScroll.pressedMouseMove = false;
          handleScroll.horzTouchDrag = false;
          handleScroll.vertTouchDrag = false;
          handleScale.mouseWheel = false;
          handleScale.pinch = false;
          handleScale.axisPressedMouseMove = false;
        }
        // RTX5 owns chart-body vertical panning so it can keep the final
        // user-owned price range stable. The touchmove path itself stays
        // lightweight and defers custom DOM labels until release.
        handleScroll.vertTouchDrag = false;

        return {
          handleScroll: handleScroll,
          handleScale: handleScale,
        };
      }

      function applyChartTouchInteractionState(enabled) {
        if (!chart || typeof chart.applyOptions !== 'function') {
          return;
        }
        try {
          chart.applyOptions(resolveChartTouchInteractionOptions(enabled));
        } catch (_e) {}
      }

      function suspendChartTouchInteractions() {
        chartTouchInteractionSuspendDepth += 1;
        if (chartTouchInteractionSuspendDepth === 1) {
          applyChartTouchInteractionState(false);
        }
      }

      function restoreChartTouchInteractions() {
        if (chartTouchInteractionSuspendDepth <= 0) {
          chartTouchInteractionSuspendDepth = 0;
          applyChartTouchInteractionState(true);
          return;
        }
        chartTouchInteractionSuspendDepth -= 1;
        if (chartTouchInteractionSuspendDepth === 0) {
          applyChartTouchInteractionState(true);
        }
      }

      function postDistinctChartTap(x, y, price) {
        if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) {
          return;
        }
        var now = Date.now();
        if (now <= suppressChartTapUntil) {
          return;
        }
        try {
          if (typeof window.__rtx5SuppressChartTapUntil === 'number' && now <= window.__rtx5SuppressChartTapUntil) {
            return;
          }
        } catch (_suppressCrosshairTapErr) {}
        if (
          isFinite(lastPostedChartTap.x) &&
          isFinite(lastPostedChartTap.y) &&
          Math.abs(lastPostedChartTap.x - x) <= 8 &&
          Math.abs(lastPostedChartTap.y - y) <= 8 &&
          now - lastPostedChartTap.at <= 250
        ) {
          return;
        }
        lastPostedChartTap = { x: x, y: y, at: now };
        postChartTap(x, y, price);
      }

      function emitChartTapAtPoint(x, y) {
        if (!series || typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) {
          return;
        }
        var price = null;
        if (typeof series.coordinateToPrice === 'function') {
          var nextPrice = series.coordinateToPrice(y);
          if (typeof nextPrice === 'number' && isFinite(nextPrice)) {
            price = nextPrice;
          }
        }
        postDistinctChartTap(x, y, price);
      }

      function emitChartDoubleTapAtPoint(x, y) {
        if (!series || typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) {
          return;
        }
        var price = null;
        if (typeof series.coordinateToPrice === 'function') {
          var nextPrice = series.coordinateToPrice(y);
          if (typeof nextPrice === 'number' && isFinite(nextPrice)) {
            price = nextPrice;
          }
        }
        postChartDoubleTap(x, y, price);
      }

      function cancelOverlayDomRefreshFrame() {
        if (overlayRefreshRaf) {
          try { cancelAnimationFrame(overlayRefreshRaf); } catch (_e) {}
          overlayRefreshRaf = 0;
        }
        // Gesture deferral cancels scheduled DOM writes, but leaves the latest
        // market-price request pending for the settle pass.
        cancelMarketPriceScaleDomRefreshSchedule();
      }

      function deferHorizontalGestureDomWork() {
        lastOverlayGestureDeferralActivityAt = Date.now();
        visibleRangeIdlePendingAfterGesture = true;
        cancelOverlayDomRefreshFrame();
        cancelGestureRightPriceScaleFallbackRefresh();
        // Full DOM rebuilds wait for gesture idle, but trade markers must not
        // drift off their real prices meanwhile — keep positions glued.
        scheduleTradeOverlayReposition();
      }

      function deferVerticalGestureDomWork() {
        lastOverlayGestureDeferralActivityAt = Date.now();
        verticalGestureDomWorkPending = true;
        cancelOverlayDomRefreshFrame();
        scheduleGestureRightPriceScaleFallbackRefresh();
        // Right-price-scale drags reach here on every pointermove; the
        // position-only pass keeps trade markers tracking the moving scale.
        scheduleTradeOverlayReposition();
      }

      function refreshVerticalGestureOverlayPositions() {
        // Every rendered vertical-pan frame is real gesture activity, including
        // the post-release kinetic glide. Stamping it here keeps the 3s
        // stranded-gesture watchdog from firing a full overlay rebuild in the
        // middle of a long drag or a long glide.
        lastOverlayGestureDeferralActivityAt = Date.now();
        verticalGestureDomWorkPending = true;
        cancelOverlayDomRefreshFrame();
        scheduleGestureRightPriceScaleFallbackRefresh();
        // A dense position set can contain hundreds of keyed DOM nodes once
        // SL/TP levels are included. Rebuild none of them on pointermove:
        // coalesce the existing nodes into one position-only animation frame,
        // then let the gesture-settle path perform one complete refresh.
        scheduleTradeOverlayReposition();
      }

      function refreshOverlayDomLabelsWhenIdle(payload) {
        if (isHorizontalScrollMotionActive()) {
          deferHorizontalGestureDomWork();
          return;
        }
        if (verticalPricePanGestureActive) {
          deferVerticalGestureDomWork();
          return;
        }
        refreshOverlayDomLabels(payload);
      }

      function applyDeferredHorizontalOverlayPayload() {
        if (!pendingHorizontalOverlayApply) {
          return;
        }
        pendingHorizontalOverlayApply = false;
        applyOverlayPayload(_overlayPayload);
      }

      function applyDeferredVerticalOverlayPayload() {
        if (!pendingVerticalOverlayApply) {
          return;
        }
        pendingVerticalOverlayApply = false;
        applyOverlayPayload(_overlayPayload);
      }

      function scheduleOverlayDomRefresh() {
        // Full overlay work also settles any exact Bid badge deferred by a
        // gesture or a stranded animation frame.
        scheduleMarketPriceScaleDomOnly();
        if (isHorizontalScrollMotionActive()) {
          deferHorizontalGestureDomWork();
          return;
        }
        if (verticalPricePanGestureActive) {
          deferVerticalGestureDomWork();
          return;
        }
        if (overlayRefreshRaf) {
          return;
        }
        overlayRefreshRaf = requestAnimationFrame(function() {
          overlayRefreshRaf = 0;
          refreshOverlayDomLabels(_overlayPayload);
        });
      }

      function scheduleVisibleRangeIdleWork() {
        lastOverlayGestureDeferralActivityAt = Date.now();
        if (activeHorizontalScrollGesture) {
          visibleRangeIdlePendingAfterGesture = true;
          return;
        }
        if (verticalPricePanGestureActive) {
          deferVerticalGestureDomWork();
          return;
        }
        if (visibleRangeIdleTimer !== null) {
          clearTimeout(visibleRangeIdleTimer);
        }
        visibleRangeIdleTimer = setTimeout(function() {
          visibleRangeIdleTimer = null;
          if (
            activeHorizontalScrollGesture ||
            verticalPricePanGestureActive ||
            chartScaleGestureActive ||
            activeTradeLineDrag
          ) {
            visibleRangeIdlePendingAfterGesture = true;
            return;
          }
          var wasHorizontalMotionActive = horizontalScrollMotionActive;
          horizontalScrollMotionActive = false;
          visibleRangeIdlePendingAfterGesture = false;
          if (wasHorizontalMotionActive) {
            activeHorizontalScrollGestureUntil = Date.now() + ACTIVE_SCROLL_PRICE_SCALE_GESTURE_GRACE_MS;
          }
          applyDeferredHorizontalOverlayPayload();
          scheduleMovingVerticalGridUpdate(false);
          schedulePeriodSeparatorsUpdate(false);
          scheduleActiveScrollPriceScaleRecovery('visible_range_idle');
          scheduleOverlayPriceScaleLock(false);
          schedulePriceScaleHealthCheck('visible_range_change', true);
          scheduleOverlayDomRefresh();
          requestHistoryPaginationForVisibleRange(getVisibleLogicalRangeSnapshot());
        }, 96);
      }

      var chartTradeLineDragDomRefreshTimer = null;
      var chartTradeLineDragDomRefreshFrame = null;
      var lastChartTradeLineDragDomRefreshAt = 0;

      function flushTradeLineDragDomRefresh() {
        chartTradeLineDragDomRefreshTimer = null;
        chartTradeLineDragDomRefreshFrame = null;
        lastChartTradeLineDragDomRefreshAt = Date.now();
        refreshOverlayDomLabels(_overlayPayload);
        renderTradeLineMagnifier();
      }

      function scheduleTradeLineDragDomRefresh() {
        if (chartTradeLineDragDomRefreshTimer !== null || chartTradeLineDragDomRefreshFrame !== null) {
          return;
        }
        var now = Date.now();
        var delay = Math.max(
          0,
          CHART_TRADE_LINE_DRAG_DOM_REFRESH_INTERVAL_MS - (now - lastChartTradeLineDragDomRefreshAt)
        );
        var scheduleFrame = function() {
          chartTradeLineDragDomRefreshTimer = null;
          chartTradeLineDragDomRefreshFrame = requestAnimationFrame(flushTradeLineDragDomRefresh);
        };
        if (delay > 0) {
          chartTradeLineDragDomRefreshTimer = setTimeout(scheduleFrame, delay);
          return;
        }
        scheduleFrame();
      }

      function bindChartTapListeners(el) {
        if (!el) return;
        if (typeof detachChartTapListeners === 'function') {
          try { detachChartTapListeners(); } catch (_e) {}
        }

        var getClientPoint = function(event) {
          if (!event) return null;
          if (typeof event.clientX === 'number' && typeof event.clientY === 'number') {
            return { x: event.clientX, y: event.clientY };
          }
          var touch =
            (event.changedTouches && event.changedTouches[0]) ||
            (event.touches && event.touches[0]);
          if (touch && typeof touch.clientX === 'number' && typeof touch.clientY === 'number') {
            return { x: touch.clientX, y: touch.clientY };
          }
          return null;
        };

        var getRelativePoint = function(clientX, clientY) {
          var rect = el.getBoundingClientRect();
          var x = clientX - rect.left;
          var y = clientY - rect.top;
          if (!isFinite(x) || !isFinite(y)) return null;
          if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
          return { x: x, y: y };
        };

        // Same as getRelativePoint but clamps to the chart viewport instead
        // of returning null when the finger crosses an edge. Used during
        // active drags so the line keeps following the finger smoothly even
        // when dragged past the top/bottom of the plot area.
        var getClampedRelativePoint = function(clientX, clientY) {
          var rect = el.getBoundingClientRect();
          if (!isFinite(clientX) || !isFinite(clientY)) return null;
          var x = Math.max(0, Math.min(rect.width, clientX - rect.left));
          var y = Math.max(0, Math.min(rect.height, clientY - rect.top));
          return { x: x, y: y };
        };

        var getTradeLineDragPoint = function(clientX, clientY) {
          var rect = el.getBoundingClientRect();
          if (!isFinite(clientX) || !isFinite(clientY)) return null;
          var maxVerticalOverscroll = Math.max(1, rect.height || 1);
          var x = Math.max(0, Math.min(rect.width, clientX - rect.left));
          var y = Math.max(-maxVerticalOverscroll, Math.min((rect.height || 0) + maxVerticalOverscroll, clientY - rect.top));
          return { x: x, y: y };
        };

        var resolveTradeLineDragPrice = function(point) {
          if (!point || !series || typeof series.coordinateToPrice !== 'function') {
            return null;
          }
          var coordinatePrice = sanitizeOverlayDragPrice(series.coordinateToPrice(point.y));
          if (typeof coordinatePrice === 'number' && isFinite(coordinatePrice) && coordinatePrice > 0) {
            return coordinatePrice;
          }
          var lock = activeTradeLineDrag && activeTradeLineDrag.priceScaleRangeLock;
          if (!isValidPriceRange(lock)) {
            return null;
          }
          var metrics = resolvePrimaryPaneMetrics();
          var plotHeight = metrics && typeof metrics.plotHeight === 'number' && metrics.plotHeight > 0 ? metrics.plotHeight : 0;
          if (!plotHeight) {
            return null;
          }
          var plotTop = metrics.plotTop || 0;
          var normalizedY = (point.y - plotTop) / plotHeight;
          var price = lock.to - normalizedY * (lock.to - lock.from);
          return sanitizeOverlayDragPrice(price);
        };

        var stopChartEvent = function(event) {
          if (!event) return;
          if (typeof event.preventDefault === 'function') {
            event.preventDefault();
          }
          if (typeof event.stopPropagation === 'function') {
            event.stopPropagation();
          }
        };

        // ── Vertical candle panning state ──
        // When the user drags vertically on the chart area, we disable
        // auto-scale and shift the visible price range. This makes the
        // candles move up/down while the chart container stays fixed.
        var supportsPointerEvents = typeof window.PointerEvent === 'function';
        var activePointerIds = {};
        var activePointerCount = 0;
        var CHART_SCALE_TAP_SUPPRESSION_MS = 1200;
        // Set when ≥2 fingers are ever down in a single gesture; cleared when
        // all fingers lift. Prevents a tap firing after a slow pinch-zoom where
        // the time-based suppression window already expired.
        var gestureHadMultitouch = false;

        var countActivePointers = function() {
          var count = 0;
          for (var key in activePointerIds) {
            if (Object.prototype.hasOwnProperty.call(activePointerIds, key)) {
              count += 1;
            }
          }
          return count;
        };

        var rememberPointerDown = function(event) {
          if (!supportsPointerEvents || !event || event.pointerId === undefined || event.pointerId === null) {
            return;
          }
          activePointerIds[String(event.pointerId)] = true;
          activePointerCount = countActivePointers();
          if (activePointerCount >= 2) {
            gestureHadMultitouch = true;
          }
        };

        var releasePointer = function(event) {
          if (!supportsPointerEvents || !event || event.pointerId === undefined || event.pointerId === null) {
            activePointerCount = 0;
            return;
          }
          delete activePointerIds[String(event.pointerId)];
          activePointerCount = countActivePointers();
        };

        var getTouchCount = function(event) {
          if (!event) return 0;
          if (event.touches && typeof event.touches.length === 'number') {
            return event.touches.length;
          }
          if (event.targetTouches && typeof event.targetTouches.length === 'number') {
            return event.targetTouches.length;
          }
          return 0;
        };

        var isScaleGestureEvent = function(event) {
          return (
            getTouchCount(event) > 1 ||
            activePointerCount > 1 ||
            (supportsPointerEvents && event && event.isPrimary === false)
          );
        };

        var suppressChartTapAfterScale = function() {
          suppressChartTapUntil = Date.now() + CHART_SCALE_TAP_SUPPRESSION_MS;
          pendingPointerTap = null;
          vertPanPending = null;
        };

        var vertPanState = null; // { startY, startRange, latestRange, pricePerPixel, lastMoveY, lastMoveAt, velocityPxMs }
        var VERT_PAN_THRESHOLD = 6; // px before we commit to a vertical pan
        var VERT_PAN_PRICE_DELTA_MULTIPLIER = 1;
        // MT5-style kinetic vertical glide. One finger-drag is limited to
        // roughly a screen-height of price travel, which made far-away areas
        // (long-ago trade entries) take dozens of swipes to reach. A fling now
        // continues the pan with decaying velocity, so vertical reach is
        // unlimited — repeated flings compound, and any touch stops the glide.
        var VERT_PAN_GLIDE_MIN_VELOCITY_PX_MS = 0.25;
        var VERT_PAN_GLIDE_MAX_VELOCITY_PX_MS = 5;
        var VERT_PAN_GLIDE_DECAY_PER_FRAME = 0.97;
        var VERT_PAN_GLIDE_STOP_VELOCITY_PX_MS = 0.02;
        var vertPanGlide = null; // { v, lastAt, pricePerPixel, range, raf }
        var vertPanPending = null; // { startX, startY } - waiting for threshold
        var rightPriceScaleGestureActive = false;
        var rightPriceScaleGestureState = null; // { startX, startY, startRange, latestRange, anchorRatio, referenceSpan, plotHeight, minMove, moved, pointerId, previousTouchAction }
        var RIGHT_PRICE_SCALE_DRAG_THRESHOLD_PX = 3;
        var lastCompletedChartTap = null;
        var lastCompletedRightPriceScaleTap = null;
        var CHART_DOUBLE_TAP_MAX_DELAY_MS = 350;
        var CHART_DOUBLE_TAP_MAX_DISTANCE_PX = 24;

        var clearCompletedChartTap = function() {
          lastCompletedChartTap = null;
        };

        var consumeCompletedChartTap = function(point, completedAt) {
          if (
            !point ||
            typeof point.x !== 'number' ||
            typeof point.y !== 'number' ||
            !isFinite(point.x) ||
            !isFinite(point.y) ||
            typeof completedAt !== 'number' ||
            !isFinite(completedAt)
          ) {
            clearCompletedChartTap();
            return false;
          }
          var previousTap = lastCompletedChartTap;
          var elapsed = previousTap ? completedAt - previousTap.at : Infinity;
          var dx = previousTap ? point.x - previousTap.x : Infinity;
          var dy = previousTap ? point.y - previousTap.y : Infinity;
          var maxDistanceSquared =
            CHART_DOUBLE_TAP_MAX_DISTANCE_PX * CHART_DOUBLE_TAP_MAX_DISTANCE_PX;
          var isDoubleTap =
            !!previousTap &&
            previousTap.splitMode === chartWindowSplitMode &&
            previousTap.splitModeRevision === chartWindowSplitModeRevision &&
            previousTap.dataContextSig === lastInitDataContextSig &&
            elapsed >= 0 &&
            elapsed <= CHART_DOUBLE_TAP_MAX_DELAY_MS &&
            dx * dx + dy * dy <= maxDistanceSquared;
          lastCompletedChartTap = isDoubleTap
            ? null
            : {
              x: point.x,
              y: point.y,
              at: completedAt,
              splitMode: chartWindowSplitMode,
              splitModeRevision: chartWindowSplitModeRevision,
              dataContextSig: lastInitDataContextSig
            };
          return isDoubleTap;
        };

        var clearCompletedRightPriceScaleTap = function() {
          lastCompletedRightPriceScaleTap = null;
        };

        var consumeCompletedRightPriceScaleTap = function(point, completedAt) {
          if (
            !point ||
            typeof point.x !== 'number' ||
            typeof point.y !== 'number' ||
            !isFinite(point.x) ||
            !isFinite(point.y) ||
            typeof completedAt !== 'number' ||
            !isFinite(completedAt)
          ) {
            clearCompletedRightPriceScaleTap();
            return false;
          }
          var previousTap = lastCompletedRightPriceScaleTap;
          var elapsed = previousTap ? completedAt - previousTap.at : Infinity;
          var dx = previousTap ? point.x - previousTap.x : Infinity;
          var dy = previousTap ? point.y - previousTap.y : Infinity;
          var maxDistanceSquared =
            CHART_DOUBLE_TAP_MAX_DISTANCE_PX * CHART_DOUBLE_TAP_MAX_DISTANCE_PX;
          var isDoubleTap =
            !!previousTap &&
            elapsed >= 0 &&
            elapsed <= CHART_DOUBLE_TAP_MAX_DELAY_MS &&
            dx * dx + dy * dy <= maxDistanceSquared;
          lastCompletedRightPriceScaleTap = isDoubleTap
            ? null
            : { x: point.x, y: point.y, at: completedAt };
          return isDoubleTap;
        };

        var isRightPriceScaleGesturePoint = function(clientX, clientY) {
          var point = getRelativePoint(clientX, clientY);
          if (!point) return false;
          // The owned/custom price labels span the full pane, including the
          // visual area reserved below candles for move bars.
          var metrics = resolveFallbackPlotMetrics();
          // Use the exact same fallback geometry that paints the visible axis.
          // On Android Lightweight Charts can report rightAxisWidth=0 while
          // RTX5 still renders its owned 62px strip at the right edge. Using
          // leftAxisWidth + paneWidth in that state places the hit target at
          // chartWidth (offscreen), so every visible axis swipe is missed.
          var axisMetrics = resolveRightPriceScaleFallbackAxisMetrics(metrics);
          var chartWidth = Math.max(0, axisMetrics.chartWidth || el.clientWidth || 0);
          var axisLeft = Math.max(0, Math.min(chartWidth, axisMetrics.axisLeft || 0));
          var axisWidth = Math.max(0, Math.round(axisMetrics.axisWidth || 0));
          var axisRight = Math.min(chartWidth, axisLeft + axisWidth);
          var plotTop = Math.max(0, Math.round(metrics.plotTop || 0));
          var plotBottom = Math.max(
            plotTop + 1,
            Math.round(plotTop + (metrics.plotHeight || metrics.paneHeight || el.clientHeight || 0))
          );
          return point.x >= axisLeft - 6 && point.x <= axisRight + 4 && point.y >= plotTop && point.y <= plotBottom;
        };

        var beginRightPriceScaleGesture = function(event, clientX, clientY) {
          if (isVerticalChartMovementBlocked()) return false;
          var relativePoint = getRelativePoint(clientX, clientY);
          if (!relativePoint) return false;
          var range = normalizePriceRange(resolveVerticalPanStartPriceRange());
          if (!range) return false;
          var startSpan = range.to - range.from;
          if (!(startSpan > 0)) return false;
          var metrics = resolveFallbackPlotMetrics();
          var plotTop = Math.max(0, Number(metrics.plotTop) || 0);
          var plotHeight = Math.max(1, Number(metrics.plotHeight || metrics.paneHeight) || 0);
          var precision =
            typeof lastDisplayDecimals === 'number' && isFinite(lastDisplayDecimals)
              ? Math.max(0, Math.min(10, Math.round(lastDisplayDecimals)))
              : 2;
          var minMove = 1 / Math.pow(10, precision);
          var referenceSpan =
            typeof manualPriceScaleReferenceSpan === 'number' && manualPriceScaleReferenceSpan > 0
              ? manualPriceScaleReferenceSpan
              : startSpan;
          // The owned axis interpolates a height-derived number of labels over
          // the full coordinate range. Project that rendered range back into
          // Lightweight Charts' logical range so maximum zoom is exactly one
          // displayed decimal unit between every neighboring label. This also
          // accounts for candle/volume scale margins and short/tall panes.
          var coordinateRange = normalizePriceRange(resolveRightPriceScaleCoordinateRange());
          var coordinateSpan = coordinateRange ? coordinateRange.to - coordinateRange.from : 0;
          var fallbackLabelIntervals = Math.max(
            1,
            resolveRightPriceScaleFallbackLabelCount(metrics) - 1
          );
          var priceScaleProjection =
            coordinateSpan > 0 && startSpan > 0 ? coordinateSpan / startSpan : 0;
          var minimumSpan =
            priceScaleProjection > 0 && isFinite(priceScaleProjection)
              ? (minMove * fallbackLabelIntervals) / priceScaleProjection
              : minMove * MT5_PRICE_SCALE_MIN_VISIBLE_TICK_INTERVALS;
          var anchorPrice =
            series && typeof series.coordinateToPrice === 'function'
              ? series.coordinateToPrice(relativePoint.y)
              : null;
          var anchorRatio =
            typeof anchorPrice === 'number' && isFinite(anchorPrice)
              ? (range.to - anchorPrice) / startSpan
              : (relativePoint.y - plotTop) / plotHeight;

          clearFreshSeriesVerticalCenterState();
          clearCompletedChartTap();
          if (overlayPriceScaleLockRaf) {
            cancelAnimationFrame(overlayPriceScaleLockRaf);
            overlayPriceScaleLockRaf = 0;
          }
          overlayPriceScaleLockForceAutoScale = false;
          if (priceScaleHealthRaf) {
            cancelAnimationFrame(priceScaleHealthRaf);
            priceScaleHealthRaf = 0;
          }
          var capturedPointerId = null;
          if (
            event &&
            typeof event.pointerId === 'number' &&
            typeof el.setPointerCapture === 'function'
          ) {
            try {
              el.setPointerCapture(event.pointerId);
              capturedPointerId = event.pointerId;
            } catch (_captureErr) {}
          }
          var previousTouchAction = el.style.touchAction;
          el.style.touchAction = 'none';
          rightPriceScaleGestureState = {
            startX: clientX,
            startY: clientY,
            startRange: { from: range.from, to: range.to },
            latestRange: { from: range.from, to: range.to },
            anchorRatio: anchorRatio,
            minMove: minMove,
            minimumSpan: minimumSpan,
            plotHeight: plotHeight,
            referenceSpan: referenceSpan,
            moved: false,
            pointerId: capturedPointerId,
            previousTouchAction: previousTouchAction,
          };
          rightPriceScaleGestureActive = true;
          verticalPricePanGestureActive = true;
          pendingPointerTap = null;
          vertPanState = null;
          vertPanPending = null;
          deferVerticalGestureDomWork();
          return true;
        };

        var beginVerticalPan = function(clientY) {
          if (isVerticalChartMovementBlocked()) return false;
          if (!chart || !series) return false;
          var priceScaleApi = getRightPriceScaleApi();
          if (!priceScaleApi) return false;
          var range = resolveVerticalPanStartPriceRange();
          if (!isValidPriceRange(range)) return false;
          clearFreshSeriesVerticalCenterState();
          verticalPricePanGestureActive = true;
          clearCompletedChartTap();
          deferVerticalGestureDomWork();
          rememberManualVerticalPanRange(range);
          if (overlayPriceScaleLockRaf) {
            cancelAnimationFrame(overlayPriceScaleLockRaf);
            overlayPriceScaleLockRaf = 0;
          }
          // A cancelled forced-lock frame must not leak into the next normal
          // lock request and reset this user-owned range after finger-up.
          overlayPriceScaleLockForceAutoScale = false;
          if (priceScaleHealthRaf) {
            cancelAnimationFrame(priceScaleHealthRaf);
            priceScaleHealthRaf = 0;
          }
          if (visibleRangeIdleTimer !== null) {
            clearTimeout(visibleRangeIdleTimer);
            visibleRangeIdleTimer = null;
          }
          var metrics = resolvePrimaryPaneMetrics();
          var chartElement = document.getElementById('chart');
          // Cache the drawable candle-pane height once per gesture. Measuring
          // the DOM on every move was a big part of the vertical stutter.
          var chartHeight =
            metrics && typeof metrics.plotHeight === 'number' && metrics.plotHeight > 0
              ? metrics.plotHeight
              : (chartElement ? chartElement.clientHeight : window.innerHeight);
          if (!(chartHeight > 0)) return false;
          var rangeSpan = range.to - range.from;
          vertPanState = {
            startY: clientY,
            startAt: Date.now(),
            startRange: { from: range.from, to: range.to },
            latestRange: { from: range.from, to: range.to },
            pricePerPixel: rangeSpan / chartHeight,
          };
          syntheticRightPriceScaleFallbackRange = null;
          // Disable auto-scale so our manual range adjustments stick.
          if (typeof priceScaleApi.setAutoScale === 'function') {
            priceScaleApi.setAutoScale(false);
          }
          if (typeof priceScaleApi.setVisibleRange === 'function') {
            priceScaleApi.setVisibleRange({ from: range.from, to: range.to });
          }
          return true;
        };

        var renderVerticalPanRange = function(nextRange) {
          if (!isValidPriceRange(nextRange)) return false;
          var priceScaleApi = getRightPriceScaleApi();
          if (!priceScaleApi || typeof priceScaleApi.setVisibleRange !== 'function') return false;
          syntheticRightPriceScaleFallbackRange = null;
          rememberManualVerticalPanRange(nextRange);
          if (typeof priceScaleApi.setAutoScale === 'function') {
            try { priceScaleApi.setAutoScale(false); } catch (_autoScaleErr) {}
          }
          priceScaleApi.setVisibleRange(nextRange);
          // MT5 parity: the price line moves with the visible range, and its
          // label/right-axis price box must follow during the active drag.
          refreshVerticalGestureOverlayPositions();
          return true;
        };

        var applyRightPriceScaleGestureAt = function(clientY) {
          var state = rightPriceScaleGestureState;
          if (!state || typeof clientY !== 'number' || !isFinite(clientY)) return false;
          var deltaY = clientY - state.startY;
          if (!state.moved && Math.abs(deltaY) < RIGHT_PRICE_SCALE_DRAG_THRESHOLD_PX) {
            return false;
          }
          if (!(typeof manualPriceScaleReferenceSpan === 'number' && manualPriceScaleReferenceSpan > 0)) {
            manualPriceScaleReferenceSpan = state.referenceSpan;
          }
          clearCompletedRightPriceScaleTap();
          var nextRange = resolveMt5PriceScaleDragRange({
            startFrom: state.startRange.from,
            startTo: state.startRange.to,
            referenceSpan: state.referenceSpan,
            anchorRatio: state.anchorRatio,
            deltaY: deltaY,
            plotHeight: state.plotHeight,
            minMove: state.minMove,
            minimumSpan: state.minimumSpan,
            octavesPerPlot: MT5_PRICE_SCALE_OCTAVES_PER_PLOT,
            boundOctaves: MT5_PRICE_SCALE_BOUND_OCTAVES,
            maxDragOctaves: MT5_PRICE_SCALE_MAX_DRAG_OCTAVES,
            minVisibleTickIntervals: MT5_PRICE_SCALE_MIN_VISIBLE_TICK_INTERVALS,
          });
          if (!nextRange || !isValidPriceRange(nextRange)) return false;
          state.moved = true;
          state.latestRange = { from: nextRange.from, to: nextRange.to };
          suppressChartTapAfterScale();
          return renderVerticalPanRange(state.latestRange);
        };

        var applyVerticalPanAt = function(clientY) {
          if (!vertPanState || !chart || !series) return;
          // Track fling velocity (px/ms, smoothed) for the kinetic glide.
          var moveNow = Date.now();
          if (typeof vertPanState.lastMoveAt === 'number') {
            var moveDt = moveNow - vertPanState.lastMoveAt;
            if (moveDt > 0 && moveDt < 120) {
              var instantVelocity = (clientY - vertPanState.lastMoveY) / moveDt;
              vertPanState.velocityPxMs =
                typeof vertPanState.velocityPxMs === 'number'
                  ? 0.6 * instantVelocity + 0.4 * vertPanState.velocityPxMs
                  : instantVelocity;
            } else if (moveDt >= 120) {
              // The finger paused — a lift now is a place, not a fling.
              vertPanState.velocityPxMs = 0;
            }
          }
          vertPanState.lastMoveY = clientY;
          vertPanState.lastMoveAt = moveNow;
          // Calculate how much the finger moved in pixels.
          var deltaPixels = clientY - vertPanState.startY;
          // Convert pixel delta to price delta. Dragging up lowers the visible
          // range values; dragging down raises them, matching MT5's chart-body
          // vertical pan direction.
          var priceDelta = deltaPixels * vertPanState.pricePerPixel * VERT_PAN_PRICE_DELTA_MULTIPLIER;
          var nextRange = {
            from: vertPanState.startRange.from + priceDelta,
            to: vertPanState.startRange.to + priceDelta,
          };
          vertPanState.latestRange = nextRange;
          // Apply the range on the touchmove itself. Delaying this through a
          // smoothing RAF made short MT5-style drags collapse into end jumps.
          renderVerticalPanRange(nextRange);
        };

        var stopVerticalPanGlide = function() {
          if (vertPanGlide) {
            if (vertPanGlide.raf) {
              try { cancelAnimationFrame(vertPanGlide.raf); } catch (_e) {}
            }
            vertPanGlide = null;
          }
        };
        stopVerticalPanGlideHook = stopVerticalPanGlide;

        // Kinetic continuation of a vertical fling. Distance is unbounded —
        // the range keeps shifting until the decayed velocity dies out or a
        // touch/reset interrupts it, so any historical price level (long-ago
        // trade entries included) is reachable with repeated flings.
        var startVerticalPanGlide = function(velocityPxMs, pricePerPixel, startRange) {
          stopVerticalPanGlide();
          if (!isValidPriceRange(startRange) || !(pricePerPixel > 0)) return;
          if (typeof velocityPxMs !== 'number' || !isFinite(velocityPxMs)) return;
          var clampedVelocity = Math.max(
            -VERT_PAN_GLIDE_MAX_VELOCITY_PX_MS,
            Math.min(VERT_PAN_GLIDE_MAX_VELOCITY_PX_MS, velocityPxMs)
          );
          if (Math.abs(clampedVelocity) < VERT_PAN_GLIDE_MIN_VELOCITY_PX_MS) return;
          if (isVerticalChartMovementBlocked()) return;
          var state = {
            v: clampedVelocity,
            lastAt: Date.now(),
            pricePerPixel: pricePerPixel,
            range: { from: startRange.from, to: startRange.to },
            raf: 0,
          };
          vertPanGlide = state;
          var step = function() {
            if (vertPanGlide !== state) return;
            state.raf = 0;
            if (isVerticalChartMovementBlocked() || !chart || !series) {
              vertPanGlide = null;
              return;
            }
            var now = Date.now();
            var dt = Math.max(1, Math.min(64, now - state.lastAt));
            state.lastAt = now;
            var priceShift = state.v * dt * state.pricePerPixel * VERT_PAN_PRICE_DELTA_MULTIPLIER;
            state.range = {
              from: state.range.from + priceShift,
              to: state.range.to + priceShift,
            };
            renderVerticalPanRange(state.range);
            state.v *= Math.pow(VERT_PAN_GLIDE_DECAY_PER_FRAME, dt / 16);
            if (Math.abs(state.v) <= VERT_PAN_GLIDE_STOP_VELOCITY_PX_MS) {
              var settledRange = { from: state.range.from, to: state.range.to };
              vertPanGlide = null;
              rememberManualVerticalPanRange(settledRange);
              syntheticRightPriceScaleFallbackRange = settledRange;
              applyManualVerticalPanLockedRange();
              settleVerticalPriceGestureDomWork();
              return;
            }
            state.raf = requestAnimationFrame(step);
          };
          state.raf = requestAnimationFrame(step);
        };

        var continueVerticalPan = function(clientY) {
          if (typeof clientY !== 'number' || !isFinite(clientY)) return;
          // Android WebView can postpone requestAnimationFrame callbacks while
          // a long touch stream is active. Write the range from the move event
          // itself so candles track the finger like MT5.
          applyVerticalPanAt(clientY);
        };

        var endVerticalPan = function() {
          var finalRange =
            vertPanState && isValidPriceRange(vertPanState.latestRange)
              ? normalizePriceRange(vertPanState.latestRange)
              : null;
          var flingVelocityPxMs =
            vertPanState &&
            typeof vertPanState.velocityPxMs === 'number' &&
            isFinite(vertPanState.velocityPxMs) &&
            typeof vertPanState.lastMoveAt === 'number' &&
            Date.now() - vertPanState.lastMoveAt < 160
              ? vertPanState.velocityPxMs
              : 0;
          // A busy JS thread can coalesce a fast fling into one or two move
          // events, leaving per-move velocity unset. Fall back to the whole
          // gesture's displacement/duration for short, fast strokes so a
          // genuine fling still glides.
          if (
            Math.abs(flingVelocityPxMs) < VERT_PAN_GLIDE_MIN_VELOCITY_PX_MS &&
            vertPanState &&
            typeof vertPanState.startAt === 'number' &&
            typeof vertPanState.lastMoveAt === 'number' &&
            typeof vertPanState.lastMoveY === 'number' &&
            Date.now() - vertPanState.lastMoveAt < 160
          ) {
            var gestureDurationMs = vertPanState.lastMoveAt - vertPanState.startAt;
            var gestureDisplacementPx = vertPanState.lastMoveY - vertPanState.startY;
            if (
              gestureDurationMs > 0 &&
              gestureDurationMs <= 350 &&
              Math.abs(gestureDisplacementPx) >= 160
            ) {
              flingVelocityPxMs = gestureDisplacementPx / gestureDurationMs;
            }
          }
          var flingPricePerPixel = vertPanState ? vertPanState.pricePerPixel : 0;
          if (finalRange) {
            renderVerticalPanRange(finalRange);
          }
          verticalPricePanGestureActive = false;
          if (finalRange) {
            rememberManualVerticalPanRange(finalRange);
            syntheticRightPriceScaleFallbackRange = {
              from: finalRange.from,
              to: finalRange.to,
            };
            applyManualVerticalPanLockedRange();
          }
          vertPanState = null;
          vertPanPending = null;
          if (finalRange && flingVelocityPxMs !== 0) {
            // Hand the pan over to the kinetic glide for MT5-style reach.
            startVerticalPanGlide(flingVelocityPxMs, flingPricePerPixel, finalRange);
          }
          if (verticalGestureDomWorkPending || pendingVerticalOverlayApply) {
            verticalGestureDomWorkPending = false;
            applyDeferredVerticalOverlayPayload();
          }
          scheduleGestureRightPriceScaleFallbackRefresh();
          scheduleOverlayDomRefresh();
          if (horizontalScrollMotionActive) {
            scheduleVisibleRangeIdleWork();
          }
        };

        var settleVerticalPriceGestureDomWork = function() {
          if (verticalGestureDomWorkPending || pendingVerticalOverlayApply) {
            verticalGestureDomWorkPending = false;
            applyDeferredVerticalOverlayPayload();
          }
          scheduleGestureRightPriceScaleFallbackRefresh();
          scheduleOverlayDomRefresh();
          postChartGeometry();
          if (horizontalScrollMotionActive) {
            scheduleVisibleRangeIdleWork();
          }
        };

        var finishRightPriceScaleGesture = function(cancelled) {
          if (!rightPriceScaleGestureActive) {
            return false;
          }
          var gestureState = rightPriceScaleGestureState;
          var finalRange =
            gestureState && gestureState.moved && isValidPriceRange(gestureState.latestRange)
              ? normalizePriceRange(gestureState.latestRange)
              : null;
          if (
            gestureState &&
            gestureState.pointerId !== null &&
            gestureState.pointerId !== undefined &&
            typeof el.releasePointerCapture === 'function'
          ) {
            try { el.releasePointerCapture(gestureState.pointerId); } catch (_releaseErr) {}
          }
          el.style.touchAction =
            gestureState && typeof gestureState.previousTouchAction === 'string'
              ? gestureState.previousTouchAction
              : '';
          rightPriceScaleGestureActive = false;
          rightPriceScaleGestureState = null;
          verticalPricePanGestureActive = false;
          if (isValidPriceRange(finalRange)) {
            clearCompletedRightPriceScaleTap();
            rememberManualVerticalPanRange(finalRange);
            syntheticRightPriceScaleFallbackRange = {
              from: finalRange.from,
              to: finalRange.to,
            };
            applyManualVerticalPanLockedRange();
          } else if (
            cancelled !== true &&
            gestureState &&
            consumeCompletedRightPriceScaleTap(
              { x: gestureState.startX, y: gestureState.startY },
              Date.now()
            )
          ) {
            suppressNextChartClickUntil = Date.now() + 350;
            resetChartVerticalScale();
          }
          settleVerticalPriceGestureDomWork();
          return true;
        };

        var resetAutoScale = function() {
          // Aggressively re-enable autoScale on the right price axis. Use
          // applyOptions({autoScale: true}) AND setAutoScale(true) — the
          // first forces lightweight-charts to reset its internal pinch /
          // pan price-range cache; the second is the older API that some
          // chart builds still respond to. Without both, a previous pinch
          // can leave the visible price range stuck at a 50,000-point
          // span, squashing all candles into a thin horizontal line.
          clearManualPriceScaleState();
          enableRightPriceAutoScale();
          scheduleOverlayDomRefresh();
          postChartGeometry();
        };

        var settlePinchPriceScale = function() {
          if (isCrosshairInteractionActive()) return;
          // Pinch owns the time scale, not an already user-owned vertical
          // window. Reassert that window after the library's pinch handler;
          // only an explicit reset/double-tap or Auto-scale may clear it.
          if (isManualVerticalPanRangeLocked()) {
            applyManualVerticalPanLockedRange();
            scheduleOverlayDomRefresh();
            postChartGeometry();
            return;
          }
          resetAutoScale();
        };

        var captureTradeLineDragPriceScaleLock = function() {
          var priceScaleApi = getRightPriceScaleApi();
          if (!priceScaleApi || typeof priceScaleApi.getVisibleRange !== 'function') {
            return null;
          }
          var lock = priceScaleApi.getVisibleRange();
          if (!isValidPriceRange(lock)) {
            lock = resolveVerticalPanStartPriceRange();
          }
          if (!isValidPriceRange(lock)) {
            return null;
          }
          if (typeof priceScaleApi.setAutoScale === 'function') {
            try { priceScaleApi.setAutoScale(false); } catch (_e1) {}
          }
          if (typeof priceScaleApi.setVisibleRange === 'function') {
            try { priceScaleApi.setVisibleRange({ from: lock.from, to: lock.to }); } catch (_e2) {}
          }
          return { from: lock.from, to: lock.to };
        };

        var keepTradeLineDragPriceScaleLocked = function(lock) {
          if (!isValidPriceRange(lock)) {
            return;
          }
          var priceScaleApi = getRightPriceScaleApi();
          if (!priceScaleApi) {
            return;
          }
          if (typeof priceScaleApi.setAutoScale === 'function') {
            try { priceScaleApi.setAutoScale(false); } catch (_e1) {}
          }
          if (typeof priceScaleApi.setVisibleRange === 'function') {
            try { priceScaleApi.setVisibleRange({ from: lock.from, to: lock.to }); } catch (_e2) {}
          }
        };

        var resolveTradeLineDragHitFromEvent = function(event) {
          var pointFromEvent = getClientPoint(event);
          if (!pointFromEvent) return null;
          var point = getClampedRelativePoint(pointFromEvent.x, pointFromEvent.y);
          if (!point) return null;
          var hit = pickDraggableOverlayLineAtY(point.y);
          if (!hit || !hit.dragKey) return null;
          return {
            hit: hit,
            pointFromEvent: pointFromEvent,
          };
        };

        var beginTradeLineDrag = function(event, initialHit) {
          var hit = initialHit || null;
          if (!hit) {
            var resolvedHit = resolveTradeLineDragHitFromEvent(event);
            hit = resolvedHit && resolvedHit.hit;
          }
          if (!hit || !hit.dragKey) return false;
          var startPrice = sanitizeOverlayDragPrice(hit.price);
          cancelChartTradeLineDragMove();
          // Capture the pointer so subsequent move/up events route to us
          // even when the finger leaves the chart bounds. Disable the chart
          // element's default touch-action panning so the page doesn't
          // scroll while the user is dragging the line vertically.
          var capturedPointerId = null;
          if (event && typeof event.pointerId === 'number' && typeof el.setPointerCapture === 'function') {
            try {
              el.setPointerCapture(event.pointerId);
              capturedPointerId = event.pointerId;
            } catch (_e) {}
          }
          var prevTouchAction = el.style.touchAction;
          el.style.touchAction = 'none';
          var startPointFromEvent = getClientPoint(event);
          var startPoint = startPointFromEvent
            ? getTradeLineDragPoint(startPointFromEvent.x, startPointFromEvent.y)
            : null;
          var manualRangeBeforeDrag = isManualVerticalPanRangeLocked()
            ? normalizePriceRange(manualVerticalPanLockedRange)
            : null;
          var manualReferenceSpanBeforeDrag =
            typeof manualPriceScaleReferenceSpan === 'number' &&
            isFinite(manualPriceScaleReferenceSpan) &&
            manualPriceScaleReferenceSpan > 0
              ? manualPriceScaleReferenceSpan
              : null;
          activeTradeLineDrag = {
            dragKey: hit.dragKey,
            lastPrice: typeof startPrice === 'number' && isFinite(startPrice) ? startPrice : hit.price,
            pointerX: startPoint && typeof startPoint.x === 'number' ? startPoint.x : null,
            pointerY: startPoint && typeof startPoint.y === 'number' ? startPoint.y : hit.y,
            pointerId: capturedPointerId,
            prevTouchAction: prevTouchAction,
            priceScaleRangeLock: captureTradeLineDragPriceScaleLock(),
            manualRangeBeforeDrag: manualRangeBeforeDrag,
            manualReferenceSpanBeforeDrag: manualReferenceSpanBeforeDrag,
          };
          prepareTradeLineMagnifierSources();
          suspendChartTouchInteractions();
          pendingPointerTap = null;
          vertPanState = null;
          vertPanPending = null;
          suppressNextChartClickUntil = Date.now() + 350;
          updateDraggedOverlayLinePreview(activeTradeLineDrag.dragKey, activeTradeLineDrag.lastPrice);
          postChartTradeLineDrag(
            'start',
            activeTradeLineDrag.dragKey,
            roundOverlayDragPrice(activeTradeLineDrag.lastPrice) || activeTradeLineDrag.lastPrice
          );
          scheduleOverlayDomRefresh();
          stopChartEvent(event);
          return true;
        };

        var beginTradeLineDragFromHit = function(event, resolvedHit) {
          if (!resolvedHit || !resolvedHit.hit || !resolvedHit.hit.dragKey) {
            return false;
          }
          // SL/TP is direct manipulation: capture the line on pointer-down so
          // a normal vertical swipe cannot be cancelled by a hold timer.
          return beginTradeLineDrag(event, resolvedHit.hit);
        };

        var continueTradeLineDrag = function(event) {
          if (!activeTradeLineDrag) return false;
          var pointFromEvent = getClientPoint(event);
          if (!pointFromEvent) {
            stopChartEvent(event);
            return true;
          }
          var point = getTradeLineDragPoint(pointFromEvent.x, pointFromEvent.y);
          if (!point) {
            stopChartEvent(event);
            return true;
          }
          activeTradeLineDrag.pointerX = point.x;
          activeTradeLineDrag.pointerY = point.y;
          // The pointer can move while a rounded/edge-clamped price stays the
          // same. Refresh the loupe independently so it never lags the finger.
          scheduleTradeLineDragDomRefresh();
          var nextPrice = resolveTradeLineDragPrice(point);
          if (typeof nextPrice === 'number' && isFinite(nextPrice) && nextPrice > 0) {
            if (activeTradeLineDrag.lastPrice !== nextPrice) {
              activeTradeLineDrag.lastPrice = nextPrice;
              updateDraggedOverlayLinePreview(activeTradeLineDrag.dragKey, nextPrice);
              var nativeMovePrice = roundOverlayDragPrice(nextPrice);
              if (typeof nativeMovePrice === 'number' && isFinite(nativeMovePrice) && nativeMovePrice > 0) {
                scheduleChartTradeLineDragMove(activeTradeLineDrag.dragKey, nativeMovePrice);
              }
            } else {
              updateDraggedOverlayLinePreview(activeTradeLineDrag.dragKey, nextPrice);
            }
          }
          keepTradeLineDragPriceScaleLocked(activeTradeLineDrag.priceScaleRangeLock);
          stopChartEvent(event);
          return true;
        };

        var finishTradeLineDrag = function(event, cancelled) {
          if (!activeTradeLineDrag) return false;
          var drag = activeTradeLineDrag;
          activeTradeLineDrag = null;
          hideTradeLineMagnifier();
          discardTradeLineMagnifierSources();
          // Release the pointer capture and restore the original touch
          // action so the chart resumes its normal pan/scroll behaviour.
          if (drag.pointerId !== null && drag.pointerId !== undefined && typeof el.releasePointerCapture === 'function') {
            try { el.releasePointerCapture(drag.pointerId); } catch (_e) {}
          }
          el.style.touchAction = drag.prevTouchAction || '';
          restoreChartTouchInteractions();
          suppressNextChartClickUntil = Date.now() + 350;

          if (!cancelled) {
            var pointFromEvent = getClientPoint(event);
            var point = pointFromEvent ? getTradeLineDragPoint(pointFromEvent.x, pointFromEvent.y) : null;
            if (point) {
              var finalPrice = resolveTradeLineDragPrice(point);
              if (typeof finalPrice === 'number' && isFinite(finalPrice) && finalPrice > 0) {
                drag.lastPrice = finalPrice;
                updateDraggedOverlayLinePreview(drag.dragKey, finalPrice);
              }
            }
          }

          cancelChartTradeLineDragMove();
          keepTradeLineDragPriceScaleLocked(drag.priceScaleRangeLock);
          if (isValidPriceRange(drag.manualRangeBeforeDrag)) {
            rememberManualVerticalPanRange(drag.manualRangeBeforeDrag);
            manualPriceScaleReferenceSpan = drag.manualReferenceSpanBeforeDrag ||
              (drag.manualRangeBeforeDrag.to - drag.manualRangeBeforeDrag.from);
            applyManualVerticalPanLockedRange();
          } else {
            // The line drag temporarily disabled autoscale only to keep price
            // conversion stable. It must not manufacture persistent manual
            // ownership on an otherwise auto-owned chart.
            enableRightPriceAutoScale();
          }
          postChartTradeLineDrag('end', drag.dragKey, roundOverlayDragPrice(drag.lastPrice) || drag.lastPrice);
          pendingPointerTap = null;
          scheduleTradeLineDragDomRefresh();
          stopChartEvent(event);
          return true;
        };

        var onPointerDown = function(event) {
          rememberPointerDown(event);
          cancelFreshSeriesVerticalCenter();
          // Touching the chart catches an in-flight kinetic vertical glide,
          // exactly like grabbing a scrolling list.
          stopVerticalPanGlide();
          postChartTouchState(true);
          if (horizontalScrollMotionActive && visibleRangeIdleTimer !== null) {
            clearTimeout(visibleRangeIdleTimer);
            visibleRangeIdleTimer = null;
            visibleRangeIdlePendingAfterGesture = true;
          }
          activeHorizontalScrollGesture = false;
          activeHorizontalScrollGestureUntil = 0;
          if (rightPriceScaleGestureActive) {
            finishRightPriceScaleGesture(true);
          }
          if (isCrosshairInteractionActive()) {
            pendingPointerTap = null;
            vertPanPending = null;
            clearCompletedChartTap();
            return;
          }
          if (isScaleGestureEvent(event)) {
            horizontalScrollMotionActive = false;
            chartScaleGestureActive = true;
            clearCompletedChartTap();
            clearCompletedRightPriceScaleTap();
            suppressChartTapAfterScale();
            return;
          }
          var point = getClientPoint(event);
          if (!point) return;
          if (isRightPriceScaleGesturePoint(point.x, point.y)) {
            if (isVerticalChartMovementBlocked()) {
              pendingPointerTap = null;
              vertPanPending = null;
              stopChartEvent(event);
              return;
            }
            if (beginRightPriceScaleGesture(event, point.x, point.y)) {
              stopChartEvent(event);
            }
            return;
          }
          // Axis ownership is resolved before the Y-only trade-line hit test;
          // an SL/TP crossing the same row must not steal a price-axis drag.
          clearCompletedRightPriceScaleTap();
          var tradeLineHit = resolveTradeLineDragHitFromEvent(event);
          if (beginTradeLineDragFromHit(event, tradeLineHit)) {
            clearCompletedChartTap();
            return;
          }
          var now = Date.now();
          pendingPointerTap = {
            x: point.x,
            y: point.y,
            at: now,
          };
          // Start tracking for potential vertical pan
          vertPanPending = { startX: point.x, startY: point.y };
        };

        var onPointerMove = function(event) {
          if (isCrosshairInteractionActive()) return;
          if (isScaleGestureEvent(event)) {
            horizontalScrollMotionActive = false;
            chartScaleGestureActive = true;
            suppressChartTapAfterScale();
            // Keep pinch/scale gestures light. Rebuilding every custom overlay
            // on each move drops the WebView far below MT5-like frame cadence.
            scheduleGestureRightPriceScaleFallbackRefresh();
            // Position-only trade-marker tracking is cheap enough to run per
            // pinch frame — markers stay pinned to their real prices while
            // the scale changes under them.
            scheduleTradeOverlayReposition();
            return;
          }
          if (continueTradeLineDrag(event)) {
            return;
          }
          if (rightPriceScaleGestureActive) {
            var rightScalePoint = getClientPoint(event);
            if (!rightScalePoint || !applyRightPriceScaleGestureAt(rightScalePoint.y)) {
              deferVerticalGestureDomWork();
            }
            // The custom MT5-style axis owns the whole gesture, including the
            // few threshold pixels before scaling begins.
            stopChartEvent(event);
            return;
          }
          if (activeHorizontalScrollGesture) {
            // Lightweight Charts owns the drag once it is classified. Keep
            // this capture listener off the per-move hot path entirely.
            return;
          }
          // Check if we should start or continue a vertical pan
          var point = getClientPoint(event);
          if (point && vertPanState) {
            // Already in a vertical pan — continue it
            continueVerticalPan(point.y);
            stopChartEvent(event);
            return;
          }
          if (point && vertPanPending && !vertPanState) {
            var dx = Math.abs(point.x - vertPanPending.startX);
            var dy = Math.abs(point.y - vertPanPending.startY);
            // If vertical movement exceeds threshold and is more than horizontal,
            // commit to a vertical pan (candle up/down movement).
            if (dy > VERT_PAN_THRESHOLD && dy > dx * 1.2) {
              pendingPointerTap = null;
              if (isVerticalChartMovementBlocked()) {
                clearCompletedChartTap();
                vertPanPending = null;
                stopChartEvent(event);
                return;
              }
              if (beginVerticalPan(vertPanPending.startY)) {
                continueVerticalPan(point.y);
                stopChartEvent(event);
                return;
              }
            } else if (dx > VERT_PAN_THRESHOLD && dx > dy * 1.2) {
              // Committed to a HORIZONTAL pan / scroll. Lightweight-charts
              // handles the actual time movement. Keep a user-owned vertical
              // window fixed; the guarded idle health pass may fit visible
              // bars only when no manual price-scale ownership exists.
              try {
                preserveManualPriceScaleForHorizontalPan();
              } catch (_e) {}
              clearCompletedChartTap();
              markHorizontalScrollGestureActive();
              scheduleActiveScrollPriceScaleRecovery('horizontal_pan_active');
              pendingPointerTap = null;
              vertPanPending = null;
            }
          }
          if (point && vertPanPending) {
            // Horizontal pans are handled by Lightweight Charts. Avoid forcing a
            // heavy DOM overlay rebuild on every move; idle work will settle it.
            deferHorizontalGestureDomWork();
            return;
          }
          scheduleOverlayDomRefresh();
        };

        var onPointerUp = function(event) {
          if (isCrosshairInteractionActive()) {
            releasePointer(event);
            pendingPointerTap = null;
            vertPanPending = null;
            if (activePointerCount <= 0) {
              gestureHadMultitouch = false;
              chartScaleGestureActive = false;
              postChartTouchState(false);
            }
            return;
          }
          var isActualScaleGesture = isScaleGestureEvent(event) || gestureHadMultitouch || chartScaleGestureActive;
          var wasScaleGesture = isActualScaleGesture || Date.now() <= suppressChartTapUntil;
          if (isActualScaleGesture) {
            chartScaleGestureActive = true;
          }
          if (finishTradeLineDrag(event, false)) {
            releasePointer(event);
            finishHorizontalScrollGesture();
            if (activePointerCount <= 0) {
              gestureHadMultitouch = false;
              chartScaleGestureActive = false;
              postChartTouchState(false);
            }
            return;
          }
          releasePointer(event);
          if (finishRightPriceScaleGesture(false)) {
            stopChartEvent(event);
            if (activePointerCount <= 0) {
              chartScaleGestureActive = false;
              postChartTouchState(false);
            }
            return;
          }
          if (vertPanState) {
            endVerticalPan();
            if (activePointerCount <= 0) {
              chartScaleGestureActive = false;
              postChartTouchState(false);
            }
            return;
          }
          finishHorizontalScrollGesture();
          if (wasScaleGesture) {
            suppressChartTapAfterScale();
            if (activePointerCount <= 0) {
              // Pinch / multi-touch gesture has fully ended. Lightweight-
              // charts' built-in pinch handler can disturb the price scale.
              // Restore a user-owned manual window; otherwise return the
              // unowned scale to a healthy auto-fit.
              settlePinchPriceScale();
              gestureHadMultitouch = false;
              chartScaleGestureActive = false;
              postChartTouchState(false);
            }
            return;
          }
          vertPanPending = null;
          if (!event || !pendingPointerTap) {
            if (activePointerCount <= 0) postChartTouchState(false);
            return;
          }
          var pointFromEvent = getClientPoint(event);
          if (!pointFromEvent) {
            pendingPointerTap = null;
            if (activePointerCount <= 0) postChartTouchState(false);
            return;
          }
          var elapsed = Date.now() - pendingPointerTap.at;
          var dx = pointFromEvent.x - pendingPointerTap.x;
          var dy = pointFromEvent.y - pendingPointerTap.y;
          pendingPointerTap = null;
          if (elapsed > 450 || Math.abs(dx) > 12 || Math.abs(dy) > 12) {
            clearCompletedChartTap();
            if (activePointerCount <= 0) postChartTouchState(false);
            return;
          }
          var point = getRelativePoint(pointFromEvent.x, pointFromEvent.y);
          if (!point) {
            clearCompletedChartTap();
            if (activePointerCount <= 0) postChartTouchState(false);
            return;
          }
          if (consumeCompletedChartTap(point, Date.now())) {
            suppressNextChartClickUntil = Date.now() + 350;
            if (chartWindowSplitMode) {
              emitChartDoubleTapAtPoint(point.x, point.y);
            } else {
              resetAutoScale();
            }
            if (activePointerCount <= 0) postChartTouchState(false);
            return;
          }
          scheduleOverlayDomRefresh();
          emitChartTapAtPoint(point.x, point.y);
          if (activePointerCount <= 0) postChartTouchState(false);
        };

        var onPointerCancel = function(event) {
          clearCompletedChartTap();
          if (finishTradeLineDrag(event, true)) {
            releasePointer(event);
            finishHorizontalScrollGesture();
            if (activePointerCount <= 0) {
              gestureHadMultitouch = false;
              chartScaleGestureActive = false;
              postChartTouchState(false);
            }
            return;
          }
          releasePointer(event);
          if (finishRightPriceScaleGesture(true)) {
            stopChartEvent(event);
            if (activePointerCount <= 0) {
              if (gestureHadMultitouch) {
                settlePinchPriceScale();
              }
              gestureHadMultitouch = false;
              chartScaleGestureActive = false;
              postChartTouchState(false);
            }
            return;
          }
          if (vertPanState) {
            endVerticalPan();
            if (activePointerCount <= 0) {
              if (gestureHadMultitouch) {
                settlePinchPriceScale();
              }
              gestureHadMultitouch = false;
              chartScaleGestureActive = false;
              postChartTouchState(false);
            }
            return;
          }
          finishHorizontalScrollGesture();
          if (Date.now() <= suppressChartTapUntil) {
            if (activePointerCount <= 0) {
              // Same manual-window restore / unowned auto-fit when a pinch
              // is cancelled — see onPointerUp for the full rationale.
              if (gestureHadMultitouch) {
                settlePinchPriceScale();
              }
              gestureHadMultitouch = false;
              chartScaleGestureActive = false;
              postChartTouchState(false);
            }
            return;
          }
          vertPanPending = null;
          pendingPointerTap = null;
          if (gestureHadMultitouch) {
            settlePinchPriceScale();
          }
          gestureHadMultitouch = false;
          chartScaleGestureActive = false;
          scheduleOverlayDomRefresh();
          if (activePointerCount <= 0) postChartTouchState(false);
        };

        var onClick = function(event) {
          if (Date.now() <= suppressNextChartClickUntil || Date.now() <= suppressChartTapUntil) {
            return;
          }
          var pointFromEvent = getClientPoint(event);
          if (!pointFromEvent) return;
          var point = getRelativePoint(pointFromEvent.x, pointFromEvent.y);
          if (!point) return;
          scheduleOverlayDomRefresh();
          emitChartTapAtPoint(point.x, point.y);
        };

        var onWindowPointerMove = function(event) {
          if (activeTradeLineDrag) {
            continueTradeLineDrag(event);
            return;
          }
          if (rightPriceScaleGestureActive) {
            var rightScalePoint = getClientPoint(event);
            if (!rightScalePoint || !applyRightPriceScaleGestureAt(rightScalePoint.y)) {
              deferVerticalGestureDomWork();
            }
            stopChartEvent(event);
          }
        };

        var onWindowPointerUp = function(event) {
          if (finishTradeLineDrag(event, false)) {
            releasePointer(event);
            if (activePointerCount <= 0) {
              gestureHadMultitouch = false;
              postChartTouchState(false);
            }
            return;
          }
          if (finishRightPriceScaleGesture(false)) {
            releasePointer(event);
            stopChartEvent(event);
            if (activePointerCount <= 0) {
              gestureHadMultitouch = false;
              postChartTouchState(false);
            }
          }
        };

        var onWindowPointerCancel = function(event) {
          if (finishTradeLineDrag(event, true)) {
            releasePointer(event);
            if (activePointerCount <= 0) {
              gestureHadMultitouch = false;
              postChartTouchState(false);
            }
            return;
          }
          if (finishRightPriceScaleGesture(true)) {
            releasePointer(event);
            stopChartEvent(event);
            if (activePointerCount <= 0) {
              if (gestureHadMultitouch) {
                settlePinchPriceScale();
              }
              gestureHadMultitouch = false;
              postChartTouchState(false);
            }
          }
        };

        // Non-passive listeners: required so preventDefault() inside the
        // drag handlers can stop the page from scrolling while the user is
        // moving an SL/TP/entry line vertically. Passive listeners would
        // ignore preventDefault on mobile.
        var listenerOptions = { capture: true, passive: false };
        if (supportsPointerEvents) {
          el.addEventListener('pointerdown', onPointerDown, listenerOptions);
          el.addEventListener('pointermove', onPointerMove, listenerOptions);
          el.addEventListener('pointerup', onPointerUp, listenerOptions);
          el.addEventListener('pointercancel', onPointerCancel, listenerOptions);
        } else {
          el.addEventListener('touchstart', onPointerDown, listenerOptions);
          el.addEventListener('touchmove', onPointerMove, listenerOptions);
          el.addEventListener('touchend', onPointerUp, listenerOptions);
          el.addEventListener('touchcancel', onPointerCancel, listenerOptions);
        }
        window.addEventListener('pointermove', onWindowPointerMove, listenerOptions);
        window.addEventListener('pointerup', onWindowPointerUp, listenerOptions);
        window.addEventListener('pointercancel', onWindowPointerCancel, listenerOptions);
        window.addEventListener('touchmove', onWindowPointerMove, listenerOptions);
        window.addEventListener('touchend', onWindowPointerUp, listenerOptions);
        window.addEventListener('touchcancel', onWindowPointerCancel, listenerOptions);
        el.addEventListener('click', onClick, true);
        detachChartTapListeners = function() {
          if (supportsPointerEvents) {
            el.removeEventListener('pointerdown', onPointerDown, listenerOptions);
            el.removeEventListener('pointermove', onPointerMove, listenerOptions);
            el.removeEventListener('pointerup', onPointerUp, listenerOptions);
            el.removeEventListener('pointercancel', onPointerCancel, listenerOptions);
          } else {
            el.removeEventListener('touchstart', onPointerDown, listenerOptions);
            el.removeEventListener('touchmove', onPointerMove, listenerOptions);
            el.removeEventListener('touchend', onPointerUp, listenerOptions);
            el.removeEventListener('touchcancel', onPointerCancel, listenerOptions);
          }
          window.removeEventListener('pointermove', onWindowPointerMove, listenerOptions);
          window.removeEventListener('pointerup', onWindowPointerUp, listenerOptions);
          window.removeEventListener('pointercancel', onWindowPointerCancel, listenerOptions);
          window.removeEventListener('touchmove', onWindowPointerMove, listenerOptions);
          window.removeEventListener('touchend', onWindowPointerUp, listenerOptions);
          window.removeEventListener('touchcancel', onWindowPointerCancel, listenerOptions);
          el.removeEventListener('click', onClick, true);
          pendingPointerTap = null;
          activePointerIds = {};
          activePointerCount = 0;
          gestureHadMultitouch = false;
          chartScaleGestureActive = false;
          clearCompletedChartTap();
          clearCompletedRightPriceScaleTap();
          activeHorizontalScrollGesture = false;
          horizontalScrollMotionActive = false;
          activeHorizontalScrollGestureUntil = 0;
          verticalPricePanGestureActive = false;
          syntheticRightPriceScaleFallbackRange = null;
          rightPriceScaleGestureActive = false;
          rightPriceScaleGestureState = null;
          activeTradeLineDrag = null;
          hideTradeLineMagnifier();
          discardTradeLineMagnifierSources();
          suppressNextChartClickUntil = 0;
          suppressChartTapUntil = 0;
          chartTouchInteractionSuspendDepth = 0;
          postChartTouchState(false);
        };
      }

      function postError(where, err) {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'ERROR',
            message: where + ': ' + (err && err.message ? err.message : String(err))
          }));
        } catch (_e) {}
      }

      function postWebViewOverlayLog(message, data) {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'OVERLAY_LOG',
            message: message,
            data: data || null,
          }));
        } catch (_e) {}
      }

      function getChartViewportWidth() {
        try {
          var chartElement = document.getElementById('chart');
          if (chartElement && typeof chartElement.clientWidth === 'number' && chartElement.clientWidth > 0) {
            return chartElement.clientWidth;
          }
        } catch (_e) {}
        return typeof window.innerWidth === 'number' && isFinite(window.innerWidth) ? window.innerWidth : 0;
      }

      function getRecentVisibleBars(length) {
        if (typeof length !== 'number' || !isFinite(length) || length <= 0) return 0;
        var isAreaSeries = seriesType === 'area';
        var visibleBarMax = isAreaSeries
          ? Math.min(
              ${CHART_AREA_VISIBLE_BAR_MAX},
              Math.max(
                ${CHART_AREA_VISIBLE_BAR_MIN},
                Math.round(areaRecentVisibleBarTarget)
              )
            )
          : ${CHART_DEFAULT_VISIBLE_BAR_MAX};
        var visibleBarTargetPx = isAreaSeries
          ? ${CHART_AREA_VISIBLE_BAR_TARGET_PX}
          : ${CHART_DEFAULT_VISIBLE_BAR_TARGET_PX};
        var visibleBarMin = isAreaSeries
          ? ${CHART_AREA_VISIBLE_BAR_MIN}
          : ${CHART_DEFAULT_VISIBLE_BAR_MIN};
        var viewportWidth = getChartViewportWidth();
        if (!(viewportWidth > 0)) {
          return Math.min(
            Math.round(length),
            visibleBarMax,
          );
        }
        var usableWidth = Math.max(
          viewportWidth - 28,
          visibleBarTargetPx,
        );
        var targetVisibleBars = Math.round(usableWidth / visibleBarTargetPx);
        return Math.min(
          Math.round(length),
          Math.max(
            visibleBarMin,
            Math.min(visibleBarMax, targetVisibleBars),
          ),
        );
      }

      function resolveDefaultBarSpacing(lengthOverride) {
        var visibleBars = getRecentVisibleBars(lengthOverride);
        var viewportWidth = getChartViewportWidth();
        if (!(viewportWidth > 0) || !(visibleBars > 0)) {
          return ${CHART_DEFAULT_TIME_SCALE_BAR_SPACING};
        }
        var usableWidth = Math.max(
          viewportWidth - 28,
          seriesType === 'area' ? ${CHART_AREA_VISIBLE_BAR_TARGET_PX} : visibleBars
        );
        var minimumBarSpacing = seriesType === 'area'
          ? ${CHART_AREA_TIME_SCALE_MIN_BAR_SPACING}
          : ${CHART_DEFAULT_RESET_BAR_SPACING_MIN};
        return Math.min(
          ${CHART_DEFAULT_RESET_BAR_SPACING_MAX},
          Math.max(
            minimumBarSpacing,
            usableWidth / visibleBars,
          ),
        );
      }

      function resetTimeScaleDefaults(lengthOverride) {
        try {
          if (!chart || !chart.timeScale || typeof chart.timeScale().applyOptions !== 'function') return;
          chart.timeScale().applyOptions({
            rightOffset: ${CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET},
            barSpacing: resolveDefaultBarSpacing(lengthOverride),
            minBarSpacing: seriesType === 'area'
              ? ${CHART_AREA_TIME_SCALE_MIN_BAR_SPACING}
              : ${CHART_DEFAULT_TIME_SCALE_MIN_BAR_SPACING},
            fixLeftEdge: ${CHART_TIME_SCALE_FIX_LEFT_EDGE},
            fixRightEdge: ${CHART_TIME_SCALE_FIX_RIGHT_EDGE},
          });
        } catch (_e) {}
      }

      function getBoundedLiveRightEdge(lengthOverride) {
        var dataLength =
          (typeof lengthOverride === 'number' && isFinite(lengthOverride) && lengthOverride > 0)
            ? Math.round(lengthOverride)
            : currentSeriesLength;
        if (!(dataLength > 0)) return null;
        return Math.max(0.5, dataLength - 0.5) + ${CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET};
      }

      function clampVisibleLogicalRangeToLiveEdge(range) {
        try {
          if (liveRightEdgeClampActive) return false;
          if (!chart || !chart.timeScale || typeof chart.timeScale().setVisibleLogicalRange !== 'function') return false;
          if (
            !range ||
            typeof range.from !== 'number' ||
            typeof range.to !== 'number' ||
            !isFinite(range.from) ||
            !isFinite(range.to)
          ) {
            return false;
          }
          var maxRight = getBoundedLiveRightEdge();
          if (maxRight === null || range.to <= maxRight + 0.001) {
            return false;
          }
          var span = Math.max(1, range.to - range.from);
          var nextFrom = maxRight - span;
          if (!isFinite(nextFrom)) {
            return false;
          }
          liveRightEdgeClampActive = true;
          chart.timeScale().setVisibleLogicalRange({
            from: nextFrom,
            to: maxRight,
          });
          setTimeout(function() {
            liveRightEdgeClampActive = false;
          }, 0);
          return true;
        } catch (_e) {
          liveRightEdgeClampActive = false;
          return false;
        }
      }

      function applyRecentViewport(lengthOverride) {
        try {
          if (!chart || !chart.timeScale) return;
          var dataLength =
            (typeof lengthOverride === 'number' && isFinite(lengthOverride) && lengthOverride > 0)
              ? Math.round(lengthOverride)
              : currentSeriesLength;
          if (!(dataLength > 0)) return;
          resetTimeScaleDefaults(dataLength);
          if (typeof chart.timeScale().setVisibleLogicalRange === 'function') {
            var visibleBars = getRecentVisibleBars(dataLength);
            var lastVisibleBar = getBoundedLiveRightEdge(dataLength);
            if (lastVisibleBar === null) return;
            chart.timeScale().setVisibleLogicalRange({
              from: Math.max(-0.5, lastVisibleBar - visibleBars),
              to: lastVisibleBar,
            });
          } else {
            chart.timeScale().fitContent();
            if (typeof chart.timeScale().scrollToRealTime === 'function') {
              chart.timeScale().scrollToRealTime();
            }
          }
          // Respect a user-driven vertical pan: if manualPriceScaleRangeActive
          // is set, this call leaves the manual range in place. A pinch or
          // bootstrap with manualPriceScaleRangeActive=false still recovers
          // autoScale, which is what the original "force" was guarding.
          scheduleOverlayPriceScaleLock(false);
          schedulePriceScaleHealthCheck('recent_viewport', false);
          refreshOverlayDomLabels(_overlayPayload);
        } catch (_e) {}
      }

      function scrollChartToLastBar() {
        try {
          if (!chart || !chart.timeScale) return;
          var timeScale = chart.timeScale();
          if (timeScale && typeof timeScale.scrollToRealTime === 'function') {
            timeScale.scrollToRealTime();
          } else {
            applyRecentViewport(currentSeriesLength);
          }
          scheduleOverlayPriceScaleLock(chartAutoScaleEnabled === true);
          schedulePriceScaleHealthCheck('scroll_to_last_bar', chartAutoScaleEnabled === true, 2);
          refreshOverlayDomLabels(_overlayPayload);
          postChartGeometry();
        } catch (_e) {}
      }

      function getVisibleLogicalRangeSnapshot() {
        try {
          if (
            chart &&
            chart.timeScale &&
            typeof chart.timeScale === 'function' &&
            typeof chart.timeScale().getVisibleLogicalRange === 'function'
          ) {
            var range = chart.timeScale().getVisibleLogicalRange();
            if (
              range &&
              typeof range.from === 'number' &&
              isFinite(range.from) &&
              typeof range.to === 'number' &&
              isFinite(range.to)
            ) {
              return { from: range.from, to: range.to };
            }
          }
        } catch (_e) {}
        return null;
      }

      function shouldFollowLiveRightEdge(range, lengthOverride) {
        try {
          if (
            !range ||
            typeof range.from !== 'number' ||
            typeof range.to !== 'number' ||
            !isFinite(range.from) ||
            !isFinite(range.to)
          ) {
            return false;
          }
          if (isHorizontalScrollMotionActive() || Date.now() <= activeHorizontalScrollGestureUntil) {
            return false;
          }
          var previousMaxRight = getBoundedLiveRightEdge(lengthOverride);
          if (previousMaxRight === null) {
            return false;
          }
          var followTolerance = Math.max(1.25, ${CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET} + 0.25);
          return range.to >= previousMaxRight - followTolerance;
        } catch (_e) {}
        return false;
      }

      function followLiveRightEdge(previousRange, lengthOverride) {
        try {
          if (
            !previousRange ||
            typeof previousRange.from !== 'number' ||
            typeof previousRange.to !== 'number' ||
            !isFinite(previousRange.from) ||
            !isFinite(previousRange.to)
          ) {
            return false;
          }
          if (!chart || !chart.timeScale || typeof chart.timeScale().setVisibleLogicalRange !== 'function') {
            return false;
          }
          var nextRight = getBoundedLiveRightEdge(lengthOverride);
          if (nextRight === null) {
            return false;
          }
          var span = Math.max(1, previousRange.to - previousRange.from);
          var nextFrom = nextRight - span;
          if (!isFinite(nextFrom)) {
            return false;
          }
          liveRightEdgeClampActive = true;
          chart.timeScale().setVisibleLogicalRange({
            from: nextFrom,
            to: nextRight,
          });
          setTimeout(function() {
            liveRightEdgeClampActive = false;
          }, 0);
          return true;
        } catch (_e) {
          liveRightEdgeClampActive = false;
          return false;
        }
      }

      function findRawSeriesTimeIndex(data, time) {
        if (!data || typeof time !== 'number' || !isFinite(time)) return -1;
        for (var i = 0; i < data.length; i += 1) {
          if (data[i] && data[i].time === time) return i;
        }
        return -1;
      }

      function clampSeriesIndex(index, length) {
        if (!(length > 0)) return 0;
        return Math.max(0, Math.min(length - 1, index));
      }

      function shouldExpandAreaRecentViewportAfterPrepend(previousData, nextData, previousRange) {
        try {
          if (
            seriesType !== 'area' ||
            !previousRange ||
            !previousData ||
            !nextData ||
            previousData.length === 0 ||
            nextData.length <= previousData.length
          ) {
            return false;
          }
          var previousFirst = previousData[0] && previousData[0].time;
          var nextFirst = nextData[0] && nextData[0].time;
          if (
            typeof previousFirst !== 'number' ||
            typeof nextFirst !== 'number' ||
            !(nextFirst < previousFirst) ||
            !shouldFollowLiveRightEdge(previousRange, previousData.length)
          ) {
            return false;
          }

          var previousDefaultVisibleBars = getRecentVisibleBars(previousData.length);
          var nextDefaultVisibleBars = getRecentVisibleBars(nextData.length);
          var previousVisibleSpan = previousRange.to - previousRange.from;
          var spanTolerance = Math.max(2, previousDefaultVisibleBars * 0.03);
          return (
            nextDefaultVisibleBars > previousDefaultVisibleBars &&
            Math.abs(previousVisibleSpan - previousDefaultVisibleBars) <= spanTolerance
          );
        } catch (_e) {}
        return false;
      }

      function restorePrependedHistoryViewport(previousData, nextData, previousRange) {
        try {
          if (!chart || !chart.timeScale || !previousRange) return false;
          if (!previousData || !nextData || previousData.length === 0 || nextData.length === 0) return false;

          var previousFirst = previousData[0] && previousData[0].time;
          var nextFirst = nextData[0] && nextData[0].time;
          if (
            typeof previousFirst !== 'number' ||
            typeof nextFirst !== 'number' ||
            !(nextFirst < previousFirst)
          ) {
            return false;
          }

          var previousVisibleFromIndex = clampSeriesIndex(Math.floor(previousRange.from), previousData.length);
          var previousVisibleToIndex = clampSeriesIndex(Math.ceil(previousRange.to), previousData.length);
          var previousVisibleFromTime = previousData[previousVisibleFromIndex] && previousData[previousVisibleFromIndex].time;
          var previousVisibleToTime = previousData[previousVisibleToIndex] && previousData[previousVisibleToIndex].time;
          var nextVisibleFromIndex = findRawSeriesTimeIndex(nextData, previousVisibleFromTime);
          var nextVisibleToIndex = findRawSeriesTimeIndex(nextData, previousVisibleToTime);
          var shiftedBy = nextVisibleFromIndex - previousVisibleFromIndex;
          if (
            typeof previousVisibleFromTime !== 'number' ||
            typeof previousVisibleToTime !== 'number' ||
            !(shiftedBy > 0) ||
            nextVisibleToIndex < nextVisibleFromIndex
          ) {
            return false;
          }

          if (typeof chart.timeScale().setVisibleLogicalRange === 'function') {
            chart.timeScale().setVisibleLogicalRange({
              from: previousRange.from + shiftedBy,
              to: previousRange.to + shiftedBy,
            });
            return true;
          }

          if (typeof chart.timeScale().setVisibleRange === 'function') {
            if (previousVisibleFromTime <= previousVisibleToTime) {
              chart.timeScale().setVisibleRange({ from: previousVisibleFromTime, to: previousVisibleToTime });
              return true;
            }
          }
        } catch (_e) {}
        return false;
      }

      function shouldResetViewportForSeriesReplacement(previousData, nextData) {
        if (!previousData || !nextData || previousData.length === 0 || nextData.length === 0) {
          return false;
        }
        var previousFirst = previousData[0] && previousData[0].time;
        var previousLast = previousData[previousData.length - 1] && previousData[previousData.length - 1].time;
        var nextFirst = nextData[0] && nextData[0].time;
        var nextLast = nextData[nextData.length - 1] && nextData[nextData.length - 1].time;
        if (
          typeof previousFirst !== 'number' ||
          typeof previousLast !== 'number' ||
          typeof nextFirst !== 'number' ||
          typeof nextLast !== 'number'
        ) {
          return false;
        }
        return nextData.length < previousData.length || nextFirst !== previousFirst || nextLast < previousLast;
      }

      function shouldPaginateForVisibleLogicalRange(range) {
        if (!range || typeof range.from !== 'number' || !isFinite(range.from)) return false;
        var visibleSpan =
          typeof range.to === 'number' && isFinite(range.to)
            ? Math.max(1, range.to - range.from)
            : getRecentVisibleBars(currentSeriesLength);
        var leftPrefetchBars = Math.max(
          HISTORY_PAGINATION_MIN_LEFT_BARS,
          Math.min(
            HISTORY_PAGINATION_MAX_LEFT_BARS,
            Math.ceil(visibleSpan * HISTORY_PAGINATION_VIEWPORT_MULTIPLIER),
          ),
        );
        return range.from <= leftPrefetchBars;
      }

      function requestHistoryPaginationForVisibleRange(range) {
        if (!shouldPaginateForVisibleLogicalRange(range)) {
          return;
        }
        var now = Date.now();
        if (now - lastHistoryPaginationPostAt <= HISTORY_PAGINATION_DEBOUNCE_MS) {
          return;
        }
        lastHistoryPaginationPostAt = now;
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ON_PAGINATE_HISTORY' }));
        } catch (e) {}
      }

      window.__rtx5ApplyRecentViewport = applyRecentViewport;
      window.__rtx5ScrollToLastBar = scrollChartToLastBar;
      window.__rtx5ResetTimeScale = resetTimeScaleDefaults;
      window.__rtx5ClampLiveRightEdge = clampVisibleLogicalRangeToLiveEdge;
      window.__rtx5ResetPriceScale = function() {
        resetChartVerticalScale();
      };
      window.__rtx5RestoreManualPriceScale = restoreManualPriceScale;

      function makePriceFormat(displayDecimals) {
        var decimals = (typeof displayDecimals === 'number' && displayDecimals >= 0) ? displayDecimals : 2;
        return {
          type: 'price',
          precision: decimals,
          minMove: 1 / Math.pow(10, decimals)
        };
      }

      function setDisplayDecimals(displayDecimals) {
        try {
          var decimals =
            typeof displayDecimals === 'number' && isFinite(displayDecimals) && displayDecimals >= 0
              ? Math.max(0, Math.min(10, Math.round(displayDecimals)))
              : lastDisplayDecimals;
          lastRequestedDisplayDecimals = decimals;
          lastDisplayDecimals = decimals;
          var priceFormat = makePriceFormat(decimals);
          if (series && typeof series.applyOptions === 'function') {
            try { series.applyOptions({ priceFormat: priceFormat }); } catch (_seriesFormatErr) {}
          }
          if (moveBarsSeries && typeof moveBarsSeries.applyOptions === 'function') {
            try { moveBarsSeries.applyOptions({ priceFormat: priceFormat }); } catch (_moveFormatErr) {}
          }
          ensureMoveBarsSeries(decimals);
          if (isManualVerticalPanRangeLocked()) {
            applyManualVerticalPanLockedRange();
          }
          refreshMarketPriceScaleDom();
          refreshOverlayDomLabelsWhenIdle(_overlayPayload);
        } catch (e) {
          postError('setDisplayDecimals', e);
        }
      }

      function resolveTickDateValue(value) {
        if (typeof value === 'string') {
          var trimmed = value.trim();
          if (!trimmed) {
            return null;
          }
          var numeric = Number(trimmed);
          if (isFinite(numeric)) {
            value = numeric;
          } else {
            var parsedStringDate = new Date(trimmed);
            return isFinite(parsedStringDate.getTime()) ? parsedStringDate : null;
          }
        }

        if (typeof value === 'number' && isFinite(value)) {
          var absValue = Math.abs(value);
          if (absValue > 4.2e16) {
            return new Date(Math.floor(value / 1000000));
          }
          if (absValue > 4.2e13) {
            return new Date(Math.floor(value / 1000));
          }
          if (absValue > 4.2e10) {
            return new Date(value);
          }
          return new Date(value * 1000);
        }

        return null;
      }

      function resolveTickDate(time) {
        var directDate = resolveTickDateValue(time);
        if (directDate) {
          return directDate;
        }

        if (time && typeof time === 'object') {
          var timestampDate = resolveTickDateValue(time.timestamp);
          if (timestampDate) {
            return timestampDate;
          }

          var timeDate = resolveTickDateValue(time.time);
          if (timeDate) {
            return timeDate;
          }

          if (
            typeof time.year === 'number' &&
            typeof time.month === 'number' &&
            typeof time.day === 'number'
          ) {
            return new Date(Date.UTC(time.year, time.month - 1, time.day));
          }

          if (
            time.businessDay &&
            typeof time.businessDay === 'object' &&
            typeof time.businessDay.year === 'number' &&
            typeof time.businessDay.month === 'number' &&
            typeof time.businessDay.day === 'number'
          ) {
            return new Date(Date.UTC(time.businessDay.year, time.businessDay.month - 1, time.businessDay.day));
          }
        }

        return null;
      }

      function formatChartTickMark(time, tickMarkType, _locale) {
        try {
          var resolveSource = time;
          var date = resolveTickDate(resolveSource);
          if (!date || !isFinite(date.getTime())) {
            return null;
          }

          var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          var day = String(date.getUTCDate()).padStart(2, '0');
          var month = months[date.getUTCMonth()] || '';
          var hours = String(date.getUTCHours()).padStart(2, '0');
          var minutes = String(date.getUTCMinutes()).padStart(2, '0');

          if (tickMarkType === 3 || tickMarkType === 4) {
            return day + ' ' + month + ' ' + hours + ':' + minutes;
          }

          if (tickMarkType === 2) {
            return day + ' ' + month;
          }

          if (tickMarkType === 1) {
            return month + ' ' + String(date.getUTCFullYear());
          }

          if (tickMarkType === 0) {
            return String(date.getUTCFullYear());
          }

          return day + ' ' + month;
        } catch (_e) {
          return null;
        }
      }

      function applyChartLayout(opts) {
        // Flatten host-supplied opts (background may be { color }) into the
        // shape lightweight-charts expects.
        try {
          if (opts && opts.layout && opts.layout.background && typeof opts.layout.background.color === 'string') {
            opts.layout.background = { type: 'solid', color: opts.layout.background.color };
          }
        } catch (_e) {}
        if (!opts) {
          opts = {};
        }
        opts.rightPriceScale = Object.assign({}, opts.rightPriceScale || {}, {
          visible: true,
          entireTextOnly: false,
          minimumWidth: ${CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH},
        });
        return opts || {};
      }

      function resolveChartBackgroundColor(opts) {
        try {
          var background = opts && opts.layout ? opts.layout.background : null;
          if (background && typeof background.color === 'string') {
            return background.color;
          }
          if (typeof background === 'string') {
            return background;
          }
        } catch (_e) {}
        return '#FFFFFF';
      }

      function makeChartCanvasBackgroundTransparent(opts) {
        if (!opts) {
          opts = {};
        }
        if (!opts.layout) {
          opts.layout = {};
        }
        opts.layout.background = { type: 'solid', color: 'transparent' };
        return opts;
      }

      function getHiddenCrosshairOptions() {
        var hiddenMode = 2;
        try {
          if (
            typeof LightweightCharts !== 'undefined' &&
            LightweightCharts.CrosshairMode &&
            typeof LightweightCharts.CrosshairMode.Hidden === 'number'
          ) {
            hiddenMode = LightweightCharts.CrosshairMode.Hidden;
          }
        } catch (_e) {}

        return {
          mode: hiddenMode,
          vertLine: { visible: false, labelVisible: false, color: 'transparent', width: 0 },
          horzLine: { visible: false, labelVisible: false, color: 'transparent', width: 0 },
        };
      }

      function hideChartCrosshairOptions(opts) {
        if (!opts) {
          opts = {};
        }

        var hidden = getHiddenCrosshairOptions();
        var current = opts.crosshair || {};
        opts.crosshair = {
          mode: hidden.mode,
          vertLine: Object.assign({}, current.vertLine || {}, hidden.vertLine),
          horzLine: Object.assign({}, current.horzLine || {}, hidden.horzLine),
        };
        return opts;
      }

      function cloneSerializableValue(value, fallback) {
        try {
          return JSON.parse(JSON.stringify(value));
        } catch (_e) {
          return fallback;
        }
      }

      function applyChartVisualTheme(opts) {
        try {
          var safeOpts = applyChartLayout(cloneSerializableValue(opts || {}, {}));
          var chartBackgroundColor = resolveChartBackgroundColor(safeOpts);
          var chartTextColor = resolveChartTextColor(safeOpts);
          var customColors = safeOpts.customColors || {};
          var chartElement = document.getElementById('chart');

          lastChartBackgroundColor = chartBackgroundColor;
          lastChartAxisBackgroundColor = resolveChartAxisBackgroundColor(safeOpts, chartBackgroundColor);
          lastChartTextColor = chartTextColor;

          if (document.documentElement) {
            document.documentElement.style.background = chartBackgroundColor;
          }
          if (document.body) {
            document.body.style.background = chartBackgroundColor;
          }
          if (chartElement) {
            chartElement.style.background = 'transparent';
          }

          if (chart && typeof chart.applyOptions === 'function') {
            chart.applyOptions({
              layout: {
                background: { type: 'solid', color: 'transparent' },
                textColor: chartTextColor,
              },
            });
          }

          applyMovingVerticalGridColor(customColors.grid);
          applyChartAxisDividerColor(customColors.axisDivider);
          applyPeriodSeparatorOptions(safeOpts.periodSeparators || {});
          updateChartPaneBackgroundLayer();

          // Recolor the mounted SVG and fallback nodes in this task. The
          // scheduled helpers reconcile their geometry on the next frame.
          var gridLayer = getMovingVerticalGridLayer();
          if (gridLayer && typeof gridLayer.querySelectorAll === 'function') {
            var gridLines = gridLayer.querySelectorAll('line');
            for (var gridIndex = 0; gridIndex < gridLines.length; gridIndex += 1) {
              gridLines[gridIndex].setAttribute('stroke', movingVerticalGridColor);
              gridLines[gridIndex].__rtx5GridStyleSignature = '';
            }
          }
          var dividerLayer = getChartAxisDividerLayer();
          if (dividerLayer && typeof dividerLayer.querySelectorAll === 'function') {
            var dividerLines = dividerLayer.querySelectorAll('line');
            for (var dividerIndex = 0; dividerIndex < dividerLines.length; dividerIndex += 1) {
              dividerLines[dividerIndex].setAttribute('stroke', chartAxisDividerColor);
            }
            chartAxisDividerSignature = '';
          }
          var separatorLayer = getPeriodSeparatorLayer();
          if (separatorLayer && typeof separatorLayer.querySelectorAll === 'function') {
            var separatorLines = separatorLayer.querySelectorAll('line');
            for (var separatorIndex = 0; separatorIndex < separatorLines.length; separatorIndex += 1) {
              separatorLines[separatorIndex].setAttribute('stroke', periodSeparatorColor);
              separatorLines[separatorIndex].__rtx5PeriodSeparatorStyleSignature = '';
            }
          }
          if (rightPriceScaleFallbackBackgroundNode) {
            rightPriceScaleFallbackBackgroundNode.style.background = lastChartAxisBackgroundColor;
          }
          var fallbackTextColor = resolveReadableRightPriceScaleFallbackTextColor(chartTextColor);
          for (var labelIndex = 0; labelIndex < rightPriceScaleFallbackLabelNodes.length; labelIndex += 1) {
            if (rightPriceScaleFallbackLabelNodes[labelIndex]) {
              rightPriceScaleFallbackLabelNodes[labelIndex].style.color = fallbackTextColor;
            }
          }

          scheduleRightPriceScaleFallbackRefresh();
          scheduleMovingVerticalGridUpdate(false);
          scheduleChartAxisDividersUpdate();
          schedulePeriodSeparatorsUpdate();
          return true;
        } catch (error) {
          postError('applyChartVisualTheme', error);
          return false;
        }
      }

      function pickSeriesColors(opts, chartType) {
        var c = (opts && opts.customColors) || {};
        var up = c.candlesUptrend || '#2962FF';
        var down = c.candlesDowntrend || '#EF5350';
        var hollowBody = c.hollowBody || 'rgba(0,0,0,0)';
        if (chartType === 'hollow') {
          return { up: up, down: down, bodyUp: hollowBody, bodyDown: hollowBody };
        }
        return { up: up, down: down, bodyUp: up, bodyDown: down };
      }

      function readAreaDirectionValue(point) {
        if (!point || typeof point !== 'object') return null;
        if (typeof point.value === 'number' && isFinite(point.value)) return point.value;
        if (typeof point.close === 'number' && isFinite(point.close)) return point.close;
        return null;
      }

      function resetAreaDirectionForContext(dataContextSig) {
        var nextContextSig = typeof dataContextSig === 'string' ? dataContextSig : '';
        if (areaDirectionDataContextSig === nextContextSig) return;
        areaDirectionDataContextSig = nextContextSig;
        areaDirectionBaselinePrice = null;
        lastAreaDirection = 'unknown';
        if (areaDirectionOverrideDataContextSig !== nextContextSig) {
          areaDirectionOverride = null;
          areaDirectionOverrideRangeKey = 'auto';
          areaDirectionOverrideDataContextSig = '';
        }
      }

      function resolveAreaSeriesDirection(data) {
        if (areaDirectionOverride === 'up' || areaDirectionOverride === 'down') {
          return areaDirectionOverride;
        }
        if (!Array.isArray(data) || data.length < 2) return 'unknown';

        // A missing daily percentage may fall back to candles for Auto. Match
        // the default recent viewport instead of arbitrary prepended history.
        if (areaDirectionOverrideRangeKey !== 'auto') return 'unknown';
        var visibleBars = getRecentVisibleBars(data.length);
        var scopedData = visibleBars > 0
          ? data.slice(Math.max(0, data.length - visibleBars))
          : data;
        var baseline = null;
        var terminal = null;
        var usableCount = 0;
        for (var i = 0; i < scopedData.length; i += 1) {
          var value = readAreaDirectionValue(scopedData[i]);
          if (value === null) continue;
          if (baseline === null) baseline = value;
          terminal = value;
          usableCount += 1;
        }
        areaDirectionBaselinePrice = baseline;
        if (usableCount < 2 || baseline === null || terminal === null) {
          return 'unknown';
        }
        return terminal >= baseline ? 'up' : 'down';
      }

      function setAreaDirectionOverride(dataContextSig, rangeKey, direction) {
        var nextContextSig = typeof dataContextSig === 'string' ? dataContextSig : '';
        var nextRangeKey = typeof rangeKey === 'string' && rangeKey ? rangeKey : 'auto';
        var nextDirection = direction === 'up' || direction === 'down' ? direction : null;
        var didChange =
          areaDirectionOverrideDataContextSig !== nextContextSig ||
          areaDirectionOverrideRangeKey !== nextRangeKey ||
          areaDirectionOverride !== nextDirection;
        areaDirectionOverrideDataContextSig = nextContextSig;
        areaDirectionOverrideRangeKey = nextRangeKey;
        areaDirectionOverride = nextDirection;
        if (!didChange) return lastAreaDirection;
        areaDirectionBaselinePrice = null;
        lastAreaDirection = 'unknown';
        if (
          areaDirectionDataContextSig &&
          nextContextSig &&
          areaDirectionDataContextSig !== nextContextSig
        ) {
          // Keep the retained old-context chart visually stable while native
          // warms the new symbol/timeframe. initChart consumes this override
          // after the matching data context is installed.
          return lastAreaDirection;
        }
        return refreshAreaSeriesDirection(true);
      }

      function pickAreaSeriesColor(direction) {
        if (direction === 'down') return barDownColor;
        if (direction === 'up') return barUpColor;
        return areaNeutralColor;
      }

      function refreshAreaSeriesDirection(force) {
        if (
          seriesType !== 'area' ||
          !series ||
          typeof series.applyOptions !== 'function'
        ) {
          return 'unknown';
        }
        var direction = resolveAreaSeriesDirection(lastRawSeriesData);
        if (!force && direction === lastAreaDirection) return direction;
        var color = pickAreaSeriesColor(direction);
        try {
          // Repaint only the Area style. setData/initChart would reset the
          // viewport and briefly flash the loading surface on a live sign flip.
          series.applyOptions({
            lineColor: color,
            topColor: hexToRgba(color, 0.32),
            bottomColor: hexToRgba(color, 0.04),
          });
          lastAreaDirection = direction;
          // TradingView treats the Area stroke, live guide, and price badge as
          // one performance-colored series. Keep our custom Bid overlay in
          // that same color whenever history or a range override flips Area.
          refreshBidPriceLineColor();
          scheduleMarketPriceScaleDomOnly();
        } catch (_areaDirectionApplyError) {}
        return direction;
      }

      // Pending init args — stored so the ResizeObserver or rAF retry
      // can re-run chart creation if the container had zero dimensions
      // on the first attempt (common on Android light theme first load).
      var _pendingInit = null;
      var _pendingInitRaf = null;
      var _pendingInitRetryCount = 0;
      var MAX_PENDING_INIT_RAF_RETRIES = 60;
      var lastHostViewportSize = { width: 0, height: 0 };

      function normalizePositiveViewportSize(width, height) {
        var w = Math.round(Number(width));
        var h = Math.round(Number(height));
        return {
          width: isFinite(w) && w > 0 ? w : 0,
          height: isFinite(h) && h > 0 ? h : 0,
        };
      }

      function rememberHostViewportSize(width, height) {
        var size = normalizePositiveViewportSize(width, height);
        if (size.width > 0 && size.height > 0) {
          lastHostViewportSize = size;
        }
        return size;
      }

      function resolveChartViewportSize(preferredWidth, preferredHeight) {
        var chartElement = document.getElementById('chart');
        var preferred = normalizePositiveViewportSize(preferredWidth, preferredHeight);
        var elementWidth = chartElement && chartElement.clientWidth ? chartElement.clientWidth : 0;
        var elementHeight = chartElement && chartElement.clientHeight ? chartElement.clientHeight : 0;
        var windowWidth = typeof window.innerWidth === 'number' && isFinite(window.innerWidth) ? window.innerWidth : 0;
        var windowHeight = typeof window.innerHeight === 'number' && isFinite(window.innerHeight) ? window.innerHeight : 0;
        var hostWidth = lastHostViewportSize.width || 0;
        var hostHeight = lastHostViewportSize.height || 0;
        var resolvedWidth = preferred.width || elementWidth || windowWidth || hostWidth || 0;
        var resolvedHeight = preferred.height || elementHeight || windowHeight || hostHeight || 0;

        if (hostWidth > 0 && (resolvedWidth <= 0 || resolvedWidth < hostWidth * 0.92)) {
          resolvedWidth = hostWidth;
        }
        if (hostHeight > 0 && (resolvedHeight <= 0 || resolvedHeight < hostHeight * 0.92)) {
          resolvedHeight = hostHeight;
        }

        return normalizePositiveViewportSize(resolvedWidth, resolvedHeight);
      }

      function _doInitChart(
        opts,
        chartType,
        data,
        displayDecimals,
        showLowerPane,
        initSignature,
        configSig,
        dataContextSig,
        initRequestGeneration
      ) {
        var resolvedInitSignature = typeof initSignature === 'string' ? initSignature : '';
        var resolvedConfigSig = typeof configSig === 'string' ? configSig : '';
        var resolvedDataContextSig = typeof dataContextSig === 'string' ? dataContextSig : '';
        var resolvedInitRequestGeneration = Number(initRequestGeneration);
        if (
          !isFinite(resolvedInitRequestGeneration) ||
          resolvedInitRequestGeneration !== chartInitRequestGeneration
        ) {
          return false;
        }
        var isNewDataContext =
          !!appliedChartDataContextSig &&
          !!resolvedDataContextSig &&
          appliedChartDataContextSig !== resolvedDataContextSig;
        var el = document.getElementById('chart');
        var viewportSize = resolveChartViewportSize();
        var w = viewportSize.width;
        var h = viewportSize.height;

        // If the container has zero dimensions, the browser hasn't laid out
        // the WebView yet. Defer to the next animation frame — the
        // ResizeObserver will also catch it as a fallback.
        if (w === 0 || h === 0) {
          if (!_pendingInit) {
            _pendingInitRetryCount = 0;
          }
          _pendingInit = {
            opts: opts,
            chartType: chartType,
            data: data,
            displayDecimals: displayDecimals,
            showLowerPane: showLowerPane,
            initSignature: resolvedInitSignature,
            configSig: resolvedConfigSig,
            dataContextSig: resolvedDataContextSig,
            initRequestGeneration: resolvedInitRequestGeneration,
          };
          // Keep this single-flight and bounded. A hidden/zero-sized Android
          // WebView previously created an endless animation-frame recursion
          // that could starve React Navigation and continuously allocate.
          if (_pendingInitRaf === null && _pendingInitRetryCount < MAX_PENDING_INIT_RAF_RETRIES) {
            _pendingInitRetryCount += 1;
            _pendingInitRaf = requestAnimationFrame(function() {
              _pendingInitRaf = null;
              if (_pendingInit) {
                var pending = _pendingInit;
                _doInitChart(
                  pending.opts,
                  pending.chartType,
                  pending.data,
                  pending.displayDecimals,
                  pending.showLowerPane,
                  pending.initSignature,
                  pending.configSig,
                  pending.dataContextSig,
                  pending.initRequestGeneration
                );
              }
            });
          }
          return;
        }
        if (_pendingInitRaf !== null) {
          cancelAnimationFrame(_pendingInitRaf);
          _pendingInitRaf = null;
        }
        _pendingInit = null;
        _pendingInitRetryCount = 0;

        if (window._drawingManager) {
          try { window._drawingManager.remove(); } catch (_e) {}
          window._drawingManager = null;
        }
        // A rebuild replaces the Lightweight Charts instance, but it is not a
        // user request to reset the vertical axis. Retain the exact numeric
        // MT5-style window (and its original zoom envelope) across that swap.
        var retainedManualPriceScaleRange = !isNewDataContext && isManualVerticalPanRangeLocked()
          ? normalizePriceRange(manualVerticalPanLockedRange)
          : null;
        var retainedManualPriceScaleReferenceSpan =
          !isNewDataContext &&
          typeof manualPriceScaleReferenceSpan === 'number' &&
          isFinite(manualPriceScaleReferenceSpan) &&
          manualPriceScaleReferenceSpan > 0
            ? manualPriceScaleReferenceSpan
            : null;
        chartTouchInteractionSuspendDepth = 0;
        lastPostedChartTouchActive = false;
        clearManualPriceScaleState();
        if (isValidPriceRange(retainedManualPriceScaleRange)) {
          manualPriceScaleReferenceSpan = retainedManualPriceScaleReferenceSpan ||
            (retainedManualPriceScaleRange.to - retainedManualPriceScaleRange.from);
        }
        clearMovingVerticalGrid();
        clearChartAxisDividers();
        if (chart) {
          // Series-marker primitives survive setData, but a full chart rebuild
          // destroys their owner. Detach while the old series is still valid so
          // its handle can never be mistaken for the replacement series.
          clearOverlayMarkers();
          try { chart.remove(); } catch (_e) {}
          chart = null;
          series = null;
          moveBarsSeries = null;
          bidPriceLine = null;
          askPriceLine = null;
          marketPriceLineRefs = [];
          marketPriceLinesVisible = false;
          directionPriceLine = null;
          moveDirectionPriceLine = null;
          _positionLinesArr = [];
        }
        discardTradeLineMagnifier();
        if (_overlayLabelLayer && _overlayLabelLayer.parentNode) {
          try { _overlayLabelLayer.parentNode.removeChild(_overlayLabelLayer); } catch (_e) {}
          _overlayLabelLayer = null;
          _overlayDomNodesByKey = Object.create(null);
        }
        if (typeof detachChartTapListeners === 'function') {
          try { detachChartTapListeners(); } catch (_e) {}
          detachChartTapListeners = null;
        }
        cancelPendingTickFlush();
        cancelMarketPriceScaleDomRefreshSchedule();
        marketPriceScaleDomPending = false;
        if (overlayPriceScaleLockRaf) {
          try { cancelAnimationFrame(overlayPriceScaleLockRaf); } catch (_) {}
          overlayPriceScaleLockRaf = 0;
        }
        overlayPriceScaleLockForceAutoScale = false;
        if (priceScaleHealthRaf) {
          try { cancelAnimationFrame(priceScaleHealthRaf); } catch (_) {}
          priceScaleHealthRaf = 0;
        }
        if (rightPriceScaleLayoutRecoveryRaf) {
          try { cancelAnimationFrame(rightPriceScaleLayoutRecoveryRaf); } catch (_) {}
          rightPriceScaleLayoutRecoveryRaf = 0;
        }
        clearChartPaneBackgroundLayer();
        clearRightPriceScaleFallbackLayer();
        clearFreshSeriesVerticalCenterState();
        clearActiveScrollPriceScaleRecovery();
        if (visibleRangeIdleTimer !== null) {
          try { clearTimeout(visibleRangeIdleTimer); } catch (_) {}
          visibleRangeIdleTimer = null;
        }
        pendingTick = null;
        lastAppliedLiveTickRevision = 0;
        if (isNewDataContext) {
          // Never restore the previous broker/account/symbol/timeframe marker
          // while the new context is initializing. Native will attach the new
          // context's projected close after the matching candle data is seeded.
          lastLivePrice = null;
          lastBidPrice = null;
          lastAskPrice = null;
        }
        lastBarTime = 0;
        _liveBar = null;
        _liveBarHasObservedRealtimeUpdate = false;
        seriesType = chartType || 'candles';
        shouldShowLowerPane = showLowerPane !== false;
        lastInitSignature = resolvedInitSignature;
        lastInitConfigSig = resolvedConfigSig;
        lastInitDataContextSig = resolvedDataContextSig;
        candleCountdownSeriesContextSig = resolvedDataContextSig;
        lastDisplayDecimals =
          typeof displayDecimals === 'number' && isFinite(displayDecimals) && displayDecimals >= 0
            ? displayDecimals
            : 2;
        resetAreaDirectionForContext(resolvedDataContextSig);
        lastRawSeriesData = sanitizeSeriesData(data);
        chartReadyPostGeneration += 1;
        var readyGeneration = chartReadyPostGeneration;
        var readyInitSignature = lastInitSignature;
        var readyConfigSig = lastInitConfigSig;
        var readyDataContextSig = lastInitDataContextSig;

        var safeOpts = applyChartLayout(cloneSerializableValue(opts || {}, {}));
        var customAreaViewportConfig = safeOpts.areaViewport || {};
        var requestedAreaVisibleBars = Number(customAreaViewportConfig.visibleBars);
        areaRecentVisibleBarTarget =
          isFinite(requestedAreaVisibleBars) && requestedAreaVisibleBars > 0
            ? Math.min(
                ${CHART_AREA_VISIBLE_BAR_MAX},
                Math.max(${CHART_AREA_VISIBLE_BAR_MIN}, Math.round(requestedAreaVisibleBars))
              )
            : ${CHART_AREA_VISIBLE_BAR_MAX};
        var chartBackgroundColor = resolveChartBackgroundColor(safeOpts);
        lastChartBackgroundColor = chartBackgroundColor;
        lastChartAxisBackgroundColor = chartBackgroundColor;
        lastChartTextColor = resolveChartTextColor(safeOpts);
        try {
          document.body.style.background = chartBackgroundColor;
          el.style.background = 'transparent';
        } catch (_bgErr) {}
        safeOpts = hideChartCrosshairOptions(makeChartCanvasBackgroundTransparent(safeOpts));
        var customCols = safeOpts.customColors;
        var customCrosshairConfig = safeOpts.customCrosshair || {};
        var customPeriodSeparatorConfig = safeOpts.periodSeparators || {};
        applyMovingVerticalGridColor(customCols && customCols.grid);
        applyChartAxisDividerColor(customCols && customCols.axisDivider);
        applyPeriodSeparatorOptions(customPeriodSeparatorConfig);
        if (safeOpts.customColors) { delete safeOpts.customColors; }
        if (safeOpts.customCrosshair) { delete safeOpts.customCrosshair; }
        if (safeOpts.areaViewport) { delete safeOpts.areaViewport; }
        if (safeOpts.periodSeparators) { delete safeOpts.periodSeparators; }
        if (!safeOpts.timeScale) {
          safeOpts.timeScale = {};
        }
        safeOpts.timeScale.fixLeftEdge = ${CHART_TIME_SCALE_FIX_LEFT_EDGE};
        safeOpts.timeScale.fixRightEdge = ${CHART_TIME_SCALE_FIX_RIGHT_EDGE};
        safeOpts.timeScale.minBarSpacing = seriesType === 'area'
          ? ${CHART_AREA_TIME_SCALE_MIN_BAR_SPACING}
          : ${CHART_DEFAULT_TIME_SCALE_MIN_BAR_SPACING};
        safeOpts.timeScale.tickMarkFormatter = formatChartTickMark;
        // Crosshair / tooltip formatter uses the backend candle timestamp
        // that the host sends to the series.
        if (!safeOpts.localization) safeOpts.localization = {};
        safeOpts.localization.timeFormatter = function(time) {
          try {
            var resolveSource = time;
            var date = resolveTickDate(resolveSource);
            if (!date || !isFinite(date.getTime())) return '';
            var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            var d = String(date.getUTCDate()).padStart(2, '0');
            var m = months[date.getUTCMonth()] || '';
            var hh = String(date.getUTCHours()).padStart(2, '0');
            var mm = String(date.getUTCMinutes()).padStart(2, '0');
            return d + ' ' + m + ' ' + hh + ':' + mm;
          } catch (_e) {
            return '';
          }
        };

        // Force explicit pixel dimensions so the chart never renders at 0x0
        safeOpts.width = w;
        safeOpts.height = h;

        chart = LightweightCharts.createChart(el, safeOpts);
        try {
          chart.applyOptions({ crosshair: getHiddenCrosshairOptions() });
        } catch (_hideCrosshairErr) {}
        bindChartTapListeners(el);
        try {
          if (
            chart &&
            chart.timeScale &&
            typeof chart.timeScale === 'function' &&
            typeof chart.timeScale().subscribeVisibleLogicalRangeChange === 'function'
          ) {
            chart.timeScale().subscribeVisibleLogicalRangeChange(function(range) {
              if (clampVisibleLogicalRangeToLiveEdge(range)) {
                return;
              }
              // Any visible-range change (pan, momentum, zoom, autoscroll
              // follow, history load) can shift the autoscaled price range —
              // recompute trade-marker positions from their real prices every
              // time so markers never drift or stick at stale pixels.
              scheduleTradeOverlayReposition();
              var isLightweightHorizontalMotion = isHorizontalScrollMotionActive();
              scheduleMovingVerticalGridUpdate(isLightweightHorizontalMotion);
              schedulePeriodSeparatorsUpdate(isLightweightHorizontalMotion);
              if (isLightweightHorizontalMotion) {
                // Keep both finger drag and post-release kinetic scrolling on
                // transform-only SVG work. The idle timer is reset by every
                // momentum frame and performs one full settle at the end.
                lastOverlayGestureDeferralActivityAt = Date.now();
                visibleRangeIdlePendingAfterGesture = true;
                scheduleVisibleRangeIdleWork();
                return;
              }
              scheduleActiveScrollPriceScaleRecovery('visible_range_active');
              scheduleVisibleRangeIdleWork();
              requestHistoryPaginationForVisibleRange(range);
            });
          }
        } catch (_overlayLabelSubErr) {}

        var priceFormat = makePriceFormat(displayDecimals);
        var colors = pickSeriesColors({ customColors: customCols }, seriesType);
        barUpColor = colors.up;
        barDownColor = colors.down;
        moveUpColor = hexToRgba(colors.up, 0.85);
        moveDownColor = hexToRgba(colors.down, 0.85);
        areaNeutralColor = (customCols && customCols.lineBody) || colors.up;
        lastPriceLineDirection = null;
        setPrimaryPriceScaleMargins(shouldUseMoveBarsPane());
        updateChartPaneBackgroundLayer();

        // We render our own direction-coloured price line via
        // directionPriceLine (created post-data-load), so the series'
        // built-in last-price line is suppressed (priceLineVisible: false).
        // lastValueVisible: false removes its right-axis label too —
        // otherwise the axis showed two labels stacked at the same price.
        if (seriesType === 'line') {
          series = chart.addSeries(LightweightCharts.LineSeries, {
            color: (customCols && customCols.lineBody) || colors.up,
            lineWidth: 2,
            priceFormat: priceFormat,
            crosshairMarkerVisible: false,
            lastValueVisible: false,
            priceLineVisible: false,
            autoscaleInfoProvider: buildOverlayAwareAutoscaleInfo,
          });
        } else if (seriesType === 'area') {
          // Area uses Line's close-price path, but its tone belongs to the
          // selected performance range supplied by native. The shared custom
          // price overlay still owns the live axis label.
          var initialAreaDirection = resolveAreaSeriesDirection(lastRawSeriesData);
          var areaLineColor = pickAreaSeriesColor(initialAreaDirection);
          lastAreaDirection = initialAreaDirection;
          series = chart.addSeries(LightweightCharts.AreaSeries, {
            lineColor: areaLineColor,
            topColor: hexToRgba(areaLineColor, 0.32),
            bottomColor: hexToRgba(areaLineColor, 0.04),
            lineWidth: ${CHART_AREA_LINE_WIDTH},
            lineType: LightweightCharts.LineType.Simple,
            priceFormat: priceFormat,
            crosshairMarkerVisible: false,
            lastValueVisible: false,
            priceLineVisible: false,
            autoscaleInfoProvider: buildOverlayAwareAutoscaleInfo,
          });
        } else if (seriesType === 'bars') {
          series = chart.addSeries(LightweightCharts.BarSeries, {
            upColor: (customCols && customCols.barsUptrend) || colors.up,
            downColor: (customCols && customCols.barsDowntrend) || colors.down,
            priceFormat: priceFormat,
            lastValueVisible: false,
            priceLineVisible: false,
            autoscaleInfoProvider: buildOverlayAwareAutoscaleInfo,
          });
        } else {
          // Use the RTX5 custom candle renderer on mobile so dense zoomed-out
          // candles collapse into a single continuous high-low stroke instead
          // of splitting wick/body pixels into broken-looking fragments.
          series = window.addRTX5CustomCandlestickSeries(chart, {
            candleOpacity: ${CHART_CANDLE_RENDER_OPACITY},
            bearishCandleOpacity: ${CHART_BEARISH_CANDLE_RENDER_OPACITY},
            upColor: colors.bodyUp,
            downColor: colors.bodyDown,
            bodyUpColor: colors.bodyUp,
            bodyDownColor: colors.bodyDown,
            borderUpColor: colors.up,
            borderDownColor: colors.down,
            wickUpColor: colors.up,
            wickDownColor: colors.down,
            borderVisible: true,
            // Renko reuses the OHLC body renderer, but each price brick is a
            // solid open-to-close box and must not inherit candle wicks.
            wickVisible: seriesType !== 'renko',
            priceFormat: priceFormat,
            lastValueVisible: false,
            priceLineVisible: false,
            autoscaleInfoProvider: buildOverlayAwareAutoscaleInfo,
          });
        }

        ensureMoveBarsSeries(lastDisplayDecimals);
        if (isValidPriceRange(retainedManualPriceScaleRange)) {
          rememberManualVerticalPanRange(retainedManualPriceScaleRange);
          manualPriceScaleReferenceSpan = retainedManualPriceScaleReferenceSpan ||
            (retainedManualPriceScaleRange.to - retainedManualPriceScaleRange.from);
          applyManualVerticalPanLockedRange();
        }

        if (lastRawSeriesData.length > 0) {
          var mapped = mapForSeries(lastRawSeriesData);
          series.setData(mapped);
          detachMarketPriceLineRefsAfterSeriesReset();
          currentSeriesLength = mapped.length;
          if (mapped.length > 0) {
            try {
              rememberCachedChartContextSnapshot(
                resolvedDataContextSig,
                seriesType,
                lastRawSeriesData,
                lastDisplayDecimals
              );
            } catch (_contextCacheInitError) {}
          }
          lastBarTime = mapped[mapped.length - 1].time;
          if (isValidPriceRange(retainedManualPriceScaleRange)) {
            rememberManualVerticalPanRange(retainedManualPriceScaleRange);
            manualPriceScaleReferenceSpan = retainedManualPriceScaleReferenceSpan ||
              (retainedManualPriceScaleRange.to - retainedManualPriceScaleRange.from);
            applyManualVerticalPanLockedRange();
          } else {
            resetVisiblePriceScaleForFreshSeries('init_data');
          }
          // Only OHLC-shaped series seed the live-bar accumulator. Line/Area
          // accept one close value and are updated through their value path.
          if (seriesType !== 'line' && seriesType !== 'area') {
            var lastSeed = lastRawSeriesData[lastRawSeriesData.length - 1];
            _liveBar = {
              time: lastSeed.time,
              open: lastSeed.open,
              high: lastSeed.high,
              low: lastSeed.low,
              close: lastSeed.close,
            };
            _liveBarHasObservedRealtimeUpdate = false;
          }
          ensureMoveBarsSeries(lastDisplayDecimals);
          if (moveBarsSeries) {
            try { moveBarsSeries.setData(mapMoveBarsData(lastRawSeriesData)); } catch (_mb) {}
          }
          applyRecentViewport(currentSeriesLength);
          scheduleOverlayPriceScaleLock(!isValidPriceRange(retainedManualPriceScaleRange));
          if (!isValidPriceRange(retainedManualPriceScaleRange)) {
            scheduleFreshSeriesVerticalCenter('init_data', true);
          }
          ensureDirectionPriceLine();
          ensureMoveDirectionPriceLine();
        }

        // Initialize the drawing tools manager — this wires up all
        // toolbar tools (trendline, fib, brush, text, pitchfork, etc.)
        // to real canvas-level drawing primitives via the enhanced bundle.
        try {
          if (typeof window.DrawingToolsManager === 'function') {
            window._drawingManager = new window.DrawingToolsManager(chart, series);
            if (window._drawingManager && typeof window._drawingManager.setCrosshairConfig === 'function') {
              window._drawingManager.setCrosshairConfig(Object.assign({}, customCrosshairConfig, {
                upColor: colors.up,
                downColor: colors.down,
              }));
            }
            // Restore Chart Preferences → object descriptions before first paint.
            if (
              window._drawingManager &&
              typeof window._drawingManager.setShowObjectDescriptions === 'function'
            ) {
              window._drawingManager.setShowObjectDescriptions(
                window.__rtx5ShowObjectDescriptions !== false
              );
            }
          }
        } catch (_dtErr) {}

        try {
          if (chart && typeof chart.subscribeClick === 'function') {
            chart.subscribeClick(function(param) {
              try {
                if (!param || !param.point) return;
                emitChartTapAtPoint(param.point.x, param.point.y);
              } catch (_tapErr) {}
            });
          }
        } catch (_chartTapErr) {}

        appliedChartDataContextSig = resolvedDataContextSig;
        applyOverlayPayload(_overlayPayload);
        setLivePriceLine(lastLivePrice);
        if (isValidPriceRange(retainedManualPriceScaleRange)) {
          rememberManualVerticalPanRange(retainedManualPriceScaleRange);
          manualPriceScaleReferenceSpan = retainedManualPriceScaleReferenceSpan ||
            (retainedManualPriceScaleRange.to - retainedManualPriceScaleRange.from);
          applyManualVerticalPanLockedRange();
        }
        schedulePeriodSeparatorsUpdate();
        replayPendingChartDataReplacement(resolvedDataContextSig);
        postChartGeometry();
        postChartReadyWhenPriceScaleHealthy(
          'init_ready',
          0,
          readyGeneration,
          readyInitSignature,
          readyConfigSig,
          readyDataContextSig
        );
      }

      function initChart(
        opts,
        chartType,
        data,
        displayDecimals,
        showLowerPane,
        initSignature,
        configSig,
        dataContextSig
      ) {
        try {
          var requestHostOptions = cloneSerializableValue(opts || {}, {});
          var requestChartType = chartType || 'candles';
          var requestShowLowerPane = showLowerPane !== false;
          var requestDisplayDecimals = lastRequestedDisplayDecimals;
          var requestInitSignature = typeof initSignature === 'string' ? initSignature : '';
          var requestConfigSig = typeof configSig === 'string' ? configSig : '';
          var requestDataContextSig = typeof dataContextSig === 'string' ? dataContextSig : '';
          chartInitRequestGeneration += 1;
          var requestInitGeneration = chartInitRequestGeneration;
          discardPendingChartDataReplacementOutsideContext(requestDataContextSig);
          lastInitHostOptions = requestHostOptions;
          lastInitChartType = requestChartType;
          lastInitShowLowerPane = requestShowLowerPane;
          lastInitSignature = requestInitSignature;
          lastInitConfigSig = requestConfigSig;
          lastInitDataContextSig = requestDataContextSig;
          if (typeof displayDecimals === 'number' && isFinite(displayDecimals) && displayDecimals >= 0) {
            requestDisplayDecimals = displayDecimals;
            lastRequestedDisplayDecimals = displayDecimals;
          }

          // Match the GitHub renderer: the body owns the chart background and
          // #chart stays transparent so the SVG grid layer remains visible.
          try {
            var bg = (opts && opts.layout && opts.layout.background && opts.layout.background.color) || '#000';
            document.body.style.background = bg;
            document.getElementById('chart').style.background = 'transparent';
          } catch(_) {}

          // Defer to requestAnimationFrame so the browser completes layout
          // before we measure the container. This is the core fix for the
          // "light theme first load" bug — on Android, the WebView container
          // has 0x0 dimensions until the first paint cycle completes.
          requestAnimationFrame(function() {
            try {
              if (requestInitGeneration !== chartInitRequestGeneration) {
                return;
              }
              _doInitChart(
                requestHostOptions,
                requestChartType,
                Array.isArray(data) ? data.slice() : [],
                requestDisplayDecimals,
                requestShowLowerPane,
                requestInitSignature,
                requestConfigSig,
                requestDataContextSig,
                requestInitGeneration
              );
            } catch(e) {
              postError('initChart', e);
            }
          });
        } catch (e) {
          postError('initChart', e);
        }
      }

      function resizeChartViewport(width, height) {
        try {
          var hostSize = rememberHostViewportSize(width, height);
          var viewportSize = resolveChartViewportSize(hostSize.width, hostSize.height);
          var w = viewportSize.width;
          var h = viewportSize.height;
          if (w <= 0 || h <= 0) return;

          var chartElement = document.getElementById('chart');
          if (chartElement) {
            // Keep the host element container-fill based instead of pinning it
            // to one explicit pixel size. During fullscreen exit the native
            // viewport can report a transient intermediate layout; if the DOM
            // stays stuck on that width for even one frame, the right price
            // scale visibly shifts left before the final resize arrives.
            chartElement.style.width = '100%';
            chartElement.style.height = '100%';
          }

          if (_pendingInit) {
            _doInitChart(
              _pendingInit.opts,
              _pendingInit.chartType,
              _pendingInit.data,
              _pendingInit.displayDecimals,
              _pendingInit.showLowerPane,
              _pendingInit.initSignature,
              _pendingInit.configSig,
              _pendingInit.dataContextSig,
              _pendingInit.initRequestGeneration
            );
            return;
          }

          if (chart) {
            chart.resize(w, h);
            updateChartPaneBackgroundLayer();
            ensureMoveBarsSeries(lastDisplayDecimals);
            schedulePeriodSeparatorsUpdate();
            schedulePriceScaleHealthCheck('resize', false);
            scheduleRightPriceScaleLayoutRecovery('resize', 4);
            refreshOverlayDomLabels(_overlayPayload);
            postChartGeometry();
          }
        } catch (e) {
          postError('resizeChartViewport', e);
        }
      }

      function recoverChartSurface(width, height) {
        try {
          var chartElement = document.getElementById('chart');
          if (!chartElement) return;

          chartElement.style.width = '100%';
          chartElement.style.height = '100%';

          var hostSize = rememberHostViewportSize(width, height);
          var viewportSize = resolveChartViewportSize(hostSize.width, hostSize.height);
          var w = viewportSize.width;
          var h = viewportSize.height;
          if (w <= 0 || h <= 0) return;

          if (_pendingInit) {
            _doInitChart(
              _pendingInit.opts,
              _pendingInit.chartType,
              _pendingInit.data,
              _pendingInit.displayDecimals,
              _pendingInit.showLowerPane,
              _pendingInit.initSignature,
              _pendingInit.configSig,
              _pendingInit.dataContextSig,
              _pendingInit.initRequestGeneration
            );
            return;
          }

          if (!chart || !series) {
            if (lastInitHostOptions && lastRawSeriesData && lastRawSeriesData.length > 0) {
              _doInitChart(
                cloneSerializableValue(lastInitHostOptions, {}),
                lastInitChartType,
                lastRawSeriesData.slice(),
                lastRequestedDisplayDecimals,
                lastInitShowLowerPane,
                lastInitSignature,
                lastInitConfigSig,
                lastInitDataContextSig,
                chartInitRequestGeneration
              );
            }
            return;
          }

          chart.resize(w, h);
          updateChartPaneBackgroundLayer();
          ensureMoveBarsSeries(lastDisplayDecimals);
          var recoveryManualRange = isManualVerticalPanRangeLocked()
            ? normalizePriceRange(manualVerticalPanLockedRange)
            : null;

          if (lastRawSeriesData && lastRawSeriesData.length > 0) {
            var mapped = mapForSeries(lastRawSeriesData);
            if (mapped && mapped.length > 0) {
              clearMarketPriceLineRefs();
              series.setData(mapped);
              if (isValidPriceRange(recoveryManualRange)) {
                rememberManualVerticalPanRange(recoveryManualRange);
                applyManualVerticalPanLockedRange();
              }
              currentSeriesLength = mapped.length;
              lastBarTime = mapped[mapped.length - 1].time;
              schedulePriceScaleHealthCheck('recover_data', false);

              // Rebuild the OHLC live accumulator after surface recovery;
              // close-only Line/Area intentionally have no such object.
              if (seriesType !== 'line' && seriesType !== 'area') {
                var lastSeed = lastRawSeriesData[lastRawSeriesData.length - 1];
                _liveBar = {
                  time: lastSeed.time,
                  open: lastSeed.open,
                  high: lastSeed.high,
                  low: lastSeed.low,
                  close: lastSeed.close,
                };
                _liveBarHasObservedRealtimeUpdate = false;
              }
            }

            if (moveBarsSeries) {
              try { moveBarsSeries.setData(mapMoveBarsData(lastRawSeriesData)); } catch (_moveRecoverErr) {}
            }
          }

          _positionLinesArr = [];
          // Lightweight Charts keeps the marker primitive attached across a
          // same-series setData. Retain its handle so the next changed/empty
          // payload can update or detach it instead of leaving ghost arrows.
          applyOverlayPayload(_overlayPayload);
          setLivePriceLine(lastLivePrice);
          ensureDirectionPriceLine();
          refreshDirectionPriceLine();
          ensureMoveDirectionPriceLine();
          refreshMoveDirectionPriceLine();
          schedulePeriodSeparatorsUpdate();
          if (isValidPriceRange(recoveryManualRange)) {
            rememberManualVerticalPanRange(recoveryManualRange);
            applyManualVerticalPanLockedRange();
          }
          // Preserve a user-owned manual vertical range during delayed
          // focus/surface recovery. Auto-scale may force a refit only when the
          // preference itself is enabled.
          scheduleOverlayPriceScaleLock(chartAutoScaleEnabled === true);
          scheduleRightPriceScaleLayoutRecovery('recover_surface', RIGHT_PRICE_SCALE_LAYOUT_RECOVERY_MAX_ATTEMPTS);
          postChartGeometry();
        } catch (e) {
          postError('recoverChartSurface', e);
        }
      }

      // ResizeObserver — auto-resize the chart when the WebView container
      // dimensions change (orientation, tab switch, delayed layout).
      // Also catches the zero-dimension → real-dimension transition.
      try {
        var _resizeObserver = new ResizeObserver(function(entries) {
          var entry = entries[0];
          if (!entry) return;
          var viewportSize = resolveChartViewportSize(entry.contentRect.width, entry.contentRect.height);
          var w = viewportSize.width;
          var h = viewportSize.height;
          if (w > 0 && h > 0) {
            if (_pendingInit) {
              // Container just got real dimensions — run the deferred init.
              _doInitChart(
                _pendingInit.opts,
                _pendingInit.chartType,
                _pendingInit.data,
                _pendingInit.displayDecimals,
                _pendingInit.showLowerPane,
                _pendingInit.initSignature,
                _pendingInit.configSig,
                _pendingInit.dataContextSig,
                _pendingInit.initRequestGeneration
              );
            } else if (chart) {
              // Chart exists — just resize it to match.
              try {
                chart.resize(w, h);
                updateChartPaneBackgroundLayer();
                ensureMoveBarsSeries(lastDisplayDecimals);
                schedulePeriodSeparatorsUpdate();
                schedulePriceScaleHealthCheck('resize_observer', false);
                scheduleRightPriceScaleLayoutRecovery('resize_observer', 4);
                refreshOverlayDomLabels(_overlayPayload);
                postChartGeometry();
              } catch(_) {}
            }
          }
        });
        _resizeObserver.observe(document.getElementById('chart'));
      } catch(_) {
        // ResizeObserver not available on very old WebViews — the rAF
        // fallback in _doInitChart handles it.
      }

      function hexToRgba(hex, alpha) {
        try {
          var h = hex.replace('#', '');
          if (h.length === 3) { h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2]; }
          var r = parseInt(h.substring(0, 2), 16);
          var g = parseInt(h.substring(2, 4), 16);
          var b = parseInt(h.substring(4, 6), 16);
          if (isNaN(r) || isNaN(g) || isNaN(b)) throw new Error('bad hex');
          return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
        } catch (_e) {
          return alpha >= 0.9 ? hex : 'rgba(128,128,128,' + alpha + ')';
        }
      }

      function shouldUseMoveBarsPane() {
        // The lower pane visualizes timed candle movement. Line/Area are
        // close-only, while Renko bricks are price-driven, so all three use the
        // full main pane instead of reserving misleading lower-pane space.
        return shouldShowLowerPane
          && seriesType !== 'line'
          && seriesType !== 'area'
          && seriesType !== 'renko';
      }

      function resolvePrimaryPriceScaleMargins(hasLowerPane) {
        return {
          top: 0,
          bottom: hasLowerPane ? 0.34 : 0,
        };
      }

      function setPrimaryPriceScaleMargins(hasLowerPane) {
        if (!chart || typeof chart.priceScale !== 'function') return;
        try {
          chart.priceScale('right').applyOptions({
            visible: true,
            entireTextOnly: false,
            minimumWidth: ${CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH},
            scaleMargins: resolvePrimaryPriceScaleMargins(hasLowerPane),
          });
        } catch (_e) {}
        updateChartPaneBackgroundLayer();
      }

      function ensureMoveBarsSeries(displayDecimals) {
        if (!chart) return false;
        if (!shouldUseMoveBarsPane()) {
          setPrimaryPriceScaleMargins(false);
          return false;
        }
        if (moveBarsSeries) {
          setPrimaryPriceScaleMargins(true);
          return true;
        }
        try {
          var precision =
            typeof displayDecimals === 'number' && isFinite(displayDecimals) && displayDecimals >= 0
              ? displayDecimals
              : lastDisplayDecimals;
          moveBarsSeries = chart.addSeries(LightweightCharts.HistogramSeries, {
            priceFormat: {
              type: 'price',
              precision: precision,
              minMove: 1 / Math.pow(10, precision),
            },
            priceScaleId: 'move',
            lastValueVisible: false,
            priceLineVisible: false,
            color: moveUpColor,
          });
          chart.priceScale('move').applyOptions({
            visible: false,
            ticksVisible: false,
            borderVisible: false,
            entireTextOnly: false,
            scaleMargins: { top: 0.82, bottom: 0.02 },
          });
          if (lastRawSeriesData && lastRawSeriesData.length > 0) {
            try { moveBarsSeries.setData(mapMoveBarsData(lastRawSeriesData)); } catch (_mbSet) {}
          }
          setPrimaryPriceScaleMargins(true);
          refreshMoveDirectionPriceLine();
          return true;
        } catch (_mb) {
          moveBarsSeries = null;
          moveDirectionPriceLine = null;
          setPrimaryPriceScaleMargins(false);
          return false;
        }
      }

      function mapForSeries(data) {
        data = sanitizeSeriesData(data);
        if (!data || data.length === 0) return [];
        // Line and Area share an identical close-value series shape. Area's
        // difference is only the gradient chosen when the series is created.
        if (seriesType === 'line' || seriesType === 'area') {
          var out = new Array(data.length);
          for (var i = 0; i < data.length; i++) {
            var c = data[i];
            out[i] = { time: c.time, value: typeof c.value === 'number' ? c.value : c.close };
          }
          return out;
        }
        // Renko is already transformed by native. Preserve its fractional
        // synthetic time and OHLC box here; this layer only adapts the common
        // candle/hollow/Renko/bar series shape.
        var arr = new Array(data.length);
        for (var j = 0; j < data.length; j++) {
          var d = data[j];
          arr[j] = {
            time: d.time,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
          };
        }
        return arr;
      }

      function isFiniteNumber(value) {
        return typeof value === 'number' && isFinite(value);
      }

      var RAW_SERIES_SAME_BUCKET_RANGE_MULTIPLE = 10;
      var RAW_SERIES_SAME_BUCKET_RELATIVE_TOLERANCE = 0.02;

      function getRawSeriesBounds(item) {
        return {
          high: Math.max(item.open, item.high, item.low, item.close),
          low: Math.min(item.open, item.high, item.low, item.close),
        };
      }

      function getRawSeriesReferencePrice(item) {
        return Math.max(Math.abs(item.close), Math.abs(item.open), 1);
      }

      function isPriceCoherentWithRawSeriesDatum(item, price, rangeMultiple, relativeTolerance) {
        if (!isFiniteNumber(price)) {
          return false;
        }

        var bounds = getRawSeriesBounds(item);
        if (price >= bounds.low && price <= bounds.high) {
          return true;
        }

        var range = Math.max(0, bounds.high - bounds.low);
        var distance = price < bounds.low ? bounds.low - price : price - bounds.high;
        var toleratedDistance = Math.max(range * rangeMultiple, getRawSeriesReferencePrice(item) * relativeTolerance);
        return distance <= toleratedDistance;
      }

      function areRawSeriesDataPriceCoherent(left, right, rangeMultiple, relativeTolerance) {
        var leftBounds = getRawSeriesBounds(left);
        var rightBounds = getRawSeriesBounds(right);
        if (leftBounds.low <= rightBounds.high && rightBounds.low <= leftBounds.high) {
          return true;
        }

        return (
          isPriceCoherentWithRawSeriesDatum(left, right.open, rangeMultiple, relativeTolerance) ||
          isPriceCoherentWithRawSeriesDatum(left, right.close, rangeMultiple, relativeTolerance) ||
          isPriceCoherentWithRawSeriesDatum(right, left.open, rangeMultiple, relativeTolerance) ||
          isPriceCoherentWithRawSeriesDatum(right, left.close, rangeMultiple, relativeTolerance)
        );
      }

      function areRawSeriesDataSameBucketCoherent(left, right) {
        return areRawSeriesDataPriceCoherent(
          left,
          right,
          RAW_SERIES_SAME_BUCKET_RANGE_MULTIPLE,
          RAW_SERIES_SAME_BUCKET_RELATIVE_TOLERANCE
        );
      }

      function normalizeRawSeriesDatum(item) {
        if (!item || !isFiniteNumber(item.time) || item.time <= 0) {
          return null;
        }

        // Do not round the time. Several Renko bricks can originate from one
        // source candle and use fractional synthetic seconds to remain ordered.
        var time = item.time;
        var volume = isFiniteNumber(item.volume) && item.volume >= 0 ? item.volume : 0;
        // Normalize Line/Area to their rendered close value. Preserve any
        // supplied OHLC fields and fill missing ones from that same value.
        if (seriesType === 'line' || seriesType === 'area') {
          var value = isFiniteNumber(item.value) ? item.value : item.close;
          if (!isFiniteNumber(value)) {
            return null;
          }
          var normalized = {
            time: time,
            value: value,
            open: isFiniteNumber(item.open) ? item.open : value,
            high: isFiniteNumber(item.high) ? item.high : value,
            low: isFiniteNumber(item.low) ? item.low : value,
            close: isFiniteNumber(item.close) ? item.close : value,
            volume: volume,
          };
          return normalized;
        }

        var open = item.open;
        var rawHigh = item.high;
        var rawLow = item.low;
        var close = item.close;

        if (
          !isFiniteNumber(open) ||
          !isFiniteNumber(rawHigh) ||
          !isFiniteNumber(rawLow) ||
          !isFiniteNumber(close)
        ) {
          return null;
        }

        if (
          rawHigh < open ||
          rawHigh < close ||
          rawHigh < rawLow ||
          rawLow > open ||
          rawLow > close ||
          rawLow > rawHigh
        ) {
          return null;
        }

        var normalized = {
          time: time,
          open: open,
          high: rawHigh,
          low: rawLow,
          close: close,
          volume: volume,
        };
        return normalized;
      }

      function mergeRawSeriesDatum(existing, incoming) {
        if (!existing) {
          return incoming;
        }
        if (!areRawSeriesDataSameBucketCoherent(existing, incoming)) {
          return incoming;
        }
        var close = typeof incoming.close === 'number'
          ? incoming.close
          : (typeof incoming.value === 'number' ? incoming.value : existing.close);
        // The host candle stream is already canonical. A duplicate timestamp
        // reaching the WebView should not stitch two OHLC regimes into one
        // giant wick; keep the incoming backend/live bar authoritative.
        var merged = {
          time: existing.time,
          open: typeof incoming.open === 'number' ? incoming.open : existing.open,
          high: typeof incoming.high === 'number' ? incoming.high : Math.max(incoming.open, close),
          low: typeof incoming.low === 'number' ? incoming.low : Math.min(incoming.open, close),
          close: close,
          volume: typeof incoming.volume === 'number'
            ? incoming.volume
            : (typeof existing.volume === 'number' ? existing.volume : 0),
        };
        // Duplicate-time merges must keep the visible Line/Area value equal to
        // the same accepted close stored in the retained raw data.
        if (seriesType === 'line' || seriesType === 'area') {
          merged.value = close;
        }
        return normalizeRawSeriesDatum(merged);
      }

      function sanitizeSeriesData(data) {
        if (!Array.isArray(data) || data.length === 0) {
          return [];
        }

        // String keys preserve distinct fractional Renko timestamps; converting
        // them to integer candle seconds would collapse valid sibling bricks.
        var byTime = {};
        for (var i = 0; i < data.length; i++) {
          var normalized = normalizeRawSeriesDatum(data[i]);
          if (normalized) {
            var key = String(normalized.time);
            byTime[key] = mergeRawSeriesDatum(byTime[key], normalized);
          }
        }

        return Object.keys(byTime)
          .map(function(key) { return byTime[key]; })
          .sort(function(left, right) { return left.time - right.time; });
      }

      function cloneCachedChartContextSeriesData(data) {
        if (!Array.isArray(data) || data.length === 0) {
          return [];
        }
        var cloned = new Array(data.length);
        for (var i = 0; i < data.length; i++) {
          var item = data[i];
          if (!item || typeof item !== 'object') {
            return [];
          }
          cloned[i] = Object.assign({}, item);
        }
        return cloned;
      }

      function touchCachedChartContext(dataContextSig) {
        var existingIndex = cachedChartContextLru.indexOf(dataContextSig);
        if (existingIndex >= 0) {
          cachedChartContextLru.splice(existingIndex, 1);
        }
        cachedChartContextLru.push(dataContextSig);
      }

      function rememberCachedChartContextSnapshot(
        dataContextSig,
        cachedSeriesType,
        rawSeriesData,
        displayDecimals
      ) {
        var contextSig = typeof dataContextSig === 'string' ? dataContextSig : '';
        var contextSeriesType =
          typeof cachedSeriesType === 'string' ? cachedSeriesType : '';
        var cachedData = cloneCachedChartContextSeriesData(rawSeriesData);
        if (!contextSig || !contextSeriesType || cachedData.length === 0) {
          return false;
        }

        var cachedDisplayDecimals =
          typeof displayDecimals === 'number' &&
          isFinite(displayDecimals) &&
          displayDecimals >= 0
            ? Math.max(0, Math.min(10, Math.round(displayDecimals)))
            : null;
        cachedChartContextSnapshots[contextSig] = {
          dataContextSig: contextSig,
          seriesType: contextSeriesType,
          data: cachedData,
          displayDecimals: cachedDisplayDecimals,
        };
        touchCachedChartContext(contextSig);

        while (cachedChartContextLru.length > CHART_CONTEXT_SNAPSHOT_CACHE_CAPACITY) {
          var evictedContextSig = cachedChartContextLru.shift();
          if (evictedContextSig) {
            delete cachedChartContextSnapshots[evictedContextSig];
          }
        }
        return true;
      }

      function readCachedChartContextSnapshot(dataContextSig, requestedSeriesType) {
        var contextSig = typeof dataContextSig === 'string' ? dataContextSig : '';
        var contextSeriesType =
          typeof requestedSeriesType === 'string' ? requestedSeriesType : '';
        var cached = contextSig ? cachedChartContextSnapshots[contextSig] : null;
        if (
          !cached ||
          cached.seriesType !== contextSeriesType ||
          !Array.isArray(cached.data) ||
          cached.data.length === 0
        ) {
          return null;
        }

        var clonedData = cloneCachedChartContextSeriesData(cached.data);
        if (clonedData.length === 0) {
          return null;
        }
        touchCachedChartContext(contextSig);
        return {
          dataContextSig: contextSig,
          seriesType: cached.seriesType,
          data: clonedData,
          displayDecimals: cached.displayDecimals,
        };
      }

      function updateCachedChartContextSnapshotWithDatum(
        dataContextSig,
        cachedSeriesType,
        datum,
        displayDecimals
      ) {
        var contextSig = typeof dataContextSig === 'string' ? dataContextSig : '';
        var cached = contextSig ? cachedChartContextSnapshots[contextSig] : null;
        if (
          !cached ||
          cached.seriesType !== cachedSeriesType ||
          !datum ||
          typeof datum !== 'object' ||
          !Array.isArray(cached.data) ||
          cached.data.length === 0
        ) {
          return false;
        }

        var cachedLastIndex = cached.data.length - 1;
        var cachedLast = cached.data[cachedLastIndex];
        if (
          !cachedLast ||
          typeof cachedLast.time !== 'number' ||
          typeof datum.time !== 'number' ||
          datum.time < cachedLast.time
        ) {
          return false;
        }
        var cachedDatum = Object.assign({}, datum);
        if (datum.time === cachedLast.time) {
          cached.data[cachedLastIndex] = cachedDatum;
        } else {
          cached.data.push(cachedDatum);
        }
        if (
          typeof displayDecimals === 'number' &&
          isFinite(displayDecimals) &&
          displayDecimals >= 0
        ) {
          cached.displayDecimals = Math.max(
            0,
            Math.min(10, Math.round(displayDecimals))
          );
        }
        touchCachedChartContext(contextSig);
        return true;
      }

      function upsertRawSeriesDatum(tick) {
        var normalized = normalizeRawSeriesDatum(tick);
        if (!normalized) {
          return null;
        }
        if (!Array.isArray(lastRawSeriesData)) {
          lastRawSeriesData = [];
        }

        var lastIndex = lastRawSeriesData.length - 1;
        if (lastIndex >= 0) {
          var last = lastRawSeriesData[lastIndex];
          if (normalized.time < last.time) {
            return null;
          }
          if (normalized.time === last.time) {
            lastRawSeriesData[lastIndex] = normalized;
            updateCachedChartContextSnapshotWithDatum(
              lastInitDataContextSig,
              seriesType,
              normalized,
              lastDisplayDecimals
            );
            return normalized;
          }
        }

        lastRawSeriesData.push(normalized);
        updateCachedChartContextSnapshotWithDatum(
          lastInitDataContextSig,
          seriesType,
          normalized,
          lastDisplayDecimals
        );
        return normalized;
      }

      // One histogram point per bar: |close − open|, coloured by direction.
      function mapMoveBarsData(data) {
        if (!data || data.length === 0) return [];
        var out = new Array(data.length);
        for (var i = 0; i < data.length; i++) {
          var d = data[i];
          var open = typeof d.open === 'number' ? d.open : d.close;
          var close = typeof d.close === 'number' ? d.close : (typeof d.value === 'number' ? d.value : open);
          var up = close >= open;
          out[i] = {
            time: d.time,
            value: Math.abs(close - open),
            color: up ? moveUpColor : moveDownColor,
          };
        }
        return out;
      }

      // One histogram point derived from the current live bar state.
      function makeMoveBarPoint(bar) {
        var up = bar.close >= bar.open;
        return {
          time: bar.time,
          value: Math.abs(bar.close - bar.open),
          color: up ? moveUpColor : moveDownColor,
        };
      }

      function readChartDataReplacementContext(options) {
        return options && typeof options.dataContextSig === 'string'
          ? options.dataContextSig
          : '';
      }

      function discardPendingChartDataReplacementOutsideContext(dataContextSig) {
        if (!pendingChartDataReplacement) return;
        var requestedContextSig = typeof dataContextSig === 'string' ? dataContextSig : '';
        var pendingContextSig = pendingChartDataReplacement.dataContextSig || '';
        if (
          requestedContextSig &&
          pendingContextSig &&
          pendingContextSig !== requestedContextSig
        ) {
          pendingChartDataReplacement = null;
        }
      }

      function queuePendingChartDataReplacement(data, options) {
        var replacementOptions = options && typeof options === 'object'
          ? Object.assign({}, options)
          : {};
        var replacementContextSig = readChartDataReplacementContext(replacementOptions);
        if (
          replacementContextSig &&
          lastInitDataContextSig &&
          replacementContextSig !== lastInitDataContextSig
        ) {
          return false;
        }
        pendingChartDataReplacement = {
          data: Array.isArray(data) ? data.slice() : [],
          options: replacementOptions,
          dataContextSig: replacementContextSig,
        };
        return true;
      }

      function replayPendingChartDataReplacement(dataContextSig) {
        if (!pendingChartDataReplacement || !series || _pendingInit) {
          return false;
        }
        var expectedContextSig = typeof dataContextSig === 'string' ? dataContextSig : '';
        var pending = pendingChartDataReplacement;
        if (
          pending.dataContextSig &&
          expectedContextSig &&
          pending.dataContextSig !== expectedContextSig
        ) {
          pendingChartDataReplacement = null;
          return false;
        }
        pendingChartDataReplacement = null;
        return updateChartData(pending.data, pending.options) === true;
      }

      function updateChartData(data, options) {
        try {
          if (!series || _pendingInit) {
            var queuedReplacement = queuePendingChartDataReplacement(data, options);
            if (!series && !_pendingInit) {
              // Keep the payload for the recovery init, but also wake the
              // native bridge immediately instead of waiting for its watchdog.
              postError('updateChartData', new Error('series not initialized; replacement queued'));
            }
            // Queued is not the same as synchronously applied. Callers that
            // require a paint certificate must wait for replay + acknowledgement.
            return false;
          }
          var updateOptions = options && typeof options === 'object' ? options : {};
          var preserveVisibleLogicalSpan = updateOptions.preserveVisibleLogicalSpan === true;
          var resetVisibleRange = updateOptions.resetVisibleRange === true;
          var suppressContextOverlayRebuild =
            updateOptions.suppressContextOverlayRebuild === true;
          var paintedDataContextSig =
            typeof updateOptions.dataContextSig === 'string' ? updateOptions.dataContextSig : '';
          var paintToken =
            typeof updateOptions.paintToken === 'string' ? updateOptions.paintToken : '';
          var paintRevision = null;
          if (paintToken) {
            var paintRevisionSeparator = paintToken.lastIndexOf(':');
            var parsedPaintRevision = Number(
              paintRevisionSeparator >= 0
                ? paintToken.slice(paintRevisionSeparator + 1)
                : ''
            );
            if (isFinite(parsedPaintRevision) && parsedPaintRevision > 0) {
              paintRevision = parsedPaintRevision;
            }
          }
          if (
            paintRevision !== null &&
            (
              paintRevision < lastAppliedChartDataPaintRevision ||
              (
                paintRevision === lastAppliedChartDataPaintRevision &&
                lastAppliedChartDataPaintToken &&
                paintToken !== lastAppliedChartDataPaintToken
              )
            )
          ) {
            return false;
          }
          if (
            paintedDataContextSig &&
            lastInitDataContextSig &&
            paintedDataContextSig !== lastInitDataContextSig &&
            paintRevision === null
          ) {
            return false;
          }
          cancelPendingTickFlush();
          pendingTick = null;
          lastAppliedLiveTickRevision = 0;
          var previousRawSeriesData = lastRawSeriesData && lastRawSeriesData.length > 0
            ? lastRawSeriesData.slice()
            : [];
          var previousVisibleLogicalRange = getVisibleLogicalRangeSnapshot();
          var manualRangeBeforeUpdate = isManualVerticalPanRangeLocked()
            ? normalizePriceRange(manualVerticalPanLockedRange)
            : null;
          // Manual vertical ownership is scoped to the current symbol and
          // timeframe. An explicit reset (used for context replacement) must
          // win over an old numeric window or the new series can be painted
          // entirely outside the visible axis.
          var shouldPreserveManualPriceScale =
            !resetVisibleRange && isValidPriceRange(manualRangeBeforeUpdate);
          if (resetVisibleRange) {
            clearManualPriceScaleState();
          }
          // Capture the user-owned numeric window before setData; chart data
          // replacement is allowed to change candles, never this manual range.
          if (paintedDataContextSig) {
            resetAreaDirectionForContext(paintedDataContextSig);
          }
          lastRawSeriesData = sanitizeSeriesData(data);
          try {
            chartDebugLog('[WEBVIEW-CANDLE] updateChartData', {
              count: lastRawSeriesData.length,
              firstTime: lastRawSeriesData[0] ? lastRawSeriesData[0].time : null,
              lastTime: lastRawSeriesData[lastRawSeriesData.length - 1] ? lastRawSeriesData[lastRawSeriesData.length - 1].time : null,
            });
          } catch (_logErr) {}
          var mapped = mapForSeries(lastRawSeriesData);
          currentSeriesLength = mapped.length;
          clearMarketPriceLineRefs();
          series.setData(mapped);
          if (paintRevision !== null) {
            lastAppliedChartDataPaintRevision = paintRevision;
            lastAppliedChartDataPaintToken = paintToken;
          }
          candleCountdownSeriesContextSig = paintedDataContextSig;
          if (paintedDataContextSig) {
            lastInitDataContextSig = paintedDataContextSig;
            // Symbol/timeframe switches normally replace data on the retained
            // chart instead of rebuilding it. Record that successful paint as
            // the applied context so a later same-context shell rebuild keeps
            // this context's legitimate manual price window.
            appliedChartDataContextSig = paintedDataContextSig;
          }
          if (mapped.length > 0 && paintedDataContextSig) {
            try {
              rememberCachedChartContextSnapshot(
                paintedDataContextSig,
                seriesType,
                lastRawSeriesData,
                lastDisplayDecimals
              );
            } catch (_contextCacheUpdateError) {}
          }
          if (mapped.length > 0 && paintedDataContextSig && paintToken) {
            // Native keeps this WebView fully transparent until it receives the
            // acknowledgement. Android may defer visual frame callbacks for a
            // transparent hardware WebView, so waiting for one creates a
            // circular wait that is only broken by the 3 s native watchdog.
            // setData() has completed synchronously at this point; acknowledge
            // the applied, non-empty, tokenized series now so cached A -> B -> A
            // revisits can reveal the replacement immediately.
            postChartDataPainted(paintedDataContextSig, paintToken);
          }
          // Area direction is presentation-only. Keep it downstream from the
          // successful data-paint acknowledgement and contain any unexpected
          // failure so style refresh work can never strand native loading.
          try {
            refreshAreaSeriesDirection(true);
          } catch (_areaDirectionRefreshError) {}
          if (window._drawingManager && typeof window._drawingManager.refreshCrosshairData === 'function') {
            try { window._drawingManager.refreshCrosshairData(); } catch (_crosshairRefreshErr) {}
          }
          var didPrependHistory =
            !resetVisibleRange &&
            previousRawSeriesData.length > 0 &&
            lastRawSeriesData.length > 0 &&
            lastRawSeriesData[0] &&
            previousRawSeriesData[0] &&
            typeof lastRawSeriesData[0].time === 'number' &&
            typeof previousRawSeriesData[0].time === 'number' &&
            lastRawSeriesData[0].time < previousRawSeriesData[0].time;
          var didReplaceVisibleSeries =
            !didPrependHistory &&
            (resetVisibleRange || shouldResetViewportForSeriesReplacement(previousRawSeriesData, lastRawSeriesData));
          // Manual price-window ownership survives same-context history
          // replacements. Symbol/timeframe changes arrive with an explicit
          // reset so unrelated price regimes can never remain off-screen.
          var priceScaleReason = didPrependHistory
            ? 'update_data_prepend_history'
            : (didReplaceVisibleSeries ? 'update_data_replace_series' : 'update_data');
          // The first Area paint is intentionally lightweight. When its one
          // bounded history page arrives, expand only an untouched live-edge
          // viewport; a trader-owned pan or zoom keeps the normal prepend
          // restoration path below.
          var expandedAreaRecentViewport =
            !resetVisibleRange &&
            didPrependHistory &&
            shouldExpandAreaRecentViewportAfterPrepend(
              previousRawSeriesData,
              lastRawSeriesData,
              previousVisibleLogicalRange
            );
          if (expandedAreaRecentViewport) {
            applyRecentViewport(mapped.length);
          }
          var restoredPrependedViewport =
            !expandedAreaRecentViewport &&
            !resetVisibleRange &&
            restorePrependedHistoryViewport(
              previousRawSeriesData,
              lastRawSeriesData,
              previousVisibleLogicalRange
            );
          var restoredStableReplacementViewport = false;
          if (
            !restoredPrependedViewport &&
            !resetVisibleRange &&
            preserveVisibleLogicalSpan &&
            didReplaceVisibleSeries &&
            mapped.length > 0
          ) {
            restoredStableReplacementViewport = followLiveRightEdge(previousVisibleLogicalRange, mapped.length);
          }
          if (
            !shouldPreserveManualPriceScale &&
            (previousRawSeriesData.length === 0 || didReplaceVisibleSeries)
          ) {
            if (restoredStableReplacementViewport) {
              resetVisiblePriceScaleForStableReplacement(priceScaleReason);
            } else {
              resetVisiblePriceScaleForFreshSeries(priceScaleReason);
            }
          }
          if (restoredStableReplacementViewport && !shouldPreserveManualPriceScale) {
            healCollapsedPriceScaleRange(priceScaleReason, true);
          }
          if (shouldPreserveManualPriceScale) {
            // setData can disturb the fixed scale — reassert the user's
            // locked price range and reposition trade markers against it.
            applyManualVerticalPanLockedRange();
            scheduleOverlayDomRefresh();
          }
          if (
            !restoredPrependedViewport &&
            !restoredStableReplacementViewport &&
            mapped.length > 0 &&
            (previousRawSeriesData.length === 0 || didReplaceVisibleSeries)
          ) {
            applyRecentViewport(mapped.length);
            if (!shouldPreserveManualPriceScale) {
              scheduleFreshSeriesVerticalCenter(priceScaleReason, true);
            }
          }
          if (!restoredStableReplacementViewport && !shouldPreserveManualPriceScale) {
            schedulePriceScaleHealthCheck(
              priceScaleReason,
              didPrependHistory || didReplaceVisibleSeries,
              didPrependHistory || didReplaceVisibleSeries ? 5 : 1
            );
          }
          scheduleRightPriceScaleLayoutRecovery(
            priceScaleReason,
            didPrependHistory || didReplaceVisibleSeries ? RIGHT_PRICE_SCALE_LAYOUT_RECOVERY_MAX_ATTEMPTS : 3
          );
          ensureMoveBarsSeries(lastDisplayDecimals);
          if (moveBarsSeries) {
            try { moveBarsSeries.setData(mapMoveBarsData(lastRawSeriesData)); } catch (_mb) {}
          }

          // CRITICAL BUGFIX: setData natively obliterates all PriceLines previously bound to the series!
          // We must explicitly reconstruct the dynamic trade overlays immediately after setting chart data.
          _positionLinesArr = [];
          // Do not drop the live marker handle here: setData preserves the
          // primitive and dropping only our reference would make it impossible
          // to detach before attaching the next history payload.
          if (!suppressContextOverlayRebuild && _overlayPayload) {
            applyOverlayPayload(_overlayPayload);
          }
          setLivePriceLine(lastLivePrice);
          if (shouldPreserveManualPriceScale) {
            rememberManualVerticalPanRange(manualRangeBeforeUpdate);
            applyManualVerticalPanLockedRange();
            postChartGeometry();
          }
          schedulePeriodSeparatorsUpdate();

          if (mapped.length > 0) {
            lastBarTime = mapped[mapped.length - 1].time;
            // A full replacement resets the OHLC accumulator from its final
            // displayed candle/brick; Line and Area remain value-only.
            if (seriesType !== 'line' && seriesType !== 'area') {
              var lastSeed = lastRawSeriesData[lastRawSeriesData.length - 1];
              _liveBar = {
                time: lastSeed.time,
                open: lastSeed.open,
                high: lastSeed.high,
                low: lastSeed.low,
                close: lastSeed.close,
              };
              _liveBarHasObservedRealtimeUpdate = false;
            }
            // Symbol / timeframe switch: reposition both direction lines to
            // the new dataset's last close + move magnitude so they don't
            // linger at the previous symbol's price.
            refreshDirectionPriceLine();
            refreshMoveDirectionPriceLine();
          } else {
            lastBarTime = 0;
            _liveBar = null;
            _liveBarHasObservedRealtimeUpdate = false;
          }
          scheduleMarketPriceScaleDomOnly();
          return true;
        } catch (e) {
          postError('updateChartData', e);
          return false;
        }
      }

      function clearChartContextPresentationForActivation() {
        // A cached candle swap happens before native commits the target symbol's
        // overlays and drawings. Remove every old-context decoration first so
        // B's positions, Bid badge, or drawings can never flash on A.
        lastLivePrice = null;
        lastBidPrice = null;
        lastAskPrice = null;
        marketPriceLinesVisible = false;
        pendingHorizontalOverlayApply = false;
        pendingVerticalOverlayApply = false;
        verticalGestureDomWorkPending = false;
        clearMarketPriceLineRefs();

        var emptyOverlayPayload = { priceLines: [], markers: [], tradeHistorySegments: [] };
        _overlayPayload = emptyOverlayPayload;
        _appliedOverlayPayload = emptyOverlayPayload;
        clearOverlayPriceLines();
        clearOverlayMarkers();
        try { refreshOverlayDomLabels(emptyOverlayPayload); } catch (_overlayClearError) {}

        // DrawingToolsManager.setSerializedDrawings is the non-publishing
        // replacement path. Publishing clear APIs could send an empty history
        // back to native and incorrectly erase the target symbol bucket.
        if (
          window._drawingManager &&
          typeof window._drawingManager.setSerializedDrawings === 'function'
        ) {
          try {
            window._drawingManager.setSerializedDrawings([]);
          } catch (_drawingContextClearError) {}
        }
      }

      // Warm symbol switch: remove the old symbol's overlays, apply the target
      // symbol's cached candles and price precision, then report success only
      // after setData succeeds. Native changes the selected symbol after this reply.
      function activateCachedChartContext(
        dataContextSig,
        paintToken,
        displayDecimals,
        requestId
      ) {
        var requestedDataContextSig =
          typeof dataContextSig === 'string' ? dataContextSig : '';
        var requestedPaintToken = typeof paintToken === 'string' ? paintToken : '';
        try {
          if (
            !requestedDataContextSig ||
            !requestedPaintToken ||
            !series ||
            _pendingInit
          ) {
            postChartContextActivated(
              requestId,
              requestedDataContextSig,
              requestedPaintToken,
              false
            );
            return false;
          }

          var cachedSnapshot = readCachedChartContextSnapshot(
            requestedDataContextSig,
            seriesType
          );
          if (!cachedSnapshot || cachedSnapshot.data.length === 0) {
            postChartContextActivated(
              requestId,
              requestedDataContextSig,
              requestedPaintToken,
              false
            );
            return false;
          }

          // Precision is part of the cached symbol snapshot. The caller's value
          // may still describe B while this command activates A, so use it only
          // for a legacy/future entry that has no cached precision.
          var cachedDisplayDecimals = cachedSnapshot.displayDecimals;
          var requestedDisplayDecimals =
            typeof displayDecimals === 'number' &&
            isFinite(displayDecimals) &&
            displayDecimals >= 0
              ? displayDecimals
              : lastDisplayDecimals;
          var targetDisplayDecimals =
            typeof cachedDisplayDecimals === 'number' &&
            isFinite(cachedDisplayDecimals) &&
            cachedDisplayDecimals >= 0
              ? cachedDisplayDecimals
              : requestedDisplayDecimals;

          clearChartContextPresentationForActivation();
          setDisplayDecimals(targetDisplayDecimals);
          var didApplyCachedSnapshot = updateChartData(cachedSnapshot.data, {
            preserveVisibleLogicalSpan: false,
            resetVisibleRange: true,
            suppressContextOverlayRebuild: true,
            dataContextSig: requestedDataContextSig,
            paintToken: requestedPaintToken,
          });
          if (didApplyCachedSnapshot !== true) {
            postChartContextActivated(
              requestId,
              requestedDataContextSig,
              requestedPaintToken,
              false
            );
            return false;
          }

          postChartContextActivated(
            requestId,
            requestedDataContextSig,
            requestedPaintToken,
            true
          );
          return true;
        } catch (_cachedContextActivationError) {
          postChartContextActivated(
            requestId,
            requestedDataContextSig,
            requestedPaintToken,
            false
          );
          return false;
        }
      }

      // Backend OHLC patch state mirrored inside the WebView.
      var _liveBar = null; // { time, open, high, low, close }
      var _liveBarHasObservedRealtimeUpdate = false;

      function applyTickUpdate(tick) {
        if (!series || !tick || typeof tick.time !== 'number') return false;
        if (tick.time < lastBarTime) {
          try {
            chartDebugLog('[WEBVIEW-CANDLE] applyTickUpdate_rejected', {
              reason: 'stale_tick',
              tickTime: tick.time,
              lastBarTime: lastBarTime,
            });
          } catch (_logErr) {}
          return false;
        }
        var previousSeriesLength = currentSeriesLength;
        var previousVisibleRange = getVisibleLogicalRangeSnapshot();
        var normalizedTick = upsertRawSeriesDatum(tick);
        if (!normalizedTick) {
          try {
            chartDebugLog('[WEBVIEW-CANDLE] applyTickUpdate_rejected', {
              reason: 'invalid_or_old_tick',
              tickTime: tick.time,
              lastBarTime: lastBarTime,
            });
          } catch (_logErr) {}
          return false;
        }
        var appendedNewBar = currentSeriesLength === 0 || normalizedTick.time > lastBarTime;
        var shouldFollowLiveEdge = appendedNewBar && shouldFollowLiveRightEdge(previousVisibleRange, previousSeriesLength);
        // The host has already transformed Renko into displayed OHLC bricks.
        // This path updates one final brick; multi-brick path changes arrive via
        // updateChartData/setData so the complete synthetic sequence is replaced.
        var bar;
        if (seriesType === 'line' || seriesType === 'area') {
          bar = { time: normalizedTick.time, value: typeof normalizedTick.value === 'number' ? normalizedTick.value : normalizedTick.close };
        } else {
          bar = {
            time: normalizedTick.time,
            open: normalizedTick.open,
            high: normalizedTick.high,
            low: normalizedTick.low,
            close: normalizedTick.close,
          };
        }
        // Sync internal accumulator with full OHLC from host
        _liveBar = { time: normalizedTick.time, open: normalizedTick.open, high: normalizedTick.high, low: normalizedTick.low, close: normalizedTick.close };
        _liveBarHasObservedRealtimeUpdate = true;
        try {
          chartDebugLog('[WEBVIEW-CANDLE] applyTickUpdate', {
            time: normalizedTick.time,
            appended: appendedNewBar,
            count: lastRawSeriesData.length,
          });
        } catch (_logErr) {}
        series.update(bar);
        refreshAreaSeriesDirection(false);
        if (window._drawingManager && typeof window._drawingManager.refreshCrosshairData === 'function') {
          try { window._drawingManager.refreshCrosshairData(); } catch (_crosshairRefreshErr) {}
        }
        schedulePriceScaleHealthCheck('tick_update', false);
        currentSeriesLength = lastRawSeriesData.length;
        schedulePeriodSeparatorsUpdate();
        if (shouldFollowLiveEdge) {
          followLiveRightEdge(previousVisibleRange, currentSeriesLength);
        }
        if (normalizedTick.time >= lastBarTime) {
          lastBarTime = normalizedTick.time;
        }
        scheduleMarketPriceScaleDomOnly();
        ensureMoveBarsSeries(lastDisplayDecimals);
        // The auxiliary movement series accepts OHLC bars only. It is never
        // created for Line/Area, and Renko is excluded by shouldUseMoveBarsPane.
        if (moveBarsSeries && seriesType !== 'line' && seriesType !== 'area') {
          try { moveBarsSeries.update(makeMoveBarPoint(_liveBar)); } catch (_mb) {}
        }
        refreshBidPriceLineColor();
        refreshDirectionPriceLine();
        refreshMoveDirectionPriceLine();
        refreshOverlayDomLabelsWhenIdle(_overlayPayload);
        return true;
      }

      function cancelPendingTickFlush() {
        if (tickFlushHandle) {
          try { cancelAnimationFrame(tickFlushHandle); } catch (_) {}
          tickFlushHandle = 0;
        }
        if (tickFlushFallbackHandle) {
          try { clearTimeout(tickFlushFallbackHandle); } catch (_) {}
          tickFlushFallbackHandle = 0;
        }
      }

      function schedulePendingTickFlush() {
        if (tickFlushHandle || tickFlushFallbackHandle) return;
        // Android WebView can postpone or drop a requested animation frame
        // during tab/background transitions. Keep rAF as the fast paint path,
        // but guarantee that the newest coalesced candle+Bid transaction cannot
        // leave a non-zero handle blocking every later quote indefinitely.
        tickFlushFallbackHandle = setTimeout(
          flushPendingTick,
          LIVE_TICK_FLUSH_FALLBACK_MS
        );
        try {
          tickFlushHandle = requestAnimationFrame(flushPendingTick);
        } catch (_) {
          tickFlushHandle = 0;
        }
      }

      function flushPendingTick() {
        try {
          // Whichever scheduler won cancels the other. A callback that was
          // already queued may still run, but pendingTick will then be empty.
          cancelPendingTickFlush();
          var pending = pendingTick;
          pendingTick = null;
          if (!pending) return;
          var tick = pending.tick || pending;
          var revision = typeof pending.revision === 'number' && isFinite(pending.revision)
            ? pending.revision
            : null;
          var pendingDataContextSig =
            typeof pending.dataContextSig === 'string' ? pending.dataContextSig : '';
          if (
            pendingDataContextSig &&
            pendingDataContextSig !== lastInitDataContextSig
          ) return;
          if (revision !== null && revision <= lastAppliedLiveTickRevision) return;
          var applied = false;
          var tickApplyError = null;
          try {
            applied = applyTickUpdate(tick);
          } catch (applyError) {
            tickApplyError = applyError;
          }
          var synchronizedLivePriceLine = false;
          if (applied && pending.syncLivePriceLine === true) {
            synchronizedLivePriceLine = setLivePriceLine(
              pending.showLivePriceLine === true ? pending.livePrice : null
            ) === true;
          }
          // This revision is atomic: a rejected/stale candle must not advance
          // its marker independently. The accepted candle close/value and the
          // existing single Bid line always represent one live generation.
          if (revision !== null && applied && synchronizedLivePriceLine) {
            lastAppliedLiveTickRevision = revision;
          } else if (revision !== null && applied && pending.syncLivePriceLine === true) {
            var lineRetryCount = typeof pending.lineRetryCount === 'number'
              ? pending.lineRetryCount
              : 0;
            if (lineRetryCount < LIVE_TICK_LINE_RETRY_LIMIT) {
              pending.lineRetryCount = lineRetryCount + 1;
              if (
                !pendingTick ||
                typeof pendingTick.revision !== 'number' ||
                pendingTick.revision <= revision
              ) {
                pendingTick = pending;
                schedulePendingTickFlush();
              }
            }
          }
          if (tickApplyError) {
            throw tickApplyError;
          }
        } catch (e) {
          if (typeof e.message === 'string' && e.message.indexOf('Cannot update oldest data') >= 0) {
            return; // benign race
          }
          postError('flushPendingTick', e);
        }
      }

      function updateTick(tick) {
        if (!tick || typeof tick.time !== 'number') return;
        try {
          chartDebugLog('[WEBVIEW-CANDLE] updateTick_queued', { time: tick.time });
        } catch (_logErr) {}
        pendingTick = { tick: tick };
        schedulePendingTickFlush();
      }

      /**
       * IMPORTANT — DO NOT SEPARATE OR BYPASS THIS ATOMIC WEBVIEW TRANSACTION.
       * Native has already placed the latest backend Bid into the forming
       * candle's close. This function deliberately reads the ONE live Bid line
       * from that accepted candle, then queues the candle and line together.
       * As the backend Bid rises or falls, both must move up or down in the same
       * rendered revision. Updating either one through a separate path can make
       * the line freeze or display a price that does not match the live candle.
       */
      function updateLiveTick(update) {
        if (!update || !update.candle || typeof update.candle.time !== 'number') return;
        var updateDataContextSig =
          typeof update.dataContextSig === 'string' ? update.dataContextSig : '';
        if (!updateDataContextSig || updateDataContextSig !== lastInitDataContextSig) return;
        var revision = Number(update.revision);
        if (!isFinite(revision) || revision <= lastAppliedLiveTickRevision) return;
        // Close-only series expose their accepted live price as value; all
        // OHLC types, including transformed Renko, expose it as close.
        var acceptedCandlePrice = seriesType === 'line' || seriesType === 'area'
          ? Number(update.candle.value)
          : Number(update.candle.close);
        if (!isFinite(acceptedCandlePrice) || acceptedCandlePrice <= 0) return;
        if (
          pendingTick &&
          typeof pendingTick.revision === 'number' &&
          pendingTick.revision >= revision
        ) {
          return;
        }
        pendingTick = {
          tick: update.candle,
          livePrice: acceptedCandlePrice,
          showLivePriceLine: update.showLivePriceLine === true,
          syncLivePriceLine: true,
          dataContextSig: updateDataContextSig,
          revision: revision,
          lineRetryCount: 0,
        };
        schedulePendingTickFlush();
      }

      // Area owns one performance color across its stroke, live guide, and
      // right-axis badge. Other chart types retain the forming-candle color.
      function pickLivePriceColor() {
        if (seriesType === 'area') {
          var areaDirection = lastAreaDirection === 'up' || lastAreaDirection === 'down'
            ? lastAreaDirection
            : resolveAreaSeriesDirection(lastRawSeriesData);
          return pickAreaSeriesColor(areaDirection);
        }
        if (!_liveBar || typeof _liveBar.close !== 'number' || typeof _liveBar.open !== 'number') {
          return barUpColor;
        }
        return _liveBar.close >= _liveBar.open ? barUpColor : barDownColor;
      }

      // Create the dedicated direction-coloured price line at the live close
      // if it doesn't exist yet. Safe to call repeatedly — no-ops once the
      // instance is bound.
      function ensureDirectionPriceLine() {
        try {
          if (!directionPriceLineVisible) return;
          if (marketPriceLinesVisible) return;
          if (directionPriceLine || !series) return;
          if (!_liveBar || typeof _liveBar.close !== 'number') return;
          directionPriceLine = series.createPriceLine({
            price: _liveBar.close,
            color: pickLivePriceColor(),
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle ? LightweightCharts.LineStyle.Solid : 0,
            axisLabelVisible: false,
          });
        } catch (_e) {
          directionPriceLine = null;
        }
      }

      // Re-price and re-tint the direction line on every tick. Only calls
      // applyOptions on the price-line instance we own — never on the main
      // series — so it can't trigger a history redraw. If applyOptions
      // fails (e.g. the series was torn down underneath) we null the ref
      // so the next tick recreates a fresh instance on the live series.
      function refreshDirectionPriceLine() {
        if (!_liveBar || typeof _liveBar.close !== 'number') return;
        if (!directionPriceLineVisible || marketPriceLinesVisible) {
          if (directionPriceLine && series) {
            try { series.removePriceLine(directionPriceLine); } catch (_e) {}
            directionPriceLine = null;
          }
          return;
        }
        if (!directionPriceLine) {
          ensureDirectionPriceLine();
          return;
        }
        var color = pickLivePriceColor();
        try {
          directionPriceLine.applyOptions({ price: _liveBar.close, color: color });
        } catch (_e) {
          directionPriceLine = null;
        }
      }

      function setLastPriceLineVisible(visible) {
        directionPriceLineVisible = visible !== false;
        refreshDirectionPriceLine();
      }

      // Current move magnitude for the active bar (|close − open|). This is
      // the y-value the move-bars pane plots, and where its direction line
      // should sit.
      function pickLiveMoveValue() {
        if (!_liveBar || typeof _liveBar.close !== 'number' || typeof _liveBar.open !== 'number') {
          return 0;
        }
        return Math.abs(_liveBar.close - _liveBar.open);
      }

      function pickLiveSignedMoveValue() {
        if (!_liveBar || typeof _liveBar.close !== 'number' || typeof _liveBar.open !== 'number') {
          return 0;
        }
        return _liveBar.close - _liveBar.open;
      }

      function makeMoveDirectionPriceLineOptions() {
        var color = pickLivePriceColor();
        return {
          price: pickLiveMoveValue(),
          color: color,
          lineWidth: 1,
          lineStyle: LightweightCharts.LineStyle ? LightweightCharts.LineStyle.Solid : 0,
          axisLabelVisible: false,
          title: '',
        };
      }

      // Create the move-bars pane's direction line the first time we have a
      // live bar. Scoped to the move-bars series so it renders on the move
      // price scale ('move'), not the main candle scale.
      function ensureMoveDirectionPriceLine() {
        try {
          if (moveDirectionPriceLine || !moveBarsSeries) return;
          if (!_liveBar || typeof _liveBar.close !== 'number') return;
          moveDirectionPriceLine = moveBarsSeries.createPriceLine(makeMoveDirectionPriceLineOptions());
        } catch (_e) {
          moveDirectionPriceLine = null;
        }
      }

      // Re-price + re-tint the move-bars direction line every tick. Again,
      // only touches the price-line instance — move-bars series itself stays
      // untouched. Same teardown-recovery trick: null the ref on failure so
      // the next call recreates rather than re-throwing forever.
      function refreshMoveDirectionPriceLine() {
        if (!moveBarsSeries || !_liveBar) return;
        if (!moveDirectionPriceLine) {
          ensureMoveDirectionPriceLine();
          return;
        }
        try {
          moveDirectionPriceLine.applyOptions(makeMoveDirectionPriceLineOptions());
        } catch (_e) {
          moveDirectionPriceLine = null;
        }
      }

      function trackMarketPriceLine(line) {
        if (line && marketPriceLineRefs.indexOf(line) === -1) {
          marketPriceLineRefs.push(line);
        }
        return line;
      }

      function forgetMarketPriceLine(line) {
        if (!line || marketPriceLineRefs.length === 0) return;
        var next = [];
        for (var i = 0; i < marketPriceLineRefs.length; i++) {
          if (marketPriceLineRefs[i] !== line) {
            next.push(marketPriceLineRefs[i]);
          }
        }
        marketPriceLineRefs = next;
      }

      function removeMarketPriceLine(line) {
        if (!line) return null;
        if (series) {
          try { series.removePriceLine(line); } catch (_e) {}
        }
        forgetMarketPriceLine(line);
        return null;
      }

      function clearMarketPriceLineRefs() {
        if (series) {
          for (var i = 0; i < marketPriceLineRefs.length; i++) {
            try { series.removePriceLine(marketPriceLineRefs[i]); } catch (_e) {}
          }
        }
        marketPriceLineRefs = [];
        bidPriceLine = null;
        askPriceLine = null;
      }

      function detachMarketPriceLineRefsAfterSeriesReset() {
        marketPriceLineRefs = [];
        bidPriceLine = null;
        askPriceLine = null;
      }

      function makeMarketPriceLineOptions(price, color) {
        return {
          price: price,
          color: color,
          lineWidth: 1,
          lineStyle: LightweightCharts.LineStyle ? LightweightCharts.LineStyle.Solid : 0,
          lineVisible: true,
          axisLabelVisible: false,
          title: '',
        };
      }

      function createMarketPriceLine(price, color) {
        if (!series) return null;
        return trackMarketPriceLine(series.createPriceLine(makeMarketPriceLineOptions(price, color)));
      }

      function normalizeMarketPriceLinePrice(price) {
        if (typeof price !== 'number' || !isFinite(price) || price <= 0) {
          return null;
        }
        // Keep the exact Bid for the line coordinate so sub-display-precision
        // ticks move with the forming candle. The right badge still formats
        // this raw value through formatMarketPriceScaleBadgeLabel().
        return price;
      }

      function normalizeCandleCountdownTimeframe(timeframe) {
        var raw = String(timeframe == null ? '' : timeframe).trim();
        if (!raw) return null;
        var caseSensitiveAliases = {
          '1m': 'M1',
          '5m': 'M5',
          '15m': 'M15',
          '30m': 'M30',
          '1h': 'H1',
          '4h': 'H4',
          '1d': 'D1',
          '1w': 'W1',
          '1M': 'MN',
        };
        if (caseSensitiveAliases[raw]) return caseSensitiveAliases[raw];

        var aliases = {
          '1': 'M1',
          '5': 'M5',
          '15': 'M15',
          '30': 'M30',
          '60': 'H1',
          '240': 'H4',
          'M1': 'M1',
          'M5': 'M5',
          'M15': 'M15',
          'M30': 'M30',
          'H1': 'H1',
          'H4': 'H4',
          'D1': 'D1',
          'W1': 'W1',
          'MN': 'MN',
          'MN1': 'MN',
          'MONTH': 'MN',
          'MONTHLY': 'MN',
          '1MIN': 'M1',
          '5MIN': 'M5',
          '15MIN': 'M15',
          '30MIN': 'M30',
          '1H': 'H1',
          '4H': 'H4',
          '1D': 'D1',
          '1W': 'W1',
          '1MO': 'MN',
        };
        var normalized = aliases[raw.toUpperCase()] || null;
        return normalized && Object.prototype.hasOwnProperty.call(CANDLE_COUNTDOWN_FIXED_SECONDS, normalized)
          ? normalized
          : null;
      }

      function normalizeCandleCountdownBarTimeSeconds(value) {
        var numeric = Number(value);
        if (!isFinite(numeric) || numeric <= 0) return null;
        if (numeric > 4.2e10) numeric = numeric / 1000;
        return Math.floor(numeric);
      }

      function resolveCandleCountdownBucketStartSeconds(barTime, timeframe) {
        var normalizedTimeframe = normalizeCandleCountdownTimeframe(timeframe);
        var barTimeSeconds = normalizeCandleCountdownBarTimeSeconds(barTime);
        if (!normalizedTimeframe || barTimeSeconds === null) return null;

        var barDate = new Date(barTimeSeconds * 1000);
        if (normalizedTimeframe === 'MN') {
          return Math.floor(Date.UTC(barDate.getUTCFullYear(), barDate.getUTCMonth(), 1) / 1000);
        }
        if (normalizedTimeframe === 'D1' || normalizedTimeframe === 'W1') {
          var dayStartSeconds = Math.floor(Date.UTC(
            barDate.getUTCFullYear(),
            barDate.getUTCMonth(),
            barDate.getUTCDate()
          ) / 1000);
          if (normalizedTimeframe === 'W1') {
            var daysSinceMonday = (barDate.getUTCDay() + 6) % 7;
            return dayStartSeconds - daysSinceMonday * 24 * 60 * 60;
          }
          return dayStartSeconds;
        }

        var intervalSeconds = CANDLE_COUNTDOWN_FIXED_SECONDS[normalizedTimeframe];
        if (typeof intervalSeconds !== 'number' || !isFinite(intervalSeconds) || intervalSeconds <= 0) {
          return null;
        }
        return Math.floor(barTimeSeconds / intervalSeconds) * intervalSeconds;
      }

      function resolveCandleCountdownCloseTimeMs(barTime, timeframe) {
        var normalizedTimeframe = normalizeCandleCountdownTimeframe(timeframe);
        var bucketStartSeconds = resolveCandleCountdownBucketStartSeconds(barTime, normalizedTimeframe);
        if (!normalizedTimeframe || bucketStartSeconds === null) return null;

        if (normalizedTimeframe === 'MN') {
          var barDate = new Date(bucketStartSeconds * 1000);
          return Date.UTC(barDate.getUTCFullYear(), barDate.getUTCMonth() + 1, 1);
        }

        var intervalSeconds = CANDLE_COUNTDOWN_FIXED_SECONDS[normalizedTimeframe];
        if (typeof intervalSeconds !== 'number' || !isFinite(intervalSeconds) || intervalSeconds <= 0) {
          return null;
        }
        return (bucketStartSeconds + intervalSeconds) * 1000;
      }

      function getCandleCountdownRemainingSeconds(nowMs) {
        var normalizedTimeframe = normalizeCandleCountdownTimeframe(candleCountdownTimeframe);
        var barTimeSeconds = normalizeCandleCountdownBarTimeSeconds(lastBarTime);
        if (
          !normalizedTimeframe ||
          barTimeSeconds === null ||
          !candleCountdownRequestedContextSig ||
          candleCountdownRequestedContextSig !== candleCountdownSeriesContextSig
        ) return null;
        var bucketStartSeconds = resolveCandleCountdownBucketStartSeconds(
          barTimeSeconds,
          normalizedTimeframe
        );
        if (bucketStartSeconds === null) return null;
        var closeTimeMs = resolveCandleCountdownCloseTimeMs(barTimeSeconds, normalizedTimeframe);
        if (closeTimeMs === null) return null;
        var currentTimeMs = typeof nowMs === 'number' && isFinite(nowMs) ? nowMs : Date.now();
        var bucketDurationSeconds = Math.max(0, Math.round(closeTimeMs / 1000 - bucketStartSeconds));
        var remainingSeconds = Math.max(0, Math.ceil((closeTimeMs - currentTimeMs) / 1000));
        return Math.min(bucketDurationSeconds, remainingSeconds);
      }

      function padCandleCountdownUnit(value) {
        return String(value).padStart(2, '0');
      }

      function formatCandleCountdownLabel(remainingSeconds) {
        if (typeof remainingSeconds !== 'number' || !isFinite(remainingSeconds) || remainingSeconds < 0) {
          return null;
        }
        var totalSeconds = Math.floor(remainingSeconds);
        var seconds = totalSeconds % 60;
        var totalMinutes = Math.floor(totalSeconds / 60);
        var minutes = totalMinutes % 60;
        var totalHours = Math.floor(totalMinutes / 60);
        var hours = totalHours % 24;
        var days = Math.floor(totalHours / 24);
        if (candleCountdownTimeframe === 'H1') {
          return padCandleCountdownUnit(totalMinutes) + ':' + padCandleCountdownUnit(seconds);
        }
        if (candleCountdownTimeframe === 'H4') {
          return padCandleCountdownUnit(totalHours) + ':' +
            padCandleCountdownUnit(minutes) + ':' + padCandleCountdownUnit(seconds);
        }
        if (candleCountdownTimeframe === 'D1') {
          return padCandleCountdownUnit(totalHours) + ':' +
            padCandleCountdownUnit(minutes) + ':' + padCandleCountdownUnit(seconds);
        }
        if (candleCountdownTimeframe === 'W1' || candleCountdownTimeframe === 'MN') {
          return padCandleCountdownUnit(totalHours) + ':' +
            padCandleCountdownUnit(minutes) + ':' + padCandleCountdownUnit(seconds);
        }
        if (days > 0) {
          return days + 'd ' + padCandleCountdownUnit(hours) + ':' +
            padCandleCountdownUnit(minutes) + ':' + padCandleCountdownUnit(seconds);
        }
        if (totalHours > 0) {
          return padCandleCountdownUnit(totalHours) + ':' +
            padCandleCountdownUnit(minutes) + ':' + padCandleCountdownUnit(seconds);
        }
        return padCandleCountdownUnit(totalMinutes) + ':' + padCandleCountdownUnit(seconds);
      }

      function resolveCandleCountdownLabel() {
        if (!candleCountdownActive) {
          return null;
        }
        return formatCandleCountdownLabel(getCandleCountdownRemainingSeconds(Date.now()));
      }

      function stopCandleCountdownTicker() {
        if (candleCountdownTimer !== null) {
          try { clearTimeout(candleCountdownTimer); } catch (_error) {}
          candleCountdownTimer = null;
        }
      }

      function scheduleNextCandleCountdownTick() {
        if (!chartRuntimeActive || document.hidden || !candleCountdownActive || !candleCountdownTimeframe || candleCountdownTimer !== null) return;
        var delay = Math.max(50, 1000 - (Date.now() % 1000) + 16);
        candleCountdownTimer = setTimeout(function() {
          candleCountdownTimer = null;
          if (!document.hidden) {
            scheduleMarketPriceScaleDomOnly();
          }
          scheduleNextCandleCountdownTick();
        }, delay);
      }

      function setCandleCountdownTimeframe(timeframe, dataContextSig) {
        candleCountdownTimeframe = normalizeCandleCountdownTimeframe(timeframe);
        candleCountdownRequestedContextSig =
          typeof dataContextSig === 'string' ? dataContextSig : '';
        stopCandleCountdownTicker();
        if (candleCountdownActive && candleCountdownTimeframe) {
          scheduleNextCandleCountdownTick();
        }
        scheduleMarketPriceScaleDomOnly();
        return candleCountdownTimeframe !== null;
      }

      function setCandleCountdownActive(active) {
        // Native passes false for Renko because a price-threshold brick has no
        // timeframe close. This removes the time row below the live price line.
        candleCountdownActive = active === true;
        stopCandleCountdownTicker();
        if (candleCountdownActive && candleCountdownTimeframe) {
          scheduleNextCandleCountdownTick();
        }
        // Repaint on both transitions so a retained closed-market chart removes
        // a stale 00:00 row immediately instead of waiting for another quote.
        scheduleMarketPriceScaleDomOnly();
      }

      function cancelMarketPriceScaleDomRefreshSchedule() {
        if (marketPriceScaleDomRefreshRaf) {
          try { cancelAnimationFrame(marketPriceScaleDomRefreshRaf); } catch (_) {}
          marketPriceScaleDomRefreshRaf = 0;
        }
        if (marketPriceScaleDomRefreshFallbackHandle) {
          try { clearTimeout(marketPriceScaleDomRefreshFallbackHandle); } catch (_) {}
          marketPriceScaleDomRefreshFallbackHandle = 0;
        }
      }

      function flushMarketPriceScaleDomRefresh() {
        cancelMarketPriceScaleDomRefreshSchedule();
        if (!marketPriceScaleDomPending) return;
        if (isHorizontalScrollMotionActive() || verticalPricePanGestureActive) {
          // Keep the newest Bid pending; scheduleOverlayDomRefresh() is called
          // again by both horizontal and vertical gesture settlement.
          return;
        }
        marketPriceScaleDomPending = false;
        try {
          refreshMarketPriceScaleDom();
          var layer = ensureOverlayLabelLayer();
          if (layer) {
            renderMoveDirectionOverlayBadge(layer, null);
          }
        } catch (_e) {}
      }

      function scheduleMarketPriceScaleDomOnly() {
        // Quote ticks only need the live price badge/extension. Rebuilding the
        // entire trade-label layer every tick was residual chart flicker even
        // after in-place upserts (layout thrash on the overlay layer).
        marketPriceScaleDomPending = true;
        if (isHorizontalScrollMotionActive() || verticalPricePanGestureActive) {
          return;
        }
        if (marketPriceScaleDomRefreshRaf || marketPriceScaleDomRefreshFallbackHandle) {
          return;
        }
        // This badge is custom DOM and has its own paint step after the chart
        // price line moves. Guard that rAF independently so a dropped Android
        // WebView frame cannot leave the right-axis marker permanently stale.
        marketPriceScaleDomRefreshFallbackHandle = setTimeout(
          flushMarketPriceScaleDomRefresh,
          MARKET_PRICE_SCALE_DOM_FALLBACK_MS
        );
        try {
          marketPriceScaleDomRefreshRaf = requestAnimationFrame(
            flushMarketPriceScaleDomRefresh
          );
        } catch (_) {
          marketPriceScaleDomRefreshRaf = 0;
        }
      }

      function setLivePriceLine(price, shouldScheduleRefresh) {
        try {
          var normalizedPrice = normalizeMarketPriceLinePrice(price);
          var liveColor = pickLivePriceColor();
          marketLiveColor = liveColor;
          lastLivePrice = normalizedPrice;
          lastBidPrice = normalizedPrice;
          lastAskPrice = null;
          marketPriceLinesVisible = lastLivePrice !== null;
          if (!series) return false;
          if (normalizedPrice === null) {
            bidPriceLine = removeMarketPriceLine(bidPriceLine);
            askPriceLine = removeMarketPriceLine(askPriceLine);
            ensureMarketPriceBadgesVisible();
            if (shouldScheduleRefresh !== false) scheduleMarketPriceScaleDomOnly();
            return true;
          }
          askPriceLine = removeMarketPriceLine(askPriceLine);
          if (bidPriceLine) {
            try {
              bidPriceLine.applyOptions(makeMarketPriceLineOptions(normalizedPrice, liveColor));
              ensureMarketPriceBadgesVisible();
              if (shouldScheduleRefresh !== false) scheduleMarketPriceScaleDomOnly();
              return true;
            } catch (_e) {
              bidPriceLine = removeMarketPriceLine(bidPriceLine);
            }
          }
          bidPriceLine = removeMarketPriceLine(bidPriceLine);
          bidPriceLine = createMarketPriceLine(normalizedPrice, liveColor);
          if (!bidPriceLine) {
            return false;
          }
          ensureMarketPriceBadgesVisible();
          if (shouldScheduleRefresh !== false) scheduleMarketPriceScaleDomOnly();
          return true;
        } catch (e) {
          postError('setLivePriceLine', e);
          return false;
        }
      }

      // Reject a delayed native command after a symbol, timeframe, broker, or
      // account switch. Closed markets have no future tick to heal a stale
      // ordering mistake, so the context check is part of the bridge contract.
      function setLivePriceLineForContext(
        price,
        dataContextSig,
        revision,
        shouldScheduleRefresh,
        retryCount
      ) {
        var requestedContextSig = typeof dataContextSig === 'string' ? dataContextSig : '';
        if (!requestedContextSig || requestedContextSig !== lastInitDataContextSig) {
          return false;
        }
        var requestedRevision = Number(revision);
        var hasRequestedRevision = isFinite(requestedRevision) && requestedRevision > 0;
        if (hasRequestedRevision && requestedRevision < lastAppliedLiveTickRevision) {
          return false;
        }
        if (hasRequestedRevision && requestedRevision === lastAppliedLiveTickRevision) {
          return normalizeMarketPriceLinePrice(price) === lastLivePrice;
        }
        var synchronized = setLivePriceLine(price, shouldScheduleRefresh) === true;
        if (synchronized && hasRequestedRevision) {
          lastAppliedLiveTickRevision = requestedRevision;
        } else if (!synchronized && hasRequestedRevision) {
          var contextLineRetryCount = typeof retryCount === 'number' ? retryCount : 0;
          if (contextLineRetryCount < LIVE_TICK_LINE_RETRY_LIMIT) {
            setTimeout(function() {
              setLivePriceLineForContext(
                price,
                requestedContextSig,
                requestedRevision,
                shouldScheduleRefresh,
                contextLineRetryCount + 1
              );
            }, LIVE_TICK_FLUSH_FALLBACK_MS);
          }
        }
        return synchronized;
      }

      function setBidPriceLine(price, shouldScheduleRefresh) {
        setLivePriceLine(price, shouldScheduleRefresh);
      }

      function setAskPriceLine(price, shouldScheduleRefresh) {
        lastAskPrice = null;
        if (series) {
          askPriceLine = removeMarketPriceLine(askPriceLine);
        }
        if (shouldScheduleRefresh !== false) {
          ensureMarketPriceBadgesVisible();
          scheduleOverlayDomRefresh();
        }
      }

      function setMarketPriceLines(bid, ask) {
        setLivePriceLine(bid);
      }

      function clearMarketPriceLines() {
        lastLivePrice = null;
        lastBidPrice = null;
        lastAskPrice = null;
        marketPriceLinesVisible = false;
        if (series) {
          bidPriceLine = removeMarketPriceLine(bidPriceLine);
          askPriceLine = removeMarketPriceLine(askPriceLine);
        }
        ensureMarketPriceBadgesVisible();
        scheduleOverlayDomRefresh();
      }

      // Re-tint the live price line in place when the active candle flips
      // direction mid-bucket. Uses the current bull/bear candle colors.
      // We intentionally don't touch the candle series' or move-bars' own
      // options — applyOptions on the main series can cause a full redraw
      // of the data, which was blanking history on some rebuilds.
      function refreshBidPriceLineColor() {
        if (!bidPriceLine) return;
        var liveColor = pickLivePriceColor();
        marketLiveColor = liveColor;
        try {
          bidPriceLine.applyOptions({
            color: liveColor,
            axisLabelColor: liveColor,
            axisLabelVisible: false,
          });
        } catch (_e) {}
      }

      function setDrawingTool(tool, options) {
        if (window._drawingManager && typeof window._drawingManager.setActiveTool === 'function') {
          window._drawingManager.setActiveTool(tool, false, options);
          if (isCrosshairInteractionActive() && stopVerticalPanGlideHook) {
            stopVerticalPanGlideHook();
          }
        }
      }
      function clearDrawings() {
        if (window._drawingManager && typeof window._drawingManager.removeAllDrawings === 'function') {
          window._drawingManager.removeAllDrawings();
        }
      }
      function undoDrawingAction() {
        if (window._drawingManager && typeof window._drawingManager.undoDrawingAction === 'function') {
          window._drawingManager.undoDrawingAction();
        }
      }
      function redoDrawingAction() {
        if (window._drawingManager && typeof window._drawingManager.redoDrawingAction === 'function') {
          window._drawingManager.redoDrawingAction();
        }
      }
      function setSerializedDrawings(drawings) {
        if (window._drawingManager && typeof window._drawingManager.setSerializedDrawings === 'function') {
          window._drawingManager.setSerializedDrawings(drawings);
        }
      }
      function publishSerializedDrawings() {
        if (window._drawingManager && typeof window._drawingManager.publishDrawingsToHost === 'function') {
          window._drawingManager.publishDrawingsToHost();
        }
      }
      function applyDrawingTextEdit(recordId, text) {
        if (window._drawingManager && typeof window._drawingManager.applyTextRecordEdit === 'function') {
          window._drawingManager.applyTextRecordEdit(recordId, text);
        }
      }
      function cancelDrawingTextEdit(recordId) {
        if (window._drawingManager && typeof window._drawingManager.cancelTextRecordEdit === 'function') {
          window._drawingManager.cancelTextRecordEdit(recordId);
        }
      }
      function setDrawingsLocked(locked) {
        if (window._drawingManager && typeof window._drawingManager.setDrawingsLocked === 'function') {
          window._drawingManager.setDrawingsLocked(locked);
        }
      }
      function setDrawingsHidden(hidden) {
        if (window._drawingManager && typeof window._drawingManager.setDrawingsHidden === 'function') {
          window._drawingManager.setDrawingsHidden(hidden);
        }
      }
      function removeSelectedDrawing() {
        if (window._drawingManager && typeof window._drawingManager.removeSelectedDrawing === 'function') {
          window._drawingManager.removeSelectedDrawing();
        }
      }
      function clearDrawingSelection() {
        if (window._drawingManager && typeof window._drawingManager.clearDrawingSelection === 'function') {
          window._drawingManager.clearDrawingSelection();
        }
      }
      function setSelectedDrawingLocked(locked) {
        if (window._drawingManager && typeof window._drawingManager.setSelectedDrawingLocked === 'function') {
          window._drawingManager.setSelectedDrawingLocked(locked);
        }
      }
      function setSelectedDrawingHidden(hidden) {
        if (window._drawingManager && typeof window._drawingManager.setSelectedDrawingHidden === 'function') {
          window._drawingManager.setSelectedDrawingHidden(hidden);
        }
      }
      function unlockAllDrawings() {
        if (window._drawingManager && typeof window._drawingManager.unlockAllDrawings === 'function') {
          window._drawingManager.unlockAllDrawings();
        }
      }
      function setShowObjectDescriptions(enabled) {
        window.__rtx5ShowObjectDescriptions = enabled !== false;
        if (
          window._drawingManager &&
          typeof window._drawingManager.setShowObjectDescriptions === 'function'
        ) {
          window._drawingManager.setShowObjectDescriptions(window.__rtx5ShowObjectDescriptions);
        }
      }
      function setStayInDrawingMode(sticky) {
        if (window._drawingManager && typeof window._drawingManager.setStayInDrawingMode === 'function') {
          window._drawingManager.setStayInDrawingMode(sticky);
        }
      }
      function setDrawingMagnetMode(enabled) {
        if (window._drawingManager && typeof window._drawingManager.setCrosshairConfig === 'function') {
          window._drawingManager.setCrosshairConfig({
            snap: {
              enabled: enabled === true,
              type: enabled === true ? 'ohlc-nearest' : 'none',
              thresholdPx: ${CHART_DRAWING_MAGNET_THRESHOLD_PX}
            }
          });
        }
      }
      function setVerticalScrollingLocked(locked) {
        verticalScrollingLocked = locked === true;
      }
      function zoomChart() {
        if (window._drawingManager && typeof window._drawingManager.zoomToFit === 'function') {
          window._drawingManager.zoomToFit();
        }
      }
      // ── Position / Trade Level Lines ──────────────────────────────
      // Manages entry price, TP, and SL horizontal lines on the chart.
      // Called from React Native whenever positions change or the user
      // toggles the "Show Trade Levels" setting.
      var _positionLinesArr = [];
      var _overlayPriceLinesByDragKey = Object.create(null);
      var _overlayMarkers = null;
      var _overlayMarkerSource = [];
      var _lastTradeHistoryMarkerScaleKey = '';
      var _overlayPayload = { priceLines: [], markers: [], tradeHistorySegments: [] };
      var _appliedOverlayPayload = { priceLines: [], markers: [], tradeHistorySegments: [] };
      var _overlayResyncTimer = null;
      var chartRuntimeActive = false;
      var _overlayLabelLayer = null;
      var _tradeHistoryPlotLayer = null;
      // Stable DOM nodes for trade labels/lines/boxes. Never wipe the whole
      // overlay layer on quote ticks — that was the visible horizontal blink
      // (open-trade lines are DOM-only with native lineVisible:false).
      var _overlayDomNodesByKey = Object.create(null);
      var activeTradeLineDrag = null;
      var suppressNextChartClickUntil = 0;
      var TRADE_LINE_DRAG_HIT_SLOP = 30;
      var CHART_TRADE_LINE_DRAG_NATIVE_MOVE_INTERVAL_MS = 96;
      // The dragged price line itself moves every pointermove (lightweight-charts
      // coalesces its own paints to one frame), while the custom anchored line
      // is redrawn by refreshOverlayDomLabels. Its text and price value remain
      // hidden until the drag finishes.
      // scheduleTradeLineDragDomRefresh already coalesces through requestAnimationFrame,
      // so this can never rebuild more than once per frame — lowering the floor to
      // one frame (~60fps) keeps the visible horizontal guide tracking the finger.
      var CHART_TRADE_LINE_DRAG_DOM_REFRESH_INTERVAL_MS = 16;
      var TRADE_LINE_MAGNIFIER_SIZE = 120;
      var TRADE_LINE_MAGNIFIER_ZOOM = 2.25;
      var TRADE_LINE_MAGNIFIER_GAP = 22;
      var TRADE_LINE_MAGNIFIER_EDGE_PADDING = 8;
      var _tradeLineMagnifier = null;
      var _tradeLineMagnifierCanvas = null;
      var _tradeLineMagnifierSourceCanvases = [];
      var _tradeLineMagnifierChartRect = null;

      function clearOverlayPriceLines() {
        if (series) {
          for (var i = 0; i < _positionLinesArr.length; i++) {
            try { series.removePriceLine(_positionLinesArr[i]); } catch (_e) {}
          }
        }
        _positionLinesArr = [];
        _overlayPriceLinesByDragKey = Object.create(null);
        // Force a full native recreate after clear so a later same-signature
        // payload cannot skip recreation against an empty canvas.
        _lastAppliedOverlayNativeSignature = '';
        activeTradeLineDrag = null;
        hideTradeLineMagnifier();
        discardTradeLineMagnifierSources();
        chartTouchInteractionSuspendDepth = 0;
      }

      function clearOverlayMarkers() {
        if (_overlayMarkers && typeof _overlayMarkers.detach === 'function') {
          try { _overlayMarkers.detach(); } catch (_e) {}
        }
        _overlayMarkers = null;
        _overlayMarkerSource = [];
        _lastTradeHistoryMarkerScaleKey = '';
        // A rebuilt chart can receive the same marker geometry as its previous
        // series. Force the next payload to attach it to the new series.
        _lastAppliedOverlayNativeSignature = '';
      }

      function resolveTradeHistoryMarkerScale() {
        var barSpacing = ${CHART_DEFAULT_TIME_SCALE_BAR_SPACING};
        try {
          var timeScale = chart && typeof chart.timeScale === 'function'
            ? chart.timeScale()
            : null;
          var options = timeScale && typeof timeScale.options === 'function'
            ? timeScale.options()
            : null;
          if (
            options &&
            typeof options.barSpacing === 'number' &&
            isFinite(options.barSpacing) &&
            options.barSpacing > 0
          ) {
            barSpacing = options.barSpacing;
          }
        } catch (_tradeHistorySpacingErr) {}

        // Lightweight Charts internally clamps its marker base to 12..30 and
        // rounds that base down to an even pixel. Compensate only history
        // arrows so their drawn size follows candle width at every normal zoom
        // level while their tip remains within one pixel of the exact price.
        var clampedBase = Math.max(12, Math.min(30, barSpacing));
        // Match Lightweight Charts 5.1 exactly: its first helper applies its
        // ceil-to-odd adjustment, then the marker-position helper adjusts that
        // result once more to an even integer. The
        // effective unscaled placement height is therefore 10..28, not 12..30.
        var oddBaseHeight = Math.ceil(clampedBase);
        if (oddBaseHeight % 2 === 0) oddBaseHeight -= 1;
        var baseHeight = Math.ceil(oddBaseHeight);
        if (baseHeight % 2 !== 0) baseHeight -= 1;
        var desiredHeight = Math.max(12, Math.min(30, Math.round(barSpacing + 10)));
        return {
          key: desiredHeight + ':' + baseHeight,
          size: desiredHeight / baseHeight,
        };
      }

      function scaleTradeHistoryMarkers(markers, scale) {
        if (!Array.isArray(markers) || markers.length === 0) return [];
        return markers.map(function(marker) {
          if (
            !marker ||
            typeof marker.id !== 'string' ||
            marker.id.indexOf('trade-history-') !== 0
          ) {
            return marker;
          }
          return Object.assign({}, marker, { size: scale.size });
        });
      }

      function isTradeHistoryArrowMarker(marker) {
        return Boolean(
          marker &&
          typeof marker.id === 'string' &&
          marker.id.indexOf('trade-history-') === 0 &&
          (marker.shape === 'arrowUp' || marker.shape === 'arrowDown')
        );
      }

      // Trade-history arrows are drawn as thin DOM arrows (see
      // renderTradeHistoryArrowNode); every other marker stays a native
      // Lightweight Charts series marker.
      function selectNativeOverlayMarkers(markers) {
        if (!Array.isArray(markers) || markers.length === 0) return [];
        var nativeMarkers = [];
        for (var i = 0; i < markers.length; i++) {
          if (!isTradeHistoryArrowMarker(markers[i])) nativeMarkers.push(markers[i]);
        }
        return nativeMarkers;
      }

      function hasTradeHistoryArrowMarkers(payload) {
        var markers = payload && Array.isArray(payload.markers) ? payload.markers : [];
        for (var i = 0; i < markers.length; i++) {
          if (isTradeHistoryArrowMarker(markers[i])) return true;
        }
        return false;
      }

      var TRADE_HISTORY_ARROW_SVG_NS = 'http://www.w3.org/2000/svg';

      // A thin single arrow (stem + open head), not the filled library marker.
      // Its size follows candle width within a narrow band so it reads as a
      // pointer to the exact deal price at every zoom level.
      function resolveTradeHistoryArrowSize(timeScale) {
        var barSpacing = ${CHART_DEFAULT_TIME_SCALE_BAR_SPACING};
        try {
          var options = timeScale && typeof timeScale.options === 'function'
            ? timeScale.options()
            : null;
          if (
            options &&
            typeof options.barSpacing === 'number' &&
            isFinite(options.barSpacing) &&
            options.barSpacing > 0
          ) {
            barSpacing = options.barSpacing;
          }
        } catch (_tradeArrowSpacingErr) {}
        var height = Math.max(14, Math.min(24, Math.round(barSpacing + 8)));
        var width = Math.max(9, Math.round(height * 0.62));
        return { width: width, height: height, stroke: height >= 20 ? 2 : 1.6 };
      }

      // Draws the arrow once per direction/color/size; repositioning during
      // pan and zoom only moves the node.
      function renderTradeHistoryArrowNode(node, up, color, size) {
        var signature =
          (up ? 'up' : 'down') + '|' + color + '|' + size.width + 'x' + size.height + '|' + size.stroke;
        if (node.getAttribute('data-rtx5-arrow') === signature) return;
        node.setAttribute('data-rtx5-arrow', signature);
        while (node.firstChild) node.removeChild(node.firstChild);
        var w = size.width;
        var h = size.height;
        var inset = size.stroke / 2;
        var mid = w / 2;
        var headDepth = Math.min(h * 0.45, w * 0.6);
        var svg = document.createElementNS(TRADE_HISTORY_ARROW_SVG_NS, 'svg');
        svg.setAttribute('width', String(w));
        svg.setAttribute('height', String(h));
        svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
        svg.style.display = 'block';
        svg.style.overflow = 'visible';
        // Sell arrows are the same shape pointing down.
        if (!up) svg.style.transform = 'scaleY(-1)';
        var path = document.createElementNS(TRADE_HISTORY_ARROW_SVG_NS, 'path');
        // Stem from the base to the tip, then the open head through the tip.
        path.setAttribute(
          'd',
          'M' + mid + ' ' + (h - inset) + 'L' + mid + ' ' + inset +
            'M' + inset + ' ' + (inset + headDepth) + 'L' + mid + ' ' + inset +
            'L' + (w - inset) + ' ' + (inset + headDepth)
        );
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', color);
        path.setAttribute('stroke-width', String(size.stroke));
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(path);
        node.appendChild(svg);
      }

      function refreshTradeHistoryMarkerScale(force) {
        if (
          !_overlayMarkers ||
          typeof _overlayMarkers.setMarkers !== 'function' ||
          !_overlayMarkerSource.length
        ) {
          return;
        }
        if (
          typeof _overlayMarkers.getSeries === 'function' &&
          _overlayMarkers.getSeries() !== series
        ) {
          return;
        }
        var scale = resolveTradeHistoryMarkerScale();
        if (force !== true && scale.key === _lastTradeHistoryMarkerScaleKey) return;
        try {
          _overlayMarkers.setMarkers(scaleTradeHistoryMarkers(_overlayMarkerSource, scale));
          _lastTradeHistoryMarkerScaleKey = scale.key;
        } catch (_tradeHistoryMarkerScaleErr) {}
      }

      function ensureOverlayLabelLayer() {
        var el = document.getElementById('chart');
        if (!el) return null;
        if (_overlayLabelLayer && _overlayLabelLayer.parentNode === el) {
          syncOverlayLabelLayerPaneClip(_overlayLabelLayer);
          return _overlayLabelLayer;
        }
        // Layer was recreated (chart re-init) — drop stale node refs.
        _overlayDomNodesByKey = Object.create(null);
        el.style.position = 'relative';
        _overlayLabelLayer = document.createElement('div');
        _overlayLabelLayer.className = 'rtx5-overlay-label-layer';
        _overlayLabelLayer.style.position = 'absolute';
        _overlayLabelLayer.style.left = '0';
        _overlayLabelLayer.style.top = '0';
        _overlayLabelLayer.style.right = '0';
        _overlayLabelLayer.style.pointerEvents = 'none';
        _overlayLabelLayer.style.zIndex = '40';
        el.appendChild(_overlayLabelLayer);
        syncOverlayLabelLayerPaneClip(_overlayLabelLayer);
        return _overlayLabelLayer;
      }

      function clearOverlayDomLabels() {
        if (!_overlayLabelLayer) {
          _overlayDomNodesByKey = Object.create(null);
          discardTradeLineMagnifier();
          return;
        }
        while (_overlayLabelLayer.firstChild) {
          _overlayLabelLayer.removeChild(_overlayLabelLayer.firstChild);
        }
        _overlayDomNodesByKey = Object.create(null);
        _tradeLineMagnifier = null;
        _tradeLineMagnifierCanvas = null;
        discardTradeLineMagnifierSources();
      }

      function upsertOverlayDomNode(layer, key, className) {
        if (!layer || !key) return null;
        var el = _overlayDomNodesByKey[key];
        if (el && el.parentNode === layer) {
          if (className && el.className !== className) {
            el.className = className;
          }
          return el;
        }
        el = document.createElement('div');
        el.className = className || '';
        el.setAttribute('data-rtx5-key', key);
        layer.appendChild(el);
        _overlayDomNodesByKey[key] = el;
        return el;
      }

      function pruneOverlayDomNodes(liveKeys) {
        var live = Object.create(null);
        if (Array.isArray(liveKeys)) {
          for (var i = 0; i < liveKeys.length; i++) {
            if (liveKeys[i]) live[liveKeys[i]] = true;
          }
        }
        var keys = Object.keys(_overlayDomNodesByKey);
        for (var k = 0; k < keys.length; k++) {
          var key = keys[k];
          // Market-price badges/extensions manage their own lifecycle via class queries.
          if (
            key.indexOf('label:') !== 0 &&
            key.indexOf('line:') !== 0 &&
            key.indexOf('box:') !== 0 &&
            key.indexOf('history-segment:') !== 0 &&
            key.indexOf('history-arrow:') !== 0 &&
            key !== 'move-badge'
          ) {
            continue;
          }
          if (live[key]) continue;
          var el = _overlayDomNodesByKey[key];
          if (el && el.parentNode) {
            try { el.parentNode.removeChild(el); } catch (_e) {}
          }
          delete _overlayDomNodesByKey[key];
        }
      }

      // The full chart pane's vertical pixel bounds, ending at the separator
      // above the date/time scale. Price-scale margins reserve space inside
      // this pane; they are not the pane boundary. Trade markers whose real
      // price maps outside these bounds are CLIPPED (visibility:hidden), never
      // removed — MT5 parity: an open trade may be off-viewport while the
      // market is far from its entry, and must reappear at its exact entry
      // price as soon as panning/zooming brings that price back on screen.
      function resolveTradeOverlayPaneBounds() {
        var metrics = resolvePrimaryPaneMetrics();
        var paneHeight = Math.max(0, Math.round(metrics.paneHeight || 0));
        if (!(paneHeight > 4)) {
          // Metrics unavailable (layout still settling) — never hide markers
          // on bad data.
          return null;
        }
        return { top: 0, bottom: paneHeight };
      }

      // Collision stacking can move a visible trade row below its raw price
      // coordinate. Clip the shared DOM layer at the pane separator so labels,
      // connector lines, and price boxes cannot paint over the date/time scale.
      function syncOverlayLabelLayerPaneClip(layer) {
        if (!layer) return;
        var bounds = resolveTradeOverlayPaneBounds();
        if (!bounds) {
          // Fail open while chart metrics settle. The next ensure/refresh will
          // install the exact pane clip without destroying keyed overlay nodes.
          layer.style.bottom = '0';
          layer.style.height = 'auto';
          layer.style.overflow = 'visible';
          return;
        }
        layer.style.bottom = 'auto';
        layer.style.height = Math.max(0, Math.round(bounds.bottom)) + 'px';
        layer.style.overflow = 'hidden';
      }

      function isTradeOverlayYInsidePane(y, bounds) {
        if (!bounds) return true;
        return y >= bounds.top && y <= bounds.bottom;
      }

      function pruneTradeHistorySegmentDomNodes(liveKeys) {
        var live = Object.create(null);
        if (Array.isArray(liveKeys)) {
          for (var i = 0; i < liveKeys.length; i++) {
            if (liveKeys[i]) live[liveKeys[i]] = true;
          }
        }
        var keys = Object.keys(_overlayDomNodesByKey);
        for (var k = 0; k < keys.length; k++) {
          var key = keys[k];
          if (
            (key.indexOf('history-segment:') !== 0 && key.indexOf('history-arrow:') !== 0) ||
            live[key]
          ) continue;
          var node = _overlayDomNodesByKey[key];
          if (node && node.parentNode) {
            try { node.parentNode.removeChild(node); } catch (_e) {}
          }
          delete _overlayDomNodesByKey[key];
        }
      }

      // Trade-history arrows and connectors belong to the candle plot, so they
      // live in their own child layer clipped to the plot area. A trade whose
      // candle scrolls past the right edge is cut at the price scale, like the
      // candles themselves, instead of being drawn over the price labels. (The
      // parent overlay layer must span the price axis for the right-axis trade
      // boxes, so it cannot be clipped horizontally itself.)
      function ensureTradeHistoryPlotLayer(parentLayer) {
        if (!parentLayer) return null;
        var plotLayer = _tradeHistoryPlotLayer;
        if (!plotLayer || plotLayer.parentNode !== parentLayer) {
          // Drop history nodes attached anywhere else; the caller's render
          // pass recreates every live one inside the new plot layer.
          pruneTradeHistorySegmentDomNodes([]);
          plotLayer = document.createElement('div');
          plotLayer.className = 'rtx5-trade-history-plot-layer';
          plotLayer.setAttribute('aria-hidden', 'true');
          plotLayer.style.position = 'absolute';
          plotLayer.style.top = '0';
          plotLayer.style.bottom = '0';
          plotLayer.style.overflow = 'hidden';
          plotLayer.style.pointerEvents = 'none';
          plotLayer.style.zIndex = '7';
          parentLayer.insertBefore(plotLayer, parentLayer.firstChild);
          _tradeHistoryPlotLayer = plotLayer;
        }
        var metrics = resolvePrimaryPaneMetrics();
        var plotLeft = Math.max(0, Math.round(metrics.leftAxisWidth || 0));
        var axisMetrics = resolveMarketPriceScaleAxisMetrics(parentLayer);
        var plotRight = axisMetrics
          ? Math.round(axisMetrics.axisLeft)
          : plotLeft + Math.max(0, Math.round(metrics.paneWidth || 0));
        var plotWidth = Math.max(0, plotRight - plotLeft);
        if (plotWidth > 4) {
          plotLayer.style.left = plotLeft + 'px';
          plotLayer.style.right = 'auto';
          plotLayer.style.width = plotWidth + 'px';
        } else {
          // Metrics still settling: fail open to the parent layer.
          plotLayer.style.left = '0';
          plotLayer.style.right = '0';
          plotLayer.style.width = 'auto';
        }
        return plotLayer;
      }

      // Closed-trade connectors are DOM lines because Lightweight Charts
      // series markers cannot join two exact time/price coordinates. The line
      // starts at the opening deal and ends at the closing deal, while the
      // shared overlay layer clips it to the visible price pane.
      function renderTradeHistorySegmentDom(layer, payload, liveOverlayKeys, pruneHistoryOnly) {
        var liveHistoryKeys = [];
        try {
          if (
            !layer ||
            !chart ||
            !series ||
            typeof chart.timeScale !== 'function' ||
            typeof series.priceToCoordinate !== 'function'
          ) {
            if (pruneHistoryOnly === true) {
              pruneTradeHistorySegmentDomNodes(liveHistoryKeys);
            }
            return;
          }
          syncOverlayLabelLayerPaneClip(layer);
          // Arrows and connectors render into the plot-clipped child layer.
          layer = ensureTradeHistoryPlotLayer(layer) || layer;
          var timeScale = chart.timeScale();
          if (!timeScale || typeof timeScale.timeToCoordinate !== 'function') {
            if (pruneHistoryOnly === true) {
              pruneTradeHistorySegmentDomNodes(liveHistoryKeys);
            }
            return;
          }
          var segments = payload && Array.isArray(payload.tradeHistorySegments)
            ? payload.tradeHistorySegments
            : [];
          for (var i = 0; i < segments.length; i++) {
            var segment = segments[i];
            if (!segment || typeof segment.id !== 'string' || !segment.id) continue;
            if (
              typeof segment.fromTime !== 'number' || !isFinite(segment.fromTime) ||
              typeof segment.fromPrice !== 'number' || !isFinite(segment.fromPrice) ||
              typeof segment.toTime !== 'number' || !isFinite(segment.toTime) ||
              typeof segment.toPrice !== 'number' || !isFinite(segment.toPrice)
            ) {
              continue;
            }

            var fromX = timeScale.timeToCoordinate(segment.fromTime);
            var toX = timeScale.timeToCoordinate(segment.toTime);
            var fromY = series.priceToCoordinate(segment.fromPrice);
            var toY = series.priceToCoordinate(segment.toPrice);
            if (
              typeof fromX !== 'number' || !isFinite(fromX) ||
              typeof toX !== 'number' || !isFinite(toX) ||
              typeof fromY !== 'number' || !isFinite(fromY) ||
              typeof toY !== 'number' || !isFinite(toY)
            ) {
              continue;
            }

            var deltaX = toX - fromX;
            var deltaY = toY - fromY;
            var length = Math.hypot(deltaX, deltaY);
            var angle = Math.atan2(deltaY, deltaX);
            if (!isFinite(length) || !isFinite(angle)) continue;

            var key = 'history-segment:' + segment.id;
            var line = upsertOverlayDomNode(layer, key, 'rtx5-trade-history-segment');
            if (!line) continue;
            liveHistoryKeys.push(key);
            if (Array.isArray(liveOverlayKeys)) liveOverlayKeys.push(key);

            var lineWidth =
              typeof segment.lineWidth === 'number' && isFinite(segment.lineWidth)
                ? Math.max(1, Math.min(4, segment.lineWidth))
                : 1;
            var color = typeof segment.color === 'string' && segment.color
              ? segment.color
              : '#2962FF';
            line.setAttribute('data-rtx5-role', 'trade-history-segment');
            line.setAttribute('aria-hidden', 'true');
            line.style.position = 'absolute';
            line.style.left = fromX + 'px';
            line.style.top = fromY + 'px';
            line.style.width = length + 'px';
            line.style.height = '0';
            line.style.boxSizing = 'border-box';
            line.style.borderTopWidth = lineWidth + 'px';
            line.style.borderTopStyle = 'dotted';
            line.style.borderTopColor = color;
            line.style.transformOrigin = '0 0';
            line.style.transform = 'rotate(' + angle + 'rad)';
            line.style.opacity = '0.78';
            line.style.pointerEvents = 'none';
            line.style.zIndex = '7';
            line.style.visibility = 'visible';
          }

          // Deal arrows: the tip sits exactly on the deal price at its candle
          // (buy points up from below, sell points down from above).
          var arrowMarkers = payload && Array.isArray(payload.markers) ? payload.markers : [];
          var arrowSize = null;
          for (var m = 0; m < arrowMarkers.length; m++) {
            var arrowMarker = arrowMarkers[m];
            if (!isTradeHistoryArrowMarker(arrowMarker)) continue;
            if (
              typeof arrowMarker.time !== 'number' || !isFinite(arrowMarker.time) ||
              typeof arrowMarker.price !== 'number' || !isFinite(arrowMarker.price)
            ) {
              continue;
            }
            var arrowX = timeScale.timeToCoordinate(arrowMarker.time);
            var arrowY = series.priceToCoordinate(arrowMarker.price);
            if (
              typeof arrowX !== 'number' || !isFinite(arrowX) ||
              typeof arrowY !== 'number' || !isFinite(arrowY)
            ) {
              continue;
            }
            if (!arrowSize) arrowSize = resolveTradeHistoryArrowSize(timeScale);
            var arrowKey = 'history-arrow:' + arrowMarker.id;
            var arrowNode = upsertOverlayDomNode(layer, arrowKey, 'rtx5-trade-history-arrow');
            if (!arrowNode) continue;
            liveHistoryKeys.push(arrowKey);
            if (Array.isArray(liveOverlayKeys)) liveOverlayKeys.push(arrowKey);
            var arrowUp = arrowMarker.shape === 'arrowUp';
            var arrowColor = typeof arrowMarker.color === 'string' && arrowMarker.color
              ? arrowMarker.color
              : '#2962FF';
            renderTradeHistoryArrowNode(arrowNode, arrowUp, arrowColor, arrowSize);
            var arrowInset = arrowSize.stroke / 2;
            arrowNode.setAttribute('data-rtx5-role', 'trade-history-arrow');
            arrowNode.setAttribute('aria-hidden', 'true');
            arrowNode.style.position = 'absolute';
            arrowNode.style.left = (arrowX - arrowSize.width / 2) + 'px';
            arrowNode.style.top = (arrowUp
              ? arrowY - arrowInset
              : arrowY - arrowSize.height + arrowInset) + 'px';
            arrowNode.style.width = arrowSize.width + 'px';
            arrowNode.style.height = arrowSize.height + 'px';
            arrowNode.style.pointerEvents = 'none';
            arrowNode.style.zIndex = '8';
            arrowNode.style.visibility = 'visible';
          }
        } catch (_tradeHistorySegmentRenderError) {}
        if (pruneHistoryOnly === true) {
          pruneTradeHistorySegmentDomNodes(liveHistoryKeys);
        }
      }

      // Position-only pass over the trade-anchored overlay DOM (entry/SL/TP
      // dotted lines, their BUY/SELL labels, right-axis price boxes). It
      // recomputes each node's y from the trade's REAL price via
      // series.priceToCoordinate on every visible-range change — including
      // active pan / pinch / momentum frames — so markers stay glued to their
      // price while the chart moves. Price-line nodes are never rebuilt here;
      // keyed closed-trade connectors are recalculated from their two exact
      // coordinates and pruned independently when history changes.
      function repositionTradeOverlayDomNodes() {
        try {
          if (!series || typeof series.priceToCoordinate !== 'function') return;
          var appliedHasDomGeometry =
            _appliedOverlayPayload &&
            (
              (Array.isArray(_appliedOverlayPayload.priceLines) &&
                _appliedOverlayPayload.priceLines.length > 0) ||
              (Array.isArray(_appliedOverlayPayload.tradeHistorySegments) &&
                _appliedOverlayPayload.tradeHistorySegments.length > 0) ||
              hasTradeHistoryArrowMarkers(_appliedOverlayPayload)
            );
          var payload =
            appliedHasDomGeometry
              ? _appliedOverlayPayload
              : _overlayPayload;
          var historyLayer = ensureOverlayLabelLayer();
          if (historyLayer) {
            renderTradeHistorySegmentDom(historyLayer, payload, null, true);
          }
          var lines = payload && Array.isArray(payload.priceLines) ? payload.priceLines : [];
          if (lines.length === 0) return;
          var bounds = resolveTradeOverlayPaneBounds();
          var anchoredLabelRecords = [];
          var anchoredLabelLane = resolveAnchoredOverlayLabelLane(_overlayLabelLayer, false);
          var openPositionLabelLane = resolveAnchoredOverlayLabelLane(_overlayLabelLayer, true);
          for (var i = 0; i < lines.length; i++) {
            var ln = lines[i];
            if (!ln || !ln.id || typeof ln.price !== 'number' || !isFinite(ln.price)) continue;
            var lineNode = _overlayDomNodesByKey['line:' + ln.id];
            var labelNode = _overlayDomNodesByKey['label:anchored:' + ln.id];
            var boxNode = _overlayDomNodesByKey['box:' + ln.id];
            if (!lineNode && !labelNode && !boxNode) continue;
            var y = series.priceToCoordinate(ln.price);
            if (typeof y !== 'number' || !isFinite(y)) continue;
            var visibility = isTradeOverlayYInsidePane(y, bounds) ? 'visible' : 'hidden';
            var isOpenPosition = isOpenPositionOverlayLine(ln);
            if (lineNode) {
              if (!isOpenPosition) {
                lineNode.style.top = Math.round(y) + 'px';
              }
              lineNode.style.visibility = visibility;
            }
            if (labelNode) {
              applyAnchoredOverlayLabelLane(
                labelNode,
                isOpenPosition ? openPositionLabelLane : anchoredLabelLane
              );
              labelNode.style.visibility = visibility;
            }
            if (labelNode || isOpenPosition) {
              anchoredLabelRecords.push({
                boxNode: boxNode,
                id: ln.id,
                isOpenPosition: isOpenPosition,
                labelMinTop: typeof ln.labelMinTop === 'number' && isFinite(ln.labelMinTop)
                  ? ln.labelMinTop
                  : null,
                node: labelNode,
                lineNode: lineNode,
                paneVisible: visibility === 'visible',
                y: y,
              });
            }
            if (boxNode) {
              if (!isOpenPosition) {
                boxNode.style.top = Math.round(y - OVERLAY_POSITION_BOX_HEIGHT / 2) + 'px';
              }
              boxNode.style.visibility = visibility;
            }
          }
          anchoredLabelRecords.sort(function(left, right) { return left.y - right.y; });
          var anchoredLabelTops = resolveAnchoredOverlayLabelTops(anchoredLabelRecords);
          for (var labelIndex = 0; labelIndex < anchoredLabelRecords.length; labelIndex++) {
            var record = anchoredLabelRecords[labelIndex];
            var labelTop = anchoredLabelTops[labelIndex];
            if (record.node) {
              record.node.style.top = labelTop + 'px';
            }
            if (record.isOpenPosition) {
              var rowY = resolveAnchoredOverlayRowY(labelTop);
              if (record.lineNode) {
                record.lineNode.style.top = rowY + 'px';
              }
              if (record.boxNode) {
                record.boxNode.style.top = Math.round(rowY - OVERLAY_POSITION_BOX_HEIGHT / 2) + 'px';
              }
            }
          }
        } catch (_repositionTradeOverlayErr) {}
      }

      function scheduleTradeOverlayReposition() {
        if (tradeOverlayRepositionRaf) return;
        try {
          tradeOverlayRepositionRaf = requestAnimationFrame(function() {
            tradeOverlayRepositionRaf = 0;
            refreshTradeHistoryMarkerScale(false);
            repositionTradeOverlayDomNodes();
          });
        } catch (_scheduleTradeRepositionErr) {
          tradeOverlayRepositionRaf = 0;
          refreshTradeHistoryMarkerScale(false);
          repositionTradeOverlayDomNodes();
        }
      }

      function resolveOverlayDisplayDecimals() {
        return typeof lastRequestedDisplayDecimals === 'number' && isFinite(lastRequestedDisplayDecimals)
          ? Math.max(0, Math.min(10, Math.round(lastRequestedDisplayDecimals)))
          : resolveRightPriceScaleFallbackDecimals();
      }

      function roundOverlayDragPrice(price) {
        if (typeof price !== 'number' || !isFinite(price) || price <= 0) {
          return null;
        }
        var decimals = resolveOverlayDisplayDecimals();
        return Number(price.toFixed(decimals));
      }

      function sanitizeOverlayDragPrice(price) {
        if (typeof price !== 'number' || !isFinite(price) || price <= 0) {
          return null;
        }
        return price;
      }

      function getOverlayAxisLabelPriceKey(price) {
        var decimals = resolveOverlayDisplayDecimals();
        return Number(price).toFixed(decimals);
      }

      function postChartTradeLineDrag(phase, dragKey, price) {
        if (!dragKey) return;
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'CHART_TRADE_LINE_DRAG',
            phase: phase,
            dragKey: dragKey,
            price: typeof price === 'number' && isFinite(price) ? price : null,
          }));
        } catch (_e) {}
      }

      var pendingChartTradeLineDragMove = null;
      var chartTradeLineDragMoveFrame = null;
      var chartTradeLineDragMoveTimer = null;
      var lastChartTradeLineDragNativeMoveAt = 0;

      function cancelChartTradeLineDragMove() {
        if (chartTradeLineDragMoveFrame !== null) {
          try {
            cancelAnimationFrame(chartTradeLineDragMoveFrame);
          } catch (_e) {}
          chartTradeLineDragMoveFrame = null;
        }
        if (chartTradeLineDragMoveTimer !== null) {
          try {
            clearTimeout(chartTradeLineDragMoveTimer);
          } catch (_e) {}
          chartTradeLineDragMoveTimer = null;
        }
        pendingChartTradeLineDragMove = null;
      }

      function flushChartTradeLineDragMove() {
        chartTradeLineDragMoveFrame = null;
        var pending = pendingChartTradeLineDragMove;
        if (!pending || !pending.dragKey) return;
        var now = Date.now();
        var delay = CHART_TRADE_LINE_DRAG_NATIVE_MOVE_INTERVAL_MS - (now - lastChartTradeLineDragNativeMoveAt);
        if (delay > 0) {
          chartTradeLineDragMoveTimer = setTimeout(function() {
            chartTradeLineDragMoveTimer = null;
            chartTradeLineDragMoveFrame = requestAnimationFrame(flushChartTradeLineDragMove);
          }, delay);
          return;
        }
        pendingChartTradeLineDragMove = null;
        lastChartTradeLineDragNativeMoveAt = now;
        postChartTradeLineDrag('move', pending.dragKey, pending.price);
      }

      function scheduleChartTradeLineDragMove(dragKey, price) {
        if (!dragKey || typeof price !== 'number' || !isFinite(price) || price <= 0) {
          return;
        }
        pendingChartTradeLineDragMove = { dragKey: dragKey, price: price };
        if (chartTradeLineDragMoveFrame !== null || chartTradeLineDragMoveTimer !== null) {
          return;
        }
        try {
          chartTradeLineDragMoveFrame = requestAnimationFrame(flushChartTradeLineDragMove);
        } catch (_e) {
          flushChartTradeLineDragMove();
        }
      }

      function resolveDraggableOverlayPriceLines() {
        var lines = Array.isArray(_overlayPayload && _overlayPayload.priceLines) ? _overlayPayload.priceLines : [];
        var draggable = [];
        for (var i = 0; i < lines.length; i++) {
          var ln = lines[i];
          if (!ln || typeof ln.dragKey !== 'string' || !ln.dragKey) continue;
          if (typeof ln.price !== 'number' || !isFinite(ln.price) || ln.price <= 0) continue;
          draggable.push(ln);
        }
        return draggable;
      }

      function pickDraggableOverlayLineAtY(y) {
        if (!series || typeof y !== 'number' || !isFinite(y)) {
          return null;
        }
        var draggableLines = resolveDraggableOverlayPriceLines();
        var closest = null;
        var closestDistance = Infinity;
        for (var i = 0; i < draggableLines.length; i++) {
          var line = draggableLines[i];
          if (typeof series.priceToCoordinate !== 'function') {
            continue;
          }
          var coordinate = series.priceToCoordinate(line.price);
          if (typeof coordinate !== 'number' || !isFinite(coordinate)) {
            continue;
          }
          var distance = Math.abs(coordinate - y);
          if (distance <= TRADE_LINE_DRAG_HIT_SLOP && distance < closestDistance) {
            closest = {
              dragKey: line.dragKey,
              price: line.price,
              y: coordinate,
            };
            closestDistance = distance;
          }
        }
        return closest;
      }

      function syncOverlayPayloadDragLinePrice(dragKey, price) {
        if (!dragKey || typeof price !== 'number' || !isFinite(price) || price <= 0) {
          return;
        }
        var lines = Array.isArray(_overlayPayload && _overlayPayload.priceLines)
          ? _overlayPayload.priceLines
          : [];
        var nextLines = lines.map(function(line) {
          if (line && line.dragKey === dragKey) {
            return Object.assign({}, line, { price: price });
          }
          return line;
        });
        _overlayPayload = Object.assign({}, _overlayPayload || {}, { priceLines: nextLines });
        if (_appliedOverlayPayload && Array.isArray(_appliedOverlayPayload.priceLines)) {
          _appliedOverlayPayload = Object.assign({}, _appliedOverlayPayload, {
            priceLines: _appliedOverlayPayload.priceLines.map(function(line) {
              if (line && line.dragKey === dragKey) {
                return Object.assign({}, line, { price: price });
              }
              return line;
            }),
          });
        }
        var entry = _overlayPriceLinesByDragKey[dragKey];
        if (entry && entry.line) {
          entry.line.price = price;
        }
      }

      function preserveActiveTradeLineDragPayload(payload) {
        if (!activeTradeLineDrag || !payload || !Array.isArray(payload.priceLines)) {
          return payload;
        }
        return Object.assign({}, payload, {
          priceLines: payload.priceLines.map(function(line) {
            if (line && line.dragKey === activeTradeLineDrag.dragKey) {
              return Object.assign({}, line, { price: activeTradeLineDrag.lastPrice });
            }
            return line;
          }),
        });
      }

      function isActiveSltpDragLine(line) {
        if (
          !activeTradeLineDrag ||
          !line ||
          typeof line.dragKey !== 'string' ||
          line.dragKey !== activeTradeLineDrag.dragKey
        ) {
          return false;
        }
        return line.dragKey === 'sl' ||
          line.dragKey === 'tp' ||
          /^position-stop:(?:sl|tp):/.test(line.dragKey);
      }

      function resolveActiveSltpDragLine() {
        if (!activeTradeLineDrag) return null;
        var lines = Array.isArray(_overlayPayload && _overlayPayload.priceLines)
          ? _overlayPayload.priceLines
          : [];
        for (var i = 0; i < lines.length; i++) {
          if (isActiveSltpDragLine(lines[i])) {
            return lines[i];
          }
        }
        return null;
      }

      function discardTradeLineMagnifierSources() {
        _tradeLineMagnifierSourceCanvases = [];
        _tradeLineMagnifierChartRect = null;
      }

      function hideTradeLineMagnifier() {
        if (_tradeLineMagnifier) {
          _tradeLineMagnifier.style.display = 'none';
        }
      }

      function discardTradeLineMagnifier() {
        hideTradeLineMagnifier();
        if (_tradeLineMagnifier && _tradeLineMagnifier.parentNode) {
          try {
            _tradeLineMagnifier.parentNode.removeChild(_tradeLineMagnifier);
          } catch (_e) {}
        }
        _tradeLineMagnifier = null;
        _tradeLineMagnifierCanvas = null;
        discardTradeLineMagnifierSources();
      }

      function ensureTradeLineMagnifier(layer) {
        if (!layer) return null;
        if (
          _tradeLineMagnifier &&
          _tradeLineMagnifierCanvas &&
          _tradeLineMagnifier.parentNode === layer
        ) {
          return _tradeLineMagnifier;
        }
        _tradeLineMagnifier = document.createElement('div');
        _tradeLineMagnifier.className = 'rtx5-trade-line-magnifier';
        _tradeLineMagnifier.setAttribute('data-rtx5-role', 'trade-line-magnifier');
        _tradeLineMagnifier.setAttribute('aria-hidden', 'true');
        _tradeLineMagnifier.style.position = 'absolute';
        _tradeLineMagnifier.style.left = '0';
        _tradeLineMagnifier.style.top = '0';
        _tradeLineMagnifier.style.width = TRADE_LINE_MAGNIFIER_SIZE + 'px';
        _tradeLineMagnifier.style.height = TRADE_LINE_MAGNIFIER_SIZE + 'px';
        _tradeLineMagnifier.style.boxSizing = 'border-box';
        _tradeLineMagnifier.style.border = '2px solid #2962FF';
        _tradeLineMagnifier.style.borderRadius = '50%';
        _tradeLineMagnifier.style.overflow = 'hidden';
        _tradeLineMagnifier.style.background = lastChartBackgroundColor || '#FFFFFF';
        _tradeLineMagnifier.style.boxShadow = '0 4px 14px rgba(15, 23, 42, 0.28)';
        _tradeLineMagnifier.style.pointerEvents = 'none';
        _tradeLineMagnifier.style.zIndex = '70';
        _tradeLineMagnifier.style.willChange = 'transform';
        _tradeLineMagnifier.style.display = 'none';

        _tradeLineMagnifierCanvas = document.createElement('canvas');
        _tradeLineMagnifierCanvas.className = 'rtx5-trade-line-magnifier-canvas';
        _tradeLineMagnifierCanvas.setAttribute('aria-hidden', 'true');
        _tradeLineMagnifierCanvas.style.position = 'absolute';
        _tradeLineMagnifierCanvas.style.left = '0';
        _tradeLineMagnifierCanvas.style.top = '0';
        _tradeLineMagnifierCanvas.style.width = '100%';
        _tradeLineMagnifierCanvas.style.height = '100%';
        _tradeLineMagnifierCanvas.style.borderRadius = '50%';
        _tradeLineMagnifierCanvas.style.pointerEvents = 'none';
        _tradeLineMagnifier.appendChild(_tradeLineMagnifierCanvas);
        layer.appendChild(_tradeLineMagnifier);
        return _tradeLineMagnifier;
      }

      function prepareTradeLineMagnifierSources() {
        discardTradeLineMagnifierSources();
        if (!resolveActiveSltpDragLine()) {
          hideTradeLineMagnifier();
          return;
        }
        var chartElement = document.getElementById('chart');
        if (!chartElement || typeof chartElement.querySelectorAll !== 'function') return;
        var chartRect = typeof chartElement.getBoundingClientRect === 'function'
          ? chartElement.getBoundingClientRect()
          : null;
        if (!chartRect || !(chartRect.width > 0) || !(chartRect.height > 0)) return;
        _tradeLineMagnifierChartRect = {
          left: chartRect.left,
          top: chartRect.top,
          right: chartRect.right,
          bottom: chartRect.bottom,
          width: chartRect.width,
          height: chartRect.height,
        };
        var canvases = chartElement.querySelectorAll('canvas');
        for (var canvasIndex = 0; canvasIndex < canvases.length; canvasIndex++) {
          var sourceCanvas = canvases[canvasIndex];
          if (
            !sourceCanvas ||
            sourceCanvas === _tradeLineMagnifierCanvas ||
            isCustomRightPriceScaleOverlayNode(sourceCanvas)
          ) {
            continue;
          }
          var sourceRect = typeof sourceCanvas.getBoundingClientRect === 'function'
            ? sourceCanvas.getBoundingClientRect()
            : null;
          if (
            !sourceRect ||
            !(sourceRect.width > 0) ||
            !(sourceRect.height > 0) ||
            !(sourceCanvas.width > 0) ||
            !(sourceCanvas.height > 0)
          ) {
            continue;
          }
          _tradeLineMagnifierSourceCanvases.push({
            canvas: sourceCanvas,
            left: sourceRect.left,
            top: sourceRect.top,
            right: sourceRect.right,
            bottom: sourceRect.bottom,
            scaleX: sourceCanvas.width / sourceRect.width,
            scaleY: sourceCanvas.height / sourceRect.height,
          });
        }
      }

      function clampTradeLineMagnifierValue(value, minimum, maximum) {
        return Math.max(minimum, Math.min(maximum, value));
      }

      function resolveTradeLineMagnifierGeometry(layer, lineY) {
        if (!layer || !activeTradeLineDrag) return null;
        var chartWidth = Math.max(0, layer.clientWidth || 0);
        var chartHeight = Math.max(0, layer.clientHeight || 0);
        var size = TRADE_LINE_MAGNIFIER_SIZE;
        var padding = TRADE_LINE_MAGNIFIER_EDGE_PADDING;
        if (chartWidth < size + padding * 2 || chartHeight < size + padding * 2) return null;

        var metrics = resolvePrimaryPaneMetrics();
        var plotLeft = clampTradeLineMagnifierValue(
          Math.round(metrics && metrics.leftAxisWidth ? metrics.leftAxisWidth : 0),
          0,
          chartWidth
        );
        var plotRight = clampTradeLineMagnifierValue(
          plotLeft + Math.round(metrics && metrics.paneWidth ? metrics.paneWidth : chartWidth - plotLeft),
          plotLeft,
          chartWidth
        );
        var plotTop = clampTradeLineMagnifierValue(
          Math.round(metrics && metrics.plotTop ? metrics.plotTop : 0),
          0,
          chartHeight
        );
        var plotBottom = clampTradeLineMagnifierValue(
          plotTop + Math.round(metrics && metrics.plotHeight ? metrics.plotHeight : chartHeight - plotTop),
          plotTop,
          chartHeight
        );
        if (plotRight - plotLeft < size + padding * 2) {
          plotLeft = 0;
          plotRight = chartWidth;
        }
        if (plotBottom - plotTop < size + padding * 2) {
          plotTop = 0;
          plotBottom = chartHeight;
        }

        var pointerX = typeof activeTradeLineDrag.pointerX === 'number' && isFinite(activeTradeLineDrag.pointerX)
          ? activeTradeLineDrag.pointerX
          : (plotLeft + plotRight) / 2;
        var sampleX = clampTradeLineMagnifierValue(pointerX, plotLeft, plotRight);
        var sampleY = clampTradeLineMagnifierValue(lineY, plotTop, plotBottom);
        var minLeft = Math.max(padding, plotLeft + padding);
        var maxLeft = Math.max(minLeft, Math.min(chartWidth - size - padding, plotRight - size - padding));
        var minTop = Math.max(padding, plotTop + padding);
        var maxTop = Math.max(minTop, Math.min(chartHeight - size - padding, plotBottom - size - padding));

        var preferredLeft = sampleX + TRADE_LINE_MAGNIFIER_GAP;
        if (preferredLeft + size > plotRight - padding) {
          preferredLeft = sampleX - size - TRADE_LINE_MAGNIFIER_GAP;
        }
        var preferredTop = sampleY - size - TRADE_LINE_MAGNIFIER_GAP;
        if (preferredTop < plotTop + padding) {
          preferredTop = sampleY + TRADE_LINE_MAGNIFIER_GAP;
        }
        return {
          left: clampTradeLineMagnifierValue(preferredLeft, minLeft, maxLeft),
          top: clampTradeLineMagnifierValue(preferredTop, minTop, maxTop),
          sampleX: sampleX,
          sampleY: sampleY,
          size: size,
        };
      }

      function drawTradeLineMagnifierChartContent(canvas, geometry, activeLine) {
        if (!canvas || !geometry || !activeLine || !_tradeLineMagnifierChartRect) return false;
        var context = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
        if (!context) return false;
        var cssSize = geometry.size;
        var pixelRatio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        var backingSize = Math.max(1, Math.round(cssSize * pixelRatio));
        if (canvas.width !== backingSize || canvas.height !== backingSize) {
          canvas.width = backingSize;
          canvas.height = backingSize;
        }
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        context.imageSmoothingEnabled = true;
        try { context.imageSmoothingQuality = 'high'; } catch (_e) {}
        context.save();
        context.beginPath();
        context.arc(cssSize / 2, cssSize / 2, cssSize / 2 - 2, 0, Math.PI * 2);
        context.clip();
        context.fillStyle = lastChartBackgroundColor || '#FFFFFF';
        context.fillRect(0, 0, cssSize, cssSize);

        var sourceSpan = cssSize / TRADE_LINE_MAGNIFIER_ZOOM;
        var sourceLeft = _tradeLineMagnifierChartRect.left + geometry.sampleX - sourceSpan / 2;
        var sourceTop = _tradeLineMagnifierChartRect.top + geometry.sampleY - sourceSpan / 2;
        var sourceRight = sourceLeft + sourceSpan;
        var sourceBottom = sourceTop + sourceSpan;
        for (var sourceIndex = 0; sourceIndex < _tradeLineMagnifierSourceCanvases.length; sourceIndex++) {
          var source = _tradeLineMagnifierSourceCanvases[sourceIndex];
          if (!source || !source.canvas || source.canvas === canvas || !source.canvas.parentNode) continue;
          var intersectionLeft = Math.max(sourceLeft, source.left);
          var intersectionTop = Math.max(sourceTop, source.top);
          var intersectionRight = Math.min(sourceRight, source.right);
          var intersectionBottom = Math.min(sourceBottom, source.bottom);
          if (!(intersectionRight > intersectionLeft) || !(intersectionBottom > intersectionTop)) continue;
          var sourceX = (intersectionLeft - source.left) * source.scaleX;
          var sourceY = (intersectionTop - source.top) * source.scaleY;
          var sourceWidth = (intersectionRight - intersectionLeft) * source.scaleX;
          var sourceHeight = (intersectionBottom - intersectionTop) * source.scaleY;
          var destinationX = (intersectionLeft - sourceLeft) * TRADE_LINE_MAGNIFIER_ZOOM;
          var destinationY = (intersectionTop - sourceTop) * TRADE_LINE_MAGNIFIER_ZOOM;
          var destinationWidth = (intersectionRight - intersectionLeft) * TRADE_LINE_MAGNIFIER_ZOOM;
          var destinationHeight = (intersectionBottom - intersectionTop) * TRADE_LINE_MAGNIFIER_ZOOM;
          try {
            context.drawImage(
              source.canvas,
              sourceX,
              sourceY,
              sourceWidth,
              sourceHeight,
              destinationX,
              destinationY,
              destinationWidth,
              destinationHeight
            );
          } catch (_drawErr) {}
        }

        // The active trade guide is DOM-owned, so it is not present in the
        // Lightweight Charts canvases. Paint only that line in the lens;
        // its label/value deliberately remain hidden for the whole drag.
        var guideColor = activeLine.color || '#2962FF';
        var guideWidth = Math.max(2, (Number(activeLine.lineWidth) || 1) * TRADE_LINE_MAGNIFIER_ZOOM);
        var guideStyle = resolveOverlayDomLineBorderStyle(activeLine.lineStyle);
        context.setLineDash(guideStyle === 'dotted' ? [2, 3] : (guideStyle === 'dashed' ? [7, 5] : []));
        context.lineWidth = guideWidth;
        context.strokeStyle = guideColor;
        context.beginPath();
        context.moveTo(0, cssSize / 2);
        context.lineTo(cssSize, cssSize / 2);
        context.stroke();
        context.setLineDash([]);
        context.fillStyle = guideColor;
        context.beginPath();
        context.arc(cssSize / 2, cssSize / 2, 3, 0, Math.PI * 2);
        context.fill();
        context.restore();
        return true;
      }

      function renderTradeLineMagnifier() {
        try {
          var activeLine = resolveActiveSltpDragLine();
          if (!activeLine || !series || typeof series.priceToCoordinate !== 'function') {
            hideTradeLineMagnifier();
            return;
          }
          if (_tradeLineMagnifierSourceCanvases.length === 0 || !_tradeLineMagnifierChartRect) {
            prepareTradeLineMagnifierSources();
          }
          var lineY = series.priceToCoordinate(activeTradeLineDrag.lastPrice);
          if (typeof lineY !== 'number' || !isFinite(lineY)) {
            lineY = activeTradeLineDrag.pointerY;
          }
          if (typeof lineY !== 'number' || !isFinite(lineY)) {
            hideTradeLineMagnifier();
            return;
          }
          var layer = ensureOverlayLabelLayer();
          var magnifier = ensureTradeLineMagnifier(layer);
          var geometry = resolveTradeLineMagnifierGeometry(layer, lineY);
          if (
            !magnifier ||
            !geometry ||
            !drawTradeLineMagnifierChartContent(_tradeLineMagnifierCanvas, geometry, activeLine)
          ) {
            hideTradeLineMagnifier();
            return;
          }
          magnifier.style.width = geometry.size + 'px';
          magnifier.style.height = geometry.size + 'px';
          magnifier.style.background = lastChartBackgroundColor || '#FFFFFF';
          magnifier.style.borderColor = activeLine.color || '#2962FF';
          magnifier.style.transform = 'translate3d(' + Math.round(geometry.left) + 'px,' + Math.round(geometry.top) + 'px,0)';
          magnifier.style.display = 'block';
        } catch (_magnifierErr) {
          hideTradeLineMagnifier();
        }
      }

      function updateDraggedOverlayLinePreview(dragKey, price) {
        if (!dragKey || typeof price !== 'number' || !isFinite(price) || price <= 0) {
          return;
        }
        syncOverlayPayloadDragLinePrice(dragKey, price);
        var entry = _overlayPriceLinesByDragKey[dragKey];
        if (!entry || !entry.api || !entry.line) {
          scheduleTradeLineDragDomRefresh();
          return;
        }
        entry.line.price = price;
        try {
          entry.api.applyOptions({
            price: price,
            axisLabelVisible: false,
            title: '',
          });
        } catch (_e) {}
        scheduleTradeLineDragDomRefresh();
      }

      function resolveOverlayDomLineBorderStyle(lineStyle) {
        if (lineStyle === 1 || lineStyle === 4) return 'dotted';
        if (lineStyle === 2 || lineStyle === 3) return 'dashed';
        return 'solid';
      }

      function resolvePositionBoxGap(boxCount) {
        return boxCount > 1 ? 4 : 2;
      }

      function isOpenPositionOverlayLine(line) {
        return !!(line && typeof line.id === 'string' && line.id.indexOf('open-') === 0);
      }

      function resolveAnchoredOverlayLabelLane(layer, leftBiased) {
        var metrics = resolvePrimaryPaneMetrics();
        var layerWidth = Math.max(0, Math.round((layer && layer.clientWidth) || metrics.chartWidth || 0));
        var paneLeft = Math.max(0, Math.min(layerWidth, Math.round(metrics.leftAxisWidth || 0)));
        var axisMetrics = resolveMarketPriceScaleAxisMetrics(layer);
        var paneRight = axisMetrics
          ? Math.round(axisMetrics.axisLeft)
          : paneLeft + Math.max(0, Math.round(metrics.paneWidth || 0));
        paneRight = Math.max(paneLeft, Math.min(layerWidth, paneRight));
        var paneWidth = Math.max(0, paneRight - paneLeft);
        var laneWidth = Math.min(
          OVERLAY_ANCHORED_LABEL_LANE_WIDTH,
          Math.max(0, paneWidth - OVERLAY_ANCHORED_LABEL_LEFT * 2)
        );
        if (laneWidth < 80) {
          laneWidth = Math.min(80, paneWidth);
        }
        var remainingWidth = Math.max(0, paneWidth - laneWidth);
        var desiredLeftInset = Math.min(
          OVERLAY_OPEN_POSITION_LABEL_MAX_LEFT,
          Math.max(
            OVERLAY_ANCHORED_LABEL_LEFT,
            Math.round(paneWidth * OVERLAY_OPEN_POSITION_LABEL_LEFT_RATIO)
          )
        );
        var maxLeftInset = Math.max(0, remainingWidth - OVERLAY_ANCHORED_LABEL_LEFT);
        var laneInset = leftBiased === true
          ? Math.min(desiredLeftInset, maxLeftInset)
          : remainingWidth / 2;
        return {
          left: Math.round(paneLeft + laneInset),
          width: laneWidth,
        };
      }

      function applyAnchoredOverlayLabelLane(label, lane) {
        if (!label || !lane) return;
        label.style.left = Math.round(lane.left) + 'px';
        label.style.width = Math.max(0, Math.round(lane.width)) + 'px';
        label.style.maxWidth = Math.max(0, Math.round(lane.width)) + 'px';
        label.style.textAlign = 'center';
      }

      function resolveAnchoredOverlayLabelTops(labels) {
        var tops = [];
        var anchoredStep = Math.max(
          OVERLAY_LABEL_LINE_HEIGHT + OVERLAY_LABEL_LINE_GAP,
          OVERLAY_POSITION_BOX_HEIGHT + resolvePositionBoxGap(labels.length)
        );
        var previousVisibleTop = null;
        for (var i = 0; i < labels.length; i++) {
          var item = labels[i];
          var top = Math.round(item.y - OVERLAY_LABEL_LINE_HEIGHT - OVERLAY_LABEL_LINE_GAP);
          // Open positions always stay on their real price coordinate. Close
          // entries may overlap at the default scale; zooming the price scale
          // naturally separates them as its numeric interval becomes finer.
          // Draft/order/SL/TP labels retain their existing collision layout.
          if (!isOpenPositionOverlayLine(item) && item.paneVisible !== false) {
            if (typeof item.labelMinTop === 'number' && isFinite(item.labelMinTop)) {
              top = Math.max(top, Math.round(item.labelMinTop));
            }
            if (previousVisibleTop !== null) {
              top = Math.max(top, previousVisibleTop + anchoredStep);
            }
            previousVisibleTop = top;
          }
          tops[i] = top;
        }
        return tops;
      }

      function resolveAnchoredOverlayRowY(labelTop) {
        return Math.round(labelTop + OVERLAY_LABEL_LINE_HEIGHT + OVERLAY_LABEL_LINE_GAP);
      }

      function renderAnchoredTradeLine(layer, item, nodeKey, displayY) {
        if (!layer || !item || item.drawAnchoredTradeLine !== true) {
          return;
        }
        if (typeof item.y !== 'number' || !isFinite(item.y)) {
          return;
        }
        var metrics = resolvePrimaryPaneMetrics();
        var paneWidth = Math.max(0, Math.round(metrics.paneWidth || 0));
        if (paneWidth <= 0) {
          return;
        }

        // Keep the visible open-trade line locked to the same payload and
        // coordinate as the live BUY/SELL lot + P/L text label.
        // Upsert in place — never destroy/recreate the line on every quote tick
        // (that blanked the horizontal trade line and caused the chart blink).
        var lineKey = nodeKey || ('line:' + (item.id || item.y));
        var line = upsertOverlayDomNode(layer, lineKey, 'rtx5-anchored-trade-line');
        if (!line) return;
        line.setAttribute('data-rtx5-role', 'anchored-trade-line');
        line.style.position = 'absolute';
        line.style.left = Math.max(0, Math.round(metrics.leftAxisWidth || 0)) + 'px';
        var lineY = typeof displayY === 'number' && isFinite(displayY) ? displayY : item.y;
        line.style.top = Math.round(lineY) + 'px';
        // Viewport clipping only — an off-pane trade line stays in the DOM at
        // its true coordinate and reappears when its price scrolls back in.
        line.style.visibility = isTradeOverlayYInsidePane(item.y, resolveTradeOverlayPaneBounds())
          ? 'visible'
          : 'hidden';
        line.style.width = paneWidth + 'px';
        line.style.height = '0px';
        // Keep the dot spacing while rendering the open-trade stroke as a hairline.
        line.style.transformOrigin = 'top left';
        line.style.transform = isOpenPositionOverlayLine(item) ? 'scaleY(0.5)' : 'none';
        line.style.borderTop =
          Math.max(1, Math.round(item.lineWidth || 1)) + 'px ' +
          resolveOverlayDomLineBorderStyle(item.lineStyle) + ' ' +
          (item.color || '#2962FF');
        line.style.pointerEvents = 'none';
        line.style.zIndex = '7';
      }

      function clearMarketPriceScaleExtensions(layer) {
        if (!layer || typeof layer.querySelectorAll !== 'function') {
          return;
        }
        var extensions = layer.querySelectorAll('.rtx5-market-price-scale-extension');
        for (var i = 0; i < extensions.length; i++) {
          var extension = extensions[i];
          if (extension && extension.parentNode) {
            extension.parentNode.removeChild(extension);
          }
        }
      }

      function renderMarketPriceScaleExtension(layer, price, color) {
        if (!layer || !series || typeof price !== 'number' || !isFinite(price) || price <= 0) {
          return;
        }
        if (typeof series.priceToCoordinate !== 'function') {
          return;
        }
        var y = series.priceToCoordinate(price);
        if (typeof y !== 'number' || !isFinite(y)) {
          return;
        }
        var metrics = resolvePrimaryPaneMetrics();
        var axisLeft = Math.round((metrics.leftAxisWidth || 0) + (metrics.paneWidth || 0));
        var axisWidth = Math.max(0, Math.round(metrics.rightAxisWidth || 0));
        var chartWidth = Math.max(0, Math.round(metrics.chartWidth || layer.clientWidth || 0));
        if (axisWidth <= 0 || chartWidth <= axisLeft) {
          return;
        }

        // Reuse the existing extension node so live-price ticks do not flash.
        var extension = layer.querySelector
          ? layer.querySelector('.rtx5-market-price-scale-extension')
          : null;
        if (!extension) {
          extension = document.createElement('div');
          extension.className = 'rtx5-market-price-scale-extension';
          layer.appendChild(extension);
        }
        extension.style.position = 'absolute';
        extension.style.left = axisLeft + 'px';
        extension.style.top = Math.round(y) + 'px';
        extension.style.width = Math.min(axisWidth, Math.max(0, chartWidth - axisLeft)) + 'px';
        extension.style.height = MARKET_PRICE_SCALE_EXTENSION_HEIGHT + 'px';
        extension.style.background = color || '#2962FF';
        extension.style.pointerEvents = 'none';
        extension.style.zIndex = '8';
      }

      function renderMarketPriceScaleExtensions(layer) {
        if (lastLivePrice === null || typeof lastLivePrice !== 'number' || !isFinite(lastLivePrice)) {
          clearMarketPriceScaleExtensions(layer);
          return;
        }
        renderMarketPriceScaleExtension(layer, lastLivePrice, marketLiveColor);
      }

      function clearMarketPriceScaleBadges(layer) {
        if (!layer || typeof layer.querySelectorAll !== 'function') {
          return;
        }
        var badges = layer.querySelectorAll('.rtx5-market-price-scale-badge');
        for (var i = 0; i < badges.length; i++) {
          var badge = badges[i];
          if (badge && badge.parentNode) {
            badge.parentNode.removeChild(badge);
          }
        }
      }

      function resolveMarketPriceScaleAxisMetrics(layer) {
        var metrics = resolvePrimaryPaneMetrics();
        var chartWidth = Math.max(0, Math.round(metrics.chartWidth || (layer && layer.clientWidth) || 0));
        var axisMetrics = resolveRightPriceScaleFallbackAxisMetrics(Object.assign({}, metrics, {
          chartWidth: chartWidth,
        }));
        var axisLeft = Math.max(0, Math.round(axisMetrics.axisLeft || 0));
        var axisWidth = Math.max(MARKET_PRICE_SCALE_BADGE_MIN_WIDTH, Math.round(axisMetrics.axisWidth || 0));
        if (chartWidth > 0 && axisLeft + axisWidth > chartWidth) {
          axisWidth = Math.max(0, chartWidth - axisLeft);
        }
        if (axisWidth <= 0 || chartWidth <= axisLeft) {
          return null;
        }
        var plotTop = Math.max(0, Math.round(metrics.plotTop || 0));
        var plotHeight = Math.max(0, Math.round(metrics.plotHeight || metrics.paneHeight || 0));
        return {
          axisLeft: axisLeft,
          axisWidth: axisWidth,
          chartWidth: chartWidth,
          plotTop: plotTop,
          plotBottom: plotTop + plotHeight,
        };
      }

      function formatMarketPriceScaleBadgeLabel(price) {
        var decimals = resolveOverlayDisplayDecimals();
        return Number(price).toFixed(decimals);
      }

      function collectMarketPriceScaleBadge(layer, axisMetrics, price, color, role) {
        if (!layer || !axisMetrics || !series || typeof price !== 'number' || !isFinite(price) || price <= 0) {
          return null;
        }
        if (typeof series.priceToCoordinate !== 'function') {
          return null;
        }
        var y = series.priceToCoordinate(price);
        if (typeof y !== 'number' || !isFinite(y)) {
          return null;
        }
        var countdownLabel = role === 'live' ? resolveCandleCountdownLabel() : null;
        var hasCountdown = typeof countdownLabel === 'string' && countdownLabel.length > 0;
        var badgeHeight = hasCountdown ? MARKET_LIVE_PRICE_BADGE_HEIGHT : MARKET_PRICE_SCALE_BADGE_HEIGHT;
        var priceRowHeight = hasCountdown
          ? MARKET_LIVE_PRICE_BADGE_PRICE_ROW_HEIGHT
          : MARKET_PRICE_SCALE_BADGE_HEIGHT;
        var desiredTop = Math.round(y - priceRowHeight / 2);
        return {
          badgeHeight: badgeHeight,
          color: color || '#2962FF',
          countdownLabel: countdownLabel,
          desiredTop: desiredTop,
          price: price,
          priceRowHeight: priceRowHeight,
          role: role,
          top: desiredTop,
          y: y,
        };
      }

      function renderMarketPriceScaleBadge(layer, badge, axisMetrics) {
        if (!layer || !badge || !axisMetrics) {
          return;
        }
        var roleClass = 'rtx5-market-price-scale-badge-' + badge.role;
        var el = layer.querySelector
          ? layer.querySelector('.rtx5-market-price-scale-badge.' + roleClass)
          : null;
        if (!el) {
          el = document.createElement('div');
          el.className = 'rtx5-market-price-scale-badge ' + roleClass;
          layer.appendChild(el);
        }
        el.setAttribute('data-rtx5-role', 'market-price-scale-' + badge.role);
        var priceRow = el.querySelector
          ? el.querySelector('.rtx5-market-price-scale-badge-price')
          : null;
        var countdownRow = el.querySelector
          ? el.querySelector('.rtx5-market-price-scale-badge-countdown')
          : null;
        if (!priceRow || !countdownRow) {
          el.textContent = '';
          priceRow = document.createElement('span');
          priceRow.className = 'rtx5-market-price-scale-badge-price';
          countdownRow = document.createElement('span');
          countdownRow.className = 'rtx5-market-price-scale-badge-countdown';
          countdownRow.setAttribute('data-rtx5-role', 'candle-countdown');
          el.appendChild(priceRow);
          el.appendChild(countdownRow);
        }
        priceRow.textContent = formatMarketPriceScaleBadgeLabel(badge.price);
        countdownRow.textContent = badge.countdownLabel || '';
        el.style.position = 'absolute';
        el.style.left = axisMetrics.axisLeft + 'px';
        el.style.top = Math.round(badge.top) + 'px';
        el.style.width = axisMetrics.axisWidth + 'px';
        el.style.height = badge.badgeHeight + 'px';
        el.style.boxSizing = 'border-box';
        el.style.padding = '0 ' + MARKET_PRICE_SCALE_BADGE_PADDING_X + 'px';
        el.style.background = badge.color;
        el.style.color = '#FFFFFF';
        el.style.borderRadius = '2px';
        el.style.fontSize = '12px';
        el.style.fontWeight = '700';
        el.style.fontVariantNumeric = 'tabular-nums';
        el.style.fontFeatureSettings = '"tnum" 1, "lnum" 1';
        el.style.textAlign = 'right';
        el.style.whiteSpace = 'nowrap';
        el.style.overflow = 'hidden';
        el.style.pointerEvents = 'none';
        el.style.zIndex = '14';
        el.style.display = 'flex';
        el.style.flexDirection = 'column';
        el.style.alignItems = 'stretch';
        priceRow.style.display = 'block';
        priceRow.style.height = badge.priceRowHeight + 'px';
        priceRow.style.lineHeight = badge.priceRowHeight + 'px';
        countdownRow.style.display = badge.countdownLabel ? 'block' : 'none';
        countdownRow.style.height = MARKET_LIVE_PRICE_BADGE_COUNTDOWN_ROW_HEIGHT + 'px';
        countdownRow.style.lineHeight = MARKET_LIVE_PRICE_BADGE_COUNTDOWN_ROW_HEIGHT + 'px';
        countdownRow.style.fontSize = badge.countdownLabel && badge.countdownLabel.length > 11 ? '8px' : '10px';
        countdownRow.style.fontWeight = '700';
      }

      function renderMarketPriceScaleBadges(layer) {
        var axisMetrics = resolveMarketPriceScaleAxisMetrics(layer);
        if (!axisMetrics) {
          clearMarketPriceScaleBadges(layer);
          return;
        }
        var badges = [
          collectMarketPriceScaleBadge(layer, axisMetrics, lastLivePrice, marketLiveColor, 'live'),
        ].filter(Boolean);
        if (badges.length === 0) {
          clearMarketPriceScaleBadges(layer);
          return;
        }
        badges.sort(function(left, right) { return left.desiredTop - right.desiredTop; });
        for (var i = 0; i < badges.length; i++) {
          var nextTop = badges[i].desiredTop;
          if (i > 0) {
            nextTop = Math.max(
              nextTop,
              badges[i - 1].top + badges[i - 1].badgeHeight + MARKET_PRICE_SCALE_BADGE_GAP
            );
          }
          badges[i].top = nextTop;
        }
        // Update live badge(s) in place — do not wipe then recreate (tick flash).
        for (var badgeIndex = 0; badgeIndex < badges.length; badgeIndex++) {
          renderMarketPriceScaleBadge(layer, badges[badgeIndex], axisMetrics);
        }
      }

      function refreshMarketPriceScaleDom() {
        try {
          if (!series) {
            return;
          }
          var layer = ensureOverlayLabelLayer();
          if (!layer) return;
          renderMarketPriceScaleExtensions(layer);
          renderMarketPriceScaleBadges(layer);
        } catch (marketPriceScaleErr) {
          postError('refreshMarketPriceScaleDom', marketPriceScaleErr);
        }
      }

      function formatMoveDirectionOverlayBadgeLabel(value) {
        var decimals =
          typeof lastDisplayDecimals === 'number' && isFinite(lastDisplayDecimals) && lastDisplayDecimals >= 0
            ? Math.min(8, Math.max(0, Math.floor(lastDisplayDecimals)))
            : resolveOverlayDisplayDecimals();
        var rounded = Number(value).toFixed(decimals);
        if (value > 0) {
          return '+' + rounded;
        }
        return rounded;
      }

      function renderMoveDirectionOverlayBadge(layer, liveKeys) {
        if (!layer || !moveBarsSeries || !series || !_liveBar || !shouldUseMoveBarsPane()) {
          return;
        }
        if (typeof moveBarsSeries.priceToCoordinate !== 'function') {
          return;
        }

        var value = pickLiveSignedMoveValue();
        if (typeof value !== 'number' || !isFinite(value)) {
          return;
        }

        // Anchor the highlight at the TOP of the live volume bar (its |close −
        // open| magnitude on the move scale), so the up/down value sits right
        // at the bar it describes in the bottom region — not in the candle area.
        var y = moveBarsSeries.priceToCoordinate(pickLiveMoveValue());
        if (typeof y !== 'number' || !isFinite(y)) {
          return;
        }

        var axisMetrics = resolveMarketPriceScaleAxisMetrics(layer);
        if (!axisMetrics) {
          return;
        }

        // The badge sits ON the right price-scale axis, like the bid/ask
        // badges. Clamp to the FULL pane height (not the 66% candle plot) so it
        // can land in the move/volume region at the bottom of the scale.
        var paneMetrics = resolvePrimaryPaneMetrics();
        var paneBottom = Math.max(
          axisMetrics.plotBottom,
          Math.round(paneMetrics.paneHeight || 0)
        );
        var minTop = axisMetrics.plotTop;
        var maxTop = Math.max(minTop, paneBottom - MARKET_PRICE_SCALE_BADGE_HEIGHT);
        var top = Math.max(minTop, Math.min(maxTop, Math.round(y - MARKET_PRICE_SCALE_BADGE_HEIGHT / 2)));

        var el = upsertOverlayDomNode(layer, 'move-badge', 'rtx5-move-overlay-badge');
        if (!el) return;
        if (liveKeys) liveKeys.push('move-badge');
        el.setAttribute('data-rtx5-role', 'move-overlay-value');
        el.textContent = formatMoveDirectionOverlayBadgeLabel(value);
        el.style.position = 'absolute';
        el.style.left = axisMetrics.axisLeft + 'px';
        el.style.top = top + 'px';
        el.style.width = axisMetrics.axisWidth + 'px';
        el.style.height = MARKET_PRICE_SCALE_BADGE_HEIGHT + 'px';
        el.style.lineHeight = MARKET_PRICE_SCALE_BADGE_HEIGHT + 'px';
        el.style.boxSizing = 'border-box';
        el.style.padding = '0 ' + MARKET_PRICE_SCALE_BADGE_PADDING_X + 'px';
        el.style.background = pickLivePriceColor();
        el.style.color = '#FFFFFF';
        el.style.borderRadius = '2px';
        el.style.fontSize = '12px';
        el.style.fontWeight = '700';
        el.style.fontVariantNumeric = 'tabular-nums';
        el.style.fontFeatureSettings = '"tnum" 1, "lnum" 1';
        el.style.textAlign = 'right';
        el.style.whiteSpace = 'nowrap';
        el.style.overflow = 'hidden';
        el.style.pointerEvents = 'none';
        el.style.zIndex = '14';
      }

      function refreshOverlayDomLabels(payload) {
        try {
          // NEVER wipe the whole overlay layer on routine refreshes.
          // Open-trade horizontal lines are DOM-only (native lineVisible:false).
          // clearOverlayDomLabels() + rebuild on every quote tick blanked those
          // lines for a frame — the clear horizontal chart blink after place-order.
          if (!series) {
            clearOverlayDomLabels();
            clearRightPriceScaleFallbackLabels();
            return;
          }
          renderFallbackRightPriceScaleLabels();
          var layer = ensureOverlayLabelLayer();
          if (!layer) return;
          var liveOverlayKeys = [];
          renderTradeHistorySegmentDom(layer, payload, liveOverlayKeys, false);
          refreshMarketPriceScaleDom();
          renderMoveDirectionOverlayBadge(layer, liveOverlayKeys);
          var lines = Array.isArray(payload && payload.priceLines) ? payload.priceLines : [];
          var floatingLabels = [];
          var anchoredLabels = [];
          var tradeOverlayPaneBounds = resolveTradeOverlayPaneBounds();
          for (var i = 0; i < lines.length; i++) {
            var ln = lines[i];
            if (!ln || !ln.title || typeof ln.price !== 'number' || !isFinite(ln.price)) continue;
            if (typeof series.priceToCoordinate !== 'function') continue;
            var y = series.priceToCoordinate(ln.price);
            if (typeof y !== 'number' || !isFinite(y)) continue;
            var labelRecord = {
              paneVisible: isTradeOverlayYInsidePane(y, tradeOverlayPaneBounds),
              color: ln.color || '#2962FF',
              drawAnchoredTradeLine: ln.labelPlacement === 'line',
              dragKey: typeof ln.dragKey === 'string' ? ln.dragKey : '',
              id: ln.id || '',
              labelSideColor: typeof ln.labelSideColor === 'string' && ln.labelSideColor ? ln.labelSideColor : '',
              labelSideText: typeof ln.labelSideText === 'string' ? ln.labelSideText : '',
              labelValueColor: typeof ln.labelValueColor === 'string' && ln.labelValueColor ? ln.labelValueColor : '',
              labelValueText: typeof ln.labelValueText === 'string' ? ln.labelValueText : '',
              labelMinTop: typeof ln.labelMinTop === 'number' && isFinite(ln.labelMinTop) ? ln.labelMinTop : null,
              lineStyle: typeof ln.lineStyle === 'number' ? ln.lineStyle : 0,
              lineWidth: typeof ln.lineWidth === 'number' ? ln.lineWidth : 1,
              text: String(ln.title),
              y: y,
            };
            if ((typeof ln.dragKey === 'string' && ln.dragKey) || ln.labelPlacement === 'line') {
              anchoredLabels.push(labelRecord);
            } else {
              floatingLabels.push(labelRecord);
            }
          }
          floatingLabels.sort(function(left, right) { return left.y - right.y; });
          var step = OVERLAY_LABEL_HEIGHT + OVERLAY_LABEL_GAP;
          var tops = [];
          for (var j = 0; j < floatingLabels.length; j++) {
            var desiredTop = Math.round(floatingLabels[j].y - OVERLAY_LABEL_HEIGHT / 2);
            if (j > 0) {
              desiredTop = Math.max(desiredTop, tops[j - 1] + step);
            }
            tops[j] = desiredTop;
          }
          anchoredLabels.sort(function(left, right) { return left.y - right.y; });
          var anchoredTops = resolveAnchoredOverlayLabelTops(anchoredLabels);
          var anchoredLabelLane = resolveAnchoredOverlayLabelLane(layer, false);
          var openPositionLabelLane = resolveAnchoredOverlayLabelLane(layer, true);
          var openPositionRowYById = Object.create(null);
          for (var anchoredRowIndex = 0; anchoredRowIndex < anchoredLabels.length; anchoredRowIndex++) {
            var anchoredRowItem = anchoredLabels[anchoredRowIndex];
            if (isOpenPositionOverlayLine(anchoredRowItem)) {
              openPositionRowYById[anchoredRowItem.id] = resolveAnchoredOverlayRowY(
                anchoredTops[anchoredRowIndex]
              );
            }
          }

          var renderLabel = function(item, top, labelKey) {
            var key = labelKey || ('label:' + (item.id || item.text || top));
            liveOverlayKeys.push(key);
            var label = upsertOverlayDomNode(layer, key, 'rtx5-overlay-trade-label');
            if (!label) return;
            var hasSplitTradeLabel = !!(item.labelSideText && item.labelValueText);
            var isAnchoredTradeLabel = item.drawAnchoredTradeLine === true;
            var isOpenPositionTradeLabel = isOpenPositionOverlayLine(item);
            var activeAnchoredLabelLane = isOpenPositionTradeLabel
              ? openPositionLabelLane
              : anchoredLabelLane;
            var labelLeft = isAnchoredTradeLabel
              ? activeAnchoredLabelLane.left
              : OVERLAY_ANCHORED_LABEL_LEFT;
            var labelMaxWidth = Math.max(
              80,
              (layer.clientWidth || 0) - labelLeft - OVERLAY_ANCHORED_LABEL_RIGHT_PADDING
            );
            if (isAnchoredTradeLabel) {
              labelMaxWidth = activeAnchoredLabelLane.width;
            }
            if (hasSplitTradeLabel) {
              var sideSpan = label.childNodes[0];
              var separatorSpan = label.childNodes[1];
              var valueSpan = label.childNodes[2];
              if (
                !sideSpan || sideSpan.nodeName !== 'SPAN' ||
                !separatorSpan || separatorSpan.nodeName !== 'SPAN' ||
                !valueSpan || valueSpan.nodeName !== 'SPAN' ||
                label.childNodes.length !== 3
              ) {
                while (label.firstChild) {
                  label.removeChild(label.firstChild);
                }
                sideSpan = document.createElement('span');
                separatorSpan = document.createElement('span');
                valueSpan = document.createElement('span');
                label.appendChild(sideSpan);
                label.appendChild(separatorSpan);
                label.appendChild(valueSpan);
              }
              sideSpan.textContent = item.labelSideText;
              sideSpan.style.color = isOpenPositionTradeLabel
                ? (item.labelValueColor || item.color)
                : (item.labelSideColor || item.color);
              separatorSpan.textContent = ', ';
              separatorSpan.style.color = sideSpan.style.color;
              valueSpan.textContent = item.labelValueText;
              valueSpan.style.color = item.labelValueColor || item.color;
              // Keep the text anchored to one starting point, but back only
              // its content: expanding P/L would paint a blank chart strip.
              sideSpan.style.backgroundColor = separatorSpan.style.backgroundColor = isOpenPositionTradeLabel
                ? (lastChartBackgroundColor || '#FFFFFF')
                : 'transparent';
              sideSpan.style.padding = isOpenPositionTradeLabel ? '0 2px' : '0';
              sideSpan.style.borderRadius = isOpenPositionTradeLabel ? '2px' : '0';
              sideSpan.style.fontVariantNumeric = 'tabular-nums';
              valueSpan.style.backgroundColor = isOpenPositionTradeLabel
                ? (lastChartBackgroundColor || '#FFFFFF')
                : 'transparent';
              valueSpan.style.padding = isOpenPositionTradeLabel ? '0 2px' : '0';
              valueSpan.style.borderRadius = isOpenPositionTradeLabel ? '2px' : '0';
              valueSpan.style.fontVariantNumeric = 'tabular-nums';
              var tradeSpans = [sideSpan, separatorSpan, valueSpan];
              for (var tradeSpanIndex = 0; tradeSpanIndex < tradeSpans.length; tradeSpanIndex++) {
                tradeSpans[tradeSpanIndex].style.display = isOpenPositionTradeLabel ? 'block' : 'inline';
                tradeSpans[tradeSpanIndex].style.height = isOpenPositionTradeLabel ? '100%' : 'auto';
                tradeSpans[tradeSpanIndex].style.boxSizing = 'border-box';
              }
              sideSpan.style.flex = separatorSpan.style.flex = '0 0 auto';
              sideSpan.style.textAlign = isOpenPositionTradeLabel ? 'left' : 'inherit';
              valueSpan.style.flex = '0 1 auto';
              valueSpan.style.minWidth = '0';
              valueSpan.style.textAlign = isOpenPositionTradeLabel ? 'left' : 'inherit';
              valueSpan.style.overflow = isOpenPositionTradeLabel ? 'hidden' : 'visible';
              valueSpan.style.textOverflow = 'ellipsis';
            } else {
              if (label.childNodes.length !== 1 || label.firstChild.nodeType !== 3) {
                label.textContent = item.text;
              } else if (label.textContent !== item.text) {
                label.textContent = item.text;
              }
            }
            label.style.position = 'absolute';
            label.style.display = isOpenPositionTradeLabel && hasSplitTradeLabel ? 'flex' : 'block';
            label.style.alignItems = 'stretch';
            label.style.justifyContent = 'flex-start';
            if (isAnchoredTradeLabel) {
              applyAnchoredOverlayLabelLane(
                label,
                activeAnchoredLabelLane
              );
            } else {
              label.style.left = labelLeft + 'px';
              label.style.width = 'auto';
              label.style.maxWidth = labelMaxWidth + 'px';
              label.style.textAlign = 'left';
            }
            label.style.top = top + 'px';
            label.style.color = item.labelSideColor || item.color;
            label.style.fontSize = hasSplitTradeLabel ? '9px' : '12px';
            label.style.fontWeight = '700';
            label.style.height = OVERLAY_LABEL_LINE_HEIGHT + 'px';
            label.style.lineHeight = OVERLAY_LABEL_LINE_HEIGHT + 'px';
            label.style.whiteSpace = 'nowrap';
            label.style.overflow = 'hidden';
            label.style.textOverflow = 'ellipsis';
            label.style.textShadow = 'none';
            label.style.zIndex = isAnchoredTradeLabel ? '18' : '11';
            label.style.pointerEvents = 'none';
            if (isAnchoredTradeLabel) {
              // Clip labels of off-pane trades instead of deleting them; the
              // node stays keyed and reappears when the price scrolls back.
              label.style.visibility = item.paneVisible === false ? 'hidden' : 'visible';
            }
          };

          for (var labelIndex = 0; labelIndex < floatingLabels.length; labelIndex++) {
            var floatingItem = floatingLabels[labelIndex];
            var floatingTop = tops[labelIndex];
            renderLabel(floatingItem, floatingTop, 'label:float:' + (floatingItem.id || labelIndex));
          }

          for (var anchoredIndex = 0; anchoredIndex < anchoredLabels.length; anchoredIndex++) {
            var anchoredItem = anchoredLabels[anchoredIndex];
            var anchoredTop = anchoredTops[anchoredIndex];
            var lineKey = 'line:' + (anchoredItem.id || anchoredIndex);
            liveOverlayKeys.push(lineKey);
            renderAnchoredTradeLine(
              layer,
              anchoredItem,
              lineKey,
              isOpenPositionOverlayLine(anchoredItem)
                ? openPositionRowYById[anchoredItem.id]
                : anchoredItem.y
            );
            if (!isActiveSltpDragLine(anchoredItem)) {
              renderLabel(anchoredItem, anchoredTop, 'label:anchored:' + (anchoredItem.id || anchoredIndex));
            }
          }

          // MT5-parity: render OUTLINED right-axis price box for every
          // displayed position / pending order / SL / TP price level, including
          // direct Market Execution SL/TP drafts. Native
          // axis labels stay hidden; these DOM boxes carry the entry price on
          // the right scale. Every open position keeps its own box, including
          // ten trades at the same displayed price, and shares the exact raw
          // price row used by its label and horizontal connector line. Close
          // prices intentionally overlap until the user zooms the scale.
          var boxDecimals = (typeof lastDisplayDecimals === 'number' && isFinite(lastDisplayDecimals) && lastDisplayDecimals >= 0)
            ? Math.min(8, Math.max(0, Math.floor(lastDisplayDecimals)))
            : 2;
          var seenBoxLevels = Object.create(null);
          var openPositionBoxes = [];
          var positionBoxes = [];
          var positionBoxMetrics = resolveMarketPriceScaleAxisMetrics(layer);
          var POSITION_BOX_HEIGHT = OVERLAY_POSITION_BOX_HEIGHT;
          for (var pi = 0; pi < lines.length; pi++) {
            var pln = lines[pi];
            if (!shouldRenderRightAxisTradePriceBox(pln)) continue;
            if (isActiveSltpDragLine(pln)) continue;
            if (typeof pln.price !== 'number' || !isFinite(pln.price)) continue;
            if (typeof series.priceToCoordinate !== 'function') continue;
            var isOpenPositionBox = isOpenPositionOverlayLine(pln);
            var boxKey = Number(pln.price).toFixed(boxDecimals);
            if (!isOpenPositionBox && seenBoxLevels[boxKey]) continue;
            var ry = series.priceToCoordinate(pln.price);
            if (typeof ry !== 'number' || !isFinite(ry)) continue;
            if (!isOpenPositionBox) {
              seenBoxLevels[boxKey] = true;
            }
            var sharedRowY = isOpenPositionBox && typeof openPositionRowYById[pln.id] === 'number'
              ? openPositionRowYById[pln.id]
              : ry;
            var desiredBoxTop = Math.round(sharedRowY - POSITION_BOX_HEIGHT / 2);
            var positionBox = {
              y: ry,
              desiredTop: desiredBoxTop,
              top: desiredBoxTop,
              color: pln.color || '#2962FF',
              price: pln.price,
              text: boxKey,
              id: pln.id,
            };
            if (isOpenPositionBox) {
              openPositionBoxes.push(positionBox);
            } else {
              positionBoxes.push(positionBox);
            }
          }
          positionBoxes.sort(function(left, right) { return left.desiredTop - right.desiredTop; });
          var positionBoxStep = POSITION_BOX_HEIGHT + resolvePositionBoxGap(positionBoxes.length);
          for (var boxLayoutIndex = 0; boxLayoutIndex < positionBoxes.length; boxLayoutIndex++) {
            var nextBoxTop = positionBoxes[boxLayoutIndex].desiredTop;
            if (boxLayoutIndex > 0) {
              nextBoxTop = Math.max(nextBoxTop, positionBoxes[boxLayoutIndex - 1].top + positionBoxStep);
            }
            positionBoxes[boxLayoutIndex].top = nextBoxTop;
          }
          positionBoxes = openPositionBoxes.concat(positionBoxes);
          positionBoxes.sort(function(left, right) { return left.top - right.top; });
          for (var bi = 0; bi < positionBoxes.length; bi++) {
            var box = positionBoxes[bi];
            var boxNodeKey = 'box:' + (box.id || box.text);
            liveOverlayKeys.push(boxNodeKey);
            var boxEl = upsertOverlayDomNode(layer, boxNodeKey, 'rtx5-position-price-scale-box');
            if (!boxEl) continue;
            boxEl.textContent = box.text;
            boxEl.style.position = 'absolute';
            // MT5 keeps open trade price markers owned by the right price
            // scale, not floating beside it. Use the same measured axis strip
            // as the bid/ask badges so panning the chart cannot detach them.
            boxEl.style.left = (positionBoxMetrics ? positionBoxMetrics.axisLeft : Math.max(0, (layer.clientWidth || 0) - 72)) + 'px';
            boxEl.style.top = Math.round(box.top) + 'px';
            boxEl.style.width = (positionBoxMetrics ? positionBoxMetrics.axisWidth : Math.min(72, layer.clientWidth || 72)) + 'px';
            boxEl.style.background = '#FFFFFF';
            boxEl.style.color = box.color;
            boxEl.style.border = '1px solid ' + box.color;
            boxEl.style.borderRadius = '2px';
            boxEl.style.fontSize = '11px';
            boxEl.style.fontWeight = '700';
            boxEl.style.padding = '0 2px';
            boxEl.style.height = POSITION_BOX_HEIGHT + 'px';
            boxEl.style.lineHeight = POSITION_BOX_HEIGHT + 'px';
            boxEl.style.boxSizing = 'border-box';
            boxEl.style.textAlign = 'right';
            boxEl.style.whiteSpace = 'nowrap';
            boxEl.style.overflow = 'hidden';
            boxEl.style.pointerEvents = 'none';
            boxEl.style.fontVariantNumeric = 'tabular-nums';
            boxEl.style.fontFeatureSettings = '"tnum" 1, "lnum" 1';
            boxEl.style.zIndex = '16';
            // Same clip-don't-delete rule as the trade line itself: gate on
            // the RAW price coordinate so stacking offsets cannot smear an
            // off-pane trade's box back into the visible axis strip.
            boxEl.style.visibility = isTradeOverlayYInsidePane(box.y, tradeOverlayPaneBounds)
              ? 'visible'
              : 'hidden';
          }
          // Drop closed/stale trade nodes only — never blank the whole layer.
          pruneOverlayDomNodes(liveOverlayKeys);
        } catch (labelErr) {
          postError('refreshOverlayDomLabels', labelErr);
        }
      }

      // Native price-line geometry only. Label/P/L text lives in DOM and can
      // update every tick without tearing down the lines (avoids blink).
      function buildOverlayNativeLineSignature(payload) {
        var lines = payload && Array.isArray(payload.priceLines) ? payload.priceLines : [];
        var parts = [];
        for (var i = 0; i < lines.length; i++) {
          var ln = lines[i];
          if (!shouldCreateOverlayNativePriceLine(ln)) continue;
          parts.push([
            String(ln.id || ''),
            String(ln.price || ''),
            String(ln.color || ''),
            String(ln.lineWidth || 1),
            String(typeof ln.lineStyle === 'number' ? ln.lineStyle : 0),
            String(ln.labelPlacement || ''),
            String(ln.dragKey || ''),
          ].join(':'));
        }
        var markers = payload && Array.isArray(payload.markers) ? payload.markers : [];
        var markerParts = [];
        for (var m = 0; m < markers.length; m++) {
          var mk = markers[m] || {};
          markerParts.push([
            String(mk.id || ''),
            String(mk.time || ''),
            String(mk.price || ''),
            String(mk.position || ''),
            String(mk.color || ''),
            String(mk.shape || ''),
            String(mk.size || ''),
            String(mk.text || ''),
          ].join(':'));
        }
        var historySegments = payload && Array.isArray(payload.tradeHistorySegments)
          ? payload.tradeHistorySegments
          : [];
        var historyParts = [];
        for (var h = 0; h < historySegments.length; h++) {
          var segment = historySegments[h] || {};
          historyParts.push([
            String(segment.id || ''),
            String(segment.fromTime || ''),
            String(segment.fromPrice || ''),
            String(segment.toTime || ''),
            String(segment.toPrice || ''),
            String(segment.color || ''),
            String(segment.lineWidth || 1),
          ].join(':'));
        }
        return parts.join('|') + '##' + markerParts.join('|') + '##' + historyParts.join('|');
      }

      var _lastAppliedOverlayNativeSignature = '';

      function isChartOverlayWriteContextCurrent(dataContextSig) {
        var requestedDataContextSig =
          typeof dataContextSig === 'string' ? dataContextSig : '';
        // Internal same-document calls may omit a context. Native bridge writes
        // always provide one so a delayed B payload cannot decorate activated A.
        return !requestedDataContextSig || requestedDataContextSig === lastInitDataContextSig;
      }

      // Prefer label-only updates when native line geometry is unchanged.
      // Full nuke/recreate remains the path when lines are added/removed
      // (new trade, close, SL/TP change) so we never leave ghost lines.
      function applyOverlayPayload(payload) {
        try {
          if (!payload || typeof payload !== 'object') {
            payload = { priceLines: [], markers: [], tradeHistorySegments: [] };
          }
          if (!series) return;
          if (isHorizontalScrollMotionActive()) {
            _overlayPayload = payload;
            pendingHorizontalOverlayApply = true;
            deferHorizontalGestureDomWork();
            return;
          }
          if (verticalPricePanGestureActive) {
            _overlayPayload = payload;
            pendingVerticalOverlayApply = true;
            deferVerticalGestureDomWork();
            return;
          }

          var nextNativeSignature = buildOverlayNativeLineSignature(payload);
          var expectedMarkers = selectNativeOverlayMarkers(payload.markers);
          var markersAttachedToCurrentSeries = expectedMarkers.length === 0
            ? _overlayMarkers === null
            : Boolean(
                _overlayMarkers &&
                (
                  typeof _overlayMarkers.getSeries !== 'function' ||
                  _overlayMarkers.getSeries() === series
                )
              );
          var nativeGeometryUnchanged =
            nextNativeSignature === _lastAppliedOverlayNativeSignature &&
            _positionLinesArr.length === countOverlayNativePriceLines(payload.priceLines) &&
            markersAttachedToCurrentSeries;

          if (nativeGeometryUnchanged) {
            // Tick P/L label refresh only — keep horizontal candle scale stable.
            _appliedOverlayPayload = payload;
            refreshOverlayDomLabels(_appliedOverlayPayload);
            return;
          }

          // Step 1: Remove ALL existing price lines (clean slate)
          clearOverlayPriceLines();

          // Step 2: Create ALL price lines from scratch
          var lines = Array.isArray(payload.priceLines) ? payload.priceLines : [];
          var created = 0;
          for (var i = 0; i < lines.length; i++) {
            var ln = lines[i];
            if (!shouldCreateOverlayNativePriceLine(ln)) continue;
            try {
              var priceLine = series.createPriceLine({
                price: ln.price,
                color: ln.color || '#2962FF',
                lineWidth: ln.lineWidth || 1,
                lineStyle: typeof ln.lineStyle === 'number' ? ln.lineStyle : (LightweightCharts.LineStyle ? LightweightCharts.LineStyle.Solid : 0),
                lineVisible: ln.labelPlacement === 'line' ? false : true,
                axisLabelVisible: false,
                title: '',
              });
              _positionLinesArr.push(priceLine);
              if (typeof ln.dragKey === 'string' && ln.dragKey) {
                _overlayPriceLinesByDragKey[ln.dragKey] = {
                  api: priceLine,
                  line: ln,
                };
              }
              created++;
            } catch (lineErr) {
              postError('createPriceLine[' + ln.id + ']', lineErr);
            }
          }

          // Step 3: Handle markers (also nuke and recreate). The host sends an
          // empty marker list for Renko because its fractional brick times do
          // not match canonical candle-time trade/alert markers.
          clearOverlayMarkers();
          var markers = Array.isArray(payload.markers) ? payload.markers : [];
          var tradeHistorySegments = Array.isArray(payload.tradeHistorySegments)
            ? payload.tradeHistorySegments
            : [];
          if (lines.length === 0 && markers.length === 0 && tradeHistorySegments.length === 0) {
            postWebViewOverlayLog('emptyPayloadClearConfirmed: empty payload cleared stale price lines, markers, and trade history');
          }
          // Trade-history deal arrows render as thin DOM arrows with the
          // connectors (renderTradeHistorySegmentDom); only other markers use
          // the library's series markers.
          var nativeMarkers = selectNativeOverlayMarkers(markers);
          if (
            nativeMarkers.length > 0 &&
            typeof LightweightCharts !== 'undefined' &&
            typeof LightweightCharts.createSeriesMarkers === 'function'
          ) {
            try {
              _overlayMarkerSource = nativeMarkers.slice();
              var markerScale = resolveTradeHistoryMarkerScale();
              _overlayMarkers = LightweightCharts.createSeriesMarkers(
                series,
                scaleTradeHistoryMarkers(_overlayMarkerSource, markerScale)
              );
              _lastTradeHistoryMarkerScaleKey = markerScale.key;
            } catch (markerErr) {
              _overlayMarkers = null;
              _overlayMarkerSource = [];
              _lastTradeHistoryMarkerScaleKey = '';
              postError('createSeriesMarkers', markerErr);
            }
          }
          _appliedOverlayPayload = payload;
          _lastAppliedOverlayNativeSignature = nextNativeSignature;
          refreshOverlayDomLabels(_appliedOverlayPayload);
        } catch (e) {
          postError('applyOverlayPayload', e);
        }
      }

      function setChartOverlays(payload) {
        if (!isChartOverlayWriteContextCurrent(arguments[1])) {
          return false;
        }
        var nextOverlayPayload = payload && typeof payload === 'object'
          ? payload
          : { priceLines: [], markers: [], tradeHistorySegments: [] };
        postWebViewOverlayLog('setChartOverlays received', {
          priceLines: Array.isArray(nextOverlayPayload.priceLines) ? nextOverlayPayload.priceLines.length : 0,
          markers: Array.isArray(nextOverlayPayload.markers) ? nextOverlayPayload.markers.length : 0,
          tradeHistorySegments: Array.isArray(nextOverlayPayload.tradeHistorySegments)
            ? nextOverlayPayload.tradeHistorySegments.length
            : 0,
        });
        nextOverlayPayload = preserveActiveTradeLineDragPayload(nextOverlayPayload);
        _overlayPayload = nextOverlayPayload;
        if (isHorizontalScrollMotionActive()) {
          pendingHorizontalOverlayApply = true;
          deferHorizontalGestureDomWork();
          return;
        }
        if (verticalPricePanGestureActive) {
          pendingVerticalOverlayApply = true;
          deferVerticalGestureDomWork();
          return;
        }
        if (activeTradeLineDrag) {
          scheduleTradeLineDragDomRefresh();
          return;
        }
        // Apply trade/overlay lines without re-fitting the candle price scale.
        // Re-running scale recovery on every place-order refresh made the
        // horizontal chart blink and look like it was shrinking (iOS + Android).
        applyOverlayPayload(_overlayPayload);
        // Heal only if the axis collapsed; never force a full visible-range
        // recovery on routine trade-line updates.
        schedulePriceScaleHealthCheck('overlay_update', false, 1);
      }

      function patchOverlayTradeLabelPayload(payload, patchById) {
        if (!payload || typeof payload !== 'object') return payload;
        var lines = Array.isArray(payload.priceLines) ? payload.priceLines : [];
        var changed = false;
        var nextLines = new Array(lines.length);
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i];
          var patch = line && patchById[String(line.id || '')];
          if (!patch) {
            nextLines[i] = line;
            continue;
          }
          if (
            line.title === patch.title &&
            line.labelValueText === patch.labelValueText &&
            line.labelValueColor === patch.labelValueColor
          ) {
            nextLines[i] = line;
            continue;
          }
          var nextLine = {};
          for (var lineKey in line) {
            if (Object.prototype.hasOwnProperty.call(line, lineKey)) {
              nextLine[lineKey] = line[lineKey];
            }
          }
          nextLine.title = patch.title;
          nextLine.labelValueText = patch.labelValueText;
          nextLine.labelValueColor = patch.labelValueColor;
          nextLines[i] = nextLine;
          changed = true;
        }
        if (!changed) return payload;
        var nextPayload = {};
        for (var payloadKey in payload) {
          if (Object.prototype.hasOwnProperty.call(payload, payloadKey)) {
            nextPayload[payloadKey] = payload[payloadKey];
          }
        }
        nextPayload.priceLines = nextLines;
        return nextPayload;
      }

      // Tick-fast open-position P/L patch. This updates the value and outcome
      // colour of an existing split label plus both cached payloads. It never measures,
      // sorts, repositions, removes, or recreates any overlay geometry.
      function updateOverlayTradeLabelValues(patches) {
        try {
          if (!isChartOverlayWriteContextCurrent(arguments[1])) return false;
          if (!Array.isArray(patches) || patches.length === 0) return;
          var patchById = Object.create(null);
          for (var i = 0; i < patches.length; i++) {
            var patch = patches[i];
            if (!patch || typeof patch.id !== 'string' || !patch.id) continue;
            patchById[patch.id] = patch;
          }
          _overlayPayload = patchOverlayTradeLabelPayload(_overlayPayload, patchById);
          _appliedOverlayPayload = patchOverlayTradeLabelPayload(_appliedOverlayPayload, patchById);

          if (isHorizontalScrollMotionActive() || verticalPricePanGestureActive) {
            if (isHorizontalScrollMotionActive()) {
              visibleRangeIdlePendingAfterGesture = true;
            }
            return;
          }

          for (var id in patchById) {
            if (!Object.prototype.hasOwnProperty.call(patchById, id)) continue;
            var nextPatch = patchById[id];
            var label = _overlayDomNodesByKey['label:anchored:' + id];
            if (!label || label.childNodes.length !== 3) continue;
            var valueSpan = label.childNodes[2];
            if (!valueSpan || valueSpan.nodeName !== 'SPAN') continue;
            valueSpan.textContent = nextPatch.labelValueText;
            valueSpan.style.color = nextPatch.labelValueColor;
            var sideSpan = label.childNodes[0];
            var separatorSpan = label.childNodes[1];
            if (sideSpan && sideSpan.nodeName === 'SPAN') {
              sideSpan.style.color = nextPatch.labelValueColor;
            }
            if (separatorSpan && separatorSpan.nodeName === 'SPAN') {
              separatorSpan.style.color = nextPatch.labelValueColor;
            }
          }
        } catch (e) {
          postError('updateOverlayTradeLabelValues', e);
        }
      }

      // Fallback/full-label sync. Never recreates matching native price lines
      // or re-fits scale, but may re-run DOM layout for structural changes.
      function updateOverlayTradeLabels(payload) {
        try {
          if (!isChartOverlayWriteContextCurrent(arguments[1])) return false;
          var nextPayload = payload && typeof payload === 'object'
            ? payload
            : { priceLines: [], markers: [], tradeHistorySegments: [] };
          nextPayload = preserveActiveTradeLineDragPayload(nextPayload);
          _overlayPayload = nextPayload;
          if (activeTradeLineDrag) {
            scheduleTradeLineDragDomRefresh();
            return;
          }
          if (isHorizontalScrollMotionActive() || verticalPricePanGestureActive) {
            return;
          }
          // Prefer DOM text update only when geometry already matches.
          var nextNativeSignature = buildOverlayNativeLineSignature(nextPayload);
          if (
            nextNativeSignature === _lastAppliedOverlayNativeSignature &&
            _positionLinesArr.length === countOverlayNativePriceLines(nextPayload.priceLines)
          ) {
            _appliedOverlayPayload = nextPayload;
            refreshOverlayDomLabels(_appliedOverlayPayload);
            return;
          }
          // Geometry drifted (new trade race) — full apply once.
          applyOverlayPayload(nextPayload);
        } catch (e) {
          postError('updateOverlayTradeLabels', e);
        }
      }

      function setPriceLines(lines) {
        try {
          setChartOverlays({
            priceLines: Array.isArray(lines) ? lines : [],
            markers: Array.isArray(_overlayPayload.markers) ? _overlayPayload.markers : [],
            tradeHistorySegments: Array.isArray(_overlayPayload.tradeHistorySegments)
              ? _overlayPayload.tradeHistorySegments
              : [],
          });
        } catch (e) { postError('setPriceLines', e); }
      }

      function updatePositionLines() {
        if (activeTradeLineDrag) {
          return;
        }
        applyOverlayPayload(_overlayPayload);
      }

      // ── Self-healing overlay resync ──────────────────────────────
      // Every 4 seconds, re-apply the cached overlay payload. This
      // guarantees that even if a setChartOverlays call races with
      // initChart's requestAnimationFrame (series=null at call time),
      // the lines self-heal within a few seconds.
      function stopOverlayResync() {
        if (_overlayResyncTimer !== null) clearInterval(_overlayResyncTimer);
        _overlayResyncTimer = null;
      }

      function startOverlayResync() {
        if (!chartRuntimeActive || document.hidden || _overlayResyncTimer !== null) return;
        _overlayResyncTimer = setInterval(function() {
          // Stranded-gesture watchdog. A dropped pointerup/pointercancel
          // (Android WebView can tear down a touch stream mid-gesture) leaves
          // the gesture flags that defer overlay DOM work set forever. Every
          // overlay apply — quote ticks, the native 5s resync, Chart
          // Preferences toggles — then early-returns, freezing open-trade
          // markers at stale pixel positions until they drift out of the
          // viewport and never come back. If deferral state is still active
          // long after both touch input and range-change activity stopped,
          // force one settle pass so markers always recover.
          var overlayDeferralStranded =
            !lastPostedChartTouchActive &&
            !activeTradeLineDrag &&
            (
              activeHorizontalScrollGesture ||
              horizontalScrollMotionActive ||
              verticalPricePanGestureActive ||
              chartScaleGestureActive ||
              pendingHorizontalOverlayApply ||
              pendingVerticalOverlayApply ||
              verticalGestureDomWorkPending ||
              visibleRangeIdlePendingAfterGesture
            ) &&
            Date.now() - lastOverlayGestureDeferralActivityAt > OVERLAY_GESTURE_DEFERRAL_STALL_MS;
          if (overlayDeferralStranded) {
            activeHorizontalScrollGesture = false;
            horizontalScrollMotionActive = false;
            activeHorizontalScrollGestureUntil = 0;
            verticalPricePanGestureActive = false;
            chartScaleGestureActive = false;
            verticalGestureDomWorkPending = false;
            visibleRangeIdlePendingAfterGesture = false;
            applyDeferredHorizontalOverlayPayload();
            applyDeferredVerticalOverlayPayload();
            if (series) {
              refreshOverlayDomLabels(_appliedOverlayPayload || _overlayPayload);
            }
          }
          if (
            !activeTradeLineDrag &&
            series &&
            _overlayPayload &&
            _overlayPayload.priceLines &&
            _overlayPayload.priceLines.length > 0
          ) {
            // Only resync if the line count on canvas doesn't match the payload
            if (_positionLinesArr.length !== countOverlayNativePriceLines(_overlayPayload.priceLines)) {
              applyOverlayPayload(_overlayPayload);
              schedulePriceScaleHealthCheck('overlay_resync', true, 3);
              scheduleOverlayVisibleCandleScaleRecovery('overlay_resync');
            }
          }
        }, 4000);
      }
      function syncChartRuntimeTimers() {
        stopOverlayResync();
        stopCandleCountdownTicker();
        if (!chartRuntimeActive || document.hidden) return;
        startOverlayResync();
        scheduleNextCandleCountdownTick();
      }

      function setChartRuntimeActive(active) {
        var nextActive = active === true;
        if (chartRuntimeActive === nextActive) return;
        chartRuntimeActive = nextActive;
        syncChartRuntimeTimers();
      }
      document.addEventListener('visibilitychange', syncChartRuntimeTimers);

      window.initChart = initChart;
      window.setChartRuntimeActive = setChartRuntimeActive;
      window.applyChartVisualTheme = applyChartVisualTheme;
      window.__rtx5SetAreaDirectionOverride = setAreaDirectionOverride;
      window.refreshAreaSeriesDirection = refreshAreaSeriesDirection;
      window.updateChartData = updateChartData;
      window.activateCachedChartContext = activateCachedChartContext;
      window.updateTick = updateTick;
      window.updateLiveTick = updateLiveTick;
      window.setDisplayDecimals = setDisplayDecimals;
      window.setPeriodSeparators = setPeriodSeparators;
      window.setLivePriceLine = setLivePriceLine;
      window.setLivePriceLineForContext = setLivePriceLineForContext;
      window.setBidPriceLine = setBidPriceLine;
      window.setAskPriceLine = setAskPriceLine;
      window.setMarketPriceLines = setMarketPriceLines;
      window.setCandleCountdownTimeframe = setCandleCountdownTimeframe;
      window.setCandleCountdownActive = setCandleCountdownActive;
      window.setChartWindowSplitMode = setChartWindowSplitMode;
      window.setLastPriceLineVisible = setLastPriceLineVisible;
      window.setDrawingTool = setDrawingTool;
      window.clearDrawings = clearDrawings;
      window.undoDrawingAction = undoDrawingAction;
      window.redoDrawingAction = redoDrawingAction;
      window.setSerializedDrawings = setSerializedDrawings;
      window.publishSerializedDrawings = publishSerializedDrawings;
      window.applyDrawingTextEdit = applyDrawingTextEdit;
      window.cancelDrawingTextEdit = cancelDrawingTextEdit;
      window.setDrawingsLocked = setDrawingsLocked;
      window.setDrawingsHidden = setDrawingsHidden;
      window.setShowObjectDescriptions = setShowObjectDescriptions;
      window.setStayInDrawingMode = setStayInDrawingMode;
      window.setDrawingMagnetMode = setDrawingMagnetMode;
      window.setVerticalScrollingLocked = setVerticalScrollingLocked;
      window.setChartAutoScaleEnabled = setChartAutoScaleEnabled;
      window.zoomChart = zoomChart;
      window.setChartOverlays = setChartOverlays;
      window.updateOverlayTradeLabelValues = updateOverlayTradeLabelValues;
      window.updateOverlayTradeLabels = updateOverlayTradeLabels;
      window.setPriceLines = setPriceLines;
      window.updatePositionLines = updatePositionLines;
      window.resizeChartViewport = resizeChartViewport;
      window.recoverChartSurface = recoverChartSurface;

      postReady();
    </script>
</body>
</html>
`;
