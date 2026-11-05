import assert from 'node:assert/strict';
import test from 'node:test';

import type { PersistedChartDrawing } from './drawingPersistence';
import {
  createChartWindowDrawingHistory,
  getChartWindowDrawingHistoryAvailability,
  getChartWindowDrawingHistoryKey,
  reconcileChartWindowDrawingHistory,
  recordChartWindowDrawingChange,
  redoChartWindowDrawingHistory,
  undoChartWindowDrawingHistory,
} from './chartWindowDrawingHistory';

const drawing = (id: string): PersistedChartDrawing => ({
  id,
  kind: 'trendline',
  label: id,
  hidden: false,
  points: [],
  symbol: 'EURUSD',
  timeframe: 'M1',
  chartWindowPaneId: 'chart-window-1',
});

test('pane, symbol, and timeframe form an isolated history scope', () => {
  assert.notEqual(
    getChartWindowDrawingHistoryKey('chart-window-1', 'EURUSD', 'M1'),
    getChartWindowDrawingHistoryKey('chart-window-2', 'EURUSD', 'M1'),
  );
  assert.notEqual(
    getChartWindowDrawingHistoryKey('chart-window-1', 'EURUSD', 'M1'),
    getChartWindowDrawingHistoryKey('chart-window-1', 'EURUSD', 'M5'),
  );
});

test('undo and redo retain independent immutable drawing snapshots', () => {
  const initial = createChartWindowDrawingHistory([drawing('one')]);
  const changed = recordChartWindowDrawingChange(initial, [drawing('one'), drawing('two')]);

  assert.deepEqual(getChartWindowDrawingHistoryAvailability(changed), {
    canUndo: true,
    canRedo: false,
  });

  const undone = undoChartWindowDrawingHistory(changed);
  assert.equal(undone.changed, true);
  assert.deepEqual(undone.drawings.map((item) => item.id), ['one']);
  assert.deepEqual(getChartWindowDrawingHistoryAvailability(undone.history), {
    canUndo: false,
    canRedo: true,
  });

  const redone = redoChartWindowDrawingHistory(undone.history);
  assert.equal(redone.changed, true);
  assert.deepEqual(redone.drawings.map((item) => item.id), ['one', 'two']);
});

test('an external persistence change becomes a clean baseline', () => {
  const initial = createChartWindowDrawingHistory([drawing('one')]);
  const changed = recordChartWindowDrawingChange(initial, [drawing('one'), drawing('two')]);
  const reconciled = reconcileChartWindowDrawingHistory(changed, [drawing('external')]);

  assert.deepEqual(reconciled.present.map((item) => item.id), ['external']);
  assert.deepEqual(getChartWindowDrawingHistoryAvailability(reconciled), {
    canUndo: false,
    canRedo: false,
  });
});

test('selection-only drawing messages do not create an undo step', () => {
  const initial = createChartWindowDrawingHistory([drawing('one')]);
  const selected = recordChartWindowDrawingChange(initial, [{
    ...drawing('one'),
    selected: true,
  }]);

  assert.equal(selected, initial);
  assert.deepEqual(getChartWindowDrawingHistoryAvailability(selected), {
    canUndo: false,
    canRedo: false,
  });
});
