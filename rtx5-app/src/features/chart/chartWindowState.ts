export const CHART_WINDOW_MAX_PANES = 2 as const;
export const DEFAULT_CHART_WINDOW_LAYOUT = 'horizontal' as const;

const CHART_WINDOW_PANE_ID_PREFIX = 'chart-window-';

export type ChartWindowLayout = 'horizontal' | 'vertical';
export type ChartWindowPaneId = string;

export type ChartWindowContext = Readonly<{
  symbol: string;
  timeframe: string;
}>;

export type ChartWindowPane = Readonly<ChartWindowContext & {
  id: ChartWindowPaneId;
}>;

export type ChartWindowState = Readonly<{
  activePaneId: ChartWindowPaneId;
  /** Null means toolbar actions target every divided pane. */
  toolbarTargetPaneId: ChartWindowPaneId | null;
  layout: ChartWindowLayout;
  nextPaneSequence: number;
  panes: readonly ChartWindowPane[];
}>;

export type CreateChartWindowStateInput = ChartWindowContext & Readonly<{
  paneId?: ChartWindowPaneId;
}>;

export type ChartWindowAction =
  | Readonly<{ type: 'new-window' }>
  | Readonly<{ type: 'select-pane'; paneId: ChartWindowPaneId }>
  | Readonly<{ type: 'claim-toolbar-target'; paneId: ChartWindowPaneId }>
  | Readonly<{ type: 'select-pane-from-tap'; paneId: ChartWindowPaneId }>
  | Readonly<{ type: 'update-active-pane'; patch: Partial<ChartWindowContext> }>
  | Readonly<{ type: 'update-toolbar-target'; patch: Partial<ChartWindowContext> }>
  | Readonly<{ type: 'set-layout'; layout: ChartWindowLayout }>
  | Readonly<{ type: 'remove-pane'; paneId?: ChartWindowPaneId }>
  | Readonly<{ type: 'move-pane'; paneId: ChartWindowPaneId; toIndex: number }>;

const createPane = (
  id: ChartWindowPaneId,
  context: ChartWindowContext,
): ChartWindowPane => Object.freeze({
  id,
  symbol: context.symbol,
  timeframe: context.timeframe,
});

const createState = (
  panes: readonly ChartWindowPane[],
  activePaneId: ChartWindowPaneId,
  toolbarTargetPaneId: ChartWindowPaneId | null,
  layout: ChartWindowLayout,
  nextPaneSequence: number,
): ChartWindowState => {
  const normalizedToolbarTargetPaneId =
    panes.length > 1
    && toolbarTargetPaneId !== null
    && panes.some((pane) => pane.id === toolbarTargetPaneId)
      ? toolbarTargetPaneId
      : null;

  return Object.freeze({
    activePaneId,
    toolbarTargetPaneId: normalizedToolbarTargetPaneId,
    layout,
    nextPaneSequence,
    panes: Object.isFrozen(panes) ? panes : Object.freeze([...panes]),
  });
};

const resolveNextPaneIdentity = (
  state: ChartWindowState,
): Readonly<{ id: ChartWindowPaneId; nextPaneSequence: number }> => {
  const existingIds = new Set(state.panes.map((pane) => pane.id));
  let sequence = Math.max(1, Math.floor(state.nextPaneSequence));
  let id = `${CHART_WINDOW_PANE_ID_PREFIX}${sequence}`;

  while (existingIds.has(id)) {
    sequence += 1;
    id = `${CHART_WINDOW_PANE_ID_PREFIX}${sequence}`;
  }

  return Object.freeze({ id, nextPaneSequence: sequence + 1 });
};

export function createInitialChartWindowState(
  input: CreateChartWindowStateInput,
): ChartWindowState {
  const paneId = input.paneId?.trim() || `${CHART_WINDOW_PANE_ID_PREFIX}1`;
  const initialPane = createPane(paneId, input);

  return createState(
    [initialPane],
    initialPane.id,
    null,
    DEFAULT_CHART_WINDOW_LAYOUT,
    2,
  );
}

