import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('chart buy/sell tiles never swap to a spinner and never animate price color per tick', () => {
  const source = readSource(
    'src/features/chart/components/ChartTradeButtonsFeature/ChartTradeButtonsFeature.tsx',
  );

  assert.doesNotMatch(source, /ActivityIndicator/);
  assert.doesNotMatch(source, /from 'react-native'[\s\S]*Animated/);
  assert.doesNotMatch(source, /TRADE_BUTTON_PRICE_UP_FLASH|TRADE_BUTTON_PRICE_DOWN_FLASH/);
  assert.match(source, /Busy state must NOT swap children/);
  assert.match(source, /No per-tick color animation/);
  assert.match(source, /borderWidth: 2,\s*borderColor: sellBusy \?/);
  assert.match(source, /borderWidth: 2,\s*borderColor: buyBusy \?/);
  assert.doesNotMatch(source, /borderWidth: (?:sellBusy|buyBusy) \?/);
  // Display fallback stays object-based, while execution reads the imperative
  // per-symbol quote state instead of constructing a price-only object.
  assert.match(
    source,
    /resolveChartTradeButtonDisplayQuote\(\{\s*liveBid: liveQuote\?\.bid,/,
  );
  assert.match(
    source,
    /useExecutableQuote\(symbol, active, TRADE_BUTTON_QUOTE_COMMIT_INTERVAL_MS\)/,
  );
  assert.match(source, /getCurrentExecutableQuoteState/);
  assert.match(source, /resolveChartTradeQuoteAvailability\(\{/);
  assert.match(source, /getCurrentQuoteActionAvailability,/);
  assert.doesNotMatch(source, /quoteActionQuote:/);
});

test('chart overlay geometry stays isolated while open-trade labels follow every quote commit', () => {
  const native = readSource('src/features/chart/ChartScreen.native.tsx');
  const liveBridge = readSource(
    'src/features/chart/components/ChartTradeOverlayLiveBridge.tsx',
  );
  const html = readSource('src/features/chart/rendering/ChartWebViewHtml.ts');

  assert.match(native, /const overlayGeometrySignature = useMemo/);
  assert.match(native, /overlayGeometrySignature,/);
  assert.match(
    native,
    /<ChartTradeOverlayLiveBridge\s+key=\{chartTradeDisplayQuoteScopeKey\}\s+active=\{chartRuntimeActive && chartCanvasReady && webViewReady\}\s+symbol=\{chartSymbol\}\s+onQuote=\{applyLiveChartTradeOverlayQuote\}/,
  );
  assert.match(liveBridge, /useLiveSymbolQuote\(symbol, active, 0\)/);
  assert.match(liveBridge, /hasLiveQuoteFeedData\(liveQuote\)/);
  assert.match(liveBridge, /\(!hasUsableBid && !hasUsableAsk\)/);
  assert.match(liveBridge, /onQuote\(liveQuote\)/);
  assert.match(liveBridge, /return null/);
  assert.match(
    native,
    /buildChartOpenPositionLabelPatches\(\{[\s\S]*liveBid: quote\.bid,[\s\S]*liveAsk: quote\.ask,[\s\S]*liveQuote: quote/,
  );
  assert.match(
    native,
    /updateOverlayTradeLabelValues\([\s\S]*\$\{JSON\.stringify\(patches\)\},[\s\S]*\$\{JSON\.stringify\(chartDataContextSig\)\}[\s\S]*\)/,
  );
  assert.match(
    native,
    /overlayPayloadRef\.current = applyChartOpenPositionLabelPatches\(\s*overlayPayload,\s*latestPatches\.patches/,
  );
  assert.doesNotMatch(native, /overlayLabelFlushTimerRef|lastOverlayLabelFlushAtRef/);
  assert.doesNotMatch(native, /Math\.max\(0, 400 - elapsedMs\)/);
  assert.match(native, /line\.id\.startsWith\('open-'\)/);
  assert.match(
    native,
    /latestPatches\.contextKey !== chartOpenPositionLabelPatchContextKey[\s\S]*patches: \[\]/,
  );
  assert.match(
    native,
    /const chartOpenPositionLabelPatchContextKey = useMemo\([\s\S]*chartTradeDisplayQuoteScopeKey,[\s\S]*chartPositionStructuralSignature,[\s\S]*chartShowOnChart\.buyTrade,[\s\S]*chartShowOnChart\.sellTrade/,
  );
  assert.match(
    native,
    /chartCanvasReady,\s*chartDataContextSig,\s*chartOpenPositionLabelPatchContextKey,\s*chartReadyEpoch,/,
  );
  assert.match(html, /function updateOverlayTradeLabelValues\(patches\)/);
  assert.match(html, /window\.updateOverlayTradeLabelValues = updateOverlayTradeLabelValues/);
  assert.match(html, /function updateOverlayTradeLabels\(payload\)/);
  assert.match(html, /window\.updateOverlayTradeLabels = updateOverlayTradeLabels/);
  assert.match(html, /buildOverlayNativeLineSignature/);
  assert.match(
    html,
    /applyOverlayPayload\(_overlayPayload\);[\s\S]*schedulePriceScaleHealthCheck\('overlay_update', false, 1\)/,
  );
  assert.doesNotMatch(
    html,
    /applyOverlayPayload\(_overlayPayload\);[\s\S]*scheduleOverlayVisibleCandleScaleRecovery\('overlay_update'\)/,
  );
});

test('open-trade DOM lines/labels update in place (never full-layer wipe on ticks)', () => {
  const html = readSource('src/features/chart/rendering/ChartWebViewHtml.ts');

  // Root cause of the post-place-order horizontal blink: open trades use
  // DOM-only lines (native lineVisible:false). Wiping the overlay layer on
  // every setLivePriceLine/refresh blanked those lines for a frame.
  assert.match(html, /var _overlayDomNodesByKey = Object\.create\(null\)/);
  assert.match(html, /function upsertOverlayDomNode\(layer, key, className\)/);
  assert.match(html, /function pruneOverlayDomNodes\(liveKeys\)/);
  assert.match(html, /NEVER wipe the whole overlay layer on routine refreshes/);
  assert.match(html, /upsertOverlayDomNode\(layer, lineKey, 'rtx5-anchored-trade-line'\)/);
  assert.match(html, /pruneOverlayDomNodes\(liveOverlayKeys\)/);
  assert.match(
    html,
    /function refreshOverlayDomLabels\(payload\)[\s\S]*if \(!series\) \{\s*clearOverlayDomLabels\(\)/,
  );
  // Live quote ticks must not rebuild trade labels — market badge only.
  assert.match(html, /function scheduleMarketPriceScaleDomOnly\(\)/);
  assert.match(html, /if \(shouldScheduleRefresh !== false\) scheduleMarketPriceScaleDomOnly\(\)/);
});

test('trade screen keeps its complete retained body mounted and never remounts FlatList on focus', () => {
  const source = readSource('src/features/trade/TradeScreen/TradeScreen.tsx');
  const headerIndex = source.indexOf("<AppHeader title={t('Trade')} noBorder />");
  const summaryIndex = source.indexOf('<TradeSummaryHeader');
  const listIndex = source.indexOf('<FlatList');
  const emptyStateIndex = source.indexOf('ListEmptyComponent={');

  assert.notEqual(headerIndex, -1);
  assert.ok(headerIndex < summaryIndex);
  assert.ok(summaryIndex < listIndex);
  assert.ok(listIndex < emptyStateIndex);
  assert.doesNotMatch(source, /TRADE_BODY_PREWARM_DELAY_MS|routeBodyReady|showTradeBody|useDeferredRouteContentReady/);
  assert.match(source, /positionsSignature: buildOpenPositionsCacheSignature\(state\.positions\)/);
  assert.doesNotMatch(source, /key=\{`trade-positions-\$\{tradeFocusGeneration\}`\}/);
  assert.doesNotMatch(source, /tradeFocusGeneration/);
});

test('trade feedback modal is an absolute overlay (not RN Modal) to avoid WebView blink', () => {
  const source = readSource('src/ui/components/TradeFeedbackModal.tsx');
  assert.doesNotMatch(source, /from 'react-native'.*Modal|Modal,/);
  assert.doesNotMatch(source, /<Modal/);
  assert.doesNotMatch(source, /Animated\.timing|opacityAnim|slideAnim/,
    'receipt reconciliation must not hide and restart an already visible popup');
  assert.match(source, /receiptOverlay:\s*\{[\s\S]*\.\.\.StyleSheet\.absoluteFillObject/);
  assert.match(source, /overlay:\s*\{[\s\S]*\.\.\.StyleSheet\.absoluteFillObject/);
  assert.match(source, /zIndex: 10050/);
});
