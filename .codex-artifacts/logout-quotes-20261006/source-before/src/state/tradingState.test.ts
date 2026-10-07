import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resetQuoteMarketData,
  resetSessionMarketData,
  useTradingState,
} from './tradingState.ts';

const resetTradingState = () => {
  useTradingState.setState({
    quotes: {},
    tickCount: 0,
    account: null,
    candles: {},
  });
};

test('backend quote digits replace stale cached quote precision', () => {
  resetTradingState();

  useTradingState.getState().setQuote('BTCUSD', {
    bid: 65000.12,
    ask: 65001.12,
    digits: 2,
    digitsSource: 'backend',
  });
  useTradingState.getState().setQuote('BTCUSD', {
    bid: 65000.12345678,
    ask: 65001.12345678,
    digits: 8,
    digitsSource: 'backend',
  });

  const quote = useTradingState.getState().quotes.BTCUSD;
  assert.equal(quote.digits, 8);
  assert.equal(quote.digitsSource, 'backend');
});

test('EURUSD quote without digits displays spread in points', () => {
  resetTradingState();
  useTradingState.getState().setQuote('EURUSD', {
    bid: 1.13736,
    ask: 1.13751,
    spread: 0.00015,
  });
  const quote = useTradingState.getState().quotes.EURUSD;
  assert.equal(quote.digits, 5);
  assert.equal(quote.spread, 15);
});

test('new quotes require a real bid/ask and never receive static mock fields', () => {
  resetTradingState();
  useTradingState.getState().setQuote('EURUSD', { volume: 10 });
  assert.equal(useTradingState.getState().quotes.EURUSD, undefined);

  useTradingState.getState().setQuote('EURUSD', {
    bid: 1.1,
    ask: 1.1002,
    transport: 'websocket',
    tradable: true,
  });
  const quote = useTradingState.getState().quotes.EURUSD;
  assert.equal(quote.contractSize, undefined);
  assert.equal(quote.high, undefined);
  assert.equal(quote.transport, 'websocket');
});

test('resetSessionMarketData atomically clears quote, candle, account, and tick state', () => {
  useTradingState.setState({
    quotes: { EURUSD: { symbol: 'EURUSD', bid: 1.1, ask: 1.1002 } as any },
    candles: { 'EURUSD.M1': [{ time: 1, open: 1, high: 1, low: 1, close: 1 }] as any },
    account: { balance: 10 } as any,
    tickCount: 7,
  });

  resetSessionMarketData();
  const state = useTradingState.getState();
  assert.deepEqual(state.quotes, {});
  assert.deepEqual(state.candles, {});
  assert.equal(state.account, null);
  assert.equal(state.tickCount, 0);
});

test('credential rotation clears quotes without discarding account or candle history', () => {
  const candles = [{ time: 1, open: 1, high: 1, low: 1, close: 1 }] as any;
  const account = { balance: 10 } as any;
  useTradingState.setState({
    quotes: { EURUSD: { symbol: 'EURUSD', bid: 1.1, ask: 1.1002 } as any },
    candles: { 'EURUSD.M1': candles },
    account,
    tickCount: 7,
  });

  resetQuoteMarketData();
  const state = useTradingState.getState();
  assert.deepEqual(state.quotes, {});
  assert.equal(state.tickCount, 0);
  assert.strictEqual(state.candles['EURUSD.M1'], candles);
  assert.strictEqual(state.account, account);
});
