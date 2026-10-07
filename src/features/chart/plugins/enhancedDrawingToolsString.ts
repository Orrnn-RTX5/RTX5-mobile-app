import { ENHANCED_DRAWING_TOOLS_RUNTIME_JS } from '../drawingTools/runtime';

export const ENHANCED_DRAWING_TOOLS_JS = `
(function () {
  function safeNotify(type, payload) {
    try {
      if (!window.ReactNativeWebView || typeof window.ReactNativeWebView.postMessage !== 'function') return;
      var message = payload && typeof payload === 'object'
        ? Object.assign({ type: type }, payload)
        : { type: type };
      if (typeof window.__rtx5ChartWindowPaneId === 'string' && window.__rtx5ChartWindowPaneId) {
        message.chartWindowPaneId = window.__rtx5ChartWindowPaneId;
      }
      window.ReactNativeWebView.postMessage(JSON.stringify(message));
    } catch (_error) {}
  }

  function clampNumber(value, fallback) {
    return typeof value === 'number' && isFinite(value) ? value : fallback;
  }

  function isFiniteNumber(value) {
    return typeof value === 'number' && isFinite(value);
  }

  function distanceBetweenPoints(a, b) {
    if (!a || !b || !isFiniteNumber(a.x) || !isFiniteNumber(a.y) || !isFiniteNumber(b.x) || !isFiniteNumber(b.y)) {
      return Number.POSITIVE_INFINITY;
    }
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt((dx * dx) + (dy * dy));
  }

  function distanceToSegment(point, a, b) {
    if (!point || !a || !b) return Number.POSITIVE_INFINITY;
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var lengthSquared = (dx * dx) + (dy * dy);
    if (lengthSquared <= 0.0001) return distanceBetweenPoints(point, a);
    var t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
    return distanceBetweenPoints(point, {
      x: a.x + (dx * t),
      y: a.y + (dy * t)
    });
  }

  function getSeriesData(series) {
    try {
      return series && typeof series.data === 'function' ? series.data() : [];
    } catch (_error) {
      return [];
    }
  }

  function getPointTimeValue(point) {
    return point && isFiniteNumber(point.time) ? point.time : null;
  }

  function estimateNumericTimeStep(data) {
    if (!Array.isArray(data) || data.length < 2) {
      return 60;
    }

    for (var i = data.length - 1; i > 0; i -= 1) {
      var current = getPointTimeValue(data[i]);
      var previous = getPointTimeValue(data[i - 1]);
      if (current !== null && previous !== null && current > previous) {
        return current - previous;
      }
    }

    return 60;
  }

  function resolveTimeScaleIndex(timeScale, time, fallback) {
    if (!timeScale || typeof timeScale.timeToIndex !== 'function') {
      return fallback;
    }

    try {
      var index = timeScale.timeToIndex(time, true);
      return isFiniteNumber(index) ? index : fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function resolveLogicalFromTime(timeScale, series, time) {
    if (!timeScale) {
      return null;
    }

    var directIndex = resolveTimeScaleIndex(timeScale, time, null);
    var data = getSeriesData(series);
    if (!Array.isArray(data) || data.length === 0) {
      return directIndex;
    }

    var first = data[0];
    var last = data[data.length - 1];
    var firstTime = getPointTimeValue(first);
    var lastTime = getPointTimeValue(last);
    if (firstTime === null || lastTime === null || !isFiniteNumber(time)) {
      return directIndex;
    }

    var firstLogical = resolveTimeScaleIndex(timeScale, first.time, 0);
    var lastLogical = resolveTimeScaleIndex(timeScale, last.time, firstLogical + data.length - 1);
    var step = estimateNumericTimeStep(data);
    if (!isFiniteNumber(step) || step <= 0) {
      step = 60;
    }

    if (time <= firstTime) {
      return firstLogical + ((time - firstTime) / step);
    }

    if (time >= lastTime) {
      return lastLogical + ((time - lastTime) / step);
    }

    for (var i = 1; i < data.length; i += 1) {
      var previous = data[i - 1];
      var current = data[i];
      var previousTime = getPointTimeValue(previous);
      var currentTime = getPointTimeValue(current);
      if (previousTime === null || currentTime === null || currentTime <= previousTime) {
        continue;
      }
      if (time >= previousTime && time <= currentTime) {
        var previousLogical = resolveTimeScaleIndex(timeScale, previous.time, firstLogical + i - 1);
        var currentLogical = resolveTimeScaleIndex(timeScale, current.time, previousLogical + 1);
        var ratio = (time - previousTime) / (currentTime - previousTime);
        return previousLogical + ((currentLogical - previousLogical) * ratio);
      }
    }

    return directIndex;
  }

  function resolveCoordinateFromTime(chart, series, time) {
    if (!chart || typeof chart.timeScale !== 'function') {
      return null;
    }

    var timeScale = chart.timeScale();
    if (!timeScale) {
      return null;
    }

    if (typeof timeScale.timeToCoordinate === 'function') {
      try {
        var direct = timeScale.timeToCoordinate(time);
        if (isFiniteNumber(direct)) {
          return direct;
        }
      } catch (_error) {}
    }

    if (typeof timeScale.logicalToCoordinate === 'function') {
      var logical = resolveLogicalFromTime(timeScale, series, time);
      if (isFiniteNumber(logical)) {
        try {
          var fallback = timeScale.logicalToCoordinate(logical);
          if (isFiniteNumber(fallback)) {
            return fallback;
          }
        } catch (_error) {}
      }
    }

    return null;
  }

  function resolveTimeFromCoordinate(timeScale, series, x) {
    if (!timeScale) {
      return null;
    }

    if (typeof timeScale.coordinateToTime === 'function') {
      try {
        var direct = timeScale.coordinateToTime(x);
        if (direct !== null && direct !== undefined) {
          return direct;
        }
      } catch (_error) {}
    }

    if (typeof timeScale.coordinateToLogical !== 'function') {
      return null;
    }

    var logical = null;
    try {
      logical = timeScale.coordinateToLogical(x);
    } catch (_logicalError) {
      logical = null;
    }

    if (!isFiniteNumber(logical)) {
      return null;
    }

    var data = getSeriesData(series);
    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    var first = data[0];
    var last = data[data.length - 1];
    var firstTime = getPointTimeValue(first);
    var lastTime = getPointTimeValue(last);
    if (firstTime === null || lastTime === null) {
      var nearestIndex = Math.max(0, Math.min(data.length - 1, Math.round(logical)));
      return data[nearestIndex] ? data[nearestIndex].time : null;
    }

    var firstLogical = resolveTimeScaleIndex(timeScale, first.time, 0);
    var lastLogical = resolveTimeScaleIndex(timeScale, last.time, firstLogical + data.length - 1);
    var step = estimateNumericTimeStep(data);
    if (!isFiniteNumber(step) || step <= 0) {
      step = 60;
    }

    if (logical <= firstLogical) {
      return Math.round(firstTime + ((logical - firstLogical) * step));
    }

    if (logical >= lastLogical) {
      return Math.round(lastTime + ((logical - lastLogical) * step));
    }

    var offset = logical - firstLogical;
    var lowerIndex = Math.max(0, Math.min(data.length - 1, Math.floor(offset)));
    var upperIndex = Math.max(0, Math.min(data.length - 1, Math.ceil(offset)));
    var lower = data[lowerIndex];
    var upper = data[upperIndex];
    var lowerTime = getPointTimeValue(lower);
    var upperTime = getPointTimeValue(upper);
    if (lowerTime === null || upperTime === null) {
      return lower ? lower.time : null;
    }

    var ratio = offset - lowerIndex;
    return Math.round(lowerTime + ((upperTime - lowerTime) * ratio));
  }

  function formatCrosshairPrice(series, price) {
    var precision = 5;
    try {
      var options = series && typeof series.options === 'function' ? series.options() : null;
      var nextPrecision = options && options.priceFormat && options.priceFormat.precision;
      if (typeof nextPrecision === 'number' && isFinite(nextPrecision) && nextPrecision >= 0) {
        precision = Math.min(8, Math.round(nextPrecision));
      }
    } catch (_error) {}
    return isFiniteNumber(price) ? price.toFixed(precision) : '';
  }

  function normalizeCrosshairTimeframe(timeframe) {
    return String(timeframe || '').trim().toUpperCase();
  }

  function formatCrosshairTime(time, timeframe) {
    if (isFiniteNumber(time)) {
      var date = new Date(time * 1000);
      if (isFinite(date.getTime())) {
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        var day = String(date.getUTCDate()).padStart(2, '0');
        var hour = String(date.getUTCHours()).padStart(2, '0');
        var minute = String(date.getUTCMinutes()).padStart(2, '0');
        var month = months[date.getUTCMonth()];
        var year = date.getUTCFullYear();
        var tf = normalizeCrosshairTimeframe(timeframe);
        if (tf === '1D' || tf === 'D' || tf === 'DAY') {
          return day + ' ' + month + ' ' + year;
        }
        if (tf === '1W' || tf === 'W' || tf === 'WEEK') {
          return day + ' ' + month + ' ' + year;
        }
        if (tf === '1M' || tf === 'MN' || tf === 'MONTH') {
          return month + ' ' + year;
        }
        if (tf === '1H' || tf === 'H1' || tf === '4H' || tf === 'H4') {
          return day + ' ' + month + ' ' + hour + ':00';
        }
        return day + ' ' + month + ' ' + hour + ':' + minute;
      }
    }

    if (time && typeof time === 'object' && time.year && time.month && time.day) {
      var businessMonth = String(time.month).padStart(2, '0');
      var businessDay = String(time.day).padStart(2, '0');
      var businessFrame = normalizeCrosshairTimeframe(timeframe);
      if (businessFrame === '1M' || businessFrame === 'MN' || businessFrame === 'MONTH') {
        return String(time.year) + '-' + businessMonth;
      }
      return String(time.year) + '-' + businessMonth + '-' + businessDay;
    }

    return String(time || '');
  }

  function formatInspectionTime(time, timeframe) {
    var date = isFiniteNumber(time) ? new Date(time * 1000) : null;
    if (!date && time && typeof time === 'object' && time.year && time.month && time.day) {
      date = new Date(Date.UTC(Number(time.year), Number(time.month) - 1, Number(time.day)));
    }
    if (!date || !isFinite(date.getTime())) return formatCrosshairTime(time, timeframe);
    var weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var text = weekdays[date.getUTCDay()] + ' ' + date.getUTCDate() + ' ' + months[date.getUTCMonth()]
      + " '" + String(date.getUTCFullYear()).slice(-2);
    var frame = normalizeCrosshairTimeframe(timeframe);
    if (/^(?:1D|D1|D|DAY|1W|W1|W|WEEK|1M|MN1|MN|MONTH)$/.test(frame)) return text;
    return text + ' ' + String(date.getUTCHours()).padStart(2, '0') + ':' + String(date.getUTCMinutes()).padStart(2, '0');
  }

  function timeToComparableValue(time) {
    if (isFiniteNumber(time)) {
      return time;
    }
    if (time && typeof time === 'object' && time.year && time.month && time.day) {
      return (Number(time.year) * 10000) + (Number(time.month) * 100) + Number(time.day);
    }
    return null;
  }

  function formatCrosshairPercent(value) {
    return (value >= 0 ? '+' : '') + value.toFixed(2) + '%';
  }

  function formatCrosshairVolume(value) {
    if (!isFiniteNumber(value)) {
      return '';
    }
    var abs = Math.abs(value);
    if (abs >= 1000000000) return (value / 1000000000).toFixed(2) + 'B';
    if (abs >= 1000000) return (value / 1000000).toFixed(2) + 'M';
    if (abs >= 1000) return (value / 1000).toFixed(2) + 'K';
    return String(Math.round(value));
  }

  function roundRectPath(ctx, x, y, width, height, radius) {
    var r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, width, height, r);
      return;
    }
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }

  function formatDuration(seconds) {
    var safe = Math.max(0, Math.round(clampNumber(seconds, 0)));
    if (safe >= 86400) return Math.round(safe / 86400) + 'd';
    if (safe >= 3600) return Math.round(safe / 3600) + 'h';
    if (safe >= 60) return Math.max(1, Math.round(safe / 60)) + 'm';
    return safe + 's';
  }

  function formatInspectionDuration(seconds) {
    var safe = Math.max(0, Math.round(clampNumber(seconds, 0)));
    if (safe < 60) return safe === 0 ? '0m' : safe + 's';
    var minutes = Math.floor(safe / 60);
    var days = Math.floor(minutes / 1440);
    var hours = Math.floor((minutes % 1440) / 60);
    var remainingMinutes = minutes % 60;
    var parts = [];
    if (days) parts.push(days + 'd');
    if (hours) parts.push(hours + 'h');
    if (remainingMinutes) parts.push(remainingMinutes + 'm');
    return parts.join(' ');
  }

  function formatDelta(value) {
    var safe = clampNumber(value, 0);
    var abs = Math.abs(safe);
    var digits = abs >= 100 ? 2 : abs >= 1 ? 4 : 5;
    return (safe >= 0 ? '+' : '') + safe.toFixed(digits);
  }

  var ENHANCED_DRAWING_TOOL_SPECS = [];
  var ENHANCED_DRAWING_TOOL_SPECS_BY_KIND = {};

  function registerEnhancedDrawingTool(spec) {
    if (!spec || !spec.kind) return;
    ENHANCED_DRAWING_TOOL_SPECS.push(spec);
    ENHANCED_DRAWING_TOOL_SPECS_BY_KIND[spec.kind] = spec;
  }

  function defaultLabel(kind, index) {
    var spec = ENHANCED_DRAWING_TOOL_SPECS_BY_KIND[kind];
    var name = spec && spec.defaultLabel ? spec.defaultLabel : 'Object';
    return name + ' ' + index;
  }

  function clonePoint(point) {
    var next = {
      time: point.time,
      price: point.price
    };
    if (point.timestamp !== undefined) next.timestamp = point.timestamp;
    if (point.dataIndex !== undefined) next.dataIndex = point.dataIndex;
    if (point.paneId !== undefined) next.paneId = point.paneId;
    return next;
  }

  function clonePoints(points) {
    return Array.isArray(points)
      ? points.map(function (point) { return clonePoint(point); })
      : [];
  }

  function cloneSerializable(value, fallback) {
    if (value === undefined || value === null) return fallback;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_error) {
      return fallback;
    }
  }

  function hasTouchSupport() {
    try {
      return typeof window !== 'undefined' && (
        'ontouchstart' in window ||
        (typeof navigator !== 'undefined' && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 0)
      );
    } catch (_error) {
      return false;
    }
  }

  var objectDescriptionsVisibleByDefault = true;

  function shouldRenderObjectDescriptions(source) {
    return !source || source._objectDescriptionsVisible !== false;
  }

  function PrimitiveBase() {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
    this._objectDescriptionsVisible = objectDescriptionsVisibleByDefault;
  }

  PrimitiveBase.prototype.attached = function (param) {
    this._chart = param.chart;
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
    if (typeof this.updateAllViews === 'function') {
      this.updateAllViews();
    }
  };

  PrimitiveBase.prototype.detached = function () {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  };

  PrimitiveBase.prototype.requestUpdate = function () {
    if (typeof this._requestUpdate === 'function') {
      this._requestUpdate();
    }
  };

  PrimitiveBase.prototype.setObjectDescriptionsVisible = function (visible) {
    this._objectDescriptionsVisible = visible !== false;
    this.requestUpdate();
  };

  Object.defineProperty(PrimitiveBase.prototype, 'chart', {
    get: function () { return this._chart; }
  });

  Object.defineProperty(PrimitiveBase.prototype, 'series', {
    get: function () { return this._series; }
  });

  function createLinePrimitive(p1, p2, options) {
    function resolveLineStyleDash(style, ratio) {
      var px = Math.max(1, ratio || 1);
      if (style === 'dashed') return [8 * px, 5 * px];
      if (style === 'dotted') return [2 * px, 5 * px];
      return [];
    }

    function resolveDegenerateOrientation(a, b) {
      if (!a || !b) return null;
      if (isFiniteNumber(a.price) && isFiniteNumber(b.price) && a.price === b.price) return 'horizontal';
      if (a.time !== undefined && b.time !== undefined && a.time === b.time) return 'vertical';
      return null;
    }

    function extendLineSegment(x1, y1, x2, y2, width, height, mode, degenerateOrientation) {
      var start = { x: x1, y: y1 };
      var end = { x: x2, y: y2 };
      var dx = x2 - x1;
      var dy = y2 - y1;
      var extendMode = mode || 'none';
      if (extendMode === 'none' || (!isFiniteNumber(dx)) || (!isFiniteNumber(dy))) {
        return { start: start, end: end };
      }
      if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
        // Both anchors landed on the same pixel (level tools encode their
        // direction as a +1s / +1 price offset which can be sub-pixel on a
        // real time scale). Fall back to the logical orientation so the
        // level still extends instead of collapsing to a dot.
        if (degenerateOrientation === 'horizontal') {
          if (extendMode === 'left' || extendMode === 'both') start = { x: 0, y: y1 };
          if (extendMode === 'right' || extendMode === 'both') end = { x: width, y: y1 };
        } else if (degenerateOrientation === 'vertical') {
          if (extendMode === 'left' || extendMode === 'both') start = { x: x1, y: 0 };
          if (extendMode === 'right' || extendMode === 'both') end = { x: x1, y: height };
        }
        return { start: start, end: end };
      }

      if (Math.abs(dx) < 0.001) {
        if (extendMode === 'left' || extendMode === 'both') {
          if (y1 <= y2) start = { x: x1, y: 0 };
          else end = { x: x2, y: 0 };
        }
        if (extendMode === 'right' || extendMode === 'both') {
          if (y1 <= y2) end = { x: x2, y: height };
          else start = { x: x1, y: height };
        }
        return { start: start, end: end };
      }

      function pointAtX(targetX) {
        var ratio = (targetX - x1) / dx;
        return { x: targetX, y: y1 + (dy * ratio) };
      }

      if (extendMode === 'left' || extendMode === 'both') {
        if (x1 <= x2) start = pointAtX(0);
        else end = pointAtX(0);
      }
      if (extendMode === 'right' || extendMode === 'both') {
        if (x1 <= x2) end = pointAtX(width);
        else start = pointAtX(width);
      }
      return { start: start, end: end };
    }

    function LinePaneRenderer(source, points) {
      this._source = source;
      this._points = points;
    }

    LinePaneRenderer.prototype.draw = function (target) {
      var source = this._source;
      var p1p = this._points.p1;
      var p2p = this._points.p2;
      if (!source._options.visible || p1p.x === null || p1p.y === null || p2p.x === null || p2p.y === null) return;
      target.useBitmapCoordinateSpace(function (scope) {
        var ctx = scope.context;
        var horizontalRatio = scope.horizontalPixelRatio || 1;
        var verticalRatio = scope.verticalPixelRatio || 1;
        var x1 = Math.round(p1p.x * horizontalRatio);
        var y1 = Math.round(p1p.y * verticalRatio);
        var x2 = Math.round(p2p.x * horizontalRatio);
        var y2 = Math.round(p2p.y * verticalRatio);
        var bitmapWidth = scope.bitmapSize && isFiniteNumber(scope.bitmapSize.width) ? scope.bitmapSize.width : Math.max(x1, x2, 1);
        var bitmapHeight = scope.bitmapSize && isFiniteNumber(scope.bitmapSize.height) ? scope.bitmapSize.height : Math.max(y1, y2, 1);
        var lineColor = source._options.selected
          ? source._options.selectedColor
          : (source._options.hovered ? source._options.hoverColor : source._options.color);
        var extended = extendLineSegment(
          x1,
          y1,
          x2,
          y2,
          bitmapWidth,
          bitmapHeight,
          source._options.extendMode,
          resolveDegenerateOrientation(source._p1, source._p2)
        );
        var dash = resolveLineStyleDash(source._options.lineStyle, horizontalRatio);
        ctx.save();
        ctx.globalAlpha = source._options.opacity;
        ctx.lineWidth = source._options.width * horizontalRatio;
        ctx.strokeStyle = lineColor;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (ctx.setLineDash) ctx.setLineDash(dash);
        // Render-time extension changes only the pixels; logical anchors stay stable for pan/zoom/live candle updates.
        ctx.beginPath();
        ctx.moveTo(extended.start.x, extended.start.y);
        ctx.lineTo(extended.end.x, extended.end.y);
        ctx.stroke();

        if (ctx.setLineDash) ctx.setLineDash([]);
        if (source._options.showHandles || source._options.selected || source._options.draft) {
          var handleRadius = (source._options.selected ? source._options.selectedHandleRadius : source._options.handleRadius) * horizontalRatio;
          ctx.fillStyle = source._options.handleFillColor;
          ctx.strokeStyle = lineColor;
          ctx.lineWidth = Math.max(1, source._options.handleBorderWidth * horizontalRatio);
          ctx.beginPath();
          ctx.arc(x1, y1, handleRadius, 0, Math.PI * 2);
          ctx.arc(x2, y2, handleRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        var labelText = source._options.labelIsPrice && source.series
          ? formatCrosshairPrice(source.series, source._p1.price)
          : source._options.label;
        if (shouldRenderObjectDescriptions(source) && labelText) {
          var fontSize = Math.round(source._options.fontSize * horizontalRatio);
          ctx.font = '600 ' + fontSize + 'px Arial';
          var padding = 6 * horizontalRatio;
          var textWidth = ctx.measureText(labelText).width;
          var lx = x2 + padding;
          var ly = y2 - (source._options.fontSize + padding * 0.35);
          roundRectPath(ctx, lx - padding * 0.65, ly - padding * 0.85, textWidth + padding * 1.3, source._options.fontSize + padding * 1.2, 6 * horizontalRatio);
          ctx.fillStyle = source._options.labelBackgroundColor;
          ctx.fill();
          ctx.fillStyle = source._options.labelTextColor;
          ctx.fillText(labelText, lx, ly + source._options.fontSize * 0.65);
        }
        ctx.restore();
      });
    };

    function LinePaneView(source) {
      this._source = source;
      this._points = { p1: { x: null, y: null }, p2: { x: null, y: null } };
    }

    LinePaneView.prototype.update = function () {
      var series = this._source.series;
      var a = this._source._p1;
      var b = this._source._p2;
      var p1x = resolveCoordinateFromTime(this._source.chart, series, a.time);
      var p2x;
      var isHorizontalLevelPair =
        isFiniteNumber(a.price) && isFiniteNumber(b.price) && a.price === b.price &&
        isFiniteNumber(a.time) && isFiniteNumber(b.time) && Math.abs(b.time - a.time) <= 1;
      if (isHorizontalLevelPair || (isFiniteNumber(a.time) && a.time === b.time)) {
        // Level tools encode their direction as a synthetic +1s (or same-time)
        // helper point. That time is never bar-aligned, and time scales resolve
        // it inconsistently (null, interpolated, or a bogus 0) — pin it to the
        // anchor and let extendLineSegment's orientation fallback extend it.
        p2x = p1x;
      } else {
        p2x = resolveCoordinateFromTime(this._source.chart, series, b.time);
      }
      this._points.p1 = { x: p1x, y: series.priceToCoordinate(a.price) };
      this._points.p2 = { x: p2x, y: series.priceToCoordinate(b.price) };
    };

    LinePaneView.prototype.renderer = function () {
      return new LinePaneRenderer(this._source, this._points);
    };

    function LinePrimitive(pointA, pointB, opts) {
      PrimitiveBase.call(this);
      this._p1 = pointA;
      this._p2 = pointB;
      this._options = Object.assign({
        color: '#3B82F6',
        selectedColor: '#1D4ED8',
        hoverColor: '#2563EB',
        width: 2,
        visible: true,
        selected: false,
        hovered: false,
        draft: false,
        opacity: 1,
        lineStyle: 'solid',
        extendMode: 'none',
        showHandles: false,
        handleRadius: 4,
        selectedHandleRadius: 5,
        handleBorderWidth: 2,
        handleFillColor: '#FFFFFF',
        label: '',
        fontSize: 11,
        labelBackgroundColor: 'rgba(15, 23, 42, 0.92)',
        labelTextColor: '#FFFFFF'
      }, opts || {});
      this._paneViews = [new LinePaneView(this)];
    }

    LinePrimitive.prototype = Object.create(PrimitiveBase.prototype);
    LinePrimitive.prototype.constructor = LinePrimitive;
    LinePrimitive.prototype.updateAllViews = function () {
      this._paneViews.forEach(function (view) { view.update(); });
    };
    LinePrimitive.prototype.paneViews = function () {
      return this._paneViews;
    };
    LinePrimitive.prototype.setVisible = function (visible) {
      this._options.visible = !!visible;
      this.requestUpdate();
    };
    LinePrimitive.prototype.setSelected = function (selected) {
      this._options.selected = !!selected;
      this.requestUpdate();
    };
    LinePrimitive.prototype.setHovered = function (hovered) {
      this._options.hovered = !!hovered;
      this.requestUpdate();
    };
    LinePrimitive.prototype.setDraft = function (draft) {
      this._options.draft = !!draft;
      this.requestUpdate();
    };
    LinePrimitive.prototype.setOptions = function (options) {
      if (!options || typeof options !== 'object') return;
      this._options = Object.assign({}, this._options, options);
      this.requestUpdate();
    };
    LinePrimitive.prototype.updatePoints = function (pointA, pointB) {
      this._p1 = pointA;
      this._p2 = pointB;
      this.requestUpdate();
    };
    LinePrimitive.prototype.getPoints = function () {
      return clonePoints([this._p1, this._p2]);
    };
    LinePrimitive.prototype.getGeometry = function () {
      this.updateAllViews();
      var view = this._paneViews[0];
      return view && view._points
        ? {
            p1: { x: view._points.p1.x, y: view._points.p1.y },
            p2: { x: view._points.p2.x, y: view._points.p2.y }
          }
        : null;
    };
    LinePrimitive.prototype._distanceToPoint = function (a, b) {
      if (!a || !b || !isFiniteNumber(a.x) || !isFiniteNumber(a.y) || !isFiniteNumber(b.x) || !isFiniteNumber(b.y)) {
        return Number.POSITIVE_INFINITY;
      }
      var dx = a.x - b.x;
      var dy = a.y - b.y;
      return Math.sqrt((dx * dx) + (dy * dy));
    };
    LinePrimitive.prototype._distanceToSegment = function (point, a, b) {
      if (!point || !a || !b) return Number.POSITIVE_INFINITY;
      var dx = b.x - a.x;
      var dy = b.y - a.y;
      var lengthSquared = (dx * dx) + (dy * dy);
      if (lengthSquared <= 0.0001) return this._distanceToPoint(point, a);
      var t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
      t = Math.max(0, Math.min(1, t));
      return this._distanceToPoint(point, {
        x: a.x + (dx * t),
        y: a.y + (dy * t)
      });
    };
    LinePrimitive.prototype._distanceToRenderedLine = function (point, geometry) {
      var extendMode = this._options.extendMode || 'none';
      if (extendMode === 'none') {
        return this._distanceToSegment(point, geometry.p1, geometry.p2);
      }
      var hitWidth = Math.max(geometry.p1.x, geometry.p2.x, point.x, 1);
      var hitHeight = Math.max(geometry.p1.y, geometry.p2.y, point.y, 1);
      var extended = extendLineSegment(
        geometry.p1.x,
        geometry.p1.y,
        geometry.p2.x,
        geometry.p2.y,
        hitWidth,
        hitHeight,
        extendMode,
        resolveDegenerateOrientation(this._p1, this._p2)
      );
      return this._distanceToSegment(point, extended.start, extended.end);
    };
    LinePrimitive.prototype.hitTest = function (point, context) {
      var geometry = this.getGeometry();
      if (!geometry || !geometry.p1 || !geometry.p2 || !isFiniteNumber(geometry.p1.x) || !isFiniteNumber(geometry.p1.y) || !isFiniteNumber(geometry.p2.x) || !isFiniteNumber(geometry.p2.y)) {
        return null;
      }
      var isTouch = context && context.isTouch;
      var handleThreshold = isTouch ? 18 : 10;
      var lineThreshold = isTouch ? 14 : 8;
      if (this._distanceToPoint(point, geometry.p1) <= handleThreshold) return { part: 'p1' };
      if (this._distanceToPoint(point, geometry.p2) <= handleThreshold) return { part: 'p2' };
      if (this._distanceToRenderedLine(point, geometry) <= lineThreshold) return { part: 'body' };
      return null;
    };
    return new LinePrimitive(p1, p2, options);
  }

  function createPolylinePrimitive(points, options) {
    function resolvePolylineLineStyleDash(style, ratio) {
      var px = Math.max(1, ratio || 1);
      if (style === 'dashed') return [8 * px, 5 * px];
      if (style === 'dotted') return [2 * px, 5 * px];
      return [];
    }

    function PolylinePaneRenderer(source, coords) {
      this._source = source;
      this._coords = coords;
    }

    PolylinePaneRenderer.prototype.draw = function (target) {
      var source = this._source;
      var coords = this._coords.filter(function (item) {
        return item.x !== null && item.y !== null;
      });
      if (!source._options.visible || coords.length < 2) return;
      target.useBitmapCoordinateSpace(function (scope) {
        var ctx = scope.context;
        var horizontalRatio = scope.horizontalPixelRatio || 1;
        var verticalRatio = scope.verticalPixelRatio || 1;
        ctx.save();
        ctx.globalAlpha = source._options.opacity;
        ctx.strokeStyle = source._options.color;
        ctx.lineWidth = source._options.width * horizontalRatio;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (ctx.setLineDash) ctx.setLineDash(resolvePolylineLineStyleDash(source._options.lineStyle, horizontalRatio));
        ctx.beginPath();
        coords.forEach(function (coord, index) {
          var x = coord.x * horizontalRatio;
          var y = coord.y * verticalRatio;
          if (index === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });
        ctx.stroke();
        if (ctx.setLineDash) ctx.setLineDash([]);

        var vertexRadius = (source._options.selected ? 4.4 : 2.8) * horizontalRatio;
        ctx.fillStyle = source._options.selected ? '#FFFFFF' : source._options.color;
        coords.forEach(function (coord) {
          ctx.beginPath();
          ctx.arc(
            coord.x * horizontalRatio,
            coord.y * verticalRatio,
            vertexRadius,
            0,
            Math.PI * 2
          );
          ctx.fill();
          if (source._options.selected) {
            ctx.beginPath();
            ctx.arc(
              coord.x * horizontalRatio,
              coord.y * verticalRatio,
              vertexRadius,
              0,
              Math.PI * 2
            );
            ctx.stroke();
          }
        });

        if (shouldRenderObjectDescriptions(source) && source._options.label) {
          var last = coords[coords.length - 1];
          ctx.font = '600 ' + Math.round(source._options.fontSize * horizontalRatio) + 'px Arial';
          var padding = 6 * horizontalRatio;
          var textWidth = ctx.measureText(source._options.label).width;
          var lx = last.x * horizontalRatio + padding;
          var ly = last.y * verticalRatio - (source._options.fontSize + padding * 0.35);
          roundRectPath(
            ctx,
            lx - padding * 0.65,
            ly - padding * 0.85,
            textWidth + padding * 1.3,
            source._options.fontSize + padding * 1.2,
            6 * horizontalRatio
          );
          ctx.fillStyle = source._options.labelBackgroundColor;
          ctx.fill();
          ctx.fillStyle = source._options.labelTextColor;
          ctx.fillText(source._options.label, lx, ly + source._options.fontSize * 0.65);
        }

        ctx.restore();
      });
    };

    function PolylinePaneView(source) {
      this._source = source;
      this._coords = [];
    }

    PolylinePaneView.prototype.update = function () {
      var series = this._source.series;
      this._coords = this._source._points.map(function (point) {
        return {
          x: resolveCoordinateFromTime(this._source.chart, series, point.time),
          y: series.priceToCoordinate(point.price)
        };
      }, this);
    };

    PolylinePaneView.prototype.renderer = function () {
      return new PolylinePaneRenderer(this._source, this._coords);
    };

    function PolylinePrimitive(pointList, opts) {
      PrimitiveBase.call(this);
      this._points = pointList.slice();
      this._options = Object.assign({
        color: '#A855F7',
        width: 1.8,
        visible: true,
        opacity: 1,
        lineStyle: 'solid',
        label: '',
        fontSize: 11,
        labelBackgroundColor: 'rgba(88, 28, 135, 0.92)',
        labelTextColor: '#F3E8FF'
      }, opts || {});
      this._paneViews = [new PolylinePaneView(this)];
    }

    PolylinePrimitive.prototype = Object.create(PrimitiveBase.prototype);
    PolylinePrimitive.prototype.constructor = PolylinePrimitive;
    PolylinePrimitive.prototype.updateAllViews = function () {
      this._paneViews.forEach(function (view) { view.update(); });
    };
    PolylinePrimitive.prototype.paneViews = function () {
      return this._paneViews;
    };
    PolylinePrimitive.prototype.setVisible = function (visible) {
      this._options.visible = !!visible;
      this.requestUpdate();
    };
    PolylinePrimitive.prototype.setSelected = function (selected) {
      this._options.selected = !!selected;
      this.requestUpdate();
    };
    PolylinePrimitive.prototype.setHovered = function (hovered) {
      this._options.hovered = !!hovered;
      this.requestUpdate();
    };
    PolylinePrimitive.prototype.updatePoints = function () {
      this._points = Array.prototype.slice.call(arguments).filter(function (point) {
        return point && typeof point === 'object';
      });
      this.requestUpdate();
    };
    PolylinePrimitive.prototype.hitTest = function (point, context) {
      if (!this._options.visible || !point) return null;
      this.updateAllViews();
      var coords = (this._paneViews[0] && this._paneViews[0]._coords) || [];
      var valid = coords.filter(function (item) {
        return item && isFiniteNumber(item.x) && isFiniteNumber(item.y);
      });
      if (!valid.length) return null;
      var isTouch = context && context.isTouch;
      var handleThreshold = isTouch ? 18 : 10;
      var lineThreshold = isTouch ? 14 : 8;
      for (var i = 0; i < valid.length; i += 1) {
        if (distanceBetweenPoints(point, valid[i]) <= handleThreshold) {
          return { part: i === 0 ? 'p1' : (i === 1 ? 'p2' : 'body') };
        }
      }
      for (var j = 0; j < valid.length - 1; j += 1) {
        if (distanceToSegment(point, valid[j], valid[j + 1]) <= lineThreshold) {
          return { part: 'body' };
        }
      }
      return null;
    };
    return new PolylinePrimitive(points, options);
  }

  function createBoxPrimitive(p1, p2, options) {
    function resolveBoxLineStyleDash(style, ratio) {
      var px = Math.max(1, ratio || 1);
      if (style === 'dashed') return [8 * px, 5 * px];
      if (style === 'dotted') return [2 * px, 5 * px];
      return [];
    }

    function BoxPaneRenderer(source, points) {
      this._source = source;
      this._points = points;
    }

    BoxPaneRenderer.prototype.draw = function (target) {
      var source = this._source;
      var p1p = this._points.p1;
      var p2p = this._points.p2;
      if (!source._options.visible || p1p.x === null || p1p.y === null || p2p.x === null || p2p.y === null) return;
      target.useBitmapCoordinateSpace(function (scope) {
        var ctx = scope.context;
        var horizontalRatio = scope.horizontalPixelRatio || 1;
        var verticalRatio = scope.verticalPixelRatio || 1;
        var left = Math.min(p1p.x, p2p.x) * horizontalRatio;
        var top = Math.min(p1p.y, p2p.y) * verticalRatio;
        var width = Math.max(1, Math.abs(p2p.x - p1p.x) * horizontalRatio);
        var height = Math.max(1, Math.abs(p2p.y - p1p.y) * verticalRatio);
        ctx.save();
        ctx.globalAlpha = source._options.opacity;
        ctx.fillStyle = source._options.fillColor;
        ctx.strokeStyle = source._options.borderColor;
        ctx.lineWidth = source._options.borderWidth * horizontalRatio;
        if (ctx.setLineDash) ctx.setLineDash(resolveBoxLineStyleDash(source._options.borderStyle, horizontalRatio));
        roundRectPath(ctx, left, top, width, height, 6 * horizontalRatio);
        ctx.fill();
        ctx.stroke();
        if (ctx.setLineDash) ctx.setLineDash([]);
        if (shouldRenderObjectDescriptions(source) && source._options.label) {
          ctx.font = '600 ' + Math.round(source._options.fontSize * horizontalRatio) + 'px Arial';
          var padding = 6 * horizontalRatio;
          var textWidth = ctx.measureText(source._options.label).width;
          var labelWidth = textWidth + padding * 1.4;
          var labelHeight = source._options.fontSize + padding;
          var labelX = left + padding;
          var labelY = top + padding;
          roundRectPath(ctx, labelX, labelY, labelWidth, labelHeight, 5 * horizontalRatio);
          ctx.fillStyle = source._options.labelBackgroundColor;
          ctx.fill();
          ctx.fillStyle = source._options.labelTextColor;
          ctx.fillText(source._options.label, labelX + padding * 0.7, labelY + labelHeight - padding * 0.5);
        }
        if (source._options.selected) {
          var handleRadius = 4.4 * horizontalRatio;
          [p1p, p2p].forEach(function (corner) {
            ctx.beginPath();
            ctx.arc(corner.x * horizontalRatio, corner.y * verticalRatio, handleRadius, 0, Math.PI * 2);
            ctx.fillStyle = '#FFFFFF';
            ctx.fill();
            ctx.stroke();
          });
        }
        ctx.restore();
      });
    };

    function BoxPaneView(source) {
      this._source = source;
      this._points = { p1: { x: null, y: null }, p2: { x: null, y: null } };
    }

    BoxPaneView.prototype.update = function () {
      var series = this._source.series;
      this._points.p1 = {
        x: resolveCoordinateFromTime(this._source.chart, series, this._source._p1.time),
        y: series.priceToCoordinate(this._source._p1.price)
      };
      this._points.p2 = {
        x: resolveCoordinateFromTime(this._source.chart, series, this._source._p2.time),
        y: series.priceToCoordinate(this._source._p2.price)
      };
    };

    BoxPaneView.prototype.renderer = function () {
      return new BoxPaneRenderer(this._source, this._points);
    };

    function BoxPrimitive(pointA, pointB, opts) {
      PrimitiveBase.call(this);
      this._p1 = pointA;
      this._p2 = pointB;
      this._options = Object.assign({
        fillColor: 'rgba(59, 130, 246, 0.16)',
        borderColor: '#3B82F6',
        borderWidth: 1.5,
        borderStyle: 'solid',
        opacity: 1,
        visible: true,
        label: '',
        fontSize: 11,
        labelBackgroundColor: 'rgba(15, 23, 42, 0.92)',
        labelTextColor: '#FFFFFF'
      }, opts || {});
      this._paneViews = [new BoxPaneView(this)];
    }

    BoxPrimitive.prototype = Object.create(PrimitiveBase.prototype);
    BoxPrimitive.prototype.constructor = BoxPrimitive;
    BoxPrimitive.prototype.updateAllViews = function () {
      this._paneViews.forEach(function (view) { view.update(); });
    };
    BoxPrimitive.prototype.paneViews = function () {
      return this._paneViews;
    };
    BoxPrimitive.prototype.setVisible = function (visible) {
      this._options.visible = !!visible;
      this.requestUpdate();
    };
    BoxPrimitive.prototype.updatePoints = function (pointA, pointB) {
      this._p1 = pointA;
      this._p2 = pointB;
      this.requestUpdate();
    };
    BoxPrimitive.prototype.setSelected = function (selected) {
      this._options.selected = !!selected;
      this.requestUpdate();
    };
    BoxPrimitive.prototype.setHovered = function (hovered) {
      this._options.hovered = !!hovered;
      this.requestUpdate();
    };
    BoxPrimitive.prototype.hitTest = function (point, context) {
      if (!this._options.visible || !point) return null;
      this.updateAllViews();
      var view = this._paneViews[0];
      var corners = view && view._points ? view._points : null;
      if (
        !corners ||
        !isFiniteNumber(corners.p1.x) || !isFiniteNumber(corners.p1.y) ||
        !isFiniteNumber(corners.p2.x) || !isFiniteNumber(corners.p2.y)
      ) {
        return null;
      }
      var isTouch = context && context.isTouch;
      var handleThreshold = isTouch ? 18 : 10;
      var edgeThreshold = isTouch ? 14 : 8;
      if (distanceBetweenPoints(point, corners.p1) <= handleThreshold) return { part: 'p1' };
      if (distanceBetweenPoints(point, corners.p2) <= handleThreshold) return { part: 'p2' };
      var left = Math.min(corners.p1.x, corners.p2.x) - edgeThreshold;
      var right = Math.max(corners.p1.x, corners.p2.x) + edgeThreshold;
      var top = Math.min(corners.p1.y, corners.p2.y) - edgeThreshold;
      var bottom = Math.max(corners.p1.y, corners.p2.y) + edgeThreshold;
      if (point.x >= left && point.x <= right && point.y >= top && point.y <= bottom) {
        return { part: 'body' };
      }
      return null;
    };
    return new BoxPrimitive(p1, p2, options);
  }

  function createPointLabelPrimitive(point, options) {
    function LabelPaneRenderer(source, coords) {
      this._source = source;
      this._coords = coords;
    }

    LabelPaneRenderer.prototype.draw = function (target) {
      var source = this._source;
      if (!source._options.visible || this._coords.x === null || this._coords.y === null) return;
      target.useBitmapCoordinateSpace(function (scope) {
        var ctx = scope.context;
        var x = Math.round(source._coords.x * scope.horizontalPixelRatio);
        var y = Math.round(source._coords.y * scope.verticalPixelRatio);
        var fontSize = Math.round(source._options.fontSize * scope.horizontalPixelRatio);
        var padding = 6 * scope.horizontalPixelRatio;
        ctx.save();
        ctx.globalAlpha = source._options.opacity;
        ctx.font = '700 ' + fontSize + 'px Arial';
        var textWidth = ctx.measureText(source._options.text).width;
        var bubbleWidth = textWidth + padding * 1.8;
        var bubbleHeight = fontSize + padding * 1.4;
        var bubbleX = x + 10 * scope.horizontalPixelRatio;
        var bubbleY = y - bubbleHeight - 8 * scope.verticalPixelRatio;
        ctx.fillStyle = source._options.anchorColor;
        ctx.beginPath();
        ctx.arc(x, y, (source._options.selected ? 4.4 : 3) * scope.horizontalPixelRatio, 0, Math.PI * 2);
        ctx.fill();
        if (source._options.selected) {
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.6 * scope.horizontalPixelRatio;
          ctx.beginPath();
          ctx.arc(x, y, 6.4 * scope.horizontalPixelRatio, 0, Math.PI * 2);
          ctx.stroke();
        }
        roundRectPath(ctx, bubbleX, bubbleY, bubbleWidth, bubbleHeight, 6 * scope.horizontalPixelRatio);
        ctx.fillStyle = source._options.backgroundColor;
        ctx.fill();
        if (source._options.selected) {
          roundRectPath(ctx, bubbleX, bubbleY, bubbleWidth, bubbleHeight, 6 * scope.horizontalPixelRatio);
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.4 * scope.horizontalPixelRatio;
          ctx.stroke();
        }
        ctx.fillStyle = source._options.textColor;
        ctx.fillText(source._options.text, bubbleX + padding * 0.9, bubbleY + bubbleHeight - padding * 0.55);
        ctx.restore();
      });
    };

    function LabelPaneView(source) {
      this._source = source;
      this._coords = { x: null, y: null };
    }

    LabelPaneView.prototype.update = function () {
      var series = this._source.series;
      this._coords = {
        x: resolveCoordinateFromTime(this._source.chart, series, this._source._point.time),
        y: series.priceToCoordinate(this._source._point.price)
      };
      this._source._coords = this._coords;
    };

    LabelPaneView.prototype.renderer = function () {
      return new LabelPaneRenderer(this._source, this._coords);
    };

    function PointLabelPrimitive(pointValue, opts) {
      PrimitiveBase.call(this);
      this._point = pointValue;
      this._coords = { x: null, y: null };
      this._options = Object.assign({
        text: 'TXT',
        visible: true,
        fontSize: 11,
        backgroundColor: 'rgba(37, 99, 235, 0.94)',
        textColor: '#FFFFFF',
        anchorColor: '#60A5FA',
        opacity: 1
      }, opts || {});
      this._paneViews = [new LabelPaneView(this)];
    }

    PointLabelPrimitive.prototype = Object.create(PrimitiveBase.prototype);
    PointLabelPrimitive.prototype.constructor = PointLabelPrimitive;
    PointLabelPrimitive.prototype.updateAllViews = function () {
      this._paneViews.forEach(function (view) { view.update(); });
    };
    PointLabelPrimitive.prototype.paneViews = function () {
      return this._paneViews;
    };
    PointLabelPrimitive.prototype.setVisible = function (visible) {
      this._options.visible = !!visible;
      this.requestUpdate();
    };
    PointLabelPrimitive.prototype.setSelected = function (selected) {
      this._options.selected = !!selected;
      this.requestUpdate();
    };
    PointLabelPrimitive.prototype.setHovered = function (hovered) {
      this._options.hovered = !!hovered;
      this.requestUpdate();
    };
    PointLabelPrimitive.prototype.updatePoints = function (pointValue) {
      if (pointValue && typeof pointValue === 'object') {
        this._point = pointValue;
        this.requestUpdate();
      }
    };
    PointLabelPrimitive.prototype.hitTest = function (point, context) {
      if (!this._options.visible || !point) return null;
      this.updateAllViews();
      var coords = this._coords;
      if (!coords || !isFiniteNumber(coords.x) || !isFiniteNumber(coords.y)) return null;
      var isTouch = context && context.isTouch;
      var anchorThreshold = isTouch ? 18 : 10;
      if (distanceBetweenPoints(point, coords) <= anchorThreshold) return { part: 'body' };
      // Approximate the label bubble drawn above-right of the anchor.
      var fontSize = this._options.fontSize || 11;
      var padding = 6;
      var text = typeof this._options.text === 'string' ? this._options.text : '';
      var bubbleWidth = Math.max(24, text.length * fontSize * 0.62 + padding * 1.8);
      var bubbleHeight = fontSize + padding * 1.4;
      var bubbleX = coords.x + 10;
      var bubbleY = coords.y - bubbleHeight - 8;
      var slack = isTouch ? 8 : 4;
      if (
        point.x >= bubbleX - slack && point.x <= bubbleX + bubbleWidth + slack &&
        point.y >= bubbleY - slack && point.y <= bubbleY + bubbleHeight + slack
      ) {
        return { part: 'body' };
      }
      return null;
    };
    return new PointLabelPrimitive(point, options);
  }

  function createPitchforkPrimitive(p1, p2, p3, options) {
    function resolvePitchforkLineStyleDash(style, ratio) {
      var px = Math.max(1, ratio || 1);
      if (style === 'dashed') return [8 * px, 5 * px];
      if (style === 'dotted') return [2 * px, 5 * px];
      return [];
    }

    function resolvePitchforkForwardSegment(origin, direction, paneWidth, paneHeight) {
      var epsilon = 0.0001;
      if (!origin || !direction || !isFiniteNumber(origin.x) || !isFiniteNumber(origin.y) || !isFiniteNumber(direction.x) || !isFiniteNumber(direction.y)) {
        return null;
      }
      var dx = direction.x;
      var dy = direction.y;
      if (Math.abs(dx) < epsilon && Math.abs(dy) < epsilon) {
        return null;
      }

      var candidates = [];
      function addCandidate(t) {
        if (!isFiniteNumber(t) || t < -epsilon) return;
        var x = origin.x + dx * t;
        var y = origin.y + dy * t;
        if (x < -epsilon || x > paneWidth + epsilon || y < -epsilon || y > paneHeight + epsilon) {
          return;
        }
        x = Math.max(0, Math.min(paneWidth, x));
        y = Math.max(0, Math.min(paneHeight, y));
        var duplicate = candidates.some(function (candidate) {
          return Math.abs(candidate.x - x) < 0.01 && Math.abs(candidate.y - y) < 0.01;
        });
        if (!duplicate) candidates.push({ x: x, y: y, t: Math.max(0, t) });
      }

      addCandidate(0);
      if (Math.abs(dx) >= epsilon) {
        addCandidate((0 - origin.x) / dx);
        addCandidate((paneWidth - origin.x) / dx);
      }
      if (Math.abs(dy) >= epsilon) {
        addCandidate((0 - origin.y) / dy);
        addCandidate((paneHeight - origin.y) / dy);
      }

      candidates.sort(function (a, b) { return a.t - b.t; });
      if (candidates.length < 2) {
        return null;
      }
      return {
        start: candidates[0],
        end: candidates[candidates.length - 1]
      };
    }

    function resolvePitchforkDirection(c1, c2, c3) {
      var midpoint = {
        x: (c2.x + c3.x) / 2,
        y: (c2.y + c3.y) / 2
      };
      var direction = {
        x: midpoint.x - c1.x,
        y: midpoint.y - c1.y
      };
      if (Math.abs(direction.x) < 0.0001 && Math.abs(direction.y) < 0.0001) {
        direction = {
          x: c3.x - c2.x,
          y: c3.y - c2.y
        };
      }
      return direction;
    }

    function drawPitchforkSegment(ctx, segment, ratioX, ratioY) {
      if (!segment) return;
      ctx.moveTo(segment.start.x * ratioX, segment.start.y * ratioY);
      ctx.lineTo(segment.end.x * ratioX, segment.end.y * ratioY);
    }

    function PitchforkPaneRenderer(source, coords) {
      this._source = source;
      this._coords = coords;
    }

    PitchforkPaneRenderer.prototype.draw = function (target) {
      var source = this._source;
      var c1 = this._coords.p1;
      var c2 = this._coords.p2;
      var c3 = this._coords.p3;
      if (!source._options.visible || c1.x === null || c1.y === null || c2.x === null || c2.y === null || c3.x === null || c3.y === null) return;
      target.useBitmapCoordinateSpace(function (scope) {
        var ctx = scope.context;
        var ratioX = scope.horizontalPixelRatio || 1;
        var ratioY = scope.verticalPixelRatio || 1;
        var paneWidth = ((scope.bitmapSize && scope.bitmapSize.width) || Math.max(c1.x, c2.x, c3.x, 1)) / ratioX;
        var paneHeight = ((scope.bitmapSize && scope.bitmapSize.height) || Math.max(c1.y, c2.y, c3.y, 1)) / ratioY;
        var direction = resolvePitchforkDirection(c1, c2, c3);
        var median = resolvePitchforkForwardSegment(c1, direction, paneWidth, paneHeight);
        var upperRail = resolvePitchforkForwardSegment(c2, direction, paneWidth, paneHeight);
        var lowerRail = resolvePitchforkForwardSegment(c3, direction, paneWidth, paneHeight);
        ctx.save();
        ctx.globalAlpha = source._options.opacity;
        ctx.strokeStyle = source._options.color;
        ctx.lineWidth = source._options.width * ratioX;
        ctx.lineCap = 'round';
        if (ctx.setLineDash) ctx.setLineDash(resolvePitchforkLineStyleDash(source._options.lineStyle, ratioX));
        ctx.beginPath();
        drawPitchforkSegment(ctx, median, ratioX, ratioY);
        drawPitchforkSegment(ctx, upperRail, ratioX, ratioY);
        drawPitchforkSegment(ctx, lowerRail, ratioX, ratioY);
        ctx.stroke();
        if (ctx.setLineDash) ctx.setLineDash([]);
        var anchorRadius = (source._options.selected ? 4.6 : 3) * ratioX;
        ctx.fillStyle = source._options.selected ? '#FFFFFF' : source._options.color;
        [ [c1.x * ratioX, c1.y * ratioY], [c2.x * ratioX, c2.y * ratioY], [c3.x * ratioX, c3.y * ratioY] ].forEach(function (pair) {
          ctx.beginPath();
          ctx.arc(pair[0], pair[1], anchorRadius, 0, Math.PI * 2);
          ctx.fill();
          if (source._options.selected) {
            ctx.beginPath();
            ctx.arc(pair[0], pair[1], anchorRadius, 0, Math.PI * 2);
            ctx.stroke();
          }
        });
        ctx.restore();
      });
    };

    function PitchforkPaneView(source) {
      this._source = source;
      this._coords = { p1: { x: null, y: null }, p2: { x: null, y: null }, p3: { x: null, y: null } };
    }

    PitchforkPaneView.prototype.update = function () {
      var series = this._source.series;
      this._coords.p1 = { x: resolveCoordinateFromTime(this._source.chart, series, this._source._p1.time), y: series.priceToCoordinate(this._source._p1.price) };
      this._coords.p2 = { x: resolveCoordinateFromTime(this._source.chart, series, this._source._p2.time), y: series.priceToCoordinate(this._source._p2.price) };
      this._coords.p3 = { x: resolveCoordinateFromTime(this._source.chart, series, this._source._p3.time), y: series.priceToCoordinate(this._source._p3.price) };
    };

    PitchforkPaneView.prototype.renderer = function () {
      return new PitchforkPaneRenderer(this._source, this._coords);
    };

    function PitchforkPrimitive(pointA, pointB, pointC, opts) {
      PrimitiveBase.call(this);
      this._p1 = pointA;
      this._p2 = pointB;
      this._p3 = pointC;
      this._options = Object.assign({ color: '#8B5CF6', width: 1.6, lineStyle: 'solid', opacity: 1, visible: true }, opts || {});
      this._paneViews = [new PitchforkPaneView(this)];
    }

    PitchforkPrimitive.prototype = Object.create(PrimitiveBase.prototype);
    PitchforkPrimitive.prototype.constructor = PitchforkPrimitive;
    PitchforkPrimitive.prototype.updateAllViews = function () {
      this._paneViews.forEach(function (view) { view.update(); });
    };
    PitchforkPrimitive.prototype.paneViews = function () {
      return this._paneViews;
    };
    PitchforkPrimitive.prototype.setVisible = function (visible) {
      this._options.visible = !!visible;
      this.requestUpdate();
    };
    PitchforkPrimitive.prototype.setSelected = function (selected) {
      this._options.selected = !!selected;
      this.requestUpdate();
    };
    PitchforkPrimitive.prototype.setHovered = function (hovered) {
      this._options.hovered = !!hovered;
      this.requestUpdate();
    };
    PitchforkPrimitive.prototype.updatePoints = function (pointA, pointB, pointC) {
      if (pointA) this._p1 = pointA;
      if (pointB) this._p2 = pointB;
      if (pointC) this._p3 = pointC;
      this.requestUpdate();
    };
    PitchforkPrimitive.prototype.hitTest = function (point, context) {
      if (!this._options.visible || !point) return null;
      this.updateAllViews();
      var view = this._paneViews[0];
      var coords = view && view._coords ? view._coords : null;
      if (!coords) return null;
      var anchors = [coords.p1, coords.p2, coords.p3].filter(function (item) {
        return item && isFiniteNumber(item.x) && isFiniteNumber(item.y);
      });
      if (!anchors.length) return null;
      var isTouch = context && context.isTouch;
      var handleThreshold = isTouch ? 18 : 10;
      var lineThreshold = isTouch ? 14 : 8;
      for (var i = 0; i < anchors.length; i += 1) {
        if (distanceBetweenPoints(point, anchors[i]) <= handleThreshold) {
          return { part: i === 0 ? 'p1' : (i === 1 ? 'p2' : 'body') };
        }
      }
      for (var j = 0; j < anchors.length - 1; j += 1) {
        if (distanceToSegment(point, anchors[j], anchors[j + 1]) <= lineThreshold) {
          return { part: 'body' };
        }
      }
      return null;
    };
    return new PitchforkPrimitive(p1, p2, p3, options);
  }

  function BaseTool(kind, chart, series, manager) {
    this._kind = kind;
    this._chart = chart;
    this._series = series;
    this._manager = manager;
    this._drawing = false;
  }

  BaseTool.prototype.startDrawing = function () {
    if (this._manager.isLocked()) return;
    this._drawing = true;
  };

  BaseTool.prototype.stopDrawing = function () {
    this._drawing = false;
  };

  BaseTool.prototype.isDrawing = function () {
    return this._drawing;
  };

  BaseTool.prototype._resolvePoint = function (param) {
    if (!param || !param.point || !param.time) return null;
    if (this._manager && typeof this._manager._resolveCrosshairState === 'function') {
      var state = this._manager._resolveCrosshairState(param);
      if (state && state.time !== null && state.time !== undefined && isFiniteNumber(state.price)) {
        var resolved = { time: state.time, price: state.price };
        if (state.timestamp !== undefined) resolved.timestamp = state.timestamp;
        if (state.dataIndex !== undefined) resolved.dataIndex = state.dataIndex;
        if (state.paneId !== undefined) resolved.paneId = state.paneId;
        return resolved;
      }
    }
    var price = this._series.coordinateToPrice(param.point.y);
    if (price === null || price === undefined) return null;
    return { time: param.time, price: price };
  };

  BaseTool.prototype._completeDrawing = function (primitive, explicitLabel, serializedData) {
    if (!primitive) return;
    this._manager.registerDrawing(this._kind, primitive, explicitLabel, serializedData);
    this._manager._ignoreCrosshairClickUntil = Date.now() + 120;
    if (this._manager.isStickyMode()) {
      this._drawing = true;
      if (typeof this._resetDrawingSession === 'function') this._resetDrawingSession();
    } else {
      this.stopDrawing();
      this._manager.finishDrawingTool(this._kind);
    }
  };

  function BoxTool(kind, chart, series, manager, options) {
    BaseTool.call(this, kind, chart, series, manager);
    this._points = [];
    this._preview = null;
    this._options = options || {};
    this._handleClick = this._handleClick.bind(this);
    this._handleMove = this._handleMove.bind(this);
    this._usesNativeChartInput = !manager.shouldUseDirectTouchInput();
    if (this._usesNativeChartInput) {
      this._chart.subscribeClick(this._handleClick);
      this._chart.subscribeCrosshairMove(this._handleMove);
    }
  }

  BoxTool.prototype = Object.create(BaseTool.prototype);
  BoxTool.prototype.constructor = BoxTool;
  BoxTool.prototype._buildLabel = function (p1, p2) {
    if (typeof this._options.labelBuilder === 'function') {
      return this._options.labelBuilder(p1, p2);
    }
    return this._options.label || '';
  };
  BoxTool.prototype._buildOptions = function (p1, p2, preview) {
    return {
      fillColor: preview ? this._options.previewFillColor : this._options.fillColor,
      borderColor: this._options.borderColor,
      borderWidth: this._options.borderWidth,
      borderStyle: this._options.borderStyle || 'solid',
      opacity: isFiniteNumber(this._options.opacity) ? this._options.opacity : 1,
      label: this._buildLabel(p1, p2),
      labelBackgroundColor: this._options.labelBackgroundColor,
      labelTextColor: this._options.labelTextColor,
      fontSize: this._options.fontSize || 11
    };
  };
  BoxTool.prototype._buildStyle = function () {
    return {
      fillColor: this._options.fillColor,
      borderColor: this._options.borderColor,
      borderWidth: this._options.borderWidth,
      borderStyle: this._options.borderStyle || 'solid',
      opacity: isFiniteNumber(this._options.opacity) ? this._options.opacity : 1,
      labelBackgroundColor: this._options.labelBackgroundColor,
      labelTextColor: this._options.labelTextColor
    };
  };
  BoxTool.prototype.startDrawing = function () {
    BaseTool.prototype.startDrawing.call(this);
    this._resetDrawingSession();
  };
  BoxTool.prototype._resetDrawingSession = function () {
    this._points = [];
    this._removePreview();
  };
  BoxTool.prototype.stopDrawing = function () {
    BaseTool.prototype.stopDrawing.call(this);
    this._resetDrawingSession();
  };
  BoxTool.prototype._removePreview = function () {
    if (this._preview) {
      try { this._series.detachPrimitive(this._preview); } catch (_error) {}
      this._preview = null;
    }
  };
  BoxTool.prototype._handleClick = function (param) {
    if (!this._drawing) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    this._points.push(point);
    if (this._points.length === 1) {
      this._preview = createBoxPrimitive(point, point, this._buildOptions(point, point, true));
      this._series.attachPrimitive(this._preview);
      return;
    }
    if (this._points.length >= 2) {
      var p1 = this._points[0];
      var p2 = this._points[1];
      this._removePreview();
      this._completeDrawing(createBoxPrimitive(p1, p2, this._buildOptions(p1, p2, false)), null, {
        points: clonePoints([p1, p2]),
        style: this._buildStyle()
      });
    }
  };
  BoxTool.prototype._handleMove = function (param) {
    if (!this._drawing || !this._preview || this._points.length !== 1) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    this._preview.updatePoints(this._points[0], point);
    this._preview._options.label = this._buildLabel(this._points[0], point);
    this._preview.requestUpdate();
  };
  BoxTool.prototype.remove = function () {
    this.stopDrawing();
    if (this._usesNativeChartInput) {
      this._chart.unsubscribeClick(this._handleClick);
      this._chart.unsubscribeCrosshairMove(this._handleMove);
    }
  };

  function LabelTool(kind, chart, series, manager, options) {
    BaseTool.call(this, kind, chart, series, manager);
    this._options = options || {};
    this._handleClick = this._handleClick.bind(this);
    this._usesNativeChartInput = !manager.shouldUseDirectTouchInput();
    if (this._usesNativeChartInput) {
      this._chart.subscribeClick(this._handleClick);
    }
  }

  LabelTool.prototype = Object.create(BaseTool.prototype);
  LabelTool.prototype.constructor = LabelTool;
  LabelTool.prototype._buildStyle = function () {
    return {
      color: this._options.textColor,
      backgroundColor: this._options.backgroundColor,
      textColor: this._options.textColor,
      anchorColor: this._options.anchorColor,
      anchorLineColor: this._options.anchorColor,
      fontSize: this._options.fontSize || 11,
      opacity: isFiniteNumber(this._options.opacity) ? this._options.opacity : 1
    };
  };
  LabelTool.prototype._handleClick = function (param) {
    if (!this._drawing) return;
    var point = this._resolvePoint(param);
    if (!point) return;
    this._completeDrawing(createPointLabelPrimitive(point, {
      text: this._options.text,
      backgroundColor: this._options.backgroundColor,
      textColor: this._options.textColor,
      anchorColor: this._options.anchorColor,
      opacity: isFiniteNumber(this._options.opacity) ? this._options.opacity : 1,
      fontSize: this._options.fontSize || 11
    }), null, {
      points: clonePoints([point]),
      text: this._options.text,
      style: this._buildStyle()
    });
  };
  LabelTool.prototype.remove = function () {
    this.stopDrawing();
    if (this._usesNativeChartInput) {
      this._chart.unsubscribeClick(this._handleClick);
    }
  };

  ${ENHANCED_DRAWING_TOOLS_RUNTIME_JS}

  function AdvancedDrawingToolsManager(chart, series) {
    this._chart = chart;
    this._series = series;
    this._activeTool = 'none';
    this._hidden = false;
    this._locked = false;
    this._sticky = false;
    // Chart Preferences → "Show object descriptions". When false, drawing
    // price/text labels stay off on both iOS and Android.
    this._showObjectDescriptions = true;
    this._crosshairLocked = false;
    this._crosshairVisible = false;
    // True once a touch gesture has ever had >=2 fingers down (a pinch/zoom).
    // Stays true until every finger lifts, so the whole gesture is treated as a
    // zoom and never shows/locks the crosshair — even though a real pinch puts
    // one finger down a frame before the second.
    this._gestureHadMultitouch = false;
    // Time-based suppression window. Lightweight-charts drives the crosshair via
    // its own subscribeCrosshairMove/subscribeClick events, and its trailing
    // click fires on touchend AFTER our touch handlers have already cleared
    // _gestureHadMultitouch. A short window that outlives the gesture keeps the
    // pinch from showing/locking the crosshair through that path too.
    this._multiTouchSuppressUntil = 0;
    // Tracks whether the active drawing tool acted on the first finger of the
    // current gesture, plus the drawings count before it did, so a pinch that
    // follows can roll back anything that first finger started/committed.
    this._gestureToolActed = false;
    this._gestureDrawingBaseline = 0;
    this._crosshairRaf = 0;
    this._crosshairConfig = {
      symbol: '',
      timeframe: '',
      lineColor: 'rgba(148, 163, 184, 0.68)',
      labelBackground: 'rgba(15, 23, 42, 0.96)',
      labelText: '#FFFFFF',
      tooltipBackground: 'rgba(15, 23, 42, 0.94)',
      tooltipBorder: 'rgba(148, 163, 184, 0.28)',
      tooltipText: '#E5E7EB',
      tooltipMuted: '#94A3B8',
      upColor: '#2962FF',
      downColor: '#EF5350',
      areaSeriesInspector: false,
      pointSize: null,
      snapEnabled: false,
      snapType: 'ohlc-nearest',
      snapThresholdPx: 18
    };
    this._lastCrosshairParam = null;
    this._lastCrosshairState = null;
    this._pendingCrosshairState = null;
    this._areaInspectorSeedPending = false;
    this._regularCrosshairSeedPending = false;
    this._crosshairRulerAnchor = null;
    this._regularCrosshairGestureOrigin = null;
    this._lastNotifiedCrosshairSignature = '';
    this._ignoreCrosshairClickUntil = 0;
    this._drawingCounter = {};
    this._records = [];
    this._undoSnapshots = [];
    this._redoSnapshots = [];
    this._historyRestoreInProgress = false;
    this._chartHost = null;
    this._activeTouchId = null;
    this._activePointerTouches = {};
    this._lastTouchParam = null;
    this._touchGestureMode = 'idle';
    this._touchDidMove = false;
    this._touchStartX = 0;
    this._touchStartY = 0;
    this._lastTextEditTap = null;
    this._lastDrawingTap = null;
    this._lastEmptyChartTap = null;
    this._selectedRecordId = null;
    this._hoveredRecordId = null;
    this._drawingBadgesOverlay = null;
    this._drawingBadgeElements = {};
    this._drawingBadgesRangeHandler = null;
    this._lineEditState = null;
    this._lineEditPendingFrame = 0;
    this._lineEditPendingPoints = null;
    this._textEditState = null;
    this._snapBypassActive = false;
    this._crosshairOverlay = null;
    this._handlePointerStart = this._handlePointerStart.bind(this);
    this._handlePointerMove = this._handlePointerMove.bind(this);
    this._handlePointerEnd = this._handlePointerEnd.bind(this);
    this._handlePointerCancel = this._handlePointerCancel.bind(this);
    this._handleTouchStart = this._handleTouchStart.bind(this);
    this._handleTouchMove = this._handleTouchMove.bind(this);
    this._handleTouchEnd = this._handleTouchEnd.bind(this);
    this._handleTouchCancel = this._handleTouchCancel.bind(this);
    this._handleHostDoubleClick = this._handleHostDoubleClick.bind(this);
    this._handleTextEditDocumentPointer = this._handleTextEditDocumentPointer.bind(this);
    this._handleCrosshairMove = this._handleCrosshairMove.bind(this);
    this._handleCrosshairClick = this._handleCrosshairClick.bind(this);
    this._handleKeyDown = this._handleKeyDown.bind(this);
    this._handleKeyUp = this._handleKeyUp.bind(this);
    this._tools = {};
    ENHANCED_DRAWING_TOOL_SPECS.forEach(function (spec) {
      if (!spec || !spec.kind || typeof spec.createTool !== 'function') return;
      var tool = spec.createTool(chart, series, this);
      if (
        tool &&
        typeof tool.startDrawing === 'function' &&
        typeof tool.stopDrawing === 'function' &&
        typeof tool.remove === 'function'
      ) {
        this._tools[spec.kind] = tool;
      }
    }, this);
    try {
      if (this._chart && typeof this._chart.subscribeCrosshairMove === 'function') {
        this._chart.subscribeCrosshairMove(this._handleCrosshairMove);
      }
    } catch (_subscribeMoveError) {}
    try {
      if (this._chart && typeof this._chart.subscribeClick === 'function') {
        this._chart.subscribeClick(this._handleCrosshairClick);
      }
    } catch (_subscribeClickError) {}
    try {
      if (typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') {
        document.addEventListener('keydown', this._handleKeyDown, true);
        document.addEventListener('keyup', this._handleKeyUp, true);
      }
    } catch (_keyError) {}
    try {
      if (this._chart && typeof this._chart.timeScale === 'function') {
        var badgeTimeScale = this._chart.timeScale();
        if (badgeTimeScale && typeof badgeTimeScale.subscribeVisibleLogicalRangeChange === 'function') {
          var badgeManager = this;
          this._drawingBadgesRangeHandler = function () { badgeManager._refreshDrawingBadges(); };
          badgeTimeScale.subscribeVisibleLogicalRangeChange(this._drawingBadgesRangeHandler);
        }
      }
    } catch (_badgeSubscribeError) {}
    this._bindTouchBridge();
    this._emitDrawingsChanged();
    this._applyChartInteractionMode();
  }

  AdvancedDrawingToolsManager.prototype._stopAllTools = function () {
    Object.keys(this._tools).forEach(function (key) {
      var tool = this._tools[key];
      if (tool && typeof tool.stopDrawing === 'function') {
        tool.stopDrawing();
      }
    }, this);
  };

  AdvancedDrawingToolsManager.prototype._isDrawingToolActive = function () {
    var tool = this._tools[this._activeTool];
    return !this._locked && !!tool && (typeof tool.isDrawing !== 'function' || tool.isDrawing());
  };

  AdvancedDrawingToolsManager.prototype.shouldUseDirectTouchInput = function () {
    return hasTouchSupport();
  };

  AdvancedDrawingToolsManager.prototype._isRegularCrosshairInspector = function () {
    return this._activeTool === 'crosshair' && this._crosshairConfig.areaSeriesInspector !== true;
  };

  // A pinch/zoom is in progress, or just ended within the suppression window.
  AdvancedDrawingToolsManager.prototype._isPinchActive = function () {
    return this._gestureHadMultitouch || Date.now() < this._multiTouchSuppressUntil;
  };

  // Mark the current gesture as a pinch and (re)arm the trailing suppression
  // window so the lightweight-charts crosshair/click events fired on touchend
  // are ignored too.
  AdvancedDrawingToolsManager.prototype._markPinch = function () {
    this._gestureHadMultitouch = true;
    this._multiTouchSuppressUntil = Date.now() + 450;
    this._activeTouchId = null;
    this._touchDidMove = false;
    this._regularCrosshairGestureOrigin = null;
    this._rollbackPinchStartedDrawing();
  };

  // Undo anything the first finger of a now-confirmed pinch started on the active
  // drawing tool: an uncommitted in-progress preview (2-point tools) and/or a
  // drawing the first tap committed (single-tap tools like Level/Label). Runs
  // only when that first finger actually acted, so normal single-finger drawing
  // is untouched.
  AdvancedDrawingToolsManager.prototype._rollbackPinchStartedDrawing = function () {
    if (!this._gestureToolActed) {
      return;
    }
    this._gestureToolActed = false;
    var activeTool = this._tools[this._activeTool];
    if (activeTool && activeTool._drawing) {
      if (typeof activeTool._resetDrawingSession === 'function') {
        try { activeTool._resetDrawingSession(); } catch (_resetErr) {}
      } else if (typeof activeTool.stopDrawing === 'function' && typeof activeTool.startDrawing === 'function') {
        try { activeTool.stopDrawing(); activeTool.startDrawing(); } catch (_restartErr) {}
      }
    }
    if (typeof this._gestureDrawingBaseline === 'number') {
      var removed = false;
      while (this._records.length > this._gestureDrawingBaseline) {
        var rec = this._records.pop();
        try { this._detachRecord(rec); } catch (_detachErr) {}
        if (rec && this._selectedRecordId === rec.id) {
          this._selectedRecordId = null;
        }
        removed = true;
      }
      if (removed) {
        this._emitDrawingsChanged();
      }
    }
  };

  AdvancedDrawingToolsManager.prototype._bindTouchBridge = function () {
    if (typeof document === 'undefined') {
      return;
    }

    var host = document.getElementById('chart');
    if (!host || host === this._chartHost) {
      return;
    }

    this._unbindTouchBridge();
    this._chartHost = host;
    host.addEventListener('dblclick', this._handleHostDoubleClick, true);
    if (this.shouldUseDirectTouchInput()) {
      if (this._supportsPointerTouchBridge()) {
        host.addEventListener('pointerdown', this._handlePointerStart, { capture: true, passive: false });
        host.addEventListener('pointermove', this._handlePointerMove, { capture: true, passive: false });
        host.addEventListener('pointerup', this._handlePointerEnd, { capture: true, passive: false });
        host.addEventListener('pointercancel', this._handlePointerCancel, { capture: true, passive: false });
      } else {
        host.addEventListener('touchstart', this._handleTouchStart, { capture: true, passive: false });
        host.addEventListener('touchmove', this._handleTouchMove, { capture: true, passive: false });
        host.addEventListener('touchend', this._handleTouchEnd, { capture: true, passive: false });
        host.addEventListener('touchcancel', this._handleTouchCancel, { capture: true, passive: false });
      }
    }
  };

  AdvancedDrawingToolsManager.prototype._unbindTouchBridge = function () {
    if (!this._chartHost) {
      return;
    }

    this._chartHost.removeEventListener('dblclick', this._handleHostDoubleClick, true);
    this._chartHost.removeEventListener('pointerdown', this._handlePointerStart, true);
    this._chartHost.removeEventListener('pointermove', this._handlePointerMove, true);
    this._chartHost.removeEventListener('pointerup', this._handlePointerEnd, true);
    this._chartHost.removeEventListener('pointercancel', this._handlePointerCancel, true);
    this._chartHost.removeEventListener('touchstart', this._handleTouchStart, true);
    this._chartHost.removeEventListener('touchmove', this._handleTouchMove, true);
    this._chartHost.removeEventListener('touchend', this._handleTouchEnd, true);
    this._chartHost.removeEventListener('touchcancel', this._handleTouchCancel, true);

    try {
      this._chartHost.style.touchAction = '';
      this._chartHost.style.userSelect = '';
      this._chartHost.style.webkitUserSelect = '';
    } catch (_error) {}

    this._chartHost = null;
    this._activeTouchId = null;
    this._activePointerTouches = {};
    this._lastTouchParam = null;
    this._touchGestureMode = 'idle';
    this._touchDidMove = false;
    this._endLineEdit(false);
    this._endTextRecordEdit(false);
  };

  AdvancedDrawingToolsManager.prototype._applyElementStyles = function (element, styles) {
    if (!element || !element.style || !styles) {
      return;
    }

    Object.keys(styles).forEach(function (key) {
      element.style[key] = styles[key];
    });
  };

  AdvancedDrawingToolsManager.prototype._ensureCrosshairOverlay = function () {
    if (!this._chartHost) {
      this._bindTouchBridge();
    }
    if (!this._chartHost && typeof document !== 'undefined') {
      try {
        this._chartHost = document.getElementById('chart');
      } catch (_hostError) {
        this._chartHost = null;
      }
    }
    if (!this._chartHost || typeof document === 'undefined') {
      return null;
    }
    if (this._crosshairOverlay && this._crosshairOverlay.root) {
      return this._crosshairOverlay;
    }

    var root = document.createElement('div');
    var vertical = document.createElement('div');
    var horizontal = document.createElement('div');
    var priceLabel = document.createElement('div');
    var timeLabel = document.createElement('div');
    var center = document.createElement('div');
    var tooltip = document.createElement('div');
    var lockBadge = document.createElement('div');
    var rulerRectangle = document.createElement('div');
    var rulerAnchor = document.createElement('div');
    var rulerPriceLabel = document.createElement('div');
    var rulerTimeLabel = document.createElement('div');
    var rulerLabel = document.createElement('div');
    var rulerVertical = document.createElement('div');
    var rulerHorizontal = document.createElement('div');
    var centerArms = [];

    root.setAttribute('data-rtx5-crosshair-overlay', 'true');
    this._applyElementStyles(root, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      overflow: 'hidden',
      display: 'none',
      zIndex: '45'
    });
    this._applyElementStyles(vertical, {
      position: 'absolute',
      top: '0',
      width: '0',
      height: '0',
      borderLeft: '1px dashed rgba(148, 163, 184, 0.68)'
    });
    this._applyElementStyles(horizontal, {
      position: 'absolute',
      left: '0',
      height: '0',
      width: '0',
      borderTop: '1px dashed rgba(148, 163, 184, 0.68)'
    });
    this._applyElementStyles(priceLabel, {
      position: 'absolute',
      right: '0',
      minWidth: '60px',
      padding: '3px 7px',
      borderRadius: '4px',
      background: 'rgba(15, 23, 42, 0.96)',
      color: '#FFFFFF',
      font: '700 11px Arial, sans-serif',
      lineHeight: '14px',
      textAlign: 'center',
      whiteSpace: 'nowrap',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
      transform: 'translateY(-50%)'
    });
    this._applyElementStyles(timeLabel, {
      position: 'absolute',
      top: '0',
      padding: '3px 8px',
      borderRadius: '4px',
      background: 'rgba(15, 23, 42, 0.96)',
      color: '#FFFFFF',
      font: '700 11px Arial, sans-serif',
      lineHeight: '14px',
      whiteSpace: 'nowrap',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
      transform: 'translateX(-50%)'
    });
    this._applyElementStyles(center, {
      position: 'absolute',
      width: '6px',
      height: '6px',
      marginLeft: '-3px',
      marginTop: '-3px',
      borderRadius: '999px',
      border: '1px solid rgba(148, 163, 184, 0.9)',
      background: 'rgba(255, 255, 255, 0.92)'
    });
    [
      { left: '10.4px', top: '0', width: '1.2px', height: '8px' },
      { left: '10.4px', top: '14px', width: '1.2px', height: '8px' },
      { left: '0', top: '10.4px', width: '8px', height: '1.2px' },
      { left: '14px', top: '10.4px', width: '8px', height: '1.2px' }
    ].forEach(function (geometry) {
      var arm = document.createElement('div');
      this._applyElementStyles(arm, Object.assign({
        position: 'absolute', display: 'none', background: '#2962FF'
      }, geometry));
      center.appendChild(arm);
      centerArms.push(arm);
    }, this);
    this._applyElementStyles(tooltip, {
      position: 'absolute',
      minWidth: '148px',
      maxWidth: '190px',
      padding: '8px 9px',
      borderRadius: '6px',
      border: '1px solid rgba(148, 163, 184, 0.28)',
      background: 'rgba(15, 23, 42, 0.94)',
      color: '#E5E7EB',
      font: '600 11px Arial, sans-serif',
      lineHeight: '15px',
      boxShadow: '0 8px 22px rgba(0, 0, 0, 0.28)',
      whiteSpace: 'normal'
    });
    this._applyElementStyles(lockBadge, {
      position: 'absolute',
      display: 'none',
      padding: '2px 5px',
      borderRadius: '999px',
      background: 'rgba(37, 99, 235, 0.95)',
      color: '#FFFFFF',
      font: '700 9px Arial, sans-serif',
      lineHeight: '11px',
      letterSpacing: '0'
    });
    this._applyElementStyles(rulerRectangle, {
      position: 'absolute',
      display: 'none',
      boxSizing: 'border-box',
      border: '0',
      background: 'rgba(0, 122, 204, 0.20)',
      zIndex: '0'
    });
    this._applyElementStyles(rulerAnchor, {
      position: 'absolute',
      display: 'none',
      width: '8px',
      height: '8px',
      marginLeft: '-4px',
      marginTop: '-4px',
      boxSizing: 'border-box',
      border: '1.5px solid #D3D3D3',
      borderRadius: '999px',
      background: 'transparent',
      zIndex: '2'
    });
    this._applyElementStyles(rulerPriceLabel, {
      position: 'absolute',
      display: 'none',
      right: '0',
      minWidth: '60px',
      padding: '3px 7px',
      borderRadius: '4px',
      font: '700 11px Arial, sans-serif',
      lineHeight: '14px',
      textAlign: 'center',
      whiteSpace: 'nowrap',
      transform: 'translateY(-50%)',
      zIndex: '2'
    });
    this._applyElementStyles(rulerTimeLabel, {
      position: 'absolute',
      display: 'none',
      padding: '3px 8px',
      borderRadius: '4px',
      font: '700 11px Arial, sans-serif',
      lineHeight: '14px',
      whiteSpace: 'nowrap',
      transform: 'translateX(-50%)',
      zIndex: '2'
    });
    this._applyElementStyles(rulerLabel, {
      position: 'absolute',
      display: 'none',
      font: '400 13px Arial, sans-serif',
      lineHeight: '15px',
      padding: '1px 3px',
      background: '#D3D3D3',
      color: '#000000',
      textAlign: 'left',
      whiteSpace: 'pre',
      zIndex: '2'
    });
    this._applyElementStyles(rulerVertical, {
      position: 'absolute', display: 'none', top: '0', width: '0',
      borderLeft: '1px dashed #D3D3D3'
    });
    this._applyElementStyles(rulerHorizontal, {
      position: 'absolute', display: 'none', left: '0', height: '0',
      borderTop: '1px dashed #D3D3D3'
    });

    root.appendChild(vertical);
    root.appendChild(horizontal);
    root.appendChild(priceLabel);
    root.appendChild(timeLabel);
    root.appendChild(center);
    root.appendChild(tooltip);
    root.appendChild(lockBadge);
    root.appendChild(rulerRectangle);
    root.appendChild(rulerAnchor);
    root.appendChild(rulerPriceLabel);
    root.appendChild(rulerTimeLabel);
    root.appendChild(rulerLabel);
    root.appendChild(rulerVertical);
    root.appendChild(rulerHorizontal);
    this._chartHost.appendChild(root);
    this._crosshairOverlay = {
      root: root,
      vertical: vertical,
      horizontal: horizontal,
      priceLabel: priceLabel,
      timeLabel: timeLabel,
      center: center,
      centerArms: centerArms,
      tooltip: tooltip,
      lockBadge: lockBadge,
      rulerRectangle: rulerRectangle,
      rulerAnchor: rulerAnchor,
      rulerPriceLabel: rulerPriceLabel,
      rulerTimeLabel: rulerTimeLabel,
      rulerLabel: rulerLabel,
      rulerVertical: rulerVertical,
      rulerHorizontal: rulerHorizontal
    };

    return this._crosshairOverlay;
  };

  AdvancedDrawingToolsManager.prototype._hideCrosshairOverlay = function () {
    this._crosshairVisible = false;
    this._lastCrosshairParam = null;
    // A render queued before a toolbar toggle or drawing replay must not
    // resurrect the old cursor on the next animation frame.
    this._pendingCrosshairState = null;
    this._regularCrosshairSeedPending = false;
    this._crosshairRulerAnchor = null;
    this._regularCrosshairGestureOrigin = null;
    if (this._crosshairOverlay && this._crosshairOverlay.root) {
      this._crosshairOverlay.root.style.display = 'none';
    }
    this._notifyCrosshairCandle(null);
  };

  AdvancedDrawingToolsManager.prototype._destroyCrosshairOverlay = function () {
    if (this._crosshairRaf) {
      try {
        var cancelRaf = (typeof window !== 'undefined' && window.cancelAnimationFrame) || (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : null);
        if (cancelRaf) cancelRaf(this._crosshairRaf);
      } catch (_cancelError) {}
      this._crosshairRaf = 0;
    }
    if (this._crosshairOverlay && this._crosshairOverlay.root && this._crosshairOverlay.root.parentNode) {
      try { this._crosshairOverlay.root.parentNode.removeChild(this._crosshairOverlay.root); } catch (_error) {}
    }
    this._crosshairOverlay = null;
    this._crosshairVisible = false;
    this._lastCrosshairParam = null;
    this._lastCrosshairState = null;
    this._pendingCrosshairState = null;
    this._regularCrosshairSeedPending = false;
    this._crosshairRulerAnchor = null;
    this._regularCrosshairGestureOrigin = null;
    this._notifyCrosshairCandle(null);
  };

  AdvancedDrawingToolsManager.prototype._getCrosshairMetrics = function () {
    var width = 0;
    var height = 0;
    try {
      var rect = this._chartHost && typeof this._chartHost.getBoundingClientRect === 'function'
        ? this._chartHost.getBoundingClientRect()
        : null;
      width = rect && isFiniteNumber(rect.width) ? rect.width : 0;
      height = rect && isFiniteNumber(rect.height) ? rect.height : 0;
    } catch (_rectError) {}
    if (!(width > 0)) {
      width = this._chartHost && isFiniteNumber(this._chartHost.clientWidth) ? this._chartHost.clientWidth : 0;
    }
    if (!(height > 0)) {
      height = this._chartHost && isFiniteNumber(this._chartHost.clientHeight) ? this._chartHost.clientHeight : 0;
    }

    var rightAxisWidth = 64;
    var timeAxisHeight = 24;
    try {
      var rightPriceScale = this._chart && typeof this._chart.priceScale === 'function' ? this._chart.priceScale('right') : null;
      if (rightPriceScale && typeof rightPriceScale.width === 'function') {
        var measuredRightAxis = rightPriceScale.width();
        if (isFiniteNumber(measuredRightAxis) && measuredRightAxis >= 0) {
          rightAxisWidth = Math.max(48, measuredRightAxis);
        }
      }
    } catch (_rightAxisError) {}
    try {
      var timeScale = this._chart && typeof this._chart.timeScale === 'function' ? this._chart.timeScale() : null;
      if (timeScale && typeof timeScale.height === 'function') {
        var measuredTimeAxis = timeScale.height();
        if (isFiniteNumber(measuredTimeAxis) && measuredTimeAxis >= 0) {
          timeAxisHeight = Math.max(18, measuredTimeAxis);
        }
      }
    } catch (_timeAxisError) {}

    var paneWidth = Math.max(1, width - rightAxisWidth);
    var paneHeight = Math.max(1, height - timeAxisHeight);
    try {
      var paneSize = this._chart && typeof this._chart.paneSize === 'function' ? this._chart.paneSize(0) : null;
      if (paneSize && isFiniteNumber(paneSize.width) && paneSize.width > 0) {
        paneWidth = Math.min(width, paneSize.width);
      }
      if (paneSize && isFiniteNumber(paneSize.height) && paneSize.height > 0) {
        paneHeight = Math.min(height, paneSize.height);
      }
    } catch (_paneError) {}

    return {
      width: Math.max(1, width),
      height: Math.max(1, height),
      paneWidth: Math.max(1, paneWidth),
      paneHeight: Math.max(1, paneHeight),
      rightAxisWidth: Math.max(0, rightAxisWidth),
      timeAxisHeight: Math.max(0, timeAxisHeight)
    };
  };

  AdvancedDrawingToolsManager.prototype._resolveNearestCandle = function (time, x) {
    var data = getSeriesData(this._series);
    if (!Array.isArray(data) || data.length === 0) {
      return { candle: null, index: null };
    }

    var index = null;
    var timeScale = this._chart && typeof this._chart.timeScale === 'function' ? this._chart.timeScale() : null;
    try {
      if (timeScale && typeof timeScale.coordinateToLogical === 'function' && isFiniteNumber(x)) {
        var logical = timeScale.coordinateToLogical(x);
        if (isFiniteNumber(logical)) {
          var firstLogical = resolveTimeScaleIndex(timeScale, data[0].time, 0);
          var resolvedIndex = Math.round(logical - firstLogical);
          if (isFiniteNumber(resolvedIndex)) {
            index = Math.max(0, Math.min(data.length - 1, resolvedIndex));
          }
        }
      }
    } catch (_logicalError) {}

    if (index === null) {
      var targetComparable = timeToComparableValue(time);
      var bestDistance = Number.POSITIVE_INFINITY;
      for (var i = 0; i < data.length; i += 1) {
        var candidateComparable = timeToComparableValue(data[i] && data[i].time);
        if (targetComparable === null || candidateComparable === null) {
          continue;
        }
        var distance = Math.abs(candidateComparable - targetComparable);
        if (distance < bestDistance) {
          bestDistance = distance;
          index = i;
        }
      }
    }

    if (index === null) {
      index = Math.max(0, Math.min(data.length - 1, Math.round(data.length - 1)));
    }

    return {
      candle: data[index] || null,
      index: index
    };
  };

  AdvancedDrawingToolsManager.prototype._isSnapBypassActive = function () {
    return !!this._snapBypassActive;
  };

  AdvancedDrawingToolsManager.prototype._isMagnetSnapEnabled = function () {
    return (
      this._crosshairConfig &&
      this._crosshairConfig.snapEnabled === true &&
      this._crosshairConfig.snapType !== 'none' &&
      !this._isSnapBypassActive()
    );
  };

  AdvancedDrawingToolsManager.prototype._resolveNearestOhlcSnapPrice = function (candle, rawY) {
    if (!this._isMagnetSnapEnabled() || !candle || !this._series || !isFiniteNumber(rawY)) {
      return null;
    }

    var threshold = isFiniteNumber(this._crosshairConfig.snapThresholdPx)
      ? Math.max(0, this._crosshairConfig.snapThresholdPx)
      : 18;
    var candidates = [];
    ['open', 'high', 'low', 'close', 'value'].forEach(function (key) {
      var price = candle[key];
      if (!isFiniteNumber(price)) {
        return;
      }
      if (candidates.some(function (candidate) { return candidate.price === price; })) {
        return;
      }
      candidates.push({ key: key, price: price });
    });

    var best = null;
    candidates.forEach(function (candidate) {
      var y = null;
      try {
        y = typeof this._series.priceToCoordinate === 'function'
          ? this._series.priceToCoordinate(candidate.price)
          : null;
      } catch (_coordinateError) {
        y = null;
      }
      if (y === null || y === undefined || !isFinite(y)) {
        return;
      }
      var distance = Math.abs(y - rawY);
      if (distance <= threshold && (!best || distance < best.distance)) {
        best = { price: candidate.price, distance: distance };
      }
    }, this);

    return best ? best.price : null;
  };

  AdvancedDrawingToolsManager.prototype._resolveCrosshairPrice = function (rawPrice, candle, rawY) {
    var snapped = this._resolveNearestOhlcSnapPrice(candle, rawY);
    if (snapped !== null) {
      return snapped;
    }
    return rawPrice;
  };

  AdvancedDrawingToolsManager.prototype._resolveCrosshairState = function (param, options) {
    if (!param || !param.point || !this._series) {
      return null;
    }
    var metrics = this._getCrosshairMetrics();
    var regularCrosshairInspector = this._isRegularCrosshairInspector()
      && !(options && options.areaSeriesInspector === false);
    var inset = regularCrosshairInspector ? 2 : 0;
    var rawX = clampNumber(param.point.x, 0);
    var rawY = clampNumber(param.point.y, 0);
    if (metrics.paneWidth > 1) {
      rawX = Math.max(inset, Math.min(metrics.paneWidth - inset, rawX));
    }
    if (metrics.paneHeight > 1) {
      rawY = Math.max(inset, Math.min(metrics.paneHeight - inset, rawY));
    }

    var timeScale = this._chart && typeof this._chart.timeScale === 'function' ? this._chart.timeScale() : null;
    var x = rawX;
    if (regularCrosshairInspector && timeScale) {
      try {
        var pointerLogical = typeof timeScale.coordinateToLogical === 'function'
          ? timeScale.coordinateToLogical(rawX) : null;
        if (isFiniteNumber(pointerLogical) && typeof timeScale.logicalToCoordinate === 'function') {
          var snappedLogical = Math.round(pointerLogical);
          var firstVisible = timeScale.coordinateToLogical(inset);
          var lastVisible = timeScale.coordinateToLogical(metrics.paneWidth - inset);
          if (isFiniteNumber(firstVisible) && isFiniteNumber(lastVisible)
            && Math.ceil(firstVisible) <= Math.floor(lastVisible)) {
            snappedLogical = Math.max(Math.ceil(firstVisible), Math.min(Math.floor(lastVisible), snappedLogical));
          }
          var snappedX = timeScale.logicalToCoordinate(snappedLogical);
          if (isFiniteNumber(snappedX)) x = Math.max(0, Math.min(metrics.paneWidth, snappedX));
        }
      } catch (_inspectionSnapError) {}
    }
    var time = regularCrosshairInspector && timeScale
      ? resolveTimeFromCoordinate(timeScale, this._series, x)
      : param.time;
    if ((time === null || time === undefined) && timeScale) {
      time = resolveTimeFromCoordinate(timeScale, this._series, x);
    }
    if (time === null || time === undefined) {
      return null;
    }

    var price = typeof this._series.coordinateToPrice === 'function'
      ? this._series.coordinateToPrice(rawY)
      : null;
    if (price === null || price === undefined || !isFinite(price)) {
      return null;
    }

    var nearest = this._resolveNearestCandle(time, x);
    var candle = nearest.candle;
    var dataIndex = nearest.index;
    var areaSeriesInspector = !!(
      !(options && options.areaSeriesInspector === false) &&
      this._activeTool === 'crosshair' &&
      this._crosshairConfig.areaSeriesInspector === true &&
      candle &&
      isFiniteNumber(candle.value)
    );

    // Area points own both axes. The pointer only chooses the nearest point;
    // the inspector then sits exactly on that point instead of reporting an
    // invented price from the finger's vertical position.
    if (areaSeriesInspector) {
      time = candle.time;
      price = candle.value;
      var areaX = resolveCoordinateFromTime(this._chart, this._series, time);
      if (isFiniteNumber(areaX)) {
        x = Math.max(0, Math.min(metrics.paneWidth, areaX));
      }
    } else if (regularCrosshairInspector) {
      // The axis value is the inspected price. Ruler statistics use these
      // same digit-rounded values instead of an invisible sub-point price.
      price = Number(formatCrosshairPrice(this._series, price));
    } else {
      price = this._resolveCrosshairPrice(price, candle, rawY);
    }

    var y = rawY;
    if (typeof this._series.priceToCoordinate === 'function') {
      var priceY = this._series.priceToCoordinate(price);
      if (priceY !== null && priceY !== undefined && isFinite(priceY)) {
        y = Math.max(0, Math.min(metrics.paneHeight, priceY));
      }
    }
    var logicalIndex = null;
    try {
      logicalIndex = timeScale && typeof timeScale.coordinateToLogical === 'function'
        ? timeScale.coordinateToLogical(x)
        : null;
    } catch (_crosshairLogicalError) {}

    return {
      visible: true,
      locked: this._crosshairLocked,
      rawX: rawX,
      rawY: rawY,
      x: x,
      y: y,
      metrics: metrics,
      time: time,
      price: price,
      timestamp: isFiniteNumber(time) ? time : undefined,
      paneId: 'main',
      priceLabel: formatCrosshairPrice(this._series, price),
      timeLabel: regularCrosshairInspector
        ? formatInspectionTime(time, this._crosshairConfig.timeframe)
        : formatCrosshairTime(time, this._crosshairConfig.timeframe),
      candle: candle,
      dataIndex: dataIndex,
      logicalIndex: isFiniteNumber(logicalIndex) ? logicalIndex : null,
      areaSeriesInspector: areaSeriesInspector
    };
  };

  AdvancedDrawingToolsManager.prototype._buildTooltipHtml = function (state) {
    if (!state || !state.candle) {
      return '';
    }
    var candle = state.candle;
    if (state.areaSeriesInspector && isFiniteNumber(candle.value)) {
      return ''
        + '<div style="font-size:13px;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap;">' + state.priceLabel + '</div>'
        + '<div style="color:' + this._crosshairConfig.tooltipMuted + ';font-size:10px;font-weight:600;white-space:nowrap;">' + state.timeLabel + '</div>';
    }
    var open = isFiniteNumber(candle.open) ? candle.open : (isFiniteNumber(candle.value) ? candle.value : state.price);
    var high = isFiniteNumber(candle.high) ? candle.high : open;
    var low = isFiniteNumber(candle.low) ? candle.low : open;
    var close = isFiniteNumber(candle.close) ? candle.close : (isFiniteNumber(candle.value) ? candle.value : open);
    var change = close - open;
    var changePct = open !== 0 ? (change / open) * 100 : 0;
    var changeColor = change >= 0 ? this._crosshairConfig.upColor : this._crosshairConfig.downColor;
    var rows = [
      ['O', formatCrosshairPrice(this._series, open)],
      ['H', formatCrosshairPrice(this._series, high)],
      ['L', formatCrosshairPrice(this._series, low)],
      ['C', formatCrosshairPrice(this._series, close)]
    ];
    var volume = formatCrosshairVolume(candle.volume);
    if (volume) {
      rows.push(['Vol', volume]);
    }

    var html = ''
      + '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:5px;">'
      + '<span style="color:' + this._crosshairConfig.tooltipMuted + ';font-weight:700;">' + state.timeLabel + '</span>'
      + '<span style="color:' + changeColor + ';font-weight:800;">' + formatCrosshairPercent(changePct) + '</span>'
      + '</div>';
    rows.forEach(function (row) {
      html += '<div style="display:flex;justify-content:space-between;gap:12px;">'
        + '<span style="color:' + this._crosshairConfig.tooltipMuted + ';">' + row[0] + '</span>'
        + '<span style="font-variant-numeric:tabular-nums;">' + row[1] + '</span>'
        + '</div>';
    }, this);
    html += '<div style="display:flex;justify-content:space-between;gap:12px;margin-top:3px;">'
      + '<span style="color:' + this._crosshairConfig.tooltipMuted + ';">Chg</span>'
      + '<span style="color:' + changeColor + ';font-variant-numeric:tabular-nums;">' + formatDelta(change) + '</span>'
      + '</div>';
    return html;
  };

  AdvancedDrawingToolsManager.prototype._notifyCrosshairCandle = function (state) {
    if (!state || !state.candle) {
      if (this._lastNotifiedCrosshairSignature !== '') {
        this._lastNotifiedCrosshairSignature = '';
        safeNotify('CHART_CROSSHAIR_CANDLE', { active: false });
      }
      return;
    }

    var candle = state.candle;
    var payloadCandle = {
      time: isFiniteNumber(candle.time) ? candle.time : null,
      open: isFiniteNumber(candle.open) ? candle.open : (isFiniteNumber(candle.value) ? candle.value : null),
      high: isFiniteNumber(candle.high) ? candle.high : (isFiniteNumber(candle.value) ? candle.value : null),
      low: isFiniteNumber(candle.low) ? candle.low : (isFiniteNumber(candle.value) ? candle.value : null),
      close: isFiniteNumber(candle.close) ? candle.close : (isFiniteNumber(candle.value) ? candle.value : null),
      volume: isFiniteNumber(candle.volume) ? candle.volume : null
    };
    var signature = [
      state.dataIndex,
      payloadCandle.time,
      payloadCandle.open,
      payloadCandle.high,
      payloadCandle.low,
      payloadCandle.close,
      payloadCandle.volume,
      state.locked ? 'locked' : 'free'
    ].join('|');
    if (signature === this._lastNotifiedCrosshairSignature) {
      return;
    }
    this._lastNotifiedCrosshairSignature = signature;
    safeNotify('CHART_CROSSHAIR_CANDLE', {
      active: true,
      locked: !!state.locked,
      dataIndex: state.dataIndex,
      timeLabel: state.timeLabel,
      candle: payloadCandle
    });
  };

  AdvancedDrawingToolsManager.prototype._styleCrosshairAxisLabel = function (element, regularInspector, isTime) {
    element.style.background = regularInspector ? '#D3D3D3' : this._crosshairConfig.labelBackground;
    element.style.color = regularInspector ? '#000000' : this._crosshairConfig.labelText;
    element.style.font = regularInspector ? '400 13px Arial, sans-serif' : '700 11px Arial, sans-serif';
    element.style.lineHeight = regularInspector ? '15px' : '14px';
    element.style.padding = regularInspector ? '0 3px' : (isTime ? '3px 8px' : '3px 7px');
    element.style.borderRadius = regularInspector ? '0' : '4px';
    element.style.boxShadow = regularInspector ? 'none' : '0 2px 8px rgba(0, 0, 0, 0.25)';
    if (!isTime) element.style.minWidth = regularInspector ? '0' : '60px';
  };

  AdvancedDrawingToolsManager.prototype._styleCrosshairGuide = function (element, vertical, regularInspector, color, solid) {
    var ratio = 1;
    try {
      if (typeof window !== 'undefined' && isFiniteNumber(window.devicePixelRatio) && window.devicePixelRatio > 0) {
        ratio = window.devicePixelRatio;
      }
    } catch (_guideRatioError) {}
    element.style.borderLeft = '0';
    element.style.borderTop = '0';
    element.style.marginLeft = '0';
    element.style.marginTop = '0';
    element.style.background = 'none';
    if (regularInspector) {
      var thickness = 2 / ratio;
      var dash = 12 / ratio;
      var period = 21 / ratio;
      element.style[vertical ? 'width' : 'height'] = thickness + 'px';
      element.style[vertical ? 'marginLeft' : 'marginTop'] = (-thickness / 2) + 'px';
      element.style.background = 'repeating-linear-gradient(to ' + (vertical ? 'bottom' : 'right')
        + ', ' + color + ' 0px, ' + color + ' ' + dash + 'px, transparent ' + dash + 'px, transparent ' + period + 'px)';
      return;
    }
    element.style[vertical ? 'width' : 'height'] = '0';
    element.style[vertical ? 'borderLeft' : 'borderTop'] = '1px ' + (solid ? 'solid ' : 'dashed ') + color;
  };

  AdvancedDrawingToolsManager.prototype._resolveCrosshairBackground = function () {
    var opaque = function (color) {
      if (typeof color !== 'string' || !color.trim() || /^(transparent|none)$/i.test(color.trim())) return null;
      var alpha = color.match(/^rgba\\([^,]+,[^,]+,[^,]+,\\s*([\\d.]+)\\s*\\)$/i);
      if (alpha && Number(alpha[1]) < 1) return null;
      if (/^#[0-9a-f]{8}$/i.test(color) && color.slice(-2).toLowerCase() !== 'ff') return null;
      return color;
    };
    try {
      var options = this._chart && typeof this._chart.options === 'function' ? this._chart.options() : null;
      var background = options && options.layout && options.layout.background;
      var chartColor = opaque(background && background.color);
      if (chartColor) return chartColor;
    } catch (_chartBackgroundError) {}
    try {
      var computed = typeof window !== 'undefined' && typeof window.getComputedStyle === 'function' && this._chartHost
        ? window.getComputedStyle(this._chartHost) : null;
      var hostColor = opaque(computed && computed.backgroundColor);
      if (hostColor) return hostColor;
    } catch (_hostBackgroundError) {}
    return '#000000';
  };

  AdvancedDrawingToolsManager.prototype._renderCrosshairOverlay = function (state) {
    var overlay = this._ensureCrosshairOverlay();
    if (!overlay || !state) {
      return;
    }

    var metrics = state.metrics;
    var areaSeriesInspector = state.areaSeriesInspector === true;
    var regularCrosshairInspector = this._isRegularCrosshairInspector();
    var lineColor = regularCrosshairInspector ? '#D3D3D3' : this._crosshairConfig.lineColor;
    overlay.root.style.display = 'block';
    overlay.vertical.style.display = 'block';
    this._styleCrosshairGuide(overlay.vertical, true, regularCrosshairInspector, lineColor, areaSeriesInspector);
    overlay.horizontal.style.display = areaSeriesInspector ? 'none' : 'block';
    this._styleCrosshairGuide(overlay.horizontal, false, regularCrosshairInspector, lineColor, false);
    overlay.vertical.style.left = Math.round(state.x) + 'px';
    overlay.vertical.style.top = '0px';
    overlay.vertical.style.height = Math.round(metrics.paneHeight) + 'px';
    overlay.horizontal.style.left = '0px';
    overlay.horizontal.style.top = Math.round(state.y) + 'px';
    overlay.horizontal.style.width = Math.round(metrics.paneWidth) + 'px';
    overlay.vertical.style.zIndex = regularCrosshairInspector ? '1' : '';
    overlay.horizontal.style.zIndex = regularCrosshairInspector ? '1' : '';
    overlay.center.style.left = Math.round(state.x) + 'px';
    overlay.center.style.top = Math.round(state.y) + 'px';
    overlay.center.style.display = 'block';
    overlay.centerArms.forEach(function (arm) { arm.style.display = regularCrosshairInspector ? 'block' : 'none'; });
    overlay.center.style.width = regularCrosshairInspector ? '22px' : '6px';
    overlay.center.style.height = regularCrosshairInspector ? '22px' : '6px';
    overlay.center.style.marginLeft = regularCrosshairInspector ? '-11px' : '-3px';
    overlay.center.style.marginTop = regularCrosshairInspector ? '-11px' : '-3px';
    overlay.center.style.borderRadius = regularCrosshairInspector ? '0' : '999px';
    overlay.center.style.border = regularCrosshairInspector ? '0' : '1px solid ' + (areaSeriesInspector ? lineColor : 'rgba(148, 163, 184, 0.9)');
    overlay.center.style.background = regularCrosshairInspector ? 'transparent' : (areaSeriesInspector ? lineColor : 'rgba(255, 255, 255, 0.92)');
    overlay.center.style.color = '#2962FF';
    overlay.center.style.font = '400 26px Arial, sans-serif';
    overlay.center.style.lineHeight = '22px';
    overlay.center.style.textAlign = 'center';
    overlay.center.style.zIndex = '3';

    overlay.priceLabel.textContent = state.priceLabel;
    overlay.priceLabel.style.display = areaSeriesInspector ? 'none' : 'block';
    this._styleCrosshairAxisLabel(overlay.priceLabel, regularCrosshairInspector, false);
    overlay.priceLabel.style.top = Math.round(Math.max(10, Math.min(metrics.paneHeight - 10, state.y))) + 'px';

    overlay.timeLabel.textContent = state.timeLabel;
    overlay.timeLabel.style.display = areaSeriesInspector ? 'none' : 'block';
    this._styleCrosshairAxisLabel(overlay.timeLabel, regularCrosshairInspector, true);
    overlay.timeLabel.style.top = Math.round(metrics.paneHeight) + 'px';
    var timeLabelWidth = overlay.timeLabel.offsetWidth || Math.max(68, state.timeLabel.length * 7 + 18);
    var clampedTimeX = Math.max(timeLabelWidth / 2 + 2, Math.min(metrics.paneWidth - timeLabelWidth / 2 - 2, state.x));
    overlay.timeLabel.style.left = Math.round(clampedTimeX) + 'px';

    overlay.tooltip.style.display = regularCrosshairInspector ? 'none' : 'block';
    overlay.tooltip.innerHTML = regularCrosshairInspector ? '' : this._buildTooltipHtml(state);
    overlay.tooltip.style.background = this._crosshairConfig.tooltipBackground;
    overlay.tooltip.style.borderColor = this._crosshairConfig.tooltipBorder;
    overlay.tooltip.style.color = this._crosshairConfig.tooltipText;
    overlay.tooltip.style.minWidth = areaSeriesInspector ? '104px' : '148px';
    overlay.tooltip.style.maxWidth = areaSeriesInspector ? '156px' : '190px';
    var tooltipWidth = overlay.tooltip.offsetWidth || (areaSeriesInspector ? 124 : 164);
    var tooltipHeight = overlay.tooltip.offsetHeight || (areaSeriesInspector ? 48 : 112);
    var tooltipLeft = state.x + 14;
    if (tooltipLeft + tooltipWidth > metrics.paneWidth - 6) {
      tooltipLeft = state.x - tooltipWidth - 14;
    }
    tooltipLeft = Math.max(6, Math.min(metrics.paneWidth - tooltipWidth - 6, tooltipLeft));
    var tooltipTop = state.y + 14;
    if (tooltipTop + tooltipHeight > metrics.paneHeight - 6) {
      tooltipTop = state.y - tooltipHeight - 14;
    }
    tooltipTop = Math.max(6, Math.min(metrics.paneHeight - tooltipHeight - 6, tooltipTop));
    overlay.tooltip.style.left = Math.round(tooltipLeft) + 'px';
    overlay.tooltip.style.top = Math.round(tooltipTop) + 'px';

    overlay.lockBadge.style.display = !regularCrosshairInspector && state.locked ? 'block' : 'none';
    overlay.lockBadge.textContent = regularCrosshairInspector ? '' : 'LOCK';
    overlay.lockBadge.style.left = Math.round(Math.max(4, Math.min(metrics.paneWidth - 36, state.x + 8))) + 'px';
    overlay.lockBadge.style.top = Math.round(Math.max(4, Math.min(metrics.paneHeight - 18, state.y - 18))) + 'px';
    this._renderCrosshairRuler(overlay, state);
    this._notifyCrosshairCandle(state);
  };

  AdvancedDrawingToolsManager.prototype._resolveCrosshairPointSize = function () {
    if (isFiniteNumber(this._crosshairConfig.pointSize) && this._crosshairConfig.pointSize > 0) {
      return this._crosshairConfig.pointSize;
    }
    try {
      var options = this._series && typeof this._series.options === 'function' ? this._series.options() : null;
      var format = options && options.priceFormat;
      if (format && isFiniteNumber(format.precision) && format.precision >= 0 && format.precision <= 12) {
        return Math.pow(10, -Math.round(format.precision));
      }
    } catch (_pointSizeError) {}
    return null;
  };

  AdvancedDrawingToolsManager.prototype._buildCrosshairRulerLabel = function (anchor, endpoint) {
    var delta = endpoint.price - anchor.price;
    var pointSize = this._resolveCrosshairPointSize();
    var amount = pointSize ? Math.round(Math.abs(delta) / pointSize) + ' points' : 'Price change';
    var deltaLabel = (delta >= 0 ? '+' : '') + formatCrosshairPrice(this._series, delta);
    var values = [];
    if (anchor.price !== 0) {
      values.push((delta > 0 ? '+' : '') + ((delta / Math.abs(anchor.price)) * 100).toFixed(2) + '%');
    }
    values.push(deltaLabel);
    var firstLine = amount + ' (' + values.join(', ') + ')';
    var secondLine = '';
    var anchorIndex = isFiniteNumber(anchor.logicalIndex) ? anchor.logicalIndex : anchor.dataIndex;
    var endpointIndex = isFiniteNumber(endpoint.logicalIndex) ? endpoint.logicalIndex : endpoint.dataIndex;
    if (isFiniteNumber(anchorIndex) && isFiniteNumber(endpointIndex)) {
      secondLine = Math.abs(Math.round(endpointIndex - anchorIndex)) + ' bars';
    }
    // Broker candle timestamps own elapsed time; bar counts must not invent it
    // across weekends, session breaks, or a sparse historical series.
    if (isFiniteNumber(anchor.time) && isFiniteNumber(endpoint.time)) {
      var elapsed = Math.abs(endpoint.time - anchor.time);
      secondLine += (secondLine ? ', ' : '') + formatInspectionDuration(elapsed);
    }
    return firstLine + (secondLine ? '\\n' + secondLine : '');
  };

  AdvancedDrawingToolsManager.prototype._renderCrosshairRuler = function (overlay, endpoint) {
    var anchor = this._isRegularCrosshairInspector() ? this._crosshairRulerAnchor : null;
    var nodes = [overlay.rulerRectangle, overlay.rulerAnchor, overlay.rulerPriceLabel, overlay.rulerTimeLabel, overlay.rulerLabel, overlay.rulerVertical, overlay.rulerHorizontal];
    nodes.forEach(function (node) { node.style.display = anchor ? 'block' : 'none'; });
    if (!anchor) return;

    var metrics = endpoint.metrics;
    var negative = endpoint.price < anchor.price;
    var left = Math.min(anchor.x, endpoint.x);
    var top = Math.min(anchor.y, endpoint.y);
    var width = Math.abs(endpoint.x - anchor.x);
    var height = Math.abs(endpoint.y - anchor.y);
    overlay.rulerRectangle.style.left = Math.round(left) + 'px';
    overlay.rulerRectangle.style.top = Math.round(top) + 'px';
    overlay.rulerRectangle.style.width = Math.round(width) + 'px';
    overlay.rulerRectangle.style.height = Math.round(height) + 'px';
    overlay.rulerRectangle.style.background = negative ? 'rgba(244, 67, 54, 0.20)' : 'rgba(33, 150, 243, 0.20)';
    overlay.rulerAnchor.style.background = this._resolveCrosshairBackground();
    overlay.rulerAnchor.style.left = Math.round(anchor.x) + 'px';
    overlay.rulerAnchor.style.top = Math.round(anchor.y) + 'px';
    this._styleCrosshairGuide(overlay.rulerVertical, true, true, '#D3D3D3', false);
    this._styleCrosshairGuide(overlay.rulerHorizontal, false, true, '#D3D3D3', false);
    overlay.rulerVertical.style.left = Math.round(anchor.x) + 'px';
    overlay.rulerVertical.style.height = Math.round(metrics.paneHeight) + 'px';
    overlay.rulerVertical.style.zIndex = '1';
    overlay.rulerHorizontal.style.top = Math.round(anchor.y) + 'px';
    overlay.rulerHorizontal.style.width = Math.round(metrics.paneWidth) + 'px';
    overlay.rulerHorizontal.style.zIndex = '1';

    overlay.rulerPriceLabel.textContent = anchor.priceLabel;
    this._styleCrosshairAxisLabel(overlay.rulerPriceLabel, true, false);
    overlay.rulerPriceLabel.style.top = Math.round(Math.max(10, Math.min(metrics.paneHeight - 10, anchor.y))) + 'px';
    overlay.rulerTimeLabel.textContent = anchor.timeLabel;
    this._styleCrosshairAxisLabel(overlay.rulerTimeLabel, true, true);
    overlay.rulerTimeLabel.style.top = Math.round(metrics.paneHeight) + 'px';
    var timeWidth = overlay.rulerTimeLabel.offsetWidth || Math.max(68, anchor.timeLabel.length * 7 + 18);
    overlay.rulerTimeLabel.style.left = Math.round(Math.max(timeWidth / 2 + 2, Math.min(metrics.paneWidth - timeWidth / 2 - 2, anchor.x))) + 'px';

    overlay.rulerLabel.textContent = this._buildCrosshairRulerLabel(anchor, endpoint);
    var lines = overlay.rulerLabel.textContent.split('\\n');
    var labelWidth = overlay.rulerLabel.offsetWidth || Math.max.apply(Math, lines.map(function (line) { return line.length * 6.5 + 6; }));
    var labelHeight = overlay.rulerLabel.offsetHeight || lines.length * 15 + 2;
    var gap = 4;
    var labelLeft = endpoint.x + gap;
    if (labelLeft + labelWidth > metrics.paneWidth - 4) labelLeft = endpoint.x - labelWidth - gap;
    var positive = endpoint.price > anchor.price;
    var labelTop = positive ? endpoint.y - labelHeight - gap : endpoint.y + gap;
    if (labelTop < 4) labelTop = endpoint.y + gap;
    if (labelTop + labelHeight > metrics.paneHeight - 4) labelTop = endpoint.y - labelHeight - gap;
    overlay.rulerLabel.style.left = Math.round(Math.max(4, Math.min(metrics.paneWidth - labelWidth - 4, labelLeft))) + 'px';
    overlay.rulerLabel.style.top = Math.round(Math.max(4, Math.min(metrics.paneHeight - labelHeight - 4, labelTop))) + 'px';
  };

  AdvancedDrawingToolsManager.prototype._handleRegularCrosshairTap = function (param, origin) {
    if (this._crosshairRulerAnchor) {
      this.setActiveTool('none');
      return;
    }
    var anchor = origin || this._resolveCrosshairState(this._lastCrosshairParam);
    if (!anchor || !this._resolveCrosshairState(param)) return;
    this._crosshairRulerAnchor = anchor;
    this._updateCrosshairOverlay(param, true);
  };

  AdvancedDrawingToolsManager.prototype._buildRegularCrosshairDragParam = function (touch) {
    var origin = this._regularCrosshairGestureOrigin;
    if (!origin || !touch) return null;
    var param = {
      point: {
        x: origin.x + touch.clientX - (isFiniteNumber(origin.dragClientX) ? origin.dragClientX : this._touchStartX),
        y: origin.y + touch.clientY - (isFiniteNumber(origin.dragClientY) ? origin.dragClientY : this._touchStartY)
      },
      time: null
    };
    // At a pane edge discard outward overshoot so reversing the finger moves
    // the visible cursor immediately. Away from edges retain the full delta;
    // rebasing every bar snap would lose slow sub-bar motion.
    var metrics = this._getCrosshairMetrics();
    var clippedX = param.point.x < 2 || param.point.x > metrics.paneWidth - 2;
    var clippedY = param.point.y < 2 || param.point.y > metrics.paneHeight - 2;
    if (clippedX || clippedY) {
      var clippedState = this._resolveCrosshairState(param);
      if (clippedState) {
        if (clippedX) {
          origin.x = clippedState.x;
          origin.dragClientX = touch.clientX;
        }
        if (clippedY) {
          origin.y = clippedState.y;
          origin.dragClientY = touch.clientY;
        }
      }
    }
    return param;
  };

  AdvancedDrawingToolsManager.prototype._scheduleCrosshairRender = function (state) {
    this._pendingCrosshairState = state;
    if (this._crosshairRaf) {
      return;
    }
    var self = this;
    var raf = null;
    try {
      raf = (typeof window !== 'undefined' && window.requestAnimationFrame) || (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null);
    } catch (_rafError) {
      raf = null;
    }
    var render = function () {
      self._crosshairRaf = 0;
      var nextState = self._pendingCrosshairState;
      self._pendingCrosshairState = null;
      if (nextState) {
        self._lastCrosshairState = nextState;
        self._crosshairVisible = true;
        self._renderCrosshairOverlay(nextState);
      }
    };
    this._crosshairRaf = raf ? raf(render) : 0;
    if (!raf) {
      render();
    }
  };

  AdvancedDrawingToolsManager.prototype._updateCrosshairOverlay = function (param, force) {
    if (this._crosshairLocked && !force) {
      return false;
    }
    var state = this._resolveCrosshairState(param);
    if (!state) {
      if (!this._crosshairLocked && !this._isRegularCrosshairInspector()) {
        this._hideCrosshairOverlay();
      }
      return false;
    }
    this._lastCrosshairParam = {
      point: this._isRegularCrosshairInspector()
        ? { x: state.x, y: state.y }
        : { x: state.rawX, y: state.rawY },
      time: state.time
    };
    this._scheduleCrosshairRender(state);
    return true;
  };

  AdvancedDrawingToolsManager.prototype._handleCrosshairMove = function (param) {
    // The direct bridge owns mobile relative movement. Library hover events
    // contain absolute finger coordinates and must not jump this cursor.
    if (this._isRegularCrosshairInspector() && this.shouldUseDirectTouchInput()) return;
    if (this._isPinchActive()) {
      // Pinch/zoom: lightweight-charts still emits crosshairMove for the moving
      // fingers. Do not show the crosshair overlay from a zoom gesture.
      if (!this._crosshairLocked && !this._isRegularCrosshairInspector()) {
        this._hideCrosshairOverlay();
      }
      return;
    }
    if (!param || !param.point) {
      if (!this._crosshairLocked && !this._isRegularCrosshairInspector()) {
        this._hideCrosshairOverlay();
      }
      this._setHoveredRecord(null);
      return;
    }
    var drawingMode = this._isDrawingToolActive();
    if (this._activeTool === 'none' || (this._activeTool !== 'crosshair' && !drawingMode)) {
      if (!this._crosshairLocked) {
        this._hideCrosshairOverlay();
      }
      this._setHoveredRecord(null);
      return;
    }
    if (this._activeTool === 'crosshair' && !this._lineEditState) {
      var hoverHit = this._hitTestEditableDrawingAtPoint(param.point);
      this._setHoveredRecord(hoverHit && hoverHit.record ? hoverHit.record.id : null);
    } else {
      this._setHoveredRecord(null);
    }
    this._updateCrosshairOverlay(param, drawingMode);
  };

  AdvancedDrawingToolsManager.prototype._handleCrosshairClick = function (param) {
    if (this._activeTool !== 'crosshair' || !param || !param.point) {
      return;
    }
    if (this._isPinchActive()) {
      // Trailing click that lightweight-charts fires when a pinch ends — must not
      // toggle/lock the crosshair.
      return;
    }
    this._suppressHostTapMenu();
    if (this._ignoreCrosshairClickUntil && Date.now() <= this._ignoreCrosshairClickUntil) {
      return;
    }
    var drawingHit = this._hitTestEditableDrawingAtPoint(param.point);
    if (drawingHit && drawingHit.record) {
      this._crosshairLocked = false;
      this._hideCrosshairOverlay();
      this._selectRecord(drawingHit.record.id);
      return;
    }
    if (this._selectedRecordId) {
      this._selectRecord(null);
      return;
    }
    if (this._isRegularCrosshairInspector()) {
      this._crosshairLocked = false;
      this._handleRegularCrosshairTap(param);
      return;
    }
    if (this._crosshairLocked) {
      this._crosshairLocked = false;
      this._hideCrosshairOverlay();
      return;
    }
    this._crosshairLocked = true;
    this._updateCrosshairOverlay(param, true);
  };

  AdvancedDrawingToolsManager.prototype._handleKeyDown = function (event) {
    var key = event && typeof event.key === 'string' ? event.key : '';
    if (this._textEditState) {
      if (key === 'Enter') {
        this._consumeTouchEvent(event);
        this._endTextRecordEdit(true);
      } else if (key === 'Escape' || key === 'Esc') {
        this._consumeTouchEvent(event);
        this._endTextRecordEdit(false);
      }
      return;
    }
    if (key === 'Control' || key === 'Meta' || key === 'Alt') {
      this._snapBypassActive = true;
    }
    if (key === 'Escape' || key === 'Esc') {
      this._crosshairLocked = false;
      this._hideCrosshairOverlay();
      this._endLineEdit(false);
      if (this._selectedRecordId) {
        this._selectRecord(null);
      }
      if (this._activeTool !== 'none') {
        this.setActiveTool('none');
      }
      return;
    }
    if ((key === 'Delete' || key === 'Backspace') && this._selectedRecordId) {
      this._removeSelectedRecord();
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      return;
    }
    if ((key === 'Control' || key === 'Meta') && this._lastCrosshairParam) {
      this._updateCrosshairOverlay(this._lastCrosshairParam, true);
    }
  };

  AdvancedDrawingToolsManager.prototype._handleKeyUp = function (event) {
    var key = event && typeof event.key === 'string' ? event.key : '';
    if (key === 'Control' || key === 'Meta' || key === 'Alt') {
      this._snapBypassActive = false;
      if (this._lastCrosshairParam) {
        this._updateCrosshairOverlay(this._lastCrosshairParam, true);
      }
    }
  };

  AdvancedDrawingToolsManager.prototype._suppressHostTapMenu = function () {
    try {
      if (typeof window !== 'undefined') {
        window.__rtx5SuppressChartTapUntil = Date.now() + 550;
      }
    } catch (_error) {}
  };

  AdvancedDrawingToolsManager.prototype.refreshCrosshairData = function () {
    // Live data changed → autoscale may have shifted price coordinates.
    this._refreshDrawingBadges();
    if (this._regularCrosshairSeedPending && this._showCenteredCrosshair()) {
      return;
    }
    if (
      this._areaInspectorSeedPending === true &&
      this._activeTool === 'crosshair' &&
      this._crosshairConfig.areaSeriesInspector === true &&
      this._showLatestAreaSeriesPoint()
    ) {
      return;
    }
    var pendingRegularCursor = this._isRegularCrosshairInspector() && !!this._pendingCrosshairState;
    if (!this._lastCrosshairParam || (!this._crosshairVisible && !this._crosshairLocked && !pendingRegularCursor)) {
      return;
    }
    if (this._isRegularCrosshairInspector()) {
      // Regular inspection retains screen positions. Resolve both ruler ends
      // against the current scale so live autoscale cannot detach a label or
      // measurement from the price/time drawn under its guide.
      if (this._crosshairRulerAnchor) {
        var anchor = this._crosshairRulerAnchor;
        var refreshedAnchor = this._resolveCrosshairState({
          point: { x: anchor.x, y: anchor.y }, time: null
        });
        if (refreshedAnchor) this._crosshairRulerAnchor = refreshedAnchor;
      }
      this._updateCrosshairOverlay({ point: this._lastCrosshairParam.point, time: null }, true);
      return;
    }
    this._updateCrosshairOverlay(this._lastCrosshairParam, true);
  };

  AdvancedDrawingToolsManager.prototype._showCenteredCrosshair = function () {
    if (!this._isRegularCrosshairInspector()) {
      this._regularCrosshairSeedPending = false;
      return false;
    }
    var data = getSeriesData(this._series);
    var metrics = this._getCrosshairMetrics();
    if (!Array.isArray(data) || data.length === 0 || metrics.paneWidth <= 1 || metrics.paneHeight <= 1) {
      this._regularCrosshairSeedPending = true;
      return false;
    }
    var shown = this._updateCrosshairOverlay({
      point: { x: metrics.paneWidth / 2, y: metrics.paneHeight / 2 },
      time: null
    }, true);
    this._regularCrosshairSeedPending = !shown;
    return shown;
  };

  AdvancedDrawingToolsManager.prototype._showLatestAreaSeriesPoint = function () {
    if (this._activeTool !== 'crosshair' || this._crosshairConfig.areaSeriesInspector !== true) {
      this._areaInspectorSeedPending = false;
      return false;
    }
    var data = getSeriesData(this._series);
    if (!Array.isArray(data) || data.length === 0) {
      this._areaInspectorSeedPending = true;
      return false;
    }
    var latest = null;
    for (var i = data.length - 1; i >= 0; i -= 1) {
      if (data[i] && data[i].time !== null && data[i].time !== undefined && isFiniteNumber(data[i].value)) {
        latest = data[i];
        break;
      }
    }
    if (!latest) {
      this._areaInspectorSeedPending = true;
      return false;
    }
    var x = resolveCoordinateFromTime(this._chart, this._series, latest.time);
    var y = null;
    try {
      y = typeof this._series.priceToCoordinate === 'function'
        ? this._series.priceToCoordinate(latest.value)
        : null;
    } catch (_priceCoordinateError) {
      y = null;
    }
    if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
      this._areaInspectorSeedPending = true;
      return false;
    }
    this._areaInspectorSeedPending = false;
    this._updateCrosshairOverlay({
      point: { x: x, y: y },
      time: latest.time
    }, true);
    return true;
  };

  AdvancedDrawingToolsManager.prototype.setCrosshairConfig = function (config) {
    if (!config || typeof config !== 'object') {
      return;
    }
    var snap = config.snap && typeof config.snap === 'object' ? config.snap : null;
    var snapEnabled = snap && typeof snap.enabled === 'boolean'
      ? snap.enabled
      : (typeof config.snapEnabled === 'boolean' ? config.snapEnabled : this._crosshairConfig.snapEnabled);
    var snapType = snap && typeof snap.type === 'string'
      ? snap.type
      : (typeof config.snapType === 'string' ? config.snapType : this._crosshairConfig.snapType);
    if (snap && snap.enabled === true && (!snap.type || snapType === 'none')) {
      snapType = 'ohlc-nearest';
    }
    if (snap && snap.enabled === false) {
      snapType = 'none';
    }
    var hasPointSize = Object.prototype.hasOwnProperty.call(config, 'pointSize');
    var nextPointSize = hasPointSize
      ? (isFiniteNumber(config.pointSize) && config.pointSize > 0 ? config.pointSize : null)
      : this._crosshairConfig.pointSize;
    if (!hasPointSize && typeof config.symbol === 'string' && config.symbol !== this._crosshairConfig.symbol) {
      nextPointSize = null;
    }
    this._crosshairConfig = Object.assign({}, this._crosshairConfig, {
      symbol: typeof config.symbol === 'string' ? config.symbol : this._crosshairConfig.symbol,
      timeframe: typeof config.timeframe === 'string' ? config.timeframe : this._crosshairConfig.timeframe,
      lineColor: typeof config.lineColor === 'string' ? config.lineColor : this._crosshairConfig.lineColor,
      labelBackground: typeof config.labelBackground === 'string' ? config.labelBackground : this._crosshairConfig.labelBackground,
      labelText: typeof config.labelText === 'string' ? config.labelText : this._crosshairConfig.labelText,
      tooltipBackground: typeof config.tooltipBackground === 'string' ? config.tooltipBackground : this._crosshairConfig.tooltipBackground,
      tooltipBorder: typeof config.tooltipBorder === 'string' ? config.tooltipBorder : this._crosshairConfig.tooltipBorder,
      tooltipText: typeof config.tooltipText === 'string' ? config.tooltipText : this._crosshairConfig.tooltipText,
      tooltipMuted: typeof config.tooltipMuted === 'string' ? config.tooltipMuted : this._crosshairConfig.tooltipMuted,
      upColor: typeof config.upColor === 'string' ? config.upColor : this._crosshairConfig.upColor,
      downColor: typeof config.downColor === 'string' ? config.downColor : this._crosshairConfig.downColor,
      areaSeriesInspector: typeof config.areaSeriesInspector === 'boolean' ? config.areaSeriesInspector : this._crosshairConfig.areaSeriesInspector,
      pointSize: nextPointSize,
      snapEnabled: snapEnabled === true,
      snapType: snapType,
      snapThresholdPx: snap && isFiniteNumber(snap.thresholdPx) ? snap.thresholdPx : (isFiniteNumber(config.snapThresholdPx) ? config.snapThresholdPx : this._crosshairConfig.snapThresholdPx)
    });
    if (this._crosshairConfig.areaSeriesInspector !== true) {
      this._areaInspectorSeedPending = false;
      if (this._isRegularCrosshairInspector()) this._crosshairLocked = false;
    } else {
      this._crosshairRulerAnchor = null;
      this._regularCrosshairGestureOrigin = null;
      this._regularCrosshairSeedPending = false;
    }
    if (
      this._activeTool === 'crosshair' &&
      this._crosshairConfig.areaSeriesInspector === true &&
      this._showLatestAreaSeriesPoint()
    ) {
      return;
    }
    this.refreshCrosshairData();
  };

  AdvancedDrawingToolsManager.prototype._supportsPointerTouchBridge = function () {
    try {
      return typeof window !== 'undefined' && typeof window.PointerEvent === 'function';
    } catch (_error) {
      return false;
    }
  };

  AdvancedDrawingToolsManager.prototype._isTouchPointerEvent = function (event) {
    if (!event) return false;
    if (!event.pointerType) return true;
    return event.pointerType === 'touch' || event.pointerType === 'pen';
  };

  AdvancedDrawingToolsManager.prototype._makeTouchLikeFromPointerEvent = function (event) {
    if (!this._isTouchPointerEvent(event)) {
      return null;
    }
    if (!isFiniteNumber(event.clientX) || !isFiniteNumber(event.clientY)) {
      return null;
    }
    var pointerId = event.pointerId;
    return {
      identifier: pointerId === undefined || pointerId === null ? 1 : pointerId,
      clientX: event.clientX,
      clientY: event.clientY
    };
  };

  AdvancedDrawingToolsManager.prototype._activePointerTouchList = function () {
    var touches = [];
    Object.keys(this._activePointerTouches || {}).forEach(function (key) {
      var touch = this._activePointerTouches[key];
      if (touch) {
        touches.push(touch);
      }
    }, this);
    return touches;
  };

  AdvancedDrawingToolsManager.prototype._buildPointerTouchEvent = function (event, phase) {
    var touch = this._makeTouchLikeFromPointerEvent(event);
    if (!touch) {
      return null;
    }
    var key = String(touch.identifier);
    if (phase === 'start' || phase === 'move') {
      this._activePointerTouches[key] = touch;
    }
    if (phase === 'end' || phase === 'cancel') {
      delete this._activePointerTouches[key];
    }
    var touches = this._activePointerTouchList();
    var changedTouches = [touch];
    return {
      touches: touches,
      targetTouches: touches,
      changedTouches: changedTouches,
      preventDefault: function () {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
      },
      stopPropagation: function () {
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
      },
      stopImmediatePropagation: function () {
        if (event && typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
      }
    };
  };

  AdvancedDrawingToolsManager.prototype._handlePointerStart = function (event) {
    var touchEvent = this._buildPointerTouchEvent(event, 'start');
    if (!touchEvent) {
      return;
    }
    this._handleTouchStart(touchEvent);
  };

  AdvancedDrawingToolsManager.prototype._handlePointerMove = function (event) {
    var touchEvent = this._buildPointerTouchEvent(event, 'move');
    if (!touchEvent) {
      return;
    }
    this._handleTouchMove(touchEvent);
  };

  AdvancedDrawingToolsManager.prototype._handlePointerEnd = function (event) {
    var touchEvent = this._buildPointerTouchEvent(event, 'end');
    if (!touchEvent) {
      return;
    }
    this._handleTouchEnd(touchEvent);
  };

  AdvancedDrawingToolsManager.prototype._handlePointerCancel = function (event) {
    var touchEvent = this._buildPointerTouchEvent(event, 'cancel');
    if (!touchEvent) {
      return;
    }
    this._handleTouchCancel(touchEvent);
  };

  AdvancedDrawingToolsManager.prototype._getActiveTouchTool = function () {
    if (!this._isDrawingToolActive()) {
      return null;
    }

    var tool = this._tools[this._activeTool];
    if (!tool || typeof tool.isDrawing !== 'function' || !tool.isDrawing()) {
      return null;
    }

    return tool;
  };

  AdvancedDrawingToolsManager.prototype._findTrackedTouch = function (touchList) {
    if (!touchList || typeof touchList.length !== 'number') {
      return null;
    }

    var fallback = null;
    for (var i = 0; i < touchList.length; i++) {
      var touch = typeof touchList.item === 'function' ? touchList.item(i) : touchList[i];
      if (!touch) continue;
      if (!fallback) {
        fallback = touch;
      }
      if (this._activeTouchId === null || this._activeTouchId === undefined || touch.identifier === this._activeTouchId) {
        return touch;
      }
    }

    return fallback;
  };

  AdvancedDrawingToolsManager.prototype._snapPriceToSeriesBar = function (timeScale, time, price, x, rawY) {
    var nearest = this._resolveNearestCandle(time, x);
    return this._resolveNearestOhlcSnapPrice(nearest.candle, rawY);
  };

  AdvancedDrawingToolsManager.prototype._buildSyntheticPointerParam = function (touch, options) {
    if (!touch || !this._chartHost || !this._chart || !this._series) {
      return null;
    }

    var rect = this._chartHost.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) {
      return null;
    }

    var x = clampNumber(touch.clientX - rect.left, 0);
    var y = clampNumber(touch.clientY - rect.top, 0);
    x = Math.max(0, Math.min(rect.width, x));
    y = Math.max(0, Math.min(rect.height, y));

    var timeScale = typeof this._chart.timeScale === 'function' ? this._chart.timeScale() : null;
    if (!timeScale || typeof timeScale.coordinateToTime !== 'function') {
      return null;
    }

    var time = resolveTimeFromCoordinate(timeScale, this._series, x);
    if (time === null || time === undefined) {
      return null;
    }

    var price = typeof this._series.coordinateToPrice === 'function'
      ? this._series.coordinateToPrice(y)
      : null;
    if (price === null || price === undefined || !isFinite(price)) {
      return null;
    }

    var snappedPrice = options && options.snap === false
      ? null
      : this._snapPriceToSeriesBar(timeScale, time, price, x, y);
    if (snappedPrice !== null) {
      price = snappedPrice;
      if (typeof this._series.priceToCoordinate === 'function') {
        var snappedY = this._series.priceToCoordinate(price);
        if (snappedY !== null && snappedY !== undefined && isFinite(snappedY)) {
          y = snappedY;
        }
      }
    }

    return {
      point: { x: x, y: y },
      time: time
    };
  };

  AdvancedDrawingToolsManager.prototype._consumeTouchEvent = function (event) {
    if (!event) {
      return;
    }

    if (typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    if (typeof event.stopPropagation === 'function') {
      event.stopPropagation();
    }
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
  };

  AdvancedDrawingToolsManager.prototype._resolveHostEventPoint = function (event) {
    if (!event || !this._chartHost || typeof this._chartHost.getBoundingClientRect !== 'function') {
      return null;
    }
    var rect = this._chartHost.getBoundingClientRect();
    if (!rect) {
      return null;
    }
    var clientX = isFiniteNumber(event.clientX) ? event.clientX : null;
    var clientY = isFiniteNumber(event.clientY) ? event.clientY : null;
    if (clientX === null || clientY === null) {
      return null;
    }
    return {
      x: Math.max(0, Math.min(rect.width || 0, clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height || 0, clientY - rect.top))
    };
  };

  AdvancedDrawingToolsManager.prototype._sanitizeTextRecordValue = function (value) {
    var text = typeof value === 'string' ? value : '';
    // Canvas draws plain text only, but we still strip HTML brackets/control chars before persisting.
    text = text.replace(/<[^>]*>/g, '').replace(/[\\u0000-\\u001F\\u007F]/g, ' ').replace(/[<>]/g, '').replace(/\\s+/g, ' ').trim();
    if (text.length > 120) {
      text = text.slice(0, 120);
    }
    return text;
  };

  AdvancedDrawingToolsManager.prototype._commitTextRecordValue = function (record, value) {
    if (!record) {
      return false;
    }
    var nextText = this._sanitizeTextRecordValue(value);
    if (!nextText) {
      nextText = 'Level';
    }
    var changed = record.text !== nextText || record.label !== nextText;
    if (changed) {
      this._pushUndoSnapshot();
    }
    record.text = nextText;
    record.label = nextText;
    record.updatedAt = Date.now();
    if (record.primitive && typeof record.primitive.updateText === 'function') {
      record.primitive.updateText(nextText);
    }
    if (changed) {
      this._emitDrawingsChanged();
    }
    return true;
  };

  AdvancedDrawingToolsManager.prototype._shouldUseNativeTextEditor = function () {
    return this.shouldUseDirectTouchInput() &&
      typeof window !== 'undefined' &&
      window.ReactNativeWebView &&
      typeof window.ReactNativeWebView.postMessage === 'function';
  };

  AdvancedDrawingToolsManager.prototype._beginNativeTextRecordEdit = function (record, geometry) {
    if (!this._shouldUseNativeTextEditor()) {
      return false;
    }
    var box = geometry && geometry.labelBox ? geometry.labelBox : null;
    this._textEditState = {
      recordId: record.id,
      input: null,
      native: true,
      originalText: record.text || record.label || 'Level'
    };
    safeNotify('DRAWING_TEXT_EDIT_REQUEST', {
      recordId: record.id,
      kind: record.kind,
      text: this._sanitizeTextRecordValue(record.text || record.label || 'Level'),
      label: record.label || 'Level',
      x: box ? Math.round(box.left) : undefined,
      y: box ? Math.round(box.top) : undefined,
      width: box ? Math.max(56, Math.round(box.width)) : undefined,
      height: box ? Math.max(24, Math.round(box.height)) : undefined
    });
    return true;
  };

  AdvancedDrawingToolsManager.prototype._isTextRecordEditable = function (record) {
    return !!record &&
      !!record.primitive &&
      (record.kind === 'textLevel' || typeof record.primitive.getTextEditGeometry === 'function') &&
      !record.locked &&
      !this._locked;
  };

  AdvancedDrawingToolsManager.prototype._registerDrawingDoubleTap = function (touch, recordId) {
    if (!touch || !recordId) return false;
    var now = Date.now();
    var last = this._lastDrawingTap;
    var dx = last ? touch.clientX - last.x : 0;
    var dy = last ? touch.clientY - last.y : 0;
    var isDoubleTap = !!last && last.recordId === recordId && now - last.time <= 420 && (dx * dx + dy * dy) <= 900;
    if (isDoubleTap) {
      this._lastDrawingTap = null;
      return true;
    }
    this._lastDrawingTap = { recordId: recordId, x: touch.clientX, y: touch.clientY, time: now };
    return false;
  };

  AdvancedDrawingToolsManager.prototype._registerEmptyChartDoubleTap = function (touch) {
    if (!touch) return false;
    var now = Date.now();
    var last = this._lastEmptyChartTap;
    var dx = last ? touch.clientX - last.x : 0;
    var dy = last ? touch.clientY - last.y : 0;
    var isDoubleTap = !!last && now - last.time <= 420 && (dx * dx + dy * dy) <= 900;
    if (isDoubleTap) {
      this._lastEmptyChartTap = null;
      return true;
    }
    this._lastEmptyChartTap = { x: touch.clientX, y: touch.clientY, time: now };
    return false;
  };

  AdvancedDrawingToolsManager.prototype._notifyDrawingActionMenu = function (record) {
    if (!record) return;
    safeNotify('DRAWING_ACTION_MENU_REQUEST', {
      recordId: record.id,
      kind: record.kind,
      label: record.label || record.kind,
      locked: !!record.locked,
      hidden: !record.visible
    });
  };

  AdvancedDrawingToolsManager.prototype._notifyDrawingQuickActions = function () {
    safeNotify('DRAWING_QUICK_ACTIONS_REQUEST', { drawingCount: this._records.length });
  };

  AdvancedDrawingToolsManager.prototype._handleHostDoubleClick = function (event) {
    var point = this._resolveHostEventPoint(event);
    if (!point) {
      return;
    }
    var hit = this._hitTestEditableDrawingAtPoint(point);
    if (!hit || !hit.record) {
      if (this._records.length > 0) {
        this._consumeTouchEvent(event);
        this._suppressHostTapMenu();
        this._notifyDrawingQuickActions();
      }
      return;
    }
    this._consumeTouchEvent(event);
    this._selectRecord(hit.record.id);
    if (this._isTextRecordEditable(hit.record)) {
      this._beginTextRecordEdit(hit.record);
      return;
    }
    this._notifyDrawingActionMenu(hit.record);
  };

  AdvancedDrawingToolsManager.prototype._handleTextEditDocumentPointer = function (event) {
    var state = this._textEditState;
    if (!state || !state.input) {
      return;
    }
    if (event && event.target === state.input) {
      return;
    }
    this._endTextRecordEdit(true);
  };

  AdvancedDrawingToolsManager.prototype._beginTextRecordEdit = function (record) {
    if (!this._isTextRecordEditable(record) || typeof document === 'undefined') {
      return false;
    }
    if (!this._chartHost) {
      this._bindTouchBridge();
    }
    if (!this._chartHost) {
      return false;
    }
    this._endLineEdit(false);
    this._endTextRecordEdit(false);
    if (record.primitive && typeof record.primitive.updateAllViews === 'function') {
      record.primitive.updateAllViews();
    }
    if (
      record.primitive &&
      typeof record.primitive.setFallbackPaneSize === 'function'
    ) {
      try {
        var metrics = this._getCrosshairMetrics();
        record.primitive.setFallbackPaneSize(metrics.paneWidth, metrics.paneHeight);
      } catch (_metricsError) {}
    }
    var geometry = record.primitive && typeof record.primitive.getTextEditGeometry === 'function'
      ? record.primitive.getTextEditGeometry()
      : null;
    if (!geometry || !geometry.labelBox) {
      return false;
    }
    if (this._beginNativeTextRecordEdit(record, geometry)) {
      return true;
    }
    var style = record.primitive && typeof record.primitive.getTextEditStyle === 'function'
      ? record.primitive.getTextEditStyle()
      : {};
    var box = geometry.labelBox;
    var input = document.createElement('input');
    if (!input || typeof input.addEventListener !== 'function') {
      return false;
    }
    input.type = 'text';
    input.inputMode = 'text';
    input.autocapitalize = 'off';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.maxLength = 120;
    input.value = this._sanitizeTextRecordValue(record.text || record.label || 'Level');
    this._applyElementStyles(input, {
      position: 'absolute',
      left: Math.round(box.left) + 'px',
      top: Math.round(box.top) + 'px',
      width: Math.max(56, Math.round(box.width)) + 'px',
      height: Math.max(24, Math.round(box.height)) + 'px',
      zIndex: '70',
      boxSizing: 'border-box',
      padding: style.padding || '3px 6px',
      border: style.border || '1px solid #5B9DFF',
      borderRadius: style.borderRadius || '4px',
      outline: 'none',
      background: style.background || 'rgba(15, 23, 42, 0.96)',
      color: style.color || '#FFFFFF',
      font: style.font || '700 12px Arial, sans-serif',
      lineHeight: style.lineHeight || '16px',
      textAlign: style.textAlign || 'left',
      pointerEvents: 'auto',
      boxShadow: '0 6px 16px rgba(0, 0, 0, 0.28)'
    });
    var manager = this;
    var keyHandler = function (keyboardEvent) {
      var key = keyboardEvent && typeof keyboardEvent.key === 'string' ? keyboardEvent.key : '';
      if (key === 'Enter') {
        manager._consumeTouchEvent(keyboardEvent);
        manager._endTextRecordEdit(true);
        return;
      }
      if (key === 'Escape' || key === 'Esc') {
        manager._consumeTouchEvent(keyboardEvent);
        manager._endTextRecordEdit(false);
        return;
      }
      if (keyboardEvent && typeof keyboardEvent.stopPropagation === 'function') {
        keyboardEvent.stopPropagation();
      }
    };
    var blurHandler = function () {
      manager._endTextRecordEdit(true);
    };
    input.addEventListener('keydown', keyHandler, true);
    input.addEventListener('blur', blurHandler, false);
    this._textEditState = {
      recordId: record.id,
      input: input,
      originalText: record.text || '',
      keyHandler: keyHandler,
      blurHandler: blurHandler
    };
    this._chartHost.appendChild(input);
    try {
      document.addEventListener('mousedown', this._handleTextEditDocumentPointer, true);
      document.addEventListener('touchstart', this._handleTextEditDocumentPointer, true);
    } catch (_listenerError) {}
    // Android WebView only opens the keyboard reliably when focus happens in the
    // same user-gesture call stack. The timeout below is just a safety refocus.
    try {
      input.focus();
      input.select();
    } catch (_immediateFocusError) {}
    setTimeout(function () {
      try {
        input.focus();
        input.select();
      } catch (_focusError) {}
    }, 0);
    return true;
  };

  AdvancedDrawingToolsManager.prototype._endTextRecordEdit = function (commit) {
    var state = this._textEditState;
    if (!state) {
      return;
    }
    this._textEditState = null;
    try {
      if (typeof document !== 'undefined') {
        document.removeEventListener('mousedown', this._handleTextEditDocumentPointer, true);
        document.removeEventListener('touchstart', this._handleTextEditDocumentPointer, true);
      }
    } catch (_listenerError) {}
    var input = state.input;
    if (input) {
      try { input.removeEventListener('keydown', state.keyHandler, true); } catch (_keyError) {}
      try { input.removeEventListener('blur', state.blurHandler, false); } catch (_blurError) {}
      try {
        if (input.parentNode) input.parentNode.removeChild(input);
      } catch (_removeError) {}
    }
    var record = this._findRecordById(state.recordId);
    if (!record) {
      return;
    }
    var nextText = commit ? this._sanitizeTextRecordValue(input ? input.value : state.originalText) : state.originalText;
    if (!nextText) {
      nextText = state.originalText || 'Level';
    }
    this._commitTextRecordValue(record, nextText);
  };

  AdvancedDrawingToolsManager.prototype.applyTextRecordEdit = function (recordId, value) {
    var record = this._findRecordById(recordId);
    if (!this._isTextRecordEditable(record)) {
      return false;
    }
    this._textEditState = null;
    return this._commitTextRecordValue(record, value);
  };

  AdvancedDrawingToolsManager.prototype.cancelTextRecordEdit = function (recordId) {
    if (this._textEditState && (!recordId || this._textEditState.recordId === recordId)) {
      this._endTextRecordEdit(false);
    }
  };

  AdvancedDrawingToolsManager.prototype._handleTouchStart = function (event) {
    var activeTouchCount = (event.touches && typeof event.touches.length === 'number') ? event.touches.length : 1;
    if (activeTouchCount >= 2) {
      // A second finger landed → this gesture is a pinch/zoom. Mark it and undo
      // any crosshair the first finger transiently showed (unless the user had
      // already locked it on purpose). Kept true until all fingers lift.
      this._markPinch();
      if (!this._crosshairLocked && !this._isRegularCrosshairInspector()) {
        this._hideCrosshairOverlay();
      }
    } else {
      // Genuine fresh single-finger gesture (only one finger on screen).
      this._gestureHadMultitouch = false;
      this._gestureToolActed = false;
    }

    if (this._activeTool === 'crosshair' && this.shouldUseDirectTouchInput()) {
      if (this._gestureHadMultitouch || (event.touches && event.touches.length > 1)) {
        this._activeTouchId = null;
        return;
      }
      var crosshairTouch = this._findTrackedTouch(event.changedTouches || event.touches);
      if (!crosshairTouch) {
        return;
      }
      this._ignoreCrosshairClickUntil = Date.now() + 650;
      this._suppressHostTapMenu();
      this._activeTouchId = crosshairTouch.identifier;
      this._touchDidMove = false;
      this._touchStartX = crosshairTouch.clientX;
      this._touchStartY = crosshairTouch.clientY;
      var crosshairParam = this._buildSyntheticPointerParam(crosshairTouch);
      if (crosshairParam) {
        var textHit = this._hitTestEditableDrawingAtPoint(crosshairParam.point);
        if (textHit && textHit.part === 'label' && this._isTextRecordEditable(textHit.record)) {
          var now = Date.now();
          var lastTap = this._lastTextEditTap;
          var sameRecord = lastTap && lastTap.recordId === textHit.record.id;
          var dx = lastTap ? crosshairTouch.clientX - lastTap.x : 0;
          var dy = lastTap ? crosshairTouch.clientY - lastTap.y : 0;
          var isDoubleTap = sameRecord && now - lastTap.time <= 420 && (dx * dx + dy * dy) <= 900;
          if (isDoubleTap) {
            this._lastTextEditTap = null;
            this._touchGestureMode = 'text-edit';
            this._lastTouchParam = crosshairParam;
            this._crosshairLocked = false;
            this._hideCrosshairOverlay();
            this._selectRecord(textHit.record.id);
            this._beginTextRecordEdit(textHit.record);
            this._consumeTouchEvent(event);
            return;
          }
          this._lastTextEditTap = {
            recordId: textHit.record.id,
            x: crosshairTouch.clientX,
            y: crosshairTouch.clientY,
            time: now
          };
        } else {
          this._lastTextEditTap = null;
        }
        if (textHit && textHit.record && this._registerDrawingDoubleTap(crosshairTouch, textHit.record.id)) {
          this._lastTouchParam = crosshairParam;
          this._crosshairLocked = false;
          this._hideCrosshairOverlay();
          this._selectRecord(textHit.record.id);
          this._notifyDrawingActionMenu(textHit.record);
          this._consumeTouchEvent(event);
          return;
        }
        if (!textHit) {
          this._lastDrawingTap = null;
        }
      }
      if (crosshairParam && this._beginLineEdit(crosshairParam)) {
        this._touchGestureMode = 'line-edit';
        this._lastTouchParam = crosshairParam;
        this._crosshairLocked = false;
        this._hideCrosshairOverlay();
        this._consumeTouchEvent(event);
        return;
      }
      if (this._isRegularCrosshairInspector()) {
        if (!this._lastCrosshairParam) this._showCenteredCrosshair();
        this._regularCrosshairGestureOrigin = this._lastCrosshairParam
          ? this._resolveCrosshairState({ point: this._lastCrosshairParam.point, time: null })
          : null;
        this._lastTouchParam = this._lastCrosshairParam;
        return;
      }
      if (crosshairParam) {
        this._lastTouchParam = crosshairParam;
        this._updateCrosshairOverlay(crosshairParam, true);
      }
      return;
    }

    if (
      // Browse-like state: 'none' AND armed-but-idle tools (after a non-sticky
      // drawing commits, the engine keeps the tool armed with no drawing in
      // progress — double-tap must keep working there too).
      this._activeTool !== 'crosshair' &&
      !this._isDrawingToolActive() &&
      this.shouldUseDirectTouchInput() &&
      !this._gestureHadMultitouch &&
      !(event.touches && event.touches.length > 1)
    ) {
      // Browse mode: double-tapping a drawing selects it and asks the host to
      // open the drawing action menu. Single taps keep panning untouched.
      var browseTouch = this._findTrackedTouch(event.changedTouches || event.touches);
      if (browseTouch) {
        var browseParam = this._buildSyntheticPointerParam(browseTouch);
        var browseHit = browseParam ? this._hitTestEditableDrawingAtPoint(browseParam.point) : null;
        if (browseHit && browseHit.record) {
          this._lastEmptyChartTap = null;
          // Suppress the host tap radial on the FIRST tap already — if it
          // opened over the chart it would swallow the second tap of the
          // double-tap before the engine ever saw it.
          this._suppressHostTapMenu();
          if (this._registerDrawingDoubleTap(browseTouch, browseHit.record.id)) {
            this._selectRecord(browseHit.record.id);
            this._notifyDrawingActionMenu(browseHit.record);
            this._consumeTouchEvent(event);
            return;
          }
        } else {
          this._lastDrawingTap = null;
          if (this._records.length > 0 && this._registerEmptyChartDoubleTap(browseTouch)) {
            // Empty-area double tap while drawings exist → quick shortcut menu
            // (undo/redo/lock/hide/delete) on the host, so the user does not
            // have to reopen the full Drawing Tools sheet.
            this._suppressHostTapMenu();
            this._notifyDrawingQuickActions();
            this._consumeTouchEvent(event);
            return;
          }
        }
      }
    }

    var tool = this._getActiveTouchTool();
    if (!tool || !this.shouldUseDirectTouchInput()) {
      return;
    }

    if (this._gestureHadMultitouch || (event.touches && event.touches.length > 1)) {
      this._activeTouchId = null;
      return;
    }

    var touch = this._findTrackedTouch(event.changedTouches || event.touches);
    if (!touch) {
      return;
    }

    this._suppressHostTapMenu();
    this._activeTouchId = touch.identifier;
    // Snapshot before the tool acts so a pinch that follows this first finger can
    // roll back whatever it started/committed (e.g. a single-tap Level).
    this._gestureDrawingBaseline = this._records.length;
    this._gestureToolActed = true;
    var param = this._buildSyntheticPointerParam(touch);
    this._touchDidMove = false;
    var hasPreviewHandler = typeof tool._handleMove === 'function';
    var existingPointCount = Array.isArray(tool._points) ? tool._points.length : 0;
    if (hasPreviewHandler && existingPointCount === 0) {
      this._touchGestureMode = 'drag-from-first-anchor';
    } else if (hasPreviewHandler && existingPointCount === 1) {
      this._touchGestureMode = 'commit-second-anchor';
    } else {
      this._touchGestureMode = 'click';
    }

    if (param) {
      this._lastTouchParam = param;
      this._updateCrosshairOverlay(param, true);
      if (this._touchGestureMode === 'drag-from-first-anchor') {
        if (typeof tool._handleClick === 'function') {
          tool._handleClick(param);
        }
      } else if (this._touchGestureMode === 'commit-second-anchor' && hasPreviewHandler) {
        tool._handleMove(param);
      } else if (typeof tool._handleClick === 'function') {
        tool._handleClick(param);
      }
    }
    this._consumeTouchEvent(event);
  };

  AdvancedDrawingToolsManager.prototype._handleTouchMove = function (event) {
    if (this._gestureHadMultitouch || (event.touches && event.touches.length > 1)) {
      // Pinch/zoom in progress — never drive the crosshair or a drawing from it.
      this._markPinch();
      return;
    }

    if (this._lineEditState && this.shouldUseDirectTouchInput()) {
      var editTouch = this._findTrackedTouch(event.touches || event.changedTouches);
      if (!editTouch) {
        return;
      }
      var editParam = this._buildSyntheticPointerParam(editTouch);
      if (editParam) {
        this._lastTouchParam = editParam;
        this._touchDidMove = true;
        this._updateLineEdit(editParam);
      }
      this._consumeTouchEvent(event);
      return;
    }

    if (this._activeTool === 'crosshair' && this.shouldUseDirectTouchInput()) {
      var crosshairTouch = this._findTrackedTouch(event.touches || event.changedTouches);
      if (!crosshairTouch) {
        return;
      }
      if (this._isRegularCrosshairInspector()) {
        var relativeDx = crosshairTouch.clientX - this._touchStartX;
        var relativeDy = crosshairTouch.clientY - this._touchStartY;
        if (relativeDx * relativeDx + relativeDy * relativeDy > 36) this._touchDidMove = true;
        var relativeParam = this._buildRegularCrosshairDragParam(crosshairTouch);
        if (relativeParam) {
          this._lastTouchParam = relativeParam;
          this._updateCrosshairOverlay(relativeParam, true);
        }
        return;
      }
      var crosshairParam = this._buildSyntheticPointerParam(crosshairTouch);
      if (crosshairParam) {
        var dx = crosshairTouch.clientX - this._touchStartX;
        var dy = crosshairTouch.clientY - this._touchStartY;
        if ((dx * dx + dy * dy) > 144) {
          this._touchDidMove = true;
        }
        if (!this._touchDidMove) {
          return;
        }
        this._lastTouchParam = crosshairParam;
        this._updateCrosshairOverlay(crosshairParam, true);
      }
      return;
    }

    var tool = this._getActiveTouchTool();
    if (!tool || !this.shouldUseDirectTouchInput()) {
      return;
    }

    var touch = this._findTrackedTouch(event.touches || event.changedTouches);
    if (!touch) {
      return;
    }

    var param = this._buildSyntheticPointerParam(touch);
    if (param && typeof tool._handleMove === 'function') {
      this._lastTouchParam = param;
      this._touchDidMove = true;
      this._updateCrosshairOverlay(param, true);
      tool._handleMove(param);
    }
    this._consumeTouchEvent(event);
  };

  AdvancedDrawingToolsManager.prototype._handleTouchEnd = function (event) {
    var remainingTouches = (event.touches && typeof event.touches.length === 'number') ? event.touches.length : 0;
    if (this._gestureHadMultitouch) {
      // A finger lifted from a pinch/zoom. Do NOT treat it as a crosshair tap
      // (which would toggle the LOCK overlay on). Just clear transient state.
      this._activeTouchId = null;
      this._lastTouchParam = null;
      this._touchDidMove = false;
      this._touchGestureMode = 'idle';
      if (this._activeTool === 'crosshair' && !this._crosshairLocked && !this._isRegularCrosshairInspector()) {
        this._hideCrosshairOverlay();
      }
      if (remainingTouches === 0) {
        // Whole gesture finished — arm the next one as a fresh single touch.
        this._gestureHadMultitouch = false;
        this._gestureToolActed = false;
      }
      return;
    }

    // A clean (non-pinch) gesture is ending. Once the last finger lifts, the tool
    // action is committed and final — clear the rollback arm so a later
    // simultaneous two-finger pinch can never undo this finished drawing.
    if (remainingTouches === 0) {
      this._gestureToolActed = false;
    }

    if (this._touchGestureMode === 'text-edit') {
      this._touchGestureMode = 'idle';
      this._touchDidMove = false;
      this._activeTouchId = null;
      this._lastTouchParam = null;
      this._consumeTouchEvent(event);
      return;
    }

    if (this._lineEditState && this.shouldUseDirectTouchInput()) {
      var completedEditState = this._lineEditState;
      var editTouch = this._findTrackedTouch(event.changedTouches || event.touches);
      var editParam = editTouch ? this._buildSyntheticPointerParam(editTouch) : this._lastTouchParam;
      if (editParam && this._touchDidMove) {
        this._updateLineEdit(editParam);
      }
      var editRecord = completedEditState ? this._findRecordById(completedEditState.recordId) : null;
      var shouldOpenTextEditor = completedEditState &&
        completedEditState.part === 'label' &&
        !completedEditState.moved &&
        !this._touchDidMove &&
        this._isTextRecordEditable(editRecord);
      this._endLineEdit(true);
      this._touchGestureMode = 'idle';
      this._touchDidMove = false;
      this._activeTouchId = null;
      this._lastTouchParam = null;
      if (shouldOpenTextEditor && editRecord) {
        this._lastTextEditTap = null;
        this._selectRecord(editRecord.id);
        this._beginTextRecordEdit(editRecord);
      }
      this._consumeTouchEvent(event);
      return;
    }

    if (this._activeTool === 'crosshair' && this.shouldUseDirectTouchInput()) {
      var crosshairTouch = this._findTrackedTouch(event.changedTouches || event.touches);
      var crosshairParam = crosshairTouch ? this._buildSyntheticPointerParam(crosshairTouch) : this._lastTouchParam;
      if (this._isRegularCrosshairInspector()) {
        this._ignoreCrosshairClickUntil = Date.now() + 650;
        this._suppressHostTapMenu();
        if (crosshairTouch) {
          var endDx = crosshairTouch.clientX - this._touchStartX;
          var endDy = crosshairTouch.clientY - this._touchStartY;
          if (endDx * endDx + endDy * endDy > 36) this._touchDidMove = true;
        }
        if (this._touchDidMove) {
          var endParam = crosshairTouch ? this._buildRegularCrosshairDragParam(crosshairTouch) : this._lastTouchParam;
          if (endParam) this._updateCrosshairOverlay(endParam, true);
        } else if (crosshairParam) {
          var tapParam = crosshairTouch
            ? this._buildSyntheticPointerParam(crosshairTouch, { snap: false })
            : crosshairParam;
          this._handleRegularCrosshairTap(tapParam, this._regularCrosshairGestureOrigin);
        }
        this._activeTouchId = null;
        this._lastTouchParam = null;
        this._touchDidMove = false;
        this._regularCrosshairGestureOrigin = null;
        return;
      }
      if (crosshairParam) {
        this._lastTouchParam = crosshairParam;
        this._updateCrosshairOverlay(crosshairParam, true);
      }
      if (!this._touchDidMove) {
        this._ignoreCrosshairClickUntil = Date.now() + 650;
        this._suppressHostTapMenu();
        this._crosshairLocked = !this._crosshairLocked;
        if (this._crosshairLocked && crosshairParam) {
          this._updateCrosshairOverlay(crosshairParam, true);
        } else {
          this._hideCrosshairOverlay();
        }
      } else if (!this._crosshairLocked) {
        this._hideCrosshairOverlay();
      }
      this._activeTouchId = null;
      this._lastTouchParam = null;
      this._touchDidMove = false;
      return;
    }

    var tool = this._getActiveTouchTool();
    if (!tool || !this.shouldUseDirectTouchInput()) {
      this._touchGestureMode = 'idle';
      this._touchDidMove = false;
      this._activeTouchId = null;
      this._lastTouchParam = null;
      return;
    }

    var touch = this._findTrackedTouch(event.changedTouches || event.touches);
    var param = touch ? this._buildSyntheticPointerParam(touch) : this._lastTouchParam;
    if (!param) {
      this._activeTouchId = null;
      return;
    }

    var shouldCommitOnRelease = (
      this._touchGestureMode === 'commit-second-anchor' ||
      (this._touchGestureMode === 'drag-from-first-anchor' && this._touchDidMove)
    );
    if (shouldCommitOnRelease && param && typeof tool._handleClick === 'function') {
      this._updateCrosshairOverlay(param, true);
      tool._handleClick(param);
    }

    this._touchGestureMode = 'idle';
    this._touchDidMove = false;
    this._activeTouchId = null;
    this._lastTouchParam = null;
    this._regularCrosshairGestureOrigin = null;
    this._consumeTouchEvent(event);
  };

  AdvancedDrawingToolsManager.prototype._handleTouchCancel = function (event) {
    if (this._lineEditState) {
      this._endLineEdit(false);
    }
    this._touchGestureMode = 'idle';
    this._touchDidMove = false;
    this._activeTouchId = null;
    this._lastTouchParam = null;
    this._lastTextEditTap = null;
    var cancelRemaining = (event && event.touches && typeof event.touches.length === 'number') ? event.touches.length : 0;
    if (cancelRemaining === 0) {
      this._gestureHadMultitouch = false;
      this._gestureToolActed = false;
    }
    if (this._activeTool === 'crosshair') {
      if (!this._crosshairLocked && !this._isRegularCrosshairInspector()) {
        this._hideCrosshairOverlay();
      }
      return;
    }
    this._consumeTouchEvent(event);
  };

  AdvancedDrawingToolsManager.prototype._applyChartInteractionMode = function () {
    if (!this._chart || typeof this._chart.applyOptions !== 'function') {
      return;
    }

    this._bindTouchBridge();
    // An in-progress drag-edit of an existing drawing owns the gesture just
    // like drawing-tool creation does — the chart must not pan beneath it.
    var drawingMode = this._isDrawingToolActive() || !!this._lineEditState;
    var interactionLocked = drawingMode || this._activeTool === 'crosshair';

    if (this._chartHost && !this._lineEditState) {
      // Never rewrite touch-action while a drag-edit gesture is live: the
      // browser cancels the active pointer stream when the value flips,
      // which aborts the edit. Crosshair mode needs 'none' as well — with
      // 'manipulation' the WebView claims drawing drag-edits as a native
      // gesture and fires pointercancel mid-drag.
      try {
        var lockedTouchMode = interactionLocked;
        // RTX5 owns both the normal chart-body pan stream and drawing drags.
        // Keeping touch-action at "none" before pointerdown prevents Android
        // WebView from claiming a vertical gesture and firing pointercancel
        // after only the first few pixels. Lightweight Charts still receives
        // the JavaScript touch stream for horizontal movement and pinch zoom.
        this._chartHost.style.touchAction = 'none';
        this._chartHost.style.userSelect = lockedTouchMode ? 'none' : '';
        this._chartHost.style.webkitUserSelect = lockedTouchMode ? 'none' : '';
      } catch (_error) {}
    }

    try {
      this._chart.applyOptions({
        handleScroll: interactionLocked
          ? {
              mouseWheel: false,
              pressedMouseMove: false,
              horzTouchDrag: false,
              vertTouchDrag: false
            }
          : {
              mouseWheel: true,
              pressedMouseMove: true,
              horzTouchDrag: true,
              // RTX5's own gesture handler owns chart-body vertical panning
              // (and enforces the Auto-scale toggle); lightweight-charts'
              // native vertical touch drag must stay off or it pans the pane
              // through the parallel touch-event stream with stale axis labels.
              vertTouchDrag: false
            },
        handleScale: interactionLocked
          ? {
              mouseWheel: false,
              pinch: false,
              axisPressedMouseMove: false
            }
          : {
              mouseWheel: true,
              pinch: true,
              axisPressedMouseMove: true
            }
      });
    } catch (_error) {}
  };

  AdvancedDrawingToolsManager.prototype._nextLabel = function (kind) {
    var next = (this._drawingCounter[kind] || 0) + 1;
    this._drawingCounter[kind] = next;
    return defaultLabel(kind, next);
  };

  AdvancedDrawingToolsManager.prototype._requiredPointCount = function (kind) {
    var spec = ENHANCED_DRAWING_TOOL_SPECS_BY_KIND[kind];
    return spec && typeof spec.requiredPointCount === 'number' ? spec.requiredPointCount : 0;
  };

  AdvancedDrawingToolsManager.prototype._maxPointCount = function (kind) {
    var spec = ENHANCED_DRAWING_TOOL_SPECS_BY_KIND[kind];
    var requiredPointCount = this._requiredPointCount(kind);
    return spec && typeof spec.maxPointCount === 'number' && spec.maxPointCount >= requiredPointCount
      ? spec.maxPointCount
      : requiredPointCount;
  };

  AdvancedDrawingToolsManager.prototype._detachRecord = function (record) {
    if (!record || !record.primitive) return;
    try { this._series.detachPrimitive(record.primitive); } catch (_error) {}
  };

  AdvancedDrawingToolsManager.prototype._findRecordById = function (id) {
    if (!id) return null;
    for (var i = 0; i < this._records.length; i += 1) {
      if (this._records[i].id === id) return this._records[i];
    }
    return null;
  };

  AdvancedDrawingToolsManager.prototype._isRecordPresentationVisible = function (record) {
    // TradingView parity: completed drawings stay visible no matter which
    // tool is armed (or none at all). Only the explicit hide-all toggle and
    // the per-record visible flag control presentation.
    return !!(record && record.visible && !this._hidden);
  };

  AdvancedDrawingToolsManager.prototype._applyRecordPresentationVisibility = function (record) {
    if (!record || !record.primitive) return false;
    var visible = this._isRecordPresentationVisible(record);
    record.displayVisible = visible;
    if (typeof record.primitive.setVisible === 'function') {
      record.primitive.setVisible(visible);
    }
    if (!visible) {
      if (typeof record.primitive.setHovered === 'function') {
        record.primitive.setHovered(false);
      }
      if (typeof record.primitive.setSelected === 'function') {
        record.primitive.setSelected(false);
      }
    } else if (typeof record.primitive.setSelected === 'function') {
      record.primitive.setSelected(!!record.selected);
    }
    return visible;
  };

  AdvancedDrawingToolsManager.prototype._refreshRecordPresentationVisibility = function () {
    var selectedStillVisible = false;
    this._records.forEach(function (record) {
      var visible = this._applyRecordPresentationVisibility(record);
      if (visible && record.id === this._selectedRecordId) {
        selectedStillVisible = true;
      }
    }, this);
    if (this._selectedRecordId && !selectedStillVisible) {
      this._selectedRecordId = null;
    }
  };

  AdvancedDrawingToolsManager.prototype._setHoveredRecord = function (id) {
    if (this._hoveredRecordId === (id || null)) return;
    this._hoveredRecordId = id || null;
    this._records.forEach(function (record) {
      var hovered = !!id && record.id === id && this._isRecordPresentationVisible(record);
      if (record.primitive && typeof record.primitive.setHovered === 'function') {
        record.primitive.setHovered(hovered);
      }
    }, this);
  };

  AdvancedDrawingToolsManager.prototype._selectRecord = function (id) {
    var changed = false;
    var requested = id ? this._findRecordById(id) : null;
    var selectedId = requested && this._isRecordPresentationVisible(requested) ? id : null;
    this._selectedRecordId = selectedId;
    this._records.forEach(function (record) {
      var selected = !!selectedId && record.id === selectedId;
      if (!!record.selected !== selected) changed = true;
      record.selected = selected;
      if (record.primitive && typeof record.primitive.setSelected === 'function') {
        record.primitive.setSelected(selected);
      }
    });
    if (changed) {
      this._emitDrawingsChanged();
    }
  };

  AdvancedDrawingToolsManager.prototype._removeSelectedRecord = function () {
    var selectedId = this._selectedRecordId;
    if (!selectedId) return;
    this._endLineEdit(false);
    this._endTextRecordEdit(false);
    var removed = false;
    this._records = this._records.filter(function (record) {
      if (record.id !== selectedId) return true;
      if (!removed) {
        this._pushUndoSnapshot();
      }
      this._detachRecord(record);
      removed = true;
      return false;
    }, this);
    this._selectedRecordId = null;
    if (removed) {
      this._emitDrawingsChanged();
    }
  };

  AdvancedDrawingToolsManager.prototype._distanceToPoint = function (a, b) {
    if (!a || !b || !isFiniteNumber(a.x) || !isFiniteNumber(a.y) || !isFiniteNumber(b.x) || !isFiniteNumber(b.y)) {
      return Number.POSITIVE_INFINITY;
    }
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt((dx * dx) + (dy * dy));
  };

  AdvancedDrawingToolsManager.prototype._distanceToSegment = function (point, a, b) {
    if (!point || !a || !b) return Number.POSITIVE_INFINITY;
    var dx = b.x - a.x;
    var dy = b.y - a.y;
    var lengthSquared = (dx * dx) + (dy * dy);
    if (lengthSquared <= 0.0001) {
      return this._distanceToPoint(point, a);
    }
    var t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
    return this._distanceToPoint(point, {
      x: a.x + (t * dx),
      y: a.y + (t * dy)
    });
  };

  AdvancedDrawingToolsManager.prototype._hitTestTrendLineRecordAtPoint = function (record, point) {
    if (!record || !point || this._locked) return null;
    // Locked records stay hit-testable so the user can select them and unlock
    // from the Drawing Tools sheet; _beginLineEdit blocks the actual drag.
    if (record.kind !== 'trendline' || !this._isRecordPresentationVisible(record) || !record.primitive || typeof record.primitive.getGeometry !== 'function') {
      return null;
    }
    var handleThreshold = this.shouldUseDirectTouchInput() ? 18 : 10;
    var lineThreshold = this.shouldUseDirectTouchInput() ? 14 : 8;
    var geometry = record.primitive.getGeometry();
    if (!geometry || !geometry.p1 || !geometry.p2 || !isFiniteNumber(geometry.p1.x) || !isFiniteNumber(geometry.p1.y) || !isFiniteNumber(geometry.p2.x) || !isFiniteNumber(geometry.p2.y)) {
      return null;
    }
    var touchPoint = { x: point.x, y: point.y };
    if (this._distanceToPoint(touchPoint, geometry.p1) <= handleThreshold) {
      return { record: record, part: 'p1' };
    }
    if (this._distanceToPoint(touchPoint, geometry.p2) <= handleThreshold) {
      return { record: record, part: 'p2' };
    }
    if (this._distanceToSegment(touchPoint, geometry.p1, geometry.p2) <= lineThreshold) {
      return { record: record, part: 'body' };
    }
    return null;
  };

  AdvancedDrawingToolsManager.prototype._hitTestTrendLineAtPoint = function (point) {
    if (!point || this._locked) return null;
    for (var i = this._records.length - 1; i >= 0; i -= 1) {
      var record = this._records[i];
      var lineHit = this._hitTestTrendLineRecordAtPoint(record, point);
      if (lineHit) return lineHit;
    }
    return null;
  };

  AdvancedDrawingToolsManager.prototype._hitTestEditableDrawingAtPoint = function (point) {
    if (!point || this._locked) return null;
    var isTouch = this.shouldUseDirectTouchInput();
    for (var i = this._records.length - 1; i >= 0; i -= 1) {
      var record = this._records[i];
      if (!record || !this._isRecordPresentationVisible(record) || !record.primitive) {
        continue;
      }
      if (record.primitive && typeof record.primitive.hitTest === 'function') {
        var primitiveHit = record.primitive.hitTest(point, { isTouch: isTouch, manager: this, record: record });
        if (primitiveHit) {
          return {
            record: record,
            part: primitiveHit.part || 'body'
          };
        }
      }
      if (record.kind === 'trendline') {
        var lineHit = this._hitTestTrendLineRecordAtPoint(record, point);
        if (lineHit) return lineHit;
      }
    }
    return null;
  };

  AdvancedDrawingToolsManager.prototype._resolveLineEditPoint = function (param) {
    // Editing an existing drawing remains free-form even on an Area chart; the
    // series-point snap belongs only to the Area inspection cursor.
    var state = this._resolveCrosshairState(param, { areaSeriesInspector: false });
    if (state && state.time !== null && state.time !== undefined && isFiniteNumber(state.price)) {
      var point = { time: state.time, price: state.price };
      if (state.timestamp !== undefined) point.timestamp = state.timestamp;
      if (state.dataIndex !== undefined) point.dataIndex = state.dataIndex;
      if (state.paneId !== undefined) point.paneId = state.paneId;
      return point;
    }
    return null;
  };

  AdvancedDrawingToolsManager.prototype._beginLineEdit = function (param) {
    if (!param || !param.point || this._locked) return false;
    this._endTextRecordEdit(true);
    var hit = this._hitTestEditableDrawingAtPoint(param.point);
    if (!hit || !hit.record) {
      if (this._selectedRecordId) {
        this._selectRecord(null);
        return true;
      }
      return false;
    }
    if (hit.record.locked) {
      this._selectRecord(hit.record.id);
      return true;
    }
    var editPoint = this._resolveLineEditPoint(param);
    if (!editPoint) {
      this._selectRecord(hit.record.id);
      return true;
    }
    this._selectRecord(hit.record.id);
    this._lineEditState = {
      recordId: hit.record.id,
      part: hit.part,
      startPoint: clonePoint(editPoint),
      originalPoints: clonePoints(hit.record.points),
      moved: false
    };
    if (hit.record.primitive && typeof hit.record.primitive.beginEdit === 'function') {
      hit.record.primitive.beginEdit(hit.part, editPoint);
    }
    this._applyChartInteractionMode();
    return true;
  };

  AdvancedDrawingToolsManager.prototype._buildEditedLinePoints = function (editPoint) {
    var state = this._lineEditState;
    if (!state || !editPoint || !Array.isArray(state.originalPoints)) {
      return null;
    }

    var record = this._findRecordById(state.recordId);
    var requiredPointCount = record ? this._requiredPointCount(record.kind) : 2;
    var maxPointCount = record ? this._maxPointCount(record.kind) : requiredPointCount;
    if (record && record.primitive && typeof record.primitive.buildEditPoints === 'function') {
      var customPoints = record.primitive.buildEditPoints(state.part, state.originalPoints, state.startPoint, editPoint);
      if (Array.isArray(customPoints) && customPoints.length >= requiredPointCount) {
        return clonePoints(customPoints.slice(0, maxPointCount));
      }
    }

    if (state.originalPoints.length < 2) {
      return requiredPointCount === 1 ? clonePoints([editPoint]) : null;
    }

    var points = clonePoints(state.originalPoints);
    if (state.part === 'p1' || state.part === 'p2') {
      points[state.part === 'p1' ? 0 : 1] = clonePoint(editPoint);
      return points;
    }

    var priceDelta = editPoint.price - state.startPoint.price;
    var timeDelta = isFiniteNumber(editPoint.time) && isFiniteNumber(state.startPoint.time)
      ? editPoint.time - state.startPoint.time
      : 0;
    var dataIndexDelta = isFiniteNumber(editPoint.dataIndex) && isFiniteNumber(state.startPoint.dataIndex)
      ? editPoint.dataIndex - state.startPoint.dataIndex
      : null;

    return points.map(function (point) {
      var next = clonePoint(point);
      if (isFiniteNumber(next.time)) next.time += timeDelta;
      if (isFiniteNumber(next.timestamp)) next.timestamp += timeDelta;
      if (dataIndexDelta !== null && isFiniteNumber(next.dataIndex)) next.dataIndex += dataIndexDelta;
      next.price = point.price + priceDelta;
      return next;
    });
  };

  AdvancedDrawingToolsManager.prototype._applyLineEditPoints = function (record, points) {
    if (!record || !Array.isArray(points)) return;
    var requiredPointCount = Math.max(1, this._requiredPointCount(record.kind) || points.length);
    var maxPointCount = Math.max(requiredPointCount, this._maxPointCount(record.kind) || points.length);
    if (points.length < requiredPointCount) return;
    record.points = clonePoints(points.slice(0, maxPointCount));
    if (record.primitive && typeof record.primitive.updatePoints === 'function') {
      record.primitive.updatePoints.apply(record.primitive, record.points);
    }
    if (record.primitive && typeof record.primitive.getSerializableState === 'function') {
      var state = record.primitive.getSerializableState();
      if (state && typeof state === 'object') {
        [
          'text',
          'style',
          'levelLine',
          'labelPosition',
          'labelOffset',
          'showPrice',
          'showPriceAxisLabel',
          'levelType',
          'followLastPrice',
          'alertMetadata'
        ].forEach(function (key) {
          if (state[key] !== undefined) {
            record[key] = cloneSerializable(state[key], state[key]);
          }
        });
      }
    }
  };

  AdvancedDrawingToolsManager.prototype._flushLineEditFrame = function () {
    this._lineEditPendingFrame = 0;
    var pending = this._lineEditPendingPoints;
    this._lineEditPendingPoints = null;
    if (!pending || !this._lineEditState) return;
    var record = this._findRecordById(this._lineEditState.recordId);
    this._applyLineEditPoints(record, pending);
  };

  AdvancedDrawingToolsManager.prototype._queueLineEditPoints = function (points) {
    this._lineEditPendingPoints = points;
    if (this._lineEditPendingFrame) return;
    var manager = this;
    if (typeof requestAnimationFrame === 'function') {
      this._lineEditPendingFrame = requestAnimationFrame(function () {
        manager._flushLineEditFrame();
      });
    } else {
      this._flushLineEditFrame();
    }
  };

  AdvancedDrawingToolsManager.prototype._updateLineEdit = function (param) {
    if (!this._lineEditState || !param) return false;
    var editPoint = this._resolveLineEditPoint(param);
    if (!editPoint) return true;
    var points = this._buildEditedLinePoints(editPoint);
    if (!points) return true;
    this._lineEditState.moved = true;
    this._queueLineEditPoints(points);
    return true;
  };

  AdvancedDrawingToolsManager.prototype._endLineEdit = function (commit) {
    var state = this._lineEditState;
    if (this._lineEditPendingFrame && typeof cancelAnimationFrame === 'function') {
      try { cancelAnimationFrame(this._lineEditPendingFrame); } catch (_error) {}
    }
    this._lineEditPendingFrame = 0;
    if (this._lineEditPendingPoints) {
      this._flushLineEditFrame();
    }
    this._lineEditState = null;
    this._lineEditPendingPoints = null;
    if (state) {
      this._applyChartInteractionMode();
    }
    if (!state) return;
    var record = this._findRecordById(state.recordId);
    if (!record) return;
    if (!commit) {
      if (record.primitive && typeof record.primitive.endEdit === 'function') {
        record.primitive.endEdit(false);
      }
      this._applyLineEditPoints(record, state.originalPoints);
      return;
    }
    if (record.primitive && typeof record.primitive.endEdit === 'function') {
      record.primitive.endEdit(true);
    }
    if (state.moved) {
      var previousSnapshot = this._createRecordsSnapshot().map(function (item) {
        if (item && item.id === state.recordId) {
          return Object.assign({}, item, { points: clonePoints(state.originalPoints) });
        }
        return item;
      });
      this._pushUndoSnapshot(previousSnapshot);
      record.updatedAt = Date.now();
      this._emitDrawingsChanged();
    }
  };

  AdvancedDrawingToolsManager.prototype._recountDrawingCounters = function () {
    this._drawingCounter = {};
    this._records.forEach(function (record) {
      this._drawingCounter[record.kind] = (this._drawingCounter[record.kind] || 0) + 1;
    }, this);
  };

  AdvancedDrawingToolsManager.prototype._sanitizeSerializedRecord = function (record, index) {
    if (!record || typeof record !== 'object' || !record.kind || !this._tools[record.kind]) {
      return null;
    }

    var requiredPointCount = this._requiredPointCount(record.kind);
    var maxPointCount = this._maxPointCount(record.kind);
    var points = Array.isArray(record.points)
      ? record.points
        .map(function (point) {
          if (!point || typeof point !== 'object' || point.time === undefined || typeof point.price !== 'number' || !isFinite(point.price)) {
            return null;
          }
          return clonePoint(point);
        })
        .filter(function (point) { return point !== null; })
        .slice(0, maxPointCount)
      : [];

    if (points.length < requiredPointCount) {
      return null;
    }

    var recordVisible = typeof record.visible === 'boolean' ? record.visible : !record.hidden;

    return {
      id: typeof record.id === 'string' && record.id ? record.id : record.kind + '_restored_' + (index + 1),
      kind: record.kind,
      type: typeof record.type === 'string' ? record.type : record.kind,
      symbol: typeof record.symbol === 'string' ? record.symbol : undefined,
      timeframe: typeof record.timeframe === 'string' ? record.timeframe : undefined,
      paneId: typeof record.paneId === 'string' ? record.paneId : undefined,
      label: typeof record.label === 'string' && record.label ? record.label : defaultLabel(record.kind, index + 1),
      hidden: !recordVisible,
      visible: recordVisible,
      points: points,
      text: typeof record.text === 'string' ? record.text : undefined,
      style: record.style && typeof record.style === 'object' ? Object.assign({}, record.style) : undefined,
      levelLine: record.levelLine && typeof record.levelLine === 'object' ? cloneSerializable(record.levelLine, undefined) : undefined,
      labelPosition: typeof record.labelPosition === 'string' ? record.labelPosition : undefined,
      labelOffset: record.labelOffset && typeof record.labelOffset === 'object' ? cloneSerializable(record.labelOffset, undefined) : undefined,
      showPrice: typeof record.showPrice === 'boolean' ? record.showPrice : undefined,
      showPriceAxisLabel: typeof record.showPriceAxisLabel === 'boolean' ? record.showPriceAxisLabel : undefined,
      levelType: typeof record.levelType === 'string' ? record.levelType : undefined,
      followLastPrice: !!record.followLastPrice,
      levels: Array.isArray(record.levels) ? cloneSerializable(record.levels, []) : undefined,
      waves: Array.isArray(record.waves) ? cloneSerializable(record.waves, []) : undefined,
      ratios: Array.isArray(record.ratios) ? cloneSerializable(record.ratios, []) : undefined,
      position: record.position && typeof record.position === 'object' ? cloneSerializable(record.position, undefined) : undefined,
      extendMode: typeof record.extendMode === 'string' ? record.extendMode : undefined,
      zoneType: typeof record.zoneType === 'string' ? record.zoneType : undefined,
      extendUntil: typeof record.extendUntil === 'string' ? record.extendUntil : undefined,
      alertMetadata: record.alertMetadata && typeof record.alertMetadata === 'object' ? cloneSerializable(record.alertMetadata, undefined) : undefined,
      reverse: !!record.reverse,
      goldenPocket: record.goldenPocket && typeof record.goldenPocket === 'object' ? cloneSerializable(record.goldenPocket, undefined) : undefined,
      oteZone: record.oteZone && typeof record.oteZone === 'object' ? cloneSerializable(record.oteZone, undefined) : undefined,
      locked: !!record.locked,
      selected: !!record.selected,
      createdAt: isFiniteNumber(record.createdAt) ? record.createdAt : undefined,
      updatedAt: isFiniteNumber(record.updatedAt) ? record.updatedAt : undefined
    };
  };

  AdvancedDrawingToolsManager.prototype._createPrimitiveForRecord = function (record) {
    var spec = ENHANCED_DRAWING_TOOL_SPECS_BY_KIND[record.kind];
    return spec && typeof spec.createPrimitiveFromRecord === 'function'
      ? spec.createPrimitiveFromRecord(record)
      : null;
  };

  AdvancedDrawingToolsManager.prototype._serializeRecordForHost = function (record) {
    if (!record) return null;
    return {
      id: record.id,
      kind: record.kind,
      label: record.label,
      hidden: !record.visible,
      points: clonePoints(record.points),
      text: record.text,
      type: record.type,
      symbol: record.symbol,
      timeframe: record.timeframe,
      paneId: record.paneId,
      style: record.style && typeof record.style === 'object' ? cloneSerializable(record.style, undefined) : undefined,
      levelLine: record.levelLine && typeof record.levelLine === 'object' ? cloneSerializable(record.levelLine, undefined) : undefined,
      labelPosition: record.labelPosition,
      labelOffset: record.labelOffset && typeof record.labelOffset === 'object' ? cloneSerializable(record.labelOffset, undefined) : undefined,
      showPrice: record.showPrice,
      showPriceAxisLabel: record.showPriceAxisLabel,
      levelType: record.levelType,
      followLastPrice: !!record.followLastPrice,
      levels: Array.isArray(record.levels) ? cloneSerializable(record.levels, []) : undefined,
      waves: Array.isArray(record.waves) ? cloneSerializable(record.waves, []) : undefined,
      ratios: Array.isArray(record.ratios) ? cloneSerializable(record.ratios, []) : undefined,
      position: record.position && typeof record.position === 'object' ? cloneSerializable(record.position, undefined) : undefined,
      extendMode: record.extendMode,
      zoneType: record.zoneType,
      extendUntil: record.extendUntil,
      alertMetadata: record.alertMetadata && typeof record.alertMetadata === 'object' ? cloneSerializable(record.alertMetadata, undefined) : undefined,
      reverse: !!record.reverse,
      goldenPocket: record.goldenPocket && typeof record.goldenPocket === 'object' ? cloneSerializable(record.goldenPocket, undefined) : undefined,
      oteZone: record.oteZone && typeof record.oteZone === 'object' ? cloneSerializable(record.oteZone, undefined) : undefined,
      locked: !!record.locked,
      selected: !!record.selected,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    };
  };

  AdvancedDrawingToolsManager.prototype._createRecordsSnapshot = function () {
    return this._records
      .map(function (record) { return this._serializeRecordForHost(record); }, this)
      .filter(function (record) { return record !== null; });
  };

  AdvancedDrawingToolsManager.prototype._pushUndoSnapshot = function (snapshot) {
    if (this._historyRestoreInProgress) return;
    var nextSnapshot = Array.isArray(snapshot)
      ? cloneSerializable(snapshot, [])
      : this._createRecordsSnapshot();
    this._undoSnapshots.push(nextSnapshot);
    if (this._undoSnapshots.length > 50) {
      this._undoSnapshots.shift();
    }
    this._redoSnapshots = [];
  };

  AdvancedDrawingToolsManager.prototype._pushRedoSnapshot = function (snapshot) {
    var nextSnapshot = Array.isArray(snapshot)
      ? cloneSerializable(snapshot, [])
      : this._createRecordsSnapshot();
    this._redoSnapshots.push(nextSnapshot);
    if (this._redoSnapshots.length > 50) {
      this._redoSnapshots.shift();
    }
  };

  AdvancedDrawingToolsManager.prototype._restoreRecordsFromSnapshot = function (snapshot) {
    var nextRecords = Array.isArray(snapshot)
      ? snapshot
        .map(function (record, index) {
          return this._sanitizeSerializedRecord(record, index);
        }, this)
        .filter(function (record) { return record !== null; })
      : [];

    this._historyRestoreInProgress = true;
    try {
      this._stopAllTools();
      this._endLineEdit(false);
      this._endTextRecordEdit(false);
      this._crosshairLocked = false;
      this._pendingCrosshairState = null;
      this._lastCrosshairState = null;
      this._hideCrosshairOverlay();
      this._selectedRecordId = null;
      this._records.forEach(function (record) {
        this._detachRecord(record);
      }, this);
      this._records = [];

      nextRecords.forEach(function (record) {
        var primitive = this._createPrimitiveForRecord(record);
        if (!primitive) return;
        record.primitive = primitive;
        this._applyObjectDescriptionVisibility(record);
        record.hidden = this._hidden ? true : !!record.hidden;
        record.visible = !record.hidden;
        if (record.selected && this._isRecordPresentationVisible(record)) {
          this._selectedRecordId = record.id;
        }
        this._applyRecordPresentationVisibility(record);
        this._series.attachPrimitive(primitive);
        this._records.push(record);
      }, this);

      this._recountDrawingCounters();
      this._refreshRecordPresentationVisibility();
      this._emitDrawingsChanged();
    } finally {
      this._historyRestoreInProgress = false;
    }
  };

  AdvancedDrawingToolsManager.prototype.undoDrawingAction = function () {
    if (!this._undoSnapshots.length) {
      return false;
    }
    var currentSnapshot = this._createRecordsSnapshot();
    var previousSnapshot = this._undoSnapshots.pop();
    this._pushRedoSnapshot(currentSnapshot);
    this._restoreRecordsFromSnapshot(previousSnapshot);
    return true;
  };

  AdvancedDrawingToolsManager.prototype.redoDrawingAction = function () {
    if (!this._redoSnapshots.length) {
      return false;
    }
    var currentSnapshot = this._createRecordsSnapshot();
    var nextSnapshot = this._redoSnapshots.pop();
    this._undoSnapshots.push(currentSnapshot);
    if (this._undoSnapshots.length > 50) {
      this._undoSnapshots.shift();
    }
    this._restoreRecordsFromSnapshot(nextSnapshot);
    return true;
  };

  AdvancedDrawingToolsManager.prototype._emitDrawingsChanged = function () {
    safeNotify('DRAWINGS_CHANGED', {
      drawings: this._records
        .map(function (record) { return this._serializeRecordForHost(record); }, this)
        .filter(function (record) { return record !== null; }),
      canUndo: this._undoSnapshots.length > 0,
      canRedo: this._redoSnapshots.length > 0,
      selectedDrawingId: this._selectedRecordId || null
    });
    this._refreshDrawingBadges();
  };

  AdvancedDrawingToolsManager.prototype._ensureDrawingBadgesOverlay = function () {
    if (this._drawingBadgesOverlay) {
      return this._drawingBadgesOverlay;
    }
    if (typeof document === 'undefined' || !document || typeof document.createElement !== 'function') {
      return null;
    }
    if (!this._chartHost) {
      this._bindTouchBridge();
    }
    if (!this._chartHost) {
      try {
        this._chartHost = document.getElementById('chart');
      } catch (_hostError) {
        this._chartHost = null;
      }
    }
    if (!this._chartHost || typeof this._chartHost.appendChild !== 'function') {
      return null;
    }
    var overlay = document.createElement('div');
    overlay.setAttribute('data-rtx5-drawing-badges', 'true');
    this._applyElementStyles(overlay, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      overflow: 'hidden',
      zIndex: '44'
    });
    this._chartHost.appendChild(overlay);
    this._drawingBadgesOverlay = overlay;
    this._drawingBadgeElements = {};
    return overlay;
  };

  AdvancedDrawingToolsManager.prototype._destroyDrawingBadgesOverlay = function () {
    var overlay = this._drawingBadgesOverlay;
    this._drawingBadgesOverlay = null;
    this._drawingBadgeElements = {};
    if (overlay && overlay.parentNode && typeof overlay.parentNode.removeChild === 'function') {
      try { overlay.parentNode.removeChild(overlay); } catch (_removeError) {}
    }
  };

  AdvancedDrawingToolsManager.prototype._resolveDrawingBadgeAnchor = function (record) {
    if (!record || !Array.isArray(record.points)) return null;
    for (var i = 0; i < record.points.length; i += 1) {
      var recordPoint = record.points[i];
      if (!recordPoint) continue;
      var x = resolveCoordinateFromTime(this._chart, this._series, recordPoint.time);
      var y = null;
      try { y = this._series.priceToCoordinate(recordPoint.price); } catch (_priceError) {}
      if (isFiniteNumber(y)) {
        // Level tools use non-bar-aligned helper times that resolve to bogus
        // coordinates; pin those badges to the left edge at the record price.
        return { x: isFiniteNumber(x) && x > 0 ? x : 8, y: y };
      }
    }
    return null;
  };

  // Small floating chips over locked / selected drawings so the user always
  // sees which drawing is selected and which ones are locked.
  AdvancedDrawingToolsManager.prototype._refreshDrawingBadges = function () {
    var badgeRecords = [];
    for (var i = 0; i < this._records.length; i += 1) {
      var record = this._records[i];
      if (!this._isRecordPresentationVisible(record)) continue;
      var selected = record.id === this._selectedRecordId;
      var locked = !!record.locked || this._locked;
      if (selected || locked) {
        badgeRecords.push({ record: record, selected: selected, locked: locked });
      }
    }
    if (!badgeRecords.length) {
      if (this._drawingBadgesOverlay) {
        this._destroyDrawingBadgesOverlay();
      }
      return;
    }
    var overlay = this._ensureDrawingBadgesOverlay();
    if (!overlay) return;
    var hostRect = null;
    try { hostRect = this._chartHost.getBoundingClientRect(); } catch (_rectError) {}
    var hostWidth = hostRect && isFiniteNumber(hostRect.width) ? hostRect.width : 0;
    var hostHeight = hostRect && isFiniteNumber(hostRect.height) ? hostRect.height : 0;
    var seenIds = {};
    badgeRecords.forEach(function (entry) {
      var anchor = this._resolveDrawingBadgeAnchor(entry.record);
      if (!anchor) return;
      seenIds[entry.record.id] = true;
      var chip = this._drawingBadgeElements[entry.record.id];
      if (!chip) {
        chip = document.createElement('div');
        this._applyElementStyles(chip, {
          position: 'absolute',
          padding: '2px 7px',
          borderRadius: '9px',
          fontFamily: 'Arial, sans-serif',
          fontSize: '10px',
          fontWeight: '700',
          lineHeight: '14px',
          whiteSpace: 'nowrap',
          pointerEvents: 'none'
        });
        overlay.appendChild(chip);
        this._drawingBadgeElements[entry.record.id] = chip;
      }
      var text = '';
      if (entry.locked) {
        text = '\\uD83D\\uDD12';
      }
      if (entry.selected) {
        text = text
          ? text + ' ' + (entry.record.label || entry.record.kind)
          : (entry.record.label || entry.record.kind);
      }
      chip.textContent = text;
      this._applyElementStyles(chip, {
        backgroundColor: entry.selected ? 'rgba(37, 99, 235, 0.94)' : 'rgba(15, 23, 42, 0.85)',
        color: '#FFFFFF',
        border: entry.selected ? '1px solid rgba(255, 255, 255, 0.85)' : '1px solid rgba(148, 163, 184, 0.5)'
      });
      var left = anchor.x + 8;
      var top = anchor.y - 26;
      if (hostWidth > 0) {
        left = Math.max(2, Math.min(left, hostWidth - 40));
      } else {
        left = Math.max(2, left);
      }
      if (hostHeight > 0) {
        top = Math.max(2, Math.min(top, hostHeight - 20));
      } else {
        top = Math.max(2, top);
      }
      chip.style.left = Math.round(left) + 'px';
      chip.style.top = Math.round(top) + 'px';
      chip.style.display = 'block';
    }, this);
    Object.keys(this._drawingBadgeElements).forEach(function (id) {
      if (seenIds[id]) return;
      var staleChip = this._drawingBadgeElements[id];
      delete this._drawingBadgeElements[id];
      if (staleChip && staleChip.parentNode && typeof staleChip.parentNode.removeChild === 'function') {
        try { staleChip.parentNode.removeChild(staleChip); } catch (_staleError) {}
      }
    }, this);
  };

  AdvancedDrawingToolsManager.prototype.getSelectedDrawingId = function () {
    return this._selectedRecordId || null;
  };

  AdvancedDrawingToolsManager.prototype.clearDrawingSelection = function () {
    this._selectRecord(null);
  };

  AdvancedDrawingToolsManager.prototype.removeSelectedDrawing = function () {
    this._removeSelectedRecord();
  };

  AdvancedDrawingToolsManager.prototype.setSelectedDrawingLocked = function (locked) {
    var record = this._findRecordById(this._selectedRecordId);
    if (!record) return false;
    var nextLocked = !!locked;
    if (!!record.locked === nextLocked) return true;
    this._endLineEdit(false);
    this._endTextRecordEdit(false);
    this._pushUndoSnapshot();
    record.locked = nextLocked;
    record.updatedAt = Date.now();
    this._emitDrawingsChanged();
    return true;
  };

  AdvancedDrawingToolsManager.prototype.setSelectedDrawingHidden = function (hidden) {
    var record = this._findRecordById(this._selectedRecordId);
    if (!record) return false;
    var nextHidden = !!hidden;
    if (!!record.hidden === nextHidden) return true;
    this._endLineEdit(false);
    this._endTextRecordEdit(false);
    this._pushUndoSnapshot();
    record.hidden = nextHidden;
    record.visible = !nextHidden;
    record.updatedAt = Date.now();
    if (nextHidden && this._selectedRecordId === record.id) {
      this._selectedRecordId = null;
      record.selected = false;
    }
    this._applyRecordPresentationVisibility(record);
    this._emitDrawingsChanged();
    return true;
  };

  AdvancedDrawingToolsManager.prototype.unlockAllDrawings = function () {
    this._locked = false;
    var hadRecordLocks = this._records.some(function (record) { return !!record.locked; });
    if (hadRecordLocks) {
      this._pushUndoSnapshot();
      this._records.forEach(function (record) {
        record.locked = false;
        record.updatedAt = Date.now();
      });
    }
    this._emitDrawingsChanged();
  };

  AdvancedDrawingToolsManager.prototype.publishDrawingsToHost = function () {
    this._emitDrawingsChanged();
  };

  AdvancedDrawingToolsManager.prototype.isLocked = function () {
    return this._locked;
  };

  AdvancedDrawingToolsManager.prototype.isStickyMode = function () {
    return this._sticky;
  };

  AdvancedDrawingToolsManager.prototype.registerDrawing = function (kind, primitive, label, serializedData) {
    var nextLabel = label || this._nextLabel(kind);
    var currentSymbol = this._crosshairConfig && typeof this._crosshairConfig.symbol === 'string' ? this._crosshairConfig.symbol : '';
    var currentTimeframe = this._crosshairConfig && typeof this._crosshairConfig.timeframe === 'string' ? this._crosshairConfig.timeframe : '';
    this._pushUndoSnapshot();
    var record = {
      id: kind + '_' + Date.now() + '_' + (this._records.length + 1),
      kind: kind,
      label: nextLabel,
      primitive: primitive,
      hidden: !!this._hidden,
      visible: !this._hidden,
      points: clonePoints(serializedData && Array.isArray(serializedData.points) ? serializedData.points : []),
      text: serializedData && typeof serializedData.text === 'string' ? serializedData.text : undefined,
      type: serializedData && typeof serializedData.type === 'string' ? serializedData.type : kind,
      symbol: serializedData && typeof serializedData.symbol === 'string' ? serializedData.symbol : (currentSymbol || undefined),
      timeframe: serializedData && typeof serializedData.timeframe === 'string' ? serializedData.timeframe : (currentTimeframe || undefined),
      paneId: serializedData && typeof serializedData.paneId === 'string' ? serializedData.paneId : undefined,
      style: serializedData && serializedData.style && typeof serializedData.style === 'object' ? Object.assign({}, serializedData.style) : undefined,
      levelLine: serializedData && serializedData.levelLine && typeof serializedData.levelLine === 'object' ? cloneSerializable(serializedData.levelLine, undefined) : undefined,
      labelPosition: serializedData && typeof serializedData.labelPosition === 'string' ? serializedData.labelPosition : undefined,
      labelOffset: serializedData && serializedData.labelOffset && typeof serializedData.labelOffset === 'object' ? cloneSerializable(serializedData.labelOffset, undefined) : undefined,
      showPrice: serializedData && typeof serializedData.showPrice === 'boolean' ? serializedData.showPrice : undefined,
      showPriceAxisLabel: serializedData && typeof serializedData.showPriceAxisLabel === 'boolean' ? serializedData.showPriceAxisLabel : undefined,
      levelType: serializedData && typeof serializedData.levelType === 'string' ? serializedData.levelType : undefined,
      followLastPrice: !!(serializedData && serializedData.followLastPrice),
      levels: serializedData && Array.isArray(serializedData.levels) ? cloneSerializable(serializedData.levels, []) : undefined,
      waves: serializedData && Array.isArray(serializedData.waves) ? cloneSerializable(serializedData.waves, []) : undefined,
      ratios: serializedData && Array.isArray(serializedData.ratios) ? cloneSerializable(serializedData.ratios, []) : undefined,
      position: serializedData && serializedData.position && typeof serializedData.position === 'object' ? cloneSerializable(serializedData.position, undefined) : undefined,
      extendMode: serializedData && typeof serializedData.extendMode === 'string' ? serializedData.extendMode : undefined,
      zoneType: serializedData && typeof serializedData.zoneType === 'string' ? serializedData.zoneType : undefined,
      extendUntil: serializedData && typeof serializedData.extendUntil === 'string' ? serializedData.extendUntil : undefined,
      alertMetadata: serializedData && serializedData.alertMetadata && typeof serializedData.alertMetadata === 'object' ? cloneSerializable(serializedData.alertMetadata, undefined) : undefined,
      reverse: !!(serializedData && serializedData.reverse),
      goldenPocket: serializedData && serializedData.goldenPocket && typeof serializedData.goldenPocket === 'object' ? cloneSerializable(serializedData.goldenPocket, undefined) : undefined,
      oteZone: serializedData && serializedData.oteZone && typeof serializedData.oteZone === 'object' ? cloneSerializable(serializedData.oteZone, undefined) : undefined,
      locked: !!(serializedData && serializedData.locked),
      selected: !!(serializedData && serializedData.selected),
      createdAt: serializedData && isFiniteNumber(serializedData.createdAt) ? serializedData.createdAt : Date.now(),
      updatedAt: serializedData && isFiniteNumber(serializedData.updatedAt) ? serializedData.updatedAt : Date.now()
    };
    this._records.push(record);
    this._applyObjectDescriptionVisibility(record);
    if (record.selected && this._isRecordPresentationVisible(record)) {
      this._selectedRecordId = record.id;
    }
    this._applyRecordPresentationVisibility(record);
    this._series.attachPrimitive(primitive);
    this._emitDrawingsChanged();
    if (serializedData && serializedData.editAfterCreate && this._isTextRecordEditable(record)) {
      var manager = this;
      setTimeout(function () {
        manager._selectRecord(record.id);
        manager._beginTextRecordEdit(record);
      }, 0);
    }
  };

  AdvancedDrawingToolsManager.prototype.setActiveTool = function (tool, silent, options) {
    this._stopAllTools();
    var shouldStartDrawing = !(options && options.startDrawing === false);
    if (tool === 'none' || !tool) {
      this._activeTool = 'none';
    } else if (tool === 'crosshair') {
      this._activeTool = 'crosshair';
    } else if (this._locked) {
      this._activeTool = 'none';
    } else if (this._tools[tool] && typeof this._tools[tool].startDrawing === 'function') {
      this._activeTool = tool;
      if (shouldStartDrawing) {
        this._tools[tool].startDrawing();
      }
    } else {
      this._activeTool = 'none';
    }
    if (this._activeTool !== 'crosshair') {
      this._crosshairLocked = false;
      this._regularCrosshairSeedPending = false;
      this._hideCrosshairOverlay();
    }
    this._refreshRecordPresentationVisibility();
    this._applyChartInteractionMode();
    if (this._activeTool === 'crosshair' && this._crosshairConfig.areaSeriesInspector === true) {
      this._regularCrosshairSeedPending = false;
      this._showLatestAreaSeriesPoint();
    } else {
      this._areaInspectorSeedPending = false;
      if (this._isRegularCrosshairInspector()) {
        this._crosshairLocked = false;
        if (!this._lastCrosshairParam) {
          this._showCenteredCrosshair();
        }
      }
    }
    if (!silent) {
      safeNotify('TOOL_ACTIVE_CHANGED', { tool: this._activeTool, drawingActive: this._isDrawingToolActive() });
    }
  };

  AdvancedDrawingToolsManager.prototype.finishDrawingTool = function (tool) {
    if (this._locked) {
      this._activeTool = 'none';
    } else if (tool && this._tools[tool]) {
      this._activeTool = tool;
    } else if (!this._activeTool) {
      this._activeTool = 'none';
    }
    if (this._activeTool !== 'crosshair') {
      this._crosshairLocked = false;
      this._hideCrosshairOverlay();
    }
    this._refreshRecordPresentationVisibility();
    this._applyChartInteractionMode();
    safeNotify('TOOL_ACTIVE_CHANGED', { tool: this._activeTool, drawingActive: false });
  };

  AdvancedDrawingToolsManager.prototype.getActiveTool = function () {
    return this._activeTool;
  };

  AdvancedDrawingToolsManager.prototype.setDrawingsHidden = function (hidden) {
    var nextHidden = !!hidden;
    var hasVisibleChange = this._records.some(function (record) {
      return !!record.hidden !== nextHidden || !!record.visible === nextHidden;
    });
    if (hasVisibleChange) {
      this._pushUndoSnapshot();
    }
    this._hidden = nextHidden;
    if (this._hidden) {
      this._endLineEdit(false);
      this._endTextRecordEdit(false);
      this._selectRecord(null);
    }
    this._records.forEach(function (record) {
      record.hidden = !!this._hidden;
      record.visible = !this._hidden;
      this._applyRecordPresentationVisibility(record);
    }, this);
    this._emitDrawingsChanged();
  };

  AdvancedDrawingToolsManager.prototype.setDrawingsLocked = function (locked) {
    this._locked = !!locked;
    if (this._locked) {
      this._endLineEdit(false);
      this._endTextRecordEdit(false);
      this._selectRecord(null);
      this.setActiveTool('none');
    }
  };

  AdvancedDrawingToolsManager.prototype.setStayInDrawingMode = function (sticky) {
    this._sticky = !!sticky;
  };

  AdvancedDrawingToolsManager.prototype.zoomToFit = function () {
    try {
      this._chart.priceScale('right').applyOptions({ autoScale: true });
      this._chart.timeScale().fitContent();
      this._chart.timeScale().scrollToRealTime();
    } catch (_error) {}
  };

  AdvancedDrawingToolsManager.prototype.setSerializedDrawings = function (drawings) {
    var nextRecords = Array.isArray(drawings)
      ? drawings
        .map(function (record, index) {
          return this._sanitizeSerializedRecord(record, index);
        }, this)
        .filter(function (record) { return record !== null; })
      : [];

    this._stopAllTools();
    this._endLineEdit(false);
    this._endTextRecordEdit(false);
    this._undoSnapshots = [];
    this._redoSnapshots = [];
    this._crosshairLocked = false;
    this._pendingCrosshairState = null;
    this._lastCrosshairState = null;
    this._hideCrosshairOverlay();
    this._selectedRecordId = null;
    this._records.forEach(function (record) {
      this._detachRecord(record);
    }, this);
    this._records = [];

    nextRecords.forEach(function (record) {
      var primitive = this._createPrimitiveForRecord(record);
      if (!primitive) return;
      record.primitive = primitive;
      this._applyObjectDescriptionVisibility(record);
      record.hidden = this._hidden ? true : !!record.hidden;
      record.visible = !record.hidden;
      if (record.selected && this._isRecordPresentationVisible(record)) {
        this._selectedRecordId = record.id;
      }
      this._applyRecordPresentationVisibility(record);
      this._series.attachPrimitive(primitive);
      this._records.push(record);
    }, this);

    this._recountDrawingCounters();
    this._emitDrawingsChanged();
  };

  AdvancedDrawingToolsManager.prototype.removeAllDrawings = function () {
    this._stopAllTools();
    this._endLineEdit(false);
    this._endTextRecordEdit(false);
    if (this._records.length > 0) {
      this._pushUndoSnapshot();
    }
    this._records.forEach(function (record) {
      this._detachRecord(record);
    }, this);
    this._records = [];
    this._drawingCounter = {};
    this._selectedRecordId = null;
    this.setActiveTool('none');
    this._emitDrawingsChanged();
  };

  AdvancedDrawingToolsManager.prototype.remove = function () {
    try {
      if (this._chart && typeof this._chart.unsubscribeCrosshairMove === 'function') {
        this._chart.unsubscribeCrosshairMove(this._handleCrosshairMove);
      }
    } catch (_unsubscribeMoveError) {}
    try {
      if (this._chart && typeof this._chart.unsubscribeClick === 'function') {
        this._chart.unsubscribeClick(this._handleCrosshairClick);
      }
    } catch (_unsubscribeClickError) {}
    try {
      if (this._drawingBadgesRangeHandler && this._chart && typeof this._chart.timeScale === 'function') {
        var badgeTimeScale = this._chart.timeScale();
        if (badgeTimeScale && typeof badgeTimeScale.unsubscribeVisibleLogicalRangeChange === 'function') {
          badgeTimeScale.unsubscribeVisibleLogicalRangeChange(this._drawingBadgesRangeHandler);
        }
      }
      this._drawingBadgesRangeHandler = null;
    } catch (_badgeUnsubscribeError) {}
    this._destroyDrawingBadgesOverlay();
    try {
      if (typeof document !== 'undefined' && document && typeof document.removeEventListener === 'function') {
        document.removeEventListener('keydown', this._handleKeyDown, true);
        document.removeEventListener('keyup', this._handleKeyUp, true);
      }
    } catch (_keyError) {}
    this._stopAllTools();
    this._endLineEdit(false);
    this._endTextRecordEdit(false);
    this._records.forEach(function (record) {
      this._detachRecord(record);
    }, this);
    this._records = [];
    this._drawingCounter = {};
    this._undoSnapshots = [];
    this._redoSnapshots = [];
    this._selectedRecordId = null;
    this._activeTool = 'none';
    this._unbindTouchBridge();
    this._destroyCrosshairOverlay();
    Object.keys(this._tools).forEach(function (key) {
      var tool = this._tools[key];
      if (tool && typeof tool.remove === 'function') {
        tool.remove();
      }
    }, this);
  };

  /**
   * Apply Chart Preferences → Show object descriptions to every live drawing.
   * Safe to call repeatedly from the RN bridge on both platforms.
   */
  AdvancedDrawingToolsManager.prototype._applyObjectDescriptionVisibilityToPrimitive = function (primitive) {
    if (!primitive) return;
    var show = this._showObjectDescriptions !== false;
    try {
      if (typeof primitive.setObjectDescriptionsVisible === 'function') {
        primitive.setObjectDescriptionsVisible(show);
      } else {
        primitive._objectDescriptionsVisible = show;
        if (typeof primitive.requestUpdate === 'function') {
          primitive.requestUpdate();
        }
      }
    } catch (_applyError) {}
  };

  AdvancedDrawingToolsManager.prototype._applyObjectDescriptionVisibility = function (record) {
    if (!record) return;
    this._applyObjectDescriptionVisibilityToPrimitive(record.primitive);
  };

  AdvancedDrawingToolsManager.prototype.setShowObjectDescriptions = function (enabled) {
    this._showObjectDescriptions = enabled !== false;
    objectDescriptionsVisibleByDefault = this._showObjectDescriptions;
    (this._records || []).forEach(function (record) {
      this._applyObjectDescriptionVisibility(record);
    }, this);
    Object.keys(this._tools || {}).forEach(function (key) {
      var tool = this._tools[key];
      if (tool && tool._preview) {
        this._applyObjectDescriptionVisibilityToPrimitive(tool._preview);
      }
    }, this);
  };

  AdvancedDrawingToolsManager.prototype.getShowObjectDescriptions = function () {
    return this._showObjectDescriptions !== false;
  };

  window.DrawingToolsManager = AdvancedDrawingToolsManager;
})();
`;
