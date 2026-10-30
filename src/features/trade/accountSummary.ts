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

export function resolveTradeFloatingPnl(
  summaryFloating: number,
  positions: PositionItem[],
  hydratedLogin: string | null,
  activeLogin: number | string | null | undefined,
  quotesBySymbol: Record<string, Partial<QuoteItem> | undefined> = {},
): number {
  if (activeLogin === null || activeLogin === undefined) {
    return summaryFloating;
  }

  if (hydratedLogin !== String(activeLogin)) {
    return summaryFloating;
  }

  return sumLivePositionPnl(positions, quotesBySymbol);
}

export function resolveTradeUsedMargin(
  summaryMargin: number,
  fallbackAccountMargin: number | undefined,
  positions: PositionItem[],
  hydratedLogin: string | null,
  activeLogin: number | string | null | undefined,
  quotesBySymbol: Record<string, Partial<QuoteItem> | undefined> = {},
  leverage?: number,
): number {
  if (Number.isFinite(summaryMargin) && summaryMargin > 0) {
    return summaryMargin;
  }

  if (positions.length === 0) {
    return 0;
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

  return sumLivePositionMargin(positions, quotesBySymbol, leverage);
}

export function resolveRenderableTradeAccountSummary(
  summary: TradeAccountSummary,
  floating: number,
  resolvedMargin = summary.margin,
): TradeAccountSummary {
  if (!Number.isFinite(floating)) {
    return summary;
  }

  const margin =
    Number.isFinite(resolvedMargin) && resolvedMargin > 0
      ? resolvedMargin
      : summary.margin;

  // Balance is settled cash. Equity/free margin move live because
  // they include current floating P/L while positions are still open.
  const floatingChanged = Math.abs(floating - summary.floating) > Number.EPSILON;
  const marginChanged =
    Number.isFinite(margin) &&
    (!Number.isFinite(summary.margin) || Math.abs(margin - summary.margin) >= 0.005);
  const equity = summary.balance + summary.credit + floating;
  const freeMargin = equity - margin;
  // Margin Level comes from the backend; quote/position estimates must not
  // manufacture a percentage when the backend has not supplied one.
  const marginLevel = toFiniteNumber(summary.marginLevel) ?? 0;
  const equityChanged =
    Number.isFinite(equity) &&
    (!Number.isFinite(summary.equity) || Math.abs(equity - summary.equity) >= 0.005);
  const freeMarginChanged =
    Number.isFinite(freeMargin) &&
    (!Number.isFinite(summary.freeMargin) || Math.abs(freeMargin - summary.freeMargin) >= 0.005);
  const marginLevelChanged =
    Number.isFinite(marginLevel) &&
    (!Number.isFinite(summary.marginLevel) || Math.abs(marginLevel - summary.marginLevel) >= 0.005);

  if (
    !floatingChanged &&
    !marginChanged &&
    !equityChanged &&
    !freeMarginChanged &&
    !marginLevelChanged
  ) {
    return summary;
  }

  return {
    ...summary,
    floating,
    margin: Number.isFinite(margin) ? margin : summary.margin,
    equity: Number.isFinite(equity) ? equity : summary.equity,
    freeMargin: Number.isFinite(freeMargin) ? freeMargin : summary.freeMargin,
    marginLevel: Number.isFinite(marginLevel) ? marginLevel : summary.marginLevel,
  };
}
