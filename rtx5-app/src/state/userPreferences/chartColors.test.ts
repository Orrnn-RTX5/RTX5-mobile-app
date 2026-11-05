import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHART_COLOR_SCHEME_PRESETS,
  DEFAULT_CHART_COLOR_SCHEME,
  DEFAULT_CHART_COLORS,
  resolveChartColorsForTheme,
} from './chartColors';

test('default and saved legacy take-profit accents follow the theme while custom picks survive', () => {
  for (const savedColor of ['#089981', '#4597FF', '#1D4ED8']) {
    const saved = { ...DEFAULT_CHART_COLORS, tradeTpSl: savedColor };
    assert.equal(resolveChartColorsForTheme(saved, 'custom', true).tradeTpSl, '#4597FF');
    assert.equal(resolveChartColorsForTheme(saved, 'custom', false).tradeTpSl, '#1D4ED8');
  }
  const custom = { ...DEFAULT_CHART_COLORS, tradeTpSl: '#FACC15' };
  assert.equal(resolveChartColorsForTheme(custom, 'custom', true).tradeTpSl, '#FACC15');
  assert.equal(resolveChartColorsForTheme(custom, 'custom', false).tradeTpSl, '#FACC15');
});

test('chart color resolver uses app-theme structure with default green/red candles', () => {
  const lightColors = resolveChartColorsForTheme(DEFAULT_CHART_COLORS, DEFAULT_CHART_COLOR_SCHEME, false);
  const darkColors = resolveChartColorsForTheme(DEFAULT_CHART_COLORS, DEFAULT_CHART_COLOR_SCHEME, true);
  const greenPreset = CHART_COLOR_SCHEME_PRESETS.green_on_black.colors;
  const lightPreset = CHART_COLOR_SCHEME_PRESETS.black_on_white.colors;

  assert.equal(lightColors.background, lightPreset.background);
  assert.equal(lightColors.foreground, lightPreset.foreground);
  assert.equal(lightColors.grid, lightPreset.grid);
  assert.equal(lightColors.hollowBody, lightPreset.hollowBody);

  assert.equal(darkColors.background, greenPreset.background);
  assert.equal(darkColors.foreground, greenPreset.foreground);
  assert.equal(darkColors.grid, greenPreset.grid);
  assert.equal(darkColors.hollowBody, greenPreset.hollowBody);

  [lightColors, darkColors].forEach((colors) => {
    assert.equal(colors.candlesUptrend, greenPreset.candlesUptrend);
    assert.equal(colors.candlesDowntrend, greenPreset.candlesDowntrend);
    assert.equal(colors.barsUptrend, greenPreset.barsUptrend);
    assert.equal(colors.barsDowntrend, greenPreset.barsDowntrend);
    assert.equal(colors.lineBody, greenPreset.lineBody);
  });
});

test('chart color resolver keeps built-in chart schemes aligned to the app theme', () => {
  const darkAppWithWhiteScheme = resolveChartColorsForTheme(
    CHART_COLOR_SCHEME_PRESETS.black_on_white.colors,
    'black_on_white',
    true,
  );
  const lightAppWithGreenScheme = resolveChartColorsForTheme(
    CHART_COLOR_SCHEME_PRESETS.green_on_black.colors,
    'green_on_black',
    false,
  );

  assert.equal(darkAppWithWhiteScheme.background, CHART_COLOR_SCHEME_PRESETS.green_on_black.colors.background);
  assert.equal(darkAppWithWhiteScheme.foreground, CHART_COLOR_SCHEME_PRESETS.green_on_black.colors.foreground);
  assert.equal(darkAppWithWhiteScheme.grid, CHART_COLOR_SCHEME_PRESETS.green_on_black.colors.grid);
  assert.equal(darkAppWithWhiteScheme.hollowBody, CHART_COLOR_SCHEME_PRESETS.green_on_black.colors.hollowBody);
  assert.equal(darkAppWithWhiteScheme.candlesUptrend, CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.candlesUptrend);
  assert.equal(lightAppWithGreenScheme.background, CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.background);
  assert.equal(lightAppWithGreenScheme.hollowBody, CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.hollowBody);
  assert.equal(lightAppWithGreenScheme.candlesUptrend, CHART_COLOR_SCHEME_PRESETS.green_on_black.colors.candlesUptrend);
});

