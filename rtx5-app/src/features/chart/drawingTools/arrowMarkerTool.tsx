import React from 'react';
import { TvArrowMarker } from '../components/ChartToolbarIcons';
import type { SelectableDrawingToolDefinition } from './types';

export const arrowMarkerDrawingTool: SelectableDrawingToolDefinition = {
  actionLabel: 'Arrow / Marker',
  renderIcon: (color) => <TvArrowMarker color={color} />,
  runtimeLabel: 'Arrow / Marker',
  tool: 'arrow',
};
