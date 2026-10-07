import { redactSensitiveString } from '../utils/securityRedaction';
import { captureActiveBrokerSession } from '../state/activeBrokerSession';

export type TradingAction =
  | 'place-order'
  | 'load-positions'
  | 'close-position'
  | 'close-by'
  | 'modify-position';

export type TradingIssueOrigin = 'frontend' | 'api' | 'backend' | 'session';

export type TradingIssueKind =
  | 'frontend-state'
  | 'integration'
  | 'backend-unavailable'
  | 'backend-rejection'
  | 'session-expired'
  | 'rate-limit'
  | 'unknown';

export interface TradingErrorFeedback {
  origin: TradingIssueOrigin;
  kind: TradingIssueKind;
  title: string;
  message: string;
  status?: number;
  retryAfterSeconds?: number | null;
  detail?: string | null;
}

export interface TradingApiErrorResponse {
  status: number;
  data: unknown;
  headers: Record<string, string>;
}

const ACTION_LABELS: Record<TradingAction, string> = {
  'place-order': 'place the trade',
  'load-positions': 'load positions',
  'close-position': 'close the position',
  'close-by': 'close the paired positions',
  'modify-position': 'modify the position',
};

/**
 * User copy for the gateway error envelope `{"error":"<CODE>","message"}`
 * (backend contract v3, section 6.1). Unknown codes fall back to the server
 * `message`.
 */
