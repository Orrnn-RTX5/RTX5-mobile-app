import { CHART_CANDLE_COUNTDOWN_FIXED_SECONDS } from '../chartCandleCountdown';
import { CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH } from '../ChartScreen.constants';

/**
 * WebView-local split-chart countdown runtime.
 *
 * The auxiliary chart intentionally owns its one-second ticker inside the
 * WebView. React only sends context, activity, and quote changes; it never
 * rerenders either chart once per second. Requested and painted contexts are
 * tracked separately so a retained old-symbol candle can never provide the
 * countdown for a newly selected pane.
 */
export const LIVE_CHART_PREVIEW_COUNTDOWN_SCRIPT = String.raw`
      var PREVIEW_CANDLE_COUNTDOWN_FIXED_SECONDS = ${JSON.stringify(CHART_CANDLE_COUNTDOWN_FIXED_SECONDS)};
      var PREVIEW_PRICE_BADGE_PRICE_ROW_HEIGHT = 18;
      var PREVIEW_PRICE_BADGE_COUNTDOWN_ROW_HEIGHT = 14;
      var PREVIEW_PRICE_BADGE_HEIGHT =
        PREVIEW_PRICE_BADGE_PRICE_ROW_HEIGHT + PREVIEW_PRICE_BADGE_COUNTDOWN_ROW_HEIGHT;
      var PREVIEW_PRICE_BADGE_MIN_WIDTH = ${CHART_RIGHT_PRICE_SCALE_MINIMUM_WIDTH};
      var previewCountdownRequestedContextKey = '';
      var previewCountdownRequestedGeneration = 0;
      var previewCountdownSeriesContextKey = '';
      var previewCountdownSeriesGeneration = 0;
      var previewCountdownTimeframe = null;
      var previewCountdownActive = false;
      var previewCountdownLivePrice = null;
      var previewCountdownLiveColor = '#2962FF';
      var previewCountdownDisplayDecimals = 2;
      var previewCountdownLastBarTime = null;
      var previewCountdownTimer = null;

      function normalizePreviewCandleCountdownTimeframe(timeframe) {
        var raw = String(timeframe == null ? '' : timeframe).trim();
        if (!raw) return null;
        var caseSensitiveAliases = {
          '1m': 'M1',
          '5m': 'M5',
          '15m': 'M15',
          '30m': 'M30',
          '1h': 'H1',
          '4h': 'H4',
          '1d': 'D1',
          '1w': 'W1',
          '1M': 'MN'
        };
        if (caseSensitiveAliases[raw]) return caseSensitiveAliases[raw];
        var aliases = {
          '1': 'M1',
          '5': 'M5',
          '15': 'M15',
          '30': 'M30',
          '60': 'H1',
          '240': 'H4',
          'M1': 'M1',
          'M5': 'M5',
          'M15': 'M15',
          'M30': 'M30',
          'H1': 'H1',
          'H4': 'H4',
          'D1': 'D1',
          'W1': 'W1',
          'MN': 'MN',
          'MN1': 'MN',
          'MONTH': 'MN',
          'MONTHLY': 'MN',
          '1MIN': 'M1',
          '5MIN': 'M5',
          '15MIN': 'M15',
          '30MIN': 'M30',
          '1H': 'H1',
          '4H': 'H4',
          '1D': 'D1',
          '1W': 'W1',
          '1MO': 'MN'
        };
        var normalized = aliases[raw.toUpperCase()] || null;
        return normalized && Object.prototype.hasOwnProperty.call(
          PREVIEW_CANDLE_COUNTDOWN_FIXED_SECONDS,
          normalized
        ) ? normalized : null;
      }

      function normalizePreviewCountdownBarTimeSeconds(value) {
        var numeric = Number(value);
        if (!isFinite(numeric) || numeric <= 0) return null;
        if (numeric > 4.2e10) numeric = numeric / 1000;
        return Math.floor(numeric);
      }

      function resolvePreviewCountdownBucketStartSeconds(barTime, timeframe) {
        var normalizedTimeframe = normalizePreviewCandleCountdownTimeframe(timeframe);
        var barTimeSeconds = normalizePreviewCountdownBarTimeSeconds(barTime);
        if (!normalizedTimeframe || barTimeSeconds === null) return null;

        var barDate = new Date(barTimeSeconds * 1000);
        if (normalizedTimeframe === 'MN') {
          return Math.floor(Date.UTC(barDate.getUTCFullYear(), barDate.getUTCMonth(), 1) / 1000);
        }
        if (normalizedTimeframe === 'D1' || normalizedTimeframe === 'W1') {
          var dayStartSeconds = Math.floor(Date.UTC(
            barDate.getUTCFullYear(),
            barDate.getUTCMonth(),
            barDate.getUTCDate()
          ) / 1000);
          if (normalizedTimeframe === 'W1') {
            var daysSinceMonday = (barDate.getUTCDay() + 6) % 7;
            return dayStartSeconds - daysSinceMonday * 24 * 60 * 60;
          }
          return dayStartSeconds;
        }

        var intervalSeconds = PREVIEW_CANDLE_COUNTDOWN_FIXED_SECONDS[normalizedTimeframe];
        if (typeof intervalSeconds !== 'number' || !isFinite(intervalSeconds) || intervalSeconds <= 0) {
          return null;
        }
        return Math.floor(barTimeSeconds / intervalSeconds) * intervalSeconds;
      }

      function resolvePreviewCountdownCloseTimeMs(barTime, timeframe) {
        var normalizedTimeframe = normalizePreviewCandleCountdownTimeframe(timeframe);
        var bucketStartSeconds = resolvePreviewCountdownBucketStartSeconds(barTime, normalizedTimeframe);
        if (!normalizedTimeframe || bucketStartSeconds === null) return null;
        if (normalizedTimeframe === 'MN') {
          var barDate = new Date(bucketStartSeconds * 1000);
          return Date.UTC(barDate.getUTCFullYear(), barDate.getUTCMonth() + 1, 1);
        }
        var intervalSeconds = PREVIEW_CANDLE_COUNTDOWN_FIXED_SECONDS[normalizedTimeframe];
        return typeof intervalSeconds === 'number' && isFinite(intervalSeconds) && intervalSeconds > 0
          ? (bucketStartSeconds + intervalSeconds) * 1000
          : null;
      }

      function previewCountdownContextsMatch() {
        return !!previewCountdownRequestedContextKey &&
          previewCountdownRequestedContextKey === previewCountdownSeriesContextKey &&
          previewCountdownRequestedGeneration > 0 &&
          previewCountdownRequestedGeneration === previewCountdownSeriesGeneration;
      }

      function getPreviewCandleCountdownRemainingSeconds(nowMs) {
        if (!previewCountdownContextsMatch()) return null;
        var normalizedTimeframe = normalizePreviewCandleCountdownTimeframe(previewCountdownTimeframe);
        var barTimeSeconds = normalizePreviewCountdownBarTimeSeconds(previewCountdownLastBarTime);
        if (!normalizedTimeframe || barTimeSeconds === null) return null;
        var bucketStartSeconds = resolvePreviewCountdownBucketStartSeconds(
          barTimeSeconds,
          normalizedTimeframe
        );
        var closeTimeMs = resolvePreviewCountdownCloseTimeMs(barTimeSeconds, normalizedTimeframe);
        if (bucketStartSeconds === null || closeTimeMs === null) return null;
        var currentTimeMs = typeof nowMs === 'number' && isFinite(nowMs) ? nowMs : Date.now();
        var bucketDurationSeconds = Math.max(0, Math.round(closeTimeMs / 1000 - bucketStartSeconds));
        var remainingSeconds = Math.max(0, Math.ceil((closeTimeMs - currentTimeMs) / 1000));
        return Math.min(bucketDurationSeconds, remainingSeconds);
      }

      function padPreviewCountdownUnit(value) {
        return String(value).padStart(2, '0');
      }

      function formatPreviewCandleCountdown(remainingSeconds) {
        if (typeof remainingSeconds !== 'number' || !isFinite(remainingSeconds) || remainingSeconds < 0) {
          return null;
        }
        var totalSeconds = Math.floor(remainingSeconds);
        var seconds = totalSeconds % 60;
        var totalMinutes = Math.floor(totalSeconds / 60);
        var minutes = totalMinutes % 60;
        var totalHours = Math.floor(totalMinutes / 60);
        var hours = totalHours % 24;
        var days = Math.floor(totalHours / 24);
        if (previewCountdownTimeframe === 'H1') {
          return padPreviewCountdownUnit(totalMinutes) + ':' + padPreviewCountdownUnit(seconds);
        }
        if (
          previewCountdownTimeframe === 'H4' ||
          previewCountdownTimeframe === 'D1' ||
          previewCountdownTimeframe === 'W1' ||
          previewCountdownTimeframe === 'MN'
        ) {
          return padPreviewCountdownUnit(totalHours) + ':' +
            padPreviewCountdownUnit(minutes) + ':' + padPreviewCountdownUnit(seconds);
        }
        if (days > 0) {
          return days + 'd ' + padPreviewCountdownUnit(hours) + ':' +
            padPreviewCountdownUnit(minutes) + ':' + padPreviewCountdownUnit(seconds);
        }
        if (totalHours > 0) {
          return padPreviewCountdownUnit(totalHours) + ':' +
            padPreviewCountdownUnit(minutes) + ':' + padPreviewCountdownUnit(seconds);
        }
        return padPreviewCountdownUnit(totalMinutes) + ':' + padPreviewCountdownUnit(seconds);
      }

      function clearPreviewLivePriceBadge() {
        if (!chartHost || typeof chartHost.querySelector !== 'function') return;
        var badge = chartHost.querySelector('.rtx5-preview-live-price-badge');
        if (badge && badge.parentNode) badge.parentNode.removeChild(badge);
      }

      function resolvePreviewRightPriceScaleAxisMetrics() {
        var hostWidth = Math.max(0, Math.floor(chartHost && chartHost.clientWidth || 0));
        if (hostWidth <= 0) return null;
        var measuredAxisWidth = 0;
        try {
          var rightPriceScale = chart && typeof chart.priceScale === 'function'
            ? chart.priceScale('right')
            : null;
          measuredAxisWidth = rightPriceScale && typeof rightPriceScale.width === 'function'
            ? Number(rightPriceScale.width())
            : 0;
        } catch (_error) {
          measuredAxisWidth = 0;
        }
        var axisWidth = typeof measuredAxisWidth === 'number' && isFinite(measuredAxisWidth) && measuredAxisWidth > 0
          ? Math.min(hostWidth, Math.max(1, Math.ceil(measuredAxisWidth)))
          : Math.min(hostWidth, PREVIEW_PRICE_BADGE_MIN_WIDTH);
        return {
          axisLeft: Math.max(0, hostWidth - axisWidth),
          axisWidth: axisWidth
        };
      }

      function renderPreviewLivePriceBadge() {
        var remainingSeconds = previewCountdownActive
          ? getPreviewCandleCountdownRemainingSeconds(Date.now())
          : null;
        var countdownLabel = formatPreviewCandleCountdown(remainingSeconds);
        if (
          !previewCountdownActive ||
          !countdownLabel ||
          !series ||
          !chartHost ||
          typeof series.priceToCoordinate !== 'function' ||
          typeof previewCountdownLivePrice !== 'number' ||
          !isFinite(previewCountdownLivePrice) ||
          previewCountdownLivePrice <= 0
        ) {
          clearPreviewLivePriceBadge();
          return;
        }
        var coordinate = series.priceToCoordinate(previewCountdownLivePrice);
        if (typeof coordinate !== 'number' || !isFinite(coordinate)) {
          clearPreviewLivePriceBadge();
          return;
        }

        var badge = chartHost.querySelector('.rtx5-preview-live-price-badge');
        var priceRow = badge && badge.querySelector
          ? badge.querySelector('.rtx5-preview-live-price-badge-price')
          : null;
        var countdownRow = badge && badge.querySelector
          ? badge.querySelector('.rtx5-preview-live-price-badge-countdown')
          : null;
        if (!badge || !priceRow || !countdownRow) {
          if (badge && badge.parentNode) badge.parentNode.removeChild(badge);
          badge = document.createElement('div');
          badge.className = 'rtx5-preview-live-price-badge';
          priceRow = document.createElement('span');
          priceRow.className = 'rtx5-preview-live-price-badge-price';
          countdownRow = document.createElement('span');
          countdownRow.className = 'rtx5-preview-live-price-badge-countdown';
          countdownRow.setAttribute('data-rtx5-role', 'candle-countdown');
          badge.appendChild(priceRow);
          badge.appendChild(countdownRow);
          chartHost.appendChild(badge);
        }

        var axisMetrics = resolvePreviewRightPriceScaleAxisMetrics();
        if (!axisMetrics) {
          clearPreviewLivePriceBadge();
          return;
        }
        var hostHeight = Math.max(0, Math.floor(chartHost.clientHeight || 0));
        var maxTop = Math.max(0, hostHeight - PREVIEW_PRICE_BADGE_HEIGHT);
        var top = Math.max(
          0,
          Math.min(maxTop, Math.round(coordinate - PREVIEW_PRICE_BADGE_PRICE_ROW_HEIGHT / 2))
        );
        var decimals = Math.max(0, Math.min(10, Math.floor(previewCountdownDisplayDecimals || 0)));

        priceRow.textContent = Number(previewCountdownLivePrice).toFixed(decimals);
        countdownRow.textContent = countdownLabel;
        badge.style.position = 'absolute';
        badge.style.left = axisMetrics.axisLeft + 'px';
        badge.style.right = 'auto';
        badge.style.top = top + 'px';
        badge.style.width = axisMetrics.axisWidth + 'px';
        badge.style.height = PREVIEW_PRICE_BADGE_HEIGHT + 'px';
        badge.style.boxSizing = 'border-box';
        badge.style.padding = '0 4px';
        badge.style.background = previewCountdownLiveColor || '#2962FF';
        badge.style.color = '#FFFFFF';
        badge.style.borderRadius = '2px';
        badge.style.fontWeight = '700';
        badge.style.fontVariantNumeric = 'tabular-nums';
        badge.style.fontFeatureSettings = '"tnum" 1, "lnum" 1';
        badge.style.textAlign = 'right';
        badge.style.whiteSpace = 'nowrap';
        badge.style.overflow = 'hidden';
        badge.style.pointerEvents = 'none';
        badge.style.zIndex = '20';
        badge.style.display = 'flex';
        badge.style.flexDirection = 'column';
        badge.style.alignItems = 'stretch';
        priceRow.style.display = 'block';
        priceRow.style.height = PREVIEW_PRICE_BADGE_PRICE_ROW_HEIGHT + 'px';
        priceRow.style.lineHeight = PREVIEW_PRICE_BADGE_PRICE_ROW_HEIGHT + 'px';
        priceRow.style.fontSize = '12px';
        countdownRow.style.display = 'block';
        countdownRow.style.height = PREVIEW_PRICE_BADGE_COUNTDOWN_ROW_HEIGHT + 'px';
        countdownRow.style.lineHeight = PREVIEW_PRICE_BADGE_COUNTDOWN_ROW_HEIGHT + 'px';
        countdownRow.style.fontSize = countdownLabel.length > 11 ? '8px' : '10px';
      }

      function stopPreviewCandleCountdownTicker() {
        if (previewCountdownTimer !== null) {
          try { clearTimeout(previewCountdownTimer); } catch (_error) {}
          previewCountdownTimer = null;
        }
      }

      function scheduleNextPreviewCandleCountdownTick() {
        if (!previewCountdownActive || !previewCountdownTimeframe || previewCountdownTimer !== null) return;
        var requestedKey = previewCountdownRequestedContextKey;
        var requestedGeneration = previewCountdownRequestedGeneration;
        var delay = Math.max(50, 1000 - (Date.now() % 1000) + 16);
        previewCountdownTimer = setTimeout(function() {
          previewCountdownTimer = null;
          if (
            requestedKey !== previewCountdownRequestedContextKey ||
            requestedGeneration !== previewCountdownRequestedGeneration
          ) return;
          if (!document.hidden) renderPreviewLivePriceBadge();
          scheduleNextPreviewCandleCountdownTick();
        }, delay);
      }

      function setPreviewCountdownSeriesContext(dataContextKey, dataGeneration, data) {
        previewCountdownSeriesContextKey = typeof dataContextKey === 'string' ? dataContextKey : '';
        previewCountdownSeriesGeneration = Number(dataGeneration) || 0;
        var source = Array.isArray(data) ? data : [];
        var last = source.length > 0 ? source[source.length - 1] : null;
        previewCountdownLastBarTime = last ? last.time : null;
        renderPreviewLivePriceBadge();
      }

      function updatePreviewCountdownSeriesTick(tick, dataContextKey, dataGeneration) {
        if (
          previewCountdownSeriesContextKey !== dataContextKey ||
          previewCountdownSeriesGeneration !== Number(dataGeneration) ||
          !tick
        ) return;
        previewCountdownLastBarTime = tick.time;
        renderPreviewLivePriceBadge();
      }

      function setPreviewCandleCountdown(
        timeframe,
        active,
        livePrice,
        liveColor,
        displayDecimals,
        dataContextKey,
        dataGeneration
      ) {
        var nextContextKey = typeof dataContextKey === 'string' ? dataContextKey : '';
        var nextGeneration = Number(dataGeneration) || 0;
        var contextChanged =
          previewCountdownRequestedContextKey !== nextContextKey ||
          previewCountdownRequestedGeneration !== nextGeneration;
        previewCountdownRequestedContextKey = nextContextKey;
        previewCountdownRequestedGeneration = nextGeneration;
        previewCountdownTimeframe = normalizePreviewCandleCountdownTimeframe(timeframe);
        previewCountdownActive = active === true;
        previewCountdownLivePrice =
          typeof livePrice === 'number' && isFinite(livePrice) && livePrice > 0 ? livePrice : null;
        previewCountdownLiveColor = typeof liveColor === 'string' ? liveColor : '#2962FF';
        previewCountdownDisplayDecimals = Number(displayDecimals) || 0;
        stopPreviewCandleCountdownTicker();
        if (contextChanged || !previewCountdownActive) clearPreviewLivePriceBadge();
        if (previewCountdownActive && previewCountdownTimeframe) {
          scheduleNextPreviewCandleCountdownTick();
        }
        renderPreviewLivePriceBadge();
        return previewCountdownTimeframe !== null;
      }
`;
