import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(
  resolve(process.cwd(), 'src/features/history/HistoryScreen.tsx'),
  'utf8',
);

test('History sort sheet prepares its actions before the press-in opener runs', () => {
  const configStart = source.indexOf('const historySortSheetConfig = useMemo');
  const openerStart = source.indexOf('const openHistorySortSheet = useCallback', configStart);
  const triggerStart = source.indexOf('onPress={openHistorySortSheet}', openerStart);
  const triggerEnd = source.indexOf('</FastPressable>', triggerStart);
  const configSource = source.slice(configStart, openerStart);
  const triggerSource = source.slice(triggerStart, triggerEnd);

  assert.notEqual(configStart, -1);
  assert.notEqual(openerStart, -1);
  assert.match(configSource, /title: t\('Sort By'\)/);
  assert.match(configSource, /presentation: 'mt5Plain'/);
  assert.match(configSource, /detent: 'adaptive'/);
  assert.match(configSource, /entryMotion: 'mt5Slide'/);
  assert.match(configSource, /runActionAfterClose: false/);
  assert.match(configSource, /actions: SORT_OPTIONS\.map/);
  assert.match(
    source.slice(openerStart, triggerStart),
    /runImmediateAction\('history\.sortSheet\.open'[\s\S]*showHistoryActionSheet\(historySortSheetConfig\)/,
  );
  assert.match(triggerSource, /activateOnPressIn/);
  assert.doesNotMatch(triggerSource, /activateOnTouchStart/);
  assert.match(triggerSource, /accessibilityLabel=\{t\('Sort By'\)\}/);
  assert.match(triggerSource, /unstable_pressDelay=\{0\}/);
});
