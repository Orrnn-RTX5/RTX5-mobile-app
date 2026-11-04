export const CHART_ORDER_TYPES = [
  'Market Execution',
  'Buy Limit',
  'Sell Limit',
  'Buy Stop',
  'Sell Stop',
  'Buy Stop Limit',
  'Sell Stop Limit',
] as const;

export type ChartOrderType = (typeof CHART_ORDER_TYPES)[number];

type ChartTradeFillPolicyLabel = 'FOK' | 'IOC' | 'Return' | 'BOC';

type PendingChartTradeValidationInput = {
  orderType: ChartOrderType;
  entryPrice: number;
  stopLimitPrice?: number;
  bid: number;
  ask: number;
  pointSize: number;
};

type StablePendingChartTradeValidationInput = PendingChartTradeValidationInput & {
  previouslyEnabled: boolean;
};

type ChartTradeProtectionValidationInput = {
  side: 'buy' | 'sell';
  entryPrice: number;
  slEnabled: boolean;
  slPrice: number;
  tpEnabled: boolean;
  tpPrice: number;
  pointSize: number;
};

export type ChartTradeProtectionValidationResult =
  | { valid: true; message: '' }
  | { valid: false; message: string };

export const isPendingChartOrderType = (orderType: ChartOrderType) => orderType !== 'Market Execution';

export const supportsChartTradeFillPolicy = (orderType: ChartOrderType) =>
  orderType === 'Market Execution'
  || orderType === 'Buy Limit'
  || orderType === 'Sell Limit'
  || orderType === 'Buy Stop Limit'
  || orderType === 'Sell Stop Limit';

export const isStopLimitChartOrderType = (
  orderType: ChartOrderType,
): orderType is 'Buy Stop Limit' | 'Sell Stop Limit' =>
  orderType === 'Buy Stop Limit' || orderType === 'Sell Stop Limit';

export const getChartOrderSide = (
  orderType: ChartOrderType,
  marketSide: 'buy' | 'sell' = 'buy',
): 'buy' | 'sell' => {
  if (orderType === 'Market Execution') {
    return marketSide;
  }
  return orderType.toLowerCase().startsWith('sell') ? 'sell' : 'buy';
};

export const validateChartTradeProtectionLevels = ({
  side,
  entryPrice,
  slEnabled,
  slPrice,
  tpEnabled,
  tpPrice,
  pointSize,
}: ChartTradeProtectionValidationInput): ChartTradeProtectionValidationResult => {
  if (!slEnabled && !tpEnabled) {
    return { valid: true, message: '' };
  }

  if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
    return { valid: false, message: 'Entry price is required before setting SL/TP.' };
  }

  const epsilon = Math.max(pointSize / 10, 1e-9);
  const hasValidPrice = (price: number) => Number.isFinite(price) && price > 0;

  if (slEnabled) {
    if (!hasValidPrice(slPrice)) {
      return { valid: false, message: 'Stop Loss price must be greater than 0.' };
    }
    if (side === 'buy' && slPrice >= entryPrice - epsilon) {
      return { valid: false, message: 'Stop Loss must be below entry for buy orders.' };
    }
    if (side === 'sell' && slPrice <= entryPrice + epsilon) {
      return { valid: false, message: 'Stop Loss must be above entry for sell orders.' };
    }
  }

  if (tpEnabled) {
    if (!hasValidPrice(tpPrice)) {
      return { valid: false, message: 'Take Profit price must be greater than 0.' };
    }
    if (side === 'buy' && tpPrice <= entryPrice + epsilon) {
      return { valid: false, message: 'Take Profit must be above entry for buy orders.' };
    }
    if (side === 'sell' && tpPrice >= entryPrice - epsilon) {
      return { valid: false, message: 'Take Profit must be below entry for sell orders.' };
    }
  }

  return { valid: true, message: '' };
};

