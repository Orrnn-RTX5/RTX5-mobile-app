import {
  captureActiveBrokerSessionOwnerStamp,
  isActiveBrokerSessionOwnerStampCurrent,
  type ActiveBrokerSessionOwnerStamp,
} from '../../state/activeBrokerSession';
import { apiClient } from '../apiClient';
import { StaleBrokerSessionError } from '../brokerApi';
import { assertActivePendingProtectionAllowed } from '../sltpCapabilityGuard';
import { createUuidV4 } from '../tradeIdempotency';
import { pendingExpiry, type PendingTimeInForce } from '../../domain/pendingOrders';
import { publishPendingOrdersSnapshot, removePendingOrder, upsertPendingOrder, usePendingOrdersState } from '../../state/pendingOrdersState';
import { createTradingApiError } from '../tradingErrors';
import { normalizePositiveSafeIntegerPathSegment } from '../positions/modifyPositionWire';
import { normalizePendingOrderReadType } from './pendingOrderPayload';
import type { PendingOrderType } from './types';

type UnknownRecord = Record<string, unknown>;

/** The server waits up to 25 s for pending mutations; client timeout must be >= 30 s. */
export const PENDING_ORDER_MUTATION_TIMEOUT_MS = 35_000;
/** 503 temporary server condition retry schedule (1 s, 2 s, 4 s, max 3 retries). */
export const PENDING_ORDER_RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const;
/** HTTP 202 accepted follow-up list refresh delay (1-2 s). */
export const PENDING_ORDER_ACCEPTED_RECONCILE_DELAY_MS = 1_500;

/**
 * Pending list row (contract 6.3): `ticket, account_login, symbol, type,
 * volume, price, status, time_setup, state_version, price_limit,
 * trigger_phase` plus optional `price_sl, price_tp, time_expiry, time_done,
 * comment`. Stop-limit rows are readable (placing them stays locked).
 */
export type PendingOrderReadModel = Readonly<{
  ticket: number;
  accountLogin: number;
  symbol: string;
  type: PendingOrderType;
  status: string;
  timeSetup: number;
  volume: string | null;
  price: string | null;
  priceLimit: string | null;
  sl: string | null;
  tp: string | null;
  expiry: number | null;
  timeDone: number | null;
  comment: string | null;
  stateVersion: string | null;
  triggerPhase: string | null;
  timeInForce: PendingTimeInForce;
}>;

export type ModifyPendingOrderInput = Readonly<{
  price?: number | string;
  price_limit?: number | string;
  sl?: number | string | null;
  tp?: number | string | null;
  expiry?: number | null;
  time_in_force?: PendingTimeInForce;
  expected_version?: number | string | null;
}>;

export type PendingOrderMutationOptions = Readonly<{
  /**
   * Reuse only for an exact retry of the same ticket and canonical payload.
   * Omit for a genuinely new user intent.
   */
  clientOrderId?: string;
  idempotencyKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  retryDelaysMs?: readonly number[];
  acceptedRetryDelayMs?: number;
}>;

export type PendingOrderReconciliationResult = Readonly<{
  ticket: number;
  outcome: 'present' | 'absent';
  order: PendingOrderReadModel | null;
  idempotencyKey: string;
  clientOrderId?: string;
}>;

type PendingOrderOwner = ActiveBrokerSessionOwnerStamp;

const REFUSED_MODIFY_FIELDS = [
  'volume',
  'symbol',
  'side',
  'comment',
  'trailing_stop',
  'trailing_step',
  'magic',
] as const;

const hasOwn = (value: UnknownRecord, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const asRecord = (value: unknown): UnknownRecord | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;

const sleepWithOwner = (
  ms: number,
  owner: PendingOrderOwner,
  signal?: AbortSignal,
): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Pending-order request aborted.'));
      return;
    }
    const timer = setTimeout(() => {
      try {
        assertPendingOrderOwnerCurrent(owner);
        resolve();
      } catch (error) {
        reject(error);
      }
    }, Math.max(0, ms));
    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new Error('Pending-order request aborted.'));
        },
        { once: true },
      );
    }
  });

const CLIENT_ORDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,63}$/;

