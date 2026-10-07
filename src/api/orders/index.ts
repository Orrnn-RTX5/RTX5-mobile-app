/**
 * Market Order Execution API (V2).
 *
 * Covers:
 *  GET  /api/v2/account/orders       — order history via JWT, limit=1000&offset paging (preferred)
 *  GET  /api/v2/orders/{login}       — order history by login (fallback; no paging, max 500)
 *  POST /api/v2/orders               — place a new market order
 *
 * Originally a single 547-line file; split for the 500-line ceiling into:
 *   - `types.ts`            — request/response shapes
 *   - `symbolResolver.ts`   — instrument-catalog symbol matching
 *   - `placeMarketOrder.ts` — POST /orders body
 *   - `placePendingOrder.ts` — POST /orders/pending body
 */
import { apiClient } from '../apiClient';
import { placeMarketOrder } from './placeMarketOrder';
import { placePendingOrder } from './placePendingOrder';
import {
  cancelPendingOrder,
  listPendingOrders,
  modifyPendingOrder,
} from './pendingOrders';
import type { AccountOrder, LoginOrder } from './types';
import {
  ACCOUNT_ORDERS_PAGE_SIZE,
  fetchAccountOrdersPage,
  fetchAllAccountOrders,
  normalizeOrderHistoryRow,
} from './orderHistory';

export {
  ACCOUNT_ORDERS_MAX_PAGES,
  ACCOUNT_ORDERS_PAGE_SIZE,
  fetchAllAccountOrders,
  normalizeOrderHistoryRow,
} from './orderHistory';
export type { AccountOrdersPageFetcher } from './orderHistory';

export type {
  AccountOrder,
  LoginOrder,
  OrderErrorResponse,
  PendingOrderType,
  PlacePendingOrderPayload,
  PlacePendingOrderResponse,
  PlaceOrderPayload,
  PlaceOrderResponse,
} from './types';
export type {
  ModifyPendingOrderInput,
  PendingOrderMutationOptions,
  PendingOrderReadModel,
  PendingOrderReconciliationResult,
} from './pendingOrders';
export {
  buildModifyPendingOrderRequestBody,
  normalizePendingOrderDto,
} from './pendingOrders';

export const ordersApi = {
  /**
   * Fetch order history for a specific MT5 account login.
   *
   * GET /api/v2/orders/{login}?limit={limit}
   *
   * Only returns orders for accounts owned by the authenticated user —
   * the server returns 404 if the login belongs to another user.
   *
   * NOTE: Real field names differ from Swagger — use `LoginOrder` (not `AccountOrder`).
   */
  getOrdersByLogin: async (login: number, limit = 500): Promise<LoginOrder[]> => {
    const response = await apiClient(`/orders/${login}?limit=${limit}`);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw { response: { data: errorData, status: response.status } };
    }
    const json = await response.json();
    if (Array.isArray(json)) return json;
    if (Array.isArray(json?.data)) return json.data;
    return [];
  },

  /**
   * Fetch order history for the authenticated user's trading account.
   *
   * GET /api/v2/account/orders?limit={limit}&offset={offset}
   *
   * The account is resolved from the session JWT — no `login` parameter needed.
   */
  getAccountOrders: async (
    limit = ACCOUNT_ORDERS_PAGE_SIZE,
    offset = 0,
  ): Promise<AccountOrder[]> => fetchAccountOrdersPage(limit, offset) as Promise<AccountOrder[]>,

  /**
   * Order history for the History/Chart screens (contract 6.4): paged
   * /account/orders is preferred; /orders/{login} (no paging, max 500 rows)
   * is used only if the account endpoint fails.
   */
  getOrderHistory: async (login: number): Promise<LoginOrder[]> => {
    try {
      return await fetchAllAccountOrders();
    } catch (accountError) {
      try {
        const rows = await ordersApi.getOrdersByLogin(login);
        return rows.map(normalizeOrderHistoryRow);
      } catch {
        throw accountError;
      }
    }
  },

  placeMarketOrder,
  placePendingOrder,
  listPendingOrders,
  modifyPendingOrder,
  cancelPendingOrder,
};
