import { AuthEntryScreen } from '../src/features/auth/AuthEntryScreen';
import { useIsFocused } from '@react-navigation/native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { BackHandler, StyleSheet, type GestureResponderEvent, View } from 'react-native';
import {
  brokerDetailLaunchController,
  hideBrokerDetailLaunch,
  showBrokerDetailReturnLaunch,
} from '../src/features/settings/brokerDetailLaunchController';
import { RegisterHandoffPreview } from '../src/features/settings/RegisterHandoffPreview';
import { subscribeRegisterScreenReady } from '../src/features/settings/registerHandoffState';
import { getPreloadedRegisterScreen, preloadRegisterScreen } from '../src/features/settings/registerScreenPreload';
import {
  hideRegisterLaunch,
  markRegisterLaunchRouteMounted,
  registerLaunchController,
  requestRegisterLaunchBack,
  scheduleRegisterLaunchCoverRemoval,
} from '../src/features/settings/registerLaunchController';
import {
  safeRouterBack,
  scheduleBackNavigationAfterVisualFrame,
} from '../src/utils/navigation';

type RegisterScreenComponent = React.ComponentType;

const REGISTER_ENTRY_FORM_IMPORT_DELAY_MS = 0;
const REGISTER_ENTRY_PREVIEW_READY_HIDE_DELAY_MS = 0;
const REGISTER_ENTRY_PREVIEW_FALLBACK_HIDE_DELAY_MS = 3200;
const REGISTER_BACK_FALLBACK_HREF = '/(tabs)/settings';

/**
 * Retained handoff route that opens the demo-account registration form directly.
 */
