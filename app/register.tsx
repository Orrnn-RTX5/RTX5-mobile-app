import { AuthEntryScreen } from '../src/features/auth/AuthEntryScreen';
import { FastPressable as Pressable } from '../src/ui/components/FastPressable';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  type GestureResponderEvent,
  Linking,
  type LayoutChangeEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets, type EdgeInsets } from 'react-native-safe-area-context';
import { useThemeMode } from '../src/state/themeMode';
import { useSavedAccounts, setSavedAccountPassword } from '../src/state/savedAccounts';
import { isLoginRequestAbortedError, loginAPI } from '../src/api/auth';
import { isInvestorReadOnlySession } from '../src/api/investorSession';
import { getBrokerConfig } from '../src/api/broker';
import { useTheme, type ThemeColors } from '../src/ui/theme/useTheme';
import { useDeferredActiveFlag } from '../src/hooks/useDeferredActiveFlag';
import { useQueryClient } from '@tanstack/react-query';
import { useBrokerServers } from '../src/query/broker';
import { invalidateSessionQueryRoots } from '../src/query/authenticatedQueryScope';
import { useTranslation } from '../src/i18n/useTranslation';
import { consumePendingTradeAuthIntent } from '../src/features/trade/tradeAuthGate';
import { getConfiguredPrivacyPolicyUrl, getConfiguredTermsUrl, resolveLegalUrl } from '../src/config/legalLinks';
import {
  ORRNN_DEMO_BROKER_ID,
  ORRNN_DEMO_INITIAL_BALANCE,
  ORRNN_DEMO_ORIGIN_BROKER,
  isOrrnnDemoHealthy,
  resolveOrrnnDemoBrokerAuthRoute,
} from '../src/api/publicDemo';
import {
  useCreateOrrnnDemoAccount,
  useOrrnnDemoGroups,
  useOrrnnDemoStatus,
} from '../src/query/publicDemo';
import { notifyRegisterScreenReady } from '../src/features/settings/registerHandoffState';
import {
  safeRouterBack,
  scheduleBackNavigationAfterVisualFrame,
} from '../src/utils/navigation';
import {
  brokerDetailLaunchController,
  showBrokerDetailReturnLaunch,
} from '../src/features/settings/brokerDetailLaunchController';
import {
  hideRegisterLaunch,
  registerLaunchController,
  requestRegisterLaunchBack,
} from '../src/features/settings/registerLaunchController';
import { isValidEmail, isValidPhoneNumber } from '../src/utils/contactValidation';
import { ActionSheet } from '../src/ui/components/ActionSheet';
import { recordAccountJournalEvent } from '../src/state/terminalJournalState';
import {
  authorizeBrokerSessionCommit,
  cancelBrokerSessionCommitAuthorization,
  commitBrokerSession,
  isStaleBrokerSessionCommitError,
  type BrokerSessionCommitAuthorization,
} from '../src/services/brokerSessionCoordinator';
import { redactAuthPayload, redactSensitiveString } from '../src/api/authRedaction';
import {
  buildAccountEnvironmentKey,
  mergeAccountEnvironment,
  type AccountEnvironmentSource,
} from '../src/domain/accountType';

type RegisterFieldKey =
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phone'
  | 'password'
  | 'initialBalance';

const REGISTER_FIELD_SCROLL_OFFSET_Y = Platform.OS === 'android' ? 232 : 176;
const REGISTER_FIELD_FOCUS_DELAY_MS = Platform.OS === 'android' ? 260 : 80;
const REGISTER_KEYBOARD_BOTTOM_PADDING = Platform.OS === 'android' ? 220 : 120;
const REGISTER_QUOTES_LIGHT_BACKGROUND = '#F2F4F8';
const REGISTER_BACK_FALLBACK_HREF = '/(tabs)/settings';
const REGISTER_INITIAL_PICKER_PRESS_GUARD_MS = 150;
const REGISTER_ROUTE_DATA_DELAY_MS = 180;
const getRegisterInteractionNow = () => (
  typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now()
    : Date.now()
);
const DEMO_COUNTRY_OPTIONS = [
  { label: 'United States', code: 'US', dialCode: '+1' },
  { label: 'India', code: 'IN', dialCode: '+91' },
  { label: 'United Kingdom', code: 'GB', dialCode: '+44' },
  { label: 'United Arab Emirates', code: 'AE', dialCode: '+971' },
  { label: 'Canada', code: 'CA', dialCode: '+1' },
  { label: 'Australia', code: 'AU', dialCode: '+61' },
  { label: 'Germany', code: 'DE', dialCode: '+49' },
  { label: 'France', code: 'FR', dialCode: '+33' },
  { label: 'Italy', code: 'IT', dialCode: '+39' },
  { label: 'Spain', code: 'ES', dialCode: '+34' },
  { label: 'Netherlands', code: 'NL', dialCode: '+31' },
  { label: 'Switzerland', code: 'CH', dialCode: '+41' },
  { label: 'Singapore', code: 'SG', dialCode: '+65' },
  { label: 'Malaysia', code: 'MY', dialCode: '+60' },
  { label: 'Indonesia', code: 'ID', dialCode: '+62' },
  { label: 'Thailand', code: 'TH', dialCode: '+66' },
  { label: 'Vietnam', code: 'VN', dialCode: '+84' },
  { label: 'Philippines', code: 'PH', dialCode: '+63' },
  { label: 'Japan', code: 'JP', dialCode: '+81' },
  { label: 'South Korea', code: 'KR', dialCode: '+82' },
  { label: 'China', code: 'CN', dialCode: '+86' },
  { label: 'Hong Kong', code: 'HK', dialCode: '+852' },
  { label: 'South Africa', code: 'ZA', dialCode: '+27' },
  { label: 'Nigeria', code: 'NG', dialCode: '+234' },
  { label: 'Brazil', code: 'BR', dialCode: '+55' },
  { label: 'Mexico', code: 'MX', dialCode: '+52' },
  { label: 'Turkey', code: 'TR', dialCode: '+90' },
  { label: 'Saudi Arabia', code: 'SA', dialCode: '+966' },
] as const;
const DEFAULT_DEMO_COUNTRY = DEMO_COUNTRY_OPTIONS[0];
type DemoCountryCode = (typeof DEMO_COUNTRY_OPTIONS)[number]['code'];

type RegisterPickerHostKey =
  | 'phoneCountry'
  | 'group';

const formatDemoPhoneForSubmission = (dialCode: string, phoneNumber: string) => {
  const trimmedPhone = phoneNumber.trim();
  if (!trimmedPhone) {
    return undefined;
  }

  return trimmedPhone.startsWith('+') ? trimmedPhone : `${dialCode}${trimmedPhone}`;
};

