import { StyleSheet } from 'react-native';
import type { ThemeColors } from '../../../ui/theme/glass';

export function makeEconomicCalendarStyles(T: ThemeColors, isDark: boolean) {
  const cardBg = isDark ? T.glass2 : '#FFFFFF';
  const raisedBg = isDark ? T.glass1 : '#F8FAFC';
  const activeBg = isDark ? T.glass3 : '#EEF2FF';
  const cardBorder = isDark ? T.border : 'rgba(0,0,0,0.06)';
  const divider = isDark ? T.borderSubtle : 'rgba(0,0,0,0.05)';
  const subtleText = isDark ? T.textMuted : '#94A3B8';

  return StyleSheet.create({
    screen: { backgroundColor: T.bg },
    scroll: { flex: 1 },
    content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32 },
    heroCard: {
      borderRadius: 16, overflow: 'hidden', marginBottom: 20,
      backgroundColor: cardBg,
      borderWidth: 1, borderColor: cardBorder,
      elevation: isDark ? 0 : 2,
      shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: isDark ? 0 : 0.05, shadowRadius: 10,
    },
    heroContent: { padding: 18 },
    heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
    heroIconWrap: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
    heroIconBadge: { position: 'absolute', bottom: 2, right: -2, backgroundColor: raisedBg, borderRadius: 9, padding: 2 },
    heroTitle: { color: isDark ? T.text : '#0F172A', fontSize: 17, fontWeight: '600', letterSpacing: 0 },
    heroSub: { color: isDark ? T.textSub : '#64748B', fontSize: 12, fontWeight: '600', marginTop: 1 },
    filterBtn: {
      width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
      backgroundColor: isDark ? raisedBg : 'rgba(79,70,229,0.08)',
    },
    heroPillsRow: { flexDirection: 'row', gap: 10 },
    heroPill: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      paddingVertical: 10, paddingHorizontal: 4, borderRadius: 10,
    },
    heroPillText: { color: isDark ? '#94A3B8' : '#64748B', fontSize: 13, fontWeight: '700' },
    segmentRow: {
      flexDirection: 'row', borderRadius: 12, padding: 3, gap: 3,
      backgroundColor: isDark ? raisedBg : '#E2E8F0', marginBottom: 10,
    },
    segmentBtn: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 10, overflow: 'hidden' },
    segmentBtnActive: {},
    segmentText: { color: subtleText, fontSize: 13, fontWeight: '700' },
    segmentTextActive: { color: '#FFFFFF', fontWeight: '600' },
    chipScroll: { marginBottom: 4 },
    chipScrollContent: { gap: 6, paddingRight: 16, paddingBottom: 10 },
    chipBtn: {
      paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
      borderWidth: 1, borderColor: isDark ? T.border : 'rgba(0,0,0,0.08)',
      backgroundColor: isDark ? raisedBg : '#FFFFFF',
    },
    chipBtnActive: {
      backgroundColor: isDark ? activeBg : '#EEF2FF',
      borderColor: isDark ? T.accent : '#4F46E5',
    },
    chipText: { color: subtleText, fontSize: 12, fontWeight: '700' },
    chipTextActive: { color: isDark ? T.accent : '#4F46E5' },
    daySection: { marginBottom: 20 },
    dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingHorizontal: 4 },
    dayHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dayHeaderDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: isDark ? T.accent : '#4F46E5' },
    dayHeaderTitle: { color: isDark ? T.textSub : '#334155', fontSize: 14, fontWeight: '600' },
    dayHeaderBadge: {
      paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20,
      backgroundColor: isDark ? activeBg : 'rgba(79,70,229,0.06)',
    },
    dayHeaderBadgeText: { color: isDark ? T.accent : '#4F46E5', fontSize: 11, fontWeight: '600' },
    eventsGroup: {
      borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: cardBorder, backgroundColor: cardBg,
    },
    eventCard: { overflow: 'hidden' },
    eventCardExpanded: { backgroundColor: isDark ? raisedBg : '#F8FAFC' },
    eventCardFirst: { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
    eventCardLast: { borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
    eventCardNotLast: { borderBottomWidth: 1, borderBottomColor: isDark ? divider : 'rgba(0,0,0,0.04)' },
    eventRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 20, paddingHorizontal: 16, gap: 12 },
    timeBlock: { width: 50, alignItems: 'center', gap: 6 },
    timeText: { color: isDark ? T.textSub : '#64748B', fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
    allDayPill: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: 'rgba(139,92,246,0.1)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6,
    },
    allDayText: { color: '#8B5CF6', fontSize: 8, fontWeight: '600', letterSpacing: 0.6 },
    releasedPill: { backgroundColor: 'rgba(16,185,129,0.12)', paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 4 },
    releasedPillText: { color: '#10B981', fontSize: 7, fontWeight: '600', letterSpacing: 0.5 },
    eventInfo: { flex: 1, gap: 6 },
    eventMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    currencyTag: {
      paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
      backgroundColor: isDark ? raisedBg : 'rgba(0,0,0,0.04)',
    },
    currencyTagText: { color: isDark ? T.accent : '#4338CA', fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
    eventTitle: { color: isDark ? T.text : '#0F172A', fontSize: 14, fontWeight: '700', lineHeight: 20 },
    eventTitleHoliday: { color: '#8B5CF6', fontStyle: 'italic' },
    valuePreview: { alignItems: 'flex-end', gap: 4 },
    previewActual: { fontSize: 16, fontWeight: '700' },
    previewForecast: { color: subtleText, fontSize: 14, fontWeight: '700' },
    previewLabel: { color: isDark ? T.textDimmed : '#CBD5E1', fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
    expandedPanel: { paddingHorizontal: 16, paddingBottom: 20, paddingTop: 4 },
    valuesGrid: {
      flexDirection: 'row', borderRadius: 14, overflow: 'hidden',
      borderWidth: 1, borderColor: isDark ? T.border : 'rgba(0,0,0,0.06)',
      backgroundColor: isDark ? raisedBg : '#F1F5F9',
    },
    valueCell: { flex: 1, alignItems: 'center', paddingVertical: 16 },
    valueCellBorder: { borderRightWidth: 1, borderRightColor: isDark ? divider : 'rgba(0,0,0,0.05)' },
    valueCellLabel: { color: subtleText, fontSize: 10, fontWeight: '600', letterSpacing: 1, marginBottom: 6 },
    valueCellData: { color: isDark ? T.textSub : '#334155', fontSize: 18, fontWeight: '600' },
    expandedMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
    expandedMetaRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    expandedMetaText: { color: subtleText, fontSize: 12, fontWeight: '600' },
    emptyState: { alignItems: 'center', paddingVertical: 60 },
    emptyIcon: {
      width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
      backgroundColor: isDark ? raisedBg : '#E2E8F0', marginBottom: 14,
    },
    emptyTitle: { color: isDark ? T.textSub : '#334155', fontSize: 16, fontWeight: '600' },
    emptySub: { color: subtleText, fontSize: 13, fontWeight: '500', marginTop: 4 },
    emptyResetBtn: {
      marginTop: 18, paddingHorizontal: 22, paddingVertical: 11, borderRadius: 12,
      backgroundColor: isDark ? activeBg : '#EEF2FF',
    },
    emptyResetText: { color: isDark ? T.accent : '#4F46E5', fontSize: 14, fontWeight: '600' },
    // Retained in-tree host is measured before the first tap; dim remains a
    // separate layer so the opaque sheet never inherits scrim opacity.
    filterSheetHost: {
      ...StyleSheet.absoluteFillObject,
      elevation: 10000,
      zIndex: 10000,
    },
    filterSheetHostHidden: {
      // React-owned final barrier for interrupted UI-thread animations.
      opacity: 0,
    },
    filterSheetAnimatedHost: {
      ...StyleSheet.absoluteFillObject,
    },
    modalOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      alignItems: 'stretch',
      backgroundColor: 'transparent',
      overflow: 'hidden',
    },
    modalCard: {
      // Edge-to-edge dock (MT5-style). Centered maxWidth cards look like they
      // scale/shrink while sliding on open.
      width: '100%',
      alignSelf: 'stretch',
      // Fully opaque surface — never animate opacity on this node.
      backgroundColor: cardBg,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: isDark ? T.border : 'rgba(0,0,0,0.06)',
      paddingHorizontal: 20,
      paddingBottom: 34,
      // Flat elevation during open — soft shadows can read as a shrinking ghost.
      elevation: 0,
      shadowOpacity: 0,
      shadowRadius: 0,
      shadowOffset: { width: 0, height: 0 },
    },
    modalHeader: { alignItems: 'center', paddingTop: 10, paddingBottom: 14 },
    modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: isDark ? T.borderHi : '#CBD5E1', marginBottom: 14 },
    modalTitle: { color: isDark ? T.text : '#0F172A', fontSize: 18, fontWeight: '600' },
    modalSub: { color: subtleText, fontSize: 12, fontWeight: '500', marginTop: 3 },
    modalGroupTitle: { color: subtleText, fontSize: 11, fontWeight: '600', letterSpacing: 1.2, marginBottom: 8, marginTop: 16 },
    modalImpactRow: { flexDirection: 'row', gap: 8 },
    modalImpactBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start',
      gap: 10, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 14,
      borderWidth: 1.5, borderColor: isDark ? T.border : 'rgba(0,0,0,0.06)',
      backgroundColor: raisedBg,
    },
    modalImpactIndicator: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
    modalImpactLabel: { color: subtleText, fontSize: 12, fontWeight: '700', flexShrink: 1 },
    modalToggleRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 14, paddingHorizontal: 14, borderRadius: 14,
      borderWidth: 1, borderColor: isDark ? T.border : 'rgba(0,0,0,0.06)',
      backgroundColor: raisedBg,
    },
    modalToggleRowActive: { borderColor: isDark ? T.borderHi : 'rgba(139,92,246,0.3)', backgroundColor: isDark ? activeBg : 'rgba(139,92,246,0.05)' },
    modalToggleLabel: { flex: 1, color: isDark ? T.textSub : '#334155', fontSize: 14, fontWeight: '600' },
    modalToggle: {
      width: 40, height: 22, borderRadius: 11, justifyContent: 'center',
      backgroundColor: isDark ? T.glass1 : '#CBD5E1', paddingHorizontal: 2,
    },
    modalToggleOn: { backgroundColor: '#8B5CF6' },
    modalToggleThumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFFFFF' },
    modalToggleThumbOn: { alignSelf: 'flex-end' },
    modalDoneBtn: { marginTop: 22, borderRadius: 14, overflow: 'hidden', paddingVertical: 15, alignItems: 'center' },
    modalDoneBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', letterSpacing: 0.3 },
  });
}

export type EconomicCalendarStyles = ReturnType<typeof makeEconomicCalendarStyles>;
