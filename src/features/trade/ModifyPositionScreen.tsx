import { FastPressable as Pressable } from '../../ui/components/FastPressable';
/**
 * Trade Feature UI: ModifyPositionScreen
 * 
 * Screen used to adjust the Stop Loss (SL) and Take Profit (TP) parameters
 * of an already active position or pending order.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions,
  type LayoutChangeEvent, type StyleProp, type ViewStyle,
  Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line, Path, Text as SvgText, Rect, G } from 'react-native-svg';

import { useLiveCandles } from '../../domain/candles/hooks/useLiveCandles';
import { normalizeSymbol } from '../../domain/symbols';
import { useInstrumentMeta } from '../../query/instruments';
import { useMarketSymbols } from '../../query/market';
import { DEFAULT_CHART_SYMBOLS, resolveChartSymbolFullName } from '../chart/chartSymbolMetadata';
import { normalizePriceDigits, resolveDecimalsFromPriceStep } from '../../utils/pricePrecision';
import { usePositionsState } from '../../state/positionsState';
import { resolveTradingLoginString } from '../../state/tradingLogin';
import { useUserPreferences } from '../../state/userPreferences';
import { useIsDarkTheme } from '../../state/themeMode';
import { useTheme, ThemeColors } from '../../ui/theme/useTheme';
import { ActionSheet } from '../../ui/components/ActionSheet';
import { useDeferredRouteContentReady } from '../../ui/components/DeferredRouteMount';
import { findPositionById } from './tradeFlow';
import { CRITICAL_TRADE_ACTION_MAX_LATENCY_MS, runImmediateAction } from '../../utils/actionLatency';
import { fmt } from '../../utils/format';
import { safeRouterBack } from '../../utils/navigation';
import { useTranslation } from '../../i18n/useTranslation';
import { resolveModifyPositionMarkerYPositions } from './modifyPositionChartLayout';
import {
  isStopTargetOnCorrectSide,
  resolveStopTargetPresetPrice,
  snapStopTargetToTickSize,
} from './modifyPositionStopDistance';
import {
  classifyTradingError,
  createFrontendTradingError,
  formatTradingErrorFeedback,
} from '../../api/tradingErrors';
import { hideTradePositionActionHost } from './tradePositionActionHostController';
import { useExecutableQuote } from '../quotes/useExecutableQuote';
import {
  quoteActionBlockMessage,
  recordBlockedPriceAction,
  type QuoteActionAvailability,
} from '../../market/quoteIntegrity';
import {
  captureModifyPositionSessionKey,
  isModifyPositionSessionKeyCurrent,
  submitModifyPosition,
  useModifyPositionTicketState,
} from './modifyPositionCoordinator';
import {
  getActiveSltpUnavailableMessage,
  isExistingPositionModifyBackendLocked,
  SLTP_COMING_SOON_TITLE,
} from './tradeBackendCapabilities';
import { requestOrrnnDemoTradeAuth } from './tradeAuthPrompt';
import { blockInvestorTradeAction, useInvestorReadOnlySession } from '../../hooks/useInvestorReadOnlySession';
const SETTINGS_DARK_BACKGROUND = '#121212';
const SETTINGS_DARK_CARD_BACKGROUND = '#1E1E1E';
const MODIFY_POSITION_QUOTE_COMMIT_INTERVAL_MS = 50;
const MODIFY_POSITION_CHART_COMMIT_INTERVAL_MS = 100;
const runAfterModifyClosePaint = (action: () => void) => {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(() => {
      // rAF runs before the frame is painted. The macrotask keeps optimistic
      // store updates and preference persistence out of the close frame.
      setTimeout(action, 0);
    });
    return;
  }
  setTimeout(action, 0);
};

type RetainedModifyPositionState = Pick<
  ReturnType<typeof usePositionsState.getState>,
  'positions' | 'positionSnapshots'
>;

export type ModifyPositionScreenProps = Readonly<{
  hosted?: boolean;
  hostedActive?: boolean;
  hostedPositionId?: string | null;
  onHostedBack?: () => void;
}>;

function formatModifyPrice(val: number, decimals: number) {
  if (!Number.isFinite(val) || val <= 0) {
    return { main: '—', huge: '' };
  }
  const str = val.toFixed(decimals);
  // Splitting off the exact last two digits that the user circled
  return {
    main: str.slice(0, -2),
    huge: str.slice(-2)
  };
}

type ModifyPositionChartTick = Readonly<{ bid: number; ask: number }>;
type ModifyPositionChartLiveInput = Readonly<{
  symbol: string;
  bid: number;
  ask: number;
  stopLoss: number | null;
  takeProfit: number | null;
}>;

type ModifyPositionTickChartProps = Readonly<{
  active: boolean;
  symbol: string;
  liveInputRef: Readonly<{ current: ModifyPositionChartLiveInput }>;
  symbolsMatch: boolean;
  decimals: number;
  point: number;
  slColor: string;
  tpColor: string;
  borderColor: string;
  buyColor: string;
  sellColor: string;
  containerStyle: StyleProp<ViewStyle>;
}>;

/**
 * Decorative price chart isolated from the interactive SL/TP form.
 *
 * Quote renders are coalesced by the parent at 20 fps and candle commits here
 * at 10 fps. The controls can therefore commit on the touch frame without
 * rebuilding SVG paths for every raw websocket tick.
 */
