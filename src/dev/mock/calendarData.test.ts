import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import type { EconomicEvent } from './calendarData';

const compiled = ts.transpileModule(readFileSync(resolve(process.cwd(), 'src/api/economicCalendar.ts'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const raw = [{ title: 'Test event', country: 'USD', date: '2026-10-07T12:00:00Z', impact: 'high', forecast: '1', previous: '2' }];
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function fixture() {
  const timers = new Map<number, () => void>();
  const requests: Array<{ signal: AbortSignal; reply: ReturnType<typeof deferred<any>> }> = [];
  let timerId = 0;
  const exports = {} as {
    fetchEconomicCalendarData: () => Promise<EconomicEvent[]>;
    getInitialEconomicCalendarData: () => EconomicEvent[];
  };
  const fetchCalendar = (_url: string, { signal }: { signal: AbortSignal }) => {
      const reply = deferred<any>();
      requests.push({ signal, reply });
      return reply.promise;
    };
  runInNewContext(compiled, {
    exports, AbortController,
    setTimeout: (task: () => void) => { timers.set(++timerId, task); return timerId; },
    clearTimeout: (id: number) => timers.delete(id),
    require: () => ({ timedFetch: fetchCalendar }),

  });
  return { ...exports, timers, requests };
}

test('calendar prewarm and 30 simultaneous focus loads share one request and parsed result', async () => {
  const f = fixture();
  const loads = Array.from({ length: 30 }, () => f.fetchEconomicCalendarData());
  assert.equal(f.requests.length, 1);
  let parseCount = 0;
  f.requests[0].reply.resolve({ ok: true, json: async () => { parseCount++; return raw; } });
  const results = await Promise.all(loads);
  assert.equal(parseCount, 1);
  results.forEach(result => assert.equal(result, results[0]));
  assert.equal(await f.fetchEconomicCalendarData(), results[0]);
  assert.equal(f.requests.length, 1);
  assert.equal(f.timers.size, 0);
});

test('failed calendar requests reject without fabricated events and allow a later retry', async () => {
  const f = fixture();
  const fallback = f.getInitialEconomicCalendarData();
  const first = f.fetchEconomicCalendarData();
  const second = f.fetchEconomicCalendarData();
  const rejected = Promise.allSettled([first, second]);
  f.requests[0].reply.reject(new Error('offline'));
  assert.equal(fallback.length, 0);
  assert.ok((await rejected).every(result => result.status === 'rejected'));
  assert.equal(f.timers.size, 0);
  const retry = f.fetchEconomicCalendarData();
  assert.equal(f.requests.length, 2);
  f.requests[1].reply.resolve({ ok: true, json: async () => raw });
  assert.notEqual(await retry, fallback);
  assert.equal(f.timers.size, 0);
});

test('calendar timeout protects response body consumption and is removed after parse failure', async () => {
  const f = fixture();
  const body = deferred<unknown>();
  const pending = f.fetchEconomicCalendarData();
  f.requests[0].reply.resolve({ ok: true, json: () => body.promise });
  await Promise.resolve();
  assert.equal(f.timers.size, 1, 'timeout remains active while downloading the response body');
  for (const expire of f.timers.values()) expire();
  assert.equal(f.requests[0].signal.aborted, true);
  body.reject(new Error('body aborted'));
  await assert.rejects(pending, /body aborted/);
  assert.equal(f.timers.size, 0);
});
