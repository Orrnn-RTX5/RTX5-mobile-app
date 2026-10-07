export type TradeVolumeBounds = {
  minVolume?: number | null;
  maxVolume?: number | null;
  stepVolume?: number | null;
};

export const DEFAULT_TRADE_VOLUME = 0.01;
export const FALLBACK_MAX_TRADE_VOLUME = 100;
export const FALLBACK_TRADE_VOLUME_STEP = 0.01;

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function countDecimals(value: number) {
  const normalized = value.toString();
  if (!normalized.includes('.')) {
    return 0;
  }
  return normalized.split('.')[1]?.length ?? 0;
}

function roundToDecimals(value: number, decimals: number) {
  return Number(value.toFixed(Math.min(Math.max(decimals, 0), 6)));
}

export function resolveTradeVolumeBounds(bounds?: TradeVolumeBounds) {
  const minVolume = Math.max(toFiniteNumber(bounds?.minVolume) ?? DEFAULT_TRADE_VOLUME, DEFAULT_TRADE_VOLUME);
  const maxVolume = Math.max(toFiniteNumber(bounds?.maxVolume) ?? FALLBACK_MAX_TRADE_VOLUME, minVolume);
  const stepVolume = Math.max(toFiniteNumber(bounds?.stepVolume) ?? FALLBACK_TRADE_VOLUME_STEP, FALLBACK_TRADE_VOLUME_STEP);
  const decimals = Math.max(countDecimals(minVolume), countDecimals(stepVolume), 2);

  return {
    minVolume,
    maxVolume,
    stepVolume,
    decimals,
  };
}

export function normalizeTradeVolume(value: unknown, bounds?: TradeVolumeBounds) {
  const { minVolume, maxVolume, stepVolume, decimals } = resolveTradeVolumeBounds(bounds);
  const parsed = toFiniteNumber(value);

  if (parsed === null) {
    return minVolume;
  }

  const clamped = Math.min(maxVolume, Math.max(minVolume, parsed));
  const offset = Math.round((clamped - minVolume) / stepVolume);
  const stepped = minVolume + offset * stepVolume;

  return Math.min(maxVolume, Math.max(minVolume, roundToDecimals(stepped, decimals)));
}

// True only when `value` is a tradeable lot for these bounds: within
// [min, max] AND an exact multiple of the step. Used to flag a manually-typed
// lot (MT5-style) instead of silently snapping it to the nearest step.
export function isValidTradeVolume(value: unknown, bounds?: TradeVolumeBounds) {
  const parsed = toFiniteNumber(value);
  if (parsed === null) {
    return false;
  }

  const { minVolume, maxVolume, stepVolume } = resolveTradeVolumeBounds(bounds);
  if (parsed < minVolume - 1e-9 || parsed > maxVolume + 1e-9) {
    return false;
  }

  const steps = (parsed - minVolume) / stepVolume;
  return Math.abs(steps - Math.round(steps)) <= 1e-6;
}

export function incrementTradeVolume(value: unknown, direction: -1 | 1, bounds?: TradeVolumeBounds) {
  const { stepVolume } = resolveTradeVolumeBounds(bounds);
  return normalizeTradeVolume((toFiniteNumber(value) ?? DEFAULT_TRADE_VOLUME) + direction * stepVolume, bounds);
}

export function formatTradeVolume(value: unknown, bounds?: TradeVolumeBounds) {
  const { decimals } = resolveTradeVolumeBounds(bounds);
  return normalizeTradeVolume(value, bounds).toFixed(decimals);
}

export function sanitizeTradeVolumeDraft(input: string) {
  const stripped = input.replace(/[^0-9.]/g, '');
  const [head = '', ...tail] = stripped.split('.');

  if (tail.length === 0) {
    return stripped;
  }

  return `${head}.${tail.join('')}`;
}
