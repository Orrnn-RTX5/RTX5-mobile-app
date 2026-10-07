import assert from 'node:assert/strict';
import test from 'node:test';

import { convertCandlesForChart } from '../../src/domain/candles/normalization/chartAdapter';
import { createCandleMap, materializeCandleMap } from '../../src/domain/candles/series/candleSeriesMerger';
import {
  aggregateTickToCandleMap,
  normalizeLiveTick,
  type NormalizedLiveTick,
} from '../../src/domain/candles/series/tickCandleAggregator';
import { getBucketStart, normalizeTimestampToSeconds } from '../../src/domain/candles/core/timeframeUtils';
import {
  assertNoDuplicateCandleTimes,
  assertValidCandleSeries,
  makeCandle,
  secondsUtc,
} from '../support/candleTestUtils';

const base = secondsUtc(2024, 3, 22, 10, 1, 0);

const normalizeRequiredTick = (raw: unknown, timeframe = 'M1'): NormalizedLiveTick => {
  const tick = normalizeLiveTick(raw, timeframe, { expectedSymbol: 'EURUSD', expectedTimeframe: timeframe });
  assert.ok(tick, 'tick should normalize');
  return tick;
};

test('live tick normalization accepts seconds and milliseconds without changing the bucket', () => {
  const secondsTick = normalizeRequiredTick({ symbol: 'EURUSD', timestamp: base + 10, price: 109 });
  const millisecondsTick = normalizeRequiredTick({ symbol: 'EURUSD', timestamp: (base + 10) * 1000, price: 109 });

  assert.equal(secondsTick.time, base + 10);
  assert.equal(millisecondsTick.time, base + 10);
  assert.equal(secondsTick.bucketTime, base);
  assert.equal(millisecondsTick.bucketTime, base);
  assert.equal(getBucketStart((base + 10) * 1000, 'M1'), base);
  assert.equal(normalizeTimestampToSeconds((base + 10) * 1000), base + 10);
});

test('timestamp unit normalization does not create false gaps', () => {
  const oneMinute = 60;
  const first = normalizeRequiredTick({ symbol: 'EURUSD', timestamp: base, price: 100 });
  const second = normalizeRequiredTick({ symbol: 'EURUSD', timestamp: (base + oneMinute) * 1000, price: 101 });

  assert.deepEqual([first.bucketTime, second.bucketTime], [base, base + oneMinute]);
});

test('live tick normalization rejects invalid timestamp and missing price without inventing a price', () => {
  assert.equal(normalizeLiveTick({ symbol: 'EURUSD', timestamp: 'bad-date', price: 109 }, 'M1'), null);
  assert.equal(normalizeLiveTick({ symbol: 'EURUSD', timestamp: null, price: 109 }, 'M1'), null);
  assert.equal(normalizeLiveTick({ symbol: 'EURUSD', timestamp: base + 10 }, 'M1'), null);
  assert.equal(normalizeLiveTick({ symbol: 'EURUSD', timestamp: base + 10, bid: null, ask: undefined }, 'M1'), null);
  assert.equal(normalizeLiveTick({ symbol: 'EURUSD', timestamp: base + 10, price: Number.NaN }, 'M1'), null);
  assert.equal(normalizeLiveTick({ symbol: 'EURUSD', timestamp: base + 10, price: Number.POSITIVE_INFINITY }, 'M1'), null);
});

test('live tick price is taken only from supported backend fields in deterministic priority', () => {
  assert.equal(normalizeRequiredTick({ symbol: 'EURUSD', timestamp: base + 10, price: 109, bid: 108 })?.field, 'price');
  assert.equal(normalizeRequiredTick({ symbol: 'EURUSD', timestamp: base + 10, bid: 108, ask: 109 })?.field, 'bid');
  assert.equal(normalizeRequiredTick({ symbol: 'EURUSD', timestamp: base + 10, ask: 109, mid: 108.5 })?.field, 'ask');
  assert.equal(normalizeRequiredTick({ symbol: 'EURUSD', timestamp: base + 10, mid: 108.5, last: 108.4 })?.field, 'mid');
  assert.equal(normalizeRequiredTick({ symbol: 'EURUSD', timestamp: base + 10, last: 108.4 })?.field, 'last');
});

