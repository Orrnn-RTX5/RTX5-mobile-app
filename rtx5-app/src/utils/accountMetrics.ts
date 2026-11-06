import {
  readBackendNumber,
  resolveAccountCurrency,
  resolveAccountCurrencyDigits,
} from './accountCurrency';

export interface TradeAccountMetrics {
  balance: number | null;
  credit: number | null;
  equity: number | null;
  margin: number | null;
  freeMargin: number | null;
  marginLevel: number | null;
  floatingPnL: number | null;
  unrealizedPL: number | null;
}

export interface NormalizedAccountMetrics {
  balance: number;
  credit: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  floatingPnL: number;
  unrealizedPL: number;
  hasBackendBalance: boolean;
  hasBackendCredit: boolean;
  hasBackendEquity: boolean;
  hasBackendMargin: boolean;
  hasBackendFreeMargin: boolean;
  hasBackendFloatingPnL: boolean;
  hasBackendUnrealizedPL: boolean;
  hasBackendMarginLevel: boolean;
  currency?: string;
  currencyDigits: number | null;
  leverage?: number;
  publicationToken?: string;
  metricsStatus: 'ok' | 'unavailable';
  calculatedAt?: string | number;
  asOf?: string | number;
  sourceAsOf?: string | number;
  brokerId?: string;
  login?: string;
}

const OUTER_METADATA_KEYS = [
  'publication_token',
  'publicationToken',
  'calculation_version',
  'calculationVersion',
  'margin_calculation_version',
  'marginCalculationVersion',
  'configuration_version',
  'configurationVersion',
  'status',
  'valid',
  'stale',
  'calculated_at',
  'calculatedAt',
  'as_of',
  'asOf',
  'source_as_of',
  'sourceAsOf',
  'market_closed',
  'marketClosed',
  'market_status',
  'marketStatus',
  'broker_id',
  'brokerId',
  'account_login',
  'accountLogin',
  'account_id',
  'accountId',
  'account_number',
  'accountNumber',
  'login',
  'id',
  'currency',
  'currency_digits',
  'currencyDigits',
  'leverage',
  'name',
  'group',
] as const;

const ENVELOPE_WRAPPER_KEYS = [
  'account_metrics',
  'accountMetrics',
  'metrics',
  'account',
  'summary',
  'data',
  'payload',
  'result',
] as const;

const BALANCE_KEYS = ['balance_amount', 'balance', 'Balance'] as const;
const CREDIT_KEYS = ['credit_amount', 'credit', 'credit_bonus', 'bonus'] as const;
const EQUITY_KEYS = ['equity_amount', 'equity', 'Equity'] as const;
const MARGIN_KEYS = ['used_margin', 'margin_used', 'margin', 'marginUsed'] as const;
const FREE_MARGIN_KEYS = [
  'free_margin_amount',
  'freeMargin',
  'free_margin',
  'margin_free',
  'margin_available',
] as const;
const FLOATING_PNL_KEYS = [
  'floating_pnl',
  'floating',
  'profit',
  'unrealizedPL',
  'unrealized_pl',
  'unrealizedPnL',
] as const;
const MARGIN_LEVEL_KEYS = ['marginLevel', 'margin_level'] as const;

const ALL_METRIC_KEYS = [
  ...BALANCE_KEYS,
  ...CREDIT_KEYS,
  ...EQUITY_KEYS,
  ...MARGIN_KEYS,
  ...FREE_MARGIN_KEYS,
  ...FLOATING_PNL_KEYS,
  ...MARGIN_LEVEL_KEYS,
] as const;

const UNAVAILABLE_STATUS_VALUES = new Set([
  'unavailable',
  'stale',
  'invalid',
  'error',
  'failed',
  'unhealthy',
  'disconnected',
  'timeout',
]);

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const tryParseJsonRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return isPlainRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const hasDirectMetricKeys = (record: Record<string, unknown>): boolean =>
  ALL_METRIC_KEYS.some((key) => key in record && record[key] !== undefined);

