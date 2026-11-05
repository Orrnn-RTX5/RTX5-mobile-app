export type ApiLatencySource =
  | 'apiClient'
  | 'auth'
  | 'publicDemo'
  | 'register'
  | 'broker'
  | 'brokerDirectory'
  | 'trade'
  | 'candles'
  | 'positions'
  | 'marketHealth'
  | 'unknown';

export type ApiLatencySample = {
  id: string;
  label: string;
  method: string;
  endpoint: string;
  status: number | null;
  ok: boolean;
  durationMs: number;
  source: ApiLatencySource;
  recordedAtIso: string;
  error?: string;
};

type ApiLatencyInput = {
  label: string;
  method?: string;
  endpoint?: string;
  source?: ApiLatencySource;
  status?: number | null;
  ok?: boolean;
  durationMs: number;
  error?: unknown;
};

type TimedFetchMeta = {
  label: string;
  method?: string;
  endpoint?: string;
  source?: ApiLatencySource;
  timeoutMs?: number;
};

const API_LATENCY_SAMPLE_LIMIT = 120;
const API_LATENCY_WARN_MS = 1000;
const API_LATENCY_SLOW_MS = 3000;
export const API_FETCH_TIMEOUT_MS = Math.max(
  1000,
  Number(process.env.EXPO_PUBLIC_API_FETCH_TIMEOUT_MS) || 7000,
);
const API_LATENCY_LOG_OK_RESPONSES =
  typeof process !== 'undefined' && process.env.EXPO_PUBLIC_DEBUG_API_LATENCY === 'true';
let samples: ApiLatencySample[] = [];

export const getApiLatencyNow = () =>
  typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now()
    : Date.now();

const createSampleId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Slow-API monitor rule (dev builds only, never production):
 * - >= API_LATENCY_SLOW_MS (3s, includes timeouts): console.warn, a delay the
 *   user clearly feels and worth a LogBox toast;
 * - >= API_LATENCY_WARN_MS (1s): console.log to Metro only;
 * - faster: silent unless EXPO_PUBLIC_DEBUG_API_LATENCY=true (console.log).
 * Fast failures (offline, 4xx) are expected and handled by callers, so they
 * never warn here.
 */
const shouldLogApiLatency = (severity: 'ok' | 'warn' | 'slow') =>
  typeof __DEV__ !== 'undefined' &&
  __DEV__ &&
  (severity !== 'ok' || API_LATENCY_LOG_OK_RESPONSES);

function normalizeError(error: unknown): string | undefined {
  if (!error) return undefined;
  return redactSensitiveString(error instanceof Error ? error.message : String(error));
}

