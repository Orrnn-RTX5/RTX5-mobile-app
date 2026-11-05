import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyTradingError,
  createFrontendTradingError,
  createTradingApiError,
  formatTradingErrorFeedback,
  parseRetryAfterSeconds,
} from './tradingErrors';

test('classifyTradingError does not falsely prove a backend outage for fetch failures', () => {
  const feedback = classifyTradingError(new Error('Failed to fetch'), {
    action: 'place-order',
  });

  assert.equal(feedback.origin, 'api');
  assert.equal(feedback.kind, 'backend-unavailable');
  assert.equal(feedback.title, 'Trading Connection Failed');
  assert.match(feedback.message, /cannot tell whether the cause is the phone connection, gateway, or trading server/i);
});

test('classifyTradingError identifies a frontend confirmation timeout without inventing its source', () => {
  const feedback = classifyTradingError(new Error('Request timed out after 10000ms'), {
    action: 'modify-position',
  });

  assert.equal(feedback.origin, 'api');
  assert.equal(feedback.title, 'Trading Request Timed Out');
  assert.match(feedback.message, /did not receive an HTTP response/i);
});

test('classifyTradingError marks instrument routing failures as API integration issues', () => {
  const feedback = classifyTradingError(
    createTradingApiError(404, { message: 'Instrument not found' }),
    { action: 'place-order' },
  );

  assert.equal(feedback.origin, 'api');
  assert.equal(feedback.kind, 'integration');
  assert.match(feedback.message, /API rejected the symbol, account, or broker routing/i);
});

test('classifyTradingError marks 401 responses as session expiry', () => {
  const feedback = classifyTradingError(
    createTradingApiError(401, { message: 'Unauthorized' }),
    { action: 'place-order' },
  );

  assert.equal(feedback.origin, 'session');
  assert.equal(feedback.kind, 'session-expired');
  assert.equal(feedback.title, 'Session Expired');
});

test('classifyTradingError reads the canonical gateway response.error code', () => {
  const feedback = classifyTradingError(
    createTradingApiError(503, {
      error: 'NO_FRESH_QUOTE',
      message: 'No fresh quote available',
    }),
    { action: 'place-order' },
  );

  assert.equal(feedback.kind, 'backend-rejection');
  assert.equal(feedback.title, 'Order Rejected');
  assert.match(feedback.message, /fresh market price/i);
});

test('classifyTradingError maps required market-order policy codes', () => {
  const cases = [
    ['INVALID_SIDE', 400, /Buy or Sell/i],
    ['INSUFFICIENT_MARGIN', 400, /margin/i],
    ['STALE_QUOTE', 409, /stale/i],
    ['SYMBOL_NOT_ALLOWED', 403, /not available/i],
    ['TRADE_ROUTE_NOT_CONFIGURED', 403, /not configured/i],
    ['INCOMPLETE_CONVERSION_DATA', 503, /calculation data/i],
  ] as const;

  for (const [error, status, expected] of cases) {
    const feedback = classifyTradingError(
      createTradingApiError(status, { error, message: 'backend detail' }),
      { action: 'place-order' },
    );
    assert.equal(feedback.kind, 'backend-rejection');
    assert.match(feedback.message, expected);
  }
});

test('TRADE_DISABLED uses the exact demo-broker policy copy without becoming an auth error', () => {
  const feedback = classifyTradingError(
    createTradingApiError(403, {
      error: 'TRADE_DISABLED',
      message: 'backend detail',
    }),
    { action: 'place-order', brokerId: 'orrnn-demo' },
  );

  assert.equal(feedback.origin, 'backend');
  assert.equal(feedback.kind, 'backend-rejection');
  assert.equal(feedback.title, 'Order Rejected');
  assert.equal(feedback.message, 'Trading is temporarily unavailable for this demo broker.');
});

test('classifyTradingError keeps retry-after information for rate limiting', () => {
  const feedback = classifyTradingError(
    createTradingApiError(429, { message: 'Too many requests' }, { 'retry-after': '17' }),
    { action: 'close-position' },
  );

  assert.equal(feedback.kind, 'rate-limit');
  assert.equal(feedback.retryAfterSeconds, 17);
  assert.match(feedback.message, /17 seconds/);
});

