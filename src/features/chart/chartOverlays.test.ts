import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyChartOpenPositionLabelPatches,
  buildChartOpenPositionLabelPatches,
  buildChartPositionStopDragKey,
  buildChartOverlayPayload,
  CHART_LINE_STYLE,
  formatTpSlOverlayLabel,
  LIVE_CHART_PNL_COLORS,
  normalizeChartOverlaySymbol,
  type ChartOverlayCandle,
} from './chartOverlays';
import { buildPendingOrderLines } from './chartOverlays/lineBuilders';
import type { LoginOrder } from '../../api/orders';
import { buildMergedPositions } from '../../state/positionsState.helpers';

const TEST_CHART_COLORS = {
  background: '#000000',
  foreground: '#94A3B8',
  grid: 'rgba(255,255,255,0.04)',
  candlesUptrend: '#2962FF',
  candlesDowntrend: '#EF5350',
  hollowBody: '#1E293B',
  barsUptrend: '#2962FF',
  barsDowntrend: '#EF5350',
  lineBody: '#2962FF',
  tradeOpen: '#2962FF',
  tradeTpSl: '#089981',
  tradeStopOut: '#DC2626',
} as const;

const candles: ChartOverlayCandle[] = Array.from({ length: 40 }, (_, index) => {
  const open = 1.1 + index * 0.001;
  const close = open + (index % 2 === 0 ? 0.0004 : -0.0002);
  return {
    time: 1_700_000_000 + index * 60,
    open,
    high: Math.max(open, close) + 0.0006,
    low: Math.min(open, close) - 0.0005,
    close,
    volume: 100 + index,
  };
});

const BOTH_SIDES = { buyTrade: true, sellTrade: true, slTpLevels: true } as const;
const NO_SIDES = { buyTrade: false, sellTrade: false, slTpLevels: false } as const;

test('normalizeChartOverlaySymbol strips broker suffix variants consistently', () => {
  // Separator-based suffixes
  assert.equal(normalizeChartOverlaySymbol('EURUSDm'), 'EURUSD');
  assert.equal(normalizeChartOverlaySymbol('EURUSD.c'), 'EURUSD');
  assert.equal(normalizeChartOverlaySymbol('xauusd_m'), 'XAUUSD');
  assert.equal(normalizeChartOverlaySymbol('GBP/USD'), 'GBPUSD');
  assert.equal(normalizeChartOverlaySymbol(' GBP / USD.c '), 'GBPUSD');

  // Concatenated broker suffixes (NO separator)
  assert.equal(normalizeChartOverlaySymbol('GBPUSDpro'), 'GBPUSD');
  assert.equal(normalizeChartOverlaySymbol('GBPUSDe'), 'GBPUSD');
  assert.equal(normalizeChartOverlaySymbol('GBPUSDstd'), 'GBPUSD');
  assert.equal(normalizeChartOverlaySymbol('GBPUSDmicro'), 'GBPUSD');
  assert.equal(normalizeChartOverlaySymbol('GBPUSDraw'), 'GBPUSD');
  assert.equal(normalizeChartOverlaySymbol('GBPUSDstp'), 'GBPUSD');
  assert.equal(normalizeChartOverlaySymbol('GBPUSDcent'), 'GBPUSD');
  assert.equal(normalizeChartOverlaySymbol('XAUUSDpro'), 'XAUUSD');
  assert.equal(normalizeChartOverlaySymbol('BTCUSDm'), 'BTCUSD');
  assert.equal(normalizeChartOverlaySymbol('BTCUSDpro'), 'BTCUSD');
  assert.equal(normalizeChartOverlaySymbol('US30m'), 'US30');
  assert.equal(normalizeChartOverlaySymbol('GER40m'), 'GER40');
  assert.equal(normalizeChartOverlaySymbol('USOILm'), 'USOIL');
  assert.equal(normalizeChartOverlaySymbol('SPX500pro'), 'SPX500');

  // Plain symbols (no suffix)
  assert.equal(normalizeChartOverlaySymbol('GBPUSD'), 'GBPUSD');
  assert.equal(normalizeChartOverlaySymbol('XAUUSD'), 'XAUUSD');
  assert.equal(normalizeChartOverlaySymbol('BTCUSD'), 'BTCUSD');
});

