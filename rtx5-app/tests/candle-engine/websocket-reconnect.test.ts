import assert from 'node:assert/strict';
import test from 'node:test';

import { applyLiveCandleToCandleMap } from '../../src/domain/candles/series/liveCandleAggregator';
import { createCandleMap, materializeCandleMap } from '../../src/domain/candles/series/candleSeriesMerger';
import { resolveVisibleSeriesMode } from '../../src/domain/candles/ws/liveCandlesEnginePolicy';
import {
  assertNoDuplicateCandleTimes,
  buildContiguousHistory,
  makeBackendLiveCandle,
  secondsUtc,
} from '../support/candleTestUtils';
import type { Candle } from '../../src/state/tradingState';

test('backend reconnect resumes with authoritative live candle snapshots', () => {
  const history = buildContiguousHistory(secondsUtc(2024, 3, 22, 12, 0, 0), 2, 'M1');
  const map = createCandleMap(history);
  const historyCutoffTime = history[history.length - 1].time;

  applyLiveCandleToCandleMap(
    map,
    {
      symbol: 'EURUSD',
      timeframe: 'M1',
      time: secondsUtc(2024, 3, 22, 12, 2, 5),
      open: 1.1,
      high: 1.12,
      low: 1.09,
      close: 1.11,
      volume: 5,
    },
    'M1',
    { historyCutoffTime },
  );
  const reconnectResult = applyLiveCandleToCandleMap(
    map,
    {
      symbol: 'EURUSD',
      timeframe: 'M1',
      time: secondsUtc(2024, 3, 22, 12, 2, 45),
      open: 1.1,
      high: 1.15,
      low: 1.08,
      close: 1.14,
      volume: 9,
    },
    'M1',
    { historyCutoffTime },
  );

  const visible = materializeCandleMap(map);
  assert.equal(reconnectResult.ignored, false);
  assert.deepEqual(visible[visible.length - 1], {
    time: secondsUtc(2024, 3, 22, 12, 2, 0),
    open: 1.1,
    high: 1.15,
    low: 1.08,
    close: 1.14,
    volume: 9,
  });
  assertNoDuplicateCandleTimes(visible);
});

test('reconnect snapshot at the history cutoff cannot rewrite closed REST history', () => {
  const history = buildContiguousHistory(secondsUtc(2024, 3, 22, 12, 0, 0), 2, 'M1');
  const map = createCandleMap(history);

  const result = applyLiveCandleToCandleMap(
    map,
    {
      symbol: 'EURUSD',
      timeframe: 'M1',
      time: history[history.length - 1].time + 10,
      open: 1.5,
      high: 1.6,
      low: 1.4,
      close: 1.55,
      volume: 99,
    },
    'M1',
    { historyCutoffTime: history[history.length - 1].time },
  );

  assert.equal(result.ignored, true);
  assert.equal(result.changed, false);
  assert.equal(result.reason, 'older_than_history_cutoff');
  assert.deepEqual(materializeCandleMap(map).map((candle) => candle.time), history.map((candle) => candle.time));
  assert.equal(materializeCandleMap(map)[materializeCandleMap(map).length - 1].close, history[history.length - 1].close);
});

test('missed buckets during disconnect remain a visible backend gap in one merged series', () => {
  const staleHistory = buildContiguousHistory(secondsUtc(2024, 3, 22, 12, 0, 0), 2, 'M1');
  const liveAfterReconnect = [makeBackendLiveCandle(secondsUtc(2024, 3, 22, 12, 8, 0), { close: 1.4 })];

  assert.equal(resolveVisibleSeriesMode(staleHistory, liveAfterReconnect, staleHistory, 'M1'), 'merged');

  const caughtUpHistory = buildContiguousHistory(secondsUtc(2024, 3, 22, 12, 0, 0), 8, 'M1');
  assert.equal(resolveVisibleSeriesMode(caughtUpHistory, liveAfterReconnect, staleHistory, 'M1'), 'merged');
});

test('backend live snapshots stay isolated by explicit symbol and timeframe before entering a chart series', () => {
  const eurUsdMap = createCandleMap();
  const xauUsdMap = createCandleMap();

  applyLiveCandleToCandleMap(
    eurUsdMap,
    { symbol: 'EURUSD', timeframe: 'M1', time: 60, open: 1.1, high: 1.2, low: 1.0, close: 1.15, volume: 1 },
    'M1',
  );
  applyLiveCandleToCandleMap(
    xauUsdMap,
    { symbol: 'XAUUSD', timeframe: 'M5', time: 300, open: 2300, high: 2305, low: 2299, close: 2301, volume: 1 },
    'M5',
  );

  const eurUsd: Candle[] = materializeCandleMap(eurUsdMap);
  const xauUsd: Candle[] = materializeCandleMap(xauUsdMap);
  assert.deepEqual(eurUsd.map((candle) => candle.time), [60]);
  assert.deepEqual(xauUsd.map((candle) => candle.time), [300]);
});
