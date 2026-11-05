import { StyleSheet } from 'react-native';
import type { ThemeColors } from '../../theme/useTheme';

const TIMEFRAME_ACTION_SHEET_DARK_BACKGROUND = '#1E1E1E';
export const ACTION_SHEET_SUBTITLE_ROW_MIN_HEIGHT = 60;

export function makeActionSheetStyles(T: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      width: '100%',
      zIndex: 9999,
      elevation: 9999,
      // Soft dim only — a heavy black veil read as a "shadow flash" on open.
      // A retained outer host must not own colored pixels. Its native opacity
      // can be driven outside React during fast handoffs, so keeping the scrim
      // here could expose a gray cover after the logical sheet is closed.
      backgroundColor: 'transparent',
      justifyContent: 'flex-end',
      overflow: 'hidden',
    },
    overlayMt5Plain: {
      // MT5 keeps the sheet surface opaque while only the backdrop fades.
      // Leaving the backdrop color on the parent would fade the sheet too and
      // create a translucent, shrinking-looking ghost during dismissal.
      backgroundColor: 'transparent',
    },
    backdrop: {
      zIndex: 0,
      elevation: 0,
    },
    backdropDefault: {
      // Soft dim only; a heavy black veil reads as a shadow flash on open.
      backgroundColor: isDark ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.12)',
    },
    backdropMt5Plain: {
      zIndex: 0,
      elevation: 0,
      // Match overlay: light scrim, not a black full-screen shadow.
      backgroundColor: isDark ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.12)',
    },
    sheetHost: {
      flex: 1,
      width: '100%',
      justifyContent: 'flex-end',
      position: 'relative',
      zIndex: 1,
      // No elevation here — Android elevation painted an extra drop-shadow
      // behind the sheet that looked like a second backdrop layer.
      elevation: 0,
    },
    sheetContainer: {
      width: '100%',
      justifyContent: 'flex-end',
    },
    sheet: {
      width: '100%',
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderTopWidth: 1,
      borderColor: T.border,
      backgroundColor: T.glass2,
      overflow: 'hidden',
      elevation: 0,
      shadowOpacity: 0,
      shadowRadius: 0,
      shadowOffset: { width: 0, height: 0 },
    },
    sheetMt5Plain: {
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
      borderTopWidth: 0,
      borderColor: 'transparent',
      backgroundColor: isDark ? T.glass2 : '#FFFFFF',
      elevation: 0,
      shadowOpacity: 0,
    },
    sheetTimeframeGrid: {
      backgroundColor: isDark ? TIMEFRAME_ACTION_SHEET_DARK_BACKGROUND : '#FFFFFF',
    },
    handle: {
      alignSelf: 'center',
      marginTop: 6,
      marginBottom: 4,
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: T.border,
    },
    titleContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: T.border,
      marginBottom: 8,
    },
    titleContainerMt5Plain: {
      justifyContent: 'flex-start',
      alignItems: 'center',
      paddingTop: 22,
      paddingBottom: 20,
      paddingHorizontal: 16,
      borderBottomWidth: 0,
      marginBottom: 0,
    },
    titleContainerCentered: {
      justifyContent: 'center',
    },
    titleTextMt5Plain: {
      flexShrink: 1,
    },
    titleTextCentered: {
      textAlign: 'center',
    },
    titlePrefix: {
      fontSize: 12,
      fontWeight: '600',
      color: T.textSub,
      textAlign: 'center',
    },
    titlePrefixCompact: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '500',
    },
    titlePrefixMt5Plain: {
      fontSize: 16,
      lineHeight: 22,
      fontWeight: '400',
      color: isDark ? T.textSub : '#7A7D86',
      textAlign: 'left',
    },
    titleSuffix: {
      fontSize: 12,
      fontWeight: '600',
      color: T.textSub,
      textAlign: 'center',
    },
    titleSuffixCompact: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '500',
    },
    titleSuffixMt5Plain: {
      fontSize: 16,
      lineHeight: 22,
      fontWeight: '400',
      color: isDark ? T.textSub : '#7A7D86',
      textAlign: 'left',
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? T.glass2 : 'rgba(0,0,0,0.03)',
      marginHorizontal: 16,
      marginBottom: 12,
      paddingHorizontal: 12,
      height: 40,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: T.border,
    },
    searchInput: {
      flex: 1,
      color: T.text,
      fontSize: 15,
      height: '100%',
    },
    searchInputCompact: {
      fontSize: 13,
      fontWeight: '500',
    },
    actionsScroll: {
      flexGrow: 0,
      flexShrink: 1,
    },
    actionsContent: {
      paddingBottom: 0,
    },
    actionsContentMt5Plain: {
      paddingBottom: 8,
    },
    actionsContentLarge: {
      flexGrow: 1,
    },
    action: {
      minHeight: 48,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    actionMt5Plain: {
      minHeight: 47,
      paddingHorizontal: 16,
    },
    actionWithSubtitle: {
      minHeight: ACTION_SHEET_SUBTITLE_ROW_MIN_HEIGHT,
      paddingVertical: 8,
    },
    actionLeft: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      minWidth: 0,
    },
    actionTextBlock: {
      flex: 1,
      minWidth: 0,
    },
    iconWrap: {
      width: 24,
      marginRight: 12,
      alignItems: 'center',
    },
    actionDanger: {
      backgroundColor: isDark ? 'rgba(255, 75, 66, 0.05)' : 'rgba(239, 68, 68, 0.05)',
    },
    actionPressed: {
      opacity: isDark ? 0.8 : 0.6,
      backgroundColor: T.glass3,
    },
    actionPressedMt5Plain: {
      backgroundColor: isDark ? T.glass3 : '#F2F4F7',
    },
    actionText: {
      fontSize: 17,
      fontWeight: '500',
    },
    actionTextCompact: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '500',
    },
    actionTextMt5Plain: {
      fontSize: 16,
      lineHeight: 22,
      fontWeight: '400',
    },
    actionSubtitle: {
      marginTop: 2,
      fontSize: 12,
      fontWeight: '500',
      color: T.textMuted,
    },
    actionSubtitleCompact: {
      fontSize: 13,
      fontWeight: '500',
    },
    actionTextNormal: {
      color: isDark ? T.text : '#111827',
    },
    actionTextNormalMt5Plain: {
      color: isDark ? '#EEF1F5' : '#4F535C',
    },
    actionTextSelected: {
      color: T.trading.buy.primary,
    },
    actionTextDanger: {
      color: T.trading.sell.primary,
    },
    actionDisabled: {
      opacity: 0.4,
    },
    actionDisabledMt5Plain: {
      opacity: 1,
    },
    actionTextDisabled: {
      color: T.textMuted,
    },
    actionTextDisabledMt5Plain: {
      color: isDark ? T.textMuted : '#CDD1D8',
    },
    timeframeGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 8,
    },
    timeframeGridAction: {
      flexBasis: '22.7%',
      minHeight: 40,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: isDark ? T.border : '#D7DBE2',
      backgroundColor: isDark ? T.glass2 : '#F2F4F8',
    },
    timeframeGridActionPressed: {
      backgroundColor: isDark ? T.glass1 : '#E9EDF3',
    },
    timeframeGridActionSelected: {
      borderColor: isDark ? T.accent : '#2563EB',
      backgroundColor: isDark ? 'rgba(52, 125, 255, 0.22)' : 'rgba(37, 99, 235, 0.12)',
    },
    timeframeGridActionDisabled: {
      opacity: 0.45,
    },
    timeframeGridText: {
      color: isDark ? T.text : '#4F535C',
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '500',
      textAlign: 'center',
    },
    timeframeGridTextSelected: {
      color: isDark ? T.accent : '#2563EB',
    },
    timeframeGridTextDisabled: {
      color: isDark ? T.textMuted : '#AEB4BF',
    },
  });
}
