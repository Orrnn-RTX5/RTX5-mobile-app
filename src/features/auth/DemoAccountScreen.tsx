import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Linking, Platform, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FastPressable as Pressable } from '../../ui/components/FastPressable';
import { useTheme } from '../../ui/theme/useTheme';
import { useThemeMode } from '../../state/themeMode';
import { useTranslation } from '../../i18n/useTranslation';
import { makeDemoAccountStyles } from './demoAccountStyles';
import { validateDemoForm } from '../../api/guestAuthentication';
import { ActionSheet } from '../../ui/components/ActionSheet';
import type { DemoBrokerOption } from './demoBrokerOptions';
import { DEFAULT_PHONE_COUNTRY, PHONE_COUNTRIES, phoneCountrySearchDetails } from './phoneCountries';

type Field = 'firstName' | 'lastName' | 'email' | 'phone' | 'password' | 'confirmation';
type Props = {
  name: string; email: string; password: string; confirmation: string;
  onNameChange: (value: string) => void; onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void; onConfirmationChange: (value: string) => void;
  brokerName: string; leverage?: number; explanation?: string; error?: string; retryMessage?: string;
  brokerId: string; brokerOptions: readonly DemoBrokerOption[]; onSelectBroker: (brokerId: string) => void;
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
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const styles = useMemo(() => makeDemoAccountStyles(T, isDark, insets, width, fontScale, keyboardVisible), [T, isDark, insets, width, fontScale, keyboardVisible]);
  const [showPassword, setShowPassword] = useState(false);
  const [firstName, setFirstName] = useState(() => props.name.split(/\s+/)[0] ?? '');
  const [lastName, setLastName] = useState(() => props.name.split(/\s+/).slice(1).join(' '));
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [confirmationRequested, setConfirmationRequested] = useState(false);
  const [formError, setFormError] = useState('');
  const [brokerPickerOpen, setBrokerPickerOpen] = useState(false);
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_PHONE_COUNTRY);
  // The public registration DTO accepts identity fields only; phone stays in this form.
  const [phoneNumber, setPhoneNumber] = useState('');
  const scroll = useRef<ScrollView | null>(null);
  const fieldPositions = useRef<Partial<Record<Field, number>>>({});
  const focusedField = useRef<Field | null>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealFocusedField = () => {
    const position = focusedField.current ? fieldPositions.current[focusedField.current] : undefined;
    if (position === undefined) return;
    scroll.current?.scrollTo({ y: Math.max(0, position - (Platform.OS === 'android' ? 232 : 176)), animated: true });
  };
  useEffect(() => () => { if (focusTimer.current) clearTimeout(focusTimer.current); }, []);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  useEffect(() => {
    if (!keyboardVisible) return;
    // A newly revealed confirmation input can focus before its first layout.
    // Retry after the keyboard and bottom scroll space have been committed.
    const frame = requestAnimationFrame(revealFocusedField);
    return () => cancelAnimationFrame(frame);
  }, [keyboardVisible, confirmationRequested]);
  const requestRegistration = () => {
    if (props.busy || props.disabled || !termsAccepted) return;
    // Confirmation is an explicit second step so the initial form retains the
    // reference layout. The authoritative validator still requires a match.
    const error = validateDemoForm({ name: props.name, email: props.email, password: props.password, confirmation: props.password });
    if (error) { setFormError(error); return; }
    setFormError('');
    if (!confirmationRequested) { props.onConfirmationChange(''); setConfirmationRequested(true); return; }
    props.onSubmit();
  };
  const focusField = (field: Field) => {
    if (focusTimer.current) clearTimeout(focusTimer.current);
    focusedField.current = field;
    revealFocusedField(); focusTimer.current = setTimeout(revealFocusedField, Platform.OS === 'android' ? 260 : 80);
  };
  const legalUrl = (value: unknown) => typeof value === 'string' && /^https:\/\//.test(value) ? value : '';
  const termsUrl = legalUrl(props.termsUrl); const privacyUrl = legalUrl(props.privacyUrl);
  const recoveryUrl = legalUrl(props.recoveryUrl);
  const disabled = props.busy || props.disabled || !termsAccepted;
  const brokerActions = useMemo(() => props.brokerOptions.length ? props.brokerOptions.map(broker => ({
    label: broker.name,
    selected: broker.brokerId === props.brokerId,
    disabled: props.busy || !broker.server,
    subtitle: broker.server ? undefined : t('Connection settings unavailable'),
    onPress: () => { setBrokerPickerOpen(false); props.onSelectBroker(broker.brokerId); },
  })) : [{ label: t('Broker list unavailable'), disabled: true }], [props.brokerOptions, props.brokerId, props.busy, props.onSelectBroker, t]);
  // Keep the retained picker populated between opens. Clearing its rows during
  // dismissal makes the next country change rebuild the visible list.
  const countryActions = useMemo(() => PHONE_COUNTRIES.map(country => ({
    label: `${country.flag} ${t(country.name)}`,
    subtitle: phoneCountrySearchDetails(country),
    selected: country.code === phoneCountry.code,
    disabled: props.busy || !country.dialCodes.length,
    onPress: () => setPhoneCountry(country),
  })), [phoneCountry.code, props.busy, t]);
  const strength = props.password ? [props.password.length >= 8, /[A-Za-z]/.test(props.password), /[0-9]/.test(props.password), /[^A-Za-z0-9]/.test(props.password)].filter(Boolean).length : 0;
  const passwordValid = props.password.length >= 8 && /[A-Za-z]/.test(props.password) && /[0-9]/.test(props.password);
  const strengthColor = !strength ? '#64748B' : passwordValid ? '#22C55E' : strength >= 2 ? '#F59E0B' : '#EF4444';
  const iconColor = isDark ? T.textSub : T.textMuted;
  const accentColor = isDark ? T.accent : T.trading.buy.primary;
  const field = (key: Field, label: string, placeholder: string, value: string, change: (value: string) => void, icon: React.ComponentProps<typeof Ionicons>['name'], secure = false) => (
    <View style={styles.inputRow} onLayout={event => {
      fieldPositions.current[key] = event.nativeEvent.layout.y;
      if (keyboardVisible && focusedField.current === key) revealFocusedField();
    }}>
      <Text style={styles.inputLabel}>{t(label)}{key === 'lastName' ? <Text style={styles.inputOptionalLabel}> ({t('optional')})</Text> : null}</Text>
      <View style={styles.inputShell}>
        <Ionicons name={icon} size={21} color={iconColor} style={styles.inputRowIcon} />
        <TextInput
          autoFocus={key === 'confirmation'}
          accessibilityLabel={t(label)} style={styles.input} value={value} placeholder={t(placeholder)}
          placeholderTextColor={T.textMuted} onChangeText={change} editable={!props.busy}
          onFocus={() => focusField(key)} autoCapitalize={key === 'firstName' || key === 'lastName' ? 'words' : 'none'}
          onBlur={() => { if (focusedField.current === key) focusedField.current = null; }}
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
      </> : null}
    </View>
  );
  const legalLink = (label: string, url: string) => <Text accessibilityRole={url ? 'link' : undefined} style={styles.linkText} onPress={url ? () => { void Linking.openURL(url); } : undefined}>{t(label)}</Text>;
  const policyField = (label: string, icon: React.ComponentProps<typeof Ionicons>['name'], value = '--', paired = false) => <View style={paired ? styles.halfColumn : styles.inputRow}>
    <Text style={styles.inputLabel}>{t(label)}</Text>
    <View style={styles.inputShell} accessible accessibilityLabel={`${t(label)}: ${value === '--' ? t('Assigned by your broker') : value}`}>
      <Ionicons name={icon} size={21} color={iconColor} style={styles.inputRowIcon} />
      <Text style={styles.selectValue} numberOfLines={1}>{value}</Text>
    </View>
  </View>;
  return <View style={styles.bg}>
    <View style={styles.headerRow}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('Back')} onPress={props.onBack} hitSlop={10} activateOnTouchStart latencyLabel="register.back" latencyBudgetMs={50} style={styles.headerBackButton}>
        <Ionicons name="arrow-back" size={22} color={T.text} />
      </Pressable>
      <Text accessibilityRole="header" style={styles.headerTitle} numberOfLines={1}>Demo Account</Text>
      <View style={styles.headerRightSpacer} />
    </View>
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView ref={scroll} style={styles.scrollViewport} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="always" canCancelContentTouches={Platform.OS === 'ios'} showsVerticalScrollIndicator keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}>
        <View style={styles.formContainer}>
          {props.explanation ? <Text style={[styles.passwordStrengthText, { marginBottom: 14 }]}>{props.explanation}</Text> : null}
          {field('firstName', 'First name', 'Enter first name', firstName, value => { setFirstName(value); props.onNameChange(`${value} ${lastName}`.trim()); }, 'person-outline')}
          {field('lastName', 'Last name', 'Enter last name', lastName, value => { setLastName(value); props.onNameChange(`${firstName} ${value}`.trim()); }, 'id-card-outline')}
          {field('email', 'Email', 'Enter email address', props.email, props.onEmailChange, 'mail-outline')}
          <View style={styles.inputRow} onLayout={event => {
            fieldPositions.current.phone = event.nativeEvent.layout.y;
            if (keyboardVisible && focusedField.current === 'phone') revealFocusedField();
          }}>
            <Text style={styles.inputLabel}>{t('Phone')}</Text>
            <View style={styles.inputShell}>
              <Ionicons name="call-outline" size={21} color={iconColor} style={styles.inputRowIcon} />
              <Pressable style={styles.phoneCodeButton} accessibilityRole="button" accessibilityLabel={`${t('Select country code')}: ${t(phoneCountry.name)}, ${phoneCountry.dialCodes[0]}`} accessibilityState={{ expanded: countryPickerOpen, disabled: props.busy }} disabled={props.busy} onPress={() => { Keyboard.dismiss(); setCountryPickerOpen(true); }}>
                <Text style={styles.phoneCodeText} numberOfLines={1}>{phoneCountry.flag} {phoneCountry.dialCodes[0]}</Text>
                <Ionicons name="chevron-down" size={14} color={iconColor} />
              </Pressable>
              <View style={styles.phoneCodeDivider} />
              <TextInput style={styles.input} accessibilityLabel={t('Mobile number')} value={phoneNumber} onChangeText={setPhoneNumber} editable={!props.busy}
                keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel-national" autoCorrect={false} spellCheck={false} autoCapitalize="none" disableFullscreenUI
                onFocus={() => focusField('phone')} onBlur={() => { if (focusedField.current === 'phone') focusedField.current = null; }}
                selectionColor={accentColor} cursorColor={accentColor} underlineColorAndroid="transparent" />
            </View>
          </View>
          {field('password', 'Master password', '', props.password, props.onPasswordChange, 'lock-closed-outline', true)}
          <View style={styles.twoColumnRow}>
            {policyField('Currency', 'cash-outline', 'USD', true)}
            {policyField('Leverage', 'speedometer-outline', props.leverage === undefined ? '--' : `1:${props.leverage}`, true)}
          </View>
          {policyField('Initial balance', 'wallet-outline', '1000')}
          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>{t('Origin broker')}</Text>
            <Pressable style={styles.inputShell} accessibilityRole="button" accessibilityLabel={t('Select broker')} accessibilityState={{ expanded: brokerPickerOpen, disabled: props.busy }} disabled={props.busy} onPress={() => { Keyboard.dismiss(); setBrokerPickerOpen(true); }}>
              <Ionicons name="business-outline" size={21} color={iconColor} style={styles.inputRowIcon} />
              <Text style={styles.selectValue} numberOfLines={1}>{props.brokerName || t('Select broker')}</Text>
              <Ionicons name="chevron-down" size={20} color={iconColor} />
            </Pressable>
          </View>
          {confirmationRequested ? field('confirmation', 'Confirm password', 'Confirm password', props.confirmation, props.onConfirmationChange, 'lock-closed-outline', true) : null}
          <View style={styles.termsRow}>
            <Pressable accessibilityRole="checkbox" accessibilityLabel={t('I agree to the terms and privacy policy')} accessibilityState={{ checked: termsAccepted, disabled: props.busy }} disabled={props.busy} onPress={() => setTermsAccepted(value => !value)} hitSlop={11}>
              <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>{termsAccepted ? <Ionicons name="checkmark" size={17} color="#fff" /> : null}</View>
            </Pressable>
            <Text style={styles.termsText}>{t('I agree to the')}{' '}{legalLink('Terms and Conditions', termsUrl)} {t('and')} {legalLink('Privacy Policy', privacyUrl)}.</Text>
          </View>
          {props.error || formError ? <View style={[styles.inlineStatus, styles.inlineStatusError]}><Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.inlineStatusText}>{props.error || formError}</Text></View> : null}
          {props.retryMessage ? <Text accessibilityLiveRegion="polite" style={[styles.passwordStrengthText, { marginBottom: 12 }]}>{props.retryMessage}</Text> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={t('Register demo account')} accessibilityState={{ disabled, busy: props.busy }} disabled={disabled} onPress={requestRegistration} style={({ pressed }) => [styles.registerBtn, disabled && styles.registerBtnDisabled, pressed && !disabled && styles.registerBtnPressed]}>
            <LinearGradient colors={['#1597FF', '#006DFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.registerGradient}>
              {props.busy ? <ActivityIndicator accessibilityLabel={t(props.hydrating ? 'Loading account and trading policy' : 'Submitting authentication')} color="#fff" /> : null}
              <Text style={styles.registerBtnText}>{t(props.busy ? props.hydrating ? 'Loading account…' : 'Submitting…' : 'Register a demo account')}</Text>
            </LinearGradient>
          </Pressable>
          {!props.busy && props.error ? <View style={styles.loginPromptContainer}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('Login to an existing account')} onPress={props.onLogin} hitSlop={10}>
              <Text style={styles.loginLinkText}>{t('Login to an existing account')}</Text>
            </Pressable>
          </View> : null}
          {recoveryUrl ? <View style={styles.loginPromptContainer}>{legalLink('Account recovery', recoveryUrl)}</View> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    <ActionSheet visible={brokerPickerOpen} onClose={() => setBrokerPickerOpen(false)} title={t('Select broker')} searchable searchPlaceholder={t('Search brokers...')} detent="auto" instantOpen entryMotion="instant" runActionAfterClose={false}
      actions={brokerActions} />
    <ActionSheet visible={countryPickerOpen} onClose={() => setCountryPickerOpen(false)} title={t('Select country code')} searchable searchPlaceholder={t('Search country or code')}
      instantOpen entryMotion="instant" immediateHostHideOnClose runActionAfterClose={false} detent="large" deferOffscreenActions actions={countryActions} />
  </View>;
}
