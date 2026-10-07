import assert from 'node:assert/strict';
import test from 'node:test';
import { TabRouter, type NavigationAction } from '@react-navigation/routers';
import { commitFastTabPress } from './commitFastTabPress';
import { clearFastTabVisual, fastTabVisualController, showFastTabVisual } from './fastTabVisualController';

function createNavigator() {
  const router = TabRouter({ initialRouteName: 'quotes', backBehavior: 'firstRoute' });
  const options = { routeNames: ['quotes', 'chart', 'history', 'settings'], routeParamList: {}, routeGetIdList: {} };
  let state = router.getInitialState(options);
  let prevented = false;
  let dispatches = 0;
  let onEmit = () => {};
  const navigation = {
    getState: () => state,
    emit: (event: { type: string; target?: string }) => {
      onEmit();
      return { ...event, defaultPrevented: prevented, preventDefault() { prevented = true; } };
    },
    dispatch: (action: NavigationAction) => {
      dispatches++;
      const next = router.getStateForAction(state, action as Parameters<typeof router.getStateForAction>[1], options);
      if (next) state = router.getRehydratedState(next, options);
    },
  };
  return {
    navigation: navigation as Parameters<typeof commitFastTabPress>[0],
    route: (name: string) => state.routes.find(route => route.name === name)!,
    get focused() { return state.routes[state.index].name; },
    get dispatches() { return dispatches; },
    prevent: () => { prevented = true; },
    onEmit: (action: () => void) => { onEmit = action; },
  };
}

test('rapid return taps read current TabRouter focus and reconcile the optimistic scene', () => {
  const host = createNavigator();
  fastTabVisualController.setActualRouteName('quotes');
  try {
    const originalQuotesRoute = host.route('quotes'); // captured while Quotes was focused
    const chart = showFastTabVisual('chart');
    assert.equal(commitFastTabPress(host.navigation, host.route('chart'), chart), true);
    assert.equal(host.focused, 'chart');
    const quotes = showFastTabVisual('quotes');
    commitFastTabPress(host.navigation, originalQuotesRoute, quotes);
    assert.equal(host.focused, 'quotes', 'the callback must dispatch even if Quotes was focused when it rendered');
    assert.equal(host.dispatches, 2);
    assert.equal(fastTabVisualController.getSnapshot().routeName, null);
  } finally { clearFastTabVisual(); }
});

test('same-tab taps confirm focus without dispatch, so a later Back can change the scene', () => {
  const host = createNavigator();
  fastTabVisualController.setActualRouteName('quotes');
  try {
    const revision = showFastTabVisual('quotes');
    commitFastTabPress(host.navigation, host.route('quotes'), revision);
    assert.equal(host.dispatches, 0);
    assert.equal(fastTabVisualController.getSnapshot().routeName, null);
    fastTabVisualController.setActualRouteName('history');
    const scenes: string[] = [];
    const unregister = fastTabVisualController.registerVisualApplier(route => scenes.push(route));
    assert.deepEqual(scenes, ['history']);
    unregister();
  } finally { clearFastTabVisual(); }
});

test('prevented tab presses restore the real scene immediately', () => {
  const host = createNavigator();
  fastTabVisualController.setActualRouteName('quotes');
  const scenes: string[] = [];
  const unregister = fastTabVisualController.registerVisualApplier(route => scenes.push(route));
  try {
    host.prevent();
    const revision = showFastTabVisual('chart');
    assert.equal(commitFastTabPress(host.navigation, host.route('chart'), revision), false);
    assert.equal(host.dispatches, 0);
    assert.equal(host.focused, 'quotes');
    assert.equal(scenes.at(-1), 'quotes');
    assert.equal(fastTabVisualController.getSnapshot().routeName, null);
  } finally { unregister(); clearFastTabVisual(); }
});

test('a newer selection made by a tab listener supersedes the older dispatch', () => {
  const host = createNavigator();
  fastTabVisualController.setActualRouteName('quotes');
  try {
    const revision = showFastTabVisual('chart');
    host.onEmit(() => { showFastTabVisual('history'); });
    assert.equal(commitFastTabPress(host.navigation, host.route('chart'), revision), false);
    assert.equal(host.dispatches, 0);
    assert.equal(fastTabVisualController.getSnapshot().routeName, 'history');
  } finally { clearFastTabVisual(); }
});
