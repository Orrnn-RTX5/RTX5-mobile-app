import type { ApplyTo, LineStyle, MaMethod } from './types';

export const APPLY_TO_OPTIONS: Array<{ value: ApplyTo; label: string }> = [
  { value: 'close', label: 'Close' },
  { value: 'open', label: 'Open' },
  { value: 'high', label: 'High' },
  { value: 'low', label: 'Low' },
  { value: 'median', label: 'Median Price (HL/2)' },
  { value: 'typical', label: 'Typical Price (HLC/3)' },
  { value: 'weighted', label: 'Weighted Close (HLCC/4)' },
];

export const MA_METHOD_OPTIONS: Array<{ value: MaMethod; label: string }> = [
  { value: 'simple', label: 'Simple' },
  { value: 'exponential', label: 'Exponential' },
  { value: 'smoothed', label: 'Smoothed' },
  { value: 'linearWeighted', label: 'Linear Weighted' },
];

export const LINE_STYLE_OPTIONS: Array<{ value: LineStyle; label: string }> = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
  { value: 'dashdot', label: 'Dash-dot' },
  { value: 'dashdotdot', label: 'Dash-dot-dot' },
];

export const COLOR_PALETTE: string[] = [
  '#FF0000', '#FF7F00', '#FFD700', '#32CD32', '#008000', '#1E90FF', '#0000FF',
  '#8B00FF', '#FF00FF', '#FF1493', '#00CED1', '#00FFFF', '#A52A2A', '#808080',
  '#000000', '#FFFFFF',
];
