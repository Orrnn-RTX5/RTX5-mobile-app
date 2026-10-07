import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, View, Platform } from 'react-native';
import type { QuoteItem } from '../../../dev/mock/tradingData';
import { useMarketData } from '../../../query/websocket';
import { useIsDarkTheme } from '../../../state/themeMode';
import { useUserPreferences } from '../../../state/userPreferences';
import {
  captureActiveBrokerSessionProvenance,
  isActiveBrokerSessionProvenanceCurrent,
} from '../../../state/activeBrokerSession';
import { useTheme } from '../../../ui/theme/useTheme';
import { usePlaceOrderMutation } from '../../../query/orders';
import { useInstrumentMeta } from '../../../query/instruments';
import { useAccountSummary } from '../../../query/account';
import { useLatestDailyCandle } from '../../../domain/candles/query/candles';
import { resolveTradingLogin, resolveTradingLoginString, useResolvedTradingLogin } from '../../../state/tradingLogin';
import { fmt } from '../../../utils/format';
import { calculateMarketSentiment } from '../../../domain/marketSentiment';
import { normalizeSymbol } from '../../../domain/symbols';
import {
  quoteActionBlockMessage,
  recordBlockedPriceAction,
  resolveSessionQuoteActionAvailability,
} from '../../../market/quoteIntegrity';
import { classifyTradingError, createFrontendTradingError } from '../../../api/tradingErrors';
import { resolveBrokerExecutionEvidence } from '../../../api/orders/executionEvidence';
import {
  safeRouterBack,
  scheduleBackNavigationAfterVisualFrame,
} from '../../../utils/navigation';
import { CRITICAL_TRADE_ACTION_MAX_LATENCY_MS } from '../../../utils/actionLatency';
import {
  prefetchChartSelectionHistory,
  prefetchOrderTicketData,
} from '../../../utils/navigationPrefetch';
import { useTranslation } from '../../../i18n/useTranslation';
import { dCol, getMeta, normalizeTradingSessions, sgn } from './instrumentMeta';
import { MetricPill, MomentumBar, RangeBar, Row, Section } from './SubComponents';
import { makeSymbolDetailsStyles } from './styles';
import { QuoteInfoLaunchShell } from '../QuoteInfoLaunchShell';
import {
  beginQuoteInfoBackCover,
  completeQuoteInfoLaunch,
  markQuoteInfoLaunchCovered,
  quoteInfoLaunchController,
  scheduleQuoteInfoBackCoverRemoval,
} from '../quoteInfoLaunchController';
import { useDeferredRouteContentReady } from '../../../ui/components/DeferredRouteMount';
import { BrokerFeedHealthBanner } from '../../../market/BrokerFeedHealthBanner';
import { requestOrrnnDemoTradeAuth } from '../../trade/tradeAuthPrompt';
import { markTradeIntent } from '../../../utils/tradeIntent';

const formatDetailNumber = (value: number | null | undefined) => {
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
};

const resolveDetailNumber = (...values: Array<number | null | undefined>) =>
  values.find((value): value is number => typeof value === 'number' && Number.isFinite(value));

const formatSwapValue = (value: number | null | undefined) => {
  const formatted = formatDetailNumber(value);
  return formatted === '--' ? formatted : `${formatted} pts`;
};

const formatDetailPrice = (value: number | null | undefined, digits: number) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? fmt.price(value, digits)
    : '--';

