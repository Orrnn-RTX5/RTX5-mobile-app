import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveOrderTicketDefaultPendingPrice,
  resolveOrderTicketPendingOffset,
  resolveOrderTicketPriceDecimals,
  resolveOrderTicketStopLimitOffset,
  roundOrderTicketPrice,
} from './orderTicketPreviewUtils.ts';

const roundPrice = (value: number) => roundOrderTicketPrice(value, 0.0001, 4);

test('resolveOrderTicketPriceDecimals respects fine forex tick sizes', () => {
  assert.equal(resolveOrderTicketPriceDecimals(0.00001, 1.2, 1.20015), 5);
  assert.equal(resolveOrderTicketPriceDecimals(0.1, 3365.2, 3365.9), 1);
});

test('roundOrderTicketPrice snaps values to the nearest tick size', () => {
  assert.equal(roundOrderTicketPrice(1.23456, 0.0001, 4), 1.2346);
  assert.equal(roundOrderTicketPrice(1.23454, 0.0001, 4), 1.2345);
});

test('resolveOrderTicketPendingOffset matches symbol-specific pending spacing', () => {
  assert.equal(resolveOrderTicketPendingOffset('BTCUSD', 0.01), 350);
  assert.equal(resolveOrderTicketPendingOffset('XAUUSD', 0.1), 2);
  assert.ok(Math.abs(resolveOrderTicketPendingOffset('EURUSD', 0.00001) - 0.0009) < 1e-12);
});

test('resolveOrderTicketStopLimitOffset matches symbol-specific stop-limit spacing', () => {
  assert.equal(resolveOrderTicketStopLimitOffset('BTCUSD', 0.01, 350), 125);
  assert.equal(resolveOrderTicketStopLimitOffset('XAUUSD', 0.1, 2), 0.75);
  assert.equal(resolveOrderTicketStopLimitOffset('EURUSD', 0.00001, 0.0009), 0.00045);
});

test('resolveOrderTicketDefaultPendingPrice places triggers on the correct side of market', () => {
  const sharedInput = {
    bid: 1.2,
    ask: 1.2002,
    pendingOffset: 0.0004,
    roundPrice,
  };

  assert.equal(resolveOrderTicketDefaultPendingPrice({ ...sharedInput, orderType: 'Buy Limit' }), 1.1998);
  assert.equal(resolveOrderTicketDefaultPendingPrice({ ...sharedInput, orderType: 'Sell Limit' }), 1.2004);
  assert.equal(resolveOrderTicketDefaultPendingPrice({ ...sharedInput, orderType: 'Buy Stop' }), 1.2006);
  assert.equal(resolveOrderTicketDefaultPendingPrice({ ...sharedInput, orderType: 'Sell Stop' }), 1.1996);
  assert.equal(resolveOrderTicketDefaultPendingPrice({ ...sharedInput, orderType: 'Buy Stop Limit' }), 1.2006);
  assert.equal(resolveOrderTicketDefaultPendingPrice({ ...sharedInput, orderType: 'Sell Stop Limit' }), 1.1996);
});
