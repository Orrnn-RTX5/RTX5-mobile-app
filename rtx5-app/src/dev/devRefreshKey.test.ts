import assert from 'node:assert/strict';
import test from 'node:test';
import { getDevRefreshKey, hashDevRefreshSource } from './devRefreshKey.ts';

test('hashDevRefreshSource changes when the source content changes', () => {
  assert.notEqual(hashDevRefreshSource('alpha'), hashDevRefreshSource('beta'));
});

test('getDevRefreshKey falls back to a stable scope key outside dev runtime', () => {
  const scope = `test-scope-${Date.now()}`;
  const first = getDevRefreshKey(scope, 'sig-a');
  const second = getDevRefreshKey(scope, 'sig-a');
  const third = getDevRefreshKey(scope, 'sig-b');

  assert.equal(first, second);
  assert.equal(second, third);
});
