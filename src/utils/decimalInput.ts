/** Decimal keypad input: comma or dot is a decimal separator, never grouping. */
export function parsePositiveDecimalInput(value: string): number | undefined {
  const normalized = value.trim().replace(',', '.');
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return undefined;
  const number = Number(normalized);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}
