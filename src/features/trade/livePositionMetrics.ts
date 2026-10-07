import type { PositionItem, QuoteItem } from '../../dev/mock/tradingData';
import { normalizeSymbol } from '../../domain/symbols.ts';
import { MARKET_QUOTE_STALE_AFTER_MS } from '../../market/quotePolicy.ts';

type QuoteLike = Partial<QuoteItem> | undefined;
const LIVE_QUOTE_STALE_MS = MARKET_QUOTE_STALE_AFTER_MS;

export function resolveLivePositionPnlDecimals(value: number): number {
  const absValue = Math.abs(Number.isFinite(value) ? value : 0);
  if (absValue < 1) {
    return 5;
  }
  if (absValue < 10) {
    return 4;
  }
  if (absValue < 100) {
    return 3;
  }
  return 2;
}

export function formatLivePositionPnl(value: number): string {
  const finiteValue = Number.isFinite(value) ? value : 0;
  const safeValue = Object.is(finiteValue, -0) ? 0 : finiteValue;
  return `${safeValue >= 0 ? '+' : ''}${safeValue.toFixed(resolveLivePositionPnlDecimals(safeValue))}`;
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function toTimestampMs(value: unknown): number | undefined {
  const numeric = toFiniteNumber(value);
  if (numeric === undefined || numeric <= 0) {
    return undefined;
  }

  if (numeric > 4.2e16) return Math.floor(numeric / 1_000_000);
  if (numeric > 4.2e13) return Math.floor(numeric / 1_000);
  if (numeric > 4.2e10) return Math.floor(numeric);
  return Math.floor(numeric * 1000);
}

function isUsableLiveQuote(quote: QuoteLike): boolean {
  const lastTickAt = toTimestampMs(quote?.lastReceivedAt) ?? toTimestampMs(quote?.lastTickAt);
  return lastTickAt === undefined || Date.now() - lastTickAt <= LIVE_QUOTE_STALE_MS;
}

function getSignedPriceDelta(position: PositionItem, price: number): number {
  return position.side === 'buy' ? price - position.openPrice : position.openPrice - price;
}

function inferContractSize(position: PositionItem, quote?: QuoteLike): number {
  const normalizedSymbol = normalizeSymbol(position.symbol);
  const isCryptoSymbol =
    normalizedSymbol.startsWith('BTC') ||
    normalizedSymbol.startsWith('ETH') ||
    normalizedSymbol.startsWith('MBT');

  const quoteContractSize = toFiniteNumber(quote?.contractSize);
  if (quoteContractSize && quoteContractSize > 0) {
    // Crypto contracts are 1 coin (or a sub-unit). Some backend quote
    // payloads carry a generic default (100/100000) here, which inflated the
    // chart's live P/L label 100x+ on BTC. Trust the symbol class over an
    // implausibly large metadata value; smaller values (mBTC-style) pass.
    if (!isCryptoSymbol || quoteContractSize <= 1) {
      return quoteContractSize;
    }
  }

  if (normalizedSymbol.startsWith('XAU') || normalizedSymbol.startsWith('XAG')) {
    return 100;
  }

  if (isCryptoSymbol) {
    return 1;
  }

  if (
    normalizedSymbol.startsWith('US30') ||
    normalizedSymbol.startsWith('SPX') ||
    normalizedSymbol.startsWith('NAS') ||
    normalizedSymbol.startsWith('GER') ||
    normalizedSymbol.startsWith('UK') ||
    normalizedSymbol.startsWith('FRA') ||
    normalizedSymbol.startsWith('JP') ||
    normalizedSymbol.startsWith('USOIL') ||
    normalizedSymbol.startsWith('UKOIL') ||
    normalizedSymbol.startsWith('NGAS') ||
    normalizedSymbol.startsWith('COPPER')
  ) {
    return 10;
  }

  return 100000;
}

// The calibrated factor depends only on the position snapshot (pnl, swap,
// commission, currentPrice, openPrice) — NOT on the live quote — so it is stable
// across every quote tick until the broker pushes a new position object. Caching
// by object identity turns the per-tick cost into a cheap map lookup and
// auto-invalidates when positionsState replaces the position on update. Only the
// calibrated branch is cached; the contract-size fallback depends on the quote.
const calibratedFactorCache = new WeakMap<PositionItem, number>();

function derivePriceToPnlFactor(position: PositionItem, quote?: QuoteLike): number {
  const cached = calibratedFactorCache.get(position);
  if (cached !== undefined) {
    return cached;
  }

  const swap = toFiniteNumber(position.swap) ?? 0;
  const commission = toFiniteNumber(position.commission) ?? 0;
  const baseProfit = (toFiniteNumber(position.pnl) ?? 0) - swap - commission;
  const snapshotDelta = getSignedPriceDelta(position, toFiniteNumber(position.currentPrice) ?? position.openPrice);

  if (Math.abs(snapshotDelta) > Number.EPSILON) {
    const calibratedFactor = baseProfit / snapshotDelta;
    if (Number.isFinite(calibratedFactor) && calibratedFactor !== 0) {
      calibratedFactorCache.set(position, calibratedFactor);
      return calibratedFactor;
    }
  }

  return (toFiniteNumber(position.volume) ?? 0) * inferContractSize(position, quote);
}

export function resolveLivePositionPrice(position: PositionItem, quote?: QuoteLike): number {
  const fallbackPrice = toFiniteNumber(position.currentPrice) ?? toFiniteNumber(position.openPrice) ?? 0;
  const liveQuote = isUsableLiveQuote(quote) ? quote : undefined;
  const bid = toFiniteNumber(liveQuote?.bid) ?? fallbackPrice;
  const ask = toFiniteNumber(liveQuote?.ask) ?? fallbackPrice;
  return position.side === 'buy' ? bid : ask;
}

export function resolveLivePositionPnl(position: PositionItem, quote?: QuoteLike): number {
  const livePrice = resolveLivePositionPrice(position, quote);
  if (!Number.isFinite(livePrice)) {
    return toFiniteNumber(position.pnl) ?? 0;
  }

  const swap = toFiniteNumber(position.swap) ?? 0;
  const commission = toFiniteNumber(position.commission) ?? 0;
  const factor = derivePriceToPnlFactor(position, quote);
  const liveBaseProfit = getSignedPriceDelta(position, livePrice) * factor;
  const livePnl = liveBaseProfit + swap + commission;

  return Number.isFinite(livePnl) ? livePnl : (toFiniteNumber(position.pnl) ?? 0);
}

export function sumLivePositionPnl(
  positions: PositionItem[],
  quotesBySymbol: Record<string, Partial<QuoteItem> | undefined>,
): number {
  return positions.reduce(
    (total, position) => total + resolveLivePositionPnl(position, quotesBySymbol[position.symbol]),
    0,
  );
}
