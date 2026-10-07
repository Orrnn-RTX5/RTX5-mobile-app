import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createInteractionLifecycle } from '../../utils/interactionLifecycle';

function mountButton(activateOnTouchStart: boolean) {
  const lifecycle = createInteractionLifecycle();
  const cleanups: Array<() => void> = [];
  let presses = 0;
  const react = {
    useRef: (current: unknown) => ({ current }),
    useEffect: (effect: () => (() => void) | undefined) => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); },
    createElement: (_type: unknown, props: unknown) => props,
  };
  const exports: Record<string, (props: object) => Record<string, (event: object) => void>> = {};
  runInNewContext(ts.transpileModule(readFileSync('src/ui/components/FastPressable.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 },
  }).outputText, {
    exports, setTimeout, clearTimeout,
    require: (name: string) => {
      if (name === 'react') return { default: react, memo: (component: unknown) => component, useCallback: (callback: unknown) => callback };
      if (name === 'react-native') return { Pressable: 'Pressable' };
      if (name.endsWith('interactionLifecycle')) return { interactionLifecycle: lifecycle, registerInteractionLifecycleHandler: lifecycle.register };
      if (name.endsWith('actionLatency')) return { getInteractionNow: () => 0, FAST_PRESS_GUARD_RESET_MS: 10, scheduleActionLatencyCheck() {} };
      return { recordAppActionJournalEvent() {} };
    },
  });
  const button = exports.FastPressable({ onPress: () => { presses++; }, activateOnTouchStart, activateOnPressIn: !activateOnTouchStart });
  return { button, lifecycle, get presses() { return presses; }, unmount: () => cleanups.splice(0).forEach(cleanup => cleanup()) };
}

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
