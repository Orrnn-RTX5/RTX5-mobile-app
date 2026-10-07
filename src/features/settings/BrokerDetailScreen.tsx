import { FastPressable as Pressable } from '../../ui/components/FastPressable';
/**
 * Settings Feature UI: BrokerDetailScreen
 *
 * Shown after a user selects a broker on the BrokersScreen. Mirrors the MT5
 * broker detail layout: lets the user open a demo account, open a real account
 * (disabled when the active session is already a real account), or sign into
 * an existing account on the selected broker. The "Server" field is
 * pre-populated from the broker the user just picked.
 */
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Screen } from '../../ui/components/Screen';
import { useDeferredRouteContentReady } from '../../ui/components/DeferredRouteMount';
import { useTheme } from '../../ui/theme/useTheme';
import type { ThemeColors } from '../../ui/theme/glass';
import { useIsDarkTheme } from '../../state/themeMode';
import { useUserPreferences } from '../../state/userPreferences';
import { useUIState } from '../../state/uiState';
import { useTranslation } from '../../i18n/useTranslation';
import { useSavedAccounts, setSavedAccountPassword } from '../../state/savedAccounts';
import { isLoginRequestAbortedError, loginAPI } from '../../api/auth';

import { getBrokerConfig, type BrokerServer } from '../../api/broker';
import {
  isBrokerServerUrlForApiBase,
  normalizeBrokerServerUrl,
  resolveBrokerEndpointSet,
  type ValidatedBrokerEndpointSet,
} from '../../api/brokerRouting';
import { getBrokerConfigQueryKey, useBrokerServers } from '../../query/broker';
import {
  invalidateSessionQueryRoots,
} from '../../query/authenticatedQueryScope';
import {
  buildAccountEnvironmentKey,
  mergeAccountEnvironment,
  readRawAccountGroup,
  resolveAccountEnvironment,
  type AccountEnvironmentState,
} from '../../domain/accountType';
import {
  safeRouterBack,
  scheduleBackNavigationAfterVisualFrame,
} from '../../utils/navigation';
import { ActionSheet } from '../../ui/components/ActionSheet';
import {
  setSecureItemAsync,
  removeSecureItemAsync,
  getSecureItemAsync,
} from '../../utils/secureStorage';
import { recordAccountJournalEvent } from '../../state/terminalJournalState';
import { runImmediateAction } from '../../utils/actionLatency';
import { BrokerDetailLaunchShell } from './BrokerDetailLaunchShell';
import {
  brokerDetailLaunchController,
  hideBrokerDetailLaunch,
  normalizeBrokerDetailLaunchSelection,
  scheduleBrokerDetailLaunchCoverRemoval,
} from './brokerDetailLaunchController';
import { showBrokersReturnLaunch } from './brokersLaunchController';
import { redactSensitiveString } from '../../api/authRedaction';
import { ORRNN_DEMO_PUBLIC_BROKER_ID } from '../../api/orrnnDemoPublicMarket';
import {
  scheduleRegisterLaunchNavigation,
  showRegisterLaunch,
} from './registerLaunchController';
import {
  authorizeBrokerSessionCommit,
  cancelBrokerSessionCommitAuthorization,
  commitBrokerSession,
  isStaleBrokerSessionCommitError,
  type BrokerSessionCommitAuthorization,
} from '../../services/brokerSessionCoordinator';
import { refreshActiveAccountEnvironment } from '../../services/accountEnvironmentSession';
import {
  isSameBrokerId,
  readLoginAccountLogin,
  resolveLoginExpiresAtIso,
  resolveLoginServerName,
} from '../../api/authSession';
import { enrichSignedInAccountProfile } from '../../api/authSessionProfile';
import { isInvestorReadOnlySession } from '../../api/investorSession';
import { useBrokerSignUpGate } from './BrokerDetailScreenRegistrationGate';
import {
  getActiveBrokerSessionProvenance,
  isActiveBrokerSessionProvenanceCurrent,
} from '../../state/activeBrokerSession';

const SAVED_LOGIN_KEY = 'rtx5_saved_login';
const primaryBlue = '#2563EB';

const scheduleBrokerDetailPostLoginWork = (task: () => void) => {
  const runAfterFrame = () => {
    setTimeout(task, 0);
  };

  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(runAfterFrame);
    return;
  }

  setTimeout(task, 0);
};

const scheduleBrokerDetailKeyboardDismiss = () => {
  const dismissKeyboard = () => Keyboard.dismiss();

  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(dismissKeyboard);
    return;
  }

  setTimeout(dismissKeyboard, 0);
};

type ServerOption = {
  label: string;
  brokerId: string;
  brokerName: string;
  brokerSymbol: string;
  serverUrl: string;
  logoUrl: string;
  endpoints: ValidatedBrokerEndpointSet | null;
};

type BrokerDetailRouteParams = {
  brokerId?: string;
  brokerName?: string;
  brokerServer?: string;
  brokerServerUrl?: string;
  brokerLogoUrl?: string;
  brokerDomain?: string;
};

const RESERVED_BROKER_IDS = new Set(['qr', 'custom']);

const normalizeOptionKey = (option: ServerOption) => (
  [
    option.brokerId.trim().toLowerCase(),
    option.label.trim().toLowerCase(),
    option.serverUrl.trim().toLowerCase(),
  ].join('|')
);

const isExactBrokerServerSelection = (
  left: Pick<ServerOption, 'brokerId' | 'serverUrl'>,
  right: Pick<ServerOption, 'brokerId' | 'serverUrl'>,
) => {
  const leftBrokerId = left.brokerId.trim().toLowerCase();
  const rightBrokerId = right.brokerId.trim().toLowerCase();
  const leftServerUrl = normalizeBrokerServerUrl(left.serverUrl);
  const rightServerUrl = normalizeBrokerServerUrl(right.serverUrl);

  return Boolean(
    leftBrokerId
    && rightBrokerId
    && leftServerUrl
    && rightServerUrl
    && leftBrokerId === rightBrokerId
    && leftServerUrl === rightServerUrl
  );
};

const formatBrokerOptionName = (brokerSymbol: string, brokerName: string) => {
  const symbol = brokerSymbol.trim();
  const name = brokerName.trim();
  if (!symbol) return name;
  if (!name) return symbol;
  return name.toLowerCase().includes(symbol.toLowerCase()) ? name : `${symbol} ${name}`;
};

const buildServerOptionFromBrokerServer = (broker: BrokerServer): ServerOption | null => {
  if (broker.enabled === false) {
    return null;
  }

  const brokerId = String(broker.broker_id ?? '').trim();
  const brokerName = String(broker.broker_name ?? '').trim() || brokerId;
  const serverLabel = String(broker.server ?? '').trim() || brokerName;
  const resolution = resolveBrokerEndpointSet(broker);
  if (!resolution.ok) return null;
  const exactServerUrl = normalizeBrokerServerUrl(broker.server_url);

  if (
    !brokerId
    || !serverLabel
    || !exactServerUrl
    || !isBrokerServerUrlForApiBase(exactServerUrl, resolution.endpoints.apiBase)
  ) {
    return null;
  }

  return {
    label: serverLabel,
    brokerId,
    brokerName,
    brokerSymbol: brokerId,
    serverUrl: exactServerUrl,
    logoUrl: String(broker.logo_url ?? '').trim(),
    endpoints: resolution.endpoints,
  };
};

