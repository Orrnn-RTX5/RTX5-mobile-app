import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const chartDirectory = path.resolve(__dirname);
const screenSource = readFileSync(
  path.join(chartDirectory, 'ChartScreen.native.tsx'),
  'utf8',
);
const controllerSource = readFileSync(
  path.join(chartDirectory, 'useChartWindowsFeature.ts'),
  'utf8',
);
const layoutSource = readFileSync(
  path.join(chartDirectory, 'components', 'ChartWindowsLayout.tsx'),
  'utf8',
);

test('auxiliary symbol taps activate their pane before opening the existing picker', () => {
  assert.match(
    layoutSource,
    /onOpenPaneSymbolPicker\?: \(paneId: string\) => void/,
  );
  assert.match(
    layoutSource,
    /onSymbolPress=\{\(\) => onOpenPaneSymbolPicker\?\.\(auxiliaryPane\.id\)\}/,
  );
  assert.match(
    screenSource,
    /onOpenPaneSymbolPicker=\{handleOpenChartWindowPaneSymbolPicker\}/,
  );

  const handlerStart = screenSource.indexOf(
    'const handleOpenChartWindowPaneSymbolPicker = useCallback',
  );
  const handlerEnd = screenSource.indexOf(
    'const handleOpenTimeframePicker = useCallback',
    handlerStart,
  );
  assert.notEqual(handlerStart, -1);
  assert.notEqual(handlerEnd, -1);
  const handlerSource = screenSource.slice(handlerStart, handlerEnd);
  assert.match(
    handlerSource,
    /chartWindows\.selectPaneFromTap\(paneId, \(confirmedPane\) => \{[\s\S]*confirmedPane\.id !== paneId[\s\S]*confirmedPane\.symbol !== chartSymbol[\s\S]*confirmedPane\.timeframe !== chartTimeframe[\s\S]*confirmedPaneSymbolPickerRef\.current\(\)/,
    'the picker must wait for pane-selection confirmation',
  );
  assert.match(
    screenSource,
    /confirmedPaneSymbolPickerRef\.current = openSymbolPickerForActivePane/,
    'confirmation must read the latest picker config after the context render',
  );
});

test('pane-selection confirmation is transactional and discarded on cancellation', () => {
  assert.match(
    controllerSource,
    /selectPane: \([\s\S]*paneId: string,[\s\S]*onSelectionConfirmed\?: \([\s\S]*pane: ChartWindowPane,[\s\S]*confirmedContext: ChartWindowContextSnapshot,[\s\S]*\) => void,[\s\S]*\) => void/,
  );
  assert.match(
    controllerSource,
    /pendingTransitionRef\.current = \{[\s\S]*kind: 'select-pane'[\s\S]*targetPane: pane,[\s\S]*onSelectionConfirmed/,
  );
  assert.match(
    controllerSource,
    /if \(targetConfirmed\)[\s\S]*commitState\(selectChartWindowPane\([\s\S]*pendingTransition\.onSelectionConfirmed\?\.\([\s\S]*pendingTransition\.targetPane,[\s\S]*\{ symbol, timeframe \}/,
    'the callback may run only after the target symbol and timeframe are confirmed',
  );
  assert.match(
    controllerSource,
    /const cancelPendingTransition = useCallback\(\(\) => \{\s*toolbarConfirmationRevisionRef\.current \+= 1;\s*pendingTransitionRef\.current = null;\s*onCancelPendingContextRef\.current\(\)/,
    'blur or a superseding interaction must discard the pending picker open',
  );
});
