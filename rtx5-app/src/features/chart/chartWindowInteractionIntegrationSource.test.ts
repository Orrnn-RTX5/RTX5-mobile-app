import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

const screenSource = readSource('src/features/chart/ChartScreen.native.tsx');
const layoutSource = readSource('src/features/chart/components/ChartWindowsLayout.tsx');
const auxiliarySource = readSource('src/features/chart/components/AuxiliaryChartPane.tsx');
const previewSource = readSource('src/features/chart/preview/LiveChartPreview.native.tsx');
const objectsSource = readSource('src/features/chart/ObjectsScreen/ObjectsScreen.tsx');
const controllerSource = readSource('src/features/chart/useChartWindowsFeature.ts');
const historySource = readSource('src/features/chart/chartWindowDrawingHistory.ts');

test('pane-owned drawings are restored independently and rendered read-only in the inactive pane', () => {
  assert.match(screenSource, /expandChartDrawingsForSplitWindows\(/);
  assert.match(screenSource, /collapseChartDrawingsToSingleWindow\(/);
  assert.match(
    screenSource,
    /filterChartDrawingRecordsForCurrentChart\([\s\S]*chartWindows\.isSplit \? chartWindows\.activePane\.id : undefined/,
  );
  assert.match(screenSource, /replaceChartWindowPaneDrawings\(/);
  assert.match(
    screenSource,
    /chartWindows\.isSplit[\s\S]*msg\.chartWindowPaneId !== chartWindows\.activePane\.id/,
  );
  assert.match(layoutSource, /drawings=\{drawingsByPane\?\.\[auxiliaryPane\.id\] \?\? \[\]\}/);
  assert.match(auxiliarySource, /drawings=\{drawings\}/);
  assert.match(previewSource, /new window\.DrawingToolsManager\(chart, series\)/);
  assert.match(previewSource, /setPreviewSerializedDrawings/);
  assert.match(previewSource, /manager\.setDrawingsLocked\(true\)/);
});

test('Objects edits remain inside the pane that opened the More action', () => {
  assert.match(screenSource, /chartWindowPaneId,[\s\S]*chartWindowSplit: String\(chartWindows\.isSplit\)/);
  assert.match(objectsSource, /drawing\.chartWindowPaneId === chartWindowPaneId/);
  assert.match(objectsSource, /drawing\.chartWindowPaneId !== chartWindowPaneId/);
  assert.match(objectsSource, /setAllChartDrawingRecordsForSymbol\(symbol, \[\.\.\.retained, \.\.\.scopedNext\]\)/);
});

test('imperative More commands and protection guides reach the targeted preview panes', () => {
  assert.match(screenSource, /routeChartWindowViewportCommand/);
  assert.match(screenSource, /viewportCommandsByPane=\{chartWindowViewportCommands\}/);
  assert.match(screenSource, /overlayPriceLinesByPane=\{chartWindowProtectionPriceLinesByPane\}/);
  assert.match(layoutSource, /viewportCommand=\{viewportCommandsByPane\?\.\[auxiliaryPane\.id\]\}/);
  assert.match(layoutSource, /overlayPriceLines=\{overlayPriceLinesByPane\?\.\[auxiliaryPane\.id\] \?\? \[\]\}/);
  assert.match(previewSource, /function applyPreviewWindowCommand\(commandType\)/);
  assert.match(previewSource, /commandType === 'scrollToLastBar'/);
  assert.match(previewSource, /commandType === 'resetViewport'/);
});

test('persisted positions reach every matching-symbol auxiliary pane with its local quote', () => {
  assert.match(screenSource, /<ChartWindowsLayout[\s\S]*positions=\{positions\}/);
  assert.match(layoutSource, /<AuxiliaryChartPane[\s\S]*positions=\{positions\}/);
  assert.match(auxiliarySource, /buildAuxiliaryChartTradeOverlayPriceLines\(\{/);
  assert.match(
    auxiliarySource,
    /symbol,[\s\S]*positions,[\s\S]*liveBid: bid,[\s\S]*liveAsk: ask,[\s\S]*showOnChart: chartShowOnChart/,
  );
  assert.match(
    auxiliarySource,
    /overlayPriceLines=\{combinedOverlayPriceLines\}/,
  );
});

test('same-context pane promotion waits one frame before reading pane-local menu state', () => {
  assert.match(controllerSource, /const confirmToolbarTargetAfterPaneCommit/);
  assert.match(
    controllerSource,
    /requestAnimationFrame\(\(\) => \{[\s\S]*confirmToolbarTarget\(confirmedPane, confirmedContext\)/,
  );
});

test('a delayed single tap cannot dismiss or replace an immediate toolbar action', () => {
  const selectionStart = screenSource.indexOf(
    'const handleSelectChartWindowPane = useCallback',
  );
  const selectionEnd = screenSource.indexOf(
    'const cancelPendingChartWindowRadialMenu = useCallback',
    selectionStart,
  );
  const selectionSource = screenSource.slice(selectionStart, selectionEnd);

  assert.match(selectionSource, /currentState\.activePaneId === paneId/);
  assert.doesNotMatch(selectionSource, /hideChartTimeframePicker|hideActionSheet|snapTradeSheet/);
  assert.match(
    controllerSource,
    /pendingTransition\?\.targetPane\.id === paneId[\s\S]*pendingTransition\.kind === 'select-pane'[\s\S]*pendingTransition\.kind === 'update-toolbar-context'[\s\S]*return;/,
  );
});

test('split drawing undo redo zoom and tool restoration are pane aware', () => {
  assert.match(historySource, /getChartWindowDrawingHistoryKey/);
  assert.match(historySource, /undoChartWindowDrawingHistory/);
  assert.match(historySource, /redoChartWindowDrawingHistory/);
  assert.match(screenSource, /applyChartWindowDrawingHistoryAction\('undo'\)/);
  assert.match(screenSource, /applyChartWindowDrawingHistoryAction\('redo'\)/);
  assert.match(
    screenSource,
    /const handleZoomTool = useCallback[\s\S]*routeChartWindowViewportCommand\('resetViewport'\)/,
  );
  assert.match(
    screenSource,
    /setSerializedDrawings\([\s\S]*setDrawingTool\(\$\{JSON\.stringify\(bridgedTool\)\}/,
  );
});

test('Remove from favorites updates both local and authenticated server state', () => {
  assert.match(screenSource, /removeQuoteSymbol\(chartSymbol\)/);
  assert.match(screenSource, /if \(isLoggedIn\) \{[\s\S]*removeServerWatchlistSymbol\(chartSymbol\)/);
});
