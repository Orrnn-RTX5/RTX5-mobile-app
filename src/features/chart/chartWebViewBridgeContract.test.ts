import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  assertSourceContains,
  extractFunctionBody,
  readChartScreenSource,
} from './testing/chartStabilityTestUtils';

const source = readChartScreenSource();
const readProjectSource = (relativePath: string): string => {
  const candidates = [
    resolve(process.cwd(), relativePath),
    resolve(process.cwd(), 'rtx5-app', relativePath),
  ];
  const filePath = candidates.find((candidate) => existsSync(candidate));
  if (!filePath) {
    throw new Error(`${relativePath} was not found from the test working directory`);
  }
  return readFileSync(filePath, 'utf8');
};
const chartWebViewHtmlSource = readProjectSource('src/features/chart/rendering/ChartWebViewHtml.ts');
const chartPriceScaleTypographySource = readProjectSource(
  'src/features/chart/chartPriceScaleTypography.ts',
);
const chartWebSource = readProjectSource('src/features/chart/ChartScreen.web.tsx');
const chartConstantsSource = readProjectSource('src/features/chart/ChartScreen.constants.ts');
const areaChartHistoryPolicySource = readProjectSource('src/features/chart/areaChartHistoryPolicy.ts');
const areaChartHistoryExpansionSource = readProjectSource('src/features/chart/useAreaChartHistoryExpansion.ts');
const customCandleOpacitySource = readProjectSource('src/domain/candles/rendering/customCandleOpacity.ts');
const customCandlestickSeriesSource = readProjectSource('src/domain/candles/rendering/customCandlestickSeries.ts');
const customCandlestickSeriesWebViewSource = readProjectSource('src/domain/candles/rendering/customCandlestickSeriesWebView.ts');
const chartTapRadialMenuSource = readProjectSource('src/features/chart/components/ChartTapRadialMenu.tsx');
const chartWindowsLayoutSource = readProjectSource('src/features/chart/components/ChartWindowsLayout.tsx');
const liveCandlesHookSource = readProjectSource('src/domain/candles/hooks/useLiveCandles.ts');
const liveCandleStreamManagerSource = readProjectSource('src/domain/candles/stream/liveCandleStream/manager.ts');
const liveCandleHistoryFetchingSource = readProjectSource('src/domain/candles/stream/liveCandleStream/historyFetching.ts');
const liveCandleStreamTypesSource = readProjectSource('src/domain/candles/stream/liveCandleStream/types.ts');
const navigationPrefetchSource = readProjectSource('src/utils/navigationPrefetch.ts');
const chartHistoryWarmupPolicySource = readProjectSource('src/market/chartHistoryWarmupPolicy.ts');
const quotesScreenSource = readProjectSource('src/features/quotes/QuotesScreen.tsx');
const enhancedDrawingToolsSource = readProjectSource('src/features/chart/plugins/enhancedDrawingToolsString.ts');

