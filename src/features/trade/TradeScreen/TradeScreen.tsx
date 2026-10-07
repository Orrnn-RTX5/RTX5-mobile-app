/**
 * Main active trading overview screen (aka the 'Trade' tab).
 *
 * Displays:
 * 1. Global account summary (balance, equity, margin) derived from the real-time WebSocket.
 * 2. Flat list of all Open Positions and Pending Orders.
 * 3. Individual P&L per trade, plus aggregate floating P&L.
 *
 * It relies on `usePositionsState` for synchronous, optimistic UI updates to ensure
 * lightning-fast feedback when order states change locally without waiting for server-side replica sync.
 */
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { router } from 'expo-router';
import React, { useMemo, useEffect, useCallback, useRef, useState } from 'react';
import { Alert, Text, View, FlatList, Platform } from 'react-native';
import { useShallow } from 'zustand/shallow';
import { Screen } from '../../../ui/components/Screen';
import { AppHeader } from '../../../ui/components/AppHeader';
import { useTranslation } from '../../../i18n/useTranslation';
import { TradePositionRow } from '../../../ui/components/TradePositionRow';
import { FastPressable } from '../../../ui/components/FastPressable';
import { PositionItem } from '../../../dev/mock/tradingData';
import { useUserPreferences } from '../../../state/userPreferences';
import { useIsDarkTheme } from '../../../state/themeMode';
import { usePositionsState } from '../../../state/positionsState';
import { useTradingState } from '../../../state/tradingState';
import { useResolvedTradingLogin } from '../../../state/tradingLogin';
import { useAccountSummary } from '../../../query/account';
import { isRenderablePositionSymbol } from '../../../state/positionsMapper';
import { buildOpenPositionsCacheSignature, dedupePositionsById } from '../../../state/positionsState.helpers';
import { useTheme } from '../../../ui/theme/useTheme';
import { useUIState } from '../../../state/uiState';
import { getTradingErrorOriginLabel } from '../../../api/tradingErrors';
import { prefetchOrderTicketData } from '../../../utils/navigationPrefetch';
import { runImmediateAction } from '../../../utils/actionLatency';
import { useDeferredActiveFlag } from '../../../hooks/useDeferredActiveFlag';
import { useNextFrameValue } from '../../../hooks/useNextFrameValue';
import { showTradePositionAction } from '../tradePositionActionHostController';
import { requestOrrnnDemoTradeAuth } from '../tradeAuthPrompt';
import { getActiveSltpUnavailableMessage, isExistingPositionModifyBackendLocked, SLTP_COMING_SOON_TITLE } from '../tradeBackendCapabilities';
import { TradeSummaryDetailsHeader, TradeSummaryHeader } from './SummaryHeader';
import { makeTradeScreenStyles } from './styles';
import { captureActiveBrokerSession, getActiveBrokerSessionIdentity, isActiveBrokerSessionCurrent } from '../../../state/activeBrokerSession';
import { getFeedHealthRenderSnapshot, requestFeedHealthRetry, subscribeFeedHealth } from '../../../market/feedHealthRuntime';
import { feedHealthStateMatchesIdentity } from '../../../market/feedHealthState';
import { buildFeedHealthBannerModel } from '../../../market/feedHealthPresentation';
import { quotesWsService } from '../../../api/ws/quotesSocket';
import { useInvestorReadOnlySession } from '../../../hooks/useInvestorReadOnlySession';
import { useResponsiveLayout } from '../../../ui/layout/useResponsiveLayout';
import { shouldScrollTradingSummary } from '../summaryViewport';

