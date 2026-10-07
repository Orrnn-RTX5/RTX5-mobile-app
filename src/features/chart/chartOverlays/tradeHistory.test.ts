import assert from 'node:assert/strict';
import test from 'node:test';
import type { Deal } from '../../../api/deals';
import type { ClosedPosition } from '../../../api/positions';
import {
  SUPPORTED_TIMEFRAMES,
  getBucketStart,
  getExpectedNextCandleTime,
} from '../../../domain/candles/core/timeframeUtils';
import type { ChartOverlayCandle } from './types';
import { buildChartTradeHistoryOverlay } from './tradeHistory';

const BASE = 1_800_000_000;
const BUY_COLOR = '#2563EB';
const SELL_COLOR = '#EF4444';

const candle = (time: number): ChartOverlayCandle => ({
  time,
  open: 1.1,
  high: 1.2,
  low: 1,
  close: 1.15,
});

const deal = (overrides: Partial<Deal>): Deal => ({
  ticket: 1,
  order_ticket: 1,
  position_ticket: 100,
  account_login: 200156,
  symbol: 'EURUSD',
  action: 'deal_buy',
  entry: 'entry_in',
  volume: 1,
  price: 1.1,
  profit: 0,
  swap: 0,
  commission: 0,
  fee: 0,
  magic: 0,
  comment: '',
  time: BASE + 5,
  ...overrides,
});

const closedPosition = (overrides: Partial<ClosedPosition>): ClosedPosition => ({
  ticket: 100,
  account_login: 200156,
  symbol: 'EURUSD',
  side: 'buy',
  volume: 1,
  price_open: 1.1,
  price_close: 1.2,
  profit: 10,
  swap: 0,
  time_create: BASE + 5,
  time_update: BASE + 65,
  time_close: BASE + 65,
  ...overrides,
});

const build = (
  overrides: Partial<Parameters<typeof buildChartTradeHistoryOverlay>[0]> = {},
) => buildChartTradeHistoryOverlay({
  chartSymbol: 'EURUSD',
  chartTimeframe: 'M1',
  candles: [candle(BASE), candle(BASE + 60), candle(BASE + 120)],
  deals: [],
  closedPositions: [],
  buyColor: BUY_COLOR,
  sellColor: SELL_COLOR,
  ...overrides,
});

test('atomic buy deal uses exact prices, execution-side arrows, and opening-side segment color', () => {
  const result = build({
    deals: [
      deal({ ticket: 11, position_ticket: 501, time: BASE + 5, price: 1.10101 }),
      deal({
        ticket: 12,
        position_ticket: 501,
        action: 'deal_sell',
        entry: 'entry_out',
        time: (BASE + 125) * 1_000,
        price: 1.10222,
      }),
    ],
  });

  assert.deepEqual(result.markers, [
    {
      id: 'trade-history-open-deal-11',
      time: BASE,
      price: 1.10101,
      position: 'atPriceBottom',
      shape: 'arrowUp',
      color: BUY_COLOR,
      size: 2,
    },
    {
      id: 'trade-history-close-deal-12',
      time: BASE + 120,
      price: 1.10222,
      position: 'atPriceTop',
      shape: 'arrowDown',
      color: SELL_COLOR,
      size: 2,
    },
  ]);
  assert.deepEqual(result.tradeHistorySegments, [{
    id: 'trade-history-segment-deal-11-deal-12',
    fromTime: BASE,
    fromPrice: 1.10101,
    toTime: BASE + 120,
    toPrice: 1.10222,
    color: BUY_COLOR,
    lineWidth: 1.5,
  }]);
});

test('an entry arrow appears before close, then remains while close arrow and connector are added', () => {
  const openingDeal = deal({
    ticket: 13,
    position_ticket: 502,
    action: 'deal_sell',
    entry: 'entry_in',
    time: BASE + 5,
    price: 1.1042,
  });
  const opened = build({ deals: [openingDeal] });

  assert.equal(opened.markers.length, 1);
  assert.deepEqual(opened.tradeHistorySegments, []);
  assert.deepEqual(opened.markers[0], {
    id: 'trade-history-open-deal-13',
    time: BASE,
    price: 1.1042,
    position: 'atPriceTop',
    shape: 'arrowDown',
    color: SELL_COLOR,
    size: 2,
  });

  const closed = build({
    deals: [
      openingDeal,
      deal({
        ticket: 14,
        position_ticket: 502,
        action: 'deal_buy',
        entry: 'entry_out',
        time: BASE + 65,
        price: 1.1028,
      }),
    ],
  });

  assert.deepEqual(
    closed.markers.find((marker) => marker.id === opened.markers[0].id),
    opened.markers[0],
    'closing must keep the exact opening arrow instead of replacing or moving it',
  );
  assert.equal(closed.markers.length, 2);
  assert.equal(closed.markers.find((marker) => marker.id.endsWith('14'))?.price, 1.1028);
  assert.equal(closed.tradeHistorySegments.length, 1);
  assert.equal(closed.tradeHistorySegments[0].lineWidth, 1.5);
});

