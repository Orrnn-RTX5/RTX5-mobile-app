import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { dismissBeforeDrawingToolsSelection } from './drawingTools/actionSheetSelection';

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

test('drawing tools action sheet exposes the full supported tool set', () => {
  const source = readSource('src/features/chart/drawingTools/index.ts');
  const arrowSource = readSource('src/features/chart/drawingTools/arrowMarkerTool.tsx');
  const ellipseSource = readSource('src/features/chart/drawingTools/ellipseTool.tsx');
  const extendedLineSource = readSource('src/features/chart/drawingTools/extendedLineTool.tsx');
  const fibExtensionSource = readSource('src/features/chart/drawingTools/fibExtensionTool.tsx');
  const fibSource = readSource('src/features/chart/drawingTools/fibZoneTool.tsx');
  const freehandSource = readSource('src/features/chart/drawingTools/freehandBrushTool.tsx');
  const horizontalRaySource = readSource('src/features/chart/drawingTools/horizontalRayTool.tsx');
  const measureSource = readSource('src/features/chart/drawingTools/measureRangeTool.tsx');
  const magnetSource = readSource('src/features/chart/drawingTools/magnetModeTool.tsx');
  const rectangleSource = readSource('src/features/chart/drawingTools/rectangleTool.tsx');
  const redoSource = readSource('src/features/chart/drawingTools/redoDrawingTool.tsx');
  const undoSource = readSource('src/features/chart/drawingTools/undoDrawingTool.tsx');
  const sheetOptions = source.slice(
    source.indexOf('export const DRAWING_SHEET_OPTIONS'),
    source.indexOf('export const DRAWING_TOOL_COMMANDS'),
  );
  const commandOptions = source.slice(
    source.indexOf('export const DRAWING_TOOL_COMMANDS'),
    source.indexOf('export const DRAWING_TOOL_SIDEBAR_GROUPS'),
  );
  const toolbarOptions = source.slice(
    source.indexOf('export const DRAWING_TOOL_OPTIONS'),
    source.indexOf('export const DRAWING_SHEET_OPTIONS'),
  );
  const actionSheetFactory = source.slice(
    source.indexOf('export function createDrawingToolsActionSheetActions'),
  );

  assert.match(toolbarOptions, /\btextLabelDrawingTool\b/);
  assert.match(toolbarOptions, /\bextendedLineDrawingTool\b/);
  assert.match(toolbarOptions, /\bhorizontalRayDrawingTool\b/);
  assert.match(sheetOptions, /\.\.\.DRAWING_TOOL_OPTIONS/);
  assert.match(arrowSource, /actionLabel:\s*'Arrow \/ Marker'/);
  assert.match(ellipseSource, /actionLabel:\s*'Circle \/ Ellipse'/);
  assert.match(extendedLineSource, /actionLabel:\s*'Extended Line'/);
  assert.match(fibSource, /actionLabel:\s*'Fibonacci Retracement'/);
  assert.match(fibExtensionSource, /actionLabel:\s*'Fibonacci Extension'/);
  assert.match(freehandSource, /actionLabel:\s*'Freehand Brush'/);
  assert.match(horizontalRaySource, /actionLabel:\s*'Horizontal Ray'/);
  assert.match(measureSource, /actionLabel:\s*'Scale'/);
  assert.match(rectangleSource, /actionLabel:\s*'Rectangle'/);
  assert.match(undoSource, /actionLabel:\s*'Undo Drawing'/);
  assert.match(redoSource, /actionLabel:\s*'Redo Drawing'/);
  assert.match(commandOptions, /undoDrawingToolAction[\s\S]*redoDrawingToolAction/);
  assert.match(source, /key:\s*'history'[\s\S]*undoDrawingToolAction[\s\S]*redoDrawingToolAction/);
  assert.match(actionSheetFactory, /const historyCommands = DRAWING_TOOL_COMMANDS\.filter/);
  assert.match(
    actionSheetFactory,
    /return \[\s*\.\.\.historyCommands\.map\(buildCommandAction\)[\s\S]*\.\.\.DRAWING_SHEET_OPTIONS\.map[\s\S]*\.\.\.utilityCommands\.map\(buildCommandAction\)/,
  );
  // The classic sheet keeps its original roster; selection-management rows are
  // double-tap-quick-menu-only.
  assert.doesNotMatch(actionSheetFactory.slice(0, actionSheetFactory.indexOf('export function createDrawingQuickActionsSheetActions')), /selectionCommands/);
  assert.doesNotMatch(actionSheetFactory, /activateOnPressIn:\s*true/);
  assert.match(source, /\bmagnetModeDrawingToolAction\b/);
  assert.match(magnetSource, /actionLabel:\s*\(\{ drawingMagnetMode \}\)/);
  for (const toolDefinition of [
    'horizontalLineDrawingTool',
    'verticalLineDrawingTool',
    'rayDrawingTool',
    'arrowMarkerDrawingTool',
    'parallelChannelDrawingTool',
    'fibExtensionDrawingTool',
    'rectangleDrawingTool',
    'ellipseDrawingTool',
    'freehandBrushDrawingTool',
    'highlightBoxDrawingTool',
    'patternPathDrawingTool',
    'pitchforkDrawingTool',
    'shortPositionDrawingTool',
    'stickerDrawingTool',
  ]) {
    assert.match(sheetOptions, new RegExp(`\\b${toolDefinition}\\b`));
  }
});

test('drawing-management options stay conditional on chart drawing state', () => {
  const source = readSource('src/features/chart/drawingTools/index.ts');
  const commandOptions = source.slice(
    source.indexOf('export const DRAWING_TOOL_COMMANDS'),
    source.indexOf('export const DRAWING_TOOL_SIDEBAR_GROUPS'),
  );
  const undoSource = readSource('src/features/chart/drawingTools/undoDrawingTool.tsx');
  const redoSource = readSource('src/features/chart/drawingTools/redoDrawingTool.tsx');
  const selectSource = readSource('src/features/chart/drawingTools/selectDrawingTool.tsx');
  const deleteSelectedSource = readSource('src/features/chart/drawingTools/deleteSelectedDrawingTool.tsx');
  const lockSelectedSource = readSource('src/features/chart/drawingTools/lockSelectedDrawingTool.tsx');
  const hideSelectedSource = readSource('src/features/chart/drawingTools/hideSelectedDrawingTool.tsx');
  const showAllSource = readSource('src/features/chart/drawingTools/showAllDrawingsTool.tsx');
  const unlockAllSource = readSource('src/features/chart/drawingTools/unlockAllDrawingsTool.tsx');
  const lockAllSource = readSource('src/features/chart/drawingTools/lockAllDrawingsTool.tsx');
  const hideAllSource = readSource('src/features/chart/drawingTools/hideAllDrawingsTool.tsx');
  const clearSource = readSource('src/features/chart/drawingTools/clearDrawingsTool.tsx');

  // Full command roster, in sheet order.
  assert.match(
    commandOptions,
    /undoDrawingToolAction[\s\S]*redoDrawingToolAction[\s\S]*selectDrawingToolAction[\s\S]*deleteSelectedDrawingToolAction[\s\S]*lockSelectedDrawingToolAction[\s\S]*hideSelectedDrawingToolAction[\s\S]*zoomToFitDrawingToolAction[\s\S]*lockAllDrawingsDrawingToolAction[\s\S]*unlockAllDrawingsToolAction[\s\S]*hideAllDrawingsDrawingToolAction[\s\S]*showAllDrawingsToolAction[\s\S]*clearDrawingsDrawingToolAction/,
  );

  // Undo/redo only enabled when their history stacks have entries.
  assert.match(undoSource, /isDisabled:\s*\(\{ canUndoDrawing \}\) => canUndoDrawing === false/);
  assert.match(redoSource, /isDisabled:\s*\(\{ canRedoDrawing \}\) => canRedoDrawing === false/);

  // Selection management rows require drawings; per-selection rows require a selection.
  assert.match(selectSource, /actionLabel:\s*'Select Drawing'/);
  assert.match(selectSource, /isVisible:\s*\(\{ hasDrawings \}\) => hasDrawings !== false/);
  assert.match(deleteSelectedSource, /actionLabel:\s*'Delete Selected Drawing'/);
  assert.match(deleteSelectedSource, /danger:\s*true/);
  assert.match(deleteSelectedSource, /isDisabled:\s*\(\{ hasSelectedDrawing \}\) => hasSelectedDrawing !== true/);
  assert.match(deleteSelectedSource, /isVisible:\s*\(\{ hasDrawings \}\) => hasDrawings !== false/);
  assert.match(
    lockSelectedSource,
    /selectedDrawingLocked \? 'Unlock Selected Drawing' : 'Lock Selected Drawing'/,
  );
  assert.match(lockSelectedSource, /isDisabled:\s*\(\{ hasSelectedDrawing \}\) => hasSelectedDrawing !== true/);
  assert.match(hideSelectedSource, /actionLabel:\s*'Hide Selected Drawing'/);
  assert.match(hideSelectedSource, /isDisabled:\s*\(\{ hasSelectedDrawing \}\) => hasSelectedDrawing !== true/);

  // The classic Drawing Tools sheet keeps its original fixed roster with
  // Delete All Drawings last; the conditional visibility below applies to the
  // double-tap quick menu.
  assert.match(
    source.slice(source.indexOf('const CLASSIC_UTILITY_COMMAND_KEYS'), source.indexOf('export function createDrawingToolsCommandHandlers')),
    /'zoomToFit',\s*'toggleMagnetMode',\s*'stayInDrawingMode',\s*'lockAllDrawings',\s*'hideAllDrawings',\s*'clearDrawings',/,
  );

  // Bulk rows hide with no drawings; Show All / Unlock All appear only for
  // individually hidden/locked drawings while the global toggles are off.
  assert.match(lockAllSource, /isVisible:\s*\(\{ hasDrawings \}\) => hasDrawings !== false/);
  assert.match(hideAllSource, /isVisible:\s*\(\{ hasDrawings \}\) => hasDrawings !== false/);
  assert.match(showAllSource, /hasDrawings !== false && !chartHideAll && hasHiddenDrawings === true/);
  assert.match(unlockAllSource, /hasDrawings !== false && !chartLockAll && hasLockedDrawings === true/);
  assert.match(clearSource, /actionLabel:\s*'Delete All Drawings'/);
  assert.match(clearSource, /isVisible:\s*\(\{ hasDrawings \}\) => hasDrawings !== false/);

  // ChartScreen wiring: delete-all confirms first, selected-drawing commands
  // reach the WebView engine, and the engine's menu request opens the sheet.
  const chartSource = readSource('src/features/chart/ChartScreen.native.tsx');
  assert.match(chartSource, /onClearDrawings:\s*handleRequestDeleteAllDrawings/);
  assert.match(
    chartSource,
    /const handleRequestDeleteAllDrawings = useCallback\(\(\) => \{[\s\S]*?Alert\.alert\([\s\S]*?t\('Delete All Drawings'\)[\s\S]*?style: 'destructive'/,
  );
  assert.match(chartSource, /injectChartScript\('removeSelectedDrawing\(\);'\)/);
  assert.match(chartSource, /injectChartScript\('setSelectedDrawingHidden\(true\);'\)/);
  assert.match(chartSource, /injectChartScript\('clearDrawingSelection\(\);'\)/);
  assert.match(chartSource, /injectChartScript\('unlockAllDrawings\(\);'\)/);
  assert.match(chartSource, /msg\.type === 'DRAWING_ACTION_MENU_REQUEST'/);
  assert.match(chartSource, /openSelectedDrawingActionSheet\(/);
  assert.match(chartSource, /msg\.selectedDrawingId/);
  assert.match(chartSource, /msg\.canUndo === true/);

  // Empty-chart double-tap shortcut: quick sheet carries only the management
  // commands and reuses the exact same handlers as the full sheet.
  assert.match(chartSource, /msg\.type === 'DRAWING_QUICK_ACTIONS_REQUEST'/);
  assert.match(
    chartSource,
    /const openDrawingQuickActionsSheet = useCallback\(\(\) => \{[\s\S]*?if \(!hasChartDrawings\)[\s\S]*?createDrawingQuickActionsSheetActions\(/,
  );
  const quickFactory = source.slice(
    source.indexOf('export function createDrawingQuickActionsSheetActions'),
  );
  assert.match(
    quickFactory,
    /QUICK_ACTION_COMMAND_KEYS\.has\(definition\.key\)[\s\S]*onPress: commandHandlers\[definition\.key\]/,
  );
  for (const quickKey of [
    "'undoDrawing'",
    "'redoDrawing'",
    "'selectDrawing'",
    "'deleteSelectedDrawing'",
    "'lockSelectedDrawing'",
    "'hideSelectedDrawing'",
    "'lockAllDrawings'",
    "'unlockAllDrawings'",
    "'hideAllDrawings'",
    "'showAllDrawings'",
    "'clearDrawings'",
  ]) {
    assert.ok(
      source
        .slice(source.indexOf('const QUICK_ACTION_COMMAND_KEYS'), source.indexOf('export function createDrawingQuickActionsSheetActions'))
        .includes(quickKey),
      `quick actions must include ${quickKey}`,
    );
  }
});

test('blank drawing search keeps every tool directly selectable on the chart', () => {
  const drawingSource = readSource('src/features/chart/drawingTools/index.ts');
  const chartSource = readSource('src/features/chart/ChartScreen.native.tsx');
  const actionSheetFactory = drawingSource.slice(
    drawingSource.indexOf('export function createDrawingToolsActionSheetActions'),
  );
  const setToolHandler = chartSource.slice(
    chartSource.indexOf('const handleSetTool = useCallback'),
    chartSource.indexOf('const handleClearDrawings = useCallback'),
  );
  const drawingSheetConfig = chartSource.slice(
    chartSource.indexOf('const drawingToolsActionSheetConfig'),
    chartSource.indexOf('const handleOpenDrawingTools'),
  );
  const drawingSheetHandler = chartSource.slice(
    chartSource.indexOf('const handleOpenDrawingTools'),
    chartSource.indexOf('const handleOpenSettingsScreen'),
  );
  const drawingSheetPreload = chartSource.slice(
    chartSource.indexOf("preloadScopedActionSheet('chart', drawingToolsActionSheetConfig)"),
    chartSource.indexOf('const handleOpenDrawingTools'),
  );

  assert.match(
    actionSheetFactory,
    /DRAWING_SHEET_OPTIONS\.map\(\(definition\) => \(\{[\s\S]*onPress:\s*\(\) => config\.onSelectTool\(definition\.tool\)/,
  );
  assert.match(chartSource, /onSelectTool:\s*handleSetTool/);
  assert.match(setToolHandler, /setActiveTool\(tool\)/);
  assert.match(setToolHandler, /setChartDrawingInputActive\(nextDrawingInputActive\)/);
  assert.match(setToolHandler, /injectChartScript\(`setDrawingTool\(/);
  assert.match(drawingSheetConfig, /searchable:\s*true/);
  assert.match(drawingSheetConfig, /maximumVisibleActionRows:\s*12/);
  assert.match(drawingSheetConfig, /detent:\s*'large'/);
  assert.match(drawingSheetConfig, /instantOpen:\s*true/);
  assert.match(drawingSheetConfig, /entryMotion:\s*'instant'/);
  assert.doesNotMatch(drawingSheetConfig, /entryMotion:\s*'mt5Slide'/);
  assert.match(drawingSheetConfig, /keepFullHeightOnKeyboard:\s*true/);
  assert.match(drawingSheetConfig, /runActionAfterClose:\s*false/);
  assert.match(
    drawingSheetPreload,
    /useUIState\.subscribe\(\(state, previousState\) => \{[\s\S]*previousState\.scopedActionSheets\.chart !== null[\s\S]*state\.scopedActionSheets\.chart === null[\s\S]*preloadScopedActionSheet\('chart', drawingToolsActionSheetConfig\)/,
  );
  assert.match(
    drawingSheetHandler,
    /requestRetainedActionSheetPreview\(drawingToolsVisualKey\)[\s\S]*commitRetainedActionSheetPreview\([\s\S]*retainedRevision,[\s\S]*drawingToolsVisualKey,[\s\S]*\)[\s\S]*if \(retainedRevealAccepted\) \{[\s\S]*scheduleAfterFirstFrame\(adoptDrawingToolsSheet\)[\s\S]*return;/,
  );
  assert.match(
    drawingSheetHandler,
    /cancelRetainedActionSheetPreview\(retainedRevision\);[\s\S]*adoptDrawingToolsSheet\(\)/,
  );
  assert.match(
    drawingSheetHandler,
    /const adoptDrawingToolsSheet = \(\) => \{[\s\S]*closeChartTapMenu\(\);[\s\S]*showChartActionSheet\(drawingToolsActionSheetConfig\);[\s\S]*scheduleChartActionSheetContextReset\(\);/,
  );
  assert.doesNotMatch(drawingSheetHandler, /openChartActionSheetSmoothly/);
  assert.doesNotMatch(drawingSheetHandler, /requestAnimationFrame|setTimeout/);
});

test('every drawing action dismisses the sheet before applying its selection', () => {
  const calls: string[] = [];
  const [wrappedAction] = dismissBeforeDrawingToolsSelection(
    [{ label: 'Trend Line', onPress: () => calls.push('apply') }],
    () => calls.push('dismiss'),
  );

  wrappedAction.onPress?.();

  assert.deepEqual(calls, ['dismiss', 'apply']);

  const chartSource = readSource('src/features/chart/ChartScreen.native.tsx');
  const drawingActions = chartSource.slice(
    chartSource.indexOf('const drawingToolsActions = useMemo'),
    chartSource.indexOf('const drawingToolsVisualKey'),
  );
  assert.match(
    drawingActions,
    /dismissBeforeDrawingToolsSelection\([\s\S]*createDrawingToolsActionSheetActions\([\s\S]*hideChartActionSheet/,
  );
});
