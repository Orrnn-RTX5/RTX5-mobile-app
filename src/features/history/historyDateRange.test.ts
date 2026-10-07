import assert from 'node:assert/strict';
import test from 'node:test';

import { filterClosedRecordsByDateRange } from './historyDateRange.ts';

test('filterClosedRecordsByDateRange keeps closed trades with close-time aliases', () => {
  const fromMs = Date.parse('2026-05-01T00:00:00.000Z');
  const toMs = Date.parse('2026-05-31T23:59:59.999Z');
  const records = [
    { id: 'iso-close-time', close_time: '2026-05-05T10:00:00.000Z' },
    { id: 'seconds-time-done', timeDone: 1777975200 },
    { id: 'old-record', closed_at: '2026-03-01T10:00:00.000Z' },
  ];

  const filtered = filterClosedRecordsByDateRange(records, fromMs, toMs);

  assert.deepEqual(filtered.map((record) => record.id), ['iso-close-time', 'seconds-time-done']);
});
