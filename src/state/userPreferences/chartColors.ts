/**
 * Chart color presets, defaults, theme fallbacks, and the resolver that
 * applies theme-driven structural overrides on top of the user's saved colors.
 */
import { GDark, GLight } from '../../ui/theme/glass';
import type {
  ChartColorScheme,
  ChartColorsConfig,
  ChartDisplaySettings,
} from './types';

export const CHART_COLOR_SCHEME_PRESETS: Record<Exclude<ChartColorScheme, 'custom'>, { label: string; colors: ChartColorsConfig }> = {
  green_on_black: {
    label: 'Green on Black',
    colors: {
      background: '#121212',
      foreground: '#FFFFFF',
      grid: 'rgba(255,255,255,0.18)',
      candlesUptrend: '#10B981',
      candlesDowntrend: '#EF4444',
      hollowBody: '#121212',
      barsUptrend: '#10B981',
      barsDowntrend: '#EF4444',
      lineBody: '#10B981',
    },
  },
  black_on_white: {
    label: 'Black on White',
    colors: {
      background: '#FFFFFF',
      foreground: '#0F172A',
      grid: 'rgba(0,0,0,0.09)',
      candlesUptrend: '#2563EB',
      candlesDowntrend: '#EF4444',
      hollowBody: '#FFFFFF',
      barsUptrend: '#2563EB',
      barsDowntrend: '#EF4444',
      lineBody: '#2563EB',
    },
  },
  yellow_on_black: {
    label: 'Yellow on Black',
    colors: {
      background: '#121212',
      foreground: '#FFFFFF',
      grid: 'rgba(255,255,255,0.18)',
      candlesUptrend: '#FACC15',
      candlesDowntrend: '#F59E0B',
      hollowBody: '#121212',
      barsUptrend: '#FACC15',
      barsDowntrend: '#F59E0B',
      lineBody: '#FACC15',
    },
  },
};

export const DEFAULT_CHART_COLOR_SCHEME: Exclude<ChartColorScheme, 'custom'> = 'green_on_black';

export const DEFAULT_CHART_COLORS: ChartColorsConfig = {
  ...CHART_COLOR_SCHEME_PRESETS[DEFAULT_CHART_COLOR_SCHEME].colors,
  tradeOpen: '#2962FF',
  tradeTpSl: GDark.trading.profit,
  tradeStopOut: '#DC2626',
};

type StructuralChartColors = Pick<ChartColorsConfig, 'background' | 'foreground' | 'grid' | 'hollowBody'>;

const normalizeStructuralChartColor = (color: string): string =>
  color.trim().toLowerCase().replace(/\s+/g, '');

const createStructuralColorSet = (values: readonly string[]): Set<string> =>
  new Set(values.map(normalizeStructuralChartColor));

const isNearBlackChartColor = (color: string): boolean => {
  const normalized = normalizeStructuralChartColor(color);
  if (normalized === '#000' || normalized === '#000000' || normalized === 'black') {
    return true;
  }

  const rgbMatch = normalized.match(/^rgba?\((\d+),(\d+),(\d+)(?:,([0-9.]+))?\)$/);
  if (!rgbMatch) {
    return false;
  }

  const [, red, green, blue, alpha] = rgbMatch;
  if (alpha !== undefined && Number(alpha) <= 0) {
    return false;
  }

  return Number(red) <= 16 && Number(green) <= 16 && Number(blue) <= 16;
};