test('wrong symbol and wrong timeframe live ticks are ignored during normalization', () => {
  assert.equal(
    normalizeLiveTick({ symbol: 'GBPUSD', timeframe: 'M1', timestamp: base + 10, price: 109 }, 'M1', {
      expectedSymbol: 'EURUSD',
      expectedTimeframe: 'M1',
    }),
    null,
  );
  assert.equal(
    normalizeLiveTick({ symbol: 'EURUSD', timeframe: 'M5', timestamp: base + 10, price: 109 }, 'M1', {
      expectedSymbol: 'EURUSD',
      expectedTimeframe: 'M1',
    }),
    null,
  );
});

test('first tick in bucket creates a valid OHLC candle', () => {
  const map = createCandleMap();
  const result = aggregateTickToCandleMap(map, normalizeRequiredTick({ symbol: 'EURUSD', timestamp: base + 10, price: 109 }), {
    expectedSymbol: 'EURUSD',
    expectedTimeframe: 'M1',
  });

  assert.equal(result.ignored, false);
  assert.deepEqual(result.candle, {
    time: base,
    open: 109,
    high: 109,
    low: 109,
    close: 109,
    volume: 0,
  });
});

test('same bucket ticks update high low and close while preserving open', () => {
  const map = createCandleMap([
    makeCandle(base, {
      open: 105,
      high: 108,
      low: 101,
      close: 102,
    }),
  ]);

  aggregateTickToCandleMap(map, normalizeRequiredTick({ symbol: 'EURUSD', timestamp: base + 10, price: 109 }), {
    expectedSymbol: 'EURUSD',
    expectedTimeframe: 'M1',
  });
  aggregateTickToCandleMap(map, normalizeRequiredTick({ symbol: 'EURUSD', timestamp: base + 30, price: 99 }), {
    expectedSymbol: 'EURUSD',
    expectedTimeframe: 'M1',
  });

  assert.deepEqual(materializeCandleMap(map), [
    {
      time: base,
      open: 105,
      high: 109,
      low: 99,
      close: 99,
      volume: 10,
    },
  ]);
});

test('boundary tick exactly at new bucket starts a new candle', () => {
  const map = createCandleMap([
    makeCandle(base, {
      open: 105,
      high: 108,
      low: 101,
      close: 102,
    }),
  ]);

  const beforeBoundary = aggregateTickToCandleMap(
    map,
    normalizeRequiredTick({ symbol: 'EURUSD', timestamp: base + 59, price: 104 }),
    { expectedSymbol: 'EURUSD', expectedTimeframe: 'M1' },
  );
  const atBoundary = aggregateTickToCandleMap(
    map,
    normalizeRequiredTick({ symbol: 'EURUSD', timestamp: base + 60, price: 103 }),
    { expectedSymbol: 'EURUSD', expectedTimeframe: 'M1' },
  );

  assert.equal(beforeBoundary.candle?.time, base);
  assert.equal(atBoundary.candle?.time, base + 60);
  assert.deepEqual(materializeCandleMap(map).map((candle) => candle.time), [base, base + 60]);
  assertNoDuplicateCandleTimes(materializeCandleMap(map));
});

test('out of order tick handling is deterministic and does not mutate newer candle state', () => {
  const map = createCandleMap();

  aggregateTickToCandleMap(map, normalizeRequiredTick({ symbol: 'EURUSD', timestamp: base + 40, price: 100 }), {
    expectedSymbol: 'EURUSD',
    expectedTimeframe: 'M1',
  });
  const stale = aggregateTickToCandleMap(
    map,
    normalizeRequiredTick({ symbol: 'EURUSD', timestamp: base + 20, price: 120 }),
    { expectedSymbol: 'EURUSD', expectedTimeframe: 'M1' },
  );

  assert.equal(stale.ignored, true);
  assert.equal(stale.reason, 'stale_tick');
  assert.deepEqual(materializeCandleMap(map), [
    {
      time: base,
      open: 100,
      high: 100,
      low: 100,
      close: 100,
      volume: 0,
    },
  ]);
});

