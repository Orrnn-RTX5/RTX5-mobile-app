import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyLiveCandleToCandleMap,
  applyQuoteTickExtensionToCandleMap,
} from './liveCandleAggregator';
import type { LiveCandle, MutableCandle } from '../core/candleTypes';
import {
  getBucketStart,
  getExpectedNextCandleTime,
  SUPPORTED_TIMEFRAMES,
} from '../core/timeframeUtils';

const TIMEFRAME = 'M1';
const BUCKET = 1_699_999_980;

const buildEmptyMap = (): Map<number, MutableCandle> => new Map();

test('rejects backend live snapshots for the closed history cutoff bucket', () => {
  const candleMap = buildEmptyMap();
  const live: LiveCandle = {
    time: BUCKET + 5,
    open: 9,
    high: 9,
    low: 9,
    close: 9,
    volume: 1,
  };

  const result = applyLiveCandleToCandleMap(candleMap, live, TIMEFRAME, {
    historyCutoffTime: BUCKET,
  });

  assert.equal(result.ignored, true);
  assert.equal(result.changed, false);
  assert.equal(result.reason, 'older_than_history_cutoff');
  assert.equal(candleMap.size, 0);
});

test('first backend snapshot for a bucket writes broker OHLC unchanged', () => {
  const candleMap = buildEmptyMap();
  const result = applyLiveCandleToCandleMap(
    candleMap,
    { time: BUCKET, open: 1.0805, high: 1.0810, low: 1.0800, close: 1.0807, volume: 12, closed: false },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60 },
  );

  assert.equal(result.ignored, false);
  assert.deepEqual(result.candle, {
    time: BUCKET,
    open: 1.0805,
    high: 1.0810,
    low: 1.0800,
    close: 1.0807,
    volume: 12,
  });
});

test('backend update for the same bucket replaces previous broker OHLC', () => {
  const candleMap = buildEmptyMap();
  applyLiveCandleToCandleMap(
    candleMap,
    { time: BUCKET, open: 1.0805, high: 1.0810, low: 1.0800, close: 1.0807, volume: 12, closed: false },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60 },
  );

  const result = applyLiveCandleToCandleMap(
    candleMap,
    { time: BUCKET, open: 1.0806, high: 1.0815, low: 1.0802, close: 1.0812, volume: 18, closed: false },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60 },
  );

  assert.equal(result.ignored, false);
  assert.deepEqual(result.candle, {
    time: BUCKET,
    open: 1.0806,
    high: 1.0815,
    low: 1.0802,
    close: 1.0812,
    volume: 18,
  });
});

test('closing backend snapshot accepts broker OHLC verbatim', () => {
  const candleMap = buildEmptyMap();
  applyLiveCandleToCandleMap(
    candleMap,
    { time: BUCKET, open: 1.0805, high: 1.0810, low: 1.0800, close: 1.0807, volume: 12, closed: false },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60 },
  );

  const closingSnapshot: LiveCandle = {
    time: BUCKET,
    open: 1.0805,
    high: 1.0816,
    low: 1.0798,
    close: 1.0815,
    volume: 28,
    closed: true,
  };
  const result = applyLiveCandleToCandleMap(candleMap, closingSnapshot, TIMEFRAME, {
    historyCutoffTime: BUCKET - 60,
  });

  assert.equal(result.ignored, false);
  assert.equal(candleMap.get(BUCKET)?.closed, true);
  assert.deepEqual(result.candle, {
    time: BUCKET,
    open: 1.0805,
    high: 1.0816,
    low: 1.0798,
    close: 1.0815,
    volume: 28,
  });
});

test('non-closing backend snapshot cannot reopen a backend-closed live candle', () => {
  const candleMap = buildEmptyMap();
  applyLiveCandleToCandleMap(
    candleMap,
    { time: BUCKET, open: 1.0805, high: 1.0816, low: 1.0798, close: 1.0815, volume: 28, closed: true },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60 },
  );

  const result = applyLiveCandleToCandleMap(
    candleMap,
    { time: BUCKET, open: 1.0805, high: 1.0820, low: 1.0790, close: 1.0819, volume: 32, closed: false },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60 },
  );

  assert.equal(result.ignored, true);
  assert.equal(result.reason, 'closed_live_candle');
  assert.deepEqual(result.candle, {
    time: BUCKET,
    open: 1.0805,
    high: 1.0816,
    low: 1.0798,
    close: 1.0815,
    volume: 28,
  });
});

