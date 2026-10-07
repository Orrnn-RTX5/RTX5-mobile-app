import 'react-native-gesture-handler';
import '../src/utils/installRuntimeConsole';
import 'react-native-reanimated';
import { wrapWithSentry } from '../src/services/sentry';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { ThemeProvider, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { enableFreeze } from 'react-native-screens';
import { AppProviders } from '../src/state/providers/AppProviders';
import { ErrorBoundary } from '../src/ui/components/ErrorBoundary';
import { AppLogo } from '../src/ui/components/AppLogo';
import { FastPressable } from '../src/ui/components/FastPressable';
import { SidebarDrawer } from '../src/ui/components/SidebarDrawer';
import { useUserPreferences } from '../src/state/userPreferences';
import {
  ThemeModeRenderPriorityContext,
  useIsDarkTheme,
  useThemeMode,
} from '../src/state/themeMode';
import { GDark, GLight } from '../src/ui/theme/glass';
import { useTranslation } from '../src/i18n/useTranslation';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { safeRouterBack } from '../src/utils/navigation';
import { SidebarDestinationHost } from '../src/ui/components/SidebarDestinationHost';
import { BrokersLaunchHost } from '../src/features/settings/BrokersLaunchHost';
import { BrokerDetailLaunchHost } from '../src/features/settings/BrokerDetailLaunchHost';
import { RegisterLaunchHost } from '../src/features/settings/RegisterLaunchHost';
import { ChartConfigDestinationHost } from '../src/features/chart/ChartConfigDestinationHost';
import { ChartSettingsHost } from '../src/features/chart/ChartSettingsHost';
import { AboutDetailDestinationHost } from '../src/features/settings/AboutDetailDestinationHost';
import { ShakeToReportBugHost } from '../src/features/settings/shakeToReport/ShakeToReportBugHost';
import { QuoteInfoLaunchHost } from '../src/features/quotes/QuoteInfoLaunchHost';
import { HistoryFilterHost } from '../src/features/history/HistoryFilterHost';
import { TradePositionActionHost } from '../src/features/trade/TradePositionActionHost';
import { GuestFlowHost } from '../src/features/auth/GuestFlowHost';
import { ChartActionLaunchHost } from '../src/features/chart/ChartActionLaunchHost';
import { BlownAccountJournalNavigator } from '../src/features/settings/JournalScreen/BlownAccountJournalNavigator';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';

SplashScreen.preventAutoHideAsync();

enableFreeze(true);

function StartupLogoScreen() {
  return (
    <View style={styles.startupScreen}>
      <StatusBar style="light" />
      <AppLogo style={styles.startupLogo} />
    </View>
  );
}

function AppStatusBar() {
  const isDark = useIsDarkTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

/**
 * Theme-bound navigator shell only. Retained hosts stay as siblings of this
 * component so a theme tap does not reconcile every pre-mounted destination.
 */
function ThemedNavigatorShell() {
  // Keep the root navigator, screen surface, and bottom menu on one visual
  // clock. Persistence is already deferred by the preference storage adapter,
  // so delaying the visible navigation theme only creates a light/dark flash.
  const navigationThemeMode = useThemeMode();
  const isDark = navigationThemeMode === 'dark';
  const T = navigationThemeMode === 'light' ? GLight : GDark;
  const { t } = useTranslation();
  const router = useRouter();
  const chartPageScreenOptions = {
    headerShown: false,
    animation: 'none',
    freezeOnBlur: false,
    contentStyle: { backgroundColor: T.bg },
  } as const;
  const historyFilterScreenOptions = {
    headerShown: false,
    animation: 'none',
    // Keep the History tab attached behind this opaque route. Without a
    // retained previous screen, an animation-free Android pop can expose the
    // Activity and navigator backgrounds before the tab is reattached.
    presentation: 'containedTransparentModal',
    gestureEnabled: false,
    contentStyle: { backgroundColor: T.bg },
  } as const;
  const sidebarDetailScreenOptions = {
    headerShown: false,
    animation: 'none',
  } as const;
  const sidebarHeaderScreenOptions = {
    animation: 'none',
  } as const;
  const brokerFlowBackground = T.bg;
  const brokerFlowScreenOptions = {
    headerShown: false,
    animation: 'none',
    freezeOnBlur: false,
    contentStyle: { backgroundColor: brokerFlowBackground },
  } as const;
  const registerScreenOptions = {
    headerShown: false,
    animation: 'none',
    presentation: 'card',
    gestureEnabled: false,
    freezeOnBlur: false,
    contentStyle: { backgroundColor: brokerFlowBackground },
  } as const;

  return (
      <ThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: T.bg },
            headerTintColor: T.text,
            contentStyle: { backgroundColor: T.bg },
            headerTitleStyle: { fontSize: 17, fontWeight: '500' },
            headerTitleAlign: 'center',
            headerLeft: () => {
              const action = () => safeRouterBack(router, '/');
              return (
                <View style={{ width: 58, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: 12 }}>
                  <FastPressable
                    onPress={action}
                    activateOnPressIn
                    latencyLabel="stack.back"
                    hitSlop={15}
                    style={{ padding: 4 }}
                  >
                    <Ionicons name="arrow-back" size={24} color={T.text} />
                  </FastPressable>
                </View>
              );
            },
          }}
        >
          <Stack.Screen name='index' options={{ headerShown: false }} />
          <Stack.Screen name='(tabs)' options={{ headerShown: false }} />
          <Stack.Screen name='quotes/details' options={{ headerShown: false, animation: 'none' }} />
          <Stack.Screen name='quotes/market-statistics' options={{ headerShown: false, animation: 'none' }} />
          <Stack.Screen name='trade/order-ticket' options={{ headerShown: false, animation: 'none' }} />
          <Stack.Screen name='trade/one-click-terms' options={{ title: t('One Click Trading') }} />
          <Stack.Screen name='trade/close-position' options={{ headerShown: false, animation: 'none' }} />
          <Stack.Screen name='trade/close-by' options={{ headerShown: false, animation: 'none' }} />
          <Stack.Screen name='trade/modify-position' options={{ headerShown: false, animation: 'none' }} />
          <Stack.Screen name='trade/bulk' options={{ headerShown: false }} />
          <Stack.Screen name='login' options={{ title: t('Login'), headerLeft: () => null }} />
          <Stack.Screen name='register-entry' options={registerScreenOptions} />
          <Stack.Screen name='register' options={registerScreenOptions} />
          <Stack.Screen name='chart/objects' options={chartPageScreenOptions} />
          <Stack.Screen name='chart/settings' options={chartPageScreenOptions} />
          <Stack.Screen name='chart/preferences' options={chartPageScreenOptions} />
          <Stack.Screen name='chart/schema-colors' options={chartPageScreenOptions} />
          <Stack.Screen name='chart/colors' options={{ title: t('Colors') }} />
          <Stack.Screen name='chart/price-source' options={chartPageScreenOptions} />
          <Stack.Screen name='chart/open-order-mode' options={chartPageScreenOptions} />
          <Stack.Screen name='chart/calculator' options={chartPageScreenOptions} />
          <Stack.Screen name='chart/analytics' options={chartPageScreenOptions} />
          <Stack.Screen name='chart/indicators' options={chartPageScreenOptions} />
          <Stack.Screen name='chart/indicator-config' options={{ headerShown: false }} />
          <Stack.Screen name='chart/indicator-line-style' options={{ headerShown: false }} />
          <Stack.Screen name='chart/indicator-level' options={{ headerShown: false }} />
          <Stack.Screen name='chart/specification' options={chartPageScreenOptions} />
          <Stack.Screen name='chart/alerts' options={chartPageScreenOptions} />
          <Stack.Screen name='chart/menu-order' options={chartPageScreenOptions} />
          <Stack.Screen name='history/filter' options={historyFilterScreenOptions} />
          <Stack.Screen name='settings/accounts' options={{ title: t('Accounts'), ...sidebarHeaderScreenOptions }} />
          <Stack.Screen name='settings/brokers' options={brokerFlowScreenOptions} />
          <Stack.Screen name='settings/broker-detail' options={brokerFlowScreenOptions} />
          <Stack.Screen name='settings/charts' options={{ title: t('Chart Schema & Colors') }} />
          <Stack.Screen name='settings/economic-calendar' options={sidebarDetailScreenOptions} />
          <Stack.Screen name='settings/interface' options={sidebarDetailScreenOptions} />
          <Stack.Screen name='settings/journal' options={sidebarDetailScreenOptions} />
          <Stack.Screen name='settings/user-guide' options={sidebarDetailScreenOptions} />
          <Stack.Screen name='settings/help' options={sidebarDetailScreenOptions} />
          <Stack.Screen name='settings/legal' options={sidebarDetailScreenOptions} />
          <Stack.Screen name='settings/account-deletion' options={sidebarDetailScreenOptions} />
          <Stack.Screen name='settings/contact-developer' options={sidebarDetailScreenOptions} />
          <Stack.Screen name='settings/about' options={sidebarDetailScreenOptions} />
        </Stack>
      </ThemeProvider>
  );
}

