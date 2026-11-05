import assert from 'node:assert/strict';
import test from 'node:test';
import { BrokerAPI } from '../api/brokerApi';
import { acceptTradingHydration, assertTradingSession } from './tradingAccess';
import { activateBrokerSession, beginActiveBrokerSessionTransition, __resetActiveBrokerSessionForTests } from '../state/activeBrokerSession';
import { useTradingState } from '../state/tradingState';
import { beginAuthSubmission, completeAuthenticatedLogin, dismissAuthFlow, getAuthFlowState, openAuthFlow, setAuthProgress } from '../features/trade/authFlowState';
import { setPublicBrokerContext } from '../state/publicBrokerContext';
import { publicBrokerFixture } from '../testFixtures/publicBroker';
import { registerExecutionQuoteReader } from '../market/executionQuoteSource';
const activate = (investor = false) => activateBrokerSession(beginActiveBrokerSessionTransition(), { brokerId: 'Nexa', accountLogin: '10001', apiBase: 'https://services.example.com/api/v2', feedWsBase: 'wss://services.example.com/ws/feed', feedStatusUrl: 'https://services.example.com/ws/feed/status', servicesDomain: 'services.example.com', configVersion: 'test', investor }, { accessToken: 'jwt', refreshToken: '', expiresAt: '2099-01-01T00:00:00.000Z' });
const instrument = { symbol: 'EURUSD.pro', trade_mode: 4, volume_min: .01, volume_max: 10, volume_step: .01 };
const body = { account_login: 10001, symbol: 'EURUSD.pro', side: 'buy', volume: '.02' };

test('enabled BTCUSD submits directly and preserves broker rejections and local symbol restrictions', async t => {
  __resetActiveBrokerSessionForTests();
  const capture = activate(); const api = new BrokerAPI(); const original = fetch;
  const btc = { symbol: 'BTCUSD', enabled: true, min_volume: .01, max_volume: 100, volume_step: .01 };
  const order = { ...body, symbol: btc.symbol, volume: '.05' };
  const paths: string[] = [];
  let rejection: string | null = null;
  const release = registerExecutionQuoteReader((namespace, symbol) => {
    assert.equal(namespace, capture.session.cacheNamespace); assert.equal(symbol, btc.symbol);
    return { bid: 82866.18, ask: 82921.1, lastReceivedAt: Date.now(), transport: 'websocket', tradable: true, stale: false };
  });
  t.after(() => { release(); globalThis.fetch = original; api.dispose(); __resetActiveBrokerSessionForTests(); });
  globalThis.fetch = (async (url, init) => {
    const path = new URL(String(url)).pathname; paths.push(path);
    assert.equal(path, '/api/v2/orders');
    assert.deepEqual(JSON.parse(String(init?.body)), order);
    return rejection
      ? new Response(JSON.stringify({ error: rejection }), { status: 400 })
      : new Response(JSON.stringify({ ticket: 123, price: 82921.1 }));
  }) as typeof fetch;
  const hydrate = (catalog: unknown) => acceptTradingHydration(capture.session.cacheNamespace, {}, { login: 10001, status: 'active' }, catalog);
  assert.equal(hydrate([btc]), true);
  const request = () => api.request('/orders', { method: 'POST', body: JSON.stringify(order) });
  const submission = request();
  assert.deepEqual(paths, ['/api/v2/orders'], 'POST starts in the initiating call with no preview request');
  await submission;
  for (const error of ['MARKET_CLOSED', 'NOT_ENOUGH_MONEY']) {
    paths.length = 0; rejection = error;
    const response = await request();
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error });
    assert.deepEqual(paths, ['/api/v2/orders']);
  }
  for (const restricted of [{ ...btc, trade_mode: 0 }, { ...btc, trade_mode: 3 }, { ...btc, trade_mode: 2 }, { ...btc, enabled: false }]) {
    paths.length = 0; hydrate([restricted]);
    await assert.rejects(request());
    assert.deepEqual(paths, [], 'restricted instruments must block before order transport');
  }
});

