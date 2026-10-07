import React from 'react';
import { TvZoom } from '../components/ChartToolbarIcons';
import type { DrawingToolCommandDefinition } from './types';

/**
 * Action to adjust the chart viewport.
 * Zooms and scales the chart to ensure all data and drawings are visible on the screen.
 */
export const zoomToFitDrawingToolAction: DrawingToolCommandDefinition = {
  /** The label displayed for this action in the UI, such as in menus or action sheets. */
  actionLabel: 'Zoom To Fit',
  /** The unique key identifying this command action. */
  key: 'zoomToFit',
  /**
   * Function to render the icon for this tool.
   * @param color The theme color to apply to the icon.
   * @returns A React component representing the icon.
   */
  renderIcon: (color) => <TvZoom color={color} />,
};
