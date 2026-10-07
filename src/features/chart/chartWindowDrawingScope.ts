import { normalizeTimeframe } from '../../domain/candles/core/candles';
import {
  getChartDrawingBucketKey,
  type PersistedChartDrawing,
} from './drawingPersistence';
import type { ChartWindowPane } from './chartWindowState';

const WINDOW_DRAWING_ID_SEPARATOR = '::chart-window::';

export const getChartWindowScopedDrawingId = (
  drawingId: string,
  paneId: string,
): string => `${drawingId}${WINDOW_DRAWING_ID_SEPARATOR}${paneId}`;

export const isChartDrawingForWindowContext = (
  drawing: PersistedChartDrawing,
  symbol: string,
  timeframe: string,
): boolean => {
  if (
    drawing.symbol
    && getChartDrawingBucketKey(drawing.symbol) !== getChartDrawingBucketKey(symbol)
  ) {
    return false;
  }
  return !drawing.timeframe
    || normalizeTimeframe(drawing.timeframe) === normalizeTimeframe(timeframe);
};

export const isChartDrawingForWindowPane = (
  drawing: PersistedChartDrawing,
  paneId: string,
): boolean => !drawing.chartWindowPaneId || drawing.chartWindowPaneId === paneId;

const cloneDrawingForPane = (
  drawing: PersistedChartDrawing,
  paneId: string,
): PersistedChartDrawing => ({
  ...drawing,
  id: getChartWindowScopedDrawingId(drawing.id, paneId),
  chartWindowPaneId: paneId,
  points: drawing.points.map((point) => ({ ...point })),
});

/**
 * Splitting an existing chart starts both panes from the same persisted
 * drawings, then gives each clone an independent window owner and record ID.
 */
export function expandChartDrawingsForSplitWindows(
  drawings: readonly PersistedChartDrawing[],
  panes: readonly ChartWindowPane[],
  bucketSymbol: string,
): PersistedChartDrawing[] {
  if (panes.length <= 1) return drawings as PersistedChartDrawing[];
  const livePaneIds = new Set(panes.map((pane) => pane.id));
  let changed = false;
  const next: PersistedChartDrawing[] = [];

  drawings.forEach((drawing) => {
    if (drawing.chartWindowPaneId) {
      if (livePaneIds.has(drawing.chartWindowPaneId)) {
        next.push(drawing);
      } else {
        changed = true;
      }
      return;
    }

    const matchingPanes = panes.filter((pane) => (
      getChartDrawingBucketKey(pane.symbol) === getChartDrawingBucketKey(bucketSymbol)
      && isChartDrawingForWindowContext(drawing, pane.symbol, pane.timeframe)
    ));
    if (matchingPanes.length === 0) {
      next.push(drawing);
      return;
    }

    changed = true;
    matchingPanes.forEach((pane) => {
      next.push(cloneDrawingForPane(drawing, pane.id));
    });
  });

  return changed ? next : drawings as PersistedChartDrawing[];
}

/** Collapsing back to one window keeps its records and removes retired panes. */
export function collapseChartDrawingsToSingleWindow(
  drawings: readonly PersistedChartDrawing[],
  paneId: string,
): PersistedChartDrawing[] {
  let changed = false;
  const next = drawings.flatMap((drawing) => {
    if (!drawing.chartWindowPaneId) return [drawing];
    changed = true;
    if (drawing.chartWindowPaneId !== paneId) return [];
    const { chartWindowPaneId: _windowPaneId, ...unscoped } = drawing;
    return [{ ...unscoped }];
  });
  return changed ? next : drawings as PersistedChartDrawing[];
}

/** Replaces one promoted pane's records without deleting sibling-pane data. */
export function replaceChartWindowPaneDrawings(
  current: readonly PersistedChartDrawing[],
  nextPaneDrawings: readonly PersistedChartDrawing[],
  pane: ChartWindowPane,
): PersistedChartDrawing[] {
  const retained = current.filter((drawing) => !(
    drawing.chartWindowPaneId === pane.id
    && isChartDrawingForWindowContext(drawing, pane.symbol, pane.timeframe)
  ));
  const scopedNext = nextPaneDrawings.map((drawing) => ({
    ...drawing,
    chartWindowPaneId: pane.id,
    points: drawing.points.map((point) => ({ ...point })),
  }));
  return [...retained, ...scopedNext];
}

export function clearChartWindowTargetDrawings(
  current: readonly PersistedChartDrawing[],
  panes: readonly ChartWindowPane[],
  targetPaneIds: readonly string[],
): PersistedChartDrawing[] {
  const targetIds = new Set(targetPaneIds);
  return current.filter((drawing) => !panes.some((pane) => (
    targetIds.has(pane.id)
    && (!drawing.chartWindowPaneId || drawing.chartWindowPaneId === pane.id)
    && isChartDrawingForWindowContext(drawing, pane.symbol, pane.timeframe)
  )));
}

export function removeChartWindowPaneDrawings(
  current: readonly PersistedChartDrawing[],
  panes: readonly ChartWindowPane[],
): PersistedChartDrawing[] {
  const paneIds = new Set(panes.map((pane) => pane.id));
  return current.filter(
    (drawing) => !drawing.chartWindowPaneId || paneIds.has(drawing.chartWindowPaneId),
  );
}
