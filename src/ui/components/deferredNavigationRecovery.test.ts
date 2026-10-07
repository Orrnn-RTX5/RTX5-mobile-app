import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { scheduleAfterVisualFrame, scheduleAfterVisualFrames } from '../../utils/afterVisualFrame';

const fragment = (file: string, start: string, end: string) => {
  const source = readFileSync(resolve(process.cwd(), file), 'utf8');
  const from = source.indexOf(start);
  const until = source.indexOf(end, from);
  assert.ok(from >= 0 && until > from);
  return source.slice(from, until);
};
const evaluate = (source: string, context: Record<string, unknown>) => runInNewContext(ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText, context);

test('deferred route mount becomes ready after an interrupted paint and cancels on unmount', async () => {
  const originalFrame = globalThis.requestAnimationFrame;
  const frames: FrameRequestCallback[] = [];
  globalThis.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
  let cleanup: (() => void) | undefined;
  try {
    const mount = () => {
      let ready = false;
      let effectRan = false;
      const hook = evaluate(
        fragment('src/ui/components/DeferredRouteMount.tsx', 'function scheduleDeferredFrameWork', 'export function useDeferredRouteContentReady')
        + fragment('src/ui/components/DeferredRouteMount.tsx', 'function useOptionalDeferredRouteMountReady', 'export function DeferredRouteModule')
        + '\nuseOptionalDeferredRouteMountReady;', {
          scheduleAfterVisualFrames, setTimeout, clearTimeout,
          useState: () => [ready, (value: boolean) => { ready = value; }],
          useEffect: (effect: () => (() => void)) => {
            if (!effectRan) { effectRan = true; cleanup = effect(); }
          },
        },
      ) as (delay: number) => boolean;
      return () => hook(0);
    };
    const ready = mount();
    assert.equal(ready(), false);
    await new Promise(resolve => setTimeout(resolve, 130));
    assert.equal(ready(), true, 'a loaded route must not remain on its preview waiting for a dropped frame');
    cleanup?.();
    const cancelled = mount();
    assert.equal(cancelled(), false);
    cleanup?.();
    frames.forEach(frame => frame(0));
    await new Promise(resolve => setTimeout(resolve, 130));
    assert.equal(cancelled(), false, 'an unmounted route must not complete from recovery or a late frame');
  } finally {
    cleanup?.();
    if (originalFrame) globalThis.requestAnimationFrame = originalFrame;
    else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  }
});

test('Chart launch focus subscription recovers once and cancels its pending delivery', async () => {
  const originalFrame = globalThis.requestAnimationFrame;
  const frames: FrameRequestCallback[] = [];
  globalThis.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
  let dispose: (() => void) | undefined;
  try {
    let notify: (() => void) | undefined;
    let deliveries = 0;
    let unsubscribed = false;
    const subscribe = evaluate(fragment('src/features/chart/ChartActionLaunchHost.tsx', '  const subscribeAfterVisualFrame = useCallback', '  const snapshot = useSyncExternalStore') + '\nsubscribeAfterVisualFrame;', {
      scheduleAfterVisualFrame,
      useCallback: (callback: unknown) => callback,
      chartActionLaunchController: { subscribe: (listener: () => void) => { notify = listener; return () => { unsubscribed = true; }; } },
    }) as (listener: () => void) => (() => void);
    dispose = subscribe(() => deliveries++);
    notify!(); notify!();
    await new Promise(resolve => setTimeout(resolve, 130));
    assert.equal(deliveries, 1, 'coalesced focus updates must not wait indefinitely for their frame');
    frames[0]?.(0);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(deliveries, 1);
    notify!();
    dispose();
    frames[1]?.(0);
    await new Promise(resolve => setTimeout(resolve, 130));
    assert.equal(deliveries, 1);
    assert.equal(unsubscribed, true);
  } finally {
    dispose?.();
    if (originalFrame) globalThis.requestAnimationFrame = originalFrame;
    else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  }
});
