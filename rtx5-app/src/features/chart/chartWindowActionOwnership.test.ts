import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveChartWindowCommandOwnerPaneId,
  shouldReleaseChartWindowOwnedAction,
} from './chartWindowActionOwnership';

test('explicit pane confirmations own SL/TP and drawing commands', () => {
  assert.equal(resolveChartWindowCommandOwnerPaneId({
    mode: 'pane',
    toolbarTargetPaneId: 'chart-window-2',
    targetPaneIds: ['chart-window-2'],
  }), 'chart-window-2');
  assert.equal(shouldReleaseChartWindowOwnedAction('chart-window-2', 'chart-window-2'), false);
  assert.equal(shouldReleaseChartWindowOwnedAction('chart-window-2', 'chart-window-1'), true);
});

test('untouched split commands remain shared across both panes', () => {
  assert.equal(resolveChartWindowCommandOwnerPaneId({
    mode: 'all',
    toolbarTargetPaneId: null,
    targetPaneIds: ['chart-window-1', 'chart-window-2'],
  }), null);
  assert.equal(shouldReleaseChartWindowOwnedAction(null, 'chart-window-1'), false);
  assert.equal(shouldReleaseChartWindowOwnedAction(null, 'chart-window-2'), false);
});

test('an inconsistent pane confirmation fails closed to shared ownership', () => {
  assert.equal(resolveChartWindowCommandOwnerPaneId({
    mode: 'pane',
    toolbarTargetPaneId: 'chart-window-2',
    targetPaneIds: ['chart-window-1'],
  }), null);
});