export function BrokerDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<BrokerDetailRouteParams>();
  const isScreenFocused = useIsFocused();
  const contentReady = useDeferredRouteContentReady(0, isScreenFocused);
  const selection = useMemo(() => normalizeBrokerDetailLaunchSelection({
    brokerId: params.brokerId,
    brokerName: params.brokerName,
    brokerServer: params.brokerServer,
    brokerServerUrl: params.brokerServerUrl,
    brokerLogoUrl: params.brokerLogoUrl,
    brokerDomain: params.brokerDomain,
  }), [
    params.brokerDomain,
    params.brokerId,
    params.brokerLogoUrl,
    params.brokerName,
    params.brokerServer,
    params.brokerServerUrl,
  ]);

  const handleBack = useCallback(() => {
    showBrokersReturnLaunch();
    if (brokerDetailLaunchController.isVisible()) {
      hideBrokerDetailLaunch();
    }
    scheduleBackNavigationAfterVisualFrame(() => {
      safeRouterBack(router, '/settings/brokers');
    });
  }, [router]);
  const handleOpenDemo = useCallback(() => {
    runImmediateAction('brokerDetail.openDemo', () => {
      const registerRevision = showRegisterLaunch(selection);
      scheduleRegisterLaunchNavigation(registerRevision, () => {
        router.push({
          pathname: '/register-entry',
          params: {
            origin: 'broker-detail',
            registerLaunchRevision: String(registerRevision),
          },
        });
      });
    });
  }, [router, selection]);

  // Contract v3: no demo sign-up entry when the broker disables it.
  const launchSignUpGate = useBrokerSignUpGate(selection.brokerServerUrl);

  useLayoutEffect(() => {
    if (!isScreenFocused || !contentReady) return;

    const launchRevision = brokerDetailLaunchController.getSnapshot().revision;
    scheduleBrokerDetailLaunchCoverRemoval(launchRevision);
  }, [contentReady, isScreenFocused]);

  useEffect(() => {
    if (!isScreenFocused) return undefined;

    // This focus owns only the revision that existed when it became active.
    // Its delayed blur cleanup must never hide a newer cover created by Demo
    // Account Back while React is still flushing the older focus transition.
    const ownedLaunchRevision = brokerDetailLaunchController.getSnapshot().revision;
    return () => {
      hideBrokerDetailLaunch(ownedLaunchRevision);
    };
  }, [isScreenFocused]);

  useEffect(() => {
    if (!isScreenFocused) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => subscription.remove();
  }, [handleBack, isScreenFocused]);

  // Root-stack routes remain mounted underneath newer screens. Keep only this
  // route wrapper alive while blurred so the login form does not stay in the
  // native hierarchy or participate in unrelated live renders.
  if (!isScreenFocused) {
    return null;
  }

  if (!contentReady) {
    if (brokerDetailLaunchController.isVisible()) {
      return null;
    }
    return (
      <BrokerDetailLaunchShell
        selection={selection}
        onBack={handleBack}
        onOpenDemo={launchSignUpGate.demo ? handleOpenDemo : undefined}
        showDemoSignUp={launchSignUpGate.demo}
        showRealSignUp={launchSignUpGate.real}
        backLatencyLabel="brokerDetail.initial.back"
      />
    );
  }

  return <BrokerDetailInteractiveContent onBack={handleBack} selection={selection} />;
}

