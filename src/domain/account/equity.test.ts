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

test('calculateEquityFromTick applies buy direction and contract size', () => {
  const result = calculateEquityFromTick({
    balance: 1000,
    positions: [basePosition],
    tick: { symbol: 'EURUSD', price: 1.101 },
    contractSizes: buildContractSizeMap([{ symbol: 'EURUSD', contractSize: 100000 }]),
  });

  assert.equal(Math.round(result.floating), 100);
  assert.equal(Math.round(result.equity), 1100);
});

test('calculateEquityFromTick applies sell direction', () => {
  const result = calculateEquityFromTick({
    balance: 1000,
    positions: [{ ...basePosition, side: 'sell' }],
    tick: { symbol: 'EURUSD', price: 1.099 },
  });

  assert.equal(Math.round(result.floating), 100);
  assert.equal(Math.round(result.equity), 1100);
});

test('calculateEquityFromTick preserves other-symbol pnl values', () => {
  const result = calculateEquityFromTick({
    balance: 1000,
    positions: [
      basePosition,
      { ...basePosition, id: '2', symbol: 'GBPUSD', pnl: 25 },
    ],
    tick: { symbol: 'EURUSD', price: 1.101 },
  });

  assert.equal(Math.round(result.floating), 125);
  assert.equal(Math.round(result.equity), 1125);
});

test('calculateEquityFromTick converts to account currency via the calibrated snapshot factor (USDJPY)', () => {
  // USD account, USDJPY long. Quote currency is JPY, so a raw
  // (price-open)*volume*contractSize would yield JPY, not USD. The server
  // snapshot pnl (332 USD at price 150.50, open 150.00) calibrates the
  // USD-per-price-unit factor = 332 / 0.50 = 664. A tick to 150.60 must give
  // (150.60-150.00)*664 = 398.4 USD — NOT 60000 (the uncoverted JPY figure).
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

  assert.equal(Number(result.floating.toFixed(1)), 398.4);
  assert.equal(Number(result.equity.toFixed(1)), 1398.4);
});

test('calculateEquityFromTick keeps swap and commission in net floating pnl for the ticked symbol', () => {
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
  assert.equal(Number(result.equity.toFixed(2)), 1098);
});
