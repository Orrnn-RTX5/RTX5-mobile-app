export const CANONICAL_SLTP_BROKER_IDS = [
  'achiever-financials',
  'orrnn-demo',
  'gta_broker',
  'myprop-trade',
  'nexa',
  // Backend contract v3 (6.5). The gateway ids are exact and case-sensitive
  // ("trivanta-markets", "Orrnn"); capability lookup matches them ignoring
  // case, so "Orrnn" and "orrnn" share the canonical id 'orrnn'.
  'trivanta-markets',
  'orrnn',
] as const;

export type CanonicalSltpBrokerId = (typeof CANONICAL_SLTP_BROKER_IDS)[number];

export type BrokerSltpCapabilities = Readonly<{
  existingPositionPersistence: boolean;
  serverManagedTriggerClose: boolean;
  newMarketOrderProtection: boolean;
  pendingOrderProtection: boolean;
  trailingStop: boolean;
  dynamicConstraints: boolean;
  venueBrokerConfirmation: boolean;
  revisionIdempotencySafety: boolean;
}>;

/**
 * No frontend flag may claim readiness until the exact physical broker
 * runtime has independently passed the backend certification checklist.
 */
export const NO_BROKER_SLTP_CAPABILITIES: BrokerSltpCapabilities = Object.freeze({
  existingPositionPersistence: false,
  serverManagedTriggerClose: false,
  newMarketOrderProtection: false,
  pendingOrderProtection: false,
  trailingStop: false,
  dynamicConstraints: false,
  venueBrokerConfirmation: false,
  revisionIdempotencySafety: false,
});

/**
 * Exact scope enabled for the current broker runtimes:
 * - SL/TP attached to a new Market Execution order.
 * - SL/TP persisted on an existing open position, including server-managed
 *   trigger-close handling.
 *
 * Pending-order protection, trailing stops, and the advanced confirmation /
 * idempotency capabilities remain deliberately disabled.
 */
export const MARKET_AND_POSITION_SLTP_CAPABILITIES: BrokerSltpCapabilities =
  Object.freeze({
    existingPositionPersistence: true,
    serverManagedTriggerClose: true,
    newMarketOrderProtection: true,
    pendingOrderProtection: false,
    trailingStop: false,
    dynamicConstraints: false,
    venueBrokerConfirmation: false,
    revisionIdempotencySafety: false,
  });

/**
 * Capabilities are assigned only to exact broker identities returned by the
 * broker directory. There is intentionally no wildcard/default/hostname-
 * derived entry and no public environment-variable activation path.
 */
export const BROKER_SLTP_CAPABILITIES: Readonly<
  Record<CanonicalSltpBrokerId, BrokerSltpCapabilities>
> = Object.freeze({
  'achiever-financials': MARKET_AND_POSITION_SLTP_CAPABILITIES,
  'orrnn-demo': MARKET_AND_POSITION_SLTP_CAPABILITIES,
  gta_broker: MARKET_AND_POSITION_SLTP_CAPABILITIES,
  'myprop-trade': MARKET_AND_POSITION_SLTP_CAPABILITIES,
  nexa: MARKET_AND_POSITION_SLTP_CAPABILITIES,
  // Contract 6.5: market-order and position SL/TP ON; pending-order SL/TP and
  // trailing stop stay OFF until QA passes.
  'trivanta-markets': MARKET_AND_POSITION_SLTP_CAPABILITIES,
  orrnn: MARKET_AND_POSITION_SLTP_CAPABILITIES,
});

export function canonicalBrokerId(
  raw: string | null | undefined,
): CanonicalSltpBrokerId | null {
  const value = raw?.trim().toLowerCase();
  if (!value) return null;
  if (value === 'achiever-financials') return 'achiever-financials';
  if (value === 'grow-trading-academy' || value === 'gta_broker') {
    return 'gta_broker';
  }
  if (value === 'orrnn-demo') return 'orrnn-demo';
  if (value === 'myprop-trade') return 'myprop-trade';
  if (value === 'nexa') return 'nexa';
  if (value === 'trivanta-markets') return 'trivanta-markets';
  // Exact match only: 'orrnn-demo' above stays a separate broker.
  if (value === 'orrnn') return 'orrnn';
  return null;
}

export function resolveBrokerSltpCapabilities(
  brokerId: string | null | undefined,
): BrokerSltpCapabilities {
  const canonicalId = canonicalBrokerId(brokerId);
  return canonicalId
    ? BROKER_SLTP_CAPABILITIES[canonicalId]
    : NO_BROKER_SLTP_CAPABILITIES;
}

export function isExistingPositionSltpEnabled(
  capabilities: BrokerSltpCapabilities,
): boolean {
  return (
    capabilities.existingPositionPersistence === true &&
    capabilities.serverManagedTriggerClose === true
  );
}

export const SLTP_UNAVAILABLE_TITLE = 'SL/TP unavailable';

export function getSltpUnavailableMessage(
  brokerId: string | null | undefined,
): string {
  switch (canonicalBrokerId(brokerId)) {
    case 'achiever-financials':
      return 'SL/TP is unavailable for the requested Achiever trade flow. Only market-order and existing-position SL/TP are enabled.';
    case 'orrnn-demo':
      return 'SL/TP is unavailable for the requested Orrnn Demo trade flow. Only market-order and existing-position SL/TP are enabled.';
    case 'gta_broker':
      return 'SL/TP is unavailable for the requested GTA trade flow. Only market-order and existing-position SL/TP are enabled.';
    case 'myprop-trade':
      return 'SL/TP is unavailable for the requested MyProp trade flow. Only market-order and existing-position SL/TP are enabled.';
    case 'nexa':
      return 'SL/TP is unavailable for the requested Nexa trade flow. Only market-order and existing-position SL/TP are enabled.';
    case 'trivanta-markets':
      return 'SL/TP is unavailable for the requested Trivanta Markets trade flow. Only market-order and existing-position SL/TP are enabled.';
    case 'orrnn':
      return 'SL/TP is unavailable for the requested Orrnn trade flow. Only market-order and existing-position SL/TP are enabled.';
    default:
      return 'SL/TP is unavailable because the selected broker could not be verified.';
  }
}
