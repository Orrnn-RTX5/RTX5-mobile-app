import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  AreaSeries,
  BarSeries,
  LineSeries,
  HistogramSeries,
  LineStyle,
  LineType,
  ColorType,
  CrosshairMode,
} from 'lightweight-charts';
import { useLiveCandles } from '../../../domain/candles/hooks/useLiveCandles';
import { ChartColorsConfig, ChartDisplaySettings } from '../../../state/userPreferences';
import { useInstrumentMeta } from '../../../query/instruments';
import { hasLiveQuoteFeedData, useMarketData } from '../../../query/websocket';
import {
  buildVolumeDatum,
  getLastPreviewCandleSignature,
  LIVE_CHART_PREVIEW_TIME_SCALE_RIGHT_OFFSET,
  mapPreviewCandles,
  PreviewChartType,
  sanitizePreviewCandles,
  withAlpha,
} from './chartPreviewShared';
import {
  buildRTX5CustomCandlestickSeriesOptions,
  createRTX5CustomCandlestickPaneView,
} from '../../../domain/candles/rendering/customCandlestickSeries';
import { resolveChartDisplayDecimals } from '../chartPricePrecision';
import { useActiveBrokerQuerySession } from '../../../query/authenticatedQueryScope';
import { ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE } from '../../../config/orrnnDemoPublicMarket';
import {
  resolveRenkoMinimumPriceIncrement,
} from '../../../domain/candles/renko';
import { resolveStableRenkoBrickSize } from '../renkoBrickSizeCache';
import {
  resolveAreaChartColor,
  resolveAreaChartDirection,
} from '../areaChartDirection';
import {
  CHART_AREA_LINE_WIDTH,
  CHART_AREA_TIME_SCALE_MIN_BAR_SPACING,
  CHART_DEFAULT_TIME_SCALE_MIN_BAR_SPACING,
} from '../ChartScreen.constants';
import { useAreaChartHistoryExpansion } from '../useAreaChartHistoryExpansion';

const getSafePreviewDimensions = (width: number, height: number) => ({
  width: Math.max(1, Math.floor(width)),
  height: Math.max(1, Math.floor(height)),
});

