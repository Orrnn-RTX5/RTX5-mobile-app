import React from 'react';
import { TvHorizontalLine } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

/**
 * Defines the Horizontal Line tool.
 * Used for marking specific price levels, such as support and resistance.
 */
export const horizontalLineDrawingTool: SelectableDrawingToolDefinition = {
  /** The label displayed for this action in the UI, such as in menus or action sheets. */
  actionLabel: 'Horizontal Line',
  /**
   * Function to render the icon for this tool.
   * @param color The theme color to apply to the icon.
   * @returns A React component representing the icon.
   */
  renderIcon: (color) => <TvHorizontalLine color={color} />,
  /** Optional label used specifically within the chart runtime environment. */
  runtimeLabel: 'Horizontal Line',
  /** The internal string identifier for this drawing tool used by the chart engine. */
  tool: 'horizontalLine',
};
