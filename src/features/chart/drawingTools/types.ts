import type { ReactNode } from 'react';

export type DrawingToolIconRenderer = (color: string) => ReactNode;

export type SelectableDrawingToolDefinition = {
  actionLabel: string;
  runtimeLabel?: string;
  renderIcon: DrawingToolIconRenderer;
  tool: string;
};

export type EnhancedDrawingToolRuntime = {
  script: string;
  tool: string;
};

export type DrawingToolsCommandState = {
  canRedoDrawing?: boolean;
  canUndoDrawing?: boolean;
  chartHideAll: boolean;
  chartLockAll: boolean;
  drawingMagnetMode: boolean;
  hasDrawings?: boolean;
  hasHiddenDrawings?: boolean;
  hasLockedDrawings?: boolean;
  hasSelectedDrawing?: boolean;
  selectedDrawingLocked?: boolean;
  stickyDrawingMode: boolean;
};

export type DrawingToolCommandKey =
  | 'undoDrawing'
  | 'redoDrawing'
  | 'selectDrawing'
  | 'deleteSelectedDrawing'
  | 'lockSelectedDrawing'
  | 'hideSelectedDrawing'
  | 'zoomToFit'
  | 'toggleMagnetMode'
  | 'stayInDrawingMode'
  | 'lockAllDrawings'
  | 'unlockAllDrawings'
  | 'hideAllDrawings'
  | 'showAllDrawings'
  | 'clearDrawings';

export type DrawingToolCommandDefinition = {
  actionLabel: string | ((state: DrawingToolsCommandState) => string);
  danger?: boolean;
  isActive?: (state: DrawingToolsCommandState) => boolean;
  /** Row stays listed but is greyed out and non-pressable when true. */
  isDisabled?: (state: DrawingToolsCommandState) => boolean;
  /** Row is omitted from the action sheet entirely when false. */
  isVisible?: (state: DrawingToolsCommandState) => boolean;
  key: DrawingToolCommandKey;
  renderIcon: DrawingToolIconRenderer;
};

export type DrawingToolSidebarEntry =
  | { kind: 'selectable'; definition: SelectableDrawingToolDefinition }
  | { kind: 'command'; definition: DrawingToolCommandDefinition };

export type DrawingToolSidebarGroup = {
  entries: DrawingToolSidebarEntry[];
  key: string;
};

export type DrawingToolsActionSheetAction = {
  activateOnPressIn?: boolean;
  danger?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  onPress?: () => void;
};

export type DrawingToolsActionSheetConfig = DrawingToolsCommandState & {
  dangerIconColor?: string;
  iconColor?: string;
  onClearDrawings: () => void;
  onDeleteSelectedDrawing?: () => void;
  onHideSelectedDrawing?: () => void;
  onRedoDrawing: () => void;
  onSelectDrawingMode?: () => void;
  onSelectTool: (tool: string) => void;
  onShowAllDrawings?: () => void;
  onToggleHide: () => void;
  onToggleLock: () => void;
  onToggleMagnetMode: () => void;
  onToggleSelectedDrawingLock?: () => void;
  onToggleStickyMode: () => void;
  onUndoDrawing: () => void;
  onUnlockAllDrawings?: () => void;
  onZoomTool: () => void;
};

export type DrawingToolCommandHandlers = Record<DrawingToolCommandKey, () => void>;

export function resolveDrawingToolCommandLabel(
  definition: DrawingToolCommandDefinition,
  state: DrawingToolsCommandState,
) {
  return typeof definition.actionLabel === 'function'
    ? definition.actionLabel(state)
    : definition.actionLabel;
}
