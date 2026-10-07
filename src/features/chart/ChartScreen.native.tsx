import { GDark, GLight } from '../../ui/theme/glass';
import { FastPressable as Pressable } from '../../ui/components/FastPressable';
/**
 * Core Charting Interface for iOS/Android
 * 
 * This component provides high-performance charting for mobile devices using a WebView bridge.
 * It strictly decouples heavy data crunching from the React Native JS thread.
 * 
 * Key Architecture:
 * - WebView Bridge: Injects tradingview lightweight-charts HTML/JS into an isolated web view context.
 * - Zero-Latency Streams: Pipes WebSocket ticks directly into the WebView using injectJavaScript() and requestAnimationFrame, 
 *   bypassing the React Native bridge's slow JSON serialization.
 * - Micro-Components: Extracts fast-updating UI (like the live price pill) into memoized blocks isolated from the main layout.
 */
import { Ionicons } from '@expo/vector-icons';
import { AppMenuIcon } from '../../ui/components/AppMenuIcon';
import { useIsFocused } from '@react-navigation/native';
import { useAuthMarketDemandAllowed } from '../trade/useAuthMarketVisibility';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, type AppStateStatus, Dimensions, Keyboard, PanResponder, Platform, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { Gesture } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDeferredActiveFlag } from '../../hooks/useDeferredActiveFlag';
import { useLatchedFlag } from '../../hooks/useLatchedFlag';
import { useNextFrameValue } from '../../hooks/useNextFrameValue';
import { useChartSurfaceStartupBoot } from './useChartSurfaceStartupBoot';
import {
  ChartTapRadialMenu,
  type ChartTapMenuAnchor,
  type ChartTapMenuBounds,
} from './components/ChartTapRadialMenu';
import { ChartTimeframePickerOverlay } from './components/ChartTimeframePickerSheet';
import {
  hideChartTimeframePicker,
  showChartTimeframePicker,
} from './chartTimeframePickerController';
import {
  ChartDrawingToolsSidebar,
} from './components/ChartDrawingToolsFeature';
import {
  createDrawingQuickActionsSheetActions,
  createDrawingToolsActionSheetActions,
  createSelectedDrawingActionSheetActions,
} from './drawingTools';
import { dismissBeforeDrawingToolsSelection } from './drawingTools/actionSheetSelection';
import {
  TextLevelEditOverlay,
  type TextLevelEditRequest,
} from './drawingTools/TextLevelEditOverlay';
import type { FixedHorizontalGridPlotArea } from './components/ChartFixedHorizontalGridOverlay';
import {
  ChartTradeInlineFooter,
  ChartTradeOverlayLayer,
} from './components/ChartTradeFeature';
import {
  ChartTradeOverlayLiveBridge,
  type ChartTradeOverlayLiveQuote,
} from './components/ChartTradeOverlayLiveBridge';
import { ChartTradeButtons } from './components/ChartTradeButtonsFeature';
import {
  INVESTOR_READ_ONLY_MESSAGE,
  INVESTOR_READ_ONLY_TITLE,
  isActiveSessionInvestorReadOnly,
} from '../../state/investorReadOnlySession';
import {
  ChartTradeReceiptStack,
  createChartTradeReceiptStackController,
  type ChartTradeQueueEvent,
} from './components/ChartTradeReceiptStack';
import { LiveOrderTickExecutionGraph } from '../trade/OrderTickExecutionGraph';
import { Screen } from '../../ui/components/Screen';
import { BrokerFeedHealthBanner } from '../../market/BrokerFeedHealthBanner';
import {
  cancelRetainedActionSheetPreview,
  commitRetainedActionSheetPreview,
  requestRetainedActionSheetPreview,
} from '../../ui/components/ActionSheet/retainedActionSheetVisualController';
import { openSidebarDrawerImmediately, scheduleAfterSidebarOpenVisual } from '../../ui/components/sidebarDrawerController';
import { useTranslation } from '../../i18n/useTranslation';
import {
  type ChartDisplaySettings,
  type ChartTradeVolumeDisplayMode,
  type ChartVisualType,
  type ThemeMode,
  resolveChartColorsForTheme,
  useUserPreferences,
} from '../../state/userPreferences';
import { registerImmediateThemeVisualApplier, useIsDarkTheme } from '../../state/themeMode';
import { useUIState } from '../../state/uiState';
import { fmt } from '../../utils/format';
import { redactSensitiveString } from '../../utils/securityRedaction';
import { useTheme } from '../../ui/theme/useTheme';
import { resolveBottomTabBarHeight } from '../../ui/layout/bottomTabBar';
import { useLiveCandles } from '../../domain/candles/hooks/useLiveCandles';
import { INITIAL_HISTORY_LIMIT, liveCandlesEngine } from '../../api/ws/liveCandlesEngine';
import { quotesWsService, type QuoteTickEvent } from '../../api/ws/quotesSocket';
import { orrnnDemoPublicMarketSocket } from '../../api/ws/orrnnDemoPublicMarketSocket';
import {
  isOrrnnDemoPublicMarketSelection,
  ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE,
} from '../../api/orrnnDemoPublicMarket';
import { useLiveAccountState } from '../../state/liveAccountState';
import { recordAppActionJournalEvent } from '../../state/terminalJournalState';
import { useOrdersByLoginQuery } from '../../query/orders';
import { TradeFeedbackModal, TradeFeedbackState, TRADE_MODAL_INITIAL } from '../../ui/components/TradeFeedbackModal';
import { ChartTradeFeedbackPortal } from '../../ui/navigation/ChartTradeSheetPortal';
import { resolveConfirmedTradeReceipt } from '../../ui/components/tradeFeedbackPresentation';
import { useConfirmedTradeReceiptAutoDismiss } from '../../ui/components/useConfirmedTradeReceiptAutoDismiss';
import { ordersApi } from '../../api/orders';
import { resolveBrokerExecutionEvidence } from '../../api/orders/executionEvidence';
import { classifyTradingError, createFrontendTradingError } from '../../api/tradingErrors';


import { usePositionsState } from '../../state/positionsState';
import {
  captureActiveBrokerSession,
  getActiveBrokerSessionProvenance,
  isActiveBrokerSessionProvenanceCurrent,
} from '../../state/activeBrokerSession';
import { resolveTradingLogin, resolveTradingLoginString } from '../../state/tradingLogin';
import { prepareOrderTicketLaunch } from '../trade/orderTicketLaunchController';
import {
  captureModifyPositionSessionKey,
  getModifyPositionTicketState,
  isModifyPositionSessionKeyCurrent,
  submitModifyPosition,
  useModifyPositionTicketState,
} from '../trade/modifyPositionCoordinator';
import {
  getActiveSltpUnavailableMessage,
  isExistingPositionModifyBackendLocked,
  isNewMarketOrderProtectionBackendLocked,
  isPendingOrderTypeBackendLocked,
  isPendingOrderProtectionBackendLocked,
  SLTP_COMING_SOON_TITLE,
} from '../trade/tradeBackendCapabilities';
import { requestOrrnnDemoTradeAuth } from '../trade/tradeAuthPrompt';
import {
  ORDER_TICKET_ROUTE_MODULE_CACHE_KEY,
  loadOrderTicketScreenRoute,
} from '../trade/orderTicketScreenPreload';
import { preloadDeferredRouteModule } from '../../ui/components/DeferredRouteMount';
import { usePositionHistoryQuery } from '../../query/positions';
import { useChartDealsQuery } from '../../query/deals';
import { useAlertsQuery } from '../../query/alerts';
import { useMarketSymbols } from '../../query/market';
import { buildAvailableChartSymbols, resolveBrokerChartSymbol } from './chartBrokerSymbols';
import { useAccountSummary } from '../../query/account';
import { useInstrumentMeta } from '../../query/instruments';
import { useMarketStatus } from '../../query/marketStatus';
import { useRemoveWatchlistMutation } from '../../query/watchlist';
import {
  getActiveBrokerCredentialScopeKey,
  useActiveBrokerCredentialScopeKey,
  useActiveBrokerQuerySession,
} from '../../query/authenticatedQueryScope';
import { createCoalescedSessionRefreshScheduler } from '../../query/coalescedSessionRefresh';
import { WebView } from 'react-native-webview';
import { hasLiveQuoteFeedData, useLiveSymbolQuote } from '../../query/websocket';
import {
  getCurrentLiveQuoteSnapshot,
  useLiveQuoteSnapshot,
  useWatchlistLiveQuotes,
} from '../quotes/useLiveQuotes';
import { normalizeSymbol } from '../../domain/symbols';
import {
  quoteActionBlockMessage,
  recordBlockedPriceAction,
  resolveSessionQuoteActionAvailability,
} from '../../market/quoteIntegrity';
import { normalizeTimeframe } from '../../domain/candles/core/candles';
import {
  hasOnlyRepeatedFlatCandles,
  sanitizeCandlesForChart,
} from '../../domain/candles/normalization/chartAdapter';
import {
  buildRenkoBricks,
  resolveRenkoMinimumPriceIncrement,
} from '../../domain/candles/renko';
import { resolveStableRenkoBrickSize } from './renkoBrickSizeCache';
import {
  getBucketGapCount,
  getExpectedNextCandleTime,
} from '../../domain/candles/core/timeframeUtils';
import {
  applyChartOpenPositionLabelPatches,
  buildChartTradeHistoryOverlay,
  buildChartOpenPositionLabelPatches,
  buildChartOverlayMarkers,
  buildChartPositionStopDragKey,
  buildChartOverlayPayload,
  CHART_LINE_STYLE,
  formatTpSlOverlayLabel,
  formatTpSlOverlayValueLabel,
  normalizeChartOverlaySymbol,
  parseChartPositionStopDragKey,
  type ChartOverlayMarker,
  type ChartOverlayPriceLine,
  type ChartOverlayTradeHistorySegment,
  type ChartOpenPositionLabelPatch,
  type ChartPositionStopDragTarget,
} from './chartOverlays';
import {
  createChartTradeOpeningRetentionState,
  retainChartTradeOpenings,
} from './chartTradeOpeningRetention';
import {
  buildChartMarkerCandleTimeSignature,
  buildChartPositionStructuralSignature,
} from './chartRenderIsolation';
import { resolveChartDisplayDecimals } from './chartPricePrecision';
import { resolveAreaChartDirectionForRange } from './areaChartDirection';
import { useAreaChartHistoryExpansion } from './useAreaChartHistoryExpansion';
import { isPriceCoherentWithCandle } from '../../domain/candles/series/priceCoherence';
import {
  getChartDrawingBucketKey,
  sanitizePersistedChartDrawings,
  type PersistedChartDrawing,
} from './drawingPersistence';
import {
  buildChartSeriesSnapshot,
  EMPTY_CHART_SERIES_SNAPSHOT,
  getChartSeriesUpdateMode,
  shouldResetViewportForClosedMarketClamp,
  shouldResetViewportForHistorylessBootstrap,
} from './liveChartSync';
import { getMarketCloseSeparator, getPeriodSeparators } from './periodSeparators';
import { useShallow } from 'zustand/shallow';
import { recordUiFeedGap } from '../../dev/uiInteractionDiagnostics';
import { runImmediateAction } from '../../utils/actionLatency';
import {
  hideChartConfigDestination,
} from './chartConfigDestinationController';
import { showChartSettingsHost } from './chartSettingsHostController';
import {
  hideChartActionLaunch,
  prepareChartActionLaunch,
  scheduleChartActionLaunchNavigation,
  showChartActionLaunch,
} from './chartActionLaunchController';
import { createChartContextCommitScheduler } from './chartContextCommitScheduler';
import { scheduleAfterFirstFrame, scheduleIdleWork } from '../../utils/startupScheduler';
import {
  hideChartSymbolPickerSheet,
  isChartSymbolPickerSheetActive,
  preloadChartSymbolPickerSheet,
  showChartSymbolPickerSheet,
  type ChartSymbolPickerSheetConfig,
} from './chartSymbolPickerSheetController';
import { getDevRefreshKey, hashDevRefreshSource } from '../../dev/devRefreshKey';
import {
  formatTradeVolume,
  incrementTradeVolume,
  isValidTradeVolume,
  normalizeTradeVolume,
  resolveTradeVolumeBounds,
  sanitizeTradeVolumeDraft,
} from '../../utils/tradeVolume';
import {
  resolveChartVisibleRange,
  type ChartTimeRange,
} from './timeRangePresets';
import {
  CHART_ORDER_TYPES,
  getChartOrderSide,
  isPendingChartOrderType,
  isPendingChartTradeValid,
  isStopLimitChartOrderType,
  resolveStablePendingChartTradeEnabled,
  resolveDefaultStopLimitPrice,
  validateChartTradeProtectionLevels,
  type ChartOrderType,
} from './chartTradeOrderUtils';
import {
  type FooterLotPickerMode,
  resolveChartSltpToolbarTapMode,
  resolveChartTradeSheetCollapsedHeight,
  resolveChartTradeSheetHeaderLift,
  resolveChartTradeSheetMaxHeight,
  resolveChartTradeSheetPortalHostHeight,
  resolveChartTradeSheetTopInset,
  resolveChartTradeSheetHostHeight,
  resolveFooterLotCommitDraft as resolveFooterLotCommitDraftValue,
  resolveKeyboardDockOffset,
  resolveKeyboardResizesHost,
  resolveFooterTradeRowState,
  shouldSuppressChartTapMenu,
  shouldHideChartTabBarForTradeInput,
  shouldShowChartTradePreviewOnChart,
  shouldShowChartTradeSheetHeader,
} from './chartTradeInteractionUtils';
import {
  prefetchChartSelectionHistory,
  prefetchInstrument,
  prefetchOrderTicketData,
} from '../../utils/navigationPrefetch';
import { roundOrderTicketPrice } from '../trade/orderTicketPreviewUtils';
import { recordMarketDataEvent } from '../../market/marketDataTelemetry';
import {
  resolveChartMarketSessionPolicy,
  shouldRefreshChartHistoryOnSessionTransition,
  type ChartQuoteSessionPhase,
} from '../../market/chartMarketSessionPolicy';
import { CH_HTML } from "./rendering/ChartWebViewHtml";
import {
  buildChartInitSignature,
  readChartInitContextEpoch,
  shouldAcceptChartDataPaint,
  shouldAcceptChartReady,
} from './rendering/chartReadyContext';
import { makeStyles } from "./ChartScreen.styles";
import { PendingOrderPreviewChart } from "./components/PendingOrderPreviewChart";
import { LiveQuotePairHeader } from "./components/ChartLiveHeaders";
import { ChartStepperModal, ChartFooterLotPicker, ChartTradeVolumeSlider } from "./components/ChartTradeControls";
import { resolveChartTradeButtonQuote } from "./components/ChartTradeButtonsFeature/quoteFallback";
import { CHART_HEADER_GLYPH_SIZE, CHART_HEADER_ICON_SIZE, TvCrosshair, TvLayers, TvTradeClock } from "./components/ChartToolbarIcons";
import { ChartWindowManagerOverlay } from './components/ChartWindowManagerOverlay';
import {
  ChartWindowsLayout,
  type ChartWindowPaneFrame,
} from './components/ChartWindowsLayout';
import { useChartWindowsFeature } from './useChartWindowsFeature';
import { useChartWindowVisualPreferences } from './useChartWindowVisualPreferences';
import {
  useChartWindowToolbarRouter,
  type ChartWindowToolbarTargetConfirmation,
} from './useChartWindowToolbarRouter';
import {
  resolveChartWindowCommandOwnerPaneId,
  shouldReleaseChartWindowOwnedAction,
} from './chartWindowActionOwnership';
import {
  collapseChartDrawingsToSingleWindow,
  expandChartDrawingsForSplitWindows,
  isChartDrawingForWindowContext,
  isChartDrawingForWindowPane,
  replaceChartWindowPaneDrawings,
} from './chartWindowDrawingScope';
import {
  getChartWindowDrawingHistoryAvailability,
  getChartWindowDrawingHistoryKey,
  reconcileChartWindowDrawingHistory,
  recordChartWindowDrawingChange,
  redoChartWindowDrawingHistory,
  undoChartWindowDrawingHistory,
  type ChartWindowDrawingHistory,
} from './chartWindowDrawingHistory';
import {
  isChartWindowRadialMenuRequestConfirmed,
  mapChartWindowGestureToMenuAnchor,
  type ChartWindowRadialMenuRequest,
} from './chartWindowRadialMenu';
import { ChartTapMenuViewport, CHART_AREA_TIME_SCALE_MIN_BAR_SPACING, CHART_AXIS_DIVIDER_DARK_COLOR as MT5_DARK_AXIS_BORDER_COLOR, CHART_AXIS_DIVIDER_LIGHT_COLOR as MT5_LIGHT_AXIS_BORDER_COLOR, CHART_DEFAULT_TIME_SCALE_BAR_SPACING, CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET, CHART_DEFAULT_TIME_SCALE_MIN_BAR_SPACING, CHART_DRAWING_MAGNET_THRESHOLD_PX, CHART_GRID_LINE_STYLE, CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH, CHART_TAP_MENU_LOT_INPUT_SUPPRESSION_MS, CHART_TIME_SCALE_FIX_LEFT_EDGE, CHART_TIME_SCALE_FIX_RIGHT_EDGE, CHART_TRADE_COMPACT_SHEET_TOP_GAP, CHART_TRADE_INLINE_FOOTER_FALLBACK_HEIGHT, CHART_TRADE_SHEET_TOP_GAP, CHART_VIEWPORT_TOUCH_FAILSAFE_MS, formatLooseTradeVolumeLabel, resolveMaxTradeVolumeForMargin, getChartTradeContractSize, resolveVisibleTradeStopPreviewPrice, timeframes, ChartTradeTypeTabLayout, ChartTradePreviewDragKey, TextInputCommitEvent, type ChartVisiblePriceRange } from "./ChartScreen.constants";
import {
  SYMBOL_FLAGS,
  SYMBOL_LOGOS,
  resolveChartSymbolCategory,
  resolveChartSymbolFullName,
  resolveChartSymbolKey,
} from './chartSymbolMetadata';
import { type ChartShowOnChartKey } from './chartShowOnChart';
import {
  captureExactChartQuote,
  readExactChartQuoteForScope,
  selectNewestExactChartQuote,
  type ExactChartQuoteInput,
  type ExactChartQuoteSnapshot,
} from './exactChartQuote';
import {
  accumulateChartBidTick,
  projectChartLiveTickCandles,
  type ChartLiveTickAccumulator,
} from './chartLiveTickAccumulator';
import { resolveContextScopedChartCandles } from './chartContextScopedCandles';
import {
  buildChartProtectionPositionSignature,
  createChartProtectionDraftId,
  hasChartProtectionDraftReconciled,
  releaseChartProtectionDraftSubmission,
  subscribeChartProtectionDraftExecution,
  subscribeChartProtectionDraftSubmission,
  type ChartProtectionDraftExecutionEvent,
} from './chartProtectionDraftLifecycle';

// Quotes own Bid/Ask display and execution eligibility; candles independently
// own O/H/L/C. Never substitute a candle close for a missing quote side.


const getSentimentForSymbol = (symbol: string) => {
  const now = new Date();
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
  }
  // Rotate every hour using day + hour so sentiment feels live
  const seed = Math.abs(hash + now.getDate() * 24 + now.getHours());
  // Add minute-based micro-drift (±3%) so it shifts slightly within the hour
  const drift = (now.getMinutes() % 7) - 3;
  const buyPct = Math.max(10, Math.min(90, 15 + (seed % 71) + drift));
  return { buyPct, sellPct: 100 - buyPct };
};

const CHART_SOURCE = { html: CH_HTML };
const chartTradeResultRefreshScheduler = createCoalescedSessionRefreshScheduler();
const CHART_DEV_SOURCE_KEY = getDevRefreshKey(
  'chart-native-webview',
  typeof __DEV__ !== 'undefined' && __DEV__ ? hashDevRefreshSource(CH_HTML) : '',
);
const CHART_BRIDGE_DEBUG = false;
// The tiny Buy/Sell button and canonical WebView live-paint bridge own their
// own frame-cadence subscriptions. These intervals isolate only the giant
// Chart host's metadata/overlay React renders; they never delay candle/line
// painting.
const CHART_SCREEN_QUOTE_COMMIT_INTERVAL_MS = 400;
const CHART_SCREEN_CANDLE_COMMIT_INTERVAL_MS = 400;
const CHART_LIVE_PAINT_FALLBACK_MS = 64;
const CHART_SYMBOL_HEADER_HIT_SLOP = { top: 10, bottom: 18, left: 16, right: 48 };
const CHART_OHLC_NEUTRAL_DARK_COLOR = '#FFFFFF';
const CHART_OHLC_NEUTRAL_LIGHT_COLOR = '#0F172A';
const CHART_OHLC_HIGH_COLOR = GDark.trading.profit;
const CHART_OHLC_LOW_COLOR = '#F23645';
// The chart document recognizes double taps for 350 ms. Leave enough bridge
// margin for CHART_DOUBLE_TAP to cancel promotion on a busy JS thread; toolbar
// ownership is claimed immediately, so actions do not wait for this timeout.
const CHART_WINDOW_FULL_PANE_SINGLE_TAP_DELAY_MS = 430;

const CHART_SCALE_DISPLAY_ITEMS: Array<{
  key: keyof ChartDisplaySettings;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
    { key: 'showTicker', label: 'Show ticker', icon: 'pricetag-outline' },
    { key: 'showOHLC', label: 'Show OHLC', icon: 'stats-chart-outline' },
    { key: 'showQuickTradingButtons', label: 'Show quick trading buttons', icon: 'flash-outline' },
    { key: 'showLivePriceLine', label: 'Show live price line', icon: 'pulse-outline' },
    { key: 'showLastPriceLine', label: 'Show last price line', icon: 'ellipse-outline' },
    { key: 'showGrid', label: 'Show grid', icon: 'grid-outline' },
    { key: 'periodSeparators', label: 'Period separators', icon: 'reorder-three-outline' },
    { key: 'showObjectDescriptions', label: 'Show object descriptions', icon: 'text-outline' },
    { key: 'showTradeLevels', label: 'Show trade levels', icon: 'shield-checkmark-outline' },
    { key: 'showTradeHistory', label: 'Show trade history', icon: 'git-compare-outline' },
  ];

const CHART_DISPLAY_TO_SHOW_ON_CHART_KEY: Partial<Record<keyof ChartDisplaySettings, ChartShowOnChartKey>> = {
  showTradeLevels: 'slTpLevels',
};

type ChartLiveQuoteTickFields = {
  time?: unknown;
  timestamp?: unknown;
  t?: unknown;
};

type ChartLiveOhlcCandle = Readonly<{
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}>;

type ChartLiveOhlcListener = (candle: ChartLiveOhlcCandle | null) => void;

const ChartLiveOhlcRow = React.memo(function ChartLiveOhlcRow({
  contextKey,
  fallbackCandle,
  subscribe,
  displayDecimals,
  neutralColor,
  isDark,
  rowStyle,
  pairStyle,
  labelStyle,
  valueStyle,
}: {
  contextKey: string;
  fallbackCandle: ChartLiveOhlcCandle | null;
  subscribe: (listener: ChartLiveOhlcListener) => () => void;
  displayDecimals: number;
  neutralColor: string;
  isDark: boolean;
  rowStyle: any;
  pairStyle: any;
  labelStyle: any;
  valueStyle: any;
}) {
  const [liveCandle, setLiveCandle] = useState<ChartLiveOhlcCandle | null>(null);
  useEffect(() => {
    setLiveCandle(null);
    return subscribe(setLiveCandle);
  }, [contextKey, subscribe]);

  const candle =
    liveCandle && (!fallbackCandle || liveCandle.time >= fallbackCandle.time)
      ? liveCandle
      : fallbackCandle;
  const formatValue = (value: number | null | undefined) =>
    Number.isFinite(value) ? Number(value).toFixed(displayDecimals) : '--';
  const items = [
    { label: 'O', value: formatValue(candle?.open), color: neutralColor },
    { label: 'H', value: formatValue(candle?.high), color: isDark ? CHART_OHLC_HIGH_COLOR : GLight.trading.profit },
    { label: 'L', value: formatValue(candle?.low), color: CHART_OHLC_LOW_COLOR },
    { label: 'C', value: formatValue(candle?.close), color: neutralColor },
  ];
  const textShadowColor = isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)';
  const textShadow = {
    textShadowColor,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  };

  return (
    <View style={rowStyle}>
      {items.map((item) => (
        <View key={item.label} style={pairStyle}>
          <Text style={[labelStyle, textShadow]}>{item.label}:</Text>
          <Text style={[valueStyle, textShadow, { color: item.color }]}>{item.value}</Text>
        </View>
      ))}
    </View>
  );
});

type ChartManualPriceScaleSnapshot = ChartVisiblePriceRange & {
  referenceSpan: number;
};

const buildChartTickPayload = (
  candle: { time: number; open: number; high: number; low: number; close: number; volume?: number },
  chartType: ChartVisualType,
) => {
  // Line and Area accept a single closing-price value. Every OHLC-shaped type,
  // including already-built Renko bricks, uses the shared candle payload below.
  if (chartType === 'line' || chartType === 'area') {
    return { time: candle.time, value: candle.close };
  }

  return {
    time: candle.time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume ?? 0,
  };
};

// Stable empty reference for the display series so the "no history yet" branch
// of `sanitizedCandles` doesn't churn referential identity each render.
const EMPTY_DISPLAY_CANDLES = Object.freeze(
  [],
) as unknown as ReturnType<typeof sanitizeCandlesForChart>;
const EMPTY_CHART_QUERY_ROWS = Object.freeze([]) as unknown as [];
const EMPTY_CHART_OVERLAY_MARKERS = Object.freeze([]) as unknown as ChartOverlayMarker[];
const EMPTY_CHART_TRADE_HISTORY_SEGMENTS = Object.freeze(
  [],
) as unknown as ChartOverlayTradeHistorySegment[];

const getChartSnapshotSignature = (snapshot: ReturnType<typeof buildChartSeriesSnapshot>): string =>
  [
    snapshot.length,
    snapshot.firstTime ?? 'null',
    snapshot.lastTime ?? 'null',
    snapshot.lastSignature,
    snapshot.previousLastSignature,
    snapshot.tailWithoutLastSignature,
  ].join('|');

type HistorylessBootstrapViewport = {
  contextKey: string;
  snapshot: ReturnType<typeof buildChartSeriesSnapshot>;
};

const EMPTY_HISTORYLESS_BOOTSTRAP_VIEWPORT: HistorylessBootstrapViewport = {
  contextKey: '',
  snapshot: EMPTY_CHART_SERIES_SNAPSHOT,
};

type ChartDrawingPriceCandle = {
  open: number;
  high: number;
  low: number;
  close: number;
};

const LEGACY_DRAWING_PRICE_RANGE_MULTIPLE = 4;
const LEGACY_DRAWING_RELATIVE_PRICE_TOLERANCE = 0.2;
const LEGACY_UNSCOPED_DRAWING_KINDS = new Set<PersistedChartDrawing['kind']>(['fib', 'measure']);
const CHART_NO_DRAWING_TOOL = 'none';
const CHART_CROSSHAIR_TOOL = 'crosshair';
const isChartDrawingInputTool = (tool: string | null | undefined): tool is string =>
  typeof tool === 'string' && tool !== CHART_NO_DRAWING_TOOL && tool !== CHART_CROSSHAIR_TOOL;

const isChartDrawingRecordForCurrentChart = (
  drawing: PersistedChartDrawing,
  chartSymbol: string,
  chartTimeframe: string,
  chartWindowPaneId?: string,
): boolean => {
  if (LEGACY_UNSCOPED_DRAWING_KINDS.has(drawing.kind) && (!drawing.symbol || !drawing.timeframe)) {
    return false;
  }

  if (drawing.symbol && getChartDrawingBucketKey(drawing.symbol) !== getChartDrawingBucketKey(chartSymbol)) {
    return false;
  }

  if (drawing.timeframe && normalizeTimeframe(drawing.timeframe) !== normalizeTimeframe(chartTimeframe)) {
    return false;
  }

  if (chartWindowPaneId && !isChartDrawingForWindowPane(drawing, chartWindowPaneId)) {
    return false;
  }

  return true;
};

const isDrawingPriceCompatibleWithCandles = (
  drawing: PersistedChartDrawing,
  candles: readonly ChartDrawingPriceCandle[],
): boolean => {
  if (candles.length === 0 || drawing.points.length === 0) {
    return true;
  }

  let minPrice = Number.POSITIVE_INFINITY;
  let maxPrice = Number.NEGATIVE_INFINITY;
  candles.forEach((candle) => {
    minPrice = Math.min(minPrice, candle.open, candle.high, candle.low, candle.close);
    maxPrice = Math.max(maxPrice, candle.open, candle.high, candle.low, candle.close);
  });

  if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice)) {
    return true;
  }

  const span = Math.max(0, maxPrice - minPrice);
  const reference = Math.max(Math.abs(maxPrice), Math.abs(minPrice), 1);
  const tolerance = Math.max(
    span * LEGACY_DRAWING_PRICE_RANGE_MULTIPLE,
    reference * LEGACY_DRAWING_RELATIVE_PRICE_TOLERANCE,
  );

  return drawing.points.every((point) => {
    if (!Number.isFinite(point.price)) {
      return false;
    }

    return point.price >= minPrice - tolerance && point.price <= maxPrice + tolerance;
  });
};

const filterChartDrawingRecordsForCurrentChart = (
  drawings: readonly PersistedChartDrawing[],
  chartSymbol: string,
  chartTimeframe: string,
  candles: readonly ChartDrawingPriceCandle[] = [],
  chartWindowPaneId?: string,
): PersistedChartDrawing[] =>
  drawings.filter(
    (drawing) =>
      isChartDrawingRecordForCurrentChart(
        drawing,
        chartSymbol,
        chartTimeframe,
        chartWindowPaneId,
      ) &&
      isDrawingPriceCompatibleWithCandles(drawing, candles),
  );

const CHART_RUNTIME_ACTIVE_DELAY_MS = 0;
// Background recovery work can wait a beat; first paint must not.
const CHART_FOCUS_WORK_DELAY_MS = 120;
// Surface mounts on the first real Chart focus with no multi-hundred-ms gate.
const CHART_SURFACE_MOUNT_DELAY_MS = 0;
// Let Quotes finish its first visible paint, then warm only the anonymous REST
// baseline. The live public candle subscription remains focus-gated.
const PUBLIC_CHART_HISTORY_STARTUP_PREFETCH_DELAY_MS = 500;
const PUBLIC_CHART_HISTORY_STARTUP_PREFETCH_TIMEOUT_MS = 1500;
const CHART_WATCHDOG_INTERVAL_MS = 3000;
const CHART_INIT_RETRY_MIN_MS = 5000;
const CHART_DATA_PAINT_ACK_RETRY_MAX = 2;
// A genuinely wedged renderer needs a new native WebView, not another command
// sent to the same unresponsive document. Keep recreation bounded per exact
// symbol/timeframe visit so a persistently broken page cannot churn processes.
const CHART_WEBVIEW_PAINT_STALL_RECOVERY_MAX = 2;
/**
 * No-loader symbol revisit flow, for example EURUSD -> BTCUSD -> EURUSD:
 * 1. Native and the current WebView remember the last 16 charts that painted successfully.
 * 2. The symbol picker asks the WebView to restore a remembered chart before changing state.
 * 3. The WebView clears the old symbol's decorations, paints the cached candles, and replies.
 * 4. Native commits the symbol only after that exact reply. A miss uses the normal loading path.
 *
 * This is an in-memory session cache. A WebView remount, account change, or incompatible chart
 * appearance starts safely from an empty cache instead of showing stale market data.
 */
const CHART_PAINTED_CONTEXT_LRU_MAX = 16;
// Older Android devices can spend several frames cloning and applying a warm
// series before the WebView -> native acknowledgement crosses the bridge.
// Keep the bounded miss fallback, but do not turn a valid warm hit into the
// normal loading path merely because that round trip exceeded one frame.
const CHART_CONTEXT_ACTIVATION_TIMEOUT_MS = 1_500;
const MT5_LIGHT_GRID_COLOR = 'rgba(0,0,0,0.09)';
const ChartScreenInner = React.memo(function ChartScreenInner({
  isChartRouteActive,
  isTradeExecutionFocused,
  marketDemandAllowed,
}: {
  isChartRouteActive: boolean;
  isTradeExecutionFocused: () => boolean;
  marketDemandAllowed: boolean;
}) {
  const T = useTheme();
  const { t } = useTranslation();
  // isChartRouteActive is provided by the thin ChartScreen wrapper below, so this
  // giant component (memoized) only re-renders when the chart's active state
  // actually flips — NOT on every unrelated tab switch. (usePathname re-renders
  // on any path change, which was re-rendering this 5000-line tree ~1s on every
  // bottom-tab switch and was the dominant tab-switch cost.)
  const isScreenFocused = isChartRouteActive;
  const isScreenFocusedRef = useRef(isScreenFocused);
  const chartRuntimeActive = useDeferredActiveFlag(isChartRouteActive, CHART_RUNTIME_ACTIVE_DELAY_MS);
  // Mount the expensive WebView on the first real Chart focus, or earlier via
  // the idle-scheduled startup boot so a fresh app open pre-pays the WebView
  // document boot + chart-library parse before the first Chart tap.
  // The startup boot deliberately waits for preference hydration and an idle
  // JS slot (see useChartSurfaceStartupBoot) — an unconditional
  // boot-prewarm behind Quotes previously caused an Expo Go JS/native
  // allocation loop on lower-memory Android devices, starving the real tab
  // navigation callback. Once booted, the initialized surface stays mounted so
  // any tab return reveals the existing chart instead of rebuilding the
  // document. Heavy hidden queries, including anonymous candle history, stay
  // paused; only the selected symbol's
  // atomic candle+Bid WebView bridge and isolated Buy/Sell footer listener
  // remain warm so the first revealed frame is complete and current.
  const chartSurfaceActivated = useDeferredActiveFlag(isChartRouteActive, CHART_SURFACE_MOUNT_DELAY_MS);
  // Cancel pending startup boot under authentication; an already-mounted surface stays retained.
  const chartSurfaceStartupBooted = useChartSurfaceStartupBoot(chartSurfaceActivated || !marketDemandAllowed);
  const chartSurfaceReady = useLatchedFlag(chartSurfaceActivated || chartSurfaceStartupBooted);
  // Derive login reactively from Zustand so the positions fetch re-triggers
  // when auth completes (login goes from undefined → valid number).
  const liveLogin = useLiveAccountState((s) => s.login);
  const persistedLoginId = useUserPreferences((s) => s.accountDetails?.id);
  const accountLogin = useMemo(() => {
    if (Number.isFinite(liveLogin) && liveLogin > 0) return liveLogin;
    const parsed = Number(persistedLoginId);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return undefined;
  }, [liveLogin, persistedLoginId]);

  // Hydrate positions on page refresh
  const refreshPositions = usePositionsState((s) => s.refreshPositions);
  // Fetch positions on mount AND poll every 10s so new trades always appear
  // on the chart even if the account WebSocket misses an event.
  useEffect(() => {
    if (!chartRuntimeActive || !accountLogin) return;
    refreshPositions(String(accountLogin));
    const interval = setInterval(() => {
      refreshPositions(String(accountLogin));
    }, 10000);
    return () => clearInterval(interval);
  }, [accountLogin, chartRuntimeActive, refreshPositions]);

  const isDark = useIsDarkTheme();
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const {
    chartSymbol,
    chartTimeframe,
    chartVisualType,
    chartColors,
    chartColorScheme,
    chartDisplay,
    chartViewportShowVolumePane,
    chartViewportShowDrawingToolbar,
    chartOneClickPanelAtBottom,
    chartVerticalScrollingLocked,
    chartAutoScaleEnabled,
    chartDrawingRecordsBySymbol,
    tradeVolume,
    chartTradeVolumeDisplayMode,
    setChartTimeframe,
    setChartVisualType,
    setChartViewportShowVolumePane,
    setChartViewportShowDrawingToolbar,
    setChartOneClickPanelAtBottom,
    setChartVerticalScrollingLocked,
    setChartAutoScaleEnabled,
    setChartDisplaySetting,
    setTradeVolume,
    setChartTradeVolumeDisplayMode,
    chartLockAll,
    chartHideAll,
    isLoggedIn,
    selectedBrokerId,
    setChartLockAll,
    setChartHideAll,
    setChartDrawingRecordsForSymbol,
    removeQuoteSymbol,
  } = useUserPreferences(
    useShallow((state) => ({
      chartSymbol: state.chartSymbol,
      chartTimeframe: state.chartTimeframe,
      chartVisualType: state.chartVisualType,
      chartColors: state.chartColors,
      chartColorScheme: state.chartColorScheme,
      chartDisplay: state.chartDisplay,
      chartViewportShowVolumePane: state.chartViewportShowVolumePane,
      chartViewportShowDrawingToolbar: state.chartViewportShowDrawingToolbar,
      chartOneClickPanelAtBottom: state.chartOneClickPanelAtBottom,
      chartVerticalScrollingLocked: state.chartVerticalScrollingLocked,
      chartAutoScaleEnabled: state.chartAutoScaleEnabled,
      chartDrawingRecordsBySymbol: state.chartDrawingRecordsBySymbol,
      tradeVolume: state.tradeVolume,
      chartTradeVolumeDisplayMode: state.chartTradeVolumeDisplayMode,
      setChartTimeframe: state.setChartTimeframe,
      setChartVisualType: state.setChartVisualType,
      setChartViewportShowVolumePane: state.setChartViewportShowVolumePane,
      setChartViewportShowDrawingToolbar: state.setChartViewportShowDrawingToolbar,
      setChartOneClickPanelAtBottom: state.setChartOneClickPanelAtBottom,
      setChartVerticalScrollingLocked: state.setChartVerticalScrollingLocked,
      setChartAutoScaleEnabled: state.setChartAutoScaleEnabled,
      setChartDisplaySetting: state.setChartDisplaySetting,
      setTradeVolume: state.setTradeVolume,
      setChartTradeVolumeDisplayMode: state.setChartTradeVolumeDisplayMode,
      chartLockAll: state.chartLockAll,
      chartHideAll: state.chartHideAll,
      isLoggedIn: state.isLoggedIn,
      selectedBrokerId: state.brokerId,
      setChartLockAll: state.setChartLockAll,
      setChartHideAll: state.setChartHideAll,
      setChartDrawingRecordsForSymbol: state.setChartDrawingRecordsForSymbol,
      removeQuoteSymbol: state.removeQuoteSymbol,
    })),
  );
  const { mutate: removeServerWatchlistSymbol } = useRemoveWatchlistMutation();
  const isPublicDemoMarket = isOrrnnDemoPublicMarketSelection({
    brokerId: selectedBrokerId,
    isLoggedIn,
  });
  const activeChartSession = useActiveBrokerQuerySession();
  const activeChartCredentialScopeKey = useActiveBrokerCredentialScopeKey();
  const activeChartSessionCacheNamespace = activeChartSession?.cacheNamespace ?? '';
  const chartMarketDataCacheNamespace = isPublicDemoMarket
    ? ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE
    : activeChartSessionCacheNamespace;
  const chartTradeDisplayQuoteScopeKey =
    `${chartMarketDataCacheNamespace}:${chartSymbol.trim().toUpperCase()}`;
  const retainedChartTradeDisplayQuoteRef = useRef<ExactChartQuoteSnapshot | null>(null);
  useEffect(() => {
    // Keep the retained Chart More shells on the exact symbol before any tap;
    // the option press can then be a UI-thread visibility flip only.
    prepareChartActionLaunch(chartSymbol);
  }, [chartSymbol]);
  const BLUE = T.trading.buy.primary;
  const TEXT_MUTED = T.textMuted;
  const HEADER_CONTROL_COLOR = T.text;
  const retainedChartPositionsRef = useRef(usePositionsState.getState().positions);
  const retainedChartPositionSignatureRef = useRef<string | null>(null);
  if (retainedChartPositionSignatureRef.current === null) {
    retainedChartPositionSignatureRef.current = buildChartPositionStructuralSignature(retainedChartPositionsRef.current);
  }
  // Position pushes replace currentPrice/P&L at feed cadence. Open-line
  // geometry only changes when the structural fields below change; live labels
  // are calculated from the separately coalesced quote. Selecting a primitive
  // signature prevents P/L-only arrays from re-rendering the full Chart host.
  const chartPositionStructuralSignature = usePositionsState((state) => (
    chartRuntimeActive
      ? buildChartPositionStructuralSignature(state.positions)
      : retainedChartPositionSignatureRef.current!
  ));
  if (chartRuntimeActive) {
    // Zustand evaluates every selector on every ledger publication. A hidden
    // chart must reuse its last signature rather than serializing the retained
    // positions again for each live price or P/L update on another screen.
    retainedChartPositionSignatureRef.current = chartPositionStructuralSignature;
  }
  const positions = useMemo(() => {
    if (!chartRuntimeActive) {
      return retainedChartPositionsRef.current;
    }
    const latestPositions = usePositionsState.getState().positions;
    retainedChartPositionsRef.current = latestPositions;
    return latestPositions;
  }, [chartPositionStructuralSignature, chartRuntimeActive]);
  const chartTradeOpeningRetentionRef = useRef(
    createChartTradeOpeningRetentionState(),
  );
  const retainedChartTradeOpenings = useMemo(
    () => retainChartTradeOpenings(
      chartTradeOpeningRetentionRef.current,
      chartMarketDataCacheNamespace,
      positions,
    ),
    [chartMarketDataCacheNamespace, positions],
  );
  const preferencesHydrated = useUserPreferences((s) => s.hasHydrated);
  const chartShowOnChart = useUserPreferences((s) => s.chartShowOnChart);
  const setChartShowOnChartItem = useUserPreferences((s) => s.setChartShowOnChartItem);
  const isVerticalScrollingLocked = chartVerticalScrollingLocked;
  const isChartAutoScaleEnabled = chartAutoScaleEnabled;
  const resolvedChartColors = useMemo(
    () => resolveChartColorsForTheme(chartColors, chartColorScheme, isDark),
    [chartColors, chartColorScheme, isDark],
  );
  const chartOpenPositionLabelPatchContextKey = useMemo(
    () => JSON.stringify([
      chartTradeDisplayQuoteScopeKey,
      chartPositionStructuralSignature,
      chartShowOnChart.buyTrade,
      chartShowOnChart.sellTrade,
      resolvedChartColors.tradeOpen,
      resolvedChartColors.tradeTpSl,
      resolvedChartColors.tradeStopOut,
      T.trading.sell.primary,
    ]),
    [
      T.trading.sell.primary,
      chartPositionStructuralSignature,
      chartShowOnChart.buyTrade,
      chartShowOnChart.sellTrade,
      chartTradeDisplayQuoteScopeKey,
      resolvedChartColors.tradeOpen,
      resolvedChartColors.tradeStopOut,
      resolvedChartColors.tradeTpSl,
    ],
  );
  const chartGridColor = useMemo(
    () => (isDark ? resolvedChartColors.grid : MT5_LIGHT_GRID_COLOR),
    [isDark, resolvedChartColors.grid],
  );
  const chartAxisBorderColor = useMemo(
    () => (isDark ? MT5_DARK_AXIS_BORDER_COLOR : MT5_LIGHT_AXIS_BORDER_COLOR),
    [isDark],
  );
  const chartColorsSignature = useMemo(() => JSON.stringify(resolvedChartColors), [resolvedChartColors]);
  const chartWindowCommitContextImplementationRef = useRef<(
    symbol: string,
    timeframe: string,
  ) => void>(() => { });
  const chartWindowCancelContextImplementationRef = useRef<() => void>(() => { });
  const commitChartWindowContext = useCallback((symbol: string, timeframe: string) => {
    chartWindowCommitContextImplementationRef.current(symbol, timeframe);
  }, []);
  const cancelChartWindowContext = useCallback(() => {
    chartWindowCancelContextImplementationRef.current();
  }, []);
  const chartWindows = useChartWindowsFeature({
    symbol: chartSymbol,
    timeframe: chartTimeframe,
    active: isScreenFocused,
    onCommitContext: commitChartWindowContext,
    onCancelPendingContext: cancelChartWindowContext,
  });
  const chartWindowVisualPreferences = useChartWindowVisualPreferences(chartWindows.state);
  const chartWindowsStateRef = useRef(chartWindows.state);
  chartWindowsStateRef.current = chartWindows.state;
  type ChartWindowViewportCommand = Readonly<{
    revision: number;
    type: 'scrollToLastBar' | 'resetVerticalScale' | 'resetViewport';
  }>;
  const chartWindowViewportCommandRevisionRef = useRef(0);
  const [chartWindowViewportCommands, setChartWindowViewportCommands] = useState<
    Readonly<Record<string, ChartWindowViewportCommand>>
  >({});
  const routeChartWindowViewportCommand = useCallback((
    type: ChartWindowViewportCommand['type'],
  ): boolean => {
    const current = chartWindowsStateRef.current;
    const targetPaneIds = current.toolbarTargetPaneId === null
      ? current.panes.map((pane) => pane.id)
      : [current.toolbarTargetPaneId];
    const revision = chartWindowViewportCommandRevisionRef.current + 1;
    chartWindowViewportCommandRevisionRef.current = revision;
    setChartWindowViewportCommands((previous) => {
      const next = { ...previous };
      targetPaneIds.forEach((paneId) => {
        next[paneId] = Object.freeze({ revision, type });
      });
      return Object.freeze(next);
    });
    return targetPaneIds.includes(current.activePaneId);
  }, []);
  const chartDrawingBucketKey = useMemo(() => getChartDrawingBucketKey(chartSymbol), [chartSymbol]);
  const persistedChartDrawingRecords = useMemo(
    () => chartDrawingRecordsBySymbol[chartDrawingBucketKey] ?? [],
    [chartDrawingBucketKey, chartDrawingRecordsBySymbol],
  );
  const scopedChartDrawingRecords = useMemo(
    () => filterChartDrawingRecordsForCurrentChart(
      persistedChartDrawingRecords,
      chartSymbol,
      chartTimeframe,
      [],
      chartWindows.isSplit ? chartWindows.activePane.id : undefined,
    ),
    [
      chartSymbol,
      chartTimeframe,
      chartWindows.activePane.id,
      chartWindows.isSplit,
      persistedChartDrawingRecords,
    ],
  );

  useEffect(() => {
    Object.entries(chartDrawingRecordsBySymbol).forEach(([bucketSymbol, records]) => {
      const next = chartWindows.isSplit
        ? expandChartDrawingsForSplitWindows(
          records,
          chartWindows.state.panes,
          bucketSymbol,
        )
        : collapseChartDrawingsToSingleWindow(
          records,
          chartWindows.activePane.id,
        );
      if (next !== records) {
        setChartDrawingRecordsForSymbol(bucketSymbol, next);
      }
    });
  }, [
    chartDrawingRecordsBySymbol,
    chartWindows.activePane.id,
    chartWindows.isSplit,
    chartWindows.state.panes,
    setChartDrawingRecordsForSymbol,
  ]);
  const chartWindowDrawingRecordsByPane = useMemo(
    () => Object.freeze(Object.fromEntries(
      chartWindows.state.panes.map((pane) => {
        const bucket = chartDrawingRecordsBySymbol[getChartDrawingBucketKey(pane.symbol)] ?? [];
        return [
          pane.id,
          filterChartDrawingRecordsForCurrentChart(
            bucket,
            pane.symbol,
            pane.timeframe,
            [],
            chartWindows.isSplit ? pane.id : undefined,
          ),
        ];
      }),
    )),
    [chartDrawingRecordsBySymbol, chartWindows.isSplit, chartWindows.state.panes],
  );

  const { data: apiSymbolsData } = useMarketSymbols(chartRuntimeActive);
  const availableSymbols = useMemo(
    () => buildAvailableChartSymbols(chartSymbol, apiSymbolsData),
    [apiSymbolsData, chartSymbol],
  );
  const { data: chartInstrumentMeta } = useInstrumentMeta(chartSymbol, chartRuntimeActive);
  // The retained chart surface preloads this lightweight session boundary so
  // the first visible closed-market frame is already clamped to its last bar.
  const {
    data: chartMarketStatus,
    refetch: refetchChartMarketStatus,
  } = useMarketStatus(
    chartSymbol,
    chartSurfaceReady,
    chartRuntimeActive,
  );
  useEffect(() => {
    if (
      !isLoggedIn ||
      !activeChartSessionCacheNamespace ||
      !chartRuntimeActive ||
      !chartSurfaceReady
    ) return;
    // Re-enabling a 30-second TanStack polling interval does not fetch now.
    // Refetch on reveal so a retained weekend-closed chart cannot remain
    // clamped for another interval after the market has already reopened.
    void refetchChartMarketStatus();
  }, [
    activeChartSessionCacheNamespace,
    chartRuntimeActive,
    chartSurfaceReady,
    isLoggedIn,
    refetchChartMarketStatus,
  ]);
  const tradeVolumeBounds = useMemo(
    () => ({
      minVolume: chartInstrumentMeta?.minVolume,
      maxVolume: chartInstrumentMeta?.maxVolume,
      stepVolume: chartInstrumentMeta?.stepVolume,
    }),
    [chartInstrumentMeta?.maxVolume, chartInstrumentMeta?.minVolume, chartInstrumentMeta?.stepVolume],
  );
  const [lotInput, setLotInput] = useState(() => formatTradeVolume(tradeVolume, tradeVolumeBounds));
  const footerLotDraftRef = useRef(lotInput);
  const [footerLotEditorFocused, setFooterLotEditorFocused] = useState(false);
  const [footerLotEditorOpening, setFooterLotEditorOpening] = useState(false);
  const footerLotEditorInputRef = useRef<TextInput>(null);
  const [footerLotPickerMode, setFooterLotPickerMode] = useState<FooterLotPickerMode | null>(null);
  const showFooterLotPicker = footerLotPickerMode !== null;
  // MT5-style invalid-lot state: when the user manually types a lot that isn't a
  // valid step/range, we keep it visible + flagged and block trading instead of
  // silently snapping it. `footerLotInvalidDisplay` holds the exact typed text.
  const [footerLotInvalid, setFooterLotInvalid] = useState(false);
  const [footerLotInvalidDisplay, setFooterLotInvalidDisplay] = useState('');
  // Synchronous "lot editor active" flag. The chart-viewport freeze is driven by
  // React state (footerLotEditorFocused/Opening), so a keyboard-resize layout can
  // fire BEFORE that state propagates to the onLayout closure — the chart shrinks
  // + reflows once (the visible "jump"). This ref flips true the instant the lot
  // editor opens so onLayout can freeze the very first shrink.
  const footerLotEditorActiveRef = useRef(false);
  const [chartTradeVolumeInputFocused, setChartTradeVolumeInputFocused] = useState(false);
  const [chartTradeVolumeDraft, setChartTradeVolumeDraft] = useState(() => formatTradeVolume(tradeVolume, tradeVolumeBounds));
  const chartTradeVolumeDraftRef = useRef(chartTradeVolumeDraft);
  const setFooterLotDraft = useCallback((nextDraft: string) => {
    footerLotDraftRef.current = nextDraft;
    setLotInput(nextDraft);
  }, []);
  const setChartTradeVolumeDraftValue = useCallback((nextDraft: string) => {
    chartTradeVolumeDraftRef.current = nextDraft;
    setChartTradeVolumeDraft(nextDraft);
  }, []);

  // Safely strip MT4/MT5 suffixes like 'm', '.c', '_std' to resolve flags properly
  const baseSymbol = useMemo(() => resolveChartSymbolKey(chartSymbol), [chartSymbol]);
  const chartMarketSessionPolicy = useMemo(
    () => resolveChartMarketSessionPolicy(chartMarketStatus),
    [chartMarketStatus],
  );
  // This is deliberately status-driven, not symbol- or broker-driven. A normal
  // 24x7 crypto response stays open; an explicit maintenance closure is still
  // honored. Unknown status never destructively truncates the chart.
  const isChartMarketClosed = chartMarketSessionPolicy.quotePhase === 'closed';
  const chartLiveQuote = useLiveSymbolQuote(chartSymbol, chartRuntimeActive, CHART_SCREEN_QUOTE_COMMIT_INTERVAL_MS);
  // Area's Auto / 1 Day tone must use the same daily percentage snapshot as
  // Quotes. Keep the existing low-latency chart quote above for execution and
  // live-price painting; this shared subscription adds only the Quotes-owned
  // daily reference fields that a price-only tick is allowed to omit.
  const areaQuoteDirectionActive = chartRuntimeActive && chartVisualType === 'area';
  useWatchlistLiveQuotes(
    [chartSymbol],
    areaQuoteDirectionActive,
    { restFallbackActive: areaQuoteDirectionActive },
  );
  const chartDailyDirectionQuote = useLiveQuoteSnapshot(
    chartSymbol,
    areaQuoteDirectionActive,
    CHART_SCREEN_QUOTE_COMMIT_INTERVAL_MS,
  );
  const observedExactChartQuote = useMemo(
    () => captureExactChartQuote(
      chartTradeDisplayQuoteScopeKey,
      chartLiveQuote as ExactChartQuoteInput | undefined,
    ),
    [chartLiveQuote, chartTradeDisplayQuoteScopeKey],
  );
  const chartLiveQuoteTickFields = chartLiveQuote as ChartLiveQuoteTickFields | undefined;
  const chartLiveQuoteDigitsSource = (chartLiveQuote as { digitsSource?: string } | undefined)?.digitsSource;
  const hasLiveChartQuote = hasLiveQuoteFeedData(chartLiveQuote);
  const chartTradeTickTimestamp = useMemo(() => {
    const candidates = [
      chartLiveQuote?.lastReceivedAt,
      chartLiveQuoteTickFields?.time,
      chartLiveQuoteTickFields?.timestamp,
      chartLiveQuoteTickFields?.t,
      chartLiveQuote?.lastTickAt,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
        return candidate;
      }
    }

    return null;
  }, [
    chartLiveQuote?.lastReceivedAt,
    chartLiveQuote?.lastTickAt,
    chartLiveQuoteTickFields?.t,
    chartLiveQuoteTickFields?.time,
    chartLiveQuoteTickFields?.timestamp,
  ]);
  const { data: closedPositionsData, refetch: refetchClosedPositions } = usePositionHistoryQuery(accountLogin, {
    enabled: chartRuntimeActive,
  });
  const closedPositions = closedPositionsData ?? EMPTY_CHART_QUERY_ROWS;
  // Deal rows are the atomic executions. They let the chart place each arrow
  // at the broker-confirmed entry/exit time and price, including partial closes.
  const { data: chartDealsData, refetch: refetchChartDeals } = useChartDealsQuery(accountLogin, {
    enabled: chartRuntimeActive,
  });
  const chartDeals = chartDealsData ?? EMPTY_CHART_QUERY_ROWS;
  const { data: ordersData, refetch: refetchOrders } = useOrdersByLoginQuery(accountLogin, {
    enabled: chartRuntimeActive,
  });
  const orders = ordersData ?? EMPTY_CHART_QUERY_ROWS;
  const { data: alertsData, refetch: refetchAlerts } = useAlertsQuery({
    enabled: chartRuntimeActive,
  });
  const alerts = alertsData ?? EMPTY_CHART_QUERY_ROWS;
  const { data: accountSummary, refetch: refetchAccountSummary } = useAccountSummary(
    accountLogin ? String(accountLogin) : undefined,
    { enabled: chartRuntimeActive },
  );
  // Equity/margin change with every position tick but are not consumed by the
  // current overlay builder. Balance is the only live account value rendered in
  // the trade sheet and normally changes only after an execution.
  const retainedChartBalanceRef = useRef(useLiveAccountState.getState().balance);
  const liveAccountBalance = useLiveAccountState((state) => (
    chartRuntimeActive ? state.balance : retainedChartBalanceRef.current
  ));
  if (chartRuntimeActive) {
    retainedChartBalanceRef.current = liveAccountBalance;
  }

  useEffect(() => {
    const normalized = normalizeTradeVolume(tradeVolume, tradeVolumeBounds);
    if (Math.abs(normalized - tradeVolume) > 0.000001) {
      setTradeVolume(normalized);
      return;
    }
    if (!footerLotEditorFocused && !footerLotInvalid) {
      setFooterLotDraft(formatTradeVolume(normalized, tradeVolumeBounds));
    }
    if (!chartTradeVolumeInputFocused) {
      setChartTradeVolumeDraftValue(formatTradeVolume(normalized, tradeVolumeBounds));
    }
  }, [
    chartTradeVolumeInputFocused,
    footerLotEditorFocused,
    footerLotInvalid,
    setChartTradeVolumeDraftValue,
    setFooterLotDraft,
    setTradeVolume,
    tradeVolume,
    tradeVolumeBounds,
  ]);

  const updateTradeVolume = useCallback(
    (nextVolume: number | string) => {
      const normalized = normalizeTradeVolume(nextVolume, tradeVolumeBounds);
      setTradeVolume(normalized);
      setFooterLotDraft(formatTradeVolume(normalized, tradeVolumeBounds));
      setChartTradeVolumeDraftValue(formatTradeVolume(normalized, tradeVolumeBounds));
      setFooterLotInvalid(false);
    },
    [setChartTradeVolumeDraftValue, setFooterLotDraft, setTradeVolume, tradeVolumeBounds],
  );
  const resolveFooterLotCommitDraft = useCallback((draftOverride?: string) => resolveFooterLotCommitDraftValue({
    draftOverride,
    draftRef: footerLotDraftRef.current,
    currentDraft: lotInput,
  }), [lotInput]);
  const commitLotDraft = useCallback((draftOverride?: string) => {
    const nextDraft = resolveFooterLotCommitDraft(draftOverride);

    if (!nextDraft.trim()) {
      // Use the freshest committed lot from the store, not the closure's
      // captured `tradeVolume` — otherwise rapid commits can revert the
      // input to a value that's already been replaced by another commit.
      const latestVolume = useUserPreferences.getState().tradeVolume;
      setFooterLotDraft(formatTradeVolume(latestVolume, tradeVolumeBounds));
      setFooterLotInvalid(false);
      return;
    }
    if (!isValidTradeVolume(nextDraft, tradeVolumeBounds)) {
      // MT5 parity: don't silently snap a non-step / out-of-range lot. Keep the
      // typed value visible and flagged; trading stays blocked until it's valid.
      setFooterLotDraft(nextDraft);
      setFooterLotInvalidDisplay(nextDraft);
      setFooterLotInvalid(true);
      return;
    }
    updateTradeVolume(nextDraft);
  }, [resolveFooterLotCommitDraft, setFooterLotDraft, tradeVolumeBounds, updateTradeVolume]);
  const handleOpenFooterLotPicker = useCallback((mode: FooterLotPickerMode = 'absolute') => {
    commitLotDraft();
    setFooterLotEditorFocused(false);
    setFooterLotEditorOpening(false);
    Keyboard.dismiss();
    setFooterLotPickerMode((current) => (current === mode ? null : mode));
  }, [commitLotDraft]);
  const handleCloseFooterLotPicker = useCallback(() => {
    setFooterLotPickerMode(null);
  }, []);
  const handleSelectFooterLot = useCallback(
    (nextVolume: number) => {
      updateTradeVolume(nextVolume);
      setFooterLotPickerMode((current) => (current === 'absolute' ? null : current));
    },
    [updateTradeVolume],
  );

  const handleFooterLotDraftChange = useCallback((text: string) => {
    setFooterLotDraft(sanitizeTradeVolumeDraft(text));
  }, [setFooterLotDraft]);
  // Suppress the synthetic blur that fires when iOS swaps the lot TextInput
  // from the inline footer into the floating dock (unmount → remount). Without
  // this, blur immediately ends the session so the user can't type and the
  // Sell/Lot/Buy dock never stays above the keyboard.
  const suppressFooterLotBlurUntilRef = useRef(0);
  const handleFocusFooterLotEditor = useCallback(() => {
    // Engage the chart freeze synchronously (before the keyboard resize lands).
    footerLotEditorActiveRef.current = true;
    if (Platform.OS === 'ios') {
      suppressFooterLotBlurUntilRef.current = Date.now() + 900;
    }
    setFooterLotPickerMode(null);
    setFooterLotDraft(
      footerLotInvalid ? footerLotInvalidDisplay : formatTradeVolume(tradeVolume, tradeVolumeBounds),
    );
    setFooterLotEditorOpening(Platform.OS === 'android');
    setFooterLotEditorFocused(true);
  }, [footerLotInvalid, footerLotInvalidDisplay, setFooterLotDraft, tradeVolume, tradeVolumeBounds]);
  const finishFooterLotEditor = useCallback((draftOverride?: string) => {
    // Always prefer the ref (latest typed value) when no explicit override given
    commitLotDraft(draftOverride ?? footerLotDraftRef.current);
    footerLotEditorActiveRef.current = false;
    suppressFooterLotBlurUntilRef.current = 0;
    setFooterLotEditorOpening(false);
    setFooterLotEditorFocused(false);
  }, [commitLotDraft]);
  const handleBlurFooterLotEditor = useCallback(() => {
    if (
      footerLotEditorActiveRef.current
      && Date.now() < suppressFooterLotBlurUntilRef.current
    ) {
      // Re-focus the surviving floating TextInput after the inline unmount blur.
      requestAnimationFrame(() => {
        footerLotEditorInputRef.current?.focus();
      });
      return;
    }
    // Defer one frame so a handoff remount can reclaim focus before we commit.
    requestAnimationFrame(() => {
      const input = footerLotEditorInputRef.current as (TextInput & { isFocused?: () => boolean }) | null;
      if (footerLotEditorActiveRef.current && input && typeof input.isFocused === 'function' && input.isFocused()) {
        return;
      }
      if (footerLotEditorActiveRef.current && Date.now() < suppressFooterLotBlurUntilRef.current) {
        input?.focus();
        return;
      }
      if (footerLotEditorActiveRef.current) {
        finishFooterLotEditor();
      }
    });
  }, [finishFooterLotEditor]);
  const handleEndFooterLotEditor = useCallback((event: TextInputCommitEvent) => {
    finishFooterLotEditor(event.nativeEvent.text);
  }, [finishFooterLotEditor]);
  const handleSubmitFooterLotEditor = useCallback((event?: TextInputCommitEvent) => {
    finishFooterLotEditor(event?.nativeEvent.text);
    Keyboard.dismiss();
  }, [finishFooterLotEditor]);
  const handleStepFooterLotEditor = useCallback((direction: -1 | 1) => {
    // Read the latest committed lot from the store rather than the closure's
    // captured `tradeVolume`. Without this, two rapid chevron presses both
    // compute the next value off the same stale lot — the second press
    // becomes a silent no-op and the user perceives "decrease doesn't work".
    const latestVolume = useUserPreferences.getState().tradeVolume;
    const nextVolume = incrementTradeVolume(latestVolume, direction, tradeVolumeBounds);
    updateTradeVolume(nextVolume);
  }, [tradeVolumeBounds, updateTradeVolume]);
  const committedLotDisplay = useMemo(
    () => formatTradeVolume(tradeVolume, tradeVolumeBounds),
    [tradeVolume, tradeVolumeBounds],
  );
  const passiveLotDisplay = footerLotEditorFocused
    ? lotInput || committedLotDisplay
    : committedLotDisplay;

  const chartTradeReceiptStackControllerRef = useRef<ReturnType<
    typeof createChartTradeReceiptStackController
  > | null>(null);
  if (chartTradeReceiptStackControllerRef.current === null) {
    chartTradeReceiptStackControllerRef.current = createChartTradeReceiptStackController();
  }
  const chartTradeReceiptStackController = chartTradeReceiptStackControllerRef.current;
  useEffect(() => () => {
    // The external controller keeps 50-100+ receipt updates out of this heavy
    // chart component's render cycle. Clear its timers when the chart unmounts.
    chartTradeResultRefreshScheduler.cancel(chartTradeReceiptStackController);
    chartTradeReceiptStackController.clear();
  }, [chartTradeReceiptStackController]);
  const [tradeFeedback, setTradeFeedback] = useState<TradeFeedbackState>(TRADE_MODAL_INITIAL);
  const handleTradeFeedbackClose = useCallback(() => setTradeFeedback(TRADE_MODAL_INITIAL), []);
  const handleChartTradeResult = useCallback((
    feedback: TradeFeedbackState,
    suppressConfirmedReceipt = false,
  ) => {
    if (feedback.type !== 'success') {
      setTradeFeedback(feedback);
      return;
    }

    if (!suppressConfirmedReceipt) {
      setTradeFeedback(feedback);
    }
    if (chartRuntimeActive) {
      // Market-order reconciliation is already owner-bound from before POST.
      // Coalesce only the dependent history/summary refreshes. Trade POSTs and
      // their independent receipt results remain fully concurrent.
      chartTradeResultRefreshScheduler.schedule(
        chartTradeReceiptStackController,
        activeChartSessionCacheNamespace ?? String(accountLogin ?? ''),
        () => Promise.allSettled([
          refetchClosedPositions(),
          refetchChartDeals(),
          refetchOrders(),
        ]),
      );
    }
  }, [
    accountLogin,
    activeChartSessionCacheNamespace,
    chartTradeReceiptStackController,
    chartRuntimeActive,
    refetchClosedPositions,
    refetchChartDeals,
    refetchOrders,
  ]);
  // Only a broker-confirmed fill belongs in the compact chart receipt. Errors
  // and incomplete success responses continue through the detailed root modal.
  const chartTradeReceipt = resolveConfirmedTradeReceipt(tradeFeedback);
  useConfirmedTradeReceiptAutoDismiss(tradeFeedback, handleTradeFeedbackClose);
  const [showSignalDetails, setShowSignalDetails] = useState(false);
  const [showChartTradeSheet, setShowChartTradeSheet] = useState(false);
  const [chartTradeOrderType, setChartTradeOrderType] = useState<ChartOrderType>('Market Execution');
  const [chartTradePrice, setChartTradePrice] = useState(0);
  const [chartTradeStopLimitPrice, setChartTradeStopLimitPrice] = useState(0);
  const [chartTradeSlEnabled, setChartTradeSlEnabled] = useState(false);
  const [chartTradeSlPrice, setChartTradeSlPrice] = useState(0);
  const [chartTradeTpEnabled, setChartTradeTpEnabled] = useState(false);
  const [chartTradeTpPrice, setChartTradeTpPrice] = useState(0);
  const [chartDirectProtectionActive, setChartDirectProtectionActive] = useState(false);
  const chartDirectProtectionOwnerPaneIdRef = useRef<string | null>(null);
  const chartProtectionDraftIdRef = useRef<string | null>(null);
  const chartProtectionAwaitingTicketRef = useRef<string | null>(null);
  const chartProtectionBaselineSignaturesRef = useRef<Record<string, string>>({});
  const [chartTradeComment, setChartTradeComment] = useState('');
  const [chartTradeCommentFocused, setChartTradeCommentFocused] = useState(false);
  const [chartTradeExpiration, setChartTradeExpiration] = useState<'GTC' | 'Today' | 'Date and Time' | 'Date'>('GTC');
  const [chartExpirationMenuOpen, setChartExpirationMenuOpen] = useState(false);
  const [chartStepperEditor, setChartStepperEditor] = useState<{ kind: 'price' | 'stopLimitPrice' | 'tp' | 'sl' | 'volume' } | null>(null);
  const [chartPendingOrderSubmitting, setChartPendingOrderSubmitting] = useState(false);
  const [, refreshChartPendingQuoteGuard] = useState(0);
  const [chartTradeStopUnit, setChartTradeStopUnit] = useState<'Price' | 'Pips' | 'Currency'>('Price');
  const [chartTradeSlLocked, setChartTradeSlLocked] = useState(false);
  const [chartTradeTpLocked, setChartTradeTpLocked] = useState(false);
  const [chartTradeSheetMode, setChartTradeSheetMode] = useState<'hidden' | 'collapsed' | 'expanded'>('hidden');
  const [keyboardVisibleHeight, setKeyboardVisibleHeight] = useState(0);
  const [keyboardDockOffset, setKeyboardDockOffset] = useState(0);
  const [chartTradeSheetHostHeight, setChartTradeSheetHostHeight] = useState(0);
  const [chartTradeSheetHostLeftOffset, setChartTradeSheetHostLeftOffset] = useState(0);
  const [chartTradeSheetHostTopOffset, setChartTradeSheetHostTopOffset] = useState(0);
  const [chartTradeKeyboardFreeHostHeight, setChartTradeKeyboardFreeHostHeight] = useState(0);
  const [chartTradeInlineFooterHeight, setChartTradeInlineFooterHeight] = useState(0);
  const [chartTradeTopToolbarBottomOffset, setChartTradeTopToolbarBottomOffset] = useState(0);
  const [chartTradeCompactHeaderHeight, setChartTradeCompactHeaderHeight] = useState(0);
  const clearChartDirectProtectionDraft = useCallback((expectedDraftId?: string) => {
    if (
      expectedDraftId &&
      chartProtectionDraftIdRef.current !== expectedDraftId
    ) {
      return;
    }
    const currentDraftId = chartProtectionDraftIdRef.current;
    if (currentDraftId) {
      releaseChartProtectionDraftSubmission(currentDraftId);
    }
    chartProtectionDraftIdRef.current = null;
    chartProtectionAwaitingTicketRef.current = null;
    chartProtectionBaselineSignaturesRef.current = {};
    chartDirectProtectionOwnerPaneIdRef.current = null;
    setChartDirectProtectionActive(false);
    setChartTradeSlEnabled(false);
    setChartTradeSlPrice(0);
    setChartTradeTpEnabled(false);
    setChartTradeTpPrice(0);
  }, []);
  const captureChartProtectionDraftBaseline = useCallback((draftId: string) => {
    if (chartProtectionDraftIdRef.current !== draftId) {
      return;
    }
    chartProtectionBaselineSignaturesRef.current = Object.fromEntries(
      usePositionsState.getState().positions.map((position) => [
        String(position.id),
        buildChartProtectionPositionSignature(position),
      ]),
    );
  }, []);
  const applyChartProtectionDraftExecution = useCallback((
    event: ChartProtectionDraftExecutionEvent,
  ) => {
    if (
      !event.draftId ||
      chartProtectionDraftIdRef.current !== event.draftId
    ) {
      return;
    }
    if (event.executionConfirmed) {
      clearChartDirectProtectionDraft(event.draftId);
      return;
    }
    if (!event.ticket) {
      return;
    }
    chartProtectionAwaitingTicketRef.current = event.ticket;
    const currentPosition = usePositionsState.getState().positions.find(
      (position) => String(position.id) === event.ticket,
    );
    const baselineSignature =
      chartProtectionBaselineSignaturesRef.current[event.ticket];
    if (hasChartProtectionDraftReconciled({
      baselineSignature,
      currentPosition,
      terminalTicketObserved: false,
    })) {
      clearChartDirectProtectionDraft(event.draftId);
    }
  }, [clearChartDirectProtectionDraft]);
  const handleChartTradeExecutionResult = useCallback((
    feedback: TradeFeedbackState,
    suppressConfirmedReceipt = false,
  ) => {
    handleChartTradeResult(feedback, suppressConfirmedReceipt);
    if (
      feedback.type !== 'success' ||
      !chartDirectProtectionActive ||
      !feedback.protectionDraftId
    ) {
      return;
    }

    // Keep an accepted-but-unconfirmed draft on the chart. It is replaced only
    // by broker-confirmed execution evidence or by exact-ticket reconciliation.
    applyChartProtectionDraftExecution({
      draftId: feedback.protectionDraftId,
      executionConfirmed: feedback.executionConfirmed === true,
      ...(feedback.ticket ? { ticket: feedback.ticket } : {}),
    });
  }, [
    applyChartProtectionDraftExecution,
    chartDirectProtectionActive,
    handleChartTradeResult,
  ]);
  const handleChartTradeQueueEvent = useCallback((event: ChartTradeQueueEvent) => {
    chartTradeReceiptStackController.applyEvent(event);
    if (!event.feedback) {
      return;
    }

    // A confirmed one-click fill is already represented by its exact stack
    // row. Rejections and incomplete broker evidence retain the detailed modal.
    handleChartTradeExecutionResult(
      event.feedback,
      event.status === 'confirmed',
    );
  }, [chartTradeReceiptStackController, handleChartTradeExecutionResult]);
  useEffect(() => (
    subscribeChartProtectionDraftExecution(applyChartProtectionDraftExecution)
  ), [applyChartProtectionDraftExecution]);
  useEffect(() => (
    subscribeChartProtectionDraftSubmission(captureChartProtectionDraftBaseline)
  ), [captureChartProtectionDraftBaseline]);
  const isChartExpanded = useUIState((s) => s.isChartFullscreen);
  const setIsChartExpanded = useUIState((s) => s.setChartFullscreen);
  const setChartInlineInputActive = useUIState((s) => s.setChartInlineInputActive);
  const setChartTabBarKeyboardLift = useUIState((s) => s.setChartTabBarKeyboardLift);
  const showChartActionSheet = useUIState((s) => s.showChartActionSheet);
  const hideChartActionSheet = useUIState((s) => s.hideChartActionSheet);
  const preloadScopedActionSheet = useUIState((s) => s.preloadScopedActionSheet);
  const hideActionSheet = useUIState((s) => s.hideActionSheet);
  const safeInsets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight, fontScale } = useWindowDimensions();
  useEffect(() => {
    if (!chartRuntimeActive || !showChartTradeSheet || !isPendingChartOrderType(chartTradeOrderType)) {
      return;
    }

    // Quote/feed health can become stale without another render. Re-evaluate
    // the visible pending-order gate while the sheet is open; submission still
    // performs its own synchronous press-time check below.
    const timer = setInterval(() => refreshChartPendingQuoteGuard((revision) => revision + 1), 1_000);
    return () => clearInterval(timer);
  }, [chartRuntimeActive, chartTradeOrderType, showChartTradeSheet]);
  const chartPendingQuoteAvailability = resolveSessionQuoteActionAvailability(chartLiveQuote, Date.now());
  const chartPendingLiveBid = chartPendingQuoteAvailability.allowed
    ? chartPendingQuoteAvailability.bid
    : 0;
  const chartPendingLiveAsk = chartPendingQuoteAvailability.allowed
    ? chartPendingQuoteAvailability.ask
    : 0;
  const handleOpenSidebar = useCallback(() => {
    openSidebarDrawerImmediately();
    scheduleAfterSidebarOpenVisual(hideActionSheet);
  }, [hideActionSheet]);
  const keyboardInset = useMemo(
    () => (keyboardVisibleHeight > 0 ? Math.max(0, keyboardVisibleHeight - safeInsets.bottom + 12) : 0),
    [keyboardVisibleHeight, safeInsets.bottom],
  );
  const androidFooterHostResizedForKeyboard = useMemo(() => {
    return resolveKeyboardResizesHost({
      platform: Platform.OS,
      footerLotEditorFocused,
      showChartTradeSheet,
      keyboardVisibleHeight,
      keyboardFreeHostHeight: chartTradeKeyboardFreeHostHeight,
      currentHostHeight: chartTradeSheetHostHeight,
    });
  }, [
    chartTradeKeyboardFreeHostHeight,
    chartTradeSheetHostHeight,
    footerLotEditorFocused,
    keyboardVisibleHeight,
    showChartTradeSheet,
  ]);
  const chartTabBarKeyboardLift = useMemo(() => {
    if (
      Platform.OS !== 'android' ||
      !footerLotEditorFocused ||
      showChartTradeSheet ||
      androidFooterHostResizedForKeyboard ||
      keyboardVisibleHeight <= 0
    ) {
      return 0;
    }

    return keyboardVisibleHeight;
  }, [
    androidFooterHostResizedForKeyboard,
    footerLotEditorFocused,
    keyboardVisibleHeight,
    showChartTradeSheet,
  ]);
  const chartBottomTabBarHeight = useMemo(
    () => resolveBottomTabBarHeight({
      safeAreaBottom: safeInsets.bottom,
      isChartTab: true,
      viewportHeight: screenHeight,
      fontScale,
      isLandscape: screenWidth > screenHeight,
    }),
    [safeInsets.bottom, screenHeight, screenWidth, fontScale],
  );
  const footerKeyboardAvoidanceOffset = useMemo(() => {
    if (chartTabBarKeyboardLift <= 0) {
      return 0;
    }

    return chartTabBarKeyboardLift + chartBottomTabBarHeight;
  }, [chartBottomTabBarHeight, chartTabBarKeyboardLift]);
  const resolveKeyboardDockOffsetForFrame = useCallback((coords?: { height?: number; screenY?: number | null }) => {
    const liveWindowHeight = Dimensions.get('window').height;
    return resolveKeyboardDockOffset({
      platform: Platform.OS,
      keyboardHeight: Math.max(0, coords?.height ?? 0),
      keyboardScreenY: typeof coords?.screenY === 'number' ? coords.screenY : null,
      containerBottom: footerTradeRowAnchorBottomRef.current ?? chartTradeHostBottomRef.current,
      screenHeight: liveWindowHeight,
      safeAreaBottom: safeInsets.bottom,
    });
  }, [safeInsets.bottom]);
  const measureChartTradeHostFrame = useCallback((onMeasured?: () => void) => {
    if (!chartTradeHostRef.current) {
      onMeasured?.();
      return;
    }

    chartTradeHostRef.current.measureInWindow((_x, y, _width, height) => {
      if (Number.isFinite(_x)) {
        const nextLeftOffset = Math.max(0, Math.round(_x));
        setChartTradeSheetHostLeftOffset((current) => (
          current === nextLeftOffset ? current : nextLeftOffset
        ));
      }
      if (Number.isFinite(y) && Number.isFinite(height) && height > 0) {
        const nextTopOffset = Math.max(0, Math.round(y));
        setChartTradeSheetHostTopOffset((current) => (
          current === nextTopOffset ? current : nextTopOffset
        ));
        chartTradeHostBottomRef.current = y + height;
      }
      onMeasured?.();
    });
  }, []);
  const measureFooterTradeRowAnchorFrame = useCallback((onMeasured?: () => void) => {
    if (!footerTradeRowAnchorRef.current) {
      onMeasured?.();
      return;
    }

    footerTradeRowAnchorRef.current.measureInWindow((_x, y, _width, height) => {
      if (Number.isFinite(y) && Number.isFinite(height) && height > 0) {
        footerTradeRowAnchorBottomRef.current = y + height;
      }
      onMeasured?.();
    });
  }, []);
  const measureKeyboardDockAnchors = useCallback((onMeasured?: () => void) => {
    measureChartTradeHostFrame(() => {
      measureFooterTradeRowAnchorFrame(onMeasured);
    });
  }, [measureChartTradeHostFrame, measureFooterTradeRowAnchorFrame]);
  const recomputeKeyboardDockOffset = useCallback((frameOverride?: { height: number; screenY: number | null }) => {
    const nextDockOffset = resolveKeyboardDockOffsetForFrame(frameOverride ?? keyboardFrameRef.current);
    setKeyboardDockOffset(nextDockOffset);
    return nextDockOffset;
  }, [resolveKeyboardDockOffsetForFrame]);
  const readKeyboardMetricsFrame = useCallback(() => {
    const keyboardController = Keyboard as typeof Keyboard & {
      metrics?: () => { height?: number; screenY?: number } | undefined;
    };
    const metrics = keyboardController.metrics?.();
    return {
      height: Math.max(0, metrics?.height ?? 0),
      screenY: typeof metrics?.screenY === 'number' ? metrics.screenY : null,
    };
  }, []);
  const syncKeyboardHeightFromMetrics = useCallback(() => {
    const metrics = readKeyboardMetricsFrame();
    keyboardFrameRef.current = {
      height: metrics.height,
      screenY: metrics.screenY,
    };
    const nextDockOffset = recomputeKeyboardDockOffset(keyboardFrameRef.current);

    if (metrics.height > 0 || nextDockOffset > 0) {
      setKeyboardVisibleHeight(metrics.height);
    }

    return {
      ...metrics,
      dockOffset: nextDockOffset,
    };
  }, [readKeyboardMetricsFrame, recomputeKeyboardDockOffset]);
  const fullscreenChartMinHeight = Math.max(
    1,
    chartTradeSheetHostHeight || screenHeight - safeInsets.top - safeInsets.bottom,
  );
  const chartTradeSheetPortalEnabled = !isChartExpanded;
  // Expanded/fullscreen geometry still needs enough room for the complete
  // pinned chrome. The normal compact state replaces exactly the app-menu
  // area beneath the Sell/Lot/Buy divider.
  const chartTradeSheetFullChromeMinimumHeight = 186;
  const chartTradeSheetCollapsedHeight = resolveChartTradeSheetCollapsedHeight({
    bottomTabBarHeight: chartBottomTabBarHeight,
    safeAreaBottom: safeInsets.bottom,
    portalEnabled: chartTradeSheetPortalEnabled,
    nonPortalHeight: chartTradeSheetFullChromeMinimumHeight,
  });
  const fullscreenToolbarTouchBuffer = 18;
  const fullscreenToolbarTopPadding = safeInsets.top + fullscreenToolbarTouchBuffer;
  const chartHeaderTopPadding = (Platform.OS === 'web' ? 0 : Math.max(safeInsets.top, 0)) + 6;
  const focusedLotChartViewportHeight = useMemo(() => {
    if (
      Platform.OS !== 'android' ||
      !footerLotEditorFocused ||
      showChartTradeSheet
    ) {
      return 0;
    }

    const headerHeight =
      chartTradeCompactHeaderHeight > 0
        ? chartTradeCompactHeaderHeight
        : chartHeaderTopPadding + 84;
    const hostViewportHeight =
      chartTradeSheetHostHeight > 0
        ? chartTradeSheetHostHeight
        : Math.max(0, screenHeight - headerHeight);
    const keyboardReserve =
      chartTabBarKeyboardLift > 0
        ? chartTabBarKeyboardLift + Math.max(safeInsets.bottom, 0)
        : 0;
    const inlineFooterHeight =
      chartTradeInlineFooterHeight > 0
        ? chartTradeInlineFooterHeight
        : CHART_TRADE_INLINE_FOOTER_FALLBACK_HEIGHT;
    const bottomNavigationReserve =
      chartTabBarKeyboardLift > 0 ? chartBottomTabBarHeight : 0;
    const reservedBottomStack =
      keyboardReserve +
      bottomNavigationReserve +
      inlineFooterHeight;

    return Math.max(1, Math.round(hostViewportHeight - reservedBottomStack));
  }, [
    chartBottomTabBarHeight,
    chartHeaderTopPadding,
    chartTabBarKeyboardLift,
    chartTradeCompactHeaderHeight,
    chartTradeInlineFooterHeight,
    chartTradeSheetHostHeight,
    footerLotEditorFocused,
    safeInsets.bottom,
    screenHeight,
    showChartTradeSheet,
  ]);
  const fullscreenChartTradeSheetTopInset = fullscreenToolbarTopPadding + 36;
  const chartTradeSheetToolbarBottomInset =
    isChartExpanded && chartTradeTopToolbarBottomOffset > 0
      ? Math.max(chartTradeTopToolbarBottomOffset, fullscreenChartTradeSheetTopInset)
      : isChartExpanded
        ? fullscreenChartTradeSheetTopInset
        : 0;
  const chartTradeSheetTopGap = isChartExpanded
    ? CHART_TRADE_SHEET_TOP_GAP
    : CHART_TRADE_COMPACT_SHEET_TOP_GAP;
  const chartTradeSheetTopInset = resolveChartTradeSheetTopInset({
    isFullscreen: isChartExpanded,
    toolbarBottomInset: chartTradeSheetToolbarBottomInset,
    topGap: chartTradeSheetTopGap,
    compactHeaderHeight: chartTradeCompactHeaderHeight,
    hostTopOffset: chartTradeSheetHostTopOffset,
  });
  const chartTradeSheetFallbackHostHeight = Math.max(
    chartTradeSheetFullChromeMinimumHeight + 180,
    screenHeight - Math.max(safeInsets.top, 0),
  );
  const resolvedChartTradeSheetHostHeight =
    chartTradeSheetHostHeight > 0 ? chartTradeSheetHostHeight : chartTradeSheetFallbackHostHeight;
  const chartTradeSheetPresentationHostHeight = resolveChartTradeSheetPortalHostHeight({
    hostHeight: resolvedChartTradeSheetHostHeight,
    bottomTabBarHeight: chartBottomTabBarHeight,
    safeAreaBottom: safeInsets.bottom,
    portalEnabled: chartTradeSheetPortalEnabled,
  });
  const chartTradeSheetHeaderLift = resolveChartTradeSheetHeaderLift({
    topInset: chartTradeSheetTopInset,
    compactHeaderHeight: chartTradeCompactHeaderHeight,
    isFullscreen: isChartExpanded,
  });
  // Keep one canonical Sell/Lot/Buy row in the Chart layout. The compact
  // portaled sheet begins at its lower divider; expanded mode can cover it
  // without mounting the duplicate footer branch below.
  const showInlineFooterWhileChartTradeSheetOpen = false;
  useEffect(() => {
    if (!isChartExpanded) {
      setChartTradeTopToolbarBottomOffset(0);
    }
  }, [isChartExpanded]);
  const chartTradeSheetBottomInset = !isChartExpanded && showInlineFooterWhileChartTradeSheetOpen
    ? (chartTradeInlineFooterHeight > 0 ? chartTradeInlineFooterHeight : CHART_TRADE_INLINE_FOOTER_FALLBACK_HEIGHT)
    : 0;
  const chartTradeSheetMaxHeight = resolveChartTradeSheetMaxHeight({
    collapsedHeight: chartTradeSheetFullChromeMinimumHeight,
    hostHeight: chartTradeSheetPresentationHostHeight,
    topInset: chartTradeSheetTopInset,
    headerLift: chartTradeSheetHeaderLift,
    bottomInset: chartTradeSheetBottomInset,
  });
  const chartTradeSheetExpandedTranslateY = 0;
  const chartTradeSheetCollapsedTranslateY = Math.max(0, chartTradeSheetMaxHeight - chartTradeSheetCollapsedHeight);
  const chartTradeSheetHiddenTranslateY = chartTradeSheetMaxHeight + 18;
  const fullscreenDrawingToolsSheetTopInset = fullscreenToolbarTopPadding + 72;
  const drawingToolsSheetTopInset = isChartExpanded
    ? fullscreenDrawingToolsSheetTopInset + 24
    : safeInsets.top + 80;
  const chartScrollRef = useRef<ScrollView>(null);
  const chartTradeHostRef = useRef<View>(null);
  const footerTradeRowAnchorRef = useRef<View>(null);
  const chartTradeSheetScrollRef = useRef<ScrollView>(null);
  const chartTradeTypeTabsOverlayScrollRef = useRef<ScrollView>(null);
  const chartTradeTypeTabsInlineScrollRef = useRef<ScrollView>(null);
  const chartTradeTypeTabsOverlayLayoutsRef = useRef<Partial<Record<ChartOrderType, ChartTradeTypeTabLayout>>>({});
  const chartTradeTypeTabsInlineLayoutsRef = useRef<Partial<Record<ChartOrderType, ChartTradeTypeTabLayout>>>({});
  const chartTradeTypeTabsOverlayViewportWidthRef = useRef(0);
  const chartTradeTypeTabsInlineViewportWidthRef = useRef(0);
  const chartTradeCommentInputRef = useRef<TextInput>(null);
  const chartTradeCommentSubmitIntentRef = useRef(false);
  const chartTradeSheetScrollOffsetRef = useRef(0);
  const keyboardFrameRef = useRef<{ height: number; screenY: number | null }>({ height: 0, screenY: null });
  const chartTradeHostBottomRef = useRef<number | null>(null);
  const footerTradeRowAnchorBottomRef = useRef<number | null>(null);
  // Area is an inspection-first chart: arm the existing mobile crosshair on
  // restore as well as on picker selection, so its price probe is immediately
  // available without making the user discover a separate drawing-tool step.
  const [activeTool, setActiveTool] = useState<string>(() => (
    chartVisualType === 'area' ? CHART_CROSSHAIR_TOOL : CHART_NO_DRAWING_TOOL
  ));
  // Only the crosshair armed automatically by Area belongs to this lifecycle.
  // A crosshair the trader explicitly selects stays manual and therefore must
  // survive a later switch back to candles/line.
  const areaAutoInspectorOwnerPaneIdRef = useRef<string | null>(
    chartVisualType === 'area' ? chartWindows.activePane.id : null,
  );
  const [chartDrawingInputActive, setChartDrawingInputActive] = useState(false);
  const chartDrawingToolOwnerPaneIdRef = useRef<string | null>(null);
  const [chartTapMenuAnchor, setChartTapMenuAnchor] = useState<ChartTapMenuAnchor | null>(null);
  const chartTapMenuOpenedAtRef = useRef<number | null>(null);
  const [chartTapMenuBounds, setChartTapMenuBounds] = useState<ChartTapMenuBounds>({ width: 0, height: 0 });
  const [chartTapMenuViewport, setChartTapMenuViewport] = useState<ChartTapMenuViewport>({ x: 0, y: 0, width: 0, height: 0 });
  const [auxiliaryChartPaneViewport, setAuxiliaryChartPaneViewport] = useState<ChartWindowPaneFrame | null>(null);
  // Split-pane selection commits asynchronously. Keep the original gesture
  // pending until its pane, symbol, timeframe, account scope, and bounds agree.
  const [pendingChartWindowRadialMenu, setPendingChartWindowRadialMenu] = useState<Readonly<{
    request: ChartWindowRadialMenuRequest;
    token: number;
  }> | null>(null);
  const chartWindowRadialMenuTokenRef = useRef(0);
  const chartWindowSplitModeRef = useRef(false);
  const chartWindowToolbarTargetPaneIdRef = useRef<string | null>(null);
  const [, setChartPlotArea] = useState<FixedHorizontalGridPlotArea | null>(null);
  const chartVisiblePriceRangeRef = useRef<ChartVisiblePriceRange | null>(null);
  const chartManualPriceScaleRef = useRef<ChartManualPriceScaleSnapshot | null>(null);
  const [stickyDrawingMode, setStickyDrawingMode] = useState(false);
  const [drawingMagnetMode, setDrawingMagnetMode] = useState(false);
  type ChartWindowDrawingControls = Readonly<{
    sticky: boolean;
    magnet: boolean;
  }>;
  const [chartWindowDrawingControls, setChartWindowDrawingControls] = useState<
    Readonly<Record<string, ChartWindowDrawingControls>>
  >({});
  const chartWindowDrawingControlsRef = useRef(chartWindowDrawingControls);
  const lastDrawingControlsActivePaneIdRef = useRef(chartWindows.activePane.id);
  chartWindowDrawingControlsRef.current = chartWindowDrawingControls;
  useLayoutEffect(() => {
    const paneIds = new Set(chartWindows.state.panes.map((pane) => pane.id));
    const next: Record<string, ChartWindowDrawingControls> = {};
    chartWindows.state.panes.forEach((pane) => {
      next[pane.id] = chartWindowDrawingControlsRef.current[pane.id]
        ?? Object.freeze({ sticky: stickyDrawingMode, magnet: drawingMagnetMode });
    });
    const needsReconcile =
      Object.keys(chartWindowDrawingControlsRef.current).some((paneId) => !paneIds.has(paneId))
      || chartWindows.state.panes.some(
        (pane) => !chartWindowDrawingControlsRef.current[pane.id],
      );
    if (needsReconcile) {
      const frozen = Object.freeze(next);
      chartWindowDrawingControlsRef.current = frozen;
      setChartWindowDrawingControls(frozen);
    }

    if (lastDrawingControlsActivePaneIdRef.current !== chartWindows.activePane.id) {
      lastDrawingControlsActivePaneIdRef.current = chartWindows.activePane.id;
      const controls = next[chartWindows.activePane.id]
        ?? Object.freeze({ sticky: false, magnet: false });
      setStickyDrawingMode(controls.sticky);
      setDrawingMagnetMode(controls.magnet);
    }
  }, [
    chartWindows.activePane.id,
    chartWindows.state.panes,
    drawingMagnetMode,
    stickyDrawingMode,
  ]);
  const updateChartWindowDrawingControls = useCallback((
    patch: Partial<ChartWindowDrawingControls>,
  ) => {
    const currentWindowState = chartWindowsStateRef.current;
    const targetPaneIds = currentWindowState.toolbarTargetPaneId === null
      ? currentWindowState.panes.map((pane) => pane.id)
      : [currentWindowState.toolbarTargetPaneId];
    setChartWindowDrawingControls((current) => {
      const next = { ...current };
      targetPaneIds.forEach((paneId) => {
        next[paneId] = Object.freeze({
          sticky: current[paneId]?.sticky ?? stickyDrawingMode,
          magnet: current[paneId]?.magnet ?? drawingMagnetMode,
          ...patch,
        });
      });
      const frozen = Object.freeze(next);
      chartWindowDrawingControlsRef.current = frozen;
      return frozen;
    });
  }, [drawingMagnetMode, stickyDrawingMode]);
  const [textLevelEditRequest, setTextLevelEditRequest] = useState<TextLevelEditRequest | null>(null);
  const [chartViewportTouchActive, setChartViewportTouchActive] = useState(false);
  // React state drives gesture UI; this ref changes synchronously so duplicate
  // native and WebView touch messages can be coalesced before another render.
  const chartViewportTouchActiveRef = useRef(false);
  const pendingChartDrawingTool = useUIState((s) => s.pendingChartDrawingTool);
  const clearPendingChartDrawingTool = useUIState((s) => s.clearPendingChartDrawingTool);
  const pendingChartCommand = useUIState((s) => s.pendingChartCommand);
  const clearPendingChartCommand = useUIState((s) => s.clearPendingChartCommand);
  const shouldCaptureChartGestures =
    isChartExpanded || activeTool === CHART_CROSSHAIR_TOOL || chartDrawingInputActive || Boolean(pendingChartDrawingTool);

  const webViewRef = useRef<WebView>(null);

  // The retained overlay is independent of ChartScreen state. Clear it when
  // Chart blurs so a half-open picker never covers Quotes/Trade after a tab swap.
  useEffect(() => {
    if (!isScreenFocused) {
      hideChartTimeframePicker();
    }
  }, [isScreenFocused]);

  const nextObjectsDrawingSyncRequestIdRef = useRef(0);
  const pendingObjectsDrawingSyncRef = useRef<{
    onReady: () => void;
    requestId: number;
  } | null>(null);
  const chartViewportRef = useRef<View>(null);
  const chartTapMenuBoundsRef = useRef<ChartTapMenuBounds>({ width: 0, height: 0 });
  const chartTapMenuViewportRef = useRef<ChartTapMenuViewport>({ x: 0, y: 0, width: 0, height: 0 });
  const chartTapMenuSuppressUntilRef = useRef(0);
  const lastChartViewportSizeRef = useRef({ width: 0, height: 0 });
  const pendingChartViewportSizeRef = useRef<{ width: number; height: number } | null>(null);
  const chartViewportResizeFrameRef = useRef<number | null>(null);
  const chartViewportResizeCommitFrameRef = useRef<number | null>(null);
  const chartViewportRecoveryFrameRef = useRef<number | null>(null);
  const chartViewportRecoveryTokenRef = useRef(0);
  const chartViewportTouchReleaseFrameRef = useRef<number | null>(null);
  const chartViewportTouchFailsafeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chartTradeSheetTranslateY = useSharedValue(chartTradeSheetHiddenTranslateY);
  const chartTradeSheetDragStartY = useSharedValue(chartTradeSheetCollapsedTranslateY);
  const chartTradeSheetLastVisibleOffsetRef = useRef(chartTradeSheetCollapsedTranslateY);
  const flushChartViewportResize = useCallback((force: boolean = false) => {
    const pending = pendingChartViewportSizeRef.current;
    if (!pending) {
      return;
    }
    const current = lastChartViewportSizeRef.current;
    if (!force && current.width === pending.width && current.height === pending.height) {
      return;
    }
    lastChartViewportSizeRef.current = pending;
    webViewRef.current?.injectJavaScript(`
      if (typeof resizeChartViewport === 'function') {
        resizeChartViewport(${pending.width}, ${pending.height});
      }
      true;
    `);
  }, []);
  const recoverChartViewportSurface = useCallback((width: number, height: number) => {
    const nextWidth = Math.round(width);
    const nextHeight = Math.round(height);
    if (!webViewRef.current) {
      return;
    }
    if (!Number.isFinite(nextWidth) || !Number.isFinite(nextHeight) || nextWidth <= 0 || nextHeight <= 0) {
      return;
    }
    webViewRef.current.injectJavaScript(`
      try {
        if (typeof recoverChartSurface === 'function') {
          recoverChartSurface(${nextWidth}, ${nextHeight});
        }
      } catch (_) {}
      true;
    `);
  }, []);
  const scheduleChartViewportResize = useCallback((width: number, height: number, force: boolean = false) => {
    const nextWidth = Math.round(width);
    const nextHeight = Math.round(height);
    if (!Number.isFinite(nextWidth) || !Number.isFinite(nextHeight) || nextWidth <= 0 || nextHeight <= 0) {
      return;
    }
    pendingChartViewportSizeRef.current = { width: nextWidth, height: nextHeight };
    if (force) {
      if (chartViewportResizeFrameRef.current !== null) {
        cancelAnimationFrame(chartViewportResizeFrameRef.current);
        chartViewportResizeFrameRef.current = null;
      }
      if (chartViewportResizeCommitFrameRef.current !== null) {
        cancelAnimationFrame(chartViewportResizeCommitFrameRef.current);
        chartViewportResizeCommitFrameRef.current = null;
      }
      chartViewportResizeFrameRef.current = requestAnimationFrame(() => {
        chartViewportResizeFrameRef.current = null;
        flushChartViewportResize(true);
      });
      return;
    }
    if (chartViewportResizeFrameRef.current !== null) {
      cancelAnimationFrame(chartViewportResizeFrameRef.current);
    }
    if (chartViewportResizeCommitFrameRef.current !== null) {
      cancelAnimationFrame(chartViewportResizeCommitFrameRef.current);
    }
    chartViewportResizeFrameRef.current = requestAnimationFrame(() => {
      chartViewportResizeFrameRef.current = null;
      chartViewportResizeCommitFrameRef.current = requestAnimationFrame(() => {
        chartViewportResizeCommitFrameRef.current = null;
        flushChartViewportResize(force);
      });
    });
  }, [flushChartViewportResize]);
  const handleChartViewportTouchStart = useCallback(() => {
    if (chartViewportTouchReleaseFrameRef.current !== null) {
      cancelAnimationFrame(chartViewportTouchReleaseFrameRef.current);
      chartViewportTouchReleaseFrameRef.current = null;
    }
    if (chartViewportTouchFailsafeTimerRef.current) {
      clearTimeout(chartViewportTouchFailsafeTimerRef.current);
    }
    chartViewportTouchFailsafeTimerRef.current = setTimeout(() => {
      chartViewportTouchFailsafeTimerRef.current = null;
      chartViewportTouchActiveRef.current = false;
      setChartViewportTouchActive(false);
    }, CHART_VIEWPORT_TOUCH_FAILSAFE_MS);
    if (footerLotEditorFocused || footerLotEditorOpening || footerLotPickerMode !== null) {
      chartTapMenuSuppressUntilRef.current = Date.now() + CHART_TAP_MENU_LOT_INPUT_SUPPRESSION_MS;
      setChartTapMenuAnchor(null);
    }
    if (!showChartTradeSheet) {
      if (footerLotPickerMode !== null) {
        setFooterLotPickerMode(null);
      }
      if (footerLotEditorFocused) {
        finishFooterLotEditor();
        Keyboard.dismiss();
      }
    }
    chartViewportTouchActiveRef.current = true;
    setChartViewportTouchActive((current) => (current ? current : true));
  }, [finishFooterLotEditor, footerLotEditorFocused, footerLotEditorOpening, footerLotPickerMode, showChartTradeSheet]);
  const handleChartViewportTouchEnd = useCallback(() => {
    // Native onTouchEnd and the WebView bridge can report the same release.
    // Leave the first release frame armed when the duplicate arrives.
    if (!chartViewportTouchActiveRef.current) {
      return;
    }
    if (chartViewportTouchReleaseFrameRef.current !== null) {
      cancelAnimationFrame(chartViewportTouchReleaseFrameRef.current);
    }
    if (chartViewportTouchFailsafeTimerRef.current) {
      clearTimeout(chartViewportTouchFailsafeTimerRef.current);
      chartViewportTouchFailsafeTimerRef.current = null;
    }
    chartViewportTouchActiveRef.current = false;
    chartViewportTouchReleaseFrameRef.current = requestAnimationFrame(() => {
      chartViewportTouchReleaseFrameRef.current = null;
      setChartViewportTouchActive(false);
    });
  }, []);
  // Settle touch state immediately on radial open. Otherwise a queued release
  // frame or failsafe render can interrupt the retained menu's entrance.
  const settleChartViewportTouchForRadialOpen = useCallback(() => {
    if (chartViewportTouchReleaseFrameRef.current !== null) {
      cancelAnimationFrame(chartViewportTouchReleaseFrameRef.current);
      chartViewportTouchReleaseFrameRef.current = null;
    }
    if (chartViewportTouchFailsafeTimerRef.current) {
      clearTimeout(chartViewportTouchFailsafeTimerRef.current);
      chartViewportTouchFailsafeTimerRef.current = null;
    }
    chartViewportTouchActiveRef.current = false;
    setChartViewportTouchActive(false);
  }, []);
  useEffect(() => {
    chartTapMenuBoundsRef.current = chartTapMenuBounds;
  }, [chartTapMenuBounds]);
  useEffect(() => {
    chartTapMenuViewportRef.current = chartTapMenuViewport;
  }, [chartTapMenuViewport]);

  const syncChartViewportFrame = useCallback((onMeasured?: (viewport: ChartTapMenuViewport) => void) => {
    requestAnimationFrame(() => {
      if (!chartViewportRef.current) {
        onMeasured?.(chartTapMenuViewportRef.current);
        return;
      }
      chartViewportRef.current?.measureInWindow((x, y, width, height) => {
        const hasValidFrame =
          [x, y, width, height].every((value) => Number.isFinite(value)) &&
          width > 0 &&
          height > 0;
        const nextViewport = hasValidFrame
          ? { x, y, width, height }
          : chartTapMenuViewportRef.current;
        chartTapMenuViewportRef.current = nextViewport;
        setChartTapMenuViewport((current) =>
          current.x === nextViewport.x &&
            current.y === nextViewport.y &&
            current.width === nextViewport.width &&
            current.height === nextViewport.height
            ? current
            : nextViewport,
        );
        onMeasured?.(nextViewport);
      });
    });
  }, []);
  const cancelChartViewportRecovery = useCallback(() => {
    chartViewportRecoveryTokenRef.current += 1;
    if (chartViewportRecoveryFrameRef.current !== null) {
      cancelAnimationFrame(chartViewportRecoveryFrameRef.current);
      chartViewportRecoveryFrameRef.current = null;
    }
  }, []);
  const requestChartViewportRecovery = useCallback((passes: number = 4) => {
    const initialBounds = chartTapMenuBoundsRef.current;

    cancelChartViewportRecovery();
    const token = chartViewportRecoveryTokenRef.current;
    let passesRemaining = Math.max(0, Math.round(passes));

    const runRecoveryPass = () => {
      if (chartViewportRecoveryTokenRef.current !== token) {
        return;
      }

      const fallbackBounds = chartTapMenuBoundsRef.current;
      syncChartViewportFrame((viewport) => {
        if (chartViewportRecoveryTokenRef.current !== token) {
          return;
        }

        const fallbackWidth = fallbackBounds.width > 0 ? fallbackBounds.width : initialBounds.width;
        const fallbackHeight = fallbackBounds.height > 0 ? fallbackBounds.height : initialBounds.height;
        const resizeWidth = viewport.width > 0 ? viewport.width : fallbackWidth;
        const resizeHeight = viewport.height > 0 ? viewport.height : fallbackHeight;
        if (resizeWidth <= 0 || resizeHeight <= 0) {
          return;
        }

        scheduleChartViewportResize(resizeWidth, resizeHeight, true);
        if (passesRemaining <= 0) {
          recoverChartViewportSurface(resizeWidth, resizeHeight);
          chartViewportRecoveryFrameRef.current = null;
          return;
        }

        passesRemaining -= 1;
        chartViewportRecoveryFrameRef.current = requestAnimationFrame(runRecoveryPass);
      });
    };

    chartViewportRecoveryFrameRef.current = requestAnimationFrame(runRecoveryPass);
  }, [cancelChartViewportRecovery, recoverChartViewportSurface, scheduleChartViewportResize, syncChartViewportFrame]);
  const scheduleChartViewportColdStartRecovery = useCallback(() => {
    requestChartViewportRecovery(6);
    const recoveryTimers = [180, 650, 1400, 2600].map((delayMs) =>
      setTimeout(() => {
        requestChartViewportRecovery(delayMs >= 1400 ? 4 : 5);
      }, delayMs),
    );

    return () => {
      recoveryTimers.forEach((timer) => clearTimeout(timer));
    };
  }, [requestChartViewportRecovery]);
  useEffect(() => () => {
    cancelChartViewportRecovery();
    if (chartViewportResizeFrameRef.current !== null) {
      cancelAnimationFrame(chartViewportResizeFrameRef.current);
      chartViewportResizeFrameRef.current = null;
    }
    if (chartViewportResizeCommitFrameRef.current !== null) {
      cancelAnimationFrame(chartViewportResizeCommitFrameRef.current);
      chartViewportResizeCommitFrameRef.current = null;
    }
    if (chartViewportTouchReleaseFrameRef.current !== null) {
      cancelAnimationFrame(chartViewportTouchReleaseFrameRef.current);
      chartViewportTouchReleaseFrameRef.current = null;
    }
    if (chartViewportTouchFailsafeTimerRef.current) {
      clearTimeout(chartViewportTouchFailsafeTimerRef.current);
      chartViewportTouchFailsafeTimerRef.current = null;
    }
  }, [cancelChartViewportRecovery]);
  useEffect(() => {
    if (chartViewportResizeFrameRef.current !== null) {
      cancelAnimationFrame(chartViewportResizeFrameRef.current);
      chartViewportResizeFrameRef.current = null;
    }
    if (chartViewportResizeCommitFrameRef.current !== null) {
      cancelAnimationFrame(chartViewportResizeCommitFrameRef.current);
      chartViewportResizeCommitFrameRef.current = null;
    }
    cancelChartViewportRecovery();
    pendingChartViewportSizeRef.current = null;
    setChartTradeSheetHostHeight(0);
  }, [cancelChartViewportRecovery, isChartExpanded]);
  useEffect(() => {
    const { width, height } = chartTapMenuBounds;
    if (width <= 0 || height <= 0) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      syncChartViewportFrame((viewport) => {
        const resizeWidth = viewport.width > 0 ? viewport.width : width;
        const resizeHeight = viewport.height > 0 ? viewport.height : height;
        scheduleChartViewportResize(resizeWidth, resizeHeight);
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [chartTapMenuBounds.height, chartTapMenuBounds.width, scheduleChartViewportResize, syncChartViewportFrame]);
  useEffect(() => {
    requestChartViewportRecovery(4);
    return cancelChartViewportRecovery;
  }, [
    isChartExpanded,
    chartTapMenuBounds.height,
    chartTapMenuBounds.width,
    cancelChartViewportRecovery,
    requestChartViewportRecovery,
  ]);
  useEffect(() => {
    if (!isScreenFocused || !chartRuntimeActive || !chartSurfaceReady) {
      return;
    }

    // The chart WebView is retained only after its first real focused mount.
    // Re-entering the route measures the native viewport directly so the
    // retained surface recovers from any inactive-route layout changes.
    const cancelColdStartRecovery = scheduleChartViewportColdStartRecovery();
    return () => {
      cancelColdStartRecovery();
      cancelChartViewportRecovery();
    };
  }, [
    chartRuntimeActive,
    chartSurfaceReady,
    cancelChartViewportRecovery,
    isScreenFocused,
    scheduleChartViewportColdStartRecovery,
  ]);
  const chartDataActive = chartRuntimeActive;
  const {
    candles,
    hasHistoryCandles: chartHasHistoryCandles,
    paginate,
    refresh: refreshChartHistory,
    loading: chartDataLoading,
    error: chartDataError,
  } = useLiveCandles(
    chartSymbol,
    chartTimeframe,
    chartDataActive,
    CHART_SCREEN_CANDLE_COMMIT_INTERVAL_MS,
  );
  const areaVisibleBarTarget = useAreaChartHistoryExpansion({
    active: chartDataActive,
    chartType: chartVisualType,
    symbol: chartSymbol,
    timeframe: chartTimeframe,
    cacheScopeKey: chartMarketDataCacheNamespace,
    candleCount: candles.length,
    hasHistoryCandles: chartHasHistoryCandles,
    historyLoading: chartDataLoading,
    paginate,
  });
  const chartMarketLifecycleContextKey =
    `${chartMarketDataCacheNamespace}:${chartSymbol}:${chartTimeframe}`;
  const chartMarketLifecycleRef = useRef<{
    contextKey: string;
    quotePhase: ChartQuoteSessionPhase;
    sessionClose: number | null;
  }>({ contextKey: '', quotePhase: 'unknown', sessionClose: null });
  const [chartReopenHistoryRepair, setChartReopenHistoryRepair] = useState<{
    contextKey: string;
    sawLoading: boolean;
  } | null>(null);
  const previousChartMarketLifecycle = chartMarketLifecycleRef.current;
  const detectedChartMarketReopen =
    previousChartMarketLifecycle.contextKey === chartMarketLifecycleContextKey &&
    shouldRefreshChartHistoryOnSessionTransition(
      previousChartMarketLifecycle.quotePhase,
      chartMarketSessionPolicy.quotePhase,
    );
  const isChartMarketReopening =
    detectedChartMarketReopen ||
    chartReopenHistoryRepair?.contextKey === chartMarketLifecycleContextKey;
  const shouldApplyClosedCandlePolicy = isChartMarketClosed || isChartMarketReopening;
  const closedCandlePolicySessionClose = isChartMarketClosed
    ? chartMarketSessionPolicy.sessionClose
    : isChartMarketReopening &&
      previousChartMarketLifecycle.contextKey === chartMarketLifecycleContextKey
      ? previousChartMarketLifecycle.sessionClose
      : null;

  useEffect(() => {
    const previous = chartMarketLifecycleRef.current;
    const sameContext = previous.contextKey === chartMarketLifecycleContextKey;
    const isReopen =
      sameContext &&
      shouldRefreshChartHistoryOnSessionTransition(
        previous.quotePhase,
        chartMarketSessionPolicy.quotePhase,
      );

    chartMarketLifecycleRef.current = {
      contextKey: chartMarketLifecycleContextKey,
      quotePhase: chartMarketSessionPolicy.quotePhase,
      sessionClose:
        chartMarketSessionPolicy.quotePhase === 'closed'
          ? chartMarketSessionPolicy.sessionClose
          : isReopen
            ? previous.sessionClose
            : null,
    };

    if (!sameContext) {
      setChartReopenHistoryRepair((current) =>
        current?.contextKey === chartMarketLifecycleContextKey ? current : null,
      );
      return;
    }
    if (!isReopen) return;

    // Keep the already-sanitized closed view on screen while one fresh REST
    // history baseline replaces any hidden weekend placeholder rows. Live Bid
    // and Buy/Sell prices continue through the separate exact-quote path.
    setChartReopenHistoryRepair({
      contextKey: chartMarketLifecycleContextKey,
      sawLoading: false,
    });
    refreshChartHistory();
  }, [
    chartMarketLifecycleContextKey,
    chartMarketSessionPolicy.quotePhase,
    chartMarketSessionPolicy.sessionClose,
    refreshChartHistory,
  ]);

  useEffect(() => {
    if (chartReopenHistoryRepair?.contextKey !== chartMarketLifecycleContextKey) return;
    if (chartDataLoading && !chartReopenHistoryRepair.sawLoading) {
      setChartReopenHistoryRepair({
        contextKey: chartMarketLifecycleContextKey,
        sawLoading: true,
      });
      return;
    }
    if (
      chartReopenHistoryRepair.sawLoading &&
      !chartDataLoading &&
      !chartDataError
    ) {
      setChartReopenHistoryRepair(null);
      if (chartMarketLifecycleRef.current.contextKey === chartMarketLifecycleContextKey) {
        chartMarketLifecycleRef.current.sessionClose = null;
      }
    }
  }, [
    chartDataError,
    chartDataLoading,
    chartMarketLifecycleContextKey,
    chartReopenHistoryRepair,
  ]);
  const closedMarketFlatBackfillRef = useRef({ contextKey: '', requested: false });
  const closedMarketFlatBackfillContextKey = `${chartMarketDataCacheNamespace}:${chartSymbol}:${chartTimeframe}:${typeof chartMarketSessionPolicy.sessionClose === 'number' && Number.isFinite(chartMarketSessionPolicy.sessionClose)
    ? chartMarketSessionPolicy.sessionClose
    : 'missing-session-close'
    }`;
  useEffect(() => {
    if (!isChartMarketClosed) {
      if (closedMarketFlatBackfillRef.current.contextKey) {
        closedMarketFlatBackfillRef.current = { contextKey: '', requested: false };
      }
      return;
    }

    if (closedMarketFlatBackfillRef.current.contextKey !== closedMarketFlatBackfillContextKey) {
      closedMarketFlatBackfillRef.current = {
        contextKey: closedMarketFlatBackfillContextKey,
        requested: false,
      };
    }

    const backfillState = closedMarketFlatBackfillRef.current;
    if (
      !chartDataActive ||
      chartDataLoading ||
      backfillState.requested ||
      candles.length < INITIAL_HISTORY_LIMIT ||
      !hasOnlyRepeatedFlatCandles(candles)
    ) {
      return;
    }

    // React notifications are throttled, so re-check the engine synchronously
    // before consuming this context's one automatic backfill attempt.
    const streamState = liveCandlesEngine.getState(chartSymbol, chartTimeframe);
    if (!streamState || streamState.loading) {
      return;
    }

    backfillState.requested = true;
    paginate();
  }, [
    candles,
    chartDataActive,
    chartDataLoading,
    chartSymbol,
    chartTimeframe,
    closedMarketFlatBackfillContextKey,
    isChartMarketClosed,
    paginate,
  ]);
  const sanitizedBackendCandles = useMemo(
    () => (
      candles.length > 0
        ? sanitizeCandlesForChart(candles, {
          timeframe: chartTimeframe,
          pruneSyntheticFlatLiveTail: shouldApplyClosedCandlePolicy,
          closedMarketSessionClose: shouldApplyClosedCandlePolicy
            ? closedCandlePolicySessionClose
            : undefined,
        })
        : EMPTY_DISPLAY_CANDLES
    ),
    [
      candles,
      chartTimeframe,
      closedCandlePolicySessionClose,
      shouldApplyClosedCandlePolicy,
    ],
  );
  const readRenderableCanonicalCandles = useCallback(() => {
    if (isPublicDemoMarket) {
      return sanitizedBackendCandles;
    }
    const canonicalCandles = liveCandlesEngine.getCandles(chartSymbol, chartTimeframe);
    if (!shouldApplyClosedCandlePolicy || canonicalCandles.length === 0) {
      return canonicalCandles;
    }

    return sanitizeCandlesForChart(canonicalCandles, {
      timeframe: chartTimeframe,
      pruneSyntheticFlatLiveTail: true,
      closedMarketSessionClose: closedCandlePolicySessionClose,
    });
  }, [
    chartSymbol,
    chartTimeframe,
    closedCandlePolicySessionClose,
    isPublicDemoMarket,
    sanitizedBackendCandles,
    shouldApplyClosedCandlePolicy,
  ]);
  const chartDrawingRecords = useMemo(
    () =>
      filterChartDrawingRecordsForCurrentChart(
        scopedChartDrawingRecords,
        chartSymbol,
        chartTimeframe,
        sanitizedBackendCandles,
        chartWindows.isSplit ? chartWindows.activePane.id : undefined,
      ),
    [
      chartSymbol,
      chartTimeframe,
      chartWindows.activePane.id,
      chartWindows.isSplit,
      sanitizedBackendCandles,
      scopedChartDrawingRecords,
    ],
  );
  const chartDrawingSignature = useMemo(() => JSON.stringify(chartDrawingRecords), [chartDrawingRecords]);
  // Selection + history state reported live by the WebView drawing engine.
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [drawingHistoryState, setDrawingHistoryState] = useState({ canRedo: false, canUndo: false });
  const chartWindowDrawingHistoriesRef = useRef<
    Record<string, ChartWindowDrawingHistory>
  >({});

  useLayoutEffect(() => {
    if (!chartWindows.isSplit) return;
    const targetPanes = chartWindows.toolbarTargetPaneId === null
      ? chartWindows.state.panes
      : chartWindows.state.panes.filter(
        (pane) => pane.id === chartWindows.toolbarTargetPaneId,
      );
    const availability = targetPanes.reduce(
      (combined, pane) => {
        const bucket = chartDrawingRecordsBySymbol[getChartDrawingBucketKey(pane.symbol)] ?? [];
        const paneDrawings = pane.id === chartWindows.activePane.id
          ? chartDrawingRecords
          : bucket.filter(
            (drawing) => (
              isChartDrawingForWindowContext(drawing, pane.symbol, pane.timeframe)
              && isChartDrawingForWindowPane(drawing, pane.id)
            ),
          );
        const historyKey = getChartWindowDrawingHistoryKey(
          pane.id,
          pane.symbol,
          pane.timeframe,
        );
        const history = reconcileChartWindowDrawingHistory(
          chartWindowDrawingHistoriesRef.current[historyKey],
          paneDrawings,
        );
        chartWindowDrawingHistoriesRef.current[historyKey] = history;
        const paneAvailability = getChartWindowDrawingHistoryAvailability(history);
        return {
          canUndo: combined.canUndo || paneAvailability.canUndo,
          canRedo: combined.canRedo || paneAvailability.canRedo,
        };
      },
      { canUndo: false, canRedo: false },
    );
    setDrawingHistoryState((current) => (
      current.canUndo === availability.canUndo && current.canRedo === availability.canRedo
        ? current
        : availability
    ));
  }, [
    chartDrawingRecordsBySymbol,
    chartDrawingRecords,
    chartWindows.activePane,
    chartWindows.isSplit,
    chartWindows.state.panes,
    chartWindows.toolbarTargetPaneId,
  ]);

  const applyChartWindowDrawingHistoryAction = useCallback((
    action: 'clear' | 'redo' | 'undo',
  ): boolean => {
    const currentWindowState = chartWindowsStateRef.current;
    if (currentWindowState.panes.length <= 1) return false;
    const targetPaneIds = new Set(
      currentWindowState.toolbarTargetPaneId === null
        ? currentWindowState.panes.map((pane) => pane.id)
        : [currentWindowState.toolbarTargetPaneId],
    );
    const persistedBuckets = useUserPreferences.getState().chartDrawingRecordsBySymbol;
    const pendingBuckets = new Map<
      string,
      { symbol: string; drawings: PersistedChartDrawing[] }
    >();
    const targetAvailability = { canUndo: false, canRedo: false };
    let changed = false;

    currentWindowState.panes.forEach((pane) => {
      if (!targetPaneIds.has(pane.id)) return;
      const bucketKey = getChartDrawingBucketKey(pane.symbol);
      const bucket = pendingBuckets.get(bucketKey) ?? {
        symbol: pane.symbol,
        drawings: [...(persistedBuckets[bucketKey] ?? [])],
      };
      const paneDrawings = bucket.drawings.filter(
        (drawing) => (
          isChartDrawingForWindowContext(drawing, pane.symbol, pane.timeframe)
          && isChartDrawingForWindowPane(drawing, pane.id)
        ),
      );
      const historyKey = getChartWindowDrawingHistoryKey(
        pane.id,
        pane.symbol,
        pane.timeframe,
      );
      const alignedHistory = reconcileChartWindowDrawingHistory(
        chartWindowDrawingHistoriesRef.current[historyKey],
        paneDrawings,
      );
      const transition = action === 'undo'
        ? undoChartWindowDrawingHistory(alignedHistory)
        : action === 'redo'
          ? redoChartWindowDrawingHistory(alignedHistory)
          : (() => {
            const history = recordChartWindowDrawingChange(alignedHistory, []);
            return {
              changed: history !== alignedHistory,
              drawings: history.present,
              history,
            };
          })();

      chartWindowDrawingHistoriesRef.current[historyKey] = transition.history;
      const paneAvailability = getChartWindowDrawingHistoryAvailability(transition.history);
      targetAvailability.canUndo ||= paneAvailability.canUndo;
      targetAvailability.canRedo ||= paneAvailability.canRedo;
      if (!transition.changed) {
        pendingBuckets.set(bucketKey, bucket);
        return;
      }

      changed = true;
      bucket.drawings = replaceChartWindowPaneDrawings(
        bucket.drawings,
        transition.drawings,
        pane,
      );
      pendingBuckets.set(bucketKey, bucket);
    });

    if (!changed) {
      setDrawingHistoryState(targetAvailability);
      return true;
    }

    pendingBuckets.forEach(({ symbol, drawings }) => {
      setChartDrawingRecordsForSymbol(symbol, drawings);
    });
    setSelectedDrawingId(null);
    setDrawingHistoryState(targetAvailability);
    return true;
  }, [setChartDrawingRecordsForSymbol]);
  const hasChartDrawings = chartDrawingRecords.length > 0;
  const selectedDrawingRecord = useMemo(
    () => (selectedDrawingId
      ? chartDrawingRecords.find((record) => record.id === selectedDrawingId) ?? null
      : null),
    [chartDrawingRecords, selectedDrawingId],
  );
  const hasHiddenChartDrawings = useMemo(
    () => chartDrawingRecords.some((record) => record.hidden),
    [chartDrawingRecords],
  );
  const hasLockedChartDrawings = useMemo(
    () => chartDrawingRecords.some((record) => record.locked === true),
    [chartDrawingRecords],
  );
  const latestChartPrecisionPrices = useMemo(() => {
    const latest = sanitizedBackendCandles[sanitizedBackendCandles.length - 1];
    return latest ? [latest.open, latest.high, latest.low, latest.close] : [];
  }, [sanitizedBackendCandles]);
  const hasCoherentLiveChartQuote = useMemo(() => {
    if (!hasLiveChartQuote) {
      return false;
    }

    const latestBackendCandle = sanitizedBackendCandles[sanitizedBackendCandles.length - 1];
    if (!latestBackendCandle) {
      return true;
    }

    const quotePrices = [chartLiveQuote?.bid, chartLiveQuote?.ask].filter(
      (price): price is number => typeof price === 'number' && Number.isFinite(price) && price > 0,
    );

    if (quotePrices.length === 0) {
      return false;
    }

    return quotePrices.every((price) => isPriceCoherentWithCandle(latestBackendCandle, price));
  }, [chartLiveQuote?.ask, chartLiveQuote?.bid, hasLiveChartQuote, sanitizedBackendCandles]);
  const rawDisplayDecimals = useMemo(() => {
    return resolveChartDisplayDecimals({
      instrumentDigits: chartInstrumentMeta?.digits,
      instrumentPoint: chartInstrumentMeta?.point,
      instrumentTickSize: chartInstrumentMeta?.tickSize,
      liveQuoteDigits: chartLiveQuote?.digits,
      liveQuoteDigitsFromBackend: hasCoherentLiveChartQuote && chartLiveQuoteDigitsSource === 'backend',
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
    hasCoherentLiveChartQuote,
    latestChartPrecisionPrices,
  ]);
  // Stabilize price precision per symbol/timeframe. When the broker doesn't
  // expose stable instrument digits, resolveChartDisplayDecimals() infers them
  // from live tick prices, which jitter bar-to-bar (e.g. BTCUSD alternating
  // 2<->3 decimals as round ticks arrive). Because displayDecimals is part of
  // the chart re-init signature (currentSig), that jitter forced a full chart
  // rebuild — the "Loading chart data..." flash — several times a minute. Latch
  // the resolved value once real candles exist and hold it steady until the
  // symbol or timeframe changes, so transient per-tick precision can't churn
  // the rebuild signature.
  const displayDecimalsLatchRef = useRef<{ key: string; value: number; settled: boolean }>({
    key: '',
    value: rawDisplayDecimals,
    settled: false,
  });
  // Precision belongs to the authenticated broker/account as well as the
  // symbol. The same symbol can legitimately use different digits elsewhere.
  const displayDecimalsKey =
    `${chartMarketDataCacheNamespace}::${chartSymbol}::${chartTimeframe}`;
  if (
    displayDecimalsLatchRef.current.key !== displayDecimalsKey ||
    !displayDecimalsLatchRef.current.settled
  ) {
    displayDecimalsLatchRef.current = {
      key: displayDecimalsKey,
      value: rawDisplayDecimals,
      settled: sanitizedBackendCandles.length > 0,
    };
  }
  const displayDecimals = displayDecimalsLatchRef.current.value;
  const sanitizedCandles = useMemo(
    () => {
      if (sanitizedBackendCandles.length === 0) {
        return EMPTY_DISPLAY_CANDLES;
      }
      return sanitizedBackendCandles;
    },
    [sanitizedBackendCandles],
  );
  const { bid: chartBid, ask: chartAsk } = useMemo(
    () =>
      resolveChartTradeButtonQuote({
        liveBid: hasLiveChartQuote ? chartLiveQuote?.bid : undefined,
        liveAsk: hasLiveChartQuote ? chartLiveQuote?.ask : undefined,
      }),
    [chartLiveQuote?.ask, chartLiveQuote?.bid, hasLiveChartQuote],
  );
  const retainedChartTradeDisplayQuote =
    readExactChartQuoteForScope(
      chartTradeDisplayQuoteScopeKey,
      retainedChartTradeDisplayQuoteRef.current,
    );
  // Display-only fallback: the inactive footer keeps its last exact Bid/Ask
  // instead of painting "---". Order execution still uses the live quote and
  // freshness gate inside ChartTradeButtons, never these retained values.
  const chartTradeFooterFallbackBid = retainedChartTradeDisplayQuote?.bid ?? 0;
  const chartTradeFooterFallbackAsk = retainedChartTradeDisplayQuote?.ask ?? 0;
  // Trade P/L labels should follow the fresh quote feed even when candle
  // history is still catching up. Display precision stays guarded by
  // hasCoherentLiveChartQuote above so bad quote metadata cannot churn chart
  // rebuilds.
  const overlayLiveBid = useMemo(
    () => {
      const liveBid =
        hasLiveChartQuote &&
          typeof chartLiveQuote?.bid === 'number' &&
          Number.isFinite(chartLiveQuote.bid) &&
          chartLiveQuote.bid > 0
          ? chartLiveQuote.bid
          : null;
      if (liveBid !== null) {
        return liveBid;
      }

      return Number.isFinite(chartBid) && chartBid > 0 ? chartBid : null;
    },
    [chartBid, chartLiveQuote?.bid, hasLiveChartQuote],
  );
  const overlayLiveAsk = useMemo(
    () => {
      const liveAsk =
        hasLiveChartQuote &&
          typeof chartLiveQuote?.ask === 'number' &&
          Number.isFinite(chartLiveQuote.ask) &&
          chartLiveQuote.ask > 0
          ? chartLiveQuote.ask
          : null;
      if (liveAsk !== null) {
        return liveAsk;
      }

      return Number.isFinite(chartAsk) && chartAsk > 0 ? chartAsk : null;
    },
    [chartAsk, chartLiveQuote?.ask, hasLiveChartQuote],
  );
  const chartProtectionTickSize = useMemo(() => {
    // `normalizeInstrumentMetaPayload` currently falls back from tickSize to
    // point. The modify contract only authorizes an explicitly returned
    // tick_size, so prefer the retained raw wire field or an explicit quote
    // tick size and otherwise leave protection snapping unconstrained.
    const rawInstrumentTickSize = (
      chartInstrumentMeta as (Record<string, unknown> & { tick_size?: unknown }) | undefined
    )?.tick_size;
    const candidates = [rawInstrumentTickSize, chartLiveQuote?.tickSize];
    for (const candidate of candidates) {
      if (
        (typeof candidate === 'number' || typeof candidate === 'string') &&
        String(candidate).trim()
      ) {
        const value = Number(candidate);
        if (Number.isFinite(value) && value > 0) return value;
      }
    }
    return undefined;
  }, [chartInstrumentMeta, chartLiveQuote?.tickSize]);
  const chartPointSize = useMemo(() => {
    if (displayDecimals <= 0) return 1;
    return Math.pow(10, -displayDecimals);
  }, [displayDecimals]);
  const chartCrosshairPointSize = useMemo(() => {
    // The ruler counts broker points, which can differ from the trade tick size.
    const candidates = [
      chartInstrumentMeta?.point,
      hasCoherentLiveChartQuote ? chartLiveQuote?.point : undefined,
    ];
    for (const point of candidates) {
      if (typeof point === 'number' && Number.isFinite(point) && point > 0) {
        return point;
      }
    }
    // Clear the previous symbol's metadata on the retained chart surface.
    return null;
  }, [chartInstrumentMeta?.point, chartLiveQuote?.point, hasCoherentLiveChartQuote]);
  const chartPendingOffset = useMemo(() => {
    if (baseSymbol.includes('BTC')) return 250;
    if (baseSymbol.includes('XAU') || baseSymbol.includes('XAG')) return 1.5;
    return chartPointSize * 75;
  }, [baseSymbol, chartPointSize]);
  const chartStopOffset = useMemo(() => {
    if (baseSymbol.includes('BTC')) return 350;
    if (baseSymbol.includes('XAU') || baseSymbol.includes('XAG')) return 2;
    return chartPointSize * 90;
  }, [baseSymbol, chartPointSize]);
  const chartStopLimitOffset = useMemo(() => {
    if (baseSymbol.includes('BTC')) return 125;
    if (baseSymbol.includes('XAU') || baseSymbol.includes('XAG')) return 0.75;
    return Math.max(chartPointSize * 35, chartPendingOffset / 2);
  }, [baseSymbol, chartPendingOffset, chartPointSize]);
  const roundTradePrice = useCallback(
    (value: number) => {
      return roundOrderTicketPrice(
        value,
        chartProtectionTickSize,
        Math.max(displayDecimals, 0),
      );
    },
    [chartProtectionTickSize, displayDecimals],
  );
  const resolveChartVisibleStopPreviewPrice = useCallback((
    kind: 'sl' | 'tp',
    entryPrice: number,
    side: 'buy' | 'sell',
  ) => resolveVisibleTradeStopPreviewPrice(
    kind,
    entryPrice,
    side,
    chartStopOffset,
    chartPointSize,
    chartVisiblePriceRangeRef.current,
    roundTradePrice,
  ), [chartPointSize, chartStopOffset, roundTradePrice]);
  const chartMatchingPositionCandidates = useMemo(() => {
    const normalizedChartSymbol = normalizeChartOverlaySymbol(chartSymbol);
    const latestPositions = usePositionsState.getState().positions;
    const seenPositionIds = new Set<string>();
    return [...latestPositions, ...positions].filter((position) => {
      const positionId = String(position.id);
      if (seenPositionIds.has(positionId)) {
        return false;
      }
      seenPositionIds.add(positionId);
      return normalizeChartOverlaySymbol(position.symbol) === normalizedChartSymbol;
    });
  }, [chartSymbol, positions]);
  const [selectedChartPositionTicket, setSelectedChartPositionTicket] = useState<string | null>(null);
  const [invalidatedChartPositionSymbol, setInvalidatedChartPositionSymbol] = useState<string | null>(null);
  const [chartPositionStopDragPreviews, setChartPositionStopDragPreviews] = useState<
    Record<string, number>
  >({});
  const normalizedChartPositionSymbol = normalizeChartOverlaySymbol(chartSymbol);
  const existingPositionModifyBackendLocked = isExistingPositionModifyBackendLocked();
  useEffect(() => {
    const awaitingTicket = chartProtectionAwaitingTicketRef.current;
    const draftId = chartProtectionDraftIdRef.current;
    if (!awaitingTicket || !draftId) {
      return;
    }
    const terminalTicketObserved = closedPositions.some(
      (position) => String(position.ticket) === awaitingTicket,
    );
    const currentPosition = positions.find(
      (position) => String(position.id) === awaitingTicket,
    );
    const baselineSignature =
      chartProtectionBaselineSignaturesRef.current[awaitingTicket];
    if (hasChartProtectionDraftReconciled({
      baselineSignature,
      currentPosition,
      terminalTicketObserved,
    })) {
      clearChartDirectProtectionDraft(draftId);
    }
  }, [clearChartDirectProtectionDraft, closedPositions, positions]);
  const selectedChartPosition = selectedChartPositionTicket
    ? chartMatchingPositionCandidates.find(
      (position) => String(position.id) === selectedChartPositionTicket,
    ) ?? null
    : null;
  useEffect(() => {
    if (!selectedChartPositionTicket) return;
    if (selectedChartPosition) return;
    // Never let a closed/SL-hit/TP-hit ticket fall back to generic preview
    // lines or silently retarget another same-symbol position. If no
    // same-symbol position remains, release the invalidation so the next
    // toolbar tap can start a fresh Market Execution draft.
    setInvalidatedChartPositionSymbol(
      chartMatchingPositionCandidates.length > 0
        ? normalizedChartPositionSymbol
        : null,
    );
    setSelectedChartPositionTicket(null);
    setChartTradeSlEnabled(false);
    setChartTradeSlPrice(0);
    setChartTradeTpEnabled(false);
    setChartTradeTpPrice(0);
    setChartStepperEditor(null);
    setChartTradeSlLocked(false);
    setChartTradeTpLocked(false);
  }, [
    chartMatchingPositionCandidates.length,
    normalizedChartPositionSymbol,
    selectedChartPosition,
    selectedChartPositionTicket,
  ]);
  useEffect(() => {
    setSelectedChartPositionTicket(null);
    setInvalidatedChartPositionSymbol(null);
    setChartTradeSlEnabled(false);
    setChartTradeSlPrice(0);
    setChartTradeTpEnabled(false);
    setChartTradeTpPrice(0);
    setChartStepperEditor(null);
    setChartTradeSlLocked(false);
    setChartTradeTpLocked(false);
    setChartDirectProtectionActive(false);
    if (chartProtectionDraftIdRef.current) {
      releaseChartProtectionDraftSubmission(chartProtectionDraftIdRef.current);
    }
    chartProtectionDraftIdRef.current = null;
    chartProtectionAwaitingTicketRef.current = null;
    chartProtectionBaselineSignaturesRef.current = {};
    chartDirectProtectionOwnerPaneIdRef.current = null;
    setChartPositionStopDragPreviews({});
  }, [activeChartSessionCacheNamespace, normalizedChartPositionSymbol]);
  useEffect(() => {
    setChartPositionStopDragPreviews((current) => {
      const keys = Object.keys(current);
      if (keys.length === 0) {
        return current;
      }
      const activePositionIds = new Set(
        positions.map((position) => String(position.id)),
      );
      const next = Object.fromEntries(
        Object.entries(current).filter(([dragKey]) => {
          const target = parseChartPositionStopDragKey(dragKey);
          return !!target && activePositionIds.has(target.positionId);
        }),
      );
      return Object.keys(next).length === keys.length ? current : next;
    });
  }, [positions]);
  useEffect(() => {
    if (
      chartDirectProtectionActive ||
      selectedChartPositionTicket ||
      invalidatedChartPositionSymbol === normalizedChartPositionSymbol ||
      chartMatchingPositionCandidates.length !== 1
    ) {
      return;
    }
    // Materialize the sole candidate as an exact ticket selection. If that
    // ticket later disappears, a same-symbol replacement cannot silently take
    // over merely because the candidate count stayed at one.
    setSelectedChartPositionTicket(String(chartMatchingPositionCandidates[0].id));
  }, [
    chartMatchingPositionCandidates,
    chartDirectProtectionActive,
    invalidatedChartPositionSymbol,
    normalizedChartPositionSymbol,
    selectedChartPositionTicket,
  ]);

  const resolveSingleChartPositionStopTarget = useCallback(() => {
    if (selectedChartPosition) {
      return selectedChartPosition;
    }
    return null;
  }, [selectedChartPosition]);
  const chartTradePositionStopTarget = useMemo(
    () => resolveSingleChartPositionStopTarget(),
    [resolveSingleChartPositionStopTarget],
  );
  const chartModifyTicketState = useModifyPositionTicketState(
    selectedChartPositionTicket,
  );
  const [chartModifyRateLimitClock, setChartModifyRateLimitClock] = useState(() => Date.now());
  useEffect(() => {
    const retryAfterUntil = chartModifyTicketState.retryAfterUntil ?? 0;
    const remainingMs = retryAfterUntil - Date.now();
    if (remainingMs <= 0) return undefined;
    const timer = setTimeout(
      () => setChartModifyRateLimitClock(Date.now()),
      remainingMs + 25,
    );
    return () => clearTimeout(timer);
  }, [chartModifyTicketState.retryAfterUntil]);
  const chartModifyRateLimited =
    (chartModifyTicketState.retryAfterUntil ?? 0) > chartModifyRateLimitClock;
  const chartModifyTicketStateRef = useRef(chartModifyTicketState);
  const lastModifyChartRepaintTelemetryRef = useRef('');
  useLayoutEffect(() => {
    chartModifyTicketStateRef.current = chartModifyTicketState;
  }, [chartModifyTicketState]);
  const handleSelectChartPositionTicket = useCallback((ticket: string | number) => {
    const normalizedTicket = String(ticket);
    const target = chartMatchingPositionCandidates.find(
      (position) => String(position.id) === normalizedTicket,
    );
    if (!target) {
      setInvalidatedChartPositionSymbol(normalizedChartPositionSymbol);
      return;
    }
    setSelectedChartPositionTicket(normalizedTicket);
    setInvalidatedChartPositionSymbol(null);
    const currentSl = Number(target.sl);
    const currentTp = Number(target.tp);
    const nextSl = currentSl > 0
      ? (chartProtectionTickSize ? roundTradePrice(currentSl) : currentSl)
      : 0;
    const nextTp = currentTp > 0
      ? (chartProtectionTickSize ? roundTradePrice(currentTp) : currentTp)
      : 0;
    setChartTradeSlEnabled(nextSl > 0);
    setChartTradeSlPrice(nextSl);
    setChartTradeTpEnabled(nextTp > 0);
    setChartTradeTpPrice(nextTp);
  }, [
    chartMatchingPositionCandidates,
    chartProtectionTickSize,
    normalizedChartPositionSymbol,
    roundTradePrice,
  ]);
  const hasChartExistingPositionProtectionContext =
    chartMatchingPositionCandidates.length > 0 ||
    !!selectedChartPositionTicket ||
    invalidatedChartPositionSymbol === normalizedChartPositionSymbol;
  const chartStopsTargetExistingPosition =
    !chartDirectProtectionActive &&
    !isPendingChartOrderType(chartTradeOrderType) &&
    hasChartExistingPositionProtectionContext;
  const isChartTradeProtectionBackendLocked = useCallback(
    (orderType: ChartOrderType = chartTradeOrderType) => {
      if (isPendingChartOrderType(orderType)) {
        return isPendingOrderProtectionBackendLocked();
      }
      return hasChartExistingPositionProtectionContext
        ? existingPositionModifyBackendLocked
        : isNewMarketOrderProtectionBackendLocked();
    },
    [
      chartTradeOrderType,
      existingPositionModifyBackendLocked,
      hasChartExistingPositionProtectionContext,
    ],
  );
  const showChartProtectionCapabilityFeedback = useCallback(() => {
    setTradeFeedback({
      visible: true,
      type: 'error',
      title: SLTP_COMING_SOON_TITLE,
      message: getActiveSltpUnavailableMessage(),
    });
  }, []);
  const resolveDefaultPendingPrice = useCallback(
    (orderType: ChartOrderType) => {
      const currentQuoteAvailability = resolveSessionQuoteActionAvailability(chartLiveQuote, Date.now());
      if (!currentQuoteAvailability.allowed) {
        return 0;
      }

      const { bid, ask } = currentQuoteAvailability;
      switch (orderType) {
        case 'Buy Limit':
          return roundTradePrice(ask - chartPendingOffset);
        case 'Sell Limit':
          return roundTradePrice(bid + chartPendingOffset);
        case 'Buy Stop':
        case 'Buy Stop Limit':
          return roundTradePrice(ask + chartPendingOffset);
        case 'Sell Stop':
        case 'Sell Stop Limit':
          return roundTradePrice(bid - chartPendingOffset);
        default:
          return roundTradePrice(ask);
      }
    },
    [chartLiveQuote, chartPendingOffset, roundTradePrice],
  );

  const injectChartScript = useCallback((script: string) => {
    webViewRef.current?.injectJavaScript(`${script} true;`);
  }, []);

  const handleCommitTextLevelEdit = useCallback((recordId: string, text: string) => {
    setTextLevelEditRequest(null);
    injectChartScript(
      `if (typeof applyDrawingTextEdit === 'function') { applyDrawingTextEdit(${JSON.stringify(recordId)}, ${JSON.stringify(text)}); }`,
    );
  }, []);

  const handleCancelTextLevelEdit = useCallback((recordId: string) => {
    setTextLevelEditRequest(null);
    injectChartScript(
      `if (typeof cancelDrawingTextEdit === 'function') { cancelDrawingTextEdit(${JSON.stringify(recordId)}); }`,
    );
  }, []);

  const closeChartTapMenu = useCallback(() => {
    setChartTapMenuAnchor(null);
  }, []);

  useEffect(() => {
    if (activeTool !== CHART_NO_DRAWING_TOOL) {
      closeChartTapMenu();
    }
  }, [activeTool, closeChartTapMenu]);

  useEffect(() => {
    closeChartTapMenu();
  }, [chartSymbol, chartTimeframe, chartVisualType, isChartExpanded, closeChartTapMenu]);

  const handleSetTool = useCallback((
    tool: string,
    options?: Readonly<{ areaAutoInspector?: boolean }>,
  ) => {
    closeChartTapMenu();
    const nextDrawingInputActive = !chartLockAll && isChartDrawingInputTool(tool);
    const areaAutoInspector = options?.areaAutoInspector === true && tool === CHART_CROSSHAIR_TOOL;
    areaAutoInspectorOwnerPaneIdRef.current = areaAutoInspector
      ? chartWindows.activePane.id
      : null;
    chartDrawingToolOwnerPaneIdRef.current = tool === CHART_NO_DRAWING_TOOL
      ? null
      : areaAutoInspector
        ? chartWindows.activePane.id
        : chartWindowToolbarTargetPaneIdRef.current;
    setActiveTool(tool);
    setChartDrawingInputActive(nextDrawingInputActive);
    injectChartScript(`setDrawingTool(${JSON.stringify(tool)}, { startDrawing: ${nextDrawingInputActive} });`);
  }, [chartLockAll, chartWindows.activePane.id, closeChartTapMenu, injectChartScript, setChartDrawingInputActive]);

  const areaInspectorLifecycleRef = useRef({
    hydrated: preferencesHydrated,
    paneId: chartWindows.activePane.id,
    visualType: chartVisualType,
  });
  const pendingAreaAutoInspectorPaneIdRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    const previous = areaInspectorLifecycleRef.current;
    const activePaneId = chartWindows.activePane.id;
    const paneChanged = previous.paneId !== activePaneId;
    const hydrationCompleted = !previous.hydrated && preferencesHydrated;
    const pendingForActivePane = pendingAreaAutoInspectorPaneIdRef.current === activePaneId;
    if (
      pendingAreaAutoInspectorPaneIdRef.current !== null
      && !pendingForActivePane
    ) {
      pendingAreaAutoInspectorPaneIdRef.current = null;
    }

    // During pane promotion, the pane-local snapshot is authoritative for the
    // render in which useChartWindowVisualPreferences is still committing it
    // back to the persisted global store.
    const activePaneVisualType = paneChanged
      ? chartWindowVisualPreferences[activePaneId]?.chartVisualType ?? chartVisualType
      : chartVisualType;
    const visualTypeChanged = previous.visualType !== activePaneVisualType;
    areaInspectorLifecycleRef.current = {
      hydrated: preferencesHydrated,
      paneId: activePaneId,
      visualType: activePaneVisualType,
    };

    if (
      !preferencesHydrated
      || (!paneChanged && !hydrationCompleted && !visualTypeChanged && !pendingForActivePane)
    ) {
      return;
    }

    if (activePaneVisualType === 'area') {
      const manualCrosshairAlreadyActive =
        activeTool === CHART_CROSSHAIR_TOOL
        && areaAutoInspectorOwnerPaneIdRef.current === null;
      if (manualCrosshairAlreadyActive) {
        if (
          paneChanged
          && shouldReleaseChartWindowOwnedAction(
            chartDrawingToolOwnerPaneIdRef.current,
            activePaneId,
          )
        ) {
          // The later pane-ownership layout effect releases this old pane's
          // manual tool. Re-arm Area only after that release has committed.
          pendingAreaAutoInspectorPaneIdRef.current = activePaneId;
        } else {
          pendingAreaAutoInspectorPaneIdRef.current = null;
        }
        return;
      }
      if (
        activeTool === CHART_CROSSHAIR_TOOL
        && areaAutoInspectorOwnerPaneIdRef.current === activePaneId
      ) {
        pendingAreaAutoInspectorPaneIdRef.current = null;
        return;
      }
      pendingAreaAutoInspectorPaneIdRef.current = null;
      handleSetTool(CHART_CROSSHAIR_TOOL, { areaAutoInspector: true });
      return;
    }

    pendingAreaAutoInspectorPaneIdRef.current = null;
    const autoInspectorOwnerPaneId = areaAutoInspectorOwnerPaneIdRef.current;
    const autoInspectorOwnerIsAffected =
      autoInspectorOwnerPaneId === activePaneId
      || (paneChanged && autoInspectorOwnerPaneId === previous.paneId);
    if (!autoInspectorOwnerIsAffected) {
      return;
    }
    if (activeTool === CHART_CROSSHAIR_TOOL) {
      handleSetTool(CHART_NO_DRAWING_TOOL);
    } else {
      areaAutoInspectorOwnerPaneIdRef.current = null;
    }
  }, [
    activeTool,
    chartVisualType,
    chartWindowVisualPreferences,
    chartWindows.activePane.id,
    handleSetTool,
    preferencesHydrated,
  ]);

  const handleClearDrawings = useCallback(() => {
    closeChartTapMenu();
    areaAutoInspectorOwnerPaneIdRef.current = null;
    pendingAreaAutoInspectorPaneIdRef.current = null;
    chartDrawingToolOwnerPaneIdRef.current = null;
    setActiveTool(CHART_NO_DRAWING_TOOL);
    setChartDrawingInputActive(false);
    allowNextEmptyDrawingSyncRef.current = true;
    hasAcceptedNonEmptyWebViewDrawingsRef.current = false;
    lastWebViewDrawingSignatureRef.current = '';
    lastInjectedDrawingSyncRef.current = { signature: '', epoch: -1 };
    if (applyChartWindowDrawingHistoryAction('clear')) {
      return;
    }
    setChartDrawingRecordsForSymbol(chartSymbol, []);
    injectChartScript('clearDrawings();');
  }, [
    applyChartWindowDrawingHistoryAction,
    chartSymbol,
    closeChartTapMenu,
    injectChartScript,
    setChartDrawingInputActive,
    setChartDrawingRecordsForSymbol,
  ]);

  const handleUndoDrawing = useCallback(() => {
    closeChartTapMenu();
    allowNextEmptyDrawingSyncRef.current = true;
    if (applyChartWindowDrawingHistoryAction('undo')) {
      lastWebViewDrawingSignatureRef.current = '';
      lastInjectedDrawingSyncRef.current = { signature: '', epoch: -1 };
      return;
    }
    injectChartScript('undoDrawingAction();');
  }, [applyChartWindowDrawingHistoryAction, closeChartTapMenu, injectChartScript]);

  const handleRedoDrawing = useCallback(() => {
    closeChartTapMenu();
    allowNextEmptyDrawingSyncRef.current = true;
    if (applyChartWindowDrawingHistoryAction('redo')) {
      lastWebViewDrawingSignatureRef.current = '';
      lastInjectedDrawingSyncRef.current = { signature: '', epoch: -1 };
      return;
    }
    injectChartScript('redoDrawingAction();');
  }, [applyChartWindowDrawingHistoryAction, closeChartTapMenu, injectChartScript]);

  const handleToggleStickyMode = useCallback(() => {
    closeChartTapMenu();
    const next = !stickyDrawingMode;
    updateChartWindowDrawingControls({ sticky: next });
    setStickyDrawingMode(next);
    injectChartScript(`setStayInDrawingMode(${next});`);
  }, [
    closeChartTapMenu,
    injectChartScript,
    stickyDrawingMode,
    updateChartWindowDrawingControls,
  ]);

  const handleToggleMagnetMode = useCallback(() => {
    closeChartTapMenu();
    const next = !drawingMagnetMode;
    updateChartWindowDrawingControls({ magnet: next });
    setDrawingMagnetMode(next);
    injectChartScript(`setDrawingMagnetMode(${next});`);
  }, [
    closeChartTapMenu,
    drawingMagnetMode,
    injectChartScript,
    updateChartWindowDrawingControls,
  ]);

  const handleToggleLock = useCallback(() => {
    closeChartTapMenu();
    const next = !chartLockAll;
    setChartLockAll(next);
    if (next) {
      areaAutoInspectorOwnerPaneIdRef.current = null;
      pendingAreaAutoInspectorPaneIdRef.current = null;
      chartDrawingToolOwnerPaneIdRef.current = null;
      setActiveTool(CHART_NO_DRAWING_TOOL);
      setChartDrawingInputActive(false);
      injectChartScript('setDrawingsLocked(true);');
      return;
    }
    // Unlock All also releases individually locked drawings.
    injectChartScript('unlockAllDrawings();');
  }, [chartLockAll, closeChartTapMenu, injectChartScript, setChartDrawingInputActive]);

  const handleToggleHide = useCallback(() => {
    closeChartTapMenu();
    const next = !chartHideAll;
    setChartHideAll(next);
    injectChartScript(`setDrawingsHidden(${next});`);
  }, [chartHideAll, closeChartTapMenu, injectChartScript]);

  const handleZoomTool = useCallback(() => {
    closeChartTapMenu();
    if (routeChartWindowViewportCommand('resetViewport')) {
      injectChartScript('zoomChart();');
    }
  }, [closeChartTapMenu, injectChartScript, routeChartWindowViewportCommand]);

  const handleRequestDeleteAllDrawings = useCallback(() => {
    closeChartTapMenu();
    Alert.alert(
      t('Delete All Drawings'),
      t('This will permanently remove every drawing from the chart.'),
      [
        { style: 'cancel', text: t('Cancel') },
        { onPress: handleClearDrawings, style: 'destructive', text: t('Delete All') },
      ],
    );
  }, [closeChartTapMenu, handleClearDrawings, t]);

  const handleSelectDrawingMode = useCallback(() => {
    // Crosshair mode is the chart's selection/edit mode: tapping a drawing
    // selects it, dragging edits it, empty taps deselect.
    handleSetTool('crosshair');
  }, [handleSetTool]);

  const handleDeleteSelectedDrawing = useCallback(() => {
    closeChartTapMenu();
    allowNextEmptyDrawingSyncRef.current = true;
    injectChartScript('removeSelectedDrawing();');
  }, [closeChartTapMenu, injectChartScript]);

  const handleToggleSelectedDrawingLock = useCallback(() => {
    closeChartTapMenu();
    const next = !(selectedDrawingRecord?.locked === true);
    injectChartScript(`setSelectedDrawingLocked(${next});`);
  }, [closeChartTapMenu, injectChartScript, selectedDrawingRecord]);

  const handleHideSelectedDrawing = useCallback(() => {
    closeChartTapMenu();
    injectChartScript('setSelectedDrawingHidden(true);');
  }, [closeChartTapMenu, injectChartScript]);

  const handleShowAllDrawings = useCallback(() => {
    closeChartTapMenu();
    setChartHideAll(false);
    injectChartScript('setDrawingsHidden(false);');
  }, [closeChartTapMenu, injectChartScript]);

  const handleUnlockAllDrawings = useCallback(() => {
    closeChartTapMenu();
    setChartLockAll(false);
    injectChartScript('unlockAllDrawings();');
  }, [closeChartTapMenu, injectChartScript]);

  const handleDeselectDrawing = useCallback(() => {
    closeChartTapMenu();
    injectChartScript('clearDrawingSelection();');
  }, [closeChartTapMenu, injectChartScript]);

  // Compact per-drawing menu the engine requests when the user double-taps a
  // drawing on the chart. Dismissing it keeps the drawing unchanged.
  const openSelectedDrawingActionSheet = useCallback(
    (request: { label: string; locked: boolean }) => {
      const actions = dismissBeforeDrawingToolsSelection(
        createSelectedDrawingActionSheetActions({
          dangerIconColor: T.trading.sell.primary,
          iconColor: TEXT_MUTED,
          locked: request.locked,
          onDelete: handleDeleteSelectedDrawing,
          onDeselect: handleDeselectDrawing,
          onHide: handleHideSelectedDrawing,
          onToggleLock: () => {
            closeChartTapMenu();
            injectChartScript(`setSelectedDrawingLocked(${!request.locked});`);
          },
        }),
        hideChartActionSheet,
      );
      showChartActionSheet({
        actions,
        compactText: true,
        presentation: 'mt5Plain',
        showActionIcons: true,
        title: request.label,
      });
    },
    [
      TEXT_MUTED,
      T.trading.sell.primary,
      closeChartTapMenu,
      handleDeleteSelectedDrawing,
      handleDeselectDrawing,
      handleHideSelectedDrawing,
      hideChartActionSheet,
      injectChartScript,
      showChartActionSheet,
    ],
  );

  // Shortcut sheet the engine requests when the user double-taps empty chart
  // space while drawings exist: just the drawing-management commands, with the
  // same handlers and conditional state as the full Drawing Tools sheet.
  const openDrawingQuickActionsSheet = useCallback(() => {
    if (!hasChartDrawings) {
      return;
    }
    const actions = dismissBeforeDrawingToolsSelection(
      createDrawingQuickActionsSheetActions({
        canRedoDrawing: drawingHistoryState.canRedo,
        canUndoDrawing: drawingHistoryState.canUndo,
        chartHideAll,
        chartLockAll,
        dangerIconColor: T.trading.sell.primary,
        drawingMagnetMode,
        hasDrawings: hasChartDrawings,
        hasHiddenDrawings: hasHiddenChartDrawings,
        hasLockedDrawings: hasLockedChartDrawings,
        hasSelectedDrawing: selectedDrawingId !== null,
        iconColor: TEXT_MUTED,
        onClearDrawings: handleRequestDeleteAllDrawings,
        onDeleteSelectedDrawing: handleDeleteSelectedDrawing,
        onHideSelectedDrawing: handleHideSelectedDrawing,
        onRedoDrawing: handleRedoDrawing,
        onSelectDrawingMode: handleSelectDrawingMode,
        onSelectTool: handleSetTool,
        onShowAllDrawings: handleShowAllDrawings,
        onToggleHide: handleToggleHide,
        onToggleLock: handleToggleLock,
        onToggleMagnetMode: handleToggleMagnetMode,
        onToggleSelectedDrawingLock: handleToggleSelectedDrawingLock,
        onToggleStickyMode: handleToggleStickyMode,
        onUndoDrawing: handleUndoDrawing,
        onUnlockAllDrawings: handleUnlockAllDrawings,
        onZoomTool: handleZoomTool,
        selectedDrawingLocked: selectedDrawingRecord?.locked === true,
        stickyDrawingMode,
      }),
      hideChartActionSheet,
    );
    showChartActionSheet({
      actions,
      compactText: true,
      presentation: 'mt5Plain',
      showActionIcons: true,
      title: t('Drawing Tools'),
    });
  }, [
    TEXT_MUTED,
    T.trading.sell.primary,
    chartHideAll,
    chartLockAll,
    drawingHistoryState,
    drawingMagnetMode,
    handleDeleteSelectedDrawing,
    handleHideSelectedDrawing,
    handleRedoDrawing,
    handleRequestDeleteAllDrawings,
    handleSelectDrawingMode,
    handleSetTool,
    handleShowAllDrawings,
    handleToggleHide,
    handleToggleLock,
    handleToggleMagnetMode,
    handleToggleSelectedDrawingLock,
    handleToggleStickyMode,
    handleUndoDrawing,
    handleUnlockAllDrawings,
    handleZoomTool,
    hasChartDrawings,
    hasHiddenChartDrawings,
    hasLockedChartDrawings,
    hideChartActionSheet,
    selectedDrawingId,
    selectedDrawingRecord,
    showChartActionSheet,
    stickyDrawingMode,
    t,
  ]);

  // The radial opens on the FIRST tap of a chart double-tap, and its backdrop
  // then swallows the second tap before the WebView can see it. A dismissal
  // that arrives right after opening therefore IS the double-tap — surface the
  // drawing quick-actions shortcut just like the engine's own path does.
  const handleChartTapMenuDismiss = useCallback(() => {
    const openedAt = chartTapMenuOpenedAtRef.current;
    closeChartTapMenu();
    if (
      !chartWindowSplitModeRef.current
      && hasChartDrawings
      && openedAt !== null
      && Date.now() - openedAt <= 450
    ) {
      openDrawingQuickActionsSheet();
    }
  }, [closeChartTapMenu, hasChartDrawings, openDrawingQuickActionsSheet]);

  const handleToggleVerticalScrollingLock = () => {
    closeChartTapMenu();
    const next = !isVerticalScrollingLocked;
    setChartVerticalScrollingLocked(next);
    injectChartScript(`setVerticalScrollingLocked(${next});`);
  };

  const executeScrollToLastBar = useCallback(() => {
    injectChartScript(`
      try {
        if (typeof window.__rtx5ScrollToLastBar === 'function') {
          window.__rtx5ScrollToLastBar();
        } else if (chart && chart.timeScale && typeof chart.timeScale().scrollToRealTime === 'function') {
          chart.timeScale().scrollToRealTime();
        }
      } catch (_) {}
    `);
  }, [injectChartScript]);

  const handleScrollToLastBar = () => {
    runImmediateAction('chart.radial.scrollToLastBar', () => {
      hideActionSheet();
      closeChartTapMenu();
      if (routeChartWindowViewportCommand('scrollToLastBar')) {
        executeScrollToLastBar();
      }
    });
  };

  const executeResetVerticalScale = useCallback(() => {
    chartManualPriceScaleRef.current = null;
    injectChartScript(`
      try {
        if (typeof window.__rtx5ResetPriceScale === 'function') {
          window.__rtx5ResetPriceScale();
        }
      } catch (_) {}
    `);
  }, [injectChartScript]);

  const handleResetVerticalScale = () => {
    runImmediateAction('chart.radial.resetVerticalScale', () => {
      hideActionSheet();
      closeChartTapMenu();
      if (routeChartWindowViewportCommand('resetVerticalScale')) {
        executeResetVerticalScale();
      }
    });
  };

  const handleToggleChartAutoScale = () => {
    runImmediateAction('chart.radial.toggleAutoScale', () => {
      hideActionSheet();
      closeChartTapMenu();
      const next = !isChartAutoScaleEnabled;
      if (next) {
        chartManualPriceScaleRef.current = null;
      }
      setChartAutoScaleEnabled(next);
      injectChartScript(`setChartAutoScaleEnabled(${next});`);
    });
  };

  const handleToggleOneClickPanelAtBottom = () => {
    runImmediateAction('chart.radial.toggleOneClickPanelAtBottom', () => {
      hideActionSheet();
      closeChartTapMenu();
      setChartOneClickPanelAtBottom(!chartOneClickPanelAtBottom);
    });
  };

  const getChartDisplayActionEnabled = useCallback(
    (key: keyof ChartDisplaySettings) => {
      const linkedShowOnChartKey = CHART_DISPLAY_TO_SHOW_ON_CHART_KEY[key];
      if (linkedShowOnChartKey) {
        return chartShowOnChart[linkedShowOnChartKey];
      }
      return Boolean(chartDisplay[key]);
    },
    [chartDisplay, chartShowOnChart],
  );

  const handleToggleChartDisplayAction = useCallback(
    (key: keyof ChartDisplaySettings) => {
      runImmediateAction(`chart.radial.toggleDisplay.${key}`, () => {
        hideActionSheet();
        closeChartTapMenu();
        const next = !getChartDisplayActionEnabled(key);
        setChartDisplaySetting(key, next);
        const linkedShowOnChartKey = CHART_DISPLAY_TO_SHOW_ON_CHART_KEY[key];
        if (linkedShowOnChartKey) {
          setChartShowOnChartItem(linkedShowOnChartKey, next);
        }
      });
    },
    [
      closeChartTapMenu,
      getChartDisplayActionEnabled,
      hideActionSheet,
      setChartDisplaySetting,
      setChartShowOnChartItem,
    ],
  );

  // ── Movable symbol/OHLC header (3-dot menu opt-in) ──────────────────
  // Trade markers near the top of the chart can sit under the symbol
  // dropdown + OHLC readout. With the option enabled, holding the header
  // for a moment arms a drag so the trader can park it anywhere inside
  // the chart viewport. A plain tap still opens the symbol picker.
  const isSymbolHeaderMovable = chartDisplay.movableSymbolHeader === true;
  const [chartSymbolHeaderOffset, setChartSymbolHeaderOffset] = useState({ x: 0, y: 0 });
  const [isChartSymbolHeaderDragArmed, setIsChartSymbolHeaderDragArmed] = useState(false);
  const chartSymbolHeaderOffsetRef = useRef({ x: 0, y: 0 });
  const chartSymbolHeaderDragArmedRef = useRef(false);
  const chartSymbolHeaderDragOriginRef = useRef({ x: 0, y: 0 });
  const chartSymbolHeaderHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chartSymbolHeaderSizeRef = useRef({ width: 0, height: 0 });
  const chartSymbolHeaderTapSuppressUntilRef = useRef(0);
  const CHART_SYMBOL_HEADER_HOLD_MS = 550;
  const CHART_SYMBOL_HEADER_BASE_LEFT = 8;
  const CHART_SYMBOL_HEADER_BASE_TOP = 16;

  const clearChartSymbolHeaderHoldTimer = useCallback(() => {
    if (chartSymbolHeaderHoldTimerRef.current !== null) {
      clearTimeout(chartSymbolHeaderHoldTimerRef.current);
      chartSymbolHeaderHoldTimerRef.current = null;
    }
  }, []);

  const disarmChartSymbolHeaderDrag = useCallback(() => {
    clearChartSymbolHeaderHoldTimer();
    if (chartSymbolHeaderDragArmedRef.current) {
      // Swallow the tap that ends a hold/drag so it cannot open the picker.
      chartSymbolHeaderTapSuppressUntilRef.current = Date.now() + 400;
    }
    chartSymbolHeaderDragArmedRef.current = false;
    setIsChartSymbolHeaderDragArmed(false);
  }, [clearChartSymbolHeaderHoldTimer]);

  const applyChartSymbolHeaderOffset = useCallback((nextX: number, nextY: number) => {
    const bounds = chartTapMenuBoundsRef.current;
    const size = chartSymbolHeaderSizeRef.current;
    let x = nextX;
    let y = nextY;
    if (bounds.width > 0 && size.width > 0) {
      const minX = -CHART_SYMBOL_HEADER_BASE_LEFT;
      const maxX = Math.max(minX, bounds.width - size.width - CHART_SYMBOL_HEADER_BASE_LEFT);
      x = Math.min(maxX, Math.max(minX, x));
    }
    if (bounds.height > 0 && size.height > 0) {
      const minY = -CHART_SYMBOL_HEADER_BASE_TOP;
      const maxY = Math.max(minY, bounds.height - size.height - CHART_SYMBOL_HEADER_BASE_TOP);
      y = Math.min(maxY, Math.max(minY, y));
    }
    chartSymbolHeaderOffsetRef.current = { x, y };
    setChartSymbolHeaderOffset((current) => (
      current.x === x && current.y === y ? current : { x, y }
    ));
  }, []);

  const armChartSymbolHeaderDrag = useCallback(() => {
    chartSymbolHeaderHoldTimerRef.current = null;
    chartSymbolHeaderDragArmedRef.current = true;
    // Purely visual arm cue (scale + dim) — the chart screen has a
    // no-device-vibration contract.
    setIsChartSymbolHeaderDragArmed(true);
  }, []);

  useEffect(() => {
    if (!isSymbolHeaderMovable) {
      // Disabling the option parks the header back at its default corner.
      disarmChartSymbolHeaderDrag();
      chartSymbolHeaderOffsetRef.current = { x: 0, y: 0 };
      setChartSymbolHeaderOffset({ x: 0, y: 0 });
    }
  }, [disarmChartSymbolHeaderDrag, isSymbolHeaderMovable]);

  const chartSymbolHeaderPanHandlers = useMemo(() => {
    if (!isSymbolHeaderMovable) {
      return {};
    }
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => {
        // Start (or restart) the hold countdown for this touch without
        // claiming it — a quick tap must keep opening the symbol picker.
        clearChartSymbolHeaderHoldTimer();
        chartSymbolHeaderHoldTimerRef.current = setTimeout(armChartSymbolHeaderDrag, CHART_SYMBOL_HEADER_HOLD_MS);
        return false;
      },
      onMoveShouldSetPanResponder: () => chartSymbolHeaderDragArmedRef.current,
      onMoveShouldSetPanResponderCapture: (_event, gestureState) => {
        if (chartSymbolHeaderDragArmedRef.current) {
          return true;
        }
        if (Math.abs(gestureState.dx) + Math.abs(gestureState.dy) > 12) {
          // Finger slid before the hold completed — normal press semantics.
          clearChartSymbolHeaderHoldTimer();
        }
        return false;
      },
      onPanResponderGrant: () => {
        chartSymbolHeaderDragOriginRef.current = chartSymbolHeaderOffsetRef.current;
      },
      onPanResponderMove: (_event, gestureState) => {
        applyChartSymbolHeaderOffset(
          chartSymbolHeaderDragOriginRef.current.x + gestureState.dx,
          chartSymbolHeaderDragOriginRef.current.y + gestureState.dy,
        );
      },
      onPanResponderRelease: (_event, gestureState) => {
        applyChartSymbolHeaderOffset(
          chartSymbolHeaderDragOriginRef.current.x + gestureState.dx,
          chartSymbolHeaderDragOriginRef.current.y + gestureState.dy,
        );
        disarmChartSymbolHeaderDrag();
      },
      onPanResponderTerminate: () => {
        disarmChartSymbolHeaderDrag();
      },
      onPanResponderTerminationRequest: () => false,
    }).panHandlers;
  }, [
    applyChartSymbolHeaderOffset,
    armChartSymbolHeaderDrag,
    clearChartSymbolHeaderHoldTimer,
    disarmChartSymbolHeaderDrag,
    isSymbolHeaderMovable,
  ]);

  const handleChartSymbolHeaderPressOut = useCallback(() => {
    // The inner Pressable owns the touch until a drag steals it; its
    // press-out is the reliable "finger lifted before arming" signal.
    if (!chartSymbolHeaderDragArmedRef.current) {
      clearChartSymbolHeaderHoldTimer();
    } else {
      disarmChartSymbolHeaderDrag();
    }
  }, [clearChartSymbolHeaderHoldTimer, disarmChartSymbolHeaderDrag]);

  const resolveChartTradeSheetTranslateY = useCallback(
    (mode: 'hidden' | 'collapsed' | 'expanded') => {
      if (mode === 'expanded') {
        return chartTradeSheetExpandedTranslateY;
      }
      if (mode === 'collapsed') {
        return chartTradeSheetCollapsedTranslateY;
      }
      return chartTradeSheetHiddenTranslateY;
    },
    [
      chartTradeSheetCollapsedTranslateY,
      chartTradeSheetExpandedTranslateY,
      chartTradeSheetHiddenTranslateY,
    ],
  );

  const finalizeChartTradeSheetHide = useCallback(() => {
    chartTradeSheetLastVisibleOffsetRef.current = chartTradeSheetCollapsedTranslateY;
    chartTradeSheetDragStartY.value = chartTradeSheetCollapsedTranslateY;
    chartTradeSheetTranslateY.value = chartTradeSheetHiddenTranslateY;
    setChartTradeSheetMode('hidden');
    setShowChartTradeSheet(false);
  }, [
    chartTradeSheetCollapsedTranslateY,
    chartTradeSheetCollapsedTranslateY,
    chartTradeSheetDragStartY,
    chartTradeSheetHiddenTranslateY,
    chartTradeSheetLastVisibleOffsetRef,
    chartTradeSheetTranslateY,
  ]);

  const commitChartTradeSheetOffset = useCallback((offset: number) => {
    chartTradeSheetLastVisibleOffsetRef.current = offset;
    setChartTradeSheetMode(offset >= chartTradeSheetCollapsedTranslateY - 12 ? 'collapsed' : 'expanded');
  }, [chartTradeSheetCollapsedTranslateY]);

  const snapTradeSheet = useCallback((mode: 'hidden' | 'collapsed' | 'expanded') => {
    const target = resolveChartTradeSheetTranslateY(mode);
    chartTradeSheetDragStartY.value = target;

    if (mode === 'hidden') {
      if (!showChartTradeSheet) {
        finalizeChartTradeSheetHide();
        return;
      }

      chartTradeSheetTranslateY.value = withTiming(target, { duration: 180 }, (finished) => {
        if (finished) {
          runOnJS(finalizeChartTradeSheetHide)();
        }
      });
      return;
    }

    // Sheet is pre-mounted while Chart is focused — opening only flips
    // visibility + spring. Avoid an extra rAF so SL/TP lands in the press turn.
    if (!showChartTradeSheet) {
      chartTradeSheetTranslateY.value = chartTradeSheetHiddenTranslateY;
      setShowChartTradeSheet(true);
    }

    chartTradeSheetLastVisibleOffsetRef.current = target;
    setChartTradeSheetMode(mode);
    chartTradeSheetTranslateY.value = withSpring(target, {
      damping: 26,
      stiffness: 280,
      mass: 0.72,
      overshootClamping: true,
    });
  }, [
    chartTradeSheetDragStartY,
    chartTradeSheetHiddenTranslateY,
    chartTradeSheetLastVisibleOffsetRef,
    chartTradeSheetTranslateY,
    finalizeChartTradeSheetHide,
    resolveChartTradeSheetTranslateY,
    showChartTradeSheet,
  ]);

  const resolveChartTradeEntryPrice = useCallback((orderType: ChartOrderType) => {
    if (isPendingChartOrderType(orderType)) {
      return resolveDefaultPendingPrice(orderType);
    }
    const side = getChartOrderSide(orderType);
    return roundTradePrice(side === 'buy' ? chartAsk : chartBid);
  }, [chartAsk, chartBid, resolveDefaultPendingPrice, roundTradePrice]);

  const resetChartTradePanelLevels = useCallback((
    orderType: ChartOrderType = chartTradeOrderType,
    options: Readonly<{
      enableProtectionDrafts?: boolean;
      positionTargetOverride?: typeof chartTradePositionStopTarget;
    }> = {},
  ) => {
    const positionTarget = options.positionTargetOverride !== undefined
      ? options.positionTargetOverride
      : isPendingChartOrderType(orderType)
        ? null
        : resolveSingleChartPositionStopTarget();
    const side = positionTarget?.side ?? getChartOrderSide(orderType);
    const entryPrice = positionTarget ? roundTradePrice(Number(positionTarget.openPrice)) : resolveChartTradeEntryPrice(orderType);
    const positionSl = Number(positionTarget?.sl);
    const positionTp = Number(positionTarget?.tp);
    const hasPositionSl = Number.isFinite(positionSl) && positionSl > 0;
    const hasPositionTp = Number.isFinite(positionTp) && positionTp > 0;
    const enableProtectionDrafts = options.enableProtectionDrafts === true;
    setChartTradePrice(entryPrice);
    setChartTradeStopLimitPrice(
      resolveDefaultStopLimitPrice(orderType, entryPrice, chartStopLimitOffset, roundTradePrice),
    );
    setChartTradeSlEnabled(enableProtectionDrafts || hasPositionSl);
    setChartTradeTpEnabled(enableProtectionDrafts || hasPositionTp);
    setChartTradeSlPrice(hasPositionSl ? roundTradePrice(positionSl) : resolveChartVisibleStopPreviewPrice('sl', entryPrice, side));
    setChartTradeTpPrice(hasPositionTp ? roundTradePrice(positionTp) : resolveChartVisibleStopPreviewPrice('tp', entryPrice, side));
    setChartTradeComment('');
    setChartTradeCommentFocused(false);
  }, [
    chartStopLimitOffset,
    chartStopOffset,
    chartTradeOrderType,
    resolveChartTradeEntryPrice,
    resolveChartVisibleStopPreviewPrice,
    resolveSingleChartPositionStopTarget,
    roundTradePrice,
  ]);

  const activateDirectChartProtection = useCallback(() => {
    const orderType: ChartOrderType = 'Market Execution';
    const nextSheetMode = resolveChartSltpToolbarTapMode(showChartTradeSheet);

    if (nextSheetMode === 'hidden') {
      snapTradeSheet(nextSheetMode);
      closeChartTapMenu();
      setFooterLotPickerMode(null);
      if (footerLotEditorFocused) {
        finishFooterLotEditor();
      } else {
        setFooterLotEditorOpening(false);
      }
      Keyboard.dismiss();
      return;
    }

    // The top toolbar opens a Market Execution-only protection panel. It must
    // never guess an existing same-symbol ticket, and it must not create either
    // guide until the user explicitly taps the SL or TP chip.
    if (!chartDirectProtectionActive) {
      const draftId = createChartProtectionDraftId(
        chartTradeDisplayQuoteScopeKey,
      );
      chartProtectionDraftIdRef.current = draftId;
      chartProtectionAwaitingTicketRef.current = null;
      captureChartProtectionDraftBaseline(draftId);
      setChartTradeOrderType(orderType);
      setSelectedChartPositionTicket(null);
      setInvalidatedChartPositionSymbol(null);
      resetChartTradePanelLevels(orderType, {
        enableProtectionDrafts: false,
        positionTargetOverride: null,
      });
      setChartShowOnChartItem('slTpLevels', true);
      setChartDirectProtectionActive(true);
    }
    // Match MT5: first tap shows the compact panel over the app tab bar. A
    // second toolbar tap follows the early branch above and closes it.
    snapTradeSheet(nextSheetMode);

    const finalizeActivationWork = () => {
      closeChartTapMenu();
      setFooterLotPickerMode(null);
      if (footerLotEditorFocused) {
        finishFooterLotEditor();
      } else {
        setFooterLotEditorOpening(false);
      }
      Keyboard.dismiss();
    };
    if (typeof globalThis.requestAnimationFrame === 'function') {
      globalThis.requestAnimationFrame(finalizeActivationWork);
    } else {
      setTimeout(finalizeActivationWork, 0);
    }
  }, [
    chartDirectProtectionActive,
    chartTradeDisplayQuoteScopeKey,
    captureChartProtectionDraftBaseline,
    closeChartTapMenu,
    finishFooterLotEditor,
    footerLotEditorFocused,
    resetChartTradePanelLevels,
    setChartShowOnChartItem,
    showChartTradeSheet,
    snapTradeSheet,
  ]);

  const handleActivateDirectChartProtection = useCallback((
    confirmation: ChartWindowToolbarTargetConfirmation,
  ) => {
    chartDirectProtectionOwnerPaneIdRef.current =
      resolveChartWindowCommandOwnerPaneId(confirmation);
    runImmediateAction('chart.sltp.direct', () => {
      // The toolbar creates protection for a new Market Execution order, even
      // when one or more same-symbol positions already exist.
      if (isNewMarketOrderProtectionBackendLocked()) {
        return;
      }
      activateDirectChartProtection();
    });
  }, [activateDirectChartProtection]);


  const scrollChartTradeTypeTabsToOrderType = useCallback((orderType: ChartOrderType, animated: boolean = true) => {
    const scrollListToOrderType = (
      scrollRef: React.RefObject<ScrollView | null>,
      layoutsRef: React.MutableRefObject<Partial<Record<ChartOrderType, ChartTradeTypeTabLayout>>>,
      viewportWidthRef: React.MutableRefObject<number>,
    ) => {
      const layout = layoutsRef.current[orderType];
      if (!layout || viewportWidthRef.current <= 0) {
        return;
      }

      const targetX = Math.max(0, layout.x - Math.max(16, (viewportWidthRef.current - layout.width) / 2));
      scrollRef.current?.scrollTo({ x: targetX, animated });
    };

    requestAnimationFrame(() => {
      scrollListToOrderType(
        chartTradeTypeTabsOverlayScrollRef,
        chartTradeTypeTabsOverlayLayoutsRef,
        chartTradeTypeTabsOverlayViewportWidthRef,
      );
      scrollListToOrderType(
        chartTradeTypeTabsInlineScrollRef,
        chartTradeTypeTabsInlineLayoutsRef,
        chartTradeTypeTabsInlineViewportWidthRef,
      );
    });
  }, []);

  const handleChartTradeOrderTypeSelect = useCallback((orderType: ChartOrderType) => {
    runImmediateAction(`chart.tradeSheet.orderType.${orderType}`, () => {
      // The full pending-order implementation remains compiled and is reached
      // unchanged once the verified backend-ready flag unlocks these tabs.
      if (isPendingOrderTypeBackendLocked(orderType)) {
        return;
      }
      // Market Execution is already the active context for the toolbar SL/TP
      // flow. Treat a tap on that selected tab as a no-op so an existing
      // same-symbol position cannot take over the new-order draft.
      if (chartDirectProtectionActive && orderType === 'Market Execution') {
        return;
      }
      clearChartDirectProtectionDraft();
      setChartTradeOrderType(orderType);
      const side = getChartOrderSide(orderType);
      const nextEntry = resolveChartTradeEntryPrice(orderType);
      setChartTradePrice(nextEntry);
      setChartTradeStopLimitPrice(
        resolveDefaultStopLimitPrice(orderType, nextEntry, chartStopLimitOffset, roundTradePrice),
      );
      setChartTradeSlPrice(resolveChartVisibleStopPreviewPrice('sl', nextEntry, side));
      setChartTradeTpPrice(resolveChartVisibleStopPreviewPrice('tp', nextEntry, side));
      // Don't force-expand on tab switch — keep the sheet at its current
      // snap position so the tabs stay in place and only the content changes.
      // Reset the scroll position so the new tab's content starts at the top.
      chartTradeSheetScrollRef.current?.scrollTo?.({ y: 0, animated: false });
    });
  }, [
    chartDirectProtectionActive,
    clearChartDirectProtectionDraft,
    chartStopLimitOffset,
    chartStopOffset,
    resolveChartTradeEntryPrice,
    resolveChartVisibleStopPreviewPrice,
    roundTradePrice,
    chartTradeSheetScrollRef,
  ]);

  useEffect(() => {
    if (!showChartTradeSheet) {
      return;
    }

    scrollChartTradeTypeTabsToOrderType(chartTradeOrderType, false);
  }, [chartTradeOrderType, scrollChartTradeTypeTabsToOrderType, showChartTradeSheet]);

  const commitChartPositionStopLevels = useCallback(
    (
      positionId: string | number,
      requestedSlRaw: number,
      requestedTpRaw: number,
      onSettled?: () => void,
    ) => {
      if (requestOrrnnDemoTradeAuth({
        kind: 'position-action',
        symbol: chartSymbol,
        action: 'modify',
      })) {
        return false;
      }
      if (isExistingPositionModifyBackendLocked()) {
        setTradeFeedback({
          visible: true,
          type: 'error',
          title: SLTP_COMING_SOON_TITLE,
          message: getActiveSltpUnavailableMessage(),
        });
        return false;
      }
      const quoteAvailability = resolveSessionQuoteActionAvailability(chartLiveQuote, Date.now());
      if (!quoteAvailability.allowed) {
        recordBlockedPriceAction('chart_native_price_action', quoteAvailability);
        setTradeFeedback({
          visible: true,
          type: 'error',
          title: 'Market Data Unavailable',
          message: quoteActionBlockMessage(quoteAvailability),
        });
        return false;
      }

      const sessionCapture = captureActiveBrokerSession();
      if (!sessionCapture) {
        return false;
      }
      const modifySessionKey = captureModifyPositionSessionKey();
      if (!modifySessionKey) {
        return false;
      }
      const isModifySessionCurrent = () =>
        isModifyPositionSessionKeyCurrent(modifySessionKey);

      const requestedSlCandidate =
        Number.isFinite(requestedSlRaw) && requestedSlRaw > 0 ? requestedSlRaw : 0;
      const requestedTpCandidate =
        Number.isFinite(requestedTpRaw) && requestedTpRaw > 0 ? requestedTpRaw : 0;
      const positionKey = String(positionId);
      const latestPositions = usePositionsState.getState().positions;
      const position = latestPositions.find((item) => String(item.id) === positionKey)
        ?? positions.find((item) => String(item.id) === positionKey);
      if (!position) {
        const feedback = createFrontendTradingError(
          'Position Not Found',
          'The selected position is no longer open. Refresh positions and try again.',
        );
        setTradeFeedback({ visible: true, type: 'error', title: feedback.title, message: feedback.message });
        return false;
      }
      const ticketMutationState = getModifyPositionTicketState(position.id);
      if ((ticketMutationState.retryAfterUntil ?? 0) > Date.now()) {
        setTradeFeedback({
          visible: true,
          type: 'error',
          title: 'Rate Limited',
          message: 'Wait for the broker retry period before submitting again.',
        });
        return false;
      }
      const previousSl = Number(position.sl) > 0 ? Number(position.sl) : 0;
      const previousTp = Number(position.tp) > 0 ? Number(position.tp) : 0;
      if (
        !chartProtectionTickSize &&
        (
          (requestedSlCandidate > 0 && requestedSlCandidate !== previousSl) ||
          (requestedTpCandidate > 0 && requestedTpCandidate !== previousTp)
        )
      ) {
        const feedback = createFrontendTradingError(
          'Instrument Data Unavailable',
          'A positive broker tick size is required before setting a new SL/TP price.',
        );
        setTradeFeedback({
          visible: true,
          type: 'error',
          title: feedback.title,
          message: feedback.message,
        });
        return false;
      }
      const requestedSl = chartProtectionTickSize
        ? (requestedSlCandidate > 0 ? roundTradePrice(requestedSlCandidate) : 0)
        : (requestedSlCandidate > 0 ? previousSl : 0);
      const requestedTp = chartProtectionTickSize
        ? (requestedTpCandidate > 0 ? roundTradePrice(requestedTpCandidate) : 0)
        : (requestedTpCandidate > 0 ? previousTp : 0);

      const validationReferencePrice = position.side === 'buy'
        ? quoteAvailability.bid
        : quoteAvailability.ask;
      const validation = validateChartTradeProtectionLevels({
        side: position.side,
        entryPrice: validationReferencePrice,
        slEnabled: requestedSl > 0,
        slPrice: requestedSl,
        tpEnabled: requestedTp > 0,
        tpPrice: requestedTp,
        pointSize: chartProtectionTickSize ?? 0,
      });
      if (!validation.valid) {
        const feedback = createFrontendTradingError('Invalid SL/TP', validation.message);
        setTradeFeedback({ visible: true, type: 'error', title: feedback.title, message: feedback.message, side: position.side });
        return false;
      }

      // Investor (read-only) login: SL/TP line edits are not allowed.
      if (isActiveSessionInvestorReadOnly()) {
        const feedback = createFrontendTradingError(INVESTOR_READ_ONLY_TITLE, INVESTOR_READ_ONLY_MESSAGE);
        setTradeFeedback({ visible: true, type: 'error', title: feedback.title, message: feedback.message, side: position.side });
        return false;
      }

      if (
        !accountLogin ||
        String(accountLogin) !== sessionCapture.session.accountLogin ||
        !isModifySessionCurrent()
      ) {
        const feedback = createFrontendTradingError(
          'Sign In Required',
          'The selected position does not belong to the active broker session.',
        );
        setTradeFeedback({ visible: true, type: 'error', title: feedback.title, message: feedback.message });
        return false;
      }

      if (requestedSl === previousSl && requestedTp === previousTp) {
        onSettled?.();
        return true;
      }

      let submission: ReturnType<typeof submitModifyPosition>;
      try {
        submission = submitModifyPosition({
          ticket: position.id,
          symbol: position.symbol,
          accountLogin: sessionCapture.session.accountLogin,
          request: {
            price_sl: requestedSl,
            price_tp: requestedTp,
          },
        });
      } catch (error) {
        const feedback = classifyTradingError(error, { action: 'modify-position' });
        setTradeFeedback({
          visible: true,
          type: 'error',
          title: feedback.title,
          message: feedback.message,
        });
        return false;
      }

      void submission
        .then((result) => {
          if (!isModifySessionCurrent()) {
            return;
          }
          if (result.status === 'saved') {
            void refetchAccountSummary();
            return;
          }
          if (result.status === 'superseded' || result.status === 'session_changed') {
            return;
          }
          if (result.status === 'rejected' && result.error) {
            const feedback = classifyTradingError(result.error, { action: 'modify-position' });
            setTradeFeedback({
              visible: true,
              type: 'error',
              title: feedback.title,
              message: feedback.message,
            });
            return;
          }
          const message = result.status === 'position_unavailable'
            ? 'The selected position is no longer available in the latest broker position list.'
            : result.status === 'changed_elsewhere'
              ? 'The latest broker position has different SL/TP values. Those newer observed values were kept.'
              : result.status === 'rate_limited'
                ? 'Wait for the broker retry period before submitting again.'
                : 'The final SL/TP outcome is unknown. The app reconciled the position and did not retry automatically.';
          setTradeFeedback({
            visible: true,
            type: 'error',
            title: result.status === 'changed_elsewhere' ? 'Position Changed' : 'SL/TP Not Confirmed',
            message,
          });
        })
        .finally(() => {
          if (isModifySessionCurrent()) {
            onSettled?.();
          }
        });

      return true;
    },
    [
      accountLogin,
      chartLiveQuote,
      chartProtectionTickSize,
      chartSymbol,
      positions,
      refetchAccountSummary,
      roundTradePrice,
    ],
  );

  const commitChartTradeSheetStopsForPosition = useCallback(
    (position: typeof chartTradePositionStopTarget, nextSl: number, nextTp: number) => {
      if (!position || isPendingChartOrderType(chartTradeOrderType)) {
        return;
      }
      commitChartPositionStopLevels(position.id, nextSl, nextTp);
    },
    [chartTradeOrderType, commitChartPositionStopLevels],
  );

  const handleEnableChartTradeStops = useCallback(() => {
    runImmediateAction('chart.tradeSheet.enableStops', () => {
      const isDirectMarketProtection =
        chartDirectProtectionActive &&
        !isPendingChartOrderType(chartTradeOrderType);
      const protectionBackendLocked = isDirectMarketProtection
        ? isNewMarketOrderProtectionBackendLocked()
        : isChartTradeProtectionBackendLocked(chartTradeOrderType);
      if (protectionBackendLocked) {
        showChartProtectionCapabilityFeedback();
        return;
      }
      // The toolbar Market Execution flow is intentionally controlled by the
      // individual SL and TP chips. Never let the combined legacy action turn
      // both guides on for this mode.
      if (isDirectMarketProtection) {
        snapTradeSheet('expanded');
        return;
      }
      const positionTarget =
        isPendingChartOrderType(chartTradeOrderType)
          ? null
          : resolveSingleChartPositionStopTarget();
      if (
        !isPendingChartOrderType(chartTradeOrderType) &&
        chartMatchingPositionCandidates.length > 0 &&
        !positionTarget
      ) {
        setTradeFeedback({
          visible: true,
          type: 'error',
          title: 'Select Position',
          message: 'Select the exact position ticket before changing SL/TP.',
        });
        return;
      }
      if (positionTarget && !chartProtectionTickSize) {
        setTradeFeedback({
          visible: true,
          type: 'error',
          title: 'Instrument Data Unavailable',
          message: 'Wait for a positive broker tick size before setting SL/TP.',
        });
        return;
      }
      const baseEntry = isPendingChartOrderType(chartTradeOrderType)
        ? chartTradePrice
        : positionTarget
          ? roundTradePrice(Number(positionTarget.openPrice))
          : resolveChartTradeEntryPrice(chartTradeOrderType);
      const side = positionTarget?.side ?? getChartOrderSide(chartTradeOrderType);
      const nextSl = chartTradeSlEnabled && chartTradeSlPrice > 0
        ? chartTradeSlPrice
        : resolveChartVisibleStopPreviewPrice('sl', baseEntry, side);
      const nextTp = chartTradeTpEnabled && chartTradeTpPrice > 0
        ? chartTradeTpPrice
        : resolveChartVisibleStopPreviewPrice('tp', baseEntry, side);
      setChartTradeSlEnabled(true);
      setChartTradeSlPrice(nextSl);
      setChartTradeTpEnabled(true);
      setChartTradeTpPrice(nextTp);
      setChartShowOnChartItem('slTpLevels', true);
      commitChartTradeSheetStopsForPosition(positionTarget, nextSl, nextTp);
      snapTradeSheet('expanded');
    });
  }, [
    chartStopOffset,
    chartDirectProtectionActive,
    chartMatchingPositionCandidates.length,
    chartProtectionTickSize,
    chartTradeOrderType,
    chartTradePrice,
    chartTradeSlPrice,
    chartTradeSlEnabled,
    chartTradeTpPrice,
    chartTradeTpEnabled,
    commitChartTradeSheetStopsForPosition,
    isChartTradeProtectionBackendLocked,
    resolveChartTradeEntryPrice,
    resolveChartVisibleStopPreviewPrice,
    resolveSingleChartPositionStopTarget,
    roundTradePrice,
    setChartShowOnChartItem,
    showChartProtectionCapabilityFeedback,
    snapTradeSheet,
  ]);

  const handleToggleChartTradeStopLevel = useCallback((kind: 'sl' | 'tp') => {
    const isDirectMarketProtection =
      chartDirectProtectionActive &&
      !isPendingChartOrderType(chartTradeOrderType);
    const protectionBackendLocked = isDirectMarketProtection
      ? isNewMarketOrderProtectionBackendLocked()
      : isChartTradeProtectionBackendLocked(chartTradeOrderType);
    if (protectionBackendLocked) {
      showChartProtectionCapabilityFeedback();
      return;
    }
    const positionTarget =
      isPendingChartOrderType(chartTradeOrderType) || isDirectMarketProtection
        ? null
        : resolveSingleChartPositionStopTarget();
    if (
      !isDirectMarketProtection &&
      !isPendingChartOrderType(chartTradeOrderType) &&
      chartMatchingPositionCandidates.length > 0 &&
      !positionTarget
    ) {
      setTradeFeedback({
        visible: true,
        type: 'error',
        title: 'Select Position',
        message: 'Select the exact position ticket before changing SL/TP.',
      });
      return;
    }
    const isEnabling = kind === 'sl' ? !chartTradeSlEnabled : !chartTradeTpEnabled;
    if (positionTarget && isEnabling && !chartProtectionTickSize) {
      setTradeFeedback({
        visible: true,
        type: 'error',
        title: 'Instrument Data Unavailable',
        message: 'Wait for a positive broker tick size before setting SL/TP.',
      });
      return;
    }
    const baseEntry = isPendingChartOrderType(chartTradeOrderType)
      ? chartTradePrice
      : positionTarget
        ? roundTradePrice(Number(positionTarget.openPrice))
        : resolveChartTradeEntryPrice(chartTradeOrderType);
    const side = positionTarget?.side ?? getChartOrderSide(chartTradeOrderType);
    const nextPrice = resolveChartVisibleStopPreviewPrice(kind, baseEntry, side);
    const currentSl = chartTradeSlEnabled && chartTradeSlPrice > 0 ? chartTradeSlPrice : 0;
    const currentTp = chartTradeTpEnabled && chartTradeTpPrice > 0 ? chartTradeTpPrice : 0;

    if (kind === 'sl') {
      if (chartTradeSlEnabled) {
        setChartTradeSlEnabled(false);
        commitChartTradeSheetStopsForPosition(positionTarget, 0, currentTp);
        return;
      }
      setChartTradeSlEnabled(true);
      setChartTradeSlPrice(nextPrice);
      setChartShowOnChartItem('slTpLevels', true);
      commitChartTradeSheetStopsForPosition(positionTarget, nextPrice, currentTp);
      return;
    }

    if (chartTradeTpEnabled) {
      setChartTradeTpEnabled(false);
      commitChartTradeSheetStopsForPosition(positionTarget, currentSl, 0);
      return;
    }
    setChartTradeTpEnabled(true);
    setChartTradeTpPrice(nextPrice);
    setChartShowOnChartItem('slTpLevels', true);
    commitChartTradeSheetStopsForPosition(positionTarget, currentSl, nextPrice);
  }, [
    chartStopOffset,
    chartDirectProtectionActive,
    chartMatchingPositionCandidates.length,
    chartProtectionTickSize,
    chartTradeOrderType,
    chartTradePrice,
    chartTradeSlEnabled,
    chartTradeSlPrice,
    chartTradeTpEnabled,
    chartTradeTpPrice,
    commitChartTradeSheetStopsForPosition,
    isChartTradeProtectionBackendLocked,
    resolveChartTradeEntryPrice,
    resolveChartVisibleStopPreviewPrice,
    resolveSingleChartPositionStopTarget,
    roundTradePrice,
    setChartShowOnChartItem,
    showChartProtectionCapabilityFeedback,
  ]);
  const handleSubmitPendingTradeFromSheet = useCallback(() => {
    if (requestOrrnnDemoTradeAuth({
      kind: 'pending-order',
      symbol: chartSymbol,
      side: getChartOrderSide(chartTradeOrderType),
      origin: 'chart',
    })) {
      return;
    }
    // Retain the complete pending submission flow below, but never let a
    // retained/programmatic call bypass the visible backend-readiness lock.
    if (isPendingOrderTypeBackendLocked(chartTradeOrderType)) {
      return;
    }
    if (chartPendingOrderSubmitting) {
      return;
    }

    const submitPendingOrder = async () => {
      if (!isPendingChartOrderType(chartTradeOrderType)) {
        const feedback = createFrontendTradingError(
          'Order Type Error',
          'Select a pending order type before placing a pending order.',
        );
        handleChartTradeResult({ visible: true, type: 'error', title: feedback.title, message: feedback.message });
        return;
      }

      const currentQuoteAvailability = resolveSessionQuoteActionAvailability(chartLiveQuote, Date.now());
      if (!currentQuoteAvailability.allowed) {
        recordBlockedPriceAction('chart_native_market_order', currentQuoteAvailability);
        const feedback = createFrontendTradingError(
          'Market Data Unavailable',
          quoteActionBlockMessage(currentQuoteAvailability),
        );
        handleChartTradeResult({ visible: true, type: 'error', title: feedback.title, message: feedback.message });
        return;
      }

      const side = getChartOrderSide(chartTradeOrderType);
      if (!isPendingChartTradeValid({
        orderType: chartTradeOrderType,
        entryPrice: chartTradePrice,
        stopLimitPrice: chartTradeStopLimitPrice,
        bid: currentQuoteAvailability.bid,
        ask: currentQuoteAvailability.ask,
        pointSize: chartPointSize,
      })) {
        const feedback = createFrontendTradingError(
          'Invalid Pending Order',
          'Check the pending price and stop-limit price before placing the order.',
        );
        handleChartTradeResult({ visible: true, type: 'error', title: feedback.title, message: feedback.message });
        return;
      }

      const pendingProtectionBackendLocked = isPendingOrderProtectionBackendLocked();
      if (!pendingProtectionBackendLocked) {
        const protectionValidation = validateChartTradeProtectionLevels({
          side,
          entryPrice: chartTradePrice,
          slEnabled: chartTradeSlEnabled,
          slPrice: chartTradeSlPrice,
          tpEnabled: chartTradeTpEnabled,
          tpPrice: chartTradeTpPrice,
          pointSize: chartProtectionTickSize ?? 0,
        });
        if (!protectionValidation.valid) {
          const feedback = createFrontendTradingError('Invalid SL/TP', protectionValidation.message);
          handleChartTradeResult({ visible: true, type: 'error', title: feedback.title, message: feedback.message, side });
          return;
        }
      }

      const accountState = useUserPreferences.getState();
      if (!accountState.accountDetails?.credentials?.accessToken) {
        const feedback = createFrontendTradingError(
          'Sign In Required',
          'Please sign in to your trading account before placing orders.',
        );
        handleChartTradeResult({ visible: true, type: 'error', title: feedback.title, message: feedback.message });
        return;
      }

      const pendingOrderSessionCapture = captureActiveBrokerSession();
      if (!pendingOrderSessionCapture) {
        const feedback = createFrontendTradingError(
          'Sign In Required',
          'The active broker session is unavailable. Please sign in again before placing orders.',
        );
        handleChartTradeResult({ visible: true, type: 'error', title: feedback.title, message: feedback.message });
        return;
      }
      const pendingOrderSessionProvenance = getActiveBrokerSessionProvenance(
        pendingOrderSessionCapture.session,
      );
      const isPendingOrderSessionCurrent = () =>
        isActiveBrokerSessionProvenanceCurrent(pendingOrderSessionProvenance);

      const tradingLogin = resolveTradingLogin();
      if (
        !tradingLogin ||
        String(tradingLogin) !== pendingOrderSessionCapture.session.accountLogin ||
        !isPendingOrderSessionCurrent()
      ) {
        const feedback = createFrontendTradingError(
          'No Trading Account',
          'No active trading account is selected for the current broker session. Open the account menu and choose one, then try again.',
        );
        handleChartTradeResult({ visible: true, type: 'error', title: feedback.title, message: feedback.message });
        return;
      }

      const volume = Number(tradeVolume);
      if (!Number.isFinite(volume) || volume <= 0) {
        const feedback = createFrontendTradingError(
          'Invalid Lot Size',
          `Volume must be greater than 0. Current: ${tradeVolume}`,
        );
        handleChartTradeResult({ visible: true, type: 'error', title: feedback.title, message: feedback.message });
        return;
      }

      const trimmedComment = chartTradeComment.trim();
      const payload = {
        account_login: tradingLogin,
        symbol: chartSymbol,
        side,
        volume,
        price: chartTradePrice,
        ...(isStopLimitChartOrderType(chartTradeOrderType) && chartTradeStopLimitPrice > 0
          ? { stopLimitPrice: chartTradeStopLimitPrice }
          : {}),
        ...(!pendingProtectionBackendLocked && chartTradeSlEnabled && chartTradeSlPrice > 0
          ? { price_sl: chartTradeSlPrice }
          : {}),
        ...(!pendingProtectionBackendLocked && chartTradeTpEnabled && chartTradeTpPrice > 0
          ? { price_tp: chartTradeTpPrice }
          : {}),
        ...(trimmedComment ? { comment: trimmedComment } : {}),
        type: chartTradeOrderType.toLowerCase().replace(/\s+/g, '_'),
      };

      setChartPendingOrderSubmitting(true);
      try {
        const data = await ordersApi.placePendingOrder(payload);
        if (!isPendingOrderSessionCurrent()) return;
        if (['rejected', 'failed', 'error'].includes((data.status ?? '').toLowerCase())) {
          const feedback = classifyTradingError(
            { status: 400, data: { message: data.comment || `Server returned status: ${data.status}` } },
            { action: 'place-order' },
          );
          handleChartTradeResult({
            visible: true,
            type: 'error',
            title: feedback.title,
            message: feedback.message,
            side,
          });
          return;
        }

        await Promise.allSettled([
          refetchOrders(),
          refetchAccountSummary(),
          refreshPositions(String(tradingLogin)),
        ]);
        if (!isPendingOrderSessionCurrent()) return;

        const pendingOrderEvidence = resolveBrokerExecutionEvidence(data);
        const hasBrokerOrderTicket = pendingOrderEvidence.ticket !== undefined;
        handleChartTradeResult({
          visible: true,
          type: 'success',
          executionConfirmed: false,
          title: hasBrokerOrderTicket
            ? 'Pending Order Placed'
            : 'Pending Order Submitted — Confirmation Pending',
          message: hasBrokerOrderTicket
            ? 'The broker returned an order ticket. This pending order has not executed yet.'
            : 'The broker accepted the request without returning an order ticket. Verify it in Orders before acting on it.',
          side,
          symbol: chartSymbol,
          ...(pendingOrderEvidence.ticket !== undefined
            ? { ticket: String(pendingOrderEvidence.ticket) }
            : {}),
          ...(pendingOrderEvidence.executionPrice !== undefined
            ? { price: pendingOrderEvidence.executionPrice }
            : {}),
          volume,
        });
        snapTradeSheet('collapsed');
      } catch (error: any) {
        if (!isPendingOrderSessionCurrent()) return;
        const feedback = classifyTradingError(error, { action: 'place-order' });
        const rawMsg = redactSensitiveString(
          String(error?.response?.data?.message || error?.response?.data?.error || error?.data?.message || ''),
        );
        handleChartTradeResult({
          visible: true,
          type: 'error',
          title: feedback.title,
          message: rawMsg ? `${feedback.message}\n\nServer: ${rawMsg}` : feedback.message,
          side,
        });
      } finally {
        if (isPendingOrderSessionCurrent()) {
          setChartPendingOrderSubmitting(false);
        }
      }
    };

    runImmediateAction('chart.tradeSheet.pending.submit', () => {
      void submitPendingOrder();
    });
  }, [
    chartLiveQuote,
    chartPendingOrderSubmitting,
    chartPointSize,
    chartProtectionTickSize,
    chartSymbol,
    chartTradeComment,
    chartTradeOrderType,
    chartTradePrice,
    chartTradeSlEnabled,
    chartTradeSlPrice,
    chartTradeStopLimitPrice,
    chartTradeTpEnabled,
    chartTradeTpPrice,
    handleChartTradeResult,
    refetchAccountSummary,
    refetchOrders,
    refreshPositions,
    snapTradeSheet,
    tradeVolume,
  ]);
  const handleToggleChartTradeSheetMode = useCallback(() => {
    snapTradeSheet(chartTradeSheetMode === 'expanded' ? 'collapsed' : 'expanded');
  }, [chartTradeSheetMode, snapTradeSheet]);
  const chartTradeExpirationActions = useMemo(
    () => [
      {
        icon: <Ionicons name="infinite-outline" size={20} color={TEXT_MUTED} />,
        label: t('GTC'),
        onPress: () => setChartTradeExpiration('GTC'),
      },
      {
        icon: <Ionicons name="today-outline" size={20} color={TEXT_MUTED} />,
        label: t('Today'),
        onPress: () => setChartTradeExpiration('Today'),
      },
      {
        icon: <Ionicons name="time-outline" size={20} color={TEXT_MUTED} />,
        label: t('Date and Time'),
        onPress: () => setChartTradeExpiration('Date and Time'),
      },
      {
        icon: <Ionicons name="calendar-outline" size={20} color={TEXT_MUTED} />,
        label: t('Date'),
        onPress: () => setChartTradeExpiration('Date'),
      },
    ],
    [TEXT_MUTED, t],
  );
  const handleOpenChartExpirationMenu = useCallback(() => {
    runImmediateAction('chart.tradeSheet.expiration.open', () => {
      setFooterLotPickerMode(null);
      setChartTradeCommentFocused(false);
      Keyboard.dismiss();
      showChartActionSheet({
        presentation: 'mt5Plain',
        showActionIcons: true,
        detent: 'auto',
        instantOpen: true,
        runActionAfterClose: false,
        actions: chartTradeExpirationActions,
      });
    });
  }, [chartTradeExpirationActions, showChartActionSheet]);
  const handleFocusChartTradeComment = useCallback(() => {
    runImmediateAction('chart.tradeSheet.comment.focus', () => {
      if (chartTradeSheetMode !== 'expanded') {
        snapTradeSheet('expanded');
      }
      setChartTradeCommentFocused(true);
    });
  }, [chartTradeSheetMode, snapTradeSheet]);
  const handleBlurChartTradeComment = useCallback(() => {
    if (chartTradeCommentSubmitIntentRef.current) {
      chartTradeCommentSubmitIntentRef.current = false;
      return;
    }

    if (Platform.OS === 'android' && showChartTradeSheet) {
      requestAnimationFrame(() => {
        chartTradeCommentInputRef.current?.focus();
      });
      return;
    }

    setChartTradeCommentFocused(false);
  }, [showChartTradeSheet]);
  const handleSubmitChartTradeComment = useCallback(() => {
    chartTradeCommentSubmitIntentRef.current = false;
    const nextComment = chartTradeComment.trim();
    if (nextComment !== chartTradeComment) {
      setChartTradeComment(nextComment);
    }
    setChartTradeCommentFocused(false);
    Keyboard.dismiss();
  }, [chartTradeComment]);
  const handlePrepareChartTradeCommentSubmit = useCallback(() => {
    chartTradeCommentSubmitIntentRef.current = true;
  }, []);
  const handleChangeChartTradeComment = useCallback((text: string) => {
    setChartTradeComment(text.slice(0, 50));
  }, []);
  const handleChartTradeSheetScroll = useCallback((offsetY: number) => {
    chartTradeSheetScrollOffsetRef.current = offsetY;
  }, []);
  const handleOverlayTradeTypeTabsViewportLayout = useCallback((width: number) => {
    chartTradeTypeTabsOverlayViewportWidthRef.current = width;
    scrollChartTradeTypeTabsToOrderType(chartTradeOrderType, false);
  }, [chartTradeOrderType, scrollChartTradeTypeTabsToOrderType]);
  const handleInlineTradeTypeTabsViewportLayout = useCallback((width: number) => {
    chartTradeTypeTabsInlineViewportWidthRef.current = width;
    scrollChartTradeTypeTabsToOrderType(chartTradeOrderType, false);
  }, [chartTradeOrderType, scrollChartTradeTypeTabsToOrderType]);
  const handleOverlayTradeTypeTabLayout = useCallback((orderType: ChartOrderType, layout: ChartTradeTypeTabLayout) => {
    chartTradeTypeTabsOverlayLayoutsRef.current[orderType] = layout;
  }, []);
  const handleInlineTradeTypeTabLayout = useCallback((orderType: ChartOrderType, layout: ChartTradeTypeTabLayout) => {
    chartTradeTypeTabsInlineLayoutsRef.current[orderType] = layout;
  }, []);
  const handleOpenChartTradeVolumeStepper = useCallback(() => {
    setChartTradeVolumeInputFocused(false);
    const nextDraft = resolveFooterLotCommitDraftValue({
      draftRef: chartTradeVolumeDraftRef.current,
      currentDraft: chartTradeVolumeDraft,
    });
    if (nextDraft.trim()) {
      updateTradeVolume(nextDraft);
    }
    runImmediateAction('chart.tradeSheet.stepper.volume', () => setChartStepperEditor({ kind: 'volume' }));
  }, [chartTradeVolumeDraft, updateTradeVolume]);
  const handleFocusChartTradeVolumeInput = useCallback(() => {
    setChartTradeVolumeDraftValue(formatTradeVolume(tradeVolume, tradeVolumeBounds));
    setChartTradeVolumeInputFocused(true);
  }, [setChartTradeVolumeDraftValue, tradeVolume, tradeVolumeBounds]);
  const handleChartTradeVolumeDraftChange = useCallback((text: string) => {
    setChartTradeVolumeDraftValue(sanitizeTradeVolumeDraft(text));
  }, [setChartTradeVolumeDraftValue]);
  const commitChartTradeVolumeDraft = useCallback((draftOverride?: string) => {
    const nextDraft = resolveFooterLotCommitDraftValue({
      draftOverride,
      draftRef: chartTradeVolumeDraftRef.current,
      currentDraft: chartTradeVolumeDraft,
    });
    if (!nextDraft.trim()) {
      const latestVolume = useUserPreferences.getState().tradeVolume;
      setChartTradeVolumeDraftValue(formatTradeVolume(latestVolume, tradeVolumeBounds));
      return;
    }
    updateTradeVolume(nextDraft);
  }, [chartTradeVolumeDraft, setChartTradeVolumeDraftValue, tradeVolumeBounds, updateTradeVolume]);
  const handleBlurChartTradeVolumeDraft = useCallback(() => {
    commitChartTradeVolumeDraft();
    setChartTradeVolumeInputFocused(false);
  }, [commitChartTradeVolumeDraft]);
  const handleEndChartTradeVolumeDraft = useCallback((event: TextInputCommitEvent) => {
    commitChartTradeVolumeDraft(event.nativeEvent.text);
  }, [commitChartTradeVolumeDraft]);
  const handleSubmitChartTradeVolumeDraft = useCallback((event?: TextInputCommitEvent) => {
    commitChartTradeVolumeDraft(event?.nativeEvent.text);
    setChartTradeVolumeInputFocused(false);
  }, [commitChartTradeVolumeDraft]);
  const handleOpenChartTradePriceStepper = useCallback(() => {
    runImmediateAction('chart.tradeSheet.stepper.price', () => setChartStepperEditor({ kind: 'price' }));
  }, []);
  const handleOpenChartTradeStopLimitPriceStepper = useCallback(() => {
    runImmediateAction('chart.tradeSheet.stepper.stopLimitPrice', () => setChartStepperEditor({ kind: 'stopLimitPrice' }));
  }, []);
  const handleSelectChartTradeStopUnit = useCallback((unit: 'Price' | 'Pips' | 'Currency') => {
    runImmediateAction(`chart.tradeSheet.stopUnit.${unit}`, () => setChartTradeStopUnit(unit));
  }, []);
  const handleOpenChartTradeStopStepper = useCallback((kind: 'sl' | 'tp') => {
    const enabled = kind === 'sl' ? chartTradeSlEnabled : chartTradeTpEnabled;
    const currentPrice = kind === 'sl' ? chartTradeSlPrice : chartTradeTpPrice;
    if (!enabled || !Number.isFinite(currentPrice) || currentPrice <= 0) {
      const isDirectMarketProtection =
        chartDirectProtectionActive &&
        !isPendingChartOrderType(chartTradeOrderType);
      const positionTarget =
        isPendingChartOrderType(chartTradeOrderType) || isDirectMarketProtection
          ? null
          : resolveSingleChartPositionStopTarget();
      const baseEntry = isPendingChartOrderType(chartTradeOrderType)
        ? chartTradePrice
        : positionTarget
          ? roundTradePrice(Number(positionTarget.openPrice))
          : resolveChartTradeEntryPrice(chartTradeOrderType);
      const side = positionTarget?.side ?? getChartOrderSide(chartTradeOrderType);
      const nextPrice = resolveChartVisibleStopPreviewPrice(kind, baseEntry, side);
      if (kind === 'sl') {
        setChartTradeSlPrice(nextPrice);
      } else {
        setChartTradeTpPrice(nextPrice);
      }
    }
    runImmediateAction(`chart.tradeSheet.stepper.${kind}`, () => setChartStepperEditor({ kind }));
  }, [
    chartDirectProtectionActive,
    chartTradeOrderType,
    chartTradePrice,
    chartTradeSlEnabled,
    chartTradeSlPrice,
    chartTradeTpEnabled,
    chartTradeTpPrice,
    resolveChartTradeEntryPrice,
    resolveChartVisibleStopPreviewPrice,
    resolveSingleChartPositionStopTarget,
    roundTradePrice,
  ]);
  const handleOpenChartTradeSlStepper = useCallback(() => {
    handleOpenChartTradeStopStepper('sl');
  }, [handleOpenChartTradeStopStepper]);
  const handleOpenChartTradeTpStepper = useCallback(() => {
    handleOpenChartTradeStopStepper('tp');
  }, [handleOpenChartTradeStopStepper]);
  const handleCommitChartStepperValue = useCallback((next: number) => {
    const kind = chartStepperEditor?.kind;
    if (kind === 'price') {
      setChartTradePrice(roundTradePrice(next));
      return;
    }
    if (kind === 'stopLimitPrice') {
      setChartTradeStopLimitPrice(roundTradePrice(next));
      return;
    }
    if (kind === 'volume') {
      updateTradeVolume(next);
      return;
    }
    if (kind !== 'sl' && kind !== 'tp') {
      return;
    }

    const nextPrice = roundTradePrice(next);
    if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
      return;
    }
    const isDirectMarketProtection =
      chartDirectProtectionActive &&
      !isPendingChartOrderType(chartTradeOrderType);
    const positionTarget =
      isPendingChartOrderType(chartTradeOrderType) || isDirectMarketProtection
        ? null
        : resolveSingleChartPositionStopTarget();
    if (
      !isDirectMarketProtection &&
      !isPendingChartOrderType(chartTradeOrderType) &&
      chartMatchingPositionCandidates.length > 0 &&
      !positionTarget
    ) {
      setTradeFeedback({
        visible: true,
        type: 'error',
        title: 'Select Position',
        message: 'Select the exact position ticket before changing SL/TP.',
      });
      return;
    }

    const currentSl = chartTradeSlEnabled && chartTradeSlPrice > 0 ? chartTradeSlPrice : 0;
    const currentTp = chartTradeTpEnabled && chartTradeTpPrice > 0 ? chartTradeTpPrice : 0;
    setChartShowOnChartItem('slTpLevels', true);
    if (kind === 'sl') {
      setChartTradeSlEnabled(true);
      setChartTradeSlPrice(nextPrice);
      commitChartTradeSheetStopsForPosition(positionTarget, nextPrice, currentTp);
      return;
    }
    setChartTradeTpEnabled(true);
    setChartTradeTpPrice(nextPrice);
    commitChartTradeSheetStopsForPosition(positionTarget, currentSl, nextPrice);
  }, [
    chartDirectProtectionActive,
    chartMatchingPositionCandidates.length,
    chartStepperEditor?.kind,
    chartTradeOrderType,
    chartTradeSlEnabled,
    chartTradeSlPrice,
    chartTradeTpEnabled,
    chartTradeTpPrice,
    commitChartTradeSheetStopsForPosition,
    resolveSingleChartPositionStopTarget,
    roundTradePrice,
    setChartShowOnChartItem,
    updateTradeVolume,
  ]);
  const handleToggleChartTradeSlLock = useCallback(() => {
    runImmediateAction('chart.tradeSheet.sl.lockToggle', () => setChartTradeSlLocked((value) => !value));
  }, []);
  const handleToggleChartTradeTpLock = useCallback(() => {
    runImmediateAction('chart.tradeSheet.tp.lockToggle', () => setChartTradeTpLocked((value) => !value));
  }, []);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const scheduleKeyboardLayoutAnimation =
      (Keyboard as typeof Keyboard & { scheduleLayoutAnimation?: (event: unknown) => void }).scheduleLayoutAnimation;

    const showSub = Keyboard.addListener(showEvent, (event) => {
      // Let the keyboard layout animation run so a keyboard-driven resize glides.
      scheduleKeyboardLayoutAnimation?.(event);
      // When a global action sheet (e.g. the symbol picker's search field) owns
      // the keyboard, stop here. The chart's own keyboardVisibleHeight reflow +
      // dock-offset remeasure run on the same frame the sheet resizes to clear
      // the keyboard and shove the layout under the sheet — the focus-time jump.
      const ui = useUIState.getState();
      const actionSheetOwnsKeyboard =
        isChartSymbolPickerSheetActive() ||
        ui.actionSheet !== null ||
        (ui.actionSheetScope != null && ui.scopedActionSheets[ui.actionSheetScope] !== null);
      if (actionSheetOwnsKeyboard) {
        return;
      }
      const nextHeight = Math.max(0, event.endCoordinates.height);
      keyboardFrameRef.current = {
        height: nextHeight,
        screenY: typeof event.endCoordinates.screenY === 'number' ? event.endCoordinates.screenY : null,
      };
      setKeyboardVisibleHeight(nextHeight);
      setFooterLotEditorOpening(false);
      measureKeyboardDockAnchors(() => {
        recomputeKeyboardDockOffset(keyboardFrameRef.current);
      });
    });

    const hideSub = Keyboard.addListener(hideEvent, (event) => {
      if (event) {
        scheduleKeyboardLayoutAnimation?.(event);
      }
      keyboardFrameRef.current = { height: 0, screenY: null };
      setKeyboardVisibleHeight(0);
      setKeyboardDockOffset(0);
      setFooterLotEditorOpening(false);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [measureKeyboardDockAnchors, recomputeKeyboardDockOffset]);
  useEffect(() => {
    if (!chartTradeCommentFocused || !showChartTradeSheet) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        chartTradeCommentInputRef.current?.focus();
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [chartTradeCommentFocused, showChartTradeSheet]);

  useEffect(() => {
    if (!footerLotEditorFocused || showChartTradeSheet) {
      return;
    }
    let cancelled = false;
    let frame: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const maxAttempts = 8;

    const focusLotInput = () => {
      if (cancelled) {
        return;
      }

      attempts += 1;
      footerLotEditorInputRef.current?.focus();
      syncKeyboardHeightFromMetrics();

      if (attempts < maxAttempts) {
        timeoutId = setTimeout(focusLotInput, 80);
      }
    };

    frame = requestAnimationFrame(() => {
      requestAnimationFrame(focusLotInput);
    });

    return () => {
      cancelled = true;
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, [footerLotEditorFocused, showChartTradeSheet, syncKeyboardHeightFromMetrics]);
  useEffect(() => {
    if (
      Platform.OS !== 'android' ||
      !footerLotEditorOpening ||
      showChartTradeSheet
    ) {
      return;
    }

    if (keyboardVisibleHeight > 0 || keyboardDockOffset > 0) {
      setFooterLotEditorOpening(false);
    }
  }, [footerLotEditorOpening, keyboardDockOffset, keyboardVisibleHeight, showChartTradeSheet]);
  useEffect(() => {
    if (
      Platform.OS !== 'android' ||
      !footerLotEditorFocused ||
      showChartTradeSheet ||
      keyboardDockOffset > 0
    ) {
      return;
    }

    let cancelled = false;
    let rafId: number | null = null;
    let attempts = 0;

    const syncUntilKeyboardVisible = () => {
      if (cancelled) {
        return;
      }

      attempts += 1;
      measureKeyboardDockAnchors(() => {
        const metrics = syncKeyboardHeightFromMetrics();
        if (metrics.dockOffset > 0 || metrics.height > 0 || attempts >= 24 || cancelled) {
          return;
        }

        rafId = requestAnimationFrame(syncUntilKeyboardVisible);
      });
    };

    rafId = requestAnimationFrame(syncUntilKeyboardVisible);

    return () => {
      cancelled = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [footerLotEditorFocused, keyboardDockOffset, measureKeyboardDockAnchors, showChartTradeSheet, syncKeyboardHeightFromMetrics]);
  useEffect(() => {
    if (
      Platform.OS !== 'android' ||
      !footerLotEditorFocused ||
      showChartTradeSheet ||
      keyboardVisibleHeight <= 0 ||
      keyboardDockOffset <= 0
    ) {
      return;
    }

    let cancelled = false;
    let rafId: number | null = null;
    let attempts = 0;

    const syncUntilDockSettles = () => {
      if (cancelled) {
        return;
      }

      attempts += 1;
      measureKeyboardDockAnchors(() => {
        const metrics = syncKeyboardHeightFromMetrics();
        if (cancelled || metrics.dockOffset <= 0 || attempts >= 16) {
          return;
        }

        rafId = requestAnimationFrame(syncUntilDockSettles);
      });
    };

    rafId = requestAnimationFrame(syncUntilDockSettles);

    return () => {
      cancelled = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [
    footerLotEditorFocused,
    keyboardDockOffset,
    keyboardVisibleHeight,
    measureKeyboardDockAnchors,
    showChartTradeSheet,
    syncKeyboardHeightFromMetrics,
  ]);
  // Do not auto-abort lot editing just because keyboard metrics are briefly 0.
  // That race closed the editor (and hid Sell/Lot/Buy) right as the keyboard
  // was opening. Commit only via blur/submit/chart-tap/finishFooterLotEditor.
  useEffect(() => {
    if (!footerLotEditorFocused || showChartTradeSheet) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      chartScrollRef.current?.scrollTo({ y: 0, animated: false });
    });

    return () => cancelAnimationFrame(frame);
  }, [footerLotEditorFocused, keyboardVisibleHeight, showChartTradeSheet]);

  useEffect(() => {
    if (showChartTradeSheet) {
      setFooterLotPickerMode(null);
      setFooterLotEditorFocused(false);
      setFooterLotEditorOpening(false);
      return;
    }
    setChartTradeCommentFocused(false);
    chartTradeCommentSubmitIntentRef.current = false;
  }, [showChartTradeSheet]);

  useEffect(() => {
    if (!showChartTradeSheet) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      chartTradeSheetScrollOffsetRef.current = 0;
      chartTradeSheetScrollRef.current?.scrollTo({ y: 0, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [showChartTradeSheet]);

  useEffect(() => {
    if (!showChartTradeSheet || chartTradeSheetMode === 'hidden') {
      chartTradeSheetLastVisibleOffsetRef.current = chartTradeSheetCollapsedTranslateY;
      chartTradeSheetTranslateY.value = chartTradeSheetHiddenTranslateY;
      chartTradeSheetDragStartY.value = chartTradeSheetCollapsedTranslateY;
      return;
    }

    const nextTranslateY = Math.min(
      chartTradeSheetCollapsedTranslateY,
      Math.max(chartTradeSheetExpandedTranslateY, chartTradeSheetLastVisibleOffsetRef.current),
    );
    chartTradeSheetTranslateY.value = nextTranslateY;
    chartTradeSheetDragStartY.value = nextTranslateY;
  }, [
    chartTradeSheetCollapsedTranslateY,
    chartTradeSheetDragStartY,
    chartTradeSheetExpandedTranslateY,
    chartTradeSheetHiddenTranslateY,
    chartTradeSheetLastVisibleOffsetRef,
    chartTradeSheetMode,
    chartTradeSheetTranslateY,
    showChartTradeSheet,
  ]);

  const chartTradeSheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: chartTradeSheetTranslateY.value }],
  }));

  const chartTradeSheetDragGesture = useMemo(
    () =>
      Gesture.Pan()
        // Slightly larger activation so body ScrollView vertical scrolls are
        // not stolen by the sheet-drag pan on the header region.
        .activeOffsetY([-10, 10])
        .failOffsetX([-20, 20])
        .onBegin(() => {
          chartTradeSheetDragStartY.value = chartTradeSheetTranslateY.value;
        })
        .onUpdate((event) => {
          chartTradeSheetTranslateY.value = Math.min(
            chartTradeSheetHiddenTranslateY,
            Math.max(
              chartTradeSheetExpandedTranslateY,
              chartTradeSheetDragStartY.value + event.translationY,
            ),
          );
        })
        .onEnd((event) => {
          const current = chartTradeSheetTranslateY.value;
          const hideOffsetThreshold = chartTradeSheetCollapsedTranslateY + 24;

          if (
            current > hideOffsetThreshold ||
            (event.velocityY > 900 && current > chartTradeSheetCollapsedTranslateY - 6)
          ) {
            runOnJS(snapTradeSheet)('hidden');
            return;
          }

          // Preserve the exact visible height chosen by the drag. Only the
          // narrow below-collapsed dismissal band settles back to collapsed.
          const restingOffset = Math.min(
            chartTradeSheetCollapsedTranslateY,
            Math.max(chartTradeSheetExpandedTranslateY, current),
          );

          chartTradeSheetTranslateY.value = withSpring(restingOffset, {
            damping: 30,
            stiffness: 320,
            mass: 0.7,
            overshootClamping: true,
          });
          chartTradeSheetDragStartY.value = restingOffset;
          runOnJS(commitChartTradeSheetOffset)(restingOffset);
        })
        .onFinalize(() => {
          chartTradeSheetDragStartY.value = chartTradeSheetTranslateY.value;
        }),
    [
      chartTradeSheetCollapsedTranslateY,
      commitChartTradeSheetOffset,
      chartTradeSheetDragStartY,
      chartTradeSheetExpandedTranslateY,
      chartTradeSheetHiddenTranslateY,
      chartTradeSheetTranslateY,
      snapTradeSheet,
    ],
  );

  const isPendingChartOrder = isPendingChartOrderType(chartTradeOrderType);
  // Keep one stable sheet shell across Market Execution and every pending tab.
  // Only the order-specific content should change when the user switches tabs.
  const useMtPendingTradeSheetLayout = false;
  const isStopLimitChartOrder = isStopLimitChartOrderType(chartTradeOrderType);
  // Keep auxiliary order metadata visible on every chart trade tab so
  // Market Execution and all pending-order variants share one consistent form.
  const showChartTradeExpiration = true;
  const showChartTradeComment = true;
  const chartTradeSheetSide = getChartOrderSide(chartTradeOrderType);
  const chartTradeEntryPrice = isPendingChartOrder
    ? chartTradePrice
    : chartTradeSheetSide === 'buy'
      ? chartAsk
      : chartBid;
  const newMarketOrderProtectionBackendLocked =
    isNewMarketOrderProtectionBackendLocked();
  const chartProtectionBackendLocked = chartDirectProtectionActive
    ? newMarketOrderProtectionBackendLocked
    : isChartTradeProtectionBackendLocked(chartTradeOrderType);
  const directMarketStopLossPrice =
    chartDirectProtectionActive &&
      !newMarketOrderProtectionBackendLocked &&
      chartTradeSlEnabled
      ? chartTradeSlPrice
      : undefined;
  const directMarketTakeProfitPrice =
    chartDirectProtectionActive &&
      !newMarketOrderProtectionBackendLocked &&
      chartTradeTpEnabled
      ? chartTradeTpPrice
      : undefined;
  const directMarketProtectionDraftId = chartDirectProtectionActive
    ? chartProtectionDraftIdRef.current ?? undefined
    : undefined;
  const chartTradeProtectionValidation = useMemo(() => (
    chartProtectionBackendLocked
      ? { valid: true as const, message: '' as const }
      : validateChartTradeProtectionLevels({
        side: chartTradeSheetSide,
        entryPrice: chartTradeEntryPrice,
        slEnabled: chartTradeSlEnabled,
        slPrice: chartTradeSlPrice,
        tpEnabled: chartTradeTpEnabled,
        tpPrice: chartTradeTpPrice,
        pointSize: chartProtectionTickSize ?? 0,
      })
  ), [
    chartProtectionBackendLocked,
    chartProtectionTickSize,
    chartTradeEntryPrice,
    chartTradeSheetSide,
    chartTradeSlEnabled,
    chartTradeSlPrice,
    chartTradeTpEnabled,
    chartTradeTpPrice,
  ]);
  const [stablePendingTradePlaceButtonEnabled, setStablePendingTradePlaceButtonEnabled] = useState(true);
  const pendingTradeValidationConfigKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isPendingChartOrder) {
      pendingTradeValidationConfigKeyRef.current = null;
      setStablePendingTradePlaceButtonEnabled(true);
      return;
    }

    const nextConfigKey = `${chartTradeOrderType}:${chartTradePrice}:${chartTradeStopLimitPrice}`;
    const shouldResetFromRawValidity = pendingTradeValidationConfigKeyRef.current !== nextConfigKey;
    const rawValidity = isPendingChartTradeValid({
      orderType: chartTradeOrderType,
      entryPrice: chartTradePrice,
      stopLimitPrice: chartTradeStopLimitPrice,
      bid: chartPendingLiveBid,
      ask: chartPendingLiveAsk,
      pointSize: chartPointSize,
    });

    setStablePendingTradePlaceButtonEnabled((previouslyEnabled) =>
      resolveStablePendingChartTradeEnabled({
        orderType: chartTradeOrderType,
        entryPrice: chartTradePrice,
        stopLimitPrice: chartTradeStopLimitPrice,
        bid: chartPendingLiveBid,
        ask: chartPendingLiveAsk,
        pointSize: chartPointSize,
        previouslyEnabled: shouldResetFromRawValidity ? rawValidity : previouslyEnabled,
      }),
    );

    pendingTradeValidationConfigKeyRef.current = nextConfigKey;
  }, [
    chartPendingLiveAsk,
    chartPendingLiveBid,
    chartPointSize,
    chartTradeOrderType,
    chartTradePrice,
    chartTradeStopLimitPrice,
    isPendingChartOrder,
  ]);

  const disablePendingTradePlaceButton = isPendingChartOrder
    ? chartPendingOrderSubmitting
    || !chartPendingQuoteAvailability.allowed
    || !stablePendingTradePlaceButtonEnabled
    || !chartTradeProtectionValidation.valid
    : false;
  const chartTradeCtaColor = chartTradeSheetSide === 'buy' ? BLUE : T.trading.sell.primary;
  const chartTradeMarginPerLot = useMemo(() => {
    const leverage = accountSummary?.leverage || 100;
    const contractSize = getChartTradeContractSize(chartSymbol);
    const referencePrice = chartTradeEntryPrice > 0 ? chartTradeEntryPrice : chartAsk;
    if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
      return 0;
    }
    return (contractSize * referencePrice) / leverage;
  }, [accountSummary?.leverage, chartAsk, chartSymbol, chartTradeEntryPrice]);
  const chartTradeMarginEstimate = useMemo(() => {
    if (!Number.isFinite(chartTradeMarginPerLot) || chartTradeMarginPerLot <= 0) {
      return 0;
    }
    return tradeVolume * chartTradeMarginPerLot;
  }, [chartTradeMarginPerLot, tradeVolume]);
  const applyChartTradePreviewDragPrice = useCallback(
    (dragKey: ChartTradePreviewDragKey, rawPrice: number) => {
      if (
        (!showChartTradeSheet && !chartDirectProtectionActive) ||
        !Number.isFinite(rawPrice) ||
        rawPrice <= 0
      ) {
        return;
      }

      const nextPrice = roundTradePrice(rawPrice);
      if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
        return;
      }

      switch (dragKey) {
        case 'entry':
          if (!isPendingChartOrder) {
            return;
          }
          setChartTradePrice((current) => (current === nextPrice ? current : nextPrice));
          return;
        case 'stopLimit':
          if (!isStopLimitChartOrder) {
            return;
          }
          setChartTradeStopLimitPrice((current) => (current === nextPrice ? current : nextPrice));
          return;
        case 'sl':
          if (!chartTradeSlEnabled) {
            return;
          }
          setChartTradeSlPrice((current) => (current === nextPrice ? current : nextPrice));
          return;
        case 'tp':
          if (!chartTradeTpEnabled) {
            return;
          }
          setChartTradeTpPrice((current) => (current === nextPrice ? current : nextPrice));
          return;
      }
    },
    [
      chartTradeSlEnabled,
      chartTradeTpEnabled,
      chartDirectProtectionActive,
      isPendingChartOrder,
      isStopLimitChartOrder,
      roundTradePrice,
      showChartTradeSheet,
    ],
  );
  const clearChartPositionStopDragPreview = useCallback((
    dragKey: string,
    expectedPrice?: number,
  ) => {
    setChartPositionStopDragPreviews((current) => {
      if (!Object.prototype.hasOwnProperty.call(current, dragKey)) {
        return current;
      }
      if (
        expectedPrice !== undefined &&
        current[dragKey] !== expectedPrice
      ) {
        // A newer drag for the same ticket/kind has already replaced this
        // request. Its visual draft must survive the older job settling.
        return current;
      }
      const next = { ...current };
      delete next[dragKey];
      return next;
    });
  }, []);
  const commitChartPositionStopDrag = useCallback(
    (target: ChartPositionStopDragTarget, rawPrice: number) => {
      const dragKey = buildChartPositionStopDragKey(target.positionId, target.kind);
      const nextPrice = roundTradePrice(rawPrice);
      if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
        clearChartPositionStopDragPreview(dragKey);
        return;
      }

      const latestPositions = usePositionsState.getState().positions;
      const position = latestPositions.find((item) => String(item.id) === target.positionId)
        ?? positions.find((item) => String(item.id) === target.positionId);
      if (!position) {
        const feedback = createFrontendTradingError(
          'Position Not Found',
          'The selected position is no longer open. Refresh positions and try again.',
        );
        setTradeFeedback({ visible: true, type: 'error', title: feedback.title, message: feedback.message });
        clearChartPositionStopDragPreview(dragKey);
        return;
      }

      const previousSl = Number(position.sl) > 0 ? Number(position.sl) : 0;
      const previousTp = Number(position.tp) > 0 ? Number(position.tp) : 0;
      const requestedSl = target.kind === 'sl' ? nextPrice : previousSl;
      const requestedTp = target.kind === 'tp' ? nextPrice : previousTp;
      const accepted = commitChartPositionStopLevels(
        position.id,
        requestedSl,
        requestedTp,
        () => clearChartPositionStopDragPreview(dragKey, nextPrice),
      );
      if (!accepted) {
        clearChartPositionStopDragPreview(dragKey, nextPrice);
      }
    },
    [
      clearChartPositionStopDragPreview,
      commitChartPositionStopLevels,
      positions,
      roundTradePrice,
    ],
  );
  const handleChartPositionStopDragMessage = useCallback(
    (msg: any) => {
      const target = parseChartPositionStopDragKey(msg?.dragKey);
      if (!target) {
        return false;
      }
      // A stale WebView payload may still contain a position drag key from
      // before a broker/capability transition. Consume it without changing
      // local state or reaching the mutation path while modification is locked.
      if (existingPositionModifyBackendLocked) {
        return true;
      }

      if (msg?.phase === 'start') {
        clearChartDirectProtectionDraft();
        closeChartTapMenu();
        if (selectedChartPositionTicket !== target.positionId) {
          handleSelectChartPositionTicket(target.positionId);
        }
      }

      const phase = msg?.phase;
      if (phase !== 'start' && phase !== 'move' && phase !== 'end') {
        return true;
      }

      const nextPrice = typeof msg?.price === 'number' ? msg.price : NaN;
      if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
        return true;
      }

      const roundedNextPrice = roundTradePrice(nextPrice);
      const dragPreviewKey = buildChartPositionStopDragKey(
        target.positionId,
        target.kind,
      );
      setChartPositionStopDragPreviews((current) => (
        current[dragPreviewKey] === roundedNextPrice
          ? current
          : { ...current, [dragPreviewKey]: roundedNextPrice }
      ));

      if (String(chartTradePositionStopTarget?.id) === target.positionId) {
        if (target.kind === 'sl') {
          setChartTradeSlEnabled(true);
          setChartTradeSlPrice(roundedNextPrice);
        } else {
          setChartTradeTpEnabled(true);
          setChartTradeTpPrice(roundedNextPrice);
        }
      }

      if (phase === 'end') {
        commitChartPositionStopDrag(target, nextPrice);
      }

      return true;
    },
    [
      chartTradePositionStopTarget?.id,
      clearChartDirectProtectionDraft,
      closeChartTapMenu,
      commitChartPositionStopDrag,
      existingPositionModifyBackendLocked,
      handleSelectChartPositionTicket,
      roundTradePrice,
      selectedChartPositionTicket,
    ],
  );
  const handleChartTradePreviewDragMessage = useCallback(
    (msg: any) => {
      const dragKey = msg?.dragKey;
      if (dragKey !== 'entry' && dragKey !== 'stopLimit' && dragKey !== 'sl' && dragKey !== 'tp') {
        return;
      }
      if ((dragKey === 'sl' || dragKey === 'tp') && chartProtectionBackendLocked) {
        return;
      }

      if (msg?.phase === 'start') {
        closeChartTapMenu();
      }

      const nextPrice = typeof msg?.price === 'number' ? msg.price : NaN;
      if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
        return;
      }

      const phase = msg?.phase;
      if (phase !== 'start' && phase !== 'move' && phase !== 'end') {
        return;
      }

      applyChartTradePreviewDragPrice(dragKey, nextPrice);
    },
    [applyChartTradePreviewDragPrice, chartProtectionBackendLocked, closeChartTapMenu],
  );
  const accountFreeMargin = Number((accountSummary as any)?.freeMargin ?? (accountSummary as any)?.free_margin ?? 0);
  const accountBalance = Number(liveAccountBalance > 0 ? liveAccountBalance : ((accountSummary as any)?.balance ?? 0));
  const chartTradeMaxVolume = useMemo(
    () => resolveMaxTradeVolumeForMargin(accountFreeMargin, chartTradeMarginPerLot, tradeVolumeBounds),
    [accountFreeMargin, chartTradeMarginPerLot, tradeVolumeBounds],
  );
  const chartTradeMaxVolumeDisplay = useMemo(
    () => (chartTradeMaxVolume > 0 ? formatLooseTradeVolumeLabel(chartTradeMaxVolume, tradeVolumeBounds) : '0'),
    [chartTradeMaxVolume, tradeVolumeBounds],
  );
  // The comment editor is always inline inside the trade sheet ScrollView.
  // No floating/detached comment editor – the ScrollView auto-scrolls to
  // keep the focused TextInput visible, and keyboard compensation keeps
  // the trade sheet at its full height on Android.
  const showFloatingChartTradeCommentEditor = false;
  const floatingChartTradeCommentOffset = 0;
  // Freeze host/viewport height while the lot keyboard or trade sheet inputs
  // are active so the horizontal candle chart does not blink/shrink on either
  // platform (Android adjustResize + iOS keyboard layout animation).
  const shouldFreezeChartTradeSheetHostHeight =
    showChartTradeSheet &&
    (chartTradeCommentFocused || footerLotEditorFocused || keyboardVisibleHeight > 0);
  const shouldFreezeFooterLotChartViewport =
    !showChartTradeSheet &&
    (footerLotEditorFocused || footerLotEditorOpening || keyboardVisibleHeight > 0);
  const shouldFreezeChartViewportResize =
    shouldFreezeChartTradeSheetHostHeight || shouldFreezeFooterLotChartViewport;
  // When the keyboard is visible and the freeze is active, give the overlay
  // layer an explicit fixed height equal to the frozen host height. This
  // makes the layer independent of parent bounds (which shrink due to
  // adjustResize). When the keyboard is not visible, use 0 to signal
  // "use absoluteFill as normal".
  const chartTradeSheetFrozenLayerHeight =
    shouldFreezeChartTradeSheetHostHeight && chartTradeSheetPresentationHostHeight > 0
      ? chartTradeSheetPresentationHostHeight
      : 0;
  const chartTradeSheetFooterDockReserve = 0;
  const chartTradeSheetContentBottomPadding = (
    safeInsets.bottom +
    chartTradeSheetFooterDockReserve +
    (keyboardInset > 0 ? keyboardInset + 16 : 14)
  );
  const {
    shouldMountFloatingFooterTradeRow,
    isFloatingFooterTradeRowVisible,
    footerTradeRowKeyboardOffset,
  } = resolveFooterTradeRowState({
    platform: Platform.OS,
    footerLotEditorFocused,
    footerLotEditorOpening,
    showChartTradeSheet,
    keyboardVisibleHeight,
    keyboardDockOffset,
    keyboardResizesHost: androidFooterHostResizedForKeyboard,
  });
  const shouldHideChartTabBarForInlineInput = shouldHideChartTabBarForTradeInput({
    showChartTradeSheet,
    chartTradeCommentFocused,
  });
  const floatingFooterTradeReserveHeight = useSharedValue(0);
  const floatingFooterTradeReserveAnimatedStyle = useAnimatedStyle(() => ({
    minHeight: floatingFooterTradeReserveHeight.value,
  }));
  const frozenFooterLotChartViewportStyle =
    shouldFreezeFooterLotChartViewport && chartTapMenuBounds.height > 0
      ? { minHeight: chartTapMenuBounds.height }
      : null;
  const accountCurrency = accountSummary?.currency || 'USD';
  const isChartTradeMarginMode = chartTradeVolumeDisplayMode === 'margin';
  const chartTradeVolumePrimaryDisplay = isChartTradeMarginMode
    ? `${fmt.price(chartTradeMarginEstimate)} ${accountCurrency}`
    : passiveLotDisplay;
  const chartTradeVolumeModeLabel = isChartTradeMarginMode ? 'Margin' : 'Lots';
  const handleToggleChartTradeVolumeDisplayMode = useCallback(() => {
    runImmediateAction('chart.tradeSheet.volumeDisplay.toggle', () => {
      const nextMode: ChartTradeVolumeDisplayMode =
        chartTradeVolumeDisplayMode === 'margin'
          ? 'lots'
          : 'margin';
      setChartTradeVolumeDisplayMode(nextMode);
    });
  }, [chartTradeVolumeDisplayMode, setChartTradeVolumeDisplayMode]);
  const chartTradeStopUnitOptions = useMemo(() => {
    if (!isPendingChartOrder) {
      return [
        { key: 'Price' as const, label: 'Price' },
        { key: 'Pips' as const, label: 'Pips' },
      ];
    }

    return [
      { key: 'Price' as const, label: 'Price' },
      { key: 'Pips' as const, label: 'Pips' },
      { key: 'Currency' as const, label: 'Currency' },
    ];
  }, [isPendingChartOrder]);
  useEffect(() => {
    if (!isPendingChartOrder && chartTradeStopUnit === 'Currency') {
      setChartTradeStopUnit('Price');
    }
  }, [chartTradeStopUnit, isPendingChartOrder]);
  useEffect(() => {
    if (!showChartTradeComment) {
      setChartTradeCommentFocused(false);
      chartTradeCommentSubmitIntentRef.current = false;
    }
  }, [showChartTradeComment]);
  // When expiration visibility toggles off (e.g. order type changed), no need
  // to call hideActionSheet() — the global sheet manages its own lifecycle.
  useEffect(() => {
    setChartInlineInputActive(shouldHideChartTabBarForInlineInput);
    return () => {
      setChartInlineInputActive(false);
    };
  }, [setChartInlineInputActive, shouldHideChartTabBarForInlineInput]);
  useEffect(() => {
    setChartTabBarKeyboardLift(chartTabBarKeyboardLift);
    return () => {
      setChartTabBarKeyboardLift(0);
    };
  }, [chartTabBarKeyboardLift, setChartTabBarKeyboardLift]);
  useEffect(() => {
    floatingFooterTradeReserveHeight.value = withTiming(
      isFloatingFooterTradeRowVisible ? CHART_TRADE_INLINE_FOOTER_FALLBACK_HEIGHT : 0,
      {
        duration: 220,
      },
    );
  }, [floatingFooterTradeReserveHeight, isFloatingFooterTradeRowVisible]);
  const showChartTradePreviewLinesOnChart = shouldShowChartTradePreviewOnChart({
    showChartTradeSheet,
    chartTradeSheetMode,
    directProtectionActive: chartDirectProtectionActive,
  });
  const showChartTradeSheetHeader = shouldShowChartTradeSheetHeader({
    chartTradeSheetMode,
  });
  const showChartTradeStopLabelsOnChart = showChartTradePreviewLinesOnChart;
  const chartTradePreviewEntryLabel = useMemo(() => {
    if (!showChartTradePreviewLinesOnChart || !isPendingChartOrder) {
      return '';
    }

    return `${chartTradeOrderType.toUpperCase()} ${formatTradeVolume(tradeVolume, tradeVolumeBounds)}`.trim();
  }, [chartTradeOrderType, isPendingChartOrder, showChartTradePreviewLinesOnChart, tradeVolume, tradeVolumeBounds]);
  const chartTradePreviewLines = useMemo<ChartOverlayPriceLine[]>(() => {
    if (!showChartTradePreviewLinesOnChart) {
      return [];
    }

    const entryPrice = chartTradeEntryPrice;
    if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
      return [];
    }

    const previewLines: ChartOverlayPriceLine[] = [];
    const pendingEntryColor = isDark ? '#94A3B8' : '#475569';
    const previewPositionTarget = chartDirectProtectionActive
      ? null
      : chartTradePositionStopTarget;
    const previewSide = previewPositionTarget?.side ?? chartTradeSheetSide;
    const positionHasSl =
      !isPendingChartOrder &&
      Number(previewPositionTarget?.sl) > 0;
    const positionHasTp =
      !isPendingChartOrder &&
      Number(previewPositionTarget?.tp) > 0;
    const chartTradeSlDragKey = chartProtectionBackendLocked
      ? undefined
      : previewPositionTarget
        ? buildChartPositionStopDragKey(previewPositionTarget.id, 'sl')
        : 'sl';
    const chartTradeTpDragKey = chartProtectionBackendLocked
      ? undefined
      : previewPositionTarget
        ? buildChartPositionStopDragKey(previewPositionTarget.id, 'tp')
        : 'tp';

    if (isPendingChartOrderType(chartTradeOrderType)) {
      previewLines.push({
        id: 'chart-trade-entry-preview',
        price: entryPrice,
        color: pendingEntryColor,
        lineWidth: 1,
        lineStyle: CHART_LINE_STYLE.Solid,
        axisLabelVisible: false,
        title: chartTradePreviewEntryLabel,
        dragKey: 'entry',
      });
    }

    if (isStopLimitChartOrder && Number.isFinite(chartTradeStopLimitPrice) && chartTradeStopLimitPrice > 0) {
      previewLines.push({
        id: 'chart-trade-stop-limit-preview',
        price: chartTradeStopLimitPrice,
        color: BLUE,
        lineWidth: 1,
        lineStyle: CHART_LINE_STYLE.Solid,
        axisLabelVisible: false,
        title: showChartTradeStopLabelsOnChart
          ? `STOP LIMIT ${formatTradeVolume(tradeVolume, tradeVolumeBounds)}`
          : '',
        dragKey: 'stopLimit',
      });
    }

    if (!positionHasTp && chartTradeTpEnabled && Number.isFinite(chartTradeTpPrice) && chartTradeTpPrice > 0) {
      const tpValueLabel = formatTpSlOverlayValueLabel(
        chartSymbol,
        previewSide,
        entryPrice,
        chartTradeTpPrice,
        tradeVolume,
      );
      const tpColor = resolvedChartColors.tradeTpSl || T.trading.profit;
      previewLines.push({
        id: 'chart-trade-tp-preview',
        price: chartTradeTpPrice,
        color: tpColor,
        lineWidth: 2,
        lineStyle: CHART_LINE_STYLE.Solid,
        axisLabelVisible: false,
        title: showChartTradeStopLabelsOnChart
          ? formatTpSlOverlayLabel(
            'tp',
            chartSymbol,
            previewSide,
            entryPrice,
            chartTradeTpPrice,
            tradeVolume,
          ).replace(' USD', ` ${accountCurrency}`)
          : '',
        labelSideText: showChartTradeStopLabelsOnChart ? 'TP' : undefined,
        labelValueText: showChartTradeStopLabelsOnChart
          ? tpValueLabel.replace(' USD', ` ${accountCurrency}`)
          : undefined,
        labelSideColor: tpColor,
        labelValueColor: tpColor,
        labelPlacement: 'line',
        // The ticker/OHLC overlay occupies the top ~78 CSS px of the native
        // WebView. Keep only this draft label readable there; persisted trade
        // labels continue to follow their exact price coordinate off-screen.
        labelMinTop: chartDisplay.showTicker || chartDisplay.showOHLC ? 78 : undefined,
        dragKey: chartTradeTpDragKey,
      });
    }

    if (!positionHasSl && chartTradeSlEnabled && Number.isFinite(chartTradeSlPrice) && chartTradeSlPrice > 0) {
      const slValueLabel = formatTpSlOverlayValueLabel(
        chartSymbol,
        previewSide,
        entryPrice,
        chartTradeSlPrice,
        tradeVolume,
      );
      const slColor = resolvedChartColors.tradeStopOut || '#F23645';
      previewLines.push({
        id: 'chart-trade-sl-preview',
        price: chartTradeSlPrice,
        color: slColor,
        lineWidth: 2,
        lineStyle: CHART_LINE_STYLE.Solid,
        axisLabelVisible: false,
        title: showChartTradeStopLabelsOnChart
          ? formatTpSlOverlayLabel(
            'sl',
            chartSymbol,
            previewSide,
            entryPrice,
            chartTradeSlPrice,
            tradeVolume,
          ).replace(' USD', ` ${accountCurrency}`)
          : '',
        labelSideText: showChartTradeStopLabelsOnChart ? 'SL' : undefined,
        labelValueText: showChartTradeStopLabelsOnChart
          ? slValueLabel.replace(' USD', ` ${accountCurrency}`)
          : undefined,
        labelSideColor: slColor,
        labelValueColor: slColor,
        labelPlacement: 'line',
        labelMinTop: chartDisplay.showTicker || chartDisplay.showOHLC ? 78 : undefined,
        dragKey: chartTradeSlDragKey,
      });
    }

    return previewLines;
  }, [
    BLUE,
    T.trading.sell.primary,
    accountCurrency,
    chartProtectionBackendLocked,
    chartDirectProtectionActive,
    chartTradePreviewEntryLabel,
    chartSymbol,
    chartTradeEntryPrice,
    chartTradeOrderType,
    chartTradePositionStopTarget,
    chartTradeSheetSide,
    chartTradeSlEnabled,
    chartTradeSlPrice,
    chartTradeStopLimitPrice,
    chartTradeTpEnabled,
    chartTradeTpPrice,
    isPendingChartOrderType,
    isStopLimitChartOrder,
    isDark,
    resolvedChartColors.tradeStopOut,
    resolvedChartColors.tradeTpSl,
    showChartTradeStopLabelsOnChart,
    showChartTradePreviewLinesOnChart,
    tradeVolume,
    tradeVolumeBounds,
  ]);
  const chartWindowProtectionPriceLinesByPane = useMemo(() => {
    const protectionLines = chartTradePreviewLines.filter(
      (line) => line.id === 'chart-trade-sl-preview' || line.id === 'chart-trade-tp-preview',
    );
    if (!chartDirectProtectionActive || protectionLines.length === 0) {
      return Object.freeze({});
    }
    const ownerPaneId = chartDirectProtectionOwnerPaneIdRef.current;
    return Object.freeze(Object.fromEntries(
      chartWindows.state.panes.map((pane) => [
        pane.id,
        (
          (ownerPaneId === null || ownerPaneId === pane.id)
          && getChartDrawingBucketKey(pane.symbol) === getChartDrawingBucketKey(chartSymbol)
        )
          ? protectionLines
          : [],
      ]),
    ));
  }, [
    chartDirectProtectionActive,
    chartSymbol,
    chartTradePreviewLines,
    chartWindows.state.panes,
  ]);

  const chartType = chartVisualType;
  const chartDataContextSig = useMemo(
    () => `${chartMarketDataCacheNamespace}:${chartSymbol}:${normalizeTimeframe(chartTimeframe)}`,
    [chartMarketDataCacheNamespace, chartSymbol, chartTimeframe],
  );
  const chartMarketDataCacheNamespaceRef = useRef(chartMarketDataCacheNamespace);
  chartMarketDataCacheNamespaceRef.current = chartMarketDataCacheNamespace;
  const chartManualPriceScaleContextSigRef = useRef(chartDataContextSig);
  if (chartManualPriceScaleContextSigRef.current !== chartDataContextSig) {
    // A numeric price window belongs to one exact market-data context. Keeping
    // a 185.xx range while switching to a 1.96xx symbol makes valid candles
    // render completely off-screen and looks like a missing chart.
    chartManualPriceScaleContextSigRef.current = chartDataContextSig;
    chartManualPriceScaleRef.current = null;
  }
  const chartDataContextEpochRef = useRef({ contextKey: chartDataContextSig, epoch: 0 });
  if (chartDataContextEpochRef.current.contextKey !== chartDataContextSig) {
    chartDataContextEpochRef.current = {
      contextKey: chartDataContextSig,
      epoch: chartDataContextEpochRef.current.epoch + 1,
    };
  }
  const chartDataContextEpoch = chartDataContextEpochRef.current.epoch;
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activeDateRange, setActiveDateRange] = useState<ChartTimeRange>('auto');
  const [customDateValue, setCustomDateValue] = useState<Date | null>(null);
  const areaChartDirection = useMemo(
    () => resolveAreaChartDirectionForRange({
      range: activeDateRange,
      points: sanitizedCandles,
      customDateValue,
      dailyChangePct: chartDailyDirectionQuote?.changePct ?? chartLiveQuote?.changePct,
    }),
    [
      activeDateRange,
      chartDailyDirectionQuote?.changePct,
      chartLiveQuote?.changePct,
      customDateValue,
      sanitizedCandles,
    ],
  );
  const areaDirectionRangeKey = activeDateRange === 'custom'
    ? `custom:${customDateValue?.getTime() ?? 'unset'}`
    : activeDateRange;
  const [webViewReady, setWebViewReady] = useState(false);
  const [chartWebViewGeneration, setChartWebViewGeneration] = useState(0);
  const chartWebViewGenerationRef = useRef(chartWebViewGeneration);
  chartWebViewGenerationRef.current = chartWebViewGeneration;
  const pendingChartWebViewRecoveryRef = useRef(false);
  const lastRecoveredChartWebViewGenerationRef = useRef<number | null>(null);
  const chartVisualShellSigRef = useRef('');
  const paintedChartContextLruRef = useRef(new Map<string, {
    generation: number;
    visualShellSig: string;
    displayDecimals: number;
  }>());
  const preactivatedChartContextRef = useRef({
    dataContextSig: '',
    paintToken: '',
    generation: -1,
    visualShellSig: '',
  });
  const chartContextActivationRequestRevisionRef = useRef(0);
  const pendingChartContextActivationRef = useRef<{
    requestId: number;
    sourceDataContextSig: string;
    dataContextSig: string;
    paintToken: string;
    generation: number;
    visualShellSig: string;
    cacheNamespace: string;
    brokerSessionScoped: boolean;
    displayDecimals: number;
    timeout: ReturnType<typeof setTimeout>;
    commit: (activated: boolean) => void;
  } | null>(null);
  const deferredChartContextFullReplacementRef = useRef('');
  const [chartContextReplacementReplayRevision, setChartContextReplacementReplayRevision] =
    useState(0);
  const requestWarmChartContextActivationImplementationRef = useRef<(
    nextSymbol: string,
    nextTimeframe: string,
    commit: (activated: boolean) => void,
  ) => boolean>(() => false);
  const cancelPendingChartContextActivation = useCallback(() => {
    chartContextActivationRequestRevisionRef.current += 1;
    const pending = pendingChartContextActivationRef.current;
    pendingChartContextActivationRef.current = null;
    if (pending) {
      clearTimeout(pending.timeout);
      if (
        deferredChartContextFullReplacementRef.current === pending.sourceDataContextSig
      ) {
        deferredChartContextFullReplacementRef.current = '';
        // Re-run the normal replacement effect after React settles the canceling
        // action. If this cancellation also selects another symbol, the replay is
        // naturally scoped to that newly committed context instead of B.
        if (isScreenFocusedRef.current) {
          setChartContextReplacementReplayRevision((revision) => revision + 1);
        }
      }
    }
    preactivatedChartContextRef.current = {
      dataContextSig: '',
      paintToken: '',
      generation: -1,
      visualShellSig: '',
    };
  }, []);
  const shouldDeferOutgoingChartContextFullReplacement = useCallback((
    dataContextSig: string,
  ) => {
    const pending = pendingChartContextActivationRef.current;
    if (!pending || pending.sourceDataContextSig !== dataContextSig) {
      return false;
    }
    // Once the activation token is allocated, no newer source-context paint
    // revision may overtake it in the WebView. The target commit or a canceled
    // activation will run the normal replacement effect for the surviving context.
    deferredChartContextFullReplacementRef.current = dataContextSig;
    return true;
  }, []);
  const chartWebViewPaintStallRecoveryRef = useRef({
    dataContextSig: '',
    dataContextEpoch: -1,
    attemptCount: 0,
  });
  const [chartCanvasReady, setChartCanvasReady] = useState(false);
  const [chartSurfaceRecoveryExhausted, setChartSurfaceRecoveryExhausted] = useState(false);
  const [hasPaintedChartOnce, setHasPaintedChartOnce] = useState(false);
  const [lastPaintedChartDataContextSig, setLastPaintedChartDataContextSig] = useState('');
  const [lastPaintedChartDataContextEpoch, setLastPaintedChartDataContextEpoch] = useState(-1);
  const requestChartDrawingSyncForObjects = useCallback((onReady: () => void) => {
    if (!webViewRef.current || !webViewReady || !chartCanvasReady) {
      return false;
    }

    const requestId = nextObjectsDrawingSyncRequestIdRef.current + 1;
    nextObjectsDrawingSyncRequestIdRef.current = requestId;
    pendingObjectsDrawingSyncRef.current = { onReady, requestId };
    webViewRef.current.injectJavaScript(`
      try {
        if (typeof publishSerializedDrawings === 'function') {
          publishSerializedDrawings();
        }
      } finally {
        if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === 'function') {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'DRAWINGS_SYNCED_FOR_OBJECTS',
            requestId: ${requestId}
          }));
        }
      }
      true;
    `);
    setTimeout(() => {
      const pendingRequest = pendingObjectsDrawingSyncRef.current;
      if (!pendingRequest || pendingRequest.requestId !== requestId) {
        return;
      }
      pendingObjectsDrawingSyncRef.current = null;
      pendingRequest.onReady();
    }, 700);
    return true;
  }, [chartCanvasReady, webViewReady]);

  const hasCandles = sanitizedCandles.length > 0;
  const timeRangeCandlesRef = useRef(sanitizedCandles);
  useEffect(() => {
    timeRangeCandlesRef.current = sanitizedCandles;
  }, [sanitizedCandles]);
  // Keep the O/H/L/C row tied to the newest live candle under the symbol picker.
  // Crosshair messages can point at an older inspected candle, so they should not
  // hold this header row back while bid/ask ticks are moving.
  const chartMetaLiveLastCandle = sanitizedCandles.length > 0 ? sanitizedCandles[sanitizedCandles.length - 1] : null;
  // The retained WebView can already be painting the canonical engine while
  // the focus-gated React snapshot above is still empty on the first Chart
  // reveal. Read the same engine snapshot as a render-time fallback so the
  // first visible O/H/L/C row matches the candle already shown by the chart.
  const chartMetaCanonicalCandles =
    !chartMetaLiveLastCandle && chartMarketDataCacheNamespace
      ? readRenderableCanonicalCandles()
      : EMPTY_DISPLAY_CANDLES;
  const chartMetaCanonicalLastCandle = chartMetaCanonicalCandles.length > 0
    ? chartMetaCanonicalCandles[chartMetaCanonicalCandles.length - 1]
    : null;
  const chartMetaLastCandle = chartMetaLiveLastCandle ?? chartMetaCanonicalLastCandle;
  const chartMetaNeutralColor = isDark ? CHART_OHLC_NEUTRAL_DARK_COLOR : CHART_OHLC_NEUTRAL_LIGHT_COLOR;
  // Always reserve the row when enabled so it never pops in after the first
  // candle. Renko hides it because a price brick does not represent one
  // source timeframe's open/high/low/close values.
  const showChartMetaRow = chartDisplay.showOHLC && chartType !== 'renko';
  const showChartVolumePane = chartViewportShowVolumePane;
  const showChartDrawingToolbar = isChartExpanded && chartViewportShowDrawingToolbar;
  const overlayCandles = sanitizedBackendCandles.length > 0 ? sanitizedBackendCandles : sanitizedCandles;
  const overlayMarkerCandleTimeSignature = useMemo(
    () => buildChartMarkerCandleTimeSignature(overlayCandles),
    [overlayCandles],
  );
  const retainedOverlayMarkerCandlesRef = useRef({
    signature: '',
    candles: EMPTY_DISPLAY_CANDLES,
  });
  if (retainedOverlayMarkerCandlesRef.current.signature !== overlayMarkerCandleTimeSignature) {
    retainedOverlayMarkerCandlesRef.current = {
      signature: overlayMarkerCandleTimeSignature,
      candles: overlayCandles,
    };
  }
  // Pattern recognition consumes OHLC bodies and may update with the forming
  // candle. Closed-trade markers consume only candle times, so retain their
  // input through close/high/low ticks within the same bucket.
  const overlayMarkerCandles = activeTool === 'patterns'
    ? overlayCandles
    : retainedOverlayMarkerCandlesRef.current.candles;
  const applyNativeTimeRange = useCallback((
    range: ChartTimeRange,
    nextCustomDateValue?: Date | null,
    resetPriceScale = false,
  ) => {
    if (resetPriceScale) {
      chartManualPriceScaleRef.current = null;
    }
    const visibleCandles = timeRangeCandlesRef.current;
    if (!webViewReady || !chartCanvasReady || visibleCandles.length === 0) {
      return;
    }

    if (range === 'auto') {
      injectChartScript(`
        try {
          if (typeof window.__rtx5ApplyRecentViewport === 'function') {
            window.__rtx5ApplyRecentViewport();
          } else if (chart && chart.timeScale) {
            chart.timeScale().fitContent();
            if (typeof chart.timeScale().scrollToRealTime === 'function') {
              chart.timeScale().scrollToRealTime();
            }
          }
          if (${resetPriceScale} && typeof window.__rtx5ResetPriceScale === 'function') {
            window.__rtx5ResetPriceScale();
          }
        } catch (_) {}
      `);
      return;
    }

    if (range === 'all') {
      injectChartScript(`
        try {
          if (typeof window.__rtx5ResetTimeScale === 'function') {
            window.__rtx5ResetTimeScale();
          }
          if (chart && chart.timeScale) {
            chart.timeScale().fitContent();
            if (typeof chart.timeScale().scrollToRealTime === 'function') {
              chart.timeScale().scrollToRealTime();
            }
          }
          if (${resetPriceScale} && typeof window.__rtx5ResetPriceScale === 'function') {
            window.__rtx5ResetPriceScale();
          }
        } catch (_) {}
      `);
      return;
    }

    const visibleRange = resolveChartVisibleRange(range, visibleCandles, nextCustomDateValue ?? customDateValue);
    if (!visibleRange) {
      return;
    }

    injectChartScript(`
        try {
          if (typeof window.__rtx5ResetTimeScale === 'function') {
            window.__rtx5ResetTimeScale();
          }
          if (chart && chart.timeScale && typeof chart.timeScale().setVisibleRange === 'function') {
            chart.timeScale().setVisibleRange({
              from: ${visibleRange.from},
              to: ${visibleRange.to},
            });
          }
          if (${resetPriceScale} && typeof window.__rtx5ResetPriceScale === 'function') {
            window.__rtx5ResetPriceScale();
          }
        } catch (_) {}
      `);
  }, [chartCanvasReady, customDateValue, webViewReady]);


  const handleCustomDateRange = useCallback((selectedDate: Date) => {
    setCustomDateValue(selectedDate);
    setActiveDateRange('custom');
    setShowDatePicker(false);
    applyNativeTimeRange('custom', selectedDate);
  }, [applyNativeTimeRange]);

  const handleResetChartViewport = useCallback(() => {
    runImmediateAction('chart.viewport.reset', () => {
      hideActionSheet();
      closeChartTapMenu();
      if (routeChartWindowViewportCommand('resetViewport')) {
        applyNativeTimeRange(activeDateRange, customDateValue, true);
      }
    });
  }, [
    activeDateRange,
    applyNativeTimeRange,
    closeChartTapMenu,
    customDateValue,
    hideActionSheet,
    routeChartWindowViewportCommand,
  ]);
  const resetChartActionSheetContext = useCallback(() => {
    closeChartTapMenu();
    setFooterLotPickerMode(null);
    setFooterLotEditorFocused(false);
    setChartTradeCommentFocused(false);
    // Keyboard.dismiss() is a native bridge call that can take 10-50ms on
    // Android. Defer it so it never blocks showActionSheet on the same frame.
    setTimeout(() => Keyboard.dismiss(), 0);
  }, [closeChartTapMenu]);
  const scheduleChartActionSheetContextReset = useCallback(() => {
    scheduleAfterFirstFrame(resetChartActionSheetContext);
  }, [resetChartActionSheetContext]);
  const prefetchChartTimeframeHistory = useCallback((nextSymbol: string, nextTimeframe: string) => {
    return liveCandlesEngine.prefetchHistory(nextSymbol, nextTimeframe);
  }, []);
  const refreshSelectedChartHistory = useCallback((nextSymbol: string, nextTimeframe: string) => {
    void liveCandlesEngine.prefetchHistory(nextSymbol, nextTimeframe);
    liveCandlesEngine.refreshHistoryForContext(nextSymbol, nextTimeframe);
  }, []);
  const startupChartPrefetchKeyRef = useRef('');

  useEffect(() => {
    if (!marketDemandAllowed || !preferencesHydrated || !chartSymbol || !chartTimeframe) {
      return undefined;
    }

    const normalizedTimeframe = normalizeTimeframe(chartTimeframe);
    if (isPublicDemoMarket) {
      const startupPrefetchKey =
        `${ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE}:${chartSymbol}:${normalizedTimeframe}`;
      if (startupChartPrefetchKeyRef.current === startupPrefetchKey) {
        return undefined;
      }

      // This is a one-shot, shared REST warm-up only. It does not attach the
      // public candle socket or wake the retained Chart React tree behind
      // Quotes; the focused hook consumes the cached baseline synchronously.
      return scheduleIdleWork(
        () => {
          // Do not mark a callback that was cancelled before dispatch as
          // completed. The next effect pass must be able to reschedule it.
          startupChartPrefetchKeyRef.current = startupPrefetchKey;
          void prefetchChartSelectionHistory(chartSymbol, normalizedTimeframe);
        },
        {
          delayMs: PUBLIC_CHART_HISTORY_STARTUP_PREFETCH_DELAY_MS,
          timeoutMs: PUBLIC_CHART_HISTORY_STARTUP_PREFETCH_TIMEOUT_MS,
        },
      );
    }

    if (
      !isLoggedIn ||
      !activeChartSessionCacheNamespace ||
      !chartSymbol ||
      !chartTimeframe
    ) {
      return undefined;
    }

    const startupPrefetchKey =
      `${activeChartSessionCacheNamespace}:${chartSymbol}:${normalizedTimeframe}`;
    if (startupChartPrefetchKeyRef.current === startupPrefetchKey) {
      return undefined;
    }
    startupChartPrefetchKeyRef.current = startupPrefetchKey;

    // Prefetch chart history as soon as the Chart tree mounts (not after an
    // extra paint frame) so the first Chart visit has candles ready sooner.
    void prefetchChartTimeframeHistory(chartSymbol, normalizedTimeframe).catch((error) => {
      if (typeof __DEV__ !== 'undefined' && __DEV__ && CHART_BRIDGE_DEBUG) {
        console.log('[CHART-BRIDGE] startup_history_prefetch_failed', {
          symbol: chartSymbol,
          timeframe: normalizedTimeframe,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });
    return undefined;
  }, [
    activeChartSessionCacheNamespace,
    chartSymbol,
    chartTimeframe,
    isPublicDemoMarket,
    isLoggedIn,
    marketDemandAllowed,
    preferencesHydrated,
    prefetchChartTimeframeHistory,
  ]);

  const chartContextCommitScheduler = useMemo(
    () => createChartContextCommitScheduler(),
    [],
  );
  const pendingSymbolUiResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPendingSymbolUiReset = useCallback(() => {
    const timeout = pendingSymbolUiResetTimeoutRef.current;
    pendingSymbolUiResetTimeoutRef.current = null;
    if (timeout !== null) {
      clearTimeout(timeout);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      // This focus signal is immediate; the prop intentionally reaches the
      // retained Chart tree one frame later to protect tab-switch performance.
      isScreenFocusedRef.current = marketDemandAllowed;
      return () => {
        isScreenFocusedRef.current = false;
        cancelPendingChartContextActivation();
        chartContextCommitScheduler.cancelPending();
        cancelPendingSymbolUiReset();
      };
    }, [
      cancelPendingChartContextActivation,
      cancelPendingSymbolUiReset,
      chartContextCommitScheduler,
      marketDemandAllowed,
    ]),
  );
  useEffect(() => {
    if (!isScreenFocused) {
      cancelPendingChartContextActivation();
      chartContextCommitScheduler.cancelPending();
      cancelPendingSymbolUiReset();
    }
    return () => {
      cancelPendingChartContextActivation();
      chartContextCommitScheduler.cancelPending();
      cancelPendingSymbolUiReset();
    };
  }, [
    activeChartSessionCacheNamespace,
    cancelPendingChartContextActivation,
    cancelPendingSymbolUiReset,
    chartContextCommitScheduler,
    isScreenFocused,
  ]);

  const warmChartContextAndCommit = useCallback(
    (nextSymbol: string, nextTimeframe: string) => {
      if (isPublicDemoMarket) {
        chartContextCommitScheduler.cancelPending();
        const preferences = useUserPreferences.getState();
        const selectionChanged =
          preferences.chartSymbol !== nextSymbol ||
          preferences.chartTimeframe !== nextTimeframe;
        if (selectionChanged) {
          // Dispatch the public candle request before the retained Chart tree
          // re-renders for the new symbol; its query joins this in-flight fetch
          // instead of starting only after that render.
          void prefetchChartSelectionHistory(nextSymbol, nextTimeframe);
        }
        if (preferences.chartSymbol !== nextSymbol) {
          preferences.setChartSymbol(nextSymbol);
        }
        if (preferences.chartTimeframe !== nextTimeframe) {
          preferences.setChartTimeframe(nextTimeframe);
        }
        if (!selectionChanged) {
          refreshChartHistory();
        }
        return;
      }

      if (nextSymbol === chartSymbol) {
        chartContextCommitScheduler.cancelPending();
        refreshSelectedChartHistory(nextSymbol, nextTimeframe);
        if (nextTimeframe !== chartTimeframe) {
          setChartTimeframe(nextTimeframe);
        }
        return;
      }

      const expectedCacheNamespace =
        captureActiveBrokerSession()?.session.cacheNamespace
        ?? activeChartSessionCacheNamespace;
      chartContextCommitScheduler.request({
        prepare: () => {
          // Give the authenticated request a real dispatch turn before the
          // retained Chart tree performs its expensive symbol reconciliation.
          void prefetchChartSelectionHistory(nextSymbol, nextTimeframe);
          void prefetchInstrument(nextSymbol);
        },
        commit: () => {
          const currentSession = captureActiveBrokerSession();
          const currentCacheNamespace = currentSession?.session.cacheNamespace ?? '';
          if (
            !isScreenFocusedRef.current
            || currentCacheNamespace !== expectedCacheNamespace
          ) {
            return;
          }

          const preferences = useUserPreferences.getState();
          if (preferences.chartSymbol !== nextSymbol) {
            preferences.setChartSymbol(nextSymbol);
          }
          if (preferences.chartTimeframe !== nextTimeframe) {
            preferences.setChartTimeframe(nextTimeframe);
          }
        },
      });
    },
    [
      activeChartSessionCacheNamespace,
      chartContextCommitScheduler,
      chartSymbol,
      chartTimeframe,
      isPublicDemoMarket,
      refreshChartHistory,
      setChartTimeframe,
    ],
  );
  useEffect(() => {
    if (!chartRuntimeActive) return;
    const nextSymbol = resolveBrokerChartSymbol(chartSymbol, apiSymbolsData);
    if (nextSymbol) warmChartContextAndCommit(nextSymbol, chartTimeframe);
  }, [apiSymbolsData, chartRuntimeActive, chartSymbol, chartTimeframe, warmChartContextAndCommit]);

  const commitPreactivatedChartContext = useCallback((
    nextSymbol: string,
    nextTimeframe: string,
  ) => {
    chartContextCommitScheduler.cancelPending();
    if (!isScreenFocusedRef.current) {
      return;
    }
    if (!isPublicDemoMarket) {
      const currentCacheNamespace =
        captureActiveBrokerSession()?.session.cacheNamespace ?? '';
      if (
        !currentCacheNamespace
        || currentCacheNamespace !== chartMarketDataCacheNamespaceRef.current
      ) {
        return;
      }
    }

    // The WebView has already synchronously setData() for this exact cache key.
    // Commit the paired header/query context in this same ACK turn; routing it
    // through the normal after-frame scheduler would expose the new chart under
    // the previous symbol label for one frame.
    const preferences = useUserPreferences.getState();
    if (preferences.chartSymbol !== nextSymbol) {
      preferences.setChartSymbol(nextSymbol);
    }
    if (preferences.chartTimeframe !== nextTimeframe) {
      preferences.setChartTimeframe(nextTimeframe);
    }
  }, [chartContextCommitScheduler, isPublicDemoMarket]);

  chartWindowCommitContextImplementationRef.current = warmChartContextAndCommit;
  chartWindowCancelContextImplementationRef.current = chartContextCommitScheduler.cancelPending;
  chartWindowSplitModeRef.current = chartWindows.isSplit;
  chartWindowToolbarTargetPaneIdRef.current = chartWindows.toolbarTargetPaneId;
  const confirmedPaneSymbolPickerRef = useRef<() => void>(() => { });

  useLayoutEffect(() => {
    const activePaneId = chartWindows.activePane.id;
    const protectionOwnerPaneId = chartDirectProtectionOwnerPaneIdRef.current;
    if (shouldReleaseChartWindowOwnedAction(protectionOwnerPaneId, activePaneId)) {
      clearChartDirectProtectionDraft();
      snapTradeSheet('hidden');
    }

    const drawingOwnerPaneId = chartDrawingToolOwnerPaneIdRef.current;
    if (shouldReleaseChartWindowOwnedAction(drawingOwnerPaneId, activePaneId)) {
      chartDrawingToolOwnerPaneIdRef.current = null;
      setActiveTool(CHART_NO_DRAWING_TOOL);
      setChartDrawingInputActive(false);
      clearPendingChartDrawingTool();
      injectChartScript(
        `setDrawingTool(${JSON.stringify(CHART_NO_DRAWING_TOOL)}, { startDrawing: false });`,
      );
    }
  }, [
    chartWindows.activePane.id,
    clearChartDirectProtectionDraft,
    clearPendingChartDrawingTool,
    injectChartScript,
    setChartDrawingInputActive,
    snapTradeSheet,
  ]);

  useLayoutEffect(() => {
    if (!webViewReady || !webViewRef.current) return;
    injectChartScript(
      `if (typeof setChartWindowSplitMode === 'function') { setChartWindowSplitMode(${chartWindows.isSplit}); }`,
    );
  }, [chartWindows.isSplit, injectChartScript, webViewReady]);

  const handleOpenChartWindows = useCallback(() => {
    closeChartTapMenu();
    hideChartTimeframePicker();
    hideActionSheet();
    snapTradeSheet('hidden');
    chartWindows.openManager();
  }, [chartWindows.openManager, closeChartTapMenu, hideActionSheet, snapTradeSheet]);

  const handleSelectChartWindowPane = useCallback((paneId: string) => {
    chartWindowRadialMenuTokenRef.current += 1;
    setPendingChartWindowRadialMenu(null);
    closeChartTapMenu();
    const currentState = chartWindowsStateRef.current;
    if (
      currentState.activePaneId === paneId
      && currentState.toolbarTargetPaneId === paneId
    ) {
      return;
    }
    // This callback is intentionally selection-only. A toolbar press can land
    // during the single-vs-double-tap delay; closing sheets here would dismiss
    // the timeframe, SL/TP, Drawing Tools, or More UI that press just opened.
    chartWindows.selectPaneFromTap(paneId, (confirmedPane) => {
      if (confirmedPane.symbol !== chartSymbol || confirmedPane.timeframe !== chartTimeframe) {
        warmChartContextAndCommit(confirmedPane.symbol, confirmedPane.timeframe);
      }
    });
  }, [chartSymbol, chartTimeframe, chartWindows.selectPaneFromTap, closeChartTapMenu, warmChartContextAndCommit]);

  const cancelPendingChartWindowRadialMenu = useCallback((expectedToken?: number) => {
    if (
      expectedToken === undefined
      || chartWindowRadialMenuTokenRef.current === expectedToken
    ) {
      chartWindowRadialMenuTokenRef.current += 1;
    }
    setPendingChartWindowRadialMenu((current) => (
      expectedToken === undefined || current?.token === expectedToken ? null : current
    ));
  }, []);

  const handleOpenChartWindowPaneRadialMenu = useCallback((
    request: ChartWindowRadialMenuRequest,
  ) => {
    // Close competing overlays first, then select the tapped auxiliary pane.
    // The token makes any older request harmless if taps arrive back-to-back.
    closeChartTapMenu();
    hideChartTimeframePicker();
    hideActionSheet();
    snapTradeSheet('hidden');
    if (request.gesture.ownerCredentialScopeKey !== getActiveBrokerCredentialScopeKey()) {
      cancelPendingChartWindowRadialMenu();
      return;
    }
    const token = chartWindowRadialMenuTokenRef.current + 1;
    chartWindowRadialMenuTokenRef.current = token;
    setPendingChartWindowRadialMenu(null);
    chartWindows.selectPaneFromTap(request.paneId, (confirmedPane, confirmedContext) => {
      if (
        chartWindowRadialMenuTokenRef.current !== token
        || request.gesture.ownerCredentialScopeKey !== getActiveBrokerCredentialScopeKey()
        || !isChartWindowRadialMenuRequestConfirmed(
          request,
          confirmedPane,
          confirmedContext,
          getActiveBrokerCredentialScopeKey(),
        )
      ) {
        cancelPendingChartWindowRadialMenu(token);
        return;
      }
      setPendingChartWindowRadialMenu(Object.freeze({ request, token }));
    });
  }, [
    chartWindows.selectPaneFromTap,
    cancelPendingChartWindowRadialMenu,
    closeChartTapMenu,
    hideActionSheet,
    snapTradeSheet,
  ]);

  useEffect(() => {
    const pending = pendingChartWindowRadialMenu;
    if (!pending) return;
    if (
      pending.token !== chartWindowRadialMenuTokenRef.current
      || !isScreenFocused
      || !chartWindows.isSplit
      || pending.request.gesture.ownerCredentialScopeKey !== getActiveBrokerCredentialScopeKey()
      || !isChartWindowRadialMenuRequestConfirmed(
        pending.request,
        chartWindows.activePane,
        { symbol: chartSymbol, timeframe: chartTimeframe },
        getActiveBrokerCredentialScopeKey(),
      )
    ) {
      cancelPendingChartWindowRadialMenu(pending.token);
      return;
    }
    if (shouldSuppressChartTapMenu({
      activeTool,
      footerLotEditorFocused,
      footerLotEditorOpening,
      footerLotPickerOpen: footerLotPickerMode !== null,
      suppressUntil: chartTapMenuSuppressUntilRef.current,
    })) {
      cancelPendingChartWindowRadialMenu(pending.token);
      return;
    }

    // Measure the current full chart viewport after selection has committed,
    // then translate the pane-local tap into the menu's full-screen bounds.
    const frame = requestAnimationFrame(() => {
      syncChartViewportFrame((viewport) => {
        if (
          pending.token !== chartWindowRadialMenuTokenRef.current
          || !isScreenFocusedRef.current
          || pending.request.gesture.ownerCredentialScopeKey !== getActiveBrokerCredentialScopeKey()
        ) {
          cancelPendingChartWindowRadialMenu(pending.token);
          return;
        }
        const currentState = chartWindowsStateRef.current;
        const currentPane = currentState.panes.find(
          (pane) => pane.id === currentState.activePaneId,
        );
        const currentPreferences = useUserPreferences.getState();
        if (
          !currentPane
          || currentState.panes.length <= 1
          || !isChartWindowRadialMenuRequestConfirmed(
            pending.request,
            currentPane,
            {
              symbol: currentPreferences.chartSymbol,
              timeframe: currentPreferences.chartTimeframe,
            },
            getActiveBrokerCredentialScopeKey(),
          )
        ) {
          cancelPendingChartWindowRadialMenu(pending.token);
          return;
        }
        const nextBounds = {
          width: viewport.width,
          height: viewport.height,
        };
        const nextAnchor = mapChartWindowGestureToMenuAnchor(
          pending.request.gesture,
          nextBounds,
        );
        if (!nextAnchor) {
          cancelPendingChartWindowRadialMenu(pending.token);
          return;
        }
        chartTapMenuBoundsRef.current = nextBounds;
        setChartTapMenuBounds((current) => (
          current.width === nextBounds.width && current.height === nextBounds.height
            ? current
            : nextBounds
        ));
        chartTapMenuOpenedAtRef.current = Date.now();
        setChartTapMenuAnchor(nextAnchor);
        setPendingChartWindowRadialMenu((current) => (
          current?.token === pending.token ? null : current
        ));
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [
    activeTool,
    cancelPendingChartWindowRadialMenu,
    chartSymbol,
    chartTimeframe,
    chartWindows.activePane,
    chartWindows.isSplit,
    footerLotEditorFocused,
    footerLotEditorOpening,
    footerLotPickerMode,
    isScreenFocused,
    pendingChartWindowRadialMenu,
    syncChartViewportFrame,
  ]);

  useEffect(() => {
    if (isScreenFocused && chartWindows.isSplit) return;
    cancelPendingChartWindowRadialMenu();
  }, [cancelPendingChartWindowRadialMenu, chartWindows.isSplit, isScreenFocused]);

  useEffect(() => {
    cancelPendingChartWindowRadialMenu();
    closeChartTapMenu();
  }, [activeChartCredentialScopeKey, cancelPendingChartWindowRadialMenu, closeChartTapMenu]);

  const handleTimeframeSelect = useCallback((nextTimeframe: string) => {
    runImmediateAction(`chart.timeframe.${nextTimeframe}`, () => {
      cancelPendingChartContextActivation();
      hideChartTimeframePicker();
      const targetPanes = chartWindows.toolbarTargetPaneId === null
        ? chartWindows.state.panes
        : chartWindows.state.panes.filter(
          (pane) => pane.id === chartWindows.toolbarTargetPaneId,
        );
      if (targetPanes.every((pane) => pane.timeframe === nextTimeframe)) {
        closeChartTapMenu();
        hideActionSheet();
        return;
      }

      closeChartTapMenu();
      hideActionSheet();
      setActiveDateRange('auto');
      setCustomDateValue(null);
      chartWindows.updateToolbarTargetContext({ timeframe: nextTimeframe });
    });
  }, [
    cancelPendingChartContextActivation,
    chartWindows.state.panes,
    chartWindows.toolbarTargetPaneId,
    chartWindows.updateToolbarTargetContext,
    closeChartTapMenu,
    hideActionSheet,
  ]);

  const handleSymbolSelect = useCallback((nextSymbol: string) => {
    runImmediateAction(`chart.symbol.${nextSymbol}`, () => {
      cancelPendingChartContextActivation();
      cancelPendingSymbolUiReset();
      chartContextCommitScheduler.cancelPending();
      if (nextSymbol === chartSymbol) {
        chartContextCommitScheduler.cancelPending();
        hideActionSheet();
        closeChartTapMenu();
        return;
      }

      // Start the authenticated selected-symbol request before any retained
      // sheet or Chart state update can monopolize this JS turn. Broker auth
      // resolves through promises, so one task boundary lets fetch dispatch
      // first while preserving an effectively immediate sheet close.
      if (!isPublicDemoMarket) {
        void prefetchChartSelectionHistory(nextSymbol, chartTimeframe);
        void prefetchInstrument(nextSymbol);
      }
      // Before changing the selected symbol, try to show its previously painted
      // chart. A cache hit stays visible; a miss or timeout uses the normal
      // history-loading path below.
      const activationPending = requestWarmChartContextActivationImplementationRef.current(
        nextSymbol,
        chartTimeframe,
        (activated) => {
          if (activated) {
            commitPreactivatedChartContext(nextSymbol, chartTimeframe);
            return;
          }
          warmChartContextAndCommit(nextSymbol, chartTimeframe);
        },
      );
      if (!activationPending) {
        warmChartContextAndCommit(nextSymbol, chartTimeframe);
      }
      const expectedCacheNamespace =
        captureActiveBrokerSession()?.session.cacheNamespace
        ?? activeChartSessionCacheNamespace;
      const timeout = setTimeout(() => {
        if (pendingSymbolUiResetTimeoutRef.current !== timeout) {
          return;
        }
        pendingSymbolUiResetTimeoutRef.current = null;
        const currentCacheNamespace =
          captureActiveBrokerSession()?.session.cacheNamespace
          ?? '';
        if (
          !isScreenFocusedRef.current
          || currentCacheNamespace !== expectedCacheNamespace
        ) {
          return;
        }
        hideActionSheet();
        closeChartTapMenu();
        setActiveDateRange('auto');
        setCustomDateValue(null);
      }, 0);
      pendingSymbolUiResetTimeoutRef.current = timeout;
    });
  }, [
    activeChartSessionCacheNamespace,
    cancelPendingChartContextActivation,
    cancelPendingSymbolUiReset,
    chartContextCommitScheduler,
    chartSymbol,
    chartTimeframe,
    closeChartTapMenu,
    commitPreactivatedChartContext,
    hideActionSheet,
    isPublicDemoMarket,
    warmChartContextAndCommit,
  ]);

  const symbolPickerActions = useMemo(
    () => availableSymbols.map((sym) => ({
      label: sym,
      subtitle: resolveChartSymbolFullName(sym),
      onPress: () => handleSymbolSelect(sym),
    })),
    [availableSymbols, handleSymbolSelect],
  );

  const symbolPickerVisualKey = useMemo(
    () => `chart.symbolPicker:${t('Select Symbol')}:${availableSymbols.join('|')}`,
    [availableSymbols, t],
  );
  const symbolPickerActionSheetConfig = useMemo<ChartSymbolPickerSheetConfig>(
    () => ({
      title: t('Select Symbol'),
      searchable: true,
      compactText: true,
      presentation: 'mt5Plain',
      deferOffscreenActions: true,
      maximumVisibleActionRows: 9,
      detent: 'large',
      instantOpen: true,
      // The subtitle-aware viewport is stable before reveal, so this can share
      // the same UI-thread motion as Drawing Tools and the More menu.
      entryMotion: 'mt5Slide',
      // The picker has its own preloaded host, so it can use a shorter eased
      // slide without changing the motion of any shared ActionSheet surface.
      mt5SlideMotionProfile: 'fast',
      immediateHostHideOnClose: true,
      runActionAfterClose: false,
      visualKey: symbolPickerVisualKey,
      // Keep the sheet fixed when the search keyboard opens (no rise/jump);
      // the keyboard just overlays the lower part of the list.
      keepFullHeightOnKeyboard: true,
      actions: symbolPickerActions,
    }),
    [symbolPickerActions, symbolPickerVisualKey, t],
  );

  useEffect(() => {
    if (!isScreenFocused) {
      hideChartSymbolPickerSheet();
      return;
    }
    // Mount the exact searchable rows in the dedicated hidden host so radial,
    // trade-sheet, and symbol-header taps can start the native slide instantly.
    preloadChartSymbolPickerSheet(symbolPickerActionSheetConfig);
    // Warm the New Order shell so one-click-off Buy/Sell paints instantly with
    // origin=chart (back returns to Chart, not Quotes/Trade).
    prepareOrderTicketLaunch(chartSymbol, 'chart');
    prefetchOrderTicketData(resolveTradingLoginString(), chartSymbol);
    // Preload the full ticket module so the post-paint router.push is a thin mount.
    void preloadDeferredRouteModule(
      ORDER_TICKET_ROUTE_MODULE_CACHE_KEY,
      loadOrderTicketScreenRoute,
    );
    // Premount heavy chart destinations so More-menu taps open without lag.
    void preloadDeferredRouteModule('chart.indicators', () =>
      import('./IndicatorsScreen').then((m) => m.IndicatorsScreen as React.ComponentType),
    );
    void preloadDeferredRouteModule('chart.objects', () =>
      import('./ObjectsScreen').then((m) => m.ObjectsScreen as React.ComponentType),
    );
    void preloadDeferredRouteModule('chart.calculator', () =>
      import('./ChartTradingCalculatorScreen').then((m) => m.ChartTradingCalculatorScreen as React.ComponentType),
    );
  }, [
    chartSymbol,
    isScreenFocused,
    symbolPickerActionSheetConfig,
  ]);

  const openSymbolPickerForActivePane = useCallback(() => {
    runImmediateAction('chart.symbolPicker.open', () => {
      // Every completed interaction leaves a fresh hidden native host behind,
      // so repeat opens cannot replay the previous final compositor pose.
      showChartSymbolPickerSheet(symbolPickerActionSheetConfig);
      scheduleChartActionSheetContextReset();
    });
  }, [
    scheduleChartActionSheetContextReset,
    symbolPickerActionSheetConfig,
  ]);
  confirmedPaneSymbolPickerRef.current = openSymbolPickerForActivePane;

  const handleOpenSymbolPicker = useCallback(() => {
    // A hold-drag of the movable symbol header ends with the same tap event;
    // it must reposition the header, not open the picker.
    if (
      chartSymbolHeaderDragArmedRef.current ||
      Date.now() <= chartSymbolHeaderTapSuppressUntilRef.current
    ) {
      return;
    }
    openSymbolPickerForActivePane();
  }, [
    openSymbolPickerForActivePane,
  ]);

  const handleOpenChartWindowPaneSymbolPicker = useCallback((paneId: string) => {
    closeChartTapMenu();
    hideChartTimeframePicker();
    hideActionSheet();
    snapTradeSheet('hidden');
    chartWindows.selectPaneFromTap(paneId, (confirmedPane) => {
      // Opening the picker automatically brings the unconfirmed tapped pane to the
      // front. If they never select a new symbol, the pane stays active.
      if (
        confirmedPane.id !== paneId
        || confirmedPane.symbol !== chartSymbol
        || confirmedPane.timeframe !== chartTimeframe
      ) {
        warmChartContextAndCommit(confirmedPane.symbol, confirmedPane.timeframe);
      }
      confirmedPaneSymbolPickerRef.current();
    });
  }, [
    chartSymbol,
    chartTimeframe,
    chartWindows.selectPaneFromTap,
    closeChartTapMenu,
    hideActionSheet,
    snapTradeSheet,
    warmChartContextAndCommit,
  ]);

  const handleOpenTimeframePicker = useCallback(() => {
    runImmediateAction('chart.timeframePicker.open', () => {
      // Paint the retained overlay immediately — do not re-render ChartScreen
      // or start multi-timeframe history work on the open critical path.
      showChartTimeframePicker();
      hideActionSheet();
      closeChartTapMenu();
      scheduleChartActionSheetContextReset();
      scheduleIdleWork(() => {
        timeframes.forEach((tf) => {
          if (tf !== chartTimeframe) {
            void prefetchChartTimeframeHistory(chartSymbol, tf);
          }
        });
      }, { delayMs: 0, timeoutMs: 1200 });
    });
  }, [
    chartSymbol,
    chartTimeframe,
    closeChartTapMenu,
    hideActionSheet,
    prefetchChartTimeframeHistory,
    scheduleChartActionSheetContextReset,
  ]);

  const handleSelectChartType = useCallback((nextType: ChartVisualType) => {
    runImmediateAction(`chart.chartType.select.${nextType}`, () => {
      closeChartTapMenu();
      if (nextType === 'area') {
        // Preserve an explicitly selected crosshair. Only mark the tool as
        // auto-owned when this picker actually had to arm Area inspection.
        if (activeTool !== CHART_CROSSHAIR_TOOL) {
          handleSetTool(CHART_CROSSHAIR_TOOL, { areaAutoInspector: true });
        }
      } else if (
        chartType === 'area'
        && activeTool === CHART_CROSSHAIR_TOOL
        && areaAutoInspectorOwnerPaneIdRef.current === chartWindows.activePane.id
      ) {
        // The picker may release only the Area inspector it armed for this
        // pane. A manually selected crosshair remains active on other types.
        handleSetTool(CHART_NO_DRAWING_TOOL);
      }
      setChartVisualType(nextType);
      hideActionSheet();
    });
  }, [
    activeTool,
    chartType,
    chartWindows.activePane.id,
    closeChartTapMenu,
    handleSetTool,
    hideActionSheet,
    setChartVisualType,
  ]);

  const chartTypePickerActions = useMemo(
    // Area and Renko are first-class persisted chart types and use the same
    // picker/action flow as the original candle, hollow, and line choices.
    () => [
      { key: 'candles' as const, label: 'Candlestick', icon: 'stats-chart' as const },
      { key: 'hollow' as const, label: 'Hollow Candles', icon: 'stats-chart-outline' as const },
      { key: 'renko' as const, label: 'Renko', icon: 'grid-outline' as const },
      { key: 'line' as const, label: 'Line', icon: 'trending-up-outline' as const },
      { key: 'area' as const, label: 'Area', icon: 'analytics-outline' as const },
    ].map((option) => {
      const active = chartType === option.key;

      return {
        label: option.label,
        subtitle: active ? t('Current') : undefined,
        icon: <Ionicons name={option.icon} size={20} color={active ? BLUE : TEXT_MUTED} />,
        onPress: () => handleSelectChartType(option.key),
      };
    }),
    [BLUE, TEXT_MUTED, chartType, handleSelectChartType, t],
  );

  const handleOpenChartTypePicker = useCallback(() => {
    runImmediateAction('chart.chartType.open', () => {
      showChartActionSheet({
        title: t('Chart Type'),
        detent: 'auto',
        instantOpen: true,
        presentation: 'mt5Plain',
        showActionIcons: true,
        actions: chartTypePickerActions,
      });
      scheduleChartActionSheetContextReset();
    });
  }, [chartTypePickerActions, scheduleChartActionSheetContextReset, showChartActionSheet, t]);

  const handleOpenObjectsScreen = useCallback(() => {
    runImmediateAction('chart.objects.open', () => {
      const launchRevision = showChartActionLaunch('objects', chartSymbol);
      const chartWindowPaneId = chartWindows.toolbarTargetPaneId
        ?? chartWindows.activePane.id;
      const navigateToObjects = () => {
        scheduleChartActionLaunchNavigation(launchRevision, () => {
          try {
            router.push({
              pathname: '/chart/objects',
              params: {
                launchRevision: String(launchRevision),
                symbol: chartSymbol,
                chartWindowPaneId,
                chartWindowSplit: String(chartWindows.isSplit),
              },
            });
          } catch {
            hideChartActionLaunch(launchRevision);
          }
        });
      };
      closeChartTapMenu();
      if (requestChartDrawingSyncForObjects(navigateToObjects)) {
        return;
      }

      navigateToObjects();
    });
  }, [
    chartSymbol,
    chartWindows.activePane.id,
    chartWindows.isSplit,
    chartWindows.toolbarTargetPaneId,
    closeChartTapMenu,
    requestChartDrawingSyncForObjects,
  ]);

  const handleOpenSignalDetails = useCallback(() => {
    runImmediateAction('chart.signalDetails.open', () => {
      closeChartTapMenu();
      setShowSignalDetails(true);
    });
  }, [closeChartTapMenu]);

  const drawingToolsActions = useMemo(
    () => dismissBeforeDrawingToolsSelection(
      createDrawingToolsActionSheetActions({
        canRedoDrawing: drawingHistoryState.canRedo,
        canUndoDrawing: drawingHistoryState.canUndo,
        chartHideAll,
        chartLockAll,
        dangerIconColor: T.trading.sell.primary,
        drawingMagnetMode,
        hasDrawings: hasChartDrawings,
        hasHiddenDrawings: hasHiddenChartDrawings,
        hasLockedDrawings: hasLockedChartDrawings,
        hasSelectedDrawing: selectedDrawingId !== null,
        iconColor: TEXT_MUTED,
        onClearDrawings: handleRequestDeleteAllDrawings,
        onDeleteSelectedDrawing: handleDeleteSelectedDrawing,
        onHideSelectedDrawing: handleHideSelectedDrawing,
        onRedoDrawing: handleRedoDrawing,
        onSelectDrawingMode: handleSelectDrawingMode,
        onSelectTool: handleSetTool,
        onShowAllDrawings: handleShowAllDrawings,
        onToggleHide: handleToggleHide,
        onToggleLock: handleToggleLock,
        onToggleMagnetMode: handleToggleMagnetMode,
        onToggleSelectedDrawingLock: handleToggleSelectedDrawingLock,
        onToggleStickyMode: handleToggleStickyMode,
        onUndoDrawing: handleUndoDrawing,
        onUnlockAllDrawings: handleUnlockAllDrawings,
        onZoomTool: handleZoomTool,
        selectedDrawingLocked: selectedDrawingRecord?.locked === true,
        stickyDrawingMode,
      }),
      hideChartActionSheet,
    ),
    [
      TEXT_MUTED,
      T.trading.sell.primary,
      chartHideAll,
      chartLockAll,
      drawingHistoryState,
      drawingMagnetMode,
      handleDeleteSelectedDrawing,
      handleHideSelectedDrawing,
      handleRedoDrawing,
      handleRequestDeleteAllDrawings,
      handleSelectDrawingMode,
      handleSetTool,
      handleShowAllDrawings,
      handleToggleHide,
      handleToggleLock,
      handleToggleMagnetMode,
      handleToggleSelectedDrawingLock,
      handleToggleStickyMode,
      handleUndoDrawing,
      handleUnlockAllDrawings,
      handleZoomTool,
      hasChartDrawings,
      hasHiddenChartDrawings,
      hasLockedChartDrawings,
      hideChartActionSheet,
      selectedDrawingId,
      selectedDrawingRecord,
      stickyDrawingMode,
    ],
  );

  const drawingToolsVisualKey = useMemo(
    () => [
      'chart.drawingTools',
      drawingToolsActions.length,
      chartHideAll ? 'hide' : 'show',
      chartLockAll ? 'lock' : 'unlock',
      drawingMagnetMode ? 'magnet' : 'free',
      stickyDrawingMode ? 'sticky' : 'once',
      drawingHistoryState.canUndo ? 'undo' : 'noUndo',
      drawingHistoryState.canRedo ? 'redo' : 'noRedo',
      t('Undo Drawing'),
    ].join('|'),
    [
      chartHideAll,
      chartLockAll,
      drawingHistoryState,
      drawingMagnetMode,
      drawingToolsActions.length,
      stickyDrawingMode,
      t,
    ],
  );

  const drawingToolsActionSheetConfig = useMemo<Parameters<typeof showChartActionSheet>[0]>(
    () => ({
      title: t('Drawing Tools'),
      searchable: true,
      searchPlaceholder: t('Search drawing tools...'),
      compactText: true,
      presentation: 'mt5Plain',
      showActionIcons: true,
      deferOffscreenActions: true,
      // Drawing rows are shorter than Symbol Picker rows (they have no
      // subtitle). Twelve rows gives both searchable sheets the same physical
      // large-sheet viewport while the remaining tools stay virtualized.
      maximumVisibleActionRows: 12,
      minimumTopInset: drawingToolsSheetTopInset,
      // Keep one More-menu-sized viewport stable while FlatList supplies the
      // remaining tools only as the user scrolls.
      detent: 'large',
      instantOpen: true,
      // Keep this long virtualized catalog at its final height from the first
      // visible frame. Sliding it from a full-sheet translation can replay a
      // mid-height compositor frame that looks like the sheet is shrinking.
      entryMotion: 'instant',
      // Same direct host hide as symbol picker — avoids replaying a close slide
      // that looked like a second shrink when reopening tools.
      immediateHostHideOnClose: true,
      runActionAfterClose: false,
      visualKey: drawingToolsVisualKey,
      // Match Symbol Picker: focusing search must not resize or lift the sheet.
      keepFullHeightOnKeyboard: true,
      actions: drawingToolsActions,
    }),
    [drawingToolsActions, drawingToolsSheetTopInset, drawingToolsVisualKey, t],
  );

  useEffect(() => {
    if (!isScreenFocused) return;
    preloadScopedActionSheet('chart', drawingToolsActionSheetConfig);
  }, [drawingToolsActionSheetConfig, isScreenFocused, preloadScopedActionSheet]);

  useEffect(() => {
    if (!isScreenFocused) return undefined;

    // Drawing Tools still uses Chart's shared hidden ActionSheet slot. Other
    // shared Chart menus may replace it while visible, so restore Drawing Tools
    // as soon as they close. The dedicated Symbol Picker host is independent.
    return useUIState.subscribe((state, previousState) => {
      if (
        previousState.scopedActionSheets.chart !== null
        && state.scopedActionSheets.chart === null
      ) {
        preloadScopedActionSheet('chart', drawingToolsActionSheetConfig);
      }
    });
  }, [drawingToolsActionSheetConfig, isScreenFocused, preloadScopedActionSheet]);

  const handleOpenDrawingTools = useCallback((
    confirmation: ChartWindowToolbarTargetConfirmation,
  ) => {
    chartDrawingToolOwnerPaneIdRef.current =
      resolveChartWindowCommandOwnerPaneId(confirmation);
    runImmediateAction('chart.drawingTools.open', () => {
      const adoptDrawingToolsSheet = () => {
        closeChartTapMenu();
        showChartActionSheet(drawingToolsActionSheetConfig);
        scheduleChartActionSheetContextReset();
      };
      // The exact Drawing Tools config is already mounted by the preload
      // effect. Reveal those native pixels in the touch-start turn. Defer the
      // heavier Zustand/React adoption until those queued native props have
      // painted; doing both in one JS turn blocks the reveal on slower phones.
      const retainedRevision = requestRetainedActionSheetPreview(drawingToolsVisualKey);
      const retainedRevealAccepted = commitRetainedActionSheetPreview(
        retainedRevision,
        drawingToolsVisualKey,
      );
      if (retainedRevealAccepted) {
        scheduleAfterFirstFrame(adoptDrawingToolsSheet);
        return;
      }

      cancelRetainedActionSheetPreview(retainedRevision);
      // A faster-than-preload tap still opens correctly through React.
      adoptDrawingToolsSheet();
    });
  }, [
    closeChartTapMenu,
    drawingToolsActionSheetConfig,
    drawingToolsVisualKey,
    scheduleChartActionSheetContextReset,
    showChartActionSheet,
  ]);

  const handleOpenSettingsScreen = useCallback(() => {
    runImmediateAction('chart.settings.open', () => {
      closeChartTapMenu();
      // Sidebar-style retained host: first paint in this press turn, no stack push.
      hideChartConfigDestination();
      showChartSettingsHost();
    });
  }, [closeChartTapMenu]);

  const handleToggleChartExpanded = useCallback(() => {
    runImmediateAction('chart.expand.toggle', () => {
      const nextExpanded = !isChartExpanded;
      closeChartTapMenu();
      setIsChartExpanded(nextExpanded);
    });
  }, [closeChartTapMenu, isChartExpanded, setIsChartExpanded]);

  /**
   * Action handler for removing the current symbol from the user's favorites list.
   * This is triggered from the chart's more (3-dot) menu.
   */
  const handleChartMoreRemoveFromFavorites = useCallback(() => {
    hideActionSheet();
    removeQuoteSymbol(chartSymbol);
    if (isLoggedIn) {
      removeServerWatchlistSymbol(chartSymbol);
    }
  }, [
    chartSymbol,
    hideActionSheet,
    isLoggedIn,
    removeQuoteSymbol,
    removeServerWatchlistSymbol,
  ]);

  /**
   * Action handler for opening the Trading Calculator screen for the current symbol.
   */
  const handleOpenChartTradingCalculator = useCallback(() => {
    runImmediateAction('chart.calculator.open', () => {
      const launchRevision = showChartActionLaunch('calculator', chartSymbol);
      scheduleChartActionLaunchNavigation(launchRevision, () => {
        try {
          router.push({
            pathname: '/chart/calculator',
            params: { launchRevision: String(launchRevision), symbol: chartSymbol },
          });
        } catch {
          hideChartActionLaunch(launchRevision);
        }
      });
    });
  }, [chartSymbol]);

  /**
   * Action handler for opening the Analytics screen for the current symbol.
   */
  const handleOpenChartAnalytics = useCallback(() => {
    runImmediateAction('chart.analytics.open', () => {
      const launchRevision = showChartActionLaunch('analytics', chartSymbol);
      scheduleChartActionLaunchNavigation(launchRevision, () => {
        try {
          router.push({
            pathname: '/chart/analytics',
            params: { launchRevision: String(launchRevision), symbol: chartSymbol },
          });
        } catch {
          hideChartActionLaunch(launchRevision);
        }
      });
    });
  }, [chartSymbol]);

  /**
   * Action handler for opening the Contract Specification screen for the current symbol.
   */
  const handleOpenChartSpecification = useCallback(() => {
    runImmediateAction('chart.specification.open', () => {
      const launchRevision = showChartActionLaunch('specification', chartSymbol);
      scheduleChartActionLaunchNavigation(launchRevision, () => {
        try {
          router.push({
            pathname: '/chart/specification',
            params: { launchRevision: String(launchRevision), symbol: chartSymbol },
          });
        } catch {
          hideChartActionLaunch(launchRevision);
        }
      });
    });
  }, [chartSymbol]);

  // Keep the More-menu icon aligned with the currently selected visual type.
  const chartTypeIconName =
    chartType === 'renko'
      ? 'grid-outline'
      : chartType === 'area'
        ? 'analytics-outline'
        : chartType === 'candles' || chartType === 'hollow'
          ? 'stats-chart'
          : chartType === 'bars'
            ? 'bar-chart-outline'
            : 'trending-up-outline';

  /**
   * Defines the list of actions available in the Chart's More (3-dot) menu.
   * This includes options to toggle UI elements like the Volume Bar, change Chart Type,
   * and navigate to related screens (Analytics, Specification, etc.).
   */
  const chartMoreActions = useMemo(
    () => [
      {
        label: t('Chart Preferences'),
        icon: <Ionicons name="options-outline" size={20} color={TEXT_MUTED} />,
        activateOnPressIn: true,
        onPress: () => {
          hideChartActionSheet();
          handleOpenSettingsScreen();
        },
      },
      {
        label: t(isChartExpanded ? 'Exit fullscreen' : 'Fullscreen'),
        icon: <Ionicons name={isChartExpanded ? 'contract-outline' : 'expand-outline'} size={20} color={TEXT_MUTED} />,
        onPress: () => {
          hideChartActionSheet();
          handleToggleChartExpanded();
        },
      },
      // Toggles the visibility of the volume histogram pane at the bottom of the chart
      {
        label: t(showChartVolumePane ? 'Hide Volume Bar' : 'Show Volume Bar'),
        icon: <Ionicons name={showChartVolumePane ? 'eye-off-outline' : 'bar-chart-outline'} size={20} color={TEXT_MUTED} />,
        onPress: () => setChartViewportShowVolumePane(!showChartVolumePane),
      },
      // Opt-in hold-and-drag repositioning of the symbol/OHLC header so it
      // never covers a trade marker rendered near the top of the chart.
      {
        label: t('Movable symbol header'),
        icon: <Ionicons name="move-outline" size={20} color={TEXT_MUTED} />,
        muted: chartDisplay.movableSymbolHeader === true,
        onPress: () => handleToggleChartDisplayAction('movableSymbolHeader'),
      },
      // Conditional action: Toggles the drawing tools sidebar when the chart is in fullscreen mode
      ...(isChartExpanded
        ? [{
          label: t(chartViewportShowDrawingToolbar ? 'Hide Drawing Tools' : 'Show Drawing Tools'),
          icon: <Ionicons name={chartViewportShowDrawingToolbar ? 'eye-off-outline' : 'pencil-outline'} size={20} color={TEXT_MUTED} />,
          onPress: () => setChartViewportShowDrawingToolbar(!chartViewportShowDrawingToolbar),
        }]
        : []),
      // Opens every supported visual type, including Area and price-driven Renko.
      {
        label: t('Chart Type'),
        icon: <Ionicons name={chartTypeIconName} size={20} color={TEXT_MUTED} />,
        onPress: () => {
          requestAnimationFrame(handleOpenChartTypePicker);
        },
      },
      // Opens the screen to manage active drawn objects and indicators
      {
        label: t('Objects'),
        icon: <TvLayers color={TEXT_MUTED} size={20} />,
        activateOnPressIn: true,
        deferCloseCommitForVisualHandoff: true,
        onPress: handleOpenObjectsScreen,
      },
      // Resets the chart's zoom, scale, and scroll state back to the default view
      {
        label: t('Reset'),
        icon: <Ionicons name="refresh-outline" size={20} color={TEXT_MUTED} />,
        onPress: handleResetChartViewport,
      },
      // Removes the currently active symbol from the user's favorites
      {
        label: t('Remove from favorites'),
        icon: <Ionicons name="star" size={20} color={TEXT_MUTED} />,
        onPress: handleChartMoreRemoveFromFavorites,
      },
      // Navigates to the Trading Calculator screen
      {
        label: t('Trading calculator'),
        icon: <Ionicons name="calculator-outline" size={20} color={TEXT_MUTED} />,
        activateOnPressIn: true,
        deferCloseCommitForVisualHandoff: true,
        onPress: handleOpenChartTradingCalculator,
      },
      // Navigates to the Analytics screen
      {
        label: t('Analytics'),
        icon: <Ionicons name="analytics-outline" size={20} color={TEXT_MUTED} />,
        activateOnPressIn: true,
        deferCloseCommitForVisualHandoff: true,
        onPress: handleOpenChartAnalytics,
      },
      // Navigates to the Contract Specification screen
      {
        label: t('Specification'),
        icon: <Ionicons name="clipboard-outline" size={20} color={TEXT_MUTED} />,
        activateOnPressIn: true,
        deferCloseCommitForVisualHandoff: true,
        onPress: handleOpenChartSpecification,
      },
    ],
    [
      TEXT_MUTED,
      chartDisplay.movableSymbolHeader,
      chartTypeIconName,
      chartViewportShowDrawingToolbar,
      handleChartMoreRemoveFromFavorites,
      handleOpenChartAnalytics,
      handleOpenChartSpecification,
      handleOpenChartTradingCalculator,
      handleOpenChartTypePicker,
      handleOpenObjectsScreen,
      handleOpenSettingsScreen,
      handleResetChartViewport,
      handleToggleChartDisplayAction,
      handleToggleChartExpanded,
      hideChartActionSheet,
      isChartExpanded,
      setChartViewportShowDrawingToolbar,
      setChartViewportShowVolumePane,
      showChartVolumePane,
      t,
    ],
  );

  const chartScaleActions = useMemo(
    () => [
      {
        label: t('Scroll to last bar'),
        icon: <Ionicons name="arrow-forward-outline" size={20} color={TEXT_MUTED} />,
        onPress: handleScrollToLastBar,
      },
      {
        label: t('Reset vertical scale'),
        icon: <Ionicons name="refresh-outline" size={20} color={TEXT_MUTED} />,
        onPress: handleResetVerticalScale,
      },
      {
        label: t('Auto-scale'),
        icon: (
          <Ionicons
            name={isChartAutoScaleEnabled ? 'contract-outline' : 'resize-outline'}
            size={20}
            color={TEXT_MUTED}
          />
        ),
        muted: isChartAutoScaleEnabled,
        onPress: handleToggleChartAutoScale,
      },
      {
        label: t('Vertical movement'),
        icon: (
          <Ionicons
            name={isVerticalScrollingLocked ? 'lock-closed-outline' : 'lock-open-outline'}
            size={20}
            color={TEXT_MUTED}
          />
        ),
        muted: !isVerticalScrollingLocked,
        onPress: handleToggleVerticalScrollingLock,
      },
      {
        label: t('One Click panel at the bottom'),
        icon: <Ionicons name="trail-sign-outline" size={20} color={TEXT_MUTED} />,
        muted: chartOneClickPanelAtBottom,
        onPress: handleToggleOneClickPanelAtBottom,
      },
      ...CHART_SCALE_DISPLAY_ITEMS.map((item) => {
        const enabled = getChartDisplayActionEnabled(item.key);
        return {
          label: t(item.label),
          icon: <Ionicons name={item.icon} size={20} color={TEXT_MUTED} />,
          muted: enabled,
          onPress: () => handleToggleChartDisplayAction(item.key),
        };
      }),
    ],
    [
      TEXT_MUTED,
      chartOneClickPanelAtBottom,
      getChartDisplayActionEnabled,
      handleResetVerticalScale,
      handleScrollToLastBar,
      handleToggleChartAutoScale,
      handleToggleChartDisplayAction,
      handleToggleOneClickPanelAtBottom,
      handleToggleVerticalScrollingLock,
      isChartAutoScaleEnabled,
      isVerticalScrollingLocked,
      t,
    ],
  );

  const handleOpenChartScaleMenu = useCallback(() => {
    runImmediateAction('chart.radial.scaleMenu.open', () => {
      closeChartTapMenu();
      showChartActionSheet({
        title: t('Chart settings'),
        titleAlign: 'center',
        presentation: 'mt5Plain',
        showActionIcons: true,
        detent: 'auto',
        instantOpen: true,
        actions: chartScaleActions,
      });
      scheduleChartActionSheetContextReset();
    });
  }, [
    chartScaleActions,
    closeChartTapMenu,
    scheduleChartActionSheetContextReset,
    showChartActionSheet,
    t,
  ]);
  // Scale actions rebuild the real handler as chart state changes. Keep the
  // prop passed to React.memo stable while this ref calls the latest handler.
  const latestHandleOpenChartScaleMenuRef = useRef(handleOpenChartScaleMenu);
  latestHandleOpenChartScaleMenuRef.current = handleOpenChartScaleMenu;
  const handleRadialOpenChartScaleMenu = useCallback(() => {
    latestHandleOpenChartScaleMenuRef.current();
  }, []);

  const handleOpenMoreMenu = useCallback(() => {
    runImmediateAction('chart.moreMenu.open', () => {
      showChartActionSheet({
        presentation: 'mt5Plain',
        showActionIcons: true,
        detent: 'adaptive',
        instantOpen: true,
        entryMotion: 'mt5Slide',
        runActionAfterClose: false,
        actions: chartMoreActions,
      });
      scheduleChartActionSheetContextReset();
    });
  }, [chartMoreActions, scheduleChartActionSheetContextReset, showChartActionSheet]);

  const handleToggleChartCrosshair = useCallback((
    confirmation: ChartWindowToolbarTargetConfirmation,
  ) => {
    clearPendingChartDrawingTool();
    const nextTool = activeTool === CHART_CROSSHAIR_TOOL
      ? CHART_NO_DRAWING_TOOL
      : CHART_CROSSHAIR_TOOL;
    handleSetTool(nextTool);
    chartDrawingToolOwnerPaneIdRef.current = nextTool === CHART_NO_DRAWING_TOOL
      ? null
      : resolveChartWindowCommandOwnerPaneId(confirmation);
  }, [activeTool, clearPendingChartDrawingTool, handleSetTool]);

  const routeChartWindowToolbarAction = useChartWindowToolbarRouter(
    chartWindows.runOnToolbarTarget,
    {
      crosshair: handleToggleChartCrosshair,
      timeframe: handleOpenTimeframePicker,
      sltp: handleActivateDirectChartProtection,
      drawings: handleOpenDrawingTools,
      settings: handleOpenSettingsScreen,
      more: handleOpenMoreMenu,
    },
  );

  // Stable callbacks prevent live chart renders from invalidating the
  // pre-mounted radial menu's props in the middle of its entrance. Every
  // handler also closes that full-screen retained layer before opening a sheet
  // or route, so the invisible layer cannot intercept the next UI's first tap.
  const handleRadialOpenObjects = useCallback(() => {
    closeChartTapMenu();
    handleOpenObjectsScreen();
  }, [closeChartTapMenu, handleOpenObjectsScreen]);
  const handleRadialOpenDrawingTools = useCallback(() => {
    closeChartTapMenu();
    routeChartWindowToolbarAction('drawings');
  }, [closeChartTapMenu, routeChartWindowToolbarAction]);
  const handleRadialOpenIndicators = useCallback(() => {
    closeChartTapMenu();
    runImmediateAction('chart.indicators.open', () => {
      try {
        router.push('/chart/indicators');
      } catch {
        // Route may already be mid-transition; radial is closed.
      }
    });
  }, [closeChartTapMenu, router]);
  const handleRadialOpenSymbolPicker = useCallback(() => {
    closeChartTapMenu();
    handleOpenSymbolPicker();
  }, [closeChartTapMenu, handleOpenSymbolPicker]);

  const marketCloseSeparatorPayload = useMemo(() => {
    if (!isChartMarketClosed) {
      return [];
    }

    const sessionClose = chartMarketSessionPolicy.sessionClose;
    const separator = getMarketCloseSeparator(
      sanitizedCandles,
      chartTimeframe,
      sessionClose,
    );
    if (separator) {
      return [separator];
    }

    // Some broker adapters confirm a close without returning session_close.
    // Once the frozen REST suffix is removed, mark the remaining final candle
    // as the visible stop point instead of inventing a wall-clock boundary.
    if (
      sanitizedCandles.length > 0 &&
      (typeof sessionClose !== 'number' || !Number.isFinite(sessionClose))
    ) {
      const index = sanitizedCandles.length - 1;
      return [{ time: sanitizedCandles[index].time, index, type: 'market_close' as const }];
    }
    return [];
  }, [chartMarketSessionPolicy.sessionClose, chartTimeframe, isChartMarketClosed, sanitizedCandles]);

  // Calendar/session separators belong to a time axis. They would be
  // misleading on Renko's price-driven brick sequence, so omit them there.
  const periodSeparatorOptions = useMemo(() => ({
    enabled:
      chartType !== 'renko'
      && (chartDisplay.periodSeparators || marketCloseSeparatorPayload.length > 0),
    color: isDark ? 'rgba(148, 163, 184, 0.42)' : 'rgba(100, 116, 139, 0.45)',
    width: 1,
    dashPattern: '1 5',
  }), [chartDisplay.periodSeparators, chartType, isDark, marketCloseSeparatorPayload.length]);

  const periodSeparatorPayload = useMemo(
    () => {
      if (chartType === 'renko') {
        return [];
      }
      const baseSeparators = getPeriodSeparators(sanitizedCandles, chartTimeframe, {
        periodSeparators: chartDisplay.periodSeparators,
      });
      if (marketCloseSeparatorPayload.length === 0) {
        return baseSeparators;
      }

      const seen = new Set(baseSeparators.map((separator) => `${separator.time}:${separator.type}`));
      const merged = [...baseSeparators];
      for (const separator of marketCloseSeparatorPayload) {
        const key = `${separator.time}:${separator.type}`;
        if (!seen.has(key)) {
          merged.push(separator);
          seen.add(key);
        }
      }
      return merged.sort((left, right) => left.index - right.index || left.time - right.time);
    },
    [chartDisplay.periodSeparators, chartTimeframe, chartType, marketCloseSeparatorPayload, sanitizedCandles],
  );

  const periodSeparatorPayloadSignature = useMemo(
    () => JSON.stringify({ options: periodSeparatorOptions, separators: periodSeparatorPayload }),
    [periodSeparatorOptions, periodSeparatorPayload],
  );

  const chartOptions = useMemo(() => ({
    layout: {
      background: { color: resolvedChartColors.background },
      textColor: resolvedChartColors.foreground,
      attributionLogo: false,
      fontSize: 11,
    },
    grid: {
      vertLines: {
        color: 'transparent',
        style: CHART_GRID_LINE_STYLE,
      },
      horzLines: {
        color: 'transparent',
        style: CHART_GRID_LINE_STYLE,
      },
    },
    crosshair: {
      mode: 2,
      vertLine: { visible: false, labelVisible: false, color: 'transparent', width: 0 },
      horzLine: { visible: false, labelVisible: false, color: 'transparent', width: 0 },
    },
    timeScale: {
      borderVisible: false,
      borderColor: 'transparent',
      timeVisible: true,
      secondsVisible: false,
      rightOffset: CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET,
      barSpacing: CHART_DEFAULT_TIME_SCALE_BAR_SPACING,
      minBarSpacing: chartType === 'area'
        ? CHART_AREA_TIME_SCALE_MIN_BAR_SPACING
        : CHART_DEFAULT_TIME_SCALE_MIN_BAR_SPACING,
      shiftVisibleRangeOnNewBar: true,
      fixLeftEdge: CHART_TIME_SCALE_FIX_LEFT_EDGE,
      fixRightEdge: CHART_TIME_SCALE_FIX_RIGHT_EDGE,
    },
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: false,
    },
    handleScale: {
      mouseWheel: true,
      pinch: true,
      // The WebView owns right-price-axis scaling so touch and mouse use the
      // same MT5-style anchored curve without competing library transforms.
      axisPressedMouseMove: { time: true, price: false },
    },
    rightPriceScale: {
      visible: true,
      borderVisible: false,
      borderColor: 'transparent',
      // Honor Chart Preferences → Auto-scale on first paint (iOS + Android).
      autoScale: isChartAutoScaleEnabled,
      entireTextOnly: false,
      minimumWidth: CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH,
      scaleMargins: {
        top: 0,
        // Close-only Line/Area and price-only Renko do not use the lower
        // movement/volume pane, so their main price series receives full height.
        bottom:
          showChartVolumePane
            && chartType !== 'line'
            && chartType !== 'area'
            && chartType !== 'renko'
            ? 0.32
            : 0,
      },
    },
    customColors: {
      candlesUptrend: resolvedChartColors.candlesUptrend,
      candlesDowntrend: resolvedChartColors.candlesDowntrend,
      hollowBody: resolvedChartColors.hollowBody,
      barsUptrend: resolvedChartColors.barsUptrend,
      barsDowntrend: resolvedChartColors.barsDowntrend,
      lineBody: resolvedChartColors.lineBody,
      grid: chartDisplay.showGrid ? chartGridColor : 'transparent',
      axisDivider: chartAxisBorderColor,
    },
    customCrosshair: {
      symbol: chartSymbol,
      timeframe: chartTimeframe,
      pointSize: chartCrosshairPointSize,
      areaSeriesInspector: chartType === 'area',
      lineColor: isDark ? 'rgba(148, 163, 184, 0.64)' : 'rgba(71, 85, 105, 0.58)',
      labelBackground: isDark ? 'rgba(15, 23, 42, 0.96)' : 'rgba(15, 23, 42, 0.94)',
      labelText: '#FFFFFF',
      tooltipBackground: isDark ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.97)',
      tooltipBorder: isDark ? 'rgba(148, 163, 184, 0.30)' : 'rgba(15, 23, 42, 0.14)',
      tooltipText: isDark ? '#E5E7EB' : '#0F172A',
      tooltipMuted: isDark ? '#94A3B8' : '#64748B',
      upColor: resolvedChartColors.candlesUptrend,
      downColor: resolvedChartColors.candlesDowntrend,
      snap: {
        enabled: drawingMagnetMode,
        type: drawingMagnetMode ? 'ohlc-nearest' : 'none',
        thresholdPx: CHART_DRAWING_MAGNET_THRESHOLD_PX,
      },
    },
    areaViewport: {
      visibleBars: areaVisibleBarTarget,
    },
    periodSeparators: periodSeparatorOptions,
  }), [
    chartAxisBorderColor,
    areaVisibleBarTarget,
    chartDisplay.showGrid,
    chartGridColor,
    chartCrosshairPointSize,
    chartSymbol,
    chartTimeframe,
    chartType,
    drawingMagnetMode,
    isChartAutoScaleEnabled,
    isDark,
    periodSeparatorOptions,
    resolvedChartColors,
    showChartVolumePane,
  ]);
  const chartCustomCrosshairConfig = chartOptions.customCrosshair;

  const applyImmediateChartVisualTheme = useCallback((mode: ThemeMode) => {
    const nextIsDark = mode === 'dark';
    const nextColors = resolveChartColorsForTheme(chartColors, chartColorScheme, nextIsDark);
    const nextBackgroundColor = nextColors.background;
    const payload = {
      layout: {
        background: { color: nextBackgroundColor },
        textColor: nextColors.foreground,
      },
      customColors: {
        grid: chartDisplay.showGrid
          ? (nextIsDark ? nextColors.grid : MT5_LIGHT_GRID_COLOR)
          : 'transparent',
        axisDivider: nextIsDark ? MT5_DARK_AXIS_BORDER_COLOR : MT5_LIGHT_AXIS_BORDER_COLOR,
      },
      periodSeparators: {
        enabled: chartDisplay.periodSeparators || marketCloseSeparatorPayload.length > 0,
        color: nextIsDark ? 'rgba(148, 163, 184, 0.42)' : 'rgba(100, 116, 139, 0.45)',
        width: 1,
        dashPattern: '1 5',
      },
    };

    // The WebView itself is a native surface, so repaint its host and DOM in
    // the press turn instead of waiting for React plus the full chart rebuild.
    const immediateWebViewHost = webViewRef.current as unknown as {
      setNativeProps?: (props: { style: { backgroundColor: string } }) => void;
    } | null;
    immediateWebViewHost?.setNativeProps?.({ style: { backgroundColor: nextBackgroundColor } });
    if (!webViewReady) {
      return;
    }
    injectChartScript(`
      if (typeof window.applyChartVisualTheme === 'function') {
        window.applyChartVisualTheme(${JSON.stringify(payload)});
      }
    `);
  }, [
    chartColorScheme,
    chartColors,
    chartDisplay.periodSeparators,
    chartDisplay.showGrid,
    injectChartScript,
    marketCloseSeparatorPayload.length,
    webViewReady,
  ]);

  useLayoutEffect(() => {
    const unregister = registerImmediateThemeVisualApplier(applyImmediateChartVisualTheme);
    // This also covers hydration and a WebView becoming ready after the theme
    // was selected; direct user toggles take the registry path above first.
    applyImmediateChartVisualTheme(isDark ? 'dark' : 'light');
    return unregister;
  }, [applyImmediateChartVisualTheme, isDark]);

  const [overlaySyncRevision, setOverlaySyncRevision] = useState(0);
  // Monotonic counter — incremented every time the WebView confirms
  // CHART_READY.  Used as a dependency in the overlay effect so it
  // always re-fires after a chart (re-)initialization, even when the
  // overlay payload itself hasn't changed.
  const [chartReadyEpoch, setChartReadyEpoch] = useState(0);
  useEffect(() => {
    if (!webViewReady || !chartCanvasReady || !webViewRef.current) {
      return;
    }

    // Symbol/timeframe switches intentionally retain the WebView and do not
    // participate in currentSig. Push the complete inspector contract through
    // its own bridge so Area date formatting and pane/type ownership can never
    // retain the previous context while the chart data has already switched.
    injectChartScript(`
      if (
        window._drawingManager
        && typeof window._drawingManager.setCrosshairConfig === 'function'
      ) {
        window._drawingManager.setCrosshairConfig(${JSON.stringify(chartCustomCrosshairConfig)});
      }
    `);
  }, [
    chartCanvasReady,
    chartCustomCrosshairConfig,
    chartReadyEpoch,
    injectChartScript,
    webViewReady,
  ]);
  // Keep the latest overlay payload in a ref so the onMessage handler
  // can push it immediately on CHART_READY without waiting for the
  // React effect cycle — this eliminates the "flash of missing lines"
  // race condition.
  const overlayPayloadRef = useRef<any>({
    priceLines: [],
    markers: [],
    tradeHistorySegments: [],
  });
  const latestChartOpenPositionLabelPatchesRef = useRef<{
    contextKey: string;
    patches: ChartOpenPositionLabelPatch[];
  }>({ contextKey: '', patches: [] });
  const drawingSignatureRef = useRef(chartDrawingSignature);
  const drawingRecordsRef = useRef(chartDrawingRecords);
  const lastWebViewDrawingSignatureRef = useRef('');
  const lastInjectedDrawingSyncRef = useRef({ signature: '', epoch: -1 });
  const allowNextEmptyDrawingSyncRef = useRef(false);
  const hasAcceptedNonEmptyWebViewDrawingsRef = useRef(chartDrawingRecords.length > 0);
  drawingSignatureRef.current = chartDrawingSignature;
  drawingRecordsRef.current = chartDrawingRecords;
  useEffect(() => {
    allowNextEmptyDrawingSyncRef.current = false;
    hasAcceptedNonEmptyWebViewDrawingsRef.current = chartDrawingRecords.length > 0;
  }, [chartDrawingBucketKey, chartDrawingRecords.length]);
  // Loading overlay: quote/live-only data stays concealed until committed
  // history is confirmed painted. The 10 s fallback may expose the native
  // no-data state, but it must never uncover an unconfirmed history WebView.
  const [loadingDelayPassed, setLoadingDelayPassed] = useState(false);
  const [loadingFallback, setLoadingFallback] = useState(false);
  const candlesAvailable = chartHasHistoryCandles && sanitizedCandles.length > 0;
  // Returning to a healthy retained chart stays instant. If Android has
  // discarded/reloaded the WebView process, this becomes false and starts a
  // fresh bounded recovery window for the same symbol/timeframe.
  const hasPaintedCurrentChartContext =
    hasPaintedChartOnce
    && lastPaintedChartDataContextSig === chartDataContextSig
    && lastPaintedChartDataContextEpoch === chartDataContextEpoch;
  const preactivatedChartContext = preactivatedChartContextRef.current;
  const hasPreactivatedCurrentChartContext =
    preactivatedChartContext.dataContextSig === chartDataContextSig
    && preactivatedChartContext.generation === chartWebViewGeneration
    && preactivatedChartContext.visualShellSig === chartVisualShellSigRef.current;
  const hasUsableRetainedChart =
    (hasPaintedCurrentChartContext || hasPreactivatedCurrentChartContext)
    && webViewReady
    && chartCanvasReady;
  useEffect(() => {
    setLoadingDelayPassed(false);
    setLoadingFallback(false);
    // Hidden hot tabs should not age into "No market data" before the user
    // opens Chart. Healthy retained charts also need no fallback timer. If the
    // WebView is later lost, hasUsableRetainedChart flips false and arms a new
    // recovery window instead of inheriting an expired fallback.
    if (!chartRuntimeActive || hasUsableRetainedChart) {
      return undefined;
    }
    const delayTmr = setTimeout(() => setLoadingDelayPassed(true), 500);
    // Bumped 3 s → 10 s. The previous 3 s fallback was firing on slow first
    // REST loads (cold network, demo broker handshake) and showing the
    // "No market data available" screen even though the candle stream was
    // still in flight. The timer is now long enough to cover a worst-case
    // first fetch but still short enough to recover from a hard failure
    // (otherwise the spinner would hang forever).
    const fallbackTmr = setTimeout(() => setLoadingFallback(true), 10000);
    return () => {
      clearTimeout(delayTmr);
      clearTimeout(fallbackTmr);
    };
  }, [
    chartRuntimeActive,
    chartSymbol,
    chartTimeframe,
    chartType,
    hasUsableRetainedChart,
  ]);
  const requestOverlaySync = useCallback(() => {
    setOverlaySyncRevision((revision) => revision + 1);
  }, []);
  const refreshShowOnChartSources = useCallback(() => {
    if (!chartRuntimeActive) {
      return;
    }
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
    chartRuntimeActive,
  ]);
  useFocusEffect(
    useCallback(() => {
      if (!chartRuntimeActive) {
        return cancelChartViewportRecovery;
      }

      const cancelFocusWork = scheduleIdleWork(
        () => {
          refreshShowOnChartSources();
          requestChartViewportRecovery(3);
        },
        { delayMs: CHART_FOCUS_WORK_DELAY_MS, timeoutMs: 1500 },
      );

      return () => {
        cancelFocusWork();
        cancelChartViewportRecovery();
      };
    }, [cancelChartViewportRecovery, chartRuntimeActive, refreshShowOnChartSources, requestChartViewportRecovery]),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && isScreenFocused) {
        refreshShowOnChartSources();
        requestChartViewportRecovery(3);
      }
    });

    return () => subscription.remove();
  }, [isScreenFocused, refreshShowOnChartSources, requestChartViewportRecovery]);
  const hasChartDataError = Boolean(
    (chartDataError && !candlesAvailable) || chartSurfaceRecoveryExhausted,
  );
  const chartDisplayError = chartSurfaceRecoveryExhausted
    ? t('Chart renderer did not respond. Switch symbols to retry.')
    : chartDataError;
  const shouldShowImmediateHistoryLoading = !candlesAvailable && !hasChartDataError;
  const isLoading =
    !hasChartDataError &&
    (!chartCanvasReady || !candlesAvailable || chartDataLoading) &&
    (shouldShowImmediateHistoryLoading || loadingDelayPassed) &&
    !loadingFallback;
  // Keep the loader until this exact symbol and timeframe has drawn candles.
  // Cached history still needs a matching WebView paint acknowledgement; the
  // chart itself remains transparent until then, so removing this cover would
  // expose a blank surface when a cached symbol repaint is delayed or retried.
  const shouldShowChartLoadingOverlay =
    !hasUsableRetainedChart &&
    (!loadingFallback || candlesAvailable) &&
    !hasChartDataError &&
    (!chartSurfaceReady || isLoading || candlesAvailable);
  const isError = hasChartDataError;
  const isNoMarketData = !candlesAvailable && !isLoading && !isError && loadingFallback;

  // Field diagnostics: a chart that still has no drawable history after the
  // 10 s fallback records what it saw in the Journal (Settings > Journal,
  // Network), once per symbol/timeframe visit, so a screenshot identifies the
  // failing stage without device logs.
  const chartNoHistoryJournalKeyRef = useRef('');
  useEffect(() => {
    if (!chartRuntimeActive || !loadingFallback || candlesAvailable || hasUsableRetainedChart) {
      return;
    }
    const journalKey = `${chartSymbol}:${chartTimeframe}`;
    if (chartNoHistoryJournalKeyRef.current === journalKey) {
      return;
    }
    chartNoHistoryJournalKeyRef.current = journalKey;
    try {
      recordAppActionJournalEvent({
        source: 'Network',
        level: 'error',
        message:
          `Chart ${chartSymbol} ${chartTimeframe} has no history after 10 s: `
          + `mode=${isPublicDemoMarket ? 'public' : 'broker'}, `
          + `loading=${chartDataLoading ? 'yes' : 'no'}, `
          + `error=${chartDisplayError || 'none'}, `
          + `candles=${candles.length}, history=${chartHasHistoryCandles ? 'yes' : 'no'}, `
          + `drawable=${sanitizedCandles.length}, `
          + `webView=${webViewReady ? 'ready' : 'not ready'}, canvas=${chartCanvasReady ? 'ready' : 'not ready'}`,
      });
    } catch {
      // Diagnostics must never affect the chart.
    }
  }, [
    candles.length,
    candlesAvailable,
    chartCanvasReady,
    chartDataLoading,
    chartDisplayError,
    chartHasHistoryCandles,
    chartRuntimeActive,
    chartSymbol,
    chartTimeframe,
    hasUsableRetainedChart,
    isPublicDemoMarket,
    loadingFallback,
    sanitizedCandles.length,
    webViewReady,
  ]);
  useEffect(() => {
    if (candlesAvailable) {
      // A later visit to the same symbol/timeframe may report again.
      chartNoHistoryJournalKeyRef.current = '';
    }
  }, [candlesAvailable]);

  useEffect(() => {
    if (!webViewReady || !chartCanvasReady) return;
    const drawingOwnerMismatch = shouldReleaseChartWindowOwnedAction(
      chartDrawingToolOwnerPaneIdRef.current,
      chartWindows.activePane.id,
    );
    const bridgedTool = chartLockAll || drawingOwnerMismatch
      ? CHART_NO_DRAWING_TOOL
      : activeTool;
    const shouldStartDrawing =
      !chartLockAll
      && !drawingOwnerMismatch
      && chartDrawingInputActive
      && isChartDrawingInputTool(bridgedTool);
    injectChartScript(`
      window.__rtx5ChartWindowPaneId = ${JSON.stringify(chartWindows.activePane.id)};
      setDrawingsLocked(${chartLockAll});
      setDrawingsHidden(${chartHideAll});
      setStayInDrawingMode(${stickyDrawingMode});
      setDrawingMagnetMode(${drawingMagnetMode});
      setVerticalScrollingLocked(${isVerticalScrollingLocked});
      setChartAutoScaleEnabled(${isChartAutoScaleEnabled});
      setShowObjectDescriptions(${chartDisplay.showObjectDescriptions === true});
      setDrawingTool(${JSON.stringify(bridgedTool)}, { startDrawing: ${shouldStartDrawing} });
    `);
  }, [
    activeTool,
    chartDrawingInputActive,
    chartWindows.activePane.id,
    webViewReady,
    chartCanvasReady,
    chartLockAll,
    chartHideAll,
    stickyDrawingMode,
    drawingMagnetMode,
    isVerticalScrollingLocked,
    isChartAutoScaleEnabled,
    chartDisplay.showObjectDescriptions,
    chartSymbol,
    chartTimeframe,
    chartType,
  ]);

  useEffect(() => {
    if (!hasCandles || !webViewReady || !chartCanvasReady) {
      return;
    }
    if (activeDateRange === 'auto') {
      return;
    }
    applyNativeTimeRange(activeDateRange, customDateValue);
  }, [activeDateRange, applyNativeTimeRange, chartCanvasReady, chartReadyEpoch, chartTimeframe, customDateValue, hasCandles, webViewReady]);

  useEffect(() => {
    if (!webViewReady || chartType !== 'area') {
      return;
    }
    injectChartScript(`
      if (typeof window.__rtx5SetAreaDirectionOverride === 'function') {
        window.__rtx5SetAreaDirectionOverride(
          ${JSON.stringify(chartDataContextSig)},
          ${JSON.stringify(areaDirectionRangeKey)},
          ${JSON.stringify(areaChartDirection)}
        );
      }
    `);
  }, [
    areaChartDirection,
    areaDirectionRangeKey,
    chartDataContextSig,
    chartType,
    injectChartScript,
    webViewReady,
  ]);

  useEffect(() => {
    if (!pendingChartDrawingTool || !chartCanvasReady || !webViewReady) {
      return;
    }

    const nextDrawingInputActive = isChartDrawingInputTool(pendingChartDrawingTool);
    areaAutoInspectorOwnerPaneIdRef.current = null;
    pendingAreaAutoInspectorPaneIdRef.current = null;
    chartDrawingToolOwnerPaneIdRef.current = chartWindows.toolbarTargetPaneId;
    setActiveTool(pendingChartDrawingTool);
    setChartDrawingInputActive(nextDrawingInputActive);
    injectChartScript(`setDrawingTool(${JSON.stringify(pendingChartDrawingTool)}, { startDrawing: ${nextDrawingInputActive} });`);
    clearPendingChartDrawingTool();
  }, [
    pendingChartDrawingTool,
    chartCanvasReady,
    chartWindows.toolbarTargetPaneId,
    webViewReady,
    clearPendingChartDrawingTool,
  ]);

  useEffect(() => {
    if (!pendingChartCommand || !chartCanvasReady || !webViewReady) {
      return;
    }

    if (pendingChartCommand === 'scrollToLastBar') {
      if (routeChartWindowViewportCommand('scrollToLastBar')) {
        executeScrollToLastBar();
      }
    } else if (pendingChartCommand === 'resetVerticalScale') {
      if (routeChartWindowViewportCommand('resetVerticalScale')) {
        executeResetVerticalScale();
      }
    }

    clearPendingChartCommand();
  }, [
    pendingChartCommand,
    chartCanvasReady,
    webViewReady,
    executeScrollToLastBar,
    executeResetVerticalScale,
    routeChartWindowViewportCommand,
    clearPendingChartCommand,
  ]);

  // ─────────────────────────────────────────────────────────────────
  //   Self-healing chart bridge
  //
  //   Professional-grade: the chart ALWAYS renders. Period.
  //
  //   • sendInit() is the single function that pushes chart data to
  //     the WebView. It is idempotent, with throttled in-flight retries.
  //   • A watchdog timer re-sends initChart if CHART_READY hasn't
  //     arrived. It checks every 3s and avoids flooding slow WebViews.
  //   • On data arrival: requests initChart with the latest retained candles.
  //   • On WebView reload: READY resets state, next data push re-inits.
  // ─────────────────────────────────────────────────────────────────
  const candlesRef = useRef(sanitizedCandles);
  const candlesRefContextSigRef = useRef(chartDataContextSig);
  const chartInitializedRef = useRef(false);
  const watchdogRef = useRef<NodeJS.Timeout | null>(null);
  const lastInitSigRef = useRef('');
  const lastInitAttemptSigRef = useRef('');
  const lastInitDispatchRef = useRef({
    signature: '',
    configSig: '',
    dataContextSig: '',
    dataContextEpoch: -1,
    at: 0,
  });
  const chartDataContextSigRef = useRef(chartDataContextSig);
  chartDataContextSigRef.current = chartDataContextSig;
  const pendingFullPaneSelectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPendingFullPaneSelection = useCallback(() => {
    const timeout = pendingFullPaneSelectionTimeoutRef.current;
    if (timeout !== null) {
      clearTimeout(timeout);
      pendingFullPaneSelectionTimeoutRef.current = null;
    }
  }, []);
  const scheduleFullPaneSelection = useCallback((expectedDataContextSig: string) => {
    cancelPendingFullPaneSelection();
    const expectedPaneId = chartWindowsStateRef.current.activePaneId;
    chartWindows.claimToolbarTarget(expectedPaneId);
    pendingFullPaneSelectionTimeoutRef.current = setTimeout(() => {
      pendingFullPaneSelectionTimeoutRef.current = null;
      const currentState = chartWindowsStateRef.current;
      if (
        !isScreenFocusedRef.current
        || currentState.panes.length <= 1
        || currentState.activePaneId !== expectedPaneId
        || chartDataContextSigRef.current !== expectedDataContextSig
      ) {
        return;
      }
      handleSelectChartWindowPane(expectedPaneId);
    }, CHART_WINDOW_FULL_PANE_SINGLE_TAP_DELAY_MS);
  }, [
    cancelPendingFullPaneSelection,
    chartWindows.claimToolbarTarget,
    handleSelectChartWindowPane,
  ]);

  useEffect(() => {
    if (!chartWindows.isSplit) {
      cancelPendingFullPaneSelection();
    }
    return cancelPendingFullPaneSelection;
  }, [cancelPendingFullPaneSelection, chartWindows.isSplit]);
  const chartDataPaintRevisionRef = useRef(0);
  const pendingChartDataPaintRef = useRef({
    token: '',
    dataContextSig: '',
    confirmsUsableChart: false,
    retryScript: '',
    startedAt: 0,
    ackRetryCount: 0,
    lastAckRetryAt: 0,
  });
  const renderedSeriesSnapshotRef = useRef(EMPTY_CHART_SERIES_SNAPSHOT);
  // One source candle can rebuild or add several Renko bricks without changing
  // candle count. Track the transformed output separately so it reloads fully.
  const renderedRenkoSeriesSnapshotRef = useRef(EMPTY_CHART_SERIES_SNAPSHOT);
  const renderedRenkoSeriesKeyRef = useRef('');
  const renderedDataContextSigRef = useRef('');
  const lastInjectedLiveQuoteSignatureRef = useRef('');
  const livePaintRevisionRef = useRef(0);
  const paintCanonicalLiveTickRef = useRef<(allowUnchangedSnapshot?: boolean) => void>(() => { });
  const chartLiveTickAccumulatorRef = useRef<ChartLiveTickAccumulator | null>(null);
  const historylessBootstrapViewportRef = useRef<HistorylessBootstrapViewport>(
    EMPTY_HISTORYLESS_BOOTSTRAP_VIEWPORT,
  );
  const chartLiveOhlcSnapshotRef = useRef<{
    contextKey: string;
    candle: ChartLiveOhlcCandle | null;
  }>({ contextKey: '', candle: null });
  const chartLiveOhlcListenersRef = useRef(new Map<string, Set<ChartLiveOhlcListener>>());
  const renderedRenkoSeriesKey = `${chartDataContextSig}:${chartType}`;
  // Never compare synthetic bricks across a symbol/account/timeframe or after
  // leaving Renko; those outputs may have unrelated lengths and fractional times.
  if (renderedRenkoSeriesKeyRef.current !== renderedRenkoSeriesKey) {
    renderedRenkoSeriesKeyRef.current = renderedRenkoSeriesKey;
    renderedRenkoSeriesSnapshotRef.current = EMPTY_CHART_SERIES_SNAPSHOT;
  }
  // A retained ChartScreen survives active-window symbol changes. Reset the
  // fallback series synchronously during render so READY/init callbacks in the
  // same commit can never seed the new Bid accumulator from the old symbol.
  if (candlesRefContextSigRef.current !== chartDataContextSig) {
    candlesRefContextSigRef.current = chartDataContextSig;
    candlesRef.current = EMPTY_DISPLAY_CANDLES;
    chartLiveTickAccumulatorRef.current = null;
    historylessBootstrapViewportRef.current = EMPTY_HISTORYLESS_BOOTSTRAP_VIEWPORT;
    chartLiveOhlcSnapshotRef.current = { contextKey: chartDataContextSig, candle: null };
  }
  const retainCurrentChartCandles = useCallback((nextCandles: typeof sanitizedCandles) => {
    candlesRefContextSigRef.current = chartDataContextSig;
    candlesRef.current = nextCandles;
  }, [chartDataContextSig]);
  const publishChartLiveOhlc = useCallback((candle: ChartLiveOhlcCandle | null) => {
    chartLiveOhlcSnapshotRef.current = { contextKey: chartDataContextSig, candle };
    chartLiveOhlcListenersRef.current.get(chartDataContextSig)?.forEach((listener) => {
      listener(candle);
    });
  }, [chartDataContextSig]);
  const subscribeChartLiveOhlc = useCallback((listener: ChartLiveOhlcListener) => {
    let listeners = chartLiveOhlcListenersRef.current.get(chartDataContextSig);
    if (!listeners) {
      listeners = new Set<ChartLiveOhlcListener>();
      chartLiveOhlcListenersRef.current.set(chartDataContextSig, listeners);
    }
    listeners.add(listener);
    const snapshot = chartLiveOhlcSnapshotRef.current;
    listener(snapshot.contextKey === chartDataContextSig ? snapshot.candle : null);
    return () => {
      listeners?.delete(listener);
      if (listeners?.size === 0) {
        chartLiveOhlcListenersRef.current.delete(chartDataContextSig);
      }
    };
  }, [chartDataContextSig]);
  const accumulateCurrentChartBid = useCallback((
    exactQuote: ExactChartQuoteSnapshot,
    canonicalCandles: readonly { time: number; open: number; high: number; low: number; close: number; volume: number }[],
  ) => {
    const next = accumulateChartBidTick(chartLiveTickAccumulatorRef.current, {
      contextKey: chartDataContextSig,
      timeframe: chartTimeframe,
      canonicalTail: canonicalCandles[canonicalCandles.length - 1] ?? null,
      quote: exactQuote,
    });
    chartLiveTickAccumulatorRef.current = next;
    publishChartLiveOhlc(next?.candle ?? null);
    return next;
  }, [chartDataContextSig, chartTimeframe, publishChartLiveOhlc]);
  const readCurrentProjectedChartCandles = useCallback(() => {
    const canonicalCandles = readRenderableCanonicalCandles();
    const baseCandles = resolveContextScopedChartCandles(
      chartDataContextSig,
      canonicalCandles,
      {
        contextKey: candlesRefContextSigRef.current,
        candles: candlesRef.current,
      },
    );
    const exactQuote = readExactChartQuoteForScope(
      chartTradeDisplayQuoteScopeKey,
      retainedChartTradeDisplayQuoteRef.current,
    );
    if (isChartMarketClosed) {
      chartLiveTickAccumulatorRef.current = null;
      publishChartLiveOhlc(null);
    } else if (exactQuote) {
      accumulateCurrentChartBid(exactQuote, baseCandles);
    }
    const projection = projectChartLiveTickCandles(
      baseCandles,
      chartLiveTickAccumulatorRef.current,
      chartDataContextSig,
    );
    return { exactQuote, projection, hasHistoryCandles: chartHasHistoryCandles };
  }, [
    accumulateCurrentChartBid,
    chartDataContextSig,
    chartHasHistoryCandles,
    chartTradeDisplayQuoteScopeKey,
    isChartMarketClosed,
    publishChartLiveOhlc,
    readRenderableCanonicalCandles,
  ]);
  const chartCandleFrontendPaintRef = useRef<{
    availableAt: number;
    length: number;
    signature: string;
  } | null>(null);
  // The retained Chart tab receives candles while hidden behind another tab or
  // with the app backgrounded, and the WebView only paints once it is shown.
  // Paint latency is therefore measured from when the chart became visible,
  // not from when data arrived, or hidden time reads as a slow paint.
  const chartVisibleSinceRef = useRef<number | null>(
    isScreenFocused && AppState.currentState === 'active' ? Date.now() : null,
  );
  useEffect(() => {
    const syncChartVisibility = (appState: AppStateStatus) => {
      const visible = isScreenFocused && appState === 'active';
      if (!visible) {
        chartVisibleSinceRef.current = null;
      } else if (chartVisibleSinceRef.current === null) {
        chartVisibleSinceRef.current = Date.now();
      }
    };
    syncChartVisibility(AppState.currentState);
    const subscription = AppState.addEventListener('change', syncChartVisibility);
    return () => subscription.remove();
  }, [isScreenFocused]);
  const issueChartDataPaintToken = useCallback((
    dataContextSig: string,
    confirmsUsableChart: boolean,
  ): string => {
    chartDataPaintRevisionRef.current += 1;
    const token = `${dataContextSig}:${chartDataPaintRevisionRef.current}`;
    const pendingPaint = pendingChartDataPaintRef.current;
    const startedAt =
      confirmsUsableChart
        && pendingPaint.confirmsUsableChart
        && pendingPaint.dataContextSig === dataContextSig
        && pendingPaint.startedAt > 0
        ? pendingPaint.startedAt
        : Date.now();
    const continuesPendingUsablePaint =
      confirmsUsableChart
      && pendingPaint.confirmsUsableChart
      && pendingPaint.dataContextSig === dataContextSig;
    pendingChartDataPaintRef.current = {
      token,
      dataContextSig,
      confirmsUsableChart,
      retryScript: '',
      startedAt,
      ackRetryCount: continuesPendingUsablePaint ? pendingPaint.ackRetryCount : 0,
      lastAckRetryAt: continuesPendingUsablePaint ? pendingPaint.lastAckRetryAt : 0,
    };
    return token;
  }, []);
  const retainChartDataPaintRetryScript = useCallback((
    paintToken: string,
    retryScript: string,
  ) => {
    if (!paintToken || !retryScript) {
      return;
    }
    const pendingPaint = pendingChartDataPaintRef.current;
    if (pendingPaint.token !== paintToken) {
      return;
    }
    pendingChartDataPaintRef.current = {
      ...pendingPaint,
      retryScript,
    };
  }, []);
  const recordConfirmedChartFrontendPaint = useCallback(() => {
    const frontendPaint = chartCandleFrontendPaintRef.current;
    if (!frontendPaint) {
      return;
    }
    const visibleSince = chartVisibleSinceRef.current;
    if (visibleSince === null) {
      // Painted while hidden: nobody waited on it, so there is no latency.
      chartCandleFrontendPaintRef.current = null;
      return;
    }
    const frontendMs = Date.now() - Math.max(frontendPaint.availableAt, visibleSince);
    recordUiFeedGap(
      'chart.candles.frontend.paint',
      frontendMs,
      `${chartSymbol} ${chartTimeframe} ${frontendPaint.length} candle(s)`,
    );
    if (typeof __DEV__ !== 'undefined' && __DEV__ && frontendMs > 3000) {
      console.warn(
        `[CHART] Frontend candle paint exceeded 3s after data was available: ${frontendMs}ms for ${chartSymbol} ${chartTimeframe}`,
      );
    }
    chartCandleFrontendPaintRef.current = null;
  }, [chartSymbol, chartTimeframe]);

  const clearRenderedMarketPriceLines = useCallback((dataContextSig?: string) => {
    lastInjectedLiveQuoteSignatureRef.current = '';
    const requestedContextSig = dataContextSig?.trim() ?? '';
    const revision = livePaintRevisionRef.current + 1;
    try {
      webViewRef.current?.injectJavaScript(`
        try {
          if (
            ${JSON.stringify(requestedContextSig)} &&
            typeof setLivePriceLineForContext === 'function'
          ) {
            setLivePriceLineForContext(
              null,
              ${JSON.stringify(requestedContextSig)},
              ${revision}
            );
          } else if (typeof setLivePriceLine === 'function') {
            setLivePriceLine(null);
          }
        } catch (_) {}
        true;
      `);
      livePaintRevisionRef.current = revision;
    } catch (_e) {
      /* WebView may have been disposed */
    }
  }, []);

  const resetChartBridgeState = useCallback(() => {
    chartInitializedRef.current = false;
    lastInitSigRef.current = '';
    lastInitAttemptSigRef.current = '';
    lastInitDispatchRef.current = {
      signature: '',
      configSig: '',
      dataContextSig: '',
      dataContextEpoch: -1,
      at: 0,
    };
    pendingChartDataPaintRef.current = {
      token: '',
      dataContextSig: '',
      confirmsUsableChart: false,
      retryScript: '',
      startedAt: 0,
      ackRetryCount: 0,
      lastAckRetryAt: 0,
    };
    renderedSeriesSnapshotRef.current = EMPTY_CHART_SERIES_SNAPSHOT;
    renderedRenkoSeriesSnapshotRef.current = EMPTY_CHART_SERIES_SNAPSHOT;
    renderedDataContextSigRef.current = '';
    lastInjectedLiveQuoteSignatureRef.current = '';
    livePaintRevisionRef.current = 0;
    if (chartViewportTouchFailsafeTimerRef.current) {
      clearTimeout(chartViewportTouchFailsafeTimerRef.current);
      chartViewportTouchFailsafeTimerRef.current = null;
    }
    chartViewportTouchActiveRef.current = false;
    setChartViewportTouchActive(false);
    setChartCanvasReady(false);
    setChartPlotArea(null);
    chartVisiblePriceRangeRef.current = null;
  }, []);
  const handleChartWebViewProcessLoss = useCallback((
    platformName: 'Android' | 'iOS',
    failedGeneration: number,
  ) => {
    // Native teardown/recycling can report the same dead content process more
    // than once. Recreate each failed WebView generation at most once.
    if (lastRecoveredChartWebViewGenerationRef.current === failedGeneration) {
      return;
    }
    lastRecoveredChartWebViewGenerationRef.current = failedGeneration;
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log(`[CHART WEBVIEW] ${platformName} render process terminated.`);
    }
    resetChartBridgeState();
    setWebViewReady(false);

    // A terminated native renderer cannot be reused. Recreate the WebView by
    // key, but never parse the large chart document behind another active tab
    // under the same memory pressure that killed it.
    if (!isScreenFocused) {
      pendingChartWebViewRecoveryRef.current = true;
      return;
    }

    pendingChartWebViewRecoveryRef.current = false;
    setChartWebViewGeneration((generation) => generation + 1);
  }, [isScreenFocused, resetChartBridgeState]);
  const recoverChartWebViewAfterPaintStall = useCallback((
    failedDataContextSig: string,
    failedDataContextEpoch: number,
    failedGeneration: number,
  ) => {
    // Ignore a timeout owned by a context/generation that React has already
    // replaced. Native process-loss callbacks share the generation guard so a
    // simultaneous timeout cannot schedule a second remount.
    if (
      failedDataContextSig !== chartDataContextSigRef.current
      || failedDataContextEpoch !== chartDataContextEpochRef.current.epoch
      || lastRecoveredChartWebViewGenerationRef.current === failedGeneration
    ) {
      return false;
    }

    const previousRecovery = chartWebViewPaintStallRecoveryRef.current;
    const attemptCount =
      previousRecovery.dataContextSig === failedDataContextSig
        && previousRecovery.dataContextEpoch === failedDataContextEpoch
        ? previousRecovery.attemptCount
        : 0;
    if (attemptCount >= CHART_WEBVIEW_PAINT_STALL_RECOVERY_MAX) {
      // The exact replacement and two fresh renderer generations have all
      // failed. End this visit in an explicit renderer error instead of
      // leaving candlesAvailable behind an opaque loading overlay forever.
      pendingChartDataPaintRef.current = {
        token: '',
        dataContextSig: '',
        confirmsUsableChart: false,
        retryScript: '',
        startedAt: 0,
        ackRetryCount: 0,
        lastAckRetryAt: 0,
      };
      setChartSurfaceRecoveryExhausted(true);
      return false;
    }

    chartWebViewPaintStallRecoveryRef.current = {
      dataContextSig: failedDataContextSig,
      dataContextEpoch: failedDataContextEpoch,
      attemptCount: attemptCount + 1,
    };
    lastRecoveredChartWebViewGenerationRef.current = failedGeneration;
    resetChartBridgeState();
    setWebViewReady(false);

    // Match native process-loss recovery: never allocate and parse a replacement
    // chart surface behind another active tab.
    if (!isScreenFocusedRef.current) {
      pendingChartWebViewRecoveryRef.current = true;
      return true;
    }

    pendingChartWebViewRecoveryRef.current = false;
    setChartWebViewGeneration((generation) => generation + 1);
    return true;
  }, [resetChartBridgeState]);
  useEffect(() => {
    if (!isScreenFocused || !pendingChartWebViewRecoveryRef.current) {
      return;
    }

    pendingChartWebViewRecoveryRef.current = false;
    setChartWebViewGeneration((generation) => generation + 1);
  }, [isScreenFocused]);

  useEffect(() => {
    const { projection } = readCurrentProjectedChartCandles();
    retainCurrentChartCandles(projection.candles);
    if (typeof __DEV__ !== 'undefined' && __DEV__ && CHART_BRIDGE_DEBUG) {
      const last = sanitizedCandles[sanitizedCandles.length - 1];
      console.log('[CHART-CANDLES]', {
        symbol: chartSymbol,
        timeframe: chartTimeframe,
        count: sanitizedCandles.length,
        lastTime: last?.time ?? null,
      });
      console.log('[CHART-BRIDGE] useLiveCandles_update', {
        symbol: chartSymbol,
        timeframe: chartTimeframe,
        count: sanitizedCandles.length,
      });
    }
  }, [chartSymbol, chartTimeframe, readCurrentProjectedChartCandles, retainCurrentChartCandles, sanitizedCandles]);

  // Time-based modes keep canonical backend timestamps. Renko maps the same
  // validated history onto a synthetic price-brick axis before crossing the
  // WebView bridge.
  const renkoExplicitInstrumentTickSize = (
    chartInstrumentMeta as (Record<string, unknown> & { tick_size?: unknown }) | undefined
  )?.tick_size;
  // Use the broker's real price grid when available; displayed decimal precision
  // is only the final fallback for rounding the automatic ATR brick size.
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
      scopeKey: chartMarketDataCacheNamespace,
      symbol: chartSymbol,
      timeframe: chartTimeframe,
      displayDecimals,
      minimumPriceIncrement: renkoMinimumPriceIncrement,
      candles: sourceCandles,
    });
  }, [
    chartMarketDataCacheNamespace,
    chartSymbol,
    chartTimeframe,
    displayDecimals,
    renkoMinimumPriceIncrement,
  ]);
  const buildMappedData = useCallback((sourceCandles: typeof sanitizedCandles) => {
    const cleaned = sourceCandles;
    if (cleaned.length === 0) {
      return [];
    }

    // Renko must transform the complete chronological path before mapping.
    // Line/Area instead keep source times and reduce each candle to its close.
    const renderedCandles = chartType === 'renko'
      ? buildRenkoBricks(cleaned, {
        brickSize: resolveCachedRenkoBrickSize(cleaned),
      })
      : cleaned;
    const result: any[] = [];

    for (let i = 0; i < renderedCandles.length; i++) {
      const c = renderedCandles[i];
      // Lightweight Charts' LineSeries and AreaSeries require `{time, value}`;
      // candle, hollow, bars, and transformed Renko retain the OHLC shape.
      if (chartType === 'line' || chartType === 'area') {
        result.push({ time: c.time, value: c.close });
      } else {
        result.push({
          time: c.time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume ?? 0,
        });
      }

      // Intentional: no whitespace injection and no synthetic gap-fill bars.
      // Lightweight-charts index-spaces real bars adjacently, so minutes the
      // backend has no candle for (illiquid symbols, no-trade gaps) simply
      // collapse — matching MT5/TradingView. Fabricating flat bars here would
      // render zero-height dashes that read as broken whitespace.
    }
    return result;
  }, [chartType, resolveCachedRenkoBrickSize]);

  // Track the chart shell signature. Symbol/timeframe switches are data
  // context changes and repaint through updateChartData; only visual shell
  // changes rebuild the WebView chart.
  const currentSig = useMemo(
    () =>
      `${chartType}-${showChartVolumePane ? 'vol' : 'novol'
      }-${chartDisplay.showGrid ? 'grid' : 'nogrid'}-${chartGridColor}-${chartAxisBorderColor}-${chartColorsSignature}`,
    [chartType, chartColorsSignature, showChartVolumePane, chartDisplay.showGrid, chartGridColor, chartAxisBorderColor],
  );
  useEffect(() => {
    setChartSurfaceRecoveryExhausted(false);
  }, [chartDataContextSig, currentSig]);
  chartVisualShellSigRef.current = currentSig;
  const markChartContextPainted = useCallback((
    dataContextSig: string,
    paintedDisplayDecimals: number = displayDecimals,
  ) => {
    if (!dataContextSig) {
      return;
    }
    const lru = paintedChartContextLruRef.current;
    lru.delete(dataContextSig);
    lru.set(dataContextSig, {
      generation: chartWebViewGeneration,
      visualShellSig: currentSig,
      displayDecimals: paintedDisplayDecimals,
    });
    while (lru.size > CHART_PAINTED_CONTEXT_LRU_MAX) {
      const oldestKey = lru.keys().next().value as string | undefined;
      if (!oldestKey) {
        break;
      }
      lru.delete(oldestKey);
    }
  }, [chartWebViewGeneration, currentSig, displayDecimals]);
  const isChartContextActivationScopeCurrent = useCallback((
    pending: NonNullable<typeof pendingChartContextActivationRef.current>,
  ) => {
    if (
      !isScreenFocusedRef.current
      || pending.sourceDataContextSig !== chartDataContextSigRef.current
      || pending.generation !== chartWebViewGenerationRef.current
      || pending.visualShellSig !== chartVisualShellSigRef.current
      || pending.cacheNamespace !== chartMarketDataCacheNamespaceRef.current
    ) {
      return false;
    }
    if (!pending.brokerSessionScoped) {
      return true;
    }
    return (
      captureActiveBrokerSession()?.session.cacheNamespace ?? ''
    ) === pending.cacheNamespace;
  }, []);
  // Reuse a cached chart only when it belongs to the current WebView, chart
  // appearance, and broker session. This prevents stale charts after a remount,
  // chart-type/theme change, or account switch.
  const requestWarmChartContextActivation = useCallback((
    nextSymbol: string,
    nextTimeframe: string,
    commit: (activated: boolean) => void,
  ): boolean => {
    const normalizedNextTimeframe = normalizeTimeframe(nextTimeframe);
    const targetDataContextSig =
      `${chartMarketDataCacheNamespace}:${nextSymbol}:${normalizedNextTimeframe}`;
    const cachedContext = paintedChartContextLruRef.current.get(targetDataContextSig);
    if (
      !cachedContext
      || cachedContext.generation !== chartWebViewGeneration
      || cachedContext.visualShellSig !== currentSig
      || !webViewReady
      || !chartCanvasReady
      || !chartInitializedRef.current
      || !webViewRef.current
    ) {
      return false;
    }

    cancelPendingChartContextActivation();
    chartDataPaintRevisionRef.current += 1;
    const paintToken = `${targetDataContextSig}:${chartDataPaintRevisionRef.current}`;
    const requestId = chartContextActivationRequestRevisionRef.current + 1;
    chartContextActivationRequestRevisionRef.current = requestId;
    const sourceDataContextSig = chartDataContextSigRef.current;
    const cacheNamespace = chartMarketDataCacheNamespace;
    const brokerSessionScoped = !isPublicDemoMarket;

    const commitFallback = () => {
      const pending = pendingChartContextActivationRef.current;
      if (!pending || pending.requestId !== requestId) {
        return;
      }
      pendingChartContextActivationRef.current = null;
      clearTimeout(pending.timeout);
      if (
        deferredChartContextFullReplacementRef.current === pending.sourceDataContextSig
      ) {
        deferredChartContextFullReplacementRef.current = '';
      }
      paintedChartContextLruRef.current.delete(targetDataContextSig);
      if (isChartContextActivationScopeCurrent(pending)) {
        commit(false);
      }
    };
    const timeout = setTimeout(commitFallback, CHART_CONTEXT_ACTIVATION_TIMEOUT_MS);
    pendingChartContextActivationRef.current = {
      requestId,
      sourceDataContextSig,
      dataContextSig: targetDataContextSig,
      paintToken,
      generation: chartWebViewGeneration,
      visualShellSig: currentSig,
      cacheNamespace,
      brokerSessionScoped,
      displayDecimals: cachedContext.displayDecimals,
      timeout,
      commit,
    };

    try {
      webViewRef.current.injectJavaScript(`
        if (typeof window.activateCachedChartContext === 'function') {
          window.activateCachedChartContext(
            ${JSON.stringify(targetDataContextSig)},
            ${JSON.stringify(paintToken)},
            ${cachedContext.displayDecimals},
            ${requestId}
          );
        } else if (
          window.ReactNativeWebView
          && typeof window.ReactNativeWebView.postMessage === 'function'
        ) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'CHART_CONTEXT_ACTIVATED',
            requestId: ${requestId},
            dataContextSig: ${JSON.stringify(targetDataContextSig)},
            paintToken: ${JSON.stringify(paintToken)},
            hit: false
          }));
        }
        true;
      `);
    } catch (_activationInjectError) {
      commitFallback();
    }
    return true;
  }, [
    cancelPendingChartContextActivation,
    chartCanvasReady,
    chartMarketDataCacheNamespace,
    chartWebViewGeneration,
    currentSig,
    isChartContextActivationScopeCurrent,
    isPublicDemoMarket,
    webViewReady,
  ]);
  requestWarmChartContextActivationImplementationRef.current =
    requestWarmChartContextActivation;
  const settleChartContextActivation = useCallback((message: Record<string, unknown>) => {
    const pending = pendingChartContextActivationRef.current;
    const requestId = typeof message.requestId === 'number' ? message.requestId : -1;
    const dataContextSig =
      typeof message.dataContextSig === 'string' ? message.dataContextSig : '';
    const paintToken = typeof message.paintToken === 'string' ? message.paintToken : '';
    if (
      !pending
      || requestId !== pending.requestId
      || dataContextSig !== pending.dataContextSig
      || paintToken !== pending.paintToken
    ) {
      // A late reply from a timed-out or superseded picker tap is never allowed
      // to commit selection state or grant visible-surface ownership.
      return;
    }

    pendingChartContextActivationRef.current = null;
    clearTimeout(pending.timeout);
    if (
      deferredChartContextFullReplacementRef.current === pending.sourceDataContextSig
    ) {
      deferredChartContextFullReplacementRef.current = '';
    }
    if (!isChartContextActivationScopeCurrent(pending)) {
      return;
    }
    if (message.hit !== true) {
      paintedChartContextLruRef.current.delete(pending.dataContextSig);
      pending.commit(false);
      return;
    }

    const lru = paintedChartContextLruRef.current;
    lru.delete(pending.dataContextSig);
    lru.set(pending.dataContextSig, {
      generation: pending.generation,
      visualShellSig: pending.visualShellSig,
      displayDecimals: pending.displayDecimals,
    });
    preactivatedChartContextRef.current = {
      dataContextSig: pending.dataContextSig,
      paintToken: pending.paintToken,
      generation: pending.generation,
      visualShellSig: pending.visualShellSig,
    };
    pending.commit(true);
  }, [isChartContextActivationScopeCurrent]);
  useEffect(() => {
    paintedChartContextLruRef.current.clear();
    cancelPendingChartContextActivation();
  }, [
    cancelPendingChartContextActivation,
    chartWebViewGeneration,
    currentSig,
  ]);
  useEffect(() => {
    const lastCandle = sanitizedCandles[sanitizedCandles.length - 1];
    if (!lastCandle) {
      chartCandleFrontendPaintRef.current = null;
      return;
    }

    const signature = `${chartDataContextSig}:${currentSig}:${sanitizedCandles.length}:${lastCandle.time}:${lastCandle.open}:${lastCandle.high}:${lastCandle.low}:${lastCandle.close}`;
    if (chartCandleFrontendPaintRef.current?.signature === signature) {
      return;
    }

    chartCandleFrontendPaintRef.current = {
      availableAt: Date.now(),
      length: sanitizedCandles.length,
      signature,
    };
  }, [chartDataContextSig, currentSig, sanitizedCandles]);

  useEffect(() => {
    // Config changed — previous CHART_READY is stale.
    if (lastInitSigRef.current !== currentSig) {
      const renderedContextToClear =
        renderedDataContextSigRef.current || lastInitDispatchRef.current.dataContextSig;
      chartInitializedRef.current = false;
      lastInitAttemptSigRef.current = '';
      lastInitDispatchRef.current = {
        signature: '',
        configSig: '',
        dataContextSig: '',
        dataContextEpoch: -1,
        at: 0,
      };
      pendingChartDataPaintRef.current = {
        token: '',
        dataContextSig: '',
        confirmsUsableChart: false,
        retryScript: '',
        startedAt: 0,
        ackRetryCount: 0,
        lastAckRetryAt: 0,
      };
      renderedSeriesSnapshotRef.current = EMPTY_CHART_SERIES_SNAPSHOT;
      renderedRenkoSeriesSnapshotRef.current = EMPTY_CHART_SERIES_SNAPSHOT;
      renderedDataContextSigRef.current = '';
      lastInjectedLiveQuoteSignatureRef.current = '';
      historylessBootstrapViewportRef.current = EMPTY_HISTORYLESS_BOOTSTRAP_VIEWPORT;
      clearRenderedMarketPriceLines(renderedContextToClear);
      setChartCanvasReady(false);
      setChartPlotArea(null);
      chartVisiblePriceRangeRef.current = null;
    }
  }, [clearRenderedMarketPriceLines, currentSig]);

  useEffect(() => {
    const renderedContextToClear =
      renderedDataContextSigRef.current || lastInitDispatchRef.current.dataContextSig;
    clearRenderedMarketPriceLines(renderedContextToClear);
    renderedDataContextSigRef.current = '';
    pendingChartDataPaintRef.current = {
      token: '',
      dataContextSig: '',
      confirmsUsableChart: false,
      retryScript: '',
      startedAt: 0,
      ackRetryCount: 0,
      lastAckRetryAt: 0,
    };
    chartLiveTickAccumulatorRef.current = null;
    publishChartLiveOhlc(null);
    lastInjectedDrawingSyncRef.current = { signature: '', epoch: -1 };
    lastWebViewDrawingSignatureRef.current = '';
    chartVisiblePriceRangeRef.current = null;
  }, [chartDataContextSig, clearRenderedMarketPriceLines, publishChartLiveOhlc]);

  // The retained WebView intentionally survives symbol/timeframe switches.
  // Push the selected timeframe through a strict bridge setter so a normal
  // candle countdown cannot keep an old interval. Renko is price-driven, not
  // time-driven, so it deliberately has no expiry time below the live price.
  useEffect(() => {
    if (!webViewRef.current || !webViewReady) {
      return;
    }

    try {
      webViewRef.current.injectJavaScript(`
        if (typeof setCandleCountdownTimeframe === 'function') {
          setCandleCountdownTimeframe(
            ${JSON.stringify(chartTimeframe)},
            ${JSON.stringify(chartDataContextSig)}
          );
        }
        if (typeof setCandleCountdownActive === 'function') {
          setCandleCountdownActive(${chartRuntimeActive && chartDisplay.showLivePriceLine && !isChartMarketClosed && chartType !== 'renko'});
        }
        true;
      `);
    } catch (_e) {
      /* WebView may have been disposed */
    }
  }, [
    chartDataContextSig,
    chartDisplay.showLivePriceLine,
    chartRuntimeActive,
    chartTimeframe,
    chartType,
    chartWebViewGeneration,
    isChartMarketClosed,
    webViewReady,
  ]);

  // Retain the chart document and live data, but stop its housekeeping clocks
  // when another screen is visible or the app is in the background.
  useEffect(() => {
    const webView = webViewRef.current;
    if (!webView || !webViewReady) return;
    let disposed = false;
    const syncRuntime = (state: AppStateStatus) => {
      if (disposed) return;
      const active = chartRuntimeActive && (state == null || state === 'active');
      try {
        webView.injectJavaScript(`
          if (typeof setChartRuntimeActive === 'function') setChartRuntimeActive(${active});
          true;
        `);
      } catch (_error) { /* The retained WebView may have been disposed. */ }
    };
    syncRuntime(AppState.currentState);
    const subscription = AppState.addEventListener('change', syncRuntime);
    return () => {
      disposed = true;
      subscription.remove();
      try {
        webView.injectJavaScript(`
          if (typeof setChartRuntimeActive === 'function') setChartRuntimeActive(false);
          true;
        `);
      } catch (_error) { /* The retained WebView may have been disposed. */ }
    };
  }, [chartRuntimeActive, chartWebViewGeneration, webViewReady]);

  // Core init function — safe to call repeatedly.
  // The WebView's initChart tears down any existing chart and rebuilds.
  const sendInit = useCallback((force: boolean = false) => {
    if (!webViewRef.current || !webViewReady) return;

    // Once the current chart config is already live, incremental candle sync
    // handles backend candle updates. Avoid re-mapping the full merged series on
    // every tick just to discover init is already current.
    if (currentSig === lastInitSigRef.current && chartInitializedRef.current) return;

    const { projection, hasHistoryCandles } = readCurrentProjectedChartCandles();
    const data = projection.candles;
    retainCurrentChartCandles(data);
    const initSnapshot = buildChartSeriesSnapshot(data);
    const initAttemptSig = buildChartInitSignature(
      chartDataContextEpoch,
      `${chartDataContextSig}:${currentSig}:${getChartSnapshotSignature(initSnapshot)}`,
    );
    const now = Date.now();
    const recentInitInFlight =
      !chartInitializedRef.current &&
      lastInitDispatchRef.current.configSig === currentSig &&
      lastInitDispatchRef.current.dataContextSig === chartDataContextSig &&
      lastInitDispatchRef.current.dataContextEpoch === chartDataContextEpoch &&
      now - lastInitDispatchRef.current.at < CHART_INIT_RETRY_MIN_MS;
    if (!force && recentInitInFlight) return;
    if (!force && initAttemptSig === lastInitAttemptSigRef.current) return;

    const mapped = data.length > 0 ? buildMappedData(data) : [];
    const retainedManualPriceScale = chartManualPriceScaleRef.current;

    const js = `
      var retainedManualPriceScale = ${JSON.stringify(retainedManualPriceScale)};
      initChart(${JSON.stringify(chartOptions)}, ${JSON.stringify(chartType)}, ${JSON.stringify(mapped)}, ${displayDecimals}, ${showChartVolumePane}, ${JSON.stringify(initAttemptSig)}, ${JSON.stringify(currentSig)}, ${JSON.stringify(chartDataContextSig)});
      if (retainedManualPriceScale && typeof window.__rtx5RestoreManualPriceScale === 'function') {
        window.__rtx5RestoreManualPriceScale(retainedManualPriceScale);
      }
      if (typeof setPeriodSeparators === 'function') {
        setPeriodSeparators(${JSON.stringify(periodSeparatorPayload)}, ${JSON.stringify(periodSeparatorOptions)});
      }
      true;
    `;
    try {
      webViewRef.current.injectJavaScript(js);
      if (!hasHistoryCandles && initSnapshot.length > 0) {
        historylessBootstrapViewportRef.current = {
          contextKey: chartDataContextSig,
          snapshot: initSnapshot,
        };
      }
      lastInitAttemptSigRef.current = initAttemptSig;
      lastInitDispatchRef.current = {
        signature: initAttemptSig,
        configSig: currentSig,
        dataContextSig: chartDataContextSig,
        dataContextEpoch: chartDataContextEpoch,
        at: now,
      };
    } catch (_e) { /* WebView may have been disposed */ }
  }, [webViewReady, currentSig, chartDataContextSig, chartDataContextEpoch, chartOptions, chartType, displayDecimals, buildMappedData, readCurrentProjectedChartCandles, retainCurrentChartCandles, showChartVolumePane, periodSeparatorOptions, periodSeparatorPayload]);

  // Effect 1 — request initChart whenever data or config changes.
  useEffect(() => {
    sendInit();
  }, [readRenderableCanonicalCandles, sanitizedCandles, sendInit]);

  useEffect(() => {
    if (!webViewRef.current || !chartInitializedRef.current || !chartCanvasReady) {
      return;
    }

    try {
      webViewRef.current.injectJavaScript(`
        if (typeof setDisplayDecimals === 'function') {
          setDisplayDecimals(${displayDecimals});
        }
        true;
      `);
    } catch (_e) {
      /* WebView may have been disposed */
    }
  }, [chartCanvasReady, chartReadyEpoch, displayDecimals]);

  /**
   * IMPORTANT LIVE-CANDLE / LIVE-PRICE-LINE CONTRACT — DO NOT CHANGE, REMOVE,
   * SPLIT, OR DELAY THIS BLOCK WITHOUT RE-VERIFYING BOTH ITEMS TOGETHER.
   *
   * Every accepted live Bid received from the backend is first applied to the
   * forming candle's close. That same accepted close is then sent as the ONE
   * right-side live Bid line in the same revision. Therefore, when the backend
   * Bid moves up or down, the forming candle and its live price line must move
   * up or down together—neither one is allowed to update independently.
   *
   * This is the shared broker-neutral path for authenticated brokers, the
   * logged-out public feed, and future brokers that use the standard quote
   * transport. Separating the candle update from the line update can restore
   * the old frozen or mismatched live-price-line problem.
   */
  useEffect(() => {
    if (
      !marketDemandAllowed ||
      !chartSurfaceReady ||
      (!isPublicDemoMarket && (!isLoggedIn || !activeChartSessionCacheNamespace))
    ) {
      return;
    }

    let livePaintFrame: number | null = null;
    let livePaintTimer: ReturnType<typeof setTimeout> | null = null;
    let livePaintPending = false;
    let pendingAllowUnchangedSnapshot = false;
    let disposed = false;

    const cancelLivePaintSchedule = () => {
      if (livePaintFrame !== null) {
        try {
          if (typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(livePaintFrame);
          }
        } catch (_e) {
          /* already fired */
        }
        livePaintFrame = null;
      }
      if (livePaintTimer !== null) {
        clearTimeout(livePaintTimer);
        livePaintTimer = null;
      }
    };

    const cachedExactQuote = captureExactChartQuote(
      chartTradeDisplayQuoteScopeKey,
      getCurrentLiveQuoteSnapshot(chartSymbol) as ExactChartQuoteInput | undefined,
    );
    if (cachedExactQuote) {
      retainedChartTradeDisplayQuoteRef.current = selectNewestExactChartQuote(
        retainedChartTradeDisplayQuoteRef.current,
        cachedExactQuote,
      );
    }

    const paintCanonicalLiveTick = (allowUnchangedSnapshot = false) => {
      const canonicalCandles = readRenderableCanonicalCandles();
      const exactQuote = readExactChartQuoteForScope(
        chartTradeDisplayQuoteScopeKey,
        retainedChartTradeDisplayQuoteRef.current,
      );
      if (isChartMarketClosed) {
        chartLiveTickAccumulatorRef.current = null;
        publishChartLiveOhlc(null);
      } else if (exactQuote) {
        accumulateCurrentChartBid(exactQuote, canonicalCandles);
      }
      const projection = projectChartLiveTickCandles(
        canonicalCandles,
        chartLiveTickAccumulatorRef.current,
        chartDataContextSig,
      );
      const renderableCandles = projection.candles;
      if (renderableCandles.length === 0) {
        return;
      }

      retainCurrentChartCandles(renderableCandles);

      if (
        !webViewRef.current ||
        !chartInitializedRef.current ||
        !chartCanvasReady ||
        renderedDataContextSigRef.current !== chartDataContextSig
      ) {
        return;
      }

      const previousSnapshot = renderedSeriesSnapshotRef.current;
      const nextSnapshot = buildChartSeriesSnapshot(renderableCandles);
      // A single live source candle may create, replace, or remove multiple
      // synthetic bricks. Diff that transformed sequence independently and use
      // a full reload whenever it is not a safe one-brick incremental update.
      const mappedRenkoData = chartType === 'renko'
        ? buildMappedData(renderableCandles)
        : null;
      const nextRenkoSnapshot = mappedRenkoData
        ? buildChartSeriesSnapshot(mappedRenkoData)
        : EMPTY_CHART_SERIES_SNAPSHOT;
      const renkoUpdateMode = mappedRenkoData
        ? getChartSeriesUpdateMode(renderedRenkoSeriesSnapshotRef.current, nextRenkoSnapshot)
        : 'noop';
      const resetForClosedMarketClamp = shouldResetViewportForClosedMarketClamp(
        previousSnapshot,
        nextSnapshot,
        isChartMarketClosed,
      );
      const pendingHistorylessBootstrap = historylessBootstrapViewportRef.current;
      const resetForHistorylessBootstrap = shouldResetViewportForHistorylessBootstrap(
        pendingHistorylessBootstrap.contextKey,
        chartDataContextSig,
        pendingHistorylessBootstrap.snapshot,
        nextSnapshot,
        chartHasHistoryCandles,
      );
      const usableHistoryPaintAlreadyPending =
        resetForHistorylessBootstrap
        && pendingChartDataPaintRef.current.confirmsUsableChart
        && pendingChartDataPaintRef.current.dataContextSig === chartDataContextSig
        && pendingChartDataPaintRef.current.token.length > 0;
      if (usableHistoryPaintAlreadyPending) {
        // The accepted acknowledgement replays the newest retained live tick.
        // Do not replace the reset-owning token while its paint is in flight.
        return;
      }
      const resetVisibleRange = resetForClosedMarketClamp || resetForHistorylessBootstrap;
      const updateMode = getChartSeriesUpdateMode(renderedSeriesSnapshotRef.current, nextSnapshot);
      if (
        updateMode !== 'incremental' &&
        updateMode !== 'full_reload' &&
        !(allowUnchangedSnapshot && updateMode === 'noop')
      ) {
        return;
      }

      const canonicalLastCandle = renderableCandles[renderableCandles.length - 1];
      const lastCandle = mappedRenkoData
        ? mappedRenkoData[mappedRenkoData.length - 1]
        : canonicalLastCandle;
      if (!canonicalLastCandle || !lastCandle) {
        return;
      }

      // The accumulator made this forming close from the exact backend Bid.
      // The line must use that accepted close so a frame can never show two
      // different live generations like the pre-fix recordings did.
      const exactBidLine = exactQuote ? canonicalLastCandle.close : null;
      const shouldShowExactBidLine =
        chartDisplay.showLivePriceLine && exactBidLine !== null;
      const revision = livePaintRevisionRef.current + 1;
      const liveUpdate = {
        candle: buildChartTickPayload(lastCandle, chartType),
        dataContextSig: chartDataContextSig,
        livePrice: exactBidLine,
        showLivePriceLine: shouldShowExactBidLine,
        revision,
      };
      let issuedPaintToken = '';

      try {
        let fullReloadScript = '';
        if (
          updateMode === 'full_reload'
          || renkoUpdateMode === 'full_reload'
          || resetForHistorylessBootstrap
        ) {
          if (shouldDeferOutgoingChartContextFullReplacement(chartDataContextSig)) {
            return;
          }
          issuedPaintToken = issueChartDataPaintToken(
            chartDataContextSig,
            chartHasHistoryCandles,
          );
          fullReloadScript = `
            if (typeof updateChartData === 'function') {
              updateChartData(${JSON.stringify(mappedRenkoData ?? buildMappedData(renderableCandles))}, {
                preserveVisibleLogicalSpan: ${!resetVisibleRange},
                resetVisibleRange: ${resetVisibleRange},
                dataContextSig: ${JSON.stringify(chartDataContextSig)},
                paintToken: ${JSON.stringify(issuedPaintToken)}
              });
            }
          `;
        }

        const chartPaintTransaction = `
          ${fullReloadScript}
          if (typeof updateLiveTick === 'function') {
            updateLiveTick(${JSON.stringify(liveUpdate)});
          }
          true;
        `;
        if (issuedPaintToken) {
          retainChartDataPaintRetryScript(issuedPaintToken, chartPaintTransaction);
        }
        webViewRef.current.injectJavaScript(chartPaintTransaction);
        if (!chartHasHistoryCandles) {
          historylessBootstrapViewportRef.current = {
            contextKey: chartDataContextSig,
            snapshot: nextSnapshot,
          };
        }
        livePaintRevisionRef.current = revision;
        renderedSeriesSnapshotRef.current = nextSnapshot;
        if (mappedRenkoData) {
          renderedRenkoSeriesSnapshotRef.current = nextRenkoSnapshot;
        }
        lastInjectedLiveQuoteSignatureRef.current = !chartDisplay.showLivePriceLine
          ? 'off'
          : exactBidLine === null
            ? 'na'
            : exactBidLine.toFixed(displayDecimals);
      } catch (_e) {
        if (
          pendingChartDataPaintRef.current.token === issuedPaintToken
          && !pendingChartDataPaintRef.current.confirmsUsableChart
        ) {
          pendingChartDataPaintRef.current = {
            token: '',
            dataContextSig: '',
            confirmsUsableChart: false,
            retryScript: '',
            startedAt: 0,
            ackRetryCount: 0,
            lastAckRetryAt: 0,
          };
        }
      }
    };

    const flushCanonicalLivePaint = () => {
      cancelLivePaintSchedule();
      if (disposed || !livePaintPending) return;
      const allowUnchangedSnapshot = pendingAllowUnchangedSnapshot;
      livePaintPending = false;
      pendingAllowUnchangedSnapshot = false;
      paintCanonicalLiveTick(allowUnchangedSnapshot);
    };

    const scheduleCanonicalLivePaint = (allowUnchangedSnapshot = false) => {
      if (disposed) return;
      livePaintPending = true;
      pendingAllowUnchangedSnapshot =
        pendingAllowUnchangedSnapshot || allowUnchangedSnapshot;
      if (livePaintFrame !== null || livePaintTimer !== null) return;

      // Keep only the latest transaction under high-TPS feeds. rAF is the fast
      // path; the simultaneous timeout guarantees hidden/background Android
      // frames cannot strand the host bridge forever.
      livePaintTimer = setTimeout(
        flushCanonicalLivePaint,
        CHART_LIVE_PAINT_FALLBACK_MS,
      );
      try {
        if (typeof requestAnimationFrame === 'function') {
          livePaintFrame = requestAnimationFrame(flushCanonicalLivePaint);
        }
      } catch (_e) {
        livePaintFrame = null;
      }
    };
    paintCanonicalLiveTickRef.current = scheduleCanonicalLivePaint;

    // Route resume and visibility-setting changes repaint one complete
    // candle+Bid transaction immediately. This avoids exposing a current
    // horizontal line against an older retained candle while waiting for the
    // next broker tick.
    livePaintPending = true;
    pendingAllowUnchangedSnapshot = true;
    flushCanonicalLivePaint();
    const releaseCandleConsumer = isPublicDemoMarket
      ? () => { }
      : liveCandlesEngine.subscribe(
        chartSymbol,
        chartTimeframe,
        scheduleCanonicalLivePaint,
      );
    const retainLatestChartTradeDisplayQuote = (tick: QuoteTickEvent) => {
      if (normalizeSymbol(tick.symbol) !== normalizeSymbol(chartSymbol)) {
        return;
      }
      if (!isPublicDemoMarket) {
        const capture = captureActiveBrokerSession();
        if (!capture || capture.session.cacheNamespace !== activeChartSessionCacheNamespace) {
          return;
        }
      }
      const exactQuote = captureExactChartQuote(chartTradeDisplayQuoteScopeKey, tick);
      if (!exactQuote) return;
      const canonicalCandles = readRenderableCanonicalCandles();
      const previousAccumulator = chartLiveTickAccumulatorRef.current;
      const nextAccumulator = isChartMarketClosed
        ? previousAccumulator
        : accumulateCurrentChartBid(exactQuote, canonicalCandles);
      if (nextAccumulator === previousAccumulator && previousAccumulator) {
        return;
      }
      retainedChartTradeDisplayQuoteRef.current = exactQuote;
      scheduleCanonicalLivePaint(true);
    };
    const releaseQuoteDemand = isPublicDemoMarket
      ? orrnnDemoPublicMarketSocket.subscribeToSymbol(
        chartSymbol,
        retainLatestChartTradeDisplayQuote,
      )
      : quotesWsService.subscribeToSymbol(
        chartSymbol,
        retainLatestChartTradeDisplayQuote,
      );
    return () => {
      disposed = true;
      cancelLivePaintSchedule();
      releaseQuoteDemand();
      releaseCandleConsumer();
      if (paintCanonicalLiveTickRef.current === scheduleCanonicalLivePaint) {
        paintCanonicalLiveTickRef.current = () => { };
      }
    };
  }, [
    activeChartSessionCacheNamespace,
    accumulateCurrentChartBid,
    buildMappedData,
    chartCanvasReady,
    chartDataContextSig,
    chartHasHistoryCandles,
    chartDisplay.showLivePriceLine,
    chartReadyEpoch,
    chartSurfaceReady,
    chartSymbol,
    chartTradeDisplayQuoteScopeKey,
    chartTimeframe,
    chartType,
    displayDecimals,
    isLoggedIn,
    isPublicDemoMarket,
    isChartMarketClosed,
    marketDemandAllowed,
    issueChartDataPaintToken,
    retainChartDataPaintRetryScript,
    publishChartLiveOhlc,
    readRenderableCanonicalCandles,
    retainCurrentChartCandles,
    shouldDeferOutgoingChartContextFullReplacement,
  ]);

  useEffect(() => {
    if (!observedExactChartQuote) return;
    const current = retainedChartTradeDisplayQuoteRef.current;
    const selected = selectNewestExactChartQuote(current, observedExactChartQuote);
    if (selected === current) return;
    retainedChartTradeDisplayQuoteRef.current = selected;
    // A REST snapshot can arrive after trading stops without a candle event.
    // Only a strictly newer observer snapshot may schedule a paint; delayed
    // 400 ms store replays can never overwrite the direct socket writer.
    paintCanonicalLiveTickRef.current(true);
  }, [observedExactChartQuote]);

  // Effect 2 — keep full history/replacement data aligned with the WebView.

  useEffect(() => {
    if (!webViewRef.current || !chartInitializedRef.current || !chartCanvasReady) {
      return;
    }

    // The React notification is intentionally isolated at 400 ms, so always
    // read the engine's current series when a full replacement is required.
    // This prevents history/pagination paint from overwriting a newer live tick
    // with the older React snapshot that merely triggered this effect.
    const canonicalCandles = readRenderableCanonicalCandles();
    const baseRenderableCandles = resolveContextScopedChartCandles(
      chartDataContextSig,
      canonicalCandles,
      {
        contextKey: candlesRefContextSigRef.current,
        candles: candlesRef.current,
      },
    );
    const replacementExactQuote = readExactChartQuoteForScope(
      chartTradeDisplayQuoteScopeKey,
      retainedChartTradeDisplayQuoteRef.current,
    );
    if (isChartMarketClosed) {
      chartLiveTickAccumulatorRef.current = null;
      publishChartLiveOhlc(null);
    } else if (replacementExactQuote) {
      accumulateCurrentChartBid(replacementExactQuote, baseRenderableCandles);
    }
    const replacementProjection = projectChartLiveTickCandles(
      baseRenderableCandles,
      chartLiveTickAccumulatorRef.current,
      chartDataContextSig,
    );
    const renderableCandles = replacementProjection.candles;
    const contextChanged = renderedDataContextSigRef.current !== chartDataContextSig;
    if (renderableCandles.length === 0) {
      if (contextChanged) {
        const emptyPaintToken = issueChartDataPaintToken(chartDataContextSig, false);
        try {
          // Clear the old symbol while new history loads, so stale candles
          // cannot flash under the loader.
          webViewRef.current.injectJavaScript(`
            updateChartData([], {
              resetVisibleRange: true,
              dataContextSig: ${JSON.stringify(chartDataContextSig)},
              paintToken: ${JSON.stringify(emptyPaintToken)}
            });
            true;
          `);
          renderedDataContextSigRef.current = chartDataContextSig;
        } catch (_e) {
          if (pendingChartDataPaintRef.current.token === emptyPaintToken) {
            pendingChartDataPaintRef.current = {
              token: '',
              dataContextSig: '',
              confirmsUsableChart: false,
              retryScript: '',
              startedAt: 0,
              ackRetryCount: 0,
              lastAckRetryAt: 0,
            };
          }
          /* WebView may have been disposed */
        }
      }
      renderedSeriesSnapshotRef.current = EMPTY_CHART_SERIES_SNAPSHOT;
      renderedRenkoSeriesSnapshotRef.current = EMPTY_CHART_SERIES_SNAPSHOT;
      return;
    }

    const previousSnapshot = renderedSeriesSnapshotRef.current;
    const nextSnapshot = buildChartSeriesSnapshot(renderableCandles);
    // History refreshes use the same transformed-output diff as the live path;
    // comparing only source candles would miss Renko path rewrites.
    const mappedRenkoData = chartType === 'renko'
      ? buildMappedData(renderableCandles)
      : null;
    const nextRenkoSnapshot = mappedRenkoData
      ? buildChartSeriesSnapshot(mappedRenkoData)
      : EMPTY_CHART_SERIES_SNAPSHOT;
    const renkoUpdateMode = mappedRenkoData
      ? getChartSeriesUpdateMode(renderedRenkoSeriesSnapshotRef.current, nextRenkoSnapshot)
      : 'noop';
    const resetForClosedMarketClamp = shouldResetViewportForClosedMarketClamp(
      previousSnapshot,
      nextSnapshot,
      isChartMarketClosed,
    );
    const pendingHistorylessBootstrap = historylessBootstrapViewportRef.current;
    const resetForHistorylessBootstrap = shouldResetViewportForHistorylessBootstrap(
      pendingHistorylessBootstrap.contextKey,
      chartDataContextSig,
      pendingHistorylessBootstrap.snapshot,
      nextSnapshot,
      chartHasHistoryCandles,
    );
    const usableHistoryPaintAlreadyPending =
      resetForHistorylessBootstrap
      && pendingChartDataPaintRef.current.confirmsUsableChart
      && pendingChartDataPaintRef.current.dataContextSig === chartDataContextSig
      && pendingChartDataPaintRef.current.token.length > 0;
    if (usableHistoryPaintAlreadyPending) {
      return;
    }
    const updateMode = contextChanged
      ? 'full_reload'
      : getChartSeriesUpdateMode(renderedSeriesSnapshotRef.current, nextSnapshot);

    if (typeof __DEV__ !== 'undefined' && __DEV__ && CHART_BRIDGE_DEBUG) {
      console.log('[CHART-BRIDGE] candle_sync_mode', {
        symbol: chartSymbol,
        timeframe: chartTimeframe,
        contextChanged,
        updateMode,
        count: renderableCandles.length,
      });
    }

    if (
      (updateMode === 'noop' || updateMode === 'incremental')
      && renkoUpdateMode !== 'full_reload'
      && !resetForHistorylessBootstrap
    ) {
      // Incremental live candles are painted by the direct canonical listener
      // above. Keeping this effect full-reload-only prevents a delayed 400 ms
      // React snapshot from rewinding a newer Bid candle/line transaction.
      return;
    }

    let didInject = false;
    let issuedPaintToken = '';
    const replacementLastCandle = renderableCandles[renderableCandles.length - 1] ?? null;
    const replacementLivePrice =
      chartDisplay.showLivePriceLine && replacementExactQuote && replacementLastCandle
        ? replacementLastCandle.close
        : null;
    const replacementLiveRevision = livePaintRevisionRef.current + 1;

    try {
      if (
        updateMode === 'full_reload'
        || renkoUpdateMode === 'full_reload'
        || resetForHistorylessBootstrap
      ) {
        const mapped = mappedRenkoData ?? buildMappedData(renderableCandles);
        if (mapped.length > 0) {
          if (shouldDeferOutgoingChartContextFullReplacement(chartDataContextSig)) {
            return;
          }
          issuedPaintToken = issueChartDataPaintToken(
            chartDataContextSig,
            chartHasHistoryCandles,
          );
          if (typeof __DEV__ !== 'undefined' && __DEV__ && CHART_BRIDGE_DEBUG) {
            console.log('[CHART-BRIDGE] inject_updateChartData', {
              symbol: chartSymbol,
              timeframe: chartTimeframe,
              count: mapped.length,
            });
          }
          const chartPaintTransaction = `
            updateChartData(${JSON.stringify(mapped)}, {
              resetVisibleRange: ${contextChanged || resetForClosedMarketClamp || resetForHistorylessBootstrap},
              dataContextSig: ${JSON.stringify(chartDataContextSig)},
              paintToken: ${JSON.stringify(issuedPaintToken)}
            });
            // A closed symbol may never emit another tick. Restore its retained
            // exact backend Bid in the same transaction that replaces candles.
            if (typeof setLivePriceLineForContext === 'function') {
              setLivePriceLineForContext(
                ${replacementLivePrice ?? 'null'},
                ${JSON.stringify(chartDataContextSig)},
                ${replacementLiveRevision}
              );
            }
            true;
          `;
          retainChartDataPaintRetryScript(issuedPaintToken, chartPaintTransaction);
          webViewRef.current.injectJavaScript(chartPaintTransaction);
          didInject = true;
        }
      }
    } catch (_e) {
      if (
        pendingChartDataPaintRef.current.token === issuedPaintToken
        && !pendingChartDataPaintRef.current.confirmsUsableChart
      ) {
        pendingChartDataPaintRef.current = {
          token: '',
          dataContextSig: '',
          confirmsUsableChart: false,
          retryScript: '',
          startedAt: 0,
          ackRetryCount: 0,
          lastAckRetryAt: 0,
        };
      }
    }

    if (didInject) {
      if (!chartHasHistoryCandles) {
        historylessBootstrapViewportRef.current = {
          contextKey: chartDataContextSig,
          snapshot: nextSnapshot,
        };
      }
      livePaintRevisionRef.current = replacementLiveRevision;
      renderedSeriesSnapshotRef.current = nextSnapshot;
      renderedRenkoSeriesSnapshotRef.current = mappedRenkoData
        ? nextRenkoSnapshot
        : EMPTY_CHART_SERIES_SNAPSHOT;
      renderedDataContextSigRef.current = chartDataContextSig;
      lastInjectedLiveQuoteSignatureRef.current = !chartDisplay.showLivePriceLine
        ? 'off'
        : replacementLivePrice === null
          ? 'na'
          : replacementLivePrice.toFixed(displayDecimals);
    }
  }, [
    sanitizedCandles,
    accumulateCurrentChartBid,
    chartCanvasReady,
    chartContextReplacementReplayRevision,
    chartReadyEpoch,
    chartType,
    buildMappedData,
    chartDataContextSig,
    chartHasHistoryCandles,
    chartDisplay.showLivePriceLine,
    chartSymbol,
    chartTradeDisplayQuoteScopeKey,
    chartTimeframe,
    displayDecimals,
    isChartMarketClosed,
    issueChartDataPaintToken,
    publishChartLiveOhlc,
    readRenderableCanonicalCandles,
    retainChartDataPaintRetryScript,
    shouldDeferOutgoingChartContextFullReplacement,
  ]);

  useEffect(() => {
    if (!webViewRef.current || !webViewReady) {
      return;
    }

    try {
      webViewRef.current.injectJavaScript(`
        if (typeof setPeriodSeparators === 'function') {
          setPeriodSeparators(${JSON.stringify(periodSeparatorPayload)}, ${JSON.stringify(periodSeparatorOptions)});
        }
        true;
      `);
    } catch (_e) { /* WebView may have been disposed */ }
  }, [webViewReady, chartReadyEpoch, periodSeparatorOptions, periodSeparatorPayload, periodSeparatorPayloadSignature]);

  useEffect(() => {
    if (!webViewRef.current || !chartInitializedRef.current || !chartCanvasReady) {
      return;
    }

    try {
      webViewRef.current.injectJavaScript(`
        try {
          if (typeof setLastPriceLineVisible === 'function') {
            setLastPriceLineVisible(${chartDisplay.showLastPriceLine});
          }
        } catch (_) {}
        true;
      `);
    } catch (_e) {
      /* WebView may have been disposed */
    }
  }, [chartCanvasReady, chartDisplay.showLastPriceLine, chartReadyEpoch]);

  // Recover both a missing CHART_READY and a lost data-paint acknowledgement.
  // A timeout may retry or rebuild the chart, but never reveal it by itself.
  useEffect(() => {
    if (!chartRuntimeActive) {
      if (watchdogRef.current) clearInterval(watchdogRef.current);
      return;
    }

    if (watchdogRef.current) clearInterval(watchdogRef.current);

    watchdogRef.current = setInterval(() => {
      if (!webViewReady) {
        return;
      }

      const now = Date.now();
      const pendingPaint = pendingChartDataPaintRef.current;
      const hasTimedOutCurrentUsablePaint =
        chartInitializedRef.current
        && pendingPaint.confirmsUsableChart
        && pendingPaint.token.length > 0
        && pendingPaint.dataContextSig === chartDataContextSigRef.current
        && pendingPaint.startedAt > 0
        && now - pendingPaint.startedAt >= CHART_WATCHDOG_INTERVAL_MS
        && (
          pendingPaint.lastAckRetryAt === 0
          || now - pendingPaint.lastAckRetryAt >= CHART_WATCHDOG_INTERVAL_MS
        );

      if (hasTimedOutCurrentUsablePaint) {
        if (
          pendingPaint.ackRetryCount < CHART_DATA_PAINT_ACK_RETRY_MAX
          && pendingPaint.retryScript.length > 0
        ) {
          try {
            // Re-run the exact idempotent replacement, not merely its ACK. If
            // Android silently dropped the original command there is nothing in
            // the WebView to acknowledge until setData runs successfully.
            webViewRef.current?.injectJavaScript(pendingPaint.retryScript);
            if (pendingChartDataPaintRef.current.token === pendingPaint.token) {
              pendingChartDataPaintRef.current = {
                ...pendingPaint,
                ackRetryCount: pendingPaint.ackRetryCount + 1,
                lastAckRetryAt: now,
              };
            }
          } catch (_e) {
            if (pendingChartDataPaintRef.current.token === pendingPaint.token) {
              pendingChartDataPaintRef.current = {
                ...pendingPaint,
                ackRetryCount: pendingPaint.ackRetryCount + 1,
                lastAckRetryAt: now,
              };
            }
          }
          return;
        }

        if (typeof __DEV__ !== 'undefined' && __DEV__ && CHART_BRIDGE_DEBUG) {
          console.log('[CHART WATCHDOG] paint acknowledgement missing, recreating chart surface');
        }
        recoverChartWebViewAfterPaintStall(
          pendingPaint.dataContextSig,
          chartDataContextEpochRef.current.epoch,
          chartWebViewGeneration,
        );
        return;
      }

      if (!chartInitializedRef.current) {
        if (typeof __DEV__ !== 'undefined' && __DEV__ && CHART_BRIDGE_DEBUG) {
          console.log('[CHART WATCHDOG] chart not confirmed, re-sending initChart');
        }
        sendInit(true);
      }
    }, CHART_WATCHDOG_INTERVAL_MS);

    return () => {
      if (watchdogRef.current) clearInterval(watchdogRef.current);
    };
  }, [
    chartRuntimeActive,
    chartWebViewGeneration,
    recoverChartWebViewAfterPaintStall,
    webViewReady,
    sendInit,
  ]);

  const tradeHistoryOverlay = useMemo(() => {
    // Execution times belong to canonical timeframe candles. Renko bricks use
    // synthetic times, so showing history there would point at the wrong brick.
    if (
      !preferencesHydrated
      || chartType === 'renko'
      || chartDisplay.showTradeHistory !== true
    ) {
      return {
        markers: EMPTY_CHART_OVERLAY_MARKERS,
        tradeHistorySegments: EMPTY_CHART_TRADE_HISTORY_SEGMENTS,
      };
    }

    return buildChartTradeHistoryOverlay({
      chartSymbol,
      chartTimeframe,
      candles: overlayMarkerCandles,
      openPositions: retainedChartTradeOpenings,
      deals: chartDeals,
      closedPositions,
      buyColor: resolvedChartColors.tradeOpen || '#2962FF',
      sellColor: T.trading.sell.primary || '#F23645',
    });
  }, [
    T.trading.sell.primary,
    chartDeals,
    chartDisplay.showTradeHistory,
    chartSymbol,
    chartTimeframe,
    chartType,
    closedPositions,
    overlayMarkerCandles,
    preferencesHydrated,
    retainedChartTradeOpenings,
    resolvedChartColors.tradeOpen,
  ]);
  const overlayMarkers = useMemo(() => {
    if (!preferencesHydrated || chartType === 'renko') {
      return EMPTY_CHART_OVERLAY_MARKERS;
    }

    // Pattern-tool markers remain separate from account history. Passing an
    // empty closed list prevents the legacy close-dot path from duplicating
    // the exact entry/exit arrows built above.
    const patternMarkers = buildChartOverlayMarkers({
      chartSymbol,
      candles: overlayMarkerCandles,
      closedPositions: EMPTY_CHART_QUERY_ROWS,
      showOnChart: chartShowOnChart,
      activeTool,
    });
    if (patternMarkers.length === 0) {
      return tradeHistoryOverlay.markers;
    }
    if (tradeHistoryOverlay.markers.length === 0) {
      return patternMarkers;
    }
    return [...patternMarkers, ...tradeHistoryOverlay.markers]
      .sort((left, right) => left.time - right.time || left.id.localeCompare(right.id));
  }, [
    activeTool,
    chartShowOnChart,
    chartSymbol,
    chartType,
    overlayMarkerCandles,
    preferencesHydrated,
    tradeHistoryOverlay.markers,
  ]);
  const overlayPriceLines = useMemo(
    () => {
      if (!preferencesHydrated) {
        return chartTradePreviewLines;
      }

      // Candle/history markers are built by the static memo above. This payload
      // call is intentionally price-lines-only, so quote/P&L commits cannot scan
      // closed history or sort the full candle series.
      const basePayload = buildChartOverlayPayload({
        chartSymbol,
        candles: EMPTY_DISPLAY_CANDLES,
        positions,
        orders,
        alerts,
        colors: resolvedChartColors,
        sellColor: T.trading.sell.primary,
        liveBid: hasLiveChartQuote ? overlayLiveBid : null,
        liveAsk: hasLiveChartQuote ? overlayLiveAsk : null,
        liveQuote: hasLiveChartQuote ? chartLiveQuote : undefined,
        showOnChart: chartShowOnChart,
        activeTool: CHART_NO_DRAWING_TOOL,
        allowPositionStopDragging: !existingPositionModifyBackendLocked,
      });
      const basePriceLines = Object.keys(chartPositionStopDragPreviews).length === 0
        ? basePayload.priceLines
        : basePayload.priceLines.map((line) => {
          if (!line.dragKey) {
            return line;
          }
          const previewPrice = chartPositionStopDragPreviews[line.dragKey];
          const target = parseChartPositionStopDragKey(line.dragKey);
          if (
            !target ||
            !Number.isFinite(previewPrice) ||
            previewPrice <= 0
          ) {
            return line;
          }
          const position = positions.find(
            (item) => String(item.id) === target.positionId,
          );
          const entryPrice = Number(position?.openPrice);
          if (!position || !Number.isFinite(entryPrice) || entryPrice <= 0) {
            return line;
          }

          const valueLabel = formatTpSlOverlayValueLabel(
            position.symbol,
            position.side,
            entryPrice,
            previewPrice,
            Number(position.volume),
          );
          return {
            ...line,
            price: previewPrice,
            title: formatTpSlOverlayLabel(
              target.kind,
              position.symbol,
              position.side,
              entryPrice,
              previewPrice,
              Number(position.volume),
            ),
            labelSideText: target.kind.toUpperCase(),
            labelValueText: valueLabel,
            labelValueColor: line.color,
          };
        });

      if (chartTradePreviewLines.length === 0) {
        return basePriceLines;
      }

      return [...basePriceLines, ...chartTradePreviewLines]
        .sort((left, right) => left.price - right.price);
    },
    [
      alerts,
      chartShowOnChart,
      chartSymbol,
      chartPositionStopDragPreviews,
      chartTradePreviewLines,
      existingPositionModifyBackendLocked,
      chartLiveQuote,
      hasLiveChartQuote,
      orders,
      overlayLiveAsk,
      overlayLiveBid,
      positions,
      preferencesHydrated,
      resolvedChartColors,
      T.trading.sell.primary,
    ],
  );
  const overlayPayload = useMemo(() => ({
    priceLines: overlayPriceLines,
    markers: overlayMarkers,
    tradeHistorySegments: tradeHistoryOverlay.tradeHistorySegments,
  }), [overlayMarkers, overlayPriceLines, tradeHistoryOverlay.tradeHistorySegments]);
  const overlayLabelSignature = useMemo(
    () => JSON.stringify(overlayPriceLines.map((line) => (
      line.id.startsWith('open-')
        ? {
          id: line.id,
          labelSideText: line.labelSideText,
          labelSideColor: line.labelSideColor,
        }
        : {
          id: line.id,
          title: line.title,
          labelSideText: line.labelSideText,
          labelValueText: line.labelValueText,
          labelSideColor: line.labelSideColor,
          labelValueColor: line.labelValueColor,
        }
    ))),
    [overlayPriceLines],
  );
  // Geometry-only signature (no live P/L text). Injecting the full overlay on
  // every bid/ask tick forced DOM label wipe/rebuild and made the horizontal
  // trade lines blink after place-order.
  const overlayPriceLineGeometrySignature = useMemo(
    () => JSON.stringify(overlayPriceLines.map((line) => ({
      id: line.id,
      price: line.price,
      color: line.color,
      lineWidth: line.lineWidth,
      lineStyle: line.lineStyle,
      labelPlacement: line.labelPlacement,
      labelMinTop: line.labelMinTop,
      dragKey: line.dragKey,
    }))),
    [overlayPriceLines],
  );
  const overlayMarkerGeometrySignature = useMemo(
    () => JSON.stringify(overlayMarkers.map((marker) => ({
      id: marker.id,
      time: marker.time,
      position: marker.position,
      price: marker.price,
      color: marker.color,
      shape: marker.shape,
      text: marker.text,
      size: marker.size,
    }))),
    [overlayMarkers],
  );
  const overlayTradeHistoryGeometrySignature = useMemo(
    () => JSON.stringify(tradeHistoryOverlay.tradeHistorySegments.map((segment) => ({
      id: segment.id,
      fromTime: segment.fromTime,
      fromPrice: segment.fromPrice,
      toTime: segment.toTime,
      toPrice: segment.toPrice,
      color: segment.color,
      lineWidth: segment.lineWidth,
    }))),
    [tradeHistoryOverlay.tradeHistorySegments],
  );
  const overlayGeometrySignature = useMemo(
    () => `${overlayPriceLineGeometrySignature}|${overlayMarkerGeometrySignature}|${overlayTradeHistoryGeometrySignature}`,
    [
      overlayMarkerGeometrySignature,
      overlayPriceLineGeometrySignature,
      overlayTradeHistoryGeometrySignature,
    ],
  );

  // ── DEBUG: Log overlay payload every time it changes ──
  // Keep the ref in sync so the onMessage CHART_READY handler can
  // immediately push the latest overlay without waiting for the effect.
  const applyLiveChartTradeOverlayQuote = useCallback((quote: ChartTradeOverlayLiveQuote) => {
    const patches = buildChartOpenPositionLabelPatches({
      chartSymbol,
      positions,
      colors: resolvedChartColors,
      sellColor: T.trading.sell.primary,
      liveBid: quote.bid,
      liveAsk: quote.ask,
      liveQuote: quote,
      showOnChart: chartShowOnChart,
    });
    latestChartOpenPositionLabelPatchesRef.current = {
      contextKey: chartOpenPositionLabelPatchContextKey,
      patches,
    };
    if (patches.length === 0) {
      return;
    }

    const currentPayload = overlayPayloadRef.current;
    const nextPayload = applyChartOpenPositionLabelPatches(currentPayload, patches);
    if (nextPayload === currentPayload) {
      return;
    }
    overlayPayloadRef.current = nextPayload;

    if (!webViewRef.current || !webViewReady || !chartCanvasReady) {
      return;
    }
    try {
      webViewRef.current.injectJavaScript(`
        if (typeof updateOverlayTradeLabelValues === 'function') {
          updateOverlayTradeLabelValues(
            ${JSON.stringify(patches)},
            ${JSON.stringify(chartDataContextSig)}
          );
        }
        true;
      `);
    } catch (_e) {
      /* WebView may have been disposed */
    }
  }, [
    T.trading.sell.primary,
    chartCanvasReady,
    chartDataContextSig,
    chartOpenPositionLabelPatchContextKey,
    chartShowOnChart,
    chartSymbol,
    positions,
    resolvedChartColors,
    webViewReady,
  ]);

  useLayoutEffect(() => {
    const latestPatches = latestChartOpenPositionLabelPatchesRef.current;
    if (latestPatches.contextKey !== chartOpenPositionLabelPatchContextKey) {
      latestChartOpenPositionLabelPatchesRef.current = {
        contextKey: chartOpenPositionLabelPatchContextKey,
        patches: [],
      };
      overlayPayloadRef.current = overlayPayload;
      return;
    }
    overlayPayloadRef.current = applyChartOpenPositionLabelPatches(
      overlayPayload,
      latestPatches.patches,
    );
  }, [chartOpenPositionLabelPatchContextKey, overlayPayload]);
  useEffect(() => {
    if (!isScreenFocused || !preferencesHydrated || !webViewReady || !chartCanvasReady || !webViewRef.current) {
      return;
    }

    const alreadySyncedForCurrentChart =
      lastInjectedDrawingSyncRef.current.signature === chartDrawingSignature &&
      lastInjectedDrawingSyncRef.current.epoch === chartReadyEpoch;

    if (alreadySyncedForCurrentChart) {
      return;
    }

    const signatureCameFromWebView =
      lastWebViewDrawingSignatureRef.current === chartDrawingSignature &&
      lastInjectedDrawingSyncRef.current.epoch === chartReadyEpoch;

    if (signatureCameFromWebView) {
      lastInjectedDrawingSyncRef.current = { signature: chartDrawingSignature, epoch: chartReadyEpoch };
      return;
    }

    const drawingOwnerMismatch = shouldReleaseChartWindowOwnedAction(
      chartDrawingToolOwnerPaneIdRef.current,
      chartWindows.activePane.id,
    );
    const bridgedTool = chartLockAll || drawingOwnerMismatch
      ? CHART_NO_DRAWING_TOOL
      : activeTool;
    const shouldStartDrawing =
      !chartLockAll
      && !drawingOwnerMismatch
      && chartDrawingInputActive
      && isChartDrawingInputTool(bridgedTool);

    webViewRef.current.injectJavaScript(`
      window.__rtx5ChartWindowPaneId = ${JSON.stringify(chartWindows.activePane.id)};
      if (typeof setShowObjectDescriptions === 'function') {
        setShowObjectDescriptions(${chartDisplay.showObjectDescriptions === true});
      }
      if (typeof setSerializedDrawings === 'function') {
        setSerializedDrawings(${JSON.stringify(chartDrawingRecords)});
      }
      if (typeof setDrawingTool === 'function') {
        setDrawingTool(${JSON.stringify(bridgedTool)}, { startDrawing: ${shouldStartDrawing} });
      }
      true;
    `);
    lastInjectedDrawingSyncRef.current = { signature: chartDrawingSignature, epoch: chartReadyEpoch };
  }, [
    activeTool,
    chartCanvasReady,
    chartDisplay.showObjectDescriptions,
    chartDrawingInputActive,
    chartDrawingRecords,
    chartDrawingSignature,
    chartReadyEpoch,
    chartLockAll,
    chartWindows.activePane.id,
    isScreenFocused,
    preferencesHydrated,
    webViewReady,
  ]);

  // ── Chart Overlays Bridge ───────────────────────────────────────
  // Geometry inject (new/close trade, SL/TP price change) — rare.
  // Depends on geometry signature only so live P/L text does not re-push.
  useEffect(() => {
    if (!chartRuntimeActive || !webViewReady || !chartCanvasReady || !webViewRef.current) {
      return;
    }

    const latestPayload = overlayPayloadRef.current ?? overlayPayload;
    const js = `
      if (typeof setChartOverlays === 'function') {
        setChartOverlays(
          ${JSON.stringify(latestPayload)},
          ${JSON.stringify(chartDataContextSig)}
        );
      }
      true;
    `;
    webViewRef.current.injectJavaScript(js);
    const modifyState = chartModifyTicketStateRef.current;
    const selectedTicket = selectedChartPositionTicket;
    const eligibleRepaintPhase =
      modifyState.phase === 'saved' ||
      modifyState.phase === 'changed_elsewhere' ||
      modifyState.phase === 'position_unavailable';
    if (
      selectedTicket &&
      eligibleRepaintPhase &&
      modifyState.latestEligibleSequence >= modifyState.reconciliationFloorSequence &&
      modifyState.latestEligibleSequence > 0
    ) {
      const telemetryKey = [
        selectedTicket,
        modifyState.latestEligibleSequence,
        modifyState.phase,
        overlayGeometrySignature,
      ].join(':');
      if (lastModifyChartRepaintTelemetryRef.current !== telemetryKey) {
        lastModifyChartRepaintTelemetryRef.current = telemetryKey;
        const capture = captureActiveBrokerSession();
        recordMarketDataEvent('modify_position', {
          phase: 'chart_repaint_dispatched',
          brokerId: capture?.session.brokerId,
          ticket: selectedTicket,
          attemptId: modifyState.activeAttemptId,
          reconciliationSequence: modifyState.latestEligibleSequence,
          outcome: modifyState.phase,
          symbol: chartSymbol,
        });
      }
    }

    const hasOverlayContent =
      (latestPayload.priceLines?.length ?? 0) > 0
      || (latestPayload.markers?.length ?? 0) > 0
      || (latestPayload.tradeHistorySegments?.length ?? 0) > 0;
    if (!hasOverlayContent) {
      return;
    }

    // Self-heal only on geometry path (not on every P/L tick).
    const resyncInterval = setInterval(() => {
      if (!webViewRef.current) {
        return;
      }
      const payload = overlayPayloadRef.current ?? latestPayload;
      webViewRef.current.injectJavaScript(`
        if (typeof setChartOverlays === 'function') {
          setChartOverlays(
            ${JSON.stringify(payload)},
            ${JSON.stringify(chartDataContextSig)}
          );
        }
        true;
      `);
    }, 5000);

    return () => clearInterval(resyncInterval);
    // overlayPayload intentionally omitted: geometry signature is the gate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    chartRuntimeActive,
    overlayGeometrySignature,
    webViewReady,
    chartCanvasReady,
    chartDataContextSig,
    chartReadyEpoch,
    chartModifyTicketState.latestEligibleSequence,
    chartModifyTicketState.phase,
    chartSymbol,
    overlaySyncRevision,
    selectedChartPositionTicket,
  ]);

  // Structural/fallback label sync. Live open-position P/L bypasses this
  // parent effect through ChartTradeOverlayLiveBridge at zero-delay cadence.
  useEffect(() => {
    if (!chartRuntimeActive || !webViewReady || !chartCanvasReady || !webViewRef.current) {
      return;
    }
    const latestPayload = overlayPayloadRef.current;
    if (!latestPayload?.priceLines?.length && !latestPayload?.markers?.length) {
      return;
    }
    try {
      webViewRef.current.injectJavaScript(`
        if (typeof updateOverlayTradeLabels === 'function') {
          updateOverlayTradeLabels(
            ${JSON.stringify(latestPayload)},
            ${JSON.stringify(chartDataContextSig)}
          );
        }
        true;
      `);
    } catch (_e) {
      /* WebView may have been disposed */
    }
  }, [
    chartCanvasReady,
    chartDataContextSig,
    chartOpenPositionLabelPatchContextKey,
    chartReadyEpoch,
    chartRuntimeActive,
    overlayLabelSignature,
    webViewReady,
  ]);

  const displaySymbol = chartSymbol.replace(/\//g, '');
  const symbolName = resolveChartSymbolFullName(chartSymbol);
  const symbolCategory = resolveChartSymbolCategory(chartSymbol);
  const showChartMarketExecutionFooter =
    chartDisplay.showQuickTradingButtons || chartDirectProtectionActive;
  const compactVerticalChartWindow =
    chartWindows.isSplit && chartWindows.state.layout === 'vertical';
  const isDrawingToolActive = isChartDrawingInputTool(activeTool) || isChartDrawingInputTool(pendingChartDrawingTool);
  const compactHeaderDrawingIconColor = isDrawingToolActive ? BLUE : HEADER_CONTROL_COLOR;
  const chartSlTpBackendLocked = newMarketOrderProtectionBackendLocked;
  // Shared by two mount points: inline in the chart layer (normal flow) and
  // through ChartTradeFeedbackPortal while the SL/TP trade sheet is open, so
  // the confirmation is visible ABOVE the sheet where the trade was placed.
  const renderChartTradeReceiptBar = (receipt: NonNullable<typeof chartTradeReceipt>) => (
    <View
      pointerEvents="box-none"
      style={styles.chartTradeReceiptHost}
    >
      <View
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        accessibilityLabel={
          `${receipt.symbol}, ${receipt.sideAccessibilityLabel}, `
          + `${receipt.volumeLabel} lots, ${receipt.doneLabel}`
        }
        style={[
          styles.chartTradeReceiptBar,
          {
            borderLeftColor: receipt.side === 'buy'
              ? BLUE
              : T.trading.sell.primary,
          },
        ]}
      >
        <Text style={styles.chartTradeReceiptSymbol} numberOfLines={1}>
          {receipt.symbol}
        </Text>
        <Text
          style={[
            styles.chartTradeReceiptSide,
            {
              color: receipt.side === 'buy'
                ? BLUE
                : T.trading.sell.primary,
            },
          ]}
          numberOfLines={1}
        >
          {receipt.sideAccessibilityLabel}
        </Text>
        <Text style={styles.chartTradeReceiptVolume} numberOfLines={1}>
          {receipt.volumeLabel}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss trade confirmation"
          hitSlop={10}
          onPress={handleTradeFeedbackClose}
          style={styles.chartTradeReceiptDoneButton}
        >
          <Text style={styles.chartTradeReceiptDone} numberOfLines={1}>
            done
          </Text>
        </Pressable>
      </View>
    </View>
  );
  const renderCompactHeaderToolbar = () => (
    <>
      <View style={styles.compactHeaderToolbarSlot}>
        <Pressable
          testID="chart-crosshair-toggle"
          accessibilityRole="button"
          accessibilityLabel={t('Crosshair')}
          accessibilityHint={activeTool === CHART_CROSSHAIR_TOOL
            ? 'Drag to move the cursor; tap to measure price and time'
            : 'Show the chart cursor to inspect price and time'}
          accessibilityState={{ selected: activeTool === CHART_CROSSHAIR_TOOL }}
          style={styles.chartCrosshairButton}
          onPress={() => routeChartWindowToolbarAction('crosshair')}
          latencyLabel="chart.crosshair.toggle"
        >
          <TvCrosshair
            size={CHART_HEADER_ICON_SIZE}
            strokeWidth={2}
            color={HEADER_CONTROL_COLOR}
            active={activeTool === CHART_CROSSHAIR_TOOL}
          />
        </Pressable>
      </View>
      <View style={styles.compactHeaderToolbarSlot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Select Timeframe')}
          style={styles.toolbarTimeframeButton}
          onPress={() => routeChartWindowToolbarAction('timeframe')}
          hitSlop={8}
          unstable_pressDelay={0}
        >
          <Text style={styles.compactHeaderTimeframeText} numberOfLines={1} allowFontScaling={false}>
            {chartTimeframe}
          </Text>
        </Pressable>
      </View>

      <View style={styles.compactHeaderToolbarSlot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={chartSlTpBackendLocked ? 'SL/TP locked' : 'SL/TP'}
          accessibilityState={{
            disabled: chartSlTpBackendLocked,
            selected: chartDirectProtectionActive,
          }}
          disabled={chartSlTpBackendLocked}
          style={[
            styles.toolbarTradeButton,
            chartSlTpBackendLocked && styles.toolbarTradeButtonLocked,
          ]}
          onPress={() => routeChartWindowToolbarAction('sltp')}
          hitSlop={8}
          unstable_pressDelay={0}
        >
          <TvTradeClock
            size={CHART_HEADER_ICON_SIZE}
            color={chartDirectProtectionActive ? BLUE : (isDark ? '#B0BEC5' : HEADER_CONTROL_COLOR)}
          />
          {chartSlTpBackendLocked ? (
            <Ionicons name="lock-closed" size={10} color={HEADER_CONTROL_COLOR} />
          ) : null}
        </Pressable>
      </View>

      <View style={styles.compactHeaderToolbarSlot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Drawing tools"
          style={styles.toolbarIconButton}
          onPress={() => routeChartWindowToolbarAction('drawings')}
          hitSlop={8}
          unstable_pressDelay={0}
        >
          <Ionicons name="pencil-outline" size={CHART_HEADER_GLYPH_SIZE} color={compactHeaderDrawingIconColor} allowFontScaling={false} />
        </Pressable>
      </View>
      <View style={styles.compactHeaderToolbarSlot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="More chart actions"
          style={styles.toolbarIconButton}
          onPress={() => routeChartWindowToolbarAction('more')}
          hitSlop={8}
          unstable_pressDelay={0}
        >
          <Ionicons name="ellipsis-vertical" size={CHART_HEADER_GLYPH_SIZE} color={HEADER_CONTROL_COLOR} allowFontScaling={false} />
        </Pressable>
      </View>
    </>
  );
  const renderChartTradeSheetTopHeader = () => (
    <View
      style={[
        styles.chartTradeSheetHeader,
        useMtPendingTradeSheetLayout && styles.chartTradeSheetHeaderPending,
      ]}
    >
      <View style={styles.chartTradeSheetSymbolBlock}>
        <Pressable
          style={styles.chartTradeSheetSymbolButton}
          hitSlop={0}
          pressRetentionOffset={0}
          onPress={handleOpenSymbolPicker}
          activateOnPressIn
          activateOnTouchStart
          unstable_pressDelay={0}
        >
          <View style={styles.chartTradeSheetSymbolRow}>
            <Text style={styles.chartTradeSheetSymbolText} numberOfLines={1} adjustsFontSizeToFit>
              {displaySymbol}
            </Text>
            <Ionicons name="chevron-down" size={12} color={TEXT_MUTED} />
          </View>
          <Text style={styles.chartTradeSheetSymbolMeta} numberOfLines={1} adjustsFontSizeToFit>
            {symbolName}
          </Text>
        </Pressable>
      </View>
      <LiveQuotePairHeader
        bid={chartBid}
        ask={chartAsk}
        changePct={chartLiveQuote?.changePct}
        styles={styles}
        displayDecimals={displayDecimals}
      />
    </View>
  );
  const renderChartTradeSheetDragHeader = () => (
    <View
      collapsable={false}
      style={[
        styles.chartTradeSheetDragRegion,
        useMtPendingTradeSheetLayout && styles.chartTradeSheetDragRegionPending,
      ]}
    >
      <Pressable
        style={styles.chartTradeSheetHandleWrap}
        onPress={handleToggleChartTradeSheetMode}
        unstable_pressDelay={0}
      >
        <View style={styles.chartTradeSheetHandle} />
      </Pressable>
      <View style={[styles.chartTradeQuickBar, styles.chartTradeQuickBarActionsOnly]}>
        <View style={styles.chartTradeQuickActions}>
          <Pressable
            style={[
              styles.chartTradeQuickChip,
              styles.chartTradeQuickChipSl,
              chartTradeSlEnabled && styles.chartTradeQuickChipSlActive,
            ]}
            onPress={() => handleToggleChartTradeStopLevel('sl')}
            unstable_pressDelay={0}
          >
            <Text
              style={[
                styles.chartTradeQuickChipText,
                chartTradeSlEnabled && styles.chartTradeQuickChipTextActive,
              ]}
            >
              SL
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.chartTradeQuickChip,
              styles.chartTradeQuickChipTp,
              chartTradeTpEnabled && styles.chartTradeQuickChipTpActive,
            ]}
            onPress={() => handleToggleChartTradeStopLevel('tp')}
            unstable_pressDelay={0}
          >
            <Text
              style={[
                styles.chartTradeQuickChipText,
                chartTradeTpEnabled && styles.chartTradeQuickChipTextActive,
              ]}
            >
              TP
            </Text>
          </Pressable>
          <Pressable
            style={styles.chartTradeQuickExpandButton}
            onPress={handleToggleChartTradeSheetMode}
            unstable_pressDelay={0}
          >
            <Ionicons
              name={chartTradeSheetMode === 'expanded' ? 'chevron-down' : 'arrow-forward'}
              size={20}
              color={BLUE}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );

  const chartTradeOverlayLayer = (
    <ChartTradeOverlayLayer
      components={{
        LiveQuotePairHeader,
        LiveTradeButtons: ChartTradeButtons,
        PendingOrderPreviewChart,
        ChartTradeVolumeSlider,
        ChartFooterLotPicker,
      }}
      styles={styles}
      isDark={isDark}
      colors={{
        blue: BLUE,
        textMuted: TEXT_MUTED,
        sellPrimary: T.trading.sell.primary,
      }}
      symbolHeader={{
        displaySymbol,
        symbolName,
        chartBid,
        chartAsk,
        changePct: chartLiveQuote?.changePct,
        displayDecimals,
      }}
      sheet={{
        // Keep the Market Execution SL/TP panel warm so the toolbar can reveal
        // it immediately without mounting work on the tap frame.
        mountChartTradeSheet: isScreenFocused && !isChartExpanded,
        showChartTradeSheet,
        chartTradeSheetPortalEnabled,
        chartTradeSheetPortalKeepMounted: isScreenFocused && chartTradeSheetPortalEnabled,
        chartTradeSheetPortalVisible:
          isScreenFocused && chartTradeSheetPortalEnabled && showChartTradeSheet,
        chartTradeSheetPortalTop: chartTradeSheetHostTopOffset,
        chartTradeSheetPortalBottom: Math.max(0, safeInsets.bottom),
        showHiddenInlineTradeSheet: !isChartExpanded && showChartTradeSheet,
        showInlineFooterWhileSheetOpen: showInlineFooterWhileChartTradeSheetOpen && !isChartExpanded && showChartTradeSheet,
        showInlineFooterDockWhileSheetOpen: false,
        chartTradeSheetFrozenLayerHeight,
        chartTradeSheetCollapsedHeight,
        chartTradeSheetMaxHeight,
        chartTradeSheetAnimatedStyle,
        chartTradeSheetContentBottomPadding,
        chartTradeSheetBottomInset,
        showChartTradeSheetHeader,
        chartTradeCommentFocused,
        chartTradeSheetDragGesture,
        useMtPendingTradeSheetLayout,
        chartTradeSheetMode,
        chartTradeSheetScrollRef,
        chartTradeTypeTabsOverlayScrollRef,
        chartTradeTypeTabsInlineScrollRef,
        chartTradeOrderType,
        passiveLotDisplay,
        tradeVolume,
        tradeVolumeBounds,
        chartTradeVolumeDisplayMode,
        chartTradeVolumeInputFocused,
        chartTradeVolumeDraft,
        chartTradeVolumePrimaryDisplay,
        chartTradeVolumeModeLabel,
        chartTradeMarginEstimate: fmt.price(chartTradeMarginEstimate),
        chartTradeMaxVolumeDisplay,
        accountFreeMargin: fmt.price(accountFreeMargin),
        accountBalance: fmt.price(accountBalance),
        accountCurrency,
        chartTradePrice,
        chartTradeStopLimitPrice,
        isStopLimitChartOrder,
        chartTradeSlEnabled,
        chartTradeSlPrice,
        chartTradeTpEnabled,
        chartTradeTpPrice,
        chartPositionCandidates: chartMatchingPositionCandidates,
        chartSelectedPositionTicket: selectedChartPositionTicket,
        chartPositionSelectionInvalid:
          invalidatedChartPositionSymbol === normalizedChartPositionSymbol,
        chartModifyTicketState,
        chartModifyRateLimited,
        chartStopsTargetExistingPosition,
        chartDirectProtectionActive,
        chartProtectionBackendLocked,
        newMarketOrderProtectionBackendLocked,
        directMarketStopLossPrice,
        directMarketTakeProfitPrice,
        directMarketProtectionDraftId,
        chartTradeStopUnitOptions,
        chartTradeStopUnit,
        chartTradeSlLocked,
        chartTradeTpLocked,
        showChartTradeExpiration,
        chartTradeExpiration,
        showChartTradeComment,
        showFloatingChartTradeCommentEditor,
        chartTradeComment,
        chartTradeCommentInputRef,
        chartTradeEntryPrice,
        chartPointSize,
        chartProtectionTickSize,
        disablePendingTradePlaceButton,
        chartTradeCtaColor,
        candles: sanitizedCandles,
        chartSymbol,
        chartWindowPaneId: chartWindows.activePane.id,
        chartBid,
        chartAsk,
        chartTradeTickTimestamp,
        onTradeResult: handleChartTradeExecutionResult,
        onTradeQueueEvent: handleChartTradeQueueEvent,
      }}
      footer={{
        showFloatingFooterTradeRow: shouldMountFloatingFooterTradeRow,
        floatingFooterTradeRowVisible: isFloatingFooterTradeRowVisible,
        footerTradeRowKeyboardOffset,
        keyboardVisibleHeight,
        keyboardResizesHost: androidFooterHostResizedForKeyboard,
        footerKeyboardAvoidanceOffset,
        showFooterLotPicker,
        footerLotPickerMode,
        footerLotEditorFocused,
        lotInput,
        footerLotEditorInputRef,
        floatingChartTradeCommentOffset,
      }}
      handlers={{
        onOpenSymbolPicker: handleOpenSymbolPicker,
        onToggleSheetMode: handleToggleChartTradeSheetMode,
        onToggleStopLevel: handleToggleChartTradeStopLevel,
        onTradeSheetScroll: handleChartTradeSheetScroll,
        onOverlayTabsViewportLayout: handleOverlayTradeTypeTabsViewportLayout,
        onInlineTabsViewportLayout: handleInlineTradeTypeTabsViewportLayout,
        onOverlayTabLayout: handleOverlayTradeTypeTabLayout,
        onInlineTabLayout: handleInlineTradeTypeTabLayout,
        onSelectOrderType: handleChartTradeOrderTypeSelect,
        onOpenVolumeStepper: handleOpenChartTradeVolumeStepper,
        onFocusTradeVolumeInput: handleFocusChartTradeVolumeInput,
        onChangeTradeVolumeDraft: handleChartTradeVolumeDraftChange,
        onBlurTradeVolumeDraft: handleBlurChartTradeVolumeDraft,
        onEndTradeVolumeDraft: handleEndChartTradeVolumeDraft,
        onSubmitTradeVolumeDraft: handleSubmitChartTradeVolumeDraft,
        onToggleTradeVolumeDisplayMode: handleToggleChartTradeVolumeDisplayMode,
        onChangeTradeVolume: updateTradeVolume,
        onOpenPriceStepper: handleOpenChartTradePriceStepper,
        onOpenStopLimitPriceStepper: handleOpenChartTradeStopLimitPriceStepper,
        onEnableStops: handleEnableChartTradeStops,
        onSelectPositionTicket: handleSelectChartPositionTicket,
        onSelectStopUnit: handleSelectChartTradeStopUnit,
        onOpenSlStepper: handleOpenChartTradeSlStepper,
        onToggleSlLock: handleToggleChartTradeSlLock,
        onOpenTpStepper: handleOpenChartTradeTpStepper,
        onToggleTpLock: handleToggleChartTradeTpLock,
        onOpenExpirationMenu: handleOpenChartExpirationMenu,
        onChangeComment: handleChangeChartTradeComment,
        onBlurComment: handleBlurChartTradeComment,
        onSubmitComment: handleSubmitChartTradeComment,
        onPrepareCommentSubmit: handlePrepareChartTradeCommentSubmit,
        onFocusComment: handleFocusChartTradeComment,
        onSubmitPendingTrade: handleSubmitPendingTradeFromSheet,
        onEditLot: handleFocusFooterLotEditor,
        onOpenLotEditor: handleOpenFooterLotPicker,
        onLotDraftChange: handleFooterLotDraftChange,
        onLotDraftBlur: handleBlurFooterLotEditor,
        onLotDraftEndEditing: handleEndFooterLotEditor,
        onLotDraftSubmit: handleSubmitFooterLotEditor,
        onDecreaseLot: () => handleStepFooterLotEditor(-1),
        onIncreaseLot: () => handleStepFooterLotEditor(1),
        onCloseFooterLotPicker: handleCloseFooterLotPicker,
        onSelectFooterLot: handleSelectFooterLot,
      }}
    />
  );
  const chartTradeReceiptViewportReady =
    chartTapMenuViewport.width > 0 && chartTapMenuViewport.height > 0;
  const chartTradeReceiptViewportStyle = chartTradeReceiptViewportReady
    ? {
      left: Math.max(0, Math.round(chartTapMenuViewport.x - chartTradeSheetHostLeftOffset)),
      top: Math.max(0, Math.round(chartTapMenuViewport.y - chartTradeSheetHostTopOffset)),
      width: Math.round(chartTapMenuViewport.width),
      height: Math.round(chartTapMenuViewport.height),
    }
    : null;
  const auxiliaryTradeReceiptViewportReady =
    chartWindows.isSplit
    && auxiliaryChartPaneViewport !== null
    && auxiliaryChartPaneViewport.paneId !== chartWindows.activePane.id
    && chartWindows.state.panes.some(
      (pane) => pane.id === auxiliaryChartPaneViewport.paneId,
    )
    && !(isChartExpanded && chartWindows.toolbarTargetPaneId !== null);
  const auxiliaryTradeReceiptViewportStyle = auxiliaryTradeReceiptViewportReady
    && auxiliaryChartPaneViewport
    ? {
      left: Math.max(
        0,
        Math.round(auxiliaryChartPaneViewport.x - chartTradeSheetHostLeftOffset),
      ),
      top: Math.max(
        0,
        Math.round(auxiliaryChartPaneViewport.y - chartTradeSheetHostTopOffset),
      ),
      width: Math.round(auxiliaryChartPaneViewport.width),
      height: Math.round(auxiliaryChartPaneViewport.height),
    }
    : null;

  return (
    <Screen style={styles.screen} noBottomInset>
      <ChartTradeOverlayLiveBridge
        key={chartTradeDisplayQuoteScopeKey}
        active={chartRuntimeActive && chartCanvasReady && webViewReady}
        symbol={chartSymbol}
        onQuote={applyLiveChartTradeOverlayQuote}
      />
      <View style={styles.headerWrapper}>
        <View
          style={[styles.compactHeader, { paddingTop: chartHeaderTopPadding }]}
          onLayout={(event) => {
            const nextHeight = Math.max(0, Math.round(event.nativeEvent.layout.height));
            if (nextHeight > 0) {
              setChartTradeCompactHeaderHeight((current) => (current === nextHeight ? current : nextHeight));
            }
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Open menu')}
            style={styles.chartHeaderMenuButton}
            onPress={handleOpenSidebar}
            activateOnTouchStart
            latencyLabel="chartHeader.menu"
            hitSlop={{ top: 8, bottom: 8, left: 16, right: 6 }}
            unstable_pressDelay={0}
          >
            <AppMenuIcon color={HEADER_CONTROL_COLOR} />
          </Pressable>

          <ScrollView
            horizontal
            style={styles.compactHeaderActionsViewport}
            contentContainerStyle={styles.compactHeaderActionsContent}
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
          >
            {renderCompactHeaderToolbar()}
          </ScrollView>
        </View>
      </View>

      <BrokerFeedHealthBanner
        compact
        latencyLabel="chart.feedHealth.retry"
        style={{ marginHorizontal: 10, marginBottom: 6 }}
      />

      <View
        ref={chartTradeHostRef}
        style={styles.flex1}
        onLayout={(event) => {
          const nextHeight = Math.max(0, Math.round(event.nativeEvent.layout.height));
          const shouldRecordKeyboardFreeHostHeight =
            Platform.OS !== 'android' ||
            (
              keyboardVisibleHeight <= 0 &&
              !footerLotEditorFocused &&
              !footerLotEditorOpening &&
              !chartTradeCommentFocused
            );

          if (nextHeight > 0 && shouldRecordKeyboardFreeHostHeight) {
            setChartTradeKeyboardFreeHostHeight((current) => (
              current === nextHeight ? current : nextHeight
            ));
          }

          setChartTradeSheetHostHeight((current) => {
            return resolveChartTradeSheetHostHeight({
              currentHostHeight: current,
              nextHostHeight: nextHeight,
              freezeHostHeight: shouldFreezeChartTradeSheetHostHeight,
            });
          });
          requestAnimationFrame(() => {
            measureKeyboardDockAnchors(() => {
              recomputeKeyboardDockOffset();
            });
          });
        }}
      >
        <ScrollView
          // iOS: the outer scroll view must never steal a touch the chart
          // WebView is already tracking. With the default (true), UIScrollView
          // cancelled content touches and claimed every VERTICAL drag over the
          // chart before the async chartViewportTouchActive flip could disable
          // scrolling — vertical chart movement worked on Android (which honors
          // the WebView's disallow-intercept) but never on iOS.
          canCancelContentTouches={false}
          ref={chartScrollRef}
          style={styles.card}
          contentContainerStyle={[
            styles.chartScrollContent,
            isChartExpanded && { minHeight: fullscreenChartMinHeight },
          ]}
          nestedScrollEnabled
          scrollEnabled={!chartWindows.isSplit && !shouldCaptureChartGestures && !showChartTradeSheet && !chartViewportTouchActive && !footerLotEditorFocused}
          bounces={!chartWindows.isSplit && !shouldCaptureChartGestures && !showChartTradeSheet && !chartViewportTouchActive && !footerLotEditorFocused}
          // iOS: always-bounce let the scroll view engage its pan recognizer
          // for vertical drags even when nothing can scroll, eating the chart's
          // vertical pan. Regular scrolling (content overflow) is unaffected.
          alwaysBounceVertical={false}
          keyboardShouldPersistTaps="always"
          scrollEventThrottle={16}
          onScroll={() => syncChartViewportFrame()}
        >
          {!chartWindows.isSplit && !isChartExpanded && showChartMarketExecutionFooter && !chartOneClickPanelAtBottom && (
            <ChartTradeInlineFooter
              LiveTradeButtons={ChartTradeButtons}
              styles={styles}
              animatedStyle={floatingFooterTradeReserveAnimatedStyle}
              containerRef={footerTradeRowAnchorRef}
              isDark={isDark}
              buyColor={BLUE}
              sellColor={T.trading.sell.primary}
              hideInlineTradeRow={Platform.OS === 'android' && isFloatingFooterTradeRowVisible}
              showFloatingFooterTradeRow={shouldMountFloatingFooterTradeRow}
              chartSymbol={chartSymbol}
              chartWindowPaneId={chartWindows.activePane.id}
              displayDecimals={displayDecimals}
              tradeVolume={tradeVolume}
              tradeVolumeBounds={tradeVolumeBounds}
              comment={chartTradeComment}
              stopLossPrice={directMarketStopLossPrice}
              takeProfitPrice={directMarketTakeProfitPrice}
              protectionDraftId={directMarketProtectionDraftId}
              pointSize={chartProtectionTickSize ?? 0}
              onTradeResult={handleChartTradeExecutionResult}
              onTradeQueueEvent={handleChartTradeQueueEvent}
              onEditLot={handleFocusFooterLotEditor}
              onOpenLotEditor={handleOpenFooterLotPicker}
              isLotEditing={footerLotEditorFocused}
              lotDraft={lotInput}
              lotInputRef={footerLotEditorInputRef}
              onLotDraftChange={handleFooterLotDraftChange}
              onLotDraftBlur={handleBlurFooterLotEditor}
              onLotDraftEndEditing={handleEndFooterLotEditor}
              onLotDraftSubmit={handleSubmitFooterLotEditor}
              onDecreaseLot={() => handleStepFooterLotEditor(-1)}
              onIncreaseLot={() => handleStepFooterLotEditor(1)}
              lotInvalid={footerLotInvalid}
              invalidLotDisplay={footerLotInvalidDisplay}
              active={chartRuntimeActive}
              fallbackBid={chartTradeFooterFallbackBid}
              fallbackAsk={chartTradeFooterFallbackAsk}
              onLayout={(event) => {
                const nextHeight = Math.max(0, Math.round(event.nativeEvent.layout.height));
                if (nextHeight > 0) {
                  setChartTradeInlineFooterHeight((current) => (current === nextHeight ? current : nextHeight));
                }
                measureFooterTradeRowAnchorFrame();
              }}
            />
          )}
          <ChartWindowsLayout
            state={chartWindows.state}
            visualPreferencesByPane={chartWindowVisualPreferences}
            drawingsByPane={chartWindowDrawingRecordsByPane}
            viewportCommandsByPane={chartWindowViewportCommands}
            overlayPriceLinesByPane={chartWindowProtectionPriceLinesByPane}
            positions={positions}
            isScreenFocused={isScreenFocused}
            isDark={isDark}
            lotSize={tradeVolume}
            showTradeRow={!isChartExpanded && showChartMarketExecutionFooter}
            lotInvalid={footerLotInvalid}
            invalidLotDisplay={footerLotInvalidDisplay}
            isTradeExecutionFocused={isTradeExecutionFocused}
            radialMenuOpen={chartTapMenuAnchor !== null}
            showOnlyActivePane={
              isChartExpanded && chartWindows.toolbarTargetPaneId !== null
            }
            onClaimPane={chartWindows.claimToolbarTarget}
            onSelectPane={handleSelectChartWindowPane}
            onOpenPaneRadialMenu={handleOpenChartWindowPaneRadialMenu}
            onOpenPaneSymbolPicker={handleOpenChartWindowPaneSymbolPicker}
            onAuxiliaryPaneFrameChange={setAuxiliaryChartPaneViewport}
            onTradeResult={handleChartTradeExecutionResult}
            onTradeQueueEvent={handleChartTradeQueueEvent}
            onOpenLotEditor={handleOpenFooterLotPicker}
            onDecreaseLot={() => handleStepFooterLotEditor(-1)}
            onIncreaseLot={() => handleStepFooterLotEditor(1)}
          >
            <View
              style={[
                styles.chartContainer,
                isChartExpanded && { minHeight: fullscreenChartMinHeight },
                focusedLotChartViewportHeight > 0 && {
                  flex: 0,
                  height: focusedLotChartViewportHeight,
                },
              ]}
            >
              <View style={{ flex: 1, flexDirection: 'row' }}>
                <ChartDrawingToolsSidebar
                  activeTool={activeTool}
                  chartHideAll={chartHideAll}
                  chartLockAll={chartLockAll}
                  colors={{ blue: BLUE, textMuted: TEXT_MUTED }}
                  drawingMagnetMode={drawingMagnetMode}
                  isChartExpanded={isChartExpanded}
                  isDark={isDark}
                  onClearDrawings={handleClearDrawings}
                  onOpenDrawingTools={() => routeChartWindowToolbarAction('drawings')}
                  onRedoDrawing={handleRedoDrawing}
                  onSelectTool={handleSetTool}
                  onToggleHide={handleToggleHide}
                  onToggleLock={handleToggleLock}
                  onToggleMagnetMode={handleToggleMagnetMode}
                  onToggleStickyMode={handleToggleStickyMode}
                  onUndoDrawing={handleUndoDrawing}
                  onZoomTool={handleZoomTool}
                  showDrawingToolbar={showChartDrawingToolbar}
                  stickyDrawingMode={stickyDrawingMode}
                />
                <View
                  ref={chartViewportRef}
                  style={[
                    styles.chartViewport,
                    frozenFooterLotChartViewportStyle,
                    // Only a split chart needs this lift so the radial can cross
                    // its sibling pane. Avoid restacking the undivided WebView.
                    chartWindows.isSplit
                    && chartTapMenuAnchor !== null
                    && { overflow: 'visible', zIndex: 80, elevation: 80 },
                  ]}
                  onTouchStart={handleChartViewportTouchStart}
                  onTouchEnd={handleChartViewportTouchEnd}
                  onTouchCancel={handleChartViewportTouchEnd}
                  onLayout={(event) => {
                    const { width, height } = event.nativeEvent.layout;
                    if (width <= 0 || height <= 0) {
                      return;
                    }
                    if (!isScreenFocused) {
                      return;
                    }
                    const freezeViewportResize =
                      (shouldFreezeChartViewportResize || footerLotEditorActiveRef.current) &&
                      lastChartViewportSizeRef.current.height > 0 &&
                      height < lastChartViewportSizeRef.current.height;
                    if (freezeViewportResize) {
                      return;
                    }
                    setChartTapMenuBounds({ width, height });
                    scheduleChartViewportResize(width, height, true);
                    syncChartViewportFrame();
                  }}
                >
                  {shouldShowChartLoadingOverlay && (
                    <View pointerEvents="none" style={styles.chartOverlay}>
                      <ActivityIndicator size="large" color={BLUE} />
                      <Text style={styles.overlayText}>{t('Loading chart data...')}</Text>
                    </View>
                  )}

                  {chartSurfaceReady && isError && !isLoading && (
                    <View pointerEvents="box-none" style={styles.chartOverlay}>
                      <Ionicons name="cloud-offline-outline" size={36} color={TEXT_MUTED} />
                      <Text style={styles.overlayText}>{t('Unable to load chart')}</Text>
                      <Text style={styles.overlaySubText}>{chartDisplayError ?? t('Waiting for market data connection...')}</Text>
                      <View style={styles.overlayActions}>
                        {!chartSurfaceRecoveryExhausted && (
                          <Pressable accessibilityRole="button" style={styles.overlayAction} onPress={refreshChartHistory}>
                            <Text style={styles.overlayActionText}>{t('Retry')}</Text>
                          </Pressable>
                        )}
                        <Pressable accessibilityRole="button" style={styles.overlayAction} onPress={handleOpenSymbolPicker}>
                          <Text style={styles.overlayActionText}>{t('Select Symbol')}</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}

                  {chartSurfaceReady && isNoMarketData && !isError && (
                    <View pointerEvents="box-none" style={styles.chartOverlay}>
                      <Ionicons name="analytics-outline" size={36} color={TEXT_MUTED} />
                      <Text style={styles.overlayText}>{t('No market data available')}</Text>
                      <Text style={styles.overlaySubText}>{t('Waiting for backend candle data...')}</Text>
                      <View style={styles.overlayActions}>
                        <Pressable accessibilityRole="button" style={styles.overlayAction} onPress={refreshChartHistory}>
                          <Text style={styles.overlayActionText}>{t('Retry')}</Text>
                        </Pressable>
                        <Pressable accessibilityRole="button" style={styles.overlayAction} onPress={handleOpenSymbolPicker}>
                          <Text style={styles.overlayActionText}>{t('Select Symbol')}</Text>
                        </Pressable>
                      </View>
                    </View>
                  )}

                  {chartSurfaceReady ? (
                    <WebView
                      key={`${CHART_DEV_SOURCE_KEY}:${chartWebViewGeneration}`}
                      ref={webViewRef}
                      source={CHART_SOURCE}
                      style={{
                        flex: 1,
                        backgroundColor: resolvedChartColors.background,
                        // Never expose the provisional quote-only chart beneath
                        // the loading overlay. Reveal the WebView only after this
                        // exact context has confirmed a usable history paint.
                        // Error/no-data fallbacks keep the unconfirmed WebView
                        // hidden behind their native overlays as well.
                        opacity: hasUsableRetainedChart ? 1 : 0,
                      }}
                      androidLayerType="hardware"
                      scrollEnabled={false}
                      // Keep Android's parent ScrollView from cancelling an
                      // axis drag after the WebView has claimed the gesture.
                      nestedScrollEnabled
                      // iOS: the WKWebView's own scroll view must not rubber-band
                      // vertical drags either — the chart page owns its gestures.
                      bounces={false}
                      showsVerticalScrollIndicator={false}
                      showsHorizontalScrollIndicator={false}
                      originWhitelist={['*']}
                      javaScriptEnabled={true}
                      cacheEnabled={!__DEV__}
                      forceDarkOn={false}
                      onLoadStart={() => {
                        paintedChartContextLruRef.current.clear();
                        cancelPendingChartContextActivation();
                        pendingChartWebViewRecoveryRef.current = false;
                        // A real document load must always create a fresh
                        // false -> true readiness transition. Without this, a
                        // remounted WebView can inherit ready=true and wait for
                        // the three-second watchdog before initChart is retried.
                        resetChartBridgeState();
                        setWebViewReady(false);
                      }}
                      onContentProcessDidTerminate={() => {
                        handleChartWebViewProcessLoss('iOS', chartWebViewGeneration);
                      }}
                      onRenderProcessGone={() => {
                        handleChartWebViewProcessLoss('Android', chartWebViewGeneration);
                      }}
                      onMessage={(event) => {
                        try {
                          const msg = JSON.parse(event.nativeEvent.data);
                          if (msg.type === 'CHART_CONTEXT_ACTIVATED') {
                            settleChartContextActivation(msg);
                          } else if (msg.type === 'READY') {
                            // WebView loaded — reset state and mark ready.
                            // The watchdog + Effect 1 will push initChart as soon as data exists.
                            resetChartBridgeState();
                            lastWebViewDrawingSignatureRef.current = '';
                            lastInjectedDrawingSyncRef.current = { signature: '', epoch: -1 };
                            allowNextEmptyDrawingSyncRef.current = false;
                            hasAcceptedNonEmptyWebViewDrawingsRef.current = drawingRecordsRef.current.length > 0;
                            setTextLevelEditRequest(null);
                            setWebViewReady(true);
                            if (isScreenFocused) {
                              requestChartViewportRecovery(2);
                            }
                          } else if (msg.type === 'CHART_READY') {
                            const readyInitSignature = typeof msg.initSignature === 'string' ? msg.initSignature : '';
                            const readyConfigSig = typeof msg.configSig === 'string' ? msg.configSig : '';
                            const readyDataContextSig =
                              typeof msg.dataContextSig === 'string' ? msg.dataContextSig : '';
                            const readyDataContextEpoch = readChartInitContextEpoch(readyInitSignature);
                            const latestInitDispatch = lastInitDispatchRef.current;
                            if (!shouldAcceptChartReady(
                              {
                                initSignature: readyInitSignature,
                                configSig: readyConfigSig,
                                dataContextSig: readyDataContextSig,
                              },
                              {
                                configSig: currentSig,
                                dataContextSig: chartDataContextSigRef.current,
                                dataContextEpoch: chartDataContextEpochRef.current.epoch,
                              },
                              {
                                configSig: latestInitDispatch.configSig,
                                dataContextSig: latestInitDispatch.dataContextSig,
                                dataContextEpoch: latestInitDispatch.dataContextEpoch,
                              },
                            )) {
                              if (typeof __DEV__ !== 'undefined' && __DEV__ && CHART_BRIDGE_DEBUG) {
                                console.log('[CHART-BRIDGE] ignore_stale_chart_ready', {
                                  readyInitSignature,
                                  readyConfigSig,
                                  readyDataContextSig,
                                  readyDataContextEpoch,
                                  latestInitSignature: latestInitDispatch.signature,
                                  latestConfigSig: latestInitDispatch.configSig,
                                  latestDataContextSig: latestInitDispatch.dataContextSig,
                                  latestDataContextEpoch: latestInitDispatch.dataContextEpoch,
                                  currentSig,
                                  chartDataContextSig,
                                  currentDataContextEpoch: chartDataContextEpochRef.current.epoch,
                                });
                              }
                              return;
                            }
                            // WebView shell is ready.  Keep the startup loader
                            // until a non-empty candle series is actually
                            // painted, otherwise slow REST history briefly shows
                            // a false "No market data" screen.
                            chartInitializedRef.current = true;
                            lastInitSigRef.current = currentSig;
                            setChartCanvasReady(true);
                            lastInjectedLiveQuoteSignatureRef.current = '';
                            try {
                              const drawingsToReplay = chartDrawingRecords;
                              if (webViewRef.current) {
                                const drawingReplaySignature = chartDrawingSignature;
                                webViewRef.current.injectJavaScript(`
                                window.__rtx5ChartWindowPaneId = ${JSON.stringify(chartWindows.activePane.id)};
                                if (typeof setShowObjectDescriptions === 'function') {
                                  setShowObjectDescriptions(${chartDisplay.showObjectDescriptions === true});
                                }
                                if (typeof setSerializedDrawings === 'function') {
                                  setSerializedDrawings(${JSON.stringify(drawingsToReplay)});
                                }
                                true;
                              `);
                                lastInjectedDrawingSyncRef.current = {
                                  signature: drawingReplaySignature,
                                  epoch: chartReadyEpoch,
                                };
                              }
                            } catch (_) { }
                            // Fast path: if initChart already seeded this exact
                            // sanitized series, skip the duplicate full reload.
                            // Otherwise paint retained candles for the READY race.
                            let readyPaintToken = '';
                            let chartReadyConfirmedCurrentSnapshotPaint = false;
                            let readyVisibleLivePrice: number | null = null;
                            const readyLiveRevision = livePaintRevisionRef.current + 1;
                            try {
                              const {
                                exactQuote: readyExactQuote,
                                projection: readyProjection,
                                hasHistoryCandles: readyHasHistoryCandles,
                              } = readCurrentProjectedChartCandles();
                              const readyCandles = readyProjection.candles;
                              const readyLastCandle = readyCandles[readyCandles.length - 1] ?? null;
                              readyVisibleLivePrice =
                                chartDisplay.showLivePriceLine && readyExactQuote && readyLastCandle
                                  ? readyLastCandle.close
                                  : null;
                              retainCurrentChartCandles(readyCandles);
                              const readySnapshot = buildChartSeriesSnapshot(readyCandles);
                              const pendingHistorylessBootstrap = historylessBootstrapViewportRef.current;
                              const resetForHistorylessBootstrap = shouldResetViewportForHistorylessBootstrap(
                                pendingHistorylessBootstrap.contextKey,
                                chartDataContextSig,
                                pendingHistorylessBootstrap.snapshot,
                                readySnapshot,
                                readyHasHistoryCandles,
                              );
                              const usableHistoryPaintAlreadyPending =
                                resetForHistorylessBootstrap
                                && pendingChartDataPaintRef.current.confirmsUsableChart
                                && pendingChartDataPaintRef.current.dataContextSig === chartDataContextSig
                                && pendingChartDataPaintRef.current.token.length > 0;
                              if (readyCandles.length > 0 && webViewRef.current) {
                                // READY can race the normal data effect. Prepare the
                                // Renko output here too so its first confirmed paint
                                // and future transformed diff share one baseline.
                                const readyMappedRenkoData = chartType === 'renko'
                                  ? buildMappedData(readyCandles)
                                  : null;
                                const readySnapshotInitSignature = buildChartInitSignature(
                                  chartDataContextEpochRef.current.epoch,
                                  `${chartDataContextSig}:${currentSig}:${getChartSnapshotSignature(readySnapshot)}`,
                                );
                                if (readyInitSignature === readySnapshotInitSignature) {
                                  if (!readyHasHistoryCandles) {
                                    historylessBootstrapViewportRef.current = {
                                      contextKey: chartDataContextSig,
                                      snapshot: readySnapshot,
                                    };
                                  } else {
                                    historylessBootstrapViewportRef.current = EMPTY_HISTORYLESS_BOOTSTRAP_VIEWPORT;
                                  }
                                  renderedSeriesSnapshotRef.current = readySnapshot;
                                  renderedDataContextSigRef.current = chartDataContextSig;
                                  if (readyHasHistoryCandles) {
                                    markChartContextPainted(chartDataContextSig);
                                    if (
                                      preactivatedChartContextRef.current.dataContextSig
                                      === chartDataContextSig
                                    ) {
                                      preactivatedChartContextRef.current = {
                                        dataContextSig: '',
                                        paintToken: '',
                                        generation: -1,
                                        visualShellSig: '',
                                      };
                                    }
                                    chartWebViewPaintStallRecoveryRef.current = {
                                      dataContextSig: chartDataContextSig,
                                      dataContextEpoch: chartDataContextEpochRef.current.epoch,
                                      attemptCount: 0,
                                    };
                                    setChartSurfaceRecoveryExhausted(false);
                                    setHasPaintedChartOnce(true);
                                    setLastPaintedChartDataContextSig(chartDataContextSig);
                                    setLastPaintedChartDataContextEpoch(
                                      chartDataContextEpochRef.current.epoch,
                                    );
                                    chartReadyConfirmedCurrentSnapshotPaint = true;
                                  }
                                } else if (!usableHistoryPaintAlreadyPending) {
                                  const mapped = readyMappedRenkoData ?? buildMappedData(readyCandles);
                                  readyPaintToken = issueChartDataPaintToken(
                                    chartDataContextSig,
                                    readyHasHistoryCandles,
                                  );
                                  const readyChartPaintTransaction = `
                                   updateChartData(${JSON.stringify(mapped)}, {
                                     preserveVisibleLogicalSpan: ${!resetForHistorylessBootstrap},
                                     resetVisibleRange: ${resetForHistorylessBootstrap},
                                     dataContextSig: ${JSON.stringify(chartDataContextSig)},
                                     paintToken: ${JSON.stringify(readyPaintToken)}
                                   });
                                   if (typeof setLivePriceLineForContext === 'function') {
                                     setLivePriceLineForContext(
                                       ${readyVisibleLivePrice ?? 'null'},
                                       ${JSON.stringify(chartDataContextSig)},
                                       ${readyLiveRevision}
                                     );
                                    }
                                    true;
                                  `;
                                  retainChartDataPaintRetryScript(
                                    readyPaintToken,
                                    readyChartPaintTransaction,
                                  );
                                  webViewRef.current.injectJavaScript(readyChartPaintTransaction);
                                  if (!readyHasHistoryCandles) {
                                    historylessBootstrapViewportRef.current = {
                                      contextKey: chartDataContextSig,
                                      snapshot: readySnapshot,
                                    };
                                  }
                                  livePaintRevisionRef.current = readyLiveRevision;
                                  renderedSeriesSnapshotRef.current = readySnapshot;
                                  renderedDataContextSigRef.current = chartDataContextSig;
                                }
                                renderedRenkoSeriesSnapshotRef.current = readyMappedRenkoData
                                  ? buildChartSeriesSnapshot(readyMappedRenkoData)
                                  : EMPTY_CHART_SERIES_SNAPSHOT;
                              }
                            } catch (_) {
                              if (
                                pendingChartDataPaintRef.current.token === readyPaintToken
                                && !pendingChartDataPaintRef.current.confirmsUsableChart
                              ) {
                                pendingChartDataPaintRef.current = {
                                  token: '',
                                  dataContextSig: '',
                                  confirmsUsableChart: false,
                                  retryScript: '',
                                  startedAt: 0,
                                  ackRetryCount: 0,
                                  lastAckRetryAt: 0,
                                };
                              }
                            }
                            if (chartReadyConfirmedCurrentSnapshotPaint) {
                              recordConfirmedChartFrontendPaint();
                            }
                            // Bump epoch so the overlay effect always re-fires
                            // after every (re-)initialization, even when the
                            // payload itself hasn't changed.
                            setChartReadyEpoch((c) => c + 1);
                            requestChartViewportRecovery(4);
                            // Immediately push the latest overlay so lines appear
                            // without waiting for the next React effect cycle.
                            try {
                              const latestOverlay = overlayPayloadRef.current ?? {
                                priceLines: [],
                                markers: [],
                                tradeHistorySegments: [],
                              };
                              const nextMarketLineSignature =
                                readyVisibleLivePrice !== null ? readyVisibleLivePrice.toFixed(displayDecimals) : chartDisplay.showLivePriceLine ? 'na' : 'off';
                              if (webViewRef.current) {
                                webViewRef.current.injectJavaScript(`
                            if (typeof setChartOverlays === 'function') {
                              setChartOverlays(
                                ${JSON.stringify(latestOverlay)},
                                ${JSON.stringify(chartDataContextSig)}
                              );
                            }
                            if (typeof setLivePriceLineForContext === 'function') {
                              setLivePriceLineForContext(
                                ${readyVisibleLivePrice ?? 'null'},
                                ${JSON.stringify(chartDataContextSig)},
                                ${readyLiveRevision}
                              );
                            }
                            true;
                          `);
                                livePaintRevisionRef.current = readyLiveRevision;
                                lastInjectedLiveQuoteSignatureRef.current = nextMarketLineSignature;
                              }
                            } catch (_) { }
                          } else if (msg.type === 'CHART_DATA_PAINTED') {
                            const paintedDataContextSig =
                              typeof msg.dataContextSig === 'string' ? msg.dataContextSig : '';
                            const paintToken = typeof msg.paintToken === 'string' ? msg.paintToken : '';
                            const pendingPaint = pendingChartDataPaintRef.current;
                            if (!shouldAcceptChartDataPaint(
                              {
                                paintToken,
                                dataContextSig: paintedDataContextSig,
                              },
                              {
                                paintToken: pendingPaint.token,
                                dataContextSig: pendingPaint.dataContextSig,
                              },
                              chartDataContextSigRef.current,
                            )) {
                              if (typeof __DEV__ !== 'undefined' && __DEV__ && CHART_BRIDGE_DEBUG) {
                                console.log('[CHART-BRIDGE] ignore_stale_data_paint', {
                                  paintToken,
                                  paintedDataContextSig,
                                  pendingPaintToken: pendingPaint.token,
                                  pendingDataContextSig: pendingPaint.dataContextSig,
                                  currentDataContextSig: chartDataContextSigRef.current,
                                });
                              }
                              return;
                            }

                            if (!pendingPaint.confirmsUsableChart) {
                              // Empty-series clears and quote-only bootstrap paints
                              // are valid bridge acknowledgements, but neither may
                              // dismiss the loader and reveal a one-candle viewport.
                              pendingChartDataPaintRef.current = {
                                token: '',
                                dataContextSig: '',
                                confirmsUsableChart: false,
                                retryScript: '',
                                startedAt: 0,
                                ackRetryCount: 0,
                                lastAckRetryAt: 0,
                              };
                              return;
                            }
                            const paintedCandles = candlesRef.current;
                            if (
                              candlesRefContextSigRef.current !== paintedDataContextSig
                              || paintedCandles.length === 0
                            ) {
                              // A React commit can transiently lag the WebView's
                              // synchronous acknowledgement. Retain this exact token
                              // so the watchdog can ask for it again after the current
                              // context's candle ref has caught up.
                              return;
                            }
                            pendingChartDataPaintRef.current = {
                              token: '',
                              dataContextSig: '',
                              confirmsUsableChart: false,
                              retryScript: '',
                              startedAt: 0,
                              ackRetryCount: 0,
                              lastAckRetryAt: 0,
                            };
                            chartWebViewPaintStallRecoveryRef.current = {
                              dataContextSig: paintedDataContextSig,
                              dataContextEpoch: chartDataContextEpochRef.current.epoch,
                              attemptCount: 0,
                            };
                            if (
                              historylessBootstrapViewportRef.current.contextKey
                              === paintedDataContextSig
                            ) {
                              historylessBootstrapViewportRef.current =
                                EMPTY_HISTORYLESS_BOOTSTRAP_VIEWPORT;
                            }
                            renderedSeriesSnapshotRef.current =
                              buildChartSeriesSnapshot(paintedCandles);
                            // The acknowledgement reports source-context paint; save
                            // the equivalent transformed snapshot for later Renko diffs.
                            renderedRenkoSeriesSnapshotRef.current = chartType === 'renko'
                              ? buildChartSeriesSnapshot(buildMappedData(paintedCandles))
                              : EMPTY_CHART_SERIES_SNAPSHOT;
                            renderedDataContextSigRef.current = paintedDataContextSig;
                            markChartContextPainted(paintedDataContextSig);
                            if (
                              preactivatedChartContextRef.current.dataContextSig
                              === paintedDataContextSig
                            ) {
                              preactivatedChartContextRef.current = {
                                dataContextSig: '',
                                paintToken: '',
                                generation: -1,
                                visualShellSig: '',
                              };
                            }
                            setChartSurfaceRecoveryExhausted(false);
                            setHasPaintedChartOnce(true);
                            setLastPaintedChartDataContextSig(paintedDataContextSig);
                            setLastPaintedChartDataContextEpoch(
                              chartDataContextEpochRef.current.epoch,
                            );
                            recordConfirmedChartFrontendPaint();
                            // The quote can win the cold-load race before candles.
                            // Replay it after the WebView confirms this exact
                            // context, even if a closed market sends no next tick.
                            paintCanonicalLiveTickRef.current(true);
                          } else if (msg.type === 'DRAWING_TEXT_EDIT_REQUEST') {
                            const recordId = typeof msg.recordId === 'string' ? msg.recordId : '';
                            if (!recordId) {
                              return;
                            }
                            setTextLevelEditRequest({
                              recordId,
                              text: typeof msg.text === 'string' ? msg.text : 'Level',
                            });
                          } else if (msg.type === 'DRAWING_QUICK_ACTIONS_REQUEST') {
                            closeChartTapMenu();
                            openDrawingQuickActionsSheet();
                          } else if (msg.type === 'DRAWING_ACTION_MENU_REQUEST') {
                            closeChartTapMenu();
                            openSelectedDrawingActionSheet({
                              label:
                                typeof msg.label === 'string' && msg.label
                                  ? msg.label
                                  : t('Drawing'),
                              locked: msg.locked === true,
                            });
                          } else if (msg.type === 'DRAWINGS_CHANGED') {
                            if (
                              !chartInitializedRef.current ||
                              !chartCanvasReady ||
                              lastInitSigRef.current !== currentSig ||
                              (
                                chartWindows.isSplit
                                && msg.chartWindowPaneId !== chartWindows.activePane.id
                              )
                            ) {
                              return;
                            }

                            const nextSelectedDrawingId =
                              typeof msg.selectedDrawingId === 'string' && msg.selectedDrawingId
                                ? msg.selectedDrawingId
                                : null;
                            setSelectedDrawingId((previous) =>
                              (previous === nextSelectedDrawingId ? previous : nextSelectedDrawingId));
                            const sanitizedNextDrawings = filterChartDrawingRecordsForCurrentChart(
                              sanitizePersistedChartDrawings(msg.drawings),
                              chartSymbol,
                              chartTimeframe,
                              sanitizedBackendCandles,
                              chartWindows.isSplit ? chartWindows.activePane.id : undefined,
                            );
                            const nextDrawings = chartWindows.isSplit
                              ? sanitizedNextDrawings.map((drawing) => ({
                                ...drawing,
                                chartWindowPaneId: chartWindows.activePane.id,
                              }))
                              : sanitizedNextDrawings;
                            const nextSignature = JSON.stringify(nextDrawings);
                            const nativeDrawingRecords = drawingRecordsRef.current;
                            const nativeDrawingSignature = drawingSignatureRef.current;
                            const hasNativeOrAcceptedDrawings =
                              nativeDrawingRecords.length > 0 ||
                              hasAcceptedNonEmptyWebViewDrawingsRef.current;
                            const unexpectedEmptyWebViewPayload =
                              nextDrawings.length === 0 &&
                              hasNativeOrAcceptedDrawings &&
                              !allowNextEmptyDrawingSyncRef.current;

                            if (unexpectedEmptyWebViewPayload) {
                              return;
                            }

                            if (chartWindows.isSplit) {
                              const historyKey = getChartWindowDrawingHistoryKey(
                                chartWindows.activePane.id,
                                chartWindows.activePane.symbol,
                                chartWindows.activePane.timeframe,
                              );
                              const alignedHistory = reconcileChartWindowDrawingHistory(
                                chartWindowDrawingHistoriesRef.current[historyKey],
                                nativeDrawingRecords,
                              );
                              const history = nextSignature === nativeDrawingSignature
                                ? alignedHistory
                                : recordChartWindowDrawingChange(alignedHistory, nextDrawings);
                              chartWindowDrawingHistoriesRef.current[historyKey] = history;
                              setDrawingHistoryState(
                                getChartWindowDrawingHistoryAvailability(history),
                              );
                            } else {
                              const nextCanUndo = msg.canUndo === true;
                              const nextCanRedo = msg.canRedo === true;
                              setDrawingHistoryState((previous) =>
                              (previous.canUndo === nextCanUndo && previous.canRedo === nextCanRedo
                                ? previous
                                : { canRedo: nextCanRedo, canUndo: nextCanUndo }));
                            }

                            lastWebViewDrawingSignatureRef.current = nextSignature;
                            if (nextDrawings.length > 0) {
                              allowNextEmptyDrawingSyncRef.current = false;
                              hasAcceptedNonEmptyWebViewDrawingsRef.current = true;
                            } else {
                              allowNextEmptyDrawingSyncRef.current = false;
                              hasAcceptedNonEmptyWebViewDrawingsRef.current = false;
                            }

                            if (nextSignature !== nativeDrawingSignature) {
                              if (chartWindows.isSplit) {
                                const currentBucket = useUserPreferences.getState()
                                  .chartDrawingRecordsBySymbol[getChartDrawingBucketKey(chartSymbol)] ?? [];
                                setChartDrawingRecordsForSymbol(
                                  chartSymbol,
                                  replaceChartWindowPaneDrawings(
                                    currentBucket,
                                    nextDrawings,
                                    chartWindows.activePane,
                                  ),
                                );
                              } else {
                                setChartDrawingRecordsForSymbol(chartSymbol, nextDrawings);
                              }
                            }
                          } else if (msg.type === 'DRAWINGS_SYNCED_FOR_OBJECTS') {
                            const pendingRequest = pendingObjectsDrawingSyncRef.current;
                            if (
                              pendingRequest
                              && Number(msg.requestId) === pendingRequest.requestId
                            ) {
                              pendingObjectsDrawingSyncRef.current = null;
                              pendingRequest.onReady();
                            }
                          } else if (msg.type === 'CHART_TOUCH_STATE') {
                            if (msg.active) {
                              handleChartViewportTouchStart();
                            } else {
                              handleChartViewportTouchEnd();
                            }
                          } else if (msg.type === 'TOOL_ACTIVE_CHANGED') {
                            if (
                              chartWindows.isSplit
                              && msg.chartWindowPaneId !== chartWindows.activePane.id
                            ) {
                              return;
                            }
                            const nextActiveTool = typeof msg.tool === 'string'
                              ? msg.tool
                              : CHART_NO_DRAWING_TOOL;
                            if (nextActiveTool === CHART_NO_DRAWING_TOOL) {
                              chartDrawingToolOwnerPaneIdRef.current = null;
                            }
                            setActiveTool(nextActiveTool);
                            setChartDrawingInputActive(msg.drawingActive === true);
                          } else if (msg.type === 'CHART_TRADE_LINE_DRAG') {
                            if (!handleChartPositionStopDragMessage(msg)) {
                              handleChartTradePreviewDragMessage(msg);
                            }
                          } else if (msg.type === 'ON_PAGINATE_HISTORY') {
                            paginate();
                          } else if (msg.type === 'CHART_TAP') {
                            if (msg.dataContextSig !== chartDataContextSigRef.current) {
                              return;
                            }
                            // Undivided charts keep their established single-tap
                            // radial. In divided mode the full pane waits for the
                            // explicit CHART_DOUBLE_TAP emitted by its WebView.
                            if (chartWindows.isSplit) {
                              scheduleFullPaneSelection(msg.dataContextSig);
                              return;
                            }
                            if (shouldSuppressChartTapMenu({
                              activeTool,
                              footerLotEditorFocused,
                              footerLotEditorOpening,
                              footerLotPickerOpen: footerLotPickerMode !== null,
                              suppressUntil: chartTapMenuSuppressUntilRef.current,
                            })) {
                              setChartTapMenuAnchor(null);
                              return;
                            }
                            const x = typeof msg.x === 'number' ? msg.x : NaN;
                            const y = typeof msg.y === 'number' ? msg.y : NaN;
                            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                              return;
                            }
                            // CHART_TAP coordinates are already viewport-local.
                            // Use them immediately without a measure/rAF delay, so
                            // taps anywhere open at their own clamped position.
                            const nextAnchor = {
                              x,
                              y,
                              price: typeof msg.price === 'number' && Number.isFinite(msg.price) ? msg.price : null,
                            };
                            chartTapMenuOpenedAtRef.current = Date.now();
                            // A valid tap opens the hidden radial here; the next
                            // valid chart tap toggles the already-open radial off.
                            if (chartTapMenuAnchor === null) {
                              // WebView sends touch-release immediately after
                              // CHART_TAP. Apply both changes together so another
                              // render cannot interrupt the radial entrance.
                              settleChartViewportTouchForRadialOpen();
                            }
                            setChartTapMenuAnchor((currentAnchor) => (
                              currentAnchor ? null : nextAnchor
                            ));
                          } else if (msg.type === 'CHART_DOUBLE_TAP') {
                            if (msg.dataContextSig !== chartDataContextSigRef.current) {
                              return;
                            }
                            if (!chartWindows.isSplit) {
                              return;
                            }
                            cancelPendingFullPaneSelection();
                            // Double tap owns the pane for every radial action as
                            // well. Previously the full engine could retain null
                            // (broadcast) ownership while the auxiliary path was
                            // correctly pane-scoped.
                            chartWindows.claimToolbarTarget(
                              chartWindowsStateRef.current.activePaneId,
                            );
                            if (shouldSuppressChartTapMenu({
                              activeTool,
                              footerLotEditorFocused,
                              footerLotEditorOpening,
                              footerLotPickerOpen: footerLotPickerMode !== null,
                              suppressUntil: chartTapMenuSuppressUntilRef.current,
                            })) {
                              setChartTapMenuAnchor(null);
                              return;
                            }
                            const x = typeof msg.x === 'number' ? msg.x : NaN;
                            const y = typeof msg.y === 'number' ? msg.y : NaN;
                            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                              return;
                            }
                            const nextAnchor = {
                              x,
                              y,
                              price: typeof msg.price === 'number' && Number.isFinite(msg.price)
                                ? msg.price
                                : null,
                            };
                            chartTapMenuOpenedAtRef.current = Date.now();
                            syncChartViewportFrame(() => {
                              setChartTapMenuAnchor(nextAnchor);
                            });
                          } else if (msg.type === 'CHART_GEOMETRY') {
                            if (msg.dataContextSig === chartDataContextSigRef.current) {
                              const rangeFrom = msg.priceRange?.from;
                              const rangeTo = msg.priceRange?.to;
                              chartVisiblePriceRangeRef.current =
                                typeof rangeFrom === 'number'
                                  && Number.isFinite(rangeFrom)
                                  && typeof rangeTo === 'number'
                                  && Number.isFinite(rangeTo)
                                  && rangeFrom !== rangeTo
                                  ? {
                                    from: Math.min(rangeFrom, rangeTo),
                                    to: Math.max(rangeFrom, rangeTo),
                                  }
                                  : null;
                              const manualRangeFrom = msg.manualPriceScale?.from;
                              const manualRangeTo = msg.manualPriceScale?.to;
                              const manualReferenceSpan = msg.manualPriceScale?.referenceSpan;
                              if (
                                typeof manualRangeFrom === 'number'
                                && Number.isFinite(manualRangeFrom)
                                && typeof manualRangeTo === 'number'
                                && Number.isFinite(manualRangeTo)
                                && manualRangeFrom !== manualRangeTo
                              ) {
                                const from = Math.min(manualRangeFrom, manualRangeTo);
                                const to = Math.max(manualRangeFrom, manualRangeTo);
                                chartManualPriceScaleRef.current = {
                                  from,
                                  to,
                                  referenceSpan:
                                    typeof manualReferenceSpan === 'number'
                                      && Number.isFinite(manualReferenceSpan)
                                      && manualReferenceSpan > 0
                                      ? manualReferenceSpan
                                      : to - from,
                                };
                              } else {
                                chartManualPriceScaleRef.current = null;
                              }
                            }
                            const nextPlotArea =
                              msg.plotArea
                                && typeof msg.plotArea.left === 'number'
                                && Number.isFinite(msg.plotArea.left)
                                && typeof msg.plotArea.top === 'number'
                                && Number.isFinite(msg.plotArea.top)
                                && typeof msg.plotArea.width === 'number'
                                && Number.isFinite(msg.plotArea.width)
                                && msg.plotArea.width > 0
                                && typeof msg.plotArea.height === 'number'
                                && Number.isFinite(msg.plotArea.height)
                                && msg.plotArea.height > 0
                                ? {
                                  left: msg.plotArea.left,
                                  top: msg.plotArea.top,
                                  width: msg.plotArea.width,
                                  height: msg.plotArea.height,
                                }
                                : null;

                            setChartPlotArea((current) => {
                              if (
                                current
                                && nextPlotArea
                                && current.left === nextPlotArea.left
                                && current.top === nextPlotArea.top
                                && current.width === nextPlotArea.width
                                && current.height === nextPlotArea.height
                              ) {
                                return current;
                              }
                              return nextPlotArea;
                            });
                          } else if (msg.type === 'ERROR') {
                            // Recoverable: the watchdog auto-retries, so this is a
                            // dev-only diagnostic (console.log, no LogBox toast).
                            if (typeof __DEV__ !== 'undefined' && __DEV__) {
                              console.log('[CHART WEBVIEW ERROR]', msg.message);
                            }
                            const bridgeErrorMessage = typeof msg.message === 'string' ? msg.message : '';
                            if (/initChart|updateChartData|flushPendingTick|series not initialized|recoverChartSurface/.test(bridgeErrorMessage)) {
                              chartInitializedRef.current = false;
                              lastInitSigRef.current = '';
                              pendingChartDataPaintRef.current = {
                                token: '',
                                dataContextSig: '',
                                confirmsUsableChart: false,
                                retryScript: '',
                                startedAt: 0,
                                ackRetryCount: 0,
                                lastAckRetryAt: 0,
                              };
                              renderedSeriesSnapshotRef.current = EMPTY_CHART_SERIES_SNAPSHOT;
                              renderedRenkoSeriesSnapshotRef.current = EMPTY_CHART_SERIES_SNAPSHOT;
                              setChartCanvasReady(false);
                              requestChartViewportRecovery(2);
                              sendInit(true);
                            }
                          }
                        } catch (_e) { }
                      }}
                    />
                  ) : null}
                  {(chartDisplay.showTicker || showChartMetaRow) && (
                    <View
                      style={[
                        styles.chartOverlaySymbolSection,
                        isSymbolHeaderMovable && {
                          transform: [
                            { translateX: chartSymbolHeaderOffset.x },
                            { translateY: chartSymbolHeaderOffset.y },
                          ],
                        },
                        isChartSymbolHeaderDragArmed && {
                          opacity: 0.75,
                          transform: [
                            { translateX: chartSymbolHeaderOffset.x },
                            { translateY: chartSymbolHeaderOffset.y },
                            { scale: 1.04 },
                          ],
                        },
                      ]}
                      onLayout={(event) => {
                        const { width, height } = event.nativeEvent.layout;
                        chartSymbolHeaderSizeRef.current = { width, height };
                      }}
                      {...chartSymbolHeaderPanHandlers}
                    >
                      <View style={[styles.symbolSection, { minHeight: 'auto' }]}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={t('Select Symbol')}
                          style={styles.symbolSectionTapTarget}
                          onPress={handleOpenSymbolPicker}
                          onPressOut={handleChartSymbolHeaderPressOut}
                          activateOnPressIn={!isSymbolHeaderMovable}
                          activateOnTouchStart={!isSymbolHeaderMovable}
                          hitSlop={8}
                          unstable_pressDelay={0}
                        >
                          <View style={styles.symbolSectionContent}>
                            {chartDisplay.showTicker ? (
                              <>
                                <View style={styles.symbolNameRow}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                                    <Text style={[styles.symbolText, { opacity: 0.9, textShadowColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }]} numberOfLines={1} adjustsFontSizeToFit>{displaySymbol}</Text>
                                    <Ionicons name="chevron-down" size={10} color={T.text} />
                                    {!compactVerticalChartWindow && symbolCategory ? (
                                      <View style={[styles.fxBadge, { marginLeft: 4 }]}>
                                        <Text style={styles.fxBadgeText} numberOfLines={1}>{symbolCategory}</Text>
                                      </View>
                                    ) : null}
                                  </View>
                                </View>

                                {!compactVerticalChartWindow ? <View style={styles.symbolMetaRow}>
                                  <Text style={[styles.symbolSubText, { textShadowColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }]} numberOfLines={1} adjustsFontSizeToFit>
                                    {symbolName}{isChartMarketClosed ? ` · ${t('Market Closed')}` : ''}
                                  </Text>
                                </View> : null}
                              </>
                            ) : null}
                            {showChartMetaRow && !compactVerticalChartWindow && (
                              <ChartLiveOhlcRow
                                key={chartDataContextSig}
                                contextKey={chartDataContextSig}
                                fallbackCandle={chartMetaLastCandle}
                                subscribe={subscribeChartLiveOhlc}
                                displayDecimals={displayDecimals}
                                neutralColor={chartMetaNeutralColor}
                                isDark={isDark}
                                rowStyle={styles.symbolOhlcRow}
                                pairStyle={styles.symbolOhlcPair}
                                labelStyle={styles.symbolOhlcLabel}
                                valueStyle={styles.symbolOhlcValue}
                              />
                            )}
                          </View>
                        </Pressable>
                      </View>
                    </View>
                  )}
                  {/* Keep the radial mounted between taps so Android can reuse
                    its native layer; `visible` hides input and accessibility. */}
                  <ChartTapRadialMenu
                    anchor={chartTapMenuAnchor}
                    visible={chartTapMenuAnchor !== null}
                    bounds={chartTapMenuBounds}
                    activeTimeframe={chartTimeframe}
                    accentColor={BLUE}
                    mutedColor="#FFFFFF"
                    isDark={isDark}
                    onDismiss={handleChartTapMenuDismiss}
                    onSelectTimeframe={handleTimeframeSelect}
                    onOpenChartWindows={handleOpenChartWindows}
                    onOpenObjects={handleRadialOpenObjects}
                    onOpenDrawingTools={handleRadialOpenDrawingTools}
                    onOpenIndicators={handleRadialOpenIndicators}
                    onOpenSymbolPicker={handleRadialOpenSymbolPicker}
                    onOpenScaleControls={handleRadialOpenChartScaleMenu}
                  />
                  {chartTradeReceipt && !showChartTradeSheet
                    ? renderChartTradeReceiptBar(chartTradeReceipt)
                    : null}
                  <ChartTimeframePickerOverlay
                    activeTimeframe={chartTimeframe}
                    supportedTimeframes={timeframes}
                    accentColor={BLUE}
                    isDark={isDark}
                    textColor={T.text}
                    mutedColor={TEXT_MUTED}
                    onSelect={handleTimeframeSelect}
                  />
                </View>
              </View>
            </View>

            {!chartWindows.isSplit && !isChartExpanded && showChartTradeSheet && (
              <View
                style={[
                  styles.bottomArea,
                  { display: 'none', paddingBottom: 0 },
                ]}
              >
                <Animated.View
                  style={[
                    { display: 'none' },
                    styles.chartTradeSheetFrame,
                    { height: chartTradeSheetMaxHeight },
                    chartTradeSheetAnimatedStyle,
                  ]}
                >
                  <View
                    style={[
                      styles.chartTradeSheet,
                      styles.chartTradeSheetInline,
                      styles.chartTradeSheetInlineFloating,
                      useMtPendingTradeSheetLayout && styles.chartTradeSheetPending,
                    ]}
                  >
                    {renderChartTradeSheetDragHeader()}
                    {renderChartTradeSheetTopHeader()}
                    <ScrollView
                      ref={chartTradeTypeTabsInlineScrollRef}
                      horizontal
                      nestedScrollEnabled
                      directionalLockEnabled
                      keyboardShouldPersistTaps="always"
                      showsHorizontalScrollIndicator={false}
                      style={[
                        styles.chartTradeTypeTabsScroll,
                        useMtPendingTradeSheetLayout && styles.chartTradeTypeTabsScrollPending,
                      ]}
                      onLayout={(event) => {
                        chartTradeTypeTabsInlineViewportWidthRef.current = event.nativeEvent.layout.width;
                        scrollChartTradeTypeTabsToOrderType(chartTradeOrderType, false);
                      }}
                      contentContainerStyle={[
                        styles.chartTradeTypeTabs,
                        useMtPendingTradeSheetLayout && styles.chartTradeTypeTabsPending,
                      ]}
                    >
                      {CHART_ORDER_TYPES.map((option) => {
                        const active = option === chartTradeOrderType;
                        return (
                          <Pressable
                            key={option}
                            onLayout={(event) => {
                              chartTradeTypeTabsInlineLayoutsRef.current[option] = {
                                x: event.nativeEvent.layout.x,
                                width: event.nativeEvent.layout.width,
                              };
                            }}
                            style={[
                              styles.chartTradeTypeTab,
                              useMtPendingTradeSheetLayout && styles.chartTradeTypeTabPending,
                              active && styles.chartTradeTypeTabActive,
                              useMtPendingTradeSheetLayout && active && styles.chartTradeTypeTabPendingActive,
                            ]}
                            onPress={() => handleChartTradeOrderTypeSelect(option)}
                            unstable_pressDelay={0}
                          >
                            <Text
                              style={[
                                styles.chartTradeTypeTabText,
                                useMtPendingTradeSheetLayout && styles.chartTradeTypeTabTextPending,
                                active && styles.chartTradeTypeTabTextActive,
                                useMtPendingTradeSheetLayout && active && styles.chartTradeTypeTabTextPendingActive,
                              ]}
                              numberOfLines={1}
                            >
                              {option}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                    <ScrollView
                      canCancelContentTouches={Platform.OS === 'ios'}
                      ref={undefined}
                      style={styles.chartTradeSheetContentScroll}
                      contentContainerStyle={[
                        styles.chartTradeSheetContent,
                        { paddingBottom: chartTradeSheetContentBottomPadding },
                      ]}
                      nestedScrollEnabled
                      bounces={false}
                      keyboardShouldPersistTaps="always"
                      keyboardDismissMode={chartTradeCommentFocused ? 'none' : Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                      scrollEventThrottle={16}
                      onScroll={(event) => {
                        chartTradeSheetScrollOffsetRef.current = event.nativeEvent.contentOffset.y;
                      }}
                    >
                      <View style={[styles.chartTradeSheetBody, useMtPendingTradeSheetLayout && styles.chartTradeSheetBodyPending]}>
                        <View
                          style={[styles.chartTradeVolumeCard, useMtPendingTradeSheetLayout && styles.chartTradeVolumeCardPending]}
                        >
                          <View style={[styles.chartTradeVolumeSide, useMtPendingTradeSheetLayout && styles.chartTradeVolumeSidePending]}>
                            <Text style={[styles.chartTradeCardLabel, useMtPendingTradeSheetLayout && styles.chartTradeCardLabelPending]}>{t('Volume')}</Text>
                            <View style={styles.chartTradeVolumeValueGroup}>
                              <TextInput
                                style={[
                                  styles.chartTradeVolumeInput,
                                  useMtPendingTradeSheetLayout && styles.chartTradeVolumeInputPending,
                                ]}
                                value={chartTradeVolumeInputFocused ? chartTradeVolumeDraft : chartTradeVolumePrimaryDisplay}
                                onFocus={handleFocusChartTradeVolumeInput}
                                onChangeText={handleChartTradeVolumeDraftChange}
                                onBlur={handleBlurChartTradeVolumeDraft}
                                onEndEditing={handleEndChartTradeVolumeDraft}
                                keyboardType="decimal-pad"
                                returnKeyType="done"
                                selectTextOnFocus
                                showSoftInputOnFocus
                                onSubmitEditing={handleSubmitChartTradeVolumeDraft}
                                placeholder={passiveLotDisplay}
                                placeholderTextColor="#94A3B8"
                              />
                              <Pressable
                                style={[
                                  styles.chartTradeStepperLaunchButton,
                                  useMtPendingTradeSheetLayout && styles.chartTradeStepperLaunchButtonPending,
                                ]}
                                onPress={(event) => {
                                  event.stopPropagation?.();
                                  runImmediateAction('chart.tradeSheet.stepper.volume', () => setChartStepperEditor({ kind: 'volume' }));
                                }}
                                hitSlop={8}
                                unstable_pressDelay={0}
                                activateOnPressIn
                              >
                                <View style={styles.chartTradeStepperLaunchIconStack}>
                                  <Ionicons name="chevron-up" size={12} color={TEXT_MUTED} />
                                  <Ionicons name="chevron-down" size={12} color={TEXT_MUTED} />
                                </View>
                              </Pressable>
                            </View>
                          </View>
                          <View style={styles.chartTradeVolumeDivider} />
                          <Pressable
                            style={[styles.chartTradeVolumeUnitSide, useMtPendingTradeSheetLayout && styles.chartTradeVolumeUnitSidePending]}
                            onPress={(event) => {
                              event.stopPropagation?.();
                              handleToggleChartTradeVolumeDisplayMode();
                            }}
                            hitSlop={8}
                            unstable_pressDelay={0}
                          >
                            <Text
                              style={[styles.chartTradeCardValue, useMtPendingTradeSheetLayout && styles.chartTradeCardValuePending]}
                              numberOfLines={1}
                              adjustsFontSizeToFit
                            >
                              {t(chartTradeVolumeModeLabel)}
                            </Text>
                            <View
                              style={[
                                styles.chartTradeStepperLaunchButton,
                                useMtPendingTradeSheetLayout && styles.chartTradeStepperLaunchButtonPending,
                              ]}
                            >
                              <View style={styles.chartTradeStepperLaunchIconStack}>
                                <Ionicons name="chevron-up" size={12} color={TEXT_MUTED} />
                                <Ionicons name="chevron-down" size={12} color={TEXT_MUTED} />
                              </View>
                            </View>
                          </Pressable>
                        </View>

                        <ChartTradeVolumeSlider
                          styles={styles}
                          value={tradeVolume}
                          bounds={tradeVolumeBounds}
                          onChange={updateTradeVolume}
                        />

                        <View style={[styles.chartTradeMetaRow, useMtPendingTradeSheetLayout && styles.chartTradeMetaRowPending]}>
                          {isChartTradeMarginMode ? (
                            <Text
                              style={[styles.chartTradeMetaText, styles.chartTradeMetaSummary, useMtPendingTradeSheetLayout && styles.chartTradeMetaTextPending]}
                              numberOfLines={1}
                            >
                              {t('Lots')}: <Text style={styles.chartTradeMetaSummaryValue}>{passiveLotDisplay}</Text>{'  '}
                              {t('Max')}: <Text style={styles.chartTradeMetaSummaryValue}>{chartTradeMaxVolumeDisplay}</Text>
                            </Text>
                          ) : (
                            <Text style={[styles.chartTradeMetaLink, useMtPendingTradeSheetLayout && styles.chartTradeMetaLinkPending]}>
                              {t('Margin')} <Text style={styles.chartTradeMetaText}>≈ {fmt.price(chartTradeMarginEstimate)} {accountCurrency}</Text>
                            </Text>
                          )}
                          <Text style={[styles.chartTradeMetaText, useMtPendingTradeSheetLayout && styles.chartTradeMetaTextPending]}>
                            {t('Balance')}: {fmt.price(accountBalance)} {accountCurrency}
                          </Text>
                          <Text style={[styles.chartTradeMetaText, useMtPendingTradeSheetLayout && styles.chartTradeMetaTextPending]}>
                            {t('Free')}: {fmt.price(accountFreeMargin)} {accountCurrency}
                          </Text>
                        </View>

                        {isPendingChartOrderType(chartTradeOrderType) && (
                          <Pressable
                            style={[
                              styles.chartTradePriceCard,
                              styles.chartTradePriceCardPending,
                              useMtPendingTradeSheetLayout && styles.chartTradePriceCardPendingMt,
                            ]}
                            onPress={() => runImmediateAction('chart.tradeSheet.stepper.price', () => setChartStepperEditor({ kind: 'price' }))}
                            unstable_pressDelay={0}
                          >
                            <Text style={[styles.chartTradeCardLabel, useMtPendingTradeSheetLayout && styles.chartTradeCardLabelPending]}>{t('Price')}</Text>
                            <View style={styles.chartTradeVolumeValueGroup}>
                              <Text
                                style={[
                                  styles.chartTradePriceInput,
                                  styles.chartTradePriceInputPending,
                                  useMtPendingTradeSheetLayout && styles.chartTradePriceInputPendingMt,
                                ]}
                              >
                                {chartTradePrice > 0 ? chartTradePrice.toFixed(displayDecimals) : '--'}
                              </Text>
                              <Pressable
                                style={[
                                  styles.chartTradeStepperLaunchButton,
                                  useMtPendingTradeSheetLayout && styles.chartTradeStepperLaunchButtonPending,
                                ]}
                                onPress={(event) => {
                                  event.stopPropagation?.();
                                  runImmediateAction('chart.tradeSheet.stepper.price', () => setChartStepperEditor({ kind: 'price' }));
                                }}
                                hitSlop={8}
                                unstable_pressDelay={0}
                              >
                                <View style={styles.chartTradeStepperLaunchIconStack}>
                                  <Ionicons name="chevron-up" size={12} color={TEXT_MUTED} />
                                  <Ionicons name="chevron-down" size={12} color={TEXT_MUTED} />
                                </View>
                              </Pressable>
                            </View>
                          </Pressable>
                        )}

                        {isStopLimitChartOrder && (
                          <Pressable
                            style={[
                              styles.chartTradePriceCard,
                              styles.chartTradePriceCardPending,
                              useMtPendingTradeSheetLayout && styles.chartTradePriceCardPendingMt,
                            ]}
                            onPress={() =>
                              runImmediateAction('chart.tradeSheet.stepper.stopLimitPrice', () =>
                                setChartStepperEditor({ kind: 'stopLimitPrice' }))
                            }
                            unstable_pressDelay={0}
                          >
                            <Text style={[styles.chartTradeCardLabel, useMtPendingTradeSheetLayout && styles.chartTradeCardLabelPending]}>
                              {t('Stop Limit Price')}
                            </Text>
                            <View style={styles.chartTradeVolumeValueGroup}>
                              <Text
                                style={[
                                  styles.chartTradePriceInput,
                                  styles.chartTradePriceInputPending,
                                  useMtPendingTradeSheetLayout && styles.chartTradePriceInputPendingMt,
                                ]}
                              >
                                {chartTradeStopLimitPrice > 0 ? chartTradeStopLimitPrice.toFixed(displayDecimals) : '--'}
                              </Text>
                              <Pressable
                                style={[
                                  styles.chartTradeStepperLaunchButton,
                                  useMtPendingTradeSheetLayout && styles.chartTradeStepperLaunchButtonPending,
                                ]}
                                onPress={(event) => {
                                  event.stopPropagation?.();
                                  runImmediateAction('chart.tradeSheet.stepper.stopLimitPrice', () =>
                                    setChartStepperEditor({ kind: 'stopLimitPrice' }));
                                }}
                                hitSlop={8}
                                unstable_pressDelay={0}
                              >
                                <View style={styles.chartTradeStepperLaunchIconStack}>
                                  <Ionicons name="chevron-up" size={12} color={TEXT_MUTED} />
                                  <Ionicons name="chevron-down" size={12} color={TEXT_MUTED} />
                                </View>
                              </Pressable>
                            </View>
                          </Pressable>
                        )}

                        <Pressable
                          style={[styles.chartTradeStopButton, useMtPendingTradeSheetLayout && styles.chartTradeStopButtonPending]}
                          onPress={handleEnableChartTradeStops}
                          unstable_pressDelay={0}
                          accessibilityRole="button"
                          accessibilityLabel={chartTradeSlEnabled || chartTradeTpEnabled ? t('Edit Stop Levels') : t('Add Stop Levels')}
                        >
                          <View style={styles.chartTradeStopButtonContent}>
                            <View style={styles.chartTradeStopButtonIcon}>
                              <Ionicons name="shield-checkmark-outline" size={17} color={BLUE} />
                            </View>
                            <Text style={[styles.chartTradeStopButtonText, useMtPendingTradeSheetLayout && styles.chartTradeStopButtonTextPending]}>
                              {chartTradeSlEnabled || chartTradeTpEnabled ? t('Edit Stop Levels') : t('Add Stop Levels')}
                            </Text>
                            <Ionicons name="chevron-forward" size={16} color={BLUE} />
                          </View>
                        </Pressable>

                        {(chartTradeSlEnabled || chartTradeTpEnabled) && (
                          <View style={styles.chartTradeStopsBlock}>
                            <View style={styles.chartTradeStopUnitRow}>
                              {chartTradeStopUnitOptions.map((unit) => {
                                const active = chartTradeStopUnit === unit.key;
                                return (
                                  <Pressable
                                    key={unit.key}
                                    style={[styles.chartTradeStopUnitTab, active && styles.chartTradeStopUnitTabActive]}
                                    onPress={() => runImmediateAction(`chart.tradeSheet.stopUnit.${unit.key}`, () => setChartTradeStopUnit(unit.key))}
                                    unstable_pressDelay={0}
                                  >
                                    <Text style={[styles.chartTradeStopUnitTabText, active && styles.chartTradeStopUnitTabTextActive]}>{t(unit.label)}</Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                            <View style={styles.chartTradeStopPairRow}>
                              <Pressable
                                style={[
                                  styles.chartTradeStopPairCard,
                                  styles.chartTradeStopPairCardSl,
                                  !chartTradeSlEnabled && styles.chartTradeStopPairCardInactive,
                                ]}
                                onPress={handleOpenChartTradeSlStepper}
                                unstable_pressDelay={0}
                                accessibilityRole="button"
                                accessibilityLabel={t('Stop Loss')}
                              >
                                <View style={styles.chartTradeStopPairHeader}>
                                  <View style={[styles.chartTradeStopPairBadge, styles.chartTradeStopPairBadgeSl]}>
                                    <Ionicons name="trending-down-outline" size={16} color="#EF4444" />
                                  </View>
                                  {chartTradeStopUnit === 'Pips' && (
                                    <Pressable
                                      hitSlop={8}
                                      onPress={(e) => {
                                        e.stopPropagation?.();
                                        runImmediateAction('chart.tradeSheet.sl.lockToggle', () => setChartTradeSlLocked((v) => !v));
                                      }}
                                      style={[styles.chartTradeStopPairLock, chartTradeSlLocked && styles.chartTradeStopPairLockActive]}
                                      accessibilityRole="button"
                                      accessibilityLabel={t('Stop Loss')}
                                    >
                                      <Ionicons
                                        name={chartTradeSlLocked ? 'lock-closed' : 'lock-open-outline'}
                                        size={15}
                                        color={chartTradeSlLocked ? BLUE : TEXT_MUTED}
                                      />
                                    </Pressable>
                                  )}
                                </View>
                                <Text style={styles.chartTradeStopPairLabel} numberOfLines={1}>{t('Stop Loss')}</Text>
                                <Text
                                  style={[
                                    styles.chartTradeStopPairValue,
                                    !chartTradeSlEnabled && styles.chartTradeStopPairValueMuted,
                                  ]}
                                  numberOfLines={1}
                                  adjustsFontSizeToFit
                                >
                                  {chartTradeSlEnabled ? chartTradeSlPrice.toFixed(displayDecimals) : '--'}
                                </Text>
                              </Pressable>
                              <Pressable
                                style={[
                                  styles.chartTradeStopPairCard,
                                  styles.chartTradeStopPairCardTp,
                                  !chartTradeTpEnabled && styles.chartTradeStopPairCardInactive,
                                ]}
                                onPress={handleOpenChartTradeTpStepper}
                                unstable_pressDelay={0}
                                accessibilityRole="button"
                                accessibilityLabel={t('Take Profit')}
                              >
                                <View style={styles.chartTradeStopPairHeader}>
                                  <View style={[styles.chartTradeStopPairBadge, styles.chartTradeStopPairBadgeTp]}>
                                    <Ionicons name="trending-up-outline" size={16} color={T.trading.profit} />
                                  </View>
                                  {chartTradeStopUnit === 'Pips' && (
                                    <Pressable
                                      hitSlop={8}
                                      onPress={(e) => {
                                        e.stopPropagation?.();
                                        runImmediateAction('chart.tradeSheet.tp.lockToggle', () => setChartTradeTpLocked((v) => !v));
                                      }}
                                      style={[styles.chartTradeStopPairLock, chartTradeTpLocked && styles.chartTradeStopPairLockActive]}
                                      accessibilityRole="button"
                                      accessibilityLabel={t('Take Profit')}
                                    >
                                      <Ionicons
                                        name={chartTradeTpLocked ? 'lock-closed' : 'lock-open-outline'}
                                        size={15}
                                        color={chartTradeTpLocked ? BLUE : TEXT_MUTED}
                                      />
                                    </Pressable>
                                  )}
                                </View>
                                <Text style={styles.chartTradeStopPairLabel} numberOfLines={1}>{t('Take Profit')}</Text>
                                <Text
                                  style={[
                                    styles.chartTradeStopPairValue,
                                    !chartTradeTpEnabled && styles.chartTradeStopPairValueMuted,
                                  ]}
                                  numberOfLines={1}
                                  adjustsFontSizeToFit
                                >
                                  {chartTradeTpEnabled ? chartTradeTpPrice.toFixed(displayDecimals) : '--'}
                                </Text>
                              </Pressable>
                            </View>
                          </View>
                        )}

                        {showChartTradeExpiration ? (
                          <Pressable
                            style={[styles.chartTradeInfoRow, useMtPendingTradeSheetLayout && styles.chartTradeInfoRowPending]}
                            onPress={handleOpenChartExpirationMenu}
                            activateOnPressIn
                            unstable_pressDelay={0}
                          >
                            <Text style={[styles.chartTradeInfoLabel, useMtPendingTradeSheetLayout && styles.chartTradeInfoLabelPending]}>{t('Expiration')}:</Text>
                            <Text style={[styles.chartTradeInfoValue, useMtPendingTradeSheetLayout && styles.chartTradeInfoValuePending]}>{t(chartTradeExpiration)}</Text>
                            <Ionicons name="swap-vertical" size={12} color={BLUE} />
                          </Pressable>
                        ) : null}
                        {showChartTradeComment ? (
                          <View style={[styles.chartTradeCommentBlock, useMtPendingTradeSheetLayout && styles.chartTradeCommentBlockPending]}>
                            {chartTradeCommentFocused && !showFloatingChartTradeCommentEditor ? (
                              <View style={styles.chartTradeCommentEditorInlineRow}>
                                <View style={styles.chartTradeCommentEditorInlineInputWrap}>
                                  <TextInput
                                    ref={chartTradeCommentInputRef}
                                    autoFocus
                                    showSoftInputOnFocus
                                    style={styles.chartTradeCommentEditorInlineInput}
                                    value={chartTradeComment}
                                    onChangeText={(text) => setChartTradeComment(text.slice(0, 50))}
                                    onBlur={handleBlurChartTradeComment}
                                    placeholder={t('Comment')}
                                    placeholderTextColor='#94A3B8'
                                    maxLength={31}
                                    multiline={false}
                                    returnKeyType='done'
                                    onSubmitEditing={handleSubmitChartTradeComment}
                                  />
                                </View>
                                <Pressable
                                  onPressIn={() => {
                                    chartTradeCommentSubmitIntentRef.current = true;
                                  }}
                                  style={[
                                    styles.chartTradeCommentEditorInlineSubmit,
                                    !chartTradeComment.trim() && styles.chartTradeCommentEditorSubmitDisabled,
                                  ]}
                                  disabled={!chartTradeComment.trim()}
                                  onPress={handleSubmitChartTradeComment}
                                >
                                  <Ionicons
                                    name='checkmark'
                                    size={16}
                                    color={chartTradeComment.trim() ? BLUE : '#94A3B8'}
                                  />
                                </Pressable>
                              </View>
                            ) : (
                              <Pressable
                                style={[
                                  styles.chartTradeInfoRow,
                                  useMtPendingTradeSheetLayout && styles.chartTradeInfoRowPending,
                                  chartTradeCommentFocused && styles.chartTradeCommentInfoRowActive,
                                ]}
                                onPress={handleFocusChartTradeComment}
                              >
                                <Text
                                  style={[
                                    styles.chartTradeInfoLabel,
                                    useMtPendingTradeSheetLayout && styles.chartTradeInfoLabelPending,
                                    styles.chartTradeCommentInlineLabel,
                                  ]}
                                >
                                  {t('Comment')}:
                                </Text>
                                <Text
                                  style={[
                                    styles.chartTradeCommentInlineValue,
                                    !chartTradeComment.trim() && styles.chartTradeCommentInlinePlaceholder,
                                    useMtPendingTradeSheetLayout && styles.chartTradeInfoValuePending,
                                    chartTradeCommentFocused && styles.chartTradeCommentInlineValueActive,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {chartTradeComment.trim() || t('Add comment')}
                                </Text>
                              </Pressable>
                            )}
                          </View>
                        ) : null}

                        {chartTradeOrderType === 'Market Execution' ? (
                          <ChartTradeButtons
                            symbol={chartSymbol}
                            chartWindowPaneId={chartWindows.activePane.id}
                            displayDecimals={displayDecimals}
                            lotSize={tradeVolume}
                            volumeBounds={tradeVolumeBounds}
                            comment={chartTradeComment}
                            stopLossPrice={
                              !chartStopsTargetExistingPosition &&
                                !newMarketOrderProtectionBackendLocked &&
                                chartTradeSlEnabled
                                ? chartTradeSlPrice
                                : undefined
                            }
                            takeProfitPrice={
                              !chartStopsTargetExistingPosition &&
                                !newMarketOrderProtectionBackendLocked &&
                                chartTradeTpEnabled
                                ? chartTradeTpPrice
                                : undefined
                            }
                            protectionDraftId={directMarketProtectionDraftId}
                            pointSize={chartProtectionTickSize ?? 0}
                            variant='mt5-market'
                            active={chartRuntimeActive}
                            fallbackBid={chartTradeFooterFallbackBid}
                            fallbackAsk={chartTradeFooterFallbackAsk}
                            onTradeResult={handleChartTradeExecutionResult}
                            onTradeQueueEvent={handleChartTradeQueueEvent}
                            isDark={isDark}
                            buyColor={BLUE}
                            sellColor={T.trading.sell.primary}
                          />
                        ) : (
                          <>
                            <Pressable
                              style={[
                                styles.chartTradePlaceButton,
                                disablePendingTradePlaceButton
                                  ? styles.chartTradePlaceButtonDisabled
                                  : { backgroundColor: chartTradeCtaColor },
                              ]}
                              onPress={disablePendingTradePlaceButton ? undefined : handleSubmitPendingTradeFromSheet}
                              disabled={disablePendingTradePlaceButton}
                            >
                              <Text
                                style={[
                                  styles.chartTradePlaceButtonText,
                                  disablePendingTradePlaceButton && styles.chartTradePlaceButtonTextDisabled,
                                ]}
                                numberOfLines={1}
                              >
                                {`${t('Place')} ${t(chartTradeOrderType)}`}
                              </Text>
                            </Pressable>
                          </>
                        )}
                        <LiveOrderTickExecutionGraph
                          symbol={chartSymbol}
                          bid={chartBid}
                          ask={chartAsk}
                          timestamp={chartTradeTickTimestamp}
                          enabled={showChartTradeSheet}
                          priceDecimals={displayDecimals}
                          bidColor="#2563EB"
                          askColor="#EF4444"
                          height={286}
                          isDark={isDark}
                        />
                      </View>
                    </ScrollView>
                  </View>
                </Animated.View>
              </View>
            )}
            {!isChartExpanded && showChartMarketExecutionFooter && (chartWindows.isSplit || chartOneClickPanelAtBottom) && (
              <ChartTradeInlineFooter
                LiveTradeButtons={ChartTradeButtons}
                styles={styles}
                animatedStyle={chartWindows.isSplit ? undefined : floatingFooterTradeReserveAnimatedStyle}
                containerRef={footerTradeRowAnchorRef}
                isDark={isDark}
                buyColor={BLUE}
                sellColor={T.trading.sell.primary}
                hideInlineTradeRow={!chartWindows.isSplit && Platform.OS === 'android' && isFloatingFooterTradeRowVisible}
                showFloatingFooterTradeRow={!chartWindows.isSplit && shouldMountFloatingFooterTradeRow}
                chartSymbol={chartSymbol}
                chartWindowPaneId={chartWindows.activePane.id}
                displayDecimals={displayDecimals}
                tradeVolume={tradeVolume}
                tradeVolumeBounds={tradeVolumeBounds}
                comment={chartTradeComment}
                stopLossPrice={directMarketStopLossPrice}
                takeProfitPrice={directMarketTakeProfitPrice}
                protectionDraftId={directMarketProtectionDraftId}
                pointSize={chartProtectionTickSize ?? 0}
                onTradeResult={handleChartTradeExecutionResult}
                onTradeQueueEvent={handleChartTradeQueueEvent}
                onEditLot={handleFocusFooterLotEditor}
                onOpenLotEditor={handleOpenFooterLotPicker}
                isLotEditing={footerLotEditorFocused}
                lotDraft={lotInput}
                lotInputRef={footerLotEditorInputRef}
                onLotDraftChange={handleFooterLotDraftChange}
                onLotDraftBlur={handleBlurFooterLotEditor}
                onLotDraftEndEditing={handleEndFooterLotEditor}
                onLotDraftSubmit={handleSubmitFooterLotEditor}
                onDecreaseLot={() => handleStepFooterLotEditor(-1)}
                onIncreaseLot={() => handleStepFooterLotEditor(1)}
                lotInvalid={footerLotInvalid}
                invalidLotDisplay={footerLotInvalidDisplay}
                active={chartRuntimeActive}
                fallbackBid={chartTradeFooterFallbackBid}
                fallbackAsk={chartTradeFooterFallbackAsk}
                compactPane={chartWindows.isSplit && chartWindows.state.layout === 'vertical'}
                onLayout={(event) => {
                  const nextHeight = Math.max(0, Math.round(event.nativeEvent.layout.height));
                  if (nextHeight > 0) {
                    setChartTradeInlineFooterHeight((current) => (current === nextHeight ? current : nextHeight));
                  }
                  measureFooterTradeRowAnchorFrame();
                }}
              />
            )}
            {!isChartExpanded && chartDisplay.showQuickTradingButtons && chartOneClickPanelAtBottom && showChartTradeSheet && showInlineFooterWhileChartTradeSheetOpen ? (
              <ChartTradeInlineFooter
                LiveTradeButtons={ChartTradeButtons}
                styles={styles}
                animatedStyle={undefined}
                containerRef={footerTradeRowAnchorRef}
                isDark={isDark}
                buyColor={BLUE}
                sellColor={T.trading.sell.primary}
                showFloatingFooterTradeRow={false}
                chartSymbol={chartSymbol}
                chartWindowPaneId={chartWindows.activePane.id}
                displayDecimals={displayDecimals}
                tradeVolume={tradeVolume}
                tradeVolumeBounds={tradeVolumeBounds}
                comment={chartTradeComment}
                stopLossPrice={directMarketStopLossPrice}
                takeProfitPrice={directMarketTakeProfitPrice}
                protectionDraftId={directMarketProtectionDraftId}
                pointSize={chartProtectionTickSize ?? 0}
                onTradeResult={handleChartTradeExecutionResult}
                onTradeQueueEvent={handleChartTradeQueueEvent}
                onEditLot={handleFocusFooterLotEditor}
                onOpenLotEditor={handleOpenFooterLotPicker}
                isLotEditing={footerLotEditorFocused}
                lotDraft={lotInput}
                lotInputRef={footerLotEditorInputRef}
                onLotDraftChange={handleFooterLotDraftChange}
                onLotDraftBlur={handleBlurFooterLotEditor}
                onLotDraftEndEditing={handleEndFooterLotEditor}
                onLotDraftSubmit={handleSubmitFooterLotEditor}
                onDecreaseLot={() => handleStepFooterLotEditor(-1)}
                onIncreaseLot={() => handleStepFooterLotEditor(1)}
                lotInvalid={footerLotInvalid}
                invalidLotDisplay={footerLotInvalidDisplay}
                active={chartRuntimeActive}
                fallbackBid={chartTradeFooterFallbackBid}
                fallbackAsk={chartTradeFooterFallbackAsk}
                onLayout={(event) => {
                  const nextHeight = Math.max(0, Math.round(event.nativeEvent.layout.height));
                  if (nextHeight > 0) {
                    setChartTradeInlineFooterHeight((current) => (current === nextHeight ? current : nextHeight));
                  }
                  measureFooterTradeRowAnchorFrame();
                }}
              />
            ) : null}
          </ChartWindowsLayout>
        </ScrollView>
        {!showChartTradeSheet && chartTradeReceiptViewportStyle ? (
          <View
            pointerEvents="box-none"
            style={[styles.chartTradeReceiptViewportOverlay, chartTradeReceiptViewportStyle]}
          >
            <ChartTradeReceiptStack
              controller={chartTradeReceiptStackController}
              chartWindowPaneId={chartWindows.activePane.id}
              paneWidth={chartTapMenuViewport.width}
              isDark={isDark}
              buyColor={BLUE}
              sellColor={T.trading.sell.primary}
            />
          </View>
        ) : null}
        {!showChartTradeSheet
          && auxiliaryTradeReceiptViewportStyle
          && auxiliaryChartPaneViewport ? (
          <View
            pointerEvents="box-none"
            testID={`chart-trade-receipt-overlay-${auxiliaryChartPaneViewport.paneId}`}
            style={[
              styles.chartTradeReceiptViewportOverlay,
              auxiliaryTradeReceiptViewportStyle,
            ]}
          >
            <ChartTradeReceiptStack
              controller={chartTradeReceiptStackController}
              chartWindowPaneId={auxiliaryChartPaneViewport.paneId}
              paneWidth={auxiliaryChartPaneViewport.width}
              isDark={isDark}
              buyColor={BLUE}
              sellColor={T.trading.sell.primary}
            />
          </View>
        ) : null}
        {chartTradeOverlayLayer}
      </View>





      <ChartStepperModal
        visible={chartStepperEditor !== null}
        title={
          chartStepperEditor?.kind === 'price'
            ? t('Price')
            : chartStepperEditor?.kind === 'stopLimitPrice'
              ? t('Stop Limit Price')
              : chartStepperEditor?.kind === 'tp'
                ? t('Take Profit')
                : chartStepperEditor?.kind === 'sl'
                  ? t('Stop Loss')
                  : chartStepperEditor?.kind === 'volume'
                    ? t('Volume')
                    : ''
        }
        initial={
          chartStepperEditor?.kind === 'price'
            ? chartTradePrice || chartPendingLiveBid
            : chartStepperEditor?.kind === 'stopLimitPrice'
              ? chartTradeStopLimitPrice
              : chartStepperEditor?.kind === 'tp'
                ? chartTradeTpPrice
                : chartStepperEditor?.kind === 'sl'
                  ? chartTradeSlPrice
                  : chartStepperEditor?.kind === 'volume'
                    ? tradeVolume
                    : 0
        }
        step={
          chartStepperEditor?.kind === 'volume'
            ? (resolveTradeVolumeBounds(tradeVolumeBounds).stepVolume ?? 0.01)
            : (chartProtectionTickSize ?? chartPointSize * 10)
        }
        decimals={
          chartStepperEditor?.kind === 'volume'
            ? resolveTradeVolumeBounds(tradeVolumeBounds).decimals
            : Math.max(displayDecimals, 0)
        }
        min={
          chartStepperEditor?.kind === 'volume'
            ? resolveTradeVolumeBounds(tradeVolumeBounds).minVolume
            : undefined
        }
        max={
          chartStepperEditor?.kind === 'volume'
            ? resolveTradeVolumeBounds(tradeVolumeBounds).maxVolume
            : undefined
        }
        editable={chartStepperEditor?.kind === 'volume'}
        styles={styles}
        onClose={() => setChartStepperEditor(null)}
        onCommit={handleCommitChartStepperValue}
      />









      {showDatePicker && (
        <Pressable
          style={styles.calendarOverlay}
          onPress={() => setShowDatePicker(false)}
        >
          <View style={styles.calendarContainer}>
            <Calendar
              onDayPress={(day: any) => {
                handleCustomDateRange(new Date(day.timestamp));
              }}
              maxDate={new Date().toISOString().split('T')[0]}
              theme={{
                backgroundColor: isDark ? T.glass2 : T.glass2,
                calendarBackground: isDark ? T.glass2 : T.glass2,
                textSectionTitleColor: T.textSub,
                selectedDayBackgroundColor: BLUE,
                selectedDayTextColor: '#ffffff',
                todayTextColor: BLUE,
                dayTextColor: T.text,
                textDisabledColor: T.textMuted,
                monthTextColor: T.text,
                arrowColor: BLUE,
              }}
            />
          </View>
        </Pressable>
      )}

      <TextLevelEditOverlay
        accentColor={BLUE}
        isDark={isDark}
        request={textLevelEditRequest}
        onCancel={handleCancelTextLevelEdit}
        onCommit={handleCommitTextLevelEdit}
      />

      <ChartWindowManagerOverlay
        visible={chartWindows.managerVisible}
        panes={chartWindows.state.panes}
        selectedRemovalIds={chartWindows.selectedRemovalIds}
        canOpen={chartWindows.canOpenNewWindow}
        maxReached={!chartWindows.canOpenNewWindow}
        onClose={chartWindows.closeManager}
        onNewWindow={chartWindows.openNewWindow}
        onToggleRemoval={chartWindows.toggleRemoval}
        onRemove={chartWindows.removePanes}
        onSetHorizontal={() => chartWindows.setLayout('horizontal')}
        onSetVertical={() => chartWindows.setLayout('vertical')}
        onMovePane={chartWindows.movePane}
      />

      {/* While the SL/TP trade sheet is open (it portals over this screen),
          route the result dialog and the compact receipt through the elevated
          feedback portal so they appear ON the sheet where Buy/Sell was
          pressed. With the sheet closed they render inline exactly as before. */}
      <ChartTradeFeedbackPortal enabled={showChartTradeSheet}>
        <>
          {showChartTradeSheet ? (
            <ChartTradeReceiptStack
              controller={chartTradeReceiptStackController}
              chartWindowPaneId={chartWindows.activePane.id}
              paneWidth={chartTapMenuViewport.width}
              isDark={isDark}
              buyColor={BLUE}
              sellColor={T.trading.sell.primary}
              topOffset={72}
              bottomOffset={104}
            />
          ) : null}
          {chartTradeReceipt && showChartTradeSheet
            ? renderChartTradeReceiptBar(chartTradeReceipt)
            : null}
          <TradeFeedbackModal
            state={chartTradeReceipt ? TRADE_MODAL_INITIAL : tradeFeedback}
            onClose={handleTradeFeedbackClose}
            isDark={isDark}
          />
        </>
      </ChartTradeFeedbackPortal>
    </Screen>
  );
});

// Thin wrapper: derive the chart-active boolean from the path here so the heavy
// memoized component above does not reconcile on every bottom-tab switch. Only a
// change in isChartRouteActive (entering/leaving the chart) re-renders it.
/**
 * The main entry point and container for the Chart view. Orchestrates the webview-based chart, one-click trading panel, order placement buttons, lot sizing, price scale interactions, and all drawing tools.
 */
export function ChartScreen() {
  const isScreenFocused = useIsFocused();
  const marketDemandAllowed = useAuthMarketDemandAllowed();
  const immediateFocusRef = useRef(isScreenFocused && marketDemandAllowed);
  immediateFocusRef.current = isScreenFocused && marketDemandAllowed;
  const isTradeExecutionFocused = useCallback(
    () => immediateFocusRef.current,
    [],
  );
  const deferredScreenFocused = useNextFrameValue(isScreenFocused && marketDemandAllowed);
  return (
    <ChartScreenInner
      isChartRouteActive={marketDemandAllowed && deferredScreenFocused}
      isTradeExecutionFocused={isTradeExecutionFocused}
      marketDemandAllowed={marketDemandAllowed}
    />
  );
}
