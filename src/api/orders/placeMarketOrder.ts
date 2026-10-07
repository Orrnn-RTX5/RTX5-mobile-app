/**
 * Place a market order on the trading server.
 *
 * POST /api/v2/orders (backend contract v3, sections 6.0 and 6.1)
 *
 * - Idempotency is the body field `client_order_id` (`order-<uuidv4>`).
 *   The `Idempotency-Key` header is ignored by the gateway and is kept only
 *   as a harmless mirror of the same id.
 * - The server can hold the request for up to 25 s, so the HTTP budget is
 *   MARKET_ORDER_HTTP_TIMEOUT_MS (>= 30 s).
 * - 200 is always a fill ({order_ticket, position_ticket, price, status:
 *   "filled", action}). A 200 never means "rejected"; rejections are 4xx/5xx
 *   `{"error","message"}` envelopes (including a generic ORDER_REJECTED).
 * - 202 `order_accepted` is confirmed by polling /order-commands; if it is
 *   not final within 30 s the caller gets "Confirmation Pending" and the
 *   captured-owner reconciliation below re-reads GET /positions/{login}.
 */
import { apiClient } from '../apiClient';
import { StaleBrokerSessionError } from '../brokerApi';
import { assertTradeSide } from '../../domain/tradeSide';
import { createTradingApiError, getTradingErrorCode, TradingApiError } from '../tradingErrors';
import {
  createOrderCommandRejectedError,
  createOrderConfirmationPendingError,
  isOrderAcceptedResponse,
  pollOrderCommand,
} from './orderCommands';
import {
  recordMarketOrderGatewayLatency,
  recordMarketOrderJournalFailure,
  recordMarketOrderJournalRequest,
  recordMarketOrderJournalSuccess,
  watchMarketOrderExecution,
} from '../../state/terminalJournalState';
import {
  captureActiveBrokerSessionOwnerStamp,
  isActiveBrokerSessionOwnerStampCurrent,
  type ActiveBrokerSessionOwnerStamp,
} from '../../state/activeBrokerSession';
import { usePositionsState } from '../../state/positionsState';
import { getApiLatencyNow, recordApiLatency } from '../../utils/apiLatency';
import { takeTradeIntentStartedAt } from '../../utils/tradeIntent';
import { recordOrderLatencySample, type OrderTerminalStatus } from '../../state/orderLatencyTelemetry';
import { buildJournalSessionScopeKey } from '../../state/journalSessionScope';
import { resolveBrokerSymbol, resolveBrokerSymbolFromCache } from './symbolResolver';
import { buildMarketOrderSymbolCandidates, getAcceptedSymbolCacheKey } from './placeMarketOrderCandidates';
import type { PlaceOrderPayload, PlaceOrderResponse } from './types';
import { redactDiagnosticValue } from '../../utils/securityRedaction';
import { assertActiveMarketProtectionAllowed } from '../sltpCapabilityGuard';
import { createMarketOrderClientOrderId } from '../tradeIdempotency';
import { positionsApi } from '../positions';
import { beginProtectedPositionsMutation } from '../../state/positionsMutationBarrier';
import { reconcileMarketOrderPositions } from './marketPositionReconciliation';
import {
  beginCoalescedMarketOrderReconciliation,
  resetMarketOrderReconciliationCoordinatorForTests,
} from './marketOrderReconciliationCoordinator';

const acceptedOrderSymbolCache = new Map<string, string>();

/** Contract 6.1: at least 30 s; the gateway may wait 25 s for the fill. */
export const MARKET_ORDER_HTTP_TIMEOUT_MS = 35_000;
const ORDER_DIAGNOSTICS_ENABLED =
  typeof process !== 'undefined' && process.env.EXPO_PUBLIC_DEBUG_CHART_TRADE === 'true';

const logOrderDiagnostic = (...args: Parameters<typeof console.log>) => {
  if (ORDER_DIAGNOSTICS_ENABLED) {
    console.log(...args.map(redactDiagnosticValue));
  }
};

