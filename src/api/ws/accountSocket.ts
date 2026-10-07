/**
 * Core module: accountSocket.ts
 *
 * Singleton WebSocket service for live account data.
 *
 * Protocol:
 *   1. Connect to the active session's exact validated tradeWsBase using the
 *      credential URL returned by brokerApi.
 *   2. Subscribe: { "action": "subscribe", "channel": "metrics.LOGIN" }
 *                  { "action": "subscribe", "channel": "positions.LOGIN" }
 *
 *   - metrics.LOGIN   -> balance, equity, margin, free margin, margin level, floating
 *   - positions.LOGIN -> live profit per open trade (position updates)
 */

import { useLiveAccountState } from '../../state/liveAccountState';
import { AppState } from 'react-native';
import { usePositionsState } from '../../state/positionsState';
import { brokerApi } from '../brokerApi';
import { isSocketAuthenticationFailure } from './socketClosePolicy';
import { payloadMatchesSocketIdentity } from './socketPayloadIdentity';
import {
  captureActiveBrokerSession,
  isActiveBrokerSessionCurrent,
} from '../../state/activeBrokerSession';
import {
  extractLiveAccountMetrics,
  resolveAccountWsSession,
  type AccountWsSession,
} from './accountSocket.helpers';
import { redactDiagnosticValue } from '../../utils/securityRedaction';

const DEBUG_ACCOUNT_WS =
  typeof process !== 'undefined' && process.env.EXPO_PUBLIC_DEBUG_ACCOUNT_WS === 'true';

const logAccountWsDiagnostic = (...args: Parameters<typeof console.log>) => {
  if (DEBUG_ACCOUNT_WS) {
    console.log(...args.map(redactDiagnosticValue));
  }
};

const warnAccountWsDiagnostic = (...args: Parameters<typeof console.log>) => {
  if (DEBUG_ACCOUNT_WS) {
    console.log(...args.map(redactDiagnosticValue));
  }
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const normalizeEventName = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, '.');

const getPayloadData = (payload: Record<string, unknown>): unknown =>
  payload.data ?? payload.payload ?? payload.result ?? payload;

const isPositionLikeRecord = (record: Record<string, unknown>): boolean =>
  record.ticket !== undefined ||
  record.id !== undefined ||
  record.position_ticket !== undefined ||
  record.order_ticket !== undefined ||
  (
    record.symbol !== undefined &&
    (
      record.volume !== undefined ||
      record.side !== undefined ||
      record.type !== undefined ||
      record.price_open !== undefined ||
      record.openPrice !== undefined ||
      record.profit !== undefined ||
      record.pnl !== undefined
    )
  );

const getLifecycleHints = (record: Record<string, unknown>): Record<string, unknown> => {
  const hints: Record<string, unknown> = {};
  for (const key of ['event', 'type', 'action', 'status', 'state', 'position_state', 'positionStatus']) {
    if (record[key] !== undefined) {
      hints[key] = record[key];
    }
  }
  return hints;
};

const mergeLifecycleHints = (
  item: Record<string, unknown>,
  parentHints: Record<string, unknown>,
): Record<string, unknown> => ({
  ...parentHints,
  ...item,
});

const extractPositionItems = (
  value: unknown,
  parentHints: Record<string, unknown> = {},
  seen = new WeakSet<object>(),
): Record<string, unknown>[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractPositionItems(item, parentHints, seen));
  }

  const record = asRecord(value);
  if (!record || seen.has(record)) {
    return [];
  }
  seen.add(record);

  const hints = { ...parentHints, ...getLifecycleHints(record) };
  if (isPositionLikeRecord(record)) {
    return [mergeLifecycleHints(record, parentHints)];
  }

  for (const key of ['positions', 'items', 'data', 'payload', 'result', 'position', 'item']) {
    const nested = record[key];
    if (nested !== undefined) {
      const nestedItems = extractPositionItems(nested, hints, seen);
      if (nestedItems.length > 0) {
        return nestedItems;
      }
    }
  }

  return [];
};