const resolvePendingMutationClientOrderId = (
  options: PendingOrderMutationOptions,
): string => {
  const candidate =
    options.clientOrderId?.trim() ||
    options.idempotencyKey?.trim() ||
    createUuidV4();
  if (!CLIENT_ORDER_ID_PATTERN.test(candidate)) {
    throw createTradingApiError(400, {
      error: 'CLIENT_ORDER_ID_REQUIRED',
      message: 'Pending-order client_order_id must be 8 to 64 allowed characters.',
    });
  }
  return candidate;
};

const extractPendingErrorCode = (error: unknown): string | null => {
  const rec = asRecord(error);
  if (!rec) return null;
  if (typeof rec.code === 'string' && rec.code.trim()) return rec.code.trim().toUpperCase();
  const data = asRecord(rec.data) ?? asRecord(rec.payload);
  if (typeof data?.error === 'string' && data.error.trim()) return data.error.trim().toUpperCase();
  if (typeof data?.code === 'string' && data.code.trim()) return data.code.trim().toUpperCase();
  return null;
};

const isNetworkOrTimeoutError = (
  error: unknown,
  signal?: AbortSignal,
): boolean => {
  if (!error || signal?.aborted) return false;
  if (error instanceof StaleBrokerSessionError) {
    return false;
  }
  if (typeof error === 'object' && 'status' in error && typeof (error as { status?: unknown }).status === 'number') {
    return false;
  }
  return true;
};

const capturePendingOrderOwner = (): PendingOrderOwner => {
  const owner = captureActiveBrokerSessionOwnerStamp();
  if (!owner) {
    throw new StaleBrokerSessionError();
  }
  return owner;
};

const isPendingOrderOwnerCurrent = (owner: PendingOrderOwner): boolean =>
  isActiveBrokerSessionOwnerStampCurrent(owner);

const assertPendingOrderOwnerCurrent = (owner: PendingOrderOwner): void => {
  if (!isPendingOrderOwnerCurrent(owner)) {
    throw new StaleBrokerSessionError();
  }
};

const toCanonicalDecimalString = (
  value: number | string,
  label: string,
): string => {
  let raw: string;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) {
      raw = '';
    } else {
      raw = value.toFixed(8).replace(/(?:\.0+|(\.\d+?)0+)$/, '$1');
      if (Number(raw) !== value) raw = '';
    }
  } else {
    raw = value.trim();
  }
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/.test(raw) || !/[1-9]/.test(raw)) {
    throw createTradingApiError(400, {
      error: 'INVALID_INPUT',
      message: `${label} must be a positive decimal with at most 8 fractional digits.`,
    });
  }
  return raw.replace(/^0+(?=\d)/, '').replace(/(?:\.0+|(\.\d+?)0+)$/, '$1');
};

const normalizeResponseDecimal = (
  value: unknown,
  label: string,
): string => {
  if (typeof value === 'string') {
    return toCanonicalDecimalString(value, label);
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    const fixed = value.toFixed(8).replace(/(?:\.0+|(\.\d+?)0+)$/, '$1');
    return toCanonicalDecimalString(fixed, label);
  }
  throw createTradingApiError(502, {
    error: 'INVALID_RESPONSE',
    message: `Pending-order ${label} is malformed.`,
  });
};

const readDecimalFamily = (
  record: UnknownRecord,
  keys: readonly string[],
  label: string,
): string | null => {
  for (const key of keys) {
    if (!hasOwn(record, key)) continue;
    const value = record[key];
    if (value === null || value === undefined || Number(value) === 0) return null;
    return normalizeResponseDecimal(value, label);
  }
  return null;
};

const readOptionalUnixSeconds = (
  record: UnknownRecord,
  keys: readonly string[],
  label: string,
): number | null => {
  for (const key of keys) {
    if (!hasOwn(record, key)) continue;
    const value = record[key];
    if (value === null || value === undefined) return null;
    const numeric = typeof value === 'string' && !/^\d+$/.test(value)
      ? Math.floor(Date.parse(value) / 1000) : Number(value);
    if (!Number.isSafeInteger(numeric) || numeric <= 0 || numeric >= 1e11) {
      throw createTradingApiError(502, {
        error: 'INVALID_RESPONSE',
        message: `Pending-order ${label} is malformed.`,
      });
    }
    return numeric;
  }
  return null;
};

