import { scheduleAfterVisualFrame, scheduleAfterVisualFrames } from '../../utils/afterVisualFrame';
import { normalizeSymbol } from '../../domain/symbols';

export type ChartActionLaunchDestination =
  | 'objects'
  | 'calculator'
  | 'analytics'
  | 'specification';

export type ChartActionLaunchPhase =
  | 'prepared'
  | 'launching'
  | 'covered'
  | 'hidden';

export type ChartActionLaunchSnapshot = Readonly<{
  destination: ChartActionLaunchDestination;
  navigationStarted: boolean;
  phase: ChartActionLaunchPhase;
  revision: number;
  symbol: string;
  visible: boolean;
}>;

export type ChartActionLaunchVisualApplier = (
  destination: ChartActionLaunchDestination | null,
) => void;

export type ChartActionLaunchController = Readonly<{
  complete: (destination: ChartActionLaunchDestination, revision?: number) => boolean;
  getSnapshot: () => ChartActionLaunchSnapshot;
  hide: (revision?: number) => boolean;
  isVisible: () => boolean;
  markCovered: (destination: ChartActionLaunchDestination, revision?: number) => boolean;
  prepare: (symbol: string) => void;
  registerVisualApplier: (applier: ChartActionLaunchVisualApplier) => () => void;
  show: (destination: ChartActionLaunchDestination, symbol: string) => number;
  startNavigation: (revision: number) => boolean;
  subscribe: (listener: () => void) => () => void;
}>;

const CHART_ACTION_LAUNCH_FALLBACK_MS = 5_000;

const createSnapshot = (
  phase: ChartActionLaunchPhase,
  destination: ChartActionLaunchDestination,
  symbol: string,
  navigationStarted: boolean,
  revision: number,
): ChartActionLaunchSnapshot => Object.freeze({
  destination,
  navigationStarted,
  phase,
  revision,
  symbol: normalizeSymbol(symbol || 'EURUSD'),
  visible: phase === 'launching',
});

/**
 * Retained visual handoff for the four heavy Chart More destinations.
 * show() reveals an already-mounted lightweight screen before React constructs
 * the real route; the route removes that cover only after its own body paints.
 */
