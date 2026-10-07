import { StyleSheet } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import type { ThemeColors } from '../../ui/theme/glass';

export function makeLoginAccountStyles(T: ThemeColors, isDark: boolean, insets: EdgeInsets, width: number, fontScale: number) {
  const pageBg = T.bg;
  const fieldBg = isDark ? T.glass1 : '#FFFFFF';
  const fieldBorder = isDark ? T.border : '#DFE7F1';
  const shadowColor = isDark ? '#000000' : T.textDark;
  const secondaryText = isDark ? '#93C5FD' : T.trading.buy.primary;
  const pageGutter = width - insets.left - insets.right < 360 ? 20 : 34;

  return StyleSheet.create({
    bg: {
      flex: 1,
      backgroundColor: T.bg,
      paddingTop: insets.top,
      paddingLeft: insets.left,
      paddingRight: insets.right,
    },
    container: {
      flex: 1,
      backgroundColor: pageBg,
    },
    /* Header */
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 8,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
      backgroundColor: T.glass1,
    },
    headerTitle: {
      flex: 1,
      minWidth: 0,
      color: T.text,
      fontSize: 20,
      fontWeight: '500',
      letterSpacing: 0,
    },

    scrollContent: {
      paddingTop: 20,
      paddingBottom: Math.max(36, insets.bottom + 16),
    },

    /* Section Title */
    sectionTitleContainer: {
      width: '100%',
      maxWidth: 760,
      alignSelf: 'center',
      paddingHorizontal: pageGutter,
      paddingTop: 0,
      paddingBottom: 30,
    },
    sectionTitle: {
      color: T.text,
      fontSize: 22,
      lineHeight: 28,
      fontWeight: '700',
      textAlign: 'left',
      letterSpacing: 0,
    },
    sectionSubtitle: {
      color: T.textSub,
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '500',
      marginTop: 12,
    },


    formContainer: {
      width: '100%',
      maxWidth: 760,
      alignSelf: 'center',
      paddingHorizontal: pageGutter,
      marginTop: 0,
    },

    /* Input Rows */
    fieldBlock: {
      marginBottom: 14,
    },
    inputRow: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 58,
      paddingVertical: 0,
      paddingLeft: 14,
      paddingRight: 12,
      marginBottom: 0,
      borderWidth: 1,
      borderColor: fieldBorder,
      borderRadius: 8,
      backgroundColor: fieldBg,
      shadowColor,
      shadowOpacity: isDark ? 0 : 0.035,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: isDark ? 0 : 1,
    },
    brokerInputRow: {
      minHeight: Math.max(80, Math.ceil(80 * fontScale)),
      paddingVertical: 12,
      alignItems: 'center',
    },
    inputLabel: {
      color: T.text,
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '600',
      marginBottom: 8,
      backgroundColor: 'transparent',
    },
    input: {
      flex: 1,
      minWidth: 0,
      color: T.text,
      fontSize: 16,
      lineHeight: 22,
      fontWeight: '500',
      padding: 0,
      paddingHorizontal: 0,
      margin: 0,
      textAlignVertical: 'center',
      backgroundColor: 'transparent',
      borderWidth: 0,
      borderColor: 'transparent',
      borderRadius: 0,
      shadowOpacity: 0,
      elevation: 0,
    },
    fieldValueColumn: {
      flex: 1,
      minWidth: 0,
      justifyContent: 'center',
    },
    stackedInput: {
      height: Math.max(40, Math.ceil(22 * fontScale + 16)),
      minHeight: 40,
      marginTop: 0,
    },
    brokerInput: {
      flex: 0,
      height: Math.max(25, Math.ceil(22 * fontScale + 3)),
      minHeight: 25,
      marginTop: 0,
    },
    brokerPickerBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 8,
      borderWidth: 0,
      backgroundColor: 'transparent',
    },
    brokerPickerBtnPressed: {
      opacity: 0.78,
    },
    brokerInlineHint: {
      color: T.textSub,
      fontSize: 12,
      fontWeight: '500',
      lineHeight: 16,
      marginTop: 1,
    },
    brokerInlineHintError: {
      color: T.trading.sell.primary,
    },
    brokerHealthStatusSlot: {
      // An empty status must not shift the broker name away from the logo's
      // center. The row can grow when a checking/error message is present.
      minHeight: 0,
    },

    /* Divider between fields */
    fieldDivider: {
      height: 0,
      backgroundColor: 'transparent',
      marginLeft: 0,
    },

    /* Eye Icon */
    eyeIconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 8,
      backgroundColor: 'transparent',
    },
    inputLeadingIcon: {
      width: 32,
      textAlign: 'center',
      marginRight: 10,
    },
    brokerAvatar: {
      width: 32,
      height: 32,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
      overflow: 'hidden',
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F8FAFC',
    },
    brokerAvatarFallback: {
      backgroundColor: T.trading.buy.primary,
    },
    brokerAvatarImage: {
      width: 24,
      height: 24,
    },
    brokerAvatarInitials: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 0,
    },

    /* Checkbox */
    checkboxRow: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      marginTop: 2,
      marginBottom: 14,
      paddingVertical: 2,
    },
    checkboxText: {
      flexShrink: 1,
      color: T.textSub,
      fontSize: 14,
      fontWeight: '500',
      marginLeft: 12,
    },

    /* Solid Login Button */
    loginBtn: {
      backgroundColor: T.trading.buy.primary,
      minHeight: 56,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 0,
      shadowColor: T.trading.buy.primary,
      shadowOpacity: 0.3,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    loginBtnPressed: {
      opacity: 0.85,
    },
    loginBtnText: {
      textAlign: 'center',
      flexShrink: 1,
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
      letterSpacing: 0,
    },

    registerPromptRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 16,
    },
    registerPromptText: {
      textAlign: 'center',
      color: T.textSub,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '500',
    },
    registerAccountBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 32,
      paddingHorizontal: 6,
      marginLeft: 4,
      backgroundColor: 'transparent',
    },
    registerAccountBtnPressed: {
      opacity: 0.82,
    },
    registerAccountText: {
      textAlign: 'center',
      color: secondaryText,
      fontSize: 13,
      fontWeight: '700',
    },

    /* Success / Error Modal */
    modalOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      justifyContent: 'center',
      zIndex: 999,
      elevation: 999,
    },
    successModal: {
      width: '100%',
      maxWidth: 340,
      backgroundColor: T.glass2,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: T.borderMedium,
      shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 24, elevation: 12,
    },
    successModalContent: {
      padding: 24,
      alignItems: 'center',
    },
    successIconBox: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: '#34C759',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 16,
    },
    successTitle: {
      color: T.text,
      fontSize: 20,
      fontWeight: '700',
      marginBottom: 8,
    },
    successDesc: {
      color: T.textSub,
      fontSize: 14,
      textAlign: 'center',
      marginBottom: 24,
      lineHeight: 20,
    },
    successBtn: {
      backgroundColor: T.accent,
      width: '100%',
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
    },
    successBtnText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
  });
}

