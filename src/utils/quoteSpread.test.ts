import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateQuoteSpreadPoints, resolveQuoteDisplayDigits } from './quoteSpread.ts';

test('EURUSD feed without digits uses forex point precision', () => {
  const digits = resolveQuoteDisplayDigits('EURUSD', 1.13736);
  assert.equal(digits, 5);
  assert.equal(calculateQuoteSpreadPoints(1.13736, 1.13751, digits), 15);
  assert.equal(resolveQuoteDisplayDigits('USDJPY.c', 151.123), 3);
  assert.equal(resolveQuoteDisplayDigits('EURUSD', 1.13736, undefined, 0.00001), 5);
  assert.equal(resolveQuoteDisplayDigits('EURUSD', 1.13736, 4), 4);
});

test('calculateQuoteSpreadPoints uses displayed bid ask precision', () => {
  assert.equal(calculateQuoteSpreadPoints(1.16345, 1.16365, 5), 20);
  assert.equal(calculateQuoteSpreadPoints(4475.11, 4475.34, 2), 23);
  assert.equal(calculateQuoteSpreadPoints(62257.56, 62287.23, 2), 2967);
});

test('calculateQuoteSpreadPoints rounds bid ask before comparing spread', () => {
  assert.equal(calculateQuoteSpreadPoints(1.163451, 1.163649, 5), 20);
  assert.equal(calculateQuoteSpreadPoints(4475.114, 4475.336, 2), 23);
});

test('calculateQuoteSpreadPoints rejects unusable quote inputs', () => {
  assert.equal(calculateQuoteSpreadPoints(undefined, 1.2, 5), undefined);
  assert.equal(calculateQuoteSpreadPoints(1.2, 1.1, 5), undefined);
  assert.equal(calculateQuoteSpreadPoints(1.1, 1.2, undefined), undefined);
});
