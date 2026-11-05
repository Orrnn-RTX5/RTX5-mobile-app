import { StyleSheet } from 'react-native';
import { spacing } from '../../../ui/theme/index';
import type { ThemeColors } from '../../../ui/theme/glass';

export function makeSymbolDetailsStyles(T: ThemeColors, isDark: boolean) {
  // Dark theme matches the app palette: #121212 canvas + #1E1E1E cards.
  const cardBg = isDark ? '#1E1E1E' : T.glass2;
  const nestedSurface = isDark ? '#1E1E1E' : T.glass1;
  const cardBorder = isDark ? 'rgba(148,163,184,0.18)' : T.border;
  const nestedBorder = isDark ? 'rgba(148,163,184,0.14)' : T.border;
  return {
    fl: StyleSheet.create({
      wrap: { flexDirection: 'row', alignItems: 'center', marginRight: 14 },
      ring: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: isDark ? 'rgba(59,130,246,0.2)' : T.border, overflow: 'hidden', backgroundColor: isDark ? '#1E1E1E' : T.glass2, shadowColor: isDark ? '#000' : '#475569', shadowOffset: { width: 0, height: 4 }, shadowOpacity: isDark ? 0 : 0.05, shadowRadius: 12, elevation: 0 },
      overlap: { marginLeft: -12 },
      img: { width: 40, height: 40, borderRadius: 20 },
      iconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: isDark ? 'rgba(59,130,246,0.08)' : T.glass1, borderWidth: 1, borderColor: isDark ? 'rgba(59,130,246,0.15)' : 'rgba(0,0,0,0.04)', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
    }),
    sec: StyleSheet.create({
      card: { backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder, borderRadius: 16, marginHorizontal: spacing.md, marginBottom: 12, overflow: 'hidden', shadowColor: isDark ? '#000' : '#64748B', shadowOffset: { width: 0, height: 8 }, shadowOpacity: isDark ? 0.36 : 0.08, shadowRadius: 24, elevation: 4 },
      headerGrad: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.border, gap: 10 },
      iconBox: { width: 26, height: 26, borderRadius: 7, backgroundColor: isDark ? 'rgba(96,165,250,0.1)' : 'rgba(37,99,235,0.08)', alignItems: 'center', justifyContent: 'center' },
      title: { color: T.textSub, fontSize: 12, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
    }),
    rw: StyleSheet.create({
      row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: T.border },
      key: { color: T.textSub, fontSize: 13, fontWeight: '500', letterSpacing: 0.2 },
      val: { color: T.text, fontSize: 14, fontWeight: '500', fontVariant: ['tabular-nums'], maxWidth: '65%', textAlign: 'right', letterSpacing: 0 },
    }),
    mp: StyleSheet.create({
      chip: { flex: 1, backgroundColor: isDark ? nestedSurface : T.glass2, shadowColor: isDark ? '#000' : '#475569', shadowOffset: { width: 0, height: 2 }, shadowOpacity: isDark ? 0 : 0.03, shadowRadius: 8, elevation: 0, borderWidth: 1, borderColor: nestedBorder, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 4, alignItems: 'center' },
      iconRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
      lbl: { color: T.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: '500' },
      val: { color: T.text, fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'], letterSpacing: 0 },
    }),
    rangeB: StyleSheet.create({
      track: { height: 3, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)', borderRadius: 2, position: 'relative' },
      fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2 },
      knob: { position: 'absolute', top: -6, width: 14, height: 14, borderRadius: 7, borderWidth: 2, marginLeft: -7, backgroundColor: cardBg },
    }),
    mom: StyleSheet.create({
      container: { marginHorizontal: 16, marginBottom: 16, padding: 14 },
      header: { marginBottom: 12 },
      title: { color: T.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 0.4 },
      barRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
      pctText: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'], width: 38 },
      barTrack: { flex: 1, height: 6, borderRadius: 3, flexDirection: 'row', overflow: 'hidden', backgroundColor: T.border },
      barFillLeft: { height: 6 },
      barFillRight: { height: 6 },
      labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingHorizontal: 48 },
      label: { fontSize: 10, fontWeight: '500', letterSpacing: 0.4 },
    }),
    ses: StyleSheet.create({
      dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: T.borderMedium },
      dotActive: { backgroundColor: T.up, shadowColor: T.up, shadowOpacity: 0.6, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
    }),
    nav: StyleSheet.create({
      bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingTop: 44, paddingBottom: 8 },
      back: { width: 38, height: 38, borderRadius: 12, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : T.glass1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.06)' : T.border },
      center: { flexDirection: 'row', alignItems: 'center', gap: 6 },
      liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: T.up, shadowColor: T.up, shadowOpacity: 0.8, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
      categoryText: { color: T.textMuted, fontSize: 12, fontWeight: '500', letterSpacing: 0.8, textTransform: 'uppercase' },
      rightGroup: { flexDirection: 'row', gap: 6 },
      iconBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : T.glass1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.06)' : T.border },
    }),
    glassHero: StyleSheet.create({
      container: { marginHorizontal: spacing.md, marginBottom: 16, borderRadius: 24, overflow: 'hidden', borderColor: cardBorder, borderWidth: 1, backgroundColor: cardBg, shadowColor: isDark ? '#000' : '#64748B', shadowOffset: { width: 0, height: 10 }, shadowOpacity: isDark ? 0.38 : 0.08, shadowRadius: 28, elevation: 4 },
      borderHighlight: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.15)' },
      header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 8, paddingBottom: 0 },
      priceRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 8, gap: 10 },
      bigPrice: { fontSize: 40, fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: 0, textShadowColor: isDark ? 'rgba(0,0,0,0.4)' : 'transparent', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },
      ptsTxt: { color: T.textSub, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'], marginTop: 4 },
      metricsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, marginBottom: 6 },
      rangeCard: { marginHorizontal: 14, marginBottom: 8, backgroundColor: nestedSurface, borderRadius: 12, borderWidth: 1, borderColor: nestedBorder, paddingVertical: 10 },
      rangeTop: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 8 },
      rangeLbl: { color: T.textMuted, fontSize: 11, fontWeight: '500', letterSpacing: 0.4, marginBottom: 4 },
      rangeVal: { color: T.text, fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
    }),
    hero: StyleSheet.create({
      sym: { color: T.text, fontSize: 24, fontWeight: '700', letterSpacing: 0 },
      name: { color: T.textSub, fontSize: 14, fontWeight: '500', marginTop: 2 },
      statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginBottom: 12 },
      statusDot: { width: 6, height: 6, borderRadius: 3 },
      statusTxt: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4 },
      changePill: { flexDirection: 'row', alignItems: 'center', gap: 3 },
      changeTxt: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
    }),
    ticker: StyleSheet.create({
      container: { marginHorizontal: 14, marginBottom: 8, borderRadius: 16, borderWidth: 1, borderColor: nestedBorder, backgroundColor: nestedSurface, position: 'relative', overflow: 'hidden' },
      spreadBadge: { position: 'absolute', top: -1, alignSelf: 'center', zIndex: 10, backgroundColor: isDark ? 'rgba(15,20,35,0.95)' : T.glass2, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, paddingHorizontal: 14, paddingVertical: 5, borderWidth: 1, borderTopWidth: 0, borderColor: T.border, flexDirection: 'row', alignItems: 'center', gap: 6 },
      spreadVal: { color: T.text, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
      spreadLbl: { color: T.textSub, fontSize: 10, fontWeight: '600', letterSpacing: 0.4 },
      inner: { flexDirection: 'row', direction: 'ltr', alignItems: 'stretch' },
      side: { flex: 1, alignItems: 'center', position: 'relative', paddingTop: 26, paddingBottom: 12 },
      sideHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
      sideLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.4 },
      arrowWrap: { width: 16, height: 16, borderRadius: 8, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : T.border, alignItems: 'center', justifyContent: 'center' },
      priceWrap: { flexDirection: 'row', alignItems: 'baseline' },
      priceBase: { color: T.text, fontSize: 20, fontWeight: '600', fontVariant: ['tabular-nums'], letterSpacing: 0 },
      pipHighlight: { fontSize: 24, fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: 0 },
      accentBar: { width: '80%', height: 3, borderRadius: 1.5, marginTop: 4, opacity: 0.9 },
      dividerCol: { alignItems: 'center', justifyContent: 'center', width: 44, position: 'relative' },
      dividerLine: { width: 1, backgroundColor: T.border, position: 'absolute', top: 0, bottom: 0 },
      pipBadge: { backgroundColor: isDark ? 'rgba(255,255,255,0.75)' : '#FFFFFF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, zIndex: 2, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1.5 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 2, marginTop: 14 },
      pipVal: { color: isDark ? '#000' : T.text, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
      pipUnit: { color: isDark ? '#000' : '#64748B', fontSize: 9, fontWeight: '600', letterSpacing: 0.4 },
      infoStrip: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
      infoItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
      infoTxt: { color: T.textSub, fontSize: 13, fontWeight: '600' },
    }),
    act: StyleSheet.create({
      row: { flexDirection: 'row', gap: 8, marginHorizontal: spacing.md, marginBottom: 16 },
      btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 14, paddingVertical: 15, gap: 6, overflow: 'hidden' },
      buyBtn: { borderWidth: 0, shadowColor: '#2563EB', shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
      buyTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
      chartBtn: { backgroundColor: isDark ? cardBg : T.glass2, borderWidth: 1, borderColor: cardBorder, shadowColor: isDark ? '#000' : '#64748B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: isDark ? 0.22 : 0.05, shadowRadius: 12, elevation: 1 },
      chartTxt: { color: T.textSub, fontSize: 15, fontWeight: '600' },
    })
  };
}

export type SymbolDetailsStyles = ReturnType<typeof makeSymbolDetailsStyles>;
