import { Ionicons } from '@expo/vector-icons';
import { memo, useMemo } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../../i18n/useTranslation';
import { useIsDarkTheme } from '../../state/themeMode';
import { useUserPreferences } from '../../state/userPreferences';
import { FastPressable } from '../../ui/components/FastPressable';
import { useTheme, type ThemeColors } from '../../ui/theme/useTheme';
import type { BrokerDetailLaunchSelection } from './brokerDetailLaunchController';

type BrokerDetailLaunchShellProps = Readonly<{
  selection: BrokerDetailLaunchSelection;
  onBack: () => void;
  onOpenDemo?: () => void;
  /**
   * Contract v3 sign-up gate (public /broker/config flags), resolved by the
   * caller so this first frame stays data-free. Both default to shown.
   */
  showDemoSignUp?: boolean;
  showRealSignUp?: boolean;
  backLatencyLabel?: string;
}>;

const formatBrokerInitials = (name: string) => {
  const words = name.replace(/\([^)]*\)/g, '').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word.charAt(0)).join('').toUpperCase() || 'BR';
};

const formatBrokerDisplayName = (selection: BrokerDetailLaunchSelection) => {
  const name = selection.brokerName.trim();
  const id = selection.brokerId.trim();
  if (!id) return name;
  if (!name) return id;
  return name.toLowerCase().includes(id.toLowerCase()) ? name : `${id} ${name}`;
};

/**
 * Lightweight, data-free first frame for the selected broker. It deliberately
 * contains no query, secure-storage, editable-field, or overlay-sheet work.
 */
export const BrokerDetailLaunchShell = memo(function BrokerDetailLaunchShell({
  selection,
  onBack,
  onOpenDemo,
  showDemoSignUp = true,
  showRealSignUp = true,
  backLatencyLabel = 'brokerDetail.launch.back',
}: BrokerDetailLaunchShellProps) {
  const T = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const isDark = useIsDarkTheme();
  const hasActiveRealAccount = useUserPreferences(
    (state) => state.isLoggedIn && state.accountType === 'real',
  );
  const styles = useMemo(
    () => makeStyles(T, isDark, insets.top),
    [T, insets.top, isDark],
  );
  const displayName = formatBrokerDisplayName(selection) || t('Broker');
  const server = selection.brokerServer || selection.brokerId || t('Server');

  return (
    <View style={styles.page} testID="broker-detail-launch-shell">
      <View style={styles.header}>
        <FastPressable
          style={styles.iconBtn}
          hitSlop={15}
          onPress={onBack}
          activateOnPressIn
          activateOnTouchStart
          latencyLabel={backLatencyLabel}
          latencyBudgetMs={50}
          unstable_pressDelay={0}
          accessibilityRole="button"
          accessibilityLabel={t('Back')}
        >
          <Ionicons name="arrow-back" size={26} color={T.text} />
        </FastPressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{selection.brokerName || t('Broker')}</Text>
      </View>

      <ScrollView
        scrollEnabled={false}
        pointerEvents={onOpenDemo ? 'auto' : 'none'}
        keyboardShouldPersistTaps="always"
        canCancelContentTouches={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.brokerSummaryCard}>
          <View style={styles.brokerSummaryTop}>
            <View style={styles.brokerLogoMark}>
              {selection.brokerLogoUrl ? (
                <Image
                  source={{ uri: selection.brokerLogoUrl }}
                  style={styles.brokerLogoImage}
                  resizeMode="contain"
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <Text style={styles.brokerLogoText}>{formatBrokerInitials(displayName)}</Text>
              )}
            </View>
            <View style={styles.brokerSummaryBody}>
              <View style={styles.brokerKickerRow}>
                <Text style={styles.brokerEyebrow}>{t('Selected broker')}</Text>
                <View style={styles.readyPill}>
                  <View style={styles.readyDot} />
                  <Text style={styles.readyText}>{t('Ready')}</Text>
                </View>
              </View>
              <Text style={styles.brokerName} numberOfLines={1}>{displayName}</Text>
              <View style={styles.brokerServerPill}>
                <Ionicons name="server-outline" size={15} color={T.textSub} />
                <Text style={styles.brokerServerLine} numberOfLines={1}>{server}</Text>
              </View>
            </View>
          </View>
        </View>

            <LaunchOptionsPanel
              demoTitle={t('Open a demo account')}
              demoSubtitle={t('To learn trading and to test your strategies')}
              realTitle={t('Open a real account')}
              realSubtitle={t('For live trading, additional identification is required')}
              hasActiveRealAccount={hasActiveRealAccount}
              onOpenDemo={onOpenDemo}
              showDemo={showDemoSignUp}
              showReal={showRealSignUp}
              styles={styles}
              T={T}
            />

            <View style={styles.loginPanel}>
              <LaunchLoginHeader
                existingLabel={t('Existing account')}
                secureLabel={t('Secure')}
                title={t('Login to an existing account')}
                styles={styles}
              />
              <LaunchCredentialFields
                loginLabel={t('Login')}
                passwordLabel={t('Password')}
                styles={styles}
                T={T}
              />
              <LaunchField label={t('Server')} value={server} icon="server-outline" trailing="chevron-down" styles={styles} T={T} strong />
              <LaunchLoginFooter
                savePasswordLabel={t('Save password')}
                forgotPasswordLabel={t('Forgot password?')}
                loginLabel={t('Login')}
                styles={styles}
              />
            </View>
      </ScrollView>
    </View>
  );
});

