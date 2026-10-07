/**
 * Market-data feed health (Backend Contract v3).
 *
 * Live websocket ticks are the primary signal and always win:
 *   - a fresh, acceptable tick (within the local stale window) => healthy;
 *   - 8 s without one => stale_or_degraded (prices greyed), socket kept open;
 *   - a socket close => reconnecting until the next tick.
 *
 * `/ws/feed/status` is only a diagnostic, probed on demand. Its verdict
 * (symbols_fresh + providers[].connected) is shown only while no fresh tick
 * exists, and it never stops the socket. The quote feed has no auth, so there
 * is no auth-failure latch here.
 */
export type FeedHealthStatus =
  | 'disabled_unconfigured'
  | 'connecting'
  | 'healthy'
  | 'stale_or_degraded'
  | 'reconnecting'
  | 'auth_failed'
  | 'provider_down'
  | 'market_unavailable';

export type FeedHealthReasonCategory =
  | 'session_unconfigured'
  | 'credentials_unavailable'
  | 'health_policy_unconfigured'
  | 'awaiting_server_health'
  | 'awaiting_live_tick'
  | 'live_ticks'
  | 'server_status_incomplete'
  | 'server_status_stale'
  | 'local_tick_stale'
  | 'server_degraded'
  | 'transport_interrupted'
  | 'authentication'
  | 'provider_connectivity'
  | 'market_service'
  | 'scheduled_market_closed';

export type FeedHealthIdentity = Readonly<{
  brokerId: string;
  accountLogin: string;
  sessionEpoch: number;
}>;

/**
 * Optional aging policy. The v3 status endpoint publishes none, so the local
 * tick window falls back to FEED_LOCAL_TICK_STALE_AFTER_MS.
 */
export type FeedHealthThresholds = Readonly<{
  localTickStaleAfterMs: number;
  serverStatusStaleAfterMs: number;
}>;

/** Contract v3 watchdog: prices are stale after 8 s without a frame. */
export const FEED_LOCAL_TICK_STALE_AFTER_MS = 8_000;

export type FeedMarketSchedule = 'unknown' | 'open' | 'scheduled_closed';

/** Verdict of one `/ws/feed/status` reading under the v3 rule. */
export type FeedServerVerdict = 'healthy' | 'degraded' | 'down';

type ServerHealthVerdict = 'unknown' | FeedServerVerdict;

export type FeedHealthState = Readonly<{
  identity: FeedHealthIdentity | null;
  status: FeedHealthStatus;
  reasonCategory: FeedHealthReasonCategory;
  transportConfigured: boolean;
  credentialApproved: boolean;
  thresholds: FeedHealthThresholds | null;
  marketSchedule: FeedMarketSchedule;
  serverVerdict: ServerHealthVerdict;
  /** True after a socket close until the next accepted websocket tick. */
  transportInterrupted: boolean;
  lastServerStatusAt?: number;
  lastLocalTickAt?: number;
  lastSuccessAt?: number;
  localTickAcceptable: boolean;
}>;

/**
 * Normalized `/ws/feed/status` reading (contract v3). Only `symbols_fresh` and
 * `providers[].connected` matter; `status`, `upstream_connected`,
 * `auth_accepted` and `market_available` are ignored.
 */
export type FeedServerStatus = Readonly<{
  observedAt: number;
  verdict: FeedServerVerdict;
  symbolsFresh: number | null;
  providerConnected: boolean;
}>;

export type FeedHealthEvent =
  | {
      type: 'BIND_SESSION';
      identity: FeedHealthIdentity;
      transportConfigured: boolean;
      credentialApproved: boolean;
      /** undefined preserves an existing same-session policy; null clears it. */
      thresholds?: FeedHealthThresholds | null;
    }
  | { type: 'UNBIND_SESSION'; reasonCategory?: FeedHealthReasonCategory }
  | { type: 'CONNECTING'; identity: FeedHealthIdentity }
  | {
      type: 'LOCAL_TICK';
      identity: FeedHealthIdentity;
      receivedAt: number;
      bid: number;
      ask: number;
      transport: 'websocket' | 'rest_snapshot' | undefined;
      stale?: boolean;
      degraded?: boolean;
    }
  | { type: 'SERVER_STATUS'; identity: FeedHealthIdentity; health: FeedServerStatus }
  | { type: 'SOCKET_CLOSED'; identity: FeedHealthIdentity }
  | { type: 'CREDENTIALS_REFRESHED'; identity: FeedHealthIdentity }
  | { type: 'RETRY_REQUESTED'; identity: FeedHealthIdentity }
  | { type: 'EVALUATE'; identity: FeedHealthIdentity; now: number };

