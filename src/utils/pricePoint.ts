export function derivePointFromDigits(digits: number | undefined): number | undefined {
  return typeof digits === 'number' && Number.isInteger(digits) && digits >= 0 && digits <= 12
    ? Number((10 ** -digits).toFixed(digits))
    : undefined;
}

const positivePoint = (point: number | undefined) =>
  typeof point === 'number' && Number.isFinite(point) && point > 0 ? point : undefined;

/** Metadata normalizes the broker's explicit point or authoritative decimal digits. */
export function resolveTradePositionPointValue({ instrumentMeta, liveQuote }: {
  instrumentMeta?: { point?: number };
  liveQuote?: { point?: number; digits?: number; digitsSource?: string };
}): number | undefined {
  return positivePoint(instrumentMeta?.point)
    ?? positivePoint(liveQuote?.point)
    ?? (liveQuote?.digitsSource === 'backend' ? derivePointFromDigits(liveQuote.digits) : undefined);
}

export function formatPointSize(point: number | undefined): string {
  if (positivePoint(point) === undefined) return '--';
  const value = point as number;
  if (Number.isInteger(value)) return String(value);
  const decimals = Math.min(20, Math.max(2, Math.ceil(-Math.log10(value)) + 2));
  const text = value.toFixed(decimals).replace(/0+$/, '').replace(/\.$/, '');
  return text === '0' ? String(value) : text;
}
