type SnapshotResponse = { ok: boolean; status: number; retryAfter?: string | null };
type BootstrapSnapshotRead<T extends SnapshotResponse> = {
  endpoint: string;
  read: () => Promise<T>;
  isCurrent: () => boolean;
  wait?: (delayMs: number) => Promise<void>;
  now?: () => number;
};

const TRANSIENT_RETRY_DELAY_MS = 500;
const MAX_RETRY_AFTER_MS = 5_000;
const supportsStartupRetry = (endpoint: string) =>
  endpoint === '/auth/me' || endpoint === '/instruments' || /^\/(?:account|positions)\/[^/?#]+$/.test(endpoint);

const responseRetryDelay = (status: number, retryAfter: unknown, now: number): number | null => {
  if (status === 408 || status >= 500 && status <= 599) return TRANSIENT_RETRY_DELAY_MS;
  if (status !== 429 || typeof retryAfter !== 'string' || !retryAfter.trim()) return null;
  const text = retryAfter.trim();
  const delay = /^\d+(?:\.\d+)?$/.test(text)
    ? Number(text) * 1000
    : Date.parse(text) - now;
  // Never retry sooner than requested, or keep a startup request sleeping for
  // an unbounded server delay. Later foreground/query refreshes can recover it.
  return Number.isFinite(delay) && delay >= 0 && delay <= MAX_RETRY_AFTER_MS ? delay : null;
};

const errorRetryDelay = (error: unknown, now: number): number | null => {
  if (!error || typeof error !== 'object') return null;
  const value = error as {
    name?: unknown; message?: unknown; status?: unknown; retryAfter?: unknown;
    response?: { status?: unknown; retryAfter?: unknown };
  };
  if (value.name === 'StaleBrokerSessionError' || value.name === 'SyntaxError') return null;
  const status = value.status ?? value.response?.status;
  if (typeof status === 'number') {
    return responseRetryDelay(status, value.retryAfter ?? value.response?.retryAfter, now);
  }
  const message = typeof value.message === 'string' ? value.message : '';
  // timedFetch uses AbortError for its own timeout, but caller/session aborts
  // must never be replayed. Only a positively identified timeout is retriable.
  const timedOut = /request timed out|network request timed out/i.test(message);
  if (value.name === 'AbortError') return timedOut ? TRANSIENT_RETRY_DELAY_MS : null;
  return timedOut || /network request failed|failed to fetch|fetch failed|network error/i.test(message)
    ? TRANSIENT_RETRY_DELAY_MS
    : null;
};

/** One independent recovery attempt; successful snapshots are never re-read. */
export async function readBootstrapSnapshot<T extends SnapshotResponse>({
  endpoint, read, isCurrent,
  wait = delayMs => new Promise(resolve => setTimeout(resolve, delayMs)),
  now = Date.now,
}: BootstrapSnapshotRead<T>): Promise<T | null> {
  if (!isCurrent()) return null;
  let retryDelay: number | null = null;
  let first: T;
  try {
    first = await read();
    if (first.ok || !supportsStartupRetry(endpoint)) return first;
    retryDelay = responseRetryDelay(first.status, first.retryAfter, now());
    if (retryDelay === null) return first;
  } catch (error) {
    if (!supportsStartupRetry(endpoint)) throw error;
    retryDelay = errorRetryDelay(error, now());
    if (retryDelay === null) throw error;
  }
  if (!isCurrent()) return null;
  await wait(retryDelay);
  if (!isCurrent()) return null;
  // No loop: another failure is returned/thrown to the existing fail-closed
  // bootstrap handler. Response provenance is still checked before any commit.
  return read();
}
