import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  POSITION_HISTORY_ROW_CAP,
  getPositionHistory,
} from './closedHistory';
import type { ClosedPosition } from './types';

const source = readFileSync(
  resolve(process.cwd(), 'src/api/positions/closedHistory.ts'),
  'utf8',
);

const DAY = 86_400;

const row = (ticket: number, timeClose: number): ClosedPosition => ({
  ticket,
  account_login: 200074,
  symbol: 'EURUSD',
  side: 'buy',
  volume: 0.01,
  price_open: 1.1,
  price_close: 1.2,
  profit: 1,
  swap: 0,
  time_create: timeClose - 60,
  time_update: timeClose,
  time_close: timeClose,
});

/** Fake gateway: honours from/to (inclusive) and caps at 500 rows. */
const gateway = (rows: ClosedPosition[]) => {
  const calls: Array<[number, number]> = [];
  const fetchWindow = async (_login: number, from: number, to: number) => {
    calls.push([from, to]);
    return rows
      .filter((record) => (record.time_close ?? 0) >= from && (record.time_close ?? 0) <= to)
      .slice(0, POSITION_HISTORY_ROW_CAP);
  };
  return { calls, fetchWindow };
};

test('closed history no longer sends limit/offset; it pages by from/to windows', () => {
  assert.doesNotMatch(source, /limit=\$\{|offset=\$\{/);
  assert.match(source, /new URLSearchParams\(\{ from: String\(from\), to: String\(to\) \}\)/);
  assert.equal(POSITION_HISTORY_ROW_CAP, 500);
});

test('an unbounded walk goes backwards until two consecutive empty windows', async () => {
  const now = 1_790_000_000;
  const rows = [row(1, now - 10 * DAY), row(2, now - 100 * DAY)];
  const { calls, fetchWindow } = gateway(rows);
  const history = await getPositionHistory(200074, { nowSeconds: now, fetchWindow });
  assert.deepEqual(history.map((record) => record.ticket).sort(), [1, 2]);
  // window 1 (row 1), window 2 (row 2), windows 3 and 4 empty -> stop.
  assert.equal(calls.length, 4);
  assert.equal(calls[0][1], now);
  for (let index = 1; index < calls.length; index += 1) {
    assert.equal(calls[index][1], calls[index - 1][0] - 1, 'windows are contiguous and do not overlap');
  }
});

test('a bounded range is covered exactly, even across empty windows', async () => {
  const to = 1_790_000_000;
  const from = to - 400 * DAY;
  const rows = [row(1, to - DAY), row(2, from + DAY)];
  const { calls, fetchWindow } = gateway(rows);
  const history = await getPositionHistory(200074, { from, to, fetchWindow });
  assert.deepEqual(history.map((record) => record.ticket).sort(), [1, 2]);
  assert.equal(calls[calls.length - 1][0], from);
});

test('a window that hits the 500-row cap is split so nothing is truncated', async () => {
  const now = 1_790_000_000;
  const rows = Array.from({ length: 700 }, (_, index) => row(index + 1, now - 60 - index * 600));
  const { fetchWindow } = gateway(rows);
  const history = await getPositionHistory(200074, { nowSeconds: now, fetchWindow, maxWindows: 1 });
  assert.equal(history.length, 700);
});

test('a server that ignores from/to cannot loop forever', async () => {
  const now = 1_790_000_000;
  const rows = [row(1, now - DAY), row(2, now - 2 * DAY)];
  let calls = 0;
  const history = await getPositionHistory(200074, {
    nowSeconds: now,
    fetchWindow: async () => {
      calls += 1;
      return rows;
    },
  });
  assert.equal(history.length, 2);
  assert.ok(calls <= 2, `stopped after ${calls} calls`);
});
