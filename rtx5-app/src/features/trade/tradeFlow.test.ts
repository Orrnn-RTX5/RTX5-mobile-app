import assert from 'node:assert/strict';
import test from 'node:test';
import type { PositionItem } from '../../dev/mock/tradingData';
import { bulkModeLabel, filterPositionsForBulk } from './tradeFlow';

const makePosition = (
  id: string,
  symbol: string,
  side: PositionItem['side'],
  pnl: number,
): PositionItem => ({
  id,
  symbol,
  side,
  pnl,
  volume: 0.01,
  openPrice: 1,
  currentPrice: 1,
  swap: 0,
  openTime: '2026.05.26 00:00:00',
});

test('bulk mode labels include sell and runtime symbol scopes', () => {
  assert.equal(bulkModeLabel('sell'), 'Close Sell Positions');
  assert.equal(bulkModeLabel('symbol:XAUUSD.c'), 'Close XAUUSD.c Positions');
  assert.equal(bulkModeLabel('symbol:EUR/USD'), 'Close EURUSD Positions');
});

test('bulk filters support sell side and exact runtime symbol scopes', () => {
  const positions = [
    makePosition('1', 'XAUUSD.c', 'sell', 12),
    makePosition('2', 'XAUUSD', 'buy', -4),
    makePosition('3', 'EURUSD', 'sell', -2),
  ];

  assert.deepEqual(filterPositionsForBulk(positions, 'sell').map((position) => position.id), ['1', '3']);
  assert.deepEqual(filterPositionsForBulk(positions, 'symbol:XAUUSD.c').map((position) => position.id), ['1']);
});
