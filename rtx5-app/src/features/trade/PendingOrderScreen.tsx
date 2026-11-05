import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import Svg, { Path } from 'react-native-svg';
import { usePendingOrdersQuery } from '../../query/pendingOrders';
import { useActiveBrokerQuerySession, invalidateSessionQueryRoots } from '../../query/authenticatedQueryScope';
import { captureActiveBrokerSessionOwnerStamp, isActiveBrokerSessionOwnerStampCurrent } from '../../state/activeBrokerSession';
import { useInstrumentMeta } from '../../query/instruments';
import { useExecutableQuote } from '../quotes/useExecutableQuote';
import { cancelPendingOrder, modifyPendingOrder, type ModifyPendingOrderInput } from '../../api/orders/pendingOrders';
import { pendingExpiry, pendingPriceRulesReady, roundPendingPrice, validatePendingOrder, type PendingTimeInForce } from '../../domain/pendingOrders';
import { PendingOrderFields } from './PendingOrderFields';
import { useTheme } from '../../ui/theme/useTheme';
import { FastPressable } from '../../ui/components/FastPressable';
import { Screen } from '../../ui/components/Screen';
import { blockInvestorTradeAction, useInvestorReadOnlySession } from '../../hooks/useInvestorReadOnlySession';
import { classifyTradingError } from '../../api/tradingErrors';
import { safeRouterBack } from '../../utils/navigation';

