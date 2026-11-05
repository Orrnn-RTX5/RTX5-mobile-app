/**
 * Coordinates the chart timeframe picker so a toolbar tap can paint the
 * retained overlay immediately without reconciling the giant ChartScreen tree.
 *
 * Pattern matches fast-tab / retained ActionSheet hosts:
 * 1. register a native applier that setNativeProps opacity/pointerEvents
 * 2. show/hide flips native layers first, then notifies React subscribers
 */
import { useSyncExternalStore } from 'react';

export type ChartTimeframePickerApplier = (visible: boolean) => void;

type ChartTimeframePickerSnapshot = Readonly<{
  visible: boolean;
  revision: number;
}>;

export type ChartTimeframePickerController = {
  version: number;
  getSnapshot: () => ChartTimeframePickerSnapshot;
  subscribe: (listener: () => void) => () => void;
  show: () => number;
  hide: (revision?: number) => void;
  registerApplier: (applier: ChartTimeframePickerApplier) => () => void;
};

const CONTROLLER_VERSION = 1;

type ChartTimeframePickerGlobal = typeof globalThis & {
  __rtx5ChartTimeframePickerController?: ChartTimeframePickerController;
};

export function createChartTimeframePickerController(): ChartTimeframePickerController {
  const listeners = new Set<() => void>();
  const appliers = new Set<ChartTimeframePickerApplier>();
  let snapshot: ChartTimeframePickerSnapshot = Object.freeze({
    visible: false,
    revision: 0,
  });

  const publish = (visible: boolean, revision: number, notifySubscribers = true) => {
    snapshot = Object.freeze({ visible, revision });
    if (notifySubscribers) {
      listeners.forEach((listener) => listener());
    }
  };

  const applyNative = (visible: boolean) => {
    appliers.forEach((applier) => applier(visible));
  };

  return {
    version: CONTROLLER_VERSION,
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    show: () => {
      const revision = snapshot.revision + 1;
      // Native reveal first so the first paint never waits on ChartScreen.
      applyNative(true);
      publish(true, revision);
      return revision;
    },
    hide: (revision?: number) => {
      if (revision !== undefined && snapshot.revision !== revision) {
        return;
      }
      if (!snapshot.visible && revision === undefined) {
        return;
      }
      const nextRevision = snapshot.revision + 1;
      applyNative(false);
      publish(false, nextRevision);
    },
    registerApplier: (applier: ChartTimeframePickerApplier) => {
      appliers.add(applier);
      applier(snapshot.visible);
      return () => {
        appliers.delete(applier);
      };
    },
  };
}

const controllerGlobal = globalThis as ChartTimeframePickerGlobal;
const existingController = controllerGlobal.__rtx5ChartTimeframePickerController;
export const chartTimeframePickerController =
  existingController
    && existingController.version === CONTROLLER_VERSION
    && typeof existingController.show === 'function'
    && typeof existingController.hide === 'function'
    && typeof existingController.registerApplier === 'function'
    ? existingController
    : createChartTimeframePickerController();
controllerGlobal.__rtx5ChartTimeframePickerController = chartTimeframePickerController;

export function showChartTimeframePicker() {
  return chartTimeframePickerController.show();
}

export function hideChartTimeframePicker(revision?: number) {
  chartTimeframePickerController.hide(revision);
}

export function registerChartTimeframePickerApplier(applier: ChartTimeframePickerApplier) {
  return chartTimeframePickerController.registerApplier(applier);
}

export function useChartTimeframePickerVisible(
  controller: ChartTimeframePickerController = chartTimeframePickerController,
) {
  return useSyncExternalStore(
    controller.subscribe,
    () => controller.getSnapshot().visible,
    () => controller.getSnapshot().visible,
  );
}
