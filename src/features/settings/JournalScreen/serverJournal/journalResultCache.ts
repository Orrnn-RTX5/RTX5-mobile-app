import type { JournalLogEntry } from './journalModel';

export const JOURNAL_CACHE_MAX_ENTRIES = 8;
export const JOURNAL_CACHE_MAX_ROWS = 20_000;

/** Retain recent filters without retaining every response from a long search session. */
export function createJournalResultCache() {
  const entries = new Map<string, JournalLogEntry[]>();
  let rowCount = 0;
  const remove = (key: string) => {
    const rows = entries.get(key);
    if (rows) rowCount -= rows.length;
    entries.delete(key);
  };
  return {
    get(key: string) {
      const rows = entries.get(key);
      if (rows) {
        entries.delete(key);
        entries.set(key, rows);
      }
      return rows;
    },
    set(key: string, rows: JournalLogEntry[]) {
      remove(key);
      // The active screen still renders the full response; only optional cached
      // copies are bounded. Never truncate journal results to fit the cache.
      if (rows.length > JOURNAL_CACHE_MAX_ROWS) return;
      entries.set(key, rows);
      rowCount += rows.length;
      while (entries.size > JOURNAL_CACHE_MAX_ENTRIES || rowCount > JOURNAL_CACHE_MAX_ROWS) {
        remove(entries.keys().next().value!);
      }
    },
    clear() {
      entries.clear();
      rowCount = 0;
    },
  };
}
