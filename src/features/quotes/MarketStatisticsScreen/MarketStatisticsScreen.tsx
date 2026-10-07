import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
/**
 * Market Statistics Screen
 *
 * Displays real-time market statistics for a single instrument.
 * Shows Bid, Bid high, Bid low, Ask, Ask high, Ask low, Open price,
 * and Close price with live tick data from WebSocket.
 *
 * Presents the MT5-style statistics as an enterprise trading-desk panel.
 */
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { ScrollView, Text, View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { QuoteItem } from '../../../dev/mock/tradingData';
import { useMarketData } from '../../../query/websocket';
import { useIsDarkTheme } from '../../../state/themeMode';
import { useTheme } from '../../../ui/theme/useTheme';
import { fmt } from '../../../utils/format';
import {
  safeRouterBack,
  scheduleBackNavigationAfterVisualFrame,
} from '../../../utils/navigation';
import { normalizeSymbol } from '../../../domain/symbols';
import { useInstrumentMeta } from '../../../query/instruments';
import { useLatestDailyCandle } from '../../../domain/candles/query/candles';
import { calculateMarketSentiment } from '../../../domain/marketSentiment';
import { useTranslation } from '../../../i18n/useTranslation';
import { getMeta } from '../SymbolDetailsScreen/instrumentMeta';
import { makeMarketStatisticsStyles } from './styles';
import { QuoteInfoLaunchShell } from '../QuoteInfoLaunchShell';
import {
  beginQuoteInfoBackCover,
  completeQuoteInfoLaunch,
  markQuoteInfoLaunchCovered,
  quoteInfoLaunchController,
  scheduleQuoteInfoBackCoverRemoval,
} from '../quoteInfoLaunchController';
import { useDeferredRouteContentReady } from '../../../ui/components/DeferredRouteMount';

type StatDirection = 'up' | 'down' | 'neutral';

type StatRow = {
  label: string;
  value: string;
  direction: StatDirection;
};

type MetricTile = {
  label: string;
  value: string;
  accent?: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

const finiteOr = (value: number | undefined | null, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const formatVolume = (volume?: number) => {
  if (typeof volume !== 'number' || !Number.isFinite(volume)) return '--';
  const safeVolume = volume;
  if (safeVolume >= 1_000_000) return `${(safeVolume / 1_000_000).toFixed(2)}M`;
  if (safeVolume >= 1_000) return `${(safeVolume / 1_000).toFixed(1)}K`;
  return safeVolume.toLocaleString();
};

const formatMarketPrice = (value: number | undefined, digits: number) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? fmt.price(value, digits)
    : '--';

const formatTickTime = (timestamp?: number) => {
  if (!timestamp || !Number.isFinite(timestamp)) return '--';
  return new Date(timestamp).toLocaleTimeString('en-GB', { hour12: false });
};

const pickLatestTimestamp = (quote: QuoteItem) => {
  const candidates = [
    quote.lastReceivedAt,
    quote.lastTickAt,
    quote.feedTickAt,
    quote.lastPriceChangedAt,
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  return candidates.length > 0 ? Math.max(...candidates) : undefined;
};

const resolveDirection = (current: number, previous?: number): StatDirection => {
  if (typeof previous !== 'number' || !Number.isFinite(previous)) return 'neutral';
  if (current > previous) return 'up';
  if (current < previous) return 'down';
  return 'neutral';
};

export function MarketStatisticsScreen() {
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
    && launchSnapshot.destination === 'market-statistics';
  const deferredReady = useDeferredRouteContentReady(0, isScreenFocused);
  const bodyMountedRef = useRef(false);
  if (!isScreenFocused) {
    bodyMountedRef.current = false;
  } else if (deferredReady || launchCovers) {
    bodyMountedRef.current = true;
  }
  const contentReady = isScreenFocused && bodyMountedRef.current;
  const { symbol: routeSymbol = 'EURUSD' } = useLocalSearchParams<{ symbol?: string }>();
  const symbol = useMemo(() => normalizeSymbol(routeSymbol), [routeSymbol]);
  const router = useRouter();
  const wasFocusedRef = useRef(false);
  const backNavigationStartedRef = useRef(false);

  useEffect(() => {
    if (isScreenFocused) {
      wasFocusedRef.current = true;
      backNavigationStartedRef.current = false;
      // Native-stack focus can precede its first visible frame. Retain the
      // exact optimistic layer until the real body is ready to cover it.
      if (contentReady) {
        markQuoteInfoLaunchCovered('market-statistics');
      }
      return;
    }

    if (wasFocusedRef.current) {
      wasFocusedRef.current = false;
      completeQuoteInfoLaunch('market-statistics');
    }
  }, [contentReady, isScreenFocused]);

  const handleBack = useCallback(() => {
    if (backNavigationStartedRef.current) {
      return;
    }
    backNavigationStartedRef.current = true;
    // Re-cover with the root retained shell first so stack pop never flashes
    // a laggy Quotes remount (same class as RegisterLaunch back cover).
    const coverRevision = beginQuoteInfoBackCover('market-statistics', symbol);
    scheduleBackNavigationAfterVisualFrame(() => {
      safeRouterBack(router, '/(tabs)/quotes');
      scheduleQuoteInfoBackCoverRemoval(coverRevision);
    });
  }, [router, symbol]);

  if (!contentReady) {
    return (
      <QuoteInfoLaunchShell
        // Focus-gated: this branch also renders for the boot-prefetched route
        // instance, which must not hold a live per-tick quote subscription
        // while hidden. The root QuoteInfoLaunchHost cover carries the live
        // shell during the open transition.
        active={isScreenFocused}
        destination="market-statistics"
        symbol={symbol}
        onBack={handleBack}
        backLatencyLabel="quoteInfo.marketStatistics.initial.back"
      />
    );
  }

  return <MarketStatisticsInteractiveContent onBack={handleBack} />;
}

export type MarketStatisticsInteractiveContentProps = Readonly<{
  onBack: () => void;
  /** When set (launch host), wins over the route param. */
  symbol?: string;
  /**
   * Sidebar-style activity gate. When provided, live queries follow this flag
   * instead of navigation focus so a pre-mounted host can warm inactive and
   * reveal fully interactive content on the same tap turn.
   */
  active?: boolean;
}>;

export function MarketStatisticsInteractiveContent({
  onBack,
  symbol: symbolOverride,
  active: activeOverride,
}: MarketStatisticsInteractiveContentProps) {
  const { t } = useTranslation();
  const { symbol: routeSymbol = 'EURUSD' } = useLocalSearchParams<{ symbol?: string }>();
  const symbol = useMemo(
    () => normalizeSymbol(symbolOverride || routeSymbol),
    [routeSymbol, symbolOverride],
  );

  const T = useTheme();
  const isDark = useIsDarkTheme();
  const insets = useSafeAreaInsets();
  const isScreenFocused = useIsFocused();
  const active = activeOverride ?? isScreenFocused;

  // Subscribe to live tick data
  const liveQuotes = useMarketData([symbol], active);
  const { data: remoteMeta } = useInstrumentMeta(symbol, active);
  const { data: dailyRangeCandle = null } = useLatestDailyCandle(symbol, active);

  const q = useMemo<QuoteItem>(() => {
    const live = liveQuotes[symbol] as Partial<QuoteItem> | undefined;
    const base = {
      ...(live || {}),
      symbol,
      bid: finiteOr(live?.bid, Number.NaN),
      ask: finiteOr(live?.ask, Number.NaN),
      changePct: finiteOr(live?.changePct, 0),
      high: finiteOr(live?.high, Number.NaN),
      low: finiteOr(live?.low, Number.NaN),
      contractSize: finiteOr(remoteMeta?.contractSize ?? live?.contractSize, 0),
      swapLong: finiteOr(live?.swapLong, Number.NaN),
      swapShort: finiteOr(live?.swapShort, Number.NaN),
      spread: finiteOr(live?.spread, 0),
    } as QuoteItem;
    if (remoteMeta) {
      base.contractSize = remoteMeta.contractSize ?? base.contractSize;
    }
    return base;
  }, [liveQuotes, symbol, remoteMeta]);

  const sentiment = useMemo(
    () => calculateMarketSentiment(q, dailyRangeCandle),
    [dailyRangeCandle, q],
  );

  const bidHigh = Number.isFinite(sentiment.dayHigh) ? sentiment.dayHigh : q.high;
  const bidLow = sentiment.dayLow !== Infinity ? sentiment.dayLow : q.low;
  const askHigh = useMemo(() => {
    const spread = (q.ask || 0) - (q.bid || 0);
    return bidHigh + spread;
  }, [bidHigh, q.ask, q.bid]);
  const askLow = useMemo(() => {
    const spread = (q.ask || 0) - (q.bid || 0);
    return bidLow + spread;
  }, [bidLow, q.ask, q.bid]);

  const openPrice = useMemo(() => {
    if (dailyRangeCandle) return dailyRangeCandle.open;
    return q.open ?? q.close ?? q.bid ?? 0;
  }, [dailyRangeCandle, q.bid, q.close, q.open]);

  const closePrice = useMemo(() => {
    return q.close ?? q.bid ?? 0;
  }, [q.close, q.bid]);

  const isUp = q.changePct >= 0;
  const priceDigits = q.digits ?? 2;
  const pip = 1 / Math.pow(10, priceDigits);
  const midPrice = ((q.bid || 0) + (q.ask || 0)) / 2;
  const absoluteChange = (q.bid || 0) - openPrice;
  const pointsChange = pip > 0 ? absoluteChange / pip : 0;
  const rangePositionPct = clampPercent(sentiment.rangePositionPct);
  const rangePct = bidLow > 0 && bidHigh > bidLow ? ((bidHigh - bidLow) / bidLow) * 100 : 0;
  const latestTickAt = pickLatestTimestamp(q);
  const hasQuotePrice = Number.isFinite(q.bid) && q.bid > 0 && Number.isFinite(q.ask) && q.ask >= q.bid;
  const marketStatusLabel = !hasQuotePrice
    ? t('Unavailable')
    : q.tradeAllowed === false
      ? t('Closed')
      : q.transport === 'websocket'
        ? t('Live')
        : t('Snapshot');
  const marketStatusColor = q.tradeAllowed === false || !hasQuotePrice ? T.down : T.up;
  const localMeta = useMemo(() => getMeta(symbol), [symbol]);
  const instrumentName = remoteMeta?.name ?? localMeta.name;
  const instrumentCategory = remoteMeta?.category ?? localMeta.category;
  const instrumentSector = remoteMeta?.sector ?? localMeta.sector;
  const instrumentDescriptor = [instrumentCategory, instrumentSector].filter(Boolean).map((part) => t(part)).join(' / ');
  const bidDirection = resolveDirection(q.bid, q.prevBid);
  const askDirection = resolveDirection(q.ask, q.prevAsk);
  const changeAccent = isUp ? T.up : T.down;
  const signedChange = `${isUp ? '+' : ''}${(q.changePct || 0).toFixed(2)}%`;
  const signedPoints = `${pointsChange >= 0 ? '+' : ''}${pointsChange.toFixed(0)} ${t('pts')}`;

  const rows: StatRow[] = useMemo(() => [
    { label: 'Bid high', value: formatMarketPrice(bidHigh, priceDigits), direction: 'up' },
    { label: 'Bid low', value: formatMarketPrice(bidLow, priceDigits), direction: 'down' },
    { label: 'Ask high', value: formatMarketPrice(askHigh, priceDigits), direction: 'up' },
    { label: 'Ask low', value: formatMarketPrice(askLow, priceDigits), direction: 'down' },
    { label: 'Open price', value: formatMarketPrice(openPrice, priceDigits), direction: 'neutral' },
    { label: 'Close price', value: formatMarketPrice(closePrice, priceDigits), direction: closePrice >= openPrice ? 'up' : 'down' },
    { label: 'Mid price', value: formatMarketPrice(midPrice, priceDigits), direction: 'neutral' },
    { label: 'Day Range', value: `${rangePct.toFixed(2)}%`, direction: 'neutral' },
  ], [askHigh, askLow, bidHigh, bidLow, closePrice, midPrice, openPrice, priceDigits, rangePct]);

  const overviewTiles: MetricTile[] = useMemo(() => [
    {
      label: 'Spread',
      value: parseFloat(Number(q.spread || 0).toFixed(2)).toString(),
      icon: 'swap-horizontal-outline',
    },
    {
      label: 'Change',
      value: signedChange,
      accent: changeAccent,
      icon: isUp ? 'trending-up-outline' : 'trending-down-outline',
    },
    {
      label: 'Points',
      value: signedPoints,
      accent: pointsChange >= 0 ? T.up : T.down,
      icon: 'analytics-outline',
    },
    {
      label: 'Volume',
      value: formatVolume(q.volume),
      icon: 'bar-chart-outline',
    },
    {
      label: 'Digits',
      value: String(priceDigits),
      icon: 'calculator-outline',
    },
    {
      label: 'Last Tick',
      value: formatTickTime(latestTickAt),
      icon: 'time-outline',
    },
  ], [changeAccent, isUp, latestTickAt, pointsChange, priceDigits, q.spread, q.volume, signedChange, signedPoints, T.down, T.up]);

  const styles = useMemo(() => makeMarketStatisticsStyles(T, isDark), [T, isDark]);
  const displaySymbol = fmt.symbol(symbol);
  const bidColor = bidDirection === 'down' ? T.down : bidDirection === 'up' ? T.up : T.text;
  const askColor = askDirection === 'down' ? T.down : askDirection === 'up' ? T.up : T.text;

  const markerColor = (direction: StatDirection) => {
    if (direction === 'up') return T.up;
    if (direction === 'down') return T.down;
    return T.textMuted;
  };

  return (
    <View style={styles.root}>
      <View style={[styles.headerContainer, { paddingTop: insets.top }]}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={onBack}
            activateOnPressIn
            latencyLabel="quoteInfo.marketStatistics.back"
            latencyBudgetMs={50}
            unstable_pressDelay={0}
            hitSlop={15}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={24} color={T.text} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>{t('Market Statistics')}</Text>
          </View>
          <View style={styles.headerRightSpacer} />
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="always"
        canCancelContentTouches={Platform.OS === 'ios'}
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroPanel}>
          <View style={styles.instrumentRow}>
            <View style={styles.symbolMark}>
              <Ionicons name="stats-chart-outline" size={19} color={T.trading.buy.primary} />
            </View>
            <View style={styles.instrumentCopy}>
              <Text style={styles.symbolText} numberOfLines={1}>{displaySymbol}</Text>
              <Text style={styles.instrumentName} numberOfLines={1}>{instrumentName}</Text>
              <Text style={styles.instrumentDescriptor} numberOfLines={1}>{instrumentDescriptor}</Text>
            </View>
            <View style={[styles.marketChip, { borderColor: marketStatusColor }]}>
              <View style={[styles.marketDot, { backgroundColor: marketStatusColor }]} />
              <Text style={[styles.marketChipText, { color: marketStatusColor }]}>{marketStatusLabel}</Text>
            </View>
          </View>

          <View style={styles.quoteBand}>
            <View style={styles.quoteSide}>
              <View style={styles.quoteLabelRow}>
                <Text style={[styles.quoteLabel, { color: T.down }]}>{t('BID')}</Text>
                {bidDirection !== 'neutral' && (
                  <Ionicons name={bidDirection === 'up' ? 'caret-up' : 'caret-down'} size={11} color={bidColor} />
                )}
              </View>
              <Text style={[styles.quoteValue, { color: bidColor }]} numberOfLines={1} adjustsFontSizeToFit>
                {formatMarketPrice(q.bid, priceDigits)}
              </Text>
              <View style={styles.quoteMetaRow}>
                <Text style={styles.quoteMetaLabel}>{t('Low')}</Text>
                <Text style={styles.quoteMetaValue}>{fmt.price(bidLow, priceDigits)}</Text>
                <Text style={styles.quoteMetaDivider}>/</Text>
                <Text style={styles.quoteMetaLabel}>{t('High')}</Text>
                <Text style={styles.quoteMetaValue}>{fmt.price(bidHigh, priceDigits)}</Text>
              </View>
            </View>

            <View style={styles.quoteDivider} />

            <View style={styles.quoteSide}>
              <View style={styles.quoteLabelRow}>
                <Text style={[styles.quoteLabel, { color: T.up }]}>{t('ASK')}</Text>
                {askDirection !== 'neutral' && (
                  <Ionicons name={askDirection === 'up' ? 'caret-up' : 'caret-down'} size={11} color={askColor} />
                )}
              </View>
              <Text style={[styles.quoteValue, { color: askColor }]} numberOfLines={1} adjustsFontSizeToFit>
                {formatMarketPrice(q.ask, priceDigits)}
              </Text>
              <View style={styles.quoteMetaRow}>
                <Text style={styles.quoteMetaLabel}>{t('Low')}</Text>
                <Text style={styles.quoteMetaValue}>{fmt.price(askLow, priceDigits)}</Text>
                <Text style={styles.quoteMetaDivider}>/</Text>
                <Text style={styles.quoteMetaLabel}>{t('High')}</Text>
                <Text style={styles.quoteMetaValue}>{fmt.price(askHigh, priceDigits)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.changeStrip}>
            <View style={styles.changeItem}>
              <Text style={styles.changeLabel} numberOfLines={1}>{t('Net Change')}</Text>
              <Text style={[styles.changeValue, { color: changeAccent }]} numberOfLines={1} adjustsFontSizeToFit>{signedChange}</Text>
            </View>
            <View style={styles.changeDivider} />
            <View style={styles.changeItem}>
              <Text style={styles.changeLabel} numberOfLines={1}>{t('Points')}</Text>
              <Text style={[styles.changeValue, { color: pointsChange >= 0 ? T.up : T.down }]} numberOfLines={1} adjustsFontSizeToFit>{signedPoints}</Text>
            </View>
            <View style={styles.changeDivider} />
            <View style={styles.changeItem}>
              <Text style={styles.changeLabel} numberOfLines={1}>{t('Range Position')}</Text>
              <Text style={styles.changeValue} numberOfLines={1} adjustsFontSizeToFit>{rangePositionPct.toFixed(0)}%</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionPanel}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionIconBox}>
                <Ionicons name="pulse-outline" size={15} color={T.trading.buy.primary} />
              </View>
              <Text style={styles.sectionTitle}>{t('Session Statistics')}</Text>
            </View>
            <Text style={styles.sectionMeta}>{t('Realtime')}</Text>
          </View>
          {rows.map((row, index) => (
            <View key={row.label} style={[styles.statRow, index < rows.length - 1 && styles.statRowBorder]}>
              <View style={styles.statLeft}>
                <View style={[styles.rowMarker, { backgroundColor: markerColor(row.direction) }]} />
                <Text style={styles.statLabel}>{t(row.label)}</Text>
              </View>
              <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
                {row.value}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.sectionPanel}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionIconBox}>
                <Ionicons name="grid-outline" size={15} color={T.trading.buy.primary} />
              </View>
              <Text style={styles.sectionTitle}>{t('Market Overview')}</Text>
            </View>
            <Text style={styles.sectionMeta}>{marketStatusLabel}</Text>
          </View>
          <View style={styles.overviewGrid}>
            {overviewTiles.map((tile, index) => (
              <View
                key={tile.label}
                style={[
                  styles.overviewCell,
                  index % 2 === 0 && styles.overviewCellRightBorder,
                  index < overviewTiles.length - 2 && styles.overviewCellBottomBorder,
                ]}
              >
                <View style={styles.overviewLabelRow}>
                  <Ionicons name={tile.icon} size={13} color={tile.accent ?? T.textMuted} />
                  <Text style={styles.overviewLabel}>{t(tile.label)}</Text>
                </View>
                <Text
                  style={[styles.overviewValue, tile.accent ? { color: tile.accent } : null]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {tile.value}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.rangePanel}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionIconBox}>
                <Ionicons name="resize-outline" size={15} color={T.trading.buy.primary} />
              </View>
              <Text style={styles.sectionTitle}>{t('Day Range')}</Text>
            </View>
            <Text style={styles.sectionMeta}>{rangePct.toFixed(2)}%</Text>
          </View>
          <View style={styles.rangeValueRow}>
            <View style={styles.rangeValueBlock}>
              <Text style={styles.rangeLabelSmall}>{t('LOW')}</Text>
              <Text style={styles.rangeLabelValue}>{fmt.price(bidLow, priceDigits)}</Text>
            </View>
            <View style={[styles.rangeValueBlock, styles.rangeValueBlockCenter]}>
              <Text style={styles.rangeLabelSmall}>{t('CURRENT')}</Text>
              <Text style={[styles.rangeLabelValue, { color: changeAccent }]}>{formatMarketPrice(q.bid, priceDigits)}</Text>
            </View>
            <View style={[styles.rangeValueBlock, styles.rangeValueBlockRight]}>
              <Text style={styles.rangeLabelSmall}>{t('HIGH')}</Text>
              <Text style={styles.rangeLabelValue}>{fmt.price(bidHigh, priceDigits)}</Text>
            </View>
          </View>
          <View style={styles.rangeTrack}>
            <View
              style={[
                styles.rangeFill,
                {
                  width: `${rangePositionPct}%` as any,
                  backgroundColor: changeAccent,
                },
              ]}
            />
            <View
              style={[
                styles.rangeKnob,
                {
                  left: `${rangePositionPct}%` as any,
                  borderColor: changeAccent,
                },
              ]}
            />
          </View>
        </View>

        <View style={styles.sentimentPanel}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionIconBox}>
                <Ionicons name="people-outline" size={15} color={T.trading.buy.primary} />
              </View>
              <Text style={styles.sectionTitle}>{t('Market Sentiment')}</Text>
            </View>
            <Text style={styles.sectionMeta}>{t('Range model')}</Text>
          </View>
          <View style={styles.sentimentBarRow}>
            <Text style={[styles.sentimentPct, { color: T.up }]}>
              {sentiment.buyPct.toFixed(0)}%
            </Text>
            <View style={styles.sentimentTrack}>
              <View style={[styles.sentimentFillLeft, { width: `${sentiment.buyPct}%` as any, backgroundColor: T.up }]} />
              <View style={[styles.sentimentFillRight, { width: `${sentiment.sellPct}%` as any, backgroundColor: T.down }]} />
            </View>
            <Text style={[styles.sentimentPct, { color: T.down }]}>
              {sentiment.sellPct.toFixed(0)}%
            </Text>
          </View>
          <View style={styles.sentimentLabels}>
            <Text style={[styles.sentimentLabel, { color: T.up }]}>{t('BUYERS')}</Text>
            <Text style={[styles.sentimentLabel, { color: T.down }]}>{t('SELLERS')}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
