import {
  beginActiveBrokerSessionTransition,
  captureActiveBrokerSession,
  captureActiveBrokerSessionOwnerStamp,
  getActiveBrokerSessionIdentity,
  isActiveBrokerSessionCurrent,
  isActiveBrokerSessionOwnerStampCurrent,
  subscribeActiveBrokerSession,
  updateActiveBrokerSessionCredentials,
  type ActiveBrokerSessionCapture,
  type ActiveBrokerSessionIdentity,
  type ActiveBrokerSessionOwnerStamp,
} from '../state/activeBrokerSession';
import type { SecureAuthCredentialBundle } from '../state/secureCredentialBundle';
import { API_FETCH_TIMEOUT_MS, timedFetch } from '../utils/apiLatency';
import {
  buildApiUrl,
  buildVersionedBrokerApiUrl,
  type BrokerApiVersion,
} from './brokerRouting';
import { readInvestorSessionFlag } from './investorSession';
import { createTradeIdempotencyKey, getTradeIdempotencyAction } from './tradeIdempotency';
import { assertTradingSession, assertOrderReadiness } from '../services/tradingAccess';
import { positiveAccountLogin } from './guestAuthentication';
import {
  fingerprintMarketDataHost,
  recordMarketDataEvent,
} from '../market/marketDataTelemetry';

const TOKEN_REFRESH_SKEW_MS = 60_000;
// Contract v3 recommends 8 s. A refresh that times out is retried by the next
// caller; a premature abort there only wastes a rotation round trip.
export const AUTH_REFRESH_TIMEOUT_MS = 8000;
const AUTH_SESSION_EXPIRED_MESSAGE = 'Refresh token invalid or expired.';
const AUTH_SESSION_UNAVAILABLE_MESSAGE = 'No authenticated broker session available.';
const GUARDED_RESPONSE_BODY_READERS = new Set<PropertyKey>([
  'json',
  'text',
  'blob',
  'arrayBuffer',
  'formData',
  'bytes',
]);

export type BrokerApiRequestInit = RequestInit & {
  _retry?: boolean;
  skipAuth?: boolean;
  skipRefresh?: boolean;
  /** Use a broker-owned REST version other than the active session default. */
  apiVersion?: BrokerApiVersion;
  /**
   * Client-side abort budget for this request. Defaults to the shared
   * API_FETCH_TIMEOUT_MS; pass 0 to wait indefinitely (chart candle history —
   * a slow backend must be awaited, not failed with a timeout error).
   */
  timeoutMs?: number;
  /**
   * Defaults to true for idempotent reads and backend-deduplicated mutations.
   * Existing-position SL/TP PUT has no replay contract, so it refreshes the
   * session after a 401 but returns that response without replaying the write.
   */
  replayAfterAuthRefresh?: boolean;
  /** Native upload byte progress. Used only for FormData requests. */
  onUploadProgress?: (progress: number) => void;
};

const xhrUpload = (
  url: string,
  config: RequestInit,
  timeoutMs: number | undefined,
  onUploadProgress: (progress: number) => void,
): Promise<Response> => new Promise((resolve, reject) => {
  const xhr = new XMLHttpRequest();
  const method = (config.method ?? 'GET').toUpperCase();
  let settled = false;

  const cleanup = () => config.signal?.removeEventListener('abort', abortFromSignal);
  const finish = (callback: () => void) => {
    if (settled) return;
    settled = true;
    cleanup();
    callback();
  };
  const abortFromSignal = () => xhr.abort();

  xhr.open(method, url, true);
  xhr.timeout = timeoutMs === 0 ? 0 : (timeoutMs ?? API_FETCH_TIMEOUT_MS);
  new Headers(config.headers ?? {}).forEach((value, key) => xhr.setRequestHeader(key, value));
  xhr.upload.onprogress = (event) => {
    if (event.lengthComputable && event.total > 0) {
      onUploadProgress(Math.min(1, Math.max(0, event.loaded / event.total)));
    }
  };
  xhr.onload = () => finish(() => {
    if (xhr.status === 0) { reject(new TypeError('Network request failed')); return; }
    const responseHeaders = new Headers();
    xhr.getAllResponseHeaders().trim().split(/[\r\n]+/).forEach((line) => {
      const separator = line.indexOf(':');
      if (separator > 0) responseHeaders.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
    });
    resolve(new Response(xhr.responseText, {
      status: xhr.status,
      statusText: xhr.statusText,
      headers: responseHeaders,
    }));
  });
  xhr.onerror = () => finish(() => reject(new TypeError('Network request failed')));
  xhr.ontimeout = () => finish(() => reject(new Error('Network request timed out')));
  xhr.onabort = () => finish(() => {
    const error = new Error('The request was aborted.');
    error.name = 'AbortError';
    reject(error);
  });

  if (config.signal?.aborted) {
    const error = new Error('The request was aborted.');
    error.name = 'AbortError';
    finish(() => reject(error));
    return;
  }
  config.signal?.addEventListener('abort', abortFromSignal, { once: true });
  onUploadProgress(0);
  xhr.send((config.body ?? null) as XMLHttpRequestBodyInit | null);
});

