import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fromDateKey,
  getFirstDayOfMonth,
  getWeekDates,
  toDateKey,
} from './dateUtils';

test('history calendar keys round-trip in local time without UTC date drift', () => {
  const date = fromDateKey('2026-09-25');

  assert.ok(date);
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 8);
  assert.equal(date.getDate(), 25);
  assert.equal(toDateKey(date.getFullYear(), date.getMonth(), date.getDate()), '2026-09-25');
});

test('history calendar rejects malformed and impossible date keys', () => {
  assert.equal(fromDateKey('2026-02-30'), null);
  assert.equal(fromDateKey('25-09-2026'), null);
  assert.equal(fromDateKey(''), null);
});

test('history calendar remains Monday-first for month and week selection', () => {
  assert.equal(getFirstDayOfMonth(2026, 8), 1); // September 1, 2026 is Tuesday.

  const [monday, sunday] = getWeekDates(new Date(2026, 8, 25));
  assert.equal(toDateKey(monday.getFullYear(), monday.getMonth(), monday.getDate()), '2026-09-21');
  assert.equal(toDateKey(sunday.getFullYear(), sunday.getMonth(), sunday.getDate()), '2026-09-27');
});