const LaunchOptionsPanel = memo(function LaunchOptionsPanel({
  demoTitle,
  demoSubtitle,
  realTitle,
  realSubtitle,
  hasActiveRealAccount,
  onOpenDemo,
  showDemo,
  showReal,
  styles,
  T,
}: {
  demoTitle: string;
  demoSubtitle: string;
  realTitle: string;
  realSubtitle: string;
  hasActiveRealAccount: boolean;
  onOpenDemo?: () => void;
  showDemo: boolean;
  showReal: boolean;
  styles: ReturnType<typeof makeStyles>;
  T: ThemeColors;
}) {
  // Brokers that disable sign-up (registration flags false) show no options.
  if (!showDemo && !showReal) return null;
  return (
    <View style={styles.optionPanel}>
      {showDemo ? (
        <LaunchOption
          icon="school"
          title={demoTitle}
          subtitle={demoSubtitle}
          onPress={onOpenDemo}
          latencyLabel="brokerDetail.launch.openDemo"
          styles={styles}
          T={T}
        />
      ) : null}
      {showDemo && showReal ? <View style={styles.optionDivider} /> : null}
      {showReal ? (
        <LaunchOption
          icon="trending-up"
          title={realTitle}
          subtitle={realSubtitle}
          disabled={hasActiveRealAccount}
          styles={styles}
          T={T}
        />
      ) : null}
    </View>
  );
});

const LaunchLoginHeader = memo(function LaunchLoginHeader({
  existingLabel,
  secureLabel,
  title,
  styles,
}: {
  existingLabel: string;
  secureLabel: string;
  title: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.panelHeader}>
      <View style={styles.panelTitleTopRow}>
        <View style={styles.panelTitleRow}>
          <View style={styles.panelIconMark}>
            <Ionicons name="key-outline" size={18} color="#2563EB" />
          </View>
          <Text style={styles.panelEyebrow}>{existingLabel}</Text>
        </View>
        <View style={styles.securePill}>
          <Ionicons name="shield-checkmark-outline" size={14} color={styles.secureText.color} />
          <Text style={styles.secureText}>{secureLabel}</Text>
        </View>
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
});

const LaunchCredentialFields = memo(function LaunchCredentialFields({
  loginLabel,
  passwordLabel,
  styles,
  T,
}: {
  loginLabel: string;
  passwordLabel: string;
  styles: ReturnType<typeof makeStyles>;
  T: ThemeColors;
}) {
  return (
    <>
      <LaunchField label={loginLabel} value={loginLabel} icon="person-outline" styles={styles} T={T} />
      <LaunchField label={passwordLabel} value={passwordLabel} icon="lock-closed-outline" trailing="eye-outline" styles={styles} T={T} />
    </>
  );
});

const LaunchLoginFooter = memo(function LaunchLoginFooter({
  savePasswordLabel,
  forgotPasswordLabel,
  loginLabel,
  styles,
}: {
  savePasswordLabel: string;
  forgotPasswordLabel: string;
  loginLabel: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <>
      <View style={styles.formMetaRow}>
        <View style={styles.checkboxRow}>
          <Ionicons name="checkbox" size={22} color="#2563EB" />
          <Text style={styles.checkboxText}>{savePasswordLabel}</Text>
        </View>
        <Text style={styles.forgotText}>{forgotPasswordLabel}</Text>
      </View>
      <View style={styles.loginBtn}>
        <Text style={styles.loginBtnText}>{loginLabel}</Text>
      </View>
    </>
  );
});

function LaunchOption({ icon, title, subtitle, disabled = false, onPress, latencyLabel, styles, T }: {
  icon: 'school' | 'trending-up';
  title: string;
  subtitle: string;
  disabled?: boolean;
  onPress?: () => void;
  latencyLabel?: string;
  styles: ReturnType<typeof makeStyles>;
  T: ThemeColors;
}) {
  const content = (
    <>
      <View style={styles.optionIcon}><Ionicons name={icon} size={18} color="#FFFFFF" /></View>
      <View style={styles.optionTextWrap}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionSub} numberOfLines={2}>{subtitle}</Text>
      </View>
      {!disabled ? <Ionicons name="chevron-forward" size={18} color={T.textSub} /> : null}
    </>
  );

  if (onPress && !disabled) {
    return (
      <FastPressable
        style={styles.optionCommand}
        onPress={onPress}
        activateOnPressIn
        activateOnTouchStart
        latencyLabel={latencyLabel ?? 'brokerDetail.launch.option'}
        latencyBudgetMs={50}
        unstable_pressDelay={0}
      >
        {content}
      </FastPressable>
    );
  }

  return (
    <View style={[styles.optionCommand, disabled && styles.optionRowDisabled]}>
      {content}
    </View>
  );
}

