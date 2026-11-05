import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createInteractionLifecycle } from '../../utils/interactionLifecycle';

function mountButton(activateOnTouchStart: boolean, activateOnPressIn = !activateOnTouchStart, manualTimers = false) {
  const lifecycle = createInteractionLifecycle();
  const cleanups: Array<() => void> = [];
  let presses = 0, refIndex = 0, mounted = false;
  const refs: { current: unknown }[] = [];
  const timers = new Map<number, () => void>();
  let nextTimer = 0;
  const react = {
    useRef: (current: unknown) => refs[refIndex++] ?? (refs[refIndex - 1] = { current }),
    useEffect: (effect: () => (() => void) | undefined) => { if (mounted) return; const cleanup = effect(); if (cleanup) cleanups.push(cleanup); },
    createElement: (_type: unknown, props: unknown) => props,
  };
  const exports: Record<string, (props: object) => Record<string, (event: object) => void>> = {};
  runInNewContext(ts.transpileModule(readFileSync('src/ui/components/FastPressable.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 },
  }).outputText, {
    exports,
    setTimeout: manualTimers ? (callback: () => void) => { const id = ++nextTimer; timers.set(id, callback); return id; } : setTimeout,
    clearTimeout: manualTimers ? (id: number) => { timers.delete(id); } : clearTimeout,
    require: (name: string) => {
      if (name === 'react') return { default: react, memo: (component: unknown) => component, useCallback: (callback: unknown) => callback };
      if (name === 'react-native') return { Pressable: 'Pressable' };
      if (name.endsWith('interactionLifecycle')) return { interactionLifecycle: lifecycle, registerInteractionLifecycleHandler: lifecycle.register };
      if (name.endsWith('actionLatency')) return { getInteractionNow: () => 0, FAST_PRESS_GUARD_RESET_MS: 10, scheduleActionLatencyCheck() {} };
      return { recordAppActionJournalEvent() {} };
    },
  });
  let props: Record<string, unknown> = { onPress: () => { presses++; }, activateOnTouchStart, activateOnPressIn };
  let button: Record<string, (event: object) => void>;
  const rerender = (patch: Record<string, unknown> = {}) => {
    props = { ...props, ...patch }; refIndex = 0;
    button = exports.FastPressable(props); mounted = true;
  };
  rerender();
  return { get button() { return button; }, rerender, lifecycle, get presses() { return presses; },
    flushTimers: () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(callback => callback()); },
    unmount: () => cleanups.splice(0).forEach(cleanup => cleanup()) };
}

for (const pressInFirst of [true, false]) {
  test(`${pressInFirst ? 'native press-in before raw touch-start' : 'raw touch-start before press-in'} submits once per gesture across rerenders`, () => {
    const host = mountButton(true, true, true);
    let submits = 0;
    const event = { nativeEvent: { touches: [] } };
    const first = pressInFirst ? 'onPressIn' : 'onTouchStart';
    const second = pressInFirst ? 'onTouchStart' : 'onPressIn';
    try {
      for (let tap = 1; tap <= 10; tap++) {
        host.rerender({ onPress: () => { submits++; } });
        host.button[first](event);
        assert.equal(submits, tap, 'the first callback must submit immediately');
        // Starting a trade updates parent state between native event delivery.
        host.rerender({ onPress: () => { submits++; } });
        host.button[second](event);
        assert.equal(submits, tap, 'the second callback belongs to the same physical tap');
        host.button.onPress(event);
        host.button.onTouchEnd(event);
        host.button.onPressOut(event);
        assert.equal(submits, tap, 'native release must not create another order');
      }
    } finally { host.unmount(); }
  });
}

test('native press-in begins a new gesture immediately after a cancelled touch without waiting for guard cleanup', () => {
  const host = mountButton(true, true, true);
  const event = { nativeEvent: { touches: [] } };
  try {
    for (let tap = 1; tap <= 10; tap++) {
      host.button.onPressIn(event); host.button.onTouchStart(event);
      assert.equal(host.presses, tap);
      host.button.onTouchCancel(event);
      // Cancellation may omit onPress; the next gesture still fires immediately.
    }
  } finally { host.unmount(); }
});

test('leaving and reentering a held button cannot submit the same touch again after guard timeout', () => {
  const host = mountButton(true, true, true);
  const event = { nativeEvent: { touches: [] } };
  try {
    host.button.onTouchStart(event); host.button.onPressIn(event);
    host.button.onPressOut(event);
    host.flushTimers();
    host.button.onPressIn(event);
    host.button.onPress(event); host.button.onTouchEnd(event);
    assert.equal(host.presses, 1, 'press-out/reentry is not a new physical touch');
    host.button.onPressIn(event); host.button.onTouchStart(event);
    host.button.onPress(event); host.button.onTouchEnd(event);
    assert.equal(host.presses, 2, 'a separate new touch must remain immediate');
  } finally { host.unmount(); }
});

test('mouse, keyboard and accessibility activations remain independent without raw touch events', () => {
  const host = mountButton(true, true, true);
  try {
    for (const type of ['mousedown', 'keydown']) {
      for (let click = 0; click < 10; click++) {
        const before = host.presses;
        const event = { nativeEvent: { type } };
        host.button.onPressIn(event); host.button.onPressOut(event); host.button.onPress(event);
        assert.equal(host.presses, before + 1);
      }
    }
    const mouse = { nativeEvent: { type: 'mousedown' } };
    host.button.onPressIn(mouse); host.button.onPressOut(mouse);
    host.flushTimers(); // A cancelled mouse gesture has no raw touch-end callback.
    const beforeNext = host.presses;
    host.button.onPressIn(mouse); host.button.onPress(mouse);
    assert.equal(host.presses, beforeNext + 1);
    const accessible = { nativeEvent: {} };
    host.button.onPress(accessible); host.button.onPress(accessible);
    assert.equal(host.presses, beforeNext + 3);
  } finally { host.unmount(); }
});

