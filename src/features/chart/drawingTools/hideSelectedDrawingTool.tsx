import React from 'react';
import { TvHide } from '../components/ChartToolbarIcons';
import type { DrawingToolCommandDefinition } from './types';

/**
 * Hides only the currently selected drawing. The drawing keeps its data and
 * configuration and comes back via "Show All Drawings".
 */
export const hideSelectedDrawingToolAction: DrawingToolCommandDefinition = {
  /** The label displayed for this action in the UI, such as in menus or action sheets. */
  actionLabel: 'Hide Selected Drawing',
  /** Pressable only while a drawing is actually selected. */
  isDisabled: ({ hasSelectedDrawing }) => hasSelectedDrawing !== true,
  /** Only offered while at least one drawing exists on the chart. */
  isVisible: ({ hasDrawings }) => hasDrawings !== false,
  /** The unique key identifying this command action. */
  key: 'hideSelectedDrawing',
  /**
   * Function to render the icon for this tool.
   * @param color The theme color to apply to the icon.
   * @returns A React component representing the icon.
   */
  renderIcon: (color) => <TvHide color={color} />,
};
