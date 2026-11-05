import React from 'react';
import { TvFreehandBrush } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

export const freehandBrushDrawingTool: SelectableDrawingToolDefinition = {
  actionLabel: 'Freehand Brush',
  renderIcon: (color) => <TvFreehandBrush color={color} />,
  runtimeLabel: 'Freehand Brush',
  tool: 'freehand',
};
