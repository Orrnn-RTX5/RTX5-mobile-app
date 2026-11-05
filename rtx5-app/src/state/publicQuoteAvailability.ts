/** Invalidation carries no synthetic price and is scoped to the current guest context. */
const listeners = new Set<(symbol: string) => void>();
export const invalidatePublicQuote = (symbol: string) => listeners.forEach(listener => listener(symbol));
export const subscribePublicQuoteInvalidation = (listener: (symbol: string) => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
