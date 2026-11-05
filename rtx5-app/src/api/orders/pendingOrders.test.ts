import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  PENDING_ORDER_MUTATION_TIMEOUT_MS,
  PENDING_ORDER_RETRY_DELAYS_MS,
  buildModifyPendingOrderRequestBody,
  cancelPendingOrder,
  modifyPendingOrder,
  normalizePendingOrderDto,
  parseCancelPendingOrderResponse,
  parseModifyPendingOrderResponse,
} from './pendingOrders.ts';
import { pendingOrderEventKind } from '../ws/pendingOrderEvents.ts';
import {
  __resetActiveBrokerSessionForTests,
  activateBrokerSession,
  beginActiveBrokerSessionTransition,
} from '../../state/activeBrokerSession.ts';
import { acceptTradingHydration } from '../../services/tradingAccess.ts';

const baseDto = {
  ticket: 700123,
  account_login: 200074,
  symbol: 'eurusd',
  type: 'buy_limit',
  status: 'pending',
  time_setup: 1_784_800_000,
  volume_exact: '0.10000000',
  price_exact: '1.08000000',
};

test('pending-list normalization has deterministic decimal and exact-field precedence', () => {
  const normalized = normalizePendingOrderDto({
    ...baseDto,
    price_decimal: '1.08500',
    sl_decimal: '1.07000000',
    sl_exact: '1.0705',
    price_sl_exact: '1.071',
    sl: 1.072,
    price_sl: 1.073,
    tp_decimal: null,
    price_tp_exact: '1.09000000',
    tp: 1.091,
    price_tp: 1.092,
    time_expiry: 1_800_000_000,
    expiry: 1_800_000_001,
    expiration: 1_800_000_002,
  });

  assert.deepEqual(normalized, {
    ticket: 700123,
    accountLogin: 200074,
    symbol: 'EURUSD',
    type: 'buy_limit',
    status: 'pending',
    timeSetup: 1_784_800_000,
    volume: '0.1',
    price: '1.085',
    priceLimit: null,
    sl: '1.07',
    tp: null,
    expiry: 1_800_000_000,
    timeDone: null,
    comment: null,
    stateVersion: null,
    triggerPhase: null,
    timeInForce: 'GTC',
  });
});

test('v3 pending list rows expose state_version, price_limit, trigger_phase and stop-limit types', () => {
  const row = normalizePendingOrderDto({
    ticket: 3003,
    account_login: 200074,
    symbol: 'EURUSD',
    type: 'buy_limit',
    volume: 0.01,
    price: 1.13,
    price_limit: null,
    status: 'pending',
    time_setup: 1790241800,
    time_expiry: 1790328000,
    state_version: '1',
    trigger_phase: 'armed',
    price_sl: 1.125,
    price_tp: 1.14,
  });
  assert.equal(row.stateVersion, '1');
  assert.equal(row.triggerPhase, 'armed');
  assert.equal(row.priceLimit, null);
  assert.equal(row.sl, '1.125');
  assert.equal(row.tp, '1.14');
  assert.equal(row.expiry, 1790328000);

  const stopLimit = normalizePendingOrderDto({
    ticket: 3004,
    account_login: 200074,
    symbol: 'EURUSD',
    type: 'sell_stop_limit',
    volume: 0.01,
    price: 1.12,
    price_limit: 1.121,
    status: 'pending',
    time_setup: 1790241800,
    state_version: 7,
  });
  assert.equal(stopLimit.type, 'sell_stop_limit');
  assert.equal(stopLimit.priceLimit, '1.121');
  assert.equal(stopLimit.stateVersion, '7');
});

test('v3 pending modify/cancel acknowledgements are partial and allow state_version and ticket_text', () => {
  assert.doesNotThrow(() => parseModifyPendingOrderResponse(
    { ticket: 3003, status: 'modified', state_version: '2', price_limit: null, price: '1.131' },
    3003,
  ));
  assert.throws(() => parseModifyPendingOrderResponse({ ticket: 3004, status: 'modified' }, 3003));
  assert.doesNotThrow(() => parseModifyPendingOrderResponse({ ticket: 3003, status: 'PENDING' }, 3003));

  assert.doesNotThrow(() => parseCancelPendingOrderResponse(
    {
      ticket: 41273,
      ticket_text: '41273',
      account_login: 200063,
      status: 'cancelled',
      state_version: '7',
      price_decimal: '1.08500',
      price_limit_decimal: null,
      sl_decimal: null,
      tp_decimal: null,
      expiry: null,
      time: 1793336971,
    },
    41273,
  ));
  assert.throws(() => parseCancelPendingOrderResponse(
    { ticket: 3003, status: 'modified', time: 1790241900 },
    3003,
  ));
});