export const normalizePendingOrderDto = (
  value: unknown,
  fallbackAccountLogin?: string | number,
): PendingOrderReadModel => {
  const record = asRecord(asRecord(value)?.data) ?? asRecord(value);
  if (!record) {
    throw createTradingApiError(502, {
      error: 'INVALID_RESPONSE',
      message: 'Pending-order list contains a non-object row.',
    });
  }

  let ticket: number;
  let accountLogin: number;
  try {
    ticket = normalizePositiveSafeIntegerPathSegment(
      (record.ticket ?? record.id ?? record.order_ticket) as string | number,
      'Pending-order ticket',
    ).numeric;
    accountLogin = normalizePositiveSafeIntegerPathSegment(
      (record.account_login ?? fallbackAccountLogin) as string | number,
      'Pending-order account login',
    ).numeric;
  } catch {
    throw createTradingApiError(502, {
      error: 'INVALID_RESPONSE',
      message: 'Pending-order ticket or account identity is malformed.',
    });
  }
  const symbol = typeof record.symbol === 'string'
    ? record.symbol.trim().toUpperCase()
    : '';
  const type = normalizePendingOrderReadType(record.type);
  const status = typeof record.status === 'string' ? record.status.trim() : '';
  const timeSetup = readOptionalUnixSeconds(record, ['time_setup', 'created_at', 'time_create'], 'setup time');
  if (!symbol || !type || !status || timeSetup === null) {
    throw createTradingApiError(502, {
      error: 'INVALID_RESPONSE',
      message: 'Pending-order identity or lifecycle fields are malformed.',
    });
  }

  const expiry = readOptionalUnixSeconds(
    record,
    ['time_expiry', 'expiry', 'expiration'],
    'expiry',
  );

  return Object.freeze({
    ticket,
    accountLogin,
    symbol,
    type,
    status,
    timeSetup,
    volume: readDecimalFamily(record, ['volume_decimal', 'volume_exact', 'volume'], 'volume'),
    price: readDecimalFamily(record, ['price_decimal', 'price_exact', 'price'], 'trigger price'),
    priceLimit: readDecimalFamily(record, ['price_limit_decimal', 'price_limit_exact', 'price_limit'], 'limit price'),
    sl: readDecimalFamily(
      record,
      ['sl_decimal', 'sl_exact', 'price_sl_exact', 'sl', 'price_sl'],
      'Stop Loss',
    ),
    tp: readDecimalFamily(
      record,
      ['tp_decimal', 'tp_exact', 'price_tp_exact', 'tp', 'price_tp'],
      'Take Profit',
    ),
    expiry,
    timeDone: readOptionalUnixSeconds(record, ['time_done', 'filled_at', 'cancelled_at', 'updated_at'], 'completion time'),
    comment: typeof record.comment === 'string' ? record.comment : null,
    stateVersion: record.state_version === undefined || record.state_version === null
      ? null
      : String(record.state_version),
    triggerPhase: typeof record.trigger_phase === 'string' ? record.trigger_phase : null,
    timeInForce: ['DAY', 'GTD'].includes(String(record.time_in_force).toUpperCase())
      ? String(record.time_in_force).toUpperCase() as PendingTimeInForce : 'GTC',
  });
};

