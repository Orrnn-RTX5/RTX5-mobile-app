import type { ComponentProps } from 'react';

import type { ActionSheet } from '../../ui/components/ActionSheet/ActionSheet';

/**
 * Owns the chart symbol picker's preloaded ActionSheet outside ChartScreen.
 * Each close replaces the hidden native host while preserving its exact rows,
 * so a repeat open cannot reuse Android's cached final pose from the prior one.
 */

export type ChartSymbolPickerSheetConfig = Omit<
  ComponentProps<typeof ActionSheet>,
  'visible' | 'onClose' | 'visualKey'
> & Readonly<{ visualKey: string }>;

export type ChartSymbolPickerSheetSnapshot = Readonly<{
  config: ChartSymbolPickerSheetConfig | null;
  hostEpoch: number;
  revision: number;
  visible: boolean;
}>;

// A tiny external store lets one top-level host survive continuous chart renders.
const listeners = new Set<() => void>();
let snapshot: ChartSymbolPickerSheetSnapshot = Object.freeze({
  config: null,
  hostEpoch: 0,
  revision: 0,
  visible: false,
});
// These fields separate the currently visible interaction from a newer config
// that must wait until close.
let interactionActive = false;
let deferredConfig: ChartSymbolPickerSheetConfig | null = null;

const publishSnapshot = (
  config: ChartSymbolPickerSheetConfig | null,
  visible: boolean,
  replaceNativeHost = false,
) => {
  // Freeze each published value so subscribers always observe one coherent
  // config/visibility revision rather than partially updated controller state.
  snapshot = Object.freeze({
    config,
    hostEpoch: snapshot.hostEpoch + (replaceNativeHost ? 1 : 0),
    revision: snapshot.revision + 1,
    visible,
  });
  listeners.forEach((listener) => listener());
};

export const subscribeChartSymbolPickerSheet = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getChartSymbolPickerSheetSnapshot = () => snapshot;

/** Keeps the exact searchable symbol rows mounted before either chart launcher is touched. */
export function preloadChartSymbolPickerSheet(config: ChartSymbolPickerSheetConfig) {
  if (interactionActive || snapshot.visible) {
    // Keep a visible interaction internally consistent. Fresh market-symbol
    // rows are adopted as soon as the current sheet closes.
    deferredConfig = config;
    return false;
  }
  if (snapshot.config === config) {
    return false;
  }
  publishSnapshot(config, false);
  return true;
}

/**
 * Opens the already-mounted hidden host through one React visibility edge.
 * The preceding close has already replaced any host that reached a visible
 * final pose, keeping first and repeat opens on the same clean path.
 */
export function showChartSymbolPickerSheet(config: ChartSymbolPickerSheetConfig) {
  if (interactionActive || snapshot.visible) {
    if (snapshot.config !== config) {
      deferredConfig = config;
    }
    return false;
  }

  deferredConfig = null;
  interactionActive = true;
  publishSnapshot(config, true);
  return true;
}

export function hideChartSymbolPickerSheet() {
  const wasVisible = snapshot.visible;
  const wasActive =
    interactionActive
    || snapshot.visible;
  interactionActive = false;

  // Adopt symbol-list changes deferred during the interaction only after
  // hiding; swapping rows while visible would reveal a mismatched sheet.
  const nextConfig = deferredConfig ?? snapshot.config;
  deferredConfig = null;
  if (snapshot.visible || snapshot.config !== nextConfig) {
    // Recreate only after a real visible interaction. The replacement mounts
    // hidden with the same preloaded rows, removing the previous compositor
    // surface before another symbol tap can reveal it.
    publishSnapshot(nextConfig, false, wasVisible);
  }
  return wasActive;
}

export function isChartSymbolPickerSheetActive() {
  return interactionActive || snapshot.visible;
}

export function disposeChartSymbolPickerSheet() {
  // The top-level host calls this only on a real unmount.
  interactionActive = false;
  deferredConfig = null;
  if (snapshot.config !== null || snapshot.visible) {
    publishSnapshot(null, false);
  }
}

export function resetChartSymbolPickerSheetControllerForTests() {
  interactionActive = false;
  deferredConfig = null;
  snapshot = Object.freeze({
    config: null,
    hostEpoch: 0,
    revision: 0,
    visible: false,
  });
  listeners.forEach((listener) => listener());
}
