import React from 'react';
import { TvVerticalLine } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

/**
 * Defines the Vertical Line tool.
 * Used for marking specific points in time on the chart, such as economic events or session opens.
 */
export const verticalLineDrawingTool: SelectableDrawingToolDefinition = {
  /** The label displayed for this action in the UI, such as in menus or action sheets. */
  actionLabel: 'Vertical Line',
  /**
   * Function to render the icon for this tool.
   * @param color The theme color to apply to the icon.
   * @returns A React component representing the icon.
   */
  renderIcon: (color) => <TvVerticalLine color={color} />,
  /** Optional label used specifically within the chart runtime environment. */
  runtimeLabel: 'Vertical Line',
  /** The internal string identifier for this drawing tool used by the chart engine. */
  tool: 'verticalLine',
};
