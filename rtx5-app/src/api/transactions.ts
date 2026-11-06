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
import { readBackendNumber } from '../utils/accountCurrency';

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

export type BalanceLedgerOperationType = 'deposit' | 'withdrawal' | 'credit';

export interface BalanceLedgerOperation {
  id: string;
  type: BalanceLedgerOperationType;
  amount: number;
  timestamp: number | null;
  time?: number;
  balance_after?: number;
  comment?: string;
}

export const BALANCE_HISTORY_CHUNK_SIZE = 500;
export const BALANCE_HISTORY_MAX_ROWS = 500_000;

const VALID_BALANCE_OPERATION_TYPES = new Set<BalanceLedgerOperationType>([
  'deposit',
  'withdrawal',
  'credit',
]);

const parseBalanceTimestampMs = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    return value < 1e11 ? value * 1000 : value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      if (numeric <= 0) return null;
      return numeric < 1e11 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
};

export function normalizeBalanceLedgerOperation(raw: unknown): BalanceLedgerOperation | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const rawId = record.id ?? record.ticket ?? record.deal;
  if (rawId === null || rawId === undefined || String(rawId).trim() === '') return null;
  const id = String(rawId).trim();

  const rawType = String(record.type ?? record.action ?? '')
    .trim()
    .toLowerCase();
  if (!VALID_BALANCE_OPERATION_TYPES.has(rawType as BalanceLedgerOperationType)) {
    return null;
  }
  const type = rawType as BalanceLedgerOperationType;

  const parsedAmount = readBackendNumber(record.amount ?? record.profit);
  if (parsedAmount === undefined) return null;

  const amount = type === 'withdrawal' ? -Math.abs(parsedAmount) : parsedAmount;
  const timestamp = parseBalanceTimestampMs(
    record.time ?? record.created_at ?? record.timestamp,
  );
  const balanceAfter = readBackendNumber(record.balance_after);

  return {
    id,
    type,
    amount,
    timestamp,
    ...(timestamp !== null ? { time: Math.floor(timestamp / 1000) } : {}),
    ...(balanceAfter !== undefined ? { balance_after: balanceAfter } : {}),
    ...(typeof record.comment === 'string' && record.comment ? { comment: record.comment } : {}),
  };
}

const extractBalanceHistoryArray = (payload: unknown, depth = 0): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object' || depth > 3) return [];
  const record = payload as Record<string, unknown>;
  for (const key of ['data', 'history', 'transactions', 'items', 'records', 'rows', 'result']) {
    if (key in record) {
      return extractBalanceHistoryArray(record[key], depth + 1);
    }
  }
  return [];
};

export async function fetchAllBalanceLedgerOperations(
  login: number | string,
  options?: {
    from?: number;
    to?: number;
    pageSize?: number;
    maxRows?: number;
    fetchPage?: (limit: number, offset: number) => Promise<unknown>;
  },
): Promise<BalanceLedgerOperation[]> {
  const cleanLogin = String(login ?? '').trim();
  if (!/^\d+$/.test(cleanLogin)) {
    return [];
  }

  const pageSize = options?.pageSize ?? BALANCE_HISTORY_CHUNK_SIZE;
  const maxRows = options?.maxRows ?? BALANCE_HISTORY_MAX_ROWS;
  const byId = new Map<string, BalanceLedgerOperation>();
  const seenSignatures = new Set<string>();
  let offset = 0;

  while (byId.size < maxRows) {
    let rawPage: unknown;
    if (options?.fetchPage) {
      rawPage = await options.fetchPage(pageSize, offset);
    } else {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(offset),
      });
      if (options?.from !== undefined && Number.isFinite(options.from)) {
        params.set('from', String(Math.floor(options.from)));
      }
      if (options?.to !== undefined && Number.isFinite(options.to)) {
        params.set('to', String(Math.floor(options.to)));
      }
      const response = await apiClient(
        `/accounts/${encodeURIComponent(cleanLogin)}/history?${params.toString()}`,
      );
      if (!response.ok) {
        break;
      }
      rawPage = await response.json();
    }

    const rows = extractBalanceHistoryArray(rawPage);
    if (rows.length === 0) {
      break;
    }

    const normalizedPage = rows
      .map(normalizeBalanceLedgerOperation)
      .filter((op): op is BalanceLedgerOperation => op !== null);

    const sig = normalizedPage.map((op) => `${op.id}:${op.type}:${op.amount}`).join('|');
    if (sig && seenSignatures.has(sig)) {
      break;
    }
    if (sig) {
      seenSignatures.add(sig);
    }

    for (const op of normalizedPage) {
      if (!byId.has(op.id)) {
        byId.set(op.id, op);
      }
      if (byId.size >= maxRows) break;
    }

    if (rows.length < pageSize) {
      break;
    }
    offset += pageSize;
  }

  return Array.from(byId.values());
}
