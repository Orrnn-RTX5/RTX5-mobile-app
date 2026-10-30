import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePositiveDecimalInput } from './decimalInput';

test('decimal keypad values are parsed completely on both platforms', () => {
  for (const value of ['1.25', '1,25', ' 1,25 ']) assert.equal(parsePositiveDecimalInput(value), 1.25);
  assert.equal(parsePositiveDecimalInput('.005'), 0.005);
  assert.equal(parsePositiveDecimalInput('12.'), 12);
  for (const value of ['', ' ', '0', '-1', 'Infinity', 'NaN', '1.25oops', '1,000.25', '1,2,3', '0x10', '1e3', '1 000', '9'.repeat(400)]) {
    assert.equal(parsePositiveDecimalInput(value), undefined, value);
  }
});