export const buildModifyPendingOrderRequestBody = (
  input: ModifyPendingOrderInput,
  nowUnixSeconds = Math.floor(Date.now() / 1000),
): Readonly<Record<string, string | number | null>> => {
  const source = input as UnknownRecord;
  const body: Record<string, string | number | null> = {};

  for (const refused of REFUSED_MODIFY_FIELDS) {
    if (hasOwn(source, refused) && source[refused] !== undefined) {
      throw createTradingApiError(400, {
        error: 'INVALID_INPUT',
        message: `Pending-order field "${refused}" cannot be modified.`,
      });
    }
  }

  if (hasOwn(source, 'price')) {
    if (input.price === null || input.price === undefined) {
      throw createTradingApiError(400, {
        error: 'INVALID_INPUT',
        message: 'Pending trigger price cannot be null.',
      });
    }
    body.price = toCanonicalDecimalString(input.price, 'Pending trigger price');
  }
  if (hasOwn(source, 'price_limit')) {
    if (input.price_limit === null || input.price_limit === undefined) {
      throw createTradingApiError(400, {
        error: 'INVALID_INPUT',
        message: 'Pending limit price cannot be null.',
      });
    }
    body.price_limit = toCanonicalDecimalString(input.price_limit, 'Pending limit price');
  }
  for (const key of ['sl', 'tp'] as const) {
    if (!hasOwn(source, key)) continue;
    const value = input[key];
    // Contract: clearing SL/TP is `null`, never 0; values are decimal strings.
    const clears = value === null ||
      (typeof value === 'string' && value.trim() === '') ||
      Number(value) === 0;
    body[key] = clears
      ? null
      : toCanonicalDecimalString(
        value as number | string,
        key === 'sl' ? 'Pending Stop Loss' : 'Pending Take Profit',
      );
  }
  if (input.time_in_force !== undefined) {
    if (!['GTC', 'DAY', 'GTD'].includes(input.time_in_force)) {
      throw createTradingApiError(400, { message: 'Invalid pending expiration mode.' });
    }
    let resolvedExpiry: number | null;
    try { resolvedExpiry = pendingExpiry(input.time_in_force, input.expiry, nowUnixSeconds * 1000); }
    catch (error) { throw createTradingApiError(400, { message: (error as Error).message }); }
    if (input.time_in_force === 'DAY') {
      body.time_in_force = 'DAY';
    }
    body.expiry = resolvedExpiry;
  } else if (hasOwn(source, 'expiry')) {
    const expiry = input.expiry;
    if (expiry === null) {
      body.expiry = null;
    } else if (
      typeof expiry !== 'number' ||
      !Number.isSafeInteger(expiry) ||
      expiry >= 1e11 ||
      expiry <= nowUnixSeconds
    ) {
      throw createTradingApiError(400, {
        error: 'INVALID_INPUT',
        message: 'Pending expiry must be a future Unix-seconds value or null.',
      });
    } else {
      body.expiry = expiry;
    }
  }
  if (hasOwn(source, 'expected_version') && input.expected_version !== undefined && input.expected_version !== null) {
    try {
      body.expected_version = normalizePositiveSafeIntegerPathSegment(
        input.expected_version,
        'Pending expected_version',
      ).path;
    } catch {
      throw createTradingApiError(400, {
        error: 'INVALID_INPUT',
        message: 'Pending expected_version must be a positive integer string.',
      });
    }
  }

  if (Object.keys(body).length === 0) {
    throw createTradingApiError(400, {
      error: 'INVALID_INPUT',
      message: 'Pending-order modification requires at least one changed field.',
    });
  }
  return Object.freeze(body);
};

const readError = async (response: Response): Promise<unknown> =>
  response.json().catch(() => ({
    error: 'REQUEST_FAILED',
    message: `Pending-order request failed with HTTP ${response.status}.`,
  }));

const listPendingOrdersForOwner = async (
  owner: PendingOrderOwner,
  authoritative = false,
): Promise<PendingOrderReadModel[]> => {
  assertPendingOrderOwnerCurrent(owner);
  const login = normalizePositiveSafeIntegerPathSegment(
    owner.accountLogin,
    'Pending-order account login',
  );
  const startedRevision = authoritative ? undefined : usePendingOrdersState.getState().revision;
  const response = await apiClient(`/orders/pending/${login.path}`, {
    method: 'GET',
    headers: { accept: 'application/json' },
  });
  assertPendingOrderOwnerCurrent(owner);
  if (response.status !== 200) {
    throw createTradingApiError(response.status, await readError(response));
  }
  const value = await response.json();
  assertPendingOrderOwnerCurrent(owner);
  if (!Array.isArray(value)) {
    throw createTradingApiError(502, {
      error: 'INVALID_RESPONSE',
      message: 'Pending-order list response must be an array.',
    });
  }
  const orders = value.map(row => normalizePendingOrderDto(row, owner.accountLogin));
  if (orders.some((order) => String(order.accountLogin) !== owner.accountLogin)) {
    throw createTradingApiError(502, {
      error: 'INVALID_RESPONSE',
      message: 'Pending-order list returned a row for another account.',
    });
  }
  publishPendingOrdersSnapshot(owner, orders, startedRevision);
  return Object.freeze(orders) as PendingOrderReadModel[];
};

