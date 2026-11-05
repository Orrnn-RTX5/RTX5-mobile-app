import type { EnhancedDrawingToolRuntime } from '../types';

export const freehandBrushEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'freehand',
  script: `
  function normalizeFreehandStyle(style, draft) {
    var source = style && typeof style === 'object' ? style : {};
    return {
      color: typeof source.color === 'string' ? source.color : '#EC4899',
      selectedColor: typeof source.selectedColor === 'string' ? source.selectedColor : '#DB2777',
      hoverColor: typeof source.hoverColor === 'string' ? source.hoverColor : '#F472B6',
      width: isFiniteNumber(source.width) ? Math.max(1, Math.min(12, source.width)) : 3,
      lineStyle: draft ? 'solid' : (source.lineStyle === 'dashed' || source.lineStyle === 'dotted' ? source.lineStyle : 'solid'),
      opacity: isFiniteNumber(source.opacity) ? Math.max(0.1, Math.min(1, source.opacity)) : (draft ? 0.72 : 1),
      handleFillColor: typeof source.handleFillColor === 'string' ? source.handleFillColor : '#FFFFFF',
      handleRadius: isFiniteNumber(source.handleRadius) ? Math.max(3, Math.min(9, source.handleRadius)) : 4,
      selectedHandleRadius: isFiniteNumber(source.selectedHandleRadius) ? Math.max(4, Math.min(12, source.selectedHandleRadius)) : 5
    };
  }

  function freehandDashPattern(style, ratio) {
    var px = Math.max(1, ratio || 1);
    if (style === 'dashed') return [8 * px, 5 * px];
    if (style === 'dotted') return [2 * px, 5 * px];
    return [];
  }

  function compactFreehandPoints(points, maxPoints) {
    var source = Array.isArray(points) ? points : [];
    var unique = [];
    source.forEach(function (point) {
      if (!point || point.time === undefined || !isFiniteNumber(point.price)) return;
      var previous = unique[unique.length - 1];
      if (previous && previous.time === point.time && previous.price === point.price) return;
      unique.push(clonePoint(point));
    });
    var limit = isFiniteNumber(maxPoints) ? Math.max(2, Math.floor(maxPoints)) : 512;
    if (unique.length <= limit) return unique;
    var result = [unique[0]];
    var usable = limit - 2;
    for (var index = 1; index <= usable; index += 1) {
      var sourceIndex = Math.round(index * (unique.length - 1) / (usable + 1));
      result.push(unique[sourceIndex]);
    }
    result.push(unique[unique.length - 1]);
    return result;
  }

  function createFreehandPrimitive(points, record, draft) {
    function FreehandPaneRenderer(source, coords) {
      this._source = source;
      this._coords = coords;
    }

    FreehandPaneRenderer.prototype.draw = function (target) {
      var source = this._source;
      var coords = this._coords.filter(function (item) {
        return item && item.x !== null && item.y !== null && isFiniteNumber(item.x) && isFiniteNumber(item.y);
      });
      if (!source._options.visible || coords.length === 0) return;
      target.useBitmapCoordinateSpace(function (scope) {
        var ctx = scope.context;
        var horizontalRatio = scope.horizontalPixelRatio || 1;
        var verticalRatio = scope.verticalPixelRatio || 1;
        var color = source._options.selected
          ? source._options.selectedColor
          : (source._options.hovered ? source._options.hoverColor : source._options.color);
        ctx.save();
        ctx.globalAlpha = source._options.opacity;
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1, source._options.width * horizontalRatio);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (ctx.setLineDash) ctx.setLineDash(freehandDashPattern(source._options.lineStyle, horizontalRatio));
        ctx.beginPath();
        if (coords.length === 1) {
          ctx.arc(coords[0].x * horizontalRatio, coords[0].y * verticalRatio, Math.max(1.5, source._options.width * horizontalRatio * 0.5), 0, Math.PI * 2);
          ctx.stroke();
        } else {
          coords.forEach(function (coord, index) {
            var x = coord.x * horizontalRatio;
            var y = coord.y * verticalRatio;
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.stroke();
        }
        if (ctx.setLineDash) ctx.setLineDash([]);
        if (source._options.selected || source._options.draft) {
          var radius = (source._options.selected ? source._options.selectedHandleRadius : source._options.handleRadius) * horizontalRatio;
          var first = coords[0];
          var last = coords[coords.length - 1];
          ctx.fillStyle = source._options.handleFillColor;
          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(1, 1.5 * horizontalRatio);
          [first, last].forEach(function (coord) {
            ctx.beginPath();
            ctx.arc(coord.x * horizontalRatio, coord.y * verticalRatio, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          });
        }
        ctx.restore();
      });
    };

    function FreehandPaneView(source) {
      this._source = source;
      this._coords = [];
    }

    FreehandPaneView.prototype.update = function () {
      var series = this._source.series;
      this._coords = this._source._points.map(function (point) {
        return {
          x: resolveCoordinateFromTime(this._source.chart, series, point.time),
          y: series.priceToCoordinate(point.price)
        };
      }, this);
    };

    FreehandPaneView.prototype.renderer = function () {
      return new FreehandPaneRenderer(this._source, this._coords);
    };

    function FreehandPrimitive(pointList, opts) {
      PrimitiveBase.call(this);
      var source = opts && typeof opts === 'object' ? opts : {};
      this._points = compactFreehandPoints(pointList, source.maxPoints || 512);
      this._options = Object.assign({
        type: 'freehand',
        paneId: 'main',
        visible: true,
        selected: false,
        hovered: false,
        draft: false,
        maxPoints: 512
      }, source, normalizeFreehandStyle(source.style, draft));
      this._paneViews = [new FreehandPaneView(this)];
    }

    FreehandPrimitive.prototype = Object.create(PrimitiveBase.prototype);
    FreehandPrimitive.prototype.constructor = FreehandPrimitive;
    FreehandPrimitive.prototype.updateAllViews = function () {
      this._paneViews.forEach(function (view) { view.update(); });
    };
    FreehandPrimitive.prototype.paneViews = function () {
      return this._paneViews;
    };
    FreehandPrimitive.prototype.setVisible = function (visible) {
      this._options.visible = !!visible;
      this.requestUpdate();
    };
    FreehandPrimitive.prototype.setSelected = function (selected) {
      this._options.selected = !!selected;
      this.requestUpdate();
    };
    FreehandPrimitive.prototype.setHovered = function (hovered) {
      this._options.hovered = !!hovered;
      this.requestUpdate();
    };
    FreehandPrimitive.prototype.updatePoints = function () {
      var nextPoints = Array.isArray(arguments[0]) ? arguments[0] : Array.prototype.slice.call(arguments);
      this._points = compactFreehandPoints(nextPoints, this._options.maxPoints || 512);
      this.requestUpdate();
    };
    FreehandPrimitive.prototype.getPoints = function () {
      return clonePoints(this._points);
    };
    FreehandPrimitive.prototype._distanceToPoint = function (a, b) {
      if (!a || !b || !isFiniteNumber(a.x) || !isFiniteNumber(a.y) || !isFiniteNumber(b.x) || !isFiniteNumber(b.y)) {
        return Number.POSITIVE_INFINITY;
      }
      var dx = a.x - b.x;
      var dy = a.y - b.y;
      return Math.sqrt((dx * dx) + (dy * dy));
    };
    FreehandPrimitive.prototype._distanceToSegment = function (point, a, b) {
      if (!point || !a || !b) return Number.POSITIVE_INFINITY;
      var dx = b.x - a.x;
      var dy = b.y - a.y;
      var lengthSquared = (dx * dx) + (dy * dy);
      if (lengthSquared <= 0.0001) return this._distanceToPoint(point, a);
      var t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
      t = Math.max(0, Math.min(1, t));
      return this._distanceToPoint(point, {
        x: a.x + (dx * t),
        y: a.y + (dy * t)
      });
    };
    FreehandPrimitive.prototype.getGeometry = function () {
      this.updateAllViews();
      var coords = this._paneViews[0] ? this._paneViews[0]._coords : [];
      return {
        points: coords.map(function (coord) {
          return { x: coord.x, y: coord.y };
        })
      };
    };
    FreehandPrimitive.prototype.hitTest = function (point, context) {
      var geometry = this.getGeometry();
      var coords = geometry && Array.isArray(geometry.points)
        ? geometry.points.filter(function (coord) {
          return coord && isFiniteNumber(coord.x) && isFiniteNumber(coord.y);
        })
        : [];
      if (coords.length === 0) return null;
      var threshold = (context && context.isTouch ? 16 : 9) + Math.max(1, this._options.width);
      if (coords.length === 1) {
        return this._distanceToPoint(point, coords[0]) <= threshold ? { part: 'body' } : null;
      }
      for (var index = 1; index < coords.length; index += 1) {
        if (this._distanceToSegment(point, coords[index - 1], coords[index]) <= threshold) {
          return { part: 'body' };
        }
      }
      return null;
    };
    FreehandPrimitive.prototype.buildEditPoints = function (part, originalPoints, startPoint, editPoint) {
      if (part !== 'body' || !Array.isArray(originalPoints) || originalPoints.length < 2 || !startPoint || !editPoint) return null;
      var priceDelta = editPoint.price - startPoint.price;
      var timeDelta = isFiniteNumber(editPoint.time) && isFiniteNumber(startPoint.time)
        ? editPoint.time - startPoint.time
        : 0;
      var dataIndexDelta = isFiniteNumber(editPoint.dataIndex) && isFiniteNumber(startPoint.dataIndex)
        ? editPoint.dataIndex - startPoint.dataIndex
        : null;
      return originalPoints.map(function (point) {
        var next = clonePoint(point);
        if (isFiniteNumber(next.time)) next.time += timeDelta;
        if (isFiniteNumber(next.timestamp)) next.timestamp += timeDelta;
        if (dataIndexDelta !== null && isFiniteNumber(next.dataIndex)) next.dataIndex += dataIndexDelta;
        next.price = point.price + priceDelta;
        return next;
      });
    };
    return new FreehandPrimitive(points, record || {});
  }

  function buildFreehandRecord(points, style) {
    var now = Date.now();
    var compacted = compactFreehandPoints(points, 512);
    return {
      type: 'freehand',
      paneId: 'main',
      points: compacted,
      style: normalizeFreehandStyle(style, false),
      locked: false,
      visible: true,
      selected: false,
      createdAt: now,
      updatedAt: now
    };
  }

  function FreehandBrushTool(chart, series, manager) {
    BaseTool.call(this, 'freehand', chart, series, manager);
    this._points = [];
    this._preview = null;
    this._style = normalizeFreehandStyle(null, false);
    this._handleClick = this._handleClick.bind(this);
    this._handleMove = this._handleMove.bind(this);
    this._usesNativeChartInput = !manager.shouldUseDirectTouchInput();
    if (this._usesNativeChartInput) {
      this._chart.subscribeClick(this._handleClick);
      this._chart.subscribeCrosshairMove(this._handleMove);
    }
  }

  FreehandBrushTool.prototype = Object.create(BaseTool.prototype);
  FreehandBrushTool.prototype.constructor = FreehandBrushTool;
  FreehandBrushTool.prototype.startDrawing = function () {
    BaseTool.prototype.startDrawing.call(this);
    this._resetDrawingSession();
  };
  FreehandBrushTool.prototype._resetDrawingSession = function () {
    this._points = [];
    this._removePreview();
  };
  FreehandBrushTool.prototype.stopDrawing = function () {
    BaseTool.prototype.stopDrawing.call(this);
    this._resetDrawingSession();
  };
  FreehandBrushTool.prototype._removePreview = function () {
    if (this._preview) {
      try { this._series.detachPrimitive(this._preview); } catch (_error) {}
      this._preview = null;
    }
  };
  FreehandBrushTool.prototype._sameLogicalPoint = function (pointA, pointB) {
    return pointA && pointB && pointA.time === pointB.time && pointA.price === pointB.price;
  };
  FreehandBrushTool.prototype._appendPoint = function (point) {
    if (!point) return false;
    var previous = this._points[this._points.length - 1];
    if (previous && this._sameLogicalPoint(previous, point)) return false;
    this._points.push(clonePoint(point));
    if (this._points.length > 512) {
      this._points = compactFreehandPoints(this._points, 512);
    }
    return true;
  };
  FreehandBrushTool.prototype._startPreview = function (point) {
    this._points = [clonePoint(point)];
    this._preview = createFreehandPrimitive(this._points, {
      style: this._style,
      selected: true,
      visible: true,
      maxPoints: 512
    }, true);
    this._series.attachPrimitive(this._preview);
  };
  FreehandBrushTool.prototype._completeFreehand = function (point) {
    this._appendPoint(point);
    if (this._points.length < 2) {
      return;
    }
    var points = compactFreehandPoints(this._points, 512);
    this._removePreview();
    var serialized = buildFreehandRecord(points, this._style);
    this._completeDrawing(createFreehandPrimitive(points, serialized, false), null, serialized);
  };
  FreehandBrushTool.prototype._handleClick = function (param) {
    if (!this._drawing) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    if (this._points.length === 0) {
      this._startPreview(point);
      return;
    }
    this._completeFreehand(point);
  };
  FreehandBrushTool.prototype._handleMove = function (param) {
    if (!this._drawing || this._points.length === 0) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    if (this._appendPoint(point) && this._preview && typeof this._preview.updatePoints === 'function') {
      this._preview.updatePoints(this._points);
    }
  };
  FreehandBrushTool.prototype.remove = function () {
    this.stopDrawing();
    if (this._usesNativeChartInput) {
      this._chart.unsubscribeClick(this._handleClick);
      this._chart.unsubscribeCrosshairMove(this._handleMove);
    }
  };

  registerEnhancedDrawingTool({
    kind: 'freehand',
    defaultLabel: 'Freehand Brush',
    requiredPointCount: 2,
    maxPointCount: 512,
    createTool: function (chart, series, manager) {
      return new FreehandBrushTool(chart, series, manager);
    },
    createPrimitiveFromRecord: function (record) {
      return createFreehandPrimitive(record.points || [], Object.assign({}, record, {
        visible: !(record && record.hidden === true) && !(record && record.visible === false),
        style: normalizeFreehandStyle(record && record.style, false),
        maxPoints: 512
      }), false);
    }
  });
`,
};
