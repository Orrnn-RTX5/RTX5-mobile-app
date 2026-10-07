/**
 * Watchlist API (V2)
 *
 * Server-side watchlist management — syncs the user's symbol list across
 * devices and sessions. All endpoints are JWT-resolved (no login param).
 *
 * Endpoints:
 *  GET    /api/v2/watchlist           — fetch current watchlist
 *  POST   /api/v2/watchlist/{symbol}  — add a single symbol
 *  DELETE /api/v2/watchlist/{symbol}  — remove a single symbol
 *  PUT    /api/v2/watchlist           — replace entire watchlist (reorder/bulk)
 *
 * NOTE on PUT body: The Swagger schema shows {"symbols": ["string"]} but the
 * real server expects an array of objects: [{symbol, sort_order}].
 * Sending the Swagger format returns 400 "Expected array of {symbol, sort_order}".
 */

import { apiClient } from './apiClient';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** A single watchlist entry returned by GET /api/v2/watchlist */
export interface WatchlistItem {
  symbol: string;
  /** Unix timestamp (seconds) when the symbol was added */
  added_at: number;
  /** Display order (ascending) */
  sort_order: number;
}

/** Shape required by PUT /api/v2/watchlist body (array, not object) */
interface WatchlistPutEntry {
  symbol: string;
  sort_order: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────────────────────

/** POST /watchlist/{symbol} outcome: any 2xx, or the legacy duplicate 400. */
export const isWatchlistAddAccepted = (status: number): boolean =>
  (status >= 200 && status < 300) || status === 400;

export const watchlistApi = {
  /**
   * Fetch the user's server-side watchlist.
   *
   * GET /api/v2/watchlist
   *
   * @returns Array of WatchlistItem sorted by sort_order ascending
   */
  getWatchlist: async (): Promise<WatchlistItem[]> => {
    const response = await apiClient('/watchlist');
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw { response: { data: err, status: response.status } };
    }
    const json = await response.json();
    if (Array.isArray(json)) return json;
    if (Array.isArray(json?.data)) return json.data;
    return [];
  },

  /**
   * Add a single symbol to the watchlist.
   *
   * POST /api/v2/watchlist/{symbol}
   * Contract v3: returns 200 {symbol, status:"added"} even when the symbol is
   * already listed. Older servers answered 400 for a duplicate, which is still
   * tolerated as a no-op.
   *
   * @param symbol - Instrument symbol (e.g. "GBPUSD")
   */
  addSymbol: async (symbol: string): Promise<void> => {
    const response = await apiClient(`/watchlist/${encodeURIComponent(symbol)}`, {
      method: 'POST',
    });
    // 2xx (including 200 for an existing symbol) is success; a legacy 400
    // "already in watchlist" is a no-op, not an error.
    if (!isWatchlistAddAccepted(response.status)) {
      const err = await response.json().catch(() => ({}));
      throw { response: { data: err, status: response.status } };
    }
  },

  /**
   * Remove a single symbol from the watchlist.
   *
   * DELETE /api/v2/watchlist/{symbol}
   *
   * @param symbol - Instrument symbol (e.g. "GBPUSD")
   */
  removeSymbol: async (symbol: string): Promise<void> => {
    const response = await apiClient(`/watchlist/${encodeURIComponent(symbol)}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw { response: { data: err, status: response.status } };
    }
  },

  /**
   * Replace the entire watchlist (used for reordering or bulk updates).
   *
   * PUT /api/v2/watchlist
   *
   * Body must be an array of {symbol, sort_order} objects — NOT the Swagger
   * schema {"symbols": [...]}, which the server rejects with 400.
   *
   * @param symbols - Ordered array of symbol strings (index becomes sort_order)
   */
  replaceWatchlist: async (symbols: string[]): Promise<void> => {
    const body: WatchlistPutEntry[] = symbols.map((symbol, index) => ({
      symbol,
      sort_order: index,
    }));
    const response = await apiClient('/watchlist', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw { response: { data: err, status: response.status } };
    }
  },
};
