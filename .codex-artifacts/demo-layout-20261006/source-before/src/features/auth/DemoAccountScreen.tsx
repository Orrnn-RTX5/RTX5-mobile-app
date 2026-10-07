import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FastPressable as Pressable } from '../../ui/components/FastPressable';
import { useTheme } from '../../ui/theme/useTheme';
import { useThemeMode } from '../../state/themeMode';
import { useTranslation } from '../../i18n/useTranslation';
import { makeDemoAccountStyles } from './demoAccountStyles';

type Field = 'firstName' | 'lastName' | 'email' | 'password' | 'confirmation';
type Props = {
  name: string; email: string; password: string; confirmation: string;
  onNameChange: (value: string) => void; onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void; onConfirmationChange: (value: string) => void;
  brokerName: string; explanation?: string; error?: string; retryMessage?: string;
  busy: boolean; hydrating: boolean; disabled: boolean;
  termsUrl?: unknown; privacyUrl?: unknown; recoveryUrl?: unknown;
  onSubmit: () => void; onBack: () => void; onLogin: () => void; onChangeBroker: () => void;
};

/** Previous Demo Account presentation, driven by the shared authentication coordinator. */
export function DemoAccountScreen(props: Props) {
  const T = useTheme();
  const isDark = useThemeMode() === 'dark';
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const { t } = useTranslation();
  const styles = useMemo(() => makeDemoAccountStyles(T, isDark, insets, width, fontScale), [T, isDark, insets, width, fontScale]);
  const [showPassword, setShowPassword] = useState(false);
  const [firstName, setFirstName] = useState(() => props.name.split(/\s+/)[0] ?? '');
  const [lastName, setLastName] = useState(() => props.name.split(/\s+/).slice(1).join(' '));
  const [termsAccepted, setTermsAccepted] = useState(false);
  const scroll = useRef<ScrollView | null>(null);
  const fieldPositions = useRef<Partial<Record<Field, number>>>({});
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (focusTimer.current) clearTimeout(focusTimer.current); }, []);
  const focusField = (field: Field) => {
    if (focusTimer.current) clearTimeout(focusTimer.current);
    const reveal = () => scroll.current?.scrollTo({ y: Math.max(0, (fieldPositions.current[field] ?? 0) - (Platform.OS === 'android' ? 232 : 176)), animated: true });
    reveal(); focusTimer.current = setTimeout(reveal, Platform.OS === 'android' ? 260 : 80);
  };
  const legalUrl = (value: unknown) => typeof value === 'string' && /^https:\/\//.test(value) ? value : '';
  const termsUrl = legalUrl(props.termsUrl); const privacyUrl = legalUrl(props.privacyUrl);
  const recoveryUrl = legalUrl(props.recoveryUrl);
  const hasLegalLinks = Boolean(termsUrl || privacyUrl);
  const disabled = props.disabled || hasLegalLinks && !termsAccepted;
  const strength = props.password ? [props.password.length >= 8, /[A-Za-z]/.test(props.password), /[0-9]/.test(props.password), /[^A-Za-z0-9]/.test(props.password)].filter(Boolean).length : 0;
  const passwordValid = props.password.length >= 8 && /[A-Za-z]/.test(props.password) && /[0-9]/.test(props.password);
  const strengthColor = !strength ? '#64748B' : passwordValid ? '#22C55E' : strength >= 2 ? '#F59E0B' : '#EF4444';
  const iconColor = isDark ? T.textSub : T.textMuted;
  const accentColor = isDark ? T.accent : T.trading.buy.primary;
  const field = (key: Field, label: string, placeholder: string, value: string, change: (value: string) => void, icon: React.ComponentProps<typeof Ionicons>['name'], secure = false) => (
    <View style={styles.inputRow} onLayout={event => { fieldPositions.current[key] = event.nativeEvent.layout.y; }}>
      <Text style={styles.inputLabel}>{t(label)}{key === 'lastName' ? <Text style={styles.inputOptionalLabel}> ({t('optional')})</Text> : null}</Text>
      <View style={styles.inputShell}>
        <Ionicons name={icon} size={21} color={iconColor} style={styles.inputRowIcon} />
        <TextInput
          accessibilityLabel={t(label)} style={styles.input} value={value} placeholder={t(placeholder)}
          placeholderTextColor={T.textMuted} onChangeText={change} editable={!props.busy}
          onFocus={() => focusField(key)} autoCapitalize={key === 'firstName' || key === 'lastName' ? 'words' : 'none'}
          autoCorrect={false} spellCheck={false} disableFullscreenUI secureTextEntry={secure && !showPassword}
          keyboardType={key === 'email' ? 'email-address' : 'default'}
          textContentType={secure ? 'newPassword' : key === 'email' ? 'emailAddress' : 'name'}
          autoComplete={secure ? 'new-password' : key === 'email' ? 'email' : 'name'}
          selectionColor={accentColor} cursorColor={accentColor} underlineColorAndroid="transparent"
        />
        {secure ? <Pressable accessibilityRole="button" accessibilityLabel={t(showPassword ? 'Hide password' : 'Show password')} onPress={() => setShowPassword(value => !value)} hitSlop={15} style={styles.eyeIconBtn}>
          <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={21} color={iconColor} />
        </Pressable> : null}
      </View>
      {key === 'password' ? <>
        <View style={styles.passwordStrengthRow}>{[0, 1, 2, 3].map(level => <View key={level} style={[styles.passwordStrengthBar, level < strength && { backgroundColor: strengthColor }]} />)}</View>
        <Text style={styles.passwordStrengthText}>{t('Password strength:')} <Text style={{ color: strengthColor }}>{props.password ? t(passwordValid ? 'Strong' : strength >= 2 ? 'Medium' : 'Weak') : ''}</Text></Text>
        <Text style={styles.passwordStrengthText}>{t('Use at least 8 characters, including a letter and a number.')}</Text>
      </> : null}
    </View>
  );
  const legalLink = (label: string, url: string) => <Text accessibilityRole="link" style={styles.linkText} onPress={() => { void Linking.openURL(url); }}>{t(label)}</Text>;
  return <View style={styles.bg}>
    <View style={styles.headerRow}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('Back')} onPress={props.onBack} hitSlop={10} activateOnTouchStart latencyLabel="register.back" latencyBudgetMs={50} style={styles.headerBackButton}>
        <Ionicons name="arrow-back" size={22} color={T.text} />
      </Pressable>
      <Text accessibilityRole="header" style={styles.headerTitle} numberOfLines={1}>Demo Account</Text>
      <View style={styles.headerRightSpacer} />
    </View>
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView ref={scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="always" canCancelContentTouches={false} keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}>
        <View style={styles.formContainer}>
          {props.explanation ? <Text style={[styles.passwordStrengthText, { marginBottom: 14 }]}>{props.explanation}</Text> : null}
          {field('firstName', 'First name', 'Enter first name', firstName, value => { setFirstName(value); props.onNameChange(`${value} ${lastName}`.trim()); }, 'person-outline')}
          {field('lastName', 'Last name', 'Enter last name', lastName, value => { setLastName(value); props.onNameChange(`${firstName} ${value}`.trim()); }, 'id-card-outline')}
          {field('email', 'Email', 'Enter email address', props.email, props.onEmailChange, 'mail-outline')}
          {field('password', 'Master password', 'Enter password', props.password, props.onPasswordChange, 'lock-closed-outline', true)}
          {field('confirmation', 'Confirm password', 'Confirm password', props.confirmation, props.onConfirmationChange, 'lock-closed-outline', true)}
          {hasLegalLinks ? <View style={styles.termsRow}>
            <Pressable accessibilityRole="checkbox" accessibilityLabel={t('I agree to the terms and privacy policy')} accessibilityState={{ checked: termsAccepted, disabled: props.busy }} disabled={props.busy} onPress={() => setTermsAccepted(value => !value)} hitSlop={6}>
              <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>{termsAccepted ? <Ionicons name="checkmark" size={17} color="#fff" /> : null}</View>
            </Pressable>
            <Text style={styles.termsText}>{t('I agree to the')}{' '}{termsUrl ? legalLink('Terms and Conditions', termsUrl) : null}{termsUrl && privacyUrl ? ` ${t('and')} ` : ''}{privacyUrl ? legalLink('Privacy Policy', privacyUrl) : null}.</Text>
          </View> : null}
          {props.error ? <View style={[styles.inlineStatus, styles.inlineStatusError]}><Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.inlineStatusText}>{props.error}</Text></View> : null}
          {props.retryMessage ? <Text accessibilityLiveRegion="polite" style={[styles.passwordStrengthText, { marginBottom: 12 }]}>{props.retryMessage}</Text> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={t('Register demo account')} accessibilityState={{ disabled, busy: props.busy }} disabled={disabled} onPress={props.onSubmit} style={({ pressed }) => [styles.registerBtn, disabled && styles.registerBtnDisabled, pressed && !disabled && styles.registerBtnPressed]}>
            <LinearGradient colors={['#1597FF', '#006DFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.registerGradient}>
              {props.busy ? <ActivityIndicator accessibilityLabel={t(props.hydrating ? 'Loading account and trading policy' : 'Submitting authentication')} color="#fff" /> : null}
              <Text style={styles.registerBtnText}>{t(props.busy ? props.hydrating ? 'Loading account…' : 'Submitting…' : 'Register')}</Text>
            </LinearGradient>
          </Pressable>
          <View style={styles.loginPromptContainer}><Text style={styles.loginPromptText}>{t('Already have an account?')} </Text><Pressable accessibilityRole="button" disabled={props.busy} onPress={props.onLogin}><Text style={styles.loginLinkText}>{t('Login')}</Text></Pressable></View>
          {recoveryUrl ? <View style={styles.loginPromptContainer}>{legalLink('Account recovery', recoveryUrl)}</View> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </View>;
}
