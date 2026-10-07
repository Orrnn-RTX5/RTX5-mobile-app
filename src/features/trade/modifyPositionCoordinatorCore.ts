import {
  AmbiguousModifyPositionOutcomeError,
  normalizeReconciledProtectionValue,
  type ModifyPositionRequest,
} from '../../api/positions/modifyPositionWire';
import { parseRetryAfterSeconds } from '../../api/tradingErrors';

export type ModifyPositionCoordinatorPhase =
  | 'idle'
  | 'pending'
  | 'reconciling'
  | 'saved'
  | 'changed_elsewhere'
  | 'rejected'
  | 'unknown'
  | 'position_unavailable'
  | 'superseded'
  | 'rate_limited'
  | 'session_changed';

export type ModifyPositionCoordinatorResultStatus =
  Exclude<ModifyPositionCoordinatorPhase, 'idle' | 'pending' | 'reconciling'>;

export type ModifyPositionCoordinatorInput = Readonly<{
  ticket: number;
  symbol: string;
  accountLogin: number;
  sessionKey: string;
  request: ModifyPositionRequest;
}>;

export type ModifyPositionCoordinatorResult = Readonly<{
  status: ModifyPositionCoordinatorResultStatus;
  ticket: number;
  request: ModifyPositionRequest;
  snapshot?: Record<string, unknown>;
  error?: unknown;
}>;

export type TicketMutationState = Readonly<{
  mutationEpoch: number;
  mutationInFlight: boolean;
  activeIntent?: ModifyPositionRequest;
  confirmedBeforeAttempt?: ModifyPositionRequest;
  queuedLatestIntent?: ModifyPositionRequest;
  hintQueued: boolean;
  refreshSequence: number;
  reconciliationFloorSequence: number;
  latestEligibleSequence: number;
  socketSubscriptionEpoch: number;
  activeAttemptId?: string;
  phase: ModifyPositionCoordinatorPhase;
  retryAfterUntil?: number;
  lastResult?: ModifyPositionCoordinatorResult;
}>;

type PutOutcome =
  | Readonly<{ kind: 'acknowledged' }>
  | Readonly<{
      kind: 'rejected';
      error: unknown;
      requiresReconciliation: boolean;
    }>
  | Readonly<{ kind: 'unknown'; error: unknown }>
  | Readonly<{ kind: 'hint' }>;

type Deferred = Readonly<{
  promise: Promise<ModifyPositionCoordinatorResult>;
  resolve: (value: ModifyPositionCoordinatorResult) => void;
}>;

type QueuedJob = Readonly<{
  input: ModifyPositionCoordinatorInput;
  deferred: Deferred;
}>;

type ActiveJob = Readonly<{
  input: ModifyPositionCoordinatorInput;
  deferred: Deferred;
  generation: number;
}>;

type TicketEntry = {
  state: TicketMutationState;
  sessionKey: string;
  lastInput?: ModifyPositionCoordinatorInput;
  activeJob?: ActiveJob;
  queuedJob?: QueuedJob;
  idleHintInFlight: boolean;
  idleHintAllowsTrailing: boolean;
};

export type ModifyPositionCoordinatorDependencies = Readonly<{
  modify: (
    input: ModifyPositionCoordinatorInput,
    signal?: AbortSignal,
  ) => Promise<unknown>;
  readPositions: (
    input: ModifyPositionCoordinatorInput,
    signal?: AbortSignal,
  ) => Promise<ReadonlyArray<Record<string, unknown>>>;
  commitPosition: (
    position: Record<string, unknown> | undefined,
    input: ModifyPositionCoordinatorInput,
  ) => void;
  captureConfirmed?: (
    input: ModifyPositionCoordinatorInput,
  ) => ModifyPositionRequest | undefined;
  isSessionCurrent: (sessionKey: string) => boolean;
  now?: () => number;
  createAttemptId?: () => string;
  recordEvent?: (
    phase: string,
    input: ModifyPositionCoordinatorInput,
    details?: Record<string, unknown>,
  ) => void;
  beginProtectedMutation?: () => (() => void);
  mutationTimeoutMs?: number;
  reconciliationTimeoutMs?: number;
}>;

