import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { interactionLifecycle } from '../../utils/interactionLifecycle';
import { scheduleBackNavigationAfterVisualFrame } from '../../utils/navigation';
import { FAST_TAB_ROUTE_NAMES, fastTabVisualController, scheduleFastTabNavigation } from './fastTabVisualController';

const fragment = (path: string, from: string, until: string) => {
  const source = readFileSync(path, 'utf8');
  const start = source.indexOf(from); const end = source.indexOf(until, start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end);
};
const evaluate = (source: string, context: object) => runInNewContext(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText, context);

test('resume restores retained scene touch ownership despite unchanged route caches, then tab taps still work', async () => {
  const originalFrame = globalThis.requestAnimationFrame;
  const frames: FrameRequestCallback[] = [];
  globalThis.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
  const layers = Object.fromEntries(FAST_TAB_ROUTE_NAMES.map(route => [route, {
    props: { pointerEvents: route === 'quotes' ? 'auto' : 'none' } as Record<string, unknown>,
    setNativeProps(props: object) { Object.assign(this.props, props); },
  }]));
  const scene = evaluate(fragment('src/ui/navigation/FastTabNavigator.tsx', 'const applyNativeVisualRouteNow = useCallback', '  const previousFocusedRouteKeyRef') + '\napplyNativeVisualRouteNow;', {
    useCallback: (callback: unknown) => callback, nativeVisualRouteRef: { current: 'quotes' },
    layerRefs: { current: layers }, styles: {}, FAST_TAB_ROUTE_NAMES,
  }) as (route: typeof FAST_TAB_ROUTE_NAMES[number], force?: boolean) => void;
  const icons = FAST_TAB_ROUTE_NAMES.map(routeName => {
    const active = { opacity: routeName === 'quotes' ? 1 : 0 };
    const apply = evaluate(fragment('app/(tabs)/_layout.tsx', 'const applyVisualRoute = useCallback', '  useLayoutEffect') + '\napplyVisualRoute;', {
      useCallback: (callback: unknown) => callback, routeName, inlineLabels: false, styles: {},
      appliedActiveRef: { current: routeName === 'quotes' },
      activeLayerRef: { current: { setNativeProps: (props: { style: Array<{ opacity?: number }> }) => { active.opacity = props.style.at(-1)!.opacity!; } } },
      inactiveLayerRef: { current: { setNativeProps() {} } },
    }) as (route: typeof FAST_TAB_ROUTE_NAMES[number], force?: boolean) => void;
    return { apply, active, routeName };
  });
  interactionLifecycle.setActive(true);
  fastTabVisualController.setActualRouteName('quotes');
  const unregisterScene = fastTabVisualController.registerVisualApplier(scene);
  const unregisterIcons = icons.map(icon => fastTabVisualController.registerSidebarChromeApplier(icon.apply));
  let staleCommits = 0;
  try {
    for (let cycle = 0; cycle < 100; cycle++) {
      fastTabVisualController.setActualRouteName('quotes');
      const revision = fastTabVisualController.show('chart');
      scheduleFastTabNavigation(revision, () => { staleCommits++; });
      scheduleBackNavigationAfterVisualFrame(() => { staleCommits++; });
      interactionLifecycle.setActive(false);
      // Emulate retained native view properties being reset on reattachment.
      for (const layer of Object.values(layers)) layer.props.pointerEvents = 'auto';
      layers.quotes.props.pointerEvents = 'none';
      icons.forEach(icon => { icon.active.opacity = 0; });
      interactionLifecycle.setActive(true);
      for (const route of FAST_TAB_ROUTE_NAMES) assert.equal(layers[route].props.pointerEvents, route === 'quotes' ? 'auto' : 'none');
      for (const icon of icons) assert.equal(icon.active.opacity, icon.routeName === 'quotes' ? 1 : 0);
      fastTabVisualController.show('history');
      assert.equal(layers.history.props.pointerEvents, 'auto', 'a new tap reveals the destination in its touch turn');
      assert.equal(layers.quotes.props.pointerEvents, 'none');
      fastTabVisualController.setActualRouteName('history');
    }
    frames.forEach(frame => frame(0));
    await new Promise(resolve => setTimeout(resolve, 280));
    assert.equal(staleCommits, 0, 'navigation from the interrupted touch cannot execute after returning');
    assert.equal(fastTabVisualController.getSnapshot().routeName, null);
  } finally {
    unregisterScene(); unregisterIcons.forEach(unregister => unregister());
    interactionLifecycle.setActive(false); interactionLifecycle.setActive(true);
    globalThis.requestAnimationFrame = originalFrame;
  }
});
