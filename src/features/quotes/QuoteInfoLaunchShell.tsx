import { Ionicons } from '@expo/vector-icons';
import { memo, useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { normalizeSymbol } from '../../domain/symbols';
import { useTranslation } from '../../i18n/useTranslation';
import { FastPressable } from '../../ui/components/FastPressable';
import { useTheme, type ThemeColors } from '../../ui/theme/useTheme';
import { useIsDarkTheme } from '../../state/themeMode';
import { fmt } from '../../utils/format';
import type { QuoteInfoLaunchDestination } from './quoteInfoLaunchController';
import {
  hasDisplayableLiveQuotePrice,
  type LiveQuoteSnapshot,
} from './liveQuoteSnapshot';
import { getMeta } from './SymbolDetailsScreen/instrumentMeta';
import { useLiveQuoteSnapshot } from './useLiveQuotes';

type QuoteInfoLaunchShellProps = Readonly<{
  /** When true, live tick updates repaint the shell. Off when hidden. */
  active?: boolean;
  backLatencyLabel?: string;
  destination: QuoteInfoLaunchDestination;
  onBack: () => void;
  symbol: string;
}>;

const finiteOrUndefined = (value: number | undefined | null): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const formatPriceOrDash = (value: number | undefined, digits: number) =>
  value === undefined ? '--' : fmt.price(value, digits);

const formatPctOrDash = (value: number | undefined) => {
  if (value === undefined) return '--.--%';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
};

const formatPointsOrDash = (value: number | undefined) => {
  if (value === undefined) return '--';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(0)}`;
};

type LaunchQuoteReadout = Readonly<{
  askText: string;
  bidText: string;
  changePct: number | undefined;
  changeText: string;
  highText: string;
  isUp: boolean;
  lowText: string;
  openText: string;
  pointsText: string;
  spreadText: string;
}>;

function buildLaunchQuoteReadout(quote: LiveQuoteSnapshot | undefined): LaunchQuoteReadout {
  const displayable = hasDisplayableLiveQuotePrice(quote);
  const digits = Math.max(0, Math.min(8, Math.floor(quote?.digits ?? 5)));
  const bid = displayable ? finiteOrUndefined(quote?.bid) : undefined;
  const ask = displayable ? finiteOrUndefined(quote?.ask) : undefined;
  const high = finiteOrUndefined(quote?.high);
  const low = finiteOrUndefined(quote?.low);
  const open = finiteOrUndefined(quote?.open) ?? finiteOrUndefined(quote?.close) ?? bid;
  const changePct = finiteOrUndefined(quote?.changePct);
  const spread = finiteOrUndefined(quote?.spread);
  const pip = 1 / Math.pow(10, digits);
  const points = bid !== undefined && open !== undefined && pip > 0
    ? (bid - open) / pip
    : undefined;

  return {
    askText: formatPriceOrDash(ask, digits),
    bidText: formatPriceOrDash(bid, digits),
    changePct,
    changeText: formatPctOrDash(changePct),
    highText: formatPriceOrDash(high, digits),
    isUp: (changePct ?? 0) >= 0,
    lowText: formatPriceOrDash(low, digits),
    openText: formatPriceOrDash(open, digits),
    pointsText: formatPointsOrDash(points),
    spreadText: spread === undefined
      ? '--'
      : parseFloat(Number(spread).toFixed(2)).toString(),
  };
}

/**
 * New-Order-weight launch shell for Properties and Market Statistics.
 * Always cheap to paint: header + bid/ask + three metrics + a short row card.
 * Full interactive screens mount only on the real routes behind this cover.
 */
export const QuoteInfoLaunchShell = memo(function QuoteInfoLaunchShell({
  active = false,
  backLatencyLabel = 'quoteInfo.shell.back',
  destination,
  onBack,
  symbol,
}: QuoteInfoLaunchShellProps) {
  const normalizedSymbol = normalizeSymbol(symbol || 'EURUSD');
  const displaySymbol = normalizedSymbol.replace(/\//g, '');
  const insets = useSafeAreaInsets();
  const T = useTheme({ active });
  const { t } = useTranslation();
  const isDark = useIsDarkTheme({ active });
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);
  const liveQuote = useLiveQuoteSnapshot(normalizedSymbol, active);
  const readout = useMemo(() => buildLaunchQuoteReadout(liveQuote), [liveQuote]);
  const isProperties = destination === 'properties';
  const title = isProperties ? t('Quote Details') : t('Market Statistics');
  const instrumentName = useMemo(
    () => getMeta(normalizedSymbol).name,
    [normalizedSymbol],
  );
  const changeAccent = readout.changePct === undefined
    ? T.textSub
    : readout.isUp
      ? T.up
      : T.down;
  const marketOpen = liveQuote?.tradeAllowed !== false;
  const marketStatusColor = marketOpen ? T.up : T.down;

  return (
    <View
      style={styles.root}
      testID={'quote-info-launch-shell-' + destination}
    >
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <FastPressable
          onPress={onBack}
          activateOnPressIn
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
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {active ? (
        <View style={styles.body}>
        <View style={styles.hero}>
          <View style={styles.instrumentRow}>
            <View style={styles.symbolMark}>
              <Ionicons
                name={isProperties ? 'document-text-outline' : 'stats-chart-outline'}
                size={20}
                color={T.trading.buy.primary}
              />
            </View>
            <View style={styles.instrumentCopy}>
              <Text style={styles.symbol}>{displaySymbol}</Text>
              <Text style={styles.instrumentName} numberOfLines={1}>{instrumentName}</Text>
            </View>
            <View style={[styles.marketChip, { borderColor: marketStatusColor }]}>
              <View style={[styles.marketDot, { backgroundColor: marketStatusColor }]} />
              <Text style={[styles.marketChipText, { color: marketStatusColor }]}>
                {marketOpen ? t('Open') : t('Closed')}
              </Text>
            </View>
          </View>

          <View style={styles.quoteBand}>
            <View style={styles.quoteSide}>
              <Text style={[styles.quoteLabel, { color: T.down }]}>
                {isProperties ? t('SELL') : t('BID')}
              </Text>
              <Text style={styles.quoteValue}>{readout.bidText}</Text>
            </View>
            <View style={styles.quoteDivider} />
            <View style={styles.quoteSide}>
              <Text style={[styles.quoteLabel, { color: T.trading.buy.primary }]}>
                {isProperties ? t('BUY') : t('ASK')}
              </Text>
              <Text style={styles.quoteValue}>{readout.askText}</Text>
            </View>
          </View>
        </View>

        <View style={styles.changeStrip}>
          <LaunchMetric
            label={t('Change')}
            value={readout.changeText}
            valueColor={changeAccent}
            styles={styles}
          />
          <LaunchMetric
            label={t('Points')}
            value={readout.pointsText}
            valueColor={changeAccent}
            styles={styles}
          />
          <LaunchMetric label={t('Spread')} value={readout.spreadText} styles={styles} />
        </View>

        <LaunchSection
          title={isProperties ? t('Contract Specification') : t('Session Statistics')}
          styles={styles}
        >
          <LaunchRow label={t('Bid high')} value={readout.highText} styles={styles} />
          <LaunchRow label={t('Bid low')} value={readout.lowText} styles={styles} />
          <LaunchRow label={t('Open price')} value={readout.openText} styles={styles} last />
        </LaunchSection>
        </View>
      ) : null}
    </View>
  );
});

type LaunchStyles = ReturnType<typeof makeStyles>;

function LaunchSection({
  children,
  styles,
  title,
}: {
  children: ReactNode;
  styles: LaunchStyles;
  title: string;
}) {
  return (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function LaunchRow({
  label,
  last = false,
  styles,
  value,
}: {
  label: string;
  last?: boolean;
  styles: LaunchStyles;
  value: string;
}) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function LaunchMetric({
  label,
  styles,
  value,
  valueColor,
}: {
  label: string;
  styles: LaunchStyles;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

function makeStyles(T: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    backButton: {
      alignItems: 'flex-start',
      height: 44,
      justifyContent: 'center',
      width: 42,
    },
    body: {
      paddingBottom: 28,
      paddingHorizontal: 14,
      paddingTop: 12,
    },
    changeStrip: {
      backgroundColor: T.glass1,
      borderColor: T.border,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: 'row',
      marginTop: 12,
      overflow: 'hidden',
    },
    header: {
      alignItems: 'center',
      backgroundColor: T.bg,
      borderBottomColor: T.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      minHeight: 44,
      paddingHorizontal: 10,
    },
    headerSpacer: {
      width: 42,
    },
    headerTitle: {
      color: T.text,
      flex: 1,
      fontSize: 16,
      fontWeight: '500',
      textAlign: 'center',
    },
    hero: {
      backgroundColor: T.glass1,
      borderColor: T.border,
      borderRadius: 20,
      borderWidth: 1,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.22 : 0.07,
      shadowRadius: 20,
    },
    instrumentCopy: {
      flex: 1,
      marginLeft: 10,
    },
    instrumentName: {
      color: T.textSub,
      fontSize: 12,
      marginTop: 2,
    },
    instrumentRow: {
      alignItems: 'center',
      flexDirection: 'row',
      padding: 14,
    },
    marketChip: {
      alignItems: 'center',
      borderColor: T.border,
      borderRadius: 999,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    marketChipText: {
      fontSize: 10,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    marketDot: {
      borderRadius: 3,
      height: 6,
      width: 6,
    },
    metric: {
      alignItems: 'center',
      borderRightColor: T.border,
      borderRightWidth: StyleSheet.hairlineWidth,
      flex: 1,
      paddingVertical: 12,
    },
    metricLabel: {
      color: T.textSub,
      fontSize: 10,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    metricValue: {
      color: T.text,
      fontSize: 15,
      fontWeight: '700',
      marginTop: 4,
    },
    quoteBand: {
      backgroundColor: T.glass2,
      borderTopColor: T.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
    },
    quoteDivider: {
      backgroundColor: T.border,
      width: StyleSheet.hairlineWidth,
    },
    quoteLabel: {
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.9,
    },
    quoteSide: {
      alignItems: 'center',
      flex: 1,
      paddingVertical: 12,
    },
    quoteValue: {
      color: T.text,
      fontSize: 23,
      fontVariant: ['tabular-nums'],
      fontWeight: '700',
      marginTop: 4,
    },
    root: {
      backgroundColor: T.bg,
      flex: 1,
    },
    row: {
      alignItems: 'center',
      borderBottomColor: T.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: 45,
      paddingHorizontal: 14,
    },
    rowLabel: {
      color: T.textSub,
      fontSize: 13,
      fontWeight: '500',
    },
    rowLast: {
      borderBottomWidth: 0,
    },
    rowValue: {
      color: T.text,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
      fontWeight: '600',
    },
    sectionCard: {
      backgroundColor: T.glass1,
      borderColor: T.border,
      borderRadius: 12,
      borderWidth: 1,
      overflow: 'hidden',
    },
    sectionTitle: {
      color: T.textSub,
      fontSize: 10,
      fontWeight: '700',
      letterSpacing: 0.8,
      marginBottom: 7,
      textTransform: 'uppercase',
    },
    sectionWrap: {
      marginTop: 16,
    },
    symbol: {
      color: T.text,
      fontSize: 19,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    symbolMark: {
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(59,130,246,0.14)' : 'rgba(37,99,235,0.08)',
      borderColor: T.border,
      borderRadius: 10,
      borderWidth: 1,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
  });
}
