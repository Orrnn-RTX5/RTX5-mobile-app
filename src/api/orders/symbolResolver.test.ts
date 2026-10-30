import assert from 'node:assert/strict';
import test from 'node:test';
import { __resetActiveBrokerSessionForTests, activateBrokerSession, beginActiveBrokerSessionTransition } from '../../state/activeBrokerSession';
import { StaleBrokerSessionError } from '../brokerApi';
import { __resetInstrumentCatalogRequestsForTests } from '../instruments';
import { resetBrokerSymbolResolverCache, resolveBrokerSymbol, resolveBrokerSymbolFromCache } from './symbolResolver';

const activate = (brokerId = 'broker-a') => activateBrokerSession(beginActiveBrokerSessionTransition(), {
  brokerId, accountLogin: '10001', apiBase: `https://services.${brokerId}.com/api/v2`,
  feedWsBase: `wss://services.${brokerId}.com/ws/feed`, tradeWsBase: `wss://services.${brokerId}.com/ws/v2`,
  feedStatusUrl: `https://services.${brokerId}.com/ws/feed/status`, servicesDomain: `services.${brokerId}.com`, configVersion: 'cfg-1',
}, { accessToken: `access-${brokerId}`, refreshToken: '', expiresAt: '2099-01-01T00:00:00.000Z' });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let originalFetch: typeof fetch;
test.beforeEach(() => {
  originalFetch = globalThis.fetch;
  __resetActiveBrokerSessionForTests();
  __resetInstrumentCatalogRequestsForTests();
  resetBrokerSymbolResolverCache();
});
test.afterEach(() => { globalThis.fetch = originalFetch; });

test('concurrent cold order symbol lookups share one catalog and preserve suffix identity', async () => {
  const namespace = activate().session.cacheNamespace;
  let calls = 0;
  globalThis.fetch = (async () => { calls += 1; return json([{ symbol: 'EURUSD.pro' }, { symbol: 'EURUSDm' }]); }) as typeof fetch;
  assert.deepEqual(await Promise.all([
    resolveBrokerSymbol('eurusd.pro', namespace), resolveBrokerSymbol('eurusdm', namespace), resolveBrokerSymbol('EURUSD', namespace),
  ]), ['EURUSD.pro', 'EURUSDm', 'EURUSD']);
  assert.equal(calls, 1);
  assert.equal(resolveBrokerSymbolFromCache('eurusd.pro', namespace), 'EURUSD.pro');
  assert.equal(resolveBrokerSymbolFromCache('EURUSD', namespace), null);
});

test('catalog failure releases the shared request so a later order can retry discovery', async () => {
  const namespace = activate().session.cacheNamespace;
  let calls = 0;
  globalThis.fetch = (async () => ++calls === 1 ? json({}, 503) : json([{ symbol: 'EURUSD.pro' }])) as typeof fetch;
  assert.equal(await resolveBrokerSymbol('eurusd.pro', namespace), 'eurusd.pro');
  assert.equal(await resolveBrokerSymbol('eurusd.pro', namespace), 'EURUSD.pro');
  assert.equal(calls, 2);
});

test('broker handoff rejects a pending old discovery and cannot warm the new broker cache', async () => {
  const namespace = activate().session.cacheNamespace;
  let release!: () => void;
  let markStarted!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { markStarted = resolve; });
  globalThis.fetch = (async () => { markStarted(); await gate; return json([{ symbol: 'EURUSD.pro' }]); }) as typeof fetch;
  const rejected = assert.rejects(resolveBrokerSymbol('eurusd.pro', namespace), StaleBrokerSessionError);
  await started;
  const currentNamespace = activate('broker-b').session.cacheNamespace;
  release();
  await rejected;
  assert.equal(resolveBrokerSymbolFromCache('eurusd.pro', currentNamespace), null);
  assert.throws(() => resolveBrokerSymbolFromCache('eurusd.pro', namespace), StaleBrokerSessionError);
});

test('a backward device clock expires order symbol discovery instead of extending its TTL', async t => {
  const namespace = activate().session.cacheNamespace;
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  t.after(() => { Date.now = originalNow; });
  let calls = 0;
  globalThis.fetch = (async () => { calls += 1; return json([{ symbol: 'EURUSD.pro' }]); }) as typeof fetch;
  await resolveBrokerSymbol('eurusd.pro', namespace);
  now -= 1;
  assert.equal(resolveBrokerSymbolFromCache('eurusd.pro', namespace), null);
  await resolveBrokerSymbol('eurusd.pro', namespace);
  assert.equal(calls, 2);
});
