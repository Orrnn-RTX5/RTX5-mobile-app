/**
 * Public entry point for the candle WebSocket service.
 *
 * The original `candlesSocket.ts` was split for the 500-line ceiling:
 *   - `types.ts`                     — listener / subscription type aliases
 *   - `authToken.ts`                 — token reader + subscription key helper
 *   - `CandlesWebSocketService.ts`   — service class
 *
 * Imports of `../ws/candlesSocket` resolve to this file, preserving the
 * existing public surface (`candlesWsService`, `CandlesWebSocketService`).
 */
export { CandlesWebSocketService } from './CandlesWebSocketService';
export type { TickListener, ArrayListener, StreamListener, SubscriptionState } from './types';

import { CandlesWebSocketService } from './CandlesWebSocketService';

export const candlesWsService = CandlesWebSocketService.getInstance();
