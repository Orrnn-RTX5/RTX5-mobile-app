import assert from 'node:assert/strict';
import test from 'node:test';
import { derivePointFromDigits, formatPointSize, resolveTradePositionPointValue } from './pricePoint';

test('point size follows broker quote precision, including zero and fine digits', () => {
  for (const [digits, point] of [[0, 1], [2, 0.01], [3, 0.001], [5, 0.00001], [12, 1e-12]]) {
    assert.equal(derivePointFromDigits(digits), point);
  }
  for (const digits of [-1, 2.5, 13, NaN, Infinity, undefined]) {
    assert.equal(derivePointFromDigits(digits), undefined);
  }
});

test('position details prefer normalized broker metadata then explicit live point', () => {
  assert.equal(resolveTradePositionPointValue({ instrumentMeta: { point: 0.01 }, liveQuote: { point: 0.25 } }), 0.01);
  assert.equal(resolveTradePositionPointValue({ instrumentMeta: { point: NaN }, liveQuote: { point: 0.001 } }), 0.001);
  assert.equal(resolveTradePositionPointValue({ liveQuote: { digits: 5, digitsSource: 'backend' } }), 0.00001);
});

test('missing data never invents point size from a tick or estimated digits', () => {
  assert.equal(resolveTradePositionPointValue({}), undefined);
  assert.equal(resolveTradePositionPointValue({ liveQuote: { digits: 5 } }), undefined);
  assert.equal(resolveTradePositionPointValue({ liveQuote: { point: -0.01, digits: 5 } }), undefined);
});

test('point sizes retain small decimal precision and unknown values stay unknown', () => {
  assert.equal(formatPointSize(0.00001), '0.00001');
  assert.equal(formatPointSize(0.001), '0.001');
  assert.equal(formatPointSize(0.25), '0.25');
  assert.equal(formatPointSize(1e-12), '0.000000000001');
  assert.equal(formatPointSize(1), '1');
  assert.equal(formatPointSize(undefined), '--');
  assert.equal(formatPointSize(0), '--');
});
