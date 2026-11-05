import assert from 'node:assert/strict';
import test from 'node:test';
import { createDeferredJsonStorage } from './deferredJsonStorage';

function fixture() {
  const disk = new Map<string, string>();
  const writes: string[] = [];
  const errors: unknown[] = [];
  const frames = new Set<() => void>();
  const backing = {
    getItem: async (name: string) => disk.get(name) ?? null,
    setItem: async (name: string, value: string) => { disk.set(name, value); writes.push(value); },
    removeItem: async (name: string) => { disk.delete(name); },
  };
  const create = <T,>() => createDeferredJsonStorage<T>(backing, error => errors.push(error), action => {
    frames.add(action);
    return () => { frames.delete(action); };
  });
  return { disk, writes, errors, frames, backing, create };
}

test('a burst of journal updates serializes only the latest snapshot after paint', async () => {
  const f = fixture();
  const { storage, flush } = f.create<{ entries: string[]; toJSON?: () => unknown }>();
  let serializations = 0;
  for (let count = 1; count <= 20; count++) {
    storage.setItem('journal', { state: {
      entries: Array.from({ length: count }, (_, i) => String(i)),
      toJSON() { serializations++; return { entries: this.entries }; },
    }, version: 0 });
  }
  assert.equal(serializations, 0, 'touch handlers must not serialize the complete journal');
  assert.equal(f.writes.length, 0);
  assert.equal(f.frames.size, 1);
  assert.equal((await storage.getItem('journal'))?.state.entries.length, 20);
  assert.equal(serializations, 0, 'reading pending state must not go through JSON');
  [...f.frames][0]();
  await flush();
  assert.equal(f.frames.size, 0);
  assert.equal(serializations, 1);
  assert.equal(f.writes.length, 1);
  assert.equal(JSON.parse(f.writes[0]).state.entries.length, 20);
});

test('background flush writes immediately and queued removal cannot resurrect old entries', async () => {
  const f = fixture();
  const { storage, flush } = f.create<{ entries: string[] }>();
  storage.setItem('journal', { state: { entries: ['old'] }, version: 0 });
  const firstFlush = flush();
  const removal = storage.removeItem('journal');
  await Promise.all([firstFlush, removal]);
  assert.equal(f.disk.has('journal'), false);
  storage.setItem('journal', { state: { entries: ['new'] }, version: 0 });
  await flush();
  assert.deepEqual(JSON.parse(f.disk.get('journal')!).state.entries, ['new']);
  assert.equal(f.frames.size, 0);
});

test('corrupt data and rejected writes are recoverable without poisoning later persistence', async () => {
  const f = fixture();
  f.disk.set('journal', '{broken');
  const { storage, flush } = f.create<{ entries: string[] }>();
  assert.equal(await storage.getItem('journal'), null);
  assert.equal(f.disk.has('journal'), false);
  assert.equal(f.errors.length, 1);
  const originalWrite = f.backing.setItem;
  f.backing.setItem = async () => { throw new Error('disk temporarily unavailable'); };
  storage.setItem('journal', { state: { entries: ['first'] }, version: 0 });
  await flush();
  assert.equal(f.errors.length, 2);
  f.backing.setItem = originalWrite;
  storage.setItem('journal', { state: { entries: ['first', 'second'] }, version: 0 });
  await flush();
  assert.deepEqual(JSON.parse(f.disk.get('journal')!).state.entries, ['first', 'second']);
});

test('temporary read failures preserve disk data, and late hydration cannot delete fresh writes', async () => {
  const f = fixture();
  const stored = JSON.stringify({ state: { entries: ['persisted'] }, version: 0 });
  f.disk.set('journal', stored);
  const originalRead = f.backing.getItem;
  f.backing.getItem = async () => { throw new Error('storage temporarily unavailable'); };
  const { storage, flush } = f.create<{ entries: string[] }>();
  assert.equal(await storage.getItem('journal'), null);
  assert.equal(f.disk.get('journal'), stored);

  let finishRead!: (value: string) => void;
  f.backing.getItem = () => new Promise(resolve => { finishRead = resolve; });
  const reading = storage.getItem('journal');
  await Promise.resolve();
  storage.setItem('journal', { state: { entries: ['newer'] }, version: 0 });
  await flush();
  finishRead('{old corrupt data');
  assert.deepEqual((await reading)?.state.entries, ['newer']);
  assert.deepEqual(JSON.parse(f.disk.get('journal')!).state.entries, ['newer']);
  f.backing.getItem = originalRead;
});

test('slow storage keeps only the newest queued snapshot instead of retaining every render', async () => {
  const f = fixture();
  let release!: () => void;
  let serializations = 0;
  const originalWrite = f.backing.setItem;
  let writesStarted = 0;
  f.backing.setItem = async (name, value) => {
    if (++writesStarted === 1) await new Promise<void>(resolve => { release = resolve; });
    await originalWrite(name, value);
  };
  const { storage, flush } = f.create<{ count: number; toJSON: () => unknown }>();
  const update = (count: number) => storage.setItem('journal', {
    state: { count, toJSON() { serializations++; return { count }; } }, version: 0,
  });
  update(0);
  const initial = flush();
  await Promise.resolve();
  const pending: Promise<void>[] = [];
  for (let count = 1; count <= 100; count++) { update(count); pending.push(flush()); }
  assert.equal(serializations, 1, 'queued snapshots must not serialize while the older native write is blocked');
  release();
  await Promise.all([initial, ...pending]);
  assert.equal(serializations, 2, 'only the in-flight and newest queued snapshots should be serialized');
  assert.equal(f.writes.length, 2);
  assert.equal(JSON.parse(f.disk.get('journal')!).state.count, 100);
});

test('coalescing respects removal barriers and preserves writes after a removal', async () => {
  const f = fixture();
  let release!: () => void;
  const originalWrite = f.backing.setItem;
  let writesStarted = 0;
  const operations: string[] = [];
  f.backing.setItem = async (name, value) => {
    if (++writesStarted === 1) await new Promise<void>(resolve => { release = resolve; });
    operations.push(`write:${JSON.parse(value).state.count}`);
    await originalWrite(name, value);
  };
  f.backing.removeItem = async name => { operations.push('remove'); f.disk.delete(name); };
  const { storage, flush } = f.create<{ count: number }>();
  storage.setItem('journal', { state: { count: 0 }, version: 0 });
  const initial = flush();
  await Promise.resolve();
  storage.setItem('journal', { state: { count: 1 }, version: 0 });
  const before = flush();
  const removal = storage.removeItem('journal');
  storage.setItem('journal', { state: { count: 2 }, version: 0 });
  const after = flush();
  release();
  await Promise.all([initial, before, removal, after]);
  assert.deepEqual(operations, ['write:0', 'write:1', 'remove', 'write:2']);
  assert.equal(JSON.parse(f.disk.get('journal')!).state.count, 2);
});
