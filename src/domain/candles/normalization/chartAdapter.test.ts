import assert from 'node:assert/strict';
import test from 'node:test';

import type { Candle } from '../core/candleTypes';
import { hasOnlyRepeatedFlatCandles, sanitizeCandlesForChart } from './chartAdapter';

type TestCandle = Candle & {
  source?: 'history' | 'live_candle';
  closed?: boolean;
};

const baseTime = 1_775_000_000;

const realCandle = (time: number, close = 2_000): TestCandle => ({
  time,
  open: close - 2,
  high: close + 3,
  low: close - 4,
  close,
  volume: 8,
  source: 'history',
  closed: true,
});

const seriesWithSyntheticCloseBucket = (): TestCandle[] => [
  realCandle(baseTime),
  {
    time: baseTime + 60,
    open: 2_000,
    high: 2_000,
    low: 2_000,
    close: 2_000,
    volume: 0,
    source: 'live_candle',
    closed: false,
  },
  {
    time: baseTime + 120,
    open: 2_000,
    high: 2_010,
    low: 1_995,
    close: 2_008,
    volume: 20,
    source: 'live_candle',
    closed: false,
  },
];

test('clamps to the session-close bucket before pruning the synthetic live tail', () => {
  const result = sanitizeCandlesForChart(seriesWithSyntheticCloseBucket(), {
    timeframe: 'M1',
    closedMarketSessionClose: baseTime + 120,
    pruneSyntheticFlatLiveTail: true,
  });

  assert.deepEqual(result.map((candle) => candle.time), [baseTime]);
});

test('keeps the final in-session bucket and removes every later candle', () => {
  const result = sanitizeCandlesForChart(seriesWithSyntheticCloseBucket(), {
    timeframe: 'M1',
    closedMarketSessionClose: baseTime + 120,
  });

  assert.deepEqual(result.map((candle) => candle.time), [baseTime, baseTime + 60]);
});

test('authoritative session close preserves legitimate repeated flat in-session history', () => {
  const flatPrice = 45.25;
  const source: TestCandle[] = [
    realCandle(baseTime, 45),
    ...[1, 2, 3].map((offset) => ({
      time: baseTime + offset * 60,
      open: flatPrice,
      high: flatPrice,
      low: flatPrice,
      close: flatPrice,
      volume: 5_000,
      source: 'history' as const,
      closed: true,
    })),
    realCandle(baseTime + 4 * 60, 46),
  ];

  const result = sanitizeCandlesForChart(source, {
    timeframe: 'M1',
    closedMarketSessionClose: baseTime + 4 * 60,
    pruneSyntheticFlatLiveTail: true,
  });

  assert.deepEqual(result.map((candle) => candle.time), [
    baseTime,
    baseTime + 60,
    baseTime + 120,
    baseTime + 180,
  ]);
});

test('uses the exclusive backend close directly for broker-aligned daily candles', () => {
  const daily = 24 * 60 * 60;
  const brokerRollover = baseTime + 17 * 60 * 60;
  const source = [
    realCandle(brokerRollover),
    realCandle(brokerRollover + daily),
    realCandle(brokerRollover + 2 * daily),
  ];

  assert.deepEqual(
    sanitizeCandlesForChart(source, {
      timeframe: 'D1',
      closedMarketSessionClose: brokerRollover + 2 * daily,
    }).map((candle) => candle.time),
    [brokerRollover, brokerRollover + daily],
  );
});

test('fails open for unusable or stale session-close values', () => {
  const source = seriesWithSyntheticCloseBucket();
  const expectedTimes = source.map((candle) => candle.time);

  assert.deepEqual(
    sanitizeCandlesForChart(source, {
      timeframe: 'M1',
      closedMarketSessionClose: Number.NaN,
    }).map((candle) => candle.time),
    expectedTimes,
  );
  assert.deepEqual(
    sanitizeCandlesForChart(source, {
      timeframe: 'M1',
      closedMarketSessionClose: baseTime - 60,
    }).map((candle) => candle.time),
    expectedTimes,
  );
});

test('preserves the normal open or continuous-market series when no close is supplied', () => {
  const source = seriesWithSyntheticCloseBucket();

  assert.deepEqual(
    sanitizeCandlesForChart(source, { timeframe: 'M1' }).map((candle) => candle.time),
    source.map((candle) => candle.time),
  );
});

test('prunes a repeated frozen-price REST suffix with synthetic positive volume', () => {
  const frozenPrice = 1_999.96;
  const source: TestCandle[] = [
    realCandle(baseTime, 2_000),
    ...[1, 2, 3, 4].map((offset) => ({
      time: baseTime + offset * 60,
      open: frozenPrice,
      high: frozenPrice,
      low: frozenPrice,
      close: frozenPrice,
      volume: 7 + (offset % 3),
      source: 'history' as const,
      closed: true,
    })),
  ];

  const result = sanitizeCandlesForChart(source, {
    timeframe: 'M1',
    pruneSyntheticFlatLiveTail: true,
  });

  assert.deepEqual(result.map((candle) => candle.time), [baseTime]);
});

test('keeps a short flat history ending that can still be legitimate', () => {
  const frozenPrice = 1_999.96;
  const source: TestCandle[] = [
    realCandle(baseTime, 2_000),
    ...[1, 2].map((offset) => ({
      time: baseTime + offset * 60,
      open: frozenPrice,
      high: frozenPrice,
      low: frozenPrice,
      close: frozenPrice,
      volume: 8,
      source: 'history' as const,
      closed: true,
    })),
  ];

  assert.deepEqual(
    sanitizeCandlesForChart(source, {
      timeframe: 'M1',
      pruneSyntheticFlatLiveTail: true,
    }).map((candle) => candle.time),
    source.map((candle) => candle.time),
  );
});

test('detects an all-frozen initial window that needs closed-market backfill', () => {
  const frozenWindow = Array.from({ length: 120 }, (_, index) => ({
    time: baseTime + (index + 1) * 60,
    open: 1_999.96,
    high: 1_999.96,
    low: 1_999.96,
    close: 1_999.96,
    volume: 7 + (index % 3),
  }));

  assert.equal(hasOnlyRepeatedFlatCandles(frozenWindow), true);
  assert.equal(hasOnlyRepeatedFlatCandles(frozenWindow.slice(0, 2)), false);
  assert.equal(hasOnlyRepeatedFlatCandles([realCandle(baseTime), ...frozenWindow]), false);
  assert.equal(
    sanitizeCandlesForChart(frozenWindow, {
      timeframe: 'M1',
      pruneSyntheticFlatLiveTail: true,
    }).length,
    frozenWindow.length,
    'the frontend must not delete the whole window before it has a genuine predecessor',
  );
  assert.deepEqual(
    sanitizeCandlesForChart([realCandle(baseTime), ...frozenWindow], {
      timeframe: 'M1',
      pruneSyntheticFlatLiveTail: true,
    }).map((candle) => candle.time),
    [baseTime],
  );
});
