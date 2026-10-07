import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AmbiguousModifyPositionOutcomeError,
  type ModifyPositionRequest,
} from '../../api/positions/modifyPositionWire';
import { createTradingApiError } from '../../api/tradingErrors';
import {
  ModifyPositionCoordinatorCore,
  type ModifyPositionCoordinatorDependencies,
  type ModifyPositionCoordinatorInput,
} from './modifyPositionCoordinatorCore';

type ControlledPromise<T> = Readonly<{
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}>;

const controlledPromise = <T>(): ControlledPromise<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return Object.freeze({ promise, resolve, reject });
};

const waitUntil = async (
  predicate: () => boolean,
  message: string,
): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  assert.fail(message);
};

const request = (priceSl: number, priceTp: number): ModifyPositionRequest =>
  Object.freeze({ price_sl: priceSl, price_tp: priceTp });

const input = (
  ticket: number,
  intent: ModifyPositionRequest,
  overrides: Partial<ModifyPositionCoordinatorInput> = {},
): ModifyPositionCoordinatorInput => Object.freeze({
  ticket,
  symbol: 'EURUSD',
  accountLogin: 900001,
  sessionKey: 'broker-a:900001:session-1',
  request: intent,
  ...overrides,
});

const matchingSnapshot = (
  job: ModifyPositionCoordinatorInput,
): Record<string, unknown> => ({
  ticket: job.ticket,
  symbol: job.symbol,
  price_sl: job.request.price_sl,
  price_tp: job.request.price_tp,
});

const coordinator = (
  dependencies: Pick<
    ModifyPositionCoordinatorDependencies,
    'modify' | 'readPositions' | 'commitPosition'
  > & Partial<ModifyPositionCoordinatorDependencies>,
): ModifyPositionCoordinatorCore => new ModifyPositionCoordinatorCore({
  isSessionCurrent: () => true,
  ...dependencies,
});

test('same-ticket jobs serialize and retain only the latest queued intent', async () => {
  const modifyGates = [
    controlledPromise<void>(),
    controlledPromise<void>(),
  ];
  const modifyCalls: ModifyPositionCoordinatorInput[] = [];
  const events: string[] = [];

  const core = coordinator({
    modify: (job) => {
      const gate = modifyGates[modifyCalls.length];
      modifyCalls.push(job);
      events.push(`modify:${job.request.price_sl}`);
      return gate.promise;
    },
    readPositions: async (job) => {
      events.push(`read:${job.request.price_sl}`);
      return [matchingSnapshot(job)];
    },
    commitPosition: () => {},
  });

  const firstInput = input(101, request(1.081, 1.091));
  const supersededInput = input(101, request(1.082, 1.092));
  const latestInput = input(101, request(1.083, 1.093));

  const first = core.submit(firstInput);
  await waitUntil(() => modifyCalls.length === 1, 'first mutation did not start');

  const superseded = core.submit(supersededInput);
  const latest = core.submit(latestInput);
  assert.equal(modifyCalls.length, 1, 'same-ticket PUTs must not overlap');
  assert.equal((await superseded).status, 'superseded');
  assert.deepEqual(
    core.getTicketState(101).queuedLatestIntent,
    latestInput.request,
  );

  modifyGates[0].resolve(undefined);
  assert.equal((await first).status, 'saved');
  await waitUntil(() => modifyCalls.length === 2, 'latest queued mutation did not start');
  assert.deepEqual(modifyCalls[1].request, latestInput.request);

  modifyGates[1].resolve(undefined);
  assert.equal((await latest).status, 'saved');
  assert.deepEqual(events, [
    'modify:1.081',
    'read:1.081',
    'modify:1.083',
    'read:1.083',
  ]);
  assert.equal(core.getTicketState(101).mutationEpoch, 2);
  assert.equal(core.getTicketState(101).phase, 'saved');
  assert.equal(core.getTicketState(101).queuedLatestIntent, undefined);
});