export type BrokerApiJsonResponse<T> = Readonly<{
  ok: boolean;
  status: number;
  data: T;
  identity: ActiveBrokerSessionIdentity;
  owner: ActiveBrokerSessionOwnerStamp;
  cacheNamespace: string;
}>;

type NormalizedAuthResponse = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  /** Lower-cased: broker_id is compared ignoring case. */
  brokerId?: string;
  /** String form: account_login is a JSON number on the wire. */
  accountLogin?: string;
  /** Refresh `investor` (bool); absent when the response does not say. */
  investor?: boolean;
};

type InFlightRequest = {
  controller: AbortController;
  removeCallerAbortListener: () => void;
};

type CredentialLease = Readonly<{
  accessToken: string;
  owner: ActiveBrokerSessionOwnerStamp;
}>;

type RequestOwnership = {
  owner: ActiveBrokerSessionOwnerStamp;
};

type OwnedResponse = Readonly<{
  response: Response;
  identity: ActiveBrokerSessionIdentity;
  owner: ActiveBrokerSessionOwnerStamp;
  cacheNamespace: string;
}>;

type SessionInvalidationHandler = (
  identity: ActiveBrokerSessionIdentity,
) => Promise<void>;

export class StaleBrokerSessionError extends Error {
  public readonly code = 'STALE_BROKER_SESSION';

  constructor() {
    super('Broker session changed while the operation was in flight.');
    this.name = 'StaleBrokerSessionError';
  }
}

const isAuthFailureStatus = (status: number): boolean =>
  status === 400 || status === 401 || status === 403;

const isAuthSessionError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return (
    message.includes(AUTH_SESSION_EXPIRED_MESSAGE) ||
    message.includes(AUTH_SESSION_UNAVAILABLE_MESSAGE) ||
    message.includes('No refresh token available')
  );
};

const createUnauthenticatedResponse = (message = AUTH_SESSION_UNAVAILABLE_MESSAGE): Response =>
  new Response(JSON.stringify({ code: 'UNAUTHORIZED', message }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });

const parseExpiresAtMs = (expiresAt: string | undefined | null): number => {
  if (!expiresAt) return 0;
  const numeric = Number(expiresAt);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric > 1e12 ? numeric : numeric * 1000;
  }
  const parsed = Date.parse(expiresAt);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Normalizes a login/refresh body. `expires_at` is epoch seconds (ms values
 * are still accepted); without it `expires_in` seconds from now is used. The
 * rotated `refresh_token` is mandatory because the old one dies on use.
 */
export const normalizeBrokerRefreshResponse = (
  payload: unknown,
): NormalizedAuthResponse => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Refresh response was not an object.');
  }
  const root = payload as Record<string, unknown>;
  const accessToken = String(root.access_token ?? root.token ?? '').trim();
  const refreshToken = String(
    root.refresh_token ?? root.refreshToken ?? '',
  ).trim();
  const rawExpiresAt = root.expires_at ?? root.expiresAt;

  let expiresAt: string;
  if (typeof rawExpiresAt === 'string' && rawExpiresAt.trim()) {
    const raw = rawExpiresAt.trim();
    const ms = parseExpiresAtMs(raw);
    expiresAt = ms > 0 ? new Date(ms).toISOString() : raw;
  } else if (typeof rawExpiresAt === 'number' && rawExpiresAt > 0) {
    const ms = rawExpiresAt > 1e12 ? rawExpiresAt : rawExpiresAt * 1000;
    expiresAt = new Date(ms).toISOString();
  } else {
    const expiresIn = Number(root.expires_in);
    expiresAt = expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : '';
  }

  if (!accessToken) {
    throw new Error('Refresh response did not include an access token.');
  }
  if (!refreshToken) {
    throw new Error('Refresh response did not include a rotated refresh token.');
  }

  const brokerId = typeof root.broker_id === 'string'
    ? root.broker_id.trim()
    : typeof root.brokerId === 'string'
      ? root.brokerId.trim()
      : undefined;
  const accountLoginValue = root.account_login ?? root.accountLogin;
  const accountLogin =
    typeof accountLoginValue === 'string' || typeof accountLoginValue === 'number'
      ? positiveAccountLogin(accountLoginValue)
      : undefined;

  const investor = readInvestorSessionFlag(root);

  return {
    accessToken,
    refreshToken,
    expiresAt,
    ...(brokerId ? { brokerId } : {}),
    ...(accountLogin ? { accountLogin } : {}),
    ...(investor !== undefined ? { investor } : {}),
  };
};

