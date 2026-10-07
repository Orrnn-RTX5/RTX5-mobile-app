import { CHART_WINDOW_MAX_PANES } from '../chartWindowState';

export const CHART_WINDOW_MANAGER_MAX_PANES = CHART_WINDOW_MAX_PANES;

export type ChartWindowManagerPaneIdentity = Readonly<{
  id: string;
}>;

/**
 * Keeps the visual New Window gate aligned with the phone chart limit while
 * still allowing a parent capability gate to disable the action earlier.
 */
export function canOpenChartWindowFromManager({
  paneCount,
  canOpen = true,
  maxReached = false,
}: Readonly<{
  paneCount: number;
  canOpen?: boolean;
  maxReached?: boolean;
}>): boolean {
  return canOpen
    && !maxReached
    && paneCount < CHART_WINDOW_MANAGER_MAX_PANES;
}

/**
 * Filters stale or duplicated controlled selections and returns pane IDs in
 * their visible order. That makes a bulk Remove action deterministic.
 */
export function resolveChartWindowRemovalIds(
  panes: readonly ChartWindowManagerPaneIdentity[],
  selectedRemovalIds: Iterable<string>,
): readonly string[] {
  const selected = new Set(selectedRemovalIds);
  return panes.reduce<string[]>((ids, pane) => {
    if (selected.has(pane.id) && !ids.includes(pane.id)) {
      ids.push(pane.id);
    }
    return ids;
  }, []);
}

/**
 * MT5 exposes a reorder handle. Phone layouts support at most two panes, so a
 * handle tap deterministically swaps the selected pane with the other pane.
 */
export function resolveChartWindowMoveTargetIndex(
  panes: readonly ChartWindowManagerPaneIdentity[],
  paneId: string,
): number | null {
  if (panes.length < 2) {
    return null;
  }

  const currentIndex = panes.findIndex((pane) => pane.id === paneId);
  if (currentIndex < 0) {
    return null;
  }

  return currentIndex === 0 ? 1 : currentIndex - 1;
}
