import { captureActiveBrokerSessionOwnerStamp } from '../../state/activeBrokerSession';
import { createMarketOrderClientOrderId } from '../tradeIdempotency';
import type { PlaceOrderPayload, PlaceOrderResponse } from './types';

/** Shares callbacks for the same request identity, never distinct click IDs. */
export function createOrderRequestRegistry<T>() {
  const pending = new Map<string, Promise<T>>();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => { try { listener(); } catch {} });
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    hasPrefix(prefix: string) {
      for (const key of pending.keys()) if (key.startsWith(prefix)) return true;
      return false;
    },
    run(key: string, start: () => Promise<T>): Promise<T> {
      const existing = pending.get(key);
      if (existing) return existing;
      let resolve!: (value: T) => void;
      let reject!: (error: unknown) => void;
      const request = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
      // Reserve before transport starts, including reentrant native callbacks.
      pending.set(key, request);
      const finish = () => { pending.delete(key); notify(); };
      try {
        const operation = start();
        // Transport starts before subscribers can render busy feedback.
        notify();
        operation.then(value => { finish(); resolve(value); }, error => { finish(); reject(error); });
      } catch (error) { finish(); reject(error); }
      return request;
    },
  };
}

export const marketOrderRequests = createOrderRequestRegistry<PlaceOrderResponse>();

/** Allocate once per physical click, before starting that click's request. */
export const createMarketOrderIntentId = (): string => createMarketOrderClientOrderId();

const prefix = (scope: string, symbol: string, side: string) =>
  JSON.stringify([scope, symbol.trim().toUpperCase(), side.toLowerCase()]) + ':';

export function marketOrderRequestKey(scope: string, payload: PlaceOrderPayload): string {
  const protection = (canonical: 'sl' | 'tp', legacy: 'price_sl' | 'price_tp') => {
    const hasCanonical = Object.prototype.hasOwnProperty.call(payload, canonical);
    const hasLegacy = Object.prototype.hasOwnProperty.call(payload, legacy);
    if (hasCanonical && hasLegacy) return ['conflicting-fields', payload[canonical], payload[legacy]];
    const value = hasCanonical ? payload[canonical] : payload[legacy];
    if (value == null) return 0;
    const number = Number(value);
    if (!Number.isFinite(number) || (hasCanonical && number === 0)) return ['invalid', String(value)];
    return number;
  };
  return prefix(scope, payload.symbol, payload.side) + JSON.stringify([
    Number(payload.account_login), Number(payload.volume),
    protection('sl', 'price_sl'), protection('tp', 'price_tp'),
    payload.comment ?? '', payload.trailing_stop ?? 0, payload.trailing_step ?? 0,
    payload.frontendIntentId === undefined ? ['legacy'] : ['intent', payload.frontendIntentId],
  ]);
}

export function isMarketOrderPending(symbol: string, side: 'buy' | 'sell', scope = captureActiveBrokerSessionOwnerStamp()?.cacheNamespace): boolean {
  return Boolean(scope && marketOrderRequests.hasPrefix(prefix(scope, symbol, side)));
}
