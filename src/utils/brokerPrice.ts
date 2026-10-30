/** Trading price values follow the active instrument, including trailing zeros. */
export function formatBrokerPrice(value: number, digits: number, placeholder = '—'): string {
  return Number.isFinite(value) && Number.isInteger(digits) && digits >= 0 && digits <= 10
    ? value.toFixed(digits) : placeholder;
}
