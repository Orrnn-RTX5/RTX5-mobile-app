/**
 * Core User Preferences & Account Settings Screen (aka 'Settings' tab).
 *
 * Manages local user configurations (Theme, Trading defaults, API connection states)
 * and handles secure authentication workflows (Login/Logout/Disconnect).
 */
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import {
  Alert,
  Keyboard,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import { useNextFrameValue } from '../../../hooks/useNextFrameValue';
import { Screen } from '../../../ui/components/Screen';
import { AppHeader } from '../../../ui/components/AppHeader';
import { FastPressable } from '../../../ui/components/FastPressable';
import { AnimatedSlideToggle } from '../../../ui/components/AnimatedSlideToggle';
import { useUserPreferences } from '../../../state/userPreferences';
import { recordAccountJournalEvent } from '../../../state/terminalJournalState';
import { useThemeMode } from '../../../state/themeMode';
import { useUIState } from '../../../state/uiState';
import { fmt } from '../../../utils/format';
import { GDark, GLight } from '../../../ui/theme/glass';
import { useTranslation } from '../../../i18n/useTranslation';
import { SUPPORTED_LANGUAGES, translateAccountCardName } from '../../../i18n/translations';
import { useLiveAccountState } from '../../../state/liveAccountState';
import { useBrokerConfig, useBrokerServers } from '../../../query/broker';
import { ORRNN_DEMO_BROKER_ID, resolveOrrnnDemoBrokerAuthRoute } from '../../../api/publicDemo';
import { resolveAccountCompanyName } from '../accountCompanyName';
import { useBrokerSignUpGate } from '../BrokerDetailScreenRegistrationGate';
import { useAccountDetails } from '../../../query/accounts';
import { resolveAppDisplayVersion } from '../../../config/appDisplayVersion';
import { getConfiguredSupportEmail } from '../../../config/legalLinks';
import { buildHelpMailto } from '../helpViewModel';
import { primeBugReportContext } from '../bugReportRuntime';
import { hasAuthenticatedAccountSession } from '../accountConnectionStatus';
import { SettingRow } from './SettingRow';
import { LogoutConfirmation } from './LogoutConfirmation';
import { makeSettingsStyles } from './styles';
import { resolveSettingsAccountEnvironment, SETTINGS_ACCOUNT_ENVIRONMENT_BADGES } from './accountEnvironmentBadge';
import { useDeferredActiveFlag } from '../../../hooks/useDeferredActiveFlag';
import { preloadRegisterScreen } from '../registerScreenPreload';
import { warmSettingsRouteModules } from '../../../utils/settingsRouteWarmup';
import {
  showSidebarDestination,
  type SidebarHostDestination,
} from '../../../ui/components/sidebarDestinationHostController';
import { logoutBrokerSession } from '../../../services/brokerSessionCoordinator';
import { requestOneClickPreferenceChange } from '../../trade/oneClickDisableConfirmation';

const SETTINGS_ROUTE_LOCK_MS = 1800;
const SETTINGS_ROUTE_PREFETCH_DELAY_MS = 0;
const SETTINGS_REGISTER_SCREEN_PRELOAD_DELAY_MS = 0;
const SETTINGS_SCREEN_DATA_DELAY_MS = 8000;
const SETTINGS_REGISTER_ROUTE_LATENCY_BUDGET_MS = 50;
const SETTINGS_SCROLL_PRESS_RETENTION_OFFSET = { top: 8, bottom: 8, left: 18, right: 18 } as const;
const SETTINGS_READY_ROUTE_PATHS = [
  '/settings/accounts',
  '/register-entry',
  '/register',
  '/settings/economic-calendar',
  '/settings/interface',
  '/settings/journal',
  '/settings/help',
] as const;
const scheduleSettingsRouteAfterVisualFrame = (action: () => void) => {
  const runAfterFrame = () => setTimeout(action, 0);
  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(runAfterFrame);
    return;
  }
  setTimeout(action, 0);
};

type SettingsReadyRoute = (typeof SETTINGS_READY_ROUTE_PATHS)[number];
const SETTINGS_HOSTED_ROUTE_DESTINATIONS: Partial<Record<SettingsReadyRoute, SidebarHostDestination>> = {
  '/settings/accounts': 'accounts',
  '/settings/economic-calendar': 'economic-calendar',
  '/settings/journal': 'journal',
  '/settings/help': 'help',
  '/settings/interface': 'interface',
};
type PrefetchRouter = {
  prefetch?: (href: string) => void;
};
type SearchableSettingsItem = {
  title: string;
  sub: string;
  icon: string;
  routePath?: SettingsReadyRoute;
  action?: 'support-email';
};
/**
 * Main screen for the Settings tab, providing access to user profile, account management, app preferences, and support links.
 */