/**
 * Screen for opening a new Demo or Real account. Contains forms for user details, server selection, and account preferences.
 */
function LegacyRegisterScreen() {
  const upsertSavedAccount = useSavedAccounts((s) => s.upsertAccount);
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const isScreenFocused = useIsFocused();
  const { origin, registerLaunchRevision } = useLocalSearchParams<{
    origin?: string;
    registerLaunchRevision?: string;
  }>();
  const returnsToBrokerDetail = origin === 'broker-detail';
  const parsedRegisterLaunchRevision = Number(registerLaunchRevision);
  const [firstPaintReady, setFirstPaintReady] = useState(false);
  React.useEffect(() => {
    let cancelled = false;
    let frameId: number | null = null;
    const markReady = () => {
      if (!cancelled) {
        setFirstPaintReady(true);
      }
    };

    if (typeof globalThis.requestAnimationFrame === 'function') {
      frameId = globalThis.requestAnimationFrame(markReady);
    } else {
      const timerId = setTimeout(markReady, 16);
      return () => {
        cancelled = true;
        clearTimeout(timerId);
      };
    }

    return () => {
      cancelled = true;
      if (frameId !== null) {
        globalThis.cancelAnimationFrame?.(frameId);
      }
    };
  }, []);
  const registerDataActive = useDeferredActiveFlag(
    isScreenFocused && firstPaintReady,
    REGISTER_ROUTE_DATA_DELAY_MS,
  );
  const {
    data: demoStatus,
    isLoading: isDemoStatusLoading,
    error: demoStatusError,
  } = useOrrnnDemoStatus(registerDataActive);
  const isDemoServiceReady = isOrrnnDemoHealthy(demoStatus);
  const {
    data: demoGroups,
    isLoading: isDemoGroupsLoading,
    error: demoGroupsError,
  } = useOrrnnDemoGroups(registerDataActive && isDemoServiceReady);
  const {
    data: brokerServers = [],
    refetch: refetchBrokerServers,
  } = useBrokerServers(registerDataActive);
  const createDemoAccount = useCreateOrrnnDemoAccount();
  const [selectedGroupName, setSelectedGroupName] = useState('');
  const demoGroupOptions = demoGroups?.groups ?? [];
  const selectedDemoGroup =
    demoGroupOptions.find((group) => group.name === selectedGroupName) ??
    demoGroupOptions[0];
  // Cold-start network checks should never hide the form. They only control
  // whether the final submit is enabled once the live demo contract is ready.
  const isPreparingDemoAccount =
    !registerDataActive ||
    isDemoStatusLoading || (isDemoServiceReady && isDemoGroupsLoading);
  const registerButtonLabel = t('Register a demo account');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneCountryCode, setPhoneCountryCode] = useState<DemoCountryCode>(DEFAULT_DEMO_COUNTRY.code);
  const [phoneCountryPickerOpen, setPhoneCountryPickerOpen] = useState(false);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [initialBalance, setInitialBalance] = useState(String(ORRNN_DEMO_INITIAL_BALANCE));
  const [mountedPickerHosts, setMountedPickerHosts] = useState<Record<RegisterPickerHostKey, boolean>>({
    phoneCountry: false,
    group: false,
  });
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const registerSubmitInFlightRef = React.useRef(false);
  const registerMountedRef = React.useRef(true);
  const activeRegisterAttemptRef = React.useRef<{
    authorization: BrokerSessionCommitAuthorization;
    controller: AbortController;
  } | null>(null);
  const scrollViewRef = React.useRef<React.ElementRef<typeof ScrollView> | null>(null);
  const fieldYPositionsRef = React.useRef<Partial<Record<RegisterFieldKey, number>>>({});
  const fieldFocusTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const registerBackNavigationStartedRef = React.useRef(false);
  const registerReadyNotifiedRef = React.useRef(false);
  const registerPickerPressBlockedUntilRef = React.useRef(
    getRegisterInteractionNow() + REGISTER_INITIAL_PICKER_PRESS_GUARD_MS,
  );
  const registerPickerFocusSeenRef = React.useRef(false);
  if (registerPickerFocusSeenRef.current !== isScreenFocused) {
    registerPickerFocusSeenRef.current = isScreenFocused;
    if (isScreenFocused) {
      registerPickerPressBlockedUntilRef.current =
        getRegisterInteractionNow() + REGISTER_INITIAL_PICKER_PRESS_GUARD_MS;
    }
  }
  const isRegisterInitialPickerPressBlocked = React.useCallback(() => (
    getRegisterInteractionNow() < registerPickerPressBlockedUntilRef.current
  ), []);

  const themeMode = useThemeMode();
  const T = useTheme();
  const isDark = themeMode === 'dark';
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const styles = React.useMemo(() => makeStyles(T, isDark, insets, width, fontScale), [T, isDark, insets, width, fontScale]);
  const privacyPolicyUrl = resolveLegalUrl(
    getConfiguredPrivacyPolicyUrl(),
    'https://rtx5.orrnn.com/privacy-policy',
  );
  const termsConditionsUrl = resolveLegalUrl(
    getConfiguredTermsUrl(),
    'https://rtx5.orrnn.com/terms-conditions',
  );
  const demoStatusUnavailableMessage =
    demoStatusError?.message || t('Demo account service is temporarily unavailable.');
  const demoGroupsUnavailableMessage =
    demoGroupsError?.message || t('No demo group is available for account creation.');
  const isRegisterButtonDisabled = isLoading || !termsAccepted;

  React.useEffect(() => {
    registerMountedRef.current = true;
    return () => {
      registerMountedRef.current = false;
      const activeAttempt = activeRegisterAttemptRef.current;
      activeAttempt?.controller.abort();
      cancelBrokerSessionCommitAuthorization(activeAttempt?.authorization);
      activeRegisterAttemptRef.current = null;
      if (fieldFocusTimerRef.current) {
        clearTimeout(fieldFocusTimerRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    if (isScreenFocused) {
      registerBackNavigationStartedRef.current = false;
    }
  }, [isScreenFocused]);

  const cancelActiveRegisterAttempt = React.useCallback(() => {
    const activeAttempt = activeRegisterAttemptRef.current;
    activeAttempt?.controller.abort();
    cancelBrokerSessionCommitAuthorization(activeAttempt?.authorization);
    activeRegisterAttemptRef.current = null;
    registerSubmitInFlightRef.current = false;
  }, []);

  const handleRegisterRootLayout = React.useCallback(() => {
    if (registerReadyNotifiedRef.current) {
      return;
    }

    registerReadyNotifiedRef.current = true;
    const notifyAfterPaint = () => {
      notifyRegisterScreenReady(
        Number.isInteger(parsedRegisterLaunchRevision)
          ? parsedRegisterLaunchRevision
          : undefined,
      );
    };

    if (typeof globalThis.requestAnimationFrame === 'function') {
      globalThis.requestAnimationFrame(notifyAfterPaint);
      return;
    }

    setTimeout(notifyAfterPaint, 16);
  }, [parsedRegisterLaunchRevision]);

  const handleRegisterBack = React.useCallback((event: GestureResponderEvent) => {
    event.preventDefault();
    event.stopPropagation();
    cancelActiveRegisterAttempt();

    if (registerBackNavigationStartedRef.current) {
      return;
    }

    if (fieldFocusTimerRef.current) {
      clearTimeout(fieldFocusTimerRef.current);
      fieldFocusTimerRef.current = null;
    }

    if (Number.isInteger(parsedRegisterLaunchRevision)) {
      const launchSnapshot = registerLaunchController.getSnapshot();
      const backResult = requestRegisterLaunchBack(parsedRegisterLaunchRevision);
      if (
        (backResult === 'pop' || backResult === 'wait' || backResult === 'handled')
        && launchSnapshot.selection
      ) {
        registerBackNavigationStartedRef.current = true;
        showBrokerDetailReturnLaunch(launchSnapshot.selection);
        hideRegisterLaunch(parsedRegisterLaunchRevision);
        scheduleBackNavigationAfterVisualFrame(() => {
          safeRouterBack(router, {
            pathname: '/settings/broker-detail',
            params: launchSnapshot.selection ?? undefined,
          });
        });
        return;
      }
      if (backResult !== 'stale') {
        return;
      }
    }

    registerBackNavigationStartedRef.current = true;
    if (returnsToBrokerDetail) {
      const selection = brokerDetailLaunchController.getSnapshot().selection;
      showBrokerDetailReturnLaunch(selection);
      scheduleBackNavigationAfterVisualFrame(() => {
        safeRouterBack(router, {
          pathname: '/settings/broker-detail',
          params: selection,
        });
      });
      return;
    }
    scheduleBackNavigationAfterVisualFrame(() => {
      safeRouterBack(router, REGISTER_BACK_FALLBACK_HREF);
    });
  }, [cancelActiveRegisterAttempt, parsedRegisterLaunchRevision, returnsToBrokerDetail]);

  const handleFieldLayout = React.useCallback((field: RegisterFieldKey) => (event: LayoutChangeEvent) => {
    fieldYPositionsRef.current[field] = event.nativeEvent.layout.y;
  }, []);

  const scrollFieldAboveKeyboard = React.useCallback((field: RegisterFieldKey) => {
    const fieldY = fieldYPositionsRef.current[field];
    if (typeof fieldY !== 'number') {
      return;
    }

    scrollViewRef.current?.scrollTo({
      y: Math.max(0, fieldY - REGISTER_FIELD_SCROLL_OFFSET_Y),
      animated: true,
    });
  }, []);

  const handleFieldFocus = React.useCallback((field: RegisterFieldKey) => {
    if (fieldFocusTimerRef.current) {
      clearTimeout(fieldFocusTimerRef.current);
    }
    fieldFocusTimerRef.current = setTimeout(() => {
      scrollFieldAboveKeyboard(field);
    }, REGISTER_FIELD_FOCUS_DELAY_MS);
  }, [scrollFieldAboveKeyboard]);

  const handleOpenPrivacyPolicy = React.useCallback(() => {
    void Linking.openURL(privacyPolicyUrl).catch(() => {
      Alert.alert(t('Privacy Policy'), privacyPolicyUrl);
    });
  }, [privacyPolicyUrl, t]);

  const handleOpenTermsAndConditions = React.useCallback(() => {
    void Linking.openURL(termsConditionsUrl).catch(() => {
      Alert.alert(t('Terms and Conditions'), termsConditionsUrl);
    });
  }, [termsConditionsUrl, t]);

  const handleRegister = async () => {
    if (registerSubmitInFlightRef.current) {
      return;
    }

    if (isPreparingDemoAccount) {
      recordAccountJournalEvent('demo account registration blocked: setup still loading', { level: 'error' });
      Alert.alert(
        t('Demo account unavailable'),
        t('Demo account details are still loading. Please try again in a moment.'),
      );
      return;
    }

    if (!isDemoServiceReady) {
      recordAccountJournalEvent(`demo account registration blocked: ${demoStatusUnavailableMessage}`, { level: 'error' });
      Alert.alert(
        t('Demo account unavailable'),
        demoStatusUnavailableMessage,
      );
      return;
    }

    if (!selectedDemoGroup?.name) {
      recordAccountJournalEvent(`demo account registration blocked: ${demoGroupsUnavailableMessage}`, { level: 'error' });
      Alert.alert(
        t('Demo account unavailable'),
        demoGroupsUnavailableMessage,
      );
      return;
    }

    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();
    const selectedPhoneCountry =
      DEMO_COUNTRY_OPTIONS.find((option) => option.code === phoneCountryCode) ?? DEFAULT_DEMO_COUNTRY;
    const trimmedOriginBroker = ORRNN_DEMO_ORIGIN_BROKER.trim();
    const parsedInitialBalance = Number(initialBalance);
    const submissionPhone = formatDemoPhoneForSubmission(selectedPhoneCountry.dialCode, trimmedPhone);

    if (!trimmedFirstName || !trimmedEmail || !password) {
      recordAccountJournalEvent('demo account registration blocked: required fields missing', { level: 'error' });
      Alert.alert(t('Error'), t('Please fill in all required fields'));
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      recordAccountJournalEvent('demo account registration blocked: invalid email format', { level: 'error' });
      Alert.alert(t('Error'), t('Please enter a valid email address (e.g. you@example.com)'));
      return;
    }

    if (trimmedPhone && !isValidPhoneNumber(submissionPhone ?? trimmedPhone)) {
      recordAccountJournalEvent('demo account registration blocked: invalid phone number', { level: 'error' });
      Alert.alert(t('Error'), t('Please enter a valid phone number (digits only, 7-15 digits)'));
      return;
    }

    if (!termsAccepted) {
      recordAccountJournalEvent('demo account registration blocked: terms not accepted', { level: 'error' });
      Alert.alert(t('Error'), t('Please accept the terms and conditions'));
      return;
    }

    if (!Number.isFinite(parsedInitialBalance) || parsedInitialBalance <= 0) {
      recordAccountJournalEvent('demo account registration blocked: invalid initial balance', { level: 'error' });
      Alert.alert(t('Error'), t('Please enter a valid initial balance'));
      return;
    }

    if (!ORRNN_DEMO_BROKER_ID || !trimmedOriginBroker) {
      recordAccountJournalEvent('demo account registration blocked: demo broker contract missing', { level: 'error' });
      Alert.alert(t('Error'), t('Demo account service is temporarily unavailable.'));
      return;
    }

    registerSubmitInFlightRef.current = true;
    setIsLoading(true);
    recordAccountJournalEvent('demo account registration requested');
    const commitAuthorization = authorizeBrokerSessionCommit();
    const loginAbortController = new AbortController();
    activeRegisterAttemptRef.current = {
      authorization: commitAuthorization,
      controller: loginAbortController,
    };
    const isRegisterAttemptCancelled = () => (
      loginAbortController.signal.aborted || !registerMountedRef.current
    );
    try {
      let demoAuthRoute = resolveOrrnnDemoBrokerAuthRoute(ORRNN_DEMO_BROKER_ID, brokerServers);
      if (demoAuthRoute.source !== 'broker-directory') {
        const refreshedBrokerServers = await refetchBrokerServers()
          .then((result) => result.data ?? [])
          .catch(() => []);
        if (isRegisterAttemptCancelled()) return;
        demoAuthRoute = resolveOrrnnDemoBrokerAuthRoute(
          ORRNN_DEMO_BROKER_ID,
          refreshedBrokerServers,
        );
      }
      if (!demoAuthRoute.serverUrl || !demoAuthRoute.endpoints) {
        throw new Error(t('The Orrnn demo broker login server is unavailable.'));
      }
      if (demoAuthRoute.endpoints.brokerId !== ORRNN_DEMO_BROKER_ID) {
        throw new Error(t('The demo broker directory response did not match the configured Orrnn broker.'));
      }

      let brokerConfig: any = null;
      try {
        brokerConfig = await getBrokerConfig(ORRNN_DEMO_BROKER_ID);
      } catch (e) {
        // Ignore errors, fall back to the demo broker contract.
      }
      if (isRegisterAttemptCancelled()) return;

      // INTEGRATED: Public demo registration uses
      // POST /api/v1/public/demo-account. This endpoint is intentionally
      // unauthenticated; the backend enforces broker_id=orrnn-demo while the
      // app sends the exact API-selected group and public creation DTO.
      const response = await createDemoAccount.mutateAsync({
        group: selectedDemoGroup.name,
        email: trimmedEmail,
        master_pass: password,
        first_name: trimmedFirstName,
        last_name: trimmedLastName || undefined,
        phone: submissionPhone,
        initial_balance: parsedInitialBalance,
        origin_broker: trimmedOriginBroker,
      });
      if (isRegisterAttemptCancelled()) return;
      const createdAccountGroup = response.group;
      const createdAccountLogin = String(response.login).trim();
      if (!createdAccountLogin) {
        throw new Error(t('Demo account was created, but the account login was not returned.'));
      }

      const canonicalBrokerId = response.broker_id;
      if (canonicalBrokerId !== ORRNN_DEMO_BROKER_ID) {
        throw new Error(t('Demo account response did not match the configured Orrnn broker.'));
      }

      const accountName = `${trimmedFirstName} ${trimmedLastName}`.trim();
      const authResponse: any = await loginAPI({
        login: response.login,
        password,
        broker_id: canonicalBrokerId,
      }, {
        serverUrl: demoAuthRoute.serverUrl,
        signal: loginAbortController.signal,
      });
      if (isRegisterAttemptCancelled()) return;
      const sessionToken = authResponse.access_token ?? authResponse.token ?? '';
      const sessionRefreshToken = authResponse.refresh_token ?? authResponse.refreshToken ?? '';
      const authenticatedAccountLogin = String(
        authResponse.account_login ??
        authResponse.accountLogin ??
        authResponse.user?.account_login ??
        createdAccountLogin,
      ).trim();
      if (authenticatedAccountLogin !== createdAccountLogin) {
        throw new Error(t('Demo account login did not match the newly created account.'));
      }
      const sessionLogin = authenticatedAccountLogin;
      let sessionExpiresAt = new Date(Date.now() + 86400 * 1000).toISOString();
      if (typeof authResponse.expires_at === 'number' && authResponse.expires_at > 0) {
        const ms = authResponse.expires_at > 1e12 ? authResponse.expires_at : authResponse.expires_at * 1000;
        sessionExpiresAt = new Date(ms).toISOString();
      } else {
        const expiresInSec = typeof authResponse.expires_in === 'number' ? authResponse.expires_in : 86400;
        sessionExpiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();
      }

      if (!sessionToken) {
        throw new Error(t('Demo account was created, but the login token was not returned.'));
      }
      const demoRegistrationSource: AccountEnvironmentSource = 'demo-registration';
      const initialAccountEnvironment = mergeAccountEnvironment(null, {
        accountKey: buildAccountEnvironmentKey(canonicalBrokerId, String(sessionLogin)),
        resolved: 'demo',
        source: demoRegistrationSource,
        allowInitialFallback: true,
      })!;
      const committedSession = await commitBrokerSession({
        session: {
          brokerId: demoAuthRoute.endpoints.brokerId,
          accountLogin: String(sessionLogin),
          apiBase: demoAuthRoute.endpoints.apiBase,
          feedWsBase: demoAuthRoute.endpoints.feedWsBase,
          tradeWsBase: demoAuthRoute.endpoints.tradeWsBase,
          feedStatusUrl: demoAuthRoute.endpoints.feedStatusUrl,
          servicesDomain: demoAuthRoute.endpoints.servicesDomain,
          configVersion: demoAuthRoute.endpoints.configVersion,
          investor: isInvestorReadOnlySession(authResponse),
        },
        credentials: {
          accessToken: sessionToken,
          refreshToken: sessionRefreshToken,
          expiresAt: sessionExpiresAt,
        },
        account: {
          name: accountName,
          serverName: brokerConfig?.server_name || canonicalBrokerId,
          logoUrl: demoAuthRoute.logoUrl,
          accountType: initialAccountEnvironment.accountType,
          accountEnvironmentSource: initialAccountEnvironment.accountEnvironmentSource,
        },
      }, commitAuthorization);
      recordAccountJournalEvent(`demo account created and signed in on ${canonicalBrokerId}`, {
        level: 'success',
        accountLogin: sessionLogin,
      });
      // Persist the new demo account in the directory + secure-store the
      // master password so the user can switch back to it from the Accounts
      // screen without re-typing credentials.
      const savedLogin = String(sessionLogin);
      upsertSavedAccount({
        login: savedLogin,
        name: accountName,
        brokerId: canonicalBrokerId,
        server: brokerConfig?.server_name || canonicalBrokerId,
        serverUrl: demoAuthRoute.serverUrl,
        logoUrl: demoAuthRoute.logoUrl,
        accountType: initialAccountEnvironment.accountType,
        accountEnvironmentSource: initialAccountEnvironment.accountEnvironmentSource,
        rawGroup: createdAccountGroup,
        lastUsedAt: Date.now(),
        hasCredentials: true,
      });
      setSavedAccountPassword(canonicalBrokerId, savedLogin, password).catch((err) => {
        console.error('[Register] Failed to persist saved-account credential', redactAuthPayload(err));
      });

      // Invalidate cached queries
      void invalidateSessionQueryRoots(
        queryClient,
        committedSession.session.cacheNamespace,
        ['accountDetail', 'brokerConfig'],
      );

      const pendingTradeIntent = consumePendingTradeAuthIntent();
      if (
        pendingTradeIntent?.symbol &&
        (
          pendingTradeIntent.kind === 'order-ticket' ||
          pendingTradeIntent.kind === 'market-order' ||
          pendingTradeIntent.kind === 'pending-order'
        )
      ) {
        router.replace({
          pathname: '/trade/order-ticket',
          params: {
            symbol: pendingTradeIntent.symbol,
            ...(pendingTradeIntent.side ? { side: pendingTradeIntent.side } : {}),
            ...(pendingTradeIntent.origin ? { origin: pendingTradeIntent.origin } : {}),
          },
        });
      } else if (pendingTradeIntent) {
        router.replace('/(tabs)/trade');
      } else {
        safeRouterBack(router, '/');
      }
    } catch (error: any) {
      if (
        !registerMountedRef.current ||
        isLoginRequestAbortedError(error) ||
        isStaleBrokerSessionCommitError(error)
      ) {
        return;
      }
      const safeErrorMessage = redactSensitiveString(
        typeof error?.message === 'string' && error.message.trim()
          ? error.message
          : t('Unable to register account.'),
      );
      recordAccountJournalEvent(`demo account registration failed: ${safeErrorMessage}`, {
        level: 'error',
      });
      Alert.alert(t('Registration Failed'), safeErrorMessage);
    } finally {
      cancelBrokerSessionCommitAuthorization(commitAuthorization);
      if (activeRegisterAttemptRef.current?.authorization === commitAuthorization) {
        activeRegisterAttemptRef.current = null;
      }
      registerSubmitInFlightRef.current = false;
      if (registerMountedRef.current) {
        setIsLoading(false);
      }
    }
  };

  const passwordStrengthScore = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
  const visiblePasswordStrengthScore = password ? passwordStrengthScore : 0;
  const passwordStrengthLabel = !password
    ? ''
    : passwordStrengthScore >= 3
    ? t('Strong')
    : passwordStrengthScore >= 2
      ? t('Medium')
      : t('Weak');
  const passwordStrengthColor = !password
    ? '#64748B'
    : passwordStrengthScore >= 3
      ? '#22C55E'
      : passwordStrengthScore >= 2
        ? '#F59E0B'
        : '#EF4444';
  const selectedCurrency = selectedDemoGroup?.currency || 'USD';
  const selectedLeverage = selectedDemoGroup?.leverage;
  const selectedPhoneCountry =
    DEMO_COUNTRY_OPTIONS.find((option) => option.code === phoneCountryCode) ?? DEFAULT_DEMO_COUNTRY;
  const mountPickerHost = React.useCallback((key: RegisterPickerHostKey) => {
    setMountedPickerHosts((current) => (
      current[key] ? current : { ...current, [key]: true }
    ));
  }, []);
  const phoneCountryPickerMounted = mountedPickerHosts.phoneCountry || phoneCountryPickerOpen;
  const phoneCountryPickerActions = React.useMemo(
    () => phoneCountryPickerMounted ? DEMO_COUNTRY_OPTIONS.map((option) => ({
      label: `${option.dialCode} ${t(option.label)}`,
      subtitle: option.code,
      onPress: () => setPhoneCountryCode(option.code),
    })) : [],
    [phoneCountryPickerMounted, t],
  );
  const handleOpenPhoneCountryPicker = React.useCallback(() => {
    if (isRegisterInitialPickerPressBlocked()) {
      return;
    }

    Keyboard.dismiss();
    handleFieldFocus('phone');
    mountPickerHost('phoneCountry');
    setPhoneCountryPickerOpen(true);
  }, [handleFieldFocus, isRegisterInitialPickerPressBlocked, mountPickerHost]);
  const groupPickerMounted = mountedPickerHosts.group || groupPickerOpen;
  const groupPickerActions = React.useMemo(
    () => groupPickerMounted ? demoGroupOptions.map((group) => ({
      label: group.name,
      subtitle: `${group.currency} / 1:${group.leverage}`,
      onPress: () => setSelectedGroupName(group.name),
    })) : [],
    [demoGroupOptions, groupPickerMounted],
  );
  const handleOpenGroupPicker = React.useCallback(() => {
    if (isRegisterInitialPickerPressBlocked()) {
      return;
    }

    if (demoGroupOptions.length === 0) {
      return;
    }

    Keyboard.dismiss();
    mountPickerHost('group');
    setGroupPickerOpen(true);
  }, [demoGroupOptions.length, isRegisterInitialPickerPressBlocked, mountPickerHost]);
  const fieldIconColor = isDark ? T.textSub : T.textMuted;
  const fieldAccentColor = isDark ? T.accent : T.trading.buy.primary;
  const fieldPlaceholderColor = T.textMuted;
  const heroBackIconColor = T.text;
  const autofillBackgroundColor = isDark ? T.bg : REGISTER_QUOTES_LIGHT_BACKGROUND;

  // This component is also a direct root route, so it may remain mounted below
  // a newer screen. Keep hook state intact while dropping the full form tree.
  if (!isScreenFocused) {
    return null;
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      {Platform.OS === 'web' && (
        // @ts-ignore - Web only CSS injection
        <style>{`
          input:-webkit-autofill,
          input:-webkit-autofill:hover, 
          input:-webkit-autofill:focus, 
          input:-webkit-autofill:active {
              -webkit-box-shadow: 0 0 0 1000px ${autofillBackgroundColor} inset !important;
              -webkit-text-fill-color: ${T.text} !important;
              transition: background-color 5000s ease-in-out 0s;
          }
        `}</style>
      )}
      <View style={styles.bg} onLayout={handleRegisterRootLayout}>
        <View style={styles.headerRow}>
          <Pressable
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={handleRegisterBack}
            activateOnPressIn
            activateOnTouchStart
            latencyLabel="register.back"
            latencyBudgetMs={50}
            unstable_pressDelay={0}
            style={styles.headerBackButton}
          >
            <Ionicons name="arrow-back" size={22} color={heroBackIconColor} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>Demo Account</Text>
          <View style={styles.headerRightSpacer} />
        </View>

        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            ref={scrollViewRef}
            canCancelContentTouches={Platform.OS === 'ios'}
            contentContainerStyle={styles.scrollContent}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps="always"
          >

            <View style={styles.formContainer}>
              <View style={styles.inputRow} onLayout={handleFieldLayout('firstName')}>
                <Text style={styles.inputLabel}>{t('First name')}</Text>
                <View style={styles.inputShell}>
                  <Ionicons name="person-outline" size={21} color={fieldIconColor} style={styles.inputRowIcon} />
                  <TextInput
                    style={[styles.input, { outlineStyle: 'none', outlineWidth: 0 }] as any}
                    value={firstName}
                    placeholder={t('Enter first name')}
                    placeholderTextColor={fieldPlaceholderColor}
                    onChangeText={setFirstName}
                    onFocus={() => handleFieldFocus('firstName')}
                    autoCapitalize="words"
                    selectionColor={fieldAccentColor}
                    cursorColor={fieldAccentColor}
                    underlineColorAndroid="transparent"
                    importantForAutofill={"no" as any}
                    autoComplete="name"
                    textContentType="name"
                    spellCheck={false}
                    autoCorrect={false}
                    disableFullscreenUI={true}
                  />
                </View>
              </View>

              <View style={styles.inputRow} onLayout={handleFieldLayout('lastName')}>
                <Text style={styles.inputLabel}>
                  {t('Last name')} <Text style={styles.inputOptionalLabel}>({t('optional')})</Text>
                </Text>
                <View style={styles.inputShell}>
                  <Ionicons name="id-card-outline" size={21} color={fieldIconColor} style={styles.inputRowIcon} />
                  <TextInput
                    style={[styles.input, { outlineStyle: 'none', outlineWidth: 0 }] as any}
                    value={lastName}
                    placeholder={t('Enter last name')}
                    placeholderTextColor={fieldPlaceholderColor}
                    onChangeText={setLastName}
                    onFocus={() => handleFieldFocus('lastName')}
                    autoCapitalize="words"
                    selectionColor={fieldAccentColor}
                    cursorColor={fieldAccentColor}
                    underlineColorAndroid="transparent"
                    importantForAutofill={"no" as any}
                    autoComplete="name-family"
                    textContentType="familyName"
                    spellCheck={false}
                    autoCorrect={false}
                    disableFullscreenUI={true}
                  />
                </View>
              </View>

              <View style={styles.inputRow} onLayout={handleFieldLayout('email')}>
                <Text style={styles.inputLabel}>{t('Email')}</Text>
                <View style={styles.inputShell}>
                  <Ionicons name="mail-outline" size={21} color={fieldIconColor} style={styles.inputRowIcon} />
                  <TextInput
                    style={[styles.input, { outlineStyle: 'none', outlineWidth: 0 }] as any}
                    value={email}
                    placeholder={t('Enter email address')}
                    placeholderTextColor={fieldPlaceholderColor}
                    onChangeText={setEmail}
                    onFocus={() => handleFieldFocus('email')}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    selectionColor={fieldAccentColor}
                    cursorColor={fieldAccentColor}
                    underlineColorAndroid="transparent"
                    importantForAutofill={"no" as any}
                    autoComplete="email"
                    textContentType="emailAddress"
                    spellCheck={false}
                    autoCorrect={false}
                    disableFullscreenUI={true}
                  />
                </View>
              </View>

              <View style={styles.inputRow} onLayout={handleFieldLayout('phone')}>
                <Text style={styles.inputLabel}>{t('Phone')}</Text>
                <View style={styles.inputShell}>
                  <Ionicons name="call-outline" size={21} color={fieldIconColor} style={styles.inputRowIcon} />
                  <Pressable
                    style={({ pressed }) => [
                      styles.phoneCodeButton,
                      pressed && styles.inputShellPressed,
                    ]}
                    onPress={handleOpenPhoneCountryPicker}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    latencyLabel="register.phoneCountry.open"
                    accessibilityRole="button"
                    accessibilityLabel={t('Phone country code')}
                    accessibilityState={{ expanded: phoneCountryPickerOpen }}
                  >
                    <Text style={styles.phoneCodeText} numberOfLines={1}>
                      {selectedPhoneCountry.dialCode}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color={fieldIconColor} />
                  </Pressable>
                  <View style={styles.phoneCodeDivider} />
                  <TextInput
                    style={[styles.input, { outlineStyle: 'none', outlineWidth: 0 }] as any}
                    value={phone}
                    onChangeText={setPhone}
                    onFocus={() => handleFieldFocus('phone')}
                    keyboardType="phone-pad"
                    selectionColor={fieldAccentColor}
                    cursorColor={fieldAccentColor}
                    underlineColorAndroid="transparent"
                    importantForAutofill={"no" as any}
                    autoComplete="tel"
                    textContentType="telephoneNumber"
                    spellCheck={false}
                    autoCorrect={false}
                    disableFullscreenUI={true}
                  />
                </View>
              </View>

              <View style={styles.inputRow} onLayout={handleFieldLayout('password')}>
                <Text style={styles.inputLabel}>{t('Master password')}</Text>
                <View style={styles.inputShell}>
                  <Ionicons name="lock-closed-outline" size={21} color={fieldIconColor} style={styles.inputRowIcon} />
                  <TextInput
                    style={[styles.input, { outlineStyle: 'none', outlineWidth: 0 }] as any}
                    value={password}
                    onChangeText={setPassword}
                    onFocus={() => handleFieldFocus('password')}
                    autoCapitalize="none"
                    secureTextEntry={!showPassword}
                    selectionColor={fieldAccentColor}
                    cursorColor={fieldAccentColor}
                    underlineColorAndroid="transparent"
                    importantForAutofill={"no" as any}
                    autoComplete="off"
                    textContentType="none"
                    spellCheck={false}
                    autoCorrect={false}
                    disableFullscreenUI={true}
                  />
                  <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={15} style={styles.eyeIconBtn}>
                    <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={21} color={fieldIconColor} />
                  </Pressable>
                </View>
                <View style={styles.passwordStrengthRow}>
                  {[0, 1, 2, 3].map((level) => (
                    <View
                      key={level}
                      style={[
                        styles.passwordStrengthBar,
                        level < visiblePasswordStrengthScore && { backgroundColor: passwordStrengthColor },
                      ]}
                    />
                  ))}
                </View>
                <Text style={styles.passwordStrengthText}>
                  {t('Password strength:')} <Text style={{ color: passwordStrengthColor }}>{passwordStrengthLabel}</Text>
                </Text>
              </View>

              <View style={styles.twoColumnRow}>
                <View style={styles.twoColumnCell}>
                  <Text style={styles.inputLabel}>{t('Currency')}</Text>
                  <View style={styles.inputShell}>
                    <Ionicons name="cash-outline" size={21} color={fieldIconColor} style={styles.inputRowIcon} />
                    <Text style={styles.selectValue} numberOfLines={1}>{selectedCurrency}</Text>
                  </View>
                </View>

                <View style={styles.twoColumnCell}>
                  <Text style={styles.inputLabel}>{t('Leverage')}</Text>
                  <View style={styles.inputShell}>
                    <Ionicons name="speedometer-outline" size={21} color={fieldIconColor} style={styles.inputRowIcon} />
                    <Text style={styles.selectValue} numberOfLines={1}>
                      {selectedLeverage ? `1:${selectedLeverage}` : '--'}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.inputRow} onLayout={handleFieldLayout('initialBalance')}>
                <Text style={styles.inputLabel}>{t('Initial balance')}</Text>
                <View style={styles.inputShell}>
                  <Ionicons name="wallet-outline" size={21} color={fieldIconColor} style={styles.inputRowIcon} />
                  <TextInput
                    style={[styles.input, { outlineStyle: 'none', outlineWidth: 0 }] as any}
                    value={initialBalance}
                    onChangeText={setInitialBalance}
                    onFocus={() => handleFieldFocus('initialBalance')}
                    keyboardType="numeric"
                    selectionColor={fieldAccentColor}
                    cursorColor={fieldAccentColor}
                    underlineColorAndroid="transparent"
                    importantForAutofill={"no" as any}
                    autoComplete="off"
                    textContentType="none"
                    spellCheck={false}
                    autoCorrect={false}
                    disableFullscreenUI={true}
                  />
                </View>
              </View>

              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>{t('Origin broker')}</Text>
                <View style={styles.inputShell}>
                  <Ionicons name="business-outline" size={21} color={fieldIconColor} style={styles.inputRowIcon} />
                  <Text style={styles.selectValue} numberOfLines={1}>
                    {ORRNN_DEMO_ORIGIN_BROKER || t('Not configured')}
                  </Text>
                </View>
              </View>

              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>{t('Group')}</Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.inputShell,
                    pressed && styles.inputShellPressed,
                  ]}
                  onPress={handleOpenGroupPicker}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  latencyLabel="register.group.open"
                  accessibilityRole="button"
                  accessibilityLabel={t('Group')}
                  accessibilityState={{
                    expanded: groupPickerOpen,
                    disabled: demoGroupOptions.length === 0,
                  }}
                  disabled={demoGroupOptions.length === 0}
                >
                  <Ionicons name="shield-checkmark-outline" size={21} color={fieldAccentColor} style={styles.inputRowIcon} />
                  <Text style={styles.selectValue} numberOfLines={1}>
                    {selectedDemoGroup?.name ?? t('Demo groups unavailable')}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color={fieldIconColor} />
                </Pressable>
              </View>

              <View style={styles.termsRow}>
                <Pressable
                  onPress={() => setTermsAccepted((value) => !value)}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
                    {termsAccepted && <Ionicons name="checkmark" size={17} color="#ffffff" />}
                  </View>
                </Pressable>
                <Text style={styles.termsText}>
                  {t('I agree to the')}{' '}
                  <Text
                    style={styles.linkText}
                    onPress={handleOpenTermsAndConditions}
                  >
                    {t('Terms and Conditions')}
                  </Text>
                  {' '}{t('and')}{' '}
                  <Text
                    style={styles.linkText}
                    onPress={handleOpenPrivacyPolicy}
                  >
                    {t('Privacy Policy')}
                  </Text>
                  .
                </Text>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.registerBtn,
                  isRegisterButtonDisabled && styles.registerBtnDisabled,
                  (pressed && !isRegisterButtonDisabled) && styles.registerBtnPressed
                ]}
                onPress={handleRegister}
                disabled={isRegisterButtonDisabled}
                journalActionLabel="pressed Register demo account button"
                journalActionSource="Actions"
              >
                <LinearGradient
                  colors={['#1597FF', '#006DFF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.registerGradient}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.registerBtnText}>{registerButtonLabel}</Text>
                  )}
                </LinearGradient>
              </Pressable>
              </View>

          </ScrollView>
        </KeyboardAvoidingView>

        {phoneCountryPickerMounted ? (
          <ActionSheet
            visible={phoneCountryPickerOpen}
            title={t('Phone country code')}
            actions={phoneCountryPickerActions}
            onClose={() => setPhoneCountryPickerOpen(false)}
            searchable
            searchPlaceholder={t('Search country codes...')}
            detent="large"
            instantOpen
            runActionAfterClose={false}
            androidKeyboardAvoidance="resize"
          />
        ) : null}
        {groupPickerMounted ? (
          <ActionSheet
            visible={groupPickerOpen}
            title={t('Group')}
            actions={groupPickerActions}
            onClose={() => setGroupPickerOpen(false)}
            searchable
            searchPlaceholder={t('Search groups...')}
            detent="large"
            instantOpen
            runActionAfterClose={false}
            androidKeyboardAvoidance="resize"
          />
        ) : null}
      </View>
    </>
  );
}

