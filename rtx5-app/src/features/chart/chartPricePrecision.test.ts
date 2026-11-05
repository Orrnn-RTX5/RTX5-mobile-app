import assert from 'node:assert/strict';
import test from 'node:test';

import {
  inferChartPriceDecimalsFromValues,
  normalizeChartDisplayDecimals,
  normalizeChartPriceStepDecimals,
  resolveChartDisplayDecimals,
} from './chartPricePrecision.ts';

test('chart display decimals prefer backend instrument digits', () => {
  assert.equal(
    resolveChartDisplayDecimals({
      instrumentDigits: 2,
      liveQuoteDigits: 5,
      liveQuoteDigitsFromBackend: true,
    }),
    2,
  );
});

test('chart display decimals trim over-precise metadata to observed backend prices', () => {
  assert.equal(
    resolveChartDisplayDecimals({
      instrumentDigits: 8,
      liveQuoteBid: 1.33628,
      liveQuoteAsk: 1.3364,
    }),
    5,
  );

  assert.equal(
    resolveChartDisplayDecimals({
      instrumentPoint: '0.00000001',
      candlePrices: [1.33629, 1.33633, 1.33626, 1.33628],
    }),
    5,
  );
});

test('chart display decimals prefer backend quote digits before inferred or fallback digits', () => {
  assert.equal(
    resolveChartDisplayDecimals({
      liveQuoteDigits: 5,
      liveQuoteDigitsFromBackend: true,
      liveQuoteBid: '2350.50',
    }),
    5,
  );
  assert.equal(
    resolveChartDisplayDecimals({
      liveQuoteDigits: 5,
      liveQuoteDigitsFromBackend: false,
      liveQuoteBid: '2350.50',
    }),
    2,
  );
});

test('chart display decimals infer from live price text before metadata fallback digits', () => {
  assert.equal(inferChartPriceDecimalsFromValues(['1.23456', '1.23470']), 5);
  assert.equal(inferChartPriceDecimalsFromValues(['156.123']), 3);
  assert.equal(inferChartPriceDecimalsFromValues(['2350.50']), 2);
  assert.equal(inferChartPriceDecimalsFromValues([65000]), undefined);
  assert.equal(
    resolveChartDisplayDecimals({
      liveQuoteDigits: 2,
      liveQuoteDigitsFromBackend: false,
      liveQuoteBid: 65000,
    }),
    2,
  );
  assert.equal(
    resolveChartDisplayDecimals({
      liveQuoteDigits: 2,
      liveQuoteDigitsFromBackend: false,
      liveQuoteBid: undefined,
    }),
    2,
  );
});

test('chart display decimals derive from backend point and tick size before live quotes', () => {
  assert.equal(
    resolveChartDisplayDecimals({
      instrumentPoint: 0.01,
      instrumentTickSize: 0.00001,
      liveQuoteDigits: 5,
      liveQuoteDigitsFromBackend: true,
    }),
    2,
  );
  assert.equal(
    resolveChartDisplayDecimals({
      instrumentTickSize: '0.00001',
      liveQuoteDigits: 2,
      liveQuoteDigitsFromBackend: true,
    }),
    5,
  );
  assert.equal(
    resolveChartDisplayDecimals({
      instrumentPoint: 0.01,
      liveQuoteBid: 2350.5,
    }),
    2,
  );
});

test('chart display decimals clamp backend digit values', () => {
  assert.equal(normalizeChartDisplayDecimals('4'), 4);
  assert.equal(normalizeChartDisplayDecimals(12), 8);
  assert.equal(normalizeChartDisplayDecimals(-1), 0);
  assert.equal(normalizeChartDisplayDecimals(''), undefined);
});

test('chart price step decimals normalize broker step metadata', () => {
  assert.equal(normalizeChartPriceStepDecimals(0.25), 2);
  assert.equal(normalizeChartPriceStepDecimals('0.00001'), 5);
  assert.equal(normalizeChartPriceStepDecimals(1e-9), 8);
  assert.equal(normalizeChartPriceStepDecimals(0), undefined);
});
