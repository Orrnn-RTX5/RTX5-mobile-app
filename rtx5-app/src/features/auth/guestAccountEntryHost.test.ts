import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as publicContext from '../../state/publicBrokerContext';
import * as authFlow from '../trade/authFlowState';
import { publicBrokerFixture } from '../../testFixtures/publicBroker';
import { getDemoBrokerOptions } from './demoBrokerOptions';
import { resolveDemoAccountPolicy } from './demoAccountPolicy';
import { resolveStartupGuestBroker } from './startupGuestBroker';

type Element = { type: string; props: Record<string, any>; children: unknown[] };
type Broker = ReturnType<typeof publicBrokerFixture>;
type Hook = { value?: any; dependencies?: unknown[]; cleanup?: () => void };
const compiled = ts.transpileModule(readFileSync('src/features/auth/GuestFlowHost.tsx', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
}).outputText;
const mountedHosts = new Set<() => void>();

test.beforeEach(() => { authFlow.dismissAuthFlow(); publicContext.setPublicBrokerContext(null); });
test.afterEach(() => {
  mountedHosts.forEach(dispose => dispose());
  mountedHosts.clear();
  authFlow.dismissAuthFlow();
  publicContext.setPublicBrokerContext(null);
});

/** Render the production host, retaining hook state and executing its effects and callbacks. */
function mountHost() {
  const hooks: Hook[] = [];
  let hookIndex = 0;
  let dirty = false;
  let mounted = true;
  let pendingEffects: Array<() => void> = [];
  let directory: any;
  let pathname = '/quotes';
  const selections: Broker[] = [];
  const navigations: unknown[] = [];
  const preferences = {
    brokerId: '', isLoggedIn: false, chartSymbol: 'EURUSD', quoteSymbols: [] as string[],
    setChartSymbol() {}, setQuoteSymbols() {}, setHasSetInitialSymbols() {},
  };
  const nextHook = () => hooks[hookIndex++] ?? (hooks[hookIndex - 1] = {});
  const changed = (hook: Hook, dependencies: unknown[]) => !hook.dependencies
    || dependencies.length !== hook.dependencies.length
    || dependencies.some((value, index) => !Object.is(value, hook.dependencies![index]));
  const react = {
    Fragment: 'Fragment',
    createElement: (type: string, props: Record<string, any> | null, ...children: unknown[]): Element => ({ type, props: props ?? {}, children }),
    useState: (initial: unknown) => {
      const hook = nextHook();
      if (!('value' in hook)) hook.value = typeof initial === 'function' ? initial() : initial;
      return [hook.value, (value: unknown) => {
        if (!mounted) return;
        const next = typeof value === 'function' ? value(hook.value) : value;
        if (Object.is(next, hook.value)) return;
        hook.value = next;
        dirty = true;
      }];
    },
    useRef: (initial: unknown) => {
      const hook = nextHook();
      if (!('value' in hook)) hook.value = { current: initial };
      return hook.value;
    },
    useMemo: (factory: () => unknown, dependencies: unknown[]) => {
      const hook = nextHook();
      if (changed(hook, dependencies)) { hook.value = factory(); hook.dependencies = dependencies; }
      return hook.value;
    },
    useCallback: (callback: unknown, dependencies: unknown[]) => react.useMemo(() => callback, dependencies),
    useEffect: (effect: () => void | (() => void), dependencies: unknown[]) => {
      const hook = nextHook();
      if (!changed(hook, dependencies)) return;
      hook.dependencies = dependencies;
      pendingEffects.push(() => { hook.cleanup?.(); hook.cleanup = effect() || undefined; });
    },
    useSyncExternalStore: (subscribe: (notify: () => void) => () => void, snapshot: () => unknown) => {
      const hook = nextHook();
      if (!hook.cleanup) hook.cleanup = subscribe(() => { dirty = true; });
      return snapshot();
    },
  };
  const unexpectedAuthentication = () => assert.fail('opening or cancelling the form must not authenticate');
  const modules: Record<string, unknown> = {
    react: { ...react, default: react },
    'react-native': { Modal: 'Modal', View: 'View', Keyboard: { dismiss() {} } },
    'react-native-safe-area-context': { SafeAreaProvider: 'SafeAreaProvider' },
    'expo-router': { usePathname: () => pathname, router: { dismissTo: (value: unknown) => navigations.push(value), replace: (value: unknown) => navigations.push(value) } },
    '../../query/broker': { useBrokerDirectory: () => ({ data: directory }) },
    '../../state/userPreferences': { useUserPreferences: Object.assign((select: (state: typeof preferences) => unknown) => select(preferences), { getState: () => preferences }) },
    '../../ui/theme/useTheme': { useTheme: () => ({ bg: '#fff' }) },
    '../../state/publicBrokerContext': {
      ...publicContext,
      publicBrokerFetch: async () => new Response(JSON.stringify({ demo_registration_enabled: true }), { status: 200 }),
    },
    '../../state/activeBrokerSession': { captureActiveBrokerSession: () => null },
    '../trade/authFlowState': authFlow,
    '../../api/guestAuthentication': {
      authenticateGuest: unexpectedAuthentication,
      isDemoRegistrationEnabled: (config: any) => config?.demo_registration_enabled === true,
    },
    '../../services/brokerSessionCoordinator': {
      cancelBrokerSessionCommitAuthorization() {},
      authorizeBrokerSessionCommit: unexpectedAuthentication,
      commitBrokerSession: unexpectedAuthentication,
      logoutBrokerSession: () => assert.fail('guest entry must not log out an account'),
    },
    '../../services/selectGuestBroker': { selectGuestBroker: async (row: Broker) => {
      selections.push(row);
      return publicContext.setPublicBrokerContext(row);
    } },
    '../../services/bootstrapApp': {},
    '../../services/tradingAccess': {},
    '../../api/orrnnDemoPublicMarket': { getOrrnnDemoPublicMarketCatalog: async () => ({ symbols: ['EURUSD'] }) },
    '../../domain/marketSymbols': {},
    '../../domain/symbols': {},
    './DemoAccountScreen': { DemoAccountScreen: 'DemoAccountScreen' },
    './LoginAccountScreen': { LoginAccountScreen: 'LoginAccountScreen' },
    '../settings/BrokersScreen/BrokersScreen': { GuestBrokerPicker: 'GuestBrokerPicker' },
    '../settings/BrokersScreen/brokerDirectoryRows': { buildBrokerDirectoryRows: () => [] },
    '../../state/savedAccounts': {},
    './authRetryCountdown': { scheduleAuthRetryCountdown: () => assert.fail('entry must not start a retry countdown') },
    '../../utils/afterVisualFrame': {},
    './demoAccountPolicy': { resolveDemoAccountPolicy },
    './demoBrokerOptions': { getDemoBrokerOptions },
    './startupGuestBroker': { resolveStartupGuestBroker },
    '../settings/brokersLaunchController': { hideBrokersLaunch() {} },
    '../../ui/components/ActionSheet': { ActionSheet: 'ActionSheet' },
  };
  const exports: { GuestFlowHost?: () => Element } = {};
  runInNewContext(compiled, {
    exports, AbortController, Date, __DEV__: false,
    require: (name: string) => {
      assert.ok(name in modules, `unexpected production dependency: ${name}`);
      return modules[name];
    },
  });
  const dispose = () => {
    if (!mounted) return;
    mounted = false;
    hooks.forEach(hook => hook.cleanup?.());
  };
  mountedHosts.add(dispose);
  return {
    selections, navigations,
    dispose,
    setPathname: (value: string) => { pathname = value; },
    setDirectory: (servers: Broker[]) => { directory = { selectableServers: servers, entries: [], reportedBrokers: [] }; },
    render: () => {
      let tree: Element;
      let renders = 0;
      do {
        assert.ok(++renders < 25, 'host effects must settle without a render loop');
        dirty = false;
        hookIndex = 0;
        tree = exports.GuestFlowHost!();
        const effects = pendingEffects;
        pendingEffects = [];
        effects.forEach(effect => effect());
      } while (dirty);
      return tree!;
    },
  };
}

