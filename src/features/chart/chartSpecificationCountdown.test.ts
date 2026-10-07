import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import ts from 'typescript';

// Execute the actual React effect with deterministic lifecycle/clock hosts;
// importing the screen itself would require an Android/iOS native runtime.
const source = readFileSync(resolve(process.cwd(), 'src/features/chart/ChartSpecificationScreen.tsx'), 'utf8');
const formatter = source.slice(source.indexOf('function fmtCountdown('), source.indexOf('export function ChartSpecificationScreen'));
const effectStart = source.indexOf('  useEffect(() => {', source.indexOf('const [countdown, setCountdown]'));
const effect = source.slice(effectStart, source.indexOf('\n  const volumeBounds', effectStart));
assert.match(effect, /\[isScreenFocused, targetTs\]/);
const compiled = ts.transpileModule(formatter + effect, {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText;
const runEffect = new Function('useEffect', 'AppState', 'targetTs', 'isScreenFocused', 'setCountdown', 'Date', 'setTimeout', 'clearTimeout', compiled);

function createHost(focused = true, targetTs = 13) {
  let now = 10_250;
  let nextTimerId = 0;
  let cleanup: (() => void) | undefined;
  const updates: string[] = [];
  const timers = new Map<number, { due: number; run: () => void }>();
  const listeners = new Set<(state: string) => void>();
  const appState = {
    currentState: 'active',
    addEventListener: (_event: string, listener: (state: string) => void) => {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
  };
  runEffect(
    (effectCallback: () => (() => void) | undefined) => { cleanup = effectCallback(); },
    appState, targetTs, focused, (value: string) => updates.push(value), { now: () => now },
    (run: () => void, delay: number) => { const id = ++nextTimerId; timers.set(id, { due: now + delay, run }); return id; },
    (id: number) => timers.delete(id),
  );
  return {
    updates,
    timers,
    listeners,
    cleanup: () => cleanup?.(),
    setAppState: (state: string) => {
      appState.currentState = state;
      for (const listener of listeners) listener(state);
    },
    advance: (ms: number) => {
      const until = now + ms;
      while (true) {
        const next = [...timers.entries()].sort((a, b) => a[1].due - b[1].due)[0];
        if (!next || next[1].due > until) break;
        timers.delete(next[0]);
        now = next[1].due;
        next[1].run();
      }
      now = until;
    },
  };
}

test('specification countdown ticks on second boundaries and retires at the deadline', () => {
  const host = createHost();
  assert.deepEqual(host.updates, ['00:00:03']);
  host.advance(2_750);
  assert.deepEqual(host.updates, ['00:00:03', '00:00:02', '00:00:01', '--:--:--']);
  assert.equal(host.timers.size, 0);
  host.advance(60_000);
  assert.equal(host.updates.length, 4);
  host.cleanup();
});

test('specification countdown pauses in background and recomputes immediately on resume', () => {
  const host = createHost();
  host.advance(250);
  host.setAppState('background');
  assert.equal(host.timers.size, 0);
  host.advance(2_000);
  assert.deepEqual(host.updates, ['00:00:03']);
  host.setAppState('active');
  assert.equal(host.updates.at(-1), '00:00:01');
  host.advance(500);
  assert.equal(host.updates.at(-1), '--:--:--');
  assert.equal(host.timers.size, 0);
  host.cleanup();
});

test('hidden specification screens do no timer work and blur cleanup cancels all pending work', () => {
  const hidden = createHost(false);
  assert.equal(hidden.timers.size, 0);
  assert.equal(hidden.listeners.size, 0);
  assert.equal(hidden.updates.length, 0);
  const visible = createHost();
  visible.cleanup();
  assert.equal(visible.timers.size, 0);
  assert.equal(visible.listeners.size, 0);
  visible.advance(10_000);
  visible.setAppState('active');
  assert.equal(visible.updates.length, 1);
});

test('already expired targets render the existing placeholder without scheduling work', () => {
  const host = createHost(true, 9);
  assert.deepEqual(host.updates, ['--:--:--']);
  assert.equal(host.timers.size, 0);
  host.cleanup();
});
