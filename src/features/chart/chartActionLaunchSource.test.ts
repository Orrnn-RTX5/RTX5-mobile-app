import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const chartSource = readSource('src/features/chart/ChartScreen.native.tsx');
const hostSource = readSource('src/features/chart/ChartActionLaunchHost.tsx');
const shellSource = readSource('src/features/chart/ChartActionLaunchShell.tsx');
const rootSource = readSource('app/_layout.tsx');

test('root keeps four lightweight Chart More launch shells mounted above the stack', () => {
  assert.match(rootSource, /import \{ ChartActionLaunchHost \} from/);
  assert.match(
    rootSource,
    /<TradePositionActionHost \/>[\s\S]*<ChartActionLaunchHost \/>[\s\S]*<ChartSettingsHost \/>[\s\S]*<ChartConfigDestinationHost \/>[\s\S]*<SidebarDrawer \/>/,
  );
  assert.match(hostSource, /setNativeProps/);
  assert.match(hostSource, /subscribeAfterVisualFrame/);
  assert.match(hostSource, /registerVisualApplier\([\s\S]*applyVisualDestinationNow/);
  for (const destination of ['objects', 'calculator', 'analytics', 'specification']) {
    assert.match(hostSource, new RegExp(`'${destination}'`));
  }
  assert.match(hostSource, /CHART_ACTION_LAUNCH_DESTINATIONS\.map/);
  assert.match(hostSource, /<ChartActionLaunchShell[\s\S]*destination=\{destination\}/);
  assert.match(shellSource, /ObjectsLaunchBody/);
  assert.match(shellSource, /CalculatorLaunchBody/);
  assert.match(shellSource, /AnalyticsLaunchBody/);
  assert.match(shellSource, /SpecificationLaunchBody/);
  assert.doesNotMatch(shellSource, /useMarketData|useLiveCandles|useInstrumentMeta|useMarketStatus|useMarginCalculation|useProfitCalculation/);
});

test('Chart More route actions reveal on touch-down before deferred route construction', () => {
  assert.match(chartSource, /runActionAfterClose: false[\s\S]*actions: chartMoreActions/);
  for (const label of ['Objects', 'Trading calculator', 'Analytics', 'Specification']) {
    assert.match(
      chartSource,
      new RegExp(`label: t\\('${label}'\\)[\\s\\S]*?activateOnPressIn: true[\\s\\S]*?onPress:`),
    );
  }
  assert.equal(
    (chartSource.match(/deferCloseCommitForVisualHandoff: true/g) ?? []).length,
    4,
  );

  const objectsHandler = chartSource.slice(
    chartSource.indexOf('const handleOpenObjectsScreen'),
    chartSource.indexOf('const handleOpenSignalDetails'),
  );
  assert.match(objectsHandler, /showChartActionLaunch\('objects', chartSymbol\)/);
  assert.match(objectsHandler, /scheduleChartActionLaunchNavigation\(launchRevision/);
  assert.ok(
    objectsHandler.indexOf("showChartActionLaunch('objects', chartSymbol)")
      < objectsHandler.indexOf('requestChartDrawingSyncForObjects(navigateToObjects)'),
  );
  assert.doesNotMatch(objectsHandler, /hideActionSheet\(\)/);

  for (const [handler, destination, pathname] of [
    ['handleOpenChartTradingCalculator', 'calculator', '/chart/calculator'],
    ['handleOpenChartAnalytics', 'analytics', '/chart/analytics'],
    ['handleOpenChartSpecification', 'specification', '/chart/specification'],
  ] as const) {
    const start = chartSource.indexOf(`const ${handler}`);
    const end = chartSource.indexOf('/**', start + 10);
    const source = chartSource.slice(start, end);
    assert.match(source, new RegExp(`showChartActionLaunch\\('${destination}', chartSymbol\\)`));
    assert.match(source, /scheduleChartActionLaunchNavigation\(launchRevision/);
    assert.match(source, new RegExp(`pathname: '${pathname.replaceAll('/', '\\/')}'`));
    assert.match(source, /launchRevision: String\(launchRevision\)/);
    assert.doesNotMatch(source, /hideActionSheet\(\)/);
  }
});

test('real Chart More screens remove only their matching retained cover after native layout', () => {
  for (const [path, destination] of [
    ['src/features/chart/ObjectsScreen/ObjectsScreen.tsx', 'objects'],
    ['src/features/chart/ChartTradingCalculatorScreen.tsx', 'calculator'],
    ['src/features/chart/ChartAnalyticsScreen.tsx', 'analytics'],
    ['src/features/chart/ChartSpecificationScreen.tsx', 'specification'],
  ] as const) {
    const source = readSource(path);
    assert.match(source, /launchRevision\?: string/);
    assert.match(
      source,
      new RegExp(`scheduleChartActionLaunchCovered\\('${destination}', resolvedLaunchRevision\\)`),
    );
    assert.match(source, /<Screen[\s\S]*collapsable=\{false\}[\s\S]*onLayout=\{handleLaunchBodyLayout\}/);
  }
});
