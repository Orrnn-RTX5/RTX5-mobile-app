import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';

import { Candle, useTradingState } from '../../../state/tradingState';
import { mergeHistoryIntoCandleCache, syncMergedCandleCache } from './candleCache';
import type { TrustedHistoryCandle } from '../core/candleProvenance';
import { resetPersistedCandleCacheSession } from './persistedCandleCache';
import {
  __resetActiveBrokerSessionForTests,
  activateBrokerSession,
  beginActiveBrokerSessionTransition,
  captureActiveBrokerSessionProvenance,
} from '../../../state/activeBrokerSession';

type BackendLiveCandle = Candle & { source: 'live_candle'; closed: false };

const resetCandleCache = () => {
  useTradingState.setState((state) => ({
    ...state,
    candles: {},
  }));
};

const makeCandle = (time: number, close: number = 1.1): Candle => ({
  time,
  open: close,
  high: close,
  low: close,
  close,
  volume: 10,
});

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
  resetPersistedCandleCacheSession();
  resetCandleCache();
  __resetActiveBrokerSessionForTests();
});

test('mergeHistoryIntoCandleCache stores only trusted closed REST history', () => {
  const recentHistory: Candle[] = [
    makeCandle(60, 1.1),
    makeCandle(120, 1.2),
    makeCandle(180, 1.3),
  ];

  const merged = mergeHistoryIntoCandleCache('EURUSD', 'M1', recentHistory);

  assert.equal(merged.length, 2);
  assert.deepEqual(merged.map((candle) => candle.time), [60, 120]);
  assert.equal((merged[0] as TrustedHistoryCandle).source, 'rest');
  assert.equal((merged[0] as TrustedHistoryCandle).closed, true);
  assert.deepEqual(useTradingState.getState().candles['EURUSD.M1'], merged);
});

test('syncMergedCandleCache refuses to persist backend live candles as history', () => {
  const trusted: TrustedHistoryCandle = {
    ...makeCandle(60, 1.1),
    source: 'rest',
    closed: true,
    priceBasis: 'bid',
    serverTimeframe: 'M1',
  };
  const live: BackendLiveCandle = {
    ...makeCandle(120, 1.2),
    source: 'live_candle',
    closed: false,
  };

  assert.equal(syncMergedCandleCache('EURUSD', 'M1', [trusted, live], { canonical: true }), true);

  const cached = useTradingState.getState().candles['EURUSD.M1'];
  assert.equal(cached.length, 1);
  assert.equal(cached[0].time, trusted.time);
  assert.equal((cached[0] as TrustedHistoryCandle).source, 'rest');
  assert.equal((cached[0] as TrustedHistoryCandle).closed, true);
});

test('syncMergedCandleCache never promotes same-time backend live candle into closed history', () => {
  const trusted: TrustedHistoryCandle = {
    ...makeCandle(120, 1.1),
    source: 'rest',
    closed: true,
    priceBasis: 'bid',
    serverTimeframe: 'M1',
  };
  const live: BackendLiveCandle = {
    ...makeCandle(120, 1.5),
    source: 'live_candle',
    closed: false,
  };

  assert.equal(syncMergedCandleCache('EURUSD', 'M1', [trusted, live], { canonical: true }), true);

  const cached = useTradingState.getState().candles['EURUSD.M1'];
  assert.equal(cached.length, 1);
  assert.equal(cached[0].time, 120);
  assert.equal(cached[0].close, 1.1);
  assert.equal((cached[0] as TrustedHistoryCandle).source, 'rest');
  assert.equal((cached[0] as TrustedHistoryCandle).closed, true);
});

test('syncMergedCandleCache drops same-time backend live candle when no trusted REST candle exists', () => {
  const live: BackendLiveCandle = {
    ...makeCandle(120, 1.5),
    source: 'live_candle',
    closed: false,
  };

  assert.equal(syncMergedCandleCache('EURUSD', 'M1', [live], { canonical: true }), false);
  assert.equal(useTradingState.getState().candles['EURUSD.M1'], undefined);
});

test('syncMergedCandleCache is stable for unchanged trusted history', () => {
  const trusted: TrustedHistoryCandle[] = [
    {
      ...makeCandle(60, 1.1),
      source: 'rest',
      closed: true,
      priceBasis: 'bid',
      serverTimeframe: 'M1',
    },
    {
      ...makeCandle(120, 1.2),
      source: 'rest',
      closed: true,
      priceBasis: 'bid',
      serverTimeframe: 'M1',
    },
  ];

  assert.equal(syncMergedCandleCache('EURUSD', 'M1', trusted, { canonical: true }), true);
  assert.equal(syncMergedCandleCache('EURUSD', 'M1', trusted, { canonical: true }), false);
});

test('history from an old session provenance cannot write the new session candle cache', () => {
  const provenance = captureActiveBrokerSessionProvenance();
  assert.ok(provenance);
  beginActiveBrokerSessionTransition();

  const result = mergeHistoryIntoCandleCache(
    'EURUSD',
    'M1',
    [makeCandle(60), makeCandle(120), makeCandle(180)],
    { provenance },
  );

  assert.deepEqual(result, []);
  assert.equal(useTradingState.getState().candles['EURUSD.M1'], undefined);
});
