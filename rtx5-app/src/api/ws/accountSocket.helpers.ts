import type { LiveAccountData } from '../../state/liveAccountState';
import type {
  ActiveBrokerSessionCapture,
  ActiveBrokerSessionIdentity,
} from '../../state/activeBrokerSession';
import { readBackendNumber, resolveAccountCurrencyDigits } from '../../utils/accountCurrency';

export type AccountWsSession = {
  login: string;
  identity: ActiveBrokerSessionIdentity;
};

function toFiniteNumber(value: unknown): number | undefined {
  return readBackendNumber(value);
}

function pickFiniteNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const parsed = toFiniteNumber(value);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

function extractMetricsFromRecord(source: Record<string, unknown>): Partial<LiveAccountData> | null {
  const metrics: Partial<LiveAccountData> = {};

  const login = pickFiniteNumber(
    source.login,
    source.account_login,
    source.accountLogin,
    source.account_id,
    source.accountId,
    source.account_number,
    source.accountNumber,
  );
  const balance = pickFiniteNumber(source.balance_amount, source.balance, source.Balance);
  const credit = pickFiniteNumber(
    source.credit_amount,
    source.credit,
    source.credit_bonus,
    source.bonus,
  );
  const equity = pickFiniteNumber(source.equity_amount, source.equity, source.Equity);
  // Account snapshots use several aliases across the REST and realtime
  // gateways. Prefer the explicit "used" fields before the legacy `margin`
  // field so a placeholder `margin: 0` cannot hide a populated used-margin
  // value from the same payload.
  const margin = pickFiniteNumber(
    source.margin_used,
    source.used_margin,
    source.marginUsed,
    source.usedMargin,
    source.margin,
  );
  const marginFree = pickFiniteNumber(
    source.free_margin_amount,
    source.margin_free,
    source.free_margin,
    source.freeMargin,
    source.margin_available,
    source.marginAvailable,
  );
  const marginLevel = pickFiniteNumber(source.margin_level, source.marginLevel);
  const floating = pickFiniteNumber(
    source.floating,
    source.floatingPnl,
    source.floating_pnl,
    source.unrealizedPnl,
    source.unrealizedPL,
    source.unrealizedPnL,
    source.profit,
    source.pnl,
    source.pl,
    source.profitLoss,
    source.unrealized_pl,
  );

  if (login !== undefined) metrics.login = login;
  if (balance !== undefined) metrics.balance = balance;
  if (credit !== undefined) metrics.credit = credit;
  if (equity !== undefined) metrics.equity = equity;
  if (margin !== undefined) metrics.margin = margin;
  if (marginFree !== undefined) metrics.margin_free = marginFree;
  if (marginLevel !== undefined) metrics.margin_level = marginLevel;
  if (floating !== undefined) metrics.floating = floating;

  if (typeof source.currency === 'string' && source.currency.trim()) {
    metrics.currency = source.currency.trim().toUpperCase();
  }
  if (source.currency_digits !== undefined || source.currencyDigits !== undefined) {
    const digits = resolveAccountCurrencyDigits(
      source,
      source.currency_digits ?? source.currencyDigits,
    );
    if (digits !== null) {
      metrics.currency_digits = digits;
    }
  }
  const leverage = pickFiniteNumber(source.leverage);
  if (leverage !== undefined && leverage > 0) {
    metrics.leverage = leverage;
  }
  const rawToken = source.publication_token ?? source.publicationToken;
  if (typeof rawToken === 'string' && rawToken.trim()) {
    metrics.publication_token = rawToken.trim();
  }
  if (typeof source.valid === 'boolean') {
    metrics.valid = source.valid;
  }
  if (typeof source.stale === 'boolean') {
    metrics.stale = source.stale;
  }
  if (typeof source.status === 'string' && source.status.trim()) {
    metrics.status = source.status.trim();
  }
  if (source.calculated_at !== undefined || source.calculatedAt !== undefined) {
    metrics.calculated_at = (source.calculated_at ?? source.calculatedAt) as string | number;
  }
  if (source.as_of !== undefined || source.asOf !== undefined) {
    metrics.as_of = (source.as_of ?? source.asOf) as string | number;
  }
  if (source.source_as_of !== undefined || source.sourceAsOf !== undefined) {
    metrics.source_as_of = (source.source_as_of ?? source.sourceAsOf) as string | number;
  }
  const rawBrokerId = source.broker_id ?? source.brokerId;
  if (rawBrokerId !== undefined && rawBrokerId !== null && String(rawBrokerId).trim()) {
    metrics.broker_id = String(rawBrokerId).trim();
  }

  return Object.keys(metrics).length > 0 ? metrics : null;
}

function extractNestedLiveAccountMetrics(
  data: unknown,
  seen: WeakSet<object>,
): Partial<LiveAccountData> | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  if (seen.has(data)) {
    return null;
  }

  seen.add(data);
  const source = data as Record<string, unknown>;
  const directMetrics = extractMetricsFromRecord(source);

  for (const key of ['data', 'account', 'snapshot', 'metrics', 'payload']) {
    const nested = source[key];
    const nestedMetrics = extractNestedLiveAccountMetrics(nested, seen);
    if (nestedMetrics) {
      return directMetrics ? { ...directMetrics, ...nestedMetrics } : nestedMetrics;
    }
  }

  return directMetrics;
}

export function resolveAccountWsSession(
  capture: ActiveBrokerSessionCapture | null,
): AccountWsSession | null {
  if (
    !capture ||
    !capture.credentials.accessToken.trim() ||
    !capture.session.tradeWsBase
  ) {
    return null;
  }
  const login = String(capture.session.accountLogin ?? '').trim();
  if (!login) {
    return null;
  }

  return {
    login,
    identity: {
      brokerId: capture.session.brokerId,
      accountLogin: login,
      sessionEpoch: capture.session.sessionEpoch,
    },
  };
}

export function extractLiveAccountMetrics(data: unknown): Partial<LiveAccountData> | null {
  return extractNestedLiveAccountMetrics(data, new WeakSet<object>());
}
