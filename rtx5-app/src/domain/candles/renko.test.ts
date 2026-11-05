import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRenkoBricks,
  DEFAULT_RENKO_ATR_PERIOD,
  MAX_RENKO_BRICKS,
  resolveRenkoMinimumPriceIncrement,
  resolveRenkoBrickSize,
  resolveRenkoBrickSizeDetails,
  type RenkoSourceCandle,
} from './renko';

const BASE_TIME = 1_775_000_000;

const candle = (
  offset: number,
  close: number,
  overrides: Partial<RenkoSourceCandle> = {},
): RenkoSourceCandle => ({
  time: BASE_TIME + offset * 60,
  open: close,
  high: close,
  low: close,
  close,
  volume: 10,
  ...overrides,
});

test('resolves the default ATR(14) size from completed candles and rounds to the minimum increment', () => {
  const source = Array.from({ length: DEFAULT_RENKO_ATR_PERIOD }, (_, index) =>
    candle(index, 100, { high: 100.13, low: 99.87 }),
  );
  source.push(candle(DEFAULT_RENKO_ATR_PERIOD, 100, { high: 110, low: 90 }));

  assert.equal(
    resolveRenkoBrickSize(source, { minimumPriceIncrement: 0.1 }),
    0.3,
    'the forming candle must not resize the established Renko grid',
  );
});

test('uses Wilder smoothing after the initial ATR window', () => {
  const source = Array.from({ length: 16 }, (_, index) => (
    index < DEFAULT_RENKO_ATR_PERIOD
      ? candle(index, 100, { high: 100.5, low: 99.5 })
      : candle(index, 100, { high: 107.5, low: 92.5 })
  ));
  source.push(candle(16, 100, { high: 150, low: 50 }));

  assert.equal(resolveRenkoBrickSize(source, { minimumPriceIncrement: 0.1 }), 2.9);
});

test('prefers the broker price grid and identifies flat-history fallback sizes', () => {
  assert.equal(resolveRenkoMinimumPriceIncrement([undefined, 0.05, 0.01], 0.01), 0.05);
  assert.deepEqual(
    resolveRenkoBrickSizeDetails(
      [candle(0, 100), candle(1, 100)],
      { minimumPriceIncrement: 0.05 },
    ),
    { brickSize: 0.05, source: 'minimum_increment' },
  );
});

test('builds every completed continuation brick for a multi-box close move', () => {
  const bricks = buildRenkoBricks(
    [candle(0, 100), candle(1, 135)],
    { brickSize: 10 },
  );
  const completed = bricks.filter((brick) => !brick.isProjection);

  assert.deepEqual(
    completed.map(({ open, close, high, low }) => ({ open, close, high, low })),
    [
      { open: 100, close: 110, high: 110, low: 100 },
      { open: 110, close: 120, high: 120, low: 110 },
      { open: 120, close: 130, high: 130, low: 120 },
    ],
  );
});

test('requires a two-box move and creates a one-box traditional reversal brick', () => {
  const beforeReversal = buildRenkoBricks(
    [candle(0, 100), candle(1, 120), candle(2, 105)],
    { brickSize: 10 },
  );
  assert.equal(beforeReversal.filter((brick) => !brick.isProjection).length, 2);

  const reversed = buildRenkoBricks(
    [candle(0, 100), candle(1, 120), candle(2, 100)],
    { brickSize: 10 },
  );
  const completed = reversed.filter((brick) => !brick.isProjection);

  assert.deepEqual(
    completed.map(({ open, close }) => ({ open, close })),
    [
      { open: 100, close: 110 },
      { open: 110, close: 120 },
      { open: 110, close: 100 },
    ],
  );
  assert.ok(completed.every((brick) => Math.abs(brick.close - brick.open) === 10));
});

test('keeps an unfinished reversal projection inside the traditional reversal box', () => {
  const partial = buildRenkoBricks(
    [candle(0, 100), candle(1, 120), candle(2, 105)],
    { brickSize: 10 },
  );
  const partialProjection = partial[partial.length - 1];
  assert.deepEqual(
    { open: partialProjection.open, close: partialProjection.close },
    { open: 110, close: 105 },
  );

  const beforeReversalBox = buildRenkoBricks(
    [candle(0, 100), candle(1, 120), candle(2, 115)],
    { brickSize: 10 },
  );
  const neutralProjection = beforeReversalBox[beforeReversalBox.length - 1];
  assert.deepEqual(
    { open: neutralProjection.open, close: neutralProjection.close },
    { open: 115, close: 115 },
  );
});