test('fresh chart snapshots pass risk checks when the batched quote store is empty or stale', async t => {
  __resetActiveBrokerSessionForTests();
  const capture = activate(); const api = new BrokerAPI(); const original = fetch;
  const namespace = capture.session.cacheNamespace;
  let orders = 0;
  let liveQuote = { bid: 1, ask: 1.1, lastReceivedAt: Date.now(), transport: 'websocket' as const, tradable: true, stale: false };
  const release = registerExecutionQuoteReader((owner, symbol) => {
    assert.equal(owner, namespace); assert.equal(symbol, body.symbol);
    return liveQuote;
  });
  t.after(() => { release(); globalThis.fetch = original; api.dispose(); __resetActiveBrokerSessionForTests(); });
  globalThis.fetch = (async url => {
    const path = String(url); if (path.endsWith('/orders')) orders++;
    return new Response(JSON.stringify(path.includes('/market/status/') ? { trade_open: true }
      : path.includes('/calculate/margin') ? { required_margin: 1, free_margin: 100, max_lots: 2 } : {}));
  }) as typeof fetch;
  acceptTradingHydration(namespace, {}, { login: 10001 }, [instrument]);
  const request = () => api.request('/orders', { method: 'POST', body: JSON.stringify(body) });
  useTradingState.setState({ quotes: {} });
  await request(); assert.equal(orders, 1);
  useTradingState.getState().setQuote(body.symbol, { ...liveQuote, stale: true });
  await request(); assert.equal(orders, 2);
  useTradingState.getState().setQuote(body.symbol, liveQuote);
  liveQuote = { ...liveQuote, stale: true };
  await assert.rejects(request(), /fresh executable/);
  assert.equal(orders, 2, 'a fresh-looking store cannot override invalidated live data');
});

test('unavailable live snapshots and quotes invalidated during credential refresh never send an order', async t => {
  __resetActiveBrokerSessionForTests();
  const capture = activate(); const api = new BrokerAPI(); const original = fetch;
  const fresh = { bid: 1, ask: 1.1, lastReceivedAt: Date.now(), transport: 'websocket' as const, tradable: true, stale: false };
  let liveQuote: typeof fresh | undefined;
  let orders = 0; let invalidateDuringRefresh = false;
  const testApi = api as any;
  const readToken = testApi.getValidAccessTokenForCapture.bind(api);
  testApi.getValidAccessTokenForCapture = async (...args: unknown[]) => {
    const lease = await readToken(...args);
    if (invalidateDuringRefresh) liveQuote = { ...fresh, tradable: false };
    return lease;
  };
  const release = registerExecutionQuoteReader(() => liveQuote);
  t.after(() => { release(); globalThis.fetch = original; api.dispose(); __resetActiveBrokerSessionForTests(); });
  globalThis.fetch = (async url => {
    const path = String(url); if (path.endsWith('/orders')) orders++;
    return new Response(JSON.stringify(path.includes('/market/status/') ? { trade_open: true }
      : { required_margin: 1, free_margin: 100, max_lots: 2 }));
  }) as typeof fetch;
  acceptTradingHydration(capture.session.cacheNamespace, {}, { login: 10001 }, [instrument]);
  useTradingState.getState().setQuote(body.symbol, fresh);
  const request = () => api.request('/orders', { method: 'POST', body: JSON.stringify(body) });
  await assert.rejects(request(), /fresh executable/);
  liveQuote = { ...fresh, tradable: false };
  await assert.rejects(request(), /fresh executable/);
  liveQuote = fresh; invalidateDuringRefresh = true;
  await assert.rejects(request(), /fresh executable/);
  assert.equal(orders, 0);
});

test('fast dashboard login cannot send an order while hydration is pending or failed', async t => {
  __resetActiveBrokerSessionForTests();
  setPublicBrokerContext(publicBrokerFixture('Nexa'));
  const capture = activate(); const api = new BrokerAPI(); const original = fetch;
  let requests = 0;
  globalThis.fetch = (async () => { requests++; return new Response('{}'); }) as typeof fetch;
  t.after(() => { globalThis.fetch = original; api.dispose(); dismissAuthFlow(); setPublicBrokerContext(null); __resetActiveBrokerSessionForTests(); });
  openAuthFlow(undefined, 'login');
  const submission = beginAuthSubmission()!;
  setAuthProgress(submission.state.attempt, 'hydrating');
  assert.equal(completeAuthenticatedLogin(submission.state.attempt), true);
  assert.equal(getAuthFlowState().screen, 'ready');
  const send = () => api.request('/orders', { method: 'POST', body: JSON.stringify(body) });
  await assert.rejects(send(), /still loading/);
  assert.equal(acceptTradingHydration(capture.session.cacheNamespace, {}, null, [instrument]), false);
  await assert.rejects(send(), /still loading/);
  assert.equal(requests, 0);
  const replacement = activate();
  assert.equal(acceptTradingHydration(capture.session.cacheNamespace, {}, { login: 10001 }, [instrument]), false);
  assert.throws(() => assertTradingSession(replacement.session.cacheNamespace), /still loading/);
});

