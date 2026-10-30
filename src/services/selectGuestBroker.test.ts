import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as publicContext from '../state/publicBrokerContext';
import { activateBrokerSession, beginActiveBrokerSessionTransition, captureActiveBrokerSession, getActiveBrokerSessionEpoch, __resetActiveBrokerSessionForTests } from '../state/activeBrokerSession';
import { publicBrokerFixture } from '../testFixtures/publicBroker';
import { authenticateGuest, loginRequestBody } from '../api/guestAuthentication';

const compiled = ts.transpileModule(readFileSync(resolve(process.cwd(), 'src/services/selectGuestBroker.ts'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;

function loadSelection(loggedIn = true, directory: (id: string) => Promise<any> = async id => ({ selectableServers: [publicBrokerFixture(id)] })) {
  const writes: string[] = [];
  const preferences = {
    isLoggedIn: loggedIn, brokerId: 'A', quoteSymbols: ['EURUSD'], hasSetInitialSymbols: true,
    accountDetails: loggedIn ? { accountLogin: '10001' } : null,
    setQuoteSymbols: (symbols: string[]) => { writes.push('symbols'); preferences.quoteSymbols = Array.from(symbols); },
    setHasSetInitialSymbols: (value: boolean) => { writes.push('initial'); preferences.hasSetInitialSymbols = value; },
    setBrokerConnection: (id: string) => { writes.push('broker'); preferences.brokerId = id; },
  };
  const modules: Record<string, unknown> = {
    '../api/broker': { getBrokerDirectoryForBroker: directory },
    '../state/publicBrokerContext': publicContext,
    '../state/userPreferences': { useUserPreferences: { getState: () => preferences } },
    '../state/activeBrokerSession': { captureActiveBrokerSession },
  };
  const exports: { selectGuestBroker?: (record: any) => Promise<boolean>; selectGuestBrokerById?: (id: string, current?: () => boolean) => Promise<boolean> } = {};
  runInNewContext(compiled, { exports, require: (id: string) => { assert.ok(id in modules, `unexpected selection dependency: ${id}`); return modules[id]; } });
  return { select: exports.selectGuestBroker!, selectById: exports.selectGuestBrokerById!, preferences, writes };
}

test('selecting and switching public brokers preserves active credentials, epoch, account and private quotes', async t => {
  t.after(() => { publicContext.setPublicBrokerContext(null); __resetActiveBrokerSessionForTests(); });
  const context = publicContext.setPublicBrokerContext(publicBrokerFixture('A'))!;
  activateBrokerSession(beginActiveBrokerSessionTransition(), { ...context.endpoints, accountLogin: '10001' }, { accessToken: 'token-A', refreshToken: 'refresh-A', expiresAt: '' });
  const original = captureActiveBrokerSession(); const epoch = getActiveBrokerSessionEpoch();
  const service = loadSelection();
  const account = service.preferences.accountDetails;
  for (const brokerId of ['B', 'C', 'A']) {
    assert.equal(await service.select(publicBrokerFixture(brokerId)), true);
    assert.equal(publicContext.getPublicBrokerContext()?.brokerId, brokerId);
    assert.equal(captureActiveBrokerSession(), original);
    assert.equal(getActiveBrokerSessionEpoch(), epoch);
    assert.equal(service.preferences.accountDetails, account);
    assert.equal(service.preferences.brokerId, 'A');
    assert.deepEqual(service.preferences.quoteSymbols, ['EURUSD']);
  }
  assert.deepEqual(service.writes, []);
  // Secure activation can precede preference hydration during cold restore.
  const restoring = loadSelection(false);
  await restoring.select(publicBrokerFixture('B'));
  assert.deepEqual(restoring.writes, []);
  assert.equal(captureActiveBrokerSession(), original);
});

test('guest selection persists the broker and initializes guest quotes while invalid configuration preserves selection', async t => {
  t.after(() => publicContext.setPublicBrokerContext(null));
  const service = loadSelection(false);
  await service.select(publicBrokerFixture('B'));
  const context = publicContext.getPublicBrokerContext();
  assert.equal(service.preferences.brokerId, 'B');
  assert.deepEqual(service.preferences.quoteSymbols, []);
  assert.equal(service.preferences.hasSetInitialSymbols, false);
  await assert.rejects(service.select(publicBrokerFixture('Unsafe', { market_api_url: 'http://insecure.example.com' })));
  assert.equal(publicContext.getPublicBrokerContext(), context);
  assert.equal(service.preferences.brokerId, 'B');
});

test('failed authentication on the selected broker leaves the previous account usable', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; publicContext.setPublicBrokerContext(null); __resetActiveBrokerSessionForTests(); });
  const context = publicContext.setPublicBrokerContext(publicBrokerFixture('A'))!;
  activateBrokerSession(beginActiveBrokerSessionTransition(), { ...context.endpoints, accountLogin: '10001' }, { accessToken: 'token-A', refreshToken: 'refresh-A', expiresAt: '' });
  const active = captureActiveBrokerSession();
  await loadSelection().select(publicBrokerFixture('B'));
  globalThis.fetch = (async () => new Response('{"error":"INVALID_CREDENTIALS"}', { status: 401 })) as typeof fetch;
  await assert.rejects(authenticateGuest(publicContext.getPublicBrokerContext()!, 'login', loginRequestBody('20001', 'wrong-password', 'B'), new AbortController().signal));
  assert.equal(captureActiveBrokerSession(), active);
  assert.equal(captureActiveBrokerSession()?.credentials.accessToken, 'token-A');
});

test('out-of-order directory responses and cancelled pickers cannot override the newest selection', async t => {
  t.after(() => publicContext.setPublicBrokerContext(null));
  const pending = new Map<string, (value: any) => void>();
  const service = loadSelection(true, id => new Promise(resolve => pending.set(id, resolve)));
  const first = service.selectById('B'); const second = service.selectById('C');
  pending.get('C')!({ selectableServers: [publicBrokerFixture('C')] });
  assert.equal(await second, true);
  pending.get('B')!({ selectableServers: [publicBrokerFixture('B')] });
  assert.equal(await first, false);
  assert.equal(publicContext.getPublicBrokerContext()?.brokerId, 'C');
  const cancelled = service.selectById('D', () => false);
  pending.get('D')!({ selectableServers: [publicBrokerFixture('D')] });
  assert.equal(await cancelled, false);
  assert.equal(publicContext.getPublicBrokerContext()?.brokerId, 'C');
  const stale = service.selectById('E');
  await service.select(publicBrokerFixture('F'));
  pending.get('E')!({ selectableServers: [publicBrokerFixture('E')] });
  assert.equal(await stale, false);
  assert.equal(publicContext.getPublicBrokerContext()?.brokerId, 'F');
});

test('public selection aborts old anonymous requests before activating the next broker', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; publicContext.setPublicBrokerContext(null); });
  publicContext.setPublicBrokerContext(publicBrokerFixture('A'));
  let requestSignal: AbortSignal | undefined;
  globalThis.fetch = ((_url, init) => new Promise((_resolve, reject) => {
    requestSignal = init?.signal as AbortSignal;
    requestSignal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
  })) as typeof fetch;
  const oldRequest = publicContext.publicBrokerFetch('/broker/config');
  const rejected = assert.rejects(oldRequest);
  await loadSelection().select(publicBrokerFixture('B'));
  assert.equal(requestSignal?.aborted, true);
  await rejected;
  assert.equal(publicContext.getPublicBrokerContext()?.brokerId, 'B');
});
