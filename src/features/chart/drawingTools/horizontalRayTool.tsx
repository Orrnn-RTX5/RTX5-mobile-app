import React from 'react';
import { TvHorizontalRay } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

export const horizontalRayDrawingTool: SelectableDrawingToolDefinition = {
  actionLabel: 'Horizontal Ray',
  renderIcon: (color) => <TvHorizontalRay color={color} />,
  runtimeLabel: 'Horizontal Ray',
  tool: 'horizontalRay',
};
