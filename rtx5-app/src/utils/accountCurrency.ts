export const METRIC_UNAVAILABLE = '';

export const readBackendNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
    return undefined;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (typeof value === 'object' && !Array.isArray(value) && 'amount' in value) {
    return readBackendNumber((value as { amount?: unknown }).amount);
  }
  return undefined;
};

const parseCurrencyDigitsCandidate = (value: unknown): number | null => {
  const num = readBackendNumber(value);
  if (num === undefined || !Number.isInteger(num) || num < 0 || num > 18) {
    return null;
  }
  return num;
};

export const resolveAccountCurrency = (accountOrCurrency: unknown): string => {
  if (typeof accountOrCurrency === 'string') {
    return accountOrCurrency.trim().toUpperCase();
  }
  if (accountOrCurrency && typeof accountOrCurrency === 'object') {
    const record = accountOrCurrency as Record<string, unknown>;
    const raw =
      typeof record.currency === 'string'
        ? record.currency
        : typeof record.accountCurrency === 'string'
          ? record.accountCurrency
          : '';
    return raw.trim().toUpperCase();
  }
  return '';
};

export const resolveAccountCurrencyDigits = (
  accountOrCurrency: unknown,
  explicitDigits?: unknown,
): number | null => {
  if (explicitDigits !== undefined) {
    const direct = parseCurrencyDigitsCandidate(explicitDigits);
    if (direct !== null) {
      return direct;
    }
  }

  if (typeof accountOrCurrency === 'number') {
    return parseCurrencyDigitsCandidate(accountOrCurrency);
  }

  if (accountOrCurrency && typeof accountOrCurrency === 'object') {
    const record = accountOrCurrency as Record<string, unknown>;
    const candidate = parseCurrencyDigitsCandidate(
      record.currency_digits ?? record.currencyDigits,
    );
    if (candidate !== null) {
      return candidate;
    }
  }

  const normalizedCurrency = resolveAccountCurrency(accountOrCurrency);
  if (/^[A-Z]{3}$/.test(normalizedCurrency)) {
    try {
      const resolved = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: normalizedCurrency,
      }).resolvedOptions().maximumFractionDigits;
      if (typeof resolved === 'number' && Number.isInteger(resolved) && resolved >= 0 && resolved <= 18) {
        return resolved;
      }
    } catch {
      return null;
    }
  }

  return null;
};

export const formatAccountAmount = (
  amount: number | null | undefined,
  digits: number | null,
  showSign = false,
): string => {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || digits === null) {
    return '';
  }
  const threshold = Math.pow(10, -(digits + 2));
  const normalized = Math.abs(amount) < threshold ? 0 : amount;
  const sign = showSign && normalized > 0 ? '+' : normalized < 0 ? '-' : '';
  const fixed = Math.abs(normalized).toFixed(digits);
  const [whole, fraction] = fixed.split('.');
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return fraction !== undefined ? `${sign}${groupedWhole}.${fraction}` : `${sign}${groupedWhole}`;
};