const EMPTY_STATE: TicketMutationState = Object.freeze({
  mutationEpoch: 0,
  mutationInFlight: false,
  hintQueued: false,
  refreshSequence: 0,
  reconciliationFloorSequence: 0,
  latestEligibleSequence: 0,
  socketSubscriptionEpoch: 0,
  phase: 'idle',
});

const createDeferred = (): Deferred => {
  let resolve!: (value: ModifyPositionCoordinatorResult) => void;
  const promise = new Promise<ModifyPositionCoordinatorResult>((next) => {
    resolve = next;
  });
  return Object.freeze({ promise, resolve });
};

class ModifyPositionStageTimeoutError extends Error {
  constructor(stage: 'request' | 'reconciliation', timeoutMs: number) {
    super(`Modify Position ${stage} timed out after ${timeoutMs}ms.`);
    this.name = 'AbortError';
  }
}

const errorStatus = (error: unknown): number | undefined => {
  if (!error || typeof error !== 'object') return undefined;
  const source = error as Record<string, unknown>;
  if (typeof source.status === 'number') return source.status;
  const response = source.response;
  if (response && typeof response === 'object') {
    const status = (response as Record<string, unknown>).status;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
};

const retryAfterSeconds = (error: unknown): number | null => {
  if (!error || typeof error !== 'object') return null;
  const source = error as Record<string, unknown>;
  const headers = (
    source.headers && typeof source.headers === 'object'
      ? source.headers
      : source.response && typeof source.response === 'object'
        ? (source.response as Record<string, unknown>).headers
        : null
  ) as Record<string, unknown> | null;
  return parseRetryAfterSeconds(headers?.['retry-after']);
};

const classifyPutError = (error: unknown): PutOutcome => {
  const status = errorStatus(error);
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (
    error instanceof AmbiguousModifyPositionOutcomeError ||
    status === 504 ||
    name === 'AbortError' ||
    /timeout|timed out|network request failed|failed to fetch|load failed|connection reset/i.test(message)
  ) {
    return Object.freeze({ kind: 'unknown', error });
  }
  const deterministicNoApplyStatus =
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 422 ||
    status === 429;
  return status !== undefined && status >= 400 && status < 500 && status !== 408
    ? Object.freeze({
        kind: 'rejected',
        error,
        requiresReconciliation: !deterministicNoApplyStatus,
      })
    : Object.freeze({ kind: 'unknown', error });
};

const resolveRowTicket = (row: Record<string, unknown>): number | null => {
  const value = row.ticket;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value.trim())) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
};

const sameIntent = (
  row: Record<string, unknown>,
  request: ModifyPositionRequest,
): boolean => (
  (
    !Object.prototype.hasOwnProperty.call(request, 'price_sl') ||
    normalizeReconciledProtectionValue(row.price_sl) ===
      normalizeReconciledProtectionValue(request.price_sl)
  ) &&
  (
    !Object.prototype.hasOwnProperty.call(request, 'price_tp') ||
    normalizeReconciledProtectionValue(row.price_tp) ===
      normalizeReconciledProtectionValue(request.price_tp)
  )
);

export class ModifyPositionCoordinatorCore {
  private readonly entries = new Map<string, TicketEntry>();
  private readonly listeners = new Map<string, Set<() => void>>();
  private generation = 0;
  private socketSubscriptionEpoch = 0;
  private fallbackAttemptSequence = 0;

  constructor(private readonly dependencies: ModifyPositionCoordinatorDependencies) {}

  getTicketState(ticket: string | number): TicketMutationState {
    return this.entries.get(String(ticket))?.state ?? EMPTY_STATE;
  }

  subscribe(ticket: string | number, listener: () => void): () => void {
    const key = String(ticket);
    const listeners = this.listeners.get(key) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(key, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(key);
    };
  }

