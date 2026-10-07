import { useCallback, useRef } from 'react';

export const CHART_WINDOW_TOOLBAR_ACTIONS = [
  'crosshair',
  'timeframe',
  'sltp',
  'drawings',
  'settings',
  'more',
] as const;

export type ChartWindowToolbarAction = typeof CHART_WINDOW_TOOLBAR_ACTIONS[number];

export type ChartWindowToolbarTargetConfirmation = Readonly<{
  mode: 'all' | 'pane';
  toolbarTargetPaneId: string | null;
  targetPaneIds: readonly string[];
}>;

export type ChartWindowToolbarActionHandlers = Readonly<
  Record<
    ChartWindowToolbarAction,
    (confirmation: ChartWindowToolbarTargetConfirmation) => void
  >
>;

export type RunOnChartWindowToolbarTarget = (
  onTargetConfirmed: (confirmation: ChartWindowToolbarTargetConfirmation) => void,
) => void;

/**
 * Routes the shared top toolbar through the split-window controller before an
 * action runs. The handler ref is deliberately refreshed every render: a pane
 * handoff may finish later, and executing a render-time closure from the old
 * symbol/timeframe would apply the command to the wrong chart.
 */
export function useChartWindowToolbarRouter(
  runOnToolbarTarget: RunOnChartWindowToolbarTarget,
  handlers: ChartWindowToolbarActionHandlers,
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  return useCallback((action: ChartWindowToolbarAction) => {
    runOnToolbarTarget((confirmation) => {
      handlersRef.current[action](confirmation);
    });
  }, [runOnToolbarTarget]);
}
