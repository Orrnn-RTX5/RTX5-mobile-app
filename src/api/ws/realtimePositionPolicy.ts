import type { PositionItem } from '../../dev/mock/tradingData';

type PositionRecord = Record<string, unknown>;

export type RealtimePositionFilterResult = Readonly<{
  acceptedRows: PositionRecord[];
  rejectedRows: number;
}>;

type PositionProtectionSnapshot = Pick<PositionItem, 'id' | 'sl' | 'tp'>;

const normalizeIdentity = (value: unknown): string | null => {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : null;
};

const isCredibleBrokerPositionTicket = (value: unknown): boolean => {
  const normalized = normalizeIdentity(value);
  // MT5 position tickets are positive integer identifiers. Keep them as
  // strings so tickets larger than Number.MAX_SAFE_INTEGER are not rounded.
  return Boolean(normalized && /^\d+$/.test(normalized) && /[1-9]/.test(normalized));
};

const resolveMapperIdentity = (
  row: PositionRecord,
): Readonly<{ key: 'ticket' | 'position_ticket' | 'order_ticket' | 'id'; value: unknown }> | null => {
  for (const key of ['ticket', 'position_ticket', 'order_ticket', 'id'] as const) {
    if (row[key] !== undefined && row[key] !== null) {
      return { key, value: row[key] };
    }
  }
  return null;
};

/**
 * Filters only the realtime ingress path. REST snapshots intentionally keep
 * using the permissive positions mapper because some valid deployments return
 * an `id` alias instead of `ticket`.
 *
 * A previously unseen realtime row may enter the ledger only with a credible
 * broker position ticket. Generic event ids (and order tickets, which are not
 * position identity) may update a row that REST/optimistic execution already
 * established, but cannot create hundreds of phantom positions.
 */
export function filterRealtimePositionRows(
  rows: unknown[],
  currentPositions: ReadonlyArray<Pick<PositionItem, 'id'>>,
): RealtimePositionFilterResult {
  const knownIds = new Set(
    currentPositions
      .map((position) => normalizeIdentity(position.id))
      .filter((id): id is string => id !== null),
  );
  const acceptedRows: PositionRecord[] = [];
  let rejectedRows = 0;

  for (const value of rows) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      rejectedRows += 1;
      continue;
    }

    const row = value as PositionRecord;
    const identity = resolveMapperIdentity(row);
    const normalizedId = normalizeIdentity(identity?.value);
    const canCreate = Boolean(
      identity &&
      (identity.key === 'ticket' || identity.key === 'position_ticket') &&
      isCredibleBrokerPositionTicket(identity.value),
    );
    const canUpdateKnown = Boolean(normalizedId && knownIds.has(normalizedId));

    if (!normalizedId || (!canCreate && !canUpdateKnown)) {
      rejectedRows += 1;
      continue;
    }

    acceptedRows.push(row);
    if (canCreate) {
      // A later generic-id row in the same broker batch may safely update the
      // canonical row that appeared earlier in that batch.
      knownIds.add(normalizedId);
    }
  }

  return { acceptedRows, rejectedRows };
}

const readProtectionCandidates = (
  row: PositionRecord,
  keys: ReadonlyArray<'price_sl' | 'sl' | 'price_tp' | 'tp'>,
): ReadonlyArray<number | null> => keys
  .filter((key) => Object.prototype.hasOwnProperty.call(row, key))
  .map((key) => {
    const value = row[key];
    if (value === null || value === undefined) return 0;
    if (typeof value === 'string' && value.trim() === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
  });

const normalizeConfirmedProtection = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};

/**
 * Returns only tickets whose unversioned websocket row carries meaningful
 * protection evidence. Ordinary price/profit ticks and unchanged full rows do
 * not justify an authoritative positions GET.
 */
export function resolveProtectionChangeHintTickets(
  rows: ReadonlyArray<PositionRecord>,
  currentPositions: ReadonlyArray<PositionProtectionSnapshot>,
): Array<string | number> {
  const confirmedByTicket = new Map(
    currentPositions.map((position) => [String(position.id), position] as const),
  );
  const tickets = new Map<string, string | number>();

  for (const row of rows) {
    const rawTicket = row.ticket ?? row.position_ticket ?? row.id;
    if (typeof rawTicket !== 'string' && typeof rawTicket !== 'number') continue;
    const ticket = String(rawTicket).trim();
    if (!ticket) continue;

    const slCandidates = readProtectionCandidates(row, ['price_sl', 'sl']);
    const tpCandidates = readProtectionCandidates(row, ['price_tp', 'tp']);
    if (slCandidates.length === 0 && tpCandidates.length === 0) continue;

    const confirmed = confirmedByTicket.get(ticket);
    const slChanged = slCandidates.some((candidate) => (
      candidate === null ||
      !confirmed ||
      candidate !== normalizeConfirmedProtection(confirmed.sl)
    ));
    const tpChanged = tpCandidates.some((candidate) => (
      candidate === null ||
      !confirmed ||
      candidate !== normalizeConfirmedProtection(confirmed.tp)
    ));
    if (slChanged || tpChanged) tickets.set(ticket, rawTicket);
  }

  return [...tickets.values()];
}

const normalizeHint = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, '.');

const isTruthySnapshotFlag = (value: unknown): boolean => {
  if (value === true) return true;
  const normalized = normalizeHint(value);
  return (
    normalized === 'true' ||
    normalized === 'full' ||
    normalized === 'complete' ||
    normalized === 'snapshot' ||
    normalized === 'authoritative'
  );
};

/** Only an explicit full/snapshot contract may replace the shared ledger. */
export function isAuthoritativeRealtimePositionsBatch(
  eventName: unknown,
  envelope?: unknown,
): boolean {
  const record = envelope && typeof envelope === 'object' && !Array.isArray(envelope)
    ? (envelope as PositionRecord)
    : null;
  const hints = [
    eventName,
    record?.event,
    record?.type,
    record?.action,
    record?.mode,
    record?.scope,
    record?.kind,
  ].map(normalizeHint).filter(Boolean);

  // Scoped/delta arrays are partial even if a parent payload uses a broader
  // lifecycle label.
  if (
    hints.some((hint) =>
      hint === 'position.update' ||
      hint === 'positions.update' ||
      /(^|\.)(incremental|delta|partial|scoped)(\.|$)/.test(hint),
    )
  ) {
    return false;
  }

  if (
    hints.some((hint) =>
      hint === 'account.snapshot' ||
      /(^|\.)(snapshot|full)(\.|$)/.test(hint),
    )
  ) {
    return true;
  }

  return Boolean(
    isTruthySnapshotFlag(record?.snapshot) ||
    isTruthySnapshotFlag(record?.is_snapshot) ||
    isTruthySnapshotFlag(record?.isSnapshot) ||
    isTruthySnapshotFlag(record?.full) ||
    isTruthySnapshotFlag(record?.complete) ||
    isTruthySnapshotFlag(record?.authoritative),
  );
}
