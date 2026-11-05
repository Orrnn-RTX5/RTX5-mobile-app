import type { EnhancedDrawingToolRuntime } from '../types';

export const patternPathEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'patterns',
  script: `
  function normalizePatternPathStyle(style) {
    var source = style && typeof style === 'object' ? style : {};
    return {
      color: typeof source.color === 'string' ? source.color : '#A855F7',
      width: isFiniteNumber(source.width) ? Math.max(1, Math.min(8, source.width)) : 1.8,
      lineStyle: source.lineStyle === 'dashed' || source.lineStyle === 'dotted' ? source.lineStyle : 'solid',
      opacity: isFiniteNumber(source.opacity) ? Math.max(0.1, Math.min(1, source.opacity)) : 1,
      labelBackgroundColor: typeof source.labelBackgroundColor === 'string' ? source.labelBackgroundColor : 'rgba(88, 28, 135, 0.92)',
      labelTextColor: typeof source.labelTextColor === 'string' ? source.labelTextColor : '#F3E8FF'
    };
  }

  /**
   * Constructor function for the drawing tool class, initializing its state and event listeners.
   */
  function PatternTool(chart, series, manager) {
    BaseTool.call(this, 'patterns', chart, series, manager);
    this._points = [];
    this._handleClick = this._handleClick.bind(this);
    this._usesNativeChartInput = !manager.shouldUseDirectTouchInput();
    if (this._usesNativeChartInput) {
      this._chart.subscribeClick(this._handleClick);
    }
  }

  PatternTool.prototype = Object.create(BaseTool.prototype);
  PatternTool.prototype.constructor = PatternTool;
  /**
   * Initiates the drawing process for the tool.
   */
  PatternTool.prototype.startDrawing = function () {
    BaseTool.prototype.startDrawing.call(this);
    this._points = [];
  };
  /**
   * Terminates the active drawing process and cleans up.
   */
  PatternTool.prototype.stopDrawing = function () {
    BaseTool.prototype.stopDrawing.call(this);
    this._points = [];
  };
  /**
   * Handles click events on the chart to process point placement for the drawing tool.
   */
  PatternTool.prototype._handleClick = function (param) {
    if (!this._drawing) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    this._points.push(point);
    if (this._points.length >= 3) {
      var points = this._points.slice(0, 3);
      var patternLabel = 'Pattern ' + formatDelta(points[points.length - 1].price - points[0].price);
      var style = normalizePatternPathStyle(null);
      this._completeDrawing(createPolylinePrimitive(points, {
        color: style.color,
        width: style.width,
        lineStyle: style.lineStyle,
        opacity: style.opacity,
        label: patternLabel,
        labelBackgroundColor: style.labelBackgroundColor,
        labelTextColor: style.labelTextColor
      }), patternLabel, {
        points: clonePoints(points),
        style: Object.assign({}, style)
      });
    }
  };
  /**
   * Removes the tool and cleans up associated event listeners.
   */
  PatternTool.prototype.remove = function () {
    this.stopDrawing();
    if (this._usesNativeChartInput) {
      this._chart.unsubscribeClick(this._handleClick);
    }
  };

  /**
   * Registers this drawing tool with the global drawing manager so it can be instantiated by the chart.
   */
  registerEnhancedDrawingTool({
    kind: 'patterns',
    defaultLabel: 'Pattern',
    requiredPointCount: 3,
    createTool: function (chart, series, manager) {
      return new PatternTool(chart, series, manager);
    },
    createPrimitiveFromRecord: function (record) {
      var points = record.points || [];
      var style = normalizePatternPathStyle(record && record.style);
      return createPolylinePrimitive(points, {
        color: style.color,
        width: style.width,
        lineStyle: style.lineStyle,
        opacity: style.opacity,
        label: 'Pattern ' + formatDelta(points[points.length - 1].price - points[0].price),
        labelBackgroundColor: style.labelBackgroundColor,
        labelTextColor: style.labelTextColor
      });
    }
  });
`,
};
