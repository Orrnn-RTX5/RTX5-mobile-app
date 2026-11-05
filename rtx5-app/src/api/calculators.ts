/**
 * Calculators API (V2)
 *
 * Server-side margin and profit calculations. Results are authoritative —
 * the server applies the account's actual leverage, broker contract specs,
 * and live pricing, so values match exactly what the trading engine will use.
 *
 * Endpoints:
 *  POST /api/v2/calculate/margin  — required margin, free margin, max lots, pip value
 *  POST /api/v2/calculate/profit  — profit/loss in account currency and pips
 *
 * NOTE on real vs. Swagger response shapes:
 *  Margin: real response returns {contract_value, free_margin, max_lots, pip_value,
 *          required_margin} — Swagger also lists symbol/volume/leverage/currency which
 *          are NOT present in the real response.
 *  Profit: real response returns {pip_value, pips, profit} — Swagger also echoes back
 *          symbol/volume/side/open_price/close_price which are NOT in the real response.
 */

import { apiClient } from './apiClient';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Payload for POST /api/v2/calculate/margin */
export interface MarginCalcPayload {
  account_login: number;
  symbol: string;
  side: 'buy' | 'sell';
  volume: number;
}

/**
 * Result from POST /api/v2/calculate/margin.
 * Field names match the real server response (not the Swagger schema).
 */
export interface MarginCalcResult {
  /** Total value of the position in account currency */
  contract_value: number;
  /** Available margin remaining after this trade */
  free_margin: number;
  /** Maximum volume tradeable given current free margin */
  max_lots: number;
  /** P&L per pip move in account currency */
  pip_value: number;
  /** Margin the broker will lock for this trade */
  required_margin: number;
}

/** Payload for POST /api/v2/calculate/profit */
export interface ProfitCalcPayload {
  symbol: string;
  volume: number;
  side: 'buy' | 'sell';
  open_price: number;
  close_price: number;
}

/**
 * Result from POST /api/v2/calculate/profit.
 * Field names match the real server response (not the Swagger schema).
 */
export interface ProfitCalcResult {
  /** P&L per pip move in account currency */
  pip_value: number;
  /** Price difference in pips */
  pips: number;
  /** Profit/loss in account currency */
  profit: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────────────────────

export const calculatorsApi = {
  /**
   * Calculate required margin and position metrics for a proposed trade.
   *
   * POST /api/v2/calculate/margin
   *
   * Uses the account's actual leverage and broker contract specs — more accurate
   * than the client-side formula (lots * contractSize * price / leverage).
   *
   * @param payload - account_login, symbol, side, volume
   * @returns Server-computed margin, free_margin, max_lots, pip_value, contract_value
   */
  calculateMargin: async (payload: MarginCalcPayload): Promise<MarginCalcResult> => {
    const response = await apiClient('/calculate/margin', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw { response: { data: err, status: response.status } };
    }
    return response.json();
  },

  /**
   * Calculate potential profit/loss for a trade scenario.
   *
   * POST /api/v2/calculate/profit
   *
   * Pass open_price = 0 and close_price = 0 to get a base reference result.
   * The server applies the correct contract size and currency conversion.
   *
   * @param payload - symbol, volume, side, open_price, close_price
   * @returns profit (account currency), pips, pip_value
   */
  calculateProfit: async (payload: ProfitCalcPayload): Promise<ProfitCalcResult> => {
    const response = await apiClient('/calculate/profit', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw { response: { data: err, status: response.status } };
    }
    return response.json();
  },
};
