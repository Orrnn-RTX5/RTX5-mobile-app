import type { PositionItem, QuoteItem } from '../../domain/tradingModels';
import { MARKET_QUOTE_STALE_AFTER_MS } from '../../market/quotePolicy';
import { normalizeChartOverlaySymbol } from './chartOverlays/symbolUtils';
import { parseChartPositionStopDragKey } from './chartOverlays/positionStopDragKeys';

export const POSITION_ACTIONS = ['details', 'tp', 'sl', 'close', 'share', 'add', 'reverse'] as const;
export type ChartPositionAction = typeof POSITION_ACTIONS[number];
export type ChartPositionScope = Readonly<{
  sessionScope: string;
  dataContextSig: string;
  chartGeneration: number;
  symbol: string;
}>;
export type ChartPositionControl = ChartPositionScope & {
  positionId: string;
  positionKey: string;
  modifyDisabledReason?: string;
  tradingDisabledReason?: string;
  fontScale: number;
};
export type ChartPositionIntent = ChartPositionScope & {
  type: 'CHART_POSITION_ACTION';
  positionId: string;
  positionKey: string;
  requestId: number;
  action: ChartPositionAction;
  groupPositionIds?: string[];
};
export type ChartPositionLevelIntent = ChartPositionScope & {
  type: 'CHART_TRADE_LINE_DRAG'; positionId: string; positionKey: string; requestId: number;
  dragKey: string; phase: 'start' | 'move' | 'end' | 'cancel'; levelRole: 'tp' | 'sl'; price: number;
};

// JSON tuples avoid delimiter collisions and never convert broker tickets to Number.
export const positionControlKey = (scope: string, id: string, symbol: string): string =>
  JSON.stringify([scope, id, symbol]);

export function formatPositionLots(volume: number, step?: number): string {
  if (!Number.isFinite(volume) || volume <= 0) return '—';
  const decimals = Number.isFinite(step) && step! > 0
    ? Math.min(8, Math.max(0, (String(step).split('.')[1] ?? '').length, Math.ceil(-Math.log10(step!))))
    : Math.min(8, Math.max(2, (String(volume).split('.')[1] ?? '').length));
  // Never round an actual remaining volume to the broker's order increment.
  return volume.toFixed(Math.max(decimals, Math.min(8, (String(volume).split('.')[1] ?? '').length)));
}

export function positionProfitDisplay(position: PositionItem, quote?: Partial<QuoteItem>, now = Date.now()) {
  const reported = Number(position.pnl);
  if (position.pnlReported === false || !Number.isFinite(reported)) return { value: null, estimated: false };
  const liquidation = position.side === 'buy' ? quote?.bid : quote?.ask;
  const stamp = quote?.lastReceivedAt || quote?.lastTickAt;
  const fresh = quote?.stale !== true && quote?.tradable !== false && typeof stamp === 'number'
    && stamp > 0 && now - stamp >= -5000 && now - stamp <= MARKET_QUOTE_STALE_AFTER_MS;
  const direction = position.side === 'buy' ? 1 : -1;
  const delta = direction * (position.currentPrice - position.openPrice);
  const charges = (Number(position.swap) || 0) + (Number(position.commission) || 0);
  // Calibrate only from this broker's account-currency snapshot. No guessed
  // Forex contract size or quote-currency amount is labelled account profit.
  const factor = (reported - charges) / delta;
  if (fresh && typeof liquidation === 'number' && liquidation > 0 && Math.abs(delta) > 1e-10
    && Number.isFinite(factor) && factor > 0 && liquidation !== position.currentPrice) {
    return { value: reported + direction * (liquidation - position.currentPrice) * factor, estimated: true };
  }
  return { value: reported, estimated: false };
}

