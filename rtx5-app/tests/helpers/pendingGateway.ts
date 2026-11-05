import assert from 'node:assert/strict';
import { create } from 'zustand';
import { loadProductionModule } from './productionModule';
import { buildPendingOrderRequestBody, normalizePendingOrderReadType, PendingOrderPayloadError } from '../../src/api/orders/pendingOrderPayload';
import { createTradeIdempotencyKey, createUuidV4 } from '../../src/api/tradeIdempotency';
import { createTradingApiError } from '../../src/api/tradingErrors';
import { assertTradeSide } from '../../src/domain/tradeSide';
import { pendingExpiry } from '../../src/domain/pendingOrders';
import { normalizePositiveSafeIntegerPathSegment } from '../../src/api/positions/modifyPositionWire';
import { buildMarketOrderSymbolCandidates, getAcceptedSymbolCacheKey } from '../../src/api/orders/placeMarketOrderCandidates';
import { createOrderRequestRegistry } from '../../src/api/orders/marketOrderInFlight';

export function makePendingGatewayHarness() {
  const ownerFor = (login: number) => Object.freeze({
    brokerId: 'test-broker', accountLogin: String(login), apiBase: 'https://broker.example.invalid/api/v2',
    cacheNamespace: `test-account-${login}`, sessionEpoch: login, credentialGeneration: 1, credentialIdentity: 'test-lease',
  });
  let owner = ownerFor(200019);
  const isCurrent = (candidate: unknown) => candidate === owner;
  const store = loadProductionModule<typeof import('../../src/state/pendingOrdersState')>('src/state/pendingOrdersState.ts', {
    create, isActiveBrokerSessionOwnerStampCurrent: isCurrent,
  });
  const notifications = loadProductionModule<typeof import('../../src/state/pendingOrderNotifications')>('src/state/pendingOrderNotifications.ts', {
    create, isActiveBrokerSessionOwnerStampCurrent: isCurrent, setTimeout: () => 0,
  });
  const rows = new Map<number, Record<string, any>>();
  const history: Record<string, any>[] = [];
  const calls: { method: string; endpoint: string; body?: Record<string, any>; idempotencyKey?: string }[] = [];
  const ids = new Map<string, string>();
  const symbolMisses = new Set<string>();
  const catalogSymbols = new Map<string, string>();
  let sequence = 1000;
  const failures = { nextWrite: false, nextRead: false };
  let heldRead: { wait: Promise<void>; release: () => void } | null = null;
  const response = (data: unknown, status = 200) => ({ status, ok: status === 200, json: async () => data, headers: new Headers() });
  const apiClient = async (endpoint: string, options: any = {}) => {
    const method = options.method ?? 'GET';
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ method, endpoint, body, idempotencyKey: options.headers?.['Idempotency-Key'] });
    const url = new URL(endpoint, 'https://broker.example.invalid');
    if (method === 'GET' && failures.nextRead) { failures.nextRead = false; throw new Error('Read connection lost'); }
    if (method === 'GET' && url.pathname.startsWith('/orders/pending/')) {
      const login = Number(url.pathname.split('/').at(-1));
      // The supplied Gateway list contract intentionally omits account_login.
      const result = [...rows.values()].filter(row => row.account_login === login && row.status === 'PENDING')
        .map(({ account_login: _login, ...row }) => ({ ...row }));
      const hold = heldRead; heldRead = null;
      if (hold) await hold.wait;
      return response(result);
    }
    if (method === 'GET' && url.pathname.startsWith('/orders/history/')) {
      const login = Number(url.pathname.split('/').at(-1));
      return response(history.filter(row => row.account_login === login));
    }
    if (failures.nextWrite) { failures.nextWrite = false; throw new Error('Network connection lost after send'); }
    assert.match(body?.client_order_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    const serializedBody = JSON.stringify(body);
    const previousBody = ids.get(body.client_order_id);
    if (previousBody && previousBody !== serializedBody) {
      return response({ error: 'IDEMPOTENCY_CONFLICT', message: 'Request ID already used for a different body.' }, 409);
    }
    assert.equal(previousBody, undefined, 'every new mutation gets a fresh UUID');
    ids.set(body.client_order_id, serializedBody);
    assert.equal(body.account_login, Number(owner.accountLogin));
    if (method === 'POST') {
      assert.equal(url.pathname, '/orders/pending');
      assert.ok(['BUY', 'SELL'].includes(body.side));
      if (symbolMisses.has(body.symbol)) {
        return response({ error: 'SYMBOL_NOT_FOUND', message: 'Symbol not found.' }, 400);
      }
      const ticket = ++sequence;
      const row = { ...body, id: String(ticket), ticket, price_limit: body.price_limit ?? 0, sl: body.sl ?? 0, tp: body.tp ?? 0,
        status: 'PENDING', created_at: new Date().toISOString() };
      rows.set(ticket, row);
      return response({ ...row });
    }
    const ticket = Number(url.pathname.split('/').at(-1));
    const row = rows.get(ticket);
    assert.ok(row, 'mutation targets an existing broker ticket');
    if (method === 'PUT') {
      const allowed = new Set(['client_order_id', 'account_login', 'price', 'price_limit', 'sl', 'tp', 'time_in_force', 'expiry']);
      for (const key of Object.keys(body)) assert.ok(allowed.has(key), `unknown modify key ${key}`);
      assert.notEqual(body.sl, 0); assert.notEqual(body.tp, 0);
      Object.assign(row, body);
      return response({ ticket, status: 'modified' });
    }
    assert.equal(method, 'DELETE');
    assert.equal(url.searchParams.get('account_login'), owner.accountLogin);
    assert.deepEqual(Object.keys(body).sort(), ['account_login', 'client_order_id']);
    rows.delete(ticket);
    history.push({ ...row, status: 'CANCELLED', cancelled_at: new Date().toISOString() });
    return response({ ticket, status: 'CANCELLED' });
  };
  class StaleBrokerSessionError extends Error { constructor() { super('Stale broker session'); } }
  const common = {
    captureActiveBrokerSessionOwnerStamp: () => owner, isActiveBrokerSessionOwnerStampCurrent: isCurrent,
    StaleBrokerSessionError, apiClient, assertActivePendingProtectionAllowed: () => {},
    createTradeIdempotencyKey, createUuidV4, createTradingApiError, normalizePositiveSafeIntegerPathSegment,
    normalizePendingOrderReadType, pendingExpiry, ...store,
  };
  const mutations = loadProductionModule<typeof import('../../src/api/orders/pendingOrders')>('src/api/orders/pendingOrders.ts', common);
  const placement = loadProductionModule<typeof import('../../src/api/orders/placePendingOrder')>('src/api/orders/placePendingOrder.ts', {
    ...common, ...mutations, createOrderRequestRegistry, PENDING_ORDER_PLACEMENT_AVAILABLE: true, PENDING_ORDER_PREVIEW_MESSAGE: '',
    assertTradeSide, PendingOrderPayloadError, buildPendingOrderRequestBody, buildMarketOrderSymbolCandidates,
    getAcceptedSymbolCacheKey, resolveBrokerSymbolFromCache: () => null,
    resolveBrokerSymbol: async (symbol: string) => catalogSymbols.get(symbol) ?? null,
    getApiLatencyNow: () => Date.now(), recordApiLatency: () => {}, redactDiagnosticValue: (value: unknown) => value,
  });
  const historyApi = loadProductionModule<typeof import('../../src/api/orders/orderHistory')>('src/api/orders/orderHistory.ts', {
    apiClient, createTradingApiError, normalizeTradeSide: (value: unknown) => String(value).toLowerCase() === 'sell' ? 'sell' : 'buy',
  });
  return {
    ...mutations, ...placement, ...store, ...notifications, historyApi, rows, history, calls, failures, symbolMisses, catalogSymbols,
    get owner() { return owner; }, isCurrent,
    switchAccount(login: number) { owner = ownerFor(login); return owner; },
    holdNextList() {
      let release = () => {};
      const wait = new Promise<void>(resolve => { release = resolve; });
      heldRead = { wait, release };
      return release;
    },
  };
}
