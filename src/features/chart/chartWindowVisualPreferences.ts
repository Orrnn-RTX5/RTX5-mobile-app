import type {
  ChartColorScheme,
  ChartColorsConfig,
  ChartDisplaySettings,
  ChartVisualType,
} from '../../state/userPreferences/types';
import type { ChartShowOnChartSettings } from './chartShowOnChart';

export type ChartWindowVisualPreferences = Readonly<{
  chartVisualType: ChartVisualType;
  chartColors: ChartColorsConfig;
  chartColorScheme: ChartColorScheme;
  chartDisplay: ChartDisplaySettings;
  chartViewportShowVolumePane: boolean;
  chartViewportShowDrawingToolbar: boolean;
  chartOneClickPanelAtBottom: boolean;
  chartVerticalScrollingLocked: boolean;
  chartAutoScaleEnabled: boolean;
  chartLockAll: boolean;
  chartHideAll: boolean;
  chartShowOnChart: ChartShowOnChartSettings;
  priceSource: 'bid' | 'ask';
}>;

export type ChartWindowVisualPreferencesByPane = Readonly<
  Record<string, ChartWindowVisualPreferences>
>;

export const cloneChartWindowVisualPreferences = (
  preferences: ChartWindowVisualPreferences,
): ChartWindowVisualPreferences => Object.freeze({
  ...preferences,
  chartColors: Object.freeze({ ...preferences.chartColors }),
  chartDisplay: Object.freeze({ ...preferences.chartDisplay }),
  chartShowOnChart: Object.freeze({ ...preferences.chartShowOnChart }),
});

export const buildChartWindowVisualPreferencesSignature = (
  preferences: ChartWindowVisualPreferences,
): string => JSON.stringify([
  // Visual type is pane-local. Including it forces the auxiliary renderer to
  // repaint when that pane switches to Area or Renko.
  preferences.chartVisualType,
  preferences.chartColors,
  preferences.chartColorScheme,
  preferences.chartDisplay,
  preferences.chartViewportShowVolumePane,
  preferences.chartViewportShowDrawingToolbar,
  preferences.chartOneClickPanelAtBottom,
  preferences.chartVerticalScrollingLocked,
  preferences.chartAutoScaleEnabled,
  preferences.chartLockAll,
  preferences.chartHideAll,
  preferences.chartShowOnChart,
  preferences.priceSource,
]);

export function reconcileChartWindowVisualPreferences(
  current: ChartWindowVisualPreferencesByPane,
  paneIds: readonly string[],
  fallback: ChartWindowVisualPreferences,
): ChartWindowVisualPreferencesByPane {
  const paneIdSet = new Set(paneIds);
  const currentIds = Object.keys(current);
  const missingPane = paneIds.some((paneId) => !current[paneId]);
  const stalePane = currentIds.some((paneId) => !paneIdSet.has(paneId));
  if (!missingPane && !stalePane) return current;

  const next: Record<string, ChartWindowVisualPreferences> = {};
  paneIds.forEach((paneId) => {
    next[paneId] = current[paneId]
      ?? cloneChartWindowVisualPreferences(fallback);
  });
  return Object.freeze(next);
}

/**
 * A null toolbar target is the untouched/broadcast state. Once a pane owns the
 * toolbar, only that pane receives later visual preference changes.
 */
export function syncChartWindowVisualPreferences(
  current: ChartWindowVisualPreferencesByPane,
  paneIds: readonly string[],
  toolbarTargetPaneId: string | null,
  preferences: ChartWindowVisualPreferences,
): ChartWindowVisualPreferencesByPane {
  const nextPreferences = cloneChartWindowVisualPreferences(preferences);
  const nextSignature = buildChartWindowVisualPreferencesSignature(nextPreferences);
  const targetIds = toolbarTargetPaneId === null
    ? paneIds
    : paneIds.filter((paneId) => paneId === toolbarTargetPaneId);
  if (targetIds.length === 0) return current;

  let changed = false;
  const next = { ...current };
  targetIds.forEach((paneId) => {
    const previous = current[paneId];
    if (
      previous
      && buildChartWindowVisualPreferencesSignature(previous) === nextSignature
    ) {
      return;
    }
    next[paneId] = nextPreferences;
    changed = true;
  });
  return changed ? Object.freeze(next) : current;
}