test('different tickets may execute concurrently', async () => {
  const gates = new Map([
    [201, controlledPromise<void>()],
    [202, controlledPromise<void>()],
  ]);
  let activeModifications = 0;
  let maximumActiveModifications = 0;
  const started: number[] = [];

  const core = coordinator({
    modify: async (job) => {
      started.push(job.ticket);
      activeModifications += 1;
      maximumActiveModifications = Math.max(
        maximumActiveModifications,
        activeModifications,
      );
      await gates.get(job.ticket)?.promise;
      activeModifications -= 1;
    },
    readPositions: async (job) => [matchingSnapshot(job)],
    commitPosition: () => {},
  });

  const first = core.submit(input(201, request(1.07, 1.1)));
  const second = core.submit(input(202, request(1.08, 1.11)));
  await waitUntil(
    () => started.length === 2,
    'different-ticket mutations did not start concurrently',
  );
  assert.equal(maximumActiveModifications, 2);

  gates.get(202)?.resolve(undefined);
  assert.equal((await second).status, 'saved');
  assert.equal(core.getTicketState(201).mutationInFlight, true);

  gates.get(201)?.resolve(undefined);
  assert.equal((await first).status, 'saved');
  assert.deepEqual(new Set(started), new Set([201, 202]));
});

test('out-of-order different-ticket GETs commit only their exact targets', async () => {
  const firstRead = controlledPromise<ReadonlyArray<Record<string, unknown>>>();
  const secondRead = controlledPromise<ReadonlyArray<Record<string, unknown>>>();
  const readsStarted: number[] = [];
  const ledger = new Map<number, ModifyPositionRequest>([
    [301, request(1.01, 1.11)],
    [302, request(1.02, 1.12)],
  ]);

  const core = coordinator({
    modify: async () => {},
    readPositions: (job) => {
      readsStarted.push(job.ticket);
      return job.ticket === 301 ? firstRead.promise : secondRead.promise;
    },
    commitPosition: (position, job) => {
      if (!position) {
        ledger.delete(job.ticket);
        return;
      }
      ledger.set(job.ticket, request(
        Number(position.price_sl),
        Number(position.price_tp),
      ));
    },
  });

  const firstJob = input(301, request(1.03, 1.13));
  const secondJob = input(302, request(1.04, 1.14));
  const first = core.submit(firstJob);
  const second = core.submit(secondJob);
  await waitUntil(() => readsStarted.length === 2, 'both ticket GETs did not start');

  secondRead.resolve([
    { ticket: 301, price_sl: 1.01, price_tp: 1.11 },
    matchingSnapshot(secondJob),
  ]);
  assert.equal((await second).status, 'saved');
  assert.deepEqual(ledger.get(302), secondJob.request);

  // This older whole-ledger response still contains ticket 302's old values.
  // Ticket 301's coordinator must not be allowed to roll ticket 302 backward.
  firstRead.resolve([
    matchingSnapshot(firstJob),
    { ticket: 302, price_sl: 1.02, price_tp: 1.12 },
  ]);
  assert.equal((await first).status, 'saved');
  assert.deepEqual(ledger.get(301), firstJob.request);
  assert.deepEqual(ledger.get(302), secondJob.request);
});

test('exact-target absence removes only that ticket', async () => {
  const missingJob = input(401, request(1.05, 1.15));
  const otherTicketState = request(1.06, 1.16);
  const ledger = new Map<number, ModifyPositionRequest>([
    [missingJob.ticket, request(1.01, 1.11)],
    [402, otherTicketState],
  ]);

  const core = coordinator({
    modify: async () => {},
    readPositions: async () => [{
      ticket: 402,
      price_sl: otherTicketState.price_sl,
      price_tp: otherTicketState.price_tp,
    }],
    commitPosition: (position, job) => {
      if (!position) {
        ledger.delete(job.ticket);
        return;
      }
      ledger.set(job.ticket, request(
        Number(position.price_sl),
        Number(position.price_tp),
      ));
    },
  });

  const result = await core.submit(missingJob);
  assert.equal(result.status, 'position_unavailable');
  assert.equal(ledger.has(missingJob.ticket), false);
  assert.deepEqual(ledger.get(402), otherTicketState);
});

