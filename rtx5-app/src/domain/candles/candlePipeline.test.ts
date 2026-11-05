import test from 'node:test';
import assert from 'node:assert/strict';

import { validateCandle } from './core/candleValidator';
import type { Candle } from './core/candleTypes';
import {
  getBucketStart,
  normalizeSymbol,
  normalizeTimeframe,
  normalizeTimeframeStrict,
  SUPPORTED_TIMEFRAMES,
} from './core/timeframeUtils';
import { normalizeHistoryCandle, normalizeLiveCandle } from './normalization/candleNormalizer';
import { applyLiveCandleToCandleMap } from './series/liveCandleAggregator';
import { createCandleMap, materializeCandleMap, sortAndDedupeCandles } from './series/candleSeriesMerger';
import { normalizeCandleSeries } from './core/candles';
import { buildRestHistorySeedCandles, splitRestHistoryCandles } from './core/candleProvenance';

const candle = (time: number, close = 1.1): Candle => ({
  time,
  open: close,
  high: close,
  low: close,
  close,
  volume: 0,
});

test('normalizes backend history aliases and rejects invalid OHLC', () => {
  const normalized = normalizeHistoryCandle({
    t: 1_713_744_000_000,
    o: '1.10',
    h: '1.12',
    l: '1.09',
    c: '1.11',
    v: '7',
  });

  assert.deepEqual(normalized, {
    time: 1_713_744_000,
    open: 1.1,
    high: 1.12,
    low: 1.09,
    close: 1.11,
    volume: 7,
  });

  // Backend geometry errors (high < open/close) are rejected so the
  // frontend never invents a repaired OHLC candle for the renderer.
  assert.equal(
    normalizeHistoryCandle({
      t: 1_713_744_000,
      o: 1.1,
      h: 1.09,
      l: 1.08,
      c: 1.11,
    }),
    null,
  );

  // A truly invalid candle (NaN field) is rejected.
  assert.equal(
    normalizeHistoryCandle({ t: 1_713_744_000, o: NaN, h: 1, l: 1, c: 1 }),
    null,
  );
});

test('normalizes backend live candle symbol and timeframe metadata', () => {
  assert.deepEqual(
    normalizeLiveCandle({
      symbol: 'EURUSDm',
      timeframe: 'm1',
      time: 1_713_744_000_000,
      open: '1.2340',
      high: '1.2350',
      low: '1.2330',
      close: '1.2345',
      volume: '5',
    }),
    {
      symbol: 'EURUSDM',
      timeframe: 'M1',
      time: 1_713_744_000,
      open: 1.234,
      high: 1.235,
      low: 1.233,
      close: 1.2345,
      volume: 5,
    },
  );

  // Backend geometry errors (high < open) are rejected, not repaired.
  assert.equal(
    normalizeLiveCandle({
      symbol: 'EURUSD',
      timeframe: 'M1',
      time: 1,
      open: 1.2,
      high: 1.1,
      low: 1,
      close: 1.15,
    }),
    null,
  );

  // A truly invalid candle (missing OHLC field) is rejected.
  assert.equal(
    normalizeLiveCandle({ symbol: 'EURUSD', timeframe: 'M1', time: 1, open: NaN, high: 1, low: 1, close: 1 }),
    null,
  );
});

test('does not use backend update timestamps as candle bucket time', () => {
  assert.equal(
    normalizeLiveCandle({
      symbol: 'EURUSD',
      timeframe: 'M1',
      server_time: 1_713_744_012,
      serverTime: 1_713_744_013,
      open: 1.234,
      high: 1.235,
      low: 1.233,
      close: 1.2345,
      volume: 5,
    }),
    null,
  );
  assert.equal(
    normalizeHistoryCandle({
      timestamp: 1_713_744_000,
      open: 1.234,
      high: 1.235,
      low: 1.233,
      close: 1.2345,
      volume: 5,
    }),
    null,
  );
});

test('preserves backend closed flags through REST history normalization', () => {
  const normalized = normalizeCandleSeries(
    [
      { time: 60, open: 1.1, high: 1.2, low: 1.0, close: 1.15, closed: true },
      { time: 120, open: 1.15, high: 1.25, low: 1.1, close: 1.2, closed: true },
      { time: 180, open: 1.2, high: 1.28, low: 1.18, close: 1.24, closed: true },
    ],
    'M1',
  );
  const { closedHistory, currentCandle } = splitRestHistoryCandles(normalized, 'M1', 'bid');

  assert.deepEqual(closedHistory.map((item) => item.time), [60, 120, 180]);
  assert.equal(currentCandle, null);
});

