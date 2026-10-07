import { FastPressable as Pressable } from '../../ui/components/FastPressable';
/**
 * Chart Feature UI: ChartSpecificationScreen
 * 
 * Displays strict financial meta-data about the active symbol including 
 * lot sizing, pip value, margin requirements, and swap rates for long/short.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import React, { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../ui/components/Screen';
import { useInstrumentMeta } from '../../query/instruments';
import { useMarketStatus } from '../../query/marketStatus';
import { resolveMarketStatusClosedMessage } from '../../api/marketStatus';
import { useIsDarkTheme } from '../../state/themeMode';
import { useTranslation } from '../../i18n/useTranslation';
import { useTheme, ThemeColors } from '../../ui/theme/useTheme';
import { safeRouterBack } from '../../utils/navigation';
import { resolveTradeVolumeBounds } from '../../utils/tradeVolume';
import { ChartTradingHoursModal } from './ChartTradingHoursModal';
import { scheduleChartActionLaunchCovered } from './chartActionLaunchController';

// Format helpers — show "—" when the broker hasn't returned a value yet so the
// UI never displays a misleading hardcoded number.
const fmtNum = (n: number | undefined, decimals = 2) =>
  n === undefined || n === null || Number.isNaN(n) ? '—' : n.toFixed(decimals);
const fmtStr = (s: string | undefined) =>
  s === undefined || s === null || s === '' ? '—' : s;

// ─── Default trading sessions (standard Forex hours in GMT) ───────────────────
// Used as fallback for the trading hours modal when the API
// doesn't return sessions for the symbol.

const DEFAULT_SESSIONS: Array<[string, string]> = [
  ['Sunday',    '23:05 - 24:00'],
  ['Monday',    '00:00 - 24:00'],
  ['Tuesday',   '00:00 - 24:00'],
  ['Wednesday', '00:00 - 24:00'],
  ['Thursday',  '00:00 - 24:00'],
  ['Friday',    '00:00 - 22:59'],
  ['Saturday',  '-'],
];

// ─── Market status helpers ────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  open: 'Market is open',
  closed: 'Market is closed',
  pre_market: 'Pre-market',
  after_hours: 'After hours',
};

function fmtCountdown(totalSecs: number): string {
  if (totalSecs <= 0 || !Number.isFinite(totalSecs)) return '--:--:--';
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = Math.floor(totalSecs % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function ChartSpecificationScreen() {
  const { launchRevision, symbol } = useLocalSearchParams<{
    launchRevision?: string;
    symbol: string;
  }>();
  const { t } = useTranslation();
  const T = useTheme();
  const isDark = useIsDarkTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);
  const isScreenFocused = useIsFocused();
  const parsedLaunchRevision = Number(launchRevision);
  const resolvedLaunchRevision = Number.isFinite(parsedLaunchRevision)
    ? parsedLaunchRevision
    : undefined;
  const launchBodyLaidOutRef = useRef(false);
  const scheduledCoverageRevisionRef = useRef<number | null>(null);
  const scheduleLaunchCoverageIfReady = useCallback(() => {
    if (
      !isScreenFocused
      || resolvedLaunchRevision === undefined
      || !launchBodyLaidOutRef.current
      || scheduledCoverageRevisionRef.current === resolvedLaunchRevision
    ) {
      return;
    }
    scheduledCoverageRevisionRef.current = resolvedLaunchRevision;
    scheduleChartActionLaunchCovered('specification', resolvedLaunchRevision);
  }, [isScreenFocused, resolvedLaunchRevision]);
  const handleLaunchBodyLayout = useCallback(() => {
    launchBodyLaidOutRef.current = true;
    scheduleLaunchCoverageIfReady();
  }, [scheduleLaunchCoverageIfReady]);
  useEffect(() => {
    scheduleLaunchCoverageIfReady();
  }, [scheduleLaunchCoverageIfReady]);

  const [showTradingHoursModal, setShowTradingHoursModal] = useState(false);

  const currentSymbol = symbol || 'XAU/USD';
  const { data: meta, isLoading: isMetaLoading } = useInstrumentMeta(currentSymbol, isScreenFocused);
  const { data: mktStatus } = useMarketStatus(currentSymbol, isScreenFocused);

  const activeSessions = meta?.sessions ?? DEFAULT_SESSIONS;

  // Live countdown derived from API session_open / session_close timestamps
  const isOpen = mktStatus?.status === 'open' || mktStatus?.status === 'pre_market' || mktStatus?.status === 'after_hours';
  const statusLabel = mktStatus ? (STATUS_LABELS[mktStatus.status] ?? 'Market is closed') : 'Loading...';
  // Contract v3: show the server's reason (e.g. "schedule unavailable") when closed.
  const closedMessage = resolveMarketStatusClosedMessage(mktStatus);

  // Target timestamp: if open → session_close, if closed → session_open (next open)
  const targetTs = isOpen ? mktStatus?.session_close : mktStatus?.session_open;

  const [countdown, setCountdown] = useState('--:--:--');
  useEffect(() => {
    if (!targetTs) { setCountdown('--:--:--'); return; }
    const tick = () => {
      const nowSecs = Math.floor(Date.now() / 1000);
      setCountdown(fmtCountdown(targetTs - nowSecs));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [targetTs]);

  const volumeBounds = useMemo(
    () => resolveTradeVolumeBounds({
      minVolume: meta?.minVolume,
      maxVolume: meta?.maxVolume,
      stepVolume: meta?.stepVolume,
    }),
    [meta?.maxVolume, meta?.minVolume, meta?.stepVolume],
  );

  const infoRows = [
    { label: 'Minimum volume, lots', value: fmtNum(meta?.minVolume ?? volumeBounds.minVolume, volumeBounds.decimals) },
    { label: 'Maximum volume, lots', value: fmtNum(meta?.maxVolume ?? volumeBounds.maxVolume, volumeBounds.decimals) },
    { label: 'Step',                 value: fmtNum(meta?.stepVolume ?? volumeBounds.stepVolume, volumeBounds.decimals) },
    { label: 'Contract size',        value: fmtNum(meta?.contractSize, 0) },
    { label: 'Spread',               value: fmtNum(meta?.spread, 1) },
    { label: 'Stop level, pips',     value: fmtStr(meta?.stopsLevel ?? '0') },
    // Contract v3 instruments carry no swap_* fields: hide the rows instead of
    // showing a fabricated 0.
    ...(typeof meta?.swapLong === 'number' && Number.isFinite(meta.swapLong)
      ? [{ label: 'Swap long, pips', value: fmtNum(meta.swapLong, 1) }]
      : []),
    ...(typeof meta?.swapShort === 'number' && Number.isFinite(meta.swapShort)
      ? [{ label: 'Swap short, pips', value: fmtNum(meta.swapShort, 1) }]
      : []),
  ];

  return (
    <Screen
      collapsable={false}
      onLayout={handleLaunchBodyLayout}
      style={styles.screen}
    >
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 12 }]}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => safeRouterBack(router, '/(tabs)/chart')}
            activateOnPressIn
            hitSlop={16}
            style={styles.headerBackBtn}
          >
            <Ionicons name="arrow-back" size={24} color={isDark ? '#F8FAFC' : '#0F172A'} />
          </Pressable>
          <View style={styles.headerTitleWrap} pointerEvents="none">
            <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit>
              {t('Specification')} · {currentSymbol}
            </Text>
          </View>
          <View style={styles.headerBackBtn} />
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="always"
        canCancelContentTouches={Platform.OS === 'ios'} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Trading Hours Section */}
        <Text style={styles.sectionHeader}>{t('TRADING HOURS')}</Text>
        <Pressable
          style={({ pressed }) => [styles.tradingHoursCard, pressed && styles.cardPressed]}
          onPress={() => setShowTradingHoursModal(true)}
        >
          <View style={[styles.timeIconWrap, !isOpen && styles.timeIconWrapClosed]}>
            <Ionicons name="time-outline" size={20} color={isOpen ? T.trading.buy.primary : T.trading.sell.primary} />
          </View>
          <View style={styles.tradingHoursTextCol}>
            <View style={styles.tradingHoursTitleRow}>
              <View style={[styles.marketStatusDot, !isOpen && styles.marketStatusDotClosed]} />
              <Text style={styles.tradingHoursTitle}>
                {t(statusLabel)}{closedMessage ? ` · ${closedMessage}` : ''}
              </Text>
            </View>
            <Text style={styles.tradingHoursSub}>
              {isOpen ? `${t('Closes in')} ` : `${t('Opens in')} `}{countdown}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={isDark ? '#64748B' : '#94A3B8'} />
        </Pressable>

        {/* Info Section */}
        <Text style={[styles.sectionHeader, { marginTop: 24 }]}>{t('INFO')}</Text>
        <View style={styles.infoCard}>
          {infoRows.map((item, index) => (
            <View key={item.label}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t(item.label)}</Text>
                <Text style={styles.infoValue}>{item.value}</Text>
              </View>
              {index < infoRows.length - 1 && <View style={styles.infoSeparator} />}
            </View>
          ))}
        </View>

      </ScrollView>

      <ChartTradingHoursModal
        visible={showTradingHoursModal}
        onClose={() => setShowTradingHoursModal(false)}
        sessions={activeSessions}
        isLoading={isMetaLoading}
      />
    </Screen>
  );
}

