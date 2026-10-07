import React from 'react';
import { TvExtendedLine } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

export const extendedLineDrawingTool: SelectableDrawingToolDefinition = {
  actionLabel: 'Extended Line',
  renderIcon: (color) => <TvExtendedLine color={color} />,
  runtimeLabel: 'Extended Line',
  tool: 'extendedLine',
};
