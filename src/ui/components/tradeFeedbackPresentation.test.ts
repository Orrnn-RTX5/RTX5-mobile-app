import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveConfirmedTradeReceipt,
  type TradeFeedbackPresentationInput,
} from './tradeFeedbackPresentation';

const confirmedBuy: TradeFeedbackPresentationInput = {
  visible: true,
  type: 'success',
  executionConfirmed: true,
  side: 'buy',
  symbol: 'BTC/USD',
  ticket: '483921',
  price: 65126.38,
  volume: 0.01,
};

test('confirmed trade receipt presents an RTX5 execution capsule view model', () => {
  assert.deepEqual(resolveConfirmedTradeReceipt(confirmedBuy), {
    symbol: 'BTCUSD',
    side: 'buy',
    sideLabel: 'BUY',
    sideAccessibilityLabel: 'Buy',
    volumeLabel: '0.01',
    doneLabel: 'Done',
  });

  assert.deepEqual(
    resolveConfirmedTradeReceipt({ ...confirmedBuy, side: 'sell' }),
    {
      symbol: 'BTCUSD',
      side: 'sell',
      sideLabel: 'SELL',
      sideAccessibilityLabel: 'Sell',
      volumeLabel: '0.01',
      doneLabel: 'Done',
    },
  );
});

test('receipt requires complete broker execution evidence', () => {
  const incompleteStates: TradeFeedbackPresentationInput[] = [
    { ...confirmedBuy, visible: false },
    { ...confirmedBuy, type: 'error' },
    { ...confirmedBuy, executionConfirmed: false },
    { ...confirmedBuy, executionConfirmed: undefined },
    { ...confirmedBuy, ticket: undefined },
    { ...confirmedBuy, ticket: '0' },
    { ...confirmedBuy, price: undefined },
    { ...confirmedBuy, price: 0 },
    { ...confirmedBuy, symbol: '' },
    { ...confirmedBuy, volume: 0 },
    { ...confirmedBuy, side: undefined },
  ];

  incompleteStates.forEach((state) => {
    assert.equal(resolveConfirmedTradeReceipt(state), null);
  });
});
