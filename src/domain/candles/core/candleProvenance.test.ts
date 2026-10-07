import assert from 'node:assert/strict';
import test from 'node:test';

import { getExpectedNextCandleTime, normalizeTimeframe } from './candles';
import { splitRestHistoryCandles } from './candleProvenance';
import type { TrustedHistoryCandle } from './candleProvenance';
import type { Candle } from '../../../state/tradingState';

const BASE_TIME = 1713744000;

const makeCandle = (time: number, close: number = 1.1, closed?: boolean): Candle & { closed?: boolean } => ({
  time,
  open: close,
  high: close,
  low: close,
  close,
  volume: 10,
  ...(closed === undefined ? {} : { closed }),
});

test('splitRestHistoryCandles treats the unmarked last REST candle as current/forming', () => {
  const { closedHistory, currentCandle } = splitRestHistoryCandles(
    [makeCandle(60, 1.1), makeCandle(120, 1.2), makeCandle(180, 1.3)],
    'M1',
    'bid',
  );

  assert.deepEqual(closedHistory.map((candle) => candle.time), [60, 120]);
  assert.equal(currentCandle?.time, 180);
  assert.equal(closedHistory[0].source, 'rest');
  assert.equal(closedHistory[0].closed, true);
});

test('splitRestHistoryCandles accepts an explicitly closed last REST candle', () => {
  const { closedHistory, currentCandle } = splitRestHistoryCandles(
    [makeCandle(60, 1.1), makeCandle(120, 1.2, true)],
    'M1',
    'bid',
  );

  assert.deepEqual(closedHistory.map((candle) => candle.time), [60, 120]);
  assert.equal(currentCandle, null);
});

test('splitRestHistoryCandles supports all chart timeframes including MN1 alias', () => {
  const timeframes = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN1'];

  for (const timeframe of timeframes) {
    const normalizedTimeframe = normalizeTimeframe(timeframe);
    const nextTime = getExpectedNextCandleTime(BASE_TIME, normalizedTimeframe);
    const { closedHistory } = splitRestHistoryCandles(
      [
        makeCandle(BASE_TIME, 1.1, true),
        makeCandle(nextTime, 1.2, true),
      ],
      normalizedTimeframe,
      'bid',
    );

    assert.equal(closedHistory.length, 2, timeframe);
    assert.equal(closedHistory[0].serverTimeframe, normalizedTimeframe);
  }
});

test('D1 bucket stepping stays calendar-based so backend weekend gaps remain explicit', () => {
  const fridayOpen = 1713484800;
  const saturdayOpen = 1713571200;

  assert.equal(getExpectedNextCandleTime(fridayOpen, 'D1'), saturdayOpen);
});

test('splitRestHistoryCandles does not let same-time live data rewrite trusted REST history', () => {
  const trusted: TrustedHistoryCandle = {
    ...makeCandle(120, 1.1),
    source: 'rest',
    closed: true,
    priceBasis: 'bid',
    serverTimeframe: 'M1',
  };
  const live: Candle & { source: 'live_candle'; closed: false } = {
    ...makeCandle(120, 1.5),
    source: 'live_candle',
    closed: false,
  };

  const { closedHistory, currentCandle } = splitRestHistoryCandles([trusted, live], 'M1', 'bid');

  assert.equal(closedHistory.length, 1);
  assert.equal(closedHistory[0].close, 1.1);
  assert.equal(currentCandle?.close, 1.5);
});
