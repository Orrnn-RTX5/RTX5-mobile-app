import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { memo, useCallback, useEffect, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { usePendingOrdersQuery } from '../../query/pendingOrders';
import { useActiveBrokerQuerySession } from '../../query/authenticatedQueryScope';
import type { PendingOrderReadModel } from '../../api/orders/pendingOrders';
import { useLiveQuoteSnapshot, useLiveQuoteSubscription } from '../quotes/useLiveQuotes';
import { useTheme } from '../../ui/theme/useTheme';
import { FastPressable } from '../../ui/components/FastPressable';
import { spacing } from '../../ui/theme';
import { useUIState, type ActionSheetConfig } from '../../state/uiState';
import { useIsDarkTheme } from '../../state/themeMode';
import { runImmediateAction } from '../../utils/actionLatency';
import { useInvestorReadOnlySession } from '../../hooks/useInvestorReadOnlySession';
import { captureActiveBrokerSessionOwnerStamp, isActiveBrokerSessionOwnerStampCurrent } from '../../state/activeBrokerSession';
import { PENDING_BULK_OPTIONS, selectPendingOrdersForBulk } from './pendingBulkCancel';
import { useTranslation } from '../../i18n/useTranslation';

const PendingOrderRow = memo(function PendingOrderRow({ order, active, namespace }: { order: PendingOrderReadModel; active: boolean; namespace: string }) {
  const T = useTheme();
  const { t } = useTranslation();
  const isDark = useIsDarkTheme();
  const investorReadOnly = useInvestorReadOnlySession();
  useLiveQuoteSubscription(order.symbol, active);
  const quote = useLiveQuoteSnapshot(order.symbol, active, 200);
  const isBuy = order.type.startsWith('buy');
  const sideColor = isBuy ? T.trading.buy.hover : T.trading.sell.hover;
  const pendingColor = isDark ? '#FBBF24' : '#B45309';
  const expiry = order.timeInForce === 'GTC' ? t('GTC')
    : order.expiry ? new Date(order.expiry * 1000).toLocaleString() : '—';
  return <FastPressable accessibilityRole="button" accessibilityLabel={`Pending order ${order.ticket}, ${order.type.replace(/_/g, ' ')}, ${order.symbol}`}
    accessibilityHint={investorReadOnly ? t('View pending order details') : t('Modify or cancel this pending order')}
    onPress={() => router.push({ pathname: '/trade/pending-order', params: { ticket: String(order.ticket), accountScope: namespace } })}
    style={({ pressed }) => [styles.orderRow, {
      backgroundColor: pressed ? T.glass3 : T.glass2,
      borderColor: T.border,
    }, isDark ? styles.shadowDark : styles.shadowLight]}>
    <View style={styles.orderHeading}>
      <Text style={[styles.ticket, { color: T.textMuted }]} selectable={false}>#{order.ticket}</Text>
      <View style={[styles.statusBadge, { backgroundColor: isDark ? 'rgba(251,191,36,0.10)' : 'rgba(180,83,9,0.08)' }]}>
        <View style={[styles.statusDot, { backgroundColor: pendingColor }]} />
        <Text style={[styles.statusText, { color: pendingColor }]}>{t('Pending')}</Text>
      </View>
    </View>
    <Text style={[styles.symbol, { color: T.text }]}>{order.symbol}</Text>
    <View style={styles.orderTypeRow}>
      <View style={[styles.sideBadge, { backgroundColor: isBuy ? 'rgba(37,99,235,0.15)' : 'rgba(220,38,38,0.12)' }]}>
        <Text style={[styles.sideText, { color: sideColor }]}>{t(order.type.replace(/_/g, ' '))}</Text>
      </View>
      <Text style={[styles.volume, { color: T.textMuted }]}>{order.volume} {t('lots')}</Text>
    </View>
    <View style={styles.prices}>
      <View style={styles.priceCell}>
        <Text style={[styles.detailLabel, { color: T.textMuted }]}>{t('Order Price')}</Text>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.priceValue, { color: T.text }]}>{order.price}</Text>
      </View>
      <View style={[styles.priceCell, styles.marketPriceCell]}>
        <Text style={[styles.detailLabel, { color: T.textMuted }]}>{t(isBuy ? 'Ask' : 'Bid')}</Text>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.priceValue, { color: T.textSub }]}>{(isBuy ? quote?.ask : quote?.bid) ?? '—'}</Text>
      </View>
    </View>
    <View style={[styles.limits, { borderTopColor: T.borderSubtle }]}>
      <View style={styles.limitCell}>
        <Text style={[styles.detailLabel, { color: T.textMuted }]}>{t('SL')}</Text>
        <Text style={[styles.detailValue, { color: T.textSub }]}>{order.sl ?? '—'}</Text>
      </View>
      <View style={styles.limitCell}>
        <Text style={[styles.detailLabel, { color: T.textMuted }]}>{t('TP')}</Text>
        <Text style={[styles.detailValue, { color: T.textSub }]}>{order.tp ?? '—'}</Text>
      </View>
      {order.priceLimit ? <View style={styles.limitCell}>
        <Text style={[styles.detailLabel, { color: T.textMuted }]}>{t('Stop Limit')}</Text>
        <Text style={[styles.detailValue, { color: T.textSub }]}>{order.priceLimit}</Text>
      </View> : null}
    </View>
    <View style={styles.orderFooter}>
      <Ionicons name="time-outline" size={13} color={T.textMuted} />
      <Text style={[styles.expiry, { color: T.textMuted }]}>{expiry}</Text>
      <Ionicons name="chevron-forward" size={16} color={T.textMuted} />
    </View>
  </FastPressable>;
});