export const listPendingOrders = async (): Promise<PendingOrderReadModel[]> =>
  listPendingOrdersForOwner(capturePendingOrderOwner());

/**
 * Owner-bound read used by mutation reconciliation. The supplied immutable
 * stamp is checked before transport, after transport, and after parsing, so a
 * late callback can never fall through to the newly selected broker/account.
 */
export const listPendingOrdersForCapturedOwner = async (
  owner: ActiveBrokerSessionOwnerStamp,
): Promise<PendingOrderReadModel[]> =>
  listPendingOrdersForOwner(owner);

const reconcilePendingMutation = async (
  owner: PendingOrderOwner,
  ticket: number,
): Promise<Readonly<{
  outcome: 'present' | 'absent';
  order: PendingOrderReadModel | null;
}>> => {
  assertPendingOrderOwnerCurrent(owner);
  const orders = await listPendingOrdersForOwner(owner, true);
  const order = orders.find((candidate) => candidate.ticket === ticket) ?? null;
  return Object.freeze({
    outcome: order ? 'present' : 'absent',
    order,
  });
};

export const modifyPendingOrder = async (
  ticketValue: string | number,
  input: ModifyPendingOrderInput,
  options: PendingOrderMutationOptions = {},
): Promise<PendingOrderReconciliationResult> => {
  const owner = capturePendingOrderOwner();
  const ticket = normalizePositiveSafeIntegerPathSegment(
    ticketValue,
    'Pending-order ticket',
  );
  const fields = buildModifyPendingOrderRequestBody(input);
  const clientOrderId = resolvePendingMutationClientOrderId(options);
  const body = {
    ...fields,
    client_order_id: clientOrderId,
    account_login: Number(owner.accountLogin),
  };
  const snapshot = usePendingOrdersState.getState();
  const previous = snapshot.cacheNamespace === owner.cacheNamespace
    ? snapshot.orders.find(row => row.ticket === ticket.numeric) : undefined;
  if (input.price_limit !== undefined && previous && !previous.type.endsWith('_stop_limit')) {
    throw createTradingApiError(400, { message: 'Stop Limit price is only allowed for stop-limit orders.' });
  }
  assertActivePendingProtectionAllowed(body);
  const retryDelays = options.retryDelaysMs ?? PENDING_ORDER_RETRY_DELAYS_MS;
  const acceptedDelayMs = options.acceptedRetryDelayMs ?? PENDING_ORDER_ACCEPTED_RECONCILE_DELAY_MS;
  const timeoutMs = options.timeoutMs ?? PENDING_ORDER_MUTATION_TIMEOUT_MS;
  const serializedBody = JSON.stringify(body);
  let primaryError: unknown;
  let accepted202 = false;

  const sendModify = () => apiClient(
    `/orders/pending/${ticket.path}?account_login=${encodeURIComponent(owner.accountLogin)}`,
    {
      method: 'PUT',
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json',
        'Idempotency-Key': clientOrderId,
      },
      body: serializedBody,
      signal: options.signal,
      timeoutMs,
    },
  );

  try {
    let response: Response | null = null;
    let networkRetried = false;
    let retryIndex = 0;

    while (true) {
      assertPendingOrderOwnerCurrent(owner);
      try {
        response = await sendModify();
      } catch (transportError) {
        if (!networkRetried && isNetworkOrTimeoutError(transportError, options.signal)) {
          networkRetried = true;
          const check = await reconcilePendingMutation(owner, ticket.numeric).catch(() => null);
          if (check && check.outcome === 'absent') {
            throw createTradingApiError(409, {
              error: 'ORDER_ALREADY_PROCESSED',
              message: 'Order is no longer pending.',
            });
          }
          continue;
        }
        throw transportError;
      }

      assertPendingOrderOwnerCurrent(owner);
      if (response.status === 503 && retryIndex < retryDelays.length) {
        await sleepWithOwner(retryDelays[retryIndex], owner, options.signal);
        retryIndex += 1;
        continue;
      }
      break;
    }

    if (response.status === 202) {
      accepted202 = true;
      await sleepWithOwner(acceptedDelayMs, owner, options.signal);
    } else if (response.status !== 200) {
      throw createTradingApiError(response.status, await readError(response));
    } else {
      // v3 answers with a PARTIAL row: {ticket, status:"modified",
      // state_version, price_limit, ...sent fields}. Only check identity; the
      // captured-owner list re-fetch below is always authoritative.
      parseModifyPendingOrderResponse(await response.json(), ticket.numeric);
      assertPendingOrderOwnerCurrent(owner);
      if (previous) {
        upsertPendingOrder(owner, Object.freeze({
          ...previous,
          ...(input.price !== undefined ? { price: String(fields.price) } : {}),
          ...(input.price_limit !== undefined ? { priceLimit: String(fields.price_limit) } : {}),
          ...('sl' in fields ? { sl: fields.sl === null ? null : String(fields.sl) } : {}),
          ...('tp' in fields ? { tp: fields.tp === null ? null : String(fields.tp) } : {}),
          ...('expiry' in fields ? { expiry: fields.expiry as number | null } : {}),
          ...(input.time_in_force ? { timeInForce: input.time_in_force } : {}),
        }));
      }
    }
  } catch (error) {
    primaryError = error;
  }

  if (!isPendingOrderOwnerCurrent(owner)) {
    throw new StaleBrokerSessionError();
  }
  let reconciliation;
  try {
    reconciliation = await reconcilePendingMutation(owner, ticket.numeric);
  } catch {
    if (primaryError !== undefined) throw primaryError;
    assertPendingOrderOwnerCurrent(owner);
    // An acknowledged write remains successful when the follow-up GET is offline.
    const state = usePendingOrdersState.getState();
    const order = state.cacheNamespace === owner.cacheNamespace
      ? state.orders.find(row => row.ticket === ticket.numeric) ?? null : null;
    reconciliation = { outcome: order ? 'present' as const : 'absent' as const, order };
  }
  if (primaryError !== undefined) throw primaryError;
  return Object.freeze({
    ticket: ticket.numeric,
    ...(accepted202 ? reconciliation : reconciliation),
    idempotencyKey: clientOrderId,
    clientOrderId,
  });
};