const parseOpaqueRgbChartColor = (color: string): { red: number; green: number; blue: number } | null => {
  const normalized = normalizeStructuralChartColor(color);
  if (normalized === 'white') {
    return { red: 255, green: 255, blue: 255 };
  }
  if (normalized === 'black') {
    return { red: 0, green: 0, blue: 0 };
  }

  const hex = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    const value = hex[1];
    const red = value.length === 3 ? parseInt(value[0] + value[0], 16) : parseInt(value.slice(0, 2), 16);
    const green = value.length === 3 ? parseInt(value[1] + value[1], 16) : parseInt(value.slice(2, 4), 16);
    const blue = value.length === 3 ? parseInt(value[2] + value[2], 16) : parseInt(value.slice(4, 6), 16);
    const alpha = value.length === 8 ? parseInt(value.slice(6, 8), 16) / 255 : 1;
    return alpha <= 0 ? null : { red, green, blue };
  }

  const rgb = normalized.match(/^rgba?\((\d+),(\d+),(\d+)(?:,([0-9.]+))?\)$/);
  if (!rgb) {
    return null;
  }

  const [, red, green, blue, alpha] = rgb;
  if (alpha !== undefined && Number(alpha) <= 0) {
    return null;
  }

  return {
    red: Number(red),
    green: Number(green),
    blue: Number(blue),
  };
};

const getChartColorLuminance = (color: string): number | null => {
  const rgb = parseOpaqueRgbChartColor(color);
  if (!rgb) {
    return null;
  }

  return (0.299 * rgb.red + 0.587 * rgb.green + 0.114 * rgb.blue) / 255;
};

const isLightChartColor = (color: string): boolean => {
  const luminance = getChartColorLuminance(color);
  return luminance !== null && luminance >= 0.72;
};

const isDarkChartColor = (color: string): boolean => {
  const luminance = getChartColorLuminance(color);
  return luminance !== null && luminance <= 0.28;
};

const LIGHT_THEME_CHART_FALLBACKS: StructuralChartColors = {
  background: CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.background,
  foreground: CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.foreground,
  grid: CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.grid,
  hollowBody: CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.hollowBody,
};

const DARK_THEME_CHART_FALLBACKS: StructuralChartColors = {
  background: CHART_COLOR_SCHEME_PRESETS.green_on_black.colors.background,
  foreground: DEFAULT_CHART_COLORS.foreground,
  grid: DEFAULT_CHART_COLORS.grid,
  hollowBody: CHART_COLOR_SCHEME_PRESETS.green_on_black.colors.hollowBody,
};

const BUILTIN_STRUCTURAL_VALUES: Record<keyof StructuralChartColors, Set<string>> = {
  background: createStructuralColorSet([
    '#000000', // legacy default — ensures persisted values get migrated
    '#080B11', // previous dark chart default
    '#0E141F', // previous card default
    DEFAULT_CHART_COLORS.background,
    CHART_COLOR_SCHEME_PRESETS.green_on_black.colors.background,
    CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.background,
    CHART_COLOR_SCHEME_PRESETS.yellow_on_black.colors.background,
  ]),
  foreground: createStructuralColorSet([
    DEFAULT_CHART_COLORS.foreground,
    CHART_COLOR_SCHEME_PRESETS.green_on_black.colors.foreground,
    CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.foreground,
    CHART_COLOR_SCHEME_PRESETS.yellow_on_black.colors.foreground,
  ]),
  grid: createStructuralColorSet([
    'rgba(255,255,255,0.04)',
    'rgba(255,255,255,0.06)',
    'rgba(255,255,255,0.15)',
    'rgba(255,255,255,0.18)',
    'rgba(15,23,42,0.12)',
    'rgba(15,23,42,0.16)',
    DEFAULT_CHART_COLORS.grid,
    CHART_COLOR_SCHEME_PRESETS.green_on_black.colors.grid,
    CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.grid,
    CHART_COLOR_SCHEME_PRESETS.yellow_on_black.colors.grid,
  ]),
  hollowBody: createStructuralColorSet([
    '#080B11', // previous dark chart default
    '#1E293B', // previous hollow body default
    DEFAULT_CHART_COLORS.hollowBody,
    CHART_COLOR_SCHEME_PRESETS.green_on_black.colors.hollowBody,
    CHART_COLOR_SCHEME_PRESETS.black_on_white.colors.hollowBody,
    CHART_COLOR_SCHEME_PRESETS.yellow_on_black.colors.hollowBody,
  ]),
};

