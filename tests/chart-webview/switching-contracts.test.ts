import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  assertSourceContains,
  assertSourceOmits,
  readChartScreenSource,
} from '../support/chartSourceTestUtils';

const source = readChartScreenSource();
const quoteFallbackSource = readFileSync(
  resolve(process.cwd(), 'src/features/chart/components/ChartTradeButtonsFeature/quoteFallback.ts'),
  'utf8',
);
const rootLayoutSource = readFileSync(resolve(process.cwd(), 'app/_layout.tsx'), 'utf8');

test('timeframe switch resets time range and commits only the selected timeframe', () => {
  assertSourceContains(
    source,
    /const handleTimeframeSelect = useCallback[\s\S]*setActiveDateRange\('auto'\)[\s\S]*setCustomDateValue\(null\)[\s\S]*chartWindows\.updateToolbarTargetContext\(\{ timeframe: nextTimeframe \}\)/,
    'timeframe switch must reset range and route the new timeframe to the targeted pane',
  );
  assertSourceContains(
    source,
    /const chartWindows = useChartWindowsFeature\(\{[\s\S]*onCommitContext: commitChartWindowContext[\s\S]*chartWindowCommitContextImplementationRef\.current = warmChartContextAndCommit/,
    'targeted timeframe switches must retain the warmed chart commit pipeline',
  );
});

test('symbol switch resets time range and commits only the selected symbol', () => {
  assertSourceContains(
    source,
    /const handleSymbolSelect = useCallback[\s\S]*warmChartContextAndCommit\(nextSymbol, chartTimeframe\)[\s\S]*const timeout = setTimeout\(\(\) => \{[\s\S]*hideActionSheet\(\)[\s\S]*setActiveDateRange\('auto'\)[\s\S]*setCustomDateValue\(null\)[\s\S]*pendingSymbolUiResetTimeoutRef\.current = timeout/,
    'symbol switch must start the selected request before deferring sheet close and range reset',
  );
});

test('symbol switch cleanup preserves the latest intent across reselection and route changes', () => {
  assertSourceContains(
    source,
    /const handleSymbolSelect = useCallback[\s\S]*cancelPendingSymbolUiReset\(\);[\s\S]*if \(nextSymbol === chartSymbol\) \{[\s\S]*chartContextCommitScheduler\.cancelPending\(\);[\s\S]*hideActionSheet\(\)/,
    'reselecting the rendered symbol must cancel an older deferred symbol commit',
  );
  assertSourceContains(
    source,
    /useFocusEffect\([\s\S]*isScreenFocusedRef\.current = marketDemandAllowed[\s\S]*return \(\) => \{[\s\S]*isScreenFocusedRef\.current = false[\s\S]*chartContextCommitScheduler\.cancelPending\(\);[\s\S]*cancelPendingSymbolUiReset\(\)/,
    'an immediate blur or authentication coverage must cancel symbol work before the retained Chart prop updates',
  );
  assertSourceOmits(
    source,
    /isScreenFocusedRef\.current = isScreenFocused/,
    'a render using the deferred focus prop must not overwrite the immediate blur signal',
  );
  assertSourceContains(
    source,
    /const currentCacheNamespace = currentSession\?\.session\.cacheNamespace \?\? ''[\s\S]*currentCacheNamespace !== expectedCacheNamespace/,
    'a deferred commit must reject every session namespace transition, including an empty-to-active transition',
  );
});

test('symbol switching does not rerender RootLayout or repeat startup cache restoration', () => {
  assertSourceOmits(
    rootLayoutSource,
    /const chartSymbol = useUserPreferences\(\(s\) => s\.chartSymbol\)|const chartTimeframe = useUserPreferences\(\(s\) => s\.chartTimeframe\)/,
    'RootLayout must not subscribe to the active chart context',
  );
  assertSourceContains(
    rootLayoutSource,
    /if \(!hasHydrated \|\| !sessionRestoreComplete\)[\s\S]*const \{ chartSymbol, chartTimeframe \} = useUserPreferences\.getState\(\)[\s\S]*hydratePersistedCandleCache\(chartSymbol, chartTimeframe\)[\s\S]*\}, \[hasHydrated, sessionRestoreComplete\]\)/,
    'startup chart cache restoration must read the latest context once without subscribing the root tree',
  );
});

test('symbol and timeframe switching reuse the initialized WebView surface', () => {
  const currentSigStart = source.indexOf('const currentSig = useMemo');
  const currentSigEnd = source.indexOf('useEffect(() => {', currentSigStart);
  assert.notEqual(currentSigStart, -1);
  assert.notEqual(currentSigEnd, -1);
  const currentSigSource = source.slice(currentSigStart, currentSigEnd);

  assertSourceContains(
    source,
    /const chartDataContextSig = useMemo\([\s\S]*`\$\{chartMarketDataCacheNamespace\}:\$\{chartSymbol\}:\$\{normalizeTimeframe\(chartTimeframe\)\}`/,
    'broker session, symbol, and timeframe must be tracked as a data context separate from the chart shell',
  );
  assert.doesNotMatch(
    currentSigSource,
    /chartSymbol|chartTimeframe/,
    'symbol/timeframe must not force a full WebView init signature rebuild',
  );
  assert.doesNotMatch(
    currentSigSource,
    /displayDecimals/,
    'display precision must update through the WebView bridge instead of reinitializing the chart',
  );
  assertSourceContains(
    source,
    /setDisplayDecimals\(\$\{displayDecimals\}\)/,
    'display precision changes must be pushed to the initialized WebView chart',
  );
});

test('symbol switching dispatches selected history before the deferred heavy chart commit', () => {
  assertSourceContains(
    source,
    /const refreshSelectedChartHistory = useCallback\([\s\S]*liveCandlesEngine\.prefetchHistory\(nextSymbol, nextTimeframe\)[\s\S]*liveCandlesEngine\.refreshHistoryForContext\(nextSymbol, nextTimeframe\)/,
    'same-context refreshes must keep their canonical engine refresh path',
  );
  assertSourceContains(
    source,
    /prepare: \(\) => \{[\s\S]*prefetchChartSelectionHistory\(nextSymbol, nextTimeframe\)[\s\S]*prefetchInstrument\(nextSymbol\)/,
    'new symbol switches must start the status-aware history warm-up before committing the context',
  );

  const switchStart = source.indexOf('const warmChartContextAndCommit');
  const switchEnd = source.indexOf('const handleTimeframeSelect', switchStart);
  assert.notEqual(switchStart, -1);
  assert.notEqual(switchEnd, -1);
  const switchSource = source.slice(switchStart, switchEnd);
  const requestIndex = switchSource.indexOf('chartContextCommitScheduler.request');
  const prepareIndex = switchSource.indexOf('prepare:');
  const historyPreparationIndex = switchSource.indexOf('prefetchChartSelectionHistory', prepareIndex);
  const commitIndex = switchSource.indexOf('commit:');
  const symbolCommitIndex = switchSource.indexOf('preferences.setChartSymbol', commitIndex);

  assert.ok(requestIndex >= 0, 'symbol changes must use the cancellable deferred commit scheduler');
  assert.ok(
    prepareIndex > requestIndex && historyPreparationIndex > prepareIndex,
    'selected history preparation must be part of the pre-render scheduler phase',
  );
  assert.ok(
    commitIndex > historyPreparationIndex && symbolCommitIndex > commitIndex,
    'the Zustand symbol update must happen only in the deferred commit phase',
  );
  const authenticatedBranchStart = switchSource.indexOf('if (nextSymbol === chartSymbol)');
  assert.ok(authenticatedBranchStart >= 0);
  assert.doesNotMatch(
    switchSource.slice(authenticatedBranchStart, commitIndex),
    /setChartSymbol\(/,
    'authenticated symbol switching must not start the heavy Chart render in the request-dispatch turn',
  );
  assertSourceContains(
    switchSource,
    /if \(isPublicDemoMarket\) \{[\s\S]*preferences\.setChartSymbol\(nextSymbol\)[\s\S]*preferences\.setChartTimeframe\(nextTimeframe\)/,
    'public demo selections must commit directly and let the tokenless hook load the new context',
  );
  assertSourceContains(
    source,
    /useEffect\(\(\) => \{[\s\S]*chartContextCommitScheduler\.cancelPending\(\)[\s\S]*return \(\) => \{[\s\S]*chartContextCommitScheduler\.cancelPending\(\)[\s\S]*cancelPendingSymbolUiReset\(\)/,
    'pending symbol commits must be cancelled on retained-screen blur, session change, and unmount',
  );
  assertSourceContains(
    source,
    /if \(nextSymbol === chartSymbol\) \{[\s\S]*refreshSelectedChartHistory\(nextSymbol, nextTimeframe\)[\s\S]*setChartTimeframe\(nextTimeframe\)/,
    'timeframe-only changes must keep their existing immediate commit path',
  );
  assertSourceContains(
    source,
    /warmChartContextAndCommit\(nextSymbol, chartTimeframe\)/,
    'symbol selection must use the prioritized chart-context path',
  );
  assertSourceOmits(
    source,
    /prefetchSymbolPickerHistory|CHART_SYMBOL_PICKER_PREFETCH_LIMIT|CHART_SYMBOL_PICKER_PREFETCH_DELAY_MS/,
    'opening the native picker must not launch unrelated candle requests that compete with the selected symbol',
  );
});

test('symbol and timeframe switching full-reloads data and resets the first view', () => {
  assertSourceContains(
    source,
    /const contextChanged = renderedDataContextSigRef\.current !== chartDataContextSig[\s\S]*const updateMode = contextChanged[\s\S]*\? 'full_reload'[\s\S]*: getChartSeriesUpdateMode/,
    'symbol/timeframe changes must force updateChartData on the existing chart surface',
  );
  assertSourceContains(
    source,
    /updateChartData\(\$\{JSON\.stringify\(mapped\)\}, \{[\s\S]*resetVisibleRange: \$\{contextChanged \|\| resetForClosedMarketClamp \|\| resetForHistorylessBootstrap\},[\s\S]*dataContextSig: \$\{JSON\.stringify\(chartDataContextSig\)\},[\s\S]*paintToken: \$\{JSON\.stringify\(issuedPaintToken\)\}/,
    'symbol/timeframe full reloads must reset the visible range for the newly selected context',
  );
  assertSourceContains(
    source,
    /!hasHistoryCandles && initSnapshot\.length > 0[\s\S]*historylessBootstrapViewportRef\.current = \{[\s\S]*contextKey: chartDataContextSig,[\s\S]*snapshot: initSnapshot[\s\S]*shouldResetViewportForHistorylessBootstrap\(/,
    'every historyless first paint must arm a context-scoped viewport reset for the later history handoff',
  );
  assertSourceContains(
    source,
    /const clearRenderedMarketPriceLines = useCallback\(\(dataContextSig\?: string\) => \{[\s\S]*const revision = livePaintRevisionRef\.current \+ 1;[\s\S]*setLivePriceLineForContext\([\s\S]*null,[\s\S]*\$\{JSON\.stringify\(requestedContextSig\)\},[\s\S]*\$\{revision\}[\s\S]*livePaintRevisionRef\.current = revision/,
    'symbol/timeframe changes must clear the old rendered context through a revisioned live-line command',
  );
  assertSourceContains(
    source,
    /if \(candlesRefContextSigRef\.current !== chartDataContextSig\) \{[\s\S]*chartLiveTickAccumulatorRef\.current = null;[\s\S]*historylessBootstrapViewportRef\.current = EMPTY_HISTORYLESS_BOOTSTRAP_VIEWPORT;[\s\S]*useEffect\(\(\) => \{[\s\S]*const renderedContextToClear =[\s\S]*clearRenderedMarketPriceLines\(renderedContextToClear\);[\s\S]*renderedDataContextSigRef\.current = '';[\s\S]*chartLiveTickAccumulatorRef\.current = null;[\s\S]*publishChartLiveOhlc\(null\);[\s\S]*\}, \[chartDataContextSig, clearRenderedMarketPriceLines, publishChartLiveOhlc\]\)/,
    'symbol/timeframe changes must synchronously clear stale historyless viewport state with the old accumulator and rendered context',
  );
  assertSourceContains(
    source,
    /chartManualPriceScaleContextSigRef\.current !== chartDataContextSig[\s\S]*chartManualPriceScaleContextSigRef\.current = chartDataContextSig;[\s\S]*chartManualPriceScaleRef\.current = null/,
    'manual price-scale snapshots must be discarded when the selected market-data context changes',
  );
  assertSourceContains(
    source,
    /if \(renderableCandles\.length === 0\) \{[\s\S]*if \(contextChanged\) \{[\s\S]*updateChartData\(\[\], \{[\s\S]*resetVisibleRange: true,[\s\S]*dataContextSig:/,
    'an empty context handoff must reset the old symbol price window before new history arrives',
  );
  assertSourceContains(
    source,
    /chartDataContextEpochRef\.current\.contextKey !== chartDataContextSig[\s\S]*epoch: chartDataContextEpochRef\.current\.epoch \+ 1[\s\S]*lastPaintedChartDataContextEpoch === chartDataContextEpoch/,
    'rapid A-B-A selections must not reuse an older paint acknowledgement for the same context string',
  );
});

test('symbol and timeframe switching relies on the context reload for the auto viewport', () => {
  assertSourceContains(
    source,
    /useEffect\(\(\) => \{[\s\S]*if \(!hasCandles \|\| !webViewReady \|\| !chartCanvasReady\)[\s\S]*if \(activeDateRange === 'auto'\) \{[\s\S]*return;[\s\S]*applyNativeTimeRange\(activeDateRange, customDateValue\)/,
    'automatic time-range sync must not request a price-scale reset after a symbol/timeframe reload',
  );
  assertSourceContains(
    source,
    /const applyNativeTimeRange = useCallback\([\s\S]*resetPriceScale = false[\s\S]*if \(\$\{resetPriceScale\} && typeof window\.__rtx5ResetPriceScale/,
    'ordinary date-range and context updates must default to preserving the manual vertical range',
  );
  assertSourceContains(
    source,
    /const handleResetChartViewport = useCallback\([\s\S]*applyNativeTimeRange\(activeDateRange, customDateValue, true\)/,
    'the explicit viewport reset must still clear manual vertical ownership',
  );
});

test('symbol-specific drawings use a normalized drawing bucket', () => {
  assertSourceContains(
    source,
    /const chartDrawingBucketKey = useMemo\(\(\) => getChartDrawingBucketKey\(chartSymbol\), \[chartSymbol\]\)/,
    'drawing bucket key must be derived from active chart symbol',
  );
  assertSourceContains(
    source,
    /chartDrawingRecordsBySymbol\[chartDrawingBucketKey\] \?\? \[\]/,
    'drawing records must be loaded from the active symbol bucket',
  );
});

test('symbol change recalculates decimals and candle close cannot become a trade-button quote', () => {
  const displayDecimalsStart = source.indexOf('const rawDisplayDecimals = useMemo');
  const displayDecimalsEnd = source.indexOf('const sanitizedCandles', displayDecimalsStart);
  assert.notEqual(displayDecimalsStart, -1);
  assert.notEqual(displayDecimalsEnd, -1);
  const displayDecimalsSource = source.slice(displayDecimalsStart, displayDecimalsEnd);

  assertSourceContains(
    displayDecimalsSource,
    /const rawDisplayDecimals = useMemo\([\s\S]*resolveChartDisplayDecimals\(\{[\s\S]*instrumentDigits: chartInstrumentMeta\?\.digits[\s\S]*instrumentPoint: chartInstrumentMeta\?\.point[\s\S]*instrumentTickSize: chartInstrumentMeta\?\.tickSize[\s\S]*liveQuoteDigits: chartLiveQuote\?\.digits[\s\S]*liveQuoteDigitsFromBackend: hasCoherentLiveChartQuote && chartLiveQuoteDigitsSource === 'backend'/,
    'display decimals must react to backend instrument precision metadata and trusted backend quote digits',
  );
  assertSourceOmits(
    displayDecimalsSource,
    /const rawDisplayDecimals = useMemo\([\s\S]*baseSymbol\.includes\('BTC'\)/,
    'display decimals must not use frontend symbol-family precision guesses',
  );
  // Executable path: live WS bid/ask only (fallbacks intentionally unused).
  assertSourceContains(
    quoteFallbackSource,
    /export function resolveChartTradeButtonQuote\([\s\S]*bid: toPositiveFiniteNumber\(liveBid\) \?\? 0,[\s\S]*ask: toPositiveFiniteNumber\(liveAsk\) \?\? 0/,
    'executable trade-button quote resolution must use only live bid and ask',
  );
  const executableQuoteStart = quoteFallbackSource.indexOf(
    'export function resolveChartTradeButtonQuote',
  );
  const displayQuoteStart = quoteFallbackSource.indexOf(
    'export function resolveChartTradeButtonDisplayQuote',
    executableQuoteStart,
  );
  assert.notEqual(executableQuoteStart, -1, 'executable quote resolver was not found');
  assert.notEqual(displayQuoteStart, -1, 'display-only quote resolver was not found');
  const executableQuoteSource = quoteFallbackSource.slice(executableQuoteStart, displayQuoteStart);
  assertSourceOmits(
    executableQuoteSource,
    /fallbackBid|fallbackAsk/,
    'executable quote resolver must ignore candle/snapshot fallbacks',
  );
  // Display path may use chart last-known bid/ask so tiles stay bright while
  // the integrity gate warms; execution stays fail-closed via quote integrity.
  assertSourceContains(
    quoteFallbackSource,
    /export function resolveChartTradeButtonDisplayQuote\([\s\S]*toPositiveFiniteNumber\(liveBid\) \?\? toPositiveFiniteNumber\(fallbackBid\) \?\? 0/,
    'display quote may fall back to chart bid/ask for tile rendering only',
  );
  assertSourceOmits(
    source,
    /const quoteFallbackSpread =/,
    'chart quote fallback must not invent symbol-family spreads for native bid/ask lines',
  );
});
