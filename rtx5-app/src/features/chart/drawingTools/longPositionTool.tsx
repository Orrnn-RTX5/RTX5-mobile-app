import React from 'react';
import { TvPrediction } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

/**
 * Defines the Long Position tool.
 * Used for planning and visualizing long trades, calculating risk/reward, take profit, and stop loss levels.
 */
export const longPositionDrawingTool: SelectableDrawingToolDefinition = {
  /** The label displayed for this action in the UI, such as in menus or action sheets. */
  actionLabel: 'Long Position',
  /**
   * Function to render the icon for this tool.
   * @param color The theme color to apply to the icon.
   * @returns A React component representing the icon.
   */
  renderIcon: (color) => <TvPrediction color={color} />,
  /** Optional label used specifically within the chart runtime environment. */
  runtimeLabel: 'Position',
  /** The internal string identifier for this drawing tool used by the chart engine. */
  tool: 'prediction',
};
