import { normalizeSymbol } from '../domain/symbols';
import { useTradingState } from '../state/tradingState';
import type { ExecutableQuoteInput } from './quoteIntegrity';

type ExecutionQuoteReader = (
  namespace: string,
  symbol: string,
) => ExecutableQuoteInput | undefined;

let liveReader: ExecutionQuoteReader | undefined;

/** Connect the UI's synchronous, session-scoped cache without importing UI into the API. */
export function registerExecutionQuoteReader(reader: ExecutionQuoteReader): () => void {
  liveReader = reader;
  return () => {
    if (liveReader === reader) liveReader = undefined;
  };
}

export function readExecutionQuote(namespace: string, symbol: string): ExecutableQuoteInput | undefined {
  // An installed live reader is authoritative, including unavailable results.
  // Falling back to a fresh-looking batched value would bypass invalidation.
  if (liveReader) return liveReader(namespace, symbol);
  return useTradingState.getState().quotes[normalizeSymbol(symbol)];
}
