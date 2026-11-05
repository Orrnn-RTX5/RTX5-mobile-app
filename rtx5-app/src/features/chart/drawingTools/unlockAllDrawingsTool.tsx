import React from 'react';
import { TvLock } from '../components/ChartToolbarIcons';
import type { DrawingToolCommandDefinition } from './types';

/**
 * Unlocks every drawing. Listed separately from the Lock All toggle so
 * individually locked drawings can be released even while lock-all is off.
 */
export const unlockAllDrawingsToolAction: DrawingToolCommandDefinition = {
  /** The label displayed for this action in the UI, such as in menus or action sheets. */
  actionLabel: 'Unlock All Drawings',
  /**
   * Only offered when at least one drawing is individually locked while the
   * global lock-all toggle is off (that toggle already reads "Unlock All
   * Drawings" when it is on).
   */
  isVisible: ({ chartLockAll, hasDrawings, hasLockedDrawings }) =>
    hasDrawings !== false && !chartLockAll && hasLockedDrawings === true,
  /** The unique key identifying this command action. */
  key: 'unlockAllDrawings',
  /**
   * Function to render the icon for this tool.
   * @param color The theme color to apply to the icon.
   * @returns A React component representing the icon.
   */
  renderIcon: (color) => <TvLock color={color} />,
};