test('backend server_time prevents delayed forming snapshots from overwriting newer ones', () => {
  const candleMap = buildEmptyMap();
  applyLiveCandleToCandleMap(
    candleMap,
    {
      time: BUCKET,
      updateTime: BUCKET + 20,
      open: 1.0805,
      high: 1.0820,
      low: 1.0800,
      close: 1.0818,
      volume: 20,
      closed: false,
    },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60 },
  );

  const delayed = applyLiveCandleToCandleMap(
    candleMap,
    {
      time: BUCKET,
      updateTime: BUCKET + 10,
      open: 1.0805,
      high: 1.0810,
      low: 1.0802,
      close: 1.0808,
      volume: 12,
      closed: false,
    },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60 },
  );

  assert.equal(delayed.ignored, false);
  assert.equal(delayed.reason, 'merged_out_of_order_live_candle');
  assert.equal(delayed.candle?.close, 1.0818);
  assert.equal(delayed.candle?.high, 1.0820);
  assert.equal(candleMap.get(BUCKET)?.lastBackendUpdateTime, BUCKET + 20);
});

test('quote tick burst preserves every OHLC and volume contribution before render flush', () => {
  const candleMap = buildEmptyMap();
  const ticks = [
    { price: 1.0800, time: BUCKET + 1 },
    { price: 1.0818, time: BUCKET + 2 },
    { price: 1.0794, time: BUCKET + 3 },
    { price: 1.0811, time: BUCKET + 4 },
    { price: 1.0807, time: BUCKET + 5 },
  ];

  for (const tick of ticks) {
    const result = applyQuoteTickExtensionToCandleMap(
      candleMap,
      { ...tick, volume: 1 },
      TIMEFRAME,
      { historyCutoffTime: BUCKET - 60 },
    );
    assert.equal(result.ignored, false);
  }

  assert.deepEqual(candleMap.get(BUCKET) && {
    time: candleMap.get(BUCKET)?.time,
    open: candleMap.get(BUCKET)?.open,
    high: candleMap.get(BUCKET)?.high,
    low: candleMap.get(BUCKET)?.low,
    close: candleMap.get(BUCKET)?.close,
    volume: candleMap.get(BUCKET)?.volume,
  }, {
    time: BUCKET,
    open: 1.0800,
    high: 1.0818,
    low: 1.0794,
    close: 1.0807,
    volume: 5,
  });
});

test('first real flat no-volume quote opens the next bucket for every supported timeframe', () => {
  const referenceTime = Date.UTC(2026, 6, 27, 10, 7, 23) / 1000;

  for (const timeframe of SUPPORTED_TIMEFRAMES) {
    const candleMap = buildEmptyMap();
    const bucket = getBucketStart(referenceTime, timeframe);
    assert.notEqual(bucket, null, `${timeframe} must resolve a valid market bucket`);
    if (bucket === null) continue;

    const first = applyQuoteTickExtensionToCandleMap(
      candleMap,
      { price: 4175.6, time: bucket + 1 },
      timeframe,
      { historyCutoffTime: bucket - 1 },
    );
    const nextBucket = getExpectedNextCandleTime(bucket, timeframe);
    const boundaryQuote = applyQuoteTickExtensionToCandleMap(
      candleMap,
      { price: 4175.6, time: nextBucket + 5 },
      timeframe,
      { historyCutoffTime: bucket - 1, allowFlatNewBucket: true },
    );

    assert.equal(first.ignored, false, `${timeframe} first quote must be accepted`);
    assert.equal(boundaryQuote.ignored, false, `${timeframe} boundary quote must be accepted`);
    assert.equal(boundaryQuote.changed, true, `${timeframe} boundary quote must create a candle`);
    assert.equal(candleMap.has(nextBucket), true, `${timeframe} next market bucket must exist`);
    assert.deepEqual(boundaryQuote.candle, {
      time: nextBucket,
      open: 4175.6,
      high: 4175.6,
      low: 4175.6,
      close: 4175.6,
      volume: 0,
    });
  }
});

test('untrusted flat receipt heartbeat cannot open a bucket but a moved Bid still can', () => {
  const candleMap = buildEmptyMap();
  applyQuoteTickExtensionToCandleMap(
    candleMap,
    { price: 4175.6, time: BUCKET + 1 },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60 },
  );

  const nextBucket = BUCKET + 60;
  const flatHeartbeat = applyQuoteTickExtensionToCandleMap(
    candleMap,
    { price: 4175.6, time: nextBucket + 5 },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60, allowFlatNewBucket: false },
  );

  assert.equal(flatHeartbeat.ignored, true);
  assert.equal(flatHeartbeat.changed, false);
  assert.equal(flatHeartbeat.reason, 'untrusted_flat_quote_after_tail');
  assert.equal(candleMap.has(nextBucket), false);

  const movedBid = applyQuoteTickExtensionToCandleMap(
    candleMap,
    { price: 4175.7, time: nextBucket + 6 },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60, allowFlatNewBucket: false },
  );

  assert.equal(movedBid.ignored, false);
  assert.equal(movedBid.changed, true);
  assert.deepEqual(movedBid.candle, {
    time: nextBucket,
    open: 4175.7,
    high: 4175.7,
    low: 4175.7,
    close: 4175.7,
    volume: 0,
  });
});

