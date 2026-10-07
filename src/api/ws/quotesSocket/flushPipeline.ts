/**
 * Pending-tick flush pipeline.
 *
 * Quote ticks are coalesced to the next frame so React isn't asked to re-render
 * once per WS message. The broker can deliver bursts that are faster than a
 * mobile chart can paint; keeping only the latest per-symbol snapshot per
 * frame preserves the current price while leaving touch/navigation work room
 * on the JS thread.
 *
 * Extracted from `QuotesWebSocketService` so the service stays under the
 * 500-line ceiling.
 */
import { useTradingState } from '../../../state/tradingState';
import { hasQuotePriceChange } from '../../../utils/quotePriceChange';
import { calculateQuoteSpreadPoints, resolveQuoteDisplayDigits } from '../../../utils/quoteSpread';
import { resolveBackendQuoteVolume } from '../../../utils/quoteVolume';
import { normalizeQuoteTickTimestampToMs } from '../quoteTimestamp';

const QUOTE_STORE_FLUSH_INTERVAL_MS = 16;
const QUOTE_STORE_FLUSH_FALLBACK_MS = 100;

export interface FlushPipelineState {
  flushScheduled: boolean;
  flushAnimationFrame: number | null;
  flushTimer: ReturnType<typeof setTimeout> | null;
  pendingUpdates: Map<string, any>;
  canCommitPendingUpdates?: () => boolean;
  flushGeneration?: number;
}

export const scheduleFlush = (state: FlushPipelineState): void => {
  if (state.flushScheduled) {
    return;
  }

  state.flushScheduled = true;
  const generation = state.flushGeneration = (state.flushGeneration ?? 0) + 1;
  const commitFlush = () => {
    if (!state.flushScheduled || state.flushGeneration !== generation) return;
    if (state.flushAnimationFrame !== null) {
      globalThis.cancelAnimationFrame?.(state.flushAnimationFrame);
      state.flushAnimationFrame = null;
    }
    if (state.flushTimer) {
      clearTimeout(state.flushTimer);
      state.flushTimer = null;
    }
    state.flushScheduled = false;
    flushUpdates(state);
  };

  if (typeof globalThis.requestAnimationFrame === 'function') {
    state.flushAnimationFrame = globalThis.requestAnimationFrame(commitFlush);
    state.flushTimer = setTimeout(commitFlush, QUOTE_STORE_FLUSH_FALLBACK_MS);
    return;
  }

  state.flushTimer = setTimeout(commitFlush, QUOTE_STORE_FLUSH_INTERVAL_MS);
};

export const cancelFlush = (state: FlushPipelineState): void => {
  state.flushGeneration = (state.flushGeneration ?? 0) + 1;
  if (state.flushAnimationFrame !== null) {
    globalThis.cancelAnimationFrame?.(state.flushAnimationFrame);
    state.flushAnimationFrame = null;
  }
  if (state.flushTimer) {
    clearTimeout(state.flushTimer);
    state.flushTimer = null;
  }
  state.flushScheduled = false;
  state.pendingUpdates.clear();
};

