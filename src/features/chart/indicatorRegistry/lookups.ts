import { INDICATOR_REGISTRY } from './registry';
import type { IndicatorMeta } from './types';

/** Fast lookup: canonical display-name → indicator id. */
export const INDICATOR_ID_BY_NAME: Record<string, string> = Object.values(
  INDICATOR_REGISTRY,
).reduce<Record<string, string>>((acc, meta) => {
  acc[meta.name] = meta.id;
  return acc;
}, {});

export function getIndicatorMeta(id: string | undefined): IndicatorMeta | null {
  if (!id) return null;
  return INDICATOR_REGISTRY[id] ?? null;
}

export function buildDefaultValues(meta: IndicatorMeta): Record<string, number | string | boolean> {
  const values: Record<string, number | string | boolean> = {};
  for (const p of meta.parameters) {
    values[p.key] = p.default;
  }
  return values;
}
