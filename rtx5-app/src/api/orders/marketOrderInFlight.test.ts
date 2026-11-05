import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createOrderRequestRegistry, createMarketOrderIntentId, marketOrderRequestKey } from './marketOrderInFlight';
import { isValidClientOrderId } from '../tradeIdempotency';

test('duplicate callbacks for one request share one immediate transport and the exact backend result', async () => {
  const registry = createOrderRequestRegistry<object>();
  let settle!: (value: object) => void;
  let sends = 0;
  const start = () => { sends++; return new Promise<object>(resolve => { settle = resolve; }); };
  const requests = Array.from({ length: 50 }, () => registry.run('account:buy', start));
  assert.equal(sends, 1);
  assert.ok(requests.every(request => request === requests[0]));
  assert.equal(registry.hasPrefix('account:'), true);
  const backend = { price: 81621.851234, ticket: '9007199254740993' };
  settle(backend);
  assert.ok((await Promise.all(requests)).every(result => result === backend));
  assert.equal(registry.hasPrefix('account:'), false);
  const next = registry.run('account:buy', start);
  assert.equal(sends, 2, 'a new tap after completion is a new request');
  settle(backend); await next;
});

const createPublicApiHarness = () => {
  const file = ts.createSourceFile('placeMarketOrder.ts', readFileSync('src/api/orders/placeMarketOrder.ts', 'utf8'), ts.ScriptTarget.Latest, true);
  let expression: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'placeMarketOrder') expression = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(file); assert.ok(expression);
  const registry = createOrderRequestRegistry<object>();
  const calls: { payload: { frontendIntentId?: string }; complete: (value: object) => void }[] = [];
  const place = runInNewContext(ts.transpileModule(`(${expression.getText(file)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    captureActiveBrokerSessionOwnerStamp: () => ({ cacheNamespace: 'one-account' }),
    marketOrderRequests: registry, marketOrderRequestKey,
    executeMarketOrder: (payload: { frontendIntentId?: string }) => new Promise<object>(complete => {
      calls.push({ payload, complete });
    }),
  });
  return { place, calls, registry };
};

test('the public market-order API preserves the duplicate gate for callers without a click identity', async () => {
  const { place, calls } = createPublicApiHarness();
  const order = { account_login: 123, symbol: 'BTCUSD', side: 'buy', volume: 0.01 };
  const requests = Array.from({ length: 50 }, () => place(order));
  assert.equal(calls.length, 1); assert.ok(requests.every(request => request === requests[0]));
  const backend = { price: 81621.851234, position_ticket: '1234567890123456789', status: 'filled' };
  calls[0].complete(backend);
  assert.ok((await Promise.all(requests)).every(value => value === backend));
});

for (const side of ['buy', 'sell'] as const) {
  test(`ten distinct rapid ${side} clicks start ten separate transports before any response`, async () => {
    const { place, calls, registry } = createPublicApiHarness();
    const orders = Array.from({ length: 10 }, () => ({
      account_login: 123, symbol: 'BTCUSD', side, volume: 0.01,
      frontendIntentId: createMarketOrderIntentId(),
    }));
    assert.equal(new Set(orders.map(order => order.frontendIntentId)).size, 10);
    assert.ok(orders.every(order => isValidClientOrderId(order.frontendIntentId)));
    const requests = orders.map(order => place(order));
    assert.equal(calls.length, 10, 'no response, timer, queue or cooldown is needed for a subsequent click');
    assert.equal(new Set(requests).size, 10, 'distinct clicks cannot merge into one promise');
    orders.forEach((order, index) => {
      assert.equal(place({ ...order }), requests[index], 'repeated delivery of the same click is still idempotent');
    });
    assert.equal(calls.length, 10);
    const responses = calls.map((_, index) => ({
      order_ticket: `order-${index}`, position_ticket: `position-${index}`,
      price: 81621.85 + index, side, status: 'filled',
    }));
    for (let index = calls.length - 1; index >= 0; index--) calls[index].complete(responses[index]);
    const results = await Promise.all(requests);
    results.forEach((result, index) => assert.equal(result, responses[index], 'out-of-order replies stay with their original click'));
    assert.equal(registry.hasPrefix('["one-account"'), false);
  });
}

test('transport starts before loading listeners and failures release the request without a timer', async () => {
  const registry = createOrderRequestRegistry<number>();
  const events: string[] = [];
  registry.subscribe(() => { events.push('loading'); });
  const request = registry.run('buy', () => { events.push('POST'); return Promise.reject(new Error('rejected')); });
  assert.deepEqual(events, ['POST', 'loading']);
  await assert.rejects(request, /rejected/);
  assert.equal(registry.hasPrefix('buy'), false);
  assert.equal(await registry.run('buy', () => Promise.resolve(1)), 1);
});

test('reentrant events cannot start a duplicate and listener errors cannot prevent a request', async () => {
  const registry = createOrderRequestRegistry<number>();
  let sends = 0; let nested: Promise<number> | undefined;
  const request = registry.run('buy', () => {
    sends++;
    nested = registry.run('buy', () => { sends++; return Promise.resolve(2); });
    return Promise.resolve(1);
  });
  assert.equal(request, nested); assert.equal(sends, 1);
  assert.equal(await request, 1);
  registry.subscribe(() => { throw new Error('view unmounted'); });
  assert.equal(await registry.run('buy', () => Promise.resolve(3)), 3);
});

test('keys separate account epochs, symbols, directions, volume and protection', () => {
  const order = { account_login: 123, symbol: 'BTCUSD', side: 'buy' as const, volume: 0.01 };
  const key = marketOrderRequestKey('epoch-1', order);
  for (const changed of [
    { symbol: 'BTCUSD.pro' }, { side: 'sell' as const }, { volume: 0.02 }, { sl: 80000 }, { comment: 'another intent' },
    { frontendIntentId: createMarketOrderIntentId() },
  ]) assert.notEqual(marketOrderRequestKey('epoch-1', { ...order, ...changed }), key);
  assert.notEqual(marketOrderRequestKey('epoch-2', order), key);
  assert.equal(marketOrderRequestKey('epoch-1', { ...order, symbol: ' btcusd ' }), key);
  assert.equal(marketOrderRequestKey('epoch-1', { ...order, price_sl: 0 }), key);
  assert.notEqual(marketOrderRequestKey('epoch-1', { ...order, sl: 0 }), key, 'invalid canonical zero must not join a valid order');
  assert.notEqual(marketOrderRequestKey('epoch-1', { ...order, sl: null, price_sl: 0 }), key, 'conflicting aliases must still be validated');
});
