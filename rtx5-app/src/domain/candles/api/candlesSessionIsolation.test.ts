import assert from 'node:assert/strict';
import test from 'node:test';

import { StaleBrokerSessionError } from '../../../api/brokerApi';
import {
  __resetActiveBrokerSessionForTests,
  activateBrokerSession,
  beginActiveBrokerSessionTransition,
} from '../../../state/activeBrokerSession';
import {
  commitCandleHistoryResponse,
  getCandleHistory,
} from './candles';

const activate = () => activateBrokerSession(beginActiveBrokerSessionTransition(), {
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

let originalFetch: typeof globalThis.fetch;
let originalHistoryPath: string | undefined;
let originalHistoryQueryStyle: string | undefined;

test.beforeEach(() => {
  __resetActiveBrokerSessionForTests();
  originalFetch = globalThis.fetch;
  originalHistoryPath = process.env.EXPO_PUBLIC_CANDLE_HISTORY_PATH;
  originalHistoryQueryStyle = process.env.EXPO_PUBLIC_CANDLE_HISTORY_QUERY_STYLE;
  process.env.EXPO_PUBLIC_CANDLE_HISTORY_PATH = 'candles';
  process.env.EXPO_PUBLIC_CANDLE_HISTORY_QUERY_STYLE = 'timeframeLimit';
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalHistoryPath === undefined) {
    delete process.env.EXPO_PUBLIC_CANDLE_HISTORY_PATH;
  } else {
    process.env.EXPO_PUBLIC_CANDLE_HISTORY_PATH = originalHistoryPath;
  }
  if (originalHistoryQueryStyle === undefined) {
    delete process.env.EXPO_PUBLIC_CANDLE_HISTORY_QUERY_STYLE;
  } else {
    process.env.EXPO_PUBLIC_CANDLE_HISTORY_QUERY_STYLE = originalHistoryQueryStyle;
  }
  __resetActiveBrokerSessionForTests();
});

test('candle history response carries the request epoch and rejects a later cache commit', async () => {
  const capture = activate();
  globalThis.fetch = (async () => new Response(JSON.stringify({
    symbol: 'EURUSD',
    timeframe: 'M1',
    candles: [
      { time: 1_700_000_040, open: 1.1, high: 1.2, low: 1.0, close: 1.15, volume: 10 },
      { time: 1_700_000_100, open: 1.15, high: 1.25, low: 1.1, close: 1.2, volume: 12 },
    ],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })) as typeof globalThis.fetch;

  const history = await getCandleHistory('EURUSD', 'M1', 2, {
    cacheNamespace: capture.session.cacheNamespace,
  });
  assert.equal(history.provenance.cacheNamespace, capture.session.cacheNamespace);

  beginActiveBrokerSessionTransition();
  assert.throws(
    () => commitCandleHistoryResponse(history, (current) => current.candles),
    StaleBrokerSessionError,
  );
});

test('candle history refuses a query namespace from another epoch before fetching', async () => {
  activate();
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    return new Response('[]');
  }) as typeof globalThis.fetch;

  await assert.rejects(
    getCandleHistory('EURUSD', 'M1', 2, { cacheNamespace: 'broker-a:10001:999' }),
    StaleBrokerSessionError,
  );
  assert.equal(fetchCalled, false);
});
