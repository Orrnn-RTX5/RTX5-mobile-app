import type { EnhancedDrawingToolRuntime } from '../types';

export const textLabelEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'text',
  script: `
  function normalizeTextLabelStyle(style) {
    var source = style && typeof style === 'object' ? style : {};
    var textColor = typeof source.textColor === 'string'
      ? source.textColor
      : (typeof source.color === 'string' ? source.color : '#FFFFFF');
    return {
      backgroundColor: typeof source.backgroundColor === 'string' ? source.backgroundColor : 'rgba(37, 99, 235, 0.94)',
      textColor: textColor,
      anchorColor: typeof source.anchorColor === 'string'
        ? source.anchorColor
        : (typeof source.anchorLineColor === 'string' ? source.anchorLineColor : '#60A5FA'),
      fontSize: isFiniteNumber(source.fontSize) ? Math.max(8, Math.min(24, source.fontSize)) : 11,
      opacity: isFiniteNumber(source.opacity) ? Math.max(0.1, Math.min(1, source.opacity)) : 1
    };
  }

  /**
   * Registers this drawing tool with the global drawing manager so it can be instantiated by the chart.
   */
  registerEnhancedDrawingTool({
    kind: 'text',
    defaultLabel: 'Text',
    requiredPointCount: 1,
    createTool: function (chart, series, manager) {
      return new LabelTool('text', chart, series, manager, {
        text: 'TXT',
        backgroundColor: 'rgba(37, 99, 235, 0.94)',
        textColor: '#FFFFFF',
        anchorColor: '#60A5FA'
      });
    },
    createPrimitiveFromRecord: function (record) {
      var points = record.points || [];
      var style = normalizeTextLabelStyle(record && record.style);
      return createPointLabelPrimitive(points[0], {
        text: record.text || 'TXT',
        backgroundColor: style.backgroundColor,
        textColor: style.textColor,
        anchorColor: style.anchorColor,
        fontSize: style.fontSize,
        opacity: style.opacity
      });
    }
  });
`,
};
