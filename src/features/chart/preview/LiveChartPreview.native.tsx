import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useLiveCandles } from '../../../domain/candles/hooks/useLiveCandles';
import { ChartColorsConfig, ChartDisplaySettings } from '../../../state/userPreferences';
import { useInstrumentMeta } from '../../../query/instruments';
import { hasLiveQuoteFeedData, useMarketData } from '../../../query/websocket';
import { getDevRefreshKey, hashDevRefreshSource } from '../../../dev/devRefreshKey';
import {
  buildVolumeDatum,
  LIVE_CHART_PREVIEW_TIME_SCALE_RIGHT_OFFSET,
  mapPreviewCandles,
  sanitizePreviewCandles,
  type PreviewChartType,
  type PreviewSourceCandle,
} from './chartPreviewShared';
import { resolvePreviewLivePriceColor } from './liveChartPreviewPriceColor';
import { resolveChartDisplayDecimals } from '../chartPricePrecision';
import {
  resolveRenkoMinimumPriceIncrement,
} from '../../../domain/candles/renko';
import { resolveStableRenkoBrickSize } from '../renkoBrickSizeCache';
import {
  resolveAreaChartColor,
  resolveAreaChartDirection,
} from '../areaChartDirection';
import { LIGHTWEIGHT_CHARTS_JS } from '../rendering/lightweightChartsBundle';
import type { QuoteItem } from '../../../dev/mock/tradingData';
import {
  useActiveBrokerCredentialScopeKey,
  useActiveBrokerQuerySession,
} from '../../../query/authenticatedQueryScope';
import { ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE } from '../../../config/orrnnDemoPublicMarket';
import { normalizeSymbol, normalizeTimeframeStrict } from '../../../domain/candles/core/candles';
import { LIVE_CHART_PREVIEW_COUNTDOWN_SCRIPT } from './liveChartPreviewCountdownScript';
import { LIVE_CHART_PREVIEW_AXIS_DIVIDER_SCRIPT } from './liveChartPreviewAxisDividerScript';
import { LIVE_CHART_PREVIEW_PRICE_SCALE_SCRIPT } from './liveChartPreviewPriceScaleScript';
import { LIVE_CHART_PREVIEW_RIGHT_PRICE_AXIS_SCRIPT } from './liveChartPreviewRightPriceAxisScript';
import { LIVE_CHART_PREVIEW_TIME_AXIS_SCRIPT } from './liveChartPreviewTimeAxisScript';
import { LIVE_CHART_PREVIEW_TRADE_OVERLAY_SCRIPT } from './liveChartPreviewTradeOverlayScript';
import { LIVE_CHART_PREVIEW_VIEWPORT_SCRIPT } from './liveChartPreviewViewportScript';
import {
  CHART_AREA_TIME_SCALE_MIN_BAR_SPACING,
  CHART_AREA_LINE_WIDTH,
  CHART_AREA_VISIBLE_BAR_MAX,
  CHART_AREA_VISIBLE_BAR_MIN,
  CHART_AXIS_DIVIDER_DARK_COLOR,
  CHART_AXIS_DIVIDER_LIGHT_COLOR,
  CHART_BEARISH_CANDLE_RENDER_OPACITY,
  CHART_CANDLE_RENDER_OPACITY,
  CHART_DEFAULT_TIME_SCALE_BAR_SPACING,
  CHART_DEFAULT_TIME_SCALE_MIN_BAR_SPACING,
  CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET,
  CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH,
  CHART_TIME_SCALE_FIX_LEFT_EDGE,
  CHART_TIME_SCALE_FIX_RIGHT_EDGE,
} from '../ChartScreen.constants';
import { useAreaChartHistoryExpansion } from '../useAreaChartHistoryExpansion';
import { RTX5_CUSTOM_CANDLESTICK_SERIES_WEBVIEW_JS } from '../../../domain/candles/rendering/customCandlestickSeriesWebView';
import { ENHANCED_DRAWING_TOOLS_JS } from '../plugins/enhancedDrawingToolsString';
import type { PersistedChartDrawing } from '../drawingPersistence';
import {
  resolveChartWindowPaneGesture,
  type ChartWindowPaneGesture,
} from '../chartWindowRadialMenu';


