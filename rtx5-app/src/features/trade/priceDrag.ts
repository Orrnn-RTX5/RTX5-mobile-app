export const PRICE_DRAG_PIXELS_PER_TICK = 8;

/** Vertical movement changes a draft in exact broker ticks, never below zero. */
export function priceAfterVerticalDrag(start: number, deltaY: number, step: number, decimals: number, min?: number, max?: number): number {
  if (!Number.isFinite(start) || !Number.isFinite(deltaY) || !Number.isFinite(step) || step <= 0) return start;
  const digits = Number.isInteger(decimals) ? Math.max(0, Math.min(10, decimals)) : 8;
  const ticks = Math.trunc(-deltaY / PRICE_DRAG_PIXELS_PER_TICK);
  if (!ticks) return start;
  const minimumTick = Math.max(1, Math.ceil((Number.isFinite(min) ? min! : step) / step - 1e-8));
  const maximumTick = Number.isFinite(max) ? Math.floor(max! / step + 1e-8) : Infinity;
  if (maximumTick < minimumTick) return start;
  const nextTick = Math.min(maximumTick, Math.max(minimumTick, Math.round(start / step) + ticks));
  const next = Number((nextTick * step).toFixed(digits));
  return Number.isFinite(next) && next > 0 ? next : start;
}