function descendants(tree: unknown, type: string): Element[] {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(child => descendants(child, type));
  const element = tree as Element;
  return [...(element.type === type ? [element] : []), ...(element.children ?? []).flatMap(child => descendants(child, type))];
}

function visibleAuthModal(tree: Element) {
  const modals = descendants(tree, 'Modal');
  const visible = modals.filter(modal => modal.props.visible);
  assert.equal(visible.length, 1, 'exactly one native modal owns guest account entry');
  const modal = visible[0];
  return { modal, position: modals.indexOf(modal) };
}

function onlyChild(tree: Element, type: string) {
  const children = descendants(tree, type);
  assert.equal(children.length, 1, `one ${type} should be rendered`);
  return children[0];
}

function selectSheetBroker(sheet: Element, brokerId: string) {
  const action = sheet.props.actions.find((action: any) => action.label === brokerId);
  assert.ok(action, `broker ${brokerId} is available in the sheet`);
  action.onPress();
  // The real sheet runs the action before notifying its parent of dismissal.
  sheet.props.onClose();
}

test('cold guest entry advances from broker selection to Login in the same visible native modal', async () => {
  const host = mountHost();
  assert.equal(descendants(host.render(), 'Modal').some(modal => modal.props.visible), false);
  authFlow.requestAccountEntry('login');
  const pickerTree = host.render();
  const before = visibleAuthModal(pickerTree);
  const picker = onlyChild(before.modal, 'GuestBrokerPicker');
  assert.equal(authFlow.getAuthFlowState().screen, 'select-broker');
  assert.equal(descendants(pickerTree, 'LoginAccountScreen').length, 0);

  const broker = publicBrokerFixture('Trivanta');
  picker.props.onSelectBroker(broker);
  await Promise.resolve();
  const loginTree = host.render();
  const after = visibleAuthModal(loginTree);
  assert.equal(after.position, before.position, 'the existing native modal changes content without a presentation handoff');
  assert.equal(after.modal.props.animationType, before.modal.props.animationType);
  assert.equal(descendants(loginTree, 'GuestBrokerPicker').length, 0);
  const login = onlyChild(after.modal, 'LoginAccountScreen');
  assert.equal(login.props.brokerId, 'Trivanta');
  assert.equal(authFlow.getAuthFlowState().screen, 'login');
  assert.deepEqual(host.selections, [broker]);
  assert.deepEqual(host.navigations, [], 'drawer account entry requires no native route replacement');

  login.props.onBack();
  assert.equal(descendants(host.render(), 'Modal').some(modal => modal.props.visible), false);
});