const BROKER_ERROR_MESSAGES: Record<string, string> = {
  // 400
  UNAUTHORIZED: 'Invalid session or credentials. Please log in again.',
  INVALID_INPUT: 'The trade request was invalid. Check the symbol and volume, then try again.',
  INVALID_CLIENT_ORDER_ID: 'The trade request id was invalid. Please submit the order again.',
  INVALID_SIDE: 'The trade direction was invalid. Choose Buy or Sell and try again.',
  INVALID_IDEMPOTENCY_KEY: 'The trade request key was invalid. Please try the order again.',
  IDEMPOTENCY_KEY_REQUIRED: 'The trade could not be submitted safely. Please try again.',
  INSUFFICIENT_MARGIN: 'Insufficient margin. You do not have enough funds to open this position.',
  ORDER_REJECTED: 'The broker rejected the order. Check market status, volume, and SL/TP values, then try again.',
  INVALID_SL_TP: 'Invalid Stop Loss or Take Profit levels. Please check your price offsets.',
  // 403
  BROKER_REQUIRED: 'Your broker session is incomplete. Please log in again.',
  BROKER_NOT_FOUND: 'The selected broker is unavailable. Please contact your broker.',
  BROKER_INACTIVE: 'The selected broker server is offline. Please try again later.',
  BROKER_MISMATCH: 'This account belongs to a different broker. Please log in again with the correct broker.',
  LICENSE_EXPIRED: 'License expired. Please renew your trading license to proceed.',
  SYMBOL_NOT_ALLOWED: 'This symbol is not available for trading on your account.',
  TRADE_DISABLED: 'Trading is disabled for this account group. Please contact your broker.',
  INVESTOR_READ_ONLY: 'You are logged in with a read-only (investor) password. Trading is not allowed on this login.',
  ACCOUNT_UNAVAILABLE: 'Your trading account is temporarily unavailable. Please try again later or contact support.',
  TRADE_ROUTE_NOT_CONFIGURED: 'Trading is not configured for this broker account. Please contact your broker.',
  // 404
  ORDER_COMMAND_NOT_FOUND: 'The order confirmation could not be found. Check your positions before trading again.',
  // 409
  IDEMPOTENCY_CONFLICT: 'This request id was already used for a different trade. Please submit the trade again.',
  IDEMPOTENCY_KEY_REUSED: 'This trade request was already used for different order details. Please submit it again.',
  MARKET_CLOSED: 'The market is closed for this symbol. Try again when trading reopens.',
  STALE_QUOTE: 'The market price is stale. Wait for a fresh quote and try again.',
  POSITION_STATE_CHANGED: 'The position changed while your request was processed. Review it and try again.',
  POSITION_ALREADY_CLOSED: 'This position is already closed.',
  ORDER_ALREADY_PROCESSED: 'This order was already processed. The order list has been refreshed.',
  ORDER_STATE_CHANGED: 'The order changed while your request was processed. Review it and try again.',
  ORDER_COMMAND_REJECTED: 'The trading server rejected the order command. Please try again.',
  MARKET_SESSION_CHANGED: 'The market session changed while your request was processed. Please try again.',
  ACCOUNT_IDENTITY_CHANGED: 'Your trading account changed while the request was processed. Please log in again.',
  // 429 (no Retry-After header; the client waits 2 seconds)
  ORDER_RATE_LIMITED: 'Too many orders were sent. Wait 2 seconds and try again.',
  TOO_MANY_ORDERS: 'Too many orders were sent. Wait 2 seconds and try again.',
  // 500
  INTERNAL_ERROR: 'The trading server hit an internal error. Check your positions before trying again.',
  DATABASE_ERROR: 'The trading server could not save the request. Check your positions before trying again.',
  // 503
  NO_FRESH_QUOTE: 'No fresh market price is available yet. Wait for the next quote and try again.',
  SOURCE_MISMATCH: 'The broker price feed is temporarily unavailable. Please try again shortly.',
  SERVICE_UNAVAILABLE: 'The trading service is temporarily unavailable. Please try again shortly.',
  DATABASE_UNAVAILABLE: 'The trading service is temporarily unavailable. Please try again shortly.',
  COMMAND_ROUTING_UNAVAILABLE: 'Order routing is temporarily unavailable. Please try again shortly.',
  COMMAND_COMMIT_UNCERTAIN: 'The trading server could not confirm the request. Check your positions before trying again.',
  ENGINE_CLOSE_UNAVAILABLE: 'Closing is temporarily unavailable, please contact support.',
  TRIGGER_CAPTURE_UNAVAILABLE: 'Stop Loss / Take Profit is temporarily unavailable. Please try again shortly.',
  EXACT_CALCULATION_UNAVAILABLE: 'Trading calculations are temporarily unavailable. Please try again shortly.',
  MARKET_SCHEDULE_UNAVAILABLE: 'The market schedule is unavailable, so trading is paused for this symbol.',
  MISSING_FX_RATE: 'A required conversion rate is unavailable. Please try again shortly.',
  CALCULATION_SCHEMA_NOT_READY: 'Trading calculations are temporarily unavailable. Please try again shortly.',
  // App-local: a 202 order/close did not reach a final state within 30 s.
  ORDER_CONFIRMATION_PENDING: 'The server accepted the request but has not confirmed it yet. Check your positions before trying again.',
};

/** Codes returned without Retry-After; the contract asks the client to wait 2 s. */
export const ORDER_RATE_LIMIT_CODES: ReadonlySet<string> = new Set(['ORDER_RATE_LIMITED', 'TOO_MANY_ORDERS']);
export const ORDER_RATE_LIMIT_WAIT_SECONDS = 2;

/** App-local error code used when a 202 command is not final after 30 s. */
export const ORDER_CONFIRMATION_PENDING_CODE = 'ORDER_CONFIRMATION_PENDING';

const CODE_TITLES: Record<string, string> = {
  INVESTOR_READ_ONLY: 'Read-Only Account',
  MARKET_CLOSED: 'Market Closed',
  ENGINE_CLOSE_UNAVAILABLE: 'Closing Unavailable',
  POSITION_ALREADY_CLOSED: 'Position Already Closed',
  ORDER_ALREADY_PROCESSED: 'Order Already Processed',
  ORDER_CONFIRMATION_PENDING: 'Confirmation Pending',
  COMMAND_COMMIT_UNCERTAIN: 'Confirmation Pending',
  IDEMPOTENCY_CONFLICT: 'Duplicate Request',
};

