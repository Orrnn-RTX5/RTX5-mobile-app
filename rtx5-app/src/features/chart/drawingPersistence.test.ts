import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getChartDrawingBucketKey,
  getChartDrawingLabels,
  sanitizePersistedChartDrawings,
} from './drawingPersistence';

test('sanitizePersistedChartDrawings keeps only structurally valid drawing records', () => {
  const drawings = sanitizePersistedChartDrawings([
    {
      id: 'trend_1',
      kind: 'trendline',
      type: 'trendline',
      label: 'Trend Line 1',
      hidden: false,
      paneId: 'main',
      extendMode: 'right',
      locked: true,
      style: {
        color: '#2962FF',
        lineStyle: 'dashed',
        opacity: 0.7,
        width: 2,
      },
      createdAt: 1710000000000,
      updatedAt: 1710000002000,
      points: [
        { time: 1710000000, price: 1.2345, dataIndex: 10, paneId: 'main', timestamp: 1710000000 },
        { time: 1710003600, price: 1.2365, dataIndex: 11, paneId: 'main', timestamp: 1710003600 },
      ],
    },
    {
      id: 'bad_measure',
      kind: 'measure',
      points: [{ time: 1710000000, price: 1.2 }],
    },
    {
      id: 'fib_1',
      kind: 'fib',
      type: 'fibZone',
      label: 'Fib Zone 1',
      hidden: false,
      paneId: 'main',
      extendMode: 'right',
      reverse: true,
      levels: [
        {
          id: 'fib_0_618',
          value: 0.618,
          visible: true,
          label: '0.618',
          lineColor: '#F59E0B',
          lineStyle: 'dashed',
          fillColor: 'rgba(245, 158, 11, 0.16)',
          fillOpacity: 0.2,
          showPrice: true,
          showPercent: true,
        },
        { id: 'bad_level', value: Number.NaN, visible: true, label: 'Bad' },
      ],
      style: {
        anchorLineColor: '#2962FF',
        fillOpacity: 0.14,
        labelPosition: 'right',
        showPercentLabels: true,
      },
      goldenPocket: {
        enabled: true,
        from: 0.618,
        to: 0.65,
        color: 'rgba(245, 158, 11, 0.22)',
        label: 'Golden Pocket',
        showLabel: true,
      },
      oteZone: {
        enabled: false,
        from: 0.62,
        to: 0.79,
        label: 'OTE',
      },
      points: [
        { time: 1710000000, price: 1.2, dataIndex: 20 },
        { time: 1710003600, price: 1.3, dataIndex: 25 },
      ],
    },
    {
      id: 'text_1',
      kind: 'text',
      points: [{ time: { year: 2026, month: 4, day: 14 }, price: 1.245 }],
      text: 'TXT',
    },
    {
      id: 'text_level_1',
      kind: 'textLevel',
      type: 'textLevel',
      label: 'Entry',
      hidden: false,
      paneId: 'main',
      points: [{ time: 1710000000, price: 1.0845, dataIndex: 32, paneId: 'main' }],
      text: '<script>Entry</script>',
      levelType: 'entry',
      labelPosition: 'price-axis',
      labelOffset: { x: 4, y: -2 },
      showPrice: true,
      showPriceAxisLabel: true,
      followLastPrice: false,
      levelLine: {
        enabled: true,
        extendMode: 'both',
        lineColor: '#2962FF',
        lineWidth: 2,
        lineStyle: 'dotted',
        opacity: 0.8,
      },
      style: {
        textColor: '#FFFFFF',
        backgroundColor: 'rgba(41, 98, 255, 0.85)',
        borderRadius: 4,
        paddingX: 6,
        paddingY: 3,
        fontWeight: 700,
        showBackground: true,
        showAnchor: true,
        align: 'center',
      },
    },
    {
      id: 'highlight_1',
      kind: 'brush',
      type: 'highlightBox',
      label: 'Demand Zone',
      zoneType: 'demand',
      extendUntil: 'price-touch',
      style: {
        fillColor: 'rgba(59, 130, 246, 0.16)',
        previewFillColor: 'rgba(59, 130, 246, 0.08)',
        borderColor: '#3B82F6',
        borderWidth: 1.5,
        borderStyle: 'dashed',
        selectedBorderColor: '#5B9DFF',
        hoverBorderColor: '#8AB4FF',
        labelColor: '#3B82F6',
        showBorder: true,
        showFill: true,
        showLabel: true,
        labelBackgroundColor: 'rgba(15, 23, 42, 0.92)',
        labelBackground: 'rgba(15, 23, 42, 0.72)',
        labelTextColor: '#FFFFFF',
        fontFamily: 'Inter, Arial, sans-serif',
        showMidline: true,
        midlineColor: '#787B86',
        midlineStyle: 'dotted',
        showPriceRange: true,
        showPercentRange: true,
        showTimeRange: true,
        showBarCount: true,
        showLabels: true,
        labelPosition: 'inside-top-right',
        handleRadius: 4,
        selectedHandleRadius: 5,
        handleBorderWidth: 2,
        handleFillColor: '#FFFFFF',
      },
      alertMetadata: {
        enabled: true,
        trigger: 'enter',
        price: 1.24,
        nested: {
          sound: 'default',
          invalid: Number.NaN,
        },
        steps: [1, 'notify', false, Number.POSITIVE_INFINITY],
        invalidFunction: () => undefined,
      },
      points: [
        { time: 1710000000, price: 1.23 },
        { time: 1710003600, price: 1.25 },
      ],
    },
    {
      id: 'highlight_invalid_metadata',
      kind: 'brush',
      label: 'Invalid metadata',
      zoneType: 'unknown-zone',
      extendUntil: 'session-close',
      points: [
        { time: 1710000000, price: 1.23 },
        { time: 1710003600, price: 1.25 },
      ],
    },
  ]);

  assert.equal(drawings.length, 6);
  assert.deepEqual(getChartDrawingLabels(drawings), ['Trend Line 1', 'Fib Zone 1', 'Text 4', 'Entry', 'Demand Zone', 'Invalid metadata']);
  assert.equal(drawings[0]?.extendMode, 'right');
  assert.equal(drawings[0]?.locked, true);
  assert.equal(drawings[0]?.style?.lineStyle, 'dashed');
  assert.equal(drawings[0]?.points[0]?.dataIndex, 10);
  assert.equal(drawings[0]?.points[0]?.paneId, 'main');
  assert.equal(drawings[1]?.type, 'fibZone');
  assert.equal(drawings[1]?.levels?.length, 1);
  assert.equal(drawings[1]?.levels?.[0]?.value, 0.618);
  assert.equal(drawings[1]?.goldenPocket?.from, 0.618);
  assert.equal(drawings[1]?.goldenPocket?.to, 0.65);
  assert.equal(drawings[1]?.oteZone?.enabled, false);
  assert.equal(drawings[1]?.reverse, true);
  assert.equal(drawings[2]?.text, 'TXT');
  assert.equal(drawings[3]?.kind, 'textLevel');
  assert.equal(drawings[3]?.type, 'textLevel');
  assert.equal(drawings[3]?.text, 'Entry');
  assert.equal(drawings[3]?.levelType, 'entry');
  assert.equal(drawings[3]?.labelPosition, 'price-axis');
  assert.deepEqual(drawings[3]?.labelOffset, { x: 4, y: -2 });
  assert.equal(drawings[3]?.levelLine?.extendMode, 'both');
  assert.equal(drawings[3]?.levelLine?.lineStyle, 'dotted');
  assert.equal(drawings[3]?.style?.backgroundColor, 'rgba(41, 98, 255, 0.85)');
  assert.equal(drawings[3]?.style?.showAnchor, true);
  assert.equal(drawings[3]?.style?.align, 'center');
  assert.equal(drawings[4]?.kind, 'brush');
  assert.equal(drawings[4]?.type, 'highlightBox');
  assert.equal(drawings[4]?.zoneType, 'demand');
  assert.equal(drawings[4]?.extendUntil, 'price-touch');
  assert.equal(drawings[4]?.style?.fillColor, 'rgba(59, 130, 246, 0.16)');
  assert.equal(drawings[4]?.style?.previewFillColor, 'rgba(59, 130, 246, 0.08)');
  assert.equal(drawings[4]?.style?.borderColor, '#3B82F6');
  assert.equal(drawings[4]?.style?.borderWidth, 1.5);
  assert.equal(drawings[4]?.style?.borderStyle, 'dashed');
  assert.equal(drawings[4]?.style?.selectedBorderColor, '#5B9DFF');
  assert.equal(drawings[4]?.style?.hoverBorderColor, '#8AB4FF');
  assert.equal(drawings[4]?.style?.labelColor, '#3B82F6');
  assert.equal(drawings[4]?.style?.showBorder, true);
  assert.equal(drawings[4]?.style?.showFill, true);
  assert.equal(drawings[4]?.style?.showLabel, true);
  assert.equal(drawings[4]?.style?.labelBackground, 'rgba(15, 23, 42, 0.72)');
  assert.equal(drawings[4]?.style?.fontFamily, 'Inter, Arial, sans-serif');
  assert.equal(drawings[4]?.style?.showMidline, true);
  assert.equal(drawings[4]?.style?.midlineColor, '#787B86');
  assert.equal(drawings[4]?.style?.midlineStyle, 'dotted');
  assert.equal(drawings[4]?.style?.showPriceRange, true);
  assert.equal(drawings[4]?.style?.showPercentRange, true);
  assert.equal(drawings[4]?.style?.showTimeRange, true);
  assert.equal(drawings[4]?.style?.showBarCount, true);
  assert.equal(drawings[4]?.style?.showLabels, true);
  assert.equal(drawings[4]?.style?.labelPosition, 'inside-top-right');
  assert.equal(drawings[4]?.style?.handleRadius, 4);
  assert.equal(drawings[4]?.style?.selectedHandleRadius, 5);
  assert.equal(drawings[4]?.style?.handleBorderWidth, 2);
  assert.deepEqual(drawings[4]?.alertMetadata, {
    enabled: true,
    trigger: 'enter',
    price: 1.24,
    nested: {
      sound: 'default',
    },
    steps: [1, 'notify', false],
  });
  assert.equal(drawings[5]?.zoneType, undefined);
  assert.equal(drawings[5]?.extendUntil, undefined);
});