export function getActiveChartWindowPane(
  state: ChartWindowState,
): ChartWindowPane {
  return state.panes.find((pane) => pane.id === state.activePaneId) ?? state.panes[0];
}

/** Resolves the pane IDs affected by a toolbar action in stable pane order. */
export function getChartWindowToolbarTargetPaneIds(
  state: ChartWindowState,
): readonly ChartWindowPaneId[] {
  if (state.toolbarTargetPaneId === null) {
    return Object.freeze(state.panes.map((pane) => pane.id));
  }

  return Object.freeze([state.toolbarTargetPaneId]);
}

export function canOpenNewChartWindow(state: ChartWindowState): boolean {
  return state.panes.length < CHART_WINDOW_MAX_PANES;
}

/** MT5 New Window duplicates the active chart and makes the duplicate active. */
export function openNewChartWindow(state: ChartWindowState): ChartWindowState {
  if (!canOpenNewChartWindow(state)) {
    return state;
  }

  const activePane = getActiveChartWindowPane(state);
  if (!activePane) {
    return state;
  }

  const nextIdentity = resolveNextPaneIdentity(state);
  const nextPane = createPane(nextIdentity.id, activePane);

  return createState(
    [...state.panes, nextPane],
    nextPane.id,
    null,
    state.layout,
    nextIdentity.nextPaneSequence,
  );
}

export function selectChartWindowPane(
  state: ChartWindowState,
  paneId: ChartWindowPaneId,
): ChartWindowState {
  if (
    paneId === state.activePaneId
    || !state.panes.some((pane) => pane.id === paneId)
  ) {
    return state;
  }

  return createState(
    state.panes,
    paneId,
    state.toolbarTargetPaneId,
    state.layout,
    state.nextPaneSequence,
  );
}

/**
 * Records pointer-down ownership without moving the production chart engine.
 * This makes a fast toolbar press target the touched pane immediately while
 * the single-vs-double-tap recognizer is still waiting for its second tap.
 */
export function claimChartWindowToolbarTarget(
  state: ChartWindowState,
  paneId: ChartWindowPaneId,
): ChartWindowState {
  if (
    state.panes.length <= 1
    || paneId === state.toolbarTargetPaneId
    || !state.panes.some((pane) => pane.id === paneId)
  ) {
    return state;
  }

  return createState(
    state.panes,
    state.activePaneId,
    paneId,
    state.layout,
    state.nextPaneSequence,
  );
}

/** A confirmed single pane tap both activates and explicitly targets that pane. */
export function selectChartWindowPaneFromTap(
  state: ChartWindowState,
  paneId: ChartWindowPaneId,
): ChartWindowState {
  if (!state.panes.some((pane) => pane.id === paneId)) {
    return state;
  }
  if (
    paneId === state.activePaneId
    && paneId === state.toolbarTargetPaneId
  ) {
    return state;
  }

  return createState(
    state.panes,
    paneId,
    paneId,
    state.layout,
    state.nextPaneSequence,
  );
}

export function updateActiveChartWindowContext(
  state: ChartWindowState,
  patch: Partial<ChartWindowContext>,
): ChartWindowState {
  const activePaneIndex = state.panes.findIndex((pane) => pane.id === state.activePaneId);
  if (activePaneIndex < 0) {
    return state;
  }

  const activePane = state.panes[activePaneIndex];
  const symbol = patch.symbol ?? activePane.symbol;
  const timeframe = patch.timeframe ?? activePane.timeframe;
  if (symbol === activePane.symbol && timeframe === activePane.timeframe) {
    return state;
  }

  const panes = [...state.panes];
  panes[activePaneIndex] = createPane(activePane.id, { symbol, timeframe });

  return createState(
    panes,
    state.activePaneId,
    state.toolbarTargetPaneId,
    state.layout,
    state.nextPaneSequence,
  );
}

