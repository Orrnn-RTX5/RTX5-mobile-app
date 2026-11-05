import type { EnhancedDrawingToolRuntime } from '../types';

export const longPositionEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'prediction',
  script: `
  function buildLongPositionLabel(p1, p2) {
    var delta = p2.price - p1.price;
    var pct = p1.price ? (delta / p1.price) * 100 : 0;
    return 'Long ' + formatDelta(delta) + ' (' + pct.toFixed(2) + '%)';
  }

  function normalizeLongPositionStyle(style) {
    var source = style && typeof style === 'object' ? style : {};
    var borderColor = typeof source.borderColor === 'string'
      ? source.borderColor
      : (typeof source.color === 'string' ? source.color : '#10B981');
    var borderStyle = source.borderStyle === 'dashed' || source.borderStyle === 'dotted'
      ? source.borderStyle
      : (source.lineStyle === 'dashed' || source.lineStyle === 'dotted' ? source.lineStyle : 'solid');
    return {
      fillColor: typeof source.fillColor === 'string' ? source.fillColor : 'rgba(16, 185, 129, 0.15)',
      borderColor: borderColor,
      borderWidth: isFiniteNumber(source.borderWidth || source.width) ? Math.max(1, Math.min(8, source.borderWidth || source.width)) : 1.4,
      borderStyle: borderStyle,
      opacity: isFiniteNumber(source.opacity) ? Math.max(0.1, Math.min(1, source.opacity)) : 1,
      labelBackgroundColor: typeof source.labelBackgroundColor === 'string' ? source.labelBackgroundColor : 'rgba(6, 95, 70, 0.92)',
      labelTextColor: typeof source.labelTextColor === 'string' ? source.labelTextColor : '#D1FAE5'
    };
  }

  /**
   * Normalizes a record's persisted risk-reward plan (stop price + sizing inputs).
   */
  function resolvePositionPlanConfig(record) {
    var plan = record && record.position && typeof record.position === 'object' ? record.position : {};
    return {
      stopPrice: isFiniteNumber(plan.stopPrice) && plan.stopPrice > 0 ? plan.stopPrice : null,
      accountSize: isFiniteNumber(plan.accountSize) && plan.accountSize > 0 ? plan.accountSize : null,
      riskPercent: isFiniteNumber(plan.riskPercent) && plan.riskPercent > 0 ? plan.riskPercent : null
    };
  }

  /**
   * Effective stop price: the persisted stop when set, otherwise the 1:1
   * mirror of the target distance on the opposite side of the entry.
   */
  function resolvePositionPlanStop(entryPrice, targetPrice, stopPrice, direction) {
    if (isFiniteNumber(stopPrice) && stopPrice > 0) return stopPrice;
    if (!isFiniteNumber(entryPrice) || !isFiniteNumber(targetPrice)) return null;
    return direction === 'short'
      ? entryPrice + (entryPrice - targetPrice)
      : entryPrice - (targetPrice - entryPrice);
  }

  /**
   * Reward-to-risk multiple for the plan, or null when the risk side is not positive.
   */
  function resolvePositionPlanRiskReward(entryPrice, targetPrice, stopPrice, direction) {
    if (!isFiniteNumber(entryPrice) || !isFiniteNumber(targetPrice) || !isFiniteNumber(stopPrice)) return null;
    var reward = direction === 'short' ? entryPrice - targetPrice : targetPrice - entryPrice;
    var risk = direction === 'short' ? stopPrice - entryPrice : entryPrice - stopPrice;
    if (risk <= 0) return null;
    return reward / risk;
  }

  function formatPositionPlanPrice(value, series) {
    if (!isFiniteNumber(value)) return '';
    if (series && typeof formatCrosshairPrice === 'function') {
      return formatCrosshairPrice(series, value);
    }
    return String(Number(value.toFixed(5)));
  }

  function distanceToPositionPoint(a, b) {
    if (!a || !b || !isFiniteNumber(a.x) || !isFiniteNumber(a.y) || !isFiniteNumber(b.x) || !isFiniteNumber(b.y)) {
      return Number.POSITIVE_INFINITY;
    }
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt((dx * dx) + (dy * dy));
  }

  /**
   * Shared risk-reward position primitive for the long and short position
   * tools: reward zone (entry to target), risk zone (entry to stop), entry
   * line, and RR / target / stop labels. p1 anchors the entry, p2 the target.
   */
  function createRiskRewardPositionPrimitive(pointList, record, direction) {
    var style = direction === 'short'
      ? normalizeShortPositionStyle(record && record.style)
      : normalizeLongPositionStyle(record && record.style);

    function positionLabelText(source) {
      var points = source._points;
      if (!points[0] || !points[1]) return '';
      var stop = resolvePositionPlanStop(points[0].price, points[1].price, source._options.plan.stopPrice, direction);
      var riskReward = resolvePositionPlanRiskReward(points[0].price, points[1].price, stop, direction);
      var prefix = direction === 'short' ? 'Short' : 'Long';
      return prefix + ' RR ' + (riskReward === null ? '—' : riskReward.toFixed(2));
    }

    function drawPositionBubble(ctx, x, y, text, backgroundColor, textColor, ratioX) {
      if (!text) return;
      var fontSize = Math.round(11 * ratioX);
      ctx.font = '600 ' + fontSize + 'px Arial';
      var textWidth = ctx.measureText(text).width;
      var padding = 4 * ratioX;
      var boxWidth = textWidth + padding * 2;
      var boxHeight = fontSize + padding * 1.4;
      roundRectPath(ctx, x, y - boxHeight / 2, boxWidth, boxHeight, 4 * ratioX);
      ctx.fillStyle = backgroundColor;
      ctx.fill();
      ctx.fillStyle = textColor;
      ctx.fillText(text, x + padding, y + boxHeight / 2 - padding * 1.2);
    }

    function PositionPaneRenderer(source, coords) {
      this._source = source;
      this._coords = coords;
    }

    PositionPaneRenderer.prototype.draw = function (target) {
      var source = this._source;
      var coords = this._coords;
      if (!source._options.visible || !coords) return;
      if (!isFiniteNumber(coords.entryX) || !isFiniteNumber(coords.entryY) ||
          !isFiniteNumber(coords.targetX) || !isFiniteNumber(coords.targetY) ||
          !isFiniteNumber(coords.stopY)) {
        return;
      }
      target.useBitmapCoordinateSpace(function (scope) {
        var ctx = scope.context;
        var ratioX = scope.horizontalPixelRatio || 1;
        var ratioY = scope.verticalPixelRatio || 1;
        var opts = source._options;
        var left = Math.min(coords.entryX, coords.targetX) * ratioX;
        var right = Math.max(coords.entryX, coords.targetX) * ratioX;
        var width = Math.max(1, right - left);
        var entryY = coords.entryY * ratioY;
        var targetY = coords.targetY * ratioY;
        var stopY = coords.stopY * ratioY;

        ctx.save();
        ctx.globalAlpha = opts.opacity;

        [
          { fromY: entryY, toY: targetY, fill: opts.rewardFillColor, edge: opts.rewardEdgeColor },
          { fromY: entryY, toY: stopY, fill: opts.riskFillColor, edge: opts.riskEdgeColor }
        ].forEach(function (zone) {
          var top = Math.min(zone.fromY, zone.toY);
          var height = Math.max(1, Math.abs(zone.toY - zone.fromY));
          ctx.beginPath();
          ctx.moveTo(left, top);
          ctx.lineTo(left + width, top);
          ctx.lineTo(left + width, top + height);
          ctx.lineTo(left, top + height);
          ctx.lineTo(left, top);
          ctx.fillStyle = zone.fill;
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(left, zone.toY);
          ctx.lineTo(left + width, zone.toY);
          ctx.strokeStyle = zone.edge;
          ctx.lineWidth = Math.max(1, ratioX);
          if (ctx.setLineDash) ctx.setLineDash([4 * ratioX, 3 * ratioX]);
          ctx.stroke();
          if (ctx.setLineDash) ctx.setLineDash([]);
        });

        ctx.beginPath();
        ctx.moveTo(left, entryY);
        ctx.lineTo(left + width, entryY);
        ctx.strokeStyle = opts.borderColor;
        ctx.lineWidth = Math.max(1, opts.borderWidth * ratioX);
        ctx.stroke();
        ctx.globalAlpha = 1;

        if (shouldRenderObjectDescriptions(source)) {
          var points = source._points;
          var reward = direction === 'short' ? points[0].price - points[1].price : points[1].price - points[0].price;
          var stopPrice = coords.stopPrice;
          var risk = direction === 'short' ? stopPrice - points[0].price : points[0].price - stopPrice;
          var labelX = left + 6 * ratioX;
          drawPositionBubble(ctx, labelX, entryY, positionLabelText(source), opts.labelBackgroundColor, opts.labelTextColor, ratioX);
          drawPositionBubble(
            ctx,
            labelX,
            (entryY + targetY) / 2,
            'Target ' + formatPositionPlanPrice(points[1].price, source.series) + ' (' + formatDelta(reward) + ')',
            opts.rewardLabelBackgroundColor,
            '#D1FAE5',
            ratioX
          );
          drawPositionBubble(
            ctx,
            labelX,
            (entryY + stopY) / 2,
            'Stop ' + formatPositionPlanPrice(stopPrice, source.series) + ' (' + formatDelta(-risk) + ')',
            opts.riskLabelBackgroundColor,
            '#FFE4E6',
            ratioX
          );
        }

        if (opts.selected || opts.hovered) {
          var radius = (opts.selected ? 5 : 4) * ratioX;
          ctx.fillStyle = '#FFFFFF';
          ctx.strokeStyle = opts.borderColor;
          ctx.lineWidth = Math.max(1, 1.5 * ratioX);
          [
            { x: coords.entryX * ratioX, y: entryY },
            { x: coords.targetX * ratioX, y: targetY }
          ].forEach(function (handle) {
            ctx.beginPath();
            ctx.arc(handle.x, handle.y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          });
        }
        ctx.restore();
      });
    };

    function PositionPaneView(source) {
      this._source = source;
      this._coords = null;
    }

    PositionPaneView.prototype.update = function () {
      var source = this._source;
      var series = source.series;
      var chart = source.chart;
      var points = source._points;
      if (!points[0] || !points[1]) {
        this._coords = null;
        source._coords = null;
        return;
      }
      var stopPrice = resolvePositionPlanStop(points[0].price, points[1].price, source._options.plan.stopPrice, direction);
      this._coords = {
        entryX: resolveCoordinateFromTime(chart, series, points[0].time),
        entryY: series.priceToCoordinate(points[0].price),
        targetX: resolveCoordinateFromTime(chart, series, points[1].time),
        targetY: series.priceToCoordinate(points[1].price),
        stopY: isFiniteNumber(stopPrice) ? series.priceToCoordinate(stopPrice) : null,
        stopPrice: stopPrice
      };
      source._coords = this._coords;
    };

    PositionPaneView.prototype.renderer = function () {
      return new PositionPaneRenderer(this._source, this._coords);
    };

    function RiskRewardPositionPrimitive(points, opts) {
      PrimitiveBase.call(this);
      this._points = clonePoints(points);
      var source = opts && typeof opts === 'object' ? opts : {};
      this._options = {
        hovered: !!source.hovered,
        selected: !!source.selected,
        visible: source.visible === false || source.hidden === true ? false : true,
        fillColor: style.fillColor,
        borderColor: style.borderColor,
        borderWidth: style.borderWidth,
        borderStyle: style.borderStyle,
        opacity: style.opacity,
        labelBackgroundColor: style.labelBackgroundColor,
        labelTextColor: style.labelTextColor,
        rewardFillColor: typeof source.style === 'object' && source.style && typeof source.style.rewardFillColor === 'string'
          ? source.style.rewardFillColor
          : 'rgba(16, 185, 129, 0.16)',
        riskFillColor: typeof source.style === 'object' && source.style && typeof source.style.riskFillColor === 'string'
          ? source.style.riskFillColor
          : 'rgba(244, 63, 94, 0.16)',
        rewardEdgeColor: '#10B981',
        riskEdgeColor: '#F43F5E',
        rewardLabelBackgroundColor: 'rgba(6, 95, 70, 0.92)',
        riskLabelBackgroundColor: 'rgba(127, 29, 29, 0.92)',
        plan: resolvePositionPlanConfig(source)
      };
      this._coords = null;
      this._paneViews = [new PositionPaneView(this)];
    }

    RiskRewardPositionPrimitive.prototype = Object.create(PrimitiveBase.prototype);
    RiskRewardPositionPrimitive.prototype.constructor = RiskRewardPositionPrimitive;
    RiskRewardPositionPrimitive.prototype.updateAllViews = function () {
      this._paneViews.forEach(function (view) { view.update(); });
    };
    RiskRewardPositionPrimitive.prototype.paneViews = function () {
      return this._paneViews;
    };
    RiskRewardPositionPrimitive.prototype.setVisible = function (visible) {
      this._options.visible = !!visible;
      this.requestUpdate();
    };
    RiskRewardPositionPrimitive.prototype.setSelected = function (selected) {
      this._options.selected = !!selected;
      this.requestUpdate();
    };
    RiskRewardPositionPrimitive.prototype.setHovered = function (hovered) {
      this._options.hovered = !!hovered;
      this.requestUpdate();
    };
    RiskRewardPositionPrimitive.prototype.setPoints = function (points) {
      this._points = clonePoints(points);
      this.requestUpdate();
    };
    RiskRewardPositionPrimitive.prototype.updatePoints = function () {
      var args = Array.prototype.slice.call(arguments);
      if (args.length === 1 && Array.isArray(args[0])) {
        this._points = clonePoints(args[0]);
      } else if (args.length > 0) {
        this._points = clonePoints(args);
      }
      this.requestUpdate();
    };
    RiskRewardPositionPrimitive.prototype.getPoints = function () {
      return clonePoints(this._points);
    };
    RiskRewardPositionPrimitive.prototype.getGeometry = function () {
      this.updateAllViews();
      return { coords: this._coords ? [this._coords] : [] };
    };
    RiskRewardPositionPrimitive.prototype.hitTest = function (point, context) {
      this.updateAllViews();
      var coords = this._coords;
      if (!coords || !isFiniteNumber(coords.entryX) || !isFiniteNumber(coords.entryY) ||
          !isFiniteNumber(coords.targetX) || !isFiniteNumber(coords.targetY)) {
        return null;
      }
      var isTouch = context && context.isTouch;
      var handleThreshold = isTouch ? 20 : 10;
      var bodyPadding = isTouch ? 8 : 4;
      if (distanceToPositionPoint(point, { x: coords.entryX, y: coords.entryY }) <= handleThreshold) return { part: 'p1' };
      if (distanceToPositionPoint(point, { x: coords.targetX, y: coords.targetY }) <= handleThreshold) return { part: 'p2' };
      var left = Math.min(coords.entryX, coords.targetX) - bodyPadding;
      var right = Math.max(coords.entryX, coords.targetX) + bodyPadding;
      var yValues = [coords.entryY, coords.targetY];
      if (isFiniteNumber(coords.stopY)) yValues.push(coords.stopY);
      var top = Math.min.apply(null, yValues) - bodyPadding;
      var bottom = Math.max.apply(null, yValues) + bodyPadding;
      if (point.x >= left && point.x <= right && point.y >= top && point.y <= bottom) return { part: 'body' };
      return null;
    };
    RiskRewardPositionPrimitive.prototype.buildEditPoints = function (part, originalPoints, startPoint, editPoint) {
      if (!Array.isArray(originalPoints) || !editPoint) return null;
      if (part === 'p1' || part === 'p2') {
        var next = clonePoints(originalPoints);
        next[part === 'p1' ? 0 : 1] = clonePoint(editPoint);
        return next;
      }
      return null;
    };
    return new RiskRewardPositionPrimitive(pointList, record);
  }

  /**
   * Registers this drawing tool with the global drawing manager so it can be instantiated by the chart.
   */
  registerEnhancedDrawingTool({
    kind: 'prediction',
    defaultLabel: 'Position',
    requiredPointCount: 2,
    createTool: function (chart, series, manager) {
      return new BoxTool('prediction', chart, series, manager, {
        fillColor: 'rgba(16, 185, 129, 0.15)',
        previewFillColor: 'rgba(16, 185, 129, 0.08)',
        borderColor: '#10B981',
        borderWidth: 1.4,
        borderStyle: 'solid',
        opacity: 1,
        labelBuilder: buildLongPositionLabel,
        labelBackgroundColor: 'rgba(6, 95, 70, 0.92)',
        labelTextColor: '#D1FAE5'
      });
    },
    createPrimitiveFromRecord: function (record) {
      var points = record.points || [];
      return createRiskRewardPositionPrimitive(points, record, 'long');
    }
  });
`,
};
