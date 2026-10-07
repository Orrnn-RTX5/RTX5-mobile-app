export const MT5_PRICE_SCALE_OCTAVES_PER_PLOT = 4;
export const MT5_PRICE_SCALE_BOUND_OCTAVES = 4;
export const MT5_PRICE_SCALE_MAX_DRAG_OCTAVES = 8;
export const MT5_PRICE_SCALE_MIN_VISIBLE_TICK_INTERVALS = 6;

export type Mt5PriceScaleDragInput = {
  anchorRatio: number;
  boundOctaves: number;
  deltaY: number;
  maxDragOctaves: number;
  minMove: number;
  minimumSpan?: number;
  minVisibleTickIntervals: number;
  octavesPerPlot: number;
  plotHeight: number;
  referenceSpan: number;
  startFrom: number;
  startTo: number;
};

export type Mt5PriceScaleDragRange = {
  anchorPrice: number;
  from: number;
  span: number;
  to: number;
};

/**
 * Hermes exposes compiled functions through Function#toString as a
 * `[bytecode]` placeholder. Keep an explicit source form for the chart's
 * isolated WebView instead of serializing the TypeScript function at runtime.
 */
export const MT5_PRICE_SCALE_GESTURE_WEBVIEW_JS = `
function resolveMt5PriceScaleDragRange(input) {
  if (!input || typeof input !== 'object') {
    return null;
  }
  var anchorRatio = input.anchorRatio;
  var boundOctaves = input.boundOctaves;
  var deltaY = input.deltaY;
  var maxDragOctaves = input.maxDragOctaves;
  var minMove = input.minMove;
  var minimumSpan = input.minimumSpan;
  var minVisibleTickIntervals = input.minVisibleTickIntervals;
  var octavesPerPlot = input.octavesPerPlot;
  var plotHeight = input.plotHeight;
  var referenceSpan = input.referenceSpan;
  var startFrom = input.startFrom;
  var startTo = input.startTo;
  if (
    typeof startFrom !== 'number' ||
    !isFinite(startFrom) ||
    typeof startTo !== 'number' ||
    !isFinite(startTo) ||
    typeof anchorRatio !== 'number' ||
    !isFinite(anchorRatio) ||
    typeof deltaY !== 'number' ||
    !isFinite(deltaY) ||
    typeof referenceSpan !== 'number' ||
    !isFinite(referenceSpan) ||
    typeof plotHeight !== 'number' ||
    !isFinite(plotHeight) ||
    typeof minMove !== 'number' ||
    !isFinite(minMove) ||
    typeof octavesPerPlot !== 'number' ||
    !isFinite(octavesPerPlot) ||
    typeof boundOctaves !== 'number' ||
    !isFinite(boundOctaves) ||
    typeof maxDragOctaves !== 'number' ||
    !isFinite(maxDragOctaves) ||
    typeof minVisibleTickIntervals !== 'number' ||
    !isFinite(minVisibleTickIntervals)
  ) {
    return null;
  }
  var startSpan = startTo - startFrom;
  if (
    !(startSpan > 0) ||
    !(referenceSpan > 0) ||
    !(plotHeight > 0) ||
    !(minMove > 0) ||
    !(octavesPerPlot > 0) ||
    !(boundOctaves >= 0) ||
    !(maxDragOctaves >= 0) ||
    !(minVisibleTickIntervals > 0)
  ) {
    return null;
  }
  var resolvedAnchorRatio = anchorRatio;
  var anchorPrice = startTo - resolvedAnchorRatio * startSpan;
  if (deltaY === 0) {
    return {
      anchorPrice: anchorPrice,
      from: startFrom,
      span: startSpan,
      to: startTo,
    };
  }
  var dragOctaves = Math.max(
    -maxDragOctaves,
    Math.min(maxDragOctaves, (octavesPerPlot * deltaY) / plotHeight)
  );
  var boundFactor = Math.pow(2, boundOctaves);
  var minSpan =
    typeof minimumSpan === 'number' && isFinite(minimumSpan) && minimumSpan > 0
      ? minimumSpan
      : minMove * minVisibleTickIntervals;
  var maxSpan = Math.max(referenceSpan, minSpan) * boundFactor;
  var span = Math.max(
    minSpan,
    Math.min(maxSpan, startSpan * Math.pow(2, dragOctaves))
  );
  var to = anchorPrice + resolvedAnchorRatio * span;
  return {
    anchorPrice: anchorPrice,
    from: to - span,
    span: span,
    to: to,
  };
}
`;