function LaunchField({ label, value, icon, trailing, strong = false, styles, T }: {
  label: string;
  value: string;
  icon: 'person-outline' | 'lock-closed-outline' | 'server-outline';
  trailing?: 'eye-outline' | 'chevron-down';
  strong?: boolean;
  styles: ReturnType<typeof makeStyles>;
  T: ThemeColors;
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={styles.inputShell}>
        <Ionicons name={icon} size={19} color={T.textMuted} />
        <Text style={[styles.inputPreview, strong && styles.serverValue]} numberOfLines={1}>{value}</Text>
        {trailing ? <Ionicons name={trailing} size={19} color={T.textSub} /> : null}
      </View>
    </View>
  );
}

function makeStyles(T: ThemeColors, isDark: boolean, safeTop: number) {
  const surface = isDark ? T.glass2 : '#FFFFFF';
  const softSurface = isDark ? 'rgba(255,255,255,0.045)' : '#F8FAFC';
  const divider = isDark ? T.borderSubtle : 'rgba(15,23,42,0.08)';
  const border = isDark ? T.border : 'rgba(15,23,42,0.08)';
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: T.bg },
    header: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 16, paddingTop: safeTop + 8, paddingBottom: 12, gap: 8, backgroundColor: T.bg },
    iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { flex: 1, color: T.text, fontSize: 20, fontWeight: '500' },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 32, backgroundColor: T.bg },
    brokerSummaryCard: { marginTop: 4, marginBottom: 10, padding: 14, borderRadius: 18, backgroundColor: surface, borderWidth: 1, borderColor: border },
    brokerSummaryTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    brokerLogoMark: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2563EB' },
    brokerLogoText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
    brokerLogoImage: { width: 36, height: 36, borderRadius: 8 },
    brokerSummaryBody: { flex: 1, minWidth: 0 },
    brokerKickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
    brokerEyebrow: { color: T.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 3 },
    brokerName: { color: T.text, fontSize: 17, fontWeight: '600' },
    brokerServerPill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', maxWidth: '100%', gap: 6, marginTop: 8, paddingHorizontal: 9, minHeight: 28, borderRadius: 14, backgroundColor: softSurface, borderWidth: 1, borderColor: divider },
    brokerServerLine: { color: T.textSub, flexShrink: 1, fontSize: 12, fontWeight: '700' },
    readyPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, minHeight: 26, borderRadius: 13, backgroundColor: isDark ? T.upGlow : T.upGlow },
    readyDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: T.trading.profit },
    readyText: { color: T.trading.profit, fontSize: 12, fontWeight: '600' },
    optionPanel: { marginBottom: 12, borderRadius: 18, backgroundColor: surface, borderWidth: 1, borderColor: border, overflow: 'hidden' },
    optionCommand: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 78, paddingHorizontal: 14, paddingVertical: 12 },
    optionDivider: { height: 1, marginLeft: 64, backgroundColor: divider },
    optionRowDisabled: { opacity: 0.55 },
    optionIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2563EB' },
    optionTextWrap: { flex: 1, minWidth: 0 },
    optionTitle: { color: T.text, fontSize: 14, fontWeight: '600', lineHeight: 18 },
    optionSub: { color: T.textSub, fontSize: 12, lineHeight: 16, marginTop: 3 },
    loginPanel: { padding: 16, borderRadius: 18, backgroundColor: surface, borderWidth: 1, borderColor: border },
    panelHeader: { gap: 8, marginBottom: 16 },
    panelTitleTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    panelTitleRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
    panelIconMark: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? 'rgba(37,99,235,0.16)' : 'rgba(37,99,235,0.10)' },
    panelEyebrow: { color: T.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
    securePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, minHeight: 28, borderRadius: 14, backgroundColor: isDark ? T.upGlow : T.upGlow },
    secureText: { color: T.trading.profit, fontSize: 12, fontWeight: '600' },
    sectionTitle: { color: T.text, fontSize: 17, fontWeight: '600', lineHeight: 22 },
    fieldBlock: { gap: 7, marginBottom: 12 },
    inputLabel: { color: T.textSub, fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
    inputShell: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, paddingHorizontal: 13, borderRadius: 14, backgroundColor: softSurface, borderWidth: 1, borderColor: divider },
    inputPreview: { flex: 1, color: T.textMuted, fontSize: 16 },
    serverValue: { color: T.text, fontSize: 15, fontWeight: '700' },
    formMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 2, marginBottom: 14 },
    checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36, flexShrink: 1 },
    checkboxText: { color: T.text, fontSize: 13, fontWeight: '700' },
    forgotText: { color: '#2563EB', fontSize: 13, fontWeight: '600' },
    loginBtn: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#2563EB', minHeight: 54, borderRadius: 16 },
    loginBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  });
}
