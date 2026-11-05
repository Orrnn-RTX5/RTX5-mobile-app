import React from 'react';
import { TvParallelChannel } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

/**
 * Defines the Parallel Channel tool.
 * Used for drawing two parallel trend lines to identify upward, downward, or horizontal price channels.
 */
export const parallelChannelDrawingTool: SelectableDrawingToolDefinition = {
  /** The label displayed for this action in the UI, such as in menus or action sheets. */
  actionLabel: 'Parallel Channel',
  /**
   * Function to render the icon for this tool.
   * @param color The theme color to apply to the icon.
   * @returns A React component representing the icon.
   */
  renderIcon: (color) => <TvParallelChannel color={color} />,
  /** Optional label used specifically within the chart runtime environment. */
  runtimeLabel: 'Parallel Channel',
  /** The internal string identifier for this drawing tool used by the chart engine. */
  tool: 'parallelChannel',
};
