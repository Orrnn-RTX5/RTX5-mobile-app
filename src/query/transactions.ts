/**
 * Core module: transactions.ts
 *
 * GET /accounts/{login}/history (contract v3) for the session account.
 */

import { useQuery } from '@tanstack/react-query';
import {
  DEFAULT_TRANSACTIONS_LIMIT,
  getTransactions,
  type TransactionsPage,
} from '../api/transactions';
import {
  getSessionQueryCacheNamespace,
  runSessionBoundQuery,
  useActiveBrokerQuerySession,
} from './authenticatedQueryScope';

export const TRANSACTIONS_KEY = 'transactions';

export type TransactionsFilter = Readonly<{
  type?: string;
  page?: number;
  limit?: number;
  /** Unix seconds. */
  from?: number;
  /** Unix seconds. */
  to?: number;
}>;

export const getTransactionsQueryKey = (
  cacheNamespace: string,
  type: string | undefined,
  limit: number,
  page: number = 1,
  from?: number,
  to?: number,
) => [TRANSACTIONS_KEY, cacheNamespace, type, limit, page, from, to] as const;

/**
 * TanStack Query hook for the session account's balance transactions.
 */
export function useTransactions(filter: TransactionsFilter = {}) {
  const session = useActiveBrokerQuerySession();
  const cacheNamespace = getSessionQueryCacheNamespace(session);
  const login = session?.accountLogin;
  const enabled = Boolean(session) && Boolean(login);
  const type = filter.type;
  const limit = filter.limit ?? DEFAULT_TRANSACTIONS_LIMIT;
  const page = filter.page ?? 1;
  return useQuery<TransactionsPage, Error>({
    queryKey: getTransactionsQueryKey(cacheNamespace, type, limit, page, filter.from, filter.to),
    queryFn: () => runSessionBoundQuery(
      cacheNamespace,
      () => getTransactions({ login: login!, type, limit, page, from: filter.from, to: filter.to }),
    ),
    enabled,
    staleTime: 10000,     // 10 seconds before stale
    refetchInterval: enabled ? 30000 : false, // Re-poll every 30s for live updates
  });
}