/** Displays the full interactive account and login controls after first paint. */
function BrokerDetailInteractiveContent({
  onBack,
  selection,
}: {
  onBack: () => void;
  selection: ReturnType<typeof normalizeBrokerDetailLaunchSelection>;
}) {
  const router = useRouter();
  const isScreenFocused = useIsFocused();
  const params = useLocalSearchParams<BrokerDetailRouteParams>();
  const T = useTheme();
  const { t } = useTranslation();
  const isDark = useIsDarkTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(T, isDark, insets.top), [T, isDark, insets.top]);

  const isLoggedIn = useUserPreferences((s) => s.isLoggedIn);
  const activeAccountType = useUserPreferences((s) => s.accountType);
  const upsertSavedAccount = useSavedAccounts((s) => s.upsertAccount);
  const queryClient = useQueryClient();
  const showBrokerDetailActionSheet = useUIState((s) => s.showBrokerDetailActionSheet);
  const actionSheet = useUIState((s) => s.scopedActionSheets.settingsBrokerDetail);
  const hideBrokerDetailActionSheet = useUIState((s) => s.hideBrokerDetailActionSheet);
  const { data: brokerServers } = useBrokerServers(isScreenFocused);

  // Real-account option is disabled while the active session is a real
  // account, matching MT5: it shows as muted so the user knows they already
  // have a live connection.
  const hasActiveRealAccount = isLoggedIn && activeAccountType === 'real';

  const brokerName = params.brokerName ? String(params.brokerName) : t('Broker');
  const brokerIdSlug = params.brokerId ? String(params.brokerId) : '';
  const initialServer = params.brokerServer
    ? String(params.brokerServer)
    : brokerName;
  const initialServerUrl = normalizeBrokerServerUrl(
    params.brokerServerUrl ? String(params.brokerServerUrl) : '',
  );
  const initialLogoUrl = params.brokerLogoUrl ? String(params.brokerLogoUrl) : '';

  // The broker_id must come from the validated directory selection. A display
  // label is never promoted into an authenticated broker identity.
  const apiBrokerId = brokerIdSlug && !RESERVED_BROKER_IDS.has(brokerIdSlug)
    ? brokerIdSlug
    : '';

  const initialServerOption = useMemo<ServerOption>(() => ({
    label: initialServer,
    brokerId: apiBrokerId,
    brokerName,
    brokerSymbol: apiBrokerId,
    serverUrl: initialServerUrl,
    logoUrl: initialLogoUrl,
    endpoints: null,
  }), [apiBrokerId, brokerName, initialLogoUrl, initialServer, initialServerUrl]);

  const serverOptions = useMemo<ServerOption[]>(() => {
    const seen = new Set<string>();
    const out: ServerOption[] = [];

    const pushOption = (option: ServerOption | null) => {
      if (!option) return;
      const key = normalizeOptionKey(option);
      if (seen.has(key)) return;
      seen.add(key);
      out.push(option);
    };

    // The Server field doubles as a broker/server switcher: it lists the FULL
    // validated directory so the user can retarget the login form without
    // navigating back to the Brokers screen. Every option carries its own
    // directory-validated endpoints; the launch broker's entries sort first.
    const directoryOptions = (brokerServers ?? [])
      .map(buildServerOptionFromBrokerServer)
      .filter((option): option is ServerOption => option !== null)
      .sort((a, b) => (
        Number(isExactBrokerServerSelection(b, initialServerOption))
          - Number(isExactBrokerServerSelection(a, initialServerOption)) ||
        a.brokerName.localeCompare(b.brokerName) ||
        a.label.localeCompare(b.label) ||
        a.brokerId.localeCompare(b.brokerId)
      ));

    for (const option of directoryOptions) {
      pushOption(option);
    }

    // Route params remain display-only. They can render while discovery is in
    // flight (or when the directory no longer lists the launch broker), but
    // never gain authenticated routing authority.
    const hasInitialOption = out.some((option) => (
      isExactBrokerServerSelection(option, initialServerOption)
    ));
    if (!hasInitialOption && (initialServerOption.label || initialServerOption.brokerId)) {
      pushOption(initialServerOption);
    }

    return out;
  }, [brokerServers, initialServerOption]);

  const [loginValue, setLoginValue] = useState('');
  const [passwordValue, setPasswordValue] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [savePassword, setSavePassword] = useState(true);
  const [selectedServer, setSelectedServer] = useState<ServerOption>(() => (
    serverOptions.find((option) => (
      option.endpoints !== null
      && isExactBrokerServerSelection(option, initialServerOption)
    )) ?? initialServerOption
  ));
  const selectedBrokerName = selectedServer.brokerName || brokerName;
  const selectedBrokerSymbol = selectedServer.brokerSymbol || selectedServer.brokerId || apiBrokerId;
  const selectedBrokerDisplayName = formatBrokerOptionName(selectedBrokerSymbol, selectedBrokerName) || t('Broker');
  const selectedBrokerLogoUrl = selectedServer.logoUrl || initialLogoUrl;
  const brokerInitials = useMemo(() => {
    const words = selectedBrokerDisplayName
      .replace(/\([^)]*\)/g, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const initials = words.slice(0, 2).map((word) => word.charAt(0)).join('').toUpperCase();
    return initials || 'BR';
  }, [selectedBrokerDisplayName]);
  const brokerServerLabel = selectedServer.label || apiBrokerId || t('Server');
  // Contract v3: sign-up follows the broker's public /broker/config flags.
  const signUpGate = useBrokerSignUpGate(selectedServer.serverUrl);
  const showDemoSignUp = signUpGate.demo;
  const showRealSignUp = signUpGate.real;
  const [isLoading, setIsLoading] = useState(false);
  const [modalState, setModalState] = useState<{
    visible: boolean;
    type: 'success' | 'error';
    title: string;
    message: string;
  }>({ visible: false, type: 'success', title: '', message: '' });
  const [forgotPasswordVisible, setForgotPasswordVisible] = useState(false);
  const requestInFlightRef = useRef(false);
  const brokerLoginMountedRef = useRef(true);
  const activeBrokerLoginAttemptRef = useRef<{
    authorization: BrokerSessionCommitAuthorization;
    controller: AbortController;
  } | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const focusScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loginInputFocusedRef = useRef(false);

  useEffect(() => {
    brokerLoginMountedRef.current = true;
    return () => {
      brokerLoginMountedRef.current = false;
      const activeAttempt = activeBrokerLoginAttemptRef.current;
      activeAttempt?.controller.abort();
      cancelBrokerSessionCommitAuthorization(activeAttempt?.authorization);
      activeBrokerLoginAttemptRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (isScreenFocused) return;
    const activeAttempt = activeBrokerLoginAttemptRef.current;
    activeAttempt?.controller.abort();
    cancelBrokerSessionCommitAuthorization(activeAttempt?.authorization);
    activeBrokerLoginAttemptRef.current = null;
    requestInFlightRef.current = false;
  }, [isScreenFocused]);

  const scrollLoginActionsAboveKeyboard = useCallback((delayMs = 220) => {
    // iOS ScrollView keyboard insets already move only the focused field into
    // view. A second forced scroll sends this long form to its maximum offset.
    if (Platform.OS === 'ios') {
      return;
    }

    if (focusScrollTimerRef.current) {
      clearTimeout(focusScrollTimerRef.current);
    }

    focusScrollTimerRef.current = setTimeout(() => {
      // The login card can be taller than the keyboard-resized viewport on a
      // compact phone. Target its actual bottom so the Login action clears the
      // keyboard instead of merely aligning the card's top edge.
      scrollRef.current?.scrollToEnd({ animated: true });
    }, delayMs);
  }, []);

  /**
   * Callback fired when a text input receives focus, used to trigger keyboard avoidance or UI scrolling.
   */
  const handleLoginInputFocus = useCallback(() => {
    loginInputFocusedRef.current = true;
    scrollLoginActionsAboveKeyboard();
  }, [scrollLoginActionsAboveKeyboard]);

  /**
   * Callback fired when a text input loses focus.
   */
  const handleLoginInputBlur = useCallback(() => {
    loginInputFocusedRef.current = false;
  }, []);

  const handleLoginScrollLayout = useCallback(() => {
    if (loginInputFocusedRef.current) {
      // Android adjustResize changes this viewport. Re-run against its final
      // measured height instead of relying on a phone-specific Y position.
      scrollLoginActionsAboveKeyboard(0);
    }
  }, [scrollLoginActionsAboveKeyboard]);

  useEffect(() => {
    // Native iOS keyboard insets own focus positioning for this ScrollView.
    // Keep the existing manual retry only for Android's resized viewport.
    if (Platform.OS === 'ios') {
      return undefined;
    }

    const showSubscription = Keyboard.addListener(
      'keyboardDidShow',
      () => {
        if (loginInputFocusedRef.current) {
          scrollLoginActionsAboveKeyboard(40);
        }
      },
    );
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      loginInputFocusedRef.current = false;
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
      if (focusScrollTimerRef.current) {
        clearTimeout(focusScrollTimerRef.current);
      }
    };
  }, [scrollLoginActionsAboveKeyboard]);

  useEffect(() => {
    setSelectedServer((current) => {
      const matchingOption = serverOptions.find((option) => (
        option.endpoints !== null
        && isExactBrokerServerSelection(option, current)
      ));

      return matchingOption ?? current;
    });
  }, [serverOptions]);

  // Lazy-load any previously saved login on first focus so returning users
  // see their credentials pre-filled (mirrors the standalone /login screen).
  useEffect(() => {
    let cancelled = false;
    getSecureItemAsync(SAVED_LOGIN_KEY).then((val) => {
      if (cancelled || !val) return;
      try {
        const parsed = JSON.parse(val);
        if (parsed.login) setLoginValue(String(parsed.login));
        if (parsed.pass) setPasswordValue(String(parsed.pass));
        setSavePassword(true);
      } catch {
        // ignore corrupt cache
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // When the user retargets the login form via the Server dropdown, demo/real
  // registration must follow the newly selected broker — not the route params
  // this screen was originally opened with.
  const activeLaunchSelection = useMemo(() => {
    if (!selectedServer.endpoints) {
      return selection;
    }
    const sameBrokerAsRoute =
      selectedServer.brokerId.trim().toLowerCase() === selection.brokerId.trim().toLowerCase();
    return normalizeBrokerDetailLaunchSelection({
      brokerId: selectedServer.brokerId,
      brokerName: selectedServer.brokerName,
      brokerServer: selectedServer.label,
      brokerServerUrl: selectedServer.serverUrl,
      brokerLogoUrl: selectedServer.logoUrl,
      brokerDomain: sameBrokerAsRoute ? selection.brokerDomain : '',
    });
  }, [selectedServer, selection]);

  const navigateToRegister = useCallback((type: 'demo' | 'real') => {
    if (type === 'real') {
      // The real-account onboarding requires KYC/identity flows that are not
      // yet wired up in the app — keep the option present but route users to
      // support guidance instead of an unfinished form.
      Alert.alert(
        t('Open a real account'),
        t('For live trading, additional identification is required. Please contact your broker to begin onboarding.'),
      );
      return;
    }
    // Same class as Accounts "+" → Brokers: reveal retained Demo shell in this
    // press turn, then push the route after it has painted.
    runImmediateAction('brokerDetail.openDemo', () => {
      const registerRevision = showRegisterLaunch(activeLaunchSelection);
      scheduleRegisterLaunchNavigation(registerRevision, () => {
        router.push({
          pathname: '/register-entry',
          params: {
            origin: 'broker-detail',
            registerLaunchRevision: String(registerRevision),
          },
        });
      });
    });
  }, [activeLaunchSelection, router, t]);

  const openServerSelector = () => {
    if (serverOptions.length <= 1) return;
    runImmediateAction('brokerDetail.serverSheet.open', () =>
      showBrokerDetailActionSheet({
        title: t('Choose server'),
        presentation: 'mt5Plain',
        searchable: true,
        searchPlaceholder: t('Search brokers'),
        detent: 'large',
        instantOpen: true,
        androidKeyboardAvoidance: 'resize',
        actions: serverOptions.map((opt) => ({
          label: formatBrokerOptionName(opt.brokerSymbol, opt.brokerName),
          subtitle: opt.label,
          selected: normalizeOptionKey(opt) === normalizeOptionKey(selectedServer),
          onPress: () => setSelectedServer(opt),
        })),
      }),
    );
  };

  const submitLogin = async () => {
    if (requestInFlightRef.current) return;
    scheduleBrokerDetailKeyboardDismiss();

    const trimmedLogin = loginValue.trim();
    const trimmedPassword = passwordValue;
    const effectiveBrokerId = selectedServer.brokerId.trim();
    const effectiveServerUrl = normalizeBrokerServerUrl(selectedServer.serverUrl);
    const effectiveLogoUrl = selectedServer.logoUrl || initialLogoUrl;
    const selectedEndpoints = selectedServer.endpoints;

    if (!effectiveBrokerId) {
      setModalState({
        visible: true,
        type: 'error',
        title: t('Error'),
        message: t('Please choose a server'),
      });
      return;
    }
    if (
      !effectiveServerUrl
      || !selectedEndpoints
      || selectedEndpoints.brokerId.trim().toLowerCase() !== effectiveBrokerId.toLowerCase()
      || !isBrokerServerUrlForApiBase(effectiveServerUrl, selectedEndpoints.apiBase)
    ) {
      recordAccountJournalEvent('broker detail login blocked: broker server missing', {
        level: 'error',
        accountLogin: trimmedLogin,
      });
      setModalState({
        visible: true,
        type: 'error',
        title: t('Error'),
        message: t('Please select a broker from the list.'),
      });
      return;
    }
    if (!trimmedLogin || !trimmedPassword) {
      recordAccountJournalEvent('broker detail login blocked: login id or password missing', {
        level: 'error',
        accountLogin: trimmedLogin,
      });
      setModalState({
        visible: true,
        type: 'error',
        title: t('Error'),
        message: t('Please enter both Login ID and Password'),
      });
      return;
    }
    const isOrrnnDemoLogin = effectiveBrokerId === ORRNN_DEMO_PUBLIC_BROKER_ID;
    const numericDemoLogin = isOrrnnDemoLogin ? Number(trimmedLogin) : null;
    if (
      isOrrnnDemoLogin &&
      (!Number.isSafeInteger(numericDemoLogin) || Number(numericDemoLogin) <= 0)
    ) {
      setModalState({
        visible: true,
        type: 'error',
        title: t('Error'),
        message: t('Please enter a valid numeric demo account login.'),
      });
      return;
    }

    requestInFlightRef.current = true;
    setIsLoading(true);
    recordAccountJournalEvent(`broker detail login requested for broker ${effectiveBrokerId}`, {
      accountLogin: trimmedLogin,
    });
    const commitAuthorization = authorizeBrokerSessionCommit();
    const loginAbortController = new AbortController();
    activeBrokerLoginAttemptRef.current = {
      authorization: commitAuthorization,
      controller: loginAbortController,
    };
    let didStartSuccessNavigation = false;
    try {
      const response: any = await loginAPI(
        isOrrnnDemoLogin
          ? {
              login: Number(numericDemoLogin),
              password: trimmedPassword,
              broker_id: ORRNN_DEMO_PUBLIC_BROKER_ID,
            }
          : {
              username: trimmedLogin,
              password: trimmedPassword,
              // Exact directory broker_id: the server compares it case-sensitively.
              broker_id: selectedEndpoints.brokerId,
            },
        { serverUrl: effectiveServerUrl, signal: loginAbortController.signal },
      );

      const accessToken = response.access_token ?? response.token;
      const refreshToken = response.refresh_token ?? response.refreshToken ?? '';
      if (!accessToken) {
        throw new Error(t('Login server did not return an access token.'));
      }
      // Contract v3: account_login null means no trading account; stop here.
      const accountLogin = readLoginAccountLogin(response, trimmedLogin);
      // Placeholder until /account/{login} `name` arrives (contract v3).
      const accountName =
        response.account_name ??
        response.accountName ??
        response.name ??
        response.username ??
        'Trader';
      const expiresAtIso = resolveLoginExpiresAtIso(response);

      const responseBrokerId =
        response.broker_id || response.brokerId || selectedEndpoints.brokerId;
      if (!isSameBrokerId(responseBrokerId, selectedEndpoints.brokerId)) {
        throw new Error(t('Login response did not match the selected broker.'));
      }
      const canonicalBrokerId = selectedEndpoints.brokerId;
      // /broker/config server_name replaces this after login; until then the
      // directory broker name (server label) is shown.
      const effectiveServerName = resolveLoginServerName({
        brokerConfigServerName: response.server ?? response.broker_server ?? response.brokerServer,
        directoryBrokerName: selectedBrokerName || selectedServer.label,
        brokerId: canonicalBrokerId,
      });
      const savedLogin = String(accountLogin);
      const accountEnvironmentEvidence = resolveAccountEnvironment(response, true);
      const resolvedAccountType = accountEnvironmentEvidence.accountType;
      const accountEnvironmentKey = buildAccountEnvironmentKey(
        selectedEndpoints.brokerId,
        savedLogin,
      );
      const matchingSavedAccount = useSavedAccounts.getState().accounts.find(
        (account) =>
          buildAccountEnvironmentKey(account.brokerId, account.login) === accountEnvironmentKey,
      );
      const previousAccountEnvironment: AccountEnvironmentState | null =
        matchingSavedAccount && matchingSavedAccount.accountType !== 'unknown'
          ? {
              accountKey: accountEnvironmentKey,
              accountType: matchingSavedAccount.accountType,
              accountEnvironmentSource: matchingSavedAccount.accountEnvironmentSource,
              isDemoAccount: matchingSavedAccount.accountType === 'demo',
            }
          : null;
      const initialAccountEnvironment = mergeAccountEnvironment(previousAccountEnvironment, {
        accountKey: accountEnvironmentKey,
        resolved: resolvedAccountType,
        source: accountEnvironmentEvidence.source,
        allowInitialFallback: true,
      })!;
      const accountType = initialAccountEnvironment.accountType;
      const accountEnvironmentSource = initialAccountEnvironment.accountEnvironmentSource;
      const responseAccountGroup = readRawAccountGroup(response);

      const committedSession = await commitBrokerSession({
        session: {
          brokerId: selectedEndpoints.brokerId,
          accountLogin: savedLogin,
          apiBase: selectedEndpoints.apiBase,
          feedWsBase: selectedEndpoints.feedWsBase,
          tradeWsBase: selectedEndpoints.tradeWsBase,
          feedStatusUrl: selectedEndpoints.feedStatusUrl,
          servicesDomain: selectedEndpoints.servicesDomain,
          configVersion: selectedEndpoints.configVersion,
          investor: isInvestorReadOnlySession(response),
        },
        credentials: {
          accessToken,
          refreshToken,
          expiresAt: expiresAtIso,
        },
        account: {
          name: accountName,
          serverName: effectiveServerName,
          logoUrl: effectiveLogoUrl,
          accountType,
          accountEnvironmentSource,
        },
      }, commitAuthorization);
      const committedProvenance = getActiveBrokerSessionProvenance(committedSession.session);
      recordAccountJournalEvent(`broker detail login succeeded on ${canonicalBrokerId}`, {
        level: 'success',
        accountLogin: savedLogin,
      });
      router.replace('/(tabs)/quotes');
      didStartSuccessNavigation = true;
      scheduleBrokerDetailPostLoginWork(() => {
        upsertSavedAccount({
          login: savedLogin,
          name: accountName,
          brokerId: canonicalBrokerId,
          server: effectiveServerName,
          serverUrl: effectiveServerUrl,
          logoUrl: effectiveLogoUrl,
          accountType,
          accountEnvironmentSource,
          ...(responseAccountGroup ? { rawGroup: responseAccountGroup } : {}),
          lastUsedAt: Date.now(),
          hasCredentials: true,
        });
        // Seed persistence before the refresh starts so even a synchronous
        // test/mock response has a matching row to update.
        void refreshActiveAccountEnvironment(committedProvenance).catch(() => undefined);
        // Name from /account/{login}, server from /broker/config (contract v3).
        void enrichSignedInAccountProfile({
          provenance: committedProvenance,
          brokerId: canonicalBrokerId,
          accountLogin: savedLogin,
        }).catch(() => undefined);
        setSavedAccountPassword(canonicalBrokerId, savedLogin, trimmedPassword).catch(() => undefined);

        void invalidateSessionQueryRoots(
          queryClient,
          committedSession.session.cacheNamespace,
          ['accountDetail', 'brokerConfig'],
        );

        if (savePassword) {
          void setSecureItemAsync(
            SAVED_LOGIN_KEY,
            JSON.stringify({
              broker: canonicalBrokerId,
              server_url: effectiveServerUrl,
              logo_url: effectiveLogoUrl,
              login: trimmedLogin,
              pass: trimmedPassword,
            }),
          );
        } else {
          void removeSecureItemAsync(SAVED_LOGIN_KEY);
        }

        // Best-effort: refresh broker config so AccountsScreen shows the
        // correct broker name/server immediately after login.
        if (!isActiveBrokerSessionProvenanceCurrent(committedProvenance)) return;
        void getBrokerConfig(canonicalBrokerId)
          .then((cfg) => {
            if (!isActiveBrokerSessionProvenanceCurrent(committedProvenance)) return;
            queryClient.setQueryData(
              getBrokerConfigQueryKey(committedSession.session.cacheNamespace, canonicalBrokerId),
              cfg,
            );
          })
          .catch(() => undefined);
      });
    } catch (error: any) {
      if (
        !brokerLoginMountedRef.current ||
        isLoginRequestAbortedError(error) ||
        isStaleBrokerSessionCommitError(error)
      ) {
        return;
      }
      const safeErrorMessage = redactSensitiveString(
        typeof error?.message === 'string' && error.message.trim()
          ? error.message
          : t('Invalid credentials'),
      );
      recordAccountJournalEvent(`broker detail login failed: ${safeErrorMessage}`, {
        level: 'error',
        accountLogin: trimmedLogin,
      });
      setModalState({
        visible: true,
        type: 'error',
        title: t('Login Failed'),
        message: safeErrorMessage,
      });
    } finally {
      requestInFlightRef.current = false;
      cancelBrokerSessionCommitAuthorization(commitAuthorization);
      if (activeBrokerLoginAttemptRef.current?.authorization === commitAuthorization) {
        activeBrokerLoginAttemptRef.current = null;
      }
      if (!didStartSuccessNavigation) {
        if (brokerLoginMountedRef.current) {
          setIsLoading(false);
        }
      }
    }
  };

  /**
   * Opens a webview or deep link to the broker's password recovery page.
   */
  const handleForgotPassword = () => {
    setForgotPasswordVisible(true);
  };

  const hasServerChoices = serverOptions.length > 1;

  return (
    <Screen>
      <View style={styles.page}>
        <View style={styles.header}>
          <Pressable
            style={styles.iconBtn}
            hitSlop={15}
            onPress={onBack}
            activateOnPressIn
            activateOnTouchStart
            latencyLabel="brokerDetail.back"
            latencyBudgetMs={50}
            unstable_pressDelay={0}
          >
            <Ionicons name="arrow-back" size={26} color={T.text} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>{selectedBrokerName}</Text>
        </View>

        <KeyboardAvoidingView
          style={styles.container}
          enabled={Platform.OS !== 'ios'}
          behavior={Platform.OS === 'ios' ? undefined : 'height'}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            ref={scrollRef}
            style={styles.scrollViewport}
            onLayout={handleLoginScrollLayout}
            automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
            canCancelContentTouches={Platform.OS === 'ios'}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps="always"
            contentContainerStyle={styles.scrollContent}
          >
            {/* Selected broker account entry surface */}
            <View style={styles.brokerSummaryCard}>
              <View style={styles.brokerSummaryTop}>
                <View style={styles.brokerLogoMark}>
                  {selectedBrokerLogoUrl ? (
                    <Image
                      source={{ uri: selectedBrokerLogoUrl }}
                      style={styles.brokerLogoImage}
                      resizeMode="contain"
                      accessibilityIgnoresInvertColors
                    />
                  ) : (
                    <Text style={styles.brokerLogoText}>{brokerInitials}</Text>
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
                  <Text style={styles.brokerName} numberOfLines={1}>{selectedBrokerDisplayName}</Text>
                  <View style={styles.brokerServerPill}>
                    <Ionicons name="server-outline" size={15} color={T.textSub} />
                    <Text style={styles.brokerServerLine} numberOfLines={1}>
                      {brokerServerLabel}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

                {(showDemoSignUp || showRealSignUp) && (
                <View style={styles.optionPanel} testID="broker-detail-sign-up-options">
                  {showDemoSignUp && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.optionCommand,
                      pressed && styles.optionCommandPressed,
                    ]}
                    onPress={() => navigateToRegister('demo')}
                    activateOnPressIn
                    activateOnTouchStart
                    latencyLabel="brokerDetail.openDemo"
                    unstable_pressDelay={0}
                  >
                    <View style={[styles.optionIcon, styles.optionIconDemo]}>
                      <Ionicons name="school" size={18} color="#FFFFFF" />
                    </View>
                    <View style={styles.optionTextWrap}>
                      <Text style={styles.optionTitle}>{t('Open a demo account')}</Text>
                      <Text style={styles.optionSub} numberOfLines={2}>
                        {t('To learn trading and to test your strategies')}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={T.textSub} />
                  </Pressable>
                  )}

                  {showDemoSignUp && showRealSignUp && <View style={styles.optionDivider} />}

                  {showRealSignUp && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.optionCommand,
                      hasActiveRealAccount && styles.optionRowDisabled,
                      pressed && !hasActiveRealAccount && styles.optionCommandPressed,
                    ]}
                    onPress={() => {
                      if (hasActiveRealAccount) return;
                      navigateToRegister('real');
                    }}
                    disabled={hasActiveRealAccount}
                    activateOnPressIn
                    latencyLabel="brokerDetail.openReal"
                    unstable_pressDelay={0}
                  >
                    <View style={[styles.optionIcon, styles.optionIconReal]}>
                      <Ionicons name="trending-up" size={18} color="#FFFFFF" />
                    </View>
                    <View style={styles.optionTextWrap}>
                      <Text
                        style={[
                          styles.optionTitle,
                          hasActiveRealAccount && styles.optionTitleDisabled,
                        ]}
                      >
                        {t('Open a real account')}
                      </Text>
                      <Text
                        style={[
                          styles.optionSub,
                          hasActiveRealAccount && styles.optionSubDisabled,
                        ]}
                        numberOfLines={2}
                      >
                        {t('For live trading, additional identification is required')}
                      </Text>
                    </View>
                    {!hasActiveRealAccount && (
                      <Ionicons name="chevron-forward" size={18} color={T.textSub} />
                    )}
                  </Pressable>
                  )}
                </View>
                )}

                <View style={styles.loginPanel}>
                  <View style={styles.panelHeader}>
                    <View style={styles.panelTitleTopRow}>
                      <View style={styles.panelTitleRow}>
                        <View style={styles.panelIconMark}>
                          <Ionicons name="key-outline" size={18} color="#2563EB" />
                        </View>
                        <Text style={styles.panelEyebrow}>{t('Existing account')}</Text>
                      </View>
                      <View style={styles.securePill}>
                        <Ionicons name="shield-checkmark-outline" size={14} color={T.trading.profit} />
                        <Text style={styles.secureText}>{t('Secure')}</Text>
                      </View>
                    </View>
                    <Text style={styles.sectionTitle} numberOfLines={1}>
                      {t('Login to an existing account')}
                    </Text>
                  </View>

                  <View style={styles.fieldGroup}>
                    <View style={styles.fieldBlock}>
                      <Text style={styles.inputLabel}>{t('Login')}</Text>
                      <View style={styles.inputShell}>
                        <Ionicons name="person-outline" size={19} color={T.textMuted} />
                        <TextInput
                          style={styles.input}
                          value={loginValue}
                          onChangeText={setLoginValue}
                          onFocus={handleLoginInputFocus}
                          onBlur={handleLoginInputBlur}
                          onSubmitEditing={() => passwordInputRef.current?.focus()}
                          autoCapitalize="none"
                          keyboardType="numeric"
                          returnKeyType="next"
                          selectionColor={T.accent}
                          cursorColor={T.accent}
                          underlineColorAndroid="transparent"
                          placeholder={t('Login')}
                          placeholderTextColor={T.textMuted}
                        />
                      </View>
                    </View>

                    <View style={styles.fieldBlock}>
                      <Text style={styles.inputLabel}>{t('Password')}</Text>
                      <View style={styles.inputShell}>
                        <Ionicons name="lock-closed-outline" size={19} color={T.textMuted} />
                        <TextInput
                          ref={passwordInputRef}
                          style={styles.input}
                          value={passwordValue}
                          onChangeText={setPasswordValue}
                          onFocus={handleLoginInputFocus}
                          onBlur={handleLoginInputBlur}
                          onSubmitEditing={submitLogin}
                          autoCapitalize="none"
                          returnKeyType="done"
                          secureTextEntry={!showPassword}
                          selectionColor={T.accent}
                          cursorColor={T.accent}
                          underlineColorAndroid="transparent"
                          placeholder={t('Password')}
                          placeholderTextColor={T.textMuted}
                        />
                        <Pressable
                          style={styles.fieldIconButton}
                          onPress={() => setShowPassword((v) => !v)}
                          hitSlop={12}
                          activateOnPressIn
                          latencyLabel="brokerDetail.password.toggle"
                          unstable_pressDelay={0}
                        >
                          <Ionicons
                            name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                            size={20}
                            color={T.textSub}
                          />
                        </Pressable>
                      </View>
                    </View>

                    <View style={styles.fieldBlock}>
                      <Text style={styles.inputLabel}>{t('Server')}</Text>
                      <Pressable
                        style={styles.inputShell}
                        onPress={openServerSelector}
                        disabled={!hasServerChoices}
                        activateOnPressIn
                        latencyLabel="brokerDetail.server.open"
                        unstable_pressDelay={0}
                      >
                        {selectedBrokerLogoUrl ? (
                          <Image
                            source={{ uri: selectedBrokerLogoUrl }}
                            style={styles.serverLogoIcon}
                            resizeMode="contain"
                            accessibilityIgnoresInvertColors
                          />
                        ) : (
                          <Ionicons name="server-outline" size={19} color={T.textMuted} />
                        )}
                        <Text style={styles.serverValue} numberOfLines={1}>
                          {selectedServer.label || '---'}
                        </Text>
                        {hasServerChoices && (
                          <Ionicons name="chevron-down" size={18} color={T.textSub} />
                        )}
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.formMetaRow}>
                    <Pressable
                      style={styles.checkboxRow}
                      onPress={() => setSavePassword((v) => !v)}
                      hitSlop={10}
                      activateOnPressIn
                      latencyLabel="brokerDetail.savePassword.toggle"
                      unstable_pressDelay={0}
                    >
                      <Ionicons
                        name={savePassword ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={savePassword ? primaryBlue : T.textSub}
                      />
                      <Text style={styles.checkboxText}>{t('Save password')}</Text>
                    </Pressable>

                    <Pressable
                      style={styles.forgotBtn}
                      onPress={handleForgotPassword}
                      hitSlop={10}
                      activateOnPressIn
                      latencyLabel="brokerDetail.forgotPassword.open"
                      unstable_pressDelay={0}
                    >
                      <Text style={styles.forgotText}>{t('Forgot password?')}</Text>
                    </Pressable>
                  </View>

                  <Pressable
                    style={({ pressed }) => [
                      styles.loginBtn,
                      (pressed || isLoading) && styles.loginBtnPressed,
                    ]}
                    onPress={submitLogin}
                    disabled={isLoading}
                    activateOnPressIn
                    latencyLabel="brokerDetail.login.submit"
                    journalActionLabel="pressed broker detail Login button"
                    journalActionSource="Actions"
                    unstable_pressDelay={0}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.loginBtnText}>{t('Login')}</Text>
                    )}
                  </Pressable>
                </View>

          </ScrollView>
        </KeyboardAvoidingView>

        {modalState.visible && (
          <View style={styles.modalOverlay}>
            <Pressable
              style={StyleSheet.absoluteFillObject}
              onPress={() => setModalState((p) => ({ ...p, visible: false }))}
              activateOnPressIn
              latencyLabel="brokerDetail.modal.dismiss"
              unstable_pressDelay={0}
            />
            <View style={styles.modalCard}>
              <View
                style={[
                  styles.modalIcon,
                  modalState.type === 'error' && { backgroundColor: T.trading.sell.primary },
                ]}
              >
                <Ionicons
                  name={modalState.type === 'success' ? 'checkmark' : 'close'}
                  size={28}
                  color="#FFFFFF"
                />
              </View>
              <Text style={styles.modalTitle}>{modalState.title}</Text>
              <Text style={styles.modalMessage}>{modalState.message}</Text>
            </View>
          </View>
        )}

        {/* ── Forgot password popup ── MT5 parity: no icon, left-aligned text,
            single right-aligned "Skip" action. */}
        {forgotPasswordVisible && (
          <View style={styles.modalOverlay}>
            <Pressable
              style={StyleSheet.absoluteFillObject}
              onPress={() => setForgotPasswordVisible(false)}
              activateOnPressIn
              latencyLabel="brokerDetail.forgot.dismiss"
              unstable_pressDelay={0}
            />
            <View style={styles.forgotCard}>
              <Text style={styles.forgotTitle}>{t('Forgot password?')}</Text>
              <Text style={styles.forgotBody}>
                {t('Unfortunately, the password cannot be recovered. Please open a new demo account.')}
              </Text>
              <View style={styles.forgotActions}>
                <Pressable
                  hitSlop={10}
                  onPress={() => setForgotPasswordVisible(false)}
                  activateOnPressIn
                  latencyLabel="brokerDetail.forgot.skip"
                  unstable_pressDelay={0}
                >
                  <Text style={styles.forgotSkip}>{t('Skip')}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        {/* Mount the route-local sheet only when requested; its hidden geometry
            used to add unnecessary work to the broker screen's first frame. */}
        {actionSheet !== null ? (
          <ActionSheet
            visible
            title={actionSheet.title}
            presentation={actionSheet.presentation}
            actions={actionSheet.actions}
            onClose={hideBrokerDetailActionSheet}
            searchable={actionSheet.searchable}
            searchPlaceholder={actionSheet.searchPlaceholder}
            detent={actionSheet.detent}
            minimumTopInset={actionSheet.minimumTopInset}
            instantOpen={actionSheet.instantOpen}
            runActionAfterClose={actionSheet.runActionAfterClose}
            androidKeyboardAvoidance={actionSheet.androidKeyboardAvoidance}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const MT5_BLUE = '#0a84ff';

const makeStyles = (T: ThemeColors, isDark: boolean, safeTop: number) => {
  // Pure white card surface in light mode; subtle elevated slate in dark mode.
  // Keeps the form area visually distinct from the device chrome on both themes.
  const pageBg = T.bg;
  const surface = isDark ? T.glass2 : '#FFFFFF';
  const softSurface = isDark ? 'rgba(255,255,255,0.045)' : '#F8FAFC';
  const dividerColor = isDark ? T.borderSubtle : 'rgba(15,23,42,0.08)';
  const cardBorder = isDark ? T.border : 'rgba(15,23,42,0.08)';
  const cardShadowColor = isDark ? '#000000' : '#0F172A';
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: pageBg },
    container: { flex: 1, backgroundColor: pageBg },
    scrollViewport: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: 16,
      paddingRight: 16,
      paddingTop: safeTop + 8,
      paddingBottom: 12,
      gap: 8,
      backgroundColor: pageBg,
    },
    iconBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      color: T.text,
      fontSize: 20,
      fontWeight: '500',
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 20,
      paddingBottom: 48,
      backgroundColor: pageBg,
    },
    divider: {
      height: 1,
      backgroundColor: dividerColor,
      marginHorizontal: 20,
    },
    brokerSummaryCard: {
      marginTop: 4,
      marginBottom: 10,
      padding: 14,
      borderRadius: 18,
      backgroundColor: surface,
      borderWidth: 1,
      borderColor: cardBorder,
      shadowColor: cardShadowColor,
      shadowOpacity: isDark ? 0.24 : 0.06,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: isDark ? 2 : 1,
    },
    brokerSummaryTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    brokerLogoMark: {
      width: 48,
      height: 48,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#2563EB',
    },
    brokerLogoText: {
      color: '#FFFFFF',
      fontSize: 17,
      fontWeight: '700',
      letterSpacing: 0,
    },
    brokerLogoImage: {
      width: 36,
      height: 36,
      borderRadius: 8,
    },
    brokerSummaryBody: {
      flex: 1,
      minWidth: 0,
    },
    brokerKickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      marginBottom: 4,
    },
    brokerEyebrow: {
      color: T.textMuted,
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0,
      marginBottom: 3,
    },
    brokerName: {
      color: T.text,
      fontSize: 17,
      fontWeight: '600',
      letterSpacing: 0,
    },
    brokerServerPill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      maxWidth: '100%',
      gap: 6,
      marginTop: 8,
      paddingHorizontal: 9,
      minHeight: 28,
      borderRadius: 14,
      backgroundColor: softSurface,
      borderWidth: 1,
      borderColor: dividerColor,
    },
    brokerServerLine: {
      color: T.textSub,
      flexShrink: 1,
      fontSize: 12,
      fontWeight: '700',
    },
    readyPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 9,
      minHeight: 26,
      borderRadius: 13,
      backgroundColor: isDark ? T.upGlow : T.upGlow,
    },
    readyDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: T.trading.profit,
    },
    readyText: {
      color: T.trading.profit,
      fontSize: 12,
      fontWeight: '600',
    },
    optionPanel: {
      marginBottom: 12,
      borderRadius: 18,
      backgroundColor: surface,
      borderWidth: 1,
      borderColor: cardBorder,
      shadowColor: cardShadowColor,
      shadowOpacity: isDark ? 0.18 : 0.04,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: isDark ? 2 : 1,
      overflow: 'hidden',
    },
    optionCommand: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 78,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    optionCommandPressed: {
      backgroundColor: softSurface,
    },
    optionDivider: {
      height: 1,
      marginLeft: 64,
      backgroundColor: dividerColor,
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 14,
      gap: 14,
    },
    optionRowDisabled: {
      opacity: 0.55,
    },
    optionIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionIconDemo: {
      backgroundColor: '#2563EB',
    },
    // Disabled real account still shows a pale-blue circle in MT5; only the
    // surrounding row opacity is dropped, not the brand color.
    optionIconReal: {
      backgroundColor: '#2563EB',
    },
    optionTextWrap: {
      flex: 1,
      minWidth: 0,
    },
    optionTitle: {
      color: T.text,
      fontSize: 14,
      fontWeight: '600',
      lineHeight: 18,
    },
    optionTitleDisabled: {
      color: T.textMuted,
    },
    optionSub: {
      color: T.textSub,
      fontSize: 12,
      lineHeight: 16,
      marginTop: 3,
    },
    optionSubDisabled: {
      color: T.textDimmed,
    },
    optionModePill: {
      overflow: 'hidden',
      color: '#2563EB',
      fontSize: 12,
      fontWeight: '600',
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(37,99,235,0.16)' : 'rgba(37,99,235,0.10)',
    },
    optionModePillDisabled: {
      color: T.textDimmed,
      backgroundColor: isDark ? 'rgba(148,163,184,0.10)' : 'rgba(148,163,184,0.16)',
    },
    loginPanel: {
      padding: 16,
      borderRadius: 18,
      backgroundColor: surface,
      borderWidth: 1,
      borderColor: cardBorder,
      shadowColor: cardShadowColor,
      shadowOpacity: isDark ? 0.22 : 0.06,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 },
      elevation: isDark ? 3 : 1,
    },
    panelHeader: {
      gap: 8,
      marginBottom: 16,
    },
    panelTitleTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    panelTitleRow: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    panelIconMark: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(37,99,235,0.16)' : 'rgba(37,99,235,0.10)',
    },
    panelEyebrow: {
      color: T.textMuted,
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0,
    },
    securePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 9,
      minHeight: 28,
      borderRadius: 14,
      backgroundColor: isDark ? T.upGlow : T.upGlow,
    },
    secureText: {
      color: T.trading.profit,
      fontSize: 12,
      fontWeight: '600',
    },
    sectionHeader: {
      alignItems: 'center',
      paddingVertical: 16,
    },
    sectionTitle: {
      color: T.text,
      fontSize: 17,
      fontWeight: '600',
      letterSpacing: 0,
      lineHeight: 22,
    },
    fieldGroup: {
      gap: 12,
    },
    fieldBlock: {
      gap: 7,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      minHeight: 52,
      gap: 12,
    },
    inputLabel: {
      color: T.textSub,
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0,
    },
    inputShell: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 50,
      paddingHorizontal: 13,
      borderRadius: 14,
      backgroundColor: softSurface,
      borderWidth: 1,
      borderColor: dividerColor,
    },
    input: {
      flex: 1,
      color: T.text,
      fontSize: 16,
      padding: 0,
      paddingVertical: 12,
      backgroundColor: 'transparent',
    },
    fieldIconButton: {
      width: 34,
      height: 34,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 17,
    },
    serverValue: {
      flex: 1,
      color: T.text,
      fontSize: 15,
      fontWeight: '700',
    },
    serverLogoIcon: {
      width: 22,
      height: 22,
      borderRadius: 6,
    },
    formMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginTop: 14,
      marginBottom: 14,
    },
    checkboxRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: 36,
      flexShrink: 1,
    },
    checkboxText: {
      color: T.text,
      fontSize: 13,
      fontWeight: '700',
    },
    forgotBtn: {
      paddingVertical: 8,
      flexShrink: 0,
    },
    forgotText: {
      color: primaryBlue,
      fontSize: 13,
      fontWeight: '600',
    },
    loginBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: primaryBlue,
      minHeight: 54,
      borderRadius: 16,
      shadowColor: primaryBlue,
      shadowOpacity: 0.3,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    loginBtnPressed: { opacity: 0.85 },
    loginBtnText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: 0,
    },
    modalOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
      zIndex: 999,
      elevation: 999,
    },
    modalCard: {
      width: '85%',
      maxWidth: 340,
      backgroundColor: isDark ? T.glass2 : '#FFFFFF',
      borderRadius: 24,
      padding: 24,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: isDark ? T.borderMedium : 'rgba(0,0,0,0.08)',
    },
    modalIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: '#34C759',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    modalTitle: {
      color: T.text,
      fontSize: 18,
      fontWeight: '700',
      marginBottom: 8,
    },
    modalMessage: {
      color: T.textSub,
      fontSize: 13,
      textAlign: 'center',
      lineHeight: 18,
    },
    // MT5-style "Forgot password?" card — square corners, no icon, left-aligned
    // body copy, single bottom-right Skip link.
    forgotCard: {
      width: '85%',
      maxWidth: 360,
      backgroundColor: isDark ? T.glass2 : '#FFFFFF',
      borderRadius: 6,
      paddingHorizontal: 22,
      paddingTop: 22,
      paddingBottom: 12,
      borderWidth: isDark ? 1 : 0,
      borderColor: isDark ? T.borderMedium : 'transparent',
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 6 },
      elevation: 10,
    },
    forgotTitle: {
      color: T.text,
      fontSize: 20,
      fontWeight: '600',
      marginBottom: 14,
    },
    forgotBody: {
      color: T.textSub,
      fontSize: 15,
      lineHeight: 22,
      marginBottom: 22,
    },
    forgotActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingVertical: 6,
    },
    forgotSkip: {
      color: MT5_BLUE,
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: 0,
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
  });
};

export default BrokerDetailScreen;
