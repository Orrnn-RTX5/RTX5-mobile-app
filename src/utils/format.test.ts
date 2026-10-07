import assert from 'node:assert/strict';
import test from 'node:test';

import { fmt, formatPrice } from './format.ts';

test('formatPrice keeps broker digits for forex quotes', () => {
  assert.equal(formatPrice(1.17121, 5), '1.17121');
  assert.equal(fmt.price(159.608, 3), '159.608');
});

test('formatPrice keeps the existing two-decimal default for money-style values', () => {
  assert.equal(formatPrice(76459.2), '76459.20');
});

test('decimal money formatting preserves fractional account balances', () => {
  assert.equal(fmt.decimal(1233.73), '1,233.73');
  assert.equal(fmt.decimal(1233), '1,233.00');
});

test('formatPrice clamps unsupported decimal counts', () => {
  assert.equal(formatPrice(1.123456789, 20), '1.12345679');
  assert.equal(formatPrice(1.9, -2), '2');
});
