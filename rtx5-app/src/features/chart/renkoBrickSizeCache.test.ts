import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveStableRenkoBrickSize } from './renkoBrickSizeCache';

const makeHistory = (range: number) => Array.from({ length: 16 }, (_, index) => ({
  time: 1_775_000_000 + index * 60,
  open: 100,
  high: 100 + range / 2,
  low: 100 - range / 2,
  close: 100,
  volume: 1,
}));

test('shares one stable ATR size per broker symbol timeframe and price grid', () => {
  const base = {
    scopeKey: 'renko-cache-stable-a',
    symbol: 'EURUSD',
    timeframe: 'M1',
    displayDecimals: 2,
    minimumPriceIncrement: 0.05,
  } as const;

  assert.equal(resolveStableRenkoBrickSize({ ...base, candles: makeHistory(0.2) }), 0.2);
  assert.equal(
    resolveStableRenkoBrickSize({ ...base, candles: makeHistory(2) }),
    0.2,
    'the same chart context must reuse the established grid across surfaces',
  );
  assert.equal(
    resolveStableRenkoBrickSize({ ...base, scopeKey: 'renko-cache-stable-b', candles: makeHistory(2) }),
    2,
    'broker-session scopes must not share a grid',
  );
});

test('does not permanently cache the one-tick fallback from flat history', () => {
  const base = {
    scopeKey: 'renko-cache-flat',
    symbol: 'FLAT',
    timeframe: 'M5',
    displayDecimals: 2,
    minimumPriceIncrement: 0.05,
  } as const;

  assert.equal(resolveStableRenkoBrickSize({ ...base, candles: makeHistory(0) }), 0.05);
  assert.equal(resolveStableRenkoBrickSize({ ...base, candles: makeHistory(1) }), 1);
});

