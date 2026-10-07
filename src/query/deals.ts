/**
 * Core module: deals.ts
 *
 * Contains:
 *  - useAccountDealsQuery  — deal history via GET /api/v2/account/deals
 *                            (JWT-resolved account, from/to date range)
 *  - useDealsQuery         — same source for a known login (Journal)
 *
 * Contract v3 (6.4): /account/deals is the PRIMARY source; it supports
 * limit=1000 + offset paging and every page is walked. /deals/{login} ignores
 * paging, caps at 500 rows and has no position_ticket, so it is used only as
 * a fallback when /account/deals fails. The two sources are no longer merged.
 */

import { useQuery } from '@tanstack/react-query';
import { dealsApi, fetchAllAccountDeals, type Deal } from '../api/deals';
import { resolveEffectiveHistoryDateRange } from '../features/history/historyDateRange';
import { useResolvedTradingLogin } from '../state/tradingLogin';
import { useUserPreferences } from '../state/userPreferences';
import {
  buildAccountDealsQueryKey,
  filterDealsByTimeRange,
  shouldRetryDealsWithoutRange,
} from './dealsHistory';
import {
  getSessionQueryCacheNamespace,
  runSessionBoundQuery,
  useActiveBrokerQuerySession,
} from './authenticatedQueryScope';

export const DEALS_KEY = 'deals';
export const ACCOUNT_DEALS_KEY = 'accountDeals';

/**
 * Chart history must not inherit the History screen's date filter. Keeping the
 * accountDeals root also means the existing realtime invalidation refreshes it.
 */
export const getChartDealsQueryKey = (
  cacheNamespace: string,
  login?: number,
) => [ACCOUNT_DEALS_KEY, cacheNamespace, login ?? 'session', 'chart-unfiltered'] as const;

export const getDealsQueryKey = (
  cacheNamespace: string,
  login?: number,
  from?: number,
  to?: number,
) => from === undefined && to === undefined
  ? [DEALS_KEY, cacheNamespace, login] as const
  : [DEALS_KEY, cacheNamespace, login, from ?? null, to ?? null] as const;

type PollingQueryOptions = {
  enabled?: boolean;
  refetchInterval?: number | false;
  refetchOnMount?: boolean | 'always';
  staleTime?: number;
  subscribed?: boolean;
  from?: number;
  to?: number;
  login?: number;
};

type ChartDealsQueryOptions = Omit<PollingQueryOptions, 'from' | 'to' | 'login'>;

const resolvePollingRefetchInterval = (
  enabled: boolean,
  fallbackMs: number,
  override?: number | false,
) => (enabled ? (override ?? fallbackMs) : false);

const getLoginDealsWithRangeFallback = async (
  login: number,
  from?: number,
  to?: number,
) => {
  try {
    return await dealsApi.getDeals(login, 1000, 0, from, to);
  } catch (error) {
    if (from == null && to == null) throw error;
    if (!shouldRetryDealsWithoutRange(error)) throw error;
    return filterDealsByTimeRange(
      await dealsApi.getDeals(login, 1000, 0),
      from,
      to,
    );
  }
};

const fetchAccountDealsWithLoginFallback = async (
  login: number | undefined,
  from?: number,
  to?: number,
) => {
  try {
    return filterDealsByTimeRange(
      await fetchAllAccountDeals({ from, to }),
      from,
      to,
    );
  } catch (accountError) {
    // Fallback only: /deals/{login} (max 500 rows, no position_ticket).
    if (login == null) throw accountError;
    try {
      return filterDealsByTimeRange(
        await getLoginDealsWithRangeFallback(login, from, to),
        from,
        to,
      );
    } catch {
      throw accountError;
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// TanStack Query hook for account deal history (JWT-resolved, date-range aware).
// Used by the History screen's "Deals" tab — respects the date range the user
// selected in HistoryFilterScreen (stored as historyFromMs / historyToMs).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch deal history for the authenticated user's account.
 * Reads `historyFromMs` / `historyToMs` from user preferences and converts them
 * to Unix second timestamps for the `from` / `to` query parameters.
 *
 * Polls every 10 seconds (deals change less often than live positions).
 */
export function useAccountDealsQuery(options: PollingQueryOptions = {}) {
  const session = useActiveBrokerQuerySession();
  const cacheNamespace = getSessionQueryCacheNamespace(session);
  const resolvedLogin = useResolvedTradingLogin();
  const login = options.login ?? resolvedLogin;
  const historyRange = useUserPreferences((s) => s.historyRange);
  const historyFromMs = useUserPreferences((s) => s.historyFromMs);
  const historyToMs = useUserPreferences((s) => s.historyToMs);
  const { fromMs, toMs } = resolveEffectiveHistoryDateRange(historyRange, historyFromMs, historyToMs);

  // Convert ms to Unix seconds for the API (null means omit the param)
  const from = fromMs != null ? Math.floor(fromMs / 1000) : undefined;
  const to = toMs != null ? Math.floor(toMs / 1000) : undefined;

  const enabled = Boolean(session) && (options.enabled ?? true);

  return useQuery({
    queryKey: buildAccountDealsQueryKey(cacheNamespace, login, from, to),
    queryFn: () => runSessionBoundQuery(
      cacheNamespace,
      () => fetchAccountDealsWithLoginFallback(login, from, to),
    ),
    enabled,
    refetchInterval: resolvePollingRefetchInterval(enabled, 10_000, options.refetchInterval),
    refetchOnMount: options.refetchOnMount,
    staleTime: options.staleTime,
    subscribed: options.subscribed,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TanStack Query hook for login-based deal history.
// Kept for cases where the MT5 login is known but no JWT-based account is set
// (e.g. admin viewing another account's deals).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load all available executions for chart entry/exit markers from the paged
 * /account/deals source (login endpoint only as a fallback). This
 * deliberately has no from/to options and never reads the History date filter.
 */
export function useChartDealsQuery(
  login: number | undefined,
  options: ChartDealsQueryOptions = {},
) {
  const session = useActiveBrokerQuerySession();
  const cacheNamespace = getSessionQueryCacheNamespace(session);
  const enabled = Boolean(session) && (options.enabled ?? true);

  return useQuery({
    queryKey: getChartDealsQueryKey(cacheNamespace, login),
    queryFn: () => runSessionBoundQuery(
      cacheNamespace,
      () => fetchAccountDealsWithLoginFallback(login),
    ),
    enabled,
    refetchInterval: resolvePollingRefetchInterval(enabled, 5_000, options.refetchInterval),
    refetchOnMount: options.refetchOnMount,
    staleTime: options.staleTime,
    subscribed: options.subscribed,
  });
}

/**
 * Fetch deal history for a specific MT5 account login.
 *
 * @param login - MT5 account login number (pass undefined to disable the query)
 */
export function useDealsQuery(
  login: number | undefined,
  options: PollingQueryOptions = {},
) {
  const session = useActiveBrokerQuerySession();
  const cacheNamespace = getSessionQueryCacheNamespace(session);
  const enabled = Boolean(session) && !!login && (options.enabled ?? true);
  const from = options.from;
  const to = options.to;
  return useQuery({
    queryKey: getDealsQueryKey(cacheNamespace, login, from, to),
    queryFn: () => runSessionBoundQuery(
      cacheNamespace,
      () => fetchAccountDealsWithLoginFallback(login, from, to),
    ),
    enabled,
    refetchInterval: resolvePollingRefetchInterval(enabled, 5000, options.refetchInterval),
    refetchOnMount: options.refetchOnMount,
    staleTime: options.staleTime,
    subscribed: options.subscribed,
  });
}
