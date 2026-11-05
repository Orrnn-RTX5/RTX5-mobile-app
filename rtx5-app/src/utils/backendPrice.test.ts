import assert from 'node:assert/strict';
import test from 'node:test';
import { formatBackendPrice, VALUE_BASED_PRICE_WEBVIEW_JS } from './backendPrice';
import vm from 'node:vm';
import { fmt } from './format';

test('one integer digit, including zero, uses four rounded decimal places', () => {
  const cases: [unknown, string][] = [
    [1.11854, '1.1185'], [1.1184800000000001, '1.1185'],
    [9.87656, '9.8766'], [0.2501, '0.2501'], [0.5, '0.5000'],
    [1, '1.0000'], [0, '0.0000'], [-1.23456789, '-1.2346'],
    ['  1.12345678901234567890  ', '1.1235'], ['.5', '0.5000'],
    [1.234567891e-9, '0.0000'], ['1.20e-9', '0.0000'],
  ];
  for (const [value, expected] of cases) assert.equal(formatBackendPrice(value), expected);
});

test('three and four integer digits use two rounded decimal places', () => {
  const cases: [unknown, string][] = [
    [176.985, '176.99'], [114.252, '114.25'], [158.23899999999998, '158.24'],
    [4122.237, '4122.24'], [100, '100.00'], [1000, '1000.00'],
    [-1234.567, '-1234.57'], ['158.23000', '158.23'], ['00123.456', '123.46'],
  ];
  for (const [value, expected] of cases) assert.equal(formatBackendPrice(value), expected);
});

test('two and five or more integer digits use two decimals without floating-point tails', () => {
  const cases: [unknown, string][] = [
    [58.871, '58.87'], [58.870999999999995, '58.87'], [82669.5, '82669.50'],
    [82535.65000000001, '82535.65'], [82558.15000000001, '82558.15'],
    [123456.7890123, '123456.79'], ['  58.87100  ', '58.87'],
    ['42', '42.00'], ['82669.50000', '82669.50'], ['1.20e5', '120000.00'],
  ];
  for (const [value, expected] of cases) assert.equal(formatBackendPrice(value), expected);
  assert.equal(formatBackendPrice(1.23456789e21), '1234567890000000000000.00');
  for (const price of [Number.MAX_VALUE, 1e21]) {
    assert.equal(Number(formatBackendPrice(price)), price);
    assert.doesNotMatch(formatBackendPrice(price), /e/i);
  }
});

test('integer-digit rules use the original magnitude before rounding across boundaries', () => {
  assert.equal(formatBackendPrice(9.99999), '10.0000');
  assert.equal(formatBackendPrice(10), '10.00');
  assert.equal(formatBackendPrice(99.99999), '100.00');
  assert.equal(formatBackendPrice(100), '100.00');
  assert.equal(formatBackendPrice(9999.999), '10000.00');
  assert.equal(formatBackendPrice(10000.12345), '10000.12');
});

test('unavailable prices keep placeholders and never manufacture zero', () => {
  for (const value of [undefined, null, NaN, Infinity, -Infinity, '', ' ', 'NaN', 'Infinity', '0x10', {}, true]) {
    assert.equal(formatBackendPrice(value), '--');
    assert.equal(formatBackendPrice(value, '---'), '---');
  }
});

test('readout rules leave fixed money and scale formatting unchanged', () => {
  assert.equal(formatBackendPrice(1.11854), '1.1185');
  assert.equal(fmt.price(1.11854), '1.12');
  assert.equal(fmt.price(1.11854, 5), '1.11854');
  assert.equal(fmt.pnl(1.11854), '+1.12');
});

test('Android WebView labels use the same value-based rounding and trailing zeros as native readouts', () => {
  const formatWebViewPrice = vm.runInNewContext(VALUE_BASED_PRICE_WEBVIEW_JS + '\nformatValueBasedPrice;');
  for (const value of [1.1, 0.5, 10.1, 100.1, 1000.1, 82535.65000000001,
    82558.15000000001, -1.2, -100.1, 1.23456789e21, Number.MAX_VALUE,
    '1.1', '100.1', '  42  ', '0x10', '', null, undefined, NaN, Infinity]) {
    assert.equal(formatWebViewPrice(value), formatBackendPrice(value));
  }
  assert.equal(formatWebViewPrice(1.1), '1.1000');
  assert.equal(formatWebViewPrice(100.1), '100.10');
});