export const createBrokerRefreshRequestInit = (
  refreshToken: string,
  signal?: AbortSignal,
): RequestInit => ({
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    accept: 'application/json',
  },
  body: JSON.stringify({ refresh_token: refreshToken }),
  ...(signal ? { signal } : {}),
});

const accountLoginsMatch = (a: string | number, b: string | number): boolean => {
  const left = String(a).trim();
  const right = String(b).trim();
  if (left === right) return true;
  return /^\d+$/.test(left) && /^\d+$/.test(right) && BigInt(left) === BigInt(right);
};

/**
 * Refresh identity checks: broker_id is compared ignoring case and
 * account_login numerically or as a string. A field the response omits is not
 * a mismatch.
 */
export const resolveRefreshIdentityMismatch = (
  normalized: Readonly<{ brokerId?: string; accountLogin?: string }>,
  session: Readonly<{ brokerId: string; accountLogin: string | number }>,
): 'broker_identity_mismatch' | 'account_identity_mismatch' | null => {
  if (
    normalized.brokerId &&
    normalized.brokerId.trim() !== String(session.brokerId).trim()
  ) {
    return 'broker_identity_mismatch';
  }
  if (
    normalized.accountLogin &&
    !accountLoginsMatch(normalized.accountLogin, session.accountLogin)
  ) {
    return 'account_identity_mismatch';
  }
  return null;
};

const appendQueryCredential = (
  baseUrl: string,
  params: ReadonlyArray<readonly [string, string]>,
): string => {
  const url = new URL(baseUrl);
  for (const [key, value] of params) {
    url.searchParams.set(key, value);
  }
  return url.toString();
};

export class BrokerAPI {
  private static instance: BrokerAPI | null = null;
  private readonly refreshPromises = new Map<string, Promise<CredentialLease>>();
  private readonly inFlight = new Map<string, Set<AbortController>>();
  private readonly unsubscribeFromSession: () => void;
  private sessionInvalidationHandler: SessionInvalidationHandler | null = null;

  constructor() {
    this.unsubscribeFromSession = subscribeActiveBrokerSession((event) => {
      if (event.type === 'transition') {
        this.abortInFlightRequests();
        this.refreshPromises.clear();
      }
    });
  }

  static getInstance(): BrokerAPI {
    if (!BrokerAPI.instance) {
      BrokerAPI.instance = new BrokerAPI();
    }
    return BrokerAPI.instance;
  }

  dispose(): void {
    this.unsubscribeFromSession();
    this.abortInFlightRequests();
    this.refreshPromises.clear();
  }

  abortInFlightRequests(): void {
    for (const requests of this.inFlight.values()) {
      for (const controller of requests) controller.abort();
    }
    this.inFlight.clear();
  }

  /** Registered by the top-level coordinator to include sockets/caches/UI in auth invalidation. */
  setSessionInvalidationHandler(handler: SessionInvalidationHandler | null): void {
    this.sessionInvalidationHandler = handler;
  }

  async request(endpoint: string, options: BrokerApiRequestInit = {}): Promise<Response> {
    const capture = captureActiveBrokerSession();
    if (!capture) {
      return createUnauthenticatedResponse();
    }

    const owned = await this.executeRequest(endpoint, options, capture);
    return this.bindResponseBodyReaders(owned.response, owned.owner);
  }

