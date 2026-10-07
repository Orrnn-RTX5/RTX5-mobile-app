/**
 * Backend live-candle WebSocket service.
 *
 * This service subscribes to backend candle messages and forwards valid
 * payloads into the canonical `liveCandlesEngine` stream.
 *
 * Authentication: candle channels use the same authenticated `/ws/v2` broker
 * market socket as the webterminal.
 */

import { brokerApi } from '../../../../api/brokerApi';
import { AppState } from 'react-native';
import { liveCandleStream as liveCandlesEngine } from '../../stream/liveCandleStream';
import {
  createCandleChannel,
  extractCandlePayloadContext,
  getCandlePayloadItems,
  hasBackendCandleShape,
  resolveCandlesWsUrl,
} from '../candlesSocketProtocol';
import type { CandleStreamEvent } from '../../core/candles';
import { normalizeSymbol, normalizeTimeframeStrict } from '../../core/candles';
import type { Candle } from '../../../../state/tradingState';
import { createSubscriptionKey } from './authToken';
import type { ArrayListener, StreamListener, SubscriptionState, TickListener } from './types';
import {
  captureActiveBrokerSession,
  getActiveBrokerSessionIdentity,
  isActiveBrokerSessionCurrent,
  subscribeActiveBrokerSession,
  type ActiveBrokerSessionIdentity,
} from '../../../../state/activeBrokerSession';
import { isSocketAuthenticationFailure } from '../../../../api/ws/socketClosePolicy';
import { payloadMatchesSocketIdentity } from '../../../../api/ws/socketPayloadIdentity';
import {
  hasStableConnectionSucceeded,
  resolveFullJitterBackoffMs,
} from '../../../../api/ws/reconnectBackoff';
import {
  redactDiagnosticValue,
  redactSensitiveString,
} from '../../../../utils/securityRedaction';

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_CAP_MS = 30_000;
const STABLE_CONNECTION_MS = 10_000;

const redactCandleSocketUrl = (url: string): string => redactSensitiveString(url);

/** Recoverable transport diagnostics: dev builds only, console.log (no LogBox toast). */
const logCandlesSocketDiagnostic = (...args: unknown[]): void => {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(...args.map(redactDiagnosticValue));
  }
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

export class CandlesWebSocketService {
  private static instance: CandlesWebSocketService;

  private ws: WebSocket | null = null;
  private url = '';
  private activeIdentity: ActiveBrokerSessionIdentity | null = null;
  private isResolvingSocketUrl = false;
  private tokenWatcherUnsubscribe: (() => void) | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stableConnectionTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private manualDisconnect = false;
  private isSuspended = AppState.currentState !== 'active';
  private isConnected = false;
  private connectedAt = 0;
  private acceptedPayloadCount = 0;

  private subscriptions = new Map<string, SubscriptionState>();
  private tickListeners: Set<TickListener> = new Set();
  private arrayListeners: Set<ArrayListener> = new Set();
  private streamListeners: Set<StreamListener> = new Set();

  public candleCache: Candle[] = [];

  public static getInstance(): CandlesWebSocketService {
    if (!CandlesWebSocketService.instance) {
      CandlesWebSocketService.instance = new CandlesWebSocketService();
    }
    return CandlesWebSocketService.instance;
  }

  /**
   * Establishes the WebSocket connection and resubscribes all active candle channels.
   */
  public connect(): void {
    this.manualDisconnect = false;
    if (this.isSuspended) {
      return;
    }
    void this.connectAsync();
  }

