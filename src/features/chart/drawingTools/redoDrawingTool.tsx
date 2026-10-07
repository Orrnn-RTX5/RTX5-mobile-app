import React from 'react';
import { TvRedo } from '../components/ChartToolbarIcons';
import type { DrawingToolCommandDefinition } from './types';

export const redoDrawingToolAction: DrawingToolCommandDefinition = {
  actionLabel: 'Redo Drawing',
  isDisabled: ({ canRedoDrawing }) => canRedoDrawing === false,
  key: 'redoDrawing',
  renderIcon: (color) => <TvRedo color={color} />,
};
