import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PendingOrderPayloadError,
  buildPendingOrderRequestBody,
  normalizePendingOrderType,
} from './pendingOrderPayload.ts';

test('pending order payload uses only the canonical V2 wire fields', () => {
  const body = buildPendingOrderRequestBody({
    account_login: '200074',
    broker_id: 'must-not-leak',
    symbol: 'XAUUSD.c',
    side: 'buy',
    volume: 0.1,
    type: 'Buy Limit',
    price: 2320.5,
    price_sl: 2310.25,
    price_tp: 2330.5,
    expiration: 1_800_000_000,
    trailing_stop: 10,
    trailing_step: 2,
    magic: 42,
    comment: 'ticket',
  });

  assert.deepEqual(body, {
    account_login: 200074,
    symbol: 'XAUUSD.C',
    volume: '0.1',
    type: 'buy_limit',
    price: '2320.5',
    sl: '2310.25',
    tp: '2330.5',
    expiry: 1_800_000_000,
    comment: 'ticket',
  });
  for (const forbidden of [
    'login',
    'side',
    'price_sl',
    'price_tp',
    'expiration',
    'broker_id',
    'trailing_stop',
    'trailing_step',
    'magic',
  ]) {
    assert.equal(Object.hasOwn(body, forbidden), false, forbidden);
  }
});

test('price_open remains a local input alias but the wire uses canonical price', () => {
  assert.deepEqual(
    buildPendingOrderRequestBody({
      account_login: 200074,
      symbol: 'EURUSD',
      side: 'sell',
      volume: 0.02,
      type: 'sell_stop',
      price_open: 1.069,
    }),
    {
      account_login: 200074,
      symbol: 'EURUSD',
      volume: '0.02',
      type: 'sell_stop',
      price: '1.069',
    },
  );
});

test('only the four backend-supported pending types are accepted', () => {
  assert.equal(normalizePendingOrderType('Buy Limit'), 'buy_limit');
  assert.equal(normalizePendingOrderType('sell-limit'), 'sell_limit');
  assert.equal(normalizePendingOrderType('buy stop'), 'buy_stop');
  assert.equal(normalizePendingOrderType('SELL_STOP'), 'sell_stop');
  assert.equal(normalizePendingOrderType('Buy Stop Limit'), null);
  assert.equal(normalizePendingOrderType('sell-stop-limit'), null);

  for (const type of ['buy_stop_limit', 'sell_stop_limit', 'market', 'unknown']) {
    assert.throws(
      () => buildPendingOrderRequestBody({
        account_login: 200074,
        symbol: 'EURUSD',
        side: 'buy',
        volume: 0.01,
        type,
        price: 1.08,
      }),
      PendingOrderPayloadError,
      type,
    );
  }
});

test('pending decimal fields reject zero, negative, non-finite, and excess precision', () => {
  const base = {
    account_login: 200074,
    symbol: 'EURUSD',
    side: 'buy' as const,
    volume: 0.01,
    type: 'buy_limit',
    price: 1.08,
  };

  for (const payload of [
    { ...base, volume: 0 },
    { ...base, volume: -0.01 },
    { ...base, volume: Number.NaN },
    { ...base, price: 0 },
    { ...base, price: Number.POSITIVE_INFINITY },
    { ...base, volume: 0.123456789 },
  ]) {
    assert.throws(
      () => buildPendingOrderRequestBody(payload),
      PendingOrderPayloadError,
    );
  }
});

test('pending protection never sends 0: omission, null and zero all mean no SL/TP', () => {
  const base = {
    account_login: 200074,
    symbol: 'EURUSD',
    side: 'buy' as const,
    volume: 0.01,
    type: 'buy_limit',
    price: 1.08,
  };
  const omitted = buildPendingOrderRequestBody(base);
  assert.equal(Object.hasOwn(omitted, 'sl'), false);
  assert.equal(Object.hasOwn(omitted, 'tp'), false);

  const explicitUnset = buildPendingOrderRequestBody({
    ...base,
    sl: null,
    tp: null,
    expiry: null,
  });
  assert.equal(Object.hasOwn(explicitUnset, 'sl'), false);
  assert.equal(Object.hasOwn(explicitUnset, 'tp'), false);
  assert.equal(explicitUnset.expiry, null);

  // Contract v3 6.3: for "no SL/TP" leave the field out or send null; do
  // not send 0. A zero from the ticket UI is therefore omitted, never sent.
  for (const payload of [
    { ...base, sl: 0 },
    { ...base, tp: 0 },
    { ...base, price_sl: 0 },
    { ...base, price_tp: 0 },
    { ...base, sl: '0', tp: '' },
  ]) {
    const body = buildPendingOrderRequestBody(payload);
    assert.equal(Object.hasOwn(body, 'sl'), false);
    assert.equal(Object.hasOwn(body, 'tp'), false);
    assert.doesNotMatch(JSON.stringify(body), /"(?:sl|tp)":0/);
  }

  assert.throws(
    () => buildPendingOrderRequestBody({ ...base, sl: -1 }),
    PendingOrderPayloadError,
  );
});

test('pending placement matches the contract example and always carries account_login', () => {
  const futureExpiry = Math.floor(Date.now() / 1000) + 86_400;
  const body = buildPendingOrderRequestBody({
    account_login: '200074',
    symbol: 'EURUSD',
    side: 'buy',
    volume: 0.01,
    type: 'buy_limit',
    price: '1.1300',
    sl: '1.1250',
    tp: '1.1400',
    expiry: futureExpiry,
    comment: 'RTX5 Mobile',
  });
  assert.deepEqual(body, {
    account_login: 200074,
    symbol: 'EURUSD',
    volume: '0.01',
    type: 'buy_limit',
    price: '1.13',
    sl: '1.125',
    tp: '1.14',
    expiry: futureExpiry,
    comment: 'RTX5 Mobile',
  });
  assert.equal(typeof body.account_login, 'number');
  assert.throws(
    () => buildPendingOrderRequestBody({
      account_login: 0,
      symbol: 'EURUSD',
      side: 'buy',
      volume: 0.01,
      type: 'buy_limit',
      price: 1.13,
    }),
    PendingOrderPayloadError,
  );
});

test('pending canonical options are validated and aliases cannot conflict', () => {
  const base = {
    account_login: 200074,
    symbol: 'EURUSD',
    side: 'buy' as const,
    volume: 0.01,
    type: 'buy_limit',
    price: 1.08,
  };
  const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
  assert.deepEqual(buildPendingOrderRequestBody({
    ...base,
    sl: '1.07',
    tp: '1.09',
    expiry: futureExpiry,
    // Not part of the v3 pending contract: accepted from callers, never sent.
    fill_mode: 'fok',
  }), {
    account_login: 200074,
    symbol: 'EURUSD',
    volume: '0.01',
    type: 'buy_limit',
    price: '1.08',
    sl: '1.07',
    tp: '1.09',
    expiry: futureExpiry,
  });

  assert.throws(
    () => buildPendingOrderRequestBody({
      ...base,
      sl: 1.07,
      price_sl: 1.07,
    }),
    PendingOrderPayloadError,
  );
  assert.throws(
    () => buildPendingOrderRequestBody({
      ...base,
      expiry: futureExpiry,
      expiration: futureExpiry,
    }),
    PendingOrderPayloadError,
  );
});
