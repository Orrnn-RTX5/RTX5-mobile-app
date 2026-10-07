import assert from 'node:assert/strict';
import test from 'node:test';

import { useTradingState } from '../../../state/tradingState.ts';
import { cancelFlush, flushUpdates, scheduleFlush, type FlushPipelineState } from './flushPipeline.ts';

const resetTradingState = () => {
  useTradingState.setState({
    quotes: {},
    tickCount: 0,
    account: null,
    candles: {},
  });
};

test('10,000 burst ticks publish one latest snapshot per symbol and preserve heartbeat freshness', () => {
  resetTradingState();
  const state: FlushPipelineState = {
    flushScheduled: false, flushAnimationFrame: null, flushTimer: null, pendingUpdates: new Map(),
  };
  let notifications = 0;
  const unsubscribe = useTradingState.subscribe(() => notifications++);
  try {
    for (let index = 0; index < 10_000; index++) {
      state.pendingUpdates.set(`S${index % 100}`, { bid: index + 1, ask: index + 2, lastReceivedAt: 1_800_000_000_000 + index });
    }
    assert.equal(state.pendingUpdates.size, 100);
    flushUpdates(state);
    assert.equal(notifications, 1);
    assert.equal(useTradingState.getState().quotes.S99.bid, 10_000);
    assert.equal(useTradingState.getState().tickCount, 100);
    const previous = useTradingState.getState().quotes.S99;
    state.pendingUpdates.set('S99', { bid: 10_000, ask: 10_001, lastReceivedAt: 1_800_000_020_000 });
    flushUpdates(state);
    assert.equal(notifications, 2, 'unchanged prices still refresh feed freshness');
    assert.equal(useTradingState.getState().quotes.S99.lastReceivedAt, 1_800_000_020_000);
    assert.equal(useTradingState.getState().quotes.S99.lastPriceChangedAt, previous.lastPriceChangedAt);
    assert.equal(previous.lastReceivedAt, 1_800_000_009_999, 'old snapshots remain immutable');
  } finally { unsubscribe(); }
});

test('invalid quote batches preserve store identity without notifying every screen', () => {
  resetTradingState();
  const previous = useTradingState.getState();
  let notifications = 0;
  const unsubscribe = useTradingState.subscribe(() => notifications++);
  try {
    flushUpdates({
      flushScheduled: false, flushAnimationFrame: null, flushTimer: null,
      pendingUpdates: new Map([['EURUSD', { bid: NaN, ask: 2 }], ['BTCUSD', { bid: 3, ask: 2 }]]),
    });
    assert.equal(useTradingState.getState(), previous);
    assert.equal(notifications, 0);
  } finally { unsubscribe(); }
});

