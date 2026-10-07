import React from 'react';
import { TvStayInDrawingMode } from '../components/ChartToolbarIcons';
import type { DrawingToolCommandDefinition } from './types';

/**
 * Toggles the 'Stay in Drawing Mode' state.
 * When active, the currently selected drawing tool remains active after placing a drawing, allowing for continuous drawing.
 */
export const stayInDrawingModeDrawingToolAction: DrawingToolCommandDefinition = {
  /** The label displayed for this action in the UI, such as in menus or action sheets. */
  actionLabel: ({ stickyDrawingMode }) => (
    stickyDrawingMode ? 'Disable Stay in Drawing Mode' : 'Enable Stay in Drawing Mode'
  ),
  /**
   * Function to determine if this tool command is currently active based on state.
   * @param state The current state of drawing tools commands.
   * @returns true if the command is active, false otherwise.
   */
  isActive: ({ stickyDrawingMode }) => stickyDrawingMode,
  /** The unique key identifying this command action. */
  key: 'stayInDrawingMode',
  /**
   * Function to render the icon for this tool.
   * @param color The theme color to apply to the icon.
   * @returns A React component representing the icon.
   */
  renderIcon: (color) => <TvStayInDrawingMode color={color} />,
};
