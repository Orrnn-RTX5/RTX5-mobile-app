import type { EnhancedDrawingToolRuntime } from '../types';

export const pitchforkEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'pitchfork',
  script: `
  function normalizePitchforkStyle(style) {
    var source = style && typeof style === 'object' ? style : {};
    return {
      color: typeof source.color === 'string' ? source.color : '#8B5CF6',
      width: isFiniteNumber(source.width) ? Math.max(1, Math.min(8, source.width)) : 1.6,
      lineStyle: source.lineStyle === 'dashed' || source.lineStyle === 'dotted' ? source.lineStyle : 'solid',
      opacity: isFiniteNumber(source.opacity) ? Math.max(0.1, Math.min(1, source.opacity)) : 1
    };
  }

  /**
   * Constructor function for the drawing tool class, initializing its state and event listeners.
   */
  function PitchforkTool(chart, series, manager) {
    BaseTool.call(this, 'pitchfork', chart, series, manager);
    this._points = [];
    this._handleClick = this._handleClick.bind(this);
    this._usesNativeChartInput = !manager.shouldUseDirectTouchInput();
    if (this._usesNativeChartInput) {
      this._chart.subscribeClick(this._handleClick);
    }
  }

  PitchforkTool.prototype = Object.create(BaseTool.prototype);
  PitchforkTool.prototype.constructor = PitchforkTool;
  /**
   * Initiates the drawing process for the tool.
   */
  PitchforkTool.prototype.startDrawing = function () {
    BaseTool.prototype.startDrawing.call(this);
    this._points = [];
  };
  /**
   * Terminates the active drawing process and cleans up.
   */
  PitchforkTool.prototype.stopDrawing = function () {
    BaseTool.prototype.stopDrawing.call(this);
    this._points = [];
  };
  /**
   * Handles click events on the chart to process point placement for the drawing tool.
   */
  PitchforkTool.prototype._handleClick = function (param) {
    if (!this._drawing) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    this._points.push(point);
    if (this._points.length >= 3) {
      var points = this._points.slice(0, 3);
      var style = normalizePitchforkStyle(null);
      this._completeDrawing(createPitchforkPrimitive(this._points[0], this._points[1], this._points[2], {
        color: style.color,
        width: style.width,
        lineStyle: style.lineStyle,
        opacity: style.opacity
      }), null, {
        points: clonePoints(points),
        style: Object.assign({}, style)
      });
    }
  };
  /**
   * Removes the tool and cleans up associated event listeners.
   */
  PitchforkTool.prototype.remove = function () {
    this.stopDrawing();
    if (this._usesNativeChartInput) {
      this._chart.unsubscribeClick(this._handleClick);
    }
  };

  /**
   * Registers this drawing tool with the global drawing manager so it can be instantiated by the chart.
   */
  registerEnhancedDrawingTool({
    kind: 'pitchfork',
    defaultLabel: 'Pitchfork',
    requiredPointCount: 3,
    createTool: function (chart, series, manager) {
      return new PitchforkTool(chart, series, manager);
    },
    createPrimitiveFromRecord: function (record) {
      var points = record.points || [];
      var style = normalizePitchforkStyle(record && record.style);
      return createPitchforkPrimitive(points[0], points[1], points[2], {
        color: style.color,
        width: style.width,
        lineStyle: style.lineStyle,
        opacity: style.opacity
      });
    }
  });
`,
};