test('Back cancels broker selection and stale picker callbacks cannot change routing or reopen Login', async () => {
  const host = mountHost();
  authFlow.requestAccountEntry('login');
  const oldPicker = onlyChild(visibleAuthModal(host.render()).modal, 'GuestBrokerPicker');
  oldPicker.props.onBack();
  assert.equal(authFlow.getAuthFlowState().screen, 'guest');
  assert.equal(descendants(host.render(), 'Modal').some(modal => modal.props.visible), false);
  oldPicker.props.onSelectBroker(publicBrokerFixture('Old'));
  await Promise.resolve();
  assert.equal(publicContext.getPublicBrokerContext(), null);
  assert.deepEqual(host.selections, []);

  authFlow.requestAccountEntry('login');
  const currentPicker = onlyChild(visibleAuthModal(host.render()).modal, 'GuestBrokerPicker');
  oldPicker.props.onSelectBroker(publicBrokerFixture('Old'));
  await Promise.resolve();
  assert.equal(authFlow.getAuthFlowState().screen, 'select-broker');
  assert.equal(publicContext.getPublicBrokerContext(), null);
  assert.deepEqual(host.selections, []);
  currentPicker.props.onSelectBroker(publicBrokerFixture('Current'));
  await Promise.resolve();
  assert.equal(onlyChild(visibleAuthModal(host.render()).modal, 'LoginAccountScreen').props.brokerId, 'Current');
});

