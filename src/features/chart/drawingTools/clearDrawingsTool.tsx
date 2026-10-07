import React from 'react';
import { TvTrash } from '../components/ChartToolbarIcons';
import type { DrawingToolCommandDefinition } from './types';

/**
 * Clears all drawings from the chart.
 * This action is destructive and removes all user-created drawings.
 */
export const clearDrawingsDrawingToolAction: DrawingToolCommandDefinition = {
  /** The label displayed for this action in the UI, such as in menus or action sheets. */
  actionLabel: 'Delete All Drawings',
  /** Indicates if this is a destructive action (e.g., deleting all drawings). If true, it may be styled differently. */
  danger: true,
  /** Only offered while at least one drawing exists on the chart. */
  isVisible: ({ hasDrawings }) => hasDrawings !== false,
  /** The unique key identifying this command action. */
  key: 'clearDrawings',
  /**
   * Function to render the icon for this tool.
   * @param color The theme color to apply to the icon.
   * @returns A React component representing the icon.
   */
  renderIcon: (color) => <TvTrash color={color} />,
};
