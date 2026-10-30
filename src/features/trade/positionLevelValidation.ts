export function validatePositionLevelChange(input: {
  side: 'buy' | 'sell'; role: 'sl' | 'tp'; proposed: number; previous: number;
  marketPrice: number; tickSize: number; point?: number; stopsLevel?: string | number; freezeLevel?: string | number;
}): string | null {
  const { proposed, previous, marketPrice, role, side, tickSize } = input;
  if (proposed === previous) return null;
  if (!Number.isFinite(proposed) || proposed < 0) return 'Enter a valid protection price, or zero to remove it.';
  const point = input.point && input.point > 0 ? input.point : tickSize;
  const stopPoints = Number(input.stopsLevel);
  const freezePoints = Number(input.freezeLevel);
  const hasFreeze = Number.isFinite(freezePoints) && freezePoints > 0;
  if (!(marketPrice > 0) || (proposed > 0 && !(tickSize > 0)) || (hasFreeze && !(point > 0))) {
    return 'A broker tick size and live liquidation quote are required.';
  }
  const freeze = hasFreeze ? freezePoints * point : 0;
  if (previous > 0 && freeze > 0 && Math.abs(previous - marketPrice) <= freeze + tickSize * 1e-7) {
    return 'This level is inside the broker freeze distance and cannot be changed or removed.';
  }
  if (proposed === 0) return null;
  if (Math.abs(proposed / tickSize - Math.round(proposed / tickSize)) > 1e-6) return 'The protection price must match the broker tick size.';
  // Validate against Bid/Ask, not the executed entry: profitable trailing SLs are valid.
  const direction = (side === 'buy' ? 1 : -1) * (role === 'tp' ? 1 : -1);
  const distance = direction * (proposed - marketPrice);
  if (!(distance > tickSize * 1e-7)) return `${role.toUpperCase()} is on the wrong side of the current ${side === 'buy' ? 'Bid' : 'Ask'}.`;
  const stop = Number.isFinite(stopPoints) && stopPoints > 0 ? stopPoints * point : 0;
  if (distance + tickSize * 1e-7 < Math.max(stop, freeze)) return 'The protection price is inside the broker stop/freeze distance.';
  return null;
}
