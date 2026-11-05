export type Timeframe =
  | 'M1'
  | 'M5'
  | 'M15'
  | 'M30'
  | 'H1'
  | 'H4'
  | 'D1'
  | 'W1'
  | 'MN';

/**
 * Canonical frontend candle shape.
 *
 * `time` is always Unix seconds at the candle bucket start. Backend payloads
 * may arrive in seconds, milliseconds, microseconds, nanoseconds, or ISO date
 * strings, but they are normalized before entering the chart pipeline.
 */
export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type MutableCandle = Candle & {
  firstUpdateTime?: number;
  lastUpdateTime?: number;
  lastBackendUpdateTime?: number;
  lastQuoteTime?: number;
  source?: 'history' | 'live_candle';
  closed?: boolean;
};

export type LiveCandle = Candle & {
  symbol?: string;
  timeframe?: string;
  updateTime?: number;
  closed?: boolean;
};

export type RawCandle = Record<string, unknown>;

export type CandleStreamKey = `${string}:${Timeframe}`;

export type CandleStreamState = {
  symbol: string;
  timeframe: Timeframe;
  streamKey: CandleStreamKey;
  requestId: number;
  candles: Candle[];
  loading: boolean;
  error: string | null;
  isLiveConnected: boolean;
  lastUpdateTime: number | null;
  seededFromCache: boolean;
};