export const extractAccountMetrics = (raw: unknown): Record<string, unknown> | null => {
  let current: unknown = raw;
  const preservedOuter: Record<string, unknown> = {};

  for (let depth = 0; depth < 6; depth += 1) {
    if (typeof current === 'string') {
      const parsed = tryParseJsonRecord(current);
      if (!parsed) break;
      current = parsed;
    }

    if (!isPlainRecord(current)) {
      return Object.keys(preservedOuter).length > 0 ? { ...preservedOuter } : null;
    }

    for (const key of OUTER_METADATA_KEYS) {
      if (current[key] !== undefined && current[key] !== null && preservedOuter[key] === undefined) {
        preservedOuter[key] = current[key];
      }
    }

    let nextWrapper: unknown = undefined;
    for (const wrapperKey of ENVELOPE_WRAPPER_KEYS) {
      const candidate = current[wrapperKey];
      if (isPlainRecord(candidate)) {
        nextWrapper = candidate;
        break;
      }
      if (typeof candidate === 'string') {
        const parsedCandidate = tryParseJsonRecord(candidate);
        if (parsedCandidate) {
          nextWrapper = parsedCandidate;
          break;
        }
      }
    }

    if (nextWrapper !== undefined) {
      if (hasDirectMetricKeys(current)) {
        // Merge current metric keys with nested wrapper so neither is lost
        const unwrappedNext = isPlainRecord(nextWrapper) ? nextWrapper : {};
        current = { ...current, ...unwrappedNext };
      } else {
        current = nextWrapper;
      }
      continue;
    }

    break;
  }

  if (!isPlainRecord(current)) {
    return Object.keys(preservedOuter).length > 0 ? { ...preservedOuter } : null;
  }

  const merged: Record<string, unknown> = { ...preservedOuter, ...current };
  for (const key of OUTER_METADATA_KEYS) {
    if ((merged[key] === undefined || merged[key] === null) && preservedOuter[key] !== undefined) {
      merged[key] = preservedOuter[key];
    }
  }

  return merged;
};

const readFirstMetricValue = (
  record: Record<string, unknown>,
  keys: readonly string[],
): {
  value: number | undefined;
  moneyCurrency?: string;
  moneyScale?: number;
} => {
  for (const key of keys) {
    if (!(key in record)) continue;
    const rawVal = record[key];
    const num = readBackendNumber(rawVal);
    if (num !== undefined) {
      let moneyCurrency: string | undefined;
      let moneyScale: number | undefined;
      if (isPlainRecord(rawVal)) {
        if (typeof rawVal.currency === 'string' && rawVal.currency.trim()) {
          moneyCurrency = rawVal.currency.trim().toUpperCase();
        }
        const scaleNum = readBackendNumber(rawVal.scale ?? rawVal.digits ?? rawVal.currency_digits);
        if (scaleNum !== undefined && Number.isInteger(scaleNum) && scaleNum >= 0 && scaleNum <= 18) {
          moneyScale = scaleNum;
        }
      }
      return { value: num, moneyCurrency, moneyScale };
    }
  }
  return { value: undefined };
};

export const isValidPublicationToken = (token: unknown): token is string => {
  if (typeof token !== 'string') return false;
  const trimmed = token.trim();
  return /^[0-9]{20}$/.test(trimmed) && trimmed !== '00000000000000000000';
};

export const comparePublicationTokens = (incomingToken: string, currentToken: string): number =>
  incomingToken.trim().localeCompare(currentToken.trim());

const parseBackendTimestampMs = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
    return null;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    return value < 1e11 ? value * 1000 : value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      if (numeric <= 0) return null;
      return numeric < 1e11 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
};

export const accountMetricsUnavailable = (
  raw: unknown,
  options?: { maxAgeMs?: number; nowMs?: number },
): boolean => {
  const record = extractAccountMetrics(raw);
  if (!record) return true;

  if (record.metricsStatus === 'unavailable') {
    return true;
  }

  if (record.valid === false || record.stale === true) {
    return true;
  }

  const statusText = String(record.status ?? '').trim().toLowerCase();
  if (statusText && UNAVAILABLE_STATUS_VALUES.has(statusText)) {
    return true;
  }

  const rawToken = record.publication_token ?? record.publicationToken;
  if (rawToken !== undefined && rawToken !== null && rawToken !== '') {
    if (!isValidPublicationToken(rawToken)) {
      return true;
    }
  }

  const nowMs = options?.nowMs ?? Date.now();
  const maxAgeMs = options?.maxAgeMs ?? Number.POSITIVE_INFINITY;
  const timestampKeys = [
    'calculated_at',
    'as_of',
    'source_as_of',
    'calculatedAt',
    'asOf',
    'sourceAsOf',
  ] as const;

  for (const key of timestampKeys) {
    const tsVal = record[key];
    if (tsVal === undefined || tsVal === null || tsVal === '') continue;
    const parsedMs = parseBackendTimestampMs(tsVal);
    if (parsedMs === null) {
      return true;
    }
    if (parsedMs > nowMs + 5000) {
      return true;
    }
    if (Number.isFinite(maxAgeMs) && maxAgeMs >= 0 && nowMs - parsedMs > maxAgeMs) {
      return true;
    }
  }

  return false;
};

