/** Batch nearby writes, retaining only the newest value for each key. */
export function createCoalescedWriter<K,V>(
  write: (entries: ReadonlyArray<readonly [K,V]>) => Promise<void>,
  onError: (error: unknown, entries: ReadonlyArray<readonly [K,V]>) => void,
  delayMs = 16,
) {
  const pending = new Map<K,V>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let active: Promise<void> | null = null;
  let cancelled = false;
  const flush = async (): Promise<void> => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (cancelled) return;
    if (active) { await active; return flush(); }
    if (!pending.size) return;
    const entries = [...pending.entries()]; pending.clear();
    active = Promise.resolve().then(() => write(entries)).catch(error => onError(error,entries));
    try { await active; }
    finally { active = null; if (!cancelled && pending.size) schedule(); }
  };
  const schedule = () => {
    if (!timer && !active && !cancelled) timer = setTimeout(() => { void flush(); },delayMs);
  };
  return {
    enqueue(key: K,value: V) { if (!cancelled) { pending.set(key,value); schedule(); } },
    flush,
    cancel() { cancelled = true; pending.clear(); if (timer) clearTimeout(timer); timer = null; },
  };
}
