import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { buildChartOverlayPayload } from './buildPayload';
import { buildChartTradeHistoryOverlay } from './tradeHistory';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const candles = [
  { time: 1_700_000_000, open: 1, high: 2, low: 0.5, close: 1.5 },
  { time: 1_700_000_060, open: 1.5, high: 2.1, low: 1.4, close: 2 },
];

const closedBuy = {
  ticket: 7,
  account_login: 1,
  symbol: 'EURUSD',
  side: 'buy' as const,
  volume: 0.2,
  price_open: 1.2,
  price_close: 1.18,
  profit: -4,
  swap: 0,
  time_create: 1_700_000_010,
  time_update: 1_700_000_070,
  time_close: 1_700_000_070,
};

test('overlay payload wires exact trade-history arrows and finite connector segments', () => {
  const source = readSource('src/features/chart/chartOverlays/buildPayload.ts');
  assert.match(source, /buildChartTradeHistoryOverlay/);
  assert.match(source, /const needsTradeHistory =/);
  assert.match(source, /tradeHistorySegments: historyOverlay\.tradeHistorySegments/);
  assert.match(source, /showTradeHistory && \(positions\.length > 0 \|\| closedPositions\.length > 0 \|\| deals\.length > 0\)/);
});

test('closed-position fallback produces exact buy-entry and sell-exit arrows plus one connector', () => {
  const overlay = buildChartTradeHistoryOverlay({
    chartSymbol: 'EURUSD',
    chartTimeframe: 'M1',
    candles,
    closedPositions: [closedBuy],
    buyColor: '#2962FF',
    sellColor: '#F23645',
  });

  assert.equal(overlay.markers.length, 2);
  assert.deepEqual(
    overlay.markers.map((marker) => ({
      time: marker.time,
      price: marker.price,
      position: marker.position,
      shape: marker.shape,
      color: marker.color,
    })),
    [
      {
        time: 1_700_000_000,
        price: 1.2,
        position: 'atPriceBottom',
        shape: 'arrowUp',
        color: '#2962FF',
      },
      {
        time: 1_700_000_060,
        price: 1.18,
        position: 'atPriceTop',
        shape: 'arrowDown',
        color: '#F23645',
      },
    ],
  );
  assert.deepEqual(overlay.tradeHistorySegments.map((segment) => ({
    fromTime: segment.fromTime,
    fromPrice: segment.fromPrice,
    toTime: segment.toTime,
    toPrice: segment.toPrice,
    color: segment.color,
  })), [{
    fromTime: 1_700_000_000,
    fromPrice: 1.2,
    toTime: 1_700_000_060,
    toPrice: 1.18,
    color: '#2962FF',
  }]);
});

test('trade history toggle is independent from open Buy/Sell visibility', () => {
  const baseInput: Parameters<typeof buildChartOverlayPayload>[0] = {
    chartSymbol: 'EURUSD',
    chartTimeframe: 'M1',
    candles,
    positions: [],
    closedPositions: [closedBuy],
    colors: {
      tradeOpen: '#2962FF',
      tradeTpSl: '#089981',
      tradeStopOut: '#F23645',
    } as any,
    sellColor: '#F23645',
    showOnChart: { buyTrade: false, sellTrade: false, slTpLevels: false },
  };

  const visible = buildChartOverlayPayload({ ...baseInput, showTradeHistory: true });
  assert.equal(visible.markers.length, 2);
  assert.equal(visible.tradeHistorySegments.length, 1);

  const hidden = buildChartOverlayPayload({ ...baseInput, showTradeHistory: false });
  assert.deepEqual(hidden.markers, []);
  assert.deepEqual(hidden.tradeHistorySegments, []);
});

test('trade history toggle hides a still-open arrow as well as completed arrows and connectors', () => {
  const baseInput: Parameters<typeof buildChartOverlayPayload>[0] = {
    chartSymbol: 'EURUSD',
    chartTimeframe: 'M1',
    candles,
    positions: [{
      id: '9',
      symbol: 'EURUSD',
      side: 'sell',
      volume: 0.1,
      openPrice: 1.19,
      currentPrice: 1.18,
      pnl: 1,
      swap: 0,
      openTime: new Date(1_700_000_010 * 1_000).toISOString(),
    }],
    colors: {
      tradeOpen: '#2962FF',
      tradeTpSl: '#089981',
      tradeStopOut: '#F23645',
    } as any,
    sellColor: '#F23645',
    showOnChart: { buyTrade: false, sellTrade: false, slTpLevels: false },
  };

  const visible = buildChartOverlayPayload({ ...baseInput, showTradeHistory: true });
  assert.equal(visible.markers.length, 1);
  assert.deepEqual(visible.tradeHistorySegments, []);

  const hidden = buildChartOverlayPayload({ ...baseInput, showTradeHistory: false });
  assert.deepEqual(hidden, { priceLines: [], markers: [], tradeHistorySegments: [] });
});
