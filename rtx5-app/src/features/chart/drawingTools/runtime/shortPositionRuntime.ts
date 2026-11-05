import type { EnhancedDrawingToolRuntime } from '../types';

export const shortPositionEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'shortPosition',
  script: `
  /**
   * Helper function: buildShortPositionLabel.
   */
  function buildShortPositionLabel(p1, p2) {
    var delta = p1.price - p2.price;
    var pct = p1.price ? (delta / p1.price) * 100 : 0;
    return 'Short ' + formatDelta(delta) + ' (' + pct.toFixed(2) + '%)';
  }

  function normalizeShortPositionStyle(style) {
    var source = style && typeof style === 'object' ? style : {};
    var borderColor = typeof source.borderColor === 'string'
      ? source.borderColor
      : (typeof source.color === 'string' ? source.color : '#F43F5E');
    var borderStyle = source.borderStyle === 'dashed' || source.borderStyle === 'dotted'
      ? source.borderStyle
      : (source.lineStyle === 'dashed' || source.lineStyle === 'dotted' ? source.lineStyle : 'solid');
    return {
      fillColor: typeof source.fillColor === 'string' ? source.fillColor : 'rgba(244, 63, 94, 0.14)',
      borderColor: borderColor,
      borderWidth: isFiniteNumber(source.borderWidth || source.width) ? Math.max(1, Math.min(8, source.borderWidth || source.width)) : 1.4,
      borderStyle: borderStyle,
      opacity: isFiniteNumber(source.opacity) ? Math.max(0.1, Math.min(1, source.opacity)) : 1,
      labelBackgroundColor: typeof source.labelBackgroundColor === 'string' ? source.labelBackgroundColor : 'rgba(127, 29, 29, 0.92)',
      labelTextColor: typeof source.labelTextColor === 'string' ? source.labelTextColor : '#FFE4E6'
    };
  }

  /**
   * Registers this drawing tool with the global drawing manager so it can be instantiated by the chart.
   */
  registerEnhancedDrawingTool({
    kind: 'shortPosition',
    defaultLabel: 'Short Position',
    requiredPointCount: 2,
    createTool: function (chart, series, manager) {
      return new BoxTool('shortPosition', chart, series, manager, {
        fillColor: 'rgba(244, 63, 94, 0.14)',
        previewFillColor: 'rgba(244, 63, 94, 0.08)',
        borderColor: '#F43F5E',
        borderWidth: 1.4,
        borderStyle: 'solid',
        opacity: 1,
        labelBuilder: buildShortPositionLabel,
        labelBackgroundColor: 'rgba(127, 29, 29, 0.92)',
        labelTextColor: '#FFE4E6'
      });
    },
    createPrimitiveFromRecord: function (record) {
      var points = record.points || [];
      return createRiskRewardPositionPrimitive(points, record, 'short');
    }
  });
`,
};