test('preserves backend open current-candle flags through REST history normalization', () => {
  const normalized = normalizeCandleSeries(
    [
      { time: 60, open: 1.1, high: 1.2, low: 1.0, close: 1.15, closed: true },
      { time: 120, open: 1.15, high: 1.25, low: 1.1, close: 1.2, closed: false },
    ],
    'M1',
  );
  const { closedHistory, currentCandle } = splitRestHistoryCandles(normalized, 'M1', 'bid');

  assert.deepEqual(closedHistory.map((item) => item.time), [60]);
  assert.equal(currentCandle?.time, 120);
});

test('bucket utilities are deterministic and UTC aligned', () => {
  assert.equal(normalizeTimeframe('1m'), 'M1');
  assert.equal(normalizeTimeframe('1M'), 'MN');
  assert.equal(getBucketStart(Date.UTC(2024, 3, 22, 12, 34, 56), '15m'), 1_713_789_000);
  assert.equal(getBucketStart(Date.UTC(2024, 3, 22, 12, 34, 56), '1d'), 1_713_744_000);
  assert.equal(getBucketStart(Date.UTC(2024, 3, 24, 12, 0, 0), '1w'), 1_713_744_000);
  assert.equal(getBucketStart(Date.UTC(2024, 3, 24, 12, 0, 0), '1M'), 1_711_929_600);
});

test('strict timeframe normalization rejects unknown backend tokens', () => {
  assert.equal(normalizeTimeframeStrict('M3'), null);
  assert.equal(normalizeTimeframeStrict('3m'), null);
  assert.equal(normalizeTimeframeStrict('H2'), null);
  assert.equal(normalizeTimeframeStrict(120), null);
  assert.equal(normalizeTimeframeStrict('bad-period'), null);
  assert.equal(normalizeTimeframe('bad-period'), 'M1');

  const liveCandle = normalizeLiveCandle({
    time: 1_713_744_000,
    open: 1,
    high: 1,
    low: 1,
    close: 1,
    timeframe: 'bad-period',
  });

  assert.equal(liveCandle?.timeframe, undefined);
});

test('sortAndDedupeCandles keeps one valid candle per timestamp and merges duplicate OHLC', () => {
  const result = sortAndDedupeCandles([
    candle(120, 1.2),
    { ...candle(60, 1.1), high: Number.NaN },
    { ...candle(60, 1.11), open: 1.1, high: 1.14, low: 1.09, volume: 2 },
    { ...candle(60, 1.12), open: 1.2, high: 1.22, low: 1.08, volume: 3 },
  ]);

  assert.deepEqual(result, [
    { time: 60, open: 1.1, high: 1.22, low: 1.08, close: 1.12, volume: 5 },
    { time: 120, open: 1.2, high: 1.2, low: 1.2, close: 1.2, volume: 0 },
  ]);
});

test('preserves backend history timestamps instead of frontend rebucketing', () => {
  const base = 1_713_744_000;
  const result = normalizeCandleSeries(
    [
      { time: base + 1, open: 100, high: 101, low: 99, close: 100.5, volume: 3 },
      { time: base + 45, open: 100.5, high: 102, low: 98, close: 101, volume: 4 },
      { time: base + 60, open: 101, high: 103, low: 100, close: 102, volume: 5 },
    ],
    'M1',
  );

  assert.deepEqual(result, [
    { time: base + 1, open: 100, high: 101, low: 99, close: 100.5, volume: 3 },
    { time: base + 45, open: 100.5, high: 102, low: 98, close: 101, volume: 4 },
    { time: base + 60, open: 101, high: 103, low: 100, close: 102, volume: 5 },
  ]);
});

test('preserves explicit higher-timeframe backend timestamps', () => {
  const weeklyOpenTime = Date.UTC(2026, 3, 15, 22, 0, 0) / 1000;
  const result = normalizeCandleSeries(
    [{ time: weeklyOpenTime, open: 1.1, high: 1.3, low: 1.0, close: 1.25, volume: 120 }],
    'W1',
  );

  assert.deepEqual(result, [
    { time: weeklyOpenTime, open: 1.1, high: 1.3, low: 1.0, close: 1.25, volume: 120 },
  ]);
});

