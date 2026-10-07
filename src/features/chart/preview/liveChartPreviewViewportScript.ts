import {
  CHART_AREA_TIME_SCALE_MIN_BAR_SPACING,
  CHART_AREA_VISIBLE_BAR_MAX,
  CHART_AREA_VISIBLE_BAR_MIN,
  CHART_AREA_VISIBLE_BAR_TARGET_PX,
  CHART_DEFAULT_RESET_BAR_SPACING_MAX,
  CHART_DEFAULT_RESET_BAR_SPACING_MIN,
  CHART_DEFAULT_TIME_SCALE_BAR_SPACING,
  CHART_DEFAULT_TIME_SCALE_MIN_BAR_SPACING,
  CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET,
  CHART_DEFAULT_VISIBLE_BAR_MAX,
  CHART_DEFAULT_VISIBLE_BAR_MIN,
  CHART_DEFAULT_VISIBLE_BAR_TARGET_PX,
  CHART_TIME_SCALE_FIX_LEFT_EDGE,
  CHART_TIME_SCALE_FIX_RIGHT_EDGE,
} from '../ChartScreen.constants';

export type LiveChartPreviewRecentViewport = Readonly<{
  barSpacing: number;
  from: number;
  rightEdge: number;
  to: number;
  visibleBars: number;
}>;

export function resolveLiveChartPreviewRecentViewport(input: Readonly<{
  areaVisibleBarTarget?: number;
  chartType?: string;
  dataLength: number;
  viewportWidth: number;
}>): LiveChartPreviewRecentViewport | null {
  const dataLength = Number.isFinite(input.dataLength)
    ? Math.max(0, Math.round(input.dataLength))
    : 0;
  if (dataLength <= 0) return null;

  const viewportWidth = Number.isFinite(input.viewportWidth)
    ? Math.max(0, input.viewportWidth)
    : 0;
  const requestedAreaVisibleBars = Number.isFinite(input.areaVisibleBarTarget)
    ? Math.round(input.areaVisibleBarTarget as number)
    : CHART_AREA_VISIBLE_BAR_MAX;
  const visibleBarMax = input.chartType === 'area'
    ? Math.min(
      CHART_AREA_VISIBLE_BAR_MAX,
      Math.max(CHART_AREA_VISIBLE_BAR_MIN, requestedAreaVisibleBars),
    )
    : CHART_DEFAULT_VISIBLE_BAR_MAX;
  const visibleBarMin = input.chartType === 'area'
    ? CHART_AREA_VISIBLE_BAR_MIN
    : CHART_DEFAULT_VISIBLE_BAR_MIN;
  const visibleBarTargetPx = input.chartType === 'area'
    ? CHART_AREA_VISIBLE_BAR_TARGET_PX
    : CHART_DEFAULT_VISIBLE_BAR_TARGET_PX;
  const visibleBars = viewportWidth > 0
    ? Math.min(
      dataLength,
      Math.max(
        visibleBarMin,
        Math.min(
          visibleBarMax,
          Math.round(
            Math.max(
              viewportWidth - 28,
              visibleBarTargetPx,
            ) / visibleBarTargetPx,
          ),
        ),
      ),
    )
    : Math.min(dataLength, visibleBarMax);
  const usableWidth = viewportWidth > 0
    ? Math.max(
      viewportWidth - 28,
      input.chartType === 'area' ? CHART_AREA_VISIBLE_BAR_TARGET_PX : visibleBars,
    )
    : 0;
  const barSpacing = usableWidth > 0 && visibleBars > 0
    ? Math.min(
      CHART_DEFAULT_RESET_BAR_SPACING_MAX,
      Math.max(
        input.chartType === 'area'
          ? CHART_AREA_TIME_SCALE_MIN_BAR_SPACING
          : CHART_DEFAULT_RESET_BAR_SPACING_MIN,
        usableWidth / visibleBars,
      ),
    )
    : CHART_DEFAULT_TIME_SCALE_BAR_SPACING;
  const rightEdge = Math.max(0.5, dataLength - 0.5)
    + CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET;

  return Object.freeze({
    barSpacing,
    from: Math.max(-0.5, rightEdge - visibleBars),
    rightEdge,
    to: rightEdge,
    visibleBars,
  });
}

/**
 * The auxiliary window keeps its own Lightweight Charts instance, but its
 * initial/live-edge time viewport must follow the same contract as the full
 * ChartScreen engine. Keeping this bridge isolated avoids growing the already
 * large ChartScreen WebView source.
 */
