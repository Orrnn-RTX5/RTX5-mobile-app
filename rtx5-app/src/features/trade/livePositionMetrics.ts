import type { PositionItem, QuoteItem } from '../../domain/tradingModels';
import { MARKET_QUOTE_STALE_AFTER_MS } from '../../market/quotePolicy.ts';
import { formatAccountAmount, readBackendNumber } from '../../utils/accountCurrency';

export type QuoteLike = Partial<QuoteItem> | undefined;
const LIVE_QUOTE_STALE_MS = MARKET_QUOTE_STALE_AFTER_MS;

export const BACKEND_PROFIT_ROUNDING_TOLERANCE = 0.005 + 1e-9;

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

export function formatLivePositionPnl(value: number, fixedDecimals?: number): string {
  const finiteValue = Number.isFinite(value) ? value : 0;
  const safeValue = Object.is(finiteValue, -0) ? 0 : finiteValue;
  const decimals =
    typeof fixedDecimals === 'number' && Number.isInteger(fixedDecimals) && fixedDecimals >= 0
      ? fixedDecimals
      : resolveLivePositionPnlDecimals(safeValue);
  return `${safeValue >= 0 ? '+' : ''}${safeValue.toFixed(decimals)}`;
}

function toFiniteNumber(value: unknown): number | undefined {
  return readBackendNumber(value);
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

export const readBackendPositionProfit = (position: any): number | null => {
  if (position?.hasBackendProfit === false || position?.pnl_available === false) return null;
  const value = readBackendNumber(
    position?.profit ?? position?.unrealizedPnL ?? position?.unrealized_pl ?? position?.pnl,
  );
  return value ?? null;
};

export const readBackendPositionMargin = (position: any): number | null => {
  if (position?.hasBackendMargin === false || position?.margin_available === false) return null;
  const value = readBackendNumber(position?.margin ?? position?.used_margin);
  return value !== undefined && value >= 0 ? value : null;
};

export const calculateLivePositionProfit = (
  position: any,
  contractSizesBySymbol?: ReadonlyMap<string, number>,
): number | null => {
  const openPrice = readBackendNumber(
    position?.openPrice ?? position?.open_price ?? position?.price_open,
  );
  const currentPrice = readBackendNumber(
    position?.currentPrice ?? position?.current_price ?? position?.price_current,
  );
  const volume = readBackendNumber(
    position?.volume ?? position?.volume_lots ?? position?.quantity,
  );
  if (openPrice === undefined || currentPrice === undefined || volume === undefined) return null;
  if (openPrice <= 0 || currentPrice <= 0 || volume <= 0) return null;
  const symbolKey = String(position?.symbol || '').trim().toUpperCase();
  const explicitContractSize = readBackendNumber(
    position?.contractSize ?? position?.contract_size,
  );
  const catalogContractSize = symbolKey ? contractSizesBySymbol?.get(symbolKey) : undefined;
  const contractSize =
    explicitContractSize !== undefined && explicitContractSize > 0
      ? explicitContractSize
      : catalogContractSize !== undefined && catalogContractSize > 0
        ? catalogContractSize
        : null;
  // White-label rule: NEVER fall back to 100,000 or symbol-name heuristics.
  if (contractSize === null) return null;
  const side = String(position?.side ?? '').toUpperCase();
  const direction = side === 'SELL' || side === 'SHORT' || Number(position?.action) === 1 ? -1 : 1;
  const profit = (currentPrice - openPrice) * direction * volume * contractSize;
  return Number.isFinite(profit) ? profit : null;
};

export const resolveTradeProfit = (
  position: any,
  contractSizesBySymbol?: ReadonlyMap<string, number>,
): { value: number | null; precise: boolean } => {
  const backend = readBackendPositionProfit(position);
  if (backend === null) {
    return { value: null, precise: false };
  }
  const precise = calculateLivePositionProfit(position, contractSizesBySymbol);
  if (precise !== null && Math.abs(precise - backend) <= BACKEND_PROFIT_ROUNDING_TOLERANCE) {
    return {
      value: precise,
      precise: Math.abs(Math.round(precise * 100) - precise * 100) > 1e-6,
    };
  }
  return { value: backend, precise: false };
};

export function resolveLivePositionPrice(position: PositionItem, quote?: QuoteLike): number {
  const fallbackPrice = toFiniteNumber(position.currentPrice) ?? toFiniteNumber(position.openPrice) ?? 0;
  const liveQuote = isUsableLiveQuote(quote) ? quote : undefined;
  const bid = toFiniteNumber(liveQuote?.bid) ?? fallbackPrice;
  const ask = toFiniteNumber(liveQuote?.ask) ?? fallbackPrice;
  return position.side === 'buy' ? bid : ask;
}

/**
 * Returns the authoritative backend P/L for an open position without any
 * frontend tick or contract-size recalculation.
 */
export function resolveLivePositionPnl(position: PositionItem, _quote?: QuoteLike): number {
  void _quote;
  return resolveTradeProfit(position).value ?? 0;
}

/**
 * Sums the backend-reported P/L values across open positions without any
 * frontend tick or contract-size recalculation.
 */
export function sumLivePositionPnl(
  positions: PositionItem[],
  _quotesBySymbol: Record<string, Partial<QuoteItem> | undefined> = {},
): number {
  void _quotesBySymbol;
  return positions.reduce(
    (total, position) => total + resolveLivePositionPnl(position),
    0,
  );
}

/**
 * Returns only a backend-supplied margin value on the position (if present),
 * never calculating margin on the frontend.
 */
export function resolveLivePositionMargin(
  position: PositionItem,
  _quote?: QuoteLike,
  _leverage = 100,
): number {
  void _quote;
  void _leverage;
  const backendMargin = readBackendPositionMargin(position);
  return backendMargin !== null && backendMargin > 0 ? backendMargin : 0;
}

/**
 * Sums backend-supplied position margins without any frontend calculation.
 */
export function sumLivePositionMargin(
  positions: PositionItem[],
  _quotesBySymbol: Record<string, Partial<QuoteItem> | undefined> = {},
  _leverage = 100,
): number {
  void _quotesBySymbol;
  void _leverage;
  return positions.reduce(
    (total, position) => total + resolveLivePositionMargin(position),
    0,
  );
}

export const formatPositionProfitPoints = (
  position: any,
  options?: {
    symbolDigits?: number | null;
    minVolume?: number | null;
  },
): string => {
  const openPrice = readBackendNumber(
    position?.openPrice ?? position?.open_price ?? position?.price_open,
  );
  const currentPrice = readBackendNumber(
    position?.currentPrice ?? position?.current_price ?? position?.price_current,
  );
  if (
    openPrice === undefined ||
    currentPrice === undefined ||
    openPrice <= 0 ||
    currentPrice <= 0
  ) {
    return '';
  }

  const rawDigits = readBackendNumber(
    options?.symbolDigits ?? position?.digits ?? position?.symbol_digits,
  );
  if (rawDigits === undefined || !Number.isInteger(rawDigits) || rawDigits < 0 || rawDigits > 18) {
    return '';
  }

  const rawMinVol = readBackendNumber(
    options?.minVolume ?? position?.minVolume ?? position?.min_volume ?? position?.volume_min,
  );
  const minVolume = rawMinVol !== undefined && rawMinVol > 0 ? rawMinVol : 0.01;
  const rawVolume = readBackendNumber(
    position?.volume ?? position?.volume_lots ?? position?.quantity,
  );
  const volume = rawVolume !== undefined && rawVolume > 0 ? rawVolume : minVolume;

  const pointSize = Math.pow(10, -rawDigits);
  if (!Number.isFinite(pointSize) || pointSize <= 0) {
    return '';
  }

  const side = String(position?.side ?? '').toUpperCase();
  const direction = side === 'SELL' || side === 'SHORT' || Number(position?.action) === 1 ? -1 : 1;
  const priceDiff = (currentPrice - openPrice) * direction;
  const lotMultiplier = (volume || minVolume) / minVolume;
  const points = Math.round((priceDiff / pointSize) * lotMultiplier);
  if (!Number.isFinite(points)) {
    return '';
  }

  return `${points >= 0 ? '+' : ''}${points} pts`;
};

export const formatPositionProfitDisplay = (
  position: any,
  options?: {
    mode?: 'money' | 'points';
    currencyDigits?: number | null;
    symbolDigits?: number | null;
    minVolume?: number | null;
    contractSizesBySymbol?: ReadonlyMap<string, number>;
    showSign?: boolean;
  },
): string => {
  if (options?.mode === 'points') {
    return formatPositionProfitPoints(position, {
      symbolDigits: options.symbolDigits,
      minVolume: options.minVolume,
    });
  }

  const resolved = resolveTradeProfit(position, options?.contractSizesBySymbol);
  if (resolved.value === null) {
    return '';
  }

  const baseDigits = options?.currencyDigits ?? 2;
  if (baseDigits === null) {
    return '';
  }
  const digits = resolved.precise ? Math.max(baseDigits, 4) : baseDigits;
  return formatAccountAmount(resolved.value, digits, options?.showSign ?? true);
};

export const calculateOpenPositionsTotals = (
  positions: readonly any[] | null | undefined,
  contractSizesBySymbol?: ReadonlyMap<string, number>,
): {
  totalProfit: number | null;
  totalNetProfit: number | null;
  totalSwap: number;
  totalCommission: number;
} => {
  if (!Array.isArray(positions) || positions.length === 0) {
    return {
      totalProfit: Array.isArray(positions) ? 0 : null,
      totalNetProfit: Array.isArray(positions) ? 0 : null,
      totalSwap: 0,
      totalCommission: 0,
    };
  }

  let totalProfit: number | null = 0;
  let totalNetProfit: number | null = 0;
  let totalSwap = 0;
  let totalCommission = 0;

  for (const pos of positions) {
    const swap = readBackendNumber(pos?.storage ?? pos?.swap) ?? 0;
    const commission = readBackendNumber(pos?.commission) ?? 0;
    totalSwap += swap;
    totalCommission += commission;

    if (totalProfit !== null && totalNetProfit !== null) {
      const resolved = resolveTradeProfit(pos, contractSizesBySymbol);
      if (resolved.value === null) {
        totalProfit = null;
        totalNetProfit = null;
      } else {
        totalProfit += resolved.value;
        totalNetProfit += resolved.value + swap + commission;
      }
    }
  }

  return {
    totalProfit,
    totalNetProfit,
    totalSwap,
    totalCommission,
  };
};
