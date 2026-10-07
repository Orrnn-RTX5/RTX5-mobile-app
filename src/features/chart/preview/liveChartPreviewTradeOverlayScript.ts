/**
 * Autoscale-safe trade overlays for divided panes.
 *
 * Lightweight Charts price lines participate in autoscale and expose only one
 * plain axis title. Persisted trades therefore use a keyed DOM layer, matching
 * the retained chart's split side/P&L label and outlined right-axis price box.
 */
export const LIVE_CHART_PREVIEW_TRADE_OVERLAY_SCRIPT = String.raw`
      var previewTradeOverlayLines = [];
      var previewTradeOverlayLayer = null;
      var previewTradeOverlayNodesByKey = Object.create(null);
      var previewTradeOverlayRaf = 0;
      var previewTradeOverlayDetach = null;
      var PREVIEW_TRADE_LABEL_HEIGHT = 13;
      var PREVIEW_TRADE_LABEL_GAP = 2;
      var PREVIEW_TRADE_PRICE_BOX_HEIGHT = 20;
      var PREVIEW_OPEN_POSITION_LABEL_LANE_WIDTH = 164;
      var PREVIEW_OPEN_POSITION_LABEL_LEFT = 8;
      var PREVIEW_OPEN_POSITION_LABEL_MAX_LEFT = 56;
      var PREVIEW_OPEN_POSITION_LABEL_LEFT_RATIO = 0.12;

      function isPreviewTradeOverlayLine(line) {
        if (!line || typeof line.price !== 'number' || !isFinite(line.price) || line.price <= 0) {
          return false;
        }
        return line.labelPlacement === 'line' || (
          typeof line.id === 'string' &&
          /^(open-|order-entry-|order-stop-limit-|order-sl-|order-tp-|sl-|tp-|chart-trade-)/.test(line.id)
        );
      }

      function isPreviewOpenPositionLine(line) {
        return !!(line && typeof line.id === 'string' && line.id.indexOf('open-') === 0);
      }

      function shouldRenderPreviewTradePriceBox(line) {
        if (!line || typeof line.id !== 'string') return false;
        return /^(open-|order-entry-|order-stop-limit-|order-sl-|order-tp-|sl-|tp-)/.test(line.id) ||
          line.id === 'chart-trade-sl-preview' ||
          line.id === 'chart-trade-tp-preview';
      }

      function resolvePreviewOpenPositionLabelLane(axisLeft) {
        var paneWidth = Math.max(0, Math.round(Number(axisLeft) || 0));
        var laneWidth = Math.min(
          PREVIEW_OPEN_POSITION_LABEL_LANE_WIDTH,
          Math.max(0, paneWidth - PREVIEW_OPEN_POSITION_LABEL_LEFT * 2)
        );
        if (laneWidth < 80) {
          laneWidth = Math.min(80, paneWidth);
        }
        var remainingWidth = Math.max(0, paneWidth - laneWidth);
        var desiredLeftInset = Math.min(
          PREVIEW_OPEN_POSITION_LABEL_MAX_LEFT,
          Math.max(
            PREVIEW_OPEN_POSITION_LABEL_LEFT,
            Math.round(paneWidth * PREVIEW_OPEN_POSITION_LABEL_LEFT_RATIO)
          )
        );
        return {
          left: Math.min(
            desiredLeftInset,
            Math.max(0, remainingWidth - PREVIEW_OPEN_POSITION_LABEL_LEFT)
          ),
          width: laneWidth,
        };
      }

      function ensurePreviewTradeOverlayLayer() {
        if (!chartHost) return null;
        if (previewTradeOverlayLayer && previewTradeOverlayLayer.parentNode === chartHost) {
          return previewTradeOverlayLayer;
        }
        previewTradeOverlayNodesByKey = Object.create(null);
        previewTradeOverlayLayer = document.createElement('div');
        previewTradeOverlayLayer.className = 'rtx5-preview-trade-overlay-layer';
        previewTradeOverlayLayer.setAttribute('aria-hidden', 'true');
        previewTradeOverlayLayer.style.position = 'absolute';
        previewTradeOverlayLayer.style.inset = '0px';
        previewTradeOverlayLayer.style.overflow = 'hidden';
        previewTradeOverlayLayer.style.pointerEvents = 'none';
        previewTradeOverlayLayer.style.zIndex = '22';
        chartHost.appendChild(previewTradeOverlayLayer);
        return previewTradeOverlayLayer;
      }

      function upsertPreviewTradeOverlayNode(layer, key, className) {
        var node = previewTradeOverlayNodesByKey[key];
        if (node && node.parentNode === layer) return node;
        node = document.createElement('div');
        node.className = className;
        node.setAttribute('data-rtx5-preview-trade-key', key);
        layer.appendChild(node);
        previewTradeOverlayNodesByKey[key] = node;
        return node;
      }

      function prunePreviewTradeOverlayNodes(liveKeys) {
        var keep = Object.create(null);
        for (var i = 0; i < liveKeys.length; i += 1) keep[liveKeys[i]] = true;
        Object.keys(previewTradeOverlayNodesByKey).forEach(function(key) {
          if (keep[key]) return;
          var node = previewTradeOverlayNodesByKey[key];
          if (node && node.parentNode) {
            try { node.parentNode.removeChild(node); } catch (_error) {}
          }
          delete previewTradeOverlayNodesByKey[key];
        });
      }

      function resolvePreviewTradeOverlayMetrics() {
        var metrics = typeof resolvePreviewRightPriceAxisPlotMetrics === 'function'
          ? resolvePreviewRightPriceAxisPlotMetrics()
          : null;
        if (metrics) return metrics;
        if (!chartHost) return null;
        var width = Math.max(1, Number(chartHost.clientWidth) || 1);
        var height = Math.max(1, Number(chartHost.clientHeight) || 1);
        var axisWidth = Math.min(72, Math.max(50, Math.round(width * 0.17)));
        return {
          axisLeft: Math.max(0, width - axisWidth),
          axisWidth: axisWidth,
          chartWidth: width,
          plotTop: 0,
          plotHeight: height,
        };
      }

      function applyPreviewTradeLabelText(label, item, chartBackground) {
        var hasSplitLabel = !!(item.labelSideText && item.labelValueText);
        if (!hasSplitLabel) {
          label.textContent = item.title || '';
          label.style.color = item.labelSideColor || item.color;
          return;
        }
        var side = label.childNodes[0];
        var separator = label.childNodes[1];
        var value = label.childNodes[2];
        if (
          !side || side.nodeName !== 'SPAN' ||
          !separator || separator.nodeName !== 'SPAN' ||
          !value || value.nodeName !== 'SPAN' ||
          label.childNodes.length !== 3
        ) {
          while (label.firstChild) label.removeChild(label.firstChild);
          side = document.createElement('span');
          separator = document.createElement('span');
          value = document.createElement('span');
          label.appendChild(side);
          label.appendChild(separator);
          label.appendChild(value);
        }
        var isOpenPositionValue = isPreviewOpenPositionLine(item);
        side.textContent = item.labelSideText;
        side.style.color = isOpenPositionValue
          ? (item.labelValueColor || item.color)
          : (item.labelSideColor || item.color);
        separator.textContent = ', ';
        separator.style.color = side.style.color;
        value.textContent = item.labelValueText;
        value.style.color = item.labelValueColor || item.color;
        side.style.backgroundColor = separator.style.backgroundColor = isOpenPositionValue
          ? chartBackground
          : 'transparent';
        side.style.padding = isOpenPositionValue ? '0 2px' : '0';
        side.style.borderRadius = isOpenPositionValue ? '2px' : '0';
        side.style.fontVariantNumeric = 'tabular-nums';
        value.style.backgroundColor = isOpenPositionValue ? chartBackground : 'transparent';
        value.style.padding = isOpenPositionValue ? '0 2px' : '0';
        value.style.borderRadius = isOpenPositionValue ? '2px' : '0';
        value.style.fontVariantNumeric = 'tabular-nums';
        var tradeSpans = [side, separator, value];
        for (var tradeSpanIndex = 0; tradeSpanIndex < tradeSpans.length; tradeSpanIndex += 1) {
          tradeSpans[tradeSpanIndex].style.display = isOpenPositionValue ? 'block' : 'inline';
          tradeSpans[tradeSpanIndex].style.height = isOpenPositionValue ? '100%' : 'auto';
          tradeSpans[tradeSpanIndex].style.boxSizing = 'border-box';
        }
        side.style.flex = separator.style.flex = '0 0 auto';
        side.style.textAlign = isOpenPositionValue ? 'left' : 'inherit';
        value.style.flex = '0 1 auto';
        value.style.minWidth = '0';
        value.style.textAlign = isOpenPositionValue ? 'left' : 'inherit';
        value.style.overflow = isOpenPositionValue ? 'hidden' : 'visible';
        value.style.textOverflow = 'ellipsis';
      }

      function renderPreviewTradeOverlays() {
        if (!series || typeof series.priceToCoordinate !== 'function') {
          prunePreviewTradeOverlayNodes([]);
          return;
        }
        var layer = ensurePreviewTradeOverlayLayer();
        var metrics = resolvePreviewTradeOverlayMetrics();
        if (!layer || !metrics) return;
        var plotTop = Number(metrics.plotTop) || 0;
        var plotBottom = plotTop + Math.max(1, Number(metrics.plotHeight) || 1);
        var rows = [];
        for (var i = 0; i < previewTradeOverlayLines.length; i += 1) {
          var line = previewTradeOverlayLines[i];
          if (!isPreviewTradeOverlayLine(line)) continue;
          var y = series.priceToCoordinate(line.price);
          if (typeof y !== 'number' || !isFinite(y)) continue;
          if (y < plotTop || y > plotBottom) continue;
          rows.push({
            isOpenPosition: isPreviewOpenPositionLine(line),
            line: line,
            rawY: y,
            top: Math.round(y - PREVIEW_TRADE_LABEL_HEIGHT / 2),
          });
        }
        rows.sort(function(left, right) { return left.rawY - right.rawY; });
        var step = PREVIEW_TRADE_LABEL_HEIGHT + PREVIEW_TRADE_LABEL_GAP;
        var stackedRows = [];
        var previousStackedTop = null;
        for (var rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
          if (rows[rowIndex].isOpenPosition) {
            continue;
          }
          var minTop = typeof rows[rowIndex].line.labelMinTop === 'number'
            ? rows[rowIndex].line.labelMinTop
            : plotTop;
          rows[rowIndex].top = Math.max(minTop, rows[rowIndex].top);
          if (previousStackedTop !== null) {
            rows[rowIndex].top = Math.max(rows[rowIndex].top, previousStackedTop + step);
          }
          previousStackedTop = rows[rowIndex].top;
          stackedRows.push(rows[rowIndex]);
        }
        if (stackedRows.length > 0) {
          var maxTop = Math.max(plotTop, plotBottom - PREVIEW_TRADE_PRICE_BOX_HEIGHT);
          var overflow = stackedRows[stackedRows.length - 1].top - maxTop;
          if (overflow > 0) {
            for (var shiftIndex = stackedRows.length - 1; shiftIndex >= 0; shiftIndex -= 1) {
              stackedRows[shiftIndex].top = Math.max(plotTop, stackedRows[shiftIndex].top - overflow);
            }
          }
        }

        var liveKeys = [];
        var labelLeft = Math.max(8, Math.min(280, Math.round(metrics.axisLeft * 0.29)));
        var labelWidth = Math.max(70, Math.round(metrics.axisLeft - labelLeft - 6));
        var openPositionLabelLane = resolvePreviewOpenPositionLabelLane(metrics.axisLeft);
        var colors = typeof resolvePreviewRightPriceAxisColors === 'function'
          ? resolvePreviewRightPriceAxisColors()
          : { background: '#FFFFFF', text: '#0F172A' };
        var decimals = Number(window._previewDisplayDecimals);
        decimals = isFinite(decimals) ? Math.max(0, Math.min(8, Math.round(decimals))) : 2;

        for (var renderIndex = 0; renderIndex < rows.length; renderIndex += 1) {
          var item = rows[renderIndex].line;
          var id = item.id || String(renderIndex) + ':' + String(item.price);
          var rowCenter = rows[renderIndex].top + PREVIEW_TRADE_LABEL_HEIGHT / 2;
          var lineKey = 'line:' + id;
          var labelKey = 'label:' + id;
          liveKeys.push(lineKey);
          var lineNode = upsertPreviewTradeOverlayNode(layer, lineKey, 'rtx5-preview-trade-line');
          lineNode.style.position = 'absolute';
          lineNode.style.left = '2px';
          lineNode.style.top = Math.round(rowCenter) + 'px';
          lineNode.style.width = Math.max(0, Math.round(metrics.axisLeft - 2)) + 'px';
          lineNode.style.height = '0px';
          lineNode.style.transformOrigin = 'top left';
          lineNode.style.transform = isPreviewOpenPositionLine(item) ? 'scaleY(0.5)' : 'none';
          lineNode.style.borderTopWidth = Math.max(1, Number(item.lineWidth) || 1) + 'px';
          lineNode.style.borderTopStyle = item.lineStyle === 1 || item.lineStyle === 4
            ? 'dotted'
            : (item.lineStyle === 2 || item.lineStyle === 3 ? 'dashed' : 'solid');
          lineNode.style.borderTopColor = item.color || '#2962FF';
          lineNode.style.opacity = '0.9';

          if (item.title || item.labelSideText || item.labelValueText) {
            liveKeys.push(labelKey);
            var label = upsertPreviewTradeOverlayNode(layer, labelKey, 'rtx5-preview-trade-label');
            var isOpenPositionLabel = isPreviewOpenPositionLine(item);
            applyPreviewTradeLabelText(label, item, colors.background);
            label.style.position = 'absolute';
            label.style.display = isOpenPositionLabel && item.labelSideText && item.labelValueText ? 'flex' : 'block';
            label.style.alignItems = 'stretch';
            label.style.justifyContent = 'flex-start';
            label.style.left = (isOpenPositionLabel ? openPositionLabelLane.left : labelLeft) + 'px';
            label.style.top = Math.round(rows[renderIndex].top) + 'px';
            label.style.width = (isOpenPositionLabel ? openPositionLabelLane.width : labelWidth) + 'px';
            label.style.height = PREVIEW_TRADE_LABEL_HEIGHT + 'px';
            label.style.lineHeight = PREVIEW_TRADE_LABEL_HEIGHT + 'px';
            label.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, sans-serif";
            label.style.fontSize = item.labelSideText && item.labelValueText ? '9px' : '11px';
            label.style.fontWeight = '700';
            label.style.whiteSpace = 'nowrap';
            label.style.overflow = 'hidden';
            label.style.textOverflow = 'ellipsis';
            label.style.textAlign = isOpenPositionLabel ? 'center' : 'initial';
            label.style.pointerEvents = 'none';
          }

          if (shouldRenderPreviewTradePriceBox(item)) {
            var boxKey = 'box:' + id;
            liveKeys.push(boxKey);
            var box = upsertPreviewTradeOverlayNode(layer, boxKey, 'rtx5-preview-position-price-box');
            box.textContent = Number(item.price).toFixed(decimals);
            box.style.position = 'absolute';
            box.style.left = Math.round(metrics.axisLeft) + 'px';
            box.style.top = Math.round(rowCenter - PREVIEW_TRADE_PRICE_BOX_HEIGHT / 2) + 'px';
            box.style.width = Math.max(0, Math.round(metrics.axisWidth)) + 'px';
            box.style.height = PREVIEW_TRADE_PRICE_BOX_HEIGHT + 'px';
            box.style.lineHeight = PREVIEW_TRADE_PRICE_BOX_HEIGHT + 'px';
            box.style.boxSizing = 'border-box';
            box.style.padding = '0 3px';
            box.style.background = colors.background;
            box.style.color = item.color || colors.text;
            box.style.border = '1px solid ' + (item.color || '#2962FF');
            box.style.borderRadius = '2px';
            box.style.fontSize = '11px';
            box.style.fontWeight = '700';
            box.style.fontVariantNumeric = 'tabular-nums';
            box.style.textAlign = 'right';
            box.style.whiteSpace = 'nowrap';
            box.style.overflow = 'hidden';
            box.style.pointerEvents = 'none';
          }
        }
        prunePreviewTradeOverlayNodes(liveKeys);
      }

      function schedulePreviewTradeOverlayRefresh() {
        if (previewTradeOverlayRaf) return;
        previewTradeOverlayRaf = requestAnimationFrame(function() {
          previewTradeOverlayRaf = 0;
          renderPreviewTradeOverlays();
        });
      }

      function setPreviewTradeOverlayLines(lines) {
        previewTradeOverlayLines = Array.isArray(lines)
          ? lines.filter(isPreviewTradeOverlayLine)
          : [];
        schedulePreviewTradeOverlayRefresh();
      }

      function clearPreviewTradeOverlayRenderer() {
        if (previewTradeOverlayRaf) {
          try { cancelAnimationFrame(previewTradeOverlayRaf); } catch (_error) {}
          previewTradeOverlayRaf = 0;
        }
        if (previewTradeOverlayDetach) {
          try { previewTradeOverlayDetach(); } catch (_error) {}
          previewTradeOverlayDetach = null;
        }
        if (previewTradeOverlayLayer && previewTradeOverlayLayer.parentNode) {
          try { previewTradeOverlayLayer.parentNode.removeChild(previewTradeOverlayLayer); } catch (_error) {}
        }
        previewTradeOverlayLayer = null;
        previewTradeOverlayNodesByKey = Object.create(null);
        previewTradeOverlayLines = [];
      }

      function installPreviewTradeOverlayRenderer() {
        if (!chartHost || !chart) return;
        if (previewTradeOverlayDetach) {
          try { previewTradeOverlayDetach(); } catch (_error) {}
        }
        var refresh = function() { schedulePreviewTradeOverlayRefresh(); };
        chartHost.addEventListener('pointermove', refresh, true);
        chartHost.addEventListener('pointerup', refresh, true);
        chartHost.addEventListener('touchmove', refresh, { capture: true, passive: true });
        chartHost.addEventListener('touchend', refresh, { capture: true, passive: true });
        chartHost.addEventListener('wheel', refresh, { capture: true, passive: true });
        var timeScaleApi = null;
        try {
          timeScaleApi = chart.timeScale();
          if (timeScaleApi && typeof timeScaleApi.subscribeVisibleLogicalRangeChange === 'function') {
            timeScaleApi.subscribeVisibleLogicalRangeChange(refresh);
          }
        } catch (_error) {}
        previewTradeOverlayDetach = function() {
          chartHost.removeEventListener('pointermove', refresh, true);
          chartHost.removeEventListener('pointerup', refresh, true);
          chartHost.removeEventListener('touchmove', refresh, true);
          chartHost.removeEventListener('touchend', refresh, true);
          chartHost.removeEventListener('wheel', refresh, true);
          try {
            if (timeScaleApi && typeof timeScaleApi.unsubscribeVisibleLogicalRangeChange === 'function') {
              timeScaleApi.unsubscribeVisibleLogicalRangeChange(refresh);
            }
          } catch (_error) {}
        };
        schedulePreviewTradeOverlayRefresh();
      }

      window.setPreviewTradeOverlayLines = setPreviewTradeOverlayLines;
      window.renderPreviewTradeOverlays = renderPreviewTradeOverlays;
      window.schedulePreviewTradeOverlayRefresh = schedulePreviewTradeOverlayRefresh;
      window.clearPreviewTradeOverlayRenderer = clearPreviewTradeOverlayRenderer;
      window.installPreviewTradeOverlayRenderer = installPreviewTradeOverlayRenderer;
`;
