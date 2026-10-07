/**
 * WebView injection script for custom candlestick rendering.
 * 
 * IMPORTANT: This file contains a stringified, ES5-safe version of the 
 * custom rendering logic from `candleGeometry.ts` and `customCandlestickSeries.ts`.
 * 
 * Why? The TradingView Lightweight Charts library runs inside a React Native WebView.
 * To use the `addCustomSeries` API, the custom renderer class must be evaluated 
 * inside the WebView's JavaScript context. We cannot pass functions over the bridge.
 * 
 * If you update `candleGeometry.ts` or `customCandlestickSeries.ts`, you MUST 
 * manually sync those changes here in plain ES5 syntax.
 */
export const RTX5_CUSTOM_CANDLESTICK_SERIES_WEBVIEW_JS = String.raw`
(function () {
  var CANDLE_CENTER_EPSILON = 1e-6;

  function clampBitmapWidth(width) {
    return Math.max(1, Math.floor(width));
  }

  function scaleToBitmapCoordinate(value, pixelRatio) {
    return Math.round(value * pixelRatio);
  }

  function getEffectiveBitmapBarSpacing(barSpacing, conflationFactor) {
    var normalizedConflationFactor = Math.max(1, conflationFactor || 1);
    return Math.max(barSpacing * normalizedConflationFactor, 0);
  }

  function getOptimalCandlestickBodyWidth(barSpacing, pixelRatio) {
    var barSpacingSpecialCaseFrom = 2.5;
    var barSpacingSpecialCaseTo = 4;
    var barSpacingSpecialCaseCoeff = 3;

    if (barSpacing >= barSpacingSpecialCaseFrom && barSpacing <= barSpacingSpecialCaseTo) {
      return clampBitmapWidth(barSpacingSpecialCaseCoeff * pixelRatio);
    }

    var barSpacingReducingCoeff = 0.2;
    var coeff = 1 - (barSpacingReducingCoeff * Math.atan(Math.max(barSpacingSpecialCaseTo, barSpacing) - barSpacingSpecialCaseTo)) / (Math.PI * 0.5);
    var requestedWidth = Math.floor(barSpacing * coeff * pixelRatio);
    var scaledBarSpacing = Math.floor(barSpacing * pixelRatio);
    var optimalWidth = Math.min(requestedWidth, scaledBarSpacing);
    return Math.max(Math.floor(pixelRatio), optimalWidth);
  }

  function getOptimalCandlestickWickWidth(barSpacing, pixelRatio, bodyWidth) {
    var pixelAlignedWidth = Math.floor(pixelRatio);
    var requestedWidth = Math.min(pixelAlignedWidth, Math.floor(barSpacing * pixelRatio));
    return Math.max(pixelAlignedWidth, Math.min(requestedWidth, bodyWidth));
  }

  function normalizeCandlestickBodyWidth(bodyWidth, wickWidth) {
    if (bodyWidth >= 2 && (wickWidth % 2) !== (bodyWidth % 2)) {
      return bodyWidth - 1;
    }

    return bodyWidth;
  }

  function getCandlestickBorderWidth(bodyWidth, pixelRatio) {
    var borderWidth = Math.floor(pixelRatio);
    if (bodyWidth <= 2 * borderWidth) {
      borderWidth = Math.floor((bodyWidth - 1) * 0.5);
    }

    var normalizedBorderWidth = Math.max(Math.floor(pixelRatio), borderWidth);
    if (bodyWidth <= normalizedBorderWidth * 2) {
      return Math.max(Math.floor(pixelRatio), Math.floor(pixelRatio));
    }

    return normalizedBorderWidth;
  }

  function createCenteredSpanAtWidth(center, width) {
    var normalizedWidth = Math.max(0, Math.floor(width));
    if (normalizedWidth === 0) {
      return {
        center: center,
        left: Math.round(center),
        right: Math.round(center) - 1,
        width: 0,
      };
    }

    var left = Math.round(center - normalizedWidth / 2);
    return {
      center: left + normalizedWidth / 2,
      left: left,
      right: left + normalizedWidth - 1,
      width: normalizedWidth,
    };
  }

  function createCenteredSpan(center, width, minLeft) {
    var requestedWidth = clampBitmapWidth(width);
    var minAllowedLeft = minLeft == null ? Number.NEGATIVE_INFINITY : minLeft;
    var requiresOddWidth = Math.abs(center % 1) > CANDLE_CENTER_EPSILON;
    var minCenteredWidth = requiresOddWidth ? 1 : 2;
    var nextWidth = requestedWidth;

    if ((nextWidth % 2 === 1) !== requiresOddWidth) {
      nextWidth = Math.max(0, nextWidth - 1);
    }

    var span = createCenteredSpanAtWidth(center, nextWidth);
    while (span.left < minAllowedLeft && nextWidth > minCenteredWidth) {
      nextWidth -= 2;
      span = createCenteredSpanAtWidth(center, nextWidth);
    }

    if (span.left < minAllowedLeft) {
      span = {
        center: center,
        left: Math.round(center),
        right: Math.round(center) - 1,
        width: 0,
      };
    }

    return span;
  }

  function createSpanFromRoundedX(roundedX, width, minLeft) {
    var normalizedWidth = clampBitmapWidth(width);
    var center = roundedX + (normalizedWidth % 2 === 0 ? 0 : 0.5);
    return createCenteredSpan(center, normalizedWidth, minLeft);
  }

  function createCandleGeometry(input) {
    var body = createSpanFromRoundedX(input.roundedX, input.bodyWidth, input.bodyMinLeft);
    var wick = createCenteredSpan(body.center, input.wickWidth, input.wickMinLeft);
    var bodyTop = Math.round(Math.min(input.openY, input.closeY));
    var bodyBottom = Math.round(Math.max(input.openY, input.closeY));
    var wickTop = Math.round(input.highY);
    var wickBottom = Math.round(input.lowY);

    return {
      index: input.index,
      roundedX: input.roundedX,
      xCenter: body.center,
      bodyLeft: body.left,
      bodyRight: body.right,
      bodyWidth: body.width,
      bodyTop: bodyTop,
      bodyBottom: bodyBottom,
      wickX: body.center,
      wickLeft: wick.left,
      wickRight: wick.right,
      wickWidth: wick.width,
      wickTop: wickTop,
      wickBottom: wickBottom,
      upperWickBodyY: bodyTop,
      lowerWickBodyY: bodyBottom,
    };
  }

  function computeCandleWickRects(input) {
    var hasUpperWick = input.high > Math.max(input.open, input.close);
    var hasLowerWick = input.low < Math.min(input.open, input.close);

    var upperWickTop = input.wickTop;
    if (hasUpperWick && upperWickTop >= input.bodyTop) {
      upperWickTop = input.bodyTop - 1;
    }
    var upperHeight = hasUpperWick ? Math.max(0, input.bodyTop - upperWickTop) : 0;

    var lowerWickBottom = input.wickBottom;
    if (hasLowerWick && lowerWickBottom <= input.bodyBottom) {
      lowerWickBottom = input.bodyBottom + 1;
    }
    var lowerHeight = hasLowerWick ? Math.max(0, lowerWickBottom - input.bodyBottom) : 0;

    return {
      upperWickTop: upperWickTop,
      upperHeight: upperHeight,
      lowerWickTop: input.bodyBottom + 1,
      lowerHeight: lowerHeight,
    };
  }

  function getBodyCenterFromGeometry(geometry) {
    return geometry.bodyLeft + geometry.bodyWidth / 2;
  }

  function hasCenteredWickInvariant(geometry, epsilon) {
    return Math.abs(getBodyCenterFromGeometry(geometry) - geometry.wickX) < (epsilon || CANDLE_CENTER_EPSILON);
  }

  function formatInvariantMessage(geometry, epsilon) {
    return [
      'RTX5 candle geometry invariant violated',
      'index=' + geometry.index,
      'epsilon=' + (epsilon || CANDLE_CENTER_EPSILON),
      'roundedX=' + geometry.roundedX,
      'xCenter=' + geometry.xCenter,
      'bodyLeft=' + geometry.bodyLeft,
      'bodyRight=' + geometry.bodyRight,
      'bodyWidth=' + geometry.bodyWidth,
      'bodyTop=' + geometry.bodyTop,
      'bodyBottom=' + geometry.bodyBottom,
      'wickX=' + geometry.wickX,
      'wickLeft=' + geometry.wickLeft,
      'wickRight=' + geometry.wickRight,
      'wickWidth=' + geometry.wickWidth,
      'wickTop=' + geometry.wickTop,
      'wickBottom=' + geometry.wickBottom
    ].join(' ');
  }

  function fillRectInnerBorder(ctx, x, y, width, height, borderWidth) {
    ctx.fillRect(x, y, width, borderWidth);
    ctx.fillRect(x, y + height - borderWidth, width, borderWidth);
    ctx.fillRect(x, y, borderWidth, height);
    ctx.fillRect(x + width - borderWidth, y, borderWidth, height);
  }

  function isTransparentFill(color) {
    return String(color || '').trim().toLowerCase() === 'transparent';
  }

  function normalizeCoordinate(priceToCoordinate, price, verticalPixelRatio) {
    var coordinate = priceToCoordinate(price);
    return coordinate == null ? null : coordinate * verticalPixelRatio;
  }

  function resolveCustomCandleOpacity(value) {
    return typeof value === 'number' && isFinite(value)
      ? Math.min(1, Math.max(0, value))
      : 1;
  }

  var DENSE_CANDLE_LINE_MAX_BAR_SPACING = 3.25;

  function shouldRenderDenseCandleAsLine(barSpacing, bodyWidth, pixelRatio) {
    var oneCssPixel = Math.max(1, Math.floor(pixelRatio));
    return barSpacing <= DENSE_CANDLE_LINE_MAX_BAR_SPACING || bodyWidth <= oneCssPixel * 2;
  }

  function fillDenseCandleLine(ctx, geometry, color) {
    var top = Math.min(geometry.wickTop, geometry.bodyTop, geometry.bodyBottom);
    var bottom = Math.max(geometry.wickBottom, geometry.bodyTop, geometry.bodyBottom);
    ctx.fillStyle = color;
    ctx.fillRect(
      geometry.wickLeft,
      top,
      Math.max(1, geometry.wickWidth),
      Math.max(1, bottom - top + 1)
    );
  }

  function CustomCandlestickRenderer() {
    this._data = null;
    this._options = {
      color: '#2962FF',
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
    };
  }

  CustomCandlestickRenderer.prototype.update = function (data, options) {
    this._data = data;
    this._options = options;
  };

  CustomCandlestickRenderer.prototype.draw = function (target, priceToCoordinate) {
    if (!this._data || !this._data.visibleRange || this._data.bars.length === 0) {
      return;
    }

    var self = this;
    target.useBitmapCoordinateSpace(function (scope) {
      var horizontalPixelRatio = scope.horizontalPixelRatio;
      var verticalPixelRatio = scope.verticalPixelRatio;
      if (!isFinite(horizontalPixelRatio) || !isFinite(verticalPixelRatio)) {
        return;
      }

      var context = scope.context;
      var bitmapBarSpacing = getEffectiveBitmapBarSpacing(self._data.barSpacing || 0, self._data.conflationFactor || 1);
      var rawBodyWidth = getOptimalCandlestickBodyWidth(bitmapBarSpacing, horizontalPixelRatio);
      var wickWidth = getOptimalCandlestickWickWidth(bitmapBarSpacing, horizontalPixelRatio, rawBodyWidth);
      var bodyWidth = normalizeCandlestickBodyWidth(rawBodyWidth, wickWidth);
      var borderWidth = getCandlestickBorderWidth(bodyWidth, horizontalPixelRatio);
      var previousWickRight = null;

      for (var index = self._data.visibleRange.from; index < self._data.visibleRange.to; index += 1) {
        var bar = self._data.bars[index];
        var original = bar.originalData;
        var openY = normalizeCoordinate(priceToCoordinate, original.open, verticalPixelRatio);
        var closeY = normalizeCoordinate(priceToCoordinate, original.close, verticalPixelRatio);
        var highY = normalizeCoordinate(priceToCoordinate, original.high, verticalPixelRatio);
        var lowY = normalizeCoordinate(priceToCoordinate, original.low, verticalPixelRatio);

        if (openY == null || closeY == null || highY == null || lowY == null) {
          continue;
        }

        var geometry = createCandleGeometry({
          index: index,
          roundedX: scaleToBitmapCoordinate(bar.x, horizontalPixelRatio),
          bodyWidth: bodyWidth,
          wickWidth: wickWidth,
          openY: openY,
          closeY: closeY,
          highY: highY,
          lowY: lowY,
          wickMinLeft: previousWickRight == null ? null : previousWickRight + 1,
        });
        var isBullish = original.close >= original.open;
        context.globalAlpha = resolveCustomCandleOpacity(
          isBullish ? self._options.candleOpacity : self._options.bearishCandleOpacity
        );
        var bodyColor = isBullish ? self._options.bodyUpColor : self._options.bodyDownColor;
        var borderColor = isBullish ? self._options.borderUpColor : self._options.borderDownColor;
        var wickColor = isBullish ? self._options.wickUpColor : self._options.wickDownColor;

        if (window.__RTX5_CUSTOM_CANDLE_GEOMETRY_DEBUG && !hasCenteredWickInvariant(geometry, CANDLE_CENTER_EPSILON)) {
          console.error(formatInvariantMessage(geometry, CANDLE_CENTER_EPSILON));
        }

        if (shouldRenderDenseCandleAsLine(bitmapBarSpacing, bodyWidth, horizontalPixelRatio)) {
          fillDenseCandleLine(context, geometry, wickColor);
          previousWickRight = geometry.wickRight;
          continue;
        }

        if (self._options.wickVisible && geometry.wickWidth > 0) {
          var wicks = computeCandleWickRects({
            open: original.open,
            high: original.high,
            low: original.low,
            close: original.close,
            bodyTop: geometry.bodyTop,
            bodyBottom: geometry.bodyBottom,
            wickTop: geometry.wickTop,
            wickBottom: geometry.wickBottom,
          });
          context.fillStyle = wickColor;

          if (wicks.upperHeight > 0) {
            context.fillRect(geometry.wickLeft, wicks.upperWickTop, geometry.wickWidth, wicks.upperHeight);
          }
          if (wicks.lowerHeight > 0) {
            context.fillRect(geometry.wickLeft, wicks.lowerWickTop, geometry.wickWidth, wicks.lowerHeight);
          }
        }

        var bodyHeight = geometry.bodyBottom - geometry.bodyTop + 1;
        if (geometry.bodyWidth <= 0 || bodyHeight <= 0) {
          previousWickRight = geometry.wickRight;
          continue;
        }

        if (self._options.borderVisible) {
          context.fillStyle = borderColor;
          if (geometry.bodyWidth > borderWidth * 2 && bodyHeight > borderWidth * 2) {
            fillRectInnerBorder(context, geometry.bodyLeft, geometry.bodyTop, geometry.bodyWidth, bodyHeight, borderWidth);
          } else {
            context.fillRect(geometry.bodyLeft, geometry.bodyTop, geometry.bodyWidth, bodyHeight);
          }
        }

        if (!isTransparentFill(bodyColor)) {
          context.fillStyle = bodyColor;
          if (self._options.borderVisible && geometry.bodyWidth > borderWidth * 2 && bodyHeight > borderWidth * 2) {
            context.fillRect(
              geometry.bodyLeft + borderWidth,
              geometry.bodyTop + borderWidth,
              geometry.bodyWidth - borderWidth * 2,
              bodyHeight - borderWidth * 2
            );
          } else if (!self._options.borderVisible) {
            context.fillRect(geometry.bodyLeft, geometry.bodyTop, geometry.bodyWidth, bodyHeight);
          }
        }

        previousWickRight = geometry.wickRight;
      }
    });
  };

  function CustomCandlestickPaneView() {
    this._renderer = new CustomCandlestickRenderer();
  }

  CustomCandlestickPaneView.prototype.renderer = function () {
    return this._renderer;
  };

  CustomCandlestickPaneView.prototype.update = function (data, options) {
    this._renderer.update(data, options);
  };

  CustomCandlestickPaneView.prototype.priceValueBuilder = function (plotRow) {
    return [plotRow.high, plotRow.low, plotRow.close];
  };

  CustomCandlestickPaneView.prototype.isWhitespace = function (data) {
    return !('open' in data) || !('high' in data) || !('low' in data) || !('close' in data);
  };

  CustomCandlestickPaneView.prototype.defaultOptions = function () {
    return {
      color: '#2962FF',
      candleOpacity: 1,
      bearishCandleOpacity: 1,
      bodyUpColor: '#2962FF',
      bodyDownColor: '#EF5350',
      borderUpColor: '#2962FF',
      borderDownColor: '#EF5350',
      wickUpColor: '#2962FF',
      wickDownColor: '#EF5350',
      borderVisible: true,
      wickVisible: true
    };
  };

  window.createRTX5CustomCandlestickPaneView = function () {
    return new CustomCandlestickPaneView();
  };

  window.addRTX5CustomCandlestickSeries = function (chart, options) {
    return chart.addCustomSeries(window.createRTX5CustomCandlestickPaneView(), options);
  };
})();
`;