test('coordinator rate-limit state requires a strict positive integer Retry-After', async () => {
  const cases = [
    { retryAfter: '17', expectedUntil: 18_000 },
    { retryAfter: '1.5', expectedUntil: undefined },
    { retryAfter: '60junk', expectedUntil: undefined },
    { retryAfter: '-1', expectedUntil: undefined },
  ] as const;

  for (const scenario of cases) {
    const job = input(450, request(1.07, 1.17));
    const core = new ModifyPositionCoordinatorCore({
      modify: async () => {
        throw createTradingApiError(
          429,
          { error: 'RATE_LIMITED', message: 'Wait before retrying.' },
          { 'retry-after': scenario.retryAfter },
        );
      },
      readPositions: async () => [matchingSnapshot(job)],
      commitPosition: () => {},
      isSessionCurrent: () => true,
      now: () => 1_000,
    });

    await core.submit(job);
    assert.equal(
      core.getTicketState(job.ticket).retryAfterUntil,
      scenario.expectedUntil,
      scenario.retryAfter,
    );
  }
});

test('only acknowledged or ambiguous PUT outcomes reconcile', async () => {
  const cases = [
    {
      name: 'acknowledged',
      modify: async () => {},
      expectedStatus: 'saved',
      matching: true,
      expectedReads: 1,
    },
    {
      name: 'structured rejection',
      modify: async () => {
        throw Object.assign(new Error('invalid stops'), { status: 422 });
      },
      expectedStatus: 'rejected',
      matching: false,
      expectedReads: 0,
    },
    {
      name: 'ambiguous response',
      modify: async () => {
        throw new AmbiguousModifyPositionOutcomeError('empty 200 response', 200);
      },
      expectedStatus: 'unknown',
      matching: false,
      expectedReads: 1,
    },
    {
      name: 'server failure',
      modify: async () => {
        throw Object.assign(new Error('gateway unavailable'), { status: 503 });
      },
      expectedStatus: 'unknown',
      matching: false,
      expectedReads: 1,
    },
    {
      name: 'missing position rejection',
      modify: async () => {
        throw Object.assign(new Error('position not found'), { status: 404 });
      },
      expectedStatus: 'rejected',
      matching: false,
      expectedReads: 1,
    },
  ] as const;

  for (const scenario of cases) {
    let reads = 0;
    let commits = 0;
    const job = input(301, request(1.08, 1.12));
    const core = coordinator({
      modify: scenario.modify,
      readPositions: async () => {
        reads += 1;
        return [{
          ticket: job.ticket,
          price_sl: scenario.matching ? job.request.price_sl : 1.075,
          price_tp: scenario.matching ? job.request.price_tp : 1.125,
        }];
      },
      commitPosition: () => {
        commits += 1;
      },
    });

    const result = await core.submit(job);
    assert.equal(result.status, scenario.expectedStatus, scenario.name);
    assert.equal(reads, scenario.expectedReads, scenario.name);
    assert.equal(commits, scenario.expectedReads, scenario.name);
    assert.equal(
      core.getTicketState(job.ticket).reconciliationFloorSequence,
      scenario.expectedReads,
    );
  }
});

test('a reconciliation failure preserves the original backend rejection', async () => {
  const backendError = Object.assign(new Error('position not found'), { status: 404 });
  const job = input(302, request(1.08, 1.12));
  const core = coordinator({
    modify: async () => {
      throw backendError;
    },
    readPositions: async () => {
      throw new Error('positions refresh unavailable');
    },
    commitPosition: () => {},
  });

  const result = await core.submit(job);
  assert.equal(result.status, 'rejected');
  assert.equal(result.error, backendError);
  assert.equal(core.getTicketState(job.ticket).phase, 'rejected');
});

