export const REDACTED_SECRET = '[redacted]';
const MAX_REDACTION_DEPTH = 8;

const SENSITIVE_AUTH_KEY_NAMES = new Set([
  'accesstoken',
  'apikey',
  'authorization',
  'brokerfeedtoken',
  'clientsecret',
  'cookie',
  'credentials',
  'feedbrokertoken',
  'feedtoken',
  'idtoken',
  'marketdatafeedtoken',
  'marketdatatoken',
  'password',
  'passcode',
  'passwd',
  'proxyauthorization',
  'quotefeedtoken',
  'refreshtoken',
  'secret',
  'sessiontoken',
  'setcookie',
  'token',
  'wsfeedtoken',
]);

const SENSITIVE_STRING_KEY_PATTERN =
  '(?:access[_-]?token|api[_-]?key|authorization|broker[_-]?feed[_-]?token|client[_-]?secret|cookie|credentials|feed[_-]?broker[_-]?token|feed[_-]?token|id[_-]?token|market[_-]?data[_-]?(?:feed[_-]?)?token|password|passcode|passwd|proxy[_-]?authorization|quote[_-]?feed[_-]?token|refresh[_-]?token|secret|session[_-]?token|set[_-]?cookie|token|ws[_-]?feed[_-]?token)';

const normalizeSensitiveKey = (key: string): string =>
  key.toLowerCase().replace(/[^a-z0-9]/g, '');

export const isSensitiveAuthKey = (key: string): boolean =>
  {
    const normalized = normalizeSensitiveKey(key);
    if (SENSITIVE_AUTH_KEY_NAMES.has(normalized)) return true;

    // Header maps commonly retain vendor prefixes (x-api-key,
    // x-auth-token, x-feed-token). Diagnostics should be conservative: any
    // structured key ending in a credential-bearing suffix is secret even
    // when the backend invents a prefix that mobile does not know yet.
    return [
      'apikey',
      'authorization',
      'authtoken',
      'cookie',
      'credentials',
      'password',
      'passcode',
      'passwd',
      'secret',
      'token',
    ].some((suffix) => normalized.endsWith(suffix));
  };

export function redactSensitiveString(value: string): string {
  let redacted = value;

  // Socket and HTTP URLs can use a backend-declared credential parameter
  // whose name is not one of the common token aliases (for example `sig`).
  // Diagnostics never need query values, so redact every URL-style query
  // value instead of trying to guess which parameter is secret.
  redacted = redacted.replace(
    /([?&][A-Za-z0-9_.%~-]+\s*=\s*)[^&#\s]*/g,
    `$1${REDACTED_SECRET}`,
  );

  // Header lines are redacted as a whole because cookie and authorization
  // values may contain multiple delimiters and encoded credentials.
  redacted = redacted.replace(
    /(\b(?:set-cookie|cookie|proxy-authorization|authorization)\s*:\s*)[^\r\n]*/gi,
    `$1${REDACTED_SECRET}`,
  );

  // Covers URL query parameters, JSON-ish diagnostics, form bodies, and
  // key=value fragments without depending on the string being a valid URL.
  redacted = redacted.replace(
    new RegExp(
      `(["']?${SENSITIVE_STRING_KEY_PATTERN}["']?\\s*[:=]\\s*)(?:"[^"]*"|'[^']*'|[^\\s,;&#}]+)`,
      'gi',
    ),
    `$1${REDACTED_SECRET}`,
  );

  // Defensive final pass for messages containing a bare bearer credential.
  redacted = redacted.replace(
    /\b(Bearer)\s+[A-Za-z0-9._~+\-/]+=*/gi,
    `$1 ${REDACTED_SECRET}`,
  );

  return redacted;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function redactDiagnosticValueInternal(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (typeof value === 'string') {
    return redactSensitiveString(value);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (depth >= MAX_REDACTION_DEPTH) {
    return '[redacted-depth-limit]';
  }
  if (seen.has(value)) {
    return '[redacted-circular]';
  }
  seen.add(value);

  if (value instanceof Error) {
    return {
      name: redactSensitiveString(value.name),
      message: redactSensitiveString(value.message),
      stack: value.stack ? redactSensitiveString(value.stack) : null,
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactDiagnosticValueInternal(item, depth + 1, seen));
  }

  if (!isRecord(value)) {
    return redactSensitiveString(String(value));
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    redacted[key] = isSensitiveAuthKey(key)
      ? REDACTED_SECRET
      : redactDiagnosticValueInternal(nestedValue, depth + 1, seen);
  }
  return redacted;
}

export const redactDiagnosticValue = (value: unknown): unknown =>
  redactDiagnosticValueInternal(value, 0, new WeakSet<object>());
