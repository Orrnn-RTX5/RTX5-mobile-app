import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Linking, Platform, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FastPressable as Pressable } from '../../ui/components/FastPressable';
import { Screen } from '../../ui/components/Screen';
import { useTheme } from '../../ui/theme/useTheme';
import { useIsDarkTheme } from '../../state/themeMode';
import { useTranslation } from '../../i18n/useTranslation';
import { makeLoginAccountStyles } from './loginAccountStyles';
import { makeBrokerAccountStyles } from './brokerAccountStyles';

type Props = {
  variant: 'login' | 'broker'; brokerId: string; brokerName: string; serverName: string; logoUrl?: string;
  identity: string; password: string; remember: boolean;
  onIdentityChange: (value: string) => void; onPasswordChange: (value: string) => void; onRememberChange: (value: boolean) => void;
  explanation?: string; error?: string; retryMessage?: string; recoveryUrl?: unknown;
  busy: boolean; hydrating: boolean; disabled: boolean; demoAllowed: boolean;
  onSubmit: () => void; onDemo: () => void; onBack: () => void; onChangeBroker: () => void;
};

/** Previous login and broker-account layouts; transport belongs to GuestFlowHost. */
export function LoginAccountScreen(props: Props) {
  const T = useTheme(); const isDark = useIsDarkTheme(); const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions(); const { t } = useTranslation();
  const loginStyles = useMemo(() => makeLoginAccountStyles(T, isDark, insets, width, fontScale), [T, isDark, insets, width, fontScale]);
  const brokerStyles = useMemo(() => makeBrokerAccountStyles(T, isDark, insets.top), [T, isDark, insets.top]);
  const [showPassword, setShowPassword] = useState(false); const [logoFailed, setLogoFailed] = useState(false);
  const scroll = useRef<ScrollView>(null); const passwordInput = useRef<TextInput>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const positions = useRef<Record<string, number>>({});
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const focus = (key: string) => {
    if (timer.current) clearTimeout(timer.current);
    const reveal = () => {
      const offset = props.variant === 'broker' ? (positions.current.panel ?? 0) + (positions.current.group ?? 0) : positions.current.form ?? 0;
      scroll.current?.scrollTo({ y: Math.max(0, offset + (positions.current[key] ?? 0) - 176), animated: true });
    };
    reveal(); timer.current = setTimeout(reveal, Platform.OS === 'android' ? 260 : 80);
  };
  const initials = props.brokerName.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
  const hasLogo = Boolean(props.logoUrl && !logoFailed);
  const recovery = () => {
    if (typeof props.recoveryUrl === 'string' && /^https:\/\//.test(props.recoveryUrl)) void Linking.openURL(props.recoveryUrl);
    else Alert.alert(t('Forgot password?'), t('Contact your broker for account recovery.'));
  };
  const feedback = <>
    {props.explanation ? <Text style={{ color: T.textSub, fontSize: 14, lineHeight: 20, marginBottom: 16 }}>{props.explanation}</Text> : null}
    {props.error ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: T.trading.sell.primary, marginBottom: 12 }}>{props.error}</Text> : null}
    {props.retryMessage ? <Text accessibilityLiveRegion="polite" style={{ color: T.textSub, marginBottom: 12 }}>{props.retryMessage}</Text> : null}
  </>;
  const submitContent = props.busy ? <ActivityIndicator accessibilityLabel={t(props.hydrating ? 'Loading account and trading policy' : 'Submitting authentication')} color="#fff" /> : null;
  const eye = (style: any) => <Pressable accessibilityRole="button" accessibilityLabel={t(showPassword ? 'Hide password' : 'Show password')} style={style} onPress={() => setShowPassword(value => !value)} hitSlop={15}><Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={21} color={T.textSub} /></Pressable>;
  const remember = (styles: typeof loginStyles | typeof brokerStyles, label: string) => <Pressable style={styles.checkboxRow} accessibilityRole="checkbox" accessibilityLabel={t(label)} accessibilityState={{ checked: props.remember, disabled: props.busy }} disabled={props.busy} onPress={() => props.onRememberChange(!props.remember)} hitSlop={10}>
    <Ionicons name={props.remember ? 'checkbox' : 'square-outline'} size={24} color={props.remember ? T.trading.buy.primary : T.textSub} /><Text style={styles.checkboxText}>{t(label)}</Text>
  </Pressable>;
  const input = (key: 'identity' | 'password', style: any) => <TextInput ref={key === 'password' ? passwordInput : undefined} style={style} value={key === 'identity' ? props.identity : props.password} onChangeText={key === 'identity' ? props.onIdentityChange : props.onPasswordChange}
    accessibilityLabel={t(key === 'identity' ? 'Account login or username' : 'Password')} editable={!props.busy} autoCapitalize="none" autoCorrect={false} spellCheck={false} disableFullscreenUI
    secureTextEntry={key === 'password' && !showPassword} textContentType={key === 'password' ? 'password' : 'username'} autoComplete={key === 'password' ? 'current-password' : 'username'}
    onFocus={() => focus(key)} returnKeyType={key === 'identity' ? 'next' : 'done'} onSubmitEditing={key === 'identity' ? () => passwordInput.current?.focus() : props.onSubmit} selectionColor={T.accent} cursorColor={T.accent} underlineColorAndroid="transparent" />;

  if (props.variant === 'broker') {
    const styles = brokerStyles;
    return <Screen><View style={styles.page}>
      <View style={styles.header}><Pressable activateOnPressIn activateOnTouchStart accessibilityRole="button" accessibilityLabel={t('Back')} style={styles.iconBtn} onPress={props.onBack} hitSlop={15}><Ionicons name="arrow-back" size={26} color={T.text} /></Pressable><Text accessibilityRole="header" style={styles.headerTitle} numberOfLines={1}>{props.brokerName}</Text></View>
      <KeyboardAvoidingView style={styles.container} enabled={Platform.OS !== 'ios'} behavior={Platform.OS === 'ios' ? undefined : 'height'}>
        <ScrollView ref={scroll} style={styles.scrollViewport} contentContainerStyle={styles.scrollContent} automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'} keyboardShouldPersistTaps="always" canCancelContentTouches={Platform.OS === 'ios'} keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}>
          <View style={styles.brokerSummaryCard}><View style={styles.brokerSummaryTop}>
            <View style={styles.brokerLogoMark}>{hasLogo ? <Image source={{ uri: props.logoUrl }} style={styles.brokerLogoImage} resizeMode="contain" onError={() => setLogoFailed(true)} /> : <Text style={styles.brokerLogoText}>{initials}</Text>}</View>
            <View style={styles.brokerSummaryBody}><View style={styles.brokerKickerRow}><Text style={styles.brokerEyebrow}>{t('Selected broker')}</Text><View style={styles.readyPill}><View style={styles.readyDot} /><Text style={styles.readyText}>{t('Ready')}</Text></View></View>
              <Text style={styles.brokerName} numberOfLines={1}>{props.brokerName}</Text><View style={styles.brokerServerPill}><Ionicons name="server-outline" size={15} color={T.textSub} /><Text style={styles.brokerServerLine} numberOfLines={1}>{props.serverName}</Text></View>
            </View>
          </View></View>
          {feedback}
          {props.demoAllowed ? <View style={styles.optionPanel}><Pressable style={({ pressed }) => [styles.optionCommand, pressed && styles.optionCommandPressed]} accessibilityRole="button" disabled={props.busy} onPress={props.onDemo}>
            <View style={[styles.optionIcon, styles.optionIconDemo]}><Ionicons name="school" size={18} color="#fff" /></View><View style={styles.optionTextWrap}><Text style={styles.optionTitle}>{t('Open a demo account')}</Text><Text style={styles.optionSub}>{t('To learn trading and to test your strategies')}</Text></View><Ionicons name="chevron-forward" size={18} color={T.textSub} />
          </Pressable></View> : <Text style={styles.optionSub}>{t('Demo signup is disabled. Login and guest browsing are available.')}</Text>}
          <View style={styles.loginPanel} onLayout={event => { positions.current.panel = event.nativeEvent.layout.y; }}>
            <View style={styles.panelHeader}><View style={styles.panelTitleTopRow}><View style={styles.panelTitleRow}><View style={styles.panelIconMark}><Ionicons name="key-outline" size={18} color="#2563EB" /></View><Text style={styles.panelEyebrow}>{t('Existing account')}</Text></View><View style={styles.securePill}><Ionicons name="shield-checkmark-outline" size={14} color={T.trading.profit} /><Text style={styles.secureText}>{t('Secure')}</Text></View></View><Text style={styles.sectionTitle}>{t('Login to an existing account')}</Text></View>
            <View style={styles.fieldGroup} onLayout={event => { positions.current.group = event.nativeEvent.layout.y; }}>
              {(['identity', 'password'] as const).map(key => <View key={key} style={styles.fieldBlock} onLayout={event => { positions.current[key] = event.nativeEvent.layout.y; }}><Text style={styles.inputLabel}>{t(key === 'identity' ? 'Login' : 'Password')}</Text><View style={styles.inputShell}><Ionicons name={key === 'identity' ? 'person-outline' : 'lock-closed-outline'} size={19} color={T.textMuted} />{input(key, styles.input)}{key === 'password' ? eye(styles.fieldIconButton) : null}</View></View>)}
              <View style={styles.fieldBlock}><Text style={styles.inputLabel}>{t('Server')}</Text><Pressable style={styles.inputShell} accessibilityRole="button" accessibilityLabel={t('Select broker')} onPress={props.onChangeBroker}><Ionicons name="server-outline" size={19} color={T.textMuted} /><Text style={styles.serverValue} numberOfLines={1}>{props.serverName}</Text><Ionicons name="chevron-down" size={18} color={T.textSub} /></Pressable></View>
            </View>
            <View style={styles.formMetaRow}>{remember(styles, 'Save password')}<Pressable style={styles.forgotBtn} onPress={recovery} accessibilityRole="button"><Text style={styles.forgotText}>{t('Forgot password?')}</Text></Pressable></View>
            <Pressable activateOnPressIn latencyLabel="auth.login.submit" latencyBudgetMs={100} accessibilityRole="button" accessibilityState={{ disabled: props.disabled, busy: props.busy }} disabled={props.disabled} style={({ pressed }) => [styles.loginBtn, (pressed || props.disabled) && styles.loginBtnPressed]} onPress={props.onSubmit}>{submitContent || <Text style={styles.loginBtnText}>{t('Login')}</Text>}</Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View></Screen>;
  }
  const styles = loginStyles;
  return <KeyboardAvoidingView style={styles.bg} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <View style={styles.headerRow}><Pressable activateOnPressIn activateOnTouchStart accessibilityRole="button" accessibilityLabel={t('Back')} style={styles.backBtn} onPress={props.onBack}><Ionicons name="arrow-back" size={24} color={T.text} /></Pressable><Text accessibilityRole="header" style={styles.headerTitle}>{t('Login Account')}</Text></View>
    <ScrollView ref={scroll} style={styles.container} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="always" canCancelContentTouches={Platform.OS === 'ios'}>
      <View style={styles.sectionTitleContainer}><Text style={styles.sectionTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.72}>{t('Sign in to your trading account')}</Text><Text style={styles.sectionSubtitle}>{t('Secure access to your broker workspace')}</Text></View>
      <View style={styles.formContainer} onLayout={event => { positions.current.form = event.nativeEvent.layout.y; }}>
        {feedback}
        <View style={styles.fieldBlock}><Text style={styles.inputLabel}>{t('Broker Server')}</Text><View style={[styles.inputRow, styles.brokerInputRow]}>
          <View style={[styles.brokerAvatar, !hasLogo && styles.brokerAvatarFallback]}>{hasLogo ? <Image source={{ uri: props.logoUrl }} style={styles.brokerAvatarImage} resizeMode="contain" onError={() => setLogoFailed(true)} /> : <Text style={styles.brokerAvatarInitials}>{initials}</Text>}</View>
          <View style={styles.fieldValueColumn}><Text style={[styles.input, styles.brokerInput]}>{props.brokerId}</Text><Text style={styles.brokerInlineHint} numberOfLines={1}>{props.serverName}</Text><View style={styles.brokerHealthStatusSlot} /></View>
          <Pressable style={styles.brokerPickerBtn} accessibilityRole="button" accessibilityLabel={t('Select broker')} onPress={props.onChangeBroker}><Ionicons name="chevron-down" size={19} color={T.accent} /></Pressable>
        </View></View><View style={styles.fieldDivider} />
        {(['identity', 'password'] as const).map(key => <React.Fragment key={key}><View style={styles.fieldBlock} onLayout={event => { positions.current[key] = event.nativeEvent.layout.y; }}><Text style={styles.inputLabel}>{t(key === 'identity' ? 'Login ID' : 'Password')}</Text><View style={styles.inputRow}><Ionicons name={key === 'identity' ? 'person-outline' : 'lock-closed-outline'} size={21} color={T.textSub} style={styles.inputLeadingIcon} />{input(key, [styles.input, styles.stackedInput])}{key === 'password' ? eye(styles.eyeIconBtn) : null}</View></View><View style={styles.fieldDivider} /></React.Fragment>)}
        {remember(styles, 'Remember me')}
        <Pressable activateOnPressIn latencyLabel="auth.login.submit" latencyBudgetMs={100} accessibilityRole="button" accessibilityState={{ disabled: props.disabled, busy: props.busy }} disabled={props.disabled} style={({ pressed }) => [styles.loginBtn, (pressed || props.disabled) && styles.loginBtnPressed]} onPress={props.onSubmit}>{submitContent || <Text style={styles.loginBtnText}>{t('LOGIN')}</Text>}</Pressable>
        {props.demoAllowed ? <View style={styles.registerPromptRow}><Text style={styles.registerPromptText}>{t("Don't have an account?")}</Text><Pressable style={styles.registerAccountBtn} disabled={props.busy} onPress={props.onDemo}><Text style={styles.registerAccountText}>{t('Register an account')}</Text></Pressable></View> : <Text style={styles.registerPromptText}>{t('Demo signup is disabled. Login and guest browsing are available.')}</Text>}
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}
