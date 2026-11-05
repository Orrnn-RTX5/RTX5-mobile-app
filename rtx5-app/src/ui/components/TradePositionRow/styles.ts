import { StyleSheet } from 'react-native';
import { spacing } from '../../theme/index';

export const tradePositionRowStyles = StyleSheet.create({
  row: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    paddingTop: 12,
    paddingBottom: 10,
    paddingHorizontal: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
  },
  // Press feedback only — never scale the card. A scale transform made the
  // open trade row look like it was "shrinking" while expand/collapse ran.
  rowPressed: {
    opacity: 0.92,
  },
  shadowLight: {
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 1,
  },
  shadowDark: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  body: {
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  // Vertical stack: ticket, symbol row, open-price row — same left edge (x).
  leftCol: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
    gap: 4,
  },
  symbolLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
    // No extra left padding — starts at the same x as ticketId and open price.
    alignSelf: 'stretch',
  },
  ticketId: {
    fontSize: 11,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0,
    // In-flow (not absolute) so it shares the left column edge with symbol/price.
    textAlign: 'left',
  },
  symbol: {
    fontSize: 16,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0,
    flexShrink: 1,
  },
  sideBadge: {
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexShrink: 0,
  },
  sideText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'lowercase',
    letterSpacing: 0,
  },
  volume: {
    fontSize: 13,
    fontWeight: '500',
    flexShrink: 0,
  },
  pnl: {
    minWidth: 110,
    maxWidth: 140,
    textAlign: 'right',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0,
    fontVariant: ['tabular-nums'],
  },
  priceRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    minWidth: 0,
    // Same left edge as ticketId / symbolLine.
    alignSelf: 'stretch',
  },
  price: {
    fontSize: 13,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
    flexShrink: 0,
  },
  arrow: {
    marginHorizontal: 2,
    flexShrink: 0,
  },
  dateRight: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
    marginTop: 4,
  },
  rightCol: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    flexShrink: 0,
  },
  slTpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 16,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(150,150,150,0.1)',
  },
  slTpBadge: {
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(150,150,150,0.05)',
  },
  slTpText: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0,
  },

  /* ── Expanded Details ── */
  expandedSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  detailGrid: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  detailCell: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  limitsValue: {
    lineHeight: 18,
  },
  modBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(150,150,150,0.08)',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(150,150,150,0.2)',
    marginTop: 2,
  },
  modBadgeIcon: {
    fontSize: 12,
    color: 'rgba(150,150,150,0.8)',
  },
  overlayMenu: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 270,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingLeft: 4,
    borderLeftWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 100,
  },
  actionBtnContainer: {
    // Six non-overlapping 44px targets fit within the existing swipe drawer.
    width: 44,
    height: 44,
    marginLeft: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnPressable: {
    borderRadius: 24,
  },
  actionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  actionBtnPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.96 }],
  },
  actionBtnDisabled: {
    opacity: 0.55,
  },
});
