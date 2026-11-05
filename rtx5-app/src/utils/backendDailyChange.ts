/** Presentation only: the percentage itself must be supplied by the backend. */
export function formatBackendDailyChange(value: unknown, placeholder = '--'): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return placeholder;
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}
