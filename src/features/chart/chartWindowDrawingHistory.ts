import { normalizeTimeframe } from '../../domain/candles/core/candles';
import { getChartDrawingBucketKey, type PersistedChartDrawing } from './drawingPersistence';

const MAX_CHART_WINDOW_DRAWING_HISTORY = 50;

export type ChartWindowDrawingSnapshot = readonly PersistedChartDrawing[];

export type ChartWindowDrawingHistory = Readonly<{
  past: readonly ChartWindowDrawingSnapshot[];
  present: ChartWindowDrawingSnapshot;
  future: readonly ChartWindowDrawingSnapshot[];
}>;

export type ChartWindowDrawingHistoryTransition = Readonly<{
  changed: boolean;
  history: ChartWindowDrawingHistory;
  drawings: ChartWindowDrawingSnapshot;
}>;

const normalizeSnapshotDrawings = (
  drawings: readonly PersistedChartDrawing[],
): PersistedChartDrawing[] => drawings.map((drawing) => {
  // Selection is transient WebView presentation state. Keeping it in the host
  // history would make a simple object tap consume the next Undo operation.
  const { selected: _selected, ...persistentDrawing } = drawing;
  return persistentDrawing;
});

const drawingSnapshotSignature = (drawings: ChartWindowDrawingSnapshot): string =>
  JSON.stringify(normalizeSnapshotDrawings(drawings));

const freezeSnapshot = (
  drawings: readonly PersistedChartDrawing[],
): ChartWindowDrawingSnapshot => Object.freeze(normalizeSnapshotDrawings(drawings));

export const getChartWindowDrawingHistoryKey = (
  paneId: string,
  symbol: string,
  timeframe: string,
): string => JSON.stringify([
  paneId,
  getChartDrawingBucketKey(symbol),
  normalizeTimeframe(timeframe),
]);

export const createChartWindowDrawingHistory = (
  drawings: readonly PersistedChartDrawing[],
): ChartWindowDrawingHistory => Object.freeze({
  past: Object.freeze([]),
  present: freezeSnapshot(drawings),
  future: Object.freeze([]),
});

/**
 * Keeps a pane's history when persistence still represents the same present
 * snapshot. External edits become a new baseline instead of manufacturing an
 * undo entry for a change that did not originate from the chart engine.
 */
export const reconcileChartWindowDrawingHistory = (
  history: ChartWindowDrawingHistory | undefined,
  drawings: readonly PersistedChartDrawing[],
): ChartWindowDrawingHistory => {
  if (!history) return createChartWindowDrawingHistory(drawings);
  if (drawingSnapshotSignature(history.present) === drawingSnapshotSignature(drawings)) {
    return history;
  }
  return createChartWindowDrawingHistory(drawings);
};

export const recordChartWindowDrawingChange = (
  history: ChartWindowDrawingHistory,
  drawings: readonly PersistedChartDrawing[],
): ChartWindowDrawingHistory => {
  if (drawingSnapshotSignature(history.present) === drawingSnapshotSignature(drawings)) {
    return history;
  }
  return Object.freeze({
    past: Object.freeze([
      ...history.past.slice(-(MAX_CHART_WINDOW_DRAWING_HISTORY - 1)),
      history.present,
    ]),
    present: freezeSnapshot(drawings),
    future: Object.freeze([]),
  });
};

export const undoChartWindowDrawingHistory = (
  history: ChartWindowDrawingHistory,
): ChartWindowDrawingHistoryTransition => {
  const previous = history.past[history.past.length - 1];
  if (!previous) {
    return Object.freeze({ changed: false, history, drawings: history.present });
  }
  const nextHistory = Object.freeze({
    past: Object.freeze(history.past.slice(0, -1)),
    present: previous,
    future: Object.freeze([
      history.present,
      ...history.future.slice(0, MAX_CHART_WINDOW_DRAWING_HISTORY - 1),
    ]),
  });
  return Object.freeze({ changed: true, history: nextHistory, drawings: previous });
};

export const redoChartWindowDrawingHistory = (
  history: ChartWindowDrawingHistory,
): ChartWindowDrawingHistoryTransition => {
  const next = history.future[0];
  if (!next) {
    return Object.freeze({ changed: false, history, drawings: history.present });
  }
  const nextHistory = Object.freeze({
    past: Object.freeze([
      ...history.past.slice(-(MAX_CHART_WINDOW_DRAWING_HISTORY - 1)),
      history.present,
    ]),
    present: next,
    future: Object.freeze(history.future.slice(1)),
  });
  return Object.freeze({ changed: true, history: nextHistory, drawings: next });
};

export const getChartWindowDrawingHistoryAvailability = (
  history: ChartWindowDrawingHistory,
): Readonly<{ canUndo: boolean; canRedo: boolean }> => Object.freeze({
  canUndo: history.past.length > 0,
  canRedo: history.future.length > 0,
});