test('backend live candle overwrites the same-time history bucket with the broker snapshot', () => {
  const map = createCandleMap([candle(60, 1.1)]);
  const result = applyLiveCandleToCandleMap(map, {
    time: 60,
    open: 1.2,
    high: 1.4,
    low: 1.1,
    close: 1.3,
    volume: 50,
  });

  assert.equal(result.changed, true);
  // Backend snapshots are authoritative for OHLCV: the broker's live candle
  // fully replaces the same-time history bucket, including the open price.
  // (Merging — preserving history's open — silently freezes the active bar's
  // open at the REST seed value and prevents the broker from correcting it.)
  assert.deepEqual(materializeCandleMap(map), [
    { time: 60, open: 1.2, high: 1.4, low: 1.1, close: 1.3, volume: 50 },
  ]);
});

test('backend live candle snapshots inside one timeframe bucket overwrite to one candle', () => {
  const map = createCandleMap();

  applyLiveCandleToCandleMap(
    map,
    { time: 1_713_744_005, open: 100, high: 101, low: 99, close: 100.5, volume: 3 },
    'M1',
  );
  applyLiveCandleToCandleMap(
    map,
    { time: 1_713_744_045, open: 100, high: 102, low: 98, close: 101, volume: 4 },
    'M1',
  );

  // Broker is authoritative: each snapshot fully replaces the active bucket.
  // Volume is a cumulative tick count, not an additive batch — the second
  // snapshot's `volume: 4` already includes the ticks the first one reported.
  assert.deepEqual(materializeCandleMap(map), [
    { time: 1_713_744_000, open: 100, high: 102, low: 98, close: 101, volume: 4 },
  ]);
});

test('standard backend OHLC bucketing is identical for every supported symbol and timeframe', () => {
  const symbols = ['EURUSDm', 'XAUUSD', 'BTCUSD', 'USDJPY.c'];
  const baseTimestamp = Date.UTC(2024, 3, 22, 10, 37, 1) / 1000;

  symbols.forEach((rawSymbol, symbolIndex) => {
    SUPPORTED_TIMEFRAMES.forEach((timeframe, timeframeIndex) => {
      const map = createCandleMap();
      const symbol = normalizeSymbol(rawSymbol);
      const basePrice = 100 + symbolIndex * 1000 + timeframeIndex * 10;
      const expectedBucket = getBucketStart(baseTimestamp, timeframe);

      assert.notEqual(expectedBucket, null);
      applyLiveCandleToCandleMap(
        map,
        {
          symbol,
          timeframe,
          time: baseTimestamp,
          open: basePrice,
          high: basePrice + 2,
          low: basePrice - 1,
          close: basePrice + 1,
          volume: 10,
        },
        timeframe,
      );

      assert.deepEqual(materializeCandleMap(map), [
        {
          time: expectedBucket,
          open: basePrice,
          high: basePrice + 2,
          low: basePrice - 1,
          close: basePrice + 1,
          volume: 10,
        },
      ], `${symbol} ${timeframe}`);
    });
  });
});

test('history plus buffered backend live events merge through a timestamp-keyed map without filling gaps', () => {
  const history = [
    { time: 1_713_744_000, open: 1, high: 1.1, low: 0.9, close: 1.05, volume: 10 },
    { time: 1_713_744_060, open: 1.05, high: 1.2, low: 1.01, close: 1.15, volume: 12 },
  ];
  const map = createCandleMap(history);

  const buffered = [
    { time: 1_713_744_180, open: 1.3, high: 1.4, low: 1.2, close: 1.35, volume: 5 },
    { time: 1_713_744_062, open: 1.2, high: 1.25, low: 1.19, close: 1.22, volume: 4 },
  ].sort((left, right) => left.time - right.time);

  for (const liveCandle of buffered) {
    applyLiveCandleToCandleMap(map, liveCandle, 'M1', {
      historyCutoffTime: history[history.length - 1].time,
    });
  }

  const result = materializeCandleMap(map);
  assert.deepEqual(result.map((item) => item.time), [1_713_744_000, 1_713_744_060, 1_713_744_180]);
  assert.equal(new Set(result.map((item) => item.time)).size, result.length);
});

