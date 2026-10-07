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
import { OrderTicketLaunchShell } from './OrderTicketLaunchShell';
import {
  getOrderTicketOriginHref,
  orderTicketLaunchController,
} from './orderTicketLaunchController';
import { safeRouterBack } from '../../utils/navigation';

type OrderTicketLaunchHostGlobal = typeof globalThis & {
  __rtx5OrderTicketLaunchVisibility?: SharedValue<number>;
};

const hostGlobal = globalThis as OrderTicketLaunchHostGlobal;
const orderTicketLaunchVisibility =
  hostGlobal.__rtx5OrderTicketLaunchVisibility ?? makeMutable(0);
hostGlobal.__rtx5OrderTicketLaunchVisibility = orderTicketLaunchVisibility;

function writeOrderTicketLaunchVisibilityNow(visible: boolean) {
  const nextValue = visible ? 1 : 0;
  try {
    executeOnUIRuntimeSync((value: number) => {
      'worklet';
      orderTicketLaunchVisibility.value = value;
    })(nextValue);
  } catch (error) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[OrderTicketLaunch] sync UI write unavailable, using async fallback:', error);
    }
    orderTicketLaunchVisibility.value = nextValue;
  }
}

/** Shows a lightweight New Order handoff while the interactive route is mounting. */
export function OrderTicketLaunchHost() {
  const router = useRouter();
  const backInFlightRef = useRef(false);
  const backGuardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshot = useSyncExternalStore(
    orderTicketLaunchController.subscribe,
    orderTicketLaunchController.getSnapshot,
    orderTicketLaunchController.getSnapshot,
  );
  const animatedStyle = useAnimatedStyle(() => {
    const visible = orderTicketLaunchVisibility.value === 1;
    return {
      elevation: visible ? 38 : 0,
      opacity: visible ? 1 : 0,
      zIndex: visible ? 38 : 0,
    };
  });
  const animatedProps = useAnimatedProps<ViewProps>(() => ({
    pointerEvents: orderTicketLaunchVisibility.value === 1 ? 'auto' : 'none',
  }));
  const shellActive = snapshot.visible;

  const popRouteWhenReady = useCallback((fallbackHref: ReturnType<typeof getOrderTicketOriginHref>) => {
    let attempt = 0;
    const tryPop = () => {
      try {
        if (router.canGoBack()) {
          safeRouterBack(router, fallbackHref);
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

    // Back may be tapped before the real route is on the stack.
    // Try briefly and pop it as soon as it exists.
    tryPop();
  }, [router]);

  const closeLaunch = useCallback(() => {
    const currentSnapshot = orderTicketLaunchController.getSnapshot();
    if (!currentSnapshot.visible || backInFlightRef.current) {
      return;
    }

    backInFlightRef.current = true;
    const navigationStarted = currentSnapshot.navigationStarted;

    // Hide the preview immediately. If the real route already started,
    // remove it too as soon as navigation is ready.
    orderTicketLaunchController.hide(currentSnapshot.revision);

    if (backGuardTimerRef.current) {
      clearTimeout(backGuardTimerRef.current);
    }
    backGuardTimerRef.current = setTimeout(() => {
      backInFlightRef.current = false;
      backGuardTimerRef.current = null;
    }, navigationStarted ? 700 : 100);

    if (!navigationStarted) {
      return;
    }

    popRouteWhenReady(getOrderTicketOriginHref(currentSnapshot.origin));
  }, [popRouteWhenReady]);

  useEffect(
    () => orderTicketLaunchController.registerVisualApplier(
      writeOrderTicketLaunchVisibilityNow,
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
      if (!orderTicketLaunchController.isVisible()) {
        return false;
      }

      closeLaunch();
      return true;
    });
    return () => subscription.remove();
  }, [closeLaunch]);

  return (
    <Animated.View
      animatedProps={animatedProps}
      pointerEvents={snapshot.visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!snapshot.visible}
      importantForAccessibility={snapshot.visible ? 'auto' : 'no-hide-descendants'}
      style={[styles.host, animatedStyle, snapshot.visible && styles.hostVisible]}
      testID="order-ticket-launch-host"
    >
      {snapshot.visible ? (
        <OrderTicketLaunchShell
          active={shellActive}
          symbol={snapshot.symbol}
          onBack={closeLaunch}
          backLatencyLabel="orderTicket.launch.back"
        />
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    // Above chart trade chrome; below ActionSheet (9999).
    elevation: 38,
  },
  hostVisible: {
    elevation: 39,
    opacity: 1,
    zIndex: 39,
  },
});
