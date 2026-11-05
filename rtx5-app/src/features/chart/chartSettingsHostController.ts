/**
 * Sidebar-style retained host controller for Chart Preferences (toolbar options icon).
 *
 * Tap reveals a pre-mounted layer in the same JS turn; no router.push is required
 * for first paint. Back only flips visibility so return to chart stays lag-free.
 */

export type ChartSettingsHostSnapshot = Readonly<{
  revision: number;
  visible: boolean;
}>;

export type ChartSettingsHostVisualApplier = (visible: boolean) => void;

export type ChartSettingsHostController = Readonly<{
  getSnapshot: () => ChartSettingsHostSnapshot;
  hide: (revision?: number) => boolean;
  isVisible: () => boolean;
  registerVisualApplier: (applier: ChartSettingsHostVisualApplier) => () => void;
  show: () => number;
  subscribe: (listener: () => void) => () => void;
}>;

const CLOSED: ChartSettingsHostSnapshot = Object.freeze({
  revision: 0,
  visible: false,
});

const CHART_SETTINGS_HOST_CONTROLLER_VERSION = 1;

export function createChartSettingsHostController(): ChartSettingsHostController {
  const listeners = new Set<() => void>();
  let visualApplier: ChartSettingsHostVisualApplier | null = null;
  let snapshot: ChartSettingsHostSnapshot = CLOSED;

  const publish = (next: ChartSettingsHostSnapshot) => {
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
      // UI-thread / native visibility first — same ordering as sidebar hosts.
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

type ChartSettingsHostControllerGlobal = typeof globalThis & {
  __rtx5ChartSettingsHostController?: ChartSettingsHostController;
  __rtx5ChartSettingsHostControllerVersion?: number;
};

const controllerGlobal = globalThis as ChartSettingsHostControllerGlobal;
const existing = controllerGlobal.__rtx5ChartSettingsHostController;

export const chartSettingsHostController =
  existing
    && controllerGlobal.__rtx5ChartSettingsHostControllerVersion === CHART_SETTINGS_HOST_CONTROLLER_VERSION
    && typeof existing.show === 'function'
    && typeof existing.registerVisualApplier === 'function'
    ? existing
    : createChartSettingsHostController();

controllerGlobal.__rtx5ChartSettingsHostController = chartSettingsHostController;
controllerGlobal.__rtx5ChartSettingsHostControllerVersion = CHART_SETTINGS_HOST_CONTROLLER_VERSION;

export function showChartSettingsHost() {
  return chartSettingsHostController.show();
}

export function hideChartSettingsHost(revision?: number) {
  return chartSettingsHostController.hide(revision);
}

export function isChartSettingsHostVisible() {
  return chartSettingsHostController.isVisible();
}
