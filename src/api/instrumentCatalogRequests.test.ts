import assert from 'node:assert/strict';
import test from 'node:test';
import {
  __resetActiveBrokerSessionForTests,
  activateBrokerSession,
  beginActiveBrokerSessionTransition,
  getActiveBrokerSessionIdentity,
  updateActiveBrokerSessionCredentials,
} from '../state/activeBrokerSession';
import { commitApiJson } from './apiClient';
import { StaleBrokerSessionError } from './brokerApi';
import {
  __resetInstrumentCatalogRequestsForTests,
  fetchInstrumentCatalogResponse,
  fetchInstrumentMeta,
  getCachedInstrumentMeta,
} from './instruments';

const activate = (brokerId = 'broker-a') => activateBrokerSession(
  beginActiveBrokerSessionTransition(),
  {
    brokerId,
    accountLogin: '10001',
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
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

let originalFetch: typeof globalThis.fetch;
test.beforeEach(() => {
  originalFetch = globalThis.fetch;
  __resetActiveBrokerSessionForTests();
  __resetInstrumentCatalogRequestsForTests();
});
test.afterEach(() => { globalThis.fetch = originalFetch; });

test('bootstrap, dashboard catalog and metadata callers share one HTTP request', async () => {
  const capture = activate();
  const namespace = capture.session.cacheNamespace;
  const response = deferred<Response>();
  const requests: string[] = [];
  globalThis.fetch = (async url => {
    requests.push(String(url));
    return response.promise;
  }) as typeof fetch;

  const bootstrap = fetchInstrumentCatalogResponse(namespace);
  const dashboard = fetchInstrumentCatalogResponse(namespace);
  const firstMeta = fetchInstrumentMeta('EURUSD.pro', namespace);
  const secondMeta = fetchInstrumentMeta('XAUUSD', namespace);
  response.resolve(json([{ symbol: 'EURUSD.pro', digits: 5 }, { symbol: 'XAUUSD', digits: 2 }]));
  const [bootstrapResult, dashboardResult, euro, gold] = await Promise.all([
    bootstrap, dashboard, firstMeta, secondMeta,
  ]);

  assert.equal(requests.length, 1);
  assert.ok(requests[0].endsWith('/instruments'));
  assert.equal(bootstrapResult, dashboardResult);
  assert.equal(euro.symbol, 'EURUSD.pro');
  assert.equal(euro.digits, 5);
  assert.equal(gold.digits, 2);
  // The second metadata waiter must reuse the first waiter's normalized
  // catalog instead of replacing all the cached objects with another pass.
  assert.equal(euro, getCachedInstrumentMeta('EURUSD.pro', namespace));
  assert.equal(gold, getCachedInstrumentMeta('XAUUSD', namespace));
});

test('completed catalog reads do not suppress a later authoritative refresh', async () => {
  const namespace = activate().session.cacheNamespace;
  let requests = 0;
  globalThis.fetch = (async () => json([{ symbol: `SYMBOL-${++requests}` }])) as typeof fetch;
  const first = await fetchInstrumentCatalogResponse(namespace);
  const second = await fetchInstrumentCatalogResponse(namespace);
  assert.equal(requests, 2);
  assert.notDeepEqual(first.data, second.data);
});

test('catalog failure is shared but released so a manual retry can recover', async () => {
  const namespace = activate().session.cacheNamespace;
  let requests = 0;
  globalThis.fetch = (async () => ++requests === 1 ? json({}, 503) : json([{ symbol: 'EURUSD' }])) as typeof fetch;
  await Promise.all([
    assert.rejects(fetchInstrumentCatalogResponse(namespace), /instrument catalog/),
    assert.rejects(fetchInstrumentCatalogResponse(namespace), /instrument catalog/),
  ]);
  const recovered = await fetchInstrumentCatalogResponse(namespace);
  assert.deepEqual(recovered.data, [{ symbol: 'EURUSD' }]);
  assert.equal(requests, 2);
});

test('switching broker rejects old catalog consumers and does not contaminate the new catalog', async () => {
  const old = activate();
  const started = deferred<void>();
  const response = deferred<Response>();
  const urls: string[] = [];
  globalThis.fetch = (async url => {
    urls.push(String(url));
    if (String(url).includes('broker-a')) { started.resolve(); return response.promise; }
    return json([{ symbol: 'NEW', digits: 2 }]);
  }) as typeof fetch;
  const stale = assert.rejects(fetchInstrumentMeta('OLD', old.session.cacheNamespace), StaleBrokerSessionError);
  await started.promise;
  const current = activate('broker-b');
  const fresh = await fetchInstrumentMeta('NEW', current.session.cacheNamespace);
  response.resolve(json([{ symbol: 'OLD', digits: 5 }]));
  await stale;
  assert.equal(fresh.symbol, 'NEW');
  assert.equal(urls.length, 2);
  assert.equal(getCachedInstrumentMeta('OLD', old.session.cacheNamespace), undefined);
  assert.equal(getCachedInstrumentMeta('OLD', current.session.cacheNamespace), undefined);
  await assert.rejects(fetchInstrumentCatalogResponse(old.session.cacheNamespace), StaleBrokerSessionError);
  assert.equal(urls.length, 2, 'an old namespace cannot start a request with current credentials');
});

test('rotated credentials never join the catalog request issued with the old token', async () => {
  const capture = activate();
  const namespace = capture.session.cacheNamespace;
  const started = deferred<void>();
  const response = deferred<Response>();
  const authorizations: Array<string | null> = [];
  globalThis.fetch = (async (_url, options) => {
    const authorization = new Headers(options?.headers).get('Authorization');
    authorizations.push(authorization);
    if (authorization === 'Bearer access-broker-a') { started.resolve(); return response.promise; }
    return json([{ symbol: 'CURRENT' }]);
  }) as typeof fetch;
  const stale = assert.rejects(fetchInstrumentCatalogResponse(namespace), StaleBrokerSessionError);
  await started.promise;
  updateActiveBrokerSessionCredentials(getActiveBrokerSessionIdentity(capture.session), {
    ...capture.credentials, accessToken: 'rotated-access',
  });
  const fresh = await fetchInstrumentCatalogResponse(namespace);
  response.resolve(json([{ symbol: 'OLD' }]));
  await stale;
  assert.deepEqual(fresh.data, [{ symbol: 'CURRENT' }]);
  assert.deepEqual(authorizations, ['Bearer access-broker-a', 'Bearer rotated-access']);
});

test('a parsed shared catalog still requires current ownership at its eventual cache commit', async () => {
  const namespace = activate().session.cacheNamespace;
  globalThis.fetch = (async () => json([{ symbol: 'EURUSD' }])) as typeof fetch;
  const response = await fetchInstrumentCatalogResponse(namespace);
  activate('broker-b');
  let wrote = false;
  assert.throws(() => commitApiJson(response, namespace, () => { wrote = true; }), StaleBrokerSessionError);
  assert.equal(wrote, false);
});

test('a cached metadata entry cannot be returned for an account that has been replaced', async () => {
  const namespace = activate().session.cacheNamespace;
  let requests = 0;
  globalThis.fetch = (async () => {
    requests += 1;
    return json([{ symbol: 'EURUSD', digits: 5 }]);
  }) as typeof fetch;
  await fetchInstrumentMeta('EURUSD', namespace);
  activate('broker-b');
  await assert.rejects(fetchInstrumentMeta('EURUSD', namespace), StaleBrokerSessionError);
  assert.equal(requests, 1);
});
