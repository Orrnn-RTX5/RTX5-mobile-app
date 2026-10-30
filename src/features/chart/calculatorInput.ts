import { parsePositiveDecimalInput } from '../../utils/decimalInput';
import { resolveDecimalsFromPriceStep } from '../../utils/pricePrecision';

export function resolveCalculatorPriceStep(meta: {
  tickSize?: number; point?: number; digits?: number;
} | undefined): number | undefined {
  for (const step of [meta?.tickSize, meta?.point]) {
    if (typeof step === 'number' && Number.isFinite(step) && step > 0) return step;
  }
  const digits = meta?.digits;
  return typeof digits === 'number' && Number.isInteger(digits) && digits >= 0 && digits <= 8
    ? 10 ** -digits : undefined;
}

export function stepCalculatorInput(
  value: string,
  direction: -1 | 1,
  step: number | undefined,
  fallback?: number,
  minimum = step,
  maximum = Infinity,
): string | undefined {
  if (step === undefined || !Number.isFinite(step) || step <= 0) return undefined;
  const current = value.trim() ? parsePositiveDecimalInput(value) : fallback;
  if (current === undefined || !Number.isFinite(current) || current <= 0) return undefined;
  const next = Math.min(maximum, Math.max(minimum ?? step, current + direction * step));
  if (!Number.isFinite(next) || next <= 0) return undefined;
  const decimals = Math.max(resolveDecimalsFromPriceStep(step) ?? 0,
    resolveDecimalsFromPriceStep(minimum) ?? 0);
  return next.toFixed(decimals);
}
