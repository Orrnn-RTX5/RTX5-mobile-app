/**
 * Format price readouts by the received value's integer part: one digit
 * (including zero) uses four decimals; two or more digits use two decimals.
 * The sign does not count as a digit. These rules do not use symbol/scale precision;
 * Tick sizing and order validation keep their existing rules.
 */
export function formatBackendPrice(value: unknown, placeholder = '--'): string {
  let numeric: number;
  if (typeof value === 'string') {
    const text = value.trim();
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return placeholder;
    numeric = Number(text);
  } else if (typeof value === 'number') {
    numeric = value;
  } else {
    return placeholder;
  }
  if (!Number.isFinite(numeric)) return placeholder;

  const decimals = Math.abs(numeric) < 10 ? 4 : 2;
  const text = numeric.toFixed(decimals);
  const match = /^(-?)(\d+)(?:\.(\d+))?e([+-]?\d+)$/i.exec(text);
  if (!match) return text;

  // JavaScript switches to exponent notation at 1e21 even with toFixed.
  // Keep those large values readable as decimal prices too.
  const [, sign, whole, fraction = '', exponent] = match;
  const digits = whole + fraction;
  const decimalIndex = whole.length + Number(exponent);
  if (decimalIndex <= 0) return `${sign}0.${'0'.repeat(-decimalIndex)}${digits}`;
  if (decimalIndex >= digits.length) {
    return sign + digits + '0'.repeat(decimalIndex - digits.length) + '.00';
  }
  return `${sign}${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
}

/** Plain JavaScript for Android/iOS WebView price labels; no Hermes function serialization. */
export const VALUE_BASED_PRICE_WEBVIEW_JS = String.raw`
  function formatValueBasedPrice(value, placeholder) {
    var fallback = typeof placeholder === 'string' ? placeholder : '--';
    if (typeof value !== 'number' && typeof value !== 'string') return fallback;
    if (typeof value === 'string' && !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return fallback;
    var numeric = Number(value);
    if (!isFinite(numeric)) return fallback;
    var text = numeric.toFixed(Math.abs(numeric) < 10 ? 4 : 2);
    var match = /^(-?)(\d+)(?:\.(\d+))?e([+-]?\d+)$/i.exec(text);
    if (!match) return text;
    var sign = match[1], whole = match[2], fraction = match[3] || '';
    var digits = whole + fraction, decimalIndex = whole.length + Number(match[4]);
    if (decimalIndex <= 0) return sign + '0.' + '0'.repeat(-decimalIndex) + digits;
    if (decimalIndex >= digits.length) return sign + digits + '0'.repeat(decimalIndex - digits.length) + '.00';
    return sign + digits.slice(0, decimalIndex) + '.' + digits.slice(decimalIndex);
  }
`;
