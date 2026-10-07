import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildChartSeriesSnapshot,
  getChartSeriesUpdateMode,
} from '../../src/features/chart/liveChartSync';
import {
  assertSourceContains,
  extractFunctionBody,
  readChartScreenSource,
} from '../support/chartSourceTestUtils';
import { makeCandle } from '../support/candleTestUtils';

const source = readChartScreenSource();

const extractAssignedFunctionBody = (functionName: string): string => {
  const functionStart = source.indexOf(`var ${functionName} = function`);
  assert.notEqual(functionStart, -1, `${functionName} assigned function was not found`);
  const openBrace = source.indexOf('{', functionStart);
  assert.notEqual(openBrace, -1, `${functionName} has no opening brace`);

  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openBrace + 1, index);
      }
    }
  }

  assert.fail(`${functionName} body was not closed`);
};

test('active candle changes use incremental updateTick mode', () => {
  const current = buildChartSeriesSnapshot([
    makeCandle(60, { close: 1.1 }),
    makeCandle(120, { close: 1.2 }),
  ]);
  const next = buildChartSeriesSnapshot([
    makeCandle(60, { close: 1.1 }),
    makeCandle(120, { close: 1.25, high: 1.25 }),
  ]);

  assert.equal(getChartSeriesUpdateMode(current, next), 'incremental');
});

test('new candle appended cleanly uses incremental updateTick mode', () => {
  const current = buildChartSeriesSnapshot([
    makeCandle(60, { close: 1.1 }),
    makeCandle(120, { close: 1.2 }),
  ]);
  const next = buildChartSeriesSnapshot([
    makeCandle(60, { close: 1.1 }),
    makeCandle(120, { close: 1.2 }),
    makeCandle(180, { close: 1.3 }),
  ]);

  assert.equal(getChartSeriesUpdateMode(current, next), 'incremental');
});

test('older history correction forces updateChartData full reload', () => {
  const current = buildChartSeriesSnapshot([
    makeCandle(60, { close: 1.1 }),
    makeCandle(120, { close: 1.2 }),
    makeCandle(180, { close: 1.3 }),
  ]);
  const next = buildChartSeriesSnapshot([
    makeCandle(60, { close: 1.1 }),
    makeCandle(120, { close: 1.22, high: 1.22 }),
    makeCandle(180, { close: 1.3 }),
  ]);

  assert.equal(getChartSeriesUpdateMode(current, next), 'full_reload');
});