test('older tick in a missing historical bucket is ignored instead of creating a late artificial candle', () => {
  const map = createCandleMap([
    makeCandle(base, { open: 100, high: 110, low: 95, close: 105 }),
    makeCandle(base + 120, { open: 103, high: 106, low: 100, close: 104 }),
  ]);

  const result = aggregateTickToCandleMap(
    map,
    normalizeRequiredTick({ symbol: 'EURUSD', timestamp: base + 60, price: 102 }),
    { expectedSymbol: 'EURUSD', expectedTimeframe: 'M1' },
  );

  assert.equal(result.ignored, true);
  assert.equal(result.reason, 'late_missing_bucket');
  assert.deepEqual(materializeCandleMap(map).map((candle) => candle.time), [base, base + 120]);
});

test('tick at the closed history cutoff is ignored', () => {
  const map = createCandleMap([
    makeCandle(base, { open: 100, high: 110, low: 95, close: 105 }),
  ]);

  const result = aggregateTickToCandleMap(
    map,
    normalizeRequiredTick({ symbol: 'EURUSD', timestamp: base + 30, price: 120 }),
    { expectedSymbol: 'EURUSD', expectedTimeframe: 'M1', historyCutoffTime: base },
  );

  assert.equal(result.ignored, true);
  assert.equal(result.reason, 'older_than_history_cutoff');
  assert.deepEqual(materializeCandleMap(map), [
    makeCandle(base, { open: 100, high: 110, low: 95, close: 105 }),
  ]);
});

test('wick high and low are preserved through tick aggregation and chart adapter conversion', () => {
  const map = createCandleMap();
  aggregateTickToCandleMap(map, normalizeRequiredTick({ symbol: 'EURUSD', timestamp: base + 1, price: 100 }), {
    expectedSymbol: 'EURUSD',
    expectedTimeframe: 'M1',
  });
  aggregateTickToCandleMap(map, normalizeRequiredTick({ symbol: 'EURUSD', timestamp: base + 2, price: 120 }), {
    expectedSymbol: 'EURUSD',
    expectedTimeframe: 'M1',
  });
  aggregateTickToCandleMap(map, normalizeRequiredTick({ symbol: 'EURUSD', timestamp: base + 3, price: 90 }), {
    expectedSymbol: 'EURUSD',
    expectedTimeframe: 'M1',
  });
  aggregateTickToCandleMap(map, normalizeRequiredTick({ symbol: 'EURUSD', timestamp: base + 4, price: 100 }), {
    expectedSymbol: 'EURUSD',
    expectedTimeframe: 'M1',
  });

  const candle = materializeCandleMap(map)[0];
  assert.deepEqual(candle, {
    time: base,
    open: 100,
    high: 120,
    low: 90,
    close: 100,
    volume: 0,
  });
  assert.deepEqual(convertCandlesForChart([candle]), [
    {
      time: base,
      open: 100,
      high: 120,
      low: 90,
      close: 100,
      volume: 0,
    },
  ]);
});

test('large tick aggregation uses indexed candle map and keeps exact output stable', () => {
  const map = createCandleMap();
  const count = 10_000;

  for (let index = 0; index < count; index += 1) {
    const tick = normalizeRequiredTick({
      symbol: 'EURUSD',
      timestamp: base + index * 60,
      price: 100 + index / 1000,
    });
    aggregateTickToCandleMap(map, tick, { expectedSymbol: 'EURUSD', expectedTimeframe: 'M1' });
  }

  const candles = materializeCandleMap(map);
  assert.equal(candles.length, count);
  assert.equal(candles[0].time, base);
  assert.equal(candles[0].open, 100);
  assert.equal(candles[count - 1].time, base + (count - 1) * 60);
  assert.equal(candles[count - 1].close, 100 + (count - 1) / 1000);
  assertValidCandleSeries(candles);
});

