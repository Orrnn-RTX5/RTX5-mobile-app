import { arrowMarkerDrawingTool } from './arrowMarkerTool';
import { clearDrawingsDrawingToolAction } from './clearDrawingsTool';
import { crosshairDrawingTool } from './crosshairTool';
import { deleteSelectedDrawingToolAction } from './deleteSelectedDrawingTool';
import { ellipseDrawingTool } from './ellipseTool';
import { elliottWaveDrawingTool } from './elliottWaveTool';
import { extendedLineDrawingTool } from './extendedLineTool';
import { fibExtensionDrawingTool } from './fibExtensionTool';
import { fibZoneDrawingTool } from './fibZoneTool';
import { freehandBrushDrawingTool } from './freehandBrushTool';
import { gannFanDrawingTool } from './gannFanTool';
import { hideAllDrawingsDrawingToolAction } from './hideAllDrawingsTool';
import { hideSelectedDrawingToolAction } from './hideSelectedDrawingTool';
import { highlightBoxDrawingTool } from './highlightBoxTool';
import { horizontalLineDrawingTool } from './horizontalLineTool';
import { horizontalRayDrawingTool } from './horizontalRayTool';
import { lockAllDrawingsDrawingToolAction } from './lockAllDrawingsTool';
import { lockSelectedDrawingToolAction } from './lockSelectedDrawingTool';
import { longPositionDrawingTool } from './longPositionTool';
import { magnetModeDrawingToolAction } from './magnetModeTool';
import { measureRangeDrawingTool } from './measureRangeTool';
import { parallelChannelDrawingTool } from './parallelChannelTool';
import { patternPathDrawingTool } from './patternPathTool';
import { pitchforkDrawingTool } from './pitchforkTool';
import { rayDrawingTool } from './rayTool';
import { rectangleDrawingTool } from './rectangleTool';
import { redoDrawingToolAction } from './redoDrawingTool';
import { regressionChannelDrawingTool } from './regressionChannelTool';
import { selectDrawingToolAction } from './selectDrawingTool';
import { shortPositionDrawingTool } from './shortPositionTool';
import { showAllDrawingsToolAction } from './showAllDrawingsTool';
import { stayInDrawingModeDrawingToolAction } from './stayInDrawingModeTool';
import { stickerDrawingTool } from './stickerTool';
import { textLabelDrawingTool } from './textLabelTool';
import { textLevelDrawingTool } from './textLevelTool';
import { trendLineDrawingTool } from './trendLineTool';
import { undoDrawingToolAction } from './undoDrawingTool';
import { unlockAllDrawingsToolAction } from './unlockAllDrawingsTool';
import { verticalLineDrawingTool } from './verticalLineTool';
import { xabcdDrawingTool } from './xabcdTool';
import { zoomToFitDrawingToolAction } from './zoomToFitTool';
import type {
  DrawingToolCommandDefinition,
  DrawingToolCommandHandlers,
  DrawingToolCommandKey,
  DrawingToolSidebarGroup,
  DrawingToolsActionSheetAction,
  DrawingToolsActionSheetConfig,
  DrawingToolsCommandState,
  SelectableDrawingToolDefinition,
} from './types';
import { resolveDrawingToolCommandLabel } from './types';

export type {
  DrawingToolCommandHandlers,
  DrawingToolCommandDefinition,
  DrawingToolCommandKey,
  DrawingToolIconRenderer,
  DrawingToolSidebarEntry,
  DrawingToolSidebarGroup,
  DrawingToolsActionSheetAction,
  DrawingToolsActionSheetConfig,
  DrawingToolsCommandState,
  EnhancedDrawingToolRuntime,
  SelectableDrawingToolDefinition,
} from './types';
export { resolveDrawingToolCommandLabel } from './types';
export {
  createSelectedDrawingActionSheetActions,
} from './selectedDrawingActionSheet';
export type { SelectedDrawingActionSheetConfig } from './selectedDrawingActionSheet';

