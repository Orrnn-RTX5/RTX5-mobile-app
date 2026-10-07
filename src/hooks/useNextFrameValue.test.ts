import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { scheduleAfterVisualFrame } from '../utils/afterVisualFrame';

function mountHook(initial: boolean) {
  let state = initial;
  let writes = 0;
  let previousDeps: unknown[] | undefined;
  let cleanup: (() => void) | undefined;
  const exports: Record<string, (value: boolean) => boolean> = {};
  const react = {
    useState: () => [state, (value: boolean) => { state = value; writes++; }],
    useEffect: (effect: () => (() => void) | undefined, deps: unknown[]) => {
      if (previousDeps && deps.every((value, index) => Object.is(value, previousDeps![index]))) return;
      cleanup?.();
      previousDeps = deps;
      cleanup = effect();
    },
  };
  runInNewContext(ts.transpileModule(readFileSync(resolve(process.cwd(), 'src/hooks/useNextFrameValue.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, {
    exports, globalThis,
    require: (name: string) => name === 'react' ? react : { scheduleAfterVisualFrame },
  });
  return {
    render: (value: boolean) => exports.useNextFrameValue(value),
    unmount: () => cleanup?.(),
    get writes() { return writes; },
  };
}

test('screen activation recovers when the native frame callback never arrives', async () => {
  const originalFrame = globalThis.requestAnimationFrame;
  let frame: FrameRequestCallback | undefined;
  globalThis.requestAnimationFrame = callback => { frame = callback; return 1; };
  const hook = mountHook(false);
  try {
    assert.equal(hook.render(false), false);
    assert.equal(hook.render(true), false);
    await new Promise(resolve => setTimeout(resolve, 130));
    assert.equal(hook.render(true), true, 'an interrupted frame must not leave the visible screen inactive');
    frame?.(0);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(hook.writes, 1, 'a late frame must not activate twice');
  } finally {
    hook.unmount();
    if (originalFrame) globalThis.requestAnimationFrame = originalFrame;
    else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  }
});

test('rapid focus changes and unmount cancel obsolete screen activation', async () => {
  const originalFrame = globalThis.requestAnimationFrame;
  const frames: FrameRequestCallback[] = [];
  globalThis.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
  const hook = mountHook(false);
  try {
    hook.render(false);
    hook.render(true);
    hook.render(false);
    frames[0]?.(0);
    await new Promise(resolve => setTimeout(resolve, 130));
    assert.equal(hook.render(false), false);
    assert.equal(hook.writes, 0);
    hook.render(true);
    hook.unmount();
    frames[1]?.(0);
    await new Promise(resolve => setTimeout(resolve, 130));
    assert.equal(hook.writes, 0, 'cancelled fallback and late callbacks must not update a hidden/unmounted screen');
  } finally {
    hook.unmount();
    if (originalFrame) globalThis.requestAnimationFrame = originalFrame;
    else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  }
});
