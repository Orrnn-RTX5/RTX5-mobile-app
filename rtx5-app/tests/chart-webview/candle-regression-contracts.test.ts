import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  assertSourceContains,
  extractFunctionBody,
  readChartScreenSource,
} from '../support/chartSourceTestUtils';

// Reads either a single .ts module file or concatenates every .ts file in a
// module folder of the same name. Tests grep across the
// concatenation so contract assertions survive future internal splits.
const readModuleSource = (relativePath: string): string => {
  const filePath = join(process.cwd(), `${relativePath}.ts`);
  const folderPath = join(process.cwd(), relativePath);
  if (existsSync(filePath)) {
    return readFileSync(filePath, 'utf8');
  }
  if (existsSync(folderPath) && statSync(folderPath).isDirectory()) {
    return readdirSync(folderPath)
      .filter((entry) => entry.endsWith('.ts'))
      .map((entry) => readFileSync(join(folderPath, entry), 'utf8'))
      .join('\n');
  }
  throw new Error(`module source not found: ${relativePath}`);
};

const chartSource = readChartScreenSource();
const streamSource = readModuleSource('src/domain/candles/stream/liveCandleStream');
const socketSource = readModuleSource('src/domain/candles/ws/candlesSocket');
const socketServiceSource = readFileSync(
  join(process.cwd(), 'src/domain/candles/ws/candlesSocket/CandlesWebSocketService.ts'),
  'utf8',
);
const apiSource = readModuleSource('src/domain/candles/api/candles');
const customCandleRendererSource = readModuleSource('src/domain/candles/rendering/customCandlestickSeries');
const customCandleWebViewRendererSource = readModuleSource('src/domain/candles/rendering/customCandlestickSeriesWebView');

