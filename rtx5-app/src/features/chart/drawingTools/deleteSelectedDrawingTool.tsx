import React from 'react';
import { TvTrash } from '../components/ChartToolbarIcons';
import type { DrawingToolCommandDefinition } from './types';

/**
 * Deletes only the currently selected drawing. Disabled until the user has
 * selected a drawing so an accidental press can never delete a random one.
 */
export const deleteSelectedDrawingToolAction: DrawingToolCommandDefinition = {
  /** The label displayed for this action in the UI, such as in menus or action sheets. */
  actionLabel: 'Delete Selected Drawing',
  /** Indicates if this is a destructive action. If true, it may be styled differently. */
  danger: true,
  /** Pressable only while a drawing is actually selected. */
  isDisabled: ({ hasSelectedDrawing }) => hasSelectedDrawing !== true,
  /** Only offered while at least one drawing exists on the chart. */
  isVisible: ({ hasDrawings }) => hasDrawings !== false,
  /** The unique key identifying this command action. */
  key: 'deleteSelectedDrawing',
  /**
   * Function to render the icon for this tool.
   * @param color The theme color to apply to the icon.
   * @returns A React component representing the icon.
   */
  renderIcon: (color) => <TvTrash color={color} />,
};