const CH_HTML = `
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
    <script>${LIGHTWEIGHT_CHARTS_JS}</script>
    <script>${RTX5_CUSTOM_CANDLESTICK_SERIES_WEBVIEW_JS}</script>
    <script>${ENHANCED_DRAWING_TOOLS_JS}</script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
      #chart { position: relative; width: 100%; height: 100%; }
    </style>
</head>
<body>
    <div id="chart"></div>
    <script>window.__RTX5_CUSTOM_CANDLE_GEOMETRY_DEBUG = ${__DEV__ ? 'true' : 'false'};</script>

    <script>
      var chart = null;
      var series = null;
      var volumeSeries = null;
      var previewDrawingManager = null;
      var priceLinesArr = [];
      var chartHost = document.getElementById('chart');
      window._displaySettings = {};
      window._customColors = {};
      window._lastChartData = [];
      window._lastVolumePoint = null;
      window._chartType = 'candles';
      window._previewDataContextKey = '';
      window._previewDataGeneration = 0;

${LIVE_CHART_PREVIEW_COUNTDOWN_SCRIPT}
${LIVE_CHART_PREVIEW_TIME_AXIS_SCRIPT}
${LIVE_CHART_PREVIEW_VIEWPORT_SCRIPT}
${LIVE_CHART_PREVIEW_PRICE_SCALE_SCRIPT}
${LIVE_CHART_PREVIEW_RIGHT_PRICE_AXIS_SCRIPT}
${LIVE_CHART_PREVIEW_AXIS_DIVIDER_SCRIPT}
${LIVE_CHART_PREVIEW_TRADE_OVERLAY_SCRIPT}

      function acceptPreviewDataContext(dataContextKey, dataGeneration) {
        var key = typeof dataContextKey === 'string' ? dataContextKey : '';
        var generation = Number(dataGeneration);
        if (!key || !Number.isFinite(generation) || generation < 1) return false;
        if (generation < window._previewDataGeneration) return false;
        if (
          generation === window._previewDataGeneration &&
          window._previewDataContextKey &&
          key !== window._previewDataContextKey
        ) {
          return false;
        }
        if (generation > window._previewDataGeneration || !window._previewDataContextKey) {
          var previewContextChanged =
            window._previewDataContextKey !== key ||
            window._previewDataGeneration !== generation;
          window._previewDataGeneration = generation;
          window._previewDataContextKey = key;
          if (previewContextChanged) resetPaneTapPairing();
        }
        return (
          window._previewDataGeneration === generation &&
          window._previewDataContextKey === key
        );
      }

      function resizeChartToHost() {
        if (!chart || !chartHost) return;
        var width = Math.max(1, Math.floor(chartHost.clientWidth || 0));
        var height = Math.max(1, Math.floor(chartHost.clientHeight || 0));
        try { chart.resize(width, height); } catch (_error) {}
        if (
          window._fullChartParity &&
          typeof notifyPreviewPriceScaleResized === 'function'
        ) {
          try { notifyPreviewPriceScaleResized(); } catch (_error) {}
        }
        if (typeof schedulePreviewRightPriceAxisRefresh === 'function') {
          try { schedulePreviewRightPriceAxisRefresh(); } catch (_error) {}
        }
        if (typeof schedulePreviewAxisDividersRefresh === 'function') {
          try { schedulePreviewAxisDividersRefresh(); } catch (_error) {}
        }
        if (typeof schedulePreviewTradeOverlayRefresh === 'function') {
          try { schedulePreviewTradeOverlayRefresh(); } catch (_error) {}
        }
        try { renderPreviewLivePriceBadge(); } catch (_error) {}
      }

      if (typeof ResizeObserver === 'function') {
        var chartResizeObserver = new ResizeObserver(function() {
          resizeChartToHost();
        });
        chartResizeObserver.observe(chartHost);
      }
      window.addEventListener('resize', resizeChartToHost);

      function hexToRgba(color, alpha) {
        if (!color) return 'rgba(148, 163, 184, ' + alpha + ')';
        var trimmed = String(color).trim();

        if (trimmed.indexOf('rgba(') === 0) {
          var rgbaParts = trimmed.slice(5, -1).split(',').map(function(part) { return part.trim(); });
          if (rgbaParts.length >= 3) {
            return 'rgba(' + rgbaParts[0] + ', ' + rgbaParts[1] + ', ' + rgbaParts[2] + ', ' + alpha + ')';
          }
        }

        if (trimmed.indexOf('rgb(') === 0) {
          var rgbParts = trimmed.slice(4, -1).split(',').map(function(part) { return part.trim(); });
          if (rgbParts.length >= 3) {
            return 'rgba(' + rgbParts[0] + ', ' + rgbParts[1] + ', ' + rgbParts[2] + ', ' + alpha + ')';
          }
        }

        var hex = trimmed.replace('#', '');
        if (hex.length === 3) {
          hex = hex.split('').map(function(char) { return char + char; }).join('');
        }

        if (/^[0-9a-fA-F]{6}$/.test(hex)) {
          var r = parseInt(hex.slice(0, 2), 16);
          var g = parseInt(hex.slice(2, 4), 16);
          var b = parseInt(hex.slice(4, 6), 16);
          return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
        }

        return trimmed;
      }

      function getVolumeBarColor(item, isActive) {
        var customCols = window._customColors || {};
        var up = customCols.candlesUptrend || '#2962FF';
        var down = customCols.candlesDowntrend || '#EF5350';
        var alpha = window._fullChartParity ? 0.85 : (isActive ? 0.78 : 0.32);
        return hexToRgba(item.close >= item.open ? up : down, alpha);
      }

      function buildVolumeDatum(item, isActive, minValue) {
        var rawValue = window._fullChartParity
          ? Math.abs(Number(item && item.close) - Number(item && item.open))
          : Math.max(Number(item && item.volume ? item.volume : 0), 0);
        if (!isFinite(rawValue)) rawValue = 0;
        var safeValue = window._fullChartParity
          ? rawValue
          : (typeof minValue === 'number' ? Math.max(minValue, rawValue) : rawValue);
        return {
          time: item.time,
          value: safeValue,
          color: getVolumeBarColor(item, isActive)
        };
      }

      function syncLastVolumePoint(point) {
        window._lastVolumePoint = point ? { time: point.time, value: point.value } : null;
      }

      function upsertLastChartDataPoint(tick) {
        if (!tick || typeof tick.time !== 'number') return;
        if (!Array.isArray(window._lastChartData)) {
          window._lastChartData = [];
        }
        var data = window._lastChartData;
        if (data.length > 0 && data[data.length - 1].time === tick.time) {
          data[data.length - 1] = tick;
          return;
        }
        data.push(tick);
      }

      function setVolumeSeriesData(data) {
        if (!volumeSeries) return;
        var source = Array.isArray(data) ? data : [];
        var volData = source.map(function(item, index) {
          return buildVolumeDatum(item, index === source.length - 1);
        });
        volumeSeries.setData(volData);
        syncLastVolumePoint(volData.length > 0 ? volData[volData.length - 1] : null);
      }

      function updateVolumeSeriesTick(tick) {
        if (!volumeSeries || !tick) return;
        var minValue = window._lastVolumePoint && window._lastVolumePoint.time === tick.time
          ? window._lastVolumePoint.value
          : undefined;
        var point = buildVolumeDatum(tick, true, minValue);
        volumeSeries.update(point);
        syncLastVolumePoint(point);
      }

      function resetPriceLines() {
        priceLinesArr.forEach(function(priceLine) {
          try { series.removePriceLine(priceLine); } catch (_error) {}
        });
        priceLinesArr = [];
      }

      function ensurePreviewDrawingManager() {
        if (previewDrawingManager || !chart || !series || typeof window.DrawingToolsManager !== 'function') {
          return previewDrawingManager;
        }
        try {
          previewDrawingManager = new window.DrawingToolsManager(chart, series);
          previewDrawingManager.setDrawingsLocked(true);
        } catch (_error) {
          previewDrawingManager = null;
        }
        return previewDrawingManager;
      }

      function setPreviewSerializedDrawings(drawings, hidden, showDescriptions, dataContextKey, dataGeneration) {
        if (!acceptPreviewDataContext(dataContextKey, dataGeneration)) return;
        var manager = ensurePreviewDrawingManager();
        if (!manager) return;
        try {
          manager.setShowObjectDescriptions(showDescriptions !== false);
          manager.setDrawingsHidden(hidden === true);
          manager.setSerializedDrawings(Array.isArray(drawings) ? drawings : []);
          manager.setDrawingsLocked(true);
        } catch (_error) {}
      }

      function applyPreviewWindowCommand(commandType) {
        if (!chart) return;
        try {
          if (commandType === 'scrollToLastBar') {
            if (typeof window.__rtx5ScrollToLastBar === 'function') {
              window.__rtx5ScrollToLastBar();
            } else {
              chart.timeScale().scrollToRealTime();
            }
            return;
          }
          if (commandType === 'resetVerticalScale' || commandType === 'resetViewport') {
            if (typeof resetPreviewPriceScale === 'function') {
              resetPreviewPriceScale();
            } else {
              chart.priceScale('right').applyOptions({ autoScale: true });
            }
          }
          if (commandType === 'resetViewport') {
            if (window._fullChartParity && typeof applyPreviewRecentViewport === 'function') {
              applyPreviewRecentViewport(window._lastChartData.length);
            } else {
              chart.timeScale().fitContent();
            }
          }
          if (typeof schedulePreviewTradeOverlayRefresh === 'function') {
            schedulePreviewTradeOverlayRefresh();
          }
        } catch (_error) {}
      }

      function initChart(opts, chartType, data, displayDecimals, customColors, displaySettings, dataContextKey, dataGeneration, fullChartParity, autoScaleEnabled, verticalScrollingLocked, showVolumePane, drawings, drawingsHidden, showObjectDescriptions) {
        try {
          if (!acceptPreviewDataContext(dataContextKey, dataGeneration)) return;
          resetPreviewViewportBridgeState();
          if (typeof detachPreviewPriceScaleInteractions === 'function') {
            detachPreviewPriceScaleInteractions();
          }
          if (typeof clearPreviewRightPriceAxis === 'function') {
            clearPreviewRightPriceAxis();
          }
          if (typeof clearPreviewAxisDividers === 'function') {
            clearPreviewAxisDividers();
          }
          if (typeof clearPreviewTradeOverlayRenderer === 'function') {
            clearPreviewTradeOverlayRenderer();
          }
          if (typeof resetPreviewPriceScale === 'function') {
            resetPreviewPriceScale();
          }
          if (previewDrawingManager) {
            try { previewDrawingManager.remove(); } catch (_error) {}
            previewDrawingManager = null;
          }
          if (chart) {
            chart.remove();
          }

          chart = null;
          series = null;
          volumeSeries = null;
          priceLinesArr = [];
          window._lastChartData = [];
          window._lastVolumePoint = null;
          window._chartType = chartType;
          window._customColors = customColors || {};
          window._displaySettings = displaySettings || {};
          window._fullChartParity = fullChartParity === true;
          window._previewDisplayDecimals = displayDecimals;
          var areaViewportConfig = opts && opts.areaViewport ? opts.areaViewport : {};
          var requestedAreaVisibleBars = Number(areaViewportConfig.visibleBars);
          window._areaVisibleBarTarget =
            isFinite(requestedAreaVisibleBars) && requestedAreaVisibleBars > 0
              ? Math.min(
                  ${CHART_AREA_VISIBLE_BAR_MAX},
                  Math.max(${CHART_AREA_VISIBLE_BAR_MIN}, Math.round(requestedAreaVisibleBars))
                )
              : ${CHART_AREA_VISIBLE_BAR_MAX};
          if (opts && opts.areaViewport) delete opts.areaViewport;

          var showLastPriceLine = !!(window._displaySettings && window._displaySettings.showLastPriceLine);
          // Line and Area are close-only surfaces, while Renko volume cannot be
          // assigned truthfully when one source candle creates many bricks.
          var showVolumes = window._fullChartParity
            ? showVolumePane === true
              && chartType !== 'line'
              && chartType !== 'area'
              && chartType !== 'renko'
            : chartType !== 'renko' && !!(window._displaySettings && (window._displaySettings.showTickVolumes || window._displaySettings.showRealVolumes));
          var hasCustomQuoteLine = !!(window._displaySettings && (window._displaySettings.showBidPriceLine || window._displaySettings.showAskPriceLine));
          var showLastValueLabel = !hasCustomQuoteLine;
          var cUp = window._customColors.candlesUptrend || '#2962FF';
          var cDown = window._customColors.candlesDowntrend || '#EF5350';
          var hollowBody = window._customColors.hollowBody || 'transparent';
          var bUp = window._customColors.barsUptrend || '#2962FF';
          var bDown = window._customColors.barsDowntrend || '#EF5350';
          var lineColor = window._customColors.lineBody || '#2962FF';

          opts.layout.background = { type: 'solid', color: opts.layout.background.color };
          opts.grid.vertLines.style = LightweightCharts.LineStyle.SparseDotted;
          opts.grid.horzLines.style = LightweightCharts.LineStyle.SparseDotted;
          opts.crosshair.vertLine.style = LightweightCharts.LineStyle.Dashed;
          opts.crosshair.horzLine.style = LightweightCharts.LineStyle.Dashed;
          opts.timeScale = Object.assign({}, opts.timeScale || {}, {
            tickMarkFormatter: formatPreviewChartTickMark
          });
          opts.localization = Object.assign({}, opts.localization || {}, {
            timeFormatter: formatPreviewChartTime
          });

          chart = LightweightCharts.createChart(chartHost, opts);
          resizeChartToHost();
          bindPreviewVisibleLogicalRangeClamp();
          if (window._fullChartParity) {
            if (typeof setPreviewChartAutoScaleEnabled === 'function') {
              setPreviewChartAutoScaleEnabled(autoScaleEnabled === true);
            }
            if (typeof setPreviewVerticalScrollingLocked === 'function') {
              setPreviewVerticalScrollingLocked(verticalScrollingLocked === true);
            }
            if (typeof installPreviewPriceScaleInteractions === 'function') {
              installPreviewPriceScaleInteractions();
            }
          }

          var priceFormatInfo = {
            type: 'price',
            precision: displayDecimals,
            minMove: 1 / Math.pow(10, displayDecimals)
          };

          if (chartType === 'candles' || chartType === 'hollow' || chartType === 'renko') {
            // Split panes use the exact renderer and presentation constants as
            // the full chart. Renko reuses its bodies with wicks disabled.
            series = window.addRTX5CustomCandlestickSeries(chart, {
              candleOpacity: ${CHART_CANDLE_RENDER_OPACITY},
              bearishCandleOpacity: ${CHART_BEARISH_CANDLE_RENDER_OPACITY},
              bodyUpColor: chartType === 'hollow' ? hollowBody : cUp,
              bodyDownColor: chartType === 'hollow' ? hollowBody : cDown,
              borderUpColor: cUp,
              borderDownColor: cDown,
              wickUpColor: cUp,
              wickDownColor: cDown,
              borderVisible: true,
              wickVisible: chartType !== 'renko',
              color: cUp,
              lastValueVisible: showLastValueLabel,
              priceLineVisible: showLastPriceLine,
              priceFormat: priceFormatInfo,
            });
          } else if (chartType === 'bars') {
            series = chart.addSeries(LightweightCharts.BarSeries, {
              upColor: bUp,
              downColor: bDown,
              lastValueVisible: showLastValueLabel,
              priceLineVisible: showLastPriceLine,
              priceFormat: priceFormatInfo,
            });
          } else if (chartType === 'area') {
            // Area uses Line's close-price path, with a theme-colored gradient
            // added underneath so preview and main-chart styling stay equal.
            series = chart.addSeries(LightweightCharts.AreaSeries, {
              lineColor: lineColor,
              topColor: hexToRgba(lineColor, 0.32),
              bottomColor: hexToRgba(lineColor, 0.04),
              lineWidth: ${CHART_AREA_LINE_WIDTH},
              lineType: LightweightCharts.LineType.Simple,
              crosshairMarkerVisible: true,
              lastValueVisible: showLastValueLabel,
              priceLineVisible: showLastPriceLine,
              priceFormat: priceFormatInfo,
            });
          } else {
            series = chart.addSeries(LightweightCharts.LineSeries, {
              color: lineColor,
              lineWidth: 2,
              crosshairMarkerVisible: true,
              lastValueVisible: showLastValueLabel,
              priceLineVisible: showLastPriceLine,
              priceFormat: priceFormatInfo,
            });
          }

          if (showVolumes) {
            volumeSeries = chart.addSeries(LightweightCharts.HistogramSeries, {
              color: hexToRgba(cUp, 0.32),
              priceFormat: { type: 'volume' },
              priceScaleId: 'volume',
              priceLineVisible: false,
              lastValueVisible: false,
            });
            chart.priceScale('volume').applyOptions({
              scaleMargins: window._fullChartParity
                ? { top: 0.82, bottom: 0.02 }
                : { top: 0.84, bottom: 0.02 },
              visible: false,
            });
          }

          if (data && data.length > 0) {
            window._lastChartData = data.slice();
            series.setData(data);
            setVolumeSeriesData(window._lastChartData);
            if (window._fullChartParity) {
              applyPreviewRecentViewport(window._lastChartData.length);
            } else {
              try { chart.timeScale().fitContent(); } catch (_error) {}
            }
          }
          setPreviewCountdownSeriesContext(dataContextKey, dataGeneration, data);
          if (window._fullChartParity && typeof installPreviewRightPriceAxis === 'function') {
            installPreviewRightPriceAxis();
          }
          if (window._fullChartParity && typeof installPreviewAxisDividers === 'function') {
            installPreviewAxisDividers();
          }
          if (window._fullChartParity && typeof installPreviewTradeOverlayRenderer === 'function') {
            installPreviewTradeOverlayRenderer();
          }
          setPreviewSerializedDrawings(
            drawings,
            drawingsHidden,
            showObjectDescriptions,
            dataContextKey,
            dataGeneration
          );

          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'CHART_READY',
            dataContextKey: dataContextKey,
            dataGeneration: dataGeneration
          }));
        } catch (error) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ERROR', message: error.message }));
        }
      }

      function updateChartData(data, dataContextKey, dataGeneration, resetVisibleRange) {
        try {
          if (!acceptPreviewDataContext(dataContextKey, dataGeneration)) return;
          if (!series) return;
          var previousData = Array.isArray(window._lastChartData)
            ? window._lastChartData.slice()
            : [];
          var previousVisibleRange = getPreviewVisibleLogicalRangeSnapshot();
          var nextData = Array.isArray(data) ? data.slice() : [];
          var expandAreaRecentViewport = shouldExpandPreviewAreaAfterPrepend(
            previousData,
            nextData,
            previousVisibleRange
          );
          window._lastChartData = nextData;
          series.setData(window._lastChartData);
          setVolumeSeriesData(window._lastChartData);
          setPreviewCountdownSeriesContext(
            dataContextKey,
            dataGeneration,
            window._lastChartData
          );
          if (chart && window._lastChartData.length > 0) {
            if (window._fullChartParity && (resetVisibleRange || expandAreaRecentViewport)) {
              applyPreviewRecentViewport(window._lastChartData.length);
            } else if (resetVisibleRange) {
              try { chart.timeScale().fitContent(); } catch (_error) {}
            } else if (!expandAreaRecentViewport) {
              restorePreviewPrependedHistoryViewport(
                previousData,
                window._lastChartData,
                previousVisibleRange
              );
            }
          }
          if (typeof reapplyPreviewManualPriceScale === 'function') {
            reapplyPreviewManualPriceScale();
          }
          if (typeof schedulePreviewRightPriceAxisRefresh === 'function') {
            schedulePreviewRightPriceAxisRefresh();
          }
          if (typeof schedulePreviewAxisDividersRefresh === 'function') {
            schedulePreviewAxisDividersRefresh();
          }
          if (typeof schedulePreviewTradeOverlayRefresh === 'function') {
            schedulePreviewTradeOverlayRefresh();
          }
        } catch (_error) {}
      }

      // Colors-only fast path: recolor the existing chart in place instead of
      // re-injecting the full candle history from the host (which took seconds).
      function applyPreviewColors(opts, customColors, dataContextKey, dataGeneration) {
        try {
          if (!acceptPreviewDataContext(dataContextKey, dataGeneration)) return;
          if (!chart || !series) return;
          window._customColors = customColors || {};
          var chartType = window._chartType;
          var cUp = window._customColors.candlesUptrend || '#2962FF';
          var cDown = window._customColors.candlesDowntrend || '#EF5350';
          var hollowBody = window._customColors.hollowBody || 'transparent';
          var bUp = window._customColors.barsUptrend || '#2962FF';
          var bDown = window._customColors.barsDowntrend || '#EF5350';
          var lineColor = window._customColors.lineBody || '#2962FF';

          if (opts && opts.layout && opts.layout.background) {
            opts.layout.background = { type: 'solid', color: opts.layout.background.color };
            if (opts.grid) {
              opts.grid.vertLines.style = LightweightCharts.LineStyle.SparseDotted;
              opts.grid.horzLines.style = LightweightCharts.LineStyle.SparseDotted;
            }
            chart.applyOptions(opts);
          }

          // Apply theme changes in place; recreating the retained preview would
          // reset its viewport and make divided charts visibly jump.
          if (chartType === 'candles' || chartType === 'hollow' || chartType === 'renko') {
            series.applyOptions({
              candleOpacity: ${CHART_CANDLE_RENDER_OPACITY},
              bearishCandleOpacity: ${CHART_BEARISH_CANDLE_RENDER_OPACITY},
              bodyUpColor: chartType === 'hollow' ? hollowBody : cUp,
              bodyDownColor: chartType === 'hollow' ? hollowBody : cDown,
              borderUpColor: cUp,
              borderDownColor: cDown,
              wickUpColor: cUp,
              wickDownColor: cDown,
              wickVisible: chartType !== 'renko',
              color: cUp
            });
          } else if (chartType === 'bars') {
            series.applyOptions({ upColor: bUp, downColor: bDown });
          } else if (chartType === 'area') {
            // Update both the Area stroke and fill from the shared line color.
            series.applyOptions({
              lineColor: lineColor,
              topColor: hexToRgba(lineColor, 0.32),
              bottomColor: hexToRgba(lineColor, 0.04),
            });
          } else {
            series.applyOptions({ color: lineColor });
          }

          setVolumeSeriesData(window._lastChartData);
          if (typeof schedulePreviewRightPriceAxisRefresh === 'function') {
            schedulePreviewRightPriceAxisRefresh();
          }
          if (typeof schedulePreviewAxisDividersRefresh === 'function') {
            schedulePreviewAxisDividersRefresh();
          }
          if (typeof schedulePreviewTradeOverlayRefresh === 'function') {
            schedulePreviewTradeOverlayRefresh();
          }
        } catch (_error) {}
      }

      function updateTick(tick, dataContextKey, dataGeneration) {
        try {
          if (!acceptPreviewDataContext(dataContextKey, dataGeneration)) return;
          if (!series || !tick) return;
          upsertLastChartDataPoint(tick);
          series.update(tick);
          updateVolumeSeriesTick(tick);
          updatePreviewCountdownSeriesTick(tick, dataContextKey, dataGeneration);
          if (typeof schedulePreviewRightPriceAxisRefresh === 'function') {
            schedulePreviewRightPriceAxisRefresh();
          }
          if (typeof schedulePreviewAxisDividersRefresh === 'function') {
            schedulePreviewAxisDividersRefresh();
          }
          if (typeof schedulePreviewTradeOverlayRefresh === 'function') {
            schedulePreviewTradeOverlayRefresh();
          }
        } catch (_error) {}
      }

      function setPriceLines(lines, dataContextKey, dataGeneration) {
        try {
          if (!acceptPreviewDataContext(dataContextKey, dataGeneration)) return;
          if (!series) return;
          resetPriceLines();
          if (typeof setPreviewTradeOverlayLines === 'function') {
            setPreviewTradeOverlayLines(lines || []);
          }
          (lines || []).forEach(function(line) {
            try {
              if (
                typeof isPreviewTradeOverlayLine === 'function' &&
                isPreviewTradeOverlayLine(line)
              ) return;
              var priceLine = series.createPriceLine({
                price: line.price,
                color: line.color,
                lineWidth: line.lineWidth || 1,
                lineStyle: line.lineStyle !== undefined ? line.lineStyle : LightweightCharts.LineStyle.Solid,
                axisLabelVisible:
                  line.axisLabelVisible !== false &&
                  !(line.role === 'live' && previewCountdownActive),
                title: line.title || '',
              });
              priceLinesArr.push(priceLine);
            } catch (_error) {}
          });
          try {
            series.applyOptions({ lastValueVisible: (lines || []).length === 0 });
          } catch (_error) {}
          renderPreviewLivePriceBadge();
        } catch (_error) {}
      }

      // Keep pane-selection gestures inside the chart document so the native
      // wrapper never places a touch-stealing overlay above Lightweight Charts.
      // The native host holds PANE_TAP for the double-tap window and cancels it
      // if PANE_DOUBLE_TAP arrives, so the first tap cannot remount its target.
      var PREVIEW_PANE_DOUBLE_TAP_MAX_DELAY_MS = 320;
      var PREVIEW_PANE_DOUBLE_TAP_MAX_DISTANCE_PX = 24;
      var lastPaneTap = null;
      var paneTouchStart = null;
      function resetPaneTapPairing() {
        lastPaneTap = null;
      }
      function emitPaneTap(clientX, clientY) {
        var now = Date.now();
        var rect = chartHost && typeof chartHost.getBoundingClientRect === 'function'
          ? chartHost.getBoundingClientRect()
          : { left: 0, top: 0, width: 0, height: 0 };
        var width = Math.max(1, Number(rect.width) || Number(chartHost.clientWidth) || 1);
        var height = Math.max(1, Number(rect.height) || Number(chartHost.clientHeight) || 1);
        var x = Math.min(width, Math.max(0, Number(clientX) - (Number(rect.left) || 0)));
        var y = Math.min(height, Math.max(0, Number(clientY) - (Number(rect.top) || 0)));
        var dataContextKey = window._previewDataContextKey || '';
        var dataGeneration = Number(window._previewDataGeneration) || 0;
        var previousTap = lastPaneTap;
        var elapsed = previousTap ? now - previousTap.at : Infinity;
        var dx = previousTap ? x - previousTap.x : Infinity;
        var dy = previousTap ? y - previousTap.y : Infinity;
        var maxDistanceSquared =
          PREVIEW_PANE_DOUBLE_TAP_MAX_DISTANCE_PX * PREVIEW_PANE_DOUBLE_TAP_MAX_DISTANCE_PX;
        var isDoubleTap =
          !!previousTap &&
          previousTap.dataContextKey === dataContextKey &&
          previousTap.dataGeneration === dataGeneration &&
          elapsed >= 0 &&
          elapsed <= PREVIEW_PANE_DOUBLE_TAP_MAX_DELAY_MS &&
          dx * dx + dy * dy <= maxDistanceSquared;
        lastPaneTap = isDoubleTap
          ? null
          : { x: x, y: y, at: now, dataContextKey: dataContextKey, dataGeneration: dataGeneration };
        var price = null;
        if (series && typeof series.coordinateToPrice === 'function') {
          var resolvedPrice = series.coordinateToPrice(y);
          price = typeof resolvedPrice === 'number' && isFinite(resolvedPrice)
            ? resolvedPrice
            : null;
        }
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: isDoubleTap ? 'PANE_DOUBLE_TAP' : 'PANE_TAP',
          x: x,
          y: y,
          width: width,
          height: height,
          price: price,
          dataContextKey: dataContextKey,
          dataGeneration: dataGeneration
        }));
      }
      chartHost.addEventListener('touchstart', function(event) {
        var touch = event.touches && event.touches.length === 1 ? event.touches[0] : null;
        if (
          touch &&
          typeof shouldSuppressPreviewPaneTap === 'function' &&
          shouldSuppressPreviewPaneTap(touch.clientX, touch.clientY)
        ) {
          paneTouchStart = null;
          return;
        }
        paneTouchStart = touch ? { x: touch.clientX, y: touch.clientY, at: Date.now() } : null;
      }, { capture: true, passive: true });
      chartHost.addEventListener('touchend', function(event) {
        if (!paneTouchStart) return;
        var touch = event.changedTouches && event.changedTouches[0];
        var start = paneTouchStart;
        paneTouchStart = null;
        if (!touch) return;
        if (
          typeof shouldSuppressPreviewPaneTap === 'function' &&
          shouldSuppressPreviewPaneTap(touch.clientX, touch.clientY)
        ) {
          return;
        }
        var moved = Math.hypot(touch.clientX - start.x, touch.clientY - start.y);
        if (moved <= 14 && Date.now() - start.at <= 450) {
          emitPaneTap(touch.clientX, touch.clientY);
        }
      }, { capture: true, passive: true });

      window.setPreviewCandleCountdown = setPreviewCandleCountdown;

      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'READY' }));
    </script>
</body>
</html>
`;

