export const TRADE_SIDE = {
  buy: 'buy',
  sell: 'sell',
} as const;

export type TradeSide = (typeof TRADE_SIDE)[keyof typeof TRADE_SIDE];

export const TRADE_SIDE_VALUES: readonly TradeSide[] = [TRADE_SIDE.buy, TRADE_SIDE.sell];

export function isTradeSide(value: unknown): value is TradeSide {
  return value === TRADE_SIDE.buy || value === TRADE_SIDE.sell;
}

export function normalizeTradeSide(value: unknown): TradeSide | null {
  const normalized =
    typeof value === 'string'
      ? value.trim().toLowerCase()
      : value;

  return isTradeSide(normalized) ? normalized : null;
}

export function assertTradeSide(value: unknown): TradeSide {
  const side = normalizeTradeSide(value);
  if (side) {
    return side;
  }

  throw new Error(`Invalid trade side: ${String(value)}`);
}
