/**
 * Type definitions for the chart indicator registry.
 *
 * MT5-aligned metadata that the configuration screen uses to render
 * parameter controls and default style lines for each indicator.
 */

export type ApplyTo =
  | 'close'
  | 'open'
  | 'high'
  | 'low'
  | 'median'
  | 'typical'
  | 'weighted';

export type MaMethod = 'simple' | 'exponential' | 'smoothed' | 'linearWeighted';

export type LineStyle = 'solid' | 'dashed' | 'dotted' | 'dashdot' | 'dashdotdot';

export type NumberParam = {
  kind: 'number';
  key: string;
  label: string;
  default: number;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
};

export type ApplyToParam = {
  kind: 'applyTo';
  key: string;
  label: string;
  default: ApplyTo;
};

export type MaMethodParam = {
  kind: 'maMethod';
  key: string;
  label: string;
  default: MaMethod;
};

export type SelectParam = {
  kind: 'select';
  key: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  default: string;
};

export type BooleanParam = {
  kind: 'boolean';
  key: string;
  label: string;
  default: boolean;
};

export type IndicatorParam =
  | NumberParam
  | ApplyToParam
  | MaMethodParam
  | SelectParam
  | BooleanParam;

export type IndicatorStyleLine = {
  key: string;
  name: string;
  color: string;
  width: number;
  style: LineStyle;
};

export type IndicatorMeta = {
  id: string;
  name: string;
  shortName: string;
  category: 'trend' | 'oscillator' | 'volume' | 'billWilliams';
  parameters: IndicatorParam[];
  styles: IndicatorStyleLine[];
  defaultLevels?: number[];
  levelsEnabled?: boolean;
};