test('omitted pending stop and expiry families normalize to null', () => {
  const {
    volume_exact: _omittedVolumeExact,
    price_exact: _omittedPriceExact,
    ...withoutExactValues
  } = baseDto;
  const normalized = normalizePendingOrderDto({
    ...withoutExactValues,
    volume: 0.1,
    price: 1.08,
  });
  assert.equal(normalized.sl, null);
  assert.equal(normalized.tp, null);
  assert.equal(normalized.expiry, null);
  assert.equal(normalized.volume, '0.1');
  assert.equal(normalized.price, '1.08');
});

test('a malformed higher-precedence exact field fails closed', () => {
  assert.throws(
    () => normalizePendingOrderDto({
      ...baseDto,
      sl_exact: 'not-a-decimal',
      sl: 1.07,
    }),
  );
});

test('pending modify serializes price, price_limit, sl, tp as decimal strings, null clears sl/tp, and restricts time_in_force to DAY', () => {
  assert.deepEqual(buildModifyPendingOrderRequestBody({ sl: null }), { sl: null });
  assert.deepEqual(buildModifyPendingOrderRequestBody({ tp: '1.09' }), { tp: '1.09' });
  assert.deepEqual(buildModifyPendingOrderRequestBody({
    price: 1.084,
    sl: '1.08000',
    tp: null,
  }), {
    price: '1.084',
    sl: '1.08',
    tp: null,
  });
  assert.throws(() => buildModifyPendingOrderRequestBody({}));
  assert.throws(() => buildModifyPendingOrderRequestBody({ price: undefined }));
  assert.deepEqual(buildModifyPendingOrderRequestBody({ sl: 0 }), { sl: null });
  assert.deepEqual(buildModifyPendingOrderRequestBody({ tp: 0 }), { tp: null });
  assert.deepEqual(
    buildModifyPendingOrderRequestBody({ price_limit: '1.1210' }),
    { price_limit: '1.121' },
  );
  assert.deepEqual(
    buildModifyPendingOrderRequestBody({ price: '1.084', expected_version: 7 }),
    { price: '1.084', expected_version: '7' },
  );
  const nowSec = 1_700_000_000;
  const dayBody = buildModifyPendingOrderRequestBody({ time_in_force: 'DAY' }, nowSec);
  assert.equal(dayBody.time_in_force, 'DAY');
  assert.equal(typeof dayBody.expiry, 'number');
  const gtcBody = buildModifyPendingOrderRequestBody({ time_in_force: 'GTC' }, nowSec);
  assert.equal('time_in_force' in gtcBody, false);
  assert.equal(gtcBody.expiry, null);
  const gtdBody = buildModifyPendingOrderRequestBody({ time_in_force: 'GTD', expiry: nowSec + 3600 }, nowSec);
  assert.equal('time_in_force' in gtdBody, false);
  assert.equal(gtdBody.expiry, nowSec + 3600);
  assert.throws(() => buildModifyPendingOrderRequestBody({ sl: -1 }));
  for (const refused of ['volume', 'symbol', 'side', 'comment', 'trailing_stop', 'trailing_step', 'magic']) {
    assert.throws(() => buildModifyPendingOrderRequestBody({ price: '1.08', [refused]: 1 } as any));
  }
});

