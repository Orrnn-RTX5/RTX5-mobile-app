import { StyleSheet } from 'react-native';
import type { ThemeColors } from '../../../ui/theme/glass';

const SETTINGS_DARK_BACKGROUND = '#121212';
const SETTINGS_DARK_CARD_BACKGROUND = '#1E1E1E';
const SETTINGS_DARK_ICON_BOX_BACKGROUND = '#1E1E1E';
const SETTINGS_DARK_BORDER = 'rgba(255,255,255,0.10)';
const SETTINGS_DARK_DIVIDER = 'rgba(255,255,255,0.08)';
const SETTINGS_DARK_PRIMARY_TEXT = '#FFFFFF';
const SETTINGS_DARK_SECONDARY_TEXT = 'rgba(235,235,245,0.62)';
const SETTINGS_DARK_MUTED_TEXT = 'rgba(235,235,245,0.54)';
const SETTINGS_DARK_ACCENT = '#347DFF';
const SETTINGS_DARK_DANGER = '#FF5A5F';
const SETTINGS_DARK_SHADOW = '#000000';

const resolveSettingsBackground = (T: ThemeColors, themeMode: 'light' | 'dark') =>
  themeMode === 'dark' ? SETTINGS_DARK_BACKGROUND : T.bg;

const resolveSettingsCardBackground = (T: ThemeColors, themeMode: 'light' | 'dark') =>
  themeMode === 'dark' ? SETTINGS_DARK_CARD_BACKGROUND : T.glass2;

