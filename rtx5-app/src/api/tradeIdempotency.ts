/**
 * Idempotency identifiers for server-side trade mutations.
 *
 * Backend contract v3 (section 6.0):
 * - The `Idempotency-Key` header is IGNORED by the gateway. BrokerAPI still
 *   injects it (harmless, optional), but it gives no duplicate protection.
 * - Real idempotency is the body field `client_order_id`, honoured only by
 *   `POST /orders` and `POST /positions/{ticket}/close`.
 * - Format: `^[A-Za-z0-9][A-Za-z0-9._:-]{7,63}$`.
 * - The same id with a different body returns `409 IDEMPOTENCY_CONFLICT`.
 * - Pending orders have no idempotency at all: never auto-retry them after a
 *   network error; re-read the pending list instead.
 */

let fallbackSequence = 0;

/** Server-side validation pattern for `client_order_id` (contract 6.0). */
export const CLIENT_ORDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,63}$/;

export const isValidClientOrderId = (value: unknown): value is string =>
  typeof value === 'string' && CLIENT_ORDER_ID_PATTERN.test(value);

const normalizedPath = (endpoint: string): string => {
  const withoutQuery = endpoint.split(/[?#]/, 1)[0] || '';
  const relativePath = /^https?:\/\//i.test(withoutQuery)
    ? new URL(withoutQuery).pathname
    : withoutQuery;
  const withLeadingSlash = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  const withoutApiPrefix = withLeadingSlash.replace(/^\/api\/v2(?=\/|$)/, '');
  return (withoutApiPrefix.replace(/\/+$/, '') || '/');
};

/** Returns the key prefix for the five trade mutation routes, if applicable. */
export const getTradeIdempotencyAction = (endpoint: string, method: string): string | null => {
  const path = normalizedPath(endpoint);
  const normalizedMethod = method.toUpperCase();

  if (normalizedMethod === 'POST' && path === '/orders') return 'order';
  if (normalizedMethod === 'POST' && path === '/orders/pending') return 'pending';

  const closeMatch = normalizedMethod === 'POST'
    ? path.match(/^\/positions\/([^/]+)\/close$/)
    : null;
  if (closeMatch) return `close-${closeMatch[1]}`;

  const pendingTicketMatch = path.match(/^\/orders\/pending\/([^/]+)$/);
  if (pendingTicketMatch && normalizedMethod === 'PUT') return `pending-modify-${pendingTicketMatch[1]}`;
  if (pendingTicketMatch && normalizedMethod === 'DELETE') return `pending-cancel-${pendingTicketMatch[1]}`;

  return null;
};

const normalizeAction = (action: string): string => {
  const normalized = action
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'trade';
};

const randomHex = (length: number): string => {
  let out = '';
  while (out.length < length) {
    out += Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0');
  }
  return out.slice(0, length);
};

/**
 * RFC 4122 v4-shaped UUID. Uses Web Crypto when the runtime provides it; the
 * fallback stays dependency free for React Native runtimes without it and
 * mixes time + a process sequence into the random bits so two ids generated
 * in the same millisecond never collide.
 */
export const createUuidV4 = (): string => {
  const runtimeCrypto = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (typeof runtimeCrypto?.randomUUID === 'function') {
    try {
      const value = runtimeCrypto.randomUUID();
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
        return value.toLowerCase();
      }
    } catch {
      // Fall through to the RN-safe fallback below.
    }
  }

  fallbackSequence = (fallbackSequence + 1) % 0x1000;
  const timeHex = Date.now().toString(16).padStart(12, '0').slice(-12);
  const variant = (8 + Math.floor(Math.random() * 4)).toString(16);
  return [
    randomHex(8),
    randomHex(4),
    `4${fallbackSequence.toString(16).padStart(3, '0')}`,
    `${variant}${randomHex(3)}`,
    timeHex,
  ].join('-');
};

/**
 * Header-style key kept for the optional `Idempotency-Key` header and for
 * pending-order bookkeeping. It always satisfies CLIENT_ORDER_ID_PATTERN for
 * the short action prefixes used in this app.
 */
export const createTradeIdempotencyKey = (action: string): string =>
  `${normalizeAction(action)}-${createUuidV4()}`;

/** `order-<uuidv4>` for `POST /orders` (43 characters). */
export const createMarketOrderClientOrderId = (): string =>
  `order-${createUuidV4()}`;

/**
 * `close-<ticket>-<uuidv4>` for `POST /positions/{ticket}/close`.
 * A 19-digit (int64) ticket yields 62 characters, inside the 64 limit.
 */
export const createClosePositionClientOrderId = (ticket: string | number): string => {
  const ticketText = String(ticket).trim();
  if (!/^\d+$/.test(ticketText)) {
    throw new TypeError('A close client_order_id requires a numeric broker ticket.');
  }
  const candidate = `close-${ticketText}-${createUuidV4()}`;
  if (!CLIENT_ORDER_ID_PATTERN.test(candidate)) {
    // Only reachable for tickets longer than int64; keep the id valid while
    // still unique by dropping the ticket segment.
    return `close-${createUuidV4()}`;
  }
  return candidate;
};
