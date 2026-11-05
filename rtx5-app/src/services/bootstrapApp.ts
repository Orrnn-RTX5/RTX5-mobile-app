import {
  brokerApi,
  StaleBrokerSessionError,
  type BrokerApiJsonResponse,
} from '../api/brokerApi';
import { appQueryClient } from '../state/providers/AppProviders';
import { useLiveAccountState } from '../state/liveAccountState';
import { usePositionsState } from '../state/positionsState';
import { useTradingState } from '../state/tradingState';
import { useUserPreferences } from '../state/userPreferences';
import { getAccountDetailQueryKey } from '../query/accounts';
import { getAccountSummaryQueryKey } from '../query/account';
import { getOrdersByLoginQueryKey } from '../query/orders';
import { getMarketStatusQueryKey } from '../query/marketStatus';
import { fetchInstrumentCatalogResponse, primeInstrumentMetaCacheFromCatalogPayload } from '../api/instruments';
import { extractMarketSymbols } from '../domain/marketSymbols';
import { normalizeMarketStatusListPayload } from '../api/marketStatus';
import { brokerRealtimeService } from '../api/ws/BrokerRealtimeService';
import { quotesWsService } from '../api/ws/quotesSocket';
import { buildAccountDetailPath } from '../api/accountsRoutes';
import { fetchAccountSnapshotResponse } from '../api/accountSnapshotRequests';
import {
  mapRawAccount,
  type TradingAccount,
  type TradingAccountRaw,
} from '../api/accounts';
import { mapAccountSummaryApiResponse, type AccountSummary, type AccountSummaryApiResponse } from '../api/account';
import { sanitizeApiLatencyEndpoint } from '../utils/apiLatency';
import {
  captureActiveBrokerSession,
  getActiveBrokerSessionProvenance,
  isActiveBrokerSessionProvenanceCurrent,
  type ActiveBrokerSessionProvenance,
} from '../state/activeBrokerSession';
import { recordMarketDataEvent } from '../market/marketDataTelemetry';
import { normalizeQuoteSymbolKey } from '../domain/symbols';
import { extractLiveAccountMetrics } from '../api/ws/accountSocket.helpers';
import {
  beginAccountEnvironmentRefresh,
  commitActiveAccountEnvironmentPayload,
} from './accountEnvironmentSession';
import { acceptTradingHydration } from './tradingAccess';
import { createBootstrapRequestCoordinator, type BootstrapRun } from './bootstrapRequestCoordinator';
import { readBootstrapSnapshot } from './bootstrapSnapshotRetry';

type BootstrapResult = {
  me: unknown;
  accounts: unknown;
  positions: unknown;
  orders: unknown;
  instruments: unknown;
  marketStatus: unknown;
};

const unwrapArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  for (const key of ['data', 'items', 'result', 'positions', 'orders', 'accounts', 'instruments']) {
    if (Array.isArray(record[key])) {
      return record[key] as unknown[];
    }
  }
  return [];
};

type BootstrapOptions = {
  accountLogin?: string | number;
  expectedProvenance?: ActiveBrokerSessionProvenance;
  /** Authentication needs verified identity, account policy and catalog only. */
  waitFor?: 'trading' | 'complete';
};

const emptyBootstrapResult = (): BootstrapResult => ({
  me: null,
  accounts: null,
  positions: null,
  orders: null,
  instruments: null,
  marketStatus: null,
});

const unwrapAccountRows = (value: unknown): unknown[] => {
  const rows = unwrapArray(value);
  if (rows.length > 0) return rows;
  return value && typeof value === 'object' && !Array.isArray(value) ? [value] : [];
};

const requestJson = async <T>(
  endpoint: string,
  read = () => brokerApi.getJsonResponse<T>(endpoint),
): Promise<BrokerApiJsonResponse<T> | null> => {
  const capture = captureActiveBrokerSession();
  const provenance = capture ? getActiveBrokerSessionProvenance(capture.session) : null;
  try {
    const result = await readBootstrapSnapshot({
      endpoint,
      read,
      isCurrent: () => Boolean(provenance && isActiveBrokerSessionProvenanceCurrent(provenance)),
    });
    if (!result) return null;
    if (!result.ok) {
      throw { response: { status: result.status, data: result.data } };
    }
    return result;
  } catch (error) {
    // Expected (offline, 401 refresh, stale session): bootstrap degrades to null.
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log('[Bootstrap] Request failed', {
        endpoint: sanitizeApiLatencyEndpoint(endpoint),
        errorName: error instanceof Error ? error.name : 'RequestError',
      });
    }
    return null;
  }
};