export const resolveDefaultStopLimitPrice = (
  orderType: ChartOrderType,
  entryPrice: number,
  stopLimitOffset: number,
  roundPrice: (value: number) => number,
) => {
  if (!isStopLimitChartOrderType(orderType) || !Number.isFinite(entryPrice) || entryPrice <= 0) {
    return 0;
  }

  const normalizedOffset = Math.max(0, stopLimitOffset);
  return orderType === 'Buy Stop Limit'
    ? roundPrice(Math.max(0, entryPrice - normalizedOffset))
    : roundPrice(entryPrice + normalizedOffset);
};

const normalizeChartTradeFillPolicyLabel = (value: unknown): ChartTradeFillPolicyLabel | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (!normalized) {
    return null;
  }
  if (normalized === 'fok' || normalized === 'fillorkill') {
    return 'FOK';
  }
  if (normalized === 'ioc' || normalized === 'immediateorcancel') {
    return 'IOC';
  }
  if (normalized === 'return') {
    return 'Return';
  }
  if (normalized === 'boc' || normalized === 'bookorcancel') {
    return 'BOC';
  }
  return null;
};

const resolveChartTradeFillPolicyCandidate = (value: unknown): ChartTradeFillPolicyLabel | null => {
  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = resolveChartTradeFillPolicyCandidate(item);
      if (normalized) {
        return normalized;
      }
    }
    return null;
  }

  if (typeof value === 'string' && value.includes(',')) {
    for (const item of value.split(',')) {
      const normalized = normalizeChartTradeFillPolicyLabel(item);
      if (normalized) {
        return normalized;
      }
    }
    return null;
  }

  return normalizeChartTradeFillPolicyLabel(value);
};

export const resolveChartTradeFillPolicyLabel = (
  meta?: unknown,
): ChartTradeFillPolicyLabel => {
  const metaRecord = typeof meta === 'object' && meta !== null
    ? meta as Record<string, unknown>
    : null;

  if (metaRecord) {
    const candidates = [
      metaRecord.fillPolicy,
      metaRecord.fill_policy,
      metaRecord.fillPolicies,
      metaRecord.fill_policies,
      metaRecord.fillingMode,
      metaRecord.filling_mode,
      metaRecord.fillingModes,
      metaRecord.filling_modes,
    ];

    for (const candidate of candidates) {
      const normalized = resolveChartTradeFillPolicyCandidate(candidate);
      if (normalized) {
        return normalized;
      }
    }
  }

  return 'FOK';
};

export const isPendingChartTradeValid = ({
  orderType,
  entryPrice,
  stopLimitPrice,
  bid,
  ask,
  pointSize,
}: PendingChartTradeValidationInput) => {
  if (!isPendingChartOrderType(orderType) || !Number.isFinite(entryPrice) || entryPrice <= 0) {
    return false;
  }

  const liveBid = Number.isFinite(bid) && bid > 0 ? bid : null;
  const liveAsk = Number.isFinite(ask) && ask > 0 ? ask : null;
  void pointSize;

  switch (orderType) {
    case 'Buy Limit':
      return liveAsk !== null && entryPrice < liveAsk;
    case 'Sell Limit':
      return liveBid !== null && entryPrice > liveBid;
    case 'Buy Stop':
      return liveAsk !== null && entryPrice > liveAsk;
    case 'Sell Stop':
      return liveBid !== null && entryPrice < liveBid;
    case 'Buy Stop Limit':
    case 'Sell Stop Limit':
      // The strict Gateway contract supports only limit and stop pending
      // orders; stop-limit values must never become a frontend fallback.
      void stopLimitPrice;
      return false;
    default:
      return false;
  }
};

export const resolveStablePendingChartTradeEnabled = ({
  orderType,
  entryPrice,
  stopLimitPrice,
  bid,
  ask,
  pointSize,
  previouslyEnabled,
}: StablePendingChartTradeValidationInput) => {
  // UI stability must not invent a broker minimum distance. Re-evaluate the
  // same strict backend rule against the latest authoritative quote.
  void previouslyEnabled;
  return isPendingChartTradeValid({
    orderType,
    entryPrice,
    stopLimitPrice,
    bid,
    ask,
    pointSize,
  });
};