test('identical same-bucket tick without explicit volume leaves candle values unchanged', () => {
  const candleMap = buildEmptyMap();
  const first = applyQuoteTickExtensionToCandleMap(
    candleMap,
    { price: 4175.6, time: BUCKET + 1 },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60 },
  );
  const beforeHeartbeat = { ...candleMap.get(BUCKET) };

  const heartbeat = applyQuoteTickExtensionToCandleMap(
    candleMap,
    { price: 4175.6, time: BUCKET + 2 },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60 },
  );

  assert.equal(first.changed, true);
  assert.equal(heartbeat.ignored, false);
  assert.equal(heartbeat.changed, false);
  assert.deepEqual(heartbeat.candle, {
    time: BUCKET,
    open: 4175.6,
    high: 4175.6,
    low: 4175.6,
    close: 4175.6,
    volume: 0,
  });
  assert.deepEqual(
    {
      open: candleMap.get(BUCKET)?.open,
      high: candleMap.get(BUCKET)?.high,
      low: candleMap.get(BUCKET)?.low,
      close: candleMap.get(BUCKET)?.close,
      volume: candleMap.get(BUCKET)?.volume,
    },
    {
      open: beforeHeartbeat.open,
      high: beforeHeartbeat.high,
      low: beforeHeartbeat.low,
      close: beforeHeartbeat.close,
      volume: beforeHeartbeat.volume,
    },
  );
});

test('identical same-bucket tick with explicit positive volume updates volume', () => {
  const candleMap = buildEmptyMap();
  applyQuoteTickExtensionToCandleMap(
    candleMap,
    { price: 4175.6, time: BUCKET + 1, volume: 2 },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60 },
  );

  const tick = applyQuoteTickExtensionToCandleMap(
    candleMap,
    { price: 4175.6, time: BUCKET + 2, volume: 3 },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60 },
  );

  assert.equal(tick.ignored, false);
  assert.equal(tick.changed, true);
  assert.equal(tick.candle?.volume, 5);
  assert.equal(candleMap.get(BUCKET)?.volume, 5);
});

test('quote tick high/low span expands candle wicks beyond close-only line', () => {
  const candleMap = buildEmptyMap();
  const first = applyQuoteTickExtensionToCandleMap(
    candleMap,
    { price: 1.1000, high: 1.1005, low: 1.0995, time: BUCKET + 1, volume: 1 },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60 },
  );
  const second = applyQuoteTickExtensionToCandleMap(
    candleMap,
    { price: 1.1002, high: 1.1010, low: 1.0990, time: BUCKET + 2, volume: 1 },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60 },
  );

  assert.equal(first.ignored, false);
  assert.equal(second.ignored, false);
  assert.equal(candleMap.get(BUCKET)?.open, 1.1000);
  assert.equal(candleMap.get(BUCKET)?.high, 1.1010);
  assert.equal(candleMap.get(BUCKET)?.low, 1.0990);
  assert.equal(candleMap.get(BUCKET)?.close, 1.1002);
});

test('stale non-closing server candle cannot overwrite fresher quote-driven active candle', () => {
  const candleMap = buildEmptyMap();
  applyQuoteTickExtensionToCandleMap(
    candleMap,
    { price: 1.0818, time: BUCKET + 20, volume: 1 },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60 },
  );

  const delayed = applyLiveCandleToCandleMap(
    candleMap,
    {
      time: BUCKET,
      updateTime: BUCKET + 10,
      open: 1.0800,
      high: 1.0805,
      low: 1.0798,
      close: 1.0801,
      volume: 10,
      closed: false,
    },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60 },
  );

  assert.equal(delayed.ignored, true);
  assert.equal(delayed.changed, false);
  assert.equal(delayed.reason, 'stale_server_candle_after_quote');
  assert.deepEqual(delayed.candle, {
    time: BUCKET,
    open: 1.0818,
    high: 1.0818,
    low: 1.0818,
    close: 1.0818,
    volume: 1,
  });
});

test('stale closing server candle cannot overwrite fresher quote-driven active candle', () => {
  const candleMap = buildEmptyMap();
  applyQuoteTickExtensionToCandleMap(
    candleMap,
    { price: 1.0818, time: BUCKET + 20, volume: 1 },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60 },
  );

  const delayed = applyLiveCandleToCandleMap(
    candleMap,
    {
      time: BUCKET,
      updateTime: BUCKET + 10,
      open: 1.0800,
      high: 1.0805,
      low: 1.0798,
      close: 1.0801,
      volume: 10,
      closed: true,
    },
    TIMEFRAME,
    { historyCutoffTime: BUCKET - 60 },
  );

  assert.equal(delayed.ignored, true);
  assert.equal(delayed.changed, false);
  assert.equal(delayed.reason, 'stale_server_candle_after_quote');
  assert.equal(candleMap.get(BUCKET)?.close, 1.0818);
  assert.equal(candleMap.get(BUCKET)?.closed, false);
});
