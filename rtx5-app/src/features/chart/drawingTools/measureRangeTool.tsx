import React from 'react';
import { TvMeasure } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

/**
 * Defines the Measure Range tool.
 * Used for measuring the precise price and time differences between two points on the chart.
 */
export const measureRangeDrawingTool: SelectableDrawingToolDefinition = {
  /** The label displayed for this action in the UI, such as in menus or action sheets. */
  actionLabel: 'Scale',
  /**
   * Function to render the icon for this tool.
   * @param color The theme color to apply to the icon.
   * @returns A React component representing the icon.
   */
  renderIcon: (color) => <TvMeasure color={color} />,
  /** Optional label used specifically within the chart runtime environment. */
  runtimeLabel: 'Scale',
  /** The internal string identifier for this drawing tool used by the chart engine. */
  tool: 'measure',
};
