import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/shallow';

import { useUserPreferences } from '../../state/userPreferences';
import type { ChartWindowState } from './chartWindowState';
import {
  buildChartWindowVisualPreferencesSignature,
  cloneChartWindowVisualPreferences,
  reconcileChartWindowVisualPreferences,
  syncChartWindowVisualPreferences,
  type ChartWindowVisualPreferences,
  type ChartWindowVisualPreferencesByPane,
} from './chartWindowVisualPreferences';

export type {
  ChartWindowVisualPreferences,
  ChartWindowVisualPreferencesByPane,
} from './chartWindowVisualPreferences';

const applyChartWindowVisualPreferences = (
  preferences: ChartWindowVisualPreferences,
) => {
  useUserPreferences.setState({
    chartVisualType: preferences.chartVisualType,
    chartColors: { ...preferences.chartColors },
    chartColorScheme: preferences.chartColorScheme,
    chartDisplay: { ...preferences.chartDisplay },
    chartViewportShowVolumePane: preferences.chartViewportShowVolumePane,
    chartViewportShowDrawingToolbar: preferences.chartViewportShowDrawingToolbar,
    chartOneClickPanelAtBottom: preferences.chartOneClickPanelAtBottom,
    chartVerticalScrollingLocked: preferences.chartVerticalScrollingLocked,
    chartAutoScaleEnabled: preferences.chartAutoScaleEnabled,
    chartLockAll: preferences.chartLockAll,
    chartHideAll: preferences.chartHideAll,
    chartShowOnChart: { ...preferences.chartShowOnChart },
    priceSource: preferences.priceSource,
  });
};

/**
 * Keeps chart appearance transiently pane-local while the persisted preference
 * store continues to drive the one retained production engine. Activating a
 * pane restores its snapshot atomically; global preference edits are then
 * copied to either the confirmed pane or every untouched pane.
 */
export function useChartWindowVisualPreferences(
  state: ChartWindowState,
): ChartWindowVisualPreferencesByPane {
  const currentPreferences = useUserPreferences(
    useShallow((preferences) => ({
      chartVisualType: preferences.chartVisualType,
      chartColors: preferences.chartColors,
      chartColorScheme: preferences.chartColorScheme,
      chartDisplay: preferences.chartDisplay,
      chartViewportShowVolumePane: preferences.chartViewportShowVolumePane,
      chartViewportShowDrawingToolbar: preferences.chartViewportShowDrawingToolbar,
      chartOneClickPanelAtBottom: preferences.chartOneClickPanelAtBottom,
      chartVerticalScrollingLocked: preferences.chartVerticalScrollingLocked,
      chartAutoScaleEnabled: preferences.chartAutoScaleEnabled,
      chartLockAll: preferences.chartLockAll,
      chartHideAll: preferences.chartHideAll,
      chartShowOnChart: preferences.chartShowOnChart,
      priceSource: preferences.priceSource,
    })),
  );
  const currentSignature = useMemo(
    () => buildChartWindowVisualPreferencesSignature(currentPreferences),
    [currentPreferences],
  );
  const paneIds = useMemo(
    () => state.panes.map((pane) => pane.id),
    [state.panes],
  );
  const [preferencesByPane, setPreferencesByPane] = useState<
    ChartWindowVisualPreferencesByPane
  >(() => Object.freeze(Object.fromEntries(
    paneIds.map((paneId) => [
      paneId,
      cloneChartWindowVisualPreferences(currentPreferences),
    ]),
  )));
  const preferencesByPaneRef = useRef(preferencesByPane);
  const activePaneIdRef = useRef(state.activePaneId);
  const lastGlobalSignatureRef = useRef(currentSignature);
  preferencesByPaneRef.current = preferencesByPane;

  useLayoutEffect(() => {
    let next = reconcileChartWindowVisualPreferences(
      preferencesByPaneRef.current,
      paneIds,
      currentPreferences,
    );
    const activePaneChanged = activePaneIdRef.current !== state.activePaneId;

    if (activePaneChanged) {
      activePaneIdRef.current = state.activePaneId;
      const activePreferences = next[state.activePaneId]
        ?? cloneChartWindowVisualPreferences(currentPreferences);
      const activeSignature = buildChartWindowVisualPreferencesSignature(activePreferences);
      lastGlobalSignatureRef.current = activeSignature;
      if (activeSignature !== currentSignature) {
        applyChartWindowVisualPreferences(activePreferences);
      }
    } else if (lastGlobalSignatureRef.current !== currentSignature) {
      next = syncChartWindowVisualPreferences(
        next,
        paneIds,
        state.toolbarTargetPaneId,
        currentPreferences,
      );
      lastGlobalSignatureRef.current = currentSignature;
    }

    if (next !== preferencesByPaneRef.current) {
      preferencesByPaneRef.current = next;
      setPreferencesByPane(next);
    }
  }, [
    currentPreferences,
    currentSignature,
    paneIds,
    state.activePaneId,
    state.toolbarTargetPaneId,
  ]);

  return preferencesByPane;
}
