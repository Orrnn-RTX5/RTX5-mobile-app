import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  type GestureResponderEvent,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../../i18n/useTranslation';
import { useThemeMode } from '../../state/themeMode';
import { FastPressable as Pressable } from '../../ui/components/FastPressable';
import { useTheme, type ThemeColors } from '../../ui/theme/useTheme';
import {
  ORRNN_DEMO_ORIGIN_BROKER_DISPLAY_NAME,
  ORRNN_DEMO_ORIGIN_BROKER_LABEL,
} from '../../api/publicDemo';

const REGISTER_HANDOFF_LIGHT_BACKGROUND = '#F2F4F8';

type RegisterHandoffPreviewProps = {
  onBack?: (event: GestureResponderEvent) => void;
  backLatencyLabel?: string;
};

/**
 * Preview component used during the registration or onboarding process handoff.
 */
export const RegisterHandoffPreview = React.memo(function RegisterHandoffPreview({
  onBack,
  backLatencyLabel = 'register.entry.back',
}: RegisterHandoffPreviewProps) {
  const { t } = useTranslation();
  const themeMode = useThemeMode();
  const T = useTheme();
  const insets = useSafeAreaInsets();
  const isDark = themeMode === 'dark';
  const styles = React.useMemo(() => makeStyles(T, isDark, insets.top), [T, isDark, insets.top]);
  const iconColor = isDark ? T.textSub : T.textMuted;

  return (
    <View style={styles.bg}>
      <View style={styles.headerRow}>
        <Pressable
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={onBack}
          activateOnPressIn
          activateOnTouchStart
          latencyLabel={backLatencyLabel}
          latencyBudgetMs={50}
          unstable_pressDelay={0}
          style={styles.headerBackButton}
        >
          <Ionicons name="arrow-back" size={22} color={T.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>Demo Account</Text>
        <View style={styles.headerRightSpacer} />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="always"
        canCancelContentTouches={Platform.OS === 'ios'}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.formContainer}>
          <PreviewInput
            styles={styles}
            icon="person-outline"
            iconColor={iconColor}
            label={t('First name')}
            value={t('Enter first name')}
          />
          <PreviewInput
            styles={styles}
            icon="id-card-outline"
            iconColor={iconColor}
            label={`${t('Last name')} (${t('optional')})`}
            value={t('Enter last name')}
          />
          <PreviewInput
            styles={styles}
            icon="mail-outline"
            iconColor={iconColor}
            label={t('Email')}
            value={t('Enter email address')}
          />

          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>{t('Phone')}</Text>
            <View style={styles.inputShell}>
              <Ionicons name="call-outline" size={21} color={iconColor} style={styles.inputRowIcon} />
              <View style={styles.phoneCodeButton}>
                <Text style={styles.phoneCodeText}>+1</Text>
                <Ionicons name="chevron-down" size={15} color={iconColor} />
              </View>
              <View style={styles.phoneCodeDivider} />
            </View>
          </View>

          <SelectPreview
            styles={styles}
            icon="earth-outline"
            iconColor={iconColor}
            label={t('Country')}
            value={t('United States')}
          />
          <PasswordPreview
            styles={styles}
            iconColor={iconColor}
            label={t('Master password')}
            strengthLabel={t('Password strength:')}
          />
          <PreviewInput
            styles={styles}
            icon="lock-closed-outline"
            iconColor={iconColor}
            label={t('Investor password')}
            value=""
            rightIcon="eye-outline"
          />

          <View style={styles.twoColumnRow}>
            <View style={styles.twoColumnCell}>
              <ReadonlyPreview
                styles={styles}
                icon="cash-outline"
                iconColor={iconColor}
                label={t('Currency')}
                value="USD"
              />
            </View>
            <View style={styles.twoColumnCell}>
              <SelectPreview
                styles={styles}
                icon="speedometer-outline"
                iconColor={iconColor}
                label={t('Leverage')}
                value="1:100"
              />
            </View>
          </View>

          <ReadonlyPreview
            styles={styles}
            icon="wallet-outline"
            iconColor={iconColor}
            label={t('Initial balance')}
            value="10000"
          />
          <ReadonlyPreview
            styles={styles}
            icon="business-outline"
            iconColor={iconColor}
            label={t('Origin broker')}
            value={ORRNN_DEMO_ORIGIN_BROKER_DISPLAY_NAME}
            detailValue={ORRNN_DEMO_ORIGIN_BROKER_LABEL}
          />

          <View style={styles.termsRow}>
            <View style={styles.checkbox} />
            <Text style={styles.termsText}>
              {t('I agree to the')}{' '}
              <Text style={styles.linkText}>{t('Terms and Conditions')}</Text>
              {' '}{t('and')}{' '}
              <Text style={styles.linkText}>{t('Privacy Policy')}</Text>.
            </Text>
          </View>

          <View style={styles.registerBtnDisabled}>
            <Text style={styles.registerBtnText}>{t('Register a demo account')}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
});

type PreviewProps = {
  styles: ReturnType<typeof makeStyles>;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  label: string;
  value: string;
  detailValue?: string;
  rightIcon?: keyof typeof Ionicons.glyphMap;
};

function PreviewInput({ styles, icon, iconColor, label, value, rightIcon }: PreviewProps) {
  return (
    <View style={styles.inputRow}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={styles.inputShell}>
        <Ionicons name={icon} size={21} color={iconColor} style={styles.inputRowIcon} />
        <Text style={value ? styles.inputPlaceholder : styles.selectValue} numberOfLines={1}>
          {value}
        </Text>
        {rightIcon ? <Ionicons name={rightIcon} size={21} color={iconColor} /> : null}
      </View>
    </View>
  );
}

function SelectPreview({ styles, icon, iconColor, label, value }: PreviewProps) {
  return (
    <View style={styles.inputRow}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={styles.inputShell}>
        <Ionicons name={icon} size={21} color={iconColor} style={styles.inputRowIcon} />
        <Text style={styles.selectValue} numberOfLines={1}>{value}</Text>
        <Ionicons name="chevron-down" size={20} color={iconColor} />
      </View>
    </View>
  );
}

function ReadonlyPreview({ styles, icon, iconColor, label, value, detailValue }: PreviewProps) {
  return (
    <View style={styles.inputRow}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={styles.inputShell}>
        <Ionicons name={icon} size={21} color={iconColor} style={styles.inputRowIcon} />
        <View style={styles.readonlyValueStack}>
          <Text style={styles.readonlyPrimaryValue} numberOfLines={1}>{value}</Text>
          {detailValue ? (
            <Text style={styles.readonlySecondaryValue} numberOfLines={1}>{detailValue}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function PasswordPreview({
  styles,
  iconColor,
  label,
  strengthLabel,
}: {
  styles: ReturnType<typeof makeStyles>;
  iconColor: string;
  label: string;
  strengthLabel: string;
}) {
  return (
    <View style={styles.inputRow}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={styles.inputShell}>
        <Ionicons name="lock-closed-outline" size={21} color={iconColor} style={styles.inputRowIcon} />
        <Text style={styles.selectValue} />
        <Ionicons name="eye-outline" size={21} color={iconColor} />
      </View>
      <View style={styles.passwordStrengthRow}>
        {[0, 1, 2, 3].map((level) => (
          <View key={level} style={styles.passwordStrengthBar} />
        ))}
      </View>
      <Text style={styles.passwordStrengthText}>{strengthLabel}</Text>
    </View>
  );
}

const makeStyles = (T: ThemeColors, isDark: boolean, safeTop: number) => {
  const pageBg = isDark ? T.bg : REGISTER_HANDOFF_LIGHT_BACKGROUND;
  const surface = isDark ? T.glass2 : '#FFFFFF';
  const raisedSurface = isDark ? T.glass1 : 'rgba(15,23,42,0.04)';
  const border = isDark ? T.border : '#DFE7F1';
  const divider = isDark ? T.borderSubtle : 'rgba(100,116,139,0.42)';
  const headerDivider = isDark ? T.borderSubtle : 'rgba(15,23,42,0.07)';
  const heroTitleColor = isDark ? '#FFFFFF' : T.text;

  return StyleSheet.create({
    bg: {
      flex: 1,
      backgroundColor: pageBg,
      paddingTop: safeTop,
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
      borderBottomColor: headerDivider,
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
      paddingTop: 16,
      paddingBottom: Platform.OS === 'android' ? 220 : 120,
    },
    formContainer: {
      paddingHorizontal: 24,
    },
    inputRow: {
      marginBottom: 11,
    },
    inputLabel: {
      color: heroTitleColor,
      fontSize: 14,
      lineHeight: 19,
      fontWeight: '600',
      marginBottom: 6,
      letterSpacing: 0,
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
    inputRowIcon: {
      width: 22,
      textAlign: 'center',
    },
    inputPlaceholder: {
      flex: 1,
      color: T.textMuted,
      fontSize: 16,
      fontWeight: '500',
      letterSpacing: 0,
      includeFontPadding: false,
    },
    selectValue: {
      flex: 1,
      color: T.text,
      fontSize: 14,
      fontWeight: '500',
      letterSpacing: 0,
      includeFontPadding: false,
    },
    readonlyValueStack: {
      flex: 1,
      minWidth: 0,
    },
    readonlyPrimaryValue: {
      color: T.text,
      fontSize: 14,
      lineHeight: 17,
      fontWeight: '600',
      letterSpacing: 0,
      includeFontPadding: false,
    },
    readonlySecondaryValue: {
      color: T.textSub,
      fontSize: 12,
      lineHeight: 15,
      fontWeight: '500',
      letterSpacing: 0,
      includeFontPadding: false,
      marginTop: 2,
    },
    phoneCodeButton: {
      minWidth: 54,
      height: 36,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      paddingHorizontal: 5,
      borderRadius: 7,
      backgroundColor: raisedSurface,
    },
    phoneCodeText: {
      color: T.text,
      fontSize: 14,
      fontWeight: '600',
      includeFontPadding: false,
    },
    phoneCodeDivider: {
      width: 1,
      height: 28,
      backgroundColor: border,
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
      backgroundColor: divider,
    },
    passwordStrengthText: {
      color: T.textMuted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '500',
    },
    twoColumnRow: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'flex-start',
      marginBottom: 11,
    },
    twoColumnCell: {
      flex: 1,
      minWidth: 0,
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
      borderWidth: 1,
      borderColor: T.accent,
      backgroundColor: 'transparent',
    },
    termsText: {
      flex: 1,
      color: T.textSub,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '500',
    },
    linkText: {
      color: T.accent,
      fontWeight: '600',
    },
    registerBtnDisabled: {
      height: 54,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
      opacity: 0.55,
      backgroundColor: T.trading.buy.primary,
    },
    registerBtnText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
      letterSpacing: 0,
    },
  });
};
