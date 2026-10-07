import { FastPressable as Pressable } from '../FastPressable';
/**
 * Optimized list item rendering an individual Open Position.
 *
 * Architectural Note:
 * This component intentionally hooks its own single-symbol quote listener.
 * That keeps updates scoped to the affected row instead of forcing the whole
 * trade list to re-render on every market tick.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View, LayoutAnimation, Platform, PanResponder } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { PositionItem } from '../../../dev/mock/tradingData';
import { useTheme } from '../../theme/useTheme';
import { fmt } from '../../../utils/format';
import { formatBrokerTime } from '../../../utils/brokerTime';
import { useUserPreferences } from '../../../state/userPreferences';
import { useIsDarkTheme } from '../../../state/themeMode';
import { useLiveSymbolQuote } from '../../../query/websocket';
import { useInstrumentMeta } from '../../../query/instruments';
import { resolveTradingLoginString } from '../../../state/tradingLogin';
import { usePositionsState } from '../../../state/positionsState';
import { prefetchOrderTicketData } from '../../../utils/navigationPrefetch';
import {
  formatLivePositionPnl,
  resolveLivePositionPnl,
  resolveLivePositionPrice,
} from '../../../features/trade/livePositionMetrics';
import { closePositionImmediately } from '../../../features/trade/closePositionFlow';
import { showTradePositionAction } from '../../../features/trade/tradePositionActionHostController';
import { requestOrrnnDemoTradeAuth } from '../../../features/trade/tradeAuthPrompt';
import {
  getActiveSltpUnavailableMessage,
  isExistingPositionModifyBackendLocked,
  SLTP_COMING_SOON_TITLE,
} from '../../../features/trade/tradeBackendCapabilities';
import { OverlayActions } from './OverlayActions';
import { tradePositionRowStyles as styles } from './styles';
import { formatPointSize, resolveTradePositionPointValue } from '../../../utils/pricePoint';


function resolveFiniteTradeDetailNumber(...values: Array<number | null | undefined>): number | undefined {
  return values.find((value): value is number => (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0
  ));
}

function formatTradeDetailNumber(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '--';
  }

  if (Number.isInteger(value)) {
    return String(value);
  }

  const abs = Math.abs(value);
  const decimals = abs > 0 && abs < 1
    ? Math.min(10, Math.max(2, Math.ceil(-Math.log10(abs)) + 2))
    : 4;

  return value.toFixed(decimals).replace(/0+$/, '').replace(/\.$/, '');
}

function formatTradeLeverage(value: number | null | undefined): string {
  const leverage = resolveFiniteTradeDetailNumber(value);
  return leverage !== undefined ? `1:${formatTradeDetailNumber(leverage)}` : '--';
}

function formatTradeLimitValue(value: number | null | undefined): string | null {
  const resolved = resolveFiniteTradeDetailNumber(value);
  return resolved !== undefined ? fmt.price(resolved) : null;
}

function formatTradeLimits(item: PositionItem): string {
  const slText = formatTradeLimitValue(item.sl);
  const tpText = formatTradeLimitValue(item.tp);
  if (slText || tpText) {
    return `SL ${slText ?? '--'} / TP ${tpText ?? '--'}`;
  }
  return 'SL / TP';
}

const TRADE_ROW_ACTIONS_WIDTH = 270;
const TRADE_ROW_SWIPE_ACTIVE_OFFSET_X: [number, number] = Platform.OS === 'ios' ? [-10, 10] : [-18, 18];
const TRADE_ROW_SWIPE_FAIL_OFFSET_Y: [number, number] = Platform.OS === 'ios' ? [-28, 28] : [-10, 10];
const TRADE_ROW_SWIPE_OPEN_VELOCITY_X = Platform.OS === 'ios' ? -360 : -500;
const TRADE_ROW_IOS_SWIPE_CLAIM_DISTANCE = 8;
const TRADE_ROW_IOS_SWIPE_VERTICAL_RATIO = 1.15;
const TRADE_ROW_IOS_SWIPE_OPEN_VELOCITY_X = -0.35;

function TradePositionRowComponent({
  item,
  onPress,
  onLongPress,
  onBulkPress,
  onCloseSellPress,
  pnlCurrency = 'USD',
  selected = false,
  active = true,
  accountLeverage = null,
}: {
  item: PositionItem;
  onPress: (item: PositionItem) => void;
  onLongPress: (item: PositionItem) => void;
  onBulkPress?: () => void;
  onCloseSellPress?: () => void;
  pnlCurrency?: string;
  selected?: boolean;
  active?: boolean;
  accountLeverage?: number | null;
}) {
  const T = useTheme();
  const isDark = useIsDarkTheme();
  const setChartSymbol = useUserPreferences((s) => s.setChartSymbol);
  const primePositionSnapshot = usePositionsState((state) => state.primePositionSnapshot);
  const isBuy = item.side === 'buy';
  const [expanded, setExpanded] = useState(false);
  const [overlayActionLocked, setOverlayActionLocked] = useState(false);
  const overlayActionLockRef = useRef(false);
  const overlayActionReleaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const translateX = useSharedValue(TRADE_ROW_ACTIONS_WIDTH); // Start deeply closed (pushed right)
  const startX = useSharedValue(0);

  const closeOverlay = () => {
    translateX.value = withSpring(TRADE_ROW_ACTIONS_WIDTH, { damping: 20, stiffness: 200, overshootClamping: true });
  };

  const openOverlay = () => {
    translateX.value = withSpring(0, { damping: 20, stiffness: 200, overshootClamping: true });
  };

  useEffect(() => () => {
    if (overlayActionReleaseTimeoutRef.current) {
      clearTimeout(overlayActionReleaseTimeoutRef.current);
      overlayActionReleaseTimeoutRef.current = null;
    }
  }, []);

  const releaseOverlayActionLock = (delay = 0) => {
    if (overlayActionReleaseTimeoutRef.current) {
      clearTimeout(overlayActionReleaseTimeoutRef.current);
      overlayActionReleaseTimeoutRef.current = null;
    }
    const finalize = () => {
      overlayActionLockRef.current = false;
      setOverlayActionLocked(false);
      overlayActionReleaseTimeoutRef.current = null;
    };
    if (delay > 0) {
      overlayActionReleaseTimeoutRef.current = setTimeout(finalize, delay);
      return;
    }
    finalize();
  };

  const runOverlayAction = (action: () => void) => {
    if (overlayActionLockRef.current) {
      return;
    }
    overlayActionLockRef.current = true;
    setOverlayActionLocked(true);
    closeOverlay();
    action();
    releaseOverlayActionLock(320);
  };

  const panGesture = Gesture.Pan()
    .enabled(Platform.OS !== 'ios')
    .activeOffsetX(TRADE_ROW_SWIPE_ACTIVE_OFFSET_X)
    .failOffsetY(TRADE_ROW_SWIPE_FAIL_OFFSET_Y)
    .onStart(() => {
      startX.value = translateX.value;
    })
    .onUpdate((event) => {
      const nextX = startX.value + event.translationX;
      translateX.value = Math.max(0, Math.min(TRADE_ROW_ACTIONS_WIDTH, nextX));
    })
    .onEnd((event) => {
      if (event.velocityX < TRADE_ROW_SWIPE_OPEN_VELOCITY_X || translateX.value < TRADE_ROW_ACTIONS_WIDTH / 2) {
        translateX.value = withSpring(0, { damping: 20, stiffness: 200, overshootClamping: true });
      } else {
        translateX.value = withSpring(TRADE_ROW_ACTIONS_WIDTH, { damping: 20, stiffness: 200, overshootClamping: true });
      }
    });

  const iosSwipePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponderCapture: (_event, gestureState) => {
          if (Platform.OS !== 'ios' || overlayActionLockRef.current) {
            return false;
          }

          const horizontalDistance = Math.abs(gestureState.dx);
          const verticalDistance = Math.abs(gestureState.dy);
          const isHorizontalSwipe =
            horizontalDistance >= TRADE_ROW_IOS_SWIPE_CLAIM_DISTANCE &&
            horizontalDistance > verticalDistance * TRADE_ROW_IOS_SWIPE_VERTICAL_RATIO;
          const overlayIsVisible = translateX.value < TRADE_ROW_ACTIONS_WIDTH - 1;

          return isHorizontalSwipe && (gestureState.dx < 0 || overlayIsVisible);
        },
        onPanResponderGrant: () => {
          startX.value = translateX.value;
        },
        onPanResponderMove: (_event, gestureState) => {
          const nextX = startX.value + gestureState.dx;
          translateX.value = Math.max(0, Math.min(TRADE_ROW_ACTIONS_WIDTH, nextX));
        },
        onPanResponderRelease: (_event, gestureState) => {
          if (gestureState.vx < TRADE_ROW_IOS_SWIPE_OPEN_VELOCITY_X || translateX.value < TRADE_ROW_ACTIONS_WIDTH / 2) {
            openOverlay();
          } else {
            closeOverlay();
          }
        },
        onPanResponderTerminate: () => {
          closeOverlay();
        },
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => false,
      }),
    [startX, translateX],
  );
  const iosSwipePanHandlers = Platform.OS === 'ios' ? iosSwipePanResponder.panHandlers : {};

  const overlayStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }],
    };
  });

  // Visible trade rows commit directly on every symbol tick for MT5-like cadence.
  const liveQuote = useLiveSymbolQuote(item.symbol, active, 0);
  const { data: instrumentMeta } = useInstrumentMeta(item.symbol, active);

  const livePrice = resolveLivePositionPrice(item, liveQuote);
  const pointValue = resolveTradePositionPointValue({ instrumentMeta, liveQuote });
  const pointText = formatPointSize(pointValue);
  const leverageText = formatTradeLeverage(accountLeverage);
  const limitsText = formatTradeLimits(item);

  const isJpy = item.symbol.includes('JPY');
  const decimals = isJpy ? 3 : 5; // Standard FX: 5 decimals, JPY pairs: 3 decimals
  const displayPnl = resolveLivePositionPnl(item, liveQuote);

  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  };

  const detailColor = T.textSub;
  const detailLabelColor = T.textMuted;
  const dividerColor = isDark ? T.borderSubtle : T.border;
  const tradingLogin = resolveTradingLoginString();

  const openPositionAction = (destination: 'close' | 'modify') => {
    if (requestOrrnnDemoTradeAuth({
      kind: 'position-action',
      symbol: item.symbol,
      action: destination,
    })) {
      return;
    }
    primePositionSnapshot(item);
    showTradePositionAction(destination, item.id);
  };

  const navigateToModifyPosition = () => {
    if (isExistingPositionModifyBackendLocked()) {
      Alert.alert(SLTP_COMING_SOON_TITLE, getActiveSltpUnavailableMessage());
      return;
    }
    openPositionAction('modify');
  };

  const navigateToOrderTicket = () => {
    if (requestOrrnnDemoTradeAuth({
      kind: 'order-ticket',
      symbol: item.symbol,
      origin: 'trade',
    })) {
      return;
    }
    prefetchOrderTicketData(tradingLogin, item.symbol);
    router.push({ pathname: '/trade/order-ticket', params: { symbol: item.symbol } });
  };

  // Reference unused props for parameter destructuring without lint warnings.
  void onPress;

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        {...iosSwipePanHandlers}
        collapsable={false}
        style={[
          styles.row,
          {
            backgroundColor: T.glass2,
            borderColor: T.border,
            borderLeftColor: T.border,
          },
          !isDark && styles.shadowLight,
          isDark && styles.shadowDark,
          selected && { backgroundColor: T.glass1, borderColor: T.border },
        ]}
      >
        <Pressable
          onPress={toggleExpand}
          onLongPress={() => onLongPress(item)}
          delayLongPress={400}
          style={styles.body}
        >
          {/*
            Left column is a vertical stack with one shared left edge (draw a
            vertical line through ticket id, symbol, and open price). Ticket is
            not absolute-positioned, so all three share the same start x.
          */}
          <View style={styles.headerRow}>
            <View style={styles.leftCol}>
              <Text style={[styles.ticketId, { color: T.textMuted }]} numberOfLines={1}>
                #{item.id}
              </Text>
              <View style={styles.symbolLine}>
                <Text style={[styles.symbol, { color: T.text }]} numberOfLines={1}>
                  {fmt.symbol(item.symbol)}
                </Text>
                <View style={[
                  styles.sideBadge,
                  isBuy
                    ? { backgroundColor: 'rgba(37,99,235,0.15)' }
                    : { backgroundColor: 'rgba(220,38,38,0.12)' },
                ]}>
                  <Text style={[styles.sideText, { color: isBuy ? T.trading.buy.hover : T.trading.sell.hover }]}>
                    {item.side}
                  </Text>
                </View>
                <Text style={[styles.volume, { color: T.textMuted }]}>{(item.volume || 0).toFixed(2)}</Text>
              </View>
              <View style={styles.priceLeft}>
                <Text style={[styles.price, { color: T.textSub }]} numberOfLines={1}>
                  {Number.isFinite(item.openPrice) ? item.openPrice.toFixed(decimals) : '---'}
                </Text>
                <Ionicons name="arrow-forward-outline" size={14} color={T.textSub} style={styles.arrow} />
                <Text style={[styles.price, { color: T.textSub }]} numberOfLines={1}>
                  {Number.isFinite(livePrice) ? livePrice.toFixed(decimals) : '---'}
                </Text>
              </View>
            </View>
            <View style={styles.rightCol}>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.82}
                style={[styles.pnl, { color: displayPnl >= 0 ? T.trading.profit : T.trading.loss }]}
              >
                {formatLivePositionPnl(displayPnl)} {pnlCurrency}
              </Text>
              <Text style={[styles.dateRight, { color: T.textSub }]}>
                {formatBrokerTime(item.openTime).replace(' ', '   ')}
              </Text>
            </View>
          </View>

          {(!!item.sl || !!item.tp) && (
            <View style={styles.slTpRow}>
              {!!item.sl && (
                <View style={styles.slTpBadge}>
                  <Text style={[styles.slTpText, { color: T.accent }]}>SL {fmt.price(item.sl as number)}</Text>
                </View>
              )}
              {!!item.tp && (
                <View style={styles.slTpBadge}>
                  <Text style={[styles.slTpText, { color: '#388E3C' }]}>TP {fmt.price(item.tp as number)}</Text>
                </View>
              )}
            </View>
          )}
        </Pressable>

        {/* ── Expanded Details ── */}
        {expanded && (
          <View style={[styles.expandedSection, { borderTopColor: dividerColor }]}>
            <View style={styles.detailGrid}>
              <View style={styles.detailCell}>
                <Text style={[styles.detailLabel, { color: detailLabelColor }]}>Limits</Text>
                {/* Fire on release: the row's swipe pan must be able to cancel
                    this press when a swipe starts on the Limits text. */}
                <Pressable onPress={navigateToModifyPosition} hitSlop={12} unstable_pressDelay={0}>
                  <Text
                    numberOfLines={2}
                    style={[styles.detailValue, styles.limitsValue, { color: T.accent }]}
                  >
                    {limitsText}
                  </Text>
                </Pressable>
              </View>
              <View style={styles.detailCell}>
                <Text style={[styles.detailLabel, { color: detailLabelColor }]}>OPEN</Text>
                <Text style={[styles.detailValue, { color: detailColor }]}>
                  {fmt.price(item.openPrice)}
                </Text>
              </View>
              <View style={styles.detailCell}>
                <Text style={[styles.detailLabel, { color: detailLabelColor }]}>Swap</Text>
                <Text style={[styles.detailValue, { color: item.swap !== 0 ? T.trading.loss : detailColor }]}>
                  {item.swap.toFixed(2)}
                </Text>
              </View>
            </View>
            <View style={styles.detailGrid}>
              <View style={styles.detailCell}>
                <Text style={[styles.detailLabel, { color: detailLabelColor }]}>Ticket</Text>
                <Text style={[styles.detailValue, { color: detailColor }]}>
                  #{item.id}
                </Text>
              </View>
              <View style={styles.detailCell}>
                <Text style={[styles.detailLabel, { color: detailLabelColor }]}>Point size</Text>
                <Text style={[styles.detailValue, { color: detailColor }]}>
                  {pointText}
                </Text>
              </View>
              <View style={styles.detailCell}>
                <Text style={[styles.detailLabel, { color: detailLabelColor }]}>Leverage</Text>
                <Text style={[styles.detailValue, { color: detailColor }]}>
                  {leverageText}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Render overlay on top within a clipping wrapper so shadows stay intact */}
        <View style={[StyleSheet.absoluteFill, { overflow: 'hidden', borderRadius: 16 }]} pointerEvents="box-none">
          <OverlayActions
            T={T}
            isDark={isDark}
            dividerColor={dividerColor}
            overlayActionLocked={overlayActionLocked}
            overlayStyle={overlayStyle}
            onClose={() => runOverlayAction(() => closePositionImmediately(item, {
              quote: liveQuote,
              resolvedLogin: tradingLogin,
            }))}
            onModify={() => runOverlayAction(navigateToModifyPosition)}
            onOrderTicket={() => runOverlayAction(navigateToOrderTicket)}
            onOpenChart={() => runOverlayAction(() => {
              setChartSymbol(item.symbol);
              router.push('/(tabs)/chart');
            })}
            onBulk={onBulkPress ? () => runOverlayAction(onBulkPress) : undefined}
            onCloseSell={onCloseSellPress ? () => runOverlayAction(onCloseSellPress) : undefined}
          />
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

export const TradePositionRow = memo(TradePositionRowComponent, (prev, next) => (
  prev.item === next.item &&
  prev.pnlCurrency === next.pnlCurrency &&
  prev.selected === next.selected &&
  prev.active === next.active &&
  prev.accountLeverage === next.accountLeverage &&
  prev.onPress === next.onPress &&
  prev.onLongPress === next.onLongPress &&
  prev.onBulkPress === next.onBulkPress &&
  prev.onCloseSellPress === next.onCloseSellPress
));
