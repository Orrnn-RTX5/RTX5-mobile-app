/**
 * Sidebar-style retained host controller for History date filter (clock icon).
 *
 * Tap reveals a pre-mounted layer in the same JS turn; no router.push is required
 * for first paint. Back only flips visibility so return to History stays lag-free.
 */

export type HistoryFilterHostSnapshot = Readonly<{
  revision: number;
  visible: boolean;
}>;

export type HistoryFilterHostVisualApplier = (visible: boolean) => void;

export type HistoryFilterHostController = Readonly<{
  getSnapshot: () => HistoryFilterHostSnapshot;
  hide: (revision?: number) => boolean;
  isVisible: () => boolean;
  registerVisualApplier: (applier: HistoryFilterHostVisualApplier) => () => void;
  show: () => number;
  subscribe: (listener: () => void) => () => void;
}>;

const CLOSED: HistoryFilterHostSnapshot = Object.freeze({
  revision: 0,
  visible: false,
});

const HISTORY_FILTER_HOST_CONTROLLER_VERSION = 1;

export function createHistoryFilterHostController(): HistoryFilterHostController {
  const listeners = new Set<() => void>();
  let visualApplier: HistoryFilterHostVisualApplier | null = null;
  let snapshot: HistoryFilterHostSnapshot = CLOSED;

  const publish = (next: HistoryFilterHostSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  return Object.freeze({
    getSnapshot: () => snapshot,

    hide: (revision?: number) => {
      if (revision !== undefined && snapshot.revision !== revision) {
        return false;
      }
      if (!snapshot.visible) {
        visualApplier?.(false);
        return false;
      }
      visualApplier?.(false);
      publish(Object.freeze({
        revision: snapshot.revision + 1,
        visible: false,
      }));
      return true;
    },

    isVisible: () => snapshot.visible,

    registerVisualApplier: (applier) => {
      visualApplier = applier;
      applier(snapshot.visible);
      return () => {
        if (visualApplier === applier) {
          visualApplier = null;
        }
      };
    },

    show: () => {
      const revision = snapshot.revision + 1;
      visualApplier?.(true);
      publish(Object.freeze({
        revision,
        visible: true,
      }));
      return revision;
    },

    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}

type HistoryFilterHostControllerGlobal = typeof globalThis & {
  __rtx5HistoryFilterHostController?: HistoryFilterHostController;
  __rtx5HistoryFilterHostControllerVersion?: number;
};

const controllerGlobal = globalThis as HistoryFilterHostControllerGlobal;
const existing = controllerGlobal.__rtx5HistoryFilterHostController;

export const historyFilterHostController =
  existing
    && controllerGlobal.__rtx5HistoryFilterHostControllerVersion === HISTORY_FILTER_HOST_CONTROLLER_VERSION
    && typeof existing.show === 'function'
    && typeof existing.registerVisualApplier === 'function'
    ? existing
    : createHistoryFilterHostController();

controllerGlobal.__rtx5HistoryFilterHostController = historyFilterHostController;
controllerGlobal.__rtx5HistoryFilterHostControllerVersion = HISTORY_FILTER_HOST_CONTROLLER_VERSION;

export function showHistoryFilterHost() {
  return historyFilterHostController.show();
}

export function hideHistoryFilterHost(revision?: number) {
  return historyFilterHostController.hide(revision);
}

export function isHistoryFilterHostVisible() {
  return historyFilterHostController.isVisible();
}