test('buildChartOverlayPayload maps open positions for the chart symbol with their SL/TP', () => {
  const input: Parameters<typeof buildChartOverlayPayload>[0] = {
    chartSymbol: 'EURUSD',
    candles,
    positions: [
      {
        id: '1',
        symbol: 'EURUSDm',
        side: 'buy',
        volume: 0.2,
        openPrice: 1.11111,
        currentPrice: 1.1185,
        pnl: 42,
        swap: 0,
        openTime: new Date(candles[5].time * 1000).toISOString(),
        sl: 1.106,
        tp: 1.124,
      },
      {
        id: '2',
        symbol: 'GBPUSD',
        side: 'sell',
        volume: 0.1,
        openPrice: 1.25,
        currentPrice: 1.24,
        pnl: 5,
        swap: 0,
        openTime: new Date(candles[6].time * 1000).toISOString(),
      },
    ],
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveAccount: null,
    showOnChart: BOTH_SIDES,
  };
  const payload = buildChartOverlayPayload({
    ...input,
    allowPositionStopDragging: true,
  });

  // Only the EURUSD position is in-symbol; the GBPUSD one is excluded.
  assert.deepEqual(
    payload.priceLines.map((line: any) => line.id).sort(),
    ['sl-1', 'open-1', 'tp-1'].sort(),
  );
  const openLine = payload.priceLines.find((line: any) => line.id === 'open-1');
  assert.equal(openLine?.lineWidth, 1);
  assert.equal(openLine?.lineStyle, CHART_LINE_STYLE.Dotted);
  assert.equal(openLine?.title, 'BUY 0.20, +42.000 USD');
  assert.equal(openLine?.color, TEST_CHART_COLORS.tradeOpen);
  assert.equal(openLine?.labelSideText, 'BUY 0.20');
  assert.equal(openLine?.labelValueText, '+42.000 USD');
  assert.equal(openLine?.labelSideColor, TEST_CHART_COLORS.tradeOpen);
  assert.equal(openLine?.labelValueColor, LIVE_CHART_PNL_COLORS.darkCanvas.profit);
  assert.equal(openLine?.labelPlacement, 'line');
  assert.equal(payload.priceLines.find((line: any) => line.id === 'tp-1')?.labelPlacement, 'line');
  assert.equal(payload.priceLines.find((line: any) => line.id === 'sl-1')?.labelPlacement, 'line');
  assert.equal(
    payload.priceLines.find((line: any) => line.id === 'tp-1')?.labelValueColor,
    TEST_CHART_COLORS.tradeTpSl,
  );
  assert.equal(
    payload.priceLines.find((line: any) => line.id === 'sl-1')?.labelValueColor,
    TEST_CHART_COLORS.tradeStopOut,
  );
  assert.equal(payload.priceLines.find((line: any) => line.id === 'tp-1')?.dragKey, buildChartPositionStopDragKey('1', 'tp'));
  assert.equal(payload.priceLines.find((line: any) => line.id === 'sl-1')?.dragKey, buildChartPositionStopDragKey('1', 'sl'));
  assert.equal(payload.markers.length, 1);
  assert.equal(payload.markers[0].price, 1.11111);
  assert.equal(payload.markers[0].shape, 'arrowUp');

  const lockedPayload = buildChartOverlayPayload(input);
  assert.equal(
    lockedPayload.priceLines.find((line: any) => line.id === 'tp-1')?.dragKey,
    undefined,
  );
  assert.equal(
    lockedPayload.priceLines.find((line: any) => line.id === 'sl-1')?.dragKey,
    undefined,
  );
});

