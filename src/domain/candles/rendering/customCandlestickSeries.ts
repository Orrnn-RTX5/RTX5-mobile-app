import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import {
  customSeriesDefaultOptions,
  type CustomData,
  type CustomSeriesWhitespaceData,
  type CustomSeriesOptions,
  type ICustomSeriesPaneRenderer,
  type ICustomSeriesPaneView,
  type PaneRendererCustomData,
  type PriceToCoordinateConverter,
} from 'lightweight-charts';

import {
  CANDLE_CENTER_EPSILON,
  computeCandleWickRects,
  createCandleGeometry,
  formatCandleGeometryInvariantMessage,
  getCandlestickBorderWidth,
  getEffectiveBitmapBarSpacing,
  getOptimalCandlestickBodyWidth,
  getOptimalCandlestickWickWidth,
  hasCenteredWickInvariant,
  normalizeCandlestickBodyWidth,
  scaleToBitmapCoordinate,
} from './candleGeometry';
import { resolveRTX5CustomCandleOpacity } from './customCandleOpacity';

/**
 * Visual modes that share the custom OHLC body renderer. Renko uses the same
 * body geometry as candles but turns wicks off through the options below.
 */
export type RTX5CustomCandleChartType = 'candles' | 'hollow' | 'renko';

/** Lightweight Charts custom data interface extended with core OHLCV values. */
export type RTX5CustomCandlestickData = CustomData<any> & {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  color?: string;
};

/** Full set of styling options specific to our custom renderer. */
export type RTX5CustomCandlestickSeriesOptions = CustomSeriesOptions & {
  candleOpacity: number;
  bearishCandleOpacity: number;
  bodyUpColor: string;
  bodyDownColor: string;
  borderUpColor: string;
  borderDownColor: string;
  wickUpColor: string;
  wickDownColor: string;
  borderVisible: boolean;
  wickVisible: boolean;
};

type BuildRTX5CustomCandlestickSeriesOptionsArgs = {
  candleOpacity?: number;
  bearishCandleOpacity?: number;
  bodyUpColor: string;
  bodyDownColor: string;
  borderUpColor: string;
  borderDownColor: string;
  wickUpColor: string;
  wickDownColor: string;
  priceFormat: NonNullable<CustomSeriesOptions['priceFormat']>;
  lastValueVisible?: boolean;
  priceLineVisible?: boolean;
  // These switches let the wickless Renko presentation reuse the proven
  // candle renderer instead of maintaining a second drawing implementation.
  borderVisible?: boolean;
  wickVisible?: boolean;
};

type MapRTX5CustomCandlesArgs = {
  candles: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }>;
  bullishColor: string;
  bearishColor: string;
};

const DEFAULT_CUSTOM_CANDLE_OPTIONS: RTX5CustomCandlestickSeriesOptions = {
  ...customSeriesDefaultOptions,
  candleOpacity: 1,
  bearishCandleOpacity: 1,
  bodyUpColor: '#2962FF',
  bodyDownColor: '#EF5350',
  borderUpColor: '#2962FF',
  borderDownColor: '#EF5350',
  wickUpColor: '#2962FF',
  wickDownColor: '#EF5350',
  borderVisible: true,
  wickVisible: true,
  color: '#2962FF',
};

const SHOULD_LOG_CENTER_INVARIANTS =
  typeof __DEV__ !== 'undefined' ? __DEV__ : true;

const DENSE_CANDLE_LINE_MAX_BAR_SPACING = 3.25;

const shouldRenderDenseCandleAsLine = (
  barSpacing: number,
  bodyWidth: number,
  pixelRatio: number,
) => {
  const oneCssPixel = Math.max(1, Math.floor(pixelRatio));
  return barSpacing <= DENSE_CANDLE_LINE_MAX_BAR_SPACING || bodyWidth <= oneCssPixel * 2;
};

const fillDenseCandleLine = (
  ctx: CanvasRenderingContext2D,
  geometry: {
    wickLeft: number;
    wickWidth: number;
    wickTop: number;
    wickBottom: number;
    bodyTop: number;
    bodyBottom: number;
  },
  color: string,
) => {
  const top = Math.min(geometry.wickTop, geometry.bodyTop, geometry.bodyBottom);
  const bottom = Math.max(geometry.wickBottom, geometry.bodyTop, geometry.bodyBottom);
  ctx.fillStyle = color;
  ctx.fillRect(
    geometry.wickLeft,
    top,
    Math.max(1, geometry.wickWidth),
    Math.max(1, bottom - top + 1),
  );
};

/**
 * Draws an inner border within a bounding box. 
 * Prevents the border from spilling out into the anti-aliasing space,
 * ensuring sharp 1px borders regardless of zoom level.
 */
const fillRectInnerBorder = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  borderWidth: number,
) => {
  ctx.fillRect(x, y, width, borderWidth);
  ctx.fillRect(x, y + height - borderWidth, width, borderWidth);
  ctx.fillRect(x, y, borderWidth, height);
  ctx.fillRect(x + width - borderWidth, y, borderWidth, height);
};