function LegacyRegisterEntryScreen() {
  const isScreenFocused = useIsFocused();
  const { origin, registerLaunchRevision } = useLocalSearchParams<{
    origin?: string;
    registerLaunchRevision?: string;
  }>();
  const returnsToBrokerDetail = origin === 'broker-detail';
  const parsedRegisterLaunchRevision = Number(registerLaunchRevision);
  const registerLaunchSnapshot = registerLaunchController.getSnapshot();
  const rootLaunchRevision = returnsToBrokerDetail
    && Number.isInteger(parsedRegisterLaunchRevision)
    && registerLaunchSnapshot.visible
    && registerLaunchSnapshot.revision === parsedRegisterLaunchRevision
    ? parsedRegisterLaunchRevision
    : null;
  const [RegisterScreen, setRegisterScreen] = React.useState<RegisterScreenComponent | null>(null);
  const [previewVisible, setPreviewVisible] = React.useState(true);
  const [rootPreviewActive, setRootPreviewActive] = React.useState(rootLaunchRevision !== null);
  const loadRegisterTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyHideTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackHideTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadRegisterFrameRef = React.useRef<number | null>(null);
  const readyUnsubscribeRef = React.useRef<(() => void) | null>(null);
  const loadCancelledRef = React.useRef(false);
  const registerScreenLoadedRef = React.useRef(false);
  const backNavigationStartedRef = React.useRef(false);

  const clearHandoffTimers = React.useCallback(() => {
    if (loadRegisterTimerRef.current) {
      clearTimeout(loadRegisterTimerRef.current);
      loadRegisterTimerRef.current = null;
    }
    if (readyHideTimerRef.current) {
      clearTimeout(readyHideTimerRef.current);
      readyHideTimerRef.current = null;
    }
    if (fallbackHideTimerRef.current) {
      clearTimeout(fallbackHideTimerRef.current);
      fallbackHideTimerRef.current = null;
    }
    if (loadRegisterFrameRef.current !== null) {
      globalThis.cancelAnimationFrame?.(loadRegisterFrameRef.current);
      loadRegisterFrameRef.current = null;
    }
    if (readyUnsubscribeRef.current) {
      readyUnsubscribeRef.current();
      readyUnsubscribeRef.current = null;
    }
  }, []);

  const scheduleRegisterScreenMount = React.useCallback((
    screenComponent: RegisterScreenComponent,
    options?: { immediate?: boolean },
  ) => {
    if (loadCancelledRef.current) {
      return;
    }

    const mountScreen = () => {
      loadRegisterTimerRef.current = null;
      if (loadCancelledRef.current) {
        return;
      }
      registerScreenLoadedRef.current = true;
      setRegisterScreen(() => screenComponent);
    };

    // Preloaded module: mount in this turn so Demo Account matches Brokers+
    // (shell already painted; form must not wait an extra rAF).
    if (options?.immediate) {
      mountScreen();
      return;
    }

    const scheduleMountTimer = () => {
      loadRegisterFrameRef.current = null;
      loadRegisterTimerRef.current = setTimeout(mountScreen, REGISTER_ENTRY_FORM_IMPORT_DELAY_MS);
    };

    if (typeof globalThis.requestAnimationFrame === 'function') {
      loadRegisterFrameRef.current = globalThis.requestAnimationFrame(scheduleMountTimer);
      return;
    }

    scheduleMountTimer();
  }, []);

  const finishRootLaunchBack = React.useCallback((revision: number) => {
    if (backNavigationStartedRef.current) return;

    const snapshot = registerLaunchController.getSnapshot();
    if (snapshot.revision !== revision || !snapshot.selection) return;

    backNavigationStartedRef.current = true;
    loadCancelledRef.current = true;
    clearHandoffTimers();
    showBrokerDetailReturnLaunch(snapshot.selection);
    hideRegisterLaunch(revision);
    scheduleBackNavigationAfterVisualFrame(() => {
      safeRouterBack(router, {
        pathname: '/settings/broker-detail',
        params: snapshot.selection ?? undefined,
      });
    });
  }, [clearHandoffTimers]);

  React.useLayoutEffect(() => {
    if (!isScreenFocused) return;

    if (rootLaunchRevision !== null) {
      const mountResult = markRegisterLaunchRouteMounted(rootLaunchRevision);
      if (mountResult === 'back-requested') {
        finishRootLaunchBack(rootLaunchRevision);
        return;
      }
    }

    if (brokerDetailLaunchController.isVisible()) {
      hideBrokerDetailLaunch();
    }
  }, [finishRootLaunchBack, isScreenFocused, rootLaunchRevision]);

  React.useEffect(() => {
    if (!isScreenFocused) {
      return undefined;
    }

    loadCancelledRef.current = false;
    backNavigationStartedRef.current = false;
    setPreviewVisible(true);
    setRootPreviewActive(rootLaunchRevision !== null);

    readyUnsubscribeRef.current = subscribeRegisterScreenReady((readyRevision) => {
      if (
        (rootLaunchRevision !== null && readyRevision !== rootLaunchRevision)
        || (rootLaunchRevision === null && readyRevision !== undefined)
      ) {
        return;
      }
      if (fallbackHideTimerRef.current) {
        clearTimeout(fallbackHideTimerRef.current);
        fallbackHideTimerRef.current = null;
      }
      if (readyHideTimerRef.current) {
        clearTimeout(readyHideTimerRef.current);
      }
      readyHideTimerRef.current = setTimeout(() => {
        readyHideTimerRef.current = null;
        if (readyUnsubscribeRef.current) {
          readyUnsubscribeRef.current();
          readyUnsubscribeRef.current = null;
        }
        setPreviewVisible(false);
        setRootPreviewActive(false);
        if (rootLaunchRevision !== null) {
          scheduleRegisterLaunchCoverRemoval(rootLaunchRevision);
        }
      }, REGISTER_ENTRY_PREVIEW_READY_HIDE_DELAY_MS);
    });

    const preloadedScreen = getPreloadedRegisterScreen();
    if (preloadedScreen) {
      scheduleRegisterScreenMount(preloadedScreen, { immediate: true });
    } else {
      // Start the import immediately (no artificial delay) so a cold tap still
      // gets the form as soon as the module resolves.
      void preloadRegisterScreen().then((screenComponent) => {
        scheduleRegisterScreenMount(screenComponent, { immediate: true });
      });
    }

    fallbackHideTimerRef.current = setTimeout(() => {
      fallbackHideTimerRef.current = null;
      if (readyUnsubscribeRef.current) {
        readyUnsubscribeRef.current();
        readyUnsubscribeRef.current = null;
      }
      if (registerScreenLoadedRef.current) {
        setPreviewVisible(false);
      } else {
        // If the heavy module fails or stalls, fall back to the local complete
        // preview before removing the root cover; Back remains actionable.
        setPreviewVisible(true);
      }
      setRootPreviewActive(false);
      if (rootLaunchRevision !== null) {
        scheduleRegisterLaunchCoverRemoval(rootLaunchRevision);
      }
    }, REGISTER_ENTRY_PREVIEW_FALLBACK_HIDE_DELAY_MS);

    return () => {
      loadCancelledRef.current = true;
      clearHandoffTimers();
    };
  }, [clearHandoffTimers, isScreenFocused, rootLaunchRevision, scheduleRegisterScreenMount]);

  const startBackToOrigin = React.useCallback(() => {
    if (backNavigationStartedRef.current) {
      return;
    }

    backNavigationStartedRef.current = true;
    loadCancelledRef.current = true;
    clearHandoffTimers();
    if (rootLaunchRevision !== null) {
      backNavigationStartedRef.current = false;
      const backResult = requestRegisterLaunchBack(rootLaunchRevision);
      if (backResult === 'pop' || backResult === 'wait' || backResult === 'handled') {
        finishRootLaunchBack(rootLaunchRevision);
        return;
      }
      if (backResult === 'cancel') {
        hideRegisterLaunch(rootLaunchRevision);
      }
      backNavigationStartedRef.current = true;
    }
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
  }, [clearHandoffTimers, finishRootLaunchBack, returnsToBrokerDetail, rootLaunchRevision]);

  const handleBack = React.useCallback((event: GestureResponderEvent) => {
    event.preventDefault();
    event.stopPropagation();
    startBackToOrigin();
  }, [startBackToOrigin]);

  React.useEffect(() => {
    if (!isScreenFocused) return undefined;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      startBackToOrigin();
      return true;
    });
    return () => subscription.remove();
  }, [isScreenFocused, startBackToOrigin]);

  // The root stack can retain this route below another screen. Preserve its
  // state, but remove the loaded registration form from the native tree until
  // this route owns focus again.
  if (!isScreenFocused) {
    return null;
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.screen}>
        {RegisterScreen ? <RegisterScreen /> : null}
        {previewVisible && !rootPreviewActive ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="auto">
            <RegisterHandoffPreview
              onBack={handleBack}
              backLatencyLabel="register.entry.back"
            />
          </View>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F2F4F8',
  },
});

export default function SharedAuthenticationEntry() { return <AuthEntryScreen form="demo" />; }

