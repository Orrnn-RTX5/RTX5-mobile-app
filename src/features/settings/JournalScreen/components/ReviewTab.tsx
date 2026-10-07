import { GDark, GLight } from '../../../../ui/theme/glass';
import { FastPressable as Pressable } from '../../../../ui/components/FastPressable';
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fmt } from '../../../../utils/format';
import type { TradeJournalEntry } from '../types';

type ReviewTabProps = {
  isDark: boolean;
  trades: TradeJournalEntry[];
};

type ReviewField = 'performance' | 'bestSetup' | 'mistake' | 'nextRules';
type ReviewPeriod = 'Week' | 'Month' | 'Quarter';

const REVIEW_PROMPTS: Array<{
  key: ReviewField;
  title: string;
  placeholder: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  {
    key: 'performance',
    title: 'Overall Performance',
    placeholder: 'What did the numbers say, and where did execution drift?',
    icon: 'pulse-outline',
  },
  {
    key: 'bestSetup',
    title: 'Best Setup',
    placeholder: 'Which setup was cleanest, repeatable, and worth scaling?',
    icon: 'sparkles-outline',
  },
  {
    key: 'mistake',
    title: 'Primary Mistake',
    placeholder: 'What mistake cost the most money, focus, or discipline?',
    icon: 'warning-outline',
  },
  {
    key: 'nextRules',
    title: 'Next Rules',
    placeholder: 'Write 3 rules that must be followed in the next period.',
    icon: 'list-circle-outline',
  },
];

