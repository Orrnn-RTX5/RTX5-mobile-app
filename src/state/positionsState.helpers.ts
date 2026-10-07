import type { PositionItem } from '../dev/mock/tradingData';
import {
  UNKNOWN_POSITION_SYMBOL,
  isRenderablePositionSymbol,
  mapPositionToItem,
} from './positionsMapper';

const TERMINAL_POSITION_STATES = new Set([
  'CLOSED',
  'CLOSE',
  'POSITION CLOSE',
  'POSITION CLOSED',
  'POSITION CLOSE BY',
  'CLOSED BY',
  'CLOSE BY',
  'SL HIT',
  'TP HIT',
  'SL TRIGGERED',
  'TP TRIGGERED',
  'STOP LOSS HIT',
  'TAKE PROFIT HIT',
  'POSITION SL HIT',
  'POSITION TP HIT',
  'POSITION STOP LOSS HIT',
  'POSITION TAKE PROFIT HIT',
  'REMOVED',
  'DELETED',
]);

/** `close_reason` values sent with `position_closed` (normalized). */
const TERMINAL_CLOSE_REASONS = new Set([
  'SL',
  'TP',
  'STOP OUT',
  'NETTING CLOSE',
  'NETTING REVERSE',
]);

export function findExistingPosition(positions: PositionItem[], dto: any): PositionItem | undefined {
  const incomingId = dto?.ticket ?? dto?.position_ticket ?? dto?.order_ticket ?? dto?.id;
  if (incomingId !== undefined && incomingId !== null) {
    return positions.find((position) => String(position.id) === String(incomingId));
  }

  return undefined;
}

export function normalizeLifecycleState(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export function isTerminalPositionUpdate(dto: any): boolean {
  if (!dto || typeof dto !== 'object') {
    return false;
  }

  const source = dto as Record<string, unknown>;
  // Contract v3: SL/TP hits, stop-outs and netting closes arrive as
  // `position_closed` rows carrying `close_reason`. A row with a known close
  // reason is terminal even when the event name was stripped from it.
  if (TERMINAL_CLOSE_REASONS.has(normalizeLifecycleState(source.close_reason))) {
    return true;
  }
  return [
    source.status,
    source.state,
    source.position_state,
    source.positionStatus,
    source.action,
    source.event,
    source.type,
  ].some((value) => TERMINAL_POSITION_STATES.has(normalizeLifecycleState(value)));
}

function resolveIncomingPositionId(dto: unknown): string | null {
  if (!dto || typeof dto !== 'object') {
    return null;
  }
  const source = dto as Record<string, unknown>;
  const value = source.ticket ?? source.position_ticket ?? source.order_ticket ?? source.id;
  if (value === null || value === undefined) {
    return null;
  }
  const id = String(value).trim();
  return id || null;
}

export function shouldClearPositionsForLoginSwitch(
  currentLogin: string | null,
  nextLogin: string,
): boolean {
  return Boolean(currentLogin && currentLogin !== nextLogin);
}

type BuildMergedPositionsOptions = {
  preserveOptimisticMs?: number;
  preserveModifiedMs?: number;
  preserveMissingExisting?: boolean;
};

export function dedupePositionsById<T extends Pick<PositionItem, 'id'>>(positions: T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];

  for (const position of positions) {
    const key = String(position.id ?? '').trim();
    if (!key) {
      unique.push(position);
      continue;
    }

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(position);
  }

  return unique;
}

function isRenderablePosition(position: PositionItem): boolean {
  return (
    String(position.id ?? '').trim().length > 0 &&
    isRenderablePositionSymbol(position.symbol) &&
    position.symbol !== UNKNOWN_POSITION_SYMBOL
  );
}

const arePositionItemsShallowEqual = (a: PositionItem, b: PositionItem): boolean => {
  if (a === b) {
    return true;
  }
  const aKeys = Object.keys(a) as Array<keyof PositionItem>;
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  for (const key of aKeys) {
    if (!Object.is(a[key], (b as Record<string, unknown>)[key as string])) {
      return false;
    }
  }
  return true;
};

export function arePositionListsEquivalent(
  current: PositionItem[],
  next: PositionItem[],
): boolean {
  if (current === next) {
    return true;
  }
  if (current.length !== next.length) {
    return false;
  }
  for (let index = 0; index < next.length; index += 1) {
    if (!arePositionItemsShallowEqual(current[index], next[index])) {
      return false;
    }
  }
  return true;
}

/**
 * Builds the identity used to decide whether the recoverable open-position
 * ledger needs another AsyncStorage write. Live currentPrice / pnl ticks are
 * intentionally excluded: they are immediately stale after a cold start and
 * are replaced by the next broker update. Everything that describes the
 * position itself remains included so opens, closes, partial closes, costs,
 * SL/TP edits, and optimistic convergence are persisted promptly.
 */