  submit(input: ModifyPositionCoordinatorInput): Promise<ModifyPositionCoordinatorResult> {
    const entry = this.getOrCreateEntry(input);
    const now = this.now();
    if ((entry.state.retryAfterUntil ?? 0) > now) {
      return Promise.resolve(Object.freeze({
        status: 'rate_limited',
        ticket: input.ticket,
        request: input.request,
      }));
    }

    const deferred = createDeferred();
    if (entry.activeJob) {
      entry.queuedJob?.deferred.resolve(Object.freeze({
        status: 'superseded',
        ticket: entry.queuedJob.input.ticket,
        request: entry.queuedJob.input.request,
      }));
      entry.queuedJob = Object.freeze({ input, deferred });
      this.patchState(entry, {
        queuedLatestIntent: input.request,
      });
      return deferred.promise;
    }

    const activeJob = Object.freeze({
      input,
      deferred,
      generation: this.generation,
    });
    entry.activeJob = activeJob;
    entry.lastInput = input;
    void this.runMutationJob(entry, activeJob);
    return deferred.promise;
  }

  notifyPositionsHint(
    tickets?: ReadonlyArray<string | number>,
    accountLogin?: string | number,
  ): void {
    // `undefined` is the intentional all-ticket signal used after a protected
    // global positions refresh. An explicit empty list means no affected
    // tickets and must never fan out to every retained coordinator entry.
    const ticketSet = tickets === undefined
      ? null
      : new Set(tickets.map((ticket) => String(ticket)));
    for (const [key, entry] of this.entries) {
      if (ticketSet && !ticketSet.has(key)) continue;
      if (
        accountLogin !== undefined &&
        entry.lastInput &&
        String(entry.lastInput.accountLogin) !== String(accountLogin)
      ) {
        continue;
      }
      if (!entry.lastInput) continue;
      if (entry.idleHintInFlight && !entry.idleHintAllowsTrailing) {
        continue;
      }
      this.patchState(entry, { hintQueued: true });
      this.record('websocket_hint', entry.lastInput, {
        mutationEpoch: entry.state.mutationEpoch,
        socketEpoch: entry.state.socketSubscriptionEpoch,
        mutationInFlight: entry.state.mutationInFlight,
      });
      if (!entry.activeJob && !entry.idleHintInFlight) {
        void this.runIdleHint(entry);
      }
    }
  }

  notifySocketSubscription(): void {
    this.socketSubscriptionEpoch += 1;
    for (const entry of this.entries.values()) {
      const shouldRefresh = Boolean(
        entry.lastInput &&
        (
          entry.activeJob ||
          entry.idleHintInFlight ||
          entry.state.phase === 'unknown' ||
          entry.state.phase === 'reconciling'
        ),
      );
      if (entry.idleHintInFlight) {
        // A socket epoch change invalidates the current GET and must force one
        // eligible replacement even during the otherwise bounded trailing pass.
        entry.idleHintAllowsTrailing = true;
      }
      this.patchState(entry, {
        socketSubscriptionEpoch: this.socketSubscriptionEpoch,
        hintQueued: shouldRefresh,
      });
      if (entry.lastInput && shouldRefresh) {
        this.record('socket_subscription', entry.lastInput, {
          socketEpoch: this.socketSubscriptionEpoch,
        });
      }
      if (shouldRefresh && entry.lastInput && !entry.activeJob && !entry.idleHintInFlight) {
        void this.runIdleHint(entry);
      }
    }
  }

  resetSession(): void {
    this.generation += 1;
    this.socketSubscriptionEpoch = 0;
    for (const [key, entry] of this.entries) {
      entry.activeJob?.deferred.resolve(Object.freeze({
        status: 'session_changed',
        ticket: entry.activeJob.input.ticket,
        request: entry.activeJob.input.request,
      }));
      entry.queuedJob?.deferred.resolve(Object.freeze({
        status: 'session_changed',
        ticket: entry.queuedJob.input.ticket,
        request: entry.queuedJob.input.request,
      }));
      this.entries.delete(key);
      this.emit(key);
    }
  }

