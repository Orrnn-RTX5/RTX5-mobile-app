import test from 'node:test';
import assert from 'node:assert/strict';

import { SUPPORTED_TIMEFRAMES } from '../../core/timeframeUtils';
import { LiveCandleStreamManager } from './manager';
import { FLUSH_INTERVAL_MS, type BufferedLiveEvent, type StreamEntry } from './types';

test('one quote reaches every timeframe for its exact symbol and no other symbol', () => {
  const symbolCases = [
    { input: ' eurusd.pro ', normalized: 'EURUSD.PRO' },
    { input: 'xauusd', normalized: 'XAUUSD' },
    { input: 'btcusd', normalized: 'BTCUSD' },
  ] as const;

  for (const { input, normalized } of symbolCases) {
    const manager = new LiveCandleStreamManager();
    const routed: Array<{
      event: BufferedLiveEvent;
      symbol: string;
      timeframe: string;
    }> = [];

    for (const timeframe of SUPPORTED_TIMEFRAMES) {
      manager.entries.set(
        `${normalized}:${timeframe}`,
        {
          symbol: normalized,
          timeframe,
          eventOrder: 0,
        } as StreamEntry,
      );
    }
    manager.entries.set(
      `GBPUSD:M5`,
      {
        symbol: 'GBPUSD',
        timeframe: 'M5',
        eventOrder: 0,
      } as StreamEntry,
    );

    (manager as unknown as {
      enqueueLiveEvent: (entry: StreamEntry, event: BufferedLiveEvent) => void;
    }).enqueueLiveEvent = (entry, event) => {
      routed.push({ event, symbol: entry.symbol, timeframe: entry.timeframe });
    };

    manager.extendActiveCandlesFromQuoteTick(input, {
      price: 1_234.5,
      time: 1_775_000_005,
      allowFlatNewBucket: true,
    });

    assert.deepEqual(
      routed.map(({ symbol, timeframe }) => `${symbol}:${timeframe}`),
      SUPPORTED_TIMEFRAMES.map((timeframe) => `${normalized}:${timeframe}`),
    );
    assert.equal(routed.every(({ symbol }) => symbol === normalized), true);
    assert.equal(
      routed.every(({ event }) => (
        event.type === 'quote_tick_extension' && event.allowFlatNewBucket === true
      )),
      true,
    );
  }
});

test('lost animation frame falls back to timeout and later ticks can schedule again', async () => {
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
  const cancelledFrames: number[] = [];
  let nextFrame = 40;

  globalThis.requestAnimationFrame = (() => {
    nextFrame += 1;
    return nextFrame;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = ((handle: number) => {
    cancelledFrames.push(handle);
  }) as typeof cancelAnimationFrame;

  try {
    const manager = new LiveCandleStreamManager();
    const entry = {
      key: 'XAUUSD:M1',
      symbol: 'XAUUSD',
      timeframe: 'M1',
      pendingEvents: [],
      flushFrame: null,
      flushTimer: null,
    } as unknown as StreamEntry;
    manager.entries.set(entry.key, entry);

    let applied = 0;
    let committed = 0;
    manager.applyLiveEvents = ((_entry, events) => {
      applied += events.length;
      return true;
    }) as typeof manager.applyLiveEvents;
    manager.commit = (() => {
      committed += 1;
    }) as typeof manager.commit;

    const queueAndSchedule = (order: number) => {
      entry.pendingEvents.push({
        type: 'quote_tick_extension',
        price: 4400 + order,
        high: 4400 + order,
        low: 4400 + order,
        time: 1_785_000_000 + order,
        order,
      });
      (manager as unknown as { scheduleFlush: (target: StreamEntry) => void })
        .scheduleFlush(entry);
    };

    queueAndSchedule(1);
    await new Promise((resolve) => setTimeout(resolve, FLUSH_INTERVAL_MS + 25));
    assert.equal(applied, 1);
    assert.equal(committed, 1);
    assert.equal(entry.flushFrame, null);
    assert.equal(entry.flushTimer, null);
    assert.deepEqual(cancelledFrames, [41]);

    queueAndSchedule(2);
    await new Promise((resolve) => setTimeout(resolve, FLUSH_INTERVAL_MS + 25));
    assert.equal(applied, 2);
    assert.equal(committed, 2);
    assert.deepEqual(cancelledFrames, [41, 42]);
  } finally {
    if (originalRequestAnimationFrame === undefined) {
      delete (globalThis as { requestAnimationFrame?: typeof requestAnimationFrame }).requestAnimationFrame;
    } else {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    }
    if (originalCancelAnimationFrame === undefined) {
      delete (globalThis as { cancelAnimationFrame?: typeof cancelAnimationFrame }).cancelAnimationFrame;
    } else {
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    }
  }
});
