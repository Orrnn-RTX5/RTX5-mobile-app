import type { EnhancedDrawingToolRuntime } from '../types';

export const stickerEnhancedDrawingToolRuntime: EnhancedDrawingToolRuntime = {
  tool: 'smiley',
  script: `
  function normalizeStickerStyle(style) {
    var source = style && typeof style === 'object' ? style : {};
    var primaryColor = typeof source.color === 'string' ? source.color : '#F59E0B';
    return {
      backgroundColor: typeof source.backgroundColor === 'string' ? source.backgroundColor : primaryColor,
      textColor: typeof source.textColor === 'string' ? source.textColor : '#0F172A',
      anchorColor: typeof source.anchorColor === 'string'
        ? source.anchorColor
        : (typeof source.anchorLineColor === 'string' ? source.anchorLineColor : primaryColor),
      fontSize: isFiniteNumber(source.fontSize) ? Math.max(8, Math.min(24, source.fontSize)) : 11,
      opacity: isFiniteNumber(source.opacity) ? Math.max(0.1, Math.min(1, source.opacity)) : 1
    };
  }

  /**
   * Registers this drawing tool with the global drawing manager so it can be instantiated by the chart.
   */
  registerEnhancedDrawingTool({
    kind: 'smiley',
    defaultLabel: 'Sticker',
    requiredPointCount: 1,
    createTool: function (chart, series, manager) {
      return new LabelTool('smiley', chart, series, manager, {
        text: ':)',
        backgroundColor: 'rgba(245, 158, 11, 0.94)',
        textColor: '#0F172A',
        anchorColor: '#F59E0B'
      });
    },
    createPrimitiveFromRecord: function (record) {
      var points = record.points || [];
      var style = normalizeStickerStyle(record && record.style);
      return createPointLabelPrimitive(points[0], {
        text: record.text || ':)',
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
