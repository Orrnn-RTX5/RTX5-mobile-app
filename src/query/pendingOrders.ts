import { useQuery } from '@tanstack/react-query';
import { listPendingOrders } from '../api/orders/pendingOrders';
import { EMPTY_PENDING_ORDERS, usePendingOrdersState } from '../state/pendingOrdersState';
import { getSessionQueryCacheNamespace, runSessionBoundQuery, useActiveBrokerQuerySession } from './authenticatedQueryScope';

export const PENDING_ORDERS_QUERY_KEY = 'pendingOrders';
export function usePendingOrdersQuery(enabled = true) {
  const session = useActiveBrokerQuerySession();
  const namespace = getSessionQueryCacheNamespace(session);
  const query = useQuery({
    queryKey: [PENDING_ORDERS_QUERY_KEY, namespace],
    queryFn: () => runSessionBoundQuery(namespace, listPendingOrders),
    enabled: Boolean(session) && enabled,
    refetchInterval: enabled && session ? 10_000 : false,
    retry: 1,
  });
  const orders = usePendingOrdersState(state => state.cacheNamespace === namespace ? state.orders : EMPTY_PENDING_ORDERS);
  return { ...query, data: orders };
}
