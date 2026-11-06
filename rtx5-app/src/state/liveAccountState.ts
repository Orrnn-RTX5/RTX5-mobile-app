/**
 * Core module: liveAccountState.ts
 */

import { create } from 'zustand';
import {
  accountMetricsUnavailable,
  comparePublicationTokens,
  isValidPublicationToken,
} from '../utils/accountMetrics';

/**
 * Represents the live financial metrics for the currently active trading account.
 * These values are typically pushed in real-time via WebSocket.
 */
export type LiveAccountData = {
  /** The unique numeric MT5 login ID for the account */
  login: number;
  /** The settled cash balance of the account */
  balance: number;
  /** Optional credit/bonus balance */
  credit?: number;
  /** The current equity (balance + floating PnL) */
  equity: number;
  /** The amount of margin currently tied up in open positions */
  margin: number;
  /** The available margin that can be used to open new positions */
  margin_free: number;
  /** The margin level percentage (equity / margin * 100) */
  margin_level: number;
  /** The current aggregate unrealized profit/loss from all open positions */
  floating: number;
  /** Optional profile & provenance metadata */
  currency?: string;
  currency_digits?: number | null;
  leverage?: number;
  publication_token?: string;
  metricsStatus?: 'ok' | 'unavailable';
  valid?: boolean;
  stale?: boolean;
  status?: string;
  calculated_at?: string | number;
  as_of?: string | number;
  source_as_of?: string | number;
  broker_id?: string;
};

export type LiveAccountMetricKey =
  | 'balance'
  | 'equity'
  | 'margin'
  | 'margin_free'
  | 'margin_level'
  | 'floating';

export type LiveAccountMetricFlags = Record<LiveAccountMetricKey, boolean>;

/**
 * Metrics the server calculates and may omit when that calculation fails
 * (contract v3: `equity`, `used_margin`, `free_margin`, `margin_level`,
 * `floating_pnl`). A missing value keeps the last known value and is flagged
 * stale instead of being replaced with 0 or recomputed.
 */
export const SERVER_CALCULATED_LIVE_METRICS = [
  'equity',
  'margin',
  'margin_free',
  'margin_level',
  'floating',
] as const;

export type ServerCalculatedLiveMetric = (typeof SERVER_CALCULATED_LIVE_METRICS)[number];

/**
 * Zustand store interface for managing live account metrics.
 */
type LiveAccountState = LiveAccountData & {
  /**
   * True once at least one financial metric has arrived for the current login.
   * A known login alone is not enough because the numeric defaults are all zero.
   */
  hasMetrics: boolean;
  /**
   * Tracks which individual financial metrics have arrived for the current login.
   */
  metricFlags: LiveAccountMetricFlags;
  /**
   * Metrics whose latest account snapshot omitted them. The stored value is the
   * last known one. Cleared per metric when a fresh value arrives.
   */
  staleMetricFlags: LiveAccountMetricFlags;
  /**
   * Updates one or more properties of the live account state.
   * @param data - Partial metrics to merge into current state
   */
  updateMetrics: (data: Partial<LiveAccountData>) => void;
  /**
   * Applies a full account snapshot (REST `GET /account/{login}` or a
   * `metrics_update` frame): present metrics are updated, and server-calculated
   * metrics that are missing keep their last value and are marked stale.
   */
  applyMetricsSnapshot: (data: Partial<LiveAccountData>) => void;
  /**
   * Resets the account metrics to their default (zero) state.
   */
  resetMetrics: () => void;
};

const initialState: LiveAccountData = {
  login: 0,
  balance: 0,
  equity: 0,
  margin: 0,
  margin_free: 0,
  margin_level: 0,
  floating: 0,
};

const financialMetricKeys: LiveAccountMetricKey[] = [
  'balance',
  'equity',
  'margin',
  'margin_free',
  'margin_level',
  'floating',
];

const initialMetricFlags: LiveAccountMetricFlags = {
  balance: false,
  equity: false,
  margin: false,
  margin_free: false,
  margin_level: false,
  floating: false,
};

function buildMetricFlags(
  data: Partial<LiveAccountData>,
  currentFlags: LiveAccountMetricFlags,
): LiveAccountMetricFlags {
  let nextFlags = currentFlags;

  for (const key of financialMetricKeys) {
    if (key in data && data[key] !== undefined) {
      if (key === 'margin' && typeof data.margin === 'number' && data.margin < 0) {
        if (nextFlags[key]) {
          if (nextFlags === currentFlags) nextFlags = { ...currentFlags };
          nextFlags[key] = false;
        }
        continue;
      }
      if (!nextFlags[key]) {
        if (nextFlags === currentFlags) nextFlags = { ...currentFlags };
        nextFlags[key] = true;
      }
    }
  }

  return nextFlags;
}

function clearStaleFlags(
  data: Partial<LiveAccountData>,
  currentFlags: LiveAccountMetricFlags,
): LiveAccountMetricFlags {
  let nextFlags = currentFlags;
  for (const key of financialMetricKeys) {
    if (key in data && data[key] !== undefined && nextFlags[key]) {
      if (nextFlags === currentFlags) nextFlags = { ...currentFlags };
      nextFlags[key] = false;
    }
  }
  return nextFlags;
}

