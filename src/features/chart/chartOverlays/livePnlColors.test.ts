import assert from 'node:assert/strict';
import test from 'node:test';

import { LIVE_CHART_PNL_COLORS, resolveLiveChartPnlColor } from './livePnlColors';

type RgbColor = readonly [number, number, number];

const parseHex = (color: string): RgbColor => [
  Number.parseInt(color.slice(1, 3), 16),
  Number.parseInt(color.slice(3, 5), 16),
  Number.parseInt(color.slice(5, 7), 16),
];

const luminance = (color: string): number => {
  const channels = parseHex(color).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

const contrastRatio = (left: string, right: string): number => {
  const brighter = Math.max(luminance(left), luminance(right));
  const darker = Math.min(luminance(left), luminance(right));
  return (brighter + 0.05) / (darker + 0.05);
};

test('live chart P/L uses vivid colors on dark canvases and accessible colors on light canvases', () => {
  assert.equal(
    resolveLiveChartPnlColor(12.5, '#121212', '#2962FF'),
    LIVE_CHART_PNL_COLORS.darkCanvas.profit,
  );
  assert.equal(
    resolveLiveChartPnlColor(-12.5, 'rgb(18, 18, 18)', '#2962FF'),
    LIVE_CHART_PNL_COLORS.darkCanvas.loss,
  );
  assert.equal(
    resolveLiveChartPnlColor(12.5, '#FFFFFF', '#2962FF'),
    LIVE_CHART_PNL_COLORS.lightCanvas.profit,
  );
  assert.equal(
    resolveLiveChartPnlColor(-12.5, 'white', '#2962FF'),
    LIVE_CHART_PNL_COLORS.lightCanvas.loss,
  );
});

test('live chart P/L preserves the trade-side color at zero and for invalid values', () => {
  assert.equal(resolveLiveChartPnlColor(0, '#121212', '#2962FF'), '#2962FF');
  assert.equal(resolveLiveChartPnlColor(Number.NaN, '#121212', '#DC2626'), '#DC2626');
});

test('live chart P/L palettes keep readable canvas contrast in both themes', () => {
  assert.ok(contrastRatio(LIVE_CHART_PNL_COLORS.darkCanvas.profit, '#121212') >= 4.5);
  assert.ok(contrastRatio(LIVE_CHART_PNL_COLORS.darkCanvas.loss, '#121212') >= 4.5);
  assert.ok(contrastRatio(LIVE_CHART_PNL_COLORS.lightCanvas.profit, '#FFFFFF') >= 4.5);
  assert.ok(contrastRatio(LIVE_CHART_PNL_COLORS.lightCanvas.loss, '#FFFFFF') >= 4.5);
});