export const initialFeedHealthState: FeedHealthState = Object.freeze({
  identity: null,
  status: 'disabled_unconfigured',
  reasonCategory: 'session_unconfigured',
  transportConfigured: false,
  credentialApproved: false,
  thresholds: null,
  marketSchedule: 'unknown',
  serverVerdict: 'unknown',
  transportInterrupted: false,
  localTickAcceptable: false,
});

const cleanIdentityPart = (value: unknown): string => String(value ?? '').trim();

const normalizeIdentity = (identity: FeedHealthIdentity): FeedHealthIdentity => Object.freeze({
  brokerId: cleanIdentityPart(identity.brokerId).toLowerCase(),
  accountLogin: cleanIdentityPart(identity.accountLogin),
  sessionEpoch: Number(identity.sessionEpoch),
});

export const isValidFeedHealthIdentity = (identity: FeedHealthIdentity): boolean => {
  const normalized = normalizeIdentity(identity);
  return Boolean(
    normalized.brokerId &&
    normalized.accountLogin &&
    Number.isSafeInteger(normalized.sessionEpoch) &&
    normalized.sessionEpoch > 0,
  );
};

/** broker_id is compared ignoring case ("Orrnn" vs "orrnn"). */
export const sameFeedHealthIdentity = (
  left: FeedHealthIdentity | null | undefined,
  right: FeedHealthIdentity | null | undefined,
): boolean => {
  if (!left || !right) return false;
  const normalizedLeft = normalizeIdentity(left);
  const normalizedRight = normalizeIdentity(right);
  return normalizedLeft.brokerId === normalizedRight.brokerId &&
    normalizedLeft.accountLogin === normalizedRight.accountLogin &&
    normalizedLeft.sessionEpoch === normalizedRight.sessionEpoch;
};

const normalizeThresholds = (
  thresholds: FeedHealthThresholds | null | undefined,
): FeedHealthThresholds | null => {
  if (!thresholds) return null;
  const localTickStaleAfterMs = Number(thresholds.localTickStaleAfterMs);
  const serverStatusStaleAfterMs = Number(thresholds.serverStatusStaleAfterMs);
  if (
    !Number.isFinite(localTickStaleAfterMs) ||
    !Number.isFinite(serverStatusStaleAfterMs) ||
    localTickStaleAfterMs <= 0 ||
    serverStatusStaleAfterMs <= 0
  ) {
    return null;
  }
  return Object.freeze({ localTickStaleAfterMs, serverStatusStaleAfterMs });
};

const finiteTimestamp = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

/** Local tick window: an explicit policy if one was ever supplied, else 8 s. */
export const resolveLocalTickStaleAfterMs = (state: Pick<FeedHealthState, 'thresholds'>): number =>
  state.thresholds?.localTickStaleAfterMs ?? FEED_LOCAL_TICK_STALE_AFTER_MS;

const withStatus = (
  state: FeedHealthState,
  status: FeedHealthStatus,
  reasonCategory: FeedHealthReasonCategory,
  changes: Partial<FeedHealthState> = {},
): FeedHealthState => Object.freeze({ ...state, ...changes, status, reasonCategory });

const hasFreshAcceptableTick = (state: FeedHealthState, now: number): boolean => Boolean(
  state.lastLocalTickAt &&
  state.localTickAcceptable &&
  !state.transportInterrupted &&
  now - state.lastLocalTickAt < resolveLocalTickStaleAfterMs(state),
);

