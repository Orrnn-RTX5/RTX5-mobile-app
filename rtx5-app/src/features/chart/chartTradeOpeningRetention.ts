import type { ChartTradeHistoryOpenPosition } from './chartOverlays/tradeHistory';
import { normalizeChartOverlaySymbol } from './chartOverlays/symbolUtils';

export type ChartTradeOpeningRetentionState = {
  scopeKey: string;
  openings: Map<string, ChartTradeHistoryOpenPosition>;
};

export const createChartTradeOpeningRetentionState = (): ChartTradeOpeningRetentionState => ({
  scopeKey: '',
  openings: new Map(),
});

const buildOpeningKey = (position: ChartTradeHistoryOpenPosition): string => {
  const ticket = String(position.id ?? position.ticket ?? '').trim();
  if (ticket) return `ticket:${ticket}`;
  return [
    'location',
    normalizeChartOverlaySymbol(position.symbol),
    position.side,
    String(position.openTime ?? position.time_create ?? ''),
    String(position.openPrice ?? position.price_open ?? ''),
  ].join(':');
};

const copyOpening = (
  position: ChartTradeHistoryOpenPosition,
): ChartTradeHistoryOpenPosition => ({
  id: position.id,
  ticket: position.ticket,
  symbol: position.symbol,
  side: position.side,
  openPrice: position.openPrice,
  price_open: position.price_open,
  openTime: position.openTime,
  time_create: position.time_create,
  volume: position.volume,
});

/**
 * Remembers each broker-confirmed opening after its live position disappears.
 * Closing and history endpoints can settle in different polls; retaining the
 * opening prevents its arrow from blinking away during that handoff. The map
 * is isolated per broker/account session and bounded for long app sessions.
 */
export const retainChartTradeOpenings = (
  state: ChartTradeOpeningRetentionState,
  scopeKey: string,
  currentPositions: readonly ChartTradeHistoryOpenPosition[],
  maxEntries = 2_000,
): ChartTradeHistoryOpenPosition[] => {
  if (!scopeKey) {
    state.scopeKey = '';
    state.openings.clear();
    return [];
  }
  if (state.scopeKey !== scopeKey) {
    state.scopeKey = scopeKey;
    state.openings.clear();
  }

  currentPositions.forEach((position) => {
    const key = buildOpeningKey(position);
    // Refresh insertion order so the bounded map evicts the oldest observed
    // trade rather than a currently-active one.
    state.openings.delete(key);
    state.openings.set(key, copyOpening(position));
  });

  const limit = Math.max(1, Math.floor(maxEntries));
  while (state.openings.size > limit) {
    const oldestKey = state.openings.keys().next().value;
    if (typeof oldestKey !== 'string') break;
    state.openings.delete(oldestKey);
  }
  return [...state.openings.values()];
};