test('the mutation transport starts synchronously before submit returns', async () => {
  const modifyGate = controlledPromise<void>();
  const job = input(303, request(1.08, 1.12));
  let modifyCalls = 0;
  const core = coordinator({
    modify: () => {
      modifyCalls += 1;
      return modifyGate.promise;
    },
    readPositions: async (currentJob) => [matchingSnapshot(currentJob)],
    commitPosition: () => {},
  });

  const resultPromise = core.submit(job);
  assert.equal(modifyCalls, 1);
  modifyGate.resolve(undefined);
  assert.equal((await resultPromise).status, 'saved');
});

test('a socket epoch change replaces a stale mandatory reconciliation before settling', async () => {
  const staleRead = controlledPromise<ReadonlyArray<Record<string, unknown>>>();
  const currentRead = controlledPromise<ReadonlyArray<Record<string, unknown>>>();
  const job = input(304, request(1.08, 1.12));
  let reads = 0;
  const core = coordinator({
    modify: async () => {},
    readPositions: () => {
      reads += 1;
      return reads === 1 ? staleRead.promise : currentRead.promise;
    },
    commitPosition: () => {},
  });

  const resultPromise = core.submit(job);
  await waitUntil(() => reads === 1, 'mandatory reconciliation did not start');
  core.notifySocketSubscription();
  staleRead.resolve([matchingSnapshot(job)]);
  await waitUntil(() => reads === 2, 'current socket-epoch reconciliation did not replace stale GET');
  currentRead.resolve([matchingSnapshot(job)]);

  assert.equal((await resultPromise).status, 'saved');
  assert.equal(reads, 2);
});

test('a socket-epoch-stale hint GET cannot commit and is replaced by a current GET', async () => {
  const staleRead = controlledPromise<ReadonlyArray<Record<string, unknown>>>();
  const currentRead = controlledPromise<ReadonlyArray<Record<string, unknown>>>();
  let reads = 0;
  const commits: Array<Record<string, unknown> | undefined> = [];
  const job = input(401, request(1.08, 1.12));

  const core = coordinator({
    modify: async () => {},
    readPositions: async (currentJob) => {
      reads += 1;
      if (reads === 1) return [matchingSnapshot(currentJob)];
      if (reads === 2) return staleRead.promise;
      return currentRead.promise;
    },
    commitPosition: (position) => {
      commits.push(position);
    },
  });

  assert.equal((await core.submit(job)).status, 'saved');
  commits.length = 0;

  core.notifyPositionsHint([job.ticket], job.accountLogin);
  await waitUntil(() => reads === 2, 'idle hint GET did not start');
  core.notifySocketSubscription();

  staleRead.resolve([{
    ticket: job.ticket,
    price_sl: 1.01,
    price_tp: 1.2,
  }]);
  await waitUntil(() => reads === 3, 'current socket-epoch GET did not replace stale GET');
  assert.equal(commits.length, 0, 'stale GET must be side-effect free');

  currentRead.resolve([matchingSnapshot(job)]);
  await waitUntil(() => commits.length === 1, 'current GET did not commit');
  await waitUntil(
    () => core.getTicketState(job.ticket).phase === 'saved',
    'current hint reconciliation did not settle',
  );
  const state = core.getTicketState(job.ticket);
  assert.equal(state.socketSubscriptionEpoch, 1);
  assert.equal(state.refreshSequence, 3);
  assert.equal(state.latestEligibleSequence, 3);
});

test('websocket hints queued before mandatory reconciliation are consumed by its GET', async () => {
  const modifyGate = controlledPromise<void>();
  const job = input(500, request(1.08, 1.12));
  let reads = 0;
  const core = coordinator({
    modify: () => modifyGate.promise,
    readPositions: async (currentJob) => {
      reads += 1;
      return [matchingSnapshot(currentJob)];
    },
    commitPosition: () => {},
  });

  const resultPromise = core.submit(job);
  await waitUntil(
    () => core.getTicketState(job.ticket).mutationInFlight,
    'mutation did not start',
  );
  core.notifyPositionsHint([job.ticket], job.accountLogin);
  core.notifyPositionsHint([job.ticket], job.accountLogin);
  modifyGate.resolve(undefined);

  assert.equal((await resultPromise).status, 'saved');
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  assert.equal(reads, 1);
  assert.equal(core.getTicketState(job.ticket).hintQueued, false);
});