export default function LiveChartPreviewWeb({
  symbol,
  timeframe,
  colors,
  display,
  priceSource,
  isDark,
  chartType = 'candles',
  active = true,
}: {
  symbol: string;
  timeframe: string;
  colors: ChartColorsConfig;
  display: ChartDisplaySettings;
  priceSource: 'bid' | 'ask';
  isDark: boolean;
  chartType?: PreviewChartType;
  active?: boolean;
}) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<any> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const priceLinesRef = useRef<any[]>([]);
  const lastVolumePointRef = useRef<{ time: number; value: number } | null>(null);
  const previewCandlesRef = useRef<ReturnType<typeof sanitizePreviewCandles>>([]);
  const lastCandleLengthRef = useRef(0);
  const lastAreaViewportFirstTimeRef = useRef<number | null>(null);
  const lastAreaViewportContextRef = useRef('');
  const lastRenderedCandleSignatureRef = useRef('');
  const activeBrokerQuerySession = useActiveBrokerQuerySession();

  const {
    candles,
    hasHistoryCandles,
    loading: historyLoading,
    paginate,
  } = useLiveCandles(symbol, timeframe, active);
  const areaVisibleBarTarget = useAreaChartHistoryExpansion({
    active,
    chartType,
    symbol,
    timeframe,
    cacheScopeKey: activeBrokerQuerySession?.cacheNamespace ?? ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE,
    candleCount: candles.length,
    hasHistoryCandles,
    historyLoading,
    paginate,
  });
  const liveQuotes = useMarketData([symbol], active);
  const liveQuote = liveQuotes[symbol];
  const { data: instrumentMeta } = useInstrumentMeta(symbol, active);
  const liveQuoteDigitsSource = (liveQuote as { digitsSource?: string } | undefined)?.digitsSource;
  const hasLivePreviewQuote = hasLiveQuoteFeedData(liveQuote);

  const previewCandles = useMemo(() => {
    const sanitized = sanitizePreviewCandles(candles);
    // Renko needs the full source path. Area keeps its bounded genuine-close
    // overview; compact OHLC/Line previews retain the established 50-bar tail.
    return chartType === 'renko'
      ? sanitized
      : chartType === 'area'
        ? sanitized.slice(-areaVisibleBarTarget)
        : sanitized.slice(-50);
  }, [areaVisibleBarTarget, candles, chartType]);
  const areaChartDirection = useMemo(
    () => resolveAreaChartDirection(previewCandles),
    [previewCandles],
  );
  const areaChartColor = useMemo(
    () => resolveAreaChartColor(areaChartDirection, colors),
    [areaChartDirection, colors],
  );
  const areaChartColorRef = useRef(areaChartColor);
  areaChartColorRef.current = areaChartColor;
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
  // Use the same broker/session price grid and shared ATR cache as native so a
  // preview never disagrees with the main Renko chart's box boundaries.
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
  const resolvePreviewRenkoBrickSize = useCallback((sourceCandles: typeof previewCandles) => {
    if (chartType !== 'renko') {
      return undefined;
    }
    return resolveStableRenkoBrickSize({
      scopeKey: activeBrokerQuerySession?.cacheNamespace ?? ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE,
      symbol,
      timeframe,
      displayDecimals,
      minimumPriceIncrement: renkoMinimumPriceIncrement,
      candles: sourceCandles,
    });
  }, [
    activeBrokerQuerySession?.cacheNamespace,
    chartType,
    displayDecimals,
    renkoMinimumPriceIncrement,
    symbol,
    timeframe,
  ]);
  const renkoBrickSize = useMemo(
    () => resolvePreviewRenkoBrickSize(previewCandles),
    [previewCandles, resolvePreviewRenkoBrickSize],
  );

  const chartOptions = useMemo(() => ({
    layout: {
      background: { type: ColorType.Solid, color: colors.background },
      textColor: colors.foreground,
      attributionLogo: false,
      fontSize: 11,
    },
    grid: {
      vertLines: { color: display.showGrid ? colors.grid : 'transparent', style: LineStyle.SparseDotted },
      horzLines: { color: display.showGrid ? colors.grid : 'transparent', style: LineStyle.SparseDotted },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: {
        color: colors.foreground,
        width: 1,
        style: LineStyle.Dashed,
        labelBackgroundColor: colors.foreground,
      },
      horzLine: {
        color: colors.foreground,
        width: 1,
        style: LineStyle.Dashed,
        labelBackgroundColor: colors.foreground,
      },
    },
    timeScale: {
      borderColor: display.showGrid ? colors.grid : 'transparent',
      timeVisible: true,
      secondsVisible: false,
      rightOffset: LIVE_CHART_PREVIEW_TIME_SCALE_RIGHT_OFFSET,
      shiftVisibleRangeOnNewBar: true,
      barSpacing: 13,
      minBarSpacing: chartType === 'area'
        ? CHART_AREA_TIME_SCALE_MIN_BAR_SPACING
        : CHART_DEFAULT_TIME_SCALE_MIN_BAR_SPACING,
    },
    rightPriceScale: {
      borderColor: display.showGrid ? colors.grid : 'transparent',
      autoScale: true,
      scaleMargins: {
        top: 0.08,
        // Renko has no source-candle volume pane, so it keeps the price plot's
        // normal bottom margin instead of reserving empty histogram space.
        bottom: chartType !== 'renko' && (display.showTickVolumes || display.showRealVolumes) ? 0.25 : 0.08,
      },
    },
  }), [chartType, colors, display]);

  useEffect(() => {
    previewCandlesRef.current = previewCandles;
  }, [previewCandles]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const rect = chartContainerRef.current.getBoundingClientRect();
    const chart = createChart(chartContainerRef.current, {
      ...chartOptions,
      ...getSafePreviewDimensions(rect.width, rect.height),
    } as any);
    chartRef.current = chart;

    const showLastPriceLine = !!display.showLastPriceLine;
    const priceFormatInfo = {
      type: 'price' as const,
      precision: displayDecimals,
      minMove: 1 / Math.pow(10, displayDecimals),
    };

    // Renko shares the custom OHLC body renderer but intentionally hides wicks;
    // each box represents price movement, not a candle high/low range.
    if (chartType === 'candles' || chartType === 'hollow' || chartType === 'renko') {
      seriesRef.current = chart.addCustomSeries(
        createRTX5CustomCandlestickPaneView(),
        buildRTX5CustomCandlestickSeriesOptions({
          bodyUpColor: chartType === 'hollow' ? colors.hollowBody : colors.candlesUptrend,
          bodyDownColor: chartType === 'hollow' ? colors.hollowBody : colors.candlesDowntrend,
          borderUpColor: colors.candlesUptrend,
          borderDownColor: colors.candlesDowntrend,
          wickUpColor: colors.candlesUptrend,
          wickDownColor: colors.candlesDowntrend,
          wickVisible: chartType !== 'renko',
          lastValueVisible: true,
          priceLineVisible: showLastPriceLine,
          priceFormat: priceFormatInfo,
        }) as any,
      );
    } else if (chartType === 'bars') {
      seriesRef.current = chart.addSeries(BarSeries, {
        upColor: colors.barsUptrend,
        downColor: colors.barsDowntrend,
        lastValueVisible: true,
        priceLineVisible: showLastPriceLine,
        priceFormat: priceFormatInfo,
      });
    } else if (chartType === 'area') {
      // Area is the Line close path plus a light theme-colored gradient fill.
      const areaLineColor = areaChartColorRef.current;
      seriesRef.current = chart.addSeries(AreaSeries, {
        lineColor: areaLineColor,
        topColor: withAlpha(areaLineColor, 0.32),
        bottomColor: withAlpha(areaLineColor, 0.04),
        lineWidth: CHART_AREA_LINE_WIDTH,
        lineType: LineType.Simple,
        crosshairMarkerVisible: true,
        lastValueVisible: true,
        priceLineVisible: showLastPriceLine,
        priceFormat: priceFormatInfo,
      });
    } else {
      seriesRef.current = chart.addSeries(LineSeries, {
        color: colors.lineBody,
        lineWidth: 2,
        crosshairMarkerVisible: true,
        lastValueVisible: true,
        priceLineVisible: showLastPriceLine,
        priceFormat: priceFormatInfo,
      });
    }

    // Do not attach source-candle volume to synthetic Renko brick timestamps.
    if (chartType !== 'renko' && (display.showTickVolumes || display.showRealVolumes)) {
      volumeSeriesRef.current = chart.addSeries(HistogramSeries, {
        color: buildVolumeDatum(
          { time: 0, open: 0, close: 1, volume: 0 },
          colors,
        ).color,
        priceFormat: { type: 'volume' as any },
        priceScaleId: 'volume',
        priceLineVisible: false,
        lastValueVisible: false,
      } as any);
      chart.priceScale('volume' as any).applyOptions({
        scaleMargins: { top: 0.84, bottom: 0.02 },
        visible: false,
      } as any);
    } else {
      volumeSeriesRef.current = null;
    }

    const handleResize = () => {
      if (!chartRef.current || !chartContainerRef.current) return;
      const nextRect = chartContainerRef.current.getBoundingClientRect();
      chartRef.current.applyOptions(getSafePreviewDimensions(nextRect.width, nextRect.height));
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      priceLinesRef.current = [];
      lastVolumePointRef.current = null;
      volumeSeriesRef.current = null;
      seriesRef.current = null;
      chart.remove();
      chartRef.current = null;
    };
  }, [chartType, chartOptions, colors, display, displayDecimals]);

  useEffect(() => {
    if (chartType !== 'area' || !seriesRef.current) {
      return;
    }

    try {
      seriesRef.current.applyOptions({
        lineColor: areaChartColor,
        topColor: withAlpha(areaChartColor, 0.32),
        bottomColor: withAlpha(areaChartColor, 0.04),
      });
    } catch (_error) {
      // A concurrent chart-type or route change may already own disposal.
    }
  }, [areaChartColor, chartType]);

  useEffect(() => {
    if (!seriesRef.current) return;

    const previousLength = lastCandleLengthRef.current;
    const previousFirstTime = lastAreaViewportFirstTimeRef.current;
    const previousVisibleRange = chartRef.current?.timeScale().getVisibleLogicalRange() ?? null;
    const lastSignature = getLastPreviewCandleSignature(previewCandles);
    const mappedData = mapPreviewCandles(previewCandles, chartType, colors, renkoBrickSize);

    // Transform the full Renko path first and only then bound the visible brick
    // tail; slicing source candles first would rebuild a different chart.
    seriesRef.current.setData((chartType === 'renko' ? mappedData.slice(-50) : mappedData) as any);

    if (volumeSeriesRef.current) {
      const volumeData = previewCandles.map((candle, index) =>
        buildVolumeDatum(candle, colors, index === previewCandles.length - 1),
      );
      volumeSeriesRef.current.setData(volumeData as any);
      lastVolumePointRef.current =
        volumeData.length > 0
          ? { time: volumeData[volumeData.length - 1].time, value: volumeData[volumeData.length - 1].value }
          : null;
    } else {
      lastVolumePointRef.current = null;
    }

    if (chartRef.current && previewCandles.length > 0) {
      if (chartType === 'area') {
        const viewportContext = `${symbol}:${timeframe}:area`;
        const nextFirstTime = previewCandles[0]?.time ?? null;
        const previousDefaultBars = Math.min(previousLength, areaVisibleBarTarget);
        const nextDefaultBars = Math.min(previewCandles.length, areaVisibleBarTarget);
        const previousRightEdge = Math.max(0.5, previousLength - 0.5)
          + LIVE_CHART_PREVIEW_TIME_SCALE_RIGHT_OFFSET;
        const previousSpan = previousVisibleRange
          ? previousVisibleRange.to - previousVisibleRange.from
          : 0;
        const untouchedPrepend = Boolean(
          previousVisibleRange
          && previousLength > 0
          && nextFirstTime !== null
          && previousFirstTime !== null
          && nextFirstTime < previousFirstTime
          && previousVisibleRange.to >= previousRightEdge - 1.25
          && nextDefaultBars > previousDefaultBars
          && Math.abs(previousSpan - previousDefaultBars)
            <= Math.max(2, previousDefaultBars * 0.03),
        );
        if (
          lastAreaViewportContextRef.current !== viewportContext
          || previousLength === 0
          || untouchedPrepend
        ) {
          const rightEdge = Math.max(0.5, previewCandles.length - 0.5)
            + LIVE_CHART_PREVIEW_TIME_SCALE_RIGHT_OFFSET;
          chartRef.current.timeScale().applyOptions({
            minBarSpacing: CHART_AREA_TIME_SCALE_MIN_BAR_SPACING,
          });
          chartRef.current.timeScale().setVisibleLogicalRange({
            from: Math.max(-0.5, rightEdge - nextDefaultBars),
            to: rightEdge,
          });
        }
        lastAreaViewportContextRef.current = viewportContext;
        lastAreaViewportFirstTimeRef.current = nextFirstTime;
      } else {
        chartRef.current.timeScale().fitContent();
        lastAreaViewportContextRef.current = '';
        lastAreaViewportFirstTimeRef.current = null;
      }
    }
    lastCandleLengthRef.current = previewCandles.length;
    lastRenderedCandleSignatureRef.current = lastSignature;
  }, [
    areaVisibleBarTarget,
    chartType,
    colors,
    previewCandles,
    renkoBrickSize,
    symbol,
    timeframe,
  ]);

  useEffect(() => {
    if (!seriesRef.current) return;

    priceLinesRef.current.forEach((priceLine) => {
      try { seriesRef.current?.removePriceLine(priceLine); } catch (_error) {}
    });
    priceLinesRef.current = [];

    const shouldShowSelectedPriceLine = display.showBidPriceLine || display.showAskPriceLine;
    const selectedPrice = priceSource === 'bid' ? liveQuote?.bid : liveQuote?.ask;

    if (shouldShowSelectedPriceLine && typeof selectedPrice === 'number' && selectedPrice > 0) {
      try {
        const selectedLine = seriesRef.current.createPriceLine({
          price: selectedPrice,
          color: priceSource === 'bid' ? '#2962FF' : '#EF5350',
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: false,
          title: priceSource === 'bid' ? 'Bid' : 'Ask',
        });
        priceLinesRef.current.push(selectedLine);
      } catch (_error) {}
    }
  }, [display.showBidPriceLine, display.showAskPriceLine, liveQuote?.bid, liveQuote?.ask, priceSource]);

  useEffect(() => {
    const syncSeriesFromCandles = (sourceCandles: ReturnType<typeof sanitizePreviewCandles>) => {
      if (!seriesRef.current) return;

      const mappedData = mapPreviewCandles(
        sourceCandles,
        chartType,
        colors,
        resolvePreviewRenkoBrickSize(sourceCandles),
      );
      // A live source update can rebuild multiple Renko boxes, so replace the
      // bounded transformed tail instead of updating one raw candle in place.
      seriesRef.current.setData((chartType === 'renko' ? mappedData.slice(-50) : mappedData) as any);

      if (volumeSeriesRef.current) {
        const volumeData = sourceCandles.map((candle, index) =>
          buildVolumeDatum(candle, colors, index === sourceCandles.length - 1),
        );
        volumeSeriesRef.current.setData(volumeData as any);
        lastVolumePointRef.current =
          volumeData.length > 0
            ? { time: volumeData[volumeData.length - 1].time, value: volumeData[volumeData.length - 1].value }
            : null;
      }

      lastCandleLengthRef.current = sourceCandles.length;
      lastRenderedCandleSignatureRef.current = getLastPreviewCandleSignature(sourceCandles);
    };

    syncSeriesFromCandles(previewCandlesRef.current);
  }, [candles, symbol, timeframe, chartType, colors, resolvePreviewRenkoBrickSize]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
    </View>
  );
}