function InnerLayout() {
  // No theme subscription here — retained hosts must not re-render on every
  // light/dark press just because the navigator shell did.
  return (
    <>
      <AppStatusBar />
      <BlownAccountJournalNavigator />
      <ThemedNavigatorShell />
      <ThemeModeRenderPriorityContext.Provider value="retained">
        {/* Root-level retained handoffs cover every native broker-flow route. */}
        <SidebarDestinationHost />
        {/* About row details (Privacy / Contact / Deletion) — above About host. */}
        <AboutDetailDestinationHost />
        <BrokersLaunchHost />
        {/* Properties / Market Statistics — root-level so open/back covers the stack. */}
        <QuoteInfoLaunchHost />
        {/* History clock filter — retained host like Chart options. */}
        <HistoryFilterHost />
        {/* Close / Close By / Modify — retained host (no stack push on open/back). */}
        <TradePositionActionHost />
        <ChartActionLaunchHost />
        {/* Chart Preferences + nested config rows (sidebar-style instant open/back). */}
        <ChartSettingsHost />
        <ChartConfigDestinationHost />
      </ThemeModeRenderPriorityContext.Provider>
      <SidebarDrawer />
      <ShakeToReportBugHost />
      <GuestFlowHost />
    </>
  );
}

import { brokerRealtimeService } from '../src/api/ws/BrokerRealtimeService';
import { brokerApi } from '../src/api/brokerApi';
import { accountWsService } from '../src/api/ws/accountSocket';
import { wsService } from '../src/api/ws/socket';
import { candlesWsService } from '../src/domain/candles/ws/candlesSocket';
import { useLiveAccountState } from '../src/state/liveAccountState';
import { usePositionsState } from '../src/state/positionsState';
import { useOtaUpdateOnLaunch } from '../src/utils/otaUpdates';
import { hydratePersistedCandleCache } from '../src/domain/candles/state/persistedCandleCache';
import { useDataAnalyzer } from '../src/features/chart/DataAnalyzer';
import { OtaUpdateModal } from '../src/ui/components/OtaUpdateModal';
import { scheduleAfterFirstFrame, scheduleIdleWork } from '../src/utils/startupScheduler';
import { bootstrapApp } from '../src/services/bootstrapApp';
import { installGlobalStartupErrorHandlers, logStartupDiagnostic } from '../src/utils/startupDiagnostics';
import { restoreBrokerSession } from '../src/services/brokerSessionCoordinator';
import {
  captureActiveBrokerSession,
  getActiveBrokerSessionIdentity,
  isActiveBrokerSessionCurrent,
} from '../src/state/activeBrokerSession';
import { redactDiagnosticValue } from '../src/utils/securityRedaction';

