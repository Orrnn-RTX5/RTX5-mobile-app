import { GDark, GLight } from '../../../../ui/theme/glass';
import { FastPressable as Pressable } from '../../../../ui/components/FastPressable';
import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TradeJournalEntry } from '../types';

export function TradeDetailDrawer({ trade, onClose, isDark }: { trade: TradeJournalEntry, onClose: () => void, isDark: boolean }) {
  const positiveColor = (isDark ? GDark : GLight).trading.profit;
  const cardBg = isDark ? '#1E1E1E' : '#FFFFFF';
  const borderColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#F8FAFC' : '#0F172A';
  const subText = isDark ? '#64748B' : '#94A3B8';
  const accent = isDark ? '#22D3EE' : '#06B6D4';

  const pnl = trade.pnlMoney ?? 0;
  const isWin = pnl > 0 || trade.result === 'Win';
  const rMultiple = typeof trade.finalRMultiple === 'number'
    ? `${trade.finalRMultiple > 0 ? '+' : ''}${trade.finalRMultiple.toFixed(1)}R`
    : '--';

  return (
    <View style={styles.overlay}>
      <View style={[styles.drawer, { backgroundColor: isDark ? '#121212' : '#F8FAFC' }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: textColor }]}>Trade Details</Text>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={textColor} />
          </Pressable>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="always"
          canCancelContentTouches={Platform.OS === 'ios'} contentContainerStyle={styles.scrollContent}>
          {/* Top Info */}
          <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
            <View style={styles.rowBetween}>
              <View>
                <Text style={[styles.symbolText, { color: textColor }]}>{trade.symbol} • <Text style={{ color: trade.tradeType === 'Buy' ? positiveColor : '#EF4444' }}>{trade.tradeType}</Text></Text>
                <Text style={{ color: subText, fontSize: 12, marginTop: 4 }}>{new Date(trade.date).toLocaleString()}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.pnlText, { color: isWin ? positiveColor : '#EF4444' }]}>{pnl > 0 ? '+' : ''}${pnl.toFixed(2)}</Text>
                <Text style={{ color: subText, fontSize: 12, marginTop: 4 }}>{rMultiple}</Text>
              </View>
            </View>
          </View>

          {/* Details Grid */}
          <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Execution</Text>
            <View style={styles.grid}>
              <DetailItem label="Entry" value={trade.entryPrice} subText={subText} textColor={textColor} />
              <DetailItem label="Stop Loss" value={trade.stopLoss} subText={subText} textColor={textColor} />
              <DetailItem label="Take Profit" value={trade.takeProfit} subText={subText} textColor={textColor} />
              <DetailItem label="Exit" value={trade.exitPrice} subText={subText} textColor={textColor} />
              <DetailItem label="Strategy" value={trade.strategy} subText={subText} textColor={textColor} />
              <DetailItem label="Timeframe" value={trade.timeframe} subText={subText} textColor={textColor} />
            </View>
          </View>

          {/* Analysis */}
          <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Analysis & Reason</Text>
            <Text style={[styles.bodyText, { color: textColor }]}>{trade.entryReason || 'No entry reason recorded.'}</Text>
          </View>

          {/* Review & Lessons */}
          <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Review & Lessons</Text>
            <View style={{ marginBottom: 12 }}>
              <Text style={[styles.label, { color: subText }]}>What went right?</Text>
              <Text style={[styles.bodyText, { color: textColor }]}>{trade.didRight || 'N/A'}</Text>
            </View>
            <View style={{ marginBottom: 12 }}>
              <Text style={[styles.label, { color: subText }]}>Mistakes</Text>
              <Text style={[styles.bodyText, { color: textColor }]}>{trade.didWrong || 'N/A'}</Text>
            </View>
            <View>
              <Text style={[styles.label, { color: subText }]}>Main Lesson</Text>
              <Text style={[styles.bodyText, { color: textColor }]}>{trade.mainLesson || 'N/A'}</Text>
            </View>
          </View>

          {/* Screenshots Placeholder */}
          <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Screenshots</Text>
            <View style={[styles.screenshotPlaceholder, { borderColor }]}>
              <Ionicons name="image-outline" size={32} color={subText} />
              <Text style={{ color: subText, fontSize: 12, marginTop: 8 }}>No screenshots attached</Text>
            </View>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

function DetailItem({ label, value, subText, textColor }: any) {
  return (
    <View style={styles.detailItem}>
      <Text style={[styles.detailLabel, { color: subText }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: textColor }]}>{value ?? '--'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 200,
    justifyContent: 'flex-end',
  },
  drawer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  title: { fontSize: 18, fontWeight: '600' },
  closeBtn: { padding: 4 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  symbolText: { fontSize: 18, fontWeight: '600' },
  pnlText: { fontSize: 18, fontWeight: '600', fontVariant: ['tabular-nums'] },
  sectionTitle: { fontSize: 14, fontWeight: '700', marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -8 },
  detailItem: { width: '50%', padding: 8 },
  detailLabel: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  detailValue: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  label: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  bodyText: { fontSize: 14, lineHeight: 20 },
  screenshotPlaceholder: {
    height: 150,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.02)'
  }
});
