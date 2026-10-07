import { FastPressable as Pressable } from '../../ui/components/FastPressable';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Platform, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePositionHistoryQuery } from '../../query/positions';
import { useAccountDealsQuery } from '../../query/deals';
import { ClosedPosition } from '../../api/positions';
import { filterClosedRecordsByDateRange, resolveEffectiveHistoryDateRange } from './historyDateRange';
import { deriveClosedPositionsFromDeals, mergeClosedPositionSources } from './derivedClosedPositions';
import { resolveTradingLogin } from '../../state/tradingLogin';
import { useLiveAccountState } from '../../state/liveAccountState';
import { useIsDarkTheme } from '../../state/themeMode';
import { useUserPreferences } from '../../state/userPreferences';
import { spacing } from '../../ui/theme/index';
import { ThemeColors } from '../../ui/theme/glass';
import { useTheme } from '../../ui/theme/useTheme';
import { fmt } from '../../utils/format';
import { formatBrokerTime } from '../../utils/brokerTime';
import { useTranslation } from '../../i18n/useTranslation';
import { safeRouterBack } from '../../utils/navigation';
import { useDeferredRouteContentReady } from '../../ui/components/DeferredRouteMount';

type SnapshotRowProps = {
  label: string;
  value: string;
  color?: string;
  border?: boolean;
  styles: ReturnType<typeof makeStyles>;
  T: ThemeColors;
};

type StatCardProps = {
  label: string;
  value: string;
  hint: string;
  color: string;
  styles: ReturnType<typeof makeStyles>;
  T: ThemeColors;
};

type ClosedHistoryPosition = ClosedPosition & {
  netPnl: number;
  volume: number;
  side: 'buy' | 'sell';
};

type ClosedTradePnlRowProps = {
  position: ClosedHistoryPosition;
  index: number;
  isLast: boolean;
  isDark: boolean;
  styles: ReturnType<typeof makeStyles>;
  T: ThemeColors;
  t: (key: string) => string;
};

function SnapshotRow({ label, value, color, border = false, styles, T }: SnapshotRowProps) {
  return (
    <View style={[styles.snapshotRow, border && styles.snapshotRowBorder, border && { borderTopColor: T.borderSubtle }]}>
      <Text style={[styles.snapshotLabel, { color: T.textMuted }]}>{label}</Text>
      <Text style={[styles.snapshotValue, { color: color ?? T.text }]}>{value}</Text>
    </View>
  );
}

function StatCard({ label, value, hint, color, styles, T }: StatCardProps) {
  return (
    <View style={[styles.statCard, { borderColor: T.border, backgroundColor: T.glass1 }]}>
      <Text style={[styles.statLabel, { color: T.textMuted }]}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statHint, { color: T.textDimmed }]}>{hint}</Text>
    </View>
  );
}

function toOptionalFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function toFiniteNumber(value: unknown): number {
  return toOptionalFiniteNumber(value) ?? 0;
}

function resolveTimestampValue(value: unknown): number | string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
    return value.trim();
  }

  return undefined;
}

