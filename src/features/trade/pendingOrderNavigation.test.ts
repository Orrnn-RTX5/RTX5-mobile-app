import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as pendingRules from '../../domain/pendingOrders';
import { safeRouterBack } from '../../utils/navigation';

type Element = { type: string; props: Record<string, any>; children: unknown[] };
type Hook = { value?: any; dependencies?: unknown[]; cleanup?: () => void };
const compiled = ts.transpileModule(readFileSync('src/features/trade/PendingOrderScreen.tsx', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
}).outputText;

function descendants(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!node || typeof node !== 'object') return [];
  const element = node as Element;
  return [element, ...(element.children ?? []).flatMap(descendants)];
}

function mount(options: { canGoBack?: boolean; backThrows?: boolean; platform?: 'ios' | 'android'; orderActive?: boolean; accountScope?: string; sl?: string | null; tp?: string | null } = {}) {
  const hooks: Hook[] = [];
  let cursor = 0;
  let dirty = false;
  let focused = true;
  let currentSession = true;
  let focusEffect: (() => void | (() => void)) | undefined;
  let focusCleanup: (() => void) | undefined;
  let resolveRequest: () => void = () => {};
  let rejectRequest: (error: Error) => void = () => {};
  const request = new Promise<void>((resolve, reject) => { resolveRequest = resolve; rejectRequest = reject; });
  const navigations: string[] = [];
  const commands: string[] = [];
  const modifications: Array<{ ticket: number; body: Record<string, unknown> }> = [];
  let invalidations = 0;
  let confirmDelete: (() => void) | undefined;
  let beforeRemove: (() => void) | undefined;
  const navigation = {
    isFocused: () => focused,
    canGoBack: () => options.canGoBack !== false,
    goBack: () => {
      if (options.backThrows) throw new Error('The route is no longer available');
      beforeRemove?.();
      navigations.push('back');
    },
    addListener: (_event: string, listener: () => void) => {
      beforeRemove = listener;
      return () => { beforeRemove = undefined; };
    },
  };
  const next = () => hooks[cursor++] ?? (hooks[cursor - 1] = {});
  const changed = (hook: Hook, dependencies: unknown[]) => !hook.dependencies
    || dependencies.length !== hook.dependencies.length
    || dependencies.some((value, index) => !Object.is(value, hook.dependencies![index]));
  const react = {
    createElement: (type: string, props: object, ...children: unknown[]): Element => ({ type, props: props ?? {}, children }),
    useRef: (initial: unknown) => { const hook = next(); return hook.value ??= { current: initial }; },
    useState: (initial: unknown) => {
      const hook = next();
      if (!('value' in hook)) hook.value = initial;
      return [hook.value, (value: unknown) => { if (!Object.is(hook.value, value)) dirty = true; hook.value = value; }];
    },
    useCallback: (callback: unknown, dependencies: unknown[]) => {
      const hook = next();
      if (changed(hook, dependencies)) { hook.value = callback; hook.dependencies = dependencies; }
      return hook.value;
    },
    useEffect: (effect: () => void | (() => void), dependencies: unknown[]) => {
      const hook = next();
      if (changed(hook, dependencies)) { hook.cleanup?.(); hook.dependencies = dependencies; hook.cleanup = effect() || undefined; }
    },
  };
  const owner = { cacheNamespace: 'account-A', accountLogin: '123' };
  const order = { ticket: 7, accountLogin: 123, symbol: 'EURUSD', type: 'buy_limit', price: 100, priceLimit: 0, sl: options.sl ?? null, tp: options.tp ?? null, volume: 0.01, timeInForce: 'GTC', expiry: null };
  const modules: Record<string, unknown> = {
    react,
    'react-native-svg': { __esModule: true, default: 'Svg', Path: 'Path' },
    'react-native': { Platform: { OS: options.platform ?? 'ios' }, StyleSheet: { create: (styles: object) => styles, hairlineWidth: 1 }, ActivityIndicator: 'Spinner', ScrollView: 'ScrollView', Text: 'Text', View: 'View', Alert: { alert: (_title: string, _text: string, buttons: any[]) => { confirmDelete = buttons[1].onPress; } } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }) },
    'expo-router': { Stack: { Screen: 'StackScreen' }, useLocalSearchParams: () => ({ ticket: '7', accountScope: options.accountScope ?? 'account-A' }), router: {
      canGoBack: () => { throw new Error('Back must use the current screen, not global state'); },
      back: () => { throw new Error('Do not enqueue a global GO_BACK'); },
      replace: (href: string) => navigations.push(href),
    } },
    '@react-navigation/native': { useIsFocused: () => focused, useNavigation: () => navigation, useFocusEffect: (effect: () => void | (() => void)) => {
      if (focusEffect === effect) return;
      focusCleanup?.(); focusEffect = effect; focusCleanup = focused ? effect() || undefined : undefined;
    } },
    '@tanstack/react-query': { useQueryClient: () => ({}) },
    '../../query/pendingOrders': { usePendingOrdersQuery: () => ({ data: options.orderActive === false ? [] : [order], isError: false, refetch() {} }) },
    '../../query/authenticatedQueryScope': { useActiveBrokerQuerySession: () => owner, invalidateSessionQueryRoots: () => { invalidations++; } },
    '../../state/activeBrokerSession': { captureActiveBrokerSessionOwnerStamp: () => owner, isActiveBrokerSessionOwnerStampCurrent: () => currentSession },
    '../../query/instruments': { useInstrumentMeta: () => ({ data: { digits: 2, tickSize: 0.01, stopsLevel: 0 } }) },
    '../quotes/useExecutableQuote': { useExecutableQuote: () => ({ quote: { bid: 99, ask: 101 }, getCurrentAvailability: () => ({ allowed: true, bid: 99, ask: 101 }) }) },
    '../../api/orders/pendingOrders': {
      modifyPendingOrder: (ticket: number, body: Record<string, unknown>) => { commands.push('modify'); modifications.push({ ticket, body }); return request; },
      cancelPendingOrder: () => { commands.push('cancel'); return request; },
    },
    '../../domain/pendingOrders': pendingRules,
    './PendingOrderFields': { PendingOrderFields: 'Fields' },
    '../../ui/theme/useTheme': { useTheme: () => ({}) },
    '../../ui/components/FastPressable': { FastPressable: 'Button' },
    '../../ui/components/Screen': { Screen: 'Screen' },
    '../../hooks/useInvestorReadOnlySession': { blockInvestorTradeAction: () => false, useInvestorReadOnlySession: () => false },
    '../../api/tradingErrors': { classifyTradingError: (error: Error) => ({ message: error.message }) },
    '../../utils/navigation': { safeRouterBack },
  };
  const exports: { PendingOrderScreen?: () => Element } = {};
  runInNewContext(compiled, { exports, React: react, require: (name: string) => {
    assert.ok(name in modules, `unexpected dependency ${name}`);
    return modules[name];
  } });
  const render = () => {
    let tree: Element;
    let renders = 0;
    do { assert.ok(++renders < 10); dirty = false; cursor = 0; tree = exports.PendingOrderScreen!(); } while (dirty);
    return tree!;
  };
  const button = (label: string) => {
    const found = descendants(render()).find(node => node.props.accessibilityLabel === label);
    assert.ok(found);
    return found;
  };
  return {
    render, navigations, commands, modifications, invalidations: () => invalidations,
    fields: () => { const fields = descendants(render()).find(node => node.type === 'Fields'); assert.ok(fields); return fields.props; },
    back: () => {
      const tree = render();
      const header = descendants(tree).find(node => node.type === 'StackScreen')?.props.options;
      assert.equal(header?.headerShown, false, 'the page owns the header layout');
      const back = descendants(tree).find(node => node.props.accessibilityLabel === 'Back');
      assert.ok(back);
      assert.equal(back.props.accessibilityRole, 'button');
      assert.equal(back.props.accessibilityLabel, 'Back');
      assert.equal(back.props.activateOnPressIn, undefined, 'complete the touch before removing its screen');
      back.props.onPress();
    },
    save: () => button('Save pending order').props.onPress(),
    delete: () => { button('Delete pending order').props.onPress(); confirmDelete!(); },
    confirmation: () => { button('Delete pending order').props.onPress(); return confirmDelete!; },
    leave: () => { focused = false; focusCleanup?.(); focusCleanup = undefined; },
    returnToScreen: () => { focused = true; focusCleanup = focusEffect?.() || undefined; render(); },
    switchSession: () => { currentSession = false; },
    nativeBack: () => { beforeRemove?.(); navigations.push('native-back'); },
    unmount: () => { focused = false; focusCleanup?.(); hooks.forEach(hook => hook.cleanup?.()); },
    complete: async () => { resolveRequest(); await request; await Promise.resolve(); },
    fail: async () => { rejectRequest(new Error('Request failed')); await request.catch(() => {}); await Promise.resolve(); },
  };
}

