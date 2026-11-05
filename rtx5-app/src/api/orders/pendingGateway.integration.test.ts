import assert from 'node:assert/strict';
import test from 'node:test';
import { makePendingGatewayHarness } from '../../../tests/helpers/pendingGateway';
import type { PendingOrderType } from './types';

const types: PendingOrderType[] = ['buy_limit','sell_limit','buy_stop','sell_stop','buy_stop_limit','sell_stop_limit'];
for (const login of [200019, 200020]) for (const type of types) {
  test(`Gateway contract: ${type} place/list/modify/clear/expiry/cancel/history on account ${login}`, async () => {
    const h = makePendingGatewayHarness();
    h.switchAccount(login);
    const buy = type.startsWith('buy');
    const stopLimit = type.endsWith('_stop_limit');
    const result = await h.placePendingOrder({ account_login: login, symbol: 'BTCUSD', type,
      side: buy ? 'buy' : 'sell', volume: 0.01, price: 110, ...(stopLimit ? { price_limit: 100 } : {}),
      sl: buy ? (stopLimit ? 99 : 109) : (stopLimit ? 101 : 111), tp: buy ? 112 : 98, time_in_force: 'GTC' });
    const ticket = Number(result.ticket);
    await h.listPendingOrders();
    assert.equal(h.usePendingOrdersState.getState().orders.length, 1);
    assert.equal(h.usePendingOrdersState.getState().orders[0].accountLogin, login);
    await h.modifyPendingOrder(ticket, { price: 111, ...(stopLimit ? { price_limit: 101 } : {}), sl: null, tp: null });
    let put = h.calls.filter(call => call.method === 'PUT').at(-1)!.body!;
    assert.equal(put.sl, null); assert.equal(put.tp, null); assert.equal(put.account_login, login);
    await h.modifyPendingOrder(ticket, { sl: buy ? 90 : 120, tp: buy ? 120 : 90 });
    await h.modifyPendingOrder(ticket, { sl: '', tp: 0, time_in_force: 'GTD', expiry: Math.floor(Date.now()/1000)+3600 });
    put = h.calls.filter(call => call.method === 'PUT').at(-1)!.body!;
    assert.equal(put.sl, null); assert.equal(put.tp, null); assert.ok(put.expiry < 1e11);
    await h.modifyPendingOrder(ticket, { time_in_force: 'GTC', expiry: null });
    put = h.calls.filter(call => call.method === 'PUT').at(-1)!.body!;
    assert.equal(put.time_in_force, undefined); assert.equal(put.expiry, null);
    await h.cancelPendingOrder(ticket);
    assert.equal(h.usePendingOrdersState.getState().orders.length, 0);
    const history = await h.historyApi.fetchPendingOrderHistory(login, { from: 0, to: Math.floor(Date.now()/1000) });
    assert.equal(history[0].status, 'cancelled'); assert.equal(history[0].ticket, ticket);
    assert.ok(history[0].time_done > 0);
  });
}

test('old account payload and delayed GET cannot change the newly active account', async () => {
  const h = makePendingGatewayHarness();
  const release = h.holdNextList();
  const oldRead = h.listPendingOrders();
  h.switchAccount(200020);
  release();
  await assert.rejects(oldRead, /Stale broker session/);
  const before = h.calls.length;
  await assert.rejects(h.placePendingOrder({ account_login: 200019, symbol: 'BTCUSD', side: 'buy', type: 'buy_limit', volume: 0.01, price: 90 }), /account/);
  assert.equal(h.calls.length, before, 'stale account input is rejected before any POST');
  assert.equal(h.usePendingOrdersState.getState().orders.length, 0);
});

test('unknown pending-create outcome starts reconciliation and never automatically repeats POST', async () => {
  const h = makePendingGatewayHarness();
  h.failures.nextWrite = true;
  await assert.rejects(h.placePendingOrder({ account_login: 200019, symbol: 'BTCUSD', side: 'buy', type: 'buy_limit', volume: 0.01, price: 90 }), /Network connection lost/);
  await Promise.resolve();
  assert.equal(h.calls.filter(call => call.method === 'POST').length, 1);
  assert.ok(h.calls.some(call => call.method === 'GET' && call.endpoint === '/orders/pending/200019'));
});

