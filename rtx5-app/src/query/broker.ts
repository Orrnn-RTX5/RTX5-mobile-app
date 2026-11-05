/**
 * Core module: broker.ts
 */

import { useQuery } from '@tanstack/react-query';
import {
  getBrokerConfig,
  getBrokerDirectory,
  BrokerConfigResponse,
  BrokerConfigError,
  BrokerDirectoryContractError,
  type BrokerDirectoryResult,
  type ValidatedBrokerServer,
} from '../api/broker';
import { appQueryClient } from '../state/providers/AppProviders';
import {
  getSessionQueryCacheNamespace,
  runSessionBoundQuery,
  useActiveBrokerQuerySession,
} from './authenticatedQueryScope';

// ═══════════════════════════════════════════════════════════════════════════════
// TanStack Query hook for GET /broker/config
//
// Fetches and caches broker configuration (branding, feature flags, leverage
// limits, supported currencies, etc.). The hook is enabled when a brokerId
// is provided OR the user is authenticated (Bearer token present).
//
// Caching strategy:
//   staleTime: 5 minutes — broker config rarely changes during a session
//   retry: smart — retries transient errors (500/503/network), skips client
//          errors (422/404) since those won't resolve on retry
// ═══════════════════════════════════════════════════════════════════════════════

export const BROKER_CONFIG_KEY = 'brokerConfig';
export const BROKER_SERVERS_KEY = 'brokerServers';
export const BROKER_DIRECTORY_QUERY_VERSION = 5;

const getBrokerDirectoryQueryKey = () => [
  BROKER_SERVERS_KEY,
  BROKER_DIRECTORY_QUERY_VERSION,
] as const;

export const getBrokerConfigQueryKey = (
  cacheNamespace: string,
  brokerId?: string,
) => [BROKER_CONFIG_KEY, cacheNamespace, brokerId] as const;

/**
 * Determines whether a failed broker config request should be retried.
 *
 * Retries on:
 *   - Network errors (statusCode === 0)
 *   - Server errors (500, 502, 503, 504)
 *   - Rate limiting (429) — may succeed after backoff
 *
 * Does NOT retry on:
 *   - Client errors (401, 403, 404, 422) — won't resolve without user action
 */
function shouldRetryBrokerConfig(failureCount: number, error: Error): boolean {
  if (failureCount >= 2) return false; // Max 2 retries

  if (error instanceof BrokerDirectoryContractError) {
    return false;
  }

  if (error instanceof BrokerConfigError) {
    const { statusCode } = error;
    // Don't retry client errors — they won't resolve on retry
    if (statusCode === 401 || statusCode === 403 || statusCode === 404 || statusCode === 422) {
      return false;
    }
    // Retry transient server/network errors
    return true;
  }

  // Retry unknown errors (could be transient)
  return true;
}

/**
 * TanStack Query hook for broker configuration.
 *
 * @param brokerId - Optional broker ID. If provided, fetches config for that
 *                   specific broker. If omitted, relies on Bearer token to
 *                   resolve the broker automatically.
 * @param enabled  - Optional override to control when the query fires.
 *                   Defaults to true when brokerId is truthy.
 */
export function useBrokerConfig(brokerId?: string, enabled?: boolean) {
  const session = useActiveBrokerQuerySession();
  const cacheNamespace = getSessionQueryCacheNamespace(session);
  return useQuery<BrokerConfigResponse, Error>({
    queryKey: getBrokerConfigQueryKey(cacheNamespace, brokerId),
    queryFn: () => runSessionBoundQuery(
      cacheNamespace,
      () => getBrokerConfig(brokerId),
    ),
    enabled: Boolean(session) && (enabled ?? !!brokerId),
    staleTime: 5 * 60 * 1000,  // 5 minutes — broker config changes rarely
    retry: shouldRetryBrokerConfig,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000), // Exponential backoff: 1s, 2s, 4s... capped at 10s
  });
}

/**
 * TanStack Query hook for the broker server directory.
 *
 * Powers the Brokers screen search field: the user types a broker name and
 * we filter this list client-side. The directory rarely changes, so we cache
 * it for 5 minutes and re-use the same response across mounts.
 */
export function useBrokerDirectory(enabled: boolean = true) {
  return useQuery<BrokerDirectoryResult, Error>({
    queryKey: getBrokerDirectoryQueryKey(),
    queryFn: () => getBrokerDirectory(),
    enabled,
    staleTime: 5 * 60 * 1000,
    // Retry transient network blips so a single bad packet doesn't strand the
    // user on the "Failed to load brokers" screen.
    retry: shouldRetryBrokerConfig,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });
}

// QueryObserver reuses the selected array while both data and selector stay
// unchanged. An inline selector rebuilt it on every credential/search render.
const selectBrokerServers = (directory: BrokerDirectoryResult): ValidatedBrokerServer[] =>
  [...directory.selectableServers];

/** Backwards-compatible view containing every validated selectable server. */
export function useBrokerServers(enabled: boolean = true) {
  return useQuery<BrokerDirectoryResult, Error, ValidatedBrokerServer[]>({
    queryKey: getBrokerDirectoryQueryKey(),
    queryFn: () => getBrokerDirectory(),
    select: selectBrokerServers,
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: shouldRetryBrokerConfig,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });
}

/** Starts the public broker directory request before the user taps Accounts +. */
export function prefetchBrokerServers() {
  return appQueryClient.prefetchQuery<BrokerDirectoryResult, Error>({
    queryKey: getBrokerDirectoryQueryKey(),
    queryFn: () => getBrokerDirectory(),
    staleTime: 5 * 60 * 1000,
    retry: shouldRetryBrokerConfig,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });
}

