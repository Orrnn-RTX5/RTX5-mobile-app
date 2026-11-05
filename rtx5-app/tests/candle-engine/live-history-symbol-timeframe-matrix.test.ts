import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_CHART_SYMBOLS } from '../../src/features/chart/chartSymbolMetadata';
import {
  CANDLE_HISTORY_TIMEFRAMES,
  getExpectedNextCandleTime,
  normalizeSymbol,
} from '../../src/domain/candles/core/candles';
import { getBucketStart } from '../../src/domain/candles/core/timeframeUtils';
import {
  buildRestHistorySeedCandles,
  splitRestHistoryCandles,
} from '../../src/domain/candles/core/candleProvenance';
import { applyLiveCandleToCandleMap } from '../../src/domain/candles/series/liveCandleAggregator';
import {
  buildFreshHistoryLiveCandleSeries,
  materializeLiveCandleMap,
} from '../../src/domain/candles/series/freshHistoryLiveSeries';
import { createCandleChannel, extractCandlePayloadContext } from '../../src/domain/candles/ws/candlesSocketProtocol';
import type { Candle } from '../../src/domain/candles/core/candleTypes';
import {
  assertNoDuplicateCandleTimes,
  assertValidCandleSeries,
  makeBackendLiveCandle,
  makeCandle,
  makeTrustedHistoryCandle,
  secondsUtc,
} from '../support/candleTestUtils';

const SYMBOL_MATRIX = Object.freeze(
  Array.from(
    new Set(
      DEFAULT_CHART_SYMBOLS.flatMap((symbol) => [
        symbol,
        `${symbol}m`,
        `${symbol}.c`,
        `${symbol}pro`,
      ]),
    ),
  ),
);

const WS_TIMEFRAME_TOKEN: Record<string, string> = {
  M1: '1m',
  M5: '5m',
  M15: '15m',
  M30: '30m',
  H1: '1h',
  H4: '4h',
  D1: '1d',
  W1: '1w',
  MN: '1M',
};

const getBasePrice = (symbol: string, symbolIndex: number, timeframeIndex: number): number => {
  if (symbol.startsWith('BTC')) return 60_000 + timeframeIndex * 100;
  if (symbol.startsWith('ETH')) return 3_000 + timeframeIndex * 25;
  if (symbol.startsWith('XAU')) return 2_300 + timeframeIndex * 5;
  if (symbol.startsWith('XAG')) return 28 + timeframeIndex * 0.2;
  if (symbol.startsWith('XPD')) return 950 + timeframeIndex * 4;
  if (symbol.startsWith('XPT')) return 1_000 + timeframeIndex * 4;
  if (symbol.endsWith('JPY')) return 140 + symbolIndex * 0.1 + timeframeIndex * 0.01;
  return 1.05 + symbolIndex * 0.002 + timeframeIndex * 0.0001;
};

const makeMatrixCandle = (
  time: number,
  price: number,
  overrides: Partial<Candle> & Record<string, unknown> = {},
): Candle => {
  const step = Math.max(price * 0.0005, 0.0001);
  return makeCandle(time, {
    open: price,
    high: price + step * 2,
    low: price - step,
    close: price + step,
    volume: 10,
    ...overrides,
  });
};

