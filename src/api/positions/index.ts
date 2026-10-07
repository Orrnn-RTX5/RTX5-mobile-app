/**
 * Trading Positions & History API (V2).
 *
 * Endpoints:
 *  GET  /api/v2/positions/{login}             — ALL open positions (no paging)
 *  GET  /api/v2/positions/{login}/history     — closed-trade history (time windows)
 *  POST /api/v2/positions/{ticket}/close      — close a single position
 *  PUT  /api/v2/positions/{ticket}            — modify SL/TP on an open position
 *
 * All calls routed through `apiClient` which auto-injects Bearer token and
 * handles 401 refresh loops. Originally a single 514-line file; split for the
 * 500-line ceiling into:
 *   - `types.ts`           — request/response shapes
 *   - `payloadHelpers.ts`  — wire-shape coercion helpers
 *   - `closedHistory.ts`   — paginated history loader
 */
import { apiClient } from '../apiClient';
import { createTradingApiError } from '../tradingErrors';
import {
  recordClosePositionGatewayLatency,
  recordClosePositionJournalFailure,
  recordClosePositionJournalRequest,
  recordClosePositionJournalSuccess,
  recordModifyPositionGatewayLatency,
  recordModifyPositionJournalFailure,
  recordModifyPositionJournalRequest,
  recordModifyPositionJournalSuccess,
  watchClosePositionExecution,
} from '../../state/terminalJournalState';
import { getApiLatencyNow } from '../../utils/apiLatency';
import { getPositionHistory } from './closedHistory';
import {
  buildFullClosePositionRequestPayload,
  buildPartialClosePositionRequestPayload,
  buildClosePositionRequestDescriptor,
  type ClosePositionVolume,
  type PreparedClosePositionRequest,
} from './closePayload';
import type {
  ClosePositionResponse,
  ModifyPositionPayload,
  Position,
} from './types';
import {
  AmbiguousModifyPositionOutcomeError,
  normalizeModifyPositionRequest,
  normalizePositiveSafeIntegerPathSegment,
  parseModifyPositionAck,
  type ModifyPositionAckWire,
} from './modifyPositionWire';
import { redactDiagnosticValue } from '../../utils/securityRedaction';
import { assertActiveExistingPositionSltpAllowed } from '../sltpCapabilityGuard';
import { captureActiveBrokerSessionOwnerStamp } from '../../state/activeBrokerSession';
import { StaleBrokerSessionError } from '../brokerApi';
import { pollOrderCommand } from '../orders/orderCommands';
import { executeClosePositionRequest } from './closeSubmission';

/** Contract 6.1/6.2: close can be held like a market order; wait >= 30 s. */
export const CLOSE_POSITION_HTTP_TIMEOUT_MS = 35_000;

const DEBUG_POSITIONS_API =
  typeof process !== 'undefined' && process.env.EXPO_PUBLIC_DEBUG_POSITIONS_API === 'true';

const logPositionsApiDiagnostic = (...args: Parameters<typeof console.log>) => {
  if (DEBUG_POSITIONS_API) {
    console.log(...args.map(redactDiagnosticValue));
  }
};

const warnPositionsApiDiagnostic = (...args: Parameters<typeof console.log>) => {
  if (DEBUG_POSITIONS_API) {
    console.log(...args.map(redactDiagnosticValue));
  }
};

const submitClosePositionRequest = async (
  ticketId: string | number,
  request: PreparedClosePositionRequest,
): Promise<ClosePositionResponse> => {
  // One client_order_id per user close action (close-<ticket>-<uuid>). The
  // only resend of these exact bytes is brokerApi's replay after a 401
  // refresh, which the gateway deduplicates by this id.
  const descriptor = buildClosePositionRequestDescriptor(ticketId, request);
  const owner = captureActiveBrokerSessionOwnerStamp();
  if (!owner) throw new StaleBrokerSessionError();
  recordClosePositionJournalRequest(descriptor.ticket, descriptor.journalPayload);
  try {
    const data = await executeClosePositionRequest(descriptor, {
      send: async (prepared) => {
        const sentAtMs = getApiLatencyNow();
        watchClosePositionExecution(prepared.clientOrderId, descriptor.ticket, sentAtMs);
        const response = await apiClient(prepared.endpoint, {
          method: prepared.method,
          // Optional mirror of the body id; the gateway ignores this header.
          headers: { 'Idempotency-Key': prepared.clientOrderId },
          body: prepared.body,
          timeoutMs: CLOSE_POSITION_HTTP_TIMEOUT_MS,
        });
        const body = await response.json().catch(() => ({}));
        recordClosePositionGatewayLatency(descriptor.ticket, getApiLatencyNow() - sentAtMs);
        return {
          status: response.status,
          body,
          retryAfter: response.headers.get('retry-after'),
        };
      },
      pollCommand: (clientOrderId) => pollOrderCommand({
        clientOrderId,
        accountLogin: owner.accountLogin,
      }),
      readOpenTickets: async () => {
        const positions = await positionsApi.getPositionsForReconciliation(owner.accountLogin);
        return positions.map((position) => String(position.ticket));
      },
    });
    recordClosePositionJournalSuccess(descriptor.ticket, data);
    return data;
  } catch (error) {
    recordClosePositionJournalFailure(descriptor.ticket, error);
    throw error;
  }
};

