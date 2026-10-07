import React from 'react';
import { TvFibExtension } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

/**
 * Defines the Trend-Based Fib Extension tool.
 * Used to predict future areas of support or resistance based on a previous trend.
 */
export const fibExtensionDrawingTool: SelectableDrawingToolDefinition = {
  /** The label displayed for this action in the UI, such as in menus or action sheets. */
  actionLabel: 'Fibonacci Extension',
  /**
   * Function to render the icon for this tool.
   * @param color The theme color to apply to the icon.
   * @returns A React component representing the icon.
   */
  renderIcon: (color) => <TvFibExtension color={color} />,
  /** Optional label used specifically within the chart runtime environment. */
  runtimeLabel: 'Fibonacci Extension',
  /** The internal string identifier for this drawing tool used by the chart engine. */
  tool: 'fibExtension',
};
