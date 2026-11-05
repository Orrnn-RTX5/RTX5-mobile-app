import React from 'react';
import { TvLock } from '../components/ChartToolbarIcons';
import type { DrawingToolCommandDefinition } from './types';

/**
 * Locks or unlocks only the currently selected drawing. A locked drawing stays
 * visible but cannot be moved, resized, or edited by chart gestures.
 */
export const lockSelectedDrawingToolAction: DrawingToolCommandDefinition = {
  /** The label displayed for this action in the UI, such as in menus or action sheets. */
  actionLabel: ({ selectedDrawingLocked }) =>
    (selectedDrawingLocked ? 'Unlock Selected Drawing' : 'Lock Selected Drawing'),
  /**
   * Function to determine if this tool command is currently active based on state.
   * @param state The current state of drawing tools commands.
   * @returns true if the command is active, false otherwise.
   */
  isActive: ({ selectedDrawingLocked }) => selectedDrawingLocked === true,
  /** Pressable only while a drawing is actually selected. */
  isDisabled: ({ hasSelectedDrawing }) => hasSelectedDrawing !== true,
  /** Only offered while at least one drawing exists on the chart. */
  isVisible: ({ hasDrawings }) => hasDrawings !== false,
  /** The unique key identifying this command action. */
  key: 'lockSelectedDrawing',
  /**
   * Function to render the icon for this tool.
   * @param color The theme color to apply to the icon.
   * @returns A React component representing the icon.
   */
  renderIcon: (color) => <TvLock color={color} />,
};