export const PendingOrdersSection = memo(function PendingOrdersSection({ active }: { active: boolean }) {
  const T = useTheme();
  const { t } = useTranslation();
  const session = useActiveBrokerQuerySession();
  const { data, isPending, isError, refetch } = usePendingOrdersQuery(active);
  const investorReadOnly = useInvestorReadOnlySession();
  const isDark = useIsDarkTheme();
  const showTradeActionSheet = useUIState(state => state.showTradeActionSheet);
  const ownedSheet = useRef<ActionSheetConfig | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const readOnlyRef = useRef(investorReadOnly);
  readOnlyRef.current = investorReadOnly;
  const openingRoute = useRef(false);
  const dismissOwnedSheet = useCallback(() => {
    // Never dismiss a Positions menu that replaced this pending-order menu.
    if (ownedSheet.current && useUIState.getState().scopedActionSheets.trade === ownedSheet.current) {
      useUIState.getState().hideTradeActionSheet();
    }
    ownedSheet.current = null;
  }, []);
  useEffect(() => {
    if (!active || investorReadOnly) dismissOwnedSheet();
    return dismissOwnedSheet;
  }, [active, session?.cacheNamespace, investorReadOnly, dismissOwnedSheet]);
  const showBulkSheet = () => {
    const owner = captureActiveBrokerSessionOwnerStamp();
    if (!activeRef.current || readOnlyRef.current || !owner || owner.cacheNamespace !== session?.cacheNamespace || !data.length) return;
    openingRoute.current = false;
    const config: ActionSheetConfig = {
      presentation: 'mt5Plain', showActionIcons: true, detent: 'auto',
      instantOpen: true, entryMotion: 'mt5Slide', runActionAfterClose: false,
      actions: PENDING_BULK_OPTIONS.map(option => ({
        label: t(option.label),
        icon: <Ionicons name={option.icon} size={20} color={isDark ? '#EEF1F5' : '#4F535C'} />,
        disabled: selectPendingOrdersForBulk(data, option.mode, owner.accountLogin).length === 0,
        onPress: () => {
          if (!activeRef.current || readOnlyRef.current || openingRoute.current
            || !isActiveBrokerSessionOwnerStampCurrent(owner)
            || selectPendingOrdersForBulk(data, option.mode, owner.accountLogin).length === 0) return;
          openingRoute.current = true;
          dismissOwnedSheet();
          router.push({ pathname: '/trade/pending-bulk', params: { mode: option.mode, accountScope: owner.cacheNamespace } });
        },
      })),
    };
    ownedSheet.current = config;
    runImmediateAction('trade.pendingBulk.open', () => showTradeActionSheet(config));
  };
  return <View style={styles.container}>
    <View style={[styles.header, { borderBottomColor: T.border }]}>
      <View style={styles.headingText}>
        <Text accessibilityRole="header" style={[styles.title, { color: T.text }]}>{t('Pending Orders')}</Text>
        <Text style={[styles.sectionMeta, { color: T.textMuted }]}>
          {isPending && active ? t('Loading…') : `${data.length} ${t('pending')}`}
        </Text>
      </View>
      {!investorReadOnly ? <FastPressable accessibilityRole="button" accessibilityLabel="Pending order bulk options"
        disabled={!active || data.length === 0} accessibilityState={{ disabled: !active || data.length === 0 }}
        activateOnPressIn activateOnTouchStart latencyLabel="trade.pendingBulk.open"
        onPress={showBulkSheet}
        style={({ pressed }) => [styles.bulkButton, { borderColor: T.border, backgroundColor: pressed ? T.glass3 : T.glass1, opacity: active && data.length ? 1 : 0.45 }]}>
        <Text style={[styles.bulkButtonText, { color: T.textMuted }]}>{t('Bulk')}</Text>
      </FastPressable> : null}
    </View>
    {isError ? <FastPressable accessibilityRole="button" accessibilityLabel={t('Retry pending orders')}
      style={[styles.errorMessage, { backgroundColor: T.glass2, borderColor: T.border }]}
      onPress={() => { void refetch(); }}>
      <Ionicons name="alert-circle-outline" size={20} color={T.down} />
      <Text accessibilityRole="alert" style={[styles.errorText, { color: T.textSub }]}>{t('Could not load pending orders. Tap to retry.')}</Text>
      <Ionicons name="refresh-outline" size={18} color={T.textMuted} />
    </FastPressable> : null}
    {!data.length && !isError ? <View style={styles.emptyState}>
      {isPending && active ? <ActivityIndicator color={T.textMuted} /> : <Ionicons name="time-outline" size={32} color={T.textMuted} />}
      <Text style={[styles.emptyTitle, { color: T.textMuted }]}>{t(isPending && active ? 'Loading pending orders…' : 'No pending orders')}</Text>
      {!(isPending && active) ? <Text style={[styles.emptySubtitle, { color: T.textMuted }]}>{t('Your pending orders will appear here')}</Text> : null}
    </View> : null}
    {data.map(order => <PendingOrderRow key={`${session?.cacheNamespace}:${order.ticket}`} order={order} active={active} namespace={session?.cacheNamespace ?? ''} />)}
  </View>;
});

