import type { EnhancedDrawingToolRuntime } from '../types';

export const gannFanEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'gannFan',
  script: `
  /**
   * Standard Gann angle ratios expressed as price:time. The 1x1 line runs
   * through both anchor points; every other ray is a scaled multiple of it.
   */
  var GANN_FAN_RATIOS = [
    { price: 0, time: 1, primary: false },
    { price: 1, time: 8, primary: false },
    { price: 1, time: 4, primary: false },
    { price: 1, time: 3, primary: false },
    { price: 1, time: 2, primary: false },
    { price: 1, time: 1, primary: true },
    { price: 2, time: 1, primary: false },
    { price: 3, time: 1, primary: false },
    { price: 4, time: 1, primary: false },
    { price: 8, time: 1, primary: false }
  ];

  /**
   * Normalizes the style configuration for the Gann Fan, providing defaults for missing values.
   */
  function normalizeGannFanStyle(style, draft) {
    var source = style && typeof style === 'object' ? style : {};
    return {
      color: typeof source.color === 'string' ? source.color : '#EAB308',
      selectedColor: typeof source.selectedColor === 'string' ? source.selectedColor : '#CA8A04',
      hoverColor: typeof source.hoverColor === 'string' ? source.hoverColor : '#FACC15',
      width: isFiniteNumber(source.width) ? Math.max(1, Math.min(5, source.width)) : 1.4,
      lineStyle: source.lineStyle === 'dashed' || source.lineStyle === 'dotted' ? source.lineStyle : 'solid',
      opacity: isFiniteNumber(source.opacity) ? Math.max(0.1, Math.min(1, source.opacity)) : (draft ? 0.7 : 0.95),
      handleFillColor: typeof source.handleFillColor === 'string' ? source.handleFillColor : '#FFFFFF',
      handleRadius: isFiniteNumber(source.handleRadius) ? Math.max(3, Math.min(8, source.handleRadius)) : 4,
      selectedHandleRadius: isFiniteNumber(source.selectedHandleRadius) ? Math.max(4, Math.min(10, source.selectedHandleRadius)) : 5,
      showHandles: source.showHandles === true
    };
  }

  /**
   * Helper function: gannFanDashPattern.
   */
  function gannFanDashPattern(style, ratio) {
    var px = Math.max(1, ratio || 1);
    if (style === 'dashed') return [8 * px, 5 * px];
    if (style === 'dotted') return [2 * px, 5 * px];
    return [];
  }

  /**
   * Extends a ray from an origin in the given pixel direction until it exits the pane.
   */
  function resolveGannFanRayEnd(origin, dirX, dirY, paneWidth, paneHeight) {
    var magnitude = Math.max(Math.abs(dirX), Math.abs(dirY));
    if (!isFiniteNumber(magnitude) || magnitude < 0.0001) {
      return null;
    }
    var span = (Math.abs(paneWidth) + Math.abs(paneHeight)) * 2 + 1;
    var scale = span / magnitude;
    return { x: origin.x + (dirX * scale), y: origin.y + (dirY * scale) };
  }

  /**
   * Builds the pixel-space ray segments for the fan from its two anchor coordinates.
   */
  function resolveGannFanRays(p1, p2, paneWidth, paneHeight) {
    var baseDx = p2.x - p1.x;
    var baseDy = p2.y - p1.y;
    if ((Math.abs(baseDx) < 0.0001 && Math.abs(baseDy) < 0.0001) || !isFiniteNumber(baseDx) || !isFiniteNumber(baseDy)) {
      return null;
    }
    var rays = [];
    for (var i = 0; i < GANN_FAN_RATIOS.length; i += 1) {
      var ratio = GANN_FAN_RATIOS[i];
      var dirX = baseDx * ratio.time;
      var dirY = baseDy * ratio.price;
      var end = resolveGannFanRayEnd(p1, dirX, dirY, paneWidth, paneHeight);
      if (end) {
        rays.push({ start: { x: p1.x, y: p1.y }, end: end, primary: ratio.primary });
      }
    }
    return rays.length > 0 ? rays : null;
  }

  /**
   * Helper function: distanceToGannFanPoint.
   */
  function distanceToGannFanPoint(a, b) {
    if (!a || !b || !isFiniteNumber(a.x) || !isFiniteNumber(a.y) || !isFiniteNumber(b.x) || !isFiniteNumber(b.y)) {
      return Number.POSITIVE_INFINITY;
    }
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt((dx * dx) + (dy * dy));
  }

  /**
   * Helper function: distanceToGannFanSegment.
   */
  function distanceToGannFanSegment(point, a, b) {
    if (!point || !a || !b) return Number.POSITIVE_INFINITY;
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var lengthSquared = (dx * dx) + (dy * dy);
    if (lengthSquared <= 0.0001) return distanceToGannFanPoint(point, a);
    var t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
    return distanceToGannFanPoint(point, { x: a.x + (dx * t), y: a.y + (dy * t) });
  }

  /**
   * Creates the visual primitive object that gets rendered on the chart canvas.
   */
  function createGannFanPrimitive(pointA, pointB, record, draft) {
  /**
   * Helper function: GannFanPaneRenderer.
   */
    function GannFanPaneRenderer(source, geometry) {
      this._source = source;
      this._geometry = geometry;
    }

  /**
   * Helper function: draw.
   */
    GannFanPaneRenderer.prototype.draw = function (target) {
      var source = this._source;
      var geometry = this._geometry;
      if (!source._options.visible || !geometry || !geometry.p1 || !geometry.p2 || !isFiniteNumber(geometry.p1.x) || !isFiniteNumber(geometry.p1.y) || !isFiniteNumber(geometry.p2.x) || !isFiniteNumber(geometry.p2.y)) return;
      target.useBitmapCoordinateSpace(function (scope) {
        var ctx = scope.context;
        var ratioX = scope.horizontalPixelRatio || 1;
        var ratioY = scope.verticalPixelRatio || 1;
        var paneWidth = ((scope.bitmapSize && scope.bitmapSize.width) || Math.max(geometry.p1.x, geometry.p2.x, 1)) / ratioX;
        var paneHeight = ((scope.bitmapSize && scope.bitmapSize.height) || Math.max(geometry.p1.y, geometry.p2.y, 1)) / ratioY;
        var rays = resolveGannFanRays(geometry.p1, geometry.p2, paneWidth, paneHeight);
        if (!rays) return;
        source._geometry = Object.assign({}, geometry, { rays: rays });

        var lineColor = source._options.selected
          ? source._options.style.selectedColor
          : (source._options.hovered ? source._options.style.hoverColor : source._options.style.color);

        ctx.save();
        if (ctx.rect && ctx.clip) {
          ctx.beginPath();
          ctx.rect(0, 0, Math.max(1, paneWidth * ratioX), Math.max(1, paneHeight * ratioY));
          ctx.clip();
        }
        ctx.globalAlpha = source._options.style.opacity;
        ctx.strokeStyle = lineColor;
        ctx.lineCap = 'round';
        if (ctx.setLineDash) ctx.setLineDash(gannFanDashPattern(source._options.style.lineStyle, ratioX));
        rays.forEach(function (ray) {
          ctx.lineWidth = Math.max(1, (ray.primary ? source._options.style.width + 0.8 : source._options.style.width) * ratioX);
          ctx.globalAlpha = source._options.style.opacity * (ray.primary ? 1 : 0.82);
          ctx.beginPath();
          ctx.moveTo(ray.start.x * ratioX, ray.start.y * ratioY);
          ctx.lineTo(ray.end.x * ratioX, ray.end.y * ratioY);
          ctx.stroke();
        });
        if (ctx.setLineDash) ctx.setLineDash([]);
        ctx.globalAlpha = 1;

        if (source._options.selected || source._options.draft || source._options.style.showHandles) {
          var radius = (source._options.selected ? source._options.style.selectedHandleRadius : source._options.style.handleRadius) * ratioX;
          ctx.fillStyle = source._options.style.handleFillColor;
          ctx.strokeStyle = lineColor;
          ctx.lineWidth = Math.max(1, 1.5 * ratioX);
          [geometry.p1, geometry.p2].forEach(function (point) {
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
   * Helper function: GannFanPaneView.
   */
    function GannFanPaneView(source) {
      this._source = source;
      this._geometry = { p1: null, p2: null, rays: null };
    }

  /**
   * Helper function: update.
   */
    GannFanPaneView.prototype.update = function () {
      var series = this._source.series;
      this._geometry = {
        p1: { x: resolveCoordinateFromTime(this._source.chart, series, this._source._p1.time), y: series.priceToCoordinate(this._source._p1.price) },
        p2: { x: resolveCoordinateFromTime(this._source.chart, series, this._source._p2.time), y: series.priceToCoordinate(this._source._p2.price) },
        rays: this._source._geometry ? this._source._geometry.rays : null
      };
      this._source._geometry = this._geometry;
    };

  /**
   * Helper function: renderer.
   */
    GannFanPaneView.prototype.renderer = function () {
      return new GannFanPaneRenderer(this._source, this._geometry);
    };

  /**
   * Helper function: GannFanPrimitive.
   */
    function GannFanPrimitive(anchorA, anchorB, opts) {
      PrimitiveBase.call(this);
      this._p1 = clonePoint(anchorA);
      this._p2 = clonePoint(anchorB);
      var source = opts && typeof opts === 'object' ? opts : {};
      this._options = {
        draft: !!draft,
        hovered: !!source.hovered,
        selected: !!source.selected,
        visible: source.visible === false || source.hidden === true ? false : true,
        style: normalizeGannFanStyle(source.style, draft)
      };
      this._geometry = null;
      this._paneViews = [new GannFanPaneView(this)];
    }

    GannFanPrimitive.prototype = Object.create(PrimitiveBase.prototype);
    GannFanPrimitive.prototype.constructor = GannFanPrimitive;
    GannFanPrimitive.prototype.updateAllViews = function () {
      this._paneViews.forEach(function (view) { view.update(); });
    };
    GannFanPrimitive.prototype.paneViews = function () {
      return this._paneViews;
    };
    GannFanPrimitive.prototype.setVisible = function (visible) {
      this._options.visible = !!visible;
      this.requestUpdate();
    };
    GannFanPrimitive.prototype.setSelected = function (selected) {
      this._options.selected = !!selected;
      this.requestUpdate();
    };
    GannFanPrimitive.prototype.setHovered = function (hovered) {
      this._options.hovered = !!hovered;
      this.requestUpdate();
    };
    GannFanPrimitive.prototype.updatePoints = function (pointA, pointB) {
      if (pointA) this._p1 = clonePoint(pointA);
      if (pointB) this._p2 = clonePoint(pointB);
      this.requestUpdate();
    };
    GannFanPrimitive.prototype.getPoints = function () {
      return clonePoints([this._p1, this._p2]);
    };
    GannFanPrimitive.prototype.getGeometry = function () {
      this.updateAllViews();
      return this._geometry;
    };
    GannFanPrimitive.prototype.hitTest = function (point, context) {
      this.updateAllViews();
      var geometry = this._geometry;
      if (!geometry || !geometry.p1 || !geometry.p2 || !isFiniteNumber(geometry.p1.x) || !isFiniteNumber(geometry.p1.y) || !isFiniteNumber(geometry.p2.x) || !isFiniteNumber(geometry.p2.y)) {
        return null;
      }
      var isTouch = context && context.isTouch;
      var handleThreshold = isTouch ? 20 : 10;
      var lineThreshold = isTouch ? 12 : 7;
      if (distanceToGannFanPoint(point, geometry.p2) <= handleThreshold) return { part: 'p2' };
      if (distanceToGannFanPoint(point, geometry.p1) <= handleThreshold) return { part: 'p1' };
      var fallbackPaneWidth = Math.max(geometry.p1.x, geometry.p2.x, point.x, 1);
      var fallbackPaneHeight = Math.max(geometry.p1.y, geometry.p2.y, point.y, 1);
      var rays = geometry.rays || resolveGannFanRays(geometry.p1, geometry.p2, fallbackPaneWidth, fallbackPaneHeight);
      if (!rays) return null;
      for (var i = 0; i < rays.length; i += 1) {
        if (distanceToGannFanSegment(point, rays[i].start, rays[i].end) <= lineThreshold) return { part: 'body' };
      }
      return null;
    };
    GannFanPrimitive.prototype.buildEditPoints = function (part, originalPoints, startPoint, editPoint) {
      if (!Array.isArray(originalPoints) || originalPoints.length < 2 || !editPoint) return null;
      var next = clonePoints(originalPoints.slice(0, 2));
      if (part === 'p1') next[0] = clonePoint(editPoint);
      else if (part === 'p2') next[1] = clonePoint(editPoint);
      else return null;
      return next;
    };
    return new GannFanPrimitive(pointA, pointB, record);
  }

  /**
   * Builds a serialized record object representing the current state of the drawing tool for persistence.
   */
  function buildGannFanRecord(points, style) {
    var now = Date.now();
    return {
      type: 'gannFan',
      paneId: 'main',
      points: clonePoints(points.slice(0, 2)),
      style: normalizeGannFanStyle(style, false),
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
  function GannFanTool(chart, series, manager) {
    BaseTool.call(this, 'gannFan', chart, series, manager);
    this._points = [];
    this._preview = null;
    this._style = normalizeGannFanStyle(null, false);
    this._handleClick = this._handleClick.bind(this);
    this._handleMove = this._handleMove.bind(this);
    this._usesNativeChartInput = !manager.shouldUseDirectTouchInput();
    if (this._usesNativeChartInput) {
      this._chart.subscribeClick(this._handleClick);
      this._chart.subscribeCrosshairMove(this._handleMove);
    }
  }

  GannFanTool.prototype = Object.create(BaseTool.prototype);
  GannFanTool.prototype.constructor = GannFanTool;
  GannFanTool.prototype.startDrawing = function () {
    BaseTool.prototype.startDrawing.call(this);
    this._resetDrawingSession();
  };
  GannFanTool.prototype._resetDrawingSession = function () {
    this._points = [];
    this._removePreview();
  };
  GannFanTool.prototype.stopDrawing = function () {
    BaseTool.prototype.stopDrawing.call(this);
    this._resetDrawingSession();
  };
  GannFanTool.prototype._removePreview = function () {
    if (this._preview) {
      try { this._series.detachPrimitive(this._preview); } catch (_error) {}
      this._preview = null;
    }
  };
  GannFanTool.prototype._sameLogicalPoint = function (pointA, pointB) {
    return pointA && pointB && pointA.time === pointB.time && pointA.price === pointB.price;
  };
  GannFanTool.prototype._startPreview = function (point) {
    this._preview = createGannFanPrimitive(point, point, { style: this._style, selected: true }, true);
    this._series.attachPrimitive(this._preview);
  };
  GannFanTool.prototype._handleClick = function (param) {
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
    var serialized = buildGannFanRecord(points, this._style);
    this._completeDrawing(createGannFanPrimitive(points[0], points[1], serialized, false), null, serialized);
  };
  GannFanTool.prototype._handleMove = function (param) {
    if (!this._drawing || !this._preview || this._points.length !== 1) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    this._preview.updatePoints(this._points[0], point);
  };
  GannFanTool.prototype.remove = function () {
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
    kind: 'gannFan',
    defaultLabel: 'Gann Fan',
    requiredPointCount: 2,
    createTool: function (chart, series, manager) {
      return new GannFanTool(chart, series, manager);
    },
    createPrimitiveFromRecord: function (record) {
      var points = record.points || [];
      return createGannFanPrimitive(points[0], points[1], record, false);
    }
  });
`,
};
