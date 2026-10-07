import { FastPressable as Pressable } from '../../ui/components/FastPressable';
/**
 * Chart Feature UI: ChartTradingCalculatorScreen
 * 
 * Provides a mini-calculator overlay to estimate profit/loss and margin requirements
 * based on entry price, stop-loss, take-profit, and leverage before placing a trade.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, TextInput, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../ui/components/Screen';
import { useInstrumentMeta } from '../../query/instruments';
import { useMarketData } from '../../query/websocket';
import { useMarginCalculation, useProfitCalculation } from '../../query/calculators';
import { useIsDarkTheme } from '../../state/themeMode';
import { resolveTradingLogin } from '../../state/tradingLogin';
import { useTheme, ThemeColors } from '../../ui/theme/useTheme';
import { useTranslation } from '../../i18n/useTranslation';
import { safeRouterBack } from '../../utils/navigation';
import { scheduleChartActionLaunchCovered } from './chartActionLaunchController';

// Format helpers — return "—" when an input is missing so the UI never shows
// a misleading hardcoded number.
const fmtMoney = (n: number | undefined, currency: string) =>
  n === undefined || !Number.isFinite(n) ? '—' : `${n.toFixed(2)} ${currency}`;
const fmtPipValue = (n: number | undefined, currency: string) =>
  n === undefined || !Number.isFinite(n) ? '—' : `${n.toFixed(4)} ${currency}`;

/**
 * A fully featured trading calculator tool. Allows the user to simulate trades, calculating required margin, pip value, spread cost, and projected profits based on lot size and entry/exit prices.
 */
