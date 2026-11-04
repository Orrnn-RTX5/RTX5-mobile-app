/**
 * Order history (backend contract v3, 6.4).
 *
 * `GET /account/orders?limit=1000&offset=N` pages correctly and is the
 * preferred source; `GET /orders/{login}` takes no parameters and caps at
 * 500 rows, so it is only a fallback (see ordersApi.getOrderHistory).
 * Kept free of React Native imports so it is unit-testable in Node.
 */
import { apiClient } from '../apiClient';
import type { LoginOrder } from './types';

/** Contract 6.4: /account/orders pages with limit=1000&offset=N. */
export const ACCOUNT_ORDERS_PAGE_SIZE = 1000;
export const ACCOUNT_ORDERS_MAX_PAGES = 50;

type UnknownRecord = Record<string, unknown>;

const firstDefined = (record: UnknownRecord, keys: readonly string[]): unknown => {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
};

/**
 * Normalises an /account/orders row (`price`, `time_create`) into the
 * LoginOrder read model (`price_open`, `time_setup`, `time_done`) that the
 * History and Chart screens already render. Existing LoginOrder keys win.
 */
export const normalizeOrderHistoryRow = (value: unknown): LoginOrder => {
  const record = (value && typeof value === 'object' ? value : {}) as UnknownRecord;
  const normalized: UnknownRecord = { ...record };
  const priceOpen = firstDefined(record, ['price_open', 'price']);
  const timeSetup = firstDefined(record, ['time_setup', 'time_create', 'time']);
  const timeDone = firstDefined(record, ['time_done', 'time_close', 'time_update']);
  if (priceOpen !== undefined) normalized.price_open = Number(priceOpen);
  if (timeSetup !== undefined) normalized.time_setup = Number(timeSetup);
  if (timeDone !== undefined) normalized.time_done = Number(timeDone);
  return normalized as unknown as LoginOrder;
};

/** GET /account/orders?limit={limit}&offset={offset} (account from the JWT). */
export const fetchAccountOrdersPage = async (
  limit: number = ACCOUNT_ORDERS_PAGE_SIZE,
  offset = 0,
): Promise<unknown[]> => {
  const response = await apiClient(`/account/orders?limit=${limit}&offset=${offset}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw { response: { data: errorData, status: response.status } };
  }
  const json = await response.json();
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data)) return json.data;
  return [];
};

export type AccountOrdersPageFetcher = (limit: number, offset: number) => Promise<unknown[]>;

/** Walks /account/orders pages until a short, empty, or repeated page. */
export const fetchAllAccountOrders = async (
  options: Readonly<{ maxPages?: number; fetchPage?: AccountOrdersPageFetcher }> = {},
): Promise<LoginOrder[]> => {
  const fetchPage: AccountOrdersPageFetcher =
    options.fetchPage ?? fetchAccountOrdersPage;
  const maxPages = Math.max(1, Math.floor(options.maxPages ?? ACCOUNT_ORDERS_MAX_PAGES));
  const orders: LoginOrder[] = [];
  const seen = new Set<string>();
  let offset = 0;
  for (let page = 0; page < maxPages; page += 1) {
    const rows = await fetchPage(ACCOUNT_ORDERS_PAGE_SIZE, offset);
    if (rows.length === 0) break;
    const signature = JSON.stringify(rows.map((row) => (row as UnknownRecord)?.ticket ?? null));
    if (seen.has(signature)) break;
    seen.add(signature);
    orders.push(...rows.map(normalizeOrderHistoryRow));
    if (rows.length < ACCOUNT_ORDERS_PAGE_SIZE) break;
    offset += rows.length;
  }
  return orders;
};
