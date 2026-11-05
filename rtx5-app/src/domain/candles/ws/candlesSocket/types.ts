import type { Candle } from '../../../../state/tradingState';

/** Callback triggered when only the most recent candle in a series changes (tick update). */
export type TickListener = (symbol: string, tf: string, mutatedCandles: Candle[]) => void;
/** Callback triggered when the entire series array updates or a new candle is appended. */
export type ArrayListener = (symbol: string, tf: string, allCandles: Candle[]) => void;

import type { CandleStreamEvent } from '../../core/candles';
/** Callback triggered for granular, event-based updates on the stream (append, replace, sync). */
export type StreamListener = (event: CandleStreamEvent) => void;

/** Internal tracking metadata for an active WebSocket stream subscription. */
export type SubscriptionState = {
  key: string;
  symbol: string;
  tf: string;
  consumerCount: number;
  candles: Candle[];
  engineUnsubscribe: (() => void) | null;
};
