import { makeStyles } from './ChartScreen.web.styles';
import { FastPressable as Pressable } from '../../ui/components/FastPressable';
import { markTradeIntent } from '../../utils/tradeIntent';
/**
 * Core Charting Interface for Web
 * 
 * This component represents the primary technical analysis interface for the browser.
 * It directly integrates TradingView's lightweight-charts library onto a native DOM element.
 * 
 * Key Architecture:
 * - Real-time Data: Subscribes directly to WebSocket feeds (candlesSocket/quotesSocket) bypassing React render cycles.
 * - Hardware Acceleration: Uses requestAnimationFrame (rAF) queues for injecting backend candle snapshots directly into the canvas.
 * - Micro-Components: Isolated components (like LivePriceHeader) to prevent full DOM tree re-renders on every price tick.
 * - Drawing Manager: Bridges native interaction onto the chart canvas.
 */
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { router, useFocusEffect } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { ActivityIndicator, Alert, LayoutChangeEvent, ScrollView, Text, TextInput, View, Image, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ActionSheet } from '../../ui/components/ActionSheet';
import { runCriticalTradeAction, runImmediateAction } from '../../utils/actionLatency';
import { hideChartConfigDestination } from './chartConfigDestinationController';
import { showChartSettingsHost } from './chartSettingsHostController';
import { scheduleIdleWork } from '../../utils/startupScheduler';
import {
  TvCrosshair, TvTrendLine, TvFib, TvText, TvMeasure, TvZoom, TvPencil, TvLock, TvHide, TvTrash, TvLayers,
  TvCandles, TvGrid4, TvUndo, TvRedo, TvSaveSquare, TvPrediction, TvStayInDrawingMode, TvRadialObjects
} from './components/ChartToolbarIcons';
import { ChartCandleCountdownBadge } from './components/ChartCandleCountdownBadge.web';
import { DrawingToolsManager } from './plugins/drawing-tools-manager';
import { Screen } from '../../ui/components/Screen';
import {
  resolveChartColorsForTheme,
  useUserPreferences,
  type ChartVisualType,
} from '../../state/userPreferences';
import { useIsDarkTheme } from '../../state/themeMode';
import { resolveTradingLogin, useResolvedTradingLogin } from '../../state/tradingLogin';
import { useUIState } from '../../state/uiState';
import { fmt } from '../../utils/format';
import { formatBackendPrice } from '../../utils/backendPrice';
import { formatBackendDailyChange } from '../../utils/backendDailyChange';
import { spacing } from '../../ui/theme/index';
import { useTheme } from '../../ui/theme/useTheme';
import { GDark, GLight } from '../../ui/theme/glass';
import { useLiveCandles, useLiveTick } from '../../domain/candles/hooks/useLiveCandles';
import { liveCandleStream as liveCandlesEngine } from '../../domain/candles/stream/liveCandleStream';
import { useLiveAccountState } from '../../state/liveAccountState';
import { useOrdersByLoginQuery, usePlaceOrderExecutor } from '../../query/orders';
import { usePendingOrdersQuery } from '../../query/pendingOrders';
import { pendingOrdersToChartOrders } from '../trade/pendingOrderPresentation';
import { createMarketOrderIntentId } from '../../api/orders/marketOrderInFlight';
import { ChartTradeReceiptStack } from './components/ChartTradeReceiptStack';
import { useMarketTradeReceipts } from '../trade/useMarketTradeReceipts';
import { useLatestDailyCandle } from '../../domain/candles/query/candles';
import { useMarketSymbols } from '../../query/market';
import { buildAvailableChartSymbols, resolveBrokerChartSymbol } from './chartBrokerSymbols';
import { useAccountSummary } from '../../query/account';
import { useInstrumentMeta } from '../../query/instruments';
import { useActiveBrokerQuerySession } from '../../query/authenticatedQueryScope';
import { ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE } from '../../config/orrnnDemoPublicMarket';
import {
  createChart,
  createSeriesMarkers,
  IChartApi,
  ISeriesApi,
  ColorType,
  CrosshairMode,
  AreaSeries,
  BarSeries,
  LineSeries,
  LineStyle,
  LineType,
  HistogramSeries,
} from 'lightweight-charts';
import { usePositionsState } from '../../state/positionsState';
import {
  captureActiveBrokerSessionProvenance,
} from '../../state/activeBrokerSession';
import { TradingSignalDetailsModal } from './TradingSignalDetailsModal';
import { hasLiveQuoteFeedData, useMarketData } from '../../query/websocket';
import { useExecutableQuote } from '../quotes/useExecutableQuote';
import { resolveChartTradeQuoteAvailability } from './components/ChartTradeButtonsFeature/tradeAvailability';
import {
  quoteActionBlockMessage,
  recordBlockedPriceAction,
  resolveSessionQuoteActionAvailability,
} from '../../market/quoteIntegrity';
import { LiveClock } from '../../ui/components/LiveClock';
import { classifyTradingError, createFrontendTradingError } from '../../api/tradingErrors';
import { usePositionHistoryQuery } from '../../query/positions';
import { useChartDealsQuery } from '../../query/deals';
import { useAlertsQuery } from '../../query/alerts';
import { requestOrrnnDemoTradeAuth } from '../trade/tradeAuthPrompt';
import {
  buildRTX5CustomCandlestickSeriesOptions,
  createRTX5CustomCandlestickPaneView,
  mapCandlesToRTX5CustomCandlestickData,
} from '../../domain/candles/rendering/customCandlestickSeries';
import {
  buildRenkoBricks,
  resolveRenkoMinimumPriceIncrement,
} from '../../domain/candles/renko';
import { resolveStableRenkoBrickSize } from './renkoBrickSizeCache';
import {
  buildChartSeriesSnapshot,
  EMPTY_CHART_SERIES_SNAPSHOT,
  getChartSeriesUpdateMode,
} from './liveChartSync';
import { buildChartOverlayPayload } from './chartOverlays';
import { resolveChartDisplayDecimals } from './chartPricePrecision';
import {
  resolveAreaChartColor,
  resolveAreaChartDirectionForRange,
} from './areaChartDirection';
import {
  filterCandlesForChartTimeRange,
  getChartTimeRangeLabel,
  resolveChartVisibleRange,
  type ChartTimeRange,
} from './timeRangePresets';
import { useShallow } from 'zustand/shallow';
import { calculateMarketSentiment } from '../../domain/marketSentiment';
import { normalizeSymbol, normalizeTimeframeStrict } from '../../domain/candles/core/candles';
import { sanitizeCandlesForChart } from '../../domain/candles/normalization/chartAdapter';
import {
  formatTradeVolume,
  incrementTradeVolume,
  normalizeTradeVolume,
  sanitizeTradeVolumeDraft,
} from '../../utils/tradeVolume';
import type { TradeSide } from '../../domain/tradeSide';
import { buildChartMarketOrderPayload, getChartTradeAction } from './chartTradeActions';
import { resolveChartTradeButtonQuote } from './components/ChartTradeButtonsFeature/quoteFallback';
import {
  SYMBOL_FLAGS,
  SYMBOL_LOGOS,
  resolveChartSymbolCategory,
  resolveChartSymbolFullName,
  resolveChartSymbolKey,
} from './chartSymbolMetadata';
import {
  CHART_AREA_TIME_SCALE_MIN_BAR_SPACING,
  CHART_AREA_LINE_WIDTH,
  CHART_BEARISH_CANDLE_RENDER_OPACITY,
  CHART_CANDLE_RENDER_OPACITY,
  CHART_SYMBOL_PICKER_PREFETCH_DELAY_MS,
  CHART_SYMBOL_PICKER_PREFETCH_LIMIT,
  CHART_DEFAULT_TIME_SCALE_BAR_SPACING,
  CHART_DEFAULT_TIME_SCALE_MIN_BAR_SPACING,
  CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH,
  CHART_TIME_SCALE_FIX_LEFT_EDGE,
  CHART_TIME_SCALE_FIX_RIGHT_EDGE,
} from './ChartScreen.constants';
import { useAreaChartHistoryExpansion } from './useAreaChartHistoryExpansion';
const timeframes = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN'];
const CHART_OHLC_NEUTRAL_DARK_COLOR = '#FFFFFF';
const CHART_OHLC_NEUTRAL_LIGHT_COLOR = '#0F172A';
const CHART_OHLC_HIGH_COLOR = GDark.trading.profit;
const CHART_OHLC_LOW_COLOR = '#F23645';

const applyWebAreaRecentViewport = (
  chart: IChartApi,
  dataLength: number,
  visibleBarTarget: number,
): void => {
  if (!(dataLength > 0)) return;
  const visibleBars = Math.min(dataLength, Math.max(1, Math.round(visibleBarTarget)));
  const rightEdge = Math.max(0.5, dataLength - 0.5);
  chart.timeScale().applyOptions({
    minBarSpacing: CHART_AREA_TIME_SCALE_MIN_BAR_SPACING,
  });
  chart.timeScale().setVisibleLogicalRange({
    from: Math.max(-0.5, rightEdge - visibleBars),
    to: rightEdge,
  });
};

const shouldExpandUntouchedWebAreaViewport = (input: Readonly<{
  previousLength: number;
  nextLength: number;
  previousFirstTime: number | null;
  nextFirstTime: number | null;
  previousRange: { from: number; to: number } | null;
  visibleBarTarget: number;
}>): boolean => {
  if (
    !input.previousRange
    || input.previousLength <= 0
    || input.nextLength <= input.previousLength
    || input.previousFirstTime === null
    || input.nextFirstTime === null
    || input.nextFirstTime >= input.previousFirstTime
  ) {
    return false;
  }

  const priorRightEdge = Math.max(0.5, input.previousLength - 0.5);
  if (input.previousRange.to < priorRightEdge - 1.25) {
    return false;
  }
  const priorDefaultBars = Math.min(input.previousLength, input.visibleBarTarget);
  const nextDefaultBars = Math.min(input.nextLength, input.visibleBarTarget);
  const span = input.previousRange.to - input.previousRange.from;
  const tolerance = Math.max(2, priorDefaultBars * 0.03);
  return nextDefaultBars > priorDefaultBars && Math.abs(span - priorDefaultBars) <= tolerance;
};



type VolumeSourceCandle = {
  time: number;
  open: number;
  close: number;
  volume?: number;
};

const withAlpha = (color: string | undefined, alpha: number): string => {
  if (!color) {
    return `rgba(148, 163, 184, ${alpha})`;
  }

  const trimmed = color.trim();

  if (trimmed.startsWith('rgba(')) {
    const parts = trimmed.slice(5, -1).split(',').map((part) => part.trim());
    if (parts.length >= 3) {
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
    }
  }

  if (trimmed.startsWith('rgb(')) {
    const parts = trimmed.slice(4, -1).split(',').map((part) => part.trim());
    if (parts.length >= 3) {
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
    }
  }

  let hex = trimmed.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map((char) => char + char).join('');
  }

  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  return trimmed;
};

const getVolumeBarColor = (
  candle: Pick<VolumeSourceCandle, 'open' | 'close'>,
  colors: { candlesUptrend?: string; candlesDowntrend?: string } | null | undefined,
  isActive: boolean = false,
): string => {
  const baseColor =
    candle.close >= candle.open
      ? colors?.candlesUptrend ?? '#2962FF'
      : colors?.candlesDowntrend ?? '#EF5350';

  return withAlpha(baseColor, isActive ? 0.78 : 0.32);
};

