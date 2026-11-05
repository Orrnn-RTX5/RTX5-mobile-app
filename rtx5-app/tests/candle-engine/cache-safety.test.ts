import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';

import {
  MAX_CANDLE_CACHE_ENTRIES,
  MAX_PERSISTED_CANDLE_CACHE_ENTRIES,
  isRenderableCandleBootstrapSeed,
  isTrustworthyCandleBootstrapSeed,
  sortAndDedupeCandles,
} from '../../src/domain/candles/core/candles';
import { splitRestHistoryCandles } from '../../src/domain/candles/core/candleProvenance';
import { mergeHistoryIntoCandleCache, syncMergedCandleCache } from '../../src/domain/candles/state/candleCache';
import { CandleMemoryCache } from '../../src/domain/candles/stream/candleMemoryCache';
import { sanitizeCandlesForChart } from '../../src/domain/candles/normalization/chartAdapter';
import { useTradingState } from '../../src/state/tradingState';
import {
  __resetActiveBrokerSessionForTests,
  activateBrokerSession,
  beginActiveBrokerSessionTransition,
} from '../../src/state/activeBrokerSession';
import {
  buildContiguousHistory,
  makeCandle,
  makeBackendLiveCandle,
  makeTrustedHistoryCandle,
  secondsUtc,
} from '../support/candleTestUtils';

const resetCandleCache = () => {
  useTradingState.setState((state) => ({
    ...state,
    candles: {},
  }));
};

beforeEach(() => {
  __resetActiveBrokerSessionForTests();
  activateBrokerSession(beginActiveBrokerSessionTransition(), {
    brokerId: 'broker-a',
    accountLogin: '10001',
    apiBase: 'https://services.broker-a.example/api/v2',
    feedWsBase: 'wss://services.broker-a.example/ws/feed',
    feedStatusUrl: 'https://services.broker-a.example/ws/feed/status',
    servicesDomain: 'services.broker-a.example',
    investor: false,
    configVersion: 'cfg-1',
  }, {
    accessToken: 'access-a',
    refreshToken: '',
    expiresAt: '2099-01-01T00:00:00.000Z',
  });
  resetCandleCache();
});
afterEach(() => {
  resetCandleCache();
  __resetActiveBrokerSessionForTests();
});

test('old closed trusted cache can seed the chart when shape and recency are safe', () => {
  const now = secondsUtc(2024, 3, 22, 12, 10, 30);
  const cache = buildContiguousHistory(secondsUtc(2024, 3, 22, 12, 0, 0), 10, 'M1');

  assert.equal(isTrustworthyCandleBootstrapSeed(cache, 'M1'), true);
  assert.equal(isRenderableCandleBootstrapSeed(cache, 'M1', 8, 2, now), true);
});

test('thin live-only cache cannot seed the chart history path', () => {
  const liveOnly = [
    makeBackendLiveCandle(secondsUtc(2024, 3, 22, 12, 5, 0), { close: 1.3 }),
  ];

  assert.equal(isTrustworthyCandleBootstrapSeed(liveOnly, 'M1'), false);
  assert.equal(syncMergedCandleCache('EURUSD', 'M1', liveOnly, { canonical: true }), false);
  assert.equal(useTradingState.getState().candles['EURUSD.M1'], undefined);
});

test('backend M1 cache with market-close gaps can seed the chart', () => {
  const backendCache = [
    makeTrustedHistoryCandle(secondsUtc(2024, 3, 22, 12, 0, 0), { close: 1.1 }),
    makeTrustedHistoryCandle(secondsUtc(2024, 3, 22, 12, 1, 0), { close: 1.2 }),
    makeTrustedHistoryCandle(secondsUtc(2024, 3, 22, 12, 8, 0), { close: 1.3 }),
    makeTrustedHistoryCandle(secondsUtc(2024, 3, 22, 12, 9, 0), { close: 1.4 }),
    makeTrustedHistoryCandle(secondsUtc(2024, 3, 22, 12, 10, 0), { close: 1.5 }),
    makeTrustedHistoryCandle(secondsUtc(2024, 3, 22, 12, 11, 0), { close: 1.6 }),
    makeTrustedHistoryCandle(secondsUtc(2024, 3, 22, 12, 12, 0), { close: 1.7 }),
    makeTrustedHistoryCandle(secondsUtc(2024, 3, 22, 12, 13, 0), { close: 1.8 }),
  ];

  assert.equal(isTrustworthyCandleBootstrapSeed(backendCache, 'M1'), true);
  assert.equal(syncMergedCandleCache('EURUSD', 'M1', backendCache, { canonical: true }), true);
  assert.deepEqual(useTradingState.getState().candles['EURUSD.M1'], backendCache);
});

