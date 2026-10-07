import { scheduleAfterVisualFrames } from '../../utils/afterVisualFrame';
/**
 * Controls the short handoff from a broker row to the full broker login route.
 * The preview contains only the live directory fields already shown to the user;
 * credentials and network responses never enter this global snapshot.
 */

export type BrokerDetailLaunchSelection = Readonly<{
  brokerId: string;
  brokerName: string;
  brokerServer: string;
  brokerServerUrl: string;
  brokerLogoUrl: string;
  brokerDomain: string;
}>;

export type BrokerDetailLaunchDirectoryRecord = Readonly<{
  brokerId: string;
  name: string;
  server: string;
  serverUrl: string;
  logoUrl: string;
  domain?: string;
}>;

export type BrokerDetailLaunchSnapshot = Readonly<{
  visible: boolean;
  navigationStarted: boolean;
  selection: BrokerDetailLaunchSelection;
  /** Changes on every launch so delayed work from an older tap is ignored. */
  revision: number;
}>;

export type BrokerDetailLaunchVisualApplier = (visible: boolean) => void;

export type BrokerDetailLaunchController = Readonly<{
  complete: () => boolean;
  getSnapshot: () => BrokerDetailLaunchSnapshot;
  hide: (revision?: number) => boolean;
  isVisible: () => boolean;
  markCovered: () => boolean;
  prepare: (selection: BrokerDetailLaunchSelection) => void;
  registerVisualApplier: (applier: BrokerDetailLaunchVisualApplier) => () => void;
  show: (selection: BrokerDetailLaunchSelection) => number;
  startNavigation: (revision: number) => boolean;
  subscribe: (listener: () => void) => () => void;
}>;

const BROKER_DETAIL_LAUNCH_FALLBACK_MS = 5_000;
const BROKER_DETAIL_LAUNCH_CONTROLLER_VERSION = 3;

const EMPTY_BROKER_DETAIL_SELECTION: BrokerDetailLaunchSelection = Object.freeze({
  brokerId: '',
  brokerName: 'Broker',
  brokerServer: 'Server',
  brokerServerUrl: '',
  brokerLogoUrl: '',
  brokerDomain: '',
});

const clean = (value: string | undefined) => String(value ?? '').trim();

/** Normalizes route/directory values while preserving the live broker identity. */
export function normalizeBrokerDetailLaunchSelection(
  selection: Partial<BrokerDetailLaunchSelection>,
): BrokerDetailLaunchSelection {
  const brokerId = clean(selection.brokerId);
  const brokerName = clean(selection.brokerName) || brokerId || 'Broker';
  return Object.freeze({
    brokerId,
    brokerName,
    brokerServer: clean(selection.brokerServer) || brokerId || 'Server',
    brokerServerUrl: clean(selection.brokerServerUrl),
    brokerLogoUrl: clean(selection.brokerLogoUrl),
    brokerDomain: clean(selection.brokerDomain),
  });
}

/** Converts a lightweight/live directory row into the stable route contract. */
export function toBrokerDetailLaunchSelection(
  broker: BrokerDetailLaunchDirectoryRecord,
): BrokerDetailLaunchSelection {
  return normalizeBrokerDetailLaunchSelection({
    brokerId: broker.brokerId,
    brokerName: broker.name,
    brokerServer: broker.server,
    brokerServerUrl: broker.serverUrl,
    brokerLogoUrl: broker.logoUrl,
    brokerDomain: broker.domain,
  });
}

const sameSelection = (
  left: BrokerDetailLaunchSelection,
  right: BrokerDetailLaunchSelection,
) => (
  left.brokerId === right.brokerId
  && left.brokerName === right.brokerName
  && left.brokerServer === right.brokerServer
  && left.brokerServerUrl === right.brokerServerUrl
  && left.brokerLogoUrl === right.brokerLogoUrl
  && left.brokerDomain === right.brokerDomain
);

const createSnapshot = (
  visible: boolean,
  navigationStarted: boolean,
  selection: BrokerDetailLaunchSelection,
  revision: number,
): BrokerDetailLaunchSnapshot => Object.freeze({
  visible,
  navigationStarted,
  selection,
  revision,
});

