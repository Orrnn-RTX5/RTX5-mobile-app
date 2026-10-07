import React from 'react';
import { TvCrosshair, TvHide, TvLock, TvTrash } from '../components/ChartToolbarIcons';
import type { DrawingToolsActionSheetAction } from './types';

export type SelectedDrawingActionSheetConfig = {
  dangerIconColor?: string;
  iconColor?: string;
  /** Current lock state of the selected drawing — flips the lock row label. */
  locked: boolean;
  onDelete: () => void;
  onDeselect: () => void;
  onHide: () => void;
  onToggleLock: () => void;
};

/**
 * Contextual menu for one specific drawing, opened by double-tapping it on the
 * chart (or after selecting it in selection mode). Dismissing the sheet keeps
 * the drawing unchanged.
 */
export function createSelectedDrawingActionSheetActions(
  config: SelectedDrawingActionSheetConfig,
): DrawingToolsActionSheetAction[] {
  const iconColor = config.iconColor ?? '#64748B';
  const dangerIconColor = config.dangerIconColor ?? '#DC2626';
  return [
    {
      icon: <TvLock color={iconColor} />,
      label: config.locked ? 'Unlock Drawing' : 'Lock Drawing',
      onPress: config.onToggleLock,
    },
    {
      icon: <TvHide color={iconColor} />,
      label: 'Hide Drawing',
      onPress: config.onHide,
    },
    {
      icon: <TvCrosshair color={iconColor} />,
      label: 'Deselect Drawing',
      onPress: config.onDeselect,
    },
    {
      danger: true,
      icon: <TvTrash color={dangerIconColor} />,
      label: 'Delete Drawing',
      onPress: config.onDelete,
    },
  ];
}