test('still-open and completed trades map correctly on every supported timeframe', () => {
  SUPPORTED_TIMEFRAMES.forEach((timeframe, index) => {
    const bucketStart = getBucketStart(BASE + index * 12_345, timeframe);
    assert.notEqual(bucketStart, null, timeframe);
    const nextBucketStart = getExpectedNextCandleTime(bucketStart!, timeframe);
    const openExecution = deal({
      ticket: 100 + index * 2,
      position_ticket: 700 + index,
      time: bucketStart! + 5,
      price: 1.1 + index / 10_000,
    });
    const closeExecution = deal({
      ticket: 101 + index * 2,
      position_ticket: 700 + index,
      action: 'deal_sell',
      entry: 'entry_out',
      time: nextBucketStart + 5,
      price: 1.2 + index / 10_000,
    });
    const timeframeInput = {
      chartTimeframe: timeframe,
      candles: [candle(bucketStart!), candle(nextBucketStart)],
    };

    const opened = build({ ...timeframeInput, deals: [openExecution] });
    assert.equal(opened.markers.length, 1, `${timeframe} open arrow`);
    assert.equal(opened.markers[0].time, bucketStart, `${timeframe} open candle`);
    assert.equal(opened.tradeHistorySegments.length, 0, `${timeframe} open connector`);

    const closed = build({ ...timeframeInput, deals: [openExecution, closeExecution] });
    assert.equal(closed.markers.length, 2, `${timeframe} completed arrows`);
    assert.equal(
      closed.markers.find((marker) => marker.id.endsWith(String(closeExecution.ticket)))?.time,
      nextBucketStart,
      `${timeframe} close candle`,
    );
    assert.equal(closed.tradeHistorySegments.length, 1, `${timeframe} connector`);
  });
});

test('currently-open position supplies the entry arrow while deal history is still delayed', () => {
  const result = build({
    openPositions: [{
      id: '503',
      symbol: 'EURUSDm',
      side: 'buy',
      volume: 0.1,
      openPrice: 1.1065,
      openTime: new Date((BASE + 5) * 1_000).toISOString(),
    }],
  });

  assert.equal(result.markers.length, 1);
  assert.equal(result.markers[0].time, BASE);
  assert.equal(result.markers[0].price, 1.1065);
  assert.equal(result.markers[0].shape, 'arrowUp');
  assert.deepEqual(result.tradeHistorySegments, []);
});

test('atomic opening deal replaces the matching open-position fallback without duplication', () => {
  const result = build({
    openPositions: [{
      id: '504',
      symbol: 'EURUSD',
      side: 'sell',
      volume: 0.1,
      openPrice: 1.1071,
      openTime: new Date((BASE + 6) * 1_000).toISOString(),
    }],
    deals: [deal({
      ticket: 15,
      position_ticket: 504,
      action: 'deal_sell',
      entry: 'entry_in',
      time: BASE + 5,
      price: 1.107,
    })],
  });

  assert.equal(result.markers.length, 1);
  assert.equal(result.markers[0].id, 'trade-history-open-deal-15');
});

test('retained opening stays visible and connects when only the close deal has arrived', () => {
  const retainedOpening = {
    id: '505',
    symbol: 'EURUSD',
    side: 'sell',
    volume: 0.1,
    openPrice: 1.108,
    openTime: new Date((BASE + 5) * 1_000).toISOString(),
  } as const;
  const whileOpen = build({ openPositions: [retainedOpening] });
  const afterClose = build({
    openPositions: [retainedOpening],
    deals: [deal({
      ticket: 16,
      position_ticket: 505,
      action: 'deal_buy',
      entry: 'entry_out',
      time: BASE + 65,
      price: 1.106,
    })],
  });

  const openingMarker = whileOpen.markers[0];
  assert.equal(whileOpen.markers.length, 1);
  assert.deepEqual(
    afterClose.markers.find((marker) => marker.id === openingMarker.id),
    openingMarker,
    'the original entry arrow must survive the live-position to history handoff',
  );
  assert.equal(afterClose.markers.length, 2);
  assert.equal(afterClose.tradeHistorySegments.length, 1);
  assert.equal(afterClose.tradeHistorySegments[0].fromPrice, 1.108);
  assert.equal(afterClose.tradeHistorySegments[0].toPrice, 1.106);
});

