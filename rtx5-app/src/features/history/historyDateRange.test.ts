import assert from 'node:assert/strict';
import test from 'node:test';

import { filterClosedRecordsByDateRange, filterOrderRecordsByDateRange, resolveEffectiveHistoryDateRange } from './historyDateRange.ts';

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

test('presets override obsolete persisted dates and All time removes custom bounds', () => {
  const now = new Date(2026, 9, 9, 12);
  const stale = new Date(2026, 8, 1).getTime();
  const today = resolveEffectiveHistoryDateRange('Today', stale, stale, now);
  assert.equal(today.fromMs, new Date(2026, 9, 9).getTime());
  assert.equal(today.toMs, new Date(2026, 9, 9, 23, 59, 59, 999).getTime());
  assert.deepEqual(resolveEffectiveHistoryDateRange('All time', stale, stale, now), { fromMs: null, toMs: null });
  assert.deepEqual(resolveEffectiveHistoryDateRange('Custom', stale, stale + 1000, now), { fromMs: stale, toMs: stale + 1000 });
});

test('every preset resolves the expected local calendar range', () => {
  const now = new Date(2026, 9, 9, 12);
  for (const [label, start] of [
    ['Today', new Date(2026, 9, 9)],
    ['Last week', new Date(2026, 9, 2)],
    ['Last month', new Date(2026, 8, 9)],
    ['Last 3 months', new Date(2026, 6, 9)],
    ['Last 6 months', new Date(2026, 3, 9)],
    ['Last year', new Date(2025, 9, 9)],
  ] as const) {
    const range = resolveEffectiveHistoryDateRange(label, null, null, now);
    assert.equal(range.fromMs, start.getTime(), label);
    assert.equal(range.toMs, new Date(2026, 9, 9, 23, 59, 59, 999).getTime(), label);
  }
});

test('month and year presets clamp to the last valid day instead of rolling forward', () => {
  assert.equal(resolveEffectiveHistoryDateRange('Last month', null, null, new Date(2026, 2, 31)).fromMs,
    new Date(2026, 1, 28).getTime());
  assert.equal(resolveEffectiveHistoryDateRange('Last year', null, null, new Date(2024, 1, 29)).fromMs,
    new Date(2023, 1, 28).getTime());
});

test('orders use their displayed setup or completion date and include both boundaries', () => {
  const fromMs = Date.parse('2026-10-09T00:00:00Z');
  const toMs = fromMs + 86_400_000 - 1;
  const records = [
    { id: 'closed-today', status: 'closed', time_setup: (fromMs - 86400000) / 1000, time_done: fromMs / 1000 },
    { id: 'canceled-final-ms', status: 'canceled', time_done: toMs },
    { id: 'filled-today', status: 'filled', time_setup: fromMs / 1000, time_done: 0 },
    { id: 'closed-yesterday', status: 'closed', time_done: (fromMs - 1000) / 1000 },
    { id: 'filled-yesterday', status: 'filled', time_setup: (fromMs - 1000) / 1000, time_done: fromMs / 1000 },
    { id: 'missing-completion', status: 'closed', time_setup: fromMs / 1000, time_done: 0 },
  ];
  assert.deepEqual(filterOrderRecordsByDateRange(records, fromMs, toMs).map(r => r.id),
    ['closed-today', 'canceled-final-ms', 'filled-today', 'missing-completion']);
  assert.equal(filterOrderRecordsByDateRange(records, null, null), records);
});

test('date filtering accepts seconds, milliseconds, microseconds, nanoseconds and date strings', () => {
  const ms = Date.parse('2026-10-09T12:00:00Z');
  const values = [ms / 1000, ms, ms * 1000, ms * 1000000, String(ms / 1000), '2026.10.09 12:00:00Z'];
  const records = values.map((time, id) => ({ id, time_close: time }));
  assert.equal(filterClosedRecordsByDateRange(records, ms - 1, ms + 1).length, values.length);
});
