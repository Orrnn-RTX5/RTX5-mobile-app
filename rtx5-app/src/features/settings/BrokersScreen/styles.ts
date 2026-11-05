import { StyleSheet } from 'react-native';
import { spacing } from '../../../ui/theme/index';
import type { ThemeColors } from '../../../ui/theme/glass';

export const makeBrokersStyles = (T: ThemeColors) => StyleSheet.create({
  page: { flex: 1 },
  headerCard: {
    marginTop: spacing.md, marginHorizontal: spacing.md,
    borderRadius: 14, borderWidth: 1, borderColor: T.border,
    backgroundColor: T.glass1, padding: spacing.md,
  },
  title: { color: T.text, fontSize: 31, fontWeight: '700', textAlign: 'center' },
  subtitle: { marginTop: 4, color: T.textSub, fontSize: 12, textAlign: 'center' },
  searchWrap: {
    marginTop: spacing.md, borderRadius: 12, borderWidth: 1, borderColor: T.border,
    backgroundColor: T.glass2, minHeight: 44, paddingHorizontal: 12,
    flexDirection: 'row', alignItems: 'center',
  },
  search: { flex: 1, marginLeft: 7, color: T.text, fontSize: 16, paddingVertical: 8 },
  filterRow: { marginTop: spacing.sm, flexDirection: 'row', marginRight: -spacing.sm },
  filterPill: {
    marginRight: spacing.sm, borderRadius: 999, borderWidth: 1, borderColor: T.border,
    backgroundColor: T.glass2, paddingHorizontal: 12, paddingVertical: 6,
  },
  filterPillActive: { borderColor: T.borderHi, backgroundColor: T.glass3 },
  filterLabel: { color: T.textMuted, fontSize: 12, fontWeight: '600' },
  filterLabelActive: { color: T.text },
  resultMeta: {
    marginTop: spacing.sm, color: T.textSub, fontSize: 11,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  listContent: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    paddingBottom: spacing.xl + spacing.md,
  },
  rowCard: {
    borderRadius: 12, borderWidth: 1, borderColor: T.border, backgroundColor: T.glass1,
    padding: 10, flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm,
  },
  logoImageWrap: {
    width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: T.border,
    backgroundColor: T.glass1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
  },
  logoImage: { width: 30, height: 30 },
  logoFallback: {
    width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: T.border,
    backgroundColor: T.glass2, alignItems: 'center', justifyContent: 'center',
  },
  rowMain: { flex: 1, marginLeft: 10, marginRight: 8 },
  rowTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { flex: 1, color: T.text, fontSize: 19, fontWeight: '600', paddingRight: 8 },
  server: { marginTop: 2, color: T.textSub, fontSize: 13 },
  metaRow: { marginTop: 6, flexDirection: 'row', flexWrap: 'wrap' },
  metaBadge: {
    marginRight: 6, marginBottom: 5, borderRadius: 999, borderWidth: 1, borderColor: T.border,
    backgroundColor: T.glass2, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 3,
  },
  metaBadgeText: { marginLeft: 4, color: T.textMuted, fontSize: 11 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeBlue: { backgroundColor: T.accentGlow },
  badgeText: {
    color: T.accent, fontSize: 10, fontWeight: '600',
    letterSpacing: 0.4, textTransform: 'uppercase',
  },
  infoButton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  emptyState: { marginTop: 28, alignItems: 'center' },
  emptyText: { marginTop: 8, color: T.textMuted, fontSize: 13 },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end', padding: spacing.md,
  },
  modalCard: {
    borderRadius: 16, borderWidth: 1, borderColor: T.borderHi,
    backgroundColor: T.glass1, padding: spacing.md,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center' },
  modalTitleWrap: { flex: 1, marginHorizontal: spacing.sm },
  modalTitle: { color: T.text, fontSize: 18, fontWeight: '700' },
  modalSub: { marginTop: 2, color: T.textSub, fontSize: 12 },
  modalStatsRow: { marginTop: spacing.md, flexDirection: 'row', marginRight: -spacing.sm },
  detailStat: {
    flex: 1, marginRight: spacing.sm, borderRadius: 10, borderWidth: 1, borderColor: T.border,
    backgroundColor: T.glass2, paddingVertical: 7, paddingHorizontal: 8,
  },
  detailLabel: { color: T.textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 },
  detailValue: { marginTop: 3, color: T.text, fontSize: 12, fontWeight: '600' },
  primaryButton: {
    marginTop: spacing.md, borderRadius: 11, backgroundColor: T.accent,
    minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  primaryButtonText: { marginLeft: 6, color: T.text, fontSize: 15, fontWeight: '700' },
  secondaryButton: {
    marginTop: spacing.sm, borderRadius: 11, borderWidth: 1, borderColor: T.borderHi,
    backgroundColor: T.glass2, minHeight: 44, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center',
  },
  secondaryButtonText: { marginLeft: 6, color: T.accent, fontSize: 15, fontWeight: '700' },
  linkRow: {
    marginTop: spacing.sm, flexDirection: 'row',
    alignSelf: 'center', alignItems: 'center', paddingVertical: 4,
  },
  linkText: { marginLeft: 5, color: T.textSub, fontSize: 13 },
  pressed: { opacity: 0.85 },
});

export type BrokersStyles = ReturnType<typeof makeBrokersStyles>;