test('pending header Back returns to the previous page or Trade, including inactive orders and changed accounts', () => {
  for (const canGoBack of [true, false]) for (const platform of ['ios', 'android'] as const) {
    for (const state of [{}, { orderActive: false }, { accountScope: 'previous-account' }]) {
      const screen = mount({ canGoBack, platform, ...state });
      screen.back(); screen.back();
      assert.deepEqual(screen.navigations, [canGoBack ? 'back' : '/(tabs)/trade']);
      assert.deepEqual(screen.commands, [], 'Back must not modify or cancel an order');
    }
  }
});

test('an unavailable screen navigator falls back to Trade without throwing or using global Back', () => {
  for (const platform of ['ios', 'android'] as const) {
    const screen = mount({ platform, backThrows: true });
    assert.doesNotThrow(() => { screen.back(); screen.back(); });
    assert.deepEqual(screen.navigations, ['/(tabs)/trade']);
    assert.deepEqual(screen.commands, []);
  }
});

test('native Back invalidates pending requests before blur so their completion cannot navigate again', async () => {
  for (const platform of ['ios', 'android'] as const) for (const action of ['save', 'delete'] as const) {
    const screen = mount({ platform });
    screen[action](); screen.nativeBack();
    // Keep isFocused true to reproduce the native-stack removal/blur gap.
    screen.back();
    await screen.complete();
    assert.deepEqual(screen.navigations, ['native-back']);
    assert.equal(screen.invalidations(), 1);
  }
});

