import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const directory = 'src/features/settings/EconomicCalendarScreen/';

function loadModule(file: string, modules: Record<string, unknown>, globals = {}) {
  const source = readFileSync(resolve(process.cwd(), directory, file), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
  }).outputText;
  const exports: Record<string, any> = {};
  runInNewContext(compiled, {
    exports,
    require(name: string) {
      assert.ok(name in modules, `Unmocked import: ${name}`);
      return modules[name];
    },
    ...globals,
  }, { filename: file });
  return exports;
}

type Element = { type: string; props: Record<string, any> };
type Effect = { deps?: unknown[]; cleanup?: (() => void) | void };
type Completion = (result: { finished: boolean }) => void;

const flattenStyle = (style: any): Record<string, any> => Array.isArray(style)
  ? Object.assign({}, ...style.map(flattenStyle))
  : style || {};

/** Run the real retained component; only React scheduling and native drawing are mocked. */
function mountSheet(options: { dark?: boolean; reduceMotion?: boolean } = {}) {
  let dark = options.dark ?? true;
  let now = 1000;
  let selected = new Set(['high', 'medium', 'low', 'holiday']);
  let tree: Element;
  let disposed = false;
  let stateUpdatesAfterUnmount = 0;
  let cursor = 0;
  let effectCursor = 0;
  const slots: any[] = [];
  const effects: Effect[] = [];
  let pendingEffects: Array<() => void> = [];
  const listeners = new Map<string, (...args: any[]) => any>();
  const nativeWrites: Record<string, unknown>[] = [];
  const applied: Set<string>[] = [];
  const handle: { current: { open(): void; close(): void } | null } = { current: null };
  const frames = new Map<number, (time: number) => void>();
  let frameId = 0;
  let resolveReduceMotion!: (enabled: boolean) => void;
  const reduceMotionPromise = new Promise<boolean>((resolvePreference) => {
    resolveReduceMotion = resolvePreference;
  });

  class Value {
    value: number;
    values: number[];
    stops = 0;
    constructor(initial: number) {
      this.value = initial;
      this.values = [initial];
    }
    setValue(value: number) { this.value = value; this.values.push(value); }
    stopAnimation(callback?: (value: number) => void) { this.stops++; callback?.(this.value); }
    interpolate(config: unknown) { return { value: this, config }; }
  }

  class Animation {
    started = false;
    stopped = false;
    parent = false;
    callback?: Completion;
    fromValue?: number;
    constructor(
      readonly children: Animation[] = [],
      readonly value?: Value,
      readonly config?: Record<string, any>,
    ) {}
    start(callback?: Completion) {
      this.started = true;
      this.callback = callback;
      this.fromValue = this.value?.value;
      this.children.forEach((child) => child.start());
    }
    stop() {
      this.stopped = true;
      this.children.forEach((child) => child.stop());
      this.callback?.({ finished: false });
    }
    finish() {
      this.children.forEach((child) => child.finish());
      if (this.value && this.config) this.value.setValue(this.config.toValue);
      this.callback?.({ finished: true });
    }
    // Reproduce a queued native callback arriving after its animation was stopped.
    deliverStaleCompletion() { this.callback?.({ finished: true }); }
  }

  const animations: Animation[] = [];
  const timing = (value: Value, config: Record<string, unknown>) => {
    const animation = new Animation([], value, config);
    animations.push(animation);
    return animation;
  };
  const parallel = (children: Animation[]) => {
    children.forEach((child) => { child.parent = true; });
    const animation = new Animation(children);
    animations.push(animation);
    return animation;
  };
  const same = (a: unknown[] | undefined, b: unknown[] | undefined) =>
    !!a && !!b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const memo = (factory: () => unknown, deps: unknown[]) => {
    const index = cursor++;
    if (!slots[index] || !same(deps, slots[index].deps)) {
      slots[index] = { deps, value: factory() };
    }
    return slots[index].value;
  };
  const react = {
    memo: (component: unknown) => component,
    forwardRef: (component: unknown) => component,
    createElement(type: string, props: Record<string, any> | null, ...children: unknown[]): Element {
      if (props?.ref && typeof props.ref === 'object' && !props.ref.current) {
        props.ref.current = { setNativeProps: (next: Record<string, unknown>) => nativeWrites.push(next) };
      }
      return { type, props: { ...props, children: children.flat(Infinity) } };
    },
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (next: any) => {
        if (disposed) stateUpdatesAfterUnmount++;
        slots[index] = typeof next === 'function' ? next(slots[index]) : next;
      }];
    },
    useRef(initial: unknown) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useMemo: memo,
    useCallback: (callback: unknown, deps: unknown[]) => memo(() => callback, deps),
    useImperativeHandle(ref: typeof handle, factory: () => typeof handle.current) {
      ref.current = factory();
    },
    useEffect(effect: () => (() => void) | void, deps?: unknown[]) {
      const index = effectCursor++;
      const previous = effects[index];
      if (previous && same(deps, previous.deps)) return;
      pendingEffects.push(() => {
        previous?.cleanup?.();
        effects[index] = { deps, cleanup: effect() };
      });
    },
  };
  const theme = {
    bg: '#111111', glass1: '#171717', glass2: '#202020', glass3: '#303030',
    border: '#404040', borderHi: '#505050', borderSubtle: '#353535',
    text: '#eeeeee', textSub: '#cccccc', textMuted: '#999999', accent: '#3880ff',
    trading: { buy: { active: '#3b82f6' }, profit: '#00ff00' },
  };
  const addListener = (name: string, callback: (...args: any[]) => any) => {
    listeners.set(name, callback);
    return { remove: () => listeners.delete(name) };
  };
  const native = {
    View: 'View', Text: 'Text',
    Dimensions: { get: () => ({ width: 390, height: 844, scale: 1, fontScale: 1 }) },
    StyleSheet: {
      create: (styles: unknown) => styles,
      absoluteFillObject: { position: 'absolute', top: 0, left: 0, bottom: 0, right: 0 },
    },
    BackHandler: { addEventListener: addListener },
    AccessibilityInfo: {
      isReduceMotionEnabled: () => reduceMotionPromise,
      addEventListener: addListener,
    },
    Animated: { Value, View: 'Animated.View', timing, parallel },
    Easing: {
      quad: (value: number) => value * value,
      cubic: (value: number) => value ** 3,
      out: (easing: unknown) => easing,
      in: (easing: unknown) => easing,
      inOut: (easing: unknown) => easing,
    },
  };
  const styles = loadModule('styles.ts', { 'react-native': native });
  const helpers = loadModule('eventHelpers.ts', { '../../../ui/theme/glass': { GDark: theme } });
  const module = loadModule('EconomicEventFiltersSheet.tsx', {
    react: { ...react, default: react, __esModule: true },
    'react-native': native,
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'expo-linear-gradient': { LinearGradient: 'LinearGradient' },
    '../../../i18n/useTranslation': { useTranslation: () => ({ t: (value: string) => value }) },
    '../../../state/themeMode': { useIsDarkTheme: () => dark },
    '../../../ui/components/FastPressable': { FastPressable: 'FastPressable' },
    '../../../ui/theme/useTheme': { useTheme: () => theme },
    './eventHelpers': helpers,
    './styles': styles,
  }, {
    Date: class extends Date { static now() { return now; } },
    requestAnimationFrame: (callback: (time: number) => void) => {
      frames.set(++frameId, callback);
      return frameId;
    },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  });
  const render = () => {
    cursor = 0;
    effectCursor = 0;
    tree = module.EconomicEventFiltersSheet({
      selectedImpacts: selected,
      onApply(next: Set<string>) { applied.push(new Set(next)); selected = new Set(next); },
    }, handle);
    const scheduled = pendingEffects;
    pendingEffects = [];
    scheduled.forEach((effect) => effect());
    return tree;
  };
  const nodes = (node: any = tree): Element[] => node && typeof node === 'object'
    ? [node, ...(node.props?.children ?? []).flatMap((child: unknown) => nodes(child))]
    : [];
  const button = (suffix: string) => {
    const found = nodes().find((node) => node.props.latencyLabel === `economicCalendar.filters.${suffix}`);
    assert.ok(found, `Missing filter action: ${suffix}`);
    return found;
  };
  const flushFrames = () => {
    const queued = [...frames.values()];
    frames.clear();
    queued.forEach((callback) => callback(now));
    render();
  };
  const resolveInitialMotion = async (enabled: boolean) => {
    resolveReduceMotion(enabled);
    await Promise.resolve();
    await Promise.resolve();
    render();
  };
  render();
  render();
  return {
    render, applied, animations, handle, nativeWrites, listeners, theme, nodes, button,
    get tree() { return tree; },
    get visible() { return tree.props.pointerEvents === 'box-none'; },
    get selected() { return selected; },
    get animationRuns() { return animations.filter((animation) => animation.started && !animation.parent); },
    get stateUpdatesAfterUnmount() { return stateUpdatesAfterUnmount; },
    ready: () => resolveInitialMotion(options.reduceMotion ?? false),
    resolveInitialMotion,
    motionPreference(enabled: boolean) {
      assert.ok(listeners.has('reduceMotionChanged'));
      listeners.get('reduceMotionChanged')!(enabled);
      render();
    },
    translation() {
      const card = nodes().find((node) => node.props.testID === 'economic-event-filters-card');
      const transform = flattenStyle(card!.props.style).transform as Array<{ translateY?: Value }>;
      const value = transform.find((part) => part.translateY)?.translateY;
      assert.ok(value instanceof Value);
      return value;
    },
    open() { handle.current!.open(); render(); flushFrames(); },
    close() { handle.current!.close(); render(); },
    press(suffix: string) { button(suffix).props.onPress(); render(); flushFrames(); },
    active(suffix: string) { return !!button(suffix).props.style[1]; },
    back() { const handled = listeners.get('hardwareBackPress')!(); render(); flushFrames(); return handled; },
    tick(ms: number) { now += ms; },
    finish() { animations.filter((animation) => animation.started && !animation.parent && !animation.stopped).at(-1)?.finish(); render(); },
    layout(height: number) {
      const card = nodes().find((node) => node.props.testID === 'economic-event-filters-card');
      assert.ok(card?.props.onLayout, 'Retained card must report its measured layout');
      card.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height } } });
      render();
    },
    setDark(value: boolean) { dark = value; render(); flushFrames(); },
    unmount() {
      disposed = true;
      effects.forEach((effect) => effect.cleanup?.());
      handle.current = null;
    },
  };
}