export const isOtherBrokerId = (
  raw: unknown,
  activeBrokerId: string | number | null | undefined,
): boolean => {
  if (activeBrokerId === null || activeBrokerId === undefined) return false;
  const expected = String(activeBrokerId).trim();
  if (!expected) return false;

  const record = extractAccountMetrics(raw) ?? (isPlainRecord(raw) ? raw : null);
  if (!record) return false;

  const candidate = record.broker_id ?? record.brokerId;
  if (candidate === null || candidate === undefined) return false;
  const actual = String(candidate).trim();
  if (!actual) return false;

  return actual !== expected;
};

export const isBackendAccountForLogin = (
  raw: unknown,
  activeLogin: string | number | null | undefined,
): boolean => {
  if (activeLogin === null || activeLogin === undefined) return false;
  const expected = String(activeLogin).trim();
  if (!expected) return false;

  const record = extractAccountMetrics(raw) ?? (isPlainRecord(raw) ? raw : null);
  if (!record) return false;

  const candidate =
    record.login ??
    record.account_login ??
    record.accountLogin ??
    record.account_id ??
    record.accountId ??
    record.account_number ??
    record.accountNumber ??
    record.id;

  if (candidate === null || candidate === undefined || String(candidate).trim() === '') {
    return true;
  }

  return String(candidate).trim() === expected;
};

export const normalizeAccountMetrics = (
  raw: unknown,
  options?: { maxAgeMs?: number; nowMs?: number },
): NormalizedAccountMetrics => {
  const record = extractAccountMetrics(raw) ?? {};
  const unavailable = accountMetricsUnavailable(record, options);

  const balanceField = readFirstMetricValue(record, BALANCE_KEYS);
  const creditField = readFirstMetricValue(record, CREDIT_KEYS);
  const equityField = readFirstMetricValue(record, EQUITY_KEYS);
  const marginField = readFirstMetricValue(record, MARGIN_KEYS);
  const freeMarginField = readFirstMetricValue(record, FREE_MARGIN_KEYS);
  const floatingField = readFirstMetricValue(record, FLOATING_PNL_KEYS);
  const marginLevelField = readFirstMetricValue(record, MARGIN_LEVEL_KEYS);

  const hasBackendBalance =
    !unavailable && record.hasBackendBalance !== false && balanceField.value !== undefined;
  const hasBackendCredit =
    !unavailable && record.hasBackendCredit !== false && creditField.value !== undefined;
  const hasBackendEquity =
    !unavailable && record.hasBackendEquity !== false && equityField.value !== undefined;
  const hasBackendMargin =
    !unavailable &&
    record.hasBackendMargin !== false &&
    marginField.value !== undefined &&
    marginField.value >= 0;
  const hasBackendFreeMargin =
    !unavailable && record.hasBackendFreeMargin !== false && freeMarginField.value !== undefined;
  const hasBackendFloatingPnL =
    !unavailable &&
    record.hasBackendFloatingPnL !== false &&
    record.hasBackendUnrealizedPL !== false &&
    floatingField.value !== undefined;
  const hasBackendUnrealizedPL = hasBackendFloatingPnL;
  const hasBackendMarginLevel =
    !unavailable && record.hasBackendMarginLevel !== false && marginLevelField.value !== undefined;

  const inferredMoneyCurrency =
    balanceField.moneyCurrency ??
    equityField.moneyCurrency ??
    marginField.moneyCurrency ??
    freeMarginField.moneyCurrency ??
    floatingField.moneyCurrency ??
    creditField.moneyCurrency;

  const inferredMoneyScale =
    balanceField.moneyScale ??
    equityField.moneyScale ??
    marginField.moneyScale ??
    freeMarginField.moneyScale ??
    floatingField.moneyScale ??
    creditField.moneyScale;

  const explicitCurrency = resolveAccountCurrency(record);
  const currency = explicitCurrency || inferredMoneyCurrency || undefined;

  const currencyDigits = resolveAccountCurrencyDigits(
    {
      ...record,
      currency: currency ?? record.currency,
    },
    record.currency_digits ?? record.currencyDigits ?? inferredMoneyScale,
  );

  const rawLeverage = readBackendNumber(record.leverage);
  const leverage = rawLeverage !== undefined && rawLeverage > 0 ? rawLeverage : undefined;

  const rawToken = record.publication_token ?? record.publicationToken;
  const publicationToken = isValidPublicationToken(rawToken) ? rawToken.trim() : undefined;

  const rawLogin =
    record.login ??
    record.account_login ??
    record.accountLogin ??
    record.account_id ??
    record.accountId ??
    record.account_number ??
    record.accountNumber ??
    record.id;
  const login =
    rawLogin !== undefined && rawLogin !== null && String(rawLogin).trim() !== ''
      ? String(rawLogin).trim()
      : undefined;

  const rawBrokerId = record.broker_id ?? record.brokerId;
  const brokerId =
    rawBrokerId !== undefined && rawBrokerId !== null && String(rawBrokerId).trim() !== ''
      ? String(rawBrokerId).trim()
      : undefined;

  return {
    balance: hasBackendBalance ? balanceField.value! : 0,
    credit: hasBackendCredit ? creditField.value! : 0,
    equity: hasBackendEquity ? equityField.value! : 0,
    margin: hasBackendMargin ? marginField.value! : 0,
    freeMargin: hasBackendFreeMargin ? freeMarginField.value! : 0,
    marginLevel: hasBackendMarginLevel ? marginLevelField.value! : 0,
    floatingPnL: hasBackendFloatingPnL ? floatingField.value! : 0,
    unrealizedPL: hasBackendUnrealizedPL ? floatingField.value! : 0,
    hasBackendBalance,
    hasBackendCredit,
    hasBackendEquity,
    hasBackendMargin,
    hasBackendFreeMargin,
    hasBackendFloatingPnL,
    hasBackendUnrealizedPL,
    hasBackendMarginLevel,
    ...(currency ? { currency } : {}),
    currencyDigits,
    ...(leverage !== undefined ? { leverage } : {}),
    ...(publicationToken ? { publicationToken } : {}),
    metricsStatus: unavailable ? 'unavailable' : 'ok',
    ...(record.calculated_at !== undefined || record.calculatedAt !== undefined
      ? { calculatedAt: (record.calculated_at ?? record.calculatedAt) as string | number }
      : {}),
    ...(record.as_of !== undefined || record.asOf !== undefined
      ? { asOf: (record.as_of ?? record.asOf) as string | number }
      : {}),
    ...(record.source_as_of !== undefined || record.sourceAsOf !== undefined
      ? { sourceAsOf: (record.source_as_of ?? record.sourceAsOf) as string | number }
      : {}),
    ...(brokerId ? { brokerId } : {}),
    ...(login ? { login } : {}),
  };
};

