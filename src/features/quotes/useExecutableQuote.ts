import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import {
  getFeedHealthRenderSnapshot,
  subscribeFeedHealth,
} from '../../market/feedHealthRuntime';
import {
  resolveSessionQuoteActionAvailability,
  type ExecutableQuoteInput,
  type QuoteActionAvailability,
} from '../../market/quoteIntegrity';
import {
  getCurrentLiveQuoteSnapshot,
  useLiveQuoteSnapshot,
  useLiveQuoteSubscription,
} from './useLiveQuotes';
import type { LiveQuoteSnapshot } from './liveQuoteSnapshot';

const toPositivePrice = (value: unknown): number | undefined => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

/**
 * Normalize a live snapshot into the shape the execution gate expects.
 * Used by Close Position, SL/TP modify, bulk close, etc. so they all share
 * the same bid/ask + receipt-time treatment as Order Ticket.
 */
export function toExecutableQuoteInput(
  quote: LiveQuoteSnapshot | null | undefined,
): ExecutableQuoteInput | null {
  if (!quote) return null;

  const bid = toPositivePrice(quote.bid);
  const ask = toPositivePrice(quote.ask);
  if (bid === undefined || ask === undefined) {
    return {
      ...quote,
      transport: quote.transport,
    };
  }

  return {
    ...quote,
    bid,
    ask,
    lastReceivedAt: quote.lastReceivedAt ?? quote.lastTickAt,
    feedTickAt: quote.feedTickAt,
    // Live subscription path stamps websocket ticks; never promote REST.
    transport: quote.transport === 'rest_snapshot' ? 'rest_snapshot' : quote.transport ?? 'websocket',
  };
}

/**
 * Shared fail-closed quote gate for any control that can change an order or
 * position at a market-dependent price (Close, SL/TP modify, bulk close, …).
 * The health subscription and one-second clock make controls disable as
 * status/freshness changes even without a tick.
 */
export function useExecutableQuote(
  symbol: string,
  active = true,
  renderIntervalMs = 0,
) {
  useLiveQuoteSubscription(symbol, active);
  const quote = useLiveQuoteSnapshot(symbol, active, renderIntervalMs);
  // Render snapshot: stable identity between notifications (uSES contract).
  // Availability below still reads the always-fresh state internally.
  const health = useSyncExternalStore(
    subscribeFeedHealth,
    getFeedHealthRenderSnapshot,
    getFeedHealthRenderSnapshot,
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [active]);

  const executableQuote = useMemo(() => toExecutableQuoteInput(quote), [quote]);

  const availability = useMemo<QuoteActionAvailability>(
    () => resolveSessionQuoteActionAvailability(executableQuote, now),
    [health, now, executableQuote],
  );
  const getCurrentExecutableQuoteState = useCallback(
    () => {
      const latestQuote = active
        ? getCurrentLiveQuoteSnapshot(symbol)
        : quote;
      return {
        quote: latestQuote,
        availability: resolveSessionQuoteActionAvailability(
          toExecutableQuoteInput(latestQuote),
          Date.now(),
        ),
      } as const;
    },
    [active, quote, symbol],
  );
  const getCurrentAvailability = useCallback(
    () => getCurrentExecutableQuoteState().availability,
    [getCurrentExecutableQuoteState],
  );

  return {
    quote,
    availability,
    getCurrentAvailability,
    getCurrentExecutableQuoteState,
  } as const;
}
