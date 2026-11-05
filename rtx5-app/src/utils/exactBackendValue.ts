/** Preserve server precision for execution results and calculated amounts. */
export function formatExactBackendValue(value: unknown, placeholder = '--'): string {
  if (typeof value !== 'number' && typeof value !== 'string') return placeholder;
  const text = String(value).trim();
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text) || !Number.isFinite(Number(text))) return placeholder;
  const match = /^([+-]?)(\d+)(?:\.(\d+))?e([+-]?\d+)$/i.exec(text);
  if (!match) return text;
  const [, sign, whole, fraction = '', exponent] = match;
  const digits = whole + fraction;
  const index = whole.length + Number(exponent);
  if (index <= 0) return `${sign}0.${'0'.repeat(-index)}${digits}`;
  if (index >= digits.length) return sign + digits + '0'.repeat(index - digits.length);
  return `${sign}${digits.slice(0, index)}.${digits.slice(index)}`;
}