export function sanitizeApiLatencyEndpoint(endpoint: string | undefined): string {
  if (!endpoint) return 'unknown';

  const maskAccountLogin = (value: string) =>
    value.replace(
      /(\/(?:api\/v\d+\/)?(?:accounts?|positions|orders|deals)\/)[^/?#]+/gi,
      '$1:login',
    );

  try {
    const parsed = new URL(endpoint);
    return redactSensitiveString(maskAccountLogin(`${parsed.pathname}${parsed.search}`));
  } catch (_error) {
    return redactSensitiveString(maskAccountLogin(endpoint));
  }
}

export function recordApiLatency(input: ApiLatencyInput): ApiLatencySample {
  const sample: ApiLatencySample = {
    id: createSampleId(),
    label: input.label,
    method: (input.method ?? 'GET').toUpperCase(),
    endpoint: sanitizeApiLatencyEndpoint(input.endpoint),
    status: input.status ?? null,
    ok: input.ok ?? false,
    durationMs: Math.round(input.durationMs),
    source: input.source ?? 'unknown',
    recordedAtIso: new Date().toISOString(),
    error: normalizeError(input.error),
  };

  samples = [sample, ...samples].slice(0, API_LATENCY_SAMPLE_LIMIT);

  const severity = sample.durationMs >= API_LATENCY_SLOW_MS
    ? 'slow'
    : sample.durationMs >= API_LATENCY_WARN_MS
      ? 'warn'
      : 'ok';

  if (shouldLogApiLatency(severity)) {
    const message =
      `[API ${severity}] ${sample.method} ${sample.endpoint} ${sample.status ?? 'ERR'} ` +
      `${sample.durationMs}ms (${sample.label})`;
    // Cold TLS connections on mobile data routinely take 3s+ and are not
    // actionable, so a LogBox toast is reserved for requests that reached the
    // fetch timeout (a stuck request). Everything else stays in Metro logs.
    if (sample.durationMs >= API_FETCH_TIMEOUT_MS) {
      console.warn(message);
    } else {
      console.log(message);
    }
  }

  return sample;
}

export function getApiLatencySamples(): ApiLatencySample[] {
  return samples;
}

export function clearApiLatencySamples() {
  samples = [];
}

const createTimeoutError = (timeoutMs: number) => {
  const error = new Error(`Request timed out after ${timeoutMs}ms`);
  error.name = 'AbortError';
  return error;
};

function createTimedFetchInit(init: RequestInit | undefined, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const state = { didTimeout: false };
  const createTimeoutPromise = (abort: () => void) =>
    new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        state.didTimeout = true;
        abort();
        reject(createTimeoutError(timeoutMs));
      }, timeoutMs);
    });

  if (typeof AbortController === 'undefined') {
    return {
      init,
      state,
      timeoutPromise: createTimeoutPromise(() => undefined),
      cleanup: () => {
        if (timeout) clearTimeout(timeout);
      },
    };
  }

  const existingSignal = init?.signal;
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();

  if (existingSignal?.aborted) {
    controller.abort();
  } else {
    existingSignal?.addEventListener('abort', abortFromCaller, { once: true });
  }

  return {
    init: {
      ...init,
      signal: controller.signal,
    },
    state,
    timeoutPromise: createTimeoutPromise(() => controller.abort()),
    cleanup: () => {
      if (timeout) clearTimeout(timeout);
      existingSignal?.removeEventListener('abort', abortFromCaller);
    },
  };
}

export async function timedFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  meta: TimedFetchMeta,
): Promise<Response> {
  const startedAtMs = getApiLatencyNow();
  const method = (meta.method ?? init?.method ?? 'GET').toUpperCase();
  const endpoint = meta.endpoint ?? String(input);
  const timeoutMs = meta.timeoutMs ?? API_FETCH_TIMEOUT_MS;
  // timeoutMs <= 0 (or non-finite) disables the client-side abort entirely.
  // Chart candle history uses this: a slow backend must be awaited, not failed
  // with "Request timed out". The caller's own AbortSignal still cancels.
  const hasClientTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0;
  const timedRequest = hasClientTimeout ? createTimedFetchInit(init, timeoutMs) : null;

  try {
    const fetchPromise = fetch(input, timedRequest ? timedRequest.init : init);
    fetchPromise.catch(() => undefined);
    const response = timedRequest
      ? await Promise.race([fetchPromise, timedRequest.timeoutPromise])
      : await fetchPromise;
    recordApiLatency({
      label: meta.label,
      method,
      endpoint,
      source: meta.source,
      status: response.status,
      ok: response.ok,
      durationMs: getApiLatencyNow() - startedAtMs,
    });
    return response;
  } catch (error) {
    const resolvedError = timedRequest?.state.didTimeout ? createTimeoutError(timeoutMs) : error;
    recordApiLatency({
      label: meta.label,
      method,
      endpoint,
      source: meta.source,
      status: null,
      ok: false,
      durationMs: getApiLatencyNow() - startedAtMs,
      error: resolvedError,
    });
    throw resolvedError;
  } finally {
    timedRequest?.cleanup();
  }
}
import { redactSensitiveString } from './securityRedaction';
