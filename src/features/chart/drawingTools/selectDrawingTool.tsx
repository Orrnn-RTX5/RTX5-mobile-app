import React from 'react';
import { TvCrosshair } from '../components/ChartToolbarIcons';
import type { DrawingToolCommandDefinition } from './types';

/**
 * Enters drawing-selection mode (crosshair) so the user can tap a specific
 * drawing on the chart to select it, then lock, hide, or delete it.
 */
export const selectDrawingToolAction: DrawingToolCommandDefinition = {
  /** The label displayed for this action in the UI, such as in menus or action sheets. */
  actionLabel: 'Select Drawing',
  /** Only offered while at least one drawing exists on the chart. */
  isVisible: ({ hasDrawings }) => hasDrawings !== false,
  /** The unique key identifying this command action. */
  key: 'selectDrawing',
  /**
   * Function to render the icon for this tool.
   * @param color The theme color to apply to the icon.
   * @returns A React component representing the icon.
   */
  renderIcon: (color) => <TvCrosshair color={color} />,
};
