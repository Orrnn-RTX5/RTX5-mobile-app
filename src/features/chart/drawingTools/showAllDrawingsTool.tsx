import React from 'react';
import { TvHide } from '../components/ChartToolbarIcons';
import type { DrawingToolCommandDefinition } from './types';

/**
 * Restores every hidden drawing. Listed separately from the Hide All toggle so
 * individually hidden drawings can be brought back even while hide-all is off.
 */
export const showAllDrawingsToolAction: DrawingToolCommandDefinition = {
  /** The label displayed for this action in the UI, such as in menus or action sheets. */
  actionLabel: 'Show All Drawings',
  /**
   * Only offered when at least one drawing is individually hidden while the
   * global hide-all toggle is off (that toggle already reads "Show All
   * Drawings" when it is on).
   */
  isVisible: ({ chartHideAll, hasDrawings, hasHiddenDrawings }) =>
    hasDrawings !== false && !chartHideAll && hasHiddenDrawings === true,
  /** The unique key identifying this command action. */
  key: 'showAllDrawings',
  /**
   * Function to render the icon for this tool.
   * @param color The theme color to apply to the icon.
   * @returns A React component representing the icon.
   */
  renderIcon: (color) => <TvHide color={color} />,
};
