import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

test('History clock opens its retained filter host on touch-down (chart-options class)', () => {
  const source = readSource('src/features/history/HistoryScreen.tsx');
  const hostSource = readSource('src/features/history/HistoryFilterHost.tsx');
  const controllerSource = readSource(
    'src/features/history/historyFilterHostController.ts',
  );
  const rootSource = readSource('app/_layout.tsx');
  const clockStart = source.indexOf('latencyLabel="history.range.open"');
  const clockSource = source.slice(
    Math.max(0, clockStart - 240),
    clockStart + 240,
  );

  assert.notEqual(clockStart, -1);
  assert.match(
    source,
    /const openHistoryFilter = useCallback\(\(\) => \{[\s\S]*runImmediateAction\('history\.filter\.open'[\s\S]*showHistoryFilterHost\(\);/,
  );
  assert.doesNotMatch(
    source.slice(
      source.indexOf('const openHistoryFilter'),
      source.indexOf('const { historyRange'),
    ),
    /router\.push\(['"]\/history\/filter['"]\)/,
  );
  assert.match(clockSource, /onPress=\{openHistoryFilter\}/);
  assert.match(clockSource, /activateOnPressIn/);
  assert.match(clockSource, /activateOnTouchStart/);
  assert.match(clockSource, /unstable_pressDelay=\{0\}/);
  assert.match(
    hostSource,
    /HistoryFilterScreen[\s\S]*hosted[\s\S]*onHostedBack=\{closeHost\}/,
  );
  assert.match(hostSource, /setNativeProps/);
  assert.match(controllerSource, /export function showHistoryFilterHost/);
  assert.match(controllerSource, /visualApplier\?\.\(true\)/);
  assert.match(rootSource, /import \{ HistoryFilterHost \} from/);
  assert.match(rootSource, /<HistoryFilterHost \/>/);
});

test('History filter backs on touch-down via hosted hide (no stack pop lag)', () => {
  const rootSource = readSource('app/_layout.tsx');
  const filterSource = readSource(
    'src/features/history/HistoryFilterScreen/HistoryFilterScreen.tsx',
  );

  assert.match(
    rootSource,
    /const historyFilterScreenOptions = \{[\s\S]*headerShown: false,[\s\S]*animation: 'none',[\s\S]*presentation: 'containedTransparentModal',[\s\S]*gestureEnabled: false,[\s\S]*contentStyle: \{ backgroundColor: T\.bg \},[\s\S]*\} as const;/,
  );
  assert.match(
    rootSource,
    /name='history\/filter' options=\{historyFilterScreenOptions\}/,
  );
  assert.match(
    filterSource,
    /onPress=\{handleBack\}[\s\S]*activateOnPressIn[\s\S]*activateOnTouchStart[\s\S]*unstable_pressDelay=\{0\}[\s\S]*latencyLabel="history\.filter\.back"/,
  );
  assert.match(
    filterSource,
    /const handleBack = useCallback\(\(\) => \{[\s\S]*if \(hosted && onHostedBack\) \{[\s\S]*onHostedBack\(\);/,
  );
});

test('History filter keeps accessible selections and prevents future dates', () => {
  const filterSource = readSource(
    'src/features/history/HistoryFilterScreen/HistoryFilterScreen.tsx',
  );

  assert.match(filterSource, /PRESETS\.map/);
  assert.match(
    filterSource,
    /accessibilityRole="radio"[\s\S]*accessibilityState=\{\{ checked: selected \}\}/,
  );
  assert.match(filterSource, /const isFuture = key > today/);
  assert.match(filterSource, /disabled=\{isFuture\}/);
  assert.match(
    filterSource,
    /accessibilityState=\{\{\s*disabled: isFuture,\s*selected,\s*\}\}/,
  );
  assert.match(filterSource, /disabled=\{!canNavigateNextMonth\}/);
  assert.match(filterSource, /disabled=\{!customSelectionReady\}/);
  assert.match(filterSource, /onPress=\{applyCustomRange\}/);
  assert.match(filterSource, /selectionFields[\s\S]*Start date[\s\S]*End date/);
});
