import assert from 'node:assert/strict';
import test from 'node:test';

import { applyLiveCandleToCandleMap } from '../../src/domain/candles/series/liveCandleAggregator';
import { createCandleMap, materializeCandleMap } from '../../src/domain/candles/series/candleSeriesMerger';
import {
  getExpectedNextCandleTime,
  materializeCanonicalHistoryAndLiveCandles,
} from '../../src/domain/candles/core/candles';
import { resolveVisibleSeriesMode } from '../../src/domain/candles/ws/liveCandlesEnginePolicy';
import {
  assertNoDuplicateCandleTimes,
  assertValidCandleSeries,
  buildContiguousHistory,
  makeBackendLiveCandle,
  secondsUtc,
} from '../support/candleTestUtils';

test('history tail plus next-bucket backend live candle creates one clean live candle', () => {
  const history = buildContiguousHistory(secondsUtc(2024, 3, 22, 12, 0, 0), 1, 'M1');
  const nextTime = getExpectedNextCandleTime(history[0].time, 'M1');
  const live = [makeBackendLiveCandle(nextTime, { open: 1.2, high: 1.2, low: 1.2, close: 1.2 })];

  assert.equal(resolveVisibleSeriesMode(history, live, history, 'M1'), 'merged');

  const visible = materializeCanonicalHistoryAndLiveCandles(history, live, 'M1');
  assert.deepEqual(visible.map((candle) => candle.time), [history[0].time, nextTime]);
  assertNoDuplicateCandleTimes(visible);
  assertValidCandleSeries(visible);
});

test('same-bucket backend live candle snapshot replaces the active bucket instead of appending', () => {
  const bucket = secondsUtc(2024, 3, 22, 12, 1, 0);
  const map = createCandleMap();

  applyLiveCandleToCandleMap(
    map,
    { time: bucket + 5, open: 100, high: 101, low: 99, close: 100.5, volume: 10 },
    'M1',
  );
  applyLiveCandleToCandleMap(
    map,
    { time: bucket + 30, open: 100, high: 102, low: 98, close: 102, volume: 12 },
    'M1',
  );

  assert.deepEqual(materializeCandleMap(map), [
    { time: bucket, open: 100, high: 102, low: 98, close: 102, volume: 12 },
  ]);
});

test('far-ahead backend live candle merges into one series while preserving the gap', () => {
  const history = buildContiguousHistory(secondsUtc(2024, 3, 22, 10, 0, 0), 3, 'M1');
  const detached = [makeBackendLiveCandle(secondsUtc(2024, 3, 22, 10, 10, 0), { close: 1.3 })];

  assert.equal(resolveVisibleSeriesMode(history, detached, history, 'M1'), 'merged');

  const chartVisible = materializeCanonicalHistoryAndLiveCandles(history, detached, 'M1');
  assert.deepEqual(chartVisible.map((candle) => candle.time), [
    ...history.map((candle) => candle.time),
    secondsUtc(2024, 3, 22, 10, 10, 0),
  ]);
  assertNoDuplicateCandleTimes(chartVisible);
});

test('REST catch-up keeps the same merged series without duplicate live buckets', () => {
  const start = secondsUtc(2024, 3, 22, 10, 0, 0);
  const staleHistory = buildContiguousHistory(start, 3, 'M1');
  const detachedTime = secondsUtc(2024, 3, 22, 10, 10, 0);
  const detachedLive = [makeBackendLiveCandle(detachedTime, { close: 1.3 })];

  assert.equal(resolveVisibleSeriesMode(staleHistory, detachedLive, staleHistory, 'M1'), 'merged');

  const caughtUpHistory = buildContiguousHistory(start, 10, 'M1');
  assert.equal(resolveVisibleSeriesMode(caughtUpHistory, detachedLive, staleHistory, 'M1'), 'merged');

  const visible = materializeCanonicalHistoryAndLiveCandles(caughtUpHistory, detachedLive, 'M1');
  assert.deepEqual(visible[visible.length - 1].time, detachedTime);
  assertNoDuplicateCandleTimes(visible);
  assertValidCandleSeries(visible);
});
