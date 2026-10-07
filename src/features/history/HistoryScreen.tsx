/**
 * Historical trade record timeline (aka 'History' tab).
 * 
 * Displays closed positions, executed orders, and balance operations spanning 
 * user-defined time periods (e.g. Last Month, Last 6 Months).
 * Calculates and visualizes realized PL, Swaps, Commission, and Net Balance evolution.
 */
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { router } from 'expo-router';
import { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../ui/components/Screen';
import { AppHeader } from '../../ui/components/AppHeader';
import { FastPressable } from '../../ui/components/FastPressable';
import { useUserPreferences } from '../../state/userPreferences';
import { useIsDarkTheme } from '../../state/themeMode';
import { useUIState } from '../../state/uiState';
import { useResolvedTradingLogin } from '../../state/tradingLogin';
import { usePositionHistoryQuery } from '../../query/positions';
import { useAccountDealsQuery } from '../../query/deals';
import { useOrdersByLoginQuery } from '../../query/orders';
import { useAccountSummary } from '../../query/account';
import { useLiveAccountState } from '../../state/liveAccountState';
import { Deal } from '../../api/deals';
import { useDeferredActiveFlag } from '../../hooks/useDeferredActiveFlag';
import { useNextFrameValue } from '../../hooks/useNextFrameValue';
import { LoginOrder } from '../../api/orders';
import { ClosedPosition } from '../../api/positions';
import { filterClosedRecordsByDateRange, resolveEffectiveHistoryDateRange } from './historyDateRange';
import { deriveClosedPositionsFromDeals, mergeClosedPositionSources } from './derivedClosedPositions';
import { keyHistoryRows } from './historyRowKeys';
import {
  calculateHistoryMoneySummary,
  resolveClosedPositionNetProfit,
  resolveDealBalanceOperation,
} from './historyMoney';
import { spacing } from '../../ui/theme/index';
import { useTheme } from '../../ui/theme/useTheme';
import { ThemeColors } from '../../ui/theme/glass';
import { fmt } from '../../utils/format';
import { formatBrokerTime } from '../../utils/brokerTime';
import { useTranslation } from '../../i18n/useTranslation';
import { useShallow } from 'zustand/shallow';
import { runImmediateAction } from '../../utils/actionLatency';
import { calculateWinRatePercentFromPnl } from '../../utils/winRate';
import { showHistoryFilterHost } from './historyFilterHostController';
import { useResponsiveLayout } from '../../ui/layout/useResponsiveLayout';
import { shouldScrollTradingSummary } from '../trade/summaryViewport';

type Tab = 'Positions' | 'Orders' | 'Deals';
type SortBy = 'Default' | 'Symbol' | 'Ticket' | 'Type' | 'Volume' | 'Open Time' | 'Close Time' | 'Profit';
type HistoryRow = {
  id: string;
  ticketLabel: string;
  line1: string;
  line2: string;
  time: string;
  status?: string;
  recordKind?: 'closed-position' | 'order' | 'deal';
  profit?: number | null;
  /** Optional note shown beneath the price row (e.g. deal comment from EA or manual entry) */
  note?: string;
  /** Structured fields used by the closed-position card layout (Positions tab). */
  symbolRaw?: string;
  sideRaw?: string;
  volumeNum?: number;
  openPrice?: number;
  closePrice?: number;
  priceDecimals?: number;
};

type Tone = 'positive' | 'negative' | 'neutral';

const TABS: Tab[] = ['Orders', 'Positions', 'Deals'];
const SORT_OPTIONS: SortBy[] = ['Default', 'Symbol', 'Ticket', 'Type', 'Volume', 'Open Time', 'Close Time', 'Profit'];
const EMPTY_CLOSED_POSITIONS: ClosedPosition[] = [];
const EMPTY_DEALS: Deal[] = [];
const EMPTY_ORDERS: LoginOrder[] = [];
const historyRowKey = (item: { listKey: string }) => item.listKey;

/**
 * The summary details card is the first thing in the FlatList header, so its top
 * edge sits exactly on the list's clip boundary — flush against the pinned balance
 * card. Fractional scroll offsets during a fast fling, and top-edge overscroll
 * (iOS bounce, Android stretch), momentarily pull it clear of that boundary and
 * expose screen background as a hairline seam. The card is pulled up by this much
 * and padded straight back down, so whatever peeks past the clip edge is card
 * background and side borders instead of a gap. Net content height is unchanged.
 */
const SUMMARY_DETAILS_OVERSCROLL_BLEED = 96;

function safeTimeStr(timestamp?: number | string | Date): string {
  if (timestamp === undefined || timestamp === null || timestamp === '') return '--';
  if (typeof timestamp === 'number' && !Number.isFinite(timestamp)) return '--';
  try {
    return formatBrokerTime(timestamp);
  } catch {
    return '--';
  }
}

function toFiniteNumber(value: unknown): number | undefined {
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

function pickFiniteNumber(source: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = toFiniteNumber(source[key]);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function pickTrimmedString(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }

  return undefined;
}

function pickHistoryTime(source: Record<string, unknown>, keys: string[]): number | string | undefined {
  for (const key of keys) {
    const value = source[key];
    const numeric = toFiniteNumber(value);
    if (numeric !== undefined) {
      return numeric;
    }
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }

  return undefined;
}

function resolveClosedPositionSide(source: Record<string, unknown>, fallback?: string): string {
  const side = pickTrimmedString(source, ['side', 'type', 'order_type', 'action', 'cmd']) ?? fallback ?? '';
  const sideLower = side.toLowerCase();

  if (sideLower.includes('sell')) {
    return 'sell';
  }
  if (sideLower.includes('buy')) {
    return 'buy';
  }

  return sideLower;
}

function normalizeHistoryIdPart(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }

  return String(value).trim();
}

function resolveHistoryTicketLabel(source: Record<string, unknown>): string | null {
  const ticketLikeValues = [source.ticket, source.position_ticket, source.order_ticket, source.id];

  for (const value of ticketLikeValues) {
    const numeric = toFiniteNumber(value);
    if (numeric !== undefined) {
      return String(Math.trunc(numeric));
    }

    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }

  return null;
}

function buildHistoryFallbackId(source: Record<string, unknown>, parts: unknown[]): string {
  const normalized = parts
    .map(normalizeHistoryIdPart)
    .filter(Boolean);

  if (normalized.length > 0) {
    return normalized.join('-');
  }

  const sourceValues = [
    source.symbol,
    source.side,
    source.time_close,
    source.time_done,
    source.time,
    source.time_update,
    source.time_create,
    source.volume,
  ]
    .map(normalizeHistoryIdPart)
    .filter(Boolean);

  return sourceValues.join('-') || 'record';
}

function pickNumericFallbackTicket(fallbackParts: unknown[]): string | null {
  // When the broker omits the ticket field we still want `#1776852277`-style
  // numeric handles, not `#EURUSD-sell-1776852277-0.10`. Pick the first
  // numeric part with magnitude >= 1 — that filters out lot sizes (e.g. 0.10)
  // and lands on the timestamp, which is broker-issued and effectively unique.
  for (const part of fallbackParts) {
    const numeric = toFiniteNumber(part);
    if (numeric !== undefined && Math.abs(numeric) >= 1) {
      return String(Math.trunc(numeric));
    }
  }
  return null;
}

function buildHistoryRowIdentity(prefix: string, source: Record<string, unknown>, fallbackParts: unknown[]) {
  const ticketLabel = resolveHistoryTicketLabel(source);
  const fallbackId = buildHistoryFallbackId(source, fallbackParts);
  const numericFallback = ticketLabel ? null : pickNumericFallbackTicket(fallbackParts);

  return {
    // `id` stays as the joined-string fallback so the React key is unique
    // across rows that happen to share the same numeric handle.
    id: `${prefix}-${ticketLabel ?? fallbackId}`,
    ticketLabel: ticketLabel ?? numericFallback ?? fallbackId,
  };
}

/**
 * Maps a LoginOrder DTO from GET /api/v2/orders/{login}
 * into the HistoryRow format used by the list renderer.
 *
 * Real response uses `price_open` (not `price`), `time_setup` (order placed),
 * and `time_done` (order completed). For closed orders, `time_done` is shown
 * as the primary timestamp since it represents when the position was closed.
 *
 * Price precision: 5 dp for non-JPY forex, 3 dp for JPY pairs.
 * Status forwarded so the row badge can colour-code filled vs closed/canceled.
 * Comment forwarded as `note` — shows EA name or manual annotation.
 */
function mapOrderToRow(o: LoginOrder): HistoryRow {
  const source = o as unknown as Record<string, unknown>;
  const isJpy = o.symbol?.includes('JPY');
  const priceDecimals = isJpy ? 3 : 5;

  // Closed orders: show time_done (when position closed) as primary time.
  // Filled/open orders: show time_setup (when order was placed).
  const isClosed = o.status === 'closed' || o.status === 'canceled';
  const displayTime = isClosed ? o.time_done : o.time_setup;
  const identity = buildHistoryRowIdentity('ho', source, [o.symbol, o.side, displayTime, o.volume]);

  return {
    ...identity,
    line1: `${o.symbol ?? ''} ${o.side ?? ''} ${(o.volume ?? 0).toFixed(2)}`,
    line2: `${o.type ?? 'market'} at ${(o.price_open ?? 0).toFixed(priceDecimals)}`,
    time: safeTimeStr(displayTime),
    status: o.status,
    profit: null,
    note: o.comment?.trim() || undefined,
  };
}

/**
 * Maps a Deal DTO from GET /api/v2/deals/{login}
 * into the HistoryRow format used by the list renderer.
 *
 * Price precision: forex pairs need 5 decimal places (3 for JPY pairs).
 * Fee: included in the net profit — `fee` is a broker cost separate from commission.
 * Comment: forwarded as a `note` so the EA or manual annotation is visible.
 */
function mapDealToRow(d: Deal): HistoryRow {
  const source = d as unknown as Record<string, unknown>;
  const balanceOperation = resolveDealBalanceOperation(d);
  if (balanceOperation) {
    // Balance/deposit/withdrawal rows are account ledger movements, not trades.
    // Keep profit null so deposits never inflate trade P/L or win-rate stats.
    const label =
      balanceOperation.kind === 'withdrawal'
        ? 'Withdrawal'
        : balanceOperation.kind === 'deposit'
          ? 'Deposit'
          : 'Balance';
    const identity = buildHistoryRowIdentity('hd', source, [label, d.time, balanceOperation.amount]);

    return {
      ...identity,
      line1: label,
      line2: `${fmt.pnlPrecise(balanceOperation.amount)} balance operation`,
      time: safeTimeStr(d.time),
      profit: null,
      note: d.comment?.trim() || undefined,
    };
  }

  const direction = d.action === 'deal_buy' ? 'buy' : 'sell';
  const entry = d.entry === 'entry_in' ? 'in' : 'out';
  const timeStr = safeTimeStr(d.time);

  // Use symbol-aware decimal places: JPY pairs → 3 dp, all others → 5 dp
  const isJpy = d.symbol?.includes('JPY');
  const priceDecimals = isJpy ? 3 : 5;

  // Net profit includes swap, commission, and fee (all are real P&L costs).
  // entry_in deals (opening a position) typically have 0 profit but non-zero
  // commission/fee — we show those as a cost by including them. entry_out
  // deals close the position and realise the full P&L including all costs.
  const netCosts = (d.swap || 0) + (d.commission || 0) + (d.fee || 0);
  const netProfit = d.entry === 'entry_out' ? d.profit + netCosts : null;
  const identity = buildHistoryRowIdentity('hd', source, [d.symbol, d.action, d.entry, d.time, d.volume]);

  return {
    ...identity,
    line1: `${d.symbol} ${direction},${entry}`,
    line2: `${(d.volume ?? 0).toFixed(2)} at ${(d.price ?? 0).toFixed(priceDecimals)}`,
    time: timeStr,
    profit: netProfit,
    // Only forward non-empty comments — EA names, manual notes, or reason codes
    note: d.comment?.trim() || undefined,
  };
}

function mapClosedPositionToRow(position: ClosedPosition): HistoryRow {
  const source = position as unknown as Record<string, unknown>;
  const symbol = pickTrimmedString(source, ['symbol', 'Symbol', 'instrument', 'name']) ?? '';
  const side = resolveClosedPositionSide(source, position.side);
  const volume = pickFiniteNumber(source, ['volume', 'lots', 'lot', 'volume_closed', 'volumeClosed']) ?? 0;
  const openPrice = pickFiniteNumber(source, ['price_open', 'priceOpen', 'open_price', 'openPrice', 'open']) ?? 0;
  const closePrice =
    pickFiniteNumber(source, ['price_close', 'priceClose', 'close_price', 'closePrice', 'close']) ??
    pickFiniteNumber(source, ['price_current', 'priceCurrent', 'current_price', 'currentPrice', 'price']) ??
    openPrice;
  const displayTime =
    pickHistoryTime(source, ['time_close', 'timeClose', 'close_time', 'closeTime', 'time_done', 'timeDone', 'closed_at', 'time']) ??
    pickHistoryTime(source, ['time_update', 'timeUpdate', 'updated_at']) ??
    pickHistoryTime(source, ['time_create', 'timeCreate', 'open_time', 'openTime', 'time_open', 'timeOpen', 'created_at']);
  const note = pickTrimmedString(source, ['comment', 'reason', 'description']);
  const isJpy = symbol.includes('JPY');
  const priceDecimals = isJpy ? 3 : 5;
  const netProfit = resolveClosedPositionNetProfit(position);
  const identity = buildHistoryRowIdentity('hp', source, [symbol, side, displayTime, volume]);

  return {
    ...identity,
    line1: `${symbol} ${side} ${volume.toFixed(2)}`,
    line2: `${openPrice.toFixed(priceDecimals)} → ${closePrice.toFixed(priceDecimals)}`,
    time: safeTimeStr(displayTime),
    status: 'closed',
    recordKind: 'closed-position',
    profit: netProfit,
    note,
    symbolRaw: symbol,
    sideRaw: side,
    volumeNum: volume,
    openPrice,
    closePrice,
    priceDecimals,
  };
}

/**
 * Main screen for the History tab, displaying past trades, closed positions, and account operations over a selected time period.
 */
const HistoryScreenInner = memo(function HistoryScreenInner({ isScreenFocused }: { isScreenFocused: boolean }) {
  const [tab, setTab] = useState<Tab>('Positions');
  const [sortBy, setSortBy] = useState<SortBy>('Default');
  const openHistoryFilter = useCallback(() => {
    // Chart-options-class retained host: first paint in this press turn, no stack push.
    runImmediateAction('history.filter.open', () => {
      showHistoryFilterHost();
    });
  }, []);
  const { historyRange, historyFromMs, historyToMs, accountDetails } = useUserPreferences(
    useShallow((state) => ({
      historyRange: state.historyRange,
      historyFromMs: state.historyFromMs,
      historyToMs: state.historyToMs,
      accountDetails: state.accountDetails,
    })),
  );
  const historySummaryDetailsVisible = useUserPreferences((state) => state.historySummaryDetailsVisible);
  const setHistorySummaryDetailsVisible = useUserPreferences((state) => state.setHistorySummaryDetailsVisible);
  const showHistoryActionSheet = useUIState((s) => s.showHistoryActionSheet);

  const T = useTheme();
  const scrollSummary = shouldScrollTradingSummary(useResponsiveLayout());
  const { t } = useTranslation();
  const isDark = useIsDarkTheme();
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);
  const historySortSheetConfig = useMemo<Parameters<typeof showHistoryActionSheet>[0]>(() => ({
    title: t('Sort By'),
    presentation: 'mt5Plain',
    detent: 'adaptive',
    instantOpen: true,
    entryMotion: 'mt5Slide',
    runActionAfterClose: false,
    visualKey: `history.sortBy|${sortBy}|${t('Sort By')}`,
    actions: SORT_OPTIONS.map((option) => ({
      label: t(option),
      selected: option === sortBy,
      onPress: () => startTransition(() => setSortBy(option)),
    })),
  }), [sortBy, t]);
  const openHistorySortSheet = useCallback(() => {
    runImmediateAction('history.sortSheet.open', () =>
      showHistoryActionSheet(historySortSheetConfig),
    );
  }, [historySortSheetConfig, showHistoryActionSheet]);

  const preloadHistoryActionSheet = useUIState((s) => s.preloadScopedActionSheet);
  useEffect(() => {
    if (!isScreenFocused) {
      return;
    }
    // Warm the shared history host with the Sort By config so open never pays
    // first-measure cost on the press frame (same idea as chart ⋮ preload).
    preloadHistoryActionSheet('history', historySortSheetConfig);
  }, [historySortSheetConfig, isScreenFocused, preloadHistoryActionSheet]);

  // ── Live API data via TanStack Query ─────────────────────────────────
  // GET /api/v2/positions/{login}/history — closed position history
  // GET /api/v2/account/deals             — deal history (JWT-resolved, date-range aware)
  // GET /api/v2/orders/{login}            — order history (login-based, verified real fields)
  const accountLogin = useResolvedTradingLogin();
  const historyDataActive = useDeferredActiveFlag(isScreenFocused);
  // Cached data shows instantly on tab focus; the focus-refetch effect below
  // refreshes in the background without blocking the transition.
  // /positions/{login}/history is paged by from/to time windows (contract
  // 6.4), so the selected range is passed down instead of loading everything.
  const positionHistoryRange = useMemo(() => {
    const range = resolveEffectiveHistoryDateRange(historyRange, historyFromMs, historyToMs);
    return {
      from: range.fromMs != null ? Math.floor(range.fromMs / 1000) : undefined,
      to: range.toMs != null ? Math.floor(range.toMs / 1000) : undefined,
    };
  }, [historyRange, historyFromMs, historyToMs]);
  const { data: rawPositionHistory = EMPTY_CLOSED_POSITIONS, refetch: refetchPositionHistory } = usePositionHistoryQuery(accountLogin, {
    enabled: historyDataActive,
    from: positionHistoryRange.from,
    to: positionHistoryRange.to,
  });
  const { data: rawDeals = EMPTY_DEALS, refetch: refetchDeals } = useAccountDealsQuery({
    login: accountLogin,
    enabled: historyDataActive,
  });
  const { data: rawOrders = EMPTY_ORDERS, refetch: refetchOrders } = useOrdersByLoginQuery(accountLogin, {
    enabled: historyDataActive,
  });

  // ── Refetch on tab focus ─────────────────────────────────────────────
  // When the user switches to the History tab, immediately fetch fresh data
  // from the server. This ensures that trades closed on other screens (Trade,
  // Chart, etc.) appear in the list without waiting for the polling interval.
  const wasFocusedRef = useRef(isScreenFocused);
  useEffect(() => {
    if (historyDataActive && !wasFocusedRef.current) {
      refetchPositionHistory();
      refetchDeals();
      refetchOrders();
    }
    wasFocusedRef.current = isScreenFocused;
  }, [historyDataActive, isScreenFocused, refetchPositionHistory, refetchDeals, refetchOrders]);

  const accountLoginStr = String(accountDetails?.id ?? accountLogin ?? '—');
  const accountLoginString = accountLogin !== undefined ? String(accountLogin) : undefined;

  // ── Account Summary from backend API ────────────────────────────────
  // GET /api/account/summary — provides balance, currency, leverage, etc.
  // Falls back to WebSocket live state for balance if API hasn't responded yet.
  const { data: accountSummary } = useAccountSummary(accountLoginString, {
    enabled: historyDataActive,
  });
  const liveBalance = useLiveAccountState((s) => s.balance);
  const balance = accountSummary?.balance ?? liveBalance ?? 0;
  const currency = accountSummary?.currency ?? 'USD';
  const { fromMs: effectiveHistoryFromMs, toMs: effectiveHistoryToMs } = useMemo(
    () => resolveEffectiveHistoryDateRange(historyRange, historyFromMs, historyToMs),
    [historyRange, historyFromMs, historyToMs],
  );
  // Demo brokers (and occasionally real brokers under load) don't always
  // populate /positions/{login}/history immediately after a close, so we
  // also rebuild closed positions from the deals stream and merge the two
  // sources. The history endpoint wins on collisions when it does return
  // a record. This is what makes freshly-closed demo trades show up here.
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

  // Keep all money math in one pure helper: closed P/L includes swap,
  // commission, and fee once; deposit prefers exact ledger rows when present.
  const historyMoneySummary = useMemo(
    () => calculateHistoryMoneySummary({
      closedPositions: positionHistory,
      deals: rawDeals,
      balance,
    }),
    [positionHistory, rawDeals, balance],
  );
  const { closedSwap, closedCommission, totalClosedPnl, deposit } = historyMoneySummary;

  const baseData = useMemo<HistoryRow[]>(() => {
    // GET /api/v2/account/orders — real order history, replaces static mock
    if (tab === 'Orders') return rawOrders.map(mapOrderToRow);
    if (tab === 'Deals') return rawDeals.map(mapDealToRow);
    return positionHistory.map(mapClosedPositionToRow);
  }, [tab, rawDeals, rawOrders, positionHistory]);

  const keyedBaseData = useMemo(() => keyHistoryRows(baseData), [baseData]);
  const data = useMemo(() => sortHistoryRows(keyedBaseData, sortBy), [keyedBaseData, sortBy]);
  const renderHistoryRow = useCallback(
    ({ item }: { item: HistoryRow }) => <HistoryItemRow item={item} T={T} isDark={isDark} currency={currency} />,
    [T, isDark, currency],
  );
  const profitRows = useMemo(
    () => data.filter((item) => typeof item.profit === 'number') as Array<HistoryRow & { profit: number }>,
    [data]
  );
  const netProfit = useMemo(() => profitRows.reduce((sum, item) => sum + item.profit, 0), [profitRows]);
  const winRate = useMemo(() => {
    if (!profitRows.length) return '0%';
    return `${calculateWinRatePercentFromPnl(profitRows.map((item) => item.profit))}%`;
  }, [profitRows]);
  const filledCount = useMemo(() => data.filter((item) => item.status === 'filled').length, [data]);
  const netTone: Tone = netProfit > 0 ? 'positive' : netProfit < 0 ? 'negative' : 'neutral';
  const historyRangeLabel = t(historyRange);
  const historySymbolLabel = t('All symbols');
  const toggleHistorySummaryDetails = useCallback(() => {
    setHistorySummaryDetailsVisible(!historySummaryDetailsVisible);
  }, [historySummaryDetailsVisible, setHistorySummaryDetailsVisible]);

  const historySummaryHeader = (
    <>
      <Text style={styles.accountSummaryHeading}>{t('Account Summary')}</Text>
      <View style={[styles.summaryBlock, historySummaryDetailsVisible && styles.summaryBlockFused]}>
        <FastPressable
          onPress={toggleHistorySummaryDetails}
          latencyLabel="history.summary.toggle"
          accessibilityRole="button"
          accessibilityLabel="Toggle account summary details"
          accessibilityState={{ expanded: historySummaryDetailsVisible }}
          style={styles.summaryTop}
        >
          <Text style={[styles.summaryLabel, { color: T.textMuted }]}>{t('Balance')}</Text>
          <View style={styles.summaryBalanceInline}>
            <Text
              style={[styles.summaryBalanceValue, { color: T.text, opacity: 0.9 }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {fmt.decimal(balance)}
            </Text>
            <Text style={[styles.balanceQuickCurrency, { color: T.textSub }]}>{currency}</Text>
          </View>
        </FastPressable>
      </View>
    </>
  );

  return (
    <Screen noBottomInset style={isDark ? { backgroundColor: '#121212' } : undefined}>
      <AppHeader title={t('History')} noBorder />
      {!scrollSummary ? historySummaryHeader : null}

      <FlatList
        keyboardShouldPersistTaps="always"
        style={styles.list}
        data={data}
        keyExtractor={historyRowKey}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
        ListHeaderComponent={(
          <>
            {scrollSummary ? historySummaryHeader : null}
            {historySummaryDetailsVisible ? (
              <View style={[styles.summaryDetailsCard, scrollSummary && styles.summaryDetailsCardScrolling]}>
                <View style={[styles.gridRow, { borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : T.borderSubtle }]}>
                  <View style={[styles.gridCol, { borderRightWidth: 1, borderRightColor: isDark ? 'rgba(255,255,255,0.06)' : T.borderSubtle }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.gridLabel, { color: isDark ? 'rgba(148,163,184,0.5)' : T.textMuted }]}>{t('Account ID')}:</Text>
                    </View>
                    <Text style={[styles.gridValue, { color: T.text, opacity: 0.7 }]}>{accountLoginStr}</Text>
                  </View>
                  <View style={styles.gridCol}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.gridLabel, { color: isDark ? 'rgba(148,163,184,0.5)' : T.textMuted }]}>{t('Symbol')}:</Text>
                    </View>
                    <Text style={[styles.gridValue, { color: T.text, opacity: 0.7 }]}>{historySymbolLabel}</Text>
                  </View>
                </View>
                <View style={[styles.gridRow, { borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : T.borderSubtle }]}>
                  <View style={[styles.gridCol, { borderRightWidth: 1, borderRightColor: isDark ? 'rgba(255,255,255,0.06)' : T.borderSubtle }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.gridLabel, { color: isDark ? 'rgba(148,163,184,0.5)' : T.textMuted }]}>{t('Deposit')}:</Text>
                    </View>
                    <Text style={[styles.gridValue, { color: T.text, opacity: 0.7 }]}>{fmt.int(deposit)}</Text>
                  </View>
                  <View style={styles.gridCol}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.gridLabel, { color: isDark ? 'rgba(148,163,184,0.5)' : T.textMuted }]}>{t('Closed P/L')}:</Text>
                    </View>
                    <Text style={[styles.gridValue, { color: totalClosedPnl >= 0 ? T.up : T.down, opacity: 0.9 }]}>{fmt.pnl(totalClosedPnl)}</Text>
                  </View>
                </View>
                <View style={[styles.gridRow, { borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : T.borderSubtle }]}>
                  <View style={[styles.gridCol, { borderRightWidth: 1, borderRightColor: isDark ? 'rgba(255,255,255,0.06)' : T.borderSubtle }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.gridLabel, { color: isDark ? 'rgba(148,163,184,0.5)' : T.textMuted }]}>{t('Swap')}:</Text>
                    </View>
                    <Text style={[styles.gridValue, { color: T.text, opacity: 0.7 }]}>{fmt.pnl(closedSwap)}</Text>
                  </View>
                  <View style={styles.gridCol}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.gridLabel, { color: isDark ? 'rgba(148,163,184,0.5)' : T.textMuted }]}>{t('Commission')}:</Text>
                    </View>
                    <Text style={[styles.gridValue, { color: T.text, opacity: 0.7 }]}>{fmt.pnl(closedCommission)}</Text>
                  </View>
                </View>
                <View style={styles.gridRow}>
                  <FastPressable
                    style={styles.gridCol}
                    onPress={openHistoryFilter}
                    activateOnPressIn
                    latencyLabel="history.filter.open"
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[styles.gridLabel, { color: isDark ? 'rgba(148,163,184,0.5)' : T.textMuted }]}>{t('Range')}:</Text>
                    </View>
                    <Text style={[styles.gridValue, { color: T.accent, opacity: 1 }]}>{historyRangeLabel}</Text>
                  </FastPressable>
                </View>
              </View>
            ) : null}

            {/* ── Controls Card ── */}
            <View style={styles.topBlock}>
              <View style={styles.topControlsRow}>
                <FastPressable
                  style={styles.iconButton}
                  onPress={openHistorySortSheet}
                  accessibilityRole="button"
                  accessibilityLabel={t('Sort By')}
                  latencyLabel="history.sort.open"
                  activateOnPressIn
                  unstable_pressDelay={0}
                >
                  <Ionicons name='swap-vertical-outline' size={20} color={T.text} />
                </FastPressable>

                <View style={styles.segment}>
                  {TABS.map((item) => (
                    <FastPressable
                      key={item}
                      style={[styles.segmentButton, tab === item && styles.segmentButtonActive]}
                      onPress={() => startTransition(() => setTab(item))}
                      latencyLabel={`history.tab.${item}`}
                    >
                      <Text style={[styles.segmentText, { color: tab === item ? T.text : T.textMuted }]}>{t(item)}</Text>
                    </FastPressable>
                  ))}
                </View>

                <FastPressable
                  style={styles.iconButton}
                  onPress={openHistoryFilter}
                  activateOnPressIn
                  activateOnTouchStart
                  unstable_pressDelay={0}
                  latencyLabel="history.range.open"
                >
                  <Ionicons name='time-outline' size={20} color={T.text} />
                </FastPressable>
              </View>

              <View style={styles.metricsRow}>
                <MetricPill
                  label={t('Range')}
                  value={historyRangeLabel}
                  icon='calendar-outline'
                  tone='neutral'
                  T={T}
                  isDark={isDark}
                  onPress={openHistoryFilter}
                />
                <MetricPill
                  label={tab === 'Orders' ? t('Filled') : t('Win Rate')}
                  value={tab === 'Orders' ? `${filledCount} / ${data.length}` : winRate}
                  icon={tab === 'Orders' ? 'checkmark-done-outline' : 'stats-chart-outline'}
                  tone={tab === 'Orders' ? (filledCount > 0 ? 'positive' : 'neutral') : 'positive'}
                  T={T}
                  isDark={isDark}
                />
                <MetricPill label={t('Trades')} value={String(data.length)} icon='layers-outline' tone='neutral' T={T} isDark={isDark} />
                <MetricPill
                  label={t('Net P/L')}
                  value={fmt.pnl(netProfit)}
                  icon='wallet-outline'
                  tone={netTone}
                  T={T}
                  isDark={isDark}
                  onPress={
                    tab === 'Positions'
                      ? () => router.push({ pathname: '/history/filter', params: { view: 'net-pnl' } })
                      : undefined
                  }
                />
              </View>
            </View>

            {/* ── Section Header ── */}
            <View style={[styles.sectionHeader, { borderBottomColor: T.border }]}>
              <View>
                <Text style={[styles.sectionTitle, { color: T.text }]}>{t('Trade Records')}</Text>
                <Text style={[styles.sectionMeta, { color: T.textMuted }]}>{data.length} {t('records')}</Text>
              </View>
            </View>
          </>
        )}
        renderItem={renderHistoryRow}
        ListEmptyComponent={<Text style={[styles.emptyText, { color: T.textMuted }]}>{t('No history records')}</Text>}
      />
    </Screen>
  );
});

