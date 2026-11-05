/** A fill receipt is not always a complete position (especially on netting accounts). */
export function confirmedPositionFill(response: unknown, now = Date.now()): Record<string, unknown> | null {
  if (!response || typeof response !== 'object' || Array.isArray(response)) return null;
  const row = response as Record<string, unknown>;
  const rawTicket = row.position_ticket ?? row.ticket;
  const ticket = typeof rawTicket === 'string' && /^\d+$/.test(rawTicket) && !/^0+$/.test(rawTicket)
    ? rawTicket : typeof rawTicket === 'number' && Number.isSafeInteger(rawTicket) && rawTicket > 0 ? String(rawTicket) : null;
  const status = String(row.status ?? '').toLowerCase();
  const action = String(row.action ?? '').toLowerCase();
  const price = Number(row.price_open ?? (['opened', 'open'].includes(action) ? row.price : undefined));
  // Never infer the weighted entry or remaining netted volume from a last fill.
  const volume = Number(row.opened_volume ?? row.volume);
  if (!ticket || !['filled', 'partial'].includes(status) || !['opened', 'open'].includes(action)
    || !Number.isFinite(price) || price <= 0 || !Number.isFinite(volume) || volume <= 0
    || (row.side !== 'buy' && row.side !== 'sell') || typeof row.symbol !== 'string' || !row.symbol.trim()) return null;
  return { ...row, ticket, volume, price_open: price, price_current: row.price_current ?? price,
    clientCreatedAt: now, time_create: row.time_create ?? row.open_time ?? row.time ?? Math.floor(now / 1000) };
}