const ModifyPositionTickChart = memo(function ModifyPositionTickChart({
  active,
  symbol,
  liveInputRef,
  symbolsMatch,
  decimals,
  point,
  slColor: SL_COLOR,
  tpColor: TP_COLOR,
  borderColor,
  buyColor,
  sellColor,
  containerStyle,
}: ModifyPositionTickChartProps) {
  const tickChartReady = useDeferredRouteContentReady(450);
  const [committedLiveInput, setCommittedLiveInput] = useState<ModifyPositionChartLiveInput>(
    () => liveInputRef.current,
  );
  useEffect(() => {
    const commitLatestInput = () => {
      const latest = liveInputRef.current;
      setCommittedLiveInput((previous) => (
        previous.symbol === latest.symbol
        && previous.bid === latest.bid
        && previous.ask === latest.ask
        && previous.stopLoss === latest.stopLoss
        && previous.takeProfit === latest.takeProfit
          ? previous
          : latest
      ));
    };

    commitLatestInput();
    if (!active || !tickChartReady) {
      return undefined;
    }
    const interval = setInterval(
      commitLatestInput,
      MODIFY_POSITION_CHART_COMMIT_INTERVAL_MS,
    );
    return () => clearInterval(interval);
  }, [active, liveInputRef, tickChartReady]);
  // A symbol switch must never paint one frame on the previous price scale.
  const liveInput = committedLiveInput.symbol === symbol
    ? committedLiveInput
    : liveInputRef.current;
  const {
    bid: BID,
    ask: ASK,
    stopLoss,
    takeProfit,
  } = liveInput;
  const { candles } = useLiveCandles(
    symbol,
    '1',
    active && tickChartReady,
    MODIFY_POSITION_CHART_COMMIT_INTERVAL_MS,
  );
  const [chartLayout, setChartLayout] = useState({ width: 0, height: 0 });
  const ticks = useMemo<ModifyPositionChartTick[]>(() => {
    if (!tickChartReady || !(BID > 0) || !(ASK > 0)) return [];
    if (candles.length > 0) {
      const slice = candles.slice(-40);
      const spread = ASK - BID;
      const history = slice.map((candle) => ({
        bid: candle.close,
        ask: candle.close + spread,
      }));
      while (history.length < 40) {
        history.unshift({ bid: history[0].bid, ask: history[0].ask });
      }
      history[history.length - 1] = { bid: BID, ask: ASK };
      return history;
    }
    // History normally hydrates before the delayed chart mounts. A flat live
    // seed avoids a second state/effect render during the brief cold-start gap.
    return Array.from({ length: 40 }, () => ({ bid: BID, ask: ASK }));
  }, [ASK, BID, candles, tickChartReady]);

  const handleChartLayout = useCallback((event: LayoutChangeEvent) => {
    const next = {
      width: event.nativeEvent.layout.width,
      height: event.nativeEvent.layout.height,
    };
    setChartLayout((previous) => (
      previous.width === next.width && previous.height === next.height
        ? previous
        : next
    ));
  }, []);

  const { height: windowHeight } = useWindowDimensions();
  const chartHeight = Math.max(160, Math.min(windowHeight * 0.32, 340));
  const w = chartLayout.width;
  const h = chartLayout.height;
  let minPrice = Math.min(BID, ASK);
  let maxPrice = Math.max(BID, ASK);
  ticks.forEach((tick) => {
    minPrice = Math.min(minPrice, tick.bid, tick.ask);
    maxPrice = Math.max(maxPrice, tick.bid, tick.ask);
  });
  if (stopLoss !== null && Number.isFinite(stopLoss)) {
    minPrice = Math.min(minPrice, stopLoss);
    maxPrice = Math.max(maxPrice, stopLoss);
  }
  if (takeProfit !== null && Number.isFinite(takeProfit)) {
    minPrice = Math.min(minPrice, takeProfit);
    maxPrice = Math.max(maxPrice, takeProfit);
  }

  const padding = (maxPrice - minPrice) * 0.2;
  const chartMin = minPrice - padding;
  const chartMax = maxPrice + padding;
  const priceRange = chartMax - chartMin || 0.001;
  const yPos = (value: number) => (
    h === 0 ? 0 : h - ((value - chartMin) / priceRange) * h
  );
  const xPos = (index: number, total: number) => (
    w === 0 || total <= 1 ? 0 : (index / (total - 1)) * (w - 70)
  );

  let bidPath = '';
  let askPath = '';
  if (ticks.length > 0 && w > 0 && h > 0) {
    bidPath = ticks
      .map((tick, index) => `${index === 0 ? 'M' : 'L'} ${xPos(index, ticks.length)} ${yPos(tick.bid)}`)
      .join(' ');
    askPath = ticks
      .map((tick, index) => `${index === 0 ? 'M' : 'L'} ${xPos(index, ticks.length)} ${yPos(tick.ask)}`)
      .join(' ');
    bidPath += ` L ${w - 60} ${yPos(BID)}`;
    askPath += ` L ${w - 60} ${yPos(ASK)}`;
  }

  const markerYPositions = resolveModifyPositionMarkerYPositions(
    [
      { key: 'ask', value: ASK, y: yPos(ASK) },
      { key: 'bid', value: BID, y: yPos(BID) },
      ...(symbolsMatch && stopLoss !== null ? [{ key: 'sl' as const, value: stopLoss, y: yPos(stopLoss) }] : []),
      ...(symbolsMatch && takeProfit !== null ? [{ key: 'tp' as const, value: takeProfit, y: yPos(takeProfit) }] : []),
    ],
    {
      chartHeight: h,
      sameValueEpsilon: Math.max(point / 2, Number.EPSILON),
    },
  );
  const lineY = (
    key: 'ask' | 'bid' | 'sl' | 'tp',
    fallbackValue: number,
  ) => markerYPositions[key] ?? yPos(fallbackValue);

  return (
    <View
      style={[containerStyle, { height: chartHeight }]}
      onLayout={handleChartLayout}
    >
      {tickChartReady && w > 0 && h > 0 ? (
        <Svg width={w} height={h}>
          <Line x1="0" y1={yPos(maxPrice)} x2={w} y2={yPos(maxPrice)} stroke={borderColor} strokeDasharray="4 4" strokeWidth="1" />
          <Line x1="0" y1={yPos((maxPrice + minPrice) / 2)} x2={w} y2={yPos((maxPrice + minPrice) / 2)} stroke={borderColor} strokeDasharray="4 4" strokeWidth="1" />
          <Line x1="0" y1={yPos(minPrice)} x2={w} y2={yPos(minPrice)} stroke={borderColor} strokeDasharray="4 4" strokeWidth="1" />

          {bidPath ? <Path d={bidPath} stroke={buyColor} strokeWidth="1.5" fill="none" /> : null}
          {askPath ? <Path d={askPath} stroke={sellColor} strokeWidth="1.5" fill="none" /> : null}

          {symbolsMatch && stopLoss !== null ? (
            <G>
              <Line x1="0" y1={lineY('sl', stopLoss)} x2={w} y2={lineY('sl', stopLoss)} stroke={SL_COLOR} strokeDasharray="6 6" strokeWidth="1" />
              <G x={w - 60} y={lineY('sl', stopLoss) - 10}>
                <Rect width={60} height={20} fill={SL_COLOR} />
                <SvgText x={30} y={14} fill="#FFF" fontSize="10" fontWeight="bold" textAnchor="middle">
                  SL
                </SvgText>
              </G>
            </G>
          ) : null}

          {symbolsMatch && takeProfit !== null ? (
            <G>
              <Line x1="0" y1={lineY('tp', takeProfit)} x2={w} y2={lineY('tp', takeProfit)} stroke={TP_COLOR} strokeDasharray="6 6" strokeWidth="1" />
              <G x={w - 60} y={lineY('tp', takeProfit) - 10}>
                <Rect width={60} height={20} fill={TP_COLOR} />
                <SvgText x={30} y={14} fill="#FFF" fontSize="10" fontWeight="bold" textAnchor="middle">
                  TP
                </SvgText>
              </G>
            </G>
          ) : null}

          <Line x1="0" y1={lineY('ask', ASK)} x2={w - 60} y2={lineY('ask', ASK)} stroke={sellColor} strokeWidth="1" />
          <Line x1="0" y1={lineY('bid', BID)} x2={w - 60} y2={lineY('bid', BID)} stroke={buyColor} strokeWidth="1" />

          <G x={w - 60} y={lineY('ask', ASK) - 10}>
            <Rect width={60} height={20} fill={sellColor} />
            <SvgText x={30} y={14} fill="#FFF" fontSize="11" fontWeight="bold" textAnchor="middle">
              {ASK.toFixed(decimals)}
            </SvgText>
          </G>
          <G x={w - 60} y={lineY('bid', BID) - 10}>
            <Rect width={60} height={20} fill={buyColor} />
            <SvgText x={30} y={14} fill="#FFF" fontSize="11" fontWeight="bold" textAnchor="middle">
              {BID.toFixed(decimals)}
            </SvgText>
          </G>
        </Svg>
      ) : null}
    </View>
  );
});

/**
 * Screen used to adjust the Stop Loss (SL) and Take Profit (TP) parameters for an active, open position.
 */