function hasAnyMetric(flags: LiveAccountMetricFlags): boolean {
  return financialMetricKeys.some((key) => flags[key]);
}

function mergeMetrics(state: LiveAccountState, data: Partial<LiveAccountData>, snapshot = false) {
  const loginChanged = data.login !== undefined && data.login !== state.login;
  const baseState = loginChanged ? initialState : state;

  // Explicit staleness / validity / malformed publication_token check
  const hasExplicitValidityField =
    data.valid !== undefined ||
    data.stale !== undefined ||
    data.status !== undefined ||
    data.publication_token !== undefined ||
    data.calculated_at !== undefined ||
    data.as_of !== undefined ||
    data.source_as_of !== undefined;

  if (hasExplicitValidityField && accountMetricsUnavailable(data)) {
    return {
      ...baseState,
      ...(data.login !== undefined ? { login: data.login } : {}),
      metricsStatus: 'unavailable' as const,
      hasMetrics: false,
      metricFlags: initialMetricFlags,
      staleMetricFlags: {
        balance: true,
        equity: true,
        margin: true,
        margin_free: true,
        margin_level: true,
        floating: true,
      },
    };
  }

  // Publication token monotonicity guard (Section 4.4)
  const currentToken = !loginChanged && isValidPublicationToken(state.publication_token)
    ? state.publication_token
    : undefined;
  const incomingTokenRaw = data.publication_token;
  const incomingToken = isValidPublicationToken(incomingTokenRaw) ? incomingTokenRaw : undefined;

  if (currentToken) {
    if (incomingTokenRaw === undefined) {
      // Untokenized response after a tokenized snapshot:
      // Do NOT overwrite any financial metric; only merge profile metadata if present.
      const profilePatch: Partial<LiveAccountData> = {};
      if (data.currency !== undefined) profilePatch.currency = data.currency;
      if (data.currency_digits !== undefined) profilePatch.currency_digits = data.currency_digits;
      if (data.leverage !== undefined) profilePatch.leverage = data.leverage;
      if (Object.keys(profilePatch).length === 0) {
        return state;
      }
      return { ...state, ...profilePatch };
    }

    if (incomingToken) {
      const cmp = comparePublicationTokens(incomingToken, currentToken);
      if (cmp < 0) {
        return state;
      }
      if (cmp === 0) {
        const profilePatch: Partial<LiveAccountData> = {};
        if (!state.currency && data.currency !== undefined) profilePatch.currency = data.currency;
        if (
          (state.currency_digits === undefined || state.currency_digits === null) &&
          data.currency_digits !== undefined
        ) {
          profilePatch.currency_digits = data.currency_digits;
        }
        if (state.leverage === undefined && data.leverage !== undefined) {
          profilePatch.leverage = data.leverage;
        }
        if (Object.keys(profilePatch).length === 0) {
          return state;
        }
        return { ...state, ...profilePatch };
      }
    }
  }

  const normalizedData: Partial<LiveAccountData> = { ...data };
  if (typeof normalizedData.margin === 'number' && normalizedData.margin < 0) {
    normalizedData.margin = 0;
  }
  if (hasExplicitValidityField) {
    normalizedData.metricsStatus = 'ok';
  }

  const metricFlags = buildMetricFlags(data, loginChanged ? initialMetricFlags : state.metricFlags);
  let staleMetricFlags = clearStaleFlags(data, loginChanged ? initialMetricFlags : state.staleMetricFlags);
  if (snapshot) {
    const previousFlags = staleMetricFlags;
    for (const key of SERVER_CALCULATED_LIVE_METRICS) {
      if (!(key in data) && !staleMetricFlags[key]) {
        if (staleMetricFlags === previousFlags) staleMetricFlags = { ...previousFlags };
        staleMetricFlags[key] = true;
      }
    }
  }
  const hasMetrics = hasAnyMetric(metricFlags);
  if (!loginChanged && metricFlags === state.metricFlags && staleMetricFlags === state.staleMetricFlags
      && hasMetrics === state.hasMetrics
      && (Object.keys(normalizedData) as Array<keyof LiveAccountData>).every(key => Object.is(normalizedData[key], state[key]))) {
    return state;
  }
  return { ...(loginChanged ? initialState : state), ...normalizedData, hasMetrics, metricFlags, staleMetricFlags };
}

/**
 * Global Zustand store for real-time account financial metrics.
 * Designed to be updated frequently (e.g., via WebSocket) without triggering full UI re-renders
 * unless the specific subscribed metric changes.
 */
export const useLiveAccountState = create<LiveAccountState>((set) => ({
  ...initialState,
  hasMetrics: false,
  metricFlags: initialMetricFlags,
  staleMetricFlags: initialMetricFlags,
  updateMetrics: (data) => set(state => mergeMetrics(state, data)),
  applyMetricsSnapshot: (data) => set(state => mergeMetrics(state, data, true)),
  resetMetrics: () => set({
    ...initialState,
    hasMetrics: false,
    metricFlags: initialMetricFlags,
    staleMetricFlags: initialMetricFlags,
  }),
}));

