import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  assertSourceContains,
  assertSourceOmits,
  extractFunctionBody,
  readChartScreenSource,
} from '../support/chartSourceTestUtils';

const source = readChartScreenSource();
const readProjectSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('required drawing bridge functions remain exposed on window', () => {
  [
    'setDrawingTool',
    'clearDrawings',
    'setSerializedDrawings',
    'applyDrawingTextEdit',
    'cancelDrawingTextEdit',
    'setDrawingsLocked',
    'setDrawingsHidden',
    'setStayInDrawingMode',
    'zoomChart',
  ].forEach((method) => {
    assertSourceContains(source, new RegExp(`window\\.${method} = ${method}`), `${method} must remain a WebView bridge API`);
  });
});

test('drawing manager is recreated on chart init and removed before re-init', () => {
  const body = extractFunctionBody(source, '_doInitChart');

  assertSourceContains(body, /if \(window\._drawingManager\)[\s\S]*window\._drawingManager\.remove\(\)[\s\S]*window\._drawingManager = null/, 'old drawing manager must be removed before re-init');
  assertSourceContains(body, /new window\.DrawingToolsManager\(chart, series\)/, 'drawing manager must be recreated for the current series');
});

test('native drawing sync restores serialized drawings after chart ready epoch changes', () => {
  assertSourceContains(
    source,
    /if \(!isScreenFocused \|\| !preferencesHydrated \|\| !webViewReady \|\| !chartCanvasReady \|\| !webViewRef\.current\)/,
    'drawing sync must wait for chart focus and persisted drawing hydration before WebView replay',
  );
  assertSourceContains(
    source,
    /lastInjectedDrawingSyncRef\.current\.signature === chartDrawingSignature[\s\S]*lastInjectedDrawingSyncRef\.current\.epoch === chartReadyEpoch/,
    'drawing sync must be keyed by both drawing signature and chart ready epoch',
  );
  assertSourceContains(
    source,
    /setSerializedDrawings\(\$\{JSON\.stringify\(chartDrawingRecords\)\}\)/,
    'native side must inject serialized drawings into WebView',
  );
});

test('DRAWINGS_CHANGED sanitizes payload and persists only when signature changes', () => {
  assertSourceContains(
    source,
    /msg\.type === 'DRAWINGS_CHANGED'[\s\S]*sanitizePersistedChartDrawings\(msg\.drawings\)[\s\S]*unexpectedEmptyWebViewPayload[\s\S]*return;[\s\S]*nextSignature !== nativeDrawingSignature[\s\S]*setChartDrawingRecordsForSymbol\(chartSymbol, nextDrawings\)/,
    'drawing changes must be sanitized and persisted for the active chart symbol',
  );
});

test('drawing lock hide and sticky state are pushed after WebView chart is ready', () => {
  assertSourceContains(
    source,
    /if \(!webViewReady \|\| !chartCanvasReady\) return[\s\S]*setDrawingsLocked\(\$\{chartLockAll\}\)[\s\S]*setDrawingsHidden\(\$\{chartHideAll\}\)[\s\S]*setStayInDrawingMode\(\$\{stickyDrawingMode\}\)/,
    'drawing interaction flags must be bridged only after the chart exists',
  );
});

