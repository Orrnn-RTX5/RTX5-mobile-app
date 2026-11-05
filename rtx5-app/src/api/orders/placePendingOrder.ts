/**
 * Place a pending order on the trading server.
 *
 * POST /api/v2/orders/pending
 */
import { apiClient } from '../apiClient';
import { StaleBrokerSessionError } from '../brokerApi';
import { assertTradeSide } from '../../domain/tradeSide';
import { createTradingApiError } from '../tradingErrors';
import {
  captureActiveBrokerSessionOwnerStamp,
  isActiveBrokerSessionOwnerStampCurrent,
} from '../../state/activeBrokerSession';
import { getApiLatencyNow, recordApiLatency } from '../../utils/apiLatency';
import { resolveBrokerSymbol, resolveBrokerSymbolFromCache } from './symbolResolver';
import { buildMarketOrderSymbolCandidates, getAcceptedSymbolCacheKey } from './placeMarketOrderCandidates';
import {
  PendingOrderPayloadError,
  buildPendingOrderRequestBody,
} from './pendingOrderPayload';
import type { PlacePendingOrderPayload, PlacePendingOrderResponse } from './types';
import { redactDiagnosticValue } from '../../utils/securityRedaction';
import { assertActivePendingProtectionAllowed } from '../sltpCapabilityGuard';
import { createUuidV4 } from '../tradeIdempotency';
import { createOrderRequestRegistry } from './marketOrderInFlight';
import { listPendingOrdersForCapturedOwner } from './pendingOrders';
import { normalizePendingOrderDto } from './pendingOrders';
import { upsertPendingOrder } from '../../state/pendingOrdersState';
import {
  PENDING_ORDER_PLACEMENT_AVAILABLE,
  PENDING_ORDER_PREVIEW_MESSAGE,
} from '../../config/pendingOrderAvailability';

const acceptedPendingOrderSymbolCache = new Map<string, string>();
const pendingOrderRequests = createOrderRequestRegistry<PlacePendingOrderResponse>();
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

const assertActivePendingCreateProtectionAllowed = (
  payload: PlacePendingOrderPayload,
): void => {
  const createIntent = {
    ...payload,
  } as unknown as Record<string, unknown>;
  // For pending POST only, explicit null means "unset". Pending PUT keeps null
  // in its body and uses the shared assertion as an explicitly gated clear.
  for (const key of ['sl', 'tp', 'price_sl', 'price_tp'] as const) {
    if (createIntent[key] === null) delete createIntent[key];
  }
  assertActivePendingProtectionAllowed(createIntent);
};

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

const normalizePendingOrderSymbolCandidate = (value: unknown): string => {
  const symbol = String(value ?? '').trim().toUpperCase();
  if (!symbol || utf8ByteLength(symbol) > 20) {
    throw createTradingApiError(400, {
      error: 'INVALID_INPUT',
      message: !symbol
        ? 'Pending order symbol is required.'
        : 'Pending order symbol must not exceed 20 bytes.',
    });
  }
  return symbol;
};