export type {
  Position,
  ClosedPosition,
  ClosePositionResponse,
  ModifyPositionPayload,
} from './types';
export type {
  KnownModifyPositionErrorCode,
  ModifyPositionAckWire,
  ModifyPositionErrorWire,
  ModifyPositionRequest,
  ReconciliablePosition,
} from './modifyPositionWire';
export {
  AmbiguousModifyPositionOutcomeError,
  normalizeModifyPositionRequest,
  normalizePositiveSafeIntegerPathSegment,
  normalizeReconciledProtectionValue,
  parseModifyPositionAck,
  parseModifyPositionError,
} from './modifyPositionWire';

export const positionsApi = {
  /**
   * Fetch ALL open positions for a trading account.
   *
   * GET /api/v2/positions/{login}
   *
   * The v3 gateway returns every open position as a bare array and ignores
   * limit/offset, so no paging parameters are sent (a limit=50 default used
   * to hide positions beyond the first page).
   *
   * @param login   - The trading account login number (e.g. 200074)
   * @returns Array of open Position objects from the live trading server
   */
  getPositions: async (login: number): Promise<Position[]> => {
    const url = `/positions/${login}`;
    logPositionsApiDiagnostic('[PositionsAPI] GET', url);

    const response = await apiClient(url);
    logPositionsApiDiagnostic('[PositionsAPI] Response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      warnPositionsApiDiagnostic('[PositionsAPI] Error response:', JSON.stringify(errorData));
      const headers: Record<string, string> = {};
      if (response.status === 429) headers['retry-after'] = response.headers.get('retry-after') || '';
      throw createTradingApiError(response.status, errorData, headers);
    }

    const json = await response.json();
    logPositionsApiDiagnostic('[PositionsAPI] Response type:', typeof json, Array.isArray(json) ? `array[${json.length}]` : 'not-array');

    // The authenticated gateway source contract is an authoritative unwrapped
    // array. Do not reinterpret an unknown object as an empty ledger because
    // that could erase valid positions and their chart lines.
    if (Array.isArray(json)) return json;
    warnPositionsApiDiagnostic('[PositionsAPI] Unexpected response shape:', JSON.stringify(json).slice(0, 200));
    throw createTradingApiError(502, {
      error: 'INVALID_RESPONSE',
      message: 'Positions endpoint returned an unexpected non-array response.',
    });
  },

  /**
   * Strict authoritative read used after every existing-position SL/TP PUT.
   *
   * The current gateway contract is an unwrapped array. Unlike the general
   * polling compatibility method above, an ambiguous wrapper or invalid JSON
   * must fail closed because treating it as an empty ledger could delete a
   * still-open position.
   */
  getPositionsForReconciliation: async (
    login: string | number,
    requestOptions: Readonly<{ signal?: AbortSignal; timeoutMs?: number }> = {},
  ): Promise<Position[]> => {
    const normalizedLogin = normalizePositiveSafeIntegerPathSegment(login, 'Account login');
    const response = await apiClient(`/positions/${normalizedLogin.path}`, {
      method: 'GET',
      signal: requestOptions.signal,
      timeoutMs: requestOptions.timeoutMs,
      headers: { accept: 'application/json' },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const headers: Record<string, string> = {};
      if (response.status === 429) headers['retry-after'] = response.headers.get('retry-after') || '';
      throw createTradingApiError(response.status, errorData, headers);
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new AmbiguousModifyPositionOutcomeError(
        'Positions reconciliation returned an unreadable JSON body.',
        response.status,
      );
    }
    if (!Array.isArray(data)) {
      throw new AmbiguousModifyPositionOutcomeError(
        'Positions reconciliation returned an unexpected wrapped response.',
        response.status,
      );
    }
    return data as Position[];
  },

  /**
   * Fetch closed position history for a trading account.
   *
   * GET /api/v2/positions/{login}/history?from={unix s}&to={unix s}
   *
   * The endpoint ignores limit/offset and returns at most 500 rows, so the
   * loader walks backwards in from/to time windows (see closedHistory.ts).
   */
  getPositionHistory,

  /**
   * Close an open position by its ticket ID.
   *
   * POST /api/v2/positions/{ticketId}/close
   *
   * The position must belong to an account owned by the authenticated user.
   * Uses a DB transaction for atomicity. Rejected if market data returns
   * zero or negative prices.
   *
   * Error responses:
   * - 404: Position not found
   * - 429: Rate limited — check Retry-After header
   */
  closePosition: async (ticketId: string | number): Promise<ClosePositionResponse> =>
    submitClosePositionRequest(ticketId, buildFullClosePositionRequestPayload()),

  /**
   * Partial close is intentionally a separate method so the wire body contains
   * volume only and can never be combined with the full-close mode.
   */
  closePositionPartial: async (
    ticketId: string | number,
    volume: ClosePositionVolume,
  ): Promise<ClosePositionResponse> =>
    submitClosePositionRequest(ticketId, buildPartialClosePositionRequestPayload(volume)),

  /**
   * Modify an open position's SL/TP values.
   *
   * PUT /api/v2/positions/{ticketId}
   *
   * SL/TP values are validated against the current market price on the server.
   *
   * @param ticketId - The position ticket number to modify
   * @param payload  - New SL/TP values
   * @returns Strict partial database acknowledgement; authoritative state comes
   *          only from the mandatory positions-list reconciliation.
   */
  modifyPosition: async (
    ticketId: string | number,
    payload: ModifyPositionPayload,
    requestOptions: Readonly<{
      expectedSymbol: string;
      signal?: AbortSignal;
      timeoutMs?: number;
      onResponseMetadata?: (metadata: Readonly<{
        status: number;
        requestId?: string;
        serverTiming?: string;
      }>) => void;
    }>,
  ): Promise<ModifyPositionAckWire> => {
    // Defense in depth: direct/programmatic callers must not bypass the UI
    // capability gate. This throws before journaling or any network request.
    assertActiveExistingPositionSltpAllowed();
    const normalizedTicket = normalizePositiveSafeIntegerPathSegment(ticketId, 'Position ticket');
    const normalizedPayload = normalizeModifyPositionRequest(payload);
    recordModifyPositionJournalRequest(normalizedTicket.path, normalizedPayload);
    let failureRecorded = false;
    const sentAtMs = getApiLatencyNow();
    try {
      const response = await apiClient(`/positions/${normalizedTicket.path}`, {
        method: 'PUT',
        headers: {
          accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(normalizedPayload),
        signal: requestOptions.signal,
        timeoutMs: requestOptions.timeoutMs,
        replayAfterAuthRefresh: false,
      });
      recordModifyPositionGatewayLatency(normalizedTicket.path, getApiLatencyNow() - sentAtMs);
      try {
        const requestId = response.headers.get('x-request-id')?.trim();
        const serverTiming = response.headers.get('server-timing')?.trim();
        requestOptions.onResponseMetadata?.(Object.freeze({
          status: response.status,
          ...(requestId ? { requestId } : {}),
          ...(serverTiming ? { serverTiming } : {}),
        }));
      } catch {
        // Observability is best-effort and must never alter mutation handling.
      }

      if (response.status !== 200) {
        if (response.status >= 200 && response.status < 300) {
          const error = new AmbiguousModifyPositionOutcomeError(
            `Modify Position returned ambiguous HTTP ${response.status}.`,
            response.status,
          );
          failureRecorded = true;
          recordModifyPositionJournalFailure(normalizedTicket.path, normalizedPayload, error);
          throw error;
        }
        const errorData = await response.json().catch(() => ({}));
        const headers: Record<string, string> = {};
        if (response.status === 429) headers['retry-after'] = response.headers.get('retry-after') || '';
        const error = createTradingApiError(response.status, errorData, headers);
        failureRecorded = true;
        recordModifyPositionJournalFailure(normalizedTicket.path, normalizedPayload, error);
        throw error;
      }

      let data: unknown;
      try {
        data = await response.json();
      } catch {
        const error = new AmbiguousModifyPositionOutcomeError(
          'Modify Position returned an unreadable HTTP 200 body.',
          response.status,
        );
        failureRecorded = true;
        recordModifyPositionJournalFailure(normalizedTicket.path, normalizedPayload, error);
        throw error;
      }
      let acknowledgement: ModifyPositionAckWire;
      try {
        acknowledgement = parseModifyPositionAck(data, {
          ticket: normalizedTicket.path,
          symbol: requestOptions.expectedSymbol,
          request: normalizedPayload,
        });
      } catch (error) {
        failureRecorded = true;
        recordModifyPositionJournalFailure(normalizedTicket.path, normalizedPayload, error);
        throw error;
      }
      recordModifyPositionJournalSuccess(normalizedTicket.path, normalizedPayload, acknowledgement);
      return acknowledgement;
    } catch (error) {
      if (!failureRecorded) {
        recordModifyPositionJournalFailure(normalizedTicket.path, normalizedPayload, error);
      }
      throw error;
    }
  },
};
