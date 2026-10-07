import type { EnhancedDrawingToolRuntime } from '../types';

export const parallelChannelEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'parallelChannel',
  script: `
  /**
   * Normalizes the style configuration for the drawing tool, providing defaults for missing values.
   */
  function normalizeParallelChannelStyle(style, draft) {
    var source = style && typeof style === 'object' ? style : {};
    return {
      lineColor: typeof source.lineColor === 'string' ? source.lineColor : '#14B8A6',
      selectedColor: typeof source.selectedColor === 'string' ? source.selectedColor : '#0F766E',
      hoverColor: typeof source.hoverColor === 'string' ? source.hoverColor : '#2DD4BF',
      lineWidth: isFiniteNumber(source.lineWidth) ? Math.max(1, Math.min(5, source.lineWidth)) : 1.6,
      lineStyle: source.lineStyle === 'dashed' || source.lineStyle === 'dotted' ? source.lineStyle : 'solid',
      midlineColor: typeof source.midlineColor === 'string' ? source.midlineColor : '#64748B',
      midlineStyle: source.midlineStyle === 'solid' || source.midlineStyle === 'dotted' ? source.midlineStyle : 'dashed',
      fillColor: typeof source.fillColor === 'string' ? source.fillColor : (draft ? 'rgba(20, 184, 166, 0.08)' : 'rgba(20, 184, 166, 0.12)'),
      fillOpacity: isFiniteNumber(source.fillOpacity) ? Math.max(0, Math.min(0.45, source.fillOpacity)) : 0.18,
      showMidline: source.showMidline === false ? false : true,
      showFill: source.showFill === false ? false : true,
      showHandles: source.showHandles === false ? false : true,
      handleFillColor: typeof source.handleFillColor === 'string' ? source.handleFillColor : '#FFFFFF',
      handleRadius: isFiniteNumber(source.handleRadius) ? Math.max(3, Math.min(8, source.handleRadius)) : 4,
      selectedHandleRadius: isFiniteNumber(source.selectedHandleRadius) ? Math.max(4, Math.min(10, source.selectedHandleRadius)) : 5
    };
  }

  /**
   * Helper function: normalizeParallelChannelExtendMode.
   */
  function normalizeParallelChannelExtendMode(value) {
    return value === 'none' || value === 'left' || value === 'both' ? value : 'right';
  }

  /**
   * Helper function: parallelChannelDashPattern.
   */
  function parallelChannelDashPattern(style, ratio) {
    var px = Math.max(1, ratio || 1);
    if (style === 'dashed') return [8 * px, 5 * px];
    if (style === 'dotted') return [2 * px, 5 * px];
    return [];
  }

  /**
   * Helper function: pointOnChannelLineAtX.
   */
  function pointOnChannelLineAtX(a, b, x) {
    var dx = b.x - a.x;
    if (Math.abs(dx) < 0.0001) {
      return { x: a.x, y: a.y };
    }
    var ratio = (x - a.x) / dx;
    return { x: x, y: a.y + ((b.y - a.y) * ratio) };
  }

  /**
   * Helper function: resolveParallelChannelSegments.
   */
  function resolveParallelChannelSegments(c1, c2, c3, paneWidth, paneHeight, extendMode) {
    var dx = c2.x - c1.x;
    var dy = c2.y - c1.y;
    if (!isFiniteNumber(dx) || !isFiniteNumber(dy) || (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001)) {
      return null;
    }

    var mode = normalizeParallelChannelExtendMode(extendMode);
    var offset = { x: c3.x - c1.x, y: c3.y - c1.y };
    if (Math.abs(dx) < 0.0001) {
      var top = mode === 'left' || mode === 'both' || mode === 'right' ? 0 : Math.min(c1.y, c2.y);
      var bottom = mode === 'left' || mode === 'both' || mode === 'right' ? paneHeight : Math.max(c1.y, c2.y);
      var baseVertical = { start: { x: c1.x, y: top }, end: { x: c1.x, y: bottom } };
      var parallelVertical = { start: { x: c3.x, y: top }, end: { x: c3.x, y: bottom } };
      var midVertical = {
        start: { x: (baseVertical.start.x + parallelVertical.start.x) / 2, y: top },
        end: { x: (baseVertical.end.x + parallelVertical.end.x) / 2, y: bottom }
      };
      return {
        base: baseVertical,
        parallel: parallelVertical,
        midline: midVertical,
        polygon: [baseVertical.start, baseVertical.end, parallelVertical.end, parallelVertical.start],
        anchors: { p1: c1, p2: c2, p3: c3 }
      };
    }

    var left = Math.min(c1.x, c2.x);
    var right = Math.max(c1.x, c2.x);
    if (mode === 'left' || mode === 'both') left = 0;
    if (mode === 'right' || mode === 'both') right = Math.max(right, paneWidth);
    left = Math.max(-paneWidth, Math.min(paneWidth * 2, left));
    right = Math.max(left + 1, Math.min(paneWidth * 2, right));

    var baseStart = pointOnChannelLineAtX(c1, c2, left);
    var baseEnd = pointOnChannelLineAtX(c1, c2, right);
    var parallelStart = { x: baseStart.x + offset.x, y: baseStart.y + offset.y };
    var parallelEnd = { x: baseEnd.x + offset.x, y: baseEnd.y + offset.y };
    var midline = {
      start: {
        x: (baseStart.x + parallelStart.x) / 2,
        y: (baseStart.y + parallelStart.y) / 2
      },
      end: {
        x: (baseEnd.x + parallelEnd.x) / 2,
        y: (baseEnd.y + parallelEnd.y) / 2
      }
    };
    return {
      base: { start: baseStart, end: baseEnd },
      parallel: { start: parallelStart, end: parallelEnd },
      midline: midline,
      polygon: [baseStart, baseEnd, parallelEnd, parallelStart],
      anchors: { p1: c1, p2: c2, p3: c3 }
    };
  }

  /**
   * Helper function: drawParallelChannelLine.
   */
  function drawParallelChannelLine(ctx, line, ratioX, ratioY) {
    if (!line) return;
    ctx.moveTo(line.start.x * ratioX, line.start.y * ratioY);
    ctx.lineTo(line.end.x * ratioX, line.end.y * ratioY);
  }

  /**
   * Helper function: distanceToParallelChannelPoint.
   */
  function distanceToParallelChannelPoint(a, b) {
    if (!a || !b || !isFiniteNumber(a.x) || !isFiniteNumber(a.y) || !isFiniteNumber(b.x) || !isFiniteNumber(b.y)) {
      return Number.POSITIVE_INFINITY;
    }
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt((dx * dx) + (dy * dy));
  }

  /**
   * Helper function: distanceToParallelChannelSegment.
   */
  function distanceToParallelChannelSegment(point, a, b) {
    if (!point || !a || !b) return Number.POSITIVE_INFINITY;
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var lengthSquared = (dx * dx) + (dy * dy);
    if (lengthSquared <= 0.0001) return distanceToParallelChannelPoint(point, a);
    var t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
    return distanceToParallelChannelPoint(point, {
      x: a.x + (dx * t),
      y: a.y + (dy * t)
    });
  }

  /**
   * Creates the visual primitive object that gets rendered on the chart canvas.
   */
  function createParallelChannelPrimitive(pointA, pointB, pointC, record, draft) {
  /**
   * Helper function: ParallelChannelPaneRenderer.
   */
    function ParallelChannelPaneRenderer(source, geometry) {
      this._source = source;
      this._geometry = geometry;
    }

  /**
   * Helper function: draw.
   */
    ParallelChannelPaneRenderer.prototype.draw = function (target) {
      var source = this._source;
      var geometry = this._geometry;
      if (!source._options.visible || !geometry || !geometry.p1 || !geometry.p2 || !geometry.p3 || !isFiniteNumber(geometry.p1.x) || !isFiniteNumber(geometry.p1.y) || !isFiniteNumber(geometry.p2.x) || !isFiniteNumber(geometry.p2.y) || !isFiniteNumber(geometry.p3.x) || !isFiniteNumber(geometry.p3.y)) return;
      target.useBitmapCoordinateSpace(function (scope) {
        var ctx = scope.context;
        var ratioX = scope.horizontalPixelRatio || 1;
        var ratioY = scope.verticalPixelRatio || 1;
        var paneWidth = ((scope.bitmapSize && scope.bitmapSize.width) || Math.max(geometry.p1.x, geometry.p2.x, geometry.p3.x, 1)) / ratioX;
        var paneHeight = ((scope.bitmapSize && scope.bitmapSize.height) || Math.max(geometry.p1.y, geometry.p2.y, geometry.p3.y, 1)) / ratioY;
        var channel = resolveParallelChannelSegments(geometry.p1, geometry.p2, geometry.p3, paneWidth, paneHeight, source._options.extendMode);
        if (!channel) return;
        source._geometry = Object.assign({}, geometry, { channel: channel });

        ctx.save();
        if (ctx.rect && ctx.clip) {
          ctx.beginPath();
          ctx.rect(0, 0, Math.max(1, paneWidth * ratioX), Math.max(1, paneHeight * ratioY));
          ctx.clip();
        }

        if (source._options.style.showFill) {
          ctx.beginPath();
          channel.polygon.forEach(function (point, index) {
            var x = point.x * ratioX;
            var y = point.y * ratioY;
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.lineTo(channel.polygon[0].x * ratioX, channel.polygon[0].y * ratioY);
          ctx.globalAlpha = source._options.style.fillOpacity;
          ctx.fillStyle = source._options.style.fillColor;
          ctx.fill();
          ctx.globalAlpha = 1;
        }

        var lineColor = source._options.selected
          ? source._options.style.selectedColor
          : (source._options.hovered ? source._options.style.hoverColor : source._options.style.lineColor);
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = Math.max(1, source._options.style.lineWidth * ratioX);
        ctx.lineCap = 'round';
        if (ctx.setLineDash) ctx.setLineDash(parallelChannelDashPattern(source._options.style.lineStyle, ratioX));
        ctx.beginPath();
        drawParallelChannelLine(ctx, channel.base, ratioX, ratioY);
        drawParallelChannelLine(ctx, channel.parallel, ratioX, ratioY);
        ctx.stroke();

        if (source._options.style.showMidline) {
          ctx.strokeStyle = source._options.style.midlineColor;
          ctx.lineWidth = Math.max(1, ratioX);
          if (ctx.setLineDash) ctx.setLineDash(parallelChannelDashPattern(source._options.style.midlineStyle, ratioX));
          ctx.beginPath();
          drawParallelChannelLine(ctx, channel.midline, ratioX, ratioY);
          ctx.stroke();
        }
        if (ctx.setLineDash) ctx.setLineDash([]);

        if (source._options.selected || source._options.draft || source._options.style.showHandles) {
          var radius = (source._options.selected ? source._options.style.selectedHandleRadius : source._options.style.handleRadius) * ratioX;
          ctx.fillStyle = source._options.style.handleFillColor;
          ctx.strokeStyle = lineColor;
          ctx.lineWidth = Math.max(1, 1.5 * ratioX);
          [geometry.p1, geometry.p2, geometry.p3].forEach(function (point) {
            ctx.beginPath();
            ctx.arc(point.x * ratioX, point.y * ratioY, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          });
        }
        ctx.restore();
      });
    };

  /**
   * Helper function: ParallelChannelPaneView.
   */
    function ParallelChannelPaneView(source) {
      this._source = source;
      this._geometry = { p1: null, p2: null, p3: null, channel: null };
    }

  /**
   * Helper function: update.
   */
    ParallelChannelPaneView.prototype.update = function () {
      var series = this._source.series;
      this._geometry = {
        p1: { x: resolveCoordinateFromTime(this._source.chart, series, this._source._p1.time), y: series.priceToCoordinate(this._source._p1.price) },
        p2: { x: resolveCoordinateFromTime(this._source.chart, series, this._source._p2.time), y: series.priceToCoordinate(this._source._p2.price) },
        p3: { x: resolveCoordinateFromTime(this._source.chart, series, this._source._p3.time), y: series.priceToCoordinate(this._source._p3.price) },
        channel: this._source._geometry ? this._source._geometry.channel : null
      };
      this._source._geometry = this._geometry;
    };

  /**
   * Helper function: renderer.
   */
    ParallelChannelPaneView.prototype.renderer = function () {
      return new ParallelChannelPaneRenderer(this._source, this._geometry);
    };

  /**
   * Helper function: ParallelChannelPrimitive.
   */
    function ParallelChannelPrimitive(anchorA, anchorB, anchorC, opts) {
      PrimitiveBase.call(this);
      this._p1 = clonePoint(anchorA);
      this._p2 = clonePoint(anchorB);
      this._p3 = clonePoint(anchorC);
      var source = opts && typeof opts === 'object' ? opts : {};
      this._options = {
        draft: !!draft,
        extendMode: normalizeParallelChannelExtendMode(source.extendMode),
        hovered: !!source.hovered,
        selected: !!source.selected,
        visible: source.visible === false || source.hidden === true ? false : true,
        style: normalizeParallelChannelStyle(source.style, draft)
      };
      this._geometry = null;
      this._paneViews = [new ParallelChannelPaneView(this)];
    }

    ParallelChannelPrimitive.prototype = Object.create(PrimitiveBase.prototype);
    ParallelChannelPrimitive.prototype.constructor = ParallelChannelPrimitive;
  /**
   * Helper function: updateAllViews.
   */
    ParallelChannelPrimitive.prototype.updateAllViews = function () {
      this._paneViews.forEach(function (view) { view.update(); });
    };
  /**
   * Helper function: paneViews.
   */
    ParallelChannelPrimitive.prototype.paneViews = function () {
      return this._paneViews;
    };
  /**
   * Helper function: setVisible.
   */
    ParallelChannelPrimitive.prototype.setVisible = function (visible) {
      this._options.visible = !!visible;
      this.requestUpdate();
    };
  /**
   * Helper function: setSelected.
   */
    ParallelChannelPrimitive.prototype.setSelected = function (selected) {
      this._options.selected = !!selected;
      this.requestUpdate();
    };
  /**
   * Helper function: setHovered.
   */
    ParallelChannelPrimitive.prototype.setHovered = function (hovered) {
      this._options.hovered = !!hovered;
      this.requestUpdate();
    };
  /**
   * Helper function: updatePoints.
   */
    ParallelChannelPrimitive.prototype.updatePoints = function (pointA, pointB, pointC) {
      this._p1 = clonePoint(pointA);
      this._p2 = clonePoint(pointB);
      this._p3 = clonePoint(pointC);
      this.requestUpdate();
    };
  /**
   * Helper function: getPoints.
   */
    ParallelChannelPrimitive.prototype.getPoints = function () {
      return clonePoints([this._p1, this._p2, this._p3]);
    };
  /**
   * Helper function: getGeometry.
   */
    ParallelChannelPrimitive.prototype.getGeometry = function () {
      this.updateAllViews();
      return this._geometry;
    };
  /**
   * Helper function: hitTest.
   */
    ParallelChannelPrimitive.prototype.hitTest = function (point, context) {
      this.updateAllViews();
      var geometry = this._geometry;
      if (!geometry || !geometry.p1 || !geometry.p2 || !geometry.p3 || !isFiniteNumber(geometry.p1.x) || !isFiniteNumber(geometry.p1.y) || !isFiniteNumber(geometry.p2.x) || !isFiniteNumber(geometry.p2.y) || !isFiniteNumber(geometry.p3.x) || !isFiniteNumber(geometry.p3.y)) {
        return null;
      }
      var isTouch = context && context.isTouch;
      var handleThreshold = isTouch ? 20 : 10;
      var lineThreshold = isTouch ? 14 : 8;
      if (distanceToParallelChannelPoint(point, geometry.p1) <= handleThreshold) return { part: 'p1' };
      if (distanceToParallelChannelPoint(point, geometry.p2) <= handleThreshold) return { part: 'p2' };
      if (distanceToParallelChannelPoint(point, geometry.p3) <= handleThreshold) return { part: 'p3' };
      var fallbackPaneWidth = Math.max(geometry.p1.x, geometry.p2.x, geometry.p3.x, 1);
      var fallbackPaneHeight = Math.max(geometry.p1.y, geometry.p2.y, geometry.p3.y, 1);
      var channel = geometry.channel || resolveParallelChannelSegments(geometry.p1, geometry.p2, geometry.p3, fallbackPaneWidth, fallbackPaneHeight, this._options.extendMode);
      if (!channel) return null;
      if (distanceToParallelChannelSegment(point, channel.base.start, channel.base.end) <= lineThreshold) return { part: 'body' };
      if (distanceToParallelChannelSegment(point, channel.parallel.start, channel.parallel.end) <= lineThreshold) return { part: 'body' };
      if (distanceToParallelChannelSegment(point, channel.midline.start, channel.midline.end) <= lineThreshold) return { part: 'body' };
      return null;
    };
  /**
   * Helper function: buildEditPoints.
   */
    ParallelChannelPrimitive.prototype.buildEditPoints = function (part, originalPoints, startPoint, editPoint) {
      if (!Array.isArray(originalPoints) || originalPoints.length < 3 || !editPoint) return null;
      var next = clonePoints(originalPoints.slice(0, 3));
      if (part === 'p1') next[0] = clonePoint(editPoint);
      if (part === 'p2') next[1] = clonePoint(editPoint);
      if (part === 'p3') next[2] = clonePoint(editPoint);
      return next;
    };
    return new ParallelChannelPrimitive(pointA, pointB, pointC, record, draft);
  }

  /**
   * Builds a serialized record object representing the current state of the drawing tool for persistence.
   */
  function buildParallelChannelRecord(points, style, extendMode) {
    var now = Date.now();
    return {
      type: 'parallelChannel',
      paneId: 'main',
      points: clonePoints(points.slice(0, 3)),
      style: normalizeParallelChannelStyle(style, false),
      extendMode: normalizeParallelChannelExtendMode(extendMode),
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
  function ParallelChannelTool(chart, series, manager) {
    BaseTool.call(this, 'parallelChannel', chart, series, manager);
    this._points = [];
    this._style = normalizeParallelChannelStyle(null, false);
    this._extendMode = 'right';
    this._handleClick = this._handleClick.bind(this);
    this._usesNativeChartInput = !manager.shouldUseDirectTouchInput();
    if (this._usesNativeChartInput) {
      this._chart.subscribeClick(this._handleClick);
    }
  }

  ParallelChannelTool.prototype = Object.create(BaseTool.prototype);
  ParallelChannelTool.prototype.constructor = ParallelChannelTool;
  /**
   * Initiates the drawing process for the tool.
   */
  ParallelChannelTool.prototype.startDrawing = function () {
    BaseTool.prototype.startDrawing.call(this);
    this._points = [];
  };
  /**
   * Terminates the active drawing process and cleans up.
   */
  ParallelChannelTool.prototype.stopDrawing = function () {
    BaseTool.prototype.stopDrawing.call(this);
    this._points = [];
  };
  /**
   * Handles click events on the chart to process point placement for the drawing tool.
   */
  ParallelChannelTool.prototype._handleClick = function (param) {
    if (!this._drawing) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    this._points.push(clonePoint(point));
    if (this._points.length >= 3) {
      var points = clonePoints(this._points.slice(0, 3));
      var serialized = buildParallelChannelRecord(points, this._style, this._extendMode);
      this._completeDrawing(createParallelChannelPrimitive(points[0], points[1], points[2], serialized, false), null, serialized);
    }
  };
  /**
   * Removes the tool and cleans up associated event listeners.
   */
  ParallelChannelTool.prototype.remove = function () {
    this.stopDrawing();
    if (this._usesNativeChartInput) {
      this._chart.unsubscribeClick(this._handleClick);
    }
  };

  /**
   * Registers this drawing tool with the global drawing manager so it can be instantiated by the chart.
   */
  registerEnhancedDrawingTool({
    kind: 'parallelChannel',
    defaultLabel: 'Parallel Channel',
    requiredPointCount: 3,
    createTool: function (chart, series, manager) {
      return new ParallelChannelTool(chart, series, manager);
    },
    createPrimitiveFromRecord: function (record) {
      var points = record.points || [];
      return createParallelChannelPrimitive(points[0], points[1], points[2], record, false);
    }
  });
`,
};
