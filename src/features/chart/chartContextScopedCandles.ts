import type { Candle } from '../../domain/candles/core/candleTypes';

export type ContextScopedChartCandles = Readonly<{
  contextKey: string;
  candles: readonly Candle[];
}>;

/**
 * A retained chart surface may outlive several symbol/timeframe selections.
 * Only reuse its fallback candles when they were captured for the exact active
 * market-data context; otherwise the new context must begin empty.
 */
export const resolveContextScopedChartCandles = (
  activeContextKey: string,
  canonicalCandles: readonly Candle[],
  retained: ContextScopedChartCandles,
): readonly Candle[] => {
  if (canonicalCandles.length > 0) {
    return canonicalCandles;
  }

  return retained.contextKey === activeContextKey ? retained.candles : [];
};