const isTransparentFill = (color: string) => color.trim().toLowerCase() === 'transparent';

/**
 * Converts a raw price value into a physical Y-axis pixel coordinate on the canvas.
 * Correctly scales the logical coordinate by the device pixel ratio to maintain crispness.
 */
const normalizeCoordinate = (
  priceToCoordinate: PriceToCoordinateConverter,
  price: number,
  verticalPixelRatio: number,
) => {
  const coordinate = priceToCoordinate(price);
  return coordinate === null ? null : coordinate * verticalPixelRatio;
};

/**
 * Low-level Canvas API renderer for our custom candlestick style.
 * Iterates over the visible time range and manually calculates sub-pixel bounds
 * for each candle's wick and body, applying custom color overrides.
 * 
 * Replaces the default Lightweight Charts renderer to give us pixel-perfect control
 * over borders and transparent/hollow candle fills.
 */
class RTX5CustomCandlestickRenderer implements ICustomSeriesPaneRenderer {
  private data: PaneRendererCustomData<any, RTX5CustomCandlestickData> | null = null;
  private options: RTX5CustomCandlestickSeriesOptions = DEFAULT_CUSTOM_CANDLE_OPTIONS;

  public update(
    data: PaneRendererCustomData<any, RTX5CustomCandlestickData>,
    options: RTX5CustomCandlestickSeriesOptions,
  ) {
    this.data = data;
    this.options = options;
  }

  public draw(
    target: CanvasRenderingTarget2D,
    priceToCoordinate: PriceToCoordinateConverter,
  ) {
    if (this.data === null || this.data.visibleRange === null || this.data.bars.length === 0) {
      return;
    }

    const data = this.data;
    const visibleRange = data.visibleRange;
    if (visibleRange === null) {
      return;
    }
    target.useBitmapCoordinateSpace(({ context, horizontalPixelRatio, verticalPixelRatio }) => {
      if (!Number.isFinite(horizontalPixelRatio) || !Number.isFinite(verticalPixelRatio)) {
        return;
      }

      const bitmapBarSpacing = getEffectiveBitmapBarSpacing(
        data.barSpacing,
        data.conflationFactor,
      );
      const rawBodyWidth = getOptimalCandlestickBodyWidth(bitmapBarSpacing, horizontalPixelRatio);
      const wickWidth = getOptimalCandlestickWickWidth(
        bitmapBarSpacing,
        horizontalPixelRatio,
        rawBodyWidth,
      );
      const bodyWidth = normalizeCandlestickBodyWidth(rawBodyWidth, wickWidth);
      const borderWidth = getCandlestickBorderWidth(bodyWidth, horizontalPixelRatio);

      let previousWickRight: number | null = null;

      for (let index = visibleRange.from; index < visibleRange.to; index += 1) {
        const bar = data.bars[index];
        const openY = normalizeCoordinate(priceToCoordinate, bar.originalData.open, verticalPixelRatio);
        const closeY = normalizeCoordinate(priceToCoordinate, bar.originalData.close, verticalPixelRatio);
        const highY = normalizeCoordinate(priceToCoordinate, bar.originalData.high, verticalPixelRatio);
        const lowY = normalizeCoordinate(priceToCoordinate, bar.originalData.low, verticalPixelRatio);

        if (openY === null || closeY === null || highY === null || lowY === null) {
          continue;
        }

        const geometry = createCandleGeometry({
          index,
          roundedX: scaleToBitmapCoordinate(bar.x, horizontalPixelRatio),
          bodyWidth,
          wickWidth,
          openY,
          closeY,
          highY,
          lowY,
          wickMinLeft: previousWickRight === null ? null : previousWickRight + 1,
        });
        const isBullish = bar.originalData.close >= bar.originalData.open;
        context.globalAlpha = resolveRTX5CustomCandleOpacity(
          isBullish ? this.options.candleOpacity : this.options.bearishCandleOpacity,
        );
        const bodyColor = isBullish ? this.options.bodyUpColor : this.options.bodyDownColor;
        const borderColor = isBullish ? this.options.borderUpColor : this.options.borderDownColor;
        const wickColor = isBullish ? this.options.wickUpColor : this.options.wickDownColor;

        if (
          SHOULD_LOG_CENTER_INVARIANTS &&
          !hasCenteredWickInvariant(geometry, CANDLE_CENTER_EPSILON)
        ) {
          // This should never fire once the renderer is wired correctly.
          console.error(formatCandleGeometryInvariantMessage(geometry, CANDLE_CENTER_EPSILON));
        }

        if (shouldRenderDenseCandleAsLine(bitmapBarSpacing, bodyWidth, horizontalPixelRatio)) {
          fillDenseCandleLine(context, geometry, wickColor);
          previousWickRight = geometry.wickRight;
          continue;
        }

        if (this.options.wickVisible && geometry.wickWidth > 0) {
          // Price-aware wick rects: draw a wick only when one exists in price
          // terms, and never let a real-but-tiny wick collapse onto the body.
          const wicks = computeCandleWickRects({
            open: bar.originalData.open,
            high: bar.originalData.high,
            low: bar.originalData.low,
            close: bar.originalData.close,
            bodyTop: geometry.bodyTop,
            bodyBottom: geometry.bodyBottom,
            wickTop: geometry.wickTop,
            wickBottom: geometry.wickBottom,
          });

          context.fillStyle = wickColor;
          if (wicks.upperHeight > 0) {
            context.fillRect(
              geometry.wickLeft,
              wicks.upperWickTop,
              geometry.wickWidth,
              wicks.upperHeight,
            );
          }
          if (wicks.lowerHeight > 0) {
            context.fillRect(
              geometry.wickLeft,
              wicks.lowerWickTop,
              geometry.wickWidth,
              wicks.lowerHeight,
            );
          }
        }

        const bodyHeight = geometry.bodyBottom - geometry.bodyTop + 1;
        if (geometry.bodyWidth <= 0 || bodyHeight <= 0) {
          previousWickRight = geometry.wickRight;
          continue;
        }

        if (this.options.borderVisible) {
          context.fillStyle = borderColor;
          if (
            geometry.bodyWidth > borderWidth * 2 &&
            bodyHeight > borderWidth * 2
          ) {
            fillRectInnerBorder(
              context,
              geometry.bodyLeft,
              geometry.bodyTop,
              geometry.bodyWidth,
              bodyHeight,
              borderWidth,
            );
          } else {
            context.fillRect(
              geometry.bodyLeft,
              geometry.bodyTop,
              geometry.bodyWidth,
              bodyHeight,
            );
          }
        }

        if (!isTransparentFill(bodyColor)) {
          context.fillStyle = bodyColor;
          if (
            this.options.borderVisible &&
            geometry.bodyWidth > borderWidth * 2 &&
            bodyHeight > borderWidth * 2
          ) {
            context.fillRect(
              geometry.bodyLeft + borderWidth,
              geometry.bodyTop + borderWidth,
              geometry.bodyWidth - borderWidth * 2,
              bodyHeight - borderWidth * 2,
            );
          } else if (!this.options.borderVisible) {
            context.fillRect(
              geometry.bodyLeft,
              geometry.bodyTop,
              geometry.bodyWidth,
              bodyHeight,
            );
          }
        }

        previousWickRight = geometry.wickRight;
      }
    });
  }
}

