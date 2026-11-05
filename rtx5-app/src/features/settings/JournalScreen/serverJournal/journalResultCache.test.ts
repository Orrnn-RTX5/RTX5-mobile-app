import assert from 'node:assert/strict';
import test from 'node:test';
import { createJournalResultCache, JOURNAL_CACHE_MAX_ENTRIES, JOURNAL_CACHE_MAX_ROWS } from './journalResultCache';
import type { JournalLogEntry } from './journalModel';

const rows = (count: number) => new Array<JournalLogEntry>(count).fill({
  code: 0, code_text: '', type: 1, type_text: '', datetime: 1, source: 'test', message: 'test',
});

test('continuous journal search retains at most eight recent responses and promotes reused filters', () => {
  const cache = createJournalResultCache();
  const result = rows(1);
  for (let i = 0; i < 1_000; i++) cache.set(String(i), result);
  let retained = 0;
  for (let i = 0; i < 1_000; i++) if (cache.get(String(i))) retained++;
  assert.equal(retained, JOURNAL_CACHE_MAX_ENTRIES);
  assert.equal(cache.get('992'), result);
  cache.set('1000', result);
  assert.equal(cache.get('993'), undefined);
  assert.equal(cache.get('992'), result);
});

test('row budget evicts old responses without mutating or truncating large results', () => {
  const cache = createJournalResultCache();
  const large = rows(JOURNAL_CACHE_MAX_ROWS / 2 + 1);
  cache.set('old', large);
  cache.set('new', large);
  assert.equal(cache.get('old'), undefined);
  assert.equal(cache.get('new'), large);
  const oversized = rows(JOURNAL_CACHE_MAX_ROWS + 1);
  cache.set('oversized', oversized);
  assert.equal(cache.get('oversized'), undefined);
  assert.equal(oversized.length, JOURNAL_CACHE_MAX_ROWS + 1);
  assert.equal(cache.get('new'), large);
});

test('replacement and session clearing release the correct row budget', () => {
  const cache = createJournalResultCache();
  cache.set('replace', rows(JOURNAL_CACHE_MAX_ROWS));
  cache.set('replace', []);
  const result = rows(JOURNAL_CACHE_MAX_ROWS);
  cache.set('new', result);
  assert.deepEqual(cache.get('replace'), []);
  assert.equal(cache.get('new'), result);
  cache.clear();
  assert.equal(cache.get('new'), undefined);
  cache.set('next-session', result);
  assert.equal(cache.get('next-session'), result);
});
