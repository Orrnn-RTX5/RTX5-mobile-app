import assert from 'node:assert/strict';
import test from 'node:test';
import { orderTicketMarginDisplay } from './orderTicketBackendValues';

test('margin never invents a value or currency while backend data is missing', () => {
  for (const value of [undefined, null, NaN, Infinity, -1]) assert.equal(orderTicketMarginDisplay(value, 'USD'), '--');
  assert.equal(orderTicketMarginDisplay(8.16, undefined), '--');
});

test('the first backend margin replaces loading immediately without rounding the amount', () => {
  assert.equal(orderTicketMarginDisplay(undefined, 'USD'), '--');
  assert.equal(orderTicketMarginDisplay(8.16345678, 'USD'), '-$8.16345678');
  assert.equal(orderTicketMarginDisplay(0, 'USD'), '-$0');
  assert.equal(orderTicketMarginDisplay(12.3456, 'EUR'), '-12.3456 EUR');
});