export function SymbolDetailsScreen() {
  const isScreenFocused = useIsFocused();
  const launchSnapshot = useSyncExternalStore(
    quoteInfoLaunchController.subscribe,
    quoteInfoLaunchController.getSnapshot,
    quoteInfoLaunchController.getSnapshot,
  );
  // Optimistic cover already hides mount cost — mount the body on the same
  // focus frame so markCovered can swap as soon as the interactive tree paints.
  // Keep readiness sticky after markCovered removes the cover, so the body is
  // not torn down while the deferred 2-frame timer is still catching up.
  const launchCovers = launchSnapshot.visible
    && launchSnapshot.destination === 'properties';
  const deferredReady = useDeferredRouteContentReady(0, isScreenFocused);
  const bodyMountedRef = useRef(false);
  if (!isScreenFocused) {
    bodyMountedRef.current = false;
  } else if (deferredReady || launchCovers) {
    bodyMountedRef.current = true;
  }
  const contentReady = isScreenFocused && bodyMountedRef.current;
  const { symbol: routeSymbol = 'BTCUSD' } = useLocalSearchParams<{ symbol?: string }>();
  const symbol = useMemo(() => normalizeSymbol(routeSymbol), [routeSymbol]);
  const wasFocusedRef = useRef(false);
  const backNavigationStartedRef = useRef(false);

  useEffect(() => {
    if (isScreenFocused) {
      wasFocusedRef.current = true;
      backNavigationStartedRef.current = false;
      // Keep the optimistic layer visible until this route has produced its
      // own painted body. Focus can arrive before the native stack surface is
      // actually visible; hiding here caused a one-frame Quotes flash.
      if (contentReady) {
        markQuoteInfoLaunchCovered('properties');
      }
      return;
    }

    if (wasFocusedRef.current) {
      wasFocusedRef.current = false;
      completeQuoteInfoLaunch('properties');
    }
  }, [contentReady, isScreenFocused]);

  const handleBack = useCallback(() => {
    if (backNavigationStartedRef.current) {
      return;
    }
    backNavigationStartedRef.current = true;
    // Re-cover with the root retained shell first so stack pop never flashes
    // a laggy Quotes remount (same class as RegisterLaunch back cover).
    const coverRevision = beginQuoteInfoBackCover('properties', symbol);
    scheduleBackNavigationAfterVisualFrame(() => {
      safeRouterBack(router, '/(tabs)/quotes');
      scheduleQuoteInfoBackCoverRemoval(coverRevision);
    });
  }, [symbol]);

  if (!contentReady) {
    return (
      <QuoteInfoLaunchShell
        // Focus-gated: this branch also renders for the boot-prefetched route
        // instance, which must not hold a live per-tick quote subscription
        // while hidden. The root QuoteInfoLaunchHost cover carries the live
        // shell during the open transition.
        active={isScreenFocused}
        destination="properties"
        symbol={symbol}
        onBack={handleBack}
        backLatencyLabel="quoteInfo.properties.initial.back"
      />
    );
  }

  return <SymbolDetailsInteractiveContent onBack={handleBack} />;
}

export type SymbolDetailsInteractiveContentProps = Readonly<{
  onBack: () => void;
  /** When set (launch host), wins over the route param. */
  symbol?: string;
  /**
   * Sidebar-style activity gate for pre-mounted launch hosts: warm while the
   * action sheet is open, then go fully live on the same tap turn as show().
   */
  active?: boolean;
}>;

