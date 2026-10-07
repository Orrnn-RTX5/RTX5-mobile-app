import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

test('divided native charts use the same custom candle renderer as the full chart', () => {
  const previewSource = readSource('src/features/chart/preview/LiveChartPreview.native.tsx');

  assert.match(previewSource, /RTX5_CUSTOM_CANDLESTICK_SERIES_WEBVIEW_JS/);
  assert.match(
    previewSource,
    /<script>\$\{RTX5_CUSTOM_CANDLESTICK_SERIES_WEBVIEW_JS\}<\/script>/,
  );
  assert.match(previewSource, /window\.addRTX5CustomCandlestickSeries\(chart, \{/);
  assert.doesNotMatch(
    previewSource,
    /chart\.addSeries\(LightweightCharts\.CandlestickSeries/,
  );
});

test('divided candles use the full-chart opacity and resolved color wiring', () => {
  const previewSource = readSource('src/features/chart/preview/LiveChartPreview.native.tsx');

  assert.equal(
    (previewSource.match(/candleOpacity: \$\{CHART_CANDLE_RENDER_OPACITY\}/g) ?? []).length,
    2,
  );
  assert.equal(
    (
      previewSource.match(
        /bearishCandleOpacity: \$\{CHART_BEARISH_CANDLE_RENDER_OPACITY\}/g,
      ) ?? []
    ).length,
    2,
  );
  assert.match(
    previewSource,
    /bodyUpColor: chartType === 'hollow' \? hollowBody : cUp,[\s\S]*bodyDownColor: chartType === 'hollow' \? hollowBody : cDown,[\s\S]*borderUpColor: cUp,[\s\S]*borderDownColor: cDown,[\s\S]*wickUpColor: cUp,[\s\S]*wickDownColor: cDown/,
  );
});

test('Renko uses transformed bricks and the wickless custom renderer in every preview', () => {
  const sharedSource = readSource('src/features/chart/preview/chartPreviewShared.ts');
  const nativeSource = readSource('src/features/chart/preview/LiveChartPreview.native.tsx');
  const webSource = readSource('src/features/chart/preview/LiveChartPreview.web.tsx');

  assert.match(
    sharedSource,
    /chartType === 'renko'[\s\S]*buildRenkoBricks\(candles, \{ brickSize: renkoBrickSize \}\)/,
  );
  assert.match(
    sharedSource,
    /chartType === 'candles' \|\| chartType === 'hollow' \|\| chartType === 'renko'/,
  );
  assert.match(
    nativeSource,
    /chartType === 'candles' \|\| chartType === 'hollow' \|\| chartType === 'renko'/,
  );
  assert.match(nativeSource, /wickVisible: chartType !== 'renko'/);
  assert.match(
    webSource,
    /chartType === 'candles' \|\| chartType === 'hollow' \|\| chartType === 'renko'/,
  );
  assert.match(webSource, /wickVisible: chartType !== 'renko'/);
});

test('Area uses close-value data and a themed gradient in every preview', () => {
  const sharedSource = readSource('src/features/chart/preview/chartPreviewShared.ts');
  const nativeSource = readSource('src/features/chart/preview/LiveChartPreview.native.tsx');
  const webSource = readSource('src/features/chart/preview/LiveChartPreview.web.tsx');

  assert.match(sharedSource, /chartType === 'line' \|\| chartType === 'area'/);
  assert.match(
    nativeSource,
    /resolveAreaChartDirection\(previewCandles\)[\s\S]*lineBody: chartType === 'area' \? areaChartColor : colors\.lineBody/,
  );
  assert.match(
    nativeSource,
    /chartType === 'area'[\s\S]*chart\.addSeries\(LightweightCharts\.AreaSeries, \{[\s\S]*lineColor: lineColor,[\s\S]*topColor: hexToRgba\(lineColor, 0\.32\),[\s\S]*bottomColor: hexToRgba\(lineColor, 0\.04\),[\s\S]*lineWidth: \$\{CHART_AREA_LINE_WIDTH\},[\s\S]*lineType: LightweightCharts\.LineType\.Simple/,
  );
  assert.match(
    nativeSource,
    /chartType === 'area'[\s\S]*series\.applyOptions\(\{[\s\S]*lineColor: lineColor,[\s\S]*topColor: hexToRgba\(lineColor, 0\.32\),[\s\S]*bottomColor: hexToRgba\(lineColor, 0\.04\)/,
  );
  assert.match(
    webSource,
    /resolveAreaChartDirection\(previewCandles\)[\s\S]*chartType === 'area'[\s\S]*const areaLineColor = areaChartColorRef\.current;[\s\S]*chart\.addSeries\(AreaSeries, \{[\s\S]*lineColor: areaLineColor,[\s\S]*topColor: withAlpha\(areaLineColor, 0\.32\),[\s\S]*bottomColor: withAlpha\(areaLineColor, 0\.04\),[\s\S]*lineWidth: CHART_AREA_LINE_WIDTH,[\s\S]*lineType: LineType\.Simple/,
  );
  assert.match(
    webSource,
    /chartType !== 'area' \|\| !seriesRef\.current[\s\S]*seriesRef\.current\.applyOptions\(\{[\s\S]*lineColor: areaChartColor,[\s\S]*topColor: withAlpha\(areaChartColor, 0\.32\),[\s\S]*bottomColor: withAlpha\(areaChartColor, 0\.04\)/,
  );
});

test('divided panes use normal chart scale margins, controls, and recent viewport', () => {
  const previewSource = readSource('src/features/chart/preview/LiveChartPreview.native.tsx');
  const priceScaleSource = readSource(
    'src/features/chart/preview/liveChartPreviewPriceScaleScript.ts',
  );

  assert.match(previewSource, /fullChartParity \? CHART_DEFAULT_TIME_SCALE_BAR_SPACING : 13/);
  assert.match(previewSource, /fullChartParity[\s\S]*CHART_DEFAULT_TIME_SCALE_RIGHT_OFFSET/);
  assert.match(
    previewSource,
    /handleScroll: fullChartParity \? \{[\s\S]*horzTouchDrag: true,[\s\S]*vertTouchDrag: false/,
  );
  assert.match(
    previewSource,
    /handleScale: fullChartParity \? \{[\s\S]*pinch: true,[\s\S]*axisPressedMouseMove: \{ time: true, price: false \}/,
  );
  assert.match(
    previewSource,
    /top: fullChartParity \? 0 : 0\.08,[\s\S]*previewShowsVolumePane \? 0\.34 : 0/,
  );
  assert.match(
    previewSource,
    /if \(window\._fullChartParity\) \{[\s\S]*applyPreviewRecentViewport\(window\._lastChartData\.length\);[\s\S]*\} else \{[\s\S]*fitContent/,
  );
  assert.match(previewSource, /LIVE_CHART_PREVIEW_PRICE_SCALE_SCRIPT/);
  assert.match(priceScaleSource, /resolveMt5PriceScaleDragRange/);
  assert.match(priceScaleSource, /function beginPreviewAxisPriceScaleGesture/);
  assert.match(priceScaleSource, /function beginPreviewBodyPricePan/);
  assert.match(priceScaleSource, /function startPreviewPriceScaleGlide/);
  assert.match(priceScaleSource, /function resetPreviewPriceScale/);
  assert.match(previewSource, /shouldSuppressPreviewPaneTap/);
});

test('divided price-axis labels use the full chart typography contract', () => {
  const previewSource = readSource('src/features/chart/preview/LiveChartPreview.native.tsx');
  const axisSource = readSource(
    'src/features/chart/preview/liveChartPreviewRightPriceAxisScript.ts',
  );
  const fullChartSource = readSource('src/features/chart/rendering/ChartWebViewHtml.ts');
  const typographySource = readSource('src/features/chart/chartPriceScaleTypography.ts');

  assert.match(
    typographySource,
    /CHART_PRICE_SCALE_LABEL_HEIGHT = 17[\s\S]*CHART_PRICE_SCALE_LABEL_FONT_SIZE = 12[\s\S]*CHART_PRICE_SCALE_LABEL_FONT_WEIGHT = '500'/,
  );
  assert.match(previewSource, /LIVE_CHART_PREVIEW_RIGHT_PRICE_AXIS_SCRIPT/);
  assert.match(previewSource, /window\._fullChartParity && typeof installPreviewRightPriceAxis/);
  assert.match(axisSource, /PREVIEW_RIGHT_PRICE_AXIS_LABEL_HEIGHT = \$\{CHART_PRICE_SCALE_LABEL_HEIGHT\}/);
  assert.match(axisSource, /PREVIEW_RIGHT_PRICE_AXIS_LABEL_FONT_SIZE = \$\{CHART_PRICE_SCALE_LABEL_FONT_SIZE\}/);
  assert.match(axisSource, /PREVIEW_RIGHT_PRICE_AXIS_LABEL_FONT_WEIGHT = '\$\{CHART_PRICE_SCALE_LABEL_FONT_WEIGHT\}'/);
  assert.match(axisSource, /label\.style\.fontSize = PREVIEW_RIGHT_PRICE_AXIS_LABEL_FONT_SIZE \+ 'px'/);
  assert.match(axisSource, /label\.style\.fontWeight = PREVIEW_RIGHT_PRICE_AXIS_LABEL_FONT_WEIGHT/);
  assert.match(axisSource, /label\.style\.lineHeight = PREVIEW_RIGHT_PRICE_AXIS_LABEL_HEIGHT \+ 'px'/);
  assert.match(axisSource, /label\.style\.textShadow = 'none'/);
  assert.match(fullChartSource, /RIGHT_PRICE_SCALE_FALLBACK_LABEL_FONT_SIZE = \$\{CHART_PRICE_SCALE_LABEL_FONT_SIZE\}/);
  assert.match(fullChartSource, /RIGHT_PRICE_SCALE_FALLBACK_LABEL_FONT_WEIGHT = '\$\{CHART_PRICE_SCALE_LABEL_FONT_WEIGHT\}'/);
});

test('divided panes recreate the retained chart top, right, and bottom axis frame', () => {
  const previewSource = readSource('src/features/chart/preview/LiveChartPreview.native.tsx');
  const dividerSource = readSource(
    'src/features/chart/preview/liveChartPreviewAxisDividerScript.ts',
  );
  const constantsSource = readSource('src/features/chart/ChartScreen.constants.ts');

  assert.match(previewSource, /LIVE_CHART_PREVIEW_AXIS_DIVIDER_SCRIPT/);
  assert.match(previewSource, /\$\{LIVE_CHART_PREVIEW_AXIS_DIVIDER_SCRIPT\}/);
  assert.match(
    previewSource,
    /axisDivider: isDark[\s\S]*CHART_AXIS_DIVIDER_DARK_COLOR[\s\S]*CHART_AXIS_DIVIDER_LIGHT_COLOR/,
  );
  assert.match(previewSource, /window\._fullChartParity && typeof installPreviewAxisDividers/);
  assert.match(previewSource, /typeof clearPreviewAxisDividers === 'function'/);
  assert.match(previewSource, /typeof schedulePreviewAxisDividersRefresh === 'function'/);
  assert.equal((previewSource.match(/borderVisible: !fullChartParity/g) ?? []).length, 2);
  assert.match(dividerSource, /rtx5-preview-axis-divider-top/);
  assert.match(dividerSource, /rtx5-preview-axis-divider-right/);
  assert.match(dividerSource, /rtx5-preview-axis-divider-bottom/);
  assert.doesNotMatch(dividerSource, /rtx5-preview-axis-divider-left/);
  assert.match(
    constantsSource,
    /CHART_AXIS_DIVIDER_STROKE_WIDTH = 1[\s\S]*CHART_AXIS_DIVIDER_DARK_COLOR = 'rgba\(148,163,184,0\.38\)'[\s\S]*CHART_AXIS_DIVIDER_LIGHT_COLOR = '#CBD5E1'/,
  );
});

test('divided live price color and lower pane follow the normal chart candle contract', () => {
  const previewSource = readSource('src/features/chart/preview/LiveChartPreview.native.tsx');

  assert.match(previewSource, /resolvePreviewLivePriceColor\(\{/);
  assert.match(
    previewSource,
    /setPreviewCandleCountdown\([\s\S]*\$\{JSON\.stringify\(liveColor\)\}/,
  );
  assert.doesNotMatch(previewSource, /lines\[0\]\?\.color/);
  assert.match(
    previewSource,
    /window\._fullChartParity[\s\S]*Math\.abs\(Number\(item && item\.close\) - Number\(item && item\.open\)\)/,
  );
  assert.match(previewSource, /\? \{ top: 0\.82, bottom: 0\.02 \}/);
});

test('divided time axis installs UTC date and time formatters before chart creation', () => {
  const previewSource = readSource('src/features/chart/preview/LiveChartPreview.native.tsx');
  const formatterSource = readSource(
    'src/features/chart/preview/liveChartPreviewTimeAxisScript.ts',
  );

  assert.match(previewSource, /LIVE_CHART_PREVIEW_TIME_AXIS_SCRIPT/);
  assert.match(
    previewSource,
    /tickMarkFormatter: formatPreviewChartTickMark[\s\S]*timeFormatter: formatPreviewChartTime[\s\S]*LightweightCharts\.createChart/,
  );
  assert.match(
    formatterSource,
    /tickMarkType === 3 \|\| tickMarkType === 4[\s\S]*day \+ ' ' \+ month \+ ' ' \+ hours \+ ':' \+ minutes/,
  );
  assert.match(formatterSource, /getUTCDate\(\)/);
  assert.match(formatterSource, /getUTCMonth\(\)/);
  assert.match(formatterSource, /getUTCHours\(\)/);
  assert.match(formatterSource, /getUTCMinutes\(\)/);
  assert.match(formatterSource, /getUTCFullYear\(\)/);
  assert.doesNotMatch(
    formatterSource,
    /\.getDate\(\)|\.getMonth\(\)|\.getHours\(\)|\.getMinutes\(\)|\.getFullYear\(\)/,
  );
});
