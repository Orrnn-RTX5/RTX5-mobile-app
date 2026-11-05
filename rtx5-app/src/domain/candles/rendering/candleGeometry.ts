/** 
 * Represents a horizontally rendered geometric span (e.g., a wick or a body)
 * in exact pixel coordinates on the canvas. 
 */
export type CandleSpan = {
  center: number;
  left: number;
  right: number;
  width: number;
};

/**
 * A fully calculated, pixel-perfect set of coordinates for drawing a single candlestick.
 * All Y coordinates map directly to prices, and X coordinates map to the time axis.
 */
export type CandleGeometry = {
  index: number;
  roundedX: number;
  xCenter: number;
  bodyLeft: number;
  bodyRight: number;
  bodyWidth: number;
  bodyTop: number;
  bodyBottom: number;
  wickX: number;
  wickLeft: number;
  wickRight: number;
  wickWidth: number;
  wickTop: number;
  wickBottom: number;
  upperWickBodyY: number;
  lowerWickBodyY: number;
};

/** The raw inputs required to calculate the final pixel geometry of a candle. */
export type CandleGeometryInput = {
  index: number;
  roundedX: number;
  bodyWidth: number;
  wickWidth: number;
  openY: number;
  closeY: number;
  highY: number;
  lowY: number;
  wickMinLeft?: number | null;
};

/** Maximum allowed deviation when checking if a wick is perfectly centered on a body. */
export const CANDLE_CENTER_EPSILON = 1e-6;

/** Ensures a calculated width is at least 1 pixel. */
export const clampBitmapWidth = (width: number) => Math.max(1, Math.floor(width));

/** Scales a logical CSS pixel value to actual physical screen pixels based on device density. */
export const scaleToBitmapCoordinate = (value: number, pixelRatio: number) =>
  Math.round(value * pixelRatio);

/** Adjusts the visual spacing between bars based on zoom level and data conflation. */
export const getEffectiveBitmapBarSpacing = (
  barSpacing: number,
  conflationFactor: number = 1,
) => Math.max(barSpacing * Math.max(1, conflationFactor), 0);

/**
 * Calculates the best possible pixel width for a candle body given the current zoom level (`barSpacing`).
 * Employs anti-aliasing logic from TradingView Lightweight Charts to ensure bodies don't overlap 
 * or become invisible when zoomed out.
 */
export const getOptimalCandlestickBodyWidth = (barSpacing: number, pixelRatio: number) => {
  const barSpacingSpecialCaseFrom = 2.5;
  const barSpacingSpecialCaseTo = 4;
  const barSpacingSpecialCaseCoeff = 3;

  if (barSpacing >= barSpacingSpecialCaseFrom && barSpacing <= barSpacingSpecialCaseTo) {
    return clampBitmapWidth(barSpacingSpecialCaseCoeff * pixelRatio);
  }

  const barSpacingReducingCoeff = 0.2;
  const coeff =
    1 -
    (barSpacingReducingCoeff *
      Math.atan(Math.max(barSpacingSpecialCaseTo, barSpacing) - barSpacingSpecialCaseTo)) /
      (Math.PI * 0.5);
  const requestedWidth = Math.floor(barSpacing * coeff * pixelRatio);
  const scaledBarSpacing = Math.floor(barSpacing * pixelRatio);
  const optimalWidth = Math.min(requestedWidth, scaledBarSpacing);
  return Math.max(Math.floor(pixelRatio), optimalWidth);
};

/** Calculates the best pixel width for the wick, ensuring it doesn't exceed the body width. */
export const getOptimalCandlestickWickWidth = (
  barSpacing: number,
  pixelRatio: number,
  bodyWidth: number,
) => {
  const pixelAlignedWidth = Math.floor(pixelRatio);
  const requestedWidth = Math.min(
    pixelAlignedWidth,
    Math.floor(barSpacing * pixelRatio),
  );

  return Math.max(pixelAlignedWidth, Math.min(requestedWidth, bodyWidth));
};

export const normalizeCandlestickBodyWidth = (bodyWidth: number, wickWidth: number) => {
  if (bodyWidth >= 2 && (wickWidth % 2) !== (bodyWidth % 2)) {
    return bodyWidth - 1;
  }

  return bodyWidth;
};