test('a websocket hint during mandatory reconciliation refreshes in the background', async () => {
  const modifyGate = controlledPromise<void>();
  const mandatoryRead = controlledPromise<ReadonlyArray<Record<string, unknown>>>();
  const hintedRead = controlledPromise<ReadonlyArray<Record<string, unknown>>>();
  const job = input(501, request(1.08, 1.12));
  let modifyCalls = 0;
  let reads = 0;
  let commits = 0;

  const core = coordinator({
    modify: async () => {
      modifyCalls += 1;
      await modifyGate.promise;
    },
    readPositions: () => {
      reads += 1;
      return reads === 1 ? mandatoryRead.promise : hintedRead.promise;
    },
    commitPosition: () => {
      commits += 1;
    },
  });

  const resultPromise = core.submit(job);
  await waitUntil(() => modifyCalls === 1, 'mutation did not start');
  core.notifyPositionsHint([job.ticket], job.accountLogin);
  core.notifyPositionsHint([job.ticket], job.accountLogin);
  core.notifySocketSubscription();
  assert.equal(reads, 0, 'hint must not dispatch a GET while PUT is active');

  modifyGate.resolve(undefined);
  await waitUntil(() => reads === 1, 'mandatory reconciliation did not start');
  core.notifyPositionsHint([job.ticket], job.accountLogin);
  core.notifyPositionsHint([job.ticket], job.accountLogin);

  mandatoryRead.resolve([matchingSnapshot(job)]);
  assert.equal((await resultPromise).status, 'saved');
  await waitUntil(() => reads === 2, 'coalesced background hint GET did not start');
  assert.equal(
    core.getTicketState(job.ticket).activeAttemptId,
    undefined,
    'background freshness must not retain the active mutation attempt',
  );
  hintedRead.resolve([matchingSnapshot(job)]);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  assert.equal(reads, 2, 'multiple websocket hints must coalesce to one extra GET');
  assert.equal(commits, 2);
  assert.equal(core.getTicketState(job.ticket).hintQueued, false);
});

test('session reset invalidates active work and resolves queued work without reconciliation', async () => {
  const modifyGate = controlledPromise<void>();
  let currentSession = true;
  let reads = 0;
  let releases = 0;
  const firstInput = input(601, request(1.08, 1.12));
  const queuedInput = input(601, request(1.081, 1.121));

  const core = new ModifyPositionCoordinatorCore({
    modify: () => modifyGate.promise,
    readPositions: async () => {
      reads += 1;
      return [];
    },
    commitPosition: () => {},
    isSessionCurrent: () => currentSession,
    beginProtectedMutation: () => () => {
      releases += 1;
    },
  });

  const active = core.submit(firstInput);
  await waitUntil(
    () => core.getTicketState(firstInput.ticket).mutationInFlight,
    'active mutation did not enter pending state',
  );
  const queued = core.submit(queuedInput);

  currentSession = false;
  core.resetSession();
  assert.equal((await queued).status, 'session_changed');
  assert.equal(
    (await active).status,
    'session_changed',
    'session reset must settle active callers before their transport returns',
  );
  assert.equal(core.getTicketState(firstInput.ticket).phase, 'idle');

  modifyGate.resolve(undefined);
  assert.equal(reads, 0);
  await waitUntil(() => releases === 1, 'session-reset job did not release its mutation barrier');
  assert.equal(releases, 1);
});