export { arrowMarkerDrawingTool } from './arrowMarkerTool';
export { clearDrawingsDrawingToolAction } from './clearDrawingsTool';
export { crosshairDrawingTool } from './crosshairTool';
export { deleteSelectedDrawingToolAction } from './deleteSelectedDrawingTool';
export { ellipseDrawingTool } from './ellipseTool';
export { elliottWaveDrawingTool } from './elliottWaveTool';
export { extendedLineDrawingTool } from './extendedLineTool';
export { fibExtensionDrawingTool } from './fibExtensionTool';
export { fibZoneDrawingTool } from './fibZoneTool';
export { freehandBrushDrawingTool } from './freehandBrushTool';
export { gannFanDrawingTool } from './gannFanTool';
export { hideAllDrawingsDrawingToolAction } from './hideAllDrawingsTool';
export { hideSelectedDrawingToolAction } from './hideSelectedDrawingTool';
export { highlightBoxDrawingTool } from './highlightBoxTool';
export { horizontalLineDrawingTool } from './horizontalLineTool';
export { horizontalRayDrawingTool } from './horizontalRayTool';
export { lockAllDrawingsDrawingToolAction } from './lockAllDrawingsTool';
export { lockSelectedDrawingToolAction } from './lockSelectedDrawingTool';
export { longPositionDrawingTool } from './longPositionTool';
export { magnetModeDrawingToolAction } from './magnetModeTool';
export { measureRangeDrawingTool } from './measureRangeTool';
export { parallelChannelDrawingTool } from './parallelChannelTool';
export { patternPathDrawingTool } from './patternPathTool';
export { pitchforkDrawingTool } from './pitchforkTool';
export { rayDrawingTool } from './rayTool';
export { rectangleDrawingTool } from './rectangleTool';
export { redoDrawingToolAction } from './redoDrawingTool';
export { regressionChannelDrawingTool } from './regressionChannelTool';
export { selectDrawingToolAction } from './selectDrawingTool';
export { shortPositionDrawingTool } from './shortPositionTool';
export { showAllDrawingsToolAction } from './showAllDrawingsTool';
export { stayInDrawingModeDrawingToolAction } from './stayInDrawingModeTool';
export { stickerDrawingTool } from './stickerTool';
export { textLabelDrawingTool } from './textLabelTool';
export { textLevelDrawingTool } from './textLevelTool';
export { trendLineDrawingTool } from './trendLineTool';
export { undoDrawingToolAction } from './undoDrawingTool';
export { unlockAllDrawingsToolAction } from './unlockAllDrawingsTool';
export { verticalLineDrawingTool } from './verticalLineTool';
export { xabcdDrawingTool } from './xabcdTool';
export { zoomToFitDrawingToolAction } from './zoomToFitTool';
export {
  arrowMarkerEnhancedDrawingToolRuntime,
  crosshairEnhancedDrawingToolRuntime,
  ellipseEnhancedDrawingToolRuntime,
  elliottWaveEnhancedDrawingToolRuntime,
  ENHANCED_DRAWING_TOOL_RUNTIMES,
  ENHANCED_DRAWING_TOOLS_RUNTIME_JS,
  extendedLineEnhancedDrawingToolRuntime,
  fibExtensionEnhancedDrawingToolRuntime,
  fibZoneEnhancedDrawingToolRuntime,
  freehandBrushEnhancedDrawingToolRuntime,
  gannFanEnhancedDrawingToolRuntime,
  highlightBoxEnhancedDrawingToolRuntime,
  horizontalLineEnhancedDrawingToolRuntime,
  horizontalRayEnhancedDrawingToolRuntime,
  longPositionEnhancedDrawingToolRuntime,
  measureRangeEnhancedDrawingToolRuntime,
  parallelChannelEnhancedDrawingToolRuntime,
  patternPathEnhancedDrawingToolRuntime,
  pitchforkEnhancedDrawingToolRuntime,
  rayEnhancedDrawingToolRuntime,
  rectangleEnhancedDrawingToolRuntime,
  regressionChannelEnhancedDrawingToolRuntime,
  shortPositionEnhancedDrawingToolRuntime,
  stickerEnhancedDrawingToolRuntime,
  textLabelEnhancedDrawingToolRuntime,
  textLevelEnhancedDrawingToolRuntime,
  trendLineEnhancedDrawingToolRuntime,
  verticalLineEnhancedDrawingToolRuntime,
  xabcdEnhancedDrawingToolRuntime,
} from './runtime';

export const DRAWING_TOOL_OPTIONS: SelectableDrawingToolDefinition[] = [
  crosshairDrawingTool,
  trendLineDrawingTool,
  extendedLineDrawingTool,
  horizontalRayDrawingTool,
  fibZoneDrawingTool,
  textLabelDrawingTool,
  textLevelDrawingTool,
  longPositionDrawingTool,
];

export const DRAWING_SHEET_OPTIONS: SelectableDrawingToolDefinition[] = [
  ...DRAWING_TOOL_OPTIONS,
  horizontalLineDrawingTool,
  verticalLineDrawingTool,
  rayDrawingTool,
  arrowMarkerDrawingTool,
  parallelChannelDrawingTool,
  fibExtensionDrawingTool,
  rectangleDrawingTool,
  ellipseDrawingTool,
  freehandBrushDrawingTool,
  highlightBoxDrawingTool,
  patternPathDrawingTool,
  pitchforkDrawingTool,
  gannFanDrawingTool,
  regressionChannelDrawingTool,
  elliottWaveDrawingTool,
  xabcdDrawingTool,
  shortPositionDrawingTool,
  stickerDrawingTool,
  measureRangeDrawingTool,
];