test('chart color resolver preserves explicit custom grid choices in dark theme', () => {
  const customGrid = '#1F2937';
  const darkColors = resolveChartColorsForTheme(
    { ...DEFAULT_CHART_COLORS, grid: customGrid },
    'custom',
    true,
  );

  assert.equal(darkColors.grid, customGrid);
});

test('chart color resolver rejects explicit custom light canvas colors in dark theme', () => {
  const darkColors = resolveChartColorsForTheme(
    {
      ...DEFAULT_CHART_COLORS,
      background: '#FAFAFA',
      foreground: '#111827',
      grid: 'rgba(0,0,0,0.09)',
      hollowBody: '#FFFFFF',
    },
    'custom',
    true,
  );

  assert.equal(darkColors.background, CHART_COLOR_SCHEME_PRESETS.green_on_black.colors.background);
  assert.equal(darkColors.foreground, CHART_COLOR_SCHEME_PRESETS.green_on_black.colors.foreground);
  assert.equal(darkColors.grid, CHART_COLOR_SCHEME_PRESETS.green_on_black.colors.grid);
  assert.equal(darkColors.hollowBody, CHART_COLOR_SCHEME_PRESETS.green_on_black.colors.hollowBody);
});

test('chart color resolver preserves explicit custom dark canvas colors in dark theme', () => {
  const darkColors = resolveChartColorsForTheme(
    {
      ...DEFAULT_CHART_COLORS,
      background: '#101827',
      foreground: '#E5E7EB',
      hollowBody: '#101827',
    },
    'custom',
    true,
  );

  assert.equal(darkColors.background, '#101827');
  assert.equal(darkColors.foreground, '#E5E7EB');
  assert.equal(darkColors.hollowBody, '#101827');
});

test('chart color resolver rejects explicit custom dark canvas colors in light theme', () => {
  const lightColors = resolveChartColorsForTheme(
    {
      ...DEFAULT_CHART_COLORS,
      background: '#101827',
      foreground: '#E5E7EB',
      grid: 'rgba(255,255,255,0.18)',
      hollowBody: '#101827',
    },
    'custom',
    false,
  );

  assert.equal(lightColors.background, CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.background);
  assert.equal(lightColors.foreground, CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.foreground);
  assert.equal(lightColors.grid, CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.grid);
  // Hollow body is a candle fill, not canvas structure — the user's explicit
  // pick survives even when the canvas colors get theme-corrected.
  assert.equal(lightColors.hollowBody, '#101827');
});

test('chart color resolver preserves an explicitly picked hollow body in both themes', () => {
  const picked = '#8B5CF6';

  const darkColors = resolveChartColorsForTheme(
    { ...DEFAULT_CHART_COLORS, hollowBody: picked },
    'custom',
    true,
  );
  assert.equal(darkColors.hollowBody, picked);

  // Dark default canvas on a light app theme trips the canvas-brightness
  // override for background/foreground/grid — the hollow pick must survive it.
  const lightColors = resolveChartColorsForTheme(
    { ...DEFAULT_CHART_COLORS, hollowBody: picked },
    'custom',
    false,
  );
  assert.equal(lightColors.background, CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.background);
  assert.equal(lightColors.hollowBody, picked);

  const transparentPick = resolveChartColorsForTheme(
    { ...DEFAULT_CHART_COLORS, hollowBody: 'transparent' },
    'custom',
    true,
  );
  assert.equal(transparentPick.hollowBody, 'transparent');
});

test('chart color resolver keeps preset hollow body values following the app theme', () => {
  // A stale preset hollow fill (e.g. dark preset value after switching to a
  // light app theme) still flips with the canvas so hollow candles stay
  // background-matched.
  const lightColors = resolveChartColorsForTheme(
    { ...DEFAULT_CHART_COLORS },
    'custom',
    false,
  );
  assert.equal(lightColors.hollowBody, CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.hollowBody);
});
