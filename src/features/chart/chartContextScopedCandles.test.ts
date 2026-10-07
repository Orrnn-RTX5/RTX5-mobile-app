import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveContextScopedChartCandles } from './chartContextScopedCandles';

const xauTail = {
  time: 1_785_000_000,
  open: 4_384.92,
  high: 4_385.06,
  low: 4_384.71,
  close: 4_384.88,
  volume: 7,
};

test('a newly selected symbol never falls back to retained candles from the previous pane context', () => {
  const candles = resolveContextScopedChartCandles(
    'broker-a:account-1:AUDCHF:M1',
    [],
    {
      contextKey: 'broker-a:account-1:XAUUSD:M1',
      candles: [xauTail],
    },
  );

  assert.deepEqual(candles, []);
});

test('same-context retained candles remain available during a bridge READY race', () => {
  const candles = resolveContextScopedChartCandles(
    'broker-a:account-1:XAUUSD:M1',
    [],
    {
      contextKey: 'broker-a:account-1:XAUUSD:M1',
      candles: [xauTail],
    },
  );

  assert.equal(candles[0], xauTail);
});

test('current canonical candles always supersede a retained snapshot', () => {
  const audTail = {
    time: xauTail.time,
    open: 0.57322,
    high: 0.57324,
    low: 0.5732,
    close: 0.57321,
    volume: 2,
  };
  const candles = resolveContextScopedChartCandles(
    'broker-a:account-1:AUDCHF:M1',
    [audTail],
    {
      contextKey: 'broker-a:account-1:XAUUSD:M1',
      candles: [xauTail],
    },
  );

  assert.equal(candles[0], audTail);
});
