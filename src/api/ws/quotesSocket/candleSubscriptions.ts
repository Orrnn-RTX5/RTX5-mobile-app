import {
  normalizeSymbol,
  normalizeTimeframeStrict,
  toBridgeCandleTf,
  type BridgeCandleTimeframe,
} from '../../../domain/candles/core/candles';
import type { Timeframe } from '../../../domain/candles/core/candleTypes';

export type CandleFeedSubscription = {
  key: string;
  symbol: string;
  tf: Timeframe;
  bridgeTf: BridgeCandleTimeframe;
};

export type CandleChannelSubscriptionMessageType = 'subscribe' | 'unsubscribe';

/**
 * `/ws/feed` live-candle request. One message per symbol/timeframe:
 * `{"type":"subscribe_candles","symbol":"EURUSD","tf":"1m"}`. The server acks
 * with `{"type":"subscribed_candles","symbols":["EURUSD"],"tf":"1m"}` and then
 * streams `{"type":"candle",...}` frames on the same socket.
 */
export type FeedCandleSubscriptionMessage = {
  type: 'subscribe_candles' | 'unsubscribe_candles';
  symbol: string;
  tf: BridgeCandleTimeframe;
};

export const createCandleFeedSubscriptionKey = (symbol: string, tf: string): string =>
  `${symbol}::${tf}`;

export const createCandleFeedSubscription = (
  symbol: string,
  tf: string,
): CandleFeedSubscription | null => {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedTimeframe = normalizeTimeframeStrict(tf);
  const bridgeTf = toBridgeCandleTf(normalizedTimeframe);
  if (!normalizedSymbol || !normalizedTimeframe || !bridgeTf) {
    return null;
  }

  return {
    key: createCandleFeedSubscriptionKey(normalizedSymbol, normalizedTimeframe),
    symbol: normalizedSymbol,
    tf: normalizedTimeframe,
    bridgeTf,
  };
};

export const buildFeedCandleSubscriptionMessages = (
  action: CandleChannelSubscriptionMessageType,
  subscriptions: Iterable<CandleFeedSubscription>,
): FeedCandleSubscriptionMessage[] => {
  const seen = new Set<string>();
  const messages: FeedCandleSubscriptionMessage[] = [];
  for (const subscription of subscriptions) {
    const dedupeKey = `${subscription.symbol}::${subscription.bridgeTf}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    messages.push({
      type: action === 'subscribe' ? 'subscribe_candles' : 'unsubscribe_candles',
      symbol: subscription.symbol,
      tf: subscription.bridgeTf,
    });
  }
  return messages;
};
