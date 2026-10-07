const coerceQuoteTimestampCandidate = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }

  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const resolveQuoteTickTimestamp = (
  payload: {
    timestamp?: unknown;
    timestampMs?: unknown;
    time?: unknown;
    timeMs?: unknown;
    t?: unknown;
    lastTickAt?: unknown;
    serverTime?: unknown;
    serverTimeMs?: unknown;
  },
  fallbackMs: number | null = null,
): number | null => {
  const candidates = [
    payload.timestampMs,
    payload.timeMs,
    payload.serverTimeMs,
    payload.timestamp,
    payload.time,
    payload.t,
    payload.lastTickAt,
    payload.serverTime,
  ];

  for (const candidate of candidates) {
    const normalized = coerceQuoteTimestampCandidate(candidate);
    if (normalized !== null) {
      return normalized;
    }
  }

  return fallbackMs;
};

export const normalizeQuoteTickTimestampToMs = (value: unknown): number | null => {
  const normalized = coerceQuoteTimestampCandidate(value);
  if (normalized === null) {
    return null;
  }

  if (normalized > 4.2e16) return Math.floor(normalized / 1_000_000);
  if (normalized > 4.2e13) return Math.floor(normalized / 1_000);
  if (normalized > 4.2e10) return Math.floor(normalized);
  return Math.floor(normalized * 1000);
};