  async getJson<T>(endpoint: string, options: BrokerApiRequestInit = {}): Promise<T> {
    const result = await this.getJsonResponse<T>(endpoint, options);
    if (!result.ok) {
      throw { response: { status: result.status, data: result.data } };
    }
    return result.data;
  }

  /**
   * Parses a response while bound to one broker/account/epoch. Callers that
   * write a cache after awaiting must use `commitJsonResponse` so a transition
   * between parse completion and the write is rejected as stale.
   */
  async getJsonResponse<T>(
    endpoint: string,
    options: BrokerApiRequestInit = {},
  ): Promise<BrokerApiJsonResponse<T>> {
    const capture = this.requireCapture();
    const owned = await this.executeRequest(endpoint, options, capture);
    const response = this.bindResponseBodyReaders(owned.response, owned.owner);
    this.assertOwnerCurrent(owned.owner);

    let data: T;
    try {
      data = await response.json() as T;
    } catch (error) {
      this.assertOwnerCurrent(owned.owner);
      if (response.ok) throw error;
      data = {} as T;
    }
    this.assertOwnerCurrent(owned.owner);
    return Object.freeze({
      ok: response.ok,
      status: response.status,
      data,
      identity: owned.identity,
      owner: owned.owner,
      cacheNamespace: owned.cacheNamespace,
    });
  }

  /** Performs a synchronous parse/cache commit only if provenance is current. */
  commitJsonResponse<T, R>(
    result: BrokerApiJsonResponse<T>,
    expectedCacheNamespace: string,
    commit: (data: T) => R,
  ): R {
    this.assertOwnerCurrent(result.owner);
    const capture = this.requireCurrentCapture(result.identity);
    if (
      !expectedCacheNamespace ||
      result.cacheNamespace !== expectedCacheNamespace ||
      capture.session.cacheNamespace !== expectedCacheNamespace
    ) {
      throw new StaleBrokerSessionError();
    }
    return commit(result.data);
  }

  async getValidAccessToken(forceRefresh = false): Promise<string> {
    const capture = captureActiveBrokerSession();
    if (!capture) return '';
    const identity = getActiveBrokerSessionIdentity(capture.session);
    const lease = await this.getValidAccessTokenForCapture(capture, identity, forceRefresh);
    this.assertOwnerCurrent(lease.owner);
    return lease.accessToken;
  }

  async getWebSocketUrl(): Promise<string> {
    const capture = this.requireCapture();
    const identity = getActiveBrokerSessionIdentity(capture.session);
    if (!capture.session.tradeWsBase) {
      throw new Error('The active broker did not provide a validated trading WebSocket endpoint.');
    }
    const lease = await this.getValidAccessTokenForCapture(capture, identity, false);
    this.assertOwnerCurrent(lease.owner);
    if (!lease.accessToken) throw new Error(AUTH_SESSION_UNAVAILABLE_MESSAGE);
    const session = this.requireCurrentCapture(identity).session;
    return appendQueryCredential(session.tradeWsBase!, [['token', lease.accessToken]]);
  }

  /**
   * Quote feed URL: exactly the validated `feedWsBase`
   * (`wss://<host>/ws/feed`). Contract v3: no token, no query string. The
   * optional `?broker_id` label is not sent because the session broker id is
   * stored lower-cased and the server derives the broker from the host.
   */
  async getQuoteWebSocketUrl(): Promise<string> {
    const capture = this.requireCapture();
    this.assertCurrent(getActiveBrokerSessionIdentity(capture.session));
    return capture.session.feedWsBase;
  }

  private async executeRequest(
    endpoint: string,
    options: BrokerApiRequestInit,
    capture: ActiveBrokerSessionCapture,
  ): Promise<OwnedResponse> {
    const identity = getActiveBrokerSessionIdentity(capture.session);
    const ownership: RequestOwnership = {
      owner: this.requireCurrentOwnerStamp(identity),
    };
    const request = this.createInFlightRequest(capture, options.signal);
    try {
      const response = await this.requestForCapture(
        endpoint,
        options,
        capture,
        identity,
        ownership,
        request.controller.signal,
      );
      this.assertOwnerCurrent(ownership.owner);
      return Object.freeze({
        response,
        identity,
        owner: ownership.owner,
        cacheNamespace: ownership.owner.cacheNamespace,
      });
    } catch (error) {
      if (!isActiveBrokerSessionOwnerStampCurrent(ownership.owner)) {
        throw new StaleBrokerSessionError();
      }
      throw error;
    } finally {
      request.removeCallerAbortListener();
      this.unregisterInFlight(capture.session.cacheNamespace, request.controller);
    }
  }