function resolveTimestampSortMs(value: number | string | undefined): number {
  if (value === undefined) {
    return 0;
  }

  const numeric = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    if (numeric > 4.2e16) return Math.floor(numeric / 1_000_000);
    if (numeric > 4.2e13) return Math.floor(numeric / 1_000);
    if (numeric > 4.2e10) return Math.floor(numeric);
    return Math.floor(numeric * 1000);
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function pickClosedPositionTimestamp(
  position: ClosedPosition,
  keys: string[],
): number | string | undefined {
  const source = position as unknown as Record<string, unknown>;

  for (const key of keys) {
    const value = resolveTimestampValue(source[key]);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function resolveClosedPositionNetPnl(position: ClosedPosition): number {
  const source = position as unknown as Record<string, unknown>;
  const netProfit = toOptionalFiniteNumber(source.netPnl ?? source.net_pnl ?? source.net_profit);
  if (netProfit !== undefined) {
    return netProfit;
  }

  return (
    toFiniteNumber(position.profit) +
    toFiniteNumber(position.swap) +
    toFiniteNumber(position.commission) +
    toFiniteNumber(source.fee)
  );
}

function resolveClosedPositionClosePrice(position: ClosedPosition): number {
  return (
    toFiniteNumber(position.price_close) ||
    toFiniteNumber(position.price_current) ||
    toFiniteNumber(position.price_open)
  );
}

function resolveClosedPositionCloseTime(position: ClosedPosition): number | string | undefined {
  return (
    pickClosedPositionTimestamp(position, ['time_close', 'timeClose', 'close_time', 'closeTime', 'time_done', 'timeDone', 'closed_at', 'time']) ??
    pickClosedPositionTimestamp(position, ['time_update', 'timeUpdate', 'updated_at']) ??
    pickClosedPositionTimestamp(position, ['time_create', 'timeCreate', 'open_time', 'openTime', 'time_open', 'timeOpen', 'created_at'])
  );
}

function resolveClosedPositionTicket(position: ClosedPosition, index: number): string {
  const source = position as unknown as Record<string, unknown>;
  const ticket =
    source.ticket ??
    source.position_ticket ??
    source.order_ticket ??
    source.id;

  if (ticket !== undefined && ticket !== null && String(ticket).trim() !== '') {
    return String(ticket).trim();
  }

  // No ticket field on the record — fall back to a numeric handle so the UI
  // shows e.g. `#1776852277` instead of `#EURUSD-1776852277`. We prefer the
  // close time (always available, broker-issued, monotonically increasing)
  // and only use the row index as a last resort.
  const closeTime = resolveClosedPositionCloseTime(position);
  if (closeTime) {
    return String(closeTime);
  }
  return String(index + 1);
}

function getClosedPositionPriceDecimals(position: ClosedPosition): number {
  return position.symbol?.includes('JPY') ? 3 : 5;
}

function ClosedTradePnlRow({ position, index, isLast, isDark, styles, T, t }: ClosedTradePnlRowProps) {
  const decimals = getClosedPositionPriceDecimals(position);
  const openPrice = toFiniteNumber(position.price_open);
  const closePrice = resolveClosedPositionClosePrice(position);
  const closeTime = resolveClosedPositionCloseTime(position);
  const ticket = resolveClosedPositionTicket(position, index);
  const pnlColor = position.netPnl >= 0 ? T.up : T.down;

  return (
    <View
      style={[
        styles.closedTradeRow,
        !isLast && styles.closedTradeRowDivider,
        !isLast && { borderBottomColor: T.borderSubtle },
      ]}
    >
      <Text style={[styles.closedTradeCornerId, { color: T.textDimmed }]}>#{ticket}</Text>
      <View style={styles.closedTradeTop}>
        <View style={styles.closedTradeLeft}>
          <Text style={[styles.closedTradeSymbol, { color: T.text }]}>{fmt.symbol(position.symbol)}</Text>
          <View
            style={[
              styles.closedTradeSideBadge,
              { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : T.glass1 },
            ]}
          >
            <Text
              style={[
                styles.closedTradeSide,
                { color: position.side === 'buy' ? T.trading.buy.hover : T.trading.sell.hover },
              ]}
            >
              {position.side}
            </Text>
          </View>
          <Text style={[styles.closedTradeVolume, { color: T.textMuted }]}>
            {position.volume.toFixed(2)}
          </Text>
        </View>
        <Text style={[styles.closedTradePnl, { color: pnlColor }]}>{fmt.pnl(position.netPnl)}</Text>
      </View>

      <View style={styles.closedTradeMetaRow}>
        <Text style={[styles.closedTradePrice, { color: T.textSub }]}>
          {openPrice.toFixed(decimals)} - {closePrice.toFixed(decimals)}
        </Text>
        <Text style={[styles.closedTradeTime, { color: T.textMuted }]}>
          {closeTime ? formatBrokerTime(closeTime) : '--'}
        </Text>
      </View>
    </View>
  );
}

function normalizeLeaderboardPosition<T extends { netPnl?: unknown; volume?: unknown; side?: unknown }>(
  position: T,
): T & { netPnl: number; volume: number; side: 'buy' | 'sell' } {
  return {
    ...position,
    netPnl: toFiniteNumber(position.netPnl),
    volume: toFiniteNumber(position.volume),
    side: String(position.side).toLowerCase() === 'sell' ? 'sell' : 'buy',
  };
}

function normalizeClosedHistoryPosition(position: ClosedPosition): ClosedHistoryPosition {
  return {
    ...position,
    netPnl: resolveClosedPositionNetPnl(position),
    volume: toFiniteNumber(position.volume),
    side: String(position.side).toLowerCase() === 'sell' ? 'sell' : 'buy',
  };
}

// Render closed-trade rows in batches: only the first window paints on open,
// and more rows are appended as the user scrolls near the bottom. This keeps a
// long history from rendering every row up-front (which is what made the screen
// slow to open / scroll).
const CLOSED_PNL_INITIAL_VISIBLE_ROWS = 8;
const CLOSED_PNL_ROW_BATCH = 8;
const CLOSED_PNL_LOAD_MORE_THRESHOLD_PX = 600;

export function HistoryNetProfitLossScreen() {
  const isDark = useIsDarkTheme();
  const historyRange = useUserPreferences((state) => state.historyRange);
  const historyFromMs = useUserPreferences((state) => state.historyFromMs);
  const historyToMs = useUserPreferences((state) => state.historyToMs);
  const T = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);
  const accountLogin = resolveTradingLogin();
  const balance = useLiveAccountState((state) => state.balance) || 0;
  // Defer the heavy closed-trade row list past the navigation transition so the
  // screen opens instantly (header + summary cards paint first; the full row
  // list — which renders every closed trade synchronously — fills in ~2 frames
  // later instead of blocking the screen-open animation).
  const heavyContentReady = useDeferredRouteContentReady(0);
  const [visibleRowCount, setVisibleRowCount] = useState(CLOSED_PNL_INITIAL_VISIBLE_ROWS);
  const handleClosedRowsScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const distanceFromBottom =
        contentSize.height - (contentOffset.y + layoutMeasurement.height);
      if (distanceFromBottom <= CLOSED_PNL_LOAD_MORE_THRESHOLD_PX) {
        setVisibleRowCount((current) => current + CLOSED_PNL_ROW_BATCH);
      }
    },
    [],
  );

  const { fromMs: effectiveHistoryFromMs, toMs: effectiveHistoryToMs } = useMemo(
    () => resolveEffectiveHistoryDateRange(historyRange, historyFromMs, historyToMs),
    [historyRange, historyFromMs, historyToMs],
  );
  // Contract 6.4: closed history is paged by from/to time windows.
  const { data: rawPositionHistory = [] } = usePositionHistoryQuery(accountLogin, {
    from: effectiveHistoryFromMs != null ? Math.floor(effectiveHistoryFromMs / 1000) : undefined,
    to: effectiveHistoryToMs != null ? Math.floor(effectiveHistoryToMs / 1000) : undefined,
  });
  const { data: rawDeals = [] } = useAccountDealsQuery({ login: accountLogin });
  // Mirror HistoryScreen's closed-position pipeline: the history endpoint can
  // lag behind freshly-closed trades (especially on demo brokers), so closed
  // positions are also rebuilt from the deals stream and merged. Without this
  // the full-screen Net P/L view shows zero while the History pill shows the
  // real value.
  const derivedClosedPositions = useMemo(
    () => deriveClosedPositionsFromDeals(rawDeals),
    [rawDeals],
  );
  const mergedClosedPositions = useMemo(
    () => mergeClosedPositionSources(rawPositionHistory, derivedClosedPositions),
    [rawPositionHistory, derivedClosedPositions],
  );
  const positionHistory = useMemo(
    () => filterClosedRecordsByDateRange(mergedClosedPositions, effectiveHistoryFromMs, effectiveHistoryToMs),
    [mergedClosedPositions, effectiveHistoryFromMs, effectiveHistoryToMs],
  );
  const closedPositions = useMemo(
    () => positionHistory.map(normalizeClosedHistoryPosition),
    [positionHistory],
  );

  const netProfit = useMemo(
    () => closedPositions.reduce((sum, position) => sum + position.netPnl, 0),
    [closedPositions],
  );
  const totalVolume = useMemo(
    () => closedPositions.reduce((sum, position) => sum + position.volume, 0),
    [closedPositions],
  );
  const profitable = useMemo(
    () => closedPositions.filter((position) => position.netPnl > 0),
    [closedPositions],
  );
  const losing = useMemo(
    () => closedPositions.filter((position) => position.netPnl < 0),
    [closedPositions],
  );
  const breakevenCount = useMemo(
    () => closedPositions.filter((position) => position.netPnl === 0).length,
    [closedPositions],
  );
  const buyCount = useMemo(
    () => closedPositions.filter((position) => position.side === 'buy').length,
    [closedPositions],
  );
  const sellCount = useMemo(
    () => closedPositions.filter((position) => position.side === 'sell').length,
    [closedPositions],
  );
  const grossProfit = useMemo(
    () => profitable.reduce((sum, position) => sum + position.netPnl, 0),
    [profitable],
  );
  const grossLoss = useMemo(
    () => losing.reduce((sum, position) => sum + position.netPnl, 0),
    [losing],
  );
  const topWinner = useMemo(
    () =>
      [...profitable]
        .map(normalizeLeaderboardPosition)
        .sort((left, right) => right.netPnl - left.netPnl)[0] ?? null,
    [profitable],
  );
  const topLoser = useMemo(
    () =>
      [...losing]
        .map(normalizeLeaderboardPosition)
        .sort((left, right) => left.netPnl - right.netPnl)[0] ?? null,
    [losing],
  );
  const closedTradePnlRows = useMemo(
    () =>
      [...closedPositions].sort(
        (left, right) =>
          resolveTimestampSortMs(resolveClosedPositionCloseTime(right)) -
          resolveTimestampSortMs(resolveClosedPositionCloseTime(left)),
      ),
    [closedPositions],
  );

  const closedSwap = useMemo(
    () => positionHistory.reduce((sum, position) => sum + toFiniteNumber(position.swap), 0),
    [positionHistory],
  );
  const closedCommission = useMemo(
    () => positionHistory.reduce((sum, position) => sum + toFiniteNumber(position.commission), 0),
    [positionHistory],
  );
  const totalClosedPnl = useMemo(
    () => positionHistory.reduce((sum, position) => sum + resolveClosedPositionNetPnl(position), 0),
    [positionHistory],
  );
  const deposit = balance - totalClosedPnl;
  const historyRangeLabel = t(historyRange);
  const screenBg = isDark ? '#121212' : T.bg;

  return (
    <View style={[styles.root, { backgroundColor: screenBg }]}>
      <View style={{ height: insets.top, backgroundColor: screenBg }} />

      <View
        style={[
          styles.customHeader,
          { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : T.borderSubtle },
        ]}
      >
        <Pressable
          onPress={() => safeRouterBack(router, '/(tabs)/history')}
          activateOnPressIn
          hitSlop={16}
          style={styles.headerBtn}
        >
          <Ionicons name="arrow-back" size={24} color={T.text} />
        </Pressable>

        <View style={styles.headerTitleWrap} pointerEvents="none">
          <Text
            style={[styles.headerTitle, { color: T.text }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
          >
            {t('Closed Trade Net P/L')}
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
        keyboardShouldPersistTaps='always'
        showsVerticalScrollIndicator={false}
        onScroll={handleClosedRowsScroll}
        scrollEventThrottle={16}
      >
        <View style={styles.heroWrap}>
          <LinearGradient
            colors={isDark ? ['#101827', '#0E141F', '#0A0F18'] : ['#F8FBFF', '#FFFFFF', '#F3F7FC']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <View style={styles.heroTop}>
              <View style={styles.heroHeader}>
                <Text style={[styles.heroEyebrow, { color: T.textMuted }]}>{t('Closed Trade History')}</Text>
                <Text
                  style={[styles.heroTitle, { color: T.text }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.9}
                >
                  {t('Net P/L')}
                </Text>
              </View>
              <View style={[styles.heroBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)' }]}>
                <Ionicons
                  name={netProfit >= 0 ? 'trending-up' : 'trending-down'}
                  size={14}
                  color={netProfit >= 0 ? T.up : T.down}
                />
                <Text style={[styles.heroBadgeText, { color: T.textMuted }]}>{t('Closed')}</Text>
              </View>
            </View>

            <Text style={[styles.heroValue, { color: netProfit >= 0 ? T.up : T.down }]}>
              {fmt.pnl(netProfit)}
            </Text>
            <Text style={[styles.heroSubtext, { color: T.textSub }]}>
              {t('Net closed result for the selected History range.')}
            </Text>

            <View style={styles.heroChips}>
              <View style={[styles.heroChip, { backgroundColor: T.glass1, borderColor: T.border }]}>
                <Text style={[styles.heroChipValue, { color: T.text }]}>{closedPositions.length}</Text>
                <Text style={[styles.heroChipLabel, { color: T.textMuted }]}>{t('Trades')}</Text>
              </View>
              <View style={[styles.heroChip, { backgroundColor: T.glass1, borderColor: T.border }]}>
                <Text style={[styles.heroChipValue, { color: T.text }]}>{totalVolume.toFixed(2)}</Text>
                <Text style={[styles.heroChipLabel, { color: T.textMuted }]}>{t('Lots')}</Text>
              </View>
              <View style={[styles.heroChip, { backgroundColor: T.glass1, borderColor: T.border }]}>
                <Text style={[styles.heroChipValue, { color: T.text }]} numberOfLines={1}>{historyRangeLabel}</Text>
                <Text style={[styles.heroChipLabel, { color: T.textMuted }]}>{t('Range')}</Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        <View style={[styles.card, { backgroundColor: isDark ? T.glass2 : T.glass2, borderColor: T.border }]}>
          <Text style={[styles.sectionTitle, { color: T.text }]}>{t('Top Movers')}</Text>
          {topWinner ? (
            <View style={[styles.leaderRow, topLoser ? styles.leaderRowDivider : null, { borderBottomColor: T.borderSubtle }]}>
              <View style={styles.leaderLeft}>
                <View style={[styles.leaderIcon, { backgroundColor: 'rgba(34,197,94,0.14)' }]}>
                  <Ionicons name="arrow-up" size={14} color={T.up} />
                </View>
                <View>
                  <Text style={[styles.leaderSymbol, { color: T.text }]}>{fmt.symbol(topWinner.symbol)}</Text>
                  <Text style={[styles.leaderMeta, { color: T.textMuted }]}>
                    {t(topWinner.side.toUpperCase())} | {topWinner.volume.toFixed(2)} {t('lots')}
                  </Text>
                  <Text style={[styles.leaderTicket, { color: T.textDimmed }]}>#{resolveClosedPositionTicket(topWinner, 0)}</Text>
                </View>
              </View>
              <Text style={[styles.leaderPnl, { color: T.up }]}>{fmt.pnl(topWinner.netPnl)}</Text>
            </View>
          ) : null}
          {topLoser ? (
            <View style={styles.leaderRow}>
              <View style={styles.leaderLeft}>
                <View style={[styles.leaderIcon, { backgroundColor: 'rgba(239,68,68,0.14)' }]}>
                  <Ionicons name="arrow-down" size={14} color={T.down} />
                </View>
                <View>
                  <Text style={[styles.leaderSymbol, { color: T.text }]}>{fmt.symbol(topLoser.symbol)}</Text>
                  <Text style={[styles.leaderMeta, { color: T.textMuted }]}>
                    {t(topLoser.side.toUpperCase())} | {topLoser.volume.toFixed(2)} {t('lots')}
                  </Text>
                  <Text style={[styles.leaderTicket, { color: T.textDimmed }]}>#{resolveClosedPositionTicket(topLoser, 0)}</Text>
                </View>
              </View>
              <Text style={[styles.leaderPnl, { color: T.down }]}>{fmt.pnl(topLoser.netPnl)}</Text>
            </View>
          ) : null}
          {!topWinner && !topLoser ? (
            <Text style={[styles.emptyText, { color: T.textMuted }]}>{t('No position contributors available yet.')}</Text>
          ) : null}
        </View>

        <View style={[styles.card, { backgroundColor: isDark ? T.glass2 : T.glass2, borderColor: T.border }]}>
          <Text style={[styles.sectionTitle, { color: T.text }]}>{t('History Snapshot')}</Text>
          <SnapshotRow label={t('Balance')} value={fmt.decimal(balance)} styles={styles} T={T} />
          <SnapshotRow label={t('Estimated Deposit')} value={fmt.decimal(deposit)} border styles={styles} T={T} />
          <SnapshotRow label={t('Closed P/L')} value={fmt.pnl(totalClosedPnl)} border color={totalClosedPnl >= 0 ? T.up : T.down} styles={styles} T={T} />
          <SnapshotRow label={t('Swap')} value={fmt.pnl(closedSwap)} border color={closedSwap >= 0 ? T.up : T.down} styles={styles} T={T} />
          <SnapshotRow label={t('Commission')} value={fmt.pnl(closedCommission)} border color={closedCommission <= 0 ? T.down : T.up} styles={styles} T={T} />
          <SnapshotRow label={t('Range')} value={historyRangeLabel} border styles={styles} T={T} />
        </View>

        <View style={styles.statsGrid}>
          <StatCard label={t('Profitable')} value={String(profitable.length)} hint={fmt.pnl(grossProfit)} color={T.up} styles={styles} T={T} />
          <StatCard label={t('Losing')} value={String(losing.length)} hint={fmt.pnl(grossLoss)} color={T.down} styles={styles} T={T} />
          <StatCard label={t('Buy Trades')} value={String(buyCount)} hint={`${totalVolume.toFixed(2)} ${t('lots total')}`} color={T.text} styles={styles} T={T} />
          <StatCard label={t('Sell Trades')} value={String(sellCount)} hint={`${breakevenCount} ${t('break-even')}`} color={T.text} styles={styles} T={T} />
        </View>

        <View style={[styles.card, { backgroundColor: isDark ? T.glass2 : T.glass2, borderColor: T.border }]}>
          <Text style={[styles.sectionTitle, { color: T.text }]}>{t('Contribution')}</Text>
          <SnapshotRow label={t('Net Closed P/L')} value={fmt.pnl(netProfit)} color={netProfit >= 0 ? T.up : T.down} styles={styles} T={T} />
          <SnapshotRow label={t('Gross Winners')} value={fmt.pnl(grossProfit)} border color={grossProfit >= 0 ? T.up : T.down} styles={styles} T={T} />
          <SnapshotRow label={t('Gross Losers')} value={fmt.pnl(grossLoss)} border color={grossLoss >= 0 ? T.up : T.down} styles={styles} T={T} />
          <SnapshotRow label={t('Closed History P/L')} value={fmt.pnl(totalClosedPnl)} border color={totalClosedPnl >= 0 ? T.up : T.down} styles={styles} T={T} />
        </View>

        <View style={[styles.card, { backgroundColor: isDark ? T.glass2 : T.glass2, borderColor: T.border }]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionCount, { color: T.textMuted }]}>
              {closedTradePnlRows.length} {t('trades')}
            </Text>
          </View>
          {closedTradePnlRows.length > 0 ? (
            heavyContentReady ? (
              closedTradePnlRows.slice(0, visibleRowCount).map((position, index) => (
                <ClosedTradePnlRow
                  key={`${resolveClosedPositionTicket(position, index)}-${index}`}
                  position={position}
                  index={index}
                  isLast={index === closedTradePnlRows.length - 1}
                  isDark={isDark}
                  styles={styles}
                  T={T}
                  t={t}
                />
              ))
            ) : (
              // Placeholder reserving space while the row list mounts a frame
              // after the screen-open transition, so the open feels instant.
              <View style={{ minHeight: 160 }} />
            )
          ) : (
            <Text style={[styles.emptyText, { color: T.textMuted }]}>{t('No closed trade P/L available yet.')}</Text>
          )}
        </View>

      </ScrollView>
    </View>
  );
}

const makeStyles = (T: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    root: {
      flex: 1,
    },
    customHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 48,
      paddingHorizontal: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerBtn: {
      width: 40,
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
      letterSpacing: 0.2,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
    },
    heroWrap: {
      marginHorizontal: spacing.sm,
      marginTop: spacing.sm,
    },
    heroCard: {
      borderRadius: 22,
      padding: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : T.border,
      overflow: 'hidden',
    },
    heroTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    heroHeader: {
      flex: 1,
      paddingRight: 12,
    },
    heroEyebrow: {
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    heroTitle: {
      marginTop: 2,
      fontSize: 20,
      fontWeight: '600',
      letterSpacing: 0,
    },
    heroBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 5,
      alignSelf: 'flex-start',
      flexShrink: 0,
    },
    heroBadgeText: {
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 0,
      textTransform: 'uppercase',
    },
    heroValue: {
      marginTop: 12,
      fontSize: 32,
      lineHeight: 38,
      fontWeight: '700',
      letterSpacing: 0,
      fontVariant: ['tabular-nums'],
    },
    heroSubtext: {
      marginTop: 4,
      fontSize: 12,
      fontWeight: '500',
      lineHeight: 16,
    },
    heroChips: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 12,
    },
    heroChip: {
      flex: 1,
      minHeight: 56,
      borderRadius: 14,
      borderWidth: 1,
      paddingHorizontal: 9,
      paddingVertical: 8,
      justifyContent: 'center',
    },
    heroChipValue: {
      fontSize: 17,
      fontWeight: '600',
      letterSpacing: 0,
      fontVariant: ['tabular-nums'],
    },
    heroChipLabel: {
      marginTop: 3,
      fontSize: 11,
      fontWeight: '500',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    card: {
      marginHorizontal: spacing.sm,
      marginTop: spacing.sm,
      borderRadius: 16,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: 0,
      marginBottom: 4,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      marginBottom: 4,
      gap: 12,
    },
    sectionCount: {
      flexShrink: 0,
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    snapshotRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
    },
    snapshotRowBorder: {
      borderTopWidth: 1,
    },
    snapshotLabel: {
      flex: 1,
      paddingRight: 12,
      fontSize: 13,
      fontWeight: '600',
    },
    snapshotValue: {
      flexShrink: 0,
      fontSize: 15,
      fontWeight: '600',
      textAlign: 'right',
      fontVariant: ['tabular-nums'],
      letterSpacing: 0,
    },
    statsGrid: {
      marginHorizontal: spacing.sm,
      marginTop: spacing.sm,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    statCard: {
      width: '49%',
      minHeight: 88,
      borderRadius: 14,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 9,
      justifyContent: 'space-between',
    },
    statLabel: {
      fontSize: 11,
      fontWeight: '500',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    statValue: {
      fontSize: 22,
      fontWeight: '700',
      letterSpacing: 0,
      fontVariant: ['tabular-nums'],
    },
    statHint: {
      fontSize: 11,
      fontWeight: '500',
      lineHeight: 15,
    },
    closedTradeRow: {
      paddingTop: 18,
      paddingBottom: 10,
      position: 'relative',
    },
    closedTradeRowDivider: {
      borderBottomWidth: 1,
    },
    closedTradeTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 10,
    },
    closedTradeLeft: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    closedTradeSymbol: {
      fontSize: 14,
      fontWeight: '600',
      letterSpacing: 0,
      textTransform: 'uppercase',
    },
    closedTradeSideBadge: {
      borderRadius: 3,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    closedTradeSide: {
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 0,
      textTransform: 'lowercase',
    },
    closedTradeVolume: {
      fontSize: 12,
      fontWeight: '600',
    },
    closedTradePnl: {
      flexShrink: 0,
      minWidth: 84,
      textAlign: 'right',
      fontSize: 15,
      fontWeight: '600',
      letterSpacing: 0,
      fontVariant: ['tabular-nums'],
    },
    closedTradeMetaRow: {
      marginTop: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    closedTradePrice: {
      flex: 1,
      minWidth: 0,
      fontSize: 12,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },
    closedTradeTime: {
      flexShrink: 0,
      fontSize: 11,
      fontWeight: '500',
      textAlign: 'right',
      fontVariant: ['tabular-nums'],
    },
    closedTradeCornerId: {
      position: 'absolute',
      top: 4,
      left: 0,
      fontSize: 11,
      fontWeight: '500',
      letterSpacing: 0,
      fontVariant: ['tabular-nums'],
    },
    leaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
    },
    leaderRowDivider: {
      borderBottomWidth: 1,
    },
    leaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
    },
    leaderIcon: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    leaderSymbol: {
      fontSize: 14,
      fontWeight: '600',
      letterSpacing: 0,
      textTransform: 'uppercase',
    },
    leaderMeta: {
      marginTop: 1,
      fontSize: 11,
      fontWeight: '500',
    },
    leaderTicket: {
      marginTop: 2,
      fontSize: 11,
      fontWeight: '500',
      letterSpacing: 0,
      fontVariant: ['tabular-nums'],
    },
    leaderPnl: {
      flexShrink: 0,
      paddingLeft: 8,
      fontSize: 15,
      fontWeight: '600',
      textAlign: 'right',
      fontVariant: ['tabular-nums'],
      letterSpacing: 0,
    },
    emptyText: {
      fontSize: 12,
      fontWeight: '500',
      paddingVertical: 6,
    },
  });