const SettingsScreenInner = memo(function SettingsScreenInner({ isScreenFocused }: { isScreenFocused: boolean }) {
  const { quoteSymbols, chartDrawings, oneClickAccepted, setOneClickAccepted, accountType, accountEnvironmentSource, setThemeMode, accountDetails } = useUserPreferences(
    useShallow((state) => ({
      quoteSymbols: state.quoteSymbols,
      chartDrawings: state.chartDrawings,
      oneClickAccepted: state.oneClickAccepted,
      setOneClickAccepted: state.setOneClickAccepted,
      accountType: state.accountType,
      accountEnvironmentSource: state.accountEnvironmentSource,
      setThemeMode: state.setThemeMode,
      accountDetails: state.accountDetails,
    })),
  );
  // Navigation focus (not deferred isScreenFocused) so the first Settings paint
  // after a sidebar theme tap already reads the live immediate theme store.
  const appliedThemeMode = useThemeMode();
  // Optimistic local mode: Theme switch/label flip on the press turn before
  // the rest of the app finishes adopting the new palette.
  const [pendingThemeMode, setPendingThemeMode] = useState<'light' | 'dark' | null>(null);
  const themeMode = pendingThemeMode ?? appliedThemeMode;
  const brokerId = useUserPreferences((s) => s.brokerId);
  const isLoggedIn = useUserPreferences((s) => s.isLoggedIn);
  const isAccountConnected = hasAuthenticatedAccountSession(isLoggedIn, accountDetails);
  // Contract v3: "New Account" opens Orrnn demo registration, so it follows
  // that broker's public /broker/config demo_registration_enabled flag.
  const { data: signUpBrokerServers } = useBrokerServers(isScreenFocused);
  const demoSignUpServerUrl = useMemo(
    () => resolveOrrnnDemoBrokerAuthRoute(ORRNN_DEMO_BROKER_ID, signUpBrokerServers ?? []).serverUrl,
    [signUpBrokerServers],
  );
  const showNewAccountEntry = useBrokerSignUpGate(demoSignUpServerUrl).demo;
  const warmRegisterScreen = useCallback(() => {
    void preloadRegisterScreen().catch(() => undefined);
  }, []);
  const scheduleRegisterScreenWarmupAfterTouch = useCallback(() => {
    scheduleSettingsRouteAfterVisualFrame(warmRegisterScreen);
  }, [warmRegisterScreen]);
  const liveLogin = useLiveAccountState((s) => s.login);
  const liveBalance = useLiveAccountState((s) => s.balance);
  const liveHasBalance = useLiveAccountState((s) => s.metricFlags.balance);
  const [firstPaintReady, setFirstPaintReady] = useState(false);

  useEffect(() => {
    if (pendingThemeMode !== null && pendingThemeMode === appliedThemeMode) {
      setPendingThemeMode(null);
    }
  }, [appliedThemeMode, pendingThemeMode]);
  useEffect(() => {
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

  // Let the Settings route paint before starting account-card queries.
  const settingsDataActive = useDeferredActiveFlag(
    isAccountConnected && isScreenFocused && firstPaintReady,
    SETTINGS_SCREEN_DATA_DELAY_MS,
  );
  const { data: brokerConfig } = useBrokerConfig(brokerId, settingsDataActive);
  const currentLogin = accountDetails?.id ? Number(accountDetails.id) : undefined;
  const activeLogin = currentLogin;
  const { data: activeAccountDetails } = useAccountDetails(activeLogin, settingsDataActive && !!activeLogin);
  const activeAccount = activeAccountDetails;
  const accountEnvironment = resolveSettingsAccountEnvironment(activeAccount, {
    accountType,
    source: accountEnvironmentSource,
  });
  const accountEnvironmentBadge = SETTINGS_ACCOUNT_ENVIRONMENT_BADGES[accountEnvironment];
  // Seed the prominent account name from the login-available name so it shows
  // immediately instead of flashing the generic "Account" until the query lands.
  const rawAccountName = activeAccount?.name ?? accountDetails?.name ?? 'Account';
  const displayEmail = accountDetails?.name ?? '---';
  const fallbackBalance = activeAccount?.balance;
  const liveMatchesActiveAccount = liveLogin !== 0 && (!activeAccount || liveLogin === activeAccount.login);
  const balanceToDisplay = liveHasBalance && liveMatchesActiveAccount ? liveBalance : fallbackBalance;
  const displayBalance = balanceToDisplay !== undefined ? fmt.price(balanceToDisplay) : '---';
  const displayCurrency = activeAccount?.currency ?? 'USD';
  const displayBrokerName = resolveAccountCompanyName(brokerConfig?.broker_name, brokerId);
  const setSearchActive = useUIState((s) => s.setSearchActive);
  // Drive Settings chrome from optimistic themeMode so the screen flips in the
  // same press turn as the switch.
  const T = useMemo(
    () => (themeMode === 'light' ? GLight : GDark),
    [themeMode],
  );
  const { t, language } = useTranslation();
  const handleOneClickPreferenceChange = useCallback((nextEnabled: boolean) => {
    requestOneClickPreferenceChange({
      nextEnabled,
      translate: t,
      commit: setOneClickAccepted,
      showAlert: (title, message, buttons) => Alert.alert(title, message, buttons),
    });
  }, [setOneClickAccepted, t]);
  const displayAccountName = translateAccountCardName(rawAccountName, t);
  const currentLanguageNative = SUPPORTED_LANGUAGES.find((l) => l.code === language)?.nativeName ?? 'English';
  const supportEmail = getConfiguredSupportEmail();
  const appName = Constants.expoConfig?.name ?? 'RTX5';
  const nativeAppVersion = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? 'Local';
  const appBuildVersion = Application.nativeBuildVersion ?? Constants.nativeBuildVersion ?? '';
  const appVersion = resolveAppDisplayVersion(nativeAppVersion);
  const styles = useMemo(() => makeSettingsStyles(T, themeMode), [T, themeMode]);
  const settingsAccent = themeMode === 'dark' ? '#347DFF' : '#1D4ED8';
  const settingsAccentActive = themeMode === 'dark' ? '#347DFF' : '#3B82F6';
  const settingsAccentBg = themeMode === 'dark' ? '#1E1E1E' : 'rgba(29, 78, 216, 0.1)';
  const settingsSwitchTrack = themeMode === 'dark' ? 'rgba(52, 125, 255, 0.46)' : 'rgba(59, 130, 246, 0.5)';
  const settingsSwitchOffTrack = themeMode === 'dark' ? 'rgba(255, 255, 255, 0.18)' : T.borderMedium;
  const settingsSwitchThumbInactive = themeMode === 'dark' ? '#FFFFFF' : '#f4f3f4';
  const settingsDanger = themeMode === 'dark' ? '#FF5A5F' : '#EF4444';
  const renderDarkCardHighlight = () => themeMode === 'dark' ? (
    <LinearGradient
      pointerEvents="none"
      colors={['rgba(255,255,255,0.035)', 'rgba(255,255,255,0)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={StyleSheet.absoluteFillObject}
    />
  ) : null;
  const applyThemeMode = useCallback((nextMode: 'light' | 'dark') => {
    if (themeMode === nextMode && appliedThemeMode === nextMode) {
      return;
    }
    setPendingThemeMode(nextMode);
    setThemeMode(nextMode);
  }, [appliedThemeMode, setThemeMode, themeMode]);
  const toggleThemeMode = useCallback(() => {
    applyThemeMode(themeMode === 'light' ? 'dark' : 'light');
  }, [applyThemeMode, themeMode]);

  void activeAccount;

  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const routeLockRef = useRef(false);
  const routeUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [logoutConfirmationVisible, setLogoutConfirmationVisible] = useState(false);
  const logoutConfirmationActiveRef = useRef(false);
  const cancelLogout = () => {
    logoutConfirmationActiveRef.current = false;
    setLogoutConfirmationVisible(false);
  };
  useEffect(() => {
    if (!isScreenFocused) {
      logoutConfirmationActiveRef.current = false;
      setLogoutConfirmationVisible(false);
    }
  }, [isScreenFocused]);

  /**
   * Callback triggered when the user requests to sign out of their current active account.
   */
  const handleLogout = () => {
    logoutConfirmationActiveRef.current = true;
    setLogoutConfirmationVisible(true);
  };

  const confirmLogout = () => {
    if (!logoutConfirmationActiveRef.current) return;
    logoutConfirmationActiveRef.current = false;
    setLogoutConfirmationVisible(false);
    const accountLoginForJournal = accountDetails?.id;
    // Invalidate synchronously and restore the selected broker's guest market.
    const cleanup = logoutBrokerSession();
    router.replace('/(tabs)/quotes');
    void cleanup
      .then(() => {
        recordAccountJournalEvent('logged out from current account', {
          level: 'success',
          accountLogin: accountLoginForJournal,
        });
      })
      .catch((error) => {
        console.error('[Settings] Secure logout cleanup failed', error);
      });
  };
  const searchInputRef = useRef<TextInput>(null);

  useEffect(() => {
    return () => {
      setSearchActive(false);
      if (routeUnlockTimerRef.current) {
        clearTimeout(routeUnlockTimerRef.current);
        routeUnlockTimerRef.current = null;
      }
    };
  }, [setSearchActive]);

  useEffect(() => {
    if (!isScreenFocused) {
      return;
    }

    routeLockRef.current = false;
    if (routeUnlockTimerRef.current) {
      clearTimeout(routeUnlockTimerRef.current);
      routeUnlockTimerRef.current = null;
    }
  }, [isScreenFocused]);

  useEffect(() => {
    if (!isScreenFocused) {
      return undefined;
    }

    const prefetch = (router as PrefetchRouter).prefetch;
    if (typeof prefetch !== 'function') {
      return undefined;
    }

    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let frameId: number | null = null;

    const warmRoutes = () => {
      timerId = setTimeout(() => {
        timerId = null;
        if (cancelled) {
          return;
        }
        SETTINGS_READY_ROUTE_PATHS.forEach((routePath) => {
          try {
            prefetch(routePath);
          } catch {
            // Expo Router prefetch can throw before a dev-client route is registered.
          }
        });
      }, SETTINGS_ROUTE_PREFETCH_DELAY_MS);
    };

    if (typeof globalThis.requestAnimationFrame === 'function') {
      frameId = globalThis.requestAnimationFrame(() => {
        frameId = null;
        warmRoutes();
      });
    } else {
      timerId = setTimeout(warmRoutes, 16);
    }

    return () => {
      cancelled = true;
      if (timerId) {
        clearTimeout(timerId);
      }
      if (frameId !== null) {
        globalThis.cancelAnimationFrame?.(frameId);
      }
    };
  }, [isScreenFocused]);

  useEffect(() => {
    if (!isScreenFocused) {
      return;
    }

    warmSettingsRouteModules();
  }, [isScreenFocused]);

  useEffect(() => {
    if (!isScreenFocused) {
      return undefined;
    }

    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let frameId: number | null = null;

    const scheduleRegisterScreenWarmup = () => {
      timerId = setTimeout(() => {
        timerId = null;
        if (!cancelled) {
          warmRegisterScreen();
        }
      }, SETTINGS_REGISTER_SCREEN_PRELOAD_DELAY_MS);
    };

    if (typeof globalThis.requestAnimationFrame === 'function') {
      frameId = globalThis.requestAnimationFrame(() => {
        frameId = null;
        scheduleRegisterScreenWarmup();
      });
    } else {
      timerId = setTimeout(scheduleRegisterScreenWarmup, 16);
    }

    return () => {
      cancelled = true;
      if (timerId) {
        clearTimeout(timerId);
      }
      if (frameId !== null) {
        globalThis.cancelAnimationFrame?.(frameId);
      }
    };
  }, [isScreenFocused, warmRegisterScreen]);

  const unlockSettingsRoute = useCallback(() => {
    if (routeUnlockTimerRef.current) {
      clearTimeout(routeUnlockTimerRef.current);
    }
    routeUnlockTimerRef.current = setTimeout(() => {
      routeLockRef.current = false;
      routeUnlockTimerRef.current = null;
    }, SETTINGS_ROUTE_LOCK_MS);
  }, []);

  const prepareReadySettingsRoute = useCallback((routePath: SettingsReadyRoute) => {
    if (routePath === '/register-entry' || routePath === '/register') {
      scheduleRegisterScreenWarmupAfterTouch();
      return;
    }

    warmSettingsRouteModules();
  }, [scheduleRegisterScreenWarmupAfterTouch]);

  const openReadySettingsRoute = useCallback((routePath: SettingsReadyRoute) => {
    if (routeLockRef.current) {
      return;
    }

    routeLockRef.current = true;
    const hostedDestination = SETTINGS_HOSTED_ROUTE_DESTINATIONS[routePath];
    if (hostedDestination && showSidebarDestination(hostedDestination, 'settings')) {
      // A hosted page does not blur Settings, so release this local guard now.
      routeLockRef.current = false;
      return;
    }

    const isRegisterRoute = routePath === '/register-entry' || routePath === '/register';
    prepareReadySettingsRoute(routePath);
    // Push (never replace): keep the (tabs) navigator — and the pre-warmed chart
    // WebView — mounted underneath, so BACK is an instant pop instead of a full
    // tab re-mount (which froze the screen ~1.8s).
    router.push(routePath as any);
    if (isRegisterRoute) {
      warmRegisterScreen();
    }
    unlockSettingsRoute();
  }, [prepareReadySettingsRoute, unlockSettingsRoute, warmRegisterScreen]);

  const enableSearch = () => {
    setIsSearching(true);
    setSearchActive(true);
    setTimeout(() => searchInputRef.current?.focus(), 0);
  };

  const disableSearch = () => {
    setIsSearching(false);
    setSearchActive(false);
    setSearchQuery('');
    Keyboard.dismiss();
  };

  /**
   * Callback triggered to open the native email client pre-filled with the customer support address.
   */
  const handleEmailSupport = useCallback(async () => {
    const mailtoUrl = buildHelpMailto({
      appName,
      appVersion,
      appBuildVersion,
      platform: Platform.OS,
      supportEmail,
    });

    try {
      await Linking.openURL(mailtoUrl);
    } catch {
      Alert.alert('Email support', `Please email ${supportEmail} from your mail app.`);
    }
  }, [appBuildVersion, appName, appVersion, supportEmail]);

  const SEARCHABLE_ITEMS = useMemo<SearchableSettingsItem[]>(() => ([
    { title: 'Accounts', sub: 'Manage trading accounts', icon: 'server-outline', routePath: '/settings/accounts' },
    { title: 'New Account', sub: '', icon: 'person-outline', routePath: '/register-entry' },
    { title: 'Economic Calender', sub: '', icon: 'calendar-outline', routePath: '/settings/economic-calendar' },
    { title: 'Theme', sub: themeMode === 'light' ? 'Light Mode' : 'Dark Mode', icon: 'contrast-outline' },
    { title: 'Language Preference', sub: currentLanguageNative, icon: 'language-outline', routePath: '/settings/interface' },
    { title: 'Journal', sub: 'Activity log', icon: 'reader-outline', routePath: '/settings/journal' },
    { title: 'Support', sub: supportEmail, icon: 'headset-outline', action: 'support-email' },
    { title: 'Help', sub: 'FAQ', icon: 'information-circle-outline', routePath: '/settings/help' },
  ] satisfies SearchableSettingsItem[]).filter((item) => showNewAccountEntry || item.routePath !== '/register-entry'),
  [currentLanguageNative, showNewAccountEntry, supportEmail, themeMode]);

  const searchResults = useMemo(() => {
    if (!searchQuery) return SEARCHABLE_ITEMS;
    const q = searchQuery.toLowerCase();
    return SEARCHABLE_ITEMS.filter((it) => (
      it.title.toLowerCase().includes(q) ||
      it.sub.toLowerCase().includes(q) ||
      t(it.title).toLowerCase().includes(q) ||
      t(it.sub).toLowerCase().includes(q)
    ));
  }, [searchQuery, SEARCHABLE_ITEMS, t]);

  /**
   * Callback triggered when a user taps a result from the in-app settings search bar, navigating them to the relevant screen.
   */
  const handleSearchResultPress = useCallback((item: SearchableSettingsItem) => {
    if (!item.routePath && !item.action) {
      return;
    }

    setIsSearching(false);
    setSearchActive(false);
    setSearchQuery('');
    Keyboard.dismiss();

    if (item.action === 'support-email') {
      void handleEmailSupport();
      return;
    }

    if (item.routePath) {
      openReadySettingsRoute(item.routePath);
    }
  }, [handleEmailSupport, openReadySettingsRoute, setSearchActive]);

  const searchBarStyle: any = themeMode === 'dark' ? {
    backgroundColor: '#1E1E1E',
    borderColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1, borderRadius: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.24, shadowRadius: 12, elevation: 4,
  } : {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderColor: 'rgba(0, 0, 0, 0.08)',
    borderWidth: 1, borderRadius: 24,
  };

  return (
    <Screen noBottomInset style={styles.screen}>
      <View style={styles.headerWrap}>
        <AppHeader
          title={t('Settings')}
          noBorder
          paddingBottom={isSearching ? 8 : 12}
          rightActions={
            !isSearching ? (
              <FastPressable onPress={enableSearch} latencyLabel="settings.search.open" hitSlop={12}>
                <Ionicons name="search" size={22} color={T.textMuted} />
              </FastPressable>
            ) : null
          }
        />
        {isSearching && (
          <View style={styles.searchBarWrap}>
            <View style={[styles.searchBar, searchBarStyle]}>
              <Ionicons name="search" size={20} color={T.textMuted} />
              <TextInput
                ref={searchInputRef}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={t('Search settings')}
                placeholderTextColor={themeMode === 'dark' ? 'rgba(235,235,245,0.46)' : T.textMuted}
                style={[{ flex: 1, color: T.text, fontSize: 15, fontWeight: '500' }, { outlineStyle: 'none' } as any]}
                autoCapitalize="none"
                returnKeyType="search"
              />
              <FastPressable onPress={disableSearch} latencyLabel="settings.search.close" hitSlop={10}>
                <Ionicons name="close-circle" size={18} color={T.textMuted} />
              </FastPressable>
            </View>
          </View>
        )}
      </View>

      <ScrollView
        keyboardShouldPersistTaps="always"
        canCancelContentTouches={Platform.OS === 'ios'}
        removeClippedSubviews={Platform.OS === 'android'}
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Search results overlay — kept mounted alongside the main settings
            tree so the Pressables in the main tree don't lose their refs (and
            their guard state) every time the user opens/closes search. */}
        {isSearching ? (
          <View style={{ paddingHorizontal: 16 }} pointerEvents="auto">
            <View style={[styles.groupCard, styles.cardShadow, { marginTop: 8, marginHorizontal: 0 }]}>
              {renderDarkCardHighlight()}
              {searchResults.length > 0 ? searchResults.map((item, index) => {
                const isThemeItem = item.title === 'Theme';
                const routePath = item.routePath;

                return (
                <View key={item.title}>
                  <SettingRow
                    T={T}
                    styles={styles}
                    icon={item.icon as any}
                    color={settingsAccent}
                    title={t(item.title)}
                    sub={item.sub ? t(item.sub) : item.sub}
                    rightElement={
                      isThemeItem ? (
                        <View pointerEvents="none">
                          <AnimatedSlideToggle
                            testID="settings-search-theme-toggle"
                            value={themeMode === 'light'}
                            onTrackColor={settingsSwitchTrack}
                            offTrackColor={settingsSwitchOffTrack}
                            onThumbColor="#3b82f6"
                            offThumbColor={settingsSwitchThumbInactive}
                          />
                        </View>
                      ) : undefined
                    }
                    onPress={isThemeItem ? toggleThemeMode : routePath || item.action ? () => handleSearchResultPress(item) : undefined}
                    onPressIn={routePath ? () => prepareReadySettingsRoute(routePath) : undefined}
                  />
                  {index < searchResults.length - 1 && <View style={styles.dividerInner} />}
                </View>
                );
              }) : (
                <View style={{ paddingTop: 60, paddingBottom: 60, alignItems: 'center' }}>
                  <Ionicons name="search-outline" size={48} color={T.borderMedium} />
                  <Text style={{ color: T.textMuted, marginTop: 16, fontSize: 16 }}>{t('No settings found matching')} "{searchQuery}"</Text>
                </View>
              )}
            </View>
          </View>
        ) : null}
        <View
          style={{ display: isSearching ? 'none' : 'flex' }}
          pointerEvents={isSearching ? 'none' : 'auto'}
        >
            {isAccountConnected ? (
              <FastPressable
                onPress={() => openReadySettingsRoute('/settings/accounts')}
                onPressIn={() => prepareReadySettingsRoute('/settings/accounts')}
                pressRetentionOffset={SETTINGS_SCROLL_PRESS_RETENTION_OFFSET}
                unstable_pressDelay={0}
                android_ripple={{ color: 'rgba(255,255,255,0.14)' }}
                latencyLabel="settings.accounts.open"
                latencyBudgetMs={SETTINGS_REGISTER_ROUTE_LATENCY_BUDGET_MS}
              >
                <View style={[styles.accountCard, styles.cardShadow]}>
                  <View style={[styles.ribbonContainer, { backgroundColor: accountEnvironmentBadge.backgroundColor }]}>
                    <Text style={[styles.ribbonText, { color: accountEnvironmentBadge.color }]}>
                      {t(accountEnvironmentBadge.label)}
                    </Text>
                  </View>

                  <LinearGradient
                    pointerEvents="none"
                    colors={themeMode === 'light' ? ['#4F46E5', '#3730A3'] : ['#1E1E1E', '#1E1E1E']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFillObject}
                  />
                  <View style={[styles.cardBubbleLeft, { backgroundColor: themeMode === 'light' ? '#6366F1' : '#0F162A' }]} />
                  <View style={[styles.cardBubbleRight, { backgroundColor: themeMode === 'light' ? '#818CF8' : '#060B18' }]} />

                  <View style={styles.accTopRow}>
                    <Text style={[styles.accEmail, themeMode === 'light' && { color: 'rgba(255,255,255,0.9)' }]} ellipsizeMode="tail" numberOfLines={1}>
                      {displayEmail}
                    </Text>
                  </View>

                  <Text
                    style={[styles.accName, themeMode === 'light' && { color: '#FFFFFF' }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.82}
                  >
                    {displayAccountName}
                  </Text>
                  <Text
                    style={[styles.accBalance, themeMode === 'light' && { color: '#FFFFFF' }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.78}
                  >
                    {displayBalance} <Text style={[styles.accCurrency, themeMode === 'light' && { color: 'rgba(255,255,255,0.8)' }]}>{displayCurrency}</Text>
                  </Text>

                  <View style={styles.accDivider} />

                  <View style={styles.accDetailsWrap}>
                    {displayBrokerName ? (
                      <Text style={styles.accCompany} numberOfLines={1} ellipsizeMode="tail">
                        {displayBrokerName}
                      </Text>
                    ) : null}
                    <View style={styles.accServerRow}>
                      <Text style={[styles.accServer, themeMode === 'light' && { color: 'rgba(255,255,255,0.8)' }]} numberOfLines={1}>
                        #{accountDetails?.id || '---'}
                      </Text>
                      <Text style={[styles.accServer, themeMode === 'light' && { color: 'rgba(255,255,255,0.8)' }]} numberOfLines={1}>
                        {accountDetails?.server || t('Server')}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.chipRow}>
                    <View style={styles.chip}>
                      <Ionicons name="server-outline" size={12} color="#FFFFFF" />
                      <Text style={[styles.chipText, { color: '#FFFFFF' }]} numberOfLines={1}>
                        {accountDetails?.server || t('Server')}
                      </Text>
                    </View>
                    <View style={styles.chip}>
                      <Ionicons name="shield-checkmark-outline" size={12} color="#FFFFFF" />
                      <Text style={[styles.chipText, { color: '#FFFFFF' }]} numberOfLines={1}>
                        {t('Secure')}
                      </Text>
                    </View>
                  </View>
                </View>
              </FastPressable>
            ) : null}

            {/* Quotes / Drawings / One-Click dashboard — part of the connected
                account section, so it only renders once a real login session is
                active (matches the account card gate above). Hidden when logged
                out so it doesn't float at the top without account context. */}
            {isAccountConnected ? (
            <View style={styles.metricsRow}>
              <View style={styles.metricBlock}>
                {renderDarkCardHighlight()}
                <View style={styles.metricTopRow}>
                  <View style={styles.metricIconCircle}>
                    <Ionicons name="list" size={18} color={settingsAccent} />
                  </View>
                  <Text style={styles.metricLabel}>{t('Quotes')}</Text>
                </View>
                <Text style={styles.metricValue}>{quoteSymbols?.length || 0}</Text>
              </View>

              <View style={styles.metricBlock}>
                {renderDarkCardHighlight()}
                <View style={styles.metricTopRow}>
                  <View style={styles.metricIconCircle}>
                    <Ionicons name="analytics" size={18} color={settingsAccent} />
                  </View>
                  <Text style={styles.metricLabel}>{t('Drawings')}</Text>
                </View>
                <Text style={styles.metricValue}>{chartDrawings?.length || 0}</Text>
              </View>

              <View style={styles.metricBlock}>
                {renderDarkCardHighlight()}
                <View style={styles.metricTopRow}>
                  <View style={[styles.metricIconCircle, oneClickAccepted && styles.metricIconCircleActive]}>
                    <Ionicons name="flash" size={18} color={oneClickAccepted ? settingsAccentActive : settingsAccent} />
                  </View>
                  <Text style={styles.metricLabel}>{t('One-Click')}</Text>
                </View>
                <View style={styles.toggleRow}>
                  <Text style={[styles.toggleText, oneClickAccepted && { color: settingsAccentActive }]}>{oneClickAccepted ? t('On') : t('Off')}</Text>
                  <Switch
                    value={oneClickAccepted}
                    onValueChange={handleOneClickPreferenceChange}
                    trackColor={{ false: settingsSwitchOffTrack, true: settingsSwitchTrack }}
                    thumbColor={oneClickAccepted ? settingsAccentActive : settingsSwitchThumbInactive}
                    style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
                    {...({ activeThumbColor: settingsAccentActive, activeTrackColor: settingsSwitchTrack, thumbTintColor: oneClickAccepted ? settingsAccentActive : settingsSwitchThumbInactive } as any)}
                  />
                </View>
              </View>
            </View>
            ) : null}

            {showNewAccountEntry ? (
            <Text style={styles.sectionTitle}>{t('TRADING & ACCOUNT')}</Text>
            ) : null}
            {showNewAccountEntry ? (
            <FastPressable
              style={({ pressed }) => [
                styles.singleRowCard,
                styles.cardShadow,
                pressed && styles.singleRowCardPressed,
              ]}
              onPress={() => openReadySettingsRoute('/register-entry')}
              onPressIn={() => prepareReadySettingsRoute('/register-entry')}
              pressRetentionOffset={SETTINGS_SCROLL_PRESS_RETENTION_OFFSET}
              android_ripple={{ color: settingsAccentBg }}
              unstable_pressDelay={0}
              latencyLabel="settings.register.open"
              latencyBudgetMs={SETTINGS_REGISTER_ROUTE_LATENCY_BUDGET_MS}
            >
              {renderDarkCardHighlight()}
              <View style={[styles.iconBox, { backgroundColor: settingsAccentBg }]}>
                <Ionicons name="person-outline" size={20} color={settingsAccent} />
              </View>
              <Text style={styles.rowTitleSingle}>{t('New Account')}</Text>
              <Ionicons name="chevron-forward" size={16} color={T.textMuted} />
            </FastPressable>
            ) : null}

            <Text style={styles.sectionTitle}>{t('MARKET UPDATES')}</Text>
            <View style={[styles.groupCard, styles.cardShadow]}>
              {renderDarkCardHighlight()}
              <SettingRow
                T={T}
                styles={styles}
                icon="calendar-outline"
                color={settingsAccent}
                title={t('Economic Calender')}
                sub=""
                onPress={() => openReadySettingsRoute('/settings/economic-calendar')}
                onPressIn={() => prepareReadySettingsRoute('/settings/economic-calendar')}
              />
            </View>

            <Text style={styles.sectionTitle}>{t('PREFERENCES & TOOLS')}</Text>
            <View style={[styles.groupCard, styles.cardShadow]}>
              {renderDarkCardHighlight()}
              <SettingRow
                T={T}
                styles={styles}
                icon="contrast-outline"
                color={settingsAccent}
                title={t('Theme')}
                sub={themeMode === 'light' ? t('Light Mode') : t('Dark Mode')}
                onPress={toggleThemeMode}
                rightElement={
                  <View pointerEvents="none">
                    <AnimatedSlideToggle
                      testID="settings-theme-toggle"
                      value={themeMode === 'light'}
                      onTrackColor={settingsSwitchTrack}
                      offTrackColor={settingsSwitchOffTrack}
                      onThumbColor="#3b82f6"
                      offThumbColor={settingsSwitchThumbInactive}
                    />
                  </View>
                }
              />
              <View style={styles.dividerInner} />
              <SettingRow
                T={T}
                styles={styles}
                icon="language-outline"
                color={settingsAccent}
                title={t('Language Preference')}
                sub={currentLanguageNative}
                onPress={() => openReadySettingsRoute('/settings/interface')}
                onPressIn={() => prepareReadySettingsRoute('/settings/interface')}
              />
              <View style={styles.dividerInner} />
              <SettingRow
                T={T}
                styles={styles}
                icon="reader-outline"
                color={settingsAccent}
                title={t('Journal')}
                sub="Activity log"
                onPress={() => openReadySettingsRoute('/settings/journal')}
                onPressIn={() => prepareReadySettingsRoute('/settings/journal')}
              />
            </View>

            <Text style={styles.sectionTitle}>{t('SUPPORT & HELP')}</Text>
            <View style={[styles.groupCard, styles.cardShadow]}>
              {renderDarkCardHighlight()}
              <SettingRow T={T} styles={styles} icon="headset-outline" color={settingsAccent} title={t('Support')} sub={supportEmail} onPress={handleEmailSupport} />
              <View style={styles.dividerInner} />
              <SettingRow T={T} styles={styles} icon="bug-outline" color={settingsAccent} title={t('Report a Bug')} sub={t('Tell us what went wrong')} onPress={() => { primeBugReportContext('/settings'); router.push('/settings/contact-developer'); }} />
              <View style={styles.dividerInner} />
              <SettingRow
                T={T}
                styles={styles}
                icon="information-circle-outline"
                color={settingsAccent}
                title={t('Help')}
                sub={t('FAQ')}
                onPress={() => openReadySettingsRoute('/settings/help')}
                onPressIn={() => prepareReadySettingsRoute('/settings/help')}
              />
            </View>

            <View style={styles.logoutContainer}>
              <FastPressable
                style={({ pressed }) => [
                  styles.singleRowCardLogout,
                  pressed && styles.singleRowCardLogoutPressed,
                ]}
                onPress={handleLogout}
                latencyLabel="settings.logout.prompt"
                android_ripple={{ color: 'rgba(239, 68, 68, 0.16)' }}
              >
                {renderDarkCardHighlight()}
                <View style={[styles.iconBox, { backgroundColor: themeMode === 'dark' ? '#1E1E1E' : 'rgba(239, 68, 68, 0.1)' }]}>
                  <Ionicons name="log-out-outline" size={20} color={settingsDanger} />
                </View>
                <Text style={[styles.rowTitleSingle, { color: settingsDanger }]}>{t('Logout')}</Text>
              </FastPressable>
            </View>
        </View>
      </ScrollView>
      <LogoutConfirmation
        visible={logoutConfirmationVisible && isScreenFocused}
        T={T}
        onCancel={cancelLogout}
        onConfirm={confirmLogout}
      />
    </Screen>
  );
});

export function SettingsScreen() {
  const isScreenFocused = useIsFocused();
  const deferredScreenFocused = useNextFrameValue(isScreenFocused);
  return <SettingsScreenInner isScreenFocused={deferredScreenFocused} />;
}