test('native Back rejects retained Delete confirmations and stale button callbacks', () => {
  const screen = mount();
  const confirm = screen.confirmation();
  screen.nativeBack(); confirm(); screen.back();
  assert.deepEqual(screen.commands, []);
  assert.deepEqual(screen.navigations, ['native-back']);
  screen.leave(); screen.back();
  assert.deepEqual(screen.navigations, ['native-back']);
  screen.returnToScreen(); screen.back();
  assert.deepEqual(screen.navigations, ['native-back', 'back']);
});

test('header Back invalidates an in-flight completion before the navigator reports blur', async () => {
  for (const action of ['save', 'delete'] as const) {
    const screen = mount();
    screen[action](); screen.back();
    await screen.complete();
    assert.deepEqual(screen.navigations, ['back'], 'request completion cannot pop the destination page');
    assert.equal(screen.invalidations(), 1);
    screen.leave(); screen.returnToScreen(); screen.back();
    assert.deepEqual(screen.navigations, ['back', 'back'], 'a later visit gets a working Back button');
  }
});

test('a delayed Delete confirmation cannot submit after header Back before blur', () => {
  const screen = mount();
  const confirm = screen.confirmation();
  screen.back(); confirm();
  assert.deepEqual(screen.commands, []);
});

test('pending Save and Delete return once, with Trade fallback when no Back history exists', async () => {
  for (const action of ['save', 'delete'] as const) for (const canGoBack of [true, false]) for (const platform of ['ios', 'android'] as const) {
    const screen = mount({ canGoBack, platform });
    const scroll = descendants(screen.render()).find(node => node.type === 'ScrollView');
    assert.equal(scroll?.props.keyboardShouldPersistTaps, 'always');
    assert.equal(scroll?.props.canCancelContentTouches, platform === 'ios');
    screen[action]();
    assert.deepEqual(screen.commands, [action === 'save' ? 'modify' : 'cancel']);
    assert.deepEqual(screen.navigations, []);
    await screen.complete();
    assert.deepEqual(screen.navigations, [canGoBack ? 'back' : '/(tabs)/trade']);
    assert.equal(screen.invalidations(), 1);
  }
});

