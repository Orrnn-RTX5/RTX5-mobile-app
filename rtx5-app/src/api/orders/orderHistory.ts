/**
 * Order history (backend contract v3, 6.4).
 *
 * Gateway history uses `GET /orders/history/{login}?from=...&to=...`.
 * The paginated legacy account-orders reader remains available separately.
 * Kept free of React Native imports so it is unit-testable in Node.
 */
import { apiClient } from '../apiClient';
import type { LoginOrder } from './types';
import { normalizeTradeSide } from '../../domain/tradeSide';
import { createTradingApiError } from '../tradingErrors';

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
  const timeSetup = firstDefined(record, ['time_setup', 'created_at', 'time_create', 'time']);
  const timeDone = firstDefined({ ...record, time_done: Number(record.time_done) > 0 ? record.time_done : undefined }, ['time_done', 'filled_at', 'cancelled_at', 'expired_at', 'updated_at', 'time_close', 'time_update']);
  const seconds = (value: unknown): number => typeof value === 'string' && !/^\d+(\.\d+)?$/.test(value)
    ? Math.floor(Date.parse(value) / 1000) : Number(value);
  normalized.ticket = Number(record.ticket ?? record.order_ticket ?? record.id);
  normalized.volume = Number(record.volume ?? record.requested_volume ?? 0);
  normalized.side = normalizeTradeSide(record.side) ?? (String(record.type).toLowerCase().startsWith('sell') ? 'sell' : 'buy');
  normalized.status = String(record.status ?? '').toLowerCase().replace(/^canceled$/, 'cancelled');
  normalized.price_sl = record.price_sl ?? record.sl;
  normalized.price_tp = record.price_tp ?? record.tp;
  normalized.price_limit = record.price_limit ?? record.price_stop_limit ?? record.stop_limit_price;
  if (priceOpen !== undefined) normalized.price_open = Number(priceOpen);
  if (timeSetup !== undefined) normalized.time_setup = seconds(timeSetup);
  if (timeDone !== undefined) normalized.time_done = seconds(timeDone);
  return normalized as unknown as LoginOrder;
};

/** Gateway pending-order history, always addressed to the selected account. */
export async function fetchPendingOrderHistory(
  login: number, range: { from?: number; to?: number } = {},
): Promise<LoginOrder[]> {
  if (!Number.isSafeInteger(login) || login <= 0) throw new Error('Invalid order-history account login.');
  const from = Math.floor(range.from ?? 0);
  const to = Math.floor(range.to ?? Date.now() / 1000);
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < from || to >= 1e11) {
    throw new Error('Order-history dates must be Unix seconds in ascending order.');
  }
  const response = await apiClient(`/orders/history/${login}?from=${from}&to=${to}`);
  if (!response.ok) throw createTradingApiError(response.status, await response.json().catch(() => ({})));
  const json = await response.json();
  const rows = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : null;
  if (!rows) throw createTradingApiError(502, { message: 'Order history must be an array.' });
  return rows.map((row: UnknownRecord) => {
    if (row.account_login != null && Number(row.account_login) !== login) {
      throw createTradingApiError(502, { message: 'Order history returned a row for another account.' });
    }
    return normalizeOrderHistoryRow({ ...row, account_login: login });
  });
}

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
