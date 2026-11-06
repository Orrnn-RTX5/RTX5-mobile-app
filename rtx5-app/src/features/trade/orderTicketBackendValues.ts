import type { MarginCalcPayload } from '../../api/calculators';
import {
  formatAccountAmount,
  METRIC_UNAVAILABLE,
  readBackendNumber,
  resolveAccountCurrency,
  resolveAccountCurrencyDigits,
} from '../../utils/accountCurrency';
import { formatExactBackendValue } from '../../utils/exactBackendValue';

export const ORDER_TICKET_MARGIN_DEBOUNCE_MS = 150;

export function buildOrderTicketMarginPayload(
  accountLogin: unknown,
  symbol: unknown,
  volume: unknown,
): MarginCalcPayload | null {
  const loginNum = Number(accountLogin);
  const selectedSymbol = typeof symbol === 'string' ? symbol.trim() : '';
  const volumeNum = Number(volume);
  if (!Number.isFinite(loginNum) || loginNum <= 0) return null;
  if (!selectedSymbol) return null;
  if (!Number.isFinite(volumeNum) || !(volumeNum > 0)) return null;

  return {
    account_login: loginNum,
    symbol: selectedSymbol,
    side: 'buy',
    volume: volumeNum,
  };
}

export function resolveOrderTicketRequiredMargin(
  response: unknown,
  options?: { isLoading?: boolean; isError?: boolean },
): number | null {
  if (options?.isLoading || options?.isError || !response || typeof response !== 'object') {
    return null;
  }
  const record = response as Record<string, unknown>;
  const nestedData =
    record.data && typeof record.data === 'object'
      ? (record.data as Record<string, unknown>)
      : null;
  const parsed = readBackendNumber(record.required_margin ?? nestedData?.required_margin);
  return parsed !== undefined && parsed >= 0 ? parsed : null;
}

export function formatOrderTicketRequiredMargin(
  response: unknown,
  account: unknown,
  options?: { isLoading?: boolean; isError?: boolean; includeCurrency?: boolean },
): string {
  const estimatedMargin = resolveOrderTicketRequiredMargin(response, options);
  if (estimatedMargin === null) {
    return METRIC_UNAVAILABLE;
  }

  const record =
    response && typeof response === 'object' ? (response as Record<string, unknown>) : null;
  const responseCurrency =
    record && typeof record.currency === 'string' && record.currency.trim()
      ? record.currency.trim().toUpperCase()
      : '';
  const accountCurrency = resolveAccountCurrency(account);
  const currency = responseCurrency || accountCurrency;

  const digits =
    resolveAccountCurrencyDigits(
      account,
      record?.currency_digits ?? record?.currencyDigits,
    ) ?? resolveAccountCurrencyDigits(currency);

  const formatted = formatAccountAmount(estimatedMargin, digits);
  if (!formatted) {
    return METRIC_UNAVAILABLE;
  }

  if (options?.includeCurrency && currency) {
    return `${formatted} ${currency}`;
  }
  return formatted;
}

export function orderTicketMarginDisplay(value: unknown, currency: unknown): string {
  const parsed = readBackendNumber(value);
  if (
    parsed === undefined ||
    parsed < 0 ||
    typeof currency !== 'string' ||
    !currency.trim()
  ) {
    return '--';
  }
  const amount = formatExactBackendValue(parsed);
  return currency === 'USD' ? `-$${amount}` : `-${amount} ${currency}`;
}