test('getChartDrawingBucketKey normalizes symbol casing and whitespace', () => {
  assert.equal(getChartDrawingBucketKey('  gbpusd  '), 'GBPUSD');
  assert.equal(getChartDrawingBucketKey(''), 'DEFAULT');
});

test('sanitizePersistedChartDrawings supports the added TradingView-style drawing kinds', () => {
  const drawings = sanitizePersistedChartDrawings([
    {
      id: 'horizontal_saved',
      kind: 'horizontalLine',
      points: [{ time: 1, price: 90 }, { time: 2, price: 90 }],
    },
    {
      id: 'horizontal_ray_saved',
      kind: 'horizontalRay',
      type: 'horizontalRay',
      extendMode: 'right',
      points: [{ time: 1, price: 90 }, { time: 2, price: 90 }],
      style: {
        color: '#0EA5E9',
        lineStyle: 'dotted',
      },
    },
    {
      id: 'vertical_saved',
      kind: 'verticalLine',
      points: [{ time: 2, price: 89 }, { time: 2, price: 91 }],
    },
    {
      id: 'ray_saved',
      kind: 'ray',
      extendMode: 'right',
      points: [{ time: 1, price: 90 }, { time: 3, price: 94 }],
    },
    {
      id: 'extended_line_saved',
      kind: 'extendedLine',
      type: 'extendedLine',
      extendMode: 'both',
      points: [{ time: 1, price: 90 }, { time: 3, price: 94 }],
      style: {
        color: '#7C3AED',
        width: 3,
      },
    },
    {
      id: 'arrow_saved',
      kind: 'arrow',
      type: 'arrow',
      style: {
        arrowHeadLength: 16,
        arrowHeadWidth: 13,
        color: '#F97316',
        lineStyle: 'dotted',
        width: 3,
      },
      points: [{ time: 1, price: 90 }, { time: 3, price: 94 }],
    },
    {
      id: 'fib_extension_saved',
      kind: 'fibExtension',
      type: 'fibExtension',
      levels: [{ id: 'fib_ext_1_618', value: 1.618, visible: true, label: '1.618' }],
      points: [{ time: 1, price: 90 }, { time: 3, price: 94 }],
    },
    {
      id: 'parallel_channel_saved',
      kind: 'parallelChannel',
      points: [{ time: 1, price: 90 }, { time: 3, price: 94 }, { time: 2, price: 88 }],
    },
    {
      id: 'rectangle_saved',
      kind: 'rectangle',
      type: 'rectangle',
      style: {
        borderColor: '#64748B',
        borderStyle: 'dashed',
        fillColor: 'rgba(100, 116, 139, 0.12)',
      },
      points: [{ time: 1, price: 90 }, { time: 3, price: 94 }],
    },
    {
      id: 'ellipse_saved',
      kind: 'ellipse',
      type: 'ellipse',
      style: {
        borderColor: '#8B5CF6',
        borderStyle: 'dotted',
        fillColor: 'rgba(139, 92, 246, 0.12)',
      },
      points: [{ time: 1, price: 90 }, { time: 3, price: 94 }],
    },
    {
      id: 'freehand_saved',
      kind: 'freehand',
      type: 'freehand',
      style: {
        color: '#EC4899',
        lineStyle: 'dashed',
        width: 4,
      },
      points: Array.from({ length: 5 }, (_, index) => ({
        time: index + 1,
        price: 90 + index,
      })),
    },
    {
      id: 'short_position_saved',
      kind: 'shortPosition',
      points: [{ time: 1, price: 90 }, { time: 3, price: 86 }],
      position: { stopPrice: 92, accountSize: 'bad', riskPercent: 250 },
    },
    {
      id: 'elliott_saved',
      kind: 'elliottWave',
      waves: [
        { id: 'wave_1', label: '0', visible: false },
        { id: 'wave_2', label: 'A', visible: true },
        { label: 'B' },
        'bad wave entry',
      ],
      points: Array.from({ length: 6 }, (_, index) => ({
        time: index + 1,
        price: 90 + (index % 2 === 0 ? 0 : 4) + index,
      })),
    },
    {
      id: 'xabcd_saved',
      kind: 'xabcd',
      ratios: [
        { id: 'ratio_ab', target: 0.618, visible: true },
        { id: 'ratio_bc', target: 'bad', visible: false },
        { target: -2 },
        'bad ratio entry',
      ],
      points: [
        { time: 1, price: 90 },
        { time: 2, price: 96 },
        { time: 3, price: 92 },
        { time: 4, price: 95 },
        { time: 5, price: 99 },
      ],
    },
  ]);

  assert.deepEqual(drawings.map((drawing) => drawing.kind), [
    'horizontalLine',
    'horizontalRay',
    'verticalLine',
    'ray',
    'extendedLine',
    'arrow',
    'fibExtension',
    'parallelChannel',
    'rectangle',
    'ellipse',
    'freehand',
    'shortPosition',
    'elliottWave',
    'xabcd',
  ]);
  assert.equal(drawings[0]?.label, 'Horizontal Line 1');
  assert.equal(drawings[1]?.type, 'horizontalRay');
  assert.equal(drawings[1]?.extendMode, 'right');
  assert.equal(drawings[1]?.style?.lineStyle, 'dotted');
  assert.equal(drawings[4]?.type, 'extendedLine');
  assert.equal(drawings[4]?.extendMode, 'both');
  assert.equal(drawings[4]?.style?.width, 3);
  assert.equal(drawings[5]?.type, 'arrow');
  assert.equal(drawings[5]?.style?.arrowHeadLength, 16);
  assert.equal(drawings[5]?.style?.arrowHeadWidth, 13);
  assert.equal(drawings[5]?.style?.lineStyle, 'dotted');
  assert.equal(drawings[6]?.levels?.[0]?.value, 1.618);
  assert.equal(drawings[7]?.points.length, 3);
  assert.equal(drawings[8]?.type, 'rectangle');
  assert.equal(drawings[8]?.style?.borderStyle, 'dashed');
  assert.equal(drawings[9]?.type, 'ellipse');
  assert.equal(drawings[9]?.style?.borderStyle, 'dotted');
  assert.equal(drawings[10]?.type, 'freehand');
  assert.equal(drawings[10]?.points.length, 5);
  assert.equal(drawings[10]?.style?.lineStyle, 'dashed');
  assert.equal(drawings[11]?.position?.stopPrice, 92);
  assert.equal(drawings[11]?.position?.accountSize, null);
  assert.equal(drawings[11]?.position?.riskPercent, 100);
  assert.equal(drawings[12]?.waves?.length, 3);
  assert.equal(drawings[12]?.waves?.[0]?.visible, false);
  assert.equal(drawings[12]?.waves?.[1]?.label, 'A');
  assert.equal(drawings[12]?.waves?.[2]?.id, 'wave_3');
  assert.equal(drawings[13]?.ratios?.length, 3);
  assert.equal(drawings[13]?.ratios?.[0]?.target, 0.618);
  assert.equal(drawings[13]?.ratios?.[1]?.target, null);
  assert.equal(drawings[13]?.ratios?.[1]?.visible, false);
  assert.equal(drawings[13]?.ratios?.[2]?.target, null);
  assert.equal(drawings[13]?.ratios?.[2]?.id, 'ratio_3');
});
