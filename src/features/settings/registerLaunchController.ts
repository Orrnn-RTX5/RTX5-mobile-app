import { scheduleAfterVisualFrames } from '../../utils/afterVisualFrame';
/**
 * Controls the root-level handoff from Broker Detail to the Demo Account
 * route. The preview can be revealed synchronously, while native navigation
 * starts only after the accepted touch and two preview paint opportunities.
 */

import type { BrokerDetailLaunchSelection } from './brokerDetailLaunchController';
import { warmDemoAccountForm } from './registerScreenPreload';

export type RegisterLaunchSnapshot = Readonly<{
  visible: boolean;
  navigationStarted: boolean;
  routeMounted: boolean;
  backRequested: boolean;
  selection: BrokerDetailLaunchSelection | null;
  /** Changes on every launch so delayed work from an older tap is ignored. */
  revision: number;
}>;

export type RegisterLaunchBackResult = 'cancel' | 'wait' | 'pop' | 'handled' | 'stale';
export type RegisterLaunchMountResult = 'mounted' | 'back-requested' | 'stale';

export type RegisterLaunchVisualApplier = (visible: boolean) => void;

export type RegisterLaunchController = Readonly<{
  getSnapshot: () => RegisterLaunchSnapshot;
  subscribe: (listener: () => void) => () => void;
  show: (selection: BrokerDetailLaunchSelection) => number;
  hide: (revision?: number) => boolean;
  isVisible: () => boolean;
  markRouteMounted: (revision: number) => RegisterLaunchMountResult;
  requestBack: (revision: number) => RegisterLaunchBackResult;
  startNavigation: (revision: number) => boolean;
  registerVisualApplier: (applier: RegisterLaunchVisualApplier) => () => void;
}>;

const REGISTER_LAUNCH_FALLBACK_MS = 5_000;
const REGISTER_LAUNCH_CONTROLLER_VERSION = 2;

const createSnapshot = (
  visible: boolean,
  navigationStarted: boolean,
  routeMounted: boolean,
  backRequested: boolean,
  selection: BrokerDetailLaunchSelection | null,
  revision: number,
): RegisterLaunchSnapshot => Object.freeze({
  visible,
  navigationStarted,
  routeMounted,
  backRequested,
  selection,
  revision,
});

export function createRegisterLaunchController(): RegisterLaunchController {
  const listeners = new Set<() => void>();
  let visualApplier: RegisterLaunchVisualApplier | null = null;
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  let snapshot = createSnapshot(false, false, false, false, null, 0);

  const clearFallbackTimer = () => {
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
  };

  const publish = (nextSnapshot: RegisterLaunchSnapshot) => {
    snapshot = nextSnapshot;
    listeners.forEach((listener) => listener());
  };

  const hideCurrent = () => {
    clearFallbackTimer();
    visualApplier?.(false);

    if (!snapshot.visible) {
      return false;
    }

    publish(createSnapshot(
      false,
      false,
      false,
      false,
      snapshot.selection,
      snapshot.revision + 1,
    ));
    return true;
  };

  return Object.freeze({
    getSnapshot: () => snapshot,

    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    show: (selection) => {
      clearFallbackTimer();
      const revision = snapshot.revision + 1;

      // The host is already mounted, so reveal it before route construction.
      visualApplier?.(true);
      publish(createSnapshot(true, false, false, false, selection, revision));

      // Safety: never strand an input-blocking preview above the application.
      fallbackTimer = setTimeout(() => {
        fallbackTimer = null;
        if (snapshot.visible && snapshot.revision === revision) {
          visualApplier?.(false);
          publish(createSnapshot(false, false, false, false, selection, revision + 1));
        }
      }, REGISTER_LAUNCH_FALLBACK_MS);

      return revision;
    },

    hide: (revision) => {
      if (revision !== undefined && snapshot.revision !== revision) {
        return false;
      }
      return hideCurrent();
    },

    isVisible: () => snapshot.visible,

    markRouteMounted: (revision) => {
      if (!snapshot.visible || snapshot.revision !== revision) {
        return 'stale';
      }

      clearFallbackTimer();
      if (!snapshot.routeMounted) {
        publish(createSnapshot(
          true,
          snapshot.navigationStarted,
          true,
          snapshot.backRequested,
          snapshot.selection,
          revision,
        ));
      }
      return snapshot.backRequested ? 'back-requested' : 'mounted';
    },

    requestBack: (revision) => {
      if (!snapshot.visible || snapshot.revision !== revision) {
        return 'stale';
      }
      if (snapshot.backRequested) {
        return 'handled';
      }
      if (!snapshot.navigationStarted) {
        return 'cancel';
      }

      publish(createSnapshot(
        true,
        true,
        snapshot.routeMounted,
        true,
        snapshot.selection,
        revision,
      ));
      return snapshot.routeMounted ? 'pop' : 'wait';
    },

    startNavigation: (revision) => {
      if (
        !snapshot.visible
        || snapshot.revision !== revision
        || snapshot.navigationStarted
      ) {
        return false;
      }

      publish(createSnapshot(
        true,
        true,
        false,
        snapshot.backRequested,
        snapshot.selection,
        revision,
      ));
      return true;
    },

    registerVisualApplier: (applier) => {
      visualApplier = applier;
      applier(snapshot.visible);
      return () => {
        if (visualApplier === applier) {
          visualApplier = null;
        }
      };
    },
  });
}

type RegisterLaunchControllerGlobal = typeof globalThis & {
  __rtx5RegisterLaunchController?: RegisterLaunchController;
  __rtx5RegisterLaunchControllerVersion?: number;
};

const controllerGlobal = globalThis as RegisterLaunchControllerGlobal;
const existingController = controllerGlobal.__rtx5RegisterLaunchController;

export const registerLaunchController =
  existingController
    && controllerGlobal.__rtx5RegisterLaunchControllerVersion === REGISTER_LAUNCH_CONTROLLER_VERSION
    && typeof existingController.show === 'function'
    && typeof existingController.startNavigation === 'function'
    && typeof existingController.registerVisualApplier === 'function'
    ? existingController
    : createRegisterLaunchController();

controllerGlobal.__rtx5RegisterLaunchController = registerLaunchController;
controllerGlobal.__rtx5RegisterLaunchControllerVersion = REGISTER_LAUNCH_CONTROLLER_VERSION;

export function showRegisterLaunch(selection: BrokerDetailLaunchSelection) {
  // Kick the Demo form module while the retained shell paints so register-entry
  // can mount immediately when the module is already warm.
  void warmDemoAccountForm();
  return registerLaunchController.show(selection);
}

export function hideRegisterLaunch(revision?: number) {
  return registerLaunchController.hide(revision);
}

export function markRegisterLaunchRouteMounted(revision: number) {
  return registerLaunchController.markRouteMounted(revision);
}

export function requestRegisterLaunchBack(revision: number) {
  return registerLaunchController.requestBack(revision);
}

export function scheduleRegisterLaunchNavigation(
  revision: number,
  action: () => void,
) {
  const runIfCurrent = () => {
    if (registerLaunchController.startNavigation(revision)) {
      try {
        action();
      } catch (error) {
        registerLaunchController.hide(revision);
        throw error;
      }
    }
  };

  return scheduleAfterVisualFrames(runIfCurrent);
}

/** Removes the root preview only after the destination has had two paints. */
export function scheduleRegisterLaunchCoverRemoval(revision: number) {
  const hideIfCurrent = () => {
    registerLaunchController.hide(revision);
  };

  return scheduleAfterVisualFrames(hideIfCurrent);
}