test('M1 REST history seeds the backend current candle so first websocket candle does not create frontend gaps', () => {
  const symbols = ['EURUSD', 'GBPUSD', 'XAUUSD', 'BTCUSD'];
  const base = 1_776_071_280;

  for (const symbol of symbols) {
    const history = normalizeCandleSeries(
      [
        { time: base, open: 1, high: 1.1, low: 0.9, close: 1.05, volume: 10 },
        { time: base + 60, open: 1.05, high: 1.2, low: 1.01, close: 1.15, volume: 12 },
        { time: base + 120, open: 1.15, high: 1.3, low: 1.1, close: 1.25, volume: 15 },
      ],
      'M1',
    );
    const { closedHistory, currentCandle } = splitRestHistoryCandles(history, 'M1', 'bid');
    const seed = buildRestHistorySeedCandles(closedHistory, currentCandle);
    const map = createCandleMap(seed.candles);

    assert.deepEqual(seed.candles.map((item) => item.time), [base, base + 60, base + 120], symbol);
    assert.equal(seed.closedHistoryLastTime, base + 60, symbol);

    const sameBucket = applyLiveCandleToCandleMap(
      map,
      { symbol, time: base + 125, open: 1.15, high: 1.32, low: 1.1, close: 1.28, volume: 16 },
      'M1',
      { historyCutoffTime: seed.closedHistoryLastTime },
    );
    assert.equal(sameBucket.ignored, false, symbol);
    assert.deepEqual(materializeCandleMap(map).map((item) => item.time), [base, base + 60, base + 120], symbol);

    const nextBucket = applyLiveCandleToCandleMap(
      map,
      { symbol, time: base + 180, open: 1.28, high: 1.31, low: 1.27, close: 1.3, volume: 2 },
      'M1',
      { historyCutoffTime: seed.closedHistoryLastTime },
    );
    assert.equal(nextBucket.ignored, false, symbol);
    assert.deepEqual(materializeCandleMap(map).map((item) => item.time), [base, base + 60, base + 120, base + 180], symbol);
  }
});

test('backend live candles at the closed history cutoff boundary cannot rewrite trusted history', () => {
  const history = [
    { time: 1_713_744_000, open: 1, high: 1.1, low: 0.9, close: 1.05, volume: 10 },
    { time: 1_713_744_060, open: 1.05, high: 1.2, low: 1.01, close: 1.15, volume: 12 },
  ];
  const map = createCandleMap(history);

  // Buckets at or before historyCutoffTime are already closed REST history.
  // Replayed live snapshots must not rewrite that trusted baseline.
  const result = applyLiveCandleToCandleMap(
    map,
    { symbol: 'EURUSD', time: 1_713_744_062, open: 1.5, high: 1.6, low: 1.4, close: 1.55, volume: 1 },
    'M1',
    { historyCutoffTime: history[history.length - 1].time },
  );

  assert.equal(result.ignored, true);
  assert.equal(result.changed, false);
  assert.equal(result.reason, 'older_than_history_cutoff');
  assert.deepEqual(materializeCandleMap(map), history);

  // A live candle that maps to a bucket before the cutoff is rejected too.
  const olderResult = applyLiveCandleToCandleMap(
    map,
    { symbol: 'EURUSD', time: 1_713_744_001, open: 1.5, high: 1.6, low: 1.4, close: 1.55, volume: 1 },
    'M1',
    { historyCutoffTime: history[history.length - 1].time },
  );

  assert.equal(olderResult.ignored, true);
  assert.equal(olderResult.reason, 'older_than_history_cutoff');
});

test('older backend live candle snapshots can widen wicks without rewinding close', () => {
  const map = createCandleMap();

  applyLiveCandleToCandleMap(
    map,
    { time: 1_713_744_045, open: 100, high: 105, low: 99, close: 104, volume: 10 },
    'M1',
  );
  const stale = applyLiveCandleToCandleMap(
    map,
    { time: 1_713_744_015, open: 100, high: 106, low: 98, close: 100.5, volume: 2 },
    'M1',
  );

  assert.equal(stale.ignored, false);
  assert.equal(stale.reason, 'merged_out_of_order_live_candle');
  // Wicks widen from the older snapshot, but `close` stays anchored to the
  // newer snapshot. Volume is the broker's cumulative tick count, so we keep
  // the higher count (the latest one) rather than summing both numbers — the
  // older snapshot reported a smaller cumulative count, not a separate batch.
  assert.deepEqual(materializeCandleMap(map), [
    { time: 1_713_744_000, open: 100, high: 106, low: 98, close: 104, volume: 10 },
  ]);
});

test('empty history plus a valid backend live candle starts the visible series', () => {
  const map = createCandleMap();

  const result = applyLiveCandleToCandleMap(
    map,
    { symbol: 'XAUUSD', timeframe: 'M5', time: 1_713_744_300, open: 2325, high: 2326, low: 2324, close: 2325.5, volume: 3 },
    'M5',
  );

  assert.equal(result.ignored, false);
  assert.deepEqual(materializeCandleMap(map), [
    { time: 1_713_744_300, open: 2325, high: 2326, low: 2324, close: 2325.5, volume: 3 },
  ]);
});