export function createChartActionLaunchController(
  initialSymbol = 'EURUSD',
): ChartActionLaunchController {
  const listeners = new Set<() => void>();
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  let snapshot = createSnapshot('hidden', 'objects', initialSymbol, false, 0);
  let visualApplier: ChartActionLaunchVisualApplier | null = null;

  const clearFallbackTimer = () => {
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
  };

  const publish = (nextSnapshot: ChartActionLaunchSnapshot) => {
    snapshot = nextSnapshot;
    listeners.forEach((listener) => listener());
  };

  const reset = (revision = snapshot.revision + 1) => {
    const alreadyHidden = snapshot.phase === 'hidden';
    clearFallbackTimer();
    if (snapshot.visible) {
      visualApplier?.(null);
    }
    if (alreadyHidden) {
      return false;
    }
    publish(createSnapshot(
      'hidden',
      snapshot.destination,
      snapshot.symbol,
      false,
      revision,
    ));
    return true;
  };

  return Object.freeze({
    complete: (destination, revision) => {
      if (
        snapshot.destination !== destination
        || snapshot.phase === 'hidden'
        || (revision !== undefined && snapshot.revision !== revision)
      ) {
        return false;
      }
      return reset();
    },

    getSnapshot: () => snapshot,

    hide: (revision) => {
      if (revision !== undefined && snapshot.revision !== revision) {
        return false;
      }
      return reset();
    },

    isVisible: () => snapshot.visible,

    markCovered: (destination, revision) => {
      if (
        snapshot.destination !== destination
        || (revision !== undefined && snapshot.revision !== revision)
        || (snapshot.phase !== 'launching' && snapshot.phase !== 'covered')
      ) {
        return false;
      }

      clearFallbackTimer();
      visualApplier?.(null);
      if (snapshot.phase !== 'covered') {
        publish(createSnapshot(
          'covered',
          snapshot.destination,
          snapshot.symbol,
          true,
          snapshot.revision,
        ));
      }
      return true;
    },

    prepare: (symbol) => {
      const normalizedSymbol = normalizeSymbol(symbol || 'EURUSD');
      // A chart refresh must never tear down an in-flight visual handoff. show()
      // owns the launch symbol and a later chart effect can prepare the next
      // symbol after the current route has covered or hidden this shell.
      if (snapshot.visible || snapshot.symbol === normalizedSymbol) {
        return;
      }

      clearFallbackTimer();
      publish(createSnapshot(
        'prepared',
        snapshot.destination,
        normalizedSymbol,
        false,
        snapshot.revision + 1,
      ));
    },

    registerVisualApplier: (applier) => {
      visualApplier = applier;
      applier(snapshot.visible ? snapshot.destination : null);
      return () => {
        if (visualApplier === applier) {
          visualApplier = null;
        }
      };
    },

    show: (destination, symbol) => {
      clearFallbackTimer();
      const revision = snapshot.revision + 1;
      const normalizedSymbol = normalizeSymbol(symbol || snapshot.symbol || 'EURUSD');

      // This synchronous visual write is deliberately before the React publish.
      visualApplier?.(destination);
      publish(createSnapshot(
        'launching',
        destination,
        normalizedSymbol,
        false,
        revision,
      ));

      fallbackTimer = setTimeout(() => {
        fallbackTimer = null;
        if (snapshot.phase === 'launching' && snapshot.revision === revision) {
          visualApplier?.(null);
          publish(createSnapshot(
            'hidden',
            snapshot.destination,
            snapshot.symbol,
            false,
            revision + 1,
          ));
        }
      }, CHART_ACTION_LAUNCH_FALLBACK_MS);

      return revision;
    },

    startNavigation: (revision) => {
      if (
        snapshot.phase !== 'launching'
        || snapshot.revision !== revision
        || snapshot.navigationStarted
      ) {
        return false;
      }
      publish(createSnapshot(
        'launching',
        snapshot.destination,
        snapshot.symbol,
        true,
        revision,
      ));
      return true;
    },

    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}

type ChartActionLaunchControllerGlobal = typeof globalThis & {
  __rtx5ChartActionLaunchController?: ChartActionLaunchController;
  __rtx5ChartActionLaunchControllerVersion?: number;
};

const CHART_ACTION_LAUNCH_CONTROLLER_VERSION = 6;
const controllerGlobal = globalThis as ChartActionLaunchControllerGlobal;
const existingController = controllerGlobal.__rtx5ChartActionLaunchController;

export const chartActionLaunchController =
  existingController
    && controllerGlobal.__rtx5ChartActionLaunchControllerVersion === CHART_ACTION_LAUNCH_CONTROLLER_VERSION
    && typeof existingController.prepare === 'function'
    && typeof existingController.markCovered === 'function'
    && typeof existingController.registerVisualApplier === 'function'
    ? existingController
    : createChartActionLaunchController();

controllerGlobal.__rtx5ChartActionLaunchController = chartActionLaunchController;
controllerGlobal.__rtx5ChartActionLaunchControllerVersion = CHART_ACTION_LAUNCH_CONTROLLER_VERSION;

export function completeChartActionLaunch(
  destination: ChartActionLaunchDestination,
  revision?: number,
) {
  return chartActionLaunchController.complete(destination, revision);
}

export function hideChartActionLaunch(revision?: number) {
  return chartActionLaunchController.hide(revision);
}

export function markChartActionLaunchCovered(
  destination: ChartActionLaunchDestination,
  revision?: number,
) {
  return chartActionLaunchController.markCovered(destination, revision);
}

export function prepareChartActionLaunch(symbol: string) {
  chartActionLaunchController.prepare(symbol);
}

export function showChartActionLaunch(
  destination: ChartActionLaunchDestination,
  symbol: string,
) {
  return chartActionLaunchController.show(destination, symbol);
}

export function scheduleChartActionLaunchNavigation(
  revision: number,
  action: () => void,
) {
  const runIfCurrent = () => {
    if (chartActionLaunchController.startNavigation(revision)) {
      action();
    }
  };

  // The retained cover must receive one frame before router construction can
  // evaluate a heavy calculator/analytics tree or wait on drawing sync.
  return scheduleAfterVisualFrame(runIfCurrent);
}

export function scheduleChartActionLaunchCovered(
  destination: ChartActionLaunchDestination,
  revision?: number,
) {
  // Direct/older route instances do not own an active retained cover. Requiring
  // the explicit route revision prevents one from hiding a newer launch.
  if (typeof revision !== 'number' || !Number.isFinite(revision)) {
    return;
  }
  const snapshot = chartActionLaunchController.getSnapshot();
  const expectedRevision = revision;
  if (
    !snapshot.visible
    || snapshot.destination !== destination
    || snapshot.revision !== expectedRevision
  ) {
    return;
  }

  const markIfCurrent = () => {
    markChartActionLaunchCovered(destination, expectedRevision);
  };
  return scheduleAfterVisualFrames(markIfCurrent);
}
