import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  canOpenNewChartWindow,
  claimChartWindowToolbarTarget,
  createInitialChartWindowState,
  getActiveChartWindowPane,
  getChartWindowToolbarTargetPaneIds,
  moveChartWindowPane,
  openNewChartWindow,
  removeChartWindowPane,
  selectChartWindowPane,
  selectChartWindowPaneFromTap,
  setChartWindowLayout,
  updateActiveChartWindowContext,
  updateToolbarTargetChartWindowContext,
  type ChartWindowContext,
  type ChartWindowLayout,
  type ChartWindowPane,
  type ChartWindowState,
} from './chartWindowState';

export type ChartWindowContextSnapshot = Readonly<{
  symbol: string;
  timeframe: string;
}>;

export type ChartWindowToolbarTargetMode = 'all' | 'pane';

export type ChartWindowToolbarTargetConfirmation = Readonly<{
  mode: ChartWindowToolbarTargetMode;
  toolbarTargetPaneId: string | null;
  targetPaneIds: readonly string[];
  targetPane: ChartWindowPane;
  confirmedContext: ChartWindowContextSnapshot;
}>;

export type ChartWindowRemovalTransactionPlan = Readonly<{
  nextState: ChartWindowState;
  orderedRemovalIds: readonly string[];
  requiresContextCommit: boolean;
  targetPane: ChartWindowPane;
}>;

type PendingChartWindowTransition = Readonly<{
  kind: 'select-pane' | 'remove-panes' | 'update-toolbar-context';
  originSymbol: string;
  originTimeframe: string;
  targetPane: ChartWindowPane;
  selectFromTap?: boolean;
  onSelectionConfirmed?: (
    pane: ChartWindowPane,
    confirmedContext: ChartWindowContextSnapshot,
  ) => void;
  removalPlan?: ChartWindowRemovalTransactionPlan;
  toolbarContextPatch?: Partial<ChartWindowContext>;
  expectedToolbarTargetPaneId?: string | null;
  toolbarTargetPaneIdToCommit?: string;
}>;

const chartWindowContextsMatch = (
  left: ChartWindowContextSnapshot,
  right: ChartWindowContextSnapshot,
): boolean => left.symbol === right.symbol && left.timeframe === right.timeframe;

const createToolbarTargetConfirmation = (
  state: ChartWindowState,
  targetPane: ChartWindowPane,
  confirmedContext: ChartWindowContextSnapshot,
): ChartWindowToolbarTargetConfirmation => Object.freeze({
  mode: state.toolbarTargetPaneId === null ? 'all' : 'pane',
  toolbarTargetPaneId: state.toolbarTargetPaneId,
  targetPaneIds: getChartWindowToolbarTargetPaneIds(state),
  targetPane,
  confirmedContext: Object.freeze({ ...confirmedContext }),
});

/**
 * Builds a removal without mutating the live state. If removing the active
 * pane requires another symbol/timeframe, callers keep the current state until
 * that context is confirmed.
 */
export function planChartWindowPaneRemoval(
  state: ChartWindowState,
  paneIds: readonly string[],
  currentContext: ChartWindowContextSnapshot,
): ChartWindowRemovalTransactionPlan {
  let nextState = state;
  const selectedIds = new Set(paneIds);
  const orderedRemovalIds = state.panes
    .filter((pane) => selectedIds.has(pane.id))
    .slice(0, Math.max(0, state.panes.length - 1))
    .map((pane) => pane.id);

  orderedRemovalIds.forEach((paneId) => {
    nextState = removeChartWindowPane(nextState, paneId);
  });

  const targetPane = getActiveChartWindowPane(nextState);
  return Object.freeze({
    nextState,
    orderedRemovalIds: Object.freeze(orderedRemovalIds),
    requiresContextCommit:
      nextState !== state && !chartWindowContextsMatch(targetPane, currentContext),
    targetPane,
  });
}

/**
 * Applies a deferred removal only for its confirmed target context. Returning
 * null leaves the pre-removal state intact on cancellation, blur, or override.
 */
export function commitConfirmedChartWindowPaneRemoval(
  state: ChartWindowState,
  plan: ChartWindowRemovalTransactionPlan,
  confirmedContext: ChartWindowContextSnapshot,
): ChartWindowState | null {
  if (!chartWindowContextsMatch(plan.targetPane, confirmedContext)) {
    return null;
  }

  return plan.orderedRemovalIds.reduce(
    (nextState, paneId) => removeChartWindowPane(nextState, paneId),
    state,
  );
}

