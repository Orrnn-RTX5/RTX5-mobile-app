import React, { useLayoutEffect } from 'react';
import type { QuoteItem } from '../../../dev/mock/tradingData';
import { hasLiveQuoteFeedData, useLiveSymbolQuote } from '../../../query/websocket';

export type ChartTradeOverlayLiveQuote = Partial<QuoteItem>;

type ChartTradeOverlayLiveBridgeProps = {
  active: boolean;
  symbol: string;
  onQuote: (quote: ChartTradeOverlayLiveQuote) => void;
};

/**
 * Tiny tick-owned bridge for open-position labels. It deliberately renders no
 * UI, so each quote can update the WebView label without waking ChartScreen.
 */
export const ChartTradeOverlayLiveBridge = React.memo(
  function ChartTradeOverlayLiveBridge({
    active,
    symbol,
    onQuote,
  }: ChartTradeOverlayLiveBridgeProps) {
    const liveQuote = useLiveSymbolQuote(symbol, active, 0);

    useLayoutEffect(() => {
      const hasUsableBid =
        typeof liveQuote?.bid === 'number' &&
        Number.isFinite(liveQuote.bid) &&
        liveQuote.bid > 0;
      const hasUsableAsk =
        typeof liveQuote?.ask === 'number' &&
        Number.isFinite(liveQuote.ask) &&
        liveQuote.ask > 0;
      if (
        !active ||
        !liveQuote ||
        !hasLiveQuoteFeedData(liveQuote) ||
        (!hasUsableBid && !hasUsableAsk)
      ) {
        return;
      }

      onQuote(liveQuote);
    }, [active, liveQuote, onQuote]);

    return null;
  },
);
