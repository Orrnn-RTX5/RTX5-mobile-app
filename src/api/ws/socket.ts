/** Legacy multi-channel trading socket, isolated to one immutable broker session. */

import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';

import {
  captureActiveBrokerSession,
  getActiveBrokerSessionIdentity,
  isActiveBrokerSessionCurrent,
  type ActiveBrokerSessionIdentity,
} from '../../state/activeBrokerSession';
import { useTradingState } from '../../state/tradingState';
import { brokerApi } from '../brokerApi';
import { isSocketAuthenticationFailure } from './socketClosePolicy';
import { payloadMatchesSocketIdentity } from './socketPayloadIdentity';
import { redactDiagnosticValue } from '../../utils/securityRedaction';

type SubscriptionMessage = {
  type: 'subscribe' | 'unsubscribe';
  channel: string;
};

type WsMessage = SubscriptionMessage | { type: 'ping' | 'get_channels' };

/** Recoverable transport diagnostics: dev builds only, console.log (no LogBox toast). */
const logTradingSocketDiagnostic = (...args: unknown[]): void => {
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

/**
 * Legacy general-purpose channel service. The endpoint is never derived: it
 * can connect only to the active session's exact validated tradeWsBase.
 */
export class WebSocketService {
  private static instance: WebSocketService;
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly reconnectDelay = 2000;
  private isConnected = false;
  private shouldReconnect = false;
  private isSuspended = AppState.currentState !== 'active';
  private isResolvingSocketUrl = false;
  private activeIdentity: ActiveBrokerSessionIdentity | null = null;
  private netInfoUnsubscribe: (() => void) | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private activeSubscriptions: Set<string> = new Set();

  private constructor() {}

  public static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  public getConnectionStatus(): boolean {
    return this.isConnected;
  }

  public connect(): void {
    const capture = captureActiveBrokerSession();
    if (!capture?.session.tradeWsBase) {
      this.shouldReconnect = false;
      logTradingSocketDiagnostic('[WebSocket] Active broker has no validated trading WebSocket endpoint.');
      return;
    }
    this.shouldReconnect = true;
    if (this.isSuspended) return;
    void this.connectForIdentity(getActiveBrokerSessionIdentity(capture.session));
  }

  private async connectForIdentity(identity: ActiveBrokerSessionIdentity): Promise<void> {
    if (
      !this.shouldReconnect ||
      this.isSuspended ||
      !isActiveBrokerSessionCurrent(identity) ||
      this.isResolvingSocketUrl
    ) {
      return;
    }
    if (
      (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) &&
      sameIdentity(this.activeIdentity, identity)
    ) {
      return;
    }

    this.isResolvingSocketUrl = true;
    let wsUrl = '';
    try {
      wsUrl = await brokerApi.getWebSocketUrl();
    } catch (error) {
      this.isResolvingSocketUrl = false;
      if (!this.isSuspended && this.shouldReconnect && isActiveBrokerSessionCurrent(identity)) {
        logTradingSocketDiagnostic('[WebSocket] Trading WebSocket URL unavailable.', error);
        this.attemptReconnect(identity);
      }
      return;
    }
    this.isResolvingSocketUrl = false;
    if (this.isSuspended || !this.shouldReconnect || !wsUrl || !isActiveBrokerSessionCurrent(identity)) {
      const current = captureActiveBrokerSession();
      if (this.shouldReconnect && current?.session.tradeWsBase) this.connect();
      return;
    }

    if (this.ws) this.teardownSocket();
    try {
      const socket = new WebSocket(wsUrl);
      this.ws = socket;
      this.activeIdentity = identity;

      socket.onopen = () => {
        if (this.ws !== socket || this.isSuspended || !isActiveBrokerSessionCurrent(identity)) {
          socket.close();
          return;
        }
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.activeSubscriptions.forEach((channel) => {
          this.send({ type: 'subscribe', channel }, identity);
        });
      };

      socket.onmessage = (event) => {
        if (this.ws !== socket || this.isSuspended || !isActiveBrokerSessionCurrent(identity)) return;
        try {
          this.handleMessage(JSON.parse(event.data as string), identity);
        } catch (error) {
          logTradingSocketDiagnostic('[WebSocket] Error parsing message', error);
        }
      };

      socket.onclose = (event) => {
        if (this.ws !== socket) return;
        this.ws = null;
        this.isConnected = false;
        this.activeIdentity = null;
        if (isSocketAuthenticationFailure(event?.code)) {
          this.shouldReconnect = false;
          return;
        }
        if (isActiveBrokerSessionCurrent(identity)) this.attemptReconnect(identity);
      };

      socket.onerror = () => {
        if (this.ws === socket && isActiveBrokerSessionCurrent(identity)) {
          logTradingSocketDiagnostic('[WebSocket] Trading connection error.');
        }
      };
    } catch (error) {
      logTradingSocketDiagnostic('[WebSocket] Connection initialization failed.', error);
      this.attemptReconnect(identity);
    }
  }

  public disconnect(): void {
    this.shouldReconnect = false;
    this.reconnectAttempts = 0;
    this.activeSubscriptions.clear();
    this.clearReconnectTimer();
    this.clearNetInfoListener();
    this.teardownSocket();
  }

  public suspend(): void {
    if (this.isSuspended) return;
    this.isSuspended = true;
    this.clearReconnectTimer();
    this.clearNetInfoListener();
    this.teardownSocket();
  }

  public resume(): void {
    if (!this.isSuspended) return;
    this.isSuspended = false;
    if (!this.shouldReconnect || this.activeSubscriptions.size === 0) return;
    const capture = captureActiveBrokerSession();
    if (!capture?.session.tradeWsBase || !capture.credentials.accessToken) return;
    void this.connectForIdentity(getActiveBrokerSessionIdentity(capture.session));
  }

  public subscribe(channel: string): void {
    const normalized = String(channel ?? '').trim();
    if (normalized === 'prices' || normalized.startsWith('quotes.')) {
      console.error('[WebSocket] Quote channels are disabled; executable quotes use /ws/feed only.');
      return;
    }
    if (!normalized || this.activeSubscriptions.has(normalized)) return;
    this.activeSubscriptions.add(normalized);
    if (this.isConnected && this.activeIdentity) {
      this.send({ type: 'subscribe', channel: normalized }, this.activeIdentity);
    } else {
      this.connect();
    }
  }

  public unsubscribe(channel: string): void {
    const normalized = String(channel ?? '').trim();
    if (!this.activeSubscriptions.delete(normalized)) return;
    if (this.isConnected && this.activeIdentity) {
      this.send({ type: 'unsubscribe', channel: normalized }, this.activeIdentity);
    }
  }

  private send(message: WsMessage, identity: ActiveBrokerSessionIdentity): void {
    if (
      this.ws?.readyState === WebSocket.OPEN &&
      sameIdentity(this.activeIdentity, identity) &&
      isActiveBrokerSessionCurrent(identity)
    ) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private attemptReconnect(identity: ActiveBrokerSessionIdentity): void {
    if (
      !this.shouldReconnect ||
      this.isSuspended ||
      this.reconnectTimer ||
      !isActiveBrokerSessionCurrent(identity) ||
      this.reconnectAttempts >= this.maxReconnectAttempts
    ) {
      return;
    }

    void NetInfo.fetch().then((network) => {
      if (this.isSuspended || !this.shouldReconnect || !isActiveBrokerSessionCurrent(identity)) return;
      if (network.isConnected === false) {
        if (!this.netInfoUnsubscribe) {
          this.netInfoUnsubscribe = NetInfo.addEventListener((nextNetwork) => {
            if (
              this.isSuspended ||
              !nextNetwork.isConnected ||
              !isActiveBrokerSessionCurrent(identity)
            ) return;
            this.clearNetInfoListener();
            void this.connectForIdentity(identity);
          });
        }
        return;
      }

      this.reconnectAttempts += 1;
      const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        if (!this.isSuspended) void this.connectForIdentity(identity);
      }, delay);
    });
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private clearNetInfoListener(): void {
    this.netInfoUnsubscribe?.();
    this.netInfoUnsubscribe = null;
  }

  private teardownSocket(): void {
    const socket = this.ws;
    this.ws = null;
    this.isConnected = false;
    this.activeIdentity = null;
    if (!socket) return;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    socket.close();
  }

  private handleMessage(payload: unknown, identity: ActiveBrokerSessionIdentity): void {
    if (!sameIdentity(this.activeIdentity, identity) || !isActiveBrokerSessionCurrent(identity)) return;
    if (!payloadMatchesSocketIdentity(payload, identity)) return;
    const { type, channel, data } = payload as Record<string, any>;
    if (type !== 'channel_message' || typeof channel !== 'string') return;

    const store = useTradingState.getState();
    if (channel.startsWith('account.')) {
      store.setAccount(data);
    }
  }
}

export const wsService = WebSocketService.getInstance();
