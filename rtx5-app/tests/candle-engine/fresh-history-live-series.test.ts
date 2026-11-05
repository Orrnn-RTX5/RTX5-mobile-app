import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFreshHistoryLiveCandleSeries,
  pruneLiveCandleMapCoveredByHistory,
} from '../../src/domain/candles/series/freshHistoryLiveSeries';
import type { MutableCandle } from '../../src/domain/candles/core/candleTypes';
import {
  assertNoDuplicateCandleTimes,
  assertValidCandleSeries,
  buildContiguousHistory,
  makeBackendLiveCandle,
  makeCandle,
  secondsUtc,
} from '../support/candleTestUtils';

test('fresh history plus same-bucket backend live candle produces one active candle', () => {
  const activeTime = secondsUtc(2024, 3, 22, 10, 2, 0);
  const history = [
    makeCandle(secondsUtc(2024, 3, 22, 10, 0, 0), { close: 1.1 }),
    makeCandle(secondsUtc(2024, 3, 22, 10, 1, 0), { close: 1.2 }),
    makeCandle(activeTime, { open: 1.2, high: 1.24, low: 1.18, close: 1.22 }),
  ];
  const live = [
    makeBackendLiveCandle(activeTime, {
      open: 1.2,
      high: 1.27,
      low: 1.18,
      close: 1.26,
      volume: 18,
    }),
  ];

  const visible = buildFreshHistoryLiveCandleSeries(history, live, 'M1');

  assert.equal(visible.length, 3);
  assert.equal(visible.filter((candle) => candle.time === activeTime).length, 1);
  assert.equal(visible[visible.length - 1].open, 1.2);
  assert.equal(visible[visible.length - 1].high, 1.27);
  assert.equal(visible[visible.length - 1].low, 1.18);
  assert.equal(visible[visible.length - 1].close, 1.26);
  assert.equal(visible[visible.length - 1].volume, 18);
  assertNoDuplicateCandleTimes(visible);
  assertValidCandleSeries(visible);
});

test('fresh series preserves backend live candle beyond the history tail', () => {
  const history = buildContiguousHistory(secondsUtc(2024, 3, 22, 10, 0, 0), 3, 'M1');
  const live = [
    makeBackendLiveCandle(secondsUtc(2024, 3, 22, 10, 5, 0), {
      open: 1.33,
      high: 1.36,
      low: 1.32,
      close: 1.35,
    }),
  ];

  const visible = buildFreshHistoryLiveCandleSeries(history, live, 'M1');

  assert.deepEqual(visible.map((candle) => candle.time), [
    ...history.map((candle) => candle.time),
    secondsUtc(2024, 3, 22, 10, 5, 0),
  ]);
  assertValidCandleSeries(visible);
});

test('disjoint same-bucket history and live prices do not merge into a massive wick', () => {
  const activeTime = secondsUtc(2026, 4, 12, 11, 5, 0);
  const history = [
    makeCandle(secondsUtc(2026, 4, 12, 11, 4, 0), {
      open: 48_050,
      high: 48_180,
      low: 47_950,
      close: 48_120,
    }),
    makeCandle(activeTime, {
      open: 48_120,
      high: 48_250,
      low: 47_900,
      close: 48_100,
    }),
  ];
  const live = [
    makeBackendLiveCandle(activeTime, {
      open: 81_224.54,
      high: 81_224.54,
      low: 81_224.54,
      close: 81_224.54,
      volume: 0,
    }),
  ];

  const visible = buildFreshHistoryLiveCandleSeries(history, live, 'M1');
  const active = visible.find((candle) => candle.time === activeTime);

  assert.ok(active);
  assert.equal(active.open, 81_224.54);
  assert.equal(active.high, 81_224.54);
  assert.equal(active.low, 81_224.54);
  assert.equal(active.close, 81_224.54);
  assertValidCandleSeries(visible);
});

test('history catch-up prunes live candles that are now closed REST history', () => {
  const liveMap = new Map<number, MutableCandle>([
    [
      secondsUtc(2024, 3, 22, 10, 2, 0),
      {
        ...makeBackendLiveCandle(secondsUtc(2024, 3, 22, 10, 2, 0)),
        source: 'live_candle',
      },
    ],
    [
      secondsUtc(2024, 3, 22, 10, 3, 0),
      {
        ...makeBackendLiveCandle(secondsUtc(2024, 3, 22, 10, 3, 0), { close: 9 }),
        source: 'live_candle',
      },
    ],
    [
      secondsUtc(2024, 3, 22, 10, 4, 0),
      {
        ...makeBackendLiveCandle(secondsUtc(2024, 3, 22, 10, 4, 0), { close: 1.4 }),
        source: 'live_candle',
      },
    ],
  ]);

  const pruned = pruneLiveCandleMapCoveredByHistory(
    liveMap,
    secondsUtc(2024, 3, 22, 10, 3, 0),
  );

  assert.deepEqual(Array.from(pruned.keys()), [secondsUtc(2024, 3, 22, 10, 4, 0)]);
});

test('protected merge keeps closed REST history over same-time live replay', () => {
  const cutoff = secondsUtc(2024, 3, 22, 10, 2, 0);
  const history = [
    makeCandle(secondsUtc(2024, 3, 22, 10, 0, 0), { close: 1.1 }),
    makeCandle(secondsUtc(2024, 3, 22, 10, 1, 0), { close: 1.2 }),
    makeCandle(cutoff, { open: 1.2, high: 1.24, low: 1.18, close: 1.22 }),
  ];
  const live = [
    makeBackendLiveCandle(cutoff, {
      open: 9,
      high: 9,
      low: 9,
      close: 9,
      volume: 1,
    }),
    makeBackendLiveCandle(cutoff + 60, {
      open: 1.22,
      high: 1.27,
      low: 1.21,
      close: 1.26,
      volume: 18,
    }),
  ];

  const visible = buildFreshHistoryLiveCandleSeries(history, live, 'M1', undefined, {
    closedHistoryLastTime: cutoff,
  });

  assert.equal(visible.length, 4);
  assert.equal(visible.find((candle) => candle.time === cutoff)?.close, 1.22);
  assert.equal(visible[visible.length - 1].time, cutoff + 60);
  assert.equal(visible[visible.length - 1].close, 1.26);
  assertNoDuplicateCandleTimes(visible);
  assertValidCandleSeries(visible);
});
