import assert from 'node:assert/strict';
import test from 'node:test';
import { mergePublicBars } from './publicCandleMerge';
const bar = { time: 100, open: 1, high: 2, low: .5, close: 1.5, volume: 10, closed: false };
test('history/live/repeated fallback bars replace buckets without duplicating volume or reverting finality', () => {
  const live = { ...bar, close: 1.6, volume: 12 };
  assert.deepEqual(mergePublicBars([bar], [live, live]), [live]);
  const final = { ...live, closed: true };
  assert.deepEqual(mergePublicBars([final], [bar]), [final]);
  assert.deepEqual(mergePublicBars([bar], [{ ...bar, time: 40 }, { ...bar, time: 160 }], 2).map(row => row.time), [100, 160]);
});
