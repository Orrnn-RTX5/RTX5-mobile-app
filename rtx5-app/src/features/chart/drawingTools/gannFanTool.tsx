import React from 'react';
import { TvGannFan } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

/**
 * Defines the Gann Fan tool.
 * Projects a fan of Gann angle rays (1x1, 2x1, 1x2, ...) from a pivot to gauge
 * support and resistance over time.
 */
export const gannFanDrawingTool: SelectableDrawingToolDefinition = {
  /** The label displayed for this action in the UI, such as in menus or action sheets. */
  actionLabel: 'Gann Fan',
  /**
   * Function to render the icon for this tool.
   * @param color The theme color to apply to the icon.
   * @returns A React component representing the icon.
   */
  renderIcon: (color) => <TvGannFan color={color} />,
  /** Optional label used specifically within the chart runtime environment. */
  runtimeLabel: 'Gann Fan',
  /** The internal string identifier for this drawing tool used by the chart engine. */
  tool: 'gannFan',
};
