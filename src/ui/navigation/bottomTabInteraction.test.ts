import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { createBottomTabPressGate } from './bottomTabPressGate';
import { interactionLifecycle } from '../../utils/interactionLifecycle';
import { FAST_TAB_ROUTE_NAMES, type FastTabRouteName } from './fastTabVisualController';

const tabs = readFileSync(resolve(process.cwd(), 'app/(tabs)/_layout.tsx'), 'utf8');
const navigator = readFileSync(resolve(process.cwd(), 'src/ui/navigation/FastTabNavigator.tsx'), 'utf8');
const fragment = (source: string, start: string, end: string) => {
  const from = source.indexOf(start);
  const until = source.indexOf(end, from);
  assert.ok(from >= 0 && until > from, `missing navigation fragment: ${start}`);
  return source.slice(from, until);
};
const evaluate = (source: string, context: Record<string, unknown>) => runInNewContext(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
}).outputText, context);

// Run the production handlers against deterministic native/frame hosts. This
// checks event order and native writes without requiring an Android runtime.
function createButtons(os = 'android') {
  let revision = 0;
  const reveals: string[] = [];
  const commits: Array<() => void> = [];
  const idle: Array<() => void> = [];
  let navigations = 0;
  let prefetches = 0;
  let authRequests = 0;
  const Button = evaluate(fragment(tabs, 'const FastTabBarButton = memo', 'const GlobalActionSheetHost') + '\nFastTabBarButton;', {
    memo: (component: unknown) => component,
    useRef: (value: unknown) => ({ current: value }),
    useContext: () => null, FastTabPressNavigationContext: {},
    useCallback: (callback: unknown) => callback,
    createBottomTabPressGate, interactionLifecycle,
    Platform: { OS: os },
    PlatformPressable: 'PlatformPressable', FastTabVisualItem: 'FastTabVisualItem',
    React: { createElement: (_type: unknown, props: unknown) => props },
    showFastTabVisual: (route: string) => { reveals.push(route); return ++revision; },
    useUIState: { getState: () => ({ hideActionSheet() {} }) },
    requestOrrnnDemoTradeAuth: () => { authRequests++; return true; },
    scheduleFastTabNavigation: (requested: number, action: () => void) => commits.push(() => { if (requested === revision) action(); }),
    TAB_BAR_NAVIGATION_SETTLE_DELAY_MS: 0,
    scheduleIdleWork: (action: () => void) => idle.push(action),
    fastTabVisualController: { getSnapshot: () => ({ revision }) },
    useUserPreferences: { getState: () => ({ chartSymbol: 'EURUSD', chartTimeframe: 'M1' }) },
    prefetchChartSelectionHistory: () => { prefetches++; },
  }) as (props: Record<string, unknown>) => Record<string, (event: object) => void>;
  return {
    button: (routeName: FastTabRouteName, disabled = false) => Button({ routeName, disabled, onPress: () => { navigations++; } }),
    reveals, commits, idle,
    get navigations() { return navigations; },
    get prefetches() { return prefetches; },
    get authRequests() { return authRequests; },
  };
}

test('native touch-start reveals once regardless of responder event ordering', () => {
  for (const os of ['android', 'ios']) {
    for (const pressInFirst of [false, true]) {
      const host = createButtons(os);
      const button = host.button('history');
      const event = {};
      if (pressInFirst) button.onPressIn(event);
      button.onTouchStart(event);
      assert.deepEqual(host.reveals, ['history'], 'the retained scene must reveal before any frame or finger release');
      button.onPressIn(event);
      button.onPressOut(event);
      button.onPress(event);
      assert.equal(host.commits.length, 1);
      assert.equal(host.navigations, 0);
      host.commits.shift()!();
      assert.equal(host.navigations, 1);
      // A cancelled gesture has no release; the next physical touch still works.
      button.onTouchStart({});
      button.onTouchStart({});
      assert.equal(host.reveals.length, 3);
    }
  }
});

test('disabled taps do no navigation work and accessibility clicks remain available', () => {
  const host = createButtons();
  const disabled = host.button('settings', true);
  disabled.onTouchStart({}); disabled.onPressIn({}); disabled.onPress({});
  assert.equal(host.reveals.length, 0);
  assert.equal(host.commits.length, 0);
  const accessible = host.button('settings');
  accessible.onPress({});
  assert.deepEqual(host.reveals, ['settings']);
  host.commits.shift()!();
  assert.equal(host.navigations, 1);
});

test('background tab events cannot navigate, and the first foreground accessibility click is accepted', () => {
  const host = createButtons();
  const button = host.button('history');
  try {
    interactionLifecycle.setActive(false);
    button.onTouchStart({}); button.onPress({});
    assert.equal(host.reveals.length, 0);
    assert.equal(host.commits.length, 0);
    interactionLifecycle.setActive(true);
    button.onPress({});
    assert.deepEqual(host.reveals, ['history']);
    host.commits.shift()!();
    assert.equal(host.navigations, 1);
  } finally { interactionLifecycle.setActive(true); }
});

test('web press-in does not bypass PlatformPressable link handling and guest Trade stays gated', () => {
  const web = createButtons('web');
  const button = web.button('quotes');
  button.onTouchStart({}); button.onPressIn({});
  assert.equal(web.reveals.length, 0);
  button.onPress({});
  assert.deepEqual(web.reveals, ['quotes']);
  const native = createButtons();
  native.button('trade').onTouchStart({});
  assert.equal(native.authRequests, 1);
  assert.equal(native.reveals.length, 0);
  assert.equal(native.commits.length, 0);
});

