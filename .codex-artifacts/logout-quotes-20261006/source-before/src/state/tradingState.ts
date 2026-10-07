/**
 * Core module: tradingState.ts
 */

import { create } from 'zustand';
import type { QuoteItem } from '../dev/mock/tradingData';
import type { Candle } from '../domain/candles/core/candleTypes';
import {
  MAX_CANDLE_CACHE_ENTRIES,
  MAX_CANDLE_SERIES_LENGTH,
} from '../domain/candles/core/candles';
import { normalizeSymbol, normalizeTimeframeStrict, normalizeTimestampToMs } from '../domain/candles/core/timeframeUtils';
import { sanitizeCandlesForChart } from '../domain/candles/normalization/chartAdapter';
import { hasQuotePriceChange } from '../utils/quotePriceChange';
import { calculateQuoteSpreadPoints, resolveQuoteDisplayDigits } from '../utils/quoteSpread';
import { resolveBackendQuoteVolume } from '../utils/quoteVolume';

const trimCandleCacheEntries = (
  entries: Record<string, Candle[]>,
  activeKey: string,
): Record<string, Candle[]> => {
  const activeEntry = entries[activeKey];
  if (!activeEntry || Object.keys(entries).length <= MAX_CANDLE_CACHE_ENTRIES) {
    return entries;
  }

  const olderEntries = Object.entries(entries).filter(([key]) => key !== activeKey);
  const keepOlderEntries = olderEntries.slice(
    Math.max(0, olderEntries.length - (MAX_CANDLE_CACHE_ENTRIES - 1)),
  );

  return Object.fromEntries([...keepOlderEntries, [activeKey, activeEntry]]);
};


/** Represents a single financial timeframe segment (a candlestick). */
export type { Candle };

/** High-level overview of the trading account's equity and margin usage. */
export type AccountSummary = {
  /** Unrealized profit or loss across all open positions */
  floating: number;
  /** Base currency code for the account (e.g., 'USD', 'EUR') */
  currency: string;
  /** Settled cash balance excluding open positions */
  balance: number;
  /** Total value of the account (balance + floating PnL) */
  equity: number;
  /** Margin funds locked by open positions */
  margin: number;
  /** Available margin funds for opening new positions */
  freeMargin: number;
  /** Margin health indicator (equity / margin * 100) */
  marginLevel: number;
  /** Optional credit or bonus funds provided by the broker */
  credit?: number;
};

/**
 * Global Zustand store managing real-time market data (quotes and candles) 
 * and generic account summaries.
 */
type TradingState = {
  /** Dictionary of live quotes keyed by symbol (e.g., 'EURUSD') */
  quotes: Record<string, QuoteItem>;
  /** Primitive counter — increments on every live tick for reliable React 19 re-renders */
  tickCount: number; 
  /** Current account summary snapshot */
  account: AccountSummary | null;
  /**
   * Canonical chart-visible candle cache keyed by "Symbol.Timeframe" e.g. "EURUSD.H1".
   * This must remain the healed/merged series the chart can safely render on remount,
   * not a raw REST-history-only buffer.
   */
  candles: Record<string, Candle[]>; 

  /** Updates or merges quote data for a specific symbol */
  setQuote: (symbol: string, data: Partial<QuoteItem>) => void;
  /** Updates the overall account summary */
  setAccount: (data: Partial<AccountSummary>) => void;
  /**
   * Low-level cache write for canonical candle series only.
   * Raw history snapshots should be routed through `state/candleCache.ts`.
   */
  setCandleHistory: (symbol: string, timeframe: string, history: Candle[]) => void;
  /** Clears quote-only state when the credential/feed generation rotates. */
  resetQuoteMarketData: () => void;
  /** Atomically clears every account/session-scoped market-data value. */
  resetSessionMarketData: () => void;
};


