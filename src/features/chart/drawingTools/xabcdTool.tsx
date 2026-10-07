import React from 'react';
import { TvXabcd } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

/**
 * Defines the XABCD Harmonic pattern tool.
 * Plots the X-A-B-C-D pivots and annotates each leg with its Fibonacci
 * retracement ratio for harmonic pattern analysis.
 */
export const xabcdDrawingTool: SelectableDrawingToolDefinition = {
  /** The label displayed for this action in the UI, such as in menus or action sheets. */
  actionLabel: 'XABCD Harmonic',
  /**
   * Function to render the icon for this tool.
   * @param color The theme color to apply to the icon.
   * @returns A React component representing the icon.
   */
  renderIcon: (color) => <TvXabcd color={color} />,
  /** Optional label used specifically within the chart runtime environment. */
  runtimeLabel: 'XABCD Harmonic',
  /** The internal string identifier for this drawing tool used by the chart engine. */
  tool: 'xabcd',
};
