/**
 * Public entry for user preferences. Split for the 500-line ceiling into:
 *   - `types.ts`        — shared types
 *   - `chartColors.ts`  — color presets, defaults, theme resolver
 *   - `store.ts`        — zustand store + persistence migrate
 */
export type {
  QuoteViewMode,
  ThemeMode,
  ChartTradeVolumeDisplayMode,
  LanguageCode,
  ChartColorScheme,
  ChartVisualType,
  ChartColorsConfig,
  ChartDisplaySettings,
  UserPreferencesState,
} from './types';
export {
  CHART_COLOR_SCHEME_PRESETS,
  DEFAULT_CHART_COLORS,
  DEFAULT_CHART_DISPLAY_SETTINGS,
  resolveChartColorsForTheme,
} from './chartColors';
export {
  flushUserPreferencesPersistence,
  useUserPreferences,
} from './store';
