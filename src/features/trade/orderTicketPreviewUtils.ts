import type { CandleParams } from '../../domain/candles/hooks/useLiveCandles';
import type { ChartOrderType } from '../chart/chartTradeOrderUtils';

export type OrderTicketPreviewPoint = {
  bid: number;
  ask: number;
};

const DEFAULT_SAMPLE_SIZE = 36;

export const resolveOrderTicketPriceDecimals = (
  tickSize: number | undefined,
  bid: number,
  ask: number,
) => {
  const liveSpread = Number.isFinite(ask) && Number.isFinite(bid) ? Math.abs(ask - bid) : 0;
  const fallbackStep =
    Math.max(Math.abs(bid), Math.abs(ask)) >= 100 ? 0.01 : 0.0001;
  const candidateStep =
    typeof tickSize === 'number' && Number.isFinite(tickSize) && tickSize > 0
      ? tickSize
      : liveSpread > 0
        ? liveSpread / 10
        : fallbackStep;

  const normalized = candidateStep.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
  const dotIndex = normalized.indexOf('.');
  return dotIndex === -1 ? 0 : normalized.length - dotIndex - 1;
};

export const roundOrderTicketPrice = (
  value: number,
  tickSize: number | undefined,
  decimals: number,
) => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (typeof tickSize === 'number' && Number.isFinite(tickSize) && tickSize > 0) {
    return Number((Math.round(value / tickSize) * tickSize).toFixed(decimals));
  }

  return Number(value.toFixed(decimals));
};

export const resolveOrderTicketPendingOffset = (
  baseSymbol: string,
  pointSize: number,
) => {
  if (baseSymbol.includes('BTC')) return 350;
  if (baseSymbol.includes('XAU') || baseSymbol.includes('XAG')) return 2;
  return pointSize * 90;
};

export const resolveOrderTicketStopLimitOffset = (
  baseSymbol: string,
  pointSize: number,
  pendingOffset: number,
) => {
  if (baseSymbol.includes('BTC')) return 125;
  if (baseSymbol.includes('XAU') || baseSymbol.includes('XAG')) return 0.75;
  return Math.max(pointSize * 35, pendingOffset / 2);
};

export const resolveOrderTicketDefaultPendingPrice = ({
  orderType,
  bid,
  ask,
  pendingOffset,
  roundPrice,
}: {
  orderType: ChartOrderType;
  bid: number;
  ask: number;
  pendingOffset: number;
  roundPrice: (value: number) => number;
}) => {
  const safeBid = Number.isFinite(bid) && bid > 0 ? bid : Number.isFinite(ask) && ask > 0 ? ask : 0;
  const safeAsk = Number.isFinite(ask) && ask > 0 ? ask : safeBid;

  switch (orderType) {
    case 'Buy Limit':
      return roundPrice(Math.max(0, safeAsk - pendingOffset));
    case 'Sell Limit':
      return roundPrice(safeBid + pendingOffset);
    case 'Buy Stop':
    case 'Buy Stop Limit':
      return roundPrice(safeAsk + pendingOffset);
    case 'Sell Stop':
    case 'Sell Stop Limit':
      return roundPrice(Math.max(0, safeBid - pendingOffset));
    default:
      return roundPrice(safeAsk);
  }
};

export const buildOrderTicketPreviewSeries = ({
  candles,
  bid,
  ask,
  sampleSize = DEFAULT_SAMPLE_SIZE,
}: {
  candles: Pick<CandleParams, 'close'>[];
  bid: number;
  ask: number;
  sampleSize?: number;
}): OrderTicketPreviewPoint[] => {
  const safeBid = Number.isFinite(bid) && bid > 0 ? bid : Number.isFinite(ask) && ask > 0 ? ask : 0;
  const safeAsk = Number.isFinite(ask) && ask > 0 ? ask : safeBid;
  const spread = safeAsk > 0 && safeBid > 0 ? Math.max(safeAsk - safeBid, 0) : 0;
  const halfSpread = spread / 2;

  const seedSeries = candles
    .filter((candle) => Number.isFinite(candle.close) && candle.close > 0)
    .slice(-sampleSize)
    .map((candle) => ({
      bid: Math.max(0, candle.close - halfSpread),
      ask: candle.close + halfSpread,
    }));

  const filledSeries =
    seedSeries.length > 0
      ? [...seedSeries]
      : Array.from({ length: sampleSize }, () => ({ bid: safeBid, ask: safeAsk }));

  const firstPoint = filledSeries[0] ?? { bid: safeBid, ask: safeAsk };
  while (filledSeries.length < sampleSize) {
    filledSeries.unshift(firstPoint);
  }

  if (filledSeries.length > 0) {
    filledSeries[filledSeries.length - 1] = { bid: safeBid, ask: safeAsk };
  }

  return filledSeries;
};
