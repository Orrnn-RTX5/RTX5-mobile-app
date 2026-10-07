import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { normalizeSymbol } from '../../domain/symbols';
import { FastPressable } from '../../ui/components/FastPressable';
import { useTheme, type ThemeColors } from '../../ui/theme/useTheme';
import { useIsDarkTheme } from '../../state/themeMode';
import { useTranslation } from '../../i18n/useTranslation';
import { fmt } from '../../utils/format';
import { hasDisplayableLiveQuotePrice } from '../quotes/liveQuoteSnapshot';
import { useLiveQuoteSnapshot } from '../quotes/useLiveQuotes';

type OrderTicketLaunchShellProps = Readonly<{
  symbol: string;
  onBack: () => void;
  backLatencyLabel?: string;
  /** When true, live ticks repaint bid/ask. Off while hidden. */
  active?: boolean;
}>;

/**
 * Lightweight New Order preview shown while the full ticket loads.
 * Seeds bid/ask from the already-cached live quote store (no new network work).
 */
export const OrderTicketLaunchShell = memo(function OrderTicketLaunchShell({
  symbol,
  onBack,
  backLatencyLabel = 'orderTicket.shell.back',
  active = false,
}: OrderTicketLaunchShellProps) {
  const normalizedSymbol = normalizeSymbol(symbol || 'EURUSD');
  const insets = useSafeAreaInsets();
  // Freeze theme while the shell is hidden so theme taps skip this host.
  const T = useTheme({ active });
  const { t } = useTranslation();
  const isDark = useIsDarkTheme({ active });
  const styles = makeStyles(T, isDark);
  const sellColor = T.trading.sell.primary;
  const buyColor = T.trading.buy.primary;
  const sellBackground = isDark ? 'rgba(255,59,48,0.08)' : 'rgba(220,38,38,0.06)';
  const buyBackground = isDark ? 'rgba(52,125,255,0.14)' : 'rgba(37,99,235,0.08)';
  const liveQuote = useLiveQuoteSnapshot(normalizedSymbol, active);
  const digits = Math.max(0, Math.min(8, Math.floor(liveQuote?.digits ?? 5)));
  const displayable = hasDisplayableLiveQuotePrice(liveQuote);
  const bidText = displayable && typeof liveQuote?.bid === 'number'
    ? fmt.price(liveQuote.bid, digits)
    : '--';
  const askText = displayable && typeof liveQuote?.ask === 'number'
    ? fmt.price(liveQuote.ask, digits)
    : '--';
  const spreadText = displayable && typeof liveQuote?.spread === 'number'
    ? parseFloat(Number(liveQuote.spread).toFixed(1)).toString()
    : '0';

  return (
    <View
      style={[styles.root, { paddingBottom: insets.bottom }]}
      testID="order-ticket-launch-shell"
    >
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <FastPressable
          onPress={onBack}
          activateOnPressIn
          activateOnTouchStart
          latencyLabel={backLatencyLabel}
          latencyBudgetMs={50}
          unstable_pressDelay={0}
          hitSlop={{ top: 24, bottom: 24, left: 24, right: 24 }}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={t('Back')}
        >
          <Ionicons name="arrow-back" size={24} color={T.text} />
        </FastPressable>

        <View style={styles.headerCenter}>
          <Text style={styles.headerSymbol}>{normalizedSymbol.replace(/\//g, '')}</Text>
        </View>

        <View style={styles.symbolButton}>
          <Ionicons name="logo-usd" size={20} color={T.accent} />
        </View>
      </View>

      <View style={styles.pricePanel}>
        <View style={[styles.priceHalf, { backgroundColor: sellBackground }]}>
          <Text style={[styles.priceTag, { color: sellColor }]}>SELL</Text>
          <Text style={styles.priceMain}>{bidText}</Text>
          <Text style={styles.priceLabel}>BID</Text>
        </View>
        <View style={styles.spreadCenter}>
          <Ionicons name="swap-horizontal" size={11} color={T.textSub} />
          <Text style={styles.spreadValue}>{spreadText}</Text>
          <Text style={styles.spreadUnit}>pts</Text>
        </View>
        <View style={[styles.priceHalf, { backgroundColor: buyBackground }]}>
          <Text style={[styles.priceTag, { color: buyColor }]}>BUY</Text>
          <Text style={styles.priceMain}>{askText}</Text>
          <Text style={styles.priceLabel}>ASK</Text>
        </View>
      </View>

      <View style={styles.body}>
        <Text style={styles.sectionTitle}>ORDER TYPE</Text>
        <View style={styles.orderTypeRow}>
          <View style={[styles.orderTypeTab, styles.orderTypeTabActive, { borderColor: buyColor }]}>
            <Text style={[styles.orderTypeText, styles.orderTypeTextActive]}>Market Execution</Text>
          </View>
          <View style={[styles.orderTypeTab, styles.orderTypeTabLocked]}>
            <Text style={styles.orderTypeText}>Buy Limit</Text>
            <Ionicons name="lock-closed" size={12} color={T.textMuted} />
          </View>
          <View style={[styles.orderTypeTab, styles.orderTypeTabLocked]}>
            <Text style={styles.orderTypeText}>Sell Limit</Text>
            <Ionicons name="lock-closed" size={12} color={T.textMuted} />
          </View>
        </View>

        <View style={styles.volumeSection}>
          <Text style={styles.rowLabel}>Volume</Text>
          <View style={styles.volumeStepper}>
            <View style={styles.volumeButton}>
              <Ionicons name="remove" size={18} color={T.textSub} />
            </View>
            <View style={styles.volumeCenter}>
              <Text style={styles.volumeNumber}>0.02</Text>
            </View>
            <View style={styles.volumeButton}>
              <Ionicons name="add" size={18} color={T.textSub} />
            </View>
          </View>
        </View>

        <View style={styles.quickRow}>
          {[0.01, 0.05, 0.10, 0.50, 1.00].map((value) => (
            <View key={value} style={styles.quickPill}>
              <Text style={styles.quickText}>{value.toFixed(2)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.hairline} />
        <View style={styles.sltpRow}>
          <View style={styles.sltpGroup}>
            <Text style={styles.sltpAction}>-</Text>
            <Text style={styles.sltpLabel}>SL</Text>
            <Text style={styles.sltpAction}>+</Text>
          </View>
          <View style={styles.sltpGroup}>
            <Text style={styles.sltpAction}>-</Text>
            <Text style={styles.sltpLabel}>TP</Text>
            <Text style={styles.sltpAction}>+</Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.rowLabel}>{t('Fill Policy')}</Text>
          <Text style={styles.rowValue}>{t('Immediate or Cancel')}</Text>
        </View>
        <View style={styles.hairline} />
      </View>
    </View>
  );
});

function makeStyles(T: ThemeColors, isDark: boolean) {
  const elevated = T.glass1;

  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: T.bg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 14,
      zIndex: 10,
    },
    backButton: {
      width: 44,
      height: 44,
      alignItems: 'flex-start',
      justifyContent: 'center',
    },
    headerCenter: {
      flex: 1,
      alignItems: 'center',
    },
    headerSymbol: {
      color: T.text,
      fontSize: 16,
      fontWeight: '500',
      letterSpacing: 0.3,
    },
    symbolButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(59,130,246,0.12)' : 'rgba(37,99,235,0.08)',
      borderWidth: 1,
      borderColor: T.border,
    },
    pricePanel: {
      flexDirection: 'row',
      direction: 'ltr',
      alignItems: 'center',
      marginHorizontal: 12,
      marginBottom: 12,
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: T.glass2,
      borderWidth: 1,
      borderColor: T.border,
      shadowColor: isDark ? '#000' : '#64748B',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.3 : 0.08,
      shadowRadius: 24,
      elevation: 4,
    },
    priceHalf: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
    },
    priceTag: {
      fontSize: 10,
      fontWeight: '600',
      letterSpacing: 1.2,
    },
    priceMain: {
      color: T.text,
      fontSize: 24,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
      padding: 8,
    },
    priceLabel: {
      color: T.textSub,
      fontSize: 10,
      fontWeight: '600',
      letterSpacing: 0.8,
      marginTop: 2,
    },
    spreadCenter: {
      width: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    spreadValue: {
      color: T.text,
      fontSize: 12,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
      marginTop: 1,
    },
    spreadUnit: {
      color: T.textSub,
      fontSize: 8,
      fontWeight: '600',
    },
    body: {
      paddingHorizontal: 16,
      paddingTop: 6,
    },
    sectionTitle: {
      color: T.textSub,
      fontSize: 10,
      fontWeight: '600',
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginTop: 10,
      marginBottom: 2,
    },
    orderTypeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingTop: 6,
      paddingBottom: 2,
      overflow: 'hidden',
    },
    orderTypeTab: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: elevated,
      borderWidth: 1,
      borderColor: T.border,
    },
    orderTypeTabActive: {
      backgroundColor: isDark ? 'rgba(34,211,238,0.1)' : T.glass3,
    },
    orderTypeTabLocked: {
      opacity: 0.58,
    },
    orderTypeText: {
      color: T.textSub,
      fontSize: 13,
      fontWeight: '600',
    },
    orderTypeTextActive: {
      color: T.text,
    },
    volumeSection: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 8,
    },
    rowLabel: {
      color: T.textSub,
      fontSize: 14,
      fontWeight: '500',
    },
    volumeStepper: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 40,
      borderRadius: 8,
      backgroundColor: elevated,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: T.border,
    },
    volumeButton: {
      width: 40,
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    },
    volumeCenter: {
      paddingHorizontal: 16,
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: T.border,
    },
    volumeNumber: {
      color: T.text,
      fontSize: 18,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    quickRow: {
      flexDirection: 'row',
      gap: 5,
      paddingBottom: 4,
    },
    quickPill: {
      flex: 1,
      paddingVertical: 6,
      borderRadius: 6,
      backgroundColor: elevated,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: T.border,
    },
    quickText: {
      color: T.textSub,
      fontSize: 12,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },
    hairline: {
      height: 1,
      backgroundColor: T.border,
    },
    sltpRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 18,
      paddingVertical: 16,
    },
    sltpGroup: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sltpAction: {
      color: T.accent,
      fontSize: 24,
      lineHeight: 28,
      fontWeight: '700',
    },
    sltpLabel: {
      flex: 1,
      color: T.textMuted,
      fontSize: 18,
      fontWeight: '500',
      textAlign: 'center',
      fontVariant: ['tabular-nums'],
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
    },
    rowValue: {
      color: T.text,
      fontSize: 14,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },
  });
}