export function validatePositionIntent(raw: Record<string, unknown>, scope: ChartPositionScope,
  positions: readonly PositionItem[]): ChartPositionIntent | null {
  if (raw.type !== 'CHART_POSITION_ACTION' || !scope.sessionScope
    || raw.sessionScope !== scope.sessionScope || raw.dataContextSig !== scope.dataContextSig
    || raw.chartGeneration !== scope.chartGeneration || typeof raw.symbol !== 'string'
    || normalizeChartOverlaySymbol(raw.symbol) !== normalizeChartOverlaySymbol(scope.symbol)
    || typeof raw.positionId !== 'string' || !raw.positionId || raw.positionId.length > 256
    || !Number.isSafeInteger(raw.requestId) || Number(raw.requestId) <= 0
    || !POSITION_ACTIONS.includes(raw.action as ChartPositionAction)
    || (raw.groupPositionIds !== undefined && (!Array.isArray(raw.groupPositionIds) || raw.groupPositionIds.length > 5000
      || raw.groupPositionIds.some(id => typeof id !== 'string' || !id || id.length > 256)
      || new Set(raw.groupPositionIds).size !== raw.groupPositionIds.length))
    || raw.positionKey !== positionControlKey(scope.sessionScope, raw.positionId, raw.symbol)) return null;
  const position = positions.find(row => row.id === raw.positionId && row.symbol === raw.symbol);
  if (!position || !Number.isFinite(position.openPrice) || position.openPrice <= 0
    || !Number.isFinite(position.volume) || position.volume <= 0) return null;
  return raw as ChartPositionIntent;
}

export function validatePositionLevelIntent(raw: Record<string, unknown>, scope: ChartPositionScope,
  positions: readonly PositionItem[]): ChartPositionLevelIntent | null {
  if (raw.type !== 'CHART_TRADE_LINE_DRAG' || !['start','move','end','cancel'].includes(String(raw.phase))) return null;
  const intent = validatePositionIntent({ ...raw, type:'CHART_POSITION_ACTION', action:raw.levelRole }, scope, positions);
  const target = parseChartPositionStopDragKey(raw.dragKey);
  if (!intent || !target || target.positionId !== intent.positionId || target.kind !== intent.action
    || typeof raw.price !== 'number' || !Number.isFinite(raw.price) || raw.price <= 0) return null;
  return raw as ChartPositionLevelIntent;
}

/** Independent from React ticks; one busy mutation per scoped ticket. */
export function createPositionActionGate() {
  const seen = new Set<string>();
  const busy = new Set<string>();
  const listeners = new Map<string, Set<() => void>>();
  let requestScope = '';
  const publish = (key: string) => listeners.get(key)?.forEach(listener => listener());
  return {
    isBusy: (key: string) => busy.has(key),
    subscribe(key: string, listener: () => void) {
      const group = listeners.get(key) ?? new Set<() => void>();
      group.add(listener); listeners.set(key, group);
      return () => { group.delete(listener); if (!group.size) listeners.delete(key); };
    },
    claim(intent: ChartPositionIntent): boolean {
      const nextScope = JSON.stringify([intent.sessionScope, intent.dataContextSig, intent.chartGeneration]);
      if (nextScope !== requestScope) { seen.clear(); requestScope = nextScope; }
      const requestKey = JSON.stringify([intent.sessionScope, intent.dataContextSig, intent.chartGeneration, intent.requestId]);
      if (seen.has(requestKey) || busy.has(intent.positionKey)) return false;
      seen.add(requestKey);
      return true;
    },
    async run<T>(key: string, work: () => Promise<T>): Promise<T> {
      if (busy.has(key)) throw new Error('A position action is already pending.');
      busy.add(key);
      publish(key);
      try { return await work(); } finally { busy.delete(key); publish(key); }
    },
  };
}

export async function reverseConfirmedPosition(deps: {
  close: () => Promise<void>; isCurrent: () => boolean; openOpposite: () => Promise<void>;
}): Promise<void> {
  await deps.close();
  if (!deps.isCurrent()) return;
  try { await deps.openOpposite(); } catch (error) {
    const failure: Error & { replacementFailure?: unknown } = new Error(
      `Position closed, but the replacement order failed: ${error instanceof Error ? error.message : 'Broker rejected the order.'}`,
    );
    failure.replacementFailure = error;
    throw failure;
  }
}
