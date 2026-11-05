import type { PositionItem } from '../../domain/tradingModels';

export type EquityTick = {
  symbol: string;
  price: number;
};

export type InstrumentContractSpec = {
  symbol: string;
  contractSize?: number | null;
};

export const DEFAULT_CONTRACT_SIZE = 100_000;

const normalizeSymbolKey = (symbol: string) => symbol.trim().toUpperCase();

// Live ticks recalculate only price profit. Swap and commission are already
// part of open-position net P/L, so keep them once when rebuilding floating P/L.
const netPositionCharges = (position: PositionItem): number =>
  (Number(position.swap) || 0) + (Number(position.commission) || 0);

/**
 * Account-currency P&L per unit of price move for a position.
 *
 * A raw `volume * contractSize` factor is computed in the symbol's QUOTE
 * currency, so it is only correct when that equals the account currency. For
 * USDJPY, EURGBP, XAUUSD, indices, crypto, etc. it silently under/over-states
 * floating P&L. Instead we reverse-engineer the factor from the server's
 * authoritative snapshot `(pnl - swap - commission) / priceDelta` — this
 * implicitly carries the contract size AND the quote→account FX conversion the
 * broker already applied. `volume * contractSize` is only the last-resort
 * fallback for a position that has not moved from its open price yet (so no
 * calibration signal exists, and its P&L is ~0 anyway).
 *
 * This mirrors `derivePriceToPnlFactor` in features/trade/livePositionMetrics.ts
 * (the canonical per-row implementation); keep the two in sync.
 */
const derivePriceToPnlFactor = (
  position: PositionItem,
  direction: number,
  volume: number,
  contractSize: number,
): number => {
  const swap = Number(position.swap) || 0;
  const commission = Number(position.commission) || 0;
  const basePnl = (Number(position.pnl) || 0) - swap - commission;
  const snapshotPrice = Number(position.currentPrice);
  const openPrice = Number(position.openPrice);
  const snapshotDelta = (snapshotPrice - openPrice) * direction;

  if (Number.isFinite(snapshotDelta) && Math.abs(snapshotDelta) > Number.EPSILON) {
    const factor = basePnl / snapshotDelta;
    if (Number.isFinite(factor) && factor !== 0) {
      return factor;
    }
  }

  return volume * contractSize;
};

export function buildContractSizeMap(
  instruments: InstrumentContractSpec[] = [],
): Record<string, number> {
  return instruments.reduce<Record<string, number>>((acc, instrument) => {
    const key = normalizeSymbolKey(instrument.symbol);
    const size = Number(instrument.contractSize);
    if (key && Number.isFinite(size) && size > 0) {
      acc[key] = size;
    }
    return acc;
  }, {});
}

/**
 * Returns the sum of backend-reported position P/L values without recalculating
 * profit from frontend ticks or contract sizes.
 */
export function calculateFloatingPnlFromTick({
  positions,
  tick: _tick,
  contractSizes: _contractSizes,
}: {
  positions: PositionItem[];
  tick: EquityTick;
  contractSizes?: Record<string, number>;
}): number {
  void _tick;
  void _contractSizes;
  return positions.reduce((sum, position) => sum + (Number(position.pnl) || 0), 0);
}

/**
 * Preserves backend-reported floating P/L and balance without frontend tick
 * recalculation.
 */
export function calculateEquityFromTick({
  balance,
  positions,
  tick,
  contractSizes,
}: {
  balance: number;
  positions: PositionItem[];
  tick: EquityTick;
  contractSizes?: Record<string, number>;
}): { equity: number; floating: number } {
  const numericBalance = Number.isFinite(balance) ? balance : 0;
  const floating = calculateFloatingPnlFromTick({ positions, tick, contractSizes });
  return {
    floating,
    equity: numericBalance,
  };
}
