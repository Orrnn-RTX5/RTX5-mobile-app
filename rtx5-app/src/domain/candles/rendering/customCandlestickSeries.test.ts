import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveRTX5CustomCandleOpacity } from './customCandleOpacity';

test('custom candle opacity defaults safely and clamps finite values', () => {
  assert.equal(resolveRTX5CustomCandleOpacity(undefined), 1);
  assert.equal(resolveRTX5CustomCandleOpacity(null), 1);
  assert.equal(resolveRTX5CustomCandleOpacity(Number.NaN), 1);
  assert.equal(resolveRTX5CustomCandleOpacity(Number.POSITIVE_INFINITY), 1);
  assert.equal(resolveRTX5CustomCandleOpacity(-0.2), 0);
  assert.equal(resolveRTX5CustomCandleOpacity(0.72), 0.72);
  assert.equal(resolveRTX5CustomCandleOpacity(1.2), 1);
});