const extractPositionSnapshot = (value: unknown): Record<string, unknown>[] | null => {
  if (Array.isArray(value)) {
    return extractPositionItems(value);
  }

  const record = asRecord(value);
  if (!record) {
    return null;
  }

  for (const key of ['positions', 'items', 'data', 'result']) {
    const nested = record[key];
    if (Array.isArray(nested)) {
      return extractPositionItems(nested, getLifecycleHints(record));
    }
  }

  return null;
};

const isTruthySnapshotFlag = (value: unknown): boolean => {
  if (value === true) {
    return true;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === 'full' || normalized === 'complete' || normalized === 'snapshot';
  }
  return false;
};

const isAuthoritativePositionSnapshot = (
  value: unknown,
  parentHints: Record<string, unknown> = {},
): boolean => {
  const record = asRecord(value);
  const eventHints = [
    parentHints.event,
    parentHints.type,
    parentHints.action,
    record?.event,
    record?.type,
    record?.action,
  ].map(normalizeEventName);

  if (eventHints.some((hint) => hint === 'position.update' || hint === 'positions.update')) {
    return false;
  }

  if (
    eventHints.some(
      (hint) =>
        hint === 'position.snapshot' ||
        hint === 'positions.snapshot' ||
        hint === 'positions.full' ||
        hint === 'account.snapshot',
    )
  ) {
    return true;
  }

  if (
    isTruthySnapshotFlag(record?.snapshot) ||
    isTruthySnapshotFlag(record?.is_snapshot) ||
    isTruthySnapshotFlag(record?.full) ||
    isTruthySnapshotFlag(record?.complete)
  ) {
    return true;
  }

  return false;
};

const sameAccountWsSession = (
  left: AccountWsSession | null,
  right: AccountWsSession,
): boolean => Boolean(
  left &&
  left.login === right.login &&
  left.identity.brokerId === right.identity.brokerId &&
  left.identity.accountLogin === right.identity.accountLogin &&
  left.identity.sessionEpoch === right.identity.sessionEpoch,
);

class AccountWebSocketService {
  private static instance: AccountWebSocketService;
  private ws: WebSocket | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnected = false;
  private shouldReconnect = false;
  private isSuspended = AppState.currentState !== 'active';
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private activeSession: AccountWsSession | null = null;
  private isResolvingSocketUrl = false;

  private constructor() {}

  public static getInstance(): AccountWebSocketService {
    if (!AccountWebSocketService.instance) {
      AccountWebSocketService.instance = new AccountWebSocketService();
    }
    return AccountWebSocketService.instance;
  }

  public connect(): void {
    const desiredSession = this.resolveSession();
    if (!desiredSession) {
      this.pauseUntilNextLogin();
      return;
    }
    this.shouldReconnect = true;
    this.reconnectAttempts = 0;
    this.clearReconnectTimer();

    if (
      this.activeSession &&
      !sameAccountWsSession(this.activeSession, desiredSession)
    ) {
      // Account changed: clear stale metrics/positions immediately so the UI
      // does not keep rendering the old account while the new socket boots.
      useLiveAccountState.getState().resetMetrics();
      usePositionsState.getState().clearPositions();
      this.teardownSocket(false);
    }

    if (this.isSuspended) return;
    void this.doConnect();
  }

  public disconnect(): void {
    this.shouldReconnect = false;
    this.reconnectAttempts = 0;
    this.activeSession = null;
    this.clearReconnectTimer();
    usePositionsState.getState().clearPositions();
    this.teardownSocket(true);
  }

  public suspend(): void {
    if (this.isSuspended) return;
    this.isSuspended = true;
    this.clearReconnectTimer();
    this.teardownSocket(false);
  }

  public resume(): void {
    if (!this.isSuspended) return;
    this.isSuspended = false;
    if (!this.shouldReconnect) return;
    const session = this.resolveSession();
    if (!session) {
      this.pauseUntilNextLogin();
      return;
    }
    this.activeSession = session;
    void this.doConnect();
  }

