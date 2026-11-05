import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CLIENT_ORDER_ID_PATTERN,
  createClosePositionClientOrderId,
  createMarketOrderClientOrderId,
  createTradeIdempotencyKey,
  createUuidV4,
  getTradeIdempotencyAction,
  isValidClientOrderId,
} from './tradeIdempotency';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const withoutWebCrypto = <T>(run: () => T): T => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
  try {
    return run();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
  }
};

test('idempotency routes cover every required trade mutation and nothing else', () => {
  assert.equal(getTradeIdempotencyAction('/orders', 'POST'), 'order');
  assert.equal(getTradeIdempotencyAction('/orders/pending', 'POST'), 'pending');
  assert.equal(getTradeIdempotencyAction('/orders/pending/42', 'PUT'), 'pending-modify-42');
  assert.equal(getTradeIdempotencyAction('/orders/pending/42', 'DELETE'), 'pending-cancel-42');
  assert.equal(getTradeIdempotencyAction('/positions/12345/close', 'POST'), 'close-12345');
  assert.equal(getTradeIdempotencyAction('/positions/12345', 'PUT'), null);
  assert.equal(getTradeIdempotencyAction('/orders', 'GET'), null);
});

test('trade idempotency keys are action-prefixed and unique per request', () => {
  const first = createTradeIdempotencyKey('order');
  const second = createTradeIdempotencyKey('order');

  assert.match(first, /^order-/);
  assert.match(second, /^order-/);
  assert.notEqual(first, second);
});

test('client_order_id pattern is the contract regex', () => {
  assert.equal(String(CLIENT_ORDER_ID_PATTERN), String(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,63}$/));
  assert.equal(isValidClientOrderId('order-test-0001'), true);
  assert.equal(isValidClientOrderId('close-test-0001'), true);
  assert.equal(isValidClientOrderId('short'), false);
  assert.equal(isValidClientOrderId('-order-0001'), false);
  assert.equal(isValidClientOrderId(`o${'x'.repeat(64)}`), false);
  assert.equal(isValidClientOrderId('order id with spaces'), false);
});

test('market ids are order-<uuidv4> and close ids are close-<ticket>-<uuidv4>', () => {
  const order = createMarketOrderClientOrderId();
  assert.match(order, /^order-/);
  assert.match(order.slice('order-'.length), UUID_V4);
  assert.match(order, CLIENT_ORDER_ID_PATTERN);

  const close = createClosePositionClientOrderId(2002);
  assert.match(close, /^close-2002-/);
  assert.match(close.slice('close-2002-'.length), UUID_V4);
  assert.match(close, CLIENT_ORDER_ID_PATTERN);

  // A full int64 ticket still fits the 64-character limit.
  const longClose = createClosePositionClientOrderId('9223372036854775807');
  assert.match(longClose, /^close-9223372036854775807-/);
  assert.match(longClose, CLIENT_ORDER_ID_PATTERN);

  assert.throws(() => createClosePositionClientOrderId('row-1'), TypeError);
});

test('the no-Web-Crypto fallback also produces valid, unique v4 ids', () => {
  withoutWebCrypto(() => {
    const ids = new Set<string>();
    for (let index = 0; index < 500; index += 1) {
      const uuid = createUuidV4();
      assert.match(uuid, UUID_V4);
      ids.add(uuid);
      assert.match(createMarketOrderClientOrderId(), CLIENT_ORDER_ID_PATTERN);
      assert.match(createClosePositionClientOrderId('9223372036854775807'), CLIENT_ORDER_ID_PATTERN);
      assert.match(createTradeIdempotencyKey('pending-modify-42'), CLIENT_ORDER_ID_PATTERN);
    }
    assert.equal(ids.size, 500);
  });
});
