import assert from 'node:assert/strict';
import test from 'node:test';
import {
  __resetActiveBrokerSessionForTests,
  activateBrokerSession,
  beginActiveBrokerSessionTransition,
  getActiveBrokerSessionIdentity,
  updateActiveBrokerSessionCredentials,
} from '../state/activeBrokerSession';
import { getAccountSummary, mapAccountSummaryApiResponse } from './account';
import { AccountsApiError, getAccountByIdResult, mapRawAccount } from './accounts';
import { fetchAccountSnapshotResponse } from './accountSnapshotRequests';
import { StaleBrokerSessionError } from './brokerApi';

const activate = (brokerId = 'broker-a', accountLogin = '10001') => activateBrokerSession(
  beginActiveBrokerSessionTransition(),
  {
    brokerId,
    accountLogin,
    apiBase: `https://services.${brokerId}.com/api/v2`,
    feedWsBase: `wss://services.${brokerId}.com/ws/feed`,
    tradeWsBase: `wss://services.${brokerId}.com/ws/v2`,
    feedStatusUrl: `https://services.${brokerId}.com/ws/feed/status`,
    servicesDomain: `services.${brokerId}.com`,
    configVersion: 'cfg-1',
  },
  { accessToken: `access-${brokerId}`, refreshToken: '', expiresAt: '2099-01-01T00:00:00.000Z' },
);
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json' },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

let originalFetch: typeof globalThis.fetch;
test.beforeEach(() => {
  originalFetch = globalThis.fetch;
  __resetActiveBrokerSessionForTests();
});
test.afterEach(() => { globalThis.fetch = originalFetch; });

test('bootstrap, summary and detail share one account read while preserving each mapper and its previous metrics', async () => {
  activate();
  const response = deferred<Response>();
  let requests = 0;
  globalThis.fetch = (async () => { requests += 1; return response.promise; }) as typeof fetch;

  const bootstrap = fetchAccountSnapshotResponse('10001');
  const summary = getAccountSummary('10001', mapAccountSummaryApiResponse({ balance: 1000, equity: 1100 }));
  const detail = getAccountByIdResult(10001, mapRawAccount({ login: 10001, balance: 1000, equity: 1200, leverage: 100, credit: 0 }));
  response.resolve(json({ login: 10001, balance: 1500, group: 'demo\\standard' }));
  const [raw, mappedSummary, mappedDetail] = await Promise.all([bootstrap, summary, detail]);

  assert.equal(requests, 1);
  assert.equal((raw.data as { balance: number }).balance, 1500);
  assert.equal(mappedSummary.balance, 1500);
  assert.equal(mappedDetail.account.balance, 1500);
  assert.equal(mappedSummary.equity, 1100);
  assert.equal(mappedDetail.account.equity, 1200);
  assert.ok(mappedSummary.staleMetrics.includes('equity'));
  assert.ok(mappedDetail.account.staleMetrics.includes('equity'));
  assert.equal(mappedDetail.raw.group, 'demo\\standard');
});

test('a settled read never suppresses a fresh metrics refresh', async () => {
  activate();
  let requests = 0;
  globalThis.fetch = (async () => json({ login: 10001, balance: ++requests })) as typeof fetch;
  assert.equal((await getAccountSummary('10001')).balance, 1);
  assert.equal((await getAccountByIdResult('10001')).account.balance, 2);
  assert.equal(requests, 2);
});

test('different requested logins never share an in-flight snapshot', async () => {
  activate();
  const response = deferred<Response>();
  const urls: string[] = [];
  globalThis.fetch = (async url => { urls.push(String(url)); await response.promise; return json({ balance: 10 }); }) as typeof fetch;
  const first = fetchAccountSnapshotResponse('10001');
  const second = fetchAccountSnapshotResponse('10002');
  response.resolve(json({}));
  await Promise.all([first, second]);
  assert.equal(urls.length, 2);
  assert.ok(urls.some(url => url.endsWith('/account/10001')));
  assert.ok(urls.some(url => url.endsWith('/account/10002')));
});

