import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MT5_PRICE_SCALE_BOUND_OCTAVES,
  MT5_PRICE_SCALE_MAX_DRAG_OCTAVES,
  MT5_PRICE_SCALE_MIN_VISIBLE_TICK_INTERVALS,
  MT5_PRICE_SCALE_OCTAVES_PER_PLOT,
  MT5_PRICE_SCALE_GESTURE_WEBVIEW_JS,
  type Mt5PriceScaleDragInput,
  resolveMt5PriceScaleDragRange,
} from './mt5PriceScaleGesture';

const resolveWebViewRange = new Function(
  `${MT5_PRICE_SCALE_GESTURE_WEBVIEW_JS}; return resolveMt5PriceScaleDragRange;`,
)() as typeof resolveMt5PriceScaleDragRange;

const BASE_INPUT: Mt5PriceScaleDragInput = {
  anchorRatio: 0.33,
  boundOctaves: MT5_PRICE_SCALE_BOUND_OCTAVES,
  deltaY: 0,
  maxDragOctaves: MT5_PRICE_SCALE_MAX_DRAG_OCTAVES,
  minMove: 0.01,
  minVisibleTickIntervals: MT5_PRICE_SCALE_MIN_VISIBLE_TICK_INTERVALS,
  octavesPerPlot: MT5_PRICE_SCALE_OCTAVES_PER_PLOT,
  plotHeight: 1000,
  referenceSpan: 200,
  startFrom: 3900,
  startTo: 4100,
};

const resolveRange = (overrides: Partial<Mt5PriceScaleDragInput> = {}) =>
  resolveMt5PriceScaleDragRange({ ...BASE_INPUT, ...overrides });

test('upward right-axis drag shrinks the visible price span', () => {
  const range = resolveRange({ deltaY: -100 });

  assert.ok(range);
  assert.ok(range.span < 200);
});

test('downward right-axis drag enlarges the visible price span', () => {
  const range = resolveRange({ deltaY: 100 });

  assert.ok(range);
  assert.ok(range.span > 200);
});

test('quarter-pane drag halves or doubles the visible span', () => {
  assert.equal(resolveRange({ deltaY: -250 })?.span, 100);
  assert.equal(resolveRange({ deltaY: 250 })?.span, 400);
});

test('right-axis scaling preserves the price under the initial finger', () => {
  const anchorRatio = 0.327;
  const range = resolveRange({
    anchorRatio,
    deltaY: -300,
    referenceSpan: 151.05,
    startFrom: 4238.9,
    startTo: 4389.95,
  });

  assert.ok(range);
  const anchoredPriceAfterScale = range.to - anchorRatio * range.span;
  assert.ok(Math.abs(anchoredPriceAfterScale - range.anchorPrice) < 1e-9);
});

test('focal scaling preserves a finger price inside a chart scale margin', () => {
  const anchorRatio = 1.24;
  const range = resolveRange({ anchorRatio, deltaY: -250 });

  assert.ok(range);
  assert.equal(range.anchorPrice, 3852);
  assert.equal(range.to - anchorRatio * range.span, range.anchorPrice);
});

test('off-center focal scaling shifts the range center around the finger price', () => {
  const range = resolveRange({ anchorRatio: 0.25, deltaY: -250 });

  assert.deepEqual(range, {
    anchorPrice: 4050,
    from: 3975,
    span: 100,
    to: 4075,
  });
});

test('repeated right-axis gestures keep the zoom-out reference envelope', () => {
  const referenceSpan = 10;
  const maxSpan = referenceSpan * 16;
  const zoomedIn = resolveRange({
    deltaY: -10_000,
    referenceSpan,
    startFrom: 100,
    startTo: 110,
  });
  const zoomedOut = resolveRange({
    deltaY: 10_000,
    referenceSpan,
    startFrom: 100,
    startTo: 110,
  });

  assert.equal(
    zoomedIn?.span,
    BASE_INPUT.minMove * MT5_PRICE_SCALE_MIN_VISIBLE_TICK_INTERVALS,
  );
  assert.equal(zoomedOut?.span, maxSpan);
});

