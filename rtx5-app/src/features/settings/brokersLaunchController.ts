import { scheduleAfterVisualFrames } from '../../utils/afterVisualFrame';
/**
 * Controls the short handoff from the Accounts "+" button to the Brokers
 * route: reveal a lightweight Brokers shell, then start native navigation
 * after that shell has painted.
 */

export type BrokersLaunchSnapshot = Readonly<{
  visible: boolean;
  navigationStarted: boolean;
  /** Changes on every launch so delayed work from an older tap can be ignored. */
  revision: number;
}>;

export type BrokersLaunchVisualApplier = (visible: boolean) => void;

export type BrokersLaunchController = Readonly<{
  getSnapshot: () => BrokersLaunchSnapshot;
  subscribe: (listener: () => void) => () => void;
  show: () => number;
  hide: (revision?: number) => boolean;
  isVisible: () => boolean;
  startNavigation: (revision: number) => boolean;
  registerVisualApplier: (applier: BrokersLaunchVisualApplier) => () => void;
}>;

const BROKERS_LAUNCH_FALLBACK_MS = 5_000;
const BROKERS_LAUNCH_CONTROLLER_VERSION = 3;

const createSnapshot = (
  visible: boolean,
  navigationStarted: boolean,
  revision: number,
): BrokersLaunchSnapshot => Object.freeze({
  visible,
  navigationStarted,
  revision,
});

export function createBrokersLaunchController(): BrokersLaunchController {
  const listeners = new Set<() => void>();
  let visualApplier: BrokersLaunchVisualApplier | null = null;
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  let snapshot = createSnapshot(false, false, 0);

  const clearFallbackTimer = () => {
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
  };

  const publish = (nextSnapshot: BrokersLaunchSnapshot) => {
    snapshot = nextSnapshot;
    listeners.forEach((listener) => listener());
  };

  const hideCurrent = () => {
    clearFallbackTimer();
    visualApplier?.(false);

    if (!snapshot.visible) {
      return false;
    }

    publish(createSnapshot(false, false, snapshot.revision + 1));
    return true;
  };

  return Object.freeze({
    getSnapshot: () => snapshot,

    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    show: () => {
      clearFallbackTimer();
      const revision = snapshot.revision + 1;

      // Reveal the ready Brokers shell before constructing the real route.
      visualApplier?.(true);
      publish(createSnapshot(true, false, revision));

      // Safety: remove the shell if native navigation never covers it.
      fallbackTimer = setTimeout(() => {
        fallbackTimer = null;
        if (snapshot.visible && snapshot.revision === revision) {
          visualApplier?.(false);
          publish(createSnapshot(false, false, revision + 1));
        }
      }, BROKERS_LAUNCH_FALLBACK_MS);

      return revision;
    },

    hide: (revision?: number) => {
      if (revision !== undefined && snapshot.revision !== revision) {
        return false;
      }
      return hideCurrent();
    },

    isVisible: () => snapshot.visible,

    startNavigation: (revision) => {
      if (
        !snapshot.visible
        || snapshot.revision !== revision
        || snapshot.navigationStarted
      ) {
        return false;
      }

      publish(createSnapshot(true, true, revision));
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

type BrokersLaunchControllerGlobal = typeof globalThis & {
  __rtx5BrokersLaunchController?: BrokersLaunchController;
  __rtx5BrokersLaunchControllerVersion?: number;
};

const controllerGlobal = globalThis as BrokersLaunchControllerGlobal;
const existingController = controllerGlobal.__rtx5BrokersLaunchController;

export const brokersLaunchController =
  existingController
    && controllerGlobal.__rtx5BrokersLaunchControllerVersion === BROKERS_LAUNCH_CONTROLLER_VERSION
    && typeof existingController.show === 'function'
    && typeof existingController.startNavigation === 'function'
    && typeof existingController.registerVisualApplier === 'function'
    ? existingController
    : createBrokersLaunchController();

controllerGlobal.__rtx5BrokersLaunchController = brokersLaunchController;
controllerGlobal.__rtx5BrokersLaunchControllerVersion = BROKERS_LAUNCH_CONTROLLER_VERSION;

export function showBrokersLaunch() {
  return brokersLaunchController.show();
}

/**
 * Reveals Brokers while a higher route is already being popped back to it.
 * Marking navigation as started distinguishes this reverse handoff from an
 * Accounts -> Brokers launch that can still be cancelled before its push.
 */
export function showBrokersReturnLaunch() {
  const revision = brokersLaunchController.show();
  brokersLaunchController.startNavigation(revision);
  return revision;
}

export function hideBrokersLaunch(revision?: number) {
  return brokersLaunchController.hide(revision);
}

export function scheduleBrokersLaunchNavigation(
  revision: number,
  action: () => void,
) {
  const runIfCurrent = () => {
    if (brokersLaunchController.startNavigation(revision)) {
      action();
    }
  };

  return scheduleAfterVisualFrames(runIfCurrent);
}

/**
 * Removes the retained Brokers cover only after the native route has had two
 * complete paint opportunities. The revision guard prevents delayed takeover
 * work from hiding a newer launch or a Broker Detail handoff.
 */
export function scheduleBrokersLaunchCoverRemoval(revision: number) {
  const hideIfCurrent = () => {
    brokersLaunchController.hide(revision);
  };

  return scheduleAfterVisualFrames(hideIfCurrent);
}
