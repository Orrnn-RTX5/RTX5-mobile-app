import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('hidden tab screens gate heavy work while a visited chart keeps one atomic live-paint bridge warm', () => {
  const quotesSource = readSource('src/features/quotes/QuotesScreen.tsx');
  const chartSource = readSource('src/features/chart/ChartScreen.native.tsx');
  const rootLayoutSource = readSource('app/_layout.tsx');
  const marketDataSource = readSource('src/query/websocket.ts');
  const marketSymbolsSource = readSource('src/query/market.ts');
  const instrumentsSource = readSource('src/query/instruments.ts');
  const alertsSource = readSource('src/query/alerts.ts');
  const marketStatusSource = readSource('src/query/marketStatus.ts');
  const priceAlertsSource = readSource('src/features/chart/PriceAlertsScreen/PriceAlertsScreen.tsx');
  const chartSpecificationSource = readSource('src/features/chart/ChartSpecificationScreen.tsx');
  const registerSource = readSource('app/register.tsx');
  const registerEntrySource = readSource('app/register-entry.tsx');
  const brokerDetailSource = readSource('src/features/settings/BrokerDetailScreen.tsx');
  const publicDemoSource = readSource('src/query/publicDemo.ts');
  const liveCandlesSource = readSource('src/domain/candles/hooks/useLiveCandles.ts');
  const chartLiveHeadersSource = readSource('src/features/chart/components/ChartLiveHeaders.tsx');
  const chartTradeButtonsSource = readSource('src/features/chart/components/ChartTradeButtonsFeature/ChartTradeButtonsFeature.tsx');
  const chartTradeOverlayLiveBridgeSource = readSource('src/features/chart/components/ChartTradeOverlayLiveBridge.tsx');

  assert.match(quotesSource, /import \{ useIsFocused \} from '@react-navigation\/native'/);
  assert.match(quotesSource, /import \{ useRouter \} from 'expo-router'/);
  assert.match(quotesSource, /import \{ useNextFrameValue \} from '\.\.\/\.\.\/hooks\/useNextFrameValue'/);
  assert.doesNotMatch(quotesSource, /import \{[^}]*usePathname[^}]*\} from 'expo-router'/);
  assert.doesNotMatch(quotesSource, /const sidebarOpen = useUIState\(\(s\) => s\.sidebarOpen\)/);
  assert.match(quotesSource, /const QuotesScreenInner = React\.memo\(function QuotesScreenInner\(\{ isScreenFocused \}: \{ isScreenFocused: boolean \}\)/);
  assert.match(quotesSource, /export function QuotesScreen\(\) \{\s*const isScreenFocused = useIsFocused\(\);\s*const deferredScreenFocused = useNextFrameValue\(isScreenFocused\);\s*return <QuotesScreenInner isScreenFocused=\{deferredScreenFocused\} \/>;\s*\}/);
  assert.match(quotesSource, /const quoteRouteActive = isScreenFocused/);
  assert.match(quotesSource, /const quoteCatalogActive = quoteRouteActive/);
  assert.doesNotMatch(quotesSource, /quoteSheetRouteActionPending|setQuoteSheetRouteActionPending/);
  assert.match(quotesSource, /const quoteWatchlistActive = quoteCatalogActive && isLoggedIn/);
  assert.match(quotesSource, /useMarketSymbols\(quoteCatalogActive\)/);
  assert.match(quotesSource, /useWatchlistQuery\(quoteWatchlistActive\)/);
  assert.match(quotesSource, /const isPublicDemoMarket = isOrrnnDemoPublicMarketSelection\(\{[\s\S]*brokerId: selectedBrokerId,[\s\S]*isLoggedIn,[\s\S]*\}\)/);
  assert.match(quotesSource, /const quoteStickyFeedActive = quoteCatalogActive && \(isLoggedIn \|\| isPublicDemoMarket\)/);
  assert.match(quotesSource, /const authenticatedQuoteStickyFeedActive = quoteCatalogActive && isLoggedIn/);
  assert.match(quotesSource, /const quoteRestFallbackActive = quoteCatalogActive && isLoggedIn/);
  assert.match(quotesSource, /pauseLiveQuoteSnapshotNotifications/);
  assert.match(quotesSource, /const quoteSheetFeedPauseReleaseRef = useRef<\(\(\) => void\) \| null>\(null\)/);
  assert.match(quotesSource, /const pauseQuoteSheetFeed = useCallback\(\(durationMs = QUOTE_SHEET_OPEN_FEED_PAUSE_MS\) => \{/);
  assert.doesNotMatch(quotesSource, /quotesActionSheetOpen|quoteSheetTouchPending|quoteSheetInteractionBusy|quoteVisibleFeedActive/);
  assert.match(quotesSource, /if \(!authenticatedQuoteStickyFeedActive \|\| quoteFeedSymbols\.length === 0\)[\s\S]*quotesWsService\.setSubscriptions\(quoteFeedSymbols\)/);
  // The socket service is the single owner of accepted-tick feed-health
  // reduction. A retained Quotes screen must not report every tick a second
  // time while another tab is active.
  assert.doesNotMatch(quotesSource, /reportFeedLocalTick|quotesWsService\.addTickListener/);
  assert.match(quotesSource, /useWatchlistLiveQuotes\(quoteFeedSymbols, quoteStickyFeedActive, \{[\s\S]*restFallbackActive: quoteRestFallbackActive,[\s\S]*\}\)/);
  assert.match(quotesSource, /liveUpdatesActive=\{quoteStickyFeedActive\}/);
  assert.match(
    quotesSource,
    /const observedLiveItem = useLiveQuoteSnapshot\(liveSymbol, liveUpdatesActive\);[\s\S]*\(!liveUpdatesActive \? getCurrentLiveQuoteSnapshot\(liveSymbol\) : undefined\)/,
    'inactive quote rows must retain session-scoped display values without subscribing',
  );
  assert.match(quotesSource, /<TickCounter[\s\S]*active=\{quoteStickyFeedActive\}/);
  assert.doesNotMatch(quotesSource, /useWatchlistLiveQuotes\(quoteFeedSymbols, true\)/);

  assert.match(marketDataSource, /export function useMarketData\(symbols: string\[\] = \[\], active = true\)/);
  assert.match(marketDataSource, /const isLoggedIn = useUserPreferences\(\(state\) => state\.isLoggedIn\)/);
  assert.match(marketDataSource, /const isPublicDemoMarket = isOrrnnDemoPublicMarketSelection\(\{[\s\S]*brokerId: selectedBrokerId,[\s\S]*isLoggedIn,[\s\S]*\}\)/);
  assert.match(marketDataSource, /const isActive = active && \(isLoggedIn \|\| isPublicDemoMarket\)/);
  assert.match(marketDataSource, /if \(!isActive \|\| normalizedSymbols\.length === 0\) return EMPTY_LIVE_QUOTES/);
  assert.match(marketDataSource, /if \(!isActive \|\| transportSymbols\.length === 0\) return/);
  assert.match(marketDataSource, /if \(isPublicDemoMarket\) \{[\s\S]*orrnnDemoPublicMarketSocket\.subscribeToSymbol\(symbol, \(\) => \{\}\)/);
  assert.match(marketDataSource, /useMarketData\(symbols: string\[\] = \[\], active = true\)/);
  assert.match(marketDataSource, /export function useLiveSymbolQuote\([\s\S]*symbol: string,[\s\S]*active = true,[\s\S]*commitIntervalMs = LIVE_SYMBOL_QUOTE_COMMIT_INTERVAL_MS/);
  assert.match(marketDataSource, /const LIVE_SYMBOL_QUOTE_COMMIT_INTERVAL_MS = 16/);
  assert.match(marketDataSource, /const activeSession = useActiveBrokerQuerySession\(\)/);
  assert.match(marketDataSource, /const isActive = active && isLoggedIn && Boolean\(activeSession\)/);
  assert.match(marketDataSource, /if \(safeCommitIntervalMs === 0\) \{[\s\S]*commit\(\);[\s\S]*return;[\s\S]*\}/);
  assert.match(marketDataSource, /safeCommitIntervalMs <= 16[\s\S]*globalThis\.requestAnimationFrame/);
  assert.match(marketDataSource, /if \(safeCommitIntervalMs <= 16\) \{[\s\S]*updateLiveQuote\(\);[\s\S]*\} else \{[\s\S]*React\.startTransition\(updateLiveQuote\)/);
  assert.match(marketDataSource, /if \(!isActive \|\| !activeSession \|\| !normalizedSymbol\)/);
  assert.doesNotMatch(marketDataSource, /skipAuth: true/);
  assert.match(marketSymbolsSource, /useActiveBrokerQuerySession/);
  assert.match(marketSymbolsSource, /const cacheNamespace = isPublicDemoMarket[\s\S]*\? ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE[\s\S]*: authenticatedCacheNamespace/);
  assert.match(marketSymbolsSource, /const isEnabled = enabled && \(isPublicDemoMarket \|\| Boolean\(session\)\)/);
  assert.match(marketSymbolsSource, /queryKey: \['market', cacheNamespace, 'symbols', 'instrument-catalog-v3'\]/);
  assert.doesNotMatch(marketSymbolsSource, /skipAuth: true/);
  assert.match(marketSymbolsSource, /enabled: isEnabled/);
  assert.match(marketSymbolsSource, /if \(isPublicDemoMarket\) \{[\s\S]*getOrrnnDemoPublicMarketCatalog\(\)/);
  assert.match(marketSymbolsSource, /commitApiJson\(result, authenticatedCacheNamespace,/);
  assert.match(instrumentsSource, /const cacheNamespace = getSessionQueryCacheNamespace\(session\)/);
  assert.match(instrumentsSource, /const isEnabled = enabled && Boolean\(session\) && !!normalizedSymbol/);
  assert.match(instrumentsSource, /queryKey: \['instrument', cacheNamespace, INSTRUMENT_META_QUERY_VERSION, normalizedSymbol\]/);
  assert.match(instrumentsSource, /enabled: isEnabled/);
  assert.match(alertsSource, /const enabled = Boolean\(session\) && \(options\.enabled \?\? true\) && isLoggedIn/);
  assert.match(marketStatusSource, /const isEnabled = enabled && isLoggedIn && Boolean\(session\) && !!symbol/);
  assert.match(marketStatusSource, /pollingEnabled = enabled/);
  assert.match(marketStatusSource, /const isPollingEnabled = isEnabled && pollingEnabled/);
  assert.match(marketStatusSource, /refetchInterval: isPollingEnabled \? 30_000 : false/);
  assert.match(marketStatusSource, /refetchOnWindowFocus: isPollingEnabled/);
  assert.match(marketStatusSource, /refetchOnReconnect: isPollingEnabled/);
  assert.match(
    chartSource,
    /useMarketStatus\(\s*chartSymbol,\s*chartSurfaceReady,\s*chartRuntimeActive,\s*\)/,
  );
  assert.match(registerSource, /const isScreenFocused = useIsFocused\(\)/);
  assert.match(registerSource, /const registerDataActive = useDeferredActiveFlag\(\s*isScreenFocused && firstPaintReady,\s*REGISTER_ROUTE_DATA_DELAY_MS,\s*\)/);
  assert.match(registerSource, /useOrrnnDemoStatus\(registerDataActive\)/);
  assert.match(registerSource, /useOrrnnDemoGroups\(registerDataActive && isDemoServiceReady\)/);
  assert.match(registerSource, /if \(!isScreenFocused\) \{\s*return null;\s*\}\s*return \(/);
  assert.match(registerEntrySource, /if \(!isScreenFocused\) \{\s*return null;\s*\}\s*return \(/);
  assert.match(brokerDetailSource, /if \(!isScreenFocused\) \{\s*return null;\s*\}\s*if \(!contentReady\)/);
  assert.match(publicDemoSource, /export function useOrrnnDemoStatus\(enabled = true\)/);
  assert.match(publicDemoSource, /refetchInterval: enabled \? 30 \* 1000 : false/);

  assert.match(liveCandlesSource, /export function useLiveCandles\([\s\S]*symbol: string,[\s\S]*timeframe: string,[\s\S]*active = true,[\s\S]*commitIntervalMs = 0/);
  assert.match(liveCandlesSource, /const isLiveActive = active && isLoggedIn/);
  assert.match(liveCandlesSource, /const safeCommitIntervalMs = Math\.max\(0, Math\.floor\(commitIntervalMs\)\)/);
  assert.match(liveCandlesSource, /scheduleReactNotification[\s\S]*safeCommitIntervalMs - elapsedMs[\s\S]*setTimeout\(notifyReact, delayMs\)/);
  assert.match(liveCandlesSource, /if \(!isLiveActive \|\| !normalizedSymbol \|\| !normalizedTimeframe\)/);
  assert.doesNotMatch(liveCandlesSource, /hasAuthenticatedCandleSession/);
  assert.match(liveCandlesSource, /export function useLiveTick\(symbol: string, _timeframe\?: string, active = true\)/);
  assert.match(liveCandlesSource, /useMarketData\(symbol \? \[symbol\] : \[\], active\)/);
  assert.doesNotMatch(rootLayoutSource, /prefetchChartCandles/);

  assert.match(chartSource, /import \{ useIsFocused \} from '@react-navigation\/native'/);
  assert.match(chartSource, /import \{ router, useFocusEffect \} from 'expo-router'/);
  assert.match(chartSource, /import \{ useLatchedFlag \} from '\.\.\/\.\.\/hooks\/useLatchedFlag'/);
  assert.match(chartSource, /import \{ useNextFrameValue \} from '\.\.\/\.\.\/hooks\/useNextFrameValue'/);
  assert.doesNotMatch(chartSource, /import \{[^}]*usePathname[^}]*\} from 'expo-router'/);
  assert.match(
    chartSource,
    /const ChartScreenInner = React\.memo\(function ChartScreenInner\(\{\s*isChartRouteActive,\s*isTradeExecutionFocused,\s*\}: \{\s*isChartRouteActive: boolean;\s*isTradeExecutionFocused: \(\) => boolean;\s*\}\)/,
  );
  assert.match(
    chartSource,
    /export function ChartScreen\(\) \{\s*const isScreenFocused = useIsFocused\(\);\s*const immediateFocusRef = useRef\(isScreenFocused\);\s*immediateFocusRef\.current = isScreenFocused;\s*const isTradeExecutionFocused = useCallback\([\s\S]*?\(\) => immediateFocusRef\.current,[\s\S]*?\[\],[\s\S]*?\);\s*const deferredScreenFocused = useNextFrameValue\(isScreenFocused\);\s*return \([\s\S]*?<ChartScreenInner[\s\S]*?isChartRouteActive=\{deferredScreenFocused\}[\s\S]*?isTradeExecutionFocused=\{isTradeExecutionFocused\}[\s\S]*?\/>[\s\S]*?\);\s*\}/,
  );
  assert.match(chartSource, /import \{ useDeferredActiveFlag \} from '\.\.\/\.\.\/hooks\/useDeferredActiveFlag'/);
  assert.match(chartSource, /import \{ scheduleAfterFirstFrame, scheduleIdleWork \} from '\.\.\/\.\.\/utils\/startupScheduler'/);
  assert.match(chartSource, /const CHART_RUNTIME_ACTIVE_DELAY_MS = 0/);
  assert.match(chartSource, /const CHART_SCREEN_QUOTE_COMMIT_INTERVAL_MS = 400/);
  assert.match(chartSource, /const CHART_SCREEN_CANDLE_COMMIT_INTERVAL_MS = 400/);
  assert.match(chartSource, /const CHART_FOCUS_WORK_DELAY_MS = 120/);
  assert.match(chartSource, /const CHART_SURFACE_MOUNT_DELAY_MS = 0/);
  assert.match(chartSource, /const chartRuntimeActive = useDeferredActiveFlag\(isChartRouteActive, CHART_RUNTIME_ACTIVE_DELAY_MS\)/);
  // The WebView surface boots on the first real Chart focus, or earlier via
  // the idle-scheduled startup boot so a fresh app open pre-pays the document
  // boot + chart-library parse before the first Chart tap. The startup
  // boot must stay gated (preference hydration + idle slot after a delay) so
  // public-market users receive the same safe prewarm. An immediate boot
  // behind Quotes previously starved
  // tab navigation on low-memory devices. Once booted, the surface is
  // retained; only its selected-symbol candle+Bid bridge and an imperative
  // display-price ref stay warm without waking React in the hidden footer.
  const chartStartupBootSource = readSource('src/features/chart/useChartSurfaceStartupBoot.ts');
  assert.match(chartSource, /const chartSurfaceActivated = useDeferredActiveFlag\(isChartRouteActive, CHART_SURFACE_MOUNT_DELAY_MS\)/);
  assert.match(chartSource, /const chartSurfaceStartupBooted = useChartSurfaceStartupBoot\(chartSurfaceActivated\)/);
  assert.match(chartSource, /const chartSurfaceReady = useLatchedFlag\(chartSurfaceActivated \|\| chartSurfaceStartupBooted\)/);
  assert.match(chartStartupBootSource, /export const CHART_SURFACE_STARTUP_BOOT_DELAY_MS = 1000/);
  assert.match(
    chartStartupBootSource,
    /if \(startupBooted \|\| surfaceAlreadyActivated \|\| !preferencesHydrated\) \{[\s\S]*return undefined;/,
    'the startup boot must wait for preference hydration and must yield to the focused path',
  );
  assert.doesNotMatch(
    chartStartupBootSource,
    /!isLoggedIn/,
    'logged-out public-market users must receive the same idle WebView surface prewarm',
  );
  assert.match(
    chartStartupBootSource,
    /return scheduleIdleWork\([\s\S]*\(\) => setStartupBooted\(true\),[\s\S]*delayMs: CHART_SURFACE_STARTUP_BOOT_DELAY_MS,/,
    'the startup boot must run through the idle scheduler so it never competes with startup navigation or first paint',
  );
  assert.doesNotMatch(chartSource, /const chartSurfaceReady = useDeferredActiveFlag\(/);
  assert.match(chartSource, /useLiveSymbolQuote\(chartSymbol, chartRuntimeActive, CHART_SCREEN_QUOTE_COMMIT_INTERVAL_MS\)/);
  assert.match(chartTradeOverlayLiveBridgeSource, /useLiveSymbolQuote\(symbol, active, 0\)/);
  assert.match(
    chartSource,
    /<ChartTradeOverlayLiveBridge\s+key=\{chartTradeDisplayQuoteScopeKey\}\s+active=\{chartRuntimeActive && chartCanvasReady && webViewReady\}/,
  );
  assert.match(chartTradeOverlayLiveBridgeSource, /hasLiveQuoteFeedData\(liveQuote\)/);
  assert.doesNotMatch(chartLiveHeadersSource, /useMarketData|useLiveTick/);
  assert.match(chartTradeButtonsSource, /const TRADE_BUTTON_QUOTE_COMMIT_INTERVAL_MS = 16/);
  assert.match(chartTradeButtonsSource, /useExecutableQuote\(symbol, active, TRADE_BUTTON_QUOTE_COMMIT_INTERVAL_MS\)/);
  assert.match(
    chartTradeButtonsSource,
    /const displayQuoteScopeKey =[\s\S]*activeSession\?\.cacheNamespace[\s\S]*props\.symbol\.trim\(\)\.toUpperCase\(\)[\s\S]*key=\{displayQuoteScopeKey\}[\s\S]*const retainedDisplayQuoteRef = React\.useRef/,
    'the footer must retain display prices only inside the current session and symbol scope',
  );
  assert.match(
    chartTradeButtonsSource,
    /Visual continuity only:[\s\S]*const displayBid =[\s\S]*retainedDisplayQuote\?\.bid \?\? 0[\s\S]*const displayAsk =[\s\S]*retainedDisplayQuote\?\.ask \?\? 0/,
    'inactive footer renders must preserve numeric text without keeping hidden tick subscriptions active',
  );
  assert.match(chartSource, /useMarketSymbols\(chartRuntimeActive\)/);
  assert.match(chartSource, /useInstrumentMeta\(chartSymbol, chartRuntimeActive\)/);
  assert.match(
    chartSource,
    /const chartDataActive = chartRuntimeActive/,
    'the anonymous candle hook must remain focus-gated while the WebView surface prewarms',
  );
  assert.match(
    chartSource,
    /PUBLIC_CHART_HISTORY_STARTUP_PREFETCH_DELAY_MS = 500[\s\S]*if \(isPublicDemoMarket\) \{[\s\S]*ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE[\s\S]*return scheduleIdleWork\([\s\S]*prefetchChartSelectionHistory\(chartSymbol, normalizedTimeframe\)/,
    'logged-out startup may warm shared REST history after first paint without enabling hidden live candle work',
  );
  assert.match(chartSource, /useLiveCandles\(\s*chartSymbol,\s*chartTimeframe,\s*chartDataActive,\s*CHART_SCREEN_CANDLE_COMMIT_INTERVAL_MS,?\s*\)/);
  assert.match(chartSource, /const activeChartSessionCacheNamespace = activeChartSession\?\.cacheNamespace \?\? ''/);
  assert.match(
    chartSource,
    /IMPORTANT LIVE-CANDLE \/ LIVE-PRICE-LINE CONTRACT[\s\S]*!chartSurfaceReady \|\|[\s\S]*\(!isPublicDemoMarket && \(!isLoggedIn \|\| !activeChartSessionCacheNamespace\)\)[\s\S]*const paintCanonicalLiveTick = \(allowUnchangedSnapshot = false\) => \{[\s\S]*projectChartLiveTickCandles\([\s\S]*updateLiveTick\(/,
  );
  assert.match(
    chartSource,
    /const releaseCandleConsumer = isPublicDemoMarket[\s\S]*liveCandlesEngine\.subscribe\([\s\S]*chartSymbol,[\s\S]*chartTimeframe,[\s\S]*scheduleCanonicalLivePaint/,
  );
  assert.match(
    chartSource,
    /const retainLatestChartTradeDisplayQuote = \(tick: QuoteTickEvent\) => \{[\s\S]*if \(!isPublicDemoMarket\) \{[\s\S]*captureExactChartQuote\(chartTradeDisplayQuoteScopeKey, tick\)[\s\S]*const canonicalCandles = readRenderableCanonicalCandles\(\)[\s\S]*accumulateCurrentChartBid\(exactQuote, canonicalCandles\)[\s\S]*retainedChartTradeDisplayQuoteRef\.current = exactQuote;[\s\S]*scheduleCanonicalLivePaint\(true\)[\s\S]*const releaseQuoteDemand = isPublicDemoMarket[\s\S]*orrnnDemoPublicMarketSocket\.subscribeToSymbol\([\s\S]*chartSymbol,[\s\S]*retainLatestChartTradeDisplayQuote,[\s\S]*quotesWsService\.subscribeToSymbol\([\s\S]*chartSymbol,[\s\S]*retainLatestChartTradeDisplayQuote,[\s\S]*cancelLivePaintSchedule\(\);[\s\S]*releaseQuoteDemand\(\);[\s\S]*releaseCandleConsumer\(\);/,
  );
  assert.match(
    chartSource,
    /const scheduleCanonicalLivePaint = \(allowUnchangedSnapshot = false\) => \{[\s\S]*livePaintPending = true[\s\S]*livePaintTimer = setTimeout\([\s\S]*flushCanonicalLivePaint,[\s\S]*CHART_LIVE_PAINT_FALLBACK_MS[\s\S]*requestAnimationFrame\(flushCanonicalLivePaint\)/,
    'the hidden retained bridge must pair its fast frame with a bounded timeout fallback',
  );
  const retainedLivePaintStart = chartSource.indexOf(
    'IMPORTANT LIVE-CANDLE / LIVE-PRICE-LINE CONTRACT',
  );
  const retainedLivePaintEnd = chartSource.indexOf('// Effect 2', retainedLivePaintStart);
  assert.notEqual(retainedLivePaintStart, -1, 'retained live-paint contract start was not found');
  assert.notEqual(retainedLivePaintEnd, -1, 'retained live-paint contract end was not found');
  const retainedLivePaintSource = chartSource.slice(
    retainedLivePaintStart,
    retainedLivePaintEnd,
  );
  assert.doesNotMatch(
    retainedLivePaintSource,
    /chartRuntimeActive|chartDataActive/,
    'the selected-symbol candle+Bid bridge must continue atomically while Chart is hidden',
  );
  assert.match(
    retainedLivePaintSource,
    /updateMode !== 'full_reload'[\s\S]*updateChartData\([\s\S]*preserveVisibleLogicalSpan: \$\{!resetVisibleRange\}[\s\S]*resetVisibleRange: \$\{resetVisibleRange\}[\s\S]*updateLiveTick\(/,
    'a rare hidden full-series replacement must catch up before the retained Chart can be revealed',
  );
  assert.doesNotMatch(
    chartSource,
    /const chartLiveQuote = useLiveSymbolQuote\(chartSymbol, chartSurfaceReady,/,
    'the large Chart host quote hook must stay route-gated while hidden',
  );
  assert.match(
    chartSource,
    /const chartMarketDataCacheNamespace = isPublicDemoMarket[\s\S]*ORRNN_DEMO_PUBLIC_CACHE_NAMESPACE[\s\S]*const chartTradeDisplayQuoteScopeKey =[\s\S]*chartMarketDataCacheNamespace[\s\S]*chartSymbol\.trim\(\)\.toUpperCase\(\)[\s\S]*const retainedChartTradeDisplayQuoteRef = useRef<ExactChartQuoteSnapshot \| null>\(null\)/,
    'retained footer prices must be scoped to the active market namespace and symbol',
  );
  assert.match(
    chartSource,
    /const chartTradeFooterFallbackBid =[\s\S]*retainedChartTradeDisplayQuote\?\.bid \?\? 0[\s\S]*const chartTradeFooterFallbackAsk =[\s\S]*retainedChartTradeDisplayQuote\?\.ask \?\? 0/,
    'inactive footers must render retained numeric prices without authorizing execution',
  );
  assert.doesNotMatch(
    chartSource,
    /const chartTradeFooterFallback(?:Bid|Ask) =[\s\S]{0,160}Number\.isFinite\(chart(?:Bid|Ask)\)/,
    'a quote from the previous hook render must not migrate into a new session or symbol scope',
  );
  assert.match(chartSource, /const refreshShowOnChartSources = useCallback\(\(\) => \{[\s\S]*if \(!chartRuntimeActive\) \{[\s\S]*return;[\s\S]*\}/);
  assert.match(chartSource, /scheduleIdleWork\([\s\S]*refreshShowOnChartSources\(\);[\s\S]*requestChartViewportRecovery\(3\);[\s\S]*delayMs: CHART_FOCUS_WORK_DELAY_MS/);
  assert.match(chartSource, /const hasPaintedCurrentChartContext =[\s\S]*lastPaintedChartDataContextSig === chartDataContextSig/);
  assert.match(chartSource, /const hasUsableRetainedChart =[\s\S]*\(hasPaintedCurrentChartContext \|\| hasPreactivatedCurrentChartContext\)[\s\S]*&& webViewReady[\s\S]*&& chartCanvasReady/);
  assert.match(chartSource, /const shouldShowChartLoadingOverlay =[\s\S]*!hasUsableRetainedChart &&[\s\S]*!hasChartDataError &&[\s\S]*\(!chartSurfaceReady \|\| isLoading \|\| candlesAvailable\)/);
  assert.match(chartSource, /\{shouldShowChartLoadingOverlay && \(/);
  assert.match(chartSource, /\{chartSurfaceReady \? \(\s*<WebView/);
  assert.match(chartSource, /<LiveQuotePairHeader[\s\S]*bid=\{chartBid\}[\s\S]*ask=\{chartAsk\}/);
  const retainedChartTradeFooters =
    chartSource.match(/<ChartTradeInlineFooter[\s\S]*?\/>/g) ?? [];
  assert.equal(retainedChartTradeFooters.length, 3);
  retainedChartTradeFooters.forEach((footerSource) => {
    assert.match(
      footerSource,
      /active=\{chartRuntimeActive\}/,
      'each Buy/Sell footer must stop React quote commits while Chart is hidden',
    );
    assert.match(
      footerSource,
      /fallbackBid=\{chartTradeFooterFallbackBid\}[\s\S]*fallbackAsk=\{chartTradeFooterFallbackAsk\}/,
      'each inactive Buy/Sell footer must retain display-only numeric prices',
    );
  });
  assert.match(
    chartSource,
    /<ChartTradeButtons[\s\S]*?variant='mt5-market'[\s\S]*?active=\{chartRuntimeActive\}[\s\S]*?fallbackBid=\{chartTradeFooterFallbackBid\}[\s\S]*?fallbackAsk=\{chartTradeFooterFallbackAsk\}/,
    'the hidden legacy trade-sheet button must remain route-gated and session-scoped',
  );
  // Host instances mount outside any navigator screen, where useIsFocused()
  // is always true — hosted instances must trust only hostedActive.
  assert.match(priceAlertsSource, /const isScreenFocused = hosted \? hostedActive : navigationFocused/);
  assert.match(priceAlertsSource, /useAlertsQuery\(\{[\s\S]*enabled: isScreenFocused/);
  assert.match(chartSpecificationSource, /const isScreenFocused = useIsFocused\(\)/);
  assert.match(chartSpecificationSource, /useInstrumentMeta\(currentSymbol, isScreenFocused\)/);
  assert.match(chartSpecificationSource, /useMarketStatus\(currentSymbol, isScreenFocused\)/);
});

test('settings, trade, and history screens pause work when another screen is focused', () => {
  const accountsSource = readSource('src/features/settings/AccountsScreen.tsx');
  const settingsSource = readSource('src/features/settings/SettingsScreen/SettingsScreen.tsx');
  const tradeSource = readSource('src/features/trade/TradeScreen/TradeScreen.tsx');
  const historySource = readSource('src/features/history/HistoryScreen.tsx');
  const tradePositionRowSource = readSource('src/ui/components/TradePositionRow/TradePositionRow.tsx');
  const livePositionMetricsSource = readSource('src/features/trade/livePositionMetrics.ts');
  const tradeSummarySource = readSource('src/features/trade/TradeScreen/SummaryHeader.tsx');
  const calendarSource = readSource('src/features/settings/EconomicCalendarScreen/EconomicCalendarScreen.tsx');
  const healthSource = readSource('src/query/health.ts');
  const accountsQuerySource = readSource('src/query/accounts.ts');

  assert.match(accountsSource, /const isScreenFocused = useIsFocused\(\)/);
  assert.match(accountsSource, /const ACCOUNTS_SCREEN_DATA_DELAY_MS = 650/);
  assert.match(accountsSource, /const \[firstPaintReady, setFirstPaintReady\] = React\.useState\(false\)/);
  assert.match(accountsSource, /const focusDataActive = useDeferredActiveFlag\(\s*isLoggedIn && isScreenFocused && firstPaintReady,\s*ACCOUNTS_SCREEN_DATA_DELAY_MS,\s*\)/);
  // A BOUNDED boot prewarm window may fill the caches once while hidden so the
  // first open shows real content; it must switch itself off so focus remains
  // the only long-lived activator of these queries.
  assert.match(accountsSource, /const ACCOUNTS_DATA_PREWARM_WINDOW_MS = 15000/);
  assert.match(accountsSource, /setDataPrewarmWindowActive\(false\),?\s*\)?,?\s*ACCOUNTS_DATA_PREWARM_DELAY_MS \+ ACCOUNTS_DATA_PREWARM_WINDOW_MS/);
  assert.match(accountsSource, /const screenDataActive = focusDataActive \|\| \(isLoggedIn && dataPrewarmWindowActive\)/);
  // Contract v3: GET /accounts is 403 for traders and /api/mt5/* does not exist.
  assert.doesNotMatch(accountsSource, /useAccounts\(|useMt5Status\(/);
  assert.match(accountsSource, /useBrokerConfig\(brokerId, screenDataActive\)/);
  assert.match(accountsSource, /useAccountDetails\(activeLogin, screenDataActive && !!activeLogin\)/);
  assert.match(accountsSource, /useHealth\(screenDataActive\)/);
  // The retained Accounts body is prepared while hidden, like the mounted
  // Trade tab, so opening the drawer destination does not mount a FlatList in
  // the tap turn. Network/live work below must still remain focus-gated.
  assert.match(accountsSource, /useDeferredRouteContentReady\(\s*isScreenFocused \? 0 : ACCOUNTS_BODY_PREWARM_DELAY_MS,/);
  assert.match(accountsSource, /const showAccountsBody = isScreenFocused \|\| hostBodyReady;/);
  assert.match(accountsSource, /\{showAccountsBody \? \(\s*<FlatList/);
  assert.doesNotMatch(accountsSource, /focusedBodyReady|accountsBodyVisible|accountsBodyReady|SidebarHostedAccountsScreenInner/);
  assert.match(accountsSource, /const focusDataActive = useDeferredActiveFlag\(\s*isLoggedIn && isScreenFocused && firstPaintReady,/);
  assert.match(accountsSource, /const liveQuoteDataActive = isScreenFocused && screenDataActive && liveMatchesActiveAccount/);
  assert.match(accountsSource, /useUIState\.getState\(\)\.hideAccountsActionSheet\(\)/);
  assert.match(accountsSource, /\{isScreenFocused \? <AccountsActionSheetHost \/> : null\}/);

  assert.match(settingsSource, /import \{ useIsFocused \} from '@react-navigation\/native'/);
  assert.match(settingsSource, /import \{ useNextFrameValue \} from '\.\.\/\.\.\/\.\.\/hooks\/useNextFrameValue'/);
  assert.match(settingsSource, /const SettingsScreenInner = memo\(function SettingsScreenInner\(\{ isScreenFocused \}: \{ isScreenFocused: boolean \}\)/);
  assert.match(settingsSource, /export function SettingsScreen\(\) \{\s*const isScreenFocused = useIsFocused\(\);\s*const deferredScreenFocused = useNextFrameValue\(isScreenFocused\);\s*return <SettingsScreenInner isScreenFocused=\{deferredScreenFocused\} \/>;\s*\}/);
  assert.match(settingsSource, /const SETTINGS_SCREEN_DATA_DELAY_MS = 8000/);
  assert.doesNotMatch(settingsSource, /SETTINGS_BODY_PREWARM_DELAY_MS|routeBodyReady|useDeferredRouteContentReady/);
  assert.match(settingsSource, /<ScrollView[\s\S]*style=\{styles\.container\}[\s\S]*contentContainerStyle=\{styles\.content\}/);
  assert.match(settingsSource, /const \[firstPaintReady, setFirstPaintReady\] = useState\(false\)/);
  assert.doesNotMatch(settingsSource, /sidebarOpen = useUIState/);
  assert.match(settingsSource, /const settingsDataActive = useDeferredActiveFlag\(\s*isAccountConnected && isScreenFocused && firstPaintReady,\s*SETTINGS_SCREEN_DATA_DELAY_MS,\s*\)/);
  assert.doesNotMatch(settingsSource, /useAccounts\(settingsDataActive\)/);
  assert.match(settingsSource, /useAccountDetails\(activeLogin, settingsDataActive && !!activeLogin\)/);
  assert.doesNotMatch(settingsSource, /const settingsDataActive = isAccountConnected && isScreenFocused/);

  assert.match(tradeSource, /import \{ useIsFocused \} from '@react-navigation\/native'/);
  assert.match(tradeSource, /import \{ useNextFrameValue \} from '\.\.\/\.\.\/\.\.\/hooks\/useNextFrameValue'/);
  assert.match(tradeSource, /const TradeScreenInner = React\.memo\(function TradeScreenInner\(\{\s*isScreenFocused,\s*isLiveScreenFocused,\s*\}: \{\s*isScreenFocused: boolean;\s*isLiveScreenFocused: boolean;\s*\}\)/);
  assert.match(tradeSource, /export function TradeScreen\(\) \{\s*const isScreenFocused = useIsFocused\(\);\s*const isLiveScreenFocused = useNextFrameValue\(isScreenFocused\);[\s\S]*isScreenFocused=\{isScreenFocused\}[\s\S]*isLiveScreenFocused=\{isLiveScreenFocused\}/);
  assert.match(tradeSource, /const TRADE_INITIAL_POSITION_RENDER_COUNT = 5/);
  assert.match(tradeSource, /const TRADE_POSITION_RENDER_BATCH_SIZE = 5/);
  assert.match(tradeSource, /const TRADE_SCREEN_FETCH_DELAY_MS = 0/);
  assert.match(tradeSource, /const TRADE_SCREEN_REFRESH_INTERVAL_MS = 3000/);
  // The native fast-tab layer is revealed before React Navigation focus. The
  // complete structural body must therefore already exist in the retained tab.
  assert.doesNotMatch(tradeSource, /TRADE_BODY_PREWARM_DELAY_MS|routeBodyReady|showTradeBody|useDeferredRouteContentReady/);
  assert.match(tradeSource, /<AppHeader title=\{t\('Trade'\)\} noBorder \/>[\s\S]*<TradeSummaryHeader[\s\S]*<FlatList/);
  assert.match(tradeSource, /const \[firstPaintReady, setFirstPaintReady\] = useState\(false\)/);
  assert.doesNotMatch(tradeSource, /sidebarOpen = useUIState/);
  // Live quote subscriptions activate immediately on the focused Trade tab;
  // the heavier backend ledger refresh still waits until after first paint.
  assert.match(tradeSource, /const tradeLiveActive = isLiveScreenFocused/);
  assert.match(tradeSource, /const tradeFetchActive = useDeferredActiveFlag\(isScreenFocused && firstPaintReady, TRADE_SCREEN_FETCH_DELAY_MS\)/);
  // A retained hidden Trade tab must not follow feed-health or price/P&L tick
  // mutations. Structural ledger changes do update it so first reveal is ready.
  assert.match(tradeSource, /const retainedFeedHealthRef = useRef\(getFeedHealthRenderSnapshot\(\)\)/);
  assert.match(tradeSource, /const subscribeFocusedFeedHealth = useCallback\([\s\S]*isLiveScreenFocused \? subscribeFeedHealth\(listener\) : \(\) => undefined/);
  assert.match(tradeSource, /const getFocusedFeedHealthSnapshot = useCallback\([\s\S]*isLiveScreenFocused \? getFeedHealthRenderSnapshot\(\) : retainedFeedHealthRef\.current/);
  assert.match(tradeSource, /React\.useSyncExternalStore\(\s*subscribeFocusedFeedHealth,\s*getFocusedFeedHealthSnapshot,\s*getFocusedFeedHealthSnapshot,?\s*\)/);
  assert.doesNotMatch(tradeSource, /React\.useSyncExternalStore\(\s*subscribeFeedHealth/);
  assert.doesNotMatch(tradeSource, /retainedTradeLedgerRef|RetainedTradeLedger/);
  assert.match(tradeSource, /positionsSignature: buildOpenPositionsCacheSignature\(state\.positions\)/);
  assert.match(tradeSource, /const positions = useMemo\(\s*\(\) => usePositionsState\.getState\(\)\.positions,\s*\[hydratedLogin, isScreenFocused, lastFetchLogin, positionsSignature\],\s*\)/);
  assert.match(tradeSource, /const refreshPositions = usePositionsState\(\(state\) => state\.refreshPositions\)/);
  assert.match(tradeSource, /const hydrateCachedPositions = usePositionsState\(\(state\) => state\.hydrateCachedPositions\)/);
  assert.match(tradeSource, /const primePositionSnapshot = usePositionsState\(\(state\) => state\.primePositionSnapshot\)/);
  assert.match(tradeSource, /void hydrateCachedPositions\(String\(resolvedLogin\)\)/);
  assert.match(tradeSource, /if \(!tradeFetchActive \|\| !resolvedLogin\) \{/);
  assert.match(tradeSource, /refreshVisibleTradeLedger\(\);[\s\S]*setInterval\(refreshVisibleTradeLedger, TRADE_SCREEN_REFRESH_INTERVAL_MS\)/);
  assert.match(tradeSource, /clearInterval\(refreshIntervalId\)/);
  assert.match(tradeSource, /const positionRowsActive = tradeLiveActive/);
  assert.doesNotMatch(tradeSource, /const liveQuotes = useLiveSymbolQuotes\(liveQuoteSymbols, tradeLiveActive, 0\)/);
  assert.doesNotMatch(tradeSource, /quotesWsService\.setSubscriptions/);
  assert.doesNotMatch(tradeSource, /if \(isScreenFocused && resolvedLogin\) \{/);
  assert.doesNotMatch(tradeSource, /liveQuotePositions=\{livePositionRows\}/);
  assert.match(tradeSource, /<TradeSummaryHeader[\s\S]*active=\{tradeLiveActive\}/);
  assert.doesNotMatch(tradeSource, /<TradeSummaryHeader[\s\S]*liveQuotes=\{liveQuotes\}/);
  assert.match(tradeSource, /<TradePositionRow[\s\S]*active=\{rowActive\}/);
  assert.doesNotMatch(tradeSource, /<TradePositionRow[\s\S]*liveQuote=\{resolveTradeRowLiveQuote\(liveQuotes, item\.symbol\)\}/);
  assert.match(tradeSource, /initialNumToRender=\{TRADE_INITIAL_POSITION_RENDER_COUNT\}/);
  assert.match(tradeSource, /maxToRenderPerBatch=\{TRADE_POSITION_RENDER_BATCH_SIZE\}/);
  assert.match(tradeSource, /onViewableItemsChanged=\{handleViewablePositionRowsChanged\}/);
  assert.match(tradeSource, /extraData=\{flatListExtraData\}/);
  assert.doesNotMatch(tradeSource, /const rowExtraData = useMemo/);
  assert.match(tradePositionRowSource, /active = true/);
  assert.match(tradePositionRowSource, /active\?: boolean/);
  assert.doesNotMatch(tradePositionRowSource, /liveQuote\?: Partial<QuoteItem>|liveQuoteOverride/);
  assert.match(tradePositionRowSource, /const liveQuote = useLiveSymbolQuote\(item\.symbol, active, 0\)/);
  assert.match(livePositionMetricsSource, /function resolveLivePositionPnlDecimals\(value: number\): number/);
  assert.match(livePositionMetricsSource, /absValue < 1\) \{[\s\S]*return 5/);
  assert.match(tradePositionRowSource, /formatLivePositionPnl\(displayPnl\)/);
  assert.doesNotMatch(tradePositionRowSource, /fmt\.pnlPrecise\(displayPnl\)/);
  assert.doesNotMatch(tradePositionRowSource, /useLiveSymbolQuote\(item\.symbol\)/);
  assert.doesNotMatch(tradePositionRowSource, /tickFlash|pnlFlashStyle|interpolateColor/);
  assert.match(tradeSummarySource, /active: boolean/);
  assert.doesNotMatch(tradeSummarySource, /liveQuotePositions\?: PositionItem\[\]/);
  assert.match(tradeSummarySource, /positions\.map\(\(position\) => position\.symbol\)/);
  // Rows and summary subscribe directly to the per-symbol websocket listener so
  // TradeScreen itself does not re-render the FlatList on every quote tick.
  // The quote stream stays gated by `active`; the commit interval is a
  // parameter so the always-mounted tab-bar P/L badge can throttle it.
  assert.match(tradeSummarySource, /useLiveSymbolQuotes\(liveQuoteSymbols, active, quoteCommitIntervalMs\)/);
  assert.match(readSource('src/api/ws/quotesSocket/flushPipeline.ts'), /const QUOTE_STORE_FLUSH_INTERVAL_MS = 16/);
  assert.doesNotMatch(tradeSummarySource, /pulseAnim|Animated\.loop|Animated\.Text/);

  assert.match(historySource, /import \{ useIsFocused \} from '@react-navigation\/native'/);
  assert.match(historySource, /import \{ useNextFrameValue \} from '\.\.\/\.\.\/hooks\/useNextFrameValue'/);
  assert.match(historySource, /const HistoryScreenInner = memo\(function HistoryScreenInner\(\{ isScreenFocused \}: \{ isScreenFocused: boolean \}\)/);
  assert.match(historySource, /export function HistoryScreen\(\) \{\s*const isScreenFocused = useIsFocused\(\);\s*const deferredScreenFocused = useNextFrameValue\(isScreenFocused\);\s*return <HistoryScreenInner isScreenFocused=\{deferredScreenFocused\} \/>;\s*\}/);
  assert.match(historySource, /const historyDataActive = useDeferredActiveFlag\(isScreenFocused\)/);
  assert.match(historySource, /usePositionHistoryQuery\(accountLogin, \{\s*enabled: historyDataActive/);
  assert.match(historySource, /useAccountDealsQuery\(\{[\s\S]*enabled: historyDataActive/);
  assert.match(historySource, /useOrdersByLoginQuery\(accountLogin, \{\s*enabled: historyDataActive/);

  assert.match(calendarSource, /const isScreenFocused = useIsFocused\(\)/);
  assert.match(calendarSource, /getInitialEconomicCalendarData/);
  assert.match(calendarSource, /const initialEvents = useMemo\(\(\) => getInitialEconomicCalendarData\(\), \[\]\)/);
  assert.match(calendarSource, /const \[dataEvents, setDataEvents\] = useState<EconomicEvent\[\]>\(initialEvents\)/);
  assert.match(calendarSource, /if \(!isScreenFocused\) \{[\s\S]*return;[\s\S]*\}/);
  assert.doesNotMatch(calendarSource, /CALENDAR_INITIAL_DATA_DELAY_MS|calendarDataReady/);
  assert.match(calendarSource, /const ECON_CALENDAR_BODY_PREWARM_DELAY_MS = 0/);
  assert.match(calendarSource, /const routeBodyReady = useDeferredRouteContentReady\(\s*isScreenFocused \? 0 : ECON_CALENDAR_BODY_PREWARM_DELAY_MS,\s*\)/);
  assert.doesNotMatch(calendarSource, /const focusedBodyReady = isScreenFocused && routeBodyReady;/);
  assert.match(calendarSource, /\{routeBodyReady \? <>/);
  // One bounded idle prewarm is the only work the hidden calendar shell may do:
  // it fills the event cache once, well after boot, so the FIRST sidebar visit
  // reveals real rows (MT5 parity) instead of fetching on focus.
  assert.match(calendarSource, /const ECON_CALENDAR_IDLE_PREWARM_DELAY_MS = 6000/);
  assert.match(calendarSource, /const prewarmTimer = setTimeout\(\(\) => \{\s*fetchEconomicCalendarData\(\)/);
  assert.match(calendarSource, /\}, ECON_CALENDAR_IDLE_PREWARM_DELAY_MS\);\s*return \(\) => clearTimeout\(prewarmTimer\);/);

  assert.match(healthSource, /export function useHealth\(enabled = true\)/);
  assert.match(healthSource, /const isEnabled = enabled && Boolean\(session\)/);
  assert.match(healthSource, /refetchInterval: isEnabled \? 30000 : false/);
  assert.match(accountsQuerySource, /const isEnabled = Boolean\(session\) && \(enabled \?\? true\)/);
  assert.doesNotMatch(accountsQuerySource, /export function useAccounts\(/);
  assert.match(accountsQuerySource, /refetchInterval: isEnabled \? 30 \* 1000 : false/);
});

test('high-volume diagnostics are disabled unless explicitly requested', () => {
  const accountsSource = readSource('src/features/settings/AccountsScreen.tsx');
  const accountsApiSource = readSource('src/api/accounts.ts');
  const quotesWsSource = readSource('src/api/ws/quotesSocket/QuotesWebSocketService.ts');
  const apiLatencySource = readSource('src/utils/apiLatency.ts');
  const positionsApiSource = readSource('src/api/positions/index.ts');
  const closedHistorySource = readSource('src/api/positions/closedHistory.ts');
  const positionsStateSource = readSource('src/state/positionsState.ts');
  const accountWsSource = readSource('src/api/ws/accountSocket.ts');

  assert.doesNotMatch(accountsSource, /logAccountsScreenDiagnostic/);
  assert.doesNotMatch(accountsSource, /console\.log\('\[AccountsScreen\]/);
  assert.doesNotMatch(accountsSource, /EXPO_PUBLIC_DEBUG_ACCOUNTS_SCREEN/);

  // The GET /accounts list (and its debug log) was removed: contract v3 returns
  // 403 for traders. The singular detail path never logs account payloads.
  assert.doesNotMatch(accountsApiSource, /console\.log\(/);
  assert.doesNotMatch(accountsApiSource, /Raw backend response:|Mapped accounts:/);

  assert.match(quotesWsSource, /EXPO_PUBLIC_DEBUG_CANDLE_FEED === 'true'/);
  assert.doesNotMatch(quotesWsSource, /typeof __DEV__ === 'undefined' \|\| __DEV__/);

  assert.match(apiLatencySource, /EXPO_PUBLIC_DEBUG_API_LATENCY === 'true'/);
  assert.match(apiLatencySource, /severity !== 'ok' \|\| API_LATENCY_LOG_OK_RESPONSES/);
  assert.match(apiLatencySource, /if \(shouldLogApiLatency\(severity\)\) \{/);

  assert.match(positionsApiSource, /EXPO_PUBLIC_DEBUG_POSITIONS_API === 'true'/);
  assert.match(positionsApiSource, /logPositionsApiDiagnostic\('\[PositionsAPI\] GET'/);
  assert.doesNotMatch(positionsApiSource, /console\.log\('\[PositionsAPI\]/);
  assert.doesNotMatch(closedHistorySource, /Response json:|Parsed rows length:|JSON\.stringify\(json\)/);
  assert.match(positionsStateSource, /EXPO_PUBLIC_DEBUG_POSITIONS_STATE === 'true'/);
  assert.match(positionsStateSource, /positionsRateLimitUntilByNamespace/);
  assert.match(positionsStateSource, /positionsRefreshInFlightByLogin/);
  assert.match(positionsStateSource, /pendingPositionsRefreshLogins/);
  assert.match(accountWsSource, /EXPO_PUBLIC_DEBUG_ACCOUNT_WS === 'true'/);
  assert.match(accountWsSource, /logAccountWsDiagnostic\('\[Account WS\] Connected'\)/);
  assert.doesNotMatch(accountWsSource, /console\.log\('\[Account WS\]/);
});

test('shared fast press uses the native responder press recognizer', () => {
  const fastPressSource = readSource('src/ui/components/FastPressable.tsx');

  assert.match(fastPressSource, /from 'react-native'/);
  assert.match(fastPressSource, /type GestureResponderEvent/);
  assert.match(fastPressSource, /type FastPressEvent = GestureResponderEvent/);
  assert.match(fastPressSource, /const normalizePressEvent = \(event: FastPressEvent\) => \{/);
  assert.match(fastPressSource, /eventWithResponderControls\.stopPropagation \?\?= \(\) => undefined/);
  assert.doesNotMatch(fastPressSource, /react-native-gesture-handler/);
});
