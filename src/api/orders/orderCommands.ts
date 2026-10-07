/**
 * Asynchronous trade-command confirmation (backend contract v3, section 6.1).
 *
 * `POST /orders` and `POST /positions/{ticket}/close` can answer `202`:
 *   {"type":"order_accepted","status":"accepted","success":true,
 *    "client_order_id":"order-...","accepted_at":1790241500123}
 *
 * The client then polls
 *   GET /order-commands/{client_order_id}?account_login={login}
 * every 500 ms for up to 30 s. A final poll answer is
 *   {type:"order_filled", data:<fill>}  or
 *   {type:"order_rejected", error:{code,message,retryable}}.
 * If nothing is final after 30 s the caller shows "Confirmation Pending" and
 * reconciles through `GET /positions/{login}`.
 */
import { apiClient } from '../apiClient';
import {
  ORDER_CONFIRMATION_PENDING_CODE,
  createTradingApiError,
  type TradingApiError,
} from '../tradingErrors';

export const ORDER_COMMAND_POLL_INTERVAL_MS = 500;
export const ORDER_COMMAND_POLL_TIMEOUT_MS = 30_000;
/** Per-poll HTTP budget; a single slow poll must not eat the whole window. */
export const ORDER_COMMAND_POLL_REQUEST_TIMEOUT_MS = 10_000;

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;

const lower = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

/** True for the `202 order_accepted` envelope (status code or body shape). */
export const isOrderAcceptedResponse = (httpStatus: number, body: unknown): boolean => {
  if (httpStatus === 202) return true;
  const record = asRecord(body);
  if (!record) return false;
  return lower(record.type) === 'order_accepted' || lower(record.status) === 'accepted';
};

export type OrderCommandFinalResult =
  | Readonly<{ kind: 'filled'; data: UnknownRecord }>
  | Readonly<{
    kind: 'rejected';
    code: string;
    message: string;
    retryable: boolean;
  }>;

/**
 * Parses one poll body. Returns null while the command is not final yet
 * (accepted / queued / unknown shape).
 */
export const parseOrderCommandResult = (value: unknown): OrderCommandFinalResult | null => {
  const record = asRecord(value);
  if (!record) return null;
  const type = lower(record.type);
  if (type === 'order_filled') {
    const data = asRecord(record.data) ?? {};
    return Object.freeze({ kind: 'filled', data });
  }
  if (type === 'order_rejected') {
    const error = asRecord(record.error) ?? {};
    const code = typeof error.code === 'string' && error.code.trim()
      ? error.code.trim().toUpperCase()
      : typeof record.error === 'string' && record.error.trim()
        ? record.error.trim().toUpperCase()
        : 'ORDER_REJECTED';
    const message = typeof error.message === 'string' && error.message.trim()
      ? error.message.trim()
      : typeof record.message === 'string' && record.message.trim()
        ? record.message.trim()
        : 'The order was rejected by the trading server.';
    return Object.freeze({
      kind: 'rejected',
      code,
      message,
      retryable: error.retryable === true,
    });
  }
  return null;
};

/** Converts a final rejection into the shared trading error type. */
export const createOrderCommandRejectedError = (
  result: Extract<OrderCommandFinalResult, { kind: 'rejected' }>,
): TradingApiError => createTradingApiError(400, {
  error: result.code,
  message: result.message,
  retryable: result.retryable,
});

/** App-local error surfaced as "Confirmation Pending" by classifyTradingError. */
export const createOrderConfirmationPendingError = (
  clientOrderId: string,
): TradingApiError => createTradingApiError(202, {
  error: ORDER_CONFIRMATION_PENDING_CODE,
  message: 'The server accepted the request but did not confirm it within 30 seconds.',
  client_order_id: clientOrderId,
});

export type OrderCommandPollResponse = Readonly<{ status: number; body: unknown }>;

export type PollOrderCommandOptions = Readonly<{
  clientOrderId: string;
  accountLogin: string | number;
  /** Throws (for example StaleBrokerSessionError) to abort polling. */
  assertCurrent?: () => void;
  fetchCommand?: (path: string) => Promise<OrderCommandPollResponse>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  intervalMs?: number;
  timeoutMs?: number;
}>;

export type PollOrderCommandOutcome =
  | OrderCommandFinalResult
  | Readonly<{ kind: 'pending' }>;

export const buildOrderCommandPath = (
  clientOrderId: string,
  accountLogin: string | number,
): string =>
  `/order-commands/${encodeURIComponent(clientOrderId)}?account_login=${encodeURIComponent(String(accountLogin))}`;

const defaultFetchCommand = async (path: string): Promise<OrderCommandPollResponse> => {
  const response = await apiClient(path, {
    method: 'GET',
    headers: { accept: 'application/json' },
    timeoutMs: ORDER_COMMAND_POLL_REQUEST_TIMEOUT_MS,
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, ms);
});

/**
 * Polls until the command is final or the window closes. Transport errors,
 * `404 ORDER_COMMAND_NOT_FOUND` (not yet visible) and non-final bodies keep
 * polling; only `assertCurrent` can abort early.
 */
export const pollOrderCommand = async (
  options: PollOrderCommandOptions,
): Promise<PollOrderCommandOutcome> => {
  const fetchCommand = options.fetchCommand ?? defaultFetchCommand;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  const intervalMs = options.intervalMs ?? ORDER_COMMAND_POLL_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? ORDER_COMMAND_POLL_TIMEOUT_MS;
  const path = buildOrderCommandPath(options.clientOrderId, options.accountLogin);
  const deadline = now() + timeoutMs;

  while (now() < deadline) {
    await sleep(intervalMs);
    options.assertCurrent?.();
    let response: OrderCommandPollResponse | null = null;
    try {
      response = await fetchCommand(path);
    } catch (error) {
      options.assertCurrent?.();
      if (error && typeof error === 'object' && (error as { name?: string }).name === 'StaleBrokerSessionError') {
        throw error;
      }
      continue;
    }
    options.assertCurrent?.();
    // Only an explicit order_filled / order_rejected body is final, whatever
    // the HTTP status; everything else (404 not yet visible, 5xx) keeps polling.
    const result = parseOrderCommandResult(response.body);
    if (result) return result;
  }
  return Object.freeze({ kind: 'pending' });
};
