import React from 'react';
import { TvElliottWave } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

/**
 * Defines the Elliott Wave tool.
 * Plots a five-wave impulse sequence (pivots 1-5) as a numbered polyline.
 */
export const elliottWaveDrawingTool: SelectableDrawingToolDefinition = {
  /** The label displayed for this action in the UI, such as in menus or action sheets. */
  actionLabel: 'Elliott Wave',
  /**
   * Function to render the icon for this tool.
   * @param color The theme color to apply to the icon.
   * @returns A React component representing the icon.
   */
  renderIcon: (color) => <TvElliottWave color={color} />,
  /** Optional label used specifically within the chart runtime environment. */
  runtimeLabel: 'Elliott Wave',
  /** The internal string identifier for this drawing tool used by the chart engine. */
  tool: 'elliottWave',
};