const PREVIEW_DEV_SOURCE_KEY = getDevRefreshKey(
  'chart-preview-webview',
  typeof __DEV__ !== 'undefined' && __DEV__ ? hashDevRefreshSource(CH_HTML) : '',
);
// Keep a bridge margin above the in-document 320 ms recognizer. Ownership is
// already claimed immediately through onTapIntent, so this delay only decides
// whether to promote the pane or open its double-tap radial menu.
const PREVIEW_PANE_DOUBLE_TAP_WINDOW_MS = 400;

export type PreviewOverlayPriceLine = Readonly<{
  id?: string;
  price: number;
  color: string;
  lineWidth?: number;
  lineStyle?: number;
  axisLabelVisible?: boolean;
  title?: string;
  role?: string;
  labelSideText?: string;
  labelValueText?: string;
  labelSideColor?: string;
  labelValueColor?: string;
  labelPlacement?: 'floating' | 'line';
  labelMinTop?: number;
  dragKey?: string;
}>;

export default function LiveChartPreviewNative({
  symbol,
  timeframe,
  colors,
  display,
  priceSource,
  isDark,
  chartType = 'candles',
  active = true,
  commitIntervalMs = 0,
  maxCandles,
  onTapIntent,
  onTap,
  onDoubleTap,
  liveQuoteOverride,
  manageQuoteSubscription = true,
  candleCountdownActive = false,
  fullChartParity = false,
  autoScaleEnabled = false,
  verticalScrollingLocked = false,
  showVolumePane,
  drawings = [],
  drawingsHidden = false,
  showObjectDescriptions = true,
  viewportCommand,
  overlayPriceLines = [],
  onLatestCandleChange,
}: {
  symbol: string;
  timeframe: string;
  colors: ChartColorsConfig;
  display: ChartDisplaySettings;
  priceSource: 'bid' | 'ask';
  isDark: boolean;
  chartType?: PreviewChartType;
  active?: boolean;
  commitIntervalMs?: number;
  maxCandles?: number;
  onTapIntent?: (gesture: ChartWindowPaneGesture) => void;
  onTap?: (gesture: ChartWindowPaneGesture) => void;
  onDoubleTap?: (gesture: ChartWindowPaneGesture) => void;
  liveQuoteOverride?: Partial<QuoteItem>;
  manageQuoteSubscription?: boolean;
  candleCountdownActive?: boolean;
  /** Enables the normal ChartScreen viewport and price-scale behavior. */
  fullChartParity?: boolean;
  autoScaleEnabled?: boolean;
  verticalScrollingLocked?: boolean;
  showVolumePane?: boolean;
  /** Window-owned drawings rendered read-only while this pane is inactive. */
  drawings?: readonly PersistedChartDrawing[];
  drawingsHidden?: boolean;
  showObjectDescriptions?: boolean;
  viewportCommand?: Readonly<{
    revision: number;
    type: 'scrollToLastBar' | 'resetVerticalScale' | 'resetViewport';
  }>;
  overlayPriceLines?: readonly PreviewOverlayPriceLine[];
  onLatestCandleChange?: (payload: Readonly<{
    symbol: string;
    timeframe: string;
    candle: PreviewSourceCandle | null;
  }>) => void;
}) {
  const webViewRef = useRef<WebView>(null);
  const [webViewReady, setWebViewReady] = useState(false);
  const brokerCredentialScopeKey = useActiveBrokerCredentialScopeKey();
  const activeBrokerQuerySession = useActiveBrokerQuerySession();
  const previewDataContextKey = useMemo(() => (
    `${brokerCredentialScopeKey}:${normalizeSymbol(symbol)}:${normalizeTimeframeStrict(timeframe) ?? timeframe}`
  ), [brokerCredentialScopeKey, symbol, timeframe]);
  const {
    candles,
    hasHistoryCandles,
    loading: historyLoading,
    paginate,
  } = useLiveCandles(symbol, timeframe, active, commitIntervalMs);
  const areaVisibleBarTarget = useAreaChartHistoryExpansion({
    active,
    chartType,
    symbol,
    timeframe,
    cacheScopeKey: brokerCredentialScopeKey,
    candleCount: candles.length,
    hasHistoryCandles,
    historyLoading,
    paginate,
    renderLimit: maxCandles,
  });
  const liveQuotes = useMarketData([symbol], active && manageQuoteSubscription);
  const liveQuote = manageQuoteSubscription ? liveQuotes[symbol] : liveQuoteOverride;
  const { data: instrumentMeta } = useInstrumentMeta(symbol, active);
  const liveQuoteDigitsSource = (liveQuote as { digitsSource?: string } | undefined)?.digitsSource;
  const hasLivePreviewQuote = hasLiveQuoteFeedData(liveQuote);
  // Match the renderer rule above when reserving vertical space: modes without
  // a truthful lower volume pane must keep the full price plot height.
  const previewShowsVolumePane = fullChartParity
    ? showVolumePane === true
      && chartType !== 'line'
      && chartType !== 'area'
      && chartType !== 'renko'
    : chartType !== 'renko' && (display.showTickVolumes || display.showRealVolumes);
  const chartSignatureRef = useRef('');
  const lastRenderedDataSignatureRef = useRef('');
  const previewBridgeContextRef = useRef({
    key: previewDataContextKey,
    generation: 1,
  });
  if (previewBridgeContextRef.current.key !== previewDataContextKey) {
    previewBridgeContextRef.current = {
      key: previewDataContextKey,
      generation: previewBridgeContextRef.current.generation + 1,
    };
    chartSignatureRef.current = '';
    lastRenderedDataSignatureRef.current = '';
  }
  const previewDataGeneration = previewBridgeContextRef.current.generation;

  const chartOptions = useMemo(() => ({
    layout: {
      background: { color: colors.background },
      textColor: colors.foreground,
      attributionLogo: false,
      fontSize: 11,
    },
    grid: {
      vertLines: { color: display.showGrid ? colors.grid : 'transparent' },
      horzLines: { color: display.showGrid ? colors.grid : 'transparent' },
    },
    crosshair: {
      mode: fullChartParity ? 2 : 0,
      vertLine: {
        visible: !fullChartParity,
        labelVisible: !fullChartParity,
        color: colors.foreground,
        width: fullChartParity ? 0 : 1,
        labelBackgroundColor: colors.foreground,
      },
      horzLine: {
        visible: !fullChartParity,
        labelVisible: !fullChartParity,
        color: colors.foreground,
        width: fullChartParity ? 0 : 1,
        labelBackgroundColor: colors.foreground,
      },
    },
    timeScale: {
      borderVisible: !fullChartParity,
      borderColor: fullChartParity
        ? 'transparent'
        : (display.showGrid ? colors.grid : 'transparent'),
      timeVisible: true,
      secondsVisible: false,
      rightOffset: fullChartParity
        ? CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET
        : LIVE_CHART_PREVIEW_TIME_SCALE_RIGHT_OFFSET,
      shiftVisibleRangeOnNewBar: true,
      barSpacing: fullChartParity ? CHART_DEFAULT_TIME_SCALE_BAR_SPACING : 13,
      minBarSpacing: chartType === 'area'
        ? CHART_AREA_TIME_SCALE_MIN_BAR_SPACING
        : CHART_DEFAULT_TIME_SCALE_MIN_BAR_SPACING,
      fixLeftEdge: fullChartParity ? CHART_TIME_SCALE_FIX_LEFT_EDGE : undefined,
      fixRightEdge: fullChartParity ? CHART_TIME_SCALE_FIX_RIGHT_EDGE : undefined,
    },
    handleScroll: fullChartParity ? {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: false,
    } : undefined,
    handleScale: fullChartParity ? {
      mouseWheel: true,
      pinch: true,
      axisPressedMouseMove: { time: true, price: false },
    } : undefined,
    leftPriceScale: fullChartParity ? {
      visible: false,
    } : undefined,
    rightPriceScale: {
      visible: true,
      borderVisible: !fullChartParity,
      borderColor: fullChartParity
        ? 'transparent'
        : (display.showGrid ? colors.grid : 'transparent'),
      autoScale: fullChartParity ? autoScaleEnabled : true,
      entireTextOnly: false,
      minimumWidth: CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH,
      scaleMargins: {
        top: fullChartParity ? 0 : 0.08,
        bottom: fullChartParity
          ? (previewShowsVolumePane ? 0.34 : 0)
          : (previewShowsVolumePane ? 0.25 : 0.08),
      },
    },
    areaViewport: {
      visibleBars: areaVisibleBarTarget,
    },
  }), [
    areaVisibleBarTarget,
    autoScaleEnabled,
    chartType,
    colors,
    display,
    fullChartParity,
    previewShowsVolumePane,
  ]);

  // Existing preview callers retain full-history parity with ChartScreen.
  // Multi-window panes opt into a bounded tail so a second WebView cannot hold
  // another unbounded candle array in both React and the chart document.
  const previewCandles = useMemo(
    () => {
      const sanitized = sanitizePreviewCandles(candles);
      const safeLimit = typeof maxCandles === 'number' && Number.isFinite(maxCandles)
        ? Math.max(1, Math.floor(maxCandles))
        : null;
      // Renko is path-dependent: always transform the same full canonical
      // history as the main chart, then limit the rendered brick tail below.
      return safeLimit === null || chartType === 'renko'
        ? sanitized
        : sanitized.slice(-safeLimit);
    },
    [candles, chartType, maxCandles],
  );
  const areaChartDirection = useMemo(
    () => resolveAreaChartDirection(previewCandles),
    [previewCandles],
  );
  const areaChartColor = useMemo(
    () => resolveAreaChartColor(areaChartDirection, colors),
    [areaChartDirection, colors],
  );
  const previewCustomColors = useMemo(() => ({
    ...colors,
    // The retained preview already has an in-place colors bridge. Overriding
    // only Area's line token lets live terminal crossings recolor without init.
    lineBody: chartType === 'area' ? areaChartColor : colors.lineBody,
    axisDivider: isDark
      ? CHART_AXIS_DIVIDER_DARK_COLOR
      : CHART_AXIS_DIVIDER_LIGHT_COLOR,
  }), [areaChartColor, chartType, colors, isDark]);
  const latestPreviewCandle = previewCandles[previewCandles.length - 1] ?? null;
  useEffect(() => {
    onLatestCandleChange?.({ symbol, timeframe, candle: latestPreviewCandle });
  }, [latestPreviewCandle, onLatestCandleChange, symbol, timeframe]);
  const latestPreviewPrecisionPrices = useMemo(() => {
    const latest = previewCandles[previewCandles.length - 1];
    return latest ? [latest.open, latest.high, latest.low, latest.close] : [];
  }, [previewCandles]);
  const displayDecimals = useMemo(() => {
    return resolveChartDisplayDecimals({
      instrumentDigits: instrumentMeta?.digits,
      instrumentPoint: instrumentMeta?.point,
      instrumentTickSize: instrumentMeta?.tickSize,
      liveQuoteDigits: liveQuote?.digits,
      liveQuoteDigitsFromBackend: hasLivePreviewQuote && liveQuoteDigitsSource === 'backend',
      liveQuotePoint: liveQuote?.point,
      liveQuoteTickSize: liveQuote?.tickSize,
      liveQuoteBid: liveQuote?.bid,
      liveQuoteAsk: liveQuote?.ask,
      liveQuoteLast: liveQuote?.close,
      candlePrices: latestPreviewPrecisionPrices,
    });
  }, [
    hasLivePreviewQuote,
    instrumentMeta?.digits,
    instrumentMeta?.point,
    instrumentMeta?.tickSize,
    liveQuote?.ask,
    liveQuote?.bid,
    liveQuote?.close,
    liveQuote?.digits,
    liveQuote?.point,
    liveQuote?.tickSize,
    liveQuoteDigitsSource,
    latestPreviewPrecisionPrices,
  ]);
  // Resolve the broker's real price grid before ATR rounding so preview bricks
  // use exactly the same box size as the main chart for this account/symbol.
  const renkoExplicitInstrumentTickSize = (
    instrumentMeta as (Record<string, unknown> & { tick_size?: unknown }) | undefined
  )?.tick_size;
  const renkoMinimumPriceIncrement = useMemo(
    () => resolveRenkoMinimumPriceIncrement(
      [
        renkoExplicitInstrumentTickSize,
        liveQuote?.tickSize,
        instrumentMeta?.tickSize,
        instrumentMeta?.point,
        liveQuote?.point,
      ],
      1 / Math.pow(10, displayDecimals),
    ),
    [
      displayDecimals,
      instrumentMeta?.point,
      instrumentMeta?.tickSize,
      liveQuote?.point,
      liveQuote?.tickSize,
      renkoExplicitInstrumentTickSize,
    ],
  );
  const renkoBrickSize = useMemo(() => {
    if (chartType !== 'renko') {
      return undefined;
    }
    return resolveStableRenkoBrickSize({
      scopeKey: activeBrokerQuerySession?.cacheNamespace ?? ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE,
      symbol,
      timeframe,
      displayDecimals,
      minimumPriceIncrement: renkoMinimumPriceIncrement,
      candles: previewCandles,
    });
  }, [
    activeBrokerQuerySession?.cacheNamespace,
    chartType,
    displayDecimals,
    previewCandles,
    renkoMinimumPriceIncrement,
    symbol,
    timeframe,
  ]);
  const mappedPreviewData = useMemo(
    () => {
      const mapped = mapPreviewCandles(previewCandles, chartType, colors, renkoBrickSize);
      const safeLimit = typeof maxCandles === 'number' && Number.isFinite(maxCandles)
        ? Math.max(1, Math.floor(maxCandles))
        : null;
      // Build Renko from full canonical history first, then limit bricks. Slicing
      // source candles first would change the starting price and every box.
      return chartType === 'renko' && safeLimit !== null
        ? mapped.slice(-safeLimit)
        : mapped;
    },
    [previewCandles, chartType, colors, maxCandles, renkoBrickSize],
  );
  // Brick size is part of render identity: a changed ATR grid must repaint even
  // when the underlying source candle array itself has not changed.
  const previewDataSignature = useMemo(
    () => JSON.stringify({
      candles: previewCandles,
      renkoBrickSize: chartType === 'renko' ? renkoBrickSize : null,
    }),
    [chartType, previewCandles, renkoBrickSize],
  );
  const chartSignature = useMemo(
    () => JSON.stringify({ chartOptions, previewCustomColors, display, chartType, displayDecimals }),
    [chartOptions, previewCustomColors, display, chartType, displayDecimals],
  );
  // Colors are excluded here on purpose: a color-only change recolors the
  // existing chart in place (applyPreviewColors) instead of paying the full
  // candle-history re-injection that made Done feel seconds late.
  const structuralSignature = useMemo(
    () => JSON.stringify({
      previewDataContextKey,
      previewDataGeneration,
      chartType,
      display,
      displayDecimals,
      fullChartParity,
      previewShowsVolumePane,
    }),
    [
      chartType,
      display,
      displayDecimals,
      fullChartParity,
      previewDataContextKey,
      previewDataGeneration,
      previewShowsVolumePane,
    ],
  );
  const structuralSignatureRef = useRef('');
  const drawingSignatureRef = useRef('');
  const lastPreviewLinePriceRef = useRef<number | null>(null);
  const lastPreviewLineDirectionRef = useRef<'up' | 'down'>('up');
  const paneSingleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastViewportCommandRevisionRef = useRef(0);

  const clearPendingPaneSingleTap = useCallback(() => {
    if (!paneSingleTapTimerRef.current) return;
    clearTimeout(paneSingleTapTimerRef.current);
    paneSingleTapTimerRef.current = null;
  }, []);

  const resetWebViewBridgeState = useCallback(() => {
    clearPendingPaneSingleTap();
    setWebViewReady(false);
    chartSignatureRef.current = '';
    structuralSignatureRef.current = '';
    drawingSignatureRef.current = '';
    lastRenderedDataSignatureRef.current = '';
    lastPreviewLinePriceRef.current = null;
    lastPreviewLineDirectionRef.current = 'up';
  }, [clearPendingPaneSingleTap]);

  const recoverWebViewProcess = useCallback(() => {
    resetWebViewBridgeState();
    webViewRef.current?.reload();
  }, [resetWebViewBridgeState]);

  const schedulePaneSingleTap = useCallback((gesture: ChartWindowPaneGesture) => {
    clearPendingPaneSingleTap();
    if (!onTap) return;
    paneSingleTapTimerRef.current = setTimeout(() => {
      paneSingleTapTimerRef.current = null;
      onTap(gesture);
    }, PREVIEW_PANE_DOUBLE_TAP_WINDOW_MS);
  }, [clearPendingPaneSingleTap, onTap]);

  const commitPaneDoubleTap = useCallback((gesture: ChartWindowPaneGesture) => {
    clearPendingPaneSingleTap();
    onDoubleTap?.(gesture);
  }, [clearPendingPaneSingleTap, onDoubleTap]);

  useEffect(() => {
    clearPendingPaneSingleTap();
    return clearPendingPaneSingleTap;
  }, [brokerCredentialScopeKey, clearPendingPaneSingleTap, symbol, timeframe]);

  useEffect(() => {
    // The WebView intentionally survives symbol/timeframe changes, so reset
    // direction memory explicitly. Session changes must also start neutral.
    lastPreviewLinePriceRef.current = null;
    lastPreviewLineDirectionRef.current = 'up';
  }, [brokerCredentialScopeKey, symbol]);

  useEffect(() => {
    if (!webViewReady || !webViewRef.current) return;

    const shouldInit = structuralSignatureRef.current !== structuralSignature;
    const anythingChanged = chartSignatureRef.current !== chartSignature;

    if (shouldInit) {
      const drawingSignature = JSON.stringify([
        drawings,
        drawingsHidden,
        showObjectDescriptions,
        previewDataContextKey,
        previewDataGeneration,
      ]);
      webViewRef.current.injectJavaScript(
        `initChart(${JSON.stringify(chartOptions)}, ${JSON.stringify(chartType)}, ${JSON.stringify(mappedPreviewData)}, ${displayDecimals}, ${JSON.stringify(previewCustomColors)}, ${JSON.stringify(display)}, ${JSON.stringify(previewDataContextKey)}, ${previewDataGeneration}, ${fullChartParity}, ${autoScaleEnabled}, ${verticalScrollingLocked}, ${previewShowsVolumePane}, ${JSON.stringify(drawings)}, ${drawingsHidden}, ${showObjectDescriptions}); true;`,
      );
      structuralSignatureRef.current = structuralSignature;
      chartSignatureRef.current = chartSignature;
      drawingSignatureRef.current = drawingSignature;
      lastRenderedDataSignatureRef.current = previewDataSignature;
      return;
    }

    if (anythingChanged) {
      // Colors-only change — instant in-place recolor, no data payload.
      webViewRef.current.injectJavaScript(
        `if (typeof applyPreviewColors === 'function') applyPreviewColors(${JSON.stringify(chartOptions)}, ${JSON.stringify(previewCustomColors)}, ${JSON.stringify(previewDataContextKey)}, ${previewDataGeneration}); true;`,
      );
      chartSignatureRef.current = chartSignature;
    }

    if (lastRenderedDataSignatureRef.current !== previewDataSignature) {
      webViewRef.current.injectJavaScript(
        `updateChartData(${JSON.stringify(mappedPreviewData)}, ${JSON.stringify(previewDataContextKey)}, ${previewDataGeneration}, false); true;`,
      );
      lastRenderedDataSignatureRef.current = previewDataSignature;
    }
  }, [
    webViewReady,
    previewCandles,
    mappedPreviewData,
    chartOptions,
    chartSignature,
    structuralSignature,
    previewDataContextKey,
    previewDataGeneration,
    previewDataSignature,
    previewCustomColors,
    display,
    chartType,
    displayDecimals,
    fullChartParity,
    autoScaleEnabled,
    verticalScrollingLocked,
    previewShowsVolumePane,
    drawings,
    drawingsHidden,
    showObjectDescriptions,
  ]);

  useEffect(() => {
    if (!webViewReady || !webViewRef.current) return;
    const signature = JSON.stringify([
      drawings,
      drawingsHidden,
      showObjectDescriptions,
      previewDataContextKey,
      previewDataGeneration,
    ]);
    if (drawingSignatureRef.current === signature) return;
    webViewRef.current.injectJavaScript(
      `if (typeof setPreviewSerializedDrawings === 'function') setPreviewSerializedDrawings(${JSON.stringify(drawings)}, ${drawingsHidden}, ${showObjectDescriptions}, ${JSON.stringify(previewDataContextKey)}, ${previewDataGeneration}); true;`,
    );
    drawingSignatureRef.current = signature;
  }, [
    drawings,
    drawingsHidden,
    previewDataContextKey,
    previewDataGeneration,
    showObjectDescriptions,
    webViewReady,
  ]);

  useEffect(() => {
    if (
      !viewportCommand
      || viewportCommand.revision <= lastViewportCommandRevisionRef.current
      || !webViewReady
      || !webViewRef.current
    ) {
      return;
    }
    lastViewportCommandRevisionRef.current = viewportCommand.revision;
    webViewRef.current.injectJavaScript(
      `if (typeof applyPreviewWindowCommand === 'function') applyPreviewWindowCommand(${JSON.stringify(viewportCommand.type)}); true;`,
    );
  }, [viewportCommand, webViewReady]);

  useEffect(() => {
    if (!fullChartParity || !webViewReady || !webViewRef.current) return;
    webViewRef.current.injectJavaScript(
      `
        if (typeof setPreviewChartAutoScaleEnabled === 'function') {
          setPreviewChartAutoScaleEnabled(${autoScaleEnabled});
        }
        if (typeof setPreviewVerticalScrollingLocked === 'function') {
          setPreviewVerticalScrollingLocked(${verticalScrollingLocked});
        }
        true;
      `,
    );
  }, [autoScaleEnabled, fullChartParity, verticalScrollingLocked, webViewReady]);

  // Divided panes follow the full chart's active-candle direction. Standalone
  // settings previews retain their historical last-tick presentation.

  useEffect(() => {
    if (!webViewReady || !webViewRef.current) return;
    const lines: PreviewOverlayPriceLine[] = [...overlayPriceLines];
    const shouldShowSelectedPriceLine =
      display.showLivePriceLine || display.showBidPriceLine || display.showAskPriceLine;
    const selectedPrice = priceSource === 'bid' ? liveQuote?.bid : liveQuote?.ask;
    const hasSelectedPrice = typeof selectedPrice === 'number' && selectedPrice > 0;

    if (shouldShowSelectedPriceLine && hasSelectedPrice) {
      const previousPrice = lastPreviewLinePriceRef.current;
      if (previousPrice !== null && selectedPrice !== previousPrice) {
        lastPreviewLineDirectionRef.current = selectedPrice > previousPrice ? 'up' : 'down';
      }
      lastPreviewLinePriceRef.current = selectedPrice;
    }
    const liveColor = resolvePreviewLivePriceColor({
      fullChartParity,
      latestCandle: latestPreviewCandle,
      fallbackDirection: lastPreviewLineDirectionRef.current,
      colors,
    });

    if (shouldShowSelectedPriceLine && hasSelectedPrice) {
      lines.push({
        price: selectedPrice,
        color: liveColor,
        lineWidth: 1,
        lineStyle: 0,
        axisLabelVisible: true,
        title: '',
        role: 'live',
      });
    }

    webViewRef.current.injectJavaScript(
      `
        if (typeof setPreviewCandleCountdown === 'function') {
          setPreviewCandleCountdown(
            ${JSON.stringify(timeframe)},
            ${candleCountdownActive},
            ${JSON.stringify(
              typeof selectedPrice === 'number' && selectedPrice > 0 ? selectedPrice : null,
            )},
            ${JSON.stringify(liveColor)},
            ${displayDecimals},
            ${JSON.stringify(previewDataContextKey)},
            ${previewDataGeneration}
          );
        }
        if (typeof setPriceLines === 'function') {
          setPriceLines(
            ${JSON.stringify(lines)},
            ${JSON.stringify(previewDataContextKey)},
            ${previewDataGeneration}
          );
        }
        true;
      `,
    );
  }, [
    candleCountdownActive,
    colors.candlesDowntrend,
    colors.candlesUptrend,
    display.showAskPriceLine,
    display.showBidPriceLine,
    display.showLivePriceLine,
    displayDecimals,
    fullChartParity,
    latestPreviewCandle,
    liveQuote?.ask,
    liveQuote?.bid,
    overlayPriceLines,
    priceSource,
    previewDataContextKey,
    previewDataGeneration,
    timeframe,
    webViewReady,
  ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <WebView
        key={PREVIEW_DEV_SOURCE_KEY}
        ref={webViewRef}
        source={{ html: CH_HTML }}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        onMessage={(event) => {
          try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'READY') {
              setWebViewReady(true);
            } else if (
              data.type === 'CHART_READY' &&
              data.dataContextKey === previewDataContextKey &&
              data.dataGeneration === previewDataGeneration
            ) {
              setWebViewReady(true);
            } else if (data.type === 'PANE_TAP') {
              const gesture = resolveChartWindowPaneGesture(
                data,
                previewDataContextKey,
                previewDataGeneration,
                brokerCredentialScopeKey,
              );
              if (gesture) {
                onTapIntent?.(gesture);
                schedulePaneSingleTap(gesture);
              }
            } else if (data.type === 'PANE_DOUBLE_TAP') {
              const gesture = resolveChartWindowPaneGesture(
                data,
                previewDataContextKey,
                previewDataGeneration,
                brokerCredentialScopeKey,
              );
              if (gesture) commitPaneDoubleTap(gesture);
            }
          } catch (_error) {}
        }}
        onLoadStart={resetWebViewBridgeState}
        onContentProcessDidTerminate={recoverWebViewProcess}
        onRenderProcessGone={recoverWebViewProcess}
        scrollEnabled={false}
        bounces={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        cacheEnabled={!__DEV__}
        androidLayerType="hardware"
      />
    </View>
  );
}
