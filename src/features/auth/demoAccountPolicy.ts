const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const positiveLeverage = (value: unknown): number | undefined => {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  if (typeof value === 'string' && !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

/** Public defaults are a preview; only registration supplies the assigned account group. */
export function resolveDemoAccountPolicy(
  config: Record<string, unknown> | null,
  directoryBrokerName: string,
  registeredAccount?: Record<string, unknown>,
) {
  return {
    // The supported superadmin directory owns the selected broker's display name.
    brokerName: text(directoryBrokerName) || text(registeredAccount?.broker_name) || text(config?.broker_name),
    leverage: positiveLeverage(registeredAccount ? registeredAccount.leverage : config?.default_leverage),
    group: text(registeredAccount?.group),
  };
}
