import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import type { ChartWindowVisualPreferences } from './chartWindowVisualPreferences';
import {
  reconcileChartWindowVisualPreferences,
  syncChartWindowVisualPreferences,
} from './chartWindowVisualPreferences';

const createPreferences = (
  showGrid: boolean,
  chartVisualType: ChartWindowVisualPreferences['chartVisualType'] = 'candles',
): ChartWindowVisualPreferences => ({
  chartVisualType,
  chartColors: {
    background: '#000000',
    foreground: '#ffffff',
    grid: '#333333',
    candlesUptrend: '#00ff00',
    candlesDowntrend: '#ff0000',
    hollowBody: '#000000',
    barsUptrend: '#00ff00',
    barsDowntrend: '#ff0000',
    lineBody: '#00ff00',
  },
  chartColorScheme: 'green_on_black',
  chartDisplay: {
    showTicker: true,
    showOHLC: true,
    showQuickTradingButtons: true,
    showLivePriceLine: true,
    showBidPriceLine: true,
    showAskPriceLine: false,
    showLastPriceLine: false,
    showGrid,
    periodSeparators: false,
    showTickVolumes: false,
    showRealVolumes: false,
    showObjectDescriptions: true,
    showTradeLevels: true,
    showTradeHistory: true,
    movableSymbolHeader: false,
  },
  chartViewportShowVolumePane: false,
  chartViewportShowDrawingToolbar: false,
  chartOneClickPanelAtBottom: false,
  chartVerticalScrollingLocked: false,
  chartAutoScaleEnabled: true,
  chartLockAll: false,
  chartHideAll: false,
  chartShowOnChart: { buyTrade: true, sellTrade: true, slTpLevels: true },
  priceSource: 'bid',
});

test('untouched visual changes broadcast to both divided panes', () => {
  const initial = createPreferences(true);
  const split = reconcileChartWindowVisualPreferences(
    {},
    ['chart-window-1', 'chart-window-2'],
    initial,
  );
  const updated = syncChartWindowVisualPreferences(
    split,
    ['chart-window-1', 'chart-window-2'],
    null,
    createPreferences(false, 'line'),
  );

  assert.equal(updated['chart-window-1'].chartDisplay.showGrid, false);
  assert.equal(updated['chart-window-2'].chartDisplay.showGrid, false);
  assert.equal(updated['chart-window-1'].chartVisualType, 'line');
  assert.equal(updated['chart-window-2'].chartVisualType, 'line');
});

test('confirmed visual changes update only the selected pane snapshot', () => {
  const initial = createPreferences(true);
  const split = reconcileChartWindowVisualPreferences(
    {},
    ['chart-window-1', 'chart-window-2'],
    initial,
  );
  const updated = syncChartWindowVisualPreferences(
    split,
    ['chart-window-1', 'chart-window-2'],
    'chart-window-1',
    createPreferences(false, 'line'),
  );

  assert.equal(updated['chart-window-1'].chartDisplay.showGrid, false);
  assert.equal(updated['chart-window-1'].chartVisualType, 'line');
  assert.equal(updated['chart-window-2'].chartDisplay.showGrid, true);
  assert.equal(updated['chart-window-2'].chartVisualType, 'candles');
});

test('reconciliation removes closed panes and seeds only new panes', () => {
  const initial = createPreferences(true);
  const first = reconcileChartWindowVisualPreferences(
    {},
    ['chart-window-1'],
    initial,
  );
  const split = reconcileChartWindowVisualPreferences(
    first,
    ['chart-window-1', 'chart-window-2'],
    createPreferences(false),
  );
  const closed = reconcileChartWindowVisualPreferences(
    split,
    ['chart-window-2'],
    createPreferences(false),
  );

  assert.equal(split['chart-window-1'].chartDisplay.showGrid, true);
  assert.equal(split['chart-window-2'].chartDisplay.showGrid, false);
  assert.deepEqual(Object.keys(closed), ['chart-window-2']);
});

test('native split layout restores the active snapshot and overrides the auxiliary pane', () => {
  const hookSource = readFileSync(
    resolve(process.cwd(), 'src/features/chart/useChartWindowVisualPreferences.ts'),
    'utf8',
  );
  const screenSource = readFileSync(
    resolve(process.cwd(), 'src/features/chart/ChartScreen.native.tsx'),
    'utf8',
  );
  const layoutSource = readFileSync(
    resolve(process.cwd(), 'src/features/chart/components/ChartWindowsLayout.tsx'),
    'utf8',
  );
  const paneSource = readFileSync(
    resolve(process.cwd(), 'src/features/chart/components/AuxiliaryChartPane.tsx'),
    'utf8',
  );

  assert.match(
    hookSource,
    /activePaneChanged[\s\S]*activePreferences[\s\S]*applyChartWindowVisualPreferences\(activePreferences\)/,
  );
  assert.match(
    hookSource,
    /syncChartWindowVisualPreferences\([\s\S]*state\.toolbarTargetPaneId,[\s\S]*currentPreferences/,
  );
  assert.match(
    screenSource,
    /useChartWindowVisualPreferences\(chartWindows\.state\)[\s\S]*visualPreferencesByPane=\{chartWindowVisualPreferences\}/,
  );
  assert.match(layoutSource, /visualPreferences=\{auxiliaryVisualPreferences\}/);
  assert.match(paneSource, /visualPreferences \?\? globalVisualPreferences/);
});
