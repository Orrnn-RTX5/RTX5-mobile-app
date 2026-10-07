import React from 'react';
import { TvTrendLine } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

/**
 * Defines the Trend Line tool.
 * Used for drawing diagonal lines to identify price trends and potential support/resistance levels.
 */
export const trendLineDrawingTool: SelectableDrawingToolDefinition = {
  /** The label displayed for this action in the UI, such as in menus or action sheets. */
  actionLabel: 'Trend Line',
  /**
   * Function to render the icon for this tool.
   * @param color The theme color to apply to the icon.
   * @returns A React component representing the icon.
   */
  renderIcon: (color) => <TvTrendLine color={color} />,
  /** Optional label used specifically within the chart runtime environment. */
  runtimeLabel: 'Trend Line',
  /** The internal string identifier for this drawing tool used by the chart engine. */
  tool: 'trendline',
};