export function HistoryScreen() {
  const isScreenFocused = useIsFocused();
  const deferredScreenFocused = useNextFrameValue(isScreenFocused);
  return <HistoryScreenInner isScreenFocused={deferredScreenFocused} />;
}

/**
 * Renders a generic row for historical account operations such as deposits, withdrawals, or balance adjustments.
 */
const HistoryItemRow = memo(function HistoryItemRow({ item, T, isDark, currency }: { item: HistoryRow; T: ThemeColors; isDark: boolean; currency: string }) {
  const isClosedPosition = item.recordKind === 'closed-position';

  if (isClosedPosition) {
    return <ClosedPositionRow item={item} T={T} isDark={isDark} currency={currency} />;
  }

  const { symbol, side, volume } = parseLine1(item.line1);
  const sideLower = side.toLowerCase().replace(',', '');
  const isBuy = sideLower.includes('buy');
  const isSell = sideLower.includes('sell');
  const profit = typeof item.profit === 'number' ? item.profit : null;
  const isClosedTrade = item.status === 'closed';
  const cardBg = T.glass2;

  return (
    <View style={[
      rStyles.rowCard,
      {
        backgroundColor: isDark ? T.glass2 : cardBg,
        borderColor: isDark ? T.border : T.borderSubtle,
      },
      !isDark && rStyles.cardShadowLight,
      isDark && rStyles.cardShadowDark,
    ]}>
      <Text style={[rStyles.cornerId, { color: T.textMuted }]}>#{item.ticketLabel}</Text>
      <View style={rStyles.rowBody}>
        <View style={rStyles.rowTop}>
          <View style={rStyles.symbolLine}>
            <Text style={[rStyles.symbolText, { color: T.text }]}>{symbol}</Text>
            {side ? (
              <View style={[
                rStyles.sideBadge,
                { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : T.glass1 },
              ]}>
                <Text style={[
                  rStyles.sideText,
                  isBuy ? { color: T.trading.buy.hover }
                    : isSell ? { color: T.trading.sell.hover }
                      : { color: T.textMuted },
                ]}>
                  {side}
                </Text>
              </View>
            ) : null}
            {volume ? <Text style={[rStyles.volumeText, { color: T.textMuted }]}>{volume}</Text> : null}
            {isClosedTrade ? (
              <View
                style={[
                  rStyles.statusBadge,
                  {
                    backgroundColor: isDark ? 'rgba(148, 163, 184, 0.08)' : T.glass1,
                    borderColor: isDark ? 'rgba(148, 163, 184, 0.16)' : T.borderSubtle,
                  },
                ]}
              >
                <Text style={[rStyles.statusText, { color: T.textMuted }]}>closed</Text>
              </View>
            ) : null}
          </View>
          <View style={rStyles.rightCol}>
            {profit !== null ? (
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.82}
                style={[rStyles.pnlText, { color: profit >= 0 ? T.trading.profit : T.down }]}
              >
                {profit >= 0 ? '+' : ''}{profit.toFixed(2)}
              </Text>
            ) : (
              <Text style={[rStyles.timeOnly, { color: T.textSub }]}>{shortTime(item.time)}</Text>
            )}
          </View>
        </View>
        <View style={rStyles.priceRow}>
          {item.line2.includes('→') ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, maxWidth: '100%' }}>
              <Text style={[rStyles.priceTrack, { color: T.textSub }]}>{item.line2.split('→')[0].trim()}</Text>
              <Ionicons name="arrow-forward-outline" size={16} color={T.textSub} />
              <Text style={[rStyles.priceTrack, { color: T.text, fontWeight: '500' }]}>{item.line2.split('→')[1].trim()}</Text>
            </View>
          ) : (
            <Text style={[rStyles.priceTrack, { color: T.textSub }]}>{item.line2}</Text>
          )}
          <Text style={[rStyles.timeText, { color: T.textMuted }]}>{item.time}</Text>
        </View>
        {/* Deal comment — shown when present (EA notes, manual reason codes, etc.) */}
        {item.note ? (
          <View style={rStyles.noteRow}>
            <Ionicons name="chatbubble-ellipses-outline" size={11} color={T.textMuted} />
            <Text style={[rStyles.noteText, { color: T.textMuted }]} numberOfLines={1}>{item.note}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
});