test('sell entry and buy exit in the same candle share one candle time', () => {
  const result = build({
    deals: [
      deal({
        ticket: 21,
        position_ticket: 601,
        action: 'deal_sell',
        entry: 'entry_in',
        time: BASE + 5,
        price: 1.105,
      }),
      deal({
        ticket: 22,
        position_ticket: 601,
        action: 'deal_buy',
        entry: 'entry_out',
        time: BASE + 45,
        price: 1.103,
      }),
    ],
  });

  assert.equal(result.tradeHistorySegments.length, 1);
  assert.equal(result.tradeHistorySegments[0].fromTime, BASE);
  assert.equal(result.tradeHistorySegments[0].toTime, BASE);
  assert.equal(result.tradeHistorySegments[0].color, SELL_COLOR);
  assert.equal(result.markers.find((marker) => marker.id.endsWith('21'))?.shape, 'arrowDown');
  assert.equal(result.markers.find((marker) => marker.id.endsWith('22'))?.shape, 'arrowUp');
});

test('atomic deal pair takes precedence over the matching closed-position fallback', () => {
  const result = build({
    chartSymbol: ' EUR/USD.pro ',
    deals: [
      deal({ ticket: 31, position_ticket: 701, symbol: 'EURUSDm' }),
      deal({
        ticket: 32,
        position_ticket: 701,
        symbol: 'EURUSD.c',
        action: 'sell',
        entry: 'out',
        time: BASE + 65,
        price: 1.2,
      }),
    ],
    closedPositions: [closedPosition({ ticket: 701, symbol: 'EURUSDpro' })],
  });

  assert.equal(result.markers.length, 2);
  assert.equal(result.tradeHistorySegments.length, 1);
  assert.ok(result.markers.every((marker) => marker.id.includes('deal-')));
});

test('broker suffix matching covers short index and commodity symbols', () => {
  const symbolCases = [
    ['US30', 'US30m'],
    ['GER40', 'GER40m'],
    ['USOIL', 'USOILm'],
  ] as const;

  symbolCases.forEach(([chartSymbol, brokerSymbol], index) => {
    const positionTicket = 750 + index;
    const result = build({
      chartSymbol,
      deals: [
        deal({
          ticket: 35 + index * 2,
          position_ticket: positionTicket,
          symbol: brokerSymbol,
        }),
        deal({
          ticket: 36 + index * 2,
          position_ticket: positionTicket,
          symbol: brokerSymbol,
          action: 'deal_sell',
          entry: 'entry_out',
          time: BASE + 65,
          price: 1.2,
        }),
      ],
    });

    assert.equal(result.markers.length, 2, brokerSymbol);
    assert.equal(result.tradeHistorySegments.length, 1, brokerSymbol);
  });
});

test('still-open arrows are symbol-scoped without a forex-only instrument list', () => {
  const symbolCases = [
    ['EURUSD', 'EURUSDm'],
    ['XAUUSD', 'XAUUSD.raw'],
    ['BTCUSD', 'BTCUSDpro'],
    ['US30', 'US30m'],
    ['GER40', 'GER40.c'],
    ['USOIL', 'USOILstd'],
  ] as const;

  symbolCases.forEach(([chartSymbol, brokerSymbol], index) => {
    const result = build({
      chartSymbol,
      deals: [deal({
        ticket: 300 + index,
        position_ticket: 900 + index,
        symbol: brokerSymbol,
      })],
    });
    assert.equal(result.markers.length, 1, brokerSymbol);
    assert.equal(result.tradeHistorySegments.length, 0, brokerSymbol);
  });
});