export function ModifyPositionScreen({
  hosted = false,
  hostedActive = true,
  hostedPositionId = null,
  onHostedBack,
}: ModifyPositionScreenProps = {}) {
  const params = useLocalSearchParams<{ positionId?: string }>();
  const routePositionId = Array.isArray(params.positionId)
    ? params.positionId[0]
    : params.positionId;
  const [hostedSelectedPositionId, setHostedSelectedPositionId] = useState<string | null>(
    hostedPositionId,
  );
  useEffect(() => {
    if (hosted) {
      setHostedSelectedPositionId(hostedPositionId);
    }
  }, [hosted, hostedPositionId]);
  const positionId = hosted
    ? (hostedSelectedPositionId ?? undefined)
    : routePositionId;
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const investorReadOnly = useInvestorReadOnlySession();
  const isDark = useIsDarkTheme();
  const themeActive = !hosted || hostedActive;
  const T = useTheme({ active: themeActive });
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);
  const screenBg = isDark ? SETTINGS_DARK_BACKGROUND : T.bg;
  const SL_COLOR = T.trading.loss;
  const TP_COLOR = T.trading.profit;
  const routeFocused = useIsFocused();
  const isScreenFocused = hosted ? hostedActive : routeFocused;

  const retainedPositionStateRef = useRef<RetainedModifyPositionState | null>(null);
  if (retainedPositionStateRef.current === null) {
    const initialPositionState = usePositionsState.getState();
    retainedPositionStateRef.current = {
      positions: initialPositionState.positions,
      positionSnapshots: initialPositionState.positionSnapshots,
    };
  }
  const positionState = usePositionsState(
    useShallow((state): RetainedModifyPositionState => (
      isScreenFocused
        ? { positions: state.positions, positionSnapshots: state.positionSnapshots }
        : retainedPositionStateRef.current as RetainedModifyPositionState
    )),
  );
  if (isScreenFocused) {
    retainedPositionStateRef.current = positionState;
  }
  const positions = positionState.positions;
  const primedPosition = positionId
    ? positionState.positionSnapshots[Array.isArray(positionId) ? positionId[0] : positionId]
    : undefined;
  const position = useMemo(
    () => findPositionById(positions, positionId) ?? primedPosition,
    [positions, positionId, primedPosition]
  );
  const modifyTicketState = useModifyPositionTicketState(position?.id);
  const [modifyRateLimitClock, setModifyRateLimitClock] = useState(() => Date.now());
  useEffect(() => {
    const retryAfterUntil = modifyTicketState.retryAfterUntil ?? 0;
    const remainingMs = retryAfterUntil - Date.now();
    if (remainingMs <= 0) return undefined;
    const timer = setTimeout(
      () => setModifyRateLimitClock(Date.now()),
      remainingMs + 25,
    );
    return () => clearTimeout(timer);
  }, [modifyTicketState.retryAfterUntil]);
  const coordinatorRateLimited =
    (modifyTicketState.retryAfterUntil ?? 0) > modifyRateLimitClock;
  const coordinatorSaving =
    modifyTicketState.mutationInFlight ||
    modifyTicketState.phase === 'pending';
  const coordinatorReconciling =
    modifyTicketState.activeAttemptId !== undefined &&
    modifyTicketState.phase === 'reconciling';
  const coordinatorBusy = coordinatorSaving || coordinatorReconciling;

  const [stopLoss, setStopLoss] = useState<number | null>(null);
  const [takeProfit, setTakeProfit] = useState<number | null>(null);
  // While the hidden numeric input is being typed, the raw text is the source
  // of truth for what the field shows. Deriving the input value from the
  // parsed number erased a trailing decimal point on every keystroke, which
  // made decimal SL/TP edits impossible ("4140." re-rendered as "4140" and the
  // next digit appended to the integer part). Steppers, presets, clear and
  // position reloads all clear the raw text so display follows the number.
  const [slInputText, setSlInputText] = useState<string | null>(null);
  const [tpInputText, setTpInputText] = useState<string | null>(null);
  const modifySubmittingRef = useRef(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [positionPickerOpen, setPositionPickerOpen] = useState(false);
  // Symbol being VIEWED on this sheet (live bid/ask + tick chart). Defaults to
  // the modified position's symbol; the top-right picker can point it at any
  // market symbol without touching the chart tab's symbol. SL/TP editing only
  // renders while the viewed symbol matches the position being modified.
  const [viewSymbolOverride, setViewSymbolOverride] = useState<string | null>(null);
  const positionSymbol = normalizeSymbol(position?.symbol ?? '');
  const viewSymbol = viewSymbolOverride ?? positionSymbol;
  const symbolsMatch = viewSymbol === positionSymbol;
  useEffect(() => {
    // Switching the modified position re-anchors the view to its symbol.
    setViewSymbolOverride(null);
  }, [positionSymbol]);
  const resolvedLogin = resolveTradingLoginString();
  const existingPositionModifyLocked = isExistingPositionModifyBackendLocked();

  // Fetch position if not natively loaded in cache (e.g. direct deep link or cold start)
  useEffect(() => {
    if (isScreenFocused && !position && resolvedLogin) {
      void usePositionsState.getState().refreshPositions(resolvedLogin);
    }
  }, [isScreenFocused, position, resolvedLogin]);

  // All editable market anchors come from a fresh, tradable quote for the
  // active broker session. Candles remain chart history only.
  const {
    quote: executableQuote,
    availability: quoteAvailability,
    getCurrentAvailability,
    getCurrentExecutableQuoteState,
  } = useExecutableQuote(
    viewSymbol,
    isScreenFocused && Boolean(viewSymbol),
    MODIFY_POSITION_QUOTE_COMMIT_INTERVAL_MS,
  );

  const isJpy = viewSymbol.includes('JPY');
  // The interactive form mounts with the route so the first visible frame is
  // already usable. The expensive decorative chart defers its own subscription
  // and paint inside ModifyPositionTickChart.
  const BID = typeof executableQuote?.bid === 'number' && executableQuote.bid > 0
    ? executableQuote.bid
    : 0;
  const ASK = typeof executableQuote?.ask === 'number' && executableQuote.ask > 0
    ? executableQuote.ask
    : 0;

  // Display precision may use the app's harmless formatting fallback. Price
  // mutation steps, however, use only a positive backend tick_size; the app
  // must not invent an executable point/stops/freeze contract.
  const { data: instrumentMeta } = useInstrumentMeta(viewSymbol, isScreenFocused);
  const decimals = useMemo(() => {
    const metaDigits = normalizePriceDigits(instrumentMeta?.digits);
    if (metaDigits !== undefined && metaDigits > 0) return metaDigits;
    const stepDigits = resolveDecimalsFromPriceStep(instrumentMeta?.tickSize);
    if (stepDigits !== undefined && stepDigits > 0) return stepDigits;
    return isJpy ? 3 : 5;
  }, [instrumentMeta?.digits, instrumentMeta?.tickSize, isJpy]);
  const tickSize = useMemo(() => {
    const rawTickSize = (
      instrumentMeta as (Record<string, unknown> & { tick_size?: unknown }) | undefined
    )?.tick_size;
    const candidates = [rawTickSize, executableQuote?.tickSize];
    for (const candidate of candidates) {
      if (
        (typeof candidate === 'number' || typeof candidate === 'string') &&
        String(candidate).trim()
      ) {
        const value = Number(candidate);
        if (Number.isFinite(value) && value > 0) return value;
      }
    }
    return null;
  }, [executableQuote?.tickSize, instrumentMeta]);
  const pipSize = tickSize ? tickSize * 10 : 0;
  // Parent renders keep immediate values for text/validation. The decorative
  // chart reads this stable ref on its own bounded 100ms cadence, so raw quote
  // traffic cannot pull SVG work into a control-state commit.
  const chartLiveInputRef = useRef<ModifyPositionChartLiveInput>({
    symbol: viewSymbol,
    bid: BID,
    ask: ASK,
    stopLoss,
    takeProfit,
  });
  chartLiveInputRef.current = {
    symbol: viewSymbol,
    bid: BID,
    ask: ASK,
    stopLoss,
    takeProfit,
  };
  // Header open-price precision always follows the POSITION's symbol, even
  // while the live view is pointed at another instrument.
  const positionHeaderDecimals = symbolsMatch
    ? decimals
    : (positionSymbol.includes('JPY') ? 3 : 5);

  // Init S/L and T/P from existing
  useEffect(() => {
    if (!position) return;
    setStopLoss(position.sl && position.sl > 0 ? position.sl : null);
    setTakeProfit(position.tp && position.tp > 0 ? position.tp : null);
    setSlInputText(null);
    setTpInputText(null);
  }, [position?.id, position?.sl, position?.tp]);


  /**
   * Navigates back to the previous screen (usually the Trade tab or Chart).
   */
  const handleBack = useCallback(() => {
    if (hosted) {
      if (onHostedBack) {
        onHostedBack();
      } else {
        hideTradePositionActionHost();
      }
      return;
    }
    safeRouterBack(router, '/(tabs)/trade');
  }, [hosted, onHostedBack]);

  // Same elements as the order ticket's top-right symbol picker: the full
  // market symbol list. An open position's symbol is fixed, so choosing a
  // symbol re-targets this sheet to an open position on that symbol (tapping
  // the same symbol again cycles through its positions); symbols without an
  // open position are listed but disabled.
  const { data: marketSymbols = [], isFetching: marketSymbolsFetching } =
    useMarketSymbols(isScreenFocused || positionPickerOpen);

  /**
   * Opens a modal allowing the user to select a different open position to modify.
   */
  const handleOpenPositionPicker = useCallback(() => {
    runImmediateAction('modifyPosition.positionPicker.open', () => {
      setPositionPickerOpen(true);
    });
  }, []);

  /**
   * Callback fired when a new position is selected from the picker, updating the screen to modify the chosen position.
   */
  const handlePickPosition = useCallback((nextPositionId: string) => {
    setPositionPickerOpen(false);
    setViewSymbolOverride(null);
    if (!nextPositionId || nextPositionId === String(position?.id ?? '')) {
      return;
    }
    if (hosted) {
      setHostedSelectedPositionId(nextPositionId);
      return;
    }
    router.setParams({ positionId: nextPositionId });
  }, [hosted, position?.id]);

  /**
   * Navigates the user to the Chart screen to view the price action of the currently selected position's symbol.
   */
  const handlePickViewSymbol = useCallback((candidate: string) => {
    setPositionPickerOpen(false);
    const normalized = normalizeSymbol(candidate);
    setViewSymbolOverride(normalized && normalized !== positionSymbol ? normalized : null);
  }, [positionSymbol]);

  const positionPickerActions = useMemo(() => {
    const currentPositionId = String(position?.id ?? '');
    const positionsBySymbol = new Map<string, typeof positions>();
    for (const p of positions) {
      const key = normalizeSymbol(p.symbol);
      if (!key) continue;
      const list = positionsBySymbol.get(key);
      if (list) {
        list.push(p);
      } else {
        positionsBySymbol.set(key, [p]);
      }
    }

    const seen = new Set<string>();
    const symbolOptions: string[] = [];
    const addSymbol = (candidate: string) => {
      const next = normalizeSymbol(candidate || '');
      if (!next || seen.has(next)) {
        return;
      }
      seen.add(next);
      symbolOptions.push(next);
    };

    if (position?.symbol) addSymbol(position.symbol);
    positions.forEach((p) => addSymbol(p.symbol));
    marketSymbols
      .map((candidate) => normalizeSymbol(candidate))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .forEach(addSymbol);
    DEFAULT_CHART_SYMBOLS.forEach(addSymbol);

    if (!symbolOptions.length) {
      return [{
        label: marketSymbolsFetching ? t('Loading symbols...') : t('No symbols available'),
        disabled: true,
      }];
    }

    return symbolOptions.flatMap((candidate) => {
      const symbolPositions = positionsBySymbol.get(candidate) ?? [];
      if (!symbolPositions.length) {
        const isViewing = !symbolsMatch && candidate === viewSymbol;
        return [{
          label: candidate,
          subtitle: isViewing
            ? `${t('Viewing')} - ${resolveChartSymbolFullName(candidate)}`
            : `${resolveChartSymbolFullName(candidate)} - ${t('No open position')}`,
          onPress: () => handlePickViewSymbol(candidate),
        }];
      }

      return symbolPositions.map((target) => {
        const targetId = String(target.id);
        const targetLabel =
          `${target.side.toUpperCase()} ${(target.volume || 0).toFixed(2)} ` +
          `#${targetId} @ ${fmt.price(target.openPrice, 8)}`;
        return {
          label: candidate,
          subtitle: targetId === currentPositionId
            ? `${t('Selected')} - ${targetLabel}`
            : targetLabel,
          onPress: () => handlePickPosition(targetId),
        };
      });
    });
  }, [handlePickPosition, handlePickViewSymbol, marketSymbols, marketSymbolsFetching, position?.id, position?.symbol, positions, symbolsMatch, t, viewSymbol]);

  // A buy closes at the Bid and a sell closes at the Ask — the broker validates
  // SL/TP against that closing price. The client validates only the correct
  // side and snaps to broker-provided tick size; the broker owns distance rules.
  const closingMarketPrice = position ? (position.side === 'buy' ? BID : ASK) : 0;
  // A retained painted price is display-only once the executable-quote gate
  // expires. Market-anchored edits and submission fail closed below.
  const hasUsableMarketPrice = quoteAvailability.allowed && closingMarketPrice > 0;

  const getCurrentClosingMarketPrice = useCallback(() => {
    const current = getCurrentExecutableQuoteState();
    const rawPrice = position
      ? (position.side === 'buy' ? current.quote?.bid : current.quote?.ask)
      : undefined;
    const price = typeof rawPrice === 'number' ? rawPrice : Number(rawPrice);
    return {
      availability: current.availability,
      price: Number.isFinite(price) && price > 0 ? price : null,
    } as const;
  }, [getCurrentExecutableQuoteState, position]);

  const reportUnavailableMarketPrice = useCallback((
    availability?: QuoteActionAvailability,
  ) => {
    const currentQuoteAvailability = availability ?? getCurrentAvailability();
    recordBlockedPriceAction('modify_position', currentQuoteAvailability);
    setSubmitMessage(t(
      quoteActionBlockMessage(currentQuoteAvailability)
      || 'A live tradable quote is required before placing this order.',
    ));
  }, [getCurrentAvailability, t]);

  const snapStopTarget = useCallback((value: number): number => {
    if (value === 0) return 0;
    if (!tickSize || !Number.isFinite(value)) return value;
    return snapStopTargetToTickSize(value, tickSize, decimals);
  }, [decimals, tickSize]);

  const validateStopTargets = useCallback((
    marketPrice = closingMarketPrice,
  ): string | null => {
    if (!position || !(marketPrice > 0)) return null;
    const priceLabel = marketPrice.toFixed(decimals);
    if (
      stopLoss !== null &&
      stopLoss > 0 &&
      !isStopTargetOnCorrectSide('sl', position.side, stopLoss, marketPrice)
    ) {
      return position.side === 'buy'
        ? t('Stop Loss must be below the current Bid ({price}) for a buy position.').replace('{price}', priceLabel)
        : t('Stop Loss must be above the current Ask ({price}) for a sell position.').replace('{price}', priceLabel);
    }
    if (
      takeProfit !== null &&
      takeProfit > 0 &&
      !isStopTargetOnCorrectSide('tp', position.side, takeProfit, marketPrice)
    ) {
      return position.side === 'buy'
        ? t('Take Profit must be above the current Bid ({price}) for a buy position.').replace('{price}', priceLabel)
        : t('Take Profit must be below the current Ask ({price}) for a sell position.').replace('{price}', priceLabel);
    }
    return null;
  }, [closingMarketPrice, decimals, position, stopLoss, t, takeProfit]);

  const stopValidationError = useMemo(() => validateStopTargets(), [validateStopTargets]);
  // Prefer the live side-direction banner over a stale submit-time message.
  useEffect(() => {
    if (stopValidationError) {
      setSubmitMessage(null);
    }
  }, [stopValidationError]);
  // A retained price remains visible for context, but a stale/non-executable
  // quote must disable the mutation affordance. The handler still rechecks the
  // latest snapshot to close the small gap between render and press.
  const canModifyPosition = Boolean(
    !investorReadOnly
    && position
    && symbolsMatch
    && hasUsableMarketPrice
    && !existingPositionModifyLocked
    && !coordinatorBusy
    && !coordinatorRateLimited
  );

  /**
   * Incrementally steps the Stop Loss value up or down by a predefined point amount when tapping the +/- buttons.
   */
  const handleStepSl = useCallback((delta: number) => {
    if (!position) return;
    const currentMarket = getCurrentClosingMarketPrice();
    const livePrice = currentMarket.price;
    if (!currentMarket.availability.allowed || livePrice === null) {
      reportUnavailableMarketPrice(currentMarket.availability);
      return;
    }
    if (!tickSize) {
      setSubmitMessage(t('Instrument tick size is unavailable. Wait for broker instrument metadata before setting SL/TP.'));
      return;
    }
    setSubmitMessage(null);
    setSlInputText(null);
    setStopLoss((prev) => {
      // If setting for the first time, bias it directly against the live matching price for the position side
      let base = prev;
      if (!base) {
        // Auto offset properly based on side
        base = position.side === 'buy' ? livePrice - (pipSize * 100) : livePrice + (pipSize * 100);
      }
      const val = snapStopTarget((base as number) + delta);
      return parseFloat(val.toFixed(decimals));
    });
  }, [
    decimals,
    getCurrentClosingMarketPrice,
    pipSize,
    position,
    reportUnavailableMarketPrice,
    snapStopTarget,
    t,
    tickSize,
  ]);

  /**
   * Incrementally steps the Take Profit value up or down by a predefined point amount when tapping the +/- buttons.
   */
  const handleStepTp = useCallback((delta: number) => {
    if (!position) return;
    const currentMarket = getCurrentClosingMarketPrice();
    const livePrice = currentMarket.price;
    if (!currentMarket.availability.allowed || livePrice === null) {
      reportUnavailableMarketPrice(currentMarket.availability);
      return;
    }
    if (!tickSize) {
      setSubmitMessage(t('Instrument tick size is unavailable. Wait for broker instrument metadata before setting SL/TP.'));
      return;
    }
    setSubmitMessage(null);
    setTpInputText(null);
    setTakeProfit((prev) => {
      let base = prev;
      if (!base) {
        // Auto offset properly based on side
        base = position.side === 'buy' ? livePrice + (pipSize * 100) : livePrice - (pipSize * 100);
      }
      const val = snapStopTarget((base as number) + delta);
      return parseFloat(val.toFixed(decimals));
    });
  }, [
    decimals,
    getCurrentClosingMarketPrice,
    pipSize,
    position,
    reportUnavailableMarketPrice,
    snapStopTarget,
    t,
    tickSize,
  ]);

  const handleStopTargetPreset = useCallback((kind: 'sl' | 'tp', pips: number) => {
    if (!position) return;
    const currentMarket = getCurrentClosingMarketPrice();
    if (!currentMarket.availability.allowed || currentMarket.price === null) {
      reportUnavailableMarketPrice(currentMarket.availability);
      return;
    }
    if (!tickSize) {
      setSubmitMessage(t('Instrument tick size is unavailable. Wait for broker instrument metadata before setting SL/TP.'));
      return;
    }
    setSubmitMessage(null);
    const target = snapStopTarget(resolveStopTargetPresetPrice(
      kind,
      position.side,
      currentMarket.price,
      pipSize,
      pips,
    ));
    const normalizedTarget = parseFloat(target.toFixed(decimals));
    if (kind === 'sl') {
      setSlInputText(null);
      setStopLoss(normalizedTarget);
    } else {
      setTpInputText(null);
      setTakeProfit(normalizedTarget);
    }
  }, [
    decimals,
    getCurrentClosingMarketPrice,
    pipSize,
    position,
    reportUnavailableMarketPrice,
    snapStopTarget,
    t,
    tickSize,
  ]);

  const handleSlPreset = useCallback(
    (pips: number) => handleStopTargetPreset('sl', pips),
    [handleStopTargetPreset],
  );
  const handleTpPreset = useCallback(
    (pips: number) => handleStopTargetPreset('tp', pips),
    [handleStopTargetPreset],
  );

  /**
   * Callback fired when the user manually types a new Stop Loss price into the input field.
   */
  const handleSlChange = (text: string) => {
    setSlInputText(text);
    if (text.trim() === '') {
      setStopLoss(null);
      return;
    }
    const val = parseFloat(text);
    if (!isNaN(val)) setStopLoss(val);
  };

  /**
   * Callback fired when the user manually types a new Take Profit price into the input field.
   */
  const handleTpChange = (text: string) => {
    setTpInputText(text);
    if (text.trim() === '') {
      setTakeProfit(null);
      return;
    }
    const val = parseFloat(text);
    if (!isNaN(val)) setTakeProfit(val);
  };

  // Leaving a field commits the typed text to a tick-snapped price and hands
  // the display back to the numeric state.
  const handleSlBlur = useCallback(() => {
    setSlInputText(null);
    setStopLoss((prev) => (prev === null ? null : snapStopTarget(prev)));
  }, [snapStopTarget]);

  const handleTpBlur = useCallback(() => {
    setTpInputText(null);
    setTakeProfit((prev) => (prev === null ? null : snapStopTarget(prev)));
  }, [snapStopTarget]);

  /**
   * Submits the requested SL/TP modifications to the trade server and displays a success or error confirmation alert.
   */
  const handleModify = () => {
    if (requestOrrnnDemoTradeAuth({
      kind: 'position-action',
      symbol: position?.symbol,
      action: 'modify',
    })) {
      return;
    }
    // Investor (read-only) login: the server would answer 403 INVESTOR_READ_ONLY.
    if (blockInvestorTradeAction(t)) return;
    if (modifySubmittingRef.current || coordinatorBusy) {
      return;
    }
    if (coordinatorRateLimited) {
      setSubmitMessage(t('Wait for the broker retry period before submitting again.'));
      return;
    }
    if (existingPositionModifyLocked) {
      setSubmitMessage(
        formatTradingErrorFeedback(
          createFrontendTradingError(
            t(SLTP_COMING_SOON_TITLE),
            t(getActiveSltpUnavailableMessage()),
          ),
        ),
      );
      return;
    }
    if (!position || !symbolsMatch) {
      return;
    }

    const currentMarket = getCurrentClosingMarketPrice();
    if (!currentMarket.availability.allowed || currentMarket.price === null) {
      recordBlockedPriceAction('modify_position', currentMarket.availability);
      const quoteBlockMessage = quoteActionBlockMessage(currentMarket.availability);
      setSubmitMessage(
        formatTradingErrorFeedback(
          createFrontendTradingError(
            t('Market Data Unavailable'),
            t(quoteBlockMessage || 'Wait for a live bid/ask before modifying Stop Loss or Take Profit.'),
          ),
        ),
      );
      return;
    }

    // Typed values bypass the stepper, so re-validate before submitting.
    const distanceError = validateStopTargets(currentMarket.price);
    if (distanceError) {
      setSubmitMessage(
        formatTradingErrorFeedback(
          createFrontendTradingError(t('Invalid Stop Levels'), distanceError),
        ),
      );
      return;
    }

    if (!resolvedLogin) {
      setSubmitMessage(
        formatTradingErrorFeedback(
          createFrontendTradingError(
            t('Authentication Error'),
            t('The active trading session is not ready. Reopen the account session and try modifying the position again.'),
          ),
        ),
      );
      return;
    }
    if (((stopLoss ?? 0) > 0 || (takeProfit ?? 0) > 0) && !tickSize) {
      setSubmitMessage(
        formatTradingErrorFeedback(
          createFrontendTradingError(
            t('Instrument Data Unavailable'),
            t('A positive broker tick size is required before setting SL/TP. Clearing remains available after the backend quote check passes.'),
          ),
        ),
      );
      return;
    }

    const requestedSl = snapStopTarget(stopLoss ?? 0);
    const requestedTp = snapStopTarget(takeProfit ?? 0);
    const previousSl = Number(position.sl) > 0 ? Number(position.sl) : 0;
    const previousTp = Number(position.tp) > 0 ? Number(position.tp) : 0;

    if (requestedSl === previousSl && requestedTp === previousTp) {
      // Closing silently here read as "Modify does nothing" when a typed edit
      // had been mangled back to the old value. Say why nothing was sent.
      setSubmitMessage(t('No SL/TP changes to submit.'));
      return;
    }

    modifySubmittingRef.current = true;
    const actionSessionKey = captureModifyPositionSessionKey();
    if (!actionSessionKey) {
      modifySubmittingRef.current = false;
      setSubmitMessage(
        formatTradingErrorFeedback(
          createFrontendTradingError(
            t('Authentication Error'),
            t('The active broker session is unavailable. Log in again before modifying a position.'),
          ),
        ),
      );
      return;
    }
    let submission: ReturnType<typeof submitModifyPosition>;
    try {
      // The session-scoped coordinator starts the PUT synchronously, owns it
      // beyond this component's lifetime, and serializes this exact ticket with
      // chart-originated intents.
      submission = submitModifyPosition({
        ticket: position.id,
        symbol: position.symbol,
        accountLogin: resolvedLogin,
        request: {
          price_sl: requestedSl,
          price_tp: requestedTp,
        },
      });
    } catch (error) {
      modifySubmittingRef.current = false;
      const feedback = classifyTradingError(error, { action: 'modify-position' });
      setSubmitMessage(formatTradingErrorFeedback(feedback));
      return;
    }

    // Close immediately for touch latency. Unmount/navigation only detaches
    // this view; it never owns or aborts the dispatched coordinator job.
    try {
      handleBack();
    } catch (error) {
      const feedback = classifyTradingError(error, { action: 'modify-position' });
      Alert.alert(feedback.title, feedback.message);
    }
    runAfterModifyClosePaint(() => {
      if (!isModifyPositionSessionKeyCurrent(actionSessionKey)) {
        return;
      }
      if (requestedSl > 0 || requestedTp > 0) {
        try {
          const preferences = useUserPreferences.getState();
          if (!preferences.chartShowOnChart.slTpLevels) {
            preferences.setChartShowOnChartItem('slTpLevels', true);
          }
          const sideVisibilityKey = position.side === 'buy' ? 'buyTrade' : 'sellTrade';
          if (!preferences.chartShowOnChart[sideVisibilityKey]) {
            preferences.setChartShowOnChartItem(sideVisibilityKey, true);
          }
        } catch {
          // Chart visibility is non-critical and must never cancel/rollback an
          // already-dispatched broker modification.
        }
      }
    });

    void submission
      .then((result) => {
        if (!isModifyPositionSessionKeyCurrent(actionSessionKey)) {
          return;
        }
        if (result.status === 'saved' || result.status === 'superseded' || result.status === 'session_changed') {
          return;
        }
        if (result.status === 'rejected' && result.error) {
          const feedback = classifyTradingError(result.error, { action: 'modify-position' });
          Alert.alert(feedback.title, feedback.message);
          return;
        }
        if (result.status === 'position_unavailable') {
          Alert.alert(
            t('Position Unavailable'),
            t('The selected position is no longer available in the latest broker position list.'),
          );
          return;
        }
        if (result.status === 'changed_elsewhere') {
          Alert.alert(
            t('Position Changed'),
            t('The latest broker position has different SL/TP values. The app kept those newer observed values.'),
          );
          return;
        }
        if (result.status === 'rate_limited') {
          Alert.alert(t('Rate Limited'), t('Wait for the broker retry period before submitting again.'));
          return;
        }
        Alert.alert(
          t('Outcome Unknown'),
          t('The app could not confirm the final SL/TP outcome. It refreshed the exact position and did not retry the change automatically.'),
        );
      })
      .finally(() => {
        modifySubmittingRef.current = false;
      });
  };

  // Inactive retained layers skip heavy paint while another screen is visible.
  if (!isScreenFocused) {
    return <View style={styles.screen} />;
  }

  if (!position) {
    return (
      <View style={[styles.screen, { paddingLeft: insets.left, paddingRight: insets.right }]}>
        <View style={{ height: insets.top, backgroundColor: screenBg }} />
        <View style={[styles.header, { paddingTop: 6 }]}>
          <View style={styles.headerTopRow}>
            <Pressable
              onPress={handleBack}
              hitSlop={20}
              style={styles.backBtn}
              accessibilityRole="button"
              accessibilityLabel={t('Go back')}
              activateOnPressIn
              latencyLabel="modifyPosition.back"
              unstable_pressDelay={0}
            >
              <Ionicons name="arrow-back" size={24} color={T.text} />
            </Pressable>
            <View style={styles.headerTitleWrap} pointerEvents="none">
              <Text style={styles.headerActionLabel} numberOfLines={1} adjustsFontSizeToFit>
                {t('Modify position').toUpperCase()}
              </Text>
            </View>
            <View style={styles.backBtn} />
          </View>
        </View>
        <View style={styles.loaderWrap}>
          <ActivityIndicator color={T.accent} />
          <Text style={[styles.loaderText, { color: T.textMuted }]}>{t('Loading position...')}</Text>
        </View>
      </View>
    );
  }

  const slDisplay = stopLoss ? stopLoss.toFixed(decimals) : 'SL';
  const tpDisplay = takeProfit ? takeProfit.toFixed(decimals) : 'TP';
  const isBuy = position.side === 'buy';

  const bidFmt = formatModifyPrice(BID, decimals);
  const askFmt = formatModifyPrice(ASK, decimals);

  return (
    <View style={[styles.screen, { paddingLeft: insets.left, paddingRight: insets.right }]}>
      <View style={{ height: insets.top, backgroundColor: screenBg }} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: 6 }]}>
        <View style={styles.headerTopRow}>
          <Pressable
            onPress={handleBack}
            hitSlop={20}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel={t('Go back')}
            activateOnPressIn
            latencyLabel="modifyPosition.back"
            unstable_pressDelay={0}
          >
            <Ionicons name="arrow-back" size={24} color={T.text} />
          </Pressable>

          <View style={styles.headerTitleWrap} pointerEvents="none">
            <Text style={styles.headerActionLabel} numberOfLines={1} adjustsFontSizeToFit>
              {t('Modify position').toUpperCase()}
            </Text>
            <Text style={styles.headerTicketLabel} numberOfLines={1}>
              #{position.id}
            </Text>
          </View>

          <Pressable
            style={styles.positionPickerBtn}
            onPress={handleOpenPositionPicker}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
            unstable_pressDelay={0}
            accessibilityRole="button"
            accessibilityLabel={t('Select Symbol')}
          >
            <Ionicons name="logo-usd" size={20} color={T.accent} />
          </Pressable>
        </View>

        <View style={styles.headerSubRow}>
          <Text style={[styles.headerSide, { color: position.side === 'buy' ? T.trading.buy.primary : T.trading.sell.primary }]}>
            {position.side.toUpperCase()}
          </Text>
          <Text style={styles.headerVol}>{position.volume.toFixed(2)}</Text>
          <Text style={styles.headerSymbol}>{position.symbol.replace(/\//g, '')}</Text>
          <Text style={styles.headerAt}>{t('at')}</Text>
          <Text style={styles.headerPrice}>{position.openPrice.toFixed(positionHeaderDecimals)}</Text>
        </View>
      </View>

      <ScrollView
        canCancelContentTouches={Platform.OS === 'ios'}
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 8 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
        contentInsetAdjustmentBehavior="never"
      >

        {/* Viewed-symbol banner — shown while browsing a symbol other than the
            modified position's; live prices below come from that symbol. */}
        {!symbolsMatch && (
          <View style={[styles.viewSymbolBanner, { borderColor: T.border }]}>
            <Ionicons name="eye-outline" size={14} color={T.accent} />
            <Text style={[styles.viewSymbolBannerText, { color: T.text }]}>
              {viewSymbol} — {t('live view. No open position on this symbol.')}
            </Text>
          </View>
        )}

        {/* Big Prices */}
        <View style={styles.priceHero}>
          <View style={styles.priceCard}>
            <Text style={styles.priceLabel}>{t('BID')}</Text>
            <Text style={[styles.priceNormal, { color: isBuy ? T.trading.sell.primary : T.trading.buy.primary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
              {bidFmt.main}<Text style={styles.priceHuge}>{bidFmt.huge}</Text>
            </Text>
          </View>
          <View style={styles.priceCardDivider} />
          <View style={styles.priceCard}>
            <Text style={styles.priceLabel}>{t('ASK')}</Text>
            <Text style={[styles.priceNormal, { color: isBuy ? T.trading.buy.primary : T.trading.sell.primary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
              {askFmt.main}<Text style={styles.priceHuge}>{askFmt.huge}</Text>
            </Text>
          </View>
        </View>

        {/* SL / TP Adjusters — enterprise premium card design. Only rendered
            while viewing the modified position's own symbol: the stepper math
            (clamping, estimates) is anchored to that symbol's live prices. */}
        {symbolsMatch && (() => {
          const PRESET_PIPS = [10, 25, 50, 100];
          const contractSize =
            typeof instrumentMeta?.contractSize === 'number' && instrumentMeta.contractSize > 0
              ? instrumentMeta.contractSize
              : 100000;
          const metaTickSize = instrumentMeta?.tickSize;
          const metaTickValue = instrumentMeta?.tickValue;
          const lots = position.volume || 0;

          const computeImpact = (target: number | null, kind: 'sl' | 'tp') => {
            if (!target || !(closingMarketPrice > 0)) return null;
            const marketPoints = tickSize ? Math.abs(target - closingMarketPrice) / tickSize : 0;
            const distance = Math.abs(target - closingMarketPrice);
            const pips = pipSize > 0 ? Math.round(distance / pipSize) : 0;
            // Prefer the broker's tick economics (exact, in account currency).
            // Fallback: contract-size math gives the quote-currency amount; for
            // JPY-quoted symbols convert by the live rate instead of assuming 100.
            let usd: number;
            if (
              typeof metaTickSize === 'number' && metaTickSize > 0 &&
              typeof metaTickValue === 'number' && metaTickValue > 0
            ) {
              usd = (distance / metaTickSize) * metaTickValue * lots;
            } else {
              const quoteCurrencyAmount = distance * contractSize * lots;
              usd = isJpy && closingMarketPrice > 0
                ? quoteCurrencyAmount / closingMarketPrice
                : quoteCurrencyAmount;
            }
            const sign = kind === 'sl' ? '−' : '+';
            const distanceValid = isStopTargetOnCorrectSide(
              kind,
              position.side,
              target,
              closingMarketPrice,
            );
            return { pips, marketPoints, usd, sign, distanceValid };
          };
          const slImpact = computeImpact(stopLoss, 'sl');
          const tpImpact = computeImpact(takeProfit, 'tp');

          const splitPrice = (val: number | null) => {
            if (val === null) return { main: '—', huge: '' };
            const str = val.toFixed(decimals);
            return { main: str.slice(0, -2), huge: str.slice(-2) };
          };
          const slParts = splitPrice(stopLoss);
          const tpParts = splitPrice(takeProfit);

          const renderCard = (
            kind: 'sl' | 'tp',
            color: string,
            title: string,
            parts: { main: string; huge: string },
            impact: {
              pips: number;
              marketPoints: number;
              usd: number;
              sign: string;
              distanceValid: boolean;
            } | null,
            onStep: (delta: number) => void,
            onPreset: (pips: number) => void,
            onChangeText: (text: string) => void,
            onClear: () => void,
            rawValue: number | null,
            inputText: string | null,
            onBlur: () => void,
          ) => {
            const distanceInvalid = Boolean(impact && !impact.distanceValid);
            const distanceColor = distanceInvalid ? T.trading.sell.primary : T.text;
            const cardBorderColor = distanceInvalid ? T.trading.sell.primary : T.border;
            return (
            <View style={[styles.stepperCard, { borderColor: cardBorderColor }]}>
              <View style={[styles.stepperAccent, { backgroundColor: color }]} />

              {/* Header */}
              <View style={styles.stepperHead}>
                <View style={styles.stepperHeadLeft}>
                  <View style={[styles.stepperBadge, { backgroundColor: color }]}>
                    <Text style={styles.stepperBadgeText}>{kind.toUpperCase()}</Text>
                  </View>
                  <Text style={styles.stepperLabel}>{title}</Text>
                </View>
                {rawValue !== null ? (
                  <Pressable
                    testID={`modify-position-${kind}-clear`}
                    onPress={onClear}
                    activateOnPressIn
                    latencyLabel={`modifyPosition.${kind}.clear`}
                    latencyBudgetMs={CRITICAL_TRADE_ACTION_MAX_LATENCY_MS}
                    hitSlop={0}
                    style={({ pressed }) => [
                      styles.stepperClear,
                      pressed && styles.stepperControlPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`${title} ${t('Clear')}`}
                  >
                    <Ionicons name="close-circle" size={16} color={T.textMuted} />
                  </Pressable>
                ) : null}
              </View>

              {/* Hero Price Row */}
              <View style={styles.stepperPriceRow}>
                <Pressable
                  testID={`modify-position-${kind}-step-down`}
                  onPress={() => onStep(-pipSize * 10)}
                  activateOnPressIn
                  latencyLabel={`modifyPosition.${kind}.stepDown`}
                  latencyBudgetMs={CRITICAL_TRADE_ACTION_MAX_LATENCY_MS}
                  hitSlop={0}
                  style={({ pressed }) => [
                    styles.stepperSquareBtn,
                    { borderColor: T.border },
                    pressed && styles.stepperControlPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`${title} ${t('Decrease')}`}
                >
                  <Ionicons name="remove" size={18} color={color} />
                </Pressable>

                <View style={styles.stepperPriceWrap}>
                  {rawValue !== null ? (
                    <Text style={styles.stepperPriceMain} numberOfLines={1} adjustsFontSizeToFit>
                      {parts.main}
                      <Text style={[styles.stepperPriceHuge, { color }]}>{parts.huge}</Text>
                    </Text>
                  ) : (
                    <Text style={styles.stepperPriceEmpty}>{t('Not set')}</Text>
                  )}
                  <TextInput
                    style={styles.stepperHiddenInput}
                    keyboardType="numeric"
                    value={inputText ?? (rawValue !== null ? rawValue.toString() : '')}
                    onChangeText={onChangeText}
                    onBlur={onBlur}
                    placeholder="0"
                    placeholderTextColor="transparent"
                  />
                </View>

                <Pressable
                  testID={`modify-position-${kind}-step-up`}
                  onPress={() => onStep(pipSize * 10)}
                  activateOnPressIn
                  latencyLabel={`modifyPosition.${kind}.stepUp`}
                  latencyBudgetMs={CRITICAL_TRADE_ACTION_MAX_LATENCY_MS}
                  hitSlop={0}
                  style={({ pressed }) => [
                    styles.stepperSquareBtn,
                    { borderColor: T.border },
                    pressed && styles.stepperControlPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`${title} ${t('Increase')}`}
                >
                  <Ionicons name="add" size={18} color={color} />
                </Pressable>
              </View>

              {/* Quick preset chips */}
              <View style={styles.stepperChipRow}>
                {PRESET_PIPS.map((p) => (
                  <Pressable
                    key={p}
                    testID={`modify-position-${kind}-preset-${p}`}
                    onPress={() => onPreset(p)}
                    activateOnPressIn
                    latencyLabel={`modifyPosition.${kind}.preset.${p}`}
                    latencyBudgetMs={CRITICAL_TRADE_ACTION_MAX_LATENCY_MS}
                    style={({ pressed }) => [
                      styles.stepperChip,
                      { borderColor: T.border },
                      pressed && styles.stepperControlPressed,
                    ]}
                    hitSlop={0}
                    accessibilityRole="button"
                    accessibilityLabel={`${title} ${p}`}
                  >
                    <Text style={[styles.stepperChipText, { color }]}>
                      {position.side === 'buy'
                        ? (kind === 'sl' ? '−' : '+')
                        : (kind === 'sl' ? '+' : '−')}
                      {p}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Footer: market-point distance + $ impact */}
              <View style={styles.stepperFootRow}>
                <Text style={styles.stepperFootLabel}>{t('Distance')}</Text>
                <Text style={[styles.stepperFootValue, impact && { color: distanceColor }]}>
                  {impact
                    ? `${Math.round(impact.marketPoints)} ${t('ticks')}`
                    : '—'}
                </Text>
              </View>
              {distanceInvalid ? (
                <Text style={styles.stepperDistanceError} accessibilityRole="alert">
                  {t('SL/TP is on the wrong side of the live closing price. Orders are executed by the broker.')}
                </Text>
              ) : null}
              <View style={styles.stepperFootRow}>
                <Text style={styles.stepperFootLabel}>{kind === 'sl' ? t('Est. Loss') : t('Est. Profit')}</Text>
                <Text style={[styles.stepperFootValue, impact && { color }]}>
                  {impact ? `${impact.sign}$${impact.usd.toFixed(2)}` : '—'}
                </Text>
              </View>
            </View>
            );
          };

          return (
            <View style={styles.stepperRow}>
              {renderCard('sl', SL_COLOR, t('Stop Loss'), slParts, slImpact, handleStepSl, handleSlPreset, handleSlChange, () => { setSlInputText(null); setStopLoss(null); }, stopLoss, slInputText, handleSlBlur)}
              {renderCard('tp', TP_COLOR, t('Take Profit'), tpParts, tpImpact, handleStepTp, handleTpPreset, handleTpChange, () => { setTpInputText(null); setTakeProfit(null); }, takeProfit, tpInputText, handleTpBlur)}
            </View>
          );
        })()}

        <ModifyPositionTickChart
          active={isScreenFocused}
          symbol={viewSymbol}
          liveInputRef={chartLiveInputRef}
          symbolsMatch={symbolsMatch}
          decimals={decimals}
          point={tickSize ?? Number.EPSILON}
          slColor={SL_COLOR}
          tpColor={TP_COLOR}
          borderColor={T.border}
          buyColor={T.trading.buy.primary}
          sellColor={T.trading.sell.primary}
          containerStyle={styles.chartContainer}
        />

        {/* Footer / Controls — submitting SL/TP only applies to the position's
            own symbol view */}
        {symbolsMatch && (
        <View style={styles.footer}>
          <View style={styles.disclaimerBox}>
            <Ionicons name="information-circle-outline" size={16} color={T.textMuted} style={styles.disclaimerIcon} />
            <Text style={styles.disclaimer}>
              {t('Prices are snapped only to the broker tick size. Final trading-rule validation is performed by the broker.')}
            </Text>
          </View>

          {existingPositionModifyLocked ? (
            <Text style={styles.validationText} accessibilityRole="alert">
              {t(getActiveSltpUnavailableMessage())}
            </Text>
          ) : submitMessage ? (
            <Text style={styles.validationText} accessibilityRole="alert">{submitMessage}</Text>
          ) : null}
          {/* Keep side-of-market validation visible above Modify even when a
              previous submit message is clear. */}
          {stopValidationError ? (
            <Text style={styles.validationText} accessibilityRole="alert">
              {stopValidationError}
            </Text>
          ) : null}
          {!existingPositionModifyLocked && !submitMessage && !stopValidationError && !hasUsableMarketPrice && (
            <Text style={styles.validationText} accessibilityRole="alert">
              {t(
                quoteActionBlockMessage(quoteAvailability)
                || 'Wait for a live bid/ask before modifying Stop Loss or Take Profit.',
              )}
            </Text>
          )}
          {/* The submit button is disabled while the coordinator owns this
              ticket; without a caption that read as a dead, silent button. */}
          {!existingPositionModifyLocked && !submitMessage && !stopValidationError && hasUsableMarketPrice && (coordinatorBusy || coordinatorRateLimited) && (
            <Text style={styles.validationText} accessibilityRole="alert">
              {coordinatorRateLimited
                ? t('Wait for the broker retry period before submitting again.')
                : t('The previous modification is still being applied to this position.')}
            </Text>
          )}
        </View>
        )}
      </ScrollView>

      {symbolsMatch ? (
        <View style={[styles.submitDock, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Pressable
            testID="modify-position-submit"
            style={({ pressed }) => [
              styles.modifyBtn,
              pressed && canModifyPosition && { opacity: 0.8 },
              !canModifyPosition && styles.modifyBtnDisabled,
            ]}
            disabled={!canModifyPosition}
            onPress={handleModify}
            activateOnTouchStart
            activateOnPressIn
            unstable_pressDelay={0}
            hitSlop={12}
            latencyLabel="modifyPosition.submit"
            latencyBudgetMs={CRITICAL_TRADE_ACTION_MAX_LATENCY_MS}
            accessibilityRole="button"
            accessibilityLabel={t('Modify position')}
            accessibilityState={{ disabled: !canModifyPosition }}
          >
            {coordinatorSaving ? (
              <>
                <ActivityIndicator size="small" color="#FFF" />
                <Text style={styles.modifyText}>{t('Saving…').toUpperCase()}</Text>
              </>
            ) : coordinatorReconciling ? (
              <>
                <ActivityIndicator size="small" color="#FFF" />
                <Text style={styles.modifyText}>{t('Reconciling').toUpperCase()}</Text>
              </>
            ) : (
              <Text style={styles.modifyText}>{t('Modify position').toUpperCase()}</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      <ActionSheet
        visible={positionPickerOpen}
        onClose={() => setPositionPickerOpen(false)}
        title={t('Select Symbol')}
        searchable
        compactText
        searchPlaceholder={t('Search symbols...')}
        detent="large"
        instantOpen
        runActionAfterClose={false}
        // Keep the sheet fixed when the search keyboard opens (no rise/jump);
        // the keyboard just overlays the lower part of the list. Mirrors the
        // chart symbol picker fix (ChartScreen.native handleOpenSymbolPicker).
        keepFullHeightOnKeyboard
        actions={positionPickerActions}
      />
    </View>
  );
}

const makeStyles = (T: ThemeColors, isDark: boolean) => {
  const screenBg = isDark ? SETTINGS_DARK_BACKGROUND : T.bg;
  const cardBg = isDark ? SETTINGS_DARK_CARD_BACKGROUND : T.glass2;
  const insetCardBg = isDark ? SETTINGS_DARK_CARD_BACKGROUND : T.glass1;

  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: screenBg,
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 24,
    paddingBottom: 28,
  },
  loaderText: {
    fontSize: 14,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
    backgroundColor: screenBg,
  },
  positionPickerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? 'rgba(59,130,246,0.12)' : 'rgba(37,99,235,0.08)',
    borderWidth: 1,
    borderColor: T.border,
  },
  viewSymbolBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: insetCardBg,
  },
  viewSymbolBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: T.border,
  },
  headerTopRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
    flexWrap: 'wrap',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  headerActionLabel: {
    color: T.text,
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 0.6,
    flexShrink: 1,
  },
  headerTicketLabel: {
    color: T.textMuted,
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.4,
  },
  headerSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 2,
    flexWrap: 'wrap',
  },
  headerSide: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  headerVol: {
    color: T.text,
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  headerSymbol: {
    color: T.text,
    fontSize: 16,
    fontWeight: '600',
  },
  headerAt: {
    color: T.textMuted,
    fontSize: 14,
  },
  headerPrice: {
    color: T.text,
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  priceHero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: cardBg,
    marginHorizontal: 16,
    borderRadius: 16,
    paddingVertical: 10,
    marginTop: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: T.border,
  },
  priceCard: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  priceCardDivider: {
    width: 1,
    height: 40,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0,0,0,0.06)',
  },
  priceLabel: {
    color: T.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: -8,
    includeFontPadding: false,
  },
  priceNormal: {
    width: '100%',
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  priceHuge: {
    fontSize: 34,
    fontWeight: '600',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    marginHorizontal: 14,
    gap: 10,
    marginBottom: 12,
  },
  stepperCard: {
    flex: 1,
    paddingTop: 10,
    paddingBottom: 8,
    paddingLeft: 11,
    paddingRight: 9,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: cardBg,
    overflow: 'hidden',
    position: 'relative',
  },
  stepperAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  stepperHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    marginBottom: 4,
  },
  stepperHeadLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  stepperBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
  },
  stepperBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: '#FFFFFF',
  },
  stepperLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: T.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stepperClear: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 8,
    minHeight: 44,
  },
  stepperPriceWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    minHeight: 26,
  },
  stepperPriceMain: {
    color: T.text,
    fontSize: 19,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0,
    textAlign: 'center',
  },
  stepperPriceHuge: {
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  stepperPriceEmpty: {
    color: T.textMuted,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  stepperHiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
    color: 'transparent',
    fontSize: 1,
  },
  stepperSquareBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: insetCardBg,
  },
  stepperChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 4,
    marginBottom: 8,
  },
  stepperChip: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 44,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: insetCardBg,
  },
  stepperControlPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.96 }],
  },
  stepperChipText: {
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.2,
  },
  stepperFootRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 1,
  },
  stepperFootLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: T.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  stepperFootValue: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    color: T.textMuted,
  },
  chartContainer: {
    marginVertical: 10,
    overflow: 'hidden',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  submitDock: {
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: screenBg,
  },
  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: cardBg,
    padding: 14,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0,0,0,0.05)',
  },
  disclaimerIcon: {
    marginRight: 8,
  },
  disclaimer: {
    flexShrink: 1,
    color: T.textMuted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    fontWeight: '500',
  },
  validationText: {
    color: T.trading.sell.primary,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
  },
  modifyBtn: {
    paddingVertical: 18,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#2563EB',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  modifyBtnDisabled: {
    opacity: 0.45,
    backgroundColor: isDark ? '#334155' : '#94A3B8',
    shadowOpacity: 0,
    elevation: 0,
  },
  stepperDistanceError: {
    color: T.trading.sell.primary,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
    marginTop: 2,
    marginBottom: 6,
  },
  modifyText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  });
};
