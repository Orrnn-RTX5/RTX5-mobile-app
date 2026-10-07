import assert from 'node:assert/strict';
import test from 'node:test';

import { convertCandlesForChart, convertCandlesToLinePoints } from '../../src/domain/candles/normalization/chartAdapter';
import { normalizeHistoryCandle } from '../../src/domain/candles/normalization/candleNormalizer';
import { getBucketStart } from '../../src/domain/candles/core/timeframeUtils';
import { applyLiveCandleToCandleMap } from '../../src/domain/candles/series/liveCandleAggregator';
import { createCandleMap, materializeCandleMap } from '../../src/domain/candles/series/candleSeriesMerger';
import {
  buildFreshHistoryLiveCandleSeries,
  pruneLiveCandleMapCoveredByHistory,
} from '../../src/domain/candles/series/freshHistoryLiveSeries';
import {
  aggregateTickToCandleMap,
  normalizeLiveTick,
} from '../../src/domain/candles/series/tickCandleAggregator';
import {
  assertNoDuplicateCandleTimes,
  assertValidCandleSeries,
  buildContiguousHistory,
  makeBackendLiveCandle,
  makeCandle,
  makeTrustedHistoryCandle,
  secondsUtc,
} from '../support/candleTestUtils';

const t1000 = secondsUtc(2024, 3, 22, 10, 0, 0);
const t1001 = secondsUtc(2024, 3, 22, 10, 1, 0);
const t1002 = secondsUtc(2024, 3, 22, 10, 2, 0);

test('does not split live candle from latest history candle', () => {
  const history = [
    makeTrustedHistoryCandle(t1000, { open: 100, high: 110, low: 95, close: 105 }),
    makeTrustedHistoryCandle(t1001, { open: 105, high: 108, low: 101, close: 102 }),
  ];
  const live = [makeBackendLiveCandle(t1001, { open: 105, high: 109, low: 99, close: 99 })];

  const visible = buildFreshHistoryLiveCandleSeries(history, live, 'M1');

  assert.deepEqual(visible.map((candle) => candle.time), [t1000, t1001]);
  assert.equal(visible.filter((candle) => candle.time === t1001).length, 1);
  assert.deepEqual(visible[1], {
    time: t1001,
    open: 105,
    high: 109,
    low: 99,
    close: 99,
    volume: 10,
  });
});

test('does not create artificial gaps', () => {
  const history = [
    makeTrustedHistoryCandle(t1000, { open: 100, high: 110, low: 95, close: 105 }),
    makeTrustedHistoryCandle(t1002, { open: 103, high: 106, low: 100, close: 104 }),
  ];

  const visible = buildFreshHistoryLiveCandleSeries(history, [], 'M1');

  assert.deepEqual(visible.map((candle) => candle.time), [t1000, t1002]);
  assert.equal(visible.some((candle) => candle.time === t1001), false);
});

test('preserves candle wick high and low', () => {
  const live = makeBackendLiveCandle(t1001, {
    open: 100,
    high: 120,
    low: 90,
    close: 100,
  });
  const visible = buildFreshHistoryLiveCandleSeries([], [live], 'M1');
  const chartCandles = convertCandlesForChart(visible);

  assert.deepEqual(chartCandles, [
    {
      time: t1001,
      open: 100,
      high: 120,
      low: 90,
      close: 100,
      volume: 10,
    },
  ]);
});

test('duplicate stream replay does not duplicate candles', () => {
  const map = createCandleMap();
  const first = makeBackendLiveCandle(t1001, { open: 105, high: 108, low: 101, close: 102 });
  const replay = makeBackendLiveCandle(t1001, { open: 105, high: 108, low: 101, close: 102 });

  applyLiveCandleToCandleMap(map, first, 'M1');
  applyLiveCandleToCandleMap(map, replay, 'M1');

  const visible = materializeCandleMap(map);
  assert.deepEqual(visible.map((candle) => candle.time), [t1001]);
  assertNoDuplicateCandleTimes(visible);
});