  private getOrCreateEntry(input: ModifyPositionCoordinatorInput): TicketEntry {
    const key = String(input.ticket);
    const existing = this.entries.get(key);
    if (existing?.sessionKey === input.sessionKey) {
      return existing;
    }
    const entry: TicketEntry = {
      state: Object.freeze({
        ...EMPTY_STATE,
        socketSubscriptionEpoch: this.socketSubscriptionEpoch,
      }),
      sessionKey: input.sessionKey,
      idleHintInFlight: false,
      idleHintAllowsTrailing: false,
    };
    this.entries.set(key, entry);
    this.emit(key);
    return entry;
  }

  private async runMutationJob(entry: TicketEntry, job: ActiveJob): Promise<void> {
    let releaseBarrier: (() => void) | undefined;
    try {
      releaseBarrier = this.dependencies.beginProtectedMutation?.();
      await this.runProtectedMutationJob(entry, job);
    } catch (error) {
      this.finishUnexpectedJob(entry, job, error);
    } finally {
      try {
        releaseBarrier?.();
      } catch (error) {
        this.record('mutation_barrier_release_error', job.input, {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async runProtectedMutationJob(entry: TicketEntry, job: ActiveJob): Promise<void> {
    const { input } = job;
    const mutationEpoch = entry.state.mutationEpoch + 1;
    const attemptId = this.createAttemptId();
    const confirmedBeforeAttempt = this.dependencies.captureConfirmed?.(input);
    entry.lastInput = input;
    this.patchState(entry, {
      mutationEpoch,
      mutationInFlight: true,
      activeIntent: input.request,
      confirmedBeforeAttempt,
      queuedLatestIntent: entry.queuedJob?.input.request,
      hintQueued: false,
      activeAttemptId: attemptId,
      phase: 'pending',
      lastResult: undefined,
    });
    this.record('request_start', input, { mutationEpoch, attemptId });

    let putOutcome: PutOutcome;
    try {
      await this.runStage(
        (signal) => this.dependencies.modify(input, signal),
        this.dependencies.mutationTimeoutMs,
        'request',
      );
      putOutcome = Object.freeze({ kind: 'acknowledged' });
      this.record('request_end', input, {
        mutationEpoch,
        attemptId,
        outcome: 'acknowledged',
        status: 200,
      });
    } catch (error) {
      putOutcome = classifyPutError(error);
      this.record('request_end', input, {
        mutationEpoch,
        attemptId,
        outcome: putOutcome.kind,
        status: errorStatus(error),
      });
      if (errorStatus(error) === 429) {
        const seconds = retryAfterSeconds(error);
        if (seconds) {
          this.patchState(entry, { retryAfterUntil: this.now() + seconds * 1000 });
        }
      }
    }

    if (!this.isJobCurrent(entry, job, mutationEpoch)) {
      this.finishSessionChangedJob(entry, job);
      return;
    }

    // A deterministic client/backend rejection did not apply the mutation.
    // Surface its original error immediately instead of hiding it behind a
    // second request. Ambiguous/network/5xx outcomes still reconcile below.
    if (putOutcome.kind === 'rejected' && !putOutcome.requiresReconciliation) {
      this.completeActiveJob(entry, job, Object.freeze({
        status: 'rejected',
        ticket: input.ticket,
        request: input.request,
        error: putOutcome.error,
      }));
      return;
    }

    this.patchState(entry, {
      mutationInFlight: false,
      // Any websocket hint observed before this point is subsumed by the
      // causally newer mandatory authoritative GET.
      hintQueued: false,
      phase: 'reconciling',
    });
    let result = await this.dispatchReconciliation(
      entry,
      input,
      mutationEpoch,
      putOutcome,
      true,
    );

    // A socket resubscription changes the epoch and deliberately invalidates
    // the in-flight GET. Replace that stale mandatory read once before
    // reporting an outcome; ordinary position hints remain background work.
    if (
      result === null &&
      this.isJobCurrent(entry, job, mutationEpoch) &&
      entry.state.hintQueued
    ) {
      this.patchState(entry, { hintQueued: false });
      result = await this.dispatchReconciliation(
        entry,
        input,
        mutationEpoch,
        putOutcome,
        true,
      );
    }

    if (!this.isJobCurrent(entry, job, mutationEpoch)) {
      this.finishSessionChangedJob(entry, job);
      return;
    }

    const finalResult = result ?? Object.freeze({
      status: 'unknown' as const,
      ticket: input.ticket,
      request: input.request,
    });
    this.completeActiveJob(entry, job, finalResult);
  }

  private async runIdleHint(
    entry: TicketEntry,
    allowTrailing = true,
  ): Promise<void> {
    const input = entry.lastInput;
    if (!input || entry.activeJob || entry.idleHintInFlight) return;
    entry.idleHintInFlight = true;
    entry.idleHintAllowsTrailing = allowTrailing;
    this.patchState(entry, {
      hintQueued: false,
    });
    const mutationEpoch = entry.state.mutationEpoch;
    try {
      await this.dispatchReconciliation(
        entry,
        input,
        mutationEpoch,
        Object.freeze({ kind: 'hint' }),
        false,
      );
    } catch (error) {
      // dispatchReconciliation owns expected transport failures. This guard is
      // for unexpected frontend exceptions and must still release idle state.
      this.record('idle_reconciliation_error', input, {
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      const shouldRunTrailing = Boolean(
        entry.idleHintAllowsTrailing && entry.state.hintQueued && !entry.activeJob,
      );
      entry.idleHintInFlight = false;
      entry.idleHintAllowsTrailing = false;
      if (!entry.activeJob && entry.state.hintQueued) {
        this.patchState(entry, { hintQueued: false });
      }
      if (shouldRunTrailing) {
        void this.runIdleHint(entry, false);
      }
    }
  }

  private async dispatchReconciliation(
    entry: TicketEntry,
    input: ModifyPositionCoordinatorInput,
    mutationEpoch: number,
    putOutcome: PutOutcome,
    mandatory: boolean,
  ): Promise<ModifyPositionCoordinatorResult | null> {
    const sequence = entry.state.refreshSequence + 1;
    const socketEpoch = entry.state.socketSubscriptionEpoch;
    this.patchState(entry, {
      refreshSequence: sequence,
      latestEligibleSequence: sequence,
      ...(mandatory
        ? { reconciliationFloorSequence: sequence, phase: 'reconciling' as const }
        : {}),
    });
    this.record('reconciliation_start', input, {
      mutationEpoch,
      sequence,
      socketEpoch,
      mandatory,
    });

    try {
      const positions = await this.runStage(
        (signal) => this.dependencies.readPositions(input, signal),
        this.dependencies.reconciliationTimeoutMs,
        'reconciliation',
      );
      if (!this.isReconciliationEligible(
        entry,
        input,
        mutationEpoch,
        socketEpoch,
        sequence,
      )) {
        return null;
      }
      const snapshot = positions.find((row) => resolveRowTicket(row) === input.ticket);
      let authoritativeSnapshot: Record<string, unknown> | undefined;
      if (snapshot) {
        // Validate the exact target before committing that ticket's authoritative row.
        // Only missing/null are valid clear representations; malformed values
        // must not be silently converted into a confirmed clear.
        authoritativeSnapshot = Object.freeze({
          ...snapshot,
          price_sl: normalizeReconciledProtectionValue(snapshot.price_sl),
          price_tp: normalizeReconciledProtectionValue(snapshot.price_tp),
        });
      }
      // A reconciliation GET returns the whole open-position ledger, but this
      // ticket coordinator owns only its exact target. Committing unrelated
      // rows lets an older GET for ticket A roll back a newer ticket B.
      this.dependencies.commitPosition(authoritativeSnapshot, input);
      this.record('store_commit', input, {
        mutationEpoch,
        sequence,
        attemptId: entry.state.activeAttemptId,
      });
      if (!this.isReconciliationEligible(
        entry,
        input,
        mutationEpoch,
        socketEpoch,
        sequence,
      )) {
        return null;
      }

      let result: ModifyPositionCoordinatorResult;
      if (!snapshot) {
        result = Object.freeze({
          status: 'position_unavailable',
          ticket: input.ticket,
          request: input.request,
        });
      } else if (sameIntent(authoritativeSnapshot ?? snapshot, input.request)) {
        result = Object.freeze({
          status: 'saved',
          ticket: input.ticket,
          request: input.request,
          snapshot: authoritativeSnapshot,
        });
      } else {
        result = Object.freeze({
          status: putOutcome.kind === 'rejected'
            ? 'rejected'
            : putOutcome.kind === 'unknown'
              ? 'unknown'
              : 'changed_elsewhere',
          ticket: input.ticket,
          request: input.request,
          snapshot: authoritativeSnapshot,
          ...(putOutcome.kind === 'rejected' || putOutcome.kind === 'unknown'
            ? { error: putOutcome.error }
            : {}),
        });
      }
      this.patchState(entry, {
        phase: result.status,
        lastResult: result,
      });
      this.record('reconciliation_end', input, {
        mutationEpoch,
        sequence,
        outcome: result.status,
      });
      return result;
    } catch (error) {
      if (!this.isReconciliationEligible(
        entry,
        input,
        mutationEpoch,
        socketEpoch,
        sequence,
      )) {
        return null;
      }
      const result = Object.freeze({
        status: putOutcome.kind === 'rejected' ? 'rejected' as const : 'unknown' as const,
        ticket: input.ticket,
        request: input.request,
        error: putOutcome.kind === 'rejected' ? putOutcome.error : error,
      });
      this.patchState(entry, {
        phase: result.status,
        lastResult: result,
      });
      this.record('reconciliation_end', input, {
        mutationEpoch,
        sequence,
        outcome: result.status,
        status: errorStatus(error),
      });
      return result;
    }
  }

  private completeActiveJob(
    entry: TicketEntry,
    job: ActiveJob,
    result: ModifyPositionCoordinatorResult,
  ): void {
    if (entry.activeJob !== job) {
      job.deferred.resolve(result);
      return;
    }

    this.patchState(entry, {
      mutationInFlight: false,
      activeAttemptId: undefined,
      activeIntent: undefined,
      confirmedBeforeAttempt: undefined,
      phase: result.status === 'superseded' ||
        result.status === 'rate_limited' ||
        result.status === 'session_changed'
        ? 'unknown'
        : result.status,
      lastResult: result,
    });
    job.deferred.resolve(result);
    entry.activeJob = undefined;

    const queued = entry.queuedJob;
    entry.queuedJob = undefined;
    this.patchState(entry, { queuedLatestIntent: undefined });
    if (queued) {
      const nextJob = Object.freeze({
        input: queued.input,
        deferred: queued.deferred,
        generation: this.generation,
      });
      entry.activeJob = nextJob;
      entry.lastInput = queued.input;
      void this.runMutationJob(entry, nextJob);
      return;
    }
    if (entry.state.hintQueued && !entry.idleHintInFlight) {
      void this.runIdleHint(entry);
    }
  }

  private finishSessionChangedJob(entry: TicketEntry, job: ActiveJob): void {
    const result = Object.freeze({
      status: 'session_changed' as const,
      ticket: job.input.ticket,
      request: job.input.request,
    });
    job.deferred.resolve(result);
    if (entry.activeJob !== job) return;
    entry.activeJob = undefined;
    entry.queuedJob?.deferred.resolve(Object.freeze({
      status: 'session_changed',
      ticket: entry.queuedJob.input.ticket,
      request: entry.queuedJob.input.request,
    }));
    entry.queuedJob = undefined;
  }

  private finishUnexpectedJob(
    entry: TicketEntry,
    job: ActiveJob,
    error: unknown,
  ): void {
    if (
      entry.activeJob !== job ||
      job.generation !== this.generation
    ) {
      this.finishSessionChangedJob(entry, job);
      return;
    }
    let sessionCurrent: boolean;
    try {
      sessionCurrent = this.dependencies.isSessionCurrent(job.input.sessionKey);
    } catch {
      sessionCurrent = true;
    }
    if (!sessionCurrent) {
      this.finishSessionChangedJob(entry, job);
      return;
    }
    this.record('coordinator_error', job.input, {
      message: error instanceof Error ? error.message : String(error),
    });
    this.completeActiveJob(entry, job, Object.freeze({
      status: 'unknown',
      ticket: job.input.ticket,
      request: job.input.request,
      error,
    }));
  }

  private runStage<T>(
    operation: (signal?: AbortSignal) => Promise<T>,
    timeoutMs: number | undefined,
    stage: 'request' | 'reconciliation',
  ): Promise<T> {
    const controller = typeof AbortController === 'undefined'
      ? null
      : new AbortController();
    // Start synchronously so the API layer captures the same broker/session
    // owner before submit() returns. Deferring this call to a microtask would
    // let an immediate account switch retarget an old ticket to a new session.
    let pending: Promise<T>;
    try {
      pending = Promise.resolve(operation(controller?.signal));
    } catch (error) {
      pending = Promise.reject(error);
    }
    if (!Number.isFinite(timeoutMs) || !(Number(timeoutMs) > 0)) {
      return pending;
    }

    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callback();
      };
      const timer = setTimeout(() => {
        controller?.abort();
        finish(() => reject(new ModifyPositionStageTimeoutError(
          stage,
          Number(timeoutMs),
        )));
      }, Number(timeoutMs));
      pending.then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(error)),
      );
    });
  }

  private isJobCurrent(
    entry: TicketEntry,
    job: ActiveJob,
    mutationEpoch: number,
  ): boolean {
    return (
      entry.activeJob === job &&
      job.generation === this.generation &&
      entry.state.mutationEpoch === mutationEpoch &&
      this.dependencies.isSessionCurrent(job.input.sessionKey)
    );
  }

  private isReconciliationEligible(
    entry: TicketEntry,
    input: ModifyPositionCoordinatorInput,
    mutationEpoch: number,
    socketEpoch: number,
    sequence: number,
  ): boolean {
    return (
      entry.sessionKey === input.sessionKey &&
      this.dependencies.isSessionCurrent(input.sessionKey) &&
      entry.state.mutationEpoch === mutationEpoch &&
      entry.state.socketSubscriptionEpoch === socketEpoch &&
      sequence >= entry.state.reconciliationFloorSequence &&
      sequence === entry.state.latestEligibleSequence
    );
  }

  private patchState(entry: TicketEntry, patch: Partial<TicketMutationState>): void {
    entry.state = Object.freeze({ ...entry.state, ...patch });
    const ticket = entry.lastInput?.ticket ?? entry.activeJob?.input.ticket;
    if (ticket !== undefined) this.emit(String(ticket));
  }

  private emit(key: string): void {
    for (const listener of this.listeners.get(key) ?? []) {
      try {
        listener();
      } catch {
        // One view subscription must never strand the shared mutation worker.
      }
    }
  }

  private now(): number {
    return this.dependencies.now?.() ?? Date.now();
  }

  private createAttemptId(): string {
    if (this.dependencies.createAttemptId) return this.dependencies.createAttemptId();
    this.fallbackAttemptSequence += 1;
    return `modify-${this.now().toString(36)}-${this.fallbackAttemptSequence.toString(36)}`;
  }

  private record(
    phase: string,
    input: ModifyPositionCoordinatorInput,
    details: Record<string, unknown>,
  ): void {
    try {
      this.dependencies.recordEvent?.(phase, input, details);
    } catch {
      // Telemetry is best-effort and never owns mutation progress.
    }
  }
}
