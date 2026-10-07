import assert from 'node:assert/strict';
import test from 'node:test';

import { applyLiveCandleToCandleMap } from '../../src/domain/candles/series/liveCandleAggregator';
import { createCandleMap, materializeCandleMap } from '../../src/domain/candles/series/candleSeriesMerger';
import { secondsUtc } from '../support/candleTestUtils';

test('duplicate backend live candle snapshots are no-op updates', () => {
  const map = createCandleMap();
  const snapshot = {
    symbol: 'EURUSD',
    timeframe: 'M1',
    time: secondsUtc(2024, 3, 22, 12, 1, 5),
    open: 1.1,
    high: 1.12,
    low: 1.09,
    close: 1.11,
    volume: 4,
  };

  const first = applyLiveCandleToCandleMap(map, snapshot, 'M1');
  const duplicate = applyLiveCandleToCandleMap(map, snapshot, 'M1');

  assert.equal(first.changed, true);
  assert.equal(duplicate.changed, false);
  assert.equal(duplicate.ignored, false);
  assert.equal(materializeCandleMap(map).length, 1);
});

test('same-bucket backend snapshots merge the active candle without adding duplicates', () => {
  const bucket = secondsUtc(2024, 3, 22, 12, 1, 0);
  const map = createCandleMap();

  applyLiveCandleToCandleMap(
    map,
    { symbol: 'EURUSD', timeframe: 'M1', time: bucket + 5, open: 1.1, high: 1.12, low: 1.09, close: 1.11, volume: 4 },
    'M1',
  );
  const updated = applyLiveCandleToCandleMap(
    map,
    { symbol: 'EURUSD', timeframe: 'M1', time: bucket + 20, open: 1.1, high: 1.14, low: 1.08, close: 1.13, volume: 8 },
    'M1',
  );

  assert.equal(updated.changed, true);
  assert.deepEqual(materializeCandleMap(map), [
    { time: bucket, open: 1.1, high: 1.14, low: 1.08, close: 1.13, volume: 8 },
  ]);
});