const evaluateBoundHealth = (state: FeedHealthState, now: number): FeedHealthState => {
  if (!state.identity || !state.transportConfigured) {
    return withStatus(state, 'disabled_unconfigured', 'session_unconfigured');
  }
  if (!state.credentialApproved) {
    return withStatus(state, 'auth_failed', 'credentials_unavailable');
  }

  const evaluatedAt = finiteTimestamp(now) ?? Date.now();

  // Live ticks always win over the status endpoint.
  if (hasFreshAcceptableTick(state, evaluatedAt)) {
    return withStatus(state, 'healthy', 'live_ticks');
  }

  // A 'down' reading describes the feed only until live ticks prove otherwise.
  // Once an acceptable tick arrives after it, a later gap is staleness or a
  // reconnect, not "provider down" (shown as "Unavailable" while prices flow).
  // Price actions are unaffected: they still require a fresh acceptable tick.
  const serverVerdictIsCurrent = state.lastServerStatusAt !== undefined
    && (state.lastSuccessAt === undefined || state.lastServerStatusAt >= state.lastSuccessAt);
  if (state.serverVerdict === 'down' && serverVerdictIsCurrent) {
    return withStatus(state, 'provider_down', 'provider_connectivity');
  }
  if (state.transportInterrupted) {
    return withStatus(state, 'reconnecting', 'transport_interrupted');
  }
  if (state.lastLocalTickAt) {
    // Ticks arrived before but stopped (or were marked stale by the hub).
    return withStatus(state, 'stale_or_degraded', 'local_tick_stale');
  }
  if (state.serverVerdict === 'degraded') {
    return withStatus(state, 'stale_or_degraded', 'server_degraded');
  }
  if (state.serverVerdict === 'healthy') {
    return withStatus(state, 'connecting', 'awaiting_live_tick');
  }
  return withStatus(state, 'connecting', 'awaiting_live_tick');
};

const bindSession = (
  state: FeedHealthState,
  event: Extract<FeedHealthEvent, { type: 'BIND_SESSION' }>,
): FeedHealthState => {
  if (!isValidFeedHealthIdentity(event.identity)) {
    return initialFeedHealthState;
  }

  const identity = normalizeIdentity(event.identity);
  const sameSession = sameFeedHealthIdentity(state.identity, identity);
  const thresholds = event.thresholds === undefined && sameSession
    ? state.thresholds
    : normalizeThresholds(event.thresholds);
  const base: FeedHealthState = sameSession
    ? Object.freeze({
        ...state,
        identity,
        transportConfigured: event.transportConfigured,
        credentialApproved: event.credentialApproved,
        thresholds,
      })
    : Object.freeze({
        identity,
        status: 'connecting',
        reasonCategory: 'awaiting_live_tick',
        transportConfigured: event.transportConfigured,
        credentialApproved: event.credentialApproved,
        thresholds,
        marketSchedule: 'unknown',
        serverVerdict: 'unknown',
        transportInterrupted: false,
        localTickAcceptable: false,
      });

  return evaluateBoundHealth(base, Date.now());
};

const serverStatusState = (
  state: FeedHealthState,
  health: FeedServerStatus,
): FeedHealthState => {
  const observedAt = finiteTimestamp(health.observedAt);
  if (!observedAt) {
    return state;
  }
  const verdict: ServerHealthVerdict =
    health.verdict === 'healthy' || health.verdict === 'degraded' || health.verdict === 'down'
      ? health.verdict
      : 'unknown';
  return evaluateBoundHealth(
    Object.freeze({ ...state, serverVerdict: verdict, lastServerStatusAt: observedAt }),
    observedAt,
  );
};

export const reduceFeedHealth = (
  state: FeedHealthState,
  event: FeedHealthEvent,
): FeedHealthState => {
  if (event.type === 'BIND_SESSION') {
    return bindSession(state, event);
  }
  if (event.type === 'UNBIND_SESSION') {
    return event.reasonCategory
      ? Object.freeze({ ...initialFeedHealthState, reasonCategory: event.reasonCategory })
      : initialFeedHealthState;
  }
  if (!state.identity || !sameFeedHealthIdentity(state.identity, event.identity)) {
    return state;
  }

  switch (event.type) {
    case 'CONNECTING':
      // A (re)connect keeps a still-fresh tick healthy; otherwise it is
      // "connecting" until the first tick proves the socket.
      return evaluateBoundHealth(state, Date.now());
    case 'LOCAL_TICK': {
      const receivedAt = finiteTimestamp(event.receivedAt);
      const validPrices = Number.isFinite(event.bid) && event.bid > 0 &&
        Number.isFinite(event.ask) && event.ask > 0;
      if (!receivedAt || !validPrices || event.transport !== 'websocket') {
        return state;
      }
      const localTickAcceptable = event.stale !== true && event.degraded !== true;
      return evaluateBoundHealth(Object.freeze({
        ...state,
        lastLocalTickAt: receivedAt,
        ...(localTickAcceptable ? { lastSuccessAt: receivedAt } : {}),
        localTickAcceptable,
        transportInterrupted: false,
      }), receivedAt);
    }
    case 'SERVER_STATUS':
      return serverStatusState(state, event.health);
    case 'SOCKET_CLOSED':
      return evaluateBoundHealth(
        Object.freeze({ ...state, transportInterrupted: true }),
        Date.now(),
      );
    case 'CREDENTIALS_REFRESHED':
      return state.credentialApproved
        ? evaluateBoundHealth(Object.freeze({
            ...state,
            serverVerdict: 'unknown',
            lastServerStatusAt: undefined,
            lastLocalTickAt: undefined,
            localTickAcceptable: false,
            transportInterrupted: false,
          }), Date.now())
        : state;
    case 'RETRY_REQUESTED':
      // The visible outage stays until the retried socket delivers a tick.
      return state;
    case 'EVALUATE':
      return evaluateBoundHealth(state, event.now);
  }
};

