import React from 'react';
import { TvRegressionChannel } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

/**
 * Defines the Regression Channel tool.
 * Fits a linear regression line to the price closes across a selected range and
 * draws standard-deviation channel bands around it.
 */
export const regressionChannelDrawingTool: SelectableDrawingToolDefinition = {
  /** The label displayed for this action in the UI, such as in menus or action sheets. */
  actionLabel: 'Regression Channel',
  /**
   * Function to render the icon for this tool.
   * @param color The theme color to apply to the icon.
   * @returns A React component representing the icon.
   */
  renderIcon: (color) => <TvRegressionChannel color={color} />,
  /** Optional label used specifically within the chart runtime environment. */
  runtimeLabel: 'Regression Channel',
  /** The internal string identifier for this drawing tool used by the chart engine. */
  tool: 'regressionChannel',
};
