import React from 'react';
import { TvText } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

/**
 * Defines the Text Label tool.
 * Used for adding text annotations that are anchored to a specific point on the chart.
 */
export const textLabelDrawingTool: SelectableDrawingToolDefinition = {
  /** The label displayed for this action in the UI, such as in menus or action sheets. */
  actionLabel: 'Text Label',
  /**
   * Function to render the icon for this tool.
   * @param color The theme color to apply to the icon.
   * @returns A React component representing the icon.
   */
  renderIcon: (color) => <TvText color={color} />,
  /** Optional label used specifically within the chart runtime environment. */
  runtimeLabel: 'Text',
  /** The internal string identifier for this drawing tool used by the chart engine. */
  tool: 'text',
};
