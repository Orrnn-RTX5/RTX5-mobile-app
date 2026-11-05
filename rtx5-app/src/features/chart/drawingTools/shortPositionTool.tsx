import React from 'react';
import { TvShortPosition } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

/**
 * Defines the Short Position tool.
 * Used for planning and visualizing short trades, calculating risk/reward, take profit, and stop loss levels.
 */
export const shortPositionDrawingTool: SelectableDrawingToolDefinition = {
  /** The label displayed for this action in the UI, such as in menus or action sheets. */
  actionLabel: 'Short Position',
  /**
   * Function to render the icon for this tool.
   * @param color The theme color to apply to the icon.
   * @returns A React component representing the icon.
   */
  renderIcon: (color) => <TvShortPosition color={color} />,
  /** Optional label used specifically within the chart runtime environment. */
  runtimeLabel: 'Short Position',
  /** The internal string identifier for this drawing tool used by the chart engine. */
  tool: 'shortPosition',
};
