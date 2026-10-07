import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

test('standalone chart previews keep their compact right-gap tuning', () => {
  const sharedSource = readSource('src/features/chart/preview/chartPreviewShared.ts');
  const nativeSource = readSource('src/features/chart/preview/LiveChartPreview.native.tsx');
  const webSource = readSource('src/features/chart/preview/LiveChartPreview.web.tsx');

  assert.match(
    sharedSource,
    /export const LIVE_CHART_PREVIEW_TIME_SCALE_RIGHT_OFFSET = 4/,
  );

  assert.match(nativeSource, /: LIVE_CHART_PREVIEW_TIME_SCALE_RIGHT_OFFSET/);
  assert.match(nativeSource, /: 13/);
  assert.match(
    webSource,
    /rightOffset: LIVE_CHART_PREVIEW_TIME_SCALE_RIGHT_OFFSET,[\s\S]*barSpacing: 13/,
  );
  assert.doesNotMatch(nativeSource, /rightOffset: 0/);
  assert.doesNotMatch(webSource, /rightOffset: 0/);
});

test('divided native preview uses the normal chart gap and recent viewport', () => {
  const nativeSource = readSource('src/features/chart/preview/LiveChartPreview.native.tsx');
  const viewportSource = readSource(
    'src/features/chart/preview/liveChartPreviewViewportScript.ts',
  );

  assert.match(nativeSource, /fullChartParity[\s\S]*CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET/);
  assert.match(nativeSource, /CHART_DEFAULT_TIME_SCALE_BAR_SPACING/);
  assert.match(nativeSource, /LIVE_CHART_PREVIEW_VIEWPORT_SCRIPT/);
  assert.match(viewportSource, /function applyPreviewRecentViewport/);
  assert.match(viewportSource, /CHART_DEFAULT_VISIBLE_BAR_MIN/);
  assert.match(viewportSource, /CHART_DEFAULT_VISIBLE_BAR_MAX/);
});

test('preview right-gap tuning does not alter the main Chart viewport', () => {
  for (const relativePath of [
    'src/features/chart/ChartScreen.native.tsx',
    'src/features/chart/ChartScreen.web.tsx',
    'src/features/chart/rendering/ChartWebViewHtml.ts',
  ]) {
    assert.doesNotMatch(
      readSource(relativePath),
      /LIVE_CHART_PREVIEW_TIME_SCALE_RIGHT_OFFSET/,
      relativePath,
    );
  }
});
