export const PRICE_WHEEL_ROW_HEIGHT = 36;
const HALF_WINDOW = 50;

export function priceWheelRange(value: number, step: number, decimals: number, min?: number, max?: number) {
  if (!Number.isFinite(step) || step <= 0) return null;
  const digits = Number.isInteger(decimals) ? Math.max(0, Math.min(10, decimals)) : 8;
  const minimum = Math.max(1, Math.ceil((Number.isFinite(min) ? min! : step) / step - 1e-8));
  const maximum = Number.isFinite(max) ? Math.floor(max! / step + 1e-8) : Infinity;
  if (maximum < minimum || Number(step.toFixed(digits)) <= 0) return null;
  const tick = Math.min(maximum, Math.max(minimum, Math.round((Number.isFinite(value) ? value : step) / step)));
  const first = Math.max(minimum, tick - HALF_WINDOW);
  const last = Math.min(maximum, tick + HALF_WINDOW);
  return { first, last, tick, step, digits, min, max, index: tick - first };
}

export type PriceWheelRange = NonNullable<ReturnType<typeof priceWheelRange>>;

export function priceAtWheelOffset(range: PriceWheelRange, offset: number) {
  const index = Math.min(range.last - range.first, Math.max(0,
    Math.round((Number.isFinite(offset) ? offset : range.index * PRICE_WHEEL_ROW_HEIGHT) / PRICE_WHEEL_ROW_HEIGHT)));
  return { index, value: Number(((range.first + index) * range.step).toFixed(range.digits)) };
}