  private resolveSession(): AccountWsSession | null {
    return resolveAccountWsSession(captureActiveBrokerSession());
  }

  private async doConnect(): Promise<void> {
    if (
      this.isSuspended ||
      this.isResolvingSocketUrl ||
      this.ws?.readyState === WebSocket.OPEN ||
      this.ws?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    const session = this.resolveSession();
    if (!session) {
      this.pauseUntilNextLogin();
      return;
    }

    this.isResolvingSocketUrl = true;
    let wsUrl = '';
    try {
      wsUrl = await brokerApi.getWebSocketUrl();
    } catch (error) {
      this.isResolvingSocketUrl = false;
      if (
        !this.isSuspended &&
        isActiveBrokerSessionCurrent(session.identity) &&
        this.shouldReconnect
      ) {
        warnAccountWsDiagnostic('[Account WS] Trading websocket unavailable.', error);
        this.attemptReconnect(session);
      }
      return;
    }
    this.isResolvingSocketUrl = false;
    if (
      !this.shouldReconnect ||
      this.isSuspended ||
      !wsUrl ||
      !isActiveBrokerSessionCurrent(session.identity)
    ) {
      if (this.shouldReconnect && this.resolveSession()) {
        void this.doConnect();
      }
      return;
    }
    this.activeSession = session;

    try {
      const socket = new WebSocket(wsUrl);
      this.ws = socket;

      socket.onopen = () => {
        if (
          this.ws !== socket ||
          this.isSuspended ||
          !isActiveBrokerSessionCurrent(session.identity)
        ) {
          socket.close();
          return;
        }
        logAccountWsDiagnostic('[Account WS] Connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.startHeartbeat(session);
        // Different backend deployments still expose either `metrics.LOGIN`
        // or `account.LOGIN` for the same live account-summary stream.
        // `deals.LOGIN` is dropped (contract v3: nothing is sent on it).
        ['metrics', 'account', 'positions', 'orders', 'history'].forEach((channelPrefix) => {
          this.send({ action: 'subscribe', channel: `${channelPrefix}.${session.login}` });
        });
      };

      socket.onmessage = (event) => {
        if (
          this.ws !== socket ||
          this.isSuspended ||
          !isActiveBrokerSessionCurrent(session.identity)
        ) return;
        try {
          const payload = JSON.parse(event.data as string);
          this.handlePayload(payload, session);
        } catch (error) {
          warnAccountWsDiagnostic('[Account WS] Parse error', error);
        }
      };

      socket.onclose = (event) => {
        if (this.ws !== socket) return;
        logAccountWsDiagnostic('[Account WS] Closed');
        this.stopHeartbeat();
        this.isConnected = false;
        this.ws = null;
        if (isSocketAuthenticationFailure(event?.code)) {
          this.pauseUntilNextLogin();
          return;
        }
        if (isActiveBrokerSessionCurrent(session.identity)) {
          this.attemptReconnect(session);
        }
      };

      socket.onerror = () => {
        if (this.ws !== socket || !isActiveBrokerSessionCurrent(session.identity)) return;
        const state = socket.readyState;
        warnAccountWsDiagnostic(`[Account WS] Connection error - readyState: ${state}`);
      };
    } catch (error) {
      logAccountWsDiagnostic('[Account WS] Connection initialization failed', error);
      this.attemptReconnect(session);
    }
  }

  private handlePayload(payload: any, session: AccountWsSession): void {
    if (
      !isActiveBrokerSessionCurrent(session.identity) ||
      !sameAccountWsSession(this.activeSession, session) ||
      !payloadMatchesSocketIdentity(payload, session.identity)
    ) {
      return;
    }
    const payloadRecord = asRecord(payload);
    const channel = typeof payloadRecord?.channel === 'string' ? payloadRecord.channel : '';
    const eventName = normalizeEventName(payloadRecord?.event ?? payloadRecord?.type);
    const data = payloadRecord ? getPayloadData(payloadRecord) : payload;

    if (
      data &&
      (channel.startsWith('metrics.') ||
        channel.startsWith('account.') ||
        eventName.startsWith('account') ||
        eventName.startsWith('metrics'))
    ) {
      const metrics = extractLiveAccountMetrics(data);
      if (metrics) {
        useLiveAccountState.getState().updateMetrics(metrics);
      }
    }

    if (data && (channel.startsWith('positions.') || eventName.startsWith('position'))) {
      this.handlePositionsPayload(data, getLifecycleHints(payloadRecord ?? {}), session.login);
    }

    if (eventName === 'order.status' && data) {
      void usePositionsState.getState().refreshPositions(session.login);
    }

    if (eventName === 'account.snapshot' && data) {
      const metrics = extractLiveAccountMetrics(data);
      if (metrics) {
        useLiveAccountState.getState().updateMetrics(metrics);
      }
    }
  }

  private handlePositionsPayload(
    data: any,
    parentHints: Record<string, unknown> = {},
    accountLogin?: string,
  ): void {
    const snapshot = extractPositionSnapshot(data);

    if (snapshot) {
      const isAuthoritativeSnapshot = isAuthoritativePositionSnapshot(data, parentHints);
      usePositionsState.getState().applyPositionsSnapshot(snapshot, accountLogin, {
        preserveMissingExisting: !isAuthoritativeSnapshot,
      });
      return;
    }

    const updates = extractPositionItems(data, parentHints);
    if (updates.length === 0) {
      return;
    }

    for (const update of updates) {
      usePositionsState.getState().upsertPosition(update);
    }
  }

  private send(message: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private attemptReconnect(session: AccountWsSession): void {
    if (
      !this.shouldReconnect ||
      this.isSuspended ||
      !isActiveBrokerSessionCurrent(session.identity)
    ) {
      return;
    }

    const currentSession = this.resolveSession();
    if (!currentSession || !sameAccountWsSession(currentSession, session)) {
      this.pauseUntilNextLogin();
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      warnAccountWsDiagnostic('[Account WS] Max reconnect attempts reached. Giving up until next login.');
      this.shouldReconnect = false;
      return;
    }

    this.reconnectAttempts += 1;
    const timeout = Math.min(1000 * 2 ** this.reconnectAttempts, 10000);
    logAccountWsDiagnostic(
      `[Account WS] Reconnecting in ${timeout}ms... (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
    );
    this.scheduleRetry(timeout, session);
  }

  private scheduleRetry(timeoutMs: number, session: AccountWsSession): void {
    if (
      !this.shouldReconnect ||
      this.isSuspended ||
      this.reconnectTimer ||
      !isActiveBrokerSessionCurrent(session.identity)
    ) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isSuspended && isActiveBrokerSessionCurrent(session.identity)) {
        void this.doConnect();
      }
    }, timeoutMs);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startHeartbeat(session: AccountWsSession): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (!isActiveBrokerSessionCurrent(session.identity)) {
        this.teardownSocket(false);
        return;
      }
      this.send({ type: 'ping' });
    }, 15000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private teardownSocket(resetMetrics: boolean): void {
    const currentSocket = this.ws;
    this.stopHeartbeat();
    this.isConnected = false;
    this.ws = null;

    if (currentSocket) {
      currentSocket.onopen = null;
      currentSocket.onmessage = null;
      currentSocket.onerror = null;
      currentSocket.onclose = null;
      currentSocket.close();
    }

    if (resetMetrics) {
      useLiveAccountState.getState().resetMetrics();
    }
  }

  private pauseUntilNextLogin(): void {
    this.shouldReconnect = false;
    this.reconnectAttempts = 0;
    this.activeSession = null;
    this.isResolvingSocketUrl = false;
    this.clearReconnectTimer();
    this.teardownSocket(false);
  }
}

export const accountWsService = AccountWebSocketService.getInstance();