test('REST history plus backend live candles generate cleanly for every default symbol and timeframe', () => {
  const baseTime = secondsUtc(2024, 0, 1, 0, 0, 0);

  SYMBOL_MATRIX.forEach((rawSymbol, symbolIndex) => {
    const symbol = normalizeSymbol(rawSymbol);
    assert.ok(symbol, `symbol normalizes: ${rawSymbol}`);

    CANDLE_HISTORY_TIMEFRAMES.forEach((timeframe, timeframeIndex) => {
      const label = `${rawSymbol} -> ${symbol} ${timeframe}`;
      const start = getBucketStart(baseTime, timeframe);
      assert.notEqual(start, null, label);

      const t0 = start as number;
      const t1 = getExpectedNextCandleTime(t0, timeframe);
      const t2 = getExpectedNextCandleTime(t1, timeframe);
      const currentTime = getExpectedNextCandleTime(t2, timeframe);
      const nextTime = getExpectedNextCandleTime(currentTime, timeframe);
      const basePrice = getBasePrice(symbol, symbolIndex, timeframeIndex);

      const closedHistory = [
        makeTrustedHistoryCandle(t0, { ...makeMatrixCandle(t0, basePrice), serverTimeframe: timeframe }),
        makeTrustedHistoryCandle(t1, { ...makeMatrixCandle(t1, basePrice * 1.001), serverTimeframe: timeframe }),
        makeTrustedHistoryCandle(t2, { ...makeMatrixCandle(t2, basePrice * 1.002), serverTimeframe: timeframe }),
      ];
      const restCurrent = makeMatrixCandle(currentTime, basePrice * 1.003, {
        closed: false,
        source: 'rest_current',
      });

      const { closedHistory: trustedClosed, currentCandle } = splitRestHistoryCandles(
        [...closedHistory, restCurrent],
        timeframe,
        'bid',
      );
      const seed = buildRestHistorySeedCandles(trustedClosed, currentCandle);
      assert.equal(seed.closedHistoryLastTime, t2, `${label} closed cutoff`);
      assert.equal(seed.currentCandleTime, currentTime, `${label} REST current`);

      const channel = createCandleChannel(rawSymbol, timeframe);
      assert.equal(channel, `candles.${symbol}.${WS_TIMEFRAME_TOKEN[timeframe]}`, `${label} channel`);
      assert.deepEqual(
        extractCandlePayloadContext({ channel, data: { candle: restCurrent } }),
        { symbol, tf: timeframe },
        `${label} payload context`,
      );

      const liveMap = new Map();
      const closedReplay = applyLiveCandleToCandleMap(
        liveMap,
        makeBackendLiveCandle(t2, {
          symbol,
          timeframe,
          open: basePrice * 9,
          high: basePrice * 9,
          low: basePrice * 9,
          close: basePrice * 9,
          volume: 1,
        }),
        timeframe,
        { historyCutoffTime: seed.closedHistoryLastTime },
      );
      assert.equal(closedReplay.ignored, true, `${label} rejects closed replay`);
      assert.equal(closedReplay.reason, 'older_than_history_cutoff', `${label} closed replay reason`);

      const currentLive = applyLiveCandleToCandleMap(
        liveMap,
        makeBackendLiveCandle(currentTime, {
          symbol,
          timeframe,
          ...makeMatrixCandle(currentTime, basePrice * 1.004, { volume: 20 }),
        }),
        timeframe,
        { historyCutoffTime: seed.closedHistoryLastTime },
      );
      const nextLive = applyLiveCandleToCandleMap(
        liveMap,
        makeBackendLiveCandle(nextTime, {
          symbol,
          timeframe,
          ...makeMatrixCandle(nextTime, basePrice * 1.005, { volume: 21 }),
        }),
        timeframe,
        { historyCutoffTime: seed.closedHistoryLastTime },
      );

      assert.equal(currentLive.ignored, false, `${label} current live accepted`);
      assert.equal(nextLive.ignored, false, `${label} next live accepted`);

      const liveCandles = materializeLiveCandleMap(liveMap, seed.closedHistoryLastTime);
      const visible = buildFreshHistoryLiveCandleSeries(
        seed.candles,
        liveCandles,
        timeframe,
        undefined,
        { closedHistoryLastTime: seed.closedHistoryLastTime },
      );

      assert.deepEqual(
        visible.map((candle) => candle.time),
        [t0, t1, t2, currentTime, nextTime],
        `${label} visible times`,
      );
      assert.equal(visible[2].close, closedHistory[2].close, `${label} closed history unchanged`);
      assert.equal(visible[3].close, currentLive.candle?.close, `${label} current live wins REST current`);
      assert.equal(visible[4].close, nextLive.candle?.close, `${label} next live appended`);
      assertNoDuplicateCandleTimes(visible, label);
      assertValidCandleSeries(visible, label);
    });
  });
});
