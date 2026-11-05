import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  buildCandleHistorySearchParams,
  extractCandleHistoryPayload,
  getCandleHistoryRequestTimeframes,
  resolveCandleHistoryRouteContract,
} from './candleHistoryQuery';
import {
  CANDLE_HISTORY_TIMEFRAMES,
  DEFAULT_CANDLE_HISTORY_LIMIT,
  MAX_CANDLE_SERIES_LENGTH,
  getTimeframeSeconds,
} from '../core/candles';

test('extractCandleHistoryPayload accepts raw array responses from /api/v2/candles', () => {
  const candles = [
    { time: 1775738220, open: 1.1, high: 1.2, low: 1.0, close: 1.15, volume: 90 },
    { time: 1775738280, open: 1.15, high: 1.21, low: 1.12, close: 1.18, volume: 95 },
  ];

  const extracted = extractCandleHistoryPayload(candles);

  assert.deepEqual(extracted.candles, candles);
  assert.equal(extracted.symbol, undefined);
  assert.equal(extracted.timeframe, undefined);
});

test('extractCandleHistoryPayload accepts wrapped candle payloads', () => {
  const payload = {
    symbol: 'eurusd',
    timeframe: 'm1',
    candles: [{ time: 1775738220, open: 1.1, high: 1.2, low: 1.0, close: 1.15, volume: 90 }],
  };

  const extracted = extractCandleHistoryPayload(payload);

  assert.equal(extracted.symbol, 'eurusd');
  assert.equal(extracted.timeframe, 'm1');
  assert.equal(extracted.candles.length, 1);
});

test('extractCandleHistoryPayload accepts nested data wrappers used by some gateways', () => {
  const payload = {
    data: {
      symbol: 'XAUUSD',
      tf: 'H1',
      items: [{ time: 1775738220, open: 3020, high: 3024, low: 3018, close: 3022, volume: 14 }],
    },
  };

  const extracted = extractCandleHistoryPayload(payload);

  assert.equal(extracted.symbol, 'XAUUSD');
  assert.equal(extracted.timeframe, 'H1');
  assert.equal(extracted.candles.length, 1);
});

test('buildCandleHistorySearchParams anchors history requests with Unix-second bounds', () => {
  const params = buildCandleHistorySearchParams('m1', 500, {
    from: 1775738200900,
    to: 1775738800400,
  });

  assert.equal(params.get('timeframe'), 'M1');
  assert.equal(params.get('limit'), '500');
  assert.equal(params.get('from'), '1775738200');
  assert.equal(params.get('to'), '1775738800');
});

test('buildCandleHistorySearchParams maps chart timeframe aliases to REST labels', () => {
  const params = buildCandleHistorySearchParams('1m', 500);
  const monthlyParams = buildCandleHistorySearchParams('MN1', 500);

  assert.equal(params.get('timeframe'), 'M1');
  assert.equal(monthlyParams.get('timeframe'), 'MN');
});

test('buildCandleHistorySearchParams supports backend tf/count query style', () => {
  const params = buildCandleHistorySearchParams('m1', 500, undefined, 'tfCount');

  assert.equal(params.get('tf'), 'M1');
  assert.equal(params.get('count'), '500');
  assert.equal(params.has('timeframe'), false);
  assert.equal(params.has('limit'), false);
});

test('getCandleHistoryRequestTimeframes requests only the selected backend timeframe', () => {
  assert.deepEqual(CANDLE_HISTORY_TIMEFRAMES, ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN']);
  assert.deepEqual(getCandleHistoryRequestTimeframes('M1'), ['M1']);
  assert.deepEqual(getCandleHistoryRequestTimeframes('1m'), ['M1']);
  assert.deepEqual(getCandleHistoryRequestTimeframes('H1'), ['H1']);
  assert.deepEqual(getCandleHistoryRequestTimeframes('W1'), ['W1']);
  assert.deepEqual(getCandleHistoryRequestTimeframes('MN'), ['MN']);
  assert.deepEqual(getCandleHistoryRequestTimeframes('M3'), []);
  assert.deepEqual(getCandleHistoryRequestTimeframes('3m'), []);
  assert.deepEqual(getCandleHistoryRequestTimeframes('H2'), []);
  assert.deepEqual(getCandleHistoryRequestTimeframes('2h'), []);
  assert.deepEqual(getCandleHistoryRequestTimeframes('bad-period'), []);
});

test('candle history uses one explicit release contract and fails closed otherwise', () => {
  // Explicit empty override must fail closed (do not fall through to ambient process.env).
  assert.equal(resolveCandleHistoryRouteContract({
    EXPO_PUBLIC_CANDLE_HISTORY_PATH: '',
    EXPO_PUBLIC_CANDLE_HISTORY_QUERY_STYLE: '',
  }), null);
  assert.equal(resolveCandleHistoryRouteContract({
    EXPO_PUBLIC_CANDLE_HISTORY_PATH: '../candles',
    EXPO_PUBLIC_CANDLE_HISTORY_QUERY_STYLE: 'timeframeLimit',
  }), null);
  assert.deepEqual(resolveCandleHistoryRouteContract({
    EXPO_PUBLIC_CANDLE_HISTORY_PATH: '/market-data/candles/',
    EXPO_PUBLIC_CANDLE_HISTORY_QUERY_STYLE: 'tfCount',
  }), {
    pathPrefix: 'market-data/candles',
    queryStyle: 'tfCount',
  });
});

test('candle history contract reads EXPO_PUBLIC_* via static process.env access for OTA inlining', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/domain/candles/api/candleHistoryQuery.ts'), 'utf8');
  // Metro only inlines direct process.env.EXPO_PUBLIC_* reads in release/OTA bundles.
  // Using `env = process.env` then `env.EXPO_PUBLIC_*` leaves history unconfigured on device.
  assert.match(source, /process\.env\.EXPO_PUBLIC_CANDLE_HISTORY_PATH/);
  assert.match(source, /process\.env\.EXPO_PUBLIC_CANDLE_HISTORY_QUERY_STYLE/);
  assert.doesNotMatch(
    source,
    /=\s*process\.env\s*[,)]/,
    'must not default the env argument to the process.env object',
  );
});