export const LIVE_CHART_PREVIEW_VIEWPORT_SCRIPT = `
var previewViewportBoundChart = null;
var previewLiveEdgeClampActive = false;
window._areaVisibleBarTarget = ${CHART_AREA_VISIBLE_BAR_MAX};

function getPreviewChartViewportWidth() {
  try {
    if (chartHost && typeof chartHost.clientWidth === 'number' && chartHost.clientWidth > 0) {
      return chartHost.clientWidth;
    }
  } catch (_error) {}
  return typeof window.innerWidth === 'number' && isFinite(window.innerWidth)
    ? window.innerWidth
    : 0;
}

function getPreviewRecentVisibleBars(length) {
  if (typeof length !== 'number' || !isFinite(length) || length <= 0) return 0;
  var isAreaSeries = window._chartType === 'area';
  var visibleBarMax = isAreaSeries
    ? Math.min(
        ${CHART_AREA_VISIBLE_BAR_MAX},
        Math.max(
          ${CHART_AREA_VISIBLE_BAR_MIN},
          Math.round(window._areaVisibleBarTarget || ${CHART_AREA_VISIBLE_BAR_MAX})
        )
      )
    : ${CHART_DEFAULT_VISIBLE_BAR_MAX};
  var visibleBarTargetPx = isAreaSeries
    ? ${CHART_AREA_VISIBLE_BAR_TARGET_PX}
    : ${CHART_DEFAULT_VISIBLE_BAR_TARGET_PX};
  var visibleBarMin = isAreaSeries
    ? ${CHART_AREA_VISIBLE_BAR_MIN}
    : ${CHART_DEFAULT_VISIBLE_BAR_MIN};
  var viewportWidth = getPreviewChartViewportWidth();
  if (!(viewportWidth > 0)) {
    return Math.min(Math.round(length), visibleBarMax);
  }
  var usableWidth = Math.max(
    viewportWidth - 28,
    visibleBarTargetPx
  );
  var targetVisibleBars = Math.round(
    usableWidth / visibleBarTargetPx
  );
  return Math.min(
    Math.round(length),
    Math.max(
      visibleBarMin,
      Math.min(visibleBarMax, targetVisibleBars)
    )
  );
}

function resolvePreviewDefaultBarSpacing(lengthOverride) {
  var visibleBars = getPreviewRecentVisibleBars(lengthOverride);
  var viewportWidth = getPreviewChartViewportWidth();
  if (!(viewportWidth > 0) || !(visibleBars > 0)) {
    return ${CHART_DEFAULT_TIME_SCALE_BAR_SPACING};
  }
  var usableWidth = Math.max(
    viewportWidth - 28,
    window._chartType === 'area' ? ${CHART_AREA_VISIBLE_BAR_TARGET_PX} : visibleBars
  );
  var minimumBarSpacing = window._chartType === 'area'
    ? ${CHART_AREA_TIME_SCALE_MIN_BAR_SPACING}
    : ${CHART_DEFAULT_RESET_BAR_SPACING_MIN};
  return Math.min(
    ${CHART_DEFAULT_RESET_BAR_SPACING_MAX},
    Math.max(
      minimumBarSpacing,
      usableWidth / visibleBars
    )
  );
}

function getPreviewBoundedLiveRightEdge(lengthOverride) {
  var dataLength =
    typeof lengthOverride === 'number' && isFinite(lengthOverride) && lengthOverride > 0
      ? Math.round(lengthOverride)
      : (Array.isArray(window._lastChartData) ? window._lastChartData.length : 0);
  if (!(dataLength > 0)) return null;
  return Math.max(0.5, dataLength - 0.5) + ${CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET};
}

function applyPreviewRecentViewport(lengthOverride) {
  try {
    if (!chart || !chart.timeScale) return false;
    var dataLength =
      typeof lengthOverride === 'number' && isFinite(lengthOverride) && lengthOverride > 0
        ? Math.round(lengthOverride)
        : (Array.isArray(window._lastChartData) ? window._lastChartData.length : 0);
    if (!(dataLength > 0)) return false;
    var timeScale = chart.timeScale();
    if (typeof timeScale.applyOptions === 'function') {
      timeScale.applyOptions({
        rightOffset: ${CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET},
        barSpacing: resolvePreviewDefaultBarSpacing(dataLength),
        minBarSpacing: window._chartType === 'area'
          ? ${CHART_AREA_TIME_SCALE_MIN_BAR_SPACING}
          : ${CHART_DEFAULT_TIME_SCALE_MIN_BAR_SPACING},
        fixLeftEdge: ${CHART_TIME_SCALE_FIX_LEFT_EDGE},
        fixRightEdge: ${CHART_TIME_SCALE_FIX_RIGHT_EDGE}
      });
    }
    if (typeof timeScale.setVisibleLogicalRange === 'function') {
      var visibleBars = getPreviewRecentVisibleBars(dataLength);
      var rightEdge = getPreviewBoundedLiveRightEdge(dataLength);
      if (rightEdge === null) return false;
      timeScale.setVisibleLogicalRange({
        from: Math.max(-0.5, rightEdge - visibleBars),
        to: rightEdge
      });
      return true;
    }
    if (typeof timeScale.fitContent === 'function') {
      timeScale.fitContent();
      if (typeof timeScale.scrollToRealTime === 'function') {
        timeScale.scrollToRealTime();
      }
      return true;
    }
  } catch (_error) {}
  return false;
}

function clampPreviewVisibleLogicalRangeToLiveEdge(range) {
  try {
    if (previewLiveEdgeClampActive || !chart || !chart.timeScale) return false;
    if (
      !range ||
      typeof range.from !== 'number' ||
      !isFinite(range.from) ||
      typeof range.to !== 'number' ||
      !isFinite(range.to)
    ) {
      return false;
    }
    var rightEdge = getPreviewBoundedLiveRightEdge();
    if (rightEdge === null || range.to <= rightEdge + 0.001) return false;
    var span = Math.max(1, range.to - range.from);
    previewLiveEdgeClampActive = true;
    chart.timeScale().setVisibleLogicalRange({
      from: rightEdge - span,
      to: rightEdge
    });
    setTimeout(function() { previewLiveEdgeClampActive = false; }, 0);
    return true;
  } catch (_error) {
    previewLiveEdgeClampActive = false;
    return false;
  }
}

function getPreviewVisibleLogicalRangeSnapshot() {
  try {
    if (!chart || !chart.timeScale) return null;
    var timeScale = chart.timeScale();
    if (typeof timeScale.getVisibleLogicalRange !== 'function') return null;
    var range = timeScale.getVisibleLogicalRange();
    if (
      !range ||
      typeof range.from !== 'number' ||
      !isFinite(range.from) ||
      typeof range.to !== 'number' ||
      !isFinite(range.to)
    ) {
      return null;
    }
    return { from: range.from, to: range.to };
  } catch (_error) {}
  return null;
}

function shouldExpandPreviewAreaAfterPrepend(previousData, nextData, previousRange) {
  try {
    if (
      window._chartType !== 'area' ||
      !previousRange ||
      !Array.isArray(previousData) ||
      !Array.isArray(nextData) ||
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
      !(nextFirst < previousFirst)
    ) {
      return false;
    }

    var previousRightEdge = getPreviewBoundedLiveRightEdge(previousData.length);
    if (previousRightEdge === null || previousRange.to < previousRightEdge - 1.25) {
      return false;
    }
    var previousDefaultVisibleBars = getPreviewRecentVisibleBars(previousData.length);
    var nextDefaultVisibleBars = getPreviewRecentVisibleBars(nextData.length);
    var previousSpan = previousRange.to - previousRange.from;
    var tolerance = Math.max(2, previousDefaultVisibleBars * 0.03);
    return (
      nextDefaultVisibleBars > previousDefaultVisibleBars &&
      Math.abs(previousSpan - previousDefaultVisibleBars) <= tolerance
    );
  } catch (_error) {}
  return false;
}

function restorePreviewPrependedHistoryViewport(previousData, nextData, previousRange) {
  try {
    if (
      !chart ||
      !chart.timeScale ||
      !previousRange ||
      !Array.isArray(previousData) ||
      !Array.isArray(nextData) ||
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
      !(nextFirst < previousFirst)
    ) {
      return false;
    }
    var shiftedBy = -1;
    for (var index = 0; index < nextData.length; index += 1) {
      if (nextData[index] && nextData[index].time === previousFirst) {
        shiftedBy = index;
        break;
      }
    }
    if (!(shiftedBy > 0) || typeof chart.timeScale().setVisibleLogicalRange !== 'function') {
      return false;
    }
    chart.timeScale().setVisibleLogicalRange({
      from: previousRange.from + shiftedBy,
      to: previousRange.to + shiftedBy
    });
    return true;
  } catch (_error) {}
  return false;
}

function bindPreviewVisibleLogicalRangeClamp() {
  try {
    if (!chart || previewViewportBoundChart === chart || !chart.timeScale) return;
    var timeScale = chart.timeScale();
    if (typeof timeScale.subscribeVisibleLogicalRangeChange !== 'function') return;
    previewViewportBoundChart = chart;
    timeScale.subscribeVisibleLogicalRangeChange(function(range) {
      clampPreviewVisibleLogicalRangeToLiveEdge(range);
    });
  } catch (_error) {}
}

function resetPreviewViewportBridgeState() {
  previewViewportBoundChart = null;
  previewLiveEdgeClampActive = false;
  window._areaVisibleBarTarget = ${CHART_AREA_VISIBLE_BAR_MAX};
}
`;
