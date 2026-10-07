import type { PersistStorage, StateStorage, StorageValue } from 'zustand/middleware';
import { scheduleAfterVisualFrame } from '../utils/afterVisualFrame';

/** Coalesce immutable snapshots before serializing them outside the tap turn. */
export function createDeferredJsonStorage<State>(
  backing: StateStorage,
  onError: (error: unknown) => void,
  schedule: (action: () => void) => () => void = scheduleAfterVisualFrame,
) {
  const pending = new Map<string, StorageValue<State>>();
  const revisions = new Map<string, number>();
  const latest = new Map<string, StorageValue<State> | null>();
  const queuedWrites = new Map<string, { snapshot: StorageValue<State> }>();
  let cancelScheduled: (() => void) | null = null;
  let queue: Promise<void> = Promise.resolve();

  const enqueue = (action: () => void | Promise<void>) => {
    queue = queue.then(action).catch(onError);
    return queue;
  };

  const flush = (): Promise<void> => {
    cancelScheduled?.();
    cancelScheduled = null;
    const batch = Array.from(pending);
    pending.clear();
    if (batch.length === 0) return queue;
    for (const [name, snapshot] of batch) {
      const queued = queuedWrites.get(name);
      if (queued) {
        // A slow native write must not retain/serialize every intermediate
        // immutable state. Replace the next write before it starts.
        queued.snapshot = snapshot;
        continue;
      }
      const write = { snapshot };
      queuedWrites.set(name, write);
      enqueue(async () => {
        if (queuedWrites.get(name) === write) queuedWrites.delete(name);
        await backing.setItem(name, JSON.stringify(write.snapshot));
      });
    }
    return queue;
  };

  const storage: PersistStorage<State> = {
    getItem: async name => {
      // Hydration cannot overwrite newer edits or resurrect a removed key.
      if (latest.has(name)) return latest.get(name)!;
      const revision = revisions.get(name) ?? 0;
      const superseded = () => (revisions.get(name) ?? 0) !== revision;
      await queue;
      if (superseded()) return latest.get(name) ?? null;
      let raw: string | null;
      try {
        raw = await backing.getItem(name);
      } catch (error) {
        onError(error);
        // An unavailable storage service does not mean its data is corrupt.
        return superseded() ? latest.get(name) ?? null : null;
      }
      if (superseded()) return latest.get(name) ?? null;
      try {
        return raw == null ? null : JSON.parse(raw) as StorageValue<State>;
      } catch (error) {
        onError(error);
        await enqueue(async () => {
          if (!superseded()) await backing.removeItem(name);
        });
        return superseded() ? latest.get(name) ?? null : null;
      }
    },
    setItem: (name, snapshot) => {
      revisions.set(name, (revisions.get(name) ?? 0) + 1);
      latest.set(name, snapshot);
      pending.set(name, snapshot);
      if (!cancelScheduled) cancelScheduled = schedule(() => { void flush(); });
    },
    removeItem: name => {
      revisions.set(name, (revisions.get(name) ?? 0) + 1);
      latest.set(name, null);
      pending.delete(name);
      // Removal is an ordering barrier: a subsequent set must be queued
      // after this removal rather than coalescing into a preceding write.
      queuedWrites.delete(name);
      if (pending.size === 0) {
        cancelScheduled?.();
        cancelScheduled = null;
      }
      // Finish any older native write before removing the key.
      return enqueue(async () => { await backing.removeItem(name); });
    },
  };
  return { storage, flush };
}
