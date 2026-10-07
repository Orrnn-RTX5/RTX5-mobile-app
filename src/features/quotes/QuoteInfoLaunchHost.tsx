import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { BackHandler, StyleSheet, type ViewProps } from 'react-native';
import Animated, {
  executeOnUIRuntimeSync,
  makeMutable,
  useAnimatedProps,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { QuoteInfoLaunchShell } from './QuoteInfoLaunchShell';
import {
  quoteInfoLaunchController,
  type QuoteInfoLaunchDestination,
} from './quoteInfoLaunchController';
import {
  safeRouterBack,
  scheduleBackNavigationAfterVisualFrame,
} from '../../utils/navigation';

type QuoteInfoLaunchHostGlobal = typeof globalThis & {
  __rtx5QuoteInfoLaunchDestination?: SharedValue<number>;
};

const hostGlobal = globalThis as QuoteInfoLaunchHostGlobal;
const quoteInfoLaunchDestination =
  hostGlobal.__rtx5QuoteInfoLaunchDestination ?? makeMutable(0);
hostGlobal.__rtx5QuoteInfoLaunchDestination = quoteInfoLaunchDestination;

const destinationToIndex = (
  destination: QuoteInfoLaunchDestination | null,
) => {
  if (destination === 'properties') return 1;
  if (destination === 'market-statistics') return 2;
  return 0;
};

function writeQuoteInfoLaunchDestinationNow(
  destination: QuoteInfoLaunchDestination | null,
) {
  const nextValue = destinationToIndex(destination);
  try {
    executeOnUIRuntimeSync((value: number) => {
      'worklet';
      quoteInfoLaunchDestination.value = value;
    })(nextValue);
  } catch (error) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[QuoteInfoLaunch] sync UI write unavailable, using async fallback:', error);
    }
    quoteInfoLaunchDestination.value = nextValue;
  }
}

/**
 * New-Order-class retained host for Properties and Market Statistics.
 *
 * Critical for speed (same model as OrderTicketLaunchHost):
 * - Keep TWO lightweight shell headers mounted (never mount full screens here)
 * - Tap flips a UI-thread shared value → opacity before React adopts the body
 * - prepare() already set the symbol while the action sheet was open
 * - Full interactive routes load behind the shell after the press paint
 */
