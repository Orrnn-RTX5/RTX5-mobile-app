import assert from 'node:assert/strict';
import test from 'node:test';

import { applyLiveCandleToCandleMap } from '../../src/domain/candles/series/liveCandleAggregator';
import { createCandleMap, materializeCandleMap } from '../../src/domain/candles/series/candleSeriesMerger';
import { SUPPORTED_TIMEFRAMES, alignTimeToBucket, normalizeSymbol } from '../../src/domain/candles/core/candles';
import { secondsUtc } from '../support/candleTestUtils';

test('backend live candle applies the supplied OHLC without local price reconstruction', () => {
  const map = createCandleMap();
  const result = applyLiveCandleToCandleMap(
    map,
    {
      symbol: 'EURUSD',
      timeframe: 'M1',
      time: secondsUtc(2024, 3, 22, 12, 1, 10),
      open: 1.1000,
      high: 1.1040,
      low: 1.0980,
      close: 1.1015,
      volume: 27,
    },
    'M1',
  );

  assert.equal(result.ignored, false);
  assert.deepEqual(materializeCandleMap(map), [
    {
      time: secondsUtc(2024, 3, 22, 12, 1, 0),
      open: 1.1000,
      high: 1.1040,
      low: 1.0980,
      close: 1.1015,
      volume: 27,
    },
  ]);
});

test('invalid backend live OHLC is rejected before it reaches the chart', () => {
  const map = createCandleMap();
  const result = applyLiveCandleToCandleMap(
    map,
    {
      symbol: 'EURUSD',
      timeframe: 'M1',
      time: secondsUtc(2024, 3, 22, 12, 1, 0),
      open: 1.1000,
      high: 1.0990,
      low: 1.0980,
      close: 1.1015,
      volume: 27,
    },
    'M1',
  );

  assert.equal(result.ignored, true);
  assert.equal(result.reason, 'invalid_live_candle');
  assert.deepEqual(materializeCandleMap(map), []);
});

test('backend OHLC bucketing is identical for every supported symbol and timeframe', () => {
  const symbols = ['EURUSDm', 'XAUUSD', 'BTCUSD', 'USDJPY.c'];
  const eventTime = secondsUtc(2024, 3, 22, 10, 37, 1);

  symbols.forEach((rawSymbol, symbolIndex) => {
    SUPPORTED_TIMEFRAMES.forEach((timeframe, timeframeIndex) => {
      const map = createCandleMap();
      const symbol = normalizeSymbol(rawSymbol);
      const basePrice = 100 + symbolIndex * 1000 + timeframeIndex * 10;
      const expectedBucket = alignTimeToBucket(eventTime, timeframe);

      assert.notEqual(expectedBucket, null);
      const result = applyLiveCandleToCandleMap(
        map,
        {
          symbol,
          timeframe,
          time: eventTime,
          open: basePrice,
          high: basePrice + 2,
          low: basePrice - 1,
          close: basePrice + 1,
          volume: 10,
        },
        timeframe,
      );

      assert.equal(result.ignored, false, `${symbol} ${timeframe}`);
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