export const useTradingState = create<TradingState>((set) => ({
  quotes: {},
  tickCount: 0,
  account: null,
  candles: {},

  setQuote: (symbol, data) =>
    set((state) => {
      const normalizedSymbol = normalizeSymbol(symbol);
      if (!normalizedSymbol) {
        return state;
      }

      const existing = state.quotes[normalizedSymbol];
      const feedTickAt = normalizeTimestampToMs(
        data.feedTickAt ?? data.lastTickAt ?? (data as Record<string, unknown>).timestamp ?? (data as Record<string, unknown>).time ?? (data as Record<string, unknown>).t,
      );
      const lastReceivedAt =
        normalizeTimestampToMs(data.lastReceivedAt ?? (data as Record<string, unknown>).receivedAt) ??
        (Number.isFinite(data.bid) && Number.isFinite(data.ask) ? Date.now() : existing?.lastReceivedAt);
      const priceChanged = hasQuotePriceChange(existing, data);
      const lastPriceChangedAt = priceChanged
        ? lastReceivedAt
        : existing?.lastPriceChangedAt;

      if (!existing) {
        const bid = Number(data.bid);
        const ask = Number(data.ask);
        // Volume/metadata repairs must never manufacture a price-less quote.
        if (!Number.isFinite(bid) || bid <= 0 || !Number.isFinite(ask) || ask < bid) {
          return state;
        }

        const digits = resolveQuoteDisplayDigits(normalizedSymbol, bid, data.digits, data.point);
        const volume = resolveBackendQuoteVolume({ incoming: data.volume });
        const lastTickAt =
          feedTickAt ??
          (Number.isFinite(data.bid) && Number.isFinite(data.ask) ? Date.now() : undefined);
        const newQuote = {
          ...data,
          symbol: normalizedSymbol,
          ...(digits === undefined ? {} : { digits }),
          feedTickAt: feedTickAt ?? undefined,
          lastTickAt,
          lastReceivedAt,
          lastPriceChangedAt,
        } as QuoteItem;

        // Do not seed live quote volume from static specs; volume is meaningful
        // only when the backend sends it for this quote stream.
        if (volume === undefined) {
          delete newQuote.volume;
          delete newQuote.volumeSource;
        } else {
          newQuote.volume = volume;
          newQuote.volumeSource = 'backend';
        }
        
        const spread = calculateQuoteSpreadPoints(newQuote.bid, newQuote.ask, digits);
        if (spread !== undefined) {
          newQuote.spread = spread;
        }

        return {
          quotes: {
            ...state.quotes,
            [normalizedSymbol]: newQuote,
          },
          tickCount: state.tickCount + (priceChanged ? 1 : 0),
        };
      }
      
      // Because they send identical bids/asks over WS often without changing ticks, compute delta:
      const incomingBid = data.bid;
      const incomingAsk = data.ask;
      
      const prevBidState = Number.isFinite(incomingBid) && incomingBid !== existing.bid ? existing.bid : existing.prevBid;
      const prevAskState = Number.isFinite(incomingAsk) && incomingAsk !== existing.ask ? existing.ask : existing.prevAsk;

      const digits = resolveQuoteDisplayDigits(
        normalizedSymbol,
        data.bid ?? existing.bid,
        data.digits ?? existing.digits,
        data.point ?? existing.point,
      );
      const volume = resolveBackendQuoteVolume({ incoming: data.volume, previous: existing });
      const lastTickAt =
        feedTickAt ??
        (Number.isFinite(data.bid) && Number.isFinite(data.ask) ? Date.now() : existing.lastTickAt);
      const spread =
        calculateQuoteSpreadPoints(data.bid ?? existing.bid, data.ask ?? existing.ask, digits) ??
        existing.spread;
      const updatedQuote = {
        ...existing,
        ...data,
        symbol: normalizedSymbol,
        ...(digits === undefined ? {} : { digits }),
        feedTickAt: feedTickAt ?? undefined,
        lastTickAt,
        lastReceivedAt,
        lastPriceChangedAt,
        spread,
        // Track previous prices
        prevBid: prevBidState,
        prevAsk: prevAskState,
      } as QuoteItem;

      // Keep an old backend volume if the next tick omits it, but remove any
      // value that came from static/default data.
      if (volume === undefined) {
        delete updatedQuote.volume;
        delete updatedQuote.volumeSource;
      } else {
        updatedQuote.volume = volume;
        updatedQuote.volumeSource = 'backend';
      }

      return {
        quotes: {
          ...state.quotes,
          [normalizedSymbol]: updatedQuote,
        },
        tickCount: state.tickCount + (priceChanged ? 1 : 0),
      };
    }),

  setAccount: (data) =>
    set((state) => ({
      account: state.account ? { ...state.account, ...data } : (data as AccountSummary),
    })),

  setCandleHistory: (symbol, timeframe, history) =>
    set((state) => {
      const normalizedSymbol = normalizeSymbol(symbol);
      const normalizedTimeframe = normalizeTimeframeStrict(timeframe);
      if (!normalizedSymbol || !normalizedTimeframe) {
        return state;
      }
      const key = `${normalizedSymbol}.${normalizedTimeframe}`;
      const normalizedHistory = sanitizeCandlesForChart(history).slice(-MAX_CANDLE_SERIES_LENGTH);
      const nextCandles: Record<string, Candle[]> = {
        ...Object.fromEntries(Object.entries(state.candles).filter(([entryKey]) => entryKey !== key)),
        [key]: normalizedHistory,
      };

      return {
        candles: trimCandleCacheEntries(nextCandles, key),
      };
    }),

  resetQuoteMarketData: () =>
    set({
      quotes: {},
      tickCount: 0,
    }),

  resetSessionMarketData: () =>
    set({
      quotes: {},
      candles: {},
      account: null,
      tickCount: 0,
    }),

}));

/** Public coordinator seam for atomic logout/account-switch teardown. */
export const resetSessionMarketData = (): void => {
  useTradingState.getState().resetSessionMarketData();
};

/** Public seam for invalidating old-generation quotes without clearing account/candles. */
export const resetQuoteMarketData = (): void => {
  useTradingState.getState().resetQuoteMarketData();
};