function makeStyles(T: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    screen: {
      backgroundColor: T.bg,
    },
    header: {
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#E3E8F0',
      backgroundColor: T.bg,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerBackBtn: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitleWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    headerTitle: {
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 17,
      fontWeight: '500',
      letterSpacing: 0,
    },
    scrollContent: {
      paddingTop: 18,
      paddingBottom: 40,
    },
    sectionHeader: {
      fontSize: 12,
      fontWeight: '600',
      color: isDark ? '#94A3B8' : '#64748B',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      paddingHorizontal: 20,
      marginBottom: 10,
    },

    /* Trading Hours card */
    tradingHoursCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginHorizontal: 14,
      paddingVertical: 14,
      paddingHorizontal: 14,
      backgroundColor: isDark ? T.glass2 : '#FFFFFF',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? T.border : '#EEF2F7',
    },
    cardPressed: {
      opacity: 0.85,
    },
    timeIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(59,130,246,0.10)' : 'rgba(59,130,246,0.08)',
    },
    tradingHoursTextCol: {
      flex: 1,
    },
    tradingHoursTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 2,
    },
    marketStatusDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: T.trading.profit,
    },
    marketStatusDotClosed: {
      backgroundColor: '#EF4444',
    },
    timeIconWrapClosed: {
      backgroundColor: isDark ? 'rgba(239,68,68,0.10)' : 'rgba(239,68,68,0.08)',
    },
    tradingHoursTitle: {
      fontSize: 15,
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontWeight: '700',
    },
    tradingHoursSub: {
      fontSize: 12,
      color: isDark ? '#94A3B8' : '#64748B',
      fontWeight: '500',
      fontVariant: ['tabular-nums'],
    },

    /* Info card */
    infoCard: {
      marginHorizontal: 14,
      backgroundColor: isDark ? T.glass2 : '#FFFFFF',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? T.border : '#EEF2F7',
      overflow: 'hidden',
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 14,
    },
    infoSeparator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#EEF2F7',
      marginLeft: 14,
    },
    infoLabel: {
      fontSize: 14,
      color: isDark ? '#CBD5E1' : '#334155',
      fontWeight: '500',
    },
    infoValue: {
      fontSize: 14,
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
  });
}
