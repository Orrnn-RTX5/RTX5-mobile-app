/** Helpers for the common parameter shapes shared across indicator definitions. */
import type {
  ApplyTo,
  ApplyToParam,
  IndicatorStyleLine,
  LineStyle,
  MaMethod,
  MaMethodParam,
  NumberParam,
} from './types';

export const periodParam = (def = 14): NumberParam => ({
  kind: 'number', key: 'period', label: 'Period', default: def, min: 1, max: 10000,
});

export const shiftParam = (def = 0): NumberParam => ({
  kind: 'number', key: 'shift', label: 'Shift', default: def, min: -1000, max: 1000,
});

export const applyToParam = (def: ApplyTo = 'close'): ApplyToParam => ({
  kind: 'applyTo', key: 'applyTo', label: 'Apply to', default: def,
});

export const maMethodParam = (def: MaMethod = 'simple'): MaMethodParam => ({
  kind: 'maMethod', key: 'maMethod', label: 'MA method', default: def,
});

export const line = (
  key: string,
  name: string,
  color: string,
  width = 1,
  style: LineStyle = 'solid',
): IndicatorStyleLine => ({ key, name, color, width, style });