export const getCandlestickBorderWidth = (bodyWidth: number, pixelRatio: number) => {
  let borderWidth = Math.floor(pixelRatio);
  if (bodyWidth <= 2 * borderWidth) {
    borderWidth = Math.floor((bodyWidth - 1) * 0.5);
  }

  const normalizedBorderWidth = Math.max(Math.floor(pixelRatio), borderWidth);
  if (bodyWidth <= normalizedBorderWidth * 2) {
    return Math.max(Math.floor(pixelRatio), Math.floor(pixelRatio));
  }

  return normalizedBorderWidth;
};

export const createSpanFromRoundedX = (
  roundedX: number,
  width: number,
  minLeft?: number | null,
): CandleSpan => {
  const normalizedWidth = clampBitmapWidth(width);
  const center = roundedX + (normalizedWidth % 2 === 0 ? 0 : 0.5);
  return createCenteredSpan(center, normalizedWidth, minLeft);
};

export const createCenteredSpan = (
  center: number,
  width: number,
  minLeft?: number | null,
): CandleSpan => {
  const requestedWidth = clampBitmapWidth(width);
  const minAllowedLeft = minLeft ?? Number.NEGATIVE_INFINITY;
  const requiresOddWidth = Math.abs(center % 1) > CANDLE_CENTER_EPSILON;
  const minCenteredWidth = requiresOddWidth ? 1 : 2;

  let nextWidth = requestedWidth;
  if ((nextWidth % 2 === 1) !== requiresOddWidth) {
    nextWidth = Math.max(0, nextWidth - 1);
  }
  let span = createCenteredSpanAtWidth(center, nextWidth);

  while (span.left < minAllowedLeft && nextWidth > minCenteredWidth) {
    nextWidth -= 2;
    span = createCenteredSpanAtWidth(center, nextWidth);
  }

  if (span.left < minAllowedLeft) {
    span = {
      center,
      left: Math.round(center),
      right: Math.round(center) - 1,
      width: 0,
    };
  }

  return span;
};

/**
 * Calculates the exact bounding boxes for the body and wick of a candlestick.
 * Ensures the wick is perfectly centered within the body, snapping to physical pixels
 * to prevent blurry edges or asymmetric rendering.
 */
export const createCandleGeometry = ({
  index,
  roundedX,
  bodyWidth,
  wickWidth,
  openY,
  closeY,
  highY,
  lowY,
  wickMinLeft,
}: CandleGeometryInput): CandleGeometry => {
  const body = createSpanFromRoundedX(roundedX, bodyWidth);
  const wick = createCenteredSpan(body.center, wickWidth, wickMinLeft);
  const bodyTop = Math.round(Math.min(openY, closeY));
  const bodyBottom = Math.round(Math.max(openY, closeY));
  const wickTop = Math.round(highY);
  const wickBottom = Math.round(lowY);

  return {
    index,
    roundedX,
    xCenter: body.center,
    bodyLeft: body.left,
    bodyRight: body.right,
    bodyWidth: body.width,
    bodyTop,
    bodyBottom,
    wickX: body.center,
    wickLeft: wick.left,
    wickRight: wick.right,
    wickWidth: wick.width,
    wickTop,
    wickBottom,
    upperWickBodyY: bodyTop,
    lowerWickBodyY: bodyBottom,
  };
};

/** Pixel rectangles for a candle's two wicks, in screen space (Y grows downward). */
export type CandleWickRects = {
  /** Top Y of the upper-wick rect; draw height `upperHeight` downward from here. */
  upperWickTop: number;
  /** Upper-wick rect height in px. 0 ⇒ no upper wick to draw. */
  upperHeight: number;
  /** Top Y of the lower-wick rect (one px below the body bottom). */
  lowerWickTop: number;
  /** Lower-wick rect height in px. 0 ⇒ no lower wick to draw. */
  lowerHeight: number;
};

export type CandleWickRectsInput = {
  open: number;
  high: number;
  low: number;
  close: number;
  /** Rounded Y of the body top (the higher-priced of open/close). */
  bodyTop: number;
  /** Rounded Y of the body bottom (the lower-priced of open/close). */
  bodyBottom: number;
  /** Rounded Y of the high price. */
  wickTop: number;
  /** Rounded Y of the low price. */
  wickBottom: number;
};

