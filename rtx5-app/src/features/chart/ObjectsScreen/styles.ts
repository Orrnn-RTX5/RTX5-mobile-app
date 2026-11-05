import { StyleSheet } from 'react-native';
import type { ThemeColors } from '../../../ui/theme/glass';

export function makeObjectsScreenStyles(_T: ThemeColors, isDark: boolean) {
  const screenBg = isDark ? '#121212' : '#F2F4F8';
  const surface = isDark ? '#1E1E1E' : '#FFFFFF';
  const border = isDark ? 'rgba(148,163,184,0.18)' : 'rgba(15,23,42,0.08)';
  const primaryText = isDark ? '#F8FAFC' : '#0F172A';
  const secondaryText = isDark ? '#94A3B8' : '#64748B';
  const divider = isDark ? 'rgba(148,163,184,0.18)' : 'rgba(15,23,42,0.08)';

  return StyleSheet.create({
    screen: { backgroundColor: screenBg },
    header: { paddingHorizontal: 16, paddingBottom: 14, backgroundColor: screenBg },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    headerTitle: {
      flex: 1, textAlign: 'center',
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 17, fontWeight: '500', paddingHorizontal: 8,
    },
    headerSubtitle: {
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: 4,
    },
    sectionLabel: {
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 12, fontWeight: '700',
      letterSpacing: 0.7, textTransform: 'uppercase',
      marginTop: 20, marginBottom: 8, paddingHorizontal: 16,
    },
    panel: {
      marginHorizontal: 16, backgroundColor: surface,
      borderRadius: 14, borderWidth: 1, borderColor: border, overflow: 'hidden',
    },
    panelDivider: {
      height: StyleSheet.hairlineWidth, backgroundColor: divider, marginLeft: 64,
    },
    actionRow: {
      minHeight: 68, paddingHorizontal: 14,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    objectRow: {
      minHeight: 70, paddingHorizontal: 14,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    },
    toggleRow: {
      minHeight: 64, paddingHorizontal: 14,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    },
    rowPressed: { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.03)' },
    rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
    rowIconWrap: {
      width: 38,
      height: 38,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(37,99,235,0.18)' : 'rgba(37,99,235,0.08)',
    },
    rowCopy: { flex: 1, minWidth: 0 },
    rowTitle: { color: primaryText, fontSize: 15, fontWeight: '600' },
    rowSubtitle: { color: secondaryText, fontSize: 12, marginTop: 2 },
    objectsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 16 },
    countBadge: {
      minWidth: 24, height: 24, paddingHorizontal: 8, borderRadius: 12,
      backgroundColor: isDark ? 'rgba(59,130,246,0.16)' : 'rgba(59,130,246,0.12)',
      alignItems: 'center', justifyContent: 'center', marginTop: 12,
    },
    countText: { color: '#2563EB', fontSize: 12, fontWeight: '700' },
    objectRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 12 },
    hiddenPill: {
      paddingHorizontal: 8, height: 22, borderRadius: 11,
      backgroundColor: isDark ? 'rgba(100,116,139,0.18)' : 'rgba(100,116,139,0.12)',
      alignItems: 'center', justifyContent: 'center',
    },
    hiddenPillText: { color: secondaryText, fontSize: 11, fontWeight: '600' },
    lockedPill: {
      paddingHorizontal: 8, height: 22, borderRadius: 11,
      backgroundColor: isDark ? 'rgba(245,158,11,0.18)' : 'rgba(245,158,11,0.12)',
      alignItems: 'center', justifyContent: 'center',
    },
    lockedPillText: { color: isDark ? '#FBBF24' : '#B45309', fontSize: 11, fontWeight: '600' },
    emptyPanel: {
      alignItems: 'center', justifyContent: 'center',
      paddingVertical: 32, paddingHorizontal: 24,
      backgroundColor: surface,
    },
    emptyTitle: { color: primaryText, fontSize: 16, fontWeight: '700', marginTop: 12 },
    emptySubtitle: {
      color: secondaryText, fontSize: 13,
      textAlign: 'center', marginTop: 6, lineHeight: 18,
    },
    footerHint: {
      color: isDark ? '#64748B' : '#94A3B8',
      fontSize: 12, textAlign: 'center',
      paddingHorizontal: 24, marginTop: 12,
    },
    stylePreviewPanel: {
      paddingHorizontal: 14,
      paddingVertical: 14,
      gap: 14,
    },
    stylePreviewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    stylePreviewCopy: { flex: 1, minWidth: 0 },
    styleColorPill: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(15,23,42,0.12)',
    },
    stylePreviewLineTrack: {
      height: 42,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.035)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 18,
    },
    stylePreviewLine: {
      width: '100%',
      height: 1,
    },
    colorSwatchPanel: {
      padding: 14,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    colorSwatch: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(15,23,42,0.10)',
    },
    colorSwatchLight: {
      borderColor: isDark ? 'rgba(255,255,255,0.42)' : 'rgba(15,23,42,0.22)',
    },
    colorSwatchActive: {
      borderWidth: 2,
      borderColor: '#2563EB',
    },
    styleControlsPanel: {
      overflow: 'hidden',
    },
    styleStepperRow: {
      minHeight: 64,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    styleControlBlock: {
      paddingHorizontal: 14,
      paddingVertical: 14,
      gap: 10,
    },
    styleControlLabel: {
      color: primaryText,
      fontSize: 15,
      fontWeight: '600',
    },
    stepperControl: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 8,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(148,163,184,0.22)' : 'rgba(15,23,42,0.10)',
      overflow: 'hidden',
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(248,250,252,0.9)',
    },
    stepperButton: {
      width: 42,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepperValue: {
      width: 58,
      textAlign: 'center',
      color: primaryText,
      fontSize: 14,
      fontWeight: '700',
    },
    segmentedControl: {
      minHeight: 38,
      flexDirection: 'row',
      borderRadius: 8,
      padding: 3,
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.06)',
      gap: 3,
    },
    segmentItem: {
      flex: 1,
      minHeight: 32,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    segmentItemActive: {
      backgroundColor: isDark ? 'rgba(59,130,246,0.28)' : '#FFFFFF',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(96,165,250,0.42)' : 'rgba(37,99,235,0.18)',
    },
    segmentText: {
      color: secondaryText,
      fontSize: 12,
      fontWeight: '700',
    },
    segmentTextActive: {
      color: isDark ? '#BFDBFE' : '#1D4ED8',
    },
    fibLevelRow: {
      minHeight: 66,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    fibLevelRowSelected: {
      backgroundColor: isDark ? 'rgba(59,130,246,0.10)' : 'rgba(37,99,235,0.06)',
    },
    fibLevelColorDot: {
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(15,23,42,0.10)',
    },
    fibLevelRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginLeft: 10,
    },
    fibActionPanel: {
      marginTop: 12,
      flexDirection: 'row',
      minHeight: 50,
    },
    fibActionButton: {
      flex: 1,
      minHeight: 50,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 12,
    },
    fibActionText: {
      color: '#2563EB',
      fontSize: 14,
      fontWeight: '800',
    },
    fibActionDivider: {
      width: StyleSheet.hairlineWidth,
      backgroundColor: divider,
    },
    fibInputRow: {
      minHeight: 64,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    fibTextInput: {
      minWidth: 118,
      maxWidth: 170,
      minHeight: 40,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(148,163,184,0.22)' : 'rgba(15,23,42,0.10)',
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC',
      color: primaryText,
      fontSize: 14,
      fontWeight: '700',
      paddingHorizontal: 12,
      textAlign: 'right',
    },
    fibDeleteButton: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 14,
    },
    fibDeleteButtonDisabled: {
      opacity: 0.62,
    },
    fibDeleteText: {
      color: '#EF4444',
      fontSize: 14,
      fontWeight: '800',
    },
    fibDeleteTextDisabled: {
      color: isDark ? '#64748B' : '#94A3B8',
    },
    renameModalOverlay: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 24,
      backgroundColor: 'rgba(15,23,42,0.48)',
    },
    renameModalBackdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    renameModalSheet: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(148,163,184,0.2)' : 'rgba(15,23,42,0.1)',
      backgroundColor: surface,
      padding: 18,
      gap: 12,
    },
    renameModalTitle: {
      color: primaryText,
      fontSize: 17,
      fontWeight: '700',
      textAlign: 'center',
    },
    renameModalSubtitle: {
      color: secondaryText,
      fontSize: 12,
      fontWeight: '600',
      textAlign: 'center',
    },
    renameInput: {
      minHeight: 48,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(148,163,184,0.26)' : 'rgba(15,23,42,0.12)',
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC',
      color: primaryText,
      fontSize: 16,
      fontWeight: '600',
      paddingHorizontal: 14,
    },
    renameModalActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
      marginTop: 2,
    },
    renameModalButton: {
      minWidth: 88,
      height: 42,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
    },
    renameModalCancelText: {
      color: secondaryText,
      fontSize: 14,
      fontWeight: '700',
    },
    renameModalSaveButton: {
      backgroundColor: '#2563EB',
    },
    renameModalSaveDisabled: {
      backgroundColor: isDark ? 'rgba(100,116,139,0.24)' : 'rgba(148,163,184,0.28)',
    },
    renameModalSaveText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '800',
    },
    renameModalSaveTextDisabled: {
      color: isDark ? '#94A3B8' : '#64748B',
    },
  });
}

export type ObjectsScreenStyles = ReturnType<typeof makeObjectsScreenStyles>;
