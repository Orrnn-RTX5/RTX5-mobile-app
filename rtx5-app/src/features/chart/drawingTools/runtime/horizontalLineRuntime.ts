import type { EnhancedDrawingToolRuntime } from '../types';

export const horizontalLineEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'horizontalLine',
  script: `
  /**
   * Normalizes the style configuration for the drawing tool, providing defaults for missing values.
   */
  function normalizePriceLineStyle(style, draft, fallbackColor) {
    var source = style && typeof style === 'object' ? style : {};
    return {
      color: typeof source.color === 'string' ? source.color : fallbackColor,
      selectedColor: typeof source.selectedColor === 'string' ? source.selectedColor : '#0F766E',
      hoverColor: typeof source.hoverColor === 'string' ? source.hoverColor : '#14B8A6',
      width: isFiniteNumber(source.width) ? Math.max(1, Math.min(8, source.width)) : 1.8,
      lineStyle: draft ? 'dashed' : (source.lineStyle === 'dashed' || source.lineStyle === 'dotted' ? source.lineStyle : 'solid'),
      opacity: isFiniteNumber(source.opacity) ? Math.max(0.1, Math.min(1, source.opacity)) : (draft ? 0.72 : 1),
      handleFillColor: typeof source.handleFillColor === 'string' ? source.handleFillColor : '#FFFFFF',
      labelBackgroundColor: typeof source.labelBackgroundColor === 'string' ? source.labelBackgroundColor : 'rgba(15, 23, 42, 0.92)',
      labelTextColor: typeof source.labelTextColor === 'string' ? source.labelTextColor : '#FFFFFF'
    };
  }

  /**
   * Calculates and returns a new point offset from the given point by time and price steps.
   */
  function offsetPriceLinePoint(point, timeStep, priceStep) {
    var next = clonePoint(point);
    if (isFiniteNumber(next.time)) next.time += timeStep;
    if (isFiniteNumber(next.timestamp)) next.timestamp += timeStep;
    if (isFiniteNumber(next.dataIndex)) next.dataIndex += timeStep >= 0 ? 1 : -1;
    next.price += priceStep;
    return next;
  }

  /**
   * Creates an initial pair of points required to form the base shape of the drawing.
   */
  function createHorizontalLinePointPair(point) {
    var first = clonePoint(point);
    var second = offsetPriceLinePoint(point, 1, 0);
    second.price = first.price;
    return [first, second];
  }

  /**
   * Builds a serialized record object representing the current state of the drawing tool for persistence.
   */
  function buildHorizontalLineRecord(points, style) {
    var now = Date.now();
    var pair = clonePoints(points.slice(0, 2));
    if (pair.length === 1) {
      pair = createHorizontalLinePointPair(pair[0]);
    }
    if (pair.length >= 2) {
      pair[1].price = pair[0].price;
    }
    return {
      type: 'horizontalLine',
      paneId: 'main',
      points: pair,
      style: Object.assign({}, normalizePriceLineStyle(style, false, '#14B8A6')),
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
  function createHorizontalLinePrimitive(pointA, pointB, record, draft) {
    var pair = buildHorizontalLineRecord([pointA, pointB || pointA], record && record.style, false).points;
    var style = normalizePriceLineStyle(record && record.style, draft, '#14B8A6');
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
      label: draft ? '' : String(pair[0].price),
      labelIsPrice: !draft,
      labelBackgroundColor: style.labelBackgroundColor,
      labelTextColor: style.labelTextColor
    });
    primitive.buildEditPoints = function (part, originalPoints, startPoint, editPoint) {
      if (!Array.isArray(originalPoints) || originalPoints.length < 2 || !editPoint) return null;
      var next = clonePoints(originalPoints.slice(0, 2));
      if (part === 'p1') next[0].time = editPoint.time;
      if (part === 'p2') next[1].time = editPoint.time;
      if (part === 'body') {
        var timeDelta = isFiniteNumber(editPoint.time) && isFiniteNumber(startPoint.time) ? editPoint.time - startPoint.time : 0;
        next.forEach(function (point) {
          if (isFiniteNumber(point.time)) point.time += timeDelta;
          if (isFiniteNumber(point.timestamp)) point.timestamp += timeDelta;
        });
      }
      next[0].price = editPoint.price;
      next[1].price = editPoint.price;
      return next;
    };
    return primitive;
  }

  /**
   * Constructor function for the drawing tool class, initializing its state and event listeners.
   */
  function HorizontalLineTool(chart, series, manager) {
    BaseTool.call(this, 'horizontalLine', chart, series, manager);
    this._handleClick = this._handleClick.bind(this);
    this._usesNativeChartInput = !manager.shouldUseDirectTouchInput();
    if (this._usesNativeChartInput) {
      this._chart.subscribeClick(this._handleClick);
    }
  }

  HorizontalLineTool.prototype = Object.create(BaseTool.prototype);
  HorizontalLineTool.prototype.constructor = HorizontalLineTool;
  /**
   * Initiates the drawing process for the tool.
   */
  HorizontalLineTool.prototype.startDrawing = function () {
    BaseTool.prototype.startDrawing.call(this);
  };
  /**
   * Handles click events on the chart to process point placement for the drawing tool.
   */
  HorizontalLineTool.prototype._handleClick = function (param) {
    if (!this._drawing) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    var points = createHorizontalLinePointPair(point);
    var serialized = buildHorizontalLineRecord(points, null);
    this._completeDrawing(createHorizontalLinePrimitive(points[0], points[1], serialized, false), null, serialized);
  };
  /**
   * Removes the tool and cleans up associated event listeners.
   */
  HorizontalLineTool.prototype.remove = function () {
    this.stopDrawing();
    if (this._usesNativeChartInput) {
      this._chart.unsubscribeClick(this._handleClick);
    }
  };

  /**
   * Registers this drawing tool with the global drawing manager so it can be instantiated by the chart.
   */
  registerEnhancedDrawingTool({
    kind: 'horizontalLine',
    defaultLabel: 'Horizontal Line',
    requiredPointCount: 2,
    createTool: function (chart, series, manager) {
      return new HorizontalLineTool(chart, series, manager);
    },
    createPrimitiveFromRecord: function (record) {
      var points = record.points || [];
      return createHorizontalLinePrimitive(points[0], points[1], record, false);
    }
  });
`,
};