const SESSION_CODES: ReadonlySet<string> = new Set([
  'UNAUTHORIZED',
  'BROKER_REQUIRED',
  'ACCOUNT_IDENTITY_CHANGED',
]);

const ORIGIN_LABELS: Record<TradingIssueOrigin, string> = {
  frontend: 'Frontend issue',
  api: 'API issue',
  backend: 'Backend issue',
  session: 'Session issue',
};

const cleanMessage = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed.length > 0 ? trimmed : null;
};

const extractDataMessage = (data: unknown): string | null => {
  if (!data || typeof data !== 'object') {
    return cleanMessage(data);
  }

  const record = data as Record<string, unknown>;
  return (
    cleanMessage(record.detail)
    || cleanMessage(record.message)
    || cleanMessage(record.comment)
    || cleanMessage(record.error)
    || extractDataMessage(record.error)
    || extractDataMessage(record.data)
    || null
  );
};

const extractDataCode = (data: unknown): string | null => {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const record = data as Record<string, unknown>;
  // Gateway error envelopes use `{ error: "ERROR_CODE", message: "..." }`.
  // Treat that canonical string as the code before checking legacy aliases.
  const canonicalError = cleanMessage(record.error);
  const directCode =
    canonicalError ||
    cleanMessage(record.code) ||
    cleanMessage(record.error_code) ||
    cleanMessage(record.errorCode);
  if (directCode) {
    return directCode.toUpperCase();
  }

  return extractDataCode(record.error) || extractDataCode(record.data);
};

const getErrorStatus = (error: unknown): number | undefined => {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const record = error as Record<string, unknown>;
  if (typeof record.status === 'number') {
    return record.status;
  }

  const response = record.response;
  if (!response || typeof response !== 'object') {
    return undefined;
  }

  const responseStatus = (response as Record<string, unknown>).status;
  return typeof responseStatus === 'number' ? responseStatus : undefined;
};

const getErrorHeaders = (error: unknown): Record<string, string> => {
  if (!error || typeof error !== 'object') {
    return {};
  }

  const record = error as Record<string, unknown>;
  if (record.headers && typeof record.headers === 'object') {
    return record.headers as Record<string, string>;
  }

  const response = record.response;
  if (!response || typeof response !== 'object') {
    return {};
  }

  const responseHeaders = (response as Record<string, unknown>).headers;
  return responseHeaders && typeof responseHeaders === 'object'
    ? (responseHeaders as Record<string, string>)
    : {};
};

const getErrorData = (error: unknown): unknown => {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const record = error as Record<string, unknown>;
  if ('data' in record) {
    return record.data;
  }

  const response = record.response;
  if (!response || typeof response !== 'object') {
    return undefined;
  }

  return (response as Record<string, unknown>).data;
};

/** Reads the canonical `{error:"<CODE>"}` code from any trading error shape. */
export const getTradingErrorCode = (error: unknown): string | null =>
  extractDataCode(getErrorData(error));

const getErrorMessage = (error: unknown): string | null => {
  if (!error || typeof error !== 'object') {
    return cleanMessage(error);
  }

  const record = error as Record<string, unknown>;
  return extractDataMessage(getErrorData(error)) || cleanMessage(record.message);
};

export const parseRetryAfterSeconds = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    return null;
  }
  const seconds = Number(normalized);
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : null;
};

const getRetryAfterSeconds = (headers: Record<string, string>): number | null =>
  parseRetryAfterSeconds(headers['retry-after']);

const looksLikeNetworkFailure = (detail: string | null): boolean => {
  if (!detail) {
    return false;
  }

  const normalized = detail.toLowerCase();
  return [
    'failed to fetch',
    'network request failed',
    'network error',
    'load failed',
    'connection refused',
    'connection reset',
    'timed out',
    'timeout',
    'socket hang up',
  ].some((token) => normalized.includes(token));
};

