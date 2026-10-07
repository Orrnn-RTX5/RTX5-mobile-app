import { FastPressable as Pressable } from '../../ui/components/FastPressable';
/**
 * Trade Feature UI: BulkOperationScreen
 *
 * Confirm and run bulk close actions on matching open positions.
 */

import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePositionsState } from '../../state/positionsState';
import { useUserPreferences } from '../../state/userPreferences';
import { useIsDarkTheme } from '../../state/themeMode';
import { resolveTradingLoginString } from '../../state/tradingLogin';
import { positionsApi } from '../../api/positions';
import { appQueryClient } from '../../state/providers/AppProviders';
import { spacing } from '../../ui/theme/index';
import { useTheme } from '../../ui/theme/useTheme';
import { ThemeColors } from '../../ui/theme/glass';
import { fmt } from '../../utils/format';
import { safeRouterBack } from '../../utils/navigation';
import { useTranslation } from '../../i18n/useTranslation';
import { CRITICAL_TRADE_ACTION_MAX_LATENCY_MS } from '../../utils/actionLatency';
import { bulkModeLabel, filterPositionsForBulk } from './tradeFlow';
import { resolveLivePositionPnl } from './livePositionMetrics';
import { runBulkClose } from './bulkClose';
import {
  classifyTradingError,
  createFrontendTradingError,
  formatTradingErrorFeedback,
} from '../../api/tradingErrors';
import { useLiveSymbolQuotes } from '../../query/websocket';
import {
  resolveSessionQuoteActionAvailability,
  quoteActionBlockMessage,
  recordBlockedPriceAction,
  type QuoteActionAvailability,
} from '../../market/quoteIntegrity';
import {
  getFeedHealthRenderSnapshot,
  subscribeFeedHealth,
} from '../../market/feedHealthRuntime';
import {
  captureActiveBrokerSessionProvenance,
  isActiveBrokerSessionProvenanceCurrent,
} from '../../state/activeBrokerSession';
import { invalidateSessionQueryRoots } from '../../query/authenticatedQueryScope';
import { requestOrrnnDemoTradeAuth } from './tradeAuthPrompt';
import { blockInvestorTradeAction, useInvestorReadOnlySession } from '../../hooks/useInvestorReadOnlySession';

const CANVAS_DARK = '#121212';
const CARD_DARK = '#1E1E1E';
const DIVIDER_DARK = 'rgba(255,255,255,0.06)';
const PREVIEW_LIMIT = 8;

