import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { cancelPendingOrder, type PendingOrderReadModel } from '../../api/orders/pendingOrders';
import { StaleBrokerSessionError } from '../../api/brokerApi';
import { classifyTradingError, createTradingApiError } from '../../api/tradingErrors';
import { usePendingOrdersQuery } from '../../query/pendingOrders';
import { invalidateSessionQueryRoots, useActiveBrokerQuerySession } from '../../query/authenticatedQueryScope';
import { captureActiveBrokerSessionOwnerStamp, isActiveBrokerSessionOwnerStampCurrent } from '../../state/activeBrokerSession';
import { usePendingOrdersState } from '../../state/pendingOrdersState';
import { blockInvestorTradeAction, isActiveSessionInvestorReadOnly, useInvestorReadOnlySession } from '../../hooks/useInvestorReadOnlySession';
import { FastPressable } from '../../ui/components/FastPressable';
import { Screen } from '../../ui/components/Screen';
import { useTheme } from '../../ui/theme/useTheme';
import { useTranslation } from '../../i18n/useTranslation';
import { safeRouterBack } from '../../utils/navigation';
import { parsePendingBulkMode, PENDING_BULK_OPTIONS, runBulkPendingCancellation, selectPendingOrdersForBulk, type PendingBulkSummary } from './pendingBulkCancel';

