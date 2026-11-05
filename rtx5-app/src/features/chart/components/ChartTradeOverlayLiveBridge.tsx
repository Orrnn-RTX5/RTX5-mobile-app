import React, { useLayoutEffect } from 'react';
import type { QuoteItem } from '../../../domain/tradingModels';
import { hasLiveQuoteFeedData, useLiveSymbolQuote } from '../../../query/websocket';
import { usePositionsState } from '../../../state/positionsState';

export type ChartTradeOverlayLiveQuote = Partial<QuoteItem>;

type ChartTradeOverlayLiveBridgeProps = {
  active: boolean;
  symbol: string;
  onQuote: (quote: ChartTradeOverlayLiveQuote) => void;
};

/**
 * Tiny tick-owned bridge for open-position labels. It deliberately renders no
 * UI, so each quote or backend position P/L update can refresh the WebView
 * label without waking ChartScreen.
 */
export const ChartTradeOverlayLiveBridge = React.memo(
  function ChartTradeOverlayLiveBridge({
    active,
    symbol,
    onQuote,
  }: ChartTradeOverlayLiveBridgeProps) {
    const liveQuote = useLiveSymbolQuote(symbol, active, 0);
    // Track backend-streamed position P/L updates for the active symbol so the
    // chart trade line reflects backend P/L immediately without frontend math.
    const backendPnlSignature = usePositionsState((state) => {
      if (!active) return '';
      const target = symbol.trim().toUpperCase();
      let sig = '';
      for (let i = 0; i < state.positions.length; i += 1) {
        const pos = state.positions[i];
        if (pos.symbol.trim().toUpperCase() === target) {
          sig += `${pos.id}:${pos.pnl};`;
        }
      }
      return sig;
    });

    useLayoutEffect(() => {
      if (!active) {
        return;
      }
      const hasUsableBid =
        typeof liveQuote?.bid === 'number' &&
        Number.isFinite(liveQuote.bid) &&
        liveQuote.bid > 0;
      const hasUsableAsk =
        typeof liveQuote?.ask === 'number' &&
        Number.isFinite(liveQuote.ask) &&
        liveQuote.ask > 0;
      if (
        liveQuote &&
        hasLiveQuoteFeedData(liveQuote) &&
        (hasUsableBid || hasUsableAsk)
      ) {
        onQuote(liveQuote);
      } else if (backendPnlSignature) {
        onQuote(liveQuote ?? {});
      }
    }, [active, backendPnlSignature, liveQuote, onQuote]);

    return null;
  },
);
