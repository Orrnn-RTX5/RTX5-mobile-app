import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHART_WINDOW_MAX_PANES,
  DEFAULT_CHART_WINDOW_LAYOUT,
  canOpenNewChartWindow,
  claimChartWindowToolbarTarget,
  chartWindowReducer,
  createInitialChartWindowState,
  getActiveChartWindowPane,
  getChartWindowToolbarTargetPaneIds,
  moveChartWindowPane,
  openNewChartWindow,
  removeChartWindowPane,
  selectChartWindowPane,
  selectChartWindowPaneFromTap,
  setChartWindowLayout,
  updateActiveChartWindowContext,
  updateToolbarTargetChartWindowContext,
} from './chartWindowState';

const createState = () => createInitialChartWindowState({
  symbol: 'EURUSD',
  timeframe: 'M1',
});

test('chart windows start with one active pane and MT5 horizontal layout', () => {
  const state = createState();

  assert.equal(state.layout, DEFAULT_CHART_WINDOW_LAYOUT);
  assert.equal(state.layout, 'horizontal');
  assert.equal(state.panes.length, 1);
  assert.equal(state.activePaneId, 'chart-window-1');
  assert.equal(state.toolbarTargetPaneId, null);
  assert.deepEqual(getChartWindowToolbarTargetPaneIds(state), ['chart-window-1']);
  assert.deepEqual(getActiveChartWindowPane(state), {
    id: 'chart-window-1',
    symbol: 'EURUSD',
    timeframe: 'M1',
  });
  assert.equal(canOpenNewChartWindow(state), true);
});

test('New Window duplicates and activates the current pane up to the phone limit', () => {
  const initial = createState();
  const split = openNewChartWindow(initial);

  assert.equal(CHART_WINDOW_MAX_PANES, 2);
  assert.equal(split.panes.length, 2);
  assert.deepEqual(split.panes[1], {
    id: 'chart-window-2',
    symbol: 'EURUSD',
    timeframe: 'M1',
  });
  assert.notEqual(split.panes[0], split.panes[1]);
  assert.equal(split.activePaneId, 'chart-window-2');
  assert.equal(split.toolbarTargetPaneId, null);
  assert.deepEqual(getChartWindowToolbarTargetPaneIds(split), [
    'chart-window-1',
    'chart-window-2',
  ]);
  assert.equal(canOpenNewChartWindow(split), false);
  assert.equal(openNewChartWindow(split), split, 'a third phone pane must be rejected without churn');
  assert.equal(initial.panes.length, 1, 'opening a window must not mutate the prior state');
});

test('pane selection accepts known IDs and ignores current or unknown IDs', () => {
  const split = openNewChartWindow(createState());
  const selected = selectChartWindowPane(split, 'chart-window-1');

  assert.equal(selected.activePaneId, 'chart-window-1');
  assert.equal(selected.toolbarTargetPaneId, null, 'engine activation must not imply a user tap');
  assert.equal(selectChartWindowPane(selected, 'chart-window-1'), selected);
  assert.equal(selectChartWindowPane(selected, 'missing-pane'), selected);
});

test('an explicit pane tap activates and isolates toolbar ownership', () => {
  const split = openNewChartWindow(createState());
  const firstTapped = selectChartWindowPaneFromTap(split, 'chart-window-1');

  assert.equal(firstTapped.activePaneId, 'chart-window-1');
  assert.equal(firstTapped.toolbarTargetPaneId, 'chart-window-1');
  assert.deepEqual(getChartWindowToolbarTargetPaneIds(firstTapped), ['chart-window-1']);
  assert.equal(
    selectChartWindowPaneFromTap(firstTapped, 'chart-window-1'),
    firstTapped,
    'repeated taps on the confirmed target must not churn immutable state',
  );
  assert.equal(selectChartWindowPaneFromTap(firstTapped, 'missing-pane'), firstTapped);

  const engineOnlySecond = selectChartWindowPane(firstTapped, 'chart-window-2');
  assert.equal(engineOnlySecond.activePaneId, 'chart-window-2');
  assert.equal(
    engineOnlySecond.toolbarTargetPaneId,
    'chart-window-1',
    'radial/action handoff must preserve the explicit toolbar target',
  );
});

test('pointer-down claims toolbar ownership before tap confirmation without moving the engine', () => {
  const split = openNewChartWindow(createState());
  const claimed = claimChartWindowToolbarTarget(split, 'chart-window-1');

  assert.equal(claimed.activePaneId, 'chart-window-2');
  assert.equal(claimed.toolbarTargetPaneId, 'chart-window-1');
  assert.deepEqual(getChartWindowToolbarTargetPaneIds(claimed), ['chart-window-1']);
  assert.equal(
    claimChartWindowToolbarTarget(claimed, 'chart-window-1'),
    claimed,
    'repeated touch events must not churn state during a double tap',
  );
  assert.equal(claimChartWindowToolbarTarget(claimed, 'missing-pane'), claimed);
  const undivided = createState();
  assert.equal(
    claimChartWindowToolbarTarget(undivided, 'chart-window-1'),
    undivided,
    'an undivided chart keeps implicit all-pane ownership',
  );
});

test('symbol and timeframe updates are isolated to the active pane', () => {
  const split = openNewChartWindow(createState());
  const firstActive = selectChartWindowPane(split, 'chart-window-1');
  const updated = updateActiveChartWindowContext(firstActive, {
    symbol: 'XAUUSD',
    timeframe: 'H1',
  });

  assert.deepEqual(updated.panes[0], {
    id: 'chart-window-1',
    symbol: 'XAUUSD',
    timeframe: 'H1',
  });
  assert.deepEqual(updated.panes[1], {
    id: 'chart-window-2',
    symbol: 'EURUSD',
    timeframe: 'M1',
  });
  assert.equal(updated.activePaneId, 'chart-window-1');
  assert.equal(updateActiveChartWindowContext(updated, {}), updated);
});