export const mergeAccountMetricsSnapshots = <T extends Record<string, any>>(
  current: T | null | undefined,
  incomingRaw: unknown,
  options?: {
    activeBrokerId?: string | number | null;
    activeLogin?: string | number | null;
    maxAgeMs?: number;
    nowMs?: number;
  },
): (T & NormalizedAccountMetrics) | null => {
  if (incomingRaw === null || incomingRaw === undefined) {
    return (current as (T & NormalizedAccountMetrics) | null) ?? null;
  }

  if (options?.activeBrokerId !== undefined && isOtherBrokerId(incomingRaw, options.activeBrokerId)) {
    return (current as (T & NormalizedAccountMetrics) | null) ?? null;
  }

  if (
    options?.activeLogin !== undefined &&
    options.activeLogin !== null &&
    !isBackendAccountForLogin(incomingRaw, options.activeLogin)
  ) {
    return (current as (T & NormalizedAccountMetrics) | null) ?? null;
  }

  const incomingRecord = extractAccountMetrics(incomingRaw);
  const incomingNormalized = normalizeAccountMetrics(incomingRaw, {
    maxAgeMs: options?.maxAgeMs,
    nowMs: options?.nowMs,
  });

  if (!current) {
    return {
      ...(incomingRecord as unknown as T),
      ...incomingNormalized,
    };
  }

  const currentTokenRaw = current.publicationToken ?? current.publication_token;
  const currentToken = isValidPublicationToken(currentTokenRaw)
    ? currentTokenRaw.trim()
    : undefined;

  const incomingTokenRaw = incomingRecord?.publication_token ?? incomingRecord?.publicationToken;
  const incomingHasExplicitTokenField =
    incomingTokenRaw !== undefined && incomingTokenRaw !== null && incomingTokenRaw !== '';
  const incomingToken = isValidPublicationToken(incomingTokenRaw)
    ? incomingTokenRaw.trim()
    : undefined;

  // If incoming explicitly has an invalid/malformed token or explicit valid:false / stale:true,
  // transition metricsStatus to unavailable immediately.
  if (incomingNormalized.metricsStatus === 'unavailable' && incomingHasExplicitTokenField && !incomingToken) {
    return {
      ...current,
      ...incomingNormalized,
      currency: incomingNormalized.currency ?? current.currency,
      currencyDigits: incomingNormalized.currencyDigits ?? current.currencyDigits ?? null,
      leverage: incomingNormalized.leverage ?? current.leverage,
    };
  }

  if (currentToken) {
    if (!incomingHasExplicitTokenField) {
      // Untokenized response after a tokenized snapshot:
      // Do NOT overwrite any financial metric; only merge profile metadata if present.
      const mergedCurrency = incomingNormalized.currency || current.currency;
      const mergedDigits =
        incomingNormalized.currencyDigits !== null
          ? incomingNormalized.currencyDigits
          : (current.currencyDigits ?? resolveAccountCurrencyDigits(mergedCurrency));
      const mergedLeverage = incomingNormalized.leverage ?? current.leverage;

      return {
        ...current,
        ...(mergedCurrency ? { currency: mergedCurrency } : {}),
        currencyDigits: mergedDigits ?? null,
        ...(mergedLeverage !== undefined ? { leverage: mergedLeverage } : {}),
        ...(incomingRecord?.name && !current.name ? { name: incomingRecord.name } : {}),
        ...(incomingRecord?.group && !current.group ? { group: incomingRecord.group } : {}),
      } as T & NormalizedAccountMetrics;
    }

    if (incomingToken) {
      const cmp = comparePublicationTokens(incomingToken, currentToken);
      if (cmp < 0) {
        // Older publication_token: reject incoming snapshot completely.
        return current as T & NormalizedAccountMetrics;
      }
      if (cmp === 0) {
        // Identical publication_token: only fill in missing profile metadata.
        const mergedCurrency = current.currency || incomingNormalized.currency;
        const mergedDigits =
          current.currencyDigits !== null && current.currencyDigits !== undefined
            ? current.currencyDigits
            : incomingNormalized.currencyDigits;
        const mergedLeverage = current.leverage ?? incomingNormalized.leverage;
        return {
          ...current,
          ...(mergedCurrency ? { currency: mergedCurrency } : {}),
          currencyDigits: mergedDigits ?? null,
          ...(mergedLeverage !== undefined ? { leverage: mergedLeverage } : {}),
        } as T & NormalizedAccountMetrics;
      }
    }
  }

  const mergedCurrency = incomingNormalized.currency || current.currency;
  const mergedDigits =
    incomingNormalized.currencyDigits !== null
      ? incomingNormalized.currencyDigits
      : (current.currencyDigits ?? resolveAccountCurrencyDigits(mergedCurrency));
  const mergedLeverage = incomingNormalized.leverage ?? current.leverage;

  return {
    ...current,
    ...(incomingRecord as unknown as Partial<T>),
    ...incomingNormalized,
    ...(mergedCurrency ? { currency: mergedCurrency } : {}),
    currencyDigits: mergedDigits ?? null,
    ...(mergedLeverage !== undefined ? { leverage: mergedLeverage } : {}),
    ...(incomingNormalized.publicationToken
      ? {
          publicationToken: incomingNormalized.publicationToken,
          publication_token: incomingNormalized.publicationToken,
        }
      : {}),
  };
};

