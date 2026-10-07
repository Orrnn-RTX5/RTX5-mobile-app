/**
 * Trade Feature Utilities: tradeFlow
 * 
 * Provides helper functions for managing and filtering trade positions,
 * resolving display names for symbols, and retrieving potential hedge
 * candidates for "Close By" operations.
 */

import { PositionItem } from '../../dev/mock/tradingData';
import { normalizeSymbol } from '../../domain/symbols';
import { dedupePositionsById } from '../../state/positionsState.helpers';

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

export function filterPositionsForBulk(positions: PositionItem[], mode?: string | string[]) {
  const normalized = Array.isArray(mode) ? mode[0] : mode;

  if (normalized === 'profitable') {
    return dedupePositionsById(positions.filter((position) => position.pnl > 0));
  }
  if (normalized === 'losing') {
    return dedupePositionsById(positions.filter((position) => position.pnl < 0));
  }
  if (normalized === 'buy') {
    return dedupePositionsById(positions.filter((position) => position.side === 'buy'));
  }
  if (normalized === 'sell') {
    return dedupePositionsById(positions.filter((position) => position.side === 'sell'));
  }
  if (normalized?.startsWith('symbol:')) {
    const symbol = normalized.replace('symbol:', '');
    return dedupePositionsById(positions.filter((position) => position.symbol === symbol));
  }
  return dedupePositionsById(positions);
}

export function positionPairCandidates(positions: PositionItem[], position?: PositionItem) {
  if (!position) return [];
  return dedupePositionsById(
    positions.filter(
      (candidate) =>
        candidate.id !== position.id &&
        candidate.symbol === position.symbol &&
        candidate.side !== position.side,
    ),
  );
}
