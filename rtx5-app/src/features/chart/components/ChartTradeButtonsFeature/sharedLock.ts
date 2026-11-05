/**
 * Module-scoped shared lock for the one-click-OFF Order Ticket handoff when
 * multiple ChartTradeButtons variants are mounted on the same screen.
 * One-click market-order dispatch deliberately does not use this lock.
 */
import type { TradeSide } from '../../../../domain/tradeSide';

// Short enough that a second Buy/Sell after opening the ticket feels instant.
export const CHART_TRADE_TAP_RELEASE_DELAY_MS = 180;
/** If a launch/nav path dies without releasing, recover so Buy/Sell work again. */
export const CHART_TRADE_SHARED_LOCK_STALE_MS = 2_500;

let chartTradeButtonSharedLockSide: TradeSide | null = null;
let chartTradeButtonSharedLockAcquiredAtMs = 0;
let chartTradeButtonSharedLockReleaseTimer: ReturnType<typeof setTimeout> | null = null;

const clearSharedLockReleaseTimer = () => {
  if (chartTradeButtonSharedLockReleaseTimer) {
    clearTimeout(chartTradeButtonSharedLockReleaseTimer);
    chartTradeButtonSharedLockReleaseTimer = null;
  }
};

const clearSharedLockNow = () => {
  clearSharedLockReleaseTimer();
  chartTradeButtonSharedLockSide = null;
  chartTradeButtonSharedLockAcquiredAtMs = 0;
};

export const acquireChartTradeButtonSharedLock = (side: TradeSide) => {
  if (chartTradeButtonSharedLockSide !== null) {
    const heldForMs = Date.now() - chartTradeButtonSharedLockAcquiredAtMs;
    // Recover from cancelled order-ticket launches that never released the lock.
    if (heldForMs < CHART_TRADE_SHARED_LOCK_STALE_MS) {
      return false;
    }
    clearSharedLockNow();
  }
  clearSharedLockReleaseTimer();
  chartTradeButtonSharedLockSide = side;
  chartTradeButtonSharedLockAcquiredAtMs = Date.now();
  return true;
};

export const releaseChartTradeButtonSharedLock = (side: TradeSide, delayMs = 0) => {
  if (chartTradeButtonSharedLockSide !== side) {
    return;
  }
  clearSharedLockReleaseTimer();
  if (delayMs > 0) {
    chartTradeButtonSharedLockReleaseTimer = setTimeout(() => {
      if (chartTradeButtonSharedLockSide === side) {
        chartTradeButtonSharedLockSide = null;
        chartTradeButtonSharedLockAcquiredAtMs = 0;
      }
      chartTradeButtonSharedLockReleaseTimer = null;
    }, delayMs);
    return;
  }
  chartTradeButtonSharedLockSide = null;
  chartTradeButtonSharedLockAcquiredAtMs = 0;
};

export const getChartTradeButtonSharedLockSide = (): TradeSide | null =>
  chartTradeButtonSharedLockSide;