const looksLikeIntegrationFailure = (status: number | undefined, detail: string | null): boolean => {
  const normalized = detail?.toLowerCase() || '';
  if (!normalized) {
    return status === 403;
  }

  return (
    normalized.includes('instrument not found')
    || normalized.includes('unknown symbol')
    || normalized.includes('unsupported symbol')
    || normalized.includes('broker context')
    || normalized.includes('invalid broker')
    || normalized.includes('broker mismatch')
    || normalized.includes('account not found')
    || normalized.includes('invalid account login')
    || normalized.includes('unsupported account')
  );
};

const buildBackendUnavailableMessage = (action: TradingAction): string => {
  return `The trading backend returned an unavailable response while trying to ${ACTION_LABELS[action]}.`;
};

const buildConnectionFailureMessage = (action: TradingAction): string => {
  return `The app did not receive an HTTP response while trying to ${ACTION_LABELS[action]}. The frontend cannot tell whether the cause is the phone connection, gateway, or trading server.`;
};

const buildIntegrationMessage = (action: TradingAction, detail: string | null): string => {
  if (detail) {
    return `The request reached the backend, but the API rejected the symbol, account, or broker routing used for ${ACTION_LABELS[action]}. ${detail}`;
  }

  return `The request reached the backend, but the API rejected the symbol, account, or broker routing used for ${ACTION_LABELS[action]}.`;
};

const buildRejectedMessage = (action: TradingAction, detail: string | null): string => {
  if (detail) {
    return detail;
  }

  if (action === 'place-order') {
    return 'The broker rejected the trade. Check market status, volume, and SL/TP values, then try again.';
  }

  return `The backend rejected the request while trying to ${ACTION_LABELS[action]}.`;
};

export class TradingApiError extends Error {
  status: number;
  data: unknown;
  headers: Record<string, string>;
  response: TradingApiErrorResponse;

  constructor(status: number, data: unknown = {}, headers: Record<string, string> = {}) {
    super(extractDataMessage(data) || `Trading request failed (HTTP ${status})`);
    this.name = 'TradingApiError';
    this.status = status;
    this.data = data;
    this.headers = headers;
    this.response = {
      status,
      data,
      headers,
    };
  }
}

export const createTradingApiError = (
  status: number,
  data: unknown = {},
  headers: Record<string, string> = {},
) => new TradingApiError(status, data, headers);

export const createFrontendTradingError = (
  title: string,
  message: string,
): TradingErrorFeedback => ({
  origin: 'frontend',
  kind: 'frontend-state',
  title,
  message,
});