test('numeric string logins retain their exact digits in the summary request', async () => {
  const login = '9007199254740993123';
  activate('broker-a', login);
  const urls: string[] = [];
  globalThis.fetch = (async url => { urls.push(String(url)); return json({ login, balance: 1000 }); }) as typeof fetch;
  await getAccountSummary(login);
  assert.ok(urls[0].endsWith(`/account/${login}`));
});

test('backend failures keep caller-specific errors and release the shared request for manual refresh', async () => {
  activate();
  let requests = 0;
  globalThis.fetch = (async () => { requests += 1; return json({ message: 'Maintenance' }, 503); }) as typeof fetch;
  const summary = getAccountSummary('10001');
  const details = getAccountByIdResult('10001');
  const result = await Promise.allSettled([summary, details]);
  assert.equal(requests, 1);
  assert.equal(result[0].status, 'rejected');
  assert.equal(result[1].status, 'rejected');
  if (result[0].status === 'rejected') assert.match(result[0].reason.message, /API Error 503: Maintenance/);
  if (result[1].status === 'rejected') {
    assert.ok(result[1].reason instanceof AccountsApiError);
    assert.equal(result[1].reason.statusCode, 503);
  }
  await assert.rejects(getAccountSummary('10001'), /API Error 503/);
  assert.equal(requests, 2);
});

test('network rejection releases the in-flight snapshot without caching failure', async () => {
  activate();
  let requests = 0;
  globalThis.fetch = (async () => {
    requests += 1;
    if (requests === 1) throw new TypeError('offline');
    return json({ login: 10001, balance: 900 });
  }) as typeof fetch;
  await assert.rejects(getAccountSummary('10001'), /offline/);
  assert.equal((await getAccountSummary('10001')).balance, 900);
  assert.equal(requests, 2);
});

test('switching broker while a snapshot is pending rejects old callers and starts a separate read', async () => {
  activate();
  const oldResponse = deferred<Response>();
  const sent = deferred<void>();
  const urls: string[] = [];
  globalThis.fetch = (async url => {
    const path = String(url);
    urls.push(path);
    if (path.includes('broker-a')) { sent.resolve(); return oldResponse.promise; }
    return json({ login: 10001, balance: 2000 });
  }) as typeof fetch;
  const previous = Promise.allSettled([getAccountSummary('10001'), getAccountByIdResult('10001')]);
  await sent.promise;
  activate('broker-b');
  assert.equal((await getAccountSummary('10001')).balance, 2000);
  oldResponse.resolve(json({ login: 10001, balance: 1000 }));
  for (const result of await previous) {
    assert.equal(result.status, 'rejected');
    if (result.status === 'rejected') assert.ok(result.reason instanceof StaleBrokerSessionError);
  }
  assert.equal(urls.length, 2);
});

test('credential rotation isolates pending reads even when broker and login are unchanged', async () => {
  const capture = activate();
  const oldResponse = deferred<Response>();
  const sent = deferred<void>();
  const tokens: (string | null)[] = [];
  globalThis.fetch = (async (_url, options) => {
    const token = new Headers(options?.headers).get('Authorization');
    tokens.push(token);
    if (token === 'Bearer access-broker-a') { sent.resolve(); return oldResponse.promise; }
    return json({ login: 10001, balance: 2000 });
  }) as typeof fetch;
  const previous = Promise.allSettled([fetchAccountSnapshotResponse('10001')]);
  await sent.promise;
  updateActiveBrokerSessionCredentials(getActiveBrokerSessionIdentity(capture.session), {
    ...capture.credentials, accessToken: 'rotated-access',
  });
  assert.equal((await getAccountSummary('10001')).balance, 2000);
  oldResponse.resolve(json({ login: 10001, balance: 1000 }));
  const [result] = await previous;
  assert.equal(result.status, 'rejected');
  if (result.status === 'rejected') assert.ok(result.reason instanceof StaleBrokerSessionError);
  assert.deepEqual(tokens, ['Bearer access-broker-a', 'Bearer rotated-access']);
});
