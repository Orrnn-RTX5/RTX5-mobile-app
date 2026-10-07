import React from 'react';
import { TvCrosshair } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

/**
 * Enables the crosshair cursor for inspecting exact price and time values on the chart.
 * This tool does not create persistent drawings.
 */
export const crosshairDrawingTool: SelectableDrawingToolDefinition = {
  /** The label displayed for this action in the UI, such as in menus or action sheets. */
  actionLabel: 'Crosshair',
  /**
   * Function to render the icon for this tool.
   * @param color The theme color to apply to the icon.
   * @returns A React component representing the icon.
   */
  renderIcon: (color) => <TvCrosshair color={color} />,
  /** The internal string identifier for this drawing tool used by the chart engine. */
  tool: 'crosshair',
};