export const resolveTradeAccountMetrics = (
  account: unknown,
  options?: { maxAgeMs?: number; nowMs?: number },
): TradeAccountMetrics => {
  const maxAgeMs = options?.maxAgeMs ?? Number.POSITIVE_INFINITY;
  if (!account || accountMetricsUnavailable(account, { maxAgeMs, nowMs: options?.nowMs })) {
    return {
      balance: null,
      credit: null,
      equity: null,
      margin: null,
      freeMargin: null,
      marginLevel: null,
      floatingPnL: null,
      unrealizedPL: null,
    };
  }

  const normalized = normalizeAccountMetrics(account, { maxAgeMs, nowMs: options?.nowMs });
  if (normalized.metricsStatus === 'unavailable') {
    return {
      balance: null,
      credit: null,
      equity: null,
      margin: null,
      freeMargin: null,
      marginLevel: null,
      floatingPnL: null,
      unrealizedPL: null,
    };
  }

  return {
    balance: normalized.hasBackendBalance ? normalized.balance : null,
    credit: normalized.hasBackendCredit ? normalized.credit : null,
    equity: normalized.hasBackendEquity ? normalized.equity : null,
    margin: normalized.hasBackendMargin ? normalized.margin : null,
    freeMargin: normalized.hasBackendFreeMargin ? normalized.freeMargin : null,
    marginLevel: normalized.hasBackendMarginLevel ? normalized.marginLevel : null,
    floatingPnL: normalized.hasBackendFloatingPnL ? normalized.floatingPnL : null,
    unrealizedPL: normalized.hasBackendUnrealizedPL ? normalized.unrealizedPL : null,
  };
};