test('pending completions refresh orders without popping another page after leaving or returning', async () => {
  for (const action of ['save', 'delete'] as const) for (const returnToScreen of [true, false]) {
    const screen = mount();
    screen[action](); screen.leave();
    if (returnToScreen) screen.returnToScreen();
    await screen.complete();
    assert.deepEqual(screen.navigations, []);
    assert.equal(screen.invalidations(), 1, 'a completed order still refreshes its account');
  }
});

test('unmount and session replacement prevent stale pending-order navigation', async () => {
  for (const leave of ['unmount', 'switchSession'] as const) {
    const screen = mount();
    screen.save(); screen[leave](); await screen.complete();
    assert.deepEqual(screen.navigations, []);
    assert.equal(screen.invalidations(), leave === 'unmount' ? 1 : 0);
  }
});

test('a delayed Delete confirmation cannot submit after leaving, even on a later visit', () => {
  for (const returnToScreen of [true, false]) {
    const screen = mount();
    const confirm = screen.confirmation(); screen.leave();
    if (returnToScreen) screen.returnToScreen();
    confirm();
    assert.deepEqual(screen.commands, []);
  }
});

test('late failures do not display an error on a later visit, while current failures remain visible', async () => {
  for (const leave of [true, false]) {
    const screen = mount(); screen.save();
    if (leave) { screen.leave(); screen.returnToScreen(); }
    await screen.fail();
    const errors = descendants(screen.render()).filter(node => node.props.accessibilityRole === 'alert');
    assert.equal(errors.length, leave ? 0 : 1);
    assert.deepEqual(screen.navigations, []);
  }
});

for (const platform of ['ios', 'android'] as const) {
  test(`${platform}: saving a pending-order price edit preserves existing backend SL and TP`, async () => {
    const screen = mount({ platform, sl: '90.25', tp: '110.50' });
    const fields = screen.fields();
    assert.equal(fields.sl, 90.25); assert.equal(fields.tp, 110.5);
    fields.onPrice(99.5); screen.save();
    assert.equal(screen.modifications.length, 1);
    assert.equal(screen.modifications[0].body.price, 99.5);
    assert.equal(screen.modifications[0].body.sl, 90.25);
    assert.equal(screen.modifications[0].body.tp, 110.5);
    await screen.complete();
  });
  test(`${platform}: absent protection stays blank and explicitly cleared protection is removed`, async () => {
    const blank = mount({ platform });
    assert.equal(blank.fields().sl, 0); assert.equal(blank.fields().tp, 0);
    blank.save(); assert.equal(blank.modifications[0].body.sl, null); assert.equal(blank.modifications[0].body.tp, null);
    await blank.complete();
    const protectedOrder = mount({ platform, sl: '90.25', tp: '110.50' });
    protectedOrder.fields().onSl(0); protectedOrder.save();
    assert.equal(protectedOrder.modifications[0].body.sl, null);
    assert.equal(protectedOrder.modifications[0].body.tp, 110.5);
    await protectedOrder.complete();
  });
}