test('SL/TP projected labels use the position side instead of assuming every SL loses', () => {
  assert.equal(
    formatTpSlOverlayLabel('sl', 'XAUUSD', 'buy', 4053.25, 4057.76, 0.01),
    'SL, + 4.51 USD, 451 points',
  );
  assert.equal(
    formatTpSlOverlayLabel('sl', 'XAUUSD', 'buy', 4053.25, 4048.74, 0.01),
    'SL, - 4.51 USD, 451 points',
  );
  assert.equal(
    formatTpSlOverlayLabel('sl', 'XAUUSD', 'sell', 4053.25, 4048.74, 0.01),
    'SL, + 4.51 USD, 451 points',
  );
  assert.equal(
    formatTpSlOverlayLabel('sl', 'XAUUSD', 'sell', 4053.25, 4057.76, 0.01),
    'SL, - 4.51 USD, 451 points',
  );
});

test('SL/TP protection colors stay type-owned when their projected P/L signs are inverted', () => {
  const payload = buildChartOverlayPayload({
    chartSymbol: 'XAUUSD',
    candles,
    positions: [
      {
        id: 'inverted-protection',
        symbol: 'XAUUSD',
        side: 'buy',
        volume: 0.01,
        openPrice: 4053.25,
        currentPrice: 4053.25,
        pnl: 0,
        swap: 0,
        openTime: new Date(candles[5].time * 1000).toISOString(),
        // Deliberately invert the usual price relationship to prove that the
        // signed value remains financial while the color remains semantic.
        sl: 4057.76,
        tp: 4048.74,
      },
    ],
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveAccount: null,
    showOnChart: BOTH_SIDES,
  });

  const slLine = payload.priceLines.find((line) => line.id === 'sl-inverted-protection');
  const tpLine = payload.priceLines.find((line) => line.id === 'tp-inverted-protection');

  assert.equal(slLine?.labelValueText, '+ 4.51 USD, 451 points');
  assert.equal(slLine?.color, TEST_CHART_COLORS.tradeStopOut);
  assert.equal(slLine?.labelSideColor, TEST_CHART_COLORS.tradeStopOut);
  assert.equal(slLine?.labelValueColor, TEST_CHART_COLORS.tradeStopOut);

  assert.equal(tpLine?.labelValueText, '- 4.51 USD, 451 points');
  assert.equal(tpLine?.color, TEST_CHART_COLORS.tradeTpSl);
  assert.equal(tpLine?.labelSideColor, TEST_CHART_COLORS.tradeTpSl);
  assert.equal(tpLine?.labelValueColor, TEST_CHART_COLORS.tradeTpSl);
});

test('buildPendingOrderLines anchors pending SL, TP, and stop-limit labels to visible guide lines', () => {
  const lines = buildPendingOrderLines(
    [
      {
        ticket: 77,
        account_login: 10001,
        symbol: 'XAUUSD',
        type: 'buy_stop_limit',
        side: 'buy',
        volume: 0.1,
        price_open: 4150.1,
        stopLimitPrice: 4148.9,
        price_sl: 4142.5,
        price_tp: 4161.8,
        status: 'placed',
        comment: '',
        time_setup: 1_700_000_000,
        time_done: 0,
      } satisfies LoginOrder,
    ],
    TEST_CHART_COLORS,
    '#EF5350',
  );

  const stopLimitLine = lines.find((line) => line.id === 'order-stop-limit-77');
  assert.equal(stopLimitLine?.price, 4148.9);
  assert.equal(stopLimitLine?.title, 'BUY STOP LIMIT 0.10');
  assert.equal(stopLimitLine?.labelPlacement, 'line');
  assert.equal(lines.find((line) => line.id === 'order-tp-77')?.labelPlacement, 'line');
  assert.equal(lines.find((line) => line.id === 'order-sl-77')?.labelPlacement, 'line');
});

