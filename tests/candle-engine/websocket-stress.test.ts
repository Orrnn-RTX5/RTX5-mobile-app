import assert from 'node:assert/strict';
import test from 'node:test';

import { applyLiveCandleToCandleMap } from '../../src/domain/candles/series/liveCandleAggregator';
import { createCandleMap, materializeCandleMap } from '../../src/domain/candles/series/candleSeriesMerger';
import { secondsUtc } from '../support/candleTestUtils';

test('high-frequency backend live candle snapshots keep one stable active bucket', () => {
  const bucket = secondsUtc(2024, 3, 22, 12, 1, 0);
  const map = createCandleMap();
  const count = 50;

  for (let index = 0; index < count; index += 1) {
    const price = 1.1 + index / 100000;
    const result = applyLiveCandleToCandleMap(
      map,
      {
        symbol: 'EURUSD',
        timeframe: 'M1',
        time: bucket + index,
        open: 1.1,
        high: price + 0.0002,
        low: 1.099,
        close: price,
        volume: index + 1,
      },
      'M1',
    );
    assert.equal(result.ignored, false);
  }

  const candles = materializeCandleMap(map);
  assert.equal(candles.length, 1);
  assert.deepEqual(candles[0], {
    time: bucket,
    open: 1.1,
    high: 1.1 + (count - 1) / 100000 + 0.0002,
    low: 1.099,
    close: 1.1 + (count - 1) / 100000,
    volume: count,
  });
});

test('stale backend burst items after a newer snapshot cannot rewind close', () => {
  const bucket = secondsUtc(2024, 3, 22, 12, 1, 0);
  const map = createCandleMap();

  applyLiveCandleToCandleMap(
    map,
    { symbol: 'EURUSD', timeframe: 'M1', time: bucket + 50, open: 1.1, high: 1.2, low: 1.0, close: 1.18, volume: 50 },
    'M1',
  );
  const staleResults = [10, 20, 30].map((offset) =>
    applyLiveCandleToCandleMap(
      map,
      { symbol: 'EURUSD', timeframe: 'M1', time: bucket + offset, open: 1.1, high: 1.12, low: 1.08, close: 1.11, volume: offset },
      'M1',
    ),
  );

  assert.deepEqual(staleResults.map((result) => result.reason), [
    'merged_out_of_order_live_candle',
    'merged_out_of_order_live_candle',
    'merged_out_of_order_live_candle',
  ]);
  assert.equal(materializeCandleMap(map)[0].close, 1.18);
});