const buildVolumeDatum = (
  candle: VolumeSourceCandle,
  colors: { candlesUptrend?: string; candlesDowntrend?: string } | null | undefined,
  isActive: boolean = false,
  minValue?: number,
) => {
  const rawValue = Math.max(Number(candle.volume ?? 0), 0);
  const value = typeof minValue === 'number' ? Math.max(minValue, rawValue) : rawValue;

  return {
    time: candle.time,
    value,
    color: getVolumeBarColor(candle, colors, isActive),
  };
};

// Micro-component: isolated 4fps render cycle, 0 DOM depth
const LivePriceHeader = React.memo(({ symbol, styles, displayDecimals, priceSource, active = true }: any) => {
  const T = useTheme({ active });
  const liveQuotes = useMarketData([symbol], active);
  const q = liveQuotes[symbol] || {};
  const selectedQuote =
    priceSource === 'ask'
      ? (typeof q.ask === 'number' && q.ask > 0 ? q.ask : null)
      : (typeof q.bid === 'number' && q.bid > 0 ? q.bid : null);
  const currentPrice = selectedQuote;
  if (currentPrice === null) return <View style={styles.priceSection}><Text style={[styles.livePriceText, { fontWeight: '700', opacity: 0.9 }]}>---</Text></View>;
  const priceLabel = resolveSessionQuoteActionAvailability(q).allowed
    ? 'LIVE PRICE'
    : 'DELAYED SNAPSHOT';
  return (
    <View style={styles.priceSection}>
      <Text style={[styles.symbolText, { textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 2, opacity: 0.9 }]}>{priceLabel}</Text>
      <Text style={styles.livePriceText}>{formatBackendPrice(currentPrice)}</Text>
      {(() => {
        const changePct = q.changePct;
        const hasDailyChange = typeof changePct === 'number' && Number.isFinite(changePct);
        const isUp = typeof changePct === 'number' && changePct >= 0;
        return (
          <Text style={[styles.priceChangePct, { color: hasDailyChange ? (isUp ? T.trading.profit : '#F23645') : T.textMuted }]}>
            {formatBackendDailyChange(changePct)}
          </Text>
        );
      })()}
    </View>
  );
});



// Micro-component: isolated 4fps render cycle, 0 DOM depth
const LiveTradeButtons = React.memo(({ symbol, styles, displayDecimals, lotSize, createTradeReceipt, active = true }: any) => {
  const {
    quote: liveQuote,
    getCurrentExecutableQuoteState,
  } = useExecutableQuote(symbol, active, 16);
  const latestBid = typeof liveQuote?.bid === 'number' && liveQuote.bid > 0 ? liveQuote.bid : 0;
  const latestAsk = typeof liveQuote?.ask === 'number' && liveQuote.ask > 0 ? liveQuote.ask : 0;

  const isPublicDemoTradePrompt = useUserPreferences(
    (state) => !state.isLoggedIn,
  );
  const quoteActionAvailability = resolveChartTradeQuoteAvailability({
    quote: liveQuote,
    isPublicDemoTradePrompt,
  });
  const placeOrder = usePlaceOrderExecutor();
  const sellAction = getChartTradeAction('sell');
  const buyAction = getChartTradeAction('buy');

  const handleTrade = (side: TradeSide) => {
    // Tap time for the Journal's order latency telemetry.
    markTradeIntent();
    if (requestOrrnnDemoTradeAuth({
      kind: useUserPreferences.getState().oneClickAccepted ? 'market-order' : 'order-ticket',
      symbol,
      side,
      origin: 'chart',
    })) {
      return;
    }
    if (!useUserPreferences.getState().oneClickAccepted) {
      router.navigate({
        pathname: '/trade/order-ticket',
        params: { symbol, side, origin: 'chart' },
      });
      return;
    }
    const action = getChartTradeAction(side);
    const currentQuote = getCurrentExecutableQuoteState();
    const currentQuoteAvailability = resolveChartTradeQuoteAvailability({
      quote: currentQuote.quote,
      isPublicDemoTradePrompt,
    });
    if (!currentQuoteAvailability.allowed) {
      recordBlockedPriceAction('chart_web_market_order', currentQuoteAvailability);
      Alert.alert('Market Data Unavailable', quoteActionBlockMessage(currentQuoteAvailability));
      return;
    }
    const actionProvenance = captureActiveBrokerSessionProvenance();
    if (!actionProvenance) {
      const feedback = createFrontendTradingError(
        'Sign In Required',
        'Please sign in to the active broker account before placing an order.',
      );
      Alert.alert(feedback.title, feedback.message);
      return;
    }
    const tradingLogin = resolveTradingLogin();
    if (!tradingLogin || String(tradingLogin) !== actionProvenance.identity.accountLogin) {
      const feedback = createFrontendTradingError(
        'Account Error',
        'The app could not resolve the active trading account from local state. Select an account and try again.',
      );
      Alert.alert(feedback.title, feedback.message);
      return;
    }

    const payload = { ...buildChartMarketOrderPayload({
      accountLogin: tradingLogin,
      symbol,
      side: action.side,
      volume: Number(lotSize),
    }), frontendIntentId: createMarketOrderIntentId() };
    placeOrder(
      payload,
      createTradeReceipt({ symbol, side: action.side, volume: Number(lotSize) }, actionProvenance.cacheNamespace),
    );

  };

  return (
    <View style={styles.tradeControlsRow}>
      <Pressable
        style={[styles.actionBtn, styles.actionBtnSell, !quoteActionAvailability.allowed && { opacity: 0.5 }]}
        disabled={!quoteActionAvailability.allowed}
        onPress={() => runCriticalTradeAction('chart.web.trade.sell', () => handleTrade('sell'))}
        activateOnPressIn
        activateOnTouchStart
        unstable_pressDelay={0}
        accessibilityRole="button"
        accessibilityLabel={sellAction.accessibilityLabel}
        testID={sellAction.testID}
      >
        <View style={styles.actionBtnHeader}>
          <Text style={[styles.actionBtnLabelTitle, styles.actionBtnLabelSell]}>{sellAction.displayLabel}</Text>
          <Ionicons name="chevron-down" size={16} color="#FFF" />
        </View>
        <Text style={styles.actionBtnPriceText}>@ {latestBid > 0 ? formatBackendPrice(latestBid) : '--'}</Text>
      </Pressable>

      <View style={styles.actionSpacer} />

      <Pressable
        style={[styles.actionBtn, styles.actionBtnBuy, !quoteActionAvailability.allowed && { opacity: 0.5 }]}
        disabled={!quoteActionAvailability.allowed}
        onPress={() => runCriticalTradeAction('chart.web.trade.buy', () => handleTrade('buy'))}
        activateOnPressIn
        activateOnTouchStart
        unstable_pressDelay={0}
        accessibilityRole="button"
        accessibilityLabel={buyAction.accessibilityLabel}
        testID={buyAction.testID}
      >
        <View style={styles.actionBtnHeader}>
          <Ionicons name="chevron-up" size={16} color="#FFF" />
          <Text style={[styles.actionBtnLabelTitle, styles.actionBtnLabelBuy]}>{buyAction.displayLabel}</Text>
        </View>
        <Text style={styles.actionBtnPriceText}>@ {latestAsk > 0 ? formatBackendPrice(latestAsk) : '--'}</Text>
      </Pressable>
    </View>
  );
});

// Micro-component: isolated 4fps render cycle, 0 DOM depth
const LiveTvLegend = React.memo(({ symbol, styles, displayDecimals, candles, active = true }: any) => {
  const T = useTheme({ active });
  const latestTick = useLiveTick(symbol, undefined, active);
  const liveQuotes = useMarketData([symbol], active);
  if (!latestTick || candles.length < 2) return null;

  const latestBid = latestTick.close;
  const changePct = liveQuotes[symbol]?.changePct;
  const hasDailyChange = typeof changePct === 'number' && Number.isFinite(changePct);
  const isUp = typeof changePct === 'number' && changePct >= 0;

  return (
    <View style={styles.tvLegendContainer} pointerEvents="box-none">
      <View>
        <View style={styles.tvLegendRow}>
          <Text style={[styles.tvLegendPriceChange, { fontWeight: '500', color: hasDailyChange ? (isUp ? T.trading.profit : '#F23645') : T.textMuted }]}>
            {formatBackendPrice(latestBid || 0)} {formatBackendDailyChange(changePct)}
          </Text>
        </View>
      </View>
    </View>
  );
});

const CustomDatePicker = ({ visible, onClose, onSelectDate, bg, text, accent, borderColor }: any) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  if (!visible) return null;

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const startDay = firstDay === 0 ? 6 : firstDay - 1;

  const handlePrev = (e: any) => { e.stopPropagation(); setCurrentDate(new Date(year, month - 1, 1)); };
  const handleNext = (e: any) => { e.stopPropagation(); setCurrentDate(new Date(year, month + 1, 1)); };

  const days = [];
  for (let i = 0; i < startDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));

  return (
    <>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9998, backgroundColor: 'rgba(0,0,0,0.3)' }} onClick={onClose} />
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 9999,
        backgroundColor: bg,
        border: `1px solid ${borderColor || accent}`,
        padding: 20,
        borderRadius: 16,
        width: 'min(300px, calc(100vw - 32px))',
        boxSizing: 'border-box',
        maxHeight: 'calc(100vh - 32px)',
        overflowY: 'auto',
        color: text,
        boxShadow: '0 12px 48px rgba(0,0,0,0.6)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, alignItems: 'center' }}>
          <Text style={{ color: text, fontWeight: '700', fontSize: 14 }}>{currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</Text>
          <div style={{ display: 'flex', gap: 12 }}>
            <Ionicons name="arrow-up" size={16} color={text} style={{ cursor: 'pointer' }} onClick={handlePrev} />
            <Ionicons name="arrow-down" size={16} color={text} style={{ cursor: 'pointer' }} onClick={handleNext} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center', fontSize: 11, marginBottom: 8, color: accent, fontWeight: '600' }}>
          {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => <div key={d}>{d}</div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, textAlign: 'center', fontSize: 13 }}>
          {days.map((d, i) => (
            <div key={i}
              onClick={(e) => { e.stopPropagation(); if (d) { onSelectDate(d); onClose(); } }}
              style={{
                padding: '6px 0',
                cursor: d ? 'pointer' : 'default',
                borderRadius: 6,
                backgroundColor: d && d.getDate() === new Date().getDate() && d.getMonth() === new Date().getMonth() ? accent : 'transparent',
                color: d && d.getDate() === new Date().getDate() && d.getMonth() === new Date().getMonth() ? '#FFF' : text,
                opacity: d ? 1 : 0
              }}>
              {d ? d.getDate() : ''}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, fontSize: 13, cursor: 'pointer', fontWeight: '600' }}>
          <Text style={{ color: accent }} onPress={(e: any) => { e.stopPropagation(); onClose(); }}>Clear</Text>
          <Text style={{ color: accent }} onPress={(e: any) => { e.stopPropagation(); onSelectDate(new Date()); onClose(); }}>Today</Text>
        </div>
      </div>
    </>
  );
};

const mapTf = (tf: string) => {
  if (tf.startsWith('M') && tf !== 'MN') return tf.replace('M', '') + ' m';
  if (tf.startsWith('H')) return tf.replace('H', '') + ' h';
  if (tf === 'D1') return '1 d';
  if (tf === 'W1') return '1 w';
  if (tf === 'MN') return '1 M';
  return tf;
};