test('buildChartOverlayPayload drops a position and its SL/TP once it is no longer active', () => {
  const openPosition = {
    id: 'hit-501',
    symbol: 'EURUSD',
    side: 'buy' as const,
    volume: 0.1,
    openPrice: 1.111,
    currentPrice: 1.116,
    pnl: 50,
    swap: 0,
    openTime: new Date(candles[5].time * 1000).toISOString(),
    sl: 1.106,
    tp: 1.116,
  };

  const beforeHit = buildChartOverlayPayload({
    chartSymbol: 'EURUSD',
    candles,
    positions: [openPosition],
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveAccount: null,
    showOnChart: BOTH_SIDES,
  });

  assert.deepEqual(
    beforeHit.priceLines.map((line: any) => line.id).sort(),
    ['open-hit-501', 'sl-hit-501', 'tp-hit-501'].sort(),
  );

  const afterHit = buildChartOverlayPayload({
    chartSymbol: 'EURUSD',
    candles,
    positions: [],
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveAccount: null,
    showOnChart: BOTH_SIDES,
  });

  assert.deepEqual(afterHit.priceLines, []);
  assert.deepEqual(afterHit.markers, []);
});

test('an exact SL or TP hit removes the full matching overlay while preserving a peer position', () => {
  const hitPosition = {
    id: 'hit-601',
    symbol: 'EURUSD',
    side: 'buy' as const,
    volume: 0.1,
    openPrice: 1.111,
    currentPrice: 1.114,
    pnl: 30,
    swap: 0,
    openTime: new Date(candles[5].time * 1000).toISOString(),
    sl: 1.106,
    tp: 1.116,
  };
  const peerPosition = {
    ...hitPosition,
    id: 'peer-602',
    openPrice: 1.112,
    sl: 1.107,
    tp: 1.117,
  };

  for (const event of ['position.sl_hit', 'position.tp_hit']) {
    const remainingPositions = buildMergedPositions(
      [hitPosition, peerPosition],
      [{ ticket: hitPosition.id, event }],
      { preserveMissingExisting: true },
    );
    const payload = buildChartOverlayPayload({
      chartSymbol: 'EURUSD',
      candles,
      positions: remainingPositions,
      colors: TEST_CHART_COLORS,
      sellColor: '#EF5350',
      liveAccount: null,
      showOnChart: BOTH_SIDES,
    });
    const lineIds = payload.priceLines.map((line) => line.id).sort();

    assert.deepEqual(remainingPositions.map((position) => position.id), [peerPosition.id], event);
    assert.deepEqual(
      lineIds,
      [`open-${peerPosition.id}`, `sl-${peerPosition.id}`, `tp-${peerPosition.id}`].sort(),
      event,
    );
  }
});

test('buildChartOverlayPayload updates open position labels from live bid and ask prices', () => {
  const payload = buildChartOverlayPayload({
    chartSymbol: 'BTCUSD',
    candles,
    positions: [
      {
        id: 'buy-live',
        symbol: 'BTCUSD',
        side: 'buy',
        volume: 0.01,
        openPrice: 61000,
        currentPrice: 61000,
        pnl: -999,
        swap: -0.01,
        commission: -0.02,
        openTime: new Date(candles[5].time * 1000).toISOString(),
      },
      {
        id: 'buy-loss-live',
        symbol: 'BTCUSD',
        side: 'buy',
        volume: 0.01,
        openPrice: 61030,
        currentPrice: 61030,
        pnl: 999,
        swap: 0,
        commission: 0,
        openTime: new Date(candles[7].time * 1000).toISOString(),
      },
      {
        id: 'sell-live',
        symbol: 'BTCUSDm',
        side: 'sell',
        volume: 0.02,
        openPrice: 61020,
        currentPrice: 61020,
        pnl: -999,
        swap: 0,
        commission: 0,
        openTime: new Date(candles[6].time * 1000).toISOString(),
      },
    ],
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveBid: 61025.3,
    liveAsk: 60950,
    liveAccount: null,
    showOnChart: BOTH_SIDES,
  });

  const titleById = new Map(payload.priceLines.map((line: any) => [line.id, line.title]));
  const colorById = new Map(payload.priceLines.map((line: any) => [line.id, line.color]));
  const sideTextById = new Map(payload.priceLines.map((line: any) => [line.id, line.labelSideText]));
  const valueTextById = new Map(payload.priceLines.map((line: any) => [line.id, line.labelValueText]));
  const valueColorById = new Map(payload.priceLines.map((line: any) => [line.id, line.labelValueColor]));

  assert.equal(titleById.get('open-buy-live'), 'BUY 0.01, +0.22300 USD');
  assert.equal(colorById.get('open-buy-live'), TEST_CHART_COLORS.tradeOpen);
  assert.equal(sideTextById.get('open-buy-live'), 'BUY 0.01');
  assert.equal(valueTextById.get('open-buy-live'), '+0.22300 USD');
  assert.equal(valueColorById.get('open-buy-live'), LIVE_CHART_PNL_COLORS.darkCanvas.profit);
  assert.equal(titleById.get('open-buy-loss-live'), 'BUY 0.01, -0.04700 USD');
  assert.equal(colorById.get('open-buy-loss-live'), TEST_CHART_COLORS.tradeOpen);
  assert.equal(valueTextById.get('open-buy-loss-live'), '-0.04700 USD');
  assert.equal(valueColorById.get('open-buy-loss-live'), LIVE_CHART_PNL_COLORS.darkCanvas.loss);
  assert.equal(titleById.get('open-sell-live'), 'SELL 0.02, +1.4000 USD');
  assert.equal(colorById.get('open-sell-live'), '#EF5350');
  assert.equal(sideTextById.get('open-sell-live'), 'SELL 0.02');
  assert.equal(valueTextById.get('open-sell-live'), '+1.4000 USD');
  assert.equal(valueColorById.get('open-sell-live'), LIVE_CHART_PNL_COLORS.darkCanvas.profit);
});

