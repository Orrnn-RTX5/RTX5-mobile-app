/**
 * Live Market Account Summary DTOs & Service (V2)
 *
 * `GET /account/{login}` (contract v3, 2026-09-24):
 *   {login, name, group, leverage, currency, balance, credit, status, created_at, updated_at,
 *    equity, used_margin, free_margin, margin_level, floating_pnl, total_swap}
 *
 * - The margin key is `used_margin`; older aliases remain fallbacks.
 * - `open_positions` / `pending_orders` are not sent. Use the lengths of the
 *   positions and pending-orders lists wherever a count is shown.
 * - `equity`, `used_margin`, `free_margin`, `margin_level` and `floating_pnl` are
 *   present only when the server calculation succeeds. When one is missing the
 *   last known value is kept and reported in `staleMetrics`.
 * - `margin_level: 0` means no margin is used; show it as "—" (see formatMarginLevel).
 *
 * High-frequency equivalents of this data are streamed on `metrics.<login>`.
 */

import { commitApiJson } from './apiClient';
import { fetchAccountSnapshotResponse } from './accountSnapshotRequests';
import { formatMarginLevel, resolveServerMetric } from './accountsMapper';

export { formatMarginLevel };

type NumericAccountField = number | string | null | undefined;

/** Raw API response from GET /account/{login} */
export interface AccountSummaryApiResponse {
  id?: string;
  login?: NumericAccountField;
  name?: string | null;
  group?: string | null;
  balance: NumericAccountField;
  credit?: NumericAccountField;
  equity?: NumericAccountField;
  margin?: NumericAccountField;
  margin_used?: NumericAccountField;
  used_margin?: NumericAccountField;
  marginUsed?: NumericAccountField;
  usedMargin?: NumericAccountField;
  margin_available?: NumericAccountField;
  marginAvailable?: NumericAccountField;
  margin_free?: NumericAccountField;
  free_margin?: NumericAccountField;
  freeMargin?: NumericAccountField;
  margin_level?: NumericAccountField;
  marginLevel?: NumericAccountField;
  unrealized_pl?: NumericAccountField;
  floating?: NumericAccountField;
  floating_pnl?: NumericAccountField;
  total_swap?: NumericAccountField;
  realized_pl?: NumericAccountField;
  currency?: string | null;
  account_currency?: string | null;
  accountCurrency?: string | null;
  leverage?: NumericAccountField;
}

/** Server-calculated metrics that may be omitted when the calculation fails. */
export type AccountSummaryServerMetric =
  | 'equity'
  | 'margin'
  | 'freeMargin'
  | 'marginLevel'
  | 'profit';

/** Normalized account summary for UI consumption */
export interface AccountSummary {
  balance: number;
  credit: number;
  /** Floating P/L (`floating_pnl`). */
  profit: number;
  equity: number;
  /** Used margin (`used_margin`). */
  margin: number;
  freeMargin: number;
  marginLevel: number;
  totalSwap: number;
  leverage: number;
  currency: string;
  name?: string;
  group?: string;
  /**
   * Metrics missing from the latest response. Their values are the last known
   * values (or a 0 placeholder when no earlier value exists) and are stale.
   */
  staleMetrics: readonly AccountSummaryServerMetric[];
}

function parseFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) {
      return undefined;
    }
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function pickFiniteNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const parsed = parseFiniteNumber(value);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  return parseFiniteNumber(value) ?? fallback;
}

const cleanText = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

/**
 * Maps the raw API response (snake_case) to the UI-friendly interface (camelCase).
 *
 * @param previous - The last summary for the same account. Missing server
 *   metrics keep these values and are listed in `staleMetrics`.
 */
export function mapAccountSummaryApiResponse(
  raw: AccountSummaryApiResponse,
  previous?: AccountSummary | null,
): AccountSummary {
  const balance = toFiniteNumber(raw.balance);
  const credit = toFiniteNumber(raw.credit);
  const profit = resolveServerMetric(
    pickFiniteNumber(raw.floating_pnl, raw.unrealized_pl, raw.floating),
    previous?.profit,
  );
  const equity = resolveServerMetric(pickFiniteNumber(raw.equity), previous?.equity);
  const margin = resolveServerMetric(pickFiniteNumber(
    raw.used_margin,
    raw.margin_used,
    raw.marginUsed,
    raw.usedMargin,
    raw.margin,
  ), previous?.margin);
  const freeMargin = resolveServerMetric(pickFiniteNumber(
    raw.free_margin,
    raw.margin_free,
    raw.freeMargin,
    raw.margin_available,
    raw.marginAvailable,
  ), previous?.freeMargin);
  const marginLevel = resolveServerMetric(
    pickFiniteNumber(raw.margin_level, raw.marginLevel),
    previous?.marginLevel,
  );
  const staleMetrics = (
    [
      ['equity', equity],
      ['margin', margin],
      ['freeMargin', freeMargin],
      ['marginLevel', marginLevel],
      ['profit', profit],
    ] as const
  )
    .filter(([, metric]) => metric.stale)
    .map(([key]) => key);
  const name = cleanText(raw.name);
  const group = cleanText(raw.group);

  return {
    balance,
    credit,
    profit: profit.value,
    equity: equity.value,
    margin: margin.value,
    freeMargin: freeMargin.value,
    marginLevel: marginLevel.value,
    totalSwap: toFiniteNumber(raw.total_swap),
    leverage: toFiniteNumber(raw.leverage),
    currency: cleanText(raw.currency) || cleanText(raw.account_currency) || cleanText(raw.accountCurrency) || 'USD',
    ...(name ? { name } : {}),
    ...(group ? { group } : {}),
    staleMetrics,
  };
}

// Investor (read-only) detection lives in a dependency-free module so auth and
// refresh code can use it; re-exported here for account-facing callers.
export { isInvestorReadOnlySession } from './investorSession';

/**
 * Fetches the live account summary.
 *
 * GET /api/v2/account/{login}
 */
export async function getAccountSummary(
  login?: string,
  previous?: AccountSummary | null,
): Promise<AccountSummary> {
  const accountLogin = login?.trim() ?? '';
  if (!/^\d+$/.test(accountLogin) || !/[1-9]/.test(accountLogin)) {
    throw new Error('Login ID is required to fetch account summary');
  }

  const response = await fetchAccountSnapshotResponse(accountLogin);

  if (!response.ok) {
    let errorMsg = 'Failed to fetch account summary';
    try {
      const errorData = response.data as Record<string, any>;
      errorMsg = errorData.message || errorData.error || errorMsg;
    } catch (e) {
      // Ignored
    }
    throw new Error(`API Error ${response.status}: ${errorMsg}`);
  }

  return commitApiJson(response, response.cacheNamespace, (raw) =>
    mapAccountSummaryApiResponse(raw as AccountSummaryApiResponse, previous));
}
