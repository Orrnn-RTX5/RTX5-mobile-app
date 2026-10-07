import React from 'react';
import { TvSmiley } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

/**
 * Defines the Sticker tool.
 * Used for placing visual icons or emojis on the chart for annotation purposes.
 */
export const stickerDrawingTool: SelectableDrawingToolDefinition = {
  /** The label displayed for this action in the UI, such as in menus or action sheets. */
  actionLabel: 'Sticker',
  /**
   * Function to render the icon for this tool.
   * @param color The theme color to apply to the icon.
   * @returns A React component representing the icon.
   */
  renderIcon: (color) => <TvSmiley color={color} />,
  /** Optional label used specifically within the chart runtime environment. */
  runtimeLabel: 'Sticker',
  /** The internal string identifier for this drawing tool used by the chart engine. */
  tool: 'smiley',
};
