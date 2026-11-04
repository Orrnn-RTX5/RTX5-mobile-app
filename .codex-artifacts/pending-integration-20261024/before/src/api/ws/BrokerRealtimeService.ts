import { brokerApi } from '../brokerApi';
import { AppState } from 'react-native';
import { useLiveAccountState } from '../../state/liveAccountState';
import { usePositionsState } from '../../state/positionsState';
import { appQueryClient } from '../../state/providers/AppProviders';
import {
  captureActiveBrokerSession,
  captureActiveBrokerSessionOwnerStamp,
  getActiveBrokerSessionIdentity,
  isActiveBrokerSessionCurrent,
  isActiveBrokerSessionOwnerStampCurrent,
  subscribeActiveBrokerSession,
  type ActiveBrokerSessionIdentity,
  type ActiveBrokerSessionOwnerStamp,
} from '../../state/activeBrokerSession';
import { isSocketAuthenticationFailure } from './socketClosePolicy';
import { payloadMatchesSocketIdentity } from './socketPayloadIdentity';
import {
  hasStableConnectionSucceeded,
  resolveFullJitterBackoffMs,
} from './reconnectBackoff';
import { redactDiagnosticValue } from '../../utils/securityRedaction';
import { invalidateSessionQueryRoots } from '../../query/authenticatedQueryScope';
import {
  filterRealtimePositionRows,
  resolveProtectionChangeHintTickets,
} from './realtimePositionPolicy';
import { extractLiveAccountMetrics } from './accountSocket.helpers';
import {
  notifyModifyPositionSocketHint,
  notifyModifyPositionSocketSubscription,
} from '../../features/trade/modifyPositionCoordinator';
import { hasProtectedPositionsMutation } from '../../state/positionsMutationBarrier';
import { isTerminalPositionUpdate } from '../../state/positionsState.helpers';
import {
  recordProtectionTriggeredJournalEvent,
  recordTerminalExecutionEvent,
} from '../../state/terminalJournalState';
import {
  normalizeProtectionTriggeredEvent,
  type NormalizedProtectionTriggeredEvent,
} from './protectionTriggeredEvent';
import {
  buildTradeSocketSubscriptionMessages,
  classifyPositionEvent,
  isAccountChangingPositionEvent,
  isHistoryChangingPositionEvent,
  isMetricsEventName,
  parseTradeSocketFrame,
  readPositionCloseReason,
  shouldCycleTradeSocketForSessionEvent,
} from './tradeSocketProtocol';

/** Recoverable transport diagnostics: dev builds only, console.log (no LogBox toast). */
const logBrokerRealtimeDiagnostic = (...args: unknown[]): void => {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(...args.map(redactDiagnosticValue));
  }
};

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;
const STABLE_CONNECTION_MS = 10_000;
const POSITIONS_RECONCILE_COOLDOWN_MS = 5_000;
const HISTORY_INVALIDATION_COALESCE_MS = 250;
const HISTORY_INVALIDATION_COOLDOWN_MS = 1_000;
const AUTH_SESSION_UNAVAILABLE_PATTERN =
  /No authenticated broker session available|Refresh token invalid or expired|No refresh token available/i;
const HISTORY_CACHE_KEYS = [
  'positionHistory',
  'deals',
  'accountDeals',
] as const;
const LIFECYCLE_NON_HISTORY_CACHE_KEYS = [
  'accountSummary',
  'ordersByLogin',
  'accountOrders',
] as const;
const TERMINAL_EVENT_DEDUPE_LIMIT = 500;
const HISTORY_EVENT_PATTERN = /(^|\.)(deal|deals|history)(\.|$)/;
const SOCKET_CONTROL_EVENT_PATTERN =
  /(^|\.)(ack|heartbeat|ping|pong|subscribe|subscribed|subscription|unsubscribe|unsubscribed)(\.|$)/;

/**
 * Contract v3: `positions.<login>` and `metrics.<login>` only, one channel per
 * message. `deals.<login>` is dropped; `position_closed` refreshes history instead.
 */
export const buildBrokerRealtimeSubscriptionMessages = (
  accountLogin: string | number,
): ReadonlyArray<Readonly<{ action: 'subscribe'; channel: string }>> =>
  buildTradeSocketSubscriptionMessages(accountLogin);

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const normalizeChannel = (value: unknown): string => String(value ?? '').trim();

const normalizeEventName = (value: unknown): string =>
  normalizeChannel(value)
    .toLowerCase()
    .replace(/[_-]+/g, '.');

const isHistoryPayloadEvent = (
  channel: string,
  eventName: string,
  statusName: string,
): boolean => {
  if (
    SOCKET_CONTROL_EVENT_PATTERN.test(eventName) ||
    SOCKET_CONTROL_EVENT_PATTERN.test(statusName)
  ) {
    return false;
  }

  // `deals.*` / `history.*` are no longer subscribed (contract v3) but remain
  // tolerated if a deployment still publishes them.
  return (
    channel.startsWith('deals.') ||
    channel.startsWith('history.') ||
    HISTORY_EVENT_PATTERN.test(eventName)
  );
};

