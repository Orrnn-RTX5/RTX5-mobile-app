import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as bulk from './pendingBulkCancel';
import type { PendingOrderReadModel } from '../../api/orders/pendingOrders';
import { classifyTradingError, createTradingApiError } from '../../api/tradingErrors';
import { safeRouterBack } from '../../utils/navigation';

type Element = { type: unknown; props: Record<string, any>; children: unknown[] };
type Hook = { value?: any; dependencies?: readonly unknown[]; cleanup?: () => void };
const descendants = (value: unknown): Element[] => Array.isArray(value) ? value.flatMap(descendants)
  : value && typeof value === 'object' ? [value as Element, ...((value as Element).children ?? []).flatMap(descendants)] : [];
const compiled = (name: string) => ts.transpileModule(readFileSync(`src/features/trade/${name}.tsx`, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
}).outputText;
let sequence = 0;
function mount(component: 'PendingBulkOperationScreen' | 'PendingOrdersSection', options: {
  platform?: 'ios' | 'android'; dark?: boolean; mode?: string; readOnly?: boolean; empty?: boolean; scope?: string; deferFirst?: boolean; rejectTicket?: number;
} = {}) {
  const hooks: Hook[] = []; let cursor = 0, dirty = false, focused = true, readOnly = options.readOnly ?? false;
  let release: () => void = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  const namespace = 'pending-bulk-screen-' + ++sequence;
  let owner = { cacheNamespace: namespace, accountLogin: '123', credentialGeneration: 1 };
  let rows: PendingOrderReadModel[] = options.empty ? [] : ['buy_limit', 'sell_stop', 'buy_stop_limit'].map((type, index) => ({
    ticket: index + 1, accountLogin: 123, type: type as PendingOrderReadModel['type'], symbol: 'EURUSD', status: 'pending',
    timeSetup: 1, volume: '0.01', price: '1.1', priceLimit: null, sl: null, tp: null, expiry: null, timeDone: null,
    comment: null, stateVersion: '1', triggerPhase: null, timeInForce: 'GTC',
  }));
  const attempted: number[] = [], navigations: any[] = []; let invalidations = 0;
  const uiState = {
    scopedActionSheets: { trade: null as any },
    showTradeActionSheet: (config: unknown) => { uiState.scopedActionSheets.trade = config; },
    hideTradeActionSheet: () => { uiState.scopedActionSheets.trade = null; },
  };
  let focusCallback: (() => void | (() => void)) | undefined, focusCleanup: (() => void) | undefined;
  let beforeRemove: (() => void) | undefined;
  const navigation = { isFocused: () => focused, addListener: (_name: string, callback: () => void) => { beforeRemove = callback; return () => { beforeRemove = undefined; }; } };
  const next = () => hooks[cursor++] ?? (hooks[cursor - 1] = {});
  const changed = (hook: Hook, deps: readonly unknown[]) => !hook.dependencies || deps.some((value, index) => !Object.is(value, hook.dependencies![index]));
  const react = {
    Fragment: 'Fragment', createElement: (type: unknown, props: object, ...children: unknown[]): Element => ({ type, props: props ?? {}, children }),
    useRef: (initial: unknown) => { const hook = next(); return hook.value ??= { current: initial }; },
    useState: (initial: unknown) => { const hook = next(); if (!('value' in hook)) hook.value = initial;
      return [hook.value, (value: unknown) => { const nextValue = typeof value === 'function' ? value(hook.value) : value; dirty ||= !Object.is(hook.value, nextValue); hook.value = nextValue; }]; },
    useMemo: (factory: () => unknown, deps: readonly unknown[]) => { const hook = next(); if (changed(hook, deps)) { hook.value = factory(); hook.dependencies = deps; } return hook.value; },
    useCallback: (callback: unknown, deps: readonly unknown[]) => { const hook = next(); if (changed(hook, deps)) { hook.value = callback; hook.dependencies = deps; } return hook.value; },
    useEffect: (effect: () => void | (() => void), deps: readonly unknown[]) => { const hook = next(); if (changed(hook, deps)) { hook.cleanup?.(); hook.dependencies = deps; hook.cleanup = effect() || undefined; } },
  };
  const modules: Record<string, unknown> = {
    react,
    'react-native': { ActivityIndicator: 'Spinner', Platform: { OS: options.platform ?? 'ios' }, ScrollView: 'ScrollView', Text: 'Text', View: 'View', StyleSheet: { create: (styles: object) => styles, hairlineWidth: 1 } },
    'expo-router': { Stack: { Screen: 'StackScreen' }, router: { canGoBack: () => true, back: () => navigations.push('back'), replace: (href: unknown) => navigations.push(href), push: (href: unknown) => navigations.push(href) }, useLocalSearchParams: () => ({ mode: options.mode ?? 'all', accountScope: options.scope ?? namespace }) },
    '@react-navigation/native': { useIsFocused: () => focused, useNavigation: () => navigation, useFocusEffect: (callback: () => void | (() => void)) => { if (focusCallback !== callback) { focusCleanup?.(); focusCallback = callback; focusCleanup = callback() || undefined; } } },
    '@tanstack/react-query': { useQueryClient: () => ({}) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 20, bottom: 20, left: 0, right: 0 }) },
    'react-native-svg': { __esModule: true, default: 'Svg', Path: 'Path' },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '../../api/orders/pendingOrders': { cancelPendingOrder: async (ticket: number) => { attempted.push(ticket); if (options.deferFirst && attempted.length === 1) await pending;
      if (ticket === options.rejectTicket) throw createTradingApiError(409, { error: 'ORDER_STATE_CHANGED' }); rows = rows.filter(row => row.ticket !== ticket); } },
    '../../api/brokerApi': { StaleBrokerSessionError: class extends Error { name = 'StaleBrokerSessionError'; } },
    '../../api/tradingErrors': { classifyTradingError, createTradingApiError },
    '../../query/pendingOrders': { usePendingOrdersQuery: () => ({ data: rows, isError: false, refetch() {} }) },
    '../../query/authenticatedQueryScope': { useActiveBrokerQuerySession: () => owner, invalidateSessionQueryRoots: () => { invalidations++; } },
    '../../state/activeBrokerSession': { captureActiveBrokerSessionOwnerStamp: () => owner, isActiveBrokerSessionOwnerStampCurrent: (stamp: unknown) => stamp === owner },
    '../../state/pendingOrdersState': { usePendingOrdersState: { getState: () => ({ cacheNamespace: owner.cacheNamespace, orders: rows }) } },
    '../../state/uiState': { useUIState: Object.assign((selector: (state: typeof uiState) => unknown) => selector(uiState), { getState: () => uiState }) },
    '../../state/themeMode': { useIsDarkTheme: () => options.dark ?? false },
    '../../utils/actionLatency': { runImmediateAction: (_label: string, action: () => void) => action() },
    '../../hooks/useInvestorReadOnlySession': { useInvestorReadOnlySession: () => readOnly, blockInvestorTradeAction: () => readOnly, isActiveSessionInvestorReadOnly: () => readOnly },
    '../../ui/components/FastPressable': { FastPressable: 'Button' }, '../../ui/components/Screen': { Screen: 'Screen' },
    '../../ui/theme': { spacing: { md: 16 } },
    '../../ui/theme/useTheme': { useTheme: () => ({ text: '#fff', down: '#f00', border: '#333' }) },
    '../../i18n/useTranslation': { useTranslation: () => ({ t: (value: string) => value }) },
    '../../utils/navigation': { safeRouterBack }, './pendingBulkCancel': bulk,
    '../quotes/useLiveQuotes': { useLiveQuoteSubscription() {}, useLiveQuoteSnapshot: () => undefined },
  };
  const exports: Record<string, (props?: object) => Element> = {};
  runInNewContext(compiled(component), { exports, React: react, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
  let active = true;
  const render = () => { let tree!: Element, count = 0; do { assert.ok(++count < 10); dirty = false; cursor = 0; tree = exports[component]({ active }); } while (dirty); return tree; };
  const find = (label: string) => { const node = descendants(render()).find(row => row.props.accessibilityLabel === label); assert.ok(node, label); return node; };
  return { render, find, attempted, navigations, namespace, invalidations: () => invalidations, rows: () => rows,
    execute: () => find('Delete reviewed pending orders').props.onPress(), back: () => find('Back').props.onPress(),
    release: async () => { release(); await new Promise(resolve => setImmediate(resolve)); render(); },
    flush: async () => { await new Promise(resolve => setImmediate(resolve)); render(); },
    switchAccount: () => { owner = { ...owner, cacheNamespace: namespace + '-other', accountLogin: '456' }; render(); },
    makeReadOnly: () => { readOnly = true; render(); },
    leave: () => { focused = false; active = false; beforeRemove?.(); focusCleanup?.(); render(); },
    sheet: () => { render(); return { ...uiState.scopedActionSheets.trade, visible: uiState.scopedActionSheets.trade !== null }; },
    replaceWithPositionSheet: () => { const config = { actions: [{ label: 'Close All Positions' }] }; uiState.showTradeActionSheet(config); return config; },
    sharedSheet: () => uiState.scopedActionSheets.trade,
    unmount: () => { hooks.forEach(hook => hook.cleanup?.()); },
  };
}

for (const platform of ['ios', 'android'] as const) {
  test(`${platform}: Pending Orders Bulk opens the positions-style sheet and routes to review without deleting`, () => {
    for (const mode of ['all', 'buy', 'sell']) {
      const screen = mount('PendingOrdersSection', { platform });
      screen.find('Pending order bulk options').props.onPress();
      const sheet = screen.sheet(); assert.equal(sheet.visible, true); assert.equal(sheet.presentation, 'mt5Plain');
      assert.equal(sheet.instantOpen, true); assert.equal(sheet.showActionIcons, true); assert.equal(sheet.detent, 'auto');
      assert.equal(sheet.entryMotion, 'mt5Slide'); assert.equal(sheet.runActionAfterClose, false);
      const action = sheet.actions.find((row: { label: string }) => row.label === bulk.PENDING_BULK_OPTIONS.find(option => option.mode === mode)!.label);
      action.onPress(); action.onPress();
      assert.deepEqual(screen.attempted, []);
      assert.equal(screen.navigations.length, 1); assert.equal(screen.navigations[0].pathname, '/trade/pending-bulk');
      assert.equal(screen.navigations[0].params.mode, mode); assert.equal(screen.navigations[0].params.accountScope, screen.namespace);
    }
  });
  test(`${platform}: review executes the selected pending subset once and refreshes the account`, async () => {
    for (const [mode, expected] of [['all', [1, 2, 3]], ['buy', [1, 3]], ['sell', [2]]] as const) {
      const screen = mount('PendingBulkOperationScreen', { platform, mode });
      assert.deepEqual(screen.attempted, []); screen.execute(); screen.execute(); await screen.flush();
      assert.deepEqual(screen.attempted, expected); assert.equal(screen.invalidations(), 1);
      assert.equal(screen.find('Delete reviewed pending orders').props.disabled, true);
    }
  });
}

test('empty, read-only, invalid-mode and account-mismatch review screens cannot delete', async () => {
  for (const options of [{ empty: true }, { readOnly: true }, { mode: 'profitable' }, { scope: 'previous-account' }]) {
    const screen = mount('PendingBulkOperationScreen', options);
    const execute = descendants(screen.render()).find(row => row.props.accessibilityLabel === 'Delete reviewed pending orders');
    if (execute) { assert.equal(execute.props.disabled, true); execute.props.onPress(); }
    await screen.flush(); assert.deepEqual(screen.attempted, []);
  }
  const readOnly = mount('PendingOrdersSection', { readOnly: true });
  assert.equal(descendants(readOnly.render()).some(row => row.props.accessibilityLabel === 'Pending order bulk options'), false);
});

test('Back stops remaining deletions before blur, and a late completion cannot navigate again', async () => {
  const screen = mount('PendingBulkOperationScreen', { deferFirst: true });
  screen.execute(); assert.deepEqual(screen.attempted, [1]); screen.back(); screen.back(); await screen.release();
  assert.deepEqual(screen.attempted, [1]); assert.deepEqual(screen.navigations, ['back']);
  assert.equal(screen.rows().length, 2); assert.equal(screen.invalidations(), 1);
});

test('an account switch cancels remaining sends and suppresses stale account feedback', async () => {
  const screen = mount('PendingBulkOperationScreen', { deferFirst: true });
  screen.execute(); screen.switchAccount(); await screen.release();
  assert.deepEqual(screen.attempted, [1]); assert.equal(screen.invalidations(), 0);
  assert.equal(screen.navigations.length, 0);
});

test('partial rejection keeps failed orders visible and reports the real error', async () => {
  const screen = mount('PendingBulkOperationScreen', { rejectTicket: 2 });
  screen.execute(); await screen.flush();
  assert.deepEqual(screen.attempted, [1, 2, 3]); assert.deepEqual(screen.rows().map(row => row.ticket), [2]);
  const alerts = descendants(screen.render()).filter(row => row.props.accessibilityRole === 'alert');
  assert.equal(alerts.length, 1); assert.match(String(alerts[0].children[0]), /order changed/i);
});

test('a retained bulk menu cannot navigate for a different account or an unfocused Trade page', () => {
  for (const action of ['switchAccount', 'leave', 'makeReadOnly'] as const) {
    const screen = mount('PendingOrdersSection'); screen.find('Pending order bulk options').props.onPress();
    const select = screen.sheet().actions[0].onPress; screen[action](); select();
    assert.equal(screen.sheet().visible, false);
    assert.deepEqual(screen.navigations, []); assert.deepEqual(screen.attempted, []);
  }
});

test('pending bulk uses Positions icon colors in both themes and closes on unmount', () => {
  for (const dark of [false, true]) {
    const screen = mount('PendingOrdersSection', { dark });
    screen.find('Pending order bulk options').props.onPress();
    assert.ok(screen.sheet().actions.every((action: any) => action.icon.props.color === (dark ? '#EEF1F5' : '#4F535C')));
    screen.unmount(); assert.equal(screen.sharedSheet(), null);
  }
});

test('pending cleanup preserves a newer Positions menu in the same shared Trade host', () => {
  const screen = mount('PendingOrdersSection'); screen.find('Pending order bulk options').props.onPress();
  const positionSheet = screen.replaceWithPositionSheet();
  screen.leave(); screen.unmount();
  assert.equal(screen.sharedSheet(), positionSheet);
});
