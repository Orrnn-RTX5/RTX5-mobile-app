/**
 * UTC time-axis formatter shared by every lightweight auxiliary chart window.
 * It intentionally mirrors the full chart formatter so splitting the screen
 * cannot drop the date from intraday labels.
 */
export const LIVE_CHART_PREVIEW_TIME_AXIS_SCRIPT = String.raw`
      function resolvePreviewTickDateValue(value) {
        if (typeof value === 'string') {
          var trimmed = value.trim();
          if (!trimmed) return null;
          var numeric = Number(trimmed);
          if (isFinite(numeric)) {
            value = numeric;
          } else {
            var parsedStringDate = new Date(trimmed);
            return isFinite(parsedStringDate.getTime()) ? parsedStringDate : null;
          }
        }

        if (typeof value === 'number' && isFinite(value)) {
          var absValue = Math.abs(value);
          if (absValue > 4.2e16) return new Date(Math.floor(value / 1000000));
          if (absValue > 4.2e13) return new Date(Math.floor(value / 1000));
          if (absValue > 4.2e10) return new Date(value);
          return new Date(value * 1000);
        }

        return null;
      }

      function resolvePreviewTickDate(time) {
        var directDate = resolvePreviewTickDateValue(time);
        if (directDate) return directDate;

        if (time && typeof time === 'object') {
          var timestampDate = resolvePreviewTickDateValue(time.timestamp);
          if (timestampDate) return timestampDate;
          var nestedTimeDate = resolvePreviewTickDateValue(time.time);
          if (nestedTimeDate) return nestedTimeDate;

          if (
            typeof time.year === 'number' &&
            typeof time.month === 'number' &&
            typeof time.day === 'number'
          ) {
            return new Date(Date.UTC(time.year, time.month - 1, time.day));
          }

          if (
            time.businessDay &&
            typeof time.businessDay === 'object' &&
            typeof time.businessDay.year === 'number' &&
            typeof time.businessDay.month === 'number' &&
            typeof time.businessDay.day === 'number'
          ) {
            return new Date(Date.UTC(
              time.businessDay.year,
              time.businessDay.month - 1,
              time.businessDay.day
            ));
          }
        }

        return null;
      }

      function formatPreviewChartTickMark(time, tickMarkType, _locale) {
        try {
          var date = resolvePreviewTickDate(time);
          if (!date || !isFinite(date.getTime())) return null;
          var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          var day = String(date.getUTCDate()).padStart(2, '0');
          var month = months[date.getUTCMonth()] || '';
          var hours = String(date.getUTCHours()).padStart(2, '0');
          var minutes = String(date.getUTCMinutes()).padStart(2, '0');

          if (tickMarkType === 3 || tickMarkType === 4) {
            return day + ' ' + month + ' ' + hours + ':' + minutes;
          }
          if (tickMarkType === 2) return day + ' ' + month;
          if (tickMarkType === 1) return month + ' ' + String(date.getUTCFullYear());
          if (tickMarkType === 0) return String(date.getUTCFullYear());
          return day + ' ' + month;
        } catch (_error) {
          return null;
        }
      }

      function formatPreviewChartTime(time) {
        try {
          var date = resolvePreviewTickDate(time);
          if (!date || !isFinite(date.getTime())) return '';
          var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          var day = String(date.getUTCDate()).padStart(2, '0');
          var month = months[date.getUTCMonth()] || '';
          var hours = String(date.getUTCHours()).padStart(2, '0');
          var minutes = String(date.getUTCMinutes()).padStart(2, '0');
          return day + ' ' + month + ' ' + hours + ':' + minutes;
        } catch (_error) {
          return '';
        }
      }
`;