test('per-tick open-position patches update only label values and preserve line geometry', () => {
  const positions = [
    {
      id: 'buy-tick',
      symbol: 'BTCUSD',
      side: 'buy' as const,
      volume: 0.01,
      openPrice: 61000,
      currentPrice: 61000,
      pnl: 0,
      swap: 0,
      commission: 0,
      openTime: new Date(candles[5].time * 1000).toISOString(),
    },
    {
      id: 'sell-tick',
      symbol: 'BTCUSDm',
      side: 'sell' as const,
      volume: 0.02,
      openPrice: 61020,
      currentPrice: 61020,
      pnl: 0,
      swap: 0,
      commission: 0,
      openTime: new Date(candles[6].time * 1000).toISOString(),
    },
  ];
  const basePayload = buildChartOverlayPayload({
    chartSymbol: 'BTCUSD',
    candles,
    positions,
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveBid: 61000,
    liveAsk: 61020,
    liveAccount: null,
    showOnChart: BOTH_SIDES,
  });
  const geometryBefore = basePayload.priceLines.map((line) => ({
    id: line.id,
    price: line.price,
    color: line.color,
    lineWidth: line.lineWidth,
    lineStyle: line.lineStyle,
    labelPlacement: line.labelPlacement,
    labelSideText: line.labelSideText,
    labelSideColor: line.labelSideColor,
  }));

  const firstPayload = applyChartOpenPositionLabelPatches(
    basePayload,
    buildChartOpenPositionLabelPatches({
      chartSymbol: 'BTCUSD',
      positions,
      colors: TEST_CHART_COLORS,
      sellColor: '#EF5350',
      liveBid: 61010,
      liveAsk: 61010,
      liveQuote: { bid: 61010, ask: 61010, lastReceivedAt: Date.now() },
      showOnChart: BOTH_SIDES,
    }),
  );
  const secondPayload = applyChartOpenPositionLabelPatches(
    firstPayload,
    buildChartOpenPositionLabelPatches({
      chartSymbol: 'BTCUSD',
      positions,
      colors: TEST_CHART_COLORS,
      sellColor: '#EF5350',
      liveBid: 60990,
      liveAsk: 61030,
      liveQuote: { bid: 60990, ask: 61030, lastReceivedAt: Date.now() },
      showOnChart: BOTH_SIDES,
    }),
  );

  assert.equal(firstPayload.priceLines.find((line) => line.id === 'open-buy-tick')?.labelValueText, '+0.10000 USD');
  assert.equal(firstPayload.priceLines.find((line) => line.id === 'open-sell-tick')?.labelValueText, '+0.20000 USD');
  assert.equal(secondPayload.priceLines.find((line) => line.id === 'open-buy-tick')?.labelValueText, '-0.10000 USD');
  assert.equal(secondPayload.priceLines.find((line) => line.id === 'open-sell-tick')?.labelValueText, '-0.20000 USD');
  for (const line of firstPayload.priceLines) {
    assert.equal(line.labelValueColor, LIVE_CHART_PNL_COLORS.darkCanvas.profit);
  }
  for (const line of secondPayload.priceLines) {
    assert.equal(line.labelValueColor, LIVE_CHART_PNL_COLORS.darkCanvas.loss);
  }
  assert.deepEqual(
    secondPayload.priceLines.map((line) => ({
      id: line.id,
      price: line.price,
      color: line.color,
      lineWidth: line.lineWidth,
      lineStyle: line.lineStyle,
      labelPlacement: line.labelPlacement,
      labelSideText: line.labelSideText,
      labelSideColor: line.labelSideColor,
    })),
    geometryBefore,
  );
  assert.equal(secondPayload.markers, basePayload.markers);
});

