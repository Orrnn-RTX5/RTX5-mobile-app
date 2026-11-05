import assert from 'node:assert/strict';
import test from 'node:test';
import { formatPendingExpiryDate, formatPendingExpiryTime, pendingExpiryWithLocalDate, pendingExpiryWithLocalTime } from './pendingExpirationDate';

test('expiration calendar edits the local date and retains the selected hour and minute', () => {
  const current = new Date(2026, 9, 27, 13, 45, 32);
  const next = pendingExpiryWithLocalDate(current, '2028-02-29')!;
  assert.equal(formatPendingExpiryDate(next), '2028-02-29');
  assert.equal(formatPendingExpiryTime(next), '13:45');
  assert.equal(next.getSeconds(), 0);
  assert.equal(formatPendingExpiryDate(current), '2026-10-27');
  for (const invalid of ['2027-02-29', '2026-13-01', '2026-00-01', '2026-10-00', '2026-10-32', 'bad']) {
    assert.equal(pendingExpiryWithLocalDate(current, invalid), null);
  }
});

test('expiration time edits retain the local date and reject partial or overflowing input', () => {
  const current = new Date(2026, 9, 27, 13, 45, 32);
  const next = pendingExpiryWithLocalTime(current, '09:05')!;
  assert.equal(formatPendingExpiryDate(next), '2026-10-27');
  assert.equal(formatPendingExpiryTime(next), '09:05');
  assert.equal(next.getSeconds(), 0);
  assert.equal(formatPendingExpiryTime(pendingExpiryWithLocalTime(current, '00:00')!), '00:00');
  for (const invalid of ['24:00', '12:60', '-1:00', '1:', '13:4', '', '1234']) {
    assert.equal(pendingExpiryWithLocalTime(current, invalid), null);
  }
});
