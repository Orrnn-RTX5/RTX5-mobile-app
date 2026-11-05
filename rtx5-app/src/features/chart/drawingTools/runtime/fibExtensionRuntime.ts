import type { EnhancedDrawingToolRuntime } from '../types';

export const fibExtensionEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'fibExtension',
  script: `
  /**
   * Helper function: createDefaultFibExtensionLevels.
   */
  function createDefaultFibExtensionLevels() {
    var values = [
      [0, '0', '0%'],
      [0.618, '0.618', '61.8%'],
      [1, '1', '100%'],
      [1.272, '1.272', '127.2%'],
      [1.414, '1.414', '141.4%'],
      [1.618, '1.618', '161.8%'],
      [2, '2', '200%'],
      [2.618, '2.618', '261.8%']
    ];
    return values.map(function (entry) {
      var value = entry[0];
      var isMajor = value === 0 || value === 1 || value === 1.618 || value === 2.618;
      return {
        id: 'fib_ext_' + String(value).replace('-', 'neg_').replace('.', '_'),
        value: value,
        visible: true,
        label: entry[1],
        color: isMajor ? '#F59E0B' : '#64748B',
        lineColor: isMajor ? '#F59E0B' : '#64748B',
        lineWidth: isMajor ? 1.4 : 1,
        lineStyle: 'solid',
        fillColor: value > 1 ? 'rgba(245, 158, 11, 0.08)' : 'rgba(100, 116, 139, 0.05)',
        fillOpacity: 0.1,
        showPrice: true,
        showPercent: true
      };
    });
  }

  /**
   * Builds a serialized record object representing the current state of the drawing tool for persistence.
   */
  function buildFibExtensionRecord(points, style, levels, extendMode) {
    var now = Date.now();
    return {
      type: 'fibExtension',
      paneId: 'main',
      points: clonePoints(points.slice(0, 2)),
      levels: normalizeFibLevels(levels && levels.length ? levels : createDefaultFibExtensionLevels()),
      style: normalizeFibStyle(style, false),
      extendMode: normalizeFibExtendMode(extendMode || 'right'),
      reverse: false,
      locked: false,
      visible: true,
      selected: false,
      goldenPocket: { enabled: false, from: 0.618, to: 0.65 },
      oteZone: { enabled: false, from: 0.62, to: 0.79 },
      createdAt: now,
      updatedAt: now
    };
  }

  /**
   * Creates the visual primitive object that gets rendered on the chart canvas.
   */
  function createFibExtensionPrimitive(pointA, pointB, record, draft) {
    var normalized = buildFibExtensionRecord(
      [pointA, pointB],
      record && record.style,
      record && Array.isArray(record.levels) ? record.levels : createDefaultFibExtensionLevels(),
      record && record.extendMode
    );
    normalized.visible = !(record && record.hidden === true) && !(record && record.visible === false);
    normalized.selected = !!(record && record.selected);
    return createFibZonePrimitive(pointA, pointB, normalized, draft);
  }

  /**
   * Constructor function for the drawing tool class, initializing its state and event listeners.
   */
  function FibExtensionTool(chart, series, manager) {
    BaseTool.call(this, 'fibExtension', chart, series, manager);
    this._points = [];
    this._preview = null;
    this._style = normalizeFibStyle(null, false);
    this._levels = createDefaultFibExtensionLevels();
    this._extendMode = 'right';
    this._handleClick = this._handleClick.bind(this);
    this._handleMove = this._handleMove.bind(this);
    this._usesNativeChartInput = !manager.shouldUseDirectTouchInput();
    if (this._usesNativeChartInput) {
      this._chart.subscribeClick(this._handleClick);
      this._chart.subscribeCrosshairMove(this._handleMove);
    }
  }

  FibExtensionTool.prototype = Object.create(BaseTool.prototype);
  FibExtensionTool.prototype.constructor = FibExtensionTool;
  /**
   * Initiates the drawing process for the tool.
   */
  FibExtensionTool.prototype.startDrawing = function () {
    BaseTool.prototype.startDrawing.call(this);
    this._resetDrawingSession();
  };
  /**
   * Helper function: _resetDrawingSession.
   */
  FibExtensionTool.prototype._resetDrawingSession = function () {
    this._points = [];
    this._removePreview();
  };
  /**
   * Terminates the active drawing process and cleans up.
   */
  FibExtensionTool.prototype.stopDrawing = function () {
    BaseTool.prototype.stopDrawing.call(this);
    this._resetDrawingSession();
  };
  /**
   * Removes the tool and cleans up associated event listeners.
   */
  FibExtensionTool.prototype._removePreview = function () {
    if (this._preview) {
      try { this._series.detachPrimitive(this._preview); } catch (_error) {}
      this._preview = null;
    }
  };
  /**
   * Helper function: _sameLogicalPoint.
   */
  FibExtensionTool.prototype._sameLogicalPoint = function (pointA, pointB) {
    return pointA && pointB && pointA.time === pointB.time && pointA.price === pointB.price;
  };
  /**
   * Helper function: _startPreview.
   */
  FibExtensionTool.prototype._startPreview = function (point) {
    var serialized = buildFibExtensionRecord([point, point], this._style, this._levels, this._extendMode);
    this._preview = createFibExtensionPrimitive(point, point, Object.assign({}, serialized, { selected: true }), true);
    this._series.attachPrimitive(this._preview);
  };
  /**
   * Helper function: _completeFibExtension.
   */
  FibExtensionTool.prototype._completeFibExtension = function (secondPoint) {
    var firstPoint = this._points[0];
    if (!firstPoint || !secondPoint || this._sameLogicalPoint(firstPoint, secondPoint)) {
      return;
    }
    var points = [clonePoint(firstPoint), clonePoint(secondPoint)];
    this._removePreview();
    var serialized = buildFibExtensionRecord(points, this._style, this._levels, this._extendMode);
    this._completeDrawing(createFibExtensionPrimitive(points[0], points[1], serialized, false), null, serialized);
  };
  /**
   * Handles click events on the chart to process point placement for the drawing tool.
   */
  FibExtensionTool.prototype._handleClick = function (param) {
    if (!this._drawing) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    if (this._points.length === 0) {
      this._points = [clonePoint(point)];
      this._startPreview(this._points[0]);
      return;
    }
    this._completeFibExtension(point);
  };
  /**
   * Helper function: _handleMove.
   */
  FibExtensionTool.prototype._handleMove = function (param) {
    if (!this._drawing || !this._preview || this._points.length !== 1) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    this._preview.updatePoints(this._points[0], point);
  };
  /**
   * Removes the tool and cleans up associated event listeners.
   */
  FibExtensionTool.prototype.remove = function () {
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
    kind: 'fibExtension',
    defaultLabel: 'Fibonacci Extension',
    requiredPointCount: 2,
    createTool: function (chart, series, manager) {
      return new FibExtensionTool(chart, series, manager);
    },
    createPrimitiveFromRecord: function (record) {
      var points = record.points || [];
      return createFibExtensionPrimitive(points[0], points[1], record, false);
    }
  });
`,
};