test('chart normalization can remove synthetic flat live candle tails after market close', () => {
  const realHistory = [
    makeTrustedHistoryCandle(secondsUtc(2024, 3, 22, 12, 0, 0), { close: 1.1 }),
    makeTrustedHistoryCandle(secondsUtc(2024, 3, 22, 12, 1, 0), { close: 1.2 }),
  ];
  const liveMove = {
    ...makeBackendLiveCandle(secondsUtc(2024, 3, 22, 12, 2, 0), { close: 1.25, volume: 4 }),
    source: 'live_candle' as const,
    closed: false,
  };
  const flatHeartbeatTail = [
    {
      time: secondsUtc(2024, 3, 22, 12, 3, 0),
      open: 1.25,
      high: 1.25,
      low: 1.25,
      close: 1.25,
      volume: 1,
      source: 'live_candle' as const,
      closed: false,
    },
    {
      time: secondsUtc(2024, 3, 22, 12, 4, 0),
      open: 1.25,
      high: 1.25,
      low: 1.25,
      close: 1.25,
      volume: 1,
      source: 'live_candle' as const,
      closed: false,
    },
  ];

  const normalized = sanitizeCandlesForChart([...realHistory, liveMove, ...flatHeartbeatTail], {
    timeframe: 'M1',
    pruneSyntheticFlatLiveTail: true,
  });

  assert.deepEqual(normalized.map((candle) => candle.time), [
    secondsUtc(2024, 3, 22, 12, 0, 0),
    secondsUtc(2024, 3, 22, 12, 1, 0),
    secondsUtc(2024, 3, 22, 12, 2, 0),
  ]);
});

test('chart normalization keeps synthetic-looking flat live tails while market is open', () => {
  const realHistory = [
    makeTrustedHistoryCandle(secondsUtc(2024, 3, 22, 12, 0, 0), { close: 1.1 }),
    makeTrustedHistoryCandle(secondsUtc(2024, 3, 22, 12, 1, 0), { close: 1.2 }),
  ];
  const flatLiveTail = {
    time: secondsUtc(2024, 3, 22, 12, 2, 0),
    open: 1.2,
    high: 1.2,
    low: 1.2,
    close: 1.2,
    volume: 1,
    source: 'live_candle' as const,
    closed: false,
  };

  const normalized = sanitizeCandlesForChart([...realHistory, flatLiveTail], { timeframe: 'M1' });

  assert.deepEqual(normalized.map((candle) => candle.time), [
    secondsUtc(2024, 3, 22, 12, 0, 0),
    secondsUtc(2024, 3, 22, 12, 1, 0),
    secondsUtc(2024, 3, 22, 12, 2, 0),
  ]);
});

test('chart normalization keeps real flat backend candles and positive-volume flat live candles', () => {
  const realFlatHistory = makeTrustedHistoryCandle(secondsUtc(2024, 3, 22, 12, 0, 0), {
    open: 1.2,
    high: 1.2,
    low: 1.2,
    close: 1.2,
    volume: 15,
  });
  const realFlatLive = {
    time: secondsUtc(2024, 3, 22, 12, 1, 0),
    open: 1.2,
    high: 1.2,
    low: 1.2,
    close: 1.2,
    volume: 3,
    source: 'live_candle' as const,
    closed: false,
  };

  const normalized = sanitizeCandlesForChart([realFlatHistory, realFlatLive], { timeframe: 'M1' });

  assert.deepEqual(normalized.map((candle) => candle.time), [
    secondsUtc(2024, 3, 22, 12, 0, 0),
    secondsUtc(2024, 3, 22, 12, 1, 0),
  ]);
});

test('in-memory candle cache keeps only the most recent chart contexts', () => {
  const cache = new CandleMemoryCache(2, 3);
  const first = buildContiguousHistory(secondsUtc(2024, 3, 22, 12, 0, 0), 5, 'M1');
  const second = buildContiguousHistory(secondsUtc(2024, 3, 22, 13, 0, 0), 5, 'M1');
  const third = buildContiguousHistory(secondsUtc(2024, 3, 22, 14, 0, 0), 5, 'M1');

  cache.set('S00001', 'M1', first);
  cache.set('S00002', 'M1', second);
  cache.set('S00003', 'M1', third);

  assert.equal(cache.get('S00001', 'M1').length, 0);
  assert.deepEqual(cache.get('S00002', 'M1').map((candle) => candle.time), second.slice(-3).map((candle) => candle.time));
  assert.deepEqual(cache.get('S00003', 'M1').map((candle) => candle.time), third.slice(-3).map((candle) => candle.time));
});

