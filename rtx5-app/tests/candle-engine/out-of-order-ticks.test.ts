import assert from 'node:assert/strict';
import test from 'node:test';

import { applyLiveCandleToCandleMap } from '../../src/domain/candles/series/liveCandleAggregator';
import { createCandleMap, materializeCandleMap } from '../../src/domain/candles/series/candleSeriesMerger';
import { secondsUtc } from '../support/candleTestUtils';

test('older backend live candle snapshots merge safely without rewinding close', () => {
  const bucket = secondsUtc(2024, 3, 22, 12, 1, 0);
  const map = createCandleMap();

  applyLiveCandleToCandleMap(
    map,
    { symbol: 'EURUSD', timeframe: 'M1', time: bucket + 40, open: 1.1, high: 1.15, low: 1.09, close: 1.14, volume: 10 },
    'M1',
  );
  const stale = applyLiveCandleToCandleMap(
    map,
    { symbol: 'EURUSD', timeframe: 'M1', time: bucket + 10, open: 1.1, high: 1.16, low: 1.08, close: 1.1, volume: 2 },
    'M1',
  );

  assert.equal(stale.ignored, false);
  assert.equal(stale.reason, 'merged_out_of_order_live_candle');
  assert.deepEqual(materializeCandleMap(map), [
    { time: bucket, open: 1.1, high: 1.16, low: 1.08, close: 1.14, volume: 10 },
  ]);
});

test('non-closing backend snapshot cannot reopen a closed live candle', () => {
  const bucket = secondsUtc(2024, 3, 22, 12, 1, 0);
  const map = createCandleMap();

  applyLiveCandleToCandleMap(
    map,
    {
      symbol: 'EURUSD',
      timeframe: 'M1',
      time: bucket + 55,
      open: 1.1,
      high: 1.15,
      low: 1.09,
      close: 1.14,
      volume: 10,
      closed: true,
    },
    'M1',
  );
  const reopen = applyLiveCandleToCandleMap(
    map,
    {
      symbol: 'EURUSD',
      timeframe: 'M1',
      time: bucket + 58,
      open: 1.1,
      high: 1.4,
      low: 0.8,
      close: 1.2,
      volume: 12,
      closed: false,
    },
    'M1',
  );

  assert.equal(reopen.ignored, true);
  assert.equal(reopen.reason, 'closed_live_candle');
  assert.deepEqual(materializeCandleMap(map), [
    { time: bucket, open: 1.1, high: 1.15, low: 1.09, close: 1.14, volume: 10 },
  ]);
});

test('backend live candle backfilling a missing bucket above history cutoff fills the gap', () => {
  // Backend is the source of truth for live candles. If the live tail is at T,
  // and backend later emits a candle for a missing bucket between historyCutoff
  // and T (a real gap-fill / backfill), the candle must be accepted — not
  // dropped as "stale". Same-bucket replays are still guarded by lastUpdateTime
  // and closed history is still protected by historyCutoffTime.
  const map = createCandleMap();
  const currentBucket = secondsUtc(2024, 3, 22, 12, 5, 0);

  applyLiveCandleToCandleMap(
    map,
    { symbol: 'EURUSD', timeframe: 'M1', time: currentBucket, open: 1.2, high: 1.22, low: 1.19, close: 1.21, volume: 5 },
    'M1',
  );
  const backfill = applyLiveCandleToCandleMap(
    map,
    { symbol: 'EURUSD', timeframe: 'M1', time: currentBucket - 120, open: 1.1, high: 1.12, low: 1.09, close: 1.11, volume: 4 },
    'M1',
  );

  assert.equal(backfill.ignored, false);
  assert.equal(backfill.changed, true);
  assert.deepEqual(
    materializeCandleMap(map).map((candle) => candle.time),
    [currentBucket - 120, currentBucket],
  );
});

test('backend live candle older than history cutoff is rejected even if it matches a known gap', () => {
  // The historyCutoffTime guard remains absolute: REST history is the only
  // authority for closed buckets at or below the cutoff. A backend live candle
  // claiming an older bucket must not rewrite closed history.
  const map = createCandleMap();
  const cutoff = secondsUtc(2024, 3, 22, 12, 5, 0);

  const stale = applyLiveCandleToCandleMap(
    map,
    { symbol: 'EURUSD', timeframe: 'M1', time: cutoff - 120, open: 1.1, high: 1.12, low: 1.09, close: 1.11, volume: 4 },
    'M1',
    { historyCutoffTime: cutoff },
  );

  assert.equal(stale.ignored, true);
  assert.equal(stale.reason, 'older_than_history_cutoff');
  assert.deepEqual(materializeCandleMap(map), []);
});
