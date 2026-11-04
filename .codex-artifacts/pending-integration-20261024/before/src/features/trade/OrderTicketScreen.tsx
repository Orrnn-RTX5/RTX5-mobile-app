/**
 * Trade Feature UI: OrderTicketScreen
 * 
 * Core order entry interface. Provides an interactive ticket configured for 
 * both Market Execution and Pending Orders, integrating live pricing from
 * quotes Websocket and immediate order submission to the trading backend.
 */

import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import {
  forwardRef,
  memo,
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
  useImperativeHandle,
  useSyncExternalStore,
  type ComponentProps,
} from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useUserPreferences } from '../../state/userPreferences';
import { useIsDarkTheme } from '../../state/themeMode';
import { usePositionsState } from '../../state/positionsState';
import { resolveTradingLogin, resolveTradingLoginString, useResolvedTradingLogin } from '../../state/tradingLogin';
import { ordersApi } from '../../api/orders';
import { scheduleMarketOrderSummaryRefresh } from '../../query/orders';
import { resolveBrokerExecutionEvidence } from '../../api/orders/executionEvidence';
import { isMarketOrderFeedbackCurrent } from '../../api/orders/marketOrderFeedback';
import { createMarketOrderIntentId } from '../../api/orders/marketOrderInFlight';
import { useAccountSummary } from '../../query/account';
import { useMarginCalculation } from '../../query/calculators';
import type { MarginCalcPayload } from '../../api/calculators';
import { useInstrumentMeta } from '../../query/instruments';
import { useMarketSymbols } from '../../query/market';
import { checkOrderPolicy } from '../../services/tradingPolicy';
import { useTheme, ThemeColors } from '../../ui/theme/useTheme';
import { fmt } from '../../utils/format';
import { formatBackendPrice } from '../../utils/backendPrice';
import { orderTicketMarginDisplay } from './orderTicketBackendValues';
import {
  safeRouterBack,
  scheduleBackNavigationAfterVisualFrame,
} from '../../utils/navigation';
import {
  useLiveQuoteSnapshot,
  useLiveQuoteSubscription,
} from '../quotes/useLiveQuotes';
import { normalizeSymbol } from '../../domain/symbols';
import { normalizeQuoteTickTimestampToMs } from '../../api/ws/quoteTimestamp';
import {
  quoteActionBlockMessage,
  recordBlockedPriceAction,
  resolveSessionQuoteActionAvailability,
} from '../../market/quoteIntegrity';
import { assertTradeSide, normalizeTradeSide, TRADE_SIDE, type TradeSide } from '../../domain/tradeSide';
import { classifyTradingError, createFrontendTradingError } from '../../api/tradingErrors';
import { TradeFeedbackModal, TRADE_MODAL_INITIAL, type TradeFeedbackState } from '../../ui/components/TradeFeedbackModal';
import { resolveConfirmedTradeReceipt } from '../../ui/components/tradeFeedbackPresentation';
import {
  ChartTradeReceiptStack,
  createChartTradeReceiptStackController,
} from '../chart/components/ChartTradeReceiptStack';
import { FastPressable } from '../../ui/components/FastPressable';
import { ActionSheet } from '../../ui/components/ActionSheet';
import { useDeferredRouteContentReady } from '../../ui/components/DeferredRouteMount';
import { CRITICAL_TRADE_ACTION_MAX_LATENCY_MS, runImmediateAction } from '../../utils/actionLatency';
import { useTranslation } from '../../i18n/useTranslation';
import { OrderTicketLaunchShell } from './OrderTicketLaunchShell';
import {
  getOrderTicketOriginHref,
  hideOrderTicketLaunch,
  resolveOrderTicketOrigin,
} from './orderTicketLaunchController';
import {
  formatTradeVolume,
  incrementTradeVolume,
  normalizeTradeVolume,
  sanitizeTradeVolumeDraft,
} from '../../utils/tradeVolume';
import {
  CHART_ORDER_TYPES,
  getChartOrderSide,
  isPendingChartOrderType,
  isStopLimitChartOrderType,
  resolveDefaultStopLimitPrice,
  type ChartOrderType,
} from '../chart/chartTradeOrderUtils';
import { DEFAULT_CHART_SYMBOLS, resolveChartSymbolFullName } from '../chart/chartSymbolMetadata';
import { redactDiagnosticValue, redactSensitiveString } from '../../utils/securityRedaction';
import { LiveOrderTickExecutionGraph } from './OrderTickExecutionGraph';
import {
  captureActiveBrokerSessionProvenance,
  subscribeActiveBrokerSession,
  isActiveBrokerSessionProvenanceCurrent,
} from '../../state/activeBrokerSession';
import { requestOrrnnDemoTradeAuth } from './tradeAuthPrompt';
import { blockInvestorTradeAction, useInvestorReadOnlySession } from '../../hooks/useInvestorReadOnlySession';
import { invalidateSessionQueryRoots } from '../../query/authenticatedQueryScope';
import {
  resolveOrderTicketDefaultPendingPrice,
  resolveOrderTicketPendingOffset,
  resolveOrderTicketPriceDecimals,
  resolveOrderTicketStopLimitOffset,
  roundOrderTicketPrice,
} from './orderTicketPreviewUtils';
import {
  getActiveSltpUnavailableMessage,
  isPendingOrderTypeBackendLocked,
  isPendingOrderPlacementBackendLocked,
  isNewMarketOrderProtectionBackendLocked,
  isPendingOrderProtectionBackendLocked,
  SLTP_COMING_SOON_TITLE,
} from './tradeBackendCapabilities';
import { PENDING_ORDER_PREVIEW_MESSAGE } from '../../config/pendingOrderAvailability';
import {
  publishChartProtectionDraftExecution,
  publishChartProtectionDraftSubmission,
  releaseChartProtectionDraftSubmission,
} from '../chart/chartProtectionDraftLifecycle';
import { markTradeIntent } from '../../utils/tradeIntent';
import { createOrderTicketReceiptAnchor, type OrderTicketReceiptAnchor } from './orderTicketReceiptAnchor';

/* Main screen */
// A single action model keeps BUY and SELL button behavior consistent across
// the top price panel and the lower execution buttons.
type OrderTicketTradeAction = {
  side: TradeSide;
  displayLabel: 'BUY' | 'SELL';
  marketLabel: 'BUY' | 'SELL';
  priceLabel: 'ASK' | 'BID';
  price: number;
  color: string;
  backgroundColor: string;
  execStyle: object;
  priceTestID: string;
  execTestID: string;
};

const ORDER_TICKET_TRADE_CONFIRMATION_VISIBLE_MS = 1000;
const ORDER_TICKET_TRADE_CONFIRMATION_MAX_ITEMS = 3;
const ORDER_TICKET_FULL_CONTENT_DELAY_MS = 0;
const ORDER_TICKET_DIAGNOSTICS_ENABLED =
  typeof process !== 'undefined' && process.env.EXPO_PUBLIC_DEBUG_CHART_TRADE === 'true';
const logOrderTicketDiagnostic = (...args: Parameters<typeof console.log>) => {
  if (ORDER_TICKET_DIAGNOSTICS_ENABLED) console.log(...args.map(redactDiagnosticValue));
};
const warnOrderTicketDiagnostic = (...args: Parameters<typeof console.log>) => {
  if (ORDER_TICKET_DIAGNOSTICS_ENABLED) console.log(...args.map(redactDiagnosticValue));
};

const isOrderTicketLeverageValue = (value: number | null | undefined): value is number => (
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value > 0
);

const formatOrderTicketLeverage = (value: number) => `1:${value}` as const;

type OrderTicketTradeConfirmation = {
  id: string;
  symbol: string;
  side: TradeSide;
  volumeLabel: string;
};

/**
 * Main Order Ticket screen for placing new trades. Orchestrates order type tabs (Market, Limit, Stop), lot size, and SL/TP fields.
 */
export function OrderTicketScreen() {
  const isScreenFocused = useIsFocused();
  const contentReady = useDeferredRouteContentReady(ORDER_TICKET_FULL_CONTENT_DELAY_MS, isScreenFocused);
  const wasFocusedRef = useRef(false);

  useEffect(() => {
    if (isScreenFocused) {
      wasFocusedRef.current = true;
      return;
    }

    // A warmed route can mount once while still unfocused. Only dismiss the
    // optimistic shell after a real focused -> blurred transition.
    if (wasFocusedRef.current) {
      wasFocusedRef.current = false;
      hideOrderTicketLaunch();
    }
  }, [isScreenFocused]);

  // Once the interactive ticket is ready under the stack, drop the handoff
  // shell so Back only pops one layer (no double shell + stack lag).
  useEffect(() => {
    if (!isScreenFocused || !contentReady) {
      return;
    }
    hideOrderTicketLaunch();
  }, [contentReady, isScreenFocused]);

  // Expo Router can retain a previously visited ticket underneath the tabs.
  // Do not keep its full shell/interactive tree subscribed and rendering while
  // another route is focused; the separate launch host owns the handoff frame.
  if (!isScreenFocused) {
    return null;
  }

  if (!contentReady) {
    return <OrderTicketInitialShell />;
  }

  return <OrderTicketInteractiveContent />;
}

/**
 * A placeholder loading shell displayed while the Order Ticket fetches initial quote and configuration data.
 */
function OrderTicketInitialShell() {
  const { symbol: routeSymbol, origin } = useLocalSearchParams<{ symbol?: string; origin?: string }>();
  const symbol = normalizeSymbol(routeSymbol || 'EURUSD');
  const originHref = getOrderTicketOriginHref(resolveOrderTicketOrigin(origin));
  const router = useRouter();
  const backNavigationStartedRef = useRef(false);

  const handleBack = useCallback(() => {
    if (backNavigationStartedRef.current) {
      return;
    }
    backNavigationStartedRef.current = true;
    hideOrderTicketLaunch();
    scheduleBackNavigationAfterVisualFrame(() => {
      safeRouterBack(router, originHref);
    });
  }, [originHref, router]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <OrderTicketLaunchShell
        symbol={symbol}
        active
        onBack={handleBack}
        backLatencyLabel="orderTicket.route.shell.back"
      />
    </>
  );
}

type OrderTicketSymbolPickerSheetHostHandle = {
  open: () => void;
};

type OrderTicketSymbolPickerSheetHostProps = {
  actions: ComponentProps<typeof ActionSheet>['actions'];
};

const ORDER_TICKET_SYMBOL_PICKER_VISUAL_KEY = 'orderTicket.symbolPicker';
const lastOrderTicketReceiptGeometry: Parameters<OrderTicketReceiptAnchor['update']>[0] = {};

/**
 * Retained route-local sheet host. It owns only picker visibility so opening
 * the dollar menu never reconciles the live quote, graph, and order form tree.
 */
const OrderTicketSymbolPickerSheetHost = memo(forwardRef<
  OrderTicketSymbolPickerSheetHostHandle,
  OrderTicketSymbolPickerSheetHostProps
>(function OrderTicketSymbolPickerSheetHost({ actions }, ref) {
  const { t } = useTranslation();
  const [symbolPickerOpen, setSymbolPickerOpen] = useState(false);
  const open = useCallback(() => setSymbolPickerOpen(true), []);
  const close = useCallback(() => setSymbolPickerOpen(false), []);

  useImperativeHandle(ref, () => ({ open }), [open]);

  if (!symbolPickerOpen) {
    return null;
  }

  return (
    <ActionSheet
      visible={symbolPickerOpen}
      onClose={close}
      title={t('Select Symbol')}
      searchable
      compactText
      presentation="mt5Plain"
      deferOffscreenActions
      maximumVisibleActionRows={9}
      detent="large"
      instantOpen
      entryMotion="mt5Slide"
      immediateHostHideOnClose
      visualKey={ORDER_TICKET_SYMBOL_PICKER_VISUAL_KEY}
      runActionAfterClose={false}
      keepFullHeightOnKeyboard
      actions={actions}
    />
  );
}));

