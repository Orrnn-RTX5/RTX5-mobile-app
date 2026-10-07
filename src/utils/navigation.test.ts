import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  safeRouterBack,
  scheduleBackNavigationAfterVisualFrame,
} from './navigation';

const collectSourceFiles = (dir: string): string[] => {
  const absoluteDir = resolve(process.cwd(), dir);
  return readdirSync(absoluteDir).flatMap((entry) => {
    const absoluteEntry = resolve(absoluteDir, entry);
    const relativeEntry = `${dir}/${entry}`.replace(/\\/g, '/');
    if (statSync(absoluteEntry).isDirectory()) {
      return collectSourceFiles(relativeEntry);
    }
    return /\.(ts|tsx)$/.test(entry) ? [relativeEntry] : [];
  });
};

test('safeRouterBack dispatches back only when a previous route exists', () => {
  const calls: string[] = [];
  safeRouterBack(
    {
      canGoBack: () => true,
      back: () => calls.push('back'),
      replace: (href) => calls.push(`replace:${href}`),
    },
    '/(tabs)/chart',
  );

  assert.deepEqual(calls, ['back']);
});

test('safeRouterBack replaces with fallback when no navigator can handle go back', () => {
  const calls: string[] = [];
  safeRouterBack(
    {
      canGoBack: () => false,
      back: () => calls.push('back'),
      replace: (href) => calls.push(`replace:${href}`),
    },
    '/(tabs)/chart',
  );

  assert.deepEqual(calls, ['replace:/(tabs)/chart']);
});

test('feature screens do not dispatch router.back directly', () => {
  const offenders = ['app', 'src/features']
    .flatMap(collectSourceFiles)
    .filter((file) => readFileSync(resolve(process.cwd(), file), 'utf8').includes('router.back()'));

  assert.deepEqual(offenders, []);
});

test('visible arrow-back controls start navigation on press-in', () => {
  const offenders = ['app', 'src/features']
    .flatMap(collectSourceFiles)
    .flatMap((file) => {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8');
      return [...source.matchAll(/<Ionicons\s+name=["']arrow-back["']/g)]
        .filter((match) => {
          const iconStart = match.index ?? -1;
          const fastPressableStart = source.lastIndexOf('<FastPressable', iconStart);
          const pressableStart = source.lastIndexOf('<Pressable', iconStart);
          const controlStart = Math.max(fastPressableStart, pressableStart);
          if (controlStart < 0) return true;
          const controlSource = source.slice(controlStart, iconStart);
          return !/\bactivateOnPressIn\b|\bactivateOnTouchStart\b/.test(controlSource);
        })
        .map((match) => {
          const line = source.slice(0, match.index ?? 0).split(/\r?\n/).length;
          return `${file}:${line}`;
        });
    });

  assert.deepEqual(offenders, []);
});

test('back navigation work starts only after the touch frame can paint', async () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
  let frameCallback: (() => void) | null = null;
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: () => void) => {
      frameCallback = callback;
      return 1;
    },
  });

  try {
    let calls = 0;
    scheduleBackNavigationAfterVisualFrame(() => {
      calls += 1;
    });
    assert.equal(calls, 0);
    const runFrame = frameCallback as (() => void) | null;
    assert.ok(runFrame);
    runFrame();
    assert.equal(calls, 0);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5));
    assert.equal(calls, 1);
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'requestAnimationFrame', originalDescriptor);
    } else {
      delete (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame;
    }
  }
});

test('Back recovers from an interrupted frame without running again on a late frame', async () => {
  const originalFrame = globalThis.requestAnimationFrame;
  let frame: FrameRequestCallback | undefined;
  globalThis.requestAnimationFrame = callback => { frame = callback; return 1; };
  try {
    let calls = 0;
    scheduleBackNavigationAfterVisualFrame(() => calls++);
    await new Promise(resolve => setTimeout(resolve, 130));
    assert.equal(calls, 1, 'Back must not wait indefinitely for a native frame');
    frame?.(0);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(calls, 1);
  } finally {
    if (originalFrame) globalThis.requestAnimationFrame = originalFrame;
    else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  }
});

test('repeated Back taps before a paint commit only the latest pending pop', async () => {
  const originalFrame = globalThis.requestAnimationFrame;
  const frames: FrameRequestCallback[] = [];
  globalThis.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
  try {
    const calls: string[] = [];
    scheduleBackNavigationAfterVisualFrame(() => calls.push('stale'));
    scheduleBackNavigationAfterVisualFrame(() => calls.push('current'));
    frames.forEach(frame => frame(0));
    await new Promise(resolve => setTimeout(resolve, 130));
    assert.deepEqual(calls, ['current'], 'queued taps must not unexpectedly pop multiple screens');
  } finally {
    if (originalFrame) globalThis.requestAnimationFrame = originalFrame;
    else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  }
});
