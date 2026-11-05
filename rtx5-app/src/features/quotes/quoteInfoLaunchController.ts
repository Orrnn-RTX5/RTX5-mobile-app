import { scheduleAfterVisualFrame, scheduleAfterVisualFrames } from '../../utils/afterVisualFrame';
/**
 * Controls the short handoff from a symbol option to Properties or Market
 * Statistics: prepare the symbol, show a lightweight screen, then open the real route.
 */
import { normalizeSymbol } from '../../domain/symbols';

export type QuoteInfoLaunchDestination = 'properties' | 'market-statistics';
// prepared: symbol is ready; launching: preview is visible; covered: the real
// screen has painted; hidden: the handoff has finished.
export type QuoteInfoLaunchPhase =
  | 'prepared'
  | 'launching'
  | 'covered'
  | 'hidden';

export type QuoteInfoLaunchSnapshot = Readonly<{
  destination: QuoteInfoLaunchDestination;
  navigationStarted: boolean;
  phase: QuoteInfoLaunchPhase;
  /** Changes on every launch so delayed work from an older tap can be ignored. */
  revision: number;
  symbol: string;
  visible: boolean;
}>;

export type QuoteInfoLaunchVisualApplier = (
  destination: QuoteInfoLaunchDestination | null,
) => void;

export type QuoteInfoLaunchController = Readonly<{
  complete: (destination: QuoteInfoLaunchDestination) => boolean;
  getSnapshot: () => QuoteInfoLaunchSnapshot;
  hide: (revision?: number) => boolean;
  isVisible: () => boolean;
  markCovered: (destination: QuoteInfoLaunchDestination) => boolean;
  prepare: (symbol: string) => void;
  registerVisualApplier: (applier: QuoteInfoLaunchVisualApplier) => () => void;
  show: (destination: QuoteInfoLaunchDestination, symbol: string) => number;
  startNavigation: (revision: number) => boolean;
  subscribe: (listener: () => void) => () => void;
}>;

const QUOTE_INFO_LAUNCH_FALLBACK_MS = 5_000;

const createSnapshot = (
  phase: QuoteInfoLaunchPhase,
  destination: QuoteInfoLaunchDestination,
  symbol: string,
  navigationStarted: boolean,
  revision: number,
): QuoteInfoLaunchSnapshot => Object.freeze({
  destination,
  navigationStarted,
  phase,
  revision,
  symbol: normalizeSymbol(symbol || 'EURUSD'),
  visible: phase === 'launching',
});

