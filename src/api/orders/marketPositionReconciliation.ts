import type { Position } from '../positions';
import type { PlaceOrderResponse } from './types';

export const MARKET_POSITION_RECONCILIATION_ATTEMPTS = 10;
export const MARKET_POSITION_RECONCILIATION_DELAY_MS = 400;

type ReconciliationResult = 'committed' | 'stale' | 'unresolved';
type MarketPositionReconciliationEvidence =
  | PlaceOrderResponse
  | null
  | readonly (PlaceOrderResponse | null)[];

const isReconciliationEvidenceBatch = (
  evidence: MarketPositionReconciliationEvidence,
): evidence is readonly (PlaceOrderResponse | null)[] => Array.isArray(evidence);

type MarketPositionReconciliationDependencies = {
  readPositions: () => Promise<Position[]>;
  commitPositions: (positions: Position[]) => void;
  isOwnerCurrent: () => boolean;
  wait?: (delayMs: number) => Promise<void>;
  maxAttempts?: number;
  retryDelayMs?: number;
};

const waitFor = (delayMs: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, delayMs);
});

const toTicketKey = (value: unknown): string | null => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? String(numeric) : null;
};

const getResponseTicket = (response: PlaceOrderResponse | null): string | null =>
  toTicketKey(response?.position_ticket ?? response?.ticket);

const candidateContainsTicket = (positions: Position[], ticket: string): boolean =>
  positions.some((position) => toTicketKey(position.ticket) === ticket);

const getResponseAction = (response: PlaceOrderResponse | null): string =>
  typeof response?.action === 'string' ? response.action.trim().toLowerCase() : '';

const responseWasRejected = (response: PlaceOrderResponse | null): boolean => {
  const status = typeof response?.status === 'string' ? response.status.trim().toLowerCase() : '';
  return ['rejected', 'failed', 'error'].includes(status);
};

const requiresStableLedgerEvidence = (
  evidence: MarketPositionReconciliationEvidence,
): boolean => {
  const responses = isReconciliationEvidenceBatch(evidence) ? evidence : [evidence];
  const seenTickets = new Set<string>();

  return responses.some((response) => {
    const ticket = getResponseTicket(response);
    if (!response || !ticket || responseWasRejected(response)) return true;

    const action = getResponseAction(response);
    if (!['opened', 'open', 'closed'].includes(action)) return true;

    if (seenTickets.has(ticket)) return true;
    seenTickets.add(ticket);
    return false;
  });
};

/**
 * Ignore tick-driven price/P&L fields. This key tracks only the broker ledger
 * shape that market mutations can change, so consecutive reads can prove a
 * rapid netting burst has stopped changing before it replaces visible state.
 */
const createPositionLedgerStabilityKey = (positions: Position[]): string =>
  JSON.stringify(
    positions
      .map((position) => [
        toTicketKey(position.ticket),
        position.account_login,
        position.symbol.trim().toUpperCase(),
        position.side,
        position.volume,
        position.price_open,
        position.price_sl ?? null,
        position.price_tp ?? null,
        position.time_create,
      ] as const)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
  );

const compactMarketPositionReconciliationEvidence = (
  evidence: readonly (PlaceOrderResponse | null)[],
): readonly (PlaceOrderResponse | null)[] => {
  const latestByTicket = new Map<string, PlaceOrderResponse>();
  const expectedPresenceByTicket = new Map<string, boolean>();
  const conflictingTickets = new Set<string>();
  let hasUnknownOutcome = false;

  evidence.forEach((response) => {
    const ticket = getResponseTicket(response);
    if (!response || !ticket || responseWasRejected(response)) {
      hasUnknownOutcome = true;
      return;
    }
    const expectedPresence = getResponseAction(response) !== 'closed';
    const previousExpectedPresence = expectedPresenceByTicket.get(ticket);
    if (
      previousExpectedPresence !== undefined &&
      previousExpectedPresence !== expectedPresence
    ) {
      // Concurrent opposite-side netting requests have no guaranteed broker
      // completion order. Fall back to the conservative second-read backstop
      // instead of guessing final presence from frontend dispatch order.
      conflictingTickets.add(ticket);
      latestByTicket.delete(ticket);
      hasUnknownOutcome = true;
      return;
    }
    if (conflictingTickets.has(ticket)) return;
    expectedPresenceByTicket.set(ticket, expectedPresence);
    latestByTicket.set(ticket, response);
  });

  return Object.freeze([
    ...latestByTicket.values(),
    ...(hasUnknownOutcome ? [null] : []),
  ]);
};

