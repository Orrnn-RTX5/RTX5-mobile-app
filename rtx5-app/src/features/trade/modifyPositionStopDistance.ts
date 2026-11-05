/**
 * Frontend-only advisory rules for existing-position SL/TP.
 *
 * The current gateway does not expose authoritative point, stops-level, or
 * freeze-level constraints. The app therefore checks only the executable side
 * and snaps to a positive broker-provided tick size. The backend remains the
 * authority for every trading rule.
 */

export type StopTargetKind = 'sl' | 'tp';
export type TradeSide = 'buy' | 'sell';

/**
 * Buy SL / sell TP must stay below the closing price; buy TP / sell SL above.
 */
export function isStopTargetOnCorrectSide(
  kind: StopTargetKind,
  side: TradeSide,
  target: number,
  marketPrice: number,
): boolean {
  if (
    !(Number.isFinite(target) && target > 0) ||
    !(Number.isFinite(marketPrice) && marketPrice > 0)
  ) {
    return false;
  }
  const mustStayBelow = (side === 'buy') === (kind === 'sl');
  return mustStayBelow ? target < marketPrice : target > marketPrice;
}

export function resolveStopTargetPresetDirection(
  kind: StopTargetKind,
  side: TradeSide,
): -1 | 1 {
  const mustStayBelow = (side === 'buy') === (kind === 'sl');
  return mustStayBelow ? -1 : 1;
}

/**
 * Resolves a quick preset as an absolute distance from the current executable
 * price. Presets must not inherit or accumulate an existing draft target.
 */
export function resolveStopTargetPresetPrice(
  kind: StopTargetKind,
  side: TradeSide,
  marketPrice: number,
  pipSize: number,
  presetPips: number,
): number {
  if (!(Number.isFinite(marketPrice) && marketPrice > 0)) {
    throw new TypeError('A positive live market price is required for an SL/TP preset.');
  }
  if (!(Number.isFinite(pipSize) && pipSize > 0)) {
    throw new TypeError('A positive pip size is required for an SL/TP preset.');
  }
  if (!(Number.isFinite(presetPips) && presetPips > 0)) {
    throw new TypeError('SL/TP preset pips must be a positive number.');
  }
  return marketPrice + (
    resolveStopTargetPresetDirection(kind, side) * pipSize * presetPips
  );
}

/**
 * Deterministically snaps a set value without changing a literal clear.
 * Invalid metadata is rejected instead of being replaced by an invented point.
 */
export function snapStopTargetToTickSize(
  value: number,
  tickSize: number,
  digits: number,
): number {
  if (value === 0) return 0;
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError('SL/TP value must be a finite non-negative number.');
  }
  if (!Number.isFinite(tickSize) || tickSize <= 0) {
    throw new TypeError('A positive broker tick size is required to snap SL/TP.');
  }
  const safeDigits = Number.isInteger(digits)
    ? Math.max(0, Math.min(12, digits))
    : 8;
  return Number((Math.round(value / tickSize) * tickSize).toFixed(safeDigits));
}