export const classifyTradingError = (
  error: unknown,
  options: { action: TradingAction; brokerId?: string },
): TradingErrorFeedback => {
  const status = getErrorStatus(error);
  const headers = getErrorHeaders(error);
  const brokerCode = extractDataCode(getErrorData(error));
  const rawDetail = getErrorMessage(error);
  const detail = rawDetail ? redactSensitiveString(rawDetail) : null;
  const retryAfterSeconds = getRetryAfterSeconds(headers);

  const activeBrokerId =
    options.brokerId ?? captureActiveBrokerSession()?.session.brokerId ?? '';

  // 404 NOT_FOUND "Account not found" on POST /orders means account_login is
  // not the session's account (contract 6.1).
  if (
    (brokerCode === 'NOT_FOUND' || status === 404) &&
    detail &&
    /account not found/i.test(detail)
  ) {
    return {
      origin: 'api',
      kind: 'integration',
      title: 'Account Mismatch',
      message: 'The trading account does not match your logged-in account. Log in again and retry.',
      status,
      detail,
    };
  }

  if (brokerCode && ORDER_RATE_LIMIT_CODES.has(brokerCode)) {
    return {
      origin: 'backend',
      kind: 'rate-limit',
      title: 'Rate Limited',
      message: BROKER_ERROR_MESSAGES[brokerCode],
      status,
      retryAfterSeconds: retryAfterSeconds ?? ORDER_RATE_LIMIT_WAIT_SECONDS,
      detail,
    };
  }

  const mappedBrokerMessage = brokerCode
    ? brokerCode === 'TRADE_DISABLED' && activeBrokerId === 'orrnn-demo'
      ? 'Trading is temporarily unavailable for this demo broker.'
      : BROKER_ERROR_MESSAGES[brokerCode]
      || (brokerCode.startsWith('INCOMPLETE_')
        ? 'Required trading calculation data is temporarily unavailable. Please try again shortly.'
        : null)
    : null;

  if (brokerCode && mappedBrokerMessage) {
    const sessionCode = SESSION_CODES.has(brokerCode);
    return {
      origin: sessionCode ? 'session' : 'backend',
      kind: sessionCode ? 'session-expired' : 'backend-rejection',
      title: sessionCode
        ? 'Session Expired'
        : CODE_TITLES[brokerCode]
          ?? (options.action === 'place-order' ? 'Order Rejected' : 'Request Rejected'),
      message: mappedBrokerMessage,
      status,
      detail,
    };
  }

  if (status === 401 || (detail && detail.toLowerCase().includes('refresh token'))) {
    return {
      origin: 'session',
      kind: 'session-expired',
      title: 'Session Expired',
      message: 'Your trading session expired or the refresh token was rejected. Log in again to continue.',
      status,
      detail,
    };
  }

  if (status === 429) {
    return {
      origin: 'backend',
      kind: 'rate-limit',
      title: 'Rate Limited',
      message: retryAfterSeconds
        ? `Too many requests were sent to the trading backend. Wait ${retryAfterSeconds} seconds and try again.`
        : 'Too many requests were sent to the trading backend. Wait a moment and try again.',
      status,
      retryAfterSeconds,
      detail,
    };
  }

  // Unknown gateway code: the contract says to show the server `message`.
  if (brokerCode && detail && status !== undefined && status >= 400) {
    return {
      origin: 'backend',
      kind: status >= 500 ? 'backend-unavailable' : 'backend-rejection',
      title: status >= 500
        ? 'Trading Server Error'
        : options.action === 'place-order' ? 'Order Rejected' : 'Request Rejected',
      message: detail,
      status,
      detail,
    };
  }

  if (status !== undefined && status >= 502) {
    return {
      origin: 'backend',
      kind: 'backend-unavailable',
      title: 'Trading Server Unavailable',
      message: buildBackendUnavailableMessage(options.action),
      status,
      detail,
    };
  }

  if (looksLikeNetworkFailure(detail)) {
    const timedOut = Boolean(detail && /timed out|timeout/i.test(detail));
    return {
      origin: 'api',
      kind: 'backend-unavailable',
      title: timedOut ? 'Trading Request Timed Out' : 'Trading Connection Failed',
      message: buildConnectionFailureMessage(options.action),
      status,
      detail,
    };
  }

  if (looksLikeIntegrationFailure(status, detail)) {
    return {
      origin: 'api',
      kind: 'integration',
      title: 'Trading Integration Error',
      message: buildIntegrationMessage(options.action, detail),
      status,
      detail,
    };
  }

  if (status !== undefined && status >= 500) {
    return {
      origin: 'backend',
      kind: 'backend-unavailable',
      title: 'Trading Server Error',
      message: detail || buildBackendUnavailableMessage(options.action),
      status,
      detail,
    };
  }

  if (status !== undefined && [400, 403, 404, 409, 422].includes(status)) {
    return {
      origin: 'backend',
      kind: 'backend-rejection',
      title: options.action === 'place-order' ? 'Order Rejected' : 'Request Rejected',
      message: buildRejectedMessage(options.action, detail),
      status,
      detail,
    };
  }

  return {
    origin: 'backend',
    kind: 'unknown',
    title: options.action === 'place-order' ? 'Trade Failed' : 'Request Failed',
    message: detail || `The request failed while trying to ${ACTION_LABELS[options.action]}.`,
    status,
    detail,
  };
};

export const formatTradingErrorFeedback = (feedback: TradingErrorFeedback): string => {
  return `${feedback.title}: ${feedback.message}`;
};

export const getTradingErrorOriginLabel = (origin: TradingIssueOrigin): string => {
  return ORIGIN_LABELS[origin];
};
