import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { createInteractionLifecycle } from '../../../../utils/interactionLifecycle';
import { createJournalResultCache } from './journalResultCache';
import type { JournalLogEntry } from './journalModel';

const compiled = ts.transpileModule(readFileSync(resolve(process.cwd(), 'src/features/settings/JournalScreen/serverJournal/useServerJournal.ts'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const flush = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };
const logs = (message: string): JournalLogEntry[] => [{ code: 0, code_text: '', type: 1, type_text: '', datetime: 1, source: 'test', message }];

function mount({ foreground = true, authenticated = true } = {}) {
  const lifecycle = createInteractionLifecycle();
  lifecycle.setActive(foreground);
  const slots: any[] = [];
  let cursor = 0;
  const effects: Array<{ deps: unknown[]; cleanup?: (() => void) | void }> = [];
  let effectCursor = 0;
  let pendingEffects: Array<() => void> = [];
  const intervals = new Map<number, () => void>();
  let timerId = 0;
  const requests: Array<{
    signal: AbortSignal;
    resolve: (response: { logs: JournalLogEntry[] }) => void;
    reject: (error: Error) => void;
  }> = [];
  const react = {
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (value: any) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial: unknown) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useCallback: (callback: unknown) => callback,
    useEffect(effect: () => (() => void) | void, deps: unknown[]) {
      const index = effectCursor++;
      const previous = effects[index];
      if (previous && deps.every((value, i) => Object.is(value, previous.deps[i]))) return;
      pendingEffects.push(() => {
        previous?.cleanup?.();
        effects[index] = { deps, cleanup: effect() };
      });
    },
  };
  const exports = {} as { useServerJournal: (options: typeof input) => any };
  const modules: Record<string, unknown> = {
    react,
    '../../../../api/journal': {
      getJournalLogs: (_options: unknown, { signal }: { signal: AbortSignal }) => new Promise((resolve, reject) => {
        requests.push({ signal, resolve, reject });
      }),
    },
    '../../../../utils/interactionLifecycle': { interactionLifecycle: lifecycle },
    './journalResultCache': { createJournalResultCache },
  };
  runInNewContext(compiled, {
    exports, AbortController,
    setInterval: (task: () => void) => { intervals.set(++timerId, task); return timerId; },
    clearInterval: (id: number) => intervals.delete(id),
    require: (name: string) => { assert.ok(name in modules, name); return modules[name]; },
  });
  const input = { active: true, isAuthenticated: authenticated, sessionScope: 'broker-a/account-1', mode: 2, type: 0, filter: '' };
  const render = () => {
    cursor = 0;
    effectCursor = 0;
    const result = exports.useServerJournal(input);
    const scheduled = pendingEffects;
    pendingEffects = [];
    scheduled.forEach(effect => effect());
    return result;
  };
  render();
  return {
    lifecycle, requests, intervals, input, render,
    tick: () => [...intervals.values()].forEach(task => task()),
    dispose: () => effects.forEach(effect => effect.cleanup?.()),
  };
}

test('backgrounding aborts journal work; resume loads once and stale completion cannot release the new request', async () => {
  const f = mount();
  assert.equal(f.requests.length, 1);
  assert.equal(f.intervals.size, 1);
  f.lifecycle.setActive(false);
  assert.equal(f.requests[0].signal.aborted, true);
  assert.equal(f.intervals.size, 0);
  f.render().manualRefresh();
  assert.equal(f.requests.length, 1);

  f.lifecycle.setActive(true);
  assert.equal(f.requests.length, 2);
  assert.equal(f.intervals.size, 1);
  f.requests[0].resolve({ logs: logs('late background response') });
  await flush();
  f.tick();
  assert.equal(f.requests.length, 2, 'old finally must not unlock a resumed request');
  const fresh = logs('fresh after resume');
  f.requests[1].resolve({ logs: fresh });
  await flush();
  assert.equal(f.render().serverLogs, fresh);
  f.tick();
  assert.equal(f.requests.length, 3);

  f.input.active = false;
  f.render();
  assert.equal(f.requests[2].signal.aborted, true);
  assert.equal(f.intervals.size, 0);
  f.lifecycle.setActive(false);
  f.lifecycle.setActive(true);
  assert.equal(f.requests.length, 3, 'hidden retained screens do not resume polling');
  f.requests[2].reject(new Error('aborted'));
  await flush();
  f.dispose();
});

test('journal mounted in background waits for foreground and unregisters on unmount', () => {
  const f = mount({ foreground: false });
  assert.equal(f.requests.length, 0);
  assert.equal(f.intervals.size, 0);
  f.lifecycle.setActive(true);
  assert.equal(f.requests.length, 1);
  f.dispose();
  assert.equal(f.requests[0].signal.aborted, true);
  assert.equal(f.intervals.size, 0);
  f.lifecycle.setActive(false);
  f.lifecycle.setActive(true);
  assert.equal(f.requests.length, 1);
});

test('hidden account switches release the old cache and never expose another account rows', async () => {
  const f = mount();
  const oldRows = logs('private account one');
  f.requests[0].resolve({ logs: oldRows });
  await flush();
  assert.equal(f.render().serverLogs, oldRows);
  f.input.active = false;
  f.render();
  f.input.sessionScope = 'broker-b/account-2';
  assert.equal(f.render().serverLogs.length, 0);
  assert.equal(f.render().serverLogs.length, 0);
  f.input.sessionScope = 'broker-a/account-1';
  assert.equal(f.render().serverLogs.length, 0, 'an old scope must not revive its previous rows while hidden');
  f.input.active = true;
  assert.equal(f.render().serverLogs.length, 0, 'the first visible render has no previous-session rows');
  assert.equal(f.render().serverLogs.length, 0, 'returning to the old account reloads after the scope cache was cleared');
  f.dispose();
});

test('unauthenticated journal manual refresh never starts a request', () => {
  const f = mount({ authenticated: false });
  f.render().manualRefresh();
  f.tick();
  assert.equal(f.requests.length, 0);
  assert.equal(f.intervals.size, 0);
  f.dispose();
});
