/**
 * Core module: accounts.ts
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAccountById, TradingAccount, AccountsApiError } from '../api/accounts';
import {
  getSessionQueryCacheNamespace,
  runSessionBoundQuery,
  useActiveBrokerQuerySession,
} from './authenticatedQueryScope';

// ═══════════════════════════════════════════════════════════════════════════════
// TanStack Query hooks for Accounts API
//
//   useAccountDetails(login)   — GET /account/{login} (the session account)
//
// There is no list hook: `GET /accounts` returns 403 for traders (contract v3)
// and the user's account is the session `account_login`.
//
// Caching strategy:
//   Detail: staleTime 15s, polls every 30s — used for the active view
//   retry:  smart — retries transient errors (500/503/network), skips client
//           errors (401/403/404/422) since those won't resolve on retry
//   Server metrics missing from a response keep the last cached value and are
//   listed in `staleMetrics`.
// ═══════════════════════════════════════════════════════════════════════════════

export const ACCOUNT_DETAIL_KEY = 'accountDetail';

export const getAccountDetailQueryKey = (
  cacheNamespace: string,
  login?: number,
) => [ACCOUNT_DETAIL_KEY, cacheNamespace, login] as const;

/**
 * Determines whether a failed accounts request should be retried.
 *
 * Retries on:
 *   - Network errors (statusCode === 0)
 *   - Server errors (500, 502, 503, 504)
 *   - Rate limiting (429) — may succeed after backoff
 *
 * Does NOT retry on:
 *   - Client errors (401, 403, 404, 422) — won't resolve without user action
 */
function shouldRetryAccounts(failureCount: number, error: Error): boolean {
  if (failureCount >= 2) return false; // Max 2 retries

  if (error instanceof AccountsApiError) {
    const { statusCode } = error;
    // Don't retry client errors — they won't resolve on retry
    if (statusCode === 401 || statusCode === 403 || statusCode === 404 || statusCode === 422) {
      return false;
    }
    return true;
  }

  return true;
}

/**
 * TanStack Query hook for a single account's details.
 *
 * GET /account/{login} — returns detailed account information for a
 * specific login number. Requires Bearer token.
 *
 * @param login   - The account login number (e.g. 200074).
 *                  Query is disabled if login is undefined or 0.
 * @param enabled - Optional override to control when the query fires.
 */
export function useAccountDetails(login?: number, enabled?: boolean) {
  const queryClient = useQueryClient();
  const session = useActiveBrokerQuerySession();
  const cacheNamespace = getSessionQueryCacheNamespace(session);
  const isEnabled = Boolean(session) && (enabled ?? true) && !!login;
  const queryKey = getAccountDetailQueryKey(cacheNamespace, login);
  return useQuery<TradingAccount, Error>({
    queryKey,
    queryFn: () => runSessionBoundQuery(
      cacheNamespace,
      () => getAccountById(login!, queryClient.getQueryData<TradingAccount>(queryKey)),
    ),
    enabled: isEnabled,
    staleTime: 15 * 1000,        // 15 seconds — tighter for active account view
    refetchInterval: isEnabled ? 30 * 1000 : false,  // Poll every 30 seconds for near-real-time data
    retry: shouldRetryAccounts,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });
}
