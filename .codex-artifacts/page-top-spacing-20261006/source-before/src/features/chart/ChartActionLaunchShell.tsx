import { Ionicons } from '@expo/vector-icons';
import { memo, useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { normalizeSymbol } from '../../domain/symbols';
import { useTranslation } from '../../i18n/useTranslation';
import { useIsDarkTheme } from '../../state/themeMode';
import { FastPressable } from '../../ui/components/FastPressable';
import { useTheme, type ThemeColors } from '../../ui/theme/useTheme';
import type { ChartActionLaunchDestination } from './chartActionLaunchController';

type ChartActionLaunchShellProps = Readonly<{
  /** Keep the prepared header mounted, but only build the destination body while shown. */
  active?: boolean;
  destination: ChartActionLaunchDestination;
  onBack: () => void;
  symbol: string;
}>;

/**
 * Always-mounted, deliberately lightweight first frame for heavy Chart More
 * destinations. It mirrors each destination's real header and opening cards
 * without starting queries, candle calculations, timers, or editor trees.
 */
export const ChartActionLaunchShell = memo(function ChartActionLaunchShell({
  active = false,
  destination,
  onBack,
  symbol,
}: ChartActionLaunchShellProps) {
  const normalizedSymbol = normalizeSymbol(symbol || 'EURUSD');
  const displaySymbol = normalizedSymbol.replace(/\//g, '');
  const insets = useSafeAreaInsets();
  // These shells are tiny and retained. Keep their palette current while
  // hidden because native visibility changes one frame before React renders.
  const T = useTheme();
  const isDark = useIsDarkTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);
  const title = destination === 'objects'
    ? t('Objects')
    : destination === 'calculator'
      ? t('Calculator')
      : destination === 'analytics'
        ? t('Analytics')
        : t('Specification');

  return (
    <View style={styles.root} testID={`chart-action-launch-shell-${destination}`}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 12 }]}>
        <FastPressable
          onPress={onBack}
          activateOnPressIn
          activateOnTouchStart
          unstable_pressDelay={0}
          latencyLabel={`chart.launch.${destination}.back`}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={t('Back')}
        >
          <Ionicons name="arrow-back" size={24} color={T.text} />
        </FastPressable>
        <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit>
          {title}{destination === 'objects' ? '' : ` · ${displaySymbol}`}
        </Text>
        <View style={styles.backButton} />
      </View>

      {active ? (
        destination === 'objects' ? (
          <ObjectsLaunchBody symbol={displaySymbol} styles={styles} T={T} t={t} />
        ) : destination === 'calculator' ? (
          <CalculatorLaunchBody styles={styles} T={T} t={t} />
        ) : destination === 'analytics' ? (
          <AnalyticsLaunchBody styles={styles} T={T} t={t} />
        ) : (
          <SpecificationLaunchBody styles={styles} T={T} t={t} />
        )
      ) : null}
    </View>
  );
});

type LaunchStyles = ReturnType<typeof makeStyles>;
type Translate = (key: string) => string;

function ObjectsLaunchBody({
  symbol,
  styles,
  T,
  t,
}: {
  symbol: string;
  styles: LaunchStyles;
  T: ThemeColors;
  t: Translate;
}) {
  return (
    <View style={styles.body}>
      <Text style={styles.objectsSubtitle}>{symbol} {t('chart objects')}</Text>
      <SectionLabel styles={styles}>{t('ACTIONS')}</SectionLabel>
      <View style={styles.card}>
        <LaunchActionRow
          icon="analytics-outline"
          label={t('Add object')}
          subtitle={t('Trend line, fib zone, highlight and more')}
          styles={styles}
          T={T}
        />
        <LaunchActionRow
          icon="text-outline"
          label={t('Add text')}
          subtitle={t('Place a text label on the chart')}
          styles={styles}
          T={T}
        />
        <LaunchActionRow
          icon="text-outline"
          label={t('Add text level')}
          subtitle={t('Mark a horizontal price level')}
          styles={styles}
          T={T}
          last
        />
      </View>
      <SectionLabel styles={styles}>{t('CONTROLS')}</SectionLabel>
      <View style={styles.card}>
        <StaticToggleRow label={t('Locked all')} subtitle={t('Prevent object edits on the chart')} styles={styles} />
        <StaticToggleRow label={t('Hidden all')} subtitle={t('Hide every drawing on the chart')} styles={styles} last />
      </View>
    </View>
  );
}

