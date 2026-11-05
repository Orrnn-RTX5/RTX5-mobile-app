// Keep the first screenful live before FlatList delivers its first viewability
// event. Rows retained further offscreen read the current scoped cache when
// they become visible, without consuming React updates for every feed tick.
export const QUOTE_INITIAL_LIVE_ROW_COUNT = 8;

export const isQuoteRowLive = (
  feedActive: boolean,
  symbol: string,
  index: number,
  visibleSymbols: ReadonlySet<string>,
): boolean => feedActive && (
  index < QUOTE_INITIAL_LIVE_ROW_COUNT || visibleSymbols.has(symbol)
);

export const reconcileVisibleQuoteSymbols = (
  previous: ReadonlySet<string>,
  symbols: readonly string[],
): ReadonlySet<string> => {
  const next = new Set(symbols);
  if (previous.size === next.size && [...next].every((symbol) => previous.has(symbol))) {
    return previous;
  }
  return next;
};