// Render only the first screenful of trade rows first. This prevents 15-30 open
// positions from all mounting and subscribing to live quotes before the user scrolls.
const TRADE_INITIAL_POSITION_RENDER_COUNT = 5;
const TRADE_POSITION_RENDER_BATCH_SIZE = 5;
const TRADE_POSITION_VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 10 };
const TRADE_BULK_ACTION_ICON_LIGHT = '#4F535C';
const TRADE_BULK_ACTION_ICON_DARK = '#EEF1F5';
const TRADE_POSITION_CLOSE_ACTION_LIGHT = '#000000';
const TRADE_POSITION_CLOSE_ACTION_DARK = '#EEF1F5';
const TRADE_POSITION_CLOSE_ACTION_FONT_WEIGHT = '400';
// Live WS quote subscriptions start as soon as Trade is focused, MT5-style.
// The heavier backend ledger refresh still waits for first paint below.
// MT5 shows cached rows immediately, then keeps the live trade ledger current.
// Start the backend verification as soon as the first paint lands and keep a
// focused fallback poll for new/closed positions when websocket events lag.
const TRADE_SCREEN_FETCH_DELAY_MS = 0;
const TRADE_SCREEN_REFRESH_INTERVAL_MS = 3000;

function areStringSetsEqual(left: Set<string>, right: Set<string>) {
  if (left.size !== right.size) {
    return false;
  }

  for (const item of left) {
    if (!right.has(item)) {
      return false;
    }
  }

  return true;
}

/**
 * Main screen for the Trade tab, displaying the user's active open positions, pending orders, and real-time equity/margin summary.
 */
