import type { Candle, CandleStreamKey } from '../core/candleTypes';
import { createCandleStreamKey } from '../core/timeframeUtils';
import { sanitizeCandlesForChart } from '../normalization/chartAdapter';
import {
  MAX_CANDLE_CACHE_ENTRIES,
  MAX_CANDLE_SERIES_LENGTH,
} from '../core/candles';

type CacheEntry = {
  key: CandleStreamKey;
  candles: Candle[];
  updatedAt: number;
};

export class CandleMemoryCache {
  private entries = new Map<CandleStreamKey, CacheEntry>();
  private updateSequence = 0;

  constructor(
    private readonly maxEntries = MAX_CANDLE_CACHE_ENTRIES,
    private readonly maxCandlesPerEntry = MAX_CANDLE_SERIES_LENGTH,
  ) {}

  get(symbol: string, timeframe: string): Candle[] {
    const key = createCandleStreamKey(symbol, timeframe);
    const entry = this.entries.get(key);
    if (!entry) {
      return [];
    }

    entry.updatedAt = this.nextUpdatedAt();
    return entry.candles.map((candle) => ({ ...candle }));
  }

  set(symbol: string, timeframe: string, candles: readonly Candle[]): Candle[] {
    const key = createCandleStreamKey(symbol, timeframe);
    const safeCandles = sanitizeCandlesForChart(candles, { timeframe }).slice(-this.maxCandlesPerEntry);
    this.entries.set(key, {
      key,
      candles: safeCandles,
      updatedAt: this.nextUpdatedAt(),
    });
    this.trim();
    return safeCandles;
  }

  delete(symbol: string, timeframe: string): void {
    this.entries.delete(createCandleStreamKey(symbol, timeframe));
  }

  clear(): void {
    this.entries.clear();
  }

  private trim(): void {
    if (this.entries.size <= this.maxEntries) {
      return;
    }

    const ordered = Array.from(this.entries.values()).sort((left, right) => right.updatedAt - left.updatedAt);
    const keep = new Set(ordered.slice(0, this.maxEntries).map((entry) => entry.key));
    for (const key of this.entries.keys()) {
      if (!keep.has(key)) {
        this.entries.delete(key);
      }
    }
  }

  private nextUpdatedAt(): number {
    this.updateSequence += 1;
    return this.updateSequence;
  }
}

export const candleMemoryCache = new CandleMemoryCache();