export function createQuoteInfoLaunchController(
  initialSymbol = 'EURUSD',
): QuoteInfoLaunchController {
  const listeners = new Set<() => void>();
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  let snapshot = createSnapshot('hidden', 'properties', initialSymbol, false, 0);
  let visualApplier: QuoteInfoLaunchVisualApplier | null = null;

  const clearFallbackTimer = () => {
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
  };

  const publish = (nextSnapshot: QuoteInfoLaunchSnapshot) => {
    snapshot = nextSnapshot;
    listeners.forEach((listener) => listener());
  };

  const reset = () => {
    const alreadyHidden = snapshot.phase === 'hidden';
    clearFallbackTimer();
    // Once the real route has covered the retained shell, its UI-thread value
    // is already zero. Repeating the synchronous visual write during Back can
    // wait behind Android/WebView rendering and starve the press frame.
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
      snapshot.revision + 1,
    ));
    return true;
  };

  return Object.freeze({
    complete: (destination) => {
      if (snapshot.destination !== destination || snapshot.phase === 'hidden') {
        return false;
      }
      return reset();
    },

    getSnapshot: () => snapshot,

    hide: (revision?: number) => {
      if (revision !== undefined && snapshot.revision !== revision) {
        return false;
      }
      return reset();
    },

    isVisible: () => snapshot.visible,

    // The real screen has painted, so it can safely replace the preview.
    markCovered: (destination) => {
      if (
        snapshot.destination !== destination
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
      // Remember the tapped symbol while the options sheet is still visible.
      const normalizedSymbol = normalizeSymbol(symbol || 'EURUSD');
      if (snapshot.symbol === normalizedSymbol && snapshot.phase !== 'launching') {
        return;
      }

      clearFallbackTimer();
      if (snapshot.visible) {
        visualApplier?.(null);
      }
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

      // Reveal the selected ready screen before starting route construction.
      visualApplier?.(destination);
      publish(createSnapshot(
        'launching',
        destination,
        normalizedSymbol,
        false,
        revision,
      ));

      // Safety: hide the preview if the real route never finishes opening.
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
      }, QUOTE_INFO_LAUNCH_FALLBACK_MS);

      return revision;
    },

    startNavigation: (revision) => {
      if (snapshot.phase !== 'launching' || snapshot.revision !== revision) {
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

type QuoteInfoLaunchControllerGlobal = typeof globalThis & {
  __rtx5QuoteInfoLaunchController?: QuoteInfoLaunchController;
  __rtx5QuoteInfoLaunchControllerVersion?: number;
};

const QUOTE_INFO_LAUNCH_CONTROLLER_VERSION = 2;
const controllerGlobal = globalThis as QuoteInfoLaunchControllerGlobal;
const existingController = controllerGlobal.__rtx5QuoteInfoLaunchController;

export const quoteInfoLaunchController =
  existingController
    && controllerGlobal.__rtx5QuoteInfoLaunchControllerVersion === QUOTE_INFO_LAUNCH_CONTROLLER_VERSION
    && typeof existingController.prepare === 'function'
    && typeof existingController.markCovered === 'function'
    && typeof existingController.registerVisualApplier === 'function'
    ? existingController
    : createQuoteInfoLaunchController();

controllerGlobal.__rtx5QuoteInfoLaunchController = quoteInfoLaunchController;
controllerGlobal.__rtx5QuoteInfoLaunchControllerVersion = QUOTE_INFO_LAUNCH_CONTROLLER_VERSION;

export function completeQuoteInfoLaunch(destination: QuoteInfoLaunchDestination) {
  return quoteInfoLaunchController.complete(destination);
}

export function hideQuoteInfoLaunch(revision?: number) {
  return quoteInfoLaunchController.hide(revision);
}

export function markQuoteInfoLaunchCovered(destination: QuoteInfoLaunchDestination) {
  return quoteInfoLaunchController.markCovered(destination);
}

export function prepareQuoteInfoLaunch(symbol: string) {
  quoteInfoLaunchController.prepare(symbol);
}

export function showQuoteInfoLaunch(
  destination: QuoteInfoLaunchDestination,
  symbol: string,
) {
  return quoteInfoLaunchController.show(destination, symbol);
}

/**
 * Back cover: re-reveal the retained shell ABOVE the stack in this press turn
 * so the native pop never exposes a laggy Quotes remount. Caller pops the route
 * after one visual frame, then hideQuoteInfoLaunch(revision).
 */
export function beginQuoteInfoBackCover(
  destination: QuoteInfoLaunchDestination,
  symbol: string,
) {
  const revision = quoteInfoLaunchController.show(destination, symbol);
  quoteInfoLaunchController.startNavigation(revision);
  return revision;
}

export function scheduleQuoteInfoLaunchNavigation(
  revision: number,
  action: () => void,
) {
  const runIfCurrent = () => {
    if (quoteInfoLaunchController.startNavigation(revision)) {
      action();
    }
  };

  // Shell is already on the UI thread from show(). Push the real route after
  // one paint frame so open stays Brokers+/New-Order class.
  return scheduleAfterVisualFrame(runIfCurrent);
}

/** Drop the back-cover shell after Quotes has had a chance to paint under it. */
export function scheduleQuoteInfoBackCoverRemoval(revision: number) {
  const hideIfCurrent = () => {
    quoteInfoLaunchController.hide(revision);
  };

  return scheduleAfterVisualFrames(hideIfCurrent);
}