const numberFrom = (...values: unknown[]): number | undefined => {
  for (const value of values) {
    // Skip absent/blank fields BEFORE Number(): Number(null), Number(undefined →
    // NaN handled), and Number('') all coerce to 0, which would record a fake 0
    // (e.g. balance/margin) and mark the metric as "present". Only treat genuine
    // numeric values as found; otherwise fall through to the next candidate.
    if (value === null || value === undefined) {
      continue;
    }
    if (typeof value === 'string' && value.trim() === '') {
      continue;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return undefined;
};

const isAuthSessionUnavailable = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return AUTH_SESSION_UNAVAILABLE_PATTERN.test(message);
};

export const stripUnversionedPositionProtection = (
  row: Record<string, unknown>,
): Record<string, unknown> => {
  const {
    price_sl: _priceSl,
    price_tp: _priceTp,
    sl: _sl,
    tp: _tp,
    status: _status,
    state: _state,
    position_state: _positionState,
    positionStatus: _positionStatus,
    action: _action,
    event: _event,
    type: _type,
    ...safe
  } = row;
  return safe;
};

const resolvePositionHintTickets = (
  rows: ReadonlyArray<Record<string, unknown>>,
  currentPositions: Parameters<typeof resolveProtectionChangeHintTickets>[1],
): Array<string | number> => {
  const tickets = new Map<string, string | number>();
  for (const ticket of resolveProtectionChangeHintTickets(rows, currentPositions)) {
    tickets.set(String(ticket), ticket);
  }
  for (const row of rows) {
    if (!isTerminalPositionUpdate(row)) continue;
    const ticket = row.ticket ?? row.position_ticket;
    if (typeof ticket === 'string' || typeof ticket === 'number') {
      tickets.set(String(ticket), ticket);
    }
  }
  return [...tickets.values()];
};

const sameIdentity = (
  left: ActiveBrokerSessionIdentity | null,
  right: ActiveBrokerSessionIdentity,
): boolean => Boolean(
  left &&
  left.brokerId === right.brokerId &&
  left.accountLogin === right.accountLogin &&
  left.sessionEpoch === right.sessionEpoch,
);

const sameOwnerStamp = (
  left: ActiveBrokerSessionOwnerStamp | null,
  right: ActiveBrokerSessionOwnerStamp,
): boolean => Boolean(
  left &&
  left.brokerId === right.brokerId &&
  left.accountLogin === right.accountLogin &&
  left.apiBase === right.apiBase &&
  left.cacheNamespace === right.cacheNamespace &&
  left.sessionEpoch === right.sessionEpoch &&
  left.credentialGeneration === right.credentialGeneration &&
  left.credentialIdentity === right.credentialIdentity,
);

class BrokerRealtimeService {
  private static instance: BrokerRealtimeService | null = null;
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stableConnectionTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private shouldReconnect = false;
  private isSuspended = AppState.currentState !== 'active';
  private isOpening = false;
  private activeIdentity: ActiveBrokerSessionIdentity | null = null;
  private activeOwnerStamp: ActiveBrokerSessionOwnerStamp | null = null;
  private activeChannels: string[] = [];
  private connectedAt = 0;
  private acceptedPayloadCount = 0;
  private positionsReconcileTimer: ReturnType<typeof setTimeout> | null = null;
  private positionsReconcileSocket: WebSocket | null = null;
  private positionsReconcileIdentity: ActiveBrokerSessionIdentity | null = null;
  private positionsReconcileOwnerStamp: ActiveBrokerSessionOwnerStamp | null = null;
  private lastPositionsReconcileAt = 0;
  private historyInvalidationTimer: ReturnType<typeof setTimeout> | null = null;
  private historyInvalidationInFlight = false;
  private historyInvalidationPending = false;
  private historyInvalidationEpoch = 0;
  private lastHistoryInvalidationAt = 0;
  private readonly processedTerminalEvents = new Set<string>();
  /** Set when credentials rotate while a URL resolution is in flight. */
  private pendingCredentialCycle = false;

  private constructor() {
    subscribeActiveBrokerSession((event) => {
      // /ws/v2 authenticates only at upgrade time and never re-checks the
      // token. brokerApi's refresh path commits every rotated token through
      // updateActiveBrokerSessionCredentials(), which emits
      // `credentials_updated`; close and reopen with the new token each time.
      if (!shouldCycleTradeSocketForSessionEvent(event, this.shouldReconnect) || !event.activeSession) {
        return;
      }
      const identity = getActiveBrokerSessionIdentity(event.activeSession);
      if (!isActiveBrokerSessionCurrent(identity)) {
        return;
      }
      this.reconnect();
    });
  }

  static getInstance(): BrokerRealtimeService {
    if (!BrokerRealtimeService.instance) {
      BrokerRealtimeService.instance = new BrokerRealtimeService();
    }
    return BrokerRealtimeService.instance;
  }

  connect(): void {
    const identity = this.resolveIdentity();
    if (!identity) {
      this.pauseUntilNextLogin();
      return;
    }
    this.shouldReconnect = true;
    this.activeChannels = this.resolveChannels(identity);
    if (this.isSuspended) {
      return;
    }
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      if (sameIdentity(this.activeIdentity, identity)) {
        this.subscribe(identity);
        return;
      }
      this.teardownSocket();
    }
    void this.open(identity);
  }

  reconnect(): void {
    const identity = this.resolveIdentity();
    if (!identity) {
      this.pauseUntilNextLogin();
      return;
    }
    if (!this.shouldReconnect) {
      this.shouldReconnect = true;
    }
    if (this.isSuspended) {
      return;
    }
    if (this.isOpening) {
      this.pendingCredentialCycle = true;
    }
    this.clearReconnectTimer();
    this.teardownSocket();
    this.activeChannels = this.resolveChannels(identity);
    void this.open(identity);
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.reconnectAttempts = 0;
    this.activeChannels = [];
    this.clearReconnectTimer();
    this.clearPositionsReconcileTimer(true);
    this.teardownSocket();
  }

  /** Pause transport work without dropping lifecycle demand or cached state. */
  suspend(): void {
    if (this.isSuspended) return;
    this.isSuspended = true;
    this.clearReconnectTimer();
    this.teardownSocket();
  }

  /** Resume only the demand that existed before the app left the foreground. */
  resume(): void {
    if (!this.isSuspended) return;
    this.isSuspended = false;
    if (!this.shouldReconnect) return;
    const identity = this.resolveIdentity();
    if (!identity) {
      this.pauseUntilNextLogin();
      return;
    }
    this.activeChannels = this.resolveChannels(identity);
    void this.open(identity);
  }

  private async open(identity: ActiveBrokerSessionIdentity): Promise<void> {
    if (
      !this.shouldReconnect ||
      this.isSuspended ||
      !isActiveBrokerSessionCurrent(identity) ||
      this.isOpening
    ) {
      return;
    }

    this.isOpening = true;
    try {
      const wsUrl = await brokerApi.getWebSocketUrl();
      this.isOpening = false;
      const ownerStamp = captureActiveBrokerSessionOwnerStamp();
      if (
        this.isSuspended ||
        !this.shouldReconnect ||
        !ownerStamp ||
        // A credential rotation that raced the URL resolution may have put a
        // superseded token into wsUrl; resolve again with the current token.
        this.consumePendingCredentialCycle() ||
        !isActiveBrokerSessionCurrent(identity) ||
        ownerStamp.brokerId !== identity.brokerId ||
        ownerStamp.accountLogin !== identity.accountLogin ||
        ownerStamp.sessionEpoch !== identity.sessionEpoch
      ) {
        const current = this.resolveIdentity();
        if (this.shouldReconnect && current) void this.open(current);
        return;
      }
      const socket = new WebSocket(wsUrl);
      this.ws = socket;
      this.activeIdentity = identity;
      this.activeOwnerStamp = ownerStamp;

      socket.onopen = () => {
        if (
          this.ws !== socket ||
          !isActiveBrokerSessionCurrent(identity) ||
          !isActiveBrokerSessionOwnerStampCurrent(ownerStamp)
        ) {
          socket.close();
          return;
        }
        this.activeChannels = this.resolveChannels(identity);
        this.connectedAt = Date.now();
        this.acceptedPayloadCount = 0;
        this.startHeartbeat(identity);
        this.startStableConnectionTimer(socket, identity);
        this.subscribe(identity);
        this.schedulePositionsReconciliation(identity);
        this.invalidateLifecycleQueryRoots(identity);
      };

      socket.onmessage = (event) => {
        if (
          this.ws !== socket ||
          !isActiveBrokerSessionCurrent(identity) ||
          !isActiveBrokerSessionOwnerStampCurrent(ownerStamp)
        ) return;
        try {
          const accepted = this.handleMessage(JSON.parse(event.data as string), identity);
          if (accepted) {
            this.acceptedPayloadCount += 1;
            if (hasStableConnectionSucceeded({
              connectedAt: this.connectedAt,
              now: Date.now(),
              acceptedPayloadCount: this.acceptedPayloadCount,
              stableAfterMs: STABLE_CONNECTION_MS,
            })) {
              this.markConnectionHealthy();
            }
          }
        } catch (error) {
          logBrokerRealtimeDiagnostic('[BrokerRealtime] Failed to parse message', error);
        }
      };

      socket.onclose = (event) => {
        if (this.ws !== socket) return;
        this.stopHeartbeat();
        this.clearStableConnectionTimer();
        this.clearHistoryQueryInvalidation();
        this.ws = null;
        this.activeIdentity = null;
        this.activeOwnerStamp = null;
        this.connectedAt = 0;
        this.acceptedPayloadCount = 0;
        if (isSocketAuthenticationFailure(event?.code)) {
          this.pauseUntilNextLogin();
          return;
        }
        if (isActiveBrokerSessionCurrent(identity)) this.scheduleReconnect(identity);
      };

      socket.onerror = () => {
        // onclose performs reconnect scheduling on React Native.
      };
    } catch (error) {
      this.isOpening = false;
      if (isAuthSessionUnavailable(error)) {
        this.pauseUntilNextLogin();
        return;
      }
      logBrokerRealtimeDiagnostic('[BrokerRealtime] Connection failed', error);
      if (isActiveBrokerSessionCurrent(identity)) this.scheduleReconnect(identity);
    }
  }

  private consumePendingCredentialCycle(): boolean {
    const pending = this.pendingCredentialCycle;
    this.pendingCredentialCycle = false;
    return pending;
  }

  private resolveChannels(identity: ActiveBrokerSessionIdentity): string[] {
    return buildBrokerRealtimeSubscriptionMessages(identity.accountLogin)
      .map((message) => message.channel);
  }

  private subscribe(identity: ActiveBrokerSessionIdentity): void {
    if (
      this.ws?.readyState !== WebSocket.OPEN ||
      this.activeChannels.length === 0 ||
      !sameIdentity(this.activeIdentity, identity) ||
      !isActiveBrokerSessionCurrent(identity)
    ) {
      return;
    }

    this.activeChannels.forEach((channel) => {
      this.send({ action: 'subscribe', channel });
    });
    notifyModifyPositionSocketSubscription();
  }

  private handleMessage(payload: unknown, identity: ActiveBrokerSessionIdentity): boolean {
    if (
      !sameIdentity(this.activeIdentity, identity) ||
      !isActiveBrokerSessionCurrent(identity) ||
      !payloadMatchesSocketIdentity(payload, identity)
    ) {
      return false;
    }
    const record = asRecord(payload);
    if (!record) {
      return false;
    }

    const frame = parseTradeSocketFrame(record);
    if (frame.kind === 'pong' || frame.kind === 'ack') {
      // Liveness evidence only; subscriptions need no client-side bookkeeping.
      return true;
    }
    if (frame.kind === 'error') {
      logBrokerRealtimeDiagnostic('[BrokerRealtime] Channel error', {
        channel: frame.channel,
        message: frame.message,
      });
      return false;
    }
    if (frame.kind !== 'event') {
      return false;
    }

    const channel = normalizeChannel(frame.channel);
    const eventName = frame.eventName;
    if (frame.clientOrderId) {
      // The terminal's execution confirmation for a command this phone sent:
      // journal it as the Terminal "Order/Close executed" row. Journaling
      // never affects how the event itself is applied below.
      try {
        recordTerminalExecutionEvent(frame.clientOrderId, eventName, frame.payload);
      } catch {
        // Best-effort diagnostics only.
      }
    }
    // Nested contract: the envelope is `data` ({event_id, type, data}) and the
    // row(s) live in `data.data`. Flat legacy frames pass their data object.
    const data = frame.nested ? frame.envelope : frame.payload;
    const dataRecord = asRecord(frame.payload) ?? frame.envelope;
    const statusName =
      normalizeEventName(dataRecord?.status) ||
      normalizeEventName(record.status);

    let accepted = false;
    const isMetricsFrame = channel.startsWith('metrics.') || isMetricsEventName(eventName);
    if (
      !isMetricsFrame &&
      (channel.startsWith('positions.') ||
        eventName.includes('position') ||
        classifyPositionEvent(eventName) !== 'unknown')
    ) {
      accepted = this.handlePositions(data, eventName, identity) || accepted;
    }

    if (isMetricsFrame) {
      // The server sends a metrics snapshot right after subscribe. Fields whose
      // server calculation failed are absent, so the live store keeps the last
      // values instead of receiving fake zeros.
      accepted = this.handleAccount(
        dataRecord ?? record,
        identity,
        eventName === 'metrics.update',
      ) || accepted;
    }

    // Contract v3 drops `deals.LOGIN`: a closing/partial-closing position
    // event is the history refresh signal. Legacy `deals.`/`history.`
    // envelopes are still tolerated if a deployment publishes them.
    if (
      isHistoryChangingPositionEvent(eventName) ||
      isHistoryPayloadEvent(channel, eventName, statusName)
    ) {
      this.scheduleHistoryQueryInvalidation(identity);
      accepted = true;
    }
    return accepted;
  }

  private handlePositions(
    data: unknown,
    eventName: string,
    identity: ActiveBrokerSessionIdentity,
  ): boolean {
    if (Array.isArray(data)) {
      this.applyRealtimePositionsBatch(data, eventName, identity);
      return true;
    }

    const record = asRecord(data);
    if (!record) {
      return false;
    }

    const protectionTriggered = normalizeProtectionTriggeredEvent(record, eventName);
    if (protectionTriggered) {
      return this.handleProtectionTriggered(protectionTriggered, identity);
    }

    const positions = record.positions ?? record.items ?? record.data;
    if (Array.isArray(positions)) {
      this.applyRealtimePositionsBatch(positions, eventName, identity, record);
      return true;
    }

    const positionEventKind = classifyPositionEvent(eventName);
    if (positionEventKind === 'partial_close' || positionEventKind === 'account') {
      // position_partial_close rows do not guarantee remaining-volume
      // semantics and margin_call carries account data: reconcile from REST.
      this.schedulePositionsReconciliation(identity);
      this.invalidateLifecycleQueries(eventName, identity);
      return true;
    }

    if (positionEventKind === 'closed') {
      const closedRow = asRecord(record.data) ?? record;
      if (this.handlePositionClosed(closedRow, identity)) {
        return true;
      }
    }

    const lifecycleHints = this.getLifecycleHints(record, eventName);
    const nestedPosition =
      asRecord(record.position) ??
      asRecord(record.item) ??
      asRecord(record.data);
    if (nestedPosition) {
      this.applyRealtimePositionUpdate({
        ...lifecycleHints,
        ...nestedPosition,
        ticket: nestedPosition.ticket ?? lifecycleHints.ticket,
        position_ticket: nestedPosition.position_ticket ?? lifecycleHints.position_ticket ?? lifecycleHints.ticket,
      }, identity);
      this.invalidateLifecycleQueries(eventName, identity);
      return true;
    }

    this.applyRealtimePositionUpdate({
      ...lifecycleHints,
      ...record,
    }, identity);
    this.invalidateLifecycleQueries(eventName, identity);
    return true;
  }

  /**
   * Explicit `position_closed` (manual close, stop-out). SL/TP hits are routed
   * through handleProtectionTriggered first. Netting closes/reversals may keep
   * the ticket alive on netting accounts, so they only reconcile from REST.
   * Returns false when the row has no usable ticket (caller falls back).
   */
  private handlePositionClosed(
    row: Record<string, unknown>,
    identity: ActiveBrokerSessionIdentity,
  ): boolean {
    const rawTicket = row.ticket ?? row.position_ticket;
    const ticket = typeof rawTicket === 'number' || typeof rawTicket === 'string'
      ? String(rawTicket).trim()
      : '';
    if (!/^\d+$/.test(ticket) || !/[1-9]/.test(ticket)) {
      return false;
    }
    const closeReason = readPositionCloseReason(row);
    if (closeReason !== 'netting_close' && closeReason !== 'netting_reverse') {
      usePositionsState.getState().finishOptimisticClose(ticket);
    }
    notifyModifyPositionSocketHint([rawTicket as string | number], identity.accountLogin);
    this.schedulePositionsReconciliation(identity);
    this.invalidateLifecycleQueryRoots(identity);
    return true;
  }

  private handleProtectionTriggered(
    terminalEvent: NormalizedProtectionTriggeredEvent,
    identity: ActiveBrokerSessionIdentity,
  ): boolean {
    if (!isActiveBrokerSessionCurrent(identity)) {
      return false;
    }

    const dedupeKey = [
      identity.brokerId,
      identity.accountLogin,
      identity.sessionEpoch,
      terminalEvent.eventFingerprint,
    ].join(':');
    if (this.processedTerminalEvents.has(dedupeKey)) {
      return true;
    }
    this.processedTerminalEvents.add(dedupeKey);
    if (this.processedTerminalEvents.size > TERMINAL_EVENT_DEDUPE_LIMIT) {
      const oldest = this.processedTerminalEvents.values().next().value;
      if (oldest !== undefined) {
        this.processedTerminalEvents.delete(oldest);
      }
    }

    usePositionsState.getState().finishOptimisticClose(terminalEvent.ticket);
    notifyModifyPositionSocketHint(
      [terminalEvent.ticket],
      identity.accountLogin,
    );
    recordProtectionTriggeredJournalEvent(
      terminalEvent.journalPayload,
      identity.accountLogin,
    );
    this.schedulePositionsReconciliation(identity);
    this.invalidateLifecycleQueryRoots(identity);
    return true;
  }

  private applyRealtimePositionsBatch(
    rows: unknown[],
    eventName: string,
    identity: ActiveBrokerSessionIdentity,
    envelope?: Record<string, unknown>,
  ): void {
    const positionsState = usePositionsState.getState();
    const { acceptedRows, rejectedRows } = filterRealtimePositionRows(
      rows,
      positionsState.positions,
    );
    notifyModifyPositionSocketHint(
      resolvePositionHintTickets(acceptedRows, positionsState.positions),
      identity.accountLogin,
    );
    if (rejectedRows > 0) {
      this.schedulePositionsReconciliation(identity);
    }
    const hasTerminalPosition = acceptedRows.some(isTerminalPositionUpdate);
    if (hasTerminalPosition) {
      this.schedulePositionsReconciliation(identity);
      this.scheduleHistoryQueryInvalidation(identity);
    }

    // Current positions websocket messages are unversioned hints. They may
    // update live non-protection fields, but cannot confirm SL/TP or delete a
    // ticket by array absence. Only an eligible REST reconciliation may do so.
    positionsState.applyPositionsSnapshot(
      acceptedRows.map(stripUnversionedPositionProtection),
      identity.accountLogin,
      {
        preserveMissingExisting: true,
      },
    );
    this.invalidateLifecycleQueries(
      eventName || normalizeEventName(envelope?.event ?? envelope?.type ?? envelope?.action),
      identity,
    );
  }

  private applyRealtimePositionUpdate(
    row: Record<string, unknown>,
    identity: ActiveBrokerSessionIdentity,
  ): void {
    const positionsState = usePositionsState.getState();
    const { acceptedRows, rejectedRows } = filterRealtimePositionRows(
      [row],
      positionsState.positions,
    );
    if (rejectedRows > 0) {
      this.schedulePositionsReconciliation(identity);
      return;
    }

    if (acceptedRows[0]) {
      notifyModifyPositionSocketHint(
        resolvePositionHintTickets(acceptedRows, positionsState.positions),
        identity.accountLogin,
      );
      if (isTerminalPositionUpdate(acceptedRows[0])) {
        this.schedulePositionsReconciliation(identity);
        this.scheduleHistoryQueryInvalidation(identity);
      }
      positionsState.upsertPosition(stripUnversionedPositionProtection(acceptedRows[0]));
    }
  }

  private schedulePositionsReconciliation(identity: ActiveBrokerSessionIdentity): void {
    const socket = this.ws;
    const ownerStamp = this.activeOwnerStamp;
    if (
      !socket ||
      !ownerStamp ||
      !sameIdentity(this.activeIdentity, identity) ||
      !isActiveBrokerSessionOwnerStampCurrent(ownerStamp)
    ) {
      return;
    }

    if (this.positionsReconcileTimer) {
      if (
        this.positionsReconcileSocket === socket &&
        sameIdentity(this.positionsReconcileIdentity, identity) &&
        sameOwnerStamp(this.positionsReconcileOwnerStamp, ownerStamp)
      ) {
        return;
      }
      clearTimeout(this.positionsReconcileTimer);
      this.positionsReconcileTimer = null;
    }

    if (
      this.positionsReconcileSocket !== socket ||
      !sameIdentity(this.positionsReconcileIdentity, identity) ||
      !sameOwnerStamp(this.positionsReconcileOwnerStamp, ownerStamp)
    ) {
      this.positionsReconcileSocket = socket;
      this.positionsReconcileIdentity = identity;
      this.positionsReconcileOwnerStamp = ownerStamp;
      this.lastPositionsReconcileAt = 0;
    }

    const delayMs = Math.max(
      0,
      this.lastPositionsReconcileAt + POSITIONS_RECONCILE_COOLDOWN_MS - Date.now(),
    );
    const reconcileTimer = setTimeout(() => {
      if (this.positionsReconcileTimer !== reconcileTimer) {
        return;
      }
      this.positionsReconcileTimer = null;
      const currentIdentity = this.resolveIdentity();
      if (
        !currentIdentity ||
        this.ws !== socket ||
        this.positionsReconcileSocket !== socket ||
        !sameIdentity(currentIdentity, identity) ||
        !isActiveBrokerSessionCurrent(identity) ||
        !sameOwnerStamp(this.positionsReconcileOwnerStamp, ownerStamp) ||
        !sameOwnerStamp(this.activeOwnerStamp, ownerStamp) ||
        !isActiveBrokerSessionOwnerStampCurrent(ownerStamp)
      ) {
        this.positionsReconcileSocket = null;
        this.positionsReconcileIdentity = null;
        this.positionsReconcileOwnerStamp = null;
        this.lastPositionsReconcileAt = 0;
        return;
      }

      this.lastPositionsReconcileAt = Date.now();
      if (hasProtectedPositionsMutation()) {
        notifyModifyPositionSocketHint(undefined, identity.accountLogin);
        return;
      }
      void usePositionsState.getState().refreshPositions(identity.accountLogin);
    }, delayMs);
    this.positionsReconcileTimer = reconcileTimer;
  }

  private clearPositionsReconcileTimer(resetIdentity = false): void {
    if (this.positionsReconcileTimer) {
      clearTimeout(this.positionsReconcileTimer);
      this.positionsReconcileTimer = null;
    }
    if (resetIdentity) {
      this.positionsReconcileSocket = null;
      this.positionsReconcileIdentity = null;
      this.positionsReconcileOwnerStamp = null;
      this.lastPositionsReconcileAt = 0;
    }
  }

  private scheduleHistoryQueryInvalidation(
    identity: ActiveBrokerSessionIdentity,
  ): void {
    const socket = this.ws;
    const ownerStamp = this.activeOwnerStamp;
    if (
      !socket ||
      socket.readyState !== WebSocket.OPEN ||
      !ownerStamp ||
      !sameIdentity(this.activeIdentity, identity) ||
      !isActiveBrokerSessionCurrent(identity) ||
      !isActiveBrokerSessionOwnerStampCurrent(ownerStamp)
    ) {
      return;
    }

    this.historyInvalidationPending = true;
    if (this.historyInvalidationTimer || this.historyInvalidationInFlight) {
      return;
    }

    this.armHistoryQueryInvalidation(
      socket,
      identity,
      ownerStamp,
      this.historyInvalidationEpoch,
    );
  }

  private armHistoryQueryInvalidation(
    socket: WebSocket,
    identity: ActiveBrokerSessionIdentity,
    ownerStamp: ActiveBrokerSessionOwnerStamp,
    epoch: number,
  ): void {
    if (
      epoch !== this.historyInvalidationEpoch ||
      !this.historyInvalidationPending ||
      this.historyInvalidationTimer ||
      this.historyInvalidationInFlight
    ) {
      return;
    }

    const delayMs = Math.max(
      HISTORY_INVALIDATION_COALESCE_MS,
      this.lastHistoryInvalidationAt + HISTORY_INVALIDATION_COOLDOWN_MS - Date.now(),
    );
    const invalidationTimer = setTimeout(() => {
      if (this.historyInvalidationTimer !== invalidationTimer) {
        return;
      }
      this.historyInvalidationTimer = null;
      void this.flushHistoryQueryInvalidation(socket, identity, ownerStamp, epoch);
    }, delayMs);
    this.historyInvalidationTimer = invalidationTimer;
  }

  private async flushHistoryQueryInvalidation(
    socket: WebSocket,
    identity: ActiveBrokerSessionIdentity,
    ownerStamp: ActiveBrokerSessionOwnerStamp,
    epoch: number,
  ): Promise<void> {
    if (
      epoch !== this.historyInvalidationEpoch ||
      !this.historyInvalidationPending ||
      this.historyInvalidationInFlight
    ) {
      return;
    }

    const capture = captureActiveBrokerSession();
    if (
      !capture ||
      this.ws !== socket ||
      socket.readyState !== WebSocket.OPEN ||
      !sameIdentity(this.activeIdentity, identity) ||
      !sameIdentity(getActiveBrokerSessionIdentity(capture.session), identity) ||
      !sameOwnerStamp(this.activeOwnerStamp, ownerStamp) ||
      capture.session.cacheNamespace !== ownerStamp.cacheNamespace ||
      !isActiveBrokerSessionCurrent(identity) ||
      !isActiveBrokerSessionOwnerStampCurrent(ownerStamp)
    ) {
      this.historyInvalidationPending = false;
      return;
    }

    this.historyInvalidationPending = false;
    this.historyInvalidationInFlight = true;
    this.lastHistoryInvalidationAt = Date.now();
    try {
      await Promise.all(
        HISTORY_CACHE_KEYS.map((root) => appQueryClient.invalidateQueries(
          { queryKey: [root, capture.session.cacheNamespace] },
          { cancelRefetch: true },
        )),
      );
    } catch (error) {
      console.error(
        '[BrokerRealtime] Failed to invalidate history queries',
        redactDiagnosticValue(error),
      );
    } finally {
      if (epoch !== this.historyInvalidationEpoch) {
        return;
      }
      this.historyInvalidationInFlight = false;
      if (this.historyInvalidationPending) {
        this.armHistoryQueryInvalidation(socket, identity, ownerStamp, epoch);
      }
    }
  }

  private clearHistoryQueryInvalidation(): void {
    this.historyInvalidationEpoch += 1;
    if (this.historyInvalidationTimer) {
      clearTimeout(this.historyInvalidationTimer);
      this.historyInvalidationTimer = null;
    }
    this.historyInvalidationInFlight = false;
    this.historyInvalidationPending = false;
    this.lastHistoryInvalidationAt = 0;
  }

  private handleAccount(
    data: Record<string, unknown>,
    identity: ActiveBrokerSessionIdentity,
    isFullSnapshot = false,
  ): boolean {
    // Use the same tested normalizer as the legacy account socket. It handles
    // nested envelopes, numeric strings, snake/camel aliases, and skips blank
    // fields so a partial event cannot clear a valid metric with a fake zero.
    const extractedMetrics = extractLiveAccountMetrics(data);
    const login = extractedMetrics?.login ?? numberFrom(identity.accountLogin);
    const metrics = {
      ...(extractedMetrics ?? {}),
      ...(login !== undefined ? { login } : {}),
    };
    if (Object.keys(metrics).length === 0) return false;
    if (isFullSnapshot) {
      // `metrics_update` carries every metric; one that is missing failed on
      // the server, so keep its last value and flag it stale.
      useLiveAccountState.getState().applyMetricsSnapshot(metrics);
    } else {
      useLiveAccountState.getState().updateMetrics(metrics);
    }
    return true;
  }

  private getLifecycleHints(record: Record<string, unknown>, eventName: string): Record<string, unknown> {
    const hints: Record<string, unknown> = {};
    for (const key of [
      'event',
      'type',
      'action',
      'status',
      'state',
      'position_state',
      'positionStatus',
      'ticket',
      'position_ticket',
      'order_ticket',
      'login',
      'correlation_id',
    ]) {
      if (record[key] !== undefined) {
        hints[key] = record[key];
      }
    }
    if (!hints.event && eventName) {
      hints.event = eventName;
    }
    return hints;
  }

  private invalidateLifecycleQueries(
    eventName: string,
    identity: ActiveBrokerSessionIdentity,
  ): void {
    if (!eventName) {
      return;
    }

    const shouldInvalidate =
      isAccountChangingPositionEvent(eventName) ||
      isTerminalPositionUpdate({ event: eventName }) ||
      eventName.includes('partial.closed') ||
      eventName.includes('closed') ||
      eventName.includes('filled') ||
      eventName.includes('rejected') ||
      eventName.includes('sl.triggered') ||
      eventName.includes('tp.triggered');

    if (!shouldInvalidate) {
      return;
    }

    this.invalidateLifecycleQueryRoots(identity);
  }

  private invalidateLifecycleQueryRoots(
    identity: ActiveBrokerSessionIdentity,
  ): void {
    const capture = captureActiveBrokerSession();
    if (
      !capture ||
      !sameIdentity(getActiveBrokerSessionIdentity(capture.session), identity) ||
      !isActiveBrokerSessionCurrent(identity)
    ) {
      return;
    }
    this.scheduleHistoryQueryInvalidation(identity);
    void invalidateSessionQueryRoots(
      appQueryClient,
      capture.session.cacheNamespace,
      LIFECYCLE_NON_HISTORY_CACHE_KEYS,
    );
  }

  private scheduleReconnect(identity: ActiveBrokerSessionIdentity): void {
    if (
      !this.shouldReconnect ||
      this.isSuspended ||
      this.reconnectTimer ||
      !isActiveBrokerSessionCurrent(identity)
    ) {
      return;
    }
    const currentIdentity = this.resolveIdentity();
    if (!currentIdentity || !sameIdentity(currentIdentity, identity)) {
      this.pauseUntilNextLogin();
      return;
    }

    const delay = resolveFullJitterBackoffMs({
      attempt: this.reconnectAttempts,
      baseMs: RECONNECT_BASE_MS,
      capMs: RECONNECT_MAX_MS,
    });
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isSuspended && isActiveBrokerSessionCurrent(identity)) void this.open(identity);
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private teardownSocket(): void {
    const socket = this.ws;
    this.clearHistoryQueryInvalidation();
    this.ws = null;
    this.activeIdentity = null;
    this.activeOwnerStamp = null;
    this.connectedAt = 0;
    this.acceptedPayloadCount = 0;
    this.stopHeartbeat();
    this.clearStableConnectionTimer();
    if (!socket) {
      return;
    }
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    socket.close();
  }

  private startHeartbeat(identity: ActiveBrokerSessionIdentity): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (!isActiveBrokerSessionCurrent(identity)) {
        this.teardownSocket();
        return;
      }
      if (
        !this.activeOwnerStamp ||
        !isActiveBrokerSessionOwnerStampCurrent(this.activeOwnerStamp)
      ) {
        this.teardownSocket();
        return;
      }
      this.send({ action: 'ping' });
    }, 15000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private startStableConnectionTimer(
    socket: WebSocket,
    identity: ActiveBrokerSessionIdentity,
  ): void {
    this.clearStableConnectionTimer();
    this.stableConnectionTimer = setTimeout(() => {
      this.stableConnectionTimer = null;
      if (
        this.ws === socket &&
        socket.readyState === WebSocket.OPEN &&
        !this.isSuspended &&
        isActiveBrokerSessionCurrent(identity) &&
        Boolean(
          this.activeOwnerStamp &&
          isActiveBrokerSessionOwnerStampCurrent(this.activeOwnerStamp)
        ) &&
        hasStableConnectionSucceeded({
          connectedAt: this.connectedAt,
          now: Date.now(),
          acceptedPayloadCount: this.acceptedPayloadCount,
          stableAfterMs: STABLE_CONNECTION_MS,
        })
      ) {
        this.markConnectionHealthy();
      }
    }, STABLE_CONNECTION_MS);
  }

  private clearStableConnectionTimer(): void {
    if (this.stableConnectionTimer) {
      clearTimeout(this.stableConnectionTimer);
      this.stableConnectionTimer = null;
    }
  }

  private markConnectionHealthy(): void {
    this.reconnectAttempts = 0;
    this.connectedAt = 0;
    this.acceptedPayloadCount = 0;
    this.clearStableConnectionTimer();
  }

  private send(message: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private resolveIdentity(): ActiveBrokerSessionIdentity | null {
    const capture = captureActiveBrokerSession();
    if (!capture?.session.tradeWsBase || !capture.credentials.accessToken) return null;
    return getActiveBrokerSessionIdentity(capture.session);
  }

  private pauseUntilNextLogin(): void {
    this.shouldReconnect = false;
    this.reconnectAttempts = 0;
    this.activeChannels = [];
    this.activeIdentity = null;
    this.clearReconnectTimer();
    this.clearPositionsReconcileTimer(true);
    this.clearStableConnectionTimer();
    this.teardownSocket();
  }
}

export const brokerRealtimeService = BrokerRealtimeService.getInstance();
