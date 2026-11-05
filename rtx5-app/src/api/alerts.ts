/**
 * Price Alerts API (V2, contract v3)
 *
 * Manage server-side price alerts. All endpoints are JWT-resolved (no login param).
 *
 * Endpoints:
 *  POST   /api/v2/alerts       — body `{symbol, condition:"above"|"below"|"cross", price, message?}`;
 *                                returns `201 {id, symbol, condition, price}`
 *  GET    /api/v2/alerts       — returns a bare array
 *  DELETE /api/v2/alerts/{id}  — returns `{id, status:"deleted"}`
 */

import { apiClient } from './apiClient';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Condition direction for a price alert */
export type AlertCondition = 'above' | 'below' | 'cross';

const ALERT_CONDITIONS: readonly AlertCondition[] = ['above', 'below', 'cross'];

/**
 * A price alert returned by GET /api/v2/alerts.
 * `triggered` is true once the server has fired the alert (false when absent).
 */
export interface PriceAlert {
  id: number;
  symbol: string;
  condition: AlertCondition;
  price: number;
  message: string;
  /** Whether the alert has already been triggered */
  triggered: boolean;
  /** Unix timestamp (seconds) when the alert was created; 0 when absent. */
  created_at: number;
}

/** Payload for POST /api/v2/alerts */
export interface CreateAlertPayload {
  symbol: string;
  condition: AlertCondition;
  price: number;
  /** Optional human-readable note shown when alert fires */
  message?: string;
}

export interface DeleteAlertResult {
  id: number;
  status: 'deleted';
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapping
// ─────────────────────────────────────────────────────────────────────────────

const finiteNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export function normalizeAlertCondition(value: unknown): AlertCondition | null {
  const normalized = String(value ?? '').trim().toLowerCase();
  return (ALERT_CONDITIONS as readonly string[]).includes(normalized)
    ? (normalized as AlertCondition)
    : null;
}

/** Maps one alert row; rows without an id, symbol, condition or price are dropped. */
export function mapPriceAlert(row: unknown): PriceAlert | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const record = row as Record<string, unknown>;
  const id = finiteNumber(record.id);
  const price = finiteNumber(record.price);
  const condition = normalizeAlertCondition(record.condition);
  const symbol = typeof record.symbol === 'string' ? record.symbol.trim() : '';
  if (id === undefined || price === undefined || !condition || !symbol) return null;
  return {
    id,
    symbol,
    condition,
    price,
    message: typeof record.message === 'string' ? record.message : '',
    triggered: record.triggered === true,
    created_at: finiteNumber(record.created_at) ?? 0,
  };
}

export function mapPriceAlertList(body: unknown): PriceAlert[] {
  // Contract: a bare array. `{data:[...]}` is tolerated for older gateways.
  const rows = Array.isArray(body)
    ? body
    : Array.isArray((body as { data?: unknown } | null)?.data)
      ? (body as { data: unknown[] }).data
      : [];
  return rows
    .map(mapPriceAlert)
    .filter((alert): alert is PriceAlert => alert !== null);
}

/** Builds the POST body with only the contract keys. */
export function buildCreateAlertBody(payload: CreateAlertPayload): CreateAlertPayload {
  const message = payload.message?.trim();
  return {
    symbol: payload.symbol,
    condition: payload.condition,
    price: payload.price,
    ...(message ? { message } : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────────────────────

export const alertsApi = {
  /**
   * Fetch all price alerts for the authenticated user.
   *
   * GET /api/v2/alerts — a bare array.
   */
  getAlerts: async (): Promise<PriceAlert[]> => {
    const response = await apiClient('/alerts');
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw { response: { data: err, status: response.status } };
    }
    return mapPriceAlertList(await response.json());
  },

  /**
   * Create a new price alert.
   *
   * POST /api/v2/alerts — returns 201 `{id, symbol, condition, price}`.
   */
  createAlert: async (payload: CreateAlertPayload): Promise<Partial<PriceAlert>> => {
    const response = await apiClient('/alerts', {
      method: 'POST',
      body: JSON.stringify(buildCreateAlertBody(payload)),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw { response: { data: err, status: response.status } };
    }
    const created = await response.json().catch(() => ({}));
    return mapPriceAlert({ message: payload.message ?? '', ...(created as object) }) ?? {};
  },

  /**
   * Delete a price alert by ID.
   *
   * DELETE /api/v2/alerts/{id} — returns `{id, status:"deleted"}`.
   */
  deleteAlert: async (id: number): Promise<DeleteAlertResult> => {
    const response = await apiClient(`/alerts/${encodeURIComponent(String(id))}`, { method: 'DELETE' });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw { response: { data: err, status: response.status } };
    }
    const body = await response.json().catch(() => null) as Record<string, unknown> | null;
    return { id: finiteNumber(body?.id) ?? id, status: 'deleted' };
  },
};