export const feedHealthCanSafelyRetry = (state: FeedHealthState): boolean =>
  Boolean(
    state.identity &&
    state.transportConfigured &&
    state.credentialApproved &&
    (
      state.status === 'stale_or_degraded' ||
      state.status === 'reconnecting' ||
      state.status === 'provider_down' ||
      state.status === 'market_unavailable'
    ),
  );

/**
 * Session-level states that must never be followed by a socket open. The
 * status endpoint never blocks the socket (contract v3): only a missing
 * session/transport does.
 */
export const feedHealthBlocksSocketConnection = (
  state: FeedHealthState,
  identity: FeedHealthIdentity,
): boolean => Boolean(
  !sameFeedHealthIdentity(state.identity, identity) ||
  !state.transportConfigured ||
  !state.credentialApproved ||
  state.status === 'disabled_unconfigured',
);

/**
 * Price actions need a fresh, acceptable websocket tick for this exact
 * session. The status endpoint cannot unlock or lock them on its own.
 */
export const feedHealthAllowsFreshQuoteFallback = (
  state: FeedHealthState,
  identity: FeedHealthIdentity,
  now: number = Date.now(),
): boolean => Boolean(
  sameFeedHealthIdentity(state.identity, identity) &&
  feedHealthAllowsPriceActions(state, now),
);

export const feedHealthAllowsPriceActions = (
  state: FeedHealthState,
  now: number = Date.now(),
): boolean => {
  if (
    !state.identity ||
    !state.transportConfigured ||
    !state.credentialApproved ||
    state.marketSchedule === 'scheduled_closed'
  ) {
    return false;
  }
  const evaluatedAt = finiteTimestamp(now);
  return Boolean(evaluatedAt && hasFreshAcceptableTick(state, evaluatedAt));
};

/** Useful for tests and UI guards that must not display another broker's state. */
export const feedHealthStateMatchesIdentity = (
  state: FeedHealthState,
  identity: FeedHealthIdentity,
): boolean => sameFeedHealthIdentity(state.identity, identity);

/**
 * Internal equality helper used by the runtime to avoid redundant subscriber
 * notifications. Deliberately ignores the bookkeeping timestamps
 * (lastServerStatusAt / lastLocalTickAt / lastSuccessAt): they move on every
 * websocket tick. Staleness still surfaces as a status transition through the
 * runtime's scheduled EVALUATE events.
 */
export const areFeedHealthStatesEquivalent = (
  left: FeedHealthState,
  right: FeedHealthState,
): boolean =>
  left === right || (
    sameFeedHealthIdentity(left.identity, right.identity) &&
    left.status === right.status &&
    left.reasonCategory === right.reasonCategory &&
    left.transportConfigured === right.transportConfigured &&
    left.credentialApproved === right.credentialApproved &&
    left.marketSchedule === right.marketSchedule &&
    left.serverVerdict === right.serverVerdict &&
    left.transportInterrupted === right.transportInterrupted &&
    left.localTickAcceptable === right.localTickAcceptable &&
    left.thresholds?.localTickStaleAfterMs === right.thresholds?.localTickStaleAfterMs &&
    left.thresholds?.serverStatusStaleAfterMs === right.thresholds?.serverStatusStaleAfterMs
  );