export function QuoteInfoLaunchHost() {
  const router = useRouter();
  const backInFlightRef = useRef(false);
  const backGuardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshot = useSyncExternalStore(
    quoteInfoLaunchController.subscribe,
    quoteInfoLaunchController.getSnapshot,
    quoteInfoLaunchController.getSnapshot,
  );

  // Host visibility — driven purely by UI-thread shared value for the open frame.
  // Root-level elevation must sit above the Stack so open AND back covers work
  // (tabs-level hosts sat under /quotes/* and could not cover on Back).
  const hostAnimatedStyle = useAnimatedStyle(() => {
    const visible = quoteInfoLaunchDestination.value !== 0;
    return {
      elevation: visible ? 48 : 0,
      opacity: visible ? 1 : 0,
      zIndex: visible ? 48 : 0,
    };
  });
  const hostAnimatedProps = useAnimatedProps<ViewProps>(() => ({
    pointerEvents: quoteInfoLaunchDestination.value !== 0 ? 'auto' : 'none',
  }));
  const propertiesAnimatedStyle = useAnimatedStyle(() => ({
    opacity: quoteInfoLaunchDestination.value === 1 ? 1 : 0,
    zIndex: quoteInfoLaunchDestination.value === 1 ? 1 : 0,
  }));
  const propertiesAnimatedProps = useAnimatedProps<ViewProps>(() => ({
    pointerEvents: quoteInfoLaunchDestination.value === 1 ? 'auto' : 'none',
  }));
  const statisticsAnimatedStyle = useAnimatedStyle(() => ({
    opacity: quoteInfoLaunchDestination.value === 2 ? 1 : 0,
    zIndex: quoteInfoLaunchDestination.value === 2 ? 1 : 0,
  }));
  const statisticsAnimatedProps = useAnimatedProps<ViewProps>(() => ({
    pointerEvents: quoteInfoLaunchDestination.value === 2 ? 'auto' : 'none',
  }));

  const popRouteWhenReady = useCallback(() => {
    let attempt = 0;
    const tryPop = () => {
      try {
        if (router.canGoBack()) {
          safeRouterBack(router, '/(tabs)/quotes');
          return;
        }
      } catch {
        return;
      }

      attempt += 1;
      if (attempt > 4) {
        return;
      }
      if (typeof globalThis.requestAnimationFrame === 'function') {
        globalThis.requestAnimationFrame(tryPop);
      } else {
        setTimeout(tryPop, 16);
      }
    };

    tryPop();
  }, [router]);

  const closeLaunch = useCallback(() => {
    const currentSnapshot = quoteInfoLaunchController.getSnapshot();
    if (!currentSnapshot.visible || backInFlightRef.current) {
      return;
    }

    backInFlightRef.current = true;
    const navigationStarted = currentSnapshot.navigationStarted;

    quoteInfoLaunchController.hide(currentSnapshot.revision);

    if (backGuardTimerRef.current) {
      clearTimeout(backGuardTimerRef.current);
    }
    backGuardTimerRef.current = setTimeout(() => {
      backInFlightRef.current = false;
      backGuardTimerRef.current = null;
    }, navigationStarted ? 700 : 100);

    if (navigationStarted) {
      scheduleBackNavigationAfterVisualFrame(popRouteWhenReady);
    }
  }, [popRouteWhenReady]);

  useEffect(
    () => quoteInfoLaunchController.registerVisualApplier(
      writeQuoteInfoLaunchDestinationNow,
    ),
    [],
  );

  useEffect(() => {
    if (snapshot.visible) {
      backInFlightRef.current = false;
    }
  }, [snapshot.visible, snapshot.revision]);

  useEffect(() => () => {
    if (backGuardTimerRef.current) {
      clearTimeout(backGuardTimerRef.current);
    }
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (backInFlightRef.current) {
        return true;
      }
      if (!quoteInfoLaunchController.isVisible()) {
        return false;
      }
      closeLaunch();
      return true;
    });
    return () => subscription.remove();
  }, [closeLaunch]);

  // Shell headers stay mounted for the prepared symbol. `active` gates both
  // live ticks and the larger preview body, which is removed again on hide.
  const propertiesActive = snapshot.visible && snapshot.destination === 'properties';
  const statisticsActive = snapshot.visible && snapshot.destination === 'market-statistics';

  return (
    <Animated.View
      animatedProps={hostAnimatedProps}
      pointerEvents={snapshot.visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!snapshot.visible}
      importantForAccessibility={snapshot.visible ? 'auto' : 'no-hide-descendants'}
      style={[
        styles.hostRoot,
        hostAnimatedStyle,
        snapshot.visible ? styles.hostVisible : null,
      ]}
      testID="quote-info-launch-host"
    >
      <Animated.View
        animatedProps={propertiesAnimatedProps}
        pointerEvents={propertiesActive ? 'auto' : 'none'}
        accessibilityElementsHidden={!propertiesActive}
        importantForAccessibility={propertiesActive ? 'auto' : 'no-hide-descendants'}
        style={[styles.layer, propertiesAnimatedStyle]}
        testID="quote-info-launch-animated-host"
      >
        <QuoteInfoLaunchShell
          active={propertiesActive}
          destination="properties"
          symbol={snapshot.symbol}
          onBack={closeLaunch}
          backLatencyLabel="quoteInfo.launch.properties.back"
        />
      </Animated.View>

      <Animated.View
        animatedProps={statisticsAnimatedProps}
        pointerEvents={statisticsActive ? 'auto' : 'none'}
        accessibilityElementsHidden={!statisticsActive}
        importantForAccessibility={statisticsActive ? 'auto' : 'no-hide-descendants'}
        style={[styles.layer, statisticsAnimatedStyle]}
      >
        <QuoteInfoLaunchShell
          active={statisticsActive}
          destination="market-statistics"
          symbol={snapshot.symbol}
          onBack={closeLaunch}
          backLatencyLabel="quoteInfo.launch.marketStatistics.back"
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  hostRoot: {
    ...StyleSheet.absoluteFillObject,
    // Root sibling of Stack — above route screens, below ActionSheet (9999)
    // and RegisterLaunchHost (50).
    elevation: 47,
    zIndex: 47,
  },
  hostVisible: {
    elevation: 49,
    zIndex: 49,
  },
  layer: {
    ...StyleSheet.absoluteFillObject,
  },
});
