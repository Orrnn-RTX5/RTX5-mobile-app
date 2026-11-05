import type { EnhancedDrawingToolRuntime } from '../types';

export const arrowMarkerEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'arrow',
  script: `
  function normalizeArrowMarkerStyle(style, draft) {
    var source = style && typeof style === 'object' ? style : {};
    return {
      color: typeof source.color === 'string' ? source.color : '#F97316',
      selectedColor: typeof source.selectedColor === 'string' ? source.selectedColor : '#EA580C',
      hoverColor: typeof source.hoverColor === 'string' ? source.hoverColor : '#FB923C',
      width: isFiniteNumber(source.width) ? Math.max(1, Math.min(8, source.width)) : 2,
      lineStyle: draft ? 'dashed' : (source.lineStyle === 'dashed' || source.lineStyle === 'dotted' ? source.lineStyle : 'solid'),
      opacity: isFiniteNumber(source.opacity) ? Math.max(0.1, Math.min(1, source.opacity)) : (draft ? 0.72 : 1),
      arrowHeadLength: isFiniteNumber(source.arrowHeadLength) ? Math.max(8, Math.min(28, source.arrowHeadLength)) : 14,
      arrowHeadWidth: isFiniteNumber(source.arrowHeadWidth) ? Math.max(7, Math.min(24, source.arrowHeadWidth)) : 12,
      handleFillColor: typeof source.handleFillColor === 'string' ? source.handleFillColor : '#FFFFFF',
      labelBackgroundColor: typeof source.labelBackgroundColor === 'string' ? source.labelBackgroundColor : 'rgba(15, 23, 42, 0.92)',
      labelTextColor: typeof source.labelTextColor === 'string' ? source.labelTextColor : '#FFFFFF'
    };
  }

  function buildArrowMarkerRecord(points, style) {
    var now = Date.now();
    return {
      type: 'arrow',
      paneId: 'main',
      points: clonePoints(points.slice(0, 2)),
      style: Object.assign({}, normalizeArrowMarkerStyle(style, false)),
      extendMode: 'none',
      locked: false,
      visible: true,
      selected: false,
      createdAt: now,
      updatedAt: now
    };
  }

  function decorateArrowMarkerPrimitive(primitive) {
    if (!primitive || primitive._arrowMarkerDecorated) {
      return primitive;
    }
    primitive._arrowMarkerDecorated = true;
    var originalPaneViews = primitive.paneViews;
    primitive.paneViews = function () {
      var views = typeof originalPaneViews === 'function' ? originalPaneViews.call(primitive) : [];
      views.forEach(function (view) {
        if (!view || view._arrowMarkerRendererWrapped || typeof view.renderer !== 'function') {
          return;
        }
        view._arrowMarkerRendererWrapped = true;
        var originalRenderer = view.renderer;
        view.renderer = function () {
          var lineRenderer = originalRenderer.call(view);
          return {
            draw: function (target) {
              if (lineRenderer && typeof lineRenderer.draw === 'function') {
                lineRenderer.draw(target);
              }
              drawArrowMarkerHead(target, primitive, view._points);
            }
          };
        };
      });
      return views;
    };
    return primitive;
  }

  function drawArrowMarkerHead(target, source, points) {
    if (!target || !source || !points || !source._options || !source._options.visible) {
      return;
    }
    var p1p = points.p1;
    var p2p = points.p2;
    if (!p1p || !p2p || p1p.x === null || p1p.y === null || p2p.x === null || p2p.y === null) {
      return;
    }
    target.useBitmapCoordinateSpace(function (scope) {
      var ctx = scope.context;
      var horizontalRatio = scope.horizontalPixelRatio || 1;
      var verticalRatio = scope.verticalPixelRatio || 1;
      var x1 = Math.round(p1p.x * horizontalRatio);
      var y1 = Math.round(p1p.y * verticalRatio);
      var x2 = Math.round(p2p.x * horizontalRatio);
      var y2 = Math.round(p2p.y * verticalRatio);
      var dx = x2 - x1;
      var dy = y2 - y1;
      var length = Math.sqrt((dx * dx) + (dy * dy));
      if (!isFiniteNumber(length) || length < 0.001) {
        return;
      }
      var lineColor = source._options.selected
        ? source._options.selectedColor
        : (source._options.hovered ? source._options.hoverColor : source._options.color);
      var unitX = dx / length;
      var unitY = dy / length;
      var perpX = -unitY;
      var perpY = unitX;
      var headLength = Math.min(length * 0.72, source._options.arrowHeadLength * horizontalRatio);
      var headWidth = source._options.arrowHeadWidth * horizontalRatio;
      var baseX = x2 - (unitX * headLength);
      var baseY = y2 - (unitY * headLength);
      var leftX = baseX + (perpX * headWidth * 0.5);
      var leftY = baseY + (perpY * headWidth * 0.5);
      var rightX = baseX - (perpX * headWidth * 0.5);
      var rightY = baseY - (perpY * headWidth * 0.5);
      ctx.save();
      ctx.globalAlpha = source._options.opacity;
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = Math.max(1, source._options.width * horizontalRatio);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (ctx.setLineDash) ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(leftX, leftY);
      ctx.moveTo(x2, y2);
      ctx.lineTo(rightX, rightY);
      ctx.stroke();
      ctx.restore();
    });
  }

  function createArrowMarkerPrimitive(pointA, pointB, record, draft) {
    var style = normalizeArrowMarkerStyle(record && record.style, draft);
    return decorateArrowMarkerPrimitive(createLinePrimitive(pointA, pointB, {
      color: style.color,
      selectedColor: style.selectedColor,
      hoverColor: style.hoverColor,
      width: style.width,
      lineStyle: style.lineStyle,
      opacity: style.opacity,
      extendMode: 'none',
      showHandles: !!draft,
      selected: !!(record && record.selected),
      visible: !(record && record.hidden === true) && !(record && record.visible === false),
      draft: !!draft,
      handleFillColor: style.handleFillColor,
      arrowHeadLength: style.arrowHeadLength,
      arrowHeadWidth: style.arrowHeadWidth,
      label: '',
      labelBackgroundColor: style.labelBackgroundColor,
      labelTextColor: style.labelTextColor
    }));
  }

  function ArrowMarkerTool(chart, series, manager) {
    BaseTool.call(this, 'arrow', chart, series, manager);
    this._points = [];
    this._preview = null;
    this._style = normalizeArrowMarkerStyle(null, false);
    this._handleClick = this._handleClick.bind(this);
    this._handleMove = this._handleMove.bind(this);
    this._usesNativeChartInput = !manager.shouldUseDirectTouchInput();
    if (this._usesNativeChartInput) {
      this._chart.subscribeClick(this._handleClick);
      this._chart.subscribeCrosshairMove(this._handleMove);
    }
  }

  ArrowMarkerTool.prototype = Object.create(BaseTool.prototype);
  ArrowMarkerTool.prototype.constructor = ArrowMarkerTool;
  ArrowMarkerTool.prototype.startDrawing = function () {
    BaseTool.prototype.startDrawing.call(this);
    this._resetDrawingSession();
  };
  ArrowMarkerTool.prototype._resetDrawingSession = function () {
    this._points = [];
    this._removePreview();
  };
  ArrowMarkerTool.prototype.stopDrawing = function () {
    BaseTool.prototype.stopDrawing.call(this);
    this._resetDrawingSession();
  };
  ArrowMarkerTool.prototype._removePreview = function () {
    if (this._preview) {
      try { this._series.detachPrimitive(this._preview); } catch (_error) {}
      this._preview = null;
    }
  };
  ArrowMarkerTool.prototype._sameLogicalPoint = function (pointA, pointB) {
    return pointA && pointB && pointA.time === pointB.time && pointA.price === pointB.price;
  };
  ArrowMarkerTool.prototype._startPreview = function (point) {
    var serialized = buildArrowMarkerRecord([point, point], this._style);
    this._preview = createArrowMarkerPrimitive(point, point, Object.assign({}, serialized, { selected: true }), true);
    this._series.attachPrimitive(this._preview);
  };
  ArrowMarkerTool.prototype._completeArrowMarker = function (secondPoint) {
    var firstPoint = this._points[0];
    if (!firstPoint || !secondPoint || this._sameLogicalPoint(firstPoint, secondPoint)) {
      return;
    }
    var points = [clonePoint(firstPoint), clonePoint(secondPoint)];
    this._removePreview();
    var serialized = buildArrowMarkerRecord(points, this._style);
    this._completeDrawing(createArrowMarkerPrimitive(points[0], points[1], serialized, false), null, serialized);
  };
  ArrowMarkerTool.prototype._handleClick = function (param) {
    if (!this._drawing) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    if (this._points.length === 0) {
      this._points = [clonePoint(point)];
      this._startPreview(this._points[0]);
      return;
    }
    this._completeArrowMarker(point);
  };
  ArrowMarkerTool.prototype._handleMove = function (param) {
    if (!this._drawing || !this._preview || this._points.length !== 1) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    this._preview.updatePoints(this._points[0], point);
  };
  ArrowMarkerTool.prototype.remove = function () {
    this.stopDrawing();
    if (this._usesNativeChartInput) {
      this._chart.unsubscribeClick(this._handleClick);
      this._chart.unsubscribeCrosshairMove(this._handleMove);
    }
  };

  registerEnhancedDrawingTool({
    kind: 'arrow',
    defaultLabel: 'Arrow / Marker',
    requiredPointCount: 2,
    createTool: function (chart, series, manager) {
      return new ArrowMarkerTool(chart, series, manager);
    },
    createPrimitiveFromRecord: function (record) {
      var points = record.points || [];
      return createArrowMarkerPrimitive(points[0], points[1], record, false);
    }
  });
`,
};
