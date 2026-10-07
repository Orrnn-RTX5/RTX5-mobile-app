import { usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { safeRouterBack, scheduleBackNavigationAfterVisualFrame } from '../../utils/navigation';
import { showBrokerDetailReturnLaunch } from './brokerDetailLaunchController';
import { RegisterHandoffPreview } from './RegisterHandoffPreview';
import {
  registerLaunchController,
  requestRegisterLaunchBack,
} from './registerLaunchController';

const REGISTER_LAUNCH_HIDDEN_STYLE = {
  elevation: 0,
  opacity: 0,
  zIndex: 0,
} as const;
const REGISTER_LAUNCH_VISIBLE_STYLE = {
  elevation: 50,
  opacity: 1,
  zIndex: 50,
} as const;

const isRegisterFlowRoute = (pathname: string) => (
  pathname === '/register-entry' || pathname === '/register'
);

function writeRegisterLaunchVisibilityNow(layer: View | null, visible: boolean) {
  layer?.setNativeProps({
    accessibilityElementsHidden: !visible,
    importantForAccessibility: visible ? 'auto' : 'no-hide-descendants',
    pointerEvents: visible ? 'auto' : 'none',
    style: visible ? REGISTER_LAUNCH_VISIBLE_STYLE : REGISTER_LAUNCH_HIDDEN_STYLE,
  });
}

/** Shows the Demo Account handoff above every broker-flow route when requested. */
export function RegisterLaunchHost() {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const backInFlightRef = useRef(false);
  const pendingBackRevisionRef = useRef<number | null>(null);
  const backGuardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hostLayerRef = useRef<View>(null);
  const renderVisible = useSyncExternalStore(
    registerLaunchController.subscribe,
    registerLaunchController.isVisible,
    registerLaunchController.isVisible,
  );
  pathnameRef.current = pathname;

  const popCommittedRegisterRoute = useCallback((
    revision: number,
    selection: NonNullable<ReturnType<typeof registerLaunchController.getSnapshot>['selection']>,
  ) => {
    pendingBackRevisionRef.current = null;
    showBrokerDetailReturnLaunch(selection);
    registerLaunchController.hide(revision);
    scheduleBackNavigationAfterVisualFrame(() => {
      safeRouterBack(router, {
        pathname: '/settings/broker-detail',
        params: selection,
      });
      backGuardTimerRef.current = setTimeout(() => {
        backInFlightRef.current = false;
        backGuardTimerRef.current = null;
      }, 700);
    });
  }, [router]);

  useEffect(() => {
    if (!isRegisterFlowRoute(pathname)) return;
    const pendingRevision = pendingBackRevisionRef.current;
    if (pendingRevision === null) return;

    const current = registerLaunchController.getSnapshot();
    if (!current.visible || current.revision !== pendingRevision || !current.selection) {
      pendingBackRevisionRef.current = null;
      backInFlightRef.current = false;
      return;
    }
    popCommittedRegisterRoute(pendingRevision, current.selection);
  }, [pathname, popCommittedRegisterRoute]);

  const closeLaunch = useCallback(() => {
    const current = registerLaunchController.getSnapshot();
    if (!current.visible || backInFlightRef.current) return;

    backInFlightRef.current = true;
    const backResult = requestRegisterLaunchBack(current.revision);

    if (backResult === 'cancel') {
      // The scheduled push has not begun, so hiding this top layer reveals the
      // already-correct Broker Detail layer without touching the native stack.
      registerLaunchController.hide(current.revision);
      backGuardTimerRef.current = setTimeout(() => {
        backInFlightRef.current = false;
        backGuardTimerRef.current = null;
      }, 100);
      return;
    }

    if (backResult === 'pop' && current.selection) {
      popCommittedRegisterRoute(current.revision, current.selection);
      return;
    }

    if ((backResult === 'wait' || backResult === 'handled') && current.selection) {
      // The mounted Demo form is authoritative even if its controller mount
      // notification was missed. If the native route is already current, pop
      // it now; otherwise keep the cover and finish as soon as it commits.
      if (isRegisterFlowRoute(pathnameRef.current)) {
        popCommittedRegisterRoute(current.revision, current.selection);
      } else {
        pendingBackRevisionRef.current = current.revision;
      }
      return;
    }

    if (backResult === 'stale') {
      backInFlightRef.current = false;
    }
  }, [popCommittedRegisterRoute]);

  useEffect(
    () => registerLaunchController.registerVisualApplier((visible) => {
      writeRegisterLaunchVisibilityNow(hostLayerRef.current, visible);
      if (visible) {
        pendingBackRevisionRef.current = null;
        backInFlightRef.current = false;
      }
    }),
    [],
  );

  useEffect(() => () => {
    pendingBackRevisionRef.current = null;
    if (backGuardTimerRef.current) clearTimeout(backGuardTimerRef.current);
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!registerLaunchController.isVisible()) return false;
      closeLaunch();
      return true;
    });
    return () => subscription.remove();
  }, [closeLaunch]);

  return (
    <View pointerEvents="box-none" style={styles.hostRoot} testID="register-launch-host">
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
        testID="register-launch-animated-host"
      >
        {renderVisible ? (
          <RegisterHandoffPreview
            onBack={closeLaunch}
            backLatencyLabel="register.launch.back"
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hostRoot: { ...StyleSheet.absoluteFillObject },
  hostLayer: { ...StyleSheet.absoluteFillObject },
  hostLayerHidden: REGISTER_LAUNCH_HIDDEN_STYLE,
  hostLayerVisible: REGISTER_LAUNCH_VISIBLE_STYLE,
});
