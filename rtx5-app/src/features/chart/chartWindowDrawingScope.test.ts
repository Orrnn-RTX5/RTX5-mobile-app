import assert from 'node:assert/strict';
import test from 'node:test';

import type { PersistedChartDrawing } from './drawingPersistence';
import {
  clearChartWindowTargetDrawings,
  collapseChartDrawingsToSingleWindow,
  expandChartDrawingsForSplitWindows,
  isChartDrawingForWindowPane,
  replaceChartWindowPaneDrawings,
} from './chartWindowDrawingScope';

const drawing = (id: string): PersistedChartDrawing => ({
  id,
  kind: 'horizontalLine',
  symbol: 'EURUSD',
  timeframe: 'M5',
  label: id,
  hidden: false,
  points: [{ time: 1, price: 1.1, paneId: 'main' }],
});

const panes = [
  { id: 'window-1', symbol: 'EURUSD', timeframe: 'M5' },
  { id: 'window-2', symbol: 'EURUSD', timeframe: 'M5' },
] as const;

test('splitting clones legacy drawings into independently owned window records', () => {
  const next = expandChartDrawingsForSplitWindows([drawing('line-1')], panes, 'EURUSD');
  assert.equal(next.length, 2);
  assert.deepEqual(next.map((item) => item.chartWindowPaneId), ['window-1', 'window-2']);
  assert.notEqual(next[0]?.id, next[1]?.id);
});

test('replacing one pane preserves an identical-context sibling pane', () => {
  const expanded = expandChartDrawingsForSplitWindows([drawing('line-1')], panes, 'EURUSD');
  const replacement = { ...drawing('line-new'), points: [{ time: 2, price: 1.2 }] };
  const next = replaceChartWindowPaneDrawings(expanded, [replacement], panes[0]);

  assert.equal(next.filter((item) => item.chartWindowPaneId === 'window-1').length, 1);
  assert.equal(next.filter((item) => item.chartWindowPaneId === 'window-2').length, 1);
  assert.equal(
    next.find((item) => item.chartWindowPaneId === 'window-1')?.label,
    'line-new',
  );
});

test('collapsing retains only the surviving pane and removes the transient owner', () => {
  const expanded = expandChartDrawingsForSplitWindows([drawing('line-1')], panes, 'EURUSD');
  const next = collapseChartDrawingsToSingleWindow(expanded, 'window-2');
  assert.equal(next.length, 1);
  assert.equal(next[0]?.chartWindowPaneId, undefined);
  assert.equal(isChartDrawingForWindowPane(next[0]!, 'any-window'), true);
});

test('clear respects explicit and untouched all-pane targets', () => {
  const expanded = expandChartDrawingsForSplitWindows([drawing('line-1')], panes, 'EURUSD');
  const oneCleared = clearChartWindowTargetDrawings(expanded, panes, ['window-1']);
  assert.deepEqual(oneCleared.map((item) => item.chartWindowPaneId), ['window-2']);
  assert.deepEqual(clearChartWindowTargetDrawings(expanded, panes, panes.map((pane) => pane.id)), []);
});
