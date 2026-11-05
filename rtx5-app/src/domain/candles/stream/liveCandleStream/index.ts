/**
 * Public entry point for the live candle stream.
 *
 * This module preserves the original `liveCandleStream.ts` import path so
 * downstream consumers (`../stream/liveCandleStream`) keep resolving here
 * unchanged. The implementation has been split into:
 *   - `types.ts`          — type defs and constants
 *   - `helpers.ts`        — pure helpers (logging, snapshot, equality)
 *   - `historyFetching.ts` — REST loadHistory / prefetchHistory bodies
 *   - `manager.ts`        — `LiveCandleStreamManager` class
 *
 * The hot-reload-resistant singleton is created here so it survives Metro
 * fast-refresh cycles.
 */
import { LiveCandleStreamManager } from './manager';

export { LiveCandleStreamManager } from './manager';
export {
  EMPTY_CANDLES,
  DEFAULT_HISTORY_LIMIT,
  CLOSED_MARKET_HISTORY_WARM_LIMIT,
  INITIAL_HISTORY_LIMIT,
  MAX_BUFFERED_LIVE_EVENTS,
  FLUSH_INTERVAL_MS,
} from './types';
export type {
  CandleParams,
  StreamListener,
  BufferedLiveEvent,
  UnorderedLiveEvent,
  StreamEntry,
  CandleHistorySnapshot,
  HistorySeedSnapshot,
} from './types';

type GlobalLiveCandleStreamRegistry = typeof globalThis & {
  __RTX5_LIVE_CANDLE_STREAM__?: LiveCandleStreamManager;
};

const liveCandleStreamRegistry = globalThis as GlobalLiveCandleStreamRegistry;

export const liveCandleStream =
  liveCandleStreamRegistry.__RTX5_LIVE_CANDLE_STREAM__ ??
  (liveCandleStreamRegistry.__RTX5_LIVE_CANDLE_STREAM__ = new LiveCandleStreamManager());