test('retry-after accepts only strict positive integer delta-seconds', () => {
  assert.equal(parseRetryAfterSeconds('17'), 17);
  assert.equal(parseRetryAfterSeconds(' 17 '), 17);
  assert.equal(parseRetryAfterSeconds('00017'), 17);
  assert.equal(parseRetryAfterSeconds(17), 17);

  for (const malformed of [
    undefined,
    null,
    '',
    '0',
    '-1',
    '+17',
    '1.5',
    '60junk',
    '1e2',
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    assert.equal(parseRetryAfterSeconds(malformed), null, String(malformed));
  }

  const feedback = classifyTradingError(
    createTradingApiError(429, { message: 'Too many requests' }, { 'retry-after': '60junk' }),
    { action: 'modify-position' },
  );
  assert.equal(feedback.retryAfterSeconds, null);
  assert.doesNotMatch(feedback.message, /60 seconds/);
});

test('classifyTradingError redacts secrets before returning UI-safe detail', () => {
  const feedback = classifyTradingError(
    createTradingApiError(500, {
      message: 'upstream https://broker.example/failed?token=secret Authorization: Bearer abc123',
    }),
    { action: 'place-order' },
  );

  assert.doesNotMatch(feedback.message, /secret|abc123/);
  assert.doesNotMatch(feedback.detail ?? '', /secret|abc123/);
  assert.match(feedback.message, /\[redacted\]/);
});

test('frontend trading errors format cleanly for inline banners', () => {
  const feedback = createFrontendTradingError(
    'Account Error',
    'The app could not resolve the active trading account from local state.',
  );

  assert.equal(
    formatTradingErrorFeedback(feedback),
    'Account Error: The app could not resolve the active trading account from local state.',
  );
});

test('every contract v3 section 6.1 error code has a mapped user message', () => {
  const codes: Array<[number, string]> = [
    [400, 'INVALID_INPUT'], [400, 'INVALID_CLIENT_ORDER_ID'], [400, 'INSUFFICIENT_MARGIN'], [400, 'ORDER_REJECTED'],
    [403, 'BROKER_REQUIRED'], [403, 'BROKER_NOT_FOUND'], [403, 'BROKER_INACTIVE'], [403, 'LICENSE_EXPIRED'],
    [403, 'SYMBOL_NOT_ALLOWED'], [403, 'TRADE_DISABLED'], [403, 'INVESTOR_READ_ONLY'], [403, 'ACCOUNT_UNAVAILABLE'],
    [403, 'BROKER_MISMATCH'],
    [404, 'ORDER_COMMAND_NOT_FOUND'],
    [409, 'IDEMPOTENCY_CONFLICT'], [409, 'MARKET_CLOSED'], [409, 'STALE_QUOTE'], [409, 'POSITION_STATE_CHANGED'],
    [409, 'POSITION_ALREADY_CLOSED'], [409, 'ORDER_ALREADY_PROCESSED'], [409, 'ORDER_STATE_CHANGED'],
    [409, 'ORDER_COMMAND_REJECTED'], [409, 'MARKET_SESSION_CHANGED'], [409, 'ACCOUNT_IDENTITY_CHANGED'],
    [429, 'ORDER_RATE_LIMITED'], [429, 'TOO_MANY_ORDERS'],
    [500, 'INTERNAL_ERROR'], [500, 'DATABASE_ERROR'],
    [503, 'NO_FRESH_QUOTE'], [503, 'SOURCE_MISMATCH'], [503, 'SERVICE_UNAVAILABLE'], [503, 'DATABASE_UNAVAILABLE'],
    [503, 'COMMAND_ROUTING_UNAVAILABLE'], [503, 'COMMAND_COMMIT_UNCERTAIN'], [503, 'ENGINE_CLOSE_UNAVAILABLE'],
    [503, 'TRIGGER_CAPTURE_UNAVAILABLE'], [503, 'EXACT_CALCULATION_UNAVAILABLE'], [503, 'MARKET_SCHEDULE_UNAVAILABLE'],
  ];
  const rawMessage = 'raw-server-text-should-not-be-the-copy';
  for (const [status, code] of codes) {
    const feedback = classifyTradingError(
      createTradingApiError(status, { error: code, message: rawMessage }),
      { action: 'place-order', brokerId: 'trivanta-markets' },
    );
    assert.notEqual(feedback.message, rawMessage, `${code} must have mapped copy`);
    assert.ok(feedback.message.length > 10, code);
  }
});

test('contract v3 special cases: read-only, engine close outage, market closed, rate limits', () => {
  const readOnly = classifyTradingError(
    createTradingApiError(403, { error: 'INVESTOR_READ_ONLY', message: 'read only' }),
    { action: 'close-position', brokerId: 'Orrnn' },
  );
  assert.equal(readOnly.title, 'Read-Only Account');
  assert.match(readOnly.message, /read-only/i);

  const engine = classifyTradingError(
    createTradingApiError(503, { error: 'ENGINE_CLOSE_UNAVAILABLE', message: 'x' }),
    { action: 'close-position', brokerId: 'Orrnn' },
  );
  assert.equal(engine.message, 'Closing is temporarily unavailable, please contact support.');
  assert.equal(engine.kind, 'backend-rejection');

  const closed = classifyTradingError(
    createTradingApiError(409, { error: 'MARKET_CLOSED', message: 'x' }),
    { action: 'place-order', brokerId: 'Orrnn' },
  );
  assert.equal(closed.title, 'Market Closed');

  for (const code of ['ORDER_RATE_LIMITED', 'TOO_MANY_ORDERS']) {
    const limited = classifyTradingError(
      createTradingApiError(429, { error: code, message: 'slow down' }),
      { action: 'place-order', brokerId: 'Orrnn' },
    );
    assert.equal(limited.kind, 'rate-limit');
    assert.equal(limited.retryAfterSeconds, 2, `${code} has no Retry-After; wait 2 s`);
    assert.match(limited.message, /2 seconds/);
  }

  const generic = classifyTradingError(
    createTradingApiError(429, { error: 'RATE_LIMITED', message: 'slow' }, { 'retry-after': '60' }),
    { action: 'place-order', brokerId: 'Orrnn' },
  );
  assert.equal(generic.retryAfterSeconds, 60);
});

test('404 Account not found on POST /orders means the account does not match', () => {
  const feedback = classifyTradingError(
    createTradingApiError(404, { error: 'NOT_FOUND', message: 'Account not found' }),
    { action: 'place-order', brokerId: 'trivanta-markets' },
  );
  assert.equal(feedback.title, 'Account Mismatch');
  assert.match(feedback.message, /does not match/);
});

test('unknown gateway codes show the server message', () => {
  const rejection = classifyTradingError(
    createTradingApiError(409, { error: 'SOME_FUTURE_CODE', message: 'Future rule blocked this order.' }),
    { action: 'place-order', brokerId: 'Orrnn' },
  );
  assert.equal(rejection.message, 'Future rule blocked this order.');

  const outage = classifyTradingError(
    createTradingApiError(503, { error: 'SOME_FUTURE_OUTAGE', message: 'Upstream maintenance until 10:00.' }),
    { action: 'close-position', brokerId: 'Orrnn' },
  );
  assert.equal(outage.message, 'Upstream maintenance until 10:00.');
});