test('per-tick chart labels reuse the Trade row calibrated PnL and precision', () => {
  const position = {
    id: 'calibrated-tick',
    symbol: 'EURUSD',
    side: 'buy' as const,
    volume: 0.1,
    openPrice: 1.1,
    currentPrice: 1.101,
    pnl: 12.5,
    swap: -0.25,
    commission: -0.1,
    openTime: new Date(candles[5].time * 1000).toISOString(),
  };

  const [patch] = buildChartOpenPositionLabelPatches({
    chartSymbol: 'EURUSD',
    positions: [position],
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveBid: 1.102,
    liveAsk: 1.10215,
    liveQuote: {
      bid: 1.102,
      ask: 1.10215,
      lastReceivedAt: Date.now(),
      contractSize: 100000,
    },
    showOnChart: BOTH_SIDES,
  });

  assert.equal(patch?.labelValueText, '+25.350 USD');
  assert.equal(patch?.title, 'BUY 0.10, +25.350 USD');
});

test('cold or stale chart labels use the same position snapshot fallback as Trade', () => {
  const payload = buildChartOverlayPayload({
    chartSymbol: 'EURUSD',
    candles,
    positions: [{
      id: 'stale-fallback',
      symbol: 'EURUSD',
      side: 'buy',
      volume: 0.1,
      openPrice: 1.1,
      currentPrice: 1.101,
      pnl: 12.5,
      swap: -0.25,
      commission: -0.1,
      openTime: new Date(candles[5].time * 1000).toISOString(),
    }],
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveBid: 9,
    liveAsk: 10,
    liveQuote: { bid: 9, ask: 10, lastReceivedAt: 1 },
    liveAccount: null,
    showOnChart: BOTH_SIDES,
  });

  const line = payload.priceLines.find((item) => item.id === 'open-stale-fallback');
  assert.equal(line?.labelValueText, '+12.500 USD');
  assert.equal(line?.title, 'BUY 0.10, +12.500 USD');
});

test('buildChartOverlayPayload does not substitute bid for a missing sell-side ask', () => {
  const payload = buildChartOverlayPayload({
    chartSymbol: 'GBPUSD',
    candles,
    positions: [
      {
        id: 'sell-one-sided',
        symbol: 'GBPUSD',
        side: 'sell',
        volume: 0.1,
        openPrice: 1.2,
        currentPrice: 1.2,
        pnl: -999,
        swap: 0,
        commission: 0,
        openTime: new Date(candles[8].time * 1000).toISOString(),
      },
    ],
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveBid: 1.199,
    liveAccount: null,
    showOnChart: BOTH_SIDES,
  });

  const openLine = payload.priceLines.find((line: any) => line.id === 'open-sell-one-sided');
  assert.equal(openLine?.title, 'SELL 0.10, +0.00000 USD');
  assert.equal(openLine?.color, '#EF5350');
  assert.equal(openLine?.labelSideColor, '#EF5350');
  assert.equal(openLine?.labelValueColor, '#EF5350');
});