test('pending cancel and modify send one shared clientOrderId in body and header, with >= 30s timeout and reconciliation', () => {
  assert.ok(PENDING_ORDER_MUTATION_TIMEOUT_MS >= 30_000);
  assert.deepEqual(PENDING_ORDER_RETRY_DELAYS_MS, [1_000, 2_000, 4_000]);

  const source = readFileSync(
    resolve(process.cwd(), 'src/api/orders/pendingOrders.ts'),
    'utf8',
  );
  assert.doesNotMatch(source, /createTradeIdempotencyKey/, 'never generate a second identity separate from client_order_id');

  const modifySource = source.slice(
    source.indexOf('export const modifyPendingOrder'),
    source.indexOf('const responseTicketMatches'),
  );
  assert.match(modifySource, /const clientOrderId = resolvePendingMutationClientOrderId\(options\)/);
  assert.match(modifySource, /client_order_id: clientOrderId/);
  assert.match(modifySource, /'Idempotency-Key': clientOrderId/);
  assert.match(modifySource, /account_login=\$\{encodeURIComponent\(owner\.accountLogin\)\}/);
  assert.match(modifySource, /assertActivePendingProtectionAllowed\(body\)/);
  assert.match(modifySource, /parseModifyPendingOrderResponse\(await response\.json\(\), ticket\.numeric\)/);
  assert.match(modifySource, /reconciliation = await reconcilePendingMutation\(owner, ticket\.numeric\)/);
  assert.doesNotMatch(modifySource, /replayAfterAuthRefresh:\s*false/);

  const cancelSource = source.slice(source.indexOf('export const cancelPendingOrder'));
  assert.match(cancelSource, /const clientOrderId = resolvePendingMutationClientOrderId\(options\)/);
  assert.match(cancelSource, /method: 'DELETE'/);
  assert.match(cancelSource, /'Idempotency-Key': clientOrderId/);
  assert.match(cancelSource, /client_order_id: clientOrderId,\s*account_login: Number\(owner\.accountLogin\)/);
  assert.match(cancelSource, /account_login=\$\{encodeURIComponent\(owner\.accountLogin\)\}/);
  assert.match(cancelSource, /reconcilePendingMutation\(owner, ticket\.numeric\)/);
  assert.doesNotMatch(cancelSource, /replayAfterAuthRefresh:\s*false/);
});

test('captured pending reads cannot recapture a newly selected owner', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/api/orders/pendingOrders.ts'),
    'utf8',
  );
  const capturedReadSource = source.slice(
    source.indexOf('export const listPendingOrdersForCapturedOwner'),
    source.indexOf('const reconcilePendingMutation'),
  );
  assert.match(
    capturedReadSource,
    /owner: ActiveBrokerSessionOwnerStamp/,
  );
  assert.match(capturedReadSource, /listPendingOrdersForOwner\(owner\)/);
  assert.doesNotMatch(capturedReadSource, /capturePendingOrderOwner\(\)/);
});

test('pending_updated websocket events map status values for placed, modified, cancelled, triggered, and expired', () => {
  assert.equal(pendingOrderEventKind('pending_updated', 'cancelled'), 'cancelled');
  assert.equal(pendingOrderEventKind('pending_updated', 'modified'), 'modified');
  assert.equal(pendingOrderEventKind('pending_updated', 'placed'), 'placed');
  assert.equal(pendingOrderEventKind('pending_updated', 'pending'), 'placed');
  assert.equal(pendingOrderEventKind('pending_updated', 'triggered'), 'filled');
  assert.equal(pendingOrderEventKind('pending_updated', 'expired'), 'expired');
  assert.equal(pendingOrderEventKind('order.cancelled'), 'cancelled');
  assert.equal(pendingOrderEventKind('order.triggered'), 'filled');
});