function CalculatorLaunchBody({
  styles,
  T,
  t,
}: {
  styles: LaunchStyles;
  T: ThemeColors;
  t: Translate;
}) {
  return (
    <View style={styles.body}>
      <View style={styles.segmented}>
        <View style={[styles.segment, styles.segmentActive]}><Text style={styles.segmentTextActive}>{t('Buy')}</Text></View>
        <View style={styles.segment}><Text style={styles.segmentText}>{t('Sell')}</Text></View>
      </View>
      <FieldLabel styles={styles}>{t('Volume, lots')}</FieldLabel>
      <View style={styles.stepperField}>
        <Ionicons name="remove" size={18} color={T.textMuted} />
        <Text style={styles.fieldValue}>0.01</Text>
        <Ionicons name="add" size={18} color={T.textMuted} />
      </View>
      <FieldLabel styles={styles}>{t('Leverage')}</FieldLabel>
      <View style={styles.selectField}>
        <Text style={styles.fieldValue}>1:2000 ({t('Account leverage')})</Text>
        <Ionicons name="chevron-down" size={17} color={T.textMuted} />
      </View>
      <FieldLabel styles={styles}>{t('Open at')}</FieldLabel>
      <View style={styles.stepperField}>
        <Ionicons name="remove" size={18} color={T.textMuted} />
        <Text style={styles.fieldPlaceholder}>{t('Market price')}</Text>
        <Ionicons name="add" size={18} color={T.textMuted} />
      </View>
      <FieldLabel styles={styles}>{t('Close at')}</FieldLabel>
      <View style={styles.stepperField}>
        <Ionicons name="remove" size={18} color={T.textMuted} />
        <Text style={styles.fieldPlaceholder}>0.000</Text>
        <Ionicons name="add" size={18} color={T.textMuted} />
      </View>
      <View style={[styles.card, styles.summaryCard]}>
        {[t('Required Margin'), t('Free Margin'), t('Max Lots'), t('Commission'), t('Spread')].map((label, index, rows) => (
          <View key={label} style={[styles.summaryRow, index === rows.length - 1 && styles.rowLast]}>
            <Text style={styles.rowLabel}>{label}</Text>
            <View style={styles.summaryValueWrap}>
              <Text style={styles.rowValue}>—</Text>
              <Ionicons name="information-circle-outline" size={17} color={T.textMuted} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function AnalyticsLaunchBody({
  styles,
  T,
  t,
}: {
  styles: LaunchStyles;
  T: ThemeColors;
  t: Translate;
}) {
  return (
    <View style={styles.body}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('Performance Snapshot')}</Text>
        <View style={styles.performanceRow}>
          {[t('Hour'), t('Today'), t('Week'), t('Month'), t('Year')].map((label) => (
            <View key={label} style={styles.performanceItem}>
              <Text style={styles.performanceLabel}>{label}</Text>
              <View style={styles.performanceValueRow}>
                <Ionicons name="arrow-up" size={10} color={T.trading.buy.primary} />
                <Text style={[styles.performanceValue, { color: T.trading.buy.primary }]}>0.00%</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
      <View style={[styles.card, styles.analyticsCard]}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle}>{t('Daily Range')}</Text>
          <View style={styles.livePill}><View style={[styles.liveDot, { backgroundColor: T.up }]} /><Text style={[styles.liveText, { color: T.up }]}>{t('Live')}</Text></View>
        </View>
        <Text style={styles.heroPrice}>—</Text>
        <View style={styles.rangeTrack}><View style={[styles.rangeFill, { backgroundColor: T.trading.buy.primary }]} /></View>
        <View style={styles.rangeLabels}>
          <Text style={styles.fieldPlaceholder}>{t('Low')}</Text>
          <Text style={styles.fieldPlaceholder}>{t('High')}</Text>
        </View>
      </View>
      <View style={[styles.card, styles.analyticsCard]}>
        <Text style={styles.cardTitle}>{t('High Margin Requirements')}</Text>
        <Text style={styles.cardSubtitle}>{t('Upcoming periods for this instrument')}</Text>
      </View>
    </View>
  );
}

function SpecificationLaunchBody({
  styles,
  T,
  t,
}: {
  styles: LaunchStyles;
  T: ThemeColors;
  t: Translate;
}) {
  const rows = [
    t('Minimum volume, lots'),
    t('Maximum volume, lots'),
    t('Step'),
    t('Contract size'),
    t('Spread'),
    t('Stop level, pips'),
  ];
  return (
    <View style={styles.body}>
      <SectionLabel styles={styles}>{t('TRADING HOURS')}</SectionLabel>
      <View style={[styles.card, styles.tradingHoursCard]}>
        <View style={styles.timeIcon}><Ionicons name="time-outline" size={20} color={T.textMuted} /></View>
        <View style={styles.tradingHoursCopy}>
          <Text style={styles.actionLabel}>{t('Loading...')}</Text>
          <Text style={styles.actionSubtitle}>--:--:--</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={T.textMuted} />
      </View>
      <SectionLabel styles={styles}>{t('INFO')}</SectionLabel>
      <View style={styles.card}>
        {rows.map((label, index) => (
          <View key={label} style={[styles.summaryRow, index === rows.length - 1 && styles.rowLast]}>
            <Text style={styles.rowLabel}>{label}</Text>
            <Text style={styles.rowValue}>—</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function SectionLabel({ children, styles }: { children: ReactNode; styles: LaunchStyles }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function FieldLabel({ children, styles }: { children: ReactNode; styles: LaunchStyles }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

function LaunchActionRow({
  icon,
  label,
  last = false,
  styles,
  subtitle,
  T,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  last?: boolean;
  styles: LaunchStyles;
  subtitle: string;
  T: ThemeColors;
}) {
  return (
    <View style={[styles.actionRow, last && styles.rowLast]}>
      <View style={styles.actionIcon}><Ionicons name={icon} size={22} color={T.trading.buy.primary} /></View>
      <View style={styles.actionCopy}>
        <Text style={styles.actionLabel}>{label}</Text>
        <Text style={styles.actionSubtitle} numberOfLines={1}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={19} color={T.textMuted} />
    </View>
  );
}

function StaticToggleRow({
  label,
  last = false,
  styles,
  subtitle,
}: {
  label: string;
  last?: boolean;
  styles: LaunchStyles;
  subtitle: string;
}) {
  return (
    <View style={[styles.actionRow, last && styles.rowLast]}>
      <View style={styles.actionCopy}>
        <Text style={styles.actionLabel}>{label}</Text>
        <Text style={styles.actionSubtitle}>{subtitle}</Text>
      </View>
      <View style={styles.toggleTrack}><View style={styles.toggleThumb} /></View>
    </View>
  );
}

function makeStyles(T: ThemeColors, isDark: boolean) {
  const surface = isDark ? T.glass2 : '#FFFFFF';
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: T.bg },
    header: {
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: T.borderSubtle,
      backgroundColor: T.bg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    backButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '500', color: T.text },
    body: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
    objectsSubtitle: { textAlign: 'center', color: T.textMuted, fontSize: 14, fontWeight: '600', marginBottom: 16 },
    sectionLabel: { color: T.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, marginTop: 14, marginBottom: 10 },
    card: { backgroundColor: surface, borderWidth: StyleSheet.hairlineWidth, borderColor: T.border, borderRadius: 14, overflow: 'hidden' },
    actionRow: { minHeight: 72, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: T.borderSubtle },
    rowLast: { borderBottomWidth: 0 },
    actionIcon: { width: 48, height: 48, borderRadius: 12, backgroundColor: isDark ? T.glass3 : '#EAF0FF', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    actionCopy: { flex: 1, minWidth: 0 },
    actionLabel: { color: T.text, fontSize: 16, fontWeight: '600' },
    actionSubtitle: { color: T.textMuted, fontSize: 13, marginTop: 4 },
    toggleTrack: { width: 42, height: 24, borderRadius: 12, backgroundColor: isDark ? '#3A414C' : '#CBD5E1', justifyContent: 'center', paddingHorizontal: 2 },
    toggleThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF' },
    segmented: { height: 40, flexDirection: 'row', padding: 3, borderRadius: 8, backgroundColor: surface, marginBottom: 14 },
    segment: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
    segmentActive: { backgroundColor: isDark ? T.glass3 : '#EAF0F4' },
    segmentText: { color: T.textMuted, fontSize: 13, fontWeight: '600' },
    segmentTextActive: { color: T.text, fontSize: 13, fontWeight: '700' },
    fieldLabel: { color: T.textMuted, fontSize: 12, marginTop: 9, marginBottom: 6 },
    stepperField: { height: 46, paddingHorizontal: 14, borderRadius: 8, backgroundColor: surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    selectField: { height: 46, paddingHorizontal: 14, borderRadius: 8, backgroundColor: surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    fieldValue: { color: T.text, fontSize: 13, fontWeight: '500' },
    fieldPlaceholder: { color: T.textMuted, fontSize: 12 },
    summaryCard: { marginTop: 18 },
    summaryRow: { minHeight: 43, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: T.borderSubtle },
    summaryValueWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rowLabel: { color: T.text, fontSize: 13 },
    rowValue: { color: T.textMuted, fontSize: 13, fontWeight: '500' },
    cardTitle: { color: T.text, fontSize: 15, fontWeight: '700', paddingHorizontal: 14, paddingTop: 14 },
    cardSubtitle: { color: T.textMuted, fontSize: 13, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 16 },
    performanceRow: { flexDirection: 'row', paddingVertical: 18, paddingHorizontal: 8 },
    performanceItem: { flex: 1, alignItems: 'center' },
    performanceLabel: { color: T.textMuted, fontSize: 10, marginBottom: 7 },
    performanceValueRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    performanceValue: { fontSize: 10, fontWeight: '700' },
    analyticsCard: { marginTop: 16, paddingBottom: 16 },
    cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 14 },
    livePill: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 14 },
    liveDot: { width: 6, height: 6, borderRadius: 3 },
    liveText: { fontSize: 11, fontWeight: '700' },
    heroPrice: { color: T.text, fontSize: 28, fontWeight: '700', paddingHorizontal: 14, paddingTop: 18 },
    rangeTrack: { height: 6, marginHorizontal: 14, marginTop: 24, borderRadius: 3, backgroundColor: T.borderSubtle, overflow: 'hidden' },
    rangeFill: { width: '52%', height: '100%' },
    rangeLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 8 },
    tradingHoursCard: { minHeight: 76, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' },
    timeIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: isDark ? T.glass3 : '#EEF2F7', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    tradingHoursCopy: { flex: 1 },
  });
}
