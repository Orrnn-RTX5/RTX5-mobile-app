import type { EnhancedDrawingToolRuntime } from '../types';

export const fibZoneEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'fib',
  script: `
  /**
   * Helper function: normalizeFibExtendMode.
   */
  function normalizeFibExtendMode(value) {
    return value === 'left' || value === 'right' || value === 'both' ? value : 'none';
  }

  /**
   * Normalizes the style configuration for the drawing tool, providing defaults for missing values.
   */
  function normalizeFibLineStyle(value) {
    return value === 'dashed' || value === 'dotted' ? value : 'solid';
  }

  /**
   * Helper function: fibDashPattern.
   */
  function fibDashPattern(style, ratio) {
    var px = Math.max(1, ratio || 1);
    if (style === 'dashed') return [7 * px, 5 * px];
    if (style === 'dotted') return [2 * px, 5 * px];
    return [];
  }

  /**
   * Helper function: calculateFibPrice.
   */
  function calculateFibPrice(anchorA, anchorB, levelValue) {
    return anchorA.price + ((anchorB.price - anchorA.price) * levelValue);
  }

  /**
   * Helper function: createDefaultFibLevels.
   */
  function createDefaultFibLevels() {
    var values = [
      [0, '0', '0%'],
      [0.236, '0.236', '23.6%'],
      [0.382, '0.382', '38.2%'],
      [0.5, '0.5', '50%'],
      [0.618, '0.618', '61.8%'],
      [0.786, '0.786', '78.6%'],
      [1, '1', '100%']
    ];
    return values.map(function (entry, index) {
      var value = entry[0];
      var baseColor = value === 0 || value === 1 ? '#2962FF' : '#64748B';
      return {
        id: 'fib_' + String(value).replace('-', 'neg_').replace('.', '_'),
        value: value,
        visible: true,
        label: entry[1],
        color: baseColor,
        lineColor: baseColor,
        lineWidth: value === 0 || value === 1 ? 1.4 : 1,
        lineStyle: 'solid',
        fillColor: index % 2 === 0 ? 'rgba(100, 116, 139, 0.06)' : 'rgba(41, 98, 255, 0.05)',
        fillOpacity: 0.1,
        showPrice: true,
        showPercent: true
      };
    });
  }

  /**
   * Helper function: normalizeFibLevel.
   */
  function normalizeFibLevel(level, fallbackIndex) {
    var defaults = createDefaultFibLevels();
    var fallback = defaults[Math.min(defaults.length - 1, Math.max(0, fallbackIndex || 0))];
    var source = level && typeof level === 'object' ? level : {};
    var value = isFiniteNumber(source.value) ? source.value : fallback.value;
    var label = typeof source.label === 'string' && source.label.length ? source.label : fallback.label;
    return {
      id: typeof source.id === 'string' && source.id ? source.id : fallback.id,
      value: value,
      visible: source.visible === false ? false : true,
      label: label,
      color: typeof source.color === 'string' ? source.color : fallback.color,
      lineColor: typeof source.lineColor === 'string' ? source.lineColor : fallback.lineColor,
      lineWidth: isFiniteNumber(source.lineWidth) ? Math.max(1, Math.min(5, source.lineWidth)) : fallback.lineWidth,
      lineStyle: normalizeFibLineStyle(source.lineStyle || fallback.lineStyle),
      fillColor: typeof source.fillColor === 'string' ? source.fillColor : fallback.fillColor,
      fillOpacity: isFiniteNumber(source.fillOpacity) ? Math.max(0, Math.min(0.6, source.fillOpacity)) : fallback.fillOpacity,
      showPrice: source.showPrice === false ? false : true,
      showPercent: source.showPercent === false ? false : true
    };
  }

  /**
   * Helper function: normalizeFibLevels.
   */
  function normalizeFibLevels(levels) {
    var source = Array.isArray(levels) && levels.length ? levels : createDefaultFibLevels();
    return source
      .map(function (level, index) { return normalizeFibLevel(level, index); })
      .filter(function (level) { return isFiniteNumber(level.value); });
  }

  /**
   * Normalizes the style configuration for the drawing tool, providing defaults for missing values.
   */
  function normalizeFibStyle(style, draft) {
    var source = style && typeof style === 'object' ? style : {};
    return {
      lineColor: typeof source.lineColor === 'string' ? source.lineColor : '#787B86',
      textColor: typeof source.textColor === 'string' ? source.textColor : '#D1D5DB',
      fontSize: isFiniteNumber(source.fontSize) ? Math.max(9, Math.min(14, source.fontSize)) : 11,
      lineWidth: isFiniteNumber(source.lineWidth) ? Math.max(1, Math.min(4, source.lineWidth)) : 1,
      lineStyle: normalizeFibLineStyle(source.lineStyle),
      anchorLineColor: typeof source.anchorLineColor === 'string' ? source.anchorLineColor : '#2962FF',
      anchorLineWidth: isFiniteNumber(source.anchorLineWidth) ? Math.max(1, Math.min(4, source.anchorLineWidth)) : 1,
      anchorLineStyle: normalizeFibLineStyle(source.anchorLineStyle || 'dashed'),
      fillOpacity: isFiniteNumber(source.fillOpacity) ? Math.max(0, Math.min(0.5, source.fillOpacity)) : (draft ? 0.08 : 0.14),
      labelBackground: typeof source.labelBackground === 'string' ? source.labelBackground : 'rgba(15, 23, 42, 0.84)',
      labelTextColor: typeof source.labelTextColor === 'string' ? source.labelTextColor : '#FFFFFF',
      showLevelLabels: source.showLevelLabels === false ? false : true,
      showPriceLabels: source.showPriceLabels === false ? false : true,
      showPercentLabels: source.showPercentLabels === false ? false : true,
      showZoneFills: source.showZoneFills === false ? false : true,
      showAnchorLine: source.showAnchorLine === false ? false : true,
      showHandles: source.showHandles === false ? false : true,
      handleSize: isFiniteNumber(source.handleSize) ? Math.max(4, Math.min(10, source.handleSize)) : 6,
      selectedHandleSize: isFiniteNumber(source.selectedHandleSize) ? Math.max(6, Math.min(14, source.selectedHandleSize)) : 8,
      handleColor: typeof source.handleColor === 'string' ? source.handleColor : '#2962FF',
      selectedColor: typeof source.selectedColor === 'string' ? source.selectedColor : '#2962FF',
      hoverColor: typeof source.hoverColor === 'string' ? source.hoverColor : '#5B9DFF',
      labelPosition: source.labelPosition === 'left' || source.labelPosition === 'inside' || source.labelPosition === 'outside' ? source.labelPosition : 'right',
      avoidLabelOverlap: source.avoidLabelOverlap === false ? false : true
    };
  }

  /**
   * Helper function: normalizeFibZoneConfig.
   */
  function normalizeFibZoneConfig(config, fallback) {
    var source = config && typeof config === 'object' ? config : {};
    return {
      enabled: source.enabled === false ? false : fallback.enabled,
      from: isFiniteNumber(source.from) ? source.from : fallback.from,
      to: isFiniteNumber(source.to) ? source.to : fallback.to,
      color: typeof source.color === 'string' ? source.color : fallback.color,
      label: typeof source.label === 'string' ? source.label : fallback.label,
      showLabel: source.showLabel === false ? false : fallback.showLabel
    };
  }

  /**
   * Helper function: normalizeFibRecord.
   */
  function normalizeFibRecord(record, draft) {
    var source = record && typeof record === 'object' ? record : {};
    return {
      type: 'fibRetracement',
      paneId: typeof source.paneId === 'string' ? source.paneId : 'main',
      levels: normalizeFibLevels(source.levels),
      style: normalizeFibStyle(source.style, draft),
      extendMode: normalizeFibExtendMode(source.extendMode),
      reverse: !!source.reverse,
      locked: !!source.locked,
      visible: source.visible === false || source.hidden === true ? false : true,
      selected: !!source.selected,
      goldenPocket: normalizeFibZoneConfig(source.goldenPocket, {
        enabled: false,
        from: 0.618,
        to: 0.65,
        color: 'rgba(245, 158, 11, 0.22)',
        label: 'Golden Pocket',
        showLabel: true
      }),
      oteZone: normalizeFibZoneConfig(source.oteZone, {
        enabled: false,
        from: 0.62,
        to: 0.79,
        color: 'rgba(33, 150, 243, 0.12)',
        label: 'OTE',
        showLabel: true
      })
    };
  }

  /**
   * Helper function: buildFibLabel.
   */
  function buildFibLabel(level, price, style, series) {
    var parts = [];
    if (style.showLevelLabels && level.label) parts.push(level.label);
    if (style.showPercentLabels && level.showPercent) parts.push((level.value * 100).toFixed(level.value % 1 === 0 ? 0 : 1) + '%');
    if (style.showPriceLabels && level.showPrice) parts.push(formatCrosshairPrice(series, price));
    return parts.join(' ');
  }

  /**
   * Helper function: resolveFibRenderRange.
   */
  function resolveFibRenderRange(p1, p2, extendMode, paneWidth) {
    var left = Math.min(p1.x, p2.x);
    var right = Math.max(p1.x, p2.x);
    var mode = normalizeFibExtendMode(extendMode);
    if (mode === 'left' || mode === 'both') left = 0;
    if (mode === 'right' || mode === 'both') right = Math.max(right, paneWidth);
    if (right < left) {
      var tmp = left;
      left = right;
      right = tmp;
    }
    return { left: left, right: Math.max(left + 1, right) };
  }

  /**
   * Helper function: drawFibHandle.
   */
  function drawFibHandle(ctx, x, y, radius, fill, stroke, ratio) {
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1, 2 * ratio);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  /**
   * Helper function: distanceToFibPoint.
   */
  function distanceToFibPoint(a, b) {
    if (!a || !b || !isFiniteNumber(a.x) || !isFiniteNumber(a.y) || !isFiniteNumber(b.x) || !isFiniteNumber(b.y)) return Number.POSITIVE_INFINITY;
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt((dx * dx) + (dy * dy));
  }

  /**
   * Helper function: distanceToFibSegment.
   */
  function distanceToFibSegment(point, a, b) {
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var lengthSquared = (dx * dx) + (dy * dy);
    if (lengthSquared <= 0.0001) return distanceToFibPoint(point, a);
    var t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
    return distanceToFibPoint(point, { x: a.x + (t * dx), y: a.y + (t * dy) });
  }

  /**
   * Creates the visual primitive object that gets rendered on the chart canvas.
   */
  function createFibZonePrimitive(anchorA, anchorB, record, draft) {
  /**
   * Helper function: FibZonePaneRenderer.
   */
    function FibZonePaneRenderer(source, geometry) {
      this._source = source;
      this._geometry = geometry;
    }

  /**
   * Helper function: _drawSpecialZone.
   */
    FibZonePaneRenderer.prototype._drawSpecialZone = function (ctx, scope, config, labelText, p1, p2, range, style) {
      if (!config || !config.enabled) return;
      var fromPrice = calculateFibPrice(p1, p2, config.from);
      var toPrice = calculateFibPrice(p1, p2, config.to);
      var fromY = this._source.series.priceToCoordinate(fromPrice);
      var toY = this._source.series.priceToCoordinate(toPrice);
      if (!isFiniteNumber(fromY) || !isFiniteNumber(toY)) return;
      var ratioX = scope.horizontalPixelRatio || 1;
      var ratioY = scope.verticalPixelRatio || 1;
      var bitmapHeight = (scope.bitmapSize && scope.bitmapSize.height) || Math.max(fromY, toY, 1) * ratioY;
      var top = Math.max(0, Math.min(fromY, toY)) * ratioY;
      var bottom = Math.min(bitmapHeight, Math.max(fromY, toY) * ratioY);
      if (!(bottom > top)) return;
      ctx.fillStyle = config.color;
      ctx.fillRect(range.left * ratioX, top, Math.max(1, (range.right - range.left) * ratioX), bottom - top);
      if (shouldRenderObjectDescriptions(this._source) && config.showLabel && labelText) {
        ctx.font = '700 ' + Math.round(style.fontSize * ratioX) + 'px Arial';
        var padding = 5 * ratioX;
        var textWidth = ctx.measureText(labelText).width;
        var labelHeight = style.fontSize * ratioY + padding * 1.35;
        var labelX = Math.max(2 * ratioX, Math.min((range.right * ratioX) - textWidth - padding * 2, (range.left * ratioX) + padding));
        var labelY = Math.max(2 * ratioY, top + padding);
        roundRectPath(ctx, labelX, labelY, textWidth + padding * 2, labelHeight, 5 * ratioX);
        ctx.fillStyle = style.labelBackground;
        ctx.fill();
        ctx.fillStyle = style.labelTextColor;
        ctx.fillText(labelText, labelX + padding, labelY + labelHeight - padding * 0.65);
      }
    };

  /**
   * Helper function: draw.
   */
    FibZonePaneRenderer.prototype.draw = function (target) {
      var source = this._source;
      var geometry = this._geometry;
      if (!source._options.visible || !geometry || !geometry.p1 || !geometry.p2 || !isFiniteNumber(geometry.p1.x) || !isFiniteNumber(geometry.p1.y) || !isFiniteNumber(geometry.p2.x) || !isFiniteNumber(geometry.p2.y)) return;
      var renderer = this;
      target.useBitmapCoordinateSpace(function (scope) {
        var ctx = scope.context;
        var ratioX = scope.horizontalPixelRatio || 1;
        var ratioY = scope.verticalPixelRatio || 1;
        var paneWidth = ((scope.bitmapSize && scope.bitmapSize.width) || Math.max(geometry.p1.x, geometry.p2.x, 1)) / ratioX;
        var paneHeight = ((scope.bitmapSize && scope.bitmapSize.height) || Math.max(geometry.p1.y, geometry.p2.y, 1)) / ratioY;
        var range = resolveFibRenderRange(geometry.p1, geometry.p2, source._options.extendMode, paneWidth);
        source._geometry.range = range;

        ctx.save();
        if (ctx.rect && ctx.clip) {
          ctx.beginPath();
          ctx.rect(0, 0, Math.max(1, paneWidth * ratioX), Math.max(1, paneHeight * ratioY));
          ctx.clip();
        }

        var levels = geometry.levels.filter(function (level) {
          return level.visible && isFiniteNumber(level.y);
        });
        levels.sort(function (a, b) { return a.y - b.y; });

        if (source._options.style.showZoneFills) {
          for (var i = 0; i < levels.length - 1; i += 1) {
            var upper = levels[i];
            var lower = levels[i + 1];
            var top = Math.max(0, upper.y);
            var bottom = Math.min(paneHeight, lower.y);
            if (!(bottom > top)) continue;
            ctx.globalAlpha = Math.max(0, Math.min(0.6, lower.fillOpacity * source._options.style.fillOpacity * 6));
            ctx.fillStyle = lower.fillColor;
            ctx.fillRect(range.left * ratioX, top * ratioY, Math.max(1, (range.right - range.left) * ratioX), Math.max(1, (bottom - top) * ratioY));
          }
          ctx.globalAlpha = 1;
        }

        renderer._drawSpecialZone(ctx, scope, source._options.goldenPocket, source._options.goldenPocket.label, source._p1, source._p2, range, source._options.style);
        renderer._drawSpecialZone(ctx, scope, source._options.oteZone, source._options.oteZone.label, source._p1, source._p2, range, source._options.style);

        levels.forEach(function (entry) {
          var y = Math.round(entry.y * ratioY);
          ctx.save();
          ctx.strokeStyle = source._options.selected ? source._options.style.selectedColor : entry.lineColor;
          ctx.lineWidth = Math.max(1, entry.lineWidth * ratioX);
          if (ctx.setLineDash) ctx.setLineDash(fibDashPattern(entry.lineStyle, ratioX));
          ctx.beginPath();
          ctx.moveTo(Math.round(range.left * ratioX), y);
          ctx.lineTo(Math.round(range.right * ratioX), y);
          ctx.stroke();
          ctx.restore();
        });

        if (source._options.style.showAnchorLine) {
          ctx.save();
          ctx.strokeStyle = source._options.style.anchorLineColor;
          ctx.lineWidth = Math.max(1, source._options.style.anchorLineWidth * ratioX);
          if (ctx.setLineDash) ctx.setLineDash(fibDashPattern(source._options.style.anchorLineStyle, ratioX));
          ctx.beginPath();
          ctx.moveTo(Math.round(geometry.p1.x * ratioX), Math.round(geometry.p1.y * ratioY));
          ctx.lineTo(Math.round(geometry.p2.x * ratioX), Math.round(geometry.p2.y * ratioY));
          ctx.stroke();
          ctx.restore();
        }

        if (shouldRenderObjectDescriptions(source) && source._options.style.showLevelLabels) {
          var labelGap = 2 * ratioY;
          var labelLayouts = [];
          levels.forEach(function (entry) {
            var text = buildFibLabel(entry, entry.price, source._options.style, source.series);
            if (!text) return;
            var fontSize = Math.round(source._options.style.fontSize * ratioX);
            var padding = 5 * ratioX;
            var y = Math.round(entry.y * ratioY);
            ctx.font = '700 ' + fontSize + 'px Arial';
            var textWidth = ctx.measureText(text).width;
            var labelWidth = textWidth + padding * 2;
            var labelHeight = fontSize + padding * 1.5;
            var labelX = source._options.style.labelPosition === 'left'
              ? range.left * ratioX + padding
              : range.right * ratioX - labelWidth - padding;
            labelX = Math.max(2 * ratioX, Math.min((paneWidth * ratioX) - labelWidth - 2 * ratioX, labelX));
            var minLabelY = 2 * ratioY;
            var maxLabelY = Math.max(minLabelY, (paneHeight * ratioY) - labelHeight - 2 * ratioY);
            var labelY = Math.max(minLabelY, Math.min(maxLabelY, y - labelHeight / 2));
            if (source._options.style.avoidLabelOverlap && labelLayouts.length) {
              var previous = labelLayouts[labelLayouts.length - 1];
              labelY = Math.max(labelY, previous.labelY + previous.labelHeight + labelGap);
            }
            labelLayouts.push({
              fontSize: fontSize,
              labelHeight: labelHeight,
              labelWidth: labelWidth,
              labelX: labelX,
              labelY: labelY,
              padding: padding,
              text: text
            });
          });
          if (source._options.style.avoidLabelOverlap && labelLayouts.length) {
            var lastLayout = labelLayouts[labelLayouts.length - 1];
            var overflow = (lastLayout.labelY + lastLayout.labelHeight + 2 * ratioY) - (paneHeight * ratioY);
            if (overflow > 0) {
              labelLayouts.forEach(function (layout) {
                layout.labelY -= overflow;
              });
              for (var labelIndex = labelLayouts.length - 2; labelIndex >= 0; labelIndex -= 1) {
                var nextLayout = labelLayouts[labelIndex + 1];
                var currentLayout = labelLayouts[labelIndex];
                currentLayout.labelY = Math.min(currentLayout.labelY, nextLayout.labelY - currentLayout.labelHeight - labelGap);
              }
              var underflow = (2 * ratioY) - labelLayouts[0].labelY;
              if (underflow > 0) {
                labelLayouts.forEach(function (layout) {
                  layout.labelY += underflow;
                });
              }
            }
          }
          labelLayouts.forEach(function (layout) {
            roundRectPath(ctx, layout.labelX, layout.labelY, layout.labelWidth, layout.labelHeight, 5 * ratioX);
            ctx.fillStyle = source._options.style.labelBackground;
            ctx.fill();
            ctx.fillStyle = source._options.style.labelTextColor;
            ctx.fillText(layout.text, layout.labelX + layout.padding, layout.labelY + layout.labelHeight - layout.padding * 0.7);
          });
        }

        if (source._options.selected || source._options.draft || source._options.style.showHandles) {
          var radius = (source._options.selected ? source._options.style.selectedHandleSize : source._options.style.handleSize) * ratioX / 2;
          drawFibHandle(ctx, geometry.p1.x * ratioX, geometry.p1.y * ratioY, radius, '#FFFFFF', source._options.style.handleColor, ratioX);
          drawFibHandle(ctx, geometry.p2.x * ratioX, geometry.p2.y * ratioY, radius, '#FFFFFF', source._options.style.handleColor, ratioX);
        }
        ctx.restore();
      });
    };

  /**
   * Helper function: FibZonePaneView.
   */
    function FibZonePaneView(source) {
      this._source = source;
      this._geometry = { p1: null, p2: null, levels: [], range: null };
    }

  /**
   * Helper function: update.
   */
    FibZonePaneView.prototype.update = function () {
      var series = this._source.series;
      var p1 = {
        x: resolveCoordinateFromTime(this._source.chart, series, this._source._p1.time),
        y: series.priceToCoordinate(this._source._p1.price)
      };
      var p2 = {
        x: resolveCoordinateFromTime(this._source.chart, series, this._source._p2.time),
        y: series.priceToCoordinate(this._source._p2.price)
      };
      var levels = this._source._options.levels.map(function (level) {
        var price = calculateFibPrice(this._source._p1, this._source._p2, level.value);
        return Object.assign({}, level, {
          price: price,
          y: series.priceToCoordinate(price)
        });
      }, this);
      this._geometry = { p1: p1, p2: p2, levels: levels, range: this._source._geometry ? this._source._geometry.range : null };
      this._source._geometry = this._geometry;
    };

  /**
   * Helper function: renderer.
   */
    FibZonePaneView.prototype.renderer = function () {
      return new FibZonePaneRenderer(this._source, this._geometry);
    };

  /**
   * Helper function: FibZonePrimitive.
   */
    function FibZonePrimitive(pointA, pointB, opts) {
      PrimitiveBase.call(this);
      this._p1 = clonePoint(pointA);
      this._p2 = clonePoint(pointB);
      this._options = Object.assign(normalizeFibRecord(opts, draft), {
        draft: !!draft
      });
      this._geometry = null;
      this._paneViews = [new FibZonePaneView(this)];
    }

    FibZonePrimitive.prototype = Object.create(PrimitiveBase.prototype);
    FibZonePrimitive.prototype.constructor = FibZonePrimitive;
  /**
   * Helper function: updateAllViews.
   */
    FibZonePrimitive.prototype.updateAllViews = function () {
      this._paneViews.forEach(function (view) { view.update(); });
    };
  /**
   * Helper function: paneViews.
   */
    FibZonePrimitive.prototype.paneViews = function () {
      return this._paneViews;
    };
  /**
   * Helper function: setVisible.
   */
    FibZonePrimitive.prototype.setVisible = function (visible) {
      this._options.visible = !!visible;
      this.requestUpdate();
    };
  /**
   * Helper function: setSelected.
   */
    FibZonePrimitive.prototype.setSelected = function (selected) {
      this._options.selected = !!selected;
      this.requestUpdate();
    };
  /**
   * Helper function: updatePoints.
   */
    FibZonePrimitive.prototype.updatePoints = function (pointA, pointB) {
      this._p1 = clonePoint(pointA);
      this._p2 = clonePoint(pointB);
      this.requestUpdate();
    };
  /**
   * Helper function: getPoints.
   */
    FibZonePrimitive.prototype.getPoints = function () {
      return clonePoints([this._p1, this._p2]);
    };
  /**
   * Helper function: getLevelPrices.
   */
    FibZonePrimitive.prototype.getLevelPrices = function () {
      return this._options.levels.map(function (level) {
        return {
          id: level.id,
          value: level.value,
          price: calculateFibPrice(this._p1, this._p2, level.value)
        };
      }, this);
    };
  /**
   * Helper function: hitTest.
   */
    FibZonePrimitive.prototype.hitTest = function (point, context) {
      this.updateAllViews();
      var geometry = this._geometry;
      if (!geometry || !geometry.p1 || !geometry.p2 || !isFiniteNumber(geometry.p1.x) || !isFiniteNumber(geometry.p1.y) || !isFiniteNumber(geometry.p2.x) || !isFiniteNumber(geometry.p2.y)) {
        return null;
      }
      var isTouch = context && context.isTouch;
      var handleThreshold = isTouch ? 20 : 10;
      var lineThreshold = isTouch ? 14 : 7;
      if (distanceToFibPoint(point, geometry.p1) <= handleThreshold) return { part: 'p1' };
      if (distanceToFibPoint(point, geometry.p2) <= handleThreshold) return { part: 'p2' };
      var range = geometry.range || {
        left: Math.min(geometry.p1.x, geometry.p2.x),
        right: Math.max(geometry.p1.x, geometry.p2.x)
      };
      var visibleLevels = geometry.levels.filter(function (level) { return level.visible && isFiniteNumber(level.y); });
      var minY = Number.POSITIVE_INFINITY;
      var maxY = Number.NEGATIVE_INFINITY;
      for (var i = 0; i < visibleLevels.length; i += 1) {
        minY = Math.min(minY, visibleLevels[i].y);
        maxY = Math.max(maxY, visibleLevels[i].y);
        if (point.x >= range.left && point.x <= range.right && Math.abs(point.y - visibleLevels[i].y) <= lineThreshold) {
          return { part: 'body' };
        }
      }
      if (point.x >= range.left && point.x <= range.right && point.y >= minY - lineThreshold && point.y <= maxY + lineThreshold) {
        return { part: 'body' };
      }
      if (distanceToFibSegment(point, geometry.p1, geometry.p2) <= lineThreshold) return { part: 'body' };
      return null;
    };
    return new FibZonePrimitive(anchorA, anchorB, record, draft);
  }

  /**
   * Builds a serialized record object representing the current state of the drawing tool for persistence.
   */
  function buildFibZoneRecord(points, style, levels, extendMode) {
    var now = Date.now();
    return {
      type: 'fibRetracement',
      paneId: 'main',
      points: clonePoints(points.slice(0, 2)),
      levels: normalizeFibLevels(levels),
      style: normalizeFibStyle(style, false),
      extendMode: normalizeFibExtendMode(extendMode),
      reverse: false,
      locked: false,
      visible: true,
      selected: false,
      goldenPocket: normalizeFibZoneConfig(null, {
        enabled: false,
        from: 0.618,
        to: 0.65,
        color: 'rgba(245, 158, 11, 0.22)',
        label: 'Golden Pocket',
        showLabel: true
      }),
      oteZone: normalizeFibZoneConfig(null, {
        enabled: false,
        from: 0.62,
        to: 0.79,
        color: 'rgba(33, 150, 243, 0.12)',
        label: 'OTE',
        showLabel: true
      }),
      createdAt: now,
      updatedAt: now
    };
  }

  /**
   * Constructor function for the drawing tool class, initializing its state and event listeners.
   */
  function FibZoneTool(chart, series, manager) {
    BaseTool.call(this, 'fib', chart, series, manager);
    this._points = [];
    this._preview = null;
    this._style = normalizeFibStyle(null, false);
    this._levels = createDefaultFibLevels();
    this._extendMode = 'none';
    this._handleClick = this._handleClick.bind(this);
    this._handleMove = this._handleMove.bind(this);
    this._usesNativeChartInput = !manager.shouldUseDirectTouchInput();
    if (this._usesNativeChartInput) {
      this._chart.subscribeClick(this._handleClick);
      this._chart.subscribeCrosshairMove(this._handleMove);
    }
  }

  FibZoneTool.prototype = Object.create(BaseTool.prototype);
  FibZoneTool.prototype.constructor = FibZoneTool;
  /**
   * Initiates the drawing process for the tool.
   */
  FibZoneTool.prototype.startDrawing = function () {
    BaseTool.prototype.startDrawing.call(this);
    this._resetDrawingSession();
  };
  /**
   * Helper function: _resetDrawingSession.
   */
  FibZoneTool.prototype._resetDrawingSession = function () {
    this._points = [];
    this._removePreview();
  };
  /**
   * Terminates the active drawing process and cleans up.
   */
  FibZoneTool.prototype.stopDrawing = function () {
    BaseTool.prototype.stopDrawing.call(this);
    this._resetDrawingSession();
  };
  /**
   * Removes the tool and cleans up associated event listeners.
   */
  FibZoneTool.prototype._removePreview = function () {
    if (this._preview) {
      try { this._series.detachPrimitive(this._preview); } catch (_error) {}
      this._preview = null;
    }
  };
  /**
   * Helper function: _isSamePoint.
   */
  FibZoneTool.prototype._isSamePoint = function (pointA, pointB) {
    return pointA && pointB && pointA.time === pointB.time && pointA.price === pointB.price;
  };
  /**
   * Helper function: _startPreview.
   */
  FibZoneTool.prototype._startPreview = function (point) {
    // Draft and final drawings share the same Fib calculation path, so preview prices match the committed object.
    this._preview = createFibZonePrimitive(point, point, buildFibZoneRecord([point, point], this._style, this._levels, this._extendMode), true);
    this._series.attachPrimitive(this._preview);
  };
  /**
   * Helper function: _completeFibZone.
   */
  FibZoneTool.prototype._completeFibZone = function (secondPoint) {
    var firstPoint = this._points[0];
    if (!firstPoint || !secondPoint || this._isSamePoint(firstPoint, secondPoint)) {
      return;
    }
    var points = [clonePoint(firstPoint), clonePoint(secondPoint)];
    this._removePreview();
    var serialized = buildFibZoneRecord(points, this._style, this._levels, this._extendMode);
    this._completeDrawing(createFibZonePrimitive(points[0], points[1], serialized, false), null, serialized);
  };
  /**
   * Handles click events on the chart to process point placement for the drawing tool.
   */
  FibZoneTool.prototype._handleClick = function (param) {
    if (!this._drawing) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    if (this._points.length === 0) {
      this._points = [clonePoint(point)];
      this._startPreview(this._points[0]);
      return;
    }
    this._completeFibZone(point);
  };
  /**
   * Helper function: _handleMove.
   */
  FibZoneTool.prototype._handleMove = function (param) {
    if (!this._drawing || !this._preview || this._points.length !== 1) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    this._preview.updatePoints(this._points[0], point);
  };
  /**
   * Removes the tool and cleans up associated event listeners.
   */
  FibZoneTool.prototype.remove = function () {
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
    kind: 'fib',
    defaultLabel: 'Fibonacci Retracement',
    requiredPointCount: 2,
    createTool: function (chart, series, manager) {
      return new FibZoneTool(chart, series, manager);
    },
    createPrimitiveFromRecord: function (record) {
      var points = record.points || [];
      return createFibZonePrimitive(points[0], points[1], normalizeFibRecord(record, false), false);
    }
  });
`,
};