test('repeated drawer account entry and dismissal always open Login for the selected broker', () => {
  publicContext.setPublicBrokerContext(publicBrokerFixture('AnyBroker'));
  const host = mountHost();
  let modalPosition: number | undefined;
  for (let cycle = 0; cycle < 12; cycle++) {
    authFlow.requestAccountEntry('login');
    const attempt = authFlow.getAuthFlowState().attempt;
    authFlow.requestAccountEntry('login');
    assert.equal(authFlow.getAuthFlowState().attempt, attempt, 'a rapid duplicate tap does not replace the active entry');
    const active = visibleAuthModal(host.render());
    modalPosition ??= active.position;
    assert.equal(active.position, modalPosition);
    const login = onlyChild(active.modal, 'LoginAccountScreen');
    assert.equal(login.props.brokerId, 'AnyBroker');
    login.props.onBack();
    assert.equal(authFlow.getAuthFlowState().screen, 'guest');
    assert.equal(descendants(host.render(), 'Modal').some(modal => modal.props.visible), false);
  }
  assert.deepEqual(host.navigations, []);
});

test('a late directory response cannot let startup auto-selection take over an explicit account picker', async () => {
  const host = mountHost();
  host.render();
  authFlow.requestAccountEntry('login');
  host.render();
  const automatic = publicBrokerFixture('DirectoryFirst');
  const selected = publicBrokerFixture('ChosenByUser');
  host.setDirectory([automatic, selected]);
  const picker = onlyChild(visibleAuthModal(host.render()).modal, 'GuestBrokerPicker');
  assert.equal(authFlow.getAuthFlowState().screen, 'select-broker');
  assert.equal(publicContext.getPublicBrokerContext(), null);
  assert.deepEqual(host.selections, [], 'startup must leave the explicit broker choice to the user');
  picker.props.onSelectBroker(selected);
  await Promise.resolve();
  const login = onlyChild(visibleAuthModal(host.render()).modal, 'LoginAccountScreen');
  assert.equal(login.props.brokerId, 'ChosenByUser');
  assert.deepEqual(host.selections, [selected]);
});

test('Login and Demo stay mounted under the broker sheet through repeated selections', async () => {
  publicContext.setPublicBrokerContext(publicBrokerFixture('Initial'));
  const host = mountHost();
  host.setDirectory(['Initial', 'Selected0', 'Selected1', 'Selected2', 'Selected3'].map(id => publicBrokerFixture(id)));
  for (const form of ['login', 'demo', 'login', 'demo'] as const) {
    authFlow.requestAccountEntry(form);
    const before = visibleAuthModal(host.render());
    onlyChild(before.modal, form === 'login' ? 'LoginAccountScreen' : 'DemoAccountScreen').props.onChangeBroker();
    const tree = host.render();
    assert.equal(descendants(tree, 'Modal').length, 1, 'broker changes must never present a second native modal');
    const after = visibleAuthModal(tree);
    assert.equal(after.position, before.position);
    assert.equal(after.modal.props.presentationStyle, before.modal.props.presentationStyle);
    assert.equal(after.modal.props.animationType, before.modal.props.animationType);
    const samePage = onlyChild(after.modal, form === 'login' ? 'LoginAccountScreen' : 'DemoAccountScreen');
    assert.equal(samePage.props.key, onlyChild(before.modal, form === 'login' ? 'LoginAccountScreen' : 'DemoAccountScreen').props.key);
    assert.equal(descendants(tree, 'GuestBrokerPicker').length, 0);
    const sheet = onlyChild(after.modal, 'ActionSheet');
    assert.equal(sheet.props.visible, true);
    assert.equal(sheet.props.searchable, true);
    selectSheetBroker(sheet, `Selected${host.selections.length}`);
    await Promise.resolve();
    const returned = visibleAuthModal(host.render());
    assert.equal(returned.position, before.position);
    const account = onlyChild(returned.modal, form === 'login' ? 'LoginAccountScreen' : 'DemoAccountScreen');
    assert.equal(account.props.brokerId, `Selected${host.selections.length - 1}`);
    assert.equal(authFlow.getAuthFlowState().screen, form);
    assert.equal(onlyChild(returned.modal, 'ActionSheet').props.visible, false);
    account.props.onBack();
  }
  assert.equal(host.selections.length, 4);
  assert.deepEqual(host.navigations, []);
});

