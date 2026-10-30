import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import * as publicContext from '../../state/publicBrokerContext';
import { publicBrokerFixture } from '../../testFixtures/publicBroker';
import ts from 'typescript';
import { demoRegistrationBody } from '../../api/guestAuthentication';

const host = readFileSync(resolve(process.cwd(), 'src/features/auth/GuestFlowHost.tsx'), 'utf8');
const directoryEffect = host.match(/useEffect\(\(\) => \{(\s+if \(!directory.data\)[\s\S]*?)\}, \[directory.data, brokerId, context, isLoggedIn, brokerPickerVisible\]\);/)![1];
const closeBody = host.match(/const close = \(\) => \{([\s\S]*?)\n  \};\s+const submit/)![1];

test('the host submits the latest investor password independently of Master Password', async () => {
  const body = host.match(/const submit = async \(\) => \{([\s\S]*?)\n  \};\s+const changeBroker/)![1];
  const compiled = ts.transpileModule(`exports.submit = async () => {${body}};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports: { submit?: () => Promise<void> } = {};
  const context = { brokerId: 'B' };
  const operation = { state: { attempt: 1, context, form: 'demo' }, signal: new AbortController().signal };
  const requests: unknown[] = [];
  const submitting = { current: null };
  runInNewContext(compiled, {
    exports, __DEV__: false, submitting, retryAt: 0, ambiguous: false, rateForm: 'demo', demoAllowed: true,
    getAuthFlowState: () => ({ context, form: 'demo', screen: 'demo' }),
    demoBrokerOptions: [{ brokerId: 'B', server: {} }],
    nameValue: { current: ' Trader ' }, identityValue: { current: ' trader@example.com ' },
    investorPasswordValue: { current: ' Investor456! ' }, passwordValue: { current: ' Master123! ' }, confirmationValue: { current: ' Master123! ' },
    rememberValue: { current: true }, demoRegistrationBody, beginAuthSubmission: () => operation,
    setLocalError: () => {}, Keyboard: { dismiss() {} }, authorization: { current: null }, authorizeBrokerSessionCommit: () => null,
    authenticateGuest: async (_context: unknown, action: string, request: unknown) => { assert.equal(action, 'register'); requests.push(request); return {}; },
    isAuthAttemptCurrent: () => false,
  });
  await exports.submit!();
  assert.deepEqual(requests, [{ name: 'Trader', email: 'trader@example.com', username: 'trader@example.com', investor_pass: ' Investor456! ', password: ' Master123! ', broker_id: 'B' }]);
  assert.equal(submitting.current, null);
});

test('directory refresh preserves a pending different broker and never logs out the active account', t => {
  t.after(() => publicContext.setPublicBrokerContext(null));
  const active = { session: { ...publicContext.createPublicBrokerContext(publicBrokerFixture('A')).endpoints, cacheNamespace: 'private-A' } };
  const selected = publicContext.setPublicBrokerContext(publicBrokerFixture('B'));
  const run = (servers: any[]) => runInNewContext(`(() => {${directoryEffect}})()`, {
    directory: { data: { selectableServers: servers } }, brokerId: 'A', context: publicContext.getPublicBrokerContext(), isLoggedIn: true, brokerPickerVisible: false,
    captureActiveBrokerSession: () => active, ...publicContext,
    startupBrokerSelectionAttempted: { current: true },
    logoutBrokerSession: () => assert.fail('directory refresh must not sign out a private session'),
    setLocalError: () => {},
  });
  run([publicBrokerFixture('A'), publicBrokerFixture('B')]);
  assert.equal(publicContext.getPublicBrokerContext(), selected);
  run([publicBrokerFixture('A'), publicBrokerFixture('B', { config_version: 'test-2' })]);
  assert.equal(publicContext.getPublicBrokerContext()?.brokerId, 'B');
  assert.equal(publicContext.getPublicBrokerContext()?.configVersion, 'test-2');
  run([]);
  assert.equal(publicContext.getPublicBrokerContext(), null);
  assert.equal(active.session.cacheNamespace, 'private-A');
});

test('cancelling a broker form preserves prior/newer accounts but rolls back its own incomplete commit', () => {
  for (const [owned, active, expected] of [[null, 'private-A', 0], ['private-B', 'private-A', 0], ['private-B', 'private-C', 0], ['private-B', 'private-B', 1]] as const) {
    const committedNamespace = { current: owned as string | null };
    let logouts = 0; let cancelled = false;
    const cleared: string[] = [];
    runInNewContext(`(() => {${closeBody}})()`, {
      committedNamespace,
      // Real dismiss subscriptions clear this ref synchronously. Ownership
      // must therefore be captured before dismissal.
      dismissAuthFlow: () => { committedNamespace.current = null; },
      setPassword: (value: string) => { assert.equal(value, ''); cleared.push('master'); },
      setConfirmation: (value: string) => { assert.equal(value, ''); cleared.push('confirmation'); },
      setInvestorPassword: (value: string) => { assert.equal(value, ''); cleared.push('investor'); }, authorization: { current: 'attempt' },
      cancelBrokerSessionCommitAuthorization: () => { cancelled = true; },
      captureActiveBrokerSession: () => ({ session: { cacheNamespace: active } }),
      logoutBrokerSession: () => { logouts++; },
    });
    assert.equal(logouts, expected);
    assert.equal(cancelled, true);
    assert.deepEqual(cleared, ['master', 'confirmation', 'investor']);
    assert.equal(committedNamespace.current, null);
  }
});
