import { FastPressable as Pressable } from '../../ui/components/FastPressable';
/**
 * Trade Feature UI: ClosePositionScreen
 *
 * Interface for closing a single active position at market.
 */

import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/shallow';
import { useUserPreferences } from '../../state/userPreferences';
import { useIsDarkTheme } from '../../state/themeMode';
import { usePositionsState } from '../../state/positionsState';
import { resolveTradingLoginString } from '../../state/tradingLogin';
import { positionsApi } from '../../api/positions';
import { appQueryClient } from '../../state/providers/AppProviders';
import type { PositionItem } from '../../dev/mock/tradingData';
import { spacing } from '../../ui/theme/index';
import { useTheme } from '../../ui/theme/useTheme';
import { ThemeColors } from '../../ui/theme/glass';
import { fmt } from '../../utils/format';
import { safeRouterBack } from '../../utils/navigation';
import { useTranslation } from '../../i18n/useTranslation';
import { CRITICAL_TRADE_ACTION_MAX_LATENCY_MS } from '../../utils/actionLatency';
import { findPositionById, symbolDisplayName } from './tradeFlow';
import { resolveLivePositionPnl, resolveLivePositionPrice } from './livePositionMetrics';
import {
  classifyTradingError,
  createFrontendTradingError,
  formatTradingErrorFeedback,
} from '../../api/tradingErrors';
import { hideTradePositionActionHost } from './tradePositionActionHostController';
import { useExecutableQuote } from '../quotes/useExecutableQuote';
import { quoteActionBlockMessage, recordBlockedPriceAction } from '../../market/quoteIntegrity';
import {
  captureActiveBrokerSessionProvenance,
  isActiveBrokerSessionProvenanceCurrent,
  subscribeActiveBrokerSession,
} from '../../state/activeBrokerSession';
import { invalidateSessionQueryRoots } from '../../query/authenticatedQueryScope';
import { requestOrrnnDemoTradeAuth } from './tradeAuthPrompt';
import { blockInvestorTradeAction, useInvestorReadOnlySession } from '../../hooks/useInvestorReadOnlySession';

const CANVAS_DARK = '#121212';
const CARD_DARK = '#1E1E1E';
const DIVIDER_DARK = 'rgba(255,255,255,0.06)';

type RetainedClosePositionState = Pick<
  ReturnType<typeof usePositionsState.getState>,
  'positions' | 'positionSnapshots'
>;

export type ClosePositionScreenProps = Readonly<{
  hosted?: boolean;
  hostedActive?: boolean;
  hostedPositionId?: string | null;
  onHostedBack?: () => void;
}>;

function isValidCloseTicket(value: unknown): value is string | number {
  return typeof value === 'number'
    ? Number.isInteger(value) && value > 0
    : typeof value === 'string' && /^\d+$/.test(value.trim());
}

function isRenderableClosePosition(position: PositionItem | undefined): position is PositionItem {
  const symbol = position?.symbol?.trim();
  return Boolean(
    position &&
    symbol &&
    symbol.toUpperCase() !== 'UNKNOWN' &&
    symbol.toUpperCase() !== 'UNDEFINED' &&
    isValidCloseTicket(position.id),
  );
}

type ScopedStablePosition = Readonly<{
  position: PositionItem;
  cacheNamespace: string;
}>;

const subscribeActiveCacheNamespace = (listener: () => void) =>
  subscribeActiveBrokerSession(() => listener());

const getActiveCacheNamespaceSnapshot = (): string =>
  captureActiveBrokerSessionProvenance()?.cacheNamespace ?? '';

const getServerActiveCacheNamespaceSnapshot = (): string => '';

