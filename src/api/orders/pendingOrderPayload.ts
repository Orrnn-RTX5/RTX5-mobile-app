import type { PendingOrderType, PlacePendingOrderPayload } from './types';
import { createUuidV4 } from '../tradeIdempotency';
import { isStopLimitPendingType, pendingExpiry, pendingOrderSide, roundPendingPrice } from '../../domain/pendingOrders';

const PENDING_ORDER_TYPES = new Set<PendingOrderType>([
  'buy_limit', 'sell_limit', 'buy_stop', 'sell_stop', 'buy_stop_limit', 'sell_stop_limit',
]);

export class PendingOrderPayloadError extends Error {
  constructor(message: string) { super(message); this.name = 'PendingOrderPayloadError'; }
}

export const normalizePendingOrderType = (value: unknown): PendingOrderType | null => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase().replace(/[\s-]+/g, '_') : '';
  return PENDING_ORDER_TYPES.has(normalized as PendingOrderType) ? normalized as PendingOrderType : null;
};
export const normalizePendingOrderReadType = normalizePendingOrderType;

export const resolvePendingOrderTriggerPrice = (payload: PlacePendingOrderPayload): number =>
  Number(payload.price ?? payload.price_open);
export const resolvePendingOrderStopLimitPrice = (payload: PlacePendingOrderPayload): number =>
  Number(payload.price_limit ?? payload.stopLimitPrice ?? payload.stop_limit_price);

const positive = (value: unknown, label: string): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) throw new PendingOrderPayloadError(label + ' must be greater than 0.');
  return numeric;
};

const byteLength = (value: string): number => {
  let length = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    length += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return length;
};

export function buildPendingOrderRequestBody(payload: PlacePendingOrderPayload): Record<string, unknown> {
  const login = Number(payload.account_login);
  if (!Number.isSafeInteger(login) || login <= 0) throw new PendingOrderPayloadError('Invalid account login for pending order.');
  const symbol = String(payload.symbol ?? '').trim().toUpperCase();
  if (!symbol || byteLength(symbol) > 20) throw new PendingOrderPayloadError('Pending order symbol must contain 1 to 20 bytes.');
  const type = normalizePendingOrderType(payload.type);
  if (!type) throw new PendingOrderPayloadError('This pending order type is not supported by the trading API.');
  if (String(payload.side).toLowerCase() !== pendingOrderSide(type)) {
    throw new PendingOrderPayloadError('Pending order side does not match the selected order type.');
  }
  const price = (value: unknown, label: string) => {
    const numeric = positive(value, label);
    const rounded = payload.digits !== undefined || payload.tickSize !== undefined
      ? roundPendingPrice(numeric, payload) : Number(numeric.toFixed(8));
    return positive(rounded, label);
  };
  const timeInForce = payload.time_in_force ?? (payload.expiry != null || payload.expiration != null ? 'GTD' : 'GTC');
  if (!['GTC', 'DAY', 'GTD'].includes(timeInForce)) throw new PendingOrderPayloadError('Invalid pending order expiration mode.');
  if (payload.expiry !== undefined && payload.expiration !== undefined) throw new PendingOrderPayloadError('Use only the canonical pending expiry field.');
  const volume = positive(payload.volume, 'Pending order volume');
  if (Number(volume.toFixed(8)) !== volume) throw new PendingOrderPayloadError('Pending volume supports at most 8 fractional digits.');
  const body: Record<string, unknown> = {
    client_order_id: createUuidV4(),
    account_login: login,
    symbol,
    side: pendingOrderSide(type).toUpperCase(),
    type,
    volume,
    price: price(resolvePendingOrderTriggerPrice(payload), 'Pending trigger price'),
    time_in_force: timeInForce,
  };
  if (isStopLimitPendingType(type)) body.price_limit = price(resolvePendingOrderStopLimitPrice(payload), 'Stop Limit price');
  for (const [key, alias] of [['sl', 'price_sl'], ['tp', 'price_tp']] as const) {
    if (payload[key] !== undefined && payload[alias] !== undefined) throw new PendingOrderPayloadError('Use only the canonical pending ' + key.toUpperCase() + ' field.');
    const value = payload[key] ?? payload[alias];
    if (value === undefined || value === null || String(value).trim() === '' || Number(value) === 0) continue;
    body[key] = price(value, key === 'sl' ? 'Stop Loss' : 'Take Profit');
  }
  const entry = Number(isStopLimitPendingType(type) ? body.price_limit : body.price);
  const buy = pendingOrderSide(type) === 'buy';
  if (body.sl !== undefined && (buy ? Number(body.sl) >= entry : Number(body.sl) <= entry)) {
    throw new PendingOrderPayloadError('Stop Loss must be ' + (buy ? 'below' : 'above') + ' the pending entry price.');
  }
  if (body.tp !== undefined && (buy ? Number(body.tp) <= entry : Number(body.tp) >= entry)) {
    throw new PendingOrderPayloadError('Take Profit must be ' + (buy ? 'above' : 'below') + ' the pending entry price.');
  }
  if (timeInForce !== 'GTC') {
    try { body.expiry = pendingExpiry(timeInForce, payload.expiry ?? payload.expiration); }
    catch (error) { throw new PendingOrderPayloadError((error as Error).message); }
  }
  if (typeof payload.comment === 'string' && payload.comment.length > 0) {
    if (byteLength(payload.comment) > 1024) throw new PendingOrderPayloadError('Pending comment must not exceed 1024 bytes.');
    body.comment = payload.comment;
  }
  return body;
}