test('default candle history request fills the chart buffer so M1 includes previous dates', () => {
  assert.equal(DEFAULT_CANDLE_HISTORY_LIMIT, MAX_CANDLE_SERIES_LENGTH);
  assert.equal(MAX_CANDLE_SERIES_LENGTH, 2_500);
  assert.ok(DEFAULT_CANDLE_HISTORY_LIMIT * getTimeframeSeconds('M1') > 24 * 60 * 60);
});

test('candle history loader binds authenticated JSON parsing to the active session namespace', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/domain/candles/api/candles.ts'), 'utf8');

  assert.match(source, /const sessionCapture = captureActiveBrokerSession\(\)/);
  assert.match(source, /const provenance = getActiveBrokerSessionProvenance\(sessionCapture\.session\)/);
  assert.match(source, /apiJsonClient<unknown>/);
  assert.match(source, /commitApiJson\(result, cacheNamespace/);
  assert.match(source, /fetchAuthenticatedCandleHistory\(/);
  assert.match(source, /resolveCandleHistoryRouteContract\(\)/);
  assert.doesNotMatch(source, /CANDLE_HISTORY_ROUTES/);
  assert.match(source, /const pathSymbol = encodeURIComponent\(requestedSymbol\)/);
  assert.doesNotMatch(source, /CANDLE_HISTORY_LOGIN_REQUIRED_MESSAGE/);
  assert.doesNotMatch(source, /skipAuth/);
  assert.doesNotMatch(source, /useUserPreferences/);
  assert.doesNotMatch(source, /PUBLIC_API_V1_BASE_URL/);
  assert.doesNotMatch(source, /fetchPublicCandleHistory/);
  assert.doesNotMatch(source, /candles\.publicHistory/);
});

test('chart candle surfaces start stream and hydration work only for an authenticated live session', () => {
  const hookSource = readFileSync(resolve(process.cwd(), 'src/domain/candles/hooks/useLiveCandles.ts'), 'utf8');
  const nativeChartSource = readFileSync(resolve(process.cwd(), 'src/features/chart/ChartScreen.native.tsx'), 'utf8');
  const webChartSource = readFileSync(resolve(process.cwd(), 'src/features/chart/ChartScreen.web.tsx'), 'utf8');

  assert.match(hookSource, /const isLiveActive = active && isLoggedIn/);
  assert.match(hookSource, /if \(!isLiveActive \|\| !normalizedSymbol \|\| !normalizedTimeframe\)/);
  assert.match(hookSource, /if \(!normalizedSymbol \|\| !normalizedTimeframe\) \{[\s\S]*return emptyCandles/);
  assert.doesNotMatch(hookSource, /hasAuthenticatedCandleSession/);
  assert.match(nativeChartSource, /const chartDataActive = chartRuntimeActive/);
  assert.match(webChartSource, /const chartDataActive = isScreenFocused/);
  assert.doesNotMatch(nativeChartSource, /shouldShowChartLoginPrompt|CANDLE_HISTORY_LOGIN_REQUIRED_MESSAGE/);
  assert.doesNotMatch(webChartSource, /shouldShowChartLoginPrompt|CANDLE_HISTORY_LOGIN_REQUIRED_MESSAGE/);
});

test('candle history abort handling is safe in React Native without DOMException globals', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/domain/candles/api/candles.ts'), 'utf8');

  assert.match(source, /const isAbortSignalLike = \(value: unknown\)/);
  assert.match(source, /const isAbortError = \(error: unknown\)/);
  assert.doesNotMatch(source, /instanceof DOMException/);
  assert.doesNotMatch(source, /instanceof AbortSignal/);
});

test('contract v3 REST candles: M1-style timeframe, ascending by time, de-duplicated, gaps kept', async () => {
  const { normalizeCandleSeries } = await import('../core/candles');
  // REST never sends `1m` (400 INVALID_TIMEFRAME); the app timeframe maps to M1.
  assert.equal(buildCandleHistorySearchParams('1m', 2500).get('timeframe'), 'M1');
  assert.deepEqual(getCandleHistoryRequestTimeframes('1m'), ['M1']);

  const payload = extractCandleHistoryPayload({
    symbol: 'EURUSD',
    timeframe: 'M1',
    candles: [
      { time: 1790241480, open: 1.1377, high: 1.1378, low: 1.1376, close: 1.1377, volume: 5, tickCount: 5, isClosed: true },
      { time: 1790241360, open: 1.1376, high: 1.137625, low: 1.137205, close: 1.137205, volume: 129, tickCount: 129, isClosed: true },
      { time: 1790241360, open: 1.1376, high: 1.137625, low: 1.137205, close: 1.137205, volume: 129, tickCount: 129, isClosed: true },
    ],
  });
  const candles = normalizeCandleSeries(payload.candles, 'M1');
  assert.deepEqual(candles.map((candle) => candle.time), [1790241360, 1790241480]);
  // 1790241420 is missing and stays a gap: no synthetic bar is inserted.
  assert.equal(candles.length, 2);
});
