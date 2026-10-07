import type { LiveAccountData, LiveAccountMetricFlags } from '../../state/liveAccountState';
import type { AccountSummary } from '../../state/tradingState';
import type { PositionItem, QuoteItem } from '../../dev/mock/tradingData';
import { sumLivePositionPnl } from './livePositionMetrics.ts';

type TradeLiveAccountMetrics = Partial<LiveAccountData> & {
  metricFlags?: Partial<LiveAccountMetricFlags>;
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
): boolean {
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
  if (hasLiveMetric(liveAccount, key, liveValue)) {
    return toFiniteNumber(liveValue) ?? 0;
  }

  return toFiniteNumber(fallbackValue) ?? 0;
}

export function buildTradeAccountSummary(
  liveAccount: TradeLiveAccountMetrics,
  tradingAccount: AccountSummary | null | undefined,
): TradeAccountSummary {
  return {
    balance: pickAccountMetric(liveAccount, 'balance', liveAccount.balance, tradingAccount?.balance),
    credit: toFiniteNumber(tradingAccount?.credit) ?? 0,
    floating: pickAccountMetric(liveAccount, 'floating', liveAccount.floating, tradingAccount?.floating),
    equity: pickAccountMetric(liveAccount, 'equity', liveAccount.equity, tradingAccount?.equity),
    margin: pickAccountMetric(liveAccount, 'margin', liveAccount.margin, tradingAccount?.margin),
    freeMargin: pickAccountMetric(liveAccount, 'margin_free', liveAccount.margin_free, tradingAccount?.freeMargin),
    marginLevel: pickAccountMetric(liveAccount, 'margin_level', liveAccount.margin_level, tradingAccount?.marginLevel),
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

export function resolveRenderableTradeAccountSummary(
  summary: TradeAccountSummary,
  floating: number,
): TradeAccountSummary {
  if (!Number.isFinite(floating)) {
    return summary;
  }

  // Balance is settled cash. Equity/free margin/margin level move live because
  // they include current floating P/L while positions are still open.
  const floatingChanged = Math.abs(floating - summary.floating) > Number.EPSILON;
  const equity = summary.balance + summary.credit + floating;
  const freeMargin = equity - summary.margin;
  // A partial event can contain margin_level before its used-margin companion.
  // Preserve that valid broker value until margin arrives; an explicit
  // no-position payload still supplies marginLevel = 0 and remains zero.
  const marginLevel = summary.margin > 0
    ? (equity / summary.margin) * 100
    : summary.marginLevel;
  const equityChanged =
    Number.isFinite(equity) &&
    (!Number.isFinite(summary.equity) || Math.abs(equity - summary.equity) >= 0.005);
  const freeMarginChanged =
    Number.isFinite(freeMargin) &&
    (!Number.isFinite(summary.freeMargin) || Math.abs(freeMargin - summary.freeMargin) >= 0.005);
  const marginLevelChanged =
    Number.isFinite(marginLevel) &&
    (!Number.isFinite(summary.marginLevel) || Math.abs(marginLevel - summary.marginLevel) >= 0.005);

  if (!floatingChanged && !equityChanged && !freeMarginChanged && !marginLevelChanged) {
    return summary;
  }

  return {
    ...summary,
    floating,
    equity: Number.isFinite(equity) ? equity : summary.equity,
    freeMargin: Number.isFinite(freeMargin) ? freeMargin : summary.freeMargin,
    marginLevel: Number.isFinite(marginLevel) ? marginLevel : summary.marginLevel,
  };
}