// Dynamic theme + register layout.
function makeStyles(T: ThemeColors, isDark: boolean, insets: EdgeInsets, width: number, fontScale: number) {
  const pageBg = isDark ? T.bg : REGISTER_QUOTES_LIGHT_BACKGROUND;
  const surface = isDark ? T.glass2 : '#FFFFFF';
  const raisedSurface = isDark ? T.glass1 : 'rgba(15,23,42,0.04)';
  const selectedSurface = isDark ? T.glass3 : 'rgba(37,99,235,0.06)';
  const divider = isDark ? T.borderSubtle : 'rgba(15,23,42,0.07)';
  const border = isDark ? T.border : '#DFE7F1';
  const borderStrong = isDark ? T.borderMedium : '#D8E2EF';
  const primaryBlue = isDark ? T.accent : T.trading.buy.primary;
  const heroTitleColor = isDark ? '#FFFFFF' : T.text;
  const secondaryText = T.textSub;
  const fieldText = T.text;
  const mutedText = T.textMuted;
  const actionTintBg = isDark ? raisedSurface : 'rgba(37,99,235,0.08)';
  const singleColumn = width - insets.left - insets.right < 360 || fontScale > 1.3;

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
    inlineStatusIcon: {
      width: 30,
      height: 30,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? raisedSurface : 'rgba(255,255,255,0.7)',
    },
    inlineStatusBody: {
      flex: 1,
      minWidth: 0,
    },
    inlineStatusTitle: {
      color: T.text,
      fontSize: 13,
      fontWeight: '600',
    },
    inlineStatusText: {
      color: T.textSub,
      fontSize: 11,
      lineHeight: 15,
      marginTop: 2,
    },
    inlineRetryBtn: {
      minWidth: 64,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
      backgroundColor: T.accent,
    },
    inlineRetryBtnText: {
      color: '#ffffff',
      fontSize: 12,
      fontWeight: '600',
    },
    statusGate: {
      marginHorizontal: 20,
      marginTop: 40,
      minHeight: 180,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20,
      paddingVertical: 24,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? border : T.borderMedium,
      backgroundColor: isDark ? surface : T.glass1,
    },
    statusGateIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
      backgroundColor: isDark ? raisedSurface : T.glass2,
    },
    statusGateTitle: {
      color: T.text,
      fontSize: 16,
      fontWeight: '600',
      textAlign: 'center',
      marginTop: 10,
    },
    statusGateText: {
      color: T.textSub,
      fontSize: 13,
      lineHeight: 18,
      textAlign: 'center',
      marginTop: 8,
    },
    retryBtn: {
      backgroundColor: T.accent,
      minWidth: 120,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 18,
      paddingHorizontal: 20,
    },
    retryBtnPressed: {
      opacity: 0.85,
    },
    retryBtnText: {
      color: '#ffffff',
      fontSize: 14,
      fontWeight: '600',
    },
    groupSelector: {
      paddingTop: 0,
      paddingBottom: 12,
      backgroundColor: 'transparent',
    },
    groupSurface: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: borderStrong,
      backgroundColor: surface,
      overflow: 'hidden',
      shadowColor: '#000000',
      shadowOpacity: isDark ? 0 : 0.06,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: isDark ? 0 : 2,
    },
    groupHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    groupHeaderIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? raisedSurface : 'rgba(37,99,235,0.10)',
    },
    groupHeaderCopy: {
      flex: 1,
      minWidth: 0,
    },
    groupSectionLabel: {
      color: T.textMuted,
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0,
    },
    groupSectionSubtitle: {
      color: T.text,
      fontSize: 14,
      fontWeight: '600',
      marginTop: 2,
    },
    groupSectionCount: {
      minWidth: 28,
      height: 28,
      borderRadius: 14,
      overflow: 'hidden',
      textAlign: 'center',
      textAlignVertical: 'center',
      color: T.text,
      fontSize: 12,
      fontWeight: '600',
      backgroundColor: isDark ? raisedSurface : 'rgba(148,163,184,0.14)',
    },
    groupOptions: {
      borderTopWidth: 1,
      borderTopColor: isDark ? divider : 'rgba(15,23,42,0.08)',
    },
    groupLoadingOption: {
      minHeight: 64,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    groupLoadingText: {
      color: T.textSub,
      fontSize: 12,
      fontWeight: '500',
    },
    groupOption: {
      position: 'relative',
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 64,
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 14,
    },
    groupOptionSelected: {
      backgroundColor: selectedSurface,
    },
    groupRadio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: isDark ? T.borderHi : 'rgba(100,116,139,0.38)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    groupRadioSelected: {
      borderColor: T.accent,
      backgroundColor: T.accent,
    },
    groupOptionTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    groupOptionTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    groupOptionName: {
      color: T.text,
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
    },
    groupOptionDescription: {
      color: T.textSub,
      fontSize: 12,
      lineHeight: 16,
      marginTop: 3,
    },
    groupSelectedPill: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 10,
      backgroundColor: isDark ? raisedSurface : 'rgba(37,99,235,0.12)',
    },
    groupSelectedPillText: {
      color: T.accent,
      fontSize: 10,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    groupOptionDivider: {
      position: 'absolute',
      left: 46,
      right: 0,
      bottom: 0,
      height: 1,
      backgroundColor: isDark ? divider : 'rgba(15,23,42,0.07)',
    },

    formSectionTitle: {
      color: T.textMuted,
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0,
      marginTop: 14,
      marginBottom: 8,
      paddingHorizontal: 2,
    },
    formSectionBlock: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: border,
      backgroundColor: surface,
      overflow: 'hidden',
      marginBottom: 4,
      shadowColor: '#000000',
      shadowOpacity: isDark ? 0 : 0.04,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: isDark ? 0 : 1,
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
    inputShellPressed: {
      opacity: 0.86,
    },
    phoneCodeButton: {
      minWidth: 54,
      minHeight: 36,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
      paddingHorizontal: 5,
      borderRadius: 7,
      backgroundColor: raisedSurface,
    },
    phoneCodeText: {
      color: fieldText,
      fontSize: 14,
      fontWeight: '600',
      includeFontPadding: false,
    },
    phoneCodeDivider: {
      width: 1,
      height: 28,
      backgroundColor: border,
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
    readonlyValue: {
      flex: 1,
      color: fieldText,
      fontSize: 16,
      fontWeight: '500',
      textAlign: 'right',
      includeFontPadding: false,
    },
    fieldDivider: {
      height: 1,
      marginLeft: 62,
      backgroundColor: border,
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
    twoColumnRow: {
      flexDirection: singleColumn ? 'column' : 'row',
      gap: 8,
      alignItems: 'flex-start',
      marginBottom: 11,
    },
    twoColumnCell: {
      flex: singleColumn ? undefined : 1,
      alignSelf: 'stretch',
      minWidth: 0,
    },
    selectValue: {
      flex: 1,
      color: fieldText,
      fontSize: 14,
      fontWeight: '500',
      includeFontPadding: false,
    },
    originBrokerValueStack: {
      flex: 1,
      minWidth: 0,
    },
    originBrokerPrimaryValue: {
      color: fieldText,
      fontSize: 14,
      lineHeight: 17,
      fontWeight: '600',
      includeFontPadding: false,
    },
    originBrokerSecondaryValue: {
      color: secondaryText,
      fontSize: 12,
      lineHeight: 15,
      fontWeight: '500',
      includeFontPadding: false,
      marginTop: 2,
    },
    demoTypeRow: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      marginBottom: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: border,
      backgroundColor: surface,
    },
    demoTypeText: {
      flex: 1,
      color: fieldText,
      fontSize: 16,
      fontWeight: '600',
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

    /* Login Link */
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
  });
}

export default function SharedAuthenticationEntry() { return <AuthEntryScreen form="demo" />; }

