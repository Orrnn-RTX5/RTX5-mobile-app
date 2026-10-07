import React from 'react';
import { TvPitchfork } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

/**
 * Defines the Andrews' Pitchfork tool.
 * Used for identifying potential support and resistance levels based on three points.
 */
export const pitchforkDrawingTool: SelectableDrawingToolDefinition = {
  /** The label displayed for this action in the UI, such as in menus or action sheets. */
  actionLabel: 'Pitchfork',
  /**
   * Function to render the icon for this tool.
   * @param color The theme color to apply to the icon.
   * @returns A React component representing the icon.
   */
  renderIcon: (color) => <TvPitchfork color={color} />,
  /** Optional label used specifically within the chart runtime environment. */
  runtimeLabel: 'Pitchfork',
  /** The internal string identifier for this drawing tool used by the chart engine. */
  tool: 'pitchfork',
};
