import type { EnhancedDrawingToolRuntime } from '../types';

export const horizontalRayEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'horizontalRay',
  script: `
  function normalizeHorizontalRayStyle(style, draft) {
    var source = style && typeof style === 'object' ? style : {};
    return {
      color: typeof source.color === 'string' ? source.color : '#0EA5E9',
      selectedColor: typeof source.selectedColor === 'string' ? source.selectedColor : '#0284C7',
      hoverColor: typeof source.hoverColor === 'string' ? source.hoverColor : '#38BDF8',
      width: isFiniteNumber(source.width) ? Math.max(1, Math.min(8, source.width)) : 2,
      lineStyle: draft ? 'dashed' : (source.lineStyle === 'dashed' || source.lineStyle === 'dotted' ? source.lineStyle : 'solid'),
      opacity: isFiniteNumber(source.opacity) ? Math.max(0.1, Math.min(1, source.opacity)) : (draft ? 0.72 : 1),
      handleFillColor: typeof source.handleFillColor === 'string' ? source.handleFillColor : '#FFFFFF',
      labelBackgroundColor: typeof source.labelBackgroundColor === 'string' ? source.labelBackgroundColor : 'rgba(15, 23, 42, 0.92)',
      labelTextColor: typeof source.labelTextColor === 'string' ? source.labelTextColor : '#FFFFFF'
    };
  }

  function createHorizontalRayPointPair(point) {
    var first = clonePoint(point);
    var second = clonePoint(point);
    if (isFiniteNumber(second.time)) second.time += 1;
    if (isFiniteNumber(second.timestamp)) second.timestamp += 1;
    if (isFiniteNumber(second.dataIndex)) second.dataIndex += 1;
    second.price = first.price;
    return [first, second];
  }

  function buildHorizontalRayRecord(points, style) {
    var now = Date.now();
    var pair = clonePoints(points.slice(0, 2));
    if (pair.length === 1) {
      pair = createHorizontalRayPointPair(pair[0]);
    }
    if (pair.length >= 2) {
      pair[1].price = pair[0].price;
      if (isFiniteNumber(pair[0].time) && isFiniteNumber(pair[1].time) && pair[1].time <= pair[0].time) {
        pair[1].time = pair[0].time + 1;
      }
      if (isFiniteNumber(pair[0].timestamp) && isFiniteNumber(pair[1].timestamp) && pair[1].timestamp <= pair[0].timestamp) {
        pair[1].timestamp = pair[0].timestamp + 1;
      }
    }
    return {
      type: 'horizontalRay',
      paneId: 'main',
      points: pair,
      style: Object.assign({}, normalizeHorizontalRayStyle(style, false)),
      extendMode: 'right',
      locked: false,
      visible: true,
      selected: false,
      createdAt: now,
      updatedAt: now
    };
  }

  function createHorizontalRayPrimitive(pointA, pointB, record, draft) {
    var pair = buildHorizontalRayRecord([pointA, pointB || pointA], record && record.style).points;
    var style = normalizeHorizontalRayStyle(record && record.style, draft);
    var primitive = createLinePrimitive(pair[0], pair[1], {
      color: style.color,
      selectedColor: style.selectedColor,
      hoverColor: style.hoverColor,
      width: style.width,
      lineStyle: style.lineStyle,
      opacity: style.opacity,
      extendMode: 'right',
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
      if (part === 'body') {
        var timeDelta = isFiniteNumber(editPoint.time) && isFiniteNumber(startPoint.time) ? editPoint.time - startPoint.time : 0;
        next.forEach(function (point) {
          if (isFiniteNumber(point.time)) point.time += timeDelta;
          if (isFiniteNumber(point.timestamp)) point.timestamp += timeDelta;
        });
      } else if (part === 'p1') {
        next[0].time = editPoint.time;
        next[0].timestamp = editPoint.timestamp;
      } else if (part === 'p2') {
        next[1].time = editPoint.time;
        next[1].timestamp = editPoint.timestamp;
      }
      next[0].price = editPoint.price;
      next[1].price = editPoint.price;
      if (isFiniteNumber(next[0].time) && isFiniteNumber(next[1].time) && next[1].time <= next[0].time) {
        next[1].time = next[0].time + 1;
      }
      return next;
    };
    return primitive;
  }

  function HorizontalRayTool(chart, series, manager) {
    BaseTool.call(this, 'horizontalRay', chart, series, manager);
    this._style = normalizeHorizontalRayStyle(null, false);
    this._handleClick = this._handleClick.bind(this);
    this._usesNativeChartInput = !manager.shouldUseDirectTouchInput();
    if (this._usesNativeChartInput) {
      this._chart.subscribeClick(this._handleClick);
    }
  }

  HorizontalRayTool.prototype = Object.create(BaseTool.prototype);
  HorizontalRayTool.prototype.constructor = HorizontalRayTool;
  HorizontalRayTool.prototype.startDrawing = function () {
    BaseTool.prototype.startDrawing.call(this);
  };
  HorizontalRayTool.prototype._handleClick = function (param) {
    if (!this._drawing) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    var points = createHorizontalRayPointPair(point);
    var serialized = buildHorizontalRayRecord(points, this._style);
    this._completeDrawing(createHorizontalRayPrimitive(points[0], points[1], serialized, false), null, serialized);
  };
  HorizontalRayTool.prototype.remove = function () {
    this.stopDrawing();
    if (this._usesNativeChartInput) {
      this._chart.unsubscribeClick(this._handleClick);
    }
  };

  registerEnhancedDrawingTool({
    kind: 'horizontalRay',
    defaultLabel: 'Horizontal Ray',
    requiredPointCount: 2,
    createTool: function (chart, series, manager) {
      return new HorizontalRayTool(chart, series, manager);
    },
    createPrimitiveFromRecord: function (record) {
      var points = record.points || [];
      return createHorizontalRayPrimitive(points[0], points[1], record, false);
    }
  });
`,
};
