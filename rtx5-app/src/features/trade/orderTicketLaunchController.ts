import { scheduleAfterVisualFrame } from '../../utils/afterVisualFrame';
/**
 * Controls the short handoff from New Order to the full ticket:
 * prepare the symbol, show a lightweight ticket, then open the real route.
 */
import { normalizeSymbol } from '../../domain/symbols';

export type OrderTicketLaunchSnapshot = Readonly<{
  visible: boolean;
  symbol: string;
  origin: OrderTicketOrigin;
  navigationStarted: boolean;
  /** Changes on every launch so delayed work from an older tap can be ignored. */
  revision: number;
}>;

export type OrderTicketOrigin = 'quotes' | 'chart' | 'trade';

export function resolveOrderTicketOrigin(value: unknown): OrderTicketOrigin {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === 'quotes' || candidate === 'chart' || candidate === 'trade'
    ? candidate
    : 'trade';
}

export function getOrderTicketOriginHref(origin: OrderTicketOrigin) {
  return `/(tabs)/${origin}` as const;
}

export type OrderTicketLaunchVisualApplier = (visible: boolean) => void;

export type OrderTicketLaunchController = Readonly<{
  version: number;
  getSnapshot: () => OrderTicketLaunchSnapshot;
  subscribe: (listener: () => void) => () => void;
  prepare: (symbol: string, origin?: OrderTicketOrigin) => void;
  show: (symbol: string, origin?: OrderTicketOrigin) => number;
  hide: (revision?: number) => boolean;
  isVisible: () => boolean;
  startNavigation: (revision: number) => boolean;
  registerVisualApplier: (applier: OrderTicketLaunchVisualApplier) => () => void;
}>;

const ORDER_TICKET_LAUNCH_FALLBACK_MS = 5_000;
const ORDER_TICKET_LAUNCH_CONTROLLER_VERSION = 2;

const createSnapshot = (
  visible: boolean,
  symbol: string,
  origin: OrderTicketOrigin,
  navigationStarted: boolean,
  revision: number,
): OrderTicketLaunchSnapshot => Object.freeze({
  visible,
  symbol: normalizeSymbol(symbol || 'EURUSD'),
  origin,
  navigationStarted,
  revision,
});

export function createOrderTicketLaunchController(
  initialSymbol = 'EURUSD',
): OrderTicketLaunchController {
  const listeners = new Set<() => void>();
  let visualApplier: OrderTicketLaunchVisualApplier | null = null;
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  let snapshot = createSnapshot(false, initialSymbol, 'trade', false, 0);

  const clearFallbackTimer = () => {
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
  };

  const publish = (nextSnapshot: OrderTicketLaunchSnapshot) => {
    snapshot = nextSnapshot;
    listeners.forEach((listener) => listener());
  };

  const hideCurrent = () => {
    if (!snapshot.visible) {
      return false;
    }

    clearFallbackTimer();
    visualApplier?.(false);
    publish(createSnapshot(false, snapshot.symbol, snapshot.origin, false, snapshot.revision + 1));
    return true;
  };

  return Object.freeze({
    version: ORDER_TICKET_LAUNCH_CONTROLLER_VERSION,
    getSnapshot: () => snapshot,

    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    prepare: (symbol: string, origin: OrderTicketOrigin = 'trade') => {
      // Remember the tapped symbol while the options sheet is still visible.
      const normalizedSymbol = normalizeSymbol(symbol || 'EURUSD');
      if (snapshot.symbol === normalizedSymbol && snapshot.origin === origin && !snapshot.visible) {
        return;
      }

      // Never tear down a visible launch shell from idle prepare() work. Chart
      // Buy/Sell schedule router.push after a double-rAF paint; a concurrent
      // prepare (symbol list refresh, focus effect) used to hide the shell,
      // fail startNavigation, and leave the chart trade lock held forever.
      if (snapshot.visible) {
        return;
      }

      clearFallbackTimer();
      publish(createSnapshot(false, normalizedSymbol, origin, false, snapshot.revision + 1));
    },

    show: (symbol: string, origin: OrderTicketOrigin = 'trade') => {
      clearFallbackTimer();
      const revision = snapshot.revision + 1;
      const normalizedSymbol = normalizeSymbol(symbol || snapshot.symbol || 'EURUSD');

      // Show the ready ticket first; the real route starts after it has painted.
      visualApplier?.(true);
      publish(createSnapshot(true, normalizedSymbol, origin, false, revision));

      // Safety: hide the preview if the full ticket never finishes opening.
      fallbackTimer = setTimeout(() => {
        fallbackTimer = null;
        if (snapshot.visible && snapshot.revision === revision) {
          visualApplier?.(false);
          publish(createSnapshot(false, snapshot.symbol, snapshot.origin, false, revision + 1));
        }
      }, ORDER_TICKET_LAUNCH_FALLBACK_MS);

      return revision;
    },

    hide: (revision?: number) => {
      if (revision !== undefined && snapshot.revision !== revision) {
        return false;
      }
      return hideCurrent();
    },

    isVisible: () => snapshot.visible,

    startNavigation: (revision: number) => {
      if (
        !snapshot.visible
        || snapshot.revision !== revision
        || snapshot.navigationStarted
      ) {
        return false;
      }

      publish(createSnapshot(true, snapshot.symbol, snapshot.origin, true, revision));
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

type OrderTicketLaunchControllerGlobal = typeof globalThis & {
  __rtx5OrderTicketLaunchController?: OrderTicketLaunchController;
};

const controllerGlobal = globalThis as OrderTicketLaunchControllerGlobal;
const existingController = controllerGlobal.__rtx5OrderTicketLaunchController;

export const orderTicketLaunchController =
  existingController
    && existingController.version === ORDER_TICKET_LAUNCH_CONTROLLER_VERSION
    && typeof existingController.prepare === 'function'
    && typeof existingController.startNavigation === 'function'
    && typeof existingController.registerVisualApplier === 'function'
    ? existingController
    : createOrderTicketLaunchController();

controllerGlobal.__rtx5OrderTicketLaunchController = orderTicketLaunchController;

export function prepareOrderTicketLaunch(symbol: string, origin: OrderTicketOrigin = 'trade') {
  orderTicketLaunchController.prepare(symbol, origin);
}

export function showOrderTicketLaunch(symbol: string, origin: OrderTicketOrigin = 'trade') {
  return orderTicketLaunchController.show(symbol, origin);
}

export function hideOrderTicketLaunch(revision?: number) {
  return orderTicketLaunchController.hide(revision);
}

export function scheduleOrderTicketLaunchNavigation(
  revision: number,
  action: () => void,
  onCancelled?: () => void,
) {
  const runIfCurrent = () => {
    if (orderTicketLaunchController.startNavigation(revision)) {
      action();
      return;
    }
    // Callers (chart Buy/Sell) must free tap locks when the shell was hidden
    // before navigation could start — otherwise every later tap is a no-op.
    onCancelled?.();
  };

  // Shell is already shown via UI-thread setNativeProps/shared value. One paint
  // frame is enough before router.push — double-rAF added ~32ms of dead wait
  // on every Buy/Sell open with no visual benefit.
  return scheduleAfterVisualFrame(runIfCurrent);
}