  private async requestForCapture(
    endpoint: string,
    options: BrokerApiRequestInit,
    capture: ActiveBrokerSessionCapture,
    identity: ActiveBrokerSessionIdentity,
    ownership: RequestOwnership,
    signal: AbortSignal,
  ): Promise<Response> {
    const method = (options.method ?? 'GET').toUpperCase();
    const headers = new Headers(options.headers ?? {});
    const tradeIdempotencyAction = getTradeIdempotencyAction(endpoint, method);
    const shouldAuthenticate = !options.skipAuth;
    let activeToken = capture.credentials.accessToken;
    let activeLease: CredentialLease = Object.freeze({
      accessToken: activeToken,
      owner: ownership.owner,
    });

    if (shouldAuthenticate && !activeToken) {
      return createUnauthenticatedResponse();
    }
    if (shouldAuthenticate && !options.skipRefresh) {
      try {
        activeLease = await this.getValidAccessTokenForCapture(capture, identity, false);
        activeToken = activeLease.accessToken;
      } catch (error) {
        if (isAuthSessionError(error)) {
          return createUnauthenticatedResponse(AUTH_SESSION_EXPIRED_MESSAGE);
        }
        throw error;
      }
    }

    if (shouldAuthenticate) {
      if (!activeToken) return createUnauthenticatedResponse();
      headers.set('Authorization', `Bearer ${activeToken}`);
    }
    const mutationPath = endpoint.startsWith('https://') ? new URL(endpoint).pathname : endpoint.split('?')[0];
    const tradingMutation = method !== 'GET' && method !== 'HEAD' && /^\/(?:api\/v2\/)?(?:orders|positions)(?:\/|$)/.test(mutationPath);
    if (tradingMutation) {
      assertTradingSession(capture.session.cacheNamespace);
      if (method === 'POST' && /^\/(?:api\/v2\/)?orders\/?$/.test(mutationPath)) {
        const body = typeof options.body === 'string' ? JSON.parse(options.body) : null;
        if (String(body?.account_login) !== capture.session.accountLogin) throw new Error('Order account does not match the current trading session.');
        await assertOrderReadiness(capture.session.cacheNamespace, body, (path, init) => this.request(path, init));
      }
    }
    if (!headers.has('accept')) headers.set('accept', 'application/json');
    if (!headers.has('Content-Type') && (
      tradeIdempotencyAction || (options.body && !(options.body instanceof FormData))
    )) {
      headers.set('Content-Type', 'application/json');
    }
    if (tradeIdempotencyAction && !headers.has('Idempotency-Key')) {
      headers.set('Idempotency-Key', createTradeIdempotencyKey(tradeIdempotencyAction));
    }

    const url = options.apiVersion
      ? buildVersionedBrokerApiUrl(endpoint, capture.session.apiBase, options.apiVersion)
      : buildApiUrl(endpoint, capture.session.apiBase);
    const {
      _retry: _ignoredRetry,
      skipAuth: _ignoredSkipAuth,
      skipRefresh: _ignoredSkipRefresh,
      apiVersion: _ignoredApiVersion,
      signal: _ignoredSignal,
      timeoutMs,
      replayAfterAuthRefresh: _ignoredReplayAfterAuthRefresh,
      onUploadProgress,
      ...fetchOptions
    } = options;
    const requestConfig: RequestInit = { ...fetchOptions, headers, signal };
    if (shouldAuthenticate) {
      // A successful preflight refresh owns the next request only when its
      // credential lease is still current immediately before the send.
      this.adoptCredentialLease(ownership, identity, activeLease);
    } else {
      this.assertOwnerCurrent(ownership.owner);
    }
    const sendRequest = (config: RequestInit) => (
      onUploadProgress && options.body instanceof FormData
        ? xhrUpload(url, config, timeoutMs, onUploadProgress)
        : timedFetch(url, config, {
          label: `apiClient.${method}`,
          method,
          endpoint,
          source: 'apiClient',
          timeoutMs,
        })
    );
    let response = await sendRequest(requestConfig);
    this.assertOwnerCurrent(ownership.owner);

    if (response.status === 401 && shouldAuthenticate && !options._retry) {
      let refreshedLease: CredentialLease;
      try {
        refreshedLease = await this.getValidAccessTokenForCapture(capture, identity, true);
      } catch (error) {
        if (isAuthSessionError(error)) {
          return createUnauthenticatedResponse(AUTH_SESSION_EXPIRED_MESSAGE);
        }
        throw error;
      }
      const refreshedToken = refreshedLease.accessToken;
      if (!refreshedToken) return response;
      if (
        options.replayAfterAuthRefresh === false ||
        refreshedToken === activeToken
      ) {
        // Narrow causal exception: this settled 401 triggered the credential
        // rotation. Rebind only to the exact lease returned by that refresh so
        // callers still receive the rejection without replaying the mutation.
        this.adoptCredentialLease(ownership, identity, refreshedLease);
        return response;
      }

      const retryHeaders = new Headers(headers);
      retryHeaders.set('Authorization', `Bearer ${refreshedToken}`);
      // Adopt only the refresh operation's exact owner immediately before the
      // replay. An unrelated credential rotation makes this lease stale.
      this.adoptCredentialLease(ownership, identity, refreshedLease);
      response = await sendRequest({ ...requestConfig, headers: retryHeaders });
      this.assertOwnerCurrent(ownership.owner);
    }

    return response;
  }

