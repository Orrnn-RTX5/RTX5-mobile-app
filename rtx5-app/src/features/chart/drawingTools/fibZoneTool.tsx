import React from 'react';
import { TvFib } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

/**
 * Defines the Fib Time Zone tool.
 * Used to identify potential reversal points based on Fibonacci time intervals.
 */
export const fibZoneDrawingTool: SelectableDrawingToolDefinition = {
  /** The label displayed for this action in the UI, such as in menus or action sheets. */
  actionLabel: 'Fibonacci Retracement',
  /**
   * Function to render the icon for this tool.
   * @param color The theme color to apply to the icon.
   * @returns A React component representing the icon.
   */
  renderIcon: (color) => <TvFib color={color} />,
  /** Optional label used specifically within the chart runtime environment. */
  runtimeLabel: 'Fibonacci Retracement',
  /** The internal string identifier for this drawing tool used by the chart engine. */
  tool: 'fib',
};