export function buildOpenPositionsCacheSignature(positions: PositionItem[]): string {
  return JSON.stringify(
    positions.map((position) => ({
      id: String(position.id),
      symbol: position.symbol,
      side: position.side === 'sell' ? 'sell' : 'buy',
      volume: Number(position.volume) || 0,
      openPrice: Number(position.openPrice) || 0,
      swap: Number(position.swap) || 0,
      commission: Number(position.commission) || 0,
      openTime: position.openTime,
      sl: Number(position.sl) || 0,
      tp: Number(position.tp) || 0,
      clientCreatedAt:
        typeof position.clientCreatedAt === 'number' && Number.isFinite(position.clientCreatedAt)
          ? position.clientCreatedAt
          : null,
      clientModifiedAt:
        typeof position.clientModifiedAt === 'number' && Number.isFinite(position.clientModifiedAt)
          ? position.clientModifiedAt
          : null,
    })),
  );
}

export function hasPositionPresenceConverged(
  positions: PositionItem[],
  positionId: string | number,
  expectedPresence: boolean,
): boolean {
  const matchingPosition = positions.find(
    (position) => String(position.id) === String(positionId),
  );

  // A locally inserted row still carries clientCreatedAt. Its presence proves
  // only that the optimistic paint worked, not that authoritative REST has
  // caught up. Full-ledger confirmation clears that marker.
  return expectedPresence
    ? Boolean(matchingPosition && matchingPosition.clientCreatedAt === undefined)
    : matchingPosition === undefined;
}

export function buildMergedPositions(
  currentPositions: PositionItem[],
  dtos: any[],
  options: BuildMergedPositionsOptions = {},
): PositionItem[] {
  const preserveOptimisticMs = options.preserveOptimisticMs ?? 60000;
  const preserveModifiedMs = options.preserveModifiedMs ?? 10000;
  const terminalPositionIds = new Set(
    dtos
      .filter(isTerminalPositionUpdate)
      .map(resolveIncomingPositionId)
      .filter((id): id is string => Boolean(id)),
  );
  const mapped = dtos
    .filter((dto) => !isTerminalPositionUpdate(dto))
    .map((dto) => mapPositionToItem(
      dto,
      findExistingPosition(currentPositions, dto),
      { preserveMissingProtection: options.preserveMissingExisting === true },
    ))
    .filter(isRenderablePosition);
  const now = Date.now();
  const mappedIds = new Set(mapped.map((position) => position.id));
  const missingCurrentPositions = currentPositions.filter(
    (position) =>
      isRenderablePosition(position)
      && !mappedIds.has(position.id)
      && !terminalPositionIds.has(String(position.id)),
  );

  const optimisticPositions = missingCurrentPositions.filter((position) => {
    const clientCreatedAt = position.clientCreatedAt ?? 0;
    if (!clientCreatedAt || preserveOptimisticMs <= 0) return false;

    const ageMs = now - clientCreatedAt;
    const isRecent = ageMs >= 0 && ageMs < preserveOptimisticMs;
    return isRecent;
  });
  const preservedMissingPositions = options.preserveMissingExisting
    ? missingCurrentPositions
    : optimisticPositions;

  const mergedMapped = mapped.map((mappedPosition) => {
    const existing = currentPositions.find((position) => position.id === mappedPosition.id);
    const { clientCreatedAt: mappedClientCreatedAt, ...confirmedPosition } = mappedPosition;
    // Incremental websocket batches must not clear the post-order convergence
    // marker. The next partial/empty batch could otherwise remove the new row
    // before the authoritative REST ledger has caught up. Full snapshots keep
    // the existing behavior and clear the marker once they confirm the ticket.
    const retainedClientCreatedAt = options.preserveMissingExisting
      ? existing?.clientCreatedAt ?? mappedClientCreatedAt
      : undefined;
    if (existing?.clientModifiedAt) {
      const modAgeMs = now - existing.clientModifiedAt;
      if (modAgeMs >= 0 && modAgeMs < preserveModifiedMs) {
        return {
          ...confirmedPosition,
          ...(retainedClientCreatedAt !== undefined
            ? { clientCreatedAt: retainedClientCreatedAt }
            : {}),
          sl: existing.sl,
          tp: existing.tp,
          clientModifiedAt: existing.clientModifiedAt,
        };
      }
    }

    return {
      ...confirmedPosition,
      ...(retainedClientCreatedAt !== undefined
        ? { clientCreatedAt: retainedClientCreatedAt }
        : {}),
      clientModifiedAt: existing?.clientModifiedAt,
    };
  });

  const merged = dedupePositionsById([...preservedMissingPositions, ...mergedMapped]).sort(
    (a, b) => new Date(b.openTime).getTime() - new Date(a.openTime).getTime(),
  );

  // Refresh polls usually return the same ledger. Keeping the previous array
  // identity lets every subscribed screen (retained tabs, warmed action
  // routes) skip re-rendering instead of reconciling on each 3s poll.
  return arePositionListsEquivalent(currentPositions, merged) ? currentPositions : merged;
}
