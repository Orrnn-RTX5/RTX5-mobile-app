import { formatExactBackendValue } from '../../utils/exactBackendValue';

export function orderTicketMarginDisplay(value: unknown, currency: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 ||
      typeof currency !== 'string' || !currency.trim()) return '--';
  const amount = formatExactBackendValue(value);
  return currency === 'USD' ? `-$${amount}` : `-${amount} ${currency}`;
}
