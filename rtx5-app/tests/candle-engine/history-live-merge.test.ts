import assert from 'node:assert/strict';
import test from 'node:test';

import {
  materializeCanonicalHistoryAndLiveCandles,
  pruneLiveCandlesCoveredByHistory,
  sortAndDedupeCandles,
} from '../../src/domain/candles/core/candles';
import { applyLiveCandleToCandleMap } from '../../src/domain/candles/series/liveCandleAggregator';
import { createCandleMap, materializeCandleMap } from '../../src/domain/candles/series/candleSeriesMerger';
import { resolveVisibleSeriesMode } from '../../src/domain/candles/ws/liveCandlesEnginePolicy';
import { markTrustedHistorySeries, splitRestHistoryCandles } from '../../src/domain/candles/core/candleProvenance';
import {
  assertNoDuplicateCandleTimes,
  assertValidCandleSeries,
  buildContiguousHistory,
  makeCandle,
  makeBackendLiveCandle,
  makeTrustedHistoryCandle,
  secondsUtc,
} from '../support/candleTestUtils';

test('perfect REST history plus next live bucket produces merged visible mode', () => {
  const history = [
    makeTrustedHistoryCandle(secondsUtc(2024, 3, 22, 10, 0, 0)),
    makeTrustedHistoryCandle(secondsUtc(2024, 3, 22, 10, 1, 0)),
    makeTrustedHistoryCandle(secondsUtc(2024, 3, 22, 10, 2, 0)),
  ];
  const live = [makeBackendLiveCandle(secondsUtc(2024, 3, 22, 10, 3, 0), { close: 1.3 })];

  assert.equal(resolveVisibleSeriesMode(history, live, history, 'M1'), 'merged');

  const visible = materializeCanonicalHistoryAndLiveCandles(history, live, 'M1');
  assert.deepEqual(visible.map((candle) => candle.time), [
    secondsUtc(2024, 3, 22, 10, 0, 0),
    secondsUtc(2024, 3, 22, 10, 1, 0),
    secondsUtc(2024, 3, 22, 10, 2, 0),
    secondsUtc(2024, 3, 22, 10, 3, 0),
  ]);
  assertNoDuplicateCandleTimes(visible);
});

test('detached live candle merges with history while preserving the backend gap', () => {
  const history = buildContiguousHistory(secondsUtc(2024, 3, 22, 10, 0, 0), 3, 'M1');
  const live = [makeBackendLiveCandle(secondsUtc(2024, 3, 22, 10, 10, 0), { close: 1.5 })];

  assert.equal(resolveVisibleSeriesMode(history, live, history, 'M1'), 'merged');
  const visible = materializeCanonicalHistoryAndLiveCandles(history, live, 'M1');
  assert.deepEqual(visible.map((candle) => candle.time), [
    secondsUtc(2024, 3, 22, 10, 0, 0),
    secondsUtc(2024, 3, 22, 10, 1, 0),
    secondsUtc(2024, 3, 22, 10, 2, 0),
    secondsUtc(2024, 3, 22, 10, 10, 0),
  ]);
  assertNoDuplicateCandleTimes(visible);
});

test('two-bucket live gap stays visible as a backend gap in one merged series', () => {
  const history = buildContiguousHistory(secondsUtc(2024, 3, 22, 10, 0, 0), 3, 'M1');
  const live = [makeBackendLiveCandle(secondsUtc(2024, 3, 22, 10, 4, 0), { close: 1.5 })];

  assert.equal(resolveVisibleSeriesMode(history, live, history, 'M1'), 'merged');

  const visible = materializeCanonicalHistoryAndLiveCandles(history, live, 'M1');
  assert.deepEqual(visible.map((candle) => candle.time), [
    ...history.map((candle) => candle.time),
    secondsUtc(2024, 3, 22, 10, 4, 0),
  ]);
  assertNoDuplicateCandleTimes(visible);
});

