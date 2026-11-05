import React from 'react';
import { TvMagnet } from '../components/ChartToolbarIcons';
import type { DrawingToolCommandDefinition } from './types';

/**
 * Toggles the Magnet mode for drawing tools.
 * When active, drawing anchors automatically snap to the nearest price bars (Open, High, Low, Close).
 */
export const magnetModeDrawingToolAction: DrawingToolCommandDefinition = {
  /** The label displayed for this action in the UI, such as in menus or action sheets. */
  actionLabel: ({ drawingMagnetMode }) => (drawingMagnetMode ? 'Disable Magnet' : 'Enable Magnet'),
  /**
   * Function to determine if this tool command is currently active based on state.
   * @param state The current state of drawing tools commands.
   * @returns true if the command is active, false otherwise.
   */
  isActive: ({ drawingMagnetMode }) => drawingMagnetMode,
  /** The unique key identifying this command action. */
  key: 'toggleMagnetMode',
  /**
   * Function to render the icon for this tool.
   * @param color The theme color to apply to the icon.
   * @returns A React component representing the icon.
   */
  renderIcon: (color) => <TvMagnet color={color} />,
};
