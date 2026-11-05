import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInitialChartWindowState,
  moveChartWindowPane,
  openNewChartWindow,
  selectChartWindowPane,
  setChartWindowLayout,
  updateActiveChartWindowContext,
  type ChartWindowState,
} from './chartWindowState';
import {
  commitConfirmedChartWindowPaneRemoval,
  planChartWindowPaneRemoval,
} from './useChartWindowsFeature';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const createDifferentContextSplit = (): ChartWindowState => {
  let state = createInitialChartWindowState({
    symbol: 'EURUSD',
    timeframe: 'M1',
  });
  state = openNewChartWindow(state);
  state = updateActiveChartWindowContext(state, {
    symbol: 'GBPUSD',
    timeframe: 'M5',
  });
  return selectChartWindowPane(state, 'chart-window-1');
};

test('active removal stays planned until the remaining pane context is confirmed', () => {
  const original = createDifferentContextSplit();
  const plan = planChartWindowPaneRemoval(
    original,
    ['chart-window-1'],
    { symbol: 'EURUSD', timeframe: 'M1' },
  );

  assert.equal(plan.requiresContextCommit, true);
  assert.deepEqual(plan.orderedRemovalIds, ['chart-window-1']);
  assert.equal(plan.targetPane.id, 'chart-window-2');
  assert.equal(plan.targetPane.symbol, 'GBPUSD');
  assert.equal(original.panes.length, 2);
  assert.equal(original.activePaneId, 'chart-window-1');
});

test('cancel, blur, or an unrelated context leaves the pre-removal state intact', () => {
  const original = createDifferentContextSplit();
  const plan = planChartWindowPaneRemoval(
    original,
    ['chart-window-1'],
    { symbol: 'EURUSD', timeframe: 'M1' },
  );

  assert.equal(
    commitConfirmedChartWindowPaneRemoval(
      original,
      plan,
      { symbol: 'EURUSD', timeframe: 'M1' },
    ),
    null,
  );
  assert.equal(
    commitConfirmedChartWindowPaneRemoval(
      original,
      plan,
      { symbol: 'USDJPY', timeframe: 'H1' },
    ),
    null,
  );
  assert.deepEqual(original.panes.map((pane) => pane.id), [
    'chart-window-1',
    'chart-window-2',
  ]);
});

test('target confirmation commits removal against the latest reorder and layout state', () => {
  const original = createDifferentContextSplit();
  const plan = planChartWindowPaneRemoval(
    original,
    ['chart-window-1'],
    { symbol: 'EURUSD', timeframe: 'M1' },
  );
  const latestState = setChartWindowLayout(
    moveChartWindowPane(original, 'chart-window-2', 0),
    'vertical',
  );

  const committed = commitConfirmedChartWindowPaneRemoval(
    latestState,
    plan,
    { symbol: 'GBPUSD', timeframe: 'M5' },
  );

  assert.ok(committed);
  assert.equal(committed.layout, 'vertical');
  assert.deepEqual(committed.panes, [{
    id: 'chart-window-2',
    symbol: 'GBPUSD',
    timeframe: 'M5',
  }]);
  assert.equal(committed.activePaneId, 'chart-window-2');
});

test('inactive or same-context active removal can commit immediately', () => {
  const differentContextSplit = createDifferentContextSplit();
  const inactivePlan = planChartWindowPaneRemoval(
    differentContextSplit,
    ['chart-window-2'],
    { symbol: 'EURUSD', timeframe: 'M1' },
  );
  assert.equal(inactivePlan.requiresContextCommit, false);
  assert.deepEqual(inactivePlan.nextState.panes.map((pane) => pane.id), [
    'chart-window-1',
  ]);

  const duplicateSplit = openNewChartWindow(createInitialChartWindowState({
    symbol: 'EURUSD',
    timeframe: 'M1',
  }));
  const sameContextPlan = planChartWindowPaneRemoval(
    duplicateSplit,
    ['chart-window-2'],
    { symbol: 'EURUSD', timeframe: 'M1' },
  );
  assert.equal(sameContextPlan.requiresContextCommit, false);
  assert.deepEqual(sameContextPlan.nextState.panes.map((pane) => pane.id), [
    'chart-window-1',
  ]);
});

test('pane-selection confirmation carries the exact target and confirmed context', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/features/chart/useChartWindowsFeature.ts'),
    'utf8',
  );

  assert.match(
    source,
    /onSelectionConfirmed\?\.\(\s*pendingTransition\.targetPane,\s*\{ symbol, timeframe \},\s*\)/,
  );
  assert.match(source, /onSelectionConfirmed\?\.\(pane, currentContext\)/);
  assert.match(source, /onSelectionConfirmed\?\.\(pane, currentContextRef\.current\)/);
});