const responseTicketMatches = (value: unknown, expectedTicket: number): boolean =>
  (typeof value === 'number' || typeof value === 'string') &&
  String(value).trim() === String(expectedTicket);

/** Partial modify acknowledgement; extra fields are allowed and ignored. */
export const parseModifyPendingOrderResponse = (
  value: unknown,
  expectedTicket: number,
): void => {
  const record = asRecord(asRecord(value)?.data) ?? asRecord(value);
  if (
    !record ||
    (record.ticket !== undefined && !responseTicketMatches(record.ticket, expectedTicket)) ||
    ['rejected', 'failed', 'error'].includes(String(record.status).toLowerCase()) ||
    record.success === false
  ) {
    throw createTradingApiError(502, {
      error: 'INVALID_RESPONSE',
      message: 'Pending-order modification acknowledgement is malformed.',
    });
  }
};

/** `{ticket,status:"cancelled",time,state_version}`; extra keys allowed. */
export const parseCancelPendingOrderResponse = (
  value: unknown,
  expectedTicket: number,
): void => {
  const record = asRecord(asRecord(value)?.data) ?? asRecord(value);
  if (
    !record ||
    (record.ticket !== undefined && !responseTicketMatches(record.ticket, expectedTicket)) ||
    (record.status !== undefined && !['cancelled', 'canceled', 'deleted', 'success', 'ok'].includes(String(record.status).toLowerCase())) ||
    record.success === false
  ) {
    throw createTradingApiError(502, {
      error: 'INVALID_RESPONSE',
      message: 'Pending-order cancellation acknowledgement is malformed.',
    });
  }
};

