/**
 * TanStack Query hooks for the calculators API.
 *
 * Both endpoints are POST requests that act as pure reads (idempotent given
 * the same inputs). We use useQuery with the full payload as the cache key
 * so React Query deduplicates and caches identical calculations automatically.
 *
 * Hooks:
 *  useMarginCalculation(payload) — POST /api/v2/calculate/margin
 *  useProfitCalculation(payload) — POST /api/v2/calculate/profit
 */

import { useQuery } from '@tanstack/react-query';
import {
  calculatorsApi,
  MarginCalcPayload,
  ProfitCalcPayload,
} from '../api/calculators';
import {
  getSessionQueryCacheNamespace,
  runSessionBoundQuery,
  useActiveBrokerQuerySession,
} from './authenticatedQueryScope';

export const CALCULATOR_KEY = 'calc';

export const getMarginCalculationQueryKey = (
  cacheNamespace: string,
  payload: MarginCalcPayload | null,
) => [CALCULATOR_KEY, cacheNamespace, 'margin', payload] as const;

export const getProfitCalculationQueryKey = (
  cacheNamespace: string,
  payload: ProfitCalcPayload | null,
) => [CALCULATOR_KEY, cacheNamespace, 'profit', payload] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Margin calculation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch margin metrics from the server for a proposed trade.
 *
 * Enabled only when all required fields are valid (account_login, symbol,
 * volume > 0). The query is keyed on the full payload so changing any input
 * triggers a new server fetch automatically.
 *
 * @param payload - Calculation inputs (pass null to disable)
 */
export function useMarginCalculation(payload: MarginCalcPayload | null) {
  const session = useActiveBrokerQuerySession();
  const cacheNamespace = getSessionQueryCacheNamespace(session);
  const enabled =
    Boolean(session) &&
    payload !== null &&
    !!payload.account_login &&
    !!payload.symbol &&
    payload.volume > 0;

  return useQuery({
    queryKey: getMarginCalculationQueryKey(cacheNamespace, payload),
    queryFn: () => runSessionBoundQuery(
      cacheNamespace,
      () => calculatorsApi.calculateMargin(payload!),
    ),
    enabled,
    // Cache for 30s — live prices shift margin slightly but not dramatically
    staleTime: 30_000,
    retry: 1,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Profit calculation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch profit/loss estimate from the server for a price scenario.
 *
 * Enabled only when all fields are present and both prices are non-zero.
 * The query re-runs whenever open_price or close_price changes.
 *
 * @param payload - Calculation inputs (pass null to disable)
 */
export function useProfitCalculation(payload: ProfitCalcPayload | null) {
  const session = useActiveBrokerQuerySession();
  const cacheNamespace = getSessionQueryCacheNamespace(session);
  const enabled =
    Boolean(session) &&
    payload !== null &&
    !!payload.symbol &&
    payload.volume > 0 &&
    payload.open_price > 0 &&
    payload.close_price > 0;

  return useQuery({
    queryKey: getProfitCalculationQueryKey(cacheNamespace, payload),
    queryFn: () => runSessionBoundQuery(
      cacheNamespace,
      () => calculatorsApi.calculateProfit(payload!),
    ),
    enabled,
    staleTime: 30_000,
    retry: 1,
  });
}