test('toolbar context updates broadcast before a tap and isolate after a tap', () => {
  const split = openNewChartWindow(createState());
  const broadcast = updateToolbarTargetChartWindowContext(split, { timeframe: 'M5' });

  assert.deepEqual(broadcast.panes.map((pane) => pane.timeframe), ['M5', 'M5']);
  assert.equal(broadcast.activePaneId, split.activePaneId);
  assert.equal(broadcast.toolbarTargetPaneId, null);

  const firstTapped = selectChartWindowPaneFromTap(broadcast, 'chart-window-1');
  const isolated = updateToolbarTargetChartWindowContext(firstTapped, {
    symbol: 'XAUUSD',
    timeframe: 'H1',
  });
  assert.deepEqual(isolated.panes[0], {
    id: 'chart-window-1',
    symbol: 'XAUUSD',
    timeframe: 'H1',
  });
  assert.deepEqual(isolated.panes[1], {
    id: 'chart-window-2',
    symbol: 'EURUSD',
    timeframe: 'M5',
  });
  assert.equal(isolated.activePaneId, 'chart-window-1');
  assert.equal(isolated.toolbarTargetPaneId, 'chart-window-1');
  assert.equal(updateToolbarTargetChartWindowContext(isolated, {}), isolated);
});

test('horizontal and vertical layout changes preserve pane state and no-op identity', () => {
  const split = openNewChartWindow(createState());
  const vertical = setChartWindowLayout(split, 'vertical');

  assert.equal(vertical.layout, 'vertical');
  assert.equal(vertical.panes, split.panes, 'layout changes may reuse the immutable pane collection');
  assert.equal(vertical.activePaneId, split.activePaneId);
  assert.equal(setChartWindowLayout(vertical, 'vertical'), vertical);

  const horizontal = setChartWindowLayout(vertical, 'horizontal');
  assert.equal(horizontal.layout, 'horizontal');
});

test('removing panes never removes the last and updates active ownership deterministically', () => {
  const initial = createState();
  assert.equal(removeChartWindowPane(initial), initial);

  const split = openNewChartWindow(initial);
  const removedActive = removeChartWindowPane(split);
  assert.deepEqual(removedActive.panes.map((pane) => pane.id), ['chart-window-1']);
  assert.equal(removedActive.activePaneId, 'chart-window-1');

  const splitAgain = openNewChartWindow(removedActive);
  const firstActive = selectChartWindowPane(splitAgain, 'chart-window-1');
  const removedInactive = removeChartWindowPane(firstActive, 'chart-window-3');
  assert.deepEqual(removedInactive.panes.map((pane) => pane.id), ['chart-window-1']);
  assert.equal(removedInactive.activePaneId, 'chart-window-1');
  assert.equal(removeChartWindowPane(removedInactive, 'missing-pane'), removedInactive);

  const splitWithTarget = selectChartWindowPaneFromTap(
    openNewChartWindow(removedInactive),
    'chart-window-4',
  );
  const removedTarget = removeChartWindowPane(splitWithTarget, 'chart-window-4');
  assert.equal(removedTarget.toolbarTargetPaneId, null);
  assert.deepEqual(getChartWindowToolbarTargetPaneIds(removedTarget), ['chart-window-1']);
});

test('pane reordering preserves IDs, contexts, and the active pane', () => {
  const split = openNewChartWindow(createState());
  const reordered = moveChartWindowPane(split, 'chart-window-2', 0);

  assert.deepEqual(reordered.panes.map((pane) => pane.id), [
    'chart-window-2',
    'chart-window-1',
  ]);
  assert.equal(reordered.activePaneId, 'chart-window-2');
  assert.equal(moveChartWindowPane(reordered, 'chart-window-2', -20), reordered);
  assert.equal(moveChartWindowPane(reordered, 'missing-pane', 1), reordered);
  assert.equal(moveChartWindowPane(reordered, 'chart-window-2', Number.NaN), reordered);
});

test('chartWindowReducer exposes every transition for direct useReducer integration', () => {
  let state = createState();
  state = chartWindowReducer(state, { type: 'new-window' });
  state = chartWindowReducer(state, { type: 'claim-toolbar-target', paneId: 'chart-window-1' });
  state = chartWindowReducer(state, { type: 'select-pane-from-tap', paneId: 'chart-window-1' });
  state = chartWindowReducer(state, {
    type: 'update-toolbar-target',
    patch: { timeframe: 'M15' },
  });
  state = chartWindowReducer(state, {
    type: 'update-active-pane',
    patch: { symbol: 'BTCUSD' },
  });
  state = chartWindowReducer(state, { type: 'set-layout', layout: 'vertical' });
  state = chartWindowReducer(state, {
    type: 'move-pane',
    paneId: 'chart-window-1',
    toIndex: 1,
  });

  assert.equal(state.layout, 'vertical');
  assert.equal(state.activePaneId, 'chart-window-1');
  assert.equal(state.toolbarTargetPaneId, 'chart-window-1');
  assert.deepEqual(state.panes.map((pane) => pane.id), [
    'chart-window-2',
    'chart-window-1',
  ]);
  assert.deepEqual(getActiveChartWindowPane(state), {
    id: 'chart-window-1',
    symbol: 'BTCUSD',
    timeframe: 'M15',
  });

  state = chartWindowReducer(state, { type: 'remove-pane' });
  assert.equal(state.panes.length, 1);
  assert.equal(state.activePaneId, 'chart-window-2');
});