test('runtime cancelPendingOrder and modifyPendingOrder send identical header/body client_order_id and handle 503, 202, and LP_COMMAND_UNSUPPORTED', async () => {
  const originalFetch = globalThis.fetch;
  try {
    __resetActiveBrokerSessionForTests();
    const capture = activateBrokerSession(
      beginActiveBrokerSessionTransition(),
      {
        brokerId: 'broker-a',
        accountLogin: '200063',
        apiBase: 'https://services.broker-a.com/api/v2',
        feedWsBase: 'wss://services.broker-a.com/ws/feed',
        tradeWsBase: 'wss://services.broker-a.com/ws/v2',
        feedStatusUrl: 'https://services.broker-a.com/ws/feed/status',
        servicesDomain: 'services.broker-a.com',
        configVersion: 'cfg-1',
      },
      {
        accessToken: 'access-broker-a',
        refreshToken: 'refresh-broker-a',
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
    );
    acceptTradingHydration(
      capture.session.cacheNamespace,
      {},
      { login: 200063 },
      [{ symbol: 'EURUSD', trade_mode: 4, volume_min: 0.01, volume_max: 100, volume_step: 0.01 }],
    );

    const deleteCalls: Array<{ url: string; headerKey: string | null; body: Record<string, unknown> }> = [];
    let deleteAttempt = 0;
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'DELETE') {
        deleteAttempt += 1;
        const headers = new Headers(init?.headers);
        deleteCalls.push({
          url,
          headerKey: headers.get('Idempotency-Key'),
          body: JSON.parse(String(init?.body ?? '{}')),
        });
        if (deleteAttempt === 1) {
          return new Response(
            JSON.stringify({ error: 'EXACT_PENDING_CANCEL_UNAVAILABLE', message: 'Temporary busy' }),
            { status: 503 },
          );
        }
        return new Response(
          JSON.stringify({
            ticket: 41273,
            ticket_text: '41273',
            account_login: 200063,
            status: 'cancelled',
            state_version: '7',
            price_decimal: '1.08500',
            price_limit_decimal: null,
            sl_decimal: null,
            tp_decimal: null,
            expiry: null,
            time: 1793336971,
          }),
          { status: 200 },
        );
      }
      return new Response('[]', { status: 200 });
    }) as typeof globalThis.fetch;

    const cancelled = await cancelPendingOrder(41273, { retryDelaysMs: [0, 0, 0] });
    assert.equal(cancelled.outcome, 'absent');
    assert.equal(deleteCalls.length, 2, '503 retries with the same client_order_id');
    assert.equal(
      deleteCalls[0].url,
      'https://services.broker-a.com/api/v2/orders/pending/41273?account_login=200063',
    );
    assert.equal(deleteCalls[0].headerKey, deleteCalls[0].body.client_order_id);
    assert.equal(deleteCalls[1].headerKey, deleteCalls[0].headerKey, 'retry must reuse the exact same client_order_id');
    assert.equal(deleteCalls[1].body.client_order_id, deleteCalls[0].body.client_order_id);
    assert.deepEqual(Object.keys(deleteCalls[0].body).sort(), ['account_login', 'client_order_id']);

    // 202 accepted: no error, reconciles list
    globalThis.fetch = (async (_input, init) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'DELETE') {
        return new Response(JSON.stringify({ status: 'accepted' }), { status: 202 });
      }
      return new Response('[]', { status: 200 });
    }) as typeof globalThis.fetch;
    const accepted202 = await cancelPendingOrder(41273, { acceptedRetryDelayMs: 0 });
    assert.equal(accepted202.outcome, 'absent');

    // 409 LP_COMMAND_UNSUPPORTED when order is already gone from list -> treated as done
    globalThis.fetch = (async (_input, init) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'DELETE') {
        return new Response(
          JSON.stringify({ error: 'LP_COMMAND_UNSUPPORTED', message: 'Order no longer pending' }),
          { status: 409 },
        );
      }
      return new Response('[]', { status: 200 });
    }) as typeof globalThis.fetch;
    const lpGone = await cancelPendingOrder(41273);
    assert.equal(lpGone.outcome, 'absent');

    // PUT modifyPendingOrder sends decimal strings and matching identity
    const putCalls: Array<{ url: string; headerKey: string | null; body: Record<string, unknown> }> = [];
    globalThis.fetch = (async (input, init) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'PUT') {
        const headers = new Headers(init?.headers);
        putCalls.push({
          url: String(input),
          headerKey: headers.get('Idempotency-Key'),
          body: JSON.parse(String(init?.body ?? '{}')),
        });
        return new Response(
          JSON.stringify({ ticket: 41273, status: 'modified', state_version: '8' }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify([
          {
            ticket: 41273,
            account_login: 200063,
            symbol: 'EURUSD',
            type: 'buy_limit',
            status: 'pending',
            time_setup: 1_784_800_000,
            volume_decimal: '0.10',
            price_decimal: '1.08400',
            sl_decimal: '1.08000',
            tp_decimal: null,
          },
        ]),
        { status: 200 },
      );
    }) as typeof globalThis.fetch;

    const modified = await modifyPendingOrder(41273, { price: '1.08400', sl: '1.08000', tp: null });
    assert.equal(modified.outcome, 'present');
    assert.equal(putCalls.length, 1);
    assert.equal(
      putCalls[0].url,
      'https://services.broker-a.com/api/v2/orders/pending/41273?account_login=200063',
    );
    assert.equal(putCalls[0].headerKey, putCalls[0].body.client_order_id);
    assert.equal(putCalls[0].body.price, '1.084');
    assert.equal(putCalls[0].body.sl, '1.08');
    assert.equal(putCalls[0].body.tp, null);
  } finally {
    globalThis.fetch = originalFetch;
    __resetActiveBrokerSessionForTests();
  }
});
