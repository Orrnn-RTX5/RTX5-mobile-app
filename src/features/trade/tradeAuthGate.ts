export const ORRNN_DEMO_TRADE_BROKER_ID = 'orrnn-demo';

export type TradeAuthIntent = Readonly<{
  // In-memory draft context only; never credentials, tickets, prices or callbacks.
  kind: 'trade-tab' | 'order-ticket' | 'market-order' | 'pending-order' | 'position-action' | 'bulk-action';
  symbol?: string;
  side?: 'buy' | 'sell';
  volume?: number;
  origin?: 'quotes' | 'chart' | 'trade';
  action?: 'close' | 'modify';
  bulkMode?: 'all' | 'profitable' | 'losing' | 'buy' | 'sell';
}>;

export type OrrnnDemoTradeAuthState = Readonly<{
  selectedBrokerId?: unknown;
  isLoggedIn?: boolean;
  accountId?: unknown;
  accessToken?: unknown;
  activeBrokerId?: unknown;
  activeAccountLogin?: unknown;
  activeAccessToken?: unknown;
}>;

type TradeAuthGateRuntime = {
  pendingIntent: TradeAuthIntent | null;
};

type TradeAuthGateGlobal = typeof globalThis & {
  __rtx5TradeAuthGateRuntime?: TradeAuthGateRuntime;
};

const cleanString = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : '';

export function isOrrnnDemoTradeBroker(value: unknown): boolean {
  return value === ORRNN_DEMO_TRADE_BROKER_ID;
}

/**
 * Public Orrnn market data is available for every logged-out user, but trading
 * is not. Require persisted auth plus the matching active broker session before
 * any trade action can continue. A valid logged-in broker keeps its normal flow.
 */
export function shouldRequestOrrnnDemoTradeAuth(
  state: OrrnnDemoTradeAuthState,
): boolean {
  if (state.isLoggedIn !== true) {
    return true;
  }

  const accountId = cleanString(state.accountId);
  return !(
    accountId.length > 0
    && cleanString(state.accessToken).length > 0
    && cleanString(state.activeBrokerId) === cleanString(state.selectedBrokerId)
    && /^\d+$/.test(accountId) && /[1-9]/.test(accountId)
    && cleanString(state.activeAccountLogin) === accountId
    && cleanString(state.activeAccessToken).length > 0
  );
}

function sanitizeTradeAuthIntent(intent: TradeAuthIntent): TradeAuthIntent {
  const symbol = cleanString(intent.symbol);
  const side = intent.side === 'buy' || intent.side === 'sell' ? intent.side : undefined;
  const origin = intent.origin === 'quotes' || intent.origin === 'chart' || intent.origin === 'trade'
    ? intent.origin
    : undefined;
  const action = intent.action === 'close' || intent.action === 'modify'
    ? intent.action
    : undefined;
  const bulkMode = intent.bulkMode === 'all'
    || intent.bulkMode === 'profitable'
    || intent.bulkMode === 'losing'
    || intent.bulkMode === 'buy'
    || intent.bulkMode === 'sell'
    ? intent.bulkMode
    : undefined;

  return Object.freeze({
    kind: intent.kind,
    ...(symbol ? { symbol } : {}),
    ...(side ? { side } : {}),
    ...(typeof intent.volume === 'number' && Number.isFinite(intent.volume) && intent.volume > 0 ? { volume: intent.volume } : {}),
    ...(origin ? { origin } : {}),
    ...(action ? { action } : {}),
    ...(bulkMode ? { bulkMode } : {}),
  });
}

const runtimeGlobal = globalThis as TradeAuthGateGlobal;
const tradeAuthGateRuntime = runtimeGlobal.__rtx5TradeAuthGateRuntime ?? {
  pendingIntent: null,
};
runtimeGlobal.__rtx5TradeAuthGateRuntime = tradeAuthGateRuntime;

export function savePendingTradeAuthIntent(intent: TradeAuthIntent): TradeAuthIntent {
  if (tradeAuthGateRuntime.pendingIntent) return tradeAuthGateRuntime.pendingIntent;
  const sanitizedIntent = sanitizeTradeAuthIntent(intent);
  tradeAuthGateRuntime.pendingIntent = sanitizedIntent;
  return sanitizedIntent;
}

export function getPendingTradeAuthIntent(): TradeAuthIntent | null {
  return tradeAuthGateRuntime.pendingIntent;
}

export function consumePendingTradeAuthIntent(): TradeAuthIntent | null {
  const intent = tradeAuthGateRuntime.pendingIntent;
  tradeAuthGateRuntime.pendingIntent = null;
  return intent;
}

export function clearPendingTradeAuthIntent(): void {
  tradeAuthGateRuntime.pendingIntent = null;
}