test('filter opening preserves draft on a repeated tap and animates from the measured card bounds', async () => {
  const sheet = mountSheet();
  await sheet.ready();
  assert.equal(sheet.visible, false);
  assert.equal(sheet.tree.props.accessibilityElementsHidden, true);
  sheet.layout(480);
  sheet.open();
  assert.equal(sheet.visible, true);
  assert.equal(sheet.tree.props.accessibilityViewIsModal, true);
  assert.equal(sheet.applied.length, 0);
  const initialRuns = sheet.animationRuns.length;
  assert.equal(initialRuns, 1);
  const openingTimings = sheet.animations.filter((animation) => animation.started && animation.config);
  assert.ok(openingTimings.length > 0);
  assert.ok(openingTimings.every((animation) => animation.config?.useNativeDriver === true));
  assert.ok(openingTimings.some((animation) => (animation.fromValue ?? 0) >= 480 && animation.config?.toValue === 0),
    'Opening must start outside the measured card, including tall translated content');
  sheet.press('high');
  sheet.open();
  assert.equal(sheet.active('high'), false);
  assert.equal(sheet.animationRuns.length, initialRuns, 'Repeated icon taps must not restart entrance');
  sheet.unmount();
});

test('draft changes apply once while repeated Apply cannot duplicate updates during dismissal', async () => {
  const sheet = mountSheet();
  await sheet.ready();
  sheet.open();
  sheet.finish();
  sheet.press('high');
  sheet.press('holiday');
  assert.equal(sheet.applied.length, 0);
  assert.equal(sheet.selected.size, 4);
  assert.equal(sheet.active('high'), false);
  assert.equal(sheet.active('holiday'), false);
  sheet.press('apply');
  sheet.press('apply');
  assert.equal(sheet.applied.length, 1);
  assert.deepEqual([...sheet.applied[0]].sort(), ['low', 'medium']);
  assert.equal(sheet.visible, true, 'Host must stay rendered until its dismissal finishes');
  assert.equal(sheet.nativeWrites.at(-1)?.pointerEvents, 'box-only',
    'The exiting host must consume touches instead of exposing outgoing controls');
  sheet.finish();
  assert.equal(sheet.visible, false);
  sheet.open();
  assert.equal(sheet.active('high'), false);
  assert.equal(sheet.active('holiday'), false);
  sheet.unmount();
});

