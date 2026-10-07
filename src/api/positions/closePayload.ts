/**
 * Wire bodies for POST /positions/{ticket}/close (backend contract v3, 6.2).
 *
 * - Full close:    {"client_order_id":"close-<ticket>-<uuid>"}
 *                  (the old `mode:"full"` field is ignored and not sent)
 * - Partial close: {"client_order_id":"...","volume":0.01}
 *                  `volume` MUST be a JSON number; "0.01" returns 400.
 *
 * `client_order_id` is the only idempotency the gateway honours. One id is
 * generated per user close action and reused only for exact resends of the
 * same body (the brokerApi replay after a 401 refresh).
 */
import { createClosePositionClientOrderId } from '../tradeIdempotency';

export type ClosePositionVolume = number | string;

export type FullClosePositionBody = Readonly<Record<string, never>>;
export type PartialClosePositionBody = Readonly<{ volume: number }>;

export type PreparedClosePositionRequest = Readonly<{
  body: FullClosePositionBody | PartialClosePositionBody;
  journalPayload?: Readonly<{ volume: number }>;
}>;

export type ClosePositionRequestDescriptor = Readonly<{
  ticket: string;
  endpoint: string;
  method: 'POST';
  clientOrderId: string;
  body: string;
  journalPayload?: Readonly<{ volume: number }>;
}>;

const FULL_CLOSE_BODY: FullClosePositionBody = Object.freeze({});
const DECIMAL_VOLUME_PATTERN = /^(?:\d+(?:\.\d*)?|\.\d+)$/;

/**
 * Position mutations must use the broker ticket, never a generated UI row id.
 * Numeric strings are preserved so 64-bit ticket values are not rounded by JS.
 */
export const normalizeClosePositionTicket = (ticket: string | number): string => {
  if (typeof ticket === 'number') {
    if (!Number.isSafeInteger(ticket) || ticket <= 0) {
      throw new TypeError('Position close requires a positive broker ticket.');
    }
    return String(ticket);
  }

  const normalized = ticket.trim();
  if (!/^\d+$/.test(normalized) || !/[1-9]/.test(normalized)) {
    throw new TypeError('Position close requires a positive broker ticket.');
  }
  return normalized;
};

/** Builds the full-close body. The descriptor adds `client_order_id`. */
export const buildFullClosePositionRequestPayload = (): PreparedClosePositionRequest => ({
  body: FULL_CLOSE_BODY,
});

/**
 * Builds the strict partial-close alternative. Decimal-string input is
 * accepted from callers but always serialized as a JSON number.
 */
export const buildPartialClosePositionRequestPayload = (
  volume: ClosePositionVolume,
): PreparedClosePositionRequest => {
  const normalizedVolume = typeof volume === 'string' ? volume.trim() : volume;
  if (
    (typeof normalizedVolume === 'string' && !DECIMAL_VOLUME_PATTERN.test(normalizedVolume)) ||
    (typeof normalizedVolume !== 'string' && typeof normalizedVolume !== 'number')
  ) {
    throw new TypeError('Partial close volume must be a positive number or decimal string.');
  }

  const parsedVolume = Number(normalizedVolume);
  if (!Number.isFinite(parsedVolume) || parsedVolume <= 0) {
    throw new TypeError('Partial close volume must be a positive number or decimal string.');
  }
  // Strip binary float noise (0.1 + 0.2) without changing a real lot value.
  const numericVolume = Number(parsedVolume.toFixed(8));

  return {
    body: Object.freeze({ volume: numericVolume }),
    journalPayload: Object.freeze({ volume: numericVolume }),
  };
};

/** Produces the complete RN-free request contract consumed by positionsApi. */
export const buildClosePositionRequestDescriptor = (
  ticketId: string | number,
  request: PreparedClosePositionRequest,
  clientOrderId?: string,
): ClosePositionRequestDescriptor => {
  const ticket = normalizeClosePositionTicket(ticketId);
  const resolvedClientOrderId = clientOrderId ?? createClosePositionClientOrderId(ticket);
  return Object.freeze({
    ticket,
    endpoint: `/positions/${ticket}/close`,
    method: 'POST',
    clientOrderId: resolvedClientOrderId,
    body: JSON.stringify({ client_order_id: resolvedClientOrderId, ...request.body }),
    ...(request.journalPayload ? { journalPayload: request.journalPayload } : {}),
  });
};
