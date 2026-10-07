/**
 * Pure protocol helpers for the trade WebSocket (`wss://<host>/ws/v2?token=`).
 *
 * Contract v3 (2026-09-24):
 *  - Send one channel per message: `{"action":"subscribe","channel":"positions.<login>"}`
 *    and `metrics.<login>`. `deals.<login>` is dropped (nothing is ever sent on it).
 *  - Keepalive: `{"action":"ping"}` -> `{"action":"pong","success":true,"data":{"time":<ms>}}`.
 *  - Ack: `{"type":"subscribed","channel":"..."}`; error: `{"type":"error","channel","message"}`.
 *  - Events are nested: `{"channel":"positions.200074","data":{"event_id","client_order_id",
 *    "type":"position_opened","data":{...row}}}`. The event name is `data.type`, the
 *    payload is `data.data`. The older flat shapes remain tolerated.
 *  - SL/TP hits arrive as `position_closed` with `data.data.close_reason`.
 *
 * Kept free of React Native imports so it can be unit tested under node.
 */

export const TRADE_SOCKET_CHANNEL_PREFIXES = ['positions', 'metrics'] as const;

export type TradeSocketSubscribeMessage = Readonly<{ action: 'subscribe'; channel: string }>;

export const buildTradeSocketSubscriptionMessages = (
  accountLogin: string | number,
): ReadonlyArray<TradeSocketSubscribeMessage> => {
  const login = String(accountLogin ?? '').trim();
  if (!login) return [];
  return TRADE_SOCKET_CHANNEL_PREFIXES.map((prefix) => Object.freeze({
    action: 'subscribe' as const,
    channel: `${prefix}.${login}`,
  }));
};

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;

const cleanString = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';

/** `position_closed` / `position.closed` / `Position-Closed` -> `position.closed`. */
export const normalizeTradeSocketEventName = (value: unknown): string =>
  cleanString(value)
    .toLowerCase()
    .replace(/[_-]+/g, '.');

export type TradeSocketFrame =
  | Readonly<{ kind: 'pong' }>
  | Readonly<{ kind: 'ack'; channel: string }>
  | Readonly<{ kind: 'error'; channel: string; message: string }>
  | Readonly<{
      kind: 'event';
      channel: string;
      /** Normalized dotted event name, e.g. `position.closed`, `metrics.update`. */
      eventName: string;
      /**
       * The record that carries the event name. For the nested contract this is
       * `frame.data` (`{event_id, type, data}`); for flat legacy frames it is the
       * outer data object or the frame itself.
       */
      envelope: UnknownRecord | null;
      /** The event payload: `data.data` (object or array) for the nested contract. */
      payload: unknown;
      /** True when the frame used the nested `{channel, data:{type, data}}` envelope. */
      nested: boolean;
      eventId?: string;
      clientOrderId?: string;
    }>
  | Readonly<{ kind: 'unknown' }>;

const CONTROL_ACK_TYPES = new Set(['subscribed', 'subscribe.ack', 'subscribed.ack']);

/**
 * Classifies one parsed trade-socket JSON frame.
 */
export const parseTradeSocketFrame = (payload: unknown): TradeSocketFrame => {
  const record = asRecord(payload);
  if (!record) return Object.freeze({ kind: 'unknown' as const });

  const action = normalizeTradeSocketEventName(record.action);
  const type = normalizeTradeSocketEventName(record.type);
  const channel = cleanString(record.channel ?? record.topic);

  if (action === 'pong' || type === 'pong') {
    return Object.freeze({ kind: 'pong' as const });
  }
  if (CONTROL_ACK_TYPES.has(type)) {
    return Object.freeze({ kind: 'ack' as const, channel });
  }
  if (type === 'error') {
    return Object.freeze({
      kind: 'error' as const,
      channel,
      message: cleanString(record.message ?? record.error) || 'Trade socket error',
    });
  }

  const outerData = record.data ?? record.payload ?? record.result;
  const outerRecord = asRecord(outerData);
  const outerEventName = normalizeTradeSocketEventName(
    outerRecord?.type ?? outerRecord?.event ?? outerRecord?.action,
  );
  const nested = Boolean(
    outerRecord &&
    outerEventName &&
    Object.prototype.hasOwnProperty.call(outerRecord, 'data'),
  );

  if (nested && outerRecord) {
    return Object.freeze({
      kind: 'event' as const,
      channel,
      eventName: outerEventName,
      envelope: outerRecord,
      payload: outerRecord.data,
      nested: true,
      ...(cleanString(outerRecord.event_id) ? { eventId: cleanString(outerRecord.event_id) } : {}),
      ...(cleanString(outerRecord.client_order_id)
        ? { clientOrderId: cleanString(outerRecord.client_order_id) }
        : {}),
    });
  }

  // Legacy flat shapes: `{channel, event, data:[rows]}`, `{channel, data:{...row}}`,
  // `{type:'position.update', data:{...}}`, or a bare record.
  const eventName =
    outerEventName ||
    normalizeTradeSocketEventName(record.type ?? record.event ?? record.action);
  return Object.freeze({
    kind: 'event' as const,
    channel,
    eventName,
    envelope: outerRecord ?? record,
    payload: outerData ?? record,
    nested: false,
  });
};

