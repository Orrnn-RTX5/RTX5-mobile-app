import React from 'react';
import { TvHide } from '../components/ChartToolbarIcons';
import type { DrawingToolCommandDefinition } from './types';

/**
 * Toggles the visibility of all drawings on the chart.
 * This is useful for quickly viewing the clean chart without deleting existing drawings.
 */
export const hideAllDrawingsDrawingToolAction: DrawingToolCommandDefinition = {
  /** The label displayed for this action in the UI, such as in menus or action sheets. */
  actionLabel: ({ chartHideAll }) => (chartHideAll ? 'Show All Drawings' : 'Hide All Drawings'),
  /**
   * Function to determine if this tool command is currently active based on state.
   * @param state The current state of drawing tools commands.
   * @returns true if the command is active, false otherwise.
   */
  isActive: ({ chartHideAll }) => chartHideAll,
  /** Only offered while at least one drawing exists on the chart. */
  isVisible: ({ hasDrawings }) => hasDrawings !== false,
  /** The unique key identifying this command action. */
  key: 'hideAllDrawings',
  /**
   * Function to render the icon for this tool.
   * @param color The theme color to apply to the icon.
   * @returns A React component representing the icon.
   */
  renderIcon: (color) => <TvHide color={color} />,
};