  private async getValidAccessTokenForCapture(
    capture: ActiveBrokerSessionCapture,
    identity: ActiveBrokerSessionIdentity,
    forceRefresh: boolean,
  ): Promise<CredentialLease> {
    const current = this.requireCurrentCapture(identity);
    const owner = this.requireCurrentOwnerStamp(identity);
    if (!current.credentials.accessToken) {
      return Object.freeze({ accessToken: '', owner });
    }
    const expiresAtMs = parseExpiresAtMs(current.credentials.expiresAt);
    if (expiresAtMs > 0 && expiresAtMs <= Date.now() && !current.credentials.refreshToken) {
      await this.invalidateAuthSession(identity);
      return Object.freeze({ accessToken: '', owner });
    }
    const shouldRefresh = forceRefresh || (
      Boolean(current.credentials.refreshToken) &&
      expiresAtMs > 0 &&
      expiresAtMs - Date.now() < TOKEN_REFRESH_SKEW_MS
    );
    if (!shouldRefresh) {
      return Object.freeze({
        accessToken: current.credentials.accessToken,
        owner,
      });
    }
    return this.refreshToken(capture, identity);
  }

  private refreshToken(
    capture: ActiveBrokerSessionCapture,
    identity: ActiveBrokerSessionIdentity,
  ): Promise<CredentialLease> {
    this.assertOwnerCurrent(this.requireCurrentOwnerStamp(identity));
    const namespace = capture.session.cacheNamespace;
    const existing = this.refreshPromises.get(namespace);
    if (existing) return existing;

    const promise = this.performRefresh(identity).finally(() => {
      if (this.refreshPromises.get(namespace) === promise) {
        this.refreshPromises.delete(namespace);
      }
    });
    this.refreshPromises.set(namespace, promise);
    return promise;
  }

