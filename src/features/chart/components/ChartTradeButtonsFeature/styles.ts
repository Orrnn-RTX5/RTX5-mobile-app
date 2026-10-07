import { StyleSheet } from 'react-native';

export const COMPACT_TRADE_FOOTER_ROW_HEIGHT = 40;

export const baseStyles = StyleSheet.create({
  chartTradeMarketActionRow: { flexDirection: 'row', direction: 'ltr', gap: 12, marginTop: 2 },
  chartTradeMarketActionButton: {
    flex: 1, minHeight: 48, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 10, paddingVertical: 6,
  },
  // Busy cue without dimming the whole tile (dimming reads as blink/shrink).
  chartTradeMarketActionButtonBusy: {
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  // Invalid lot: keep height/layout; only reduce opacity slightly.
  actionBtnLotInvalid: { opacity: 0.7 },
  chartTradeActionButtonDisabled: { opacity: 0.5 },
  chartTradeMarketActionTitle: {
    color: '#FFFFFF', fontSize: 12, fontWeight: '700',
    letterSpacing: 0.2, textTransform: 'uppercase', textAlign: 'center',
  },
  chartTradeMarketActionMeta: {
    color: '#FFFFFF', fontSize: 10, fontWeight: '700',
    marginTop: 1, fontVariant: ['tabular-nums'], textAlign: 'center',
    opacity: 0.95,
  },
  tradeControlsRow: {
    flexDirection: 'row', direction: 'ltr', alignItems: 'stretch',
    marginBottom: 0, gap: 0, paddingLeft: 0, paddingRight: 0,
    paddingVertical: 0, minHeight: COMPACT_TRADE_FOOTER_ROW_HEIGHT,
    overflow: 'visible',
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#9E9E9E',
  },
  actionButtonSlot: {
    flex: 1, minWidth: 0, alignItems: 'stretch', alignSelf: 'stretch',
    height: COMPACT_TRADE_FOOTER_ROW_HEIGHT, overflow: 'hidden',
  },
  actionBtn: {
    width: '100%', height: '100%', alignSelf: 'stretch', borderRadius: 0, minHeight: COMPACT_TRADE_FOOTER_ROW_HEIGHT, minWidth: 0,
    paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1,
    justifyContent: 'center', alignItems: 'center', position: 'relative',
  },
  actionLotSlot: {
    width: 172, minWidth: 164, maxWidth: 184, flexShrink: 0,
    alignSelf: 'stretch', height: COMPACT_TRADE_FOOTER_ROW_HEIGHT, overflow: 'hidden',
  },
  actionLotSlotCompact: {
    width: 82, minWidth: 82, maxWidth: 82,
  },
  actionLotControl: {
    flexDirection: 'row', alignItems: 'center', width: '100%', height: '100%',
    borderRadius: 0, borderWidth: 1, overflow: 'hidden',
  },
  actionLotControlEditing: { borderBottomWidth: 0, borderBottomColor: 'transparent' },
  actionLotPill: {
    flex: 1, minWidth: 0, height: '100%', paddingHorizontal: 4,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent',
    position: 'relative', zIndex: 3, elevation: 3,
  },
  actionLotAdjustButton: {
    width: 32, height: '100%', alignItems: 'center', justifyContent: 'center',
    position: 'relative', zIndex: 2, elevation: 2,
  },
  actionLotAdjustButtonCompact: {
    width: 22,
  },
  actionLotAdjustButtonDisabled: { opacity: 0.35 },
  actionLotUnderlayIconHidden: { opacity: 0 },
  actionLotCommittedOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    elevation: 20,
    backgroundColor: 'transparent',
  },
  actionLotCommittedIconBox: {
    width: 32,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLotCommittedValue: {
    flex: 1,
    minWidth: 0,
  },
  actionLotDisplayGhost: {
    opacity: 0,
  },
  actionLotInputWrap: {
    flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
    position: 'relative', zIndex: 3, elevation: 3,
  },
  actionLotKeyboardAccessory: {
    minHeight: 44,
    paddingHorizontal: 12,
    alignItems: 'flex-end',
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionLotKeyboardAccessoryButton: {
    minHeight: 36,
    minWidth: 72,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnHeader: {
    position: 'absolute', top: 2, left: 6, zIndex: 1,
    flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center',
  },
  actionBtnLabelTitle: { color: '#FFFFFF', fontSize: 9, fontWeight: '600', letterSpacing: 0.2 },
  actionBtnPriceText: {
    width: '100%',
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 25,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    paddingHorizontal: 4,
    includeFontPadding: false,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1.5,
  },
  actionLotCommittedIconBoxCompact: {
    width: 22,
  },
  actionBtnPriceTextCompact: {
    fontSize: 11,
    lineHeight: 18,
    paddingHorizontal: 1,
  },
  actionBtnPriceTrailingText: {
    fontSize: 23,
    lineHeight: 25,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
});

export const lightStyles = StyleSheet.create({
  tradeControlsRow: { borderColor: '#9E9E9E' },
  actionLotSlot: { backgroundColor: '#FFFFFF' },
  actionLotControl: { backgroundColor: '#FFFFFF', borderColor: '#CBD5E1' },
  actionLotControlPicker: { borderColor: '#CBD5E1' },
  actionLotValue: { color: '#0F172A' },
  actionLotAdjustIcon: { color: '#475569' },
  actionLotAdjustIconDisabled: { color: '#94A3B8' },
  actionLotInput: { color: '#0F172A' },
  actionLotKeyboardAccessory: { backgroundColor: '#F8FAFC', borderTopColor: '#CBD5E1' },
});

export const darkStyles = StyleSheet.create({
  tradeControlsRow: { borderColor: '#334155' },
  actionLotSlot: { backgroundColor: '#1F2937' },
  actionLotControl: { backgroundColor: '#1F2937', borderColor: '#334155' },
  actionLotControlPicker: { borderColor: '#334155' },
  actionLotValue: { color: '#F8FAFC' },
  actionLotAdjustIcon: { color: '#CBD5E1' },
  actionLotAdjustIconDisabled: { color: '#64748B' },
  actionLotInput: { color: '#F8FAFC' },
  actionLotKeyboardAccessory: { backgroundColor: '#1E1E1E', borderTopColor: '#334155' },
});

export const textBaseStyles = StyleSheet.create({
  actionLotValue: {
    minWidth: 0,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    includeFontPadding: false,
    position: 'relative',
    zIndex: 4,
    elevation: 4,
  },
  actionLotInput: {
    width: '100%', fontSize: 15, lineHeight: 20, fontWeight: '700',
    fontVariant: ['tabular-nums'], textAlign: 'center', paddingVertical: 0,
    includeFontPadding: false,
  },
  actionLotKeyboardAccessoryButtonText: {
    color: '#2563EB',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
});