export const flushUpdates = (state: FlushPipelineState): void => {
  if (state.pendingUpdates.size === 0) return;
  if (state.canCommitPendingUpdates?.() === false) {
    state.pendingUpdates.clear();
    return;
  }

  const updates = state.pendingUpdates;
  state.pendingUpdates = new Map();
  const now = Date.now();

  useTradingState.setState((tradingState) => {
    if (state.canCommitPendingUpdates?.() === false) {
      return tradingState;
    }
    const newQuotes = { ...tradingState.quotes };
    let priceChangeCount = 0;
    let appliedUpdateCount = 0;

    updates.forEach((data, symbol) => {
      const bid: number = data.bid;
      const ask: number = data.ask;
      if (!Number.isFinite(bid) || bid <= 0 || !Number.isFinite(ask) || ask < bid) {
        return;
      }
      appliedUpdateCount += 1;
      const existing = newQuotes[symbol];
      const feedTickAt =
        normalizeQuoteTickTimestampToMs(data.feedTickAt ?? data.lastTickAt ?? data.timestamp ?? data.time ?? data.t);
      const lastReceivedAt =
        normalizeQuoteTickTimestampToMs(data.lastReceivedAt) ?? now;
      const lastTickAt = feedTickAt ?? now;
      const priceChanged = hasQuotePriceChange(existing, {
        bid,
        ask,
        bidHigh: data.bidHigh,
        bidLow: data.bidLow,
      });
      const lastPriceChangedAt = priceChanged
        ? lastReceivedAt
        : existing?.lastPriceChangedAt;

      if (!existing) {
        const digits = resolveQuoteDisplayDigits(symbol, bid, data.digits, data.point);
        const volume = resolveBackendQuoteVolume({ incoming: data.volume });
        const entry: any = {
          symbol,
          ...(digits === undefined ? {} : { digits }),
          ...(data.digits !== undefined ? { digitsSource: 'backend' } : {}),
          feedTickAt,
          lastTickAt,
          lastReceivedAt,
          lastPriceChangedAt,
          bid,
          ask,
        };
        for (const k in data) { if (k !== 'symbol') entry[k] = data[k]; }
        entry.feedTickAt = feedTickAt ?? undefined;
        entry.lastTickAt = lastTickAt;
        entry.lastReceivedAt = lastReceivedAt;
        entry.lastPriceChangedAt = lastPriceChangedAt;
        // Missing live volume should stay missing. A mock/default volume would
        // make the Quotes screen look more certain than the feed really is.
        if (volume === undefined) {
          delete entry.volume;
          delete entry.volumeSource;
        } else {
          entry.volume = volume;
          entry.volumeSource = 'backend';
        }
        entry.spread = calculateQuoteSpreadPoints(bid, ask, digits) ?? entry.spread;
        newQuotes[symbol] = entry;
      } else {
        const digits = resolveQuoteDisplayDigits(
          symbol,
          bid,
          data.digits ?? existing.digits,
          data.point ?? existing.point,
        );
        const volume = resolveBackendQuoteVolume({ incoming: data.volume, previous: existing });

        // Single object creation — merge existing + server data in one allocation
        const updated: any = {};
        // Copy existing (cheapest — already has spec baked in from first tick)
        for (const k in existing) { updated[k] = (existing as any)[k]; }
        // Overlay server-sent fields
        for (const k in data) { updated[k] = data[k]; }
        // Override computed fields
        updated.symbol = symbol;
        updated.bid = bid;
        updated.ask = ask;
        if (digits !== undefined) {
          updated.digits = digits;
        }
        if (data.digits !== undefined) {
          updated.digitsSource = 'backend';
        }
        // Keep volume backend-owned across coalesced ticks.
        if (volume === undefined) {
          delete updated.volume;
          delete updated.volumeSource;
        } else {
          updated.volume = volume;
          updated.volumeSource = 'backend';
        }
        updated.feedTickAt = feedTickAt ?? undefined;
        updated.lastTickAt = lastTickAt;
        updated.lastReceivedAt = lastReceivedAt;
        updated.lastPriceChangedAt = lastPriceChangedAt;
        updated.spread = calculateQuoteSpreadPoints(bid, ask, digits) ?? updated.spread;
        updated.prevBid = bid !== existing.bid ? existing.bid : existing.prevBid;
        updated.prevAsk = ask !== existing.ask ? existing.ask : existing.prevAsk;
        newQuotes[symbol] = updated;
      }

      if (priceChanged) {
        priceChangeCount += 1;
      }
    });

    // Always bump tickCount per flushed symbol so live-feed subscribers
    // re-render on every tick — including identical-price heartbeats.
    // priceChangeCount is retained as a hint but not used for gating.
    void priceChangeCount;
    if (appliedUpdateCount === 0) return tradingState;
    return { quotes: newQuotes, tickCount: tradingState.tickCount + appliedUpdateCount };
  });
};
