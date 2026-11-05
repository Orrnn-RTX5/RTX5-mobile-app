import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildContractSizeMap,
  calculateEquityFromTick,
} from './equity';
import type { PositionItem } from '../../dev/mock/tradingData';

const basePosition: PositionItem = {
  id: '1',
  symbol: 'EURUSD',
  side: 'buy',
  volume: 1,
  openPrice: 1.1,
  currentPrice: 1.1,
  pnl: 0,
  swap: 0,
  openTime: '2026.01.01 00:00:00',
};

test('calculateEquityFromTick returns backend position pnl without frontend tick calculation', () => {
  const result = calculateEquityFromTick({
    balance: 1000,
    positions: [{ ...basePosition, pnl: 100 }],
    tick: { symbol: 'EURUSD', price: 1.101 },
    contractSizes: buildContractSizeMap([{ symbol: 'EURUSD', contractSize: 100000 }]),
  });

  assert.equal(Math.round(result.floating), 100);
  assert.equal(Math.round(result.equity), 1000);
});

test('calculateEquityFromTick preserves sell position backend pnl without frontend tick calculation', () => {
  const result = calculateEquityFromTick({
    balance: 1000,
    positions: [{ ...basePosition, side: 'sell', pnl: 100 }],
    tick: { symbol: 'EURUSD', price: 1.099 },
  });

  assert.equal(Math.round(result.floating), 100);
  assert.equal(Math.round(result.equity), 1000);
});

test('calculateEquityFromTick sums backend pnl values across symbols', () => {
  const result = calculateEquityFromTick({
    balance: 1000,
    positions: [
      { ...basePosition, pnl: 100 },
      { ...basePosition, id: '2', symbol: 'GBPUSD', pnl: 25 },
    ],
    tick: { symbol: 'EURUSD', price: 1.101 },
  });

  assert.equal(Math.round(result.floating), 125);
  assert.equal(Math.round(result.equity), 1000);
});

test('calculateEquityFromTick preserves backend USDJPY snapshot pnl directly', () => {
  const usdJpy: PositionItem = {
    ...basePosition,
    symbol: 'USDJPY',
    openPrice: 150.0,
    currentPrice: 150.5,
    pnl: 332,
  };

  const result = calculateEquityFromTick({
    balance: 1000,
    positions: [usdJpy],
    tick: { symbol: 'USDJPY', price: 150.6 },
    contractSizes: buildContractSizeMap([{ symbol: 'USDJPY', contractSize: 100000 }]),
  });

  assert.equal(Number(result.floating.toFixed(1)), 332);
  assert.equal(Number(result.equity.toFixed(1)), 1000);
});

test('calculateEquityFromTick returns backend net pnl without re-adding swap or commission', () => {
  const result = calculateEquityFromTick({
    balance: 1000,
    positions: [
      {
        ...basePosition,
        pnl: 98,
        swap: -1.5,
        commission: -0.5,
      },
    ],
    tick: { symbol: 'EURUSD', price: 1.101 },
    contractSizes: buildContractSizeMap([{ symbol: 'EURUSD', contractSize: 100000 }]),
  });

  assert.equal(Number(result.floating.toFixed(2)), 98);
  assert.equal(Number(result.equity.toFixed(2)), 1000);
});
