import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { StackActions, StackRouter } from '@react-navigation/routers';
import type { StackActionType } from '@react-navigation/routers';
import ts from 'typescript';

const readSource = (file: string) => readFileSync(resolve(process.cwd(), 'src/features/auth', file), 'utf8');
const entrySource = ts.transpileModule(readSource('AuthEntryScreen.tsx'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function createNavigation(initialRouteName = '(tabs)') {
  const stack = StackRouter({ initialRouteName });
  const options = {
    routeNames: ['(tabs)', 'login', 'register', 'register-entry', 'settings/accounts', 'settings/broker-detail'],
    routeParamList: {},
    routeGetIdList: {},
  };
  let state = stack.getInitialState(options);
  const dispatch = (action: StackActionType) => {
    const next = stack.getStateForAction(state, action, options);
    assert.ok(next, `stack must handle ${action.type}`);
    assert.equal(next.stale, false, 'stack actions preserve a hydrated navigation state');
    if (next.stale !== false) throw new Error('Unexpected partial navigation state');
    state = next;
  };
  // Expo Router maps the nested Quotes href to the tabs route in the root
  // stack, with dismissTo -> POP_TO and replace -> REPLACE.
  const rootDestination = (href: string) => {
    assert.equal(href, '/(tabs)/quotes');
    return ['(tabs)', { screen: 'quotes', params: {} }] as const;
  };
  const router = {
    dismissTo: (href: string) => dispatch(StackActions.popTo(...rootDestination(href))),
    replace: (href: string) => dispatch(StackActions.replace(...rootDestination(href))),
  };
  return { router, dispatch, getState: () => state };
}

function runEntry(
  navigation: ReturnType<typeof createNavigation>,
  { pathname = '/login', platform = 'ios', focused = true, context = {} as object | null, form = 'login' as 'login' | 'demo' } = {},
) {
  const effects: Array<() => void> = [];
  const authEntries: string[] = [];
  const exports: { AuthEntryScreen?: (props: { form: 'login' | 'demo' }) => null } = {};
  const dependencies: Record<string, unknown> = {
    '@react-navigation/native': { useIsFocused: () => focused },
    react: {
      useEffect: (effect: () => void) => effects.push(effect),
      useSyncExternalStore: () => context,
    },
    'react-native': { Platform: { OS: platform } },
    'expo-router': { router: navigation.router, usePathname: () => pathname },
    '../../state/publicBrokerContext': {},
    '../trade/authFlowState': {
      openAuthFlow: () => authEntries.push('open'),
      deferAuthEntryUntilQuotes: () => authEntries.push('defer'),
    },
    '../settings/registerLaunchController': { hideRegisterLaunch: () => undefined },
    '../settings/brokerDetailLaunchController': { hideBrokerDetailLaunch: () => undefined },
  };
  runInNewContext(entrySource, {
    exports,
    require: (name: string) => {
      assert.ok(name in dependencies, `unexpected entry dependency: ${name}`);
      return dependencies[name];
    },
  });
  assert.ok(exports.AuthEntryScreen);
  exports.AuthEntryScreen({ form });
  effects.forEach(effect => effect());
  return authEntries;
}

function assertSingleDashboard(navigation: ReturnType<typeof createNavigation>, originalKey?: string) {
  const state = navigation.getState();
  assert.equal(state.index, 0);
  assert.deepEqual(state.routes.map(route => route.name), ['(tabs)']);
  if (originalKey) assert.equal(state.routes[0].key, originalKey, 'reuse the original native dashboard');
  assert.equal((state.routes[0].params as { screen?: string }).screen, 'quotes');
}

test('guest login and demo entries return to the existing dashboard on iOS and Android', () => {
  for (const platform of ['ios', 'android']) {
    for (const [route, form] of [['login', 'login'], ['register', 'demo'], ['register-entry', 'demo'], ['settings/broker-detail', 'login']] as const) {
      const navigation = createNavigation();
      const dashboardKey = navigation.getState().routes[0].key;
      navigation.dispatch(StackActions.push(route));
      assert.equal(runEntry(navigation, { pathname: `/${route}`, platform, form }).length, 1);
      assertSingleDashboard(navigation, dashboardKey);
    }
  }
});

test('logout from Accounts does not replace Login with a second native tabs screen', () => {
  const navigation = createNavigation();
  const dashboardKey = navigation.getState().routes[0].key;
  navigation.dispatch(StackActions.push('settings/accounts'));
  navigation.dispatch(StackActions.replace('login'));
  runEntry(navigation);
  assertSingleDashboard(navigation, dashboardKey);
});

test('a direct login or registration link still creates a dashboard when none exists', () => {
  for (const route of ['login', 'register']) {
    const navigation = createNavigation(route);
    runEntry(navigation, { pathname: `/${route}`, form: route === 'login' ? 'login' : 'demo' });
    assertSingleDashboard(navigation);
  }
});

test('repeated guest authentication and logout cycles retain one dashboard', () => {
  const navigation = createNavigation();
  const dashboardKey = navigation.getState().routes[0].key;
  for (let cycle = 0; cycle < 8; cycle += 1) {
    navigation.dispatch(StackActions.push('login'));
    runEntry(navigation);
    assertSingleDashboard(navigation, dashboardKey);
    navigation.dispatch(StackActions.push('settings/accounts'));
    navigation.dispatch(StackActions.replace('login'));
    runEntry(navigation);
    assertSingleDashboard(navigation, dashboardKey);
  }
});

test('retained or unready auth entries cannot alter navigation or reopen authentication', () => {
  for (const options of [{ focused: false }, { context: null }, { pathname: '/quotes' }]) {
    const navigation = createNavigation();
    const before = navigation.getState();
    assert.deepEqual(runEntry(navigation, options), []);
    assert.equal(navigation.getState(), before);
  }
});

test('every login and registration completion reuses the dashboard beneath an entry', () => {
  const source = ts.createSourceFile('GuestFlowHost.tsx', readSource('GuestFlowHost.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const dashboardCalls: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.expression.getText(source) === 'router'
      && node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0])
      && node.arguments[0].text === '/(tabs)/quotes') dashboardCalls.push(node.getText(source));
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.equal(dashboardCalls.length, 3, 'ordinary login, rejected trade symbol, and completed registration');
  for (const call of dashboardCalls) {
    const navigation = createNavigation();
    const dashboardKey = navigation.getState().routes[0].key;
    navigation.dispatch(StackActions.push('login'));
    runInNewContext(call, { router: navigation.router });
    assertSingleDashboard(navigation, dashboardKey);
  }
});
