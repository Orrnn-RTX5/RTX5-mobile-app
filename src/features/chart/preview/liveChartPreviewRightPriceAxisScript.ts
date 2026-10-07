import {
  CHART_PRICE_SCALE_LABEL_FONT_SIZE,
  CHART_PRICE_SCALE_LABEL_FONT_WEIGHT,
  CHART_PRICE_SCALE_LABEL_HEIGHT,
} from '../chartPriceScaleTypography';

/**
 * Draws the divided chart's visible right-axis labels with the exact typography
 * used by the full chart. Lightweight Charts exposes axis font size, but not
 * font weight, so a small owned DOM layer is required for real visual parity.
 *
 * The host keeps ownership of scaling gestures. This layer never receives
 * pointer events and is refreshed through one requestAnimationFrame per change.
 */
export const LIVE_CHART_PREVIEW_RIGHT_PRICE_AXIS_SCRIPT = String.raw`
      var PREVIEW_RIGHT_PRICE_AXIS_LABEL_HEIGHT = ${CHART_PRICE_SCALE_LABEL_HEIGHT};
      var PREVIEW_RIGHT_PRICE_AXIS_LABEL_FONT_SIZE = ${CHART_PRICE_SCALE_LABEL_FONT_SIZE};
      var PREVIEW_RIGHT_PRICE_AXIS_LABEL_FONT_WEIGHT = '${CHART_PRICE_SCALE_LABEL_FONT_WEIGHT}';
      var PREVIEW_RIGHT_PRICE_AXIS_TARGET_LABEL_GAP_PX = 30;
      var PREVIEW_RIGHT_PRICE_AXIS_MIN_LABELS = 7;
      var PREVIEW_RIGHT_PRICE_AXIS_MAX_LABELS = 30;
      var previewRightPriceAxisLayer = null;
      var previewRightPriceAxisBackground = null;
      var previewRightPriceAxisLabels = [];
      var previewRightPriceAxisRaf = 0;
      var previewRightPriceAxisDetach = null;

      function resolvePreviewRightPriceAxisColors() {
        var layout = null;
        try {
          var options = chart && typeof chart.options === 'function' ? chart.options() : null;
          layout = options && options.layout ? options.layout : null;
        } catch (_error) {}
        var background = layout && layout.background;
        var backgroundColor = background && typeof background.color === 'string'
          ? background.color
          : (typeof background === 'string' ? background : '#FFFFFF');
        var textColor = layout && typeof layout.textColor === 'string'
          ? layout.textColor
          : '#0F172A';
        return { background: backgroundColor, text: textColor };
      }

      function resolvePreviewRightPriceAxisPlotMetrics() {
        var hostMetrics = typeof resolvePreviewPriceScaleHostMetrics === 'function'
          ? resolvePreviewPriceScaleHostMetrics()
          : null;
        if (!hostMetrics || !(hostMetrics.width > 0) || !(hostMetrics.height > 0)) return null;
        var timeAxisHeight = 0;
        try {
          var timeScaleApi = chart && typeof chart.timeScale === 'function' ? chart.timeScale() : null;
          timeAxisHeight = timeScaleApi && typeof timeScaleApi.height === 'function'
            ? Number(timeScaleApi.height())
            : 0;
        } catch (_error) {
          timeAxisHeight = 0;
        }
        if (!isFinite(timeAxisHeight) || timeAxisHeight < 0 || timeAxisHeight >= hostMetrics.height) {
          timeAxisHeight = 0;
        }
        var plotHeight = Math.max(1, hostMetrics.height - timeAxisHeight);
        return {
          axisLeft: Math.max(0, hostMetrics.width - hostMetrics.axisWidth),
          axisWidth: hostMetrics.axisWidth,
          chartWidth: hostMetrics.width,
          plotTop: 0,
          plotHeight: plotHeight,
        };
      }

      function resolvePreviewRightPriceAxisRange(metrics) {
        if (!metrics || !series || typeof series.coordinateToPrice !== 'function') return null;
        try {
          var labelInset = PREVIEW_RIGHT_PRICE_AXIS_LABEL_HEIGHT / 2;
          var topPrice = series.coordinateToPrice(metrics.plotTop + labelInset);
          var bottomPrice = series.coordinateToPrice(
            metrics.plotTop + metrics.plotHeight - labelInset
          );
          var normalized = typeof normalizePreviewPriceScaleRange === 'function'
            ? normalizePreviewPriceScaleRange({ from: topPrice, to: bottomPrice })
            : null;
          if (normalized) return normalized;
        } catch (_error) {}
        try {
          var priceScaleApi = typeof getPreviewRightPriceScaleApi === 'function'
            ? getPreviewRightPriceScaleApi()
            : null;
          var visibleRange = priceScaleApi && typeof priceScaleApi.getVisibleRange === 'function'
            ? priceScaleApi.getVisibleRange()
            : null;
          return typeof normalizePreviewPriceScaleRange === 'function'
            ? normalizePreviewPriceScaleRange(visibleRange)
            : null;
        } catch (_error) {
          return null;
        }
      }

      function ensurePreviewRightPriceAxisLayer() {
        if (!chartHost) return null;
        if (previewRightPriceAxisLayer && previewRightPriceAxisLayer.parentNode === chartHost) {
          return previewRightPriceAxisLayer;
        }
        previewRightPriceAxisLayer = document.createElement('div');
        previewRightPriceAxisLayer.className = 'rtx5-preview-right-price-axis';
        previewRightPriceAxisLayer.setAttribute('aria-hidden', 'true');
        previewRightPriceAxisLayer.style.position = 'absolute';
        previewRightPriceAxisLayer.style.inset = '0px';
        previewRightPriceAxisLayer.style.pointerEvents = 'none';
        previewRightPriceAxisLayer.style.overflow = 'hidden';
        previewRightPriceAxisLayer.style.zIndex = '10';
        chartHost.appendChild(previewRightPriceAxisLayer);
        return previewRightPriceAxisLayer;
      }

      function clearPreviewRightPriceAxis() {
        if (previewRightPriceAxisRaf) {
          try { cancelAnimationFrame(previewRightPriceAxisRaf); } catch (_error) {}
          previewRightPriceAxisRaf = 0;
        }
        if (previewRightPriceAxisDetach) {
          try { previewRightPriceAxisDetach(); } catch (_error) {}
          previewRightPriceAxisDetach = null;
        }
        if (previewRightPriceAxisLayer && previewRightPriceAxisLayer.parentNode) {
          try { previewRightPriceAxisLayer.parentNode.removeChild(previewRightPriceAxisLayer); } catch (_error) {}
        }
        previewRightPriceAxisLayer = null;
        previewRightPriceAxisBackground = null;
        previewRightPriceAxisLabels = [];
      }

      function renderPreviewRightPriceAxis() {
        if (!window._fullChartParity || !chart || !series || !window._lastChartData || window._lastChartData.length === 0) {
          if (previewRightPriceAxisLayer) previewRightPriceAxisLayer.style.display = 'none';
          return false;
        }
        var metrics = resolvePreviewRightPriceAxisPlotMetrics();
        var range = resolvePreviewRightPriceAxisRange(metrics);
        if (!metrics || !range || !(range.to > range.from)) return false;
        var layer = ensurePreviewRightPriceAxisLayer();
        if (!layer) return false;
        var colors = resolvePreviewRightPriceAxisColors();
        var plotTop = metrics.plotTop;
        var plotBottom = plotTop + metrics.plotHeight;
        var labelTop = plotTop + PREVIEW_RIGHT_PRICE_AXIS_LABEL_HEIGHT / 2;
        var labelBottom = plotBottom - PREVIEW_RIGHT_PRICE_AXIS_LABEL_HEIGHT / 2;
        if (!(labelBottom > labelTop)) return false;
        var priceScaleApi = typeof getPreviewRightPriceScaleApi === 'function'
          ? getPreviewRightPriceScaleApi()
          : null;
        var priceScaleOptions = priceScaleApi && typeof priceScaleApi.options === 'function'
          ? priceScaleApi.options()
          : null;
        var invertScale = priceScaleOptions && priceScaleOptions.invertScale === true;
        var topPrice = invertScale ? range.from : range.to;
        var bottomPrice = invertScale ? range.to : range.from;
        var decimals = Number(window._previewDisplayDecimals);
        decimals = isFinite(decimals) ? Math.max(0, Math.min(8, Math.round(decimals))) : 2;
        var estimatedLabels = Math.floor(metrics.plotHeight / PREVIEW_RIGHT_PRICE_AXIS_TARGET_LABEL_GAP_PX) + 1;
        var labelCount = Math.max(
          PREVIEW_RIGHT_PRICE_AXIS_MIN_LABELS,
          Math.min(PREVIEW_RIGHT_PRICE_AXIS_MAX_LABELS, estimatedLabels)
        );
        var intervals = Math.max(1, labelCount - 1);

        layer.style.display = 'block';
        if (!previewRightPriceAxisBackground || previewRightPriceAxisBackground.parentNode !== layer) {
          previewRightPriceAxisBackground = document.createElement('div');
          previewRightPriceAxisBackground.className = 'rtx5-preview-right-price-axis-background';
          layer.insertBefore(previewRightPriceAxisBackground, layer.firstChild);
        }
        var background = previewRightPriceAxisBackground;
        background.style.position = 'absolute';
        background.style.left = Math.round(metrics.axisLeft) + 'px';
        background.style.top = Math.round(plotTop) + 'px';
        background.style.width = Math.round(metrics.axisWidth) + 'px';
        background.style.height = Math.round(metrics.plotHeight) + 'px';
        background.style.background = colors.background;
        background.style.pointerEvents = 'none';

        for (var index = 0; index < labelCount; index += 1) {
          var label = previewRightPriceAxisLabels[index];
          if (!label || label.parentNode !== layer) {
            label = document.createElement('div');
            label.className = 'rtx5-preview-right-price-axis-label';
            label.setAttribute('data-rtx5-role', 'right-price-scale-label');
            previewRightPriceAxisLabels[index] = label;
            layer.appendChild(label);
          }
          var ratio = index / intervals;
          var price = topPrice + (bottomPrice - topPrice) * ratio;
          var y = labelTop + (labelBottom - labelTop) * ratio;
          label.textContent = Number(price).toFixed(decimals);
          label.style.position = 'absolute';
          label.style.boxSizing = 'border-box';
          label.style.left = Math.round(metrics.axisLeft + 3) + 'px';
          label.style.top = Math.round(y - PREVIEW_RIGHT_PRICE_AXIS_LABEL_HEIGHT / 2) + 'px';
          label.style.width = Math.max(0, Math.round(metrics.axisWidth - 4)) + 'px';
          label.style.height = PREVIEW_RIGHT_PRICE_AXIS_LABEL_HEIGHT + 'px';
          label.style.padding = '0 6px 0 2px';
          label.style.overflow = 'hidden';
          label.style.whiteSpace = 'nowrap';
          label.style.color = colors.text;
          label.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif";
          label.style.fontSize = PREVIEW_RIGHT_PRICE_AXIS_LABEL_FONT_SIZE + 'px';
          label.style.fontWeight = PREVIEW_RIGHT_PRICE_AXIS_LABEL_FONT_WEIGHT;
          label.style.lineHeight = PREVIEW_RIGHT_PRICE_AXIS_LABEL_HEIGHT + 'px';
          label.style.textAlign = 'right';
          label.style.fontVariantNumeric = 'tabular-nums';
          label.style.fontFeatureSettings = '"tnum" 1, "lnum" 1';
          label.style.letterSpacing = '0px';
          label.style.textShadow = 'none';
          label.style.pointerEvents = 'none';
          label.style.display = 'block';
        }
        for (var hiddenIndex = labelCount; hiddenIndex < previewRightPriceAxisLabels.length; hiddenIndex += 1) {
          if (previewRightPriceAxisLabels[hiddenIndex]) {
            previewRightPriceAxisLabels[hiddenIndex].style.display = 'none';
          }
        }
        return true;
      }

      function schedulePreviewRightPriceAxisRefresh() {
        if (!window._fullChartParity || previewRightPriceAxisRaf) return;
        previewRightPriceAxisRaf = requestAnimationFrame(function() {
          previewRightPriceAxisRaf = 0;
          renderPreviewRightPriceAxis();
        });
      }

      function installPreviewRightPriceAxis() {
        clearPreviewRightPriceAxis();
        if (!window._fullChartParity || !chartHost || !chart) return;
        var refresh = function() { schedulePreviewRightPriceAxisRefresh(); };
        chartHost.addEventListener('pointermove', refresh, true);
        chartHost.addEventListener('pointerup', refresh, true);
        chartHost.addEventListener('pointercancel', refresh, true);
        chartHost.addEventListener('touchmove', refresh, { capture: true, passive: true });
        chartHost.addEventListener('touchend', refresh, { capture: true, passive: true });
        chartHost.addEventListener('wheel', refresh, { capture: true, passive: true });
        var timeScaleApi = null;
        try {
          timeScaleApi = typeof chart.timeScale === 'function' ? chart.timeScale() : null;
          if (timeScaleApi && typeof timeScaleApi.subscribeVisibleLogicalRangeChange === 'function') {
            timeScaleApi.subscribeVisibleLogicalRangeChange(refresh);
          }
        } catch (_error) {}
        previewRightPriceAxisDetach = function() {
          chartHost.removeEventListener('pointermove', refresh, true);
          chartHost.removeEventListener('pointerup', refresh, true);
          chartHost.removeEventListener('pointercancel', refresh, true);
          chartHost.removeEventListener('touchmove', refresh, true);
          chartHost.removeEventListener('touchend', refresh, true);
          chartHost.removeEventListener('wheel', refresh, true);
          try {
            if (timeScaleApi && typeof timeScaleApi.unsubscribeVisibleLogicalRangeChange === 'function') {
              timeScaleApi.unsubscribeVisibleLogicalRangeChange(refresh);
            }
          } catch (_error) {}
        };
        schedulePreviewRightPriceAxisRefresh();
      }

      window.installPreviewRightPriceAxis = installPreviewRightPriceAxis;
      window.clearPreviewRightPriceAxis = clearPreviewRightPriceAxis;
      window.renderPreviewRightPriceAxis = renderPreviewRightPriceAxis;
      window.schedulePreviewRightPriceAxisRefresh = schedulePreviewRightPriceAxisRefresh;
`;
