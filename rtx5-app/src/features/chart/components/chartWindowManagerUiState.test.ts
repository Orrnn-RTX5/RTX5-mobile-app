import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canOpenChartWindowFromManager,
  resolveChartWindowMoveTargetIndex,
  resolveChartWindowRemovalIds,
} from './chartWindowManagerUiState';

const panes = [
  { id: 'pane-a' },
  { id: 'pane-b' },
] as const;

test('New Window is enabled only below the phone limit and while the parent permits it', () => {
  assert.equal(canOpenChartWindowFromManager({ paneCount: 1 }), true);
  assert.equal(canOpenChartWindowFromManager({ paneCount: 2 }), false);
  assert.equal(canOpenChartWindowFromManager({ paneCount: 1, canOpen: false }), false);
  assert.equal(canOpenChartWindowFromManager({ paneCount: 1, maxReached: true }), false);
});

test('Remove receives only live selected panes in their visible order', () => {
  assert.deepEqual(
    resolveChartWindowRemovalIds(panes, ['pane-b', 'stale-pane', 'pane-a', 'pane-b']),
    ['pane-a', 'pane-b'],
  );
  assert.deepEqual(resolveChartWindowRemovalIds(panes, new Set()), []);
});

test('a reorder-handle tap swaps either of the two supported panes', () => {
  assert.equal(resolveChartWindowMoveTargetIndex(panes, 'pane-a'), 1);
  assert.equal(resolveChartWindowMoveTargetIndex(panes, 'pane-b'), 0);
  assert.equal(resolveChartWindowMoveTargetIndex(panes, 'missing'), null);
  assert.equal(resolveChartWindowMoveTargetIndex([panes[0]], 'pane-a'), null);
});