test('right-axis scaling is identical for equal pane-relative movement', () => {
  const shortPane = resolveRange({ deltaY: 125, plotHeight: 500 });
  const tallPane = resolveRange({ deltaY: 250, plotHeight: 1000 });

  assert.equal(shortPane?.span, tallPane?.span);
  assert.equal(shortPane?.from, tallPane?.from);
  assert.equal(shortPane?.to, tallPane?.to);
});

test('normalized scaling is symbol-independent above the minimum tick floor', () => {
  const gold = resolveRange({ deltaY: -125, minMove: 0.01 });
  const eurusd = resolveRange({ deltaY: -125, minMove: 0.00001 });

  assert.deepEqual(gold, eurusd);
});

test('maximum zoom keeps at least six minimum-price intervals visible', () => {
  const minMove = 0.01;
  const range = resolveRange({
    deltaY: -10_000,
    minMove,
    referenceSpan: 0.001,
    startFrom: 100,
    startTo: 100.001,
  });

  assert.ok(range);
  assert.equal(range.span, minMove * MT5_PRICE_SCALE_MIN_VISIBLE_TICK_INTERVALS);
});

test('maximum zoom reaches one displayed price unit for a normal XAUUSD range', () => {
  const range = resolveRange({
    deltaY: -10_000,
    minMove: 0.01,
    referenceSpan: 10,
    startFrom: 4338,
    startTo: 4348,
  });

  assert.equal(range?.span, 0.01 * MT5_PRICE_SCALE_MIN_VISIBLE_TICK_INTERVALS);
});

test('projected maximum zoom yields one displayed unit for every symbol precision', () => {
  const cases = [
    { decimals: 0, projection: 1 },
    { decimals: 1, projection: 0.97 },
    { decimals: 2, projection: 1.47 },
    { decimals: 3, projection: 1 },
    { decimals: 5, projection: 1.47 },
    { decimals: 8, projection: 0.97 },
  ];
  const labelIntervals = 9;

  for (const { decimals, projection } of cases) {
    const minMove = Math.pow(10, -decimals);
    const minimumSpan = (labelIntervals * minMove) / projection;
    const startSpan = minimumSpan * 100;
    const range = resolveRange({
      deltaY: -10_000,
      minMove,
      minimumSpan,
      referenceSpan: startSpan,
      startFrom: 0,
      startTo: startSpan,
    });

    assert.ok(range);
    assert.ok(Math.abs(range.span - minimumSpan) <= Math.max(1e-12, minimumSpan * 1e-12));
    const renderedAdjacentStep = (range.span * projection) / labelIntervals;
    assert.ok(Math.abs(renderedAdjacentStep - minMove) <= Math.max(1e-12, minMove * 1e-12));
  }
});

test('zero movement preserves the exact starting range', () => {
  const range = resolveRange();

  assert.equal(range?.from, BASE_INPUT.startFrom);
  assert.equal(range?.to, BASE_INPUT.startTo);
});

test('invalid plot geometry is rejected', () => {
  assert.equal(resolveRange({ plotHeight: 0 }), null);
  assert.equal(resolveRange({ startFrom: 10, startTo: 10 }), null);
});

test('explicit WebView resolver stays byte-for-byte behaviorally aligned', () => {
  const cases: Array<Partial<Mt5PriceScaleDragInput>> = [
    {},
    { deltaY: -250 },
    { deltaY: 250 },
    { anchorRatio: 1.24, deltaY: -250 },
    { deltaY: -10_000, minMove: 0.01, referenceSpan: 0.001 },
    { deltaY: -10_000, minMove: 0.01, referenceSpan: 10 },
    { deltaY: -10_000, minMove: 0.00001, referenceSpan: 0.01 },
    { deltaY: -10_000, minMove: 0.01, minimumSpan: 0.09 / 1.47 },
  ];

  for (const overrides of cases) {
    const input = { ...BASE_INPUT, ...overrides };
    assert.deepEqual(resolveWebViewRange(input), resolveMt5PriceScaleDragRange(input));
  }
});
