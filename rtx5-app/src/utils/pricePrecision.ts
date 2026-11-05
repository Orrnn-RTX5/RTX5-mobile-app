export const MAX_PRICE_DECIMALS = 8;

const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

const clampPriceDecimals = (value: number): number =>
  Math.min(Math.max(Math.floor(value), 0), MAX_PRICE_DECIMALS);

export const normalizePriceDigits = (value: unknown): number | undefined => {
  const parsed = toFiniteNumber(value);
  return parsed === undefined ? undefined : clampPriceDecimals(parsed);
};

const countDecimalPlacesFromText = (value: string): number | undefined => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  const exponentParts = normalized.split('e');
  if (exponentParts.length > 2) {
    return undefined;
  }

  const exponent = exponentParts.length === 2 ? Number(exponentParts[1]) : 0;
  if (!Number.isFinite(exponent)) {
    return undefined;
  }

  const mantissa = exponentParts[0].replace(/^[+-]/, '');
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(mantissa)) {
    return undefined;
  }

  const decimalIndex = mantissa.indexOf('.');
  const decimalPlaces =
    decimalIndex >= 0
      ? mantissa.slice(decimalIndex + 1).length
      : 0;

  return clampPriceDecimals(decimalPlaces - exponent);
};

export const resolveDecimalsFromPriceValue = (value: unknown): number | undefined => {
  if (typeof value === 'string') {
    return countDecimalPlacesFromText(value);
  }

  const parsed = toFiniteNumber(value);
  if (parsed === undefined || Number.isInteger(parsed)) {
    return undefined;
  }

  return countDecimalPlacesFromText(String(parsed));
};

export const resolveDecimalsFromPriceStep = (value: unknown): number | undefined => {
  const parsed = toFiniteNumber(value);
  if (parsed === undefined || parsed <= 0) {
    return undefined;
  }

  const sourceText = typeof value === 'string' ? value : String(parsed);
  return countDecimalPlacesFromText(sourceText) ?? countDecimalPlacesFromText(String(parsed));
};
