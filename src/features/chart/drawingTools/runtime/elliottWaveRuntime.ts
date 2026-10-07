import type { EnhancedDrawingToolRuntime } from '../types';

export const elliottWaveEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'elliottWave',
  script: `
  /**
   * Wave pivot labels for a five-wave Elliott impulse sequence. Index 0 is the
   * swing origin (unlabelled); pivots 1-5 carry the wave degree number.
   */
  var ELLIOTT_WAVE_LABELS = ['', '1', '2', '3', '4', '5'];

  /**
   * Resolves the per-pivot label list from a record's persisted wave entries,
   * falling back to the default impulse numbering for missing entries.
   */
  function normalizeElliottWaveLabels(waves) {
    var labels = ELLIOTT_WAVE_LABELS.slice();
    if (!Array.isArray(waves)) return labels;
    for (var i = 0; i < labels.length; i += 1) {
      var wave = waves[i];
      if (!wave || typeof wave !== 'object') continue;
      if (wave.visible === false) {
        labels[i] = '';
      } else if (typeof wave.label === 'string') {
        labels[i] = wave.label;
      }
    }
    return labels;
  }

  /**
   * Normalizes the style configuration for the Elliott Wave, providing defaults for missing values.
   */
  function normalizeElliottWaveStyle(style, draft) {
    var source = style && typeof style === 'object' ? style : {};
    return {
      color: typeof source.color === 'string' ? source.color : '#6366F1',
      selectedColor: typeof source.selectedColor === 'string' ? source.selectedColor : '#4338CA',
      hoverColor: typeof source.hoverColor === 'string' ? source.hoverColor : '#818CF8',
      width: isFiniteNumber(source.width) ? Math.max(1, Math.min(6, source.width)) : 1.8,
      lineStyle: source.lineStyle === 'dashed' || source.lineStyle === 'dotted' ? source.lineStyle : 'solid',
      opacity: isFiniteNumber(source.opacity) ? Math.max(0.1, Math.min(1, source.opacity)) : 1,
      labelBackgroundColor: typeof source.labelBackgroundColor === 'string' ? source.labelBackgroundColor : 'rgba(49, 46, 129, 0.92)',
      labelTextColor: typeof source.labelTextColor === 'string' ? source.labelTextColor : '#EEF2FF',
      handleFillColor: typeof source.handleFillColor === 'string' ? source.handleFillColor : '#FFFFFF',
      handleRadius: isFiniteNumber(source.handleRadius) ? Math.max(3, Math.min(8, source.handleRadius)) : 4,
      selectedHandleRadius: isFiniteNumber(source.selectedHandleRadius) ? Math.max(4, Math.min(10, source.selectedHandleRadius)) : 5,
      showHandles: source.showHandles === false ? false : true
    };
  }

  /**
   * Helper function: elliottWaveDashPattern.
   */
  function elliottWaveDashPattern(style, ratio) {
    var px = Math.max(1, ratio || 1);
    if (style === 'dashed') return [8 * px, 5 * px];
    if (style === 'dotted') return [2 * px, 5 * px];
    return [];
  }

  /**
   * Helper function: distanceToElliottPoint.
   */
  function distanceToElliottPoint(a, b) {
    if (!a || !b || !isFiniteNumber(a.x) || !isFiniteNumber(a.y) || !isFiniteNumber(b.x) || !isFiniteNumber(b.y)) {
      return Number.POSITIVE_INFINITY;
    }
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt((dx * dx) + (dy * dy));
  }

  /**
   * Helper function: distanceToElliottSegment.
   */
  function distanceToElliottSegment(point, a, b) {
    if (!point || !a || !b) return Number.POSITIVE_INFINITY;
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var lengthSquared = (dx * dx) + (dy * dy);
    if (lengthSquared <= 0.0001) return distanceToElliottPoint(point, a);
    var t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
    return distanceToElliottPoint(point, { x: a.x + (dx * t), y: a.y + (dy * t) });
  }

  /**
   * Creates the visual primitive object that gets rendered on the chart canvas.
   */
  function createElliottWavePrimitive(pointList, record, draft) {
  /**
   * Helper function: ElliottWavePaneRenderer.
   */
    function ElliottWavePaneRenderer(source, coords) {
      this._source = source;
      this._coords = coords;
    }

  /**
   * Helper function: draw.
   */
    ElliottWavePaneRenderer.prototype.draw = function (target) {
      var source = this._source;
      var allCoords = this._coords;
      var coords = allCoords.filter(function (item) {
        return item && isFiniteNumber(item.x) && isFiniteNumber(item.y);
      });
      if (!source._options.visible || coords.length < 2) return;
      target.useBitmapCoordinateSpace(function (scope) {
        var ctx = scope.context;
        var ratioX = scope.horizontalPixelRatio || 1;
        var ratioY = scope.verticalPixelRatio || 1;
        var lineColor = source._options.selected
          ? source._options.style.selectedColor
          : (source._options.hovered ? source._options.style.hoverColor : source._options.style.color);

        ctx.save();
        ctx.globalAlpha = source._options.style.opacity;
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = Math.max(1, source._options.style.width * ratioX);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (ctx.setLineDash) ctx.setLineDash(elliottWaveDashPattern(source._options.style.lineStyle, ratioX));
        ctx.beginPath();
        coords.forEach(function (coord, index) {
          var x = coord.x * ratioX;
          var y = coord.y * ratioY;
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        if (ctx.setLineDash) ctx.setLineDash([]);
        ctx.globalAlpha = 1;

        ctx.fillStyle = lineColor;
        coords.forEach(function (coord) {
          ctx.beginPath();
          ctx.arc(coord.x * ratioX, coord.y * ratioY, 2.8 * ratioX, 0, Math.PI * 2);
          ctx.fill();
        });

        if (shouldRenderObjectDescriptions(source)) {
          var fontSize = Math.round(12 * ratioX);
          ctx.font = '700 ' + fontSize + 'px Arial';
          allCoords.forEach(function (coord, index) {
            if (!coord || !isFiniteNumber(coord.x) || !isFiniteNumber(coord.y)) return;
            var label = source._options.waveLabels[index] || '';
            if (!label) return;
            var previous = allCoords[index - 1];
            var goingUp = index > 0 && previous && isFiniteNumber(previous.y)
              ? coord.y <= previous.y
              : true;
            var textWidth = ctx.measureText(label).width;
            var padding = 5 * ratioX;
            var boxWidth = textWidth + padding * 2;
            var boxHeight = fontSize + padding * 1.4;
            var cx = coord.x * ratioX;
            var cy = coord.y * ratioY + (goingUp ? -(boxHeight + 6 * ratioY) : (6 * ratioY));
            roundRectPath(ctx, cx - boxWidth / 2, cy, boxWidth, boxHeight, 5 * ratioX);
            ctx.fillStyle = source._options.style.labelBackgroundColor;
            ctx.fill();
            ctx.fillStyle = source._options.style.labelTextColor;
            ctx.fillText(label, cx - textWidth / 2, cy + boxHeight - padding * 0.9);
          });
        }

        if (source._options.selected || source._options.draft || source._options.style.showHandles) {
          var radius = (source._options.selected ? source._options.style.selectedHandleRadius : source._options.style.handleRadius) * ratioX;
          ctx.fillStyle = source._options.style.handleFillColor;
          ctx.strokeStyle = lineColor;
          ctx.lineWidth = Math.max(1, 1.5 * ratioX);
          coords.forEach(function (coord) {
            ctx.beginPath();
            ctx.arc(coord.x * ratioX, coord.y * ratioY, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          });
        }
        ctx.restore();
      });
    };

  /**
   * Helper function: ElliottWavePaneView.
   */
    function ElliottWavePaneView(source) {
      this._source = source;
      this._coords = [];
    }

  /**
   * Helper function: update.
   */
    ElliottWavePaneView.prototype.update = function () {
      var series = this._source.series;
      var chart = this._source.chart;
      this._coords = this._source._points.map(function (point) {
        return {
          x: resolveCoordinateFromTime(chart, series, point.time),
          y: series.priceToCoordinate(point.price)
        };
      });
      this._source._coords = this._coords;
    };

  /**
   * Helper function: renderer.
   */
    ElliottWavePaneView.prototype.renderer = function () {
      return new ElliottWavePaneRenderer(this._source, this._coords);
    };

  /**
   * Helper function: ElliottWavePrimitive.
   */
    function ElliottWavePrimitive(points, opts) {
      PrimitiveBase.call(this);
      this._points = clonePoints(points);
      var source = opts && typeof opts === 'object' ? opts : {};
      this._options = {
        draft: !!draft,
        hovered: !!source.hovered,
        selected: !!source.selected,
        visible: source.visible === false || source.hidden === true ? false : true,
        style: normalizeElliottWaveStyle(source.style, draft),
        waveLabels: normalizeElliottWaveLabels(source.waves)
      };
      this._coords = [];
      this._paneViews = [new ElliottWavePaneView(this)];
    }

    ElliottWavePrimitive.prototype = Object.create(PrimitiveBase.prototype);
    ElliottWavePrimitive.prototype.constructor = ElliottWavePrimitive;
    ElliottWavePrimitive.prototype.updateAllViews = function () {
      this._paneViews.forEach(function (view) { view.update(); });
    };
    ElliottWavePrimitive.prototype.paneViews = function () {
      return this._paneViews;
    };
    ElliottWavePrimitive.prototype.setVisible = function (visible) {
      this._options.visible = !!visible;
      this.requestUpdate();
    };
    ElliottWavePrimitive.prototype.setSelected = function (selected) {
      this._options.selected = !!selected;
      this.requestUpdate();
    };
    ElliottWavePrimitive.prototype.setHovered = function (hovered) {
      this._options.hovered = !!hovered;
      this.requestUpdate();
    };
    ElliottWavePrimitive.prototype.setPoints = function (points) {
      this._points = clonePoints(points);
      this.requestUpdate();
    };
    ElliottWavePrimitive.prototype.updatePoints = function () {
      var args = Array.prototype.slice.call(arguments);
      if (args.length === 1 && Array.isArray(args[0])) {
        this._points = clonePoints(args[0]);
      } else if (args.length > 0) {
        this._points = clonePoints(args);
      }
      this.requestUpdate();
    };
    ElliottWavePrimitive.prototype.getPoints = function () {
      return clonePoints(this._points);
    };
    ElliottWavePrimitive.prototype.getGeometry = function () {
      this.updateAllViews();
      return { coords: this._coords.slice() };
    };
    ElliottWavePrimitive.prototype.hitTest = function (point, context) {
      this.updateAllViews();
      var coords = this._coords;
      if (!Array.isArray(coords) || coords.length < 2) return null;
      var isTouch = context && context.isTouch;
      var handleThreshold = isTouch ? 20 : 10;
      var lineThreshold = isTouch ? 14 : 8;
      for (var i = 0; i < coords.length; i += 1) {
        if (distanceToElliottPoint(point, coords[i]) <= handleThreshold) return { part: 'p' + (i + 1) };
      }
      for (var j = 1; j < coords.length; j += 1) {
        if (distanceToElliottSegment(point, coords[j - 1], coords[j]) <= lineThreshold) return { part: 'body' };
      }
      return null;
    };
    ElliottWavePrimitive.prototype.buildEditPoints = function (part, originalPoints, startPoint, editPoint) {
      if (!Array.isArray(originalPoints) || !editPoint) return null;
      var match = typeof part === 'string' ? part.match(/^p(\\d+)$/) : null;
      if (!match) return null;
      var targetIndex = parseInt(match[1], 10) - 1;
      if (targetIndex < 0 || targetIndex >= originalPoints.length) return null;
      var next = clonePoints(originalPoints);
      next[targetIndex] = clonePoint(editPoint);
      return next;
    };
    return new ElliottWavePrimitive(pointList, record);
  }

  /**
   * Builds a serialized record object representing the current state of the drawing tool for persistence.
   */
  function buildElliottWaveRecord(points, style) {
    var now = Date.now();
    return {
      type: 'elliottWave',
      paneId: 'main',
      points: clonePoints(points),
      style: normalizeElliottWaveStyle(style, false),
      locked: false,
      visible: true,
      selected: false,
      createdAt: now,
      updatedAt: now
    };
  }

  /**
   * Constructor function for the drawing tool class, initializing its state and event listeners.
   */
  function ElliottWaveTool(chart, series, manager) {
    BaseTool.call(this, 'elliottWave', chart, series, manager);
    this._points = [];
    this._preview = null;
    this._style = normalizeElliottWaveStyle(null, false);
    this._requiredPoints = 6;
    this._handleClick = this._handleClick.bind(this);
    this._usesNativeChartInput = !manager.shouldUseDirectTouchInput();
    if (this._usesNativeChartInput) {
      this._chart.subscribeClick(this._handleClick);
    }
  }

  ElliottWaveTool.prototype = Object.create(BaseTool.prototype);
  ElliottWaveTool.prototype.constructor = ElliottWaveTool;
  ElliottWaveTool.prototype.startDrawing = function () {
    BaseTool.prototype.startDrawing.call(this);
    this._resetDrawingSession();
  };
  ElliottWaveTool.prototype._resetDrawingSession = function () {
    this._points = [];
    this._removePreview();
  };
  ElliottWaveTool.prototype.stopDrawing = function () {
    BaseTool.prototype.stopDrawing.call(this);
    this._resetDrawingSession();
  };
  ElliottWaveTool.prototype._removePreview = function () {
    if (this._preview) {
      try { this._series.detachPrimitive(this._preview); } catch (_error) {}
      this._preview = null;
    }
  };
  ElliottWaveTool.prototype._syncPreview = function () {
    if (this._points.length < 1) {
      this._removePreview();
      return;
    }
    if (!this._preview) {
      this._preview = createElliottWavePrimitive(this._points, { style: this._style, selected: true }, true);
      this._series.attachPrimitive(this._preview);
      return;
    }
    this._preview.setPoints(this._points);
  };
  ElliottWaveTool.prototype._handleClick = function (param) {
    if (!this._drawing) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    this._points.push(clonePoint(point));
    if (this._points.length >= this._requiredPoints) {
      var points = clonePoints(this._points.slice(0, this._requiredPoints));
      this._removePreview();
      var serialized = buildElliottWaveRecord(points, this._style);
      this._completeDrawing(createElliottWavePrimitive(points, serialized, false), null, serialized);
      return;
    }
    this._syncPreview();
  };
  ElliottWaveTool.prototype.remove = function () {
    this.stopDrawing();
    if (this._usesNativeChartInput) {
      this._chart.unsubscribeClick(this._handleClick);
    }
  };

  /**
   * Registers this drawing tool with the global drawing manager so it can be instantiated by the chart.
   */
  registerEnhancedDrawingTool({
    kind: 'elliottWave',
    defaultLabel: 'Elliott Wave',
    requiredPointCount: 6,
    createTool: function (chart, series, manager) {
      return new ElliottWaveTool(chart, series, manager);
    },
    createPrimitiveFromRecord: function (record) {
      var points = record.points || [];
      return createElliottWavePrimitive(points, record, false);
    }
  });
`,
};
