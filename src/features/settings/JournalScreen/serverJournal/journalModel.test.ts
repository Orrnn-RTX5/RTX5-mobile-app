import assert from 'node:assert/strict';
import test from 'node:test';

import type { OrderLatencySample } from '../../../../state/orderLatencyTelemetry';
import {
  JOURNAL_TIME_RANGES,
  buildJournalTsv,
  filterJournalRows,
  formatJournalDateTime,
  formatLatency,
  formatVolume,
  journalRowKeys,
  localJournalRow,
  mergeJournalRows,
  normalizeJournalResponse,
  scopedPlacementTerminalSamples,
  selectLastTradeLatencyMs,
  type JournalLogEntry,
} from './journalModel';

const SCOPE = 'authenticated|5001|fxtrust|https://fxtrustbrokerbackend.orrnn.com';
const NOW_MS = Date.UTC(2026, 8, 25, 12, 0, 0);
const NOW_S = Math.floor(NOW_MS / 1000);

const row = (overrides: Partial<JournalLogEntry> = {}): JournalLogEntry => ({
  code: 0,
  code_text: 'OK',
  type: 6,
  type_text: 'Trade',
  datetime: NOW_S,
  source: 'Gateway',
  message: 'Order sell XAUUSD 0.01 filled',
  ...overrides,
});

let sequence = 0;
const sample = (overrides: Partial<OrderLatencySample> = {}): OrderLatencySample => ({
  sequence: ++sequence,
  recordedAtEpochMs: NOW_MS,
  phase: 'placement_terminal',
  transport: 'rest',
  traceId: 'abcd1234',
  sessionScope: SCOPE,
  symbol: 'XAUUSD',
  side: 'buy',
  volume: 0.01,
  terminalStatus: 'filled',
  totalMs: 14.625,
  ...overrides,
});

const filterAll = (rows: JournalLogEntry[], overrides: Partial<Parameters<typeof filterJournalRows>[1]> = {}) =>
  filterJournalRows(rows, {
    timeRangeHours: 0,
    type: 0,
    mode: 2,
    search: '',
    responseMatchesRequest: true,
    nowMs: NOW_MS,
    ...overrides,
  });

// --- Formatting ------------------------------------------------------------

test('formatLatency matches the web vectors', () => {
  assert.equal(formatLatency(14.625), '14.63 ms');
  assert.equal(formatLatency(8.125), '8.13 ms');
  assert.equal(formatLatency(27.4), '27.4 ms');
  assert.equal(formatLatency(9), '9 ms');
  assert.equal(formatLatency(0), '0 ms');
  assert.equal(formatLatency(30000), '30000 ms');
  assert.equal(formatLatency(undefined), '—');
  assert.equal(formatLatency(-1), '—');
  assert.equal(formatLatency(Number.NaN), '—');
});

test('formatJournalDateTime renders seconds in local MM/DD/YY HH:mm:ss and falsy as an em dash', () => {
  assert.equal(formatJournalDateTime(0), '—');
  const local = new Date(1787754656 * 1000);
  const pad = (value: number) => String(value).padStart(2, '0');
  assert.equal(
    formatJournalDateTime(1787754656),
    `${pad(local.getMonth() + 1)}/${pad(local.getDate())}/${pad(local.getFullYear() % 100)} `
      + `${pad(local.getHours())}:${pad(local.getMinutes())}:${pad(local.getSeconds())}`,
  );
});

test('formatVolume drops float noise', () => {
  assert.equal(formatVolume(0.01), '0.01');
  assert.equal(formatVolume(1), '1');
  assert.equal(formatVolume(0.123456789), '0.12345679');
  assert.equal(formatVolume(undefined), '');
});

// --- Normalization (§12.23-25) ----------------------------------------------

test('normalization converts string numbers, keeps ids and unwraps the data envelope', () => {
  const result = normalizeJournalResponse({
    data: {
      count: '2',
      logs: [
        { id: 'r1', code: '0', code_text: 'OK', type: '6', type_text: 'Trade', datetime: '1787754656', source: 'Gateway', message: 'x' },
        'not-an-object',
      ],
    },
  });
  assert.equal(result.count, 2);
  assert.equal(result.logs.length, 1);
  assert.deepEqual(result.logs[0], {
    id: 'r1', code: 0, code_text: 'OK', type: 6, type_text: 'Trade', datetime: 1787754656, source: 'Gateway', message: 'x',
  });
  assert.throws(() => normalizeJournalResponse({ data: [] }), /Invalid Journal API response/);
  assert.equal(normalizeJournalResponse({ logs: [] }).count, 0);
});

