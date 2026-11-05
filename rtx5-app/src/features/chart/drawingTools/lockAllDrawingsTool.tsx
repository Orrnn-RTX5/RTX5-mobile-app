import React from 'react';
import { TvLock } from '../components/ChartToolbarIcons';
import type { DrawingToolCommandDefinition } from './types';

/**
 * Toggles the lock state of all drawings.
 * When locked, drawings cannot be accidentally moved or modified.
 */
export const lockAllDrawingsDrawingToolAction: DrawingToolCommandDefinition = {
  /** The label displayed for this action in the UI, such as in menus or action sheets. */
  actionLabel: ({ chartLockAll }) => (chartLockAll ? 'Unlock All Drawings' : 'Lock All Drawings'),
  /**
   * Function to determine if this tool command is currently active based on state.
   * @param state The current state of drawing tools commands.
   * @returns true if the command is active, false otherwise.
   */
  isActive: ({ chartLockAll }) => chartLockAll,
  /** Only offered while at least one drawing exists on the chart. */
  isVisible: ({ hasDrawings }) => hasDrawings !== false,
  /** The unique key identifying this command action. */
  key: 'lockAllDrawings',
  /**
   * Function to render the icon for this tool.
   * @param color The theme color to apply to the icon.
   * @returns A React component representing the icon.
   */
  renderIcon: (color) => <TvLock color={color} />,
};
