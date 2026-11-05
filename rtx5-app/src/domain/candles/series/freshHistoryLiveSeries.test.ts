import assert from 'node:assert/strict';
import test from 'node:test';

import { applyLiveCandleToCandleMap } from './liveCandleAggregator.ts';
import {
  buildFreshHistoryLiveCandleSeries,
  foldCoveredLiveExtremesIntoHistory,
  materializeLiveCandleMap,
} from './freshHistoryLiveSeries.ts';
import type { Candle, MutableCandle } from '../core/candleTypes.ts';

const liveCandle = (time: number, o: number, h: number, l: number, c: number): MutableCandle => ({
  time,
  open: o,
  high: h,
  low: l,
  close: c,
  volume: 0,
  source: 'live_candle',
  closed: false,
});

const B0 = 1_713_744_000; // bucket-aligned M1 time
const B1 = B0 + 60;

test('foldCoveredLiveExtremesIntoHistory keeps the wick observed live when history finalizes narrower', () => {
  // Backend's finalized candle is flatter than what we actually saw via bid ticks.
  const history: Candle[] = [
    { time: B0, open: 0.70300, high: 0.70320, low: 0.70290, close: 0.70310, volume: 5 },
  ];
  const liveMap = new Map<number, MutableCandle>([
    [B0, liveCandle(B0, 0.70300, 0.70360, 0.70280, 0.70310)],
  ]);

  const result = foldCoveredLiveExtremesIntoHistory(history, liveMap, B0, 'M1');

  // High/low widen to the observed extremes; open/close stay authoritative.
  assert.equal(result[0].high, 0.70360);
  assert.equal(result[0].low, 0.70280);
  assert.equal(result[0].open, 0.70300);
  assert.equal(result[0].close, 0.70310);
});

test('foldCoveredLiveExtremesIntoHistory is a no-op when history already covers the live range', () => {
  const history: Candle[] = [
    { time: B0, open: 0.70300, high: 0.70380, low: 0.70260, close: 0.70310, volume: 5 },
  ];
  const liveMap = new Map<number, MutableCandle>([
    [B0, liveCandle(B0, 0.70300, 0.70360, 0.70280, 0.70310)],
  ]);

  const result = foldCoveredLiveExtremesIntoHistory(history, liveMap, B0, 'M1');

  assert.equal(result[0].high, 0.70380);
  assert.equal(result[0].low, 0.70260);
  assert.equal(result, history); // same reference: nothing changed
});

test('foldCoveredLiveExtremesIntoHistory ignores spurious live extremes (incoherent spike)', () => {
  const history: Candle[] = [
    { time: B0, open: 0.70300, high: 0.70320, low: 0.70290, close: 0.70310, volume: 5 },
  ];
  const liveMap = new Map<number, MutableCandle>([
    [B0, liveCandle(B0, 0.70300, 0.90000, 0.70280, 0.70310)], // 0.9 is a bad tick
  ]);

  const result = foldCoveredLiveExtremesIntoHistory(history, liveMap, B0, 'M1');

  assert.equal(result[0].high, 0.70320); // spike rejected
  assert.equal(result[0].low, 0.70280); // coherent low still folded
});

test('foldCoveredLiveExtremesIntoHistory leaves a still-forming (not yet covered) bucket alone', () => {
  const history: Candle[] = [
    { time: B0, open: 0.70300, high: 0.70320, low: 0.70290, close: 0.70310, volume: 5 },
  ];
  // B1 live candle is newer than the closed cutoff (B0) — still live, must be skipped.
  const liveMap = new Map<number, MutableCandle>([
    [B1, liveCandle(B1, 0.70310, 0.70400, 0.70250, 0.70330)],
  ]);

  const result = foldCoveredLiveExtremesIntoHistory(history, liveMap, B0, 'M1');
  assert.equal(result, history); // no covered bucket matched
});

test('fresh history/live merge keeps one bucket and lets live OHLC update the active candle', () => {
  const history = [
    { time: 1_713_744_000, open: 1.1, high: 1.2, low: 1.0, close: 1.15, volume: 10 },
    { time: 1_713_744_060, open: 1.15, high: 1.18, low: 1.12, close: 1.16, volume: 12 },
  ];
  const live = [
    { time: 1_713_744_075, open: 1.16, high: 1.24, low: 1.14, close: 1.22, volume: 20 },
    { time: 1_713_744_120, open: 1.22, high: 1.25, low: 1.21, close: 1.23, volume: 4 },
  ];

  const merged = buildFreshHistoryLiveCandleSeries(history, live, 'M1');

  assert.deepEqual(merged.map((candle) => candle.time), [
    1_713_744_000,
    1_713_744_060,
    1_713_744_120,
  ]);
  assert.equal(new Set(merged.map((candle) => candle.time)).size, merged.length);
  assert.deepEqual(merged[1], {
    time: 1_713_744_060,
    open: 1.16,
    high: 1.24,
    low: 1.12,
    close: 1.22,
    volume: 20,
  });
});