test('symbol timeframe switches repaint data while visual shell changes reinit', () => {
  assertSourceContains(
    source,
    /const currentSig = useMemo\([\s\S]*chartType[\s\S]*chartColorsSignature/,
    'init signature must keep visual shell settings',
  );
  assertSourceContains(
    source,
    /const chartDataContextSig = useMemo\([\s\S]*chartSymbol[\s\S]*normalizeTimeframe\(chartTimeframe\)/,
    'symbol and timeframe must be tracked as a data context',
  );
  assertSourceContains(
    source,
    /if \(lastInitSigRef\.current !== currentSig\)[\s\S]*chartInitializedRef\.current = false/,
    'visual shell signature changes must mark the WebView chart as not initialized',
  );
  assertSourceContains(
    source,
    /const contextChanged = renderedDataContextSigRef\.current !== chartDataContextSig[\s\S]*const updateMode = contextChanged[\s\S]*\? 'full_reload'/,
    'symbol/timeframe changes must repaint with updateChartData instead of reinitializing the WebView',
  );
});

test('ChartScreen reserves React series commits for full reloads and uses the direct engine for live paints', () => {
  const fullReloadEffectStart = source.indexOf('// Effect 2');
  assert.notEqual(fullReloadEffectStart, -1, 'full-series sync effect marker was not found');
  const syncEffectStart = source.indexOf('const nextSnapshot = buildChartSeriesSnapshot', fullReloadEffectStart);
  assert.notEqual(syncEffectStart, -1, 'series sync effect was not found');
  const syncEffect = source.slice(syncEffectStart, source.indexOf('useEffect(() => {', syncEffectStart + 1));

  assertSourceContains(
    syncEffect,
    /updateMode === 'noop' \|\| updateMode === 'incremental'[\s\S]*return;[\s\S]*updateChartData\(/,
    'the slow series effect must skip live deltas and call updateChartData only for a full reload',
  );
  assert.doesNotMatch(
    syncEffect,
    /updateTick\(|updateLiveTick\(/,
    'the throttled React series effect must not repaint a live candle after the direct engine path',
  );
  assertSourceContains(
    source,
    /const canonicalCandles = readRenderableCanonicalCandles\(\);[\s\S]*const baseRenderableCandles = resolveContextScopedChartCandles\([\s\S]*chartDataContextSig,[\s\S]*canonicalCandles,[\s\S]*contextKey: candlesRefContextSigRef\.current,[\s\S]*candles: candlesRef\.current,[\s\S]*const replacementProjection = projectChartLiveTickCandles\([\s\S]*const renderableCandles = replacementProjection\.candles/,
    'full reload mode must prefer canonical data, accept fallback data only from the active context, and preserve the newer projected Bid candle',
  );
  assertSourceContains(
    source,
    /const paintCanonicalLiveTick = \(allowUnchangedSnapshot = false\) => \{[\s\S]*const canonicalCandles = readRenderableCanonicalCandles\(\)[\s\S]*projectChartLiveTickCandles\([\s\S]*updateLiveTick\([\s\S]*const scheduleCanonicalLivePaint =[\s\S]*flushCanonicalLivePaint\(\);[\s\S]*liveCandlesEngine\.subscribe\(\s*chartSymbol,\s*chartTimeframe,\s*scheduleCanonicalLivePaint/,
    'resume and steady live paints must bypass the 400 ms React commit while sharing the projected atomic WebView path',
  );
});

test('direct engine full reload acknowledges the selected chart context paint', () => {
  const directPaintStart = source.indexOf('const paintCanonicalLiveTick =');
  assert.notEqual(directPaintStart, -1, 'direct canonical paint function was not found');
  const directPaintEnd = source.indexOf('// Route resume', directPaintStart);
  assert.notEqual(directPaintEnd, -1, 'direct canonical paint function end marker was not found');
  const directPaint = source.slice(directPaintStart, directPaintEnd);

  assertSourceContains(
    directPaint,
    /const resetForClosedMarketClamp = shouldResetViewportForClosedMarketClamp\([\s\S]*const resetForHistorylessBootstrap = shouldResetViewportForHistorylessBootstrap\([\s\S]*chartHasHistoryCandles,[\s\S]*const resetVisibleRange = resetForClosedMarketClamp \|\| resetForHistorylessBootstrap/,
    'a direct full reload must reset closed-tail clamps and the historyless bootstrap handoff while preserving ordinary reload spans',
  );
  assertSourceContains(
    directPaint,
    /if \([\s\S]*updateMode === 'full_reload'[\s\S]*\|\| renkoUpdateMode === 'full_reload'[\s\S]*\|\| resetForHistorylessBootstrap[\s\S]*issuedPaintToken = issueChartDataPaintToken\([\s\S]*chartDataContextSig,[\s\S]*chartHasHistoryCandles,[\s\S]*\);[\s\S]*updateChartData\([\s\S]*preserveVisibleLogicalSpan: \$\{!resetVisibleRange\},[\s\S]*resetVisibleRange: \$\{resetVisibleRange\},[\s\S]*paintToken: \$\{JSON\.stringify\(issuedPaintToken\)\}/,
    'the history-backed bootstrap reset must force updateChartData even when the expansion otherwise looks incremental',
  );
  assertSourceContains(
    directPaint,
    /const usableHistoryPaintAlreadyPending =[\s\S]*resetForHistorylessBootstrap[\s\S]*pendingChartDataPaintRef\.current\.confirmsUsableChart[\s\S]*pendingChartDataPaintRef\.current\.dataContextSig === chartDataContextSig[\s\S]*if \(usableHistoryPaintAlreadyPending\) \{[\s\S]*return;/,
    'a reset-owning usable paint token must not be replaced before its acknowledgement arrives',
  );
  assertSourceContains(
    directPaint,
    /webViewRef\.current\.injectJavaScript\([\s\S]*if \(!chartHasHistoryCandles\) \{[\s\S]*historylessBootstrapViewportRef\.current = \{/,
    'live-only updates must keep the historyless marker armed after injection',
  );
  assert.doesNotMatch(
    directPaint,
    /historylessBootstrapViewportRef\.current = EMPTY_HISTORYLESS_BOOTSTRAP_VIEWPORT/,
    'the direct injection path must not consume reset ownership before a paint acknowledgement',
  );
  assertSourceContains(
    source,
    /msg\.type === 'CHART_DATA_PAINTED'[\s\S]*if \(!pendingPaint\.confirmsUsableChart\)[\s\S]*paintedCandles\.length === 0[\s\S]*historylessBootstrapViewportRef\.current\.contextKey[\s\S]*=== paintedDataContextSig[\s\S]*historylessBootstrapViewportRef\.current =[\s\S]*EMPTY_HISTORYLESS_BOOTSTRAP_VIEWPORT/,
    'only an accepted usable paint acknowledgement may consume historyless reset ownership',
  );
  assertSourceContains(
    directPaint,
    /catch \(_e\) \{[\s\S]*pendingChartDataPaintRef\.current\.token === issuedPaintToken[\s\S]*pendingChartDataPaintRef\.current = \{[\s\S]*token: '',[\s\S]*dataContextSig: '',[\s\S]*confirmsUsableChart: false,[\s\S]*\}/,
    'a failed direct full reload injection must clear only its own pending paint token',
  );
  assertSourceContains(
    source,
    /const paintCanonicalLiveTick =[\s\S]*issueChartDataPaintToken,[\s\S]*readRenderableCanonicalCandles,[\s\S]*\]\);/,
    'the direct candle listener must refresh if the paint-token issuer changes',
  );
  assertSourceContains(
    source,
    /const emptyPaintToken = issueChartDataPaintToken\(chartDataContextSig, false\)/,
    'clearing stale symbol data must never count as a usable chart paint',
  );
  assertSourceContains(
    source,
    /const replacementProjection = projectChartLiveTickCandles\([\s\S]*issueChartDataPaintToken\([\s\S]*chartDataContextSig,[\s\S]*chartHasHistoryCandles,[\s\S]*\)/,
    'React history replacement must carry committed-history eligibility into its paint token',
  );
});

test('display precision updates on the existing WebView chart surface', () => {
  const setDisplayDecimalsBody = extractFunctionBody(source, 'setDisplayDecimals');

  assertSourceContains(
    setDisplayDecimalsBody,
    /lastRequestedDisplayDecimals = decimals[\s\S]*lastDisplayDecimals = decimals[\s\S]*makePriceFormat\(decimals\)/,
    'display precision updates must reuse the WebView price format helper',
  );
  assertSourceContains(
    setDisplayDecimalsBody,
    /series\.applyOptions\(\{ priceFormat: priceFormat \}\)/,
    'main series precision must update without recreating the chart',
  );
  assertSourceContains(
    setDisplayDecimalsBody,
    /isManualVerticalPanRangeLocked\(\)[\s\S]*applyManualVerticalPanLockedRange\(\)/,
    'symbol precision changes must reassert the same manually owned numeric window',
  );
  assertSourceContains(
    source,
    /window\.setDisplayDecimals = setDisplayDecimals/,
    'setDisplayDecimals must be exposed on the WebView bridge',
  );
});

test('WebView full data reload restores overlays and market price lines after setData', () => {
  const body = extractFunctionBody(source, 'updateChartData');

  assertSourceContains(source, /function updateChartData\(data, options\)/, 'full reloads must accept bridge options for stable context switches');
  assertSourceContains(body, /sanitizeSeriesData\(data\)/, 'full reload must sanitize and dedupe candle data before setData');
  assertSourceContains(body, /var updateOptions = options && typeof options === 'object' \? options : \{\}/, 'bridge options must be normalized before reload work');
  assertSourceContains(body, /var resetVisibleRange = updateOptions\.resetVisibleRange === true/, 'context switches must be able to request a fresh first viewport');
  assertSourceContains(body, /series\.setData\(mapped\)/, 'updateChartData must call setData');
  assertSourceContains(body, /previousRawSeriesData = lastRawSeriesData[\s\S]*getVisibleLogicalRangeSnapshot\(\)/, 'full reload must capture the current viewport before replacing data');
  assertSourceContains(body, /var restoredPrependedViewport =[\s\S]*!expandedAreaRecentViewport &&[\s\S]*!resetVisibleRange &&[\s\S]*restorePrependedHistoryViewport\([\s\S]*previousRawSeriesData[\s\S]*lastRawSeriesData[\s\S]*previousVisibleLogicalRange[\s\S]*\)/, 'ordinary history prepends must restore the prior visible viewport after setData');
  assertSourceContains(body, /var didPrependHistory =[\s\S]*!resetVisibleRange &&[\s\S]*previousRawSeriesData\.length > 0/, 'an explicit session reset must outrank pagination detection');
  assertSourceContains(body, /!restoredPrependedViewport &&[\s\S]*!resetVisibleRange &&[\s\S]*preserveVisibleLogicalSpan/, 'an explicit session reset must not preserve the removed tail logical span');
  assertSourceContains(body, /resetVisibleRange \|\| shouldResetViewportForSeriesReplacement\(previousRawSeriesData, lastRawSeriesData\)/, 'symbol/timeframe replacement reloads must force a fresh viewport even when timestamps match');
  assertSourceContains(source, /function resetVisiblePriceScaleForStableReplacement\(reason\)[\s\S]*clearFreshSeriesVerticalCenterState\(\)[\s\S]*enableRightPriceAutoScale\(\)/, 'stable replacement reset must avoid delayed fresh-series recenter work');
  assertSourceContains(body, /var manualRangeBeforeUpdate = isManualVerticalPanRangeLocked\(\)[\s\S]*!resetVisibleRange && isValidPriceRange\(manualRangeBeforeUpdate\)/, 'same-context full reloads must capture manual price-scale ownership before setData');
  assertSourceContains(body, /var shouldPreserveManualPriceScale =[\s\S]*!resetVisibleRange && isValidPriceRange\(manualRangeBeforeUpdate\);[\s\S]*if \(resetVisibleRange\) \{[\s\S]*clearManualPriceScaleState\(\);[\s\S]*!shouldPreserveManualPriceScale &&[\s\S]*if \(restoredStableReplacementViewport\) \{[\s\S]*resetVisiblePriceScaleForStableReplacement\(priceScaleReason\)[\s\S]*\} else \{[\s\S]*resetVisiblePriceScaleForFreshSeries\(priceScaleReason\)/, 'explicit context resets must clear an old manual price window before stable or fresh replacement autoscale');
  assertSourceContains(body, /if \(restoredStableReplacementViewport && !shouldPreserveManualPriceScale\) \{[\s\S]*healCollapsedPriceScaleRange\(priceScaleReason, true\)/, 'stable replacement may heal synchronously only while auto-scale owns the range');
  assertSourceContains(body, /if \(!restoredStableReplacementViewport && !shouldPreserveManualPriceScale\) \{[\s\S]*schedulePriceScaleHealthCheck\(/, 'manual ownership must suppress delayed price-scale health passes');
  assertSourceContains(body, /!restoredStableReplacementViewport[\s\S]*applyRecentViewport\(mapped\.length\)/, 'recent viewport spacing must be recalculated for fresh context replacements');
  assertSourceContains(source, /var retainedManualPriceScaleRange = !isNewDataContext && isManualVerticalPanRangeLocked\(\)[\s\S]*var retainedManualPriceScaleReferenceSpan =[\s\S]*!isNewDataContext &&/, 'a full WebView rebuild must not restore a manual numeric range from another symbol or timeframe');
  assertSourceContains(body, /previousRawSeriesData\.length === 0[\s\S]*applyRecentViewport\(mapped\.length\)/, 'first data load after an empty chart shell must show only the recent viewport');
  assertSourceContains(body, /_positionLinesArr = \[\]/, 'stale overlay refs must be cleared');
  assertSourceContains(body, /applyOverlayPayload\(_overlayPayload\)/, 'overlays must be reapplied after setData');
  assertSourceContains(body, /setLivePriceLine\(lastLivePrice\)/, 'live price line must be restored after setData');
});

test('WebView preserves scroll position when older history is prepended', () => {
  assertSourceContains(
    source,
    /function restorePrependedHistoryViewport\(previousData, nextData, previousRange\)[\s\S]*nextFirst < previousFirst[\s\S]*previousVisibleFromIndex = clampSeriesIndex\(Math\.floor\(previousRange\.from\), previousData\.length\)[\s\S]*shiftedBy = nextVisibleFromIndex - previousVisibleFromIndex[\s\S]*setVisibleLogicalRange\(\{[\s\S]*from: previousRange\.from \+ shiftedBy[\s\S]*to: previousRange\.to \+ shiftedBy/,
    'older-history setData reloads must shift the logical range by the number of prepended candles',
  );
});

test('WebView prefetches older history before the hard left edge', () => {
  assertSourceContains(
    source,
    /function shouldPaginateForVisibleLogicalRange\(range\)[\s\S]*HISTORY_PAGINATION_VIEWPORT_MULTIPLIER[\s\S]*return range\.from <= leftPrefetchBars/,
    'left-scroll pagination must be based on visible viewport span instead of waiting for a hard-coded edge',
  );
  assertSourceContains(
    source,
    /function requestHistoryPaginationForVisibleRange\(range\)[\s\S]*shouldPaginateForVisibleLogicalRange\(range\)[\s\S]*Date\.now\(\)[\s\S]*lastHistoryPaginationPostAt <= HISTORY_PAGINATION_DEBOUNCE_MS[\s\S]*ON_PAGINATE_HISTORY/,
    'visible-range subscription must request pagination through the debounced early-prefetch helper',
  );
  assertSourceContains(
    source,
    /subscribeVisibleLogicalRangeChange\(function\(range\)[\s\S]*requestHistoryPaginationForVisibleRange\(range\)/,
    'visible-range subscription must route left-edge history pagination through the shared helper',
  );
});

test('WebView incremental candle updates keep the raw visible series in sync', () => {
  const body = extractFunctionBody(source, 'applyTickUpdate');

  assertSourceContains(body, /upsertRawSeriesDatum\(tick\)/, 'incremental candle updates must update the raw data buffer');
  assertSourceContains(body, /currentSeriesLength = lastRawSeriesData\.length/, 'series length must come from the raw candle buffer');
  assertSourceContains(
    source,
    /function upsertRawSeriesDatum\(tick\)[\s\S]*lastRawSeriesData\[lastIndex\] = normalized[\s\S]*lastRawSeriesData\.push\(normalized\)/,
    'raw data buffer must replace the active candle or append a new one',
  );
});

test('native WebView uses the RTX5 custom candlestick renderer for candle modes', () => {
  assertSourceContains(
    source,
    /Use the RTX5 custom candle renderer on mobile/,
    'native chart must document the custom candlestick renderer contract',
  );
  assertSourceContains(
    source,
    /series = window\.addRTX5CustomCandlestickSeries\(chart,[\s\S]*bodyUpColor: colors\.bodyUp[\s\S]*bodyDownColor: colors\.bodyDown/,
    'candlestick and hollow charts must use the RTX5 custom candlestick series',
  );
});

test('canonical candle and exact backend Bid cross one revisioned bridge without a delayed side path', () => {
  assertSourceContains(
    source,
    /const chartLiveTickAccumulatorRef = useRef<ChartLiveTickAccumulator \| null>\(null\)[\s\S]*const accumulateCurrentChartBid = useCallback\([\s\S]*accumulateChartBidTick\(chartLiveTickAccumulatorRef\.current,[\s\S]*contextKey: chartDataContextSig,[\s\S]*timeframe: chartTimeframe/,
    'native chart must keep one context-keyed, broker-neutral Bid candle accumulator',
  );
  assert.doesNotMatch(source, /resolveLivePriceCoherentCandles/, 'native chart must not fold live quotes into sanitizedCandles');
  assert.doesNotMatch(source, /price: liveChartPrice/, 'native chart must not pass quote prices to candle synthesis');
  assertSourceContains(
    source,
    /const exactQuote = readExactChartQuoteForScope\([\s\S]*accumulateCurrentChartBid\(exactQuote, canonicalCandles\)[\s\S]*const projection = projectChartLiveTickCandles\([\s\S]*const canonicalLastCandle = renderableCandles\[renderableCandles\.length - 1\][\s\S]*const lastCandle = mappedRenkoData[\s\S]*canonicalLastCandle[\s\S]*const exactBidLine = exactQuote \? canonicalLastCandle\.close : null[\s\S]*candle: buildChartTickPayload\(lastCandle, chartType\),[\s\S]*livePrice: exactBidLine,[\s\S]*showLivePriceLine: shouldShowExactBidLine,[\s\S]*revision,[\s\S]*updateLiveTick\(/,
    'the exact backend Bid must drive either the source candle or forming Renko brick before both cross one revisioned payload',
  );
  assertSourceContains(
    source,
    /function updateLiveTick\(update\)[\s\S]*var acceptedCandlePrice = seriesType === 'line'[\s\S]*Number\(update\.candle\.value\)[\s\S]*Number\(update\.candle\.close\)[\s\S]*livePrice: acceptedCandlePrice/,
    'the WebView must enforce that the one Bid marker uses the same accepted candle generation',
  );
  assert.doesNotMatch(source, /livePrice:\s*update\.livePrice/);
  assert.doesNotMatch(
    source,
    /pendingMarketPriceLinesRef|requestMarketPriceLineFlush|flushPendingMarketPriceLines|CHART_MARKET_PRICE_LINE_SYNC_INTERVAL_MS/,
    'live Bid painting must not retain the old independently timed line queue',
  );
});

test('Renko maps canonical candles into wickless bricks and reloads threshold changes safely', () => {
  assertSourceContains(
    source,
    /chartType === 'renko'[\s\S]*buildRenkoBricks\(cleaned,[\s\S]*resolveCachedRenkoBrickSize\(cleaned\)/,
    'native mapping must transform canonical candles into precision-aware Renko bricks',
  );
  assertSourceContains(
    source,
    /wickVisible: seriesType !== 'renko'/,
    'Renko must use solid custom-series bricks without candlestick wicks',
  );
  assertSourceContains(
    source,
    /const renkoUpdateMode = mappedRenkoData[\s\S]*getChartSeriesUpdateMode\(renderedRenkoSeriesSnapshotRef\.current, nextRenkoSnapshot\)[\s\S]*updateMode === 'full_reload'[\s\S]*\|\| renkoUpdateMode === 'full_reload'/,
    'a Renko threshold crossing must replace the transformed series when its tail shape changes',
  );
});

test('horizontal zoom and pan heals auto ranges while preserving manual ownership', () => {
  assertSourceContains(
    source,
    /subscribeVisibleLogicalRangeChange\(function\(range\) \{[\s\S]*isLightweightHorizontalMotion = isHorizontalScrollMotionActive\(\)[\s\S]*scheduleMovingVerticalGridUpdate\(isLightweightHorizontalMotion\)[\s\S]*schedulePeriodSeparatorsUpdate\(isLightweightHorizontalMotion\)[\s\S]*if \(isLightweightHorizontalMotion\) \{[\s\S]*scheduleVisibleRangeIdleWork\(\)[\s\S]*return;[\s\S]*scheduleActiveScrollPriceScaleRecovery\('visible_range_active'\)/,
    'finger drag and kinetic range changes must stay on transform-only grid work until the idle settle',
  );
  assertSourceContains(
    source,
    /ACTIVE_SCROLL_PRICE_SCALE_CHECK_INTERVAL_MS = 48[\s\S]*ACTIVE_SCROLL_PRICE_SCALE_SPAN_MULTIPLE = 8/,
    'active-scroll recovery must be fast enough for 60 FPS scroll while staying throttled off every frame',
  );
  assertSourceContains(
    source,
    /function scheduleActiveScrollPriceScaleRecovery\(reason\)[\s\S]*activeScrollPriceScaleRaf[\s\S]*isChartScaleGestureSuppressed\(\) \|\| !isHorizontalScrollGesturePriceScaleRecoveryEligible\(\)[\s\S]*Date\.now\(\)[\s\S]*ACTIVE_SCROLL_PRICE_SCALE_CHECK_INTERVAL_MS[\s\S]*requestAnimationFrame\(function\(\) \{[\s\S]*!isChartScaleGestureSuppressed\(\)[\s\S]*healVisiblePriceScaleDuringActiveScroll\(reason \|\| 'visible_range_active'\)/,
    'active-scroll recovery must be RAF based, throttled, tied to one-finger horizontal pan, and suppressed during scale gestures',
  );
  assertSourceContains(
    source,
    /function healVisiblePriceScaleDuringActiveScroll\(reason\)[\s\S]*manualPriceScaleRangeActive \|\|[\s\S]*isChartScaleGestureSuppressed\(\) \|\|[\s\S]*!isHorizontalScrollGesturePriceScaleRecoveryEligible\(\)[\s\S]*resolvePriceRangeFromVisibleData\(false\)[\s\S]*scaleSpan > dataSpan \* ACTIVE_SCROLL_PRICE_SCALE_SPAN_MULTIPLE[\s\S]*enableRightPriceAutoScale\(\)[\s\S]*setRecoveredRightPriceRange\(candleDataRange\)/,
    'active horizontal scroll must heal stale price ranges from visible candles only without fighting manual vertical scaling',
  );
  assertSourceContains(
    source,
    /function isChartScaleGestureSuppressed\(\)[\s\S]*Date\.now\(\) <= suppressChartTapUntil/,
    'active-scroll price recovery must share the existing pinch/scale suppression window',
  );
  assertSourceContains(
    source,
    /dx > VERT_PAN_THRESHOLD && dx > dy \* 1\.2[\s\S]*preserveManualPriceScaleForHorizontalPan\(\)[\s\S]*markHorizontalScrollGestureActive\(\)[\s\S]*scheduleActiveScrollPriceScaleRecovery\('horizontal_pan_active'\)/,
    'active-scroll recovery must be armed only after horizontal classification and must reassert manual ownership first',
  );
  assertSourceContains(
    source,
    /function clearActiveScrollPriceScaleRecovery\(\)[\s\S]*cancelAnimationFrame\(activeScrollPriceScaleRaf\)[\s\S]*lastActiveScrollPriceScaleCheckAt = 0[\s\S]*activeHorizontalScrollGesture = false[\s\S]*activeHorizontalScrollGestureUntil = 0/,
    'chart teardown/reinit must cancel pending active-scroll price recovery work',
  );
  assertSourceContains(
    source,
    /if \(priceScaleHealthRaf\)[\s\S]*priceScaleHealthRaf = 0[\s\S]*clearActiveScrollPriceScaleRecovery\(\)[\s\S]*if \(visibleRangeIdleTimer !== null\)/,
    'chart reinitialization must clear active-scroll recovery before the old chart is removed',
  );
  assertSourceContains(
    source,
    /function scheduleVisibleRangeIdleWork\(\)[\s\S]*clearTimeout\(visibleRangeIdleTimer\)[\s\S]*horizontalScrollMotionActive = false[\s\S]*applyDeferredHorizontalOverlayPayload\(\)[\s\S]*scheduleMovingVerticalGridUpdate\(false\)[\s\S]*schedulePeriodSeparatorsUpdate\(false\)[\s\S]*scheduleActiveScrollPriceScaleRecovery\('visible_range_idle'\)[\s\S]*scheduleOverlayPriceScaleLock\(false\)[\s\S]*schedulePriceScaleHealthCheck\('visible_range_change', true\)[\s\S]*scheduleOverlayDomRefresh\(\)[\s\S]*requestHistoryPaginationForVisibleRange/,
    'visible range idle work must perform one full overlay, scale, separator, grid, and pagination settle',
  );
  assertSourceContains(
    source,
    /function healCollapsedPriceScaleRange\(reason, allowManualReset\)[\s\S]*scaleSpan > dataSpan \* PRICE_SCALE_HEALTH_SPAN_MULTIPLE[\s\S]*enableRightPriceAutoScale\(\)/,
    'stale price-scale ranges must self-heal when normal candles collapse into a line',
  );
  assertSourceContains(
    source,
    /function getPriceRangeOverlapRatio\(currentRange, dataRange\)[\s\S]*overlapSpan \/ dataSpan/,
    'price-scale health checks must measure whether the visible candle range still overlaps the right scale',
  );
  assertSourceContains(
    source,
    /dataOverlapRatio < PRICE_SCALE_HEALTH_MIN_DATA_OVERLAP_RATIO[\s\S]*enableRightPriceAutoScale\(\)/,
    'horizontal navigation must heal stale shifted ranges even when their span is similar to the visible data',
  );
  assertSourceContains(
    source,
    /function setRecoveredRightPriceRange\(range\)[\s\S]*priceScaleApi\.setVisibleRange\(\{ from: recoveredRange\.from, to: recoveredRange\.to \}\)/,
    'price-scale recovery must directly apply the current visible candle range when autoscale stays stale',
  );
  assertSourceContains(
    source,
    /function resolveRobustVisiblePriceRange\(visibleBars, rawRange\)[\s\S]*PRICE_SCALE_ROBUST_CLUSTER_KEEP_RATIO[\s\S]*rawSpan > clusterSpan \* PRICE_SCALE_ROBUST_CLUSTER_SPAN_MULTIPLE/,
    'left-scroll autoscale must ignore tiny extreme clusters that would compress normal visible candles into a line',
  );
  assertSourceContains(
    source,
    /PRICE_SCALE_ROBUST_CLUSTER_MIN_BARS = 4[\s\S]*PRICE_SCALE_ROBUST_CLUSTER_KEEP_RATIO = 0\.55[\s\S]*PRICE_SCALE_ROBUST_CLUSTER_RELATIVE_TOLERANCE = 0\.006[\s\S]*PRICE_SCALE_ROBUST_CLUSTER_SPAN_MULTIPLE = 5/,
    'visible price-range clustering must be tight enough to split isolated BTC M1 live/history price regimes instead of autoscaling across both',
  );
  assertSourceContains(
    source,
    /PRICE_SCALE_ROBUST_MARKET_CLUSTER_MIN_BARS = 1[\s\S]*PRICE_SCALE_ROBUST_MARKET_CLUSTER_RELATIVE_TOLERANCE = 0\.006[\s\S]*PRICE_SCALE_ROBUST_MARKET_CLUSTER_SPAN_MULTIPLE = 3/,
    'right-edge live scroll recovery must be able to prefer the visible candle cluster anchored around the current bid or ask',
  );
  assertSourceContains(
    source,
    /function resolveMarketAnchoredVisiblePriceRange\(visibleBars, rawRange\)[\s\S]*getMarketPriceBadgeValues\(\)[\s\S]*Math\.abs\(center - marketPrice\) <= tolerance[\s\S]*rawSpan > marketSpan \* PRICE_SCALE_ROBUST_MARKET_CLUSTER_SPAN_MULTIPLE/,
    'right-edge live scroll recovery must ignore detached far-price history when visible candles exist around the live market price',
  );
  assertSourceContains(
    source,
    /function resolveRobustVisiblePriceRange\(visibleBars, rawRange\)[\s\S]*var marketAnchoredRange = resolveMarketAnchoredVisiblePriceRange\(visibleBars, rawRange\)[\s\S]*if \(marketAnchoredRange\) \{[\s\S]*return marketAnchoredRange/,
    'visible price-range recovery must try the live-market anchored cluster before falling back to majority clustering',
  );
  assertSourceContains(
    source,
    /function resolveTrimmedPriceRangeFromBars\(bars\)[\s\S]*PRICE_SCALE_ROBUST_TRIM_RATIO[\s\S]*makePaddedPriceRange\(minPrice, maxPrice\)/,
    'visible price-range recovery must trim isolated high/low outlier values before autoscale recovery',
  );
  assertSourceContains(
    source,
    /trimmedRange[\s\S]*rawSpan > trimmedSpan \* PRICE_SCALE_ROBUST_TRIM_SPAN_MULTIPLE[\s\S]*return trimmedRange/,
    'left-scroll recovery must prefer the trimmed visible range when isolated outlier values flatten normal candles',
  );
  assertSourceContains(
    source,
    /function resolvePriceRangePixelCompression\(range\)[\s\S]*series\.priceToCoordinate\(normalized\.from\)[\s\S]*PRICE_SCALE_HEALTH_MIN_VISIBLE_PIXEL_RATIO[\s\S]*collapsed: pixelSpan < minPixelSpan/,
    'price-scale health checks must detect the actual on-screen pixel collapse of the visible candle range',
  );
  assertSourceContains(
    source,
    /function sanitizeSeriesData\(data\)[\s\S]*return Object\.keys\(byTime\)[\s\S]*\.map\(function\(key\) \{ return byTime\[key\]; \}\)[\s\S]*\.sort\(function\(left, right\) \{ return left\.time - right\.time; \}\)/,
    'WebView setData sanitization must preserve sorted valid gateway candles after normalization and dedupe',
  );
  assert.doesNotMatch(
    source,
    /filterRawSeriesDataByPriceContinuity/,
    'WebView setData sanitization must not prune valid gateway OHLC candles with large but valid wicks',
  );
  assertSourceContains(
    source,
    /dataVisuallyCollapsed[\s\S]*enableRightPriceAutoScale\(\)[\s\S]*setRecoveredRightPriceRange\(dataRange\)/,
    'left-scroll navigation must recover the right price scale when visible candles are compressed into a tiny pixel band',
  );
  assertSourceContains(
    source,
    /function resolveVisibleCandleDataPriceRange\(\)[\s\S]*var rawRange = resolvePriceRangeFromBars\(visibleBars\)[\s\S]*return resolveRobustVisiblePriceRange\(visibleBars, rawRange\)[\s\S]*function resolvePriceRangeFromVisibleData\(includeMarketPriceBadges\)[\s\S]*var robustRange = resolveVisibleCandleDataPriceRange\(\)[\s\S]*includeMarketPriceBadges === false/,
    'visible price-range recovery must use the robust viewport range and allow horizontal pan to ignore far live price badges',
  );
  assertSourceContains(
    source,
    /rightPriceScale: \{[\s\S]*autoScale: true/,
    'host chart options must start the right price scale in autoscale mode',
  );
  assertSourceContains(
    source,
    /function scheduleVisibleRangeIdleWork\(\)[\s\S]*schedulePriceScaleHealthCheck\('visible_range_change', true\)/,
    'horizontal navigation may schedule health work, whose manual-ownership guard keeps the fixed range intact',
  );
  assertSourceContains(
    source,
    /var priceScaleReason = didPrependHistory[\s\S]*'update_data_prepend_history'[\s\S]*!restoredStableReplacementViewport && !shouldPreserveManualPriceScale[\s\S]*schedulePriceScaleHealthCheck\([\s\S]*didPrependHistory \|\| didReplaceVisibleSeries \? 5 : 1/,
    'older-history recovery passes must be skipped while the user owns a fixed numeric range',
  );
  assertSourceContains(
    source,
    /function schedulePriceScaleHealthCheck\(reason, allowManualReset, attempts\)[\s\S]*remainingAttempts[\s\S]*schedulePriceScaleHealthCheck\(reason, allowManualReset, remainingAttempts - 1\)/,
    'price-scale health checks must be able to re-run after chart autoscale settles',
  );
  assertSourceContains(
    source,
    /handleScale: \{[\s\S]*pinch: true[\s\S]*axisPressedMouseMove: \{ time: true, price: false \}/,
    'mobile pinch stays enabled while the custom WebView exclusively owns right price-axis scaling',
  );
  assertSourceContains(
    source,
    /handleScroll: \{[\s\S]*horzTouchDrag: true[\s\S]*vertTouchDrag: false/,
    'host chart options must leave horizontal touch drag enabled while custom WebView code owns body vertical panning',
  );
  assertSourceContains(
    source,
    /function resolveChartTouchInteractionOptions\(enabled\)[\s\S]*handleScroll\.vertTouchDrag = false/,
    'WebView touch interaction restore must keep library vertical touch drag disabled',
  );
});

test('vertical candle drag can own the price range without autoscale fighting it', () => {
  assertSourceContains(
    source,
    /function resolveVerticalPanStartPriceRange\(\)[\s\S]*getVisibleRange\(\)[\s\S]*resolvePriceRangeFromVisibleData\(false\)/,
    'vertical pan must fall back to visible candle data when autoscale has no explicit range',
  );
  assertSourceContains(
    source,
    /var beginVerticalPan = function\(clientY\)[\s\S]*rememberManualVerticalPanRange\(range\)[\s\S]*setAutoScale\(false\)[\s\S]*setVisibleRange\(\{ from: range\.from, to: range\.to \}\)/,
    'vertical pan start must pin the current price range before movement',
  );
  assertSourceContains(
    source,
    /var renderVerticalPanRange = function\(nextRange\)[\s\S]*rememberManualVerticalPanRange\(nextRange\)[\s\S]*priceScaleApi\.setVisibleRange\(nextRange\)[\s\S]*scheduleGestureRightPriceScaleFallbackRefresh\(\)[\s\S]*scheduleOverlayDomRefresh\(\)/,
    'vertical pan moves candles by manually shifting the visible price range and refreshing overlays',
  );
  assertSourceContains(
    source,
    /var VERT_PAN_PRICE_DELTA_MULTIPLIER = 1[\s\S]*var applyVerticalPanAt = function\(clientY\)[\s\S]*priceDelta = deltaPixels \* vertPanState\.pricePerPixel \* VERT_PAN_PRICE_DELTA_MULTIPLIER/,
    'body vertical pan must use the MT5-like sensitivity multiplier instead of full-range jumps',
  );
  assertSourceContains(
    source,
    /function lockVisiblePriceScaleRange\(forceAutoScale, attempt\)[\s\S]*isManualVerticalPanRangeLocked\(\) && forceAutoScale !== true[\s\S]*applyManualVerticalPanLockedRange\(\)[\s\S]*verticalPricePanGestureActive \|\| \(manualPriceScaleRangeActive && forceAutoScale !== true\)/,
    'autoscale refresh must not override an active manual vertical price range',
  );
  const endVerticalPanStart = source.indexOf('var endVerticalPan = function()');
  assert.notEqual(endVerticalPanStart, -1, 'endVerticalPan handler was not found');
  const endVerticalPan = source.slice(endVerticalPanStart, source.indexOf('var resetAutoScale', endVerticalPanStart));
  assertSourceContains(
    endVerticalPan,
    /var finalRange[\s\S]*renderVerticalPanRange\(finalRange\)[\s\S]*verticalPricePanGestureActive = false[\s\S]*rememberManualVerticalPanRange\(finalRange\)[\s\S]*syntheticRightPriceScaleFallbackRange = \{[\s\S]*applyManualVerticalPanLockedRange\(\)[\s\S]*scheduleGestureRightPriceScaleFallbackRefresh\(\)/,
    'vertical pan release must keep and reapply the exact final manual range',
  );
  assert.doesNotMatch(
    endVerticalPan,
    /syntheticRightPriceScaleFallbackRange = null/,
    'vertical pan release must not clear the fallback right-scale range and drift after finger-up',
  );
  assertSourceContains(
    source,
    /var manualVerticalPanRangeActive = false[\s\S]*var manualVerticalPanLockedRange = null[\s\S]*function rememberManualVerticalPanRange\(range\)[\s\S]*manualVerticalPanRangeActive = true[\s\S]*manualVerticalPanLockedRange = \{[\s\S]*from: normalizedRange\.from[\s\S]*to: normalizedRange\.to/,
    'vertical pan must keep the manual price range as persistent chart state',
  );
  assertSourceContains(
    source,
    /function healCollapsedPriceScaleRange\(reason, allowManualReset\)[\s\S]*void allowManualReset[\s\S]*verticalPricePanGestureActive \|\|[\s\S]*isManualVerticalPanRangePreserved\(\) \|\|[\s\S]*isManualVerticalPanRangeLocked\(\) \|\|[\s\S]*manualPriceScaleRangeActive[\s\S]*return;/,
    'every health reason must leave a user-owned manual range untouched',
  );
  assertSourceContains(
    source,
    /var beginVerticalPan = function\(clientY\)[\s\S]*rememberManualVerticalPanRange\(range\)[\s\S]*if \(priceScaleHealthRaf\) \{[\s\S]*cancelAnimationFrame\(priceScaleHealthRaf\)[\s\S]*priceScaleHealthRaf = 0/,
    'vertical pan start must cancel pending price-scale health work that could race the gesture',
  );
  assertSourceContains(
    source,
    /var endVerticalPan = function\(\)[\s\S]*var finalRange[\s\S]*verticalPricePanGestureActive = false[\s\S]*rememberManualVerticalPanRange\(finalRange\)[\s\S]*vertPanState = null/,
    'vertical pan release must preserve the final manual range after the active flag drops',
  );
  assertSourceContains(
    source,
    /var onPointerUp = function\(event\)[\s\S]*releasePointer\(event\);[\s\S]*finishRightPriceScaleGesture\(false\)[\s\S]*if \(vertPanState\) \{[\s\S]*endVerticalPan\(\)[\s\S]*return;[\s\S]*finishHorizontalScrollGesture\(\);/,
    'vertical pan release must finish before horizontal-scroll idle recovery is allowed to run',
  );
  const setChartOverlaysBody = extractFunctionBody(source, 'setChartOverlays');
  assertSourceContains(
    setChartOverlaysBody,
    /applyOverlayPayload\(_overlayPayload\)[\s\S]*schedulePriceScaleHealthCheck\('overlay_update', false, 1\)/,
    'live trade and overlay refreshes may heal a collapsed scale but must not reset the user-owned vertical range',
  );
  assert.doesNotMatch(
    setChartOverlaysBody,
    /scheduleOverlayPriceScaleLock|scheduleOverlayVisibleCandleScaleRecovery/,
    'routine overlay refreshes must not run price-scale fitting or visible-candle recovery',
  );
});

test('vertical pan math follows the finger one-to-one without changing the price span', () => {
  const applyVerticalPanAtBody = extractAssignedFunctionBody('applyVerticalPanAt');
  const applyVerticalPanAt = new Function(
    'clientY',
    'vertPanState',
    'chart',
    'series',
    'VERT_PAN_PRICE_DELTA_MULTIPLIER',
    'renderVerticalPanRange',
    `${applyVerticalPanAtBody}
     return vertPanState.latestRange;`,
  ) as (
    clientY: number,
    state: {
      latestRange: { from: number; to: number };
      pricePerPixel: number;
      startRange: { from: number; to: number };
      startY: number;
    },
    chart: object,
    series: object,
    multiplier: number,
    renderRange: (range: { from: number; to: number }) => void,
  ) => { from: number; to: number };

  const state = {
    latestRange: { from: 100, to: 200 },
    pricePerPixel: 0.1,
    startRange: { from: 100, to: 200 },
    startY: 500,
  };
  const rendered: Array<{ from: number; to: number }> = [];

  assert.deepEqual(
    applyVerticalPanAt(400, state, {}, {}, 1, (range) => rendered.push(range)),
    { from: 90, to: 190 },
  );
  assert.deepEqual(
    applyVerticalPanAt(550, state, {}, {}, 1, (range) => rendered.push(range)),
    { from: 105, to: 205 },
  );
  assert.equal(rendered[0].to - rendered[0].from, 100);
  assert.equal(rendered[1].to - rendered[1].from, 100);
});

test('double-tap reset accepts only two completed nearby taps, never pointer-down timing', () => {
  const consumeCompletedChartTapBody = extractAssignedFunctionBody('consumeCompletedChartTap');
  const createRecognizer = new Function(`
    var lastCompletedChartTap = null;
    var chartWindowSplitMode = false;
    var chartWindowSplitModeRevision = 0;
    var lastInitDataContextSig = 'session:BTCUSD:M1';
    var CHART_DOUBLE_TAP_MAX_DELAY_MS = 350;
    var CHART_DOUBLE_TAP_MAX_DISTANCE_PX = 24;
    var clearCompletedChartTap = function() {
      lastCompletedChartTap = null;
    };
    var consumeCompletedChartTap = function(point, completedAt) {
      ${consumeCompletedChartTapBody}
    };
    return consumeCompletedChartTap;
  `) as () => (point: { x: number; y: number }, completedAt: number) => boolean;
  const consumeCompletedChartTap = createRecognizer();

  assert.equal(consumeCompletedChartTap({ x: 100, y: 100 }, 1_000), false);
  assert.equal(consumeCompletedChartTap({ x: 110, y: 108 }, 1_260), true);
  assert.equal(consumeCompletedChartTap({ x: 100, y: 100 }, 2_000), false);
  assert.equal(consumeCompletedChartTap({ x: 180, y: 180 }, 2_200), false);
  assert.equal(consumeCompletedChartTap({ x: 180, y: 180 }, 2_700), false);

  const onPointerDown = extractAssignedFunctionBody('onPointerDown');
  assert.doesNotMatch(onPointerDown, /resetAutoScale|lastDoubleTapAt/);
  const onPointerUp = extractAssignedFunctionBody('onPointerUp');
  assertSourceContains(
    onPointerUp,
    /elapsed > 450 \|\| Math\.abs\(dx\) > 12 \|\| Math\.abs\(dy\) > 12[\s\S]*clearCompletedChartTap\(\)[\s\S]*return;[\s\S]*consumeCompletedChartTap\(point, Date\.now\(\)\)/,
    'movement must invalidate the tap candidate before double-tap recognition runs',
  );
});

test('manual vertical range survives pending locks and delayed surface recovery', () => {
  const beginVerticalPan = extractAssignedFunctionBody('beginVerticalPan');
  assertSourceContains(
    beginVerticalPan,
    /cancelAnimationFrame\(overlayPriceScaleLockRaf\)[\s\S]*overlayPriceScaleLockRaf = 0[\s\S]*overlayPriceScaleLockForceAutoScale = false/,
    'claiming a vertical pan must clear a cancelled forced-auto-scale request',
  );

  const recoverChartSurface = extractFunctionBody(source, 'recoverChartSurface');
  assertSourceContains(
    recoverChartSurface,
    /var recoveryManualRange = isManualVerticalPanRangeLocked\(\)[\s\S]*series\.setData\(mapped\)[\s\S]*rememberManualVerticalPanRange\(recoveryManualRange\)[\s\S]*applyManualVerticalPanLockedRange\(\)[\s\S]*applyOverlayPayload\(_overlayPayload\)[\s\S]*rememberManualVerticalPanRange\(recoveryManualRange\)[\s\S]*applyManualVerticalPanLockedRange\(\)/,
    'surface recovery must reapply the same manual window both after setData and after overlay reconstruction',
  );
  assertSourceContains(
    recoverChartSurface,
    /scheduleOverlayPriceScaleLock\(chartAutoScaleEnabled === true\)/,
    'surface recovery may force autoscale only when the preference is enabled',
  );
  assert.doesNotMatch(
    recoverChartSurface,
    /scheduleOverlayPriceScaleLock\(true\)/,
    'surface recovery must not unconditionally erase the user-owned price range',
  );
});

test('right price scale drag is routed separately from body vertical pan', () => {
  const beginRightPriceScaleGesture = extractAssignedFunctionBody('beginRightPriceScaleGesture');
  assertSourceContains(
    source,
    /\$\{MT5_PRICE_SCALE_GESTURE_WEBVIEW_JS\}/,
    'Hermes must inject explicit resolver source instead of serializing compiled bytecode with Function#toString',
  );
  assert.doesNotMatch(
    source,
    /resolveMt5PriceScaleDragRange\.toString\(\)/,
    'the WebView resolver must never depend on Hermes Function#toString output',
  );
  assertSourceContains(
    source,
    /\.rtx5-right-price-scale-fallback-axis \{[\s\S]*pointer-events: auto;[\s\S]*touch-action: none;/,
    'the painted price-axis surface must predeclare exclusive touch ownership before pointer-down',
  );
  assertSourceContains(
    source,
    /var isRightPriceScaleGesturePoint = function\(clientX, clientY\)[\s\S]*resolveFallbackPlotMetrics\(\)[\s\S]*resolveRightPriceScaleFallbackAxisMetrics\(metrics\)[\s\S]*axisLeft[\s\S]*axisRight[\s\S]*point\.x >= axisLeft - 6/,
    'right price-scale hit testing must use the exact full-height fallback strip that is visibly rendered',
  );
  assertSourceContains(
    source,
    /if \(isRightPriceScaleGesturePoint\(point\.x, point\.y\)\) \{[\s\S]*beginRightPriceScaleGesture\(event, point\.x, point\.y\)[\s\S]*stopChartEvent\(event\)[\s\S]*return;/,
    'right-axis touches must not enter chart-body vertical pan tracking',
  );
  assertSourceContains(
    source,
    /var beginRightPriceScaleGesture = function\(event, clientX, clientY\)[\s\S]*resolveFallbackPlotMetrics\(\)[\s\S]*var referenceSpan =[\s\S]*anchorRatio[\s\S]*setPointerCapture\(event\.pointerId\)[\s\S]*el\.style\.touchAction = 'none'[\s\S]*rightPriceScaleGestureActive = true[\s\S]*verticalPricePanGestureActive = true[\s\S]*deferVerticalGestureDomWork\(\)/,
    'right-axis drag must capture its focal price and retain exclusive pointer ownership',
  );
  assert.doesNotMatch(
    beginRightPriceScaleGesture,
    /manualPriceScaleReferenceSpan\s*=(?!=)/,
    'a right-axis tap without movement must not commit a stale zoom envelope',
  );
  assertSourceContains(
    beginRightPriceScaleGesture,
    /series\.coordinateToPrice\(relativePoint\.y\)[\s\S]*\(range\.to - anchorPrice\) \/ startSpan/,
    'the focal anchor must use the rendered price coordinate when scale margins are present',
  );
  assertSourceContains(
    source,
    /var applyRightPriceScaleGestureAt = function\(clientY\)[\s\S]*resolveMt5PriceScaleDragRange\(\{[\s\S]*deltaY: deltaY[\s\S]*plotHeight: state\.plotHeight[\s\S]*renderVerticalPanRange\(state\.latestRange\)/,
    'right-axis movement must apply pane-relative MT5 zoom math to the manual range',
  );
  assertSourceContains(
    source,
    /if \(rightPriceScaleGestureActive\) \{[\s\S]*applyRightPriceScaleGestureAt\(rightScalePoint\.y\)[\s\S]*deferVerticalGestureDomWork\(\)[\s\S]*stopChartEvent\(event\)[\s\S]*return;/,
    'right-axis drag must exclusively own move events without rebuilding custom overlays',
  );
  const onPointerDown = extractAssignedFunctionBody('onPointerDown');
  assert.ok(
    onPointerDown.indexOf('isRightPriceScaleGesturePoint(point.x, point.y)') <
      onPointerDown.indexOf('resolveTradeLineDragHitFromEvent(event)'),
    'right-axis ownership must be resolved before Y-only SL/TP hit testing',
  );
  assertSourceContains(
    source,
    /var applyRightPriceScaleGestureAt = function\(clientY\)[\s\S]*manualPriceScaleReferenceSpan = state\.referenceSpan[\s\S]*clearCompletedRightPriceScaleTap\(\)/,
    'the global zoom envelope must be committed only after movement crosses the drag threshold',
  );
  assertSourceContains(
    source,
    /var finishRightPriceScaleGesture = function\(cancelled\)[\s\S]*consumeCompletedRightPriceScaleTap\([\s\S]*resetChartVerticalScale\(\)/,
    'two completed right-axis taps must explicitly reset the vertical scale',
  );
  assertSourceContains(
    source,
    /var finishRightPriceScaleGesture = function\(cancelled\)[\s\S]*releasePointerCapture\(gestureState\.pointerId\)[\s\S]*el\.style\.touchAction =[\s\S]*gestureState\.previousTouchAction/,
    'right-axis completion must release pointer capture and restore normal touch behavior',
  );
  assertSourceContains(
    source,
    /var onWindowPointerMove = function\(event\)[\s\S]*rightPriceScaleGestureActive[\s\S]*applyRightPriceScaleGestureAt\(rightScalePoint\.y\)[\s\S]*stopChartEvent\(event\)/,
    'window-level movement must continue an owned axis drag if the pointer leaves the element bounds',
  );
  assertSourceContains(
    source,
    /var settleVerticalPriceGestureDomWork = function\(\)[\s\S]*scheduleGestureRightPriceScaleFallbackRefresh\(\)[\s\S]*scheduleOverlayDomRefresh\(\)[\s\S]*postChartGeometry\(\)/,
    'right-axis drag release must refresh custom right-scale and trade overlays after deferred movement',
  );
});

test('pinch and zoom gestures suppress chart tap radial menu events', () => {
  const body = extractFunctionBody(source, 'bindChartTapListeners');

  assertSourceContains(
    body,
    /CHART_SCALE_TAP_SUPPRESSION_MS/,
    'chart tap listener must keep a suppression window for scale gestures',
  );
  assertSourceContains(
    body,
    /isScaleGestureEvent\(event\)[\s\S]*suppressChartTapAfterScale/,
    'multi-touch scale gestures must cancel pending tap emission',
  );
  assertSourceContains(
    body,
    /Date\.now\(\) <= suppressNextChartClickUntil \|\| Date\.now\(\) <= suppressChartTapUntil/,
    'native click fallback must also be suppressed after zoom',
  );
});
