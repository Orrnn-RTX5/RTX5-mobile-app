import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

import {
  CHART_ORDER_TYPES,
  isPendingChartOrderType,
  type ChartOrderType,
} from './chartTradeOrderUtils';
import {
  resolveChartSltpToolbarTapMode,
  shouldShowChartTradePreviewOnChart,
} from './chartTradeInteractionUtils';
import {
  isChartTradePanelBackendLocked,
  MARKET_AND_POSITION_SLTP_CAPABILITIES,
  NO_BROKER_SLTP_CAPABILITIES,
  type TradeBackendCapabilities,
} from '../trade/tradeBackendCapabilities';

const source = readFileSync('src/features/chart/ChartScreen.native.tsx', 'utf8');
const tree = ts.createSourceFile('chart.tsx', source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
let activationCallback = '';
let activationHandlerCallback = '';
let toolbarLockExpression = '';
const visit = (node: ts.Node) => {
  if (
    ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name)
    && node.initializer
  ) {
    if (node.name.text === 'chartSlTpBackendLocked') {
      toolbarLockExpression = node.initializer.getText(tree);
    } else if (ts.isCallExpression(node.initializer)) {
      if (node.name.text === 'activateDirectChartProtection') {
        activationCallback = node.initializer.arguments[0].getText(tree);
      } else if (node.name.text === 'handleActivateDirectChartProtection') {
        activationHandlerCallback = node.initializer.arguments[0].getText(tree);
      }
    }
  }
  ts.forEachChild(node, visit);
};
visit(tree);
assert.ok(activationCallback, 'the native toolbar activation callback must exist');
assert.ok(activationHandlerCallback, 'the native toolbar press handler must exist');
assert.ok(toolbarLockExpression, 'the native toolbar capability state must exist');
const compiledActivation = ts.transpileModule(`
  exports.activate = ${activationCallback};
  exports.handleActivate = ${activationHandlerCallback};
  exports.toolbarLocked = ${toolbarLockExpression};
`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

const createPanel = (
  orderType: ChartOrderType,
  visible: boolean,
  directProtectionActive = false,
  capabilities: TradeBackendCapabilities = {
    pendingOrderPreview: true,
    pendingOrders: false,
    sltp: MARKET_AND_POSITION_SLTP_CAPABILITIES,
  },
  isLoggedIn = true,
) => {
  const resets: Array<{ orderType: ChartOrderType; enableProtectionDrafts: boolean; positionTargetOverride: unknown }> = [];
  const baselines: string[] = [];
  const presentations: Array<{ mode: string; instant: boolean }> = [];
  const exports: {
    activate?: () => void;
    handleActivate?: (confirmation: { paneId: string }) => void;
    toolbarLocked?: boolean;
  } = {};
  const sandbox = {
    exports,
    isLoggedIn,
    hasTradingSession: () => sandbox.isLoggedIn,
    chartTradeOrderType: orderType,
    chartDirectProtectionActive: directProtectionActive,
    chartTradeDisplayQuoteScopeKey: 'broker:account:EURUSD',
    showChartTradeSheet: visible,
    chartTradeSheetMode: visible ? 'collapsed' : 'hidden',
    chartProtectionDraftIdRef: { current: directProtectionActive ? 'existing-market-draft' : null as string | null },
    chartProtectionAwaitingTicketRef: { current: null },
    chartDirectProtectionOwnerPaneIdRef: { current: null },
    footerLotEditorFocused: false,
    isPendingChartOrderType,
    isChartTradePanelBackendLocked: () => isChartTradePanelBackendLocked(capabilities),
    resolveChartSltpToolbarTapMode,
    resolveChartWindowCommandOwnerPaneId: (confirmation: { paneId: string }) => confirmation.paneId,
    runImmediateAction: (_name: string, callback: () => void) => callback(),
    activateDirectChartProtection: () => exports.activate!(),
    snapTradeSheet: (mode: string, instant = false) => {
      presentations.push({ mode, instant });
      sandbox.chartTradeSheetMode = mode;
      sandbox.showChartTradeSheet = mode !== 'hidden';
    },
    setChartTradeOrderType: (next: ChartOrderType) => { sandbox.chartTradeOrderType = next; },
    setChartDirectProtectionActive: (active: boolean) => { sandbox.chartDirectProtectionActive = active; },
    resetChartTradePanelLevels: (next: ChartOrderType, options: typeof resets[number]) => {
      resets.push({ ...options, orderType: next });
    },
    createChartProtectionDraftId: () => 'new-market-draft',
    captureChartProtectionDraftBaseline: (draftId: string) => { baselines.push(draftId); },
    setSelectedChartPositionTicket: () => {},
    setInvalidatedChartPositionSymbol: () => {},
    setChartShowOnChartItem: () => {},
    closeChartTapMenu: () => {},
    setFooterLotPickerMode: () => {},
    finishFooterLotEditor: () => {},
    setFooterLotEditorOpening: () => {},
    Keyboard: { dismiss: () => {} },
    requestAnimationFrame: (callback: () => void) => { callback(); },
  };
  runInNewContext(compiledActivation, sandbox);
  return {
    state: sandbox,
    resets,
    baselines,
    presentations,
    activate: () => exports.activate!(),
    pressToolbar: () => exports.handleActivate!({ paneId: 'chart-pane' }),
    toolbarLocked: exports.toolbarLocked,
    hasGuides: () => shouldShowChartTradePreviewOnChart({
      showChartTradeSheet: sandbox.showChartTradeSheet,
      chartTradeSheetMode: sandbox.chartTradeSheetMode as 'hidden' | 'collapsed' | 'expanded',
      directProtectionActive: sandbox.chartDirectProtectionActive,
    }),
  };
};

test('hiding any pending type clears its guides and reopening starts a fresh Buy Limit', () => {
  for (const orderType of CHART_ORDER_TYPES.filter(isPendingChartOrderType)) {
    const panel = createPanel(orderType, true);
    panel.activate();
    assert.equal(panel.state.showChartTradeSheet, false, orderType);
    assert.equal(panel.hasGuides(), false, orderType);
    assert.equal(panel.resets.length, 0, 'closing must not reseed a hidden draft');

    panel.activate();
    assert.equal(panel.state.chartTradeOrderType, 'Buy Limit', orderType);
    assert.equal(panel.state.chartTradeSheetMode, 'collapsed');
    assert.equal(panel.hasGuides(), true);
    assert.equal(panel.resets.length, 1);
    assert.equal(panel.resets[0].orderType, 'Buy Limit');
    assert.equal(panel.resets[0].enableProtectionDrafts, false);
    assert.equal(panel.resets[0].positionTargetOverride, null);
    assert.equal(panel.state.chartDirectProtectionActive, false);
    assert.equal(panel.state.chartProtectionDraftIdRef.current, null);
    assert.equal(panel.baselines.length, 0, 'pending reopening must not create a market protection draft');
  }
});

test('toolbar appearance and press access agree for pending-only, unavailable, and market-only capabilities', () => {
  const scenarios = [
    { pendingOrderPreview: true, pendingOrders: false, sltp: NO_BROKER_SLTP_CAPABILITIES, locked: false },
    { pendingOrderPreview: false, pendingOrders: false, sltp: NO_BROKER_SLTP_CAPABILITIES, locked: true },
    { pendingOrderPreview: false, pendingOrders: false, sltp: MARKET_AND_POSITION_SLTP_CAPABILITIES, locked: false },
  ];
  for (const { locked, ...capabilities } of scenarios) {
    const panel = createPanel('Market Execution', false, false, capabilities);
    assert.equal(panel.toolbarLocked, locked);
    panel.pressToolbar();
    assert.equal(panel.state.showChartTradeSheet, !locked);
  }
});

test('logged-out users see a locked SL/TP toolbar and cannot open the panel', () => {
  for (const orderType of CHART_ORDER_TYPES) {
    const panel = createPanel(orderType, false, false, undefined, false);
    assert.equal(panel.toolbarLocked, true);
    panel.pressToolbar();
    assert.equal(panel.state.showChartTradeSheet, false);
    assert.equal(panel.state.chartDirectProtectionOwnerPaneIdRef.current, null);
    assert.equal(panel.resets.length, 0);
    assert.equal(panel.presentations.length, 0);
    assert.equal(panel.baselines.length, 0);
  }
});

test('a retained SL/TP callback stops immediately after logout and works again after login', () => {
  const panel = createPanel('Market Execution', false);
  assert.equal(panel.toolbarLocked, false);
  panel.state.isLoggedIn = false;
  panel.pressToolbar();
  assert.equal(panel.presentations.length, 0);
  panel.state.isLoggedIn = true;
  panel.pressToolbar();
  assert.equal(panel.state.showChartTradeSheet, true);
  assert.equal(panel.presentations.length, 1);
});

test('retained SL/TP editing actions do nothing without a current trading session', () => {
  for (const name of ['handleEnableChartTradeStops', 'handleToggleChartTradeStopLevel', 'handleOpenChartTradeStopStepper']) {
    let callback = '';
    const find = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name
        && node.initializer && ts.isCallExpression(node.initializer)) {
        callback = node.initializer.arguments[0].getText(tree);
      }
      ts.forEachChild(node, find);
    };
    find(tree); assert.ok(callback, name);
    const action = runInNewContext(ts.transpileModule(`(${callback})`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText, { hasTradingSession: () => false });
    // No other dependencies are available: reaching an editor, popup, draft
    // setter or transport after logout fails this check.
    assert.doesNotThrow(() => action('sl'));
    assert.doesNotThrow(() => action('tp'));
  }
});