test('backend live OHLC generates candles in the requested timeframe bucket before merge', () => {
  const liveMap = new Map<number, MutableCandle>();
  const history = [
    { time: 1_713_744_000, open: 100, high: 105, low: 95, close: 102, volume: 10 },
  ];

  applyLiveCandleToCandleMap(
    liveMap,
    { time: 1_713_744_610, open: 110, high: 112, low: 109, close: 111, volume: 3 },
    'M5',
    { historyCutoffTime: 1_713_744_000 },
  );
  applyLiveCandleToCandleMap(
    liveMap,
    { time: 1_713_744_660, open: 110, high: 113, low: 108, close: 108, volume: 6 },
    'M5',
    { historyCutoffTime: 1_713_744_000 },
  );

  const live = materializeLiveCandleMap(liveMap, 1_713_744_000);
  const merged = buildFreshHistoryLiveCandleSeries(history, live, 'M5');

  assert.deepEqual(live, [
    { time: 1_713_744_600, open: 110, high: 113, low: 108, close: 108, volume: 6 },
  ]);
  assert.deepEqual(merged.map((candle) => candle.time), [1_713_744_000, 1_713_744_600]);
});

test('closed history cutoff removes same-time live candles before visible merge', () => {
  const cutoff = 1_713_744_060;
  const liveMap = new Map<number, MutableCandle>([
    [
      cutoff,
      {
        time: cutoff,
        open: 9,
        high: 9,
        low: 9,
        close: 9,
        volume: 1,
        source: 'live_candle',
      },
    ],
    [
      cutoff + 60,
      {
        time: cutoff + 60,
        open: 1.16,
        high: 1.2,
        low: 1.15,
        close: 1.18,
        volume: 2,
        source: 'live_candle',
      },
    ],
  ]);

  const live = materializeLiveCandleMap(liveMap, cutoff);
  assert.deepEqual(live.map((candle) => candle.time), [cutoff + 60]);

  const merged = buildFreshHistoryLiveCandleSeries(
    [
      { time: 1_713_744_000, open: 1.1, high: 1.2, low: 1.0, close: 1.15, volume: 10 },
      { time: cutoff, open: 1.15, high: 1.18, low: 1.12, close: 1.16, volume: 12 },
    ],
    [
      { time: cutoff, open: 9, high: 9, low: 9, close: 9, volume: 1 },
      { time: cutoff + 60, open: 1.16, high: 1.2, low: 1.15, close: 1.18, volume: 2 },
    ],
    'M1',
    undefined,
    { closedHistoryLastTime: cutoff },
  );

  assert.deepEqual(merged.map((candle) => candle.time), [1_713_744_000, cutoff, cutoff + 60]);
  assert.equal(merged[1].close, 1.16);
  assert.equal(merged[1].high, 1.18);
});

test('fresh history/live merge preserves backend live provenance for chart display filtering', () => {
  const liveMap = new Map<number, MutableCandle>();
  const history = [
    { time: 1_713_744_000, open: 100, high: 105, low: 95, close: 102, volume: 10 },
  ];

  applyLiveCandleToCandleMap(
    liveMap,
    { time: 1_713_744_120, open: 777, high: 778, low: 776, close: 777.5, volume: 4, closed: false },
    'M1',
    { historyCutoffTime: 1_713_744_000 },
  );

  const live = materializeLiveCandleMap(liveMap, 1_713_744_000, { preserveProvenance: true });
  assert.equal((live[0] as MutableCandle | undefined)?.source, 'live_candle');
  assert.equal((live[0] as MutableCandle | undefined)?.closed, false);
  assert.equal((live[0] as MutableCandle | undefined)?.lastBackendUpdateTime, 1_713_744_120);

  const merged = buildFreshHistoryLiveCandleSeries(
    history,
    live,
    'M1',
    undefined,
    { closedHistoryLastTime: 1_713_744_000, preserveProvenance: true },
  );
  const tail = merged[merged.length - 1] as MutableCandle;

  assert.equal(tail.time, 1_713_744_120);
  assert.equal(tail.source, 'live_candle');
  assert.equal(tail.closed, false);
  assert.equal(tail.lastBackendUpdateTime, 1_713_744_120);
});
