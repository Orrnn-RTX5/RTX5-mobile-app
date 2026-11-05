export type PendingOrderEventKind = 'placed' | 'modified' | 'cancelled' | 'expired' | 'filled';

export function pendingOrderEventKind(value: string, statusValue?: unknown): PendingOrderEventKind | null {
  const event = value.toLowerCase().replace(/[_-]+/g, '.');
  const match = /^(?:pending\.)?order\.(placed|modified|cancelled|canceled|triggered|expired|filled)$/.exec(event);
  if (match) {
    if (match[1] === 'canceled') return 'cancelled';
    if (match[1] === 'triggered') return 'filled';
    return match[1] as PendingOrderEventKind;
  }
  if (/^(?:pending\.updated|order\.updated|orders\.updated)$/.test(event) || typeof statusValue === 'string') {
    const status = String(statusValue ?? '').trim().toLowerCase().replace(/[_-]+/g, '.');
    if (status === 'cancelled' || status === 'canceled' || status === 'deleted') return 'cancelled';
    if (status === 'triggered' || status === 'filled') return 'filled';
    if (status === 'expired') return 'expired';
    if (status === 'modified') return 'modified';
    if (status === 'placed' || status === 'pending') return 'placed';
  }
  return null;
}

export function pendingEventNotification(
  kind: PendingOrderEventKind, ticket: number, order: Record<string, unknown>,
): string | null {
  if (kind === 'expired') return `Pending order #${ticket} expired`;
  if (kind !== 'filled') return null;
  const side = String(order.side ?? order.type ?? '').toUpperCase().startsWith('SELL') ? 'SELL' : 'BUY';
  const price = order.fill_price ?? order.price_fill ?? order.price;
  return `Order #${ticket} filled: ${side} ${order.volume ?? ''} ${order.symbol ?? ''}${price != null ? ` @ ${price}` : ''}`;
}