export type PositionEventKind =
  /** A full row for one position (opened/increased/decreased/reversed/modified/swap). */
  | 'upsert'
  /** A partial close: history changes; the row's volume semantics are not guaranteed. */
  | 'partial_close'
  /** The position is gone (`position_closed`). */
  | 'closed'
  /** `position_update`: `data.data` is an array of rows (unversioned hints). */
  | 'batch'
  /** Account-level risk event (e.g. `margin_call`). */
  | 'account'
  | 'unknown';

const POSITION_EVENT_KINDS: Readonly<Record<string, PositionEventKind>> = Object.freeze({
  'position.opened': 'upsert',
  'position.increased': 'upsert',
  'position.decreased': 'upsert',
  'position.reversed': 'upsert',
  'position.modified': 'upsert',
  'swap.applied': 'upsert',
  'position.partial.close': 'partial_close',
  'position.closed': 'closed',
  'position.update': 'batch',
  'margin.call': 'account',
});

export const classifyPositionEvent = (eventName: string): PositionEventKind =>
  POSITION_EVENT_KINDS[normalizeTradeSocketEventName(eventName)] ?? 'unknown';

/** Events that change the deal/position history and must refresh history caches. */
const HISTORY_CHANGING_EVENTS = new Set([
  'position.closed',
  'position.partial.close',
  'position.decreased',
  'position.reversed',
  'position.increased',
  'position.opened',
]);

export const isHistoryChangingPositionEvent = (eventName: string): boolean =>
  HISTORY_CHANGING_EVENTS.has(normalizeTradeSocketEventName(eventName));

/** Events that change balance/margin/order state and must refresh account summaries. */
const ACCOUNT_CHANGING_EVENTS = new Set([
  ...HISTORY_CHANGING_EVENTS,
  'swap.applied',
  'margin.call',
]);

export const isAccountChangingPositionEvent = (eventName: string): boolean =>
  ACCOUNT_CHANGING_EVENTS.has(normalizeTradeSocketEventName(eventName));

export const POSITION_CLOSE_REASONS = [
  'sl',
  'tp',
  'stop_out',
  'netting_close',
  'netting_reverse',
] as const;

export type PositionCloseReason = (typeof POSITION_CLOSE_REASONS)[number];

/** Reads `close_reason` from a `position_closed` row; unknown values return null. */
export const readPositionCloseReason = (row: unknown): PositionCloseReason | null => {
  const record = asRecord(row);
  if (!record) return null;
  const raw = cleanString(record.close_reason ?? record.closeReason)
    .toLowerCase()
    .replace(/[.\s-]+/g, '_');
  return (POSITION_CLOSE_REASONS as readonly string[]).includes(raw)
    ? (raw as PositionCloseReason)
    : null;
};

export const isMetricsEventName = (eventName: string): boolean => {
  const normalized = normalizeTradeSocketEventName(eventName);
  return normalized === 'metrics.update' || normalized.startsWith('metrics');
};

/**
 * Decides whether an active-session event must cycle the trade socket. The
 * server authenticates `/ws/v2` only at upgrade time and never re-checks the
 * token, so every credential rotation (token refresh) must close and reopen
 * the socket with the new access token.
 */
export const shouldCycleTradeSocketForSessionEvent = (
  event: Readonly<{ type: string; activeSession?: unknown }>,
  socketDemandActive: boolean,
): boolean => Boolean(
  socketDemandActive &&
  event.type === 'credentials_updated' &&
  event.activeSession,
);
