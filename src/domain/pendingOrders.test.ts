import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultPendingPrice, endOfLocalDaySeconds, pendingExpiry, pendingMinimumDistance, pendingPriceRulesReady, roundPendingPrice, validatePendingOrder } from './pendingOrders';
import type { PendingOrderType } from '../api/orders/types';

const types: PendingOrderType[] = ['buy_limit', 'sell_limit', 'buy_stop', 'sell_stop', 'buy_stop_limit', 'sell_stop_limit'];
const rules = { digits: 2, tickSize: 0.25, stopsLevel: 100 };
test('submission requires loaded broker precision and stop distance', () => {
  assert.equal(pendingPriceRulesReady({}), false);
  assert.equal(pendingPriceRulesReady({ digits: 5 }), false);
  assert.equal(pendingPriceRulesReady({ digits: 5, stopsLevel: 'invalid' }), false);
  assert.equal(pendingPriceRulesReady({ digits: 5, stopsLevel: '0' }), true);
  assert.equal(pendingPriceRulesReady({ digits: 10, stopsLevel: '20' }), true);
  assert.equal(pendingMinimumDistance({ digits: 10, stopsLevel: 20 }), 2e-9);
});
for (const type of types) {
  test(`${type}: default uses the correct reference side, minimum distance and trading tick`, () => {
    const price = defaultPendingPrice(type, 99, 101, rules);
    assert.equal(roundPendingPrice(price, rules), price);
    assert.equal(validatePendingOrder({ ...rules, type, price, priceLimit: type.startsWith('buy') ? price - 1 : price + 1, bid: 99, ask: 101 }), null);
  });
}
test('BUY rules use Ask and SELL rules use Bid even inside a large spread', () => {
  assert.equal(validatePendingOrder({ type: 'buy_limit', price: 100, bid: 99, ask: 101, digits: 2 }), null);
  assert.equal(validatePendingOrder({ type: 'sell_limit', price: 100, bid: 99, ask: 101, digits: 2 }), null);
  assert.match(validatePendingOrder({ type: 'buy_stop', price: 100, bid: 99, ask: 101, digits: 2 })!, /above Ask/);
  assert.match(validatePendingOrder({ type: 'sell_stop', price: 100, bid: 99, ask: 101, digits: 2 })!, /below Bid/);
});
test('broker stops_level is in points, distinct from trading tick size', () => {
  assert.equal(pendingMinimumDistance({ digits: 5, stopsLevel: '20', tickSize: 0.0001 }), 0.0002);
  assert.equal(validatePendingOrder({ type: 'buy_limit', price: 1.2, bid: 1.2001, ask: 1.2002, digits: 5, stopsLevel: 20 }), null);
  assert.match(validatePendingOrder({ type: 'buy_limit', price: 1.2001, bid: 1.2001, ask: 1.2002, digits: 5, stopsLevel: 20 })!, /at least/);
});
test('stop-limit SL/TP use the limit entry rather than the stop trigger or quote', () => {
  const input = { type: 'buy_stop_limit' as const, price: 110, priceLimit: 100, ask: 105, bid: 104, digits: 2, stopsLevel: 100 };
  assert.equal(validatePendingOrder({ ...input, sl: 99, tp: 101 }), null);
  assert.match(validatePendingOrder({ ...input, sl: 105 })!, /pending entry/);
  assert.match(validatePendingOrder({ ...input, tp: 100.5 })!, /at least/);
  assert.equal(validatePendingOrder({ ...input, sl: null, tp: null }), null);
});
test('expiration uses local end-of-day and rejects milliseconds, past and fractional timestamps', () => {
  const now = new Date(2026, 9, 24, 12, 30, 0);
  assert.equal(endOfLocalDaySeconds(now), Math.floor(new Date(2026, 9, 24, 23, 59, 59).getTime() / 1000));
  assert.equal(pendingExpiry('GTC', now.getTime(), now.getTime()), null);
  assert.equal(pendingExpiry('DAY', null, now.getTime()), endOfLocalDaySeconds(now));
  const future = Math.floor(now.getTime() / 1000) + 3600;
  assert.equal(pendingExpiry('GTD', future, now.getTime()), future);
  for (const value of [now.getTime(), future + 0.5, future - 7200, null]) assert.throws(() => pendingExpiry('GTD', value, now.getTime()));
});