test('backdrop ignores the opening touch and cancellation restores the applied filters', async () => {
  const sheet = mountSheet();
  await sheet.ready();
  sheet.open();
  sheet.finish();
  sheet.press('high');
  const beforeDismiss = sheet.animationRuns.length;
  sheet.press('dismiss');
  sheet.tick(219);
  sheet.press('dismiss');
  assert.equal(sheet.animationRuns.length, beforeDismiss);
  assert.equal(sheet.visible, true);
  sheet.tick(1);
  sheet.press('dismiss');
  assert.equal(sheet.animationRuns.length, beforeDismiss + 1);
  sheet.finish();
  assert.equal(sheet.visible, false);
  assert.equal(sheet.applied.length, 0);
  sheet.open();
  assert.equal(sheet.active('high'), true);
  sheet.unmount();
});

test('hardware back dismisses an open sheet without applying and passes through when hidden', async () => {
  const sheet = mountSheet();
  await sheet.ready();
  assert.equal(sheet.back(), false);
  sheet.open();
  sheet.finish();
  sheet.press('holiday');
  assert.equal(sheet.back(), true);
  sheet.finish();
  assert.equal(sheet.visible, false);
  assert.equal(sheet.applied.length, 0);
  assert.equal(sheet.back(), false);
  sheet.open();
  assert.equal(sheet.active('holiday'), true);
  sheet.unmount();
});