export function resolveChartColorsForTheme(
  chartColors: Partial<ChartColorsConfig> | undefined,
  chartColorScheme: ChartColorScheme | undefined,
  isDark: boolean,
): ChartColorsConfig {
  const mergedColors: ChartColorsConfig = {
    ...DEFAULT_CHART_COLORS,
    ...(chartColors ?? {}),
  };

  const resolvedColors = { ...mergedColors };
  // Existing installations retain the former default in saved preferences.
  // Default TP/SL accents follow the app theme; other custom picks stay intact.
  const defaultTradeColors = ['#089981', GDark.trading.profit, GLight.trading.profit];
  if (defaultTradeColors.some((color) => (
    normalizeStructuralChartColor(color) === normalizeStructuralChartColor(mergedColors.tradeTpSl ?? '')
  ))) {
    resolvedColors.tradeTpSl = (isDark ? GDark : GLight).trading.profit;
  }
  const themeStructuralColors = isDark ? DARK_THEME_CHART_FALLBACKS : LIGHT_THEME_CHART_FALLBACKS;
  const forceThemeStructure = Boolean(chartColorScheme && chartColorScheme !== 'custom');
  const canvasBrightnessMismatchesTheme = chartColorScheme === 'custom' && (
    isDark ? isLightChartColor(mergedColors.background) : isDarkChartColor(mergedColors.background)
  );

  (Object.keys(themeStructuralColors) as Array<keyof StructuralChartColors>).forEach((key) => {
    const normalizedValue = normalizeStructuralChartColor(mergedColors[key]);
    const isInvisibleDarkGrid = key === 'grid' && isDark && isNearBlackChartColor(mergedColors[key]);
    // Hollow body is a candle fill, not canvas structure. A deliberate custom
    // pick (any non-preset value) must survive every theme override — only
    // preset/default hollow fills keep auto-following the app theme so hollow
    // candles stay background-matched when the canvas flips.
    const isExplicitCustomHollowBody =
      key === 'hollowBody' &&
      chartColorScheme === 'custom' &&
      !BUILTIN_STRUCTURAL_VALUES.hollowBody.has(normalizedValue);
    if (isExplicitCustomHollowBody) {
      return;
    }
    if (
      forceThemeStructure ||
      canvasBrightnessMismatchesTheme ||
      (!chartColorScheme && (isInvisibleDarkGrid || BUILTIN_STRUCTURAL_VALUES[key].has(normalizedValue)))
    ) {
      resolvedColors[key] = themeStructuralColors[key];
    }
  });

  return resolvedColors;
}

export const DEFAULT_CHART_DISPLAY_SETTINGS: ChartDisplaySettings = {
  showTicker: true,
  // O/H/L/C under the symbol picker is part of the primary chart header.
  showOHLC: true,
  showQuickTradingButtons: true,
  // Single visible guide line: live Bid only. Ask stays internal for trading.
  showLivePriceLine: true,
  // Legacy keys kept for persisted preference migration only.
  showBidPriceLine: true,
  showAskPriceLine: false,
  // true = show the colored axis label (box) for the last-close price on the
  // right price scale. This is standard in all professional trading apps
  // (MT5, TradingView, Dhan). Note: this no longer controls priceLineVisible
  // on the series - the live price line is the only horizontal line on the
  // chart canvas.
  showLastPriceLine: true,
  showGrid: true,
  periodSeparators: true,
  showTickVolumes: true,
  showRealVolumes: false,
  showObjectDescriptions: false,
  showTradeLevels: true,
  showTradeHistory: true,
  // Off by default — hold-and-drag repositioning of the symbol/OHLC header is
  // an opt-in from the chart's 3-dot menu.
  movableSymbolHeader: false,
};
