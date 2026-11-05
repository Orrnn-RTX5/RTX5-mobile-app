import type { EnhancedDrawingToolRuntime } from '../types';

export const rayEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'ray',
  script: `
  /**
   * Builds a serialized record object representing the current state of the drawing tool for persistence.
   */
  function buildRayRecord(points, style) {
    var now = Date.now();
    return {
      type: 'ray',
      paneId: 'main',
      points: clonePoints(points.slice(0, 2)),
      style: Object.assign({
        color: '#0891B2',
        selectedColor: '#0E7490',
        hoverColor: '#06B6D4'
      }, style && typeof style === 'object' ? style : {}),
      extendMode: 'right',
      locked: false,
      visible: true,
      selected: false,
      createdAt: now,
      updatedAt: now
    };
  }

  /**
   * Creates the visual primitive object that gets rendered on the chart canvas.
   */
  function createRayPrimitive(pointA, pointB, record, draft) {
    var source = Object.assign({}, record || {}, { extendMode: 'right' });
    if (!source.style) {
      source.style = {
        color: '#0891B2',
        selectedColor: '#0E7490',
        hoverColor: '#06B6D4'
      };
    }
    return createTrendLinePrimitive(pointA, pointB, source, draft);
  }

  /**
   * Constructor function for the drawing tool class, initializing its state and event listeners.
   */
  function RayTool(chart, series, manager) {
    BaseTool.call(this, 'ray', chart, series, manager);
    this._points = [];
    this._preview = null;
    this._style = {
      color: '#0891B2',
      selectedColor: '#0E7490',
      hoverColor: '#06B6D4'
    };
    this._handleClick = this._handleClick.bind(this);
    this._handleMove = this._handleMove.bind(this);
    this._usesNativeChartInput = !manager.shouldUseDirectTouchInput();
    if (this._usesNativeChartInput) {
      this._chart.subscribeClick(this._handleClick);
      this._chart.subscribeCrosshairMove(this._handleMove);
    }
  }

  RayTool.prototype = Object.create(BaseTool.prototype);
  RayTool.prototype.constructor = RayTool;
  /**
   * Initiates the drawing process for the tool.
   */
  RayTool.prototype.startDrawing = function () {
    BaseTool.prototype.startDrawing.call(this);
    this._resetDrawingSession();
  };
  /**
   * Helper function: _resetDrawingSession.
   */
  RayTool.prototype._resetDrawingSession = function () {
    this._points = [];
    this._removePreview();
  };
  /**
   * Terminates the active drawing process and cleans up.
   */
  RayTool.prototype.stopDrawing = function () {
    BaseTool.prototype.stopDrawing.call(this);
    this._resetDrawingSession();
  };
  /**
   * Removes the tool and cleans up associated event listeners.
   */
  RayTool.prototype._removePreview = function () {
    if (this._preview) {
      try { this._series.detachPrimitive(this._preview); } catch (_error) {}
      this._preview = null;
    }
  };
  /**
   * Helper function: _sameLogicalPoint.
   */
  RayTool.prototype._sameLogicalPoint = function (pointA, pointB) {
    return pointA && pointB && pointA.time === pointB.time && pointA.price === pointB.price;
  };
  /**
   * Helper function: _startPreview.
   */
  RayTool.prototype._startPreview = function (point) {
    var serialized = buildRayRecord([point, point], this._style);
    this._preview = createRayPrimitive(point, point, Object.assign({}, serialized, { selected: true }), true);
    this._series.attachPrimitive(this._preview);
  };
  /**
   * Helper function: _completeRay.
   */
  RayTool.prototype._completeRay = function (secondPoint) {
    var firstPoint = this._points[0];
    if (!firstPoint || !secondPoint || this._sameLogicalPoint(firstPoint, secondPoint)) {
      return;
    }
    var points = [clonePoint(firstPoint), clonePoint(secondPoint)];
    this._removePreview();
    var serialized = buildRayRecord(points, this._style);
    this._completeDrawing(createRayPrimitive(points[0], points[1], serialized, false), null, serialized);
  };
  /**
   * Handles click events on the chart to process point placement for the drawing tool.
   */
  RayTool.prototype._handleClick = function (param) {
    if (!this._drawing) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    if (this._points.length === 0) {
      this._points = [clonePoint(point)];
      this._startPreview(this._points[0]);
      return;
    }
    this._completeRay(point);
  };
  /**
   * Helper function: _handleMove.
   */
  RayTool.prototype._handleMove = function (param) {
    if (!this._drawing || !this._preview || this._points.length !== 1) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    this._preview.updatePoints(this._points[0], point);
  };
  /**
   * Removes the tool and cleans up associated event listeners.
   */
  RayTool.prototype.remove = function () {
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
    kind: 'ray',
    defaultLabel: 'Ray',
    requiredPointCount: 2,
    createTool: function (chart, series, manager) {
      return new RayTool(chart, series, manager);
    },
    createPrimitiveFromRecord: function (record) {
      var points = record.points || [];
      return createRayPrimitive(points[0], points[1], record, false);
    }
  });
`,
};
