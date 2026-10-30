import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { actionSheetActionKey, filterActionSheetActions, searchableActionListKey } from './search';

test('action sheet search matches raw, localized, and subtitle text', () => {
  const actions = [
    { label: 'Horizontal Line' },
    { label: 'Fibonacci Retracement' },
    { label: 'EURUSD', subtitle: 'Euro vs US Dollar' },
  ];
  const translate = (value: string) => (
    value === 'Horizontal Line' ? 'Línea horizontal' : value
  );

  assert.deepEqual(filterActionSheetActions(actions, 'fibo', translate), [actions[1]]);
  assert.deepEqual(filterActionSheetActions(actions, 'LÍNEA', translate), [actions[0]]);
  assert.deepEqual(filterActionSheetActions(actions, 'euro', translate), [actions[2]]);
});

test('country identity survives filtering while deferred search frames reset on each query', () => {
  const india = { key: 'IN', label: 'India' };
  assert.equal(actionSheetActionKey(india, 100), actionSheetActionKey(india, 0));
  assert.notEqual(searchableActionListKey(undefined, true, ''), searchableActionListKey(undefined, true, 'ind'));
  assert.notEqual(searchableActionListKey(undefined, true, 'ind'), searchableActionListKey(undefined, true, '29'));
  assert.equal(searchableActionListKey('tools', false, ''), searchableActionListKey('tools', false, 'ind'));
  assert.equal(actionSheetActionKey({ label: 'Trend Line' }, 2), 'Trend Line-2');
});

test('search resets committed list offsets and preserves the keyboard when the input is in its header', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/ui/components/ActionSheet/ActionSheet.tsx'), 'utf8');
  assert.match(source, /searchableActionListKey\(activeVisualKey, activeSearchable && !scrollSheetChrome, query\)/);
  assert.match(source, /data=\{filteredActions\}\s+extraData=\{query\}/);
  assert.match(source, /useLayoutEffect\(\(\) => \{[\s\S]*?scrollToOffset\(\{ offset: 0, animated: false \}\);[\s\S]*?\}, \[query, visible, activeSearchable, activeDeferOffscreenActions\]\)/);
});

test('action sheet search trims whitespace and preserves the full list for a blank query', () => {
  const actions = [
    { label: 'Trend Line' },
    { label: 'Fibonacci Retracement' },
  ];
  const translate = (value: string) => value;

  assert.deepEqual(filterActionSheetActions(actions, '  FIBO  ', translate), [actions[1]]);
  assert.strictEqual(filterActionSheetActions(actions, '   ', translate), actions);
});
