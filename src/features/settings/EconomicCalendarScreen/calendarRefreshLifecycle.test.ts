import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import type { EconomicEvent } from '../../../api/economicCalendar';

const source = readFileSync(resolve(process.cwd(), 'src/features/settings/EconomicCalendarScreen/EconomicCalendarScreen.tsx'), 'utf8');
// Execute the real screen's data/effect hooks without mounting native drawing.
const dataHooks = source.slice(0, source.indexOf('  const openEventFilters ='))
  + '  return { dataEvents, fetchError, refresh: () => refreshRef.current() };\n});';
const compiled = ts.transpileModule(dataHooks, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
}).outputText;

function mount(focused = true, foreground = true) {
  const slots: any[] = [];
  let cursor = 0;
  let effectCursor = 0;
  const effects: Array<{ deps: unknown[]; cleanup?: (() => void) | void }> = [];
  let pendingEffects: Array<() => void> = [];
  const same = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const memo = (factory: () => unknown, deps: unknown[]) => {
    const index = cursor++;
    if (!slots[index] || !same(deps, slots[index].deps)) slots[index] = { deps, value: factory() };
    return slots[index].value;
  };
  const react = {
    memo: (component: unknown) => component,
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (value: any) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial: unknown) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useMemo: memo,
    useCallback: (callback: unknown, deps: unknown[]) => memo(() => callback, deps),
    useEffect(effect: () => (() => void) | void, deps: unknown[]) {
      const index = effectCursor++;
      const previous = effects[index];
      if (previous && same(deps, previous.deps)) return;
      pendingEffects.push(() => {
        previous?.cleanup?.();
        effects[index] = { deps, cleanup: effect() };
      });
    },
  };
  const requests: Array<(events: EconomicEvent[]) => void> = [];
  const intervals = new Map<number, () => void>();
  const timers = new Map<number, () => void>();
  let timerId = 0;
  const modules: Record<string, unknown> = {
    react: { ...react, default: react },
    '../../../hooks/useAppForeground': { useAppForeground: () => foreground },
    '../../../ui/components/DeferredRouteMount': { useRetainedRouteContentReady: () => true },
    '../../../ui/theme/useTheme': { useTheme: () => ({}) },
    '../../../state/themeMode': { useIsDarkTheme: () => false },
    '../../../state/uiState': { useUIState: () => () => {} },
    '../../../i18n/useTranslation': { useTranslation: () => ({ t: (value: string) => value }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    './styles': { makeEconomicCalendarStyles: () => ({}) },
    '../../../api/economicCalendar': {
      getInitialEconomicCalendarData: () => [],
      getEconomicCalendarCacheTime: () => null,
      fetchEconomicCalendarData: () => new Promise(resolve => requests.push(resolve)),
    },
  };
  const exports = {} as { EconomicCalendarScreenInner: (props: { isScreenFocused: boolean }) => any };
  runInNewContext(compiled, {
    exports,
    require: (name: string) => { assert.ok(name in modules, name); return modules[name]; },
    setTimeout: (task: () => void) => { timers.set(++timerId, task); return timerId; },
    clearTimeout: (id: number) => timers.delete(id),
    setInterval: (task: () => void) => { intervals.set(++timerId, task); return timerId; },
    clearInterval: (id: number) => intervals.delete(id),
  });
  const render = (nextFocused = focused, nextForeground = foreground) => {
    focused = nextFocused;
    foreground = nextForeground;
    cursor = 0;
    effectCursor = 0;
    const result = exports.EconomicCalendarScreenInner({ isScreenFocused: focused });
    const scheduled = pendingEffects;
    pendingEffects = [];
    scheduled.forEach(effect => effect());
    return result;
  };
  render();
  return {
    render, requests, timers, intervals,
    prewarm: () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(task => task()); },
    dispose: () => effects.forEach(effect => effect.cleanup?.()),
  };
}

test('calendar background pauses polling/prewarm; late responses cannot replace the resumed screen', async () => {
  const f = mount();
  assert.equal(f.requests.length, 1);
  assert.equal(f.intervals.size, 1);
  assert.equal(f.timers.size, 1);
  f.render(true, false);
  assert.equal(f.intervals.size, 0);
  assert.equal(f.timers.size, 0);
  f.render().refresh();
  assert.equal(f.requests.length, 1, 'background retry is inert');
  f.render(true, true);
  assert.equal(f.requests.length, 2);
  f.requests[0]([{ id: 'stale' } as EconomicEvent]);
  await Promise.resolve();
  assert.equal(f.render().dataEvents.length, 0);
  const fresh = [{ id: 'fresh' } as EconomicEvent];
  f.requests[1](fresh);
  await Promise.resolve();
  assert.equal(f.render().dataEvents, fresh);
  f.render().refresh();
  assert.equal(f.requests.length, 3, 'visible retry remains functional');
  f.dispose();
  f.requests[2]([{ id: 'unmounted' } as EconomicEvent]);
  await Promise.resolve();
  assert.equal(f.intervals.size, 0);
  assert.equal(f.timers.size, 0);
});

test('hidden calendar performs one prewarm and does not restart it on later foreground transitions', async () => {
  const f = mount(false, false);
  assert.equal(f.requests.length, 0);
  assert.equal(f.timers.size, 0);
  f.render(false, true);
  f.prewarm();
  assert.equal(f.requests.length, 1);
  f.requests[0]([{ id: 'prewarmed' } as EconomicEvent]);
  await Promise.resolve();
  f.render(false, false);
  f.render(false, true);
  assert.equal(f.timers.size, 0);
  assert.equal(f.intervals.size, 0);
  assert.equal(f.requests.length, 1);
  f.dispose();
});