test('latency_ms: missing, "", null, -1 and "Infinity" are absent; "0" is 0; correlation ids are kept', () => {
  const logs = normalizeJournalResponse({
    logs: [{}, { latency_ms: '' }, { latency_ms: null }, { latency_ms: -1 }, { latency_ms: 'Infinity' }, {
      latency_ms: '0', client_order_id: 'order-1', request_id: 7, order_ticket: '11', position_ticket: 12,
    }],
  }).logs;
  for (const log of logs.slice(0, 5)) assert.equal('latency_ms' in log, false);
  assert.equal(logs[5].latency_ms, 0);
  assert.equal(logs[5].client_order_id, 'order-1');
  assert.equal(logs[5].request_id, 7);
  assert.equal(logs[5].order_ticket, '11');
  assert.equal(logs[5].position_ticket, 12);
});

test('Gateway trade durations move from message to latency, rejections are untouched, canonical wins', () => {
  const normalize = (message: string, extra: Record<string, unknown> = {}) =>
    normalizeJournalResponse({ logs: [{ type: 6, type_text: 'Trade', source: 'Gateway', message, ...extra }] }).logs[0];

  assert.deepEqual(
    [normalize('Order buy XAUUSD 0.01 filled in 286ms')].map((l) => [l.message, l.latency_ms]),
    [['Order buy XAUUSD 0.01 filled', 286]],
  );
  const timing = normalize('Timing buy XAUUSD 0.01: prep 0ns · exec 286ms · total 286ms');
  assert.deepEqual([timing.message, timing.latency_ms], ['Timing buy XAUUSD 0.01', 286]);
  const close = normalize('Close sell BTCUSD ticket 4318 profit -0.96 in 423ms');
  assert.deepEqual([close.message, close.latency_ms], ['Close sell BTCUSD ticket 4318 profit -0.96', 423]);
  const modify = normalize('Modify BTCUSD ticket 24137 in 10ms');
  assert.deepEqual([modify.message, modify.latency_ms], ['Modify BTCUSD ticket 24137', 10]);
  const rejected = normalize('Order rejected buy BTCUSD 0.01: Quote is stale for BTCUSD in 2556ms');
  assert.equal(rejected.message, 'Order rejected buy BTCUSD 0.01: Quote is stale for BTCUSD in 2556ms');
  assert.equal(rejected.latency_ms, undefined);
  const canonical = normalize('Order sell XAUUSD 0.01 filled in 286ms', { latency_ms: 12.5 });
  assert.deepEqual([canonical.message, canonical.latency_ms], ['Order sell XAUUSD 0.01 filled', 12.5]);
  // Non-Gateway sources never parse durations.
  const terminal = normalizeJournalResponse({ logs: [{ type_text: 'Trade', source: 'Terminal', message: 'Order buy XAUUSD 0.01 filled in 286ms' }] }).logs[0];
  assert.equal(terminal.latency_ms, undefined);
});

// --- Filters and copy (§12.10, 11, 13, 16) ---------------------------------

