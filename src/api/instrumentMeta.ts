import { normalizeQuoteSymbolKey, normalizeSymbol } from '../domain/symbols';
import { normalizePriceDigits, resolveDecimalsFromPriceStep } from '../utils/pricePrecision';
import { derivePointFromDigits } from '../utils/pricePoint';

export interface InstrumentMetaDTO {
  symbol: string;
  tradeMode?: string | number;
  visible?: boolean;
  enabled?: boolean;
  name?: string;
  category?: string;
  sector?: string;
  spreadMode?: string;
  stopsLevel?: string;
  calculation?: string;
  chartMode?: string;
  contractSize?: number;
  minVolume?: number;
  maxVolume?: number;
  stepVolume?: number;
  point?: number;
  tickSize?: number;
  tickValue?: number;
  digits?: number;
  spread?: number;
  commission?: number;
  marginInitial?: number;
  marginMaintenance?: number;
  swapLong?: number;
  swapShort?: number;
  baseCurrency?: string;
  profitCurrency?: string;
  sessions?: Array<[string, string]>;
}

const instrumentMetaCache = new Map<string, InstrumentMetaDTO>();

const INSTRUMENT_LIST_KEYS = [
  'instruments',
  'symbols',
  'data',
  'items',
  'results',
  'result',
  'records',
] as const;

const INSTRUMENT_FIELD_KEYS = [
  'symbol',
  'Symbol',
  'SYMBOL',
  'instrument',
  'instrumentSymbol',
  'code',
  'ticker',
] as const;

const DIGITS_FIELD_KEYS = [
  'digits',
  'Digits',
  'DIGITS',
  'precision',
  'pricePrecision',
  'price_precision',
  'symbolDigits',
  'symbol_digits',
  'priceDigits',
  'price_digits',
  'quoteDigits',
  'quote_digits',
  'quotePrecision',
  'quote_precision',
  'decimalPlaces',
  'decimal_places',
] as const;

const POINT_FIELD_KEYS = [
  'point',
  'Point',
  'POINT',
  'pricePoint',
  'price_point',
] as const;

const TICK_SIZE_FIELD_KEYS = [
  'tick_size',
  'tickSize',
  'TickSize',
  'TICK_SIZE',
  'tick-size',
  'priceTickSize',
  'price_tick_size',
  'minimumPriceIncrement',
  'minimum_price_increment',
] as const;

const TICK_VALUE_FIELD_KEYS = [
  'tickValue',
  'TickValue',
  'TICK_VALUE',
  'tick_value',
] as const;

const CONTRACT_SIZE_FIELD_KEYS = [
  'contractSize',
  'ContractSize',
  'CONTRACT_SIZE',
  'contract_size',
  'tradeContractSize',
  'trade_contract_size',
  'contract',
] as const;

const SPREAD_FIELD_KEYS = [
  'spread',
  'Spread',
  'SPREAD',
] as const;

const COMMISSION_FIELD_KEYS = [
  'commission',
  'Commission',
  'COMMISSION',
] as const;

const MIN_VOLUME_FIELD_KEYS = [
  'minVolume',
  'MinVolume',
  'MIN_VOLUME',
  'min_volume',
  'volumeMin',
  'volume_min',
  'minLot',
  'min_lot',
] as const;

const MAX_VOLUME_FIELD_KEYS = [
  'maxVolume',
  'MaxVolume',
  'MAX_VOLUME',
  'max_volume',
  'volumeMax',
  'volume_max',
  'maxLot',
  'max_lot',
] as const;

const STEP_VOLUME_FIELD_KEYS = [
  'stepVolume',
  'StepVolume',
  'STEP_VOLUME',
  'step_volume',
  'volumeStep',
  'volume_step',
  'lotStep',
  'lot_step',
] as const;

const STOPS_LEVEL_FIELD_KEYS = [
  'stopsLevel',
  'StopsLevel',
  'STOPS_LEVEL',
  'stops_level',
  'stopLevel',
  'stop_level',
  'tradeStopsLevel',
  'trade_stops_level',
] as const;

