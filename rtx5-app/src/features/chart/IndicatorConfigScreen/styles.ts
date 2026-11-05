import { StyleSheet } from 'react-native';
import type { useTheme } from '../../../ui/theme/useTheme';

export function makeIndicatorConfigStyles(
  bgColor: string,
  isDark: boolean,
  T: ReturnType<typeof useTheme>,
) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: bgColor },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#E3E8F0',
      backgroundColor: bgColor,
    },
    headerBackBtn: { width: 40, height: 32, alignItems: 'center', justifyContent: 'center' },
    headerTitleWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
    headerTitle: { color: T.text, fontSize: 16, fontWeight: '500', letterSpacing: 0.2 },
    headerDoneBtn: { minWidth: 56, height: 32, alignItems: 'flex-end', justifyContent: 'center' },
    headerDoneText: { color: T.trading.buy.primary, fontSize: 16, fontWeight: '700' },
    content: { paddingBottom: 40 },
    rowWrap: {},
    addRow: {
      minHeight: 52, paddingHorizontal: 14,
      flexDirection: 'row', alignItems: 'center', gap: 8,
    },
    addRowText: { fontSize: 15, fontWeight: '600' },
    modalBackdrop: {
      flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center', justifyContent: 'center', padding: 20,
    },
    modalCard: {
      width: '100%', maxWidth: 360,
      backgroundColor: isDark ? T.glass2 : '#FFFFFF',
      borderRadius: 14, padding: 20,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#EEF2F7',
    },
    modalTitle: { color: T.text, fontSize: 15, fontWeight: '700', marginBottom: 14 },
    modalInput: {
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#E3E8F0',
      borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
      fontSize: 16, color: T.text,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F9FAFB',
    },
    modalActions: {
      flexDirection: 'row', justifyContent: 'flex-end',
      gap: 8, marginTop: 16,
    },
    modalBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
    modalBtnPrimary: { backgroundColor: T.trading.buy.primary },
    modalBtnText: { color: T.text, fontSize: 14, fontWeight: '600' },
    modalBtnTextPrimary: { color: '#FFFFFF' },
  });
}

export type IndicatorConfigStyles = ReturnType<typeof makeIndicatorConfigStyles>;
