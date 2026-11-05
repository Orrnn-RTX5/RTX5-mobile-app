import React from 'react';
import { TvEllipse } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

export const ellipseDrawingTool: SelectableDrawingToolDefinition = {
  actionLabel: 'Circle / Ellipse',
  renderIcon: (color) => <TvEllipse color={color} />,
  runtimeLabel: 'Circle / Ellipse',
  tool: 'ellipse',
};