test('hiding and reopening active Market Execution preserves its direct protection draft', () => {
  const panel = createPanel('Market Execution', true, true);
  panel.activate();
  assert.equal(panel.state.showChartTradeSheet, false);
  assert.equal(panel.hasGuides(), true);
  panel.activate();
  assert.equal(panel.state.chartTradeOrderType, 'Market Execution');
  assert.equal(panel.state.chartTradeSheetMode, 'collapsed');
  assert.equal(panel.state.chartProtectionDraftIdRef.current, 'existing-market-draft');
  assert.equal(panel.resets.length, 0);
  assert.equal(panel.baselines.length, 0);
});

test('the initial toolbar open still creates Market Execution protection with no enabled guides', () => {
  const panel = createPanel('Market Execution', false);
  panel.activate();
  assert.equal(panel.state.chartTradeOrderType, 'Market Execution');
  assert.equal(panel.state.chartDirectProtectionActive, true);
  assert.equal(panel.state.chartProtectionDraftIdRef.current, 'new-market-draft');
  assert.deepEqual(panel.baselines, ['new-market-draft']);
  assert.equal(panel.resets.length, 1);
  assert.equal(panel.resets[0].orderType, 'Market Execution');
  assert.equal(panel.resets[0].enableProtectionDrafts, false);
  assert.equal(panel.resets[0].positionTargetOverride, null);
});

test('toolbar presentation opens and hides immediately for market and every pending option', () => {
  for (const type of CHART_ORDER_TYPES) {
    const panel = createPanel(type, false);
    panel.pressToolbar();
    assert.deepEqual(panel.presentations, [{ mode: 'collapsed', instant: true }]);
    panel.pressToolbar();
    assert.deepEqual(panel.presentations, [
      { mode: 'collapsed', instant: true },
      { mode: 'hidden', instant: true },
    ]);
  }
});