test('Back and native dismissal revoke broker-picker callbacks before a newer picker opens', async () => {
  publicContext.setPublicBrokerContext(publicBrokerFixture('Initial'));
  const host = mountHost();
  host.setDirectory(['Initial', 'Stale'].map(id => publicBrokerFixture(id)));
  const openPicker = () => {
    authFlow.requestAccountEntry('login');
    onlyChild(visibleAuthModal(host.render()).modal, 'LoginAccountScreen').props.onChangeBroker();
    return visibleAuthModal(host.render()).modal;
  };
  const oldModal = openPicker();
  const oldPicker = onlyChild(oldModal, 'ActionSheet');
  oldModal.props.onRequestClose();
  assert.equal(onlyChild(visibleAuthModal(host.render()).modal, 'LoginAccountScreen').props.brokerId, 'Initial');
  const current = openPicker();
  oldPicker.props.onClose();
  selectSheetBroker(oldPicker, 'Stale');
  await Promise.resolve();
  assert.equal(publicContext.getPublicBrokerContext()?.brokerId, 'Initial');
  assert.deepEqual(host.selections, []);
  assert.equal(visibleAuthModal(host.render()).modal.props.visible, true);
  onlyChild(current, 'ActionSheet').props.onClose();
  assert.equal(onlyChild(visibleAuthModal(host.render()).modal, 'LoginAccountScreen').props.brokerId, 'Initial');
});

test('cancelling the broker picker preserves the login fields and layout', () => {
  publicContext.setPublicBrokerContext(publicBrokerFixture('Initial'));
  const host = mountHost();
  authFlow.openAuthFlow(); // Broker account layout, also used by Accounts.
  const login = onlyChild(visibleAuthModal(host.render()).modal, 'LoginAccountScreen');
  assert.equal(login.props.variant, 'broker');
  login.props.onIdentityChange('123456');
  login.props.onPasswordChange('entered-password');
  login.props.onRememberChange(false);
  login.props.onChangeBroker();
  onlyChild(visibleAuthModal(host.render()).modal, 'ActionSheet').props.onClose();
  const returned = onlyChild(visibleAuthModal(host.render()).modal, 'LoginAccountScreen');
  assert.equal(returned.props.brokerId, 'Initial');
  assert.equal(returned.props.variant, 'broker');
  assert.equal(returned.props.identity, '123456');
  assert.equal(returned.props.password, 'entered-password');
  assert.equal(returned.props.remember, false);
});

test('guest trade prompt opens full LoginAccountScreen variant instead of shrunk broker variant', () => {
  publicContext.setPublicBrokerContext(publicBrokerFixture('Initial'));
  const host = mountHost();
  authFlow.openAuthFlow({ kind: 'order-ticket', symbol: 'XAUUSD', origin: 'quotes' });
  const login = onlyChild(visibleAuthModal(host.render()).modal, 'LoginAccountScreen');
  assert.equal(login.props.variant, 'login');
});


test('broker changes update the same Login page and preserve entered credentials', async () => {
  publicContext.setPublicBrokerContext(publicBrokerFixture('Initial'));
  const host = mountHost();
  host.setDirectory(['Initial', 'Selected'].map(id => publicBrokerFixture(id)));
  authFlow.requestAccountEntry('login');
  const login = onlyChild(visibleAuthModal(host.render()).modal, 'LoginAccountScreen');
  login.props.onIdentityChange('123456');
  login.props.onPasswordChange('entered-password');
  login.props.onRememberChange(false);
  login.props.onChangeBroker();
  const picker = onlyChild(visibleAuthModal(host.render()).modal, 'ActionSheet');
  selectSheetBroker(picker, 'Selected');
  await Promise.resolve();
  const returned = onlyChild(visibleAuthModal(host.render()).modal, 'LoginAccountScreen');
  assert.equal(returned.props.brokerId, 'Selected');
  assert.equal(returned.props.key, login.props.key, 'broker changes cannot remount the login form');
  assert.equal(returned.props.identity, '123456');
  assert.equal(returned.props.password, 'entered-password');
  assert.equal(returned.props.remember, false);
  assert.equal(returned.props.error, '');
  assert.deepEqual(host.navigations, []);
});

