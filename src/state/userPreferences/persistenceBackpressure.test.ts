import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { sanitizePreferenceAuthStorageValue } from './authPersistence';

// Run the real storage queue with a controllable slow native store. Extracting
// declarations avoids loading React Native or the authenticated app singleton.
const source = ts.createSourceFile('store.ts', readFileSync(resolve(process.cwd(), 'src/state/userPreferences/store.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
const names = new Set(['pendingPreferenceWrites', 'queuedPreferenceWrites', 'preferenceWriteFlushScheduled', 'preferenceWriteFlushFallbackTimer', 'preferenceWriteQueue', 'preferenceWriteOperation', 'userPreferencesStorage']);
const declarations = source.statements.filter(statement =>
  ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration => names.has(declaration.name.getText(source)))
  || ts.isFunctionDeclaration(statement) && ['flushPendingPreferenceWrites', 'schedulePreferenceWriteFlush'].includes(statement.name?.text ?? ''),
).map(statement => statement.getText(source)).join('\n');
const compiled = ts.transpileModule(`${declarations}\nexports.storage = userPreferencesStorage; exports.flush = flushPendingPreferenceWrites;`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function harness() {
  const writes: any[] = [];
  const disk = new Map<string, unknown>();
  const timers = new Set<() => void>();
  let writeImpl = async (name: string, value: string) => { disk.set(name, JSON.parse(value)); writes.push(JSON.parse(value)); };
  let pruning = 0;
  let sanitizations = 0;
  const exports: any = {};
  runInNewContext(compiled, {
    exports, console: { error() {} },
    AsyncStorage: { setItem: (name: string, value: string) => writeImpl(name, value), removeItem: async (name: string) => { disk.delete(name); } },
    sanitizePreferenceAuthStorageValue: (value: unknown) => { sanitizations++; return sanitizePreferenceAuthStorageValue(value); },
    isAsyncStorageCapacityError: (error: Error) => error.message === 'disk full',
    pruneObsoleteSessionCaches: async () => { pruning++; },
    requestAnimationFrame: (callback: () => void) => { timers.add(callback); return callback; },
    setTimeout: (callback: () => void) => { timers.add(callback); return callback; },
    clearTimeout: (callback: () => void) => { timers.delete(callback); },
  });
  return { ...exports, writes, disk, stats: () => ({ sanitizations, pruning }),
    replaceWriter: (next: typeof writeImpl) => { const prior = writeImpl; writeImpl = next; return prior; },
    update: (count: number) => exports.storage.setItem('preferences', { state: { tradeVolume: count, accessToken: 'must-never-persist' }, version: 23 }),
  };
}

test('slow native preferences storage coalesces queued frames and sanitizes only persisted snapshots', async () => {
  const h = harness();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const previous = h.replaceWriter(async (name: string, value: string) => { await gate; await previous(name, value); });
  h.update(1);
  const first = h.flush();
  await Promise.resolve();
  const waiting: Promise<void>[] = [];
  for (let i = 2; i <= 101; i++) { h.update(i); waiting.push(h.flush()); }
  assert.equal(h.stats().sanitizations, 1);
  release();
  await Promise.all([first, ...waiting]);
  assert.equal(h.stats().sanitizations, 2);
  assert.equal(h.writes.length, 2);
  assert.equal(h.disk.get('preferences').state.tradeVolume, 101);
  assert.doesNotMatch(JSON.stringify(h.writes), /must-never-persist/);
});

test('coalesced preference flush still rejects failures, retries capacity errors and recovers later', async () => {
  const h = harness();
  const original = h.replaceWriter(async () => { throw new Error('storage unavailable'); });
  h.update(1);
  const first = h.flush();
  h.update(2);
  const coalesced = h.flush();
  await assert.rejects(first, /storage unavailable/);
  await assert.rejects(coalesced, /storage unavailable/);
  let attempts = 0;
  h.replaceWriter(async (name: string, value: string) => { if (++attempts === 1) throw new Error('disk full'); await original(name, value); });
  h.update(3); await h.flush();
  assert.equal(h.stats().pruning, 1);
  assert.equal(attempts, 2);
  assert.equal(h.disk.get('preferences').state.tradeVolume, 3);
});

test('removal is ordered after old preference writes and before a later snapshot', async () => {
  const h = harness();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const previous = h.replaceWriter(async (name: string, value: string) => { await gate; await previous(name, value); });
  h.update(1); const first = h.flush(); await Promise.resolve();
  h.update(2); const second = h.flush();
  const removal = h.storage.removeItem('preferences');
  h.update(3); const third = h.flush();
  release();
  await Promise.all([first, second, removal, third]);
  assert.deepEqual(h.writes.map((value: any) => value.state.tradeVolume), [1, 2, 3]);
  assert.equal(h.disk.get('preferences').state.tradeVolume, 3);
  await h.storage.removeItem('preferences');
  assert.equal(h.disk.has('preferences'), false);
});

test('an explicit empty flush observes a pending scheduled write failure', async () => {
  const h = harness();
  let fail!: (error: Error) => void;
  const original = h.replaceWriter(() => new Promise<void>((_resolve, reject) => { fail = reject; }));
  h.update(1);
  const scheduled = h.flush();
  await Promise.resolve();
  const explicit = h.flush();
  const checks = Promise.all([
    assert.rejects(scheduled, /write failed/),
    assert.rejects(explicit, /write failed/),
  ]);
  fail(new Error('write failed'));
  await checks;
  h.replaceWriter(original);
  h.update(2); await h.flush(); await h.flush();
  assert.equal(h.disk.get('preferences').state.tradeVolume, 2);
});
