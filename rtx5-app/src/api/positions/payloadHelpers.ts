/**
 * Generic helpers for picking values out of inconsistent backend payloads.
 * Used by both the open-positions and closed-history paths.
 */
import type { JsonRecord } from './types';

export function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function pickArrayPayload(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!isJsonRecord(payload)) {
    return null;
  }

  const preferredKeys = [
    'data',
    'positions',
    'closed_positions',
    'closedPositions',
    'closed_trades',
    'closedTrades',
    'items',
    'result',
    'history',
    'records',
    'rows',
    'trades',
  ];

  for (const key of preferredKeys) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value;
    }
    if (isJsonRecord(value)) {
      const nested = pickArrayPayload(value);
      if (nested) {
        return nested;
      }
    }
  }

  for (const value of Object.values(payload)) {
    if (Array.isArray(value)) {
      return value;
    }
  }

  return null;
}

export function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

export function pickNumber(source: JsonRecord, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = toFiniteNumber(source[key]);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

export function pickString(source: JsonRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }

  return undefined;
}

export function pickTimestamp(source: JsonRecord, keys: string[]): number | string | undefined {
  for (const key of keys) {
    const value = source[key];
    const numeric = toFiniteNumber(value);
    if (numeric !== undefined) {
      return numeric;
    }
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }

  return undefined;
}

export function assignNumberAlias(target: JsonRecord, source: JsonRecord, key: string, aliases: string[]) {
  const value = pickNumber(source, aliases);
  if (value !== undefined) {
    target[key] = value;
  }
}

export function assignTimestampAlias(target: JsonRecord, source: JsonRecord, key: string, aliases: string[]) {
  const value = pickTimestamp(source, aliases);
  if (value !== undefined) {
    target[key] = value;
  }
}
