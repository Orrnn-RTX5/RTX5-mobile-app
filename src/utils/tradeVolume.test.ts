import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidTradeVolume } from './tradeVolume';

const BOUNDS = { minVolume: 0.01, maxVolume: 100, stepVolume: 0.01 };

test('isValidTradeVolume accepts in-range step multiples', () => {
  assert.equal(isValidTradeVolume(0.01, BOUNDS), true);
  assert.equal(isValidTradeVolume(0.1, BOUNDS), true);
  assert.equal(isValidTradeVolume(0.08, BOUNDS), true);
  assert.equal(isValidTradeVolume(5, BOUNDS), true);
  assert.equal(isValidTradeVolume('0.50', BOUNDS), true);
  assert.equal(isValidTradeVolume(100, BOUNDS), true);
});

test('isValidTradeVolume rejects non-step values (MT5 flags these)', () => {
  assert.equal(isValidTradeVolume(0.075, BOUNDS), false);
  assert.equal(isValidTradeVolume(0.005, BOUNDS), false);
  assert.equal(isValidTradeVolume(0.123, BOUNDS), false);
});

test('isValidTradeVolume rejects out-of-range and non-numeric input', () => {
  assert.equal(isValidTradeVolume(0, BOUNDS), false); // below min
  assert.equal(isValidTradeVolume(200, BOUNDS), false); // above max
  assert.equal(isValidTradeVolume('', BOUNDS), false);
  assert.equal(isValidTradeVolume('abc', BOUNDS), false);
  assert.equal(isValidTradeVolume(null, BOUNDS), false);
});

test('isValidTradeVolume tolerates floating-point step math', () => {
  // 0.01 + 6*0.01 = 0.07 with FP noise must still read as valid.
  assert.equal(isValidTradeVolume(0.07, BOUNDS), true);
  assert.equal(isValidTradeVolume(0.29, BOUNDS), true);
});