export function PendingOrderScreen() {
  const params = useLocalSearchParams<{ ticket: string; accountScope?: string }>();
  const T = useTheme();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const navigation = useNavigation();
  const focusVisit = useRef(0);
  const backNavigationStarted = useRef(false);
  useFocusEffect(useCallback(() => {
    backNavigationStarted.current = false;
    focusVisit.current += 1;
    // Leaving and returning must not revive an earlier request's navigation.
    return () => { focusVisit.current += 1; };
  }, []));
  useEffect(() => navigation.addListener('beforeRemove', () => {
    // Native Back can remove this route before focus changes. Invalidate any
    // pending Save/Delete completion at the start of that removal as well.
    backNavigationStarted.current = true;
    focusVisit.current += 1;
  }), [navigation]);
  const handleBack = useCallback(() => {
    if (!navigation.isFocused() || backNavigationStarted.current) return;
    backNavigationStarted.current = true;
    // Invalidate callbacks now: the native stack can report focus until the
    // pop finishes, and a completed request must not pop the destination too.
    focusVisit.current += 1;
    // The screen navigator binds Back to this route. Expo's global router.back
    // queues an unscoped action that may run after the active route changes.
    safeRouterBack({
      canGoBack: () => navigation.canGoBack(),
      back: () => navigation.goBack(),
      replace: href => router.replace(href),
    }, '/(tabs)/trade');
  }, [navigation]);
  const session = useActiveBrokerQuerySession();
  const initialScope = useRef(params.accountScope ?? session?.cacheNamespace);
  const scopeCurrent = Boolean(session && initialScope.current === session.cacheNamespace);
  const { data: orders, isError, refetch } = usePendingOrdersQuery(focused && scopeCurrent);
  const order = scopeCurrent ? orders.find(row => String(row.ticket) === params.ticket) : undefined;
  const { data: meta } = useInstrumentMeta(order?.symbol ?? '', focused && scopeCurrent);
  const { quote, getCurrentAvailability } = useExecutableQuote(order?.symbol ?? '', focused && scopeCurrent, 100);
  const queryClient = useQueryClient();
  const investorReadOnly = useInvestorReadOnlySession();
  const [price, setPrice] = useState(0);
  const [priceLimit, setPriceLimit] = useState(0);
  const [sl, setSl] = useState(0);
  const [tp, setTp] = useState(0);
  const [timeInForce, setTimeInForce] = useState<PendingTimeInForce>('GTC');
  const [expiry, setExpiry] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const submitLock = useRef(false);
  const [error, setError] = useState('');
  const seeded = useRef(false);
  useEffect(() => {
    if (!order || seeded.current) return;
    seeded.current = true;
    setPrice(Number(order.price)); setPriceLimit(Number(order.priceLimit));
    setTimeInForce(order.timeInForce ?? 'GTC'); setExpiry(order.expiry);
    // Editing an existing order must preserve its saved protection levels.
    // An absent level stays blank; market quotes never seed protection.
    setSl(Number(order.sl ?? 0)); setTp(Number(order.tp ?? 0));
  }, [order]);
  const rules = { digits: meta?.digits, tickSize: meta?.tickSize, stopsLevel: meta?.stopsLevel };
  const submit = async (cancel: boolean) => {
    if (!navigation.isFocused() || backNavigationStarted.current || !order || busy || submitLock.current || !scopeCurrent || blockInvestorTradeAction()) return;
    const visit = focusVisit.current;
    const ownsScreen = () => navigation.isFocused() && focusVisit.current === visit;
    const owner = captureActiveBrokerSessionOwnerStamp();
    if (!owner || owner.cacheNamespace !== initialScope.current || Number(owner.accountLogin) !== order.accountLogin) return;
    const roundedPrice = roundPendingPrice(price, rules);
    const roundedLimit = priceLimit > 0 ? roundPendingPrice(priceLimit, rules) : 0;
    const roundedSl = sl > 0 ? roundPendingPrice(sl, rules) : null;
    const roundedTp = tp > 0 ? roundPendingPrice(tp, rules) : null;
    if (!cancel) {
      if (!pendingPriceRulesReady(rules)) { setError('Wait for the symbol price precision and stop distance to load.'); return; }
      const quoteState = getCurrentAvailability();
      const changesTrigger = roundedPrice !== Number(order.price);
      if (changesTrigger && !quoteState.allowed) { setError('Wait for a fresh live Bid/Ask quote before changing the trigger price.'); return; }
      const validation = validatePendingOrder({ ...rules, type: order.type, price: roundedPrice, priceLimit: roundedLimit,
        sl: roundedSl, tp: roundedTp, bid: quoteState.allowed ? quoteState.bid : undefined,
        ask: quoteState.allowed ? quoteState.ask : undefined, validateTrigger: changesTrigger });
      if (validation) { setError(validation); return; }
    }
    submitLock.current = true;
    setError(''); setBusy(true);
    try {
      if (cancel) await cancelPendingOrder(order.ticket);
      else await modifyPendingOrder(order.ticket, {
        price: roundedPrice, ...(order.type.endsWith('_stop_limit') ? { price_limit: roundedLimit } : {}),
        sl: roundedSl, tp: roundedTp, time_in_force: timeInForce, expiry: pendingExpiry(timeInForce, expiry),
      });
      if (!isActiveBrokerSessionOwnerStampCurrent(owner)) return;
      void invalidateSessionQueryRoots(queryClient, owner.cacheNamespace, ['pendingOrders', 'ordersByLogin', 'accountOrders']);
      if (ownsScreen()) handleBack();
    } catch (failure) {
      if (ownsScreen() && isActiveBrokerSessionOwnerStampCurrent(owner)) {
        setError(classifyTradingError(failure, { action: cancel ? 'cancel-pending-order' : 'place-order' }).message);
      }
    } finally { submitLock.current = false; setBusy(false); }
  };
  return <Screen>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={[styles.header, { paddingTop: Math.max(0, insets.top) + 8, borderBottomColor: T.border }]}>
      <FastPressable onPress={handleBack}
        accessibilityRole="button" accessibilityLabel="Back" latencyLabel="pendingOrder.back" hitSlop={12}
        unstable_pressDelay={0} style={styles.back}>
        <Svg width={24} height={24} viewBox="0 0 24 24" pointerEvents="none">
          <Path d="M19 12H5M12 5l-7 7 7 7" fill="none" stroke={T.text}
            strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </FastPressable>
      <Text accessibilityRole="header" numberOfLines={2} style={[styles.title, { color: T.text }]}>
        {`Pending Order #${params.ticket}`}
      </Text>
      <View pointerEvents="none" style={styles.back} />
    </View>
    <ScrollView style={styles.scroll} keyboardShouldPersistTaps="always" canCancelContentTouches={Platform.OS === 'ios'} contentContainerStyle={{ padding: 16, gap: 12 }}>
      {!scopeCurrent ? <Text style={{ color: T.text }}>The active account changed. Open this order from the current account.</Text>
        : !order ? <View style={{ gap: 12 }}><Text style={{ color: T.text }}>{isError ? 'Could not load pending orders.' : (error || 'Order is no longer pending.')}</Text>
          <FastPressable onPress={() => { void refetch(); }}><Text style={{ color: T.accent }}>Refresh</Text></FastPressable></View>
          : <>
            <Text style={{ color: T.text, fontSize: 18, fontWeight: '600' }}>{order.symbol} · {order.type.replace(/_/g, ' ').toUpperCase()} · {order.volume} lots</Text>
            <Text style={{ color: T.textMuted }}>Current SL: {order.sl ?? 'not set'} · TP: {order.tp ?? 'not set'}. Blank fields below clear these values when you save.</Text>
            <PendingOrderFields type={order.type} price={price} priceLimit={priceLimit} sl={sl} tp={tp}
              onPrice={setPrice} onPriceLimit={setPriceLimit} onSl={setSl} onTp={setTp} rules={rules}
              bid={quote?.bid} ask={quote?.ask} timeInForce={timeInForce} expiry={expiry}
              onExpiration={(mode, timestamp) => { setTimeInForce(mode); setExpiry(timestamp); }} disabled={busy || investorReadOnly} />
            {error ? <Text accessibilityRole="alert" style={{ color: T.down }}>{error}</Text> : null}
            {busy ? <ActivityIndicator color={T.accent} /> : null}
            {investorReadOnly ? (
              <Text style={{ color: T.textMuted }}>You are logged in with a read-only (investor) password. Pending orders cannot be modified or cancelled.</Text>
            ) : (
              <>
                <FastPressable disabled={busy} onPress={() => { void submit(false); }} accessibilityRole="button" accessibilityLabel="Save pending order"
                  style={{ padding: 16, borderRadius: 8, backgroundColor: T.accent, opacity: busy ? 0.5 : 1 }}>
                  <Text style={{ color: '#FFFFFF', textAlign: 'center', fontWeight: '600' }}>Save Changes</Text>
                </FastPressable>
                <FastPressable disabled={busy} onPress={() => {
                  const visit = focusVisit.current;
                  Alert.alert('Cancel pending order', `Delete pending order #${order.ticket}?`, [
                    { text: 'Keep Order', style: 'cancel' }, { text: 'Delete Order', style: 'destructive', onPress: () => {
                      if (focusVisit.current === visit) void submit(true);
                    } },
                  ]);
                }} style={{ padding: 16 }} accessibilityRole="button" accessibilityLabel="Delete pending order">
                  <Text style={{ color: T.down, textAlign: 'center' }}>Delete / Cancel Order</Text>
                </FastPressable>
              </>
            )}
          </>}
    </ScrollView>
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { width: 44, height: 44, flexShrink: 0, padding: 0, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, minWidth: 0, textAlign: 'center', fontSize: 17, fontWeight: '500', paddingHorizontal: 8 },
  scroll: { flex: 1 },
});
