import type { LiveAccountData, LiveAccountMetricFlags } from '../../state/liveAccountState';
import type { AccountSummary } from '../../state/tradingState';
import type { PositionItem, QuoteItem } from '../../domain/tradingModels';
import { sumLivePositionMargin, sumLivePositionPnl } from './livePositionMetrics.ts';

type TradeLiveAccountMetrics = Partial<LiveAccountData> & {
  metricFlags?: Partial<LiveAccountMetricFlags>;
  staleMetricFlags?: Partial<LiveAccountMetricFlags>;
};

type TradeStoredAccountMetrics = AccountSummary & {
  staleMetrics?: readonly string[];
};

export type TradeAccountSummary = {
  balance: number;
  credit: number;
  floating: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  currency: string;
};

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function hasLiveMetric(
  liveAccount: TradeLiveAccountMetrics,
  key: keyof LiveAccountMetricFlags,
  value: unknown,
  fallbackValue?: unknown,
): boolean {
  if (
    liveAccount.staleMetricFlags?.[key] === true &&
    toFiniteNumber(fallbackValue) !== undefined
  ) {
    return false;
  }
  // Zero can be a valid broker value, so metric flags decide whether a live
  // account field is present instead of treating 0 as "missing".
  if (liveAccount.metricFlags) {
    return liveAccount.metricFlags[key] === true && toFiniteNumber(value) !== undefined;
  }

  const numericValue = toFiniteNumber(value);
  return numericValue !== undefined && numericValue !== 0;
}

function pickAccountMetric(
  liveAccount: TradeLiveAccountMetrics,
  key: keyof LiveAccountMetricFlags,
  liveValue: unknown,
  fallbackValue: unknown,
): number {
  if (hasLiveMetric(liveAccount, key, liveValue, fallbackValue)) {
    return toFiniteNumber(liveValue) ?? 0;
  }

  return toFiniteNumber(fallbackValue) ?? 0;
}

export function buildTradeAccountSummary(
  liveAccount: TradeLiveAccountMetrics,
  tradingAccount: TradeStoredAccountMetrics | null | undefined,
): TradeAccountSummary {
  // REST retains old metrics when the latest snapshot omits them. Margin Level
  // must show only a received backend value, or zero when neither source has one.
  const liveMarginLevelStale = liveAccount.staleMetricFlags?.margin_level === true;
  const fallbackMarginLevel =
    tradingAccount?.staleMetrics?.includes('marginLevel') ||
    (liveMarginLevelStale && !tradingAccount?.staleMetrics)
      ? undefined
      : tradingAccount?.marginLevel;
  const marginLevel = !liveMarginLevelStale && hasLiveMetric(
    liveAccount, 'margin_level', liveAccount.margin_level, fallbackMarginLevel,
  )
    ? toFiniteNumber(liveAccount.margin_level) ?? 0
    : toFiniteNumber(fallbackMarginLevel) ?? 0;
  return {
    balance: pickAccountMetric(liveAccount, 'balance', liveAccount.balance, tradingAccount?.balance),
    credit: toFiniteNumber(tradingAccount?.credit) ?? 0,
    floating: pickAccountMetric(liveAccount, 'floating', liveAccount.floating, tradingAccount?.floating),
    equity: pickAccountMetric(liveAccount, 'equity', liveAccount.equity, tradingAccount?.equity),
    margin: pickAccountMetric(liveAccount, 'margin', liveAccount.margin, tradingAccount?.margin),
    freeMargin: pickAccountMetric(liveAccount, 'margin_free', liveAccount.margin_free, tradingAccount?.freeMargin),
    marginLevel,
    currency: tradingAccount?.currency || 'USD',
  };
}

/**
 * Returns the backend-provided floating P/L without recalculating from frontend ticks.
 * Falls back to the sum of backend-reported `position.pnl` values only when the
 * account-level floating metric has not arrived yet (0) while synced positions exist.
 */
export function resolveTradeFloatingPnl(
  summaryFloating: number,
  positions: PositionItem[],
  hydratedLogin: string | null,
  activeLogin: number | string | null | undefined,
  _quotesBySymbol: Record<string, Partial<QuoteItem> | undefined> = {},
): number {
  void _quotesBySymbol;
  const backendFloating = toFiniteNumber(summaryFloating) ?? 0;
  if (backendFloating !== 0 || positions.length === 0) {
    return backendFloating;
  }

  if (activeLogin === null || activeLogin === undefined || hydratedLogin !== String(activeLogin)) {
    return backendFloating;
  }

  return sumLivePositionPnl(positions);
}

/**
 * Returns only the backend-reported used margin (`summaryMargin` or stored
 * `fallbackAccountMargin`), never estimating margin on the frontend.
 */
export function resolveTradeUsedMargin(
  summaryMargin: number,
  fallbackAccountMargin: number | undefined,
  _positions: PositionItem[],
  hydratedLogin: string | null,
  activeLogin: number | string | null | undefined,
  _quotesBySymbol: Record<string, Partial<QuoteItem> | undefined> = {},
  _leverage?: number,
): number {
  void _positions;
  void _quotesBySymbol;
  void _leverage;
  if (Number.isFinite(summaryMargin) && summaryMargin > 0) {
    return summaryMargin;
  }

  if (
    activeLogin !== null &&
    activeLogin !== undefined &&
    hydratedLogin !== null &&
    hydratedLogin !== String(activeLogin)
  ) {
    return Number.isFinite(summaryMargin) ? summaryMargin : 0;
  }

  if (
    typeof fallbackAccountMargin === 'number' &&
    Number.isFinite(fallbackAccountMargin) &&
    fallbackAccountMargin > 0
  ) {
    return fallbackAccountMargin;
  }

  return Number.isFinite(summaryMargin) ? summaryMargin : 0;
}

/**
 * Preserves backend-supplied account summary metrics (`balance`, `credit`,
 * `floating`, `equity`, `margin`, `freeMargin`, `marginLevel`) directly
 * without recalculating `equity` or `freeMargin` on the frontend.
 */
export function resolveRenderableTradeAccountSummary(
  summary: TradeAccountSummary,
  floating = summary.floating,
  resolvedMargin = summary.margin,
): TradeAccountSummary {
  const nextFloating = Number.isFinite(floating)
    ? floating
    : (toFiniteNumber(summary.floating) ?? 0);
  const nextMargin =
    Number.isFinite(resolvedMargin) && resolvedMargin > 0
      ? resolvedMargin
      : (toFiniteNumber(summary.margin) ?? 0);
  const nextEquity = toFiniteNumber(summary.equity) ?? 0;
  const nextFreeMargin = toFiniteNumber(summary.freeMargin) ?? 0;
  const nextMarginLevel = toFiniteNumber(summary.marginLevel) ?? 0;

  if (
    Object.is(nextFloating, summary.floating) &&
    Object.is(nextMargin, summary.margin) &&
    Object.is(nextEquity, summary.equity) &&
    Object.is(nextFreeMargin, summary.freeMargin) &&
    Object.is(nextMarginLevel, summary.marginLevel)
  ) {
    return summary;
  }

  return {
    ...summary,
    floating: nextFloating,
    margin: nextMargin,
    equity: nextEquity,
    freeMargin: nextFreeMargin,
    marginLevel: nextMarginLevel,
  };
}