const styles = StyleSheet.create({
  container: {
    minWidth: 0,
  },
  header: {
    marginTop: spacing.lg,
    marginHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 2,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  headingText: { flex: 1, minWidth: 0 },
  title: { fontWeight: '600', fontSize: 19 },
  sectionMeta: { marginTop: 2, fontSize: 13, fontWeight: '500', fontVariant: ['tabular-nums'] },
  bulkButton: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  bulkButtonText: { fontSize: 11, fontWeight: '600', letterSpacing: 0, textTransform: 'uppercase' },
  orderRow: { marginHorizontal: spacing.md, marginTop: spacing.sm, paddingHorizontal: spacing.md, paddingTop: 12, paddingBottom: 10, minWidth: 0, borderRadius: 16, borderWidth: 1 },
  shadowLight: { shadowColor: '#64748B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 1 },
  shadowDark: { shadowColor: '#000000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 4 },
  orderHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  ticket: { fontSize: 11, fontWeight: '500', flexShrink: 1, fontVariant: ['tabular-nums'] },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '600' },
  symbol: { fontSize: 16, fontWeight: '600', marginTop: 4 },
  orderTypeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 5 },
  sideBadge: { borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2, flexShrink: 1 },
  sideText: { fontSize: 11, fontWeight: '600', textTransform: 'lowercase' },
  volume: { fontSize: 13, fontWeight: '500', fontVariant: ['tabular-nums'] },
  prices: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 14 },
  priceCell: { flex: 1, minWidth: 130 },
  marketPriceCell: { alignItems: 'flex-end' },
  detailLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', marginBottom: 3 },
  priceValue: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  limits: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  limitCell: { flex: 1, minWidth: 100 },
  detailValue: { fontSize: 12, fontWeight: '500', fontVariant: ['tabular-nums'] },
  orderFooter: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  expiry: { flex: 1, minWidth: 0, fontSize: 11, fontVariant: ['tabular-nums'] },
  errorMessage: { marginTop: spacing.sm, marginHorizontal: spacing.md, padding: spacing.md, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  errorText: { flex: 1, fontSize: 13, lineHeight: 19 },
  emptyState: { paddingHorizontal: spacing.md, paddingVertical: 32, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '600' },
  emptySubtitle: { fontSize: 12, textAlign: 'center' },
});
