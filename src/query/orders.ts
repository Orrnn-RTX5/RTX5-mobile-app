/**
 * Core module: orders.ts
 *
 * Contains:
 *  - useOrdersByLoginQuery  — order history via paged GET /api/v2/account/orders
 *                             (falls back to GET /api/v2/orders/{login}),
 *                             normalised to the LoginOrder field names
 *  - useAccountOrdersQuery  — fetches order history via GET /api/v2/account/orders
 *                             (JWT-resolved, no login param)
 *  - usePlaceOrderMutation  — submits new market orders via POST /api/v2/orders
 */

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ordersApi, type PlaceOrderPayload, type PlaceOrderResponse } from '../api/orders';
import { StaleBrokerSessionError } from '../api/brokerApi';
import { redactDiagnosticValue } from '../utils/securityRedaction';
import {
  captureActiveBrokerSessionOwnerStamp,
  isActiveBrokerSessionOwnerStampCurrent,
  type ActiveBrokerSessionOwnerStamp,
} from '../state/activeBrokerSession';
import {
  getSessionQueryCacheNamespace,
  invalidateSessionQueryRoots,
  runSessionBoundQuery,
  useActiveBrokerQuerySession,
} from './authenticatedQueryScope';
import { createCoalescedSessionRefreshScheduler } from './coalescedSessionRefresh';

export const ORDERS_BY_LOGIN_KEY = 'ordersByLogin';
export const ACCOUNT_ORDERS_KEY = 'accountOrders';
const placeOrderCacheRefreshScheduler = createCoalescedSessionRefreshScheduler();

export const getOrdersByLoginQueryKey = (
  cacheNamespace: string,
  login?: number,
) => [ORDERS_BY_LOGIN_KEY, cacheNamespace, login] as const;

export const getAccountOrdersQueryKey = (cacheNamespace: string) =>
  [ACCOUNT_ORDERS_KEY, cacheNamespace] as const;

type PollingQueryOptions = {
  enabled?: boolean;
  refetchInterval?: number | false;
  refetchOnMount?: boolean | 'always';
};

const resolvePollingRefetchInterval = (
  enabled: boolean,
  fallbackMs: number,
  override?: number | false,
) => (enabled ? (override ?? fallbackMs) : false);

// ─────────────────────────────────────────────────────────────────────────────
// TanStack Query hook for login-based order history.
// Uses GET /api/v2/orders/{login} — returns orders for a specific MT5 account.
// Real response uses price_open / time_setup / time_done (not the swagger names).
// Primary hook used by the History screen's "Orders" tab.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch order history for a specific MT5 account login.
 * Returns 404 from the server if the account is not owned by the session user.
 *
 * @param login - MT5 account login number (pass undefined to disable the query)
 */
