import {
  CHART_AXIS_DIVIDER_DARK_COLOR,
  CHART_AXIS_DIVIDER_LIGHT_COLOR,
  CHART_AXIS_DIVIDER_STROKE_WIDTH,
} from '../ChartScreen.constants';

/**
 * Recreates the full chart's owned three-line axis frame in divided panes.
 * Lightweight Charts' native borders stay disabled in full-parity mode because
 * they cannot draw the top boundary and do not match the retained chart.
 */
export const LIVE_CHART_PREVIEW_AXIS_DIVIDER_SCRIPT = String.raw`
      var PREVIEW_AXIS_DIVIDER_STROKE_WIDTH = ${CHART_AXIS_DIVIDER_STROKE_WIDTH};
      var PREVIEW_AXIS_DIVIDER_DARK_COLOR = '${CHART_AXIS_DIVIDER_DARK_COLOR}';
      var PREVIEW_AXIS_DIVIDER_LIGHT_COLOR = '${CHART_AXIS_DIVIDER_LIGHT_COLOR}';
      var previewAxisDividerLayer = null;
      var previewAxisDividerTop = null;
      var previewAxisDividerRight = null;
      var previewAxisDividerBottom = null;
      var previewAxisDividerRaf = 0;
      var previewAxisDividerDetach = null;

      function resolvePreviewAxisDividerColor() {
        var color = window._customColors && window._customColors.axisDivider;
        if (typeof color === 'string' && color.length > 0) return color;
        return window._previewIsDark
          ? PREVIEW_AXIS_DIVIDER_DARK_COLOR
          : PREVIEW_AXIS_DIVIDER_LIGHT_COLOR;
      }

      function createPreviewAxisDividerLine(className) {
        var line = document.createElement('div');
        line.className = className;
        line.setAttribute('aria-hidden', 'true');
        line.style.position = 'absolute';
        line.style.pointerEvents = 'none';
        return line;
      }

      function ensurePreviewAxisDividerLayer() {
        if (!chartHost) return null;
        if (previewAxisDividerLayer && previewAxisDividerLayer.parentNode === chartHost) {
          return previewAxisDividerLayer;
        }

        previewAxisDividerLayer = document.createElement('div');
        previewAxisDividerLayer.className = 'rtx5-preview-axis-dividers';
        previewAxisDividerLayer.setAttribute('aria-hidden', 'true');
        previewAxisDividerLayer.style.position = 'absolute';
        previewAxisDividerLayer.style.inset = '0px';
        previewAxisDividerLayer.style.pointerEvents = 'none';
        previewAxisDividerLayer.style.overflow = 'hidden';
        previewAxisDividerLayer.style.zIndex = '11';

        previewAxisDividerTop = createPreviewAxisDividerLine(
          'rtx5-preview-axis-divider-top'
        );
        previewAxisDividerRight = createPreviewAxisDividerLine(
          'rtx5-preview-axis-divider-right'
        );
        previewAxisDividerBottom = createPreviewAxisDividerLine(
          'rtx5-preview-axis-divider-bottom'
        );
        previewAxisDividerLayer.appendChild(previewAxisDividerTop);
        previewAxisDividerLayer.appendChild(previewAxisDividerRight);
        previewAxisDividerLayer.appendChild(previewAxisDividerBottom);
        chartHost.appendChild(previewAxisDividerLayer);
        return previewAxisDividerLayer;
      }

      function clearPreviewAxisDividers() {
        if (previewAxisDividerRaf) {
          try { cancelAnimationFrame(previewAxisDividerRaf); } catch (_error) {}
          previewAxisDividerRaf = 0;
        }
        if (previewAxisDividerDetach) {
          try { previewAxisDividerDetach(); } catch (_error) {}
          previewAxisDividerDetach = null;
        }
        if (previewAxisDividerLayer && previewAxisDividerLayer.parentNode) {
          try {
            previewAxisDividerLayer.parentNode.removeChild(previewAxisDividerLayer);
          } catch (_error) {}
        }
        previewAxisDividerLayer = null;
        previewAxisDividerTop = null;
        previewAxisDividerRight = null;
        previewAxisDividerBottom = null;
      }

      function applyPreviewAxisDividerLineStyle(line, left, top, width, height, color) {
        if (!line) return;
        line.style.left = Math.round(left) + 'px';
        line.style.top = Math.round(top) + 'px';
        line.style.width = Math.max(0, Math.round(width)) + 'px';
        line.style.height = Math.max(0, Math.round(height)) + 'px';
        line.style.backgroundColor = color;
      }

      function renderPreviewAxisDividers() {
        if (!window._fullChartParity || !chart || !chartHost) {
          if (previewAxisDividerLayer) previewAxisDividerLayer.style.display = 'none';
          return false;
        }
        var metrics = typeof resolvePreviewRightPriceAxisPlotMetrics === 'function'
          ? resolvePreviewRightPriceAxisPlotMetrics()
          : null;
        if (!metrics || !(metrics.axisLeft > 0) || !(metrics.plotHeight > 0)) {
          return false;
        }
        var layer = ensurePreviewAxisDividerLayer();
        if (!layer) return false;

        var plotLeft = 0;
        var paneRight = Math.round(metrics.axisLeft);
        var paneBottom = Math.round(
          (Number(metrics.plotTop) || 0) + Number(metrics.plotHeight)
        );
        var dividerInset = Math.max(1, PREVIEW_AXIS_DIVIDER_STROKE_WIDTH);
        var topDividerY = (Number(metrics.plotTop) || 0) + dividerInset;
        var bottomDividerY = Math.max(topDividerY, paneBottom - dividerInset);
        var color = resolvePreviewAxisDividerColor();

        layer.style.display = 'block';
        applyPreviewAxisDividerLineStyle(
          previewAxisDividerTop,
          plotLeft,
          topDividerY,
          paneRight - plotLeft,
          PREVIEW_AXIS_DIVIDER_STROKE_WIDTH,
          color
        );
        applyPreviewAxisDividerLineStyle(
          previewAxisDividerRight,
          paneRight,
          topDividerY,
          PREVIEW_AXIS_DIVIDER_STROKE_WIDTH,
          bottomDividerY - topDividerY,
          color
        );
        applyPreviewAxisDividerLineStyle(
          previewAxisDividerBottom,
          plotLeft,
          bottomDividerY,
          paneRight - plotLeft,
          PREVIEW_AXIS_DIVIDER_STROKE_WIDTH,
          color
        );
        return true;
      }

      function schedulePreviewAxisDividersRefresh() {
        if (!window._fullChartParity || previewAxisDividerRaf) return;
        previewAxisDividerRaf = requestAnimationFrame(function() {
          previewAxisDividerRaf = 0;
          renderPreviewAxisDividers();
        });
      }

      function installPreviewAxisDividers() {
        clearPreviewAxisDividers();
        if (!window._fullChartParity || !chartHost || !chart) return;
        var refresh = function() { schedulePreviewAxisDividersRefresh(); };
        chartHost.addEventListener('pointermove', refresh, true);
        chartHost.addEventListener('pointerup', refresh, true);
        chartHost.addEventListener('pointercancel', refresh, true);
        chartHost.addEventListener('touchmove', refresh, { capture: true, passive: true });
        chartHost.addEventListener('touchend', refresh, { capture: true, passive: true });
        chartHost.addEventListener('wheel', refresh, { capture: true, passive: true });
        var timeScaleApi = null;
        try {
          timeScaleApi = typeof chart.timeScale === 'function' ? chart.timeScale() : null;
          if (
            timeScaleApi &&
            typeof timeScaleApi.subscribeVisibleLogicalRangeChange === 'function'
          ) {
            timeScaleApi.subscribeVisibleLogicalRangeChange(refresh);
          }
        } catch (_error) {}
        previewAxisDividerDetach = function() {
          chartHost.removeEventListener('pointermove', refresh, true);
          chartHost.removeEventListener('pointerup', refresh, true);
          chartHost.removeEventListener('pointercancel', refresh, true);
          chartHost.removeEventListener('touchmove', refresh, true);
          chartHost.removeEventListener('touchend', refresh, true);
          chartHost.removeEventListener('wheel', refresh, true);
          try {
            if (
              timeScaleApi &&
              typeof timeScaleApi.unsubscribeVisibleLogicalRangeChange === 'function'
            ) {
              timeScaleApi.unsubscribeVisibleLogicalRangeChange(refresh);
            }
          } catch (_error) {}
        };
        schedulePreviewAxisDividersRefresh();
      }

      window.installPreviewAxisDividers = installPreviewAxisDividers;
      window.clearPreviewAxisDividers = clearPreviewAxisDividers;
      window.renderPreviewAxisDividers = renderPreviewAxisDividers;
      window.schedulePreviewAxisDividersRefresh = schedulePreviewAxisDividersRefresh;
`;