test('unsubscribing every view does not cancel an already-started ticket job', async () => {
  const modifyGate = controlledPromise<void>();
  let modifyCalls = 0;
  let reads = 0;
  let commits = 0;
  let releases = 0;
  let notifications = 0;
  const job = input(701, request(1.08, 1.12));

  const core = new ModifyPositionCoordinatorCore({
    modify: async () => {
      modifyCalls += 1;
      await modifyGate.promise;
    },
    readPositions: async (currentJob) => {
      reads += 1;
      return [matchingSnapshot(currentJob)];
    },
    commitPosition: () => {
      commits += 1;
    },
    isSessionCurrent: () => true,
    beginProtectedMutation: () => () => {
      releases += 1;
    },
  });

  const unsubscribe = core.subscribe(job.ticket, () => {
    notifications += 1;
  });
  const resultPromise = core.submit(job);
  await waitUntil(() => modifyCalls === 1, 'mutation did not start');
  unsubscribe();

  modifyGate.resolve(undefined);
  assert.equal((await resultPromise).status, 'saved');
  assert.ok(notifications > 0, 'subscriber should observe the job before unmount');
  assert.equal(reads, 1);
  assert.equal(commits, 1);
  await waitUntil(() => releases === 1, 'completed job did not release its mutation barrier');
  assert.equal(releases, 1);
  assert.equal(core.getTicketState(job.ticket).phase, 'saved');
});

test('an explicit empty hint ticket list never fans out to retained entries', async () => {
  const job = input(801, request(1.08, 1.12));
  let reads = 0;
  const core = coordinator({
    modify: async () => {},
    readPositions: async (currentJob) => {
      reads += 1;
      return [matchingSnapshot(currentJob)];
    },
    commitPosition: () => {},
  });
  assert.equal((await core.submit(job)).status, 'saved');

  core.notifyPositionsHint([], job.accountLogin);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  assert.equal(reads, 1);
  assert.equal(core.getTicketState(job.ticket).phase, 'saved');

  core.notifyPositionsHint(undefined, job.accountLogin);
  await waitUntil(() => reads === 2, 'undefined all-ticket hint did not refresh');
});

test('socket resubscription does not fan out GETs for settled saved entries', async () => {
  const job = input(807, request(1.08, 1.12));
  let reads = 0;
  const core = coordinator({
    modify: async () => {},
    readPositions: async (currentJob) => {
      reads += 1;
      return [matchingSnapshot(currentJob)];
    },
    commitPosition: () => {},
  });
  assert.equal((await core.submit(job)).status, 'saved');

  core.notifySocketSubscription();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  assert.equal(reads, 1);
  assert.equal(core.getTicketState(job.ticket).socketSubscriptionEpoch, 1);
});

test('whole-stage reconciliation deadline settles unknown and releases mutation ownership', async () => {
  const never = controlledPromise<ReadonlyArray<Record<string, unknown>>>();
  const job = input(802, request(1.08, 1.12));
  let reconciliationSignal: AbortSignal | undefined;
  let releases = 0;
  const core = new ModifyPositionCoordinatorCore({
    modify: async () => {},
    readPositions: (_currentJob, signal) => {
      reconciliationSignal = signal;
      return never.promise;
    },
    commitPosition: () => {},
    isSessionCurrent: () => true,
    reconciliationTimeoutMs: 5,
    beginProtectedMutation: () => () => {
      releases += 1;
    },
  });

  const result = await core.submit(job);
  assert.equal(result.status, 'unknown');
  assert.equal(reconciliationSignal?.aborted, true);
  assert.equal(core.getTicketState(job.ticket).phase, 'unknown');
  assert.equal(core.getTicketState(job.ticket).mutationInFlight, false);
  assert.equal(core.getTicketState(job.ticket).activeAttemptId, undefined);
  await waitUntil(() => releases === 1, 'timed-out job did not release its barrier');
});

test('telemetry exceptions cannot strand a modify-position job', async () => {
  const job = input(803, request(1.08, 1.12));
  const core = new ModifyPositionCoordinatorCore({
    modify: async () => {},
    readPositions: async (currentJob) => [matchingSnapshot(currentJob)],
    commitPosition: () => {},
    isSessionCurrent: () => true,
    recordEvent: () => {
      throw new Error('telemetry unavailable');
    },
  });

  assert.equal((await core.submit(job)).status, 'saved');
  assert.equal(core.getTicketState(job.ticket).phase, 'saved');
});