export function PendingBulkOperationScreen() {
  const params = useLocalSearchParams<{ mode?: string; accountScope?: string }>();
  const mode = parsePendingBulkMode(params.mode);
  const session = useActiveBrokerQuerySession();
  const initialScope = useRef(params.accountScope ?? session?.cacheNamespace);
  const scopeCurrent = Boolean(session && session.cacheNamespace === initialScope.current);
  const focused = useIsFocused();
  const navigation = useNavigation();
  const { data: orders, isError, refetch } = usePendingOrdersQuery(focused && scopeCurrent);
  const queryClient = useQueryClient();
  const T = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const investorReadOnly = useInvestorReadOnlySession();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [summary, setSummary] = useState<PendingBulkSummary | null>(null);
  const [error, setError] = useState('');
  const runningRef = useRef(false);
  const mounted = useRef(true);
  const focusVisit = useRef(0);
  const backStarted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useFocusEffect(useCallback(() => {
    backStarted.current = false;
    focusVisit.current += 1;
    return () => { focusVisit.current += 1; };
  }, []));
  useEffect(() => navigation.addListener('beforeRemove', () => { focusVisit.current += 1; }), [navigation]);
  const handleBack = useCallback(() => {
    if (!navigation.isFocused() || backStarted.current) return;
    backStarted.current = true;
    focusVisit.current += 1;
    safeRouterBack(router, '/(tabs)/trade');
  }, [navigation]);
  const affected = useMemo(() => scopeCurrent && mode && session
    ? selectPendingOrdersForBulk(orders, mode, session.accountLogin) : [], [orders, mode, scopeCurrent, session]);
  const [reviewedOrders, setReviewedOrders] = useState<readonly PendingOrderReadModel[]>([]);
  const preview = running ? reviewedOrders : affected;
  const title = t(PENDING_BULK_OPTIONS.find(option => option.mode === mode)?.label ?? 'Pending Order Bulk Options');

  const execute = async () => {
    if (!navigation.isFocused() || backStarted.current || runningRef.current || !scopeCurrent || !mode
      || affected.length === 0 || blockInvestorTradeAction(t)) return;
    const owner = captureActiveBrokerSessionOwnerStamp();
    if (!owner || owner.cacheNamespace !== initialScope.current) return;
    const visit = focusVisit.current;
    const ownsScreen = () => mounted.current && navigation.isFocused() && focusVisit.current === visit
      && isActiveBrokerSessionOwnerStampCurrent(owner);
    // Freeze the reviewed tickets; newly arriving orders are never added to a running batch.
    const reviewed = affected.map(order => ({ ...order }));
    runningRef.current = true;
    setRunning(true); setReviewedOrders(reviewed); setSummary(null); setError('');
    setProgress({ completed: 0, total: reviewed.length });
    try {
      const result = await runBulkPendingCancellation(reviewed, {
        namespace: owner.cacheNamespace,
        accountLogin: owner.accountLogin,
        assertCurrent: () => {
          if (!isActiveBrokerSessionOwnerStampCurrent(owner)) throw new StaleBrokerSessionError();
          if (!mounted.current || !navigation.isFocused() || focusVisit.current !== visit) {
            const stopped = new Error('Remaining deletions stopped because you left this page.');
            stopped.name = 'PendingBulkCancelledError';
            throw stopped;
          }
          if (isActiveSessionInvestorReadOnly()) throw createTradingApiError(403, { error: 'INVESTOR_READ_ONLY' });
        },
        getPendingOrders: () => {
          const state = usePendingOrdersState.getState();
          return state.cacheNamespace === owner.cacheNamespace ? state.orders : [];
        },
        cancel: ticket => cancelPendingOrder(ticket),
        onProgress: (completed, total) => { if (ownsScreen()) setProgress({ completed, total }); },
      });
      if (ownsScreen()) {
        setSummary(result);
        const failure = result.stopError ?? result.results.find(row => row.outcome === 'failed')?.reason;
        if (failure) setError(classifyTradingError(failure, { action: 'cancel-pending-order' }).message);
      }
    } catch (failure) {
      if (ownsScreen()) setError(classifyTradingError(failure, { action: 'cancel-pending-order' }).message);
    } finally {
      if (isActiveBrokerSessionOwnerStampCurrent(owner)) {
        void invalidateSessionQueryRoots(queryClient, owner.cacheNamespace, ['pendingOrders', 'ordersByLogin', 'accountOrders']);
      }
      runningRef.current = false;
      if (mounted.current) setRunning(false);
    }
  };

  const disabled = running || investorReadOnly || !scopeCurrent || !mode || affected.length === 0;
  return <Screen>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: T.border }]}>
      <FastPressable onPress={handleBack} activateOnPressIn accessibilityRole="button" accessibilityLabel={t('Back')}
        latencyLabel="pendingBulk.back" hitSlop={12} style={styles.back}>
        <Svg width={24} height={24} viewBox="0 0 24 24" pointerEvents="none">
          <Path d="M19 12H5M12 5l-7 7 7 7" fill="none" stroke={T.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </FastPressable>
      <Text accessibilityRole="header" numberOfLines={2} style={[styles.title, { color: T.text }]}>{title}</Text>
      <View style={styles.back} />
    </View>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="always" canCancelContentTouches={Platform.OS === 'ios'}>
      {!scopeCurrent ? <Text accessibilityRole="alert" style={{ color: T.down }}>{t('The active account changed. Open bulk options from the current account.')}</Text>
        : !mode ? <Text accessibilityRole="alert" style={{ color: T.down }}>{t('Choose a pending-order bulk option from Trade.')}</Text>
          : <>
            <Text style={{ color: T.textSub }}>{t('Review pending orders before deleting. Open positions are not affected.')}</Text>
            {investorReadOnly ? <Text style={{ color: T.down }}>{t('This account is read-only. Pending orders cannot be deleted.')}</Text> : null}
            {isError ? <FastPressable disabled={running} accessibilityRole="button" accessibilityLabel={t('Refresh pending orders')}
              onPress={() => { void refetch(); }}><Text style={{ color: T.down }}>{t('Could not load pending orders. Tap to retry.')}</Text></FastPressable> : null}
            <View style={[styles.card, { backgroundColor: T.glass2, borderColor: T.border }]}>
              <Text style={[styles.count, { color: T.text }]}>{t('Affected Pending Orders')}: {preview.length}</Text>
              <Text style={{ color: T.textSub }}>{t('Symbols')}: {new Set(preview.map(order => order.symbol)).size}</Text>
            </View>
            {preview.map(order => <View key={order.ticket} style={[styles.card, { borderColor: T.border }]}>
              <Text style={[styles.ticket, { color: T.text }]}>#{order.ticket} {order.symbol}</Text>
              <Text style={{ color: order.type.startsWith('buy') ? T.accent : T.down }}>{order.type.replace(/_/g, ' ').toUpperCase()} · {order.volume ?? '—'} {t('lots')}</Text>
              <Text style={{ color: T.textSub }}>{t('Price')}: {order.price ?? '—'}</Text>
            </View>)}
            {!preview.length ? <Text style={{ color: T.textMuted }}>{t('No pending orders match this operation.')}</Text> : null}
            {running ? <View accessibilityLiveRegion="polite" style={styles.progress}>
              <ActivityIndicator color={T.accent} />
              <Text style={{ color: T.text }}>{t('Deleting pending orders')}: {progress.completed}/{progress.total}</Text>
              <Text style={{ color: T.textSub }}>{t('Leaving this page stops the remaining deletions.')}</Text>
            </View> : null}
            {summary ? <View accessibilityLiveRegion="polite" style={[styles.card, { borderColor: T.border }]}>
              <Text style={{ color: T.text }}>{t('Deleted')}: {summary.cancelled} · {t('Failed')}: {summary.failed}</Text>
              <Text style={{ color: T.textSub }}>{t('No longer pending')}: {summary.skipped} · {t('Not attempted')}: {summary.notAttempted}</Text>
            </View> : null}
            {error ? <Text accessibilityRole="alert" style={{ color: T.down }}>{error}</Text> : null}
            <FastPressable accessibilityRole="button" accessibilityLabel={t('Delete reviewed pending orders')}
              accessibilityState={{ disabled, busy: running }} disabled={disabled} onPress={() => { void execute(); }}
              latencyLabel="pendingBulk.execute" style={[styles.execute, { backgroundColor: T.down, opacity: disabled ? 0.45 : 1 }]}>
              <Text style={styles.executeText}>{running ? t('Deleting…') : t('Delete {count} pending orders').replace('{count}', String(affected.length))}</Text>
            </FastPressable>
          </>}
    </ScrollView>
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title: { flex: 1, minWidth: 0, textAlign: 'center', fontSize: 17, fontWeight: '500', paddingHorizontal: 8 },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  card: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 6 },
  count: { fontSize: 17, fontWeight: '600' },
  ticket: { fontSize: 15, fontWeight: '600' },
  progress: { gap: 10, alignItems: 'center', paddingVertical: 12 },
  execute: { minHeight: 48, padding: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  executeText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', textAlign: 'center' },
});
