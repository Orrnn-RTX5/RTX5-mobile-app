import { CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH } from '../ChartScreen.constants';
import {
  MT5_PRICE_SCALE_BOUND_OCTAVES,
  MT5_PRICE_SCALE_GESTURE_WEBVIEW_JS,
  MT5_PRICE_SCALE_MAX_DRAG_OCTAVES,
  MT5_PRICE_SCALE_MIN_VISIBLE_TICK_INTERVALS,
  MT5_PRICE_SCALE_OCTAVES_PER_PLOT,
} from '../mt5PriceScaleGesture';

/**
 * MT5-style vertical price-scale behavior for the lightweight auxiliary chart.
 *
 * The script intentionally owns only interaction and manual-range state. The
 * preview host continues to own chart creation, candle data, the live-price
 * badge, and pane tap/double-tap routing. All state is scoped to the WebView so
 * two divided panes can be moved and scaled independently.
 */
export const LIVE_CHART_PREVIEW_PRICE_SCALE_SCRIPT = String.raw`
      var PREVIEW_PRICE_SCALE_MINIMUM_WIDTH = ${CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH};
      var PREVIEW_PRICE_SCALE_OCTAVES_PER_PLOT = ${MT5_PRICE_SCALE_OCTAVES_PER_PLOT};
      var PREVIEW_PRICE_SCALE_BOUND_OCTAVES = ${MT5_PRICE_SCALE_BOUND_OCTAVES};
      var PREVIEW_PRICE_SCALE_MAX_DRAG_OCTAVES = ${MT5_PRICE_SCALE_MAX_DRAG_OCTAVES};
      var PREVIEW_PRICE_SCALE_MIN_VISIBLE_TICK_INTERVALS = ${MT5_PRICE_SCALE_MIN_VISIBLE_TICK_INTERVALS};
      var PREVIEW_PRICE_SCALE_AXIS_DRAG_THRESHOLD_PX = 3;
      var PREVIEW_PRICE_SCALE_BODY_PAN_THRESHOLD_PX = 6;
      var PREVIEW_PRICE_SCALE_AXIS_DOUBLE_TAP_MS = 350;
      var PREVIEW_PRICE_SCALE_AXIS_DOUBLE_TAP_DISTANCE_PX = 24;
      var PREVIEW_PRICE_SCALE_PANE_TAP_SUPPRESSION_MS = 450;
      var PREVIEW_PRICE_SCALE_LABEL_TARGET_GAP_PX = 30;
      var PREVIEW_PRICE_SCALE_GLIDE_MIN_VELOCITY_PX_MS = 0.25;
      var PREVIEW_PRICE_SCALE_GLIDE_MAX_VELOCITY_PX_MS = 5;
      var PREVIEW_PRICE_SCALE_GLIDE_DECAY_PER_FRAME = 0.97;
      var PREVIEW_PRICE_SCALE_GLIDE_STOP_VELOCITY_PX_MS = 0.02;

      ${MT5_PRICE_SCALE_GESTURE_WEBVIEW_JS}

      var previewPriceScaleAutoScaleEnabled = false;
      var previewPriceScaleVerticalScrollingLocked = false;
      var previewPriceScaleManualRange = null;
      var previewPriceScaleReferenceSpan = null;
      var previewPriceScaleAxisGesture = null;
      var previewPriceScaleBodyPanPending = null;
      var previewPriceScaleBodyPan = null;
      var previewPriceScaleGlide = null;
      var previewPriceScaleLastAxisTap = null;
      var previewPriceScaleTapSuppressedUntil = 0;
      var previewPriceScaleDetachListeners = null;
      var previewPriceScaleActivePointerIds = Object.create(null);
      var previewPriceScalePinchActive = false;

      function normalizePreviewPriceScaleRange(range) {
        if (!range) return null;
        var from = Number(range.from);
        var to = Number(range.to);
        if (!isFinite(from) || !isFinite(to) || from === to) return null;
        return from < to ? { from: from, to: to } : { from: to, to: from };
      }

      function getPreviewRightPriceScaleApi() {
        try {
          return chart && typeof chart.priceScale === 'function'
            ? chart.priceScale('right')
            : null;
        } catch (_error) {
          return null;
        }
      }

      function resolvePreviewPriceScaleHostMetrics() {
        if (!chartHost) return null;
        var rect = typeof chartHost.getBoundingClientRect === 'function'
          ? chartHost.getBoundingClientRect()
          : null;
        var width = Math.max(
          0,
          Number(rect && rect.width) || Number(chartHost.clientWidth) || 0
        );
        var height = Math.max(
          0,
          Number(rect && rect.height) || Number(chartHost.clientHeight) || 0
        );
        if (!(width > 0) || !(height > 0)) return null;
        var left = Number(rect && rect.left) || 0;
        var top = Number(rect && rect.top) || 0;
        var measuredAxisWidth = 0;
        try {
          var priceScaleApi = getPreviewRightPriceScaleApi();
          measuredAxisWidth = priceScaleApi && typeof priceScaleApi.width === 'function'
            ? Number(priceScaleApi.width())
            : 0;
        } catch (_error) {
          measuredAxisWidth = 0;
        }
        var axisWidth = Math.min(
          width,
          Math.max(
            PREVIEW_PRICE_SCALE_MINIMUM_WIDTH,
            isFinite(measuredAxisWidth) && measuredAxisWidth > 0 ? measuredAxisWidth : 0
          )
        );
        return {
          axisLeft: left + width - axisWidth,
          axisRight: left + width,
          axisWidth: axisWidth,
          height: height,
          left: left,
          top: top,
          width: width
        };
      }

      function isPreviewRightPriceScaleGesturePoint(clientX, clientY) {
        var x = Number(clientX);
        var y = Number(clientY);
        var metrics = resolvePreviewPriceScaleHostMetrics();
        if (!metrics || !isFinite(x) || !isFinite(y)) return false;
        return (
          x >= metrics.axisLeft - 6 &&
          x <= metrics.axisRight + 4 &&
          y >= metrics.top &&
          y <= metrics.top + metrics.height
        );
      }

      function suppressPreviewPriceScalePaneTap() {
        previewPriceScaleTapSuppressedUntil =
          Date.now() + PREVIEW_PRICE_SCALE_PANE_TAP_SUPPRESSION_MS;
      }

      function shouldSuppressPreviewPaneTap(clientX, clientY) {
        return (
          isPreviewRightPriceScaleGesturePoint(clientX, clientY) ||
          previewPriceScaleAxisGesture !== null ||
          previewPriceScaleBodyPan !== null ||
          previewPriceScalePinchActive ||
          Date.now() <= previewPriceScaleTapSuppressedUntil
        );
      }

      function resolvePreviewPriceScaleStartRange() {
        var manualRange = normalizePreviewPriceScaleRange(previewPriceScaleManualRange);
        if (manualRange) return manualRange;
        try {
          var priceScaleApi = getPreviewRightPriceScaleApi();
          var visibleRange = priceScaleApi && typeof priceScaleApi.getVisibleRange === 'function'
            ? priceScaleApi.getVisibleRange()
            : null;
          visibleRange = normalizePreviewPriceScaleRange(visibleRange);
          if (visibleRange) return visibleRange;
        } catch (_error) {}
        try {
          var metrics = resolvePreviewPriceScaleHostMetrics();
          if (!metrics || !series || typeof series.coordinateToPrice !== 'function') return null;
          var topPrice = series.coordinateToPrice(0);
          var bottomPrice = series.coordinateToPrice(metrics.height);
          return normalizePreviewPriceScaleRange({ from: topPrice, to: bottomPrice });
        } catch (_error) {
          return null;
        }
      }

      function refreshPreviewPriceScaleBadge() {
        try {
          if (typeof renderPreviewLivePriceBadge === 'function') {
            renderPreviewLivePriceBadge();
          }
        } catch (_error) {}
        try {
          if (typeof schedulePreviewRightPriceAxisRefresh === 'function') {
            schedulePreviewRightPriceAxisRefresh();
          }
        } catch (_error) {}
        try {
          if (typeof schedulePreviewTradeOverlayRefresh === 'function') {
            schedulePreviewTradeOverlayRefresh();
          }
        } catch (_error) {}
      }

      function rememberPreviewManualPriceScale(range, referenceSpan) {
        var normalized = normalizePreviewPriceScaleRange(range);
        if (!normalized) return false;
        previewPriceScaleManualRange = normalized;
        var resolvedReferenceSpan = Number(referenceSpan);
        if (isFinite(resolvedReferenceSpan) && resolvedReferenceSpan > 0) {
          previewPriceScaleReferenceSpan = resolvedReferenceSpan;
        } else if (!(previewPriceScaleReferenceSpan > 0)) {
          previewPriceScaleReferenceSpan = normalized.to - normalized.from;
        }
        return true;
      }

      function applyPreviewManualPriceScaleRange(range, referenceSpan) {
        var normalized = normalizePreviewPriceScaleRange(range);
        var priceScaleApi = getPreviewRightPriceScaleApi();
        if (!normalized || !priceScaleApi || typeof priceScaleApi.setVisibleRange !== 'function') {
          return false;
        }
        rememberPreviewManualPriceScale(normalized, referenceSpan);
        try {
          if (typeof priceScaleApi.setAutoScale === 'function') {
            priceScaleApi.setAutoScale(false);
          } else if (typeof priceScaleApi.applyOptions === 'function') {
            priceScaleApi.applyOptions({ autoScale: false });
          }
        } catch (_error) {}
        try {
          priceScaleApi.setVisibleRange({ from: normalized.from, to: normalized.to });
        } catch (_error) {
          return false;
        }
        refreshPreviewPriceScaleBadge();
        return true;
      }

      function getPreviewManualPriceScaleSnapshot() {
        var range = normalizePreviewPriceScaleRange(previewPriceScaleManualRange);
        if (!range) return null;
        var span = range.to - range.from;
        return {
          from: range.from,
          to: range.to,
          referenceSpan:
            typeof previewPriceScaleReferenceSpan === 'number' &&
            isFinite(previewPriceScaleReferenceSpan) &&
            previewPriceScaleReferenceSpan > 0
              ? previewPriceScaleReferenceSpan
              : span
        };
      }

      function restorePreviewManualPriceScale(snapshot) {
        if (previewPriceScaleAutoScaleEnabled) return false;
        var range = normalizePreviewPriceScaleRange(snapshot);
        if (!range) return false;
        var referenceSpan = Number(snapshot && snapshot.referenceSpan);
        return applyPreviewManualPriceScaleRange(
          range,
          isFinite(referenceSpan) && referenceSpan > 0
            ? referenceSpan
            : range.to - range.from
        );
      }

      function reapplyPreviewManualPriceScale() {
        var snapshot = getPreviewManualPriceScaleSnapshot();
        return snapshot ? restorePreviewManualPriceScale(snapshot) : false;
      }

      function stopPreviewPriceScaleGlide() {
        if (!previewPriceScaleGlide) return;
        if (previewPriceScaleGlide.raf) {
          try { cancelAnimationFrame(previewPriceScaleGlide.raf); } catch (_error) {}
        }
        previewPriceScaleGlide = null;
      }

      function applyPreviewPriceAutoScaleState(enabled) {
        var priceScaleApi = getPreviewRightPriceScaleApi();
        if (!priceScaleApi) return false;
        var applied = false;
        try {
          if (typeof priceScaleApi.applyOptions === 'function') {
            priceScaleApi.applyOptions({ autoScale: enabled === true });
            applied = true;
          }
          if (typeof priceScaleApi.setAutoScale === 'function') {
            priceScaleApi.setAutoScale(enabled === true);
            applied = true;
          }
        } catch (_error) {
          return false;
        }
        refreshPreviewPriceScaleBadge();
        return applied;
      }

      function enablePreviewPriceAutoScale() {
        return applyPreviewPriceAutoScaleState(true);
      }

      function resetPreviewPriceScale() {
        stopPreviewPriceScaleGlide();
        previewPriceScaleManualRange = null;
        previewPriceScaleReferenceSpan = null;
        previewPriceScaleAxisGesture = null;
        previewPriceScaleBodyPan = null;
        previewPriceScaleBodyPanPending = null;
        previewPriceScaleLastAxisTap = null;
        suppressPreviewPriceScalePaneTap();
        return enablePreviewPriceAutoScale();
      }

      function setPreviewChartAutoScaleEnabled(enabled) {
        previewPriceScaleAutoScaleEnabled = enabled === true;
        if (previewPriceScaleAutoScaleEnabled) {
          resetPreviewPriceScale();
        } else {
          applyPreviewPriceAutoScaleState(false);
          reapplyPreviewManualPriceScale();
        }
        return previewPriceScaleAutoScaleEnabled;
      }

      function setPreviewVerticalScrollingLocked(locked) {
        previewPriceScaleVerticalScrollingLocked = locked === true;
        if (previewPriceScaleVerticalScrollingLocked) {
          stopPreviewPriceScaleGlide();
          previewPriceScaleAxisGesture = null;
          previewPriceScaleBodyPan = null;
          previewPriceScaleBodyPanPending = null;
          reapplyPreviewManualPriceScale();
        }
        return previewPriceScaleVerticalScrollingLocked;
      }

      function isPreviewVerticalPriceMovementBlocked() {
        return previewPriceScaleVerticalScrollingLocked || previewPriceScaleAutoScaleEnabled;
      }

      function applyPreviewPriceScaleInteractionOptions() {
        try {
          if (!chart || typeof chart.applyOptions !== 'function') return false;
          chart.applyOptions({
            handleScroll: {
              mouseWheel: true,
              pressedMouseMove: true,
              horzTouchDrag: true,
              vertTouchDrag: false
            },
            handleScale: {
              mouseWheel: true,
              pinch: true,
              axisPressedMouseMove: { time: true, price: false }
            },
            rightPriceScale: {
              visible: true,
              entireTextOnly: false,
              minimumWidth: PREVIEW_PRICE_SCALE_MINIMUM_WIDTH
            }
          });
          return true;
        } catch (_error) {
          return false;
        }
      }

      function resolvePreviewPriceScaleMinimumSpan(startSpan, plotHeight, minMove) {
        var labelCount = Math.max(
          7,
          Math.min(30, Math.floor(plotHeight / PREVIEW_PRICE_SCALE_LABEL_TARGET_GAP_PX) + 1)
        );
        var intervals = Math.max(1, labelCount - 1);
        var coordinateSpan = 0;
        try {
          if (series && typeof series.coordinateToPrice === 'function') {
            var topPrice = Number(series.coordinateToPrice(8.5));
            var bottomPrice = Number(series.coordinateToPrice(Math.max(8.5, plotHeight - 8.5)));
            if (isFinite(topPrice) && isFinite(bottomPrice)) {
              coordinateSpan = Math.abs(topPrice - bottomPrice);
            }
          }
        } catch (_error) {
          coordinateSpan = 0;
        }
        var projection = coordinateSpan > 0 && startSpan > 0
          ? coordinateSpan / startSpan
          : 0;
        return projection > 0 && isFinite(projection)
          ? (minMove * intervals) / projection
          : minMove * PREVIEW_PRICE_SCALE_MIN_VISIBLE_TICK_INTERVALS;
      }

      function beginPreviewAxisPriceScaleGesture(event, clientX, clientY) {
        if (isPreviewVerticalPriceMovementBlocked()) return false;
        var range = resolvePreviewPriceScaleStartRange();
        var metrics = resolvePreviewPriceScaleHostMetrics();
        if (!range || !metrics) return false;
        var startSpan = range.to - range.from;
        if (!(startSpan > 0)) return false;
        var localY = Number(clientY) - metrics.top;
        var anchorPrice = null;
        try {
          anchorPrice = series && typeof series.coordinateToPrice === 'function'
            ? Number(series.coordinateToPrice(localY))
            : null;
        } catch (_error) {
          anchorPrice = null;
        }
        var anchorRatio = typeof anchorPrice === 'number' && isFinite(anchorPrice)
          ? (range.to - anchorPrice) / startSpan
          : localY / metrics.height;
        var decimals = Number(window._previewDisplayDecimals);
        decimals = isFinite(decimals) ? Math.max(0, Math.min(10, Math.round(decimals))) : 2;
        var minMove = 1 / Math.pow(10, decimals);
        var referenceSpan =
          typeof previewPriceScaleReferenceSpan === 'number' &&
          isFinite(previewPriceScaleReferenceSpan) &&
          previewPriceScaleReferenceSpan > 0
            ? previewPriceScaleReferenceSpan
            : startSpan;
        var capturedPointerId = null;
        if (
          event &&
          typeof event.pointerId === 'number' &&
          chartHost &&
          typeof chartHost.setPointerCapture === 'function'
        ) {
          try {
            chartHost.setPointerCapture(event.pointerId);
            capturedPointerId = event.pointerId;
          } catch (_error) {}
        }
        previewPriceScaleAxisGesture = {
          anchorRatio: anchorRatio,
          minimumSpan: resolvePreviewPriceScaleMinimumSpan(startSpan, metrics.height, minMove),
          minMove: minMove,
          moved: false,
          plotHeight: metrics.height,
          pointerId: capturedPointerId,
          referenceSpan: referenceSpan,
          startFrom: range.from,
          startTo: range.to,
          startX: Number(clientX),
          startY: Number(clientY)
        };
        previewPriceScaleBodyPan = null;
        previewPriceScaleBodyPanPending = null;
        stopPreviewPriceScaleGlide();
        suppressPreviewPriceScalePaneTap();
        return true;
      }

      function movePreviewAxisPriceScaleGesture(clientY) {
        var state = previewPriceScaleAxisGesture;
        var y = Number(clientY);
        if (!state || !isFinite(y)) return false;
        var deltaY = y - state.startY;
        if (!state.moved && Math.abs(deltaY) < PREVIEW_PRICE_SCALE_AXIS_DRAG_THRESHOLD_PX) {
          return false;
        }
        var nextRange = resolveMt5PriceScaleDragRange({
          anchorRatio: state.anchorRatio,
          boundOctaves: PREVIEW_PRICE_SCALE_BOUND_OCTAVES,
          deltaY: deltaY,
          maxDragOctaves: PREVIEW_PRICE_SCALE_MAX_DRAG_OCTAVES,
          minMove: state.minMove,
          minimumSpan: state.minimumSpan,
          minVisibleTickIntervals: PREVIEW_PRICE_SCALE_MIN_VISIBLE_TICK_INTERVALS,
          octavesPerPlot: PREVIEW_PRICE_SCALE_OCTAVES_PER_PLOT,
          plotHeight: state.plotHeight,
          referenceSpan: state.referenceSpan,
          startFrom: state.startFrom,
          startTo: state.startTo
        });
        if (!nextRange) return false;
        state.moved = true;
        suppressPreviewPriceScalePaneTap();
        return applyPreviewManualPriceScaleRange(nextRange, state.referenceSpan);
      }

      function consumePreviewAxisDoubleTap(state) {
        if (!state) return false;
        var now = Date.now();
        var previous = previewPriceScaleLastAxisTap;
        var dx = previous ? state.startX - previous.x : Infinity;
        var dy = previous ? state.startY - previous.y : Infinity;
        var maxDistanceSquared =
          PREVIEW_PRICE_SCALE_AXIS_DOUBLE_TAP_DISTANCE_PX *
          PREVIEW_PRICE_SCALE_AXIS_DOUBLE_TAP_DISTANCE_PX;
        var isDoubleTap = !!previous &&
          now - previous.at >= 0 &&
          now - previous.at <= PREVIEW_PRICE_SCALE_AXIS_DOUBLE_TAP_MS &&
          dx * dx + dy * dy <= maxDistanceSquared;
        previewPriceScaleLastAxisTap = isDoubleTap
          ? null
          : { at: now, x: state.startX, y: state.startY };
        return isDoubleTap;
      }

      function finishPreviewAxisPriceScaleGesture(cancelled) {
        var state = previewPriceScaleAxisGesture;
        if (!state) return false;
        previewPriceScaleAxisGesture = null;
        if (
          state.pointerId !== null &&
          state.pointerId !== undefined &&
          chartHost &&
          typeof chartHost.releasePointerCapture === 'function'
        ) {
          try { chartHost.releasePointerCapture(state.pointerId); } catch (_error) {}
        }
        if (state.moved) {
          reapplyPreviewManualPriceScale();
          previewPriceScaleLastAxisTap = null;
        } else if (cancelled !== true && consumePreviewAxisDoubleTap(state)) {
          resetPreviewPriceScale();
        }
        suppressPreviewPriceScalePaneTap();
        refreshPreviewPriceScaleBadge();
        return true;
      }

      function beginPreviewBodyPricePan(clientX, clientY) {
        if (isPreviewVerticalPriceMovementBlocked()) return false;
        var range = resolvePreviewPriceScaleStartRange();
        var metrics = resolvePreviewPriceScaleHostMetrics();
        if (!range || !metrics) return false;
        var span = range.to - range.from;
        if (!(span > 0)) return false;
        previewPriceScaleBodyPan = {
          latestRange: { from: range.from, to: range.to },
          lastMoveAt: null,
          lastMoveY: Number(clientY),
          pricePerPixel: span / metrics.height,
          referenceSpan:
            typeof previewPriceScaleReferenceSpan === 'number' && previewPriceScaleReferenceSpan > 0
              ? previewPriceScaleReferenceSpan
              : span,
          startAt: Date.now(),
          startFrom: range.from,
          startTo: range.to,
          startX: Number(clientX),
          startY: Number(clientY),
          velocityPxMs: 0
        };
        stopPreviewPriceScaleGlide();
        suppressPreviewPriceScalePaneTap();
        return applyPreviewManualPriceScaleRange(range, previewPriceScaleBodyPan.referenceSpan);
      }

      function movePreviewBodyPricePan(clientY) {
        var state = previewPriceScaleBodyPan;
        var y = Number(clientY);
        if (!state || !isFinite(y)) return false;
        var now = Date.now();
        if (typeof state.lastMoveAt === 'number') {
          var elapsed = now - state.lastMoveAt;
          if (elapsed > 0 && elapsed < 120) {
            var instantVelocity = (y - state.lastMoveY) / elapsed;
            state.velocityPxMs = 0.6 * instantVelocity + 0.4 * state.velocityPxMs;
          } else if (elapsed >= 120) {
            state.velocityPxMs = 0;
          }
        }
        state.lastMoveAt = now;
        state.lastMoveY = y;
        var priceDelta = (y - state.startY) * state.pricePerPixel;
        state.latestRange = {
          from: state.startFrom + priceDelta,
          to: state.startTo + priceDelta
        };
        suppressPreviewPriceScalePaneTap();
        return applyPreviewManualPriceScaleRange(state.latestRange, state.referenceSpan);
      }

      function startPreviewPriceScaleGlide(velocityPxMs, pricePerPixel, startRange, referenceSpan) {
        stopPreviewPriceScaleGlide();
        var range = normalizePreviewPriceScaleRange(startRange);
        var velocity = Number(velocityPxMs);
        if (
          !range ||
          !(pricePerPixel > 0) ||
          !isFinite(velocity) ||
          Math.abs(velocity) < PREVIEW_PRICE_SCALE_GLIDE_MIN_VELOCITY_PX_MS ||
          isPreviewVerticalPriceMovementBlocked()
        ) return false;
        velocity = Math.max(
          -PREVIEW_PRICE_SCALE_GLIDE_MAX_VELOCITY_PX_MS,
          Math.min(PREVIEW_PRICE_SCALE_GLIDE_MAX_VELOCITY_PX_MS, velocity)
        );
        var glide = {
          lastAt: Date.now(),
          pricePerPixel: pricePerPixel,
          range: range,
          referenceSpan: referenceSpan,
          velocity: velocity,
          raf: 0
        };
        previewPriceScaleGlide = glide;
        var step = function() {
          if (previewPriceScaleGlide !== glide) return;
          glide.raf = 0;
          if (isPreviewVerticalPriceMovementBlocked()) {
            previewPriceScaleGlide = null;
            return;
          }
          var now = Date.now();
          var elapsed = Math.max(1, Math.min(64, now - glide.lastAt));
          glide.lastAt = now;
          var priceShift = glide.velocity * elapsed * glide.pricePerPixel;
          glide.range = {
            from: glide.range.from + priceShift,
            to: glide.range.to + priceShift
          };
          applyPreviewManualPriceScaleRange(glide.range, glide.referenceSpan);
          glide.velocity *= Math.pow(
            PREVIEW_PRICE_SCALE_GLIDE_DECAY_PER_FRAME,
            elapsed / 16
          );
          if (Math.abs(glide.velocity) <= PREVIEW_PRICE_SCALE_GLIDE_STOP_VELOCITY_PX_MS) {
            previewPriceScaleGlide = null;
            reapplyPreviewManualPriceScale();
            return;
          }
          glide.raf = requestAnimationFrame(step);
        };
        glide.raf = requestAnimationFrame(step);
        return true;
      }

      function finishPreviewBodyPricePan(cancelled) {
        var state = previewPriceScaleBodyPan;
        if (!state) return false;
        previewPriceScaleBodyPan = null;
        var finalRange = normalizePreviewPriceScaleRange(state.latestRange);
        if (finalRange) {
          applyPreviewManualPriceScaleRange(finalRange, state.referenceSpan);
        }
        if (cancelled !== true && finalRange) {
          startPreviewPriceScaleGlide(
            state.velocityPxMs,
            state.pricePerPixel,
            finalRange,
            state.referenceSpan
          );
        }
        suppressPreviewPriceScalePaneTap();
        return true;
      }

      function stopPreviewPriceScaleEvent(event) {
        if (!event) return;
        try { if (event.cancelable !== false) event.preventDefault(); } catch (_error) {}
        try { event.stopPropagation(); } catch (_error) {}
      }

      function resolvePreviewPriceScaleEventPoint(event, useChangedTouches) {
        if (!event) return null;
        var collection = useChangedTouches ? event.changedTouches : event.touches;
        var touch = collection && collection.length > 0 ? collection[0] : null;
        var source = touch || event;
        var x = Number(source.clientX);
        var y = Number(source.clientY);
        return isFinite(x) && isFinite(y) ? { x: x, y: y } : null;
      }

      function clearPreviewBodyPanPending() {
        previewPriceScaleBodyPanPending = null;
      }

      function beginPreviewPriceScalePinch() {
        stopPreviewPriceScaleGlide();
        if (previewPriceScaleAxisGesture) {
          finishPreviewAxisPriceScaleGesture(true);
        } else if (previewPriceScaleBodyPan) {
          finishPreviewBodyPricePan(true);
        }
        clearPreviewBodyPanPending();
        previewPriceScaleLastAxisTap = null;
        previewPriceScalePinchActive = true;
        suppressPreviewPriceScalePaneTap();
      }

      function onPreviewPriceScaleInputStart(event) {
        stopPreviewPriceScaleGlide();
        var touchCount = event && event.touches ? event.touches.length : 0;
        if (touchCount > 1) {
          beginPreviewPriceScalePinch();
          return;
        }
        var point = resolvePreviewPriceScaleEventPoint(event, false);
        if (!point) return;
        if (isPreviewRightPriceScaleGesturePoint(point.x, point.y)) {
          suppressPreviewPriceScalePaneTap();
          clearPreviewBodyPanPending();
          if (beginPreviewAxisPriceScaleGesture(event, point.x, point.y)) {
            stopPreviewPriceScaleEvent(event);
          }
          return;
        }
        previewPriceScaleLastAxisTap = null;
        previewPriceScaleBodyPanPending = {
          startX: point.x,
          startY: point.y
        };
      }

      function onPreviewPriceScaleInputMove(event) {
        if (event && event.touches && event.touches.length > 1) {
          beginPreviewPriceScalePinch();
          return;
        }
        var point = resolvePreviewPriceScaleEventPoint(event, false);
        if (!point) return;
        if (previewPriceScaleAxisGesture) {
          movePreviewAxisPriceScaleGesture(point.y);
          stopPreviewPriceScaleEvent(event);
          return;
        }
        if (previewPriceScaleBodyPan) {
          movePreviewBodyPricePan(point.y);
          stopPreviewPriceScaleEvent(event);
          return;
        }
        var pending = previewPriceScaleBodyPanPending;
        if (!pending) return;
        var dx = Math.abs(point.x - pending.startX);
        var dy = Math.abs(point.y - pending.startY);
        if (dy > PREVIEW_PRICE_SCALE_BODY_PAN_THRESHOLD_PX && dy > dx * 1.2) {
          if (beginPreviewBodyPricePan(pending.startX, pending.startY)) {
            clearPreviewBodyPanPending();
            movePreviewBodyPricePan(point.y);
            stopPreviewPriceScaleEvent(event);
          } else {
            clearPreviewBodyPanPending();
          }
        } else if (dx > PREVIEW_PRICE_SCALE_BODY_PAN_THRESHOLD_PX && dx > dy * 1.2) {
          clearPreviewBodyPanPending();
        }
      }

      function onPreviewPriceScaleInputEnd(event, cancelled, remainingInputCount) {
        var point = resolvePreviewPriceScaleEventPoint(event, true);
        var handled = false;
        if (previewPriceScaleAxisGesture) {
          handled = finishPreviewAxisPriceScaleGesture(cancelled === true);
        } else if (previewPriceScaleBodyPan) {
          handled = finishPreviewBodyPricePan(cancelled === true);
        }
        clearPreviewBodyPanPending();
        var remainingTouches = typeof remainingInputCount === 'number'
          ? Math.max(0, remainingInputCount)
          : event && event.touches
            ? event.touches.length
            : 0;
        if (previewPriceScalePinchActive && remainingTouches === 0) {
          previewPriceScalePinchActive = false;
          if (!reapplyPreviewManualPriceScale() && previewPriceScaleAutoScaleEnabled) {
            enablePreviewPriceAutoScale();
          }
          suppressPreviewPriceScalePaneTap();
        }
        if (handled || (point && isPreviewRightPriceScaleGesturePoint(point.x, point.y))) {
          stopPreviewPriceScaleEvent(event);
        }
      }

      function installPreviewPriceScaleInteractions() {
        if (!chartHost || typeof chartHost.addEventListener !== 'function') return false;
        if (typeof previewPriceScaleDetachListeners === 'function') {
          previewPriceScaleDetachListeners();
        }
        applyPreviewPriceScaleInteractionOptions();
        var usePointerEvents = typeof window.PointerEvent === 'function';
        var startEvent = usePointerEvents ? 'pointerdown' : 'touchstart';
        var moveEvent = usePointerEvents ? 'pointermove' : 'touchmove';
        var endEvent = usePointerEvents ? 'pointerup' : 'touchend';
        var cancelEvent = usePointerEvents ? 'pointercancel' : 'touchcancel';
        var onStart = function(event) {
          if (usePointerEvents && typeof event.pointerId === 'number') {
            previewPriceScaleActivePointerIds[String(event.pointerId)] = true;
            if (Object.keys(previewPriceScaleActivePointerIds).length > 1) {
              beginPreviewPriceScalePinch();
              return;
            }
          }
          onPreviewPriceScaleInputStart(event);
        };
        var onMove = function(event) {
          if (
            usePointerEvents &&
            Object.keys(previewPriceScaleActivePointerIds).length > 1
          ) {
            beginPreviewPriceScalePinch();
            return;
          }
          onPreviewPriceScaleInputMove(event);
        };
        var onEnd = function(event) {
          if (usePointerEvents && typeof event.pointerId === 'number') {
            delete previewPriceScaleActivePointerIds[String(event.pointerId)];
          }
          var remainingPointers = usePointerEvents
            ? Object.keys(previewPriceScaleActivePointerIds).length
            : undefined;
          onPreviewPriceScaleInputEnd(event, false, remainingPointers);
        };
        var onCancel = function(event) {
          if (usePointerEvents && typeof event.pointerId === 'number') {
            delete previewPriceScaleActivePointerIds[String(event.pointerId)];
          }
          var remainingPointers = usePointerEvents
            ? Object.keys(previewPriceScaleActivePointerIds).length
            : undefined;
          onPreviewPriceScaleInputEnd(event, true, remainingPointers);
        };
        var listenerOptions = { capture: true, passive: false };
        chartHost.addEventListener(startEvent, onStart, listenerOptions);
        chartHost.addEventListener(moveEvent, onMove, listenerOptions);
        chartHost.addEventListener(endEvent, onEnd, listenerOptions);
        chartHost.addEventListener(cancelEvent, onCancel, listenerOptions);
        previewPriceScaleDetachListeners = function() {
          try { chartHost.removeEventListener(startEvent, onStart, listenerOptions); } catch (_error) {}
          try { chartHost.removeEventListener(moveEvent, onMove, listenerOptions); } catch (_error) {}
          try { chartHost.removeEventListener(endEvent, onEnd, listenerOptions); } catch (_error) {}
          try { chartHost.removeEventListener(cancelEvent, onCancel, listenerOptions); } catch (_error) {}
          previewPriceScaleDetachListeners = null;
          previewPriceScaleActivePointerIds = Object.create(null);
          previewPriceScalePinchActive = false;
          previewPriceScaleAxisGesture = null;
          previewPriceScaleBodyPan = null;
          previewPriceScaleBodyPanPending = null;
          stopPreviewPriceScaleGlide();
        };
        return true;
      }

      function detachPreviewPriceScaleInteractions() {
        if (typeof previewPriceScaleDetachListeners === 'function') {
          previewPriceScaleDetachListeners();
          return true;
        }
        return false;
      }

      function notifyPreviewPriceScaleResized() {
        applyPreviewPriceScaleInteractionOptions();
        reapplyPreviewManualPriceScale();
        refreshPreviewPriceScaleBadge();
      }

      window.applyPreviewPriceScaleInteractionOptions = applyPreviewPriceScaleInteractionOptions;
      window.detachPreviewPriceScaleInteractions = detachPreviewPriceScaleInteractions;
      window.getPreviewManualPriceScaleSnapshot = getPreviewManualPriceScaleSnapshot;
      window.installPreviewPriceScaleInteractions = installPreviewPriceScaleInteractions;
      window.isPreviewRightPriceScaleGesturePoint = isPreviewRightPriceScaleGesturePoint;
      window.notifyPreviewPriceScaleResized = notifyPreviewPriceScaleResized;
      window.reapplyPreviewManualPriceScale = reapplyPreviewManualPriceScale;
      window.resetPreviewPriceScale = resetPreviewPriceScale;
      window.restorePreviewManualPriceScale = restorePreviewManualPriceScale;
      window.setPreviewChartAutoScaleEnabled = setPreviewChartAutoScaleEnabled;
      window.setPreviewVerticalScrollingLocked = setPreviewVerticalScrollingLocked;
      window.shouldSuppressPreviewPaneTap = shouldSuppressPreviewPaneTap;
`;