test('a throwing session probe settles the active job instead of stranding it', async () => {
  const job = input(805, request(1.08, 1.12));
  const core = new ModifyPositionCoordinatorCore({
    modify: async () => {},
    readPositions: async () => [],
    commitPosition: () => {},
    isSessionCurrent: () => {
      throw new Error('session probe failed');
    },
  });

  const result = await core.submit(job);
  assert.equal(result.status, 'unknown');
  assert.equal(core.getTicketState(job.ticket).phase, 'unknown');
  assert.equal(core.getTicketState(job.ticket).activeAttemptId, undefined);
});

test('idle websocket hint bursts are bounded to one trailing refresh', async () => {
  const job = input(804, request(1.08, 1.12));
  const firstIdleRead = controlledPromise<ReadonlyArray<Record<string, unknown>>>();
  const trailingIdleRead = controlledPromise<ReadonlyArray<Record<string, unknown>>>();
  let reads = 0;
  const core = coordinator({
    modify: async () => {},
    readPositions: async (currentJob) => {
      reads += 1;
      if (reads === 1) return [matchingSnapshot(currentJob)];
      if (reads === 2) return firstIdleRead.promise;
      return trailingIdleRead.promise;
    },
    commitPosition: () => {},
  });
  assert.equal((await core.submit(job)).status, 'saved');

  core.notifyPositionsHint([job.ticket], job.accountLogin);
  await waitUntil(() => reads === 2, 'first idle refresh did not start');
  for (let index = 0; index < 5; index += 1) {
    core.notifyPositionsHint([job.ticket], job.accountLogin);
  }
  firstIdleRead.resolve([matchingSnapshot(job)]);
  await waitUntil(() => reads === 3, 'single trailing idle refresh did not start');
  for (let index = 0; index < 5; index += 1) {
    core.notifyPositionsHint([job.ticket], job.accountLogin);
  }
  trailingIdleRead.resolve([matchingSnapshot(job)]);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  assert.equal(reads, 3);
  assert.equal(core.getTicketState(job.ticket).hintQueued, false);
});

test('socket resubscription during a trailing idle GET forces one eligible replacement', async () => {
  const job = input(806, request(1.08, 1.12));
  const firstIdleRead = controlledPromise<ReadonlyArray<Record<string, unknown>>>();
  const staleTrailingRead = controlledPromise<ReadonlyArray<Record<string, unknown>>>();
  const replacementRead = controlledPromise<ReadonlyArray<Record<string, unknown>>>();
  let reads = 0;
  let commits = 0;
  const core = coordinator({
    modify: async () => {},
    readPositions: async (currentJob) => {
      reads += 1;
      if (reads === 1) return [matchingSnapshot(currentJob)];
      if (reads === 2) return firstIdleRead.promise;
      if (reads === 3) return staleTrailingRead.promise;
      return replacementRead.promise;
    },
    commitPosition: () => {
      commits += 1;
    },
  });
  assert.equal((await core.submit(job)).status, 'saved');

  core.notifyPositionsHint([job.ticket], job.accountLogin);
  await waitUntil(() => reads === 2, 'first idle GET did not start');
  core.notifyPositionsHint([job.ticket], job.accountLogin);
  firstIdleRead.resolve([matchingSnapshot(job)]);
  await waitUntil(() => reads === 3, 'trailing idle GET did not start');

  core.notifySocketSubscription();
  staleTrailingRead.resolve([matchingSnapshot(job)]);
  await waitUntil(() => reads === 4, 'socket-current replacement GET did not start');
  replacementRead.resolve([matchingSnapshot(job)]);
  await waitUntil(() => commits === 3, 'replacement GET did not commit');
  assert.equal(reads, 4);
  assert.equal(core.getTicketState(job.ticket).phase, 'saved');
});