test('reopening during dismissal rejects a stale animation completion', async () => {
  const sheet = mountSheet();
  await sheet.ready();
  sheet.open();
  sheet.finish();
  sheet.tick(220);
  sheet.press('dismiss');
  const closing = sheet.animationRuns.at(-1)!;
  sheet.open();
  assert.equal(closing.stopped, true);
  assert.equal(sheet.visible, true);
  closing.deliverStaleCompletion();
  sheet.render();
  assert.equal(sheet.visible, true, 'Cancelled dismissal cannot hide a new opening');
  sheet.finish();
  assert.equal(sheet.visible, true);
  assert.equal(sheet.applied.length, 0);
  sheet.unmount();
});

test('imperative close hides immediately, discards drafts, and makes late callbacks harmless after unmount', async () => {
  const sheet = mountSheet();
  await sheet.ready();
  sheet.open();
  sheet.press('high');
  const interrupted = sheet.animationRuns.at(-1)!;
  sheet.close();
  assert.equal(sheet.visible, false);
  assert.equal(sheet.applied.length, 0);
  sheet.open();
  assert.equal(sheet.active('high'), true);
  sheet.finish();
  sheet.tick(220);
  sheet.press('dismiss');
  const pending = sheet.animationRuns.at(-1)!;
  sheet.unmount();
  assert.equal(sheet.listeners.size, 0);
  assert.equal(pending.stopped, true);
  interrupted.deliverStaleCompletion();
  pending.deliverStaleCompletion();
  assert.equal(sheet.stateUpdatesAfterUnmount, 0);
});

test('reduced motion settles immediately without running entrance or dismissal animations', async () => {
  const sheet = mountSheet({ reduceMotion: true });
  await sheet.ready();
  sheet.layout(480);
  sheet.open();
  assert.equal(sheet.visible, true);
  assert.equal(sheet.translation().value, 0);
  assert.equal(sheet.animationRuns.length, 0);
  sheet.press('high');
  sheet.press('apply');
  assert.equal(sheet.visible, false);
  assert.equal(sheet.applied.length, 1);
  assert.equal(sheet.animationRuns.length, 0);
  sheet.unmount();
});

test('enabling reduced motion during dismissal settles hidden and rejects its late close completion', async () => {
  const sheet = mountSheet();
  await sheet.ready();
  sheet.open();
  sheet.finish();
  sheet.tick(220);
  sheet.press('dismiss');
  const closing = sheet.animationRuns.at(-1)!;
  sheet.motionPreference(true);
  assert.equal(sheet.visible, false, 'A preference change must finish dismissal instead of reopening the card');
  assert.equal(closing.stopped, true);
  closing.deliverStaleCompletion();
  sheet.render();
  assert.equal(sheet.visible, false);
  const starts = sheet.animationRuns.length;
  sheet.open();
  assert.equal(sheet.translation().value, 0);
  assert.equal(sheet.animationRuns.length, starts);
  sheet.unmount();
});

test('a late initial accessibility preference cannot override a newer reduced-motion event', async () => {
  const sheet = mountSheet();
  sheet.motionPreference(true);
  sheet.open();
  assert.equal(sheet.translation().value, 0);
  assert.equal(sheet.animationRuns.length, 0);
  await sheet.resolveInitialMotion(false);
  sheet.close();
  sheet.open();
  assert.equal(sheet.visible, true);
  assert.equal(sheet.translation().value, 0);
  assert.equal(sheet.animationRuns.length, 0, 'The stale initial preference cannot restore animation');
  sheet.unmount();
});

test('a theme change updates the open card without restarting its animation or losing its draft', async () => {
  const sheet = mountSheet();
  await sheet.ready();
  sheet.open();
  sheet.press('high');
  const starts = sheet.animationRuns.length;
  const translation = sheet.translation();
  const priorValues = translation.values.length;
  sheet.layout(600);
  assert.equal(translation.values.length, priorValues, 'An open card must not be parked again when its size changes');
  sheet.setDark(false);
  assert.equal(sheet.animationRuns.length, starts);
  assert.equal(sheet.visible, true);
  assert.equal(sheet.active('high'), false);
  const card = sheet.nodes().find((node) => node.props.testID === 'economic-event-filters-card');
  assert.equal(flattenStyle(card!.props.style).backgroundColor, '#FFFFFF');
  sheet.setDark(true);
  assert.equal(sheet.animationRuns.length, starts);
  assert.equal(flattenStyle(sheet.nodes().find((node) => node.props.testID === 'economic-event-filters-card')!.props.style).backgroundColor, sheet.theme.glass2);
  assert.equal(translation.values.length, priorValues, 'Theme updates must not repark the current card');
  assert.equal(sheet.applied.length, 0);
  sheet.unmount();
});