test('no-ticket partial exits consume same-symbol opening lots in deterministic FIFO order', () => {
  const inputDeals = [
    deal({ ticket: 0, position_ticket: 0, volume: 0.4, time: BASE + 1, price: 1.11 }),
    deal({ ticket: 0, position_ticket: 0, volume: 0.6, time: BASE + 2, price: 1.12 }),
    deal({
      ticket: 0,
      position_ticket: 0,
      action: 'deal_sell',
      entry: 'entry_out',
      volume: 0.5,
      time: BASE + 61,
      price: 1.13,
    }),
    deal({
      ticket: 0,
      position_ticket: 0,
      action: 'deal_sell',
      entry: 'entry_out',
      volume: 0.5,
      time: BASE + 121,
      price: 1.14,
    }),
  ];

  const forward = build({ deals: inputDeals });
  const reversed = build({ deals: [...inputDeals].reverse() });

  assert.deepEqual(reversed, forward);
  assert.equal(forward.markers.length, 4, 'each execution gets one marker despite split matching');
  assert.equal(forward.tradeHistorySegments.length, 3);
  assert.deepEqual(
    forward.tradeHistorySegments.map((segment) => [segment.fromPrice, segment.toPrice]),
    [[1.11, 1.13], [1.12, 1.13], [1.12, 1.14]],
  );
});

test('position ticket matching wins over global FIFO matching', () => {
  const result = build({
    deals: [
      deal({ ticket: 41, position_ticket: 801, time: BASE + 1, price: 1.11 }),
      deal({ ticket: 42, position_ticket: 802, time: BASE + 2, price: 1.12 }),
      deal({
        ticket: 43,
        position_ticket: 802,
        action: 'deal_sell',
        entry: 'entry_out',
        time: BASE + 61,
        price: 1.13,
      }),
      deal({
        ticket: 44,
        position_ticket: 801,
        action: 'deal_sell',
        entry: 'entry_out',
        time: BASE + 62,
        price: 1.14,
      }),
    ],
  });

  assert.deepEqual(
    result.tradeHistorySegments.map((segment) => [segment.fromPrice, segment.toPrice]),
    [[1.11, 1.14], [1.12, 1.13]],
  );
});

test('MT5 close-by exit aliases still produce the exact closing arrow', () => {
  const result = build({
    deals: [
      deal({ ticket: 441, position_ticket: 811, time: BASE + 1, price: 1.11 }),
      deal({
        ticket: 442,
        position_ticket: 811,
        action: 'deal_sell',
        entry: 'entry_out_by',
        time: BASE + 61,
        price: 1.13,
      }),
    ],
  });

  assert.equal(result.tradeHistorySegments.length, 1);
  assert.equal(result.markers.find((marker) => marker.id.endsWith('442'))?.price, 1.13);
});

test('closed fallback completes a position when the atomic deal feed has only a partial exit', () => {
  const result = build({
    deals: [
      deal({ ticket: 45, position_ticket: 850, volume: 1, time: BASE + 5, price: 1.1 }),
      deal({
        ticket: 46,
        position_ticket: 850,
        action: 'deal_sell',
        entry: 'entry_out',
        volume: 0.5,
        time: BASE + 35,
        price: 1.2,
      }),
    ],
    closedPositions: [closedPosition({
      ticket: 850,
      volume: 0.5,
      price_open: 1.1,
      price_close: 1.3,
      time_create: BASE + 5,
      time_close: BASE + 65,
    })],
  });

  assert.deepEqual(
    result.tradeHistorySegments.map((segment) => segment.toPrice),
    [1.2, 1.3],
  );
  assert.equal(result.markers.filter((marker) => marker.id.includes('open')).length, 1);
  assert.equal(result.markers.filter((marker) => marker.id.includes('close')).length, 2);
});

test('different tickets opened at the same second and price keep separate opening arrows', () => {
  const result = build({
    deals: [
      deal({ ticket: 47, position_ticket: 851, time: BASE + 5, price: 1.1 }),
      deal({
        ticket: 48,
        position_ticket: 851,
        action: 'deal_sell',
        entry: 'entry_out',
        time: BASE + 35,
        price: 1.2,
      }),
    ],
    closedPositions: [closedPosition({
      ticket: 852,
      price_open: 1.1,
      price_close: 1.3,
      time_create: BASE + 5,
      time_close: BASE + 65,
    })],
  });

  assert.equal(result.markers.filter((marker) => marker.id.includes('open')).length, 2);
  assert.equal(result.tradeHistorySegments.length, 2);
});