const warnOrderDiagnostic = (...args: Parameters<typeof console.log>) => {
  if (ORDER_DIAGNOSTICS_ENABLED) {
    console.log(...args.map(redactDiagnosticValue));
  }
};

const toCanonicalDecimalString = (
  value: number | string,
  label: string,
): string => {
  const numeric = typeof value === 'number' ? value : Number(value.trim());
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw createTradingApiError(400, {
      error: 'INVALID_INPUT',
      message: `${label} must be a positive decimal.`,
    });
  }
  const normalized = numeric.toFixed(8).replace(/(?:\.0+|(\.\d+?)0+)$/, '$1');
  if (!normalized || Number(normalized) !== numeric) {
    throw createTradingApiError(400, {
      error: 'INVALID_INPUT',
      message: `${label} supports at most 8 fractional digits.`,
    });
  }
  return normalized;
};

const hasOwn = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const utf8ByteLength = (value: string): number => {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    bytes += codePoint <= 0x7f
      ? 1
      : codePoint <= 0x7ff
        ? 2
        : codePoint <= 0xffff
          ? 3
          : 4;
  }
  return bytes;
};

const normalizeMarketOrderSymbol = (value: unknown): string => {
  const symbol = String(value ?? '').trim();
  if (!symbol) {
    throw createTradingApiError(400, {
      error: 'INVALID_INPUT',
      message: 'Order symbol is required.',
    });
  }
  if (utf8ByteLength(symbol) > 20) {
    throw createTradingApiError(400, {
      error: 'INVALID_INPUT',
      message: 'Order symbol must not exceed 20 bytes.',
    });
  }
  return symbol;
};

/**
 * One `client_order_id` per distinct wire body, for the lifetime of ONE user
 * action (one placeMarketOrder call).
 *
 * - Identical body (an exact retry of the same user action, including the
 *   brokerApi replay after a 401 refresh, which resends these exact bytes)
 *   => the SAME id, so the gateway deduplicates it.
 * - Different body (the symbol-candidate retry sends another symbol) => a NEW
 *   id. Reusing the id with a different body would be rejected with
 *   409 IDEMPOTENCY_CONFLICT. A candidate retry only happens after the server
 *   answered with a symbol/market-data miss, i.e. nothing was executed.
 * - A new tap is a new user action and always gets a new id.
 */
const createPayloadBoundClientOrderIdResolver = () => {
  const idsBySerializedBody = new Map<string, string>();
  return (serializedBody: string): string => {
    const existing = idsBySerializedBody.get(serializedBody);
    if (existing) return existing;
    const created = createMarketOrderClientOrderId();
    idsBySerializedBody.set(serializedBody, created);
    return created;
  };
};

type MarketOrderAttemptTrace = {
  /** client_order_id of the latest attempt sent (the accepted one on success). */
  clientOrderId?: string;
  symbol?: string;
};

