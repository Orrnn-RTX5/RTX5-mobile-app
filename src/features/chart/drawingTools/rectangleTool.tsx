import React from 'react';
import { TvRectangle } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

export const rectangleDrawingTool: SelectableDrawingToolDefinition = {
  actionLabel: 'Rectangle',
  renderIcon: (color) => <TvRectangle color={color} />,
  runtimeLabel: 'Rectangle',
  tool: 'rectangle',
};