  private async performRefresh(identity: ActiveBrokerSessionIdentity): Promise<CredentialLease> {
    const capture = this.requireCurrentCapture(identity);
    const refreshOwner = this.requireCurrentOwnerStamp(identity);
    const { session, credentials } = capture;
    let refreshOutcomeRecorded = false;
    const recordRefreshOutcome = (
      outcome: string,
      extra: Record<string, unknown> = {},
    ) => {
      refreshOutcomeRecorded = true;
      recordMarketDataEvent('refresh_outcome', {
        outcome,
        brokerId: session.brokerId,
        sessionEpoch: identity.sessionEpoch,
        apiHostFingerprint: fingerprintMarketDataHost(session.apiBase),
        ...extra,
      });
    };
    if (!credentials.refreshToken) {
      recordRefreshOutcome('missing_refresh_credential');
      await this.invalidateAuthSession(identity);
      throw new Error(AUTH_SESSION_EXPIRED_MESSAGE);
    }

    const request = this.createInFlightRequest(capture);
    try {
      const response = await timedFetch(`${session.apiBase}/auth/refresh`, createBrokerRefreshRequestInit(
        credentials.refreshToken,
        request.controller.signal,
      ), {
        label: 'apiClient.refresh',
        method: 'POST',
        endpoint: '/auth/refresh',
        source: 'auth',
        timeoutMs: AUTH_REFRESH_TIMEOUT_MS,
      });
      this.assertOwnerCurrent(refreshOwner);

      if (!response.ok) {
        recordRefreshOutcome('rejected', { status: response.status });
        if (isAuthFailureStatus(response.status)) {
          await this.invalidateAuthSession(identity);
          throw new Error(AUTH_SESSION_EXPIRED_MESSAGE);
        }
        throw new Error(`Token refresh failed with status ${response.status}.`);
      }

      const payload = await response.json() as Record<string, unknown>;
      this.assertOwnerCurrent(refreshOwner);
      let normalized: NormalizedAuthResponse;
      try {
        normalized = normalizeBrokerRefreshResponse(payload);
      } catch {
        recordRefreshOutcome('invalid_rotation_payload');
        await this.invalidateAuthSession(identity);
        throw new Error(AUTH_SESSION_EXPIRED_MESSAGE);
      }
      const identityMismatch = resolveRefreshIdentityMismatch(normalized, session);
      if (identityMismatch) {
        recordRefreshOutcome(identityMismatch);
        await this.invalidateAuthSession(identity);
        throw new Error(AUTH_SESSION_EXPIRED_MESSAGE);
      }
      // The current-owner check and queued secure replacement are invoked in
      // the same turn. A subsequent broker commit queues behind this write.
      this.assertOwnerCurrent(refreshOwner);
      let storedCredentials: SecureAuthCredentialBundle;
      try {
        const { replaceAuthSessionCredentials } = await import('../state/brokerSessionStorage');
        this.assertOwnerCurrent(refreshOwner);
        storedCredentials = await replaceAuthSessionCredentials({
          brokerId: session.brokerId,
          accountLogin: session.accountLogin,
          accessToken: normalized.accessToken,
          refreshToken: normalized.refreshToken,
          expiresAt: normalized.expiresAt,
        });
        this.assertOwnerCurrent(refreshOwner);
      } catch (error) {
        recordRefreshOutcome('secure_storage_failed');
        if (isActiveBrokerSessionOwnerStampCurrent(refreshOwner)) {
          await this.invalidateAuthSession(identity);
        }
        throw error;
      }
      this.assertOwnerCurrent(refreshOwner);

      // Token-rotation signal: this emits `credentials_updated` through
      // subscribeActiveBrokerSession and bumps the owner-stamp
      // credentialGeneration. The trade socket must reconnect on it.
      const updated = updateActiveBrokerSessionCredentials(identity, {
        accessToken: storedCredentials.accessToken,
        refreshToken: storedCredentials.refreshToken,
        expiresAt: storedCredentials.expiresAt,
      }, normalized.investor !== undefined ? { investor: normalized.investor } : undefined);
      if (!updated) throw new StaleBrokerSessionError();
      const owner = this.requireCurrentOwnerStamp(identity);
      const current = this.requireCurrentCapture(identity);
      if (current.credentials.accessToken !== normalized.accessToken) {
        throw new StaleBrokerSessionError();
      }
      const { rebindActiveBrokerFeedHealthSession } =
        await import('../services/brokerSessionCoordinator');
      this.assertOwnerCurrent(owner);
      rebindActiveBrokerFeedHealthSession(this.requireCurrentCapture(identity));
      recordRefreshOutcome('accepted', { status: response.status });
      return Object.freeze({
        accessToken: normalized.accessToken,
        owner,
      });
    } catch (error) {
      if (!refreshOutcomeRecorded) {
        recordRefreshOutcome(
          error instanceof StaleBrokerSessionError ? 'stale_session' : 'request_failed',
        );
      }
      if (
        !isActiveBrokerSessionOwnerStampCurrent(refreshOwner) &&
        !(error instanceof Error && isAuthSessionError(error))
      ) {
        throw new StaleBrokerSessionError();
      }
      throw error;
    } finally {
      request.removeCallerAbortListener();
      this.unregisterInFlight(capture.session.cacheNamespace, request.controller);
    }
  }

  private async invalidateAuthSession(identity: ActiveBrokerSessionIdentity): Promise<void> {
    if (!isActiveBrokerSessionCurrent(identity)) return;
    if (this.sessionInvalidationHandler) {
      await this.sessionInvalidationHandler(identity);
      return;
    }
    beginActiveBrokerSessionTransition();
    try {
      const { clearAuthSessionTokens } = await import('../state/brokerSessionStorage');
      await clearAuthSessionTokens();
    } catch {
      // The epoch was already advanced and memory credentials were erased.
      // Secure-storage failures stay fail-closed and are handled by re-login.
    }
  }