export function createBrokerDetailLaunchController(
  initialSelection: BrokerDetailLaunchSelection = EMPTY_BROKER_DETAIL_SELECTION,
): BrokerDetailLaunchController {
  const listeners = new Set<() => void>();
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  let visualApplier: BrokerDetailLaunchVisualApplier | null = null;
  let snapshot = createSnapshot(
    false,
    false,
    normalizeBrokerDetailLaunchSelection(initialSelection),
    0,
  );

  const clearFallbackTimer = () => {
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
  };

  const publish = (nextSnapshot: BrokerDetailLaunchSnapshot) => {
    snapshot = nextSnapshot;
    listeners.forEach((listener) => listener());
  };

  const hideCurrent = () => {
    clearFallbackTimer();
    visualApplier?.(false);

    if (!snapshot.visible) {
      return false;
    }

    publish(createSnapshot(false, false, snapshot.selection, snapshot.revision + 1));
    return true;
  };

  return Object.freeze({
    complete: hideCurrent,

    getSnapshot: () => snapshot,

    hide: (revision) => {
      if (revision !== undefined && snapshot.revision !== revision) {
        return false;
      }
      return hideCurrent();
    },

    isVisible: () => snapshot.visible,

    // The full route has painted, so the lightweight layer can be removed.
    markCovered: hideCurrent,

    prepare: (selection) => {
      const normalized = normalizeBrokerDetailLaunchSelection(selection);
      if (!snapshot.visible && sameSelection(snapshot.selection, normalized)) {
        return;
      }

      clearFallbackTimer();
      if (snapshot.visible) {
        visualApplier?.(false);
      }
      publish(createSnapshot(false, false, normalized, snapshot.revision + 1));
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

    show: (selection) => {
      clearFallbackTimer();
      const normalized = normalizeBrokerDetailLaunchSelection(selection);
      const preparedSelection = sameSelection(snapshot.selection, normalized)
        ? snapshot.selection
        : normalized;
      const revision = snapshot.revision + 1;

      // Publish the live broker first, then reveal the already-mounted layer.
      publish(createSnapshot(true, false, preparedSelection, revision));
      visualApplier?.(true);

      // Safety: never leave the preview above the app if navigation fails.
      fallbackTimer = setTimeout(() => {
        fallbackTimer = null;
        if (snapshot.visible && snapshot.revision === revision) {
          visualApplier?.(false);
          publish(createSnapshot(false, false, snapshot.selection, revision + 1));
        }
      }, BROKER_DETAIL_LAUNCH_FALLBACK_MS);

      return revision;
    },

    startNavigation: (revision) => {
      if (
        !snapshot.visible
        || snapshot.revision !== revision
        || snapshot.navigationStarted
      ) {
        return false;
      }

      publish(createSnapshot(true, true, snapshot.selection, revision));
      return true;
    },

    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}

type BrokerDetailLaunchControllerGlobal = typeof globalThis & {
  __rtx5BrokerDetailLaunchController?: BrokerDetailLaunchController;
  __rtx5BrokerDetailLaunchControllerVersion?: number;
};

const controllerGlobal = globalThis as BrokerDetailLaunchControllerGlobal;
const existingController = controllerGlobal.__rtx5BrokerDetailLaunchController;

export const brokerDetailLaunchController =
  existingController
    && controllerGlobal.__rtx5BrokerDetailLaunchControllerVersion === BROKER_DETAIL_LAUNCH_CONTROLLER_VERSION
    && typeof existingController.prepare === 'function'
    && typeof existingController.markCovered === 'function'
    && typeof existingController.registerVisualApplier === 'function'
    ? existingController
    : createBrokerDetailLaunchController();

controllerGlobal.__rtx5BrokerDetailLaunchController = brokerDetailLaunchController;
controllerGlobal.__rtx5BrokerDetailLaunchControllerVersion = BROKER_DETAIL_LAUNCH_CONTROLLER_VERSION;

export function completeBrokerDetailLaunch() {
  return brokerDetailLaunchController.complete();
}

export function hideBrokerDetailLaunch(revision?: number) {
  return brokerDetailLaunchController.hide(revision);
}

export function markBrokerDetailLaunchCovered() {
  return brokerDetailLaunchController.markCovered();
}

export function prepareBrokerDetailLaunch(selection: BrokerDetailLaunchSelection) {
  brokerDetailLaunchController.prepare(selection);
}

export function showBrokerDetailLaunch(selection: BrokerDetailLaunchSelection) {
  return brokerDetailLaunchController.show(selection);
}

/**
 * Reveals Broker Detail while Demo Account is already being popped back to it.
 * A fast second Back must wait for that pop and then remove Detail as well;
 * it must not take the forward-launch cancellation branch.
 */
export function showBrokerDetailReturnLaunch(selection: BrokerDetailLaunchSelection) {
  const revision = brokerDetailLaunchController.show(selection);
  brokerDetailLaunchController.startNavigation(revision);
  return revision;
}

export function scheduleBrokerDetailLaunchNavigation(
  revision: number,
  action: () => void,
) {
  const runIfCurrent = () => {
    if (brokerDetailLaunchController.startNavigation(revision)) {
      action();
    }
  };

  return scheduleAfterVisualFrames(runIfCurrent);
}

/** Keeps the actionable detail shell above Brokers until the native detail route painted. */
export function scheduleBrokerDetailLaunchCoverRemoval(revision: number) {
  const hideIfCurrent = () => {
    brokerDetailLaunchController.hide(revision);
  };

  return scheduleAfterVisualFrames(hideIfCurrent);
}
