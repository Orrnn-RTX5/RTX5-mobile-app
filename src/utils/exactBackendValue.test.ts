import assert from 'node:assert/strict';
import test from 'node:test';
import { formatExactBackendValue } from './exactBackendValue';

test('backend execution numbers and decimal strings preserve precision', () => {
  assert.equal(formatExactBackendValue(81621.851234), '81621.851234');
  assert.equal(formatExactBackendValue('1.12345678901234567890'), '1.12345678901234567890');
  assert.equal(formatExactBackendValue(1e-9), '0.000000001');
  assert.equal(formatExactBackendValue('1.2300e+3'), '1230.0');
  for (const value of [undefined, null, NaN, Infinity, '', 'wrong']) assert.equal(formatExactBackendValue(value), '--');
});
