/**
 * Core module: equityHistory.ts
 *
 * GET /account/{login}/equity?from&to (contract v3) for the session account.
 */

import { useQuery } from '@tanstack/react-query';
import {
  DEFAULT_EQUITY_HISTORY_PERIOD,
  getEquityHistory,
  type EquityDataPoint,
} from '../api/equityHistory';
import {
  getSessionQueryCacheNamespace,
  runSessionBoundQuery,
  useActiveBrokerQuerySession,
} from './authenticatedQueryScope';

export const EQUITY_HISTORY_KEY = 'equityHistory';

export const getEquityHistoryQueryKey = (
  cacheNamespace: string,
  period: string,
) => [EQUITY_HISTORY_KEY, cacheNamespace, period] as const;

/**
 * TanStack Query hook for fetching equity curve data.
 *
 * @param period - '1d' (default, server default of 24 h) | '7d' | '30d' | '90d' | '1y'
 */
export function useEquityHistory(period: string = DEFAULT_EQUITY_HISTORY_PERIOD) {
  const session = useActiveBrokerQuerySession();
  const cacheNamespace = getSessionQueryCacheNamespace(session);
  const login = session?.accountLogin;
  const enabled = Boolean(session) && Boolean(login);
  return useQuery<EquityDataPoint[], Error>({
    queryKey: getEquityHistoryQueryKey(cacheNamespace, period),
    queryFn: () => runSessionBoundQuery(
      cacheNamespace,
      () => getEquityHistory(login!, period),
    ),
    enabled,
    staleTime: 60000,       // 1 minute before stale
    refetchInterval: enabled ? 60000 : false, // Re-poll every 60s
  });
}
