import type { PendingOrderType } from '../api/orders/types';

export type PendingTimeInForce = 'GTC' | 'DAY' | 'GTD';
export type PendingPriceRules = {
  digits?: number;
  tickSize?: number;
  stopsLevel?: string | number;
};

export const pendingPriceRulesReady = (rules: PendingPriceRules): boolean =>
  Number.isInteger(rules.digits) && Number(rules.digits) >= 0 && Number(rules.digits) <= 10
  && rules.stopsLevel !== undefined && Number.isFinite(Number(rules.stopsLevel)) && Number(rules.stopsLevel) >= 0;

export const isStopLimitPendingType = (type: string): boolean => /_stop_limit$/.test(type);
export const pendingOrderSide = (type: string): 'buy' | 'sell' => type.startsWith('sell') ? 'sell' : 'buy';

export const pendingPoint = (rules: PendingPriceRules): number =>
  Math.pow(10, -Math.max(0, Math.min(10, rules.digits ?? 5)));

export const pendingMinimumDistance = (rules: PendingPriceRules): number =>
  Math.max(0, Number(rules.stopsLevel) || 0) * pendingPoint(rules);

export const roundPendingPrice = (value: number, rules: PendingPriceRules): number => {
  const tick = rules.tickSize && rules.tickSize > 0 ? rules.tickSize : pendingPoint(rules);
  return Number((Math.round(value / tick) * tick).toFixed(rules.digits ?? 8));
};

export const defaultPendingPrice = (
  type: PendingOrderType, bid: number, ask: number, rules: PendingPriceRules,
): number => {
  const tick = rules.tickSize && rules.tickSize > 0 ? rules.tickSize : pendingPoint(rules);
  // One extra tick keeps the rounded default strictly on the permitted side.
  const offset = Math.max(pendingMinimumDistance(rules), tick * 10) + tick;
  const reference = pendingOrderSide(type) === 'buy' ? ask : bid;
  const above = type === 'sell_limit' || type === 'buy_stop' || type === 'buy_stop_limit';
  return roundPendingPrice(reference + (above ? offset : -offset), rules);
};

export const pendingEntryPrice = (type: string, price: number, priceLimit?: number): number =>
  isStopLimitPendingType(type) ? Number(priceLimit) : price;

export function validatePendingOrder(input: PendingPriceRules & {
  type: PendingOrderType;
  price: number;
  priceLimit?: number;
  sl?: number | null;
  tp?: number | null;
  bid?: number;
  ask?: number;
  /** A protection/expiry-only modification need not revalidate an unchanged trigger. */
  validateTrigger?: boolean;
}): string | null {
  const { type, price, priceLimit, sl, tp } = input;
  const buy = pendingOrderSide(type) === 'buy';
  const distance = pendingMinimumDistance(input);
  const epsilon = Math.max(pendingPoint(input) * 1e-5, Number.EPSILON * Math.max(price, 1) * 8);
  if (!Number.isFinite(price) || price <= 0) return 'Trigger price must be greater than 0.';
  if (isStopLimitPendingType(type) && (!Number.isFinite(priceLimit) || Number(priceLimit) <= 0)) {
    return 'Stop Limit price must be greater than 0.';
  }
  if (input.validateTrigger !== false) {
    const reference = buy ? input.ask : input.bid;
    if (!Number.isFinite(reference) || Number(reference) <= 0) return `Wait for a live ${buy ? 'Ask' : 'Bid'} price.`;
    const above = type === 'sell_limit' || type === 'buy_stop' || type === 'buy_stop_limit';
    const delta = above ? price - Number(reference) : Number(reference) - price;
    if (delta <= epsilon || delta + epsilon < distance) {
      return `Trigger price must be ${above ? 'above' : 'below'} ${buy ? 'Ask' : 'Bid'}${distance > 0 ? ` by at least ${distance.toFixed(input.digits ?? 8)}` : ''}.`;
    }
  }
  const entry = pendingEntryPrice(type, price, priceLimit);
  for (const [label, value, below] of [['Stop Loss', sl, buy], ['Take Profit', tp, !buy]] as const) {
    if (value === null || value === undefined || value === 0) continue;
    if (!Number.isFinite(value) || value < 0) return `${label} must be a positive price or blank.`;
    const delta = below ? entry - value : value - entry;
    if (delta <= epsilon || delta + epsilon < distance) {
      return `${label} must be ${below ? 'below' : 'above'} the pending entry price${distance > 0 ? ` by at least ${distance.toFixed(input.digits ?? 8)}` : ''}.`;
    }
  }
  return null;
}

export const endOfLocalDaySeconds = (now = new Date()): number => {
  const end = new Date(now);
  end.setHours(23, 59, 59, 0);
  return Math.floor(end.getTime() / 1000);
};

export function pendingExpiry(
  timeInForce: PendingTimeInForce, value?: number | null, nowMs = Date.now(),
): number | null {
  if (timeInForce === 'GTC') return null;
  const expiry = timeInForce === 'DAY' ? endOfLocalDaySeconds(new Date(nowMs)) : value;
  if (!Number.isSafeInteger(expiry) || Number(expiry) <= Math.floor(nowMs / 1000) || Number(expiry) >= 1e11) {
    throw new Error('Expiration must be a future date and time in Unix seconds.');
  }
  return Number(expiry);
}
