/**
 * Chart-options-class retained host for trade position actions:
 * Close position / Close By / Modify position.
 *
 * Open flips a pre-mounted layer in the same JS turn (no router.push first paint).
 * Back only hides the host so return to Trade stays lag-free.
 */

export type TradePositionActionDestination = 'close' | 'close-by' | 'modify';

export type TradePositionActionHostSnapshot = Readonly<{
  revision: number;
  visible: boolean;
  destination: TradePositionActionDestination | null;
  positionId: string | null;
}>;

export type TradePositionActionHostVisualApplier = (visible: boolean) => void;

export type TradePositionActionHostController = Readonly<{
  getSnapshot: () => TradePositionActionHostSnapshot;
  hide: (revision?: number) => boolean;
  isVisible: () => boolean;
  registerVisualApplier: (applier: TradePositionActionHostVisualApplier) => () => void;
  show: (destination: TradePositionActionDestination, positionId: string) => number;
  subscribe: (listener: () => void) => () => void;
}>;

const CLOSED: TradePositionActionHostSnapshot = Object.freeze({
  revision: 0,
  visible: false,
  destination: null,
  positionId: null,
});

const TRADE_POSITION_ACTION_HOST_CONTROLLER_VERSION = 1;

export function createTradePositionActionHostController(): TradePositionActionHostController {
  const listeners = new Set<() => void>();
  let visualApplier: TradePositionActionHostVisualApplier | null = null;
  let snapshot: TradePositionActionHostSnapshot = CLOSED;

  const publish = (next: TradePositionActionHostSnapshot) => {
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
        destination: snapshot.destination,
        positionId: snapshot.positionId,
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

    show: (destination, positionId) => {
      const nextId = String(positionId ?? '').trim();
      if (!nextId) {
        return snapshot.revision;
      }
      const revision = snapshot.revision + 1;
      // Native visibility first — same ordering as ChartSettingsHost.
      visualApplier?.(true);
      publish(Object.freeze({
        revision,
        visible: true,
        destination,
        positionId: nextId,
      }));
      return revision;
    },

    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}

type TradePositionActionHostControllerGlobal = typeof globalThis & {
  __rtx5TradePositionActionHostController?: TradePositionActionHostController;
  __rtx5TradePositionActionHostControllerVersion?: number;
};

const controllerGlobal = globalThis as TradePositionActionHostControllerGlobal;
const existing = controllerGlobal.__rtx5TradePositionActionHostController;

export const tradePositionActionHostController =
  existing
    && controllerGlobal.__rtx5TradePositionActionHostControllerVersion === TRADE_POSITION_ACTION_HOST_CONTROLLER_VERSION
    && typeof existing.show === 'function'
    && typeof existing.registerVisualApplier === 'function'
    ? existing
    : createTradePositionActionHostController();

controllerGlobal.__rtx5TradePositionActionHostController = tradePositionActionHostController;
controllerGlobal.__rtx5TradePositionActionHostControllerVersion = TRADE_POSITION_ACTION_HOST_CONTROLLER_VERSION;

export function showTradePositionAction(
  destination: TradePositionActionDestination,
  positionId: string,
) {
  return tradePositionActionHostController.show(destination, positionId);
}

export function hideTradePositionActionHost(revision?: number) {
  return tradePositionActionHostController.hide(revision);
}

export function isTradePositionActionHostVisible() {
  return tradePositionActionHostController.isVisible();
}