test('hydrated investor permissions restrict a master-looking response before a draft or mutation', t => {
  const capture = activate(); t.after(__resetActiveBrokerSessionForTests);
  assert.equal(acceptTradingHydration(capture.session.cacheNamespace, { investor: true }, { login: 10001 }, [instrument]), true);
  assert.throws(() => assertTradingSession(capture.session.cacheNamespace), /read-only/);
});
test('order transport stays at zero through authentication/hydration and until an explicitly invoked valid order', async t => {
  __resetActiveBrokerSessionForTests(); const original = fetch; const capture = activate(); const api = new BrokerAPI();
  t.after(() => { globalThis.fetch = original; api.dispose(); __resetActiveBrokerSessionForTests(); });
  let orders = 0;
  globalThis.fetch = (async url => { const path = String(url); if (path.endsWith('/orders')) orders++;
    return new Response(JSON.stringify(path.includes('/market/status/') ? { trade_open: true } : path.includes('/calculate/margin') ? { required_margin: 1, free_margin: 100, max_lots: 2 } : {})); }) as typeof fetch;
  assert.equal(orders, 0);
  await assert.rejects(api.request('/orders', { method: 'POST', body: JSON.stringify(body) }), /loading/); assert.equal(orders, 0);
  assert.equal(acceptTradingHydration(capture.session.cacheNamespace, { broker_id: 'Other' }, { login: 10001 }, [instrument]), false);
  assert.equal(acceptTradingHydration(capture.session.cacheNamespace, { broker_id: 'Nexa' }, { login: 10001 }, [instrument]), true); assert.equal(orders, 0);
  useTradingState.getState().setQuote('EURUSD.pro', { bid: 1, ask: 1.1, lastReceivedAt: Date.now(), transport: 'websocket', tradable: true, stale: false });
  await api.request('/orders', { method: 'POST', body: JSON.stringify(body) }); assert.equal(orders, 1);
});
test('investor, stale quotes, invalid volume and disabled accounts block transport', async t => {
  __resetActiveBrokerSessionForTests(); const original = fetch; const api = new BrokerAPI();
  t.after(() => { globalThis.fetch = original; api.dispose(); __resetActiveBrokerSessionForTests(); });
  let orders = 0;
  globalThis.fetch = (async url => { const path = String(url); if (path.endsWith('/orders')) orders++;
    return new Response('{}'); }) as typeof fetch;
  let capture = activate(true); acceptTradingHydration(capture.session.cacheNamespace, {}, { login: 10001 }, [instrument]);
  await assert.rejects(api.request('/positions/1', { method: 'PUT', body: '{}' }), /read-only/);
  capture = activate(); acceptTradingHydration(capture.session.cacheNamespace, {}, { login: 10001 }, [instrument]);
  const request = () => api.request('/orders', { method: 'POST', body: JSON.stringify(body) });
  useTradingState.getState().setQuote('EURUSD.pro', { bid: 1, ask: 1.1, lastReceivedAt: Date.now(), transport: 'websocket', stale: true, tradable: true }); await assert.rejects(request(), /fresh executable/);
  useTradingState.getState().setQuote('EURUSD.pro', { stale: false, tradable: false }); await assert.rejects(request(), /fresh executable/);
  useTradingState.getState().setQuote('EURUSD.pro', { stale: false, tradable: true });
  await assert.rejects(api.request('/orders', { method: 'POST', body: JSON.stringify({ ...body, volume: '.015' }) }), /Volume/);
  acceptTradingHydration(capture.session.cacheNamespace, {}, { login: 10001, trade_enabled: false }, [instrument]);
  await assert.rejects(request(), /disabled/);
  assert.equal(orders, 0);
});