export type UseChartWindowsFeatureOptions = Readonly<{
  symbol: string;
  timeframe: string;
  active: boolean;
  /** Uses the chart's existing warm switch path so history and viewport stay stable. */
  onCommitContext: (symbol: string, timeframe: string) => void;
  /** Cancels ChartScreen's deferred context scheduler during reselection/blur. */
  onCancelPendingContext: () => void;
}>;

export type ChartWindowsFeatureController = Readonly<{
  state: ChartWindowState;
  activePane: ChartWindowPane;
  toolbarTargetPaneId: string | null;
  toolbarTargetsAllPanes: boolean;
  isSplit: boolean;
  managerVisible: boolean;
  selectedRemovalIds: ReadonlySet<string>;
  canOpenNewWindow: boolean;
  openManager: () => void;
  closeManager: () => void;
  openNewWindow: () => void;
  claimToolbarTarget: (paneId: string) => void;
  selectPane: (
    paneId: string,
    onSelectionConfirmed?: (
      pane: ChartWindowPane,
      confirmedContext: ChartWindowContextSnapshot,
    ) => void,
  ) => void;
  selectPaneFromTap: (
    paneId: string,
    onSelectionConfirmed?: (
      pane: ChartWindowPane,
      confirmedContext: ChartWindowContextSnapshot,
    ) => void,
  ) => void;
  runOnToolbarTarget: (
    onConfirmed: (confirmation: ChartWindowToolbarTargetConfirmation) => void,
  ) => void;
  updateToolbarTargetContext: (patch: Partial<ChartWindowContext>) => void;
  toggleRemoval: (paneId: string) => void;
  removePanes: (paneIds: readonly string[]) => void;
  setLayout: (layout: ChartWindowLayout) => void;
  movePane: (paneId: string, toIndex: number) => void;
}>;

/**
 * Owns MT5-style chart-window state outside the already large ChartScreen.
 * Active-pane transitions are transactional: selection and removal change the
 * logical active pane only after the established warm chart path confirms its
 * symbol/timeframe. Cancelling or leaving the screen retains the original pane
 * state and never overwrites a saved context with a transient global value.
 */
