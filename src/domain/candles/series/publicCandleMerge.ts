import type { LiveCandle } from '../core/candleTypes';
/** REST and live rows contain cumulative volume; replacements must not add it again. */
export function mergePublicBars<T extends LiveCandle>(existing: readonly T[], incoming: readonly T[], limit = 500): T[] {
  const buckets = new Map<number, T>(existing.map(bar => [bar.time, bar]));
  for (const bar of incoming) {
    const previous = buckets.get(bar.time);
    if (previous?.closed === true && bar.closed === false) continue;
    if (previous?.updateTime && bar.updateTime && previous.updateTime > bar.updateTime) continue;
    buckets.set(bar.time, { ...previous, ...bar });
  }
  return [...buckets.values()].sort((a, b) => a.time - b.time).slice(-limit);
}
