/**
 * Core module: positionsState.ts
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OPEN_POSITIONS_SESSION_CACHE_STORAGE_PREFIX } from './sessionCacheStorage';
import type { PositionItem } from '../dev/mock/tradingData';
import { positionsApi, type Position } from '../api/positions';
import { appQueryClient } from './providers/AppProviders';
import { resolveTradingLoginString } from './tradingLogin';
import { invalidateCurrentSessionQueryRoots } from '../query/authenticatedQueryScope';
import {
  classifyTradingError,
  createFrontendTradingError,
  parseRetryAfterSeconds,
  type TradingApiError,
  type TradingErrorFeedback,
} from '../api/tradingErrors';
import { UNKNOWN_POSITION_SYMBOL, mapPositionToItem } from './positionsMapper';
import {
  buildOpenPositionsCacheSignature,
  buildMergedPositions,
  dedupePositionsById,
  findExistingPosition,
  isTerminalPositionUpdate,
  shouldClearPositionsForLoginSwitch,
} from './positionsState.helpers';
import {
  captureActiveBrokerSession,
  getActiveBrokerSessionIdentity,
  isActiveBrokerSessionCurrent,
  subscribeActiveBrokerSession,
  type ActiveBrokerSessionIdentity,
} from './activeBrokerSession';
import {
  canCommitUncoordinatedPositionsRead,
  capturePositionsMutationBarrier,
} from './positionsMutationBarrier';

type PositionsState = {
  positions: PositionItem[];
  positionSnapshots: Record<string, PositionItem>;
  isLoading: boolean;
  lastFetchLogin: string | null;
  hydratedLogin: string | null;
  lastError: TradingErrorFeedback | null;
  setPositions: (positions: PositionItem[]) => void;
  clearPositions: () => void;
  primePositionSnapshot: (position: PositionItem) => void;
  clearPositionSnapshot: (positionId?: string | number) => void;
  removePosition: (positionId: string | number) => void;
  beginOptimisticClose: (positionId: string | number) => void;
  finishOptimisticClose: (positionId: string | number) => void;
  rollbackOptimisticClose: (position: PositionItem) => void;
  applyPositionsSnapshot: (
    dtos: any[],
    accountLogin?: string,
    options?: Parameters<typeof buildMergedPositions>[2],
  ) => void;
  applyPositionReconciliation: (
    positionId: string | number,
    dto: Record<string, unknown> | undefined,
    accountLogin?: string,
  ) => void;
  upsertPosition: (dto: any) => void;
  hydrateCachedPositions: (accountLogin: string) => Promise<void>;
  refreshPositions: (accountLogin: string) => Promise<void>;
};

const DEBUG_POSITIONS_STATE =
  typeof process !== 'undefined' && process.env.EXPO_PUBLIC_DEBUG_POSITIONS_STATE === 'true';
const DEFAULT_RATE_LIMIT_BACKOFF_SECONDS = 30;
const positionsRateLimitUntilByNamespace = new Map<string, number>();
const OPEN_POSITIONS_CACHE_PREFIX = OPEN_POSITIONS_SESSION_CACHE_STORAGE_PREFIX;
const OPTIMISTIC_CLOSE_SUPPRESS_MS = 60_000;
// After a close tap we hide that ticket immediately. This guard stops a stale
// positions poll from briefly adding the same position back before backend sync.
const optimisticCloseUntilByPositionId = new Map<string, number>();

type CachedOpenPositionsPayload = {
  version: 2;
  cacheNamespace: string;
  brokerId: string;
  accountLogin: string;
  sessionEpoch: number;
  savedAt: number;
  positions: PositionItem[];
};

type PositionsCacheScope = Readonly<{
  cacheNamespace: string;
  brokerId: string;
  accountLogin: string;
  sessionEpoch: number;
  identity: ActiveBrokerSessionIdentity;
  resetGeneration: number;
}>;

type PendingOpenPositionsCacheWrite = Readonly<{
  scope: PositionsCacheScope;
  positions: PositionItem[];
  signature: string;
}>;

const pendingOpenPositionsCacheWrites = new Map<string, PendingOpenPositionsCacheWrite>();
const latestOpenPositionsCacheSignatureByNamespace = new Map<string, string>();
let openPositionsCacheWriteTimer: ReturnType<typeof setTimeout> | null = null;
let positionsCacheResetGeneration = 0;
// When a refresh is already in flight for an account, later callers (post-trade
// sync, Trade tab focus) used to no-op and never re-run. Queue one follow-up so
// a place-order success always lands in positionsState after the in-flight fetch.
const pendingPositionsRefreshLogins = new Set<string>();
const positionsRefreshInFlightByLogin = new Map<string, Promise<void>>();

const logPositionsStateDiagnostic = (...args: Parameters<typeof console.log>) => {
  if (DEBUG_POSITIONS_STATE) {
    console.log(...args);
  }
};

const warnPositionsStateDiagnostic = (...args: Parameters<typeof console.log>) => {
  if (DEBUG_POSITIONS_STATE) {
    console.log(...args);
  }
};

const getOpenPositionsCacheKey = (cacheNamespace: string): string =>
  `${OPEN_POSITIONS_CACHE_PREFIX}:${encodeURIComponent(cacheNamespace)}`;

const capturePositionsCacheScope = (
  accountLogin?: string | null,
): PositionsCacheScope | null => {
  const capture = captureActiveBrokerSession();
  if (!capture) {
    return null;
  }

  const normalizedLogin = String(accountLogin ?? capture.session.accountLogin).trim();
  if (!normalizedLogin || normalizedLogin !== capture.session.accountLogin) {
    return null;
  }

  return Object.freeze({
    cacheNamespace: capture.session.cacheNamespace,
    brokerId: capture.session.brokerId,
    accountLogin: capture.session.accountLogin,
    sessionEpoch: capture.session.sessionEpoch,
    identity: getActiveBrokerSessionIdentity(capture.session),
    resetGeneration: positionsCacheResetGeneration,
  });
};

const isPositionsCacheScopeCurrent = (scope: PositionsCacheScope): boolean => {
  const capture = captureActiveBrokerSession();
  return (
    scope.resetGeneration === positionsCacheResetGeneration &&
    capture?.session.cacheNamespace === scope.cacheNamespace &&
    isActiveBrokerSessionCurrent(scope.identity)
  );
};

const resolvePositionId = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const source = value as Record<string, unknown>;
  const id = source.ticket ?? source.position_ticket ?? source.order_ticket ?? source.id;
  if (id === undefined || id === null) {
    return null;
  }

  const normalized = String(id).trim();
  return normalized ? normalized : null;
};

const markPositionOptimisticallyClosing = (positionId: string | number) => {
  optimisticCloseUntilByPositionId.set(String(positionId), Date.now() + OPTIMISTIC_CLOSE_SUPPRESS_MS);
};

const clearPositionOptimisticallyClosing = (positionId: string | number) => {
  optimisticCloseUntilByPositionId.delete(String(positionId));
};

const isPositionOptimisticallyClosing = (positionId: string | number | null | undefined): boolean => {
  if (positionId === undefined || positionId === null) {
    return false;
  }

  const key = String(positionId);
  const suppressUntil = optimisticCloseUntilByPositionId.get(key);
  if (!suppressUntil) {
    return false;
  }

  if (suppressUntil <= Date.now()) {
    optimisticCloseUntilByPositionId.delete(key);
    return false;
  }

  return true;
};

const sortPositionsNewestFirst = (positions: PositionItem[]): PositionItem[] =>
  [...positions].sort((a, b) => new Date(b.openTime).getTime() - new Date(a.openTime).getTime());

const withoutOptimisticallyClosingPositions = (positions: PositionItem[]): PositionItem[] => {
  const filtered = positions.filter((position) => !isPositionOptimisticallyClosing(position.id));
  // Preserve the input identity when nothing was removed so unchanged
  // snapshots do not fan out as store updates to every subscribed screen.
  return filtered.length === positions.length ? positions : filtered;
};

const clonePositionForCache = (position: PositionItem): PositionItem => ({
  id: String(position.id),
  symbol: position.symbol,
  side: position.side === 'sell' ? 'sell' : 'buy',
  volume: Number(position.volume) || 0,
  openPrice: Number(position.openPrice) || 0,
  currentPrice: Number(position.currentPrice) || Number(position.openPrice) || 0,
  pnl: Number(position.pnl) || 0,
  swap: Number(position.swap) || 0,
  commission: Number(position.commission) || 0,
  openTime: position.openTime,
  sl: Number(position.sl) || 0,
  tp: Number(position.tp) || 0,
  clientCreatedAt: position.clientCreatedAt,
  clientModifiedAt: position.clientModifiedAt,
});

const normalizeCachedPositions = (positions: unknown): PositionItem[] => {
  if (!Array.isArray(positions)) {
    return [];
  }

  return buildMergedPositions([], positions, { preserveMissingExisting: true }).map(clonePositionForCache);
};

const flushOpenPositionsCacheWrites = () => {
  openPositionsCacheWriteTimer = null;
  const writes = Array.from(pendingOpenPositionsCacheWrites.entries());
  pendingOpenPositionsCacheWrites.clear();

  writes.forEach(([, pendingWrite]) => {
    const { scope, positions, signature } = pendingWrite;
    if (!isPositionsCacheScopeCurrent(scope)) {
      return;
    }

    const key = getOpenPositionsCacheKey(scope.cacheNamespace);
    if (positions.length === 0) {
      void AsyncStorage.removeItem(key).catch((error) => {
        if (latestOpenPositionsCacheSignatureByNamespace.get(scope.cacheNamespace) === signature) {
          latestOpenPositionsCacheSignatureByNamespace.delete(scope.cacheNamespace);
        }
        warnPositionsStateDiagnostic('[PositionsState] Failed to clear cached positions', error);
      });
      return;
    }

    const payload: CachedOpenPositionsPayload = {
      version: 2,
      cacheNamespace: scope.cacheNamespace,
      brokerId: scope.brokerId,
      accountLogin: scope.accountLogin,
      sessionEpoch: scope.sessionEpoch,
      savedAt: Date.now(),
      positions: positions.map(clonePositionForCache),
    };
    void AsyncStorage.setItem(key, JSON.stringify(payload)).catch((error) => {
      if (latestOpenPositionsCacheSignatureByNamespace.get(scope.cacheNamespace) === signature) {
        latestOpenPositionsCacheSignatureByNamespace.delete(scope.cacheNamespace);
      }
      warnPositionsStateDiagnostic('[PositionsState] Failed to persist cached positions', error);
    });
  });
};

const scheduleOpenPositionsCacheWrite = (accountLogin: string | null | undefined, positions: PositionItem[]) => {
  const scope = capturePositionsCacheScope(accountLogin);
  if (!scope) {
    return;
  }

  const signature = buildOpenPositionsCacheSignature(positions);
  if (latestOpenPositionsCacheSignatureByNamespace.get(scope.cacheNamespace) === signature) {
    return;
  }

  latestOpenPositionsCacheSignatureByNamespace.set(scope.cacheNamespace, signature);

  pendingOpenPositionsCacheWrites.set(scope.cacheNamespace, {
    scope,
    positions: normalizeCachedPositions(positions),
    signature,
  });
  if (openPositionsCacheWriteTimer) {
    return;
  }

  openPositionsCacheWriteTimer = setTimeout(flushOpenPositionsCacheWrites, 250);
};

const readCachedOpenPositions = async (scope: PositionsCacheScope): Promise<PositionItem[]> => {
  try {
    const rawValue = await AsyncStorage.getItem(getOpenPositionsCacheKey(scope.cacheNamespace));
    if (!rawValue || !isPositionsCacheScopeCurrent(scope)) {
      return [];
    }

    const payload = JSON.parse(rawValue) as Partial<CachedOpenPositionsPayload>;
    const payloadMatchesScope =
      payload.version === 2 &&
      payload.cacheNamespace === scope.cacheNamespace &&
      payload.brokerId === scope.brokerId &&
      payload.accountLogin === scope.accountLogin &&
      payload.sessionEpoch === scope.sessionEpoch;

    return payloadMatchesScope
      ? normalizeCachedPositions(payload.positions)
      : [];
  } catch (error) {
    warnPositionsStateDiagnostic('[PositionsState] Failed to hydrate cached positions', error);
    return [];
  }
};

const getRetryAfterSeconds = (error: unknown): number | null => {
  const headers = (error as TradingApiError | undefined)?.headers;
  const retryAfter = headers?.['retry-after'];
  if (!retryAfter) {
    return null;
  }

  return parseRetryAfterSeconds(retryAfter);
};

export const usePositionsState = create<PositionsState>((set, get) => ({
  positions: [],
  positionSnapshots: {},
  isLoading: false,
  lastFetchLogin: null,
  hydratedLogin: null,
  lastError: null,
  setPositions: (positions) => {
    const nextPositions = withoutOptimisticallyClosingPositions(dedupePositionsById(positions));
    const accountLogin = get().lastFetchLogin ?? get().hydratedLogin ?? resolveTradingLoginString();
    scheduleOpenPositionsCacheWrite(accountLogin, nextPositions);
    set({ positions: nextPositions });
  },
  clearPositions: () =>
    set({
      positions: [],
      positionSnapshots: {},
      isLoading: false,
      lastError: null,
      lastFetchLogin: null,
      hydratedLogin: null,
    }),
  primePositionSnapshot: (position) =>
    set((state) => ({
      positionSnapshots: {
        ...state.positionSnapshots,
        [String(position.id)]: { ...position },
      },
    })),
  clearPositionSnapshot: (positionId) =>
    set((state) => {
      if (positionId === undefined) {
        return { positionSnapshots: {} };
      }

      const nextSnapshots = { ...state.positionSnapshots };
      delete nextSnapshots[String(positionId)];
      return { positionSnapshots: nextSnapshots };
    }),
  removePosition: (positionId) =>
    set((state) => {
      const nextPositions = state.positions.filter((position) => String(position.id) !== String(positionId));
      const accountLogin = state.lastFetchLogin ?? state.hydratedLogin ?? resolveTradingLoginString();
      scheduleOpenPositionsCacheWrite(accountLogin, nextPositions);
      return {
        positions: nextPositions,
        positionSnapshots: Object.fromEntries(
          Object.entries(state.positionSnapshots).filter(([id]) => id !== String(positionId)),
        ),
      };
    }),
  beginOptimisticClose: (positionId) => {
    markPositionOptimisticallyClosing(positionId);
    get().removePosition(positionId);
  },
  finishOptimisticClose: (positionId) => {
    markPositionOptimisticallyClosing(positionId);
    get().removePosition(positionId);
  },
  rollbackOptimisticClose: (position) => {
    clearPositionOptimisticallyClosing(position.id);
    set((state) => {
      const restoredPositions = sortPositionsNewestFirst(dedupePositionsById([
        position,
        ...state.positions.filter((item) => String(item.id) !== String(position.id)),
      ]));
      const accountLogin = state.lastFetchLogin ?? state.hydratedLogin ?? resolveTradingLoginString();
      scheduleOpenPositionsCacheWrite(accountLogin, restoredPositions);
      return {
        positions: restoredPositions,
        positionSnapshots: {
          ...state.positionSnapshots,
          [String(position.id)]: { ...position },
        },
      };
    });
  },
  applyPositionsSnapshot: (dtos, accountLogin, options) =>
    set((state) => {
      const incomingDtos = Array.isArray(dtos)
        ? dtos.filter((dto) => !isPositionOptimisticallyClosing(resolvePositionId(dto)))
        : [];
      const nextPositions = withoutOptimisticallyClosingPositions(
        buildMergedPositions(state.positions, incomingDtos, options),
      );
      const terminalPositionIds = new Set(
        incomingDtos
          .filter(isTerminalPositionUpdate)
          .map(resolvePositionId)
          .filter((id): id is string => Boolean(id)),
      );
      const isAuthoritative = options?.preserveMissingExisting !== true;
      const nextPositionIds = new Set(nextPositions.map((position) => String(position.id)));
      const removedPositionIds = new Set(terminalPositionIds);
      if (isAuthoritative) {
        for (const position of state.positions) {
          const id = String(position.id);
          if (!nextPositionIds.has(id)) {
            removedPositionIds.add(id);
          }
        }
      }
      for (const id of [...removedPositionIds]) {
        if (isPositionOptimisticallyClosing(id)) {
          removedPositionIds.delete(id);
        }
      }

      if (removedPositionIds.size > 0) {
        void invalidateCurrentSessionQueryRoots(appQueryClient, [
          'positionHistory',
          'accountDeals',
          'deals',
          'accountSummary',
        ]);
      }

      const nextLogin = accountLogin ?? state.lastFetchLogin ?? state.hydratedLogin ?? resolveTradingLoginString();
      scheduleOpenPositionsCacheWrite(nextLogin, nextPositions);
      return {
        positions: nextPositions,
        positionSnapshots: removedPositionIds.size > 0
          ? Object.fromEntries(
            Object.entries(state.positionSnapshots).filter(([id]) => !removedPositionIds.has(id)),
          )
          : state.positionSnapshots,
        lastFetchLogin: accountLogin ?? state.lastFetchLogin,
        hydratedLogin: accountLogin ?? state.hydratedLogin,
        lastError: null,
      };
    }),

  applyPositionReconciliation: (positionId, dto, accountLogin) =>
    set((state) => {
      const targetId = String(positionId).trim();
      if (!targetId) {
        return {};
      }
      if (isPositionOptimisticallyClosing(targetId)) {
        return {};
      }
      if (dto && resolvePositionId(dto) !== targetId) {
        // The coordinator must never let one ticket write another ticket.
        return {};
      }

      const existingIndex = state.positions.findIndex(
        (position) => String(position.id) === targetId,
      );
      const nextLogin =
        accountLogin ??
        state.lastFetchLogin ??
        state.hydratedLogin ??
        resolveTradingLoginString();

      if (!dto || isTerminalPositionUpdate(dto)) {
        const hasPrimedSnapshot = Object.prototype.hasOwnProperty.call(
          state.positionSnapshots,
          targetId,
        );
        if (existingIndex < 0 && !hasPrimedSnapshot) {
          return {
            lastFetchLogin: accountLogin ?? state.lastFetchLogin,
            hydratedLogin: accountLogin ?? state.hydratedLogin,
            lastError: null,
          };
        }

        const nextPositions = state.positions.filter(
          (position) => String(position.id) !== targetId,
        );
        if (existingIndex >= 0) {
          scheduleOpenPositionsCacheWrite(nextLogin, nextPositions);
          void invalidateCurrentSessionQueryRoots(appQueryClient, [
            'positionHistory',
            'accountDeals',
            'deals',
            'accountSummary',
          ]);
        }
        return {
          positions: nextPositions,
          positionSnapshots: Object.fromEntries(
            Object.entries(state.positionSnapshots).filter(([id]) => id !== targetId),
          ),
          lastFetchLogin: accountLogin ?? state.lastFetchLogin,
          hydratedLogin: accountLogin ?? state.hydratedLogin,
          lastError: null,
        };
      }

      const existing = existingIndex >= 0 ? state.positions[existingIndex] : undefined;
      const reconciled = mapPositionToItem(
        dto,
        existing,
        { preserveMissingProtection: false },
      );
      if (
        String(reconciled.id) !== targetId ||
        reconciled.symbol === UNKNOWN_POSITION_SYMBOL
      ) {
        return {};
      }

      const nextPositions = [...state.positions];
      if (existingIndex >= 0) {
        nextPositions[existingIndex] = reconciled;
      } else {
        nextPositions.push(reconciled);
      }
      const normalizedPositions = sortPositionsNewestFirst(
        dedupePositionsById(nextPositions),
      );
      scheduleOpenPositionsCacheWrite(nextLogin, normalizedPositions);
      return {
        positions: normalizedPositions,
        lastFetchLogin: accountLogin ?? state.lastFetchLogin,
        hydratedLogin: accountLogin ?? state.hydratedLogin,
        lastError: null,
      };
    }),

  upsertPosition: (dto: any) => {
    set((state) => {
      if (isPositionOptimisticallyClosing(resolvePositionId(dto))) {
        return {};
      }

      const accountLogin = state.lastFetchLogin ?? state.hydratedLogin ?? resolveTradingLoginString();
      if (isTerminalPositionUpdate(dto)) {
        // A position was closed (SL/TP hit, server-side close, etc.).
        // Invalidate history even if the open event was never observed. This
        // lets an exact terminal ticket clear an awaiting Chart SL/TP draft
        // instead of waiting for the normal history polling interval.
        void invalidateCurrentSessionQueryRoots(appQueryClient, [
          'positionHistory',
          'accountDeals',
          'deals',
          'accountSummary',
        ]);
        const existing = findExistingPosition(state.positions, dto);
        if (!existing) {
          return {};
        }

        const nextPositions = state.positions.filter((position) => position.id !== existing.id);
        scheduleOpenPositionsCacheWrite(accountLogin, nextPositions);
        return {
          positions: nextPositions,
          positionSnapshots: Object.fromEntries(
            Object.entries(state.positionSnapshots).filter(([id]) => id !== String(existing.id)),
          ),
        };
      }

      const existing = findExistingPosition(state.positions, dto);
      const newItem = mapPositionToItem(dto, existing);
      if (!existing && newItem.symbol === UNKNOWN_POSITION_SYMBOL) {
        return {};
      }
      const source = dto && typeof dto === 'object' ? (dto as Record<string, unknown>) : {};
      const incomingClientCreatedAt =
        typeof source.clientCreatedAt === 'number' && Number.isFinite(source.clientCreatedAt)
          ? source.clientCreatedAt
          : undefined;
      if (incomingClientCreatedAt !== undefined) {
        newItem.clientCreatedAt = incomingClientCreatedAt;
      } else if (existing?.clientCreatedAt !== undefined) {
        // upsertPosition is an incremental websocket/optimistic writer. Keep
        // the convergence marker until an authoritative snapshot confirms the
        // ticket; dropping it here lets a stale empty REST read blink the row.
        newItem.clientCreatedAt = existing.clientCreatedAt;
      } else {
        delete newItem.clientCreatedAt;
      }
      newItem.clientModifiedAt = existing?.clientModifiedAt;

      const existsIdx = state.positions.findIndex((position) => position.id === newItem.id);
      const nextPositions = [...state.positions];

      if (existsIdx >= 0) {
        nextPositions[existsIdx] = newItem;
      } else {
        nextPositions.unshift(newItem);
      }

      const sortedPositions = dedupePositionsById(nextPositions).sort(
        (a, b) => new Date(b.openTime).getTime() - new Date(a.openTime).getTime(),
      );
      scheduleOpenPositionsCacheWrite(accountLogin, sortedPositions);

      return {
        positions: sortedPositions,
      };
    });
  },

  hydrateCachedPositions: async (accountLogin: string) => {
    const normalizedLogin = String(accountLogin ?? '').trim();
    if (!normalizedLogin) {
      return;
    }

    const cacheScope = capturePositionsCacheScope(normalizedLogin);
    if (!cacheScope) {
      return;
    }

    // Guard before the async cache read: if the app already knows a different
    // account is active, never hydrate rows from the requested login.
    const activeLogin = resolveTradingLoginString();
    if (activeLogin && activeLogin !== normalizedLogin) {
      return;
    }

    const state = get();
    if (state.hydratedLogin === normalizedLogin && state.lastFetchLogin === normalizedLogin) {
      return;
    }

    const cachedPositions = await readCachedOpenPositions(cacheScope);
    if (!isPositionsCacheScopeCurrent(cacheScope)) {
      return;
    }

    set((latestState) => {
      // Guard again after AsyncStorage returns. The active account may have
      // changed while the cache read was in flight.
      const latestActiveLogin = resolveTradingLoginString();
      if (
        !isPositionsCacheScopeCurrent(cacheScope) ||
        (latestActiveLogin && latestActiveLogin !== normalizedLogin)
      ) {
        return {};
      }

      if (latestState.hydratedLogin === normalizedLogin && latestState.lastFetchLogin === normalizedLogin) {
        return {};
      }

      const loginChanged = shouldClearPositionsForLoginSwitch(
        latestState.lastFetchLogin ?? latestState.hydratedLogin,
        normalizedLogin,
      );
      const nextPositions = loginChanged
        ? cachedPositions
        : dedupePositionsById([...latestState.positions, ...cachedPositions]);

      // This is only a device-cache hydrate. The focused refresh still asks the
      // backend, but the Trade screen does not have to flash a fake empty state.
      // For the same account we merge cache + memory; for a real account switch
      // we replace old-account rows so stale trades are not shown.
      return {
        positions: withoutOptimisticallyClosingPositions(nextPositions),
        positionSnapshots: loginChanged ? {} : latestState.positionSnapshots,
        lastFetchLogin: loginChanged ? normalizedLogin : latestState.lastFetchLogin ?? normalizedLogin,
        hydratedLogin: normalizedLogin,
        lastError: loginChanged ? null : latestState.lastError,
      };
    });
  },

  refreshPositions: async (accountLogin: string) => {
    const normalizedLogin = String(accountLogin ?? '').trim();
    if (!normalizedLogin) {
      return;
    }

    const existingInFlight = positionsRefreshInFlightByLogin.get(normalizedLogin);
    if (existingInFlight) {
      // Another refresh is already talking to the broker for this login. Wait for
      // it, then run one more pass so post-trade / Trade-tab callers still sync
      // after that in-flight response (which may have raced the broker commit).
      pendingPositionsRefreshLogins.add(normalizedLogin);
      await existingInFlight;
      if (!pendingPositionsRefreshLogins.has(normalizedLogin)) {
        // The in-flight finally already consumed the pending flag and scheduled
        // (or completed) the follow-up refresh.
        return;
      }
      pendingPositionsRefreshLogins.delete(normalizedLogin);
      return get().refreshPositions(normalizedLogin);
    }

    const cacheScope = capturePositionsCacheScope(normalizedLogin);
    if (!cacheScope) {
      warnPositionsStateDiagnostic(
        '[PositionsState] refreshPositions skipped: no matching active broker session for login',
        normalizedLogin,
      );
      return;
    }

    const runRefresh = async () => {
      const rateLimitUntilMs = positionsRateLimitUntilByNamespace.get(cacheScope.cacheNamespace) ?? 0;
      if (rateLimitUntilMs > Date.now()) {
        if (get().hydratedLogin !== normalizedLogin) {
          const cachedPositions = await readCachedOpenPositions(cacheScope);
          if (!isPositionsCacheScopeCurrent(cacheScope)) {
            return;
          }
          set((latestState) => ({
            ...(isPositionsCacheScopeCurrent(cacheScope)
              ? {
                  positions: shouldClearPositionsForLoginSwitch(latestState.lastFetchLogin, normalizedLogin)
                    ? cachedPositions
                    : dedupePositionsById([...latestState.positions, ...cachedPositions]),
                  lastFetchLogin: normalizedLogin,
                  hydratedLogin: normalizedLogin,
                }
              : {}),
          }));
        }
        return;
      }

      set((latestState) =>
        isPositionsCacheScopeCurrent(cacheScope)
          ? {
              isLoading: true,
              lastFetchLogin: normalizedLogin,
              lastError: null,
              // Drop old-account positions immediately so the chart never keeps
              // drawing stale trades while a new account fetch is in flight.
              positions: shouldClearPositionsForLoginSwitch(latestState.lastFetchLogin, normalizedLogin)
                ? []
                : latestState.positions,
              positionSnapshots: shouldClearPositionsForLoginSwitch(latestState.lastFetchLogin, normalizedLogin)
                ? {}
                : latestState.positionSnapshots,
              hydratedLogin: shouldClearPositionsForLoginSwitch(latestState.lastFetchLogin, normalizedLogin)
                ? null
                : latestState.hydratedLogin,
            }
          : {},
      );

      if (get().hydratedLogin !== normalizedLogin) {
        const cachedPositions = await readCachedOpenPositions(cacheScope);
        if (isPositionsCacheScopeCurrent(cacheScope)) {
          set((latestState) => ({
            ...(isPositionsCacheScopeCurrent(cacheScope)
              ? {
                  positions: shouldClearPositionsForLoginSwitch(latestState.lastFetchLogin, normalizedLogin)
                    ? cachedPositions
                    : dedupePositionsById([...latestState.positions, ...cachedPositions]),
                  hydratedLogin: normalizedLogin,
                }
              : {}),
          }));
        }
      }

      try {
        if (!isPositionsCacheScopeCurrent(cacheScope)) {
          return;
        }

        const login = parseInt(normalizedLogin, 10);
        if (Number.isNaN(login)) {
          warnPositionsStateDiagnostic('[PositionsState] Invalid account login:', normalizedLogin);
          if (isPositionsCacheScopeCurrent(cacheScope)) {
            set({
              isLoading: false,
              lastError: createFrontendTradingError(
                'Account Error',
                `The app could not resolve a valid trading account login from local state: ${normalizedLogin}.`,
              ),
            });
          }
          return;
        }

        const mutationBarrierSnapshot = capturePositionsMutationBarrier();
        // Contract v3: GET /positions/{login} returns ALL open positions; no
        // limit/offset paging (the old limit=50 default hid positions).
        const data = await positionsApi.getPositions(login);
        if (!isPositionsCacheScopeCurrent(cacheScope)) {
          return;
        }
        if (!canCommitUncoordinatedPositionsRead(mutationBarrierSnapshot)) {
          // The shared Modify Position coordinator owns the authoritative read
          // while its PUT/reconciliation job is active. A poll that overlapped
          // that job must never commit later and roll the eligible snapshot
          // backward.
          set({ isLoading: false });
          return;
        }

        let positionsArray: Position[];
        if (Array.isArray(data)) {
          positionsArray = data;
        } else if (data && typeof data === 'object') {
          const wrapped = data as any;
          if (Array.isArray(wrapped.data)) {
            positionsArray = wrapped.data;
          } else if (Array.isArray(wrapped.positions)) {
            positionsArray = wrapped.positions;
          } else if (Array.isArray(wrapped.items)) {
            positionsArray = wrapped.items;
          } else if (Array.isArray(wrapped.result)) {
            positionsArray = wrapped.result;
          } else {
            const arrVal = Object.values(wrapped).find(Array.isArray);
            if (arrVal) {
              positionsArray = arrVal as Position[];
            } else if (wrapped.ticket || wrapped.id) {
              positionsArray = [wrapped];
            } else {
              const vals = Object.values(wrapped);
              if (vals.length > 0 && typeof vals[0] === 'object' && (vals[0] as any).ticket) {
                positionsArray = vals as Position[];
              } else {
                positionsArray = [];
              }
            }
          }
        } else {
          positionsArray = [];
          warnPositionsStateDiagnostic('[PositionsState] Unexpected response shape:', typeof data);
        }

        logPositionsStateDiagnostic(
          '[PositionsState] Fetched',
          positionsArray.length,
          'open positions for login',
          login,
        );

        set((latestState) => {
          if (!isPositionsCacheScopeCurrent(cacheScope)) {
            return {};
          }
          const nextPositions = withoutOptimisticallyClosingPositions(
            buildMergedPositions(latestState.positions, positionsArray),
          );
          scheduleOpenPositionsCacheWrite(normalizedLogin, nextPositions);
          return {
            positions: nextPositions,
            isLoading: false,
            hydratedLogin: normalizedLogin,
            lastError: null,
          };
        });
      } catch (e) {
        if (!isPositionsCacheScopeCurrent(cacheScope)) {
          return;
        }
        const feedback = classifyTradingError(e, { action: 'load-positions' });
        if (feedback.kind === 'rate-limit') {
          const retryAfterSeconds =
            feedback.retryAfterSeconds ?? getRetryAfterSeconds(e) ?? DEFAULT_RATE_LIMIT_BACKOFF_SECONDS;
          positionsRateLimitUntilByNamespace.set(
            cacheScope.cacheNamespace,
            Date.now() + retryAfterSeconds * 1000,
          );
        } else {
          warnPositionsStateDiagnostic('[PositionsState] Failed to fetch positions', e);
        }
        set({
          isLoading: false,
          lastError: feedback,
        });
      } finally {
        // Scope can flip mid-request (session handoff). Always clear the local
        // loading flag for this login so later post-trade refreshes are not stuck.
        if (get().isLoading && get().lastFetchLogin === normalizedLogin) {
          set({ isLoading: false });
        }
      }
    };

    const flight = runRefresh().finally(() => {
      if (positionsRefreshInFlightByLogin.get(normalizedLogin) === flight) {
        positionsRefreshInFlightByLogin.delete(normalizedLogin);
      }
      if (pendingPositionsRefreshLogins.has(normalizedLogin)) {
        pendingPositionsRefreshLogins.delete(normalizedLogin);
        void get().refreshPositions(normalizedLogin);
      }
    });
    positionsRefreshInFlightByLogin.set(normalizedLogin, flight);
    await flight;
  },
}));

/**
 * Cancels deferred cache work and removes all position data tied to the prior
 * broker session. Already-started storage operations are harmless because
 * their key is namespaced and their captured identity cannot hydrate again.
 */
export const resetPositionsSessionState = (): void => {
  positionsCacheResetGeneration += 1;
  if (openPositionsCacheWriteTimer) {
    clearTimeout(openPositionsCacheWriteTimer);
    openPositionsCacheWriteTimer = null;
  }
  pendingOpenPositionsCacheWrites.clear();
  latestOpenPositionsCacheSignatureByNamespace.clear();
  pendingPositionsRefreshLogins.clear();
  positionsRefreshInFlightByLogin.clear();
  positionsRateLimitUntilByNamespace.clear();
  optimisticCloseUntilByPositionId.clear();
  usePositionsState.setState({
    positions: [],
    positionSnapshots: {},
    isLoading: false,
    lastFetchLogin: null,
    hydratedLogin: null,
    lastError: null,
  });
};

subscribeActiveBrokerSession((event) => {
  if (event.type === 'transition') {
    resetPositionsSessionState();
  }
});
