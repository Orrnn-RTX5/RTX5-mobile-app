/**
 * Core module: health.ts
 */

import { useQuery } from '@tanstack/react-query';
import { getHealth, HealthResponse } from '../api/health';
import {
  getSessionQueryCacheNamespace,
  runSessionBoundQuery,
  useActiveBrokerQuerySession,
} from './authenticatedQueryScope';

export const HEALTH_KEY = 'health';

export const getHealthQueryKey = (cacheNamespace: string) =>
  [HEALTH_KEY, cacheNamespace] as const;

/**
 * TanStack Query hook for gateway health check.
 * Polls every 30 seconds to monitor connectivity.
 */
export function useHealth(enabled = true) {
  const session = useActiveBrokerQuerySession();
  const cacheNamespace = getSessionQueryCacheNamespace(session);
  const isEnabled = enabled && Boolean(session);
  return useQuery<HealthResponse, Error>({
    queryKey: getHealthQueryKey(cacheNamespace),
    queryFn: () => runSessionBoundQuery(cacheNamespace, getHealth),
    enabled: isEnabled,
    staleTime: 15000,       // 15s before stale
    refetchInterval: isEnabled ? 30000 : false, // Poll every 30s
    retry: 1,               // Only 1 retry for health checks
  });
}
