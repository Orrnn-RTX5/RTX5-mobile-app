import type { EnhancedDrawingToolRuntime } from '../types';

export const xabcdEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'xabcd',
  script: `
  var XABCD_VERTEX_LABELS = ['X', 'A', 'B', 'C', 'D'];

  /**
   * Absolute distance a measured leg ratio may deviate from its target while
   * still counting as a harmonic match for the label highlight.
   */
  var XABCD_RATIO_TOLERANCE = 0.05;

  /**
   * Resolves the per-leg ratio config (target + visibility) from a record's
   * persisted ratio entries. Index order: AB/XA, BC/AB, CD/BC.
   */
  function normalizeXabcdRatios(ratios) {
    var normalized = [
      { target: null, visible: true },
      { target: null, visible: true },
      { target: null, visible: true }
    ];
    if (!Array.isArray(ratios)) return normalized;
    for (var i = 0; i < normalized.length; i += 1) {
      var entry = ratios[i];
      if (!entry || typeof entry !== 'object') continue;
      if (entry.visible === false) normalized[i].visible = false;
      if (isFiniteNumber(entry.target) && entry.target > 0) normalized[i].target = entry.target;
    }
    return normalized;
  }

  /**
   * Normalizes the style configuration for the XABCD Harmonic pattern.
   */
  function normalizeXabcdStyle(style, draft) {
    var source = style && typeof style === 'object' ? style : {};
    return {
      color: typeof source.color === 'string' ? source.color : '#DB2777',
      selectedColor: typeof source.selectedColor === 'string' ? source.selectedColor : '#BE185D',
      hoverColor: typeof source.hoverColor === 'string' ? source.hoverColor : '#F472B6',
      width: isFiniteNumber(source.width) ? Math.max(1, Math.min(6, source.width)) : 1.8,
      lineStyle: source.lineStyle === 'dashed' || source.lineStyle === 'dotted' ? source.lineStyle : 'solid',
      opacity: isFiniteNumber(source.opacity) ? Math.max(0.1, Math.min(1, source.opacity)) : 1,
      strutColor: typeof source.strutColor === 'string' ? source.strutColor : '#DB2777',
      fillColor: typeof source.fillColor === 'string' ? source.fillColor : 'rgba(219, 39, 119, 0.10)',
      fillOpacity: isFiniteNumber(source.fillOpacity) ? Math.max(0, Math.min(0.45, source.fillOpacity)) : 0.12,
      showFill: source.showFill === false ? false : true,
      showRatios: source.showRatios === false ? false : true,
      labelBackgroundColor: typeof source.labelBackgroundColor === 'string' ? source.labelBackgroundColor : 'rgba(131, 24, 67, 0.92)',
      labelTextColor: typeof source.labelTextColor === 'string' ? source.labelTextColor : '#FCE7F3',
      ratioBackgroundColor: typeof source.ratioBackgroundColor === 'string' ? source.ratioBackgroundColor : 'rgba(17, 24, 39, 0.88)',
      ratioMatchBackgroundColor: typeof source.ratioMatchBackgroundColor === 'string' ? source.ratioMatchBackgroundColor : 'rgba(6, 95, 70, 0.92)',
      ratioTextColor: typeof source.ratioTextColor === 'string' ? source.ratioTextColor : '#F9A8D4',
      handleFillColor: typeof source.handleFillColor === 'string' ? source.handleFillColor : '#FFFFFF',
      handleRadius: isFiniteNumber(source.handleRadius) ? Math.max(3, Math.min(8, source.handleRadius)) : 4,
      selectedHandleRadius: isFiniteNumber(source.selectedHandleRadius) ? Math.max(4, Math.min(10, source.selectedHandleRadius)) : 5,
      showHandles: source.showHandles === false ? false : true
    };
  }

  /**
   * Helper function: xabcdDashPattern.
   */
  function xabcdDashPattern(style, ratio) {
    var px = Math.max(1, ratio || 1);
    if (style === 'dashed') return [8 * px, 5 * px];
    if (style === 'dotted') return [2 * px, 5 * px];
    return [];
  }

  /**
   * Retracement ratio between two consecutive price legs, e.g. |B-A| / |A-X|.
   */
  function xabcdRetracement(fromPrice, pivotPrice, toPrice) {
    if (!isFiniteNumber(fromPrice) || !isFiniteNumber(pivotPrice) || !isFiniteNumber(toPrice)) return null;
    var legOne = Math.abs(pivotPrice - fromPrice);
    var legTwo = Math.abs(toPrice - pivotPrice);
    if (legOne < 0.0000001) return null;
    return legTwo / legOne;
  }

  /**
   * Helper function: formatXabcdRatio.
   */
  function formatXabcdRatio(value) {
    return isFiniteNumber(value) ? value.toFixed(3) : '';
  }

  /**
   * Helper function: distanceToXabcdPoint.
   */
  function distanceToXabcdPoint(a, b) {
    if (!a || !b || !isFiniteNumber(a.x) || !isFiniteNumber(a.y) || !isFiniteNumber(b.x) || !isFiniteNumber(b.y)) {
      return Number.POSITIVE_INFINITY;
    }
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt((dx * dx) + (dy * dy));
  }

  /**
   * Helper function: distanceToXabcdSegment.
   */
  function distanceToXabcdSegment(point, a, b) {
    if (!point || !a || !b) return Number.POSITIVE_INFINITY;
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var lengthSquared = (dx * dx) + (dy * dy);
    if (lengthSquared <= 0.0001) return distanceToXabcdPoint(point, a);
    var t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
    return distanceToXabcdPoint(point, { x: a.x + (dx * t), y: a.y + (dy * t) });
  }

  /**
   * Creates the visual primitive object that gets rendered on the chart canvas.
   */
  function createXabcdPrimitive(pointList, record, draft) {
    function drawXabcdRatioLabel(ctx, midX, midY, text, style, ratioX, matchesTarget) {
      if (!text) return;
      var fontSize = Math.round(11 * ratioX);
      ctx.font = '600 ' + fontSize + 'px Arial';
      var textWidth = ctx.measureText(text).width;
      var padding = 4 * ratioX;
      var boxWidth = textWidth + padding * 2;
      var boxHeight = fontSize + padding * 1.4;
      roundRectPath(ctx, midX - boxWidth / 2, midY - boxHeight / 2, boxWidth, boxHeight, 4 * ratioX);
      ctx.fillStyle = matchesTarget ? style.ratioMatchBackgroundColor : style.ratioBackgroundColor;
      ctx.fill();
      ctx.fillStyle = style.ratioTextColor;
      ctx.fillText(text, midX - textWidth / 2, midY + boxHeight / 2 - padding * 0.9);
    }

  /**
   * Helper function: XabcdPaneRenderer.
   */
    function XabcdPaneRenderer(source, coords) {
      this._source = source;
      this._coords = coords;
    }

  /**
   * Helper function: draw.
   */
    XabcdPaneRenderer.prototype.draw = function (target) {
      var source = this._source;
      var coords = this._coords;
      var allCoords = this._coords;
      var valid = coords.filter(function (item) {
        return item && isFiniteNumber(item.x) && isFiniteNumber(item.y);
      });
      if (!source._options.visible || valid.length < 2) return;
      target.useBitmapCoordinateSpace(function (scope) {
        var ctx = scope.context;
        var ratioX = scope.horizontalPixelRatio || 1;
        var ratioY = scope.verticalPixelRatio || 1;
        var style = source._options.style;
        var lineColor = source._options.selected ? style.selectedColor : (source._options.hovered ? style.hoverColor : style.color);
        var complete = coords.length >= 5 && coords.slice(0, 5).every(function (item) {
          return item && isFiniteNumber(item.x) && isFiniteNumber(item.y);
        });

        ctx.save();

        if (complete && style.showFill) {
          [[0, 1, 2], [2, 3, 4]].forEach(function (triangle) {
            ctx.beginPath();
            triangle.forEach(function (idx, order) {
              var x = coords[idx].x * ratioX;
              var y = coords[idx].y * ratioY;
              if (order === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            });
            ctx.lineTo(coords[triangle[0]].x * ratioX, coords[triangle[0]].y * ratioY);
            ctx.globalAlpha = style.fillOpacity;
            ctx.fillStyle = style.fillColor;
            ctx.fill();
          });
          ctx.globalAlpha = 1;
        }

        if (complete) {
          ctx.globalAlpha = style.opacity * 0.85;
          ctx.strokeStyle = style.strutColor;
          ctx.lineWidth = Math.max(1, ratioX);
          if (ctx.setLineDash) ctx.setLineDash(xabcdDashPattern('dashed', ratioX));
          ctx.beginPath();
          ctx.moveTo(coords[0].x * ratioX, coords[0].y * ratioY);
          ctx.lineTo(coords[2].x * ratioX, coords[2].y * ratioY);
          ctx.moveTo(coords[2].x * ratioX, coords[2].y * ratioY);
          ctx.lineTo(coords[4].x * ratioX, coords[4].y * ratioY);
          ctx.stroke();
          if (ctx.setLineDash) ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }

        ctx.globalAlpha = style.opacity;
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = Math.max(1, style.width * ratioX);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (ctx.setLineDash) ctx.setLineDash(xabcdDashPattern(style.lineStyle, ratioX));
        ctx.beginPath();
        valid.forEach(function (coord, index) {
          var x = coord.x * ratioX;
          var y = coord.y * ratioY;
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        if (ctx.setLineDash) ctx.setLineDash([]);
        ctx.globalAlpha = 1;

        ctx.fillStyle = lineColor;
        valid.forEach(function (coord) {
          ctx.beginPath();
          ctx.arc(coord.x * ratioX, coord.y * ratioY, 2.8 * ratioX, 0, Math.PI * 2);
          ctx.fill();
        });

        if (shouldRenderObjectDescriptions(source) && complete && style.showRatios) {
          var prices = source._points.map(function (point) { return point ? point.price : null; });
          var measuredRatios = [
            xabcdRetracement(prices[0], prices[1], prices[2]),
            xabcdRetracement(prices[1], prices[2], prices[3]),
            xabcdRetracement(prices[2], prices[3], prices[4])
          ];
          var ratioAnchors = [[0, 2], [1, 3], [2, 4]];
          measuredRatios.forEach(function (measured, index) {
            var config = source._options.ratios[index];
            if (!config || !config.visible) return;
            var text = formatXabcdRatio(measured);
            if (!text) return;
            var matchesTarget = false;
            if (config.target !== null) {
              text = text + ' / ' + formatXabcdRatio(config.target);
              matchesTarget = isFiniteNumber(measured) && Math.abs(measured - config.target) <= XABCD_RATIO_TOLERANCE;
            }
            var anchor = ratioAnchors[index];
            drawXabcdRatioLabel(
              ctx,
              ((coords[anchor[0]].x + coords[anchor[1]].x) / 2) * ratioX,
              ((coords[anchor[0]].y + coords[anchor[1]].y) / 2) * ratioY,
              text,
              style,
              ratioX,
              matchesTarget
            );
          });
        }

        if (shouldRenderObjectDescriptions(source)) {
          var vertexFontSize = Math.round(12 * ratioX);
          ctx.font = '700 ' + vertexFontSize + 'px Arial';
          allCoords.forEach(function (coord, index) {
            if (!coord || !isFiniteNumber(coord.x) || !isFiniteNumber(coord.y)) return;
            var label = XABCD_VERTEX_LABELS[index] || '';
            if (!label) return;
            var previous = allCoords[index - 1];
            var goingUp = index > 0 && previous && isFiniteNumber(previous.y)
              ? coord.y <= previous.y
              : true;
            var textWidth = ctx.measureText(label).width;
            var padding = 5 * ratioX;
            var boxWidth = textWidth + padding * 2;
            var boxHeight = vertexFontSize + padding * 1.4;
            var cx = coord.x * ratioX;
            var cy = coord.y * ratioY + (goingUp ? -(boxHeight + 6 * ratioY) : (6 * ratioY));
            roundRectPath(ctx, cx - boxWidth / 2, cy, boxWidth, boxHeight, 5 * ratioX);
            ctx.fillStyle = style.labelBackgroundColor;
            ctx.fill();
            ctx.fillStyle = style.labelTextColor;
            ctx.fillText(label, cx - textWidth / 2, cy + boxHeight - padding * 0.9);
          });
        }

        if (source._options.selected || source._options.draft || style.showHandles) {
          var radius = (source._options.selected ? style.selectedHandleRadius : style.handleRadius) * ratioX;
          ctx.fillStyle = style.handleFillColor;
          ctx.strokeStyle = lineColor;
          ctx.lineWidth = Math.max(1, 1.5 * ratioX);
          valid.forEach(function (coord) {
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
   * Helper function: XabcdPaneView.
   */
    function XabcdPaneView(source) {
      this._source = source;
      this._coords = [];
    }

  /**
   * Helper function: update.
   */
    XabcdPaneView.prototype.update = function () {
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
    XabcdPaneView.prototype.renderer = function () {
      return new XabcdPaneRenderer(this._source, this._coords);
    };

  /**
   * Helper function: XabcdPrimitive.
   */
    function XabcdPrimitive(points, opts) {
      PrimitiveBase.call(this);
      this._points = clonePoints(points);
      var source = opts && typeof opts === 'object' ? opts : {};
      this._options = {
        draft: !!draft,
        hovered: !!source.hovered,
        selected: !!source.selected,
        visible: source.visible === false || source.hidden === true ? false : true,
        style: normalizeXabcdStyle(source.style, draft),
        ratios: normalizeXabcdRatios(source.ratios)
      };
      this._coords = [];
      this._paneViews = [new XabcdPaneView(this)];
    }

    XabcdPrimitive.prototype = Object.create(PrimitiveBase.prototype);
    XabcdPrimitive.prototype.constructor = XabcdPrimitive;
    XabcdPrimitive.prototype.updateAllViews = function () {
      this._paneViews.forEach(function (view) { view.update(); });
    };
    XabcdPrimitive.prototype.paneViews = function () {
      return this._paneViews;
    };
    XabcdPrimitive.prototype.setVisible = function (visible) {
      this._options.visible = !!visible;
      this.requestUpdate();
    };
    XabcdPrimitive.prototype.setSelected = function (selected) {
      this._options.selected = !!selected;
      this.requestUpdate();
    };
    XabcdPrimitive.prototype.setHovered = function (hovered) {
      this._options.hovered = !!hovered;
      this.requestUpdate();
    };
    XabcdPrimitive.prototype.setPoints = function (points) {
      this._points = clonePoints(points);
      this.requestUpdate();
    };
    XabcdPrimitive.prototype.updatePoints = function () {
      var args = Array.prototype.slice.call(arguments);
      if (args.length === 1 && Array.isArray(args[0])) {
        this._points = clonePoints(args[0]);
      } else if (args.length > 0) {
        this._points = clonePoints(args);
      }
      this.requestUpdate();
    };
    XabcdPrimitive.prototype.getPoints = function () {
      return clonePoints(this._points);
    };
    XabcdPrimitive.prototype.getGeometry = function () {
      this.updateAllViews();
      return { coords: this._coords.slice() };
    };
    XabcdPrimitive.prototype.hitTest = function (point, context) {
      this.updateAllViews();
      var coords = this._coords;
      if (!Array.isArray(coords) || coords.length < 2) return null;
      var isTouch = context && context.isTouch;
      var handleThreshold = isTouch ? 20 : 10;
      var lineThreshold = isTouch ? 14 : 8;
      for (var i = 0; i < coords.length; i += 1) {
        if (distanceToXabcdPoint(point, coords[i]) <= handleThreshold) return { part: 'p' + (i + 1) };
      }
      for (var j = 1; j < coords.length; j += 1) {
        if (distanceToXabcdSegment(point, coords[j - 1], coords[j]) <= lineThreshold) return { part: 'body' };
      }
      if (coords.length >= 5) {
        if (distanceToXabcdSegment(point, coords[0], coords[2]) <= lineThreshold) return { part: 'body' };
        if (distanceToXabcdSegment(point, coords[2], coords[4]) <= lineThreshold) return { part: 'body' };
      }
      return null;
    };
    XabcdPrimitive.prototype.buildEditPoints = function (part, originalPoints, startPoint, editPoint) {
      if (!Array.isArray(originalPoints) || !editPoint) return null;
      var match = typeof part === 'string' ? part.match(/^p(\\d+)$/) : null;
      if (!match) return null;
      var targetIndex = parseInt(match[1], 10) - 1;
      if (targetIndex < 0 || targetIndex >= originalPoints.length) return null;
      var next = clonePoints(originalPoints);
      next[targetIndex] = clonePoint(editPoint);
      return next;
    };
    return new XabcdPrimitive(pointList, record);
  }

  /**
   * Builds a serialized record object representing the current state of the drawing tool for persistence.
   */
  function buildXabcdRecord(points, style) {
    var now = Date.now();
    return {
      type: 'xabcd',
      paneId: 'main',
      points: clonePoints(points),
      style: normalizeXabcdStyle(style, false),
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
  function XabcdTool(chart, series, manager) {
    BaseTool.call(this, 'xabcd', chart, series, manager);
    this._points = [];
    this._preview = null;
    this._style = normalizeXabcdStyle(null, false);
    this._requiredPoints = 5;
    this._handleClick = this._handleClick.bind(this);
    this._usesNativeChartInput = !manager.shouldUseDirectTouchInput();
    if (this._usesNativeChartInput) {
      this._chart.subscribeClick(this._handleClick);
    }
  }

  XabcdTool.prototype = Object.create(BaseTool.prototype);
  XabcdTool.prototype.constructor = XabcdTool;
  XabcdTool.prototype.startDrawing = function () {
    BaseTool.prototype.startDrawing.call(this);
    this._resetDrawingSession();
  };
  XabcdTool.prototype._resetDrawingSession = function () {
    this._points = [];
    this._removePreview();
  };
  XabcdTool.prototype.stopDrawing = function () {
    BaseTool.prototype.stopDrawing.call(this);
    this._resetDrawingSession();
  };
  XabcdTool.prototype._removePreview = function () {
    if (this._preview) {
      try { this._series.detachPrimitive(this._preview); } catch (_error) {}
      this._preview = null;
    }
  };
  XabcdTool.prototype._syncPreview = function () {
    if (this._points.length < 1) {
      this._removePreview();
      return;
    }
    if (!this._preview) {
      this._preview = createXabcdPrimitive(this._points, { style: this._style, selected: true }, true);
      this._series.attachPrimitive(this._preview);
      return;
    }
    this._preview.setPoints(this._points);
  };
  XabcdTool.prototype._handleClick = function (param) {
    if (!this._drawing) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    this._points.push(clonePoint(point));
    if (this._points.length >= this._requiredPoints) {
      var points = clonePoints(this._points.slice(0, this._requiredPoints));
      this._removePreview();
      var serialized = buildXabcdRecord(points, this._style);
      this._completeDrawing(createXabcdPrimitive(points, serialized, false), null, serialized);
      return;
    }
    this._syncPreview();
  };
  XabcdTool.prototype.remove = function () {
    this.stopDrawing();
    if (this._usesNativeChartInput) {
      this._chart.unsubscribeClick(this._handleClick);
    }
  };

  /**
   * Registers this drawing tool with the global drawing manager so it can be instantiated by the chart.
   */
  registerEnhancedDrawingTool({
    kind: 'xabcd',
    defaultLabel: 'XABCD Harmonic',
    requiredPointCount: 5,
    createTool: function (chart, series, manager) {
      return new XabcdTool(chart, series, manager);
    },
    createPrimitiveFromRecord: function (record) {
      var points = record.points || [];
      return createXabcdPrimitive(points, record, false);
    }
  });
`,
};
