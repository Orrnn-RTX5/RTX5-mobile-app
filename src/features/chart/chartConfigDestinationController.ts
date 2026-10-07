/**
 * Sidebar-style retained destination controller for Chart Preferences
 * configuration rows (Schema & Colors, Price source, Open order mode, Alerts).
 *
 * Opens use a two-phase handoff: publish the destination so React can mount it
 * behind the current screen, then reveal its native layer only after the host
 * confirms that the destination has completed its first layout.
 */

export const CHART_CONFIG_DESTINATIONS = [
  'schema-colors',
  'price-source',
  'open-order-mode',
  'alerts',
] as const;

export type ChartConfigDestination = (typeof CHART_CONFIG_DESTINATIONS)[number];

export type ChartConfigDestinationSnapshot = Readonly<{
  destination: ChartConfigDestination | null;
  ready: boolean;
  revision: number;
  visible: boolean;
}>;

export type ChartConfigDestinationVisualApplier = (
  destination: ChartConfigDestination | null,
) => void;

export type ChartConfigDestinationController = Readonly<{
  getSnapshot: () => ChartConfigDestinationSnapshot;
  hide: (revision?: number) => boolean;
  isVisible: () => boolean;
  registerVisualApplier: (applier: ChartConfigDestinationVisualApplier) => () => void;
  revealMounted: (revision: number) => boolean;
  show: (destination: ChartConfigDestination) => number;
  subscribe: (listener: () => void) => () => void;
}>;

const CLOSED: ChartConfigDestinationSnapshot = Object.freeze({
  destination: null,
  ready: false,
  revision: 0,
  visible: false,
});

const CHART_CONFIG_CONTROLLER_VERSION = 2;

export function createChartConfigDestinationController(): ChartConfigDestinationController {
  const listeners = new Set<() => void>();
  let visualApplier: ChartConfigDestinationVisualApplier | null = null;
  let snapshot: ChartConfigDestinationSnapshot = CLOSED;

  const publish = (next: ChartConfigDestinationSnapshot) => {
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
        visualApplier?.(null);
        return false;
      }
      visualApplier?.(null);
      publish(Object.freeze({
        destination: snapshot.destination,
        ready: false,
        revision: snapshot.revision + 1,
        visible: false,
      }));
      return true;
    },

    isVisible: () => snapshot.visible,

    registerVisualApplier: (applier) => {
      visualApplier = applier;
      applier(snapshot.visible && snapshot.ready ? snapshot.destination : null);
      return () => {
        if (visualApplier === applier) {
          visualApplier = null;
        }
      };
    },

    revealMounted: (revision) => {
      const current = snapshot;
      if (
        !current.visible
        || current.ready
        || current.revision !== revision
        || current.destination === null
      ) {
        return false;
      }

      // The destination tree is now committed and laid out. It is safe to
      // reveal this exact revision before activating its live subscriptions.
      visualApplier?.(current.destination);
      publish(Object.freeze({
        ...current,
        ready: true,
      }));
      return true;
    },

    show: (destination) => {
      const revision = snapshot.revision + 1;
      // Conceal a previously revealed destination before preparing another.
      // The new layer stays hidden until revealMounted() acknowledges layout.
      if (snapshot.ready) {
        visualApplier?.(null);
      }
      publish(Object.freeze({
        destination,
        ready: false,
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

type ChartConfigControllerGlobal = typeof globalThis & {
  __rtx5ChartConfigDestinationController?: ChartConfigDestinationController;
  __rtx5ChartConfigDestinationControllerVersion?: number;
};

const controllerGlobal = globalThis as ChartConfigControllerGlobal;
const existing = controllerGlobal.__rtx5ChartConfigDestinationController;

export const chartConfigDestinationController =
  existing
    && controllerGlobal.__rtx5ChartConfigDestinationControllerVersion === CHART_CONFIG_CONTROLLER_VERSION
    && typeof existing.show === 'function'
    && typeof existing.revealMounted === 'function'
    && typeof existing.registerVisualApplier === 'function'
    ? existing
    : createChartConfigDestinationController();

controllerGlobal.__rtx5ChartConfigDestinationController = chartConfigDestinationController;
controllerGlobal.__rtx5ChartConfigDestinationControllerVersion = CHART_CONFIG_CONTROLLER_VERSION;

export function showChartConfigDestination(destination: ChartConfigDestination) {
  return chartConfigDestinationController.show(destination);
}

export function hideChartConfigDestination(revision?: number) {
  return chartConfigDestinationController.hide(revision);
}

export function isChartConfigDestinationVisible() {
  return chartConfigDestinationController.isVisible();
}
