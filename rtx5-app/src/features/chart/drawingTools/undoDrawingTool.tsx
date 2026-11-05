import React from 'react';
import { TvUndo } from '../components/ChartToolbarIcons';
import type { DrawingToolCommandDefinition } from './types';

export const undoDrawingToolAction: DrawingToolCommandDefinition = {
  actionLabel: 'Undo Drawing',
  isDisabled: ({ canUndoDrawing }) => canUndoDrawing === false,
  key: 'undoDrawing',
  renderIcon: (color) => <TvUndo color={color} />,
};
