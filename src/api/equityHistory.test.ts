import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEquityHistoryPath,
  parseEquityHistoryRows,
  resolveEquityHistoryRange,
} from './equityHistory';

const NOW_MS = 1790241600_000;
const NOW_S = 1790241600;

test('equity history uses GET /account/{login}/equity with unix-second from/to', () => {
  assert.equal(
    buildEquityHistoryPath(200074, { from: NOW_S - 86400, to: NOW_S }),
    `/account/200074/equity?from=${NOW_S - 86400}&to=${NOW_S}`,
  );
  assert.throws(() => buildEquityHistoryPath('abc', { from: 0, to: 1 }), /Login ID is required/);
});

test('period options map to from/to windows; default and unknown are the last 24 h', () => {
  assert.deepEqual(resolveEquityHistoryRange(undefined, NOW_MS), { from: NOW_S - 86400, to: NOW_S });
  assert.deepEqual(resolveEquityHistoryRange('1d', NOW_MS), { from: NOW_S - 86400, to: NOW_S });
  assert.deepEqual(resolveEquityHistoryRange('24h', NOW_MS), { from: NOW_S - 86400, to: NOW_S });
  assert.deepEqual(resolveEquityHistoryRange('7d', NOW_MS), { from: NOW_S - 7 * 86400, to: NOW_S });
  assert.deepEqual(resolveEquityHistoryRange('30d', NOW_MS), { from: NOW_S - 30 * 86400, to: NOW_S });
  assert.deepEqual(resolveEquityHistoryRange('90d', NOW_MS), { from: NOW_S - 90 * 86400, to: NOW_S });
  assert.deepEqual(resolveEquityHistoryRange('1y', NOW_MS), { from: NOW_S - 365 * 86400, to: NOW_S });
  assert.deepEqual(resolveEquityHistoryRange('bogus', NOW_MS), { from: NOW_S - 86400, to: NOW_S });
});

test('equity rows map the contract shape and sort ascending by time', () => {
  assert.deepEqual(
    parseEquityHistoryRows([
      { equity: 10000.15, balance: 10000, margin: 11.37, free_margin: 9988.78, time: 1790241560 },
      { equity: 10000, balance: 10000, margin: 0, free_margin: 10000, time: 1790241500 },
      { balance: 1, time: 1 },
      null,
    ]),
    [
      { equity: 10000, balance: 10000, margin: 0, free_margin: 10000, time: 1790241500 },
      { equity: 10000.15, balance: 10000, margin: 11.37, free_margin: 9988.78, time: 1790241560 },
    ],
  );
  assert.deepEqual(parseEquityHistoryRows({ history: [] }), []);
});