export const DRAWING_TOOL_COMMANDS: DrawingToolCommandDefinition[] = [
  undoDrawingToolAction,
  redoDrawingToolAction,
  selectDrawingToolAction,
  deleteSelectedDrawingToolAction,
  lockSelectedDrawingToolAction,
  hideSelectedDrawingToolAction,
  zoomToFitDrawingToolAction,
  magnetModeDrawingToolAction,
  stayInDrawingModeDrawingToolAction,
  lockAllDrawingsDrawingToolAction,
  unlockAllDrawingsToolAction,
  hideAllDrawingsDrawingToolAction,
  showAllDrawingsToolAction,
  clearDrawingsDrawingToolAction,
];

const HISTORY_COMMAND_KEYS = new Set<DrawingToolCommandKey>(['undoDrawing', 'redoDrawing']);
// The classic Drawing Tools sheet keeps its original roster and order; the
// selection-management commands are reachable through the double-tap quick
// menu on the chart instead.
const CLASSIC_UTILITY_COMMAND_KEYS = new Set<DrawingToolCommandKey>([
  'zoomToFit',
  'toggleMagnetMode',
  'stayInDrawingMode',
  'lockAllDrawings',
  'hideAllDrawings',
  'clearDrawings',
]);

export const DRAWING_TOOL_SIDEBAR_GROUPS: DrawingToolSidebarGroup[] = [
  {
    key: 'main-tools',
    entries: DRAWING_TOOL_OPTIONS.map((definition) => ({ kind: 'selectable', definition })),
  },
  {
    key: 'history',
    entries: [
      { kind: 'command', definition: undoDrawingToolAction },
      { kind: 'command', definition: redoDrawingToolAction },
    ],
  },
  {
    key: 'measure-and-zoom',
    entries: [
      { kind: 'selectable', definition: measureRangeDrawingTool },
      { kind: 'command', definition: zoomToFitDrawingToolAction },
      { kind: 'command', definition: magnetModeDrawingToolAction },
    ],
  },
  {
    key: 'drawing-state',
    entries: [
      { kind: 'command', definition: stayInDrawingModeDrawingToolAction },
      { kind: 'command', definition: lockAllDrawingsDrawingToolAction },
      { kind: 'command', definition: hideAllDrawingsDrawingToolAction },
    ],
  },
  {
    key: 'destructive',
    entries: [
      { kind: 'command', definition: clearDrawingsDrawingToolAction },
    ],
  },
];

type DrawingToolCommandHandlerConfig = Pick<
  DrawingToolsActionSheetConfig,
  | 'onClearDrawings'
  | 'onDeleteSelectedDrawing'
  | 'onHideSelectedDrawing'
  | 'onRedoDrawing'
  | 'onSelectDrawingMode'
  | 'onShowAllDrawings'
  | 'onToggleHide'
  | 'onToggleLock'
  | 'onToggleMagnetMode'
  | 'onToggleSelectedDrawingLock'
  | 'onToggleStickyMode'
  | 'onUndoDrawing'
  | 'onUnlockAllDrawings'
  | 'onZoomTool'
>;

const noopDrawingToolCommand = () => undefined;

function createDrawingToolCommandHandlers(
  config: DrawingToolCommandHandlerConfig,
): DrawingToolCommandHandlers {
  return {
    clearDrawings: config.onClearDrawings,
    deleteSelectedDrawing: config.onDeleteSelectedDrawing ?? noopDrawingToolCommand,
    hideAllDrawings: config.onToggleHide,
    hideSelectedDrawing: config.onHideSelectedDrawing ?? noopDrawingToolCommand,
    lockAllDrawings: config.onToggleLock,
    lockSelectedDrawing: config.onToggleSelectedDrawingLock ?? noopDrawingToolCommand,
    redoDrawing: config.onRedoDrawing,
    selectDrawing: config.onSelectDrawingMode ?? noopDrawingToolCommand,
    showAllDrawings: config.onShowAllDrawings ?? config.onToggleHide,
    stayInDrawingMode: config.onToggleStickyMode,
    toggleMagnetMode: config.onToggleMagnetMode,
    undoDrawing: config.onUndoDrawing,
    unlockAllDrawings: config.onUnlockAllDrawings ?? config.onToggleLock,
    zoomToFit: config.onZoomTool,
  };
}

