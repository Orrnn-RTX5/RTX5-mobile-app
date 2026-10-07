/**
 * Deal Execution History API (V2)
 * 
 * Retrieves individual atomic execution records (entries and exits)
 * that make up trading positions. Maps backend DTOs to UI models.
 */

import { apiClient } from './apiClient';

// ─────────────────────────────────────────────────────────────────────────────
// Trading API — Deals
// Endpoint: GET /api/v2/deals/{login}
// Retrieves deal history for a trading account. Deals are individual
// executions (entries and exits) that make up positions and orders.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Raw deal object returned by GET /api/v2/deals/{login}.
 * Each deal represents a single execution event (market entry or exit).
 */
export interface Deal {
  ticket: number;
  order_ticket: number;
  /**
   * Not sent by the v3 gateway on either deals endpoint (contract 6.4). Kept
   * optional-at-runtime for older builds; derived history falls back to
   * per-symbol FIFO pairing when it is missing.
   */
  position_ticket: number;
  account_login: number;
  symbol: string;
  /** Deal action type — "deal_buy" or "deal_sell" */
  action: string;
  /** Deal entry direction — "entry_in" (open) or "entry_out" (close) */
  entry: string;
  volume: number;
  price: number;
  profit: number;
  swap: number;
  commission: number;
  fee: number;
  magic: number;
  comment: string;
  /** Unix timestamp of deal execution */
  time: number;
}

const readDealsPayload = (json: unknown, depth = 0): Deal[] => {
  if (Array.isArray(json)) return json as Deal[];
  if (!json || typeof json !== 'object') return [];

  const payload = json as Record<string, unknown>;
  const keys = ['data', 'deals', 'items', 'records', 'rows', 'result', 'history'];

  for (const key of keys) {
    const value = payload[key];
    const deals = depth < 2 ? readDealsPayload(value, depth + 1) : [];
    if (Array.isArray(value) || deals.length > 0) return deals;
  }

  return [];
};

/** Contract 6.4: /account/deals returns at most 1000 rows per page. */
export const ACCOUNT_DEALS_PAGE_SIZE = 1000;
/** Safety cap for one full-history walk (50k deals). */
export const ACCOUNT_DEALS_MAX_PAGES = 50;

export type AccountDealsPageFetcher = (
  limit: number,
  offset: number,
  from?: number,
  to?: number,
) => Promise<Deal[]>;

const dealPageSignature = (deals: Deal[]): string =>
  deals
    .map((deal) => [deal.ticket, deal.time, deal.entry, deal.volume].join(':'))
    .join('|');

/**
 * Walks GET /account/deals with offset paging (limit=1000) until a short or
 * empty page. A repeated page (a server that ignores offset) stops the walk.
 */
export const fetchAllAccountDeals = async (
  options: Readonly<{
    from?: number;
    to?: number;
    maxPages?: number;
    fetchPage?: AccountDealsPageFetcher;
  }> = {},
): Promise<Deal[]> => {
  const fetchPage = options.fetchPage ?? dealsApi.getAccountDeals;
  const maxPages = Math.max(1, Math.floor(options.maxPages ?? ACCOUNT_DEALS_MAX_PAGES));
  const deals: Deal[] = [];
  const seenSignatures = new Set<string>();
  let offset = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const rows = await fetchPage(ACCOUNT_DEALS_PAGE_SIZE, offset, options.from, options.to);
    if (rows.length === 0) break;
    const signature = dealPageSignature(rows);
    if (seenSignatures.has(signature)) break;
    seenSignatures.add(signature);
    deals.push(...rows);
    if (rows.length < ACCOUNT_DEALS_PAGE_SIZE) break;
    offset += rows.length;
  }

  return deals;
};

// ─────────────────────────────────────────────────────────────────────────────
// Trading API — Account Deals (JWT-resolved, date-range aware)
// Endpoint: GET /api/v2/account/deals
// Like /deals/{login} but the account is resolved from the Bearer token — no
// login parameter needed. Supports optional from/to Unix timestamp filtering
// so the History screen can honour the date range the user selected.
// ─────────────────────────────────────────────────────────────────────────────

export const dealsApi = {
  /**
   * Fetch deal history for the authenticated user's trading account.
   *
   * GET /api/v2/account/deals?limit={limit}&offset={offset}[&from={from}&to={to}]
   *
   * Account is resolved server-side from the session JWT — no login param needed.
   * Optionally pass `from` and `to` as Unix timestamps (seconds) to restrict the
   * result to a specific date window (e.g. Last 6 months, custom calendar range).
   *
   * PRIMARY deals source (contract 6.4): offset paging works, max 1000 rows.
   * Use fetchAllAccountDeals() to walk every page.
   *
   * @param limit  - Max records to return (default and max: 1000)
   * @param offset - Pagination offset (default: 0)
   * @param from   - Range start as Unix seconds (optional)
   * @param to     - Range end as Unix seconds (optional, defaults to now on server)
   */
  getAccountDeals: async (
    limit = ACCOUNT_DEALS_PAGE_SIZE,
    offset = 0,
    from?: number,
    to?: number,
  ): Promise<Deal[]> => {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    if (from != null) params.set('from', String(from));
    if (to != null) params.set('to', String(to));

    const response = await apiClient(`/account/deals?${params.toString()}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw { response: { data: errorData, status: response.status } };
    }

    return readDealsPayload(await response.json());
  },

  /**
   * Fetch deal history for a trading account.
   *
   * GET /api/v2/deals/{login}?limit={limit}&offset={offset}[&from={from}&to={to}]
   *
   * FALLBACK ONLY (contract 6.4): the v3 gateway ignores paging here, caps
   * the result at 500 rows and sends no `position_ticket`. Prefer
   * fetchAllAccountDeals().
   *
   * Deals are the atomic execution records that compose positions.
   * Each deal has an `entry` field indicating whether it opened ("entry_in")
   * or closed ("entry_out") exposure, and an `action` field for direction.
   *
   * @param login   - The MT5 account login number (e.g. 200074)
   * @param limit   - Maximum number of deals to return (default: 50)
   * @param offset  - Pagination offset (default: 0)
   * @returns Array of Deal objects from the account's history
   */
  getDeals: async (login: number, limit = 1000, offset = 0, from?: number, to?: number): Promise<Deal[]> => {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    if (from != null) params.set('from', String(from));
    if (to != null) params.set('to', String(to));

    const response = await apiClient(`/deals/${login}?${params.toString()}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw { response: { data: errorData, status: response.status } };
    }

    return readDealsPayload(await response.json());
  },
};
