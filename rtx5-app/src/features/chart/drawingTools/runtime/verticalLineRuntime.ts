import type { EnhancedDrawingToolRuntime } from '../types';

export const verticalLineEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'verticalLine',
  script: `
  /**
   * Creates an initial pair of points required to form the base shape of the drawing.
   */
  function createVerticalLinePointPair(point) {
    var first = clonePoint(point);
    var second = clonePoint(point);
    second.price = point.price + 1;
    return [first, second];
  }

  /**
   * Builds a serialized record object representing the current state of the drawing tool for persistence.
   */
  function buildVerticalLineRecord(points, style) {
    var now = Date.now();
    var pair = clonePoints(points.slice(0, 2));
    if (pair.length === 1) {
      pair = createVerticalLinePointPair(pair[0]);
    }
    if (pair.length >= 2) {
      pair[1].time = pair[0].time;
    }
    return {
      type: 'verticalLine',
      paneId: 'main',
      points: pair,
      style: Object.assign({}, normalizePriceLineStyle(style, false, '#6366F1')),
      extendMode: 'both',
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
  function createVerticalLinePrimitive(pointA, pointB, record, draft) {
    var pair = buildVerticalLineRecord([pointA, pointB || pointA], record && record.style).points;
    var style = normalizePriceLineStyle(record && record.style, draft, '#6366F1');
    var primitive = createLinePrimitive(pair[0], pair[1], {
      color: style.color,
      selectedColor: style.selectedColor,
      hoverColor: style.hoverColor,
      width: style.width,
      lineStyle: style.lineStyle,
      opacity: style.opacity,
      extendMode: 'both',
      showHandles: !!draft,
      selected: !!(record && record.selected),
      visible: !(record && record.hidden === true) && !(record && record.visible === false),
      draft: !!draft,
      handleFillColor: style.handleFillColor,
      label: '',
      labelBackgroundColor: style.labelBackgroundColor,
      labelTextColor: style.labelTextColor
    });
    primitive.buildEditPoints = function (part, originalPoints, startPoint, editPoint) {
      if (!Array.isArray(originalPoints) || originalPoints.length < 2 || !editPoint) return null;
      var next = clonePoints(originalPoints.slice(0, 2));
      if (part === 'p1') next[0].price = editPoint.price;
      if (part === 'p2') next[1].price = editPoint.price;
      if (part === 'body') {
        var priceDelta = editPoint.price - startPoint.price;
        next.forEach(function (point) {
          point.price += priceDelta;
        });
      }
      next[0].time = editPoint.time;
      next[1].time = editPoint.time;
      return next;
    };
    return primitive;
  }

  /**
   * Constructor function for the drawing tool class, initializing its state and event listeners.
   */
  function VerticalLineTool(chart, series, manager) {
    BaseTool.call(this, 'verticalLine', chart, series, manager);
    this._handleClick = this._handleClick.bind(this);
    this._usesNativeChartInput = !manager.shouldUseDirectTouchInput();
    if (this._usesNativeChartInput) {
      this._chart.subscribeClick(this._handleClick);
    }
  }

  VerticalLineTool.prototype = Object.create(BaseTool.prototype);
  VerticalLineTool.prototype.constructor = VerticalLineTool;
  /**
   * Initiates the drawing process for the tool.
   */
  VerticalLineTool.prototype.startDrawing = function () {
    BaseTool.prototype.startDrawing.call(this);
  };
  /**
   * Handles click events on the chart to process point placement for the drawing tool.
   */
  VerticalLineTool.prototype._handleClick = function (param) {
    if (!this._drawing) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    var points = createVerticalLinePointPair(point);
    var serialized = buildVerticalLineRecord(points, null);
    this._completeDrawing(createVerticalLinePrimitive(points[0], points[1], serialized, false), null, serialized);
  };
  /**
   * Removes the tool and cleans up associated event listeners.
   */
  VerticalLineTool.prototype.remove = function () {
    this.stopDrawing();
    if (this._usesNativeChartInput) {
      this._chart.unsubscribeClick(this._handleClick);
    }
  };

  /**
   * Registers this drawing tool with the global drawing manager so it can be instantiated by the chart.
   */
  registerEnhancedDrawingTool({
    kind: 'verticalLine',
    defaultLabel: 'Vertical Line',
    requiredPointCount: 2,
    createTool: function (chart, series, manager) {
      return new VerticalLineTool(chart, series, manager);
    },
    createPrimitiveFromRecord: function (record) {
      var points = record.points || [];
      return createVerticalLinePrimitive(points[0], points[1], record, false);
    }
  });
`,
};
