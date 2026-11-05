import {
  DEFAULT_RENKO_ATR_PERIOD,
  resolveRenkoBrickSizeDetails,
  type RenkoSourceCandle,
} from '../../domain/candles/renko';

const MAX_STABLE_RENKO_SIZE_ENTRIES = 64;
// Intentionally runtime-only: restart recomputes the derived ATR grid from
// canonical candles instead of persisting potentially stale synthetic state.
const stableRenkoBrickSizes = new Map<string, number>();

type ResolveStableRenkoBrickSizeInput = Readonly<{
  scopeKey: string;
  symbol: string;
  timeframe: string;
  displayDecimals: number;
  minimumPriceIncrement: number;
  candles: readonly RenkoSourceCandle[];
}>;

const buildStableRenkoBrickSizeKey = ({
  scopeKey,
  symbol,
  timeframe,
  displayDecimals,
  minimumPriceIncrement,
}: Omit<ResolveStableRenkoBrickSizeInput, 'candles'>): string => [
  // Broker/session scope prevents one account's price grid from leaking into
  // another account that happens to expose the same symbol name.
  scopeKey || 'no-session',
  symbol.trim().toUpperCase(),
  timeframe.trim().toUpperCase(),
  displayDecimals,
  minimumPriceIncrement,
].join(':');

/**
 * Shares one session-scoped ATR grid across the main chart and every preview.
 * Flat/short fallback sizes are deliberately not retained: the first real
 * completed range must be allowed to replace them when trading resumes.
 */
export const resolveStableRenkoBrickSize = (
  input: ResolveStableRenkoBrickSizeInput,
): number => {
  const key = buildStableRenkoBrickSizeKey(input);
  const cached = stableRenkoBrickSizes.get(key);
  if (typeof cached === 'number' && Number.isFinite(cached) && cached > 0) {
    // Promote the entry so the bounded map behaves as a tiny LRU cache.
    stableRenkoBrickSizes.delete(key);
    stableRenkoBrickSizes.set(key, cached);
    return cached;
  }

  const resolution = resolveRenkoBrickSizeDetails(input.candles, {
    minimumPriceIncrement: input.minimumPriceIncrement,
  });
  if (
    input.candles.length > DEFAULT_RENKO_ATR_PERIOD
    && resolution.source === 'atr'
    && Number.isFinite(resolution.brickSize)
    && resolution.brickSize > 0
  ) {
    stableRenkoBrickSizes.set(key, resolution.brickSize);
    while (stableRenkoBrickSizes.size > MAX_STABLE_RENKO_SIZE_ENTRIES) {
      const oldestKey = stableRenkoBrickSizes.keys().next().value;
      if (typeof oldestKey !== 'string') break;
      stableRenkoBrickSizes.delete(oldestKey);
    }
  }
  return resolution.brickSize;
};