test('invalid backend candle does not crash chart', () => {
  const normalized = [
    normalizeHistoryCandle({ time: t1000, open: 100, high: 110, low: 95, close: 105, volume: 1 }),
    normalizeHistoryCandle({ time: t1001, open: null, high: 108, low: 101, close: 102 }),
    normalizeHistoryCandle({ time: t1002, open: 103, high: 100, low: 106, close: 'bad' }),
  ].filter((candle): candle is NonNullable<typeof candle> => candle !== null);

  const visible = buildFreshHistoryLiveCandleSeries(normalized, [], 'M1');
  assert.deepEqual(visible.map((candle) => candle.time), [t1000]);
  assertValidCandleSeries(visible);
});

test('empty history plus later live tick renders first live candle', () => {
  const map = createCandleMap([]);
  const tick = normalizeLiveTick({ symbol: 'EURUSD', timestamp: t1002, price: 103 }, 'M1', {
    expectedSymbol: 'EURUSD',
    expectedTimeframe: 'M1',
  });
  assert.ok(tick);

  aggregateTickToCandleMap(map, tick, { expectedSymbol: 'EURUSD', expectedTimeframe: 'M1' });
  assert.deepEqual(materializeCandleMap(map), [
    {
      time: t1002,
      open: 103,
      high: 103,
      low: 103,
      close: 103,
      volume: 0,
    },
  ]);
});

test('history reload after live update reconciles without duplication', () => {
  const map = createCandleMap([
    makeTrustedHistoryCandle(t1000, { open: 100, high: 110, low: 95, close: 105 }),
  ]);
  applyLiveCandleToCandleMap(
    map,
    makeBackendLiveCandle(t1001, { open: 105, high: 109, low: 101, close: 108 }),
    'M1',
  );

  const caughtUpHistory = [
    makeTrustedHistoryCandle(t1000, { open: 100, high: 110, low: 95, close: 105 }),
    makeTrustedHistoryCandle(t1001, { open: 105, high: 109, low: 101, close: 108 }),
  ];
  const prunedLive = pruneLiveCandleMapCoveredByHistory(map, caughtUpHistory[caughtUpHistory.length - 1].time);
  const visible = buildFreshHistoryLiveCandleSeries(caughtUpHistory, materializeCandleMap(prunedLive), 'M1');

  assert.deepEqual(visible.map((candle) => candle.time), [t1000, t1001]);
  assert.equal(visible.filter((candle) => candle.time === t1001).length, 1);
  assertNoDuplicateCandleTimes(visible);
});

test('timestamp unit normalization does not create false gaps', () => {
  assert.equal(getBucketStart(t1000 * 1000, 'M1'), t1000);
  assert.equal(getBucketStart((t1000 + 60) * 1000, 'M1'), t1001);
  assert.deepEqual(
    buildFreshHistoryLiveCandleSeries([
      makeTrustedHistoryCandle(getBucketStart(t1000 * 1000, 'M1') ?? 0),
      makeTrustedHistoryCandle(getBucketStart((t1000 + 60) * 1000, 'M1') ?? 0),
    ], [], 'M1').map((candle) => candle.time),
    [t1000, t1001],
  );
});

test('scrolling left retains previous candles', () => {
  const history = buildContiguousHistory(t1000, 1_000, 'M1', (index) => ({
    open: 100 + index,
    high: 101 + index,
    low: 99 + index,
    close: 100.5 + index,
  }));
  const live = [makeBackendLiveCandle(t1000 + 1_000 * 60, { open: 1200, high: 1202, low: 1199, close: 1201 })];

  const visible = buildFreshHistoryLiveCandleSeries(history, live, 'M1');

  assert.equal(visible.length, 1_001);
  assert.equal(visible[0].time, t1000);
  assert.equal(visible[999].time, t1000 + 999 * 60);
  assert.equal(visible[1_000].time, t1000 + 1_000 * 60);
});

test('zoom/data-density path does not convert candlesticks into line data', () => {
  const candle = makeCandle(t1001, {
    open: 100,
    high: 120,
    low: 90,
    close: 100,
  });

  assert.deepEqual(convertCandlesForChart([candle]), [
    {
      time: t1001,
      open: 100,
      high: 120,
      low: 90,
      close: 100,
      volume: 10,
    },
  ]);
  assert.deepEqual(convertCandlesToLinePoints([candle]), [{ time: t1001, value: 100 }]);
});
