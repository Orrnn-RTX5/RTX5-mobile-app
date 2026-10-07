type UnknownRecord = Record<string, unknown>;

/**
 * Legacy event names. Contract v3 no longer sends them (SL/TP hits arrive as
 * `position_closed` with `close_reason`), but they stay harmlessly accepted.
 */
const PROTECTION_TRIGGER_EVENTS = new Set(['sl.triggered', 'tp.triggered']);
const POSITION_CLOSED_EVENT = 'position.closed';
const CLOSE_REASON_TO_PROTECTION_EVENT: Readonly<Record<string, 'sl.triggered' | 'tp.triggered'>> =
  Object.freeze({
    sl: 'sl.triggered',
    tp: 'tp.triggered',
  });

const asRecord = (value: unknown): UnknownRecord | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;

const normalizeEventName = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, '.');

const normalizeCloseReason = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[.\s-]+/g, '_');

export type NormalizedProtectionTriggeredEvent = Readonly<{
  eventName: 'sl.triggered' | 'tp.triggered';
  ticket: number;
  row: Readonly<UnknownRecord>;
  journalPayload: Readonly<{
    ticket: number;
    position_ticket?: string | number;
    account_login?: string | number;
    symbol?: string;
    price_close?: number | string;
    price?: number | string;
    reason?: string;
    close_reason?: string;
    type: 'sl.triggered' | 'tp.triggered';
    event: 'sl.triggered' | 'tp.triggered';
  }>;
  eventFingerprint: string;
}>;

/**
 * Normalizes an SL/TP hit into one terminal event.
 *
 * Contract v3: `{type:'position_closed', data:{ticket, close_reason:'sl'|'tp', price_close,
 * profit, swap, deal_ticket, closed_at}}`. The other close reasons (`stop_out`,
 * `netting_close`, `netting_reverse`) are ordinary terminal closes, not SL/TP hits.
 * Legacy `{type:'sl_triggered'|'tp_triggered', data:{ticket}}` envelopes are still accepted.
 * Unknown/malformed messages remain harmless hints and return null.
 */
export const normalizeProtectionTriggeredEvent = (
  data: unknown,
  inheritedEventName = '',
): NormalizedProtectionTriggeredEvent | null => {
  const envelope = asRecord(data);
  if (!envelope) {
    return null;
  }

  const inherited = normalizeEventName(inheritedEventName);
  const rawEventName = (
    PROTECTION_TRIGGER_EVENTS.has(inherited) || inherited === POSITION_CLOSED_EVENT
      ? inherited
      : normalizeEventName(envelope.type ?? envelope.event ?? envelope.action)
  );

  const details =
    asRecord(envelope.data) ??
    asRecord(envelope.payload) ??
    asRecord(envelope.result) ??
    asRecord(envelope.position) ??
    envelope;

  const eventName = rawEventName === POSITION_CLOSED_EVENT
    ? CLOSE_REASON_TO_PROTECTION_EVENT[normalizeCloseReason(details.close_reason)] ?? ''
    : rawEventName;
  if (!PROTECTION_TRIGGER_EVENTS.has(eventName)) {
    return null;
  }

  const rawTicket = details.ticket;
  if (
    typeof rawTicket !== 'number' ||
    !Number.isSafeInteger(rawTicket) ||
    rawTicket <= 0
  ) {
    return null;
  }

  const ticket = rawTicket;
  const canonicalEventName = eventName as 'sl.triggered' | 'tp.triggered';
  const row = Object.freeze({
    ...details,
    ticket,
    position_ticket: details.position_ticket ?? ticket,
    event: canonicalEventName,
    type: canonicalEventName,
    status: canonicalEventName,
  });
  const eventSequence =
    details.event_id ??
    envelope.event_id ??
    details.deal_ticket ??
    details.closed_at ??
    details.correlation_id ??
    details.time_close ??
    details.time ??
    details.timestamp ??
    details.price_close ??
    envelope.correlation_id ??
    '';
  const closeReason = typeof details.close_reason === 'string' ? details.close_reason : undefined;

  return Object.freeze({
    eventName: canonicalEventName,
    ticket,
    row,
    journalPayload: Object.freeze({
      ticket,
      position_ticket: details.position_ticket as string | number | undefined,
      account_login: (details.account_login ?? details.login) as string | number | undefined,
      symbol: details.symbol as string | undefined,
      price_close: (details.price_close ?? details.close_price) as number | string | undefined,
      price: details.price as number | string | undefined,
      reason: (details.reason ?? closeReason) as string | undefined,
      ...(closeReason ? { close_reason: closeReason } : {}),
      type: canonicalEventName,
      event: canonicalEventName,
    }),
    eventFingerprint: `${canonicalEventName}:${String(ticket)}:${String(eventSequence)}`,
  });
};
