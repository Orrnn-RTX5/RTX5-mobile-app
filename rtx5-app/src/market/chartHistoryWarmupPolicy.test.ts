import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CLOSED_MARKET_HISTORY_WARM_LIMIT,
  INITIAL_HISTORY_LIMIT,
} from '../domain/candles/stream/liveCandleStream/types';
import { resolveChartSelectionHistoryWarmLimit } from './chartHistoryWarmupPolicy';

test('deep-warms every symbol class only when its backend quote session is explicitly closed', () => {
  const symbols = [
    'EURUSD',
    'XAUUSD',
    'US30',
    'AAPL',
    'USOIL',
    'BTCUSD',
    'BTCUSD.pro',
  ];

  for (const symbol of symbols) {
    assert.equal(
      resolveChartSelectionHistoryWarmLimit({ quote_open: false }),
      CLOSED_MARKET_HISTORY_WARM_LIMIT,
      symbol,
    );
  }
});

test('keeps open, continuously streaming, and unknown symbols on the lightweight first window', () => {
  assert.equal(resolveChartSelectionHistoryWarmLimit({ quote_open: true }), INITIAL_HISTORY_LIMIT);
  assert.equal(resolveChartSelectionHistoryWarmLimit({}), INITIAL_HISTORY_LIMIT);
  assert.equal(resolveChartSelectionHistoryWarmLimit(undefined), INITIAL_HISTORY_LIMIT);
  assert.equal(resolveChartSelectionHistoryWarmLimit(null), INITIAL_HISTORY_LIMIT);
});

test('crypto maintenance closure follows backend state instead of an asset-class exception', () => {
  assert.equal(
    resolveChartSelectionHistoryWarmLimit({ quote_open: false }),
    CLOSED_MARKET_HISTORY_WARM_LIMIT,
  );
  assert.equal(
    resolveChartSelectionHistoryWarmLimit({ quote_open: true }),
    INITIAL_HISTORY_LIMIT,
  );
});