test('authenticated runtime cache retains at least ten visited chart contexts without growing the persisted cap', () => {
  assert.equal(MAX_CANDLE_CACHE_ENTRIES >= 10, true);
  assert.equal(MAX_PERSISTED_CANDLE_CACHE_ENTRIES, 8);

  const cache = new CandleMemoryCache();
  const startTime = secondsUtc(2024, 3, 22, 12, 0, 0);
  for (let index = 0; index < 10; index += 1) {
    cache.set(
      `S${String(index).padStart(5, '0')}`,
      'M1',
      buildContiguousHistory(startTime + index * 3600, 10, 'M1'),
    );
  }

  assert.equal(cache.get('S00000', 'M1').length, 10);
  assert.equal(cache.get('S00009', 'M1').length, 10);
});

test('zustand candle cache evicts older inactive histories instead of growing without bound', () => {
  const startTime = secondsUtc(2024, 3, 22, 12, 0, 0);

  for (let index = 0; index < MAX_CANDLE_CACHE_ENTRIES + 3; index += 1) {
    const symbol = `S${String(index).padStart(5, '0')}`;
    useTradingState.getState().setCandleHistory(
      symbol,
      'M1',
      buildContiguousHistory(startTime + index * 3600, 10, 'M1'),
    );
  }

  const keys = Object.keys(useTradingState.getState().candles);
  assert.equal(keys.length, MAX_CANDLE_CACHE_ENTRIES);
  assert.equal(keys.includes('S00000.M1'), false);
  assert.equal(keys.includes(`S${String(MAX_CANDLE_CACHE_ENTRIES + 2).padStart(5, '0')}.M1`), true);
});

test('cache dedupes unsorted candle times before use', () => {
  const unsorted = [
    makeTrustedHistoryCandle(180, { close: 1.3 }),
    makeTrustedHistoryCandle(60, { close: 1.1 }),
    makeTrustedHistoryCandle(120, { close: 1.2 }),
    makeTrustedHistoryCandle(120, { close: 1.25, high: 1.25 }),
  ];

  const normalized = sortAndDedupeCandles(unsorted);

  assert.deepEqual(normalized.map((candle) => candle.time), [60, 120, 180]);
  assert.equal(normalized[1].close, 1.25);
});

test('corrupted OHLC cache entries are rejected during normalization', () => {
  const corrupted = [
    makeCandle(60, { open: 1.2, high: 1.1, low: 1.0, close: 1.15 }),
    makeTrustedHistoryCandle(120, { close: 1.2 }),
  ];

  const normalized = sortAndDedupeCandles(corrupted);

  assert.deepEqual(normalized.map((candle) => candle.time), [120]);
});

test('REST history merge stores only closed REST history in the bootstrap cache', () => {
  const restPayload = [
    makeCandle(60, { close: 1.1 }),
    makeCandle(120, { close: 1.2 }),
    makeCandle(180, { close: 1.3 }),
  ];

  const stored = mergeHistoryIntoCandleCache('EURUSD', 'M1', restPayload);

  assert.deepEqual(stored.map((candle) => candle.time), [60, 120]);
  assert.deepEqual(useTradingState.getState().candles['EURUSD.M1'], stored);
});

test('same-time backend live candle does not overwrite trusted closed history', () => {
  const trusted = makeTrustedHistoryCandle(120, { close: 1.1 });
  const live = makeBackendLiveCandle(120, { close: 1.9 });

  assert.equal(syncMergedCandleCache('EURUSD', 'M1', [trusted, live], { canonical: true }), true);
  assert.equal(useTradingState.getState().candles['EURUSD.M1'][0].close, 1.1);
});

test('app restart during live candle relies on REST split to avoid trusting current candle', () => {
  const restartedPayload = [
    makeCandle(60, { close: 1.1 }),
    makeCandle(120, { close: 1.2 }),
    makeCandle(180, { close: 1.5 }),
  ];

  const { closedHistory, currentCandle } = splitRestHistoryCandles(restartedPayload, 'M1', 'bid');

  assert.deepEqual(closedHistory.map((candle) => candle.time), [60, 120]);
  assert.equal(currentCandle?.time, 180);
});
