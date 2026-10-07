/**
 * Balance transactions API (contract v3)
 *
 * `GET /accounts/{login}/history?page=1&limit=50[&from&to&type]`
 *   -> `[{id, account_login, type, amount, time, balance_after, comment?}]`
 * Totals come in the `X-Total-Count`, `X-Page` and `X-Limit` response headers.
 *
 * Replaces the non-existent `/api/account/transactions`.
 */

import { apiClient } from './apiClient';

/** Single balance transaction row. */
export interface Transaction {
  id: number | string;
  account_login: number;
  /** e.g. deposit / withdrawal / credit / correction */
  type: string;
  amount: number;
  /** Unix seconds. */
  time: number;
  balance_after: number;
  comment?: string;
}

export interface TransactionsPage {
  transactions: Transaction[];
  /** `X-Total-Count`; null when the header is missing. */
  total: number | null;
  page: number;
  limit: number;
}

export type TransactionsRequest = Readonly<{
  login: number | string;
  page?: number;
  limit?: number;
  /** Unix seconds. */
  from?: number;
  /** Unix seconds. */
  to?: number;
  type?: string;
}>;

export const DEFAULT_TRANSACTIONS_LIMIT = 50;

type HeaderReader = Readonly<{ get(name: string): string | null }>;

const positiveInteger = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const finiteNumber = (value: unknown, fallback = 0): number => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const readHeaderInteger = (headers: HeaderReader | null | undefined, name: string): number | null => {
  const raw = headers?.get(name);
  if (raw === null || raw === undefined || raw.trim() === '') return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
};

export function buildTransactionsPath(request: TransactionsRequest): string {
  const login = String(request.login ?? '').trim();
  if (!/^\d+$/.test(login)) {
    throw new Error('Login ID is required to fetch transactions');
  }
  const params = new URLSearchParams();
  params.set('page', String(positiveInteger(request.page, 1)));
  params.set('limit', String(positiveInteger(request.limit, DEFAULT_TRANSACTIONS_LIMIT)));
  if (request.from !== undefined && Number.isFinite(request.from)) {
    params.set('from', String(Math.floor(request.from)));
  }
  if (request.to !== undefined && Number.isFinite(request.to)) {
    params.set('to', String(Math.floor(request.to)));
  }
  if (request.type?.trim()) params.set('type', request.type.trim());
  return `/accounts/${encodeURIComponent(login)}/history?${params.toString()}`;
}

export function mapTransactionRow(row: unknown): Transaction | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const record = row as Record<string, unknown>;
  const id = record.id;
  if (typeof id !== 'number' && typeof id !== 'string') return null;
  return {
    id,
    account_login: finiteNumber(record.account_login),
    type: typeof record.type === 'string' ? record.type : '',
    amount: finiteNumber(record.amount),
    time: finiteNumber(record.time),
    balance_after: finiteNumber(record.balance_after),
    ...(typeof record.comment === 'string' && record.comment ? { comment: record.comment } : {}),
  };
}

export function parseTransactionsPage(
  body: unknown,
  headers: HeaderReader | null | undefined,
  request: TransactionsRequest,
): TransactionsPage {
  const rows = Array.isArray(body) ? body : [];
  return {
    transactions: rows
      .map(mapTransactionRow)
      .filter((row): row is Transaction => row !== null),
    total: readHeaderInteger(headers, 'X-Total-Count'),
    page: readHeaderInteger(headers, 'X-Page') ?? positiveInteger(request.page, 1),
    limit: readHeaderInteger(headers, 'X-Limit') ?? positiveInteger(request.limit, DEFAULT_TRANSACTIONS_LIMIT),
  };
}

/**
 * Fetches one page of balance transactions for the session account.
 */
export async function getTransactions(request: TransactionsRequest): Promise<TransactionsPage> {
  const response = await apiClient(buildTransactionsPath(request));

  if (!response.ok) {
    let errorMsg = 'Failed to fetch transactions';
    try {
      const errorData = await response.json();
      errorMsg = errorData.message || errorData.error || errorMsg;
    } catch (e) {
      // Ignored
    }
    throw new Error(`API Error ${response.status}: ${errorMsg}`);
  }

  return parseTransactionsPage(await response.json(), response.headers, request);
}
