import type { PlaceOrderPayload } from '../../api/orders';
import { assertTradeSide, TRADE_SIDE, type TradeSide } from '../../domain/tradeSide';

export type ChartTradeActionMeta = {
  side: TradeSide;
  buttonPressed: TradeSide;
  displayLabel: 'BUY' | 'SELL';
  marketLabel: 'Buy' | 'Sell';
  accessibilityLabel: 'Buy' | 'Sell';
  marketAccessibilityLabel: 'Buy' | 'Sell';
  testID: 'chart-trade-buy-button' | 'chart-trade-sell-button';
  marketTestID: 'chart-trade-buy-market-button' | 'chart-trade-sell-market-button';
  priceSource: 'ask' | 'bid';
  orderType: 'market';
};

export const CHART_TRADE_ACTIONS: Record<TradeSide, ChartTradeActionMeta> = {
  [TRADE_SIDE.buy]: {
    side: TRADE_SIDE.buy,
    buttonPressed: TRADE_SIDE.buy,
    displayLabel: 'BUY',
    // MT5 parity: the trade sheet's execution buttons read plain "Buy"/"Sell".
    marketLabel: 'Buy',
    accessibilityLabel: 'Buy',
    marketAccessibilityLabel: 'Buy',
    testID: 'chart-trade-buy-button',
    marketTestID: 'chart-trade-buy-market-button',
    priceSource: 'ask',
    orderType: 'market',
  },
  [TRADE_SIDE.sell]: {
    side: TRADE_SIDE.sell,
    buttonPressed: TRADE_SIDE.sell,
    displayLabel: 'SELL',
    marketLabel: 'Sell',
    accessibilityLabel: 'Sell',
    marketAccessibilityLabel: 'Sell',
    testID: 'chart-trade-sell-button',
    marketTestID: 'chart-trade-sell-market-button',
    priceSource: 'bid',
    orderType: 'market',
  },
};

export const CHART_TRADE_ACTION_ROW: readonly ChartTradeActionMeta[] = [
  CHART_TRADE_ACTIONS[TRADE_SIDE.sell],
  CHART_TRADE_ACTIONS[TRADE_SIDE.buy],
];

export function getChartTradeAction(side: TradeSide): ChartTradeActionMeta {
  return CHART_TRADE_ACTIONS[assertTradeSide(side)];
}

export function buildChartMarketOrderPayload({
  accountLogin,
  symbol,
  side,
  volume,
  comment,
  stopLossPrice,
  takeProfitPrice,
}: {
  accountLogin: number | string;
  symbol: string;
  side: TradeSide;
  volume: number;
  comment?: string;
  stopLossPrice?: number | null;
  takeProfitPrice?: number | null;
}): PlaceOrderPayload {
  const action = getChartTradeAction(side);
  const trimmedComment = typeof comment === 'string' ? comment.trim() : '';

  return {
    account_login: accountLogin,
    symbol,
    side: action.side,
    volume,
    ...(typeof stopLossPrice === 'number' && stopLossPrice > 0 ? { price_sl: stopLossPrice } : {}),
    ...(typeof takeProfitPrice === 'number' && takeProfitPrice > 0 ? { price_tp: takeProfitPrice } : {}),
    ...(trimmedComment ? { comment: trimmedComment } : {}),
  };
}