/**
 * `GET /account/{login}` returns one object. Pick the row for the session
 * login (tolerating a legacy array/wrapper) and map it for the detail cache.
 */
const mapBootstrapAccountRow = (
  value: unknown,
  accountLogin: string,
  previous: TradingAccount | undefined,
  previousSummary: AccountSummary | undefined,
): { detail: TradingAccount; summary: AccountSummary } | null => {
  const rows = unwrapAccountRows(value).filter(
    (row): row is TradingAccountRaw =>
      Boolean(row) && typeof row === 'object' && !Array.isArray(row),
  );
  const selected = rows.find((row) => String(row.login ?? '') === accountLogin) ?? rows[0];
  return selected ? {
    detail: mapRawAccount(selected, previous),
    summary: mapAccountSummaryApiResponse(selected as AccountSummaryApiResponse, previousSummary),
  } : null;
};

const commitBootstrapResponse = <T, R>(
  result: BrokerApiJsonResponse<T> | null,
  cacheNamespace: string,
  commit: (data: T) => R,
): R | null => {
  if (!result) return null;
  try {
    return brokerApi.commitJsonResponse(result, cacheNamespace, commit);
  } catch (error) {
    if (error instanceof StaleBrokerSessionError) return null;
    throw error;
  }
};

const updateAccountMetricsFromBootstrap = (accounts: unknown, accountLogin: string | undefined) => {
  const rows = unwrapAccountRows(accounts);
  const selected = rows.find((item) => {
    const record = item as Record<string, unknown>;
    return String(record.login ?? record.account_login ?? record.id ?? '') === String(accountLogin ?? '');
  }) ?? rows[0];
  const record = selected as Record<string, unknown> | undefined;
  if (!record) return;

  // Contract v3: equity, used_margin, free_margin, margin_level and
  // floating_pnl are present only when the server calculation succeeds.
  // Missing ones keep their last value (flagged stale); they are never
  // recomputed here, because a local balance-based guess would be misleading.
  const parsedMetrics = extractLiveAccountMetrics(record) ?? {};
  const parseFiniteNumber = (value: unknown): number | undefined => {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'string' && value.trim() === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const login = parsedMetrics.login ?? parseFiniteNumber(record.id);
  const balance = parsedMetrics.balance;
  const credit = parseFiniteNumber(record.credit);
  const floating = parsedMetrics.floating;
  const margin = parsedMetrics.margin;
  const equity = parsedMetrics.equity;
  const freeMargin = parsedMetrics.margin_free;
  const marginLevel = parsedMetrics.margin_level;

  const liveMetrics = {
    ...(login !== undefined ? { login } : {}),
    ...(balance !== undefined ? { balance } : {}),
    ...(equity !== undefined ? { equity } : {}),
    ...(margin !== undefined ? { margin } : {}),
    ...(freeMargin !== undefined ? { margin_free: freeMargin } : {}),
    ...(marginLevel !== undefined ? { margin_level: marginLevel } : {}),
    ...(floating !== undefined ? { floating } : {}),
  };
  if (Object.keys(liveMetrics).length > 0) {
    useLiveAccountState.getState().applyMetricsSnapshot(liveMetrics);
  }

  const currency = typeof record.currency === 'string' && record.currency.trim()
    ? record.currency.trim()
    : undefined;
  const accountPatch = {
    ...(balance !== undefined ? { balance } : {}),
    ...(credit !== undefined ? { credit } : {}),
    ...(equity !== undefined ? { equity } : {}),
    ...(margin !== undefined ? { margin } : {}),
    ...(freeMargin !== undefined ? { freeMargin } : {}),
    ...(marginLevel !== undefined ? { marginLevel } : {}),
    ...(floating !== undefined ? { floating } : {}),
    ...(currency !== undefined ? { currency } : {}),
  };
  if (Object.keys(accountPatch).length > 0) {
    // setAccount merges partial snapshots, so omitted/blank bootstrap fields do
    // not replace valid metrics that arrived earlier from realtime.
    useTradingState.getState().setAccount(accountPatch);
  }
};

const joinBootstrapRequest = createBootstrapRequestCoordinator<BootstrapResult>();

export async function bootstrapApp(options: BootstrapOptions = {}): Promise<BootstrapResult> {
  const sessionCapture = captureActiveBrokerSession();
  if (!sessionCapture) {
    recordMarketDataEvent('bootstrap_gate', { outcome: 'blocked', reason: 'no_active_session' });
    return emptyBootstrapResult();
  }

  const activeProvenance = getActiveBrokerSessionProvenance(sessionCapture.session);
  if (
    options.expectedProvenance &&
    (
      options.expectedProvenance.cacheNamespace !== activeProvenance.cacheNamespace ||
      !isActiveBrokerSessionProvenanceCurrent(options.expectedProvenance)
    )
  ) {
    recordMarketDataEvent('bootstrap_gate', {
      outcome: 'blocked', reason: 'stale_provenance',
      brokerId: sessionCapture.session.brokerId,
      sessionEpoch: sessionCapture.session.sessionEpoch,
    });
    return emptyBootstrapResult();
  }

  const requestedAccountLogin = options.accountLogin === undefined || options.accountLogin === null
    ? sessionCapture.session.accountLogin
    : String(options.accountLogin).trim();
  if (!requestedAccountLogin || requestedAccountLogin !== sessionCapture.session.accountLogin) {
    recordMarketDataEvent('bootstrap_gate', {
      outcome: 'blocked', reason: 'account_mismatch',
      brokerId: sessionCapture.session.brokerId,
      sessionEpoch: sessionCapture.session.sessionEpoch,
    });
    return emptyBootstrapResult();
  }

  const requestKey = `${activeProvenance.cacheNamespace}:${activeProvenance.credentialGeneration}`;
  return joinBootstrapRequest(requestKey, options.waitFor ?? 'complete', () =>
    startBootstrapRequest(sessionCapture, activeProvenance));
}

function startBootstrapRequest(
  sessionCapture: NonNullable<ReturnType<typeof captureActiveBrokerSession>>,
  activeProvenance: ActiveBrokerSessionProvenance,
): BootstrapRun<BootstrapResult> {
  recordMarketDataEvent('bootstrap_gate', {
    outcome: 'started',
    brokerId: sessionCapture.session.brokerId,
    sessionEpoch: sessionCapture.session.sessionEpoch,
  });

  const accountLogin = sessionCapture.session.accountLogin;
  const encodedAccountLogin = encodeURIComponent(accountLogin);
  const cacheNamespace = sessionCapture.session.cacheNamespace;
  const accountEnvironmentRefresh = beginAccountEnvironmentRefresh(activeProvenance);

  const state = useUserPreferences.getState();
  if (state.isLoggedIn && state.accountDetails?.credentials?.accessToken) {
    brokerRealtimeService.connect();
    // Warm the market quote socket before Quotes/Chart finish mounting so the
    // first watchlist paint is not waiting on React focus + health-probe serial work.
    const warmSymbols = Array.from(
      new Set(
        (state.quoteSymbols ?? [])
          .map((symbol) => normalizeQuoteSymbolKey(String(symbol ?? '')))
          .filter(Boolean),
      ),
    );
    if (warmSymbols.length > 0) {
      quotesWsService.setSubscriptions(warmSymbols);
    }
  }

  // Start startup requests together and apply each result as soon as it lands.
  // This keeps quotes/account/positions from waiting on a slower endpoint.
  const mePromise = requestJson('/auth/me').then((result) =>
    commitBootstrapResponse(result, cacheNamespace, (data) => data));
  const accountsPromise = accountLogin
    ? requestJson(buildAccountDetailPath(accountLogin), () => fetchAccountSnapshotResponse(accountLogin)).then((result) =>
      commitBootstrapResponse(result, cacheNamespace, (accounts) => {
        // Seed the singular account detail cache. `GET /accounts` is never
        // called: it returns 403 for traders (contract v3).
        const detailKey = getAccountDetailQueryKey(cacheNamespace, Number(accountLogin));
        const summaryKey = getAccountSummaryQueryKey(cacheNamespace, accountLogin);
        const snapshots = mapBootstrapAccountRow(
          accounts,
          accountLogin,
          appQueryClient.getQueryData<TradingAccount>(detailKey),
          appQueryClient.getQueryData<AccountSummary>(summaryKey),
        );
        if (snapshots) {
          appQueryClient.setQueryData<TradingAccount>(detailKey, snapshots.detail);
          appQueryClient.setQueryData<AccountSummary>(summaryKey, snapshots.summary);
          useUserPreferences.getState().updateAccountDetails({
            name: snapshots.detail.name || `Account ${snapshots.detail.login}`,
          });
        }
        updateAccountMetricsFromBootstrap(accounts, accountLogin);
        if (accountEnvironmentRefresh) {
          commitActiveAccountEnvironmentPayload(
            accounts,
            activeProvenance,
            accountEnvironmentRefresh,
          );
        }
        return accounts;
      }))
    : Promise.resolve(null);
  const positionsPromise = accountLogin
    ? requestJson(`/positions/${encodedAccountLogin}`).then((result) =>
      commitBootstrapResponse(result, cacheNamespace, (positions) => {
        const resolvedRows = unwrapArray(positions);
        usePositionsState.getState().applyPositionsSnapshot(resolvedRows, accountLogin, {
          preserveMissingExisting: false,
        });
        return positions;
      }))
    : Promise.resolve(null);
  // `/orders/{login}` still works (max 500 rows) and matches the orders cache
  // shape; `/account/orders` is preferred for paged order history elsewhere.
  const ordersPromise = accountLogin
    ? requestJson(`/orders/${encodedAccountLogin}`).then((result) =>
      commitBootstrapResponse(result, cacheNamespace, (orders) => {
        appQueryClient.setQueryData(
          getOrdersByLoginQueryKey(cacheNamespace, Number(accountLogin)),
          unwrapArray(orders),
        );
        return orders;
      }))
    : Promise.resolve(null);
  // Contract v3: plain /instruments (no favorites filter). The catalog primes
  // the per-session instrument-meta cache that order tickets and charts read.
  const instrumentsPromise = requestJson('/instruments', () => fetchInstrumentCatalogResponse(cacheNamespace)).then((result) =>
    commitBootstrapResponse(result, cacheNamespace, (instruments) => {
      primeInstrumentMetaCacheFromCatalogPayload(instruments, cacheNamespace);
      // The dashboard uses this same catalog. Seed its query so mounting after
      // bootstrap completes does not immediately request /instruments again.
      appQueryClient.setQueryData(
        ['market', cacheNamespace, 'symbols', 'instrument-catalog-v3'],
        extractMarketSymbols(instruments),
      );
      return instruments;
    }));
  // `/market/status` returns a bare array of per-symbol rows. Each normalized
  // row seeds the per-symbol market-status query used by the UI.
  const marketStatusPromise = requestJson('/market/status').then((result) =>
    commitBootstrapResponse(result, cacheNamespace, (payload) => {
      const marketStatus = normalizeMarketStatusListPayload(payload);
      for (const row of marketStatus) {
        appQueryClient.setQueryData(getMarketStatusQueryKey(cacheNamespace, row.symbol), row);
      }
      return marketStatus;
    }));

  // Only these authoritative snapshots gate authentication. The remaining
  // requests keep updating their session-scoped stores in the background.
  const ready = Promise.all([mePromise, accountsPromise, instrumentsPromise])
    .then(([me, accounts, instruments]) => {
      acceptTradingHydration(cacheNamespace, me, accounts, instruments);
      return { ...emptyBootstrapResult(), me, accounts, instruments };
    });
  const complete = Promise.all([
    mePromise,
    accountsPromise,
    positionsPromise,
    ordersPromise,
    instrumentsPromise,
    marketStatusPromise,
  ]).then(([me, accounts, positions, orders, instruments, marketStatus]) => {
    recordMarketDataEvent('bootstrap_gate', {
      outcome: 'completed',
      brokerId: sessionCapture.session.brokerId,
      sessionEpoch: sessionCapture.session.sessionEpoch,
      completedSnapshots: [me, accounts, positions, orders, instruments, marketStatus]
        .filter((value) => value !== null).length,
    });
    return { me, accounts, positions, orders, instruments, marketStatus };
  });
  return { ready, complete };
}