export const placePendingOrder = async (
  payload: PlacePendingOrderPayload,
): Promise<PlacePendingOrderResponse> => {
  // Guard the shared boundary as well as the UI. Drafts must never reach the
  // network or reconciliation through a retained or programmatic caller.
  if (!PENDING_ORDER_PLACEMENT_AVAILABLE) {
    throw createTradingApiError(503, {
      error: 'PENDING_ORDER_PLACEMENT_UNAVAILABLE',
      message: PENDING_ORDER_PREVIEW_MESSAGE,
    });
  }
  const owner = captureActiveBrokerSessionOwnerStamp();
  if (!owner) throw new StaleBrokerSessionError();
  assertActivePendingCreateProtectionAllowed(payload);
  const cacheNamespace = owner.cacheNamespace;
  const assertOrderSessionCurrent = () => {
    if (!isActiveBrokerSessionOwnerStampCurrent(owner)) {
      throw new StaleBrokerSessionError();
    }
  };

  const requestedSide = assertTradeSide(payload.side);
  let orderBody: Record<string, unknown>;
  try {
    orderBody = buildPendingOrderRequestBody(payload);
  } catch (error) {
    if (error instanceof PendingOrderPayloadError) {
      throw createTradingApiError(400, { message: error.message });
    }
    throw error;
  }

  const callerSymbol = String(orderBody.symbol ?? '').trim();
  if (String(orderBody.account_login ?? '') !== owner.accountLogin) {
    throw createTradingApiError(403, {
      message: 'Pending-order account does not match the active broker session.',
    });
  }

  const { client_order_id: initialClientOrderId, ...orderFields } = orderBody;
  // Native callback redelivery must share one in-flight POST. A later explicit
  // submission, or any changed price/protection, receives its own request ID.
  const requestKey = JSON.stringify([owner.cacheNamespace, owner.sessionEpoch, owner.credentialGeneration, orderFields]);
  return pendingOrderRequests.run(requestKey, async () => {
    type Attempt = {
      symbol: string;
      status: number;
      body: any;
      response: Response;
      ok: boolean;
      graceful: boolean;
    };
    const clientOrderIdsBySerializedBody = new Map<string, string>();
    let createRequestStarted = false;

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
      const canonicalSymbol = normalizePendingOrderSymbolCandidate(symbolToSend);
      const fields = { ...orderFields, symbol: canonicalSymbol };
      const serializedFields = JSON.stringify(fields);
      // The gateway binds the body ID as well as the optional header key.
      // Correcting a rejected symbol changes the body and needs a fresh ID;
      // an identical request within this submission retains its original ID.
      let clientOrderId = clientOrderIdsBySerializedBody.get(serializedFields);
      if (!clientOrderId) {
        clientOrderId = clientOrderIdsBySerializedBody.size === 0 ? String(initialClientOrderId) : createUuidV4();
        clientOrderIdsBySerializedBody.set(serializedFields, clientOrderId);
      }
      const body = { client_order_id: clientOrderId, ...fields };
      const serializedBody = JSON.stringify(body);
      logOrderDiagnostic('[RTX5 Pending Order] POST /orders/pending body:', serializedBody);
      const startedAtMs = getApiLatencyNow();
      let response: Response | null = null;

      try {
        createRequestStarted = true;
        response = await apiClient('/orders/pending', {
          method: 'POST',
          headers: { 'Idempotency-Key': clientOrderId },
          body: serializedBody,
          replayAfterAuthRefresh: false,
        });
        const raw = await response.json().catch(() => ({}));
        assertOrderSessionCurrent();
        const inner = unwrap(raw);
        const bodyStatus = typeof inner?.status === 'string' ? inner.status.toLowerCase() : '';
        const graceful = response.status === 200 && ['rejected', 'failed', 'error'].includes(bodyStatus);
        const ok = response.status === 200 && !graceful;
        recordApiLatency({
          label: `trade.placePendingOrder.${requestedSide}`,
          method: 'POST',
          endpoint: '/orders/pending',
          source: 'trade',
          status: response.status,
          ok,
          durationMs: getApiLatencyNow() - startedAtMs,
        });
        return {
          symbol: canonicalSymbol,
          status: response.status,
          body: raw,
          response,
          ok,
          graceful,
        };
      } catch (error) {
        recordApiLatency({
          label: `trade.placePendingOrder.${requestedSide}`,
          method: 'POST',
          endpoint: '/orders/pending',
          source: 'trade',
          status: response?.status ?? null,
          ok: false,
          durationMs: getApiLatencyNow() - startedAtMs,
          error,
        });
        throw error;
      }
    };

    const isSymbolMiss = (attempt: Attempt): boolean => {
      const isHttpError = attempt.status === 400 || attempt.status === 404;
      if (!isHttpError && !attempt.graceful) return false;
      const inner = unwrap(attempt.body);
      const msg = String(
        inner?.message ?? inner?.comment ?? inner?.error ?? attempt.body?.message ?? '',
      ).toLowerCase();
      return (
        msg.includes('market data') ||
        msg.includes('no quote') ||
        msg.includes('symbol not found') ||
        msg.includes('unknown symbol') ||
        msg.includes('instrument not found') ||
        msg.includes('not available')
      );
    };

    const brokerCacheKey = getAcceptedSymbolCacheKey(cacheNamespace, callerSymbol);
    const candidates = buildMarketOrderSymbolCandidates({
      callerSymbol,
      acceptedSymbol: acceptedPendingOrderSymbolCache.get(brokerCacheKey) ?? null,
      cachedCatalogSymbol: resolveBrokerSymbolFromCache(callerSymbol, cacheNamespace),
    });

    let accepted: Attempt | null = null;
    let lastBad: Attempt | null = null;

    try {
      for (const candidate of candidates) {
        const attempt = await sendOrder(candidate);
        if (attempt.ok) {
          accepted = attempt;
          break;
        }
        lastBad = attempt;
        if (!isSymbolMiss(attempt)) break;
      }

      if (!accepted && lastBad && isSymbolMiss(lastBad)) {
        const catalogSymbol = await resolveBrokerSymbol(callerSymbol, cacheNamespace);
        assertOrderSessionCurrent();
        if (catalogSymbol && !candidates.includes(catalogSymbol)) {
          const attempt = await sendOrder(catalogSymbol);
          if (attempt.ok) {
            accepted = attempt;
          } else {
            lastBad = attempt;
          }
        }
      }

      if (!accepted) {
        const status = lastBad?.status ?? 400;
        const body = lastBad?.graceful
          ? {
            message: unwrap(lastBad.body)?.comment
              || unwrap(lastBad.body)?.message
              || 'Pending order rejected by the trading server.',
          }
          : (lastBad?.body ?? { message: 'Pending order rejected before a valid symbol candidate was available.' });
        const headers: Record<string, string> = {};
        if (status === 429 && lastBad?.response) {
          headers['retry-after'] = lastBad.response.headers.get('retry-after') || '';
        }
        throw createTradingApiError(lastBad?.graceful ? 400 : status, body, headers);
      }

      assertOrderSessionCurrent();
      acceptedPendingOrderSymbolCache.set(brokerCacheKey, accepted.symbol);
      const finalData = unwrap(accepted.body);
      const ticket = finalData?.ticket ?? finalData?.order_ticket ?? finalData?.id;
      if (ticket && !['filled', 'cancelled', 'expired', 'rejected'].includes(String(finalData?.status).toLowerCase())) {
        try {
          upsertPendingOrder(owner, normalizePendingOrderDto({
            ...orderBody,
            ...finalData,
            ticket,
            account_login: Number(owner.accountLogin),
            symbol: accepted.symbol,
            status: 'PENDING',
            created_at: finalData.created_at ?? new Date().toISOString(),
          }, owner.accountLogin));
        } catch { /* The captured-account pending list remains authoritative. */ }
      }
      if (finalData && typeof finalData === 'object' && finalData.price_open == null && finalData.price != null) {
        finalData.price_open = finalData.price;
      }
      return finalData;
    } finally {
      // Pending-create responses and failures are hints only. A captured-owner
      // list is authoritative, including timeout/abort/network unknown outcomes.
      // Start it without delaying or replacing the primary result.
      if (createRequestStarted && isActiveBrokerSessionOwnerStampCurrent(owner)) {
        void listPendingOrdersForCapturedOwner(owner).catch((error) => {
          warnOrderDiagnostic(
            '[RTX5 Pending Order] captured-owner reconciliation failed',
            error,
          );
        });
      }
    }
  });
};

export function resetAcceptedPendingOrderSymbolCache(): void {
  acceptedPendingOrderSymbolCache.clear();
}
