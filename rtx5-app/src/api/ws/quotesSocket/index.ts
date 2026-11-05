/**
 * Public entry for the quote WebSocket service.
 *
 * The original `quotesSocket.ts` was split for the 500-line ceiling:
 *   - `types.ts`                    — listener type aliases
 *   - `tickProcessor.ts`            — payload demux + per-tick normalization
 *   - `flushPipeline.ts`            — rAF/setTimeout flush into Zustand
 *   - `QuotesWebSocketService.ts`   — connection/subscription state machine
 *
 * Imports of `../api/ws/quotesSocket` resolve here, preserving the existing
 * `quotesWsService` singleton and `QuoteTickEvent` re-export.
 */
export { QuotesWebSocketService } from './QuotesWebSocketService';
export type { QuoteTickEvent } from '../quoteTickNormalizer';

import { QuotesWebSocketService } from './QuotesWebSocketService';

type GlobalQuotesWebSocketRegistry = typeof globalThis & {
  __RTX5_QUOTES_WS_SERVICE__?: QuotesWebSocketService;
};

const quotesWebSocketRegistry = globalThis as GlobalQuotesWebSocketRegistry;

export const quotesWsService =
  quotesWebSocketRegistry.__RTX5_QUOTES_WS_SERVICE__ ??
  (quotesWebSocketRegistry.__RTX5_QUOTES_WS_SERVICE__ = QuotesWebSocketService.getInstance());