  private async connectAsync(): Promise<void> {
    if (this.isSuspended || this.subscriptions.size === 0) {
      return;
    }
    if (this.isResolvingSocketUrl) {
      return;
    }

    const capture = captureActiveBrokerSession();
    if (!capture || !resolveCandlesWsUrl(capture.session.tradeWsBase)) {
      logCandlesSocketDiagnostic('[Candles WS] Active broker has no validated trading WebSocket endpoint.');
      return;
    }
    const identity = getActiveBrokerSessionIdentity(capture.session);
    this.isResolvingSocketUrl = true;
    let nextUrl = '';
    try {
      nextUrl = await brokerApi.getWebSocketUrl();
    } catch (error) {
      this.isResolvingSocketUrl = false;
      logCandlesSocketDiagnostic('[Candles WS] Failed to resolve broker candle websocket URL.', error);
      if (isActiveBrokerSessionCurrent(identity)) {
        this.scheduleReconnect(identity);
      }
      return;
    }
    this.isResolvingSocketUrl = false;
    if (
      !isActiveBrokerSessionCurrent(identity) ||
      this.isSuspended ||
      this.manualDisconnect ||
      this.subscriptions.size === 0 ||
      !nextUrl
    ) {
      return;
    }

    // If the socket is already up but the connection identity has rotated, tear
    // it down so the next connection uses the current broker URL/auth mode.
    if (
      (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) &&
      (!sameIdentity(this.activeIdentity, identity) || this.url !== nextUrl)
    ) {
      this.url = nextUrl;
      this.tearDownSocketSafe();
    } else if (
      this.ws?.readyState === WebSocket.OPEN ||
      this.ws?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    this.url = nextUrl;
    this.manualDisconnect = false;
    this.clearReconnectTimer();
    // Defensive call: under hot-module-reload the singleton may pre-date the
    // method being added to the prototype. Skip silently rather than crash —
    // the worst outcome is that token rotation won't trigger an auto-reconnect
    // until the next cold start, but live candles still flow on the current
    // token.
    if (typeof this.startTokenWatcher === 'function') {
      try {
        this.startTokenWatcher();
      } catch (_error) {}
    }

    try {
      this.activeIdentity = identity;
      const wsUrl = this.url;
      const socket = new WebSocket(wsUrl);
      this.ws = socket;
      socket.onopen = () => {
        if (
          this.ws !== socket ||
          this.isSuspended ||
          !isActiveBrokerSessionCurrent(identity)
        ) {
          socket.close();
          return;
        }
        this.isConnected = true;
        this.connectedAt = Date.now();
        this.acceptedPayloadCount = 0;
        this.startStableConnectionTimer(socket, identity);
        this.sendSubscriptions();
      };
      socket.onmessage = (event) => {
        if (this.ws !== socket || !isActiveBrokerSessionCurrent(identity)) return;
        try {
          const accepted = this.handlePayload(JSON.parse(event.data as string), identity);
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
          logCandlesSocketDiagnostic('[Candles WS] Parse error', error);
        }
      };
      socket.onclose = (event) => {
        if (this.ws !== socket) return;
        this.clearStableConnectionTimer();
        this.isConnected = false;
        this.ws = null;
        this.activeIdentity = null;
        this.connectedAt = 0;
        this.acceptedPayloadCount = 0;
        if (!isActiveBrokerSessionCurrent(identity)) return;
        if (isSocketAuthenticationFailure(event?.code)) {
          this.manualDisconnect = true;
          this.clearReconnectTimer();
          return;
        }
        if (!this.manualDisconnect && this.subscriptions.size > 0) {
          logCandlesSocketDiagnostic('[Candles WS] closed', {
            code: event?.code,
            reason: redactSensitiveString(String(event?.reason ?? '')),
            socketUrl: redactCandleSocketUrl(wsUrl),
          });
        }
        if (!this.manualDisconnect && this.subscriptions.size > 0) {
          this.scheduleReconnect(identity);
        }
      };
      socket.onerror = () => {
        if (this.ws !== socket || !isActiveBrokerSessionCurrent(identity)) return;
        logCandlesSocketDiagnostic('[Candles WS] connection error', {
          readyState: socket.readyState,
          socketUrl: redactCandleSocketUrl(wsUrl),
        });
      };
    } catch (error) {
      logCandlesSocketDiagnostic('[Candles WS] connection failed', error);
      if (isActiveBrokerSessionCurrent(identity)) {
        this.scheduleReconnect(identity);
      }
    }
  }

  /**
   * Intentionally closes the WebSocket connection and halts the automatic reconnect loop.
   * Cleans up all subscriptions and internal state.
   */
  public disconnect(): void {
    this.manualDisconnect = true;
    this.clearReconnectTimer();
    this.clearStableConnectionTimer();
    if (typeof this.stopTokenWatcher === 'function') {
      try {
        this.stopTokenWatcher();
      } catch (_error) {}
    }
    for (const state of this.subscriptions.values()) {
      state.engineUnsubscribe?.();
    }
    this.subscriptions.clear();
    this.candleCache = [];
    this.activeIdentity = null;

    this.tearDownSocketSafe();
  }

  /** Stop network work while retaining consumer counts, listeners, and candles. */
  public suspend(): void {
    if (this.isSuspended) return;
    this.isSuspended = true;
    this.clearReconnectTimer();
    this.clearStableConnectionTimer();
    this.tearDownSocketSafe();
  }

  /** Revalidate the active immutable session, then restore existing demand. */
  public resume(): void {
    if (!this.isSuspended) return;
    this.isSuspended = false;
    if (this.manualDisconnect || this.subscriptions.size === 0) return;
    const capture = captureActiveBrokerSession();
    if (!capture || !resolveCandlesWsUrl(capture.session.tradeWsBase)) return;
    this.connect();
  }

  /**
   * Closes the WebSocket and resets `this.ws`/`this.isConnected`. Inlines the
   * cleanup so the call site never crashes if a hot-module-reload swap left a
   * stale singleton without the `teardownSocket` method on its prototype.
   */
  private tearDownSocketSafe(): void {
    if (typeof this.teardownSocket === 'function') {
      try {
        this.teardownSocket();
        return;
      } catch (_error) {}
    }
    const socket = this.ws;
    this.clearStableConnectionTimer();
    this.ws = null;
    this.isConnected = false;
    this.activeIdentity = null;
    this.connectedAt = 0;
    this.acceptedPayloadCount = 0;
    if (!socket) {
      return;
    }
    try {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
    } catch (_error) {}
    try {
      socket.close();
    } catch (_error) {}
  }

  /**
   * Requests a live candle stream for a specific market symbol and timeframe.
   * Multiplexes the subscription if the socket is already open, or initiates a connection.
   */
  public subscribe(symbol: string, tf: string): void {
    const normalizedSymbol = normalizeSymbol(symbol);
    const normalizedTimeframe = normalizeTimeframeStrict(tf);
    if (!normalizedSymbol || !normalizedTimeframe) {
      return;
    }

    const key = createSubscriptionKey(normalizedSymbol, normalizedTimeframe);
    let state = this.subscriptions.get(key);
    if (!state) {
      state = {
        key,
        symbol: normalizedSymbol,
        tf: normalizedTimeframe,
        consumerCount: 0,
        candles: [],
        engineUnsubscribe: null,
      };
      state.engineUnsubscribe = liveCandlesEngine.subscribe(normalizedSymbol, normalizedTimeframe, () => {
        this.handleEngineUpdate(state as SubscriptionState);
      });
      this.subscriptions.set(key, state);
    }

    state.consumerCount += 1;
    this.connect();
    if (this.isConnected) {
      this.sendSubscription(normalizedSymbol, normalizedTimeframe);
    }
  }

  /**
   * Decrements the consumer count for a specific stream. If no consumers remain,
   * sends an unsubscribe message to the backend and cleans up the engine listener.
   */
  public unsubscribe(symbol?: string, tf?: string): void {
    const normalizedSymbol = normalizeSymbol(symbol ?? '');
    const normalizedTimeframe = normalizeTimeframeStrict(tf);
    if (!normalizedSymbol || !normalizedTimeframe) {
      return;
    }

    const key = createSubscriptionKey(normalizedSymbol, normalizedTimeframe);
    const state = this.subscriptions.get(key);
    if (!state) {
      return;
    }

    state.consumerCount = Math.max(0, state.consumerCount - 1);
    if (state.consumerCount > 0) {
      return;
    }

    state.engineUnsubscribe?.();
    this.subscriptions.delete(key);
    this.sendUnsubscription(normalizedSymbol, normalizedTimeframe);
    if (this.subscriptions.size === 0 && this.ws) {
      this.ws.close();
    }
  }

  public refresh(symbol: string, tf: string): void {
    liveCandlesEngine.refresh(symbol, tf);
  }

  public addTickListener(listener: TickListener): void {
    this.tickListeners.add(listener);
  }

  public removeTickListener(listener: TickListener): void {
    this.tickListeners.delete(listener);
  }

  public addArrayListener(listener: ArrayListener): void {
    this.arrayListeners.add(listener);
  }

  public removeArrayListener(listener: ArrayListener): void {
    this.arrayListeners.delete(listener);
  }

  public addStreamListener(listener: StreamListener): void {
    this.streamListeners.add(listener);
  }

  public removeStreamListener(listener: StreamListener): void {
    this.streamListeners.delete(listener);
  }

  /**
   * Processes all incoming WebSocket messages. Routes them to the correct candle stream
   * based on explicit channel metadata or payload context.
   */
  private handlePayload(payload: unknown, identity: ActiveBrokerSessionIdentity): boolean {
    if (
      !isActiveBrokerSessionCurrent(identity) ||
      !sameIdentity(this.activeIdentity, identity) ||
      !payloadMatchesSocketIdentity(payload, identity)
    ) {
      return false;
    }
    const items = getCandlePayloadItems(payload);
    if (items.length === 0) {
      return false;
    }

    const outerContext = extractCandlePayloadContext(payload);
    const states = Array.from(this.subscriptions.values());
    let accepted = false;

    for (const item of items) {
      if (!hasBackendCandleShape(item)) {
        continue;
      }

      const itemContext = extractCandlePayloadContext(item);
      const symbol = itemContext.symbol ?? outerContext.symbol;
      const tf = itemContext.tf ?? outerContext.tf;

      if (symbol && tf) {
        liveCandlesEngine.ingestLiveCandle(item, symbol, tf);
        accepted = true;
        continue;
      }

      const candidates = states.filter((state) => {
        if (symbol && state.symbol !== symbol) return false;
        if (tf && state.tf !== tf) return false;
        return true;
      });

      // A backend candle without enough routing metadata is safe only when it
      // maps to exactly one active subscription. Otherwise applying it would
      // pollute other symbols/timeframes.
      if (candidates.length === 1) {
        liveCandlesEngine.ingestLiveCandle(item, candidates[0].symbol, candidates[0].tf);
        accepted = true;
      }
    }
    return accepted;
  }

  private handleEngineUpdate(state: SubscriptionState): void {
    const candles = liveCandlesEngine.getCandles(state.symbol, state.tf);
    const previous = state.candles;
    state.candles = candles;
    this.candleCache = candles;

    this.arrayListeners.forEach((listener) => listener(state.symbol, state.tf, candles));

    const previousLast = previous[previous.length - 1];
    const nextLast = candles[candles.length - 1];
    if (!nextLast) {
      this.emitStream({
        type: 'full_sync',
        symbol: state.symbol,
        tf: state.tf,
        candles,
        reason: 'resync',
      });
      return;
    }

    if (!previousLast || candles.length < previous.length || candles.length > previous.length + 1) {
      this.emitStream({
        type: 'full_sync',
        symbol: state.symbol,
        tf: state.tf,
        candles,
        reason: 'resync',
      });
      return;
    }

    if (previousLast.time === nextLast.time) {
      this.tickListeners.forEach((listener) => listener(state.symbol, state.tf, [nextLast]));
      this.emitStream({ type: 'replace_last', symbol: state.symbol, tf: state.tf, candle: nextLast });
      return;
    }

    this.tickListeners.forEach((listener) => listener(state.symbol, state.tf, [nextLast]));
    this.emitStream({ type: 'append', symbol: state.symbol, tf: state.tf, candle: nextLast });
  }

  private emitStream(event: CandleStreamEvent): void {
    this.streamListeners.forEach((listener) => listener(event));
  }

  private sendSubscriptions(): void {
    const states = Array.from(this.subscriptions.values());
    if (this.usesChannelProtocol()) {
      const channels = Array.from(
        new Set(states.map((state) => createCandleChannel(state.symbol, state.tf)).filter(Boolean)),
      );
      channels.forEach((channel) => {
        this.send({ action: 'subscribe', channel });
      });
      return;
    }

    if (this.usesHistoryProtocol()) {
      states.forEach((state) => {
        this.send({ action: 'subscribe', symbol: state.symbol, tf: state.tf });
      });
      return;
    }

    const symbols = Array.from(new Set(states.map((state) => state.symbol)));
    if (symbols.length > 0) {
      this.send({ type: 'subscribe', symbols });
    }
  }

  private sendSubscription(symbol: string, tf: string): void {
    const channel = createCandleChannel(symbol, tf);
    if (this.usesChannelProtocol() && channel) {
      this.send({ action: 'subscribe', channel });
      return;
    }

    if (this.usesHistoryProtocol()) {
      this.send({ action: 'subscribe', symbol, tf });
      return;
    }

    this.send({ type: 'subscribe', symbols: [symbol] });
  }

  private sendUnsubscription(symbol: string, tf: string): void {
    const channel = createCandleChannel(symbol, tf);
    if (this.usesChannelProtocol() && channel) {
      this.send({ action: 'unsubscribe', channel });
      return;
    }

    if (this.usesHistoryProtocol()) {
      this.send({ action: 'unsubscribe', symbol, tf });
      return;
    }

    this.send({ type: 'unsubscribe', symbols: [symbol] });
  }

  private usesChannelProtocol(): boolean {
    return /\/ws\/v2(?:$|\?)/.test(this.url);
  }

  private usesHistoryProtocol(): boolean {
    return /\/ws\/history(?:$|\?)/.test(this.url);
  }

  private send(payload: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private scheduleReconnect(identity: ActiveBrokerSessionIdentity): void {
    if (
      this.isSuspended ||
      this.manualDisconnect ||
      this.reconnectTimer ||
      !isActiveBrokerSessionCurrent(identity)
    ) {
      return;
    }

    const delay = resolveFullJitterBackoffMs({
      attempt: this.reconnectAttempts,
      baseMs: RECONNECT_BASE_MS,
      capMs: RECONNECT_CAP_MS,
    });
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (
        !this.manualDisconnect &&
        !this.isSuspended &&
        this.subscriptions.size > 0 &&
        isActiveBrokerSessionCurrent(identity)
      ) {
        this.connect();
      }
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private teardownSocket(): void {
    this.clearStableConnectionTimer();
    this.connectedAt = 0;
    this.acceptedPayloadCount = 0;
    if (!this.ws) {
      this.isConnected = false;
      this.activeIdentity = null;
      return;
    }
    const socket = this.ws;
    this.ws = null;
    this.isConnected = false;
    this.activeIdentity = null;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    try {
      socket.close();
    } catch (_error) {}
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

  // Credential refreshes and broker/account transitions must never leave the
  // old socket alive. The coordinator may also disconnect explicitly; this
  // watcher is a synchronous isolation backstop.
  private startTokenWatcher(): void {
    if (this.tokenWatcherUnsubscribe) {
      return;
    }
    try {
      this.tokenWatcherUnsubscribe = subscribeActiveBrokerSession((event) => {
        if (this.subscriptions.size === 0) {
          return;
        }
        this.tearDownSocketSafe();
        this.clearReconnectTimer();
        this.reconnectAttempts = 0;
        if (!this.isSuspended && event.activeSession?.tradeWsBase) {
          this.connect();
        }
      });
    } catch (_error) {
      this.tokenWatcherUnsubscribe = null;
    }
  }

  private stopTokenWatcher(): void {
    if (this.tokenWatcherUnsubscribe) {
      try {
        this.tokenWatcherUnsubscribe();
      } catch (_error) {}
      this.tokenWatcherUnsubscribe = null;
    }
  }
}
