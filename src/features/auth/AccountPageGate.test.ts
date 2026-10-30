import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

type Element = { type: string; props: Record<string, any>; children: unknown[] };
const source = readFileSync('src/features/auth/AccountPageGate.tsx', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
}).outputText;

function mount(page: 'Trade' | 'History') {
  let authenticated = false;
  let focused = true;
  let context: object | null = {};
  let previousDependencies: unknown[] | undefined;
  const requests: string[] = [];
  const effects: Array<() => void> = [];
  const child = { privateAccountData: true };
  const react = {
    createElement: (type: string, props: object, ...children: unknown[]) => ({ type, props, children }),
    useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
    useEffect: (effect: () => void, dependencies: unknown[]) => {
      if (!previousDependencies || dependencies.some((value, index) => value !== previousDependencies![index])) effects.push(effect);
      previousDependencies = dependencies;
    },
  };
  const modules: Record<string, unknown> = {
    react: { ...react, default: react },
    '@react-navigation/native': { useIsFocused: () => focused },
    'react-native': { View: 'View', Text: 'Text', StyleSheet: { create: (styles: object) => styles } },
    '../../state/activeBrokerSession': {},
    '../../state/publicBrokerContext': { getPublicBrokerContext: () => context },
    '../../state/userPreferences': {},
    '../trade/tradeAuthPrompt': {
      hasTradingSession: () => authenticated,
      requireTradingSession: (intent: { kind: string }) => { requests.push(intent.kind); return !authenticated; },
    },
    '../../i18n/useTranslation': { useTranslation: () => ({ t: (text: string) => text }) },
    '../../ui/components/AppHeader': { AppHeader: 'AppHeader' },
    '../../ui/components/FastPressable': { FastPressable: 'LoginButton' },
    '../../ui/components/Screen': { Screen: 'Screen' },
    '../../ui/theme/useTheme': { useTheme: () => ({}) },
  };
  const exports: { AccountPageGate?: (props: object) => unknown } = {};
  runInNewContext(compiled, { exports, require: (name: string) => {
    assert.ok(name in modules, `unexpected dependency: ${name}`);
    return modules[name];
  } });
  return {
    child, requests,
    setAuthenticated: (value: boolean) => { authenticated = value; },
    setFocused: (value: boolean) => { focused = value; },
    setContext: (value: object | null) => { context = value; },
    render: () => {
      const tree = exports.AccountPageGate!({ page, children: child });
      effects.splice(0).forEach(effect => effect());
      return tree;
    },
  };
}

for (const page of ['Trade', 'History'] as const) {
  test(`${page} direct entry requires login and hides account data after logout`, () => {
    const host = mount(page);
    const locked = host.render() as Element;
    assert.equal(locked.type, 'Screen');
    assert.deepEqual(host.requests, [page === 'Trade' ? 'trade-tab' : 'history-tab']);
    host.render();
    assert.equal(host.requests.length, 1, 'dismissing Login must not immediately reopen it');
    const content = locked.children[1] as Element;
    const login = content.children[2] as Element;
    assert.equal(login.type, 'LoginButton');
    login.props.onPress();
    assert.equal(host.requests.length, 2, 'the user can explicitly retry login');
    host.setAuthenticated(true);
    assert.equal(host.render(), host.child);
    host.setAuthenticated(false);
    assert.notEqual(host.render(), host.child, 'a retained account screen must disappear on logout');
    assert.equal(host.requests.length, 3);
  });

  test(`${page} hidden guest prewarming never opens authentication`, () => {
    const host = mount(page);
    host.setFocused(false);
    host.render();
    assert.deepEqual(host.requests, []);
    host.setContext(null);
    host.setFocused(true);
    host.render();
    assert.deepEqual(host.requests, []);
    host.setContext({});
    host.render();
    assert.equal(host.requests.length, 1, 'a focused direct link can request login once its broker is ready');
  });
}

test('Trade and History use the same page gate for every route and retained mount', () => {
  for (const [file, page] of [
    ['src/features/trade/TradeScreen/TradeScreen.tsx', 'Trade'],
    ['src/features/history/HistoryScreen.tsx', 'History'],
  ]) {
    assert.ok(readFileSync(file, 'utf8').includes(`<AccountPageGate page="${page}">`), file);
  }
});