test('buildChartOverlayPayload filters open trades by side via the buy/sell toggles', () => {
  const positions = [
    {
      id: 'buy-1',
      symbol: 'EURUSD',
      side: 'buy' as const,
      volume: 0.1,
      openPrice: 1.11,
      currentPrice: 1.115,
      pnl: 10,
      swap: 0,
      openTime: new Date(candles[5].time * 1000).toISOString(),
    },
    {
      id: 'sell-1',
      symbol: 'EURUSDm',
      side: 'sell' as const,
      volume: 0.1,
      openPrice: 1.12,
      currentPrice: 1.115,
      pnl: 10,
      swap: 0,
      openTime: new Date(candles[6].time * 1000).toISOString(),
    },
  ];

  const buyOnly = buildChartOverlayPayload({
    chartSymbol: 'EURUSD',
    candles,
    positions,
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveAccount: null,
    showOnChart: { buyTrade: true, sellTrade: false, slTpLevels: true },
  });
  assert.deepEqual(
    buyOnly.priceLines.map((line: any) => line.id),
    ['open-buy-1'],
  );

  const sellOnly = buildChartOverlayPayload({
    chartSymbol: 'EURUSD',
    candles,
    positions,
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveAccount: null,
    showOnChart: { buyTrade: false, sellTrade: true, slTpLevels: true },
  });
  assert.deepEqual(
    sellOnly.priceLines.map((line: any) => line.id),
    ['open-sell-1'],
  );

  const both = buildChartOverlayPayload({
    chartSymbol: 'EURUSD',
    candles,
    positions,
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveAccount: null,
    showOnChart: BOTH_SIDES,
  });
  assert.deepEqual(
    both.priceLines.map((line: any) => line.id).sort(),
    ['open-buy-1', 'open-sell-1'].sort(),
  );
});

test('buildChartOverlayPayload still renders pattern markers from the drawing tool regardless of trade toggles', () => {
  const patternCandles = candles.map((candle, index) => ({
    ...candle,
    close: candle.open + index * 0.0003,
    high: candle.open + index * 0.0003 + 0.0007,
    low: candle.open + index * 0.0003 - 0.0008,
  }));
  patternCandles[6] = {
    ...patternCandles[6],
    open: 1.204,
    close: 1.2044,
    high: 1.20445,
    low: 1.203,
  };

  const payload = buildChartOverlayPayload({
    chartSymbol: 'EURUSD',
    candles: patternCandles,
    positions: [],
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveAccount: null,
    showOnChart: NO_SIDES,
    activeTool: 'patterns',
  });

  assert.equal(payload.priceLines.length, 0);
  assert.ok(payload.markers.some((marker: any) => marker.id.startsWith('pattern-')));
});

test('buildChartOverlayPayload returns one shared empty payload when trade sides and history are disabled', () => {
  const baseInput = {
    chartSymbol: 'BTCUSD',
    candles,
    positions: [
      {
        id: '1',
        symbol: 'BTCUSD',
        side: 'buy' as const,
        volume: 0.1,
        openPrice: 71234.5,
        currentPrice: 71300,
        pnl: 6.5,
        swap: 0,
        openTime: new Date(candles[5].time * 1000).toISOString(),
      },
    ],
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveAccount: null,
    showOnChart: NO_SIDES,
    showTradeHistory: false,
  };

  const payloadA = buildChartOverlayPayload(baseInput);
  const payloadB = buildChartOverlayPayload({
    ...baseInput,
    candles: candles.slice(0, 10),
  });

  assert.equal(payloadA, payloadB);
  assert.deepEqual(payloadA, { priceLines: [], markers: [], tradeHistorySegments: [] });
});

