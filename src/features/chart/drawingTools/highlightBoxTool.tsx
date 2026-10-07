import React from 'react';
import { TvBrush } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

/**
 * Defines the Highlight Box (Rectangle) tool.
 * Used for visually marking specific areas of interest or consolidation zones on the chart.
 */
export const highlightBoxDrawingTool: SelectableDrawingToolDefinition = {
  /** The label displayed for this action in the UI, such as in menus or action sheets. */
  actionLabel: 'Highlight Box',
  /**
   * Function to render the icon for this tool.
   * @param color The theme color to apply to the icon.
   * @returns A React component representing the icon.
   */
  renderIcon: (color) => <TvBrush color={color} />,
  /** Optional label used specifically within the chart runtime environment. */
  runtimeLabel: 'Highlight',
  /** The internal string identifier for this drawing tool used by the chart engine. */
  tool: 'brush',
};
