import React from 'react';
import { TvRay } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

/**
 * Defines the Ray tool.
 * Used for drawing a line that starts at a specific point and extends infinitely in one direction.
 */
export const rayDrawingTool: SelectableDrawingToolDefinition = {
  /** The label displayed for this action in the UI, such as in menus or action sheets. */
  actionLabel: 'Ray',
  /**
   * Function to render the icon for this tool.
   * @param color The theme color to apply to the icon.
   * @returns A React component representing the icon.
   */
  renderIcon: (color) => <TvRay color={color} />,
  /** Optional label used specifically within the chart runtime environment. */
  runtimeLabel: 'Ray',
  /** The internal string identifier for this drawing tool used by the chart engine. */
  tool: 'ray',
};
