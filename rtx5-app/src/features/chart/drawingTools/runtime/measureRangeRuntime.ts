import type { EnhancedDrawingToolRuntime } from '../types';

export const measureRangeEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'measure',
  script: `
  /**
   * Helper function: formatMeasurePercent.
   */
  function formatMeasurePercent(p1, p2) {
    if (!p1 || !p2 || !isFiniteNumber(p1.price) || !isFiniteNumber(p2.price) || p1.price === 0) {
      return '';
    }
    return formatCrosshairPercent(((p2.price - p1.price) / Math.abs(p1.price)) * 100);
  }

  /**
   * Helper function: formatMeasureBars.
   */
  function formatMeasureBars(p1, p2) {
    if (!p1 || !p2 || !isFiniteNumber(p1.dataIndex) || !isFiniteNumber(p2.dataIndex)) {
      return '';
    }
    var bars = Math.abs(Math.round(p2.dataIndex - p1.dataIndex));
    return bars + ' bar' + (bars === 1 ? '' : 's');
  }

  /**
   * Helper function: formatMeasureLabel.
   */
  function formatMeasureLabel(p1, p2) {
    var parts = [formatDelta(p2.price - p1.price)];
    var percent = formatMeasurePercent(p1, p2);
    if (percent) parts.push('(' + percent + ')');
    var bars = formatMeasureBars(p1, p2);
    if (bars) parts.push('/ ' + bars);
    parts.push('/ ' + formatDuration(Math.abs(Number(p2.time) - Number(p1.time))));
    return parts.join(' ');
  }

  function normalizeMeasureRangeStyle(style) {
    var source = style && typeof style === 'object' ? style : {};
    var borderColor = typeof source.borderColor === 'string'
      ? source.borderColor
      : (typeof source.color === 'string' ? source.color : '#94A3B8');
    var borderStyle = source.borderStyle === 'dashed' || source.borderStyle === 'dotted'
      ? source.borderStyle
      : (source.lineStyle === 'dashed' || source.lineStyle === 'dotted' ? source.lineStyle : 'solid');
    return {
      fillColor: typeof source.fillColor === 'string' ? source.fillColor : 'rgba(148, 163, 184, 0.08)',
      borderColor: borderColor,
      borderWidth: isFiniteNumber(source.borderWidth || source.width) ? Math.max(1, Math.min(8, source.borderWidth || source.width)) : 1.1,
      borderStyle: borderStyle,
      opacity: isFiniteNumber(source.opacity) ? Math.max(0.1, Math.min(1, source.opacity)) : 1,
      labelBackgroundColor: typeof source.labelBackgroundColor === 'string' ? source.labelBackgroundColor : 'rgba(15, 23, 42, 0.9)',
      labelTextColor: typeof source.labelTextColor === 'string' ? source.labelTextColor : '#E2E8F0'
    };
  }

  /**
   * Registers this drawing tool with the global drawing manager so it can be instantiated by the chart.
   */
  registerEnhancedDrawingTool({
    kind: 'measure',
    defaultLabel: 'Scale',
    requiredPointCount: 2,
    createTool: function (chart, series, manager) {
      return new BoxTool('measure', chart, series, manager, {
        fillColor: 'rgba(148, 163, 184, 0.08)',
        previewFillColor: 'rgba(148, 163, 184, 0.04)',
        borderColor: '#94A3B8',
        borderWidth: 1.1,
        borderStyle: 'solid',
        opacity: 1,
        labelBuilder: function (p1, p2) {
          return formatMeasureLabel(p1, p2);
        },
        labelBackgroundColor: 'rgba(15, 23, 42, 0.9)',
        labelTextColor: '#E2E8F0'
      });
    },
    createPrimitiveFromRecord: function (record) {
      var points = record.points || [];
      var style = normalizeMeasureRangeStyle(record && record.style);
      return createBoxPrimitive(points[0], points[1], {
        fillColor: style.fillColor,
        borderColor: style.borderColor,
        borderWidth: style.borderWidth,
        borderStyle: style.borderStyle,
        opacity: style.opacity,
        label: formatMeasureLabel(points[0], points[1]),
        labelBackgroundColor: style.labelBackgroundColor,
        labelTextColor: style.labelTextColor,
        fontSize: 11
      });
    }
  });
`,
};