test('REST catch-up prunes covered live candles and keeps only one candle per bucket', () => {
  const start = secondsUtc(2024, 3, 22, 10, 0, 0);
  const caughtUpHistory = buildContiguousHistory(start, 11, 'M1', (index) => ({ close: 1.1 + index / 100 }));
  const sameTimeLive = [
    makeBackendLiveCandle(secondsUtc(2024, 3, 22, 10, 10, 0), {
      close: 1.999,
    }),
  ];

  const pruned = pruneLiveCandlesCoveredByHistory(caughtUpHistory, sameTimeLive);
  const visible = materializeCanonicalHistoryAndLiveCandles(caughtUpHistory, pruned, 'M1');

  assert.equal(visible.filter((candle) => candle.time === secondsUtc(2024, 3, 22, 10, 10, 0)).length, 1);
  assert.equal(visible[visible.length - 1].close, caughtUpHistory[caughtUpHistory.length - 1].close);
  assertNoDuplicateCandleTimes(visible);
  assertValidCandleSeries(visible);
});

test('REST current candle and WebSocket live candle never create duplicate same-time buckets', () => {
  const restPayload = [
    makeCandle(secondsUtc(2024, 3, 22, 10, 0, 0), { close: 1.1 }),
    makeCandle(secondsUtc(2024, 3, 22, 10, 1, 0), { close: 1.2 }),
    makeCandle(secondsUtc(2024, 3, 22, 10, 2, 0), { close: 1.25 }),
  ];
  const liveSameBucket = makeBackendLiveCandle(secondsUtc(2024, 3, 22, 10, 2, 0), { close: 1.27 });

  const { closedHistory, currentCandle } = splitRestHistoryCandles(restPayload, 'M1', 'bid');
  assert.deepEqual(closedHistory.map((candle) => candle.time), [
    secondsUtc(2024, 3, 22, 10, 0, 0),
    secondsUtc(2024, 3, 22, 10, 1, 0),
  ]);
  assert.equal(currentCandle?.time, liveSameBucket.time);

  const visible = materializeCanonicalHistoryAndLiveCandles(closedHistory, [liveSameBucket], 'M1');
  assert.equal(visible.filter((candle) => candle.time === liveSameBucket.time).length, 1);
  assert.equal(visible[visible.length - 1].close, liveSameBucket.close);
  assert.equal(visible[visible.length - 1].high, liveSameBucket.high);
  assert.equal(visible[visible.length - 1].low, liveSameBucket.low);
});

test('REST current candle is not promoted into the live stream history cutoff', () => {
  const restPayload = [
    makeCandle(secondsUtc(2024, 3, 22, 10, 0, 0), { close: 1.1 }),
    makeCandle(secondsUtc(2024, 3, 22, 10, 5, 0), { close: 1.5 }),
  ];
  const { closedHistory, currentCandle } = splitRestHistoryCandles(restPayload, 'M1', 'bid');
  assert.deepEqual(closedHistory.map((candle) => candle.time), [
    secondsUtc(2024, 3, 22, 10, 0, 0),
  ]);
  assert.equal(currentCandle?.time, secondsUtc(2024, 3, 22, 10, 5, 0));

  const candleMap = createCandleMap(closedHistory);
  const result = applyLiveCandleToCandleMap(
    candleMap,
    {
      time: secondsUtc(2024, 3, 22, 10, 2, 30),
      open: 1.25,
      high: 1.25,
      low: 1.25,
      close: 1.25,
      volume: 0,
    },
    'M1',
    { historyCutoffTime: closedHistory[closedHistory.length - 1]?.time ?? null },
  );
  const visible = materializeCandleMap(candleMap);

  assert.equal(result.ignored, false);
  assert.equal(result.changed, true);
  assert.deepEqual(visible.map((candle) => candle.time), [
    secondsUtc(2024, 3, 22, 10, 0, 0),
    secondsUtc(2024, 3, 22, 10, 2, 0),
  ]);
});

test('duplicate and unsorted REST candles are normalized before merge', () => {
  const unsorted = [
    makeCandle(180, { close: 1.3 }),
    makeCandle(60, { close: 1.1 }),
    makeCandle(120, { close: 1.2 }),
    makeCandle(120, { close: 1.25, high: 1.25 }),
  ];
  const normalized = markTrustedHistorySeries(sortAndDedupeCandles(unsorted), 'M1', 'bid');

  assert.deepEqual(normalized.map((candle) => candle.time), [60, 120, 180]);
  assert.equal(normalized[1].close, 1.25);
  assert.equal(normalized[1].volume, 20);
  assertNoDuplicateCandleTimes(normalized);
});
