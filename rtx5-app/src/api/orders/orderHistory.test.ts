import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACCOUNT_ORDERS_PAGE_SIZE,
  fetchAllAccountOrders,
  normalizeOrderHistoryRow,
} from './orderHistory';

test('order history walks /account/orders with limit=1000 offset paging', async () => {
  const all = Array.from({ length: 1500 }, (_, index) => ({
    ticket: index + 1,
    account_login: 200074,
    symbol: 'EURUSD',
    type: 'market',
    side: 'buy',
    volume: 0.01,
    price: 1.13745,
    status: 'filled',
    comment: '',
    time_create: 1790241500 + index,
  }));
  const calls: Array<[number, number]> = [];
  const orders = await fetchAllAccountOrders({
    fetchPage: async (limit, offset) => {
      calls.push([limit, offset]);
      return all.slice(offset, offset + limit);
    },
  });
  assert.equal(ACCOUNT_ORDERS_PAGE_SIZE, 1000);
  assert.deepEqual(calls, [[1000, 0], [1000, 1000]]);
  assert.equal(orders.length, 1500);
  assert.equal(orders[0].price_open, 1.13745);
  assert.equal(orders[0].time_setup, 1790241500);
});

test('account order rows are normalised to the LoginOrder names without overriding them', () => {
  const legacy = normalizeOrderHistoryRow({
    ticket: 1,
    price_open: 1.2,
    price: 1.3,
    time_setup: 10,
    time_create: 20,
    time_done: 30,
  });
  assert.equal(legacy.price_open, 1.2);
  assert.equal(legacy.time_setup, 10);
  assert.equal(legacy.time_done, 30);
});