test('buildChartOverlayPayload shows or hides trades directly from the buy/sell toggles', () => {
  const baseInput = {
    chartSymbol: 'EURUSD',
    candles,
    positions: [
      {
        id: '1',
        symbol: 'EURUSDm',
        side: 'buy' as const,
        volume: 0.2,
        openPrice: 1.11111,
        currentPrice: 1.1185,
        pnl: 42,
        swap: 0,
        openTime: new Date(candles[5].time * 1000).toISOString(),
        sl: 1.106,
        tp: 1.124,
      },
    ],
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveAccount: null,
    showOnChart: NO_SIDES,
  };

  const visiblePayload = buildChartOverlayPayload({
    ...baseInput,
    showOnChart: BOTH_SIDES,
  });
  const hiddenPayload = buildChartOverlayPayload({
    ...baseInput,
    showOnChart: NO_SIDES,
  });

  assert.deepEqual(
    visiblePayload.priceLines.map((line: any) => line.id).sort(),
    ['open-1', 'sl-1', 'tp-1'].sort(),
  );
  assert.equal(hiddenPayload.priceLines.length, 0);
});

test('buildChartOverlayPayload hides SL/TP levels while keeping visible trade entries', () => {
  const payload = buildChartOverlayPayload({
    chartSymbol: 'EURUSD',
    candles,
    positions: [
      {
        id: 'sltp-filter',
        symbol: 'EURUSDm',
        side: 'buy',
        volume: 0.2,
        openPrice: 1.11111,
        currentPrice: 1.1185,
        pnl: 42,
        swap: 0,
        openTime: new Date(candles[5].time * 1000).toISOString(),
        sl: 1.106,
        tp: 1.124,
      },
    ],
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveAccount: null,
    showOnChart: { buyTrade: true, sellTrade: true, slTpLevels: false },
  });

  assert.deepEqual(payload.priceLines.map((line: any) => line.id), ['open-sltp-filter']);
});

test('buildChartOverlayPayload matches all open positions across slash and suffix symbol variants', () => {
  const payload = buildChartOverlayPayload({
    chartSymbol: 'GBPUSD',
    candles,
    positions: [
      {
        id: '1',
        symbol: 'GBP/USD',
        side: 'sell',
        volume: 0.1,
        openPrice: 1.34198,
        currentPrice: 1.34449,
        pnl: -25.1,
        swap: 0,
        openTime: new Date(candles[5].time * 1000).toISOString(),
        sl: 1.33,
        tp: 1.35,
      },
      {
        id: '2',
        symbol: 'GBPUSDm',
        side: 'buy',
        volume: 0.2,
        openPrice: 1.34266,
        currentPrice: 1.34442,
        pnl: 35.2,
        swap: 0,
        openTime: new Date(candles[6].time * 1000).toISOString(),
      },
    ],
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveAccount: null,
    showOnChart: BOTH_SIDES,
  });

  assert.deepEqual(
    payload.priceLines.map((line: any) => line.id).sort(),
    ['open-1', 'open-2', 'sl-1', 'tp-1'].sort(),
  );
});

test('buildChartOverlayPayload keeps each stacked open position line visible', () => {
  const payload = buildChartOverlayPayload({
    chartSymbol: 'GBPUSD',
    candles,
    positions: Array.from({ length: 10 }, (_unused, index) => ({
      id: `stack-${index + 1}`,
      symbol: 'GBPUSD',
      side: 'buy' as const,
      volume: 0.01,
      openPrice: 1.34266,
      currentPrice: 1.3533,
      pnl: index + 1,
      swap: 0,
      openTime: new Date(candles[(index % 2) + 5].time * 1000).toISOString(),
    })),
    colors: TEST_CHART_COLORS,
    sellColor: '#EF5350',
    liveAccount: null,
    showOnChart: BOTH_SIDES,
  });

  const stackedLines = payload.priceLines.filter(
    (line: any) => line.id.startsWith('open-') && line.price === 1.34266,
  );
  // MT5-parity: rapid same-price entries remain visible as concentrated
  // labels/lines instead of being hidden by de-duping.
  assert.equal(stackedLines.length, 10);
  assert.equal(new Set(stackedLines.map((line: any) => line.id)).size, 10);
  assert.ok(stackedLines.every((line: any) => line.axisLabelVisible === false));
  assert.ok(stackedLines.every((line: any) => line.labelPlacement === 'line'));
});
