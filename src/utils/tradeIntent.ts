import { getApiLatencyNow } from './apiLatency';

/**
 * Tap-time mark for the order latency telemetry. Buy/Sell handlers call
 * `markTradeIntent()` as their very first instruction; `placeMarketOrder`
 * takes it as the start of the tap-to-result duration. Monotonic clock only.
 */

// A mark older than this belongs to a tap that never reached placement.
const TRADE_INTENT_MAX_AGE_MS = 10_000;

let pendingIntentAtMs: number | null = null;

export function markTradeIntent(): void {
  pendingIntentAtMs = getApiLatencyNow();
}

/** Returns and clears the pending tap mark, or `fallbackAtMs` when none is fresh. */
export function takeTradeIntentStartedAt(fallbackAtMs: number = getApiLatencyNow()): number {
  const intentAtMs = pendingIntentAtMs;
  pendingIntentAtMs = null;
  if (intentAtMs === null || intentAtMs > fallbackAtMs || fallbackAtMs - intentAtMs > TRADE_INTENT_MAX_AGE_MS) {
    return fallbackAtMs;
  }
  return intentAtMs;
}
