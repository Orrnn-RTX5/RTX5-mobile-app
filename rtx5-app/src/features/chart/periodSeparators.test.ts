import assert from 'node:assert/strict';
import test from 'node:test';

import { getMarketCloseSeparator, getPeriodSeparators, type PeriodSeparatorCandle } from './periodSeparators';

const utcSeconds = (
  year: number,
  monthIndex: number,
  day: number,
  hour = 0,
  minute = 0,
): number => Math.floor(Date.UTC(year, monthIndex, day, hour, minute, 0) / 1000);

const candle = (time: number): PeriodSeparatorCandle => ({ time });

test('creates a daily separator when the UTC candle date changes', () => {
  const separators = getPeriodSeparators(
    [
      candle(utcSeconds(2026, 0, 5, 23, 55)),
      candle(utcSeconds(2026, 0, 6, 0, 0)),
    ],
    'M5',
  );

  assert.deepEqual(separators, [
    {
      time: utcSeconds(2026, 0, 6, 0, 0),
      index: 1,
      type: 'day',
    },
  ]);
});

test('does not create a separator when candles are inside the same day', () => {
  const separators = getPeriodSeparators(
    [
      candle(utcSeconds(2026, 0, 6, 10, 0)),
      candle(utcSeconds(2026, 0, 6, 10, 5)),
      candle(utcSeconds(2026, 0, 6, 10, 10)),
    ],
    'M5',
  );

  assert.deepEqual(separators, []);
});

test('detects a weekly separator when the UTC week changes', () => {
  const separators = getPeriodSeparators(
    [
      candle(utcSeconds(2026, 0, 11, 23, 0)),
      candle(utcSeconds(2026, 0, 12, 0, 0)),
    ],
    'H1',
    { showWeekly: true },
  );

  assert.deepEqual(separators, [
    {
      time: utcSeconds(2026, 0, 12, 0, 0),
      index: 1,
      type: 'week',
    },
  ]);
});

test('detects a monthly separator when the UTC month changes', () => {
  const separators = getPeriodSeparators(
    [
      candle(utcSeconds(2026, 0, 31, 23, 0)),
      candle(utcSeconds(2026, 1, 1, 0, 0)),
    ],
    'H1',
    { showMonthly: true },
  );

  assert.deepEqual(separators, [
    {
      time: utcSeconds(2026, 1, 1, 0, 0),
      index: 1,
      type: 'month',
    },
  ]);
});

test('detects a weekend or session gap without duplicating a day boundary', () => {
  const separators = getPeriodSeparators(
    [
      candle(utcSeconds(2026, 0, 5, 9, 0)),
      candle(utcSeconds(2026, 0, 5, 14, 0)),
    ],
    'H1',
  );

  assert.deepEqual(separators, [
    {
      time: utcSeconds(2026, 0, 5, 14, 0),
      index: 1,
      type: 'gap',
    },
  ]);
});

test('returns an empty list when period separators are disabled', () => {
  const separators = getPeriodSeparators(
    [
      candle(utcSeconds(2026, 0, 5, 23, 55)),
      candle(utcSeconds(2026, 0, 6, 0, 0)),
    ],
    'M5',
    { periodSeparators: false },
  );

  assert.deepEqual(separators, []);
});

test('handles empty and single-candle arrays safely', () => {
  assert.deepEqual(getPeriodSeparators([], 'M1'), []);
  assert.deepEqual(getPeriodSeparators([candle(utcSeconds(2026, 0, 6))], 'M1'), []);
});

test('does not mutate candle data', () => {
  const candles = [
    candle(utcSeconds(2026, 0, 5, 23, 55)),
    candle(utcSeconds(2026, 0, 6, 0, 0)),
  ];
  const before = JSON.stringify(candles);

  getPeriodSeparators(candles, 'M5');

  assert.equal(JSON.stringify(candles), before);
});

test('creates a market close separator on the last candle at or before session close', () => {
  const candles = [
    candle(utcSeconds(2026, 6, 4, 7, 3)),
    candle(utcSeconds(2026, 6, 4, 7, 4)),
    candle(utcSeconds(2026, 6, 4, 7, 5)),
    candle(utcSeconds(2026, 6, 4, 7, 6)),
    candle(utcSeconds(2026, 6, 4, 7, 7)),
  ];

  assert.deepEqual(
    getMarketCloseSeparator(candles, 'M1', utcSeconds(2026, 6, 4, 7, 5) + 30),
    {
      time: utcSeconds(2026, 6, 4, 7, 5),
      index: 2,
      type: 'market_close',
    },
  );
});

test('treats an exact session-close boundary as exclusive', () => {
  const candles = [
    candle(utcSeconds(2026, 6, 4, 7, 3)),
    candle(utcSeconds(2026, 6, 4, 7, 4)),
    candle(utcSeconds(2026, 6, 4, 7, 5)),
  ];

  assert.deepEqual(
    getMarketCloseSeparator(candles, 'M1', utcSeconds(2026, 6, 4, 7, 5)),
    {
      time: utcSeconds(2026, 6, 4, 7, 4),
      index: 1,
      type: 'market_close',
    },
  );
});

test('does not create a market close separator before the visible candle range', () => {
  const candles = [
    candle(utcSeconds(2026, 6, 4, 7, 3)),
    candle(utcSeconds(2026, 6, 4, 7, 4)),
  ];

  assert.equal(getMarketCloseSeparator(candles, 'M1', utcSeconds(2026, 6, 4, 7, 2)), null);
});

test('uses broker-aligned daily starts and accepts millisecond close timestamps', () => {
  const daily = 24 * 60 * 60;
  const brokerRollover = utcSeconds(2026, 6, 1, 17, 0);
  const candles = [
    candle(brokerRollover),
    candle(brokerRollover + daily),
    candle(brokerRollover + 2 * daily),
  ];

  assert.deepEqual(
    getMarketCloseSeparator(candles, 'D1', (brokerRollover + 2 * daily) * 1000),
    {
      time: brokerRollover + daily,
      index: 1,
      type: 'market_close',
    },
  );
});