test('Sell Limit with SL/TP uses a fresh body request ID when correcting the broker symbol spelling', async () => {
  const h = makePendingGatewayHarness();
  h.symbolMisses.add('BTC/USD');
  h.catalogSymbols.set('BTC/USD', 'BTCUSD');
  const order = { account_login: 200019, symbol: 'BTC/USD', side: 'sell' as const,
    type: 'sell_limit' as const, volume: 0.01, price: 110, sl: 120, tp: 90 };
  // The catalog can return an equivalent spelling, never a different instrument.
  const result = await h.placePendingOrder(order);
  assert.ok(result.ticket);
  const sends = h.calls.filter(call => call.method === 'POST');
  assert.deepEqual(sends.map(call => call.body!.symbol), ['BTC/USD', 'BTCUSD']);
  assert.equal(sends[1].body!.sl, 120);
  assert.equal(sends[1].body!.tp, 90);
  assert.equal(new Set(sends.map(call => call.body!.client_order_id)).size, sends.length);
  for (const send of sends) assert.equal(send.idempotencyKey, send.body!.client_order_id);
  const repeated = await h.placePendingOrder(order);
  assert.ok(repeated.ticket);
  const next = h.calls.filter(call => call.method === 'POST').at(-1)!;
  assert.notEqual(next.body!.client_order_id, sends[1].body!.client_order_id, 'a later explicit submission is a new request');
  assert.equal(next.body!.symbol, 'BTCUSD');
});

test('concurrent callback delivery of the same Sell Limit sends one POST, while changed prices remain independent', async () => {
  const h = makePendingGatewayHarness();
  const order = { account_login: 200019, symbol: 'BTCUSD', side: 'sell' as const,
    type: 'sell_limit' as const, volume: 0.01, price: 110, sl: 120, tp: 90 };
  const [first, duplicate, changed] = await Promise.all([
    h.placePendingOrder(order), h.placePendingOrder({ ...order }), h.placePendingOrder({ ...order, price: 111 }),
  ]);
  assert.equal(first.ticket, duplicate.ticket);
  assert.notEqual(first.ticket, changed.ticket);
  const sends = h.calls.filter(call => call.method === 'POST');
  assert.equal(sends.length, 2);
  assert.deepEqual(sends.map(call => call.body!.price), [110, 111]);
  for (const send of sends) assert.equal(send.idempotencyKey, send.body!.client_order_id);
  assert.notEqual(sends[0].body!.client_order_id, sends[1].body!.client_order_id);
});

test('a late REST snapshot and stale placed event cannot resurrect a filled/cancelled order', async () => {
  const h = makePendingGatewayHarness();
  const result = await h.placePendingOrder({ account_login: 200019, symbol: 'BTCUSD', side: 'buy', type: 'buy_limit', volume: 0.01, price: 90 });
  await h.listPendingOrders();
  const previous = h.usePendingOrdersState.getState().orders[0];
  const release = h.holdNextList();
  const lateRead = h.listPendingOrders();
  h.removePendingOrder(h.owner, Number(result.ticket));
  release(); await lateRead;
  assert.equal(h.usePendingOrdersState.getState().orders.length, 0);
  h.upsertPendingOrder(h.owner, previous);
  assert.equal(h.usePendingOrdersState.getState().orders.length, 0);
});

test('acknowledged modify and cancel remain successful if the reconciliation GET is offline', async () => {
  const h = makePendingGatewayHarness();
  const result = await h.placePendingOrder({ account_login: 200019, symbol: 'BTCUSD', side: 'buy', type: 'buy_limit', volume: 0.01, price: 90 });
  await h.listPendingOrders();
  h.failures.nextRead = true;
  const modified = await h.modifyPendingOrder(Number(result.ticket), { price: 89, sl: null, tp: null });
  assert.equal(modified.order?.price, '89');
  h.failures.nextRead = true;
  const cancelled = await h.cancelPendingOrder(Number(result.ticket));
  assert.equal(cancelled.outcome, 'absent');
  assert.equal(h.usePendingOrdersState.getState().orders.length, 0);
  assert.equal(h.calls.filter(call => call.method === 'PUT').length, 1);
  assert.equal(h.calls.filter(call => call.method === 'DELETE').length, 1);
});