const SWAP_LONG_FIELD_KEYS = [
  'swapLong',
  'SwapLong',
  'SWAP_LONG',
  'swap_long',
] as const;

const SWAP_SHORT_FIELD_KEYS = [
  'swapShort',
  'SwapShort',
  'SWAP_SHORT',
  'swap_short',
] as const;

const MARGIN_INITIAL_FIELD_KEYS = [
  'marginInitial',
  'MarginInitial',
  'MARGIN_INITIAL',
  'margin_initial',
] as const;

const MARGIN_MAINTENANCE_FIELD_KEYS = [
  'marginMaintenance',
  'MarginMaintenance',
  'MARGIN_MAINTENANCE',
  'margin_maintenance',
] as const;

const BASE_CURRENCY_FIELD_KEYS = [
  'baseCurrency',
  'BaseCurrency',
  'BASE_CURRENCY',
  'base_currency',
  'currencyBase',
  'currency_base',
] as const;

const MARGIN_CURRENCY_FIELD_KEYS = [
  'marginCurrency',
  'MarginCurrency',
  'margin_currency',
  'currencyMargin',
  'currency_margin',
] as const;

const PROFIT_CURRENCY_FIELD_KEYS = [
  'profitCurrency',
  'ProfitCurrency',
  'PROFIT_CURRENCY',
  'profit_currency',
  'currencyProfit',
  'currency_profit',
] as const;

const SPREAD_MODE_FIELD_KEYS = [
  'spreadMode',
  'SpreadMode',
  'SPREAD_MODE',
  'spread_mode',
] as const;

const CALCULATION_FIELD_KEYS = [
  'calculation',
  'Calculation',
  'CALCULATION',
  'calcMode',
  'calc_mode',
  'tradeCalcMode',
  'trade_calc_mode',
] as const;

const CHART_MODE_FIELD_KEYS = [
  'chartMode',
  'ChartMode',
  'CHART_MODE',
  'chart_mode',
] as const;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

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

const normalizeDigits = (value: unknown): number | undefined => {
  return normalizePriceDigits(value);
};

const normalizePositiveNumber = (value: unknown): number | undefined => {
  const parsed = toFiniteNumber(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
};

const pickStringField = (record: Record<string, unknown>, keys: readonly string[]): string | undefined => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }

  return undefined;
};

const pickStringLikeField = (record: Record<string, unknown>, keys: readonly string[]): string | undefined => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }

  return undefined;
};

const pickDigits = (record: Record<string, unknown>): number | undefined => {
  for (const key of DIGITS_FIELD_KEYS) {
    const digits = normalizeDigits(record[key]);
    if (digits !== undefined) {
      return digits;
    }
  }

  return undefined;
};