/**
 * Resolves an MT5-style right-axis drag. Negative deltaY zooms in, positive
 * deltaY zooms out, and the price under the initial finger stays stationary.
 * Keep this function self-contained because its source is injected into the
 * chart WebView at runtime.
 */
export function resolveMt5PriceScaleDragRange(
  input: Mt5PriceScaleDragInput,
): Mt5PriceScaleDragRange | null {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const {
    anchorRatio,
    boundOctaves,
    deltaY,
    maxDragOctaves,
    minMove,
    minimumSpan,
    minVisibleTickIntervals,
    octavesPerPlot,
    plotHeight,
    referenceSpan,
    startFrom,
    startTo,
  } = input;
  if (
    typeof startFrom !== 'number' ||
    !isFinite(startFrom) ||
    typeof startTo !== 'number' ||
    !isFinite(startTo) ||
    typeof anchorRatio !== 'number' ||
    !isFinite(anchorRatio) ||
    typeof deltaY !== 'number' ||
    !isFinite(deltaY) ||
    typeof referenceSpan !== 'number' ||
    !isFinite(referenceSpan) ||
    typeof plotHeight !== 'number' ||
    !isFinite(plotHeight) ||
    typeof minMove !== 'number' ||
    !isFinite(minMove) ||
    typeof octavesPerPlot !== 'number' ||
    !isFinite(octavesPerPlot) ||
    typeof boundOctaves !== 'number' ||
    !isFinite(boundOctaves) ||
    typeof maxDragOctaves !== 'number' ||
    !isFinite(maxDragOctaves) ||
    typeof minVisibleTickIntervals !== 'number' ||
    !isFinite(minVisibleTickIntervals)
  ) {
    return null;
  }

  const startSpan = startTo - startFrom;
  if (
    !(startSpan > 0) ||
    !(referenceSpan > 0) ||
    !(plotHeight > 0) ||
    !(minMove > 0) ||
    !(octavesPerPlot > 0) ||
    !(boundOctaves >= 0) ||
    !(maxDragOctaves >= 0) ||
    !(minVisibleTickIntervals > 0)
  ) {
    return null;
  }

  // Lightweight Charts maps the logical visible range through its configured
  // top/bottom scale margins. A finger inside either margin therefore resolves
  // to a price outside the logical range and legitimately produces an anchor
  // ratio below 0 or above 1. Keeping that ratio unbounded is what preserves
  // the exact price under the finger across the drag.
  const resolvedAnchorRatio = anchorRatio;
  const anchorPrice = startTo - resolvedAnchorRatio * startSpan;
  if (deltaY === 0) {
    return {
      anchorPrice,
      from: startFrom,
      span: startSpan,
      to: startTo,
    };
  }
  const dragOctaves = Math.max(
    -maxDragOctaves,
    Math.min(maxDragOctaves, (octavesPerPlot * deltaY) / plotHeight),
  );
  // Zoom-in must reach the symbol's actual smallest displayed increment. A
  // reference-relative floor (referenceSpan / 16) stopped large-price symbols
  // such as XAUUSD far too early, leaving adjacent labels about 0.08 apart.
  // The WebView supplies an exact logical floor projected from its full-height
  // owned axis; the interval-based value remains a safe non-DOM fallback.
  const boundFactor = Math.pow(2, boundOctaves);
  const minSpan =
    typeof minimumSpan === 'number' &&
    isFinite(minimumSpan) &&
    minimumSpan > 0
      ? minimumSpan
      : minMove * minVisibleTickIntervals;
  // Keep the existing reference-relative limit in the zoom-out direction.
  const maxSpan = Math.max(referenceSpan, minSpan) * boundFactor;
  const span = Math.max(
    minSpan,
    Math.min(maxSpan, startSpan * Math.pow(2, dragOctaves)),
  );
  const to = anchorPrice + resolvedAnchorRatio * span;

  return {
    anchorPrice,
    from: to - span,
    span,
    to,
  };
}