test('radial menu timeframe switch uses stable chart pipeline', () => {
  assertSourceContains(
    chartSource,
    /<ChartTapRadialMenu[\s\S]*onSelectTimeframe=\{handleTimeframeSelect\}/,
    'radial menu must dispatch into the same timeframe handler as the normal picker',
  );
  assertSourceContains(
    chartSource,
    /const handleTimeframeSelect = useCallback[\s\S]*setActiveDateRange\('auto'\)[\s\S]*setCustomDateValue\(null\)[\s\S]*chartWindows\.updateToolbarTargetContext\(\{ timeframe: nextTimeframe \}\)/,
    'timeframe handler must reset date range and route through the pane controller',
  );
  assertSourceContains(
    chartSource,
    /const chartWindows = useChartWindowsFeature\(\{[\s\S]*onCommitContext: commitChartWindowContext[\s\S]*chartWindowCommitContextImplementationRef\.current = warmChartContextAndCommit/,
    'pane controller must retain the warmed chart context commit pipeline',
  );
});

test('does not permanently blank chart after rapid switching', () => {
  assertSourceContains(
    chartSource,
    /const chartDataContextSig = useMemo\([\s\S]*chartSymbol[\s\S]*normalizeTimeframe\(chartTimeframe\)/,
    'symbol/timeframe switches must be tracked separately from WebView shell init',
  );
  assertSourceContains(
    chartSource,
    /const contextChanged = renderedDataContextSigRef\.current !== chartDataContextSig[\s\S]*\? 'full_reload'[\s\S]*: getChartSeriesUpdateMode/,
    'rapid symbol/timeframe switches must repaint data without waiting for CHART_READY reinit',
  );
  assertSourceContains(
    chartSource,
    /msg\.type === 'CHART_READY'[\s\S]*shouldAcceptChartReady\([\s\S]*hasHistoryCandles: readyHasHistoryCandles,[\s\S]*readCurrentProjectedChartCandles\(\)[\s\S]*const readyCandles = readyProjection\.candles[\s\S]*retainCurrentChartCandles\(readyCandles\)[\s\S]*readyInitSignature === readySnapshotInitSignature[\s\S]*issueChartDataPaintToken\([\s\S]*chartDataContextSig,[\s\S]*readyHasHistoryCandles,[\s\S]*\)[\s\S]*updateChartData\(\$\{JSON\.stringify\(mapped\)\}, \{[\s\S]*dataContextSig:[\s\S]*paintToken:[\s\S]*setLivePriceLineForContext\([\s\S]*readyVisibleLivePrice[\s\S]*chartDataContextSig[\s\S]*readyLiveRevision/,
    'CHART_READY must accept only the active context, retain its context-scoped projection, and acknowledge the latest projected candle plus Bid revision when its init snapshot is older',
  );
  assertSourceContains(
    chartSource,
    /msg\.type === 'CHART_DATA_PAINTED'[\s\S]*shouldAcceptChartDataPaint\([\s\S]*if \(!pendingPaint\.confirmsUsableChart\) \{[\s\S]*return;[\s\S]*setLastPaintedChartDataContextSig\(paintedDataContextSig\)/,
    'out-of-order symbol paint messages must not leave or clear loading for the wrong chart context',
  );
});

test('empty history and empty live data surfaces a no-market-data state', () => {
  assertSourceContains(
    chartSource,
    /const hasChartDataError = Boolean\([\s\S]*chartDataError && !candlesAvailable[\s\S]*\|\| chartSurfaceRecoveryExhausted[\s\S]*const isLoading =[\s\S]*!hasChartDataError[\s\S]*\(!chartCanvasReady \|\| !candlesAvailable \|\| chartDataLoading\)[\s\S]*!loadingFallback/,
    'native chart must keep loading visible before candles arrive while allowing real history errors through',
  );
  assertSourceContains(
    chartSource,
    /const isNoMarketData = !candlesAvailable && !isLoading && !isError && loadingFallback/,
    'native chart must stop showing only a blank shell when committed history remains unavailable',
  );
  assertSourceContains(
    chartSource,
    /No market data available/,
    'native chart must show an explicit no-data state when no backend candles are available',
  );
});

test('ignores stale symbol response', () => {
  assertSourceContains(
    streamSource,
    /entry\.requestId \+= 1[\s\S]*const requestId = entry\.requestId[\s\S]*entry\.abortController\?\.abort\(\)/,
    'new symbol/timeframe history loads must advance request id and abort older requests',
  );
  assertSourceContains(
    streamSource,
    /const symbol = entry\.symbol[\s\S]*const timeframe = entry\.timeframe[\s\S]*if \(!live \|\| live\.requestId !== requestId \|\| controller\.signal\.aborted\) \{[\s\S]*return/,
    'late history responses must be ignored by request id before touching active candles',
  );
  assertSourceContains(
    streamSource,
    /if \(event\.candle\.symbol && normalizeSymbol\(event\.candle\.symbol\) !== entry\.symbol\) \{[\s\S]*continue/,
    'live candles with an old symbol must be ignored before merge',
  );
});

test('ignores stale timeframe response', () => {
  assertSourceContains(
    streamSource,
    /entry\.requestId \+= 1[\s\S]*const requestId = entry\.requestId/,
    'timeframe reloads must carry a unique request id',
  );
  assertSourceContains(
    streamSource,
    /const candleTimeframe = normalizeTimeframeStrict\(event\.candle\.timeframe\)[\s\S]*if \(!candleTimeframe \|\| candleTimeframe !== entry\.timeframe\) \{[\s\S]*continue/,
    'live candles with an old timeframe must be ignored before merge',
  );
});

test('candle gateway history is isolated to one authenticated session epoch', () => {
  assertSourceContains(apiSource, /const sessionCapture = captureActiveBrokerSession\(\)/, 'API must capture one active session');
  assertSourceContains(
    apiSource,
    /commitApiJson\(result, cacheNamespace/,
    'parsed history must be committed only for the captured cache namespace',
  );
  assertSourceContains(
    apiSource,
    /const pathSymbol = encodeURIComponent\(requestedSymbol\)[\s\S]*\/\$\{route\.pathPrefix\}\/\$\{pathSymbol\}/,
    'candle gateway routes must include an encoded symbol path segment',
  );
  assert.doesNotMatch(apiSource, /PUBLIC_API_V1_BASE_URL|fetchPublicCandleHistory|HISTORY_API_KEY|\/history\/candles/);
});

test('candle websocket uses the authenticated broker session and selected broker identity', () => {
  // Candle data remains on the authenticated broker /ws/v2 socket. The broker
  // API owns URL and token construction so the service cannot drift from the
  // account/trading WebSocket contract.
  assert.doesNotMatch(
    socketServiceSource,
    /getStoredAccessToken/,
    'candle WS must not assemble account JWTs inside the socket service',
  );
  assert.doesNotMatch(apiSource, /skipAuth|useUserPreferences/);
  assertSourceContains(
    socketServiceSource,
    /import \{ brokerApi \} from '\.\.\/\.\.\/\.\.\/\.\.\/api\/brokerApi'/,
    'candle WS must resolve its authenticated URL through the broker API',
  );
  assertSourceContains(
    socketServiceSource,
    /const capture = captureActiveBrokerSession\(\)[\s\S]*!capture \|\| !resolveCandlesWsUrl\(capture\.session\.tradeWsBase\)[\s\S]*const identity = getActiveBrokerSessionIdentity\(capture\.session\)/,
    'candle WS must require the active session exact validated trade endpoint and capture its identity',
  );
  assertSourceContains(
    socketServiceSource,
    /nextUrl = await brokerApi\.getWebSocketUrl\(\)[\s\S]*!isActiveBrokerSessionCurrent\(identity\)[\s\S]*const wsUrl = this\.url;[\s\S]*const socket = new WebSocket\(wsUrl\)/,
    'candle WS must discard stale session URL resolution before opening the authenticated socket',
  );
  assertSourceContains(
    socketServiceSource,
    /private startTokenWatcher\(\): void[\s\S]*subscribeActiveBrokerSession[\s\S]*this\.tearDownSocketSafe\(\)[\s\S]*event\.activeSession\?\.tradeWsBase[\s\S]*this\.connect\(\)/,
    'candle WS must synchronously drop and reconnect on immutable session transitions',
  );
  assertSourceContains(
    socketServiceSource,
    /this\.ws !== socket \|\|[\s\S]*!isActiveBrokerSessionCurrent\(identity\)[\s\S]*socket\.close\(\)/,
    'candle WS callbacks must reject a socket from a stale broker session epoch',
  );
  assert.doesNotMatch(
    socketServiceSource,
    /anonymousFallbackToken|retryPublicChannelWithoutToken|appendCandleWsToken|appendCandleWsBrokerId/,
    'candle WS must not depend on legacy public or locally assembled auth fallbacks',
  );
});

test('candle websocket call sites guard against stale-prototype singletons (HMR safety)', () => {
  // Under hot-module-reload the singleton instance can pre-date a method that
  // was added to the class. Crashing the chart with "this.X is not a function"
  // is unacceptable — guard the new methods with typeof checks and fall back
  // to inline cleanup in the WS teardown path.
  assertSourceContains(
    socketSource,
    /if \(typeof this\.startTokenWatcher === 'function'\) \{[\s\S]*this\.startTokenWatcher\(\)/,
    'candle WS connect() must guard the startTokenWatcher call so a stale singleton cannot crash the chart',
  );
  assertSourceContains(
    socketSource,
    /if \(typeof this\.stopTokenWatcher === 'function'\) \{[\s\S]*this\.stopTokenWatcher\(\)/,
    'candle WS disconnect() must guard the stopTokenWatcher call',
  );
  assertSourceContains(
    socketSource,
    /private tearDownSocketSafe\(\): void \{[\s\S]*if \(typeof this\.teardownSocket === 'function'\)[\s\S]*const socket = this\.ws[\s\S]*this\.ws = null/,
    'candle WS must expose a fallback teardown that works even if teardownSocket is missing on a stale prototype',
  );
});

test('prefetch history result does not overwrite a newer authoritative loadHistory state', () => {
  assertSourceContains(
    streamSource,
    /liveEntry &&[\s\S]*candles\.length > 0 &&[\s\S]*liveEntry\.requestId === 0 &&[\s\S]*!liveEntry\.historyLoading/,
    'prefetch must skip applying its result if a real loadHistory has already run or is running',
  );
});

test('reconnect safe subscription path resubscribes without polluting current symbol or timeframe', () => {
  assertSourceContains(
    socketSource,
    /socket\.onopen = \(\) => \{[\s\S]*this\.startStableConnectionTimer\(socket, identity\)[\s\S]*this\.sendSubscriptions\(\)/,
    'candle socket must resubscribe after reconnect without treating open alone as a stable connection',
  );
  assertSourceContains(
    socketSource,
    /resolveFullJitterBackoffMs\(\{[\s\S]*attempt: this\.reconnectAttempts[\s\S]*isActiveBrokerSessionCurrent\(identity\)/,
    'reconnect must use full jitter and remain scoped to the captured session identity',
  );
  assertSourceContains(
    socketSource,
    /const candidates = states\.filter\(\(state\) => \{[\s\S]*if \(symbol && state\.symbol !== symbol\) return false[\s\S]*if \(tf && state\.tf !== tf\) return false/,
    'ambiguous replayed backend candle messages must be routed only to matching subscriptions',
  );
  assertSourceContains(
    socketSource,
    /if \(candidates\.length === 1\) \{[\s\S]*liveCandlesEngine\.ingestLiveCandle\(item, candidates\[0\]\.symbol, candidates\[0\]\.tf\)/,
    'backend candle payloads without full context must only be accepted for exactly one active subscription',
  );
});

test('previous candles stay in the WebView raw buffer during live update', () => {
  const applyTickBody = extractFunctionBody(chartSource, 'applyTickUpdate');

  assertSourceContains(
    chartSource,
    /function upsertRawSeriesDatum\(tick\)[\s\S]*lastRawSeriesData\[lastIndex\] = normalized[\s\S]*lastRawSeriesData\.push\(normalized\)/,
    'WebView incremental updates must replace latest candle or append exactly one candle',
  );
  assertSourceContains(
    applyTickBody,
    /currentSeriesLength = lastRawSeriesData\.length/,
    'incremental updates must not truncate the retained raw history buffer',
  );
});

test('zoom/data-density path does not convert candlesticks into line data', () => {
  assertSourceContains(
    chartSource,
    /series = window\.addRTX5CustomCandlestickSeries\(chart,[\s\S]*bodyUpColor: colors\.bodyUp[\s\S]*bodyDownColor: colors\.bodyDown/,
    'candle chart modes must use the RTX5 custom candlestick series, not a line series',
  );
  assertSourceContains(
    chartSource,
    /const buildChartTickPayload = \([\s\S]*if \(chartType === 'line' \|\| chartType === 'area'\) \{[\s\S]*return \{ time: candle\.time, value: candle\.close \}/,
    'line and area chart modes must emit close-value series points',
  );
  assertSourceContains(
    chartSource,
    /const buildChartTickPayload = \([\s\S]*return \{[\s\S]*open: candle\.open[\s\S]*high: candle\.high[\s\S]*low: candle\.low[\s\S]*close: candle\.close/,
    'candlestick update payload must preserve full OHLC for wick rendering',
  );
});

test('dense zoomed-out custom candles render as a continuous colored line', () => {
  assertSourceContains(
    customCandleRendererSource,
    /const DENSE_CANDLE_LINE_MAX_BAR_SPACING = 3\.25/,
    'custom candle renderer must define the dense spacing threshold',
  );
  assertSourceContains(
    customCandleRendererSource,
    /const fillDenseCandleLine = \([\s\S]*Math\.min\(geometry\.wickTop, geometry\.bodyTop, geometry\.bodyBottom\)[\s\S]*Math\.max\(geometry\.wickBottom, geometry\.bodyTop, geometry\.bodyBottom\)[\s\S]*ctx\.fillRect/,
    'custom candle renderer must draw one continuous high-low rect at dense spacing',
  );
  assertSourceContains(
    customCandleRendererSource,
    /if \(shouldRenderDenseCandleAsLine\(bitmapBarSpacing, bodyWidth, horizontalPixelRatio\)\) \{[\s\S]*fillDenseCandleLine\(context, geometry, wickColor\)[\s\S]*continue/,
    'custom candle renderer must bypass separate wick/body drawing in dense mode',
  );
  assertSourceContains(
    customCandleWebViewRendererSource,
    /function shouldRenderDenseCandleAsLine\(barSpacing, bodyWidth, pixelRatio\)[\s\S]*barSpacing <= DENSE_CANDLE_LINE_MAX_BAR_SPACING/,
    'native WebView renderer string must keep the same dense-line rule',
  );
});

test('chart adapter never sends malformed candlestick objects to setData', () => {
  const sanitizerBody = extractFunctionBody(chartSource, 'sanitizeSeriesData');
  const normalizerBody = extractFunctionBody(chartSource, 'normalizeRawSeriesDatum');

  assertSourceContains(
    sanitizerBody,
    /var normalized = normalizeRawSeriesDatum\(data\[i\]\)[\s\S]*byTime\[key\] = mergeRawSeriesDatum\(byTime\[key\], normalized\)/,
    'WebView must sanitize, sort, and merge duplicate candle data before setData',
  );
  assertSourceContains(
    normalizerBody,
    /isFiniteNumber\(open\)[\s\S]*isFiniteNumber\(rawHigh\)[\s\S]*isFiniteNumber\(rawLow\)[\s\S]*isFiniteNumber\(close\)/,
    'WebView must reject incomplete candle objects before chart update',
  );
  assertSourceContains(
    normalizerBody,
    /rawHigh < open[\s\S]*rawHigh < close[\s\S]*rawHigh < rawLow[\s\S]*rawLow > open[\s\S]*rawLow > close[\s\S]*rawLow > rawHigh/,
    'WebView must reject impossible OHLC ranges before chart update',
  );
  assert.doesNotMatch(
    normalizerBody,
    /isRawSeriesDatumInternallyCoherent/,
    'WebView must not drop a finite backend OHLC candle because its wick is large',
  );
  assert.doesNotMatch(
    sanitizerBody,
    /filterRawSeriesDataByPriceContinuity/,
    'WebView must not drop valid backend candles using a price-continuity heuristic',
  );
  assert.doesNotMatch(
    chartSource,
    /trimTrailingFlatRawSeriesOutlier|isRawSeriesFlatLineDatum/,
    'WebView must not blindly delete flat tail candles without host-side provenance',
  );
});

test('broker-neutral projected candle and exact backend Bid update through one revisioned atomic bridge payload', () => {
  assert.doesNotMatch(
    chartSource,
    /resolveLivePriceCoherentCandles/,
    'ChartScreen must not rebuild display candles through the retired React quote-merging helper',
  );
  assertSourceContains(
    chartSource,
    /const chartLiveTickAccumulatorRef = useRef<ChartLiveTickAccumulator \| null>\(null\)[\s\S]*const accumulateCurrentChartBid = useCallback\([\s\S]*accumulateChartBidTick\(chartLiveTickAccumulatorRef\.current,[\s\S]*contextKey: chartDataContextSig,[\s\S]*timeframe: chartTimeframe/,
    'ChartScreen must project Bid through one broker-neutral accumulator keyed by the complete chart context',
  );
  assertSourceContains(
    chartSource,
    /const exactQuote = readExactChartQuoteForScope\([\s\S]*accumulateCurrentChartBid\(exactQuote, canonicalCandles\)[\s\S]*const projection = projectChartLiveTickCandles\([\s\S]*const canonicalLastCandle = renderableCandles\[renderableCandles\.length - 1\][\s\S]*const lastCandle = mappedRenkoData[\s\S]*canonicalLastCandle[\s\S]*const exactBidLine = exactQuote \? canonicalLastCandle\.close : null[\s\S]*candle: buildChartTickPayload\(lastCandle, chartType\),[\s\S]*livePrice: exactBidLine,[\s\S]*showLivePriceLine: shouldShowExactBidLine,[\s\S]*revision,[\s\S]*updateLiveTick\(/,
    'ChartScreen must project exact Bid into forming OHLC before candle and line cross one revisioned bridge call',
  );
  assertSourceContains(
    chartSource,
    /const releaseQuoteDemand = isPublicDemoMarket[\s\S]*orrnnDemoPublicMarketSocket\.subscribeToSymbol\([\s\S]*retainLatestChartTradeDisplayQuote[\s\S]*quotesWsService\.subscribeToSymbol\([\s\S]*retainLatestChartTradeDisplayQuote/,
    'public demo and authenticated brokers must feed the same direct atomic Chart callback',
  );
  assert.doesNotMatch(
    chartSource,
    /pendingMarketPriceLinesRef|requestMarketPriceLineFlush|flushPendingMarketPriceLines/,
    'the Bid line must not run through an independent delayed queue',
  );
});