/**
 * Computes the upper/lower wick rectangles with a price-aware minimum-visibility
 * rule. This is the fix for wicks that render "missing", "too small", or
 * "disconnected":
 *
 *  - A wick is drawn only when it exists in PRICE terms — `high > max(open,close)`
 *    for the upper wick, `low < min(open,close)` for the lower. This removes the
 *    phantom 1px stub the old `+1` height produced for wickless candles.
 *  - When a wick DOES exist but independent pixel rounding has collapsed its tip
 *    onto the body edge (`round(highY) === round(bodyTop)`), it is nudged to a
 *    guaranteed 1px so a real wick can never visually vanish — matching MT5 /
 *    TradingView, which always show a real wick.
 *  - Rects sit flush against the body (adjacent, never overlapping or detached):
 *      upper wick → rows [upperWickTop, bodyTop - 1]
 *      lower wick → rows [bodyBottom + 1, bodyBottom + lowerHeight]
 *
 * Inputs are the original OHLC prices plus the already-rounded body/wick Y
 * coordinates from {@link createCandleGeometry}.
 */
export const computeCandleWickRects = ({
  open,
  high,
  low,
  close,
  bodyTop,
  bodyBottom,
  wickTop,
  wickBottom,
}: CandleWickRectsInput): CandleWickRects => {
  const hasUpperWick = high > Math.max(open, close);
  const hasLowerWick = low < Math.min(open, close);

  let upperWickTop = wickTop;
  if (hasUpperWick && upperWickTop >= bodyTop) {
    // Real wick that rounded onto the body edge — pull it 1px clear so it shows.
    upperWickTop = bodyTop - 1;
  }
  const upperHeight = hasUpperWick ? Math.max(0, bodyTop - upperWickTop) : 0;

  let lowerWickBottom = wickBottom;
  if (hasLowerWick && lowerWickBottom <= bodyBottom) {
    lowerWickBottom = bodyBottom + 1;
  }
  const lowerHeight = hasLowerWick ? Math.max(0, lowerWickBottom - bodyBottom) : 0;

  return {
    upperWickTop,
    upperHeight,
    lowerWickTop: bodyBottom + 1,
    lowerHeight,
  };
};

export const getBodyCenterFromGeometry = (geometry: Pick<CandleGeometry, 'bodyLeft' | 'bodyWidth'>) =>
  geometry.bodyLeft + geometry.bodyWidth / 2;

export const getCandleGeometryInvariantDelta = (
  geometry: Pick<CandleGeometry, 'bodyLeft' | 'bodyWidth' | 'wickX'>,
) => Math.abs(getBodyCenterFromGeometry(geometry) - geometry.wickX);

/** Verifies that a generated candle geometry maintains the wick perfectly centered on the body. */
export const hasCenteredWickInvariant = (
  geometry: Pick<CandleGeometry, 'bodyLeft' | 'bodyWidth' | 'wickX'>,
  epsilon: number = CANDLE_CENTER_EPSILON,
) => getCandleGeometryInvariantDelta(geometry) < epsilon;

export const formatCandleGeometryInvariantMessage = (
  geometry: CandleGeometry,
  epsilon: number = CANDLE_CENTER_EPSILON,
) =>
  [
    'RTX5 candle geometry invariant violated',
    `index=${geometry.index}`,
    `epsilon=${epsilon}`,
    `roundedX=${geometry.roundedX}`,
    `xCenter=${geometry.xCenter}`,
    `bodyLeft=${geometry.bodyLeft}`,
    `bodyRight=${geometry.bodyRight}`,
    `bodyWidth=${geometry.bodyWidth}`,
    `bodyTop=${geometry.bodyTop}`,
    `bodyBottom=${geometry.bodyBottom}`,
    `wickX=${geometry.wickX}`,
    `wickLeft=${geometry.wickLeft}`,
    `wickRight=${geometry.wickRight}`,
    `wickWidth=${geometry.wickWidth}`,
    `wickTop=${geometry.wickTop}`,
    `wickBottom=${geometry.wickBottom}`,
  ].join(' ');

const createCenteredSpanAtWidth = (center: number, width: number): CandleSpan => {
  const normalizedWidth = Math.max(0, Math.floor(width));
  if (normalizedWidth === 0) {
    return {
      center,
      left: Math.round(center),
      right: Math.round(center) - 1,
      width: 0,
    };
  }
  const left = Math.round(center - normalizedWidth / 2);

  return {
    center: left + normalizedWidth / 2,
    left,
    right: left + normalizedWidth - 1,
    width: normalizedWidth,
  };
};