installGlobalStartupErrorHandlers();

function RootLayout() {
  const otaUpdatePrompt = useOtaUpdateOnLaunch();
  useDataAnalyzer();

  const [fontsLoaded, fontError] = useFonts({
    ...Ionicons.font,
    ...MaterialIcons.font,
  });
  // Treat a font-load *failure* as "ready" so we proceed with system-fallback
  // glyphs instead of hanging on the splash forever. useFonts leaves
  // fontsLoaded=false permanently if loadAsync rejects, and SplashScreen.hideAsync
  // is gated on it below — without this the native splash would never hide.
  const fontsReady = fontsLoaded || !!fontError;

  const hasHydrated = useUserPreferences((s) => s.hasHydrated);
  const isLoggedIn = useUserPreferences((s) => s.isLoggedIn);
  const accountDetails = useUserPreferences((s) => s.accountDetails);
  const [sessionRestoreComplete, setSessionRestoreComplete] = useState(false);
  const sessionRestoreStartedRef = useRef(false);
  const lifecycleResumeEpochRef = useRef(0);

  useEffect(() => {
    if (!hasHydrated || sessionRestoreStartedRef.current) {
      return;
    }
    sessionRestoreStartedRef.current = true;
    let cancelled = false;
    logStartupDiagnostic('auth.atomicRestore.started', {});
    void restoreBrokerSession()
      .then((result) => {
        logStartupDiagnostic('auth.atomicRestore.completed', { status: result.status });
      })
      .catch((error) => {
        // The coordinator advances the epoch and clears runtime state before a
        // restore can fail. Keep startup fail-closed and show the login shell.
        useUserPreferences.getState().logout();
        console.error(
          '[Session] Secure broker session restore failed',
          redactDiagnosticValue(error),
        );
      })
      .finally(() => {
        if (!cancelled) {
          setSessionRestoreComplete(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [hasHydrated]);

  useEffect(() => {
    logStartupDiagnostic('root.mounted', {
      hasHydrated,
      fontsReady,
      isLoggedIn,
      hasAccountDetails: Boolean(accountDetails),
      route: 'RootLayout',
    });
  }, []);

  useEffect(() => {
    if (!hasHydrated || !sessionRestoreComplete) {
      logStartupDiagnostic('storage.restore.waiting', { store: 'userPreferences' });
      return;
    }
    const { chartSymbol, chartTimeframe } = useUserPreferences.getState();
    logStartupDiagnostic('storage.restore.completed', {
      store: 'userPreferences',
      isLoggedIn,
      hasAccountDetails: Boolean(accountDetails),
      chartSymbol,
      chartTimeframe,
    });
    let cancelled = false;

    // Restore cached chart history immediately after session restore so the
    // first Chart visit can paint without waiting for idle (was 1.5s+).
    const cancelCacheHydration = scheduleAfterFirstFrame(() => {
      if (!cancelled) {
        logStartupDiagnostic('trading.candleCache.restore.started', {
          chartSymbol,
          chartTimeframe,
        });
        void hydratePersistedCandleCache(chartSymbol, chartTimeframe);
      }
    });
    return () => {
      cancelled = true;
      cancelCacheHydration();
    };
  }, [hasHydrated, sessionRestoreComplete]);

  useEffect(() => {
    if (!sessionRestoreComplete || !isLoggedIn) return;

    const suspendSocketDemand = () => {
      lifecycleResumeEpochRef.current += 1;
      brokerRealtimeService.suspend();
      accountWsService.suspend();
      candlesWsService.suspend();
      wsService.suspend();
    };

    const resumeSocketDemand = () => {
      const resumeEpoch = lifecycleResumeEpochRef.current + 1;
      lifecycleResumeEpochRef.current = resumeEpoch;
      const capture = captureActiveBrokerSession();
      if (!capture) return;
      const identity = getActiveBrokerSessionIdentity(capture.session);

      void brokerApi.getValidAccessToken(false)
        .then((accessToken) => {
          if (
            !accessToken ||
            lifecycleResumeEpochRef.current !== resumeEpoch ||
            AppState.currentState !== 'active' ||
            !isActiveBrokerSessionCurrent(identity)
          ) {
            return;
          }

          brokerRealtimeService.resume();
          accountWsService.resume();
          candlesWsService.resume();
          wsService.resume();
          return bootstrapApp({ accountLogin: identity.accountLogin });
        })
        .catch((error) => {
          // Expected when offline or the token needs a fresh login; the next
          // foreground or socket reconnect retries.
          if (typeof __DEV__ !== 'undefined' && __DEV__) {
            console.log(
              '[Lifecycle] Failed to validate broker session on foreground:',
              redactDiagnosticValue(error),
            );
          }
        });
    };

    if (AppState.currentState !== 'active') {
      suspendSocketDemand();
    } else {
      // A native cold start can report a non-active state while singleton
      // services initialize, then become active before this effect mounts.
      // Session restore has already completed, so release retained demand now.
      brokerRealtimeService.resume();
      accountWsService.resume();
      candlesWsService.resume();
      wsService.resume();
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        suspendSocketDemand();
        return;
      }
      resumeSocketDemand();
    });

    return () => {
      lifecycleResumeEpochRef.current += 1;
      subscription.remove();
    };
  }, [sessionRestoreComplete, isLoggedIn]);

  useEffect(() => {
    if (!sessionRestoreComplete) {
      return;
    }
    if (isLoggedIn) {
      logStartupDiagnostic('auth.restore.started', {
        hasAccountDetails: Boolean(accountDetails),
        accountLoginPresent: Boolean(accountDetails?.id),
      });
      let cancelled = false;

      const bootAccountData = async () => {
        if (!accountDetails?.id) return;

        const mt5Login = String(accountDetails.id).trim();
        const mt5LoginNumber = Number(mt5Login);

        if (cancelled) return;
        if (mt5Login && Number.isFinite(mt5LoginNumber) && mt5LoginNumber > 0) {
          logStartupDiagnostic('trading.bootstrap.started', {
            accountLoginPresent: true,
          });
          useLiveAccountState.getState().updateMetrics({ login: mt5LoginNumber });
          brokerRealtimeService.connect();
          void bootstrapApp({ accountLogin: mt5Login }).catch((error) => {
            if (!cancelled) {
              console.error(
                '[Bootstrap] Initial dashboard load failed:',
                redactDiagnosticValue(error),
              );
            }
            return null;
          });

          // Bootstrap seeds positions and both account caches, applies profile
          // metadata, and retries transient reads without duplicating startup.
        }
      };

      void bootAccountData();
      return () => {
        cancelled = true;
      };
    } else {
      brokerRealtimeService.disconnect();
    }
  }, [sessionRestoreComplete, isLoggedIn, accountDetails?.id]);

  useEffect(() => {
    if (hasHydrated && sessionRestoreComplete && fontsReady) {
      // Small timeout allows SafeAreaProvider to measure insets on Android
      setTimeout(() => {
        void SplashScreen.hideAsync();
      }, 100);
    }
  }, [hasHydrated, sessionRestoreComplete, fontsReady]);

  // Hard safety net: never let the native splash stay up indefinitely, even if
  // hydration or font loading wedges on some unexpected path. Reveals the
  // branded StartupLogoScreen rather than a frozen splash that looks like a crash.
  useEffect(() => {
    const fallback = setTimeout(() => {
      void SplashScreen.hideAsync();
    }, 8000);
    return () => clearTimeout(fallback);
  }, []);

  // OtaUpdateModal MUST sit outside ErrorBoundary. When the trading UI crashes
  // (e.g. 1.1.28 quote-destructure bug), ErrorBoundary replaces its children —
  // which used to unmount the install modal so users could never recover.
  return (
    <>
      <ErrorBoundary>
        <AppProviders>
          {hasHydrated && sessionRestoreComplete && fontsReady ? <InnerLayout /> : <StartupLogoScreen />}
        </AppProviders>
      </ErrorBoundary>
      <OtaUpdateModal {...otaUpdatePrompt} />
    </>
  );
}

export default wrapWithSentry(RootLayout);

const styles = StyleSheet.create({
  startupScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#121212',
  },
  startupLogo: {
    width: 160,
    height: 160,
  },
});
