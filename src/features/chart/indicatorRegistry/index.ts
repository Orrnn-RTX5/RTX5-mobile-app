/**
 * Public entry point for the chart indicator registry.
 *
 * The original `indicatorRegistry.ts` was split for the 500-line ceiling:
 *   - `types.ts`          — type defs (ApplyTo, MaMethod, IndicatorMeta, ...)
 *   - `options.ts`        — APPLY_TO_OPTIONS, MA_METHOD_OPTIONS, LINE_STYLE_OPTIONS, COLOR_PALETTE
 *   - `paramBuilders.ts`  — periodParam, shiftParam, applyToParam, maMethodParam, line
 *   - `registry.ts`       — INDICATOR_REGISTRY (the big metadata table)
 *   - `lookups.ts`        — INDICATOR_ID_BY_NAME, getIndicatorMeta, buildDefaultValues
 */
export type {
  ApplyTo,
  MaMethod,
  LineStyle,
  NumberParam,
  ApplyToParam,
  MaMethodParam,
  SelectParam,
  BooleanParam,
  IndicatorParam,
  IndicatorStyleLine,
  IndicatorMeta,
} from './types';
export {
  APPLY_TO_OPTIONS,
  MA_METHOD_OPTIONS,
  LINE_STYLE_OPTIONS,
  COLOR_PALETTE,
} from './options';
export { INDICATOR_REGISTRY } from './registry';
export {
  INDICATOR_ID_BY_NAME,
  getIndicatorMeta,
  buildDefaultValues,
} from './lookups';
