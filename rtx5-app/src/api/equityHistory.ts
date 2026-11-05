/**
 * Equity history API (contract v3)
 *
 * `GET /account/{login}/equity?from=<unix s>&to=<unix s>`
 *   -> `[{equity, balance, margin, free_margin, time}]`
 * The server default range is the last 24 h and it returns at most 1440 rows.
 *
 * Replaces the non-existent `/api/account/equity-history`.
 */

import { apiClient } from './apiClient';

/** Single equity data point. */
export interface EquityDataPoint {
  equity: number;
  balance: number;
  margin: number;
  free_margin: number;
  /** Unix seconds. */
  time: number;
}

export const EQUITY_HISTORY_MAX_ROWS = 1440;

/** App period options mapped to a from/to window. */
export type EquityHistoryPeriod = '1d' | '7d' | '30d' | '90d' | '1y';

const PERIOD_SECONDS: Readonly<Record<EquityHistoryPeriod, number>> = Object.freeze({
  '1d': 24 * 60 * 60,
  '7d': 7 * 24 * 60 * 60,
  '30d': 30 * 24 * 60 * 60,
  '90d': 90 * 24 * 60 * 60,
  '1y': 365 * 24 * 60 * 60,
});

export const DEFAULT_EQUITY_HISTORY_PERIOD: EquityHistoryPeriod = '1d';

/**
 * Maps a period option ('24h' and '1d' are the same) to `{from, to}` in unix
 * seconds. Unknown values fall back to the server default of 24 h.
 */
export function resolveEquityHistoryRange(
  period: string = DEFAULT_EQUITY_HISTORY_PERIOD,
  nowMs: number = Date.now(),
): Readonly<{ from: number; to: number }> {
  const normalized = String(period ?? '').trim().toLowerCase();
  const key = (normalized === '24h' ? '1d' : normalized) as EquityHistoryPeriod;
  const spanSeconds = PERIOD_SECONDS[key] ?? PERIOD_SECONDS[DEFAULT_EQUITY_HISTORY_PERIOD];
  const to = Math.floor(nowMs / 1000);
  return { from: to - spanSeconds, to };
}

export function buildEquityHistoryPath(
  login: number | string,
  range: Readonly<{ from: number; to: number }>,
): string {
  const normalizedLogin = String(login ?? '').trim();
  if (!/^\d+$/.test(normalizedLogin)) {
    throw new Error('Login ID is required to fetch equity history');
  }
  const params = new URLSearchParams();
  params.set('from', String(Math.floor(range.from)));
  params.set('to', String(Math.floor(range.to)));
  return `/account/${encodeURIComponent(normalizedLogin)}/equity?${params.toString()}`;
}

const finiteNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/** Maps rows, drops ones without a time or equity, and sorts ascending by time. */
export function parseEquityHistoryRows(body: unknown): EquityDataPoint[] {
  if (!Array.isArray(body)) return [];
  const points: EquityDataPoint[] = [];
  for (const row of body) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const record = row as Record<string, unknown>;
    const time = finiteNumber(record.time);
    const equity = finiteNumber(record.equity);
    if (time === undefined || equity === undefined) continue;
    points.push({
      equity,
      balance: finiteNumber(record.balance) ?? 0,
      margin: finiteNumber(record.margin) ?? 0,
      free_margin: finiteNumber(record.free_margin) ?? 0,
      time,
    });
  }
  return points.sort((left, right) => left.time - right.time);
}

/**
 * Fetches the equity curve for the session account.
 *
 * @param period - App period option ('1d' | '7d' | '30d' | '90d' | '1y').
 */
export async function getEquityHistory(
  login: number | string,
  period: string = DEFAULT_EQUITY_HISTORY_PERIOD,
  nowMs: number = Date.now(),
): Promise<EquityDataPoint[]> {
  const response = await apiClient(
    buildEquityHistoryPath(login, resolveEquityHistoryRange(period, nowMs)),
  );

  if (!response.ok) {
    let errorMsg = 'Failed to fetch equity history';
    try {
      const errorData = await response.json();
      errorMsg = errorData.message || errorData.error || errorMsg;
    } catch (e) {
      // Ignored
    }
    throw new Error(`API Error ${response.status}: ${errorMsg}`);
  }

  return parseEquityHistoryRows(await response.json());
}
