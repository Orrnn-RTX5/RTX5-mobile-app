import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AmbiguousModifyPositionOutcomeError,
  normalizeModifyPositionRequest,
  normalizePositiveSafeIntegerPathSegment,
  normalizeReconciledProtectionValue,
  parseModifyPositionAck,
  parseModifyPositionError,
  type ModifyPositionRequest,
} from './modifyPositionWire.ts';

const EXPECTED_TICKET = 123456;
const EXPECTED_SYMBOL = 'EUR/USD';

const makeAcknowledgement = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  ticket: EXPECTED_TICKET,
  symbol: 'EURUSD',
  status: 'modified',
  time: 1_784_800_000,
  sl: 1.0825,
  price_sl: 1.0825,
  tp: 1.091,
  price_tp: 1.091,
  ...overrides,
});

const parseSetAcknowledgement = (value: unknown) => parseModifyPositionAck(value, {
  ticket: EXPECTED_TICKET,
  symbol: EXPECTED_SYMBOL,
  request: {
    price_sl: 1.0825,
    price_tp: 1.091,
  },
});

test('position identifiers normalize only positive JavaScript-safe decimal integers', () => {
  assert.deepEqual(
    normalizePositiveSafeIntegerPathSegment(' 123456 ', 'Position ticket'),
    { numeric: 123456, path: '123456' },
  );
  assert.deepEqual(
    normalizePositiveSafeIntegerPathSegment(Number.MAX_SAFE_INTEGER, 'Position ticket'),
    {
      numeric: Number.MAX_SAFE_INTEGER,
      path: String(Number.MAX_SAFE_INTEGER),
    },
  );

  for (const invalid of [
    '',
    '0',
    '-1',
    '1.5',
    '1e3',
    'ticket-123',
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    assert.throws(
      () => normalizePositiveSafeIntegerPathSegment(invalid, 'Position ticket'),
      TypeError,
      `expected ${String(invalid)} to be rejected`,
    );
  }
});

test('modify request normalization preserves literal zero and strips forbidden extra fields', () => {
  const normalized = normalizeModifyPositionRequest({
    price_sl: 0,
    price_tp: 1.091,
    login: 900001,
    symbol: 'EURUSD',
    revision: 42,
  } as ModifyPositionRequest & Record<string, unknown>);

  assert.deepEqual(normalized, {
    price_sl: 0,
    price_tp: 1.091,
  });
  assert.deepEqual(Object.keys(normalized).sort(), ['price_sl', 'price_tp']);
  assert.equal(Object.isFrozen(normalized), true);
  assert.equal(JSON.stringify(normalized), '{"price_sl":0,"price_tp":1.091}');

  assert.deepEqual(normalizeModifyPositionRequest({ price_sl: null }), {
    price_sl: null,
  });
  assert.deepEqual(normalizeModifyPositionRequest({ price_tp: 1.095 }), {
    price_tp: 1.095,
  });
});

test('modify request normalization rejects empty, non-number, non-finite, and negative values', () => {
  const invalidRequests: unknown[] = [
    {},
    { price_sl: undefined },
    { price_sl: '', price_tp: 1.09 },
    { price_sl: '1.08', price_tp: 1.09 },
    { price_sl: Number.NaN, price_tp: 1.09 },
    { price_sl: Number.POSITIVE_INFINITY, price_tp: 1.09 },
    { price_sl: 1.08, price_tp: Number.NEGATIVE_INFINITY },
    { price_sl: -0.01, price_tp: 1.09 },
    { price_sl: 1.08, price_tp: -0.01 },
  ];

  for (const value of invalidRequests) {
    assert.throws(
      () => normalizeModifyPositionRequest(value as ModifyPositionRequest),
      TypeError,
    );
  }
});

test('strict acknowledgement parser accepts exact set and null-clear echoes only', () => {
  const setAck = parseSetAcknowledgement(makeAcknowledgement());
  assert.deepEqual(setAck, makeAcknowledgement());
  assert.equal(Object.isFrozen(setAck), true);

  const mixedAck = parseModifyPositionAck(
    makeAcknowledgement({
      sl: null,
      price_sl: null,
    }),
    {
      ticket: String(EXPECTED_TICKET),
      symbol: 'eurusd',
      request: {
        price_sl: 0,
        price_tp: 1.091,
      },
    },
  );
  assert.equal(mixedAck.sl, null);
  assert.equal(mixedAck.price_sl, null);
  assert.equal(mixedAck.tp, 1.091);
  assert.equal(mixedAck.price_tp, 1.091);

  const clearAck = parseModifyPositionAck(
    makeAcknowledgement({
      sl: null,
      price_sl: null,
      tp: null,
      price_tp: null,
    }),
    {
      ticket: EXPECTED_TICKET,
      symbol: EXPECTED_SYMBOL,
      request: {
        price_sl: 0,
        price_tp: 0,
      },
    },
  );
  assert.equal(clearAck.sl, null);
  assert.equal(clearAck.tp, null);

  const partialAck = parseModifyPositionAck(
    {
      ticket: EXPECTED_TICKET,
      symbol: 'EURUSD',
      status: 'modified',
      time: 1_784_800_001,
      price_sl: 1.083,
    },
    {
      ticket: EXPECTED_TICKET,
      symbol: EXPECTED_SYMBOL,
      request: { price_sl: 1.083 },
    },
  );
  assert.deepEqual(partialAck, {
    ticket: EXPECTED_TICKET,
    symbol: 'EURUSD',
    status: 'modified',
    time: 1_784_800_001,
    sl: 1.083,
    price_sl: 1.083,
  });

  const partialClearAck = parseModifyPositionAck(
    {
      ticket: EXPECTED_TICKET,
      symbol: 'EURUSD',
      status: 'modified',
      time: 1_784_800_002,
      tp: null,
    },
    {
      ticket: EXPECTED_TICKET,
      symbol: EXPECTED_SYMBOL,
      request: { price_tp: null },
    },
  );
  assert.equal(partialClearAck.tp, null);
  assert.equal(partialClearAck.price_tp, null);
});

test('strict acknowledgement parser rejects ambiguous HTTP 200 body shapes and echoes', () => {
  const base = makeAcknowledgement();
  const {
    tp: _omittedTp,
    price_tp: _omittedPriceTp,
    ...missingTp
  } = base;
  const { time: _omittedTime, ...missingRequiredTime } = base;
  const inheritedOnly = Object.create(base) as Record<string, unknown>;
  const invalidCases: ReadonlyArray<readonly [string, unknown]> = [
    ['null', null],
    ['array', [base]],
    ['wrapper', { data: base }],
    ['inherited required fields', inheritedOnly],
    ['missing required key', missingRequiredTime],
    ['missing touched echo', missingTp],
    ['wrong ticket', makeAcknowledgement({ ticket: EXPECTED_TICKET + 1 })],
    ['unsafe ticket', makeAcknowledgement({ ticket: Number.MAX_SAFE_INTEGER + 1 })],
    ['wrong symbol', makeAcknowledgement({ symbol: 'GBPUSD' })],
    ['wrong status', makeAcknowledgement({ status: 'success' })],
    ['NaN time', makeAcknowledgement({ time: Number.NaN })],
    ['infinite time', makeAcknowledgement({ time: Number.POSITIVE_INFINITY })],
    ['negative time', makeAcknowledgement({ time: -1 })],
    ['zero time', makeAcknowledgement({ time: 0 })],
    ['fractional time', makeAcknowledgement({ time: 1784800000.5 })],
    ['unsafe time', makeAcknowledgement({ time: Number.MAX_SAFE_INTEGER + 1 })],
    ['millisecond-like time', makeAcknowledgement({ time: Date.now() })],
    ['string current echo', makeAcknowledgement({ sl: '1.0825' })],
    ['string canonical echo', makeAcknowledgement({ price_sl: '1.0825' })],
    ['alias mismatch', makeAcknowledgement({ price_sl: 1.0826 })],
    ['submitted-value mismatch', makeAcknowledgement({ sl: 1.0826, price_sl: 1.0826 })],
    ['missing positive echo', makeAcknowledgement({ tp: null, price_tp: null })],
  ];

  for (const [label, value] of invalidCases) {
    assert.throws(
      () => parseSetAcknowledgement(value),
      (error: unknown) => (
        error instanceof AmbiguousModifyPositionOutcomeError &&
        error.status === 200
      ),
      label,
    );
  }
});

test('strict acknowledgement parser rejects numeric zero for a clear acknowledgement', () => {
  assert.throws(
    () => parseModifyPositionAck(
      makeAcknowledgement({
        sl: 0,
        price_sl: 0,
        tp: null,
        price_tp: null,
      }),
      {
        ticket: EXPECTED_TICKET,
        symbol: EXPECTED_SYMBOL,
        request: {
          price_sl: 0,
          price_tp: 0,
        },
      },
    ),
    AmbiguousModifyPositionOutcomeError,
  );
});

test('structured modify errors retain unknown future fields and reject malformed envelopes', () => {
  const parsed = parseModifyPositionError({
    error: ' STALE_QUOTE ',
    message: ' Quote is stale. ',
    request_id: 'request-123',
    details: { quote_age_ms: 1500 },
  });
  assert.deepEqual(parsed, {
    error: 'STALE_QUOTE',
    message: 'Quote is stale.',
    request_id: 'request-123',
    details: { quote_age_ms: 1500 },
  });
  assert.equal(Object.isFrozen(parsed), true);

  const unknownCode = parseModifyPositionError({
    error: 'FUTURE_BACKEND_CODE',
    message: 'A future error.',
    retryable: false,
  });
  assert.equal(unknownCode?.error, 'FUTURE_BACKEND_CODE');
  assert.equal(unknownCode?.retryable, false);

  for (const malformed of [
    null,
    [],
    'error',
    {},
    { error: '', message: 'message' },
    { error: 'INVALID_INPUT', message: '' },
    { error: 400, message: 'message' },
    { error: 'INVALID_INPUT', message: 400 },
  ]) {
    assert.equal(parseModifyPositionError(malformed), null);
  }
});

test('reconciliation normalization maps clear values to zero and rejects malformed SL/TP levels', () => {
  assert.equal(normalizeReconciledProtectionValue(1.0825), 1.0825);
  assert.equal(normalizeReconciledProtectionValue(null), 0);
  assert.equal(normalizeReconciledProtectionValue(undefined), 0);
  assert.equal(normalizeReconciledProtectionValue(0), 0);
  for (const malformed of [
    -1,
    '1.0825',
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ]) {
    assert.throws(
      () => normalizeReconciledProtectionValue(malformed),
      AmbiguousModifyPositionOutcomeError,
    );
  }
});
