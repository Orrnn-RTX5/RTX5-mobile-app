export type MarketSentimentQuoteSource = {
  bid?: number | null;
  ask?: number | null;
  high?: number | null;
  low?: number | null;
};

export type MarketSentimentDailyRangeSource = {
  high?: number | null;
  low?: number | null;
};

export type MarketSentimentSnapshot = {
  dayHigh: number;
  dayLow: number;
  rangePositionPct: number;
  buyPct: number;
  sellPct: number;
};

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

const toFiniteNumber = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const resolveMidPrice = (quote: MarketSentimentQuoteSource): number | null => {
  const bid = toFiniteNumber(quote.bid);
  const ask = toFiniteNumber(quote.ask);

  if (bid !== null && ask !== null) {
    return (bid + ask) / 2;
  }

  return bid ?? ask;
};

export function resolveQuoteDayRange(
  quote: MarketSentimentQuoteSource,
  dailyRange?: MarketSentimentDailyRangeSource | null,
): { dayHigh: number; dayLow: number } {
  const baseHigh = toFiniteNumber(dailyRange?.high) ?? toFiniteNumber(quote.high);
  const baseLow = toFiniteNumber(dailyRange?.low) ?? toFiniteNumber(quote.low);
  const bid = toFiniteNumber(quote.bid);
  const ask = toFiniteNumber(quote.ask);

  const dayHigh = Math.max(baseHigh ?? 0, bid ?? 0, ask ?? 0);
  const lowCandidates = [baseLow, bid, ask].filter((value): value is number => value !== null);
  const dayLow = lowCandidates.length > 0 ? Math.min(...lowCandidates) : Infinity;

  return { dayHigh, dayLow };
}

export function calculateMarketSentiment(
  quote: MarketSentimentQuoteSource,
  dailyRange?: MarketSentimentDailyRangeSource | null,
): MarketSentimentSnapshot {
  const { dayHigh, dayLow } = resolveQuoteDayRange(quote, dailyRange);
  const midPrice = resolveMidPrice(quote);
  const range = dayHigh - dayLow;
  const rangePositionPct =
    midPrice === null || !Number.isFinite(dayLow) || range <= 0
      ? 50
      : clampPercent(((midPrice - dayLow) / range) * 100);
  const buyPct = Math.round(rangePositionPct);

  return {
    dayHigh,
    dayLow,
    rangePositionPct,
    buyPct,
    sellPct: 100 - buyPct,
  };
}
