import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCreateAlertBody,
  mapPriceAlert,
  mapPriceAlertList,
  normalizeAlertCondition,
} from './alerts';

test('alert conditions are above, below and cross', () => {
  assert.equal(normalizeAlertCondition('above'), 'above');
  assert.equal(normalizeAlertCondition('BELOW'), 'below');
  assert.equal(normalizeAlertCondition('cross'), 'cross');
  assert.equal(normalizeAlertCondition('crosses'), null);
});

test('POST /alerts body carries only symbol, condition, price and an optional message', () => {
  assert.deepEqual(
    buildCreateAlertBody({ symbol: 'EURUSD', condition: 'cross', price: 1.14, message: '  hit  ' }),
    { symbol: 'EURUSD', condition: 'cross', price: 1.14, message: 'hit' },
  );
  assert.deepEqual(
    buildCreateAlertBody({ symbol: 'EURUSD', condition: 'above', price: 1.14, message: '   ' }),
    { symbol: 'EURUSD', condition: 'above', price: 1.14 },
  );
});

test('201 create response {id, symbol, condition, price} maps to an alert', () => {
  assert.deepEqual(
    mapPriceAlert({ id: 7, symbol: 'EURUSD', condition: 'above', price: 1.14 }),
    { id: 7, symbol: 'EURUSD', condition: 'above', price: 1.14, message: '', triggered: false, created_at: 0 },
  );
});

test('GET /alerts is a bare array; invalid rows are dropped', () => {
  const alerts = mapPriceAlertList([
    { id: 1, symbol: 'EURUSD', condition: 'below', price: '1.13', message: 'dip', triggered: true, created_at: 1790241500 },
    { id: 2, symbol: 'BTCUSD', condition: 'cross', price: 83000 },
    { id: 3, symbol: 'BTCUSD', condition: 'sideways', price: 1 },
    { symbol: 'XAUUSD', condition: 'above', price: 1 },
  ]);
  assert.equal(alerts.length, 2);
  assert.deepEqual(alerts[0], {
    id: 1, symbol: 'EURUSD', condition: 'below', price: 1.13, message: 'dip', triggered: true, created_at: 1790241500,
  });
  assert.equal(alerts[1].condition, 'cross');
  assert.deepEqual(mapPriceAlertList({ data: [{ id: 5, symbol: 'EURUSD', condition: 'above', price: 1 }] }).length, 1);
  assert.deepEqual(mapPriceAlertList(null), []);
});
