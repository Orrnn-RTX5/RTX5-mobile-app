import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(
  resolve(process.cwd(), 'src/features/chart/useChartWindowToolbarRouter.ts'),
  'utf8',
);
const screenSource = readFileSync(
  resolve(process.cwd(), 'src/features/chart/ChartScreen.native.tsx'),
  'utf8',
);

test('shared chart toolbar enumerates every pane-routed command', () => {
  for (const command of ['crosshair', 'timeframe', 'sltp', 'drawings', 'settings', 'more']) {
    assert.match(source, new RegExp(`'${command}'`));
  }
});

test('confirmed pane handoff executes the latest handler instead of a stale closure', () => {
  assert.match(source, /const handlersRef = useRef\(handlers\)/);
  assert.match(source, /handlersRef\.current = handlers/);
  assert.match(
    source,
    /runOnToolbarTarget\(\(confirmation\) => \{[\s\S]*handlersRef\.current\[action\]\(confirmation\)/,
  );
  assert.match(source, /mode: 'all' \| 'pane'/);
  assert.match(source, /targetPaneIds: readonly string\[\]/);
});

test('every shared top-toolbar control routes through confirmed window ownership', () => {
  const toolbarSource = screenSource.slice(
    screenSource.indexOf('const renderCompactHeaderToolbar'),
    screenSource.indexOf('const renderChartTradeSheetTopHeader'),
  );
  for (const command of ['crosshair', 'timeframe', 'sltp', 'drawings', 'more']) {
    assert.match(
      toolbarSource,
      new RegExp(`routeChartWindowToolbarAction\\('${command}'\\)`),
    );
  }
  assert.match(
    screenSource,
    /useChartWindowToolbarRouter\([\s\S]*chartWindows\.runOnToolbarTarget/,
  );
});

test('timeframe broadcasts before selection and fullscreen isolates after selection', () => {
  assert.match(
    screenSource,
    /const chartMoreActions = useMemo\([\s\S]*label: t\(isChartExpanded \? 'Exit fullscreen' : 'Fullscreen'\)[\s\S]*hideChartActionSheet\(\);\s*handleToggleChartExpanded\(\);/,
  );
  assert.doesNotMatch(screenSource, /accessibilityLabel="Toggle Fullscreen"/);
  assert.match(
    screenSource,
    /chartWindows\.toolbarTargetPaneId === null[\s\S]*chartWindows\.state\.panes[\s\S]*chartWindows\.updateToolbarTargetContext\(\{ timeframe: nextTimeframe \}\)/,
  );
  assert.match(
    screenSource,
    /showOnlyActivePane=\{[\s\S]*isChartExpanded && chartWindows\.toolbarTargetPaneId !== null/,
  );
});

test('pane-scoped SL/TP and drawing modes retain the confirmed owner only', () => {
  assert.match(
    screenSource,
    /const handleActivateDirectChartProtection = useCallback\(\([\s\S]*confirmation: ChartWindowToolbarTargetConfirmation[\s\S]*chartDirectProtectionOwnerPaneIdRef\.current =[\s\S]*resolveChartWindowCommandOwnerPaneId\(confirmation\)[\s\S]*runImmediateAction\('chart\.sltp\.direct'/,
  );
  assert.match(
    screenSource,
    /const handleOpenDrawingTools = useCallback\(\([\s\S]*confirmation: ChartWindowToolbarTargetConfirmation[\s\S]*chartDrawingToolOwnerPaneIdRef\.current =[\s\S]*resolveChartWindowCommandOwnerPaneId\(confirmation\)[\s\S]*runImmediateAction\('chart\.drawingTools\.open'/,
  );
  assert.match(
    screenSource,
    /useChartWindowToolbarRouter\([\s\S]*sltp: handleActivateDirectChartProtection[\s\S]*drawings: handleOpenDrawingTools/,
  );
  assert.match(
    screenSource,
    /shouldReleaseChartWindowOwnedAction\(protectionOwnerPaneId, activePaneId\)[\s\S]*clearChartDirectProtectionDraft\(\)/,
  );
  assert.match(
    screenSource,
    /shouldReleaseChartWindowOwnedAction\(drawingOwnerPaneId, activePaneId\)[\s\S]*setActiveTool\(CHART_NO_DRAWING_TOOL\)/,
  );
});