/**
 * Closed-position card — mirrors the open-position card on the Trade screen,
 * but renders the *final* close price and close P&L instead of streaming live values.
 */
function ClosedPositionRow({ item, T, isDark, currency }: { item: HistoryRow; T: ThemeColors; isDark: boolean; currency: string }) {
  const symbol = item.symbolRaw ?? parseLine1(item.line1).symbol;
  const sideRaw = (item.sideRaw ?? '').toLowerCase();
  const isBuy = sideRaw === 'buy';
  const isSell = sideRaw === 'sell';
  const sideLabel = isBuy ? 'buy' : isSell ? 'sell' : sideRaw;
  const volumeNum = typeof item.volumeNum === 'number' ? item.volumeNum : Number(parseLine1(item.line1).volume) || 0;
  const decimals = typeof item.priceDecimals === 'number' ? item.priceDecimals : (symbol.includes('JPY') ? 3 : 5);
  const openPrice = typeof item.openPrice === 'number' ? item.openPrice : NaN;
  const closePrice = typeof item.closePrice === 'number' ? item.closePrice : NaN;
  const profit = typeof item.profit === 'number' ? item.profit : 0;
  return (
    <View
      style={[
        cpStyles.row,
        {
          backgroundColor: isDark ? T.glass2 : T.glass2,
          borderColor: T.border,
          borderLeftColor: T.border,
        },
        !isDark && cpStyles.shadowLight,
        isDark && cpStyles.shadowDark,
      ]}
    >
      <Text style={[cpStyles.cornerId, { color: T.textMuted }]}>#{item.ticketLabel}</Text>

      <View style={cpStyles.body}>
        <View style={cpStyles.headerRow}>
          <View style={cpStyles.symbolLine}>
            <Text style={[cpStyles.symbol, { color: T.text }]}>{fmt.symbol(symbol)}</Text>
            {sideLabel ? (
              <View
                style={[
                  cpStyles.sideBadge,
                  isBuy
                    ? { backgroundColor: 'rgba(37,99,235,0.15)' }
                    : isSell
                      ? { backgroundColor: 'rgba(220,38,38,0.12)' }
                      : { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : T.glass1 },
                ]}
              >
                <Text
                  style={[
                    cpStyles.sideText,
                    { color: isBuy ? T.trading.buy.hover : isSell ? T.trading.sell.hover : T.textMuted },
                  ]}
                >
                  {sideLabel}
                </Text>
              </View>
            ) : null}
            <Text style={[cpStyles.volume, { color: T.textMuted }]}>{volumeNum.toFixed(2)}</Text>
          </View>
          <View style={cpStyles.rightCol}>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
              style={[cpStyles.pnl, { color: profit >= 0 ? T.trading.profit : T.trading.loss }]}
            >
              {fmt.pnlPrecise(profit)} {currency}
            </Text>
          </View>
        </View>

        <View style={cpStyles.priceRow}>
          <View style={cpStyles.priceLeft}>
            <Text style={[cpStyles.price, { color: T.textSub }]}>
              {Number.isFinite(openPrice) ? openPrice.toFixed(decimals) : '---'}
            </Text>
            <Ionicons name="arrow-forward-outline" size={16} color={T.textSub} style={cpStyles.arrow} />
            <Text style={[cpStyles.price, { color: T.textSub }]}>
              {Number.isFinite(closePrice) ? closePrice.toFixed(decimals) : '---'}
            </Text>
          </View>
          <Text style={[cpStyles.dateRight, { color: T.textSub }]}>
            {item.time.replace(' ', '   ')}
          </Text>
        </View>

        {item.note ? (
          <View style={cpStyles.noteRow}>
            <Ionicons name="chatbubble-ellipses-outline" size={11} color={T.textMuted} />
            <Text style={[cpStyles.noteText, { color: T.textMuted }]} numberOfLines={1}>{item.note}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Reusable UI component displaying a small colored badge or pill with a specific metric value (e.g., profit/loss amount).
 */
function MetricPill({
  label, value, icon, tone, T, isDark, onPress,
}: {
  label: string; value: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: Tone; T: ThemeColors; isDark: boolean;
  onPress?: () => void;
}) {
  const cardBg = T.glass1;
  if (onPress) {
    return (
      <FastPressable
        style={[mpS.metricPill, { borderColor: isDark ? T.border : 'transparent', backgroundColor: isDark ? cardBg : T.glass1 }]}
        onPress={onPress}
        latencyLabel={`history.metric.${label}`}
      >
        <View style={mpS.metricTop}>
          <Ionicons name={icon} size={12} color={T.textSub} />
          <Text
            style={[mpS.metricLabel, { color: T.textSub }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {label}
          </Text>
        </View>
        <Text
          style={[
            mpS.metricValue,
            { color: T.text },
            tone === 'positive' && { color: T.trading.profit },
            tone === 'negative' && { color: T.down },
          ]}
        >
          {value}
        </Text>
      </FastPressable>
    );
  }

  return (
    <View style={[mpS.metricPill, { borderColor: isDark ? T.border : 'transparent', backgroundColor: isDark ? cardBg : T.glass1 }]}>
      <View style={mpS.metricTop}>
        <Ionicons name={icon} size={12} color={T.textSub} />
        <Text
          style={[mpS.metricLabel, { color: T.textSub }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {label}
        </Text>
      </View>
      <Text
        style={[
          mpS.metricValue,
          { color: T.text },
          tone === 'positive' && { color: T.trading.profit },
          tone === 'negative' && { color: T.down },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function parseLine1(line1: string) {
  const parts = line1.trim().split(/\s+/);
  const symbol = parts[0] ?? line1;
  const sideRaw = parts[1] ?? '';
  const volumeRaw = parts[2] ?? '';
  const side = sideRaw.trim();
  const hasVolume = Number.isFinite(Number(volumeRaw));
  const volume = hasVolume ? Number(volumeRaw).toFixed(2) : '';
  return { symbol, side, volume };
}

function shortTime(input: string) {
  const parts = input.split(' ');
  return parts[1] ?? input;
}

function sortHistoryRows<Row extends HistoryRow>(rows: Row[], sortBy: SortBy) {
  const sorted = [...rows];
  if (sortBy === 'Default') return sorted;
  sorted.sort((a, b) => {
    if (sortBy === 'Symbol') return parseLine1(a.line1).symbol.localeCompare(parseLine1(b.line1).symbol);
    if (sortBy === 'Ticket') return a.ticketLabel.localeCompare(b.ticketLabel, undefined, { numeric: true });
    if (sortBy === 'Type') return parseLine1(a.line1).side.localeCompare(parseLine1(b.line1).side);
    if (sortBy === 'Volume') {
      const av = Number(parseLine1(a.line1).volume) || 0;
      const bv = Number(parseLine1(b.line1).volume) || 0;
      return bv - av;
    }
    if (sortBy === 'Open Time' || sortBy === 'Close Time') return b.time.localeCompare(a.time);
    if (sortBy === 'Profit') return (b.profit ?? Number.NEGATIVE_INFINITY) - (a.profit ?? Number.NEGATIVE_INFINITY);
    return 0;
  });
  return sorted;
}

/* ─── Static layout-only stylesheets ──────────────────────────────────────── */

const rStyles = StyleSheet.create({
  rowCard: {
    marginHorizontal: spacing.md, marginTop: spacing.sm,
    paddingTop: 18, paddingBottom: 10, paddingHorizontal: spacing.md,
    borderRadius: 16, borderWidth: 1,
  },
  cardShadowLight: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 10, elevation: 1 },
  cardShadowDark: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  cornerId: { position: 'absolute', top: 4, left: 8, fontSize: 11, fontWeight: '500', fontVariant: ['tabular-nums'], letterSpacing: 0 },
  rowBody: { width: '100%' },
  rowTop: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'space-between', alignItems: 'flex-start' },
  symbolLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexGrow: 1, flexShrink: 1, flexBasis: 140, flexWrap: 'wrap', minWidth: 0 },
  symbolText: { fontSize: 16, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0, flexShrink: 1 },
  sideBadge: { borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2 },
  sideText: { fontSize: 11, fontWeight: '600', textTransform: 'lowercase', letterSpacing: 0 },
  volumeText: { fontSize: 13, fontWeight: '500' },
  statusBadge: { borderRadius: 3, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  statusText: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0 },
  rightCol: { alignItems: 'flex-end', justifyContent: 'flex-start', marginLeft: 'auto', maxWidth: '100%', flexShrink: 1 },
  pnlText: { maxWidth: '100%', textAlign: 'right', fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  priceRow: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center', justifyContent: 'space-between' },
  priceTrack: { maxWidth: '100%', flexShrink: 1, fontSize: 13, fontWeight: '500', fontVariant: ['tabular-nums'] },
  timeText: { maxWidth: '100%', marginLeft: 'auto', fontSize: 12, fontWeight: '500', textAlign: 'right', fontVariant: ['tabular-nums'] },
  timeOnly: { fontSize: 13, fontWeight: '500', fontVariant: ['tabular-nums'] },
  /** Deal comment row — only rendered when a non-empty comment exists on the deal */
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  noteText: { fontSize: 11, fontWeight: '500', flex: 1 },
});

/* Closed-position card — visually mirrors TradePositionRow so the user sees the
 * same shape as live open positions, with close price + close time + final P&L. */
const cpStyles = StyleSheet.create({
  row: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingTop: 18,
    paddingBottom: 10,
    paddingHorizontal: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
  },
  shadowLight: { shadowColor: '#64748B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 1 },
  shadowDark: { shadowColor: '#000000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 4 },
  body: { width: '100%' },
  headerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'space-between', alignItems: 'flex-start' },
  symbolLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, flexGrow: 1, flexShrink: 1, flexBasis: 140, minWidth: 0 },
  symbol: { flexShrink: 1, maxWidth: '100%', fontSize: 16, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0 },
  sideBadge: { borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2 },
  sideText: { fontSize: 11, fontWeight: '600', textTransform: 'lowercase', letterSpacing: 0 },
  volume: { fontSize: 13, fontWeight: '500' },
  pnl: { maxWidth: '100%', textAlign: 'right', fontSize: 16, fontWeight: '600', letterSpacing: 0, fontVariant: ['tabular-nums'] },
  priceRow: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center', justifyContent: 'space-between' },
  priceLeft: { flexDirection: 'row', flexWrap: 'wrap', maxWidth: '100%', alignItems: 'center', gap: 3 },
  price: { flexShrink: 1, maxWidth: '100%', fontSize: 13, fontWeight: '500', fontVariant: ['tabular-nums'] },
  arrow: { marginHorizontal: 4 },
  dateRight: { maxWidth: '100%', marginLeft: 'auto', fontSize: 12, fontWeight: '500', textAlign: 'right', fontVariant: ['tabular-nums'] },
  rightCol: { alignItems: 'flex-end', justifyContent: 'flex-start', marginLeft: 'auto', maxWidth: '100%', flexShrink: 1 },
  cornerId: { position: 'absolute', top: 4, left: 8, fontSize: 11, fontWeight: '500', fontVariant: ['tabular-nums'], letterSpacing: 0 },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  noteText: { fontSize: 11, fontWeight: '500', flex: 1 },
});

const mpS = StyleSheet.create({
  metricPill: { flexGrow: 1, flexShrink: 1, flexBasis: 130, minWidth: 0, minHeight: 52, borderRadius: 10, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 6, alignItems: 'center', justifyContent: 'center' },
  metricTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 4, paddingHorizontal: 2 },
  metricLabel: { marginLeft: 6, flexShrink: 1, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0 },
  metricValue: { fontSize: 14, fontWeight: '600', textAlign: 'center', fontVariant: ['tabular-nums'] },
});

function makeStyles(T: ThemeColors, isDark: boolean) {
  const cardBg = T.glass2;

  const accountSummaryCardBg = isDark ? '#1E1E1E' : cardBg; // Matches the app dark card tone.
  return StyleSheet.create({
    list: { flex: 1 },
    listContent: { paddingBottom: 32 },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 },
    menuBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: T.glass1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: T.border },
    accountSummaryHeading: { color: T.text, fontSize: 19, fontWeight: '600', letterSpacing: 0, marginTop: 4, marginHorizontal: spacing.md, marginBottom: 8 },
    summaryBlock: {
      marginTop: spacing.md, marginHorizontal: spacing.md, borderRadius: 16,
      backgroundColor: accountSummaryCardBg, borderWidth: 1, borderColor: T.border,
      shadowColor: isDark ? '#000000' : '#64748B',
      shadowOffset: { width: 0, height: isDark ? 4 : 2 },
      shadowOpacity: isDark ? 0.08 : 0.06,
      shadowRadius: isDark ? 16 : 8, elevation: isDark ? 4 : 1,
      overflow: 'hidden',
    },
    summaryTop: { paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'transparent', gap: 12 },
    summaryLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0, textTransform: 'uppercase', marginTop: 1 },
    summaryBalanceInline: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'flex-end',
      gap: 4,
    },
    summaryBalanceValue: { minWidth: 0, flexShrink: 1, fontSize: 24, fontWeight: '700', letterSpacing: 0, lineHeight: 30, marginTop: 1, fontVariant: ['tabular-nums'] },
    balanceQuickCurrency: { fontSize: 13, fontWeight: '600', flexShrink: 0 },
    /** Applied to the pinned balance card only while the details grid is expanded.
     *  It squares off the bottom edge and recolors it to the old in-card divider, so
     *  the balance card and the scrolling grid below still read as the single card
     *  they were before the grid moved into the FlatList header. */
    summaryBlockFused: {
      borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : T.borderSubtle,
    },
    /** Summary details card — same shell as `summaryBlock`, but it lives inside the
     *  FlatList header so it scrolls away under the pinned balance header. It sits
     *  flush with squared-off top corners and no top edge, so it visually continues
     *  the balance card above it. The negative top margin plus matching top padding
     *  hides a bleed of card background above the clip boundary — see
     *  SUMMARY_DETAILS_OVERSCROLL_BLEED — which keeps a fast fling from opening a
     *  hairline seam between the two halves. */
    summaryDetailsCard: {
      marginTop: -SUMMARY_DETAILS_OVERSCROLL_BLEED,
      paddingTop: SUMMARY_DETAILS_OVERSCROLL_BLEED,
      marginHorizontal: spacing.md, borderRadius: 16,
      backgroundColor: accountSummaryCardBg, borderWidth: 1, borderColor: T.border,
      borderTopWidth: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0,
      shadowColor: isDark ? '#000000' : '#64748B',
      shadowOffset: { width: 0, height: isDark ? 4 : 2 },
      shadowOpacity: isDark ? 0.08 : 0.06,
      shadowRadius: isDark ? 16 : 8, elevation: isDark ? 4 : 1,
      overflow: 'hidden',
    },
    summaryDetailsCardScrolling: { marginTop: 0, paddingTop: 0 },
    gridRow: { flexDirection: 'row' },
    gridCol: { flex: 1, minWidth: 0, flexWrap: 'wrap', gap: 4, paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    gridLabel: { maxWidth: '100%', flexShrink: 1, fontSize: 12, fontWeight: '500' },
    gridValue: { maxWidth: '100%', flexShrink: 1, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'], letterSpacing: 0 },
    topBlock: {
      marginTop: spacing.lg, marginHorizontal: spacing.md, borderRadius: 16,
      borderWidth: 1, borderColor: T.border,
      backgroundColor: isDark ? T.glass2 : cardBg, padding: 6, paddingBottom: 8,
      shadowColor: isDark ? '#000000' : '#64748B',
      shadowOffset: { width: 0, height: isDark ? 4 : 2 },
      shadowOpacity: isDark ? 0.08 : 0.06,
      shadowRadius: isDark ? 16 : 8, elevation: isDark ? 4 : 1,
    },
    topControlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
    iconButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    segment: { flex: 1, minWidth: 0, flexDirection: 'row', borderRadius: 8, overflow: 'hidden', borderWidth: 0.5, borderColor: T.border, backgroundColor: T.glass1 },
    segmentButton: { flex: 1, minWidth: 0, paddingVertical: 8, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
    segmentButtonActive: { backgroundColor: isDark ? T.glass3 : T.glass2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: isDark ? 0 : 0.05, shadowRadius: 2, elevation: 1 },
    segmentText: { fontSize: 13, fontWeight: '600' },
    metricsRow: { marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    sectionHeader: { marginTop: spacing.lg, marginHorizontal: spacing.md, paddingVertical: 8, paddingHorizontal: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1 },
    sectionTitle: { fontSize: 19, fontWeight: '600', letterSpacing: 0 },
    sectionMeta: { marginTop: 2, fontSize: 13, fontWeight: '500' },
    emptyText: { marginTop: spacing.lg, textAlign: 'center', fontSize: 13 },
  });
}