export function ReviewTab({ isDark, trades }: ReviewTabProps) {
  const colors = useMemo(() => makePalette(isDark), [isDark]);
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [period, setPeriod] = useState<ReviewPeriod>('Week');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<ReviewField, string>>({
    performance: '',
    bestSetup: '',
    mistake: '',
    nextRules: '',
  });

  // Review cards are derived from the current journal entries so the screen
  // stays useful as the user adds or edits trades.
  const review = useMemo(() => {
    const closedTrades = trades.filter((trade) => trade.result && trade.result !== 'Open');
    const totalTrades = closedTrades.length;
    const totalPnl = closedTrades.reduce((sum, trade) => sum + (trade.pnlMoney ?? 0), 0);
    const avgDiscipline = closedTrades.reduce((sum, trade) => sum + (trade.disciplineScore ?? 0), 0) / (totalTrades || 1);
    const ruleBreaks = closedTrades.filter((trade) => trade.brokeRule || trade.followedPlan === 'No').length;
    const planAdherence = totalTrades ? Math.round(((totalTrades - ruleBreaks) / totalTrades) * 100) : 0;
    const bestTrade = [...closedTrades].sort((a, b) => (b.pnlMoney ?? 0) - (a.pnlMoney ?? 0))[0];
    const worstTrade = [...closedTrades].sort((a, b) => (a.pnlMoney ?? 0) - (b.pnlMoney ?? 0))[0];

    return {
      totalTrades,
      totalPnl,
      avgDiscipline,
      ruleBreaks,
      planAdherence,
      bestTrade,
      worstTrade,
    };
  }, [trades]);

  const updateNote = (key: ReviewField, value: string) => {
    setNotes((current) => ({ ...current, [key]: value }));
  };

  const renderTradeInsight = (
    label: string,
    trade: TradeJournalEntry | undefined,
    tone: 'positive' | 'negative',
    icon: keyof typeof Ionicons.glyphMap,
  ) => {
    const pnl = trade?.pnlMoney ?? 0;
    return (
      <View style={styles.tradeInsight}>
        <View style={[styles.tradeInsightIcon, tone === 'positive' ? styles.positiveIcon : styles.negativeIcon]}>
          <Ionicons name={icon} size={17} color={colors[tone]} />
        </View>
        <View style={styles.tradeInsightBody}>
          <Text style={styles.tradeInsightLabel}>{label}</Text>
          <Text style={styles.tradeInsightTitle} numberOfLines={1}>
            {trade ? `${trade.symbol} - ${trade.strategy ?? 'Custom'}` : 'No trade recorded'}
          </Text>
          <Text style={styles.tradeInsightText} numberOfLines={2}>
            {trade?.mainLesson || 'Log closed trades to generate review context.'}
          </Text>
        </View>
        <Text style={[styles.tradeInsightPnl, { color: colors[tone] }]}>{fmt.pnlPrecise(pnl)}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerBlock}>
        <View>
          <Text style={styles.eyebrow}>Review</Text>
          <Text style={styles.title}>Trading Review Desk</Text>
        </View>
        <View style={styles.periodTabs}>
          {(['Week', 'Month', 'Quarter'] as const).map((item) => {
            const active = period === item;
            return (
              <Pressable
                key={item}
                style={[styles.periodTab, active && styles.periodTabActive]}
                onPress={() => setPeriod(item)}
                unstable_pressDelay={0}
              >
                <Text style={[styles.periodText, active && styles.periodTextActive]}>{item}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.summaryCard}>
        <View style={styles.summaryTop}>
          <View>
            <Text style={styles.summaryLabel}>{period} Summary</Text>
            <Text style={[styles.summaryValue, review.totalPnl >= 0 ? styles.textPositive : styles.textNegative]}>
              {fmt.pnlPrecise(review.totalPnl)}
            </Text>
          </View>
          <View style={styles.summaryBadge}>
            <Ionicons name="journal-outline" size={17} color={colors.accent} />
            <Text style={styles.summaryBadgeText}>{review.totalTrades} trades</Text>
          </View>
        </View>

        <View style={styles.scoreGrid}>
          <View style={styles.scoreTile}>
            <Text style={styles.scoreLabel}>Plan Adherence</Text>
            <Text style={styles.scoreValue}>{review.planAdherence}%</Text>
          </View>
          <View style={styles.scoreTile}>
            <Text style={styles.scoreLabel}>Discipline</Text>
            <Text style={styles.scoreValue}>{review.avgDiscipline.toFixed(1)}</Text>
          </View>
          <View style={styles.scoreTile}>
            <Text style={styles.scoreLabel}>Rule Breaks</Text>
            <Text style={[styles.scoreValue, review.ruleBreaks > 0 ? styles.textWarning : styles.textPositive]}>
              {review.ruleBreaks}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.insightCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Trades To Review</Text>
          <Ionicons name="search-outline" size={18} color={colors.muted} />
        </View>
        {renderTradeInsight('Best execution', review.bestTrade, 'positive', 'arrow-up-circle-outline')}
        {renderTradeInsight('Needs review', review.worstTrade, 'negative', 'arrow-down-circle-outline')}
      </View>

      <View style={styles.formCard}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>Reflection Notes</Text>
            <Text style={styles.cardSubtitle}>Keep the review short, specific, and tradeable.</Text>
          </View>
          <Ionicons name="create-outline" size={18} color={colors.accent} />
        </View>

        {REVIEW_PROMPTS.map((prompt) => (
          <View key={prompt.key} style={styles.promptBlock}>
            <View style={styles.promptHeader}>
              <View style={styles.promptIcon}>
                <Ionicons name={prompt.icon} size={16} color={colors.accent} />
              </View>
              <Text style={styles.promptTitle}>{prompt.title}</Text>
            </View>
            <TextInput
              style={[styles.input, { outlineStyle: 'none' } as any]}
              multiline
              value={notes[prompt.key]}
              onChangeText={(value) => updateNote(prompt.key, value)}
              placeholder={prompt.placeholder}
              placeholderTextColor={colors.muted}
              textAlignVertical="top"
            />
          </View>
        ))}

        <View style={styles.actionPlan}>
          <Text style={styles.actionTitle}>Next Session Checklist</Text>
          {[
            'Define invalidation before entry',
            'Avoid red-folder news impulse trades',
            'Stop after two rule breaks',
          ].map((item) => (
            <View key={item} style={styles.checkRow}>
              <Ionicons name="checkmark-circle-outline" size={17} color={colors.positive} />
              <Text style={styles.checkText}>{item}</Text>
            </View>
          ))}
        </View>

        <Pressable
          style={({ pressed }) => [styles.saveBtn, pressed && styles.saveBtnPressed]}
          onPress={() => setSavedAt(new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }))}
          unstable_pressDelay={0}
        >
          <Ionicons name="save-outline" size={18} color="#FFFFFF" />
          <Text style={styles.saveBtnText}>Save Reflection</Text>
        </Pressable>
        {savedAt && <Text style={styles.savedText}>Last saved at {savedAt}</Text>}
      </View>
    </View>
  );
}

function makePalette(isDark: boolean) {
  return {
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
  };
}

function makeStyles(colors: ReturnType<typeof makePalette>) {
  return StyleSheet.create({
    container: {
      paddingBottom: 40,
    },
    headerBlock: {
      marginBottom: 14,
      gap: 12,
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
    periodTabs: {
      flexDirection: 'row',
      padding: 3,
      borderRadius: 8,
      backgroundColor: colors.panel,
      borderWidth: 1,
      borderColor: colors.border,
    },
    periodTab: {
      flex: 1,
      minHeight: 34,
      borderRadius: 7,
      alignItems: 'center',
      justifyContent: 'center',
    },
    periodTabActive: {
      backgroundColor: colors.accent,
    },
    periodText: {
      color: colors.subText,
      fontSize: 12,
      fontWeight: '600',
    },
    periodTextActive: {
      color: '#FFFFFF',
    },
    summaryCard: {
      borderRadius: 8,
      padding: 14,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 12,
    },
    summaryTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 14,
    },
    summaryLabel: {
      color: colors.subText,
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    summaryValue: {
      fontSize: 28,
      fontWeight: '600',
      marginTop: 4,
      fontVariant: ['tabular-nums'],
    },
    summaryBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 9,
      paddingVertical: 7,
      borderRadius: 8,
      backgroundColor: colors.panel,
    },
    summaryBadgeText: {
      color: colors.subText,
      fontSize: 11,
      fontWeight: '600',
    },
    scoreGrid: {
      flexDirection: 'row',
      gap: 8,
    },
    scoreTile: {
      flex: 1,
      minHeight: 68,
      borderRadius: 8,
      padding: 10,
      backgroundColor: colors.panel,
      borderWidth: 1,
      borderColor: colors.border,
    },
    scoreLabel: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    scoreValue: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '600',
      marginTop: 8,
      fontVariant: ['tabular-nums'],
    },
    insightCard: {
      borderRadius: 8,
      padding: 14,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 12,
    },
    formCard: {
      borderRadius: 8,
      padding: 14,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 14,
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
    tradeInsight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 11,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    tradeInsightIcon: {
      width: 34,
      height: 34,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    positiveIcon: {
      backgroundColor: `${colors.positive}1F`,
    },
    negativeIcon: {
      backgroundColor: 'rgba(239,68,68,0.12)',
    },
    tradeInsightBody: {
      flex: 1,
      minWidth: 0,
    },
    tradeInsightLabel: {
      color: colors.muted,
      fontSize: 10,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    tradeInsightTitle: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '600',
      marginTop: 2,
    },
    tradeInsightText: {
      color: colors.subText,
      fontSize: 11,
      lineHeight: 15,
      fontWeight: '600',
      marginTop: 2,
    },
    tradeInsightPnl: {
      fontSize: 12,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },
    promptBlock: {
      marginBottom: 14,
    },
    promptHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    promptIcon: {
      width: 28,
      height: 28,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.panel,
    },
    promptTitle: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '600',
    },
    input: {
      minHeight: 82,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: colors.panel,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.text,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '600',
    },
    actionPlan: {
      borderRadius: 8,
      padding: 12,
      backgroundColor: colors.panel,
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: 2,
      marginBottom: 14,
    },
    actionTitle: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '600',
      marginBottom: 10,
    },
    checkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    checkText: {
      flex: 1,
      color: colors.subText,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '700',
    },
    saveBtn: {
      minHeight: 48,
      borderRadius: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.accent,
    },
    saveBtnPressed: {
      opacity: 0.85,
    },
    saveBtnText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '600',
    },
    savedText: {
      color: colors.subText,
      fontSize: 11,
      fontWeight: '600',
      textAlign: 'center',
      marginTop: 10,
    },
    textPositive: {
      color: colors.positive,
    },
    textNegative: {
      color: colors.negative,
    },
    textWarning: {
      color: colors.warning,
    },
  });
}