test('time chips include the expected rows, rolling from now', () => {
  const agesMinutes = [30, 90, 150, 300, 600, 1200, 2880, 11520, 57600];
  const rows = agesMinutes.map((minutes, index) =>
    row({ id: `r${index}`, datetime: NOW_S - minutes * 60, message: `Journal row ${index}` }));
  const counts = JOURNAL_TIME_RANGES.map((range) => filterAll(rows, { timeRangeHours: range.hours }).length);
  assert.deepEqual(counts, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(buildJournalTsv(filterAll(rows, { timeRangeHours: 1 })).split('\n').length, 2);
});

test('type + time + search combine; type/errors filters wait for the matching response', () => {
  const rows = [
    row({ id: 'a', message: 'needle trade', type: 6 }),
    row({ id: 'b', message: 'needle system', type: 2, type_text: 'System' }),
    row({ id: 'c', message: 'needle old', datetime: NOW_S - 48 * 3600 }),
    row({ id: 'd', message: 'failed', code: 1, code_text: 'ERROR' }),
  ];
  assert.deepEqual(filterAll(rows, { type: 6, timeRangeHours: 24, search: 'needle' }).map((r) => r.id), ['a']);
  // While the Type request is in flight, previous rows stay unfiltered by type.
  assert.equal(filterAll(rows, { type: 6, responseMatchesRequest: false }).length, 4);
  assert.deepEqual(filterAll(rows, { mode: 1 }).map((r) => r.id), ['d']);
  // Search matches source too, case-insensitively.
  assert.equal(filterAll(rows, { search: 'GATEWAY' }).length, 4);
});

test('TSV copy: header, stored Type, sanitized cells, 2-decimal latency, no trailing newline', () => {
  const rows = [
    row({ id: '1', latency_ms: 8.125 }),
    row({ id: '2', latency_ms: 17.4 }),
    row({ id: '3', message: 'Order filled\twithout\ntiming' }),
  ];
  const tsv = buildJournalTsv(rows);
  const lines = tsv.split('\n');
  assert.equal(lines[0], 'Time\tCode\tType\tSource\tLatency\tMessage');
  assert.match(tsv, /Gateway\t8\.13 ms\tOrder sell XAUUSD 0\.01 filled/);
  assert.match(lines[2], /\t17\.4 ms\t/);
  assert.match(lines[3], /\tTrade\tGateway\t—\tOrder filled without timing$/);
  assert.equal(tsv.endsWith('\n'), false);
});

test('row keys stay unique for same-second identical rows without ids', () => {
  const keys = journalRowKeys([
    row({ client_order_id: 'o1' }),
    row({ client_order_id: 'o1' }),
    row(),
    row(),
  ]);
  assert.equal(new Set(keys).size, 4);
});

// --- Local rows, merge and readout (§12.17-22) ----------------------------

test('local rows: executed / failed / rejected messages and codes', () => {
  assert.equal(localJournalRow(sample()).message, 'Order executed buy XAUUSD 0.01');
  const failed = localJournalRow(sample({
    terminalStatus: 'failed', side: 'sell', volume: 0.02, errorCode: 'HTTP_503', errorMessage: 'Gateway unavailable', totalMs: 27.4,
  }));
  assert.equal(failed.message, 'Order failed sell XAUUSD 0.02: HTTP_503: Gateway unavailable');
  assert.equal(failed.code_text, 'HTTP_503');
  assert.equal(formatLatency(failed.latency_ms), '27.4 ms');
  const rejected = localJournalRow(sample({ terminalStatus: 'rejected', errorMessage: 'Quote is stale' }));
  assert.equal(rejected.message, 'Order rejected buy XAUUSD 0.01: Quote is stale');
  assert.equal(rejected.code_text, 'REJECTED');
  assert.equal(rejected.source, 'Terminal');
  assert.equal(rejected.datetime, NOW_S);
});

test('scoped samples: latest per client_order_id, other scopes and non-terminal phases dropped', () => {
  const samples = [
    sample({ clientOrderId: 'o1', terminalStatus: 'failed', totalMs: 30 }),
    sample({ clientOrderId: 'o1', terminalStatus: 'filled', totalMs: 42 }),
    sample({ clientOrderId: 'o2', sessionScope: 'other' }),
    sample({ clientOrderId: 'o3', phase: 'order_accepted' }),
  ];
  const scoped = scopedPlacementTerminalSamples(samples, SCOPE);
  assert.equal(scoped.length, 1);
  const merged = mergeJournalRows([], scoped);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].message, 'Order executed buy XAUUSD 0.01');
  assert.equal(merged[0].latency_ms, 42);
});

test('merge enriches a matching server row when statuses agree', () => {
  const server = [row({ client_order_id: 'o1', message: 'Order rejected buy XAUUSD 0.01: Quote is stale', code: 1, code_text: 'ERROR' })];
  const merged = mergeJournalRows(server, [sample({ clientOrderId: 'o1', terminalStatus: 'rejected', totalMs: 31.25 })]);
  assert.equal(merged.length, 1);
  assert.equal(formatLatency(merged[0].latency_ms), '31.25 ms');
});

test('merge keeps the server row unchanged when statuses contradict', () => {
  const server = [row({ client_order_id: 'o1', message: 'Order buy XAUUSD 0.01 filled' })];
  const merged = mergeJournalRows(server, [sample({ clientOrderId: 'o1', terminalStatus: 'failed', errorMessage: 'boom' })]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].latency_ms, undefined);
  assert.equal(merged[0].message, 'Order buy XAUUSD 0.01 filled');
});

test('merge never matches without an exact client_order_id; ties keep local rows first', () => {
  const server = [row({ message: 'Order buy XAUUSD 0.01 filled' })];
  const merged = mergeJournalRows(server, [sample({ clientOrderId: 'o9' })]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].source, 'Terminal');
});

test('last trade latency readout follows the candidate rules', () => {
  assert.equal(selectLastTradeLatencyMs([], SCOPE), undefined);
  const samples = [
    sample({ totalMs: 14.625 }),
    sample({ phase: 'order_filled', transport: 'websocket', terminalRttMs: 6.789, totalMs: 9 }),
    sample({ phase: 'order_accepted', totalMs: 1 }),
    sample({ sessionScope: 'other', totalMs: 2 }),
  ];
  assert.equal(selectLastTradeLatencyMs(samples, SCOPE), 9);
  assert.equal(selectLastTradeLatencyMs([...samples, sample({ phase: 'rest_completed', totalMs: 15 })], SCOPE), 15);
  assert.equal(
    selectLastTradeLatencyMs([sample({ phase: 'rest_failed', totalMs: undefined, restRttMs: 4 })], SCOPE),
    4,
  );
  assert.equal(selectLastTradeLatencyMs([sample({ totalMs: undefined })], SCOPE), undefined);
});