test('closed positions provide exact fallback arrows and one opening arrow for partial-close rows', () => {
  const result = build({
    closedPositions: [
      closedPosition({
        ticket: 901,
        side: 'sell',
        volume: 0.4,
        price_open: 1.15,
        price_close: 1.14,
        time_create: BASE + 5,
        time_close: BASE + 35,
      }),
      closedPosition({
        ticket: 901,
        side: 'sell',
        volume: 0.6,
        price_open: 1.15,
        price_close: 1.13,
        time_create: BASE + 5,
        time_close: BASE + 65,
      }),
    ],
  });

  assert.equal(result.markers.filter((marker) => marker.id.includes('closed-open')).length, 1);
  assert.equal(result.markers.filter((marker) => marker.id.includes('closed-close')).length, 2);
  assert.equal(result.tradeHistorySegments.length, 2);
  assert.ok(result.tradeHistorySegments.every((segment) => segment.color === SELL_COLOR));
  const opening = result.markers.find((marker) => marker.id.includes('closed-open'));
  assert.equal(opening?.shape, 'arrowDown');
  assert.equal(opening?.position, 'atPriceTop');
  assert.equal(opening?.price, 1.15);
});

test('seconds, milliseconds, microseconds, and nanoseconds normalize to loaded candle seconds', () => {
  const multipliers = [1, 1_000, 1_000_000, 1_000_000_000];
  multipliers.forEach((multiplier, index) => {
    const offset = index * 60;
    const result = build({
      candles: [candle(BASE + offset)],
      closedPositions: [closedPosition({
        ticket: 1_000 + index,
        time_create: (BASE + offset + 5) * multiplier,
        time_close: (BASE + offset + 45) * multiplier,
      })],
    });
    assert.equal(result.markers.length, 2, `timestamp multiplier ${multiplier}`);
    assert.equal(result.tradeHistorySegments[0]?.fromTime, BASE + offset);
    assert.equal(result.tradeHistorySegments[0]?.toTime, BASE + offset);
  });
});

test('events align only to a loaded containing candle and never to a later candle', () => {
  const contained = build({
    candles: [candle(BASE + 5)],
    closedPositions: [closedPosition({ time_create: BASE + 20, time_close: BASE + 40 })],
  });
  assert.equal(contained.tradeHistorySegments[0]?.fromTime, BASE + 5);

  const futureOnly = build({
    candles: [candle(BASE + 5)],
    closedPositions: [closedPosition({ time_create: BASE + 1, time_close: BASE + 2 })],
  });
  assert.deepEqual(futureOnly, { markers: [], tradeHistorySegments: [] });
});

test('shifted broker candles contain executions across canonical M1 and D1 boundaries', () => {
  const shiftedM1 = build({
    candles: [candle(BASE + 5), candle(BASE + 65)],
    closedPositions: [closedPosition({
      time_create: BASE + 10,
      time_close: BASE + 62,
    })],
  });
  assert.equal(shiftedM1.tradeHistorySegments[0]?.fromTime, BASE + 5);
  assert.equal(shiftedM1.tradeHistorySegments[0]?.toTime, BASE + 5);

  const day = 24 * 60 * 60;
  const shiftedD1 = build({
    chartTimeframe: 'D1',
    candles: [candle(BASE + 5 * 60 * 60), candle(BASE + day + 5 * 60 * 60)],
    closedPositions: [closedPosition({
      time_create: BASE + 6 * 60 * 60,
      time_close: BASE + day + 4 * 60 * 60,
    })],
  });
  assert.equal(shiftedD1.tradeHistorySegments[0]?.fromTime, BASE + 5 * 60 * 60);
  assert.equal(shiftedD1.tradeHistorySegments[0]?.toTime, BASE + 5 * 60 * 60);
});

test('monthly tail candle uses its real calendar boundary and preserves broker offset', () => {
  const januaryStart = Date.UTC(2026, 0, 1) / 1_000;
  const februaryStart = Date.UTC(2026, 1, 1) / 1_000;
  const marchStart = Date.UTC(2026, 2, 1) / 1_000;

  const january31 = build({
    chartTimeframe: 'MN',
    candles: [candle(januaryStart)],
    closedPositions: [closedPosition({
      ticket: 1106,
      time_create: Date.UTC(2026, 0, 31, 12) / 1_000,
      time_close: Date.UTC(2026, 0, 31, 13) / 1_000,
    })],
  });
  assert.equal(january31.markers.length, 2);
  assert.equal(january31.tradeHistorySegments[0]?.fromTime, januaryStart);

  const afterFebruary = build({
    chartTimeframe: 'MN',
    candles: [candle(februaryStart)],
    closedPositions: [closedPosition({
      ticket: 1107,
      time_create: marchStart + 12 * 60 * 60,
      time_close: marchStart + 13 * 60 * 60,
    })],
  });
  assert.deepEqual(afterFebruary, { markers: [], tradeHistorySegments: [] });

  const fiveHourBrokerShift = 5 * 60 * 60;
  const fourHourBrokerOffset = 4 * 60 * 60;
  const shiftedJanuary = build({
    chartTimeframe: 'MN',
    candles: [candle(januaryStart + fiveHourBrokerShift)],
    closedPositions: [closedPosition({
      ticket: 1108,
      time_create: februaryStart + fourHourBrokerOffset,
      time_close: februaryStart + fourHourBrokerOffset + 30 * 60,
    })],
  });
  assert.equal(
    shiftedJanuary.tradeHistorySegments[0]?.fromTime,
    januaryStart + fiveHourBrokerShift,
  );
  assert.equal(
    shiftedJanuary.tradeHistorySegments[0]?.toTime,
    januaryStart + fiveHourBrokerShift,
  );
});

