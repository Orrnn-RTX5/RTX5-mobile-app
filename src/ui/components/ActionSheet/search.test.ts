import assert from 'node:assert/strict';
import test from 'node:test';
import { filterActionSheetActions } from './search';

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

test('action sheet search trims whitespace and preserves the full list for a blank query', () => {
  const actions = [
    { label: 'Trend Line' },
    { label: 'Fibonacci Retracement' },
  ];
  const translate = (value: string) => value;

  assert.deepEqual(filterActionSheetActions(actions, '  FIBO  ', translate), [actions[1]]);
  assert.strictEqual(filterActionSheetActions(actions, '   ', translate), actions);
});
