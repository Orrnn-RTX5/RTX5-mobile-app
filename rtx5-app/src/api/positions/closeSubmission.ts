/**
 * Outcome handling for POST /positions/{ticket}/close (contract v3, 6.2).
 *
 * - 200: `{status:"closed"|"partial_closed", order_ticket:"1003",
 *   deal_ticket:"5005", state_version:"4", ...}`; the tickets are STRINGS.
 * - 202 `order_accepted`: poll /order-commands like a market order; if not
 *   final after 30 s, reconcile through GET /positions/{login}.
 * - 409 POSITION_ALREADY_CLOSED: the close is done; callers refresh.
 * - 503 ENGINE_CLOSE_UNAVAILABLE: surfaced once, never retried here.
 *
 * Dependencies are injected so the whole decision table is unit-testable
 * without a live broker session.
 */
import {
  createTradingApiError,
  getTradingErrorCode,
  type TradingApiError,
} from '../tradingErrors';
import {
  createOrderCommandRejectedError,
  createOrderConfirmationPendingError,
  isOrderAcceptedResponse,
  type PollOrderCommandOutcome,
} from '../orders/orderCommands';
import type { ClosePositionRequestDescriptor } from './closePayload';
import type { ClosePositionResponse } from './types';

export type CloseTransportResponse = Readonly<{
  status: number;
  body: unknown;
  retryAfter?: string | null;
}>;

export type ClosePositionExecutionDeps = Readonly<{
  send: (descriptor: ClosePositionRequestDescriptor) => Promise<CloseTransportResponse>;
  pollCommand: (clientOrderId: string) => Promise<PollOrderCommandOutcome>;
  /** Authoritative open-positions read used when a 202 never becomes final. */
  readOpenTickets: () => Promise<readonly string[]>;
}>;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const toTicketString = (value: unknown): string | undefined => {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return value.trim();
  return undefined;
};

/**
 * Accepts the contract 200 body (string order/deal tickets, string
 * state_version) and legacy numeric variants without throwing.
 */
export const normalizeClosePositionResponse = (
  value: unknown,
  fallbackTicket: string,
): ClosePositionResponse => {
  const record = asRecord(value) ?? {};
  const normalized: Record<string, unknown> = { ...record };
  const orderTicket = toTicketString(record.order_ticket);
  const dealTicket = toTicketString(record.deal_ticket);
  if (orderTicket !== undefined) normalized.order_ticket = orderTicket;
  if (dealTicket !== undefined) normalized.deal_ticket = dealTicket;
  if (record.state_version !== undefined && record.state_version !== null) {
    normalized.state_version = String(record.state_version);
  }
  if (normalized.ticket === undefined || normalized.ticket === null) {
    const numeric = Number(fallbackTicket);
    normalized.ticket = Number.isSafeInteger(numeric) ? numeric : fallbackTicket;
  }
  if (typeof normalized.status !== 'string' || !normalized.status.trim()) {
    normalized.status = record.partial === true ? 'partial_closed' : 'closed';
  }
  return normalized as ClosePositionResponse;
};

const alreadyClosedResponse = (descriptor: ClosePositionRequestDescriptor): ClosePositionResponse => {
  const numeric = Number(descriptor.ticket);
  return {
    ticket: Number.isSafeInteger(numeric) ? numeric : undefined,
    status: 'closed',
    client_order_id: descriptor.clientOrderId,
    already_closed: true,
  };
};

const isPositionAlreadyClosed = (status: number, body: unknown): boolean =>
  status === 409 && getTradingErrorCode({ status, data: body }) === 'POSITION_ALREADY_CLOSED';

export const executeClosePositionRequest = async (
  descriptor: ClosePositionRequestDescriptor,
  deps: ClosePositionExecutionDeps,
): Promise<ClosePositionResponse> => {
  const response = await deps.send(descriptor);

  if (response.status === 200) {
    return normalizeClosePositionResponse(response.body, descriptor.ticket);
  }

  if (
    response.status >= 200 &&
    response.status < 300 &&
    isOrderAcceptedResponse(response.status, response.body)
  ) {
    const outcome = await deps.pollCommand(descriptor.clientOrderId);
    if (outcome.kind === 'filled') {
      return normalizeClosePositionResponse(outcome.data, descriptor.ticket);
    }
    if (outcome.kind === 'rejected') {
      if (outcome.code === 'POSITION_ALREADY_CLOSED') return alreadyClosedResponse(descriptor);
      throw createOrderCommandRejectedError(outcome);
    }
    // Not final after 30 s: reconcile against the authoritative open list.
    let openTickets: readonly string[] | null = null;
    try {
      openTickets = await deps.readOpenTickets();
    } catch {
      openTickets = null;
    }
    if (openTickets && !openTickets.includes(descriptor.ticket)) {
      return {
        ...alreadyClosedResponse(descriptor),
        already_closed: false,
        confirmed_by: 'reconciliation',
      };
    }
    throw createOrderConfirmationPendingError(descriptor.clientOrderId);
  }

  if (isPositionAlreadyClosed(response.status, response.body)) {
    return alreadyClosedResponse(descriptor);
  }

  if (response.status >= 200 && response.status < 300) {
    // Unknown 2xx: never a rejection, but not a confirmed close either.
    throw createOrderConfirmationPendingError(descriptor.clientOrderId);
  }

  const headers: Record<string, string> = {};
  if (response.status === 429) headers['retry-after'] = response.retryAfter || '';
  const error: TradingApiError = createTradingApiError(
    response.status,
    response.body ?? {},
    headers,
  );
  throw error;
};
