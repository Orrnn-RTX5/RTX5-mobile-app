import {
  captureActiveBrokerSessionOwnerStamp,
  isActiveBrokerSessionOwnerStampCurrent,
  type ActiveBrokerSessionOwnerStamp,
} from '../../state/activeBrokerSession';
import { apiClient } from '../apiClient';
import { StaleBrokerSessionError } from '../brokerApi';
import { assertActivePendingProtectionAllowed } from '../sltpCapabilityGuard';
import { createTradeIdempotencyKey } from '../tradeIdempotency';
import { createTradingApiError } from '../tradingErrors';
import { normalizePositiveSafeIntegerPathSegment } from '../positions/modifyPositionWire';
import { normalizePendingOrderReadType } from './pendingOrderPayload';
import type { PendingOrderType } from './types';

type UnknownRecord = Record<string, unknown>;

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
}>;

export type ModifyPendingOrderInput = Readonly<{
  price?: number | string;
  price_limit?: number | string;
  sl?: number | string | null;
  tp?: number | string | null;
  expiry?: number | null;
}>;

export type PendingOrderMutationOptions = Readonly<{
  /**
   * Reuse only for an exact retry of the same ticket and canonical payload.
   * Omit for a genuinely new user intent.
   */
  idempotencyKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}>;

export type PendingOrderReconciliationResult = Readonly<{
  ticket: number;
  outcome: 'present' | 'absent';
  order: PendingOrderReadModel | null;
  idempotencyKey: string;
}>;

type PendingOrderOwner = ActiveBrokerSessionOwnerStamp;

const hasOwn = (value: UnknownRecord, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const asRecord = (value: unknown): UnknownRecord | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;

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
    if (value === null || value === undefined) return null;
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
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
      throw createTradingApiError(502, {
        error: 'INVALID_RESPONSE',
        message: `Pending-order ${label} is malformed.`,
      });
    }
    return value;
  }
  return null;
};

export const normalizePendingOrderDto = (
  value: unknown,
): PendingOrderReadModel => {
  const record = asRecord(value);
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
      record.ticket as string | number,
      'Pending-order ticket',
    ).numeric;
    accountLogin = normalizePositiveSafeIntegerPathSegment(
      record.account_login as string | number,
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
  const timeSetup = readOptionalUnixSeconds(record, ['time_setup'], 'setup time');
  if (!symbol || !type || !status || timeSetup === null) {
    throw createTradingApiError(502, {
      error: 'INVALID_RESPONSE',
      message: 'Pending-order identity or lifecycle fields are malformed.',
    });
  }

  return Object.freeze({
    ticket,
    accountLogin,
    symbol,
    type,
    status,
    timeSetup,
    volume: readDecimalFamily(record, ['volume_exact', 'volume'], 'volume'),
    price: readDecimalFamily(record, ['price_exact', 'price'], 'trigger price'),
    priceLimit: readDecimalFamily(record, ['price_limit'], 'limit price'),
    sl: readDecimalFamily(
      record,
      ['sl_exact', 'price_sl_exact', 'sl', 'price_sl'],
      'Stop Loss',
    ),
    tp: readDecimalFamily(
      record,
      ['tp_exact', 'price_tp_exact', 'tp', 'price_tp'],
      'Take Profit',
    ),
    expiry: readOptionalUnixSeconds(
      record,
      ['time_expiry', 'expiry', 'expiration'],
      'expiry',
    ),
    timeDone: readOptionalUnixSeconds(record, ['time_done'], 'completion time'),
    comment: typeof record.comment === 'string' ? record.comment : null,
    stateVersion: record.state_version === undefined || record.state_version === null
      ? null
      : String(record.state_version),
    triggerPhase: typeof record.trigger_phase === 'string' ? record.trigger_phase : null,
  });
};

