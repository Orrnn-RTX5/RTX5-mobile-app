import { GDark, GLight } from '../../../../ui/theme/glass';
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fmt } from '../../../../utils/format';
import { calculateWinRatePercentFromCounts } from '../../../../utils/winRate';
import type { TradeJournalEntry } from '../types';

type AnalyticsTabProps = {
  isDark: boolean;
  trades: TradeJournalEntry[];
};

type MetricTone = 'positive' | 'negative' | 'neutral' | 'warning';

export function AnalyticsTab({ isDark, trades }: AnalyticsTabProps) {
  const colors = useMemo(() => makePalette(isDark), [isDark]);
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const analytics = useMemo(() => {
    const closedTrades = trades
      .filter((trade) => trade.result && trade.result !== 'Open')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const totalTrades = closedTrades.length;
    const wins = closedTrades.filter((trade) => trade.result === 'Win');
    const losses = closedTrades.filter((trade) => trade.result === 'Loss');
    const totalPnl = closedTrades.reduce((sum, trade) => sum + (trade.pnlMoney ?? 0), 0);
    const grossProfit = wins.reduce((sum, trade) => sum + Math.max(0, trade.pnlMoney ?? 0), 0);
    const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + Math.min(0, trade.pnlMoney ?? 0), 0));
    const avgR = closedTrades.reduce((sum, trade) => sum + (trade.finalRMultiple ?? 0), 0) / (totalTrades || 1);
    const discipline = closedTrades.reduce((sum, trade) => sum + (trade.disciplineScore ?? 0), 0) / (totalTrades || 1);
    const winRate = calculateWinRatePercentFromCounts({ wins: wins.length, losses: losses.length });
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Number.POSITIVE_INFINITY : 0;
    const expectancy = totalTrades ? totalPnl / totalTrades : 0;

    // The chart uses account balance when available; otherwise it builds a
    // deterministic equity path from logged P&L so it never shows placeholders.
    const firstBalance = closedTrades.find((trade) => typeof trade.accountBalanceBefore === 'number')?.accountBalanceBefore ?? 0;
    let runningBalance = firstBalance;
    const equityPoints = closedTrades.map((trade) => {
      runningBalance = trade.accountBalanceAfter ?? runningBalance + (trade.pnlMoney ?? 0);
      return {
        label: new Date(trade.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        value: runningBalance,
        pnl: trade.pnlMoney ?? 0,
      };
    });

    const strategyRows = Array.from(
      closedTrades.reduce((map, trade) => {
        const current = map.get(trade.strategy) ?? { name: trade.strategy, pnl: 0, trades: 0, wins: 0, losses: 0 };
        current.pnl += trade.pnlMoney ?? 0;
        current.trades += 1;
        current.wins += trade.result === 'Win' ? 1 : 0;
        current.losses += trade.result === 'Loss' ? 1 : 0;
        map.set(trade.strategy, current);
        return map;
      }, new Map<string, { name: string; pnl: number; trades: number; wins: number; losses: number }>()),
    )
      .map(([, row]) => ({
        ...row,
        winRate: calculateWinRatePercentFromCounts({ wins: row.wins, losses: row.losses }),
      }))
      .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
      .slice(0, 4);

    const sessionRows = Array.from(
      closedTrades.reduce((map, trade) => {
        const current = map.get(trade.session) ?? { name: trade.session, pnl: 0, trades: 0 };
        current.pnl += trade.pnlMoney ?? 0;
        current.trades += 1;
        map.set(trade.session, current);
        return map;
      }, new Map<string, { name: string; pnl: number; trades: number }>()),
    )
      .map(([, row]) => row)
      .sort((a, b) => b.pnl - a.pnl);

    return {
      totalTrades,
      wins: wins.length,
      losses: losses.length,
      totalPnl,
      winRate,
      profitFactor,
      expectancy,
      avgR,
      discipline,
      equityPoints,
      strategyRows,
      sessionRows,
    };
  }, [trades]);

  const equityValues = analytics.equityPoints.map((point) => point.value);
  const minEquity = equityValues.length ? Math.min(...equityValues) : 0;
  const maxEquity = equityValues.length ? Math.max(...equityValues) : 0;
  const equityRange = Math.max(1, maxEquity - minEquity);
  const maxStrategyPnl = Math.max(1, ...analytics.strategyRows.map((row) => Math.abs(row.pnl)));

  const renderMetric = (
    label: string,
    value: string,
    caption: string,
    icon: keyof typeof Ionicons.glyphMap,
    tone: MetricTone,
  ) => (
    <View style={styles.metricCard}>
      <View style={[styles.metricIcon, styles[`${tone}Icon`]]}>
        <Ionicons name={icon} size={17} color={colors[tone]} />
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color: colors[tone] }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.metricCaption} numberOfLines={1}>{caption}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerBlock}>
        <View>
          <Text style={styles.eyebrow}>Analytics</Text>
          <Text style={styles.title}>Performance Desk</Text>
        </View>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.livePillText}>{analytics.totalTrades} closed</Text>
        </View>
      </View>

      <View style={styles.metricGrid}>
        {renderMetric(
          'Net P&L',
          fmt.pnlPrecise(analytics.totalPnl),
          'Closed trades',
          analytics.totalPnl >= 0 ? 'trending-up-outline' : 'trending-down-outline',
          analytics.totalPnl >= 0 ? 'positive' : 'negative',
        )}
        {renderMetric(
          'Win Rate',
          `${analytics.winRate}%`,
          `${analytics.wins}W / ${analytics.losses}L`,
          'checkmark-done-outline',
          analytics.winRate >= 50 ? 'positive' : 'warning',
        )}
        {renderMetric(
          'Profit Factor',
          Number.isFinite(analytics.profitFactor) ? analytics.profitFactor.toFixed(2) : 'Max',
          'Gross win/loss',
          'speedometer-outline',
          analytics.profitFactor >= 1 ? 'positive' : 'negative',
        )}
        {renderMetric(
          'Discipline',
          analytics.discipline.toFixed(1),
          'Average score',
          'shield-checkmark-outline',
          analytics.discipline >= 7 ? 'positive' : 'warning',
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>Equity Curve</Text>
            <Text style={styles.cardSubtitle}>Balance progression from journal entries</Text>
          </View>
          <View style={styles.cardIcon}>
            <Ionicons name="analytics-outline" size={18} color={colors.accent} />
          </View>
        </View>

        <View style={styles.equityChart}>
          {analytics.equityPoints.length > 0 ? (
            analytics.equityPoints.map((point, index) => {
              const height = 24 + ((point.value - minEquity) / equityRange) * 92;
              const isPositive = point.pnl >= 0;
              return (
                <View key={`${point.label}-${index}`} style={styles.equityPoint}>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.equityBar,
                        {
                          height,
                          backgroundColor: isPositive ? colors.positive : colors.negative,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.chartLabel} numberOfLines={1}>{point.label}</Text>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="reader-outline" size={24} color={colors.muted} />
              <Text style={styles.emptyText}>No closed trades yet</Text>
            </View>
          )}
        </View>

        <View style={styles.equityFooter}>
          <View>
            <Text style={styles.footerLabel}>Start</Text>
            <Text style={styles.footerValue}>{fmt.price(minEquity)}</Text>
          </View>
          <View style={styles.footerDivider} />
          <View>
            <Text style={styles.footerLabel}>Current</Text>
            <Text style={styles.footerValue}>{fmt.price(maxEquity)}</Text>
          </View>
          <View style={styles.footerDivider} />
          <View>
            <Text style={styles.footerLabel}>Expectancy</Text>
            <Text style={[styles.footerValue, analytics.expectancy >= 0 ? styles.textPositive : styles.textNegative]}>
              {fmt.pnlPrecise(analytics.expectancy)}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.twoColumn}>
        <View style={[styles.card, styles.halfCard]}>
          <View style={styles.cardHeaderCompact}>
            <Text style={styles.cardTitle}>Strategy Edge</Text>
            <Ionicons name="bar-chart-outline" size={18} color={colors.muted} />
          </View>
          {analytics.strategyRows.length > 0 ? analytics.strategyRows.map((row) => {
            const width = `${Math.max(10, (Math.abs(row.pnl) / maxStrategyPnl) * 100)}%` as `${number}%`;
            const isPositive = row.pnl >= 0;
            return (
              <View key={row.name} style={styles.performanceRow}>
                <View style={styles.performanceTop}>
                  <Text style={styles.performanceName} numberOfLines={1}>{row.name}</Text>
                  <Text style={isPositive ? styles.textPositive : styles.textNegative}>
                    {fmt.pnlPrecise(row.pnl)}
                  </Text>
                </View>
                <View style={styles.performanceTrack}>
                  <View
                    style={[
                      styles.performanceFill,
                      {
                        width,
                        backgroundColor: isPositive ? colors.positive : colors.negative,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.performanceMeta}>{row.winRate}% win rate - {row.trades} trades</Text>
              </View>
            );
          }) : (
            <Text style={styles.emptyText}>No strategy data</Text>
          )}
        </View>

        <View style={[styles.card, styles.halfCard]}>
          <View style={styles.cardHeaderCompact}>
            <Text style={styles.cardTitle}>Session Quality</Text>
            <Ionicons name="time-outline" size={18} color={colors.muted} />
          </View>
          {analytics.sessionRows.length > 0 ? analytics.sessionRows.map((row) => {
            const isPositive = row.pnl >= 0;
            return (
              <View key={row.name} style={styles.sessionRow}>
                <View>
                  <Text style={styles.sessionName}>{row.name}</Text>
                  <Text style={styles.performanceMeta}>{row.trades} trades</Text>
                </View>
                <Text style={isPositive ? styles.textPositive : styles.textNegative}>
                  {fmt.pnlPrecise(row.pnl)}
                </Text>
              </View>
            );
          }) : (
            <Text style={styles.emptyText}>No session data</Text>
          )}
        </View>
      </View>

      <View style={styles.insightStrip}>
        <View style={styles.insightIcon}>
          <Ionicons name="bulb-outline" size={18} color={colors.warning} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.insightTitle}>Primary read</Text>
          <Text style={styles.insightText}>
            {analytics.avgR >= 1
              ? `Your average R is ${analytics.avgR.toFixed(2)}, so winners are carrying the book.`
              : `Average R is ${analytics.avgR.toFixed(2)}. Review exits and risk placement before scaling.`}
          </Text>
        </View>
      </View>
    </View>
  );
}

function makePalette(isDark: boolean) {
  return {
    bg: isDark ? '#121212' : '#F1F5F9',
    card: isDark ? '#1E1E1E' : '#FFFFFF',
    panel: isDark ? 'rgba(255,255,255,0.045)' : '#F8FAFC',
    border: isDark ? 'rgba(148,163,184,0.14)' : 'rgba(15,23,42,0.08)',
    text: isDark ? '#F8FAFC' : '#0F172A',
    subText: isDark ? '#94A3B8' : '#64748B',
    muted: isDark ? '#64748B' : '#94A3B8',
    accent: '#2563EB',
    positive: (isDark ? GDark : GLight).trading.profit,
    negative: '#EF4444',
    warning: '#F59E0B',
    neutral: isDark ? '#CBD5E1' : '#334155',
  };
}

function makeStyles(colors: ReturnType<typeof makePalette>) {
  return StyleSheet.create({
    container: {
      paddingBottom: 36,
    },
    headerBlock: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    eyebrow: {
      color: colors.accent,
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    title: {
      color: colors.text,
      fontSize: 20,
      fontWeight: '500',
      marginTop: 2,
    },
    livePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 9,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: colors.panel,
      borderWidth: 1,
      borderColor: colors.border,
    },
    liveDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.positive,
    },
    livePillText: {
      color: colors.subText,
      fontSize: 11,
      fontWeight: '600',
    },
    metricGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 7,
      marginBottom: 10,
    },
    metricCard: {
      width: '48%',
      minHeight: 108,
      borderRadius: 14,
      padding: 10,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    metricIcon: {
      width: 30,
      height: 30,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    positiveIcon: { backgroundColor: `${colors.positive}1F` },
    negativeIcon: { backgroundColor: 'rgba(239,68,68,0.12)' },
    warningIcon: { backgroundColor: 'rgba(245,158,11,0.14)' },
    neutralIcon: { backgroundColor: 'rgba(37,99,235,0.12)' },
    metricLabel: {
      color: colors.subText,
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    metricValue: {
      fontSize: 19,
      fontWeight: '600',
      marginTop: 4,
      fontVariant: ['tabular-nums'],
    },
    metricCaption: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: '600',
      marginTop: 3,
    },
    card: {
      borderRadius: 14,
      padding: 12,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 10,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: 12,
      gap: 10,
    },
    cardHeaderCompact: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    cardTitle: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '600',
    },
    cardSubtitle: {
      color: colors.subText,
      fontSize: 11,
      fontWeight: '600',
      marginTop: 3,
    },
    cardIcon: {
      width: 32,
      height: 32,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.panel,
    },
    equityChart: {
      minHeight: 158,
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 7,
      paddingHorizontal: 2,
      paddingTop: 10,
      borderRadius: 12,
      backgroundColor: colors.panel,
      borderWidth: 1,
      borderColor: colors.border,
    },
    equityPoint: {
      flex: 1,
      alignItems: 'center',
      minWidth: 0,
    },
    barTrack: {
      height: 122,
      width: '100%',
      alignItems: 'center',
      justifyContent: 'flex-end',
    },
    equityBar: {
      width: '62%',
      minHeight: 8,
      borderTopLeftRadius: 5,
      borderTopRightRadius: 5,
    },
    chartLabel: {
      color: colors.muted,
      fontSize: 9,
      fontWeight: '600',
      marginTop: 7,
      marginBottom: 7,
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minHeight: 150,
    },
    emptyText: {
      color: colors.subText,
      fontSize: 12,
      fontWeight: '700',
    },
    equityFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    footerLabel: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    footerValue: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '600',
      marginTop: 3,
      fontVariant: ['tabular-nums'],
    },
    footerDivider: {
      width: 1,
      height: 28,
      backgroundColor: colors.border,
    },
    twoColumn: {
      flexDirection: 'row',
      gap: 8,
    },
    halfCard: {
      flex: 1,
      minWidth: 0,
      padding: 11,
    },
    performanceRow: {
      marginBottom: 10,
    },
    performanceTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    performanceName: {
      flex: 1,
      color: colors.text,
      fontSize: 12,
      fontWeight: '600',
    },
    performanceTrack: {
      height: 7,
      borderRadius: 4,
      overflow: 'hidden',
      backgroundColor: colors.panel,
      marginTop: 6,
    },
    performanceFill: {
      height: '100%',
      borderRadius: 4,
    },
    performanceMeta: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: '600',
      marginTop: 4,
    },
    sessionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    sessionName: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '600',
    },
    textPositive: {
      color: colors.positive,
      fontSize: 12,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },
    textNegative: {
      color: colors.negative,
      fontSize: 12,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },
    insightStrip: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      borderRadius: 14,
      padding: 11,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.panel,
    },
    insightIcon: {
      width: 30,
      height: 30,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(245,158,11,0.12)',
    },
    insightTitle: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '600',
    },
    insightText: {
      color: colors.subText,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '600',
      marginTop: 3,
    },
  });
}
