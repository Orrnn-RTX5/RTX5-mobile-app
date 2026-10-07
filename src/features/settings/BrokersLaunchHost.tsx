import { usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { Alert, BackHandler, StyleSheet, View } from 'react-native';
import {
  safeRouterBack,
  scheduleBackNavigationAfterVisualFrame,
} from '../../utils/navigation';
import {
  hideSidebarDestination,
  showSidebarDestination,
} from '../../ui/components/sidebarDestinationHostController';
import { brokersLaunchController } from './brokersLaunchController';
import { BrokersLaunchShell } from './BrokersLaunchShell';
import {
  scheduleBrokerDetailLaunchNavigation,
  showBrokerDetailLaunch,
  toBrokerDetailLaunchSelection,
} from './brokerDetailLaunchController';
import type { BrokerDirectoryRow } from './BrokersScreen/brokerDirectoryRows';
import {
  SELECTED_BROKER_UNAVAILABLE_MESSAGE,
  selectedBrokerHealthGate,
} from './BrokersScreen/selectedBrokerHealthGate';
import { warmDemoAccountForm } from './registerScreenPreload';
import { selectGuestBrokerById } from '../../services/selectGuestBroker';
import { scheduleAfterVisualFrame } from '../../utils/afterVisualFrame';

const BROKERS_LAUNCH_HIDDEN_STYLE = {
  elevation: 0,
  opacity: 0,
  zIndex: 0,
} as const;
const BROKERS_LAUNCH_VISIBLE_STYLE = {
  elevation: 34,
  opacity: 1,
  zIndex: 34,
} as const;

function writeBrokersLaunchVisibilityNow(layer: View | null, visible: boolean) {
  layer?.setNativeProps({
    accessibilityElementsHidden: !visible,
    importantForAccessibility: visible ? 'auto' : 'no-hide-descendants',
    pointerEvents: visible ? 'auto' : 'none',
    style: visible ? BROKERS_LAUNCH_VISIBLE_STYLE : BROKERS_LAUNCH_HIDDEN_STYLE,
  });
}

/** Shows the lightweight Brokers handoff above Accounts when requested. */
export function BrokersLaunchHost() {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const backInFlightRef = useRef(false);
  const pendingBackRevisionRef = useRef<number | null>(null);
  const backGuardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hostLayerRef = useRef<View>(null);
  const renderVisible = useSyncExternalStore(
    brokersLaunchController.subscribe,
    brokersLaunchController.isVisible,
    brokersLaunchController.isVisible,
  );
  pathnameRef.current = pathname;

  const armBackGuard = useCallback((delayMs: number) => {
    if (backGuardTimerRef.current) clearTimeout(backGuardTimerRef.current);
    backGuardTimerRef.current = setTimeout(() => {
      backInFlightRef.current = false;
      backGuardTimerRef.current = null;
    }, delayMs);
  }, []);

  const finishCommittedBack = useCallback((revision: number) => {
    const current = brokersLaunchController.getSnapshot();
    if (!current.visible || current.revision !== revision) {
      pendingBackRevisionRef.current = null;
      backInFlightRef.current = false;
      return;
    }

    pendingBackRevisionRef.current = null;
    // The explicit route-sync owner survives stale/frozen tab pathname state.
    showSidebarDestination('accounts', 'route-sync');
    brokersLaunchController.hide(revision);
    armBackGuard(700);
    scheduleBackNavigationAfterVisualFrame(() => {
      safeRouterBack(router, '/(tabs)/quotes');
    });
  }, [armBackGuard, router]);

  useEffect(() => {
    if (pathname !== '/settings/brokers') return;
    const pendingRevision = pendingBackRevisionRef.current;
    if (pendingRevision === null) return;
    finishCommittedBack(pendingRevision);
  }, [finishCommittedBack, pathname]);

  const closeLaunch = useCallback(() => {
    const currentSnapshot = brokersLaunchController.getSnapshot();
    if (!currentSnapshot.visible || backInFlightRef.current) {
      return;
    }

    backInFlightRef.current = true;
    const navigationStarted = currentSnapshot.navigationStarted;

    if (!navigationStarted) {
      showSidebarDestination('accounts', 'route-sync');
      brokersLaunchController.hide(currentSnapshot.revision);
      armBackGuard(100);
      return;
    }

    // canGoBack() only proves some route exists (often Quotes), not that the
    // scheduled Brokers push committed. Keep the opaque cover in place until
    // this exact route is current, then perform one owned pop.
    if (pathnameRef.current !== '/settings/brokers') {
      pendingBackRevisionRef.current = currentSnapshot.revision;
      return;
    }

    finishCommittedBack(currentSnapshot.revision);
  }, [armBackGuard, finishCommittedBack]);

  const selectBroker = useCallback((broker: BrokerDirectoryRow) => {
    if (!broker.selectable) {
      return;
    }
    const selectedLaunchRevision = brokersLaunchController.getSnapshot().revision;
    const isSelectedPickerStillActive = () => {
      const current = brokersLaunchController.getSnapshot();
      return (
        (current.visible && current.revision === selectedLaunchRevision)
        || (
          pathnameRef.current === '/settings/brokers'
          && !current.visible
          && current.revision === selectedLaunchRevision + 1
        )
      );
    };

    void selectedBrokerHealthGate.run({
      serverUrl: broker.serverUrl,
      onAvailable: () => {
        if (!isSelectedPickerStillActive()) return;
        void selectGuestBrokerById(broker.brokerId, isSelectedPickerStillActive).then(selected => {
          if (!selected || !isSelectedPickerStillActive()) return;
          hideSidebarDestination();
          brokersLaunchController.hide();
          router.replace('/(tabs)/quotes');
        }).catch(error => Alert.alert('Broker unavailable', error.message));
      },
      onUnavailable: () => {
        if (!isSelectedPickerStillActive()) return;
        Alert.alert(SELECTED_BROKER_UNAVAILABLE_MESSAGE);
      },
    });
  }, [router]);

  useEffect(() => {
    let cancelFormWarmup: (() => void) | null = null;
    const unregister = brokersLaunchController.registerVisualApplier(
      (visible) => {
        writeBrokersLaunchVisibilityNow(hostLayerRef.current, visible);
        cancelFormWarmup?.();
        cancelFormWarmup = null;
        if (visible) {
          // Importing a not-yet-evaluated form can occupy the JS thread. Let
          // the broker picker paint before optional next-screen warming.
          cancelFormWarmup = scheduleAfterVisualFrame(() => {
            cancelFormWarmup = null;
            if (brokersLaunchController.isVisible()) void warmDemoAccountForm();
          });
          pendingBackRevisionRef.current = null;
          backInFlightRef.current = false;
        }
      },
    );
    return () => {
      cancelFormWarmup?.();
      unregister();
    };
  }, []);

  useEffect(() => () => {
    pendingBackRevisionRef.current = null;
    if (backGuardTimerRef.current) {
      clearTimeout(backGuardTimerRef.current);
    }
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!brokersLaunchController.isVisible()) {
        return false;
      }
      if (backInFlightRef.current) {
        return true;
      }

      closeLaunch();
      return true;
    });
    return () => subscription.remove();
  }, [closeLaunch]);

  return (
    <View pointerEvents="box-none" style={styles.hostRoot} testID="brokers-launch-host">
      <View
        ref={hostLayerRef}
        pointerEvents={renderVisible ? 'auto' : 'none'}
        accessibilityElementsHidden={!renderVisible}
        importantForAccessibility={renderVisible ? 'auto' : 'no-hide-descendants'}
        collapsable={false}
        style={[
          styles.hostLayer,
          renderVisible ? styles.hostLayerVisible : styles.hostLayerHidden,
        ]}
        // Keep the established diagnostic id for ADB/UI automation.
        testID="brokers-launch-animated-host"
      >
        {renderVisible ? (
          <BrokersLaunchShell
            onBack={closeLaunch}
            onSelectBroker={selectBroker}
            backLatencyLabel="brokers.launch.back"
            dataActive={false}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hostRoot: {
    ...StyleSheet.absoluteFillObject,
  },
  hostLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  hostLayerHidden: BROKERS_LAUNCH_HIDDEN_STYLE,
  hostLayerVisible: BROKERS_LAUNCH_VISIBLE_STYLE,
});
