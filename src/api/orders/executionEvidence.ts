export type BrokerExecutionEvidence = Readonly<{
  ticket?: number;
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
  const ticket = toPositiveFiniteNumber(
    data.position_ticket ?? data.ticket,
  );
  const executionPrice = toPositiveFiniteNumber(data.price ?? data.price_open);
  const status = typeof data.status === 'string' ? data.status.trim().toLowerCase() : '';
  const explicitlyRejected = ['rejected', 'failed', 'error'].includes(status);

  return {
    ...(ticket !== undefined ? { ticket } : {}),
    ...(executionPrice !== undefined ? { executionPrice } : {}),
    confirmed: !explicitlyRejected && ticket !== undefined && executionPrice !== undefined,
  };
}
