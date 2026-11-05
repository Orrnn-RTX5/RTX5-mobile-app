import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createChartContextCommitScheduler,
} from '../../src/features/chart/chartContextCommitScheduler';

type ScheduledJob = {
  work: () => void;
  cancelCount: number;
};

const createFakeSchedule = () => {
  const jobs: ScheduledJob[] = [];
  const schedule = (work: () => void) => {
    const job: ScheduledJob = { work, cancelCount: 0 };
    jobs.push(job);
    let cancelled = false;
    return () => {
      if (cancelled) return;
      cancelled = true;
      job.cancelCount += 1;
    };
  };
  return { jobs, schedule };
};

test('chart context scheduler starts preparation before deferring the heavy commit', () => {
  const { jobs, schedule } = createFakeSchedule();
  const scheduler = createChartContextCommitScheduler(schedule);
  const events: string[] = [];

  scheduler.request({
    prepare: () => events.push('prepare:EURJPY:M1'),
    commit: () => events.push('commit:EURJPY:M1'),
  });

  assert.deepEqual(events, ['prepare:EURJPY:M1']);
  assert.equal(jobs.length, 1);

  jobs[0].work();
  assert.deepEqual(events, ['prepare:EURJPY:M1', 'commit:EURJPY:M1']);
});

test('chart context scheduler keeps only the latest rapid symbol request', () => {
  const { jobs, schedule } = createFakeSchedule();
  const scheduler = createChartContextCommitScheduler(schedule);
  const prepared: string[] = [];
  const committed: string[] = [];

  scheduler.request({
    prepare: () => prepared.push('A'),
    commit: () => committed.push('A'),
  });
  scheduler.request({
    prepare: () => prepared.push('B'),
    commit: () => committed.push('B'),
  });

  assert.deepEqual(prepared, ['A', 'B']);
  assert.equal(jobs[0].cancelCount, 1);

  jobs[0].work();
  assert.deepEqual(committed, []);
  jobs[1].work();
  jobs[0].work();
  jobs[1].work();
  assert.deepEqual(committed, ['B']);
});

test('chart context scheduler cleanup is idempotent and rejects a cancelled callback', () => {
  const { jobs, schedule } = createFakeSchedule();
  const scheduler = createChartContextCommitScheduler(schedule);
  const committed: string[] = [];

  scheduler.request({
    prepare: () => undefined,
    commit: () => committed.push('A'),
  });
  scheduler.cancelPending();
  scheduler.cancelPending();

  assert.equal(jobs[0].cancelCount, 1);
  jobs[0].work();
  assert.deepEqual(committed, []);
});

test('chart context scheduler clears a completed handle before later cleanup', () => {
  const { jobs, schedule } = createFakeSchedule();
  const scheduler = createChartContextCommitScheduler(schedule);
  let commitCount = 0;

  scheduler.request({
    prepare: () => undefined,
    commit: () => {
      commitCount += 1;
    },
  });
  jobs[0].work();
  scheduler.cancelPending();

  assert.equal(commitCount, 1);
  assert.equal(jobs[0].cancelCount, 0);
});
