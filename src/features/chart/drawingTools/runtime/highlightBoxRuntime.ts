import type { EnhancedDrawingToolRuntime } from '../types';

export const highlightBoxEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'brush',
  script: `
  /**
   * Helper function: normalizeHighlightExtendMode.
   */
  function normalizeHighlightExtendMode(value) {
    return value === 'left' || value === 'right' || value === 'both' ? value : 'none';
  }

  /**
   * Normalizes the style configuration for the drawing tool, providing defaults for missing values.
   */
  function normalizeHighlightLineStyle(value) {
    return value === 'dashed' || value === 'dotted' ? value : 'solid';
  }

  /**
   * Helper function: highlightDashPattern.
   */
  function highlightDashPattern(style, ratio) {
    var px = Math.max(1, ratio || 1);
    if (style === 'dashed') return [8 * px, 5 * px];
    if (style === 'dotted') return [2 * px, 5 * px];
    return [];
  }

  /**
   * Helper function: normalizeHighlightZoneType.
   */
  function normalizeHighlightZoneType(value) {
    if (value === 'supply' || value === 'demand' || value === 'range' || value === 'session' || value === 'neutral' || value === 'custom') {
      return value;
    }
    return 'neutral';
  }

  /**
   * Helper function: normalizeHighlightExtendUntil.
   */
  function normalizeHighlightExtendUntil(value) {
    return typeof value === 'string' && value ? value : 'none';
  }

  /**
   * Normalizes the style configuration for the drawing tool, providing defaults for missing values.
   */
  function normalizeHighlightStyle(style, draft) {
    var source = style && typeof style === 'object' ? style : {};
    return {
      fillColor: typeof source.fillColor === 'string' ? source.fillColor : (draft ? 'rgba(41, 98, 255, 0.08)' : 'rgba(41, 98, 255, 0.15)'),
      borderColor: typeof source.borderColor === 'string' ? source.borderColor : '#2962FF',
      selectedBorderColor: typeof source.selectedBorderColor === 'string' ? source.selectedBorderColor : '#1D4ED8',
      hoverBorderColor: typeof source.hoverBorderColor === 'string' ? source.hoverBorderColor : '#60A5FA',
      borderWidth: isFiniteNumber(source.borderWidth) ? Math.max(1, Math.min(6, source.borderWidth)) : 1.2,
      borderStyle: normalizeHighlightLineStyle(source.borderStyle),
      opacity: isFiniteNumber(source.opacity) ? Math.max(0.08, Math.min(1, source.opacity)) : (draft ? 0.72 : 1),
      cornerRadius: isFiniteNumber(source.cornerRadius) ? Math.max(0, Math.min(12, source.cornerRadius)) : 6,
      showLabel: source.showLabel === false ? false : true,
      label: typeof source.label === 'string' ? source.label : 'Highlight',
      labelPosition: source.labelPosition === 'bottomLeft' || source.labelPosition === 'topRight' || source.labelPosition === 'bottomRight' ? source.labelPosition : 'topLeft',
      fontSize: isFiniteNumber(source.fontSize) ? Math.max(9, Math.min(15, source.fontSize)) : 11,
      labelBackgroundColor: typeof source.labelBackgroundColor === 'string' ? source.labelBackgroundColor : 'rgba(30, 64, 175, 0.92)',
      labelTextColor: typeof source.labelTextColor === 'string' ? source.labelTextColor : '#DBEAFE',
      showPriceRange: source.showPriceRange === false ? false : true,
      showHandles: source.showHandles === false ? false : true,
      handleFillColor: typeof source.handleFillColor === 'string' ? source.handleFillColor : '#FFFFFF',
      handleStrokeColor: typeof source.handleStrokeColor === 'string' ? source.handleStrokeColor : '#2962FF',
      handleRadius: isFiniteNumber(source.handleRadius) ? Math.max(3, Math.min(9, source.handleRadius)) : 4,
      selectedHandleRadius: isFiniteNumber(source.selectedHandleRadius) ? Math.max(4, Math.min(12, source.selectedHandleRadius)) : 5
    };
  }

  /**
   * Helper function: resolveHighlightBounds.
   */
  function resolveHighlightBounds(pointA, pointB) {
    var timeA = timeToComparableValue(pointA && pointA.time);
    var timeB = timeToComparableValue(pointB && pointB.time);
    var leftPoint = timeA !== null && timeB !== null && timeA > timeB ? pointB : pointA;
    var rightPoint = leftPoint === pointA ? pointB : pointA;
    var lowPrice = Math.min(pointA.price, pointB.price);
    var highPrice = Math.max(pointA.price, pointB.price);
    return {
      startTime: leftPoint.time,
      endTime: rightPoint.time,
      lowPrice: lowPrice,
      highPrice: highPrice
    };
  }

  /**
   * Helper function: buildHighlightZoneMetadata.
   */
  function buildHighlightZoneMetadata(points, zoneType, extendMode) {
    var bounds = points && points.length >= 2 ? resolveHighlightBounds(points[0], points[1]) : null;
    return {
      type: 'highlightBox',
      zoneType: normalizeHighlightZoneType(zoneType),
      extendMode: normalizeHighlightExtendMode(extendMode),
      startTime: bounds ? bounds.startTime : undefined,
      endTime: bounds ? bounds.endTime : undefined,
      lowPrice: bounds ? bounds.lowPrice : undefined,
      highPrice: bounds ? bounds.highPrice : undefined
    };
  }

  /**
   * Helper function: normalizeHighlightAlertMetadata.
   */
  function normalizeHighlightAlertMetadata(metadata, points, zoneType, extendMode) {
    var source = metadata && typeof metadata === 'object' ? metadata : {};
    if (metadata && typeof metadata === 'object') {
      return Object.assign({}, source);
    }
    var zone = buildHighlightZoneMetadata(points, zoneType, extendMode);
    return {
      supportedEvents: [
        'enter-zone',
        'exit-zone',
        'touch-top',
        'touch-bottom',
        'close-inside',
        'close-beyond'
      ],
      priceTop: zone.highPrice,
      priceBottom: zone.lowPrice,
      startTime: zone.startTime,
      endTime: zone.endTime,
      zoneType: zone.zoneType,
      extendMode: zone.extendMode
    };
  }

  /**
   * Helper function: normalizeHighlightRecord.
   */
  function normalizeHighlightRecord(record, draft) {
    var source = record && typeof record === 'object' ? record : {};
    var points = Array.isArray(source.points) ? clonePoints(source.points.slice(0, 2)) : [];
    var zoneType = normalizeHighlightZoneType(source.zoneType);
    var extendMode = normalizeHighlightExtendMode(source.extendMode);
    return {
      type: 'highlightBox',
      paneId: typeof source.paneId === 'string' ? source.paneId : 'main',
      style: normalizeHighlightStyle(source.style, draft),
      extendMode: extendMode,
      zoneType: zoneType,
      extendUntil: normalizeHighlightExtendUntil(source.extendUntil),
      alertMetadata: normalizeHighlightAlertMetadata(source.alertMetadata, points, zoneType, extendMode),
      locked: !!source.locked,
      visible: source.visible === false || source.hidden === true ? false : true,
      selected: !!source.selected,
      hovered: !!source.hovered,
      draft: !!draft
    };
  }

  /**
   * Helper function: resolveHighlightRenderBox.
   */
  function resolveHighlightRenderBox(p1, p2, extendMode, paneWidth) {
    var left = Math.min(p1.x, p2.x);
    var right = Math.max(p1.x, p2.x);
    var top = Math.min(p1.y, p2.y);
    var bottom = Math.max(p1.y, p2.y);
    var mode = normalizeHighlightExtendMode(extendMode);
    if (mode === 'left' || mode === 'both') left = 0;
    if (mode === 'right' || mode === 'both') right = Math.max(right, paneWidth);
    return {
      left: left,
      right: Math.max(left + 1, right),
      top: top,
      bottom: Math.max(top + 1, bottom),
      anchorLeft: Math.min(p1.x, p2.x),
      anchorRight: Math.max(p1.x, p2.x)
    };
  }

  /**
   * Helper function: drawHighlightHandle.
   */
  function drawHighlightHandle(ctx, x, y, radius, fill, stroke, ratio) {
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1, 1.5 * ratio);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  /**
   * Helper function: distanceToHighlightPoint.
   */
  function distanceToHighlightPoint(a, b) {
    if (!a || !b || !isFiniteNumber(a.x) || !isFiniteNumber(a.y) || !isFiniteNumber(b.x) || !isFiniteNumber(b.y)) {
      return Number.POSITIVE_INFINITY;
    }
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt((dx * dx) + (dy * dy));
  }

  /**
   * Helper function: buildHighlightLabel.
   */
  function buildHighlightLabel(source) {
    var style = source._options.style;
    if (!style.showLabel) return '';
    var parts = [];
    if (style.label) parts.push(style.label);
    if (source._options.zoneType !== 'neutral' && source._options.zoneType !== 'custom') parts.push(source._options.zoneType.toUpperCase());
    if (style.showPriceRange && source.series) {
      var low = Math.min(source._p1.price, source._p2.price);
      var high = Math.max(source._p1.price, source._p2.price);
      parts.push(formatCrosshairPrice(source.series, low) + '-' + formatCrosshairPrice(source.series, high));
    }
    return parts.join(' ');
  }

  /**
   * Creates the visual primitive object that gets rendered on the chart canvas.
   */
  function createHighlightBoxPrimitive(pointA, pointB, record, draft) {
  /**
   * Helper function: HighlightBoxPaneRenderer.
   */
    function HighlightBoxPaneRenderer(source, geometry) {
      this._source = source;
      this._geometry = geometry;
    }

  /**
   * Helper function: draw.
   */
    HighlightBoxPaneRenderer.prototype.draw = function (target) {
      var source = this._source;
      var geometry = this._geometry;
      if (!source._options.visible || !geometry || !geometry.p1 || !geometry.p2 || !isFiniteNumber(geometry.p1.x) || !isFiniteNumber(geometry.p1.y) || !isFiniteNumber(geometry.p2.x) || !isFiniteNumber(geometry.p2.y)) return;
      target.useBitmapCoordinateSpace(function (scope) {
        var ctx = scope.context;
        var ratioX = scope.horizontalPixelRatio || 1;
        var ratioY = scope.verticalPixelRatio || 1;
        var paneWidth = ((scope.bitmapSize && scope.bitmapSize.width) || Math.max(geometry.p1.x, geometry.p2.x, 1)) / ratioX;
        var paneHeight = ((scope.bitmapSize && scope.bitmapSize.height) || Math.max(geometry.p1.y, geometry.p2.y, 1)) / ratioY;
        var box = resolveHighlightRenderBox(geometry.p1, geometry.p2, source._options.extendMode, paneWidth);
        source._geometry = Object.assign({}, geometry, { box: box });

        var style = source._options.style;
        var left = Math.max(0, box.left) * ratioX;
        var top = Math.max(0, box.top) * ratioY;
        var width = Math.max(1, (Math.min(paneWidth, box.right) - Math.max(0, box.left)) * ratioX);
        var height = Math.max(1, (Math.min(paneHeight, box.bottom) - Math.max(0, box.top)) * ratioY);
        var borderColor = source._options.selected
          ? style.selectedBorderColor
          : (source._options.hovered ? style.hoverBorderColor : style.borderColor);

        ctx.save();
        if (ctx.rect && ctx.clip) {
          ctx.beginPath();
          ctx.rect(0, 0, Math.max(1, paneWidth * ratioX), Math.max(1, paneHeight * ratioY));
          ctx.clip();
        }
        ctx.globalAlpha = style.opacity;
        roundRectPath(ctx, left, top, width, height, style.cornerRadius * ratioX);
        ctx.fillStyle = style.fillColor;
        ctx.fill();
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = Math.max(1, style.borderWidth * ratioX);
        if (ctx.setLineDash) ctx.setLineDash(highlightDashPattern(style.borderStyle, ratioX));
        ctx.stroke();
        if (ctx.setLineDash) ctx.setLineDash([]);

        var label = buildHighlightLabel(source);
        if (shouldRenderObjectDescriptions(source) && label) {
          var fontSize = Math.round(style.fontSize * ratioX);
          var padding = 6 * ratioX;
          ctx.font = '700 ' + fontSize + 'px Arial';
          var textWidth = ctx.measureText(label).width;
          var labelWidth = Math.min(textWidth + padding * 1.8, Math.max(20 * ratioX, width - padding));
          var labelHeight = fontSize + padding * 1.4;
          var labelX = left + padding;
          var labelY = top + padding;
          if (style.labelPosition === 'topRight' || style.labelPosition === 'bottomRight') {
            labelX = left + width - labelWidth - padding;
          }
          if (style.labelPosition === 'bottomLeft' || style.labelPosition === 'bottomRight') {
            labelY = top + height - labelHeight - padding;
          }
          labelX = Math.max(2 * ratioX, Math.min((paneWidth * ratioX) - labelWidth - 2 * ratioX, labelX));
          labelY = Math.max(2 * ratioY, Math.min((paneHeight * ratioY) - labelHeight - 2 * ratioY, labelY));
          roundRectPath(ctx, labelX, labelY, labelWidth, labelHeight, 5 * ratioX);
          ctx.fillStyle = style.labelBackgroundColor;
          ctx.fill();
          ctx.fillStyle = style.labelTextColor;
          ctx.fillText(label, labelX + padding * 0.9, labelY + labelHeight - padding * 0.6, Math.max(10, labelWidth - padding * 1.6));
        }

        if (source._options.selected || source._options.draft || style.showHandles) {
          var radius = (source._options.selected ? style.selectedHandleRadius : style.handleRadius) * ratioX;
          var handleStroke = source._options.selected ? style.selectedBorderColor : style.handleStrokeColor;
          var handles = source.getHandleCoordinates();
          handles.forEach(function (handle) {
            drawHighlightHandle(ctx, handle.x * ratioX, handle.y * ratioY, radius, style.handleFillColor, handleStroke, ratioX);
          });
        }
        ctx.restore();
      });
    };

  /**
   * Helper function: HighlightBoxPaneView.
   */
    function HighlightBoxPaneView(source) {
      this._source = source;
      this._geometry = { p1: null, p2: null, box: null };
    }

  /**
   * Helper function: update.
   */
    HighlightBoxPaneView.prototype.update = function () {
      var series = this._source.series;
      var p1 = {
        x: resolveCoordinateFromTime(this._source.chart, series, this._source._p1.time),
        y: series.priceToCoordinate(this._source._p1.price)
      };
      var p2 = {
        x: resolveCoordinateFromTime(this._source.chart, series, this._source._p2.time),
        y: series.priceToCoordinate(this._source._p2.price)
      };
      this._geometry = { p1: p1, p2: p2, box: this._source._geometry ? this._source._geometry.box : null };
      this._source._geometry = this._geometry;
    };

  /**
   * Helper function: renderer.
   */
    HighlightBoxPaneView.prototype.renderer = function () {
      return new HighlightBoxPaneRenderer(this._source, this._geometry);
    };

  /**
   * Helper function: HighlightBoxPrimitive.
   */
    function HighlightBoxPrimitive(anchorA, anchorB, opts) {
      PrimitiveBase.call(this);
      this._p1 = clonePoint(anchorA);
      this._p2 = clonePoint(anchorB);
      this._options = Object.assign(normalizeHighlightRecord(opts, draft), {
        draft: !!draft
      });
      this._geometry = null;
      this._paneViews = [new HighlightBoxPaneView(this)];
    }

    HighlightBoxPrimitive.prototype = Object.create(PrimitiveBase.prototype);
    HighlightBoxPrimitive.prototype.constructor = HighlightBoxPrimitive;
  /**
   * Helper function: updateAllViews.
   */
    HighlightBoxPrimitive.prototype.updateAllViews = function () {
      this._paneViews.forEach(function (view) { view.update(); });
    };
  /**
   * Helper function: paneViews.
   */
    HighlightBoxPrimitive.prototype.paneViews = function () {
      return this._paneViews;
    };
  /**
   * Helper function: setVisible.
   */
    HighlightBoxPrimitive.prototype.setVisible = function (visible) {
      this._options.visible = !!visible;
      this.requestUpdate();
    };
  /**
   * Helper function: setSelected.
   */
    HighlightBoxPrimitive.prototype.setSelected = function (selected) {
      this._options.selected = !!selected;
      this.requestUpdate();
    };
  /**
   * Helper function: setHovered.
   */
    HighlightBoxPrimitive.prototype.setHovered = function (hovered) {
      this._options.hovered = !!hovered;
      this.requestUpdate();
    };
  /**
   * Helper function: updatePoints.
   */
    HighlightBoxPrimitive.prototype.updatePoints = function (pointA, pointB) {
      this._p1 = clonePoint(pointA);
      this._p2 = clonePoint(pointB);
      this.requestUpdate();
    };
  /**
   * Helper function: getPoints.
   */
    HighlightBoxPrimitive.prototype.getPoints = function () {
      return clonePoints([this._p1, this._p2]);
    };
  /**
   * Helper function: getLogicalBounds.
   */
    HighlightBoxPrimitive.prototype.getLogicalBounds = function () {
      return resolveHighlightBounds(this._p1, this._p2);
    };
  /**
   * Helper function: getHandleCoordinates.
   */
    HighlightBoxPrimitive.prototype.getHandleCoordinates = function () {
      this.updateAllViews();
      var geometry = this._geometry;
      if (!geometry || !geometry.p1 || !geometry.p2 || !isFiniteNumber(geometry.p1.x) || !isFiniteNumber(geometry.p1.y) || !isFiniteNumber(geometry.p2.x) || !isFiniteNumber(geometry.p2.y)) {
        return [];
      }
      var left = Math.min(geometry.p1.x, geometry.p2.x);
      var right = Math.max(geometry.p1.x, geometry.p2.x);
      var top = Math.min(geometry.p1.y, geometry.p2.y);
      var bottom = Math.max(geometry.p1.y, geometry.p2.y);
      var midX = left + ((right - left) / 2);
      var midY = top + ((bottom - top) / 2);
      return [
        { part: 'top-left', x: left, y: top },
        { part: 'top', x: midX, y: top },
        { part: 'top-right', x: right, y: top },
        { part: 'right', x: right, y: midY },
        { part: 'bottom-right', x: right, y: bottom },
        { part: 'bottom', x: midX, y: bottom },
        { part: 'bottom-left', x: left, y: bottom },
        { part: 'left', x: left, y: midY }
      ];
    };
  /**
   * Helper function: getGeometry.
   */
    HighlightBoxPrimitive.prototype.getGeometry = function () {
      this.updateAllViews();
      var geometry = this._geometry;
      if (!geometry || !geometry.p1 || !geometry.p2 || !isFiniteNumber(geometry.p1.x) || !isFiniteNumber(geometry.p1.y) || !isFiniteNumber(geometry.p2.x) || !isFiniteNumber(geometry.p2.y)) {
        return null;
      }
      var fallbackWidth = Math.max(geometry.p1.x, geometry.p2.x);
      var box = geometry.box || resolveHighlightRenderBox(geometry.p1, geometry.p2, this._options.extendMode, fallbackWidth);
      return {
        p1: { x: geometry.p1.x, y: geometry.p1.y },
        p2: { x: geometry.p2.x, y: geometry.p2.y },
        anchorRect: {
          anchorLeft: Math.min(geometry.p1.x, geometry.p2.x),
          anchorRight: Math.max(geometry.p1.x, geometry.p2.x),
          top: Math.min(geometry.p1.y, geometry.p2.y),
          bottom: Math.max(geometry.p1.y, geometry.p2.y)
        },
        visibleRect: {
          left: box.left,
          right: box.right,
          top: box.top,
          bottom: box.bottom
        }
      };
    };
  /**
   * Helper function: hitTest.
   */
    HighlightBoxPrimitive.prototype.hitTest = function (point, context) {
      this.updateAllViews();
      var geometry = this._geometry;
      if (!geometry || !geometry.p1 || !geometry.p2 || !isFiniteNumber(geometry.p1.x) || !isFiniteNumber(geometry.p1.y) || !isFiniteNumber(geometry.p2.x) || !isFiniteNumber(geometry.p2.y)) {
        return null;
      }
      var isTouch = context && context.isTouch;
      var handleThreshold = isTouch ? 20 : 10;
      var edgeThreshold = isTouch ? 14 : 7;
      var handles = this.getHandleCoordinates();
      for (var i = 0; i < handles.length; i += 1) {
        if (distanceToHighlightPoint(point, handles[i]) <= handleThreshold) {
          return { part: handles[i].part };
        }
      }
      var box = geometry.box || resolveHighlightRenderBox(geometry.p1, geometry.p2, this._options.extendMode, Math.max(geometry.p1.x, geometry.p2.x));
      var insideX = point.x >= box.left - edgeThreshold && point.x <= box.right + edgeThreshold;
      var insideY = point.y >= box.top - edgeThreshold && point.y <= box.bottom + edgeThreshold;
      if (insideX && insideY) {
        var nearEdge = Math.abs(point.x - box.left) <= edgeThreshold || Math.abs(point.x - box.right) <= edgeThreshold || Math.abs(point.y - box.top) <= edgeThreshold || Math.abs(point.y - box.bottom) <= edgeThreshold;
        return { part: nearEdge ? 'border' : 'body' };
      }
      return null;
    };
  /**
   * Helper function: buildEditPoints.
   */
    HighlightBoxPrimitive.prototype.buildEditPoints = function (part, originalPoints, startPoint, editPoint) {
      if (!Array.isArray(originalPoints) || originalPoints.length < 2 || !editPoint) return null;
      if (part === 'body' || part === 'border') return null;
      var next = clonePoints(originalPoints.slice(0, 2));
      var time0 = timeToComparableValue(next[0].time);
      var time1 = timeToComparableValue(next[1].time);
      var leftIndex = time0 !== null && time1 !== null && time0 <= time1 ? 0 : 1;
      var rightIndex = leftIndex === 0 ? 1 : 0;
      var topIndex = next[0].price >= next[1].price ? 0 : 1;
      var bottomIndex = topIndex === 0 ? 1 : 0;
      if (part === 'top-left' || part === 'left' || part === 'bottom-left') next[leftIndex].time = editPoint.time;
      if (part === 'top-right' || part === 'right' || part === 'bottom-right') next[rightIndex].time = editPoint.time;
      if (part === 'top-left' || part === 'top' || part === 'top-right') next[topIndex].price = editPoint.price;
      if (part === 'bottom-left' || part === 'bottom' || part === 'bottom-right') next[bottomIndex].price = editPoint.price;
      return next;
    };
    return new HighlightBoxPrimitive(pointA, pointB, record, draft);
  }

  /**
   * Builds a serialized record object representing the current state of the drawing tool for persistence.
   */
  function buildHighlightBoxRecord(points, style, extendMode, zoneType, extendUntil, alertMetadata) {
    var now = Date.now();
    var normalizedExtendMode = normalizeHighlightExtendMode(extendMode);
    var normalizedZoneType = normalizeHighlightZoneType(zoneType);
    var clonedPoints = clonePoints(points.slice(0, 2));
    return {
      type: 'highlightBox',
      paneId: 'main',
      points: clonedPoints,
      style: normalizeHighlightStyle(style, false),
      extendMode: normalizedExtendMode,
      zoneType: normalizedZoneType,
      extendUntil: normalizeHighlightExtendUntil(extendUntil),
      alertMetadata: normalizeHighlightAlertMetadata(alertMetadata, clonedPoints, normalizedZoneType, normalizedExtendMode),
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
  function HighlightBoxTool(chart, series, manager) {
    BaseTool.call(this, 'brush', chart, series, manager);
    this._points = [];
    this._preview = null;
    this._style = normalizeHighlightStyle(null, false);
    this._extendMode = 'none';
    this._zoneType = 'neutral';
    this._extendUntil = 'none';
    this._handleClick = this._handleClick.bind(this);
    this._handleMove = this._handleMove.bind(this);
    this._usesNativeChartInput = !manager.shouldUseDirectTouchInput();
    if (this._usesNativeChartInput) {
      this._chart.subscribeClick(this._handleClick);
      this._chart.subscribeCrosshairMove(this._handleMove);
    }
  }

  HighlightBoxTool.prototype = Object.create(BaseTool.prototype);
  HighlightBoxTool.prototype.constructor = HighlightBoxTool;
  /**
   * Initiates the drawing process for the tool.
   */
  HighlightBoxTool.prototype.startDrawing = function () {
    BaseTool.prototype.startDrawing.call(this);
    this._resetDrawingSession();
  };
  /**
   * Helper function: _resetDrawingSession.
   */
  HighlightBoxTool.prototype._resetDrawingSession = function () {
    this._points = [];
    this._removePreview();
  };
  /**
   * Terminates the active drawing process and cleans up.
   */
  HighlightBoxTool.prototype.stopDrawing = function () {
    BaseTool.prototype.stopDrawing.call(this);
    this._resetDrawingSession();
  };
  /**
   * Removes the tool and cleans up associated event listeners.
   */
  HighlightBoxTool.prototype._removePreview = function () {
    if (this._preview) {
      try { this._series.detachPrimitive(this._preview); } catch (_error) {}
      this._preview = null;
    }
  };
  /**
   * Helper function: _sameLogicalPoint.
   */
  HighlightBoxTool.prototype._sameLogicalPoint = function (pointA, pointB) {
    return pointA && pointB && pointA.time === pointB.time && pointA.price === pointB.price;
  };
  /**
   * Helper function: _startPreview.
   */
  HighlightBoxTool.prototype._startPreview = function (point) {
    var record = buildHighlightBoxRecord([point, point], this._style, this._extendMode, this._zoneType, this._extendUntil, null);
    this._preview = createHighlightBoxPrimitive(point, point, record, true);
    this._series.attachPrimitive(this._preview);
  };
  /**
   * Helper function: _completeHighlightBox.
   */
  HighlightBoxTool.prototype._completeHighlightBox = function (secondPoint) {
    var firstPoint = this._points[0];
    if (!firstPoint || !secondPoint || this._sameLogicalPoint(firstPoint, secondPoint)) {
      return;
    }
    var points = [clonePoint(firstPoint), clonePoint(secondPoint)];
    this._removePreview();
    var serialized = buildHighlightBoxRecord(points, this._style, this._extendMode, this._zoneType, this._extendUntil, null);
    this._completeDrawing(createHighlightBoxPrimitive(points[0], points[1], serialized, false), 'Highlight', serialized);
  };
  /**
   * Handles click events on the chart to process point placement for the drawing tool.
   */
  HighlightBoxTool.prototype._handleClick = function (param) {
    if (!this._drawing) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    if (this._points.length === 0) {
      this._points = [clonePoint(point)];
      this._startPreview(this._points[0]);
      return;
    }
    this._completeHighlightBox(point);
  };
  /**
   * Helper function: _handleMove.
   */
  HighlightBoxTool.prototype._handleMove = function (param) {
    if (!this._drawing || !this._preview || this._points.length !== 1) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    this._preview.updatePoints(this._points[0], point);
  };
  /**
   * Removes the tool and cleans up associated event listeners.
   */
  HighlightBoxTool.prototype.remove = function () {
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
    kind: 'brush',
    defaultLabel: 'Highlight',
    requiredPointCount: 2,
    createTool: function (chart, series, manager) {
      return new HighlightBoxTool(chart, series, manager);
    },
    createPrimitiveFromRecord: function (record) {
      var points = record.points || [];
      var normalized = normalizeHighlightRecord(record, false);
      return createHighlightBoxPrimitive(points[0], points[1], Object.assign({}, record, normalized), false);
    }
  });
`,
};
