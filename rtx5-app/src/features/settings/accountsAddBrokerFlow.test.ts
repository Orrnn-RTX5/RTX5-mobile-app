import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as publicContext from '../../state/publicBrokerContext';
import { activateBrokerSession, beginActiveBrokerSessionTransition, captureActiveBrokerSession, getActiveBrokerSessionEpoch, __resetActiveBrokerSessionForTests } from '../../state/activeBrokerSession';
import { beginAuthSubmission, dismissAuthFlow, getAuthFlowState, openAuthFlow, retainAuthEntryHandoff, setAuthProgress, showAuthForm } from '../trade/authFlowState';
import { authenticateGuest, loginRequestBody } from '../../api/guestAuthentication';
import { publicBrokerFixture } from '../../testFixtures/publicBroker';
import { toBrokerDetailLaunchSelection } from './brokerDetailLaunchController';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

// Execute the actual event handlers rather than a parallel navigation model.
function handler(path: string, name: string, scope: Record<string, unknown>) {
  const source = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) {
      expression = node.initializer;
      if (expression && ts.isCallExpression(expression)) expression = expression.arguments[0];
    }
    ts.forEachChild(node, visit);
  };
  visit(source); assert.ok(expression, `missing handler ${name}`);
  const compiled = ts.transpileModule(`exports.handler = ${expression.getText(source)};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports: { handler?: (...args: any[]) => void } = {};
  runInNewContext(compiled, { exports, ...scope });
  return exports.handler!;
}

function setup() {
  const originalContext = publicContext.setPublicBrokerContext(publicBrokerFixture('A'))!;
  activateBrokerSession(beginActiveBrokerSessionTransition(), { ...originalContext.endpoints, accountLogin: '10001' }, { accessToken: 'token-A', refreshToken: 'refresh-A', expiresAt: '' });
  const active = captureActiveBrokerSession(); const epoch = getActiveBrokerSessionEpoch();
  const preferences = { isLoggedIn: true, brokerId: 'A', accountLogin: '10001', quoteSymbols: ['EURUSD'] };
  const records = [publicBrokerFixture('B'), publicBrokerFixture('C')];
  const compiledService = ts.transpileModule(read('src/services/selectGuestBroker.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const modules: Record<string, unknown> = {
    '../api/broker': { getBrokerDirectoryForBroker: async () => ({ selectableServers: records }) },
    '../state/publicBrokerContext': publicContext,
    '../state/activeBrokerSession': { captureActiveBrokerSession },
    '../state/userPreferences': { useUserPreferences: { getState: () => preferences } },
  };
  const service: Record<string, any> = {};
  runInNewContext(compiledService, { exports: service, require: (id: string) => { assert.ok(id in modules, `unexpected broker selection dependency: ${id}`); return modules[id]; } });
  const calls: string[] = []; const pendingPushes: (() => void)[] = [];
  let snapshot = { visible: false, revision: 0 };
  let health: { onAvailable: () => void; onUnavailable: () => void } | undefined;
  const routeMountedRef = { current: true }; const focusedRef = { current: true };
  const scope: Record<string, any> = {
    ...service, ...publicContext, openAuthFlow,
    router: { push: (path: string) => { calls.push(`push:${path}`); }, replace: (path: string) => { calls.push(`replace:${path}`); } },
    selectedBrokerHealthGate: { run: (request: typeof health) => { health = request; return Promise.resolve(); } },
    brokersLaunchController: { getSnapshot: () => snapshot, hide: () => { snapshot = { visible: false, revision: snapshot.revision + 1 }; } },
    showBrokersLaunch: () => { snapshot = { visible: true, revision: snapshot.revision + 1 }; return snapshot.revision; },
    hideBrokersLaunch: () => { snapshot = { visible: false, revision: snapshot.revision + 1 }; },
    scheduleBrokersLaunchNavigation: (revision: number, callback: () => void) => {
      pendingPushes.push(() => {
        if (snapshot.visible && snapshot.revision === revision) callback();
      });
    },
    hideSidebarDestination: () => { calls.push('hide:accounts'); },
    pathnameRef: { current: '/settings/accounts' }, routeMountedRef, brokerPickerFocusedRef: focusedRef,
    brokerDirectory: { selectableServers: records }, onSelectBroker: undefined,
    shouldIgnoreBrokerRowPress: () => false, cancelBrokerRowPressForScroll: () => {}, toBrokerDetailLaunchSelection,
    SELECTED_BROKER_UNAVAILABLE_MESSAGE: 'Broker unavailable', Alert: { alert: () => { calls.push('alert'); } },
  };
  scope.routerInstance = scope.router;
  scope.openBrokerDetail = handler('src/features/settings/BrokersScreen/BrokersScreen.tsx', 'openBrokerDetail', scope);
  const plus = handler('src/features/settings/AccountsScreen.tsx', 'handleConnectAccount', scope);
  const pickers = {
    retained: handler('src/features/settings/BrokersLaunchHost.tsx', 'selectBroker', scope),
    fallback: handler('app/settings/brokers.tsx', 'handleSelectBroker', scope),
    directory: handler('src/features/settings/BrokersScreen/BrokersScreen.tsx', 'handleBrokerRowPress', scope),
  };
  const broker = (id = 'B') => ({ brokerId: id, name: id, server: `${id} Server`, serverUrl: 'https://services.example.com', logoUrl: '', domain: 'services.example.com', selectable: true });
  const assertSession = () => {
    assert.equal(captureActiveBrokerSession(), active);
    assert.equal(getActiveBrokerSessionEpoch(), epoch);
    assert.deepEqual(preferences, { isLoggedIn: true, brokerId: 'A', accountLogin: '10001', quoteSymbols: ['EURUSD'] });
    assert.equal(calls.some(call => call.startsWith('replace:')), false);
  };
  return { plus, pickers, broker, assertSession, calls, pendingPushes, health: () => health!, scope, routeMountedRef, focusedRef };
}

test.afterEach(() => { dismissAuthFlow(); publicContext.setPublicBrokerContext(null); __resetActiveBrokerSessionForTests(); });

for (const picker of ['retained', 'fallback', 'directory'] as const) {
  test(`signed-in Accounts plus -> ${picker} broker picker opens the account form without redirecting or logging out`, async t => {
    const flow = setup();
    flow.plus();
    assert.equal(flow.pendingPushes.length, 1);
    flow.pickers[picker](flow.broker(), {});
    flow.assertSession();
    flow.health().onAvailable();
    // Flush the real async selection and its route/host callbacks.
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(getAuthFlowState().screen, 'choice');
    assert.equal(getAuthFlowState().context?.brokerId, 'B');
    flow.assertSession();
    // A fast tap can open the form before the scheduled Brokers push.
    // Only the retained shell can be tapped before this push; other entries
    // already have a mounted Brokers route (which owns its cover removal).
    if (picker === 'retained') {
      flow.pendingPushes[0]();
      assert.ok(flow.calls.includes('push:/settings/brokers'));
    }
    assert.equal(retainAuthEntryHandoff('/settings/brokers'), true);
    flow.assertSession();

    const originalFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = originalFetch; });
    globalThis.fetch = (async () => new Response('{"error":"INVALID_CREDENTIALS"}', { status: 401 })) as typeof fetch;
    showAuthForm('login'); const submission = beginAuthSubmission()!;
    await assert.rejects(authenticateGuest(submission.state.context!, 'login', loginRequestBody('20001', 'wrong-password', 'B'), submission.signal));
    setAuthProgress(submission.state.attempt, 'recoverable-error', 'Rejected');
    flow.assertSession();

    const close = handler('src/features/auth/GuestFlowHost.tsx', 'close', {
      dismissAuthFlow, committedNamespace: { current: null }, authorization: { current: null },
      setPassword: () => {}, setConfirmation: () => {}, setInvestorPassword: () => {}, cancelBrokerSessionCommitAuthorization: () => {},
      captureActiveBrokerSession, logoutBrokerSession: () => assert.fail('Back must preserve the previously active account'),
    });
    close();
    assert.equal(getAuthFlowState().screen, 'guest');
    assert.equal(submission.signal.aborted, true);
    flow.assertSession();
  });
}

test('unavailable brokers and callbacks after leaving the picker cannot open login or replace the session', async () => {
  for (const picker of ['retained', 'fallback', 'directory'] as const) {
    const flow = setup(); flow.plus();
    flow.pickers[picker](flow.broker(), {});
    flow.health().onUnavailable();
    assert.ok(flow.calls.includes('alert'));
    assert.equal(getAuthFlowState().screen, 'guest');
    flow.scope.brokersLaunchController.hide();
    flow.routeMountedRef.current = false; flow.focusedRef.current = false;
    flow.health().onAvailable();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(getAuthFlowState().screen, 'guest');
    flow.assertSession();
  }
});
