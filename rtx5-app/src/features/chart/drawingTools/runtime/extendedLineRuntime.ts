import type { EnhancedDrawingToolRuntime } from '../types';

export const extendedLineEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'extendedLine',
  script: `
  function buildExtendedLineRecord(points, style) {
    var now = Date.now();
    return {
      type: 'extendedLine',
      paneId: 'main',
      points: clonePoints(points.slice(0, 2)),
      style: Object.assign({
        color: '#7C3AED',
        selectedColor: '#6D28D9',
        hoverColor: '#8B5CF6'
      }, style && typeof style === 'object' ? style : {}),
      extendMode: 'both',
      locked: false,
      visible: true,
      selected: false,
      createdAt: now,
      updatedAt: now
    };
  }

  function createExtendedLinePrimitive(pointA, pointB, record, draft) {
    var source = Object.assign({}, record || {}, { extendMode: 'both' });
    source.style = Object.assign({
      color: '#7C3AED',
      selectedColor: '#6D28D9',
      hoverColor: '#8B5CF6'
    }, source.style && typeof source.style === 'object' ? source.style : {});
    return createTrendLinePrimitive(pointA, pointB, source, draft);
  }

  function ExtendedLineTool(chart, series, manager) {
    BaseTool.call(this, 'extendedLine', chart, series, manager);
    this._points = [];
    this._preview = null;
    this._style = {
      color: '#7C3AED',
      selectedColor: '#6D28D9',
      hoverColor: '#8B5CF6'
    };
    this._handleClick = this._handleClick.bind(this);
    this._handleMove = this._handleMove.bind(this);
    this._usesNativeChartInput = !manager.shouldUseDirectTouchInput();
    if (this._usesNativeChartInput) {
      this._chart.subscribeClick(this._handleClick);
      this._chart.subscribeCrosshairMove(this._handleMove);
    }
  }

  ExtendedLineTool.prototype = Object.create(BaseTool.prototype);
  ExtendedLineTool.prototype.constructor = ExtendedLineTool;
  ExtendedLineTool.prototype.startDrawing = function () {
    BaseTool.prototype.startDrawing.call(this);
    this._resetDrawingSession();
  };
  ExtendedLineTool.prototype._resetDrawingSession = function () {
    this._points = [];
    this._removePreview();
  };
  ExtendedLineTool.prototype.stopDrawing = function () {
    BaseTool.prototype.stopDrawing.call(this);
    this._resetDrawingSession();
  };
  ExtendedLineTool.prototype._removePreview = function () {
    if (this._preview) {
      try { this._series.detachPrimitive(this._preview); } catch (_error) {}
      this._preview = null;
    }
  };
  ExtendedLineTool.prototype._sameLogicalPoint = function (pointA, pointB) {
    return pointA && pointB && pointA.time === pointB.time && pointA.price === pointB.price;
  };
  ExtendedLineTool.prototype._startPreview = function (point) {
    var serialized = buildExtendedLineRecord([point, point], this._style);
    this._preview = createExtendedLinePrimitive(point, point, Object.assign({}, serialized, { selected: true }), true);
    this._series.attachPrimitive(this._preview);
  };
  ExtendedLineTool.prototype._completeExtendedLine = function (secondPoint) {
    var firstPoint = this._points[0];
    if (!firstPoint || !secondPoint || this._sameLogicalPoint(firstPoint, secondPoint)) {
      return;
    }
    var points = [clonePoint(firstPoint), clonePoint(secondPoint)];
    this._removePreview();
    var serialized = buildExtendedLineRecord(points, this._style);
    this._completeDrawing(createExtendedLinePrimitive(points[0], points[1], serialized, false), null, serialized);
  };
  ExtendedLineTool.prototype._handleClick = function (param) {
    if (!this._drawing) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    if (this._points.length === 0) {
      this._points = [clonePoint(point)];
      this._startPreview(this._points[0]);
      return;
    }
    this._completeExtendedLine(point);
  };
  ExtendedLineTool.prototype._handleMove = function (param) {
    if (!this._drawing || !this._preview || this._points.length !== 1) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    this._preview.updatePoints(this._points[0], point);
  };
  ExtendedLineTool.prototype.remove = function () {
    this.stopDrawing();
    if (this._usesNativeChartInput) {
      this._chart.unsubscribeClick(this._handleClick);
      this._chart.unsubscribeCrosshairMove(this._handleMove);
    }
  };

  registerEnhancedDrawingTool({
    kind: 'extendedLine',
    defaultLabel: 'Extended Line',
    requiredPointCount: 2,
    createTool: function (chart, series, manager) {
      return new ExtendedLineTool(chart, series, manager);
    },
    createPrimitiveFromRecord: function (record) {
      var points = record.points || [];
      return createExtendedLinePrimitive(points[0], points[1], record, false);
    }
  });
`,
};