/**
 * A broker's first ledger read can arrive before its accepted market mutation.
 * Keep that candidate off-screen until it agrees with the execution ticket.
 */
export function hasMarketPositionReconciliationConverged(
  response: PlaceOrderResponse | null,
  positions: Position[],
  attempt: number,
): boolean {
  const ticket = getResponseTicket(response);
  if (!ticket || responseWasRejected(response)) {
    // For an unknown transport outcome there is no safe ticket assertion. A
    // second full read is the minimum backstop before replacing the ledger.
    return attempt >= 1;
  }

  const action = getResponseAction(response);
  const ticketPresent = candidateContainsTicket(positions, ticket);
  if (action === 'closed') {
    return !ticketPresent;
  }
  if (action === 'opened' || action === 'open') {
    return ticketPresent;
  }
  if (['increased', 'decreased', 'reversed'].includes(action)) {
    return ticketPresent && attempt >= 1;
  }

  // An empty/unknown action can represent netting on older gateways. Require
  // both ticket presence and a second read so an already-open ticket does not
  // make the pre-commit candidate look converged.
  return ticketPresent && attempt >= 1;
}

export function hasMarketPositionReconciliationBatchConverged(
  evidence: readonly (PlaceOrderResponse | null)[],
  positions: Position[],
  attempt: number,
): boolean {
  const compacted = compactMarketPositionReconciliationEvidence(evidence);
  const requiredEvidence = compacted.length > 0 ? compacted : [null];
  return requiredEvidence.every((response) => (
    hasMarketPositionReconciliationConverged(response, positions, attempt)
  ));
}

export async function reconcileMarketOrderPositions(
  evidence: MarketPositionReconciliationEvidence,
  dependencies: MarketPositionReconciliationDependencies,
): Promise<ReconciliationResult> {
  const wait = dependencies.wait ?? waitFor;
  const maxAttempts = Math.max(
    1,
    dependencies.maxAttempts ?? MARKET_POSITION_RECONCILIATION_ATTEMPTS,
  );
  const retryDelayMs = Math.max(
    0,
    dependencies.retryDelayMs ?? MARKET_POSITION_RECONCILIATION_DELAY_MS,
  );
  const requiresStableLedger = requiresStableLedgerEvidence(evidence);
  let previousLedgerStabilityKey: string | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (!dependencies.isOwnerCurrent()) return 'stale';

    try {
      const positions = await dependencies.readPositions();
      if (!dependencies.isOwnerCurrent()) return 'stale';
      const converged = isReconciliationEvidenceBatch(evidence)
        ? hasMarketPositionReconciliationBatchConverged(evidence, positions, attempt)
        : hasMarketPositionReconciliationConverged(evidence, positions, attempt);
      const ledgerStabilityKey = requiresStableLedger
        ? createPositionLedgerStabilityKey(positions)
        : null;
      const stable = !requiresStableLedger
        || previousLedgerStabilityKey === ledgerStabilityKey;
      previousLedgerStabilityKey = ledgerStabilityKey;
      if (converged && stable) {
        dependencies.commitPositions(positions);
        return 'committed';
      }
    } catch {
      // A later strict read can still converge. Invalid response shapes are
      // never reinterpreted as an empty authoritative ledger.
    }

    if (attempt + 1 < maxAttempts) {
      await wait(retryDelayMs);
    }
  }

  // A candidate that contradicts confirmed execution evidence must not erase
  // the current UI. Normal polling resumes after the mutation barrier releases.
  return dependencies.isOwnerCurrent() ? 'unresolved' : 'stale';
}