test('an endpoint outside the loaded candle range is not snapped to the chart edge', () => {
  const result = build({
    candles: [candle(BASE + 60), candle(BASE + 120)],
    deals: [
      deal({ ticket: 51, position_ticket: 1001, time: BASE + 5 }),
      deal({
        ticket: 52,
        position_ticket: 1001,
        action: 'deal_sell',
        entry: 'entry_out',
        time: BASE + 65,
        price: 1.2,
      }),
    ],
  });

  assert.equal(result.markers.length, 1);
  assert.equal(result.markers[0].id, 'trade-history-close-deal-52');
  assert.equal(result.tradeHistorySegments.length, 0);
});

test('non-trade actions, incomplete close rows, and other symbols are skipped', () => {
  const result = build({
    deals: [
      deal({ ticket: 61, action: 'balance', entry: 'entry_in' }),
      deal({ ticket: 62, symbol: 'GBPUSD' }),
      deal({ ticket: 63, price: 0 }),
    ],
    closedPositions: [
      closedPosition({ ticket: 1101, symbol: 'GBPUSD' }),
      closedPosition({ ticket: 1102, price_close: undefined }),
      closedPosition({ ticket: 1103, time_close: undefined, time_update: 0 }),
    ],
  });

  assert.deepEqual(result, { markers: [], tradeHistorySegments: [] });
});

test('closed-position fallback uses time_update when time_close is omitted', () => {
  const result = build({
    closedPositions: [closedPosition({
      ticket: 1104,
      time_close: undefined,
      time_update: BASE + 65,
    })],
  });

  assert.equal(result.markers.length, 2);
  assert.equal(result.markers.find((marker) => marker.id.includes('closed-close'))?.time, BASE + 60);
  assert.equal(result.tradeHistorySegments[0]?.toTime, BASE + 60);
});

test('closed-position fallback uses time_update when time_close is a broker sentinel', () => {
  const result = build({
    closedPositions: [closedPosition({
      ticket: 1105,
      time_close: 0,
      time_update: BASE + 65,
    })],
  });

  assert.equal(result.markers.length, 2);
  assert.equal(result.tradeHistorySegments[0]?.toTime, BASE + 60);
});

test('closed-position fallback accepts terminal price_current when price_close is omitted', () => {
  const result = build({
    closedPositions: [closedPosition({
      ticket: 1109,
      price_close: undefined,
      price_current: 1.2345,
    })],
  });

  assert.equal(result.markers.length, 2);
  assert.equal(result.markers.find((marker) => marker.id.includes('closed-close'))?.price, 1.2345);
  assert.equal(result.tradeHistorySegments[0]?.toPrice, 1.2345);
});

test('history is bounded by loaded candles but is not truncated to the legacy eight-marker limit', () => {
  const rows = Array.from({ length: 12 }, (_, index) => closedPosition({
    ticket: 2_000 + index,
    price_open: 1.1 + index / 10_000,
    price_close: 1.2 + index / 10_000,
    time_create: BASE + 1,
    time_close: BASE + 61,
  }));
  const result = build({ closedPositions: rows });

  assert.equal(result.markers.length, 24);
  assert.equal(result.tradeHistorySegments.length, 12);
});

test('duplicate atomic records do not duplicate markers or segments', () => {
  const opening = deal({ ticket: 71, position_ticket: 1201 });
  const closing = deal({
    ticket: 72,
    position_ticket: 1201,
    action: 'deal_sell',
    entry: 'entry_out',
    time: BASE + 65,
    price: 1.2,
  });
  const result = build({ deals: [opening, closing, opening, closing] });

  assert.equal(result.markers.length, 2);
  assert.equal(result.tradeHistorySegments.length, 1);
});