export const cancelPendingOrder = async (
  ticketValue: string | number,
  options: PendingOrderMutationOptions = {},
): Promise<PendingOrderReconciliationResult> => {
  const owner = capturePendingOrderOwner();
  const ticket = normalizePositiveSafeIntegerPathSegment(
    ticketValue,
    'Pending-order ticket',
  );
  const clientOrderId = resolvePendingMutationClientOrderId(options);
  const retryDelays = options.retryDelaysMs ?? PENDING_ORDER_RETRY_DELAYS_MS;
  const acceptedDelayMs = options.acceptedRetryDelayMs ?? PENDING_ORDER_ACCEPTED_RECONCILE_DELAY_MS;
  const timeoutMs = options.timeoutMs ?? PENDING_ORDER_MUTATION_TIMEOUT_MS;
  const serializedBody = JSON.stringify({
    client_order_id: clientOrderId,
    account_login: Number(owner.accountLogin),
  });
  let primaryError: unknown;

  const sendCancel = () => apiClient(
    `/orders/pending/${ticket.path}?account_login=${encodeURIComponent(owner.accountLogin)}`,
    {
      method: 'DELETE',
      headers: {
        accept: 'application/json',
        'Idempotency-Key': clientOrderId,
        'Content-Type': 'application/json',
      },
      body: serializedBody,
      signal: options.signal,
      timeoutMs,
    },
  );

  try {
    let response: Response | null = null;
    let networkRetried = false;
    let retryIndex = 0;

    while (true) {
      assertPendingOrderOwnerCurrent(owner);
      try {
        response = await sendCancel();
      } catch (transportError) {
        if (!networkRetried && isNetworkOrTimeoutError(transportError, options.signal)) {
          networkRetried = true;
          const check = await reconcilePendingMutation(owner, ticket.numeric).catch(() => null);
          if (check && check.outcome === 'absent') {
            removePendingOrder(owner, ticket.numeric);
            return Object.freeze({
              ticket: ticket.numeric,
              outcome: 'absent' as const,
              order: null,
              idempotencyKey: clientOrderId,
              clientOrderId,
            });
          }
          continue;
        }
        throw transportError;
      }

      assertPendingOrderOwnerCurrent(owner);
      if (response.status === 503 && retryIndex < retryDelays.length) {
        await sleepWithOwner(retryDelays[retryIndex], owner, options.signal);
        retryIndex += 1;
        continue;
      }
      break;
    }

    if (response.status === 202) {
      await sleepWithOwner(acceptedDelayMs, owner, options.signal);
    } else if (response.status !== 200) {
      throw createTradingApiError(response.status, await readError(response));
    } else {
      parseCancelPendingOrderResponse(await response.json(), ticket.numeric);
      assertPendingOrderOwnerCurrent(owner);
      removePendingOrder(owner, ticket.numeric);
    }
  } catch (error) {
    primaryError = error;
  }

  if (!isPendingOrderOwnerCurrent(owner)) {
    throw new StaleBrokerSessionError();
  }
  let reconciliation: Readonly<{ outcome: 'present' | 'absent'; order: PendingOrderReadModel | null }> | null = null;
  try {
    reconciliation = await reconcilePendingMutation(owner, ticket.numeric);
    if (reconciliation.outcome === 'absent') {
      removePendingOrder(owner, ticket.numeric);
    }
  } catch {
    if (primaryError !== undefined) throw primaryError;
    assertPendingOrderOwnerCurrent(owner);
    // The broker has acknowledged cancellation; reconciliation can retry later.
  }
  if (primaryError !== undefined) {
    // Contract: 409 LP_COMMAND_UNSUPPORTED can mean "the order is no longer pending"
    // on some accounts; if the re-fetched list shows it is gone, treat as done.
    if (
      extractPendingErrorCode(primaryError) === 'LP_COMMAND_UNSUPPORTED' &&
      reconciliation?.outcome === 'absent'
    ) {
      return Object.freeze({
        ticket: ticket.numeric,
        outcome: 'absent' as const,
        order: null,
        idempotencyKey: clientOrderId,
        clientOrderId,
      });
    }
    throw primaryError;
  }
  return Object.freeze({
    ticket: ticket.numeric,
    outcome: reconciliation?.outcome ?? ('absent' as const),
    order: reconciliation?.order ?? null,
    idempotencyKey: clientOrderId,
    clientOrderId,
  });
};
