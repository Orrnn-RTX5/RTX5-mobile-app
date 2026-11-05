import { getChartDealsRefreshFrom, mergeChartDealHistory } from './chartDealRefresh';
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

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dealsApi, fetchAccountDealHistory, InvalidDealsResponseError, type Deal, type DealHistoryResult } from '../api/deals';
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
): Promise<DealHistoryResult> => {
  try {
    const result = await fetchAccountDealHistory({ from, to });
    return { ...result, deals: filterDealsByTimeRange(result.deals, from, to) };
  } catch (accountError) {
    // Corrupt successful responses must not be disguised by a limited fallback.
    if (login == null || accountError instanceof InvalidDealsResponseError) throw accountError;
    try {
      return {
        deals: filterDealsByTimeRange(await getLoginDealsWithRangeFallback(login, from, to), from, to),
        complete: false, reason: 'legacy-fallback', fullFetchedAt: Date.now(),
      };
    } catch { throw accountError; }
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
  // Deal ranges use an exclusive upper bound; include the entire final day.
  const to = toMs != null ? Math.ceil((toMs + 1) / 1000) : undefined;

  const enabled = Boolean(session) && (options.enabled ?? true);

  const query = useQuery({
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
  return { ...query, data: query.data?.deals, historyComplete: query.data?.complete, historyIncompleteReason: query.data?.reason };
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
  const queryClient = useQueryClient();
  const session = useActiveBrokerQuerySession();
  const cacheNamespace = getSessionQueryCacheNamespace(session);
  const enabled = Boolean(session) && (options.enabled ?? true);

  const queryKey = getChartDealsQueryKey(cacheNamespace, login);
  const query = useQuery({
    queryKey,
    queryFn: () => runSessionBoundQuery(
      cacheNamespace,
      async () => {
        const previous = queryClient.getQueryData<DealHistoryResult>(queryKey);
        // Periodic full reconciliation covers backdated or corrected executions.
        const from = getChartDealsRefreshFrom(previous);
        if (from === undefined || !previous) {
          return fetchAccountDealsWithLoginFallback(login);
        }
        const incoming = await fetchAccountDealsWithLoginFallback(login, from);
        return mergeChartDealHistory(previous, incoming);
      },
    ),
    enabled,
    refetchInterval: resolvePollingRefetchInterval(enabled, 30_000, options.refetchInterval),
    refetchIntervalInBackground: false,
    refetchOnMount: options.refetchOnMount,
    staleTime: options.staleTime ?? 30_000,
    subscribed: options.subscribed,
  });
  return { ...query, data: query.data?.deals, historyComplete: query.data?.complete, historyIncompleteReason: query.data?.reason };
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
  const query = useQuery({
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
  return { ...query, data: query.data?.deals, historyComplete: query.data?.complete, historyIncompleteReason: query.data?.reason };
}
