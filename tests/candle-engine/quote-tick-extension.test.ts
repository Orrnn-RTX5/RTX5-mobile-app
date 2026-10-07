/**
 * Active-candle extension via quote-tick bridge — pure-helper tests.
 *
 * Backends commonly publish candle messages only on bar-close (or on a slow
 * cadence), while real-time price movement within the active bar arrives via
 * the quote feed. Without bridging the quote tick into the active candle the
 * forming bar stays static while the bid/ask line moves above the chart.
 *
 * `applyQuoteTickExtensionToCandleMap` is the pure helper the engine wraps:
 *
 *   - Updates an existing backend-opened bucket when present.
 *   - Opens the current tick bucket when the quote feed is ahead of the
 *     candle socket, seeded entirely from the first accepted tick without
 *     fabricating any missing backend buckets.
 *   - Does not invent volume or report a candle-value change for identical
 *     same-bucket ticks unless the broker sends explicit positive volume.
 *   - Never modifies closed history (gated by `historyCutoffTime`).
 *   - Fresh backend `applyLiveCandleToCandleMap` calls can own the latest
 *     close and OHLC geometry when their update time is newer than quote ticks.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyLiveCandleToCandleMap,
  applyQuoteTickExtensionToCandleMap,
} from '../../src/domain/candles/series/liveCandleAggregator';
import {
  createCandleMap,
  materializeCandleMap,
} from '../../src/domain/candles/series/candleSeriesMerger';
import {
  makeBackendLiveCandle,
  makeTrustedHistoryCandle,
  secondsUtc,
} from '../support/candleTestUtils';

const t1000 = secondsUtc(2024, 3, 22, 10, 0, 0);
const t1001 = secondsUtc(2024, 3, 22, 10, 1, 0);
const t1002 = secondsUtc(2024, 3, 22, 10, 2, 0);

test('quote tick extends close of an existing live candle in the active bucket', () => {
  const map = createCandleMap();
  applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(t1001, { open: 1.105, high: 1.108, low: 1.102, close: 1.106 }),
    'M1',
  );

  const result = applyQuoteTickExtensionToCandleMap(
    map,
    { price: 1.115, time: t1001 + 30 },
    'M1',
    { historyCutoffTime: t1000 },
  );

  assert.equal(result.ignored, false);
  assert.equal(result.changed, true);
  const candles = materializeCandleMap(map);
  const active = candles[candles.length - 1];
  assert.equal(active.time, t1001);
  assert.equal(active.close, 1.115);
  assert.equal(active.high, 1.115);
  // Low stays at backend-supplied minimum.
  assert.equal(active.low, 1.102);
});

test('quote tick widens wick high and low symmetrically as price swings', () => {
  const map = createCandleMap();
  applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(t1001, { open: 1.1, high: 1.1, low: 1.1, close: 1.1 }),
    'M1',
  );

  applyQuoteTickExtensionToCandleMap(map, { price: 1.12, time: t1001 + 5 }, 'M1');
  applyQuoteTickExtensionToCandleMap(map, { price: 1.08, time: t1001 + 10 }, 'M1');
  applyQuoteTickExtensionToCandleMap(map, { price: 1.105, time: t1001 + 15 }, 'M1');

  const candles = materializeCandleMap(map);
  const active = candles[candles.length - 1];
  assert.equal(active.time, t1001);
  assert.equal(active.high, 1.12);
  assert.equal(active.low, 1.08);
  assert.equal(active.close, 1.105);
});

test('quote tick falls back to seeding from REST current candle when no live candle exists yet', () => {
  const map = createCandleMap();
  // No backend live message yet; REST returned a "current" candle at t1001.
  const restCurrent = {
    time: t1001,
    open: 1.105,
    high: 1.107,
    low: 1.103,
    close: 1.106,
    volume: 0,
  };

  const result = applyQuoteTickExtensionToCandleMap(
    map,
    { price: 1.115, time: t1001 + 25 },
    'M1',
    { historyCutoffTime: t1000, latestHistoryCandle: restCurrent },
  );

  assert.equal(result.ignored, false);
  assert.equal(result.changed, true);
  const candles = materializeCandleMap(map);
  const active = candles[candles.length - 1];
  assert.equal(active.time, t1001);
  assert.equal(active.close, 1.115);
  assert.equal(active.high, 1.115);
  // Low stays at REST-supplied minimum.
  assert.equal(active.low, 1.103);
});

test('first accepted tick seeds the next contiguous live bucket with O=H=L=C=tick', () => {
  const map = createCandleMap([makeTrustedHistoryCandle(t1000, { close: 1.105 })]);

  const result = applyQuoteTickExtensionToCandleMap(
    map,
    { price: 1.115, time: t1001 + 30 },
    'M1',
    { historyCutoffTime: t1000 },
  );

  assert.equal(result.ignored, false);
  assert.equal(result.changed, true);
  const candles = materializeCandleMap(map);
  assert.deepEqual(candles.map((c) => c.time), [t1000, t1001]);
  assert.deepEqual(candles[1], {
    time: t1001,
    open: 1.115,
    high: 1.115,
    low: 1.115,
    close: 1.115,
    volume: 0,
  });
});

test('backend live candle snapshot overwrites quote-observed wick extremes', () => {
  const map = createCandleMap();
  applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(t1001, { open: 1.105, high: 1.106, low: 1.104, close: 1.105 }),
    'M1',
  );

  // Quote ticks pump the close around 1.110.
  applyQuoteTickExtensionToCandleMap(map, { price: 1.110, time: t1001 + 5 }, 'M1');
  applyQuoteTickExtensionToCandleMap(map, { price: 1.112, time: t1001 + 10 }, 'M1');

  // Backend then sends an authoritative close with fresher update time.
  applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(t1001, {
      open: 1.105,
      high: 1.108,
      low: 1.103,
      close: 1.107,
      updateTime: t1001 + 15,
    }),
    'M1',
  );

  const candles = materializeCandleMap(map);
  const active = candles[candles.length - 1];
  // Backend snapshots are authoritative and correct quote-expanded geometry.
  assert.equal(active.time, t1001);
  assert.equal(active.open, 1.105);
  assert.equal(active.high, 1.108);
  assert.equal(active.low, 1.103);
  assert.equal(active.close, 1.107);
});

test('quote tick falls back to tick-open candle when same-bucket REST geometry is stale', () => {
  const map = createCandleMap();
  const staleRestCurrent = {
    time: t1001,
    open: 48_050,
    high: 48_250,
    low: 47_900,
    close: 48_100,
    volume: 0,
  };

  const result = applyQuoteTickExtensionToCandleMap(
    map,
    { price: 81_224.54, time: t1001 + 25 },
    'M1',
    { historyCutoffTime: t1000, latestHistoryCandle: staleRestCurrent },
  );

  assert.equal(result.ignored, false);
  assert.equal(result.changed, true);
  assert.deepEqual(materializeCandleMap(map), [
    {
      time: t1001,
      open: 81_224.54,
      high: 81_224.54,
      low: 81_224.54,
      close: 81_224.54,
      volume: 0,
    },
  ]);
});

test('quote tick for a closed history bucket is rejected (closed history is immutable)', () => {
  const map = createCandleMap([
    makeTrustedHistoryCandle(t1000, { open: 1.1, high: 1.11, low: 1.09, close: 1.105 }),
    makeTrustedHistoryCandle(t1001, { open: 1.105, high: 1.107, low: 1.103, close: 1.106 }),
  ]);

  const result = applyQuoteTickExtensionToCandleMap(
    map,
    { price: 1.999, time: t1000 + 30 },
    'M1',
    { historyCutoffTime: t1001 },
  );

  assert.equal(result.ignored, true);
  assert.equal(result.reason, 'older_than_history_cutoff');
  // History unchanged: both closed candles intact.
  const candles = materializeCandleMap(map);
  const closedFirst = candles.find((c) => c.time === t1000);
  assert.ok(closedFirst);
  assert.equal(closedFirst!.close, 1.105);
  assert.equal(closedFirst!.high, 1.11);
  assert.equal(closedFirst!.low, 1.09);

  const cutoffBucket = applyQuoteTickExtensionToCandleMap(
    map,
    { price: 2.111, time: t1001 + 30 },
    'M1',
    { historyCutoffTime: t1001 },
  );

  assert.equal(cutoffBucket.ignored, true);
  assert.equal(cutoffBucket.reason, 'older_than_history_cutoff');
  assert.equal(materializeCandleMap(map).find((c) => c.time === t1001)?.close, 1.106);
});

test('quote tick with invalid price is dropped without mutating the map', () => {
  const map = createCandleMap();
  applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(t1001, { open: 1.105, high: 1.107, low: 1.103, close: 1.106 }),
    'M1',
  );

  for (const bad of [NaN, -1, 0, Infinity, -Infinity]) {
    const result = applyQuoteTickExtensionToCandleMap(
      map,
      { price: bad, time: t1001 + 5 },
      'M1',
    );
    assert.equal(result.ignored, true);
    assert.equal(result.reason, 'invalid_price');
  }

  const candles = materializeCandleMap(map);
  const active = candles[candles.length - 1];
  assert.equal(active.close, 1.106);
  assert.equal(active.high, 1.107);
  assert.equal(active.low, 1.103);
});

test('quote tick with invalid timestamp is dropped without mutating the map', () => {
  const map = createCandleMap();
  applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(t1001, { open: 1.105, high: 1.107, low: 1.103, close: 1.106 }),
    'M1',
  );

  for (const bad of [null, undefined, '', 'invalid', NaN, -1]) {
    const result = applyQuoteTickExtensionToCandleMap(
      map,
      { price: 1.115, time: bad },
      'M1',
    );
    assert.equal(result.ignored, true);
    assert.equal(result.reason, 'invalid_timestamp');
  }

  const candles = materializeCandleMap(map);
  const active = candles[candles.length - 1];
  assert.equal(active.close, 1.106);
});

test('repeated identical same-bucket ticks without explicit volume leave candle values unchanged', () => {
  const map = createCandleMap();
  applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(t1001, { open: 1.105, high: 1.106, low: 1.104, close: 1.106 }),
    'M1',
  );

  // This tick is identical to the backend candle and carries no broker volume.
  const first = applyQuoteTickExtensionToCandleMap(
    map,
    { price: 1.106, time: t1001 + 5 },
    'M1',
  );
  assert.equal(first.ignored, false);
  assert.equal(first.changed, false);

  // Subsequent no-volume heartbeats also avoid scheduling a candle repaint.
  for (let i = 0; i < 5; i += 1) {
    const result = applyQuoteTickExtensionToCandleMap(
      map,
      { price: 1.106, time: t1001 + 6 + i },
      'M1',
    );
    assert.equal(result.ignored, false);
    assert.equal(result.changed, false);
  }

  const active = materializeCandleMap(map).find((candle) => candle.time === t1001);
  assert.ok(active);
  assert.equal(active.open, 1.105);
  assert.equal(active.high, 1.106);
  assert.equal(active.low, 1.104);
  assert.equal(active.close, 1.106);
  assert.equal(active.volume, 10);
});

test('identical same-bucket tick with explicit positive volume updates only volume', () => {
  const map = createCandleMap();
  applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(t1001, {
      open: 1.105,
      high: 1.106,
      low: 1.104,
      close: 1.106,
      volume: 10,
    }),
    'M1',
  );

  const result = applyQuoteTickExtensionToCandleMap(
    map,
    { price: 1.106, time: t1001 + 5, volume: 3 },
    'M1',
  );

  assert.equal(result.ignored, false);
  assert.equal(result.changed, true);
  assert.deepEqual(result.candle, {
    time: t1001,
    open: 1.105,
    high: 1.106,
    low: 1.104,
    close: 1.106,
    volume: 13,
  });
});

test('delayed quote tick cannot rewind close or create a false wick', () => {
  const map = createCandleMap();
  applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(t1001, { open: 1.105, high: 1.106, low: 1.104, close: 1.106 }),
    'M1',
  );

  const fresh = applyQuoteTickExtensionToCandleMap(map, { price: 1.112, time: t1001 + 40 }, 'M1');
  const delayed = applyQuoteTickExtensionToCandleMap(map, { price: 1.2, time: t1001 + 20 }, 'M1');

  assert.equal(fresh.ignored, false);
  assert.equal(delayed.ignored, true);
  assert.equal(delayed.reason, 'stale_quote_tick');

  const candles = materializeCandleMap(map);
  const active = candles[candles.length - 1];
  assert.equal(active.close, 1.112);
  assert.equal(active.high, 1.112);
  assert.equal(active.low, 1.104);
});

test('quote tick cannot reopen a backend-closed live candle', () => {
  const map = createCandleMap();
  applyLiveCandleToCandleMap(
    map,
    { time: t1001, open: 1.105, high: 1.108, low: 1.103, close: 1.107, volume: 0, closed: true },
    'M1',
  );

  const result = applyQuoteTickExtensionToCandleMap(map, { price: 1.2, time: t1001 + 50 }, 'M1');

  assert.equal(result.ignored, true);
  assert.equal(result.reason, 'closed_live_candle');
  assert.deepEqual(materializeCandleMap(map), [
    {
      time: t1001,
      open: 1.105,
      high: 1.108,
      low: 1.103,
      close: 1.107,
      volume: 0,
    },
  ]);
});

test('quote tick preserves wick high once widened — subsequent lower ticks do not shrink it', () => {
  const map = createCandleMap();
  applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(t1001, { open: 1.1, high: 1.1, low: 1.1, close: 1.1 }),
    'M1',
  );

  applyQuoteTickExtensionToCandleMap(map, { price: 1.15, time: t1001 + 5 }, 'M1');
  applyQuoteTickExtensionToCandleMap(map, { price: 1.05, time: t1001 + 10 }, 'M1');
  applyQuoteTickExtensionToCandleMap(map, { price: 1.10, time: t1001 + 15 }, 'M1');

  const candles = materializeCandleMap(map);
  const active = candles[candles.length - 1];
  assert.equal(active.high, 1.15);
  assert.equal(active.low, 1.05);
  assert.equal(active.close, 1.10);
});

test('quote tick reaching the next live-tail bucket keeps visible candles generating', () => {
  // History up to t1000. Live has t1001 as the active bucket. Tick lands in
  // t1002 before the backend candle socket emits that bucket.
  const map = createCandleMap([makeTrustedHistoryCandle(t1000, { close: 1.105 })]);
  applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(t1001, { open: 1.105, high: 1.107, low: 1.103, close: 1.106 }),
    'M1',
    { historyCutoffTime: t1000 },
  );

  const result = applyQuoteTickExtensionToCandleMap(
    map,
    { price: 1.110, time: t1002 + 5 },
    'M1',
    { historyCutoffTime: t1000 },
  );

  assert.equal(result.ignored, false);
  const candles = materializeCandleMap(map);
  assert.deepEqual(candles.map((c) => c.time), [t1000, t1001, t1002]);
  assert.deepEqual(candles[2], {
    time: t1002,
    open: 1.11,
    high: 1.11,
    low: 1.11,
    close: 1.11,
    volume: 0,
  });
});

test('quote tick far ahead opens only the current bucket and preserves backend gaps', () => {
  const map = createCandleMap([makeTrustedHistoryCandle(t1000, { close: 1.105 })]);

  const result = applyQuoteTickExtensionToCandleMap(
    map,
    { price: 1.11, time: t1002 + 5 },
    'M1',
    { historyCutoffTime: t1000 },
  );

  assert.equal(result.ignored, false);
  assert.equal(result.changed, true);
  const candles = materializeCandleMap(map);
  assert.deepEqual(candles.map((c) => c.time), [t1000, t1002]);
  assert.deepEqual(candles[1], {
    time: t1002,
    open: 1.11,
    high: 1.11,
    low: 1.11,
    close: 1.11,
    volume: 0,
  });
});

test('quote tick across multiple subsequent backend snapshots keeps latest backend geometry', () => {
  // Simulates the full lifecycle: backend creates a bucket, ticks extend close,
  // and later backend snapshots correct the temporary quote-expanded geometry.
  const map = createCandleMap();
  applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(t1001, { open: 1.0, high: 1.0, low: 1.0, close: 1.0 }),
    'M1',
  );

  applyQuoteTickExtensionToCandleMap(map, { price: 1.5, time: t1001 + 5 }, 'M1');
  applyQuoteTickExtensionToCandleMap(map, { price: 0.5, time: t1001 + 10 }, 'M1');

  // Backend snapshot 2: updates close and corrects quote-observed wicks.
  applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(t1001, { open: 1.0, high: 1.05, low: 0.95, close: 1.02, updateTime: t1001 + 12 }),
    'M1',
  );

  let candles = materializeCandleMap(map);
  let active = candles[candles.length - 1];
  assert.equal(active.high, 1.05);
  assert.equal(active.low, 0.95);
  assert.equal(active.close, 1.02);

  // Now ticks again.
  applyQuoteTickExtensionToCandleMap(map, { price: 1.10, time: t1001 + 15 }, 'M1');
  candles = materializeCandleMap(map);
  active = candles[candles.length - 1];
  assert.equal(active.close, 1.10);
  assert.equal(active.high, 1.10);
  assert.equal(active.low, 0.95);

  // Backend snapshot 3: close and geometry move again from backend authority.
  applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(t1001, { open: 1.0, high: 1.08, low: 0.98, close: 1.04, updateTime: t1001 + 20 }),
    'M1',
  );
  candles = materializeCandleMap(map);
  active = candles[candles.length - 1];
  assert.equal(active.high, 1.08);
  assert.equal(active.low, 0.98);
  assert.equal(active.close, 1.04);
});