export function createDrawingToolsCommandHandlers(
  config: DrawingToolCommandHandlerConfig,
): DrawingToolCommandHandlers {
  return createDrawingToolCommandHandlers(config);
}

export function createDrawingToolsActionSheetActions(
  config: DrawingToolsActionSheetConfig,
): DrawingToolsActionSheetAction[] {
  const iconColor = config.iconColor ?? '#64748B';
  const dangerIconColor = config.dangerIconColor ?? '#DC2626';
  const commandState: DrawingToolsCommandState = {
    canRedoDrawing: config.canRedoDrawing,
    canUndoDrawing: config.canUndoDrawing,
    chartHideAll: config.chartHideAll,
    chartLockAll: config.chartLockAll,
    drawingMagnetMode: config.drawingMagnetMode,
    hasDrawings: config.hasDrawings,
    hasHiddenDrawings: config.hasHiddenDrawings,
    hasLockedDrawings: config.hasLockedDrawings,
    hasSelectedDrawing: config.hasSelectedDrawing,
    selectedDrawingLocked: config.selectedDrawingLocked,
    stickyDrawingMode: config.stickyDrawingMode,
  };
  const commandHandlers = createDrawingToolCommandHandlers(config);
  const buildCommandAction = (definition: DrawingToolCommandDefinition): DrawingToolsActionSheetAction => ({
    danger: definition.danger,
    disabled: definition.isDisabled ? definition.isDisabled(commandState) === true : undefined,
    icon: definition.renderIcon(definition.danger ? dangerIconColor : iconColor),
    label: resolveDrawingToolCommandLabel(definition, commandState),
    onPress: commandHandlers[definition.key],
  });
  const historyCommands = DRAWING_TOOL_COMMANDS.filter(
    (definition) => HISTORY_COMMAND_KEYS.has(definition.key),
  );
  const utilityCommands = DRAWING_TOOL_COMMANDS.filter(
    (definition) => CLASSIC_UTILITY_COMMAND_KEYS.has(definition.key),
  );

  return [
    ...historyCommands.map(buildCommandAction),
    ...DRAWING_SHEET_OPTIONS.map((definition) => ({
      icon: definition.renderIcon(iconColor),
      label: definition.actionLabel,
      onPress: () => config.onSelectTool(definition.tool),
    })),
    ...utilityCommands.map(buildCommandAction),
  ];
}

// Drawing-management commands only — the shortcut sheet opened by
// double-tapping empty chart space while at least one drawing exists. The
// full Drawing Tools sheet (with the tool catalog) stays available as-is.
const QUICK_ACTION_COMMAND_KEYS = new Set<DrawingToolCommandKey>([
  'undoDrawing',
  'redoDrawing',
  'selectDrawing',
  'deleteSelectedDrawing',
  'lockSelectedDrawing',
  'hideSelectedDrawing',
  'lockAllDrawings',
  'unlockAllDrawings',
  'hideAllDrawings',
  'showAllDrawings',
  'clearDrawings',
]);

export function createDrawingQuickActionsSheetActions(
  config: DrawingToolsActionSheetConfig,
): DrawingToolsActionSheetAction[] {
  const iconColor = config.iconColor ?? '#64748B';
  const dangerIconColor = config.dangerIconColor ?? '#DC2626';
  const commandState: DrawingToolsCommandState = {
    canRedoDrawing: config.canRedoDrawing,
    canUndoDrawing: config.canUndoDrawing,
    chartHideAll: config.chartHideAll,
    chartLockAll: config.chartLockAll,
    drawingMagnetMode: config.drawingMagnetMode,
    hasDrawings: config.hasDrawings,
    hasHiddenDrawings: config.hasHiddenDrawings,
    hasLockedDrawings: config.hasLockedDrawings,
    hasSelectedDrawing: config.hasSelectedDrawing,
    selectedDrawingLocked: config.selectedDrawingLocked,
    stickyDrawingMode: config.stickyDrawingMode,
  };
  const commandHandlers = createDrawingToolCommandHandlers(config);
  return DRAWING_TOOL_COMMANDS
    .filter((definition) => QUICK_ACTION_COMMAND_KEYS.has(definition.key))
    .filter((definition) => !definition.isVisible || definition.isVisible(commandState))
    .map((definition) => ({
      danger: definition.danger,
      disabled: definition.isDisabled ? definition.isDisabled(commandState) === true : undefined,
      icon: definition.renderIcon(definition.danger ? dangerIconColor : iconColor),
      label: resolveDrawingToolCommandLabel(definition, commandState),
      onPress: commandHandlers[definition.key],
    }));
}