export function SymbolDetailsInteractiveContent({
  onBack,
  symbol: symbolOverride,
  active: activeOverride,
}: SymbolDetailsInteractiveContentProps) {
  const { t } = useTranslation();
  const { symbol: routeSymbol = 'BTCUSD' } = useLocalSearchParams<{ symbol?: string }>();
  const symbol = useMemo(
    () => normalizeSymbol(symbolOverride || routeSymbol),
    [routeSymbol, symbolOverride],
  );
  const setChartSymbol = useUserPreferences((s) => s.setChartSymbol);
  const chartTimeframe = useUserPreferences((s) => s.chartTimeframe);
  const oneClickAccepted = useUserPreferences((s) => s.oneClickAccepted);
  const isPublicDemoTradePrompt = useUserPreferences(
    (state) => !state.isLoggedIn,
  );
  const { mutate: placeOrder, isPending } = usePlaceOrderMutation();
  const [activeSide, setActiveSide] = useState<'buy' | 'sell' | null>(null);
  const tradeTapLockRef = useRef(false);
  const tradeTapLockReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSideResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [alertOn, setAlertOn] = useState(false);
  const isScreenFocused = useIsFocused();
  const active = activeOverride ?? isScreenFocused;
  const resolvedLogin = useResolvedTradingLogin();
  const accountLoginString = resolvedLogin !== undefined ? String(resolvedLogin) : undefined;

  const handleOpenFullChart = useCallback(() => {
    // Dispatch the exact public/authenticated history warm-up before changing
    // the retained Chart context and mounting its visible route.
    void prefetchChartSelectionHistory(symbol, chartTimeframe);
    setChartSymbol(symbol);
    router.push('/(tabs)/chart');
  }, [chartTimeframe, setChartSymbol, symbol]);

  const liveQuotes = useMarketData([symbol], active);
  const liveQuote = liveQuotes[symbol] as Partial<QuoteItem> | undefined;
  const quoteActionAvailability = resolveSessionQuoteActionAvailability(liveQuote);

  const T = useTheme();
  const isDark = useIsDarkTheme();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => makeSymbolDetailsStyles(T, isDark), [T, isDark]);
  const screenBg = isDark ? '#121212' : T.bg;

  const { data: remoteMeta } = useInstrumentMeta(symbol, active);
  const { data: accountSummary } = useAccountSummary(accountLoginString, {
    enabled: active && !!accountLoginString,
  });

  const q = useMemo<QuoteItem>(() => {
    const base = {
      ...(liveQuote || {}),
      symbol,
      bid: resolveDetailNumber(liveQuote?.bid) ?? Number.NaN,
      ask: resolveDetailNumber(liveQuote?.ask) ?? Number.NaN,
      changePct: resolveDetailNumber(liveQuote?.changePct) ?? 0,
      high: resolveDetailNumber(liveQuote?.high) ?? Number.NaN,
      low: resolveDetailNumber(liveQuote?.low) ?? Number.NaN,
      contractSize: resolveDetailNumber(remoteMeta?.contractSize, liveQuote?.contractSize) ?? 0,
      swapLong: resolveDetailNumber(remoteMeta?.swapLong, liveQuote?.swapLong) ?? Number.NaN,
      swapShort: resolveDetailNumber(remoteMeta?.swapShort, liveQuote?.swapShort) ?? Number.NaN,
      spread: resolveDetailNumber(liveQuote?.spread) ?? 0,
    } as QuoteItem;
    if (remoteMeta) {
      base.contractSize = remoteMeta.contractSize ?? base.contractSize;
      base.minVolume = remoteMeta.minVolume ?? base.minVolume;
      base.maxVolume = remoteMeta.maxVolume ?? base.maxVolume;
      base.stepVolume = remoteMeta.stepVolume ?? base.stepVolume;
      base.point = remoteMeta.point ?? base.point;
      base.tickSize = remoteMeta.tickSize ?? base.tickSize;
      base.marginInitial = remoteMeta.marginInitial ?? base.marginInitial;
      base.marginMaintenance = remoteMeta.marginMaintenance ?? base.marginMaintenance;
      base.baseCurrency = remoteMeta.baseCurrency ?? base.baseCurrency;
      base.profitCurrency = remoteMeta.profitCurrency ?? base.profitCurrency;
    }
    base.swapLong = resolveDetailNumber(remoteMeta?.swapLong, base.swapLong) ?? Number.NaN;
    base.swapShort = resolveDetailNumber(remoteMeta?.swapShort, base.swapShort) ?? Number.NaN;
    return base;
  }, [liveQuote, symbol, remoteMeta]);

  const meta = useMemo(() => {
    const localMeta = getMeta(symbol);
    if (!remoteMeta) return localMeta;
    return {
      ...localMeta,
      category: remoteMeta.category ?? localMeta.category,
      sector: remoteMeta.sector ?? localMeta.sector,
      spreadMode: remoteMeta.spreadMode ?? localMeta.spreadMode,
      stopsLevel: remoteMeta.stopsLevel !== undefined ? String(remoteMeta.stopsLevel) : localMeta.stopsLevel,
      calculation: remoteMeta.calculation ?? localMeta.calculation,
      chartMode: remoteMeta.chartMode ?? localMeta.chartMode,
      sessions: normalizeTradingSessions(remoteMeta.sessions ?? localMeta.sessions),
    };
  }, [symbol, remoteMeta]);

  const { data: dailyRangeCandle = null } = useLatestDailyCandle(symbol, active);

  const d = q.digits ?? 2;
  const col = dCol(q.changePct, T);
  const mid = ((q.bid || 0) + (q.ask || 0)) / 2;
  const bidPriceText = formatDetailPrice(q.bid, d);
  const askPriceText = formatDetailPrice(q.ask, d);

  const marketSentiment = useMemo(
    () => calculateMarketSentiment(q, dailyRangeCandle),
    [dailyRangeCandle, q],
  );
  const dynHigh = marketSentiment.dayHigh;
  const dynLow = marketSentiment.dayLow;

  const dynOpen = useMemo(() => {
    let baseOpen = q.open ?? q.close ?? q.bid ?? 0;
    if (dailyRangeCandle) {
      baseOpen = dailyRangeCandle.open;
    }
    return baseOpen;
  }, [dailyRangeCandle, q.bid, q.close, q.open]);

  const dynVol = useMemo(() => {
    let baseVol = q.volume;
    if (dailyRangeCandle) {
      baseVol = dailyRangeCandle.volume;
    }
    return baseVol;
  }, [dailyRangeCandle, q.volume]);

  const rng = dynHigh - dynLow;
  const rPct = dynLow > 0 && dynLow !== Infinity ? (rng / dynLow) * 100 : 0;
  const rangePositionPct = marketSentiment.rangePositionPct;
  const pip = 1 / Math.pow(10, d);
  const point = remoteMeta?.point ?? q.point ?? q.tickSize ?? pip;
  const resolvedLeverage = accountSummary?.leverage && accountSummary.leverage > 0
    ? accountSummary.leverage
    : undefined;
  const leverageText = resolvedLeverage && resolvedLeverage > 0
    ? `1:${formatDetailNumber(resolvedLeverage)}`
    : '--';
  const swapLong = resolveDetailNumber(remoteMeta?.swapLong, q.swapLong);
  const swapShort = resolveDetailNumber(remoteMeta?.swapShort, q.swapShort);
  const hasSwapRates = (swapLong !== undefined && Number.isFinite(swapLong))
    || (swapShort !== undefined && Number.isFinite(swapShort));
  const spp = ((q.spread || 0) * (pip || 1)).toFixed(1);
  const ctk = q.tickValue ?? (Number.isFinite(mid) && mid > 0 ? 10 / mid : undefined);

  const ptsRaw = Number.isFinite(q.bid) && Number.isFinite(dynOpen)
    ? (q.bid - dynOpen) / (pip || 1)
    : Number.NaN;
  const pts = Number.isFinite(ptsRaw) ? `${ptsRaw >= 0 ? '+' : ''}${ptsRaw.toFixed(0)}` : '--';
  const isUp = q.changePct >= 0;
  const isMarketOpen = quoteActionAvailability.allowed && q.tradeAllowed !== false;

  useEffect(() => () => {
    if (tradeTapLockReleaseTimerRef.current) {
      clearTimeout(tradeTapLockReleaseTimerRef.current);
      tradeTapLockReleaseTimerRef.current = null;
    }
    if (activeSideResetTimerRef.current) {
      clearTimeout(activeSideResetTimerRef.current);
      activeSideResetTimerRef.current = null;
    }
  }, []);

  const handleShare = async () => {
    try {
      const displayName = symbol.replace(/m$/i, '').replace(/\//g, '');
      const bidPrice = bidPriceText;
      const askPrice = askPriceText;
      const changePct = (q.changePct || 0).toFixed(2);
      const changeSign = q.changePct >= 0 ? '+' : '';
      const spreadVal = parseFloat(Number(q.spread || 0).toFixed(2)).toString();

      const message = [
        `📊 ${displayName}`,
        ``,
        `💰 Bid: ${bidPrice}  |  Ask: ${askPrice}`,
        `📈 Change: ${changeSign}${changePct}%`,
        `📉 Spread: ${spreadVal}`,
        ``,
        `Shared from RTX5 Trading App`,
      ].join('\n');

      await Share.share({ message, title: `${displayName} - Live Quote` });
    } catch (_err) {
      // User cancelled or share failed silently
    }
  };

  const handleTrade = (side: 'buy' | 'sell') => {
    // Tap time for the Journal's order latency telemetry.
    markTradeIntent();
    if (requestOrrnnDemoTradeAuth({
      kind: oneClickAccepted ? 'market-order' : 'order-ticket',
      symbol,
      side,
      origin: 'quotes',
    })) {
      return;
    }
    if (tradeTapLockRef.current || isPending) {
      return;
    }

    tradeTapLockRef.current = true;
    const releaseTradeTapLock = () => {
      if (tradeTapLockReleaseTimerRef.current) {
        clearTimeout(tradeTapLockReleaseTimerRef.current);
        tradeTapLockReleaseTimerRef.current = null;
      }
      tradeTapLockRef.current = false;
    };
    const releaseTradeTapLockAfter = (delayMs: number) => {
      if (tradeTapLockReleaseTimerRef.current) {
        clearTimeout(tradeTapLockReleaseTimerRef.current);
      }
      tradeTapLockReleaseTimerRef.current = setTimeout(() => {
        tradeTapLockReleaseTimerRef.current = null;
        tradeTapLockRef.current = false;
      }, delayMs);
    };

    if (activeSideResetTimerRef.current) {
      clearTimeout(activeSideResetTimerRef.current);
      activeSideResetTimerRef.current = null;
    }
    setActiveSide(side);
    activeSideResetTimerRef.current = setTimeout(() => {
      setActiveSide((currentSide) => (currentSide === side ? null : currentSide));
      activeSideResetTimerRef.current = null;
    }, 800);

    if (oneClickAccepted) {
      const currentQuoteAvailability = resolveSessionQuoteActionAvailability(liveQuote);
      if (!currentQuoteAvailability.allowed) {
        recordBlockedPriceAction('symbol_details_market_order', currentQuoteAvailability);
        Alert.alert(t('Market Data Unavailable'), t(quoteActionBlockMessage(currentQuoteAvailability)));
        releaseTradeTapLock();
        return;
      }

      const actionProvenance = captureActiveBrokerSessionProvenance();
      if (!actionProvenance) {
        const feedback = createFrontendTradingError(
          t('Authentication Error'),
          t('The active broker session is unavailable. Log in again before placing an order.'),
        );
        Alert.alert(feedback.title, feedback.message);
        releaseTradeTapLock();
        return;
      }

      const tradingLogin = resolveTradingLogin();
      if (!tradingLogin || String(tradingLogin) !== actionProvenance.identity.accountLogin) {
        const feedback = createFrontendTradingError(
          t('Account Error'),
          t('The app could not resolve the active trading account from local state. Select an account and try again.'),
        );
        Alert.alert(feedback.title, feedback.message);
        releaseTradeTapLock();
        return;
      }

      placeOrder(
        {
          account_login: tradingLogin,
          symbol,
          side,
          volume: 0.01,
          price_sl: 0,
          price_tp: 0,
          comment: '',
          trailing_stop: 0,
          trailing_step: 0,
          magic: 0
        },
        {
          onSuccess: (data) => {
            if (!isActiveBrokerSessionProvenanceCurrent(actionProvenance)) {
              releaseTradeTapLock();
              return;
            }
            const executionEvidence = resolveBrokerExecutionEvidence(data);
            Alert.alert(
              t(executionEvidence.confirmed ? 'Order Executed' : 'Order Submitted — Confirmation Pending'),
              t(
                executionEvidence.confirmed
                  ? 'The broker confirmed the order ticket and execution price.'
                  : 'The broker accepted the request without complete execution evidence. Verify it in Positions or Orders before acting on it.',
              ),
            );
          },
          onError: (err: any) => {
            if (!isActiveBrokerSessionProvenanceCurrent(actionProvenance)) {
              releaseTradeTapLock();
              return;
            }
            const feedback = classifyTradingError(err, { action: 'place-order' });
            Alert.alert(feedback.title, feedback.message);
          },
          onSettled: releaseTradeTapLock,
        }
      );
    } else {
      prefetchOrderTicketData(resolveTradingLoginString(), symbol);
      router.push({ pathname: '/trade/order-ticket', params: { symbol, side } });
      releaseTradeTapLockAfter(800);
    }
  };

  const handleTradeNow = useCallback(() => {
    if (requestOrrnnDemoTradeAuth({
      kind: 'order-ticket',
      symbol,
      origin: 'quotes',
    })) {
      return;
    }
    prefetchOrderTicketData(resolveTradingLoginString(), symbol);
    router.push({ pathname: '/trade/order-ticket', params: { symbol } });
  }, [symbol]);

  return (
    <View style={{ flex: 1, backgroundColor: screenBg }}>
      <View style={{
        paddingTop: insets.top, backgroundColor: screenBg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      }}>
        <View style={{ height: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 }}>
          <Pressable
            onPress={onBack}
            activateOnPressIn
            latencyLabel="quoteInfo.properties.back"
            latencyBudgetMs={50}
            unstable_pressDelay={0}
            hitSlop={15}
            style={{ width: 42, alignItems: 'flex-start', padding: 4 }}
          >
            <Ionicons name="arrow-back" size={24} color={T.text} />
          </Pressable>
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '500', color: T.text }}>
            {t('Quote Details')}
          </Text>
          <View style={{ width: 42 }} />
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="always"
        canCancelContentTouches={Platform.OS === 'ios'} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60, paddingTop: 6 }}>

        <BrokerFeedHealthBanner
          compact
          latencyLabel="symbolDetails.feedHealth.retry"
          style={{ marginHorizontal: 12, marginBottom: 8 }}
        />

        <View style={s.glassHero.container}>
          {isDark && <BlurView intensity={20} tint="dark" style={[StyleSheet.absoluteFillObject, { borderRadius: 24, overflow: 'hidden' }]} />}
          {isDark && (
            <LinearGradient
              colors={['rgba(255,255,255,0.035)', 'rgba(255,255,255,0.008)', 'transparent']}
              start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
              style={[StyleSheet.absoluteFillObject, { borderRadius: 24, overflow: 'hidden' }]}
            />
          )}
          {isDark && <View style={s.glassHero.borderHighlight} />}

          <View style={[s.glassHero.header, { alignItems: 'flex-start' }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.hero.sym}>{symbol.replace(/m$/i, '').replace(/\//g, '')}</Text>
              <Text style={s.hero.name}>{meta.name}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 6, marginRight: -8 }}>
              <Pressable style={{ paddingHorizontal: 6, paddingVertical: 4 }} onPress={() => setAlertOn(v => !v)}>
                <Ionicons name={alertOn ? 'notifications' : 'notifications-outline'} size={22} color={alertOn ? '#FACC15' : T.textSub} />
              </Pressable>
              <Pressable style={{ paddingHorizontal: 6, paddingVertical: 4 }} onPress={handleShare}>
                <Ionicons name="share-outline" size={22} color={T.textSub} />
              </Pressable>
            </View>
          </View>

          <View style={s.glassHero.priceRow}>
            <Text style={[s.glassHero.bigPrice, { color: col }]}>{bidPriceText}</Text>
            <View style={{ alignItems: 'flex-start', justifyContent: 'center' }}>
              <View style={s.hero.changePill}>
                <Ionicons name={isUp ? 'caret-up' : 'caret-down'} size={14} color={col} />
                <Text style={[s.hero.changeTxt, { color: col }]}>{sgn(q.changePct)}{(q.changePct || 0).toFixed(2)}%</Text>
              </View>
              <Text style={s.glassHero.ptsTxt}>{pts} {t('pts today')}</Text>
            </View>
          </View>

          <View style={s.ticker.container}>
            {isDark && <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />}
            {isDark && <LinearGradient colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0.2)']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFillObject} />}
            <View style={s.ticker.spreadBadge}>
              <Text style={s.ticker.spreadVal}>{parseFloat(Number(q.spread || 0).toFixed(2)).toString()}</Text>
              <Text style={s.ticker.spreadLbl}>{t('Spread').toUpperCase()}</Text>
            </View>

            <View style={[s.ticker.inner]}>
              <Pressable
                style={[s.ticker.side, (activeSide === 'sell' || (isPending && !activeSide) || (!isPublicDemoTradePrompt && oneClickAccepted && !quoteActionAvailability.allowed)) && { opacity: 0.5 }]}
                disabled={isPending || (!isPublicDemoTradePrompt && oneClickAccepted && !quoteActionAvailability.allowed)}
                onPress={() => handleTrade('sell')}
                latencyLabel="symbolDetails.trade.sell"
                latencyBudgetMs={CRITICAL_TRADE_ACTION_MAX_LATENCY_MS}
              >
                <LinearGradient colors={[isDark ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.02)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFillObject} />
                <View style={s.ticker.sideHeader}>
                  <Text style={[s.ticker.sideLabel, { color: T.down }]}>{t('SELL')}</Text>
                  <View style={s.ticker.arrowWrap}>
                    <Ionicons name="caret-down" size={10} color={T.down} style={{ marginTop: 1 }} />
                  </View>
                </View>
                <View style={s.ticker.priceWrap}>
                  <Text style={s.ticker.priceBase}>{bidPriceText.slice(0, -2)}</Text>
                  <Text style={[s.ticker.pipHighlight, { color: T.down }]}>{bidPriceText.slice(-2)}</Text>
                </View>
              </Pressable>

              <View style={s.ticker.dividerCol}>
                <View style={s.ticker.dividerLine} />
                <View style={s.ticker.pipBadge}>
                  <Text style={s.ticker.pipVal}>{spp}</Text>
                  <Text style={s.ticker.pipUnit}>{t('PIP')}</Text>
                </View>
              </View>

              <Pressable
                style={[s.ticker.side, (activeSide === 'buy' || (isPending && !activeSide) || (!isPublicDemoTradePrompt && oneClickAccepted && !quoteActionAvailability.allowed)) && { opacity: 0.5 }]}
                disabled={isPending || (!isPublicDemoTradePrompt && oneClickAccepted && !quoteActionAvailability.allowed)}
                onPress={() => handleTrade('buy')}
                latencyLabel="symbolDetails.trade.buy"
                latencyBudgetMs={CRITICAL_TRADE_ACTION_MAX_LATENCY_MS}
              >
                <LinearGradient colors={[T.upGlow, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFillObject} />
                <View style={s.ticker.sideHeader}>
                  <Text style={[s.ticker.sideLabel, { color: T.up }]}>{t('BUY')}</Text>
                  <View style={s.ticker.arrowWrap}>
                    <Ionicons name="caret-up" size={10} color={T.up} style={{ marginTop: -1 }} />
                  </View>
                </View>
                <View style={s.ticker.priceWrap}>
                  <Text style={s.ticker.priceBase}>{askPriceText.slice(0, -2)}</Text>
                  <Text style={[s.ticker.pipHighlight, { color: T.up }]}>{askPriceText.slice(-2)}</Text>
                </View>
              </Pressable>
            </View>

            <View style={[s.ticker.infoStrip, { justifyContent: 'center' }]}>
              <View style={s.ticker.infoItem}>
                <View style={[
                  s.nav.liveDot,
                  { marginRight: 2, backgroundColor: isMarketOpen ? T.up : T.textMuted, shadowColor: isMarketOpen ? T.up : 'transparent' }
                ]} />
                <Text style={[s.ticker.infoTxt, { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, color: T.textSub }]}>
                  {isMarketOpen ? t('Live Market Data') : q.tradeAllowed === false ? t('Market Closed') : t('Market Data Unavailable')}
                </Text>
              </View>
            </View>
          </View>

          <View style={s.glassHero.metricsRow}>
            <MetricPill label={t('Mid').toUpperCase()} value={formatDetailPrice(mid, d)} icon="analytics-outline" />
            <MetricPill label={t('Open').toUpperCase()} value={formatDetailPrice(dynOpen, d)} icon="time-outline" />
            <MetricPill label={t('PREV')} value={formatDetailPrice(q.close ?? q.ask, d)} icon="calendar-outline" />
            <MetricPill label={t('Vol').toUpperCase()} value={dynVol === undefined ? '--' : dynVol.toLocaleString()} icon="bar-chart-outline" />
          </View>

          <View style={s.glassHero.rangeCard}>
            <View style={s.glassHero.rangeTop}>
              <View>
                <Text style={s.glassHero.rangeLbl}>{t('LOW')}</Text>
                <Text style={s.glassHero.rangeVal}>{formatDetailPrice(dynLow !== Infinity ? dynLow : q.bid, d)}</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={s.glassHero.rangeLbl}>{t('Day Range').toUpperCase()}</Text>
                <Text style={[s.glassHero.rangeVal, { color: col }]}>{(rPct || 0).toFixed(2)}%</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.glassHero.rangeLbl}>{t('HIGH')}</Text>
                <Text style={s.glassHero.rangeVal}>{formatDetailPrice(dynHigh, d)}</Text>
              </View>
            </View>
            <View style={{ paddingHorizontal: 14, paddingTop: 6 }}>
              <RangeBar pos={rangePositionPct} color={col} />
            </View>
          </View>

          <MomentumBar sentiment={marketSentiment} />
        </View>

        <View style={s.act.row}>
          <Pressable style={({ pressed }) => [s.act.btn, s.act.buyBtn, pressed && { opacity: 0.85 }]} onPress={handleTradeNow}>
            <LinearGradient colors={['#2563EB', '#1D4ED8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFillObject} />
            <Ionicons name="flash" size={15} color="#fff" />
            <Text style={s.act.buyTxt}>{t('Trade Now')}</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [s.act.btn, s.act.chartBtn, pressed && { opacity: 0.85 }]} onPress={handleOpenFullChart}>
            <Ionicons name="stats-chart-outline" size={15} color={isDark ? "#94A3B8" : T.textSub} />
            <Text style={s.act.chartTxt}>{t('Full Chart')}</Text>
          </Pressable>
        </View>

        <Section title={t('Contract Specification')} icon="reader-outline">
          <Row label={t('Contract Size')} value={q.contractSize >= 1000 ? `${((q.contractSize || 0) / 1000).toFixed(0)}K ${t('units')}` : String(q.contractSize)} />
          <Row label={t('Min Volume')} value={String(q.minVolume ?? '0.01') + ' ' + t('lot')} />
          <Row label={t('Max Volume')} value={String(q.maxVolume ?? '500') + ' ' + t('lots')} />
          <Row label={t('Lot Step')} value={String(q.stepVolume ?? '0.01')} />
          <Row label={t('Point')} value={formatDetailNumber(point)} />
          <Row label={t('Tick Size')} value={String(q.tickSize ?? pip)} />
          <Row label={t('Tick Value')} value={ctk === undefined ? '--' : '$' + ctk.toFixed(2)} last />
        </Section>

        <Section title={t('Pricing & Fees')} icon="pricetags-outline">
          <Row label={t('Digits')} value={String(d)} />
          <Row label={t('Spread Mode')} value={t(meta.spreadMode)} />
          <Row label={t('Current Spread')} value={`${parseFloat(Number(q.spread || 0).toFixed(2)).toString()} (${spp} ${t('pips')})`} />
          <Row label={t('Stops Level')} value={meta.stopsLevel} />
          <Row label={t('Margin Initial')} value={(q.marginInitial ?? 0).toFixed(2) + '%'} />
          <Row label={t('Margin Maintenance')} value={(q.marginMaintenance ?? 0).toFixed(2) + '%'} />
          <Row label={t('Leverage')} value={leverageText} last={!hasSwapRates} />
          {/* Contract v3 instruments carry no swap_* fields: hide the rows. */}
          {hasSwapRates ? (
            <>
              <Row label={t('Swap Long')} value={formatSwapValue(swapLong)} accent={swapLong !== undefined ? (swapLong < 0 ? T.down : T.up) : undefined} />
              <Row label={t('Swap Short')} value={formatSwapValue(swapShort)} accent={swapShort !== undefined ? (swapShort > 0 ? T.up : T.down) : undefined} last />
            </>
          ) : null}
        </Section>

        <Section title={t('Instrument Profile')} icon="briefcase-outline">
          <Row label={t('Category')} value={t(meta.category)} />
          <Row label={t('Sector')} value={t(meta.sector)} />
          <Row label={t('Calculation')} value={t(meta.calculation)} />
          <Row label={t('Chart Mode')} value={t(meta.chartMode)} />
          <Row label={t('Base Currency')} value={q.baseCurrency ?? symbol.slice(0, 3)} />
          <Row label={t('Profit Currency')} value={q.profitCurrency ?? 'USD'} last />
        </Section>

        <Section title={t('Trading Sessions')} icon="time-outline">
          {meta.sessions.map(([day, hours], i) => {
            const isActive = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].includes(day);
            return (
              <View key={day} style={[s.rw.row, i === meta.sessions.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={[s.ses.dot, isActive && s.ses.dotActive]} />
                  <Text style={s.rw.key}>{t(day)}</Text>
                </View>
                <Text style={s.rw.val}>{hours}</Text>
              </View>
            );
          })}
        </Section>

      </ScrollView>
    </View>
  );
}