const placeMarketOrderAttempt = async (
  payload: PlaceOrderPayload,
  trace: MarketOrderAttemptTrace,
): Promise<PlaceOrderResponse> => {
  const initialOwner = captureActiveBrokerSessionOwnerStamp();
  if (!initialOwner) throw new StaleBrokerSessionError();
  let owner: ActiveBrokerSessionOwnerStamp = initialOwner;
  assertActiveMarketProtectionAllowed(payload as unknown as Record<string, unknown>);
  const cacheNamespace = owner.cacheNamespace;
  const assertOrderSessionCurrent = () => {
    if (!isActiveBrokerSessionOwnerStampCurrent(owner)) {
      throw new StaleBrokerSessionError();
    }
  };
  const adoptCurrentCredentialOwner = () => {
    const currentOwner = captureActiveBrokerSessionOwnerStamp();
    if (
      !currentOwner ||
      currentOwner.brokerId !== owner.brokerId ||
      currentOwner.accountLogin !== owner.accountLogin ||
      currentOwner.apiBase !== owner.apiBase ||
      currentOwner.cacheNamespace !== owner.cacheNamespace ||
      currentOwner.sessionEpoch !== owner.sessionEpoch
    ) {
      throw new StaleBrokerSessionError();
    }
    // brokerApi may causally rotate credentials during preflight refresh. Its
    // bound response reader already rejects unrelated/stale response owners,
    // so adopting the still-current same-session owner is safe here.
    owner = currentOwner;
  };

  // The gateway's canonical market-order field is `account_login`. Keep the
  // caller-facing value flexible for persisted sessions, but put an integer on
  // the wire and never send both account aliases.
  const { account_login, ...rest } = payload;
  const loginInt =
    typeof account_login === 'string' ? Number(account_login.trim()) : account_login;
  if (!Number.isSafeInteger(loginInt) || loginInt <= 0) {
    throw createTradingApiError(400, {
      error: 'INVALID_INPUT',
      message: 'A valid trading account login is required to place an order.',
    });
  }
  if (String(loginInt) !== owner.accountLogin) {
    throw createTradingApiError(403, {
      error: 'BROKER_REQUIRED',
      message: 'Order account does not match the active broker session.',
    });
  }

  // Symbol routing must stay out of the tap-to-POST critical path. The first
  // attempt uses already-known local data. A network /instruments lookup is
  // only performed after the server reports a market-data/symbol miss.
  const callerSymbol = normalizeMarketOrderSymbol(payload.symbol);

  // Remove broker_id from the body. The server resolves broker context from
  // the JWT claim; apiClient owns token refresh and broker-context recovery.
  const { broker_id: _ignored, ...restWithoutBroker } = rest;

  const requestedSide = assertTradeSide(restWithoutBroker.side);
  const orderBody: Record<string, unknown> = {
    account_login: loginInt,
    symbol: callerSymbol,
    side: requestedSide,
    volume: toCanonicalDecimalString(restWithoutBroker.volume, 'Order volume'),
    type: 'market',
  };

  // Caller-facing legacy names are translated into the gateway's one
  // canonical field family. The API-level capability guard above prevents
  // these fields from reaching transport while the broker runtime is locked.
  for (const family of [
    ['sl', 'price_sl', 'Stop Loss'],
    ['tp', 'price_tp', 'Take Profit'],
  ] as const) {
    const [canonicalKey, legacyKey, label] = family;
    if (hasOwn(restWithoutBroker, canonicalKey) && hasOwn(restWithoutBroker, legacyKey)) {
      throw createTradingApiError(400, {
        error: 'INVALID_INPUT',
        message: `Use only the canonical market ${label} field.`,
      });
    }
    const usesCanonical = hasOwn(restWithoutBroker, canonicalKey);
    const value = usesCanonical
      ? restWithoutBroker[canonicalKey]
      : restWithoutBroker[legacyKey];
    if (value === undefined || value === null) continue;
    // Compatibility-only price_sl/price_tp historically use literal zero as
    // "unset". Canonical sl/tp zero is submitted input and remains invalid.
    if (!usesCanonical && Number(value) === 0) continue;
    orderBody[canonicalKey] = toCanonicalDecimalString(
      value as number | string,
      label,
    );
  }
  // `fill_mode` is ignored by the gateway (contract 6.1) and is never sent.
  if (typeof restWithoutBroker.comment === 'string' && restWithoutBroker.comment.length > 0) {
    if (utf8ByteLength(restWithoutBroker.comment) > 1024) {
      throw createTradingApiError(400, {
        error: 'INVALID_INPUT',
        message: 'Order comment must not exceed 1024 bytes.',
      });
    }
    orderBody.comment = restWithoutBroker.comment;
  }
  if (typeof restWithoutBroker.trailing_stop === 'number' && restWithoutBroker.trailing_stop > 0) {
    orderBody.trailing_stop = restWithoutBroker.trailing_stop;
  }
  if (typeof restWithoutBroker.trailing_step === 'number' && restWithoutBroker.trailing_step > 0) {
    orderBody.trailing_step = restWithoutBroker.trailing_step;
  }
  // `magic` is intentionally never copied. The trader gateway strictly
  // rejects that manager/EA-only field as unknown input.

  logOrderDiagnostic('[RTX5 Order] active broker session:', owner.brokerId);
  logOrderDiagnostic('[TRADE-PAYLOAD]', {
    symbol: callerSymbol,
    side: requestedSide,
    action: requestedSide,
    orderType: 'market',
    command: requestedSide,
    tradeType: 'market',
    volume: restWithoutBroker.volume,
    priceSource: requestedSide === 'buy' ? 'ask' : 'bid',
    rawPayload: orderBody,
  });
  const journalPayload = {
    account_login: loginInt,
    symbol: callerSymbol,
    side: requestedSide,
    volume: restWithoutBroker.volume,
    price_sl: restWithoutBroker.price_sl,
    price_tp: restWithoutBroker.price_tp,
    started_at_ms: Date.now(),
  };
  recordMarketOrderJournalRequest(journalPayload);
  const resolveClientOrderId = createPayloadBoundClientOrderIdResolver();
  let createRequestStarted = false;
  let reconciliationHandle: ReturnType<
    typeof beginCoalescedMarketOrderReconciliation
  > | null = null;
  let reconciliationResponse: PlaceOrderResponse | null = null;

  type Attempt = {
    symbol: string;
    clientOrderId: string;
    status: number;
    body: any;
    response: Response;
    /** 200: the body is the fill. */
    ok: boolean;
    /** 202 order_accepted: confirm through /order-commands. */
    acceptedAsync: boolean;
  };

  const unwrap = (json: any): any => {
    if (!json || typeof json !== 'object') return json;
    if (json.data && !Array.isArray(json.data)) return json.data;
    if (json.result && !Array.isArray(json.result)) return json.result;
    if (Array.isArray(json) && json.length > 0) return json[0];
    if (Array.isArray(json.data) && json.data.length > 0) return json.data[0];
    return json;
  };

  const sendOrder = async (symbolToSend: string): Promise<Attempt> => {
    assertOrderSessionCurrent();
    const canonicalSymbol = normalizeMarketOrderSymbol(symbolToSend);
    const body = { ...orderBody, symbol: canonicalSymbol };
    const serializedBody = JSON.stringify(body);
    const clientOrderId = resolveClientOrderId(serializedBody);
    trace.clientOrderId = clientOrderId;
    trace.symbol = canonicalSymbol;
    const wireBody = JSON.stringify({ client_order_id: clientOrderId, ...body });
    logOrderDiagnostic('[RTX5 Order] POST /orders body:', wireBody);
    const startedAtMs = getApiLatencyNow();
    // The backend echoes this id on its realtime execution event, which
    // writes the journal's Terminal "Order executed" row.
    watchMarketOrderExecution(clientOrderId, { ...journalPayload, symbol: canonicalSymbol }, startedAtMs);
    let response: Response | null = null;

    try {
      if (!createRequestStarted) {
        reconciliationHandle?.markTransportStarted();
      }
      createRequestStarted = true;
      response = await apiClient('/orders', {
        method: 'POST',
        // Optional mirror of the body id; the gateway ignores this header.
        headers: { 'Idempotency-Key': clientOrderId },
        body: wireBody,
        timeoutMs: MARKET_ORDER_HTTP_TIMEOUT_MS,
      });
      let raw: any;
      try {
        raw = await response.json();
      } catch (error) {
        if (error instanceof StaleBrokerSessionError) throw error;
        raw = {};
      }
      adoptCurrentCredentialOwner();
      assertOrderSessionCurrent();
      const ok = response.status === 200;
      const acceptedAsync = response.status >= 200 &&
        response.status < 300 &&
        !ok &&
        isOrderAcceptedResponse(response.status, raw);
      const durationMs = getApiLatencyNow() - startedAtMs;
      recordApiLatency({
        label: `trade.placeMarketOrder.${requestedSide}`,
        method: 'POST',
        endpoint: '/orders',
        source: 'trade',
        status: response.status,
        ok: ok || acceptedAsync,
        durationMs,
      });
      recordMarketOrderGatewayLatency(journalPayload, durationMs);
      return {
        symbol: canonicalSymbol,
        clientOrderId,
        status: response.status,
        body: raw,
        response,
        ok,
        acceptedAsync,
      };
    } catch (error) {
      const durationMs = getApiLatencyNow() - startedAtMs;
      recordApiLatency({
        label: `trade.placeMarketOrder.${requestedSide}`,
        method: 'POST',
        endpoint: '/orders',
        source: 'trade',
        status: response?.status ?? null,
        ok: false,
        durationMs,
        error,
      });
      recordMarketOrderGatewayLatency(journalPayload, durationMs);
      recordMarketOrderJournalFailure(journalPayload, error);
      throw error;
    }
  };

  const isMarketDataMiss = (attempt: Attempt): boolean => {
    const isHttpError = attempt.status === 400 || attempt.status === 404;
    if (!isHttpError) return false;
    const inner = unwrap(attempt.body);
    const msg = String(
      inner?.message ?? inner?.comment ?? inner?.error ?? attempt.body?.message ?? '',
    ).toLowerCase();
    return (
      msg.includes('market data') ||
      msg.includes('no quote') ||
      msg.includes('symbol not found') ||
      msg.includes('unknown symbol') ||
      msg.includes('not available') ||
      msg.includes('zero or negative market price') ||
      msg.includes('zero market price')
    );
  };

  const brokerCacheKey = getAcceptedSymbolCacheKey(cacheNamespace, callerSymbol);
  const candidates = buildMarketOrderSymbolCandidates({
    callerSymbol,
    acceptedSymbol: acceptedOrderSymbolCache.get(brokerCacheKey) ?? null,
    cachedCatalogSymbol: resolveBrokerSymbolFromCache(callerSymbol, cacheNamespace),
  });

  let accepted: Attempt | null = null;
  let lastBad: Attempt | null = null;
  const reconciliationAccountLogin = owner.accountLogin;
  const isReconciliationSessionCurrent = () => (
    captureActiveBrokerSessionOwnerStamp()?.cacheNamespace === cacheNamespace
  );
  // Block unrelated full-ledger polls before the first POST. Overlapping order
  // transports remain fully concurrent; their trailing authoritative read is
  // coalesced by immutable broker owner so a burst cannot spawn 50 workers.
  reconciliationHandle = beginCoalescedMarketOrderReconciliation({
    // cacheNamespace already includes account identity and session epoch. Keep
    // causal credential refreshes inside the same reconciliation batch.
    ownerKey: owner.cacheNamespace,
    isOwnerCurrent: isReconciliationSessionCurrent,
    releaseBarrier: beginProtectedPositionsMutation(),
    reconcile: async (reconciliationEvidence, isBatchCurrent) => {
      await reconcileMarketOrderPositions(reconciliationEvidence, {
        readPositions: () => positionsApi.getPositionsForReconciliation(reconciliationAccountLogin),
        isOwnerCurrent: () => (
          isBatchCurrent() && isReconciliationSessionCurrent()
        ),
        commitPositions: (positions) => {
          if (
            !isBatchCurrent() ||
            !isReconciliationSessionCurrent()
          ) return;
          usePositionsState.getState().applyPositionsSnapshot(
            positions,
            reconciliationAccountLogin,
          );
        },
      });
    },
    onReconcileError: (error) => {
      warnOrderDiagnostic('[RTX5 Order] captured-owner reconciliation failed', error);
    },
  });

  try {
    for (const candidate of candidates) {
      const attempt = await sendOrder(candidate);
      if (attempt.ok || attempt.acceptedAsync) {
        accepted = attempt;
        if (candidate !== callerSymbol) {
          logOrderDiagnostic('[RTX5 Order] symbol accepted after fallback:', candidate);
        }
        break;
      }

      logOrderDiagnostic(
        '[RTX5 Order] attempt failed',
        JSON.stringify({
          symbol: candidate,
          status: attempt.status,
          body: attempt.body,
        }),
      );
      lastBad = attempt;

      // Auth, ownership, rate-limit, and SL/TP errors are real failures; retrying
      // another symbol would only hide the actual rejection reason.
      if (!isMarketDataMiss(attempt)) break;
    }

    if (!accepted && lastBad && isMarketDataMiss(lastBad)) {
      const catalogSymbol = await resolveBrokerSymbol(callerSymbol, cacheNamespace);
      assertOrderSessionCurrent();
      if (catalogSymbol && !candidates.includes(catalogSymbol)) {
        const attempt = await sendOrder(catalogSymbol);
        if (attempt.ok || attempt.acceptedAsync) {
          accepted = attempt;
          logOrderDiagnostic('[RTX5 Order] symbol accepted after /instruments fallback:', catalogSymbol);
        } else {
          logOrderDiagnostic(
            '[RTX5 Order] /instruments fallback failed',
            JSON.stringify({
              symbol: catalogSymbol,
              status: attempt.status,
              body: attempt.body,
            }),
          );
          lastBad = attempt;
        }
      }
    }

    if (!accepted) {
      // Every rejection is a 4xx/5xx {"error","message"} envelope. An
      // unexpected 2xx that is neither a fill nor order_accepted is treated
      // as an unconfirmed outcome, never as a rejection.
      const rawStatus = lastBad?.status ?? 400;
      const unexpectedSuccess = rawStatus >= 200 && rawStatus < 300;
      const status = unexpectedSuccess ? 202 : rawStatus;
      const body = unexpectedSuccess
        ? createOrderConfirmationPendingError(lastBad?.clientOrderId ?? '').data
        : (lastBad?.body ?? { message: 'Order rejected before a valid symbol candidate was available.' });
      const headers: Record<string, string> = {};
      if (status === 429 && lastBad?.response) {
        headers['retry-after'] = lastBad.response.headers.get('retry-after') || '';
      }
      const error = createTradingApiError(status, body, headers);
      recordMarketOrderJournalFailure(journalPayload, error);
      throw error;
    }

    assertOrderSessionCurrent();
    acceptedOrderSymbolCache.set(brokerCacheKey, accepted.symbol);
    let finalData: PlaceOrderResponse;
    if (accepted.acceptedAsync) {
      const outcome = await pollOrderCommand({
        clientOrderId: accepted.clientOrderId,
        accountLogin: loginInt,
        assertCurrent: assertOrderSessionCurrent,
      });
      if (outcome.kind === 'rejected') {
        const error = createOrderCommandRejectedError(outcome);
        recordMarketOrderJournalFailure(journalPayload, error);
        throw error;
      }
      if (outcome.kind === 'pending') {
        // Not final after 30 s: "Confirmation Pending". The finally block
        // hands null evidence to the coalesced GET /positions reconciliation.
        const error = createOrderConfirmationPendingError(accepted.clientOrderId);
        recordMarketOrderJournalFailure(journalPayload, error);
        throw error;
      }
      finalData = unwrap(outcome.data) as PlaceOrderResponse;
    } else {
      finalData = unwrap(accepted.body) as PlaceOrderResponse;
    }

    // The handler's canonical execution response already contains
    // order_ticket, position_ticket, and price. Preserve only safe aliases for
    // older Position-shaped broker deployments: a legacy `ticket` can identify
    // a position, but an order ticket must never be promoted to position ID.
    if (finalData && typeof finalData === 'object') {
      if (finalData.position_ticket == null && finalData.ticket != null) {
        finalData.position_ticket = finalData.ticket;
      }
      if (finalData.price == null && finalData.price_open != null) {
        finalData.price = finalData.price_open;
      }
    }

    logOrderDiagnostic('[TRADE-RESPONSE]', {
      requestSide: requestedSide,
      result: finalData?.status ?? accepted.status,
      backendSide: finalData?.side ?? null,
      rawResponse: finalData,
    });
    if (finalData?.side && finalData.side !== requestedSide) {
      warnOrderDiagnostic('[TRADE-RESPONSE] backend side differs from request', {
        requestSide: requestedSide,
        backendSide: finalData.side,
        symbol: finalData.symbol ?? accepted.symbol ?? callerSymbol,
      });
    }

    recordMarketOrderJournalSuccess(
      { ...journalPayload, symbol: accepted.symbol || callerSymbol },
      finalData,
    );
    reconciliationResponse = finalData;
    return finalData;
  } finally {
    // The primary response/error never waits for reconciliation. Finishing only
    // admits this transport outcome to the owner's shared trailing worker.
    reconciliationHandle?.finish(reconciliationResponse);
  }
};

