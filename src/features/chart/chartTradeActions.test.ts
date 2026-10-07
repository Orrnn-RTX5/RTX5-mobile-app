import assert from 'node:assert/strict';
import test from 'node:test';

import { buildChartMarketOrderPayload } from './chartTradeActions.ts';

test('chart market order payload includes enabled SL and TP prices', () => {
  assert.deepEqual(
    buildChartMarketOrderPayload({
      accountLogin: 200074,
      symbol: 'AUDJPY',
      side: 'buy',
      volume: 0.01,
      stopLossPrice: 94.12,
      takeProfitPrice: 94.42,
      comment: 'chart',
    }),
    {
      account_login: 200074,
      symbol: 'AUDJPY',
      side: 'buy',
      volume: 0.01,
      price_sl: 94.12,
      price_tp: 94.42,
      comment: 'chart',
    },
  );
});

test('chart market order payload omits disabled SL and TP prices', () => {
  assert.deepEqual(
    buildChartMarketOrderPayload({
      accountLogin: '200074',
      symbol: 'EURUSD',
      side: 'sell',
      volume: 0.1,
      stopLossPrice: 0,
      takeProfitPrice: null,
      comment: '  ',
    }),
    {
      account_login: '200074',
      symbol: 'EURUSD',
      side: 'sell',
      volume: 0.1,
    },
  );
});