test('controller separates explicit toolbar targeting from engine-only activation', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/features/chart/useChartWindowsFeature.ts'),
    'utf8',
  );

  assert.match(source, /toolbarTargetPaneId: string \| null/);
  assert.match(source, /toolbarTargetsAllPanes: boolean/);
  assert.match(source, /selectPaneFromTap: \(/);
  assert.match(source, /claimToolbarTarget: \(paneId: string\) => void/);
  assert.match(source, /runOnToolbarTarget: \(/);
  assert.match(source, /updateToolbarTargetContext: \(patch: Partial<ChartWindowContext>\) => void/);
  assert.match(
    source,
    /requestPaneSelection\(pane, onSelectionConfirmed, true\)/,
    'a real pane tap must be the only selection path that requests explicit ownership',
  );
  assert.match(
    source,
    /const selectPane = useCallback[\s\S]*requestPaneSelection\(pane, onSelectionConfirmed\);/,
    'existing action/radial activation must preserve the toolbar target',
  );
});

test('pointer-down intent claims ownership without prematurely moving the full engine', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/features/chart/useChartWindowsFeature.ts'),
    'utf8',
  );
  const claimStart = source.indexOf('const claimToolbarTarget = useCallback');
  const claimEnd = source.indexOf('const selectPane = useCallback', claimStart);
  const claimSource = source.slice(claimStart, claimEnd);

  assert.ok(claimStart >= 0 && claimEnd > claimStart);
  assert.match(claimSource, /claimChartWindowToolbarTarget\(currentState, paneId\)/);
  assert.match(claimSource, /cancelPendingTransition\(\);[\s\S]*commitState\(nextState\)/);
  assert.doesNotMatch(claimSource, /onCommitContextRef\.current/);
});

test('an immediate toolbar press waits for a pending cross-context pane tap', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/features/chart/useChartWindowsFeature.ts'),
    'utf8',
  );
  const runStart = source.indexOf('const runOnToolbarTarget = useCallback');
  const updateStart = source.indexOf('const updateToolbarTargetContext = useCallback', runStart);
  const runSource = source.slice(runStart, updateStart);

  assert.ok(runStart >= 0 && updateStart > runStart);
  assert.ok(
    runSource.indexOf('const pendingToolbarTarget = pendingTransitionRef.current')
      < runSource.indexOf('const currentState = stateRef.current'),
    'pending tap intent must be checked before null/all broadcast state',
  );
  assert.match(
    runSource,
    /pendingToolbarTarget\?\.kind === 'select-pane'[\s\S]*pendingToolbarTarget\.selectFromTap/,
  );
  assert.match(
    runSource,
    /pendingTransitionRef\.current = Object\.freeze\(\{[\s\S]*onSelectionConfirmed:[\s\S]*confirmToolbarTarget/,
    'the toolbar callback must join the pending confirmation instead of cancelling it',
  );
});

test('toolbar context updates commit only after the target global context confirms', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/features/chart/useChartWindowsFeature.ts'),
    'utf8',
  );
  const updateStart = source.indexOf('const updateToolbarTargetContext = useCallback');
  const updateEnd = source.indexOf('const toggleRemoval = useCallback', updateStart);
  const updateSource = source.slice(updateStart, updateEnd);

  assert.ok(updateStart >= 0 && updateEnd > updateStart);
  assert.match(updateSource, /pendingTapSelection[\s\S]*selectChartWindowPaneFromTap/);
  assert.match(
    updateSource,
    /const cumulativePatch = Object\.freeze[\s\S]*pendingToolbarUpdate\?\.toolbarContextPatch[\s\S]*updateToolbarTargetChartWindowContext\([\s\S]*toolbarTargetState,[\s\S]*cumulativePatch/,
    'rapid toolbar context changes must merge instead of losing the pending tap target',
  );
  assert.match(updateSource, /kind: 'update-toolbar-context'/);
  assert.match(updateSource, /expectedToolbarTargetPaneId: currentState\.toolbarTargetPaneId/);
  assert.match(updateSource, /toolbarTargetPaneIdToCommit/);
  assert.match(updateSource, /onCommitContextRef\.current\(targetPane\.symbol, targetPane\.timeframe\)/);
  assert.match(
    source,
    /if \(targetConfirmed\)[\s\S]*pendingTransition\.kind === 'update-toolbar-context'[\s\S]*commitState\(nextState\)/,
  );
});