export const buildModifyPendingOrderRequestBody = (
  input: ModifyPendingOrderInput,
  nowUnixSeconds = Math.floor(Date.now() / 1000),
): Readonly<Record<string, string | number | null>> => {
  const source = input as UnknownRecord;
  const body: Record<string, string | number | null> = {};

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
    // Contract 6.3: clearing SL/TP is `null`, never 0.
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
  if (hasOwn(source, 'expiry')) {
    const expiry = input.expiry;
    if (expiry === null) {
      body.expiry = null;
    } else if (
      typeof expiry !== 'number' ||
      !Number.isSafeInteger(expiry) ||
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
): Promise<PendingOrderReadModel[]> => {
  assertPendingOrderOwnerCurrent(owner);
  const login = normalizePositiveSafeIntegerPathSegment(
    owner.accountLogin,
    'Pending-order account login',
  );
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
  const orders = value.map(normalizePendingOrderDto);
  if (orders.some((order) => String(order.accountLogin) !== owner.accountLogin)) {
    throw createTradingApiError(502, {
      error: 'INVALID_RESPONSE',
      message: 'Pending-order list returned a row for another account.',
    });
  }
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
  const orders = await listPendingOrdersForOwner(owner);
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
  const body = buildModifyPendingOrderRequestBody(input);
  assertActivePendingProtectionAllowed(body);
  const idempotencyKey =
    options.idempotencyKey?.trim() ||
    createTradeIdempotencyKey(`pending-modify-${ticket.path}`);
  let primaryError: unknown;

  try {
    assertPendingOrderOwnerCurrent(owner);
    const response = await apiClient(`/orders/pending/${ticket.path}`, {
      method: 'PUT',
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(body),
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      replayAfterAuthRefresh: false,
    });
    assertPendingOrderOwnerCurrent(owner);
    if (response.status !== 200) {
      throw createTradingApiError(response.status, await readError(response));
    }
    // v3 answers with a PARTIAL row: {ticket, status:"modified",
    // state_version, price_limit, ...sent fields}. Only check identity; the
    // captured-owner list re-fetch below is always authoritative.
    parseModifyPendingOrderResponse(await response.json(), ticket.numeric);
    assertPendingOrderOwnerCurrent(owner);
  } catch (error) {
    primaryError = error;
  }

  if (!isPendingOrderOwnerCurrent(owner)) {
    throw new StaleBrokerSessionError();
  }
  let reconciliation;
  try {
    reconciliation = await reconcilePendingMutation(owner, ticket.numeric);
  } catch (reconciliationError) {
    if (primaryError !== undefined) throw primaryError;
    throw reconciliationError;
  }
  if (primaryError !== undefined) throw primaryError;
  return Object.freeze({
    ticket: ticket.numeric,
    ...reconciliation,
    idempotencyKey,
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
  const record = asRecord(value);
  if (
    !record ||
    !responseTicketMatches(record.ticket, expectedTicket) ||
    record.status !== 'modified'
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
  const record = asRecord(value);
  if (
    !record ||
    !responseTicketMatches(record.ticket, expectedTicket) ||
    record.status !== 'cancelled' ||
    typeof record.time !== 'number' ||
    !Number.isSafeInteger(record.time) ||
    record.time <= 0
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
  const idempotencyKey =
    options.idempotencyKey?.trim() ||
    createTradeIdempotencyKey(`pending-cancel-${ticket.path}`);
  let primaryError: unknown;

  try {
    assertPendingOrderOwnerCurrent(owner);
    const response = await apiClient(`/orders/pending/${ticket.path}`, {
      method: 'DELETE',
      headers: {
        accept: 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      // Intentionally no `body` property: the strict handler requires a
      // genuinely zero-byte DELETE.
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      replayAfterAuthRefresh: false,
    });
    assertPendingOrderOwnerCurrent(owner);
    if (response.status !== 200) {
      throw createTradingApiError(response.status, await readError(response));
    }
    parseCancelPendingOrderResponse(await response.json(), ticket.numeric);
    assertPendingOrderOwnerCurrent(owner);
  } catch (error) {
    primaryError = error;
  }

  if (!isPendingOrderOwnerCurrent(owner)) {
    throw new StaleBrokerSessionError();
  }
  let reconciliation;
  try {
    reconciliation = await reconcilePendingMutation(owner, ticket.numeric);
  } catch (reconciliationError) {
    if (primaryError !== undefined) throw primaryError;
    throw reconciliationError;
  }
  if (primaryError !== undefined) throw primaryError;
  if (reconciliation.outcome !== 'absent') {
    throw createTradingApiError(409, {
      error: 'PENDING_RECONCILIATION_INCOMPLETE',
      message: 'The pending order is still present after cancellation acknowledgement.',
    });
  }
  return Object.freeze({
    ticket: ticket.numeric,
    ...reconciliation,
    idempotencyKey,
  });
};
