/**
 * TanStack Query hook for the market status API.
 *
 * Hook:
 *  useMarketStatus(symbol) — GET /api/v2/market/status/{symbol}
 *                             Polls every 30s to track session changes.
 */

import { useQuery } from '@tanstack/react-query';
import { fetchMarketStatus } from '../api/marketStatus';
import { useUserPreferences } from '../state/userPreferences';
import {
  getSessionQueryCacheNamespace,
  runSessionBoundQuery,
  useActiveBrokerQuerySession,
} from './authenticatedQueryScope';

export const MARKET_STATUS_KEY = 'market-status';

export const getMarketStatusQueryKey = (
  cacheNamespace: string,
  symbol: string,
) => [MARKET_STATUS_KEY, cacheNamespace, symbol] as const;

export function useMarketStatus(
  symbol: string,
  enabled = true,
  pollingEnabled = enabled,
) {
  const session = useActiveBrokerQuerySession();
  const cacheNamespace = getSessionQueryCacheNamespace(session);
  const isLoggedIn = useUserPreferences((state) => state.isLoggedIn);
  const isEnabled = enabled && isLoggedIn && Boolean(session) && !!symbol;
  const isPollingEnabled = isEnabled && pollingEnabled;

  return useQuery({
    queryKey: getMarketStatusQueryKey(cacheNamespace, symbol),
    queryFn: () => runSessionBoundQuery(
      cacheNamespace,
      () => fetchMarketStatus(symbol),
    ),
    enabled: isEnabled,
    refetchInterval: isPollingEnabled ? 30_000 : false,
    refetchOnWindowFocus: isPollingEnabled,
    refetchOnReconnect: isPollingEnabled,
    retry: 1,
  });
}
