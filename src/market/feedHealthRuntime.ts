import {
  areFeedHealthStatesEquivalent,
  feedHealthCanSafelyRetry,
  initialFeedHealthState,
  reduceFeedHealth,
  resolveLocalTickStaleAfterMs,
  sameFeedHealthIdentity,
  type FeedHealthEvent,
  type FeedHealthIdentity,
  type FeedHealthState,
  type FeedHealthThresholds,
  type FeedServerStatus,
} from './feedHealthState';
import { recordMarketDataEvent } from './marketDataTelemetry';

type FeedHealthListener = () => void;

/**
 * Two views of one state machine:
 * - `latestState` always carries the newest reduction (tick/success timestamps
 *   included) and drives the reducer + freshness deadlines.
 * - `snapshot` is what React subscribers read. It only advances on meaningful
 *   transitions, so a 40Hz tick stream neither notifies every subscribed
 *   screen nor breaks useSyncExternalStore's stable-snapshot contract.
 */
let snapshot: FeedHealthState = initialFeedHealthState;
let latestState: FeedHealthState = initialFeedHealthState;
let evaluationTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<FeedHealthListener>();

const clearEvaluationTimer = (): void => {
  if (evaluationTimer) {
    clearTimeout(evaluationTimer);
    evaluationTimer = null;
  }
};

const scheduleFreshnessEvaluation = (): void => {
  clearEvaluationTimer();
  // Only a healthy (fresh-tick) state can age out on its own: 8 s after the
  // last accepted tick it turns stale so prices are greyed. The socket is not
  // touched; the quote service owns reconnect decisions.
  if (
    !latestState.identity ||
    latestState.status !== 'healthy' ||
    !latestState.lastLocalTickAt
  ) {
    return;
  }

  const deadlines = [
    latestState.lastLocalTickAt + resolveLocalTickStaleAfterMs(latestState),
  ];
  const now = Date.now();
  const nextDeadline = Math.min(...deadlines.filter((deadline) => deadline > now));
  if (!Number.isFinite(nextDeadline)) {
    return;
  }

  const expectedIdentity = latestState.identity;
  evaluationTimer = setTimeout(() => {
    evaluationTimer = null;
    dispatchFeedHealthEvent({
      type: 'EVALUATE',
      identity: expectedIdentity,
      now: Date.now(),
    });
  }, Math.max(0, nextDeadline - now));
};

const publish = (next: FeedHealthState): void => {
  latestState = next;
  if (areFeedHealthStatesEquivalent(snapshot, next)) {
    // Bookkeeping-only change (tick/success timestamps moved, nothing a
    // subscriber renders differently). Keep the public snapshot identity so
    // React neither re-renders every subscribed screen per tick nor fails
    // useSyncExternalStore consistency checks on an un-notified swap.
    scheduleFreshnessEvaluation();
    return;
  }
  const previous = snapshot;
  snapshot = next;
  recordMarketDataEvent('health_transition', {
    from: previous.status,
    to: next.status,
    reason: next.reasonCategory,
    brokerId: next.identity?.brokerId,
    sessionEpoch: next.identity?.sessionEpoch,
  });
  scheduleFreshnessEvaluation();
  for (const listener of [...listeners]) {
    listener();
  }
};

export const dispatchFeedHealthEvent = (event: FeedHealthEvent): FeedHealthState => {
  publish(reduceFeedHealth(latestState, event));
  return latestState;
};

/**
 * Always-fresh state for decision logic (trade gating, socket recovery).
 * Timestamps here move on every tick — never hand this to useSyncExternalStore.
 */
export const getFeedHealthSnapshot = (): FeedHealthState => latestState;

/**
 * Notify-gated state for React subscribers: identity only changes when
 * listeners are notified, which useSyncExternalStore requires. Renders that
 * need live freshness decisions must call the logic helpers (which read the
 * fresh snapshot) rather than compare these timestamps.
 */
export const getFeedHealthRenderSnapshot = (): FeedHealthState => snapshot;

export const subscribeFeedHealth = (listener: FeedHealthListener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export type BindFeedHealthSessionInput = Readonly<{
  identity: FeedHealthIdentity;
  transportConfigured: boolean;
  credentialApproved: boolean;
  /**
   * Omit to preserve a previously approved policy for this exact identity.
   * Pass null only when the contract is explicitly absent/revoked.
   */
  thresholds?: FeedHealthThresholds | null;
}>;

export const bindFeedHealthSession = (input: BindFeedHealthSessionInput): FeedHealthState =>
  dispatchFeedHealthEvent({ type: 'BIND_SESSION', ...input });

export const unbindFeedHealthSession = (): FeedHealthState =>
  dispatchFeedHealthEvent({ type: 'UNBIND_SESSION' });

export const reportFeedConnecting = (identity: FeedHealthIdentity): FeedHealthState =>
  dispatchFeedHealthEvent({ type: 'CONNECTING', identity });

export const reportFeedLocalTick = (
  identity: FeedHealthIdentity,
  tick: Readonly<{
    receivedAt: number;
    bid: number;
    ask: number;
    transport: 'websocket' | 'rest_snapshot' | undefined;
    stale?: boolean;
    degraded?: boolean;
  }>,
): FeedHealthState => dispatchFeedHealthEvent({ type: 'LOCAL_TICK', identity, ...tick });

/** Diagnostic /ws/feed/status verdict. Live ticks still win over it. */
export const reportFeedServerStatus = (
  identity: FeedHealthIdentity,
  health: FeedServerStatus,
): FeedHealthState => dispatchFeedHealthEvent({ type: 'SERVER_STATUS', identity, health });

/** Transport close. The quote feed has no auth, so there is no auth latch. */
export const reportFeedSocketClosed = (
  identity: FeedHealthIdentity,
): FeedHealthState => dispatchFeedHealthEvent({ type: 'SOCKET_CLOSED', identity });

/** Re-evaluate freshness now (used by the quote watchdog after silence). */
export const reportFeedSilence = (
  identity: FeedHealthIdentity,
  now: number = Date.now(),
): FeedHealthState => dispatchFeedHealthEvent({ type: 'EVALUATE', identity, now });

/** Must be called only after an approved credential refresh has committed. */
export const reportFeedCredentialsRefreshed = (
  identity: FeedHealthIdentity,
): FeedHealthState => dispatchFeedHealthEvent({ type: 'CREDENTIALS_REFRESHED', identity });

/**
 * Returns true only once the exact active identity has entered a retriable
 * state. The caller owns one bounded reconnect attempt; this module never
 * creates a second endpoint or recovery loop.
 */
export const requestFeedHealthRetry = (identity: FeedHealthIdentity): boolean => {
  if (!sameFeedHealthIdentity(latestState.identity, identity) || !feedHealthCanSafelyRetry(latestState)) {
    return false;
  }
  // The reducer deliberately preserves the truthful outage state until the
  // transport's one bounded server-health probe succeeds.
  dispatchFeedHealthEvent({ type: 'RETRY_REQUESTED', identity });
  return true;
};

export const __resetFeedHealthRuntimeForTests = (): void => {
  clearEvaluationTimer();
  snapshot = initialFeedHealthState;
  latestState = initialFeedHealthState;
  listeners.clear();
};
