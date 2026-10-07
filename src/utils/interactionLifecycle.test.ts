import assert from 'node:assert/strict';
import test from 'node:test';
import { bindNativeInteractionLifecycle, createInteractionLifecycle } from './interactionLifecycle';

function nativeSource(initial: string | null = 'active') {
  const listeners = new Map<string, Set<(state?: string) => void>>();
  const retired: Array<(state?: string) => void> = [];
  const source = {
    currentState: initial,
    addEventListener: (event: 'change' | 'blur' | 'focus', listener: (state?: string) => void) => {
      const set = listeners.get(event) ?? new Set();
      listeners.set(event, set); set.add(listener);
      return { remove: () => { set.delete(listener); retired.push(listener); } };
    },
    emit: (event: 'change' | 'blur' | 'focus', state?: string) => {
      if (event === 'change') source.currentState = state ?? null;
      listeners.get(event)?.forEach(listener => listener(state));
    },
    lateEvents: () => retired.forEach(listener => listener('active')),
    get listenerCount() { return Array.from(listeners.values()).reduce((sum, set) => sum + set.size, 0); },
  };
  return source;
}

test('1,000 background/resume cycles reset interactions exactly once per edge without accumulating listeners', () => {
  const lifecycle = createInteractionLifecycle();
  const source = nativeSource();
  const events: string[] = [];
  const unregister = lifecycle.register(phase => { events.push(phase); });
  const dispose = bindNativeInteractionLifecycle('android', source, lifecycle);
  try {
    assert.equal(source.listenerCount, 3);
    for (let index = 0; index < 1_000; index++) {
      source.emit('change', 'inactive'); source.emit('blur'); source.emit('change', 'background');
      assert.equal(lifecycle.isActive(), false);
      source.emit('focus');
      assert.equal(lifecycle.isActive(), false, 'focus must not resume a still-backgrounded app');
      source.emit('change', 'active'); source.emit('focus'); source.emit('change', 'active');
      assert.equal(lifecycle.isActive(), true);
    }
    assert.equal(events.length, 2_000);
    assert.deepEqual(events.slice(0, 4), ['suspend', 'resume', 'suspend', 'resume']);
    assert.equal(source.listenerCount, 3);
    unregister();
    source.emit('blur'); source.emit('focus');
    assert.equal(events.length, 2_000);
  } finally { unregister(); dispose(); }
  assert.equal(source.listenerCount, 0);
  source.lateEvents();
  assert.equal(events.length, 2_000);
});

test('Android blur/focus recovers cancelled gestures even when AppState stays active', () => {
  const lifecycle = createInteractionLifecycle();
  const source = nativeSource();
  const events: string[] = [];
  const unregister = lifecycle.register(phase => { events.push(phase); });
  const dispose = bindNativeInteractionLifecycle('android', source, lifecycle);
  try {
    source.emit('blur'); source.emit('blur'); source.emit('focus'); source.emit('focus');
    assert.deepEqual(events, ['suspend', 'resume']);
    assert.equal(source.currentState, 'active');
  } finally { unregister(); dispose(); }
});

test('an Android native dialog blur resets gestures without disabling foreground dialog buttons', () => {
  const lifecycle = createInteractionLifecycle();
  const source = nativeSource();
  const dispose = bindNativeInteractionLifecycle('android', source, lifecycle);
  const events: string[] = [];
  const unregister = lifecycle.register(phase => { events.push(phase); });
  try {
    source.emit('blur');
    assert.equal(lifecycle.isActive(), false);
    assert.equal(lifecycle.isForeground(), true, 'Activity focus loss does not mean a foreground modal is backgrounded');
    source.emit('change', 'background');
    assert.equal(lifecycle.isForeground(), false);
    assert.deepEqual(events, ['suspend', 'suspend'], 'actual backgrounding must also cancel work begun inside a blurred foreground modal');
    source.emit('change', 'active'); source.emit('focus');
    assert.equal(lifecycle.isForeground(), true);
  } finally { unregister(); dispose(); }
});

test('unknown startup and web do not suppress interactions; background native startup is paused', () => {
  for (const initial of [null, 'unknown']) {
    const lifecycle = createInteractionLifecycle();
    const source = nativeSource(initial);
    const dispose = bindNativeInteractionLifecycle('ios', source, lifecycle);
    assert.equal(lifecycle.isActive(), true);
    dispose(); assert.equal(source.listenerCount, 0);
  }
  const lifecycle = createInteractionLifecycle();
  const source = nativeSource('background');
  const disposeWeb = bindNativeInteractionLifecycle('web', source, lifecycle);
  assert.equal(lifecycle.isActive(), true); assert.equal(source.listenerCount, 0); disposeWeb();
  const disposeNative = bindNativeInteractionLifecycle('ios', source, lifecycle);
  assert.equal(lifecycle.isActive(), false);
  disposeNative(); source.lateEvents();
  assert.equal(lifecycle.isActive(), false, 'disposed native listeners cannot revive a paused controller');
});

test('one failed recovery handler cannot prevent other menus/buttons recovering', () => {
  const lifecycle = createInteractionLifecycle();
  const originalError = console.error;
  let errors = 0;
  console.error = () => { errors++; };
  const events: string[] = [];
  lifecycle.register(() => { throw new Error('unmounted native host'); });
  lifecycle.register(phase => { events.push(phase); });
  try {
    lifecycle.setActive(false); lifecycle.setActive(true);
    assert.deepEqual(events, ['suspend', 'resume']); assert.equal(errors, 2);
  } finally { console.error = originalError; }
});
