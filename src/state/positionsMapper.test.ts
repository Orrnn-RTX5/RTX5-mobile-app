import assert from 'node:assert/strict';
import test from 'node:test';

import type { PositionItem } from '../dev/mock/tradingData';
import { isRenderablePositionSymbol, mapPositionToItem } from './positionsMapper.ts';

test('mapPositionToItem merges partial websocket updates into the existing position', () => {
  const existing: PositionItem = {
    id: '50123',
    symbol: 'XAUUSD',
    side: 'buy',
    volume: 0.2,
    openPrice: 3245.5,
    currentPrice: 3248.1,
    pnl: 47.75,
    swap: -1.25,
    commission: -0.5,
    openTime: '2026-04-11T10:00:00.000Z',
    sl: 3230,
    tp: 3270,
  };

  const mapped = mapPositionToItem(
    {
      ticket: 50123,
      profit: 61.5,
      price_current: 3249.8,
    },
    existing,
  );

  assert.equal(mapped.id, '50123');
  assert.equal(mapped.symbol, 'XAUUSD');
  assert.equal(mapped.volume, 0.2);
  assert.equal(mapped.openPrice, 3245.5);
  assert.equal(mapped.currentPrice, 3249.8);
  assert.equal(mapped.swap, -1.25);
  assert.equal(mapped.commission, -0.5);
  assert.equal(mapped.pnl, 59.75);
  assert.equal(mapped.sl, 3230);
  assert.equal(mapped.tp, 3270);
});

test('mapPositionToItem clears explicit null SL/TP without letting sparse updates erase them', () => {
  const existing: PositionItem = {
    id: '50124',
    symbol: 'XAUUSD',
    side: 'buy',
    volume: 0.2,
    openPrice: 3245.5,
    currentPrice: 3248.1,
    pnl: 47.75,
    swap: 0,
    openTime: '2026-04-11T10:00:00.000Z',
    sl: 3230,
    tp: 3270,
  };

  const sparse = mapPositionToItem({ ticket: 50124, profit: 50 }, existing);
  assert.equal(sparse.sl, 3230);
  assert.equal(sparse.tp, 3270);

  const cleared = mapPositionToItem(
    { ticket: 50124, price_sl: null, price_tp: '' },
    existing,
  );
  assert.equal(cleared.sl, 0);
  assert.equal(cleared.tp, 0);
});

test('mapPositionToItem clears omitted protection only for authoritative rows', () => {
  const existing: PositionItem = {
    id: '50125',
    symbol: 'XAUUSD',
    side: 'sell',
    volume: 0.1,
    openPrice: 4140,
    currentPrice: 4139,
    pnl: 10,
    swap: 0,
    openTime: '2026-07-22T10:00:00.000Z',
    sl: 4150,
    tp: 4130,
  };

  const sparse = mapPositionToItem({ ticket: 50125, profit: 11 }, existing);
  assert.equal(sparse.sl, 4150);
  assert.equal(sparse.tp, 4130);

  const authoritative = mapPositionToItem(
    { ticket: 50125, symbol: 'XAUUSD', side: 'sell', profit: 11 },
    existing,
    { preserveMissingProtection: false },
  );
  assert.equal(authoritative.sl, 0);
  assert.equal(authoritative.tp, 0);
});

test('mapPositionToItem builds stable ids for fresh positions without random fallbacks', () => {
  const mapped = mapPositionToItem({
    symbol: 'EURUSD',
    side: 'sell',
    volume: 0.1,
    price_open: 1.135,
    price_current: 1.1335,
    profit: 15,
    time_create: 1775901600,
  });

  assert.equal(mapped.id, 'pos_EURUSD_sell_1775901600_0.1_1.135');
  assert.equal(mapped.symbol, 'EURUSD');
  assert.equal(mapped.side, 'sell');
  assert.equal(mapped.pnl, 15);
});

test('mapPositionToItem preserves broker symbol suffix identity and common live update aliases', () => {
  const mapped = mapPositionToItem({
    ticket: 801,
    symbol: 'XAUUSDm',
    side: 'BUY',
    volume: '0.2',
    open_price: '3245.5',
    current_price: '3249.8',
    pnl: '61.5',
    time_create: 1775901600,
  });

  assert.equal(mapped.id, '801');
  assert.equal(mapped.symbol, 'XAUUSDM');
  assert.equal(mapped.side, 'buy');
  assert.equal(mapped.openPrice, 3245.5);
  assert.equal(mapped.currentPrice, 3249.8);
  assert.equal(mapped.pnl, 61.5);
});

test('mapPositionToItem calculates net open-position pnl from profit swap and commission once', () => {
  const mapped = mapPositionToItem({
    ticket: 802,
    symbol: 'EURUSD',
    side: 'buy',
    volume: 0.1,
    price_open: 1.1,
    price_current: 1.101,
    profit: 10,
    swap: -1.25,
    commission: -0.5,
    time_create: 1775901600,
  });

  assert.equal(mapped.pnl, 8.25);
  assert.equal(mapped.swap, -1.25);
  assert.equal(mapped.commission, -0.5);
});

test('mapPositionToItem preserves existing swap and commission on profit-only updates', () => {
  const existing: PositionItem = {
    id: '803',
    symbol: 'EURUSD',
    side: 'buy',
    volume: 0.1,
    openPrice: 1.1,
    currentPrice: 1.101,
    pnl: 8.25,
    swap: -1.25,
    commission: -0.5,
    openTime: '2026-04-11T10:00:00.000Z',
  };

  const mapped = mapPositionToItem({ ticket: 803, profit: 12 }, existing);

  assert.equal(mapped.pnl, 10.25);
  assert.equal(mapped.swap, -1.25);
  assert.equal(mapped.commission, -0.5);
});

test('mapPositionToItem ignores undefined symbol sentinels in partial updates', () => {
  const existing: PositionItem = {
    id: '902',
    symbol: 'GBPUSD',
    side: 'sell',
    volume: 0.1,
    openPrice: 1.251,
    currentPrice: 1.248,
    pnl: 30,
    swap: 0,
    openTime: '2026-04-11T10:00:00.000Z',
  };

  const mapped = mapPositionToItem(
    {
      position_ticket: 902,
      symbol: 'undefined',
      profit: '31.5',
    },
    existing,
  );

  assert.equal(mapped.id, '902');
  assert.equal(mapped.symbol, 'GBPUSD');
  assert.equal(mapped.pnl, 31.5);
});

test('isRenderablePositionSymbol rejects placeholder symbol sentinels', () => {
  assert.equal(isRenderablePositionSymbol('UNKNOWN'), false);
  assert.equal(isRenderablePositionSymbol('UNKNOW'), false);
  assert.equal(isRenderablePositionSymbol('undefined'), false);
  assert.equal(isRenderablePositionSymbol('EURUSD'), true);
});
