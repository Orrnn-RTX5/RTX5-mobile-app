import React from 'react';
import { TvText } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

/**
 * Defines the Text Level tool.
 * Used for adding a horizontal text annotation at a specific price level, similar to a horizontal line with text.
 */
export const textLevelDrawingTool: SelectableDrawingToolDefinition = {
  /** The label displayed for this action in the UI, such as in menus or action sheets. */
  actionLabel: 'Text Level',
  /**
   * Function to render the icon for this tool.
   * @param color The theme color to apply to the icon.
   * @returns A React component representing the icon.
   */
  renderIcon: (color) => <TvText color={color} />,
  /** Optional label used specifically within the chart runtime environment. */
  runtimeLabel: 'Text Level',
  /** The internal string identifier for this drawing tool used by the chart engine. */
  tool: 'textLevel',
};