/**
 * The fully loaded, interactive portion of the Order Ticket containing the trade forms and order type tabs.
 */
function OrderTicketInteractiveContent() {
  // Route params let chart and quote screens open the ticket with a specific
  // symbol, initial trade side, or order comment.
  const {
    symbol: routeSymbol,
    comment: routeComment,
    side: routeSideParam,
    sl: routeSlParam,
    tp: routeTpParam,
    protectionDraftId: routeProtectionDraftIdParam,
    origin,
  } = useLocalSearchParams<{
    symbol?: string;
    comment?: string;
    side?: string;
    sl?: string;
    tp?: string;
    protectionDraftId?: string;
    origin?: string;
  }>();
  const resolvedOrigin = resolveOrderTicketOrigin(origin);
  const originHref = getOrderTicketOriginHref(resolvedOrigin);
  const routeInitialSymbol = String(routeSymbol || 'EURUSD').trim() || 'EURUSD';
  const routeProtectionDraftId =
    typeof routeProtectionDraftIdParam === 'string'
      ? routeProtectionDraftIdParam.trim()
      : '';
  const [symbol, setSymbol] = useState(routeInitialSymbol);
  const routeSymbolRef = useRef(routeInitialSymbol);
  const routeSide = normalizeTradeSide(routeSideParam);
  const initialRouteSlPrice = Number(routeSlParam);
  const initialRouteTpPrice = Number(routeTpParam);
  const initialMarketProtectionBackendLocked = isNewMarketOrderProtectionBackendLocked();
  const initialSlPrice = !initialMarketProtectionBackendLocked
    && Number.isFinite(initialRouteSlPrice)
    && initialRouteSlPrice > 0
    ? initialRouteSlPrice
    : 0;
  const initialTpPrice = !initialMarketProtectionBackendLocked
    && Number.isFinite(initialRouteTpPrice)
    && initialRouteTpPrice > 0
    ? initialRouteTpPrice
    : 0;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isScreenFocused = useIsFocused();
  const backNavigationStartedRef = useRef(false);
  const symbolPickerSheetRef = useRef<OrderTicketSymbolPickerSheetHostHandle>(null);
  const accountDetails = useUserPreferences((s) => s.accountDetails);
  const tradeVolume = useUserPreferences((s) => s.tradeVolume);
  const setTradeVolume = useUserPreferences((s) => s.setTradeVolume);
  const oneClickAccepted = useUserPreferences((s) => s.oneClickAccepted);
  const brokerId = useUserPreferences((s) => s.brokerId);
  const T = useTheme();
  const { t } = useTranslation();
  const isDark = useIsDarkTheme();
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);
  // The outer route already painted its shell. Start values and graph now,
  // without another timer for each section.
  const heavyContentReady = isScreenFocused;
  const routeQueriesActive = isScreenFocused;
  const { data: marketSymbols = [], isFetching: marketSymbolsFetching } = useMarketSymbols(routeQueriesActive);
  useEffect(() => {
    if (!isScreenFocused || useUserPreferences.getState().isLoggedIn) return;
    requestOrrnnDemoTradeAuth({ kind: 'order-ticket', symbol: routeSymbol, side: routeSide ?? undefined, volume: tradeVolume, origin: resolvedOrigin });
  }, [isScreenFocused, routeSymbol, routeSide, tradeVolume, resolvedOrigin]);

  useEffect(() => {
    if (isScreenFocused) {
      backNavigationStartedRef.current = false;
    }
  }, [isScreenFocused]);

  const handleOrderTicketBack = useCallback(() => {
    if (backNavigationStartedRef.current) {
      return;
    }
    backNavigationStartedRef.current = true;
    // Drop any leftover handoff shell first, then pop after the press frame
    // so return to chart stays smooth (same ordering as Chart Preferences back).
    hideOrderTicketLaunch();
    scheduleBackNavigationAfterVisualFrame(() => {
      safeRouterBack(router, originHref);
    });
  }, [originHref, router]);

  useEffect(() => {
    if (routeSymbolRef.current === routeInitialSymbol) {
      return;
    }

    routeSymbolRef.current = routeInitialSymbol;
    setSymbol(routeInitialSymbol);
  }, [routeInitialSymbol]);

  const SELL_C = T.trading.sell.primary;
  const SELL_BG = isDark ? 'rgba(255,59,48,0.08)' : 'rgba(220,38,38,0.06)';
  const BUY_C = T.trading.buy.primary;
  const BUY_BG = isDark ? 'rgba(52,125,255,0.14)' : 'rgba(37,99,235,0.08)';

  // The order type decides whether this ticket submits immediately or prepares
  // a pending order with an editable trigger price.
  const [orderType, setOrderType] = useState<ChartOrderType>('Market Execution');
  const { data: instrumentMeta } = useInstrumentMeta(symbol, routeQueriesActive);
  // Broker metadata defines the valid lot range and step size for the symbol.
  const volumeBounds = useMemo(
    () => ({
      minVolume: instrumentMeta?.minVolume,
      maxVolume: instrumentMeta?.maxVolume,
      stepVolume: instrumentMeta?.stepVolume,
    }),
    [instrumentMeta?.maxVolume, instrumentMeta?.minVolume, instrumentMeta?.stepVolume],
  );
  const [volume, setVolume] = useState(() => normalizeTradeVolume(tradeVolume, volumeBounds));
  const [volumeInput, setVolumeInput] = useState(() => formatTradeVolume(tradeVolume, volumeBounds));
  const [slEnabled, setSlEnabled] = useState(initialSlPrice > 0);
  const [slPrice, setSlPrice] = useState(initialSlPrice);
  const [tpEnabled, setTpEnabled] = useState(initialTpPrice > 0);
  const [tpPrice, setTpPrice] = useState(initialTpPrice);
  const [symbolCatalogReady, setSymbolCatalogReady] = useState(false);

  useEffect(() => {
    if (!isScreenFocused || symbolCatalogReady) {
      return;
    }
    const frameId = requestAnimationFrame(() => {
      setSymbolCatalogReady(true);
    });
    return () => cancelAnimationFrame(frameId);
  }, [isScreenFocused, symbolCatalogReady]);

  const availableSymbols = useMemo(() => {
    if (!symbolCatalogReady) {
      return [];
    }
    const seen = new Set<string>();
    const options: string[] = [];
    const addSymbol = (candidate: string | undefined) => {
      const nextSymbol = String(candidate || '').trim();
      if (!nextSymbol || seen.has(nextSymbol)) {
        return;
      }
      seen.add(nextSymbol);
      options.push(nextSymbol);
    };

    marketSymbols
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .forEach(addSymbol);

    return options;
  }, [marketSymbols, symbol, symbolCatalogReady]);

  const handleOpenSymbolPicker = useCallback(() => {
    runImmediateAction('orderTicket.symbol.open', () => {
      setSymbolCatalogReady(true);
      symbolPickerSheetRef.current?.open();
    });
  }, []);

  const handleSymbolSelect = useCallback((nextSymbol: string) => {
    const normalizedNextSymbol = nextSymbol.trim();

    if (!normalizedNextSymbol || normalizedNextSymbol === symbol) {
      return;
    }

    setSymbol(normalizedNextSymbol);
  }, [symbol]);

  const symbolPickerActions = useMemo(() => {
    if (!availableSymbols.length) {
      return [{
        label: marketSymbolsFetching ? t('Loading symbols...') : t('No symbols available'),
        disabled: true,
      }];
    }

    return availableSymbols.map((candidate) => ({
      label: candidate.replace(/\//g, ''),
      subtitle: candidate === symbol
        ? `${t('Selected')} - ${resolveChartSymbolFullName(candidate)}`
        : resolveChartSymbolFullName(candidate),
      onPress: () => handleSymbolSelect(candidate),
    }));
  }, [availableSymbols, handleSymbolSelect, marketSymbolsFetching, symbol, t]);

  // Market BUY/SELL executions and broker rejections share one feedback surface,
  // without device vibration. Confirmed fills use its RTX5 execution receipt.
  const [modalState, setModalState] = useState<TradeFeedbackState>({
    visible: false,
    type: 'error',
    title: '',
    message: '',
  });
  const [tradeConfirmations, setTradeConfirmations] = useState<OrderTicketTradeConfirmation[]>([]);
  const tradeConfirmationTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const [orderTicketReceiptController] = useState(createChartTradeReceiptStackController);
  const [orderTicketReceiptAnchor] = useState<OrderTicketReceiptAnchor>(() => {
    const anchor = createOrderTicketReceiptAnchor();
    if (Object.keys(lastOrderTicketReceiptGeometry).length > 0) {
      anchor.update({ ...lastOrderTicketReceiptGeometry, scrollOffset: 0 });
    }
    const baseUpdate = anchor.update;
    return {
      ...anchor,
      update(patch) {
        Object.assign(lastOrderTicketReceiptGeometry, patch);
        baseUpdate(patch);
      },
    };
  });
  const nextReceiptIdRef = useRef(1);
  const showModal = useCallback((
    state: TradeFeedbackState,
    receiptId?: number,
    unresolvedStatus?: 'failed' | 'unconfirmed',
  ) => {
    const submitted = receiptId === undefined ? undefined
      : orderTicketReceiptController.getSnapshot().find(event => event.queueId === receiptId);
    // Unmount/account cleanup must not resurrect an old submitted receipt.
    if (receiptId !== undefined && !submitted) return;
    const receipt = resolveConfirmedTradeReceipt(state);
    if (receipt) {
      orderTicketReceiptController.applyEvent({
        queueId: receiptId ?? nextReceiptIdRef.current++,
        status: 'confirmed',
        side: receipt.side,
        symbol: receipt.symbol,
        volume: Number(state.volume),
        feedback: state,
      });
      setModalState(current => current.visible ? TRADE_MODAL_INITIAL : current);
      return;
    }
    if (submitted) {
      orderTicketReceiptController.applyEvent({
        ...submitted,
        status: unresolvedStatus ?? (state.type === 'error' ? 'failed' : 'unconfirmed'),
        feedback: state,
      });
      setModalState(current => current.visible ? TRADE_MODAL_INITIAL : current);
      return;
    }
    // Keep rejection and incomplete-execution details; never mark them done.
    setModalState(state);
  }, [orderTicketReceiptController]);

  useEffect(() => {
    let namespace = captureActiveBrokerSessionProvenance()?.cacheNamespace;
    const unsubscribe = subscribeActiveBrokerSession(() => {
      const nextNamespace = captureActiveBrokerSessionProvenance()?.cacheNamespace;
      if (nextNamespace !== namespace) {
        namespace = nextNamespace;
        orderTicketReceiptController.clear();
        setModalState(TRADE_MODAL_INITIAL);
      }
    });
    return () => {
      unsubscribe();
      orderTicketReceiptController.clear();
    };
  }, [orderTicketReceiptController]);

  const handleModalClose = useCallback(() => {
    setModalState(prev => ({ ...prev, visible: false }));
  }, []);
  const showTradeConfirmation = useCallback(({
    side,
    symbol: confirmationSymbol,
    volume: confirmationVolume,
  }: {
    side: TradeSide;
    symbol: string;
    volume: number | string;
  }) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const volumeLabel = typeof confirmationVolume === 'number'
      ? formatTradeVolume(confirmationVolume, volumeBounds)
      : String(confirmationVolume || '');
    const confirmation: OrderTicketTradeConfirmation = {
      id,
      symbol: String(confirmationSymbol || symbol || '').replace(/\//g, ''),
      side,
      volumeLabel,
    };

    setTradeConfirmations((current) =>
      [confirmation, ...current].slice(0, ORDER_TICKET_TRADE_CONFIRMATION_MAX_ITEMS),
    );

    const timer = setTimeout(() => {
      setTradeConfirmations((current) => current.filter((item) => item.id !== id));
    }, ORDER_TICKET_TRADE_CONFIRMATION_VISIBLE_MS);
    tradeConfirmationTimersRef.current.push(timer);
  }, [symbol, volumeBounds]);

  useEffect(() => () => {
    tradeConfirmationTimersRef.current.forEach((timer) => clearTimeout(timer));
    tradeConfirmationTimersRef.current = [];
  }, []);

  // Keep the editable volume field aligned with saved preferences and the
  // latest broker volume limits.
  useEffect(() => {
    const normalized = normalizeTradeVolume(tradeVolume, volumeBounds);
    setVolume(normalized);
    setVolumeInput(formatTradeVolume(normalized, volumeBounds));
  }, [tradeVolume, volumeBounds]);

  // Live WebSocket pricing drives the BID/ASK buttons and every price preview.
  // Seed from the shared watchlist snapshot — the price the user was just
  // looking at on the Quotes screen — so BID/ASK render real values in the
  // first frame instead of "--" while this route's own subscription warms up.
  useLiveQuoteSubscription(symbol, routeQueriesActive);
  const liveQuote = useLiveQuoteSnapshot(symbol, isScreenFocused);
  const BID = typeof liveQuote?.bid === 'number' && liveQuote.bid > 0 ? liveQuote.bid : 0;
  const ASK = typeof liveQuote?.ask === 'number' && liveQuote.ask > 0 ? liveQuote.ask : 0;
  const tickTimestamp =
    liveQuote?.feedTickAt
    ?? liveQuote?.lastTickAt
    ?? liveQuote?.lastReceivedAt
    ?? null;
  const [quoteFreshnessNow, setQuoteFreshnessNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isScreenFocused) return;
    const timer = setInterval(() => {
      const now = Date.now();
      if (resolveSessionQuoteActionAvailability(executableLiveQuoteRef.current, now).allowed !== quoteAllowedRef.current) {
        setQuoteFreshnessNow(now);
      }
    }, 1_000);
    return () => clearInterval(timer);
  }, [isScreenFocused]);
  const quoteTimeMs = normalizeQuoteTickTimestampToMs(
    liveQuote?.lastReceivedAt
      ?? liveQuote?.lastTickAt
      ?? tickTimestamp,
  );
  // Same executable shape for UI disable + submit recheck. Spreading liveQuote
  // alone used to drop normalized bid/ask/receipt time on the press path and
  // show a false "live quote is stale" while the tiles still had prices.
  const executableLiveQuote = liveQuote
    ? {
        ...liveQuote,
        bid: BID,
        ask: ASK,
        lastReceivedAt: quoteTimeMs ?? liveQuote.lastReceivedAt ?? liveQuote.lastTickAt,
        feedTickAt: liveQuote.feedTickAt ?? liveQuote.lastTickAt,
        transport: liveQuote.transport ?? ('websocket' as const),
      }
    : null;
  const quoteActionAvailability = resolveSessionQuoteActionAvailability(
    executableLiveQuote,
    Math.max(Date.now(), quoteFreshnessNow),
  );
  const quoteIsUnavailable = !quoteActionAvailability.allowed;
  const executableLiveQuoteRef = useRef(executableLiveQuote);
  executableLiveQuoteRef.current = executableLiveQuote;
  const quoteAllowedRef = useRef(quoteActionAvailability.allowed);
  quoteAllowedRef.current = quoteActionAvailability.allowed;
  const quoteUnavailableMessage = quoteActionBlockMessage(quoteActionAvailability);
  const resolveCurrentQuoteAvailability = () =>
    resolveSessionQuoteActionAvailability(executableLiveQuote, Date.now());
  const isMarketExecution = orderType === 'Market Execution';

  const loginStr = resolveTradingLoginString();
  // Reactive numeric login — the codebase's standard source for query hooks
  // keyed by account login (see useResolvedTradingLogin docs).
  const loginNum = useResolvedTradingLogin();
  const { data: accountSummary, isError: accountSummaryError } = useAccountSummary(loginStr, { enabled: routeQueriesActive });
  const backendLeverage = isOrderTicketLeverageValue(accountSummary?.leverage)
    ? accountSummary.leverage
    : null;
  const leverageDisplay = backendLeverage !== null
    ? formatOrderTicketLeverage(backendLeverage)
    : '--';
  const currency = accountSummary?.currency;

  // Authoritative margin from the server calculator. It applies the account's
  // real leverage, the broker's contract specs, and the symbol's margin mode —
  // the only figure that matches what the trading engine actually locks. Keyed
  // on (login, symbol, side, volume) so it refetches as the user edits volume.
  // Margin is direction-independent for display, so 'buy' is representative.
  const marginCalcPayload = useMemo<MarginCalcPayload | null>(() => {
    if (!routeQueriesActive) return null;
    if (loginNum === undefined || loginNum <= 0) return null;
    if (!symbol || !(volume > 0)) return null;
    return { account_login: loginNum, symbol, side: 'buy', volume };
  }, [loginNum, routeQueriesActive, symbol, volume]);
  const { data: serverMargin, isError: marginError } = useMarginCalculation(marginCalcPayload);

  const serverRequiredMargin =
    typeof serverMargin?.required_margin === 'number' && Number.isFinite(serverMargin.required_margin)
      ? serverMargin.required_margin
      : null;
  const marginDisplay = orderTicketMarginDisplay(serverRequiredMargin, currency);

  const baseSymbol = symbol.replace(/[a-z_.-].*$/, '');
  const pipSize = baseSymbol.includes('JPY') ? 0.01 : baseSymbol.includes('BTC') ? 10 : baseSymbol.includes('XAU') ? 0.1 : 0.0001;
  const priceTickSize = instrumentMeta?.tickSize && instrumentMeta.tickSize > 0 ? instrumentMeta.tickSize : pipSize;
  // Price precision comes from broker tick size when available; otherwise the
  // ticket falls back to a symbol-family pip size.
  const priceDecimals = useMemo(
    () => resolveOrderTicketPriceDecimals(priceTickSize, BID, ASK),
    [ASK, BID, priceTickSize],
  );
  const pricePointSize = useMemo(() => {
    if (priceTickSize > 0) {
      return priceTickSize;
    }
    return Math.pow(10, -Math.max(priceDecimals, 0));
  }, [priceDecimals, priceTickSize]);
  const pendingOffset = useMemo(
    () => resolveOrderTicketPendingOffset(baseSymbol, pricePointSize),
    [baseSymbol, pricePointSize],
  );
  const stopLimitOffset = useMemo(
    () => resolveOrderTicketStopLimitOffset(baseSymbol, pricePointSize, pendingOffset),
    [baseSymbol, pendingOffset, pricePointSize],
  );
  const roundPendingPrice = useCallback(
    (value: number) => roundOrderTicketPrice(value, priceTickSize, priceDecimals),
    [priceDecimals, priceTickSize],
  );
  const resolveDefaultPendingPrice = useCallback(
    (type: ChartOrderType) =>
      resolveOrderTicketDefaultPendingPrice({
        orderType: type,
        bid: BID,
        ask: ASK,
        pendingOffset,
        roundPrice: roundPendingPrice,
      }),
    [ASK, BID, pendingOffset, roundPendingPrice],
  );
  const [pendingEntryPrice, setPendingEntryPrice] = useState(0);
  const [pendingStopLimitPrice, setPendingStopLimitPrice] = useState(0);
  const lastConfiguredPendingOrderTypeRef = useRef<ChartOrderType | null>(null);
  const isPendingOrderType = isPendingChartOrderType(orderType);
  const pendingOrderPlacementBackendLocked = isPendingOrderPlacementBackendLocked(orderType);
  const isStopLimitOrderType = isStopLimitChartOrderType(orderType);
  const newMarketOrderProtectionBackendLocked =
    isNewMarketOrderProtectionBackendLocked();
  const pendingOrderProtectionBackendLocked =
    isPendingOrderProtectionBackendLocked();
  const protectionBackendLocked = isPendingOrderType
    ? pendingOrderProtectionBackendLocked
    : newMarketOrderProtectionBackendLocked;
  const hasProtectionIntent =
    slEnabled
    || tpEnabled
    || (Number.isFinite(slPrice) && slPrice > 0)
    || (Number.isFinite(tpPrice) && tpPrice > 0);

  useEffect(() => {
    if (!protectionBackendLocked) {
      return;
    }
    setSlEnabled(false);
    setSlPrice(0);
    setTpEnabled(false);
    setTpPrice(0);
  }, [protectionBackendLocked]);

  const previousSymbolRef = useRef(symbol);
  useEffect(() => {
    if (previousSymbolRef.current === symbol) {
      return;
    }

    previousSymbolRef.current = symbol;
    setSlEnabled(false);
    setSlPrice(0);
    setTpEnabled(false);
    setTpPrice(0);
    setPendingEntryPrice(0);
    setPendingStopLimitPrice(0);
    lastConfiguredPendingOrderTypeRef.current = null;
  }, [symbol]);

  // When the user switches into a pending order type, seed the trigger and
  // stop-limit prices once. User edits are preserved until the type changes.
  useEffect(() => {
    if (!isPendingOrderType) {
      lastConfiguredPendingOrderTypeRef.current = null;
      return;
    }

    const nextEntry = resolveDefaultPendingPrice(orderType);
    if (!Number.isFinite(nextEntry) || nextEntry <= 0) {
      return;
    }

    const shouldResetPendingDefaults =
      lastConfiguredPendingOrderTypeRef.current !== orderType || pendingEntryPrice <= 0;

    if (!shouldResetPendingDefaults) {
      return;
    }

    setPendingEntryPrice(nextEntry);
    setPendingStopLimitPrice(
      resolveDefaultStopLimitPrice(orderType, nextEntry, stopLimitOffset, roundPendingPrice),
    );
    lastConfiguredPendingOrderTypeRef.current = orderType;
  }, [
    isPendingOrderType,
    orderType,
    pendingEntryPrice,
    resolveDefaultPendingPrice,
    roundPendingPrice,
    stopLimitOffset,
  ]);

  // Stepper changes always round to the valid tick size and keep the stop-limit
  // price aligned with the current trigger.
  const handlePendingEntryPriceChange = useCallback(
    (nextPrice: number) => {
      const roundedEntry = roundPendingPrice(nextPrice);
      if (!Number.isFinite(roundedEntry) || roundedEntry <= 0) {
        return;
      }

      setPendingEntryPrice(roundedEntry);
      setPendingStopLimitPrice(
        resolveDefaultStopLimitPrice(orderType, roundedEntry, stopLimitOffset, roundPendingPrice),
      );
    },
    [orderType, roundPendingPrice, stopLimitOffset],
  );
  // Helper text explains which pending-order line can be moved in the preview.
  const pendingPreviewSummary = useMemo(() => {
    const triggerValue = pendingEntryPrice > 0 ? formatBackendPrice(pendingEntryPrice) : '--';
    if (!isPendingOrderType) {
      return '';
    }

    if (isStopLimitOrderType) {
      const stopLimitValue = pendingStopLimitPrice > 0 ? formatBackendPrice(pendingStopLimitPrice) : '--';
      return `Drag the dotted trigger line in the graph to move the pending price.\nTrigger: ${triggerValue}\nStop Limit: ${stopLimitValue}`;
    }

    return `Drag the dotted trigger line in the graph to move the pending price.\nTrigger: ${triggerValue}`;
  }, [
    isPendingOrderType,
    isStopLimitOrderType,
    pendingEntryPrice,
    pendingStopLimitPrice,
    priceDecimals,
  ]);

  const [pendingSide, setPendingSide] = useState<TradeSide | null>(null);
  const [tradeActionLocked, setTradeActionLocked] = useState(false);
  const marketPendingCountsRef = useRef({ buy: 0, sell: 0 });
  const marketPendingCounts = marketPendingCountsRef.current;
  const setMarketPendingCounts = useCallback(
    (update: (counts: { buy: number; sell: number }) => { buy: number; sell: number }) => {
      marketPendingCountsRef.current = update(marketPendingCountsRef.current);
    },
    [],
  );
  // Pending-order preview submission has its own lock. Market taps are
  // independent intents; FastPressable handles duplicate callbacks per gesture.
  const tradeTapLockRef = useRef(false);
  const tradeTapLockSideRef = useRef<TradeSide | null>(null);
  // Investor (read-only) login: every order action is disabled.
  const investorReadOnly = useInvestorReadOnlySession();
  // Match One-Click submission: local permissions and quotes guard the tap;
  // the order endpoint decides final market/margin acceptance. Calculator
  // previews load independently and never hold up an executable order.
  const tradePolicyErrors = useMemo(() => ({
    buy: checkOrderPolicy(instrumentMeta, volume, 'buy', accountDetails),
    sell: checkOrderPolicy(instrumentMeta, volume, 'sell', accountDetails),
  }), [instrumentMeta, volume, accountDetails]);
  const tradeActionUnavailable = investorReadOnly || quoteIsUnavailable
    || Boolean(tradePolicyErrors.buy && tradePolicyErrors.sell);
  const tradeActionDisabled = tradeActionUnavailable
    || (!isMarketExecution && (pendingSide !== null || tradeActionLocked));
  const pricePanelActionUnavailable = !isMarketExecution;
  const isTradeActionPending = (side: TradeSide) => isMarketExecution
    ? marketPendingCounts[side] > 0 : pendingSide === side;
  const isSideActionDisabled = (side: TradeSide) => tradeActionDisabled || Boolean(tradePolicyErrors[side]);
  const isPricePanelActionDisabled = (side: TradeSide) => pricePanelActionUnavailable || isSideActionDisabled(side);
  const getPricePanelActionOpacity = (side: TradeSide) =>
    pricePanelActionUnavailable || isSideActionDisabled(side) ? 0.5 : 1;
  const tradeButtonActions: readonly OrderTicketTradeAction[] = [
    {
      side: TRADE_SIDE.sell,
      displayLabel: 'SELL',
      marketLabel: 'SELL',
      priceLabel: 'BID',
      price: BID,
      color: SELL_C,
      backgroundColor: SELL_BG,
      execStyle: styles.execSell,
      priceTestID: 'order-ticket-sell-price-button',
      execTestID: 'order-ticket-sell-market-button',
    },
    {
      side: TRADE_SIDE.buy,
      displayLabel: 'BUY',
      marketLabel: 'BUY',
      priceLabel: 'ASK',
      price: ASK,
      color: BUY_C,
      backgroundColor: BUY_BG,
      execStyle: styles.execBuy,
      priceTestID: 'order-ticket-buy-price-button',
      execTestID: 'order-ticket-buy-market-button',
    },
  ];
  const sellTradeAction = tradeButtonActions[0];
  const buyTradeAction = tradeButtonActions[1];

  // Submit a market order. This path validates account context, builds the API
  // payload, handles backend rejection, and updates the positions list.
  const handlePlaceOrder = async (side: TradeSide) => {
    // Tap time for the Journal's order latency telemetry.
    markTradeIntent();
    if (requestOrrnnDemoTradeAuth({
      kind: 'market-order',
      symbol,
      side,
      volume,
      origin: resolvedOrigin,
    })) {
      return;
    }
    if (blockInvestorTradeAction(t)) return;
    const policyError = checkOrderPolicy(instrumentMeta, volume, side, accountDetails);
    if (policyError) {
      showModal({ visible: true, type: 'error', title: 'Trading unavailable', message: policyError, side });
      return;
    }
    const requestedSide = assertTradeSide(side);
    if (!isMarketExecution) {
      logOrderTicketDiagnostic('[TRADE-BUTTON-PRESS]', {
        symbol,
        buttonPressed: requestedSide,
        displayedLabel: requestedSide === 'buy' ? 'BUY' : 'SELL',
        sidePassedToHandler: requestedSide,
        routeSide: routeSide ?? null,
        ignored: true,
        reason: 'order-type-not-market',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    const marketProtectionLockedAtSubmit =
      isNewMarketOrderProtectionBackendLocked();
    if (marketProtectionLockedAtSubmit && hasProtectionIntent) {
      showModal({
        visible: true,
        type: 'error',
        title: t(SLTP_COMING_SOON_TITLE),
        message: t(getActiveSltpUnavailableMessage()),
        side: requestedSide,
      });
      return;
    }
    const currentQuoteAvailability = resolveCurrentQuoteAvailability();
    if (!currentQuoteAvailability.allowed) {
      recordBlockedPriceAction('order_ticket_market_order', currentQuoteAvailability);
      showModal({
        visible: true,
        type: 'error',
        title: 'Market Data Unavailable',
        message: quoteActionBlockMessage(currentQuoteAvailability),
        side: requestedSide,
      });
      return;
    }
    logOrderTicketDiagnostic('[TRADE-BUTTON-PRESS]', {
      symbol,
      buttonPressed: requestedSide,
      displayedLabel: requestedSide === 'buy' ? 'BUY' : 'SELL',
      sidePassedToHandler: requestedSide,
      routeSide: routeSide ?? null,
      timestamp: new Date().toISOString(),
    });

    if (!accountDetails?.id || !accountDetails?.credentials?.accessToken) {
      const feedback = createFrontendTradingError(
        'Authentication Error',
        'The app does not have a valid local trading session. Log in again before placing an order.',
      );
      showModal({ visible: true, type: 'error', title: feedback.title, message: feedback.message, side: requestedSide });
      return;
    }

    const tradingLogin = resolveTradingLogin();
    if (!tradingLogin) {
      const feedback = createFrontendTradingError(
        'Account Error',
        'The app could not resolve the active trading account from local state. Select an account and try again.',
      );
      showModal({ visible: true, type: 'error', title: feedback.title, message: feedback.message, side: requestedSide });
      return;
    }
    const marketActionProvenance = captureActiveBrokerSessionProvenance();
    if (
      !marketActionProvenance ||
      marketActionProvenance.identity.accountLogin !== String(tradingLogin)
    ) {
      const feedback = createFrontendTradingError(
        'Account Session Changed',
        'The active trading account changed before this order could be sent. Reopen New Order from the current account and try again.',
      );
      showModal({
        visible: true,
        type: 'error',
        title: feedback.title,
        message: feedback.message,
        side: requestedSide,
      });
      return;
    }

    let releaseProtectionSubmissionOnExit = false;
    let submittedReceiptId: number | undefined;
    try {
      // Live API Integration: POST /api/v2/orders
      // Places a market order via the centralized ordersApi.
      // Rate limited: 60 requests/min per account.
      // Routed through ordersApi -> apiClient which handles:
      //   - Automatic Bearer token injection from Zustand state
      //   - 401 token refresh loops
      //   - DB transaction atomicity on the server side
      //   - Rejection on zero/negative market prices
      //   - SL/TP validation against current market price
      // Read the broker_id that was persisted at login time. The server
      // requires this to route the order to the correct MT5 manager; without
      // it the response is 403 "No broker context found".
      const brokerIdForOrder = brokerId || undefined;

      // Only include SL/TP when explicitly enabled by the user. Sending 0
      // makes some MT5 bridges interpret it as "set price to zero" and the
      // backend rejects the insert. Same for trailing_stop/trailing_step/magic.
      const payload = {
        frontendIntentId: createMarketOrderIntentId(),
        account_login: tradingLogin,
        broker_id: brokerIdForOrder,
        symbol: symbol,
        side: requestedSide,
        volume: volume,
        ...(!marketProtectionLockedAtSubmit && slEnabled && slPrice > 0 ? { price_sl: slPrice } : {}),
        ...(!marketProtectionLockedAtSubmit && tpEnabled && tpPrice > 0 ? { price_tp: tpPrice } : {}),
        comment: routeComment?.trim() || '',
      };
      logOrderTicketDiagnostic('[TRADE-PAYLOAD]', {
        symbol: payload.symbol,
        side: payload.side,
        action: payload.side,
        orderType: 'market',
        command: payload.side,
        tradeType: 'market',
        volume: payload.volume,
        priceSource: payload.side === 'buy' ? 'ask' : 'bid',
        rawPayload: payload,
      });

      if (
        routeProtectionDraftId &&
        resolvedOrigin === 'chart' &&
        normalizeSymbol(symbol) === routeInitialSymbol
      ) {
        releaseProtectionSubmissionOnExit = true;
        publishChartProtectionDraftSubmission(routeProtectionDraftId);
      }
      // Start transport before React busy-state rendering can occupy the tap.
      const request = ordersApi.placeMarketOrder(payload);
      submittedReceiptId = nextReceiptIdRef.current++;
      orderTicketReceiptController.applyEvent({
        queueId: submittedReceiptId,
        status: 'pending',
        side: requestedSide,
        symbol: symbol.replace(/\//g, ''),
        volume,
      });
      setMarketPendingCounts(counts => ({ ...counts, [requestedSide]: counts[requestedSide] + 1 }));
      const data = await request;
      if (!isMarketOrderFeedbackCurrent(marketActionProvenance.cacheNamespace)) return;
      logOrderTicketDiagnostic('[TRADE-RESPONSE]', {
        requestSide: requestedSide,
        result: data?.status ?? 'success',
        backendSide: data?.side ?? null,
        rawResponse: data,
      });

      if (['rejected', 'failed', 'error'].includes((data.status ?? '').toLowerCase())) {
        const feedback = classifyTradingError(
          { status: 400, data: { message: data.comment || `Server returned status: ${data.status}` } },
          { action: 'place-order' },
        );
        showModal({ visible: true, type: 'error', title: feedback.title, message: feedback.message, side: requestedSide }, submittedReceiptId);
        return;
      }

      const executionEvidence = resolveBrokerExecutionEvidence(data);
      const positionTicket = executionEvidence.ticket;
      const executionPrice = executionEvidence.executionPrice;
      // ExecutionResult is a mutation hint only. Netting can open, increase,
      // decrease, close, or reverse an existing position, and it does not echo
      // authoritative SL/TP. The API-owned captured-session reconciliation is
      // the only writer for this market mutation.

      const displaySymbol = symbol.replace(/\//g, '');
      const successFeedback: TradeFeedbackState = executionEvidence.confirmed
        ? {
          visible: true,
          type: 'success',
          executionConfirmed: true,
          title: 'Order Executed',
          message: `Successfully placed ${requestedSide.toUpperCase()} ${formatTradeVolume(volume, volumeBounds)} lot(s) on ${displaySymbol}`,
          side: requestedSide,
          symbol: displaySymbol,
          volume,
          executedAt: new Date().toLocaleTimeString(),
        }
        : {
          visible: true,
          type: 'success',
          executionConfirmed: false,
          title: 'Order Submitted — Confirmation Pending',
          message: 'The broker accepted the request but did not return both a ticket and execution price. Verify it in Positions or Orders before acting on it.',
          side: requestedSide,
          symbol: displaySymbol,
          volume,
        };
      if (positionTicket) {
        successFeedback.ticket = String(positionTicket);
      }
      if (executionPrice !== undefined) {
        successFeedback.price = executionPrice;
      }
      if (
        routeProtectionDraftId &&
        resolvedOrigin === 'chart' &&
        normalizeSymbol(symbol) === routeInitialSymbol
      ) {
        publishChartProtectionDraftExecution({
          draftId: routeProtectionDraftId,
          executionConfirmed: executionEvidence.confirmed,
          ...(positionTicket !== undefined
            ? { ticket: String(positionTicket) }
            : {}),
        });
        releaseProtectionSubmissionOnExit = false;
      }
      showModal(successFeedback, submittedReceiptId);
      // Display broker evidence first. The API already reconciles positions;
      // coalesce summary refreshes through the same path as One-Click Trading.
      scheduleMarketOrderSummaryRefresh(queryClient, marketActionProvenance.cacheNamespace);
    } catch (error: any) {
      if (!isMarketOrderFeedbackCurrent(marketActionProvenance.cacheNamespace)) return;
      const feedback = classifyTradingError(error, { action: 'place-order' });
      // Extract raw server message for redacted diagnostics; user-facing modal uses mapped feedback
      const rawMsg = redactSensitiveString(
        String(error?.response?.data?.message || error?.response?.data?.error || error?.data?.message || ''),
      );
      const displayMsg = feedback.message || rawMsg;
      warnOrderTicketDiagnostic('[TRADE-RESPONSE]', {
        requestSide: requestedSide,
        result: 'error',
        backendSide: error?.response?.data?.side ?? error?.data?.side ?? null,
        rawResponse: error?.response?.data ?? error?.data ?? error,
      });
      showModal(
        { visible: true, type: 'error', title: feedback.title, message: displayMsg, side: requestedSide },
        submittedReceiptId,
        feedback.status !== 202 && (feedback.kind === 'backend-rejection' || feedback.kind === 'rate-limit')
          ? 'failed' : 'unconfirmed',
      );
    } finally {
      const unsettledReceipt = submittedReceiptId === undefined ? undefined
        : orderTicketReceiptController.getSnapshot().find(event => event.queueId === submittedReceiptId);
      if (unsettledReceipt?.status === 'pending') {
        orderTicketReceiptController.applyEvent({ ...unsettledReceipt, status: 'cancelled' });
      }
      if (releaseProtectionSubmissionOnExit && routeProtectionDraftId) {
        releaseChartProtectionDraftSubmission(routeProtectionDraftId);
      }
      if (submittedReceiptId !== undefined) {
        setMarketPendingCounts(counts => ({ ...counts, [requestedSide]: Math.max(0, counts[requestedSide] - 1) }));
      }
    }
  };

  const queryClient = useQueryClient();

  // All volume changes go through one helper so typed values, stepper presses,
  // quick presets, and persisted preferences stay consistent.
  const updateVolume = useCallback(
    (nextVolume: number | string) => {
      const normalized = normalizeTradeVolume(nextVolume, volumeBounds);
      setVolume(normalized);
      setVolumeInput(formatTradeVolume(normalized, volumeBounds));
      setTradeVolume(normalized);
    },
    [setTradeVolume, volumeBounds],
  );

  const commitVolumeInput = useCallback(() => {
    if (!volumeInput.trim()) {
      setVolumeInput(formatTradeVolume(volume, volumeBounds));
      return;
    }
    updateVolume(volumeInput);
  }, [updateVolume, volume, volumeBounds, volumeInput]);

  const adj = useCallback(
    (direction: -1 | 1) => {
      updateVolume(incrementTradeVolume(volume, direction, volumeBounds));
    },
    [updateVolume, volume, volumeBounds],
  );

  const resolveProtectionPriceSeed = useCallback(() => {
    if (BID > 0 && ASK > 0) return (BID + ASK) / 2;
    return 0;
  }, [ASK, BID]);

  const adjustStopLoss = useCallback(
    (direction: -1 | 1) => {
      const seed = slEnabled && slPrice > 0 ? slPrice : resolveProtectionPriceSeed();
      if (seed <= 0) {
        // A silent return here read as a dead stepper button.
        showModal({
          visible: true,
          type: 'error',
          title: t('Market Data Unavailable'),
          message: t('Wait for a live price before setting Stop Loss or Take Profit.'),
        });
        return;
      }
      const nextPrice = roundPendingPrice(seed + direction * pricePointSize * 10);
      if (nextPrice <= 0) return;
      setSlEnabled(true);
      setSlPrice(nextPrice);
    },
    [pricePointSize, resolveProtectionPriceSeed, roundPendingPrice, slEnabled, slPrice, showModal, t],
  );

  const adjustTakeProfit = useCallback(
    (direction: -1 | 1) => {
      const seed = tpEnabled && tpPrice > 0 ? tpPrice : resolveProtectionPriceSeed();
      if (seed <= 0) {
        showModal({
          visible: true,
          type: 'error',
          title: t('Market Data Unavailable'),
          message: t('Wait for a live price before setting Stop Loss or Take Profit.'),
        });
        return;
      }
      const nextPrice = roundPendingPrice(seed + direction * pricePointSize * 10);
      if (nextPrice <= 0) return;
      setTpEnabled(true);
      setTpPrice(nextPrice);
    },
    [pricePointSize, resolveProtectionPriceSeed, roundPendingPrice, tpEnabled, tpPrice, showModal, t],
  );

  const handleStopLevelAdjustment = useCallback(
    (target: 'sl' | 'tp', direction: -1 | 1) => {
      // Backend capability gate: keep both complete adjustment functions and
      // payload wiring intact, but do not expose values the API cannot apply.
      if (protectionBackendLocked) {
        Alert.alert(t(SLTP_COMING_SOON_TITLE), t(getActiveSltpUnavailableMessage()));
        return;
      }

      if (target === 'sl') {
        adjustStopLoss(direction);
        return;
      }
      adjustTakeProfit(direction);
    },
    [adjustStopLoss, adjustTakeProfit, protectionBackendLocked, t],
  );

  /* Pending order placement */
  // Pending orders share market-order safety checks, then add price_open and
  // type so the backend can create the correct pending order.
  const handlePlacePendingOrder = async () => {
    // A retained callback must not prompt for login or submit a preview draft.
    if (isPendingOrderPlacementBackendLocked(orderType)) return;
    if (requestOrrnnDemoTradeAuth({
      kind: 'pending-order',
      symbol,
      side: getChartOrderSide(orderType),
      origin: resolvedOrigin,
    })) {
      return;
    }
    if (blockInvestorTradeAction(t)) return;
    if (isMarketExecution) return;
    const pendingProtectionLockedAtSubmit =
      isPendingOrderProtectionBackendLocked();
    if (pendingProtectionLockedAtSubmit && hasProtectionIntent) {
      showModal({
        visible: true,
        type: 'error',
        title: t(SLTP_COMING_SOON_TITLE),
        message: t(getActiveSltpUnavailableMessage()),
        side: getChartOrderSide(orderType),
      });
      return;
    }
    const currentQuoteAvailability = resolveCurrentQuoteAvailability();
    if (!currentQuoteAvailability.allowed) {
      const pendingSideValue = getChartOrderSide(orderType);
      recordBlockedPriceAction('order_ticket_pending_order', currentQuoteAvailability);
      showModal({
        visible: true,
        type: 'error',
        title: 'Market Data Unavailable',
        message: quoteActionBlockMessage(currentQuoteAvailability),
        side: pendingSideValue,
      });
      return;
    }
    if (tradeTapLockRef.current || tradeActionLocked || pendingSide !== null) return;

    const pendingSideValue = getChartOrderSide(orderType);
    const pendingPolicyError = checkOrderPolicy(instrumentMeta, volume, pendingSideValue, accountDetails);
    if (pendingPolicyError) {
      const feedback = createFrontendTradingError('Order Not Allowed', pendingPolicyError);
      showModal({ visible: true, type: 'error', title: feedback.title, message: feedback.message, side: pendingSideValue });
      return;
    }
    tradeTapLockRef.current = true;
    tradeTapLockSideRef.current = pendingSideValue;
    setTradeActionLocked(true);
    setPendingSide(pendingSideValue);
    const releaseLock = () => {
      tradeTapLockRef.current = false;
      tradeTapLockSideRef.current = null;
      setTradeActionLocked(false);
      setPendingSide(null);
    };

    if (!accountDetails?.id || !accountDetails?.credentials?.accessToken) {
      const feedback = createFrontendTradingError(
        'Authentication Error',
        'Log in again before placing an order.',
      );
      showModal({ visible: true, type: 'error', title: feedback.title, message: feedback.message, side: pendingSideValue });
      releaseLock();
      return;
    }

    const tradingLogin = resolveTradingLogin();
    if (!tradingLogin) {
      const feedback = createFrontendTradingError('Account Error', 'Could not resolve the active trading account.');
      showModal({ visible: true, type: 'error', title: feedback.title, message: feedback.message, side: pendingSideValue });
      releaseLock();
      return;
    }
    const pendingActionProvenance = captureActiveBrokerSessionProvenance();
    if (
      !pendingActionProvenance ||
      pendingActionProvenance.identity.accountLogin !== String(tradingLogin)
    ) {
      releaseLock();
      return;
    }

    try {
      const brokerIdForOrder = brokerId || undefined;
      const payload = {
        account_login: tradingLogin,
        broker_id: brokerIdForOrder,
        symbol,
        side: pendingSideValue,
        volume,
        ...(pendingEntryPrice > 0 ? { price: pendingEntryPrice } : {}),
        ...(isStopLimitOrderType && pendingStopLimitPrice > 0 ? { stopLimitPrice: pendingStopLimitPrice } : {}),
        ...(!pendingProtectionLockedAtSubmit && slEnabled && slPrice > 0 ? { price_sl: slPrice } : {}),
        ...(!pendingProtectionLockedAtSubmit && tpEnabled && tpPrice > 0 ? { price_tp: tpPrice } : {}),
        comment: routeComment?.trim() || '',
        type: orderType.toLowerCase().replace(/\s+/g, '_'),
      };

      logOrderTicketDiagnostic('[PENDING-ORDER-PAYLOAD]', payload);

      const data = await ordersApi.placePendingOrder(payload);
      if (!isActiveBrokerSessionProvenanceCurrent(pendingActionProvenance)) return;

      if (['rejected', 'failed', 'error'].includes((data.status ?? '').toLowerCase())) {
        const feedback = classifyTradingError(
          { status: 400, data: { message: data.comment || `Server returned status: ${data.status}` } },
          { action: 'place-order' },
        );
        showModal({ visible: true, type: 'error', title: feedback.title, message: feedback.message, side: pendingSideValue });
        return;
      }

      const pendingOrderEvidence = resolveBrokerExecutionEvidence(data);

      // Invalidate order queries so the chart overlay can pick up the new order.
      void invalidateSessionQueryRoots(
        queryClient,
        pendingActionProvenance.cacheNamespace,
        ['ordersByLogin', 'accountOrders'],
      );

      if (pendingOrderEvidence.ticket !== undefined) {
        showTradeConfirmation({ side: pendingSideValue, symbol, volume });
      } else {
        showModal({
          visible: true,
          type: 'success',
          executionConfirmed: false,
          title: 'Pending Order Submitted — Confirmation Pending',
          message: 'The broker accepted the request without returning an order ticket. Verify it in Orders before acting on it.',
          side: pendingSideValue,
          symbol: symbol.replace(/\//g, ''),
          volume,
        });
      }
    } catch (error: any) {
      if (!isActiveBrokerSessionProvenanceCurrent(pendingActionProvenance)) return;
      const feedback = classifyTradingError(error, { action: 'place-order' });
      const rawMsg = redactSensitiveString(
        String(error?.response?.data?.message || error?.response?.data?.error || error?.data?.message || ''),
      );
      const displayMsg = feedback.message || rawMsg;
      showModal({ visible: true, type: 'error', title: feedback.title, message: displayMsg, side: pendingSideValue });
    } finally {
      releaseLock();
    }
  };

  const rawSpreadPoints = pricePointSize > 0 && ASK > 0 && BID > 0 && Number.isFinite(ASK) && Number.isFinite(BID)
    ? Math.round((ASK - BID) / pricePointSize)
    : Number.NaN;
  const spread = Math.max(0, rawSpreadPoints);

  return (
    <View
      style={[styles.root, { paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }]}
      onLayout={({ nativeEvent }) => orderTicketReceiptAnchor.update({ rootHeight: nativeEvent.layout.height })}
    >
      <Stack.Screen options={{ headerShown: false }} />

      {/* Compact header: back button, current symbol, and symbol picker. */}
      <View style={[styles.header, { paddingTop: insets.top + 6, zIndex: 10 }]}>
        <FastPressable
          onPress={handleOrderTicketBack}
          activateOnPressIn
          latencyLabel="orderTicket.back"
          latencyBudgetMs={50}
          unstable_pressDelay={0}
          hitSlop={{ top: 24, bottom: 24, left: 24, right: 24 }}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={24} color={T.text} />
        </FastPressable>
        <View style={styles.hCenter}>
          <Text style={styles.hSymbol}>{symbol?.replace(/\//g, '')}</Text>
        </View>
        <FastPressable
          style={styles.symbolPickerBtn}
          onPress={handleOpenSymbolPicker}
          activateOnPressIn
          activateOnTouchStart
          latencyLabel="orderTicket.symbol.open"
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          accessibilityRole="button"
          accessibilityLabel={t('Select Symbol')}
          testID="order-ticket-symbol-picker-button"
        >
          <Ionicons name="logo-usd" size={20} color={T.accent} />
        </FastPressable>
      </View>

      {/* Prices and the form share one scroll area so the ticket stays reachable
          on short landscape screens and while the software keyboard is open. */}
      <ScrollView
        canCancelContentTouches={Platform.OS === 'ios'}
        style={styles.root}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 100 }}
        onLayout={({ nativeEvent }) => orderTicketReceiptAnchor.update({
          viewportTop: nativeEvent.layout.y, viewportHeight: nativeEvent.layout.height,
        })}
        onScroll={({ nativeEvent }) => orderTicketReceiptAnchor.update({ scrollOffset: nativeEvent.contentOffset.y })}
        onScrollBeginDrag={({ nativeEvent }) => orderTicketReceiptAnchor.update({ scrollOffset: nativeEvent.contentOffset.y })}
        onScrollEndDrag={({ nativeEvent }) => orderTicketReceiptAnchor.update({ scrollOffset: nativeEvent.contentOffset.y })}
        onMomentumScrollEnd={({ nativeEvent }) => orderTicketReceiptAnchor.update({ scrollOffset: nativeEvent.contentOffset.y })}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      >
      {/* Price panel: large BID/ASK tap targets for one-click market execution. */}
      <View style={styles.pricePanel}>
        <FastPressable
          style={({ pressed }) => [
            styles.priceHalf,
            { backgroundColor: sellTradeAction.backgroundColor, opacity: getPricePanelActionOpacity(sellTradeAction.side) },
            pressed && styles.priceHalfPressed,
          ]}
          android_ripple={{ color: 'rgba(255, 255, 255, 0.28)', foreground: true }}
          disabled={isPricePanelActionDisabled(sellTradeAction.side)}
          accessibilityState={{ disabled: isPricePanelActionDisabled(sellTradeAction.side), busy: isTradeActionPending(sellTradeAction.side) }}
          onPress={() => { void handlePlaceOrder(sellTradeAction.side); }}
          activateOnPressIn
          activateOnTouchStart
          unstable_pressDelay={0}
          latencyLabel={`orderTicket.pricePanel.${sellTradeAction.side}`}
          latencyBudgetMs={CRITICAL_TRADE_ACTION_MAX_LATENCY_MS}
          accessibilityRole="button"
          accessibilityLabel={sellTradeAction.displayLabel}
          testID={sellTradeAction.priceTestID}
        >
          <Text style={[styles.priceTag, { color: sellTradeAction.color }]}>{sellTradeAction.priceLabel}</Text>
          <Text style={styles.priceMain} numberOfLines={1} adjustsFontSizeToFit>{sellTradeAction.price > 0 ? formatBackendPrice(sellTradeAction.price) : '--'}</Text>
        </FastPressable>

        {/* Spread pillar: shows the current difference between ASK and BID. */}
        <View style={styles.spreadCenter}>
          <Ionicons name="swap-horizontal" size={11} color={T.textSub} />
          <Text style={styles.spreadVal}>{spread}</Text>
          <Text style={styles.spreadUnit}>pts</Text>
        </View>

        <FastPressable
          style={({ pressed }) => [
            styles.priceHalf,
            { backgroundColor: buyTradeAction.backgroundColor, opacity: getPricePanelActionOpacity(buyTradeAction.side) },
            pressed && styles.priceHalfPressed,
          ]}
          android_ripple={{ color: 'rgba(255, 255, 255, 0.28)', foreground: true }}
          disabled={isPricePanelActionDisabled(buyTradeAction.side)}
          accessibilityState={{ disabled: isPricePanelActionDisabled(buyTradeAction.side), busy: isTradeActionPending(buyTradeAction.side) }}
          onPress={() => { void handlePlaceOrder(buyTradeAction.side); }}
          activateOnPressIn
          activateOnTouchStart
          unstable_pressDelay={0}
          latencyLabel={`orderTicket.pricePanel.${buyTradeAction.side}`}
          latencyBudgetMs={CRITICAL_TRADE_ACTION_MAX_LATENCY_MS}
          accessibilityRole="button"
          accessibilityLabel={buyTradeAction.displayLabel}
          testID={buyTradeAction.priceTestID}
        >
          <Text style={[styles.priceTag, { color: buyTradeAction.color }]}>{buyTradeAction.priceLabel}</Text>
          <Text style={styles.priceMain} numberOfLines={1} adjustsFontSizeToFit>{buyTradeAction.price > 0 ? formatBackendPrice(buyTradeAction.price) : '--'}</Text>
        </FastPressable>
      </View>

      {/* Order type, volume, risk controls, graph, market data, and submit controls. */}
        {/* 
 * Order type tabs: 
 * Allows the user to switch between Market Execution and pending order types 
 * (Buy Limit, Sell Limit, Buy Stop, Sell Stop, Buy Stop Limit, Sell Stop Limit).
 */}
        <Text style={styles.sectionTitle}>ORDER TYPE</Text>
        <ScrollView
          horizontal
          directionalLockEnabled
          nestedScrollEnabled
          keyboardShouldPersistTaps="always"
          showsHorizontalScrollIndicator={false}
          style={styles.orderTypeTabsScroll}
          contentContainerStyle={styles.orderTypeTabs}
        >
          {CHART_ORDER_TYPES.map((option) => {
            const active = option === orderType;
            const isSell = option.toLowerCase().startsWith('sell');
            const isBackendLocked = isPendingOrderTypeBackendLocked(option);
            return (
              <FastPressable
                key={option}
                hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
                style={[
                  styles.orderTypeTab,
                  active && styles.orderTypeTabActive,
                  active && { borderColor: isSell ? SELL_C : BUY_C },
                  isBackendLocked && styles.orderTypeTabLocked,
                ]}
                disabled={isBackendLocked}
                accessibilityRole="button"
                accessibilityLabel={isBackendLocked ? `${option}. Locked` : option}
                accessibilityState={{ selected: active, disabled: isBackendLocked }}
                onPress={() => {
                  // Preserve the complete pending-order path below. This UI
                  // gate lifts automatically when the backend-ready flag is
                  // enabled after API integration and verification.
                  if (isPendingOrderTypeBackendLocked(option)) {
                    return;
                  }
                  setOrderType(option);
                }}
                latencyLabel={`orderTicket.orderType.${option}`}
              >
                <Text style={[styles.orderTypeTabText, active && styles.orderTypeTabTextActive]}>{option}</Text>
                {isBackendLocked ? (
                  <Ionicons name="lock-closed" size={13} color={T.textMuted} />
                ) : null}
              </FastPressable>
            );
          })}
        </ScrollView>


        {/* Volume controls: typed lot input, plus/minus stepper, and quick presets. */}
        <View style={styles.volSection}>
          <Text style={styles.rowLabel}>Volume</Text>
          <View style={styles.volStepper}>
            <FastPressable style={styles.volBtn} onPress={() => adj(-1)} accessibilityRole="button" accessibilityLabel={t('Decrease volume')} latencyLabel="orderTicket.volume.decrement" hitSlop={8}>
              <Ionicons name="remove" size={18} color={T.textSub} />
            </FastPressable>
            <View style={styles.volCenter}>
              <TextInput
                style={styles.volInput}
                accessibilityLabel={t('Volume')}
                value={volumeInput}
                onChangeText={(text) => setVolumeInput(sanitizeTradeVolumeDraft(text))}
                onBlur={commitVolumeInput}
                onSubmitEditing={commitVolumeInput}
                keyboardType="decimal-pad"
                returnKeyType="done"
                placeholder={formatTradeVolume(volume, volumeBounds)}
                placeholderTextColor={T.textMuted}
              />
            </View>
            <FastPressable style={styles.volBtn} onPress={() => adj(1)} accessibilityRole="button" accessibilityLabel={t('Increase volume')} latencyLabel="orderTicket.volume.increment" hitSlop={8}>
              <Ionicons name="add" size={18} color={T.textSub} />
            </FastPressable>
          </View>
        </View>
        <View style={styles.quickRow}>
          {[0.01, 0.05, 0.10, 0.50, 1.00].map(v => (
            <FastPressable
              key={v}
              style={[styles.quickPill, Math.abs(volume - v) < 0.000001 && styles.quickPillActive]}
              onPress={() => updateVolume(v)}
              accessibilityRole="button"
              accessibilityLabel={`${t('Volume')} ${v.toFixed(2)}`}
              accessibilityState={{ selected: Math.abs(volume - v) < 0.000001 }}
              latencyLabel={`orderTicket.volume.quick.${v.toFixed(2)}`}
            >
              <Text style={[styles.quickTxt, Math.abs(volume - v) < 0.000001 && styles.quickTxtActive]}>
                {(v || 0).toFixed(2)}
              </Text>
            </FastPressable>
          ))}
        </View>

        <View style={styles.hairline} />

        {/* MT5-style protection controls: compact SL/TP steppers above Fill policy. */}
        <View style={[styles.sltpRow, protectionBackendLocked && styles.sltpRowDisabled]}>
          <View style={styles.sltpGroup}>
            <FastPressable
              style={styles.sltpBtn}
              onPress={() => handleStopLevelAdjustment('sl', -1)}
              latencyLabel="orderTicket.sl.decrement"
              hitSlop={8}
              disabled={protectionBackendLocked}
              accessibilityLabel={t('Decrease Stop Loss')}
              accessibilityState={{ disabled: protectionBackendLocked }}
            >
              <Text style={styles.sltpAction}>-</Text>
            </FastPressable>
            <FastPressable
              onPress={() => {
                if (slEnabled) {
                  setSlEnabled(false);
                  setSlPrice(0);
                }
              }}
              disabled={!slEnabled || protectionBackendLocked}
              accessibilityRole="button"
              accessibilityLabel={slEnabled ? t('Clear Stop Loss') : t('Stop Loss')}
            >
              <Text style={[styles.sltpLabel, slEnabled && styles.sltpValue]} numberOfLines={1}>
                {slEnabled && slPrice > 0 ? formatBackendPrice(slPrice) : 'SL'}
              </Text>
            </FastPressable>
            <FastPressable
              style={styles.sltpBtn}
              onPress={() => handleStopLevelAdjustment('sl', 1)}
              latencyLabel="orderTicket.sl.increment"
              hitSlop={8}
              disabled={protectionBackendLocked}
              accessibilityLabel={t('Increase Stop Loss')}
              accessibilityState={{ disabled: protectionBackendLocked }}
            >
              <Text style={styles.sltpAction}>+</Text>
            </FastPressable>
          </View>

          <View style={styles.sltpGroup}>
            <FastPressable
              style={styles.sltpBtn}
              onPress={() => handleStopLevelAdjustment('tp', -1)}
              latencyLabel="orderTicket.tp.decrement"
              hitSlop={8}
              disabled={protectionBackendLocked}
              accessibilityLabel={t('Decrease Take Profit')}
              accessibilityState={{ disabled: protectionBackendLocked }}
            >
              <Text style={styles.sltpAction}>-</Text>
            </FastPressable>
            <FastPressable
              onPress={() => {
                if (tpEnabled) {
                  setTpEnabled(false);
                  setTpPrice(0);
                }
              }}
              disabled={!tpEnabled || protectionBackendLocked}
              accessibilityRole="button"
              accessibilityLabel={tpEnabled ? t('Clear Take Profit') : t('Take Profit')}
            >
              <Text style={[styles.sltpLabel, tpEnabled && styles.sltpValue]} numberOfLines={1}>
                {tpEnabled && tpPrice > 0 ? formatBackendPrice(tpPrice) : 'TP'}
              </Text>
            </FastPressable>
            <FastPressable
              style={styles.sltpBtn}
              onPress={() => handleStopLevelAdjustment('tp', 1)}
              latencyLabel="orderTicket.tp.increment"
              hitSlop={8}
              disabled={protectionBackendLocked}
              accessibilityLabel={t('Increase Take Profit')}
              accessibilityState={{ disabled: protectionBackendLocked }}
            >
              <Text style={styles.sltpAction}>+</Text>
            </FastPressable>
          </View>
        </View>
        {protectionBackendLocked ? (
          <Text style={styles.sltpUnavailableText} accessibilityRole="alert">
            {t(getActiveSltpUnavailableMessage())}
          </Text>
        ) : null}

        {/* Fill policy: mirrors MT5's compact order-ticket row before the graph. */}
        <InfoRow label={t('Fill Policy')} value={t('Immediate or Cancel')} styles={styles} />
        <View style={styles.hairline} />

        <View style={styles.tradeFeedbackAnchor}>
          <View style={styles.executionGraphWrap}>
            {heavyContentReady ? (
              <LiveOrderTickExecutionGraph
                symbol={symbol}
                bid={BID}
                ask={ASK}
                timestamp={tickTimestamp}
                priceDecimals={priceDecimals}
                bidColor="#2563EB"
                askColor="#EF4444"
                height={300}
                isDark={isDark}
                backgroundColor={T.bg}
              />
            ) : (
              <View style={styles.executionGraphPlaceholder} />
            )}
          </View>

          <InfoRow label={t('Spread')} value={Number.isFinite(spread) ? `${spread} ${t('pts')}` : '--'} styles={styles} />
          <View style={styles.hairline} />
          <InfoRow label={t('Margin')} value={marginDisplay} loading={marginDisplay === '--' && !marginError && !accountSummaryError} styles={styles} />
          <View style={styles.hairline} />
          <InfoRow label={t('Acc. Leverage')} value={leverageDisplay} loading={backendLeverage === null && !accountSummaryError} styles={styles} />
          <View style={styles.hairline} />

          {quoteIsUnavailable ? (
            <View style={styles.marketDataGuard} accessibilityRole="alert">
              <Ionicons name="warning-outline" size={18} color={T.trading.sell.primary} />
              <Text style={styles.marketDataGuardText}>{quoteUnavailableMessage}</Text>
            </View>
          ) : null}
        </View>

        {/* Execution buttons: market orders submit immediately; pending orders show trigger controls first. */}
        {isMarketExecution ? (
          <View
            style={styles.execRow}
            onLayout={({ nativeEvent }) => orderTicketReceiptAnchor.update({ actionsTop: nativeEvent.layout.y })}
          >
            {tradeButtonActions.map((action) => (
              <FastPressable
                key={action.side}
                style={[
                  styles.execBtn,
                  action.execStyle,
                  tradeActionUnavailable && styles.execBtnDisabled,
                ]}
                android_ripple={{ color: 'rgba(255, 255, 255, 0.28)', foreground: true }}
                onPress={() => { void handlePlaceOrder(action.side); }}
                activateOnPressIn
                activateOnTouchStart
                unstable_pressDelay={0}
                latencyLabel={`orderTicket.exec.${action.side}`}
                latencyBudgetMs={CRITICAL_TRADE_ACTION_MAX_LATENCY_MS}
                disabled={isSideActionDisabled(action.side)}
                accessibilityState={{ disabled: isSideActionDisabled(action.side), busy: isTradeActionPending(action.side) }}
                accessibilityRole="button"
                accessibilityLabel={action.marketLabel}
                testID={action.execTestID}
              >
                <View style={styles.execButtonContent}>
                  <Text style={styles.execCta}>{action.marketLabel}</Text>
                  <Text style={styles.execLots}>{(volume || 0).toFixed(2)} Lots</Text>
                </View>
              </FastPressable>
            ))}
          </View>
        ) : (
          <View>
            {/* Pending order info card explains the selected order type and trigger price. */}
            <View style={styles.pendingSubmitPlaceholder}>
              <Ionicons name='analytics-outline' size={18} color={T.accent} />
              <View style={styles.pendingSubmitCopy}>
                <Text style={styles.pendingSubmitTitle}>{orderType}</Text>
                <Text style={styles.pendingSubmitText}>
                  {pendingPreviewSummary}
                </Text>
              </View>
            </View>

            {/* Pending entry price stepper moves the trigger by ten price points. */}
            <View style={[styles.volSection, { marginTop: 10 }]}>
              <Text style={styles.rowLabel}>{t('Price')}</Text>
              <View style={styles.volStepper}>
                <FastPressable
                  style={styles.volBtn}
                  onPress={() => handlePendingEntryPriceChange(pendingEntryPrice - pricePointSize * 10)}
                  latencyLabel="orderTicket.pending.price.decrement"
                  hitSlop={8}
                >
                  <Ionicons name="remove" size={18} color={T.textSub} />
                </FastPressable>
                <View style={[styles.volCenter, { width: 140 }]}>
                  <Text style={styles.volNum}>{pendingEntryPrice > 0 ? formatBackendPrice(pendingEntryPrice) : '--'}</Text>
                </View>
                <FastPressable
                  style={styles.volBtn}
                  onPress={() => handlePendingEntryPriceChange(pendingEntryPrice + pricePointSize * 10)}
                  latencyLabel="orderTicket.pending.price.increment"
                  hitSlop={8}
                >
                  <Ionicons name="add" size={18} color={T.textSub} />
                </FastPressable>
              </View>
            </View>

            {pendingOrderPlacementBackendLocked ? (
              <Text style={styles.pendingSubmitText}>{t(PENDING_ORDER_PREVIEW_MESSAGE)}</Text>
            ) : null}
            {/* Placement stays disabled while pending orders are preview-only. */}
            <View style={[styles.execRow, { marginTop: 8 }]}>
              <FastPressable
                style={({ pressed }) => [
                  styles.execBtn,
                  orderType.toLowerCase().startsWith('sell') ? styles.execSell : styles.execBuy,
                  (pendingOrderPlacementBackendLocked || tradeActionDisabled || pendingEntryPrice <= 0) && styles.execBtnDisabled,
                  pressed && { opacity: 0.88 },
                ]}
                onPress={pendingOrderPlacementBackendLocked ? undefined : () => { void handlePlacePendingOrder(); }}
                latencyLabel="orderTicket.pending.submit"
                disabled={pendingOrderPlacementBackendLocked || tradeActionDisabled || pendingEntryPrice <= 0}
                accessibilityRole="button"
                accessibilityLabel={`Place ${orderType}`}
                accessibilityState={{ disabled: pendingOrderPlacementBackendLocked || tradeActionDisabled || pendingEntryPrice <= 0 }}
                testID="order-ticket-pending-submit"
              >
                {pendingSide !== null ? (
                  <ActivityIndicator color={T.text} />
                ) : (
                  <>
                    <Text style={styles.execCta}>PLACE {orderType.toUpperCase()}</Text>
                    <Text style={styles.execLots}>{volume.toFixed(2)} Lots @ {pendingEntryPrice > 0 ? formatBackendPrice(pendingEntryPrice) : '--'}</Text>
                  </>
                )}
              </FastPressable>
            </View>
          </View>
        )}

        {/* Disclaimer: reminds users that final market execution can slip. */}
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerTxt}>
            *Final execution price may slightly differ due to market volatility.
          </Text>
        </View>
      </ScrollView>

      {/* Keep the virtualized One-Click stack outside the page ScrollView. */}
      <View style={styles.tradeReceiptHost} pointerEvents="box-none">
        <OrderTicketAnchoredReceipts
          anchor={orderTicketReceiptAnchor}
          controller={orderTicketReceiptController}
          isDark={isDark}
          buyColor={BUY_C}
          sellColor={SELL_C}
        />
      </View>

      {tradeConfirmations.length > 0 ? (
        <View
          pointerEvents="none"
          style={[styles.tradeConfirmationStack, { bottom: insets.bottom + 112 }]}
        >
          {tradeConfirmations.map((confirmation) => {
            const isBuyConfirmation = confirmation.side === 'buy';
            const accentColor = isBuyConfirmation ? BUY_C : SELL_C;
            return (
              <View
                key={confirmation.id}
                style={[
                  styles.tradeConfirmationCard,
                  { borderLeftColor: accentColor },
                ]}
              >
                <Text style={styles.tradeConfirmationSymbol} numberOfLines={1}>
                  {confirmation.symbol}
                </Text>
                <Text
                  style={[
                    styles.tradeConfirmationSide,
                    { color: accentColor },
                  ]}
                  numberOfLines={1}
                >
                  {isBuyConfirmation ? 'Buy' : 'Sell'}
                </Text>
                <Text style={styles.tradeConfirmationVolume} numberOfLines={1}>
                  {confirmation.volumeLabel}
                </Text>
                <Text style={styles.tradeConfirmationDone} numberOfLines={1}>
                  placed
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Shared RTX5 execution receipt plus detailed rejected/unconfirmed feedback. */}
      <TradeFeedbackModal
        state={modalState}
        onClose={handleModalClose}
        isDark={isDark}
      />

      <OrderTicketSymbolPickerSheetHost
        ref={symbolPickerSheetRef}
        actions={symbolPickerActions}
      />
    </View>
  );
}

// Subscribe only this overlay to layout/scroll updates, keeping the graph and
// order form out of the popup placement render path.
const OrderTicketAnchoredReceipts = memo(function OrderTicketAnchoredReceipts({
  anchor, ...props
}: {
  anchor: OrderTicketReceiptAnchor;
} & ComponentProps<typeof ChartTradeReceiptStack>) {
  const placement = useSyncExternalStore(anchor.subscribe, anchor.getSnapshot, anchor.getSnapshot);
  if (!placement) return null;
  return <ChartTradeReceiptStack {...props} pendingLabel="sent" topOffset={placement.top} bottomOffset={placement.bottom} />;
});

/* Info row */
// Reusable key-value row used by the market data section.
function InfoRow({ label, value, styles, loading = false }: {
  label: string;
  value: string;
  styles: any;
  loading?: boolean;
}) {
  return (
    <View style={styles.flatRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      {loading ? <ActivityIndicator size="small" accessibilityLabel={`${label} loading`} /> : <Text style={styles.rowValueWhite}>{value}</Text>}
    </View>
  );
}

/* Styles */
// Local styles live with the screen because this ticket has many compact,
// screen-specific controls that are not shared elsewhere.
function makeStyles(T: ThemeColors, isDark: boolean) {
  const BG = T.bg;
  const SURFACE = T.glass2;
  const ELEVATED = T.glass1;
  const LINE = T.border;
  const WHITE = T.text;
  const SUB = T.textSub;
  const DIM = T.textMuted;
  const ACCENT = T.accent;

  const SELL_C = T.trading.sell.primary;
  const BUY_C = T.trading.buy.primary;

  return StyleSheet.create({
    root: { flex: 1, backgroundColor: BG },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 14, zIndex: 10 },
    backBtn: { width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
    hCenter: { flex: 1, alignItems: 'center' },
    hSymbol: { color: WHITE, fontSize: 16, fontWeight: '500', letterSpacing: 0.3 },
    symbolPickerBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(59,130,246,0.12)' : 'rgba(37,99,235,0.08)',
      borderWidth: 1,
      borderColor: T.border,
    },

    pricePanel: {
      flexDirection: 'row', direction: 'ltr', alignItems: 'center', marginHorizontal: -4, marginBottom: 12, borderRadius: 12, overflow: 'hidden',
      backgroundColor: SURFACE, borderWidth: 1, borderColor: T.border,
      shadowColor: isDark ? '#000' : '#64748B', shadowOffset: { width: 0, height: 8 }, shadowOpacity: isDark ? 0.3 : 0.08, shadowRadius: 24, elevation: 4
    },
    priceHalf: { flex: 1, minWidth: 0, alignItems: 'center', paddingVertical: 10 },
    priceHalfPressed: { transform: [{ scale: 0.985 }] },
    priceTag: { fontSize: 10, fontWeight: '600', letterSpacing: 1.2 },
    priceMain: { width: '100%', textAlign: 'center', color: WHITE, fontSize: 24, fontWeight: '600', fontVariant: ['tabular-nums'], padding: 8, letterSpacing: 0 },
    spreadCenter: { width: 40, alignItems: 'center', justifyContent: 'center' },
    spreadVal: { color: WHITE, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'], marginTop: 1 },
    spreadUnit: { color: T.textSub, fontSize: 8, fontWeight: '600' },

    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16 },
    shellBody: { paddingHorizontal: 16, paddingTop: 6 },
    shellOrderTypeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingTop: 6,
      paddingBottom: 2,
      overflow: 'hidden',
    },
    sectionTitle: { color: T.textSub, fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginTop: 10, marginBottom: 2 },

    flatRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, paddingVertical: 10 },
    rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rowRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    rowLabel: { color: SUB, fontSize: 14, fontWeight: '500' },
    rowValueWhite: { maxWidth: '100%', flexShrink: 1, color: WHITE, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
    hairline: { height: 1, backgroundColor: LINE },

    orderTypeTabsScroll: { marginTop: 2 },
    orderTypeTabs: { gap: 4, paddingTop: 6, paddingBottom: 2, paddingRight: 0 },
    orderTypeTab: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: ELEVATED,
      borderWidth: 1,
      borderColor: T.border,
    },
    orderTypeTabActive: {
      backgroundColor: isDark ? 'rgba(34,211,238,0.1)' : T.glass3,
    },
    orderTypeTabLocked: {
      opacity: 0.58,
    },
    orderTypeTabText: {
      color: SUB,
      fontSize: 13,
      fontWeight: '600',
    },
    orderTypeTabTextActive: {
      color: WHITE,
    },
    volSection: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
    volStepper: { flexDirection: 'row', alignItems: 'center', height: 40, borderRadius: 8, backgroundColor: ELEVATED, overflow: 'hidden', borderWidth: 1, borderColor: T.border },
    volBtn: { width: 40, height: '100%', alignItems: 'center', justifyContent: 'center' },
    volCenter: { paddingHorizontal: 16, height: '100%', alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderRightWidth: 1, borderColor: LINE },
    volNum: { color: WHITE, fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
    volInput: { color: WHITE, fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'], minWidth: 72, textAlign: 'center', paddingVertical: 0 },
    quickRow: { flexDirection: 'row', gap: 5, paddingBottom: 4 },
    quickPill: { flex: 1, paddingVertical: 6, borderRadius: 6, backgroundColor: ELEVATED, alignItems: 'center', borderWidth: 1, borderColor: T.border },
    quickPillActive: { backgroundColor: isDark ? 'rgba(59,130,246,0.12)' : T.glass3, borderColor: ACCENT },
    quickTxt: { color: SUB, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
    quickTxtActive: { color: ACCENT },

    sltpRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 18, paddingVertical: 16 },
    sltpRowDisabled: { opacity: 0.4 },
    sltpGroup: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sltpBtn: { width: 42, height: 40, alignItems: 'center', justifyContent: 'center' },
    sltpAction: { color: ACCENT, fontSize: 24, lineHeight: 28, fontWeight: '700' },
    sltpLabel: { flex: 1, color: DIM, fontSize: 18, fontWeight: '500', textAlign: 'center', fontVariant: ['tabular-nums'] },
    sltpValue: { color: WHITE, fontSize: 15, fontWeight: '700' },
    sltpUnavailableText: {
      color: T.textMuted,
      fontSize: 12,
      lineHeight: 17,
      paddingBottom: 12,
      textAlign: 'center',
    },

    disclaimer: { alignItems: 'center', marginTop: 12, paddingHorizontal: 16 },
    disclaimerTxt: { color: T.textMuted, fontSize: 12, lineHeight: 16, textAlign: 'center' },
    disclaimerIcons: { flexDirection: 'row', gap: 10 },
    marketDataGuard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginHorizontal: 12,
      marginTop: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,59,48,0.45)' : 'rgba(220,38,38,0.35)',
      backgroundColor: isDark ? 'rgba(255,59,48,0.08)' : 'rgba(220,38,38,0.06)',
    },
    marketDataGuardText: { flex: 1, color: SUB, fontSize: 12, lineHeight: 17 },

    execRow: { flexDirection: 'row', direction: 'ltr', paddingHorizontal: 12, paddingVertical: 6, gap: 8 },
    execBtn: { flex: 1, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
    execButtonContent: { alignItems: 'center' },
    // Mirrors the chart trade buttons' stale-quote dim (opacity 0.5) so the
    // order screen reads as blocked whenever the executable quote is stale.
    execBtnDisabled: { opacity: 0.5 },
    execSell: { backgroundColor: SELL_C, shadowColor: SELL_C },
    execBuy: { backgroundColor: BUY_C, shadowColor: BUY_C },
    execCta: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', letterSpacing: 0.5 },
    execLots: { color: 'rgba(255,255,255,0.8)', fontSize: 11, fontWeight: '600', marginTop: 2, fontVariant: ['tabular-nums'] },
    executionGraphWrap: {
      marginTop: 12,
      backgroundColor: BG,
      borderWidth: 0,
      borderColor: 'transparent',
    },
    executionGraphPlaceholder: {
      height: 300,
      width: '100%',
      borderRadius: 12,
      backgroundColor: BG,
    },
    pendingSubmitPlaceholder: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginHorizontal: 12,
      marginTop: 4,
      paddingHorizontal: 14,
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: SURFACE,
      borderWidth: 1,
      borderColor: T.border,
    },
    pendingSubmitCopy: {
      flex: 1,
    },
    pendingSubmitTitle: {
      color: WHITE,
      fontSize: 14,
      fontWeight: '700',
    },
    pendingSubmitText: {
      color: SUB,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 4,
    },
    tradeConfirmationStack: {
      position: 'absolute' as any,
      left: '30%',
      right: 54,
      zIndex: 24,
      elevation: 24,
      gap: 6,
    },
    tradeConfirmationCard: {
      minHeight: 40,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? SURFACE : '#FFFFFF',
      borderWidth: isDark ? 1 : 0,
      borderColor: isDark ? T.border : 'transparent',
      borderLeftWidth: 3,
      borderRadius: 2,
      paddingHorizontal: 12,
      shadowColor: '#000000',
      shadowOpacity: isDark ? 0.18 : 0.12,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 6,
      gap: 12,
    },
    tradeConfirmationSymbol: {
      flex: 1.2,
      minWidth: 0,
      color: WHITE,
      fontSize: 13,
      fontWeight: '600',
      letterSpacing: 0,
    },
    tradeConfirmationSide: {
      flex: 0.8,
      minWidth: 0,
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 0,
    },
    tradeConfirmationVolume: {
      flex: 0.6,
      minWidth: 0,
      color: WHITE,
      fontSize: 13,
      fontWeight: '600',
      letterSpacing: 0,
      textAlign: 'center',
    },
    tradeConfirmationDone: {
      flex: 0.8,
      minWidth: 0,
      color: BUY_C,
      fontSize: 13,
      fontWeight: '600',
      letterSpacing: 0,
      textAlign: 'right',
    },

    /* Success / Error Modal */
    modalOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.55)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 28,
      zIndex: 999,
      elevation: 999,
    },
    modalCard: {
      width: '92%',
      maxWidth: 360,
      backgroundColor: SURFACE,
      borderRadius: 28,
      paddingTop: 32,
      paddingBottom: 24,
      paddingHorizontal: 24,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 20 },
      shadowOpacity: 0.25,
      shadowRadius: 40,
      elevation: 16,
    },
    modalIconWrap: {
      width: 80,
      height: 80,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 20,
    },
    modalIconGlow: {
      position: 'absolute',
      width: 80,
      height: 80,
      borderRadius: 40,
    },
    modalIconCircle: {
      width: 56,
      height: 56,
      borderRadius: 28,
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalTitle: {
      color: T.text,
      fontSize: 21,
      fontWeight: '700',
      letterSpacing: 0,
      marginBottom: 12,
    },
    modalSymbolRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 6,
    },
    modalSymbolText: {
      color: T.text,
      fontSize: 16,
      fontWeight: '700',
    },
    modalSidePill: {
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 6,
    },
    modalSidePillText: {
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 0.8,
    },
    modalPrice: {
      color: T.text,
      fontSize: 36,
      fontWeight: '600',
      fontVariant: ['tabular-nums'] as any,
      letterSpacing: 0,
      marginTop: 4,
      marginBottom: 20,
    },
    modalDivider: {
      width: '100%',
      height: StyleSheet.hairlineWidth,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
      marginBottom: 16,
    },
    modalDetailsRow: {
      flexDirection: 'row',
      width: '100%',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 24,
    },
    modalDetailItem: {
      flex: 1,
      alignItems: 'center',
    },
    modalDetailLabel: {
      color: SUB,
      fontSize: 11,
      fontWeight: '500',
      marginBottom: 4,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    modalDetailValue: {
      color: T.text,
      fontSize: 13,
      fontWeight: '700',
      fontVariant: ['tabular-nums'] as any,
    },
    modalDetailSep: {
      width: 1,
      height: 28,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    },
    modalMessage: {
      color: SUB,
      fontSize: 14,
      textAlign: 'center',
      lineHeight: 21,
      marginBottom: 24,
      paddingHorizontal: 4,
    },
    modalBtn: {
      width: '100%',
      paddingVertical: 15,
      borderRadius: 14,
      alignItems: 'center',
    },
    modalBtnText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700',
    },
    // Overlay shared with the One-Click receipt stack; it never affects page layout.
    tradeFeedbackAnchor: { position: 'relative' },
    tradeReceiptHost: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 24,
      elevation: 24,
    },
  });
}
