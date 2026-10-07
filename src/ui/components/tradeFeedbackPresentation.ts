export type TradeFeedbackPresentationInput = {
  visible: boolean;
  type: 'success' | 'error';
  executionConfirmed?: boolean;
  side?: 'buy' | 'sell';
  symbol?: string;
  ticket?: string;
  price?: number;
  volume?: number;
};

export type ConfirmedTradeReceipt = {
  symbol: string;
  side: 'buy' | 'sell';
  sideLabel: 'BUY' | 'SELL';
  sideAccessibilityLabel: 'Buy' | 'Sell';
  volumeLabel: string;
  doneLabel: 'Done';
};

export function resolveConfirmedTradeReceipt(
  state: TradeFeedbackPresentationInput,
): ConfirmedTradeReceipt | null {
  if (
    !state.visible
    || state.type !== 'success'
    || state.executionConfirmed !== true
  ) {
    return null;
  }

  const symbol = String(state.symbol ?? '').trim().replace(/\//g, '');
  const ticket = String(state.ticket ?? '').trim();
  const price = Number(state.price);
  const volume = Number(state.volume);
  if (
    !symbol
    || !ticket
    || ticket === '0'
    || !Number.isFinite(price)
    || price <= 0
    || !Number.isFinite(volume)
    || volume <= 0
    || (state.side !== 'buy' && state.side !== 'sell')
  ) {
    return null;
  }

  const isBuy = state.side === 'buy';
  return {
    symbol,
    side: state.side,
    sideLabel: isBuy ? 'BUY' : 'SELL',
    sideAccessibilityLabel: isBuy ? 'Buy' : 'Sell',
    volumeLabel: volume.toFixed(2),
    doneLabel: 'Done',
  };
}
