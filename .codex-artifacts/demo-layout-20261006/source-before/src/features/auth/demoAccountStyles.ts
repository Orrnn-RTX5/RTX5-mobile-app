import { Platform, StyleSheet } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import type { ThemeColors } from '../../ui/theme/useTheme';

/** Preserve the previous Demo Account screen's chrome, fields and blue action. */
export function makeDemoAccountStyles(T: ThemeColors, isDark: boolean, insets: EdgeInsets, width: number, fontScale: number) {
  const pageBg = isDark ? T.bg : '#F2F4F8';
  const surface = isDark ? T.glass2 : '#FFFFFF';
  const border = isDark ? T.border : '#DFE7F1';
  const divider = isDark ? T.borderSubtle : 'rgba(15,23,42,0.07)';
  const heroTitleColor = isDark ? '#FFFFFF' : T.text;
  const fieldText = T.text;
  const mutedText = T.textMuted;
  const primaryBlue = isDark ? T.accent : T.trading.buy.primary;
  const secondaryText = T.textSub;
  const actionTintBg = isDark ? T.glass1 : 'rgba(37,99,235,0.08)';
  const REGISTER_KEYBOARD_BOTTOM_PADDING = Platform.OS === 'android' ? 220 : 120;
  return StyleSheet.create({
    bg: {
      flex: 1,
      backgroundColor: pageBg,
      paddingTop: insets.top,
      paddingLeft: insets.left,
      paddingRight: insets.right,
    },
    container: {
      flex: 1,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 8,
      backgroundColor: pageBg,
      borderBottomWidth: 1,
      borderBottomColor: divider,
      zIndex: 10,
      elevation: 0,
    },
    headerBackButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      color: T.text,
      flex: 1,
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '500',
      letterSpacing: 0,
      textAlign: 'center',
      paddingHorizontal: 12,
    },
    headerRightSpacer: {
      width: 40,
      height: 40,
    },
    scrollContent: {
      paddingBottom: REGISTER_KEYBOARD_BOTTOM_PADDING + insets.bottom,
      paddingTop: 16,
    },
    formContainer: {
      position: 'relative',
      paddingHorizontal: width - insets.left - insets.right < 360 ? 16 : 24,
      width: '100%',
      maxWidth: 760,
      alignSelf: 'center',
    },
    inputRow: {
      marginBottom: 11,
    },
    inputRowIcon: {
      width: 22,
      textAlign: 'center',
    },
    inputLabel: {
      color: heroTitleColor,
      fontSize: 14,
      lineHeight: 19,
      fontWeight: '600',
      marginBottom: 6,
      letterSpacing: 0,
    },
    inputOptionalLabel: {
      color: secondaryText,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '500',
    },
    inputShell: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: border,
      backgroundColor: surface,
    },
    input: {
      flex: 1,
      minWidth: 0,
      color: fieldText,
      fontSize: 16,
      fontWeight: '500',
      padding: 0,
      paddingHorizontal: 0,
      margin: 0,
      height: Math.max(44, Math.ceil(22 * fontScale + 16)),
      minHeight: 44,
      backgroundColor: 'transparent',
      borderWidth: 0,
      borderColor: 'transparent',
      borderRadius: 0,
      shadowOpacity: 0,
      elevation: 0,
      textAlignVertical: 'center',
      includeFontPadding: false,
    },
    eyeIconBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    passwordStrengthRow: {
      flexDirection: 'row',
      gap: 4,
      width: 168,
      marginTop: 10,
      marginBottom: 5,
    },
    passwordStrengthBar: {
      flex: 1,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? divider : 'rgba(100,116,139,0.42)',
    },
    passwordStrengthText: {
      color: mutedText,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '500',
    },
    termsRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      marginTop: 2,
      marginBottom: 14,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 5,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: primaryBlue,
      backgroundColor: actionTintBg,
    },
    checkboxChecked: {
      backgroundColor: primaryBlue,
    },
    termsText: {
      flex: 1,
      color: secondaryText,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '500',
    },
    linkText: {
      color: primaryBlue,
      fontWeight: '600',
    },
    registerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: primaryBlue,
      minHeight: 54,
      borderRadius: 8,
      marginTop: 0,
      overflow: 'hidden',
      shadowColor: primaryBlue,
      shadowOpacity: 0.28,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    registerGradient: {
      flex: 1,
      minHeight: 54,
      alignSelf: 'stretch',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      paddingHorizontal: 18,
      paddingVertical: 14,
    },
    registerBtnPressed: {
      opacity: 0.85,
      transform: [{ scale: 0.98 }],
    },
    registerBtnDisabled: {
      opacity: 0.55,
      shadowOpacity: 0,
      elevation: 0,
    },
    registerBtnText: {
      flexShrink: 1,
      textAlign: 'center',
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
      letterSpacing: 0,
    },
    loginPromptContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: 24,
    },
    loginPromptText: {
      color: T.textSub,
      fontSize: 14,
    },
    loginLinkText: {
      color: T.accent,
      fontSize: 14,
      fontWeight: '600',
    },
    inlineStatus: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? border : 'rgba(59,130,246,0.18)',
      backgroundColor: isDark ? surface : 'rgba(59,130,246,0.06)',
    },
    inlineStatusError: {
      borderColor: isDark ? 'rgba(239,68,68,0.32)' : 'rgba(239,68,68,0.22)',
      backgroundColor: isDark ? 'rgba(239,68,68,0.10)' : 'rgba(239,68,68,0.06)',
    },
    inlineStatusText: {
      color: T.textSub,
      fontSize: 11,
      lineHeight: 15,
      marginTop: 2,
    },
  });
}