test('drawing tools open path is resilient to iOS chart overlay touch ordering', () => {
  const drawingFeatureSource = readProjectSource('src/features/chart/components/ChartDrawingToolsFeature.tsx');
  const drawingToolsSource = readProjectSource('src/features/chart/drawingTools/index.ts');
  const radialMenuSource = readProjectSource('src/features/chart/components/ChartTapRadialMenu.tsx');
  const actionSheetFactory = extractFunctionBody(
    drawingToolsSource,
    'createDrawingToolsActionSheetActions',
  );
  const drawingToolsOpenHandler = source.slice(
    source.indexOf('const handleOpenDrawingTools'),
    source.indexOf('const handleOpenSettingsScreen'),
  );

  assertSourceContains(
    drawingToolsOpenHandler,
    /runImmediateAction\('chart\.drawingTools\.open'[\s\S]*closeChartTapMenu\(\);[\s\S]*showChartActionSheet\(drawingToolsActionSheetConfig\)/,
    'opening drawing tools must close chart overlays before showing the sheet',
  );
  assertSourceContains(
    source,
    /const handleRadialOpenDrawingTools = useCallback\(\(\) => \{[\s\S]*closeChartTapMenu\(\);[\s\S]*routeChartWindowToolbarAction\('drawings'\);[\s\S]*\}, \[closeChartTapMenu, routeChartWindowToolbarAction\]\)/,
    'radial-menu drawing action must dismiss the overlay and retain the confirmed pane target',
  );
  assertSourceContains(
    source,
    /<ChartTapRadialMenu[\s\S]*onOpenDrawingTools=\{handleRadialOpenDrawingTools\}/,
    'radial menu must retain the stable drawing-tools callback during its entrance',
  );
  assertSourceContains(
    drawingFeatureSource,
    /onPress=\{onOpenDrawingTools\}[\s\S]*activateOnPressIn[\s\S]*activateOnTouchStart/,
    'drawing toolbar opener must fire on touch-down for iOS',
  );
  assertSourceContains(
    drawingFeatureSource,
    /onPress=\{\(\) => onSelectTool\(entry\.definition\.tool\)\}[\s\S]*activateOnPressIn[\s\S]*activateOnTouchStart/,
    'drawing sidebar tool rows must fire on touch-down for iOS',
  );
  assertSourceContains(
    actionSheetFactory,
    /DRAWING_SHEET_OPTIONS\.map\(\(definition\) => \(\{[\s\S]*onPress: \(\) => config\.onSelectTool\(definition\.tool\)/,
    'drawing action sheet selectable rows must retain their confirmed-tap handlers',
  );
  assertSourceContains(
    actionSheetFactory,
    /const buildCommandAction = \(definition: DrawingToolCommandDefinition\)[\s\S]*onPress: commandHandlers\[definition\.key\][\s\S]*historyCommands\.map\(buildCommandAction\)[\s\S]*utilityCommands\.map\(buildCommandAction\)/,
    'drawing action sheet command rows must retain their confirmed-tap handlers',
  );
  assertSourceOmits(
    actionSheetFactory,
    /activateOnPressIn:\s*true/,
    'scrollable drawing action sheet rows must not execute while a scroll gesture begins',
  );
  assertSourceContains(
    radialMenuSource,
    /onPress=\{\(event\) => handleActionItemPress\(event, item\.onPress\)\}[\s\S]*activateOnPressIn[\s\S]*activateOnTouchStart/,
    'radial action items must not wait for iOS press release before opening drawing tools',
  );
});

test('drawing WebView touch bridge supports iOS pointer events', () => {
  const enhancedDrawingSource = readProjectSource('src/features/chart/plugins/enhancedDrawingToolsString.ts');

  assertSourceContains(
    enhancedDrawingSource,
    /_supportsPointerTouchBridge[\s\S]*typeof window\.PointerEvent === 'function'/,
    'drawing manager must detect WKWebView pointer-event capable touch input',
  );
  assertSourceContains(
    enhancedDrawingSource,
    /host\.addEventListener\('pointerdown', this\._handlePointerStart[\s\S]*host\.addEventListener\('pointermove', this\._handlePointerMove[\s\S]*host\.addEventListener\('pointerup', this\._handlePointerEnd[\s\S]*host\.addEventListener\('pointercancel', this\._handlePointerCancel/,
    'drawing manager must bind pointer events when the WebView dispatches them',
  );
  assertSourceContains(
    enhancedDrawingSource,
    /_handlePointerStart = function \(event\) \{[\s\S]*_buildPointerTouchEvent\(event, 'start'\)[\s\S]*this\._handleTouchStart\(touchEvent\)/,
    'pointerdown must feed the existing drawing touch-start path',
  );
  assertSourceContains(
    enhancedDrawingSource,
    /var tool = this\._getActiveTouchTool\(\);[\s\S]*var touch = this\._findTrackedTouch\(event\.changedTouches \|\| event\.touches\);[\s\S]*this\._suppressHostTapMenu\(\);[\s\S]*this\._activeTouchId = touch\.identifier/,
    'active drawing touches must suppress the host chart-tap menu while drawing',
  );
});
