import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('confirmed chart fills use the thin receipt inside the chart viewport', () => {
  const chartSource = readSource('src/features/chart/ChartScreen.native.tsx');
  const stylesSource = readSource('src/features/chart/ChartScreen.styles.ts');
  const autoDismissSource = readSource('src/ui/components/useConfirmedTradeReceiptAutoDismiss.ts');

  assert.match(
    chartSource,
    /const chartTradeReceipt = resolveConfirmedTradeReceipt\(tradeFeedback\)/,
  );
  assert.match(
    chartSource,
    /useConfirmedTradeReceiptAutoDismiss\(tradeFeedback, handleTradeFeedbackClose\)/,
  );
  assert.match(autoDismissSource, /CONFIRMED_TRADE_RECEIPT_VISIBLE_MS = 5_000/);
  assert.match(
    autoDismissSource,
    /const activeReceiptKeyRef = useRef\(receiptKey\)[\s\S]*setTimeout\(\(\) => \{[\s\S]*activeReceiptKeyRef\.current === receiptKey[\s\S]*onClose\(\)[\s\S]*CONFIRMED_TRADE_RECEIPT_VISIBLE_MS[\s\S]*clearTimeout\(timer\)/,
  );

  // The receipt markup is shared by two mount points: inline in the chart
  // viewport (normal flow) and through the elevated feedback portal while the
  // SL/TP trade sheet is open, so the confirmation shows ABOVE the sheet.
  const receiptRendererStart = chartSource.indexOf(
    'const renderChartTradeReceiptBar = (receipt: NonNullable<typeof chartTradeReceipt>)',
  );
  assert.notEqual(receiptRendererStart, -1);
  const receiptMarkup = chartSource.slice(receiptRendererStart, receiptRendererStart + 3000);
  assert.match(
    receiptMarkup,
    /chartTradeReceiptSymbol[\s\S]*receipt\.symbol[\s\S]*chartTradeReceiptSide[\s\S]*sideAccessibilityLabel[\s\S]*chartTradeReceiptVolume[\s\S]*volumeLabel[\s\S]*chartTradeReceiptDone[\s\S]*done/,
  );
  assert.match(receiptMarkup, /onPress=\{handleTradeFeedbackClose\}/);

  const viewportStart = chartSource.indexOf('ref={chartViewportRef}');
  const receiptStart = chartSource.indexOf(
    '{chartTradeReceipt && !showChartTradeSheet',
    viewportStart,
  );
  const timeframeOverlayStart = chartSource.indexOf('<ChartTimeframePickerOverlay', receiptStart);
  assert.notEqual(viewportStart, -1);
  assert.ok(receiptStart > viewportStart);
  assert.ok(timeframeOverlayStart > receiptStart);
  assert.match(
    chartSource.slice(receiptStart, timeframeOverlayStart),
    /renderChartTradeReceiptBar\(chartTradeReceipt\)/,
  );

  assert.match(
    chartSource,
    /<ChartTradeFeedbackPortal enabled=\{showChartTradeSheet\}>[\s\S]*?\{chartTradeReceipt && showChartTradeSheet[\s\S]*?renderChartTradeReceiptBar\(chartTradeReceipt\)[\s\S]*?<TradeFeedbackModal[\s\S]*state=\{chartTradeReceipt \? TRADE_MODAL_INITIAL : tradeFeedback\}[\s\S]*?<\/ChartTradeFeedbackPortal>/,
  );

  const receiptStylesStart = stylesSource.indexOf('chartTradeReceiptHost:');
  const receiptStylesEnd = stylesSource.indexOf('footerLotKeyboardProxyInput:', receiptStylesStart);
  assert.notEqual(receiptStylesStart, -1);
  assert.ok(receiptStylesEnd > receiptStylesStart);
  const receiptStyles = stylesSource.slice(receiptStylesStart, receiptStylesEnd);

  assert.match(
    receiptStyles,
    /left: 0[\s\S]*right: 0[\s\S]*bottom: 16[\s\S]*alignItems: 'center'[\s\S]*chartTradeReceiptBar:[\s\S]*width: '90%'[\s\S]*minWidth: 0[\s\S]*maxWidth: 230[\s\S]*minHeight: 40[\s\S]*flexDirection: 'row'[\s\S]*backgroundColor: isDark \? T\.glass2 : '#FFFFFF'[\s\S]*borderLeftWidth: 3[\s\S]*borderRadius: 2[\s\S]*paddingHorizontal: 10[\s\S]*elevation: 6[\s\S]*gap: 8/,
  );
  assert.match(
    receiptStyles,
    /chartTradeReceiptVolume:[\s\S]*minWidth: 44[\s\S]*flexGrow: 0[\s\S]*flexShrink: 0/,
  );
  assert.doesNotMatch(
    receiptStyles,
    /minHeight: 68|width: 42|height: 42|borderRadius: 16|paddingVertical: 12/,
  );
});

test('rapid chart trades use one uncapped MT5-style receipt row per accepted tap', () => {
  const chartSource = readSource('src/features/chart/ChartScreen.native.tsx');
  const handlerSource = readSource(
    'src/features/chart/components/ChartTradeButtonsFeature/useTradeHandler.ts',
  );
  const stackSource = readSource(
    'src/features/chart/components/ChartTradeReceiptStack.tsx',
  );
  const controllerSource = readSource(
    'src/features/chart/components/chartTradeReceiptStackController.ts',
  );

  assert.doesNotMatch(
    handlerSource,
    /CHART_TRADE_QUEUE_LIMIT|pendingTradeCount|TRADE-QUEUE-FULL|Trade Queue Full|tradeQueueRef|processNextQueuedTrade/,
  );
  assert.match(
    handlerSource,
    /dispatchChartTradeImmediately\(\{[\s\S]*emitTradeQueueEvent\(trade, 'pending'\);[\s\S]*dispatch: dispatchAcceptedChartTrade/,
  );
  assert.match(
    handlerSource,
    /reportAcceptedTradeResult\([\s\S]*executionEvidence\.confirmed \? 'confirmed' : 'unconfirmed'/,
  );
  assert.match(
    handlerSource,
    /const mountedRef = React\.useRef\(true\)[\s\S]*mountedRef\.current = false/,
  );
  assert.match(
    handlerSource,
    /onSuccess: \(data: any\) => \{[\s\S]*if \(!mountedRef\.current\) \{[\s\S]*releaseChartProtectionDraftSubmission\(acceptedTrade\.protectionDraftId\)/,
  );
  assert.match(
    handlerSource,
    /const emitTradeQueueEvent = React\.useCallback\([\s\S]*if \(!mountedRef\.current\) return;/,
  );
  assert.match(
    chartSource,
    /createChartTradeReceiptStackController\(\)[\s\S]*handleChartTradeQueueEvent[\s\S]*chartTradeReceiptStackController\.applyEvent\(event\)/,
  );
  assert.equal(
    chartSource.match(/<ChartTradeReceiptStack/g)?.length,
    3,
    'filtered stacks must cover both divided panes plus the elevated trade-sheet portal',
  );
  const chartScrollRefIndex = chartSource.indexOf('ref={chartScrollRef}');
  const outerScrollStart = chartSource.lastIndexOf('<ScrollView', chartScrollRefIndex);
  const chartTradeOverlayLayerIndex = chartSource.indexOf(
    '{chartTradeOverlayLayer}',
    chartScrollRefIndex,
  );
  const outerScrollEnd = chartSource.lastIndexOf(
    '</ScrollView>',
    chartTradeOverlayLayerIndex,
  );
  assert.ok(chartScrollRefIndex > outerScrollStart);
  assert.ok(chartTradeOverlayLayerIndex > outerScrollEnd);
  assert.doesNotMatch(
    chartSource.slice(outerScrollStart, outerScrollEnd),
    /<ChartTradeReceiptStack/,
    'a vertical FlatList receipt stack must not mount inside the chart vertical ScrollView',
  );
  assert.match(
    chartSource.slice(outerScrollEnd, chartTradeOverlayLayerIndex),
    /chartTradeReceiptViewportStyle[\s\S]*<ChartTradeReceiptStack/,
    'the normal receipt stack must remain aligned to the chart viewport as a ScrollView sibling',
  );
  assert.match(stackSource, /useSyncExternalStore\([\s\S]*controller\.subscribe/);
  assert.match(
    stackSource,
    /const preferredListWidth = Math\.min\(238, Math\.max\(208, windowWidth \* 0\.54\)\);[\s\S]*Number\(paneWidth\) - 12/,
  );
  assert.match(
    handlerSource,
    /const acceptedTrade: AcceptedChartTrade = \{[\s\S]*chartWindowPaneId \? \{ chartWindowPaneId \}/,
  );
  assert.match(
    handlerSource,
    /chartWindowPaneId: acceptedTrade\.chartWindowPaneId/,
  );
  assert.match(
    stackSource,
    /selectChartTradeReceiptSnapshotForPane\(snapshot, chartWindowPaneId\)/,
  );
  assert.match(
    chartSource,
    /chartWindowPaneId=\{chartWindows\.activePane\.id\}[\s\S]*paneWidth=\{chartTapMenuViewport\.width\}/,
  );
  assert.match(
    chartSource,
    /chartWindowPaneId=\{auxiliaryChartPaneViewport\.paneId\}[\s\S]*paneWidth=\{auxiliaryChartPaneViewport\.width\}/,
  );
  assert.match(
    stackSource,
    /side:\s*\{[\s\S]*?width: 36,[\s\S]*?marginLeft: 8,[\s\S]*?textAlign: 'center'/,
  );
  assert.match(stackSource, /<FlatList[\s\S]*data=\{receipts\}[\s\S]*keyExtractor=\{\(item\) => String\(item\.queueId\)\}/);
  assert.match(stackSource, /event\.status === 'pending'[\s\S]*<ActivityIndicator/);
  assert.match(stackSource, /onPress=\{\(\) => onDismiss\(event\.queueId\)\}/);
  assert.match(
    controllerSource,
    /if \(existingIndex < 0\) \{\s*return \[event, \.\.\.snapshot\];/,
  );
  assert.match(controllerSource, /const dismissTimers = new Map<number,/);
  assert.match(controllerSource, /removeChartTradeReceipt\(snapshot, queueId\)/);
  assert.doesNotMatch(controllerSource, /\.slice\(0\s*,/);
});