test('market trade buttons submit on touch-down exactly once per tap without waiting for a timer', () => {
  const host = mountButton(true, true);
  const event = { nativeEvent: {} };
  try {
    for (let tap = 1; tap <= 50; tap++) {
      host.button.onTouchStart(event);
      assert.equal(host.presses, tap);
      host.button.onPressIn(event);
      host.button.onPressOut(event);
      host.button.onPress(event);
      assert.equal(host.presses, tap, 'press-in and release must not duplicate the same trade');
    }
  } finally { host.unmount(); }
});

test('10 rapid gestures start 10 unsettled actions while same-gesture callbacks stay deduplicated', async () => {
  const host = mountButton(true, true);
  const requests: Promise<number>[] = [];
  const resolveRequests: Array<(value: number) => void> = [];
  const event = { nativeEvent: { touches: [] } };
  try {
    host.rerender({ onPress: () => {
      requests.push(new Promise(resolve => resolveRequests.push(resolve)));
    } });
    for (let tap = 1; tap <= 10; tap++) {
      host.button.onTouchStart(event);
      host.button.onTouchStart(event);
      host.button.onPressIn(event);
      host.button.onTouchEnd(event);
      host.button.onPressOut(event);
      host.button.onPress(event);
      assert.equal(requests.length, tap, 'each new gesture submits once even before previous actions settle');
    }
    for (let index = 9; index >= 0; index--) resolveRequests[index](index + 1);
    assert.deepEqual(await Promise.all(requests), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  } finally { host.unmount(); }
});

for (const touchStart of [false, true]) {
  test(`an interrupted ${touchStart ? 'touch-start' : 'press-in'} gesture cannot swallow the first tap after resume`, () => {
    const host = mountButton(touchStart);
    const down = touchStart ? host.button.onTouchStart : host.button.onPressIn;
    const event = { nativeEvent: {} };
    try {
      for (let cycle = 0; cycle < 100; cycle++) {
        down(event);
        assert.equal(host.presses, cycle * 2 + 1);
        // The OS cancels the touch: no release/press-out event arrives.
        host.lifecycle.setActive(false);
        down(event);
        assert.equal(host.presses, cycle * 2 + 1, 'background callbacks must not execute actions');
        host.lifecycle.setActive(true);
        down(event);
        host.button.onPressOut(event); host.button.onPress(event);
        assert.equal(host.presses, cycle * 2 + 2, 'the first foreground tap fires exactly once');
      }
      host.button.onPress(event);
      assert.equal(host.presses, 201, 'accessibility clicks without touch-down remain available');
    } finally { host.unmount(); }
  });
}


for (const release of ['onTouchEnd', 'onTouchCancel']) {
  test(`a trade disabled during touch-down accepts the next gesture immediately after ${release}`, () => {
    const host = mountButton(true, true);
    const event = { nativeEvent: { touches: [] } };
    try {
      for (let tap = 1; tap <= 50; tap++) {
        host.button.onTouchStart(event);
        assert.equal(host.presses, tap, 'each new physical touch starts exactly once');
        host.button.onTouchStart(event);
        assert.equal(host.presses, tap, 'duplicate touch-start delivery must not submit twice');
        host.rerender({ disabled: true });
        // Native Pressability can omit onPressIn/out/press after disabling.
        host.button[release](event);
        host.rerender({ disabled: false });
      }
      host.button.onTouchStart(event);
      host.button.onPressIn(event);
      host.button.onTouchEnd(event);
      host.button.onPressOut(event);
      host.button.onPress(event);
      assert.equal(host.presses, 51, 'normal press callbacks still cannot duplicate a touch-down submission');
    } finally { host.unmount(); }
  });
}

test('raw touch completion preserves caller callbacks and blocks disabled submissions', () => {
  const host = mountButton(true, true);
  let ends = 0, cancels = 0;
  const event = { nativeEvent: { touches: [] } };
  try {
    host.rerender({ disabled: true, onTouchEnd: () => { ends++; }, onTouchCancel: () => { cancels++; } });
    host.button.onTouchStart(event); host.button.onTouchEnd(event);
    host.button.onTouchStart(event); host.button.onTouchCancel(event);
    assert.equal(host.presses, 0); assert.equal(ends, 1); assert.equal(cancels, 1);
    host.rerender({ disabled: false }); host.button.onTouchStart(event);
    assert.equal(host.presses, 1);
  } finally { host.unmount(); }
});

test('3rd and subsequent rapid taps inside ScrollView never drop when onTouchEnd precedes onPressIn or onPressOut omits onTouchEnd', () => {
  const host = mountButton(true, true, true);
  const event = { nativeEvent: { touches: [] } };
  try {
    for (let tap = 1; tap <= 20; tap++) {
      host.button.onTouchStart(event);
      assert.equal(host.presses, tap, `tap ${tap} must fire immediately on touch-down`);
      if (tap % 2 === 1) {
        // ScrollView responder negotiation can deliver onTouchEnd before delayed onPressIn.
        host.button.onTouchEnd(event);
        host.button.onPressIn(event);
        host.button.onPressOut(event);
      } else {
        // Or Pressability can emit onPressIn -> onPressOut without raw onTouchEnd/onPress.
        host.button.onPressIn(event);
        host.button.onPressOut(event);
      }
    }
  } finally { host.unmount(); }
});
