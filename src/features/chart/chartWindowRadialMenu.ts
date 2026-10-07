import type { ChartTapMenuAnchor, ChartTapMenuBounds } from './components/ChartTapRadialMenu';
import type { ChartWindowPane } from './chartWindowState';

export type ChartWindowPaneGesture = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
  price: number | null;
  dataContextKey: string;
  dataGeneration: number;
  ownerCredentialScopeKey: string;
}>;

export type ChartWindowRadialMenuRequest = Readonly<{
  paneId: string;
  symbol: string;
  timeframe: string;
  gesture: ChartWindowPaneGesture;
}>;

type ChartWindowContext = Readonly<{
  symbol: string;
  timeframe: string;
}>;

const toFiniteNumber = (value: unknown): number | null => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

/**
 * Accepts a preview gesture only when it belongs to the WebView context that is
 * currently painted. Delayed taps from a previous broker/symbol/timeframe are
 * rejected before they can select a pane or open chart actions.
 */
export const resolveChartWindowPaneGesture = (
  payload: unknown,
  expectedDataContextKey: string,
  expectedDataGeneration: number,
  ownerCredentialScopeKey: string,
): ChartWindowPaneGesture | null => {
  if (!payload || typeof payload !== 'object') return null;
  const candidate = payload as Record<string, unknown>;
  const x = toFiniteNumber(candidate.x);
  const y = toFiniteNumber(candidate.y);
  const width = toFiniteNumber(candidate.width);
  const height = toFiniteNumber(candidate.height);
  const generation = toFiniteNumber(candidate.dataGeneration);
  const price = candidate.price === null || candidate.price === undefined
    ? null
    : toFiniteNumber(candidate.price);

  if (
    x === null
    || y === null
    || width === null
    || height === null
    || width <= 0
    || height <= 0
    || generation === null
    || !Number.isInteger(generation)
    || generation < 1
    || !ownerCredentialScopeKey
    || candidate.dataContextKey !== expectedDataContextKey
    || generation !== expectedDataGeneration
    || (candidate.price !== null && candidate.price !== undefined && price === null)
  ) {
    return null;
  }

  return Object.freeze({
    x,
    y,
    width,
    height,
    price,
    dataContextKey: expectedDataContextKey,
    dataGeneration: generation,
    ownerCredentialScopeKey,
  });
};

export const createChartWindowRadialMenuRequest = (
  pane: ChartWindowPane,
  gesture: ChartWindowPaneGesture,
): ChartWindowRadialMenuRequest => Object.freeze({
  paneId: pane.id,
  symbol: pane.symbol,
  timeframe: pane.timeframe,
  gesture,
});

export const isChartWindowRadialMenuRequestConfirmed = (
  request: ChartWindowRadialMenuRequest,
  pane: ChartWindowPane,
  context: ChartWindowContext,
  currentCredentialScopeKey: string = request.gesture.ownerCredentialScopeKey,
): boolean => (
  request.paneId === pane.id
  && request.symbol === pane.symbol
  && request.timeframe === pane.timeframe
  && pane.symbol === context.symbol
  && pane.timeframe === context.timeframe
  && request.gesture.ownerCredentialScopeKey === currentCredentialScopeKey
);

/** Maps an auxiliary WebView-local point into the selected full-chart viewport. */
export const mapChartWindowGestureToMenuAnchor = (
  gesture: ChartWindowPaneGesture,
  bounds: ChartTapMenuBounds,
): ChartTapMenuAnchor | null => {
  if (
    !Number.isFinite(bounds.width)
    || !Number.isFinite(bounds.height)
    || bounds.width <= 0
    || bounds.height <= 0
    || gesture.width <= 0
    || gesture.height <= 0
  ) {
    return null;
  }

  const xRatio = Math.min(1, Math.max(0, gesture.x / gesture.width));
  const yRatio = Math.min(1, Math.max(0, gesture.y / gesture.height));
  return Object.freeze({
    x: xRatio * bounds.width,
    y: yRatio * bounds.height,
    price: gesture.price,
  });
};