export const makeSettingsStyles = (T: ThemeColors, themeMode: 'light' | 'dark') => {
  const settingsBackground = resolveSettingsBackground(T, themeMode);
  const settingsCardBackground = resolveSettingsCardBackground(T, themeMode);

  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: settingsBackground },
  container: { flex: 1, backgroundColor: settingsBackground },
  content: { paddingBottom: 20 },

  headerWrap: {
    backgroundColor: settingsBackground,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: themeMode === 'dark' ? SETTINGS_DARK_DIVIDER : 'rgba(0,0,0,0.06)',
    zIndex: 10,
  },
  searchBarWrap: { paddingHorizontal: 16, paddingBottom: 12 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, height: 44, width: '100%', gap: 10,
  },

  cardShadow: {
    shadowColor: themeMode === 'light' ? '#0F172A' : SETTINGS_DARK_SHADOW,
    shadowOffset: { width: 0, height: themeMode === 'light' ? 8 : 6 },
    shadowOpacity: themeMode === 'light' ? 0.04 : 0.22,
    shadowRadius: themeMode === 'light' ? 24 : 16,
    elevation: themeMode === 'light' ? 0 : 4,
  },

  // Header
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
  },
  menuBtn: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: themeMode === 'dark' ? SETTINGS_DARK_ICON_BOX_BACKGROUND : T.glass1,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: themeMode === 'dark' ? SETTINGS_DARK_BORDER : T.borderMedium,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: themeMode === 'dark' ? SETTINGS_DARK_PRIMARY_TEXT : T.text, fontSize: 18, fontWeight: '500' },
  headerSub: { color: themeMode === 'dark' ? SETTINGS_DARK_SECONDARY_TEXT : T.textSub, fontSize: 13, fontWeight: '500', marginTop: 2 },
  searchBtn: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: themeMode === 'dark' ? SETTINGS_DARK_ICON_BOX_BACKGROUND : T.glass1,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: themeMode === 'dark' ? SETTINGS_DARK_BORDER : T.borderMedium,
  },

  // Account Card
  accountCard: {
    marginHorizontal: 16, marginTop: 12, borderRadius: themeMode === 'dark' ? 22 : 20, padding: 20,
    borderWidth: 1, borderColor: themeMode === 'light' ? 'rgba(79,70,229,0.1)' : SETTINGS_DARK_BORDER,
    overflow: 'hidden', position: 'relative',
    shadowColor: themeMode === 'light' ? '#4F46E5' : SETTINGS_DARK_SHADOW,
    shadowOffset: { width: 0, height: 12 }, shadowOpacity: themeMode === 'light' ? 0.15 : 0.24,
    shadowRadius: themeMode === 'light' ? 32 : 18, elevation: themeMode === 'light' ? 8 : 5,
  },
  cardBubbleLeft: {
    position: 'absolute', top: -70, left: -20, width: 220, height: 220,
    borderRadius: 110, opacity: themeMode === 'light' ? 0.15 : 0,
  },
  cardBubbleRight: {
    position: 'absolute', top: -80, right: -60, width: 200, height: 200,
    borderRadius: 100, opacity: themeMode === 'light' ? 0.15 : 0,
  },

  ribbonContainer: {
    position: 'absolute', top: -3, right: -55, width: 140, height: 38,
    justifyContent: 'center', alignItems: 'center', paddingTop: 6,
    transform: [{ rotate: '45deg' }], zIndex: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 4,
  },
  ribbonText: { fontSize: 12, fontWeight: '600', letterSpacing: 0.4 },

  accTopRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 20, gap: 12, paddingRight: 56,
  },
  accEmail: {
    flexShrink: 1,
    color: themeMode === 'light' ? 'rgba(255,255,255,0.9)' : SETTINGS_DARK_SECONDARY_TEXT,
    fontSize: 13, fontWeight: '600', letterSpacing: 0.3,
  },

  accName: { color: themeMode === 'light' ? '#FFF' : SETTINGS_DARK_PRIMARY_TEXT, fontSize: 24, fontWeight: '700', letterSpacing: 0, marginBottom: 6 },
  accBalance: { color: themeMode === 'dark' ? SETTINGS_DARK_ACCENT : '#3b82f6', fontSize: 24, fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: 0 },
  accCurrency: { fontSize: 24, fontWeight: '600', color: themeMode === 'dark' ? SETTINGS_DARK_ACCENT : '#3b82f6' },

  accDivider: { height: 1, backgroundColor: themeMode === 'dark' ? SETTINGS_DARK_DIVIDER : 'rgba(255,255,255,0.08)', marginTop: 20, marginBottom: 16 },

  accDetailsWrap: { marginBottom: 16 },
  accCompany: { color: themeMode === 'light' ? 'rgba(255,255,255,0.9)' : SETTINGS_DARK_SECONDARY_TEXT, fontSize: 16, fontWeight: '600', marginBottom: 4 },
  accServer: { color: themeMode === 'dark' ? SETTINGS_DARK_MUTED_TEXT : T.textMuted, fontSize: 12, fontWeight: '500', letterSpacing: 0.1 },
  accServerRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 2, gap: 12 },

  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: themeMode === 'dark' ? SETTINGS_DARK_ICON_BOX_BACKGROUND : 'rgba(255,255,255,0.05)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, gap: 5, borderWidth: 1, borderColor: themeMode === 'dark' ? SETTINGS_DARK_BORDER : 'rgba(255,255,255,0.1)' },
  chipText: { color: T.textSub, fontSize: 11, fontWeight: '500' },

  // Metrics Row
  metricsRow: { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 14 },
  metricBlock: {
    flex: 1, backgroundColor: settingsCardBackground, borderRadius: themeMode === 'dark' ? 22 : 16,
    paddingVertical: 4, paddingHorizontal: 5,
    borderWidth: 1, borderColor: themeMode === 'dark' ? SETTINGS_DARK_BORDER : T.border, overflow: 'hidden',
    position: 'relative', gap: -5,
  },
  metricTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metricBlockActive: {
    borderColor: T.trading.buy.primary, backgroundColor: settingsCardBackground,
    shadowColor: T.trading.buy.primary, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15, shadowRadius: 16, elevation: themeMode === 'light' ? 0 : 6,
  },
  metricIconCircle: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: themeMode === 'dark' ? SETTINGS_DARK_ICON_BOX_BACKGROUND : T.glass1,
    borderWidth: 1, borderColor: themeMode === 'dark' ? SETTINGS_DARK_BORDER : T.border,
    alignItems: 'center', justifyContent: 'center',
  },
  metricIconCircleActive: {
    backgroundColor: themeMode === 'dark' ? SETTINGS_DARK_ICON_BOX_BACKGROUND : 'rgba(59, 130, 246, 0.15)',
    borderColor: themeMode === 'dark' ? SETTINGS_DARK_ACCENT : 'rgba(59, 130, 246, 0.3)',
  },
  metricLabel: { color: themeMode === 'dark' ? SETTINGS_DARK_SECONDARY_TEXT : T.textMuted, fontSize: 12, fontWeight: '500', letterSpacing: 0 },
  metricValue: {
    color: themeMode === 'dark' ? SETTINGS_DARK_PRIMARY_TEXT : T.text, fontSize: 22, fontWeight: '700', textAlign: 'center',
    fontVariant: ['tabular-nums'], letterSpacing: 0,
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 34 },
  toggleText: { color: themeMode === 'dark' ? SETTINGS_DARK_PRIMARY_TEXT : T.text, fontSize: 15, fontWeight: '600' },

  // Sections
  sectionTitle: { color: themeMode === 'dark' ? SETTINGS_DARK_MUTED_TEXT : T.textMuted, fontSize: 12, fontWeight: '600', letterSpacing: 0.4, marginLeft: 20, marginTop: 28, marginBottom: 8, textTransform: 'uppercase' },
  singleRowCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: settingsCardBackground, marginHorizontal: 16, padding: 16, borderRadius: themeMode === 'dark' ? 22 : 16, borderWidth: 1, borderColor: themeMode === 'light' ? 'rgba(0,0,0,0.03)' : SETTINGS_DARK_BORDER, overflow: 'hidden', position: 'relative' },
  singleRowCardPressed: { backgroundColor: themeMode === 'dark' ? '#252525' : 'rgba(29, 78, 216, 0.06)', borderColor: themeMode === 'dark' ? 'rgba(52,125,255,0.26)' : 'rgba(29,78,216,0.18)' },
  singleRowCardLogout: { flexDirection: 'row', alignItems: 'center', backgroundColor: settingsCardBackground, padding: 16, borderRadius: themeMode === 'dark' ? 22 : 16, borderWidth: 1, borderColor: themeMode === 'light' ? 'rgba(0,0,0,0.03)' : SETTINGS_DARK_BORDER, overflow: 'hidden', position: 'relative' },
  singleRowCardLogoutPressed: { backgroundColor: themeMode === 'dark' ? 'rgba(255,90,95,0.10)' : 'rgba(239,68,68,0.08)', borderColor: themeMode === 'dark' ? 'rgba(255,90,95,0.28)' : 'rgba(239,68,68,0.20)' },
  rowTitleSingle: { flex: 1, color: themeMode === 'dark' ? SETTINGS_DARK_PRIMARY_TEXT : T.text, fontSize: 15, fontWeight: '600', marginLeft: 16, zIndex: 1 },

  groupCard: { backgroundColor: settingsCardBackground, marginHorizontal: 16, borderRadius: themeMode === 'dark' ? 22 : 16, borderWidth: 1, borderColor: themeMode === 'light' ? 'rgba(0,0,0,0.03)' : SETTINGS_DARK_BORDER, overflow: 'hidden', position: 'relative' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, zIndex: 1 },
  rowPressed: { backgroundColor: themeMode === 'dark' ? 'rgba(255,255,255,0.045)' : 'rgba(29,78,216,0.055)' },
  dividerInner: { height: 1, backgroundColor: themeMode === 'dark' ? SETTINGS_DARK_DIVIDER : T.borderMedium, marginLeft: 72, zIndex: 1 },

  iconBox: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  iconBoxTint: themeMode === 'dark' ? { backgroundColor: SETTINGS_DARK_ICON_BOX_BACKGROUND } : {},
  rowTextWrap: { flex: 1, marginLeft: 14, zIndex: 1 },
  rowTitle: { color: themeMode === 'dark' ? SETTINGS_DARK_PRIMARY_TEXT : T.text, fontSize: 15, fontWeight: '600' },
  rowSub: { color: themeMode === 'dark' ? SETTINGS_DARK_SECONDARY_TEXT : T.textMuted, fontSize: 12, fontWeight: '500', marginTop: 2 },
  rowRight: { flexDirection: 'row', alignItems: 'center', zIndex: 1 },
  badge: { backgroundColor: themeMode === 'dark' ? SETTINGS_DARK_DANGER : '#dc2626', minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, marginRight: 10 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },

  radialHighlight: {
    position: 'absolute', top: -50, right: -50, width: 150, height: 150,
    backgroundColor: T.trading.buy.primary, borderRadius: 75, opacity: 0.05,
  },
  logoutContainer: { marginTop: 24, marginBottom: 24, paddingHorizontal: 16 },
  });
};

export type SettingsStyles = ReturnType<typeof makeSettingsStyles>;