test('custom candle renderers lower main-chart contrast without changing saved schema colors', () => {
  const webViewOpacityBody = extractFunctionBody(
    customCandlestickSeriesWebViewSource,
    'resolveCustomCandleOpacity',
  );

  assertSourceContains(
    chartConstantsSource,
    /export const CHART_CANDLE_RENDER_OPACITY = 0\.72[\s\S]*export const CHART_BEARISH_CANDLE_RENDER_OPACITY = 0\.74/,
    'native and web main charts must keep green opacity stable and give red candles a tiny contrast increase',
  );
  assertSourceContains(
    customCandleOpacitySource,
    /typeof value === 'number' && Number\.isFinite\(value\)[\s\S]*Math\.min\(1, Math\.max\(0, value\)\)[\s\S]*: 1/,
    'web custom candle opacity must clamp finite values and safely fall back to one',
  );
  assertSourceContains(
    customCandlestickSeriesSource,
    /candleOpacity: 1[\s\S]*bearishCandleOpacity: 1[\s\S]*context\.globalAlpha = resolveRTX5CustomCandleOpacity\([\s\S]*isBullish \? this\.options\.candleOpacity : this\.options\.bearishCandleOpacity/,
    'web custom candles must default to full opacity and apply the correct bullish or bearish draw opacity',
  );
  assertSourceContains(
    customCandlestickSeriesSource,
    /candleOpacity: resolveRTX5CustomCandleOpacity\(candleOpacity\)[\s\S]*bearishCandleOpacity: resolveRTX5CustomCandleOpacity\(bearishCandleOpacity\)/,
    'web custom candle option builders must clamp both opacity overrides',
  );
  assertSourceContains(
    customCandlestickSeriesWebViewSource,
    /candleOpacity: 1[\s\S]*bearishCandleOpacity: 1[\s\S]*context\.globalAlpha = resolveCustomCandleOpacity\([\s\S]*isBullish \? self\._options\.candleOpacity : self\._options\.bearishCandleOpacity/,
    'native WebView custom candles must default to full opacity and apply the correct per-side override',
  );
  assertSourceContains(
    webViewOpacityBody,
    /typeof value === 'number' && isFinite\(value\)[\s\S]*Math\.min\(1, Math\.max\(0, value\)\)[\s\S]*: 1/,
    'native WebView candle opacity must clamp finite values and safely fall back to one',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /window\.addRTX5CustomCandlestickSeries\(chart, \{[\s\S]*candleOpacity: \$\{CHART_CANDLE_RENDER_OPACITY\}[\s\S]*bearishCandleOpacity: \$\{CHART_BEARISH_CANDLE_RENDER_OPACITY\}/,
    'native main-chart candles must receive the shared bullish and bearish presentation opacities',
  );
  assertSourceContains(
    chartWebSource,
    /buildRTX5CustomCandlestickSeriesOptions\(\{[\s\S]*candleOpacity: CHART_CANDLE_RENDER_OPACITY[\s\S]*bearishCandleOpacity: CHART_BEARISH_CANDLE_RENDER_OPACITY/,
    'web main-chart candles must receive the shared bullish and bearish presentation opacities',
  );
});

test('webview bridge: ChartScreen initializes chart only after WebView READY enables bridge', () => {
  assertSourceContains(
    source,
    /<WebView[\s\S]*scrollEnabled=\{false\}[\s\S]*nestedScrollEnabled[\s\S]*onLoadStart=/,
    'Android chart gestures must stay owned by the WebView instead of being cancelled by the parent ScrollView',
  );
  assertSourceContains(
    source,
    /onLoadStart=\{\(\) => \{[\s\S]*resetChartBridgeState\(\);[\s\S]*setWebViewReady\(false\);[\s\S]*\}\}[\s\S]*onContentProcessDidTerminate/,
    'every real WebView document load must clear stale bridge readiness before READY',
  );
  assertSourceContains(source, /msg\.type === 'READY'[\s\S]*resetChartBridgeState\(\)[\s\S]*setWebViewReady\(true\)/, 'READY must reset bridge state and enable WebView');
  assertSourceContains(source, /const sendInit = useCallback[\s\S]*if \(!webViewRef\.current \|\| !webViewReady\) return/, 'sendInit must wait for WebView readiness');
  assertSourceContains(source, /useEffect\(\(\) => \{[\s\S]*sendInit\(\);[\s\S]*\}, \[readRenderableCanonicalCandles, sanitizedCandles, sendInit\]\)/, 'sanitized candle or closed-session boundary arrival must trigger init after READY');
});

test('webview bridge: candles arriving before READY are retained and sent after readiness', () => {
  assertSourceContains(source, /const sanitizedBackendCandles = useMemo\([\s\S]*sanitizeCandlesForChart\(candles, \{[\s\S]*timeframe: chartTimeframe,[\s\S]*pruneSyntheticFlatLiveTail: shouldApplyClosedCandlePolicy,[\s\S]*closedMarketSessionClose: shouldApplyClosedCandlePolicy[\s\S]*closedCandlePolicySessionClose/, 'native host must clamp and prune backend candles only for a confirmed close or bounded reopen repair');
  assertSourceContains(source, /const sanitizedCandles = useMemo\([\s\S]*return sanitizedBackendCandles;[\s\S]*\[\s*sanitizedBackendCandles\s*\]/, 'native host must render backend candle data without live-quote candle synthesis');
  assert.doesNotMatch(source, /resolveLivePriceCoherentCandles/, 'native host must not build display candles from quote ticks');
  assertSourceContains(source, /const overlayCandles = sanitizedBackendCandles\.length > 0 \? sanitizedBackendCandles : sanitizedCandles/, 'overlay rebuilds must stay tied to backend candles when backend history exists');
  assertSourceContains(source, /buildChartOverlayMarkers\(\{[\s\S]*candles: overlayMarkerCandles/, 'candle/history markers must be isolated from live quote ticks');
  assertSourceContains(source, /buildChartOverlayPayload\(\{[\s\S]*candles: EMPTY_DISPLAY_CANDLES/, 'quote-driven overlay work must build price lines without rescanning candle history');
  assertSourceContains(source, /const candlesRef = useRef\(sanitizedCandles\)/, 'sanitized candles must be retained outside render timing');
  assertSourceContains(
    source,
    /useEffect\(\(\) => \{[\s\S]*const \{ projection \} = readCurrentProjectedChartCandles\(\);[\s\S]*retainCurrentChartCandles\(projection\.candles\);[\s\S]*\}, \[chartSymbol, chartTimeframe, readCurrentProjectedChartCandles, retainCurrentChartCandles, sanitizedCandles\]\)/,
    'the retained READY snapshot must include the newest canonical candle and exact-Bid projection',
  );
  assertSourceContains(source, /const sendInit = useCallback[\s\S]*const \{ projection, hasHistoryCandles \} = readCurrentProjectedChartCandles\(\);[\s\S]*const data = projection\.candles;[\s\S]*retainCurrentChartCandles\(data\);[\s\S]*const mapped = data\.length > 0 \? buildMappedData\(data\) : \[\][\s\S]*initChart\(/, 'sendInit must initialize from the same context-scoped projected snapshot and retain its committed-history provenance');
});

test('webview bridge: confirmed closed charts use one session-clamped canonical reader everywhere', () => {
  assert.equal(
    (source.match(/liveCandlesEngine\.getCandles\(chartSymbol, chartTimeframe\)/g) ?? []).length,
    1,
    'the raw engine series must be read only inside the centralized renderable-candle reader',
  );
  assertSourceContains(
    source,
    /const readRenderableCanonicalCandles = useCallback\(\(\) => \{[\s\S]*const canonicalCandles = liveCandlesEngine\.getCandles\(chartSymbol, chartTimeframe\)[\s\S]*if \(!shouldApplyClosedCandlePolicy \|\| canonicalCandles\.length === 0\)[\s\S]*sanitizeCandlesForChart\(canonicalCandles, \{[\s\S]*pruneSyntheticFlatLiveTail: true,[\s\S]*closedMarketSessionClose: closedCandlePolicySessionClose/,
    'the centralized reader must clamp confirmed closed/reopening series only',
  );
  assertSourceContains(
    source,
    /const chartMetaCanonicalCandles =[\s\S]*readRenderableCanonicalCandles\(\)/,
    'first-visible OHLC must use the centralized reader',
  );
  assertSourceContains(
    source,
    /const sendInit = useCallback[\s\S]*readCurrentProjectedChartCandles\(\)[\s\S]*const data = projection\.candles/,
    'READY initialization must use the centralized clamped reader plus exact-Bid projection',
  );
  assertSourceContains(
    source,
    /const paintCanonicalLiveTick = \(allowUnchangedSnapshot = false\) => \{[\s\S]*const canonicalCandles = readRenderableCanonicalCandles\(\)/,
    'fast live painting must use the centralized reader',
  );
  assertSourceContains(
    source,
    /keep full history\/replacement data aligned[\s\S]*const canonicalCandles = readRenderableCanonicalCandles\(\)/,
    'full history replacement must use the centralized reader',
  );
  assertSourceContains(
    source,
    /useMarketStatus\(\s*chartSymbol,\s*chartSurfaceReady,\s*chartRuntimeActive,\s*\)/,
    'the retained chart surface must preload the session boundary before first reveal and poll only while active',
  );
  assertSourceContains(
    source,
    /!isLoggedIn \|\|[\s\S]*!activeChartSessionCacheNamespace \|\|[\s\S]*!chartRuntimeActive \|\|[\s\S]*!chartSurfaceReady[\s\S]*void refetchChartMarketStatus\(\)/,
    'revealing a retained chart must refetch market status immediately instead of waiting for the polling interval',
  );
  assertSourceContains(
    source,
    /shouldRefreshChartHistoryOnSessionTransition\([\s\S]*setChartReopenHistoryRepair\([\s\S]*refreshChartHistory\(\)/,
    'a confirmed closed-to-open transition must reconcile history exactly once while retaining the sanitized view',
  );
  assertSourceContains(
    source,
    /const closedMarketFlatBackfillRef = useRef\(\{ contextKey: '', requested: false \}\)[\s\S]*if \(!isChartMarketClosed\)[\s\S]*candles\.length < INITIAL_HISTORY_LIMIT[\s\S]*!hasOnlyRepeatedFlatCandles\(candles\)[\s\S]*liveCandlesEngine\.getState\(chartSymbol, chartTimeframe\)[\s\S]*if \(!streamState \|\| streamState\.loading\)[\s\S]*backfillState\.requested = true;[\s\S]*paginate\(\)/,
    'a cold closed-market chart must request one guarded older page when its full initial window is frozen',
  );
});

test('webview bridge: per-symbol quote activity replaces static crypto and broker exceptions', () => {
  assertSourceContains(
    source,
    /resolveChartMarketSessionPolicy\(chartMarketStatus\)/,
    'native chart must normalize the per-symbol backend quote-session contract',
  );
  assertSourceContains(
    source,
    /const isChartMarketClosed = chartMarketSessionPolicy\.quotePhase === 'closed'/,
    'the closed-session display gate must follow per-symbol quote activity',
  );
  assert.doesNotMatch(
    source,
    /isCryptoChartSymbol|brokerId\s*===\s*['"]achiever/i,
    'chart session behavior must not depend on a crypto-name or broker-name exception',
  );
  assertSourceContains(
    source,
    /if \(!isChartMarketClosed\) \{[\s\S]*return \[\]/,
    'market-close separators must be disabled whenever the symbol quote session is not confirmed closed',
  );
});

test('webview bridge: symbol switches isolate candle state before the context history path commits', () => {
  assertSourceContains(
    liveCandleStreamManagerSource,
    /historyCandles:\s*\[\][\s\S]*renderHistoryLimit:\s*INITIAL_HISTORY_LIMIT[\s\S]*candles:\s*EMPTY_CANDLES as CandleParams\[\][\s\S]*this\.entries\.set\(key, entry\)[\s\S]*this\.loadFreshHistory\(entry\)/,
    'each chart context must begin with isolated state and enter the session-aware fresh-history path',
  );
  assertSourceContains(
    liveCandleStreamManagerSource,
    /entry\.listeners\.add\(listener\)[\s\S]*entry\.consumers \+= 1[\s\S]*this\.reloadEmptyIdleHistory\(entry\)/,
    're-subscribing to an existing empty symbol/timeframe stream must restart history loading',
  );
  assertSourceContains(
    liveCandleStreamManagerSource,
    /public refreshHistoryForContext\(symbol: string, timeframe: string\): void[\s\S]*this\.isHistoryRequestActive\(entry\)[\s\S]*this\.loadFreshHistory\(entry\)/,
    'chart switches must be able to refresh an existing target stream without creating duplicate first-load requests',
  );
  assert.doesNotMatch(
    liveCandlesHookSource,
    /engineCandles\.length\s*>\s*0\s*\?\s*engineCandles\s*:\s*safeCachedCandles/,
    'useLiveCandles must not fall back to cached candles during a symbol switch',
  );
  assertSourceContains(
    liveCandlesHookSource,
    /const hasCommittedHistoryCandles = \(candles: readonly CandleParams\[\]\): boolean =>[\s\S]*candle\.source === 'history' \|\| candle\.source === 'rest' \|\| candle\.closed === true[\s\S]*const hasHistoryCandles = useMemo\(\(\) => hasCommittedHistoryCandles\(engineCandles\), \[engineCandles\]\)/,
    'useLiveCandles must expose whether the current series contains committed REST history',
  );
  assertSourceContains(
    liveCandlesHookSource,
    /const isLiveActive = active && isLoggedIn[\s\S]*if \(!isLiveActive \|\| !normalizedSymbol \|\| !normalizedTimeframe\)[\s\S]*liveCandlesEngine\.prefetchHistory\(normalizedSymbol, normalizedTimeframe\)/,
    'useLiveCandles must keep its history and live subscription lifecycle gated while the hidden chart is inactive',
  );
  assertSourceContains(
    source,
    /const chartDataActive = chartRuntimeActive[\s\S]*const \{[\s\S]*candles,[\s\S]*paginate,[\s\S]*refresh: refreshChartHistory,[\s\S]*loading: chartDataLoading,[\s\S]*error: chartDataError,[\s\S]*\} = useLiveCandles\([\s\S]*chartSymbol,[\s\S]*chartTimeframe,[\s\S]*chartDataActive,[\s\S]*CHART_SCREEN_CANDLE_COMMIT_INTERVAL_MS,[\s\S]*\)[\s\S]*candles\.length > 0[\s\S]*sanitizeCandlesForChart\(candles, \{[\s\S]*timeframe: chartTimeframe,[\s\S]*pruneSyntheticFlatLiveTail: shouldApplyClosedCandlePolicy,[\s\S]*closedMarketSessionClose: shouldApplyClosedCandlePolicy[\s\S]*closedCandlePolicySessionClose[\s\S]*\}\)[\s\S]*EMPTY_DISPLAY_CANDLES/,
    'native chart may paint live candle ticks before slow REST history finishes',
  );
  assertSourceContains(
    liveCandlesHookSource,
    /getCandleStreamSnapshotKey[\s\S]*state\.error[\s\S]*const authenticatedCandles = \{[\s\S]*candles,[\s\S]*hasHistoryCandles,[\s\S]*loading: streamState\?\.loading \?\? false,[\s\S]*error: streamState\?\.error \?\? null,[\s\S]*refresh,[\s\S]*paginate,[\s\S]*\};[\s\S]*return isPublicDemoSelection \? publicDemoCandles : authenticatedCandles;/,
    'useLiveCandles must expose authenticated loading/errors and retain public history for the logged-out demo selection',
  );
  assertSourceContains(
    liveCandleHistoryFetchingSource,
    /live\.error = error instanceof Error \? error\.message : String\(error\)[\s\S]*manager\.commit\(live\)[\s\S]*manager\.notify\(live\)/,
    'history failures must notify subscribers even when the candle series stays empty',
  );
  const successfulHistorySettlementStart = liveCandleHistoryFetchingSource.indexOf(
    'live.historyLoading = false;',
    liveCandleHistoryFetchingSource.indexOf("logDebug('history_request'"),
  );
  const successfulHistorySettlementEnd = liveCandleHistoryFetchingSource.indexOf(
    "logDebug('history_success'",
    successfulHistorySettlementStart,
  );
  assert.notEqual(
    successfulHistorySettlementStart,
    -1,
    'successful history loading settlement was not found',
  );
  assert.notEqual(
    successfulHistorySettlementEnd,
    -1,
    'successful history commit boundary was not found',
  );
  const successfulHistorySettlement = liveCandleHistoryFetchingSource.slice(
    successfulHistorySettlementStart,
    successfulHistorySettlementEnd,
  );
  assertSourceContains(
    successfulHistorySettlement,
    /live\.historyLoading = false;[\s\S]*live\.historyPageLoading = false;[\s\S]*manager\.commit\(live\);/,
    'history success must release request-owned flags before the aggregate loading commit',
  );
  assert.doesNotMatch(
    successfulHistorySettlement,
    /live\.loading = false;/,
    'history success must let commit observe and publish the aggregate loading transition',
  );
  assertSourceContains(
    source,
    /const hasChartDataError = Boolean\([\s\S]*chartDataError && !candlesAvailable[\s\S]*chartSurfaceRecoveryExhausted[\s\S]*const isError = hasChartDataError/,
    'native chart must show candle REST failures and terminal renderer failures instead of hard-coding no error state',
  );
  assert.doesNotMatch(source, /shouldShowChartLoginPrompt|CANDLE_HISTORY_LOGIN_REQUIRED_MESSAGE/);
  assertSourceContains(
    chartWebSource,
    /const chartDataActive = isScreenFocused[\s\S]*const \{[\s\S]*candles,[\s\S]*loading: chartDataLoading,[\s\S]*error: chartDataError,[\s\S]*\} = useLiveCandles\(chartSymbol, chartTimeframe, chartDataActive\)/,
    'web chart must also load chart data without a frontend login gate',
  );
  assertSourceContains(
    chartWebSource,
    /const isError = Boolean\(chartDataError && !candlesAvailable\)/,
    'web chart must surface actual candle REST failures',
  );
  assert.doesNotMatch(chartWebSource, /shouldShowChartLoginPrompt|CANDLE_HISTORY_LOGIN_REQUIRED_MESSAGE/);
});

test('live candle stream: startup prefetch seeds first chart render before REST refresh', () => {
  assertSourceContains(
    liveCandleHistoryFetchingSource,
    /candleMemoryCache\.set\(normalizedSymbol, normalizedTimeframe, candles\)/,
    'startup prefetch must store fetched REST history in the in-memory candle cache',
  );
  assertSourceContains(
    liveCandleStreamManagerSource,
    /const memoryCachedCandles = candleMemoryCache\.get\(symbol, timeframe\)[\s\S]*this\.hydrateFromCache\([\s\S]*memoryCachedCandles as CandleParams\[\],[\s\S]*Math\.min\(PAGINATED_HISTORY_LIMIT, memoryCachedCandles\.length\)[\s\S]*this\.loadFreshHistory\(entry\)/,
    'new chart subscriptions must synchronously paint the complete exact memory warm-up before entering the fresh REST path',
  );
  assertSourceContains(
    liveCandleStreamManagerSource,
    /public hydrateFromCache\([\s\S]*candles: CandleParams\[\],[\s\S]*renderLimit = INITIAL_HISTORY_LIMIT[\s\S]*entry\.historyCandles\.length > 0[\s\S]*entry\.historyCandles = safeCandles;[\s\S]*Preserve any live ticks[\s\S]*entry\.renderHistoryLimit = safeRenderLimit[\s\S]*this\.commit\(entry\)/,
    'exact-key cached candles may paint at their bounded warm limit without discarding live ticks',
  );
  const hydrateFromCacheStart = liveCandleStreamManagerSource.indexOf('public hydrateFromCache');
  const hydrateFromCacheEnd = liveCandleStreamManagerSource.indexOf('/**', hydrateFromCacheStart + 3);
  const hydrateFromCacheSource = liveCandleStreamManagerSource.slice(hydrateFromCacheStart, hydrateFromCacheEnd);
  assert.doesNotMatch(hydrateFromCacheSource, /entry\.requestId|entry\.liveCandleMap\s*=\s*new Map/);
  assertSourceContains(
    liveCandleStreamManagerSource,
    /hydratePersistedCandleCache\(symbol, timeframe\)\.then\(\(persisted\) => \{[\s\S]*live\.historyCandles\.length > 0[\s\S]*this\.hydrateFromCache\(symbol, timeframe, persisted as CandleParams\[\]\)/,
    'async persisted hydration must be rejected only after authoritative history has already committed',
  );
});

test('webview bridge: symbol switches reject stale drawing bridge updates', () => {
  assertSourceContains(
    source,
    /const scopedChartDrawingRecords = useMemo\([\s\S]*filterChartDrawingRecordsForCurrentChart\([\s\S]*persistedChartDrawingRecords[\s\S]*chartSymbol[\s\S]*chartTimeframe[\s\S]*chartWindows\.isSplit \? chartWindows\.activePane\.id/,
    'drawing records must be scoped to the active symbol timeframe and chart window before replay',
  );
  assertSourceContains(
    source,
    /LEGACY_UNSCOPED_DRAWING_KINDS = new Set<PersistedChartDrawing\['kind'\]>\(\['fib', 'measure'\]\)[\s\S]*LEGACY_UNSCOPED_DRAWING_KINDS\.has\(drawing\.kind\) && \(!drawing\.symbol \|\| !drawing\.timeframe\)[\s\S]*return false/,
    'legacy fib and measure drawings without chart identity must not be replayed into symbol switches',
  );
  assertSourceContains(
    source,
    /msg\.type === 'DRAWINGS_CHANGED'[\s\S]*!chartInitializedRef\.current[\s\S]*!chartCanvasReady[\s\S]*lastInitSigRef\.current !== currentSig[\s\S]*return/,
    'native host must ignore drawing updates until the current chart init is active',
  );
  assertSourceContains(
    source,
    /chartWindows\.isSplit[\s\S]*msg\.chartWindowPaneId !== chartWindows\.activePane\.id/,
    'delayed drawing messages must not cross a same-context chart-window handoff',
  );
  assertSourceContains(
    source,
    /filterChartDrawingRecordsForCurrentChart\([\s\S]*sanitizePersistedChartDrawings\(msg\.drawings\)[\s\S]*chartSymbol[\s\S]*chartTimeframe[\s\S]*sanitizedBackendCandles/,
    'drawing updates from WebView must be filtered against the active chart and backend candle range',
  );
  assertSourceContains(
    source,
    /const drawingsToReplay = chartDrawingRecords[\s\S]*if \(webViewRef\.current\)[\s\S]*const drawingReplaySignature = chartDrawingSignature[\s\S]*setSerializedDrawings\(\$\{JSON\.stringify\(drawingsToReplay\)\}\)/,
    'CHART_READY drawing replay must use the current render-scoped drawing records, including an empty list to clear stale overlays',
  );
  assertSourceContains(
    source,
    /if \(!isScreenFocused \|\| !preferencesHydrated \|\| !webViewReady \|\| !chartCanvasReady \|\| !webViewRef\.current\)[\s\S]*setSerializedDrawings\(\$\{JSON\.stringify\(chartDrawingRecords\)\}\)[\s\S]*\}, \[[^\]]*isScreenFocused[^\]]*\]/,
    'native-side object/style edits must replay saved drawings when the chart regains focus',
  );
  assertSourceContains(
    enhancedDrawingToolsSource,
    /currentSymbol = this\._crosshairConfig[\s\S]*symbol:[\s\S]*currentSymbol \|\| undefined[\s\S]*timeframe:[\s\S]*currentTimeframe \|\| undefined/,
    'drawing plugin must stamp new drawing records with the active chart symbol and timeframe',
  );
  assertSourceContains(
    enhancedDrawingToolsSource,
    /setSerializedDrawings = function \(drawings\)[\s\S]*this\._crosshairLocked = false[\s\S]*this\._pendingCrosshairState = null[\s\S]*this\._hideCrosshairOverlay\(\)/,
    'drawing replay must clear stale locked crosshair overlays from the previous chart',
  );
});

test('webview bridge: native live candles use fresh quotes while precision stays guarded', () => {
  assertSourceContains(
    source,
    /const hasCoherentLiveChartQuote = useMemo\([\s\S]*sanitizedBackendCandles\[sanitizedBackendCandles\.length - 1\][\s\S]*quotePrices\.every\(\(price\) => isPriceCoherentWithCandle\(latestBackendCandle, price\)\)/,
    'native chart must still check quote/candle coherence before trusting backend quote precision metadata',
  );
  assertSourceContains(
    source,
    /liveQuoteDigitsFromBackend: hasCoherentLiveChartQuote && chartLiveQuoteDigitsSource === 'backend'/,
    'incoherent quotes must not influence display precision',
  );
  assert.doesNotMatch(source, /const liveChartPrice = useMemo/, 'native chart must not compute a quote price for candle synthesis');
  assert.doesNotMatch(source, /price: liveChartPrice/, 'native candle display must not receive quote prices');
  assertSourceContains(
    source,
    /liveBid: hasLiveChartQuote \? chartLiveQuote\?\.bid : undefined[\s\S]*liveAsk: hasLiveChartQuote \? chartLiveQuote\?\.ask : undefined/,
    'native trade bid and ask prices must follow fresh quote ticks instead of waiting for backend candle coherence',
  );
  assert.doesNotMatch(
    source,
    /liveBid: hasCoherentLiveChartQuote \? chartLiveQuote\?\.bid : undefined[\s\S]*liveAsk: hasCoherentLiveChartQuote \? chartLiveQuote\?\.ask : undefined/,
    'native trade bid and ask prices must not be gated by the candle-coherence precision guard',
  );
  assertSourceContains(
    source,
    /const overlayLiveBid = useMemo\([\s\S]*hasLiveChartQuote &&[\s\S]*chartLiveQuote\?\.bid[\s\S]*return Number\.isFinite\(chartBid\) && chartBid > 0 \? chartBid : null;[\s\S]*const overlayLiveAsk = useMemo\([\s\S]*hasLiveChartQuote &&[\s\S]*chartLiveQuote\?\.ask[\s\S]*return Number\.isFinite\(chartAsk\) && chartAsk > 0 \? chartAsk : null;/,
    'open-position overlay P/L must use fresh quote ticks while falling back to chart bid/ask',
  );
});

test('webview bridge: OHLC header follows the direct latest live candle snapshot', () => {
  assertSourceContains(
    source,
    /const chartMetaLiveLastCandle = sanitizedCandles\.length > 0 \? sanitizedCandles\[sanitizedCandles\.length - 1\] : null;[\s\S]*const chartMetaCanonicalCandles =[\s\S]*!chartMetaLiveLastCandle && chartMarketDataCacheNamespace[\s\S]*readRenderableCanonicalCandles\(\)[\s\S]*const chartMetaLastCandle = chartMetaLiveLastCandle \?\? chartMetaCanonicalLastCandle/,
    'O/H/L/C header must prefer the latest committed candle and immediately fall back to the exact canonical chart context on first reveal',
  );
  assert.doesNotMatch(
    source,
    /const chartMetaCanonicalCandles\s*=\s*!chartMetaLiveLastCandle\s*&&\s*isScreenFocused/,
    'first-visible OHLC fallback must not wait for deferred Chart focus',
  );
  assertSourceContains(
    source,
    /const accumulateCurrentChartBid = useCallback\([\s\S]*const next = accumulateChartBidTick\([\s\S]*chartLiveTickAccumulatorRef\.current = next;[\s\S]*publishChartLiveOhlc\(next\?\.candle \?\? null\);[\s\S]*return next;/,
    'each accepted Bid accumulation must publish its forming candle directly to the OHLC row',
  );
  assertSourceContains(
    source,
    /const subscribeChartLiveOhlc = useCallback\([\s\S]*chartLiveOhlcListenersRef\.current\.get\(chartDataContextSig\)[\s\S]*const snapshot = chartLiveOhlcSnapshotRef\.current;[\s\S]*listener\(snapshot\.contextKey === chartDataContextSig \? snapshot\.candle : null\);[\s\S]*chartLiveOhlcListenersRef\.current\.delete\(chartDataContextSig\)[\s\S]*\}, \[chartDataContextSig\]\)/,
    'OHLC subscriptions must replay only the snapshot belonging to the current broker-symbol-timeframe context',
  );
  assertSourceContains(
    source,
    /const ChartLiveOhlcRow = React\.memo\(function ChartLiveOhlcRow\([\s\S]*const candle =[\s\S]*liveCandle && \(!fallbackCandle \|\| liveCandle\.time >= fallbackCandle\.time\)[\s\S]*\? liveCandle[\s\S]*: fallbackCandle;[\s\S]*label: 'O', value: formatValue\(candle\?\.open\)[\s\S]*label: 'H', value: formatValue\(candle\?\.high\)[\s\S]*label: 'L', value: formatValue\(candle\?\.low\)[\s\S]*label: 'C', value: formatValue\(candle\?\.close\)/,
    'the direct live candle must win the React fallback for the same or a newer bucket and drive every OHLC field',
  );
  assertSourceContains(
    source,
    /\{showChartMetaRow && !compactVerticalChartWindow && \([\s\S]*<ChartLiveOhlcRow[\s\S]*key=\{chartDataContextSig\}[\s\S]*contextKey=\{chartDataContextSig\}[\s\S]*fallbackCandle=\{chartMetaLastCandle\}[\s\S]*subscribe=\{subscribeChartLiveOhlc\}/,
    'the symbol header must render the isolated live OHLC row with the scoped subscription',
  );
  assert.doesNotMatch(
    source,
    /const \[chartCrosshairCandle, setChartCrosshairCandle\]/,
    'crosshair candles must not pin the O/H/L/C header to an older inspected candle',
  );
});

test('webview bridge: zero-size WebView init is deferred and retried from rAF and ResizeObserver', () => {
  const initBody = extractFunctionBody(chartWebViewHtmlSource, 'initChart');
  const doInitBody = extractFunctionBody(chartWebViewHtmlSource, '_doInitChart');

  assertSourceContains(initBody, /requestAnimationFrame\(function\(\)/, 'initChart must wait for layout frame before measuring');
  assertSourceContains(doInitBody, /_pendingInit = \{[\s\S]*opts:[\s\S]*chartType:[\s\S]*data:/, 'zero-size init must preserve pending payload');
  assertSourceContains(doInitBody, /_pendingInit = \{[\s\S]*initSignature: resolvedInitSignature,[\s\S]*configSig: resolvedConfigSig/, 'zero-size init must preserve host init signatures');
  assertSourceContains(chartWebViewHtmlSource, /new ResizeObserver\(function\(entries\)[\s\S]*if \(_pendingInit\)[\s\S]*_doInitChart\(/, 'ResizeObserver must replay pending init');
});

test('webview bridge: exposes required bridge methods for updates and recovery', () => {
  [
    'initChart',
    'applyChartVisualTheme',
    'updateChartData',
    'updateTick',
    'updateLiveTick',
    'setLivePriceLine',
    'setMarketPriceLines',
    'setCandleCountdownTimeframe',
    'setCandleCountdownActive',
    'resizeChartViewport',
    'recoverChartSurface',
    'setChartOverlays',
    'setVerticalScrollingLocked',
    'setChartAutoScaleEnabled',
    'setSerializedDrawings',
    'undoDrawingAction',
    'redoDrawingAction',
    'publishSerializedDrawings',
    'applyDrawingTextEdit',
    'cancelDrawingTextEdit',
  ].forEach((method) => {
    assertSourceContains(chartWebViewHtmlSource, new RegExp(`window\\.${method} = ${method}`), `${method} must be exposed on window`);
  });
});

test('webview bridge: drawing undo and redo delegate to the drawing manager', () => {
  assertSourceContains(
    chartWebViewHtmlSource,
    /function undoDrawingAction\(\)[\s\S]*window\._drawingManager\.undoDrawingAction\(\)/,
    'undoDrawingAction must delegate to the drawing manager history stack',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /function redoDrawingAction\(\)[\s\S]*window\._drawingManager\.redoDrawingAction\(\)/,
    'redoDrawingAction must delegate to the drawing manager history stack',
  );
});

test('webview bridge: objects navigation flushes current drawing records first', () => {
  assertSourceContains(
    chartWebViewHtmlSource,
    /function publishSerializedDrawings\(\)[\s\S]*window\._drawingManager\.publishDrawingsToHost\(\)/,
    'WebView must expose a host sync function that republishes manager drawings',
  );
  assertSourceContains(
    source,
    /const requestChartDrawingSyncForObjects = useCallback\(\(onReady: \(\) => void\) => \{[\s\S]*pendingObjectsDrawingSyncRef\.current = \{ onReady, requestId \}[\s\S]*publishSerializedDrawings\(\)[\s\S]*DRAWINGS_SYNCED_FOR_OBJECTS[\s\S]*requestId: \$\{requestId\}[\s\S]*pendingRequest\.requestId !== requestId[\s\S]*pendingRequest\.onReady\(\)[\s\S]*\}, \[chartCanvasReady, webViewReady\]\)/,
    'native chart must request current WebView drawings and guard both ack and fallback by request id',
  );
  assertSourceContains(
    source,
    /msg\.type === 'DRAWINGS_SYNCED_FOR_OBJECTS'[\s\S]*Number\(msg\.requestId\) === pendingRequest\.requestId[\s\S]*pendingObjectsDrawingSyncRef\.current = null[\s\S]*pendingRequest\.onReady\(\)/,
    'matching drawing publication acknowledgement must release the guarded Objects navigation callback',
  );
  assertSourceContains(
    source,
    /showChartActionLaunch\('objects', chartSymbol\)[\s\S]*scheduleChartActionLaunchNavigation\(launchRevision[\s\S]*pathname: '\/chart\/objects'[\s\S]*requestChartDrawingSyncForObjects\(navigateToObjects\)/,
    'Objects must reveal its retained cover before drawing sync and navigate only through the revision guard',
  );
});

test('webview bridge: updateChartData full reload reapplies overlays and the live price line', () => {
  const body = extractFunctionBody(chartWebViewHtmlSource, 'updateChartData');

  assertSourceContains(body, /lastRawSeriesData = sanitizeSeriesData\(data\)/, 'full reload must remember sanitized raw data for recovery');
  assertSourceContains(body, /clearMarketPriceLineRefs\(\)[\s\S]*series\.setData\(mapped\)/, 'full reload must remove tracked market price lines before setData can orphan them');
  assertSourceContains(body, /series\.setData\(mapped\)/, 'full reload must replace the chart series');
  assertSourceContains(body, /_positionLinesArr = \[\]/, 'full reload must clear stale overlay line refs');
  assertSourceContains(body, /applyOverlayPayload\(_overlayPayload\)/, 'full reload must reapply overlays after setData');
  assertSourceContains(body, /setLivePriceLine\(lastLivePrice\)/, 'full reload must restore the live price line after setData');
});

test('webview bridge: updateChartData preserves manual price scale while fresh auto loads use the recent viewport', () => {
  const body = extractFunctionBody(chartWebViewHtmlSource, 'updateChartData');
  const doInitBody = extractFunctionBody(chartWebViewHtmlSource, '_doInitChart');

  assertSourceContains(
    chartWebViewHtmlSource,
    /function shouldResetViewportForSeriesReplacement\(previousData, nextData\)[\s\S]*return nextData\.length < previousData\.length \|\| nextFirst !== previousFirst \|\| nextLast < previousLast/,
    'series replacement detection must catch shrinks and non-prepend range changes',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /function resetVisiblePriceScaleForFreshSeries\(reason\)[\s\S]*clearManualPriceScaleState\(\)[\s\S]*enableRightPriceAutoScale\(\)[\s\S]*scheduleOverlayPriceScaleLock\(true\)[\s\S]*schedulePriceScaleHealthCheck\(reason \|\| 'fresh_series', true, 5\)/,
    'an auto-owned fresh dataset must clear transient price-scale state and force autoscale recovery',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /function centerVisiblePriceScaleForFreshSeries\(reason, forceRecompute\)[\s\S]*resolvePriceRangeFromVisibleData\(true\)[\s\S]*getBarPriceCenter\(lastRawSeriesData\[lastRawSeriesData\.length - 1\]\)[\s\S]*priceScaleApi\.setVisibleRange\(\{ from: centeredRange\.from, to: centeredRange\.to \}\)[\s\S]*syntheticRightPriceScaleFallbackRange = centeredRange/,
    'fresh symbol/timeframe data must center the first visible price range around the latest candle value',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /function lockVisiblePriceScaleRange\(forceAutoScale, attempt\)[\s\S]*forceAutoScale !== true && centerVisiblePriceScaleForFreshSeries\('overlay_lock', false\)/,
    'overlay refreshes must preserve the initial fresh-series center until the user interacts',
  );
  assertSourceContains(
    doInitBody,
    /var retainedManualPriceScaleRange = !isNewDataContext && isManualVerticalPanRangeLocked\(\)[\s\S]*var retainedManualPriceScaleReferenceSpan =[\s\S]*!isNewDataContext &&[\s\S]*clearManualPriceScaleState\(\)[\s\S]*chart = LightweightCharts\.createChart/,
    'chart rebuild must snapshot a same-context user-owned range but reject a numeric window from another market context',
  );
  assertSourceContains(
    doInitBody,
    /if \(isValidPriceRange\(retainedManualPriceScaleRange\)\) \{[\s\S]*rememberManualVerticalPanRange\(retainedManualPriceScaleRange\)[\s\S]*applyManualVerticalPanLockedRange\(\)[\s\S]*\} else \{[\s\S]*resetVisiblePriceScaleForFreshSeries\('init_data'\)[\s\S]*applyRecentViewport\(currentSeriesLength\)[\s\S]*scheduleOverlayPriceScaleLock\(!isValidPriceRange\(retainedManualPriceScaleRange\)\)[\s\S]*if \(!isValidPriceRange\(retainedManualPriceScaleRange\)\) \{[\s\S]*scheduleFreshSeriesVerticalCenter\('init_data', true\)/,
    'chart rebuild must restore a manual numeric window while only auto-owned data receives fresh vertical centering',
  );
  assertSourceContains(body, /var didReplaceVisibleSeries =[\s\S]*resetVisibleRange \|\| shouldResetViewportForSeriesReplacement\(previousRawSeriesData, lastRawSeriesData\)/, 'full reload must force visible series replacement for new chart contexts');
  assertSourceContains(chartWebViewHtmlSource, /function updateChartData\(data, options\)/, 'full reload must accept bridge options for stable symbol/timeframe switches');
  assertSourceContains(body, /var resetVisibleRange = updateOptions\.resetVisibleRange === true/, 'context switches must be able to request a fresh first viewport');
  assertSourceContains(chartWebViewHtmlSource, /function resetVisiblePriceScaleForStableReplacement\(reason\)[\s\S]*clearFreshSeriesVerticalCenterState\(\)[\s\S]*enableRightPriceAutoScale\(\)/, 'stable replacement reset must avoid delayed fresh-series recenter work');
  assertSourceContains(body, /var manualRangeBeforeUpdate = isManualVerticalPanRangeLocked\(\)[\s\S]*!resetVisibleRange && isValidPriceRange\(manualRangeBeforeUpdate\)/, 'same-context full reloads must capture manual price-scale ownership before setData');
  assertSourceContains(body, /if \(resetVisibleRange\) \{[\s\S]*clearManualPriceScaleState\(\);[\s\S]*!shouldPreserveManualPriceScale &&[\s\S]*previousRawSeriesData\.length === 0 \|\| didReplaceVisibleSeries[\s\S]*if \(restoredStableReplacementViewport\) \{[\s\S]*resetVisiblePriceScaleForStableReplacement\(priceScaleReason\)[\s\S]*\} else \{[\s\S]*resetVisiblePriceScaleForFreshSeries\(priceScaleReason\)/, 'explicit context resets must discard an unrelated manual window before stable or fresh autoscale recovery');
  assertSourceContains(body, /preserveVisibleLogicalSpan[\s\S]*didReplaceVisibleSeries[\s\S]*followLiveRightEdge\(previousVisibleLogicalRange, mapped\.length\)/, 'stable replacement reloads can still keep the same visible logical span when explicitly requested');
  assertSourceContains(body, /if \(restoredStableReplacementViewport && !shouldPreserveManualPriceScale\) \{[\s\S]*healCollapsedPriceScaleRange\(priceScaleReason, true\)/, 'stable replacement may heal synchronously only while auto-scale owns the vertical range');
  assertSourceContains(body, /if \(!restoredStableReplacementViewport && !shouldPreserveManualPriceScale\) \{[\s\S]*schedulePriceScaleHealthCheck\(/, 'manual ownership must suppress delayed price-scale health passes');
  assertSourceContains(body, /!restoredStableReplacementViewport[\s\S]*applyRecentViewport\(mapped\.length\)[\s\S]*if \(!shouldPreserveManualPriceScale\) \{[\s\S]*scheduleFreshSeriesVerticalCenter\(priceScaleReason, true\)/, 'context reloads may reset time while vertical centering remains limited to auto-owned ranges');
  assertSourceContains(body, /if \(shouldPreserveManualPriceScale\) \{[\s\S]*applyManualVerticalPanLockedRange\(\)[\s\S]*applyOverlayPayload\(_overlayPayload\)[\s\S]*rememberManualVerticalPanRange\(manualRangeBeforeUpdate\)[\s\S]*applyManualVerticalPanLockedRange\(\)/, 'setData and overlay reconstruction must both reassert the exact manual numeric window');
  assertSourceContains(body, /didReplaceVisibleSeries \? 'update_data_replace_series' : 'update_data'/, 'replacement reloads must use a distinct price-scale recovery reason');
  assertSourceContains(body, /didPrependHistory \|\| didReplaceVisibleSeries \? 5 : 1/, 'replacement reloads must retry price-scale recovery like history prepends');
});

test('webview bridge: updateLiveTick paints the forming candle and Bid line atomically on one frame', () => {
  const legacyBody = extractFunctionBody(chartWebViewHtmlSource, 'updateTick');
  const body = extractFunctionBody(chartWebViewHtmlSource, 'updateLiveTick');
  const flushBody = extractFunctionBody(chartWebViewHtmlSource, 'flushPendingTick');

  assertSourceContains(
    body,
    /var acceptedCandlePrice = seriesType === 'line'[\s\S]*Number\(update\.candle\.value\)[\s\S]*Number\(update\.candle\.close\)[\s\S]*pendingTick = \{[\s\S]*tick: update\.candle,[\s\S]*livePrice: acceptedCandlePrice,[\s\S]*showLivePriceLine: update\.showLivePriceLine === true,[\s\S]*syncLivePriceLine: true,[\s\S]*revision: revision/,
    'the live bridge must derive the single Bid line from the same accepted candle queued for this revision',
  );
  assertSourceContains(
    body,
    /revision <= lastAppliedLiveTickRevision[\s\S]*pendingTick\.revision >= revision/,
    'the live bridge must reject stale revisions both before and while a newer frame is queued',
  );
  assertSourceContains(
    body,
    /schedulePendingTickFlush\(\)/,
    'the live transaction must use the shared liveness-guarded paint scheduler',
  );
  const schedulerBody = extractFunctionBody(chartWebViewHtmlSource, 'schedulePendingTickFlush');
  assertSourceContains(
    schedulerBody,
    /setTimeout\([\s\S]*flushPendingTick[\s\S]*LIVE_TICK_FLUSH_FALLBACK_MS[\s\S]*requestAnimationFrame\(flushPendingTick\)/,
    'the live transaction must retain rAF coalescing with a bounded timeout fallback',
  );
  assertSourceContains(
    flushBody,
    /applied = applyTickUpdate\(tick\)[\s\S]*if \(applied && pending\.syncLivePriceLine === true\) \{[\s\S]*setLivePriceLine\([\s\S]*pending\.showLivePriceLine === true \? pending\.livePrice : null[\s\S]*if \(revision !== null && applied && synchronizedLivePriceLine\) \{[\s\S]*lastAppliedLiveTickRevision = revision/,
    'one revision may move the existing Bid line only after its forming-candle patch is accepted',
  );
  assertSourceContains(
    flushBody,
    /This revision is atomic:[\s\S]*a rejected\/stale candle must not advance[\s\S]*marker independently/,
    'a rejected candle patch must leave the marker on the previously accepted generation',
  );
  assertSourceContains(
    flushBody,
    /lastAppliedLiveTickRevision = revision/,
    'the atomic frame must commit its revision only after both paints succeed',
  );
  assertSourceContains(
    legacyBody,
    /pendingTick = \{ tick: tick \}/,
    'the legacy candle-only bridge must remain isolated from live Bid-line synchronization',
  );
});

test('webview bridge: chart data identity is scoped to broker account symbol and timeframe', () => {
  assertSourceContains(
    source,
    /const chartDataContextSig = useMemo\(\s*\(\) => `\$\{chartMarketDataCacheNamespace\}:\$\{chartSymbol\}:\$\{normalizeTimeframe\(chartTimeframe\)\}`,[\s\S]*\[chartMarketDataCacheNamespace, chartSymbol, chartTimeframe\]/,
    'bridge data identity must change across broker accounts, symbols, and normalized timeframes',
  );
  assertSourceContains(
    source,
    /const displayDecimalsKey =\s*`\$\{chartMarketDataCacheNamespace\}::\$\{chartSymbol\}::\$\{chartTimeframe\}`/,
    'display precision must not leak between accounts that expose the same symbol',
  );
  assertSourceContains(
    source,
    /const startupPrefetchKey =\s*`\$\{activeChartSessionCacheNamespace\}:\$\{chartSymbol\}:\$\{normalizedTimeframe\}`/,
    'startup history dedupe must remain local to the active broker account and chart context',
  );
});

test('webview bridge: quote-first and candle-first cold loads both replay the exact retained Bid', () => {
  assertSourceContains(
    source,
    /const replacementExactQuote = readExactChartQuoteForScope\(\s*chartTradeDisplayQuoteScopeKey,\s*retainedChartTradeDisplayQuoteRef\.current,\s*\);[\s\S]*accumulateCurrentChartBid\(replacementExactQuote, baseRenderableCandles\)[\s\S]*const replacementProjection = projectChartLiveTickCandles\([\s\S]*const renderableCandles = replacementProjection\.candles[\s\S]*const replacementLastCandle = renderableCandles\[renderableCandles\.length - 1\] \?\? null[\s\S]*const replacementLivePrice =[\s\S]*replacementLastCandle\.close[\s\S]*updateChartData\([\s\S]*setLivePriceLineForContext\(\s*\$\{replacementLivePrice \?\? 'null'\},\s*\$\{JSON\.stringify\(chartDataContextSig\)\}/,
    'when the exact quote arrives first, candle replacement must project that Bid into the candle and restore the accepted close atomically',
  );
  assertSourceContains(
    source,
    /useEffect\(\(\) => \{\s*if \(!observedExactChartQuote\) return;[\s\S]*selectNewestExactChartQuote\(current, observedExactChartQuote\)[\s\S]*if \(selected === current\) return;[\s\S]*paintCanonicalLiveTickRef\.current\(true\);[\s\S]*\}, \[observedExactChartQuote\]\)/,
    'when candles arrive first, only a newer retained quote may schedule the atomic repaint',
  );
  assertSourceContains(
    source,
    /exactQuote: readyExactQuote,[\s\S]*projection: readyProjection,[\s\S]*hasHistoryCandles: readyHasHistoryCandles,[\s\S]*readCurrentProjectedChartCandles\(\)[\s\S]*const readyLastCandle = readyCandles\[readyCandles\.length - 1\] \?\? null[\s\S]*readyVisibleLivePrice =[\s\S]*readyLastCandle\.close[\s\S]*retainCurrentChartCandles\(readyCandles\)[\s\S]*setLivePriceLineForContext\([\s\S]*\$\{readyVisibleLivePrice \?\? 'null'\},[\s\S]*\$\{JSON\.stringify\(chartDataContextSig\)\}/,
    'WebView readiness must replay the projected candle and its accepted single Bid value through the guarded context bridge',
  );
});

test('webview bridge: live price commands and queued ticks reject stale chart contexts', () => {
  const contextPriceLineBody = extractFunctionBody(
    chartWebViewHtmlSource,
    'setLivePriceLineForContext',
  );
  const liveTickBody = extractFunctionBody(chartWebViewHtmlSource, 'updateLiveTick');
  const flushBody = extractFunctionBody(chartWebViewHtmlSource, 'flushPendingTick');
  const initBody = extractFunctionBody(chartWebViewHtmlSource, '_doInitChart');
  const updateDataBody = extractFunctionBody(chartWebViewHtmlSource, 'updateChartData');

  assertSourceContains(
    source,
    /const liveUpdate = \{[\s\S]*candle: buildChartTickPayload\(lastCandle, chartType\),[\s\S]*dataContextSig: chartDataContextSig,[\s\S]*livePrice: exactBidLine/,
    'every native candle and Bid transaction must carry its broker/account/symbol/timeframe identity',
  );
  assertSourceContains(
    contextPriceLineBody,
    /requestedContextSig[\s\S]*requestedContextSig !== lastInitDataContextSig[\s\S]*requestedRevision < lastAppliedLiveTickRevision[\s\S]*return false[\s\S]*setLivePriceLine\(price, shouldScheduleRefresh\) === true[\s\S]*lastAppliedLiveTickRevision = requestedRevision/,
    'a delayed standalone Bid-line replay must not paint over a newer context or live revision',
  );
  assertSourceContains(
    liveTickBody,
    /updateDataContextSig[\s\S]*!updateDataContextSig \|\| updateDataContextSig !== lastInitDataContextSig[\s\S]*return;[\s\S]*dataContextSig: updateDataContextSig/,
    'the atomic live bridge must reject missing or stale data identity before queueing a paint',
  );
  assertSourceContains(
    flushBody,
    /pendingDataContextSig[\s\S]*pendingDataContextSig &&[\s\S]*pendingDataContextSig !== lastInitDataContextSig[\s\S]*return;[\s\S]*applyTickUpdate\(tick\)/,
    'a queued live frame must recheck its context in case the user switches charts before animation-frame flush',
  );
  assertSourceContains(
    initBody,
    /var isNewDataContext =[\s\S]*appliedChartDataContextSig !== resolvedDataContextSig[\s\S]*if \(isNewDataContext\) \{[\s\S]*lastLivePrice = null;[\s\S]*lastBidPrice = null;[\s\S]*lastAskPrice = null;[\s\S]*appliedChartDataContextSig = resolvedDataContextSig;/,
    'chart initialization must clear the previous context marker before the new projected candle is ready',
  );
  assertSourceContains(
    updateDataBody,
    /paintToken\.lastIndexOf\(':'\)[\s\S]*paintRevision < lastAppliedChartDataPaintRevision[\s\S]*return false[\s\S]*paintedDataContextSig !== lastInitDataContextSig &&[\s\S]*paintRevision === null[\s\S]*return false[\s\S]*series\.setData\(mapped\)[\s\S]*lastAppliedChartDataPaintRevision = paintRevision/,
    'an old or unversioned cross-context history replacement must not roll the WebView back',
  );
  assertSourceContains(
    updateDataBody,
    /series\.setData\(mapped\)[\s\S]*if \(paintedDataContextSig\) \{[\s\S]*lastInitDataContextSig = paintedDataContextSig;[\s\S]*appliedChartDataContextSig = paintedDataContextSig;/,
    'a retained-surface symbol paint must become the applied context before any later same-context rebuild',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /window\.setLivePriceLineForContext = setLivePriceLineForContext/,
    'native replay must use the exported guarded Bid-line bridge',
  );
});

test('webview bridge: the market price line uses the exact Bid projected into the accepted candle', () => {
  assertSourceContains(
    source,
    /const exactQuote = readExactChartQuoteForScope\([\s\S]*accumulateCurrentChartBid\(exactQuote, canonicalCandles\)[\s\S]*const projection = projectChartLiveTickCandles\([\s\S]*const canonicalLastCandle = renderableCandles\[renderableCandles\.length - 1\][\s\S]*const lastCandle = mappedRenkoData[\s\S]*canonicalLastCandle[\s\S]*const exactBidLine = exactQuote \? canonicalLastCandle\.close : null;[\s\S]*livePrice: exactBidLine/,
    'live paint must first project the exact backend Bid into the source candle, then keep the forming Renko close and marker on that price',
  );
  assertSourceContains(
    source,
    /const replacementProjection = projectChartLiveTickCandles\([\s\S]*const replacementLastCandle = renderableCandles\[renderableCandles\.length - 1\] \?\? null[\s\S]*const replacementLivePrice =[\s\S]*replacementExactQuote && replacementLastCandle[\s\S]*\? replacementLastCandle\.close[\s\S]*: null/,
    'cold replacement replay must use the same projected candle close or no line',
  );
  const liveTickBody = extractFunctionBody(chartWebViewHtmlSource, 'updateLiveTick');
  assertSourceContains(
    liveTickBody,
    /var acceptedCandlePrice = seriesType === 'line'[\s\S]*Number\(update\.candle\.value\)[\s\S]*Number\(update\.candle\.close\)[\s\S]*livePrice: acceptedCandlePrice/,
    'the WebView must enforce the same accepted candle value instead of trusting an independently supplied marker price',
  );
  assert.doesNotMatch(liveTickBody, /livePrice:\s*update\.livePrice/);
});

test('webview bridge: toggling the live-price filter replays or clears a closed symbol without a new tick', () => {
  assertSourceContains(
    source,
    /paintCanonicalLiveTickRef\.current = scheduleCanonicalLivePaint[\s\S]*livePaintPending = true;[\s\S]*flushCanonicalLivePaint\(\);[\s\S]*const releaseQuoteDemand = isPublicDemoMarket[\s\S]*quotesWsService\.subscribeToSymbol\([\s\S]*\}, \[[\s\S]*chartDisplay\.showLivePriceLine[\s\S]*\]\);/,
    'the retained atomic bridge must repaint when the live-price filter changes',
  );
  assertSourceContains(
    source,
    /const replacementLivePrice =\s*chartDisplay\.showLivePriceLine && replacementExactQuote && replacementLastCandle[\s\S]*\? replacementLastCandle\.close\s*: null/,
    'filter-off must clear the line while filter-on restores the projected exact-Bid candle value',
  );
});

test('closed-market chart intent warms a deeper exact history window without broker or asset guesses', () => {
  const selectionWarmBody = extractFunctionBody(
    navigationPrefetchSource,
    'prefetchChartSelectionHistory',
  );
  const prefetchHistoryStart = liveCandleHistoryFetchingSource.indexOf(
    'export const runPrefetchHistory =',
  );
  assert.notEqual(prefetchHistoryStart, -1, 'runPrefetchHistory arrow function must exist');
  const prefetchHistoryEnd = liveCandleHistoryFetchingSource.indexOf('\n};', prefetchHistoryStart);
  assert.notEqual(prefetchHistoryEnd, -1, 'runPrefetchHistory arrow function must have a closing body');
  const prefetchHistoryBody = liveCandleHistoryFetchingSource.slice(
    prefetchHistoryStart,
    prefetchHistoryEnd + 3,
  );

  assertSourceContains(
    liveCandleStreamTypesSource,
    /INITIAL_VIEWPORT_HISTORY_LIMIT = 120[\s\S]*PAGINATED_HISTORY_LIMIT = Math\.min\(500, MAX_CANDLE_SERIES_LENGTH\)[\s\S]*CLOSED_MARKET_HISTORY_WARM_LIMIT = PAGINATED_HISTORY_LIMIT/,
    'closed-market warming must use the bounded 500-bar page while normal first paint stays at 120 bars',
  );
  assertSourceContains(
    selectionWarmBody,
    /const cacheNamespace = capture\?\.session\.cacheNamespace \?\? ''[\s\S]*getMarketStatusQueryKey\(cacheNamespace, requestedSymbol\)/,
    'the status decision must be scoped to the active broker/account and exact requested symbol',
  );
  assertSourceContains(
    chartHistoryWarmupPolicySource,
    /status\?\.quote_open === false\s*\? CLOSED_MARKET_HISTORY_WARM_LIMIT\s*:\s*INITIAL_HISTORY_LIMIT/,
    'the shared warm-up policy must select the deeper window only from an explicit backend quote closure',
  );
  assertSourceContains(
    selectionWarmBody,
    /const cachedStatus = appQueryClient\.getQueryData<MarketStatusDTO>\(statusQueryKey\)[\s\S]*const initialLimit = resolveChartSelectionHistoryWarmLimit\(cachedStatus\)[\s\S]*liveCandlesEngine\.prefetchHistory\([\s\S]*initialLimit/,
    'a cached confirmed close must start the deeper warm-up immediately while open or unknown symbols keep the small window',
  );
  assertSourceContains(
    selectionWarmBody,
    /appQueryClient\.fetchQuery\([\s\S]*runSessionBoundQuery\([\s\S]*cacheNamespace[\s\S]*fetchMarketStatus\(requestedSymbol\)[\s\S]*status\.quote_open !== false[\s\S]*isSessionQueryCacheNamespaceCurrent\(cacheNamespace\)[\s\S]*liveCandlesEngine\.prefetchHistory\([\s\S]*resolveChartSelectionHistoryWarmLimit\(status\)/,
    'a newly confirmed close must upgrade the same session-scoped warm-up without accepting a late prior-session status',
  );
  assertSourceContains(
    prefetchHistoryBody,
    /finiteRequestedLimit = Number\.isFinite\(limit\)[\s\S]*\? Math\.floor\(limit\)[\s\S]*: INITIAL_HISTORY_LIMIT[\s\S]*requestedLimit = Math\.min\([\s\S]*Math\.max\(INITIAL_HISTORY_LIMIT, finiteRequestedLimit\)[\s\S]*existing && existing\.limit >= requestedLimit[\s\S]*manager\.fetchHistory\([\s\S]*requestedLimit/,
    'history prefetch must honor a deeper requested limit and reuse an equal or deeper in-flight request',
  );
  assertSourceContains(
    quotesScreenSource,
    /openChartTabForSymbol[\s\S]*prefetchChartSelectionHistory\(sym, chartTimeframe\)/,
    'the Quotes-to-Chart action must begin the exact history warm-up before revealing Chart',
  );
  assertSourceContains(
    source,
    /warmChartContextAndCommit[\s\S]*prepare: \(\) => \{[\s\S]*prefetchChartSelectionHistory\(nextSymbol, nextTimeframe\)/,
    'the in-chart symbol picker must use the same dynamic warm-up contract',
  );
  assert.doesNotMatch(
    selectionWarmBody,
    /isCryptoSymbol|resolveChartSymbolCategory|achiever|gta|weekend|saturday|getDay\(/i,
    'the deeper warm-up must not contain broker names, crypto exceptions, or frontend calendar guesses',
  );
});

test('webview bridge: lower move bars show the current amount without a separate volume price scale', () => {
  const mapMoveBarsBody = extractFunctionBody(chartWebViewHtmlSource, 'mapMoveBarsData');
  const optionsBody = extractFunctionBody(chartWebViewHtmlSource, 'makeMoveDirectionPriceLineOptions');
  const ensureBody = extractFunctionBody(chartWebViewHtmlSource, 'ensureMoveDirectionPriceLine');
  const refreshBody = extractFunctionBody(chartWebViewHtmlSource, 'refreshMoveDirectionPriceLine');
  const ensureMoveBarsBody = extractFunctionBody(chartWebViewHtmlSource, 'ensureMoveBarsSeries');
  const moveBadgeBody = extractFunctionBody(chartWebViewHtmlSource, 'renderMoveDirectionOverlayBadge');
  const moveBadgeLabelBody = extractFunctionBody(chartWebViewHtmlSource, 'formatMoveDirectionOverlayBadgeLabel');

  assertSourceContains(
    mapMoveBarsBody,
    /value: Math\.abs\(close - open\)[\s\S]*color: up \? moveUpColor : moveDownColor/,
    'lower bars must keep plotting the candle move magnitude and direction color',
  );
  assertSourceContains(
    optionsBody,
    /price: pickLiveMoveValue\(\)[\s\S]*axisLabelVisible: false[\s\S]*title: ''/,
    'lower move direction line must not show a native volume price-scale badge',
  );
  assertSourceContains(
    ensureMoveBarsBody,
    /chart\.priceScale\('move'\)\.applyOptions\(\{[\s\S]*visible: false,[\s\S]*ticksVisible: false,[\s\S]*borderVisible: false,[\s\S]*entireTextOnly: false/,
    'lower move price scale must stay hidden so the chart keeps one visible symbol price scale',
  );
  assertSourceContains(
    ensureBody,
    /moveBarsSeries\.createPriceLine\(makeMoveDirectionPriceLineOptions\(\)\)/,
    'lower move guide line must still be created on the move-bars series',
  );
  assertSourceContains(
    refreshBody,
    /moveDirectionPriceLine\.applyOptions\(makeMoveDirectionPriceLineOptions\(\)\)/,
    'live ticks must refresh the lower move guide line without rebuilding the histogram series',
  );
  assertSourceContains(
    moveBadgeBody,
    /var value = pickLiveSignedMoveValue\(\)[\s\S]*moveBarsSeries\.priceToCoordinate\(pickLiveMoveValue\(\)\)[\s\S]*upsertOverlayDomNode\(layer, 'move-badge', 'rtx5-move-overlay-badge'\)[\s\S]*left = axisMetrics\.axisLeft \+ 'px'[\s\S]*width = axisMetrics\.axisWidth[\s\S]*background = pickLivePriceColor\(\)/,
    'custom lower move badge must highlight the live volume bar amount on the right price-scale axis',
  );
  assertSourceContains(
    moveBadgeLabelBody,
    /if \(value > 0\)[\s\S]*return '\+' \+ rounded/,
    'custom lower move badge must show signed up/down movement',
  );
  assert.doesNotMatch(
    moveBadgeBody,
    /rtx5-move-price-scale-badge|data-rtx5-role', 'move-price-scale'/,
    'lower move amount must stay a custom overlay badge, never a second native price scale',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /function refreshOverlayDomLabels\(payload\)[\s\S]*refreshMarketPriceScaleDom\(\)[\s\S]*renderMoveDirectionOverlayBadge\(layer, liveOverlayKeys\)/,
    'overlay refresh must repaint the custom lower move amount without adding a price-scale badge',
  );
});

test('webview bridge: renders backend candle timestamps directly', () => {
  assertSourceContains(
    source,
    /const cleaned = sourceCandles[\s\S]*time: c\.time[\s\S]*value: c\.close[\s\S]*time: c\.time/,
    'native host must pass backend candle timestamps to the WebView',
  );
  assert.doesNotMatch(source, /setIndexToRealTimeMap|appendIndexToRealTimeEntry|replaceLastIndexToRealTimeEntry/);
  assert.doesNotMatch(chartWebViewHtmlSource, /_rtxIndexToRealTime|setIndexToRealTimeMap|appendIndexToRealTimeEntry|replaceLastIndexToRealTimeEntry/);
});

test('webview bridge: split trade labels retain separate side and live PnL fields', () => {
  const refreshBody = extractFunctionBody(chartWebViewHtmlSource, 'refreshOverlayDomLabels');

  assertSourceContains(
    refreshBody,
    /labelSideColor: typeof ln\.labelSideColor === 'string'[\s\S]*labelSideText: typeof ln\.labelSideText === 'string'[\s\S]*labelValueColor: typeof ln\.labelValueColor === 'string'[\s\S]*labelValueText: typeof ln\.labelValueText === 'string'/,
    'open-position label records must carry separate side and live PnL fields',
  );
  assertSourceContains(
    refreshBody,
    /var hasSplitTradeLabel = !!\(item\.labelSideText && item\.labelValueText\)[\s\S]*sideSpan\.textContent = item\.labelSideText[\s\S]*separatorSpan\.textContent = ', '[\s\S]*valueSpan\.textContent = item\.labelValueText[\s\S]*valueSpan\.style\.color = item\.labelValueColor \|\| item\.color/,
    'open-position labels must render BUY/SELL volume and live USD value as separate text spans',
  );
  assertSourceContains(
    refreshBody,
    /label\.style\.color = item\.labelSideColor \|\| item\.color[\s\S]*label\.style\.fontSize = hasSplitTradeLabel \? '9px' : '12px'[\s\S]*label\.style\.fontWeight = '700'/,
    'split labels must keep the trade-side fallback color with compact bold typography',
  );
});

test('webview bridge: per-tick trade label patches touch text only and retain latest caches', () => {
  const patchBody = extractFunctionBody(
    chartWebViewHtmlSource,
    'updateOverlayTradeLabelValues',
  );

  assertSourceContains(
    patchBody,
    /_overlayPayload = patchOverlayTradeLabelPayload\(_overlayPayload, patchById\)[\s\S]*_appliedOverlayPayload = patchOverlayTradeLabelPayload\(_appliedOverlayPayload, patchById\)/,
    'fast label patches must update both WebView payload caches so slower redraws cannot rewind PnL',
  );
  assertSourceContains(
    patchBody,
    /_overlayDomNodesByKey\['label:anchored:' \+ id\][\s\S]*var valueSpan = label\.childNodes\[2\][\s\S]*valueSpan\.textContent = nextPatch\.labelValueText[\s\S]*valueSpan\.style\.color = nextPatch\.labelValueColor/,
    'fast label patches must update the existing PnL span text and color',
  );
  assert.doesNotMatch(
    patchBody,
    /refreshOverlayDomLabels|applyOverlayPayload|setChartOverlays|createPriceLine|priceToCoordinate|clearOverlayDomLabels/,
    'a quote tick must never rebuild, measure, or reposition chart overlay geometry',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /window\.updateOverlayTradeLabelValues = updateOverlayTradeLabelValues/,
    'the native host must be able to call the fast label-only bridge',
  );
});

test('live native label patches recolour Buy/Sell and lot together with P/L', () => {
  const patchBody = extractFunctionBody(chartWebViewHtmlSource, 'updateOverlayTradeLabelValues');
  const nodes = [{ nodeName: 'SPAN', textContent: 'SELL 0.03', style: { color: '#DC2626' } },
    { nodeName: 'SPAN', textContent: ', ', style: { color: '#DC2626' } },
    { nodeName: 'SPAN', textContent: '-0.31 USD', style: { color: '#DC2626' } }];
  const label = { childNodes: nodes };
  const update = new Function('patches', '_overlayDomNodesByKey', `
    var _overlayPayload = {}, _appliedOverlayPayload = {};
    var verticalPricePanGestureActive = false, visibleRangeIdlePendingAfterGesture = false;
    function isChartOverlayWriteContextCurrent() { return true; }
    function isHorizontalScrollMotionActive() { return false; }
    function patchOverlayTradeLabelPayload(payload) { return payload; }
    function postError(name, error) { throw error; }
    ${patchBody}
  `);
  for (const [text, color] of [['+0.25 USD', '#087D4D'], ['-0.31 USD', '#C62828']]) {
    update([{ id: 'open-42', labelValueText: text, labelValueColor: color }], {
      'label:anchored:open-42': label,
    });
    assert.equal(nodes[0].textContent, 'SELL 0.03');
    assert.equal(nodes[2].textContent, text);
    assert.ok(nodes.every((node) => node.style.color === color));
    assert.equal(label.childNodes, nodes);
  }
});

test('webview bridge: open-position trade labels stay in one vertical column while price panning', () => {
  const refreshBody = extractFunctionBody(chartWebViewHtmlSource, 'refreshOverlayDomLabels');
  const anchoredTopsBody = extractFunctionBody(
    chartWebViewHtmlSource,
    'resolveAnchoredOverlayLabelTops',
  );
  const anchoredLaneBody = extractFunctionBody(
    chartWebViewHtmlSource,
    'resolveAnchoredOverlayLabelLane',
  );
  const repositionBody = extractFunctionBody(
    chartWebViewHtmlSource,
    'repositionTradeOverlayDomNodes',
  );

  assertSourceContains(
    chartWebViewHtmlSource,
    /priceScaleApi\.setVisibleRange\(nextRange\)[\s\S]*refreshVerticalGestureOverlayPositions\(\)[\s\S]*return true/,
    'vertical price panning must move the native price range and repaint trade labels on the same touchmove',
  );
  assertSourceContains(
    refreshBody,
    /anchoredLabels\.sort\(function\(left, right\) \{ return left\.y - right\.y; \}\)[\s\S]*resolveAnchoredOverlayLabelTops\(anchoredLabels\)/,
    'anchored trade labels must be price-sorted into one vertical layout',
  );
  assertSourceContains(
    anchoredTopsBody,
    /var top = Math\.round\(item\.y - OVERLAY_LABEL_LINE_HEIGHT - OVERLAY_LABEL_LINE_GAP\)[\s\S]*previousVisibleTop \+ anchoredStep/,
    'vertical rows must begin at the real price coordinate and stack only when they would overlap',
  );
  assertSourceContains(
    repositionBody,
    /anchoredLabelRecords\.sort\(function\(left, right\) \{ return left\.y - right\.y; \}\)[\s\S]*resolveAnchoredOverlayLabelTops\(anchoredLabelRecords\)[\s\S]*record\.node\.style\.top = labelTop[\s\S]*var rowY = resolveAnchoredOverlayRowY\(labelTop\)[\s\S]*record\.lineNode\.style\.top = rowY[\s\S]*record\.boxNode\.style\.top = Math\.round\(rowY - OVERLAY_POSITION_BOX_HEIGHT \/ 2\)/,
    'pan and zoom frames must keep each open-position label, line, and box on one shared row',
  );
  assertSourceContains(
    anchoredLaneBody,
    /resolveMarketPriceScaleAxisMetrics\(layer\)[\s\S]*axisMetrics\.axisLeft[\s\S]*Math\.min\([\s\S]*OVERLAY_OPEN_POSITION_LABEL_MAX_LEFT[\s\S]*Math\.round\(paneWidth \* OVERLAY_OPEN_POSITION_LABEL_LEFT_RATIO\)[\s\S]*Math\.max\(0, remainingWidth - OVERLAY_ANCHORED_LABEL_LEFT\)[\s\S]*leftBiased === true[\s\S]*Math\.min\(desiredLeftInset, maxLeftInset\)[\s\S]*remainingWidth \/ 2/,
    'the resolver must provide a responsive left lane for open positions while preserving the centered lane for other labels',
  );
  assertSourceContains(
    repositionBody,
    /var anchoredLabelLane = resolveAnchoredOverlayLabelLane\(_overlayLabelLayer, false\)[\s\S]*var openPositionLabelLane = resolveAnchoredOverlayLabelLane\(_overlayLabelLayer, true\)[\s\S]*applyAnchoredOverlayLabelLane\([\s\S]*isOpenPosition \? openPositionLabelLane : anchoredLabelLane/,
    'pan and zoom frames must preserve the left open-position lane without moving other anchored labels',
  );
  assertSourceContains(
    refreshBody,
    /var floatingTop = tops\[labelIndex\][\s\S]*renderLabel\(floatingItem, floatingTop,/,
    'floating order labels must also render from the unclamped price coordinate',
  );
  assert.doesNotMatch(
    chartWebViewHtmlSource,
    /resolveAnchoredOverlayLabelBounds|OVERLAY_ANCHORED_LABEL_TOP_SAFE_PADDING|anchoredBounds|bounds\.minTop|bounds\.maxTop/,
    'vertical panning must not pin trade labels inside the screen when their price is off-screen',
  );
});

test('webview bridge: horizontal chart panning defers custom DOM rebuilds until release', () => {
  const markHorizontalBody = extractFunctionBody(chartWebViewHtmlSource, 'markHorizontalScrollGestureActive');
  const finishHorizontalBody = extractFunctionBody(chartWebViewHtmlSource, 'finishHorizontalScrollGesture');
  const deferDomWorkBody = extractFunctionBody(chartWebViewHtmlSource, 'deferHorizontalGestureDomWork');
  const scheduleOverlayRefreshBody = extractFunctionBody(chartWebViewHtmlSource, 'scheduleOverlayDomRefresh');
  const scheduleVisibleRangeIdleBody = extractFunctionBody(chartWebViewHtmlSource, 'scheduleVisibleRangeIdleWork');
  const schedulePeriodSeparatorsBody = extractFunctionBody(chartWebViewHtmlSource, 'schedulePeriodSeparatorsUpdate');
  const setChartOverlaysBody = extractFunctionBody(chartWebViewHtmlSource, 'setChartOverlays');

  assertSourceContains(
    deferDomWorkBody,
    /visibleRangeIdlePendingAfterGesture = true[\s\S]*cancelOverlayDomRefreshFrame\(\)[\s\S]*cancelGestureRightPriceScaleFallbackRefresh\(\)/,
    'horizontal pan must cancel pending overlay and right-axis fallback refresh work while the finger is down',
  );
  assertSourceContains(
    markHorizontalBody,
    /deferHorizontalGestureDomWork\(\)[\s\S]*activeHorizontalScrollGesture = true/,
    'committing to horizontal pan must switch the WebView into deferred DOM-work mode',
  );
  assertSourceContains(
    scheduleOverlayRefreshBody,
    /if \(isHorizontalScrollMotionActive\(\)\) \{[\s\S]*deferHorizontalGestureDomWork\(\)[\s\S]*return;/,
    'overlay refresh requests must not repaint custom DOM during finger drag or kinetic horizontal motion',
  );
  assertSourceContains(
    setChartOverlaysBody,
    /if \(isHorizontalScrollMotionActive\(\)\) \{[\s\S]*pendingHorizontalOverlayApply = true[\s\S]*deferHorizontalGestureDomWork\(\)[\s\S]*return;/,
    'live overlay payloads must be cached instead of rebuilding price lines during horizontal motion',
  );
  assertSourceContains(
    finishHorizontalBody,
    /horizontalScrollMotionActive \|\|[\s\S]*visibleRangeIdlePendingAfterGesture \|\|[\s\S]*pendingHorizontalOverlayApply[\s\S]*activeHorizontalScrollGesture = false[\s\S]*visibleRangeIdlePendingAfterGesture = true[\s\S]*scheduleVisibleRangeIdleWork\(\)/,
    'pointer release must keep deferred work parked until touch momentum becomes idle',
  );
  assertSourceContains(
    scheduleVisibleRangeIdleBody,
    /horizontalScrollMotionActive = false[\s\S]*applyDeferredHorizontalOverlayPayload\(\)[\s\S]*scheduleMovingVerticalGridUpdate\(false\)[\s\S]*schedulePeriodSeparatorsUpdate\(false\)[\s\S]*requestHistoryPaginationForVisibleRange/,
    'range idle must perform one full grid, separator, overlay, and history settle after momentum',
  );
  assertSourceContains(
    schedulePeriodSeparatorsBody,
    /isHorizontalScrollMotionActive\(\)[\s\S]*updatePeriodSeparatorsTransformOnly\(\)[\s\S]*return;[\s\S]*updatePeriodSeparators\(\)/,
    'period separators must use only their cached group transform while horizontal motion is active',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /dx > VERT_PAN_THRESHOLD && dx > dy \* 1\.2[\s\S]*preserveManualPriceScaleForHorizontalPan\(\)[\s\S]*markHorizontalScrollGestureActive\(\)/,
    'horizontal-pan start must preserve a user-owned vertical window',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /function preserveManualPriceScaleForHorizontalPan\(\) \{[\s\S]*isManualVerticalPanRangeLocked\(\)[\s\S]*applyManualVerticalPanLockedRange\(\)/,
    'horizontal navigation must reapply, not clear, manual price-scale ownership',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /if \(activeHorizontalScrollGesture\) \{[\s\S]*capture listener off the per-move hot path entirely[\s\S]*return;[\s\S]*if \(point && vertPanPending\) \{[\s\S]*deferHorizontalGestureDomWork\(\)[\s\S]*return;/,
    'classified horizontal moves must leave the capture hot path while pending moves avoid custom DOM repaint',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /horizontalScrollMotionActive && visibleRangeIdleTimer !== null[\s\S]*clearTimeout\(visibleRangeIdleTimer\)[\s\S]*visibleRangeIdlePendingAfterGesture = true/,
    'a repeated swipe must park the prior idle settle before the new finger starts moving',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /isScaleGestureEvent\(event\)[\s\S]*horizontalScrollMotionActive = false[\s\S]*chartScaleGestureActive = true/,
    'pinch must leave the horizontal transform-only path because bar spacing is changing',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /var isActualScaleGesture = isScaleGestureEvent\(event\) \|\| gestureHadMultitouch \|\| chartScaleGestureActive;[\s\S]*var wasScaleGesture = isActualScaleGesture \|\| Date\.now\(\) <= suppressChartTapUntil;[\s\S]*if \(isActualScaleGesture\) \{[\s\S]*chartScaleGestureActive = true;/,
    'post-pinch tap suppression must not turn an unrelated drag into a persistent scale gesture',
  );
  assertSourceContains(
    scheduleVisibleRangeIdleBody,
    /verticalPricePanGestureActive \|\|[\s\S]*chartScaleGestureActive \|\|[\s\S]*activeTradeLineDrag[\s\S]*visibleRangeIdlePendingAfterGesture = true[\s\S]*return;/,
    'idle settlement must not run under an active vertical, pinch, or trade-line gesture',
  );
});

test('webview bridge: vertical chart panning defers price-line rebuilds while moving trade labels', () => {
  const deferDomWorkBody = extractFunctionBody(chartWebViewHtmlSource, 'deferVerticalGestureDomWork');
  const refreshVerticalOverlayBody = extractFunctionBody(chartWebViewHtmlSource, 'refreshVerticalGestureOverlayPositions');
  const gestureRightScaleRefreshBody = extractFunctionBody(chartWebViewHtmlSource, 'flushGestureRightPriceScaleFallbackRefresh');
  const scheduleOverlayRefreshBody = extractFunctionBody(chartWebViewHtmlSource, 'scheduleOverlayDomRefresh');
  const refreshWhenIdleBody = extractFunctionBody(chartWebViewHtmlSource, 'refreshOverlayDomLabelsWhenIdle');
  const applyOverlayPayloadBody = extractFunctionBody(chartWebViewHtmlSource, 'applyOverlayPayload');
  const setChartOverlaysBody = extractFunctionBody(chartWebViewHtmlSource, 'setChartOverlays');

  assertSourceContains(
    deferDomWorkBody,
    /verticalGestureDomWorkPending = true[\s\S]*cancelOverlayDomRefreshFrame\(\)[\s\S]*scheduleGestureRightPriceScaleFallbackRefresh\(\)/,
    'vertical pan must defer heavy custom overlays while keeping the right price scale refreshing under the finger',
  );
  assertSourceContains(
    refreshVerticalOverlayBody,
    /lastOverlayGestureDeferralActivityAt = Date\.now\(\)[\s\S]*verticalGestureDomWorkPending = true[\s\S]*cancelOverlayDomRefreshFrame\(\)[\s\S]*scheduleGestureRightPriceScaleFallbackRefresh\(\)[\s\S]*scheduleTradeOverlayReposition\(\)/,
    'vertical pan frames must move the already-applied trade labels and right-axis boxes through coalesced position-only passes, and must stamp gesture activity so the stranded-gesture watchdog cannot rebuild mid-drag',
  );
  assert.doesNotMatch(
    refreshVerticalOverlayBody,
    /refreshOverlayDomLabels|applyOverlayPayload/,
    'vertical pan frames must never rebuild the whole trade overlay DOM on pointermove',
  );
  assertSourceContains(
    gestureRightScaleRefreshBody,
    /renderFallbackRightPriceScaleLabels\(\)[\s\S]*refreshMarketPriceScaleDom\(\)/,
    'vertical gesture frames must keep bid/ask badges attached to their market price lines like MT5',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /handleScroll\.vertTouchDrag = false/,
    'RTX5 must own chart-body vertical panning so the final user price range stays stable',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /var VERT_PAN_PRICE_DELTA_MULTIPLIER = 1/,
    'vertical pan must map finger movement to the price range at MT5-style 1:1 speed',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /var verticalScrollingLocked = false[\s\S]*function setVerticalScrollingLocked\(locked\) \{[\s\S]*verticalScrollingLocked = locked === true/,
    'native more-menu lock must bridge into the WebView vertical scrolling guard',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /var chartAutoScaleEnabled = false[\s\S]*function setChartAutoScaleEnabled\(enabled\) \{[\s\S]*chartAutoScaleEnabled = enabled === true[\s\S]*resetChartVerticalScale\(\)/,
    'MT5-style auto-scale must bridge into the WebView and reset the visible vertical scale when enabled',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /function resetChartVerticalScale\(\) \{[\s\S]*clearManualPriceScaleState\(\)[\s\S]*enableRightPriceAutoScale\(\)[\s\S]*scheduleOverlayPriceScaleLock\(true\)/,
    'reset vertical scale must clear manual price-axis movement and fit the visible range',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /var beginVerticalPan = function\(clientY\) \{[\s\S]*if \(isVerticalChartMovementBlocked\(\)\) return false/,
    'body vertical panning must not start while vertical scrolling is locked or auto-scale is active',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /var beginVerticalPan = function\(clientY\) \{[\s\S]*clearFreshSeriesVerticalCenterState\(\)[\s\S]*verticalPricePanGestureActive = true[\s\S]*deferVerticalGestureDomWork\(\)/,
    'committing to vertical pan must cancel bootstrap centering and enter deferred DOM-work mode',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /dy > VERT_PAN_THRESHOLD && dy > dx \* 1\.2[\s\S]*beginVerticalPan\(vertPanPending\.startY\)[\s\S]*continueVerticalPan\(point\.y\)[\s\S]*stopChartEvent\(event\)/,
    'chart-body vertical movement must apply the visible price range directly while keeping trade labels attached',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /var beginRightPriceScaleGesture = function\(event, clientX, clientY\)[\s\S]*verticalPricePanGestureActive = true[\s\S]*deferVerticalGestureDomWork\(\)/,
    'right price-axis vertical movement must also enter deferred DOM-work mode',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /var beginRightPriceScaleGesture = function\(event, clientX, clientY\)[\s\S]*series\.coordinateToPrice\(relativePoint\.y\)[\s\S]*\(range\.to - anchorPrice\) \/ startSpan/,
    'right-axis focal scaling must anchor to the rendered price coordinate, including scale margins',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /var beginRightPriceScaleGesture = function\(event, clientX, clientY\)[\s\S]*var minMove = 1 \/ Math\.pow\(10, precision\)[\s\S]*resolveRightPriceScaleCoordinateRange\(\)[\s\S]*resolveRightPriceScaleFallbackLabelCount\(metrics\) - 1[\s\S]*\(minMove \* fallbackLabelIntervals\) \/ priceScaleProjection[\s\S]*minimumSpan: minimumSpan/,
    'maximum right-axis zoom must project one symbol precision unit per owned-axis label interval',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /isRightPriceScaleGesturePoint\(point\.x, point\.y\)\) \{[\s\S]*if \(isVerticalChartMovementBlocked\(\)\) \{[\s\S]*vertPanPending = null[\s\S]*stopChartEvent\(event\)[\s\S]*return;/,
    'right price-axis vertical movement must also be blocked while vertical scrolling is locked or auto-scale is active',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /if \(rightPriceScaleGestureActive\) \{[\s\S]*applyRightPriceScaleGestureAt\(rightScalePoint\.y\)[\s\S]*deferVerticalGestureDomWork\(\)[\s\S]*stopChartEvent\(event\)[\s\S]*return;/,
    'right price-axis move frames must exclusively own the touch while deferring heavy overlay work',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /var applyRightPriceScaleGestureAt = function\(clientY\)[\s\S]*resolveMt5PriceScaleDragRange\(\{[\s\S]*anchorRatio: state\.anchorRatio[\s\S]*deltaY: deltaY[\s\S]*minimumSpan: state\.minimumSpan[\s\S]*renderVerticalPanRange\(state\.latestRange\)/,
    'right-axis movement must use focal-point MT5 scaling and render the resulting numeric range directly',
  );
  assertSourceContains(
    scheduleOverlayRefreshBody,
    /if \(verticalPricePanGestureActive\) \{[\s\S]*deferVerticalGestureDomWork\(\)[\s\S]*return;/,
    'overlay refresh requests must not repaint custom DOM during active vertical panning',
  );
  assertSourceContains(
    refreshWhenIdleBody,
    /if \(verticalPricePanGestureActive\) \{[\s\S]*deferVerticalGestureDomWork\(\)[\s\S]*return;/,
    'tick-driven overlay label refreshes must defer during active vertical panning',
  );
  assertSourceContains(
    applyOverlayPayloadBody,
    /if \(verticalPricePanGestureActive\) \{[\s\S]*pendingVerticalOverlayApply = true[\s\S]*deferVerticalGestureDomWork\(\)[\s\S]*return;/,
    'direct overlay payload rebuilds must be cached during active vertical panning',
  );
  assertSourceContains(
    setChartOverlaysBody,
    /if \(verticalPricePanGestureActive\) \{[\s\S]*pendingVerticalOverlayApply = true[\s\S]*deferVerticalGestureDomWork\(\)[\s\S]*return;/,
    'live overlay payloads must be cached instead of rebuilding price lines during active vertical panning',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /var endVerticalPan = function\(\) \{[\s\S]*verticalPricePanGestureActive = false[\s\S]*applyManualVerticalPanLockedRange\(\)[\s\S]*applyDeferredVerticalOverlayPayload\(\)[\s\S]*scheduleGestureRightPriceScaleFallbackRefresh\(\)[\s\S]*scheduleOverlayDomRefresh\(\)/,
    'release must apply deferred vertical overlay payloads and then settle right-axis and trade label DOM',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /var finishRightPriceScaleGesture = function\(cancelled\) \{[\s\S]*gestureState\.moved && isValidPriceRange\(gestureState\.latestRange\)[\s\S]*rightPriceScaleGestureActive = false[\s\S]*verticalPricePanGestureActive = false[\s\S]*rememberManualVerticalPanRange\(finalRange\)[\s\S]*applyManualVerticalPanLockedRange\(\)[\s\S]*settleVerticalPriceGestureDomWork\(\)/,
    'right price-axis release must lock the final visible price range and settle deferred DOM work',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /function applyManualVerticalPanLockedRange\(\)[\s\S]*syntheticRightPriceScaleFallbackRange = null[\s\S]*priceScaleApi\.setVisibleRange\(\{ from: lockedRange\.from, to: lockedRange\.to \}\)/,
    'manual ranges must let coordinateToPrice derive full-height labels instead of leaking the margin-excluding logical range',
  );
});

test('webview bridge: preserves backend OHLC candles without price-continuity pruning', () => {
  const sanitizerBody = extractFunctionBody(chartWebViewHtmlSource, 'sanitizeSeriesData');
  const normalizerBody = extractFunctionBody(chartWebViewHtmlSource, 'normalizeRawSeriesDatum');

  assertSourceContains(
    sanitizerBody,
    /return Object\.keys\(byTime\)[\s\S]*\.sort\(function\(left, right\) \{ return left\.time - right\.time; \}\);/,
    'WebView candle sanitizer should only dedupe and sort finite backend candles before rendering',
  );
  assert.doesNotMatch(
    sanitizerBody,
    /filterRawSeriesDataByPriceContinuity/,
    'WebView must not drop valid backend candles using a price-continuity heuristic',
  );
  assert.doesNotMatch(
    normalizerBody,
    /isRawSeriesDatumInternallyCoherent/,
    'WebView must not drop a finite backend OHLC candle because its wick is large',
  );
});

test('webview bridge: formats candle timestamps in UTC broker time', () => {
  const tickFormatterBody = extractFunctionBody(chartWebViewHtmlSource, 'formatChartTickMark');

  assertSourceContains(tickFormatterBody, /getUTCDate\(\)/, 'x-axis day labels must use UTC');
  assertSourceContains(tickFormatterBody, /getUTCMonth\(\)/, 'x-axis month labels must use UTC');
  assertSourceContains(tickFormatterBody, /getUTCHours\(\)/, 'x-axis hour labels must use UTC');
  assertSourceContains(tickFormatterBody, /getUTCMinutes\(\)/, 'x-axis minute labels must use UTC');
  assertSourceContains(tickFormatterBody, /getUTCFullYear\(\)/, 'x-axis year labels must use UTC');
  assertSourceContains(chartWebViewHtmlSource, /new Date\(Date\.UTC\(time\.year, time\.month - 1, time\.day\)\)/, 'Business-day dates must be interpreted as UTC');
  assertSourceContains(chartWebViewHtmlSource, /new Date\(Date\.UTC\(time\.businessDay\.year, time\.businessDay\.month - 1, time\.businessDay\.day\)\)/, 'Business-day wrapper dates must be interpreted as UTC');
  assert.doesNotMatch(tickFormatterBody, /getDate\(\)|getMonth\(\)|getHours\(\)|getMinutes\(\)|getFullYear\(\)/);
});

test('webview bridge: setLivePriceLine hides native market badges and paints one custom price-scale badge', () => {
  const body = extractFunctionBody(chartWebViewHtmlSource, 'setLivePriceLine');
  const legacyMarketLinesBody = extractFunctionBody(chartWebViewHtmlSource, 'setMarketPriceLines');
  const marketLineOptionsBody = extractFunctionBody(chartWebViewHtmlSource, 'makeMarketPriceLineOptions');
  const visibleRangeBody = extractFunctionBody(chartWebViewHtmlSource, 'resolvePriceRangeFromVisibleData');
  const healPriceScaleBody = extractFunctionBody(chartWebViewHtmlSource, 'healCollapsedPriceScaleRange');
  const renderMarketPriceScaleExtensionBody = extractFunctionBody(chartWebViewHtmlSource, 'renderMarketPriceScaleExtension');
  const renderMarketPriceScaleExtensionsBody = extractFunctionBody(chartWebViewHtmlSource, 'renderMarketPriceScaleExtensions');
  const collectMarketPriceScaleBadgeBody = extractFunctionBody(chartWebViewHtmlSource, 'collectMarketPriceScaleBadge');
  const renderMarketPriceScaleBadgeBody = extractFunctionBody(chartWebViewHtmlSource, 'renderMarketPriceScaleBadge');
  const renderMarketPriceScaleBadgesBody = extractFunctionBody(chartWebViewHtmlSource, 'renderMarketPriceScaleBadges');
  const axisMetricsBody = extractFunctionBody(chartWebViewHtmlSource, 'resolveMarketPriceScaleAxisMetrics');
  const badgeFormatterBody = extractFunctionBody(chartWebViewHtmlSource, 'formatMarketPriceScaleBadgeLabel');
  const refreshBody = extractFunctionBody(chartWebViewHtmlSource, 'refreshOverlayDomLabels');
  const marketPriceRangeBody = extractFunctionBody(chartWebViewHtmlSource, 'rangeContainsMarketPriceBadges');
  const marketPriceNormalizerBody = extractFunctionBody(chartWebViewHtmlSource, 'normalizeMarketPriceLinePrice');
  const marketDomSchedulerBody = extractFunctionBody(chartWebViewHtmlSource, 'scheduleMarketPriceScaleDomOnly');
  const marketDomFlushBody = extractFunctionBody(chartWebViewHtmlSource, 'flushMarketPriceScaleDomRefresh');
  const pickLivePriceColorBody = extractFunctionBody(chartWebViewHtmlSource, 'pickLivePriceColor');
  const refreshLivePriceLineColorBody = extractFunctionBody(chartWebViewHtmlSource, 'refreshBidPriceLineColor');

  assertSourceContains(body, /var normalizedPrice = normalizeMarketPriceLinePrice\(price\)/, 'live price line updates must normalize the Bid price before repainting');
  assertSourceContains(body, /var liveColor = pickLivePriceColor\(\)[\s\S]*marketLiveColor = liveColor/, 'live price line must use the chart-type direction color');
  assertSourceContains(body, /lastLivePrice = normalizedPrice[\s\S]*lastBidPrice = normalizedPrice[\s\S]*lastAskPrice = null/, 'live price state must cache Bid only and clear legacy Ask state');
  assertSourceContains(body, /askPriceLine = removeMarketPriceLine\(askPriceLine\)/, 'live price updates must remove any stale legacy Ask line');
  assertSourceContains(body, /bidPriceLine\.applyOptions\(makeMarketPriceLineOptions\(normalizedPrice, liveColor\)\)/, 'existing live guide line must repaint with the current chart-type direction color');
  assertSourceContains(body, /createMarketPriceLine\(normalizedPrice, liveColor\)/, 'new live guide line must render with the current chart-type direction color');
  assertSourceContains(body, /ensureMarketPriceBadgesVisible\(\)/, 'live price line updates must keep the guide line inside the visible price scale');
  assertSourceContains(pickLivePriceColorBody, /seriesType === 'area'[\s\S]*lastAreaDirection[\s\S]*resolveAreaSeriesDirection\(lastRawSeriesData\)[\s\S]*return pickAreaSeriesColor\(areaDirection\)/, 'Area live price visuals must follow the selected performance direction');
  assertSourceContains(pickLivePriceColorBody, /return barUpColor[\s\S]*_liveBar\.close >= _liveBar\.open \? barUpColor : barDownColor/, 'non-Area live price color must continue to follow the active candle bull/bear colors');
  assertSourceContains(chartWebViewHtmlSource, /barUpColor = colors\.up[\s\S]*barDownColor = colors\.down/, 'live price colors must come from resolved candle up/down colors, including custom schema colors');
  assertSourceContains(refreshLivePriceLineColorBody, /var liveColor = pickLivePriceColor\(\)[\s\S]*marketLiveColor = liveColor[\s\S]*color: liveColor[\s\S]*axisLabelColor: liveColor/, 'tick repaint must retint the live line and right-axis badge color when the candle direction changes');
  assertSourceContains(chartWebViewHtmlSource, /lastAreaDirection = direction;[\s\S]*refreshBidPriceLineColor\(\);[\s\S]*scheduleMarketPriceScaleDomOnly\(\)/, 'an Area direction flip must retint both the live guide and custom price badge without waiting for another tick');
  assertSourceContains(legacyMarketLinesBody, /setLivePriceLine\(bid\)/, 'legacy two-price bridge must use Bid only');
  assert.doesNotMatch(legacyMarketLinesBody, /normalizedAsk|setAskPriceLine/, 'legacy bridge must not fall back to Ask');
  assertSourceContains(marketPriceNormalizerBody, /return price/, 'live price line coordinates must retain the exact backend Bid');
  assert.doesNotMatch(marketPriceNormalizerBody, /toFixed|Math\.round/, 'live price coordinates must not freeze on sub-display-precision ticks');
  assertSourceContains(marketDomSchedulerBody, /marketPriceScaleDomPending = true[\s\S]*setTimeout\([\s\S]*flushMarketPriceScaleDomRefresh[\s\S]*MARKET_PRICE_SCALE_DOM_FALLBACK_MS[\s\S]*requestAnimationFrame\([\s\S]*flushMarketPriceScaleDomRefresh/, 'the custom right-axis marker must have an independent rAF watchdog');
  assertSourceContains(marketDomFlushBody, /marketPriceScaleDomPending[\s\S]*isHorizontalScrollMotionActive\(\) \|\| verticalPricePanGestureActive[\s\S]*marketPriceScaleDomPending = false[\s\S]*refreshMarketPriceScaleDom\(\)/, 'gesture deferral must retain the latest marker request and flush it after settlement');
  assertSourceContains(marketLineOptionsBody, /lineVisible: true/, 'market price lines must explicitly keep their chart guide visible');
  assertSourceContains(marketLineOptionsBody, /axisLabelVisible: false/, 'market price lines must hide lightweight-charts native right-axis badges');
  assert.doesNotMatch(marketLineOptionsBody, /axisLabelColor: color/, 'live price line must not configure hidden native badge fill colors');
  assert.doesNotMatch(marketLineOptionsBody, /axisLabelTextColor: '#FFFFFF'/, 'live price line must not configure hidden native badge text colors');
  assertSourceContains(marketLineOptionsBody, /title: ''/, 'live price line must stay text-free');
  assertSourceContains(chartWebViewHtmlSource, /var MARKET_PRICE_SCALE_EXTENSION_HEIGHT = 1/, 'custom market price-scale extensions must stay a one-pixel MT5-like accent');
  assertSourceContains(chartWebViewHtmlSource, /var MARKET_PRICE_SCALE_BADGE_HEIGHT = 22[\s\S]*var MARKET_PRICE_SCALE_BADGE_MIN_WIDTH = 56/, 'custom market price-scale badges must use compact phone-safe dimensions');
  assertSourceContains(renderMarketPriceScaleExtensionBody, /className = 'rtx5-market-price-scale-extension'[\s\S]*style\.left = axisLeft \+ 'px'[\s\S]*style\.width = Math\.min\(axisWidth/, 'custom market price-scale extension must render only over the right price scale');
  assertSourceContains(renderMarketPriceScaleExtensionsBody, /renderMarketPriceScaleExtension\(layer, lastLivePrice, marketLiveColor\)/, 'overlay refresh must repaint the custom live price-scale extension');
  assertSourceContains(axisMetricsBody, /resolveRightPriceScaleFallbackAxisMetrics\(Object\.assign[\s\S]*MARKET_PRICE_SCALE_BADGE_MIN_WIDTH[\s\S]*axisLeft \+ axisWidth > chartWidth/, 'custom market price badges must occupy the owned right price-scale strip without overflowing the chart');
  assertSourceContains(badgeFormatterBody, /resolveOverlayDisplayDecimals\(\)[\s\S]*Number\(price\)\.toFixed\(decimals\)/, 'custom market price badges must use the same configured display precision as the overlay');
  assertSourceContains(collectMarketPriceScaleBadgeBody, /var countdownLabel = role === 'live' \? resolveCandleCountdownLabel\(\) : null[\s\S]*var priceRowHeight =[\s\S]*var desiredTop = Math\.round\(y - priceRowHeight \/ 2\)[\s\S]*desiredTop: desiredTop[\s\S]*top: desiredTop/, 'custom market price badges must align the live-price row to the real price coordinate while placing countdown below it');
  assertSourceContains(renderMarketPriceScaleBadgeBody, /rtx5-market-price-scale-badge[\s\S]*rtx5-market-price-scale-badge-price[\s\S]*rtx5-market-price-scale-badge-countdown[\s\S]*priceRow\.textContent = formatMarketPriceScaleBadgeLabel\(badge\.price\)[\s\S]*countdownRow\.textContent = badge\.countdownLabel \|\| ''[\s\S]*style\.left = axisMetrics\.axisLeft \+ 'px'[\s\S]*style\.width = axisMetrics\.axisWidth \+ 'px'[\s\S]*style\.background = badge\.color[\s\S]*style\.color = '#FFFFFF'[\s\S]*style\.textAlign = 'right'/, 'custom market price-scale badge must render stable price and countdown rows inside the colored right-axis box');
  assertSourceContains(renderMarketPriceScaleBadgesBody, /collectMarketPriceScaleBadge\(layer, axisMetrics, lastLivePrice, marketLiveColor, 'live'\)[\s\S]*badges\.sort[\s\S]*MARKET_PRICE_SCALE_BADGE_GAP[\s\S]*renderMarketPriceScaleBadge\(layer, badges\[badgeIndex\], axisMetrics\)/, 'overlay refresh must repaint the custom live price-scale badge in place');
  assert.doesNotMatch(renderMarketPriceScaleBadgesBody, /Math\.max\(minTop|Math\.min\(maxTop|maxTop|axisMetrics\.plotBottom - MARKET_PRICE_SCALE_BADGE_HEIGHT/, 'custom market price badges must not be pinned to the top or bottom edge while the chart is vertically panned');
  assertSourceContains(visibleRangeBody, /includeMarketPriceBadges === false[\s\S]*expandPriceRangeForMarketPriceBadges\(robustRange\)/, 'visible price-scale recovery must be able to ignore a far live price badge during horizontal navigation');
  assertSourceContains(
    chartWebViewHtmlSource,
    /function expandPriceRangeForMarketPriceBadges\(range\)[\s\S]*var maxQuoteDistance = span \* 4[\s\S]*return expanded \? makePaddedPriceRange/,
    'market live price badge expansion must stay local to the visible candle range',
  );
  assertSourceContains(marketPriceRangeBody, /resolveMarketPriceBadgeRecoveryBuffer\(reference \|\| normalized\)/, 'market badge containment must keep a small stability buffer before forcing axis recovery');
  assertSourceContains(healPriceScaleBody, /marketPriceBadgesOutOfRange[\s\S]*rangeContainsMarketPriceBadges\(currentRange, candleDataRange\)[\s\S]*setRecoveredRightPriceRange\(dataRange\)/, 'price-scale healing must recover only for near live price badges outside the visible axis range');
  assertSourceContains(refreshBody, /refreshMarketPriceScaleDom\(\)/, 'overlay refresh must render custom market price-scale DOM');
  assertSourceContains(chartWebViewHtmlSource, /function refreshMarketPriceScaleDom\(\)[\s\S]*renderMarketPriceScaleExtensions\(layer\)[\s\S]*renderMarketPriceScaleBadges\(layer\)/, 'overlay refresh must render MT5-style custom market price-scale badges after the line accents');
  assertSourceContains(
    source,
    /const paintCanonicalLiveTick = \(allowUnchangedSnapshot = false\) => \{[\s\S]*const projection = projectChartLiveTickCandles\([\s\S]*allowUnchangedSnapshot && updateMode === 'noop'[\s\S]*updateLiveTick\([\s\S]*const scheduleCanonicalLivePaint =[\s\S]*livePaintTimer = setTimeout\([\s\S]*requestAnimationFrame\(flushCanonicalLivePaint\)[\s\S]*flushCanonicalLivePaint\(\);[\s\S]*liveCandlesEngine\.subscribe\(\s*chartSymbol,\s*chartTimeframe,\s*scheduleCanonicalLivePaint/,
    'native live paints must project and atomically repaint the current candle and Bid line through a liveness-guarded scheduler',
  );
  assert.doesNotMatch(
    source,
    /pendingMarketPriceLinesRef|requestMarketPriceLineFlush|flushPendingMarketPriceLines|CHART_MARKET_PRICE_LINE_SYNC_INTERVAL_MS/,
    'the live Bid line must not use an independently scheduled queue',
  );
  assertSourceContains(source, /const clearRenderedMarketPriceLines = useCallback[\s\S]*const revision = livePaintRevisionRef\.current \+ 1[\s\S]*setLivePriceLineForContext\([\s\S]*null,[\s\S]*requestedContextSig[\s\S]*revision[\s\S]*livePaintRevisionRef\.current = revision[\s\S]*const renderedContextToClear =[\s\S]*clearRenderedMarketPriceLines\(renderedContextToClear\)[\s\S]*renderedDataContextSigRef\.current = ''/, 'symbol/timeframe changes must clear stale live price lines with context and revision guards');
});

test('webview bridge: native web and WebView creation reserve the right price scale', () => {
  const applyLayoutBody = extractFunctionBody(chartWebViewHtmlSource, 'applyChartLayout');
  const setScaleMarginsBody = extractFunctionBody(chartWebViewHtmlSource, 'setPrimaryPriceScaleMargins');

  assertSourceContains(
    chartConstantsSource,
    /export const CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH = 62;/,
    'right price-scale minimum width must be centralized',
  );
  assertSourceContains(
    source,
    /rightPriceScale: \{[\s\S]*visible: true,[\s\S]*minimumWidth: CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH/,
    'native host chart options must explicitly reserve and show the right price scale',
  );
  assertSourceContains(
    chartWebSource,
    /rightPriceScale: \{[\s\S]*visible: true,[\s\S]*minimumWidth: CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH/,
    'web chart creation must use the shared right price-scale reservation',
  );
  assertSourceContains(
    applyLayoutBody,
    /opts\.rightPriceScale = Object\.assign\(\{\}, opts\.rightPriceScale \|\| \{\}, \{[\s\S]*visible: true,[\s\S]*entireTextOnly: false,[\s\S]*minimumWidth: \$\{CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH\}/,
    'WebView chart creation must enforce the visible right price-scale reservation with Android-safe label layout',
  );
  assertSourceContains(
    setScaleMarginsBody,
    /chart\.priceScale\('right'\)\.applyOptions\(\{[\s\S]*visible: true,[\s\S]*minimumWidth: \$\{CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH\}/,
    'WebView price-scale margin updates must preserve the right price-scale reservation',
  );
  assertSourceContains(
    setScaleMarginsBody,
    /entireTextOnly: false/,
    'WebView price-scale margin updates must not collapse Android axis labels to entire-text-only layout',
  );
  assert.doesNotMatch(
    setScaleMarginsBody,
    /entireTextOnly: true/,
    'primary right price-scale margin updates must preserve entireTextOnly=false',
  );
});

test('native chart status overlays do not block symbol recovery controls', () => {
  assertSourceContains(
    source,
    /const startupChartPrefetchKeyRef = useRef\(''\)[\s\S]*void prefetchChartTimeframeHistory\(chartSymbol, normalizedTimeframe\)/,
    'native chart must start warming saved candle history after the first app frame and before the first chart tab visit',
  );
  assertSourceContains(
    source,
    /const candlesAvailable = chartHasHistoryCandles && sanitizedCandles\.length > 0;[\s\S]*const shouldShowImmediateHistoryLoading = !candlesAvailable[\s\S]*const isLoading =[\s\S]*shouldShowImmediateHistoryLoading \|\| loadingDelayPassed[\s\S]*const isNoMarketData = !candlesAvailable/,
    'fresh symbol switches with no committed history must show loading immediately instead of a blank grid',
  );
  assertSourceContains(
    source,
    /setLoadingFallback\(false\);[\s\S]*if \(!chartRuntimeActive \|\| hasUsableRetainedChart\) \{[\s\S]*return undefined;[\s\S]*const fallbackTmr = setTimeout\(\(\) => setLoadingFallback\(true\), 10000\)[\s\S]*chartRuntimeActive,[\s\S]*chartSymbol,[\s\S]*chartTimeframe,[\s\S]*chartType,[\s\S]*hasUsableRetainedChart,[\s\S]*\]\)/,
    'hidden tabs and healthy charts must not age into fallback, while WebView process loss re-arms a bounded recovery window',
  );
  assertSourceContains(
    source,
    /const hasPaintedCurrentChartContext =[\s\S]*hasPaintedChartOnce[\s\S]*lastPaintedChartDataContextSig === chartDataContextSig[\s\S]*lastPaintedChartDataContextEpoch === chartDataContextEpoch[\s\S]*const hasPreactivatedCurrentChartContext =[\s\S]*preactivatedChartContext\.dataContextSig === chartDataContextSig[\s\S]*const hasUsableRetainedChart =[\s\S]*hasPaintedCurrentChartContext \|\| hasPreactivatedCurrentChartContext[\s\S]*webViewReady[\s\S]*chartCanvasReady[\s\S]*const shouldShowChartLoadingOverlay =[\s\S]*!hasUsableRetainedChart &&[\s\S]*\(!loadingFallback \|\| candlesAvailable\) &&[\s\S]*!hasChartDataError &&[\s\S]*\(!chartSurfaceReady \|\| isLoading \|\| candlesAvailable\)/,
    'loading overlay must reject stale ownership while an exact preactivated or painted context stays visible',
  );
  assertSourceContains(
    source,
    /if \(renderableCandles\.length === 0\) \{[\s\S]*if \(contextChanged\) \{[\s\S]*updateChartData\(\[\], \{[\s\S]*dataContextSig: \$\{JSON\.stringify\(chartDataContextSig\)\}/,
    'a cold context must clear old-symbol candles and retire their countdown context behind its loading overlay',
  );
  assertSourceContains(
    source,
    /readyInitSignature === readySnapshotInitSignature[\s\S]*if \(readyHasHistoryCandles\) \{[\s\S]*setLastPaintedChartDataContextSig\(chartDataContextSig\)[\s\S]*setLastPaintedChartDataContextEpoch\([\s\S]*chartDataContextEpochRef\.current\.epoch/,
    'an exact init snapshot acknowledgement may confirm the current chart context only when canonical history exists',
  );
  assertSourceContains(
    source,
    /msg\.type === 'CHART_DATA_PAINTED'[\s\S]*shouldAcceptChartDataPaint\([\s\S]*if \(!pendingPaint\.confirmsUsableChart\) \{[\s\S]*return;[\s\S]*setLastPaintedChartDataContextSig\(paintedDataContextSig\)/,
    'normal symbol data replacement must wait for a tokenized canonical-history WebView paint acknowledgement',
  );
  assertSourceContains(
    source,
    /\{shouldShowChartLoadingOverlay && \(\s*<View pointerEvents="none" style=\{styles\.chartOverlay\}>/,
    'the context-scoped loading overlay must remain non-blocking',
  );
  assertSourceContains(
    source,
    /<WebView[\s\S]*backgroundColor: resolvedChartColors\.background,[\s\S]*opacity: hasUsableRetainedChart \? 1 : 0/,
    'an unconfirmed quote-only WebView must stay fully concealed beneath the native loading state',
  );
  assertSourceContains(
    source,
    /\{chartSurfaceReady && isError && !isLoading && \(\s*<View pointerEvents="box-none" style=\{styles\.chartOverlay\}>/,
    'error overlay must not block the symbol picker or toolbar while users recover',
  );
  assertSourceContains(
    source,
    /\{chartSurfaceReady && isNoMarketData && !isError && \(\s*<View pointerEvents="box-none" style=\{styles\.chartOverlay\}>/,
    'no-data overlay must not block the symbol picker so unavailable symbols can be skipped',
  );
});

test('native chart tap radial menu toggles closed on the next chart tap', () => {
  assertSourceContains(
    source,
    /msg\.type === 'CHART_TAP'[\s\S]*const nextAnchor = \{[\s\S]*chartTapMenuOpenedAtRef\.current = Date\.now\(\);[\s\S]*if \(chartTapMenuAnchor === null\) \{[\s\S]*settleChartViewportTouchForRadialOpen\(\);[\s\S]*\}\s*setChartTapMenuAnchor\(\(currentAnchor\) => \(\s*currentAnchor \? null : nextAnchor\s*\)\)/,
    'valid chart body taps must alternate the MT5-like radial menu open and closed instead of only re-anchoring it',
  );
  const chartTapBranch = source.slice(
    source.indexOf("} else if (msg.type === 'CHART_TAP')"),
    source.indexOf("} else if (msg.type === 'CHART_DOUBLE_TAP')"),
  );
  assert.doesNotMatch(
    chartTapBranch,
    /syncChartViewportFrame|requestAnimationFrame|measureInWindow/,
    'an undivided chart tap must mount the radial immediately without a frame-and-measure barrier',
  );

  const settleTouchStart = source.indexOf('const settleChartViewportTouchForRadialOpen = useCallback');
  const settleTouchEnd = source.indexOf('useEffect(() => {', settleTouchStart);
  assert.notEqual(settleTouchStart, -1, 'radial touch-settle callback must exist');
  assert.notEqual(settleTouchEnd, -1, 'radial touch-settle callback must be bounded');
  const settleTouchBody = source.slice(settleTouchStart, settleTouchEnd);
  assertSourceContains(
    settleTouchBody,
    /cancelAnimationFrame\(chartViewportTouchReleaseFrameRef\.current\);[\s\S]*chartViewportTouchReleaseFrameRef\.current = null;[\s\S]*clearTimeout\(chartViewportTouchFailsafeTimerRef\.current\);[\s\S]*chartViewportTouchActiveRef\.current = false;[\s\S]*setChartViewportTouchActive\(false\);/,
    'opening must cancel the queued touch-release frame and fold touch=false into the radial-open commit',
  );
  assert.doesNotMatch(
    settleTouchBody,
    /requestAnimationFrame\(/,
    'touch settling for an open must not queue a parent render during the native entrance',
  );
});

test('native chart tap radial menu opens with a native-driven smooth entrance', () => {
  assertSourceContains(
    chartTapRadialMenuSource,
    /function ChartTapRadialMenuComponent\([\s\S]*export const ChartTapRadialMenu = React\.memo\(ChartTapRadialMenuComponent\);/,
    'the retained radial must be memoized so unrelated parent renders cannot reconcile its native entrance',
  );
  assertSourceContains(
    chartTapRadialMenuSource,
    /const CHART_TAP_MENU_OPEN_SCALE_FROM = 0\.5/,
    'the radial menu entrance must start from a visibly smaller MT5-like ring scale',
  );
  assertSourceContains(
    chartTapRadialMenuSource,
    /const CHART_TAP_MENU_OPEN_ROTATION_FROM_DEG = -90/,
    'the radial menu must begin one quarter-turn counterclockwise like the recorded MT5 entrance',
  );
  assertSourceContains(
    chartTapRadialMenuSource,
    /const computeAnchorPosition = React\.useCallback\(\(\) => \(\s*resolveMenuPosition\(anchorX, anchorY\)\s*\)/,
    'the radial menu must open around the actual chart tap point instead of screen-centering every open',
  );
  assertSourceContains(
    chartTapRadialMenuSource,
    /const clampedCenterX = clampMenuCenter\(centerX, containerWidth\);[\s\S]*const clampedCenterY = clampMenuCenter\(centerY, containerHeight\);[\s\S]*left: Math\.round\(clampedCenterX - CHART_TAP_MENU_SIZE \/ 2\),[\s\S]*top: Math\.round\(clampedCenterY - CHART_TAP_MENU_SIZE \/ 2\)/,
    'left, center, and right safe-area taps must retain their own clamped anchor instead of sharing a fixed center',
  );
  assertSourceContains(
    chartTapRadialMenuSource,
    /const CHART_TAP_MENU_OPEN_DURATION_MS = 165/,
    'the radial menu entrance must settle within the short MT5-like capture window',
  );
  assertSourceContains(
    chartTapRadialMenuSource,
    /const CHART_TAP_MENU_OPEN_SCALE_TIMESTAMPS_MS = \[\s*0,\s*16,\s*33,\s*50,\s*67,\s*84,\s*100,\s*115,\s*CHART_TAP_MENU_OPEN_DURATION_MS,\s*\];[\s\S]*const CHART_TAP_MENU_OPEN_SCALE_PROGRESS_STOPS = CHART_TAP_MENU_OPEN_SCALE_TIMESTAMPS_MS\.map\(\s*\(timestampMs\) => timestampMs \/ CHART_TAP_MENU_OPEN_DURATION_MS,[\s\S]*const CHART_TAP_MENU_OPEN_SCALE_STOPS = \[\s*CHART_TAP_MENU_OPEN_SCALE_FROM,\s*0\.6,\s*0\.7,\s*0\.79,\s*0\.875,\s*0\.94,\s*0\.985,\s*1,\s*1,\s*\];/,
    'scale must use the measured millisecond poses normalized against the shared 165ms clock',
  );
  assertSourceContains(
    chartTapRadialMenuSource,
    /const CHART_TAP_MENU_OPEN_ROTATION_TIMESTAMPS_MS = \[\s*0,\s*16,\s*33,\s*50,\s*67,\s*84,\s*100,\s*116,\s*133,\s*CHART_TAP_MENU_OPEN_DURATION_MS,\s*\];[\s\S]*const CHART_TAP_MENU_OPEN_ROTATION_PROGRESS_STOPS = CHART_TAP_MENU_OPEN_ROTATION_TIMESTAMPS_MS\.map\(\s*\(timestampMs\) => timestampMs \/ CHART_TAP_MENU_OPEN_DURATION_MS,[\s\S]*const CHART_TAP_MENU_OPEN_ROTATION_STOPS = \[\s*`\$\{CHART_TAP_MENU_OPEN_ROTATION_FROM_DEG\}deg`,\s*'-51deg',\s*'-40deg',\s*'-30deg',\s*'-23deg',\s*'-16deg',\s*'-10deg',\s*'-6deg',\s*'-2deg',\s*'0deg',\s*\];/,
    'rotation must retain its independently measured millisecond poses on the shared clock',
  );
  assertSourceContains(
    chartTapRadialMenuSource,
    /const entranceProgress = React\.useRef\(new Animated\.Value\(0\)\)\.current;[\s\S]*Animated\.timing\(entranceProgress, \{[\s\S]*toValue: 1,[\s\S]*duration: CHART_TAP_MENU_OPEN_DURATION_MS,[\s\S]*easing: Easing\.linear,[\s\S]*useNativeDriver: true/,
    'the measured keyframes must share one React Native Animated timeline on the native driver',
  );
  assertSourceContains(
    chartTapRadialMenuSource,
    /entranceProgress\.interpolate\(\{[\s\S]*inputRange: CHART_TAP_MENU_OPEN_SCALE_PROGRESS_STOPS,[\s\S]*outputRange: CHART_TAP_MENU_OPEN_SCALE_STOPS[\s\S]*entranceProgress\.interpolate\(\{[\s\S]*inputRange: CHART_TAP_MENU_OPEN_ROTATION_PROGRESS_STOPS,[\s\S]*outputRange: CHART_TAP_MENU_OPEN_ROTATION_STOPS/,
    'scale and rotation must use the independently measured MT5 presentation stops',
  );
  assert.equal(
    chartTapRadialMenuSource.match(/const entranceProgress = React\.useRef\(new Animated\.Value\(0\)\)\.current/g)?.length,
    1,
    'scale and rotation must share one entrance progress value',
  );
  assert.equal(
    chartTapRadialMenuSource.match(/Animated\.timing\(entranceProgress,/g)?.length,
    1,
    'the shared progress value must have one immediate native timing clock',
  );
  const hiddenBranchStart = chartTapRadialMenuSource.indexOf(
    'if (!visible) {',
    chartTapRadialMenuSource.indexOf('const renderedMenuPosition'),
  );
  const visibleReopenStart = chartTapRadialMenuSource.indexOf(
    'cancelHiddenResetFrame();',
    hiddenBranchStart,
  );
  const hiddenResetEffectStart = chartTapRadialMenuSource.indexOf(
    'React.useEffect(() => {',
    visibleReopenStart,
  );
  const hiddenResetEffectEnd = chartTapRadialMenuSource.indexOf(
    'const panResponder = React.useMemo',
    hiddenResetEffectStart,
  );
  assert.notEqual(hiddenBranchStart, -1);
  assert.notEqual(visibleReopenStart, -1);
  assert.notEqual(hiddenResetEffectStart, -1);
  assert.notEqual(hiddenResetEffectEnd, -1);
  const hiddenLayoutBranch = chartTapRadialMenuSource.slice(hiddenBranchStart, visibleReopenStart);
  const openingLayoutBranch = chartTapRadialMenuSource.slice(visibleReopenStart, hiddenResetEffectStart);
  const hiddenResetEffect = chartTapRadialMenuSource.slice(hiddenResetEffectStart, hiddenResetEffectEnd);

  assertSourceContains(
    hiddenLayoutBranch,
    /if \(!visible\) \{\s*wasVisibleRef\.current = false;\s*lastAnchorKeyRef\.current = 'hidden';\s*return;\s*\}/,
    'the layout-critical close branch must only mark the retained radial hidden',
  );
  assert.doesNotMatch(
    hiddenLayoutBranch,
    /entranceProgress\.(?:stopAnimation|setValue)/,
    'closing must not mutate the native animation value in the layout-critical branch',
  );
  assertSourceContains(
    openingLayoutBranch,
    /cancelHiddenResetFrame\(\);\s*const isOpening = !wasVisibleRef\.current;[\s\S]*if \(!isOpening\) \{\s*return;\s*\}[\s\S]*entranceProgress\.setValue\(0\);[\s\S]*startEntranceAnimation\(\);/,
    'reopening must cancel a deferred reset, reset once, and immediately start the shared native clock',
  );
  assert.equal(openingLayoutBranch.match(/entranceProgress\.setValue\(0\)/g)?.length, 1);
  assert.equal(openingLayoutBranch.match(/startEntranceAnimation\(\)/g)?.length, 1);
  assert.doesNotMatch(
    openingLayoutBranch,
    /entranceProgress\.stopAnimation|setNativeProps/,
    'the opening path must not redundantly stop animation or imperatively reposition the menu',
  );
  assertSourceContains(
    chartTapRadialMenuSource,
    /const cancelHiddenResetFrame = React\.useCallback\(\(\) => \{[\s\S]*cancelAnimationFrame\(hiddenResetFrameRef\.current\);[\s\S]*hiddenResetFrameRef\.current = null;[\s\S]*\}, \[\]\);[\s\S]*React\.useLayoutEffect\(\(\) => \{\s*return \(\) => \{\s*entranceProgress\.stopAnimation\(\);\s*cancelHiddenResetFrame\(\);/,
    'the deferred hidden reset must have one cancel helper reused by unmount cleanup',
  );
  assertSourceContains(
    hiddenResetEffect,
    /if \(visible\) \{\s*cancelHiddenResetFrame\(\);\s*return;\s*\}[\s\S]*hiddenResetFrameRef\.current = requestAnimationFrame\(\(\) => \{\s*hiddenResetFrameRef\.current = null;\s*if \(!wasVisibleRef\.current\) \{\s*entranceProgress\.setValue\(0\);\s*\}[\s\S]*return cancelHiddenResetFrame;/,
    'a passive post-close frame must reset only while lifecycle state remains hidden and expose the cancel helper as cleanup',
  );
  assert.doesNotMatch(
    chartTapRadialMenuSource,
    /entranceStartFrameRef|cancelPendingEntranceStart/,
    'the radial entrance must not retain a requestAnimationFrame gate or its cancellation ref',
  );
  assertSourceContains(
    chartTapRadialMenuSource,
    /const renderedMenuPosition = visible && lastAnchorKeyRef\.current !== anchorKey[\s\S]*\? computeAnchorPosition\(\)[\s\S]*: menuPositionRef\.current;[\s\S]*top: renderedMenuPosition\.top,[\s\S]*left: renderedMenuPosition\.left/,
    'the first visible render must already use the new tap anchor without waiting for a second position commit',
  );
  assert.equal(
    chartTapRadialMenuSource.match(/menuViewRef\.current\?\.setNativeProps\(/g)?.length,
    1,
    'only the retained drag path may imperatively reposition; opening uses renderedMenuPosition',
  );
  assert.doesNotMatch(
    chartTapRadialMenuSource,
    /React\.useEffect\(\(\) => \{\s*startEntranceAnimation\(\);/,
    'a passive mount effect would reintroduce the small-ring first-frame stall',
  );
  assertSourceContains(
    source,
    /<ChartTapRadialMenu\s+anchor=\{chartTapMenuAnchor\}\s+visible=\{chartTapMenuAnchor !== null\}/,
    'the radial content must stay mounted between taps so its native layer is ready before animation',
  );
  assert.doesNotMatch(
    source,
    /\{chartTapMenuAnchor \? \(\s*<ChartTapRadialMenu/,
    'opening the radial must not cold-mount all labels and icons on the tap frame',
  );
  assertSourceContains(
    chartTapRadialMenuSource,
    /<Animated\.View[\s\S]*renderToHardwareTextureAndroid[\s\S]*style=\{\[[\s\S]*styles\.menuContent,[\s\S]*transform: \[[\s\S]*\{ scale: entranceScale \},[\s\S]*\{ rotate: entranceRotation \}/,
    'the entire radial menu must scale and rotate together on one Android hardware layer',
  );
  assert.doesNotMatch(
    chartTapRadialMenuSource,
    /Reanimated|useSharedValue|executeOnUIRuntimeSync|withDelay|withTiming|CHART_TAP_MENU_OPEN_OPACITY_FROM|needsOffscreenAlphaCompositing|Animated\.parallel/,
    'the recorded MT5 entrance must not use a Reanimated worklet, gradual content fade, or extra alpha composition',
  );
});

test('native chart supplies stable named callbacks for every radial destination', () => {
  assertSourceContains(
    source,
    /const handleRadialOpenObjects = useCallback\(\(\) => \{\s*closeChartTapMenu\(\);\s*handleOpenObjectsScreen\(\);\s*\}, \[closeChartTapMenu, handleOpenObjectsScreen\]\);/,
    'the Objects radial action must retain its close-then-open behavior in a stable callback',
  );
  assertSourceContains(
    source,
    /const handleRadialOpenDrawingTools = useCallback\(\(\) => \{\s*closeChartTapMenu\(\);\s*routeChartWindowToolbarAction\('drawings'\);\s*\}, \[closeChartTapMenu, routeChartWindowToolbarAction\]\);/,
    'the Drawing Tools radial action must retain its pane-aware routing in a stable callback',
  );
  assertSourceContains(
    source,
    /const handleRadialOpenIndicators = useCallback\(\(\) => \{[\s\S]*closeChartTapMenu\(\);[\s\S]*router\.push\('\/chart\/indicators'\)[\s\S]*\}, \[closeChartTapMenu, router\]\);/,
    'the Indicators radial action must retain its route in a stable callback',
  );
  assertSourceContains(
    source,
    /const handleRadialOpenSymbolPicker = useCallback\(\(\) => \{\s*closeChartTapMenu\(\);\s*handleOpenSymbolPicker\(\);\s*\}, \[closeChartTapMenu, handleOpenSymbolPicker\]\);/,
    'the Symbol radial action must retain its picker launch in a stable callback',
  );
  assertSourceContains(
    source,
    /const latestHandleOpenChartScaleMenuRef = useRef\(handleOpenChartScaleMenu\);\s*latestHandleOpenChartScaleMenuRef\.current = handleOpenChartScaleMenu;\s*const handleRadialOpenChartScaleMenu = useCallback\(\(\) => \{\s*latestHandleOpenChartScaleMenuRef\.current\(\);\s*\}, \[\]\);/,
    'the stable Scale callback must invoke the latest scale-menu action through its ref',
  );
  assertSourceContains(
    source,
    /<ChartTapRadialMenu[\s\S]*onSelectTimeframe=\{handleTimeframeSelect\}[\s\S]*onOpenChartWindows=\{handleOpenChartWindows\}[\s\S]*onOpenObjects=\{handleRadialOpenObjects\}[\s\S]*onOpenDrawingTools=\{handleRadialOpenDrawingTools\}[\s\S]*onOpenIndicators=\{handleRadialOpenIndicators\}[\s\S]*onOpenSymbolPicker=\{handleRadialOpenSymbolPicker\}[\s\S]*onOpenScaleControls=\{handleRadialOpenChartScaleMenu\}/,
    'the retained radial must receive named handlers for all existing destinations',
  );
});

test('undivided radial menu opening does not restack the chart WebView', () => {
  assertSourceContains(
    source,
    /chartWindows\.isSplit\s*&& chartTapMenuAnchor !== null\s*&& \{ overflow: 'visible', zIndex: 80, elevation: 80 \}/,
    'only a split chart may lift its viewport to let a radial cross pane bounds',
  );
  assertSourceContains(
    chartWindowsLayoutSource,
    /rendersAuxiliaryPane && radialMenuOpen && styles\.radialMenuPane/,
    'the chart-window parent must retain its radial lift only while an auxiliary pane exists',
  );
});

test('webview bridge: right price-scale layout recovery gates chart ready and resize/data updates', () => {
  const layoutOptionsBody = extractFunctionBody(chartWebViewHtmlSource, 'applyRightPriceScaleLayoutOptions');
  const layoutHealthyBody = extractFunctionBody(chartWebViewHtmlSource, 'isRightPriceScaleLayoutHealthy');
  const recoverLayoutBody = extractFunctionBody(chartWebViewHtmlSource, 'recoverRightPriceScaleLayout');
  const readyGateBody = extractFunctionBody(chartWebViewHtmlSource, 'postChartReadyWhenPriceScaleHealthy');
  const doInitBody = extractFunctionBody(chartWebViewHtmlSource, '_doInitChart');
  const resizeBody = extractFunctionBody(chartWebViewHtmlSource, 'resizeChartViewport');
  const recoverSurfaceBody = extractFunctionBody(chartWebViewHtmlSource, 'recoverChartSurface');
  const updateDataBody = extractFunctionBody(chartWebViewHtmlSource, 'updateChartData');

  assertSourceContains(
    layoutOptionsBody,
    /visible: true,[\s\S]*entireTextOnly: false,[\s\S]*minimumWidth: \$\{CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH\}/,
    'right-axis recovery must force visible reserved layout with entireTextOnly disabled',
  );
  assertSourceContains(
    layoutOptionsBody,
    /chart\.applyOptions\(\{ rightPriceScale: layoutOptions \}\)[\s\S]*priceScaleApi\.applyOptions\(layoutOptions\)/,
    'right-axis recovery must apply options through chart and price-scale APIs',
  );
  assertSourceContains(
    layoutHealthyBody,
    /metrics\.rightAxisWidth < \$\{CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH\} - 2[\s\S]*priceScaleOptions && priceScaleOptions\.entireTextOnly === true[\s\S]*return true/,
    'right-axis health must reject invalid geometry/options while leaving label painting to the custom axis layer',
  );
  assertSourceContains(
    recoverLayoutBody,
    /applyRightPriceScaleLayoutOptions\(\)[\s\S]*chart\.resize\(size\.width, size\.height\)[\s\S]*postChartGeometry\(\)/,
    'right-axis recovery must force options, resize the current container, and repost geometry',
  );
  assertSourceContains(
    readyGateBody,
    /if \(isRightPriceScaleLayoutHealthy\(\)\)[\s\S]*lastRawSeriesData\.length === 0 \|\| renderFallbackRightPriceScaleLabels\(\)[\s\S]*postChartReady\(initSignature, configSig, dataContextSig\)[\s\S]*recoverRightPriceScaleLayout\(reason \|\| 'chart_ready'\)[\s\S]*currentAttempt >= RIGHT_PRICE_SCALE_LAYOUT_RECOVERY_MAX_ATTEMPTS[\s\S]*scheduleRightPriceScaleFallbackRefresh\(\)[\s\S]*scheduleRightPriceScaleLayoutRecovery\(reason \|\| 'chart_ready', 2\)[\s\S]*postChartReady\(initSignature, configSig, dataContextSig\)[\s\S]*requestAnimationFrame\(function\(\)[\s\S]*postChartReadyWhenPriceScaleHealthy\([\s\S]*reason,[\s\S]*currentAttempt \+ 1,[\s\S]*generation,[\s\S]*initSignature,[\s\S]*configSig,[\s\S]*dataContextSig/,
    'CHART_READY must prefer valid right-axis geometry plus custom labels but stay bounded on slow iOS WebView layout',
  );
  assertSourceContains(
    doInitBody,
    /chartReadyPostGeneration \+= 1[\s\S]*var readyGeneration = chartReadyPostGeneration[\s\S]*var readyInitSignature = lastInitSignature[\s\S]*var readyConfigSig = lastInitConfigSig[\s\S]*var readyDataContextSig = lastInitDataContextSig[\s\S]*postChartGeometry\(\)[\s\S]*postChartReadyWhenPriceScaleHealthy\([\s\S]*'init_ready',[\s\S]*readyGeneration,[\s\S]*readyInitSignature,[\s\S]*readyConfigSig,[\s\S]*readyDataContextSig/,
    'initial chart ready must be gated by right-axis recovery and stale-generation protection',
  );
  assertSourceContains(
    resizeBody,
    /scheduleRightPriceScaleLayoutRecovery\('resize', 4\)/,
    'explicit native viewport resize must retry right-axis layout recovery',
  );
  assertSourceContains(
    recoverSurfaceBody,
    /scheduleRightPriceScaleLayoutRecovery\('recover_surface', RIGHT_PRICE_SCALE_LAYOUT_RECOVERY_MAX_ATTEMPTS\)/,
    'surface recovery must also retry right-axis layout recovery',
  );
  assertSourceContains(
    updateDataBody,
    /scheduleRightPriceScaleLayoutRecovery\([\s\S]*priceScaleReason,[\s\S]*RIGHT_PRICE_SCALE_LAYOUT_RECOVERY_MAX_ATTEMPTS/,
    'data reloads must retry right-axis layout recovery with the same replacement/prepend reason',
  );
});

test('webview bridge: right price-scale DOM health ignores RTX5 numeric overlays', () => {
  const customOverlayPredicateBody = extractFunctionBody(chartWebViewHtmlSource, 'isCustomRightPriceScaleOverlayNode');
  const nativeLabelStatusBody = extractFunctionBody(chartWebViewHtmlSource, 'getRightPriceScaleNativeDomLabelStatus');
  const collapsedLabelBody = extractFunctionBody(chartWebViewHtmlSource, 'hasCollapsedRightPriceScaleDomLabels');
  const layoutHealthyBody = extractFunctionBody(chartWebViewHtmlSource, 'isRightPriceScaleLayoutHealthy');

  assertSourceContains(
    customOverlayPredicateBody,
    /_overlayLabelLayer[\s\S]*rightPriceScaleFallbackLayer[\s\S]*node\.closest\('\.rtx5-overlay-label-layer'\)[\s\S]*node\.closest\('\.rtx5-position-price-scale-box'\)[\s\S]*node\.closest\('\.rtx5-market-price-scale-extension'\)[\s\S]*node\.closest\('\.rtx5-market-price-scale-badge'\)[\s\S]*node\.closest\('\.rtx5-right-price-scale-fallback'\)/,
    'right-axis DOM probe must explicitly exclude custom RTX5 overlay and fallback nodes',
  );
  assertSourceContains(
    nativeLabelStatusBody,
    /chartElement\.querySelectorAll\('span, div'\)[\s\S]*isCustomRightPriceScaleOverlayNode\(node\)[\s\S]*labelCount \+= 1/,
    'native right-axis label status must not count generic numeric overlay descendants as axis labels',
  );
  assertSourceContains(
    collapsedLabelBody,
    /var nativeLabelStatus = getRightPriceScaleNativeDomLabelStatus\(metrics\)[\s\S]*nativeLabelStatus\.labelCount >= 2[\s\S]*nativeLabelStatus\.healthyCount === 0[\s\S]*nativeLabelStatus\.collapsedCount >= nativeLabelStatus\.labelCount/,
    'collapsed right-axis detection must be driven by native-label status only',
  );
  assert.doesNotMatch(
    layoutHealthyBody,
    /getRightPriceScaleNativeDomLabelStatus|getRightPriceScaleNativeCanvasLabelStatus|hasCollapsedRightPriceScaleDomLabels/,
    'layout health must not suppress the custom right-axis layer based on transient native label probes',
  );
});

test('webview bridge: custom right price-scale labels do not depend on native label health', () => {
  const renderBody = extractFunctionBody(chartWebViewHtmlSource, 'renderFallbackRightPriceScaleLabels');
  const ticksBody = extractFunctionBody(chartWebViewHtmlSource, 'resolveRightPriceScaleFallbackTicks');
  const readyGateBody = extractFunctionBody(chartWebViewHtmlSource, 'postChartReadyWhenPriceScaleHealthy');
  const recoveryBody = extractFunctionBody(chartWebViewHtmlSource, 'scheduleRightPriceScaleLayoutRecovery');

  assertSourceContains(
    ticksBody,
    /var labelTop = plotTop \+ RIGHT_PRICE_SCALE_FALLBACK_LABEL_HEIGHT \/ 2[\s\S]*var labelBottom = plotBottom - RIGHT_PRICE_SCALE_FALLBACK_LABEL_HEIGHT \/ 2[\s\S]*var topPrice = invertScale \? range\.from : range\.to[\s\S]*var bottomPrice = invertScale \? range\.to : range\.from[\s\S]*appendInterpolatedTick/,
    'custom right-axis labels must interpolate the full visible range through a fixed MT5-style price-scale strip',
  );
  assertSourceContains(
    renderBody,
    /!series \|\| !lastRawSeriesData \|\| lastRawSeriesData\.length === 0[\s\S]*ensureRightPriceScaleFallbackLayer\(\)[\s\S]*axisBackground\.className = 'rtx5-right-price-scale-fallback-axis'[\s\S]*axisBackground\.style\.background = lastChartAxisBackgroundColor \|\| lastChartBackgroundColor \|\| '#FFFFFF'[\s\S]*className = 'rtx5-right-price-scale-fallback-label'/,
    'custom labels must render an owned right-axis strip whenever backend candle data is present',
  );
  assert.doesNotMatch(
    renderBody,
    /resolveRightPriceScaleFallbackDecision|hasHealthyRightPriceScaleNativeLabels|getRightPriceScaleNativeLabelHealth/,
    'custom label rendering must not clear itself because transient native-label probes look healthy',
  );
  assertSourceContains(
    readyGateBody,
    /lastRawSeriesData\.length === 0 \|\| renderFallbackRightPriceScaleLabels\(\)[\s\S]*postChartReady\(initSignature, configSig, dataContextSig\)[\s\S]*currentAttempt >= RIGHT_PRICE_SCALE_LAYOUT_RECOVERY_MAX_ATTEMPTS[\s\S]*scheduleRightPriceScaleFallbackRefresh\(\)[\s\S]*postChartReady\(initSignature, configSig, dataContextSig\)/,
    'CHART_READY must allow no-data symbols, prefer custom labels when backend candles exist, and stay bounded on transient label-render misses',
  );
  assert.doesNotMatch(
    readyGateBody,
    /hasHealthyRightPriceScaleNativeLabels|getRightPriceScaleNativeLabelHealth/,
    'CHART_READY must not bypass custom label rendering because native labels briefly look healthy',
  );
  assertSourceContains(
    recoveryBody,
    /if \(isRightPriceScaleLayoutHealthy\(\)\) \{[\s\S]*renderFallbackRightPriceScaleLabels\(\)[\s\S]*postChartGeometry\(\)/,
    'layout recovery completion must refresh the owned custom right-axis layer',
  );
});

test('webview bridge: custom right price-scale labels are backend-data-driven and ready-gated', () => {
  const rangeBody = extractFunctionBody(chartWebViewHtmlSource, 'resolveRightPriceScaleFallbackRange');
  const ticksBody = extractFunctionBody(chartWebViewHtmlSource, 'resolveRightPriceScaleFallbackTicks');
  const renderBody = extractFunctionBody(chartWebViewHtmlSource, 'renderFallbackRightPriceScaleLabels');
  const refreshBody = extractFunctionBody(chartWebViewHtmlSource, 'refreshOverlayDomLabels');
  const readyGateBody = extractFunctionBody(chartWebViewHtmlSource, 'postChartReadyWhenPriceScaleHealthy');
  const doInitBody = extractFunctionBody(chartWebViewHtmlSource, '_doInitChart');

  assertSourceContains(
    chartWebViewHtmlSource,
    /var RIGHT_PRICE_SCALE_FALLBACK_MIN_LABELS = 7[\s\S]*var RIGHT_PRICE_SCALE_FALLBACK_MAX_LABELS = 30[\s\S]*var RIGHT_PRICE_SCALE_FALLBACK_TARGET_LABEL_GAP_PX = 30/,
    'custom right-axis label density must stay bounded for phone/tablet chart heights at the dense 30px cadence',
  );
  assertSourceContains(
    rangeBody,
    /resolveRightPriceScaleCoordinateRange\(\)[\s\S]*isValidPriceRange\(coordinateRange\)[\s\S]*resolveRightPriceScaleVisibleRange\(\)[\s\S]*resolvePriceRangeFromVisibleData\(true\)/,
    'custom axis labels must prefer chart coordinates before visible right-scale fallback so top and bottom labels fill the plot height',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /function resolveRightPriceScaleCoordinateRange\(\)[\s\S]*series\.coordinateToPrice\(plotTop \+ RIGHT_PRICE_SCALE_FALLBACK_LABEL_HEIGHT \/ 2\)[\s\S]*series\.coordinateToPrice\(plotBottom - RIGHT_PRICE_SCALE_FALLBACK_LABEL_HEIGHT \/ 2\)[\s\S]*normalizePriceRange/,
    'custom axis fallback must read the visible top and bottom prices from chart coordinates when the price-scale API has no visible range',
  );
  assertSourceContains(
    ticksBody,
    /lastRawSeriesData[\s\S]*resolveRightPriceScaleFallbackLabelCount\(metrics\)[\s\S]*var intervals = Math\.max\(1, labelCount - 1\)[\s\S]*topPrice \+ \(bottomPrice - topPrice\) \* ratio[\s\S]*labelTop \+ \(labelBottom - labelTop\) \* ratio[\s\S]*roundRightPriceScaleFallbackPrice\(price, decimals\)/,
    'custom axis ticks must be derived from backend data, visible-range interpolation, fixed y positions, and configured symbol precision',
  );
  assertSourceContains(
    ticksBody,
    /for \(var scaleIndex = 0; scaleIndex <= intervals[\s\S]*ticks\.length < RIGHT_PRICE_SCALE_FALLBACK_MAX_LABELS[\s\S]*appendInterpolatedTick[\s\S]*ticks\.sort\(function\(left, right\) \{ return left\.y - right\.y; \}\)/,
    'custom axis ticks must update the full right-scale range instead of changing only edge labels',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /function resolveRightPriceScaleFallbackDecimals\(minimumDecimals\)[\s\S]*resolveRightPriceScaleFallbackConfiguredDecimals\(\)[\s\S]*if \(configuredDecimals !== null\) \{[\s\S]*return configuredDecimals[\s\S]*resolveRightPriceScaleFallbackDataDecimals\(\)/,
    'custom right-axis precision must not let raw OHLC decimal noise override configured display metadata',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /function resolveRightPriceScaleFallbackStepDecimals\(step\)[\s\S]*resolveRightPriceScaleFallbackConfiguredDecimals\(\)[\s\S]*if \(configuredDecimals !== null\) \{[\s\S]*return configuredDecimals[\s\S]*countRightPriceScaleFallbackDecimalPlaces\(step\)/,
    'custom right-axis tick spacing precision must also stay locked to configured display metadata when present',
  );
  assertSourceContains(
    renderBody,
    /clearRightPriceScaleFallbackLabels\(\)[\s\S]*ensureRightPriceScaleFallbackLayer\(\)[\s\S]*resolveRightPriceScaleFallbackAxisMetrics\(metrics\)[\s\S]*layer\.style\.zIndex = '30'[\s\S]*className = 'rtx5-right-price-scale-fallback-axis'[\s\S]*axisBackground\.style\.top = Math\.max\(0, Math\.round\(metrics\.plotTop \|\| 0\)\) \+ 'px'[\s\S]*axisBackground\.style\.height = Math\.max\(0, Math\.round\(metrics\.plotHeight \|\| metrics\.paneHeight \|\| 0\)\) \+ 'px'[\s\S]*className = 'rtx5-right-price-scale-fallback-label'[\s\S]*label\.textContent = tick\.text/,
    'custom labels must render inside an owned reserved right price-scale strip',
  );
  assertSourceContains(
    renderBody,
    /label\.style\.textAlign = 'right'[\s\S]*label\.style\.fontVariantNumeric = 'tabular-nums'[\s\S]*label\.style\.fontFeatureSettings = '"tnum" 1, "lnum" 1'/,
    'custom right-axis labels must keep right-aligned tabular numerals for stable price reading',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /\.rtx5-right-price-scale-fallback-label \{[\s\S]*height: \$\{CHART_PRICE_SCALE_LABEL_HEIGHT\}px;[\s\S]*font-size: \$\{CHART_PRICE_SCALE_LABEL_FONT_SIZE\}px;[\s\S]*font-weight: \$\{CHART_PRICE_SCALE_LABEL_FONT_WEIGHT\};/,
    'custom right-axis labels must be large enough to read on phone screens',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /var RIGHT_PRICE_SCALE_FALLBACK_LABEL_HEIGHT = \$\{CHART_PRICE_SCALE_LABEL_HEIGHT\}[\s\S]*var RIGHT_PRICE_SCALE_FALLBACK_LABEL_FONT_SIZE = \$\{CHART_PRICE_SCALE_LABEL_FONT_SIZE\}[\s\S]*var RIGHT_PRICE_SCALE_FALLBACK_LABEL_FONT_WEIGHT = '\$\{CHART_PRICE_SCALE_LABEL_FONT_WEIGHT\}'[\s\S]*var RIGHT_PRICE_SCALE_FALLBACK_LABEL_OPACITY = '1'[\s\S]*var RIGHT_PRICE_SCALE_FALLBACK_DARK_LABEL_COLOR = '#E2E8F0'[\s\S]*var RIGHT_PRICE_SCALE_FALLBACK_LIGHT_LABEL_COLOR = '#0F172A'/,
    'custom right-axis labels must consume the shared typography contract',
  );
  assertSourceContains(
    chartPriceScaleTypographySource,
    /CHART_PRICE_SCALE_LABEL_HEIGHT = 17[\s\S]*CHART_PRICE_SCALE_LABEL_FONT_SIZE = 12[\s\S]*CHART_PRICE_SCALE_LABEL_FONT_WEIGHT = '500'/,
    'shared price-axis typography must stay explicit and phone-readable',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /function getCanvasPerceivedBrightness\(rgb\)[\s\S]*return \(rgb\.r \* 299 \+ rgb\.g \* 587 \+ rgb\.b \* 114\) \/ 1000/,
    'custom right-axis labels must be able to compare foreground and axis brightness',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /function resolveReadableRightPriceScaleFallbackTextColor\(textColor\)[\s\S]*lastChartAxisBackgroundColor \|\| lastChartBackgroundColor \|\| '#FFFFFF'[\s\S]*axisBrightness < 80[\s\S]*textBrightness === null \|\| textBrightness < 190[\s\S]*return RIGHT_PRICE_SCALE_FALLBACK_DARK_LABEL_COLOR[\s\S]*axisBrightness > 175[\s\S]*textBrightness === null \|\| textBrightness > 110[\s\S]*return RIGHT_PRICE_SCALE_FALLBACK_LIGHT_LABEL_COLOR/,
    'custom right-axis labels must retain readable contrast on both dark and light axis strips',
  );
  assertSourceContains(
    renderBody,
    /var textColor = resolveRightPriceScaleFallbackTextColor\(\)[\s\S]*label\.style\.fontSize = RIGHT_PRICE_SCALE_FALLBACK_LABEL_FONT_SIZE \+ 'px'[\s\S]*label\.style\.lineHeight = RIGHT_PRICE_SCALE_FALLBACK_LABEL_HEIGHT \+ 'px'[\s\S]*label\.style\.fontWeight = RIGHT_PRICE_SCALE_FALLBACK_LABEL_FONT_WEIGHT[\s\S]*label\.style\.opacity = RIGHT_PRICE_SCALE_FALLBACK_LABEL_OPACITY/,
    'custom right-axis labels must apply the balanced readable style at render time',
  );
  assertSourceContains(
    refreshBody,
    /renderFallbackRightPriceScaleLabels\(\)[\s\S]*refreshMarketPriceScaleDom\(\)/,
    'overlay refresh must repaint fallback axis labels before custom market/position overlays',
  );
  assertSourceContains(
    readyGateBody,
    /lastRawSeriesData\.length === 0 \|\| renderFallbackRightPriceScaleLabels\(\)[\s\S]*postChartGeometry\(\)[\s\S]*postChartReady\(initSignature, configSig, dataContextSig\)/,
    'CHART_READY must not post before custom right-axis labels are rendered when backend candles exist',
  );
  assertSourceContains(
    doInitBody,
    /clearRightPriceScaleFallbackLayer\(\)[\s\S]*lastChartTextColor = resolveChartTextColor\(safeOpts\)/,
    'visual shell re-init must clear stale fallback DOM and refresh label theme colors',
  );
  assert.doesNotMatch(
    renderBody,
    /postMessage/,
    'custom right-axis labels must not add a new public WebView bridge message',
  );
});

test('webview bridge: native chart uses the GitHub resolved chart background', () => {
  const initBody = extractFunctionBody(chartWebViewHtmlSource, 'initChart');
  const doInitBody = extractFunctionBody(chartWebViewHtmlSource, '_doInitChart');
  const paneBackgroundBody = extractFunctionBody(chartWebViewHtmlSource, 'updateChartPaneBackgroundLayer');

  assertSourceContains(source, /layout: \{[\s\S]*background: \{ color: resolvedChartColors\.background \}/, 'native chart canvas must use the resolved chart background');
  assertSourceContains(source, /<WebView[\s\S]*style=\{\{[\s\S]*flex: 1,[\s\S]*backgroundColor: resolvedChartColors\.background,[\s\S]*opacity: hasUsableRetainedChart \? 1 : 0,[\s\S]*\}\}/, 'native WebView host must use the resolved chart background and hide unconfirmed bootstrap data');
  assertSourceContains(source, /customColors: \{[\s\S]*grid: chartDisplay\.showGrid \? chartGridColor : 'transparent',[\s\S]*axisDivider: chartAxisBorderColor/, 'native chart custom colors must keep only the GitHub axis divider override');
  assertSourceContains(source, /chartAxisBorderColor\}-\$\{chartColorsSignature\}/, 'chart config signature must use the GitHub color signature shape');
  assert.doesNotMatch(source, /CHART_DARK_CANVAS_BACKGROUND_COLOR|chartAxisBackgroundColor|axisBackground:/);
  assertSourceContains(chartWebViewHtmlSource, /<div id="chart"><\/div>[\s\S]*<svg id="rtx5-moving-vertical-grid" aria-hidden="true"><\/svg>/, 'GitHub moving grid SVG must remain a chart sibling');
  assertSourceContains(initBody, /document\.body\.style\.background = bg[\s\S]*document\.getElementById\('chart'\)\.style\.background = 'transparent'/, 'early WebView paint must keep #chart transparent so the grid can show');
  assertSourceContains(doInitBody, /document\.body\.style\.background = chartBackgroundColor[\s\S]*el\.style\.background = 'transparent'/, 'chart init must keep #chart transparent after layout is resolved');
  assertSourceContains(paneBackgroundBody, /clearChartPaneBackgroundLayer\(\)[\s\S]*return false/, 'pane background updater must clear itself instead of covering the GitHub grid');
  assert.doesNotMatch(paneBackgroundBody, /ensureChartPaneBackgroundLayer\(\)|layer\.style\.background = lastChartBackgroundColor/, 'pane background updater must not recreate a layer above the moving grid');
});

test('webview bridge: theme visuals update in place before the full chart init catches up', () => {
  const themeBody = extractFunctionBody(chartWebViewHtmlSource, 'applyChartVisualTheme');
  const nativeThemeCallbackStart = source.indexOf('const applyImmediateChartVisualTheme = useCallback');
  const nativeThemeCallbackEnd = source.indexOf('\n  }, [', nativeThemeCallbackStart);

  assert.notEqual(nativeThemeCallbackStart, -1, 'native chart must define its immediate WebView theme callback');
  assert.notEqual(nativeThemeCallbackEnd, -1, 'native immediate WebView theme callback must have a bounded dependency list');
  const nativeThemeCallbackSource = source.slice(nativeThemeCallbackStart, nativeThemeCallbackEnd);

  assertSourceContains(
    themeBody,
    /document\.body\.style\.background = [^;]+/,
    'the WebView document background must flip without waiting for initChart',
  );
  assertSourceContains(themeBody, /lastChartBackgroundColor = [^;]+/, 'theme updates must retain the new chart background');
  assertSourceContains(themeBody, /lastChartAxisBackgroundColor = [^;]+/, 'theme updates must retain the new right-axis background');
  assertSourceContains(themeBody, /lastChartTextColor = [^;]+/, 'theme updates must retain the new axis text color');
  assertSourceContains(
    themeBody,
    /chart\.applyOptions\(\{[\s\S]*layout:[\s\S]*textColor:/,
    'the existing chart must adopt layout text colors in place',
  );
  assertSourceContains(themeBody, /applyMovingVerticalGridColor\(/, 'the moving grid must share the immediate palette');
  assertSourceContains(themeBody, /applyChartAxisDividerColor\(/, 'the axis divider must share the immediate palette');
  assertSourceContains(themeBody, /updateChartPaneBackgroundLayer\(\)/, 'the pane background must refresh with the immediate palette');
  assert.doesNotMatch(
    themeBody,
    /series\.applyOptions\(/,
    'the immediate theme path must not redraw or blank the retained candle history',
  );
  assertSourceContains(
    nativeThemeCallbackSource,
    /(?:injectChartScript|injectJavaScript)\(`[\s\S]*typeof (?:window\.)?applyChartVisualTheme === ['"]function['"][\s\S]*(?:window\.)?applyChartVisualTheme\(/,
    'the retained native Chart screen must invoke the WebView theme bridge directly',
  );
  assert.doesNotMatch(
    nativeThemeCallbackSource,
    /requestAnimationFrame|setTimeout|scheduleAfterFirstFrame|scheduleIdleWork/,
    'the WebView palette injection must stay in the immediate visual-applier turn',
  );
  assertSourceContains(
    source,
    /registerImmediateThemeVisualApplier\(applyImmediateChartVisualTheme\)/,
    'the retained Chart WebView must subscribe to the central pre-Zustand visual clock',
  );
});

test('web chart: precision overlays and crosshair stay parity-safe', () => {
  assertSourceContains(
    chartWebSource,
    /resolveChartDisplayDecimals\(\{[\s\S]*instrumentDigits: chartInstrumentMeta\?\.digits,[\s\S]*instrumentPoint: chartInstrumentMeta\?\.point,[\s\S]*instrumentTickSize: chartInstrumentMeta\?\.tickSize,[\s\S]*liveQuoteDigits: chartLiveQuote\?\.digits,[\s\S]*liveQuoteDigitsFromBackend: hasLiveChartQuote && chartLiveQuoteDigitsSource === 'backend'/,
    'web display precision must use instrument precision metadata and backend-gated quote digits',
  );
  assert.doesNotMatch(
    chartWebSource,
    /baseSymbol\.includes\('JPY'\) \? 3/,
    'web display precision must not fall back to symbol-family hardcoding',
  );
  assertSourceContains(
    chartWebSource,
    /const overlayLiveBid = useMemo\([\s\S]*const overlayLiveAsk = useMemo\([\s\S]*liveBid: hasLiveChartQuote \? overlayLiveBid : null,[\s\S]*liveAsk: hasLiveChartQuote \? overlayLiveAsk : null,[\s\S]*liveQuote: hasLiveChartQuote \? chartLiveQuote : undefined/,
    'web overlays must pass only freshness-approved full quotes for Trade-parity open-position PnL',
  );
  assertSourceContains(
    chartWebSource,
    /crosshair: \{[\s\S]*mode: CrosshairMode\.Hidden,[\s\S]*visible: false,[\s\S]*labelVisible: false,[\s\S]*color: 'transparent',[\s\S]*labelBackgroundColor: 'transparent'/,
    'web chart crosshair must stay hidden with invisible labels',
  );
  assertSourceContains(chartWebSource, /crosshairMarkerVisible: false/, 'web line chart crosshair marker must stay hidden');
});

test('area chart uses close-value data with period direction colors on native and web', () => {
  assertSourceContains(
    chartConstantsSource,
    /CHART_AREA_VISIBLE_BAR_MAX = 500[\s\S]*CHART_AREA_VISIBLE_BAR_TARGET_PX = 0\.65[\s\S]*CHART_AREA_VISIBLE_BAR_MIN = 120[\s\S]*CHART_AREA_TIME_SCALE_MIN_BAR_SPACING = 0\.5[\s\S]*CHART_AREA_LINE_WIDTH = 1/,
    'Area must use a denser real-close viewport and a restrained shared outline width',
  );
  assertSourceContains(
    areaChartHistoryPolicySource,
    /M1: PAGINATED_HISTORY_LIMIT,[\s\S]*M5: 420,[\s\S]*M15: 360,[\s\S]*M30: 320,[\s\S]*H1: 280,[\s\S]*H4: 240,[\s\S]*D1: 220,[\s\S]*W1: 180,[\s\S]*MN: 144/,
    'Area must request a bounded real-candle overview at the selected timeframe instead of adding date-range controls',
  );
  assertSourceContains(
    areaChartHistoryExpansionSource,
    /input\.chartType !== 'area'[\s\S]*input\.historyLoading[\s\S]*!input\.hasHistoryCandles[\s\S]*input\.candleCount >= visibleBarTarget[\s\S]*MAX_AREA_HISTORY_EXPANSION_ATTEMPTS[\s\S]*input\.candleCount <= nextAttempt\.candleCount[\s\S]*expansionAttemptRef\.current = \{[\s\S]*input\.paginate\(\)/,
    'Area history expansion must wait for first paint and remain bounded while allowing one retained-cache reveal',
  );
  assertSourceContains(
    source,
    /areaVisibleBarTarget = useAreaChartHistoryExpansion\(\{[\s\S]*chartType: chartVisualType,[\s\S]*cacheScopeKey: chartMarketDataCacheNamespace,[\s\S]*hasHistoryCandles: chartHasHistoryCandles,[\s\S]*historyLoading: chartDataLoading,[\s\S]*paginate/,
    'the active native Area chart must use the shared authenticated/public pagination path',
  );
  const recentVisibleBarsBody = extractFunctionBody(chartWebViewHtmlSource, 'getRecentVisibleBars');
  assertSourceContains(
    recentVisibleBarsBody,
    /seriesType === 'area'[\s\S]*CHART_AREA_VISIBLE_BAR_MAX[\s\S]*CHART_AREA_VISIBLE_BAR_TARGET_PX[\s\S]*CHART_AREA_VISIBLE_BAR_MIN/,
    'native Area must choose its denser viewport without changing other series defaults',
  );
  const areaPrependExpansionBody = extractFunctionBody(
    chartWebViewHtmlSource,
    'shouldExpandAreaRecentViewportAfterPrepend',
  );
  assertSourceContains(
    areaPrependExpansionBody,
    /seriesType !== 'area'[\s\S]*shouldFollowLiveRightEdge\(previousRange, previousData\.length\)[\s\S]*nextDefaultVisibleBars > previousDefaultVisibleBars[\s\S]*Math\.abs\(previousVisibleSpan - previousDefaultVisibleBars\) <= spanTolerance/,
    'only an untouched live-edge Area viewport may expand when genuine history prepends',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /expandedAreaRecentViewport[\s\S]*applyRecentViewport\(mapped\.length\)[\s\S]*!expandedAreaRecentViewport[\s\S]*restorePrependedHistoryViewport/,
    'a panned or zoomed Area viewport must retain the ordinary prepend restoration path',
  );
  assertSourceContains(
    source,
    /const buildChartTickPayload = \([\s\S]*chartType === 'line' \|\| chartType === 'area'[\s\S]*value: candle\.close/,
    'native Line and Area ticks must both use close-value points',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /seriesType === 'area'[\s\S]*initialAreaDirection = resolveAreaSeriesDirection\(lastRawSeriesData\)[\s\S]*areaLineColor = pickAreaSeriesColor\(initialAreaDirection\)[\s\S]*LightweightCharts\.AreaSeries[\s\S]*lineColor: areaLineColor,[\s\S]*topColor: hexToRgba\(areaLineColor, 0\.32\),[\s\S]*bottomColor: hexToRgba\(areaLineColor, 0\.04\),[\s\S]*lineWidth: \$\{CHART_AREA_LINE_WIDTH\},[\s\S]*lineType: LightweightCharts\.LineType\.Simple/,
    'native WebView Area must derive its initial translucent gradient from selected-period direction',
  );
  const areaDirectionBody = extractFunctionBody(chartWebViewHtmlSource, 'resolveAreaSeriesDirection');
  assertSourceContains(
    areaDirectionBody,
    /areaDirectionOverride === 'up' \|\| areaDirectionOverride === 'down'[\s\S]*getRecentVisibleBars\(data\.length\)[\s\S]*terminal >= baseline \? 'up' : 'down'/,
    'native Area must retain the selected-range override and limit an Auto candle fallback to the recent viewport',
  );
  const areaOverrideBody = extractFunctionBody(chartWebViewHtmlSource, 'setAreaDirectionOverride');
  assertSourceContains(
    areaOverrideBody,
    /areaDirectionOverrideDataContextSig = nextContextSig;[\s\S]*areaDirectionOverrideRangeKey = nextRangeKey;[\s\S]*areaDirectionOverride = nextDirection;[\s\S]*refreshAreaSeriesDirection\(true\)/,
    'native Area range/sign changes must update the retained WebView series through an explicit override',
  );
  assert.doesNotMatch(
    areaOverrideBody,
    /\b(?:initChart|setData)\s*\(/,
    'changing the Area direction override must not rebuild data or reset the viewport',
  );
  const areaRefreshBody = extractFunctionBody(chartWebViewHtmlSource, 'refreshAreaSeriesDirection');
  assertSourceContains(
    areaRefreshBody,
    /series\.applyOptions\(\{[\s\S]*lineColor: color,[\s\S]*topColor: hexToRgba\(color, 0\.32\),[\s\S]*bottomColor: hexToRgba\(color, 0\.04\)/,
    'live Area sign changes must recolor the retained series in place',
  );
  assert.doesNotMatch(
    areaRefreshBody,
    /\b(?:initChart|setData)\s*\(/,
    'Area recoloring must not rebuild data or reset the viewport',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /series\.update\(bar\);[\s\S]*refreshAreaSeriesDirection\(false\)/,
    'every accepted live Area terminal must re-evaluate the fixed period direction',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /acceptedCandlePrice = seriesType === 'line' \|\| seriesType === 'area'[\s\S]*Number\(update\.candle\.value\)/,
    'native WebView Area live ticks must use their close-value payload',
  );
  assertSourceContains(
    chartWebSource,
    /resolveAreaChartDirectionForRange\(\{[\s\S]*range: activeDateRange,[\s\S]*dailyChangePct: chartLiveQuote\?\.changePct[\s\S]*chartType === 'area'[\s\S]*areaChartColorRef\.current[\s\S]*chart\.addSeries\(AreaSeries, \{[\s\S]*lineColor: LINE_COLOR,[\s\S]*topColor: withAlpha\(LINE_COLOR, 0\.32\),[\s\S]*bottomColor: withAlpha\(LINE_COLOR, 0\.04\),[\s\S]*lineWidth: CHART_AREA_LINE_WIDTH,[\s\S]*lineType: LineType\.Simple/,
    'web Area must use the same selected-period direction color and gradient',
  );
  assertSourceContains(
    source,
    /areaQuoteDirectionActive = chartRuntimeActive && chartVisualType === 'area'[\s\S]*useWatchlistLiveQuotes\([\s\S]*\[chartSymbol\],[\s\S]*areaQuoteDirectionActive,[\s\S]*restFallbackActive: areaQuoteDirectionActive[\s\S]*useLiveQuoteSnapshot\([\s\S]*chartSymbol,[\s\S]*areaQuoteDirectionActive,[\s\S]*dailyChangePct: chartDailyDirectionQuote\?\.changePct \?\? chartLiveQuote\?\.changePct[\s\S]*__rtx5SetAreaDirectionOverride[\s\S]*JSON\.stringify\(areaDirectionRangeKey\)[\s\S]*JSON\.stringify\(areaChartDirection\)/,
    'native Area must bridge the same Quotes daily snapshot or the explicit candle-range direction without chart reinitialization',
  );
  assertSourceContains(
    source,
    /chartVisualType === 'area' \? CHART_CROSSHAIR_TOOL : CHART_NO_DRAWING_TOOL[\s\S]*areaAutoInspectorOwnerPaneIdRef[\s\S]*nextType === 'area'[\s\S]*activeTool !== CHART_CROSSHAIR_TOOL[\s\S]*handleSetTool\(CHART_CROSSHAIR_TOOL, \{ areaAutoInspector: true \}\)/,
    'native Area restore and picker selection must automatically arm the existing crosshair inspector',
  );
  assertSourceContains(
    source,
    /areaInspectorLifecycleRef[\s\S]*hydrationCompleted[\s\S]*chartWindowVisualPreferences\[activePaneId\]\?\.chartVisualType[\s\S]*activePaneVisualType === 'area'[\s\S]*manualCrosshairAlreadyActive[\s\S]*handleSetTool\(CHART_CROSSHAIR_TOOL, \{ areaAutoInspector: true \}\)/,
    'native Area inspector lifecycle must follow hydration and promoted pane-local visual types without claiming a manual crosshair',
  );
  assertSourceContains(
    source,
    /chartType === 'area'[\s\S]*areaAutoInspectorOwnerPaneIdRef\.current === chartWindows\.activePane\.id[\s\S]*handleSetTool\(CHART_NO_DRAWING_TOOL\)/,
    'leaving Area may disarm only the inspector automatically owned by the active pane',
  );
  assertSourceContains(
    source,
    /customCrosshair: \{[\s\S]*areaSeriesInspector: chartType === 'area'/,
    'native Area must configure the shared crosshair manager for value-snapped inspection',
  );
  assertSourceContains(
    source,
    /const chartCustomCrosshairConfig = chartOptions\.customCrosshair[\s\S]*window\._drawingManager[\s\S]*window\._drawingManager\.setCrosshairConfig\(\$\{JSON\.stringify\(chartCustomCrosshairConfig\)\}\)/,
    'retained native charts must push current symbol timeframe theme and Area inspector config without requiring reinitialization',
  );
});

test('webview bridge: resizeChartViewport replays pending init and updates geometry', () => {
  const body = extractFunctionBody(chartWebViewHtmlSource, 'resizeChartViewport');

  assertSourceContains(body, /if \(_pendingInit\)[\s\S]*_doInitChart\(/, 'resize must replay pending zero-size init');
  assertSourceContains(body, /chart\.resize\(w, h\)/, 'resize must resize the active chart');
  assertSourceContains(body, /updateChartPaneBackgroundLayer\(\)/, 'resize must clear any stale pane background so the grid stays visible');
  assertSourceContains(body, /postChartGeometry\(\)/, 'resize must report chart geometry');
});

test('webview bridge: recoverChartSurface restores data overlays market lines and geometry', () => {
  const body = extractFunctionBody(chartWebViewHtmlSource, 'recoverChartSurface');

  assertSourceContains(chartWebViewHtmlSource, /var requestHostOptions = cloneSerializableValue\(opts \|\| \{\}, \{\}\)[\s\S]*lastInitHostOptions = requestHostOptions/, 'init must cache an immutable copy of host chart options');
  assertSourceContains(chartWebViewHtmlSource, /var safeOpts = applyChartLayout\(cloneSerializableValue\(opts \|\| \{\}, \{\}\)\)/, 'WebView chart creation must mutate only a throwaway options copy');
  assertSourceContains(chartWebViewHtmlSource, /var customCols = safeOpts\.customColors[\s\S]*applyMovingVerticalGridColor\(customCols && customCols\.grid\)[\s\S]*delete safeOpts\.customColors/, 'chart creation must read grid colors before removing customColors from LightweightCharts options');
  assertSourceContains(body, /chart\.resize\(w, h\)[\s\S]*updateChartPaneBackgroundLayer\(\)/, 'surface recovery must clear any stale pane background so the grid stays visible');
  assertSourceContains(body, /lastRawSeriesData[\s\S]*series\.setData\(mapped\)/, 'surface recovery must restore the last raw series');
  assertSourceContains(body, /cloneSerializableValue\(lastInitHostOptions, \{\}\)[\s\S]*lastInitChartType/, 'surface recovery must recreate missing charts from preserved host options');
  assertSourceContains(body, /clearMarketPriceLineRefs\(\)[\s\S]*series\.setData\(mapped\)/, 'surface recovery must remove tracked market price lines before setData can orphan them');
  assertSourceContains(body, /applyOverlayPayload\(_overlayPayload\)/, 'surface recovery must reapply overlays');
  assertSourceContains(body, /setLivePriceLine\(lastLivePrice\)/, 'surface recovery must reapply the live price line');
  assertSourceContains(body, /postChartGeometry\(\)/, 'surface recovery must republish geometry');
});

test('webview bridge: native handler accepts CHART_READY geometry drag and errors', () => {
  assertSourceContains(source, /const initAttemptSig = buildChartInitSignature\([\s\S]*chartDataContextEpoch,[\s\S]*`\$\{chartDataContextSig\}:\$\{currentSig\}:\$\{getChartSnapshotSignature\(initSnapshot\)\}`,[\s\S]*\);[\s\S]*initChart\([\s\S]*JSON\.stringify\(initAttemptSig\)[\s\S]*JSON\.stringify\(currentSig\)[\s\S]*JSON\.stringify\(chartDataContextSig\)/, 'native init must prefix the snapshot signature with its selection epoch and pass stable config and data-context identities');
  assertSourceContains(chartWebViewHtmlSource, /function postChartReady\(initSignature, configSig, dataContextSig\)[\s\S]*type: 'CHART_READY'[\s\S]*initSignature: initSignature \|\| ''[\s\S]*configSig: configSig \|\| ''[\s\S]*dataContextSig: dataContextSig \|\| ''/, 'WebView CHART_READY must echo stable chart identity alongside the volatile snapshot signature');
  assertSourceContains(source, /msg\.type === 'CHART_READY'[\s\S]*const readyDataContextSig =[\s\S]*const readyDataContextEpoch = readChartInitContextEpoch\(readyInitSignature\)[\s\S]*shouldAcceptChartReady\([\s\S]*dataContextEpoch: chartDataContextEpochRef\.current\.epoch[\s\S]*dataContextEpoch: latestInitDispatch\.dataContextEpoch[\s\S]*return/, 'native handler must reject stale CHART_READY config, symbol/timeframe, current epoch, or latest-dispatch epoch identities');
  assert.doesNotMatch(source, /readyInitSignature !== latestInitDispatch\.signature/, 'live snapshot churn must not reject a painted init for the current symbol/timeframe');
  assertSourceContains(source, /msg\.type === 'CHART_READY'[\s\S]*chartInitializedRef\.current = true[\s\S]*setChartCanvasReady\(true\)/, 'CHART_READY must mark canvas ready');
  assert.doesNotMatch(source, /setChartCanvasReady\(true\);\s*setHasPaintedChartOnce\(true\)/, 'empty CHART_READY must not hide the startup loader before candles arrive');
  assertSourceContains(source, /msg\.type === 'CHART_READY'[\s\S]*exactQuote: readyExactQuote,[\s\S]*projection: readyProjection,[\s\S]*hasHistoryCandles: readyHasHistoryCandles,[\s\S]*readCurrentProjectedChartCandles\(\);[\s\S]*const readyCandles = readyProjection\.candles;[\s\S]*retainCurrentChartCandles\(readyCandles\);[\s\S]*const readySnapshot = buildChartSeriesSnapshot\(readyCandles\)/, 'CHART_READY must rebuild and retain the context-scoped snapshot with the newest exact-Bid candle projection and history provenance');
  assertSourceContains(source, /if \(readyCandles\.length > 0 && webViewRef\.current\) \{[\s\S]*readyInitSignature === readySnapshotInitSignature[\s\S]*if \(readyHasHistoryCandles\) \{[\s\S]*setHasPaintedChartOnce\(true\)/, 'CHART_READY may latch first paint only when retained candles include committed history');
  assertSourceContains(chartWebViewHtmlSource, /function postChartDataPainted\(dataContextSig, paintToken\)[\s\S]*type: 'CHART_DATA_PAINTED'[\s\S]*paintToken: paintToken \|\| ''/, 'WebView data replacement must publish a tokenized paint acknowledgement');
  assertSourceContains(chartWebViewHtmlSource, /series\.setData\(mapped\);[\s\S]*mapped\.length > 0 && paintedDataContextSig && paintToken[\s\S]*postChartDataPainted\(paintedDataContextSig, paintToken\)/, 'data paint acknowledgement must happen only after non-empty setData succeeds');
  const replacementUpdateBody = extractFunctionBody(
    chartWebViewHtmlSource,
    'updateChartData',
  );
  const replacementPaintStart = replacementUpdateBody.indexOf('series.setData(mapped);');
  const replacementPaintAck = replacementUpdateBody.indexOf(
    'postChartDataPainted(paintedDataContextSig, paintToken);',
    replacementPaintStart,
  );
  assert.doesNotMatch(
    replacementUpdateBody.slice(replacementPaintStart, replacementPaintAck),
    /requestAnimationFrame/,
    'a transparent native WebView must acknowledge applied cached history without waiting for a visual frame',
  );
  assertSourceContains(source, /if \(didInject\) \{[\s\S]*renderedSeriesSnapshotRef\.current = nextSnapshot;[\s\S]*\}[\s\S]*msg\.type === 'CHART_DATA_PAINTED'[\s\S]*if \(!pendingPaint\.confirmsUsableChart\) \{[\s\S]*return;[\s\S]*setHasPaintedChartOnce\(true\)/, 'native loading state must wait for a canonical-history WebView data-paint acknowledgement');
  assertSourceContains(source, /readySnapshotInitSignature = buildChartInitSignature\([\s\S]*chartDataContextEpochRef\.current\.epoch,[\s\S]*`\$\{chartDataContextSig\}:\$\{currentSig\}:\$\{getChartSnapshotSignature\(readySnapshot\)\}`,[\s\S]*\)[\s\S]*readyInitSignature === readySnapshotInitSignature[\s\S]*issueChartDataPaintToken\([\s\S]*chartDataContextSig,[\s\S]*readyHasHistoryCandles,[\s\S]*\)/, 'CHART_READY must compare an epoch-prefixed exact init paint with a latest-candle replacement and tag whether that replacement has committed history');
  assertSourceContains(source, /msg\.type === 'CHART_GEOMETRY'[\s\S]*setChartPlotArea/, 'CHART_GEOMETRY must update plot area');
  assertSourceContains(chartWebViewHtmlSource, /function postChartGeometry\(\)[\s\S]*visiblePriceRange = resolveRightPriceScaleFallbackRange\(\)[\s\S]*dataContextSig: lastInitDataContextSig \|\| ''[\s\S]*priceRange: isValidPriceRange\(visiblePriceRange\)/, 'CHART_GEOMETRY must publish the rendered price range with its symbol/timeframe identity');
  assertSourceContains(source, /msg\.type === 'CHART_GEOMETRY'[\s\S]*msg\.dataContextSig === chartDataContextSigRef\.current[\s\S]*chartVisiblePriceRangeRef\.current/, 'native geometry handling must retain only the current chart price range');
  assertSourceContains(source, /msg\.type === 'CHART_TRADE_LINE_DRAG'[\s\S]*handleChartTradePreviewDragMessage\(msg\)/, 'trade-line drag messages must reach React state');
  assertSourceContains(source, /msg\.type === 'ERROR'[\s\S]*?if \(typeof __DEV__ !== 'undefined' && __DEV__\) \{\s*console\.log\('\[CHART WEBVIEW ERROR\]'/, 'recoverable WebView errors must be a dev-only log that never blocks recovery');
  assert.doesNotMatch(source, /console\.(?:warn|error)\('\[CHART WEBVIEW ERROR\]'/, 'recoverable WebView errors must not raise LogBox toasts');
});

test('webview bridge: watchdog recovers missing ready and exact data-paint acknowledgements', () => {
  assertSourceContains(source, /watchdogRef\.current = setInterval\(\(\) => \{[\s\S]*if \(!webViewReady\) \{[\s\S]*return;[\s\S]*if \(!chartInitializedRef\.current\) \{[\s\S]*sendInit\(true\)/, 'watchdog must retry init while chart is not confirmed');
  assertSourceContains(
    source,
    /const hasTimedOutCurrentUsablePaint =[\s\S]*chartInitializedRef\.current[\s\S]*pendingPaint\.confirmsUsableChart[\s\S]*pendingPaint\.token\.length > 0[\s\S]*pendingPaint\.dataContextSig === chartDataContextSigRef\.current[\s\S]*pendingPaint\.ackRetryCount < CHART_DATA_PAINT_ACK_RETRY_MAX[\s\S]*pendingPaint\.retryScript\.length > 0[\s\S]*injectJavaScript\(pendingPaint\.retryScript\)[\s\S]*pendingChartDataPaintRef\.current\.token === pendingPaint\.token[\s\S]*ackRetryCount: pendingPaint\.ackRetryCount \+ 1[\s\S]*recoverChartWebViewAfterPaintStall\([\s\S]*pendingPaint\.dataContextSig/,
    'paint watchdog must replay the exact pending usable transaction up to its maximum before recreating the renderer',
  );
  const paintAckRetryBody = extractFunctionBody(
    chartWebViewHtmlSource,
    'retryChartDataPaintAcknowledgement',
  );
  assertSourceContains(
    paintAckRetryBody,
    /!series[\s\S]*currentSeriesLength <= 0[\s\S]*!requestedDataContextSig[\s\S]*requestedDataContextSig !== lastInitDataContextSig[\s\S]*!requestedPaintToken[\s\S]*requestedPaintToken !== lastAppliedChartDataPaintToken[\s\S]*return false;[\s\S]*postChartDataPainted\(requestedDataContextSig, requestedPaintToken\)[\s\S]*return true/,
    'WebView paint-ack retries must require a live non-empty series and the exact current context and applied token',
  );
  assertSourceContains(source, /\}, CHART_WATCHDOG_INTERVAL_MS\);/, 'watchdog must use the shared chart startup retry cadence');
  assertSourceContains(
    source,
    /const recentInitInFlight =[\s\S]*!chartInitializedRef\.current &&[\s\S]*lastInitDispatchRef\.current\.configSig === currentSig &&[\s\S]*lastInitDispatchRef\.current\.dataContextSig === chartDataContextSig &&[\s\S]*lastInitDispatchRef\.current\.dataContextEpoch === chartDataContextEpoch &&[\s\S]*now - lastInitDispatchRef\.current\.at < CHART_INIT_RETRY_MIN_MS;[\s\S]*if \(!force && recentInitInFlight\) return;[\s\S]*const mapped = data\.length > 0 \? buildMappedData\(data\) : \[\];/,
    'non-forced pending init retries must be epoch-scoped and throttled before remapping full history',
  );
  assertSourceContains(source, /setChartReadyEpoch\(\(c\) => c \+ 1\)/, 'CHART_READY must bump epoch for dependent bridge effects');
});

test('webview bridge: recent viewport reserves a bounded live-edge gap before the price scale', () => {
  const recentViewportBody = extractFunctionBody(chartWebViewHtmlSource, 'applyRecentViewport');
  const shouldFollowLiveRightEdgeBody = extractFunctionBody(chartWebViewHtmlSource, 'shouldFollowLiveRightEdge');
  const followLiveRightEdgeBody = extractFunctionBody(chartWebViewHtmlSource, 'followLiveRightEdge');
  const applyTickUpdateBody = extractFunctionBody(chartWebViewHtmlSource, 'applyTickUpdate');
  const logicalRangeBranchEnd = recentViewportBody.indexOf('} else {');
  const logicalRangeBranch =
    logicalRangeBranchEnd >= 0 ? recentViewportBody.slice(0, logicalRangeBranchEnd) : recentViewportBody;

  assertSourceContains(
    source,
    /rightOffset: CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET/,
    'native chart must use the shared time-scale right-offset constant',
  );
  assertSourceContains(
    chartConstantsSource,
    /export const CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET = 7;/,
    'right-offset must keep the MT5-style professional gap between the live candle and the price scale',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /function getBoundedLiveRightEdge\(lengthOverride\)[\s\S]*Math\.max\(0\.5, dataLength - 0\.5\) \+ \$\{CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET\}[\s\S]*var lastVisibleBar = getBoundedLiveRightEdge\(dataLength\)[\s\S]*from: Math\.max\(-0\.5, lastVisibleBar - visibleBars\)[\s\S]*to: lastVisibleBar/,
    'recent viewport must keep a bounded right-offset gap between the latest candle and price scale',
  );
  assert.doesNotMatch(
    logicalRangeBranch,
    /scrollToRealTime\(\)/,
    'recent logical viewport must not immediately scroll flush to the newest candle after applying the bounded gap',
  );
  assertSourceContains(
    recentViewportBody,
    /\} else \{[\s\S]*fitContent\(\)[\s\S]*scrollToRealTime\(\)/,
    'legacy fallback may still use scrollToRealTime when logical range APIs are unavailable',
  );
  assertSourceContains(
    shouldFollowLiveRightEdgeBody,
    /isHorizontalScrollMotionActive\(\) \|\| Date\.now\(\) <= activeHorizontalScrollGestureUntil[\s\S]*var previousMaxRight = getBoundedLiveRightEdge\(lengthOverride\)[\s\S]*return range\.to >= previousMaxRight - followTolerance/,
    'live-edge follow must only engage when the user was already viewing the live edge and is not actively scrolling',
  );
  assertSourceContains(
    followLiveRightEdgeBody,
    /var span = Math\.max\(1, previousRange\.to - previousRange\.from\)[\s\S]*var nextFrom = nextRight - span[\s\S]*chart\.timeScale\(\)\.setVisibleLogicalRange\(\{[\s\S]*from: nextFrom,[\s\S]*to: nextRight/,
    'live-edge follow must preserve the existing viewport width while advancing the right edge',
  );
  assertSourceContains(
    applyTickUpdateBody,
    /var previousSeriesLength = currentSeriesLength[\s\S]*var previousVisibleRange = getVisibleLogicalRangeSnapshot\(\)[\s\S]*var appendedNewBar = currentSeriesLength === 0 \|\| normalizedTick\.time > lastBarTime[\s\S]*var shouldFollowLiveEdge = appendedNewBar && shouldFollowLiveRightEdge\(previousVisibleRange, previousSeriesLength\)[\s\S]*currentSeriesLength = lastRawSeriesData\.length[\s\S]*if \(shouldFollowLiveEdge\) \{[\s\S]*followLiveRightEdge\(previousVisibleRange, currentSeriesLength\)/,
    'appended live candles must advance the viewport right edge instead of drifting left behind empty future space',
  );
});

test('webview bridge: process loss recreates the surface only while Chart is focused', () => {
  assertSourceContains(
    source,
    /const handleChartWebViewProcessLoss = useCallback\([\s\S]*failedGeneration: number[\s\S]*lastRecoveredChartWebViewGenerationRef\.current === failedGeneration[\s\S]*lastRecoveredChartWebViewGenerationRef\.current = failedGeneration[\s\S]*resetChartBridgeState\(\);[\s\S]*setWebViewReady\(false\);[\s\S]*if \(!isScreenFocused\) \{[\s\S]*pendingChartWebViewRecoveryRef\.current = true;[\s\S]*return;[\s\S]*setChartWebViewGeneration\(\(generation\) => generation \+ 1\)/,
    'renderer loss must deduplicate each failed generation, reset the bridge, and defer recreation while another tab is active',
  );
  assertSourceContains(
    source,
    /useEffect\(\(\) => \{[\s\S]*!isScreenFocused \|\| !pendingChartWebViewRecoveryRef\.current[\s\S]*pendingChartWebViewRecoveryRef\.current = false;[\s\S]*setChartWebViewGeneration\(\(generation\) => generation \+ 1\);[\s\S]*\}, \[isScreenFocused\]\)/,
    'a deferred renderer recovery must recreate the WebView on the next real Chart focus',
  );
  assertSourceContains(source, /key=\{`\$\{CHART_DEV_SOURCE_KEY\}:\$\{chartWebViewGeneration\}`\}/, 'WebView recreation must use a new React key');
  assertSourceContains(source, /onContentProcessDidTerminate=\{\(\) => \{[\s\S]*handleChartWebViewProcessLoss\('iOS', chartWebViewGeneration\)/, 'iOS process termination must use generation-deduplicated focus-gated recovery');
  assertSourceContains(source, /onRenderProcessGone=\{\(\) => \{[\s\S]*handleChartWebViewProcessLoss\('Android', chartWebViewGeneration\)/, 'Android process loss must recreate rather than reuse a dead WebView generation');
  assert.doesNotMatch(source, /webViewRef\.current\?\.reload\(\)/, 'a terminated Android WebView must never be reused');
  assertSourceContains(
    source,
    /const chartManualPriceScaleRef = useRef<ChartManualPriceScaleSnapshot \| null>\(null\)/,
    'native chart state must retain the exact manual range outside the disposable renderer process',
  );
  const resetBridgeStart = source.indexOf('const resetChartBridgeState = useCallback');
  const resetBridgeEnd = source.indexOf('const handleChartWebViewProcessLoss', resetBridgeStart);
  assert.notEqual(resetBridgeStart, -1, 'resetChartBridgeState was not found');
  assert.notEqual(resetBridgeEnd, -1, 'resetChartBridgeState boundary was not found');
  const resetBridgeBody = source.slice(resetBridgeStart, resetBridgeEnd);
  assert.doesNotMatch(
    resetBridgeBody,
    /chartManualPriceScaleRef\.current = null/,
    'renderer bridge reset must not discard user-owned vertical scale state',
  );
  const sendInitStart = source.indexOf('const sendInit = useCallback');
  const sendInitEnd = source.indexOf('// Effect 1', sendInitStart);
  assert.notEqual(sendInitStart, -1, 'sendInit was not found');
  assert.notEqual(sendInitEnd, -1, 'sendInit boundary was not found');
  const sendInitBody = source.slice(sendInitStart, sendInitEnd);
  assertSourceContains(
    sendInitBody,
    /const retainedManualPriceScale = chartManualPriceScaleRef\.current[\s\S]*var retainedManualPriceScale = \$\{JSON\.stringify\(retainedManualPriceScale\)\}[\s\S]*__rtx5RestoreManualPriceScale\(retainedManualPriceScale\)/,
    'a replacement WebView must receive the retained range immediately after init is requested',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /function restoreManualPriceScale\(snapshot\)[\s\S]*manualPriceScaleReferenceSpan = restoredReferenceSpan[\s\S]*rememberManualVerticalPanRange\(restoredRange\)[\s\S]*applyManualVerticalPanLockedRange\(\)[\s\S]*window\.__rtx5RestoreManualPriceScale = restoreManualPriceScale/,
    'the WebView must seed and reapply host-retained manual scale ownership across document recreation',
  );
  assertSourceContains(
    source,
    /msg\.type === 'CHART_GEOMETRY'[\s\S]*msg\.manualPriceScale\?\.from[\s\S]*chartManualPriceScaleRef\.current = \{[\s\S]*referenceSpan:/,
    'geometry messages must continuously checkpoint the user-owned range in native state',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /function postChartGeometry\(\)[\s\S]*manualPriceRange = isManualVerticalPanRangeLocked\(\)[\s\S]*manualPriceScale: isValidPriceRange\(manualPriceRange\)[\s\S]*referenceSpan: manualReferenceSpan/,
    'WebView geometry must include the locked range and original span envelope',
  );
  assertSourceContains(
    source,
    /const executeResetVerticalScale = useCallback\(\(\) => \{[\s\S]*chartManualPriceScaleRef\.current = null[\s\S]*__rtx5ResetPriceScale/,
    'explicit vertical reset must clear the host checkpoint before resetting the WebView',
  );
  assertSourceContains(
    source,
    /const handleToggleChartAutoScale = \(\) => \{[\s\S]*if \(next\) \{[\s\S]*chartManualPriceScaleRef\.current = null/,
    'enabling Auto-scale must clear the host checkpoint',
  );
  assertSourceContains(
    chartWebViewHtmlSource,
    /var resetAutoScale = function\(\) \{[\s\S]*clearManualPriceScaleState\(\)[\s\S]*enableRightPriceAutoScale\(\)[\s\S]*postChartGeometry\(\)/,
    'a completed chart double-tap reset must clear manual ownership and checkpoint the cleared state',
  );
});
