import type { EnhancedDrawingToolRuntime } from '../types';

export const rectangleEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'rectangle',
  script: `
  function normalizeRectangleStyle(style, draft) {
    var source = style && typeof style === 'object' ? style : {};
    var borderColor = typeof source.borderColor === 'string'
      ? source.borderColor
      : (typeof source.color === 'string' ? source.color : '#64748B');
    var opacity = isFiniteNumber(source.opacity) ? Math.max(0.08, Math.min(1, source.opacity)) : (draft ? 0.72 : 1);
    return {
      fillColor: typeof source.fillColor === 'string' ? source.fillColor : (draft ? 'rgba(100, 116, 139, 0.06)' : 'rgba(100, 116, 139, 0.12)'),
      borderColor: borderColor,
      selectedBorderColor: typeof source.selectedBorderColor === 'string' ? source.selectedBorderColor : '#475569',
      hoverBorderColor: typeof source.hoverBorderColor === 'string' ? source.hoverBorderColor : '#94A3B8',
      borderWidth: isFiniteNumber(source.borderWidth) ? Math.max(1, Math.min(6, source.borderWidth)) : (isFiniteNumber(source.width) ? Math.max(1, Math.min(6, source.width)) : 1.5),
      borderStyle: normalizeHighlightLineStyle(source.borderStyle || source.lineStyle),
      opacity: opacity,
      cornerRadius: isFiniteNumber(source.cornerRadius) ? Math.max(0, Math.min(12, source.cornerRadius)) : 0,
      showLabel: source.showLabel === true,
      label: typeof source.label === 'string' ? source.label : 'Rectangle',
      labelPosition: source.labelPosition === 'bottomLeft' || source.labelPosition === 'topRight' || source.labelPosition === 'bottomRight' ? source.labelPosition : 'topLeft',
      fontSize: isFiniteNumber(source.fontSize) ? Math.max(9, Math.min(15, source.fontSize)) : 11,
      labelBackgroundColor: typeof source.labelBackgroundColor === 'string' ? source.labelBackgroundColor : 'rgba(15, 23, 42, 0.92)',
      labelTextColor: typeof source.labelTextColor === 'string' ? source.labelTextColor : '#F8FAFC',
      showPriceRange: false,
      showHandles: source.showHandles === false ? false : true,
      handleFillColor: typeof source.handleFillColor === 'string' ? source.handleFillColor : '#FFFFFF',
      handleStrokeColor: typeof source.handleStrokeColor === 'string' ? source.handleStrokeColor : borderColor,
      handleRadius: isFiniteNumber(source.handleRadius) ? Math.max(3, Math.min(9, source.handleRadius)) : 4,
      selectedHandleRadius: isFiniteNumber(source.selectedHandleRadius) ? Math.max(4, Math.min(12, source.selectedHandleRadius)) : 5
    };
  }

  function normalizeRectangleRecord(record, draft) {
    var source = record && typeof record === 'object' ? record : {};
    return {
      type: 'rectangle',
      paneId: typeof source.paneId === 'string' ? source.paneId : 'main',
      style: normalizeRectangleStyle(source.style, draft),
      extendMode: normalizeHighlightExtendMode(source.extendMode),
      locked: !!source.locked,
      visible: source.visible === false || source.hidden === true ? false : true,
      selected: !!source.selected,
      hovered: !!source.hovered,
      draft: !!draft
    };
  }

  function buildRectangleRecord(points, style, extendMode) {
    var now = Date.now();
    return {
      type: 'rectangle',
      paneId: 'main',
      points: clonePoints(points.slice(0, 2)),
      style: normalizeRectangleStyle(style, false),
      extendMode: normalizeHighlightExtendMode(extendMode),
      locked: false,
      visible: true,
      selected: false,
      createdAt: now,
      updatedAt: now
    };
  }

  function RectangleTool(chart, series, manager) {
    BaseTool.call(this, 'rectangle', chart, series, manager);
    this._points = [];
    this._preview = null;
    this._style = normalizeRectangleStyle(null, false);
    this._extendMode = 'none';
    this._handleClick = this._handleClick.bind(this);
    this._handleMove = this._handleMove.bind(this);
    this._usesNativeChartInput = !manager.shouldUseDirectTouchInput();
    if (this._usesNativeChartInput) {
      this._chart.subscribeClick(this._handleClick);
      this._chart.subscribeCrosshairMove(this._handleMove);
    }
  }

  RectangleTool.prototype = Object.create(BaseTool.prototype);
  RectangleTool.prototype.constructor = RectangleTool;
  RectangleTool.prototype.startDrawing = function () {
    BaseTool.prototype.startDrawing.call(this);
    this._resetDrawingSession();
  };
  RectangleTool.prototype._resetDrawingSession = function () {
    this._points = [];
    this._removePreview();
  };
  RectangleTool.prototype.stopDrawing = function () {
    BaseTool.prototype.stopDrawing.call(this);
    this._resetDrawingSession();
  };
  RectangleTool.prototype._removePreview = function () {
    if (this._preview) {
      try { this._series.detachPrimitive(this._preview); } catch (_error) {}
      this._preview = null;
    }
  };
  RectangleTool.prototype._sameLogicalPoint = function (pointA, pointB) {
    return pointA && pointB && pointA.time === pointB.time && pointA.price === pointB.price;
  };
  RectangleTool.prototype._startPreview = function (point) {
    var record = buildRectangleRecord([point, point], this._style, this._extendMode);
    this._preview = createHighlightBoxPrimitive(point, point, record, true);
    this._series.attachPrimitive(this._preview);
  };
  RectangleTool.prototype._completeRectangle = function (secondPoint) {
    var firstPoint = this._points[0];
    if (!firstPoint || !secondPoint || this._sameLogicalPoint(firstPoint, secondPoint)) {
      return;
    }
    var points = [clonePoint(firstPoint), clonePoint(secondPoint)];
    this._removePreview();
    var serialized = buildRectangleRecord(points, this._style, this._extendMode);
    this._completeDrawing(createHighlightBoxPrimitive(points[0], points[1], serialized, false), 'Rectangle', serialized);
  };
  RectangleTool.prototype._handleClick = function (param) {
    if (!this._drawing) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    if (this._points.length === 0) {
      this._points = [clonePoint(point)];
      this._startPreview(this._points[0]);
      return;
    }
    this._completeRectangle(point);
  };
  RectangleTool.prototype._handleMove = function (param) {
    if (!this._drawing || !this._preview || this._points.length !== 1) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    this._preview.updatePoints(this._points[0], point);
  };
  RectangleTool.prototype.remove = function () {
    this.stopDrawing();
    if (this._usesNativeChartInput) {
      this._chart.unsubscribeClick(this._handleClick);
      this._chart.unsubscribeCrosshairMove(this._handleMove);
    }
  };

  registerEnhancedDrawingTool({
    kind: 'rectangle',
    defaultLabel: 'Rectangle',
    requiredPointCount: 2,
    createTool: function (chart, series, manager) {
      return new RectangleTool(chart, series, manager);
    },
    createPrimitiveFromRecord: function (record) {
      var points = record.points || [];
      var normalized = normalizeRectangleRecord(record, false);
      return createHighlightBoxPrimitive(points[0], points[1], Object.assign({}, record, normalized), false);
    }
  });
`,
};
