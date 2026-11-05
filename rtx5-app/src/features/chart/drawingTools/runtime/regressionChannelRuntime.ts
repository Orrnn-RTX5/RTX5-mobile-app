import type { EnhancedDrawingToolRuntime } from '../types';

export const regressionChannelEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'regressionChannel',
  script: `
  /**
   * Normalizes the style configuration for the Regression Channel, providing defaults for missing values.
   */
  function normalizeRegressionChannelStyle(style, draft) {
    var source = style && typeof style === 'object' ? style : {};
    return {
      color: typeof source.color === 'string' ? source.color : '#0EA5E9',
      selectedColor: typeof source.selectedColor === 'string' ? source.selectedColor : '#0284C7',
      hoverColor: typeof source.hoverColor === 'string' ? source.hoverColor : '#38BDF8',
      width: isFiniteNumber(source.width) ? Math.max(1, Math.min(5, source.width)) : 1.6,
      lineStyle: source.lineStyle === 'dashed' || source.lineStyle === 'dotted' ? source.lineStyle : 'solid',
      opacity: isFiniteNumber(source.opacity) ? Math.max(0.1, Math.min(1, source.opacity)) : 1,
      midlineColor: typeof source.midlineColor === 'string' ? source.midlineColor : '#0EA5E9',
      midlineStyle: source.midlineStyle === 'solid' || source.midlineStyle === 'dotted' ? source.midlineStyle : 'dashed',
      fillColor: typeof source.fillColor === 'string' ? source.fillColor : 'rgba(14, 165, 233, 0.10)',
      fillOpacity: isFiniteNumber(source.fillOpacity) ? Math.max(0, Math.min(0.45, source.fillOpacity)) : 0.14,
      showFill: source.showFill === false ? false : true,
      showMidline: source.showMidline === false ? false : true,
      deviations: isFiniteNumber(source.deviations) ? Math.max(0.5, Math.min(4, source.deviations)) : 2,
      handleFillColor: typeof source.handleFillColor === 'string' ? source.handleFillColor : '#FFFFFF',
      handleRadius: isFiniteNumber(source.handleRadius) ? Math.max(3, Math.min(8, source.handleRadius)) : 4,
      selectedHandleRadius: isFiniteNumber(source.selectedHandleRadius) ? Math.max(4, Math.min(10, source.selectedHandleRadius)) : 5,
      showHandles: source.showHandles === false ? false : true
    };
  }

  /**
   * Helper function: regressionChannelDashPattern.
   */
  function regressionChannelDashPattern(style, ratio) {
    var px = Math.max(1, ratio || 1);
    if (style === 'dashed') return [8 * px, 5 * px];
    if (style === 'dotted') return [2 * px, 5 * px];
    return [];
  }

  /**
   * Runs a least-squares linear regression over the candle closes inside the anchored time
   * range and returns the center/upper/lower price at both ends of that range.
   */
  function computeRegressionChannelModel(chart, series, timeA, timeB, deviations) {
    var data = getSeriesData(series);
    if (!Array.isArray(data) || data.length < 2 || !isFiniteNumber(timeA) || !isFiniteNumber(timeB)) {
      return null;
    }
    var startTime = Math.min(timeA, timeB);
    var endTime = Math.max(timeA, timeB);
    var samples = [];
    for (var i = 0; i < data.length; i += 1) {
      var candle = data[i];
      var candleTime = candle && isFiniteNumber(candle.time) ? candle.time : null;
      var close = candle && isFiniteNumber(candle.close) ? candle.close : null;
      if (candleTime === null || close === null || candleTime < startTime || candleTime > endTime) {
        continue;
      }
      samples.push({ time: candleTime, close: close });
    }
    if (samples.length < 2) {
      return null;
    }
    var n = samples.length;
    var sumX = 0;
    var sumY = 0;
    var sumXY = 0;
    var sumXX = 0;
    for (var j = 0; j < n; j += 1) {
      var x = j;
      var y = samples[j].close;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
    }
    var denominator = (n * sumXX) - (sumX * sumX);
    var slope = Math.abs(denominator) < 0.0000001 ? 0 : ((n * sumXY) - (sumX * sumY)) / denominator;
    var intercept = (sumY - (slope * sumX)) / n;
    var sumSquaredResiduals = 0;
    for (var k = 0; k < n; k += 1) {
      var estimate = intercept + (slope * k);
      var residual = samples[k].close - estimate;
      sumSquaredResiduals += residual * residual;
    }
    var stdDev = Math.sqrt(sumSquaredResiduals / n);
    var band = stdDev * deviations;
    var startCenter = intercept;
    var endCenter = intercept + (slope * (n - 1));
    return {
      startTime: samples[0].time,
      endTime: samples[n - 1].time,
      startCenter: startCenter,
      endCenter: endCenter,
      startUpper: startCenter + band,
      endUpper: endCenter + band,
      startLower: startCenter - band,
      endLower: endCenter - band
    };
  }

  /**
   * Helper function: distanceToRegressionPoint.
   */
  function distanceToRegressionPoint(a, b) {
    if (!a || !b || !isFiniteNumber(a.x) || !isFiniteNumber(a.y) || !isFiniteNumber(b.x) || !isFiniteNumber(b.y)) {
      return Number.POSITIVE_INFINITY;
    }
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt((dx * dx) + (dy * dy));
  }

  /**
   * Helper function: distanceToRegressionSegment.
   */
  function distanceToRegressionSegment(point, a, b) {
    if (!point || !a || !b) return Number.POSITIVE_INFINITY;
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var lengthSquared = (dx * dx) + (dy * dy);
    if (lengthSquared <= 0.0001) return distanceToRegressionPoint(point, a);
    var t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
    return distanceToRegressionPoint(point, { x: a.x + (dx * t), y: a.y + (dy * t) });
  }

  /**
   * Creates the visual primitive object that gets rendered on the chart canvas.
   */
  function createRegressionChannelPrimitive(pointA, pointB, record, draft) {
    function drawRegressionLine(ctx, start, end, ratioX, ratioY) {
      if (!start || !end) return;
      ctx.moveTo(start.x * ratioX, start.y * ratioY);
      ctx.lineTo(end.x * ratioX, end.y * ratioY);
    }

  /**
   * Helper function: RegressionChannelPaneRenderer.
   */
    function RegressionChannelPaneRenderer(source, geometry) {
      this._source = source;
      this._geometry = geometry;
    }

  /**
   * Helper function: draw.
   */
    RegressionChannelPaneRenderer.prototype.draw = function (target) {
      var source = this._source;
      var geometry = this._geometry;
      if (!source._options.visible || !geometry) return;
      var channel = geometry.channel;
      target.useBitmapCoordinateSpace(function (scope) {
        var ctx = scope.context;
        var ratioX = scope.horizontalPixelRatio || 1;
        var ratioY = scope.verticalPixelRatio || 1;
        ctx.save();

        if (channel) {
          if (source._options.style.showFill) {
            ctx.beginPath();
            ctx.moveTo(channel.upperStart.x * ratioX, channel.upperStart.y * ratioY);
            ctx.lineTo(channel.upperEnd.x * ratioX, channel.upperEnd.y * ratioY);
            ctx.lineTo(channel.lowerEnd.x * ratioX, channel.lowerEnd.y * ratioY);
            ctx.lineTo(channel.lowerStart.x * ratioX, channel.lowerStart.y * ratioY);
            ctx.lineTo(channel.upperStart.x * ratioX, channel.upperStart.y * ratioY);
            ctx.globalAlpha = source._options.style.fillOpacity;
            ctx.fillStyle = source._options.style.fillColor;
            ctx.fill();
            ctx.globalAlpha = 1;
          }

          var lineColor = source._options.selected
            ? source._options.style.selectedColor
            : (source._options.hovered ? source._options.style.hoverColor : source._options.style.color);
          ctx.globalAlpha = source._options.style.opacity;
          ctx.strokeStyle = lineColor;
          ctx.lineWidth = Math.max(1, source._options.style.width * ratioX);
          ctx.lineCap = 'round';
          if (ctx.setLineDash) ctx.setLineDash(regressionChannelDashPattern(source._options.style.lineStyle, ratioX));
          ctx.beginPath();
          drawRegressionLine(ctx, channel.upperStart, channel.upperEnd, ratioX, ratioY);
          drawRegressionLine(ctx, channel.lowerStart, channel.lowerEnd, ratioX, ratioY);
          ctx.stroke();

          if (source._options.style.showMidline) {
            ctx.strokeStyle = source._options.style.midlineColor;
            ctx.lineWidth = Math.max(1, ratioX);
            if (ctx.setLineDash) ctx.setLineDash(regressionChannelDashPattern(source._options.style.midlineStyle, ratioX));
            ctx.beginPath();
            drawRegressionLine(ctx, channel.centerStart, channel.centerEnd, ratioX, ratioY);
            ctx.stroke();
          }
          if (ctx.setLineDash) ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        } else if (geometry.p1 && geometry.p2 && isFiniteNumber(geometry.p1.x) && isFiniteNumber(geometry.p2.x)) {
          var fallbackColor = source._options.selected ? source._options.style.selectedColor : source._options.style.color;
          ctx.strokeStyle = fallbackColor;
          ctx.lineWidth = Math.max(1, source._options.style.width * ratioX);
          ctx.lineCap = 'round';
          if (ctx.setLineDash) ctx.setLineDash(regressionChannelDashPattern(source._options.style.lineStyle, ratioX));
          ctx.beginPath();
          drawRegressionLine(ctx, geometry.p1, geometry.p2, ratioX, ratioY);
          ctx.stroke();
          if (ctx.setLineDash) ctx.setLineDash([]);
        }

        if (source._options.selected || source._options.draft || source._options.style.showHandles) {
          if (geometry.p1 && geometry.p2 && isFiniteNumber(geometry.p1.x) && isFiniteNumber(geometry.p2.x)) {
            var handleColor = source._options.selected ? source._options.style.selectedColor : source._options.style.color;
            var radius = (source._options.selected ? source._options.style.selectedHandleRadius : source._options.style.handleRadius) * ratioX;
            ctx.fillStyle = source._options.style.handleFillColor;
            ctx.strokeStyle = handleColor;
            ctx.lineWidth = Math.max(1, 1.5 * ratioX);
            [geometry.p1, geometry.p2].forEach(function (point) {
              ctx.beginPath();
              ctx.arc(point.x * ratioX, point.y * ratioY, radius, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
            });
          }
        }
        ctx.restore();
      });
    };

  /**
   * Helper function: RegressionChannelPaneView.
   */
    function RegressionChannelPaneView(source) {
      this._source = source;
      this._geometry = { p1: null, p2: null, channel: null };
    }

  /**
   * Helper function: update.
   */
    RegressionChannelPaneView.prototype.update = function () {
      var source = this._source;
      var chart = source.chart;
      var series = source.series;
      var p1 = { x: resolveCoordinateFromTime(chart, series, source._p1.time), y: series.priceToCoordinate(source._p1.price) };
      var p2 = { x: resolveCoordinateFromTime(chart, series, source._p2.time), y: series.priceToCoordinate(source._p2.price) };
      var channel = null;
      var model = computeRegressionChannelModel(chart, series, source._p1.time, source._p2.time, source._options.style.deviations);
      if (model) {
        var startX = resolveCoordinateFromTime(chart, series, model.startTime);
        var endX = resolveCoordinateFromTime(chart, series, model.endTime);
        if (isFiniteNumber(startX) && isFiniteNumber(endX)) {
          channel = {
            centerStart: { x: startX, y: series.priceToCoordinate(model.startCenter) },
            centerEnd: { x: endX, y: series.priceToCoordinate(model.endCenter) },
            upperStart: { x: startX, y: series.priceToCoordinate(model.startUpper) },
            upperEnd: { x: endX, y: series.priceToCoordinate(model.endUpper) },
            lowerStart: { x: startX, y: series.priceToCoordinate(model.startLower) },
            lowerEnd: { x: endX, y: series.priceToCoordinate(model.endLower) }
          };
        }
      }
      this._geometry = { p1: p1, p2: p2, channel: channel };
      source._geometry = this._geometry;
    };

  /**
   * Helper function: renderer.
   */
    RegressionChannelPaneView.prototype.renderer = function () {
      return new RegressionChannelPaneRenderer(this._source, this._geometry);
    };

  /**
   * Helper function: RegressionChannelPrimitive.
   */
    function RegressionChannelPrimitive(anchorA, anchorB, opts) {
      PrimitiveBase.call(this);
      this._p1 = clonePoint(anchorA);
      this._p2 = clonePoint(anchorB);
      var source = opts && typeof opts === 'object' ? opts : {};
      this._options = {
        draft: !!draft,
        hovered: !!source.hovered,
        selected: !!source.selected,
        visible: source.visible === false || source.hidden === true ? false : true,
        style: normalizeRegressionChannelStyle(source.style, draft)
      };
      this._geometry = null;
      this._paneViews = [new RegressionChannelPaneView(this)];
    }

    RegressionChannelPrimitive.prototype = Object.create(PrimitiveBase.prototype);
    RegressionChannelPrimitive.prototype.constructor = RegressionChannelPrimitive;
    RegressionChannelPrimitive.prototype.updateAllViews = function () {
      this._paneViews.forEach(function (view) { view.update(); });
    };
    RegressionChannelPrimitive.prototype.paneViews = function () {
      return this._paneViews;
    };
    RegressionChannelPrimitive.prototype.setVisible = function (visible) {
      this._options.visible = !!visible;
      this.requestUpdate();
    };
    RegressionChannelPrimitive.prototype.setSelected = function (selected) {
      this._options.selected = !!selected;
      this.requestUpdate();
    };
    RegressionChannelPrimitive.prototype.setHovered = function (hovered) {
      this._options.hovered = !!hovered;
      this.requestUpdate();
    };
    RegressionChannelPrimitive.prototype.updatePoints = function (pointA, pointB) {
      if (pointA) this._p1 = clonePoint(pointA);
      if (pointB) this._p2 = clonePoint(pointB);
      this.requestUpdate();
    };
    RegressionChannelPrimitive.prototype.getPoints = function () {
      return clonePoints([this._p1, this._p2]);
    };
    RegressionChannelPrimitive.prototype.getGeometry = function () {
      this.updateAllViews();
      return this._geometry;
    };
    RegressionChannelPrimitive.prototype.hitTest = function (point, context) {
      this.updateAllViews();
      var geometry = this._geometry;
      if (!geometry || !geometry.p1 || !geometry.p2 || !isFiniteNumber(geometry.p1.x) || !isFiniteNumber(geometry.p1.y) || !isFiniteNumber(geometry.p2.x) || !isFiniteNumber(geometry.p2.y)) {
        return null;
      }
      var isTouch = context && context.isTouch;
      var handleThreshold = isTouch ? 20 : 10;
      var lineThreshold = isTouch ? 14 : 8;
      if (distanceToRegressionPoint(point, geometry.p1) <= handleThreshold) return { part: 'p1' };
      if (distanceToRegressionPoint(point, geometry.p2) <= handleThreshold) return { part: 'p2' };
      var channel = geometry.channel;
      if (channel) {
        if (distanceToRegressionSegment(point, channel.upperStart, channel.upperEnd) <= lineThreshold) return { part: 'body' };
        if (distanceToRegressionSegment(point, channel.lowerStart, channel.lowerEnd) <= lineThreshold) return { part: 'body' };
        if (distanceToRegressionSegment(point, channel.centerStart, channel.centerEnd) <= lineThreshold) return { part: 'body' };
        return null;
      }
      if (distanceToRegressionSegment(point, geometry.p1, geometry.p2) <= lineThreshold) return { part: 'body' };
      return null;
    };
    RegressionChannelPrimitive.prototype.buildEditPoints = function (part, originalPoints, startPoint, editPoint) {
      if (!Array.isArray(originalPoints) || originalPoints.length < 2 || !editPoint) return null;
      var next = clonePoints(originalPoints.slice(0, 2));
      if (part === 'p1') next[0] = clonePoint(editPoint);
      else if (part === 'p2') next[1] = clonePoint(editPoint);
      else return null;
      return next;
    };
    return new RegressionChannelPrimitive(pointA, pointB, record);
  }

  /**
   * Builds a serialized record object representing the current state of the drawing tool for persistence.
   */
  function buildRegressionChannelRecord(points, style) {
    var now = Date.now();
    return {
      type: 'regressionChannel',
      paneId: 'main',
      points: clonePoints(points.slice(0, 2)),
      style: normalizeRegressionChannelStyle(style, false),
      locked: false,
      visible: true,
      selected: false,
      createdAt: now,
      updatedAt: now
    };
  }

  /**
   * Constructor function for the drawing tool class, initializing its state and event listeners.
   */
  function RegressionChannelTool(chart, series, manager) {
    BaseTool.call(this, 'regressionChannel', chart, series, manager);
    this._points = [];
    this._preview = null;
    this._style = normalizeRegressionChannelStyle(null, false);
    this._handleClick = this._handleClick.bind(this);
    this._handleMove = this._handleMove.bind(this);
    this._usesNativeChartInput = !manager.shouldUseDirectTouchInput();
    if (this._usesNativeChartInput) {
      this._chart.subscribeClick(this._handleClick);
      this._chart.subscribeCrosshairMove(this._handleMove);
    }
  }

  RegressionChannelTool.prototype = Object.create(BaseTool.prototype);
  RegressionChannelTool.prototype.constructor = RegressionChannelTool;
  RegressionChannelTool.prototype.startDrawing = function () {
    BaseTool.prototype.startDrawing.call(this);
    this._resetDrawingSession();
  };
  RegressionChannelTool.prototype._resetDrawingSession = function () {
    this._points = [];
    this._removePreview();
  };
  RegressionChannelTool.prototype.stopDrawing = function () {
    BaseTool.prototype.stopDrawing.call(this);
    this._resetDrawingSession();
  };
  RegressionChannelTool.prototype._removePreview = function () {
    if (this._preview) {
      try { this._series.detachPrimitive(this._preview); } catch (_error) {}
      this._preview = null;
    }
  };
  RegressionChannelTool.prototype._sameLogicalPoint = function (pointA, pointB) {
    return pointA && pointB && pointA.time === pointB.time && pointA.price === pointB.price;
  };
  RegressionChannelTool.prototype._startPreview = function (point) {
    this._preview = createRegressionChannelPrimitive(point, point, { style: this._style, selected: true }, true);
    this._series.attachPrimitive(this._preview);
  };
  RegressionChannelTool.prototype._handleClick = function (param) {
    if (!this._drawing) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    if (this._points.length === 0) {
      this._points = [clonePoint(point)];
      this._startPreview(this._points[0]);
      return;
    }
    var firstPoint = this._points[0];
    if (!firstPoint || this._sameLogicalPoint(firstPoint, point)) return;
    var points = [clonePoint(firstPoint), clonePoint(point)];
    this._removePreview();
    var serialized = buildRegressionChannelRecord(points, this._style);
    this._completeDrawing(createRegressionChannelPrimitive(points[0], points[1], serialized, false), null, serialized);
  };
  RegressionChannelTool.prototype._handleMove = function (param) {
    if (!this._drawing || !this._preview || this._points.length !== 1) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    this._preview.updatePoints(this._points[0], point);
  };
  RegressionChannelTool.prototype.remove = function () {
    this.stopDrawing();
    if (this._usesNativeChartInput) {
      this._chart.unsubscribeClick(this._handleClick);
      this._chart.unsubscribeCrosshairMove(this._handleMove);
    }
  };

  /**
   * Registers this drawing tool with the global drawing manager so it can be instantiated by the chart.
   */
  registerEnhancedDrawingTool({
    kind: 'regressionChannel',
    defaultLabel: 'Regression Channel',
    requiredPointCount: 2,
    createTool: function (chart, series, manager) {
      return new RegressionChannelTool(chart, series, manager);
    },
    createPrimitiveFromRecord: function (record) {
      var points = record.points || [];
      return createRegressionChannelPrimitive(points[0], points[1], record, false);
    }
  });
`,
};
