import { redactDiagnosticValue } from '../utils/securityRedaction';

export type MarketDataEventName =
  | 'directory_schema_result'
  | 'bootstrap_gate'
  | 'session_epoch_changed'
  | 'auth_outcome'
  | 'refresh_outcome'
  | 'socket_open'
  | 'socket_close'
  | 'reconnect_scheduled'
  | 'subscribe_ack'
  | 'health_transition'
  | 'payload_dropped'
  | 'trade_blocked'
  | 'modify_position';

export type MarketDataTelemetryEvent = Readonly<{
  name: MarketDataEventName;
  recordedAt: number;
  details: unknown;
}>;

const MAX_EVENTS = 200;
let events: MarketDataTelemetryEvent[] = [];
let liveQuoteSocketCount = 0;
let reconnectStartedAt: number | null = null;
let lastReconnectDurationMs: number | null = null;
let completedReconnectCount = 0;

export type MarketDataOperationalMetricsSnapshot = Readonly<{
  liveQuoteSocketCount: number;
  reconnectInProgress: boolean;
  lastReconnectDurationMs: number | null;
  completedReconnectCount: number;
}>;

/** Stable non-secret identifier for endpoint-host correlation in support data. */
export const fingerprintMarketDataHost = (urlOrHost: string): string => {
  let host = '';
  try {
    host = new URL(urlOrHost).hostname.toLowerCase();
  } catch {
    host = String(urlOrHost ?? '').trim().toLowerCase();
  }
  if (!host) return 'missing';

  let hash = 0x811c9dc5;
  for (let index = 0; index < host.length; index += 1) {
    hash ^= host.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

/** Keeps the support gauge truthful for both remote closes and local teardown. */
export const setLiveQuoteSocketConnected = (connected: boolean): void => {
  liveQuoteSocketCount = connected ? 1 : 0;
};

export const recordMarketDataEvent = (
  name: MarketDataEventName,
  details: unknown = {},
): void => {
  const recordedAt = Date.now();
  if (name === 'reconnect_scheduled' && reconnectStartedAt === null) {
    reconnectStartedAt = recordedAt;
  } else if (name === 'socket_open') {
    setLiveQuoteSocketConnected(true);
    if (reconnectStartedAt !== null) {
      lastReconnectDurationMs = Math.max(0, recordedAt - reconnectStartedAt);
      completedReconnectCount += 1;
      reconnectStartedAt = null;
    }
  } else if (name === 'socket_close') {
    setLiveQuoteSocketConnected(false);
  }

  const event = Object.freeze({
    name,
    recordedAt,
    details: redactDiagnosticValue(details),
  });
  events = [event, ...events].slice(0, MAX_EVENTS);
};

export const getMarketDataTelemetrySnapshot = (): readonly MarketDataTelemetryEvent[] =>
  events.map((event) => Object.freeze({ ...event }));

export const getMarketDataOperationalMetricsSnapshot =
  (): MarketDataOperationalMetricsSnapshot => Object.freeze({
    liveQuoteSocketCount,
    reconnectInProgress: reconnectStartedAt !== null,
    lastReconnectDurationMs,
    completedReconnectCount,
  });

export const resetMarketDataTelemetryForTests = (): void => {
  events = [];
  liveQuoteSocketCount = 0;
  reconnectStartedAt = null;
  lastReconnectDurationMs = null;
  completedReconnectCount = 0;
};