const classifyPlacementFailure = (error: unknown, reachedServer: boolean): {
  status: OrderTerminalStatus;
  errorCode?: string;
  errorMessage?: string;
} => {
  const code = getTradingErrorCode(error) ?? undefined;
  const httpStatus = error instanceof TradingApiError ? error.status : undefined;
  const errorMessage = error instanceof Error && error.message.trim() ? error.message.trim() : undefined;
  if (code === 'ORDER_CONFIRMATION_PENDING') {
    return { status: 'expired', errorCode: code, errorMessage };
  }
  // An explicit gateway/terminal refusal; auth, timeout and rate limits are
  // transport-level failures instead.
  const explicitRejection = reachedServer
    && httpStatus !== undefined
    && httpStatus >= 400
    && httpStatus < 500
    && httpStatus !== 401
    && httpStatus !== 408
    && httpStatus !== 429;
  return {
    status: explicitRejection ? 'rejected' : 'failed',
    errorCode: code ?? (httpStatus !== undefined ? `HTTP_${httpStatus}` : undefined),
    errorMessage,
  };
};

/**
 * Places a market order and records exactly one `placement_terminal` latency
 * sample (tap -> final outcome, monotonic clock) for the Journal.
 */
export const placeMarketOrder = async (payload: PlaceOrderPayload): Promise<PlaceOrderResponse> => {
  const intentAtMs = takeTradeIntentStartedAt();
  const owner = captureActiveBrokerSessionOwnerStamp();
  const sessionScope = owner ? buildJournalSessionScopeKey(owner) : undefined;
  const trace: MarketOrderAttemptTrace = {};
  const record = (outcome: { status: OrderTerminalStatus; errorCode?: string; errorMessage?: string }) => {
    try {
      recordOrderLatencySample({
        phase: 'placement_terminal',
        transport: 'rest',
        clientOrderId: trace.clientOrderId,
        sessionScope,
        symbol: trace.symbol ?? payload.symbol,
        side: payload.side === 'sell' ? 'sell' : 'buy',
        volume: payload.volume,
        terminalStatus: outcome.status,
        errorCode: outcome.errorCode,
        errorMessage: outcome.errorMessage,
        totalMs: Math.max(0, getApiLatencyNow() - intentAtMs),
      });
    } catch {
      // Telemetry must never change the order outcome.
    }
  };
  try {
    const result = await placeMarketOrderAttempt(payload, trace);
    record({ status: 'filled' });
    return result;
  } catch (error) {
    // Local validation throws before any client_order_id is sent.
    record(classifyPlacementFailure(error, trace.clientOrderId !== undefined));
    throw error;
  }
};

export function resetAcceptedMarketOrderSymbolCache(): void {
  acceptedOrderSymbolCache.clear();
  resetMarketOrderReconciliationCoordinatorForTests();
}
