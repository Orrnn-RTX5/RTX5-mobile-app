import { normalizeQuoteTickTimestampToMs } from '../../api/ws/quoteTimestamp';
import type { QuoteTickEvent } from '../../api/ws/quoteTickNormalizer';
import { normalizeSymbol } from '../../domain/symbols';
import type { QuoteItem } from '../../dev/mock/tradingData';
import { hasQuotePriceChange } from '../../utils/quotePriceChange';
import { calculateQuoteSpreadPoints, resolveQuoteDisplayDigits } from '../../utils/quoteSpread';
import { resolveBackendQuoteVolume } from '../../utils/quoteVolume';
import { MARKET_QUOTE_STALE_AFTER_MS } from '../../market/quotePolicy';

export const LIVE_QUOTE_STALE_MS = MARKET_QUOTE_STALE_AFTER_MS;

export type LiveQuoteSnapshot = Partial<QuoteItem> & {
  symbol: string;
  dailyOpen?: number;
  previousClose?: number;
  updateSeq?: number;
  // Last-known backend volume restored from disk on cold open. Display-only
  // fallback shown until the live REST volume lands; deliberately kept separate
  // from volume/volumeSource so it never feeds the refetch logic.
  cachedVolume?: number;
};

const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

const resolveChangePct = (
  tick: QuoteTickEvent,
  bid: number,
  previous?: LiveQuoteSnapshot,
): number | undefined => {
  const explicit = toFiniteNumber(tick.changePct);
  if (explicit !== undefined) {
    return explicit;
  }

  const reference =
    toFiniteNumber(tick.previousClose) ??
    toFiniteNumber(tick.dailyOpen) ??
    toFiniteNumber(tick.open) ??
    toFiniteNumber(previous?.open);

  if (reference === undefined || reference <= 0) {
    return previous?.changePct;
  }

  return ((bid - reference) / reference) * 100;
};

export const getQuoteFreshnessAnchor = (
  quote: Partial<QuoteItem> | undefined,
): number | undefined => {
  const lastReceivedAt = toFiniteNumber(quote?.lastReceivedAt);
  if (lastReceivedAt !== undefined) {
    return lastReceivedAt;
  }

  return toFiniteNumber(quote?.lastTickAt);
};

export const hasFreshLiveQuote = (
  quote: Partial<QuoteItem> | undefined,
  now = Date.now(),
): boolean => {
  const freshnessAnchor = getQuoteFreshnessAnchor(quote);
  return (
    !!quote &&
    toFiniteNumber(quote.bid) !== undefined &&
    toFiniteNumber(quote.ask) !== undefined &&
    freshnessAnchor !== undefined &&
    now - freshnessAnchor <= LIVE_QUOTE_STALE_MS
  );
};

export const hasDisplayableLiveQuotePrice = (
  quote: Partial<QuoteItem> | undefined,
): boolean =>
  !!quote &&
  toFiniteNumber(quote.bid) !== undefined &&
  toFiniteNumber(quote.ask) !== undefined;

export const buildInitialLiveQuoteSnapshot = (
  rawSymbol: string,
  liveQuote?: Partial<QuoteItem>,
): LiveQuoteSnapshot | undefined => {
  const symbol = normalizeSymbol(rawSymbol);
  if (!symbol) {
    return undefined;
  }

  if (!liveQuote) {
    return undefined;
  }

  const merged = {
    ...liveQuote,
    symbol,
  };
  // Spread is a display calculation from bid/ask; volume is backend-owned.
  // This avoids trusting stale spread fields or mock volume after live ticks.
  const digits = resolveQuoteDisplayDigits(symbol, merged.bid, merged.digits, merged.point);
  const spread = calculateQuoteSpreadPoints(merged.bid, merged.ask, digits);
  const volume = resolveBackendQuoteVolume({ incoming: liveQuote?.volume, previous: liveQuote });

  return {
    ...merged,
    digits,
    volume,
    volumeSource: volume === undefined ? undefined : 'backend',
    ...(spread === undefined ? {} : { spread }),
  };
};

export const applyLiveQuoteTickToSnapshot = (
  rawSymbol: string,
  previous: LiveQuoteSnapshot | undefined,
  tick: QuoteTickEvent,
  updateSeq: number,
  now = Date.now(),
): LiveQuoteSnapshot | undefined => {
  const requestedSymbol = normalizeSymbol(rawSymbol);
  const tickSymbol = normalizeSymbol(tick.symbol);
  const symbol = requestedSymbol || tickSymbol;
  if (!symbol || (tickSymbol && tickSymbol !== symbol)) {
    return previous;
  }

  const bid = toFiniteNumber(tick.bid);
  const ask = toFiniteNumber(tick.ask);
  if (bid === undefined || ask === undefined || ask < bid) {
    return previous;
  }

  const base = previous;
  const receivedAt = normalizeQuoteTickTimestampToMs(tick.receivedAt) ?? now;
  const feedTickAt = normalizeQuoteTickTimestampToMs(tick.feedTickAt);
  const lastTickAt = feedTickAt ?? receivedAt;
  const digits = resolveQuoteDisplayDigits(
    symbol,
    bid,
    tick.digits ?? base?.digits,
    tick.point ?? base?.point,
  );
  const bidChanged = base?.bid !== bid;
  const askChanged = base?.ask !== ask;
  const priceChanged = hasQuotePriceChange(base, tick);
  const previousClose = toFiniteNumber(tick.previousClose);
  const dailyOpen = toFiniteNumber(tick.dailyOpen);
  const open = dailyOpen ?? toFiniteNumber(tick.open) ?? base?.open;
  const high = toFiniteNumber(tick.high) ?? base?.high;
  const low = toFiniteNumber(tick.low) ?? base?.low;
  // Live tick volume is optional. If the feed omits it, keep only a previous
  // backend-sourced value; never replace it with built-in quote defaults.
  const volume = resolveBackendQuoteVolume({ incoming: tick.volume, previous: base });
  const spread = calculateQuoteSpreadPoints(bid, ask, digits) ?? base?.spread ?? 0;

  return {
    ...(base || {}),
    symbol,
    bid,
    ask,
    prevBid: bidChanged ? base?.bid : base?.prevBid,
    prevAsk: askChanged ? base?.ask : base?.prevAsk,
    digits,
    spread,
    high,
    low,
    open,
    close: toFiniteNumber(tick.last) ?? base?.close,
    volume,
    volumeSource: volume === undefined ? undefined : 'backend',
    changePct: resolveChangePct(tick, bid, base),
    feedTickAt: feedTickAt ?? base?.feedTickAt,
    lastTickAt,
    lastReceivedAt: receivedAt,
    lastPriceChangedAt: priceChanged ? receivedAt : base?.lastPriceChangedAt,
    previousClose,
    dailyOpen,
    source: tick.source ?? base?.source,
    authority: tick.authority ?? base?.authority,
    transport: tick.transport,
    stale: tick.stale,
    tradable: tick.tradable,
    marketState: tick.marketState,
    degraded: tick.degraded,
    degradationReason: tick.degradationReason,
    sequence: tick.sequence,
    tickId: tick.tickId,
    ageMs: tick.ageMs,
    ageSec: tick.ageSec,
    updateSeq,
  } as LiveQuoteSnapshot;
};
