import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  buildFeedCandleHistoryUrl,
  fetchFeedCandleRows,
  resolveFeedCandleTimeframe,
} from './feedCandleHistory';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

test('feed history URL matches the web terminal: service root, v1, symbol/tf/limit', () => {
  assert.equal(
    buildFeedCandleHistoryUrl('https://trivanta.orrnn.com/', 'xauusd', 'M1', 120),
    'https://trivanta.orrnn.com/api/v1/candles?symbol=XAUUSD&tf=1m&limit=120',
  );
  assert.equal(
    buildFeedCandleHistoryUrl('https://service.orrnn.com', 'EURUSD', 'H4', 5000),
    'https://service.orrnn.com/api/v1/candles?symbol=EURUSD&tf=4h&limit=500',
  );
  // W1/MN have no feed timeframe; nothing to request.
  assert.equal(buildFeedCandleHistoryUrl('https://service.orrnn.com', 'EURUSD', 'W1', 50), '');
  assert.equal(buildFeedCandleHistoryUrl('', 'EURUSD', 'M1', 50), '');
  assert.deepEqual(
    ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN'].map(resolveFeedCandleTimeframe),
    ['1m', '5m', '15m', '30m', '1h', '4h', '1d', null, null],
  );
});

test('feed history returns the exact selection rows without auth headers', async (t) => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    return jsonResponse({
      symbol: 'XAUUSD',
      tf: '1m',
      count: 2,
      candles: [
        { symbol: 'XAUUSD', tf: '1m', time: 1_790_664_600, open: 4143.7, high: 4144.35, low: 4139.085, close: 4140.395, volume: 220, closed: true },
        { symbol: 'XAUUSD', tf: '1m', time: 1_790_664_660, open: 4140.045, high: 4142.58, low: 4138.465, close: 4139.295, volume: 59, closed: false },
      ],
    });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const rows = await fetchFeedCandleRows('https://trivanta.orrnn.com', 'XAUUSD', 'M1', 120);

  assert.equal(rows.length, 2);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, 'https://trivanta.orrnn.com/api/v1/candles?symbol=XAUUSD&tf=1m&limit=120');
  const headers = new Headers(requests[0]?.init?.headers);
  assert.equal(headers.has('authorization'), false);
});

test('feed history rejects another selection, HTTP failures, and malformed bodies', async (t) => {
  const originalFetch = globalThis.fetch;
  let next: () => Response = () => jsonResponse({});
  globalThis.fetch = (async () => next()) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  next = () => jsonResponse({ symbol: 'EURUSD', tf: '1m', candles: [] });
  await assert.rejects(
    () => fetchFeedCandleRows('https://service.orrnn.com', 'XAUUSD', 'M1', 10),
    /different market selection/,
  );
  next = () => jsonResponse({ symbol: 'XAUUSD', tf: '5m', candles: [] });
  await assert.rejects(
    () => fetchFeedCandleRows('https://service.orrnn.com', 'XAUUSD', 'M1', 10),
    /different market selection/,
  );
  next = () => jsonResponse({ error: 'tf must be one of: 1m 5m 15m 30m 1h 4h 1d' }, 400);
  await assert.rejects(
    () => fetchFeedCandleRows('https://service.orrnn.com', 'XAUUSD', 'M1', 10),
    /HTTP 400/,
  );
  next = () => jsonResponse([]);
  await assert.rejects(
    () => fetchFeedCandleRows('https://service.orrnn.com', 'XAUUSD', 'M1', 10),
    /invalid response/,
  );
});

test('an unsupported feed timeframe reads nothing', async (t) => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = (async () => {
    requestCount += 1;
    return jsonResponse({ candles: [] });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  assert.deepEqual(await fetchFeedCandleRows('https://service.orrnn.com', 'XAUUSD', 'W1', 10), []);
  assert.equal(requestCount, 0);
});

test('broker chart history falls back to the live feed for an empty, failed, or stale initial window', () => {
  const source = readSource('src/domain/candles/api/candles.ts');

  // A 200 whose newest bar is far behind the live market is not usable history:
  // service.orrnn.com's v2 writer stalled at 2026-09-25T15:59Z while its
  // /api/v1/candles feed stayed current, and trusting the stale non-empty
  // answer left the XAUUSD chart looking history-less next to the live edge.
  assert.match(
    source,
    /const isInitialWindow = requestOptions\?\.from === undefined && requestOptions\?\.to === undefined;\s*const historyIsStale =\s*normalizedCandles\.length > 0 &&\s*!isRecentCandleBootstrapSeed\(normalizedCandles, resolvedTimeframe\);[\s\S]*?if \(\(normalizedCandles\.length === 0 \|\| historyIsStale\) && isInitialWindow\) \{/,
  );
  // Stale v2 bars are kept as older history and the feed's recent bars are
  // overlaid on top, deduped by bucket time, instead of replacing them.
  assert.match(
    source,
    /sortAndDedupeCandles\(\[\.\.\.normalizedCandles, \.\.\.feedCandles\]\)\.slice\(-count\)/,
  );
  assert.match(
    source,
    /fetchFeedCandleRows\(\s*toBrokerServiceRoot\(sessionCapture\.session\.apiBase\),\s*requestedSymbol,\s*requestedTimeframe,\s*count,\s*requestOptions\?\.signal,\s*\)/,
  );
  // Cancellation and session changes still abort the whole load.
  assert.match(
    source,
    /if \(isAbortError\(feedError\) \|\| feedError instanceof StaleBrokerSessionError\) \{\s*throw feedError;/,
  );
  // The fallback runs before the "no history" error is surfaced.
  assert.ok(
    source.indexOf('fetchFeedCandleRows(') <
      source.indexOf('if (normalizedCandles.length === 0 && !hadSuccessfulResponse && lastHttpError)'),
  );
  // Fallbacks and failures reach the in-app Journal, rate limited, through a
  // lazy require guarded by try/catch: no static React Native state import in
  // the candle engine (its node tests would no longer load) and no work at
  // app startup.
  assert.match(source, /const CHART_HISTORY_JOURNAL_INTERVAL_MS = 60_000;/);
  assert.doesNotMatch(source, /^import[^\n]*terminalJournalState/m);
  assert.match(
    source,
    /try \{\s*const journal = require\('\.\.\/\.\.\/\.\.\/state\/terminalJournalState'\)[\s\S]*journal\.recordAppActionJournalEvent\(\{ source: 'Network', level, message \}\);\s*\} catch \{/,
  );
  // Nothing chart-history related runs at module scope of the root layout
  // (a failure there closes the app before its first screen, and expo-updates
  // then rolls the update back, which is what happened to 1.1.45).
  const layout = readSource('app/_layout.tsx');
  assert.doesNotMatch(layout, /setChartHistoryDiagnosticsSink|domain\/candles\/api\/candles/);
});

test('a chart still without history after the 10 s fallback records its state in the Journal', () => {
  const source = readSource('src/features/chart/ChartScreen.native.tsx');

  assert.match(
    source,
    /if \(!chartRuntimeActive \|\| !loadingFallback \|\| candlesAvailable \|\| hasUsableRetainedChart\) \{\s*return;\s*\}[\s\S]*recordAppActionJournalEvent\(\{\s*source: 'Network',\s*level: 'error',/,
  );
  assert.match(source, /`Chart \$\{chartSymbol\} \$\{chartTimeframe\} has no history after 10 s: `/);
});
