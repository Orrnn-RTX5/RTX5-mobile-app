import type { EnhancedDrawingToolRuntime } from '../types';

export const ellipseEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'ellipse',
  script: `
  function normalizeEllipseStyle(style, draft) {
    var source = style && typeof style === 'object' ? style : {};
    var borderColor = typeof source.borderColor === 'string'
      ? source.borderColor
      : (typeof source.color === 'string' ? source.color : '#8B5CF6');
    var opacity = isFiniteNumber(source.opacity) ? Math.max(0.08, Math.min(1, source.opacity)) : (draft ? 0.72 : 1);
    return {
      fillColor: typeof source.fillColor === 'string' ? source.fillColor : (draft ? 'rgba(139, 92, 246, 0.06)' : 'rgba(139, 92, 246, 0.12)'),
      borderColor: borderColor,
      selectedBorderColor: typeof source.selectedBorderColor === 'string' ? source.selectedBorderColor : '#7C3AED',
      hoverBorderColor: typeof source.hoverBorderColor === 'string' ? source.hoverBorderColor : '#A78BFA',
      borderWidth: isFiniteNumber(source.borderWidth) ? Math.max(1, Math.min(6, source.borderWidth)) : (isFiniteNumber(source.width) ? Math.max(1, Math.min(6, source.width)) : 1.5),
      borderStyle: normalizeHighlightLineStyle(source.borderStyle || source.lineStyle),
      opacity: opacity,
      showLabel: source.showLabel === true,
      label: typeof source.label === 'string' ? source.label : 'Circle / Ellipse',
      labelPosition: source.labelPosition === 'bottomLeft' || source.labelPosition === 'topRight' || source.labelPosition === 'bottomRight' ? source.labelPosition : 'topLeft',
      fontSize: isFiniteNumber(source.fontSize) ? Math.max(9, Math.min(15, source.fontSize)) : 11,
      labelBackgroundColor: typeof source.labelBackgroundColor === 'string' ? source.labelBackgroundColor : 'rgba(15, 23, 42, 0.92)',
      labelTextColor: typeof source.labelTextColor === 'string' ? source.labelTextColor : '#F8FAFC',
      showHandles: source.showHandles === false ? false : true,
      handleFillColor: typeof source.handleFillColor === 'string' ? source.handleFillColor : '#FFFFFF',
      handleStrokeColor: typeof source.handleStrokeColor === 'string' ? source.handleStrokeColor : borderColor,
      handleRadius: isFiniteNumber(source.handleRadius) ? Math.max(3, Math.min(9, source.handleRadius)) : 4,
      selectedHandleRadius: isFiniteNumber(source.selectedHandleRadius) ? Math.max(4, Math.min(12, source.selectedHandleRadius)) : 5
    };
  }

  function normalizeEllipseRecord(record, draft) {
    var source = record && typeof record === 'object' ? record : {};
    return {
      type: 'ellipse',
      paneId: typeof source.paneId === 'string' ? source.paneId : 'main',
      style: normalizeEllipseStyle(source.style, draft),
      extendMode: 'none',
      locked: !!source.locked,
      visible: source.visible === false || source.hidden === true ? false : true,
      selected: !!source.selected,
      hovered: !!source.hovered,
      draft: !!draft
    };
  }

  function resolveEllipseRenderBox(p1, p2) {
    var left = Math.min(p1.x, p2.x);
    var right = Math.max(p1.x, p2.x);
    var top = Math.min(p1.y, p2.y);
    var bottom = Math.max(p1.y, p2.y);
    return {
      left: left,
      right: Math.max(left + 1, right),
      top: top,
      bottom: Math.max(top + 1, bottom)
    };
  }

  function drawEllipsePath(ctx, centerX, centerY, radiusX, radiusY) {
    ctx.beginPath();
    if (typeof ctx.ellipse === 'function') {
      ctx.ellipse(centerX, centerY, Math.max(1, radiusX), Math.max(1, radiusY), 0, 0, Math.PI * 2);
      return;
    }
    ctx.arc(centerX, centerY, Math.max(1, Math.min(radiusX, radiusY)), 0, Math.PI * 2);
  }

  function buildEllipseLabel(source) {
    var style = source._options.style;
    return style.showLabel ? style.label : '';
  }

  function createEllipsePrimitive(pointA, pointB, record, draft) {
    function EllipsePaneRenderer(source, geometry) {
      this._source = source;
      this._geometry = geometry;
    }

    EllipsePaneRenderer.prototype.draw = function (target) {
      var source = this._source;
      var geometry = this._geometry;
      if (!source._options.visible || !geometry || !geometry.p1 || !geometry.p2 || !isFiniteNumber(geometry.p1.x) || !isFiniteNumber(geometry.p1.y) || !isFiniteNumber(geometry.p2.x) || !isFiniteNumber(geometry.p2.y)) return;
      target.useBitmapCoordinateSpace(function (scope) {
        var ctx = scope.context;
        var ratioX = scope.horizontalPixelRatio || 1;
        var ratioY = scope.verticalPixelRatio || 1;
        var paneWidth = ((scope.bitmapSize && scope.bitmapSize.width) || Math.max(geometry.p1.x, geometry.p2.x, 1)) / ratioX;
        var paneHeight = ((scope.bitmapSize && scope.bitmapSize.height) || Math.max(geometry.p1.y, geometry.p2.y, 1)) / ratioY;
        var box = resolveEllipseRenderBox(geometry.p1, geometry.p2);
        source._geometry = Object.assign({}, geometry, { box: box });

        var style = source._options.style;
        var left = Math.max(0, box.left) * ratioX;
        var top = Math.max(0, box.top) * ratioY;
        var width = Math.max(1, (Math.min(paneWidth, box.right) - Math.max(0, box.left)) * ratioX);
        var height = Math.max(1, (Math.min(paneHeight, box.bottom) - Math.max(0, box.top)) * ratioY);
        var centerX = left + (width / 2);
        var centerY = top + (height / 2);
        var radiusX = width / 2;
        var radiusY = height / 2;
        var borderColor = source._options.selected
          ? style.selectedBorderColor
          : (source._options.hovered ? style.hoverBorderColor : style.borderColor);

        ctx.save();
        if (ctx.rect && ctx.clip) {
          ctx.beginPath();
          ctx.rect(0, 0, Math.max(1, paneWidth * ratioX), Math.max(1, paneHeight * ratioY));
          ctx.clip();
        }
        ctx.globalAlpha = style.opacity;
        drawEllipsePath(ctx, centerX, centerY, radiusX, radiusY);
        ctx.fillStyle = style.fillColor;
        ctx.fill();
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = Math.max(1, style.borderWidth * ratioX);
        if (ctx.setLineDash) ctx.setLineDash(highlightDashPattern(style.borderStyle, ratioX));
        ctx.stroke();
        if (ctx.setLineDash) ctx.setLineDash([]);

        var label = buildEllipseLabel(source);
        if (shouldRenderObjectDescriptions(source) && label) {
          var fontSize = Math.round(style.fontSize * ratioX);
          var padding = 6 * ratioX;
          ctx.font = '700 ' + fontSize + 'px Arial';
          var textWidth = ctx.measureText(label).width;
          var labelWidth = Math.min(textWidth + padding * 1.8, Math.max(20 * ratioX, width - padding));
          var labelHeight = fontSize + padding * 1.4;
          var labelX = left + padding;
          var labelY = top + padding;
          if (style.labelPosition === 'topRight' || style.labelPosition === 'bottomRight') {
            labelX = left + width - labelWidth - padding;
          }
          if (style.labelPosition === 'bottomLeft' || style.labelPosition === 'bottomRight') {
            labelY = top + height - labelHeight - padding;
          }
          labelX = Math.max(2 * ratioX, Math.min((paneWidth * ratioX) - labelWidth - 2 * ratioX, labelX));
          labelY = Math.max(2 * ratioY, Math.min((paneHeight * ratioY) - labelHeight - 2 * ratioY, labelY));
          roundRectPath(ctx, labelX, labelY, labelWidth, labelHeight, 5 * ratioX);
          ctx.fillStyle = style.labelBackgroundColor;
          ctx.fill();
          ctx.fillStyle = style.labelTextColor;
          ctx.fillText(label, labelX + padding * 0.9, labelY + labelHeight - padding * 0.6, Math.max(10, labelWidth - padding * 1.6));
        }

        if (source._options.selected || source._options.draft || style.showHandles) {
          var radius = (source._options.selected ? style.selectedHandleRadius : style.handleRadius) * ratioX;
          var handleStroke = source._options.selected ? style.selectedBorderColor : style.handleStrokeColor;
          var handles = source.getHandleCoordinates();
          handles.forEach(function (handle) {
            drawHighlightHandle(ctx, handle.x * ratioX, handle.y * ratioY, radius, style.handleFillColor, handleStroke, ratioX);
          });
        }
        ctx.restore();
      });
    };

    function EllipsePaneView(source) {
      this._source = source;
      this._geometry = { p1: null, p2: null, box: null };
    }

    EllipsePaneView.prototype.update = function () {
      var series = this._source.series;
      var p1 = {
        x: resolveCoordinateFromTime(this._source.chart, series, this._source._p1.time),
        y: series.priceToCoordinate(this._source._p1.price)
      };
      var p2 = {
        x: resolveCoordinateFromTime(this._source.chart, series, this._source._p2.time),
        y: series.priceToCoordinate(this._source._p2.price)
      };
      this._geometry = { p1: p1, p2: p2, box: this._source._geometry ? this._source._geometry.box : null };
      this._source._geometry = this._geometry;
    };

    EllipsePaneView.prototype.renderer = function () {
      return new EllipsePaneRenderer(this._source, this._geometry);
    };

    function EllipsePrimitive(anchorA, anchorB, opts) {
      PrimitiveBase.call(this);
      this._p1 = clonePoint(anchorA);
      this._p2 = clonePoint(anchorB);
      this._options = Object.assign(normalizeEllipseRecord(opts, draft), {
        draft: !!draft
      });
      this._geometry = null;
      this._paneViews = [new EllipsePaneView(this)];
    }

    EllipsePrimitive.prototype = Object.create(PrimitiveBase.prototype);
    EllipsePrimitive.prototype.constructor = EllipsePrimitive;
    EllipsePrimitive.prototype.updateAllViews = function () {
      this._paneViews.forEach(function (view) { view.update(); });
    };
    EllipsePrimitive.prototype.paneViews = function () {
      return this._paneViews;
    };
    EllipsePrimitive.prototype.setVisible = function (visible) {
      this._options.visible = !!visible;
      this.requestUpdate();
    };
    EllipsePrimitive.prototype.setSelected = function (selected) {
      this._options.selected = !!selected;
      this.requestUpdate();
    };
    EllipsePrimitive.prototype.setHovered = function (hovered) {
      this._options.hovered = !!hovered;
      this.requestUpdate();
    };
    EllipsePrimitive.prototype.updatePoints = function (pointA, pointB) {
      this._p1 = clonePoint(pointA);
      this._p2 = clonePoint(pointB);
      this.requestUpdate();
    };
    EllipsePrimitive.prototype.getPoints = function () {
      return clonePoints([this._p1, this._p2]);
    };
    EllipsePrimitive.prototype.getLogicalBounds = function () {
      return resolveHighlightBounds(this._p1, this._p2);
    };
    EllipsePrimitive.prototype.getHandleCoordinates = function () {
      this.updateAllViews();
      var geometry = this._geometry;
      if (!geometry || !geometry.p1 || !geometry.p2 || !isFiniteNumber(geometry.p1.x) || !isFiniteNumber(geometry.p1.y) || !isFiniteNumber(geometry.p2.x) || !isFiniteNumber(geometry.p2.y)) {
        return [];
      }
      var left = Math.min(geometry.p1.x, geometry.p2.x);
      var right = Math.max(geometry.p1.x, geometry.p2.x);
      var top = Math.min(geometry.p1.y, geometry.p2.y);
      var bottom = Math.max(geometry.p1.y, geometry.p2.y);
      var midX = left + ((right - left) / 2);
      var midY = top + ((bottom - top) / 2);
      return [
        { part: 'top-left', x: left, y: top },
        { part: 'top', x: midX, y: top },
        { part: 'top-right', x: right, y: top },
        { part: 'right', x: right, y: midY },
        { part: 'bottom-right', x: right, y: bottom },
        { part: 'bottom', x: midX, y: bottom },
        { part: 'bottom-left', x: left, y: bottom },
        { part: 'left', x: left, y: midY }
      ];
    };
    EllipsePrimitive.prototype.getGeometry = function () {
      this.updateAllViews();
      var geometry = this._geometry;
      if (!geometry || !geometry.p1 || !geometry.p2 || !isFiniteNumber(geometry.p1.x) || !isFiniteNumber(geometry.p1.y) || !isFiniteNumber(geometry.p2.x) || !isFiniteNumber(geometry.p2.y)) {
        return null;
      }
      var box = geometry.box || resolveEllipseRenderBox(geometry.p1, geometry.p2);
      return {
        p1: { x: geometry.p1.x, y: geometry.p1.y },
        p2: { x: geometry.p2.x, y: geometry.p2.y },
        anchorRect: {
          anchorLeft: Math.min(geometry.p1.x, geometry.p2.x),
          anchorRight: Math.max(geometry.p1.x, geometry.p2.x),
          top: Math.min(geometry.p1.y, geometry.p2.y),
          bottom: Math.max(geometry.p1.y, geometry.p2.y)
        },
        visibleRect: {
          left: box.left,
          right: box.right,
          top: box.top,
          bottom: box.bottom
        }
      };
    };
    EllipsePrimitive.prototype.hitTest = function (point, context) {
      this.updateAllViews();
      var geometry = this._geometry;
      if (!geometry || !geometry.p1 || !geometry.p2 || !isFiniteNumber(geometry.p1.x) || !isFiniteNumber(geometry.p1.y) || !isFiniteNumber(geometry.p2.x) || !isFiniteNumber(geometry.p2.y)) {
        return null;
      }
      var isTouch = context && context.isTouch;
      var handleThreshold = isTouch ? 20 : 10;
      var edgeThreshold = isTouch ? 14 : 7;
      var handles = this.getHandleCoordinates();
      for (var i = 0; i < handles.length; i += 1) {
        if (distanceToHighlightPoint(point, handles[i]) <= handleThreshold) {
          return { part: handles[i].part };
        }
      }
      var box = geometry.box || resolveEllipseRenderBox(geometry.p1, geometry.p2);
      var radiusX = Math.max(1, (box.right - box.left) / 2);
      var radiusY = Math.max(1, (box.bottom - box.top) / 2);
      var centerX = box.left + radiusX;
      var centerY = box.top + radiusY;
      var dx = (point.x - centerX) / radiusX;
      var dy = (point.y - centerY) / radiusY;
      var normalized = (dx * dx) + (dy * dy);
      var edgeBand = edgeThreshold / Math.max(1, Math.min(radiusX, radiusY));
      if (normalized <= 1 + edgeBand) {
        return { part: Math.abs(normalized - 1) <= edgeBand ? 'border' : 'body' };
      }
      return null;
    };
    EllipsePrimitive.prototype.buildEditPoints = function (part, originalPoints, startPoint, editPoint) {
      if (!Array.isArray(originalPoints) || originalPoints.length < 2 || !editPoint) return null;
      if (part === 'body' || part === 'border') return null;
      var next = clonePoints(originalPoints.slice(0, 2));
      var time0 = timeToComparableValue(next[0].time);
      var time1 = timeToComparableValue(next[1].time);
      var leftIndex = time0 !== null && time1 !== null && time0 <= time1 ? 0 : 1;
      var rightIndex = leftIndex === 0 ? 1 : 0;
      var topIndex = next[0].price >= next[1].price ? 0 : 1;
      var bottomIndex = topIndex === 0 ? 1 : 0;
      if (part === 'top-left' || part === 'left' || part === 'bottom-left') next[leftIndex].time = editPoint.time;
      if (part === 'top-right' || part === 'right' || part === 'bottom-right') next[rightIndex].time = editPoint.time;
      if (part === 'top-left' || part === 'top' || part === 'top-right') next[topIndex].price = editPoint.price;
      if (part === 'bottom-left' || part === 'bottom' || part === 'bottom-right') next[bottomIndex].price = editPoint.price;
      return next;
    };
    return new EllipsePrimitive(pointA, pointB, record, draft);
  }

  function buildEllipseRecord(points, style) {
    var now = Date.now();
    return {
      type: 'ellipse',
      paneId: 'main',
      points: clonePoints(points.slice(0, 2)),
      style: normalizeEllipseStyle(style, false),
      extendMode: 'none',
      locked: false,
      visible: true,
      selected: false,
      createdAt: now,
      updatedAt: now
    };
  }

  function EllipseTool(chart, series, manager) {
    BaseTool.call(this, 'ellipse', chart, series, manager);
    this._points = [];
    this._preview = null;
    this._style = normalizeEllipseStyle(null, false);
    this._handleClick = this._handleClick.bind(this);
    this._handleMove = this._handleMove.bind(this);
    this._usesNativeChartInput = !manager.shouldUseDirectTouchInput();
    if (this._usesNativeChartInput) {
      this._chart.subscribeClick(this._handleClick);
      this._chart.subscribeCrosshairMove(this._handleMove);
    }
  }

  EllipseTool.prototype = Object.create(BaseTool.prototype);
  EllipseTool.prototype.constructor = EllipseTool;
  EllipseTool.prototype.startDrawing = function () {
    BaseTool.prototype.startDrawing.call(this);
    this._resetDrawingSession();
  };
  EllipseTool.prototype._resetDrawingSession = function () {
    this._points = [];
    this._removePreview();
  };
  EllipseTool.prototype.stopDrawing = function () {
    BaseTool.prototype.stopDrawing.call(this);
    this._resetDrawingSession();
  };
  EllipseTool.prototype._removePreview = function () {
    if (this._preview) {
      try { this._series.detachPrimitive(this._preview); } catch (_error) {}
      this._preview = null;
    }
  };
  EllipseTool.prototype._sameLogicalPoint = function (pointA, pointB) {
    return pointA && pointB && pointA.time === pointB.time && pointA.price === pointB.price;
  };
  EllipseTool.prototype._startPreview = function (point) {
    var record = buildEllipseRecord([point, point], this._style);
    this._preview = createEllipsePrimitive(point, point, record, true);
    this._series.attachPrimitive(this._preview);
  };
  EllipseTool.prototype._completeEllipse = function (secondPoint) {
    var firstPoint = this._points[0];
    if (!firstPoint || !secondPoint || this._sameLogicalPoint(firstPoint, secondPoint)) {
      return;
    }
    var points = [clonePoint(firstPoint), clonePoint(secondPoint)];
    this._removePreview();
    var serialized = buildEllipseRecord(points, this._style);
    this._completeDrawing(createEllipsePrimitive(points[0], points[1], serialized, false), 'Circle / Ellipse', serialized);
  };
  EllipseTool.prototype._handleClick = function (param) {
    if (!this._drawing) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    if (this._points.length === 0) {
      this._points = [clonePoint(point)];
      this._startPreview(this._points[0]);
      return;
    }
    this._completeEllipse(point);
  };
  EllipseTool.prototype._handleMove = function (param) {
    if (!this._drawing || !this._preview || this._points.length !== 1) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    this._preview.updatePoints(this._points[0], point);
  };
  EllipseTool.prototype.remove = function () {
    this.stopDrawing();
    if (this._usesNativeChartInput) {
      this._chart.unsubscribeClick(this._handleClick);
      this._chart.unsubscribeCrosshairMove(this._handleMove);
    }
  };

  registerEnhancedDrawingTool({
    kind: 'ellipse',
    defaultLabel: 'Circle / Ellipse',
    requiredPointCount: 2,
    createTool: function (chart, series, manager) {
      return new EllipseTool(chart, series, manager);
    },
    createPrimitiveFromRecord: function (record) {
      var points = record.points || [];
      var normalized = normalizeEllipseRecord(record, false);
      return createEllipsePrimitive(points[0], points[1], Object.assign({}, record, normalized), false);
    }
  });
`,
};