/**
 * Produces the state that may be committed after the global full-chart context
 * confirms. Broadcast mode patches every pane; an explicit target patches and
 * activates only that pane.
 */
export function updateToolbarTargetChartWindowContext(
  state: ChartWindowState,
  patch: Partial<ChartWindowContext>,
): ChartWindowState {
  const targetPaneIds = new Set(getChartWindowToolbarTargetPaneIds(state));
  let changed = false;
  const panes = state.panes.map((pane) => {
    if (!targetPaneIds.has(pane.id)) return pane;
    const symbol = patch.symbol ?? pane.symbol;
    const timeframe = patch.timeframe ?? pane.timeframe;
    if (symbol === pane.symbol && timeframe === pane.timeframe) return pane;
    changed = true;
    return createPane(pane.id, { symbol, timeframe });
  });
  const activePaneId = state.toolbarTargetPaneId ?? state.activePaneId;

  if (!changed && activePaneId === state.activePaneId) {
    return state;
  }

  return createState(
    panes,
    activePaneId,
    state.toolbarTargetPaneId,
    state.layout,
    state.nextPaneSequence,
  );
}

export function setChartWindowLayout(
  state: ChartWindowState,
  layout: ChartWindowLayout,
): ChartWindowState {
  if (layout === state.layout) {
    return state;
  }

  return createState(
    state.panes,
    state.activePaneId,
    state.toolbarTargetPaneId,
    layout,
    state.nextPaneSequence,
  );
}

export function removeChartWindowPane(
  state: ChartWindowState,
  paneId: ChartWindowPaneId = state.activePaneId,
): ChartWindowState {
  if (state.panes.length <= 1) {
    return state;
  }

  const removedIndex = state.panes.findIndex((pane) => pane.id === paneId);
  if (removedIndex < 0) {
    return state;
  }

  const panes = state.panes.filter((pane) => pane.id !== paneId);
  const activePaneId = state.activePaneId === paneId
    ? panes[Math.min(removedIndex, panes.length - 1)].id
    : state.activePaneId;

  return createState(
    panes,
    activePaneId,
    state.toolbarTargetPaneId,
    state.layout,
    state.nextPaneSequence,
  );
}

export function moveChartWindowPane(
  state: ChartWindowState,
  paneId: ChartWindowPaneId,
  toIndex: number,
): ChartWindowState {
  const fromIndex = state.panes.findIndex((pane) => pane.id === paneId);
  if (fromIndex < 0 || !Number.isFinite(toIndex)) {
    return state;
  }

  const targetIndex = Math.max(
    0,
    Math.min(state.panes.length - 1, Math.trunc(toIndex)),
  );
  if (fromIndex === targetIndex) {
    return state;
  }

  const panes = [...state.panes];
  const [pane] = panes.splice(fromIndex, 1);
  panes.splice(targetIndex, 0, pane);

  return createState(
    panes,
    state.activePaneId,
    state.toolbarTargetPaneId,
    state.layout,
    state.nextPaneSequence,
  );
}

export function chartWindowReducer(
  state: ChartWindowState,
  action: ChartWindowAction,
): ChartWindowState {
  switch (action.type) {
    case 'new-window':
      return openNewChartWindow(state);
    case 'select-pane':
      return selectChartWindowPane(state, action.paneId);
    case 'claim-toolbar-target':
      return claimChartWindowToolbarTarget(state, action.paneId);
    case 'select-pane-from-tap':
      return selectChartWindowPaneFromTap(state, action.paneId);
    case 'update-active-pane':
      return updateActiveChartWindowContext(state, action.patch);
    case 'update-toolbar-target':
      return updateToolbarTargetChartWindowContext(state, action.patch);
    case 'set-layout':
      return setChartWindowLayout(state, action.layout);
    case 'remove-pane':
      return removeChartWindowPane(state, action.paneId);
    case 'move-pane':
      return moveChartWindowPane(state, action.paneId, action.toIndex);
    default:
      return state;
  }
}