test('quote flush recovers lost frames and ignores late frames from cancelled work', async () => {
  resetTradingState();
  const originalFrame = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  const frames: FrameRequestCallback[] = [];
  globalThis.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
  // Retain cancelled callbacks deliberately, as a native callback may already be queued.
  globalThis.cancelAnimationFrame = () => {};
  const state: FlushPipelineState = {
    flushScheduled: false, flushAnimationFrame: null, flushTimer: null, pendingUpdates: new Map(),
  };
  try {
    state.pendingUpdates.set('EURUSD', { bid: 1, ask: 2 });
    scheduleFlush(state);
    await new Promise(resolve => setTimeout(resolve, 130));
    assert.equal(useTradingState.getState().quotes.EURUSD.bid, 1);
    assert.equal(state.flushScheduled, false);
    frames[0](0);
    assert.equal(useTradingState.getState().tickCount, 1);

    state.pendingUpdates.set('EURUSD', { bid: 2, ask: 3 });
    scheduleFlush(state);
    cancelFlush(state);
    state.pendingUpdates.set('EURUSD', { bid: 3, ask: 4 });
    scheduleFlush(state);
    frames[1](0);
    assert.equal(useTradingState.getState().quotes.EURUSD.bid, 1, 'an old frame cannot commit a new generation early');
    assert.equal(state.flushScheduled, true);
    frames[2](0);
    assert.equal(useTradingState.getState().quotes.EURUSD.bid, 3);
    assert.equal(state.pendingUpdates.size, 0);
    await new Promise(resolve => setTimeout(resolve, 130));
    assert.equal(useTradingState.getState().tickCount, 2);
  } finally {
    cancelFlush(state);
    globalThis.requestAnimationFrame = originalFrame;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});

test('batched quote flush lets backend digits correct stale cached precision', () => {
  resetTradingState();

  useTradingState.getState().setQuote('BTCUSD', {
    bid: 65000.12,
    ask: 65001.12,
    digits: 2,
    digitsSource: 'backend',
  });

  const flushState: FlushPipelineState = {
    flushScheduled: false,
    flushAnimationFrame: null,
    flushTimer: null,
    pendingUpdates: new Map([
      [
        'BTCUSD',
        {
          bid: 65000.12345678,
          ask: 65001.12345678,
          digits: 8,
        },
      ],
    ]),
  };

  flushUpdates(flushState);

  const quote = useTradingState.getState().quotes.BTCUSD;
  assert.equal(quote.digits, 8);
  assert.equal(quote.digitsSource, 'backend');
});

test('batched quote flush recalculates spread and keeps volume backend-owned', () => {
  resetTradingState();

  const flushState: FlushPipelineState = {
    flushScheduled: false,
    flushAnimationFrame: null,
    flushTimer: null,
    pendingUpdates: new Map([
      [
        'EURUSD',
        {
          bid: 1.16345,
          ask: 1.16365,
          spread: 0,
          digits: 5,
        },
      ],
    ]),
  };

  flushUpdates(flushState);

  let quote = useTradingState.getState().quotes.EURUSD;
  assert.equal(quote.spread, 20);
  assert.equal(quote.volume, undefined);
  assert.equal(quote.volumeSource, undefined);

  flushState.pendingUpdates = new Map([
    [
      'EURUSD',
      {
        bid: 1.16346,
        ask: 1.16366,
        digits: 5,
        volume: 4407,
      },
    ],
  ]);

  flushUpdates(flushState);

  quote = useTradingState.getState().quotes.EURUSD;
  assert.equal(quote.spread, 20);
  assert.equal(quote.volume, 4407);
  assert.equal(quote.volumeSource, 'backend');

  flushState.pendingUpdates = new Map([
    [
      'EURUSD',
      {
        bid: 1.16347,
        ask: 1.16367,
        digits: 5,
      },
    ],
  ]);

  flushUpdates(flushState);

  quote = useTradingState.getState().quotes.EURUSD;
  assert.equal(quote.volume, 4407);
  assert.equal(quote.volumeSource, 'backend');
});

test('batched EURUSD feed without digits converts raw spread to display points', () => {
  resetTradingState();
  flushUpdates({
    flushScheduled: false,
    flushAnimationFrame: null,
    flushTimer: null,
    pendingUpdates: new Map([['EURUSD', {
      bid: 1.13736,
      ask: 1.13751,
      spread: 0.00015,
    }]]),
  });
  const quote = useTradingState.getState().quotes.EURUSD;
  assert.equal(quote.digits, 5);
  assert.equal(quote.spread, 15);
});

test('batched quote flush never injects static mock/spec fields', () => {
  resetTradingState();
  const flushState: FlushPipelineState = {
    flushScheduled: false,
    flushAnimationFrame: null,
    flushTimer: null,
    pendingUpdates: new Map([['EURUSD', {
      bid: 1.1,
      ask: 1.1002,
      transport: 'websocket',
      tradable: true,
    }]]),
  };

  flushUpdates(flushState);
  const quote = useTradingState.getState().quotes.EURUSD;
  assert.equal(quote.transport, 'websocket');
  assert.equal(quote.tradable, true);
  assert.equal(quote.contractSize, undefined);
  assert.equal(quote.swapLong, undefined);
  assert.equal(quote.high, undefined);
  assert.equal(quote.low, undefined);
});

test('batched quote flush discards a queued old-epoch update', () => {
  resetTradingState();
  const flushState: FlushPipelineState = {
    flushScheduled: false,
    flushAnimationFrame: null,
    flushTimer: null,
    canCommitPendingUpdates: () => false,
    pendingUpdates: new Map([['EURUSD', {
      bid: 1.1,
      ask: 1.1002,
      transport: 'websocket',
      tradable: true,
    }]]),
  };

  flushUpdates(flushState);

  assert.deepEqual(useTradingState.getState().quotes, {});
  assert.equal(flushState.pendingUpdates.size, 0);
});
