import type { DrawingToolsActionSheetAction } from './types';

/**
 * Drawing Tools changes chart/WebView state synchronously. Close the retained
 * sheet first so that state work cannot race the sheet's hidden commit.
 */
export function dismissBeforeDrawingToolsSelection(
  actions: DrawingToolsActionSheetAction[],
  dismiss: () => void,
): DrawingToolsActionSheetAction[] {
  return actions.map((action) => ({
    ...action,
    onPress: () => {
      dismiss();
      action.onPress?.();
    },
  }));
}