const pickPositiveNumber = (record: Record<string, unknown>, keys: readonly string[]): number | undefined => {
  for (const key of keys) {
    const value = normalizePositiveNumber(record[key]);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
};

const pickFiniteNumber = (record: Record<string, unknown>, keys: readonly string[]): number | undefined => {
  for (const key of keys) {
    const value = toFiniteNumber(record[key]);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
};

const pickStepDerivedDigits = (record: Record<string, unknown>): number | undefined => {
  for (const key of POINT_FIELD_KEYS) {
    const digits = resolveDecimalsFromPriceStep(record[key]);
    if (digits !== undefined) {
      return digits;
    }
  }

  for (const key of TICK_SIZE_FIELD_KEYS) {
    const digits = resolveDecimalsFromPriceStep(record[key]);
    if (digits !== undefined) {
      return digits;
    }
  }

  return undefined;
};

const unwrapInstrumentRecord = (payload: unknown): Record<string, unknown> | null => {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }

  for (const key of ['instrument', 'data', 'result', 'item'] as const) {
    const nested = asRecord(record[key]);
    if (nested) {
      return nested;
    }
  }

  return record;
};

const getScopedCacheKey = (scope: string | undefined, symbol: string) =>
  `${scope ?? 'default'}:${symbol}`;

export const cacheInstrumentMeta = (meta: InstrumentMetaDTO, scope?: string) => {
  const exactKey = normalizeQuoteSymbolKey(meta.symbol);
  const normalizedKey = normalizeSymbol(meta.symbol);
  if (exactKey) {
    instrumentMetaCache.set(getScopedCacheKey(scope, exactKey), meta);
  }
  if (normalizedKey) {
    instrumentMetaCache.set(getScopedCacheKey(scope, normalizedKey), meta);
  }
};

export const getCachedInstrumentMeta = (symbol: string, scope?: string): InstrumentMetaDTO | undefined => {
  const exactKey = normalizeQuoteSymbolKey(symbol);
  const normalizedKey = normalizeSymbol(symbol);
  return (
    instrumentMetaCache.get(getScopedCacheKey(scope, exactKey)) ??
    instrumentMetaCache.get(getScopedCacheKey(scope, normalizedKey))
  );
};

export const normalizeInstrumentMetaPayload = (
  payload: unknown,
  fallbackSymbol?: string,
): InstrumentMetaDTO => {
  const record = unwrapInstrumentRecord(payload) ?? {};
  const symbol = pickStringField(record, INSTRUMENT_FIELD_KEYS) ?? fallbackSymbol ?? '';
  const digits = pickDigits(record);
  const point = pickPositiveNumber(record, POINT_FIELD_KEYS);
  const tickSize = pickPositiveNumber(record, TICK_SIZE_FIELD_KEYS) ?? point;
  const tickValue = pickPositiveNumber(record, TICK_VALUE_FIELD_KEYS);
  const contractSize = pickPositiveNumber(record, CONTRACT_SIZE_FIELD_KEYS);
  const spread = pickFiniteNumber(record, SPREAD_FIELD_KEYS);
  const commission = pickFiniteNumber(record, COMMISSION_FIELD_KEYS);
  const minVolume = pickPositiveNumber(record, MIN_VOLUME_FIELD_KEYS);
  const maxVolume = pickPositiveNumber(record, MAX_VOLUME_FIELD_KEYS);
  const stepVolume = pickPositiveNumber(record, STEP_VOLUME_FIELD_KEYS);
  const stopsLevel = pickStringLikeField(record, STOPS_LEVEL_FIELD_KEYS);
  const swapLong = pickFiniteNumber(record, SWAP_LONG_FIELD_KEYS);
  const swapShort = pickFiniteNumber(record, SWAP_SHORT_FIELD_KEYS);
  const marginInitial = pickFiniteNumber(record, MARGIN_INITIAL_FIELD_KEYS);
  const marginMaintenance = pickFiniteNumber(record, MARGIN_MAINTENANCE_FIELD_KEYS);
  // Contract v3 has no base_currency; margin_currency is the base for FX.
  const baseCurrency = pickStringField(record, BASE_CURRENCY_FIELD_KEYS)
    ?? pickStringField(record, MARGIN_CURRENCY_FIELD_KEYS);
  const profitCurrency = pickStringField(record, PROFIT_CURRENCY_FIELD_KEYS);
  const spreadMode = pickStringField(record, SPREAD_MODE_FIELD_KEYS);
  const calculation = pickStringField(record, CALCULATION_FIELD_KEYS);
  const chartMode = pickStringField(record, CHART_MODE_FIELD_KEYS);
  const meta: InstrumentMetaDTO = {
    ...(typeof record.trade_mode === 'string' || typeof record.trade_mode === 'number' ? { tradeMode: record.trade_mode } : {}),
    ...(typeof record.visible === 'boolean' ? { visible: record.visible } : {}),
    ...(typeof record.enabled === 'boolean' ? { enabled: record.enabled } : {}),
    ...(record as Partial<InstrumentMetaDTO>),
    symbol,
  };

  if (point !== undefined) {
    meta.point = point;
  }

  if (tickSize !== undefined) {
    meta.tickSize = tickSize;
  }

  if (tickValue !== undefined) {
    meta.tickValue = tickValue;
  }

  if (contractSize !== undefined) {
    meta.contractSize = contractSize;
  }

  if (spread !== undefined) {
    meta.spread = spread;
  }

  if (commission !== undefined) {
    meta.commission = commission;
  }

  if (minVolume !== undefined) {
    meta.minVolume = minVolume;
  }

  if (maxVolume !== undefined) {
    meta.maxVolume = maxVolume;
  }

  if (stepVolume !== undefined) {
    meta.stepVolume = stepVolume;
  }

  if (stopsLevel !== undefined) {
    meta.stopsLevel = stopsLevel;
  }

  if (swapLong !== undefined) {
    meta.swapLong = swapLong;
  }

  if (swapShort !== undefined) {
    meta.swapShort = swapShort;
  }

  if (marginInitial !== undefined) {
    meta.marginInitial = marginInitial;
  }

  if (marginMaintenance !== undefined) {
    meta.marginMaintenance = marginMaintenance;
  }

  if (baseCurrency !== undefined) {
    meta.baseCurrency = baseCurrency;
  }

  if (profitCurrency !== undefined) {
    meta.profitCurrency = profitCurrency;
  }

  if (spreadMode !== undefined) {
    meta.spreadMode = spreadMode;
  }

  if (calculation !== undefined) {
    meta.calculation = calculation;
  }

  if (chartMode !== undefined) {
    meta.chartMode = chartMode;
  }

  const resolvedDigits = digits ?? pickStepDerivedDigits(record);
  if (resolvedDigits !== undefined) {
    meta.digits = resolvedDigits;
  }

  // Point is the quote unit (10^-broker digits), distinct from the trading tick.
  // Tick size alone does not establish broker quote precision. Keep an unknown
  // point absent rather than inventing it from the symbol or a trading step.
  if (!(typeof meta.point === 'number' && Number.isFinite(meta.point) && meta.point > 0)) {
    const derivedPoint = derivePointFromDigits(digits);
    if (derivedPoint !== undefined) {
      meta.point = derivedPoint;
    }
  }
  if (meta.stopsLevel === undefined && meta.symbol) {
    meta.stopsLevel = '0';
  }

  return meta;
};

const collectInstrumentItems = (value: unknown, items: unknown[], visited: Set<unknown>): void => {
  if (!value || visited.has(value)) {
    return;
  }

  if (Array.isArray(value)) {
    visited.add(value);
    for (const item of value) {
      items.push(item);
      const itemRecord = asRecord(item);
      if (!itemRecord) {
        continue;
      }
      for (const key of INSTRUMENT_LIST_KEYS) {
        collectInstrumentItems(itemRecord[key], items, visited);
      }
    }
    return;
  }

  const record = asRecord(value);
  if (!record) {
    return;
  }

  visited.add(value);
  for (const key of INSTRUMENT_LIST_KEYS) {
    collectInstrumentItems(record[key], items, visited);
  }
};

export const primeInstrumentMetaCacheFromCatalogPayload = (payload: unknown, scope?: string): void => {
  const items: unknown[] = [];
  collectInstrumentItems(payload, items, new Set());
  for (const item of items) {
    const meta = normalizeInstrumentMetaPayload(item);
    if (meta.symbol) {
      cacheInstrumentMeta(meta, scope);
    }
  }
};

export const findInstrumentMetaInCatalogPayload = (
  payload: unknown,
  symbol: string,
): InstrumentMetaDTO | undefined => {
  const targetExactKey = normalizeQuoteSymbolKey(symbol);
  const targetNormalizedKey = normalizeSymbol(symbol);
  if (!targetExactKey && !targetNormalizedKey) {
    return undefined;
  }

  const items: unknown[] = [];
  collectInstrumentItems(payload, items, new Set());
  let normalizedMatch: InstrumentMetaDTO | undefined;

  for (const item of items) {
    const meta = normalizeInstrumentMetaPayload(item);
    if (!meta.symbol) {
      continue;
    }

    const exactKey = normalizeQuoteSymbolKey(meta.symbol);
    const normalizedKey = normalizeSymbol(meta.symbol);
    if (exactKey && exactKey === targetExactKey) {
      return meta;
    }

    if (!normalizedMatch && normalizedKey && normalizedKey === targetNormalizedKey) {
      normalizedMatch = meta;
    }
  }

  return normalizedMatch;
};
