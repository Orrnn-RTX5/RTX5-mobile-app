import assert from 'node:assert/strict';
import test from 'node:test';

import { splitFormattedChartTradePrice } from './pricePresentation';

test('terminal price presentation emphasizes at most the last two fractional digits', () => {
  assert.deepEqual(splitFormattedChartTradePrice('4055'), {
    leading: '4055',
    trailing: '',
  });
  assert.deepEqual(splitFormattedChartTradePrice('4055.2'), {
    leading: '4055.',
    trailing: '2',
  });
  assert.deepEqual(splitFormattedChartTradePrice('4055.27'), {
    leading: '4055.',
    trailing: '27',
  });
  assert.deepEqual(splitFormattedChartTradePrice('1.12345'), {
    leading: '1.123',
    trailing: '45',
  });
  assert.deepEqual(splitFormattedChartTradePrice('1.12345678'), {
    leading: '1.123456',
    trailing: '78',
  });
});

test('terminal price presentation leaves placeholders untouched', () => {
  assert.deepEqual(splitFormattedChartTradePrice('---'), {
    leading: '---',
    trailing: '',
  });
});

test('terminal price emphasis retains full backend precision', () => {
  for (const price of ['58.870999999999995', '1.234567891234', '0.00000000123', '123']) {
    const parts = splitFormattedChartTradePrice(price);
    assert.equal(parts.leading + parts.trailing, price);
    assert.ok(parts.trailing.length <= 2);
  }
});