export function useChartWindowsFeature({
  symbol,
  timeframe,
  active,
  onCommitContext,
  onCancelPendingContext,
}: UseChartWindowsFeatureOptions): ChartWindowsFeatureController {
  const [state, setState] = useState<ChartWindowState>(() => (
    createInitialChartWindowState({ symbol, timeframe })
  ));
  const [managerVisible, setManagerVisible] = useState(false);
  const [selectedRemovalIds, setSelectedRemovalIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  const stateRef = useRef(state);
  const currentContextRef = useRef({ symbol, timeframe });
  const onCommitContextRef = useRef(onCommitContext);
  const onCancelPendingContextRef = useRef(onCancelPendingContext);
  const pendingTransitionRef = useRef<PendingChartWindowTransition | null>(null);
  const toolbarConfirmationRevisionRef = useRef(0);

  stateRef.current = state;
  currentContextRef.current = { symbol, timeframe };
  onCommitContextRef.current = onCommitContext;
  onCancelPendingContextRef.current = onCancelPendingContext;

  const commitState = useCallback((nextState: ChartWindowState) => {
    stateRef.current = nextState;
    setState(nextState);
  }, []);

  const cancelPendingTransition = useCallback(() => {
    toolbarConfirmationRevisionRef.current += 1;
    pendingTransitionRef.current = null;
    onCancelPendingContextRef.current();
  }, []);

  const requestPaneSelection = useCallback((
    pane: ChartWindowPane,
    onSelectionConfirmed?: (
      pane: ChartWindowPane,
      confirmedContext: ChartWindowContextSnapshot,
    ) => void,
    selectFromTap: boolean = false,
  ) => {
    const currentState = stateRef.current;
    const currentContext = currentContextRef.current;
    cancelPendingTransition();

    if (
      pane.symbol === currentContext.symbol
      && pane.timeframe === currentContext.timeframe
    ) {
      commitState(selectFromTap
        ? selectChartWindowPaneFromTap(currentState, pane.id)
        : selectChartWindowPane(currentState, pane.id));
      onSelectionConfirmed?.(pane, currentContext);
      return;
    }

    pendingTransitionRef.current = {
      kind: 'select-pane',
      originSymbol: currentContext.symbol,
      originTimeframe: currentContext.timeframe,
      targetPane: pane,
      selectFromTap,
      onSelectionConfirmed,
    };
    onCommitContextRef.current(pane.symbol, pane.timeframe);
  }, [cancelPendingTransition, commitState]);

  useLayoutEffect(() => {
    const pendingTransition = pendingTransitionRef.current;
    if (pendingTransition) {
      const targetConfirmed =
        pendingTransition.targetPane.symbol === symbol
        && pendingTransition.targetPane.timeframe === timeframe;
      if (targetConfirmed) {
        pendingTransitionRef.current = null;
        const targetStillExists = stateRef.current.panes.some(
          (pane) => pane.id === pendingTransition.targetPane.id,
        );
        if (targetStillExists) {
          if (pendingTransition.kind === 'remove-panes' && pendingTransition.removalPlan) {
            const nextState = commitConfirmedChartWindowPaneRemoval(
              stateRef.current,
              pendingTransition.removalPlan,
              { symbol, timeframe },
            );
            if (nextState) {
              commitState(nextState);
            }
          } else if (pendingTransition.kind === 'update-toolbar-context') {
            if (
              pendingTransition.toolbarContextPatch
              && stateRef.current.toolbarTargetPaneId
                === pendingTransition.expectedToolbarTargetPaneId
            ) {
              const toolbarTargetState = pendingTransition.toolbarTargetPaneIdToCommit
                ? selectChartWindowPaneFromTap(
                  stateRef.current,
                  pendingTransition.toolbarTargetPaneIdToCommit,
                )
                : stateRef.current;
              const nextState = updateToolbarTargetChartWindowContext(
                toolbarTargetState,
                pendingTransition.toolbarContextPatch,
              );
              commitState(nextState);
              pendingTransition.onSelectionConfirmed?.(
                getActiveChartWindowPane(nextState),
                { symbol, timeframe },
              );
            }
          } else {
            if (pendingTransition.selectFromTap) {
              commitState(selectChartWindowPaneFromTap(
                stateRef.current,
                pendingTransition.targetPane.id,
              ));
            } else {
              commitState(selectChartWindowPane(
                stateRef.current,
                pendingTransition.targetPane.id,
              ));
            }
            pendingTransition.onSelectionConfirmed?.(
              pendingTransition.targetPane,
              { symbol, timeframe },
            );
          }
        }
      } else if (
        symbol !== pendingTransition.originSymbol
        || timeframe !== pendingTransition.originTimeframe
      ) {
        // A toolbar/picker action superseded the pending transition. Its scheduler
        // already cancelled the older request, so keep the pre-transition state
        // and apply the newly confirmed context to its active pane.
        pendingTransitionRef.current = null;
        commitState(updateActiveChartWindowContext(stateRef.current, { symbol, timeframe }));
      }
      return;
    }

    // Ordinary symbol/timeframe changes belong only to the confirmed active pane.
    commitState(updateActiveChartWindowContext(stateRef.current, { symbol, timeframe }));
  }, [commitState, symbol, timeframe]);

  useEffect(() => {
    if (!active) {
      cancelPendingTransition();
      setManagerVisible(false);
      setSelectedRemovalIds(new Set<string>());
    }
  }, [active, cancelPendingTransition]);

  const openManager = useCallback(() => {
    setSelectedRemovalIds(new Set<string>());
    setManagerVisible(true);
  }, []);

  const closeManager = useCallback(() => {
    setManagerVisible(false);
    setSelectedRemovalIds(new Set<string>());
  }, []);

  const openNewWindow = useCallback(() => {
    cancelPendingTransition();
    commitState(openNewChartWindow(stateRef.current));
    setSelectedRemovalIds(new Set<string>());
    setManagerVisible(false);
  }, [cancelPendingTransition, commitState]);

  const claimToolbarTarget = useCallback((paneId: string) => {
    const currentState = stateRef.current;
    const nextState = claimChartWindowToolbarTarget(currentState, paneId);
    if (nextState === currentState) return;

    // A new pointer-down is newer user intent than an in-flight pane/context
    // handoff. Keep the active engine where it is until the tap recognizer
    // confirms a single or double tap, but route any immediate toolbar action
    // to this pane now.
    cancelPendingTransition();
    commitState(nextState);
  }, [cancelPendingTransition, commitState]);

  const selectPane = useCallback((
    paneId: string,
    onSelectionConfirmed?: (
      pane: ChartWindowPane,
      confirmedContext: ChartWindowContextSnapshot,
    ) => void,
  ) => {
    const pane = stateRef.current.panes.find((candidate) => candidate.id === paneId);
    if (!pane) {
      cancelPendingTransition();
      return;
    }
    if (pane.id === stateRef.current.activePaneId) {
      cancelPendingTransition();
      onSelectionConfirmed?.(pane, currentContextRef.current);
      return;
    }
    requestPaneSelection(pane, onSelectionConfirmed);
  }, [cancelPendingTransition, requestPaneSelection]);

  const selectPaneFromTap = useCallback((
    paneId: string,
    onSelectionConfirmed?: (
      pane: ChartWindowPane,
      confirmedContext: ChartWindowContextSnapshot,
    ) => void,
  ) => {
    const pane = stateRef.current.panes.find((candidate) => candidate.id === paneId);
    if (!pane) {
      cancelPendingTransition();
      return;
    }
    const pendingTransition = pendingTransitionRef.current;
    if (
      !onSelectionConfirmed
      && pendingTransition?.targetPane.id === paneId
      && (
        pendingTransition.kind === 'select-pane'
        || pendingTransition.kind === 'update-toolbar-context'
      )
    ) {
      // A toolbar action already owns this delayed single tap. Do not replace
      // its confirmation callback when the tap timer eventually fires.
      return;
    }
    requestPaneSelection(pane, onSelectionConfirmed, true);
  }, [cancelPendingTransition, requestPaneSelection]);

  const runOnToolbarTarget = useCallback((
    onConfirmed: (confirmation: ChartWindowToolbarTargetConfirmation) => void,
  ) => {
    const confirmToolbarTarget = (
      confirmedPane: ChartWindowPane,
      confirmedContext: ChartWindowContextSnapshot,
    ) => {
      const confirmedState = stateRef.current;
      if (
        confirmedState.toolbarTargetPaneId !== null
        && confirmedState.toolbarTargetPaneId !== confirmedPane.id
      ) return;
      onConfirmed(createToolbarTargetConfirmation(
        confirmedState,
        confirmedState.toolbarTargetPaneId === null
          ? getActiveChartWindowPane(confirmedState)
          : confirmedPane,
        confirmedContext,
      ));
    };
    const confirmToolbarTargetAfterPaneCommit = (
      confirmedPane: ChartWindowPane,
      confirmedContext: ChartWindowContextSnapshot,
    ) => {
      const revision = toolbarConfirmationRevisionRef.current;
      // Same-context pane promotion commits React state synchronously. Defer
      // the menu/tool callback one task so pane-local visual and drawing
      // snapshots restore before the latest handler configuration is read.
      requestAnimationFrame(() => {
        if (revision !== toolbarConfirmationRevisionRef.current) return;
        confirmToolbarTarget(confirmedPane, confirmedContext);
      });
    };
    const pendingToolbarTarget = pendingTransitionRef.current;
    if (
      (pendingToolbarTarget?.kind === 'select-pane'
        && pendingToolbarTarget.selectFromTap)
      || pendingToolbarTarget?.kind === 'update-toolbar-context'
    ) {
      const previousConfirmation = pendingToolbarTarget.onSelectionConfirmed;
      pendingTransitionRef.current = Object.freeze({
        ...pendingToolbarTarget,
        onSelectionConfirmed: (
          confirmedPane: ChartWindowPane,
          confirmedContext: ChartWindowContextSnapshot,
        ) => {
          try {
            previousConfirmation?.(confirmedPane, confirmedContext);
          } finally {
            confirmToolbarTargetAfterPaneCommit(confirmedPane, confirmedContext);
          }
        },
      });
      return;
    }

    const currentState = stateRef.current;
    if (currentState.toolbarTargetPaneId === null) {
      cancelPendingTransition();
      const activePane = getActiveChartWindowPane(currentState);
      if (!activePane) return;
      onConfirmed(createToolbarTargetConfirmation(
        currentState,
        activePane,
        currentContextRef.current,
      ));
      return;
    }

    const targetPane = currentState.panes.find(
      (pane) => pane.id === currentState.toolbarTargetPaneId,
    );
    if (!targetPane) {
      cancelPendingTransition();
      return;
    }
    requestPaneSelection(targetPane, (confirmedPane, confirmedContext) => {
      confirmToolbarTargetAfterPaneCommit(confirmedPane, confirmedContext);
    });
  }, [cancelPendingTransition, requestPaneSelection]);

  const updateToolbarTargetContext = useCallback((
    patch: Partial<ChartWindowContext>,
  ) => {
    const pendingToolbarTransition = pendingTransitionRef.current;
    const pendingTapSelection = pendingToolbarTransition?.kind === 'select-pane'
      && pendingToolbarTransition.selectFromTap
      ? pendingToolbarTransition
      : null;
    const pendingToolbarUpdate = pendingToolbarTransition?.kind === 'update-toolbar-context'
      ? pendingToolbarTransition
      : null;
    cancelPendingTransition();
    const currentState = stateRef.current;
    const currentContext = currentContextRef.current;
    const toolbarTargetPaneIdToCommit =
      pendingTapSelection?.targetPane.id
      ?? pendingToolbarUpdate?.toolbarTargetPaneIdToCommit;
    const toolbarTargetState = toolbarTargetPaneIdToCommit
      ? selectChartWindowPaneFromTap(currentState, toolbarTargetPaneIdToCommit)
      : currentState;
    const cumulativePatch = Object.freeze({
      ...(pendingToolbarUpdate?.toolbarContextPatch ?? {}),
      ...patch,
    });
    const nextState = updateToolbarTargetChartWindowContext(
      toolbarTargetState,
      cumulativePatch,
    );
    const targetPane = getActiveChartWindowPane(nextState);
    if (!targetPane) return;
    const pendingSelectionConfirmation =
      pendingTapSelection?.onSelectionConfirmed
      ?? pendingToolbarUpdate?.onSelectionConfirmed;

    if (chartWindowContextsMatch(targetPane, currentContext)) {
      commitState(nextState);
      pendingSelectionConfirmation?.(targetPane, currentContext);
      return;
    }

    pendingTransitionRef.current = {
      kind: 'update-toolbar-context',
      originSymbol: currentContext.symbol,
      originTimeframe: currentContext.timeframe,
      targetPane,
      toolbarContextPatch: cumulativePatch,
      expectedToolbarTargetPaneId: currentState.toolbarTargetPaneId,
      toolbarTargetPaneIdToCommit,
      onSelectionConfirmed: pendingSelectionConfirmation,
    };
    onCommitContextRef.current(targetPane.symbol, targetPane.timeframe);
  }, [cancelPendingTransition, commitState]);

  const toggleRemoval = useCallback((paneId: string) => {
    if (!stateRef.current.panes.some((pane) => pane.id === paneId)) return;
    setSelectedRemovalIds((current) => {
      const next = new Set(current);
      next.has(paneId) ? next.delete(paneId) : next.add(paneId);
      return next;
    });
  }, []);

  const removePanes = useCallback((paneIds: readonly string[]) => {
    cancelPendingTransition();
    const currentState = stateRef.current;
    const currentContext = currentContextRef.current;
    const removalPlan = planChartWindowPaneRemoval(
      currentState,
      paneIds,
      currentContext,
    );
    setSelectedRemovalIds(new Set<string>());
    setManagerVisible(false);

    if (!removalPlan.requiresContextCommit) {
      commitState(removalPlan.nextState);
      return;
    }

    pendingTransitionRef.current = {
      kind: 'remove-panes',
      originSymbol: currentContext.symbol,
      originTimeframe: currentContext.timeframe,
      targetPane: removalPlan.targetPane,
      removalPlan,
    };
    onCommitContextRef.current(
      removalPlan.targetPane.symbol,
      removalPlan.targetPane.timeframe,
    );
  }, [cancelPendingTransition, commitState]);

  const setLayout = useCallback((layout: ChartWindowLayout) => {
    commitState(setChartWindowLayout(stateRef.current, layout));
    setManagerVisible(false);
    setSelectedRemovalIds(new Set<string>());
  }, [commitState]);

  const movePane = useCallback((paneId: string, toIndex: number) => {
    commitState(moveChartWindowPane(stateRef.current, paneId, toIndex));
  }, [commitState]);

  const activePane = getActiveChartWindowPane(state);

  return useMemo(() => ({
    state,
    activePane,
    toolbarTargetPaneId: state.toolbarTargetPaneId,
    toolbarTargetsAllPanes: state.toolbarTargetPaneId === null,
    isSplit: state.panes.length > 1,
    managerVisible,
    selectedRemovalIds,
    canOpenNewWindow: canOpenNewChartWindow(state),
    openManager,
    closeManager,
    openNewWindow,
    claimToolbarTarget,
    selectPane,
    selectPaneFromTap,
    runOnToolbarTarget,
    updateToolbarTargetContext,
    toggleRemoval,
    removePanes,
    setLayout,
    movePane,
  }), [
    activePane,
    closeManager,
    claimToolbarTarget,
    managerVisible,
    movePane,
    openManager,
    openNewWindow,
    removePanes,
    runOnToolbarTarget,
    selectPane,
    selectPaneFromTap,
    selectedRemovalIds,
    setLayout,
    state,
    toggleRemoval,
    updateToolbarTargetContext,
  ]);
}
