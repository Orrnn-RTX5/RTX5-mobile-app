import assert from 'node:assert/strict';
import test from 'node:test';
import { focusManager } from '@tanstack/react-query';
import { bindNativeQueryFocus } from './nativeQueryFocus';

function source(currentState: string | null) {
  let listener: ((state: string) => void) | undefined;
  let subscriptions = 0;
  let removals = 0;
  return {
    currentState,
    addEventListener: (_event: 'change', callback: (state: string) => void) => {
      listener = callback;
      subscriptions += 1;
      return { remove: () => { removals += 1; } };
    },
    // Keep the callback to exercise a queued native event after disposal.
    emit: (state: string) => listener?.(state),
    counts: () => ({ subscriptions, removals }),
  };
}

test.afterEach(() => focusManager.setFocused(undefined));

test('native background/inactive states pause Query polling and foreground restores it', () => {
  const state = source('active');
  const dispose = bindNativeQueryFocus('android', state, focusManager);
  try {
    assert.equal(focusManager.isFocused(), true);
    state.emit('background');
    assert.equal(focusManager.isFocused(), false);
    state.emit('inactive');
    assert.equal(focusManager.isFocused(), false);
    state.emit('active');
    assert.equal(focusManager.isFocused(), true);
    assert.deepEqual(state.counts(), { subscriptions: 1, removals: 0 });
  } finally { dispose(); }
});

test('background startup is paused immediately and disposed listeners cannot change focus', () => {
  const state = source('background');
  const dispose = bindNativeQueryFocus('ios', state, focusManager);
  assert.equal(focusManager.isFocused(), false);
  dispose();
  dispose();
  assert.equal(focusManager.isFocused(), true);
  state.emit('background');
  assert.equal(focusManager.isFocused(), true);
  assert.deepEqual(state.counts(), { subscriptions: 1, removals: 1 });
});

test('unknown native state does not block initial queries or wake an already hidden app', () => {
  const state = source(null);
  const dispose = bindNativeQueryFocus('android', state, focusManager);
  try {
    assert.equal(focusManager.isFocused(), true);
    state.emit('background');
    state.emit('unknown');
    assert.equal(focusManager.isFocused(), false);
    state.emit('active');
    assert.equal(focusManager.isFocused(), true);
  } finally { dispose(); }
});

test('web preserves its existing visibility manager and adds no native listener', () => {
  focusManager.setFocused(false);
  const state = source('active');
  const dispose = bindNativeQueryFocus('web', state, focusManager);
  assert.equal(focusManager.isFocused(), false);
  state.emit('active');
  dispose();
  assert.equal(focusManager.isFocused(), false);
  assert.deepEqual(state.counts(), { subscriptions: 0, removals: 0 });
});
