import type {
  ChartWindowToolbarTargetConfirmation,
} from './useChartWindowToolbarRouter';

/**
 * Null is intentional broadcast/shared ownership. A pane owner is accepted
 * only when it is part of the controller's immutable confirmation snapshot.
 */
export const resolveChartWindowCommandOwnerPaneId = (
  confirmation: ChartWindowToolbarTargetConfirmation,
): string | null => {
  const paneId = confirmation.toolbarTargetPaneId;
  return confirmation.mode === 'pane'
    && typeof paneId === 'string'
    && paneId.length > 0
    && confirmation.targetPaneIds.includes(paneId)
    ? paneId
    : null;
};

/** Shared commands survive pane changes; explicitly owned commands do not. */
export const shouldReleaseChartWindowOwnedAction = (
  ownerPaneId: string | null,
  activePaneId: string,
): boolean => ownerPaneId !== null && ownerPaneId !== activePaneId;
