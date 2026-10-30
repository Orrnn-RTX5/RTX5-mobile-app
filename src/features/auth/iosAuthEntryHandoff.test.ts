import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as publicContext from '../../state/publicBrokerContext';
import * as authFlow from '../trade/authFlowState';
import { setPublicBrokerContext } from '../../state/publicBrokerContext';
import { publicBrokerFixture } from '../../testFixtures/publicBroker';
import {
  completeDeferredAuthEntry,
  deferAuthEntryUntilQuotes,
  dismissAuthFlow,
  getAuthFlowState,
  openAuthFlow,
} from '../trade/authFlowState';

test.beforeEach(() => { setPublicBrokerContext(publicBrokerFixture()); dismissAuthFlow(); });
test.afterEach(() => { dismissAuthFlow(); setPublicBrokerContext(null); });

test('iOS login and registration wait until their native entry route has returned to Quotes', () => {
  for (const [form, entry] of [['login', '/login'], ['demo', '/register-entry'], ['demo', '/register']] as const) {
    dismissAuthFlow();
    assert.equal(deferAuthEntryUntilQuotes(form, entry), true);
    assert.equal(getAuthFlowState().screen, 'guest', 'do not present over a native screen being removed');
    assert.equal(completeDeferredAuthEntry(entry), false);
    assert.equal(getAuthFlowState().screen, 'guest');
    assert.equal(completeDeferredAuthEntry('/(tabs)/quotes'), true);
    assert.equal(getAuthFlowState().screen, form);
    const attempt = getAuthFlowState().attempt;
    assert.equal(completeDeferredAuthEntry('/quotes'), false);
    assert.equal(getAuthFlowState().attempt, attempt, 'one modal presentation per entry');
  }
});

test('Back, broker changes and unrelated navigation revoke a deferred native presentation', () => {
  for (const cancel of [
    () => dismissAuthFlow(),
    () => setPublicBrokerContext(publicBrokerFixture('Other')),
    () => { completeDeferredAuthEntry('/settings'); },
  ]) {
    dismissAuthFlow();
    deferAuthEntryUntilQuotes('demo', '/register-entry');
    cancel();
    assert.equal(completeDeferredAuthEntry('/quotes'), false);
    assert.equal(getAuthFlowState().screen, 'guest');
  }
});

test('a newer direct authentication request cannot be replaced by an old pending entry', () => {
  deferAuthEntryUntilQuotes('demo', '/register-entry');
  openAuthFlow(undefined, 'login');
  const attempt = getAuthFlowState().attempt;
  assert.equal(completeDeferredAuthEntry('/quotes'), false);
  assert.equal(getAuthFlowState().form, 'login');
  assert.equal(getAuthFlowState().attempt, attempt);
});

test('an entry without a broker or from an unrelated route cannot queue a modal', () => {
  assert.equal(deferAuthEntryUntilQuotes('login', '/settings'), false);
  setPublicBrokerContext(null);
  assert.equal(deferAuthEntryUntilQuotes('login', '/login'), false);
  assert.equal(completeDeferredAuthEntry('/quotes'), false);
});

function renderEntry(platform: string, focused = true) {
  const replacements: Array<{ path: string; screenAtReplace: string }> = [];
  const exports: { AuthEntryScreen?: (props: { form: 'login' | 'demo' }) => null } = {};
  runInNewContext(ts.transpileModule(readFileSync('src/features/auth/AuthEntryScreen.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, {
    exports,
    require: (name: string) => {
      if (name === '@react-navigation/native') return { useIsFocused: () => focused };
      if (name === 'react') return { useEffect: (effect: () => void) => effect(), useSyncExternalStore: (_subscribe: unknown, get: () => unknown) => get() };
      if (name === 'react-native') return { Platform: { OS: platform } };
      if (name === 'expo-router') return {
        usePathname: () => '/register-entry',
        router: { dismissTo: (path: string) => replacements.push({ path, screenAtReplace: getAuthFlowState().screen }) },
      };
      if (name.endsWith('publicBrokerContext')) return publicContext;
      if (name.endsWith('authFlowState')) return authFlow;
      return { hideRegisterLaunch() {}, hideBrokerDetailLaunch() {} };
    },
  });
  exports.AuthEntryScreen!({ form: 'demo' });
  return replacements;
}

test('the real iOS entry effect replaces its screen before requesting native presentation', () => {
  assert.deepEqual(renderEntry('ios'), [{ path: '/(tabs)/quotes', screenAtReplace: 'guest' }]);
  assert.equal(completeDeferredAuthEntry('/quotes'), true);
  assert.equal(getAuthFlowState().screen, 'demo');
});

test('the real Android entry effect retains its existing modal-first handoff', () => {
  assert.deepEqual(renderEntry('android'), [{ path: '/(tabs)/quotes', screenAtReplace: 'demo' }]);
  assert.equal(completeDeferredAuthEntry('/quotes'), false);
  assert.equal(getAuthFlowState().screen, 'demo');
});

test('a retained, blurred iOS entry cannot queue or reopen authentication', () => {
  assert.deepEqual(renderEntry('ios', false), []);
  assert.equal(completeDeferredAuthEntry('/quotes'), false);
  assert.equal(getAuthFlowState().screen, 'guest');
});