export function ChartTradingCalculatorScreen() {
  const { launchRevision, symbol } = useLocalSearchParams<{
    launchRevision?: string;
    symbol: string;
  }>();
  const T = useTheme();
  const { t } = useTranslation();
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
    scheduleChartActionLaunchCovered('calculator', resolvedLaunchRevision);
  }, [isScreenFocused, resolvedLaunchRevision]);
  const handleLaunchBodyLayout = useCallback(() => {
    launchBodyLaidOutRef.current = true;
    scheduleLaunchCoverageIfReady();
  }, [scheduleLaunchCoverageIfReady]);
  useEffect(() => {
    scheduleLaunchCoverageIfReady();
  }, [scheduleLaunchCoverageIfReady]);

  const currentSymbol = symbol || 'XAU/USD';

  // Real broker meta + live market quote
  const { data: meta } = useInstrumentMeta(currentSymbol, isScreenFocused);
  const liveQuotes = useMarketData([currentSymbol], isScreenFocused);
  const liveQuote = liveQuotes[currentSymbol];

  const liveBid = typeof liveQuote?.bid === 'number' ? liveQuote.bid : undefined;
  const liveAsk = typeof liveQuote?.ask === 'number' ? liveQuote.ask : undefined;
  const liveMid = liveBid !== undefined && liveAsk !== undefined
    ? (liveBid + liveAsk) / 2
    : (liveBid ?? liveAsk);

  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [lotSize, setLotSize] = useState('0.01');
  const [openPrice, setOpenPrice] = useState('');
  const [closePrice, setClosePrice] = useState('');

  /**
   * Increments or decrements the simulated lot size, clamping it within the symbol's allowed min/max trade volume limits.
   */
  const adjustLotSize = (amount: number) => {
    setLotSize((prev) => {
      const parsed = parseFloat(prev) || 0;
      return Math.max(0.01, parsed + amount).toFixed(2);
    });
  };

  // ── Resolve inputs ──────────────────────────────────────────────────────
  const accountLogin = resolveTradingLogin();
  const lots = parseFloat(lotSize) || 0;
  const effectiveOpen = parseFloat(openPrice) || (side === 'buy' ? liveAsk : liveBid) || liveMid;
  const effectiveClose = parseFloat(closePrice) || (side === 'buy' ? liveBid : liveAsk) || liveMid;
  const pipMultiplier = currentSymbol.includes('JPY') ? 100 : 10000;
  const profitCurrency = meta?.profitCurrency || 'USD';

  // ── Server-side margin calculation ──────────────────────────────────────
  // POST /api/v2/calculate/margin — uses actual account leverage and broker specs.
  // Replaces the old hardcoded formula: (lots * contractSize * price) / 2000.
  const { data: marginResult, isFetching: marginFetching } = useMarginCalculation(
    accountLogin && lots > 0
      ? { account_login: accountLogin, symbol: currentSymbol, side, volume: lots }
      : null,
  );

  // ── Server-side profit calculation ──────────────────────────────────────
  // POST /api/v2/calculate/profit — accurate currency conversion and contract math.
  // Replaces the old formula: (close - open) * lots * contractSize * sign.
  const { data: profitResult, isFetching: profitFetching } = useProfitCalculation(
    lots > 0 && effectiveOpen && effectiveClose
      ? {
          symbol: currentSymbol,
          volume: lots,
          side,
          open_price: effectiveOpen,
          close_price: effectiveClose,
        }
      : null,
  );

  // ── Derived display values ───────────────────────────────────────────────
  // Use server results where available; fall back to local meta for spread/swap
  // which aren't part of the calculator endpoints.
  const spread = liveBid !== undefined && liveAsk !== undefined
    ? (liveAsk - liveBid) * pipMultiplier
    : undefined;
  const swapPerDay = lots > 0
    ? lots * ((side === 'buy' ? meta?.swapLong : meta?.swapShort) ?? NaN)
    : undefined;

  // Server values (preferred)
  const margin = marginResult?.required_margin;
  const pipValue = marginResult?.pip_value ?? profitResult?.pip_value;
  const profitLoss = profitResult?.profit;
  const commission = 0; // Not returned by calculators API; broker may charge separately

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
              {t('Calculator')} · {currentSymbol}
            </Text>
          </View>
          <View style={styles.headerBackBtn} />
        </View>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="always"
        canCancelContentTouches={Platform.OS === 'ios'} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Segmented Control */}
        <View style={styles.segmentContainer}>
          <Pressable
            style={[styles.segmentBtn, side === 'buy' && styles.segmentBtnActive]}
            onPress={() => setSide('buy')}
          >
            <Text style={[styles.segmentText, side === 'buy' && styles.segmentTextActive]}>{t('Buy')}</Text>
          </Pressable>
          <Pressable
            style={[styles.segmentBtn, side === 'sell' && styles.segmentBtnActive]}
            onPress={() => setSide('sell')}
          >
            <Text style={[styles.segmentText, side === 'sell' && styles.segmentTextActive]}>{t('Sell')}</Text>
          </Pressable>
        </View>

        {/* Form Inputs */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>{t('Volume, lots')}</Text>
          <View style={styles.inputBox}>
            <Pressable onPress={() => adjustLotSize(-0.01)} style={styles.stepperBtn}>
              <Ionicons name="remove" size={20} color={T.textMuted} />
            </Pressable>
            <TextInput
              style={styles.textInput}
              value={lotSize}
              onChangeText={setLotSize}
              keyboardType="numeric"
            />
            <Pressable onPress={() => adjustLotSize(0.01)} style={styles.stepperBtn}>
              <Ionicons name="add" size={20} color={T.textMuted} />
            </Pressable>
          </View>

          <Text style={[styles.inputLabel, { marginTop: 16 }]}>{t('Leverage')}</Text>
          <Pressable style={styles.dropdownBox}>
            <Text style={styles.dropdownText}>1:2000 ({t('Account leverage')})</Text>
            <Ionicons name="chevron-down" size={18} color={T.textMuted} />
          </Pressable>

          <View style={styles.labelRow}>
            <Text style={styles.inputLabel}>{t('Open at')}</Text>
            <Pressable onPress={() => setOpenPrice('')}>
              <Text style={styles.clearText}>{t('Clear')}</Text>
            </Pressable>
          </View>
          <View style={styles.inputBox}>
            <Pressable style={styles.stepperBtn}>
              <Ionicons name="remove" size={20} color={T.textMuted} />
            </Pressable>
            <TextInput
              style={styles.textInput}
              value={openPrice}
              onChangeText={setOpenPrice}
              keyboardType="numeric"
              placeholder={liveMid ? `${t('Market price')} (${liveMid.toFixed(meta?.tickSize && meta.tickSize < 0.01 ? 5 : 3)})` : t('Market price')}
              placeholderTextColor={T.textMuted}
            />
            <Pressable style={styles.stepperBtn}>
              <Ionicons name="add" size={20} color={T.textMuted} />
            </Pressable>
          </View>

          <View style={styles.labelRow}>
            <Text style={styles.inputLabel}>{t('Close at')}</Text>
            <Pressable onPress={() => setClosePrice('')}>
              <Text style={styles.clearText}>{t('Clear')}</Text>
            </Pressable>
          </View>
          <View style={styles.inputBox}>
            <Pressable style={styles.stepperBtn}>
              <Ionicons name="remove" size={20} color={T.textMuted} />
            </Pressable>
            <TextInput
              style={styles.textInput}
              value={closePrice}
              onChangeText={setClosePrice}
              keyboardType="numeric"
              placeholder="0.000"
              placeholderTextColor={T.textMuted}
            />
            <Pressable style={styles.stepperBtn}>
              <Ionicons name="add" size={20} color={T.textMuted} />
            </Pressable>
          </View>
        </View>

        {/* Summary Table — values from POST /api/v2/calculate/margin and /profit */}
        <View style={styles.summaryTable}>
          {[
            { key: 'Required Margin', label: t('Required Margin'), value: fmtMoney(margin, profitCurrency) },
            { key: 'Free Margin', label: t('Free Margin'), value: fmtMoney(marginResult?.free_margin, profitCurrency) },
            { key: 'Max Lots', label: t('Max Lots'), value: marginResult?.max_lots != null ? marginResult.max_lots.toFixed(2) : '—' },
            { key: 'Commission', label: t('Commission'), value: fmtMoney(commission, profitCurrency) },
            // Contract v3 instruments carry no swap_* fields; hide instead of '—'.
            ...(swapPerDay !== undefined && Number.isFinite(swapPerDay)
              ? [{ key: 'Swap / day', label: t('Swap / day'), value: fmtMoney(swapPerDay, profitCurrency) }]
              : []),
            { key: 'Spread', label: t('Spread'), value: spread !== undefined ? `${spread.toFixed(1)} ${t('pts')}` : '—' },
            { key: 'Pip Value', label: t('Pip Value'), value: fmtPipValue(pipValue, profitCurrency) },
            { key: 'P/L', label: t('P/L'), value: fmtMoney(profitLoss, profitCurrency) },
          ].map((item, i, arr) => (
            <React.Fragment key={item.key}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{item.label}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={[
                    styles.summaryValue,
                    item.key === 'P/L' && profitLoss !== undefined
                      ? { color: profitLoss >= 0 ? T.trading.buy.primary : T.trading.sell.primary, fontWeight: '700' }
                      : {},
                  ]}>
                    {(marginFetching || profitFetching) && item.value === '—' ? '…' : item.value}
                  </Text>
                  <Ionicons name="information-circle-outline" size={20} color={T.textMuted} />
                </View>
              </View>
              {i < arr.length - 1 && <View style={styles.separator} />}
            </React.Fragment>
          ))}
        </View>

        {/* Footer Warning */}
        <View style={styles.footerWarning}>
          <Ionicons name="information-circle-outline" size={24} color={isDark ? T.text : '#000'} style={{ marginTop: 2 }} />
          <Text style={styles.footerWarningText}>
            {t('Live preview only. Real margin, swap and P/L are set when your order is filled.')}
          </Text>
        </View>

      </ScrollView>
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
      letterSpacing: 0.3,
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 40,
    },
    segmentContainer: {
      flexDirection: 'row',
      backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF',
      borderRadius: 8,
      padding: 2,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
      marginBottom: 20,
    },
    segmentBtn: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      borderRadius: 6,
    },
    segmentBtnActive: {
      backgroundColor: isDark ? '#1E1E1E' : '#F1F5F9', // subtle background for active
    },
    segmentText: {
      fontSize: 15,
      color: T.textMuted,
      fontWeight: '500',
    },
    segmentTextActive: {
      color: T.text,
      fontWeight: '600',
    },
    inputSection: {
      marginBottom: 24,
    },
    labelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 16,
      marginBottom: 8,
    },
    inputLabel: {
      fontSize: 14,
      color: isDark ? '#94A3B8' : '#334155',
      marginBottom: 8,
    },
    clearText: {
      fontSize: 14,
      color: T.trading.buy.primary,
      fontWeight: '500',
    },
    inputBox: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0',
      borderRadius: 8,
      backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF',
      overflow: 'hidden',
    },
    stepperBtn: {
      padding: 14,
      justifyContent: 'center',
      alignItems: 'center',
    },
    textInput: {
      flex: 1,
      textAlign: 'center',
      fontSize: 16,
      color: T.text,
      paddingVertical: 14,
    },
    dropdownBox: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0',
      borderRadius: 8,
      backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF',
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    dropdownText: {
      fontSize: 16,
      color: T.text,
    },
    summaryTable: {
      backgroundColor: isDark ? '#1E1E1E' : '#F8FAFC',
      borderRadius: 12,
      padding: 16,
      marginBottom: 24,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
    },
    summaryLabel: {
      fontSize: 15,
      color: T.text,
      fontWeight: '400',
    },
    summaryValue: {
      fontSize: 15,
      color: T.textMuted,
      fontWeight: '500',
    },
    separator: {
      height: 1,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
    },
    footerWarning: {
      flexDirection: 'row',
      backgroundColor: isDark ? '#1E1E1E' : '#F1F5F9',
      padding: 16,
      borderRadius: 12,
      alignItems: 'flex-start',
      gap: 12,
    },
    footerWarningText: {
      flex: 1,
      fontSize: 14,
      color: isDark ? '#94A3B8' : '#334155',
      lineHeight: 20,
    },
  });
}