export function ClosePositionScreen({
  hosted = false,
  hostedActive = true,
  hostedPositionId = null,
  onHostedBack,
}: ClosePositionScreenProps = {}) {
  const params = useLocalSearchParams<{ positionId?: string }>();
  const positionId = hosted
    ? (hostedPositionId ?? undefined)
    : (Array.isArray(params.positionId) ? params.positionId[0] : params.positionId);
  const [submitted, setSubmitted] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [actionLocked, setActionLocked] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const actionLockRef = useRef(false);
  const actionReleaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeFocused = useIsFocused();
  const isScreenFocused = hosted ? hostedActive : routeFocused;
  const themeActive = isScreenFocused;
  const T = useTheme({ active: themeActive });
  const { t } = useTranslation();
  const investorReadOnly = useInvestorReadOnlySession();
  const isDark = useIsDarkTheme();
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);
  const insets = useSafeAreaInsets();
  const screenBg = isDark ? CANVAS_DARK : T.bg;

  const retainedPositionStateRef = useRef<RetainedClosePositionState | null>(null);
  if (retainedPositionStateRef.current === null) {
    const initialPositionState = usePositionsState.getState();
    retainedPositionStateRef.current = {
      positions: initialPositionState.positions,
      positionSnapshots: initialPositionState.positionSnapshots,
    };
  }
  const positionState = usePositionsState(
    useShallow((state): RetainedClosePositionState => (
      isScreenFocused
        ? { positions: state.positions, positionSnapshots: state.positionSnapshots }
        : retainedPositionStateRef.current as RetainedClosePositionState
    )),
  );
  if (isScreenFocused) {
    retainedPositionStateRef.current = positionState;
  }
  const positions = positionState.positions;
  const primedPosition = positionId
    ? positionState.positionSnapshots[Array.isArray(positionId) ? positionId[0] : positionId]
    : undefined;
  const resolvedPosition = useMemo(
    () => findPositionById(positions, positionId) ?? primedPosition,
    [positions, positionId, primedPosition]
  );
  const activeCacheNamespace = useSyncExternalStore(
    subscribeActiveCacheNamespace,
    getActiveCacheNamespaceSnapshot,
    getServerActiveCacheNamespaceSnapshot,
  );
  const [stablePosition, setStablePosition] = useState<ScopedStablePosition | null>(() =>
    isRenderableClosePosition(resolvedPosition) && activeCacheNamespace
      ? { position: resolvedPosition, cacheNamespace: activeCacheNamespace }
      : null,
  );
  useEffect(() => {
    setStablePosition((current) => {
      if (!activeCacheNamespace) {
        return null;
      }
      // A session transition invalidates the retained ticket immediately. Do
      // not bind a still-rendered old position to the newly active session.
      if (current && current.cacheNamespace !== activeCacheNamespace) {
        return null;
      }
      if (isRenderableClosePosition(resolvedPosition)) {
        return {
          position: resolvedPosition,
          cacheNamespace: activeCacheNamespace,
        };
      }
      return current;
    });
  }, [activeCacheNamespace, resolvedPosition]);
  const position = stablePosition?.cacheNamespace === activeCacheNamespace
    ? stablePosition.position
    : null;
  const positionCacheNamespace = position ? stablePosition?.cacheNamespace ?? '' : '';
  const resolvedLogin = resolveTradingLoginString();

  const {
    quote: executableQuote,
    availability: quoteAvailability,
    getCurrentAvailability,
  } = useExecutableQuote(position?.symbol ?? '', themeActive && Boolean(position?.symbol));
  const livePrice = position ? resolveLivePositionPrice(position, executableQuote) : 0;
  const livePnl = position ? resolveLivePositionPnl(position, executableQuote) : 0;

  useEffect(() => {
    if (isScreenFocused && !position && resolvedLogin) {
      void usePositionsState.getState().refreshPositions(resolvedLogin);
    }
  }, [isScreenFocused, position, resolvedLogin]);

  useEffect(() => () => {
    if (actionReleaseTimeoutRef.current) {
      clearTimeout(actionReleaseTimeoutRef.current);
      actionReleaseTimeoutRef.current = null;
    }
  }, []);

  const releaseActionLock = useCallback((delay = 0) => {
    if (actionReleaseTimeoutRef.current) {
      clearTimeout(actionReleaseTimeoutRef.current);
      actionReleaseTimeoutRef.current = null;
    }
    const finalize = () => {
      actionLockRef.current = false;
      setActionLocked(false);
      actionReleaseTimeoutRef.current = null;
    };
    if (delay > 0) {
      actionReleaseTimeoutRef.current = setTimeout(finalize, delay);
      return;
    }
    finalize();
  }, []);

  const leaveScreen = useCallback(() => {
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

  const handleClosePosition = useCallback(async () => {
    if (requestOrrnnDemoTradeAuth({
      kind: 'position-action',
      symbol: position?.symbol,
      action: 'close',
    })) {
      return;
    }
    // Investor (read-only) login: the server would answer 403 INVESTOR_READ_ONLY.
    if (blockInvestorTradeAction(t)) return;
    if (!position || actionLockRef.current || isClosing) {
      return;
    }

    const currentQuoteAvailability = getCurrentAvailability();
    if (!currentQuoteAvailability.allowed) {
      recordBlockedPriceAction('close_position', currentQuoteAvailability);
      setCloseError(
        formatTradingErrorFeedback(
          createFrontendTradingError(
            t('Market Data Unavailable'),
            t(quoteActionBlockMessage(currentQuoteAvailability)),
          ),
        ),
      );
      return;
    }

    actionLockRef.current = true;
    setActionLocked(true);

    const ticketId = position.id;
    if (!isValidCloseTicket(ticketId)) {
      setCloseError(
        formatTradingErrorFeedback(
          createFrontendTradingError(
            t('Position Error'),
            t('The position ticket is still loading. Return to Trade and select the position again.'),
          ),
        ),
      );
      releaseActionLock();
      return;
    }

    const currentAccountDetails = useUserPreferences.getState().accountDetails;
    if (!currentAccountDetails?.credentials?.accessToken) {
      setCloseError(
        formatTradingErrorFeedback(
          createFrontendTradingError(
            t('Authentication Error'),
            t('The app does not have a valid local trading session. Log in again before closing a position.'),
          ),
        ),
      );
      releaseActionLock();
      return;
    }
    const actionProvenance = captureActiveBrokerSessionProvenance();
    if (
      !actionProvenance ||
      !positionCacheNamespace ||
      positionCacheNamespace !== actionProvenance.cacheNamespace ||
      !resolvedLogin ||
      resolvedLogin !== actionProvenance.identity.accountLogin
    ) {
      setCloseError(
        formatTradingErrorFeedback(
          createFrontendTradingError(
            t('Position Session Changed'),
            t('The active broker account changed. Return to Trade and select the position again.'),
          ),
        ),
      );
      releaseActionLock();
      return;
    }

    setIsClosing(true);
    setCloseError(null);
    const closeSnapshot = { ...position };
    usePositionsState.getState().beginOptimisticClose(ticketId);
    setSubmitted(true);
    leaveScreen();

    void positionsApi.closePosition(ticketId)
      .then(() => {
        if (!isActiveBrokerSessionProvenanceCurrent(actionProvenance)) return;
        const state = usePositionsState.getState();
        state.finishOptimisticClose(ticketId);
        void invalidateSessionQueryRoots(
          appQueryClient,
          actionProvenance.cacheNamespace,
          ['positionHistory', 'accountDeals', 'deals', 'positions', 'ordersByLogin', 'accountSummary', 'transactions'],
        );
        if (resolvedLogin) {
          void state.refreshPositions(resolvedLogin);
        }
      })
      .catch((error: any) => {
        if (!isActiveBrokerSessionProvenanceCurrent(actionProvenance)) return;
        const feedback = classifyTradingError(error, { action: 'close-position' });
        usePositionsState.getState().rollbackOptimisticClose(closeSnapshot);
        setCloseError(formatTradingErrorFeedback(feedback));
        Alert.alert(feedback.title, feedback.message);
      })
      .finally(() => {
        setIsClosing(false);
        releaseActionLock();
      });
  }, [getCurrentAvailability, isClosing, leaveScreen, position, positionCacheNamespace, releaseActionLock, resolvedLogin, t]);

  // Inactive retained layers skip paint work while another screen is visible.
  if (!isScreenFocused) {
    return <View style={[styles.root, { backgroundColor: screenBg }]} />;
  }

  const header = (
    <>
      <View style={{ height: insets.top, backgroundColor: screenBg }} />
      <View style={styles.customHeader}>
        <Pressable
          onPress={leaveScreen}
          hitSlop={16}
          style={styles.headerBtn}
          activateOnPressIn
          latencyLabel="closePosition.back"
          unstable_pressDelay={0}
        >
          <Ionicons name="arrow-back" size={24} color={T.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: T.text }]} numberOfLines={1}>{t('Close position')}</Text>
        <View style={styles.headerBtn} />
      </View>
    </>
  );

  if (!position) {
    return (
      <View style={[styles.root, { backgroundColor: screenBg, paddingLeft: insets.left, paddingRight: insets.right }]}>
        {header}
        <View style={styles.centered}>
          <ActivityIndicator size="small" color={T.accent} />
        </View>
      </View>
    );
  }

  const isBuy = position.side === 'buy';
  const symbol = position.symbol.replace(/\//g, '');

  return (
    <View style={[styles.root, { backgroundColor: screenBg, paddingLeft: insets.left, paddingRight: insets.right }]}>
      {header}
      <ScrollView
        canCancelContentTouches={Platform.OS === 'ios'}
        style={styles.contentWrap}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.lg },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
      >
        <Text style={styles.subTitle}>{t('Review and confirm closing order')}</Text>

        <View style={styles.card}>
          <View style={styles.cardTop}>
            <View style={styles.cardTopLeft}>
              <Text style={styles.ticket}>#{position.id}</Text>
              <Text style={styles.symbol}>{symbol}</Text>
              <Text style={styles.instrument} numberOfLines={1}>{symbolDisplayName(position.symbol)}</Text>
            </View>
            <View style={[styles.sideBadge, isBuy ? styles.sideBadgeBuy : styles.sideBadgeSell]}>
              <Text style={[styles.sideBadgeText, isBuy ? styles.sideTextBuy : styles.sideTextSell]}>
                {position.side.toUpperCase()}
              </Text>
              <Text style={[styles.sideVolume, isBuy ? styles.sideTextBuy : styles.sideTextSell]}>
                {(position.volume || 0).toFixed(2)}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <MetricRow label={t('Open Price')} value={fmt.price(position.openPrice)} styles={styles} muted />
          <MetricRow label={t('Current Price')} value={fmt.price(livePrice)} styles={styles} />
          <View style={styles.pnlBlock}>
            <Text style={styles.pnlLabel}>{t('Floating P/L')}</Text>
            <Text style={[styles.pnlValue, livePnl < 0 ? styles.negative : livePnl > 0 ? styles.positive : null]}>
              {fmt.pnl(livePnl)}
            </Text>
          </View>
        </View>

        {closeError || submitted ? (
          <View style={[styles.statusBox, closeError ? styles.statusBoxError : styles.statusBoxSuccess]}>
            <Text style={[styles.statusText, closeError ? styles.statusTextError : styles.statusTextSuccess]}>
              {closeError ?? t('Close order submitted. Position closed successfully.')}
            </Text>
          </View>
        ) : !quoteAvailability.allowed ? (
          <View style={[styles.statusBox, styles.statusBoxError]}>
            <Text style={[styles.statusText, styles.statusTextError]}>
              {t(quoteActionBlockMessage(quoteAvailability))}
            </Text>
          </View>
        ) : null}

        <View style={styles.buttonStack}>
          <Pressable
            style={[
              styles.primaryBtn,
              (investorReadOnly || isClosing || actionLocked || !quoteAvailability.allowed) && styles.btnDisabled,
            ]}
            disabled={investorReadOnly || isClosing || actionLocked || !quoteAvailability.allowed}
            onPress={() => { void handleClosePosition(); }}
            activateOnPressIn
            latencyLabel="closePosition.submit"
            latencyBudgetMs={CRITICAL_TRADE_ACTION_MAX_LATENCY_MS}
            unstable_pressDelay={0}
          >
            {isClosing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryBtnText}>{t('Close position')}</Text>
            )}
          </Pressable>

        </View>
      </ScrollView>
    </View>
  );
}

