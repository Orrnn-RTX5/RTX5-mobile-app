import type { ReactNode } from 'react';

export type ChartTradeSheetPortalPresentation = Readonly<{
  keepMounted: boolean;
  visible: boolean;
  top: number;
  bottom: number;
}>;

export type ChartTradeSheetPortalSnapshot = ChartTradeSheetPortalPresentation & Readonly<{
  owner: symbol | null;
  renderCurrent: (() => ReactNode) | null;
  revision: number;
}>;

export type ChartTradeSheetPortalController = Readonly<{
  getSnapshot: () => ChartTradeSheetPortalSnapshot;
  subscribe: (listener: () => void) => () => void;
  register: (owner: symbol, renderCurrent: () => ReactNode) => () => void;
  setPresentation: (
    owner: symbol,
    presentation: ChartTradeSheetPortalPresentation,
  ) => boolean;
  invalidate: (owner: symbol) => boolean;
}>;

function normalizeInset(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function createEmptySnapshot(revision: number): ChartTradeSheetPortalSnapshot {
  return Object.freeze({
    owner: null,
    renderCurrent: null,
    keepMounted: false,
    visible: false,
    top: 0,
    bottom: 0,
    revision,
  });
}

/**
 * Keeps the live Chart-owned sheet render function outside navigator state.
 * Only the isolated portal host subscribes, so quote updates never reconcile
 * the retained tab scenes or the bottom menu.
 */
export function createChartTradeSheetPortalController(): ChartTradeSheetPortalController {
  const listeners = new Set<() => void>();
  let snapshot = createEmptySnapshot(0);

  const publish = (nextSnapshot: ChartTradeSheetPortalSnapshot) => {
    snapshot = Object.freeze(nextSnapshot);
    listeners.forEach((listener) => listener());
  };

  return Object.freeze({
    getSnapshot: () => snapshot,

    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    register: (owner: symbol, renderCurrent: () => ReactNode) => {
      publish({
        owner,
        renderCurrent,
        keepMounted: false,
        visible: false,
        top: 0,
        bottom: 0,
        revision: snapshot.revision + 1,
      });

      return () => {
        if (snapshot.owner === owner) {
          publish(createEmptySnapshot(snapshot.revision + 1));
        }
      };
    },

    setPresentation: (owner, presentation) => {
      if (snapshot.owner !== owner) {
        return false;
      }

      const nextPresentation = {
        keepMounted: presentation.keepMounted,
        visible: presentation.keepMounted && presentation.visible,
        top: normalizeInset(presentation.top),
        bottom: normalizeInset(presentation.bottom),
      };
      if (
        snapshot.keepMounted === nextPresentation.keepMounted
        && snapshot.visible === nextPresentation.visible
        && snapshot.top === nextPresentation.top
        && snapshot.bottom === nextPresentation.bottom
      ) {
        return false;
      }

      publish({
        ...snapshot,
        ...nextPresentation,
        revision: snapshot.revision + 1,
      });
      return true;
    },

    invalidate: (owner) => {
      if (snapshot.owner !== owner || !snapshot.keepMounted || !snapshot.visible) {
        return false;
      }

      publish({
        ...snapshot,
        revision: snapshot.revision + 1,
      });
      return true;
    },
  });
}