test('failed broker selection leaves the same Login page usable for a retry', async () => {
  publicContext.setPublicBrokerContext(publicBrokerFixture('Initial'));
  const host = mountHost();
  host.setDirectory([publicBrokerFixture('Initial'), publicBrokerFixture('Unsafe', { market_api_url: 'http://insecure.example.com' }), publicBrokerFixture('Retry')]);
  authFlow.requestAccountEntry('login');
  onlyChild(visibleAuthModal(host.render()).modal, 'LoginAccountScreen').props.onChangeBroker();
  selectSheetBroker(onlyChild(visibleAuthModal(host.render()).modal, 'ActionSheet'), 'Unsafe');
  await Promise.resolve();
  const returned = onlyChild(visibleAuthModal(host.render()).modal, 'LoginAccountScreen');
  assert.equal(returned.props.brokerId, 'Initial');
  assert.ok(returned.props.error);
  returned.props.onChangeBroker();
  selectSheetBroker(onlyChild(visibleAuthModal(host.render()).modal, 'ActionSheet'), 'Retry');
  await Promise.resolve();
  assert.equal(onlyChild(visibleAuthModal(host.render()).modal, 'LoginAccountScreen').props.brokerId, 'Retry');
});

test('dismissing authentication revokes an open broker picker', async () => {
  publicContext.setPublicBrokerContext(publicBrokerFixture('Initial'));
  const host = mountHost();
  host.setDirectory(['Initial', 'Stale'].map(id => publicBrokerFixture(id)));
  authFlow.requestAccountEntry('login');
  onlyChild(visibleAuthModal(host.render()).modal, 'LoginAccountScreen').props.onChangeBroker();
  const old = onlyChild(visibleAuthModal(host.render()).modal, 'ActionSheet');
  authFlow.dismissAuthFlow();
  assert.equal(descendants(host.render(), 'Modal').some(modal => modal.props.visible), false);
  selectSheetBroker(old, 'Stale');
  await Promise.resolve();
  assert.equal(publicContext.getPublicBrokerContext()?.brokerId, 'Initial');
  assert.deepEqual(host.selections, []);
});

test('an older broker-selection completion cannot close a newer picker', async () => {
  publicContext.setPublicBrokerContext(publicBrokerFixture('Initial'));
  const host = mountHost();
  host.setDirectory(['Initial', 'Selected'].map(id => publicBrokerFixture(id)));
  const openPicker = () => {
    authFlow.requestAccountEntry('login');
    onlyChild(visibleAuthModal(host.render()).modal, 'LoginAccountScreen').props.onChangeBroker();
    return onlyChild(visibleAuthModal(host.render()).modal, 'ActionSheet');
  };
  const old = openPicker();
  selectSheetBroker(old, 'Selected');
  old.props.onClose();
  host.render();
  openPicker();
  await Promise.resolve();
  assert.equal(onlyChild(visibleAuthModal(host.render()).modal, 'ActionSheet').props.visible, true);
});

test('navigation and unmount cancel broker selection without reopening Login', () => {
  for (const leave of ['navigate', 'unmount']) {
    publicContext.setPublicBrokerContext(publicBrokerFixture('Initial'));
    const host = mountHost();
    host.setDirectory(['Initial', 'Stale'].map(id => publicBrokerFixture(id)));
    authFlow.requestAccountEntry('login');
    onlyChild(visibleAuthModal(host.render()).modal, 'LoginAccountScreen').props.onChangeBroker();
    const old = onlyChild(visibleAuthModal(host.render()).modal, 'ActionSheet');
    if (leave === 'navigate') {
      host.setPathname('/chart');
      assert.equal(descendants(host.render(), 'Modal').some(modal => modal.props.visible), false);
    } else host.dispose();
    selectSheetBroker(old, 'Stale');
    assert.equal(publicContext.getPublicBrokerContext()?.brokerId, 'Initial');
    assert.deepEqual(host.selections, []);
  }
});