const CHART_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const resolveChartDate = (value: number | string): Date | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      value = numeric;
    } else {
      const parsed = new Date(trimmed);
      return Number.isFinite(parsed.getTime()) ? parsed : null;
    }
  }

  if (!Number.isFinite(value)) return null;

  const absValue = Math.abs(value);
  if (absValue > 4.2e16) return new Date(Math.floor(value / 1_000_000));
  if (absValue > 4.2e13) return new Date(Math.floor(value / 1_000));
  if (absValue > 4.2e10) return new Date(value);
  return new Date(value * 1000);
};

const formatChartTickLabel = (value: number | string, includeDate: boolean): string => {
  const date = resolveChartDate(value);
  if (!date || !Number.isFinite(date.getTime())) return '';

  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = CHART_MONTHS[date.getUTCMonth()] || '';
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');

  if (!includeDate) {
    return `${hours}:${minutes}`;
  }

  return `${day} ${month} ${hours}:${minutes}`;
};

/** Format a Unix timestamp into a short time label for the x-axis */
const formatXLabel = (time: number, tf: string): string => {
  const d = resolveChartDate(time);
  if (!d) return '';
  if (['D1', 'W1', 'MN'].includes(tf)) {
    return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
  }
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

const getLastCandleSignature = (candles: Array<{ time: number; open: number; high: number; low: number; close: number; volume?: number }>) => {
  const candle = candles[candles.length - 1];
  if (!candle) return '';
  return `${candle.time}:${candle.open}:${candle.high}:${candle.low}:${candle.close}:${candle.volume ?? 0}`;
};

const mapWebChartData = (
  sourceCandles: Array<{ time: number; open: number; high: number; low: number; close: number; volume?: number }>,
  chartType: ChartVisualType,
  colors: ReturnType<typeof resolveChartColorsForTheme>,
  renkoBrickSize?: number,
) => {
  const uniqueData = sourceCandles.map((item) => ({
    ...item,
    volume: item.volume ?? 0,
  }));
  // Renko is path-dependent, so build bricks from the complete source history
  // before choosing the Lightweight Charts data shape.
  const renderedData = chartType === 'renko'
    ? buildRenkoBricks(uniqueData, { brickSize: renkoBrickSize })
    : uniqueData;

  // Line and Area share the same close-price path; Area differs only in how the
  // series paints the gradient below that path.
  if (chartType === 'line' || chartType === 'area') {
    return renderedData.map((item) => ({
      time: item.time,
      value: item.close,
      open: item.open,
      close: item.close,
      volume: item.volume,
    }));
  }

  // Completed/projected Renko bricks already have an OHLC shape, so they reuse
  // the custom candle body renderer with wicks disabled when the series is made.
  if (chartType === 'candles' || chartType === 'hollow' || chartType === 'renko') {
    return mapCandlesToRTX5CustomCandlestickData({
      candles: renderedData,
      bullishColor: colors.candlesUptrend,
      bearishColor: colors.candlesDowntrend,
    });
  }

  return renderedData;
};

// This one-candle shortcut is for time-based modes. Renko live updates select
// the final brick from a full-history transform because its path needs context.
const mapWebChartTick = (
  candle: { time: number; open: number; high: number; low: number; close: number; volume?: number },
  chartType: ChartVisualType,
  colors: ReturnType<typeof resolveChartColorsForTheme>,
  renkoBrickSize?: number,
) => mapWebChartData([candle], chartType, colors, renkoBrickSize)[0];

const getSafeChartDimensions = (width: number, height: number) => ({
  width: Math.max(1, Math.floor(width)),
  height: Math.max(1, Math.floor(height)),
});

const getContainerChartDimensions = (container: { clientWidth: number; clientHeight: number }) =>
  getSafeChartDimensions(container.clientWidth - 4, container.clientHeight - 8);



export function ChartScreen() {
  const { controller: tradeReceiptController, createTradeReceipt } = useMarketTradeReceipts();
  const isScreenFocused = useIsFocused();
  const T = useTheme();
  const isDark = useIsDarkTheme();
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const BLUE = T.trading.buy.primary;
  const RED = T.trading.sell.primary;
  const TEXT_MUTED = T.textMuted;
  const {
    chartSymbol,
    chartTimeframe,
    chartVisualType,
    priceSource,
    chartColors,
    chartColorScheme,
    chartDisplay,
    tradeVolume,
    setChartTimeframe,
    setChartVisualType,
    setChartSymbol,
    setTradeVolume,
  } = useUserPreferences(
    useShallow((state) => ({
      chartSymbol: state.chartSymbol,
      chartTimeframe: state.chartTimeframe,
      chartVisualType: state.chartVisualType,
      priceSource: state.priceSource,
      chartColors: state.chartColors,
      chartColorScheme: state.chartColorScheme,
      chartDisplay: state.chartDisplay,
      tradeVolume: state.tradeVolume,
      setChartTimeframe: state.setChartTimeframe,
      setChartVisualType: state.setChartVisualType,
      setChartSymbol: state.setChartSymbol,
      setTradeVolume: state.setTradeVolume,
    })),
  );
  const preferencesHydrated = useUserPreferences((s) => s.hasHydrated);
  const chartShowOnChart = useUserPreferences((s) => s.chartShowOnChart);
  const resolvedChartColors = useMemo(
    () => resolveChartColorsForTheme(chartColors, chartColorScheme, isDark),
    [chartColors, chartColorScheme, isDark],
  );
  // Safely strip MT4/MT5 suffixes like 'm', '.c', '_std' to resolve flags properly
  const baseSymbol = useMemo(() => resolveChartSymbolKey(chartSymbol), [chartSymbol]);
  const chartLiveQuotes = useMarketData(chartSymbol ? [chartSymbol] : [], isScreenFocused);
  const chartLiveQuote = chartLiveQuotes[chartSymbol];
  const { data: chartInstrumentMeta } = useInstrumentMeta(chartSymbol, isScreenFocused);
  const chartLiveQuoteDigitsSource = (chartLiveQuote as { digitsSource?: string } | undefined)?.digitsSource;
  const hasLiveChartQuote = hasLiveQuoteFeedData(chartLiveQuote);

  const setSidebarOpen = useUIState((s) => s.setSidebarOpen);
  const [tfOpen, setTfOpen] = useState(false);
  const [symbolPickerOpen, setSymbolPickerOpen] = useState(false);
  const [showSignalDetails, setShowSignalDetails] = useState(false);

  // Hydrate positions on page refresh
  const refreshPositions = usePositionsState((s) => s.refreshPositions);
  const accountLogin = useResolvedTradingLogin();
  const activeBrokerQuerySession = useActiveBrokerQuerySession();
  useEffect(() => {
    if (!isScreenFocused || !accountLogin) return;

    refreshPositions(String(accountLogin));
    const interval = setInterval(() => {
      refreshPositions(String(accountLogin));
    }, 10000);

    return () => clearInterval(interval);
  }, [accountLogin, isScreenFocused, refreshPositions]);
  const [showTemplatesMenu, setShowTemplatesMenu] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const chartContainerRef = useRef<any>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<any>(null);
  const overlayMarkersRef = useRef<{ detach: () => void } | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const lastVolumePointRef = useRef<{ time: number; value: number } | null>(null);
  const lastCandleLengthRef = useRef(0);
  const lastRenderedCandleSignatureRef = useRef('');
  const renderedSeriesSnapshotRef = useRef(EMPTY_CHART_SERIES_SNAPSHOT);

  const [chartLayout, setChartLayout] = useState({ width: 0, height: 0 });
  const chartType = chartVisualType;
  const [showChartTypeMenu, setShowChartTypeMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [overlaySyncRevision, setOverlaySyncRevision] = useState(0);
  const isChartExpanded = useUIState((s) => s.isChartFullscreen);
  const setIsChartExpanded = useUIState((s) => s.setChartFullscreen);
  const [activeTool, setActiveTool] = useState<string>('crosshair');
  const [showDrawingToolbar, setShowDrawingToolbar] = useState(false);
  const toolbarNeutralIconColor = isDark ? '#D1D4DC' : '#131722';
  const toolbarFullscreenIconColor = isChartExpanded ? BLUE : toolbarNeutralIconColor;
  const [showCalendar, setShowCalendar] = useState(false);
  const drawingToolsRef = useRef<DrawingToolsManager | null>(null);
  const [overlayRevision, setOverlayRevision] = useState(0);

  const { data: apiSymbols } = useMarketSymbols(isScreenFocused);
  const availableSymbols = useMemo(
    () => buildAvailableChartSymbols(chartSymbol, apiSymbols),
    [apiSymbols, chartSymbol],
  );
  const tradeVolumeBounds = useMemo(
    () => ({
      minVolume: chartInstrumentMeta?.minVolume,
      maxVolume: chartInstrumentMeta?.maxVolume,
      stepVolume: chartInstrumentMeta?.stepVolume,
    }),
    [chartInstrumentMeta?.maxVolume, chartInstrumentMeta?.minVolume, chartInstrumentMeta?.stepVolume],
  );
  const [lotInput, setLotInput] = useState(() => formatTradeVolume(tradeVolume, tradeVolumeBounds));

  useEffect(() => {
    const normalized = normalizeTradeVolume(tradeVolume, tradeVolumeBounds);
    if (Math.abs(normalized - tradeVolume) > 0.000001) {
      setTradeVolume(normalized);
      return;
    }
    setLotInput(formatTradeVolume(normalized, tradeVolumeBounds));
  }, [setTradeVolume, tradeVolume, tradeVolumeBounds]);

  const updateTradeVolume = useCallback(
    (nextVolume: number | string) => {
      const normalized = normalizeTradeVolume(nextVolume, tradeVolumeBounds);
      setTradeVolume(normalized);
      setLotInput(formatTradeVolume(normalized, tradeVolumeBounds));
    },
    [setTradeVolume, tradeVolumeBounds],
  );

  const commitLotDraft = useCallback(() => {
    if (!lotInput.trim()) {
      setLotInput(formatTradeVolume(tradeVolume, tradeVolumeBounds));
      return;
    }
    updateTradeVolume(lotInput);
  }, [lotInput, tradeVolume, tradeVolumeBounds, updateTradeVolume]);

  const [activeDateRange, setActiveDateRange] = useState<ChartTimeRange>('auto');
  const [customDateValue, setCustomDateValue] = useState<Date | null>(null);
  const chartDataActive = isScreenFocused;
  const {
    candles,
    hasHistoryCandles: chartHasHistoryCandles,
    loading: chartDataLoading,
    error: chartDataError,
    refresh: refreshChartHistory,
    paginate,
  } = useLiveCandles(chartSymbol, chartTimeframe, chartDataActive);
  const areaVisibleBarTarget = useAreaChartHistoryExpansion({
    active: chartDataActive,
    chartType,
    symbol: chartSymbol,
    timeframe: chartTimeframe,
    cacheScopeKey: activeBrokerQuerySession?.cacheNamespace ?? ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE,
    candleCount: candles.length,
    hasHistoryCandles: chartHasHistoryCandles,
    historyLoading: chartDataLoading,
    paginate,
  });
  const sanitizedCandles = useMemo(
    () => sanitizeCandlesForChart(candles, { timeframe: chartTimeframe }),
    [candles, chartTimeframe],
  );
  const latestChartPrecisionPrices = useMemo(() => {
    const latest = sanitizedCandles[sanitizedCandles.length - 1];
    return latest ? [latest.open, latest.high, latest.low, latest.close] : [];
  }, [sanitizedCandles]);
  const displayDecimals = useMemo(() => {
    return resolveChartDisplayDecimals({
      instrumentDigits: chartInstrumentMeta?.digits,
      instrumentPoint: chartInstrumentMeta?.point,
      instrumentTickSize: chartInstrumentMeta?.tickSize,
      liveQuoteDigits: chartLiveQuote?.digits,
      liveQuoteDigitsFromBackend: hasLiveChartQuote && chartLiveQuoteDigitsSource === 'backend',
      liveQuotePoint: chartLiveQuote?.point,
      liveQuoteTickSize: chartLiveQuote?.tickSize,
      liveQuoteBid: chartLiveQuote?.bid,
      liveQuoteAsk: chartLiveQuote?.ask,
      liveQuoteLast: chartLiveQuote?.close,
      candlePrices: latestChartPrecisionPrices,
    });
  }, [
    chartInstrumentMeta?.digits,
    chartInstrumentMeta?.point,
    chartInstrumentMeta?.tickSize,
    chartLiveQuote?.ask,
    chartLiveQuote?.bid,
    chartLiveQuote?.close,
    chartLiveQuote?.digits,
    chartLiveQuote?.point,
    chartLiveQuote?.tickSize,
    chartLiveQuoteDigitsSource,
    hasLiveChartQuote,
    latestChartPrecisionPrices,
  ]);
  const renkoExplicitInstrumentTickSize = (
    chartInstrumentMeta as (Record<string, unknown> & { tick_size?: unknown }) | undefined
  )?.tick_size;
  // Prefer broker tick/point metadata for the brick grid. Decimal precision is
  // only a fallback when the connected instrument supplies no explicit increment.
  const renkoMinimumPriceIncrement = useMemo(
    () => resolveRenkoMinimumPriceIncrement(
      [
        renkoExplicitInstrumentTickSize,
        chartLiveQuote?.tickSize,
        chartInstrumentMeta?.tickSize,
        chartInstrumentMeta?.point,
        chartLiveQuote?.point,
      ],
      1 / Math.pow(10, displayDecimals),
    ),
    [
      chartInstrumentMeta?.point,
      chartInstrumentMeta?.tickSize,
      chartLiveQuote?.point,
      chartLiveQuote?.tickSize,
      displayDecimals,
      renkoExplicitInstrumentTickSize,
    ],
  );
  const resolveCachedRenkoBrickSize = useCallback((sourceCandles: typeof sanitizedCandles) => {
    return resolveStableRenkoBrickSize({
      scopeKey: activeBrokerQuerySession?.cacheNamespace ?? ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE,
      symbol: chartSymbol,
      timeframe: chartTimeframe,
      displayDecimals,
      minimumPriceIncrement: renkoMinimumPriceIncrement,
      candles: sourceCandles,
    });
  }, [
    activeBrokerQuerySession?.cacheNamespace,
    chartSymbol,
    chartTimeframe,
    displayDecimals,
    renkoMinimumPriceIncrement,
  ]);
  const { data: chartDailyRangeCandle = null } = useLatestDailyCandle(chartSymbol, isScreenFocused);
  const hasCandles = sanitizedCandles.length > 0;
  const timeRangeCandlesRef = useRef(sanitizedCandles);
  const chartCandles = useMemo(
    () =>
      filterCandlesForChartTimeRange(
        activeDateRange,
        sanitizedCandles,
        customDateValue,
      ),
    [activeDateRange, customDateValue, sanitizedCandles],
  );
  const areaChartDirection = useMemo(
    () => resolveAreaChartDirectionForRange({
      range: activeDateRange,
      points: sanitizedCandles,
      customDateValue,
      dailyChangePct: chartLiveQuote?.changePct,
    }),
    [activeDateRange, chartLiveQuote?.changePct, customDateValue, sanitizedCandles],
  );
  const areaChartColor = useMemo(
    () => resolveAreaChartColor(areaChartDirection, resolvedChartColors),
    [areaChartDirection, resolvedChartColors],
  );
  const areaChartColorRef = useRef(areaChartColor);
  areaChartColorRef.current = areaChartColor;
  useEffect(() => {
    timeRangeCandlesRef.current = sanitizedCandles;
  }, [sanitizedCandles]);
  const formatChartValue = useCallback(
    (value: number | null | undefined) => formatBackendPrice(value),
    [displayDecimals],
  );
  const chartMetaLastCandle = chartCandles.length > 0 ? chartCandles[chartCandles.length - 1] : null;
  const chartSentimentQuote = useMemo(
    () => ({
      bid:
        typeof chartLiveQuote?.bid === 'number' && chartLiveQuote.bid > 0
          ? chartLiveQuote.bid
          : chartMetaLastCandle?.close ?? 0,
      ask:
        typeof chartLiveQuote?.ask === 'number' && chartLiveQuote.ask > 0
          ? chartLiveQuote.ask
          : chartMetaLastCandle?.close ?? 0,
      high: chartLiveQuote?.high,
      low: chartLiveQuote?.low,
    }),
    [chartLiveQuote?.ask, chartLiveQuote?.bid, chartLiveQuote?.high, chartLiveQuote?.low, chartMetaLastCandle?.close],
  );
  const sentiment = useMemo(
    () => calculateMarketSentiment(chartSentimentQuote, chartDailyRangeCandle),
    [chartDailyRangeCandle, chartSentimentQuote],
  );
  const chartMetaNeutralColor = isDark ? CHART_OHLC_NEUTRAL_DARK_COLOR : CHART_OHLC_NEUTRAL_LIGHT_COLOR;
  const chartMetaItems = useMemo(
    () =>
      chartMetaLastCandle
        ? [
          { label: 'O', value: formatChartValue(chartMetaLastCandle.open), color: chartMetaNeutralColor },
          { label: 'H', value: formatChartValue(chartMetaLastCandle.high), color: isDark ? CHART_OHLC_HIGH_COLOR : GLight.trading.profit },
          { label: 'L', value: formatChartValue(chartMetaLastCandle.low), color: CHART_OHLC_LOW_COLOR },
          { label: 'C', value: formatChartValue(chartMetaLastCandle.close), color: chartMetaNeutralColor },
        ]
        : [],
    [chartMetaLastCandle, chartMetaNeutralColor, formatChartValue, isDark],
  );
  // Renko bricks can span price movement across source candles, so displaying
  // them as one timed candle's O/H/L/C row would be misleading.
  const showChartMetaRow =
    chartDisplay.showOHLC && chartType !== 'renko' && chartMetaItems.length > 0;
  const { data: closedPositions = [], refetch: refetchClosedPositions } = usePositionHistoryQuery(accountLogin, {
    enabled: isScreenFocused,
  });
  const { data: chartDeals = [], refetch: refetchChartDeals } = useChartDealsQuery(accountLogin, {
    enabled: isScreenFocused,
  });
  const { data: activePendingOrders, refetch: refetchOrders } = usePendingOrdersQuery(isScreenFocused);
  const orders = useMemo(() => pendingOrdersToChartOrders(activePendingOrders), [activePendingOrders]);
  const { data: alerts = [], refetch: refetchAlerts } = useAlertsQuery({
    enabled: isScreenFocused,
  });
  const { data: accountSummary, refetch: refetchAccountSummary } = useAccountSummary(
    accountLogin ? String(accountLogin) : undefined,
    { enabled: isScreenFocused },
  );
  const liveAccountEquity = useLiveAccountState((s) => s.equity);
  const liveAccountMargin = useLiveAccountState((s) => s.margin);
  const liveAccountMarginLevel = useLiveAccountState((s) => s.margin_level);
  const overlayAccountMetrics = useMemo(() => {
    const hasLiveMetrics =
      (Number.isFinite(liveAccountEquity) && liveAccountEquity > 0) ||
      (Number.isFinite(liveAccountMargin) && liveAccountMargin > 0) ||
      (Number.isFinite(liveAccountMarginLevel) && liveAccountMarginLevel > 0);

    return {
      equity: hasLiveMetrics ? liveAccountEquity : accountSummary?.equity ?? 0,
      margin: hasLiveMetrics ? liveAccountMargin : accountSummary?.margin ?? 0,
      marginLevel: hasLiveMetrics ? liveAccountMarginLevel : accountSummary?.marginLevel ?? 0,
    };
  }, [
    liveAccountEquity,
    liveAccountMargin,
    liveAccountMarginLevel,
    accountSummary?.equity,
    accountSummary?.margin,
    accountSummary?.marginLevel,
  ]);
  const requestOverlaySync = useCallback(() => {
    setOverlaySyncRevision((revision) => revision + 1);
  }, []);
  const refreshShowOnChartSources = useCallback(() => {
    requestOverlaySync();
    if (accountLogin) {
      refreshPositions(String(accountLogin));
    }
    void refetchOrders();
    void refetchClosedPositions();
    void refetchChartDeals();
    void refetchAlerts();
    void refetchAccountSummary();
  }, [
    accountLogin,
    refreshPositions,
    refetchOrders,
    refetchClosedPositions,
    refetchChartDeals,
    refetchAlerts,
    refetchAccountSummary,
    requestOverlaySync,
  ]);
  useFocusEffect(
    useCallback(() => {
      refreshShowOnChartSources();
    }, [refreshShowOnChartSources]),
  );
  const chartColorsSignature = useMemo(() => JSON.stringify(resolvedChartColors), [resolvedChartColors]);
  const [forceHideLoading, setForceHideLoading] = useState(false);
  const candlesAvailable = sanitizedCandles.length > 0;

  useEffect(() => {
    setForceHideLoading(false);
    const tmr = setTimeout(() => setForceHideLoading(true), 10000);
    return () => clearTimeout(tmr);
  }, [chartSymbol, chartTimeframe]);

  useEffect(() => {
    if (candlesAvailable && forceHideLoading) {
      setForceHideLoading(false);
    }
  }, [candlesAvailable, forceHideLoading]);

  const isError = Boolean(chartDataError && !candlesAvailable);
  const isLoading = sanitizedCandles.length === 0 && !isError && (chartDataLoading || !forceHideLoading);
  const isNoMarketData = sanitizedCandles.length === 0 && !isLoading && !isError;

  // Initialize Lightweight Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;


    const initialDimensions = getContainerChartDimensions(chartContainerRef.current);

    const chart = createChart(chartContainerRef.current, {
      width: initialDimensions.width,
      height: initialDimensions.height,
      layout: {
        background: { type: ColorType.Solid, color: resolvedChartColors.background },
        textColor: resolvedChartColors.foreground,
        fontSize: 11,
      },
      grid: {
        // Sparse dotted guides match the MT5 mobile chart grid.
        vertLines: { color: chartDisplay.showGrid ? resolvedChartColors.grid : 'transparent', style: LineStyle.SparseDotted },
        horzLines: { color: chartDisplay.showGrid ? resolvedChartColors.grid : 'transparent', style: LineStyle.SparseDotted },
      },
      crosshair: {
        mode: CrosshairMode.Hidden,
        vertLine: {
          visible: false,
          labelVisible: false,
          color: 'transparent',
          width: 1,
          style: LineStyle.Solid,
          labelBackgroundColor: 'transparent',
        },
        horzLine: {
          visible: false,
          labelVisible: false,
          color: 'transparent',
          width: 1,
          style: LineStyle.Solid,
          labelBackgroundColor: 'transparent',
        },
      },
      localization: {
        timeFormatter: (timestamp: number) => {
          return formatChartTickLabel(timestamp, true);
        },
      },
      timeScale: {
        borderColor: chartDisplay.showGrid ? resolvedChartColors.grid : 'transparent',
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: number) => {
          return formatChartTickLabel(time, true);
        },
        rightOffset: 0,
        barSpacing: CHART_DEFAULT_TIME_SCALE_BAR_SPACING,
        minBarSpacing: CHART_DEFAULT_TIME_SCALE_MIN_BAR_SPACING,
        shiftVisibleRangeOnNewBar: true,
        fixLeftEdge: CHART_TIME_SCALE_FIX_LEFT_EDGE,
        fixRightEdge: CHART_TIME_SCALE_FIX_RIGHT_EDGE,
      },
      rightPriceScale: {
        visible: true,
        borderVisible: false,
        borderColor: chartDisplay.showGrid ? resolvedChartColors.grid : 'transparent',
        autoScale: true,
        entireTextOnly: false,
        minimumWidth: CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH,
        scaleMargins: {
          top: 0.08,
          bottom: 0.25,
        },
      },
    });

    // Instead of initializing series here, we decouple it
    chartRef.current = chart;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions(getContainerChartDimensions(chartContainerRef.current));
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      try { drawingToolsRef.current?.remove(); } catch (e) { }
      drawingToolsRef.current = null;
      try { overlayMarkersRef.current?.detach(); } catch (e) { }
      overlayMarkersRef.current = null;
      if (seriesRef.current) {
        try { chart.removeSeries(seriesRef.current); } catch (e) { }
        seriesRef.current = null;
      }
      try { chart.remove(); } catch (e) { }
      chartRef.current = null;
    };
  }, [isDark, BLUE, RED, displayDecimals, resolvedChartColors, chartDisplay.showGrid]);

  // Series Initialization & Swap
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = chartRef.current;

    chart.timeScale().applyOptions({
      minBarSpacing: chartType === 'area'
        ? CHART_AREA_TIME_SCALE_MIN_BAR_SPACING
        : CHART_DEFAULT_TIME_SCALE_MIN_BAR_SPACING,
    });

    const UP_COLOR = resolvedChartColors.candlesUptrend;
    const DOWN_COLOR = resolvedChartColors.candlesDowntrend;
    const HOLLOW_BODY = resolvedChartColors.hollowBody;
    const BAR_UP_COLOR = resolvedChartColors.barsUptrend;
    const BAR_DOWN_COLOR = resolvedChartColors.barsDowntrend;
    const LINE_COLOR = chartType === 'area'
      ? areaChartColorRef.current
      : resolvedChartColors.lineBody || BLUE;

    const priceFormatInfo = {
      type: 'price' as const,
      precision: displayDecimals,
      minMove: 1 / Math.pow(10, displayDecimals),
    };

    if (seriesRef.current) {
      try { overlayMarkersRef.current?.detach(); } catch (e) { }
      overlayMarkersRef.current = null;
      try { chart.removeSeries(seriesRef.current); } catch (e) { }
      seriesRef.current = null;
    }

    if (volumeSeriesRef.current) {
      try { chart.removeSeries(volumeSeriesRef.current); } catch (e) { }
      volumeSeriesRef.current = null;
    }

    let series: ISeriesApi<any>;

    // Candles, Hollow, and Renko share the custom OHLC body renderer. Renko is
    // brick-shaped rather than wick-shaped, hence the type-specific wick flag.
    if (chartType === 'candles' || chartType === 'hollow' || chartType === 'renko') {
      series = chart.addCustomSeries(
        createRTX5CustomCandlestickPaneView(),
        buildRTX5CustomCandlestickSeriesOptions({
          candleOpacity: CHART_CANDLE_RENDER_OPACITY,
          bearishCandleOpacity: CHART_BEARISH_CANDLE_RENDER_OPACITY,
          bodyUpColor: chartType === 'hollow' ? HOLLOW_BODY : UP_COLOR,
          bodyDownColor: chartType === 'hollow' ? HOLLOW_BODY : DOWN_COLOR,
          borderUpColor: UP_COLOR,
          borderDownColor: DOWN_COLOR,
          wickUpColor: UP_COLOR,
          wickDownColor: DOWN_COLOR,
          wickVisible: chartType !== 'renko',
          lastValueVisible: false,
          priceLineVisible: true,
          priceFormat: priceFormatInfo,
        }) as any,
      );
    } else if (chartType === 'bars') {
      series = chart.addSeries(BarSeries, {
        upColor: BAR_UP_COLOR,
        downColor: BAR_DOWN_COLOR,
        lastValueVisible: false,
        priceLineVisible: true,
        priceFormat: priceFormatInfo,
      });
    } else if (chartType === 'area') {
      // Area follows the same closing-price path as Line, then fills below it
      // with the current line color so theme and custom palette stay in sync.
      series = chart.addSeries(AreaSeries, {
        lineColor: LINE_COLOR,
        topColor: withAlpha(LINE_COLOR, 0.32),
        bottomColor: withAlpha(LINE_COLOR, 0.04),
        lineWidth: CHART_AREA_LINE_WIDTH,
        lineType: LineType.Simple,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
        priceLineVisible: true,
        priceFormat: priceFormatInfo,
      });
    } else {
      series = chart.addSeries(LineSeries, {
        color: LINE_COLOR,
        lineWidth: 2,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
        priceLineVisible: true,
        priceFormat: priceFormatInfo,
      });
    }

    seriesRef.current = series;

    try { drawingToolsRef.current?.remove(); } catch (e) { }
    try {
      drawingToolsRef.current = new DrawingToolsManager(chart, series as any);
    } catch (e) { }

    // Synthetic bricks do not represent source-period volume. Omit that pane
    // and return its vertical space to the main Renko price scale.
    if (chartType !== 'renko') {
      volumeSeriesRef.current = chart.addSeries(HistogramSeries, {
        color: withAlpha(UP_COLOR, 0.32),
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
        priceLineVisible: false,
        lastValueVisible: false,
      });
      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.84, bottom: 0.02 },
        visible: false,
      });
    }
    chart.priceScale('right').applyOptions({
      scaleMargins: {
        top: 0.08,
        bottom: chartType === 'renko' ? 0.08 : 0.25,
      },
    });
    lastVolumePointRef.current = null;

    // Force data sync to reload
    dataSignatureRef.current = '';
    renderedSeriesSnapshotRef.current = EMPTY_CHART_SERIES_SNAPSHOT;
    lastCandleLengthRef.current = 0;
    lastRenderedCandleSignatureRef.current = '';

    // Force overlay effects (price lines + markers) to re-run with the new series
    setOverlayRevision((prev) => prev + 1);

  }, [chartType, isDark, BLUE, RED, displayDecimals, resolvedChartColors]);

  useEffect(() => {
    if (chartType !== 'area' || !seriesRef.current) {
      return;
    }

    // Live candles only change the period terminal. Recolor the retained Area
    // series in place so crossing the fixed baseline never resets its viewport.
    try {
      seriesRef.current.applyOptions({
        lineColor: areaChartColor,
        topColor: withAlpha(areaChartColor, 0.32),
        bottomColor: withAlpha(areaChartColor, 0.04),
      });
    } catch (_error) {
      // The chart may have been disposed during a route or chart-type change.
    }
  }, [areaChartColor, chartType]);

  const dataSignatureRef = useRef('');

  const applyWebTimeRange = useCallback((range: ChartTimeRange, nextCustomDateValue?: Date | null) => {
    const visibleCandles = timeRangeCandlesRef.current;
    if (!chartRef.current || visibleCandles.length === 0) return;

    if (range === 'auto') {
      if (typeof chartRef.current?.priceScale === 'function') {
        chartRef.current.priceScale('right').applyOptions({ autoScale: true });
      }
      if (typeof chartRef.current?.timeScale === 'function') {
        chartRef.current.timeScale().scrollToRealTime();
      }
      return;
    }

    if (range === 'all') {
      chartRef.current.timeScale().fitContent();
      return;
    }

    const visibleRange = resolveChartVisibleRange(range, visibleCandles, nextCustomDateValue ?? customDateValue);
    if (!visibleRange) return;

    chartRef.current.timeScale().setVisibleRange({
      from: visibleRange.from as any,
      to: visibleRange.to as any,
    });
  }, [customDateValue]);

  const handleRangePress = (range: ChartTimeRange) => {
    setActiveDateRange(range);
    setCustomDateValue(null);
    applyWebTimeRange(range, null);
  };

  const handleCustomDateRange = (e: any) => {
    const val = e.target.value;
    if (!val) return;
    const selectedDate = new Date(val);
    setCustomDateValue(selectedDate);
    setActiveDateRange('custom');
    applyWebTimeRange('custom', selectedDate);
  };

  const prefetchChartTimeframeHistory = useCallback((targetSymbol: string, targetTimeframe: string) => {
    return liveCandlesEngine.prefetchHistory(targetSymbol, targetTimeframe);
  }, []);
  const prefetchSymbolPickerHistory = useCallback(() => {
    const currentSymbolKey = chartSymbol.trim().toUpperCase();
    const targets = availableSymbols
      .filter((symbol) => symbol.trim().toUpperCase() !== currentSymbolKey)
      .slice(0, CHART_SYMBOL_PICKER_PREFETCH_LIMIT);
    if (targets.length === 0 || !chartTimeframe) {
      return;
    }

    scheduleIdleWork(() => {
      targets.forEach((targetSymbol) => {
        void prefetchChartTimeframeHistory(targetSymbol, chartTimeframe).catch((error) => {
          if (typeof __DEV__ !== 'undefined' && __DEV__) {
            console.log('[CHART] Web symbol picker history prefetch failed', {
              symbol: targetSymbol,
              timeframe: chartTimeframe,
              message: error instanceof Error ? error.message : String(error),
            });
          }
        });
      });
    }, {
      delayMs: CHART_SYMBOL_PICKER_PREFETCH_DELAY_MS,
      timeoutMs: 1500,
    });
  }, [availableSymbols, chartSymbol, chartTimeframe, prefetchChartTimeframeHistory]);
  const refreshSelectedChartHistory = useCallback((targetSymbol: string, targetTimeframe: string) => {
    const normalizedSymbol = normalizeSymbol(targetSymbol);
    const normalizedTimeframe = normalizeTimeframeStrict(targetTimeframe);
    if (!normalizedSymbol || !normalizedTimeframe) {
      return;
    }

    void liveCandlesEngine.prefetchHistory(normalizedSymbol, normalizedTimeframe);
    liveCandlesEngine.refreshHistoryForContext(normalizedSymbol, normalizedTimeframe);
  }, []);

  const handleOpenSymbolPicker = useCallback(() => {
    runImmediateAction('chart.web.symbolPicker.open', () => {
      setTfOpen(false);
      setShowChartTypeMenu(false);
      setShowMoreMenu(false);
      setShowTemplatesMenu(false);
      setSymbolPickerOpen(true);
      prefetchSymbolPickerHistory();
    });
  }, [prefetchSymbolPickerHistory]);

  const handleTimeframeSelect = useCallback((nextTimeframe: string) => {
    setActiveDateRange('auto');
    setCustomDateValue(null);
    refreshSelectedChartHistory(chartSymbol, nextTimeframe);
    setChartTimeframe(nextTimeframe);
  }, [chartSymbol, refreshSelectedChartHistory, setChartTimeframe]);

  const handleSymbolSelect = useCallback((nextSymbol: string) => {
    if (nextSymbol === chartSymbol) {
      return;
    }

    setActiveDateRange('auto');
    setCustomDateValue(null);
    refreshSelectedChartHistory(nextSymbol, chartTimeframe);
    setChartSymbol(nextSymbol);
  }, [chartSymbol, chartTimeframe, refreshSelectedChartHistory, setChartSymbol]);

  useEffect(() => {
    if (!isScreenFocused) return;
    const nextSymbol = resolveBrokerChartSymbol(chartSymbol, apiSymbols);
    if (nextSymbol) handleSymbolSelect(nextSymbol);
  }, [apiSymbols, chartSymbol, handleSymbolSelect, isScreenFocused]);

  useEffect(() => {
    if (!hasCandles) return;
    applyWebTimeRange(activeDateRange, customDateValue);
  }, [activeDateRange, applyWebTimeRange, chartTimeframe, customDateValue, hasCandles]);

  // Sync canonical candle data. Full `setData` is reserved for first load,
  // context changes, and history corrections; normal live ticks use
  // Lightweight Charts' incremental update path.
  useEffect(() => {
    if (!seriesRef.current) {
      return;
    }

    const sig = `${chartSymbol}-${chartTimeframe}-${isDark}-${chartType}-${chartColorsSignature}`;
    const safeCandles = sanitizedCandles;
    const renkoBrickSize = chartType === 'renko'
      ? resolveCachedRenkoBrickSize(safeCandles)
      : undefined;
    // Renko is path-dependent: one source-candle update can complete several
    // boxes. Diff the rendered bricks, not only the canonical candle list.
    const renkoMappedData = chartType === 'renko'
      ? mapWebChartData(safeCandles, chartType, resolvedChartColors, renkoBrickSize)
      : null;
    const previousSnapshot = renderedSeriesSnapshotRef.current;
    const previousVisibleLogicalRange = chartRef.current
      ?.timeScale()
      .getVisibleLogicalRange() ?? null;
    const nextSnapshot = buildChartSeriesSnapshot(
      (renkoMappedData ?? safeCandles) as typeof safeCandles,
    );
    const contextChanged = dataSignatureRef.current !== sig;
    const updateMode = contextChanged || (safeCandles.length === 0 && renderedSeriesSnapshotRef.current.length > 0)
      ? 'full_reload'
      : getChartSeriesUpdateMode(renderedSeriesSnapshotRef.current, nextSnapshot);

    if (updateMode === 'noop') {
      return;
    }

    try {
      if (safeCandles.length === 0 || updateMode === 'full_reload') {
        const mappedData = renkoMappedData
          ?? mapWebChartData(safeCandles, chartType, resolvedChartColors);
        seriesRef.current.setData(mappedData as any);

        if (volumeSeriesRef.current) {
          const volumeCandles = (renkoMappedData ?? safeCandles) as typeof safeCandles;
          const volData = volumeCandles.map((item, index) =>
            buildVolumeDatum(item, resolvedChartColors, index === volumeCandles.length - 1),
          );
          volumeSeriesRef.current.setData(volData as any);
          lastVolumePointRef.current = volData.length > 0
            ? { time: volData[volData.length - 1].time, value: volData[volData.length - 1].value }
            : null;
        }
      } else {
        const lastCandle = safeCandles[safeCandles.length - 1];
        const mappedTick = renkoMappedData
          ? renkoMappedData[renkoMappedData.length - 1]
          : mapWebChartTick(lastCandle, chartType, resolvedChartColors);
        if (!mappedTick) {
          return;
        }
        seriesRef.current.update(mappedTick as any);

        if (volumeSeriesRef.current) {
          const volumePoint = buildVolumeDatum(
            (renkoMappedData ? mappedTick : lastCandle) as typeof lastCandle,
            resolvedChartColors,
            true,
          );
          volumeSeriesRef.current.update(volumePoint as any);
          lastVolumePointRef.current = { time: volumePoint.time, value: volumePoint.value };
        }
      }

      if (
        chartType === 'area'
        && safeCandles.length > 0
        && chartRef.current
        && (
          contextChanged
          || previousSnapshot.length === 0
          || shouldExpandUntouchedWebAreaViewport({
            previousLength: previousSnapshot.length,
            nextLength: nextSnapshot.length,
            previousFirstTime: previousSnapshot.firstTime,
            nextFirstTime: nextSnapshot.firstTime,
            previousRange: previousVisibleLogicalRange,
            visibleBarTarget: areaVisibleBarTarget,
          })
        )
      ) {
        applyWebAreaRecentViewport(
          chartRef.current,
          safeCandles.length,
          areaVisibleBarTarget,
        );
      }

      dataSignatureRef.current = sig;
      renderedSeriesSnapshotRef.current = nextSnapshot;
      lastCandleLengthRef.current = safeCandles.length;
      lastRenderedCandleSignatureRef.current = getLastCandleSignature(safeCandles);
    } catch (e) {
      // Chart might be disposed.
    }
  }, [
    sanitizedCandles,
    isDark,
    chartSymbol,
    chartTimeframe,
    chartType,
    chartColorsSignature,
    areaVisibleBarTarget,
    resolvedChartColors,
    resolveCachedRenkoBrickSize,
  ]);

  const positions = usePositionsState((s) => s.positions);
  const positionLinesRef = useRef<any[]>([]);
  const { bid: chartBid, ask: chartAsk } = useMemo(
    () =>
      resolveChartTradeButtonQuote({
        liveBid: hasLiveChartQuote ? chartLiveQuote?.bid : undefined,
        liveAsk: hasLiveChartQuote ? chartLiveQuote?.ask : undefined,
        fallbackBid: chartMetaLastCandle?.close,
        fallbackAsk: chartMetaLastCandle?.close,
      }),
    [chartLiveQuote?.ask, chartLiveQuote?.bid, chartMetaLastCandle?.close, hasLiveChartQuote],
  );
  const overlayLiveBid = useMemo(
    () =>
      Number.isFinite(chartBid) && chartBid > 0
        ? chartBid
        : null,
    [chartBid],
  );
  const overlayLiveAsk = useMemo(
    () =>
      Number.isFinite(chartAsk) && chartAsk > 0
        ? chartAsk
        : null,
    [chartAsk],
  );
  const overlayPayload = useMemo(
    () => {
      if (!preferencesHydrated) {
        return { priceLines: [], markers: [], tradeHistorySegments: [] };
      }

      const nextPayload = buildChartOverlayPayload({
        chartSymbol,
        candles: sanitizedCandles,
        positions,
        orders,
        closedPositions,
        deals: chartDeals,
        alerts,
        colors: resolvedChartColors,
        sellColor: RED,
        liveBid: hasLiveChartQuote ? overlayLiveBid : null,
        liveAsk: hasLiveChartQuote ? overlayLiveAsk : null,
        liveQuote: hasLiveChartQuote ? chartLiveQuote : undefined,
        liveAccount: overlayAccountMetrics,
        accountCurrency: accountSummary?.currency,
        showOnChart: chartShowOnChart,
        showTradeHistory: chartDisplay.showTradeHistory,
        chartTimeframe,
        activeTool,
      });
      if (chartDisplay.showAskPriceLine && hasLiveChartQuote && overlayLiveAsk !== null && overlayLiveAsk > 0) {
        nextPayload.priceLines = [...nextPayload.priceLines, { id: 'live-ask', price: overlayLiveAsk, color: RED,
          lineWidth: 1, lineStyle: 2, axisLabelVisible: false, labelPlacement: 'line', title: `ASK @ ${overlayLiveAsk}` }];
      }
      // Canonical candle-time markers cannot be attached safely to synthetic
      // Renko brick times, so keep price lines but omit those markers.
      return chartType === 'renko'
        ? { ...nextPayload, markers: [] }
        : nextPayload;
    },
    [
      preferencesHydrated,
      chartSymbol,
      sanitizedCandles,
      positions,
      orders,
      closedPositions,
      chartDeals,
      alerts,
      resolvedChartColors,
      RED,
      chartLiveQuote,
      hasLiveChartQuote,
      overlayLiveBid,
      overlayLiveAsk,
      overlayAccountMetrics,
      accountSummary?.currency,
      chartShowOnChart,
      chartDisplay.showTradeHistory,
      chartDisplay.showAskPriceLine,
      chartTimeframe,
      chartType,
      activeTool,
    ],
  );
  const overlayPayloadSignature = useMemo(() => JSON.stringify(overlayPayload), [overlayPayload]);

  useEffect(() => {
    if (!seriesRef.current) return;

    positionLinesRef.current.forEach((line) => {
      try { seriesRef.current.removePriceLine(line); } catch (e) { }
    });
    positionLinesRef.current = [];

    try { overlayMarkersRef.current?.detach(); } catch (e) { }
    overlayMarkersRef.current = null;

    overlayPayload.priceLines.forEach((line) => {
      try {
        positionLinesRef.current.push(
          seriesRef.current.createPriceLine({
            price: line.price,
            color: line.color,
            lineWidth: line.lineWidth,
            lineStyle: line.lineStyle,
            axisLabelVisible: line.axisLabelVisible,
            title: line.title,
          }),
        );
      } catch (e) {
        console.error('[ChartOverlay] Error creating overlay line:', e);
      }
    });

    if (overlayPayload.markers.length > 0) {
      try {
        overlayMarkersRef.current = createSeriesMarkers(
          seriesRef.current as any,
          overlayPayload.markers as any,
        ) as any;
      } catch (e) {
        console.error('[ChartOverlay] Error creating overlay markers:', e);
      }
    }
  }, [overlayPayloadSignature, overlayRevision, overlaySyncRevision]);

  const CHART_HEIGHT = chartLayout.height;

  const handleLayout = (e: LayoutChangeEvent) => {
    setChartLayout({
      width: e.nativeEvent.layout.width,
      height: e.nativeEvent.layout.height,
    });
    if (chartRef.current && chartContainerRef.current) {
      chartRef.current.applyOptions(getSafeChartDimensions(e.nativeEvent.layout.width - 4, e.nativeEvent.layout.height - 8));
    }
  };

  useEffect(() => {
    if (chartRef.current && chartContainerRef.current) {
      setTimeout(() => {
        if (chartRef.current && chartContainerRef.current) {
          chartRef.current.applyOptions(getContainerChartDimensions(chartContainerRef.current));
        }
      }, 50);
    }
  }, [isChartExpanded]);

  const displaySymbol = chartSymbol.replace(/\//g, '');
  const symbolFlags = SYMBOL_FLAGS[baseSymbol] ?? null;
  const symbolName = resolveChartSymbolFullName(chartSymbol);
  const symbolCategory = resolveChartSymbolCategory(chartSymbol);
  const symbolLogo = SYMBOL_LOGOS[baseSymbol] ?? null;

  // Dynamic X-axis labels from actual candle timestamps
  const xAxisLabels = useMemo(() => {
    if (chartCandles.length === 0) return [];
    const labelCount = 3;
    const labels: { text: string; position: `${number}%` }[] = [];
    for (let i = 0; i < labelCount; i++) {
      const idx = Math.floor((chartCandles.length / (labelCount + 1)) * (i + 1));
      const candle = chartCandles[Math.min(idx, chartCandles.length - 1)];
      if (candle && candle.time) {
        labels.push({
          text: formatXLabel(candle.time, chartTimeframe),
          position: `${Math.round(((idx + 0.5) / chartCandles.length) * 100)}%`,
        });
      }
    }
    return labels;
  }, [chartCandles, chartTimeframe]);

  return (
    <Screen style={styles.screen}>
      {!isChartExpanded && (
        <View style={styles.headerWrapper}>
          {/* Row 1: Account Badge (hamburger is global from _layout.tsx) */}
          <View style={styles.topBar}>
            <View style={{ width: 40 }} />
            <View style={{ flex: 1 }} />
            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerTitleText}>Chart</Text>
            </View>
            <View style={{ flex: 1 }} />
            <View style={{ width: 40 }} />
          </View>

          {/* Row 2: Symbol | Price | Balance */}
          <View style={styles.compactHeader}>
            {/* Left: Symbol Info */}
            <Pressable
              style={styles.symbolSection}
              onPressIn={handleOpenSymbolPicker}
              unstable_pressDelay={0}
            >
              <View>
                <View style={styles.symbolNameRow}>
                  <Text style={[styles.symbolText, { opacity: 0.9 }]}>{displaySymbol}</Text>
                  {symbolCategory ? (
                    <View style={styles.fxBadge}>
                      <Text style={styles.fxBadgeText}>{symbolCategory}</Text>
                    </View>
                  ) : null}
                  <Ionicons name="chevron-down" size={12} color={TEXT_MUTED} />
                </View>
                <Text style={styles.symbolSubText}>{symbolName}</Text>
              </View>
            </Pressable>

            {/* Right: Balance + Price + P/L */}
            <View style={styles.rightSection}>
              <LivePriceHeader symbol={chartSymbol} styles={styles} displayDecimals={displayDecimals} priceSource={priceSource} candles={sanitizedCandles} active={isScreenFocused} />
            </View>
          </View>
        </View>
      )}

      <View style={styles.card}>

        <View style={styles.chartContainer}>
          {/* Top Integrated Toolbar (TradingView Exact Style) */}
          <View style={styles.chartTopToolbar}>
            <ScrollView
              keyboardShouldPersistTaps="always" horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}
              contentContainerStyle={styles.toolbarScrollContent}>
              <View style={styles.toolbarButtonRow}>
                {/* 1: Symbol & Add */}
                <View style={styles.toolbarLeadingGroup}>
                  <Pressable style={styles.toolbarSymbolButton} onPressIn={handleOpenSymbolPicker} hitSlop={8} unstable_pressDelay={0}>
                    <Text style={{ fontSize: 12, fontWeight: '500', color: isDark ? '#D1D4DC' : '#131722' }}>{displaySymbol}</Text>
                  </Pressable>
                  <Pressable style={styles.toolbarIconButton} onPressIn={handleOpenSymbolPicker} unstable_pressDelay={0}>
                    <Ionicons name="add-outline" size={16} color={toolbarNeutralIconColor} />
                  </Pressable>
                </View>

                <View style={styles.toolbarSeparator} />

                {/* 3: Timeframe */}
                <Pressable style={styles.toolbarTimeframeButton} onPressIn={() => runImmediateAction('chart.web.timeframePicker.open', () => setTfOpen(true))} hitSlop={8} unstable_pressDelay={0}>
                  <Text style={{ fontSize: 12, fontWeight: '500', color: isDark ? '#D1D4DC' : '#131722' }}>{chartTimeframe.toUpperCase()}</Text>
                </Pressable>

                <View style={styles.toolbarSeparator} />

                {/* 4: Candles Type */}
                <Pressable style={styles.toolbarIconButton} onPressIn={() => runImmediateAction('chart.web.chartType.open', () => setShowChartTypeMenu(true))} unstable_pressDelay={0}>
                  <TvCandles color={isDark ? '#D1D4DC' : '#131722'} />
                </Pressable>

                <View style={styles.toolbarSeparator} />

                {/* 5: FX / Indicators */}
                <Pressable
                  style={styles.toolbarIconButton}
                  onPressIn={() => runImmediateAction('chart.web.objects.open', () => router.push('/chart/objects'))}
                  unstable_pressDelay={0}
                >
                  <TvLayers color={isDark ? '#D1D4DC' : '#131722'} />
                </Pressable>
                <View style={styles.toolbarSeparator} />

                {/* 6: Grid/Templates */}
                <Pressable style={styles.toolbarIconButton} onPressIn={() => runImmediateAction('chart.web.templates.open', () => setShowTemplatesMenu(true))} unstable_pressDelay={0}>
                  <TvGrid4 color={isDark ? '#D1D4DC' : '#131722'} />
                </Pressable>

                <View style={styles.toolbarSeparator} />

                {/* 7: Expand */}
                <Pressable style={styles.toolbarIconButton} onPressIn={() => runImmediateAction('chart.web.expand.toggle', () => setIsChartExpanded(!isChartExpanded))} hitSlop={8} unstable_pressDelay={0}>
                  <Ionicons name={isChartExpanded ? "contract-outline" : "expand-outline"} size={16} color={toolbarFullscreenIconColor} />
                </Pressable>

                <View style={styles.toolbarSeparator} />

                {/* 8: More */}
                <Pressable style={styles.toolbarIconButton} onPressIn={() => runImmediateAction('chart.web.moreMenu.open', () => setShowMoreMenu(true))} hitSlop={8} unstable_pressDelay={0}>
                  <Ionicons name="ellipsis-vertical" size={16} color={toolbarNeutralIconColor} />
                </Pressable>
              </View>
            </ScrollView>
          </View>
          <View style={{ flex: 1, flexDirection: 'row' }}>
            {(isChartExpanded || showDrawingToolbar) && (
              <ScrollView
                keyboardShouldPersistTaps="always"
                canCancelContentTouches={Platform.OS === 'ios'}
                style={[styles.leftToolbar, !isChartExpanded && styles.leftToolbarOverlay]}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.leftToolbarContent}
              >
                <div title="Crosshair" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                  <Pressable style={[styles.toolIcon, activeTool === 'crosshair' && styles.toolIconActive]} onPress={() => { setActiveTool('crosshair'); drawingToolsRef.current?.setActiveTool('crosshair'); setShowDrawingToolbar(false); }}><TvCrosshair color={activeTool === 'crosshair' ? BLUE : TEXT_MUTED} /></Pressable>
                </div>
                <div title="Trend Line" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                  <Pressable style={[styles.toolIcon, activeTool === 'trendline' && styles.toolIconActive]} onPress={() => { setActiveTool('trendline'); drawingToolsRef.current?.setActiveTool('trendline'); setShowDrawingToolbar(false); }}><TvTrendLine color={activeTool === 'trendline' ? BLUE : TEXT_MUTED} /></Pressable>
                </div>
                <div title="Fib Retracement" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                  <Pressable style={[styles.toolIcon, activeTool === 'fib' && styles.toolIconActive]} onPress={() => { setActiveTool('fib'); drawingToolsRef.current?.setActiveTool('fib'); setShowDrawingToolbar(false); }}><TvFib color={activeTool === 'fib' ? BLUE : TEXT_MUTED} /></Pressable>
                </div>
                <div title="Text" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                  <Pressable style={[styles.toolIcon, activeTool === 'text' && styles.toolIconActive]} onPress={() => { setActiveTool('text'); drawingToolsRef.current?.setActiveTool('text'); setShowDrawingToolbar(false); }}><TvText color={activeTool === 'text' ? BLUE : TEXT_MUTED} /></Pressable>
                </div>
                <div title="Long Position" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                  <Pressable style={[styles.toolIcon, activeTool === 'prediction' && styles.toolIconActive]} onPress={() => { setActiveTool('prediction'); drawingToolsRef.current?.setActiveTool('prediction'); setShowDrawingToolbar(false); }}><TvPrediction color={activeTool === 'prediction' ? BLUE : TEXT_MUTED} /></Pressable>
                </div>
                <View style={styles.toolSeparator} />
                <div title="Measure" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                  <Pressable style={[styles.toolIcon, activeTool === 'measure' && styles.toolIconActive]} onPress={() => { setActiveTool('measure'); drawingToolsRef.current?.setActiveTool('measure'); setShowDrawingToolbar(false); }}><TvMeasure color={activeTool === 'measure' ? BLUE : TEXT_MUTED} /></Pressable>
                </div>
                <div title="Zoom In" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                  <Pressable style={[styles.toolIcon, activeTool === 'zoom' && styles.toolIconActive]} onPress={() => { setActiveTool('zoom'); drawingToolsRef.current?.setActiveTool('zoom'); setShowDrawingToolbar(false); }}><TvZoom color={activeTool === 'zoom' ? BLUE : TEXT_MUTED} /></Pressable>
                </div>
                <View style={styles.toolSeparator} />
                <div title="Stay in Drawing Mode" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                  <Pressable style={[styles.toolIcon, activeTool === 'stay_in_drawing_mode' && styles.toolIconActive]} onPress={() => { setActiveTool('stay_in_drawing_mode'); drawingToolsRef.current?.setActiveTool('stay_in_drawing_mode'); setShowDrawingToolbar(false); }}><TvStayInDrawingMode color={activeTool === 'stay_in_drawing_mode' ? BLUE : TEXT_MUTED} /></Pressable>
                </div>
                <div title="Lock All Drawings" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                  <Pressable style={[styles.toolIcon, activeTool === 'lock' && styles.toolIconActive]} onPress={() => { setActiveTool('lock'); drawingToolsRef.current?.setActiveTool('lock'); setShowDrawingToolbar(false); }}><TvLock color={activeTool === 'lock' ? BLUE : TEXT_MUTED} /></Pressable>
                </div>
                <div title="Hide All Drawings" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                  <Pressable style={[styles.toolIcon, activeTool === 'hide' && styles.toolIconActive]} onPress={() => { setActiveTool('hide'); drawingToolsRef.current?.setActiveTool('hide'); setShowDrawingToolbar(false); }}><TvHide color={activeTool === 'hide' ? BLUE : TEXT_MUTED} /></Pressable>
                </div>
                <View style={styles.toolSeparator} />
                <div title="Remove Drawings" style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                  <Pressable style={[styles.toolIcon]} onPress={() => { drawingToolsRef.current?.removeAllDrawings(); setActiveTool('crosshair'); }}><TvTrash color={TEXT_MUTED} /></Pressable>
                </div>
              </ScrollView>
            )}
            <View style={{ flex: 1, position: 'relative' }} onLayout={handleLayout}>
              <style>{`#tv-attr-logo { display: none !important; }`}</style>
              {showChartMetaRow && (
                <View pointerEvents="none" style={styles.chartMetaOverlay}>
                  <View style={styles.chartMetaOhlc}>
                    {chartMetaItems.map((item) => (
                      <View key={item.label} style={styles.chartMetaPair}>
                        <Text style={styles.chartMetaLabel}>{item.label}</Text>
                        <Text
                          style={[
                            styles.chartMetaValue,
                            { color: item.color },
                          ]}
                        >
                          {item.value}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Loading Spinner */}
              {isLoading && (
                <View style={styles.chartOverlay}>
                  <ActivityIndicator size="large" color={BLUE} />
                  <Text style={styles.overlayText}>Loading chart data...</Text>
                </View>
              )}

              {/* Error / Retry */}
              {isError && !isLoading && (
                <View style={styles.chartOverlay}>
                  <Ionicons name="cloud-offline-outline" size={36} color={TEXT_MUTED} />
                  <Text style={styles.overlayText}>Unable to load chart</Text>
                  <Text style={styles.overlaySubText}>{chartDataError ?? 'Waiting for market data connection...'}</Text>
                  <View style={styles.overlayActions}>
                    <Pressable accessibilityRole="button" style={styles.overlayAction} onPress={refreshChartHistory}>
                      <Text style={styles.overlayActionText}>Retry</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" style={styles.overlayAction} onPress={handleOpenSymbolPicker}>
                      <Text style={styles.overlayActionText}>Select Symbol</Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {isNoMarketData && (
                <View style={styles.chartOverlay}>
                  <Ionicons name="analytics-outline" size={36} color={TEXT_MUTED} />
                  <Text style={styles.overlayText}>No market data available</Text>
                  <Text style={styles.overlaySubText}>Waiting for backend candle data...</Text>
                  <View style={styles.overlayActions}>
                    <Pressable accessibilityRole="button" style={styles.overlayAction} onPress={refreshChartHistory}>
                      <Text style={styles.overlayActionText}>Retry</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" style={styles.overlayAction} onPress={handleOpenSymbolPicker}>
                      <Text style={styles.overlayActionText}>Select Symbol</Text>
                    </Pressable>
                  </View>
                </View>
              )}

              <div
                ref={chartContainerRef}
                style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
              />

              {/* A Renko brick closes at a price threshold, not a timeframe
                  boundary, so no truthful time countdown exists below price. */}
              <ChartCandleCountdownBadge
                active={isScreenFocused && chartType !== 'renko'}
                candle={sanitizedCandles.length > 0 ? sanitizedCandles[sanitizedCandles.length - 1] : null}
                chartContainerRef={chartContainerRef}
                chartRef={chartRef}
                displayDecimals={displayDecimals}
                downColor={resolvedChartColors.candlesDowntrend || '#EF5350'}
                seriesRef={seriesRef}
                timeframe={chartTimeframe}
                upColor={resolvedChartColors.candlesUptrend || '#2962FF'}
                visible={chartDisplay.showLivePriceLine && candlesAvailable && chartType !== 'renko'}
              />

              {/* Chart Overlay handled natively in lightweight charts or not needed right now */}




              <LiveTvLegend symbol={chartSymbol} styles={styles} displayDecimals={displayDecimals} candles={sanitizedCandles} active={isScreenFocused} />

            </View>
          </View>

          <View style={styles.tvBottomToolbar}>
            <View style={styles.tvRangesLeft}>
              <select
                value={['1d', '5d', '1m', '6m', '1y'].includes(activeDateRange) ? activeDateRange : 'auto'}
                onChange={(e) => handleRangePress(e.target.value as ChartTimeRange)}
                style={{
                  backgroundColor: 'transparent',
                  color: '#787B86',
                  border: 'none',
                  fontSize: 12,
                  fontWeight: '500',
                  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
                  outline: 'none',
                  cursor: 'pointer',
                  paddingLeft: 4,
                }}
              >
                <option value="auto" hidden style={{ backgroundColor: isDark ? '#121212' : '#FFFFFF', color: isDark ? '#FFFFFF' : '#0F172A' }}>{getChartTimeRangeLabel(activeDateRange)}</option>
                <option value="1d" style={{ backgroundColor: isDark ? '#121212' : '#FFFFFF', color: isDark ? '#FFFFFF' : '#0F172A' }}>1 Day</option>
                <option value="5d" style={{ backgroundColor: isDark ? '#121212' : '#FFFFFF', color: isDark ? '#FFFFFF' : '#0F172A' }}>5 Days</option>
                <option value="1m" style={{ backgroundColor: isDark ? '#121212' : '#FFFFFF', color: isDark ? '#FFFFFF' : '#0F172A' }}>1 Month</option>
                <option value="6m" style={{ backgroundColor: isDark ? '#121212' : '#FFFFFF', color: isDark ? '#FFFFFF' : '#0F172A' }}>6 Months</option>
                <option value="1y" style={{ backgroundColor: isDark ? '#121212' : '#FFFFFF', color: isDark ? '#FFFFFF' : '#0F172A' }}>1 Year</option>
              </select>
            </View>
            <View style={styles.tvRangesRight}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginRight: 8 }}>
                <div onClick={() => setShowCalendar(true)} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <Text style={styles.tvRangeDropdownText}>
                    {customDateValue ? customDateValue.toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'Date Range'}
                  </Text>
                  <Ionicons name="chevron-down" size={10} color="#787B86" style={{ marginLeft: 4 }} />
                </div>
                {/* Custom Overlay */}
                <CustomDatePicker
                  visible={showCalendar}
                  onClose={() => setShowCalendar(false)}
                  onSelectDate={(d: Date) => {
                    const yyyy = d.getFullYear();
                    const mm = String(d.getMonth() + 1).padStart(2, '0');
                    const dd = String(d.getDate()).padStart(2, '0');
                    handleCustomDateRange({ target: { value: `${yyyy}-${mm}-${dd}` } } as any);
                  }}
                  bg={isDark ? '#121212' : '#FFFFFF'}
                  text={isDark ? '#FFFFFF' : '#0F172A'}
                  accent={BLUE}
                  borderColor={isDark ? '#2A2E39' : '#E0E3EB'}
                />
              </div>
              <LiveClock style={styles.tvRangeTimeText} suffix="(UTC+5:30)" />
              <Pressable onPress={() => handleRangePress('auto')}>
                <Text style={[styles.tvRangeAutoText, activeDateRange === 'auto' && { color: BLUE }]}>auto</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {!isChartExpanded && (
          <View style={styles.bottomArea}>
            <View style={styles.sentimentLabelsRow}>
              <Text style={styles.sentimentLabelSell}>{sentiment.sellPct}% SELL</Text>
              <Text style={styles.sentimentLabelBuy}>{sentiment.buyPct}% BUY</Text>
            </View>
            <View style={styles.sentimentBarRow}>
              <View style={[styles.sentimentHalf, styles.sentimentSell, { flex: sentiment.sellPct }]} />
              <View style={[styles.sentimentHalf, styles.sentimentBuy, { flex: sentiment.buyPct }]} />
            </View>

            <LiveTradeButtons symbol={chartSymbol} styles={styles} displayDecimals={displayDecimals} lotSize={tradeVolume} seriesRef={seriesRef} createTradeReceipt={createTradeReceipt} active={isScreenFocused} />

            <View style={styles.lotSelectorBar}>
              <Pressable style={styles.lotStepperBtn} onPress={() => updateTradeVolume(incrementTradeVolume(tradeVolume, -1, tradeVolumeBounds))}>
                <Ionicons name="remove" size={18} color={T.textSub} />
              </Pressable>
              <Text style={styles.lotLabelText}>Lot:</Text>
              <TextInput
                style={styles.lotInput}
                value={lotInput}
                onChangeText={(text) => setLotInput(sanitizeTradeVolumeDraft(text))}
                onBlur={commitLotDraft}
                onSubmitEditing={commitLotDraft}
                keyboardType="decimal-pad"
                returnKeyType="done"
                placeholder={formatTradeVolume(tradeVolume, tradeVolumeBounds)}
                placeholderTextColor={T.textMuted}
              />
              <Pressable style={styles.lotStepperBtn} onPress={() => updateTradeVolume(incrementTradeVolume(tradeVolume, 1, tradeVolumeBounds))}>
                <Ionicons name="add" size={18} color={T.textSub} />
              </Pressable>
            </View>
          </View>
        )}
      </View>

      <ActionSheet
        visible={tfOpen}
        onClose={() => setTfOpen(false)}
        presentation="mt5TimeframeGrid"
        detent="auto"
        instantOpen
        actions={timeframes.map((tf) => ({ label: tf, selected: tf === chartTimeframe, onPress: () => handleTimeframeSelect(tf) }))}
      />

      <ActionSheet
        visible={symbolPickerOpen}
        onClose={() => setSymbolPickerOpen(false)}
        title='Select Symbol'
        searchable={true}
        compactText
        detent='adaptive'
        instantOpen
        runActionAfterClose={false}
        actions={availableSymbols.map((sym) => ({
          label: sym,
          subtitle: resolveChartSymbolFullName(sym),
          onPress: () => handleSymbolSelect(sym),
        }))}
      />

      <ActionSheet
        visible={showTemplatesMenu}
        onClose={() => setShowTemplatesMenu(false)}
        title='Templates & Layouts'
        detent="adaptive"
        instantOpen
        actions={[
          { label: 'Save Indicator Template', onPress: () => setShowTemplatesMenu(false) },
          { label: 'Apply Default Template', onPress: () => setShowTemplatesMenu(false) },
          { label: 'Multi-Chart Layout', onPress: () => setShowTemplatesMenu(false) },
        ]}
      />

      {/* Area and Renko use the same persisted chart-type selection flow as
          the original visual types; only their downstream rendering differs. */}
      <ActionSheet
        visible={showChartTypeMenu}
        onClose={() => setShowChartTypeMenu(false)}
        title='Chart Type'
        detent="auto"
        instantOpen
        presentation="mt5Plain"
        actions={[
          { label: 'Candlestick', onPress: () => setChartVisualType('candles') },
          { label: 'Hollow Candles', onPress: () => setChartVisualType('hollow') },
          { label: 'Renko', onPress: () => setChartVisualType('renko') },
          { label: 'Line', onPress: () => setChartVisualType('line') },
          { label: 'Area', onPress: () => setChartVisualType('area') },
        ]}
      />

      <ActionSheet
        visible={showMoreMenu}
        onClose={() => setShowMoreMenu(false)}
        title='Options'
        detent="adaptive"
        instantOpen
        actions={[
          {
            label: 'Chart Preferences',
            icon: <Ionicons name="options-outline" size={20} color={TEXT_MUTED} />,
            onPress: () => runImmediateAction('chart.web.settings.open', () => {
              setShowMoreMenu(false);
              hideChartConfigDestination();
              showChartSettingsHost();
            }),
          },
          {
            label: 'Remove from favorites',
            icon: <Ionicons name="star" size={20} color={TEXT_MUTED} />,
            onPress: () => {
              setShowMoreMenu(false);
              useUserPreferences.getState().removeQuoteSymbol(chartSymbol);
            }
          },
          {
            label: 'Trading calculator',
            icon: <Ionicons name="calculator-outline" size={20} color={TEXT_MUTED} />,
            onPress: () => { setShowMoreMenu(false); router.push({ pathname: '/chart/calculator', params: { symbol: chartSymbol } }); }
          },
          {
            label: 'Analytics',
            icon: <Ionicons name="analytics-outline" size={20} color={TEXT_MUTED} />,
            onPress: () => { setShowMoreMenu(false); router.push({ pathname: '/chart/analytics', params: { symbol: chartSymbol } }); }
          },
          {
            label: 'Specification',
            icon: <Ionicons name="clipboard-outline" size={20} color={TEXT_MUTED} />,
            onPress: () => { setShowMoreMenu(false); router.push({ pathname: '/chart/specification', params: { symbol: chartSymbol } }); }
          },
        ]}
      />

      <TradingSignalDetailsModal
        visible={showSignalDetails}
        onClose={() => setShowSignalDetails(false)}
        symbol={chartSymbol}
      />
      <ChartTradeReceiptStack
        controller={tradeReceiptController}
        isDark={isDark}
        buyColor={BLUE}
        sellColor={RED}
        topOffset={64}
        bottomOffset={160}
        pendingLabel="sent"
      />
    </Screen>
  );
}