export function useOrdersByLoginQuery(
  login: number | undefined,
  options: PollingQueryOptions = {},
) {
  const session = useActiveBrokerQuerySession();
  const cacheNamespace = getSessionQueryCacheNamespace(session);
  const enabled = Boolean(session) && !!login && (options.enabled ?? true);
  return useQuery({
    queryKey: getOrdersByLoginQueryKey(cacheNamespace, login),
    queryFn: () => runSessionBoundQuery(
      cacheNamespace,
      // Contract 6.4: paged /account/orders first, /orders/{login} fallback.
      () => ordersApi.getOrderHistory(login!),
    ),
    enabled,
    refetchInterval: resolvePollingRefetchInterval(enabled, 10_000, options.refetchInterval),
    refetchOnMount: options.refetchOnMount,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TanStack Query hook for JWT-resolved order history (fallback / alternative).
// Uses GET /api/v2/account/orders — no login param needed.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch order history for the authenticated user's trading account.
 * Account is resolved server-side from the Bearer token — no login param needed.
 *
 * Polls every 10 seconds (orders change less frequently than positions/deals).
 */
export function useAccountOrdersQuery(options: PollingQueryOptions = {}) {
  const session = useActiveBrokerQuerySession();
  const cacheNamespace = getSessionQueryCacheNamespace(session);
  const enabled = Boolean(session) && (options.enabled ?? true);
  return useQuery({
    queryKey: getAccountOrdersQueryKey(cacheNamespace),
    queryFn: () => runSessionBoundQuery(
      cacheNamespace,
      () => ordersApi.getAccountOrders(),
    ),
    enabled,
    refetchInterval: resolvePollingRefetchInterval(enabled, 10_000, options.refetchInterval),
  });
}

const ORDER_DIAGNOSTICS_ENABLED =
  typeof process !== 'undefined' && process.env.EXPO_PUBLIC_DEBUG_CHART_TRADE === 'true';
const logOrderDiagnostic = (...args: Parameters<typeof console.log>) => {
  if (ORDER_DIAGNOSTICS_ENABLED) {
    console.log(...args.map(redactDiagnosticValue));
  }
};

const logPlaceOrderPayload = (payload: PlaceOrderPayload) => {
  logOrderDiagnostic('[TRADE-PAYLOAD]', {
    symbol: payload.symbol,
    side: payload.side,
    action: payload.side,
    orderType: 'market',
    command: payload.side,
    tradeType: 'market',
    volume: payload.volume,
    priceSource: payload.side === 'buy' ? 'ask' : 'bid',
    rawPayload: payload,
  });
};

const handlePlaceOrderSuccess = (
  queryClient: QueryClient,
  data: PlaceOrderResponse,
  variables: PlaceOrderPayload,
  owner: ActiveBrokerSessionOwnerStamp,
) => {
  if (!isActiveBrokerSessionOwnerStampCurrent(owner)) {
    throw new StaleBrokerSessionError();
  }
  const cacheNamespace = owner.cacheNamespace;
  logOrderDiagnostic('[TRADE-RESPONSE]', {
    requestSide: variables.side,
    result: data?.status ?? 'success',
    backendSide: data?.side ?? null,
    rawResponse: data,
  });
  // The API layer owns captured-owner coalesced reconciliation from before
  // POST until broker convergence. This success path only refreshes
  // query-backed summaries; it must not start a competing positions read.
  placeOrderCacheRefreshScheduler.schedule(
    queryClient,
    cacheNamespace,
    () => invalidateSessionQueryRoots(queryClient, cacheNamespace, [
      'accountSummary',
      'transactions',
    ]),
  );
};

type PlaceOrderExecutorOptions = {
  onSuccess?: (data: PlaceOrderResponse) => void;
  onError?: (error: unknown) => void;
  /** Always fires after transport settles, even when a broker epoch changed. */
  onSettled?: () => void;
};

const submitPlaceOrderWithCacheUpdate = async (
  queryClient: QueryClient,
  payload: PlaceOrderPayload,
  cacheNamespace: string,
  owner: ActiveBrokerSessionOwnerStamp,
) => {
  if (
    owner.cacheNamespace !== cacheNamespace ||
    !isActiveBrokerSessionOwnerStampCurrent(owner)
  ) {
    throw new StaleBrokerSessionError();
  }
  logPlaceOrderPayload(payload);
  // Market transport can causally refresh credentials before sending. The API
  // owns that strong response fence; adopt only the still-current owner for
  // the same immutable account/session after it returns.
  const data = await ordersApi.placeMarketOrder(payload);
  const settledOwner = captureActiveBrokerSessionOwnerStamp();
  if (
    !settledOwner ||
    settledOwner.cacheNamespace !== cacheNamespace ||
    !isActiveBrokerSessionOwnerStampCurrent(settledOwner)
  ) {
    throw new StaleBrokerSessionError();
  }
  handlePlaceOrderSuccess(
    queryClient,
    data,
    payload,
    settledOwner,
  );
  return Object.freeze({ data, owner: settledOwner });
};

// ─────────────────────────────────────────────────────────────────────────────
// TanStack Query mutation hook for placing market orders.
// On success, refreshes summary caches while the API-owned reconciliation
// publishes the authoritative positions ledger.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mutation to place a market order via POST /api/v2/orders.
 * Refreshes account summary caches on success. Positions are committed by the
 * API-owned, captured-session reconciliation worker.
 */
export const usePlaceOrderMutation = () => {
  const queryClient = useQueryClient();
  const session = useActiveBrokerQuerySession();
  const cacheNamespace = getSessionQueryCacheNamespace(session);

  return useMutation({
    mutationFn: (payload: PlaceOrderPayload) => {
      logPlaceOrderPayload(payload);
      // placeMarketOrder owns the mutation-specific strong response fence and
      // can adopt a causal preflight credential refresh for this same session.
      return ordersApi.placeMarketOrder(payload);
    },
    onMutate: () => {
      const owner = captureActiveBrokerSessionOwnerStamp();
      if (!owner || owner.cacheNamespace !== cacheNamespace) {
        throw new StaleBrokerSessionError();
      }
      return owner;
    },
    onSuccess: (data, variables, owner) => {
      // Shared success handling invalidates query-backed summaries. The API
      // call itself already owns captured-session position reconciliation.
      const settledOwner = captureActiveBrokerSessionOwnerStamp();
      if (!settledOwner || settledOwner.cacheNamespace !== owner.cacheNamespace) {
        return;
      }
      try {
        handlePlaceOrderSuccess(
          queryClient,
          data,
          variables,
          settledOwner,
        );
      } catch {
        // Stale session is ignored here; the mutation already completed on the broker.
      }
    },
  });
};

export const usePlaceOrderExecutor = () => {
  const queryClient = useQueryClient();
  const session = useActiveBrokerQuerySession();
  const cacheNamespace = getSessionQueryCacheNamespace(session);

  return useCallback((payload: PlaceOrderPayload, options: PlaceOrderExecutorOptions = {}) => {
    const callOnError = (error: unknown) => {
      try {
        options.onError?.(error);
      } catch {
        // Presentation callbacks must never alter mutation settlement.
      }
    };
    const callOnSettled = () => {
      try {
        options.onSettled?.();
      } catch {
        // Presentation callbacks must never create an unhandled rejection.
      }
    };
    const owner = captureActiveBrokerSessionOwnerStamp();
    if (!owner || owner.cacheNamespace !== cacheNamespace) {
      callOnError(new StaleBrokerSessionError());
      callOnSettled();
      return;
    }
    void submitPlaceOrderWithCacheUpdate(
      queryClient,
      payload,
      cacheNamespace,
      owner,
    )
      .then(({ data, owner: settledOwner }) => {
        const currentOwner = captureActiveBrokerSessionOwnerStamp();
        if (
          !currentOwner ||
          currentOwner.cacheNamespace !== settledOwner.cacheNamespace
        ) return;
        try {
          options.onSuccess?.(data);
        } catch {
          // A UI callback failure must not be reclassified as a broker error.
        }
      }, (error) => {
        const currentOwner = captureActiveBrokerSessionOwnerStamp();
        if (!currentOwner || currentOwner.cacheNamespace !== cacheNamespace) return;
        callOnError(error);
      })
      .finally(() => {
        callOnSettled();
      });
  }, [cacheNamespace, queryClient]);
};
