const assert = require('node:assert/strict');

const { useTradingState } = require('../src/state/tradingState');
const {
  mergeHistoryIntoCandleCache,
  syncMergedCandleCache,
} = require('../src/state/candleCache');

const resetStore = () => {
  useTradingState.setState((state: any) => ({
    ...state,
    candles: {},
  }));
};

const main = () => {
  resetStore();

  const cachedCandles = [
    { time: 60, open: 1.1, high: 1.15, low: 1.08, close: 1.13, volume: 10 },
    { time: 120, open: 1.13, high: 1.22, low: 1.09, close: 1.2, volume: 12 },
  ];
  const recentHistory = [
    { time: 60, open: 1.1, high: 1.14, low: 1.07, close: 1.12, volume: 15 },
    { time: 120, open: 1.11, high: 1.18, low: 1.1, close: 1.16, volume: 20 },
  ];

  useTradingState.getState().setCandleHistory('EURUSD', 'M1', cachedCandles);
  const healed = mergeHistoryIntoCandleCache('EURUSD', 'M1', recentHistory);

  assert.deepEqual(healed, [
    { time: 60, open: 1.1, high: 1.14, low: 1.07, close: 1.12, volume: 15 },
    { time: 120, open: 1.11, high: 1.22, low: 1.09, close: 1.2, volume: 20 },
  ]);
  assert.deepEqual(useTradingState.getState().candles['EURUSD.M1'], healed);

  const mergedSeries = [
    { time: 60, open: 1.1, high: 1.15, low: 1.08, close: 1.13, volume: 10 },
    { time: 120, open: 1.11, high: 1.21, low: 1.09, close: 1.2, volume: 18 },
    { time: 180, open: 1.2, high: 1.24, low: 1.19, close: 1.23, volume: 4 },
  ];

  useTradingState.getState().setCandleHistory('EURUSD', 'M1', recentHistory);
  assert.equal(syncMergedCandleCache('EURUSD', 'M1', mergedSeries), true);
  assert.deepEqual(useTradingState.getState().candles['EURUSD.M1'], mergedSeries);
  assert.equal(syncMergedCandleCache('EURUSD', 'M1', mergedSeries), false);

  console.log('verify-candle-cache: ok');
};

try {
  main();
} finally {
  resetStore();
}