test('keeps one final projection brick whose close matches the latest source price', () => {
  const bricks = buildRenkoBricks(
    [candle(0, 100), candle(1, 127.25)],
    { brickSize: 10 },
  );
  const projection = bricks[bricks.length - 1];

  assert.equal(projection.isProjection, true);
  assert.equal(projection.open, 120);
  assert.equal(projection.close, 127.25);
  assert.equal(projection.high, 127.25);
  assert.equal(projection.low, 120);
});

test('assigns unique strictly increasing times to bricks emitted by one source candle', () => {
  const bricks = buildRenkoBricks(
    [candle(0, 100), candle(1, 155)],
    { brickSize: 10 },
  );

  assert.equal(new Set(bricks.map((brick) => brick.time)).size, bricks.length);
  for (let index = 1; index < bricks.length; index += 1) {
    assert.ok(bricks[index].time > bricks[index - 1].time);
  }
  assert.ok(bricks.every((brick) => Number.isFinite(brick.time)));
  assert.equal(bricks[0].time, bricks[0].sourceTime);
});

test('keeps existing synthetic brick times stable when the same source candle emits another brick', () => {
  const before = buildRenkoBricks(
    [candle(0, 100), candle(1, 125)],
    { brickSize: 10 },
  );
  const after = buildRenkoBricks(
    [candle(0, 100), candle(1, 135)],
    { brickSize: 10 },
  );

  assert.deepEqual(
    after.slice(0, before.length).map((brick) => brick.time),
    before.map((brick) => brick.time),
  );
});

test('does not create a phantom brick when the first price is off a round-number grid', () => {
  const bricks = buildRenkoBricks(
    [candle(0, 105), candle(1, 100)],
    { brickSize: 10 },
  );

  assert.equal(bricks.filter((brick) => !brick.isProjection).length, 0);
});

test('closes decimal-sized bricks exactly at floating-point threshold prices', () => {
  const bricks = buildRenkoBricks(
    [candle(0, 0.1), candle(1, 0.3)],
    { brickSize: 0.1 },
  );
  const completed = bricks.filter((brick) => !brick.isProjection);

  assert.deepEqual(
    completed.map(({ open, close }) => ({ open, close })),
    [
      { open: 0.1, close: 0.2 },
      { open: 0.2, close: 0.3 },
    ],
  );
});

test('filters invalid OHLC input and gives flat valid input a finite projection', () => {
  const invalid = candle(0, 100, { high: 99, low: 101 });
  const flat = [candle(1, 250), candle(2, 250)];

  assert.deepEqual(buildRenkoBricks([invalid]), []);
  assert.equal(resolveRenkoBrickSize(flat), 0.25);

  const bricks = buildRenkoBricks([invalid, ...flat]);
  assert.equal(bricks.length, 1);
  assert.deepEqual(
    {
      open: bricks[0].open,
      high: bricks[0].high,
      low: bricks[0].low,
      close: bricks[0].close,
      isProjection: bricks[0].isProjection,
    },
    { open: 250, high: 250, low: 250, close: 250, isProjection: true },
  );
});

test('caps completed output while preserving the current-price projection', () => {
  const latestClose = 1_000_000_000;
  const bricks = buildRenkoBricks(
    [candle(0, 1), candle(1, latestClose)],
    { brickSize: 1 },
  );

  assert.equal(bricks.length, MAX_RENKO_BRICKS);
  assert.equal(bricks[bricks.length - 1].isProjection, true);
  assert.equal(bricks[bricks.length - 1].close, latestClose);
  assert.equal(bricks[bricks.length - 2].close, latestClose);
  assert.ok(bricks[0].open > 1, 'the cap must retain the newest completed bricks');
  assert.ok(bricks.every((brick) => (
    Number.isFinite(brick.open)
    && Number.isFinite(brick.high)
    && Number.isFinite(brick.low)
    && Number.isFinite(brick.close)
    && brick.high >= Math.max(brick.open, brick.close)
    && brick.low <= Math.min(brick.open, brick.close)
  )));
});
