import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CANDLE_CENTER_EPSILON,
  computeCandleWickRects,
  createCandleGeometry,
  createSpanFromRoundedX,
  formatCandleGeometryInvariantMessage,
  getCandlestickBorderWidth,
  getBodyCenterFromGeometry,
  getEffectiveBitmapBarSpacing,
  getOptimalCandlestickBodyWidth,
  getOptimalCandlestickWickWidth,
  hasCenteredWickInvariant,
  normalizeCandlestickBodyWidth,
  scaleToBitmapCoordinate,
} from './candleGeometry';

// In screen space Y grows downward, so higher price => smaller Y. A bullish
// candle with full wicks: high above body top, low below body bottom.
test('computeCandleWickRects draws both wicks flush against the body', () => {
  const rects = computeCandleWickRects({
    open: 100,
    close: 110, // bullish: body spans 100..110
    high: 120,
    low: 90,
    bodyTop: 20, // y(110)
    bodyBottom: 40, // y(100)
    wickTop: 10, // y(120)
    wickBottom: 50, // y(90)
  });
  // upper wick occupies rows [10, 19] (flush below to body top at 20)
  assert.equal(rects.upperWickTop, 10);
  assert.equal(rects.upperHeight, 10);
  // lower wick starts one px below body bottom and spans to y(low)
  assert.equal(rects.lowerWickTop, 41);
  assert.equal(rects.lowerHeight, 10);
});

test('computeCandleWickRects draws NO wick when none exists in price terms', () => {
  // high == max(open,close) and low == min(open,close): a wickless marubozu.
  const rects = computeCandleWickRects({
    open: 100,
    close: 110,
    high: 110,
    low: 100,
    bodyTop: 20,
    bodyBottom: 40,
    wickTop: 20,
    wickBottom: 40,
  });
  assert.equal(rects.upperHeight, 0);
  assert.equal(rects.lowerHeight, 0);
});

test('computeCandleWickRects keeps a real-but-tiny wick visible (1px) when rounding collapses it', () => {
  // high is fractionally above the body, so highY rounds onto bodyTop. The wick
  // is real and must not vanish.
  const rects = computeCandleWickRects({
    open: 100,
    close: 110,
    high: 110.0001,
    low: 99.9999,
    bodyTop: 20,
    bodyBottom: 40,
    wickTop: 20, // collapsed onto bodyTop
    wickBottom: 40, // collapsed onto bodyBottom
  });
  assert.equal(rects.upperHeight, 1);
  assert.equal(rects.upperWickTop, 19); // 1px above the body top
  assert.equal(rects.lowerHeight, 1);
  assert.equal(rects.lowerWickTop, 41); // 1px below the body bottom
});

test('computeCandleWickRects handles one-sided wicks (upper only / lower only)', () => {
  const upperOnly = computeCandleWickRects({
    open: 100,
    close: 110,
    high: 120,
    low: 100, // low == body bottom => no lower wick
    bodyTop: 20,
    bodyBottom: 40,
    wickTop: 10,
    wickBottom: 40,
  });
  assert.equal(upperOnly.upperHeight, 10);
  assert.equal(upperOnly.lowerHeight, 0);

  const lowerOnly = computeCandleWickRects({
    open: 110,
    close: 100, // bearish
    high: 110, // high == body top => no upper wick
    low: 90,
    bodyTop: 20,
    bodyBottom: 40,
    wickTop: 20,
    wickBottom: 50,
  });
  assert.equal(lowerOnly.upperHeight, 0);
  assert.equal(lowerOnly.lowerHeight, 10);
});

test('computeCandleWickRects renders nothing for a fully flat (doji-line) candle', () => {
  const rects = computeCandleWickRects({
    open: 100,
    close: 100,
    high: 100,
    low: 100,
    bodyTop: 30,
    bodyBottom: 30,
    wickTop: 30,
    wickBottom: 30,
  });
  assert.equal(rects.upperHeight, 0);
  assert.equal(rects.lowerHeight, 0);
});

test('wickX always equals exact body center for bullish and bearish candles', () => {
  const bullish = createCandleGeometry({
    index: 0,
    roundedX: 42,
    bodyWidth: 6,
    wickWidth: 2,
    openY: 30.2,
    closeY: 18.7,
    highY: 14.1,
    lowY: 37.9,
  });

  const bearish = createCandleGeometry({
    index: 1,
    roundedX: 42,
    bodyWidth: 5,
    wickWidth: 3,
    openY: 18.7,
    closeY: 30.2,
    highY: 14.1,
    lowY: 37.9,
  });

  assert.equal(bullish.wickX, getBodyCenterFromGeometry(bullish));
  assert.equal(bearish.wickX, getBodyCenterFromGeometry(bearish));
  assert.ok(hasCenteredWickInvariant(bullish));
  assert.ok(hasCenteredWickInvariant(bearish));
});

