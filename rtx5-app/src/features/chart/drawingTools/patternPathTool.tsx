import React from 'react';
import { TvPatterns } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

/**
 * Defines the Path (Polyline) tool.
 * Used for drawing freeform geometric patterns or a sequence of connected lines.
 */
export const patternPathDrawingTool: SelectableDrawingToolDefinition = {
  /** The label displayed for this action in the UI, such as in menus or action sheets. */
  actionLabel: 'Pattern Path',
  /**
   * Function to render the icon for this tool.
   * @param color The theme color to apply to the icon.
   * @returns A React component representing the icon.
   */
  renderIcon: (color) => <TvPatterns color={color} />,
  /** Optional label used specifically within the chart runtime environment. */
  runtimeLabel: 'Pattern',
  /** The internal string identifier for this drawing tool used by the chart engine. */
  tool: 'patterns',
};