function MetricRow({
  label,
  value,
  styles,
  muted = false,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof makeStyles>;
  muted?: boolean;
}) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, muted && styles.metricValueMuted]}>{value}</Text>
    </View>
  );
}

const makeStyles = (T: ThemeColors, isDark = false) => StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: isDark ? DIVIDER_DARK : T.borderSubtle,
  },
  headerBtn: { width: 44, height: 48, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '500',
    textAlign: 'center',
    letterSpacing: 0.15,
  },
  contentWrap: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingTop: 12 },
  subTitle: {
    color: T.textMuted,
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 12,
    paddingHorizontal: spacing.md,
  },
  card: {
    marginHorizontal: spacing.md,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: isDark ? DIVIDER_DARK : T.borderMedium,
    backgroundColor: isDark ? CARD_DARK : T.glass2,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardTopLeft: { flex: 1, minWidth: 0 },
  ticket: {
    color: T.textMuted,
    fontSize: 12,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
    marginBottom: 4,
  },
  symbol: {
    color: T.text,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  instrument: {
    marginTop: 2,
    color: T.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  sideBadge: {
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 2,
  },
  sideBadgeBuy: { backgroundColor: 'rgba(37,99,235,0.12)' },
  sideBadgeSell: { backgroundColor: 'rgba(220,38,38,0.12)' },
  sideBadgeText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  sideVolume: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  sideTextBuy: { color: T.trading.buy.primary },
  sideTextSell: { color: T.trading.sell.primary },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: isDark ? DIVIDER_DARK : T.borderSubtle,
    marginVertical: 14,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  metricLabel: {
    color: T.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  metricValue: {
    color: T.text,
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  metricValueMuted: {
    color: T.textSub,
  },
  pnlBlock: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : T.glass1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pnlLabel: {
    color: T.text,
    fontSize: 14,
    fontWeight: '600',
  },
  pnlValue: {
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    color: T.text,
  },
  negative: { color: T.trading.loss },
  positive: { color: T.trading.profit },
  statusBox: {
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  statusBoxSuccess: {
    borderColor: `${T.trading.profit}55`,
    backgroundColor: T.upGlow,
  },
  statusBoxError: {
    borderColor: isDark ? 'rgba(239,68,68,0.34)' : 'rgba(220,38,38,0.24)',
    backgroundColor: T.downGlow,
  },
  statusText: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  statusTextSuccess: { color: T.trading.profit },
  statusTextError: { color: T.trading.loss },
  buttonStack: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.md,
    gap: 10,
  },
  primaryBtn: {
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    backgroundColor: T.trading.sell.primary,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  secondaryBtn: {
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: isDark ? CARD_DARK : T.glass1,
    borderWidth: 1,
    borderColor: isDark ? DIVIDER_DARK : T.borderMedium,
  },
  secondaryBtnText: {
    color: T.text,
    fontSize: 15,
    fontWeight: '600',
  },
  btnDisabled: { opacity: 0.55 },
});
