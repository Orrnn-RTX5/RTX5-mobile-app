import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getActiveCandleSourceMode,
  resolveCurrentVisibleSeries,
  resolveVisibleSeriesMode,
  shouldAdoptCachedSeries,
  shouldKeepBootstrappingOnHistoryFailure,
  shouldRenderBootstrapPreview,
  shouldRouteBackendCandlePayloads,
  shouldSyncVisibleSeriesCache,
  shouldUseServerCandleStream,
} from './liveCandlesEnginePolicy';

const makeCandle = (time: number) => ({ time });

const withEnv = (nextEnv: Record<string, string | undefined>, run: () => void): void => {
  const previous = Object.fromEntries(
    Object.keys(nextEnv).map((key) => [key, process.env[key]]),
  ) as Record<string, string | undefined>;

  Object.entries(nextEnv).forEach(([key, value]) => {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });

  try {
    run();
  } finally {
    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  }
};

test('active candle source defaults to quote-built candles until a server contract is proven', () => {
  withEnv(
    {
      EXPO_PUBLIC_CANDLE_SOURCE_MODE: undefined,
      EXPO_PUBLIC_ENABLE_SERVER_CANDLE_STREAMS: undefined,
      EXPO_PUBLIC_SERVER_CANDLES_PROVEN_COMPATIBLE: undefined,
      EXPO_PUBLIC_DISABLE_SERVER_CANDLE_STREAMS: undefined,
    },
    () => {
      assert.equal(getActiveCandleSourceMode(), 'quote');
      assert.equal(shouldUseServerCandleStream(), false);
      assert.equal(shouldRouteBackendCandlePayloads(), false);
    },
  );
});

test('server candle mode requires both an explicit request and proven compatibility', () => {
  withEnv(
    {
      EXPO_PUBLIC_CANDLE_SOURCE_MODE: 'server',
      EXPO_PUBLIC_ENABLE_SERVER_CANDLE_STREAMS: undefined,
      EXPO_PUBLIC_SERVER_CANDLES_PROVEN_COMPATIBLE: undefined,
      EXPO_PUBLIC_DISABLE_SERVER_CANDLE_STREAMS: undefined,
    },
    () => assert.equal(getActiveCandleSourceMode(), 'quote'),
  );

  withEnv(
    {
      EXPO_PUBLIC_CANDLE_SOURCE_MODE: 'server',
      EXPO_PUBLIC_SERVER_CANDLES_PROVEN_COMPATIBLE: 'true',
      EXPO_PUBLIC_DISABLE_SERVER_CANDLE_STREAMS: undefined,
    },
    () => {
      assert.equal(getActiveCandleSourceMode(), 'server');
      assert.equal(shouldUseServerCandleStream(), true);
      assert.equal(shouldRouteBackendCandlePayloads(), true);
    },
  );
});

test('active candle source can be forced back to quote mode for rollback', () => {
  withEnv(
    {
      EXPO_PUBLIC_CANDLE_SOURCE_MODE: 'quote',
      EXPO_PUBLIC_DISABLE_SERVER_CANDLE_STREAMS: undefined,
    },
    () => {
      assert.equal(getActiveCandleSourceMode(), 'quote');
      assert.equal(shouldUseServerCandleStream(), false);
    },
  );

  withEnv(
    {
      EXPO_PUBLIC_CANDLE_SOURCE_MODE: undefined,
      EXPO_PUBLIC_DISABLE_SERVER_CANDLE_STREAMS: 'true',
    },
    () => {
      assert.equal(getActiveCandleSourceMode(), 'quote');
      assert.equal(shouldRouteBackendCandlePayloads(), false);
    },
  );
});

test('shouldRenderBootstrapPreview remains disabled for the production policy', () => {
  assert.equal(shouldRenderBootstrapPreview(0, 0), false);
  assert.equal(shouldRenderBootstrapPreview(0, 1), false);
  assert.equal(shouldRenderBootstrapPreview(2, 0), false);
});

test('shouldAdoptCachedSeries accepts useful cache while entry is still bootstrapping', () => {
  const current = [makeCandle(200)];
  const cached = [makeCandle(100), makeCandle(160), makeCandle(220)];

  assert.equal(shouldAdoptCachedSeries('bootstrapping', 0, current, cached), true);
});

test('shouldAdoptCachedSeries rejects a shorter stale cache once the engine is ready', () => {
  const current = [makeCandle(100), makeCandle(160), makeCandle(220)];
  const cached = [makeCandle(100), makeCandle(160)];

  assert.equal(shouldAdoptCachedSeries('ready', current.length, current, cached), false);
});

test('shouldAdoptCachedSeries rejects an identical cache snapshot', () => {
  const current = [makeCandle(100), makeCandle(160), makeCandle(220)];

  assert.equal(shouldAdoptCachedSeries('ready', current.length, current, current), false);
});

test('resolveVisibleSeriesMode allows backend live data when history is absent', () => {
  assert.equal(resolveVisibleSeriesMode([], [makeCandle(220)], [makeCandle(160)], 'M1'), 'current');
  assert.equal(resolveVisibleSeriesMode([], [makeCandle(220)], [], 'M1'), 'current');
  assert.equal(resolveVisibleSeriesMode([], [], [], 'M1'), 'empty');
});

test('resolveVisibleSeriesMode always merges history and live without splitting detached gaps', () => {
  const history = [makeCandle(100), makeCandle(160), makeCandle(220)];
  const detachedLive = [makeCandle(520), makeCandle(580)];

  assert.equal(resolveVisibleSeriesMode(history, detachedLive, history, 'M1'), 'merged');
  assert.equal(resolveVisibleSeriesMode([makeCandle(100), makeCandle(160)], [makeCandle(220)], [makeCandle(160)], 'M1'), 'merged');
});

test('resolveCurrentVisibleSeries keeps the freshest live segment for API callers', () => {
  const liveOnly = [makeCandle(340), makeCandle(400)];
  const current = [makeCandle(100), makeCandle(160), makeCandle(220)];

  assert.deepEqual(
    resolveCurrentVisibleSeries([makeCandle(100), makeCandle(160)], liveOnly, current),
    liveOnly,
  );
  assert.deepEqual(resolveCurrentVisibleSeries([makeCandle(100), makeCandle(160)], [], current), current);
});

test('shouldSyncVisibleSeriesCache stores any non-empty canonical visible series', () => {
  assert.equal(shouldSyncVisibleSeriesCache('history', [makeCandle(100)], 'M1'), true);
  assert.equal(shouldSyncVisibleSeriesCache('merged', [makeCandle(100), makeCandle(160)], 'M1'), true);
  assert.equal(shouldSyncVisibleSeriesCache('current', [makeCandle(340)], 'M1'), true);
  assert.equal(shouldSyncVisibleSeriesCache('empty', [], 'M1'), false);
});

test('shouldKeepBootstrappingOnHistoryFailure stays true only while nothing is visible', () => {
  assert.equal(shouldKeepBootstrappingOnHistoryFailure(0, 0), true);
  assert.equal(shouldKeepBootstrappingOnHistoryFailure(1, 0), false);
  assert.equal(shouldKeepBootstrappingOnHistoryFailure(0, 2), false);
});
