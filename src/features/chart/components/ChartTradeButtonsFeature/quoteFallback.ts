const toPositiveFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return value;
};

export type ChartTradeButtonQuoteInput = {
  liveBid?: unknown;
  liveAsk?: unknown;
  fallbackBid?: unknown;
  fallbackAsk?: unknown;
};

/**
 * Prices eligible for one-click SL/TP validation and execution context.
 * Live websocket bid/ask only — never candle/snapshot fallbacks.
 */
export function resolveChartTradeButtonQuote(
  input?: ChartTradeButtonQuoteInput | null,
): { bid: number; ask: number } {
  // Guard null/undefined so a missing live quote never crashes the chart tree
  // (object destructure of undefined was the OTA ErrorBoundary failure).
  const liveBid = input?.liveBid;
  const liveAsk = input?.liveAsk;
  return {
    bid: toPositiveFiniteNumber(liveBid) ?? 0,
    ask: toPositiveFiniteNumber(liveAsk) ?? 0,
  };
}

/**
 * Prices shown on the Buy/Sell tiles. Prefer live ticks; fall back to the
 * chart's last known bid/ask so the tiles stay bright instead of "---" while
 * the quote integrity gate is still warming. Execution remains fail-closed
 * via resolveSessionQuoteActionAvailability in the trade handler.
 */
export function resolveChartTradeButtonDisplayQuote(
  input?: ChartTradeButtonQuoteInput | null,
): { bid: number; ask: number } {
  const liveBid = input?.liveBid;
  const liveAsk = input?.liveAsk;
  const fallbackBid = input?.fallbackBid;
  const fallbackAsk = input?.fallbackAsk;
  return {
    bid: toPositiveFiniteNumber(liveBid) ?? toPositiveFiniteNumber(fallbackBid) ?? 0,
    ask: toPositiveFiniteNumber(liveAsk) ?? toPositiveFiniteNumber(fallbackAsk) ?? 0,
  };
}
