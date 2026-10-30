/**
 * Trade Feature Utilities: tradeFlow
 * 
 * Provides helper functions for managing and filtering trade positions,
 * resolving display names for symbols, and retrieving potential hedge
 * candidates for "Close By" operations.
 */

import { PositionItem, QuoteItem } from '../../domain/tradingModels';
import { normalizeSymbol } from '../../domain/symbols';
import { dedupePositionsById } from '../../state/positionsState.helpers';
import { resolveLivePositionPnl } from './livePositionMetrics';

export function findPositionById(positions: PositionItem[], positionId?: string | string[]) {
  if (!positionId) return undefined;
  const normalized = Array.isArray(positionId) ? positionId[0] : positionId;
  return positions.find((position) => position.id === normalized);
}

export function symbolDisplayName(symbol: string) {
  const map: Record<string, string> = {
    BTCUSD: 'Bitcoin vs US Dollar',
    XAUUSD: 'Gold vs US Dollar',
    MBTUSD: 'Micro Bitcoin vs US Dollar',
  };
  return map[normalizeSymbol(symbol)] ?? symbol;
}

export function bulkModeLabel(mode?: string | string[]) {
  const normalized = Array.isArray(mode) ? mode[0] : mode;
  const symbolPrefix = 'symbol:';

  switch (normalized) {
    case 'all':
      return 'Close All Positions';
    case 'profitable':
      return 'Close Profitable Positions';
    case 'losing':
      return 'Close Losing Positions';
    case 'buy':
      return 'Close Buy Positions';
    case 'sell':
      return 'Close Sell Positions';
    default:
      if (normalized?.startsWith(symbolPrefix)) {
        const symbol = normalized.slice(symbolPrefix.length).trim().replace(/\//g, '');
        return symbol ? `Close ${symbol} Positions` : 'Bulk Operation';
      }
      return 'Bulk Operation';
  }
}

export function filterPositionsForBulk(
  positions: PositionItem[],
  mode?: string | string[],
  quotes?: Record<string, Partial<QuoteItem> | undefined>,
) {
  const normalized = Array.isArray(mode) ? mode[0] : mode;
  const resolvePnl = (position: PositionItem) =>
    quotes ? resolveLivePositionPnl(position, quotes[position.symbol]) : position.pnl;

  if (normalized === 'profitable') {
    return dedupePositionsById(positions.filter((position) => resolvePnl(position) > 0));
  }
  if (normalized === 'losing') {
    return dedupePositionsById(positions.filter((position) => resolvePnl(position) < 0));
  }
  if (normalized === 'buy') {
    return dedupePositionsById(positions.filter((position) => position.side === 'buy'));
  }
  if (normalized === 'sell') {
    return dedupePositionsById(positions.filter((position) => position.side === 'sell'));
  }
  if (normalized?.startsWith('symbol:')) {
    const targetSymbol = normalizeSymbol(normalized.replace('symbol:', ''));
    return dedupePositionsById(
      positions.filter((position) => normalizeSymbol(position.symbol) === targetSymbol),
    );
  }
  return dedupePositionsById(positions);
}

export function positionPairCandidates(positions: PositionItem[], position?: PositionItem) {
  if (!position) return [];
  const targetSymbol = normalizeSymbol(position.symbol);
  return dedupePositionsById(
    positions.filter(
      (candidate) =>
        candidate.id !== position.id &&
        normalizeSymbol(candidate.symbol) === targetSymbol &&
        candidate.side !== position.side,
    ),
  );
}