const TradeScreenInner = React.memo(function TradeScreenInner({
  isScreenFocused,
  isLiveScreenFocused,
}: {
  isScreenFocused: boolean;
  isLiveScreenFocused: boolean;
}) {
  const [viewablePositionIds, setViewablePositionIds] = useState<Set<string>>(() => new Set());
  const T = useTheme();
  const { t } = useTranslation();
  const isDark = useIsDarkTheme();
  const scrollSummary = shouldScrollTradingSummary(useResponsiveLayout());
  const s = useMemo(() => makeTradeScreenStyles(T, isDark), [T, isDark]);
  const bulkActionIconColor = isDark ? TRADE_BULK_ACTION_ICON_DARK : TRADE_BULK_ACTION_ICON_LIGHT;
  const positionCloseActionColor = isDark ? TRADE_POSITION_CLOSE_ACTION_DARK : TRADE_POSITION_CLOSE_ACTION_LIGHT;

  const setChartSymbol = useUserPreferences((s) => s.setChartSymbol);
  const activeBrokerLabel = useUserPreferences((state) => state.accountDetails?.server || state.brokerId);
  const showTradeActionSheet = useUIState((st) => st.showTradeActionSheet);
  // Investor (read-only) logins get no close/modify/trade/bulk actions.
  const investorReadOnly = useInvestorReadOnlySession();
  const retainedFeedHealthRef = useRef(getFeedHealthRenderSnapshot());
  const subscribeFocusedFeedHealth = useCallback((listener: () => void) => (isLiveScreenFocused ? subscribeFeedHealth(listener) : () => undefined), [isLiveScreenFocused]);
  const getFocusedFeedHealthSnapshot = useCallback(() => (isLiveScreenFocused ? getFeedHealthRenderSnapshot() : retainedFeedHealthRef.current), [isLiveScreenFocused]);
  const feedHealth = React.useSyncExternalStore(subscribeFocusedFeedHealth, getFocusedFeedHealthSnapshot, getFocusedFeedHealthSnapshot);
  if (isLiveScreenFocused) {
    retainedFeedHealthRef.current = feedHealth;
  }
  const activeCapture = captureActiveBrokerSession();
  const activeFeedIdentity = activeCapture ? getActiveBrokerSessionIdentity(activeCapture.session) : null;
  const feedHealthModel = useMemo(() => {
    if (!activeFeedIdentity || !feedHealthStateMatchesIdentity(feedHealth, activeFeedIdentity)) {
      return null;
    }
    return buildFeedHealthBannerModel(feedHealth, activeBrokerLabel || activeFeedIdentity.brokerId);
  }, [activeBrokerLabel, activeFeedIdentity, feedHealth]);
  const retryActiveFeed = useCallback(() => {
    if (!activeFeedIdentity || !isActiveBrokerSessionCurrent(activeFeedIdentity) || !requestFeedHealthRetry(activeFeedIdentity)) {
      return;
    }
    quotesWsService.connect();
  }, [activeFeedIdentity]);

  // Fast tabs reveal this retained native layer before React Navigation commits
  // focus. Keep opens, closes, cache hydration, and account changes rendered
  // offscreen so that reveal is complete, while ignoring price/P&L-only arrays.
  const tradeLedgerRenderState = usePositionsState(
    useShallow((state) => ({
      positionsSignature: buildOpenPositionsCacheSignature(state.positions),
      lastFetchLogin: state.lastFetchLogin,
      hydratedLogin: state.hydratedLogin,
      lastError: state.lastError,
    })),
  );
  const { positionsSignature, lastFetchLogin, hydratedLogin, lastError } = tradeLedgerRenderState;
  const positions = useMemo(
    () => usePositionsState.getState().positions,
    [hydratedLogin, isScreenFocused, lastFetchLogin, positionsSignature],
  );
  // Actions are stable Zustand members; keeping them in separate selectors
  // prevents the hidden Trade tree from following unrelated store mutations.
  const refreshPositions = usePositionsState((state) => state.refreshPositions);
  const hydrateCachedPositions = usePositionsState((state) => state.hydrateCachedPositions);
  const primePositionSnapshot = usePositionsState((state) => state.primePositionSnapshot);
  // Use the reactive login hook here. If the Trade tab is already mounted while
  // login state hydrates, this rerenders immediately and starts cache/fetch work.
  const resolvedLogin = useResolvedTradingLogin();
  const accountLoginString = resolvedLogin !== undefined ? String(resolvedLogin) : undefined;

  const fetchPositions = useCallback(async () => {
    if (!resolvedLogin) {
      return;
    }

    await refreshPositions(String(resolvedLogin));
  }, [refreshPositions, resolvedLogin]);

  // Cache hydration is cheap and lets the Trade tab show the last known real
  // positions immediately, while the focused screen fetch below verifies them.
  useEffect(() => {
    if (resolvedLogin) {
      void hydrateCachedPositions(String(resolvedLogin));
    }
  }, [hydrateCachedPositions, resolvedLogin]);

  const [firstPaintReady, setFirstPaintReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let frameId: number | null = null;
    const markReady = () => {
      if (!cancelled) {
        setFirstPaintReady(true);
      }
    };

    if (typeof globalThis.requestAnimationFrame === 'function') {
      frameId = globalThis.requestAnimationFrame(markReady);
    } else {
      const timerId = setTimeout(markReady, 16);
      return () => {
        cancelled = true;
        clearTimeout(timerId);
      };
    }

    return () => {
      cancelled = true;
      if (frameId !== null) {
        globalThis.cancelAnimationFrame?.(frameId);
      }
    };
  }, []);

  // Live quotes should not wait behind the REST ledger work. The rows need the
  // websocket bid/ask stream as soon as the Trade tab is focused.
  // Keep the heavy Trade tree independent from drawer visibility. Subscribing
  // this screen to sidebarOpen made every menu tap re-render all position rows
  // before navigation could paint. Native-driver drawer motion does not need to
  // pause the already-focused quote stream or its deferred ledger refresh.
  const tradeLiveActive = isLiveScreenFocused;
  const tradeFetchActive = useDeferredActiveFlag(isScreenFocused && firstPaintReady, TRADE_SCREEN_FETCH_DELAY_MS);

  // Fetch only after the route has painted once so sidebar navigation is visual
  // first, then keep a short MT5-style fallback poll while Trade remains open.
  useEffect(() => {
    if (!tradeFetchActive || !resolvedLogin) {
      return undefined;
    }

    let cancelled = false;
    const refreshVisibleTradeLedger = () => {
      if (!cancelled) {
        void fetchPositions();
      }
    };

    refreshVisibleTradeLedger();
    const refreshIntervalId = setInterval(refreshVisibleTradeLedger, TRADE_SCREEN_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(refreshIntervalId);
    };
  }, [tradeFetchActive, resolvedLogin, fetchPositions]);

  const positionRowsActive = tradeLiveActive;
  const { data: accountSummary } = useAccountSummary(accountLoginString, {
    enabled: tradeFetchActive && !!accountLoginString,
  });
  const accountLeverage = typeof accountSummary?.leverage === 'number' && Number.isFinite(accountSummary.leverage) && accountSummary.leverage > 0 ? accountSummary.leverage : null;

  const pnlCurrency = useTradingState((state: any) => state.account?.currency || 'USD');
  const renderablePositions = useMemo(() => dedupePositionsById(positions.filter((position) => isRenderablePositionSymbol(position.symbol))), [positions]);
  const totalVolume = useMemo(
    () => renderablePositions.reduce((sum, p) => sum + (p.volume || 0), 0),
    [renderablePositions],
  );
  const positionsListSignature = useMemo(() => renderablePositions.map((position) => position.id).join('|'), [renderablePositions]);
  const rowActivationKey = useMemo(
    // FlatList rows are memoized, so this key tells them when their "live row"
    // status changed after scrolling.
    () => `${positionRowsActive ? '1' : '0'}:${Array.from(viewablePositionIds).sort().join('|')}`,
    [positionRowsActive, viewablePositionIds],
  );
  const flatListExtraData = useMemo(
    () => ({
      accountLeverage,
      rowActivationKey,
      positionsListSignature,
      positionCount: renderablePositions.length,
    }),
    [accountLeverage, rowActivationKey, positionsListSignature, renderablePositions.length],
  );

  /**
   * Callback to update which position rows are currently visible on screen, typically used for performance optimization in long lists.
   */
  const handleViewablePositionRowsChanged = useRef(({ viewableItems }: { viewableItems: Array<{ item?: PositionItem | null }> }) => {
    // FlatList calls this as rows enter/leave the viewport. We store only the
    // visible ticket ids so newly visible rows can start live quote updates.
    const nextIds = new Set<string>();
    viewableItems.forEach(({ item }) => {
      if (item?.id !== undefined && item.id !== null) {
        nextIds.add(String(item.id));
      }
    });

    setViewablePositionIds((currentIds) => (areStringSetsEqual(currentIds, nextIds) ? currentIds : nextIds));
  }).current;

  const navigateToBulkMode = useCallback((mode: 'all' | 'profitable' | 'losing' | 'buy' | 'sell') => {
    if (requestOrrnnDemoTradeAuth({ kind: 'bulk-action', bulkMode: mode })) {
      return;
    }
    router.push({ pathname: '/trade/bulk', params: { mode } });
  }, []);

  const bulkActionSheetConfig = useMemo<Parameters<typeof showTradeActionSheet>[0]>(() => {
    const actions: Parameters<typeof showTradeActionSheet>[0]['actions'] = [
      {
        icon: <Ionicons name="close-circle-outline" size={20} color={bulkActionIconColor} />,
        label: t('Close All Positions'),
        onPress: () => navigateToBulkMode('all'),
      },
      {
        icon: <Ionicons name="trending-up-outline" size={20} color={bulkActionIconColor} />,
        label: t('Close Profitable Positions'),
        onPress: () => navigateToBulkMode('profitable'),
      },
      {
        icon: <Ionicons name="trending-down-outline" size={20} color={bulkActionIconColor} />,
        label: t('Close Losing Positions'),
        onPress: () => navigateToBulkMode('losing'),
      },
      {
        icon: <Ionicons name="arrow-up-circle-outline" size={20} color={bulkActionIconColor} />,
        label: t('Close Buy Positions'),
        onPress: () => navigateToBulkMode('buy'),
      },
      {
        icon: <Ionicons name="arrow-down-circle-outline" size={20} color={bulkActionIconColor} />,
        label: t('Close Sell Positions'),
        onPress: () => navigateToBulkMode('sell'),
      },
    ];

    return {
      presentation: 'mt5Plain',
      showActionIcons: true,
      detent: 'auto',
      instantOpen: true,
      entryMotion: 'mt5Slide',
      runActionAfterClose: false,
      actions,
    };
  }, [bulkActionIconColor, navigateToBulkMode, showTradeActionSheet, t]);

  const showBulkSheet = useCallback(() => {
    if (investorReadOnly) return;
    runImmediateAction('trade.bulkSheet.open', () => showTradeActionSheet(bulkActionSheetConfig));
  }, [bulkActionSheetConfig, investorReadOnly, showTradeActionSheet]);

  const showCloseSellPositions = useCallback(() => {
    if (investorReadOnly) return;
    navigateToBulkMode('sell');
  }, [investorReadOnly, navigateToBulkMode]);

  const preloadTradeActionSheet = useUIState((s) => s.preloadScopedActionSheet);
  useEffect(() => {
    if (!isScreenFocused) {
      return;
    }
    preloadTradeActionSheet('trade', bulkActionSheetConfig);
  }, [bulkActionSheetConfig, isScreenFocused, preloadTradeActionSheet]);

  const showPositionSheet = useCallback(
    (item: PositionItem) => {
      runImmediateAction('trade.positionSheet.open', () =>
        showTradeActionSheet({
          presentation: 'mt5Plain',
          showActionIcons: true,
          detent: 'auto',
          instantOpen: true,
          runActionAfterClose: false,
          actions: [
            ...(investorReadOnly
              ? []
              : ([
                  {
                    icon: <Ionicons name="close-circle-outline" size={20} color={positionCloseActionColor} />,
                    label: t('Close position'),
                    textColor: positionCloseActionColor,
                    textFontWeight: TRADE_POSITION_CLOSE_ACTION_FONT_WEIGHT,
                    onPress: () => {
                      if (
                        requestOrrnnDemoTradeAuth({
                          kind: 'position-action',
                          symbol: item.symbol,
                          action: 'close',
                        })
                      ) {
                        return;
                      }
                      primePositionSnapshot(item);
                      showTradePositionAction('close', item.id);
                    },
                  },
                  {
                    icon: <Ionicons name="create-outline" size={20} color={T.textMuted} />,
                    label: t('Modify position'),
                    activateOnPressIn: true,
                    onPress: () => {
                      if (
                        requestOrrnnDemoTradeAuth({
                          kind: 'position-action',
                          symbol: item.symbol,
                          action: 'modify',
                        })
                      ) {
                        return;
                      }
                      if (isExistingPositionModifyBackendLocked()) {
                        Alert.alert(t(SLTP_COMING_SOON_TITLE), t(getActiveSltpUnavailableMessage()));
                        return;
                      }
                      primePositionSnapshot(item);
                      showTradePositionAction('modify', item.id);
                    },
                  },
                  {
                    icon: <Ionicons name="swap-horizontal-outline" size={20} color={T.textMuted} />,
                    label: t('Trade'),
                    onPress: () => {
                      if (
                        requestOrrnnDemoTradeAuth({
                          kind: 'order-ticket',
                          symbol: item.symbol,
                          origin: 'trade',
                        })
                      ) {
                        return;
                      }
                      prefetchOrderTicketData(String(resolvedLogin ?? ''), item.symbol);
                      router.push({
                        pathname: '/trade/order-ticket',
                        params: { symbol: item.symbol },
                      });
                    },
                  },
                ] satisfies Parameters<typeof showTradeActionSheet>[0]['actions'])),
            {
              icon: <Ionicons name="analytics-outline" size={20} color={T.textMuted} />,
              label: t('Chart'),
              onPress: () => {
                setChartSymbol(item.symbol);
                router.push('/(tabs)/chart');
              },
            },
          ],
        }),
      );
    },
    [T.textMuted, investorReadOnly, positionCloseActionColor, primePositionSnapshot, resolvedLogin, setChartSymbol, showTradeActionSheet, t],
  );

  const renderPositionRow = useCallback(
    ({ item, index }: { item: PositionItem; index: number }) => {
      // Keep the first visible batch live immediately; below-fold rows only start
      // quote subscriptions after FlatList reports that they are coming on screen.
      const rowActive = positionRowsActive && (index < TRADE_INITIAL_POSITION_RENDER_COUNT || viewablePositionIds.has(String(item.id)));

      return <TradePositionRow item={item} onPress={showPositionSheet} onLongPress={showPositionSheet} onBulkPress={showBulkSheet} onCloseSellPress={showCloseSellPositions} pnlCurrency={pnlCurrency} active={rowActive} accountLeverage={accountLeverage} />;
    },
    [accountLeverage, pnlCurrency, positionRowsActive, showBulkSheet, showCloseSellPositions, showPositionSheet, viewablePositionIds],
  );

  return (
    <Screen noBottomInset style={s.screen}>
      <AppHeader title={t('Trade')} noBorder />
      {feedHealthModel?.visible ? (
        <View accessibilityRole="alert" style={[s.marketDataBanner, feedHealthModel.tone === 'critical' ? s.marketDataBannerCritical : s.marketDataBannerWarning]}>
          <Ionicons name={feedHealthModel.tone === 'critical' ? 'cloud-offline-outline' : 'time-outline'} size={18} color={feedHealthModel.tone === 'critical' ? '#EF4444' : '#F59E0B'} />
          <View style={s.marketDataBannerCopy}>
            <Text style={[s.marketDataBannerTitle, { color: T.text }]}>
              {t(feedHealthModel.title)} · {feedHealthModel.brokerLabel}
            </Text>
            <Text style={[s.marketDataBannerReason, { color: T.textSub }]}>{t(feedHealthModel.reasonLabel)}</Text>
            <Text style={[s.marketDataBannerLastSuccess, { color: T.textMuted }]}>
              {t('Last success')}: {feedHealthModel.lastSuccessAt ? new Date(feedHealthModel.lastSuccessAt).toLocaleString() : t('No successful live update yet')}
            </Text>
          </View>
          {feedHealthModel.canRetry ? (
            <FastPressable accessibilityRole="button" accessibilityLabel={t('Retry market data')} onPress={retryActiveFeed} activateOnPressIn latencyLabel="trade.feedHealth.retry" style={s.marketDataRetry}>
              <Text style={s.marketDataRetryText}>{t('Retry')}</Text>
            </FastPressable>
          ) : null}
        </View>
      ) : null}
      <TradeSummaryHeader positions={renderablePositions} hydratedLogin={hydratedLogin} resolvedLogin={resolvedLogin} s={s} T={T} isDark={isDark} active={tradeLiveActive} restAccountSummary={accountSummary} scrollSummary={scrollSummary}>
        <FlatList
          keyboardShouldPersistTaps="always"
          canCancelContentTouches={Platform.OS === 'ios'}
          style={s.list}
          data={renderablePositions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={TRADE_INITIAL_POSITION_RENDER_COUNT}
          maxToRenderPerBatch={TRADE_POSITION_RENDER_BATCH_SIZE}
          windowSize={2}
          updateCellsBatchingPeriod={80}
          removeClippedSubviews={Platform.OS === 'android'}
          viewabilityConfig={TRADE_POSITION_VIEWABILITY_CONFIG}
          onViewableItemsChanged={handleViewablePositionRowsChanged}
          scrollEventThrottle={16}
          extraData={flatListExtraData}
          renderItem={renderPositionRow}
          ListHeaderComponent={
            <TradeSummaryDetailsHeader positions={renderablePositions} s={s} T={T} isDark={isDark} totalVolume={totalVolume} onBulkPress={showBulkSheet} scrollSummary={scrollSummary} />
          }
          ListEmptyComponent={
            <View style={s.emptyState}>
              <Ionicons name="receipt-outline" size={48} color={T.textDimmed} />
              <Text style={[s.emptyTitle, { color: T.textMuted }]}>{t('No open positions')}</Text>
              <Text style={[s.emptySub, { color: T.textDimmed }]}>{lastError ? `${t('Account')} ${lastFetchLogin ?? resolvedLogin ?? t('unknown')}: ${getTradingErrorOriginLabel(lastError.origin)}. ${lastError.title}: ${lastError.message}` : resolvedLogin ? `${t('Account')} ${resolvedLogin}: ${t('your active trades will appear here')}` : t('Waiting for active trading account')}</Text>
            </View>
          }
          ListFooterComponent={renderablePositions.length > 0 ? <>{/* Top Exposures */}</> : null}
        />
      </TradeSummaryHeader>
    </Screen>
  );
});

export function TradeScreen() {
  const isScreenFocused = useIsFocused();
  const isLiveScreenFocused = useNextFrameValue(isScreenFocused);
  return <TradeScreenInner isScreenFocused={isScreenFocused} isLiveScreenFocused={isLiveScreenFocused} />;
}