/**
 * Bridge class that connects the Lightweight Charts plugin system
 * to our custom Canvas renderer. Extracts visible price data so the chart 
 * knows how to auto-scale the Y-axis.
 */
class RTX5CustomCandlestickPaneView
  implements ICustomSeriesPaneView<any, RTX5CustomCandlestickData, RTX5CustomCandlestickSeriesOptions>
{
  private readonly rendererInstance = new RTX5CustomCandlestickRenderer();

  public renderer() {
    return this.rendererInstance;
  }

  public update(
    data: PaneRendererCustomData<any, RTX5CustomCandlestickData>,
    seriesOptions: RTX5CustomCandlestickSeriesOptions,
  ) {
    this.rendererInstance.update(data, seriesOptions);
  }

  public priceValueBuilder(plotRow: RTX5CustomCandlestickData) {
    return [plotRow.high, plotRow.low, plotRow.close];
  }

  public isWhitespace(
    data: RTX5CustomCandlestickData | CustomSeriesWhitespaceData<any>,
  ): data is CustomSeriesWhitespaceData<any> {
    return !('open' in data) || !('high' in data) || !('low' in data) || !('close' in data);
  }

  public defaultOptions() {
    return DEFAULT_CUSTOM_CANDLE_OPTIONS;
  }
}

export const buildRTX5CustomCandlestickSeriesOptions = ({
  candleOpacity = 1,
  bearishCandleOpacity = candleOpacity,
  bodyUpColor,
  bodyDownColor,
  borderUpColor,
  borderDownColor,
  wickUpColor,
  wickDownColor,
  priceFormat,
  lastValueVisible = true,
  priceLineVisible = true,
  borderVisible = true,
  wickVisible = true,
}: BuildRTX5CustomCandlestickSeriesOptionsArgs): RTX5CustomCandlestickSeriesOptions => ({
  ...DEFAULT_CUSTOM_CANDLE_OPTIONS,
  candleOpacity: resolveRTX5CustomCandleOpacity(candleOpacity),
  bearishCandleOpacity: resolveRTX5CustomCandleOpacity(bearishCandleOpacity),
  bodyUpColor,
  bodyDownColor,
  borderUpColor,
  borderDownColor,
  wickUpColor,
  wickDownColor,
  color: borderUpColor,
  lastValueVisible,
  priceLineVisible,
  borderVisible,
  wickVisible,
  priceFormat,
});

export const createRTX5CustomCandlestickPaneView = () =>
  new RTX5CustomCandlestickPaneView();

export const mapCandlesToRTX5CustomCandlestickData = ({
  candles,
  bullishColor,
  bearishColor,
}: MapRTX5CustomCandlesArgs): RTX5CustomCandlestickData[] =>
  candles.map((candle) => ({
    ...candle,
    color: candle.close >= candle.open ? bullishColor : bearishColor,
  }));
