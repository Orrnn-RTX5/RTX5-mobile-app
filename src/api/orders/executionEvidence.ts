export type BrokerExecutionEvidence = Readonly<{
  ticket?: number | string;
  executionPrice?: number;
  confirmed: boolean;
}>;

const toPositiveFiniteNumber = (value: unknown): number | undefined => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
};

/**
 * A successful HTTP response only proves that the request was accepted by the
 * API. Market execution is confirmed only when the broker returns both its
 * ticket and the actual fill price.
 */
export function resolveBrokerExecutionEvidence(response: unknown): BrokerExecutionEvidence {
  const data = response && typeof response === 'object' && !Array.isArray(response)
    ? response as Record<string, unknown>
    : {};
  const rawTicket = data.position_ticket ?? data.ticket;
  const ticket = typeof rawTicket === 'string' && /^\d+$/.test(rawTicket.trim()) && !/^0+$/.test(rawTicket.trim())
    ? rawTicket.trim() : typeof rawTicket === 'number' && Number.isSafeInteger(rawTicket) && rawTicket > 0 ? rawTicket : undefined;
  const executionPrice = toPositiveFiniteNumber(data.price ?? data.price_open);
  const status = typeof data.status === 'string' ? data.status.trim().toLowerCase() : '';
  const explicitlyRejected = ['rejected', 'failed', 'error'].includes(status);
  const awaitingExecution = ['accepted', 'pending', 'queued', 'submitted', 'new', 'placed'].includes(status);

  return {
    ...(ticket !== undefined ? { ticket } : {}),
    ...(executionPrice !== undefined ? { executionPrice } : {}),
    confirmed: !explicitlyRejected && !awaitingExecution && ticket !== undefined && executionPrice !== undefined,
  };
}