export function BulkOperationScreen() {
  const isScreenFocused = useIsFocused();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const [isRunning, setIsRunning] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState(false);
  const runningRef = useRef(false);
  const isDark = useIsDarkTheme();
  const T = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);
  const { t } = useTranslation();
  const investorReadOnly = useInvestorReadOnlySession();
  const retainedPositionsRef = useRef(usePositionsState.getState().positions);
  const positions = usePositionsState((state) => (
    isScreenFocused ? state.positions : retainedPositionsRef.current
  ));
  if (isScreenFocused) {
    retainedPositionsRef.current = positions;
  }
  const resolvedLogin = resolveTradingLoginString();
  const screenBg = isDark ? CANVAS_DARK : T.bg;

  const title = useMemo(() => {
    const rawTitle = bulkModeLabel(mode);
    const translated = t(rawTitle);
    if (translated !== rawTitle) return translated;
    const symbolTitle = /^Close (.+) Positions$/.exec(rawTitle);
    return symbolTitle
      ? t('Close {symbol} Positions').replace('{symbol}', symbolTitle[1])
      : translated;
  }, [mode, t]);

  const affectedPositions = useMemo(
    () => filterPositionsForBulk(positions, mode),
    [positions, mode]
  );
  const affectedSymbols = useMemo(
    () => Array.from(new Set(affectedPositions.map((position) => position.symbol))),
    [affectedPositions],
  );
  const quotes = useLiveSymbolQuotes(
    affectedSymbols,
    isScreenFocused && affectedSymbols.length > 0,
    0,
  );
  const retainedFeedHealthRef = useRef(getFeedHealthRenderSnapshot());
  const subscribeFocusedFeedHealth = useCallback(
    (listener: () => void) => (isScreenFocused ? subscribeFeedHealth(listener) : () => undefined),
    [isScreenFocused],
  );
  const getFocusedFeedHealthSnapshot = useCallback(
    () => (isScreenFocused ? getFeedHealthRenderSnapshot() : retainedFeedHealthRef.current),
    [isScreenFocused],
  );
  const feedHealth = useSyncExternalStore(
    subscribeFocusedFeedHealth,
    getFocusedFeedHealthSnapshot,
    getFocusedFeedHealthSnapshot,
  );
  if (isScreenFocused) {
    retainedFeedHealthRef.current = feedHealth;
  }
  const [quoteFreshnessNow, setQuoteFreshnessNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isScreenFocused || affectedSymbols.length === 0) return;
    const timer = setInterval(() => setQuoteFreshnessNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [affectedSymbols.length, isScreenFocused]);

  const resolveBulkQuoteBlock = useCallback((now = Date.now()): QuoteActionAvailability | null => {
    for (const position of affectedPositions) {
      const availability = resolveSessionQuoteActionAvailability(quotes[position.symbol], now);
      if (!availability.allowed) {
        return availability;
      }
    }
    return null;
  }, [affectedPositions, quotes]);
  const bulkQuoteBlock = useMemo(
    () => resolveBulkQuoteBlock(quoteFreshnessNow),
    [feedHealth, quoteFreshnessNow, resolveBulkQuoteBlock],
  );

  const totalPnl = useMemo(
    () => affectedPositions.reduce(
      (sum, position) => sum + resolveLivePositionPnl(position, quotes[position.symbol]),
      0,
    ),
    [affectedPositions, quotes],
  );
  const totalVolume = useMemo(
    () => affectedPositions.reduce((sum, position) => sum + (position.volume || 0), 0),
    [affectedPositions],
  );
  const symbolCount = useMemo(
    () => new Set(affectedPositions.map((position) => position.symbol)).size,
    [affectedPositions],
  );
  const extraPreviewCount = Math.max(0, affectedPositions.length - PREVIEW_LIMIT);

  const handleExecute = useCallback(async () => {
    if (requestOrrnnDemoTradeAuth({
      kind: 'bulk-action',
      bulkMode: mode === 'all'
        || mode === 'profitable'
        || mode === 'losing'
        || mode === 'buy'
        || mode === 'sell'
        ? mode
        : undefined,
    })) {
      return;
    }
    // Investor (read-only) login: the server would answer 403 INVESTOR_READ_ONLY.
    if (blockInvestorTradeAction(t)) return;
    if (runningRef.current || affectedPositions.length === 0) {
      return;
    }

    const currentQuoteBlock = resolveBulkQuoteBlock();
    if (currentQuoteBlock) {
      recordBlockedPriceAction('bulk_position_operation', currentQuoteBlock);
      setStatusError(true);
      setStatusMessage(
        formatTradingErrorFeedback(
          createFrontendTradingError(
            t('Market Data Unavailable'),
            t(quoteActionBlockMessage(currentQuoteBlock)),
          ),
        ),
      );
      return;
    }

    const accountDetails = useUserPreferences.getState().accountDetails;
    if (!accountDetails?.credentials?.accessToken) {
      setStatusError(true);
      setStatusMessage(
        formatTradingErrorFeedback(
          createFrontendTradingError(
            t('Authentication Error'),
            t('The app does not have a valid local trading session. Log in again before closing positions.'),
          ),
        ),
      );
      return;
    }
    const actionProvenance = captureActiveBrokerSessionProvenance();
    if (!actionProvenance) return;

    runningRef.current = true;
    setIsRunning(true);
    setStatusMessage(null);
    setStatusError(false);

    const snapshots = affectedPositions.map((position) => ({ ...position }));
    const state = usePositionsState.getState();
    for (const position of snapshots) {
      state.beginOptimisticClose(position.id);
    }

    safeRouterBack(router, '/(tabs)/trade');

    // The first close runs alone: a 503 ENGINE_CLOSE_UNAVAILABLE (or an
    // investor read-only login) stops the batch instead of firing N doomed
    // closes. Nothing here retries.
    const { results, stopError } = await runBulkClose(
      snapshots,
      (position) => positionsApi.closePosition(position.id),
    );
    if (!isActiveBrokerSessionProvenanceCurrent(actionProvenance)) {
      runningRef.current = false;
      return;
    }

    const latest = usePositionsState.getState();
    let failed = 0;
    results.forEach((result, index) => {
      const snapshot = snapshots[index];
      if (result.status === 'fulfilled') {
        latest.finishOptimisticClose(snapshot.id);
      } else {
        failed += 1;
        latest.rollbackOptimisticClose(snapshot);
      }
    });

    void invalidateSessionQueryRoots(
      appQueryClient,
      actionProvenance.cacheNamespace,
      ['positionHistory', 'accountDeals', 'deals', 'positions', 'ordersByLogin', 'accountSummary', 'transactions'],
    );

    if (resolvedLogin) {
      void latest.refreshPositions(resolvedLogin);
    }

    if (stopError) {
      const feedback = classifyTradingError(stopError, { action: 'close-position' });
      Alert.alert(feedback.title, t(feedback.message));
    } else if (failed > 0) {
      const feedback = classifyTradingError(
        new Error(`${failed} of ${snapshots.length} closes failed`),
        { action: 'close-position' },
      );
      Alert.alert(feedback.title, t('Some positions could not be closed. Check Trade and try again.'));
    }

    runningRef.current = false;
    setIsRunning(false);
  }, [affectedPositions, mode, resolveBulkQuoteBlock, resolvedLogin, t]);

  if (!isScreenFocused) {
    return <View style={[styles.root, { backgroundColor: screenBg }]} />;
  }

  return (
    <View style={[styles.root, { backgroundColor: screenBg, paddingLeft: insets.left, paddingRight: insets.right }]}>
      <View style={{ height: insets.top, backgroundColor: screenBg }} />

      <View style={styles.customHeader}>
        <Pressable
          onPress={() => safeRouterBack(router, '/(tabs)/trade')}
          hitSlop={16}
          style={styles.headerBtn}
          activateOnPressIn
          latencyLabel="bulk.back"
          unstable_pressDelay={0}
        >
          <Ionicons name="arrow-back" size={24} color={T.text} />
        </Pressable>

        <View style={styles.headerTitleWrap} pointerEvents="none">
          <Text
            style={[styles.headerTitle, { color: T.text }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {title}
          </Text>
        </View>

        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        canCancelContentTouches={Platform.OS === 'ios'}
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.lg },
        ]}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subTitle}>{t('Review positions before closing')}</Text>

        <View style={styles.summaryCard}>
          <SummaryRow
            label={t('Affected Positions')}
            value={String(affectedPositions.length)}
            styles={styles}
            T={T}
          />
          <SummaryRow
            label={t('Symbols')}
            value={String(symbolCount)}
            styles={styles}
            T={T}
            border
          />
          <SummaryRow
            label={t('Total Volume')}
            value={totalVolume.toFixed(2)}
            styles={styles}
            T={T}
            border
          />
          <SummaryRow
            label={t('Floating P/L')}
            value={fmt.pnl(totalPnl)}
            styles={styles}
            T={T}
            border
            danger={totalPnl < 0}
            positive={totalPnl > 0}
          />
        </View>

        <Text style={styles.sectionLabel}>{t('Positions')}</Text>
        <View style={styles.previewCard}>
          {affectedPositions.slice(0, PREVIEW_LIMIT).map((position, index) => {
            const livePnl = resolveLivePositionPnl(position, quotes[position.symbol]);
            const isBuy = position.side === 'buy';
            return (
              <View
                key={position.id}
                style={[styles.previewRow, index !== 0 && styles.previewRowBorder]}
              >
                <View style={styles.previewLeft}>
                  <Text style={styles.ticket}>#{position.id}</Text>
                  <View style={styles.symbolLine}>
                    <Text style={styles.symbolText}>{position.symbol.replace(/\//g, '')}</Text>
                    <View style={[styles.sideChip, isBuy ? styles.sideChipBuy : styles.sideChipSell]}>
                      <Text style={[styles.sideChipText, isBuy ? styles.sideTextBuy : styles.sideTextSell]}>
                        {position.side}
                      </Text>
                    </View>
                    <Text style={styles.volumeText}>{(position.volume || 0).toFixed(2)}</Text>
                  </View>
                </View>
                <Text style={[styles.previewPnl, livePnl < 0 ? styles.danger : livePnl > 0 ? styles.positive : null]}>
                  {fmt.pnl(livePnl)}
                </Text>
              </View>
            );
          })}

          {extraPreviewCount > 0 ? (
            <Text style={styles.moreText}>
              {t('+{count} more').replace('{count}', String(extraPreviewCount))}
            </Text>
          ) : null}

          {affectedPositions.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="layers-outline" size={28} color={T.textMuted} />
              <Text style={styles.emptyText}>{t('No positions match this operation.')}</Text>
            </View>
          ) : null}
        </View>

        {statusMessage ? (
          <View style={[styles.statusBox, statusError ? styles.statusBoxError : styles.statusBoxSuccess]}>
            <Text style={[styles.statusText, statusError ? styles.statusTextError : styles.statusTextSuccess]}>
              {statusMessage}
            </Text>
          </View>
        ) : bulkQuoteBlock && affectedPositions.length > 0 ? (
          <View style={[styles.statusBox, styles.statusBoxError]}>
            <Text style={[styles.statusText, styles.statusTextError]}>
              {t(quoteActionBlockMessage(bulkQuoteBlock))}
            </Text>
          </View>
        ) : null}

        <Pressable
          style={[
            styles.executeButton,
            (investorReadOnly || affectedPositions.length === 0 || isRunning || Boolean(bulkQuoteBlock)) && styles.executeDisabled,
          ]}
          onPress={() => { void handleExecute(); }}
          disabled={investorReadOnly || affectedPositions.length === 0 || isRunning || Boolean(bulkQuoteBlock)}
          activateOnPressIn
          latencyLabel="bulk.execute"
          latencyBudgetMs={CRITICAL_TRADE_ACTION_MAX_LATENCY_MS}
          unstable_pressDelay={0}
        >
          {isRunning ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.executeText}>
              {affectedPositions.length === 0
                ? t('No positions to close')
                : t('Close {count} positions').replace('{count}', String(affectedPositions.length))}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

function SummaryRow({
  label,
  value,
  danger = false,
  positive = false,
  border = false,
  styles,
  T,
}: {
  label: string;
  value: string;
  danger?: boolean;
  positive?: boolean;
  border?: boolean;
  styles: ReturnType<typeof makeStyles>;
  T: ThemeColors;
}) {
  return (
    <View style={[styles.summaryRow, border && styles.summaryRowBorder]}>
      <Text style={[styles.summaryLabel, { color: T.textMuted }]}>{label}</Text>
      <Text
        style={[
          styles.summaryValue,
          { color: T.text },
          danger && styles.danger,
          positive && styles.positive,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const makeStyles = (T: ThemeColors, isDark: boolean) => StyleSheet.create({
  root: { flex: 1 },
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: isDark ? DIVIDER_DARK : T.borderSubtle,
  },
  headerBtn: {
    width: 44,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    paddingHorizontal: 8,
  },
  headerTitle: {
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '500',
    letterSpacing: 0.15,
  },
  scrollView: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingTop: 12 },
  subTitle: {
    color: T.textMuted,
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 14,
    paddingHorizontal: spacing.md,
  },
  summaryCard: {
    marginHorizontal: spacing.md,
    marginBottom: 18,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: isDark ? DIVIDER_DARK : T.borderSubtle,
    backgroundColor: isDark ? CARD_DARK : T.glass2,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  summaryRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: isDark ? DIVIDER_DARK : T.borderSubtle,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  sectionLabel: {
    marginHorizontal: spacing.md,
    marginBottom: 8,
    color: T.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  previewCard: {
    marginHorizontal: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: isDark ? DIVIDER_DARK : T.borderSubtle,
    backgroundColor: isDark ? CARD_DARK : T.glass2,
    overflow: 'hidden',
  },
  previewRow: {
    paddingHorizontal: 16,
    paddingVertical: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  previewRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: isDark ? DIVIDER_DARK : T.borderSubtle,
  },
  previewLeft: { flex: 1, minWidth: 0 },
  ticket: {
    fontSize: 11,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
    color: T.textMuted,
    marginBottom: 4,
  },
  symbolLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  symbolText: {
    fontSize: 15,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: T.text,
  },
  sideChip: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sideChipBuy: { backgroundColor: 'rgba(37,99,235,0.12)' },
  sideChipSell: { backgroundColor: 'rgba(220,38,38,0.12)' },
  sideChipText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'lowercase',
  },
  sideTextBuy: { color: T.trading.buy.primary },
  sideTextSell: { color: T.trading.sell.primary },
  volumeText: {
    fontSize: 13,
    fontWeight: '600',
    color: T.textMuted,
    fontVariant: ['tabular-nums'],
  },
  previewPnl: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    color: T.text,
  },
  moreText: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    textAlign: 'center',
    color: T.textMuted,
    fontSize: 13,
    fontWeight: '600',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: isDark ? DIVIDER_DARK : T.borderSubtle,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: spacing.md,
    gap: 10,
  },
  emptyText: {
    textAlign: 'center',
    color: T.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
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
  executeButton: {
    marginHorizontal: spacing.md,
    marginTop: spacing.xl,
    borderRadius: 14,
    backgroundColor: T.trading.sell.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
  },
  executeDisabled: {
    opacity: 0.45,
  },
  executeText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  danger: {
    color: T.trading.loss,
  },
  positive: {
    color: T.trading.profit,
  },
});
