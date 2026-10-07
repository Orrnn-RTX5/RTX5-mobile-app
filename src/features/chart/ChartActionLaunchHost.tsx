import { usePathname, useRouter } from 'expo-router';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type RefCallback,
} from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import {
  chartActionLaunchController,
  type ChartActionLaunchDestination,
} from './chartActionLaunchController';
import { ChartActionLaunchShell } from './ChartActionLaunchShell';
import { scheduleAfterVisualFrame } from '../../utils/afterVisualFrame';
import {
  safeRouterBack,
  scheduleBackNavigationAfterVisualFrame,
} from '../../utils/navigation';

const CHART_ACTION_LAUNCH_DESTINATIONS: ChartActionLaunchDestination[] = [
  'objects',
  'calculator',
  'analytics',
  'specification',
];

const CHART_ACTION_LAUNCH_PATHS: Record<ChartActionLaunchDestination, string> = {
  analytics: '/chart/analytics',
  calculator: '/chart/calculator',
  objects: '/chart/objects',
  specification: '/chart/specification',
};

/**
 * Root-level retained cover for the four heavy Chart More destinations.
 * It intentionally uses the sidebar's imperative native-layer flip: the tap
 * does not wait for a React reconciliation or a UI-runtime round trip.
 */
export function ChartActionLaunchHost() {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const backInFlightRef = useRef(false);
  const pendingBackRef = useRef<{
    destination: ChartActionLaunchDestination;
    revision: number;
  } | null>(null);
  const backGuardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layerRefs = useRef<Partial<Record<ChartActionLaunchDestination, View | null>>>({});
  const nativeVisualDestinationRef = useRef<ChartActionLaunchDestination | null>(
    chartActionLaunchController.getSnapshot().visible
      ? chartActionLaunchController.getSnapshot().destination
      : null,
  );

  const layerRefSetters = useMemo(() => Object.fromEntries(
    CHART_ACTION_LAUNCH_DESTINATIONS.map((destination) => [
      destination,
      (layer: View | null) => {
        layerRefs.current[destination] = layer;
        if (!layer) {
          return;
        }
        const current = chartActionLaunchController.getSnapshot();
        const visible = current.visible && current.destination === destination;
        layer.setNativeProps({
          accessibilityElementsHidden: !visible,
          importantForAccessibility: visible ? 'auto' : 'no-hide-descendants',
          pointerEvents: visible ? 'auto' : 'none',
          style: [styles.layer, visible ? styles.layerVisible : styles.layerHidden],
        });
      },
    ]),
  ) as Record<ChartActionLaunchDestination, RefCallback<View>>, []);

  const sweepVisualDestinationNow = useCallback((
    visualDestination: ChartActionLaunchDestination | null,
  ) => {
    for (const destination of CHART_ACTION_LAUNCH_DESTINATIONS) {
      const visible = destination === visualDestination;
      layerRefs.current[destination]?.setNativeProps({
        accessibilityElementsHidden: !visible,
        importantForAccessibility: visible ? 'auto' : 'no-hide-descendants',
        pointerEvents: visible ? 'auto' : 'none',
        style: [styles.layer, visible ? styles.layerVisible : styles.layerHidden],
      });
    }
    nativeVisualDestinationRef.current = visualDestination;
  }, []);

  const applyVisualDestinationNow = useCallback((
    visualDestination: ChartActionLaunchDestination | null,
  ) => {
    const previousDestination = nativeVisualDestinationRef.current;
    if (previousDestination && previousDestination !== visualDestination) {
      layerRefs.current[previousDestination]?.setNativeProps({
        accessibilityElementsHidden: true,
        importantForAccessibility: 'no-hide-descendants',
        pointerEvents: 'none',
        style: [styles.layer, styles.layerHidden],
      });
    }
    if (visualDestination) {
      layerRefs.current[visualDestination]?.setNativeProps({
        accessibilityElementsHidden: false,
        importantForAccessibility: 'auto',
        pointerEvents: 'auto',
        style: [styles.layer, styles.layerVisible],
      });
    }
    nativeVisualDestinationRef.current = visualDestination;
  }, []);

  // The native layer is already visible. React adopts focus/active props on
  // the following frame so four shell reconciliations cannot enter the tap.
  const subscribeAfterVisualFrame = useCallback((listener: () => void) => {
    let cancelled = false;
    let scheduled = false;
    let cancelDelivery: (() => void) | undefined;
    const notify = () => {
      if (cancelled || scheduled) {
        return;
      }
      scheduled = true;
      const deliver = () => {
        scheduled = false;
        if (!cancelled) {
          listener();
        }
      };
      cancelDelivery = scheduleAfterVisualFrame(deliver);
    };
    const unsubscribe = chartActionLaunchController.subscribe(notify);
    return () => {
      cancelled = true;
      cancelDelivery?.();
      unsubscribe();
    };
  }, []);

  const snapshot = useSyncExternalStore(
    subscribeAfterVisualFrame,
    chartActionLaunchController.getSnapshot,
    chartActionLaunchController.getSnapshot,
  );
  pathnameRef.current = pathname;

  const armBackGuard = useCallback((delayMs: number) => {
    if (backGuardTimerRef.current) {
      clearTimeout(backGuardTimerRef.current);
    }
    backGuardTimerRef.current = setTimeout(() => {
      backInFlightRef.current = false;
      backGuardTimerRef.current = null;
    }, delayMs);
  }, []);

  const finishCommittedBack = useCallback((
    destination: ChartActionLaunchDestination,
    revision: number,
  ) => {
    const current = chartActionLaunchController.getSnapshot();
    if (
      current.revision !== revision
      || current.destination !== destination
      || current.phase === 'hidden'
    ) {
      pendingBackRef.current = null;
      backInFlightRef.current = false;
      return;
    }

    pendingBackRef.current = null;
    chartActionLaunchController.hide(revision);
    armBackGuard(700);
    scheduleBackNavigationAfterVisualFrame(() => {
      safeRouterBack(router, '/(tabs)/chart');
    });
  }, [armBackGuard, router]);

  useEffect(() => {
    const pendingBack = pendingBackRef.current;
    if (
      !pendingBack
      || pathname !== CHART_ACTION_LAUNCH_PATHS[pendingBack.destination]
    ) {
      return;
    }
    finishCommittedBack(pendingBack.destination, pendingBack.revision);
  }, [finishCommittedBack, pathname]);

  const closeLaunch = useCallback(() => {
    const currentSnapshot = chartActionLaunchController.getSnapshot();
    if (!currentSnapshot.visible || backInFlightRef.current) {
      return;
    }
    backInFlightRef.current = true;
    const navigationStarted = currentSnapshot.navigationStarted;

    if (!navigationStarted) {
      chartActionLaunchController.hide(currentSnapshot.revision);
      armBackGuard(100);
      return;
    }

    // canGoBack() may refer to Chart before this scheduled push commits. Keep
    // the opaque shell visible until the exact destination path is current,
    // then perform one owned pop.
    if (pathnameRef.current !== CHART_ACTION_LAUNCH_PATHS[currentSnapshot.destination]) {
      pendingBackRef.current = {
        destination: currentSnapshot.destination,
        revision: currentSnapshot.revision,
      };
      return;
    }

    finishCommittedBack(currentSnapshot.destination, currentSnapshot.revision);
  }, [armBackGuard, finishCommittedBack]);

  useLayoutEffect(() => {
    let firstApplication = true;
    return chartActionLaunchController.registerVisualApplier((destination) => {
      if (firstApplication) {
        firstApplication = false;
        sweepVisualDestinationNow(destination);
        return;
      }
      if (destination) {
        pendingBackRef.current = null;
        backInFlightRef.current = false;
      }
      applyVisualDestinationNow(destination);
    });
  }, [applyVisualDestinationNow, sweepVisualDestinationNow]);

  useEffect(() => () => {
    pendingBackRef.current = null;
    if (backGuardTimerRef.current) {
      clearTimeout(backGuardTimerRef.current);
    }
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (backInFlightRef.current) {
        return true;
      }
      if (!chartActionLaunchController.isVisible()) {
        return false;
      }
      closeLaunch();
      return true;
    });
    return () => subscription.remove();
  }, [closeLaunch]);

  return (
    <View
      pointerEvents="box-none"
      style={styles.hostRoot}
      testID="chart-action-launch-host"
    >
      {CHART_ACTION_LAUNCH_DESTINATIONS.map((destination) => {
        const visualActive = nativeVisualDestinationRef.current === destination;
        return (
          <View
            key={destination}
            ref={layerRefSetters[destination]}
            collapsable={false}
            pointerEvents={visualActive ? 'auto' : 'none'}
            accessibilityElementsHidden={!visualActive}
            importantForAccessibility={visualActive ? 'auto' : 'no-hide-descendants'}
            style={[styles.layer, visualActive ? styles.layerVisible : styles.layerHidden]}
          >
            <ChartActionLaunchShell
              active={visualActive}
              destination={destination}
              symbol={snapshot.symbol}
              onBack={closeLaunch}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  hostRoot: {
    ...StyleSheet.absoluteFillObject,
    elevation: 49,
    zIndex: 49,
  },
  layer: {
    ...StyleSheet.absoluteFillObject,
  },
  layerHidden: {
    elevation: 0,
    opacity: 0,
    zIndex: 0,
  },
  layerVisible: {
    elevation: 1,
    opacity: 1,
    zIndex: 1,
  },
});