  private requireCapture(): ActiveBrokerSessionCapture {
    const capture = captureActiveBrokerSession();
    if (!capture) throw new Error(AUTH_SESSION_UNAVAILABLE_MESSAGE);
    return capture;
  }

  private requireCurrentCapture(
    identity: ActiveBrokerSessionIdentity,
  ): ActiveBrokerSessionCapture {
    this.assertCurrent(identity);
    const capture = captureActiveBrokerSession();
    if (!capture) throw new StaleBrokerSessionError();
    return capture;
  }

  private assertCurrent(identity: ActiveBrokerSessionIdentity): void {
    if (!isActiveBrokerSessionCurrent(identity)) {
      throw new StaleBrokerSessionError();
    }
  }

  private requireCurrentOwnerStamp(
    identity: ActiveBrokerSessionIdentity,
  ): ActiveBrokerSessionOwnerStamp {
    this.assertCurrent(identity);
    const owner = captureActiveBrokerSessionOwnerStamp();
    if (
      !owner ||
      owner.brokerId !== identity.brokerId ||
      owner.accountLogin !== identity.accountLogin ||
      owner.sessionEpoch !== identity.sessionEpoch ||
      !isActiveBrokerSessionOwnerStampCurrent(owner)
    ) {
      throw new StaleBrokerSessionError();
    }
    return owner;
  }

  private assertOwnerCurrent(owner: ActiveBrokerSessionOwnerStamp): void {
    if (!isActiveBrokerSessionOwnerStampCurrent(owner)) {
      throw new StaleBrokerSessionError();
    }
  }

  private adoptCredentialLease(
    ownership: RequestOwnership,
    identity: ActiveBrokerSessionIdentity,
    lease: CredentialLease,
  ): void {
    this.assertOwnerCurrent(lease.owner);
    const current = this.requireCurrentCapture(identity);
    if (current.credentials.accessToken !== lease.accessToken) {
      throw new StaleBrokerSessionError();
    }
    ownership.owner = lease.owner;
  }

  /**
   * A fetch can finish while its body is still being decoded. Bind all standard
   * body readers to the credential owner so legacy `apiClient(...).json()` call
   * sites cannot parse an old response after a session or credential rotation.
   */
  private bindResponseBodyReaders(
    response: Response,
    owner: ActiveBrokerSessionOwnerStamp,
  ): Response {
    return new Proxy(response, {
      get: (target, property) => {
        if (property === 'clone' && typeof target.clone === 'function') {
          return () => {
            this.assertOwnerCurrent(owner);
            const clone = target.clone();
            this.assertOwnerCurrent(owner);
            return this.bindResponseBodyReaders(clone, owner);
          };
        }

        const value = Reflect.get(target, property, target);
        if (GUARDED_RESPONSE_BODY_READERS.has(property) && typeof value === 'function') {
          return async (...args: unknown[]) => {
            this.assertOwnerCurrent(owner);
            try {
              const body = await Reflect.apply(value, target, args);
              this.assertOwnerCurrent(owner);
              return body;
            } catch (error) {
              this.assertOwnerCurrent(owner);
              throw error;
            }
          };
        }
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }

  private createInFlightRequest(
    capture: ActiveBrokerSessionCapture,
    callerSignal?: AbortSignal | null,
  ): InFlightRequest {
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    if (callerSignal?.aborted) controller.abort();
    else callerSignal?.addEventListener('abort', abortFromCaller, { once: true });

    const namespace = capture.session.cacheNamespace;
    const requests = this.inFlight.get(namespace) ?? new Set<AbortController>();
    requests.add(controller);
    this.inFlight.set(namespace, requests);
    return {
      controller,
      removeCallerAbortListener: () => callerSignal?.removeEventListener('abort', abortFromCaller),
    };
  }

  private unregisterInFlight(namespace: string, controller: AbortController): void {
    const requests = this.inFlight.get(namespace);
    if (!requests) return;
    requests.delete(controller);
    if (requests.size === 0) this.inFlight.delete(namespace);
  }

}

export const brokerApi = BrokerAPI.getInstance();