test('Chart prefetch cannot block the route commit or run after a newer tab tap', () => {
  const host = createButtons();
  const chart = host.button('chart');
  chart.onTouchStart({});
  host.commits.shift()!();
  assert.equal(host.navigations, 1);
  assert.equal(host.prefetches, 0);
  host.button('quotes').onTouchStart({});
  host.idle.shift()!();
  assert.equal(host.prefetches, 0, 'a superseded Chart tap must not start optional hidden work');
  chart.onTouchStart({});
  host.commits.at(-1)!();
  host.idle.shift()!();
  assert.equal(host.prefetches, 1);
});

test('tab selection updates only the incoming/outgoing chrome and never repeats scene adoption', () => {
  let chromeWrites = 0;
  const chrome = FAST_TAB_ROUTE_NAMES.map(routeName => evaluate(
    fragment(tabs, 'const applyVisualRoute = useCallback', '  useLayoutEffect') + '\napplyVisualRoute;', {
      routeName, inlineLabels: false, appliedActiveRef: { current: null }, styles: {},
      useCallback: (callback: unknown) => callback,
      activeLayerRef: { current: { setNativeProps() { chromeWrites++; } } },
      inactiveLayerRef: { current: { setNativeProps() { chromeWrites++; } } },
    },
  ) as (routeName: FastTabRouteName) => void);
  chrome.forEach(apply => apply('quotes'));
  chromeWrites = 0;
  for (const route of ['chart', 'settings', 'history', 'quotes'] as const) {
    const before = chromeWrites;
    chrome.forEach(apply => apply(route));
    assert.equal(chromeWrites - before, 4, 'only two buttons should receive their two opacity updates');
    chrome.forEach(apply => apply(route));
    assert.equal(chromeWrites - before, 4, 'route adoption must not repaint unchanged chrome');
  }
  const sceneWrites: string[] = [];
  const scene = evaluate(fragment(navigator, 'const applyNativeVisualRouteNow = useCallback', '  const previousFocusedRouteKeyRef') + '\napplyNativeVisualRouteNow;', {
    nativeVisualRouteRef: { current: 'quotes' }, styles: {},
    layerRefs: { current: Object.fromEntries(FAST_TAB_ROUTE_NAMES.map(route => [route, { setNativeProps() { sceneWrites.push(route); } }])) },
    useCallback: (callback: unknown) => callback,
  }) as (routeName: FastTabRouteName) => void;
  scene('chart'); scene('chart'); scene('settings'); scene('settings');
  assert.deepEqual(sceneWrites, ['chart', 'quotes', 'settings', 'chart'], 'each handoff reveals before hiding and adoption does no further writes');
});

test('focus adoption avoids redundant chrome writes while a pending rapid tap survives a React repaint', () => {
  const appliedActiveRef = { current: null as boolean | null };
  let writes = 0;
  const applyVisualRoute = evaluate(fragment(tabs, 'const applyVisualRoute = useCallback', '  useLayoutEffect') + '\napplyVisualRoute;', {
    routeName: 'chart', inlineLabels: false, appliedActiveRef, styles: {},
    useCallback: (callback: unknown) => callback,
    activeLayerRef: { current: { setNativeProps() { writes++; } } },
    inactiveLayerRef: { current: { setNativeProps() { writes++; } } },
  }) as (routeName: FastTabRouteName) => void;
  const repaint = (initiallyActive: boolean) => evaluate(fragment(tabs, '  useLayoutEffect(() => {', '  const renderPresentation'), {
    initiallyActive, activeColor: 'green', inactiveColor: 'grey', appliedActiveRef, applyVisualRoute,
    useLayoutEffect: (effect: () => unknown) => effect(),
    registerFastTabSidebarChromeApplier: (apply: (route: FastTabRouteName) => void) => { apply('chart'); return () => {}; },
  });
  repaint(true);
  assert.equal(writes, 0, 'React focus already matches the selected native button');
  repaint(false);
  assert.equal(writes, 2, 'a React repaint with older focus must restore the latest optimistic selection');
  repaint(true);
  assert.equal(writes, 2, 'catching up must not send another native opacity update');
});

test('a pending tab press commits with the navigator supplied by the latest render', () => {
  const refs: Array<{ current: unknown }> = [];
  let cursor = 0;
  let navigation: object | null = null;
  let pending: (() => void) | undefined;
  const calls: object[] = [];
  const Button = evaluate(fragment(tabs, 'const FastTabBarButton = memo', 'const GlobalActionSheetHost') + '\nFastTabBarButton;', {
    memo: (component: unknown) => component,
    useRef: (value: unknown) => refs[cursor++] ?? (refs[cursor - 1] = { current: value }),
    useContext: () => navigation, FastTabPressNavigationContext: {},
    useCallback: (callback: unknown) => callback,
    createBottomTabPressGate, interactionLifecycle, Platform: { OS: 'android' },
    PlatformPressable: 'PlatformPressable', FastTabVisualItem: 'FastTabVisualItem',
    React: { createElement: (_type: unknown, props: unknown) => props },
    showFastTabVisual: () => 1,
    useUIState: { getState: () => ({ hideActionSheet() {} }) },
    requestOrrnnDemoTradeAuth: () => false,
    scheduleFastTabNavigation: (_revision: number, action: () => void) => { pending = action; },
    TAB_BAR_NAVIGATION_SETTLE_DELAY_MS: 0,
    commitFastTabPress: (helpers: object) => { calls.push(helpers); return true; },
  }) as (props: Record<string, unknown>) => Record<string, (event: object) => void>;
  const render = () => {
    cursor = 0;
    return Button({ routeName: 'history', routeKey: 'history-key', onPress: () => { throw new Error('stale standard callback'); } });
  };
  navigation = { name: 'old' };
  render().onTouchStart({});
  navigation = { name: 'new' };
  render();
  pending!();
  assert.deepEqual(calls, [navigation]);
});