test('upper wick and lower wick stay anchored to the body center for doji candles', () => {
  const doji = createCandleGeometry({
    index: 2,
    roundedX: 17,
    bodyWidth: 3,
    wickWidth: 1,
    openY: 20,
    closeY: 20,
    highY: 10.25,
    lowY: 29.75,
  });

  assert.equal(doji.upperWickBodyY, doji.bodyTop);
  assert.equal(doji.lowerWickBodyY, doji.bodyBottom);
  assert.equal(doji.wickX, getBodyCenterFromGeometry(doji));
  assert.ok(doji.wickTop < doji.bodyTop);
  assert.ok(doji.wickBottom > doji.bodyBottom);
});

test('odd and even body widths keep the same center as the wick width under fractional scaling', () => {
  const rawX = 12.375;
  const dpr = 2.5;
  const roundedX = scaleToBitmapCoordinate(rawX, dpr);

  const evenBody = createCandleGeometry({
    index: 3,
    roundedX,
    bodyWidth: 4,
    wickWidth: 2,
    openY: 14,
    closeY: 21,
    highY: 10,
    lowY: 24,
  });

  const oddBody = createCandleGeometry({
    index: 4,
    roundedX,
    bodyWidth: 5,
    wickWidth: 3,
    openY: 14,
    closeY: 21,
    highY: 10,
    lowY: 24,
  });

  assert.equal(evenBody.wickX, getBodyCenterFromGeometry(evenBody));
  assert.equal(oddBody.wickX, getBodyCenterFromGeometry(oddBody));
  assert.notEqual(evenBody.xCenter, oddBody.xCenter);
});

test('overlap protection shrinks wick symmetrically instead of shifting it sideways', () => {
  const reference = createCandleGeometry({
    index: 5,
    roundedX: 10,
    bodyWidth: 5,
    wickWidth: 3,
    openY: 15,
    closeY: 22,
    highY: 11,
    lowY: 27,
  });

  const crowded = createCandleGeometry({
    index: 6,
    roundedX: 12,
    bodyWidth: 5,
    wickWidth: 3,
    openY: 14,
    closeY: 19,
    highY: 9,
    lowY: 24,
    wickMinLeft: reference.wickRight + 1,
  });

  assert.equal(crowded.wickX, getBodyCenterFromGeometry(crowded));
  assert.ok(crowded.wickWidth < 3);
  assert.ok(crowded.wickLeft >= reference.wickRight + 1);
});

test('very small candle bodies still keep wick and body aligned', () => {
  const geometry = createCandleGeometry({
    index: 7,
    roundedX: 7,
    bodyWidth: 1,
    wickWidth: 1,
    openY: 19.4,
    closeY: 19.6,
    highY: 14.1,
    lowY: 23.9,
  });

  assert.equal(geometry.bodyWidth, 1);
  assert.equal(geometry.wickWidth, 1);
  assert.equal(geometry.wickX, getBodyCenterFromGeometry(geometry));
});

test('invariant formatter includes index and layout values for debugging', () => {
  const geometry = createCandleGeometry({
    index: 8,
    roundedX: 30,
    bodyWidth: 6,
    wickWidth: 2,
    openY: 11,
    closeY: 21,
    highY: 6,
    lowY: 28,
  });

  const message = formatCandleGeometryInvariantMessage(geometry, CANDLE_CENTER_EPSILON);

  assert.match(message, /index=8/);
  assert.match(message, /bodyLeft=/);
  assert.match(message, /wickX=/);
});

test('span creation keeps a deterministic center for odd and even widths', () => {
  const even = createSpanFromRoundedX(50, 6);
  const odd = createSpanFromRoundedX(50, 5);

  assert.equal(even.center, even.left + even.width / 2);
  assert.equal(odd.center, odd.left + odd.width / 2);
  assert.equal(even.left, 47);
  assert.equal(odd.left, 48);
});

test('candlestick width helpers preserve parity between body and wick widths', () => {
  const bitmapSpacing = getEffectiveBitmapBarSpacing(6.25, 1.5);
  const rawBodyWidth = getOptimalCandlestickBodyWidth(bitmapSpacing, 2);
  const wickWidth = getOptimalCandlestickWickWidth(bitmapSpacing, 2, rawBodyWidth);
  const bodyWidth = normalizeCandlestickBodyWidth(rawBodyWidth, wickWidth);
  const borderWidth = getCandlestickBorderWidth(bodyWidth, 2);

  assert.equal(bodyWidth % 2, wickWidth % 2);
  assert.ok(bodyWidth >= wickWidth);
  assert.ok(borderWidth >= 2);
});
