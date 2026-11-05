/**
 * Defines the available 'Show on Chart' options presented in the Chart Settings screen.
 * These options control whether specific trading elements (like open positions or SL/TP lines)
 * are rendered visually over the candlestick price data.
 */
export const CHART_SHOW_ON_CHART_ITEMS = [
  {
    key: 'buyTrade',
    label: 'Show buy trade',
    description: 'Shows your open buy positions, with their SL / TP, on the chart.',
  },
  {
    key: 'sellTrade',
    label: 'Show sell trade',
    description: 'Shows your open sell positions, with their SL / TP, on the chart.',
  },
  {
    key: 'slTpLevels',
    label: 'SL/TP levels',
    description: 'Show Stop Loss and Take Profit values on the chart.',
  },
] as const;

export type ChartShowOnChartKey = (typeof CHART_SHOW_ON_CHART_ITEMS)[number]['key'];

/**
 * A map containing the user's saved preferences for which trading elements should be shown on the chart.
 */
export type ChartShowOnChartSettings = Record<ChartShowOnChartKey, boolean>;

/**
 * The default 'Show on Chart' settings. By default, all trade lines and SL/TP levels are enabled.
 */
export const DEFAULT_CHART_SHOW_ON_CHART: ChartShowOnChartSettings = {
  buyTrade: true,
  sellTrade: true,
  slTpLevels: true,
};

// Older builds persisted a richer per-feature show-on-chart object (open
// positions, TP/SL, closed positions, signals, HMR, alerts, stop-out) and even
// earlier top-level boolean flags. The current model keeps buy/sell trade
// visibility plus the MT5-style SL/TP levels visibility.
export type LegacyChartShowOnChartState = Partial<{
  showOpenPositions: boolean;
  showTpSlStopLimit: boolean;
  showClosedPositions: boolean;
  showTradingSignals: boolean;
  showHmrPeriods: boolean;
  showPriceAlerts: boolean;
  showPotentialStopOut: boolean;
}>;

/**
 * Safely parses the user's stored chart preferences from local storage or remote sync.
 * Reverts any missing or corrupted keys to their safe defaults.
 */
export function normalizeChartShowOnChartSettings(
  value?: unknown,
): ChartShowOnChartSettings {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    buyTrade:
      typeof record.buyTrade === 'boolean' ? record.buyTrade : DEFAULT_CHART_SHOW_ON_CHART.buyTrade,
    sellTrade:
      typeof record.sellTrade === 'boolean' ? record.sellTrade : DEFAULT_CHART_SHOW_ON_CHART.sellTrade,
    slTpLevels:
      typeof record.slTpLevels === 'boolean' ? record.slTpLevels : DEFAULT_CHART_SHOW_ON_CHART.slTpLevels,
  };
}

/**
 * Migrates user preferences from older versions of the app to the current 'Show on Chart' format.
 * Maps legacy keys (like `showTpSlStopLimit`) to the new standard keys.
 */
export function buildChartShowOnChartSettingsFromLegacy(
  state: LegacyChartShowOnChartState | null | undefined,
): ChartShowOnChartSettings {
  return {
    ...DEFAULT_CHART_SHOW_ON_CHART,
    slTpLevels:
      typeof state?.showTpSlStopLimit === 'boolean'
        ? state.showTpSlStopLimit
        : DEFAULT_CHART_SHOW_ON_CHART.slTpLevels,
  };
}

export function hasLegacyChartShowOnChartDefaults(
  _state: LegacyChartShowOnChartState | null | undefined,
): boolean {
  // The legacy-defaults reset path no longer applies under the buy/sell model.
  return false;
}
