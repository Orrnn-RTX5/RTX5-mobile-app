import { FastPressable as Pressable } from '../../../../ui/components/FastPressable';
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type AddTradeModalProps = {
  onClose: () => void;
  isDark: boolean;
  actionColor: string;
};

export function AddTradeModal({ onClose, isDark, actionColor }: AddTradeModalProps) {
  const cardBg = isDark ? '#1E1E1E' : '#FFFFFF';
  const borderColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#F8FAFC' : '#0F172A';
  const subText = isDark ? '#64748B' : '#94A3B8';
  const inputBg = isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC';

  const [step, setStep] = useState(1);

  return (
    <View style={styles.overlay}>
      <View style={[styles.drawer, { backgroundColor: isDark ? '#121212' : '#F8FAFC' }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: textColor }]}>Log New Trade</Text>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={textColor} />
          </Pressable>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="always"
          canCancelContentTouches={Platform.OS === 'ios'} contentContainerStyle={styles.scrollContent}>
          {step === 1 && (
            <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
              <Text style={[styles.sectionTitle, { color: textColor }]}>Step 1: Trade Execution</Text>
              
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: subText }]}>Symbol</Text>
                <TextInput style={[styles.input, { backgroundColor: inputBg, borderColor, color: textColor }]} placeholder="e.g. XAUUSD" placeholderTextColor={subText} />
              </View>
              
              <View style={styles.row}>
                <View style={[styles.formGroup, { flex: 1, marginRight: 8 }]}>
                  <Text style={[styles.label, { color: subText }]}>Direction</Text>
                  <View style={[styles.input, { backgroundColor: inputBg, borderColor, justifyContent: 'center' }]}>
                    <Text style={{ color: subText }}>Buy / Sell</Text>
                  </View>
                </View>
                <View style={[styles.formGroup, { flex: 1, marginLeft: 8 }]}>
                  <Text style={[styles.label, { color: subText }]}>Lot Size</Text>
                  <TextInput style={[styles.input, { backgroundColor: inputBg, borderColor, color: textColor }]} placeholder="1.0" placeholderTextColor={subText} keyboardType="numeric" />
                </View>
              </View>

              <View style={styles.row}>
                <View style={[styles.formGroup, { flex: 1, marginRight: 8 }]}>
                  <Text style={[styles.label, { color: subText }]}>Entry Price</Text>
                  <TextInput style={[styles.input, { backgroundColor: inputBg, borderColor, color: textColor }]} placeholder="0.00" placeholderTextColor={subText} keyboardType="numeric" />
                </View>
                <View style={[styles.formGroup, { flex: 1, marginLeft: 8 }]}>
                  <Text style={[styles.label, { color: subText }]}>Stop Loss</Text>
                  <TextInput style={[styles.input, { backgroundColor: inputBg, borderColor, color: textColor }]} placeholder="0.00" placeholderTextColor={subText} keyboardType="numeric" />
                </View>
              </View>

              <Pressable style={[styles.saveBtn, { backgroundColor: actionColor }]} onPress={() => setStep(2)}>
                <Text style={styles.saveBtnText}>Next: Setup & Psychology</Text>
              </Pressable>
            </View>
          )}

          {step === 2 && (
            <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
              <Text style={[styles.sectionTitle, { color: textColor }]}>Step 2: Setup & Psychology</Text>

              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: subText }]}>Strategy / Setup</Text>
                <View style={[styles.input, { backgroundColor: inputBg, borderColor, justifyContent: 'center' }]}>
                  <Text style={{ color: subText }}>Select Strategy...</Text>
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: subText }]}>Entry Reason</Text>
                <TextInput style={[styles.input, { backgroundColor: inputBg, borderColor, color: textColor, minHeight: 80, textAlignVertical: 'top' }]} multiline placeholder="Why did you take this trade?" placeholderTextColor={subText} />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: subText }]}>Emotions During Trade</Text>
                <View style={[styles.input, { backgroundColor: inputBg, borderColor, justifyContent: 'center' }]}>
                  <Text style={{ color: subText }}>Calm, FOMO, Fear, etc.</Text>
                </View>
              </View>

              <View style={styles.row}>
                <Pressable style={[styles.saveBtn, { backgroundColor: isDark ? '#1E1E1E' : '#E2E8F0', flex: 1, marginRight: 8 }]} onPress={() => setStep(1)}>
                  <Text style={[styles.saveBtnText, { color: textColor }]}>Back</Text>
                </Pressable>
                <Pressable style={[styles.saveBtn, { backgroundColor: actionColor, flex: 2, marginLeft: 8 }]} onPress={onClose}>
                  <Text style={styles.saveBtnText}>Save Trade</Text>
                </Pressable>
              </View>
            </View>
          )}
        </ScrollView>
      </View>
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
  sectionTitle: { fontSize: 14, fontWeight: '700', marginBottom: 16 },
  formGroup: { marginBottom: 16 },
  row: { flexDirection: 'row' },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  saveBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});
