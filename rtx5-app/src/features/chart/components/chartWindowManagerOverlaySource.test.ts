import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(
  resolve(process.cwd(), 'src/features/chart/components/ChartWindowManagerOverlay.tsx'),
  'utf8',
);

test('chart window manager exposes the complete controlled integration contract', () => {
  for (const prop of [
    'visible',
    'panes',
    'selectedRemovalIds',
    'canOpen',
    'maxReached',
    'onClose',
    'onNewWindow',
    'onToggleRemoval',
    'onRemove',
    'onSetHorizontal',
    'onSetVertical',
    'onMovePane',
  ]) {
    assert.match(source, new RegExp(`\\b${prop}\\b`));
  }
});

test('chart window manager mirrors the MT5 actions and two-pane row controls', () => {
  assert.match(source, />Charts<\/Text>/);
  assert.match(source, />\s*New Window\s*<\/Text>/);
  assert.match(source, />Tile Horizontally<\/Text>/);
  assert.match(source, />Tile Vertically<\/Text>/);
  assert.match(source, />\s*Remove\s*<\/Text>/);
  assert.match(source, /accessibilityRole="checkbox"/);
  assert.match(source, /name="reorder-three-outline"/);
  assert.match(source, /disabled=\{!newWindowEnabled\}/);
  assert.match(source, /disabled=\{!removeEnabled\}/);
});

test('overlay uses current theme, fast-touch actions, backdrop close, and Android back close', () => {
  assert.match(source, /FastPressable as Pressable/);
  assert.match(source, /useTheme\(\{ active: visible \}\)/);
  assert.match(source, /if \(!visible\) \{\s*return null;/);
  assert.match(source, /BackHandler\.addEventListener\('hardwareBackPress'/);
  assert.match(source, /testID="chart-window-manager-backdrop"[\s\S]*onPress=\{onClose\}/);
  assert.match(source, /accessibilityViewIsModal/);
});
