import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

test('auxiliary pane is session-keyed and hidden-screen work is gated', () => {
  const source = readSource('src/features/chart/components/AuxiliaryChartPane.tsx');

  assert.match(source, /useActiveBrokerQuerySession\(\)/);
  assert.match(source, /key=\{scopeKey\}/);
  assert.match(source, /const scopeKey = session\?\.cacheNamespace \?\? 'no-session'/);
  assert.doesNotMatch(source, /scopeKey[^\n]*symbol|scopeKey[^\n]*paneId|normalizeSymbol\(props\.symbol\)/);
  assert.match(source, /useExecutableQuote\([\s\S]*symbol,[\s\S]*isScreenFocused/);
  assert.match(source, /useInstrumentMeta\(symbol, isScreenFocused\)/);
  assert.match(source, /\{isScreenFocused \? \([\s\S]*<LiveChartPreviewNative/);
  assert.match(source, /manageQuoteSubscription=\{false\}/);
  assert.match(source, /root:\s*\{[\s\S]*borderWidth: 1\.5/);
  assert.doesNotMatch(source, /activeRoot/);
});

test('symbol header owns picker press while the preview preserves pane gestures', () => {
  const paneSource = readSource('src/features/chart/components/AuxiliaryChartPane.tsx');
  const headerSource = readSource('src/features/chart/components/ChartSymbolHeaderOverlay.tsx');

  assert.match(paneSource, /<ChartSymbolHeaderOverlay[\s\S]*onSymbolPress=\{onSymbolPress\}/);
  assert.match(paneSource, /<LiveChartPreviewNative[\s\S]*onTap=\{singleTapAction\}[\s\S]*onDoubleTap=\{doubleTapAction\}/);
  assert.match(headerSource, /<Pressable[\s\S]*onPress=\{onSymbolPress\}/);
  assert.equal((headerSource.match(/<Pressable/g) ?? []).length, 1);
  assert.doesNotMatch(headerSource, /singleTapAction|doubleTapAction|onHeaderPress/);
});

test('auxiliary header matches ticker metadata and live OHLC without a second candle hook', () => {
  const paneSource = readSource('src/features/chart/components/AuxiliaryChartPane.tsx');
  const headerSource = readSource('src/features/chart/components/ChartSymbolHeaderOverlay.tsx');
  const previewSource = readSource('src/features/chart/preview/LiveChartPreview.native.tsx');
  const headerInvocationStart = paneSource.indexOf('<ChartSymbolHeaderOverlay');
  const headerInvocationEnd = paneSource.indexOf('/>', headerInvocationStart);
  const headerInvocationSource = paneSource.slice(headerInvocationStart, headerInvocationEnd);

  assert.ok(headerInvocationStart >= 0 && headerInvocationEnd > headerInvocationStart);
  assert.doesNotMatch(headerInvocationSource, /timeframe=/);
  assert.doesNotMatch(headerSource, /timeframeText|\{timeframe \?/);
  assert.match(headerSource, /resolveChartSymbolFullName\(symbol\)/);
  assert.match(headerSource, /resolveChartSymbolCategory\(symbol\)/);
  assert.match(headerSource, /CHART_OHLC_HIGH_COLOR = GDark\.trading\.profit/);
  assert.match(headerSource, /CHART_OHLC_LOW_COLOR = '#F23645'/);
  assert.match(headerSource, /\{showTicker \? \(/);
  assert.match(headerSource, /\{showOHLC && !compact \? \(/);
  assert.match(
    paneSource,
    /\(chartDisplay\.showTicker \|\| \(chartDisplay\.showOHLC && chartVisualType !== 'renko'\)\)/,
  );
  assert.match(
    paneSource,
    /showOHLC=\{chartDisplay\.showOHLC && chartVisualType !== 'renko'\}/,
  );
  assert.match(paneSource, /minHeight: density\.headerHeight/);
  assert.doesNotMatch(paneSource, /useLiveCandles/);
  assert.match(previewSource, /onLatestCandleChange\?\.\(\{ symbol, timeframe, candle: latestPreviewCandle \}\)/);
});

test('auxiliary header overlays the chart below the retained top-axis boundary', () => {
  const paneSource = readSource('src/features/chart/components/AuxiliaryChartPane.tsx');
  const headerSource = readSource('src/features/chart/components/ChartSymbolHeaderOverlay.tsx');
  const headerStyleStart = paneSource.indexOf('header: {');
  const headerStyleEnd = paneSource.indexOf('\n  headerContent:', headerStyleStart);
  const headerStyleSource = paneSource.slice(headerStyleStart, headerStyleEnd);

  assert.ok(headerStyleStart >= 0 && headerStyleEnd > headerStyleStart);
  assert.match(
    paneSource,
    /styles\.header,[\s\S]*minHeight: density\.headerHeight,[\s\S]*backgroundColor: 'transparent'/,
  );
  assert.ok(
    paneSource.indexOf('style={styles.chartSurface}')
      < paneSource.indexOf('pointerEvents="box-none"'),
  );
  assert.match(
    headerStyleSource,
    /position: 'absolute',[\s\S]*top: 1,[\s\S]*right: CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH/,
  );
  assert.match(paneSource, /chartSurface:\s*\{[\s\S]*position: 'relative'/);
  assert.doesNotMatch(paneSource, /backgroundColor: isDark \? '#171717' : '#F8FAFC'/);
  assert.doesNotMatch(headerStyleSource, /borderBottomWidth/);
  assert.doesNotMatch(headerSource, /textShadow(?:Color|Offset|Radius)/);
});

test('auxiliary chart reports its window-space surface frame for pane-local overlays', () => {
  const source = readSource('src/features/chart/components/AuxiliaryChartPane.tsx');

  assert.match(source, /export type AuxiliaryChartSurfaceFrame/);
  assert.match(source, /onChartSurfaceFrameChange\?:/);
  assert.match(source, /ref=\{chartSurfaceRef\}[\s\S]*onLayout=\{handleChartSurfaceLayout\}/);
  assert.match(
    source,
    /measureInWindow\(\(x, y, width, height\) => \{[\s\S]*onChartSurfaceFrameChange\?\.\(\{ x, y, width, height \}\)/,
  );
  assert.match(
    source,
    /requestAnimationFrame\(handleChartSurfaceLayout\)[\s\S]*paneId/,
    'stable auxiliary engines must remeasure when pane ownership changes',
  );
});

test('auxiliary OHLC rejects a retained candle from a prior symbol timeframe context', () => {
  const source = readSource('src/features/chart/components/AuxiliaryChartPane.tsx');

  assert.match(source, /const headerContextKey = `\$\{symbol\}\\u0000\$\{timeframe\}`/);
  assert.match(source, /latestHeaderCandleState\.contextKey === headerContextKey/);
  assert.match(source, /const payloadContextKey = `\$\{payload\.symbol\}\\u0000\$\{payload\.timeframe\}`/);
  assert.match(source, /if \(payloadContextKey !== headerContextKey\) return/);
  assert.match(source, /onLatestCandleChange=\{handleLatestHeaderCandleChange\}/);
});

test('each pane owns an exact callback-only SELL lot BUY row', () => {
  const source = readSource('src/features/chart/components/AuxiliaryChartPane.tsx');

  const sellIndex = source.indexOf('>SELL</Text>');
  const lotIndex = source.indexOf('testID={`${testID}-lot-value`}');
  const buyIndex = source.indexOf('>BUY</Text>');

  assert.ok(sellIndex >= 0);
  assert.ok(lotIndex > sellIndex);
  assert.ok(buyIndex > lotIndex);
  assert.match(source, /onSell\?: \(context: AuxiliaryChartTradeActionContext\) => void/);
  assert.match(source, /onBuy\?: \(context: AuxiliaryChartTradeActionContext\) => void/);
  assert.match(source, /onDecreaseLot\?: \(context: AuxiliaryChartTradeActionContext\) => void/);
  assert.match(source, /onIncreaseLot\?: \(context: AuxiliaryChartTradeActionContext\) => void/);
  assert.doesNotMatch(source, /useTradeHandler|createOrder|placeOrder|submitOrder/);
});

test('production trade-row context stays structural across live quote and lot ticks', () => {
  const source = readSource('src/features/chart/components/AuxiliaryChartPane.tsx');
  const typeStart = source.indexOf('export type AuxiliaryChartTradeRowRenderContext');
  const typeEnd = source.indexOf('export type AuxiliaryChartPaneProps', typeStart);
  const contextStart = source.indexOf('const tradeRowRenderContext = useMemo');
  const contextEnd = source.indexOf('\n\n  return (', contextStart);
  const typeSource = source.slice(typeStart, typeEnd);
  const contextSource = source.slice(contextStart, contextEnd);

  assert.ok(typeStart >= 0 && typeEnd > typeStart);
  assert.ok(contextStart >= 0 && contextEnd > contextStart);
  assert.match(typeSource, /paneId\?: string/);
  assert.match(typeSource, /symbol: string/);
  assert.match(typeSource, /timeframe: string/);
  assert.match(typeSource, /displayDecimals: number/);
  assert.match(typeSource, /volumeBounds: TradeVolumeBounds/);
  assert.match(typeSource, /compactPane: boolean/);
  assert.doesNotMatch(typeSource, /AuxiliaryChartTradeActionContext|lotSize|\bbid\b|\bask\b/);
  assert.match(contextSource, /Object\.freeze\(\{[\s\S]*paneId,[\s\S]*symbol,[\s\S]*timeframe/);
  assert.match(contextSource, /volumeBounds: paneVolumeBounds/);
  assert.doesNotMatch(contextSource, /actionContext|lotSize|\bbid\b|\bask\b/);
});

test('auxiliary production trade row owns its symbol volume contract', () => {
  const source = readSource('src/features/chart/components/AuxiliaryChartPane.tsx');

  assert.match(source, /const \{ data: instrumentMeta \} = useInstrumentMeta\(symbol, isScreenFocused\)/);
  assert.match(
    source,
    /const paneVolumeBounds = useMemo<TradeVolumeBounds>\(\(\) => \(\{[\s\S]*minVolume: instrumentMeta\?\.minVolume[\s\S]*maxVolume: instrumentMeta\?\.maxVolume[\s\S]*stepVolume: instrumentMeta\?\.stepVolume/,
  );
  assert.match(source, /volumeBounds: paneVolumeBounds/);
  assert.match(source, /formatTradeVolume\(lotSize, paneVolumeBounds\)/);
  assert.match(source, /resolveTradeVolumeBounds\(paneVolumeBounds\)/);
  assert.doesNotMatch(source, /lotSize: number;\s*volumeBounds\?: TradeVolumeBounds/);
  assert.doesNotMatch(source, /instrumentMeta\?\.minVolume \?\? volumeBounds/);
});

test('production auxiliary trade row preserves both shared horizontal dividers', () => {
  const paneSource = readSource('src/features/chart/components/AuxiliaryChartPane.tsx');
  const stylesSource = readSource(
    'src/features/chart/components/ChartTradeButtonsFeature/styles.ts',
  );

  assert.match(paneSource, /COMPACT_TRADE_FOOTER_ROW_HEIGHT/);
  assert.match(
    paneSource,
    /styles\.renderedTradeRow,[\s\S]*minHeight: Math\.max\(COMPACT_TRADE_FOOTER_ROW_HEIGHT, density\.tradeRowHeight\)/,
  );
  assert.match(
    paneSource,
    /renderedTradeRow:\s*\{[\s\S]*minHeight: COMPACT_TRADE_FOOTER_ROW_HEIGHT,[\s\S]*overflow: 'visible'/,
  );
  assert.doesNotMatch(paneSource, /styles\.renderedTradeRow, \{ height:/);
  assert.match(
    stylesSource,
    /tradeControlsRow:\s*\{[\s\S]*borderTopWidth: 1, borderBottomWidth: 1/,
  );
});

test('native preview is bundled, bounded, and reports pane taps without an overlay', () => {
  const source = readSource('src/features/chart/preview/LiveChartPreview.native.tsx');

  assert.match(source, /LIGHTWEIGHT_CHARTS_JS/);
  assert.match(source, /<script>\$\{LIGHTWEIGHT_CHARTS_JS\}<\/script>/);
  assert.doesNotMatch(source, /https:\/\/unpkg\.com/);
  assert.match(source, /maxCandles\?: number/);
  assert.match(source, /sanitizePreviewCandles\(candles\)[\s\S]*slice\(-safeLimit\)/);
  assert.match(source, /PANE_TAP/);
  assert.match(source, /addEventListener\('touchstart'/);
  assert.match(source, /addEventListener\('touchend'/);
  assert.match(source, /moved <= 14/);
  assert.match(source, /PANE_DOUBLE_TAP/);
  assert.match(source, /x: x,[\s\S]*y: y,[\s\S]*width: width,[\s\S]*height: height/);
  assert.match(source, /var dataContextKey = window\._previewDataContextKey \|\| ''/);
  assert.match(source, /var dataGeneration = Number\(window\._previewDataGeneration\) \|\| 0/);
  assert.match(source, /dataContextKey: dataContextKey,[\s\S]*dataGeneration: dataGeneration/);
  assert.equal((source.match(/resolveChartWindowPaneGesture\(/g) ?? []).length, 2);
});

test('auxiliary chart receives the normal chart scale and volume preferences', () => {
  const paneSource = readSource('src/features/chart/components/AuxiliaryChartPane.tsx');
  const previewSource = readSource('src/features/chart/preview/LiveChartPreview.native.tsx');

  assert.match(paneSource, /chartAutoScaleEnabled: state\.chartAutoScaleEnabled/);
  assert.match(paneSource, /chartVerticalScrollingLocked: state\.chartVerticalScrollingLocked/);
  assert.match(paneSource, /chartViewportShowVolumePane: state\.chartViewportShowVolumePane/);
  assert.match(
    paneSource,
    /<LiveChartPreviewNative[\s\S]*fullChartParity[\s\S]*autoScaleEnabled=\{chartAutoScaleEnabled\}[\s\S]*verticalScrollingLocked=\{chartVerticalScrollingLocked\}[\s\S]*showVolumePane=\{chartViewportShowVolumePane\}/,
  );
  assert.match(previewSource, /setPreviewChartAutoScaleEnabled/);
  assert.match(previewSource, /setPreviewVerticalScrollingLocked/);
});

test('native preview debounces taps, resets price direction, and recovers WebView processes', () => {
  const source = readSource('src/features/chart/preview/LiveChartPreview.native.tsx');

  const nativeDelay = Number(
    source.match(/const PREVIEW_PANE_DOUBLE_TAP_WINDOW_MS = (\d+)/)?.[1],
  );
  const documentDelay = Number(
    source.match(/var PREVIEW_PANE_DOUBLE_TAP_MAX_DELAY_MS = (\d+)/)?.[1],
  );
  assert.ok(Number.isFinite(nativeDelay));
  assert.ok(Number.isFinite(documentDelay));
  assert.ok(
    nativeDelay > documentDelay,
    'native single-tap promotion needs bridge margin above double-tap recognition',
  );
  assert.match(source, /var PREVIEW_PANE_DOUBLE_TAP_MAX_DELAY_MS = 320/);
  assert.match(source, /var PREVIEW_PANE_DOUBLE_TAP_MAX_DISTANCE_PX = 24/);
  assert.match(
    source,
    /previousTap\.dataContextKey === dataContextKey[\s\S]*previousTap\.dataGeneration === dataGeneration[\s\S]*elapsed <= PREVIEW_PANE_DOUBLE_TAP_MAX_DELAY_MS[\s\S]*dx \* dx \+ dy \* dy <= maxDistanceSquared/,
  );
  assert.match(
    source,
    /lastPaneTap = isDoubleTap[\s\S]*\{ x: x, y: y, at: now, dataContextKey: dataContextKey, dataGeneration: dataGeneration \}/,
  );
  assert.match(
    source,
    /previewContextChanged[\s\S]*window\._previewDataGeneration = generation;[\s\S]*window\._previewDataContextKey = key;[\s\S]*if \(previewContextChanged\) resetPaneTapPairing\(\)/,
  );
  assert.match(
    source,
    /schedulePaneSingleTap[\s\S]*setTimeout\([\s\S]*onTap\(gesture\)[\s\S]*PREVIEW_PANE_DOUBLE_TAP_WINDOW_MS/,
  );
  assert.match(
    source,
    /data\.type === 'PANE_TAP'[\s\S]*onTapIntent\?\.\(gesture\);[\s\S]*schedulePaneSingleTap\(gesture\)/,
    'toolbar ownership must be claimed before waiting to confirm a single tap',
  );
  assert.match(
    source,
    /commitPaneDoubleTap[\s\S]*clearPendingPaneSingleTap\(\);[\s\S]*onDoubleTap\?\.\(gesture\)/,
  );
  assert.match(source, /useActiveBrokerCredentialScopeKey\(\)/);
  assert.match(
    source,
    /lastPreviewLinePriceRef\.current = null;[\s\S]*lastPreviewLineDirectionRef\.current = 'up';[\s\S]*\[brokerCredentialScopeKey, symbol\]/,
  );
  assert.match(source, /onLoadStart=\{resetWebViewBridgeState\}/);
  assert.match(source, /onContentProcessDidTerminate=\{recoverWebViewProcess\}/);
  assert.match(source, /onRenderProcessGone=\{recoverWebViewProcess\}/);
  assert.match(
    source,
    /resetWebViewBridgeState[\s\S]*setWebViewReady\(false\)[\s\S]*structuralSignatureRef\.current = ''/,
  );
  assert.match(source, /recoverWebViewProcess[\s\S]*webViewRef\.current\?\.reload\(\)/);
});

test('native preview follows horizontal and vertical pane resizes without remounting', () => {
  const source = readSource('src/features/chart/preview/LiveChartPreview.native.tsx');

  assert.match(source, /new ResizeObserver/);
  assert.match(source, /chart\.resize\(width, height\)/);
  assert.match(source, /window\.addEventListener\('resize', resizeChartToHost\)/);
});
