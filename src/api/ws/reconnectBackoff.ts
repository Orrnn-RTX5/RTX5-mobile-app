export type FullJitterBackoffOptions = Readonly<{
  attempt: number;
  baseMs: number;
  capMs: number;
  random?: () => number;
}>;

export type StableConnectionSuccessOptions = Readonly<{
  connectedAt: number;
  now: number;
  acceptedPayloadCount: number;
  stableAfterMs: number;
}>;

export type NextReconnectAttemptOptions = Readonly<{
  currentAttempt: number;
  maxAttempts: number;
  baseMs: number;
  capMs: number;
  random?: () => number;
}>;

export type NextReconnectAttempt =
  | Readonly<{ exhausted: true }>
  | Readonly<{ exhausted: false; attempt: number; delayMs: number }>;

/** A socket is healthy only after sustained time and at least one valid payload. */
export const hasStableConnectionSucceeded = ({
  connectedAt,
  now,
  acceptedPayloadCount,
  stableAfterMs,
}: StableConnectionSuccessOptions): boolean => Boolean(
  Number.isFinite(connectedAt) &&
  connectedAt > 0 &&
  Number.isFinite(now) &&
  now >= connectedAt &&
  Number.isFinite(acceptedPayloadCount) &&
  acceptedPayloadCount > 0 &&
  now - connectedAt >= Math.max(1, stableAfterMs),
);

/**
 * Exponential backoff with "full jitter". Attempt zero is bounded by the
 * base delay; every subsequent attempt doubles that bound up to the cap, then
 * samples uniformly inside it. The injectable RNG keeps the policy testable.
 */
export function resolveFullJitterBackoffMs({
  attempt,
  baseMs,
  capMs,
  random = Math.random,
}: FullJitterBackoffOptions): number {
  const safeAttempt = Math.max(0, Math.min(30, Math.floor(attempt)));
  const safeBase = Math.max(1, Math.floor(baseMs));
  const safeCap = Math.max(safeBase, Math.floor(capMs));
  const upperBound = Math.min(safeCap, safeBase * 2 ** safeAttempt);
  const sample = Math.max(0, Math.min(0.999999999, Number(random()) || 0));
  return Math.floor(sample * upperBound);
}

/** Advances one capped attempt before deriving its full-jitter delay. */
export function resolveNextReconnectAttempt({
  currentAttempt,
  maxAttempts,
  baseMs,
  capMs,
  random,
}: NextReconnectAttemptOptions): NextReconnectAttempt {
  const safeCurrentAttempt = Math.max(0, Math.floor(Number(currentAttempt) || 0));
  const safeMaxAttempts = Math.max(1, Math.floor(Number(maxAttempts) || 1));
  if (safeCurrentAttempt >= safeMaxAttempts) {
    return Object.freeze({ exhausted: true });
  }

  const attempt = safeCurrentAttempt + 1;
  return Object.freeze({
    exhausted: false,
    attempt,
    delayMs: resolveFullJitterBackoffMs({
      attempt: attempt - 1,
      baseMs,
      capMs,
      random,
    }),
  });
}
